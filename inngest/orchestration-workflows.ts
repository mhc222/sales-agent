/**
 * Multi-Channel Orchestration Workflows
 * Inngest functions that coordinate email and LinkedIn outreach
 */

import { inngest } from './client'
import { supabase } from '../src/lib/supabase'
import * as orchestrator from '../src/lib/orchestration/orchestrator'
import * as smartlead from '../src/lib/smartlead'
import * as heyreach from '../src/lib/heyreach'
import { generateMultiChannelSequence } from '../src/agents/multichannel-sequence-generator'
import type { CampaignMode } from '../src/lib/orchestration/types'

// Campaign IDs for multi-channel
const SMARTLEAD_MULTICHANNEL_CAMPAIGN_ID = process.env.SMARTLEAD_MULTICHANNEL_CAMPAIGN_ID || '2854168'
const HEYREACH_MULTICHANNEL_CAMPAIGN_ID = process.env.HEYREACH_MULTICHANNEL_CAMPAIGN_ID || '307593'

// ============================================================================
// SEQUENCE GENERATION & DEPLOYMENT
// ============================================================================

/**
 * Generate and deploy a multi-channel sequence for a lead
 */
export const generateAndDeploySequence = inngest.createFunction(
  {
    id: 'orchestration-generate-sequence',
    name: 'Generate Multi-Channel Sequence',
    retries: 2,
  },
  { event: 'orchestration.generate-sequence' },
  async ({ event, step }) => {
    const { lead_id, tenant_id, campaign_mode, brand_id, campaign_id } = event.data as {
      lead_id: string
      tenant_id: string
      campaign_mode: CampaignMode
      brand_id?: string
      campaign_id?: string
    }

    // Step 1: Get lead data
    const lead = await step.run('fetch-lead', async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', lead_id)
        .single()

      if (error || !data) throw new Error(`Lead not found: ${lead_id}`)
      return data
    })

    // Step 1b: Fetch brand and campaign context for sequence generation
    const { brand, campaign } = await step.run('fetch-brand-campaign-context', async () => {
      let brandData = null
      let campaignData = null

      // If campaign_id provided, fetch campaign with its brand
      if (campaign_id) {
        const { data } = await supabase
          .from('campaigns')
          .select('*, brand:brands(*)')
          .eq('id', campaign_id)
          .single()

        if (data) {
          campaignData = data
          brandData = data.brand
        }
      }
      // If only brand_id provided, fetch brand directly
      else if (brand_id) {
        const { data } = await supabase
          .from('brands')
          .select('*')
          .eq('id', brand_id)
          .single()

        brandData = data
      }

      if (brandData) {
        console.log(`[Orchestration] Using brand context: ${brandData.name}`)
      }

      return { brand: brandData, campaign: campaignData }
    })

    // Step 2: Get existing context profile (already built during research phase)
    const contextProfile = await step.run('get-context-profile', async () => {
      // Get existing profile (built during workflow 2)
      const { data: existing } = await supabase
        .from('lead_context_profiles')
        .select('profile')
        .eq('lead_id', lead_id)
        .maybeSingle()

      if (existing?.profile) {
        return existing.profile
      }

      // Return minimal profile if none exists
      return {
        leadSummary: {
          name: `${lead.first_name} ${lead.last_name}`.trim(),
          title: lead.title || 'Unknown',
          company: lead.company_name || 'Unknown',
          seniorityLevel: 'unknown',
          decisionMakerLikelihood: 'medium' as const,
        },
        companyIntelligence: {
          overview: '',
          industry: lead.industry || 'Unknown',
          employeeCount: null,
          revenueRange: null,
          growthSignals: [],
          challenges: [],
        },
        personalizationHooks: {
          recentActivity: [],
          careerPath: '',
          sharedContext: [],
          conversationStarters: [],
        },
        painPointAnalysis: {
          primaryPainPoint: '',
          secondaryPainPoints: [],
          evidenceSources: [],
        },
        messagingStrategy: {
          recommendedAngle: 'value',
          toneRecommendation: 'professional',
          keyMessages: [],
          avoidTopics: [],
        },
        metadata: {
          generatedAt: new Date().toISOString(),
          dataQuality: 'low',
          confidenceLevel: 0.3,
        },
      }
    })

    // Step 3: Get research (if exists)
    const research = await step.run('fetch-research', async () => {
      const { data } = await supabase
        .from('lead_research')
        .select('*')
        .eq('lead_id', lead_id)
        .maybeSingle()

      return data || {
        relationship: { type: 'direct_client' },
        persona_match: { type: 'unknown' },
        triggers: [],
        messaging_angles: [],
      }
    })

    // Step 4: Generate sequence with brand context
    const sequence = await step.run('generate-sequence', async () => {
      // Build brand context for the sequence generator
      const brandContextForGenerator = brand ? {
        id: brand.id,
        name: brand.name,
        voice_tone: brand.voice_tone,
        value_proposition: brand.value_proposition,
        key_differentiators: brand.key_differentiators,
        target_industries: brand.target_industries,
      } : undefined

      // Build campaign context for the sequence generator
      const campaignContextForGenerator = campaign ? {
        id: campaign.id,
        name: campaign.name,
        mode: campaign.mode || campaign_mode,
        custom_instructions: campaign.custom_instructions,
        target_persona: campaign.target_persona,
        primary_angle: campaign.primary_angle,
        email_count: campaign.email_count || 7,
        linkedin_count: campaign.linkedin_count || 4,
        email_tone: campaign.email_tone,
        email_cta: campaign.email_cta,
        linkedin_first: campaign.linkedin_first || false,
        wait_for_connection: campaign.wait_for_connection || true,
        connection_timeout_hours: campaign.connection_timeout_hours || 72,
      } : undefined

      return await generateMultiChannelSequence({
        lead,
        contextProfile,
        research,
        campaignMode: campaign_mode,
        brand: brandContextForGenerator,
        campaign: campaignContextForGenerator,
      })
    })

    // Step 5: Deploy to SmartLead (email channel)
    const smartleadResult = await step.run('deploy-to-smartlead', async () => {
      if (campaign_mode === 'linkedin_only' || !sequence.email_steps?.length) {
        return { skipped: true, reason: 'No email steps' }
      }

      const campaignId = parseInt(SMARTLEAD_MULTICHANNEL_CAMPAIGN_ID)
      const result = await smartlead.deployLeadToMultiChannelCampaign(
        campaignId,
        {
          email: lead.email,
          first_name: lead.first_name,
          last_name: lead.last_name,
          company_name: lead.company_name,
          linkedin_url: lead.linkedin_url,
        },
        sequence
      )

      console.log(`[Orchestration] SmartLead deployment: ${result.ok ? 'success' : result.message}`)
      return result
    })

    // Step 6: Deploy to HeyReach (LinkedIn channel)
    const heyreachResult = await step.run('deploy-to-heyreach', async () => {
      if (campaign_mode === 'email_only' || !sequence.linkedin_steps?.length) {
        return { skipped: true, reason: 'No LinkedIn steps' }
      }

      if (!lead.linkedin_url) {
        return { skipped: true, reason: 'No LinkedIn URL' }
      }

      const apiKey = process.env.HEYREACH_API_KEY
      if (!apiKey) {
        return { skipped: true, reason: 'No HeyReach API key' }
      }

      const result = await heyreach.deployLeadToMultiChannelCampaign(
        { apiKey },
        HEYREACH_MULTICHANNEL_CAMPAIGN_ID,
        {
          linkedin_url: lead.linkedin_url,
          first_name: lead.first_name,
          last_name: lead.last_name,
          company_name: lead.company_name,
          job_title: lead.title,
          email: lead.email,
        },
        sequence
      )

      console.log(`[Orchestration] HeyReach deployment: ${result.success ? 'success' : result.error}`)
      return result
    })

    // Step 7: Create orchestration state
    const state = await step.run('create-orchestration-state', async () => {
      return await orchestrator.createOrchestrationState(lead_id, tenant_id, sequence)
    })

    // Step 8: Update state with platform IDs
    await step.run('update-platform-ids', async () => {
      const updates: Record<string, string | undefined> = {}
      // SmartLead returns { ok, id, message }
      if (smartleadResult && 'id' in smartleadResult && smartleadResult.id) {
        updates.smartlead_lead_id = String(smartleadResult.id)
      }
      // HeyReach returns { success, leadId, error }
      if (heyreachResult && 'leadId' in heyreachResult && heyreachResult.leadId) {
        updates.heyreach_lead_id = heyreachResult.leadId
      }
      if (Object.keys(updates).length > 0) {
        await orchestrator.updateOrchestrationState(lead_id, updates)
      }
    })

    // Step 9: Start orchestration
    await step.run('start-orchestration', async () => {
      await orchestrator.startOrchestration(lead_id, sequence.id!)
    })

    // Note: We don't schedule execute-next-step because SmartLead and HeyReach
    // run the sequences automatically. We just listen for webhooks.

    return {
      sequence_id: sequence.id,
      state_id: state.id,
      campaign_mode,
      email_steps: sequence.email_steps.length,
      linkedin_steps: sequence.linkedin_steps.length,
      smartlead: smartleadResult,
      heyreach: heyreachResult,
    }
  }
)

