/**
 * Pattern Analyzer
 *
 * Analyzes engagement patterns from the learning system
 * to identify what's working and what should be avoided.
 */

import { supabase } from './supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface PatternCandidate {
  elementCategory: string
  elementType: string
  elementTypeId: string
  sampleSize: number
  replyRate: number
  positiveReplyRate: number
  engagementScore: number
  liftVsBaseline: number
  confidenceScore: number
  personaType?: string
  relationshipType?: string
}

export interface ValidatedPattern {
  patternId: string
  patternName: string
  patternType: string
  description: string
  appliesTo: {
    personas?: string[]
    relationships?: string[]
    positions?: number[]
  }
  recommendation: string
  recommendationType: 'use' | 'avoid' | 'test' | 'conditional'
  observedLift: number
  confidenceScore: number
  sampleSize: number
}

export interface AnalysisResult {
  patternsDiscovered: ValidatedPattern[]
  patternsValidated: ValidatedPattern[]
  patternsToDeprecate: ValidatedPattern[]
  topPerformers: PatternCandidate[]
  bottomPerformers: PatternCandidate[]
  insights: string[]
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_SAMPLE_SIZE_HYPOTHESIS: 10,
  MIN_SAMPLE_SIZE_VALIDATED: 30,
  MIN_SAMPLE_SIZE_PROMOTED: 50,
  MIN_LIFT_FOR_PROMOTION: 1.5, // 1.5x baseline
  MAX_LIFT_FOR_DEPRECATION: 0.7, // 0.7x baseline = underperforming
  MIN_CONFIDENCE_FOR_PROMOTION: 0.7,
  BASELINE_REPLY_RATE: 0.02, // 2% baseline reply rate
  BASELINE_POSITIVE_REPLY_RATE: 0.01, // 1% baseline positive reply rate
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Run pattern analysis for a tenant
 * This is the main entry point - run periodically
 */
export async function analyzePatterns(tenantId: string): Promise<AnalysisResult> {
  const result: AnalysisResult = {
    patternsDiscovered: [],
    patternsValidated: [],
    patternsToDeprecate: [],
    topPerformers: [],
    bottomPerformers: [],
    insights: [],
  }

  console.log(`[PatternAnalyzer] Starting analysis for tenant: ${tenantId}`)

  // 1. Refresh element performance aggregations
  await refreshPerformanceMetrics(tenantId)

  // 2. Get baseline metrics
  const baseline = await getBaselineMetrics(tenantId)

  // 3. Find top performers
  result.topPerformers = await findTopPerformers(tenantId, baseline)

  // 4. Find bottom performers
  result.bottomPerformers = await findBottomPerformers(tenantId, baseline)

  // 5. Discover new pattern candidates
  const candidates = await discoverPatternCandidates(tenantId, baseline)
  for (const candidate of candidates) {
    const pattern = await createPatternHypothesis(tenantId, candidate)
    if (pattern) {
      result.patternsDiscovered.push(pattern)
    }
  }

  // 6. Validate existing hypotheses
  result.patternsValidated = await validateHypotheses(tenantId, baseline)

  // 7. Check for patterns to deprecate
  result.patternsToDeprecate = await findPatternsToDeprecate(tenantId, baseline)

  // 8. Generate insights
  result.insights = generateInsights(result, baseline)

  console.log(`[PatternAnalyzer] Analysis complete:`)
  console.log(`  - Top performers: ${result.topPerformers.length}`)
  console.log(`  - Bottom performers: ${result.bottomPerformers.length}`)
  console.log(`  - Patterns discovered: ${result.patternsDiscovered.length}`)
  console.log(`  - Patterns validated: ${result.patternsValidated.length}`)
  console.log(`  - Patterns to deprecate: ${result.patternsToDeprecate.length}`)

  return result
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

/**
 * Refresh element performance aggregations
 */
async function refreshPerformanceMetrics(tenantId: string): Promise<void> {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    await supabase.rpc('refresh_element_performance', {
      p_tenant_id: tenantId,
      p_period_start: thirtyDaysAgo.toISOString().split('T')[0],
      p_period_end: new Date().toISOString().split('T')[0],
    })
  } catch (err) {
    console.error('[PatternAnalyzer] Error refreshing performance metrics:', err)
  }
}

/**
 * Get baseline metrics for comparison
 */
async function getBaselineMetrics(tenantId: string): Promise<{
  replyRate: number
  positiveReplyRate: number
  totalSent: number
}> {
  const { data } = await supabase
    .from('baseline_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('metric_type', 'overall')
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data) {
    return {
      replyRate: parseFloat(data.reply_rate) || CONFIG.BASELINE_REPLY_RATE,
      positiveReplyRate: parseFloat(data.positive_reply_rate) || CONFIG.BASELINE_POSITIVE_REPLY_RATE,
      totalSent: data.total_sent || 0,
    }
  }

  // Calculate from actual data if no baseline exists
  const { data: stats } = await supabase
    .from('outreach_events')
    .select('id')
    .eq('tenant_id', tenantId)

  const totalSent = stats?.length || 0

  const { data: replies } = await supabase
    .from('engagement_events')
    .select('id, event_type')
    .eq('tenant_id', tenantId)
    .in('event_type', ['reply', 'positive_reply', 'meeting_booked'])

  const replyCount = replies?.filter((r) => r.event_type === 'reply').length || 0
  const positiveCount =
    replies?.filter((r) => ['positive_reply', 'meeting_booked'].includes(r.event_type)).length || 0

  return {
    replyRate: totalSent > 0 ? replyCount / totalSent : CONFIG.BASELINE_REPLY_RATE,
    positiveReplyRate: totalSent > 0 ? positiveCount / totalSent : CONFIG.BASELINE_POSITIVE_REPLY_RATE,
    totalSent,
  }
}

// ============================================================================
// PATTERN DISCOVERY
// ============================================================================

/**
 * Find top performing elements
 */
async function findTopPerformers(
  tenantId: string,
  baseline: { replyRate: number; positiveReplyRate: number }
): Promise<PatternCandidate[]> {
  const { data } = await supabase
    .from('element_performance')
    .select(
      `
      *,
      content_element_types (
        category,
        element_type,
        description
      )
    `
    )
    .eq('tenant_id', tenantId)
    .gte('times_used', CONFIG.MIN_SAMPLE_SIZE_VALIDATED)
    .is('persona_type', null) // Get overall metrics
    .is('relationship_type', null)
    .is('email_position', null)
    .order('engagement_score', { ascending: false })
    .limit(20)

  if (!data) return []

  return data
    .map((row) => mapToPatternCandidate(row, baseline))
    .filter((p) => p.liftVsBaseline >= CONFIG.MIN_LIFT_FOR_PROMOTION)
}

/**
 * Find bottom performing elements
 */
async function findBottomPerformers(
  tenantId: string,
  baseline: { replyRate: number; positiveReplyRate: number }
): Promise<PatternCandidate[]> {
  const { data } = await supabase
    .from('element_performance')
    .select(
      `
      *,
      content_element_types (
        category,
        element_type,
        description
      )
    `
    )
    .eq('tenant_id', tenantId)
    .gte('times_used', CONFIG.MIN_SAMPLE_SIZE_VALIDATED)
    .is('persona_type', null)
    .is('relationship_type', null)
    .is('email_position', null)
    .order('engagement_score', { ascending: true })
    .limit(20)

  if (!data) return []

  return data
    .map((row) => mapToPatternCandidate(row, baseline))
    .filter((p) => p.liftVsBaseline <= CONFIG.MAX_LIFT_FOR_DEPRECATION)
}

/**
 * Discover new pattern candidates worth tracking
 */
async function discoverPatternCandidates(
  tenantId: string,
  baseline: { replyRate: number; positiveReplyRate: number }
): Promise<PatternCandidate[]> {
  const candidates: PatternCandidate[] = []

  // Find high performers not yet tracked as patterns
  const { data: highPerformers } = await supabase
    .from('element_performance')
    .select(
      `
      *,
      content_element_types (
        category,
        element_type,
        description
      )
    `
    )
    .eq('tenant_id', tenantId)
    .gte('times_used', CONFIG.MIN_SAMPLE_SIZE_HYPOTHESIS)
    .is('persona_type', null)
    .is('relationship_type', null)
    .is('email_position', null)
    .order('engagement_score', { ascending: false })

  if (!highPerformers) return candidates

  for (const perf of highPerformers) {
    const candidate = mapToPatternCandidate(perf, baseline)

    // Only consider if it's at least 30% better than baseline
    if (candidate.liftVsBaseline < 1.3) continue

    // Check if pattern already exists
    const { data: existingPattern } = await supabase
      .from('learned_patterns')
      .select('id')
      .eq('tenant_id', tenantId)
      .contains('supporting_element_ids', [perf.element_type_id])
      .maybeSingle()

    if (!existingPattern) {
      candidates.push(candidate)
    }
  }

  return candidates.slice(0, 10) // Limit to 10 new candidates per run
}

// ============================================================================
// PATTERN VALIDATION
// ============================================================================

/**
 * Validate hypotheses that have reached sufficient sample size
 */
async function validateHypotheses(
  tenantId: string,
  baseline: { replyRate: number; positiveReplyRate: number }
): Promise<ValidatedPattern[]> {
  const validated: ValidatedPattern[] = []

  // Get hypothesis patterns
  const { data: hypotheses } = await supabase
    .from('learned_patterns')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'hypothesis')

