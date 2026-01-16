/**
 * Workflow 3b: Email Sequence Revision
 *
 * Handles revision requests from Agent 4 reviewer
 * Re-runs Agent 3 with specific revision instructions
 */

import { inngest } from './client'
import { supabase, type Lead } from '../src/lib/supabase'
import { writeSequenceWithRevisions } from '../src/agents/agent3-writer'
import { buildContextProfile, type ResearchRecord } from '../src/agents/context-profile-builder'
import { normalizeLead } from '../src/lib/data-normalizer'
import { notifyHumanReviewNeeded, notifySequenceApproved } from '../src/lib/slack-notifier'
import type { ResearchResult } from '../src/agents/agent2-research'

interface RevisionNeededEvent {
  data: {
    lead_id: string
    tenant_id: string
    sequence_id: string
    revision_instructions: string | null
    attempt: number
  }
}

export const sequenceRevision = inngest.createFunction(
  {
    id: 'sequence-revision-v1',
    name: 'Email Sequence Revision',
    retries: 1,
  },
  { event: 'lead.sequence-revision-needed' },
  async ({ event, step }) => {
    const eventData = event.data as RevisionNeededEvent['data']

    console.log(`[Workflow 3b] Starting revision for lead: ${eventData.lead_id}, attempt: ${eventData.attempt}`)

    // Step 1: Load lead data
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

    // Step 2: Load research data
    const research = await step.run('fetch-research', async () => {
      const { data, error } = await supabase
        .from('research_records')
        .select('extracted_signals, perplexity_raw, apify_raw')
        .eq('lead_id', lead.id)
        .single()

      if (error || !data) {
        throw new Error(`Research not found for lead: ${eventData.lead_id}`)
      }

      return {
        extractedSignals: data.extracted_signals as ResearchResult,
        perplexityRaw: data.perplexity_raw,
        apifyRaw: data.apify_raw as Record<string, unknown> | null,
      }
    })

    // Step 3: Load current sequence for reference
    const currentSequence = await step.run('fetch-current-sequence', async () => {
      const { data, error } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('id', eventData.sequence_id)
        .single()

      if (error || !data) {
        throw new Error(`Sequence not found: ${eventData.sequence_id}`)
      }

      return data
    })

    // Step 4: Build context profile
    const normalizedLead = await step.run('normalize-lead', async () => {
      const leadSource = lead.source === 'intent_data' ? 'intent' : (lead.source as 'pixel' | 'manual') || 'manual'
      return normalizeLead(lead as unknown as Record<string, unknown>, leadSource)
    })

    const ragContext = await step.run('fetch-rag-context', async () => {
      const { data: ragDocs } = await supabase
        .from('rag_documents')
        .select('content')
        .eq('tenant_id', lead.tenant_id)
        .in('rag_type', ['shared', 'qualification'])
        .limit(5)

      return ragDocs?.map((d) => d.content).join('\n\n') || ''
    })

    const researchRecord: ResearchRecord = {
      perplexity_raw: research.perplexityRaw,
      apify_raw: research.apifyRaw,
      extracted_signals: research.extractedSignals as unknown as Record<string, unknown>,
    }

    const contextProfile = await step.run('build-context-profile', async () => {
      console.log(`[Workflow 3b] Building context profile for revision...`)
      return await buildContextProfile(normalizedLead, researchRecord, ragContext)
    })

    // Step 5: Generate revised sequence with instructions
    const revisedSequence = await step.run('generate-revised-sequence', async () => {
      console.log(`[Workflow 3b] Calling Agent 3 with revision instructions...`)
      console.log(`[Workflow 3b] Instructions: ${eventData.revision_instructions?.substring(0, 200)}...`)

      return await writeSequenceWithRevisions({
        lead,
        contextProfile,
        research: research.extractedSignals,
        revisionInstructions: eventData.revision_instructions || undefined,
        previousSequence: currentSequence,
      })
    })

    console.log(`[Workflow 3b] Revised sequence generated:`)
    console.log(`  - Thread 1: "${revisedSequence.thread_1.subject}" (${revisedSequence.thread_1.emails.length} emails)`)
    console.log(`  - Thread 2: "${revisedSequence.thread_2.subject}" (${revisedSequence.thread_2.emails.length} emails)`)

    // Step 6: Update the existing sequence with revised content
    await step.run('update-sequence', async () => {
      await supabase
        .from('email_sequences')
        .update({
          thread_1: revisedSequence.thread_1,
          thread_2: revisedSequence.thread_2,
          pain_1: revisedSequence.pain_1,
          pain_2: revisedSequence.pain_2,
          sequence_strategy: revisedSequence.sequence_strategy,
          review_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventData.sequence_id)
    })

    // Step 7: Log the revision
    await step.run('log-revision', async () => {
      await supabase.from('engagement_log').insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        event_type: 'sequence.revised',
        metadata: {
          sequence_id: eventData.sequence_id,
          attempt: eventData.attempt,
          revision_instructions: eventData.revision_instructions,
          thread_1_subject: revisedSequence.thread_1.subject,
          thread_2_subject: revisedSequence.thread_2.subject,
        },
      })
    })

    // Step 8: Trigger re-entry into the main workflow for review
    // We send a modified event to re-run the review portion
    await step.sendEvent('review-revision', {
      name: 'lead.sequence-revision-complete',
      data: {
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        sequence_id: eventData.sequence_id,
        attempt: eventData.attempt,
      },
    })

    console.log(`[Workflow 3b] Revision complete for: ${lead.email}, triggering re-review`)

    return {
      status: 'revised',
      lead_id: lead.id,
      sequence_id: eventData.sequence_id,
      attempt: eventData.attempt,
      thread_1_subject: revisedSequence.thread_1.subject,
      thread_2_subject: revisedSequence.thread_2.subject,
    }
  }
)

