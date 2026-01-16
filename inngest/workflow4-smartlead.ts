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
import { trackSequenceDeployment } from '../src/lib/learning-tracker'
import { deliverEmail, getTenantSettings, type EmailSequenceDelivery } from '../src/lib/delivery-router'

// Feature flag for using the delivery router (multi-provider support)
const USE_DELIVERY_ROUTER = process.env.USE_DELIVERY_ROUTER === 'true'

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

    // Step 5: Add lead to email provider (via delivery router or direct Smartlead)
    const smartleadResult = await step.run('add-to-smartlead', async () => {
      if (USE_DELIVERY_ROUTER) {
        // Use delivery router for multi-provider support
        const thread1 = sequence.thread_1 as { subject: string; emails: Array<{ body: string }> }
        const thread2 = sequence.thread_2 as { subject: string; emails: Array<{ body: string }> }

        // Build sequence in delivery router format
        const allEmails = [
          ...thread1.emails.map((e, i) => ({
            emailNumber: i + 1,
            day: i * 2, // Approximate days
            subject: i === 0 ? thread1.subject : `Re: ${thread1.subject}`,
            body: e.body,
          })),
          ...thread2.emails.map((e, i) => ({
            emailNumber: thread1.emails.length + i + 1,
            day: 7 + i * 3, // Approximate days for thread 2
            subject: i === 0 ? thread2.subject : `Re: ${thread2.subject}`,
            body: e.body,
          })),
        ]

        const delivery: EmailSequenceDelivery = {
          lead: {
            email: lead.email,
            first_name: lead.first_name,
            last_name: lead.last_name,
            company_name: lead.company_name,
            linkedin_url: lead.linkedin_url || undefined,
          },
          sequence: allEmails,
          campaignId: campaignId,
        }

        const routerResult = await deliverEmail(lead.tenant_id, delivery)

        if (!routerResult.success) {
          throw new Error(`Delivery error (${routerResult.provider}): ${routerResult.error}`)
        }

        // Extract lead ID from provider response if available
        const providerResponse = routerResult.providerResponse as { id?: string } | undefined
        return {
          ok: true,
          id: providerResponse?.id,
          provider: routerResult.provider,
        }
      } else {
        // Direct Smartlead integration (current behavior)
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

        return { ...result, provider: 'smartlead' }
      }
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

    // Step 6b: Track outreach events for learning system
    await step.run('track-outreach-events', async () => {
      const thread1 = sequence.thread_1 as { subject: string; emails: Array<{ body: string }> }
      const thread2 = sequence.thread_2 as { subject: string; emails: Array<{ body: string }> }

      await trackSequenceDeployment({
        tenantId: lead.tenant_id,
        leadId: lead.id,
        sequenceId: sequence.id,
        smartleadCampaignId: campaignId.toString(),
        smartleadLeadId: smartleadResult.id?.toString() || '',
        personaType: eventData.persona_type,
        relationshipType: eventData.relationship_type,
        topTriggerType: sequence.top_trigger || undefined,
        sequenceStrategy: sequence.sequence_strategy as Record<string, unknown> | undefined,
        threads: [
          { threadNumber: 1, subject: thread1.subject, emails: thread1.emails },
          { threadNumber: 2, subject: thread2.subject, emails: thread2.emails },
        ],
      })

      console.log(`[Workflow 4] Outreach events tracked for learning system`)
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
