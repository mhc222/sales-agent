/**
 * Prompt Evolution Service
 *
 * Automatically evolves agent prompts based on validated learnings.
 * Creates A/B tests to validate improvements before full deployment.
 */

import { supabase } from './supabase'
import { getTenantLLM } from './tenant-settings'

// ============================================================================
// TYPES
// ============================================================================

export interface EvolutionResult {
  promptName: string
  previousVersion: number
  newVersion: number
  changesApplied: string[]
  patternsInjected: number
  abTestCreated: boolean
}

interface PatternToInject {
  id: string
  pattern_name: string
  recommendation: string
  observed_lift: number
  sample_size: number
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Evolve prompts based on new learnings
 */
export async function evolvePrompts(tenantId: string): Promise<EvolutionResult[]> {
  const results: EvolutionResult[] = []

  // Get prompts that can be evolved
  const promptsToEvolve = ['agent3-writer', 'agent1-qualification']

  for (const promptName of promptsToEvolve) {
    try {
      const result = await evolvePrompt(tenantId, promptName)
      if (result) {
        results.push(result)
      }
    } catch (err) {
      console.error(`[PromptEvolution] Error evolving ${promptName}:`, err)
    }
  }

  return results
}

/**
 * Evolve a single prompt with new patterns
 */
async function evolvePrompt(tenantId: string, promptName: string): Promise<EvolutionResult | null> {
  console.log(`[PromptEvolution] Checking ${promptName} for evolution...`)

  // 1. Get current active version
  const { data: definition } = await supabase
    .from('prompt_definitions')
    .select(
      `
      *,
      active_version:prompt_versions!active_version_id(*)
    `
    )
    .eq('tenant_id', tenantId)
    .eq('prompt_name', promptName)
    .maybeSingle()

  if (!definition) {
    console.log(`[PromptEvolution] No definition found for ${promptName}`)
    return null
  }

  const currentVersion = definition.active_version as Record<string, unknown> | null
  const currentPatternIds = (currentVersion?.injected_patterns as Array<{ pattern_id: string }> | null)?.map(
    (p) => p.pattern_id
  ) || []

  // 2. Get new validated patterns not yet injected
  const { data: newPatterns } = await supabase
    .from('learned_patterns')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'validated')
    .or('promoted_to_prompt.is.null,promoted_to_prompt.eq.false')

  // Filter out already injected patterns
  const patternsToInject = (newPatterns || []).filter((p) => !currentPatternIds.includes(p.id)) as PatternToInject[]

  if (patternsToInject.length === 0) {
    console.log(`[PromptEvolution] No new patterns to inject for ${promptName}`)
    return null
  }

  console.log(`[PromptEvolution] Found ${patternsToInject.length} new patterns to inject`)

