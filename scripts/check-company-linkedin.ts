import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

async function check() {
  // Get leads that have research but no triggers
  const { data: records } = await supabase
    .from('research_records')
    .select('lead_id, extracted_signals')

  if (records === null) return

  console.log('=== LEADS WITHOUT TRIGGERS - COMPANY LINKEDIN CHECK ===\n')

  for (const record of records) {
    const signals = record.extracted_signals as any
    const triggerCount = signals?.triggers?.length || 0

    if (triggerCount === 0) {
      const { data: lead } = await supabase
        .from('leads')
        .select('first_name, last_name, company_name, company_linkedin_url')
        .eq('id', record.lead_id)
        .single()

      console.log(`${lead?.first_name} ${lead?.last_name} @ ${lead?.company_name}`)
      console.log(`  Company LinkedIn URL: ${lead?.company_linkedin_url || 'NONE'}`)
      console.log('')
    }
  }
}

check()
