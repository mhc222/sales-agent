/**
 * One-time script to normalize existing DNC domain entries
 * Converts URLs like "https://www.example.com/" to "example.com"
 *
 * Run with: npx tsx scripts/normalize-dnc-domains.ts
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeDomain(input: string): string {
  let domain = input.toLowerCase().trim()
  domain = domain.replace(/^https?:\/\//, '')
  domain = domain.replace(/^www\./, '')
  domain = domain.split('/')[0].split('?')[0].split('#')[0]
  domain = domain.split(':')[0]
  return domain
}

async function main() {
  console.log('Fetching DNC entries with domains...')

  const { data: entries, error } = await supabase
    .from('do_not_contact')
    .select('id, domain')
    .not('domain', 'is', null)

  if (error) {
    console.error('Error fetching entries:', error)
    process.exit(1)
  }

  console.log(`Found ${entries.length} domain entries`)

  let updated = 0
  let skipped = 0

  for (const entry of entries) {
    const normalized = normalizeDomain(entry.domain)

    if (normalized !== entry.domain) {
      const { error: updateError } = await supabase
        .from('do_not_contact')
        .update({ domain: normalized })
        .eq('id', entry.id)

      if (updateError) {
        console.error(`Error updating ${entry.id}:`, updateError)
      } else {
        console.log(`  ${entry.domain} → ${normalized}`)
        updated++
      }
    } else {
      skipped++
    }
  }

  console.log(`\nDone! Updated: ${updated}, Already normalized: ${skipped}`)
}

main()