// ============================================================================
// STEP EXECUTION
// ============================================================================

/**
 * Execute the next step(s) in a sequence
 */
export const executeNextStep = inngest.createFunction(
  {
    id: 'orchestration-execute-step',
    name: 'Execute Next Orchestration Step',
    retries: 3,
  },
  { event: 'orchestration.execute-next-step' },
  async ({ event, step }) => {
    const { lead_id, tenant_id, sequence_id } = event.data as {
      lead_id: string
      tenant_id: string
      sequence_id: string
    }

    // Get current state
    const state = await step.run('get-state', async () => {
      return await orchestrator.getOrchestrationState(lead_id)
    })

    if (!state || state.status === 'stopped' || state.status === 'completed' || state.status === 'converted') {
      return { status: 'skipped', reason: `State is ${state?.status || 'not found'}` }
    }

    // If waiting, check timeout
    if (state.status === 'waiting' && state.waiting_timeout_at) {
      const now = new Date()
      if (now < new Date(state.waiting_timeout_at)) {
        // Still waiting, schedule next check
        await step.sendEvent('schedule-timeout-check', {
          name: 'orchestration.check-waiting-timeout',
          data: { lead_id, tenant_id, sequence_id },
        })
        return { status: 'waiting', waiting_for: state.waiting_for }
      }

      // Timeout reached, process timeout event
      await step.run('process-timeout', async () => {
        await orchestrator.processEvent(lead_id, 'waiting_timeout', 'orchestrator', {
          was_waiting_for: state.waiting_for,
        })
      })
    }

    // Get sequence
    const sequence = await step.run('get-sequence', async () => {
      return await orchestrator.getSequence(sequence_id)
    })

    if (!sequence) {
      throw new Error(`Sequence not found: ${sequence_id}`)
    }

    const actions: string[] = []

    // Execute email step if not paused and due
    if (!state.email_paused && !state.email_completed && sequence.email_steps) {
      const nextEmailStep = await step.run('get-next-email-step', async () => {
        return await orchestrator.getNextEmailStep(sequence_id, state.email_step_current)
      })

      if (nextEmailStep) {
        // Check if step should wait for LinkedIn
        if (nextEmailStep.wait_for_linkedin && !state.linkedin_connected) {
          await step.run('start-waiting-for-linkedin', async () => {
            await orchestrator.updateOrchestrationState(lead_id, {
              status: 'waiting',
              waiting_for: 'linkedin_connection',
              waiting_since: new Date().toISOString(),
              waiting_timeout_at: new Date(Date.now() + (nextEmailStep.wait_for_linkedin!.timeout_hours * 60 * 60 * 1000)).toISOString(),
            })
          })
          actions.push(`Waiting for LinkedIn connection (timeout: ${nextEmailStep.wait_for_linkedin.timeout_hours}h)`)
        } else {
          // Execute email send
          await step.run('send-email', async () => {
            // Get lead for email
            const { data: lead } = await supabase
              .from('leads')
              .select('email')
              .eq('id', lead_id)
              .single()

            if (lead) {
              await orchestrator.executeEmailSend(lead_id, lead.email, nextEmailStep, state)
            }
          })
          actions.push(`Sent email ${nextEmailStep.step_number}`)

          // Check if this email triggers LinkedIn action
          if (nextEmailStep.trigger_linkedin) {
            await step.sendEvent('trigger-linkedin', {
              name: 'orchestration.execute-linkedin-step',
              data: {
                lead_id,
                tenant_id,
                sequence_id,
                step_number: nextEmailStep.trigger_linkedin.step_number,
              },
            })
            actions.push(`Triggered LinkedIn step ${nextEmailStep.trigger_linkedin.step_number}`)
          }
        }
      }
    }

    // Execute LinkedIn step if not paused and due
    if (!state.linkedin_paused && !state.linkedin_completed && sequence.linkedin_steps) {
      const nextLinkedInStep = await step.run('get-next-linkedin-step', async () => {
        return await orchestrator.getNextLinkedInStep(sequence_id, state.linkedin_step_current)
      })

      if (nextLinkedInStep) {
        // Check if step requires connection
        if (nextLinkedInStep.requires_connection && !state.linkedin_connected) {
          // Skip this step for now, will execute when connected
          actions.push(`LinkedIn step ${nextLinkedInStep.step_number} waiting for connection`)
        } else {
          await step.run('execute-linkedin-action', async () => {
            const { data: lead } = await supabase
              .from('leads')
              .select('linkedin_url')
              .eq('id', lead_id)
              .single()

            if (lead?.linkedin_url) {
              // Get HeyReach config
              const { data: settings } = await supabase
                .from('tenants')
                .select('settings')
                .eq('id', tenant_id)
                .single()

              const heyreachApiKey = (settings?.settings as Record<string, string>)?.heyreach_api_key
              if (heyreachApiKey) {
                await orchestrator.executeLinkedInAction(
                  lead_id,
                  lead.linkedin_url,
                  nextLinkedInStep,
                  state,
                  { apiKey: heyreachApiKey }
                )
              }
            }
          })
          actions.push(`Executed LinkedIn step ${nextLinkedInStep.step_number}`)
        }
      }
    }

    // Schedule next execution based on sequence timing
    const nextExecutionDelay = calculateNextExecutionDelay(sequence, state)
    if (nextExecutionDelay > 0) {
      await step.sleep('wait-for-next-step', nextExecutionDelay)
      await step.sendEvent('schedule-next', {
        name: 'orchestration.execute-next-step',
        data: { lead_id, tenant_id, sequence_id },
      })
    }

    return { actions, next_delay_ms: nextExecutionDelay }
  }
)

