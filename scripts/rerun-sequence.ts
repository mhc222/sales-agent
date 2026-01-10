/**
 * Script to re-run the writer agent for a lead
 * Usage: npx tsx scripts/rerun-sequence.ts <lead-email>
 */

// Load env first
require('dotenv').config({ path: '.env.local' })

import { writeSequence } from '../src/agents/agent3-writer'
import { supabase } from '../src/lib/supabase'

async function main() {
  const email = process.argv[2] || 'lwaiser@dglaw.com'

  console.log(`Looking up lead: ${email}`)

  // Get lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('email', email)
    .single()

  if (leadError || !lead) {
    console.error('Lead not found:', leadError)
    process.exit(1)
  }

  console.log(`Found lead: ${lead.first_name} ${lead.last_name} at ${lead.company_name}`)

  // Get research from research_records table
  const { data: researchRecord, error: researchError } = await supabase
    .from('research_records')
    .select('extracted_signals')
    .eq('lead_id', lead.id)
    .single()

  if (researchError || !researchRecord) {
    console.error('Research not found:', researchError)
    process.exit(1)
  }

  const signals = researchRecord.extracted_signals

  console.log(`Found research with ${signals.triggers?.length || 0} triggers`)
  console.log(`Relationship type: ${signals.relationship?.type}`)
  console.log(`Persona: ${signals.persona_match?.type}`)

  // Build research object from extracted_signals
  const research = {
    lead_id: lead.id,
    persona_match: signals.persona_match,
    relationship: signals.relationship,
    triggers: signals.triggers || [],
    messaging_angles: signals.messaging_angles || [],
    signals_analyzed: signals.signals_analyzed || {},
    metadata: signals.metadata || {},
    linkedin_personal: signals.linkedin_personal || null,
    linkedin_company: signals.linkedin_company || null,
    perplexity_results: signals.perplexity_results || null,
    company_intel: signals.company_intel || null,
  } as any

  // Delete any existing sequence for this lead
  console.log('\nDeleting existing sequence if any...')
  const { error: deleteError } = await supabase
    .from('email_sequences')
    .delete()
    .eq('lead_id', lead.id)

  if (deleteError) {
    console.log('No existing sequence or delete error:', deleteError.message)
  } else {
    console.log('Existing sequence deleted')
  }

  console.log('\n--- Running Writer Agent ---\n')

  try {
    const sequence = await writeSequence({ lead, research })

    console.log('\n--- Sequence Generated ---')
    console.log(`Thread 1 Subject: ${sequence.thread_1.subject}`)
    console.log(`Thread 2 Subject: ${sequence.thread_2.subject}`)
    console.log(`Pain 1: ${sequence.pain_1.pain}`)
    console.log(`Pain 2: ${sequence.pain_2.pain}`)
    console.log(`Total emails: ${sequence.thread_1.emails.length + sequence.thread_2.emails.length}`)

    console.log('\n--- Email 1 Preview ---')
    console.log(sequence.thread_1.emails[0].body)

    console.log('\n--- Email 4 Preview ---')
    console.log(sequence.thread_2.emails[0].body)

    console.log('\nSequence saved to database successfully!')
  } catch (error) {
    console.error('Failed to generate sequence:', error)
    process.exit(1)
  }
}

main()
