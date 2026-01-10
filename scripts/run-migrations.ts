import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkColumns() {
  console.log('Checking columns...')

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .limit(1)

  if (error) {
    console.error('Error querying leads:', error.message)
    return
  }

  if (data && data.length > 0) {
    const lead = data[0]
    console.log('\nExisting columns in leads table:')
    console.log(Object.keys(lead).join(', '))

    const hasQualification = 'qualification' in lead
    const hasSource = 'source' in lead

    console.log('\n--- Column Status ---')
    console.log('qualification:', hasQualification ? 'EXISTS' : 'MISSING')
    console.log('source:', hasSource ? 'EXISTS' : 'MISSING')

    if (!hasQualification) {
      console.log('\n--- Run this SQL in Supabase Dashboard for qualification ---')
      console.log(`
ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualification VARCHAR DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_qualification_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_qualification_check
    CHECK (qualification IN ('pending', 'qualified', 'disqualified', 'review'));
  END IF;
END$$;

UPDATE leads SET qualification = 'qualified'
WHERE status IN ('researched', 'sequence_ready', 'deployed', 'replied', 'meeting_booked');

CREATE INDEX IF NOT EXISTS idx_leads_qualification ON leads(qualification);
      `)
    }

    if (!hasSource) {
      console.log('\n--- Run this SQL in Supabase Dashboard for source ---')
      console.log(`
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'jsb_site_pixel';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_source_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_source_check
    CHECK (source IN ('jsb_site_pixel', 'audience_lab', 'apollo_search', 'linkedin_search', 'manual'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
      `)
    }
  } else {
    console.log('No leads in database yet')
  }
}

checkColumns().then(() => {
  console.log('\nDone')
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
