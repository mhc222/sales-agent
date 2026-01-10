/**
 * Setup Smartlead template campaign
 * Run: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/setup-smartlead.ts
 */

import { getCampaigns, getCampaign, addSequencesToCampaign } from '../src/lib/smartlead'

const TEMPLATE_SEQUENCES = [
  { subject: '{{thread_1_subject}}', body: '{{email_1_body}}', delay_days: 0 },
  { subject: 'Re: {{thread_1_subject}}', body: '{{email_2_body}}', delay_days: 2 },
  { subject: 'Re: {{thread_1_subject}}', body: '{{email_3_body}}', delay_days: 2 },
  { subject: '{{thread_2_subject}}', body: '{{email_4_body}}', delay_days: 7 },
  { subject: 'Re: {{thread_2_subject}}', body: '{{email_5_body}}', delay_days: 3 },
  { subject: 'Re: {{thread_2_subject}}', body: '{{email_6_body}}', delay_days: 3 },
  { subject: 'Re: {{thread_2_subject}}', body: '{{email_7_body}}', delay_days: 3 },
]

async function main() {
  const action = process.argv[2] // 'add-sequences' to add sequences to existing campaign

  console.log('Testing Smartlead connection...\n')

  try {
    // List existing campaigns
    const campaigns = await getCampaigns()
    console.log(`Found ${campaigns.length} existing campaigns:`)
    campaigns.forEach(c => {
      console.log(`  - ${c.id}: ${c.name} (${c.status})`)
    })

    // Find JSB Dynamic campaign
    const templateCampaign = campaigns.find(c => c.name.includes('JSB Dynamic'))

    if (!templateCampaign) {
      console.log('\nNo JSB Dynamic campaign found. Create one in Smartlead first.')
      return
    }

    console.log(`\n✓ Template campaign: ${templateCampaign.id} - ${templateCampaign.name}`)

    // Check if we need to add sequences
    if (action === 'add-sequences') {
      console.log('\nAdding sequences to campaign...')
      await addSequencesToCampaign(templateCampaign.id, TEMPLATE_SEQUENCES)
      console.log('✓ Sequences added!')
    }

    // Get campaign details
    const details = await getCampaign(templateCampaign.id)
    console.log(`\nCampaign details:`, JSON.stringify(details, null, 2))

    console.log(`\nSet this in your env: SMARTLEAD_CAMPAIGN_ID=${templateCampaign.id}`)

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
