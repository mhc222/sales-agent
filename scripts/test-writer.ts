import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeSequence } from '../src/agents/agent3-writer'
import type { ResearchResult } from '../src/agents/agent2-research'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function testWriter() {
  // Get email from command line args, or default to Lindsay
  const email = process.argv[2] || 'lwaiser@dglaw.com'

  console.log('=== AGENT 3: EMAIL SEQUENCE WRITER ===')
  console.log('')

  // Step 1: Get lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('email', email)
    .single()

  if (leadError || !lead) {
    console.error(`Lead not found: ${email}`)
    return
  }

  console.log(`Lead: ${lead.first_name} ${lead.last_name}`)
  console.log(`Company: ${lead.company_name}`)
  console.log(`Title: ${lead.job_title}`)
  console.log('')

  // Step 2: Get research
  const { data: researchRecord, error: researchError } = await supabase
    .from('research_records')
    .select('*')
    .eq('lead_id', lead.id)
    .single()

  if (researchError || !researchRecord) {
    console.error(`Research not found for lead: ${email}`)
    console.error('Run test-full-waterfall.ts first to generate research.')
    return
  }

  const research = researchRecord.extracted_signals as ResearchResult

  console.log('=== RESEARCH SUMMARY ===')
  console.log(`Persona: ${research.persona_match.type} (${research.persona_match.decision_level})`)
  console.log(`Relationship: ${research.relationship.type}`)
  console.log(`Who they serve: ${research.relationship.who_they_serve}`)
  console.log(`Top Trigger: ${research.triggers[0]?.fact?.substring(0, 80)}...`)
  console.log('')

  // Step 3: Generate sequence
  console.log('=== GENERATING SEQUENCE ===')
  console.log('(Using extended thinking - this may take a minute...)')
  console.log('')

  const startTime = Date.now()
  const sequence = await writeSequence({ lead, research })
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log(`Generation completed in ${elapsed}s`)
  console.log('')

  // Display results
  console.log('=== PAIN POINTS ===')
  console.log('')
  console.log('Pain 1 (Thread 1):')
  console.log(`  Pain: ${sequence.pain_1.pain}`)
  console.log(`  Implication: ${sequence.pain_1.implication}`)
  console.log(`  Solution: ${sequence.pain_1.solution}`)
  console.log(`  Social Proof: ${sequence.pain_1.social_proof}`)
  console.log('')
  console.log('Pain 2 (Thread 2):')
  console.log(`  Pain: ${sequence.pain_2.pain}`)
  console.log(`  Implication: ${sequence.pain_2.implication}`)
  console.log(`  Solution: ${sequence.pain_2.solution}`)
  console.log(`  Social Proof: ${sequence.pain_2.social_proof}`)
  console.log('')

  console.log('=== THREAD 1 ===')
  console.log(`Subject: ${sequence.thread_1.subject}`)
  console.log('')
  sequence.thread_1.emails.forEach((email) => {
    console.log(`--- Email ${email.email_number} (Day ${email.day}) - ${email.structure} ---`)
    console.log(`Words: ${email.word_count}`)
    console.log('')
    console.log(email.body)
    console.log('')
  })

  console.log('=== THREAD 2 ===')
  console.log(`Subject: ${sequence.thread_2.subject}`)
  console.log('')
  sequence.thread_2.emails.forEach((email) => {
    console.log(`--- Email ${email.email_number} (Day ${email.day}) - ${email.structure} ---`)
    console.log(`Words: ${email.word_count}`)
    console.log('')
    console.log(email.body)
    console.log('')
  })

  // Optional: Store to memory
  const storeArg = process.argv.find(arg => arg === '--store')
  if (storeArg) {
    console.log('=== STORING TO MEMORY ===')
    const { error: memoryError } = await supabase.from('lead_memories').insert({
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      source: 'agent3_writer',
      memory_type: 'sequence_generated',
      content: {
        relationship_type: sequence.relationship_type,
        pain_1: sequence.pain_1,
        pain_2: sequence.pain_2,
        thread_1_subject: sequence.thread_1.subject,
        thread_2_subject: sequence.thread_2.subject,
        email_count: sequence.thread_1.emails.length + sequence.thread_2.emails.length,
      },
      summary: `Generated ${sequence.thread_1.emails.length + sequence.thread_2.emails.length}-email sequence for ${sequence.relationship_type} relationship`,
    })

    if (memoryError) {
      console.error('Error storing memory:', memoryError)
    } else {
      console.log('Memory stored successfully!')
    }
  }
}

testWriter()
