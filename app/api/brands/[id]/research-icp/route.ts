/**
 * Brand-specific ICP Research Endpoint
 * Runs ICP research for a specific brand and saves results to the brands table
 */

import { createClient } from '@supabase/supabase-js'
import { getTenantLLM } from '@/src/lib/tenant-settings'
import type {
  AccountCriteria,
  ICPPersona,
  ICPTrigger,
  TenantICP,
} from '@/src/lib/tenant-settings'
import type { LLMClient } from '@/src/lib/llm'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to stream progress updates
function createStreamResponse() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null

  const stream = new ReadableStream({
    start(c) {
      controller = c
    },
  })

  return {
    stream,
    sendStage: (stage: string) => {
      controller?.enqueue(encoder.encode(`stage:${stage}\n`))
    },
    sendResult: (data: unknown) => {
      controller?.enqueue(encoder.encode(JSON.stringify(data)))
      controller?.close()
    },
    sendError: (error: string) => {
      controller?.enqueue(encoder.encode(JSON.stringify({ error })))
      controller?.close()
    },
  }
}

// Fetch website content
async function fetchWebsiteContent(url: string): Promise<string> {
  const fullUrl = url.startsWith('http') ? url : `https://${url}`

  try {
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SalesAgentBot/1.0; +https://jsbmedia.io)',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch website: ${response.status}`)
    }

    const html = await response.text()
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000)

    return text
  } catch (error) {
    console.error('Website fetch error:', error)
    throw new Error(`Could not fetch website content from ${url}`)
  }
}

// Run a prompt and get response using the tenant's configured LLM
async function runPrompt(llm: LLMClient, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await llm.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 4096 })

  return response.content
}

