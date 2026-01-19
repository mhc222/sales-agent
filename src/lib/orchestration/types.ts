/**
 * Multi-Channel Orchestration Types
 * Defines the structure for coordinated email + LinkedIn outreach
 */

// ============================================================================
// CAMPAIGN MODES
// ============================================================================

export type CampaignMode = 'email_only' | 'linkedin_only' | 'multi_channel'

export type OrchestrationStatus =
  | 'pending'     // Not started
  | 'active'      // In progress
  | 'paused'      // Manually paused
  | 'waiting'     // Waiting for cross-channel signal
  | 'completed'   // All steps done
  | 'stopped'     // Stopped due to reply/negative
  | 'converted'   // Meeting booked / positive outcome

// ============================================================================
// SEQUENCE STEPS
// ============================================================================

export interface EmailStep {
  step_number: number
  day: number                    // Day in sequence (1, 3, 5, etc.)
  type: 'initial' | 'value_add' | 'bump' | 'case_study' | 'referral' | 'pattern_interrupt'
  subject: string
  body: string
  body_linkedin_connected?: string   // Alternative copy if LinkedIn connected
  body_linkedin_replied?: string     // Alternative copy if LinkedIn replied
  word_count: number
  internal_notes?: string

  // Cross-channel coordination
  wait_for_linkedin?: {
    event: 'connection' | 'message_sent'
    timeout_hours: number          // How long to wait before proceeding anyway
  }
  trigger_linkedin?: {
    action: 'connection_request' | 'send_message' | 'view_profile' | 'like_post'
    step_number: number            // Which LinkedIn step to trigger
  }
}

export interface LinkedInStep {
  step_number: number
  day: number
  type: 'connection_request' | 'message' | 'view_profile' | 'follow' | 'like_post' | 'inmail'

  // For messages
  body?: string
  body_fallback?: string          // Generic fallback (no personalization) for HeyReach
  body_email_opened?: string      // Alternative if they've opened emails
  body_email_replied?: string     // Alternative if they've replied to email
  framework?: string              // Which framework was used

  // For connection requests
  connection_note?: string        // Optional note with connection request
  connection_note_fallback?: string  // Generic fallback note for HeyReach

  internal_notes?: string

  // Cross-channel coordination
  requires_connection?: boolean   // Must be connected first
  wait_for_email?: {
    event: 'sent' | 'opened' | 'clicked'
    timeout_hours: number
  }
  trigger_email?: {
    action: 'send_next' | 'pause' | 'resume'
  }
}

// ============================================================================
// MULTI-CHANNEL SEQUENCE
// ============================================================================

export interface MultiChannelSequence {
  id?: string
  lead_id: string
  tenant_id: string

  // Mode
  campaign_mode: CampaignMode

  // Steps
  email_steps: EmailStep[]
  linkedin_steps: LinkedInStep[]

  // Unified timeline (for reference)
  timeline: TimelineEntry[]

  // Strategy
  sequence_strategy: SequenceStrategy

  // Platform IDs (set after deployment)
  smartlead_campaign_id?: string
  heyreach_campaign_id?: string

  // Status
  status: OrchestrationStatus

  // Metadata
  created_at?: string
  activated_at?: string
}

export interface TimelineEntry {
  day: number
  channel: 'email' | 'linkedin'
  step_number: number
  type: string
  description: string
  depends_on?: {
    channel: 'email' | 'linkedin'
    event: string
  }
}

export interface SequenceStrategy {
  primary_angle: string
  personalization_hooks: string[]
  tone: 'formal' | 'conversational' | 'casual'

  // Cross-channel strategy
  linkedin_first: boolean           // Start with LinkedIn or email?
  wait_for_connection: boolean      // Wait for LinkedIn connection before emails?
  connection_timeout_hours: number  // How long to wait

  // Triggers
  cross_channel_triggers: CrossChannelTrigger[]
}

export interface CrossChannelTrigger {
  name: string
  source_channel: 'email' | 'linkedin'
  source_event: string
  source_conditions?: Record<string, unknown>  // Conditions on the source event
  target_channel: 'email' | 'linkedin' | 'orchestrator'
  target_action: string
  target_params?: Record<string, unknown>  // Parameters for the target action
  conditions?: Record<string, unknown>
}

// ============================================================================
// ORCHESTRATION STATE
// ============================================================================

export interface OrchestrationState {
  id: string
  lead_id: string
  tenant_id: string
  sequence_id?: string

