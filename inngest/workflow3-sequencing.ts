/**
 * Workflow 3: Email Sequence Generation
 *
 * Listens for research completion and generates personalized email sequences
 * using Agent 3 (T.I.P.S. framework with extended thinking)
 */

import { inngest } from './client'
import { NonRetriableError } from 'inngest'
import { supabase, type Lead } from '../src/lib/supabase'
import { writeSequenceWithProfile } from '../src/agents/agent3-writer'
import { buildContextProfile, type ResearchRecord, type EnhancedResearchData } from '../src/agents/context-profile-builder'
import { normalizeLead, type NormalizedLead } from '../src/lib/data-normalizer'
import type { ResearchResult } from '../src/agents/agent2-research'
import { reviewEmailSequence, storeReviewResult, buildResearchSummary } from '../src/agents/agent4-reviewer'
import { notifyHumanReviewNeeded, notifySequenceApproved } from '../src/lib/slack-notifier'

interface ResearchCompleteEvent {
  data: {
    lead_id: string
    tenant_id: string
    persona_match: {
      type: string
      decision_level: 'ATL' | 'BTL' | 'unknown'
      confidence: number
      reasoning: string
    }
    top_triggers: Array<{
      type: string
      fact: string
      scores: { impact: number; recency: number; relevance: number; total: number }
    }>
    messaging_angles: Array<{
      angle: string
      triggers_used: string[]
      why_opening: string
    }>
    qualification: {
      decision: string
      reasoning: string
      confidence: number
    }
  }
}