  if (!hypotheses) return validated

  for (const hypothesis of hypotheses) {
    const elementIds = hypothesis.supporting_element_ids as string[]
    if (!elementIds || elementIds.length === 0) continue

    // Get current performance for this pattern's elements
    const { data: perf } = await supabase
      .from('element_performance')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('element_type_id', elementIds[0])
      .is('persona_type', null)
      .is('relationship_type', null)
      .is('email_position', null)
      .maybeSingle()

    if (!perf) continue

    const replyRate = parseFloat(perf.reply_rate) || 0
    const liftVsBaseline = baseline.replyRate > 0 ? replyRate / baseline.replyRate : 1
    const confidenceScore = parseFloat(perf.confidence_score) || 0

    // Check if it now meets validation criteria
    if (
      perf.times_used >= CONFIG.MIN_SAMPLE_SIZE_VALIDATED &&
      liftVsBaseline >= CONFIG.MIN_LIFT_FOR_PROMOTION &&
      confidenceScore >= CONFIG.MIN_CONFIDENCE_FOR_PROMOTION
    ) {
      // Update status to validated
      await supabase
        .from('learned_patterns')
        .update({
          status: 'validated',
          last_validated_at: new Date().toISOString(),
          sample_size: perf.times_used,
          performance_metrics: {
            ...((hypothesis.performance_metrics as Record<string, unknown>) || {}),
            reply_rate: replyRate,
            lift_vs_baseline: liftVsBaseline,
            confidence_score: confidenceScore,
            validated_at: new Date().toISOString(),
          },
        })
        .eq('id', hypothesis.id)

      validated.push({
        patternId: hypothesis.id,
        patternName: hypothesis.pattern_name,
        patternType: hypothesis.pattern_type,
        description: hypothesis.description,
        appliesTo: {
          personas: hypothesis.applicable_personas as string[],
          relationships: hypothesis.applicable_relationships as string[],
          positions: hypothesis.applicable_positions as number[],
        },
        recommendation: generateRecommendation(liftVsBaseline),
        recommendationType: liftVsBaseline >= 2.0 ? 'use' : 'test',
        observedLift: liftVsBaseline,
        confidenceScore,
        sampleSize: perf.times_used,
      })
    }
  }