  // 3. Get deprecated patterns to remove
  const { data: deprecatedPatterns } = await supabase
    .from('learned_patterns')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'retired')
    .in('id', currentPatternIds.length > 0 ? currentPatternIds : ['00000000-0000-0000-0000-000000000000'])

  const deprecatedIds = deprecatedPatterns?.map((p) => p.id) || []

  // 4. Generate new prompt version using tenant's LLM
  const currentPrompt = (currentVersion?.full_prompt as string) || definition.base_prompt
  const newPromptContent = await generateEvolvedPrompt(tenantId, currentPrompt, patternsToInject, deprecatedIds)

  // 5. Create new version
  const newVersionNumber = ((currentVersion?.version_number as number) || 0) + 1

  const existingInjected = (currentVersion?.injected_patterns as Array<{ pattern_id: string }> | null) || []
  const injectedPatterns = [
    ...existingInjected.filter((p) => !deprecatedIds.includes(p.pattern_id)),
    ...patternsToInject.map((p) => ({
      pattern_id: p.id,
      pattern_content: p.recommendation,
      injection_point: 'learned_patterns',
      injected_at: new Date().toISOString(),
    })),
  ]

  const { data: newVersion, error: versionError } = await supabase
    .from('prompt_versions')
    .insert({
      prompt_definition_id: definition.id,
      tenant_id: tenantId,
      version_number: newVersionNumber,
      version_label: `v${newVersionNumber}.0-auto`,
      full_prompt: newPromptContent,
      change_description: `Auto-evolved: +${patternsToInject.length} patterns, -${deprecatedIds.length} deprecated`,
      change_type: 'learned_injection',
      injected_patterns: injectedPatterns,
      status: 'testing', // Start in testing, promote after validation
    })
    .select('id')
    .single()

  if (versionError || !newVersion) {
    console.error('[PromptEvolution] Failed to create new version:', versionError)
    return null
  }

  // 6. Mark patterns as promoted to prompt
  await supabase
    .from('learned_patterns')
    .update({
      promoted_to_prompt: true,
      promoted_to_prompt_at: new Date().toISOString(),
      prompt_file: promptName,
    })
    .in(
      'id',
      patternsToInject.map((p) => p.id)
    )

  // 7. Create A/B test: current vs new (only if we have a current version)
  let abTestCreated = false
  if (currentVersion?.id) {
    try {
      await createEvolutionTest(tenantId, definition.id, currentVersion.id as string, newVersion.id)
      abTestCreated = true
    } catch (err) {
      console.error('[PromptEvolution] Failed to create A/B test:', err)
    }
  } else {
    // No current version, just activate the new one
    await supabase.from('prompt_versions').update({ status: 'active', activated_at: new Date().toISOString() }).eq('id', newVersion.id)

    await supabase.from('prompt_definitions').update({ active_version_id: newVersion.id }).eq('id', definition.id)
  }

  console.log(`[PromptEvolution] Created version ${newVersionNumber} for ${promptName}`)

  return {
    promptName,
    previousVersion: (currentVersion?.version_number as number) || 0,
    newVersion: newVersionNumber,
    changesApplied: [
      ...patternsToInject.map((p) => `+Added: ${p.pattern_name}`),
      ...deprecatedIds.map(() => `-Removed deprecated pattern`),
    ],
    patternsInjected: patternsToInject.length,
    abTestCreated,
  }
}

/**
 * Generate evolved prompt using tenant's LLM
 */
async function generateEvolvedPrompt(
  tenantId: string,
  currentPrompt: string,
  newPatterns: PatternToInject[],
  deprecatedPatternIds: string[]
): Promise<string> {
  // If the prompt already has a learned patterns section, we'll update it
  // Otherwise, we'll add one

  const patternsToAdd = newPatterns
    .map((p) => `- ${p.pattern_name}: ${p.recommendation} (${p.observed_lift?.toFixed(1)}x lift, n=${p.sample_size})`)
    .join('\n')

  try {
    // Get tenant's configured LLM
    const llm = await getTenantLLM(tenantId)

    const prompt = `You are updating an AI agent's prompt based on new performance data. Your job is to integrate new validated patterns into the prompt naturally.

## Current Prompt
${currentPrompt.substring(0, 8000)}${currentPrompt.length > 8000 ? '...[truncated]' : ''}

## New Patterns to Integrate
These patterns have been validated by real performance data and should be incorporated:

${patternsToAdd}

## Instructions

1. Look for an existing "Learned Patterns" or "Data-Driven Guidelines" section in the prompt
2. If it exists, add the new patterns to that section
3. If it doesn't exist, create a new section near the end of the guidelines (before output format)
4. Make the patterns actionable and specific
5. Preserve all existing structure and content
6. Keep the same overall format and tone

## Output

Return ONLY the updated prompt text. No explanations, no markdown code blocks wrapping the entire response, just the prompt content.`

    const response = await llm.chat([
      { role: 'user', content: prompt },
    ], { maxTokens: 12000 })

    return response.content
  } catch (err) {
    console.error('[PromptEvolution] Error generating evolved prompt:', err)
    return currentPrompt // Fallback to current
  }
}

/**
 * Create A/B test for evolved prompt
 */
async function createEvolutionTest(
  tenantId: string,
  definitionId: string,
  controlVersionId: string,
  variantVersionId: string
): Promise<void> {
  await supabase.from('prompt_ab_tests').insert({
    tenant_id: tenantId,
    prompt_definition_id: definitionId,
    test_name: `evolution-${Date.now()}`,
    hypothesis: 'New learned patterns will improve reply rates',
    control_version_id: controlVersionId,
    variant_version_ids: [variantVersionId],
    control_percentage: 50,
    variant_percentages: [50],
    min_sample_per_variant: 30,
    max_runtime_days: 14,
    status: 'running',
    started_at: new Date().toISOString(),
  })
}

// ============================================================================
// A/B TEST EVALUATION
// ============================================================================

