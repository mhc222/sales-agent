/**
 * Workflow 4: Smartlead Deployment
 *
 * Deploys approved email sequences to Smartlead
 * Uses dynamic custom fields for personalized content
 */

import { inngest } from './client'
import { supabase, type Lead } from '../src/lib/supabase'
import {
  addLeadToCampaign,
  formatSequenceAsCustomFields,
  createTemplateCampaign,
  getCampaigns,
} from '../src/lib/smartlead'

// Default campaign ID - set this after creating the template campaign
const DEFAULT_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID
  ? parseInt(process.env.SMARTLEAD_CAMPAIGN_ID)
  : null

interface SequenceReadyEvent {
  data: {
    lead_id: string
    tenant_id: string
    sequence_id: string
    relationship_type: string
    persona_type: string
    thread_1_subject: string
    thread_2_subject: string
  }
}

export const smartleadDeployment = inngest.createFunction(
  {
    id: 'smartlead-deployment-v1',
    name: 'Smartlead Deployment',
    retries: 2,
  },
  { event: 'lead.sequence-ready' },
  async ({ event, step }) => {
    const eventData = event.data as SequenceReadyEvent['data']

    console.log(`[Workflow 4] Starting Smartlead deployment for lead: ${eventData.lead_id}`)

    // Step 1: Get or create campaign
    const campaignId = await step.run('get-campaign', async () => {
      if (DEFAULT_CAMPAIGN_ID) {
        return DEFAULT_CAMPAIGN_ID
      }

      // Check if we have a template campaign
      const campaigns = await getCampaigns()
      const templateCampaign = campaigns.find(c => c.name.includes('JSB Dynamic'))

      if (templateCampaign) {
        return templateCampaign.id
      }

      // Create one if it doesn't exist
      console.log('[Workflow 4] Creating template campaign...')
      return await createTemplateCampaign()
    })

    console.log(`[Workflow 4] Using campaign: ${campaignId}`)

    // Step 2: Fetch lead
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

    // Step 3: Fetch sequence
    const sequence = await step.run('fetch-sequence', async () => {
      const { data, error } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('lead_id', eventData.lead_id)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) {
        throw new Error(`No pending/approved sequence found for lead: ${eventData.lead_id}`)
      }

      return data
    })

    console.log(`[Workflow 4] Deploying sequence ${sequence.id} for ${lead.email}`)

    // Step 4: Format custom fields
    const customFields = await step.run('format-custom-fields', async () => {
      return formatSequenceAsCustomFields({
        thread_1: sequence.thread_1 as { subject: string; emails: Array<{ body: string }> },
        thread_2: sequence.thread_2 as { subject: string; emails: Array<{ body: string }> },
      })
    })

    console.log(`[Workflow 4] Custom fields prepared:`, Object.keys(customFields))

    // Step 5: Add lead to Smartlead campaign
    const smartleadResult = await step.run('add-to-smartlead', async () => {
      const result = await addLeadToCampaign(campaignId, {
        email: lead.email,
        first_name: lead.first_name,
        last_name: lead.last_name,
        company_name: lead.company_name,
        linkedin_url: lead.linkedin_url || undefined,
        custom_fields: customFields,
      })

      if (!result.ok) {
        throw new Error(`Smartlead API error: ${result.message}`)
      }

      return result
    })

    console.log(`[Workflow 4] Lead added to Smartlead:`, smartleadResult)

    // Step 6: Update sequence status
    await step.run('update-sequence-status', async () => {
      await supabase
        .from('email_sequences')
        .update({
          status: 'deployed',
          smartlead_campaign_id: campaignId.toString(),
          smartlead_lead_id: smartleadResult.id || null,
          deployed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sequence.id)
    })

    // Step 7: Update lead status
    await step.run('update-lead-status', async () => {
      await supabase
        .from('leads')
        .update({
          status: 'deployed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
    })

    // Step 8: Log to memories
    await step.run('log-deployment', async () => {
      await supabase.from('lead_memories').insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        source: 'workflow4_smartlead',
        memory_type: 'sequence_deployed',
        content: {
          sequence_id: sequence.id,
          smartlead_campaign_id: campaignId,
          smartlead_lead_id: smartleadResult.id,
          thread_1_subject: sequence.thread_1.subject,
          thread_2_subject: sequence.thread_2.subject,
        },
        summary: `Deployed to Smartlead campaign ${campaignId}: "${sequence.thread_1.subject}" + "${sequence.thread_2.subject}"`,
      })
    })

    // Step 9: Log engagement
    await step.run('log-engagement', async () => {
      await supabase.from('engagement_log').insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        event_type: 'sequence.deployed',
        metadata: {
          smartlead_campaign_id: campaignId,
          smartlead_lead_id: smartleadResult.id,
          relationship_type: eventData.relationship_type,
          persona_type: eventData.persona_type,
        },
      })
    })

    console.log(`[Workflow 4] Completed for: ${lead.email}`)

    return {
      status: 'deployed',
      lead_id: lead.id,
      sequence_id: sequence.id,
      smartlead_campaign_id: campaignId,
      smartlead_lead_id: smartleadResult.id,
    }
  }
)

/**
 * Manual deployment trigger - for deploying from the dashboard
 */
export const manualSmartleadDeployment = inngest.createFunction(
  {
    id: 'manual-smartlead-deployment',
    name: 'Manual Smartlead Deployment',
    retries: 1,
  },
  { event: 'lead.deploy-to-smartlead' },
  async ({ event, step }) => {
    // Emit the sequence-ready event to trigger the main workflow
    await step.sendEvent('trigger-deployment', {
      name: 'lead.sequence-ready',
      data: event.data,
    })

    return { status: 'triggered', lead_id: event.data.lead_id }
  }
)
