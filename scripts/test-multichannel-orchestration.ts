/**
 * Test Multi-Channel Orchestration
 *
 * Creates a test lead with fake email/LinkedIn and runs through the orchestration flow
 * with accelerated timing to verify coordination works.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env npx tsx -r dotenv/config scripts/test-multichannel-orchestration.ts
 *
 * Options:
 *   --step=generate    Generate sequence only
 *   --step=deploy      Deploy to platforms
 *   --step=simulate    Simulate webhook events
 *   --step=all         Run full flow (default)
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env' })

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY
const HEYREACH_API_KEY = process.env.HEYREACH_API_KEY
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY
const INNGEST_BASE_URL = process.env.INNGEST_BASE_URL || 'https://inn.gs'

// Test lead configuration - FAKE DATA
const TEST_LEAD = {
  email: 'test.orchestration@fakecorp-test.invalid',
  first_name: 'Test',
  last_name: 'Orchestration',
  company_name: 'FakeCorp Test Inc',
  job_title: 'VP of Testing',
  linkedin_url: 'https://www.linkedin.com/in/test-orchestration-fake-12345/',
}

// Test tenant - will be created if doesn't exist
let TEST_TENANT_ID = ''

// ============================================================================
// HELPERS
// ============================================================================

function log(message: string, data?: unknown) {
  const timestamp = new Date().toISOString().slice(11, 19)
  console.log(`[${timestamp}] ${message}`)
  if (data) console.log(JSON.stringify(data, null, 2))
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// STEP 0: CREATE OR GET TEST TENANT
// ============================================================================

async function getOrCreateTestTenant(): Promise<string> {
  log('🏢 Checking for test tenant...')

  // Check if test tenant exists
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('name', 'Test Tenant')
    .maybeSingle()

  if (existing) {
    log(`✅ Found existing test tenant: ${existing.id}`)
    return existing.id
  }

  // Create test tenant
  log('📝 Creating test tenant...')
  const { data: created, error } = await supabase
    .from('tenants')
    .insert({
      name: 'Test Tenant',
      slug: 'test-tenant',
      settings: {
        heyreach_api_key: HEYREACH_API_KEY,
        smartlead_api_key: SMARTLEAD_API_KEY,
      },
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create test tenant: ${error.message}`)

  log(`✅ Created test tenant: ${created.id}`)
  return created.id
}

// ============================================================================
// STEP 1: CREATE OR GET TEST LEAD
// ============================================================================

async function getOrCreateTestLead(): Promise<string> {
  log('📋 Checking for existing test lead...')

  // Check if test lead exists
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('email', TEST_LEAD.email)
    .eq('tenant_id', TEST_TENANT_ID)
    .maybeSingle()

  if (existing) {
    log(`✅ Found existing test lead: ${existing.id}`)
    return existing.id
  }

  // Create test lead
  log('📝 Creating test lead...')
  const { data: created, error } = await supabase
    .from('leads')
    .insert({
      ...TEST_LEAD,
      tenant_id: TEST_TENANT_ID,
      status: 'ingested',
      visit_count: 0,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create test lead: ${error.message}`)

  log(`✅ Created test lead: ${created.id}`)
  return created.id
}

// ============================================================================
// STEP 2: CREATE TEST CONTEXT PROFILE
// ============================================================================

async function createTestContextProfile(leadId: string): Promise<void> {
  log('📊 Creating test context profile...')

  const testProfile = {
    leadSummary: {
      name: `${TEST_LEAD.first_name} ${TEST_LEAD.last_name}`,
      title: TEST_LEAD.job_title,
      company: TEST_LEAD.company_name,
      seniorityLevel: 'vp',
      decisionMakerLikelihood: 'high',
    },
    companyIntelligence: {
      overview: 'FakeCorp Test Inc is a fictional company used for testing orchestration.',
      industry: 'Software',
      employeeCount: 150,
      revenueRange: '$10M-$50M',
      growthSignals: ['Recently raised Series A', 'Hiring aggressively'],
      challenges: ['Scaling sales team', 'Improving outbound efficiency'],
    },
    personalizationHooks: {
      recentActivity: ['Posted about sales automation challenges'],
      careerPath: 'Sales → Sales Management → VP Sales',
      sharedContext: ['Both interested in sales efficiency'],
      conversationStarters: ['Their recent post about automation', 'Series A raise'],
    },
    painPointAnalysis: {
      primaryPainPoint: 'Manual outreach taking too much time',
      secondaryPainPoints: ['Low response rates', 'Inconsistent messaging'],
      evidenceSources: ['LinkedIn post', 'Company job postings'],
    },
    messagingStrategy: {
      recommendedAngle: 'efficiency',
      toneRecommendation: 'consultative',
      keyMessages: ['Save time on outreach', 'Improve response rates'],
      avoidTopics: ['Pricing too early'],
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      dataQuality: 'high',
      confidenceLevel: 0.85,
      dataQualityScore: 0.85,
    },
  }

  // Upsert context profile
  const { error } = await supabase
    .from('lead_context_profiles')
    .upsert({
      lead_id: leadId,
      tenant_id: TEST_TENANT_ID,
      profile: testProfile,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'lead_id',
    })

  if (error) {
    log(`⚠️ Context profile upsert error (may be OK): ${error.message}`)
  } else {
    log('✅ Test context profile created')
  }
}

// ============================================================================
// STEP 3: TRIGGER SEQUENCE GENERATION VIA INNGEST
// ============================================================================

async function triggerSequenceGeneration(leadId: string): Promise<void> {
  log('🚀 Triggering multi-channel sequence generation via Inngest...')

  if (!INNGEST_EVENT_KEY) {
    log('⚠️ INNGEST_EVENT_KEY not set - using direct function call instead')
    await triggerSequenceGenerationDirect(leadId)
    return
  }

  const eventPayload = {
    name: 'orchestration.generate-sequence',
    data: {
      lead_id: leadId,
      tenant_id: TEST_TENANT_ID,
      campaign_mode: 'multi_channel',
    },
  }

  const response = await fetch(`${INNGEST_BASE_URL}/e/${INNGEST_EVENT_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventPayload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Inngest event failed: ${response.status} ${text}`)
  }

  log('✅ Inngest event sent - sequence generation started')
  log('📋 Check Inngest dashboard for progress: https://app.inngest.com')
}

async function triggerSequenceGenerationDirect(leadId: string): Promise<void> {
  // Import and run directly (for local testing without Inngest)
  const { generateMultiChannelSequence } = await import('../src/agents/multichannel-sequence-generator')
  const { createOrchestrationState, startOrchestration, updateOrchestrationState } = await import('../src/lib/orchestration/orchestrator')
  const smartlead = await import('../src/lib/smartlead')
  const heyreach = await import('../src/lib/heyreach')

  // Get lead
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (!lead) throw new Error('Lead not found')

  // Get context profile
  const { data: profileData } = await supabase
    .from('lead_context_profiles')
    .select('profile')
    .eq('lead_id', leadId)
    .maybeSingle()

  const contextProfile = profileData?.profile || {}

  log('🤖 Generating multi-channel sequence with Claude...')
  const sequence = await generateMultiChannelSequence({
    lead,
    contextProfile,
    research: {
      relationship: { type: 'direct_client' },
      persona_match: { type: 'vp_sales' },
      triggers: [{ type: 'funding', description: 'Series A raise' }],
      messaging_angles: ['efficiency', 'automation'],
    },
    campaignMode: 'multi_channel',
  })

  log(`✅ Sequence generated:`)
  log(`   - ${sequence.email_steps?.length || 0} email steps`)
  log(`   - ${sequence.linkedin_steps?.length || 0} LinkedIn steps`)
  log(`   - Sequence ID: ${sequence.id}`)

  // Deploy to SmartLead
  log('📧 Deploying to SmartLead...')
  const smartleadCampaignId = parseInt(process.env.SMARTLEAD_MULTICHANNEL_CAMPAIGN_ID || '2854168')
  try {
    const smartleadResult = await smartlead.deployLeadToMultiChannelCampaign(
      smartleadCampaignId,
      {
        email: lead.email,
        first_name: lead.first_name,
        last_name: lead.last_name,
        company_name: lead.company_name,
        linkedin_url: lead.linkedin_url,
      },
      sequence
    )
    log(`   SmartLead: ${smartleadResult.ok ? '✅ Success' : '❌ ' + smartleadResult.message}`)
  } catch (err) {
    log(`   SmartLead: ❌ ${err instanceof Error ? err.message : 'Error'}`)
  }

  // Deploy to HeyReach
  log('💼 Deploying to HeyReach...')
  const heyreachCampaignId = process.env.HEYREACH_MULTICHANNEL_CAMPAIGN_ID || '307593'
  try {
    const heyreachResult = await heyreach.deployLeadToMultiChannelCampaign(
      { apiKey: HEYREACH_API_KEY! },
      heyreachCampaignId,
      {
        linkedin_url: lead.linkedin_url!,
        first_name: lead.first_name,
        last_name: lead.last_name,
        company_name: lead.company_name,
        job_title: lead.job_title,
        email: lead.email,
      },
      sequence
    )
    log(`   HeyReach: ${heyreachResult.success ? '✅ Success' : '❌ ' + heyreachResult.error}`)
  } catch (err) {
    log(`   HeyReach: ❌ ${err instanceof Error ? err.message : 'Error'}`)
  }

  // Create orchestration state
  const state = await createOrchestrationState(leadId, TEST_TENANT_ID, sequence)
  log(`✅ Orchestration state created: ${state.id}`)

  // Start orchestration
  await startOrchestration(leadId, sequence.id!)
  log('✅ Orchestration started')

  return
}

// ============================================================================
// STEP 4: CHECK ORCHESTRATION STATE
// ============================================================================

async function checkOrchestrationState(leadId: string): Promise<void> {
  log('📊 Checking orchestration state...')

  const { data: state } = await supabase
    .from('orchestration_state')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (!state) {
    log('⚠️ No orchestration state found yet')
    return
  }

  log('Current state:', {
    status: state.status,
    email_step: `${state.email_step_current}/${state.email_step_total}`,
    linkedin_step: `${state.linkedin_step_current}/${state.linkedin_step_total}`,
    linkedin_connected: state.linkedin_connected,
    linkedin_replied: state.linkedin_replied,
    smartlead_lead_id: state.smartlead_lead_id,
    heyreach_lead_id: state.heyreach_lead_id,
  })
}

// ============================================================================
// STEP 5: SIMULATE WEBHOOK EVENTS
// ============================================================================

async function simulateHeyReachEvent(
  eventType: string,
  leadLinkedInUrl: string,
  messageText?: string
): Promise<void> {
  log(`📨 Simulating HeyReach event: ${eventType}`)

  const webhookUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/webhooks/heyreach`
    : 'https://swedishnationalsalesteam.com/api/webhooks/heyreach'

  // Payload format matches HeyReach webhook structure
  const payload: Record<string, unknown> = {
    event_type: eventType,
    linkedin_url: leadLinkedInUrl,
    first_name: TEST_LEAD.first_name,
    last_name: TEST_LEAD.last_name,
    company_name: TEST_LEAD.company_name,
    timestamp: new Date().toISOString(),
  }

  if (messageText) {
    payload.message = messageText
    payload.message_text = messageText
  }

  log(`   Sending to: ${webhookUrl}`)

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  log(`   Response: ${response.status} ${text.slice(0, 200)}`)
}

// ============================================================================
// STEP 6: CHECK SEQUENCE IN DATABASE
// ============================================================================

async function checkGeneratedSequence(leadId: string): Promise<void> {
  log('📋 Checking generated sequence...')

  const { data: sequence } = await supabase
    .from('multichannel_sequences')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sequence) {
    log('⚠️ No sequence found yet')
    return
  }

  log('Sequence found:', {
    id: sequence.id,
    campaign_mode: sequence.campaign_mode,
    status: sequence.status,
    email_count: sequence.email_steps?.length || 0,
    linkedin_count: sequence.linkedin_steps?.length || 0,
  })

  // Show first email
  if (sequence.email_steps?.[0]) {
    log('\nFirst email preview:')
    log(`  Subject: ${sequence.email_steps[0].subject}`)
    log(`  Body: ${sequence.email_steps[0].body?.slice(0, 150)}...`)
  }

  // Show first LinkedIn message
  if (sequence.linkedin_steps?.[0]) {
    log('\nFirst LinkedIn step:')
    log(`  Type: ${sequence.linkedin_steps[0].type}`)
    if (sequence.linkedin_steps[0].connection_note) {
      log(`  Note: ${sequence.linkedin_steps[0].connection_note}`)
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('  MULTI-CHANNEL ORCHESTRATION TEST')
  console.log('='.repeat(60) + '\n')

  const step = process.argv.find(a => a.startsWith('--step='))?.split('=')[1] || 'all'

  try {
    // Step 0: Get or create test tenant
    TEST_TENANT_ID = await getOrCreateTestTenant()

    // Step 1: Get or create test lead
    const leadId = await getOrCreateTestLead()

    if (step === 'all' || step === 'generate') {
      // Step 2: Create context profile
      await createTestContextProfile(leadId)

      // Step 3: Trigger sequence generation
      await triggerSequenceGeneration(leadId)

      // Wait for generation
      log('\n⏳ Waiting 30 seconds for sequence generation...')
      await sleep(30000)

      // Check results
      await checkGeneratedSequence(leadId)
      await checkOrchestrationState(leadId)
    }

    if (step === 'all' || step === 'simulate') {
      // Step 4: Simulate webhook events
      console.log('\n' + '-'.repeat(60))
      log('🎭 SIMULATING WEBHOOK EVENTS')
      console.log('-'.repeat(60) + '\n')

      // Simulate connection accepted
      log('\n--- Simulating LinkedIn connection accepted ---')
      await simulateHeyReachEvent('connection_accepted', TEST_LEAD.linkedin_url)
      await sleep(3000)
      await checkOrchestrationState(leadId)

      // Simulate positive reply
      log('\n--- Simulating positive LinkedIn reply ---')
      await simulateHeyReachEvent(
        'message_received',
        TEST_LEAD.linkedin_url,
        'Yes, I would love to learn more about this! Can we schedule a call?'
      )
      await sleep(3000)
      await checkOrchestrationState(leadId)
    }

    if (step === 'check') {
      await checkGeneratedSequence(leadId)
      await checkOrchestrationState(leadId)
    }

    console.log('\n' + '='.repeat(60))
    log('✅ TEST COMPLETE')
    console.log('='.repeat(60) + '\n')

    log('Next steps:')
    log('  1. Check Inngest dashboard for workflow runs')
    log('  2. Check SmartLead campaign 2854168 for test lead')
    log('  3. Check HeyReach campaign 307593 for test lead')
    log(`  4. Run with --step=check to see current state`)
    log(`  5. Run with --step=simulate to test webhooks only`)

  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

main()
