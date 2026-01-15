/**
 * Pattern Promoter
 *
 * Promotes validated patterns to RAG documents and deprecates
 * underperforming patterns.
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface PromotionResult {
  patternId: string
  patternName: string
  promotedToRag: boolean
  ragDocumentId?: string
  ragContent?: string
  error?: string
}

export interface DeprecationResult {
  patternId: string
  patternName: string
  deprecated: boolean
  ragDocumentUpdated: boolean
  error?: string
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_SAMPLE_SIZE_FOR_PROMOTION: 50,
  MIN_CONFIDENCE_FOR_PROMOTION: 0.7,
  MIN_LIFT_FOR_PROMOTION: 1.5,
}

// ============================================================================
// PROMOTION
// ============================================================================

/**
 * Promote all validated patterns that meet promotion criteria
 */
export async function promoteValidatedPatterns(tenantId: string): Promise<PromotionResult[]> {
  const results: PromotionResult[] = []

  // Get validated patterns ready for promotion
  const { data: patterns } = await supabase
    .from('learned_patterns')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'validated')
    .gte('sample_size', CONFIG.MIN_SAMPLE_SIZE_FOR_PROMOTION)
    .gte('confidence_score', CONFIG.MIN_CONFIDENCE_FOR_PROMOTION)

  if (!patterns || patterns.length === 0) {
    console.log('[PatternPromoter] No patterns ready for promotion')
    return results
  }

  console.log(`[PatternPromoter] Found ${patterns.length} pattern(s) ready for promotion`)

  for (const pattern of patterns) {
    // Check if lift is still above threshold
    const metrics = pattern.performance_metrics as Record<string, unknown> | null
    const lift = (metrics?.lift_vs_baseline as number) || 0

    if (lift < CONFIG.MIN_LIFT_FOR_PROMOTION) {
      console.log(`[PatternPromoter] Skipping ${pattern.pattern_name} - lift ${lift} below threshold`)
      continue
    }

    const result = await promotePattern(tenantId, pattern)
    results.push(result)
  }

  return results
}

/**
 * Promote a single pattern to RAG
 */
async function promotePattern(tenantId: string, pattern: Record<string, unknown>): Promise<PromotionResult> {
  const result: PromotionResult = {
    patternId: pattern.id as string,
    patternName: pattern.pattern_name as string,
    promotedToRag: false,
  }

  try {
    // 1. Generate RAG document content using Claude
    const ragContent = await generateRagContent(pattern)
    result.ragContent = ragContent

    // 2. Check if RAG document already exists for this pattern
    const { data: existingDoc } = await supabase
      .from('rag_documents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('rag_type', 'learned')
      .contains('metadata', { pattern_id: pattern.id })
      .maybeSingle()

    let ragDocId: string | undefined

    if (existingDoc) {
      // Update existing document
      const { error: updateError } = await supabase
        .from('rag_documents')
        .update({
          content: ragContent,
          metadata: {
            source: 'learning_system',
            pattern_id: pattern.id,
            pattern_type: pattern.pattern_type,
            observed_lift: (pattern.performance_metrics as Record<string, unknown>)?.lift_vs_baseline,
            sample_size: pattern.sample_size,
            updated_at: new Date().toISOString(),
          },
        })
        .eq('id', existingDoc.id)

      if (updateError) {
        result.error = `Failed to update RAG document: ${updateError.message}`
        return result
      }

      ragDocId = existingDoc.id
    } else {
      // Insert new RAG document
      const { data: ragDoc, error: ragError } = await supabase
        .from('rag_documents')
        .insert({
          tenant_id: tenantId,
          rag_type: 'learned',
          content: ragContent,
          metadata: {
            source: 'learning_system',
            pattern_id: pattern.id,
            pattern_type: pattern.pattern_type,
            observed_lift: (pattern.performance_metrics as Record<string, unknown>)?.lift_vs_baseline,
            sample_size: pattern.sample_size,
            promoted_at: new Date().toISOString(),
          },
        })
        .select('id')
        .single()

      if (ragError || !ragDoc) {
        result.error = `Failed to create RAG document: ${ragError?.message}`
        return result
      }

      ragDocId = ragDoc.id
    }

    result.ragDocumentId = ragDocId
    result.promotedToRag = true

    // 3. Update pattern record to mark as promoted
    await supabase
      .from('learned_patterns')
      .update({
        status: 'active',
        last_validated_at: new Date().toISOString(),
        performance_metrics: {
          ...((pattern.performance_metrics as Record<string, unknown>) || {}),
          promoted_to_rag_at: new Date().toISOString(),
          rag_document_id: ragDocId,
        },
      })
      .eq('id', pattern.id)

    console.log(`[PatternPromoter] Promoted pattern: ${pattern.pattern_name}`)
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[PatternPromoter] Error promoting pattern ${pattern.pattern_name}:`, err)
  }

  return result
}

/**
 * Generate RAG content for a pattern using Claude
 */
async function generateRagContent(pattern: Record<string, unknown>): Promise<string> {
  const metrics = pattern.performance_metrics as Record<string, unknown> | null

  try {
    const anthropic = new Anthropic()

    const prompt = `You are creating a RAG document entry for JSB Media's email writing system. Based on the following learned pattern, write a concise, actionable guideline that can be used by the email writing agent.

Pattern Data:
- Name: ${pattern.pattern_name}
- Type: ${pattern.pattern_type}
- Description: ${pattern.description}
- Observed Lift: ${metrics?.lift_vs_baseline ? (metrics.lift_vs_baseline as number).toFixed(2) : 'N/A'}x vs baseline
- Reply Rate: ${metrics?.reply_rate ? ((metrics.reply_rate as number) * 100).toFixed(1) : 'N/A'}%
- Sample Size: ${pattern.sample_size}
- Confidence Score: ${pattern.confidence_score ? ((pattern.confidence_score as number) * 100).toFixed(0) : 'N/A'}%

Write a RAG document entry that:
1. States the finding clearly in one sentence
2. Explains when to apply it (conditions)
3. Gives a specific example of good usage
4. Notes any caveats or limitations

Format as plain text, no headers, 3-5 sentences max. Be direct and actionable.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      return generateFallbackRagContent(pattern)
    }

    return content.text
  } catch (err) {
    console.error('[PatternPromoter] Error generating RAG content with Claude:', err)
    return generateFallbackRagContent(pattern)
  }
}