// Extract JSON from response
function extractJSON<T>(text: string): T {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim())
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }

  throw new Error('No JSON found in response')
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params
  const body = await request.json()
  const { websiteUrl, productName } = body

  if (!websiteUrl) {
    return new Response(
      JSON.stringify({ error: 'Website URL is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Verify brand exists
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, name, tenant_id')
    .eq('id', brandId)
    .single()

  if (brandError || !brand) {
    return new Response(
      JSON.stringify({ error: 'Brand not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Get tenant's configured LLM
  let llm: LLMClient
  try {
    llm = await getTenantLLM(brand.tenant_id)
  } catch {
    return new Response(
      JSON.stringify({ error: 'LLM not configured for this tenant. Please set up an AI provider in settings.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const brandName = productName || brand.name
  const { stream, sendStage, sendResult, sendError } = createStreamResponse()

  // Run research pipeline in background
  ;(async () => {
    try {
      // Step 1: Fetch website content
      sendStage('Fetching website content...')
      const websiteContent = await fetchWebsiteContent(websiteUrl)

      // Step 2: Analyze outcomes and departments (COMBINED to reduce LLM calls)
      sendStage('Analyzing brand outcomes and target departments...')
      const analysisResult = await runPrompt(
        llm,
        `You are an expert B2B sales strategist analyzing a company's website to understand their value proposition and ideal customer profile.`,
        `Analyze this website content from ${brandName} (${websiteUrl}):

${websiteContent}

Please identify:
1. The 5 main outcomes/results they provide for their customers (be specific and detailed)
2. What departments within companies should be targeted for sales outreach, with prioritization

Format your response as JSON:
{
  "outcomes": [
    { "name": "Outcome name", "description": "Detailed description of this outcome" }
  ],
  "targetDepartments": [
    { "name": "Department", "priority": "high|medium|low", "reasoning": "Why target this dept" }
  ]
}`
      )

      const analysisData = extractJSON<{
        outcomes: Array<{ name: string; description: string }>
        targetDepartments: Array<{ name: string; priority: string; reasoning: string }>
      }>(analysisResult)

      // Step 3: Deep department research
      sendStage('Researching department-specific personas and KPIs...')
      const departments = analysisData.targetDepartments.slice(0, 5).map((d) => d.name).join(', ')

      const deptResearchResult = await runPrompt(
        llm,
        `You are an expert B2B sales researcher with deep knowledge of organizational roles, KPIs, and pain points.`,
        `For ${brandName} which provides: ${analysisData.outcomes.map((o) => o.name).join(', ')}

Research these target departments: ${departments}

For each department, provide detailed research in this JSON format:
{
  "departmentResearch": [
    {
      "department": "Department name",
      "whatTheyCareAbout": "Business outcomes they care about",
      "kpis": ["Specific KPI 1", "Specific KPI 2", "Specific KPI 3"],
      "dayToDay": "How they spend their time to achieve outcomes",
      "commonStruggles": ["Struggle 1", "Struggle 2", "Struggle 3"],
      "costOfInaction": "Impact on person/KPIs/company if problems not solved",
      "howWeSolve": "How ${brandName}'s solution helps them hit KPIs"
    }
  ]
}`
      )

      const deptResearchData = extractJSON<{
        departmentResearch: Array<{
          department: string
          whatTheyCareAbout: string
          kpis: string[]
          dayToDay: string
          commonStruggles: string[]
          costOfInaction: string
          howWeSolve: string
        }>
      }>(deptResearchResult)

      // Step 4: Generate Account Criteria
      sendStage('Building account criteria profile...')
      const accountCriteriaResult = await runPrompt(
        llm,
        `You are an expert at defining Ideal Customer Profiles (ICP) for B2B sales.`,
        `Based on this research for ${brandName}:

Outcomes: ${analysisData.outcomes.map((o) => o.name).join(', ')}
Target departments: ${departments}
Department research: ${JSON.stringify(deptResearchData.departmentResearch.slice(0, 3))}

Generate detailed account criteria in this JSON format. Each array should have 3-7 items with priority (high/medium/low):
{
  "company_types": [{"value": "Company type description", "priority": "high|medium|low"}],
  "industries": [{"value": "Industry name", "priority": "high|medium|low"}],
  "company_sizes": [{"value": "Size description", "priority": "high|medium|low"}],
  "locations": [{"value": "Location", "priority": "high|medium|low"}],
  "revenue_ranges": [{"value": "Revenue range", "priority": "high|medium|low"}],
  "technologies": [{"value": "Technology/tool they use", "priority": "high|medium|low"}],
  "prospecting_signals": [{"value": "Signal that indicates they're a good fit", "priority": "high|medium|low"}]
}`
      )

      const accountCriteria = extractJSON<AccountCriteria>(accountCriteriaResult)

      // Step 5: Generate Personas
      sendStage('Creating target personas...')
      const personasResult = await runPrompt(
        llm,
        `You are an expert at creating buyer personas using the Jobs-To-Be-Done framework.`,
        `Based on this research for ${brandName}:

Outcomes: ${analysisData.outcomes.map((o) => `${o.name}: ${o.description}`).join('\n')}
Department research: ${JSON.stringify(deptResearchData.departmentResearch)}

Create exactly 5 target personas in this JSON format:
{
  "personas": [
    {
      "job_title": "Specific job title",
      "job_to_be_done": "The core job they're trying to accomplish",
      "currently_they": "What they currently struggle with or do inefficiently",
      "which_results_in": "The negative consequences of their current situation",
      "how_we_solve": "How ${brandName}'s solution addresses their problem",
      "additional_benefits": "Extra value they get beyond the core solution"
    }
  ]
}`
      )

      const personasData = extractJSON<{ personas: ICPPersona[] }>(personasResult)

      // Step 6: Generate Smart Triggers
      sendStage('Identifying buying triggers and signals...')
      const triggersResult = await runPrompt(
        llm,
        `You are an expert at identifying buying signals and triggers for B2B sales.`,
        `Based on this research for ${brandName}:

What they sell: ${analysisData.outcomes.map((o) => o.name).join(', ')}
Target personas: ${personasData.personas.map((p) => p.job_title).join(', ')}
Problems they solve: ${personasData.personas.map((p) => p.currently_they).join('; ')}

Create 6-10 smart triggers in this JSON format:
{
  "triggers": [
    {
      "name": "Short descriptive name",
      "what_to_look_for": ["keyword1", "phrase to look for", "pattern to match"],
      "source": "linkedin_personal|linkedin_company|perplexity",
      "reasoning": "Why this indicates buying readiness"
    }
  ]
}`
      )

      const triggersData = extractJSON<{ triggers: ICPTrigger[] }>(triggersResult)

      // Build the ICP object
      const icp: TenantICP = {
        account_criteria: accountCriteria,
        personas: personasData.personas,
        triggers: triggersData.triggers,
      }

      // Save to brand
      sendStage('Saving ICP to brand...')
      const { error: updateError } = await supabase
        .from('brands')
        .update({
          icp,
          icp_source_url: websiteUrl,
          icp_research_completed_at: new Date().toISOString(),
        })
        .eq('id', brandId)

      if (updateError) {
        console.error('Failed to save brand ICP:', updateError)
        throw new Error('Failed to save ICP to brand')
      }

      // Send final result
      sendStage('Research complete!')
      sendResult({
        brand_id: brandId,
        icp,
        source_url: websiteUrl,
        saved: true,
      })
    } catch (error) {
      console.error('Brand ICP Research error:', error)
      sendError(error instanceof Error ? error.message : 'Research failed')
    }
  })()

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// GET endpoint to retrieve brand's current ICP
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params

  const { data: brand, error } = await supabase
    .from('brands')
    .select('id, name, icp, icp_source_url, icp_research_completed_at')
    .eq('id', brandId)
    .single()

  if (error || !brand) {
    return new Response(
      JSON.stringify({ error: 'Brand not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      brand_id: brand.id,
      brand_name: brand.name,
      icp: brand.icp,
      source_url: brand.icp_source_url,
      last_researched_at: brand.icp_research_completed_at,
      has_icp: !!brand.icp,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
