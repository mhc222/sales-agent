/**
 * Nureply API Client
 * Handles email campaigns, leads, and engagement tracking
 *
 * Similar to Smartlead - uses template campaigns with dynamic variables
 * Key difference: No webhooks, must poll for replies
 */

const NUREPLY_BASE_URL = 'https://api.nureply.com/v3/user-api'

// ============================================================================
// TYPES
// ============================================================================

export interface NureplyConfig {
  apiKey: string
}

export interface NureplyUser {
  id: string
  email: string
  name: string
}

export interface NureplyCredits {
  available: number
  used: number
}

export interface EmailAccount {
  id: string
  email: string
  provider: string
  status: string
  warmupEnabled: boolean
  dailySendLimit: number
}

export interface LeadList {
  id: string
  name: string
  leadCount: number
  createdAt: string
  updatedAt: string
}

export interface NureplyLead {
  email: string
  first_name?: string
  last_name?: string
  company_name?: string
  linkedin_url?: string
  phone?: string
  other_variables?: Record<string, string>
}

export interface Campaign {
  id: string
  name: string
  status: string
  sequences?: CampaignSequence[]
  leadListId?: string
  createdAt: string
}

export interface CampaignSequence {
  seq_number: number
  subject: string
  email_body: string
  delay_in_days: number
}

export interface CreateCampaignParams {
  name: string
  sequences?: Array<{
    subject: string
    body: string
    delay_days: number
  }>
  leadListId?: string
  emailAccountIds?: string[]
  emailDeliveryOptimization?: {
    dailyLimit?: number
    timezone?: string
    sendDays?: string[]
    sendHours?: { start: number; end: number }
  }
}

export interface ReceivedReply {
  id: string
  leadEmail: string
  leadId: string
  campaignId: string
  sequenceNumber: number
  subject: string
  body: string
  receivedAt: string
}

export interface ReplyFilters {
  campaignId?: string
  since?: Date
  page?: number
  limit?: number
}

export interface DNCEntry {
  email?: string
  domain?: string
}

export interface BulkLeadResult {
  success: boolean
  created: number
  duplicates: number
  errors: string[]
}

// ============================================================================
// API REQUEST HELPER
// ============================================================================

