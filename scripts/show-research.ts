import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function showResults() {
  const { data } = await supabase
    .from('research_records')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) {
    console.log('No research found yet')
    return
  }

  const signals = data.extracted_signals

  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║              OUTBOUND RESEARCH ANALYST RESULTS                   ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  console.log('')

  console.log('▸ PERSONA MATCH')
  console.log('  Type:', signals.persona_match?.type)
  console.log('  Level:', signals.persona_match?.decision_level)
  console.log('  Confidence:', signals.persona_match?.confidence)
  console.log('  Reasoning:', signals.persona_match?.reasoning)
  console.log('')

  console.log('▸ TRIGGERS (Stack Ranked)')
  signals.triggers?.forEach((t: any, i: number) => {
    console.log(`  #${i + 1} [${t.type.toUpperCase()}] Score: ${t.scores.total}/15`)
    console.log(`      Fact: ${t.fact}`)
    console.log(`      Source: ${t.source || 'N/A'}`)
    console.log(`      Date: ${t.date || 'N/A'}`)
    console.log(
      `      (Impact: ${t.scores.impact}, Recency: ${t.scores.recency}, Relevance: ${t.scores.relevance})`
    )
    if (t.content_excerpt) {
      console.log(`      Content: "${t.content_excerpt.substring(0, 150)}${t.content_excerpt.length > 150 ? '...' : ''}"`)
    }
    console.log('')
  })

  console.log('▸ MESSAGING ANGLES')
  signals.messaging_angles?.forEach((a: any, i: number) => {
    console.log(`  #${i + 1}: ${a.angle}`)
    console.log(`      Triggers: ${a.triggers_used.join(', ')}`)
    console.log(`      Why this creates an opening: ${a.why_opening}`)
    console.log('')
  })

  console.log('▸ COMPANY INTEL')
  console.log('  Tech Stack:', signals.company_intel?.tech_stack?.join(', ') || 'None found')
  console.log('  Growth Signals:', signals.company_intel?.growth_signals?.length || 0, 'found')
  console.log('')

  console.log('▸ RELATIONSHIP')
  console.log('  Type:', signals.relationship?.type || 'Not determined')
  console.log('  Who they serve:', signals.relationship?.who_they_serve || 'N/A')
  console.log('  Opening question:', signals.relationship?.opening_question || 'N/A')
  console.log('  Reasoning:', signals.relationship?.reasoning || 'N/A')
}

showResults()