/**
 * Calculate delay until next step
 */
function calculateNextExecutionDelay(
  sequence: Awaited<ReturnType<typeof orchestrator.getSequence>>,
  state: Awaited<ReturnType<typeof orchestrator.getOrchestrationState>>
): number {
  if (!sequence || !state) return 0

  // Find next scheduled step across both channels
  const nextEmailDay = sequence.email_steps?.[state.email_step_current]?.day
  const nextLinkedInDay = sequence.linkedin_steps?.[state.linkedin_step_current]?.day

  const nextDay = Math.min(
    nextEmailDay || Infinity,
    nextLinkedInDay || Infinity
  )

  if (nextDay === Infinity) return 0 // No more steps

  // Calculate delay (simplified - assumes day 1 is today)
  const msPerDay = 24 * 60 * 60 * 1000
  return nextDay * msPerDay
}

// ============================================================================
// WEBHOOK EVENT HANDLERS
// ============================================================================

/**
 * Handle Smartlead webhook events for orchestration
 */
export const handleSmartleadEvent = inngest.createFunction(
  {
    id: 'orchestration-smartlead-event',
    name: 'Handle Smartlead Event for Orchestration',
  },
  { event: 'smartlead.orchestration-event' },
  async ({ event, step }) => {
    const { lead_id, event_type, event_data } = event.data as {
      lead_id: string
      event_type: string
      event_data: Record<string, unknown>
    }

    // Map Smartlead event to orchestration event
    const orchestrationEventType = mapSmartleadEvent(event_type)
    if (!orchestrationEventType) return { skipped: true, reason: 'Unmapped event type' }

    // Process the event
    const decision = await step.run('process-event', async () => {
      return await orchestrator.processEvent(lead_id, orchestrationEventType, 'email', event_data)
    })

    // Execute any actions from the decision
    for (const action of decision.actions) {
      await step.run(`execute-action-${action.action}`, async () => {
        await executeOrchestratorAction(lead_id, action)
      })
    }

    return { decision }
  }
)

