/**
 * Prompt Manager
 *
 * Manages dynamic prompt loading with version tracking,
 * A/B test assignment, and learned pattern injection.
 */

import { supabase } from './supabase'
import { loadPrompt as loadPromptFromFile } from './prompt-loader'

// ============================================================================
// TYPES
// ============================================================================

export interface PromptContext {
  industry?: string
  seniority?: string
  triggerType?: string
  channel?: string
  personaType?: string
  relationshipType?: string
  [key: string]: string | undefined
}

export interface LoadedPrompt {
  content: string
  versionId: string
  versionNumber: number
  abTestId: string | null
}

interface DynamicSection {
  sectionName: string
  content: string
  sourcePatternIds: string[]
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Load prompt with dynamic sections and A/B test assignment
 */
export async function loadDynamicPrompt(
  tenantId: string,
  promptName: string,
  variables: Record<string, string> = {},
  context: PromptContext = {}
): Promise<LoadedPrompt> {
  // 1. Try to get prompt from database (with A/B test logic)
  try {
    const { data: dbPrompt } = await supabase
      .rpc('get_active_prompt', {
        p_tenant_id: tenantId,
        p_prompt_name: promptName,
        p_context: context,
      })
      .maybeSingle()

    // Type assertion for RPC return value
    const typedDbPrompt = dbPrompt as {
      version_id: string
      full_prompt: string
      version_number: number
      ab_test_id: string | null
    } | null

    if (typedDbPrompt && typedDbPrompt.full_prompt) {
      // Use database version
      let content = typedDbPrompt.full_prompt

      // Inject dynamic sections
      content = await injectDynamicSections(tenantId, content, context)

      // Replace variables
      content = replaceVariables(content, variables)

      return {
        content,
        versionId: typedDbPrompt.version_id,
        versionNumber: typedDbPrompt.version_number,
        abTestId: typedDbPrompt.ab_test_id,
      }
    }
  } catch (err) {
    console.log(`[PromptManager] No database prompt for ${promptName}, using file`)
  }

  // 2. Fallback to file-based prompt
  const fileContent = loadPromptFromFile(promptName, variables)

  // Still inject dynamic sections from DB
  const contentWithSections = await injectDynamicSections(tenantId, fileContent, context)

  // Create a usage record for file-based prompt
  const versionId = await getOrCreateFileVersion(tenantId, promptName, fileContent)

  return {
    content: contentWithSections,
    versionId,
    versionNumber: 0,
    abTestId: null,
  }
}

/**
 * Record prompt usage for tracking
 */
export async function recordPromptUsage(
  outreachEventId: string,
  versionId: string,
  abTestId: string | null
): Promise<void> {
  try {
    await supabase.from('prompt_usage_log').insert({
      outreach_event_id: outreachEventId,
      prompt_version_id: versionId,
      ab_test_id: abTestId,
    })
  } catch (err) {
    console.error('[PromptManager] Error recording prompt usage:', err)
  }
}

/**
 * Update usage outcomes (call when engagement happens)
 */
export async function updatePromptUsageOutcome(
  outreachEventId: string,
  outcome: {
    hadReply?: boolean
    hadPositiveReply?: boolean
    hadMeeting?: boolean
    hadConversion?: boolean
  }
): Promise<void> {
  try {
    await supabase
      .from('prompt_usage_log')
      .update({
        had_reply: outcome.hadReply,
        had_positive_reply: outcome.hadPositiveReply,
        had_meeting: outcome.hadMeeting,
        had_conversion: outcome.hadConversion,
      })
      .eq('outreach_event_id', outreachEventId)
  } catch (err) {
    console.error('[PromptManager] Error updating prompt usage outcome:', err)
  }
}

/**
 * Refresh prompt version statistics
 */
export async function refreshVersionStats(versionId: string): Promise<void> {
  try {
    await supabase.rpc('update_prompt_version_stats', {
      p_version_id: versionId,
    })
  } catch (err) {
    console.error('[PromptManager] Error refreshing version stats:', err)
  }
}

// ============================================================================
// DYNAMIC SECTION INJECTION
// ============================================================================

/**
 * Inject dynamic sections into prompt
 */
async function injectDynamicSections(
  tenantId: string,
  promptContent: string,
  context: PromptContext
): Promise<string> {
  // Find all {{section:NAME}} placeholders
  const sectionPattern = /\{\{section:(\w+)\}\}/g
  const matches = [...promptContent.matchAll(sectionPattern)]

  let result = promptContent

  // Handle standard {{learnedPatterns}} placeholder
  if (result.includes('{{learnedPatterns}}')) {
    const learnedContent = await getLearnedPatternsSection(tenantId, context)
    result = result.replace(/\{\{learnedPatterns\}\}/g, learnedContent)
  }

  // Handle named sections
  if (matches.length > 0) {
    for (const match of matches) {
      const sectionName = match[1]
      const sectionContent = await getDynamicSection(tenantId, sectionName, context)
      result = result.replace(match[0], sectionContent)
    }
  }

  return result
}

/**
 * Get a specific dynamic section
 */
async function getDynamicSection(
  tenantId: string,
  sectionName: string,
  context: PromptContext
): Promise<string> {
  try {
    const { data: section } = await supabase
      .from('prompt_dynamic_sections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('section_name', sectionName)
      .eq('is_active', true)
      .maybeSingle()

    if (!section) {
      return `[No content for section: ${sectionName}]`
    }

    // Check conditions
    if (section.include_when) {
      const conditions = section.include_when as Record<string, string[]>
      for (const [key, allowedValues] of Object.entries(conditions)) {
        const contextValue = context[key]
        if (contextValue && !allowedValues.includes(contextValue)) {
          return '' // Condition not met, return empty
        }
      }
    }

    return section.content
  } catch (err) {
    console.error(`[PromptManager] Error getting dynamic section ${sectionName}:`, err)
    return ''
  }
}

/**
 * Get learned patterns formatted for injection
 */
async function getLearnedPatternsSection(tenantId: string, context: PromptContext): Promise<string> {
  try {
    // Get promoted patterns from RAG
    const { data: patterns } = await supabase
      .from('rag_documents')
      .select('content, metadata')
      .eq('tenant_id', tenantId)
      .eq('rag_type', 'learned')
      .order('created_at', { ascending: false })
      .limit(15)

    if (!patterns || patterns.length === 0) {
      return 'No validated patterns yet. The system is gathering performance data.'
    }

    // Filter out deprecated and filter by context if applicable
    const relevantPatterns = patterns.filter((p) => {
      const metadata = p.metadata as Record<string, unknown> | null
      if (metadata?.deprecated) return false

      if (!metadata?.applies_when) return true

      // Check if pattern applies to current context
      const appliesWhen = metadata.applies_when as Record<string, string[]>
      for (const [key, values] of Object.entries(appliesWhen)) {
        const contextValue = context[key as keyof PromptContext]
        if (contextValue && Array.isArray(values) && !values.includes(contextValue)) {
          return false
        }
      }
      return true
    })

    if (relevantPatterns.length === 0) {
      return 'No patterns specifically validated for this context yet.'
    }

    const formatted = relevantPatterns
      .map((p, i) => {
        const metadata = p.metadata as Record<string, unknown> | null
        const lift = metadata?.observed_lift as number | undefined
        const liftStr = lift ? ` (${lift.toFixed(1)}x lift)` : ''
        return `${i + 1}. ${p.content}${liftStr}`
      })
      .join('\n\n')

    return `The following patterns have been validated by performance data:\n\n${formatted}`
  } catch (err) {
    console.error('[PromptManager] Error getting learned patterns section:', err)
    return 'Unable to load learned patterns.'
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Replace {{variable}} placeholders
 */
function replaceVariables(content: string, variables: Record<string, string>): string {
  let result = content
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    result = result.replace(pattern, value)
  }
  return result
}

/**
 * Get or create a version record for file-based prompts
 */
async function getOrCreateFileVersion(tenantId: string, promptName: string, content: string): Promise<string> {
  try {
    // Check if definition exists
    let { data: definition } = await supabase
      .from('prompt_definitions')
      .select('id, active_version_id')
      .eq('tenant_id', tenantId)
      .eq('prompt_name', promptName)
      .maybeSingle()

    if (!definition) {
      // Create definition
      const { data: newDef, error: defError } = await supabase
        .from('prompt_definitions')
        .insert({
          tenant_id: tenantId,
          prompt_name: promptName,
          prompt_category: 'agent',
          description: `Auto-created from file: ${promptName}`,
          base_prompt: content,
        })
        .select('id')
        .single()

      if (defError || !newDef) {
        console.error('[PromptManager] Failed to create prompt definition:', defError)
        // Return a placeholder ID
        return `file-${promptName}-${Date.now()}`
      }
      definition = { id: newDef.id, active_version_id: null }
    }

    // Check if active version exists
    if (definition.active_version_id) {
      return definition.active_version_id
    }

    // Create initial version
    const { data: version, error: versionError } = await supabase
      .from('prompt_versions')
      .insert({
        prompt_definition_id: definition.id,
        tenant_id: tenantId,
        version_number: 1,
        version_label: 'v1.0-initial',
        full_prompt: content,
        change_description: 'Initial version from file',
        change_type: 'manual',
        status: 'active',
        activated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (versionError || !version) {
      console.error('[PromptManager] Failed to create prompt version:', versionError)
      return `file-${promptName}-${Date.now()}`
    }

    // Update definition with active version
    await supabase.from('prompt_definitions').update({ active_version_id: version.id }).eq('id', definition.id)

    return version.id
  } catch (err) {
    console.error('[PromptManager] Error in getOrCreateFileVersion:', err)
    return `file-${promptName}-${Date.now()}`
  }
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Create a new prompt version
 */
export async function createPromptVersion(
  tenantId: string,
  promptName: string,
  content: string,
  changeDescription: string,
  changeType: 'manual' | 'learned_injection' | 'ab_test' | 'rollback'
): Promise<string | null> {
  try {
    // Get definition
    const { data: definition } = await supabase
      .from('prompt_definitions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('prompt_name', promptName)
      .single()

    if (!definition) {
      console.error(`[PromptManager] No definition found for ${promptName}`)
      return null
    }

    // Get current max version number
    const { data: maxVersion } = await supabase
      .from('prompt_versions')
      .select('version_number')
      .eq('prompt_definition_id', definition.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single()

    const newVersionNumber = (maxVersion?.version_number || 0) + 1

    // Create new version
    const { data: newVersion, error } = await supabase
      .from('prompt_versions')
      .insert({
        prompt_definition_id: definition.id,
        tenant_id: tenantId,
        version_number: newVersionNumber,
        version_label: `v${newVersionNumber}.0`,
        full_prompt: content,
        change_description: changeDescription,
        change_type: changeType,
        status: 'draft',
      })
      .select('id')
      .single()

    if (error || !newVersion) {
      console.error('[PromptManager] Failed to create version:', error)
      return null
    }

    return newVersion.id
  } catch (err) {
    console.error('[PromptManager] Error creating prompt version:', err)
    return null
  }
}

/**
 * Activate a prompt version
 */
export async function activatePromptVersion(versionId: string): Promise<boolean> {
  try {
    // Get the version's definition
    const { data: version } = await supabase
      .from('prompt_versions')
      .select('prompt_definition_id')
      .eq('id', versionId)
      .single()

    if (!version) return false

    // Deactivate current active version
    await supabase
      .from('prompt_versions')
      .update({ status: 'deprecated', deprecated_at: new Date().toISOString() })
      .eq('prompt_definition_id', version.prompt_definition_id)
      .eq('status', 'active')

    // Activate new version
    await supabase
      .from('prompt_versions')
      .update({ status: 'active', activated_at: new Date().toISOString() })
      .eq('id', versionId)

    // Update definition
    await supabase
      .from('prompt_definitions')
      .update({ active_version_id: versionId })
      .eq('id', version.prompt_definition_id)

    return true
  } catch (err) {
    console.error('[PromptManager] Error activating version:', err)
    return false
  }
}

/**
 * Rollback to a previous version
 */
export async function rollbackPromptVersion(tenantId: string, promptName: string, targetVersionNumber: number): Promise<boolean> {
  try {
    // Get the target version
    const { data: targetVersion } = await supabase
      .from('prompt_versions')
      .select('id, prompt_definition_id')
      .eq('tenant_id', tenantId)
      .eq('version_number', targetVersionNumber)
      .single()

    if (!targetVersion) {
      console.error(`[PromptManager] Version ${targetVersionNumber} not found for ${promptName}`)
      return false
    }

    // Activate the target version
    return await activatePromptVersion(targetVersion.id)
  } catch (err) {
    console.error('[PromptManager] Error rolling back:', err)
    return false
  }
}
