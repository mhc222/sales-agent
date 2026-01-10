/**
 * Workflow 2: Research & Deployment Pipeline
 *
 * WATERFALL APPROACH:
 * 1. Personal LinkedIn posts → analyze → sufficient? stop : continue
 * 2. Company LinkedIn posts → analyze → sufficient? stop : continue
 * 3. Perplexity web search → final fallback
 * 4. Research Analyst synthesis with all gathered data
 */

import { inngest } from './client'
import { supabase, type Lead } from '../src/lib/supabase'
import {
  scrapeLinkedInProfile,
  scrapeLinkedInCompany,
} from '../src/lib/apify'
import {
  searchTriggers,
  searchIntentTriggers,
  searchPerson,
  combineSearchResults,
} from '../src/lib/perplexity'
import { analyzeLinkedInPosts, combineTriggers } from '../src/lib/linkedin-analyzer'
import { researchLead, type ResearchResult } from '../src/agents/agent2-research'

interface ReadyForDeploymentEvent {
  data: {
    lead_id: string
    tenant_id: string
    qualification: {
      decision: string
      reasoning: string
      confidence: number
      icp_fit: string
    }
    visit_count: number
    is_returning_visitor: boolean
  }
}

export const researchPipeline = inngest.createFunction(
  {
    id: 'research-pipeline-v2',
    name: 'Research Pipeline (Waterfall)',
    retries: 2,
  },
  { event: 'lead.ready-for-deployment' },
  async ({ event, step }) => {
    const eventData = event.data as ReadyForDeploymentEvent['data']

    console.log(`[Workflow 2] Starting waterfall research for lead: ${eventData.lead_id}`)

    // Step 1: Fetch the full lead record
    const lead = await step.run('fetch-lead', async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', eventData.lead_id)
        .single()

      if (error || !data) {
        throw new Error(`Lead not found: ${eventData.lead_id}`)
      }

      return data as Lead
    })

    console.log(`[Workflow 2] Researching: ${lead.first_name} ${lead.last_name} at ${lead.company_name}`)

    // Step 2: Check if research already exists
    const existingResearch = await step.run('check-existing-research', async () => {
      const { data } = await supabase
        .from('research_records')
        .select('id, created_at')
        .eq('lead_id', lead.id)
        .maybeSingle()

      return data
    })

    if (existingResearch) {
      console.log(`[Workflow 2] Research already exists, skipping`)
      return {
        status: 'skipped',
        lead_id: lead.id,
        reason: 'Research already exists',
      }
    }

    // Initialize collection variables
    let linkedinProfile: Record<string, unknown> | null = null
    let linkedinCompany: Record<string, unknown> | null = null
    let perplexityResults: { content: string; citations: string[]; query: string } | null = null
    let hasSufficientTriggers = false
    const allAnalyses: Array<{ has_sufficient_triggers: boolean; trigger_count: number; triggers_found: Array<{ type: string; fact: string; recency: 'last_month' | 'last_3_months' | 'last_6_months' | 'last_12_months' | 'older'; relevance_score: number }>; reasoning: string }> = []

    // ========================================
    // WATERFALL STEP 1: Personal LinkedIn
    // ========================================
    if (lead.linkedin_url) {
      linkedinProfile = await step.run('waterfall-1-personal-linkedin', async () => {
        console.log(`[Waterfall] Step 1: Scraping personal LinkedIn...`)
        const profile = await scrapeLinkedInProfile(lead.linkedin_url!)
        return profile as Record<string, unknown> | null
      })

      if (linkedinProfile) {
        const personalAnalysis = await step.run('waterfall-1-analyze', async () => {
          console.log(`[Waterfall] Step 1: Analyzing personal LinkedIn posts...`)
          return await analyzeLinkedInPosts(
            linkedinProfile,
            `${lead.first_name} ${lead.last_name}`,
            lead.company_name,
            false
          )
        })

        allAnalyses.push(personalAnalysis)
        hasSufficientTriggers = personalAnalysis.has_sufficient_triggers

        console.log(`[Waterfall] Step 1 Result: ${personalAnalysis.trigger_count} triggers found, sufficient: ${hasSufficientTriggers}`)
        console.log(`[Waterfall] Reasoning: ${personalAnalysis.reasoning}`)
      } else {
        console.log(`[Waterfall] Step 1: Personal LinkedIn scrape returned no data, moving to next step`)
      }
    } else {
      console.log(`[Waterfall] Step 1: No LinkedIn URL provided, skipping personal profile`)
    }

    // ========================================
    // WATERFALL STEP 2: Company LinkedIn (if needed)
    // ========================================
    if (!hasSufficientTriggers && lead.company_linkedin_url) {
      linkedinCompany = await step.run('waterfall-2-company-linkedin', async () => {
        console.log(`[Waterfall] Step 2: Scraping company LinkedIn...`)
        const company = await scrapeLinkedInCompany(lead.company_linkedin_url!)
        return company as Record<string, unknown> | null
      })

      if (linkedinCompany) {
        const companyAnalysis = await step.run('waterfall-2-analyze', async () => {
          console.log(`[Waterfall] Step 2: Analyzing company LinkedIn posts...`)
          return await analyzeLinkedInPosts(
            linkedinCompany,
            `${lead.first_name} ${lead.last_name}`,
            lead.company_name,
            true
          )
        })

        allAnalyses.push(companyAnalysis)

        // Check combined triggers
        const combinedTriggers = combineTriggers(allAnalyses)
        const highValueTriggers = combinedTriggers.filter(t => t.relevance_score >= 4)
        hasSufficientTriggers = highValueTriggers.length >= 2 || combinedTriggers.length >= 3

        console.log(`[Waterfall] Step 2 Result: ${companyAnalysis.trigger_count} new triggers, total high-value: ${highValueTriggers.length}, sufficient: ${hasSufficientTriggers}`)
      } else {
        console.log(`[Waterfall] Step 2: Company LinkedIn scrape returned no data, moving to next step`)
      }
    } else if (hasSufficientTriggers) {
      console.log(`[Waterfall] Step 2: Skipping company LinkedIn - already have sufficient triggers`)
    } else {
      console.log(`[Waterfall] Step 2: No company LinkedIn URL provided, skipping`)
    }

    // ========================================
    // WATERFALL STEP 3: Perplexity (if needed)
    // ========================================
    if (!hasSufficientTriggers) {
      perplexityResults = await step.run('waterfall-3-perplexity', async () => {
        console.log(`[Waterfall] Step 3: Running Perplexity web search...`)

        // Use intent-specific search for intent data leads
        const isIntentLead = lead.source === 'intent_data'
        console.log(`[Waterfall] Lead source: ${lead.source || 'pixel'}, using ${isIntentLead ? 'intent' : 'standard'} search`)

        const triggerSearch = isIntentLead
          ? await searchIntentTriggers(
              lead.company_name,
              lead.company_domain || undefined,
              lead.company_industry || undefined
            )
          : await searchTriggers(
              lead.company_name,
              lead.company_domain || undefined
            )

        const personSearch = await searchPerson(
          `${lead.first_name} ${lead.last_name}`,
          lead.company_name,
          lead.job_title || undefined
        )

        const { combinedContent, allCitations } = combineSearchResults([
          triggerSearch,
          personSearch,
        ])

        if (!combinedContent) {
          console.log(`[Waterfall] Step 3: No Perplexity results`)
          return null
        }

        return {
          content: combinedContent,
          citations: allCitations,
          query: `${lead.company_name} + ${lead.first_name} ${lead.last_name}`,
        }
      })

      console.log(`[Waterfall] Step 3 Result: Perplexity ${perplexityResults ? 'found data' : 'no data'}`)
    } else {
      console.log(`[Waterfall] Step 3: Skipping Perplexity - already have sufficient triggers`)
    }

    // ========================================
    // DATA COLLECTION SUMMARY
    // ========================================
    console.log(`[Workflow 2] Data collection complete:`)
    console.log(`  - LinkedIn Profile: ${linkedinProfile ? 'Yes' : 'No'}`)
    console.log(`  - LinkedIn Company: ${linkedinCompany ? 'Yes' : 'No'}`)
    console.log(`  - Perplexity: ${perplexityResults ? 'Yes' : 'No'}`)
    console.log(`  - Pre-analyzed triggers: ${allAnalyses.reduce((sum, a) => sum + a.trigger_count, 0)}`)

    // ========================================
    // FINAL SYNTHESIS: Research Analyst
    // ========================================
    const research = await step.run('research-analyst-synthesis', async () => {
      console.log(`[Workflow 2] Running Research Analyst synthesis...`)
      return await researchLead(lead, {
        linkedinProfile,
        linkedinCompany,
        perplexityResults,
      })
    })

    console.log(`[Workflow 2] Research synthesis complete:`)
    console.log(`  - Persona: ${research.persona_match.type} (${research.persona_match.decision_level})`)
    console.log(`  - Triggers: ${research.triggers.length}`)
    console.log(`  - Messaging Angles: ${research.messaging_angles.length}`)

    // ========================================
    // STORE RESULTS
    // ========================================
    await step.run('store-research', async () => {
      // 1. Upsert to research_records (current state snapshot)
      const { error: researchError } = await supabase.from('research_records').upsert(
        {
          lead_id: lead.id,
          perplexity_raw: perplexityResults?.content || null,
          apify_raw: {
            linkedin_personal: linkedinProfile,
            linkedin_company: linkedinCompany,
          },
          extracted_signals: {
            persona_match: research.persona_match,
            triggers: research.triggers,
            messaging_angles: research.messaging_angles,
            company_intel: research.company_intel,
            relationship: research.relationship,
            waterfall_summary: {
              personal_linkedin_used: !!linkedinProfile,
              company_linkedin_used: !!linkedinCompany,
              perplexity_used: !!perplexityResults,
              early_stop: hasSufficientTriggers,
            },
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'lead_id' }
      )

      if (researchError) {
        console.error('[Workflow 2] Error storing research:', researchError)
        throw researchError
      }

      // 2. Append to lead_memories (history log)
      const topTrigger = research.triggers[0]
      const memorySummary = `${research.persona_match.type} (${research.persona_match.decision_level}), ${research.relationship.type}: ${topTrigger?.fact?.substring(0, 100) || 'No triggers'}...`

      const { error: memoryError } = await supabase.from('lead_memories').insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        source: 'agent2_research',
        memory_type: 'research',
        content: {
          persona_match: research.persona_match,
          triggers: research.triggers,
          messaging_angles: research.messaging_angles,
          company_intel: research.company_intel,
          relationship: research.relationship,
          waterfall_summary: {
            personal_linkedin_used: !!linkedinProfile,
            company_linkedin_used: !!linkedinCompany,
            perplexity_used: !!perplexityResults,
            early_stop: hasSufficientTriggers,
          },
        },
        summary: memorySummary,
      })

      if (memoryError) {
        console.error('[Workflow 2] Error storing memory:', memoryError)
        // Don't throw - memory is supplementary, research_records is primary
      }

      console.log('[Workflow 2] Research stored successfully (records + memory)')
    })

    // Update lead status
    await step.run('update-lead-status', async () => {
      await supabase
        .from('leads')
        .update({
          status: 'researched',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
    })

    // Log engagement
    await step.run('log-research-complete', async () => {
      await supabase.from('engagement_log').insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        event_type: 'research.completed',
        metadata: {
          persona_type: research.persona_match.type,
          decision_level: research.persona_match.decision_level,
          trigger_count: research.triggers.length,
          top_trigger: research.triggers[0]?.type || null,
          waterfall_steps_used: [
            linkedinProfile ? 'personal_linkedin' : null,
            linkedinCompany ? 'company_linkedin' : null,
            perplexityResults ? 'perplexity' : null,
          ].filter(Boolean),
        },
      })
    })

    // Emit event for next workflow
    await step.sendEvent('trigger-message-crafting', {
      name: 'lead.research-complete',
      data: {
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        persona_match: research.persona_match,
        top_triggers: research.triggers.slice(0, 3),
        messaging_angles: research.messaging_angles,
        qualification: eventData.qualification,
      },
    })

    console.log(`[Workflow 2] Completed for: ${lead.email}`)

    return {
      status: 'completed',
      lead_id: lead.id,
      persona: research.persona_match.type,
      decision_level: research.persona_match.decision_level,
      trigger_count: research.triggers.length,
      waterfall_steps: {
        personal_linkedin: !!linkedinProfile,
        company_linkedin: !!linkedinCompany,
        perplexity: !!perplexityResults,
        early_stop: hasSufficientTriggers,
      },
    }
  }
)
