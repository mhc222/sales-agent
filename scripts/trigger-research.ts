import { inngest } from '../inngest/client'
import { supabase } from '../src/lib/supabase'
import 'dotenv/config'

async function triggerResearch() {
  // Get target email from command line or default to finding a qualified lead
  const targetEmail = process.argv[2]

  let query = supabase.from('leads').select('*')

  if (targetEmail) {
    query = query.eq('email', targetEmail)
  } else {
    query = query.eq('qualification_decision', 'YES').order('created_at', { ascending: false }).limit(1)
  }

  const { data: lead, error } = await query.single()

  if (error) {
    console.error('Error fetching lead:', error)
    return
  }

  if (!lead) {
    console.error('No qualified lead found')
    return
  }

  console.log('Triggering research for:')
  console.log('  Name:', lead.first_name, lead.last_name)
  console.log('  Company:', lead.company_name)
  console.log('  Title:', lead.job_title)
  console.log('  LinkedIn:', lead.linkedin_url || 'N/A')
  console.log('  Company LinkedIn:', lead.company_linkedin_url || 'N/A')
  console.log('')

  // Send event to Inngest
  const result = await inngest.send({
    name: 'lead.ready-for-deployment',
    data: {
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      qualification: {
        decision: lead.qualification_decision,
        reasoning: lead.qualification_reasoning,
        confidence: lead.qualification_confidence,
        icp_fit: lead.icp_fit,
      },
      visit_count: lead.visit_count,
      is_returning_visitor: false,
    },
  })

  console.log('Event sent! IDs:', result.ids)
  console.log('Check Inngest dashboard at http://localhost:8288')
}

triggerResearch()
