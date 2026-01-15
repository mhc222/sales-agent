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
// Enhanced research modules
import { researchCompany, type PerplexityResearch } from '../src/lib/perplexity'
import {
  analyzeLinkedInPostsEnhanced,
  type EnhancedLinkedInAnalysis,
  type PainSignal,
  type ConversationHook,
} from '../src/lib/linkedin-analyzer'
import { scoreIntent, type EnhancedIntentScore, type IntentData } from '../src/lib/intent-scorer'
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

    // Initialize collection variables (enhanced)
    let linkedinProfile: Record<string, unknown> | null = null
    let linkedinCompany: Record<string, unknown> | null = null
    let personalLinkedInAnalysis: EnhancedLinkedInAnalysis | null = null
    let companyLinkedInAnalysis: EnhancedLinkedInAnalysis | null = null
    let perplexityResearch: PerplexityResearch | null = null
    let hasSufficientTriggers = false

    // ========================================
    // STEP 0: Score Intent (free, local computation)
    // ========================================
    const intentScore = await step.run('score-intent', async () => {
      // Build intent data from lead's visit history
      const intentSignal = (lead.intent_signal || {}) as Record<string, unknown>
      const pagesVisited = (intentSignal.pages_visited || []) as Array<{ page: string; url?: string }>

      const intentData: IntentData = {
        companyDomain: lead.company_domain || '',
        companyName: lead.company_name,
        pageViews: pagesVisited.map((p) => ({
          page: typeof p === 'string' ? p : p.page || p.url || '',
          url: typeof p === 'object' ? p.url : undefined,
        })),
        totalVisits: lead.visit_count || 1,
        firstSeen: lead.first_seen_at || undefined,
        lastSeen: lead.last_seen_at || undefined,
        industry: lead.company_industry || undefined,
      }

      const scored = scoreIntent(intentData)

      console.log(`[Intent] ${lead.email}: Score ${scored.score} (${scored.tier})`)
      console.log(`  - Top pages: ${scored.topPages.slice(0, 3).join(', ') || 'none'}`)
      console.log(`  - Matched sequences: ${scored.matchedSequences.join(', ') || 'none'}`)
      console.log(`  - Urgency: ${scored.urgency}`)

      return scored
    })

    // ========================================
    // WATERFALL STEP 1: Personal LinkedIn (Enhanced)
    // ========================================
    if (lead.linkedin_url) {
      linkedinProfile = await step.run('waterfall-1-personal-linkedin', async () => {
        console.log(`[Waterfall] Step 1: Scraping personal LinkedIn...`)
        const profile = await scrapeLinkedInProfile(lead.linkedin_url!)
        return profile as Record<string, unknown> | null
      })

      if (linkedinProfile) {
        personalLinkedInAnalysis = await step.run('waterfall-1-analyze-enhanced', async () => {
          console.log(`[Waterfall] Step 1: Analyzing personal LinkedIn posts (enhanced)...`)

          // Extract posts array from profile data
          const posts = (linkedinProfile?.posts || []) as Array<{
            text: string
            date?: string
            likes?: number
            comments?: number
          }>

          if (posts.length === 0) {
            console.log(`[Waterfall] Step 1: No posts found in profile data`)
            return null
          }

          return analyzeLinkedInPostsEnhanced(posts)
        })

        if (personalLinkedInAnalysis) {
          // Enhanced sufficiency check - pain signals are gold
          hasSufficientTriggers =
            personalLinkedInAnalysis.hasPainSignals ||
            (personalLinkedInAnalysis.recentTopics.length >= 2 && personalLinkedInAnalysis.isActiveUser) ||
            personalLinkedInAnalysis.conversationHooks.length >= 2

          console.log(`[Waterfall] Step 1 Result:`)
          console.log(`  - Pain signals: ${personalLinkedInAnalysis.painIndicators.length} (sufficient: ${personalLinkedInAnalysis.hasPainSignals})`)
          console.log(`  - Tone: ${personalLinkedInAnalysis.tone.primary}`)
          console.log(`  - Conversation hooks: ${personalLinkedInAnalysis.conversationHooks.length}`)
          console.log(`  - Sufficient triggers: ${hasSufficientTriggers}`)
        } else {
          console.log(`[Waterfall] Step 1: Enhanced analysis returned null`)
        }
      } else {
        console.log(`[Waterfall] Step 1: Personal LinkedIn scrape returned no data, moving to next step`)
      }
    } else {
      console.log(`[Waterfall] Step 1: No LinkedIn URL provided, skipping personal profile`)
    }

    // ========================================
    // WATERFALL STEP 2: Company LinkedIn (if needed, Enhanced)
    // ========================================
    if (!hasSufficientTriggers && lead.company_linkedin_url) {
      linkedinCompany = await step.run('waterfall-2-company-linkedin', async () => {
        console.log(`[Waterfall] Step 2: Scraping company LinkedIn...`)
        const company = await scrapeLinkedInCompany(lead.company_linkedin_url!)
        return company as Record<string, unknown> | null
      })

      if (linkedinCompany) {
        companyLinkedInAnalysis = await step.run('waterfall-2-analyze-enhanced', async () => {
          console.log(`[Waterfall] Step 2: Analyzing company LinkedIn posts (enhanced)...`)

          // Extract posts array from company data
          const posts = (linkedinCompany?.posts || []) as Array<{
            text: string
            date?: string
            likes?: number
            comments?: number
          }>

          if (posts.length === 0) {
            console.log(`[Waterfall] Step 2: No posts found in company data`)
            return null
          }

          return analyzeLinkedInPostsEnhanced(posts)
        })

        if (companyLinkedInAnalysis) {
          // Check combined pain signals from both personal and company
          const totalPainSignals =
            (personalLinkedInAnalysis?.painIndicators.length || 0) +
            (companyLinkedInAnalysis?.painIndicators.length || 0)
          const totalHooks =
            (personalLinkedInAnalysis?.conversationHooks.length || 0) +
            (companyLinkedInAnalysis?.conversationHooks.length || 0)

          hasSufficientTriggers =
            totalPainSignals >= 1 || // Any pain signal is valuable
            totalHooks >= 2 ||
            companyLinkedInAnalysis.hasPainSignals

          console.log(`[Waterfall] Step 2 Result:`)
          console.log(`  - Company pain signals: ${companyLinkedInAnalysis.painIndicators.length}`)
          console.log(`  - Total pain signals: ${totalPainSignals}`)
          console.log(`  - Total hooks: ${totalHooks}`)
          console.log(`  - Sufficient triggers: ${hasSufficientTriggers}`)
        } else {
          console.log(`[Waterfall] Step 2: Enhanced analysis returned null`)
        }
      } else {
        console.log(`[Waterfall] Step 2: Company LinkedIn scrape returned no data, moving to next step`)
      }
    } else if (hasSufficientTriggers) {
      console.log(`[Waterfall] Step 2: Skipping company LinkedIn - already have sufficient triggers`)
    } else {
      console.log(`[Waterfall] Step 2: No company LinkedIn URL provided, skipping`)
    }

    // ========================================
    // WATERFALL STEP 3: Perplexity (if needed, Enhanced with 4 parallel queries)
    // ========================================
    if (!hasSufficientTriggers) {
      perplexityResearch = await step.run('waterfall-3-perplexity-enhanced', async () => {
        console.log(`[Waterfall] Step 3: Running enhanced Perplexity research (4 parallel queries)...`)

        const research = await researchCompany(
          lead.company_name,
          `${lead.first_name} ${lead.last_name}`,
          lead.company_domain || undefined,
          lead.company_industry || undefined
        )

        console.log(`[Perplexity] ${lead.company_name}:`)
        console.log(`  - Funding: ${research.funding.recency} (${research.triggers.recentFunding ? 'TRIGGER' : 'no trigger'})`)
        console.log(`  - Hiring: ${research.hiring.recency} (${research.triggers.activelyHiring ? 'TRIGGER' : 'no trigger'})`)
        console.log(`  - Pain signals: ${research.pain.keyFindings.length} findings`)
        console.log(`  - Person visibility: ${research.personVisibility.recency} (${research.triggers.personInNews ? 'TRIGGER' : 'no trigger'})`)

        return research
      })

      console.log(`[Waterfall] Step 3 Result: Perplexity research complete`)
    } else {
      console.log(`[Waterfall] Step 3: Skipping Perplexity - already have sufficient triggers`)
    }

    // ========================================
    // BUILD ENHANCED RESEARCH CONTEXT
    // ========================================
    // Combine all pain signals from LinkedIn
    const allPainSignals: PainSignal[] = [
      ...(personalLinkedInAnalysis?.painIndicators || []),
      ...(companyLinkedInAnalysis?.painIndicators || []),
    ]

    // Find best conversation hook
    const bestHook: ConversationHook | null =
      personalLinkedInAnalysis?.bestHook ||
      companyLinkedInAnalysis?.bestHook ||
      null

    // Build composite triggers object
    const compositeTriggers = {
      // From intent scoring
      highIntent: intentScore.tier === 'hot',
      warmIntent: intentScore.tier === 'warm',
      viewedPricing: intentScore.topPages.includes('pricing'),
      viewedServices: intentScore.topPages.includes('services'),
      buyerJourneyAdvanced: intentScore.matchedSequences.length > 0,

      // From Perplexity (with recency!)
      recentFunding: perplexityResearch?.triggers.recentFunding || false,
      activelyHiring: perplexityResearch?.triggers.activelyHiring || false,
      competitivePressure: perplexityResearch?.triggers.competitivePressure || false,
      personInNews: perplexityResearch?.triggers.personInNews || false,

      // From LinkedIn
      hasPainSignals: allPainSignals.length > 0,
      hasHighConfidencePain: allPainSignals.some((p) => p.confidence === 'high'),
      isActiveOnLinkedIn: personalLinkedInAnalysis?.isActiveUser || false,
      hasConversationHooks: (personalLinkedInAnalysis?.conversationHooks.length || 0) > 0,
    }

    // Determine outreach guidance
    const outreachGuidance = {
      urgency:
        intentScore.tier === 'hot' ||
        perplexityResearch?.triggers.recentFunding ||
        perplexityResearch?.triggers.activelyHiring
          ? ('high' as const)
          : intentScore.tier === 'warm' || allPainSignals.length > 0
            ? ('medium' as const)
            : ('low' as const),
      tone: personalLinkedInAnalysis?.tone?.primary || 'formal',
      personalizationHooks: [
        bestHook?.angle,
        perplexityResearch?.personVisibility.keyFindings[0],
        ...allPainSignals.slice(0, 2).map((p) => `Reference their pain: "${p.topic}"`),
      ]
        .filter(Boolean)
        .slice(0, 3) as string[],
    }

    // ========================================
    // DATA COLLECTION SUMMARY (Enhanced)
    // ========================================
    console.log(`[Workflow 2] Data collection complete:`)
    console.log(`  - Intent Score: ${intentScore.score} (${intentScore.tier})`)
    console.log(`  - LinkedIn Profile: ${linkedinProfile ? 'Yes' : 'No'}`)
    console.log(`  - LinkedIn Company: ${linkedinCompany ? 'Yes' : 'No'}`)
    console.log(`  - Perplexity Research: ${perplexityResearch ? 'Yes' : 'No'}`)
    console.log(`  - Pain Signals: ${allPainSignals.length}`)
    console.log(`  - Active Triggers: ${Object.entries(compositeTriggers).filter(([_, v]) => v).map(([k]) => k).join(', ')}`)
    console.log(`  - Outreach Urgency: ${outreachGuidance.urgency}`)

    // ========================================
    // FINAL SYNTHESIS: Research Analyst (with enhanced context)
    // ========================================
    const research = await step.run('research-analyst-synthesis', async () => {
      console.log(`[Workflow 2] Running Research Analyst synthesis with enhanced context...`)

      // Build enhanced raw data for backwards compatibility with researchLead
      const enhancedRawData = {
        linkedinProfile,
        linkedinCompany,
        perplexityResults: perplexityResearch
          ? {
              content: perplexityResearch.summary,
              citations: [] as string[],
              query: `${lead.company_name} + ${lead.first_name} ${lead.last_name}`,
            }
          : null,
        // New enhanced data
        linkedinPosts: [
          ...((linkedinProfile?.posts || []) as Array<{ text: string; date?: string; likes?: number; comments?: number }>),
          ...((linkedinCompany?.posts || []) as Array<{ text: string; date?: string; likes?: number; comments?: number }>),
        ],
        intentData: {
          companyDomain: lead.company_domain || '',
          companyName: lead.company_name,
          pageViews: ((lead.intent_signal as Record<string, unknown>)?.pages_visited || []) as Array<{ page: string }>,
          totalVisits: lead.visit_count || 1,
        } as IntentData,
      }

      return await researchLead(lead, enhancedRawData)
    })

    console.log(`[Workflow 2] Research synthesis complete:`)
    console.log(`  - Persona: ${research.persona_match.type} (${research.persona_match.decision_level})`)
    console.log(`  - Triggers: ${research.triggers.length}`)
    console.log(`  - Messaging Angles: ${research.messaging_angles.length}`)

    // ========================================
    // STORE RESULTS (Enhanced)
    // ========================================
    await step.run('store-research', async () => {
      // 1. Upsert to research_records (current state snapshot)
      const { error: researchError } = await supabase.from('research_records').upsert(
        {
          lead_id: lead.id,
          perplexity_raw: perplexityResearch?.summary || null,
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
            // Enhanced signals
            enhanced: {
              intentScore: intentScore.score,
              intentTier: intentScore.tier,
              intentUrgency: intentScore.urgency,
              painSignals: allPainSignals.map((p) => ({
                topic: p.topic,
                confidence: p.confidence,
                text: p.text.substring(0, 200),
              })),
              compositeTriggers,
              outreachGuidance,
              perplexityRecency: {
                funding: perplexityResearch?.funding.recency || 'unknown',
                hiring: perplexityResearch?.hiring.recency || 'unknown',
                personVisibility: perplexityResearch?.personVisibility.recency || 'unknown',
              },
              linkedInTone: personalLinkedInAnalysis?.tone?.primary || null,
              bestHook: bestHook
                ? { topic: bestHook.topic, angle: bestHook.angle }
                : null,
            },
            waterfall_summary: {
              personal_linkedin_used: !!linkedinProfile,
              company_linkedin_used: !!linkedinCompany,
              perplexity_used: !!perplexityResearch,
              early_stop: hasSufficientTriggers,
              intent_score_used: true,
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
      const painSummary = allPainSignals.length > 0 ? ` Pain: "${allPainSignals[0].topic}"` : ''
      const memorySummary = `${research.persona_match.type} (${research.persona_match.decision_level}), Intent: ${intentScore.tier} (${intentScore.score}), ${research.relationship.type}: ${topTrigger?.fact?.substring(0, 80) || 'No triggers'}${painSummary}...`

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
          // Enhanced context for future reference
          enhanced: {
            intentScore: intentScore.score,
            intentTier: intentScore.tier,
            painSignals: allPainSignals,
            compositeTriggers,
            outreachGuidance,
          },
          waterfall_summary: {
            personal_linkedin_used: !!linkedinProfile,
            company_linkedin_used: !!linkedinCompany,
            perplexity_used: !!perplexityResearch,
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

    // Log engagement (enhanced)
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
          // Enhanced metadata
          intent_score: intentScore.score,
          intent_tier: intentScore.tier,
          pain_signal_count: allPainSignals.length,
          outreach_urgency: outreachGuidance.urgency,
          active_triggers: Object.entries(compositeTriggers)
            .filter(([_, v]) => v)
            .map(([k]) => k),
          waterfall_steps_used: [
            'intent_scoring',
            linkedinProfile ? 'personal_linkedin' : null,
            linkedinCompany ? 'company_linkedin' : null,
            perplexityResearch ? 'perplexity_enhanced' : null,
          ].filter(Boolean),
        },
      })
    })

    // Emit event for next workflow (enhanced with outreach guidance)
    await step.sendEvent('trigger-message-crafting', {
      name: 'lead.research-complete',
      data: {
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        persona_match: research.persona_match,
        top_triggers: research.triggers.slice(0, 3),
        messaging_angles: research.messaging_angles,
        qualification: eventData.qualification,
        // Enhanced data for Agent 3
        enhanced: {
          intentScore: intentScore.score,
          intentTier: intentScore.tier,
          painSignals: allPainSignals.slice(0, 3).map((p) => ({
            topic: p.topic,
            confidence: p.confidence,
          })),
          outreachGuidance,
          compositeTriggers,
          bestHook: bestHook
            ? { topic: bestHook.topic, angle: bestHook.angle, postSnippet: bestHook.postSnippet }
            : null,
        },
      },
    })

    console.log(`[Workflow 2] Completed for: ${lead.email}`)

    return {
      status: 'completed',
      lead_id: lead.id,
      persona: research.persona_match.type,
      decision_level: research.persona_match.decision_level,
      trigger_count: research.triggers.length,
      // Enhanced return data
      intent_score: intentScore.score,
      intent_tier: intentScore.tier,
      pain_signals: allPainSignals.length,
      outreach_urgency: outreachGuidance.urgency,
      waterfall_steps: {
        intent_scoring: true,
        personal_linkedin: !!linkedinProfile,
        company_linkedin: !!linkedinCompany,
        perplexity: !!perplexityResearch,
        early_stop: hasSufficientTriggers,
      },
    }
  }
)