  return validated
}

/**
 * Find patterns that are underperforming and should be deprecated
 */
async function findPatternsToDeprecate(
  tenantId: string,
  baseline: { replyRate: number; positiveReplyRate: number }
): Promise<ValidatedPattern[]> {
  const toDeprecate: ValidatedPattern[] = []

  // Get promoted patterns
  const { data: promoted } = await supabase
    .from('learned_patterns')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['validated', 'active'])

  if (!promoted) return toDeprecate

  for (const pattern of promoted) {
    const elementIds = pattern.supporting_element_ids as string[]
    if (!elementIds || elementIds.length === 0) continue

    // Get current performance
    const { data: perf } = await supabase
      .from('element_performance')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('element_type_id', elementIds[0])
      .is('persona_type', null)
      .is('relationship_type', null)
      .is('email_position', null)
      .maybeSingle()

    if (!perf) continue

    const replyRate = parseFloat(perf.reply_rate) || 0
    const liftVsBaseline = baseline.replyRate > 0 ? replyRate / baseline.replyRate : 1

    // Check if it's now underperforming
    if (perf.times_used >= CONFIG.MIN_SAMPLE_SIZE_VALIDATED && liftVsBaseline <= CONFIG.MAX_LIFT_FOR_DEPRECATION) {
      toDeprecate.push({
        patternId: pattern.id,
        patternName: pattern.pattern_name,
        patternType: pattern.pattern_type,
        description: pattern.description,
        appliesTo: {
          personas: pattern.applicable_personas as string[],
          relationships: pattern.applicable_relationships as string[],
          positions: pattern.applicable_positions as number[],
        },
        recommendation: `Avoid - underperforming at ${(liftVsBaseline * 100).toFixed(0)}% of baseline`,
        recommendationType: 'avoid',
        observedLift: liftVsBaseline,
        confidenceScore: parseFloat(perf.confidence_score) || 0,
        sampleSize: perf.times_used,
      })
    }
  }

  return toDeprecate
}

// ============================================================================
// PATTERN CREATION
// ============================================================================

/**
 * Create a new pattern hypothesis from a candidate
 */