/**
 * Handle HeyReach webhook events for orchestration
 */
export const handleHeyReachEvent = inngest.createFunction(
  {
    id: 'orchestration-heyreach-event',
    name: 'Handle HeyReach Event for Orchestration',
  },
  { event: 'heyreach.orchestration-event' },
  async ({ event, step }) => {
    const { lead_id, event_type, event_data } = event.data as {
      lead_id: string
      event_type: string
      event_data: Record<string, unknown>
    }

    // Map HeyReach event to orchestration event
    const orchestrationEventType = mapHeyReachEvent(event_type)
    if (!orchestrationEventType) return { skipped: true, reason: 'Unmapped event type' }

    // Process the event
    const decision = await step.run('process-event', async () => {
      return await orchestrator.processEvent(lead_id, orchestrationEventType, 'linkedin', event_data)
    })

    // Execute any actions from the decision
    for (const action of decision.actions) {
      await step.run(`execute-action-${action.action}`, async () => {
        await executeOrchestratorAction(lead_id, action)
      })
    }

    // Handle cross-channel copy sync for LinkedIn signals
    // This updates SmartLead custom fields so future emails use conditional copy
    if (orchestrationEventType === 'linkedin_connected' || orchestrationEventType === 'linkedin_replied') {
      await step.run('sync-conditional-copy', async () => {
        await orchestrator.handleCrossChannelSignal(lead_id, orchestrationEventType)
      })
    }

    // If LinkedIn connected and we were waiting, trigger next email step
    if (orchestrationEventType === 'linkedin_connected') {
      const state = await orchestrator.getOrchestrationState(lead_id)
      if (state?.sequence_id) {
        await step.sendEvent('resume-sequence', {
          name: 'orchestration.execute-next-step',
          data: {
            lead_id,
            tenant_id: state.tenant_id,
            sequence_id: state.sequence_id,
          },
        })
      }
    }

    return { decision }
  }
)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapSmartleadEvent(eventType: string): Parameters<typeof orchestrator.processEvent>[1] | null {
  const mapping: Record<string, Parameters<typeof orchestrator.processEvent>[1]> = {
    'EMAIL_SENT': 'email_sent',
    'EMAIL_OPEN': 'email_opened',
    'EMAIL_LINK_CLICK': 'email_clicked',
    'EMAIL_REPLY': 'email_replied',
    'EMAIL_BOUNCE': 'email_bounced',
  }
  return mapping[eventType] || null
}