export const sequencingPipeline = inngest.createFunction(
  {
    id: 'sequencing-pipeline-v1',
    name: 'Email Sequence Generation',
    retries: 2,
  },
  { event: 'lead.research-complete' },
  async ({ event, step }) => {
    const eventData = event.data as ResearchCompleteEvent['data']

    console.log(`[Workflow 3] Starting sequence generation for lead: ${eventData.lead_id}`)

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

    console.log(`[Workflow 3] Generating sequence for: ${lead.first_name} ${lead.last_name} at ${lead.company_name}`)

    // Campaign Gate: Validate campaign is active (if lead has campaign_id)
    // This is the campaign-centric architecture: workflows only run for active campaigns
    if (lead.campaign_id) {
      await step.run('validate-campaign', async () => {
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .select('id, status')
          .eq('id', lead.campaign_id)
          .single()

        if (error || !campaign) {
          throw new NonRetriableError(`Campaign ${lead.campaign_id} not found`)
        }

        if (campaign.status !== 'active') {
          throw new NonRetriableError(`Campaign ${lead.campaign_id} is not active (status: ${campaign.status})`)
        }

        console.log(`[Workflow 3] Campaign ${lead.campaign_id} validated (active)`)
        return campaign
      })
    }

    // Step 2: Check if sequence already exists
    const existingSequence = await step.run('check-existing-sequence', async () => {
      const { data } = await supabase
        .from('email_sequences')
        .select('id, status, created_at')
        .eq('lead_id', lead.id)
        .in('status', ['pending', 'approved', 'deployed'])
        .maybeSingle()

      return data
    })

    if (existingSequence) {
      console.log(`[Workflow 3] Sequence already exists (${existingSequence.status}), skipping`)
      return {
        status: 'skipped',
        lead_id: lead.id,
        reason: `Sequence already exists with status: ${existingSequence.status}`,
        existing_sequence_id: existingSequence.id,
      }
    }

    // Step 3: Fetch full research record
    const research = await step.run('fetch-research', async () => {
      const { data, error } = await supabase
        .from('research_records')
        .select('extracted_signals')
        .eq('lead_id', lead.id)
        .single()

      if (error || !data) {
        throw new Error(`Research not found for lead: ${eventData.lead_id}`)
      }

      return data.extracted_signals as ResearchResult
    })

    console.log(`[Workflow 3] Research loaded - Persona: ${research.persona_match.type}, Relationship: ${research.relationship.type}`)

    // Step 4: Normalize lead data
    const normalizedLead = await step.run('normalize-lead', async () => {
      const leadSource = lead.source === 'intent_data' ? 'intent' : (lead.source as 'pixel' | 'manual') || 'manual'
      return normalizeLead(lead as unknown as Record<string, unknown>, leadSource)
    })

    // Step 5: Fetch RAG context for profile building
    const ragContext = await step.run('fetch-rag-context', async () => {
      const { data: ragDocs } = await supabase
        .from('rag_documents')
        .select('content')
        .eq('tenant_id', lead.tenant_id)
        .in('rag_type', ['shared', 'qualification'])
        .limit(5)

      return ragDocs?.map(d => d.content).join('\n\n') || ''
    })

    // Step 6: Build context profile
    const researchRecord: ResearchRecord = {
      perplexity_raw: null,
      apify_raw: null,
      extracted_signals: research as unknown as Record<string, unknown>,
    }

    // Fetch raw research data including enhanced signals
    const rawResearch = await step.run('fetch-raw-research', async () => {
      const { data } = await supabase
        .from('research_records')
        .select('perplexity_raw, apify_raw, extracted_signals')
        .eq('lead_id', lead.id)
        .single()

      return data
    })

    if (rawResearch) {
      researchRecord.perplexity_raw = rawResearch.perplexity_raw
      researchRecord.apify_raw = rawResearch.apify_raw as Record<string, unknown> | null
    }

    // Extract enhanced data from research records
    const enhancedData: EnhancedResearchData | undefined = (() => {
      const signals = rawResearch?.extracted_signals as Record<string, unknown> | null
      const enhanced = signals?.enhanced as Record<string, unknown> | undefined

      if (!enhanced) return undefined

      return {
        outreachGuidance: enhanced.outreachGuidance as EnhancedResearchData['outreachGuidance'],
        compositeTriggers: enhanced.compositeTriggers as EnhancedResearchData['compositeTriggers'],
        painSignals: enhanced.painSignals as EnhancedResearchData['painSignals'],
        intentScore: enhanced.intentScore as number | undefined,
        intentTier: enhanced.intentTier as 'hot' | 'warm' | 'cold' | 'research' | undefined,
      }
    })()

    if (enhancedData) {
      console.log(`[Workflow 3] Enhanced data found - Intent: ${enhancedData.intentTier}, Urgency: ${enhancedData.outreachGuidance?.urgency}`)
    }

    const contextProfile = await step.run('build-context-profile', async () => {
      console.log(`[Workflow 3] Building context profile with enhanced data...`)
      return await buildContextProfile(normalizedLead, researchRecord, ragContext, enhancedData)
    })

    console.log(`[Workflow 3] Context profile built - Quality score: ${contextProfile.metadata.dataQualityScore}`)

    // Step 7: Generate sequence using Agent 3 with context profile
    const sequence = await step.run('generate-sequence', async () => {
      console.log(`[Workflow 3] Calling Agent 3 with context profile and extended thinking...`)
      return await writeSequenceWithProfile({ lead, contextProfile, research })
    })

    console.log(`[Workflow 3] Sequence generated:`)
    console.log(`  - Thread 1: "${sequence.thread_1.subject}" (${sequence.thread_1.emails.length} emails)`)
    console.log(`  - Thread 2: "${sequence.thread_2.subject}" (${sequence.thread_2.emails.length} emails)`)
    console.log(`  - Pain 1: ${sequence.pain_1.pain.substring(0, 60)}...`)
    console.log(`  - Pain 2: ${sequence.pain_2.pain.substring(0, 60)}...`)

    // Step 8: Fetch the saved sequence record to get the ID and review_attempts
    const savedSequence = await step.run('fetch-saved-sequence', async () => {
      const { data, error } = await supabase
        .from('email_sequences')
        .select('id, review_attempts')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        throw new Error(`Could not find saved sequence for lead: ${lead.id}`)
      }

      return data
    })

    // Step 9: Review the sequence with Agent 4
    const reviewResult = await step.run('review-email-sequence', async () => {
      console.log(`[Workflow 3] Reviewing sequence with Agent 4...`)

      const researchSummary = buildResearchSummary(research as unknown as Record<string, unknown>)

      const result = await reviewEmailSequence({
        emailSequence: sequence,
        contextProfile,
        researchSummary,
        tenantId: lead.tenant_id,
      })

      // Store review result in database
      await storeReviewResult(
        savedSequence.id,
        lead.tenant_id,
        (savedSequence.review_attempts || 0) + 1,
        result
      )

      return result
    })

    console.log(`[Workflow 3] Review complete - Decision: ${reviewResult.decision}, Score: ${reviewResult.overallScore}`)

    // Step 10: Handle review decision
    if (reviewResult.decision === 'APPROVE') {
      // Update lead status to sequence ready
      await step.run('update-lead-status-approved', async () => {
        await supabase
          .from('leads')
          .update({
            status: 'sequence_ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)
      })

      // Log engagement
      await step.run('log-sequence-approved', async () => {
        await supabase.from('engagement_log').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          event_type: 'sequence.approved',
          metadata: {
            sequence_id: savedSequence.id,
            relationship_type: sequence.relationship_type,
            persona_type: sequence.metadata.persona_type,
            thread_1_subject: sequence.thread_1.subject,
            thread_2_subject: sequence.thread_2.subject,
            email_count: sequence.thread_1.emails.length + sequence.thread_2.emails.length,
            review_score: reviewResult.overallScore,
            context_profile_quality: contextProfile.metadata.dataQualityScore,
          },
        })

        // Send Slack notification
        await notifySequenceApproved({
          sequenceId: savedSequence.id,
          leadName: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email,
          companyName: lead.company_name || 'Unknown Company',
          approvedBy: 'Agent 4 (Reviewer)',
        })
      })

      // Trigger deployment event
      await step.sendEvent('sequence-approved', {
        name: 'lead.sequence-ready',
        data: {
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          sequence_id: savedSequence.id,
          relationship_type: sequence.relationship_type,
          persona_type: sequence.metadata.persona_type,
          thread_1_subject: sequence.thread_1.subject,
          thread_2_subject: sequence.thread_2.subject,
        },
      })

      console.log(`[Workflow 3] Sequence APPROVED for: ${lead.email}`)

      return {
        status: 'approved',
        lead_id: lead.id,
        sequence_id: savedSequence.id,
        review_decision: reviewResult.decision,
        review_score: reviewResult.overallScore,
        relationship_type: sequence.relationship_type,
        persona_type: sequence.metadata.persona_type,
        email_count: sequence.thread_1.emails.length + sequence.thread_2.emails.length,
      }

    } else if (reviewResult.decision === 'REVISE' && (savedSequence.review_attempts || 0) < 3) {
      // Trigger revision workflow
      await step.sendEvent('sequence-needs-revision', {
        name: 'lead.sequence-revision-needed',
        data: {
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          sequence_id: savedSequence.id,
          revision_instructions: reviewResult.revisionInstructions,
          attempt: (savedSequence.review_attempts || 0) + 1,
        },
      })

      console.log(`[Workflow 3] Sequence needs REVISION for: ${lead.email} (attempt ${(savedSequence.review_attempts || 0) + 1})`)

      return {
        status: 'revision_needed',
        lead_id: lead.id,
        sequence_id: savedSequence.id,
        review_decision: reviewResult.decision,
        review_score: reviewResult.overallScore,
        revision_instructions: reviewResult.revisionInstructions,
        attempt: (savedSequence.review_attempts || 0) + 1,
      }

    } else {
      // REJECT or too many revision attempts - needs human review
      await step.run('notify-human-review', async () => {
        // Update lead status to human_review
        await supabase
          .from('leads')
          .update({
            status: 'human_review',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)

        // Log engagement
        await supabase.from('engagement_log').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          event_type: 'sequence.human_review_needed',
          metadata: {
            sequence_id: savedSequence.id,
            review_decision: reviewResult.decision,
            review_score: reviewResult.overallScore,
            human_review_reason: reviewResult.humanReviewReason,
            revision_attempts: (savedSequence.review_attempts || 0) + 1,
          },
        })

        // Send Slack notification
        await notifyHumanReviewNeeded({
          sequenceId: savedSequence.id,
          leadName: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email,
          companyName: lead.company_name || 'Unknown Company',
          reason: reviewResult.humanReviewReason || `Review decision: ${reviewResult.decision} (score: ${reviewResult.overallScore})`,
          reviewerQuestions: reviewResult.sequenceLevelIssues?.slice(0, 3),
        })

        console.log(`[Workflow 3] Lead ${lead.id} needs HUMAN REVIEW: ${reviewResult.humanReviewReason}`)
      })

      return {
        status: 'human_review',
        lead_id: lead.id,
        sequence_id: savedSequence.id,
        review_decision: reviewResult.decision,
        review_score: reviewResult.overallScore,
        human_review_reason: reviewResult.humanReviewReason,
        revision_attempts: (savedSequence.review_attempts || 0) + 1,
      }
    }
  }
)