/**
 * Generate fallback RAG content without Claude
 */
function generateFallbackRagContent(pattern: Record<string, unknown>): string {
  const metrics = pattern.performance_metrics as Record<string, unknown> | null
  const lift = metrics?.lift_vs_baseline as number | undefined

  return `LEARNED PATTERN: ${pattern.description || pattern.pattern_name}. This approach has been validated with ${pattern.sample_size} emails and shows ${lift ? `${lift.toFixed(1)}x` : 'improved'} performance vs baseline. Apply when writing emails for similar prospects. Confidence: ${pattern.confidence_score ? ((pattern.confidence_score as number) * 100).toFixed(0) : 'N/A'}%.`
}

// ============================================================================
// DEPRECATION
// ============================================================================

/**
 * Deprecate underperforming patterns
 */
export async function deprecateUnderperformers(tenantId: string): Promise<DeprecationResult[]> {
  const results: DeprecationResult[] = []

  // Get patterns that should be deprecated based on analysis
  // (patterns with status 'active' but lift below 0.7)
  const { data: patterns } = await supabase
    .from('learned_patterns')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['validated', 'active'])

  if (!patterns || patterns.length === 0) {
    return results
  }

  for (const pattern of patterns) {
    const metrics = pattern.performance_metrics as Record<string, unknown> | null
    const lift = (metrics?.lift_vs_baseline as number) || 1

    // Check if it's now underperforming
    if (lift > 0.7) continue

    const result = await deprecatePattern(tenantId, pattern)
    results.push(result)
  }

  return results
}

/**
 * Deprecate a single pattern
 */
async function deprecatePattern(tenantId: string, pattern: Record<string, unknown>): Promise<DeprecationResult> {
  const result: DeprecationResult = {
    patternId: pattern.id as string,
    patternName: pattern.pattern_name as string,
    deprecated: false,
    ragDocumentUpdated: false,
  }

  try {
    // Update pattern status
    await supabase
      .from('learned_patterns')
      .update({
        status: 'retired',
        performance_metrics: {
          ...((pattern.performance_metrics as Record<string, unknown>) || {}),
          deprecated_at: new Date().toISOString(),
          deprecation_reason: 'Performance fell below threshold',
        },
      })
      .eq('id', pattern.id)

    result.deprecated = true

    // Update associated RAG document if exists
    const { data: ragDoc } = await supabase
      .from('rag_documents')
      .select('id, metadata')
      .eq('tenant_id', tenantId)
      .eq('rag_type', 'learned')
      .contains('metadata', { pattern_id: pattern.id })
      .maybeSingle()

    if (ragDoc) {
      await supabase
        .from('rag_documents')
        .update({
          metadata: {
            ...((ragDoc.metadata as Record<string, unknown>) || {}),
            deprecated: true,
            deprecated_at: new Date().toISOString(),
          },
        })
        .eq('id', ragDoc.id)

      result.ragDocumentUpdated = true
    }

    console.log(`[PatternPromoter] Deprecated pattern: ${pattern.pattern_name}`)
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[PatternPromoter] Error deprecating pattern ${pattern.pattern_name}:`, err)
  }

  return result
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get all active learned patterns for a tenant (for use in prompts)
 */
export async function getActiveLearnedPatterns(tenantId: string): Promise<string[]> {
  const { data: ragDocs } = await supabase
    .from('rag_documents')
    .select('content, metadata')
    .eq('tenant_id', tenantId)
    .eq('rag_type', 'learned')
    .order('created_at', { ascending: false })

  if (!ragDocs) return []

  // Filter out deprecated patterns
  return ragDocs
    .filter((doc) => {
      const metadata = doc.metadata as Record<string, unknown> | null
      return !metadata?.deprecated
    })
    .map((doc) => doc.content)
}

/**
 * Get learned guidelines formatted for prompt injection
 */
export async function getLearnedGuidelines(tenantId: string): Promise<string> {
  const patterns = await getActiveLearnedPatterns(tenantId)

  if (patterns.length === 0) {
    return 'No learned patterns yet - system is still gathering data.'
  }

  return patterns.map((content, i) => `${i + 1}. ${content}`).join('\n\n')
}
