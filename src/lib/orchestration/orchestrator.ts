/**
 * Multi-Channel Orchestrator
 * The brain that coordinates email and LinkedIn outreach
 */

import { supabase } from '../supabase'
import * as smartlead from '../smartlead'
import type {
  CampaignMode,
  OrchestrationState,
  OrchestrationEvent,
  OrchestrationEventType,
  OrchestratorDecision,
  OrchestratorAction,
  MultiChannelSequence,
  EmailStep,
  LinkedInStep,
  CrossChannelTrigger,
} from './types'

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONNECTION_TIMEOUT_HOURS = 72  // 3 days
const DEFAULT_EMAIL_DELAY_HOURS = 24

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Get current orchestration state for a lead
 */
export async function getOrchestrationState(leadId: string): Promise<OrchestrationState | null> {
  const { data, error } = await supabase
    .from('orchestration_state')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (error) {
    console.error('[Orchestrator] Error fetching state:', error)
    return null
  }

  return data as OrchestrationState | null
}

/**
 * Create initial orchestration state for a lead
 */
export async function createOrchestrationState(
  leadId: string,
  tenantId: string,
  sequence: MultiChannelSequence
): Promise<OrchestrationState> {
  const state: Partial<OrchestrationState> = {
    lead_id: leadId,
    tenant_id: tenantId,
    sequence_id: sequence.id,
    campaign_mode: sequence.campaign_mode,

    // Position
    email_step_current: 0,
    email_step_total: sequence.email_steps?.length || 0,
    linkedin_step_current: 0,
    linkedin_step_total: sequence.linkedin_steps?.length || 0,

    // Status
    status: 'pending',

    // Platform IDs
    smartlead_lead_id: undefined,
    heyreach_lead_id: undefined,
  }

  const { data, error } = await supabase
    .from('orchestration_state')
    .insert(state)
    .select()
    .single()

  if (error) {
    console.error('[Orchestrator] Error creating state:', error)
    throw new Error(`Failed to create orchestration state: ${error.message}`)
  }

  return data as OrchestrationState
}

/**
 * Update orchestration state
 */
export async function updateOrchestrationState(
  leadId: string,
  updates: Partial<OrchestrationState>
): Promise<OrchestrationState> {
  const { data, error } = await supabase
    .from('orchestration_state')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', leadId)
    .select()
    .single()

  if (error) {
    console.error('[Orchestrator] Error updating state:', error)
    throw new Error(`Failed to update orchestration state: ${error.message}`)
  }

  return data as OrchestrationState
}

// ============================================================================
// EVENT LOGGING
// ============================================================================

/**
 * Log an orchestration event
 */
export async function logOrchestrationEvent(event: Omit<OrchestrationEvent, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('orchestration_events').insert(event)

  if (error) {
    console.error('[Orchestrator] Error logging event:', error)
  }
}

// ============================================================================
// CROSS-CHANNEL TRIGGERS
// ============================================================================

/**
 * Get applicable triggers for an event
 */
export async function getApplicableTriggers(
  tenantId: string,
  sourceChannel: 'email' | 'linkedin',
  sourceEvent: string
): Promise<CrossChannelTrigger[]> {
  const { data, error } = await supabase
    .from('cross_channel_triggers')
    .select('*')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq('source_channel', sourceChannel)
    .eq('source_event', sourceEvent)
    .eq('is_active', true)
    .order('priority', { ascending: false })

  if (error) {
    console.error('[Orchestrator] Error fetching triggers:', error)
    return []
  }

  return (data || []) as CrossChannelTrigger[]
}

/**
 * Evaluate trigger conditions
 */