function mapHeyReachEvent(eventType: string): Parameters<typeof orchestrator.processEvent>[1] | null {
  const mapping: Record<string, Parameters<typeof orchestrator.processEvent>[1]> = {
    // Connection events
    'connection_accepted': 'linkedin_connected',
    'connected': 'linkedin_connected',
    'connection_request_sent': 'linkedin_connection_sent',

    // Message events
    'message_received': 'linkedin_replied',
    'reply_received': 'linkedin_replied',
    'message_sent': 'linkedin_message_sent',
    'every_message_reply_received': 'linkedin_replied', // Alternative reply event

    // InMail events (treat like regular messages for orchestration)
    'inmail_sent': 'linkedin_inmail_sent',
    'inmail_reply_received': 'linkedin_inmail_replied',

    // Social engagement signals
    'follow_sent': 'linkedin_follow_sent',
    'liked_post': 'linkedin_post_liked',
    'viewed_profile': 'linkedin_profile_viewed',

    // Campaign management
    'campaign_completed': 'linkedin_campaign_completed',
    'lead_tag_updated': 'linkedin_tag_updated',
  }
  return mapping[eventType] || null
}

async function executeOrchestratorAction(
  leadId: string,
  action: { action: string; channel?: string; reason: string; params?: Record<string, unknown> }
): Promise<void> {
  switch (action.action) {
    case 'stop':
      await orchestrator.stopOrchestration(leadId, action.reason, action.params)
      break

    case 'pause':
      await orchestrator.pauseOrchestration(leadId, action.reason)
      break

    case 'alert':
      // TODO: Send Slack notification
      console.log(`[Orchestration] Alert for lead ${leadId}: ${action.reason}`)
      break

    default:
      console.log(`[Orchestration] Unhandled action: ${action.action}`)
  }
}

// ============================================================================
// CRON: CHECK WAITING TIMEOUTS
// ============================================================================

export const checkWaitingTimeouts = inngest.createFunction(
  {
    id: 'orchestration-check-timeouts',
    name: 'Check Orchestration Waiting Timeouts',
  },
  { cron: '*/15 * * * *' }, // Every 15 minutes
  async ({ step }) => {
    // Find all leads that are waiting and past their timeout
    const expiredWaiting = await step.run('find-expired-waiting', async () => {
      const { data, error } = await supabase
        .from('orchestration_state')
        .select('lead_id, tenant_id, sequence_id, waiting_for')
        .eq('status', 'waiting')
        .lt('waiting_timeout_at', new Date().toISOString())
        .limit(100)

      if (error) {
        console.error('[Orchestration] Error finding expired waiting:', error)
        return []
      }
      return data || []
    })

    // Process each expired waiting state
    for (const state of expiredWaiting) {
      await step.sendEvent(`process-timeout-${state.lead_id}`, {
        name: 'orchestration.execute-next-step',
        data: {
          lead_id: state.lead_id,
          tenant_id: state.tenant_id,
          sequence_id: state.sequence_id,
        },
      })
    }

    return { processed: expiredWaiting.length }
  }
)
