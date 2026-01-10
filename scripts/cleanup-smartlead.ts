/**
 * Cleanup Smartlead - Delete all campaigns
 * Run: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/cleanup-smartlead.ts
 */

import * as readline from 'readline'

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY
const SMARTLEAD_BASE_URL = 'https://server.smartlead.ai/api/v1'

if (!SMARTLEAD_API_KEY) {
  console.error('Error: SMARTLEAD_API_KEY not set')
  process.exit(1)
}

interface Campaign {
  id: number
  name: string
  status: string
}

async function getCampaigns(): Promise<Campaign[]> {
  const response = await fetch(`${SMARTLEAD_BASE_URL}/campaigns?api_key=${SMARTLEAD_API_KEY}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch campaigns: ${response.status}`)
  }
  return response.json()
}

async function deleteCampaign(campaignId: number): Promise<{ success: boolean; status: number; message?: string }> {
  try {
    const response = await fetch(`${SMARTLEAD_BASE_URL}/campaigns/${campaignId}?api_key=${SMARTLEAD_API_KEY}`, {
      method: 'DELETE',
    })
    const data = await response.json().catch(() => ({}))
    return {
      success: response.ok,
      status: response.status,
      message: data.message || data.error || undefined,
    }
  } catch (error) {
    return {
      success: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toUpperCase() === 'YES')
    })
  })
}

async function main() {
  console.log('Fetching all campaigns from Smartlead...\n')

  const campaigns = await getCampaigns()

  if (campaigns.length === 0) {
    console.log('No campaigns found. Nothing to delete.')
    return
  }

  console.log(`Found ${campaigns.length} campaign(s):\n`)
  campaigns.forEach((c) => {
    console.log(`  - ${c.id}: ${c.name} (${c.status})`)
  })

  console.log('\n⚠️  WARNING: This will permanently delete ALL campaigns and their leads!')
  const confirmed = await confirm('\nAre you sure? Type YES to continue: ')

  if (!confirmed) {
    console.log('\nAborted. No campaigns were deleted.')
    return
  }

  console.log('\nDeleting campaigns...\n')

  let deleted = 0
  let failed = 0

  for (const campaign of campaigns) {
    process.stdout.write(`Deleting campaign ${campaign.id} (${campaign.name})... `)
    const result = await deleteCampaign(campaign.id)

    if (result.success) {
      console.log(`✅ Deleted (${result.status})`)
      deleted++
    } else {
      console.log(`❌ Failed (${result.status}): ${result.message || 'Unknown error'}`)
      failed++
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log(`Complete! Deleted: ${deleted}, Failed: ${failed}`)
  console.log('='.repeat(50))
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