function evaluateTriggerConditions(
  trigger: CrossChannelTrigger,
  state: OrchestrationState,
  eventData?: Record<string, unknown>
): boolean {
  if (!trigger.source_conditions) return true

  const conditions = trigger.source_conditions as Record<string, unknown>

  // Check sentiment condition
  if (conditions.sentiment) {
    const expectedSentiment = conditions.sentiment
    const actualSentiment = eventData?.sentiment ||
      (trigger.source_channel === 'email' ? state.email_reply_sentiment : state.linkedin_reply_sentiment)
    if (actualSentiment !== expectedSentiment) return false
  }

  // Check open count condition
  if (conditions.open_count) {
    const openCondition = conditions.open_count as { gte?: number; lte?: number }
    if (openCondition.gte && state.email_opened_count < openCondition.gte) return false
    if (openCondition.lte && state.email_opened_count > openCondition.lte) return false
  }

  return true
}

// ============================================================================
// DECISION ENGINE
// ============================================================================

/**
 * Process an incoming event and decide what to do
 */
export async function processEvent(
  leadId: string,
  eventType: OrchestrationEventType,
  channel: 'email' | 'linkedin' | 'orchestrator',
  eventData?: Record<string, unknown>
): Promise<OrchestratorDecision> {
  // Get current state
  const state = await getOrchestrationState(leadId)
  if (!state) {
    throw new Error(`No orchestration state found for lead ${leadId}`)
  }

  // Create event record
  const event: OrchestrationEvent = {
    lead_id: leadId,
    tenant_id: state.tenant_id,
    sequence_id: state.sequence_id,
    event_type: eventType,
    channel,
    event_data: eventData,
  }

  // Log the event
  await logOrchestrationEvent(event)

  // Evaluate triggers and build actions
  const actions: OrchestratorAction[] = []
  const stateUpdates: Partial<OrchestrationState> = {}

  // First, update state based on event
  updateStateFromEvent(state, eventType, channel, eventData, stateUpdates)

  // Cross-channel triggers only apply to email/linkedin events (not orchestrator internal events)
  if (channel !== 'orchestrator') {
    // Get applicable triggers
    const triggers = await getApplicableTriggers(state.tenant_id, channel, mapEventTypeToTriggerEvent(eventType))

    // Evaluate cross-channel triggers
    for (const trigger of triggers) {
      if (evaluateTriggerConditions(trigger, { ...state, ...stateUpdates }, eventData)) {
        const action = buildActionFromTrigger(trigger)
        if (action) {
          actions.push(action)
          applyActionToStateUpdates(action, stateUpdates)
        }
      }
    }

    // If no triggers matched, apply default behavior
    if (actions.length === 0) {
      const defaultActions = getDefaultActions(state, eventType, channel, eventData)
      actions.push(...defaultActions)
      for (const action of defaultActions) {
        applyActionToStateUpdates(action, stateUpdates)
      }
    }
  }

  // Apply state updates
  if (Object.keys(stateUpdates).length > 0) {
    await updateOrchestrationState(leadId, stateUpdates)
  }

  return {
    lead_id: leadId,
    current_state: state,
    event,
    actions,
    next_state_updates: stateUpdates,
  }
}

/**
 * Map event type to trigger event name
 */
function mapEventTypeToTriggerEvent(eventType: OrchestrationEventType): string {
  const mapping: Record<string, string> = {
    'email_opened': 'opened',
    'email_clicked': 'clicked',
    'email_replied': 'replied',
    'email_bounced': 'bounced',
    'linkedin_connected': 'connected',
    'linkedin_replied': 'replied',
    'linkedin_inmail_replied': 'inmail_replied',
    'linkedin_follow_sent': 'follow_sent',
    'linkedin_post_liked': 'post_liked',
    'linkedin_profile_viewed': 'profile_viewed',
    'linkedin_campaign_completed': 'campaign_completed',
    'waiting_timeout': 'connection_timeout',
  }
  return mapping[eventType] || eventType
}

/**
 * Update state based on incoming event
 */
