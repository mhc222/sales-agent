import { createLLMClient, type LLMProvider } from '@/src/lib/llm'
import type {
  AccountCriteria,
  ICPPersona,
  ICPTrigger,
} from '@/src/lib/tenant-settings'

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
  // Ensure URL has protocol
  const fullUrl = url.startsWith('http') ? url : `https://${url}`

  try {
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SalesAgentBot/1.0; +https://jsbmedia.io)',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch website: ${response.status}`)
    }

    const html = await response.text()

    // Basic HTML to text extraction (strip tags, keep content)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000) // Limit to ~15k chars

    return text
  } catch (error) {
    console.error('Website fetch error:', error)
    throw new Error(`Could not fetch website content from ${url}`)
  }
}

// Extract JSON from response (handles markdown code blocks)
function extractJSON<T>(text: string): T {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim())
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }

  throw new Error('No JSON found in response')
}

export async function POST(request: Request) {
  const body = await request.json()
  const { websiteUrl, companyName, llmConfig } = body

  if (!websiteUrl || !companyName) {
    return new Response(
      JSON.stringify({ error: 'Website URL and company name are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // LLM config is required - passed from onboarding flow
  if (!llmConfig?.provider || !llmConfig?.apiKey) {
    return new Response(
      JSON.stringify({ error: 'LLM configuration is required. Please set up your AI provider first.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Create LLM client from provided config
  const llm = createLLMClient({
    provider: llmConfig.provider as LLMProvider,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
  })

  const { stream, sendStage, sendResult, sendError } = createStreamResponse()

  // Run a prompt and get response using the tenant's LLM
  async function runPrompt(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])
    return response.content
  }

  // Run research pipeline in background
  ;(async () => {
    try {
      // Step 1: Fetch website content
      sendStage('Fetching website content...')
      const websiteContent = await fetchWebsiteContent(websiteUrl)

      // Step 2: Prompt 1 - Analyze outcomes and departments
      sendStage('Analyzing company outcomes and target departments...')
      const prompt1Result = await runPrompt(
        `You are an expert B2B sales strategist analyzing a company's website to understand their value proposition and ideal customer profile.`,
        `Analyze this website content from ${companyName} (${websiteUrl}):

${websiteContent}

Please identify:
1. The 5 main outcomes/results they provide for their customers (be specific and detailed)
2. What departments within companies should be targeted for sales outreach

Format your response as JSON:
{
  "outcomes": [
    { "name": "Outcome name", "description": "Detailed description of this outcome" }
  ],
  "suggestedDepartments": ["Department 1", "Department 2", ...]
}`
      )

      const prompt1Data = extractJSON<{
        outcomes: Array<{ name: string; description: string }>
        suggestedDepartments: string[]
      }>(prompt1Result)

      // Step 3: Prompt 2 - Refine target departments
      sendStage('Refining target department strategy...')
      const prompt2Result = await runPrompt(
        `You are an expert B2B sales strategist helping prioritize target departments for outreach.`,
        `Based on these company outcomes for ${companyName}:
${prompt1Data.outcomes.map((o) => `- ${o.name}: ${o.description}`).join('\n')}

And these suggested departments: ${prompt1Data.suggestedDepartments.join(', ')}

Which specific departments should be targeted for sales outreach? Consider:
- Who feels the pain these outcomes solve
- Who has budget authority
- Who would champion this solution

Return a prioritized JSON list:
{
  "targetDepartments": [
    { "name": "Department", "priority": "high|medium|low", "reasoning": "Why target this dept" }
  ]
}`
      )

      const prompt2Data = extractJSON<{
        targetDepartments: Array<{
          name: string
          priority: string
          reasoning: string
        }>
      }>(prompt2Result)

      // Step 4: Prompt 3 - Deep department research
      sendStage('Researching department-specific personas and KPIs...')
      const departments = prompt2Data.targetDepartments
        .slice(0, 5)
        .map((d) => d.name)
        .join(', ')

      const prompt3Result = await runPrompt(
        `You are an expert B2B sales researcher with deep knowledge of organizational roles, KPIs, and pain points.`,
        `For ${companyName} which provides: ${prompt1Data.outcomes.map((o) => o.name).join(', ')}

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
      "howWeSolve": "How ${companyName}'s solution helps them hit KPIs"
    }
  ]
}`
      )

      const prompt3Data = extractJSON<{
        departmentResearch: Array<{
          department: string
          whatTheyCareAbout: string
          kpis: string[]
          dayToDay: string
          commonStruggles: string[]
          costOfInaction: string
          howWeSolve: string
        }>
      }>(prompt3Result)

      // Step 5: Generate Account Criteria
      sendStage('Building account criteria profile...')
      const accountCriteriaResult = await runPrompt(
        `You are an expert at defining Ideal Customer Profiles (ICP) for B2B sales.`,
        `Based on this research for ${companyName}:

Outcomes: ${prompt1Data.outcomes.map((o) => o.name).join(', ')}
Target departments: ${departments}
Department research: ${JSON.stringify(prompt3Data.departmentResearch.slice(0, 3))}

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

      // Step 6: Generate Personas
      sendStage('Creating target personas...')
      const personasResult = await runPrompt(
        `You are an expert at creating buyer personas using the Jobs-To-Be-Done framework.`,
        `Based on this research for ${companyName}:

Outcomes: ${prompt1Data.outcomes.map((o) => `${o.name}: ${o.description}`).join('\n')}
Department research: ${JSON.stringify(prompt3Data.departmentResearch)}

Create exactly 5 target personas in this JSON format:
{
  "personas": [
    {
      "job_title": "Specific job title",
      "job_to_be_done": "The core job they're trying to accomplish",
      "currently_they": "What they currently struggle with or do inefficiently",
      "which_results_in": "The negative consequences of their current situation",
      "how_we_solve": "How ${companyName}'s solution addresses their problem",
      "additional_benefits": "Extra value they get beyond the core solution"
    }
  ]
}`
      )

      const personasData = extractJSON<{ personas: ICPPersona[] }>(personasResult)

      // Step 7: Generate Smart Triggers
      sendStage('Identifying buying triggers and signals...')
      const triggersResult = await runPrompt(
        `You are an expert at identifying buying signals and triggers for B2B sales. You understand what events, posts, and news indicate a company is ready to buy.`,
        `Based on this research for ${companyName}:

What they sell: ${prompt1Data.outcomes.map((o) => o.name).join(', ')}
Target personas: ${personasData.personas.map((p) => p.job_title).join(', ')}
Problems they solve: ${personasData.personas.map((p) => p.currently_they).join('; ')}

Create smart triggers that indicate a prospect is ready to buy. Think about:
- What would someone post on LinkedIn if they're experiencing these problems?
- What company news would signal they need this solution?
- What hiring patterns indicate they're scaling and need help?

Available data sources:
- linkedin_personal: Personal LinkedIn posts and activity
- linkedin_company: Company LinkedIn page, job postings, news
- perplexity: Web search for company news, funding, press releases

Return 6-10 unique, specific triggers in this JSON format:
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

      // Send final result
      sendStage('Research complete!')
      sendResult({
        accountCriteria,
        personas: personasData.personas,
        triggers: triggersData.triggers,
      })
    } catch (error) {
      console.error('ICP Research error:', error)
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
