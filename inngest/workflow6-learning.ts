/**
 * Workflow 6: Learning Analysis
 *
 * Runs periodic analysis of email engagement patterns,
 * validates hypotheses, promotes successful patterns to RAG,
 * and deprecates underperformers.
 */

import { inngest } from './client'
import { supabase } from '../src/lib/supabase'
import { analyzePatterns } from '../src/lib/pattern-analyzer'
import { promoteValidatedPatterns, deprecateUnderperformers } from '../src/lib/pattern-promoter'
import { evolvePrompts, evaluateAbTests } from '../src/lib/prompt-evolution'

interface LearningAnalysisResult {
  tenant: string
  tenantId: string
  patternsDiscovered: number
  patternsValidated: number
  patternsPromoted: number
  patternsDeprecated: number
  promptsEvolved: number
  abTestsEvaluated: number
  insights: string[]
  topPerformer: {
    elementType: string
    elementCategory: string
    liftVsBaseline: number
    sampleSize: number
  } | null
}

/**
 * Scheduled learning analysis - runs daily
 */
export const learningAnalysis = inngest.createFunction(
  {
    id: 'learning-analysis-v1',
    name: 'Daily Learning Analysis',
    retries: 1,
    concurrency: { limit: 1 }, // Only one analysis at a time
  },
  { cron: '0 6 * * *' }, // Run daily at 6 AM UTC
  async ({ step }) => {
    console.log('[Workflow 6] Starting daily learning analysis')

    // Get all active tenants
    const tenants = await step.run('get-tenants', async () => {
      const { data } = await supabase.from('tenants').select('id, name').eq('active', true)
      return data || []
    })

    if (tenants.length === 0) {
      console.log('[Workflow 6] No active tenants found')
      return { success: false, error: 'No tenants found' }
    }

    const results: LearningAnalysisResult[] = []

    for (const tenant of tenants) {
      // Step 1: Analyze patterns for this tenant
      const analysis = await step.run(`analyze-${tenant.id}`, async () => {
        console.log(`[Workflow 6] Analyzing patterns for tenant: ${tenant.name}`)
        return await analyzePatterns(tenant.id)
      })

      // Step 2: Promote validated patterns to RAG
      const promotions = await step.run(`promote-${tenant.id}`, async () => {
        console.log(`[Workflow 6] Promoting validated patterns for tenant: ${tenant.name}`)
        return await promoteValidatedPatterns(tenant.id)
      })

      // Step 3: Deprecate underperformers
      const deprecations = await step.run(`deprecate-${tenant.id}`, async () => {
        console.log(`[Workflow 6] Deprecating underperformers for tenant: ${tenant.name}`)
        return await deprecateUnderperformers(tenant.id)
      })

      // Step 4: Update baseline metrics
      await step.run(`baseline-${tenant.id}`, async () => {
        console.log(`[Workflow 6] Updating baseline metrics for tenant: ${tenant.name}`)
        await updateBaselineMetrics(tenant.id)
      })

      // Step 5: Evolve prompts with new patterns
      const evolution = await step.run(`evolve-prompts-${tenant.id}`, async () => {
        console.log(`[Workflow 6] Evolving prompts for tenant: ${tenant.name}`)
        return await evolvePrompts(tenant.id)
      })

      // Step 6: Evaluate running A/B tests
      const abTestsCompleted = await step.run(`evaluate-ab-tests-${tenant.id}`, async () => {
        console.log(`[Workflow 6] Evaluating A/B tests for tenant: ${tenant.name}`)
        return await evaluateAbTests(tenant.id)
      })

      results.push({
        tenant: tenant.name,
        tenantId: tenant.id,
        patternsDiscovered: analysis.patternsDiscovered.length,
        patternsValidated: analysis.patternsValidated.length,
        patternsPromoted: promotions.filter((p) => p.promotedToRag).length,
        patternsDeprecated: deprecations.filter((d) => d.deprecated).length,
        promptsEvolved: evolution.length,
        abTestsEvaluated: abTestsCompleted,
        insights: analysis.insights,
        topPerformer: analysis.topPerformers[0]
          ? {
              elementType: analysis.topPerformers[0].elementType,
              elementCategory: analysis.topPerformers[0].elementCategory,
              liftVsBaseline: analysis.topPerformers[0].liftVsBaseline,
              sampleSize: analysis.topPerformers[0].sampleSize,
            }
          : null,
      })
    }

    // Step 7: Log summary
    await step.run('log-summary', async () => {
      console.log('[Workflow 6] Learning Analysis Complete:')
      for (const result of results) {
        console.log(`  ${result.tenant}:`)
        console.log(`    - Patterns discovered: ${result.patternsDiscovered}`)
        console.log(`    - Patterns validated: ${result.patternsValidated}`)
        console.log(`    - Patterns promoted: ${result.patternsPromoted}`)
        console.log(`    - Patterns deprecated: ${result.patternsDeprecated}`)
        console.log(`    - Prompts evolved: ${result.promptsEvolved}`)
        console.log(`    - A/B tests evaluated: ${result.abTestsEvaluated}`)
        if (result.topPerformer) {
          console.log(
            `    - Top performer: ${result.topPerformer.elementType} (${result.topPerformer.liftVsBaseline.toFixed(1)}x lift)`
          )
        }
      }

      // Store summary in engagement log
      await supabase.from('engagement_log').insert({
        tenant_id: tenants[0]?.id, // Use first tenant for logging
        event_type: 'learning.analysis_complete',
        metadata: {
          results_summary: results.map((r) => ({
            tenant: r.tenant,
            discovered: r.patternsDiscovered,
            validated: r.patternsValidated,
            promoted: r.patternsPromoted,
            deprecated: r.patternsDeprecated,
          })),
          timestamp: new Date().toISOString(),
        },
      })
    })

    console.log('[Workflow 6] Daily learning analysis complete')

    return { success: true, results }
  }
)