function updateStateFromEvent(
  state: OrchestrationState,
  eventType: OrchestrationEventType,
  channel: 'email' | 'linkedin' | 'orchestrator',
  eventData: Record<string, unknown> | undefined,
  updates: Partial<OrchestrationState>
): void {
  const now = new Date().toISOString()

  switch (eventType) {
    case 'email_sent':
      updates.last_email_sent_at = now
      updates.email_started = true
      updates.email_step_current = (state.email_step_current || 0) + 1
      break

    case 'email_opened':
      updates.email_opened = true
      updates.email_opened_count = (state.email_opened_count || 0) + 1
      break

    case 'email_clicked':
      updates.email_clicked = true
      break

    case 'email_replied':
      updates.email_replied = true
      updates.email_replied_at = now
      if (eventData?.sentiment && ['positive', 'negative', 'neutral'].includes(eventData.sentiment as string)) {
        updates.email_reply_sentiment = eventData.sentiment as 'positive' | 'negative' | 'neutral'
      }
      break

    case 'email_bounced':
      updates.email_paused = true
      break

    case 'linkedin_connection_sent':
      updates.linkedin_started = true
      updates.last_linkedin_action_at = now
      break

    case 'linkedin_connected':
      updates.linkedin_connected = true
      updates.linkedin_connected_at = now
      // Clear waiting if we were waiting for connection
      if (state.waiting_for === 'linkedin_connection') {
        updates.waiting_for = undefined
        updates.waiting_since = undefined
        updates.waiting_timeout_at = undefined
        updates.status = 'active'
      }
      break

    case 'linkedin_message_sent':
      updates.last_linkedin_action_at = now
      updates.linkedin_step_current = (state.linkedin_step_current || 0) + 1
      break

    case 'linkedin_replied':
      updates.linkedin_replied = true
      updates.linkedin_replied_at = now
      if (eventData?.sentiment && ['positive', 'negative', 'neutral'].includes(eventData.sentiment as string)) {
        updates.linkedin_reply_sentiment = eventData.sentiment as 'positive' | 'negative' | 'neutral'
      }
      break

    case 'linkedin_inmail_sent':
      updates.last_linkedin_action_at = now
      updates.linkedin_step_current = (state.linkedin_step_current || 0) + 1
      break

    case 'linkedin_inmail_replied':
      updates.linkedin_replied = true
      updates.linkedin_replied_at = now
      if (eventData?.sentiment && ['positive', 'negative', 'neutral'].includes(eventData.sentiment as string)) {
        updates.linkedin_reply_sentiment = eventData.sentiment as 'positive' | 'negative' | 'neutral'
      }
      break

    case 'linkedin_follow_sent':
    case 'linkedin_post_liked':
    case 'linkedin_profile_viewed':
      // Social engagement signals - track as actions
      updates.last_linkedin_action_at = now
      break

    case 'linkedin_campaign_completed':
      updates.linkedin_completed = true
      updates.linkedin_paused = true
      break

    case 'linkedin_tag_updated':
      // Track but don't update state
      break

    case 'waiting_timeout':
      updates.waiting_for = undefined
      updates.waiting_since = undefined
      updates.waiting_timeout_at = undefined
      updates.status = 'active'
      break
  }
}

/**
 * Build an action from a trigger definition
 */
function buildActionFromTrigger(trigger: CrossChannelTrigger): OrchestratorAction | null {
  const params = trigger.target_params as Record<string, unknown> || {}

  return {
    action: trigger.target_action as OrchestratorAction['action'],
    channel: trigger.target_channel === 'orchestrator' ? undefined : trigger.target_channel as 'email' | 'linkedin',
    params,
    reason: trigger.name,
  }
}

/**
 * Apply action to state updates
 */
function applyActionToStateUpdates(
  action: OrchestratorAction,
  updates: Partial<OrchestrationState>
): void {
  switch (action.action) {
    case 'pause':
      if (action.channel === 'email') {
        updates.email_paused = true
      } else if (action.channel === 'linkedin') {
        updates.linkedin_paused = true
      }
      break

    case 'resume':
      if (action.channel === 'email') {
        updates.email_paused = false
      } else if (action.channel === 'linkedin') {
        updates.linkedin_paused = false
      }
      break

    case 'stop':
      updates.status = 'stopped'
      updates.stop_reason = action.reason
      updates.email_paused = true
      updates.linkedin_paused = true
      break

    case 'wait':
      updates.status = 'waiting'
      updates.waiting_for = action.params?.wait_for as string
      updates.waiting_since = new Date().toISOString()
      const timeoutHours = action.params?.timeout_hours as number || DEFAULT_CONNECTION_TIMEOUT_HOURS
      updates.waiting_timeout_at = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString()
      break
  }
}

