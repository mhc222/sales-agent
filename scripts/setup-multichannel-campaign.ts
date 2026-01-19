/**
 * Setup Multi-Channel Smartlead Campaign
 * Creates the campaign structure for orchestrated email + LinkedIn sequences
 *
 * Run: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/setup-multichannel-campaign.ts
 *
 * Key difference from email-only campaign:
 * - Same 7-email structure with dynamic variables
 * - Orchestrator will update custom fields based on cross-channel signals
 * - Conditional copy (e.g., body_linkedin_connected) is stored in sequence,
 *   then pushed to custom fields when state changes
 */

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY
const SMARTLEAD_BASE_URL = 'https://server.smartlead.ai/api/v1'

if (!SMARTLEAD_API_KEY) {
  console.error('Error: SMARTLEAD_API_KEY not set')
  process.exit(1)
}

// ============================================================================
// API HELPERS
// ============================================================================

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

  const data = await response.json()

  if (!response.ok) {
    console.error(`API Error (${response.status}):`, JSON.stringify(data, null, 2))
    throw new Error(`Smartlead API error (${response.status}): ${JSON.stringify(data)}`)
  }

  return data
}

// ============================================================================
// TYPES
// ============================================================================

interface Mailbox {
  id: number
  from_email: string
  from_name: string
  warmup_enabled: boolean
  warmup_details?: {
    warmup_reputation: number
    total_sent_count: number
  }
  message_per_day: number
  is_smtp_success: boolean
  is_imap_success: boolean
  type: string
}

interface EmailStep {
  subject: string
  body: string
  delay_days: number
}

interface CampaignConfig {
  name: string
  emailSteps: EmailStep[]
  timezone?: string
  sendDays?: number[]
  sendHoursStart?: number
  sendHoursEnd?: number
  minTimeBetweenEmails?: number
  maxNewLeadsPerDay?: number
  trackOpens?: boolean
  trackClicks?: boolean
  stopOnReply?: boolean
  sendAsPlainText?: boolean
  includeUnsubscribe?: boolean
}

const DEFAULT_CONFIG: Partial<CampaignConfig> = {
  timezone: 'America/New_York',
  sendDays: [1, 2, 3, 4, 5], // Mon-Fri
  sendHoursStart: 7,
  sendHoursEnd: 19,
  minTimeBetweenEmails: 45,
  maxNewLeadsPerDay: 20,
  trackOpens: true,
  trackClicks: true,
  stopOnReply: true,
  sendAsPlainText: true,
  includeUnsubscribe: true,
}

// ============================================================================
// CAMPAIGN FUNCTIONS
// ============================================================================

async function listMailboxes(): Promise<Mailbox[]> {
  console.log('\n📬 Fetching available mailboxes...\n')
  const mailboxes = await smartleadRequest<Mailbox[]>('/email-accounts')

  if (mailboxes.length === 0) {
    console.log('  ⚠️  No mailboxes found.')
    return []
  }

  console.log(`  Found ${mailboxes.length} mailbox(es):\n`)
  mailboxes.forEach((m) => {
    const smtpOk = m.is_smtp_success ? '✅' : '❌'
    const imapOk = m.is_imap_success ? '✅' : '❌'
    console.log(`  - ${m.from_email} (SMTP: ${smtpOk} | IMAP: ${imapOk})`)
  })

  return mailboxes
}

