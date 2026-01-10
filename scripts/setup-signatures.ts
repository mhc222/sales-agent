/**
 * Setup Email Signatures for all Smartlead Mailboxes
 * Run: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/setup-signatures.ts
 */

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY
const SMARTLEAD_BASE_URL = 'https://server.smartlead.ai/api/v1'

if (!SMARTLEAD_API_KEY) {
  console.error('Error: SMARTLEAD_API_KEY not set')
  process.exit(1)
}

// ============================================================================
// SIGNATURE TEMPLATE
// ============================================================================

function generateSignature(senderEmail: string): string {
  return `<div style="border-left: 3px solid #0066FF; padding-left: 15px; font-family: Arial, sans-serif;">
  <div style="color: #0066FF; font-weight: bold; font-size: 14px;">Jordan Bratter</div>
  <div style="color: #666666; font-size: 12px;">President and Founder</div>
  <div style="margin-top: 8px; font-size: 12px; color: #333333;">
    JSB Media, LLC
  </div>
  <div style="margin-top: 8px; font-size: 12px; color: #333333;">
    E <a href="mailto:${senderEmail}" style="color: #0066FF; text-decoration: none;">${senderEmail}</a><br/>
    W <a href="https://jsbmedia.io" style="color: #0066FF; text-decoration: none;">jsbmedia.io</a>
  </div>
</div>`
}

// ============================================================================
// API HELPERS
// ============================================================================

interface Mailbox {
  id: number
  from_email: string
  from_name: string
  is_smtp_success: boolean
  is_imap_success: boolean
  signature: string | null
}

interface UpdateResult {
  mailbox_id: number
  sender_email: string
  status: 'success' | 'failed'
  error?: string
}

async function smartleadRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${SMARTLEAD_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${SMARTLEAD_API_KEY}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`Smartlead API error (${response.status}): ${JSON.stringify(data)}`)
  }

  return data
}

// ============================================================================
// MAILBOX FUNCTIONS
// ============================================================================

async function listMailboxes(): Promise<Mailbox[]> {
  console.log('\n📬 Fetching all mailboxes...\n')
  const mailboxes = await smartleadRequest<Mailbox[]>('/email-accounts')
  return mailboxes
}

async function updateMailboxSignature(
  mailboxId: number,
  signature: string
): Promise<void> {
  await smartleadRequest(`/email-accounts/${mailboxId}`, {
    method: 'POST',
    body: JSON.stringify({ signature }),
  })
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('📝 SMARTLEAD SIGNATURE SETUP')
  console.log('='.repeat(60))

  const mailboxes = await listMailboxes()

  if (mailboxes.length === 0) {
    console.log('No mailboxes found.')
    return
  }

  console.log(`Found ${mailboxes.length} mailbox(es)\n`)

  const results: UpdateResult[] = []

  for (const mailbox of mailboxes) {
    const senderEmail = mailbox.from_email
    const signature = generateSignature(senderEmail)

    process.stdout.write(`  ${mailbox.id}: ${senderEmail}... `)

    try {
      await updateMailboxSignature(mailbox.id, signature)
      console.log('✅ Signature applied')
      results.push({
        mailbox_id: mailbox.id,
        sender_email: senderEmail,
        status: 'success',
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.log(`❌ Failed: ${errorMsg}`)
      results.push({
        mailbox_id: mailbox.id,
        sender_email: senderEmail,
        status: 'failed',
        error: errorMsg,
      })
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 SUMMARY')
  console.log('='.repeat(60))

  const successful = results.filter(r => r.status === 'success').length
  const failed = results.filter(r => r.status === 'failed').length

  console.log(`\n  ✅ Successful: ${successful}`)
  console.log(`  ❌ Failed: ${failed}`)

  console.log('\n📋 Results:\n')
  console.log('  ' + '-'.repeat(56))
  console.log('  | Mailbox ID   | Sender Email                    | Status  |')
  console.log('  ' + '-'.repeat(56))

  for (const result of results) {
    const emailPadded = result.sender_email.padEnd(31).substring(0, 31)
    const statusIcon = result.status === 'success' ? '✅' : '❌'
    console.log(`  | ${String(result.mailbox_id).padEnd(12)} | ${emailPadded} | ${statusIcon}      |`)
  }

  console.log('  ' + '-'.repeat(56))

  // Show signature preview
  console.log('\n📝 Signature Preview (first mailbox):\n')
  if (mailboxes.length > 0) {
    console.log('  HTML:')
    const previewSig = generateSignature(mailboxes[0].from_email)
    previewSig.split('\n').forEach(line => console.log(`    ${line}`))
  }

  console.log('\n✅ Done!')
}

main().catch((error) => {
  console.error('\n❌ Error:', error)
  process.exit(1)
})
