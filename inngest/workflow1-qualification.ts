import { inngest } from './client'
import { qualifyLead } from '../src/agents/agent1-qualification'
import { supabase, type Lead } from '../src/lib/supabase'

interface LeadIngestedEvent {
  data: {
    first_name: string
    last_name: string
    email: string
    job_title?: string
    headline?: string
    department?: string
    seniority_level?: string
    years_experience?: number
    linkedin_url?: string
    company_name: string
    company_linkedin_url?: string
    company_domain?: string
    company_employee_count?: number
    company_revenue?: string
    company_industry?: string
    company_description?: string
    intent_signal?: Record<string, unknown>
    tenant_id: string
  }
}

export const qualificationAndResearch = inngest.createFunction(
  {
    id: 'qualification-and-research-v1',
    name: 'Qualification & Research Pipeline',
  },
  { event: 'lead.ingested' },
  async ({ event, step }) => {
    const eventData = event.data as LeadIngestedEvent['data']

    console.log(`[Workflow 1] Starting qualification for: ${eventData.email}`)

    // Step 1: Create or update lead in Supabase
    const lead = await step.run('create-lead', async () => {
      const { data, error } = await supabase
        .from('leads')
        .upsert(
          {
            tenant_id: eventData.tenant_id,
            first_name: eventData.first_name,
            last_name: eventData.last_name,
            email: eventData.email,
            job_title: eventData.job_title,
            headline: eventData.headline,
            department: eventData.department,
            seniority_level: eventData.seniority_level,
            years_experience: eventData.years_experience,
            linkedin_url: eventData.linkedin_url,
            company_name: eventData.company_name,
            company_linkedin_url: eventData.company_linkedin_url,
            company_domain: eventData.company_domain,
            company_employee_count: eventData.company_employee_count,
            company_revenue: eventData.company_revenue,
            company_industry: eventData.company_industry,
            company_description: eventData.company_description,
            intent_signal: eventData.intent_signal,
            status: 'ingested',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,email' }
        )
        .select()
        .single()

      if (error) throw error
      return data as Lead
    })

    // Step 2: Check GHL for existing record
    const ghlRecord = await step.run('check-ghl', async () => {
      const { data } = await supabase
        .from('ghl_records')
        .select('*')
        .eq('lead_id', lead.id)
        .single()

      return data
    })

    // Step 3: Run Agent 1 - Qualification
    const qualification = await step.run('agent1-qualify', async () => {
      return await qualifyLead(lead, ghlRecord)
    })

    console.log(`[Workflow 1] Qualification decision: ${qualification.decision}`)

    // Step 4: Handle decision
    if (qualification.decision === 'NO') {
      // Log the visit and end
      await step.run('log-disqualified', async () => {
        await supabase
          .from('leads')
          .update({
            status: 'disqualified',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)

        await supabase.from('engagement_log').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          event_type: 'qualification.rejected',
          metadata: {
            reason: qualification.reasoning,
            confidence: qualification.confidence,
          },
        })
      })

      console.log(`[Workflow 1] Lead disqualified: ${lead.email}`)
      return { status: 'disqualified', lead_id: lead.id }
    }

    if (qualification.decision === 'REVIEW') {
      // Mark for human review
      await step.run('mark-for-review', async () => {
        await supabase
          .from('leads')
          .update({
            status: 'human_review',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)
      })

      // TODO: Send Slack notification (Phase 2)
      console.log(`[Workflow 1] Lead marked for review: ${lead.email}`)

      // For now, auto-approve in MVP
      // In production, wait for human decision
      // We'll implement step.waitForEvent here in Phase 2
    }

    // Step 5: Mark as researched (Agent 2 will run next)
    await step.run('mark-researched', async () => {
      await supabase
        .from('leads')
        .update({
          status: 'researched',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
    })

    // Step 6: Trigger Workflow 2 (Deployment & Orchestration)
    await step.sendEvent('trigger-deployment', {
      name: 'lead.ready-for-deployment',
      data: {
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        qualification,
      },
    })

    console.log(`[Workflow 1] Completed for: ${lead.email}`)

    return {
      status: 'qualified',
      lead_id: lead.id,
      decision: qualification.decision,
    }
  }
)