async function createCampaign(name: string): Promise<{ id: number; name: string }> {
  console.log(`\n📝 Creating campaign: "${name}"...`)
  const result = await smartleadRequest<{ id: number; name: string }>('/campaigns/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  console.log(`  ✅ Campaign created with ID: ${result.id}`)
  return result
}

async function addSequences(campaignId: number, steps: EmailStep[]): Promise<void> {
  console.log(`\n📧 Adding ${steps.length} email sequences...`)

  const sequences = steps.map((step, i) => ({
    seq_number: i + 1,
    subject: step.subject,
    email_body: step.body,
    seq_delay_details: {
      delay_in_days: step.delay_days,
    },
  }))

  await smartleadRequest(`/campaigns/${campaignId}/sequences`, {
    method: 'POST',
    body: JSON.stringify({ sequences }),
  })

  steps.forEach((step, i) => {
    console.log(`  ✅ Email ${i + 1}: "${step.subject.substring(0, 40)}..." (Day +${step.delay_days})`)
  })
}

async function configureCampaignSchedule(
  campaignId: number,
  config: Partial<CampaignConfig>
): Promise<void> {
  console.log('\n⏰ Configuring campaign schedule...')

  const startHour = config.sendHoursStart || DEFAULT_CONFIG.sendHoursStart
  const endHour = config.sendHoursEnd || DEFAULT_CONFIG.sendHoursEnd

  const schedulePayload = {
    timezone: config.timezone || DEFAULT_CONFIG.timezone,
    days_of_the_week: config.sendDays || DEFAULT_CONFIG.sendDays,
    start_hour: `${String(startHour).padStart(2, '0')}:00`,
    end_hour: `${String(endHour).padStart(2, '0')}:00`,
    min_time_btw_emails: config.minTimeBetweenEmails || DEFAULT_CONFIG.minTimeBetweenEmails,
    max_new_leads_per_day: config.maxNewLeadsPerDay || DEFAULT_CONFIG.maxNewLeadsPerDay,
  }

  await smartleadRequest(`/campaigns/${campaignId}/schedule`, {
    method: 'POST',
    body: JSON.stringify(schedulePayload),
  })

  console.log(`  ✅ Timezone: ${schedulePayload.timezone}`)
  console.log(`  ✅ Send days: Mon-Fri`)
  console.log(`  ✅ Send hours: ${schedulePayload.start_hour} - ${schedulePayload.end_hour}`)
}

async function configureCampaignSettings(
  campaignId: number,
  config: Partial<CampaignConfig>
): Promise<void> {
  console.log('\n⚙️  Configuring campaign settings...')

  const trackSettings: string[] = []
  if (!(config.trackClicks ?? DEFAULT_CONFIG.trackClicks)) {
    trackSettings.push('DONT_LINK_CLICK')
  }

  const settingsPayload = {
    track_settings: trackSettings,
    stop_lead_settings: config.stopOnReply ?? DEFAULT_CONFIG.stopOnReply
      ? 'REPLY_TO_AN_EMAIL'
      : null,
    send_as_plain_text: config.sendAsPlainText ?? DEFAULT_CONFIG.sendAsPlainText,
    add_unsubscribe_tag: config.includeUnsubscribe ?? DEFAULT_CONFIG.includeUnsubscribe,
    enable_ai_esp_matching: true,
  }

  await smartleadRequest(`/campaigns/${campaignId}/settings`, {
    method: 'POST',
    body: JSON.stringify(settingsPayload),
  })

  console.log(`  ✅ Track opens: ${config.trackOpens ?? DEFAULT_CONFIG.trackOpens}`)
  console.log(`  ✅ Track clicks: ${config.trackClicks ?? DEFAULT_CONFIG.trackClicks}`)
  console.log(`  ✅ Stop on reply: ${config.stopOnReply ?? DEFAULT_CONFIG.stopOnReply}`)
  console.log(`  ✅ Send as plain text: ${settingsPayload.send_as_plain_text}`)
}

async function attachMailboxes(campaignId: number, mailboxIds: number[]): Promise<void> {
  if (mailboxIds.length === 0) {
    console.log('\n📬 No mailboxes to attach (skipping)')
    return
  }

  console.log(`\n📬 Attaching ${mailboxIds.length} mailbox(es) to campaign...`)

  await smartleadRequest(`/campaigns/${campaignId}/email-accounts`, {
    method: 'POST',
    body: JSON.stringify({ email_account_ids: mailboxIds }),
  })

  console.log(`  ✅ Attached mailbox IDs: ${mailboxIds.join(', ')}`)
}

async function setupWebhook(campaignId: number, webhookUrl: string): Promise<void> {
  console.log('\n🔗 Setting up webhooks...')

  const webhookPayload = {
    name: 'Multi-Channel Orchestrator Webhook',
    webhook_url: webhookUrl,
    event_types: ['EMAIL_SENT', 'EMAIL_OPEN', 'EMAIL_LINK_CLICK', 'EMAIL_REPLY', 'LEAD_UNSUBSCRIBED', 'EMAIL_BOUNCE'],
  }

  try {
    await smartleadRequest(`/campaigns/${campaignId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify(webhookPayload),
    })

    console.log(`  ✅ Webhook URL: ${webhookUrl}`)
    console.log(`  ✅ Events: EMAIL_SENT, EMAIL_OPEN, EMAIL_LINK_CLICK, EMAIL_REPLY, LEAD_UNSUBSCRIBED, EMAIL_BOUNCE`)
  } catch (error) {
    console.log(`  ⚠️  Webhook setup may require manual configuration`)
    console.log(`  📋 Webhook URL: ${webhookUrl}`)
  }
}

// ============================================================================
// MULTI-CHANNEL CAMPAIGN CONFIG
// ============================================================================

/**
 * Multi-Channel Campaign Template
 *
 * Same 7-email structure as email-only, but:
 * - Orchestrator coordinates with LinkedIn via HeyReach
 * - When LinkedIn connection is accepted, orchestrator updates
 *   email custom fields to use body_linkedin_connected copy
 * - When LinkedIn reply received, updates to body_linkedin_replied copy
 */
const MULTI_CHANNEL_CAMPAIGN: CampaignConfig = {
  name: 'JSB Multi-Channel Sequence',
  emailSteps: [
    // Thread 1: Initial outreach
    // Day 1: Email 1 (TIPS) + LinkedIn Connection Request via HeyReach
    { subject: '{{thread_1_subject}}', body: '{{email_1_body}}', delay_days: 0 },
    // Day 3: Email 2 (Value Add) + LinkedIn Message 1 (if connected)
    { subject: 'Re: {{thread_1_subject}}', body: '{{email_2_body}}', delay_days: 2 },
    // Day 5: Email 3 (Bump)
    { subject: 'Re: {{thread_1_subject}}', body: '{{email_3_body}}', delay_days: 2 },

    // Thread 2: New angle
    // Day 12: Email 4 (New Thread)
    { subject: '{{thread_2_subject}}', body: '{{email_4_body}}', delay_days: 7 },
    // Day 15: Email 5 (Case Study) + LinkedIn Message 2
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_5_body}}', delay_days: 3 },
    // Day 18: Email 6 (Bump)
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_6_body}}', delay_days: 3 },
    // Day 21: Email 7 (Referral)
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_7_body}}', delay_days: 3 },
  ],
  timezone: 'America/New_York',
  sendDays: [1, 2, 3, 4, 5],
  sendHoursStart: 7,
  sendHoursEnd: 19,
  minTimeBetweenEmails: 45,
  maxNewLeadsPerDay: 20,
  trackOpens: true,
  trackClicks: true,
  stopOnReply: true,
  sendAsPlainText: true,
  includeUnsubscribe: true,
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 MULTI-CHANNEL SMARTLEAD CAMPAIGN SETUP')
  console.log('='.repeat(60))

  console.log('\n📋 Multi-Channel Campaign Features:')
  console.log('  • 7 email sequence with dynamic variables')
  console.log('  • Coordinated with LinkedIn via HeyReach')
  console.log('  • Conditional copy updates when LinkedIn connected/replied')
  console.log('  • Orchestrator controls cross-channel timing')

  try {
    // Step 1: List mailboxes
    const mailboxes = await listMailboxes()
    const connectedMailboxIds = mailboxes
      .filter((m) => m.is_smtp_success && m.is_imap_success)
      .map((m) => m.id)

    // Step 2: Create campaign
    const campaign = await createCampaign(MULTI_CHANNEL_CAMPAIGN.name)

    // Step 3: Add email sequences
    await addSequences(campaign.id, MULTI_CHANNEL_CAMPAIGN.emailSteps)

    // Step 4: Configure schedule
    await configureCampaignSchedule(campaign.id, MULTI_CHANNEL_CAMPAIGN)

    // Step 5: Configure settings
    await configureCampaignSettings(campaign.id, MULTI_CHANNEL_CAMPAIGN)

    // Step 6: Attach mailboxes
    await attachMailboxes(campaign.id, connectedMailboxIds)

    // Step 7: Setup webhooks
    const webhookUrl = 'https://sales-agent-bice.vercel.app/api/webhooks/smartlead'
    await setupWebhook(campaign.id, webhookUrl)

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('✅ MULTI-CHANNEL CAMPAIGN SETUP COMPLETE')
    console.log('='.repeat(60))
    console.log(`
Campaign ID: ${campaign.id}
Campaign Name: ${MULTI_CHANNEL_CAMPAIGN.name}
Email Steps: ${MULTI_CHANNEL_CAMPAIGN.emailSteps.length}
Mailboxes: ${connectedMailboxIds.length}

Multi-Channel Coordination:
  Day 1:  Email 1 + LinkedIn Connection Request
  Day 3:  Email 2 + LinkedIn Message 1 (if connected)
  Day 5:  Email 3
  Day 12: Email 4 (new thread)
  Day 15: Email 5 + LinkedIn Message 2
  Day 18: Email 6
  Day 21: Email 7 (referral)
`)

    console.log('\n📋 Next Steps:')
    console.log(`  1. Add to environment: SMARTLEAD_MULTICHANNEL_CAMPAIGN_ID=${campaign.id}`)
    console.log('  2. Verify campaign in Smartlead dashboard')
    console.log('  3. Assign SmartServers manually in dashboard')
    console.log('  4. Set up corresponding HeyReach campaign for LinkedIn')
    console.log('  5. Start campaign when ready')

    console.log('\n📋 How Conditional Copy Works:')
    console.log('  • Lead added with default email body copy')
    console.log('  • When LinkedIn connection accepted:')
    console.log('    → HeyReach webhook → orchestrator → updates custom fields')
    console.log('    → Remaining emails use body_linkedin_connected copy')
    console.log('  • When LinkedIn reply received:')
    console.log('    → Updates to body_linkedin_replied copy')
    console.log('  • Copy changes apply to unsent emails only')

  } catch (error) {
    console.error('\n❌ Setup failed:', error)
    process.exit(1)
  }
}

main()
