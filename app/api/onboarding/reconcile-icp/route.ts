import { createLLMClient, type LLMProvider } from '@/src/lib/llm'
import type {
  AccountCriteria,
  ICPPersona,
  ICPTrigger,
} from '@/src/lib/tenant-settings'

interface ReconcileRequest {
  companyName: string
  marketResearch: string
  currentICP: {
    accountCriteria: AccountCriteria
    personas: ICPPersona[]
    triggers: ICPTrigger[]
  }
  llmConfig: {
    provider: LLMProvider
    apiKey: string
    model?: string
  }
}

interface ReconcileResponse {
  accountCriteria: AccountCriteria
  personas: ICPPersona[]
  triggers: ICPTrigger[]
  changes: {
    category: string
    description: string
    reason: string
  }[]
}

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
  const body: ReconcileRequest = await request.json()
  const { companyName, marketResearch, currentICP, llmConfig } = body

  if (!marketResearch?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Market research content is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!currentICP?.accountCriteria || !currentICP?.personas || !currentICP?.triggers) {
    return new Response(
      JSON.stringify({ error: 'Current ICP data is required' }),
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
    provider: llmConfig.provider,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
  })

  const { stream, sendStage, sendResult, sendError } = createStreamResponse()

  // Run a prompt and get response using the tenant's LLM
  async function runPrompt(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { maxTokens: 8192 })
    return response.content
  }

  // Run reconciliation pipeline in background
  ;(async () => {
    try {
      // Step 1: Parse and extract insights from market research
      sendStage('Parsing your market research and case studies...')

      const parseText = await runPrompt(
        `You are an expert B2B sales analyst. Your job is to extract actionable insights from market research, case studies, and customer knowledge that a human has provided.

Be thorough - extract every piece of useful information including:
- Specific customer types, industries, or company profiles mentioned
- Job titles, roles, or personas discussed
- Pain points, challenges, or problems customers face
- Buying triggers, signals, or events that indicate readiness
- Success stories, results, or outcomes achieved
- Objections, concerns, or hesitations
- Competitive insights
- Any specific language, phrases, or terminology used`,
        `Parse this market research and case study content from ${companyName}. Extract all insights that could inform our Ideal Customer Profile.

MARKET RESEARCH CONTENT:
${marketResearch}

Return a JSON object with extracted insights:
{
  "customerProfiles": [
    { "description": "Description of customer type", "source": "What in the text indicated this" }
  ],
  "personas": [
    { "title": "Job title or role", "painPoints": ["pain 1"], "goals": ["goal 1"], "source": "What indicated this" }
  ],
  "triggers": [
    { "signal": "What event/behavior indicates buying readiness", "source": "What indicated this" }
  ],
  "outcomes": [
    { "result": "Result or outcome achieved", "source": "What case study or example showed this" }
  ],
  "industries": ["Industry mentioned"],
  "companySizes": ["Size mentioned"],
  "locations": ["Location mentioned"],
  "technologies": ["Technology mentioned"],
  "keyPhrases": ["Important phrases or language to use"],
  "otherInsights": ["Any other relevant insights"]
}`
      )

      const humanInsights = extractJSON<{
        customerProfiles: Array<{ description: string; source: string }>
        personas: Array<{ title: string; painPoints: string[]; goals: string[]; source: string }>
        triggers: Array<{ signal: string; source: string }>
        outcomes: Array<{ result: string; source: string }>
        industries: string[]
        companySizes: string[]
        locations: string[]
        technologies: string[]
        keyPhrases: string[]
        otherInsights: string[]
      }>(parseText)

      // Step 2: Compare and reconcile with current ICP
      sendStage('Comparing human knowledge with AI research...')

      const reconcileText = await runPrompt(
        `You are an expert at reconciling AI-generated research with human knowledge.

CRITICAL RULES:
1. HUMAN KNOWLEDGE ALWAYS WINS - if the human's input contradicts AI research, prefer the human version
2. ADD don't just replace - incorporate human insights into the existing structure
3. BE SPECIFIC - use exact language, phrases, and terminology from the human input
4. TRACK CHANGES - document every modification you make and why
5. PRESERVE GOOD AI WORK - if AI research covers something human didn't mention, keep it
6. ENHANCE WITH CONTEXT - use human case studies to make personas and triggers more specific`,
        `Reconcile this AI-generated ICP with human knowledge. The human knows their business better than AI - prefer their insights.

CURRENT AI-GENERATED ICP:
${JSON.stringify(currentICP, null, 2)}

HUMAN-PROVIDED INSIGHTS (extracted from their market research):
${JSON.stringify(humanInsights, null, 2)}

ORIGINAL MARKET RESEARCH TEXT (for context and exact phrasing):
${marketResearch}

Instructions:
1. Update Account Criteria with any industries, company sizes, locations, technologies from human input
2. Update or add Personas based on human-mentioned roles and pain points
3. Update or add Triggers based on human-mentioned buying signals
4. Use exact language from human input where possible
5. Track all changes made

Return JSON:
{
  "accountCriteria": {
    "company_types": [{"value": "...", "priority": "high|medium|low"}],
    "industries": [{"value": "...", "priority": "high|medium|low"}],
    "company_sizes": [{"value": "...", "priority": "high|medium|low"}],
    "locations": [{"value": "...", "priority": "high|medium|low"}],
    "revenue_ranges": [{"value": "...", "priority": "high|medium|low"}],
    "technologies": [{"value": "...", "priority": "high|medium|low"}],
    "prospecting_signals": [{"value": "...", "priority": "high|medium|low"}]
  },
  "personas": [
    {
      "job_title": "...",
      "job_to_be_done": "...",
      "currently_they": "...",
      "which_results_in": "...",
      "how_we_solve": "...",
      "additional_benefits": "..."
    }
  ],
  "triggers": [
    {
      "name": "...",
      "what_to_look_for": ["keyword1", "phrase2"],
      "source": "linkedin_personal|linkedin_company|perplexity",
      "reasoning": "..."
    }
  ],
  "changes": [
    {
      "category": "personas|triggers|accountCriteria",
      "description": "What was changed",
      "reason": "Why (what human input drove this change)"
    }
  ]
}`
      )

      const reconciled = extractJSON<ReconcileResponse>(reconcileText)

      // Step 3: Validate and finalize
      sendStage('Finalizing reconciled ICP...')

      // Ensure we have required fields
      if (!reconciled.accountCriteria || !reconciled.personas || !reconciled.triggers) {
        throw new Error('Reconciliation produced incomplete results')
      }

      // Ensure personas have all required fields
      reconciled.personas = reconciled.personas.map(p => ({
        job_title: p.job_title || 'Unknown Role',
        job_to_be_done: p.job_to_be_done || '',
        currently_they: p.currently_they || '',
        which_results_in: p.which_results_in || '',
        how_we_solve: p.how_we_solve || '',
        additional_benefits: p.additional_benefits || '',
      }))

      // Ensure triggers have all required fields
      reconciled.triggers = reconciled.triggers.map(t => ({
        name: t.name || 'Unknown Trigger',
        what_to_look_for: t.what_to_look_for || [],
        source: t.source || 'linkedin_personal',
        reasoning: t.reasoning || '',
      }))

      sendStage('Reconciliation complete!')
      sendResult({
        accountCriteria: reconciled.accountCriteria,
        personas: reconciled.personas,
        triggers: reconciled.triggers,
        changes: reconciled.changes || [],
      })
    } catch (error) {
      console.error('ICP Reconciliation error:', error)
      sendError(error instanceof Error ? error.message : 'Reconciliation failed')
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
