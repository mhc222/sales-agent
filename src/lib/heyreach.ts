/**
 * HeyReach API Client
 * LinkedIn automation for connection requests and messaging sequences
 *
 * API Reference: https://documenter.getpostman.com/view/23808049/2sA2xb5F75
 * Authentication: X-API-Key header
 */

const HEYREACH_BASE_URL = 'https://api.heyreach.io/api/v1'

// ============================================================================
// TYPES
// ============================================================================

export interface HeyReachConfig {
  apiKey: string
}

export interface LinkedInLead {
  linkedinUrl: string
  firstName?: string
  lastName?: string
  companyName?: string
  jobTitle?: string
  email?: string
  customFields?: Record<string, string>
}

export interface Campaign {
  id: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'COMPLETED'
  totalLeads?: number
  contacted?: number
  replied?: number
  connected?: number
  responseRate?: number
  connectionRate?: number
  createdAt?: string
}

export interface CampaignDetails extends Campaign {
  senders?: Array<{
    id: string
    linkedinAccountId: string
    status: string
  }>
}

export interface CampaignStats {
  campaignId: string
  totalLeads: number
  contacted: number
  replied: number
  connected: number
  responseRate: number
  connectionRate: number
}

export interface LeadDetails {
  id: string
  linkedinUrl: string
  firstName: string
  lastName: string
  companyName?: string
  jobTitle?: string
  status: string
  connectionStatus?: string
  messages?: Array<{
    text: string
    direction: 'inbound' | 'outbound'
    timestamp: string
  }>
}

export interface Conversation {
  conversationId: string
  leadId: string
  leadName: string
  linkedinUrl: string
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}

export interface AddLeadParams {
  campaignId: string
  linkedinUrl: string
  firstName?: string
  lastName?: string
  companyName?: string
  jobTitle?: string
  email?: string
  senderId?: string
  customFields?: Record<string, string>
}

export interface SendMessageParams {
  campaignId: string
  leadId: string
  message: string
}

// ============================================================================
// API REQUEST HELPER
// ============================================================================

