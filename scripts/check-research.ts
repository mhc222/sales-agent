import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

async function check() {
  // Get a researched lead with no triggers
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('status', 'researched')
    .limit(1)
    .single()

  if (lead === null) {
    console.log('No researched lead found')
    return
  }

  console.log('Lead:', lead.first_name, lead.last_name)
  console.log('LinkedIn URL:', lead.linkedin_url)
  console.log('Company LI URL:', lead.company_linkedin_url)
  console.log('')

  const { data: research } = await supabase
    .from('research_records')
    .select('*')
    .eq('lead_id', lead.id)
    .single()

  if (research === null) {
    console.log('No research record found')
    return
  }

  console.log('Research record created:', research.created_at)
  console.log('Research record updated:', research.updated_at)
  console.log('')
  console.log('apify_raw:', JSON.stringify(research.apify_raw, null, 2))
  console.log('')
  console.log('perplexity_raw length:', (research.perplexity_raw as string)?.length || 0)
  console.log('')

  const signals = research.extracted_signals as any
  console.log('extracted_signals keys:', Object.keys(signals || {}))

  if (signals) {
    console.log('  triggers:', signals.triggers?.length || 0)
    console.log('  persona_match:', signals.persona_match?.type || 'none')
    console.log('  waterfall_summary:', JSON.stringify(signals.waterfall_summary, null, 2))
  }
}

check()