  // Mode
  campaign_mode: CampaignMode

  // Position
  email_step_current: number
  email_step_total: number
  linkedin_step_current: number
  linkedin_step_total: number

  // Email channel
  email_started: boolean
  email_paused: boolean
  email_completed: boolean
  last_email_sent_at?: string
  next_email_scheduled_at?: string

  // LinkedIn channel
  linkedin_started: boolean
  linkedin_paused: boolean
  linkedin_completed: boolean
  last_linkedin_action_at?: string
  next_linkedin_scheduled_at?: string

  // Cross-channel signals
  linkedin_connected: boolean
  linkedin_connected_at?: string
  linkedin_replied: boolean
  linkedin_replied_at?: string
  linkedin_reply_sentiment?: 'positive' | 'negative' | 'neutral'

  email_opened: boolean
  email_opened_count: number
  email_clicked: boolean
  email_replied: boolean
  email_replied_at?: string
  email_reply_sentiment?: 'positive' | 'negative' | 'neutral'

  // Control
  status: OrchestrationStatus
  waiting_for?: string
  waiting_since?: string
  waiting_timeout_at?: string

  // Stop info
  stop_reason?: string
  stop_details?: Record<string, unknown>

  // Platform IDs
  smartlead_lead_id?: string
  heyreach_lead_id?: string

  // Timestamps
  created_at: string
  updated_at: string
}

// ============================================================================
// ORCHESTRATION EVENTS
// ============================================================================

export type OrchestrationEventType =
  // Sequence lifecycle
  | 'sequence_started'
  | 'sequence_completed'
  | 'sequence_stopped'
  | 'sequence_paused'
  | 'sequence_resumed'

  // Email events
  | 'email_scheduled'
  | 'email_sent'
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'email_bounced'

  // LinkedIn events
  | 'linkedin_connection_sent'
  | 'linkedin_connected'
  | 'linkedin_message_sent'
  | 'linkedin_replied'
  | 'linkedin_inmail_sent'
  | 'linkedin_inmail_replied'
  | 'linkedin_profile_viewed'
  | 'linkedin_follow_sent'
  | 'linkedin_post_liked'
  | 'linkedin_campaign_completed'
  | 'linkedin_tag_updated'

  // Orchestration events
  | 'waiting_started'
  | 'waiting_completed'
  | 'waiting_timeout'
  | 'cross_channel_trigger'
  | 'channel_paused'
  | 'channel_resumed'
  | 'decision_made'

export interface OrchestrationEvent {
  id?: string
  lead_id: string
  tenant_id: string
  sequence_id?: string

  event_type: OrchestrationEventType
  channel: 'email' | 'linkedin' | 'orchestrator'
  step_number?: number

  event_data?: Record<string, unknown>

  // Decision (if any)
  decision?: string
  decision_reason?: string

  created_at?: string
}

// ============================================================================
// ORCHESTRATOR ACTIONS
// ============================================================================

export interface OrchestratorAction {
  action: 'send_email' | 'send_linkedin' | 'pause' | 'resume' | 'stop' | 'wait' | 'alert'
  channel?: 'email' | 'linkedin'
  step_number?: number
  params?: Record<string, unknown>
  reason: string
}

export interface OrchestratorDecision {
  lead_id: string
  current_state: OrchestrationState
  event: OrchestrationEvent
  actions: OrchestratorAction[]
  next_state_updates: Partial<OrchestrationState>
}

// ============================================================================
// SEQUENCE GENERATION INPUT
// ============================================================================

export interface MultiChannelSequenceInput {
  lead_id: string
  tenant_id: string
  campaign_mode: CampaignMode

  // Context for generation
  context_profile: Record<string, unknown>
  research?: Record<string, unknown>

  // Preferences
  email_count?: number       // Default: 7
  linkedin_count?: number    // Default: 4
  total_days?: number        // Default: 21

  // Strategy overrides
  linkedin_first?: boolean
  wait_for_connection?: boolean
  aggressive?: boolean       // More touches, shorter delays
}

// ============================================================================
// DEPLOYMENT
// ============================================================================

export interface DeploymentResult {
  success: boolean
  sequence_id: string

  // Platform results
  smartlead?: {
    success: boolean
    campaign_id?: string
    lead_id?: string
    error?: string
  }
  heyreach?: {
    success: boolean
    campaign_id?: string
    lead_id?: string
    error?: string
  }

  // Orchestration state created
  orchestration_state_id?: string

  error?: string
}