/**
 * Evaluate and conclude A/B tests
 */
export async function evaluateAbTests(tenantId: string): Promise<number> {
  // Get running tests
  const { data: runningTests } = await supabase
    .from('prompt_ab_tests')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'running')

  if (!runningTests || runningTests.length === 0) {
    return 0
  }

  let completedCount = 0

  for (const test of runningTests) {
    const completed = await evaluateTest(test)
    if (completed) completedCount++
  }

  return completedCount
}

/**
 * Evaluate a single A/B test
 */
async function evaluateTest(test: Record<string, unknown>): Promise<boolean> {
  // Get stats for control
  const { data: controlStats } = await supabase
    .from('prompt_versions')
    .select('total_uses, success_rate, avg_positive_reply_rate')
    .eq('id', test.control_version_id)
    .single()

  // Get stats for variant
  const variantIds = test.variant_version_ids as string[]
  const { data: variantStats } = await supabase
    .from('prompt_versions')
    .select('total_uses, success_rate, avg_positive_reply_rate')
    .eq('id', variantIds[0])
    .single()

  if (!controlStats || !variantStats) return false

  const minSamplePerVariant = (test.min_sample_per_variant as number) || 50

  // Check if we have enough samples
  const hasEnoughSamples =
    (controlStats.total_uses || 0) >= minSamplePerVariant && (variantStats.total_uses || 0) >= minSamplePerVariant

  // Check if test has run too long
  const startDate = new Date(test.started_at as string)
  const daysRunning = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  const maxRuntimeDays = (test.max_runtime_days as number) || 30
  const exceededMaxRuntime = daysRunning > maxRuntimeDays

  if (!hasEnoughSamples && !exceededMaxRuntime) {
    return false // Keep running
  }

  // Determine winner
  let winner: 'control' | 'variant' | 'inconclusive'
  let significance = 0

  const controlRate = parseFloat(controlStats.avg_positive_reply_rate as string) || 0
  const variantRate = parseFloat(variantStats.avg_positive_reply_rate as string) || 0

  if (variantRate > controlRate * 1.1) {
    // 10% improvement threshold
    winner = 'variant'
    significance = controlRate > 0 ? (variantRate - controlRate) / controlRate : 0
  } else if (controlRate > variantRate * 1.1) {
    winner = 'control'
    significance = variantRate > 0 ? (controlRate - variantRate) / variantRate : 0
  } else {
    winner = 'inconclusive'
  }

  // Update test results
  await supabase
    .from('prompt_ab_tests')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      results: {
        control: controlStats,
        variant: variantStats,
        winner,
        improvement: winner === 'variant' ? significance : 0,
      },
      winner_version_id: winner === 'variant' ? variantIds[0] : winner === 'control' ? test.control_version_id : null,
      statistical_significance: significance,
    })
    .eq('id', test.id)

  // Promote winner if clear
  if (winner === 'variant') {
    await promoteVersion(test.prompt_definition_id as string, variantIds[0])
    await deprecateVersion(test.control_version_id as string)
    console.log(`[PromptEvolution] A/B test completed: Variant wins with ${(significance * 100).toFixed(1)}% improvement`)
  } else if (winner === 'control') {
    await deprecateVersion(variantIds[0])
    console.log(`[PromptEvolution] A/B test completed: Control wins, variant deprecated`)
  } else {
    console.log(`[PromptEvolution] A/B test completed: Inconclusive results`)
  }

  return true
}

/**
 * Promote a version to active
 */
async function promoteVersion(definitionId: string, versionId: string): Promise<void> {
  // Deactivate current active
  await supabase
    .from('prompt_versions')
    .update({ status: 'deprecated', deprecated_at: new Date().toISOString() })
    .eq('prompt_definition_id', definitionId)
    .eq('status', 'active')

  // Update version status
  await supabase
    .from('prompt_versions')
    .update({ status: 'active', activated_at: new Date().toISOString() })
    .eq('id', versionId)

  // Update definition active version
  await supabase.from('prompt_definitions').update({ active_version_id: versionId }).eq('id', definitionId)
}

/**
 * Deprecate a version
 */
async function deprecateVersion(versionId: string): Promise<void> {
  await supabase
    .from('prompt_versions')
    .update({ status: 'deprecated', deprecated_at: new Date().toISOString() })
    .eq('id', versionId)
}
