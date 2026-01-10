import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { scrapeLinkedInProfile, scrapeLinkedInCompany } from '../src/lib/apify'
import { searchTriggers, searchPerson, combineSearchResults } from '../src/lib/perplexity'
import { researchLead } from '../src/agents/agent2-research'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function testFullWaterfall() {
  // Get Lindsay
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('email', 'lwaiser@dglaw.com')
    .single()

  if (error || !lead) {
    console.error('Lead not found:', error)
    return
  }

  console.log('Testing full waterfall for:', lead.first_name, lead.last_name)
  console.log('Personal LinkedIn:', lead.linkedin_url)
  console.log('Company LinkedIn:', lead.company_linkedin_url)
  console.log('')

  // Step 1: Personal LinkedIn
  console.log('=== STEP 1: Personal LinkedIn ===')
  const linkedinProfile = await scrapeLinkedInProfile(lead.linkedin_url)
  console.log('Result:', linkedinProfile ? `${(linkedinProfile as any).posts?.length || 0} posts found` : 'No data')
  console.log('')

  // Step 2: Company LinkedIn
  console.log('=== STEP 2: Company LinkedIn ===')
  const linkedinCompany = await scrapeLinkedInCompany(lead.company_linkedin_url)
  console.log('Result:', linkedinCompany ? `${(linkedinCompany as any).posts?.length || 0} posts found` : 'No data')
  console.log('')

  // Step 3: Perplexity
  console.log('=== STEP 3: Perplexity Web Search ===')
  const triggerSearch = await searchTriggers(lead.company_name, lead.company_domain || undefined)
  const personSearch = await searchPerson(
    `${lead.first_name} ${lead.last_name}`,
    lead.company_name,
    lead.job_title || undefined
  )
  const { combinedContent, allCitations } = combineSearchResults([triggerSearch, personSearch])
  const perplexityResults = combinedContent ? {
    content: combinedContent,
    citations: allCitations,
    query: `${lead.company_name} + ${lead.first_name} ${lead.last_name}`,
  } : null
  console.log('Result:', perplexityResults ? `Found data with ${allCitations.length} citations` : 'No data')
  console.log('')

  // Synthesis
  console.log('=== SYNTHESIS: Research Analyst ===')
  const research = await researchLead(lead, {
    linkedinProfile: linkedinProfile as Record<string, unknown> | null,
    linkedinCompany: linkedinCompany as Record<string, unknown> | null,
    perplexityResults,
  })

  console.log('')
  console.log('=== RESULTS ===')
  console.log('Persona:', research.persona_match.type, '-', research.persona_match.decision_level)
  console.log('Confidence:', research.persona_match.confidence)
  console.log('')
  console.log('Triggers:', research.triggers.length)
  research.triggers.forEach((t, i) => {
    console.log(`  #${i + 1} [${t.type}] Score: ${t.scores.total}/15 - ${t.fact.substring(0, 80)}...`)
  })
  console.log('')
  console.log('Messaging Angles:', research.messaging_angles.length)
  research.messaging_angles.forEach((a, i) => {
    console.log(`  #${i + 1}: ${a.angle.substring(0, 80)}...`)
  })

  // Store results
  console.log('')
  console.log('=== STORING RESULTS ===')

  // 1. Upsert to research_records (current state snapshot)
  const { error: researchError } = await supabase.from('research_records').upsert(
    {
      lead_id: lead.id,
      perplexity_raw: perplexityResults?.content || null,
      apify_raw: {
        linkedin_personal: linkedinProfile,
        linkedin_company: linkedinCompany,
      },
      extracted_signals: {
        persona_match: research.persona_match,
        triggers: research.triggers,
        messaging_angles: research.messaging_angles,
        company_intel: research.company_intel,
        relationship: research.relationship,
        waterfall_summary: {
          personal_linkedin_used: !!linkedinProfile,
          company_linkedin_used: !!linkedinCompany,
          perplexity_used: !!perplexityResults,
          early_stop: false, // Ran all 3 steps
        },
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'lead_id' }
  )

  if (researchError) {
    console.error('Error storing research:', researchError)
  } else {
    console.log('Research records stored successfully!')
  }

  // 2. Append to lead_memories (history log)
  const topTrigger = research.triggers[0]
  const memorySummary = `${research.persona_match.type} (${research.persona_match.decision_level}), ${research.relationship.type}: ${topTrigger?.fact?.substring(0, 100) || 'No triggers'}...`

  const { error: memoryError } = await supabase.from('lead_memories').insert({
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    source: 'agent2_research',
    memory_type: 'research',
    content: {
      persona_match: research.persona_match,
      triggers: research.triggers,
      messaging_angles: research.messaging_angles,
      company_intel: research.company_intel,
      relationship: research.relationship,
      waterfall_summary: {
        personal_linkedin_used: !!linkedinProfile,
        company_linkedin_used: !!linkedinCompany,
        perplexity_used: !!perplexityResults,
        early_stop: false,
      },
    },
    summary: memorySummary,
  })

  if (memoryError) {
    console.error('Error storing memory:', memoryError)
  } else {
    console.log('Lead memory stored successfully!')
  }
}

testFullWaterfall()
