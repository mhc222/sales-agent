/**
 * Setup Smartlead Campaign with Advanced Configuration
 * Run: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/setup-smartlead-campaign.ts
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
// MAILBOX FUNCTIONS
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

async function listMailboxes(): Promise<Mailbox[]> {
  console.log('\n📬 Fetching available mailboxes...\n')
  const mailboxes = await smartleadRequest<Mailbox[]>('/email-accounts')

  if (mailboxes.length === 0) {
    console.log('  ⚠️  No mailboxes found. Please add email accounts first.')
    return []
  }

  console.log(`  Found ${mailboxes.length} mailbox(es):\n`)
  mailboxes.forEach((m) => {
    const warmupStatus = m.warmup_enabled ? '🔥 Warming' : '❄️ Not warming'
    const smtpOk = m.is_smtp_success ? '✅' : '❌'
    const imapOk = m.is_imap_success ? '✅' : '❌'
    const reputation = m.warmup_details?.warmup_reputation || 'N/A'
    console.log(`  - ${m.from_email}`)
    console.log(`    Name: ${m.from_name} | Type: ${m.type || 'Unknown'}`)
    console.log(`    SMTP: ${smtpOk} | IMAP: ${imapOk} | ${warmupStatus}`)
    console.log(`    Reputation: ${reputation} | Daily limit: ${m.message_per_day}`)
    console.log('')
  })

  return mailboxes
}

// ============================================================================
// CAMPAIGN FUNCTIONS
// ============================================================================

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
  sendHoursEnd: 19, // 7PM
  minTimeBetweenEmails: 45,
  maxNewLeadsPerDay: 20,
  trackOpens: true,
  trackClicks: true,
  stopOnReply: true,
  sendAsPlainText: true,
  includeUnsubscribe: true,
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
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const sendDayNames = schedulePayload.days_of_the_week.map(d => dayNames[d]).join(', ')
  console.log(`  ✅ Send days: ${sendDayNames} (${schedulePayload.days_of_the_week.join(',')})`)
  console.log(`  ✅ Send hours: ${schedulePayload.start_hour} - ${schedulePayload.end_hour}`)
  console.log(`  ✅ Min time between emails: ${schedulePayload.min_time_btw_emails} minutes`)
  console.log(`  ✅ Max new leads/day: ${schedulePayload.max_new_leads_per_day}`)
}

async function configureCampaignSettings(
  campaignId: number,
  config: Partial<CampaignConfig>
): Promise<void> {
  console.log('\n⚙️  Configuring campaign settings...')

  // track_settings is an array of DISABLED features
  // Empty array = track everything, ["DONT_LINK_CLICK"] = disable click tracking
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

  const trackOpens = config.trackOpens ?? DEFAULT_CONFIG.trackOpens
  const trackClicks = config.trackClicks ?? DEFAULT_CONFIG.trackClicks
  console.log(`  ✅ Track opens: ${trackOpens}`)
  console.log(`  ✅ Track clicks: ${trackClicks}`)
  console.log(`  ✅ Stop on reply: ${config.stopOnReply ?? DEFAULT_CONFIG.stopOnReply}`)
  console.log(`  ✅ Send as plain text: ${settingsPayload.send_as_plain_text}`)
  console.log(`  ✅ Unsubscribe footer: ${settingsPayload.add_unsubscribe_tag}`)
  console.log(`  ✅ AI ESP matching: ${settingsPayload.enable_ai_esp_matching}`)
  console.log(`  ⚠️  SmartServers: Assign manually in Smartlead dashboard`)
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

// ============================================================================
// WEBHOOK FUNCTIONS
// ============================================================================

interface WebhookConfig {
  campaignId: number
  webhookUrl: string
  events: string[]
  name?: string
}

async function setupWebhook(config: WebhookConfig): Promise<void> {
  console.log('\n🔗 Setting up webhooks...')

  // Smartlead uses a single webhook URL per campaign
  const webhookPayload = {
    name: config.name || 'Sales Agent Webhook',
    webhook_url: config.webhookUrl,
    event_types: config.events,
  }

  try {
    await smartleadRequest(`/campaigns/${config.campaignId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify(webhookPayload),
    })

    console.log(`  ✅ Webhook URL: ${config.webhookUrl}`)
    console.log(`  ✅ Events: ${config.events.join(', ')}`)
  } catch (error) {
    console.log(`  ⚠️  Webhook setup skipped (may require manual configuration)`)
    console.log(`  📋 Recommended webhook URL: ${config.webhookUrl}`)
    console.log(`  📋 Events to configure: EMAIL_SENT, EMAIL_OPEN, EMAIL_LINK_CLICK, EMAIL_REPLY, LEAD_UNSUBSCRIBED`)
  }
}

// ============================================================================
// MAIN SETUP FUNCTION
// ============================================================================

async function setupCampaign(config: CampaignConfig): Promise<{
  campaignId: number
  summary: string
}> {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 SMARTLEAD CAMPAIGN SETUP')
  console.log('='.repeat(60))

  // Step 1: List mailboxes
  const mailboxes = await listMailboxes()
  const connectedMailboxIds = mailboxes
    .filter((m) => m.is_smtp_success && m.is_imap_success)
    .map((m) => m.id)

  // Step 2: Create campaign
  const campaign = await createCampaign(config.name)

  // Step 3: Add email sequences
  await addSequences(campaign.id, config.emailSteps)

  // Step 4: Configure schedule
  await configureCampaignSchedule(campaign.id, config)

  // Step 5: Configure settings
  await configureCampaignSettings(campaign.id, config)

  // Step 6: Attach mailboxes
  await attachMailboxes(campaign.id, connectedMailboxIds)

  // Step 7: Setup webhooks
  const webhookUrl = `https://sales-agent-bice.vercel.app/api/webhooks/smartlead`
  await setupWebhook({
    campaignId: campaign.id,
    webhookUrl,
    events: ['EMAIL_SENT', 'EMAIL_OPEN', 'EMAIL_LINK_CLICK', 'EMAIL_REPLY', 'LEAD_UNSUBSCRIBED'],
  })

  // Summary
  const summary = `
Campaign ID: ${campaign.id}
Campaign Name: ${config.name}
Email Steps: ${config.emailSteps.length}
Mailboxes: ${connectedMailboxIds.length}
Timezone: ${config.timezone || DEFAULT_CONFIG.timezone}
Schedule: Mon-Fri, 7AM-7PM EST
Max Leads/Day: ${config.maxNewLeadsPerDay || DEFAULT_CONFIG.maxNewLeadsPerDay}
`

  console.log('\n' + '='.repeat(60))
  console.log('✅ CAMPAIGN SETUP COMPLETE')
  console.log('='.repeat(60))
  console.log(summary)

  return { campaignId: campaign.id, summary }
}

// ============================================================================
// JSB DYNAMIC CAMPAIGN TEMPLATE
// ============================================================================

const JSB_DYNAMIC_CAMPAIGN: CampaignConfig = {
  name: 'JSB Dynamic Sequence',
  emailSteps: [
    // Thread 1: Pain Point 1
    { subject: '{{thread_1_subject}}', body: '{{email_1_body}}', delay_days: 0 },   // Day 1
    { subject: 'Re: {{thread_1_subject}}', body: '{{email_2_body}}', delay_days: 2 }, // Day 3
    { subject: 'Re: {{thread_1_subject}}', body: '{{email_3_body}}', delay_days: 2 }, // Day 5
    // Thread 2: Pain Point 2
    { subject: '{{thread_2_subject}}', body: '{{email_4_body}}', delay_days: 7 },   // Day 12
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_5_body}}', delay_days: 3 }, // Day 15
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_6_body}}', delay_days: 3 }, // Day 18
    { subject: 'Re: {{thread_2_subject}}', body: '{{email_7_body}}', delay_days: 3 }, // Day 21
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
// RUN
// ============================================================================

async function main() {
  try {
    const result = await setupCampaign(JSB_DYNAMIC_CAMPAIGN)

    console.log('\n📋 Next Steps:')
    console.log(`  1. Update SMARTLEAD_CAMPAIGN_ID=${result.campaignId} in environment`)
    console.log('  2. Verify campaign in Smartlead dashboard')
    console.log('  3. Start the campaign when ready')
    console.log('  4. Deploy leads via the dashboard')

  } catch (error) {
    console.error('\n❌ Setup failed:', error)
    process.exit(1)
  }
}

main()