/**
 * Get default actions when no triggers match
 */
function getDefaultActions(
  state: OrchestrationState,
  eventType: OrchestrationEventType,
  channel: 'email' | 'linkedin',
  eventData?: Record<string, unknown>
): OrchestratorAction[] {
  const actions: OrchestratorAction[] = []

  // Check if sequence completed
  const emailDone = state.email_step_current >= state.email_step_total
  const linkedinDone = state.linkedin_step_current >= state.linkedin_step_total

  if (state.campaign_mode === 'email_only' && emailDone) {
    actions.push({ action: 'stop', reason: 'Email sequence completed' })
  } else if (state.campaign_mode === 'linkedin_only' && linkedinDone) {
    actions.push({ action: 'stop', reason: 'LinkedIn sequence completed' })
  } else if (state.campaign_mode === 'multi_channel' && emailDone && linkedinDone) {
    actions.push({ action: 'stop', reason: 'Multi-channel sequence completed' })
  }

  return actions
}

// ============================================================================
// SEQUENCE EXECUTION
// ============================================================================

/**
 * Get the sequence for a lead
 */
export async function getSequence(sequenceId: string): Promise<MultiChannelSequence | null> {
  const { data, error } = await supabase
    .from('multichannel_sequences')
    .select('*')
    .eq('id', sequenceId)
    .single()

  if (error) {
    console.error('[Orchestrator] Error fetching sequence:', error)
    return null
  }

  return data as MultiChannelSequence
}

/**
 * Get the next email step to send
 */
export async function getNextEmailStep(
  sequenceId: string,
  currentStep: number
): Promise<EmailStep | null> {
  const sequence = await getSequence(sequenceId)
  if (!sequence || !sequence.email_steps) return null

  const nextStep = sequence.email_steps.find(s => s.step_number === currentStep + 1)
  return nextStep || null
}

/**
 * Get the next LinkedIn step to execute
 */
export async function getNextLinkedInStep(
  sequenceId: string,
  currentStep: number
): Promise<LinkedInStep | null> {
  const sequence = await getSequence(sequenceId)
  if (!sequence || !sequence.linkedin_steps) return null

  const nextStep = sequence.linkedin_steps.find(s => s.step_number === currentStep + 1)
  return nextStep || null
}

/**
 * Get email content based on cross-channel state
 */
export function getEmailContent(
  step: EmailStep,
  state: OrchestrationState
): { subject: string; body: string } {
  let body = step.body

  // Use alternative copy based on LinkedIn status
  if (state.linkedin_replied && step.body_linkedin_replied) {
    body = step.body_linkedin_replied
  } else if (state.linkedin_connected && step.body_linkedin_connected) {
    body = step.body_linkedin_connected
  }

  return {
    subject: step.subject,
    body,
  }
}

/**
 * Get LinkedIn message content based on cross-channel state
 */
export function getLinkedInContent(
  step: LinkedInStep,
  state: OrchestrationState
): string {
  if (!step.body) return ''

  // Use alternative copy based on email engagement
  if (state.email_replied && step.body_email_replied) {
    return step.body_email_replied
  } else if (state.email_opened && step.body_email_opened) {
    return step.body_email_opened
  }

  return step.body
}

// ============================================================================
// PLATFORM EXECUTION
// ============================================================================

/**
 * Execute email send via Smartlead
 */