/**
 * Manual/on-demand learning analysis
 */
export const manualLearningAnalysis = inngest.createFunction(
  {
    id: 'manual-learning-analysis-v1',
    name: 'Manual Learning Analysis',
    retries: 1,
  },
  { event: 'learning.analyze-requested' },
  async ({ event, step }) => {
    const { tenant_id } = event.data as { tenant_id: string }

    console.log(`[Workflow 6] Manual learning analysis requested for tenant: ${tenant_id}`)

    // Get tenant name
    const tenant = await step.run('get-tenant', async () => {
      const { data } = await supabase.from('tenants').select('name').eq('id', tenant_id).single()
      return data
    })

    // Step 1: Analyze patterns
    const analysis = await step.run('analyze', async () => {
      console.log('[Workflow 6] Analyzing patterns...')
      return await analyzePatterns(tenant_id)
    })

    // Step 2: Promote validated patterns
    const promotions = await step.run('promote', async () => {
      console.log('[Workflow 6] Promoting validated patterns...')
      return await promoteValidatedPatterns(tenant_id)
    })

    // Step 3: Deprecate underperformers
    const deprecations = await step.run('deprecate', async () => {
      console.log('[Workflow 6] Deprecating underperformers...')
      return await deprecateUnderperformers(tenant_id)
    })

    // Step 4: Update baseline
    await step.run('update-baseline', async () => {
      console.log('[Workflow 6] Updating baseline metrics...')
      await updateBaselineMetrics(tenant_id)
    })

    // Step 5: Evolve prompts with new patterns
    const evolution = await step.run('evolve-prompts', async () => {
      console.log('[Workflow 6] Evolving prompts...')
      return await evolvePrompts(tenant_id)
    })

    // Step 6: Evaluate running A/B tests
    const abTestsCompleted = await step.run('evaluate-ab-tests', async () => {
      console.log('[Workflow 6] Evaluating A/B tests...')
      return await evaluateAbTests(tenant_id)
    })

    const result = {
      success: true,
      tenant: tenant?.name || tenant_id,
      analysis: {
        patternsDiscovered: analysis.patternsDiscovered.length,
        patternsValidated: analysis.patternsValidated.length,
        topPerformers: analysis.topPerformers.slice(0, 5),
        bottomPerformers: analysis.bottomPerformers.slice(0, 5),
        insights: analysis.insights,
      },
      promotions: {
        count: promotions.filter((p) => p.promotedToRag).length,
        patterns: promotions.map((p) => ({
          name: p.patternName,
          promoted: p.promotedToRag,
          error: p.error,
        })),
      },
      deprecations: {
        count: deprecations.filter((d) => d.deprecated).length,
        patterns: deprecations.map((d) => ({
          name: d.patternName,
          deprecated: d.deprecated,
          error: d.error,
        })),
      },
      promptEvolution: {
        count: evolution.length,
        evolved: evolution.map((e) => ({
          prompt: e.promptName,
          previousVersion: e.previousVersion,
          newVersion: e.newVersion,
          changesApplied: e.changesApplied,
          abTestCreated: e.abTestCreated,
        })),
      },
      abTests: {
        evaluated: abTestsCompleted,
      },
    }

    console.log('[Workflow 6] Manual analysis complete:', JSON.stringify(result, null, 2))

    return result
  }
)