/**
 * Workflow 3c: Review Revised Sequence
 *
 * Reviews a revised sequence after Agent 3 has made changes
 */
export const reviewRevisedSequence = inngest.createFunction(
  {
    id: 'review-revised-sequence-v1',
    name: 'Review Revised Sequence',
    retries: 1,
  },
  { event: 'lead.sequence-revision-complete' },
  async ({ event, step }) => {
    const { lead_id, tenant_id, sequence_id, attempt } = event.data as {
      lead_id: string
      tenant_id: string
      sequence_id: string
      attempt: number
    }

    console.log(`[Workflow 3c] Re-reviewing revised sequence for lead: ${lead_id}`)

    // Import review functions
    const { reviewEmailSequence, storeReviewResult, buildResearchSummary } = await import(
      '../src/agents/agent4-reviewer'
    )

    // Load required data
    const lead = await step.run('fetch-lead', async () => {
      const { data, error } = await supabase.from('leads').select('*').eq('id', lead_id).single()

      if (error || !data) {
        throw new Error(`Lead not found: ${lead_id}`)
      }

      return data as Lead
    })

    const sequence = await step.run('fetch-sequence', async () => {
      const { data, error } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('id', sequence_id)
        .single()

      if (error || !data) {
        throw new Error(`Sequence not found: ${sequence_id}`)
      }

      return data
    })

    const research = await step.run('fetch-research', async () => {
      const { data, error } = await supabase
        .from('research_records')
        .select('extracted_signals')
        .eq('lead_id', lead_id)
        .single()

      if (error || !data) {
        throw new Error(`Research not found for lead: ${lead_id}`)
      }

      return data.extracted_signals as ResearchResult
    })

    // Build context profile for review
    const normalizedLead = await step.run('normalize-lead', async () => {
      const leadSource = lead.source === 'intent_data' ? 'intent' : (lead.source as 'pixel' | 'manual') || 'manual'
      return normalizeLead(lead as unknown as Record<string, unknown>, leadSource)
    })

    const ragContext = await step.run('fetch-rag-context', async () => {
      const { data: ragDocs } = await supabase
        .from('rag_documents')
        .select('content')
        .eq('tenant_id', tenant_id)
        .in('rag_type', ['shared', 'qualification'])
        .limit(5)

      return ragDocs?.map((d) => d.content).join('\n\n') || ''
    })

    const researchRecord: ResearchRecord = {
      perplexity_raw: null,
      apify_raw: null,
      extracted_signals: research as unknown as Record<string, unknown>,
    }

    const contextProfile = await step.run('build-context-profile', async () => {
      return await buildContextProfile(normalizedLead, researchRecord, ragContext)
    })

    // Review the revised sequence
    const reviewResult = await step.run('review-revised-sequence', async () => {
      console.log(`[Workflow 3c] Reviewing revised sequence with Agent 4...`)

      const researchSummary = buildResearchSummary(research as unknown as Record<string, unknown>)

      // Reconstruct EmailSequence format from database record
      const emailSequence = {
        lead_id: sequence.lead_id,
        relationship_type: sequence.relationship_type,
        thread_1: sequence.thread_1,
        thread_2: sequence.thread_2,
        pain_1: sequence.pain_1,
        pain_2: sequence.pain_2,
        sequence_strategy: sequence.sequence_strategy,
        metadata: {
          persona_type: sequence.persona_type,
          top_trigger: sequence.top_trigger,
          generated_at: sequence.created_at,
        },
      }

      const result = await reviewEmailSequence({
        emailSequence: emailSequence as any,
        contextProfile,
        researchSummary,
        tenantId: tenant_id,
      })

      // Store review result
      await storeReviewResult(sequence_id, tenant_id, attempt + 1, result)

      return result
    })

    console.log(`[Workflow 3c] Re-review complete - Decision: ${reviewResult.decision}, Score: ${reviewResult.overallScore}`)

    // Handle review decision (same logic as main workflow)
    if (reviewResult.decision === 'APPROVE') {
      await step.run('update-lead-status-approved', async () => {
        await supabase
          .from('leads')
          .update({
            status: 'sequence_ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead_id)
      })

      await step.run('log-sequence-approved', async () => {
        await supabase.from('engagement_log').insert({
          lead_id,
          tenant_id,
          event_type: 'sequence.approved',
          metadata: {
            sequence_id,
            review_score: reviewResult.overallScore,
            revision_attempt: attempt,
          },
        })

        // Send Slack notification for approval
        await notifySequenceApproved({
          sequenceId: sequence_id,
          leadName: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email,
          companyName: lead.company_name || 'Unknown Company',
          approvedBy: 'Agent 4 (Reviewer)',
        })
      })

      await step.sendEvent('sequence-approved', {
        name: 'lead.sequence-ready',
        data: {
          lead_id,
          tenant_id,
          sequence_id,
          relationship_type: sequence.relationship_type,
          persona_type: sequence.persona_type,
        },
      })

      return {
        status: 'approved',
        lead_id,
        sequence_id,
        review_decision: reviewResult.decision,
        review_score: reviewResult.overallScore,
        revision_attempt: attempt,
      }

    } else if (reviewResult.decision === 'REVISE' && attempt < 3) {
      await step.sendEvent('sequence-needs-revision', {
        name: 'lead.sequence-revision-needed',
        data: {
          lead_id,
          tenant_id,
          sequence_id,
          revision_instructions: reviewResult.revisionInstructions,
          attempt: attempt + 1,
        },
      })

      return {
        status: 'revision_needed',
        lead_id,
        sequence_id,
        review_decision: reviewResult.decision,
        review_score: reviewResult.overallScore,
        attempt: attempt + 1,
      }

    } else {
      await step.run('notify-human-review', async () => {
        await supabase
          .from('leads')
          .update({
            status: 'human_review',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead_id)

        await supabase.from('engagement_log').insert({
          lead_id,
          tenant_id,
          event_type: 'sequence.human_review_needed',
          metadata: {
            sequence_id,
            review_decision: reviewResult.decision,
            review_score: reviewResult.overallScore,
            human_review_reason: reviewResult.humanReviewReason,
            revision_attempts: attempt + 1,
          },
        })

        // Send Slack notification
        await notifyHumanReviewNeeded({
          sequenceId: sequence_id,
          leadName: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email,
          companyName: lead.company_name || 'Unknown Company',
          reason: reviewResult.humanReviewReason || `Failed review after ${attempt + 1} attempts (score: ${reviewResult.overallScore})`,
          reviewerQuestions: reviewResult.sequenceLevelIssues?.slice(0, 3),
        })

        console.log(`[Workflow 3c] Lead ${lead_id} needs HUMAN REVIEW after ${attempt + 1} attempts`)
      })

      return {
        status: 'human_review',
        lead_id,
        sequence_id,
        review_decision: reviewResult.decision,
        review_score: reviewResult.overallScore,
        human_review_reason: reviewResult.humanReviewReason,
        revision_attempts: attempt + 1,
      }
    }
  }
)