export async function executeEmailSend(
  leadId: string,
  email: string,
  step: EmailStep,
  state: OrchestrationState
): Promise<{ success: boolean; error?: string }> {
  try {
    const content = getEmailContent(step, state)

    // For now, we use the existing campaign approach
    // TODO: Implement direct send API if available
    console.log(`[Orchestrator] Would send email to ${email}:`, content.subject)

    // Update state
    await processEvent(leadId, 'email_sent', 'email', {
      step_number: step.step_number,
      subject: content.subject,
    })

    return { success: true }
  } catch (error) {
    console.error('[Orchestrator] Email send error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Execute LinkedIn action via HeyReach
 */
export async function executeLinkedInAction(
  leadId: string,
  linkedinUrl: string,
  step: LinkedInStep,
  state: OrchestrationState,
  heyreachConfig: { apiKey: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the HeyReach campaign ID from state or sequence
    const campaignId = state.heyreach_lead_id ? undefined : undefined // TODO: Get from sequence

    if (step.type === 'message' && step.body) {
      const content = getLinkedInContent(step, state)
      console.log(`[Orchestrator] Would send LinkedIn message to ${linkedinUrl}:`, content.substring(0, 50))

      // TODO: Implement actual HeyReach message send
      // await heyreach.sendMessage(heyreachConfig, { campaignId, leadId, message: content })
    } else if (step.type === 'connection_request') {
      console.log(`[Orchestrator] Would send connection request to ${linkedinUrl}`)

      // TODO: Implement via adding lead to HeyReach campaign
    }

    // Log event
    await processEvent(leadId, step.type === 'connection_request' ? 'linkedin_connection_sent' : 'linkedin_message_sent', 'linkedin', {
      step_number: step.step_number,
      action_type: step.type,
    })

    return { success: true }
  } catch (error) {
    console.error('[Orchestrator] LinkedIn action error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// ORCHESTRATION CONTROL
// ============================================================================

/**
 * Start orchestration for a lead
 */
export async function startOrchestration(
  leadId: string,
  sequenceId: string
): Promise<void> {
  const state = await getOrchestrationState(leadId)
  if (!state) {
    throw new Error(`No orchestration state found for lead ${leadId}`)
  }

  await updateOrchestrationState(leadId, {
    status: 'active',
  })

  await logOrchestrationEvent({
    lead_id: leadId,
    tenant_id: state.tenant_id,
    sequence_id: sequenceId,
    event_type: 'sequence_started',
    channel: 'orchestrator',
    event_data: { campaign_mode: state.campaign_mode },
  })
}

/**
 * Pause orchestration for a lead
 */
export async function pauseOrchestration(
  leadId: string,
  reason: string
): Promise<void> {
  const state = await getOrchestrationState(leadId)
  if (!state) return

  await updateOrchestrationState(leadId, {
    status: 'paused',
    email_paused: true,
    linkedin_paused: true,
  })

  // Pause in platforms
  if (state.smartlead_lead_id) {
    // TODO: Pause in Smartlead
  }
  if (state.heyreach_lead_id) {
    // TODO: Pause in HeyReach
  }

  await logOrchestrationEvent({
    lead_id: leadId,
    tenant_id: state.tenant_id,
    sequence_id: state.sequence_id,
    event_type: 'sequence_paused',
    channel: 'orchestrator',
    decision: 'pause',
    decision_reason: reason,
  })
}

/**
 * Stop orchestration for a lead (permanent)
 */
export async function stopOrchestration(
  leadId: string,
  reason: string,
  details?: Record<string, unknown>
): Promise<void> {
  const state = await getOrchestrationState(leadId)
  if (!state) return

  await updateOrchestrationState(leadId, {
    status: 'stopped',
    stop_reason: reason,
    stop_details: details,
    email_paused: true,
    linkedin_paused: true,
  })

  // Stop in platforms
  if (state.smartlead_lead_id) {
    // TODO: Pause/remove in Smartlead
  }
  if (state.heyreach_lead_id) {
    // TODO: Stop in HeyReach
  }

  await logOrchestrationEvent({
    lead_id: leadId,
    tenant_id: state.tenant_id,
    sequence_id: state.sequence_id,
    event_type: 'sequence_stopped',
    channel: 'orchestrator',
    decision: 'stop',
    decision_reason: reason,
    event_data: details,
  })
}

/**
 * Mark orchestration as converted (positive outcome)
 */
export async function markConverted(
  leadId: string,
  conversionType: string
): Promise<void> {
  const state = await getOrchestrationState(leadId)
  if (!state) return

  await updateOrchestrationState(leadId, {
    status: 'converted',
    stop_reason: `Converted: ${conversionType}`,
    email_paused: true,
    linkedin_paused: true,
  })

  await logOrchestrationEvent({
    lead_id: leadId,
    tenant_id: state.tenant_id,
    sequence_id: state.sequence_id,
    event_type: 'sequence_completed',
    channel: 'orchestrator',
    decision: 'converted',
    decision_reason: conversionType,
  })
}

// ============================================================================
// SMARTLEAD CONDITIONAL COPY SYNC
// ============================================================================

/**
 * Sync conditional email copy to SmartLead when cross-channel signals change
 * Called when LinkedIn connection accepted or reply received
 */
export async function syncConditionalCopyToSmartlead(
  leadId: string,
  state: OrchestrationState,
  eventType: 'linkedin_connected' | 'linkedin_replied'
): Promise<void> {
  // Only sync for multi-channel campaigns
  if (state.campaign_mode !== 'multi_channel') {
    return
  }

  // Need sequence and SmartLead IDs
  if (!state.sequence_id || !state.smartlead_lead_id) {
    console.log('[Orchestrator] Cannot sync copy: missing sequence_id or smartlead_lead_id')
    return
  }

  try {
    // Get the sequence to access conditional copies
    const sequence = await getSequence(state.sequence_id)
    if (!sequence || !sequence.email_steps) {
      console.log('[Orchestrator] Cannot sync copy: sequence not found')
      return
    }

    // Get lead email from database
    const { data: lead } = await supabase
      .from('leads')
      .select('email')
      .eq('id', leadId)
      .single()

    if (!lead?.email) {
      console.log('[Orchestrator] Cannot sync copy: lead email not found')
      return
    }

    // Get the SmartLead campaign ID from environment or sequence
    const campaignId = process.env.SMARTLEAD_MULTICHANNEL_CAMPAIGN_ID
      ? parseInt(process.env.SMARTLEAD_MULTICHANNEL_CAMPAIGN_ID)
      : null

    if (!campaignId) {
      console.log('[Orchestrator] Cannot sync copy: SMARTLEAD_MULTICHANNEL_CAMPAIGN_ID not set')
      return
    }

    // Update SmartLead custom fields with conditional copy
    await smartlead.updateLeadCopyForState(
      campaignId,
      lead.email,
      { email_steps: sequence.email_steps },
      {
        linkedin_connected: state.linkedin_connected || eventType === 'linkedin_connected',
        linkedin_replied: state.linkedin_replied || eventType === 'linkedin_replied',
        email_step_current: state.email_step_current,
      }
    )

    console.log(`[Orchestrator] Synced conditional copy to SmartLead for ${lead.email} (${eventType})`)

    // Log the copy sync event
    await logOrchestrationEvent({
      lead_id: leadId,
      tenant_id: state.tenant_id,
      sequence_id: state.sequence_id,
      event_type: 'cross_channel_trigger',
      channel: 'orchestrator',
      event_data: {
        action: 'conditional_copy_sync',
        trigger: eventType,
        emails_updated: sequence.email_steps
          .filter(s => s.step_number > state.email_step_current)
          .map(s => s.step_number),
      },
    })
  } catch (error) {
    console.error('[Orchestrator] Error syncing conditional copy:', error)
  }
}

/**
 * Handle cross-channel signal that requires copy update
 */
export async function handleCrossChannelSignal(
  leadId: string,
  eventType: OrchestrationEventType
): Promise<void> {
  // Check if this event should trigger a copy sync
  if (eventType !== 'linkedin_connected' && eventType !== 'linkedin_replied') {
    return
  }

  const state = await getOrchestrationState(leadId)
  if (!state) {
    console.error('[Orchestrator] Cannot handle cross-channel signal: no state found')
    return
  }

  await syncConditionalCopyToSmartlead(leadId, state, eventType as 'linkedin_connected' | 'linkedin_replied')
}