/**
 * Update baseline metrics for a tenant
 */
async function updateBaselineMetrics(tenantId: string): Promise<void> {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Get outreach stats for the period
  const { data: outreachEvents } = await supabase
    .from('outreach_events')
    .select('id')
    .eq('tenant_id', tenantId)
    .gte('sent_at', thirtyDaysAgo.toISOString())

  if (!outreachEvents || outreachEvents.length === 0) {
    console.log('[Workflow 6] No outreach events in period for baseline calculation')
    return
  }

  const totalSent = outreachEvents.length
  const outreachIds = outreachEvents.map((e) => e.id)

  // Get engagement stats
  const { data: engagementEvents } = await supabase
    .from('engagement_events')
    .select('event_type')
    .eq('tenant_id', tenantId)
    .in('outreach_event_id', outreachIds)

  const openCount = engagementEvents?.filter((e) => e.event_type === 'open').length || 0
  const replyCount = engagementEvents?.filter((e) => e.event_type === 'reply').length || 0
  const positiveCount =
    engagementEvents?.filter((e) => ['positive_reply', 'meeting_booked'].includes(e.event_type)).length || 0
  const bounceCount = engagementEvents?.filter((e) => e.event_type === 'bounce').length || 0
  const unsubscribeCount = engagementEvents?.filter((e) => e.event_type === 'unsubscribe').length || 0

  // Upsert baseline metrics
  await supabase.from('baseline_metrics').upsert(
    {
      tenant_id: tenantId,
      metric_type: 'overall',
      scope_value: null,
      period_start: thirtyDaysAgo.toISOString().split('T')[0],
      period_end: now.toISOString().split('T')[0],
      total_sent: totalSent,
      open_rate: totalSent > 0 ? openCount / totalSent : 0,
      reply_rate: totalSent > 0 ? replyCount / totalSent : 0,
      positive_reply_rate: totalSent > 0 ? positiveCount / totalSent : 0,
      bounce_rate: totalSent > 0 ? bounceCount / totalSent : 0,
      unsubscribe_rate: totalSent > 0 ? unsubscribeCount / totalSent : 0,
      updated_at: now.toISOString(),
    },
    {
      onConflict: 'tenant_id,metric_type,scope_value,period_start,period_end',
    }
  )

  console.log(
    `[Workflow 6] Baseline updated: ${totalSent} sent, ${((replyCount / totalSent) * 100).toFixed(1)}% reply rate`
  )
}
