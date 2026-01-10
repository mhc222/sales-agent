/**
 * Workflow 3: Email Sequence Generation
 *
 * Listens for research completion and generates personalized email sequences
 * using Agent 3 (T.I.P.S. framework with extended thinking)
 */

import { inngest } from './client'
import { supabase, type Lead } from '../src/lib/supabase'
import { writeSequence } from '../src/agents/agent3-writer'
import type { ResearchResult } from '../src/agents/agent2-research'

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

    // Step 4: Generate sequence using Agent 3
    const sequence = await step.run('generate-sequence', async () => {
      console.log(`[Workflow 3] Calling Agent 3 with extended thinking...`)
      return await writeSequence({ lead, research })
    })

    console.log(`[Workflow 3] Sequence generated:`)
    console.log(`  - Thread 1: "${sequence.thread_1.subject}" (${sequence.thread_1.emails.length} emails)`)
    console.log(`  - Thread 2: "${sequence.thread_2.subject}" (${sequence.thread_2.emails.length} emails)`)
    console.log(`  - Pain 1: ${sequence.pain_1.pain.substring(0, 60)}...`)
    console.log(`  - Pain 2: ${sequence.pain_2.pain.substring(0, 60)}...`)

    // Step 5: Update lead status
    await step.run('update-lead-status', async () => {
      await supabase
        .from('leads')
        .update({
          status: 'sequence_ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
    })

    // Step 6: Log engagement
    await step.run('log-sequence-generated', async () => {
      await supabase.from('engagement_log').insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        event_type: 'sequence.generated',
        metadata: {
          relationship_type: sequence.relationship_type,
          persona_type: sequence.metadata.persona_type,
          thread_1_subject: sequence.thread_1.subject,
          thread_2_subject: sequence.thread_2.subject,
          email_count: sequence.thread_1.emails.length + sequence.thread_2.emails.length,
          pain_1: sequence.pain_1.pain,
          pain_2: sequence.pain_2.pain,
        },
      })
    })

    // Step 7: Skip auto-deployment - requires manual approval first
    // TODO: Re-enable after initial review period
    // await step.sendEvent('trigger-sequence-deployment', {
    //   name: 'lead.sequence-ready',
    //   data: {
    //     lead_id: lead.id,
    //     tenant_id: lead.tenant_id,
    //     sequence_id: sequence.lead_id,
    //     relationship_type: sequence.relationship_type,
    //     persona_type: sequence.metadata.persona_type,
    //     thread_1_subject: sequence.thread_1.subject,
    //     thread_2_subject: sequence.thread_2.subject,
    //   },
    // })

    console.log(`[Workflow 3] Completed for: ${lead.email} - AWAITING MANUAL APPROVAL FOR DEPLOYMENT`)

    return {
      status: 'completed',
      lead_id: lead.id,
      relationship_type: sequence.relationship_type,
      persona_type: sequence.metadata.persona_type,
      thread_1_subject: sequence.thread_1.subject,
      thread_2_subject: sequence.thread_2.subject,
      email_count: sequence.thread_1.emails.length + sequence.thread_2.emails.length,
    }
  }
)