async function nureplyRequest<T>(
  config: NureplyConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${NUREPLY_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Nureply API error (${response.status}): ${errorText}`)
  }

  return response.json()
}

// ============================================================================
// AUTHENTICATION & USER
// ============================================================================

/**
 * Validate API key and get user info
 */
export async function validateApiKey(config: NureplyConfig): Promise<{ user: NureplyUser }> {
  const response = await nureplyRequest<{ data: NureplyUser }>(config, '/validate')
  return { user: response.data }
}

/**
 * Get available credits
 */
export async function getCredits(config: NureplyConfig): Promise<NureplyCredits> {
  const response = await nureplyRequest<{ data: NureplyCredits }>(config, '/credits')
  return response.data
}

// ============================================================================
// EMAIL ACCOUNTS
// ============================================================================

/**
 * List all connected email accounts
 */
export async function getEmailAccounts(config: NureplyConfig): Promise<EmailAccount[]> {
  const response = await nureplyRequest<{ data: EmailAccount[] }>(config, '/accounts')
  return response.data || []
}

/**
 * Get a specific email account
 */
export async function getEmailAccount(config: NureplyConfig, accountId: string): Promise<EmailAccount> {
  const response = await nureplyRequest<{ data: EmailAccount }>(config, `/accounts/${accountId}`)
  return response.data
}

/**
 * Test email delivery for an account
 */
export async function testDelivery(config: NureplyConfig, accountId: string): Promise<void> {
  await nureplyRequest(config, `/accounts/${accountId}/test-delivery`, {
    method: 'POST',
  })
}

// ============================================================================
// WARMUP
// ============================================================================

/**
 * Start warmup for an email account
 */
export async function startWarmup(config: NureplyConfig, accountId: string): Promise<void> {
  await nureplyRequest(config, '/warmup/start', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  })
}

/**
 * Stop warmup for an email account
 */
export async function stopWarmup(config: NureplyConfig, accountId: string): Promise<void> {
  await nureplyRequest(config, '/warmup/stop', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  })
}

/**
 * Get warmup statistics for all accounts
 */
export async function getWarmupStats(config: NureplyConfig): Promise<Record<string, unknown>[]> {
  const response = await nureplyRequest<{ data: Record<string, unknown>[] }>(config, '/warmup/stats')
  return response.data || []
}

// ============================================================================
// LEAD LISTS
// ============================================================================

/**
 * Create a new lead list
 */
export async function createLeadList(
  config: NureplyConfig,
  name: string
): Promise<{ id: string }> {
  const response = await nureplyRequest<{ data: { id: string } }>(config, '/leadlists', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return response.data
}

/**
 * Get all lead lists
 */
export async function getLeadLists(config: NureplyConfig): Promise<LeadList[]> {
  const response = await nureplyRequest<{ data: LeadList[] }>(config, '/leadlists')
  return response.data || []
}

/**
 * Get a specific lead list
 */
export async function getLeadList(config: NureplyConfig, listId: string): Promise<LeadList> {
  const response = await nureplyRequest<{ data: LeadList }>(config, `/leadlists/${listId}`)
  return response.data
}

/**
 * Delete a lead list
 */
export async function deleteLeadList(config: NureplyConfig, listId: string): Promise<void> {
  await nureplyRequest(config, `/leadlists/${listId}`, {
    method: 'DELETE',
  })
}

// ============================================================================
// LEADS
// ============================================================================

/**
 * Add leads to a lead list in bulk
 */
export async function addLeadsToList(
  config: NureplyConfig,
  leadListId: string,
  leads: NureplyLead[]
): Promise<BulkLeadResult> {
  const response = await nureplyRequest<{ data: BulkLeadResult }>(config, '/leads', {
    method: 'POST',
    body: JSON.stringify({
      leadListId,
      leads: leads.map(lead => ({
        email: lead.email,
        firstName: lead.first_name,
        lastName: lead.last_name,
        companyName: lead.company_name,
        linkedinUrl: lead.linkedin_url,
        phone: lead.phone,
        otherVariables: lead.other_variables,
      })),
    }),
  })
  return response.data
}

/**
 * Get leads from a lead list
 */
export async function getLeads(
  config: NureplyConfig,
  leadListId: string,
  page = 1,
  limit = 100
): Promise<NureplyLead[]> {
  const response = await nureplyRequest<{ data: NureplyLead[] }>(
    config,
    `/leads/${leadListId}?page=${page}&limit=${limit}`
  )
  return response.data || []
}

/**
 * Update a lead
 */
export async function updateLead(
  config: NureplyConfig,
  leadId: string,
  updates: Partial<NureplyLead>
): Promise<void> {
  await nureplyRequest(config, `/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

/**
 * Delete a lead
 */
export async function deleteLead(config: NureplyConfig, leadId: string): Promise<void> {
  await nureplyRequest(config, `/leads/${leadId}`, {
    method: 'DELETE',
  })
}

// ============================================================================
// CAMPAIGNS
// ============================================================================

/**
 * Create a new campaign
 */
export async function createCampaign(
  config: NureplyConfig,
  params: CreateCampaignParams
): Promise<{ id: string }> {
  const payload: Record<string, unknown> = {
    name: params.name,
  }

  if (params.sequences) {
    payload.sequences = params.sequences.map((seq, i) => ({
      seqNumber: i + 1,
      subject: seq.subject,
      emailBody: seq.body,
      delayInDays: seq.delay_days,
    }))
  }

  if (params.leadListId) {
    payload.leadListId = params.leadListId
  }

  if (params.emailAccountIds) {
    payload.emailAccountIds = params.emailAccountIds
  }

  if (params.emailDeliveryOptimization) {
    payload.emailDeliveryOptimization = params.emailDeliveryOptimization
  }

  const response = await nureplyRequest<{ data: { id: string } }>(config, '/mail-campaigns', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return response.data
}

/**
 * Get all campaigns
 */
export async function getCampaigns(config: NureplyConfig): Promise<Campaign[]> {
  const response = await nureplyRequest<{ data: Campaign[] }>(config, '/mail-campaigns')
  return response.data || []
}

/**
 * Get a specific campaign
 */
export async function getCampaign(config: NureplyConfig, campaignId: string): Promise<Campaign> {
  const response = await nureplyRequest<{ data: Campaign }>(config, `/mail-campaigns/${campaignId}`)
  return response.data
}

/**
 * Update a campaign
 */
export async function updateCampaign(
  config: NureplyConfig,
  campaignId: string,
  updates: Partial<CreateCampaignParams>
): Promise<Campaign> {
  const response = await nureplyRequest<{ data: Campaign }>(config, `/mail-campaigns/${campaignId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return response.data
}

/**
 * Delete a campaign
 */
export async function deleteCampaign(config: NureplyConfig, campaignId: string): Promise<void> {
  await nureplyRequest(config, `/mail-campaigns/${campaignId}`, {
    method: 'DELETE',
  })
}

/**
 * Create a template campaign with dynamic variables (like Smartlead)
 * Uses {{variable}} syntax for per-lead customization
 */
export async function createTemplateCampaign(
  config: NureplyConfig,
  name: string = 'Sales Agent Dynamic Sequence'
): Promise<string> {
  // Create campaign with 7 email sequences using dynamic variables
  const sequences = [
    { subject: '{{thread_1_subject}}', body: '{{email_1_body}}', delay_days: 0 },
    { subject: 'Re: {{thread_1_subject}}', body: '{{email_2_body}}', delay_days: 2 },
    { subject: 'Re: {{thread_1_subject}}', body: '{{email_3_body}}', delay_days: 2 },
    { subject: '{{thread_2_subject}}', body: '{{email_4_body}}', delay_days: 7 },
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_5_body}}', delay_days: 3 },
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_6_body}}', delay_days: 3 },
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_7_body}}', delay_days: 3 },
  ]

  const campaign = await createCampaign(config, {
    name,
    sequences,
  })

  console.log(`[Nureply] Created template campaign: ${campaign.id} - ${name}`)
  return campaign.id
}

/**
 * Format an email sequence into Nureply custom fields
 * Same format as Smartlead for consistency
 */
export function formatSequenceAsCustomFields(sequence: {
  thread_1: { subject: string; emails: Array<{ body: string }> }
  thread_2: { subject: string; emails: Array<{ body: string }> }
}): Record<string, string> {
  const fields: Record<string, string> = {
    thread_1_subject: sequence.thread_1.subject,
    thread_2_subject: sequence.thread_2.subject,
  }

  // Thread 1: emails 1-3
  sequence.thread_1.emails.forEach((email, i) => {
    fields[`email_${i + 1}_body`] = email.body
  })

  // Thread 2: emails 4-7
  sequence.thread_2.emails.forEach((email, i) => {
    fields[`email_${i + 4}_body`] = email.body
  })

  return fields
}

// ============================================================================
// DO NOT CONTACT (DNC)
// ============================================================================

/**
 * Check if an email is on the DNC list
 */
export async function checkDNC(
  config: NureplyConfig,
  email: string
): Promise<{ blocked: boolean }> {
  const response = await nureplyRequest<{ data: { blocked: boolean } }>(
    config,
    '/do-not-contacts/check',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    }
  )
  return response.data
}

/**
 * Add entries to the DNC list
 */
export async function addToDNC(config: NureplyConfig, entries: DNCEntry[]): Promise<void> {
  await nureplyRequest(config, '/do-not-contacts', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  })
}

/**
 * Get DNC list
 */
export async function getDNCList(
  config: NureplyConfig,
  page = 1,
  limit = 100
): Promise<DNCEntry[]> {
  const response = await nureplyRequest<{ data: DNCEntry[] }>(
    config,
    `/do-not-contacts?page=${page}&limit=${limit}`
  )
  return response.data || []
}

/**
 * Delete a DNC entry
 */
export async function deleteDNCEntry(config: NureplyConfig, entryId: string): Promise<void> {
  await nureplyRequest(config, `/do-not-contacts/${entryId}`, {
    method: 'DELETE',
  })
}

// ============================================================================
// RECEIVED REPLIES (Polling - No Webhooks)
// ============================================================================

/**
 * Get received replies with filters
 * This is used for polling since Nureply doesn't support webhooks
 */
export async function getReceivedReplies(
  config: NureplyConfig,
  filters: ReplyFilters = {}
): Promise<ReceivedReply[]> {
  const params = new URLSearchParams()

  if (filters.campaignId) params.set('campaignId', filters.campaignId)
  if (filters.since) params.set('since', filters.since.toISOString())
  if (filters.page) params.set('page', filters.page.toString())
  if (filters.limit) params.set('limit', filters.limit.toString())

  const queryString = params.toString()
  const endpoint = `/receivedreplies/filter${queryString ? `?${queryString}` : ''}`

  const response = await nureplyRequest<{ data: ReceivedReply[] }>(config, endpoint)
  return response.data || []
}

// ============================================================================
// PERSONALIZATION (Optional - we use Claude instead)
// ============================================================================

/**
 * Generate AI personalization from a URL
 * Note: We typically use Claude for personalization instead
 */
export async function generatePersonalization(
  config: NureplyConfig,
  url: string
): Promise<{ personalization: string }> {
  const response = await nureplyRequest<{ data: { personalization: string } }>(
    config,
    '/personalization/generate',
    {
      method: 'POST',
      body: JSON.stringify({ url }),
    }
  )
  return response.data
}
