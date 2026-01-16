import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

async function check() {
  // Get all research records
  const { data: records } = await supabase
    .from('research_records')
    .select('lead_id, extracted_signals, apify_raw, perplexity_raw, created_at')
    .order('created_at', { ascending: false })

  if (records === null || records.length === 0) {
    console.log('No research records found')
    return
  }

  console.log(`Total research records: ${records.length}`)
  console.log('')

  let withTriggers = 0
  let withoutTriggers = 0
  let withLinkedIn = 0
  let withPerplexity = 0

  for (const record of records) {
    const signals = record.extracted_signals as any
    const apify = record.apify_raw as any
    const perp = record.perplexity_raw as string

    const triggerCount = signals?.triggers?.length || 0
    const hasLI = apify?.linkedin_personal?.posts?.length > 0 || apify?.linkedin_company?.posts?.length > 0
    const hasPerp = perp && perp.length > 100

    if (triggerCount > 0) withTriggers++
    else withoutTriggers++

    if (hasLI) withLinkedIn++
    if (hasPerp) withPerplexity++
  }

  console.log('=== SUMMARY ===')
  console.log(`Records WITH triggers: ${withTriggers}`)
  console.log(`Records WITHOUT triggers: ${withoutTriggers}`)
  console.log(`Records with LinkedIn data: ${withLinkedIn}`)
  console.log(`Records with Perplexity data: ${withPerplexity}`)
  console.log('')

  // Show the ones without triggers
  console.log('=== RECORDS WITHOUT TRIGGERS ===')
  for (const record of records) {
    const signals = record.extracted_signals as any
    const apify = record.apify_raw as any

    const triggerCount = signals?.triggers?.length || 0
    if (triggerCount === 0) {
      // Get lead info
      const { data: lead } = await supabase
        .from('leads')
        .select('first_name, last_name, company_name, linkedin_url')
        .eq('id', record.lead_id)
        .single()

      const hasPersonalLI = apify?.linkedin_personal?.posts?.length > 0
      const hasCompanyLI = apify?.linkedin_company?.posts?.length > 0

      console.log(`${lead?.first_name} ${lead?.last_name} @ ${lead?.company_name}`)
      console.log(`  LinkedIn URL: ${lead?.linkedin_url || 'NONE'}`)
      console.log(`  Personal LI posts: ${apify?.linkedin_personal?.posts?.length || 0}`)
      console.log(`  Company LI posts: ${apify?.linkedin_company?.posts?.length || 0}`)
      console.log(`  Waterfall: ${JSON.stringify(signals?.waterfall_summary || {})}`)
      console.log('')
    }
  }
}

check()
