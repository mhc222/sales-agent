import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function sendEvent() {
  const targetEmail = process.argv[2] || 'lwaiser@dglaw.com'

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('email', targetEmail)
    .single()

  if (error || !lead) {
    console.error('Lead not found:', targetEmail, error)
    return
  }

  console.log('Sending research event for:', lead.first_name, lead.last_name)
  console.log('Lead ID:', lead.id)
  console.log('LinkedIn:', lead.linkedin_url || 'N/A')
  console.log('Company LinkedIn:', lead.company_linkedin_url || 'N/A')

  const eventPayload = {
    name: 'lead.ready-for-deployment',
    data: {
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      qualification: {
        decision: lead.qualification_decision || 'YES',
        reasoning: lead.qualification_reasoning || 'Manual trigger',
        confidence: lead.qualification_confidence || 0.75,
        icp_fit: lead.icp_fit || 'medium',
      },
      visit_count: lead.visit_count || 1,
      is_returning_visitor: false,
    },
  }

  // Send via Inngest event API - dev server proxies through the app
  const eventKey = process.env.INNGEST_EVENT_KEY || 'evt_dev_xxx'
  const response = await fetch('http://localhost:8288/e/' + eventKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventPayload),
  })

  if (response.ok) {
    console.log('Event sent successfully!')
    console.log('Check Inngest dashboard at http://localhost:8288')
  } else {
    const text = await response.text()
    console.error('Failed to send event:', response.status, text)
  }
}

sendEvent()