async function heyreachRequest<T>(
  config: HeyReachConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${HEYREACH_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HeyReach API error (${response.status}): ${errorText}`)
  }

  // Handle empty responses
  const text = await response.text()
  if (!text) return {} as T

  return JSON.parse(text)
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Validate API key by fetching campaigns
 */
export async function validateApiKey(config: HeyReachConfig): Promise<boolean> {
  try {
    await getCampaigns(config)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// CAMPAIGNS
// ============================================================================

/**
 * Get all campaigns
 */
export async function getCampaigns(
  config: HeyReachConfig,
  page = 0,
  limit = 100
): Promise<Campaign[]> {
  const response = await heyreachRequest<{ items?: Campaign[]; data?: Campaign[] }>(
    config,
    `/campaigns?page=${page}&limit=${limit}`
  )
  return response.items || response.data || []
}

/**
 * Get active campaigns (ready for adding leads)
 */
export async function getActiveCampaigns(config: HeyReachConfig): Promise<Campaign[]> {
  const campaigns = await getCampaigns(config)
  return campaigns.filter((c) => c.status === 'ACTIVE')
}

/**
 * Get campaign details including senders
 */
export async function getCampaignDetails(
  config: HeyReachConfig,
  campaignId: string
): Promise<CampaignDetails | null> {
  try {
    return await heyreachRequest<CampaignDetails>(config, `/campaigns/${campaignId}`)
  } catch {
    return null
  }
}

/**
 * Get campaign statistics
 */
export async function getCampaignStats(
  config: HeyReachConfig,
  campaignId: string
): Promise<CampaignStats> {
  const details = await getCampaignDetails(config, campaignId)
  return {
    campaignId,
    totalLeads: details?.totalLeads || 0,
    contacted: details?.contacted || 0,
    replied: details?.replied || 0,
    connected: details?.connected || 0,
    responseRate: details?.responseRate || 0,
    connectionRate: details?.connectionRate || 0,
  }
}

/**
 * Toggle campaign status (pause/resume)
 */
export async function toggleCampaignStatus(
  config: HeyReachConfig,
  campaignId: string,
  status: 'ACTIVE' | 'PAUSED'
): Promise<void> {
  await heyreachRequest(config, `/campaigns/${campaignId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

// ============================================================================
// LEADS
// ============================================================================

/**
 * Add a lead to a campaign
 * The campaign must be ACTIVE with at least one LinkedIn sender
 */
export async function addLeadToCampaign(
  config: HeyReachConfig,
  params: AddLeadParams
): Promise<{ success: boolean; leadId?: string; error?: string }> {
  try {
    const response = await heyreachRequest<{ id?: string; leadId?: string }>(
      config,
      `/campaigns/${params.campaignId}/leads`,
      {
        method: 'POST',
        body: JSON.stringify({
          linkedinUrl: params.linkedinUrl,
          firstName: params.firstName,
          lastName: params.lastName,
          companyName: params.companyName,
          jobTitle: params.jobTitle,
          email: params.email,
          senderId: params.senderId,
          customFields: params.customFields,
        }),
      }
    )
    return { success: true, leadId: response.id || response.leadId }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to add lead',
    }
  }
}

/**
 * Add multiple leads to a campaign in bulk
 */
export async function addLeadsToCampaign(
  config: HeyReachConfig,
  campaignId: string,
  leads: LinkedInLead[],
  senderId?: string
): Promise<{ success: boolean; added: number; errors: string[] }> {
  const errors: string[] = []
  let added = 0

  for (const lead of leads) {
    const result = await addLeadToCampaign(config, {
      campaignId,
      linkedinUrl: lead.linkedinUrl,
      firstName: lead.firstName,
      lastName: lead.lastName,
      companyName: lead.companyName,
      jobTitle: lead.jobTitle,
      email: lead.email,
      senderId,
      customFields: lead.customFields,
    })

    if (result.success) {
      added++
    } else {
      errors.push(`${lead.linkedinUrl}: ${result.error}`)
    }
  }

  return { success: errors.length === 0, added, errors }
}

/**
 * Get lead details by LinkedIn URL
 */
export async function getLeadDetails(
  config: HeyReachConfig,
  linkedinUrl: string
): Promise<LeadDetails | null> {
  try {
    return await heyreachRequest<LeadDetails>(
      config,
      `/leads?linkedinUrl=${encodeURIComponent(linkedinUrl)}`
    )
  } catch {
    return null
  }
}

/**
 * Get leads from a campaign
 */
export async function getCampaignLeads(
  config: HeyReachConfig,
  campaignId: string,
  page = 0,
  limit = 100
): Promise<LeadDetails[]> {
  const response = await heyreachRequest<{ items?: LeadDetails[]; data?: LeadDetails[] }>(
    config,
    `/campaigns/${campaignId}/leads?page=${page}&limit=${limit}`
  )
  return response.items || response.data || []
}

// ============================================================================
// CONVERSATIONS / INBOX
// ============================================================================

/**
 * Get LinkedIn conversations with filtering
 */
export async function getConversations(
  config: HeyReachConfig,
  filters?: {
    campaignId?: string
    unreadOnly?: boolean
    page?: number
    limit?: number
  }
): Promise<Conversation[]> {
  const params = new URLSearchParams()
  if (filters?.campaignId) params.set('campaignId', filters.campaignId)
  if (filters?.unreadOnly) params.set('unreadOnly', 'true')
  if (filters?.page) params.set('page', filters.page.toString())
  if (filters?.limit) params.set('limit', filters.limit.toString())

  const queryString = params.toString()
  const endpoint = `/conversations${queryString ? `?${queryString}` : ''}`

  const response = await heyreachRequest<{ items?: Conversation[]; data?: Conversation[] }>(
    config,
    endpoint
  )
  return response.items || response.data || []
}

/**
 * Send a message to a lead
 */
export async function sendMessage(
  config: HeyReachConfig,
  params: SendMessageParams
): Promise<{ success: boolean; error?: string }> {
  try {
    await heyreachRequest(config, `/campaigns/${params.campaignId}/leads/${params.leadId}/message`, {
      method: 'POST',
      body: JSON.stringify({ message: params.message }),
    })
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send message',
    }
  }
}

// ============================================================================
// LISTS
// ============================================================================

/**
 * Get all lists
 */
export async function getLists(
  config: HeyReachConfig,
  page = 0,
  limit = 100
): Promise<Array<{ id: string; name: string; count: number }>> {
  const response = await heyreachRequest<{ items?: Array<{ id: string; name: string; count: number }> }>(
    config,
    `/lists?page=${page}&limit=${limit}`
  )
  return response.items || []
}

/**
 * Create an empty list
 */
export async function createList(
  config: HeyReachConfig,
  name: string,
  type: 'lead' | 'company' = 'lead'
): Promise<{ id: string }> {
  return await heyreachRequest<{ id: string }>(config, '/lists', {
    method: 'POST',
    body: JSON.stringify({ name, type }),
  })
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get overall stats across all campaigns
 */
export async function getOverallStats(config: HeyReachConfig): Promise<{
  totalLeads: number
  totalContacted: number
  totalReplied: number
  totalConnected: number
  averageResponseRate: number
  averageConnectionRate: number
}> {
  return await heyreachRequest(config, '/stats/overall')
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a lead for HeyReach delivery
 * Used by the delivery router
 */
export function formatLeadForHeyReach(lead: {
  linkedin_url?: string
  first_name?: string
  last_name?: string
  company_name?: string
  job_title?: string
  email?: string
}): LinkedInLead | null {
  if (!lead.linkedin_url) return null

  return {
    linkedinUrl: lead.linkedin_url,
    firstName: lead.first_name,
    lastName: lead.last_name,
    companyName: lead.company_name,
    jobTitle: lead.job_title,
    email: lead.email,
  }
}

// ============================================================================
// MULTI-CHANNEL CAMPAIGN SUPPORT
// ============================================================================

// Default fallback messages when AI-generated content is not available
// These reference the email channel since this is multi-channel outreach
const DEFAULT_FALLBACKS = {
  connection_note: "Hey - sent you an email recently, thought I'd connect here too.",
  linkedin_message_1: "Thanks for connecting! Wanted to follow up on the email I sent - did it land?",
  linkedin_message_2: "Hey - circling back on my email. Easier to chat here if you prefer LinkedIn.",
  linkedin_message_3: "Last note - sent a few emails your way. If LinkedIn works better, happy to chat here instead.",
}

/**
 * Format a multi-channel LinkedIn sequence into HeyReach custom fields
 * The AI writing agent generates the content, we just pass it to HeyReach as variables
 *
 * HeyReach campaign template uses: {{connection_note}}, {{linkedin_message_1}}, etc.
 * Each field also has a _fallback version for when the variable is empty
 */
export function formatLinkedInSequenceAsCustomFields(sequence: {
  linkedin_steps: Array<{
    step_number: number
    type: 'connection_request' | 'message' | 'view_profile' | 'follow' | 'like_post' | 'inmail'
    body?: string
    body_fallback?: string
    connection_note?: string
    connection_note_fallback?: string
    body_email_opened?: string
    body_email_replied?: string
  }>
}): Record<string, string> {
  const fields: Record<string, string> = {}

  let messageCount = 0

  for (const step of sequence.linkedin_steps) {
    if (step.type === 'connection_request') {
      // Always populate connection_note - use AI content, AI fallback, or our default
      // HeyReach fallback field must be static text in the UI, not a variable
      fields.connection_note = step.connection_note || step.connection_note_fallback || DEFAULT_FALLBACKS.connection_note
    } else if (step.type === 'message' && step.body) {
      messageCount++
      fields[`linkedin_message_${messageCount}`] = step.body

      // Store fallback for HeyReach (uses AI fallback or our default)
      const defaultFallback = DEFAULT_FALLBACKS[`linkedin_message_${messageCount}` as keyof typeof DEFAULT_FALLBACKS] || DEFAULT_FALLBACKS.linkedin_message_3
      fields[`linkedin_message_${messageCount}_fallback`] = step.body_fallback || defaultFallback

      // Store conditional copies if they exist
      if (step.body_email_opened) {
        fields[`linkedin_message_${messageCount}_email_opened`] = step.body_email_opened
      }
      if (step.body_email_replied) {
        fields[`linkedin_message_${messageCount}_email_replied`] = step.body_email_replied
      }
    } else if (step.type === 'inmail' && step.body) {
      fields[`inmail_${step.step_number}`] = step.body
    }
  }

  return fields
}

/**
 * Deploy a lead to the multi-channel HeyReach campaign
 * Combines adding lead + setting up custom fields with AI-generated content
 */
export async function deployLeadToMultiChannelCampaign(
  config: HeyReachConfig,
  campaignId: string,
  lead: {
    linkedin_url: string
    first_name?: string
    last_name?: string
    company_name?: string
    job_title?: string
    email?: string
  },
  sequence: {
    linkedin_steps: Array<{
      step_number: number
      type: 'connection_request' | 'message' | 'view_profile' | 'follow' | 'like_post' | 'inmail'
      body?: string
      body_fallback?: string
      connection_note?: string
      connection_note_fallback?: string
      body_email_opened?: string
      body_email_replied?: string
    }>
  },
  senderId?: string
): Promise<{ success: boolean; leadId?: string; error?: string }> {
  // Format sequence into custom fields
  const customFields = formatLinkedInSequenceAsCustomFields(sequence)

  console.log(`[HeyReach] Deploying lead ${lead.linkedin_url} with ${Object.keys(customFields).length} custom fields`)

  return addLeadToCampaign(config, {
    campaignId,
    linkedinUrl: lead.linkedin_url,
    firstName: lead.first_name,
    lastName: lead.last_name,
    companyName: lead.company_name,
    jobTitle: lead.job_title,
    email: lead.email,
    senderId,
    customFields,
  })
}

/**
 * Update lead custom fields for conditional copy
 * Called when email engagement signals should change LinkedIn messaging
 */
export async function updateLeadCustomFieldsForState(
  config: HeyReachConfig,
  campaignId: string,
  leadLinkedInUrl: string,
  sequence: {
    linkedin_steps: Array<{
      step_number: number
      type: string
      body?: string
      body_fallback?: string
      body_email_opened?: string
      body_email_replied?: string
    }>
  },
  state: {
    email_opened?: boolean
    email_replied?: boolean
    linkedin_step_current: number
  }
): Promise<void> {
  const updates: Record<string, string> = {}

  let messageCount = 0
  for (const step of sequence.linkedin_steps) {
    if (step.type === 'message' && step.body) {
      messageCount++

      // Skip messages already sent
      if (step.step_number <= state.linkedin_step_current) {
        continue
      }

      // Select appropriate copy based on email state
      let body = step.body
      if (state.email_replied && step.body_email_replied) {
        body = step.body_email_replied
      } else if (state.email_opened && step.body_email_opened) {
        body = step.body_email_opened
      }

      updates[`linkedin_message_${messageCount}`] = body
    }
  }

  if (Object.keys(updates).length > 0) {
    // HeyReach doesn't have a direct "update custom fields" API
    // The custom fields are set when the lead is added
    // For conditional copy, we'd need to use tags or manual intervention
    console.log(`[HeyReach] Would update ${Object.keys(updates).length} custom fields for ${leadLinkedInUrl}`)
    console.log(`[HeyReach] Note: HeyReach doesn't support updating custom fields after lead is added`)
    // TODO: Explore alternative approaches (tags, separate campaigns, etc.)
  }
}
