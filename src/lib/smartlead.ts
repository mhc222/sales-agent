/**
 * Smartlead API Client
 * Handles adding leads to campaigns with dynamic custom fields
 */

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY
const SMARTLEAD_BASE_URL = process.env.SMARTLEAD_BASE_URL || 'https://server.smartlead.ai/api/v1'

interface SmartleadLead {
  email: string
  first_name?: string
  last_name?: string
  company_name?: string
  linkedin_url?: string
  custom_fields?: Record<string, string>
}

interface SmartleadCampaign {
  id: number
  name: string
  status: string
  created_at: string
}

interface AddLeadResponse {
  ok: boolean
  id?: string
  message?: string
}

interface CampaignSequence {
  seq_id: number
  seq_number: number
  subject: string
  email_body: string
  seq_delay_details: {
    delay_in_days: number
  }
}

/**
 * Make authenticated request to Smartlead API
 */
async function smartleadRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${SMARTLEAD_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${SMARTLEAD_API_KEY}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Smartlead API error (${response.status}): ${errorText}`)
  }

  return response.json()
}

/**
 * List all campaigns
 */
export async function getCampaigns(): Promise<SmartleadCampaign[]> {
  return smartleadRequest<SmartleadCampaign[]>('/campaigns')
}

/**
 * Get campaign details including sequences
 */
export async function getCampaign(campaignId: number): Promise<SmartleadCampaign & { sequences?: CampaignSequence[] }> {
  return smartleadRequest(`/campaigns/${campaignId}`)
}

/**
 * Create a new campaign with dynamic email sequences
 */
export async function createCampaign(name: string): Promise<{ id: number; name: string }> {
  return smartleadRequest('/campaigns/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

/**
 * Add sequences to a campaign
 * Each sequence uses dynamic variables like {{email_1_body}}
 */
export async function addSequencesToCampaign(
  campaignId: number,
  sequences: Array<{
    subject: string
    body: string
    delay_days: number
  }>
): Promise<void> {
  // Smartlead expects all sequences in one request
  const formattedSequences = sequences.map((seq, i) => ({
    seq_number: i + 1,
    subject: seq.subject,
    email_body: seq.body,
    seq_delay_details: {
      delay_in_days: seq.delay_days,
    },
  }))

  await smartleadRequest(`/campaigns/${campaignId}/sequences`, {
    method: 'POST',
    body: JSON.stringify({ sequences: formattedSequences }),
  })
}

/**
 * Create the template campaign with dynamic variables
 * This only needs to be run once to set up the campaign structure
 */
export async function createTemplateCampaign(name: string = 'JSB Dynamic Sequence'): Promise<number> {
  // Create the campaign
  const campaign = await createCampaign(name)

  // Add 7 email sequences with dynamic variables
  const sequences = [
    { subject: '{{thread_1_subject}}', body: '{{email_1_body}}', delay_days: 0 },
    { subject: 'Re: {{thread_1_subject}}', body: '{{email_2_body}}', delay_days: 2 },
    { subject: 'Re: {{thread_1_subject}}', body: '{{email_3_body}}', delay_days: 2 },
    { subject: '{{thread_2_subject}}', body: '{{email_4_body}}', delay_days: 7 },
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_5_body}}', delay_days: 3 },
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_6_body}}', delay_days: 3 },
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_7_body}}', delay_days: 3 },
  ]

  await addSequencesToCampaign(campaign.id, sequences)

  console.log(`[Smartlead] Created template campaign: ${campaign.id} - ${name}`)
  return campaign.id
}

/**
 * Add a lead to a campaign with custom fields for dynamic content
 */
export async function addLeadToCampaign(
  campaignId: number,
  lead: SmartleadLead
): Promise<AddLeadResponse> {
  const payload = {
    lead_list: [
      {
        email: lead.email,
        first_name: lead.first_name || '',
        last_name: lead.last_name || '',
        company_name: lead.company_name || '',
        custom_fields: lead.custom_fields || {},
      },
    ],
  }

  return smartleadRequest(`/campaigns/${campaignId}/leads`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Format an email sequence into Smartlead custom fields
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

/**
 * Get lead status in a campaign
 */
export async function getLeadStatus(
  campaignId: number,
  email: string
): Promise<{ status: string; stats?: Record<string, number> } | null> {
  try {
    const response = await smartleadRequest<{
      data: Array<{
        email: string
        status: string
        email_sent_count: number
        email_open_count: number
        email_reply_count: number
      }>
    }>(`/campaigns/${campaignId}/leads?email=${encodeURIComponent(email)}`)

    const lead = response.data?.find(l => l.email === email)
    if (!lead) return null

    return {
      status: lead.status,
      stats: {
        sent: lead.email_sent_count,
        opens: lead.email_open_count,
        replies: lead.email_reply_count,
      },
    }
  } catch {
    return null
  }
}

/**
 * Pause a lead in a campaign
 */
export async function pauseLead(campaignId: number, email: string): Promise<void> {
  await smartleadRequest(`/campaigns/${campaignId}/leads/pause`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/**
 * Resume a lead in a campaign
 */
export async function resumeLead(campaignId: number, email: string): Promise<void> {
  await smartleadRequest(`/campaigns/${campaignId}/leads/resume`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}