async function createPatternHypothesis(
  tenantId: string,
  candidate: PatternCandidate
): Promise<ValidatedPattern | null> {
  const patternName = `${candidate.elementCategory}_${candidate.elementType}_${Date.now()}`
  const description = `Using "${candidate.elementType}" for ${candidate.elementCategory} shows ${candidate.liftVsBaseline.toFixed(1)}x lift vs baseline (n=${candidate.sampleSize}).`

  const { data, error } = await supabase
    .from('learned_patterns')
    .insert({
      tenant_id: tenantId,
      pattern_name: patternName,
      pattern_type: 'element_single',
      description,
      supporting_element_ids: [candidate.elementTypeId],
      sample_size: candidate.sampleSize,
      confidence_score: candidate.confidenceScore,
      performance_metrics: {
        reply_rate: candidate.replyRate,
        positive_reply_rate: candidate.positiveReplyRate,
        engagement_score: candidate.engagementScore,
        lift_vs_baseline: candidate.liftVsBaseline,
        discovered_at: new Date().toISOString(),
      },
      status: 'hypothesis',
      discovered_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[PatternAnalyzer] Error creating pattern hypothesis:', error)
    return null
  }

  return {
    patternId: data.id,
    patternName,
    patternType: 'element_single',
    description,
    appliesTo: {},
    recommendation: generateRecommendation(candidate.liftVsBaseline),
    recommendationType: candidate.liftVsBaseline >= 2.0 ? 'use' : 'test',
    observedLift: candidate.liftVsBaseline,
    confidenceScore: candidate.confidenceScore,
    sampleSize: candidate.sampleSize,
  }
}

// ============================================================================
// INSIGHTS GENERATION
// ============================================================================

/**
 * Generate human-readable insights from analysis
 */
function generateInsights(
  result: AnalysisResult,
  baseline: { replyRate: number; positiveReplyRate: number; totalSent: number }
): string[] {
  const insights: string[] = []

  // Top performer insight
  if (result.topPerformers.length > 0) {
    const top = result.topPerformers[0]
    insights.push(
      `Top performer: "${top.elementType}" (${top.elementCategory}) is generating ${top.liftVsBaseline.toFixed(1)}x the baseline reply rate with ${top.sampleSize} sends.`
    )
  }

  // Bottom performer insight
  if (result.bottomPerformers.length > 0) {
    const bottom = result.bottomPerformers[0]
    insights.push(
      `Underperformer: "${bottom.elementType}" (${bottom.elementCategory}) is only getting ${(bottom.liftVsBaseline * 100).toFixed(0)}% of baseline. Consider avoiding.`
    )
  }

  // Newly validated patterns
  if (result.patternsValidated.length > 0) {
    insights.push(`${result.patternsValidated.length} pattern(s) validated and ready for promotion to prompts.`)
  }

  // Patterns to deprecate
  if (result.patternsToDeprecate.length > 0) {
    insights.push(
      `${result.patternsToDeprecate.length} pattern(s) underperforming and should be removed from guidance.`
    )
  }

  // New discoveries
  if (result.patternsDiscovered.length > 0) {
    insights.push(`${result.patternsDiscovered.length} new pattern hypothesis(es) created for tracking.`)
  }

  // Overall stats
  if (baseline.totalSent > 0) {
    insights.push(
      `Baseline metrics: ${(baseline.replyRate * 100).toFixed(1)}% reply rate, ${(baseline.positiveReplyRate * 100).toFixed(1)}% positive reply rate (n=${baseline.totalSent}).`
    )
  }

  return insights
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map database row to PatternCandidate
 */
function mapToPatternCandidate(
  row: Record<string, unknown>,
  baseline: { replyRate: number; positiveReplyRate: number }
): PatternCandidate {
  const elementType = row.content_element_types as { category: string; element_type: string } | null
  const replyRate = parseFloat(row.reply_rate as string) || 0

  return {
    elementCategory: elementType?.category || 'unknown',
    elementType: elementType?.element_type || 'unknown',
    elementTypeId: row.element_type_id as string,
    sampleSize: (row.times_used as number) || 0,
    replyRate,
    positiveReplyRate: parseFloat(row.positive_reply_rate as string) || 0,
    engagementScore: parseFloat(row.engagement_score as string) || 0,
    liftVsBaseline: baseline.replyRate > 0 ? replyRate / baseline.replyRate : 1,
    confidenceScore: parseFloat(row.confidence_score as string) || 0,
    personaType: row.persona_type as string | undefined,
    relationshipType: row.relationship_type as string | undefined,
  }
}

/**
 * Generate recommendation text based on lift
 */
function generateRecommendation(liftVsBaseline: number): string {
  if (liftVsBaseline >= 2.0) {
    return 'Strongly recommended - significantly outperforms baseline.'
  } else if (liftVsBaseline >= 1.5) {
    return 'Recommended - shows promising results above baseline.'
  } else if (liftVsBaseline >= 1.3) {
    return 'Test further - early positive signal detected.'
  } else {
    return 'Monitor - performance tracking in progress.'
  }
}
