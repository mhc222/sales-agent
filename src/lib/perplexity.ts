/**
 * Perplexity API Client
 * Enhanced with multi-query approach for targeted signal extraction
 */

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions'

// Use sonar model for online search capabilities
const MODEL = 'sonar'

// ============================================================================
// TYPES
// ============================================================================

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface PerplexityResponse {
  id: string
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  citations?: string[]
}

export interface WebSearchResult {
  content: string
  citations: string[]
  query: string
}

// Enhanced types for multi-query research
export interface SignalWithRecency {
  raw: string
  mostRecentDate: Date | string | null // string for JSON serialization through Inngest
  recency: 'hot' | 'warm' | 'relevant' | 'stale' | 'unknown'
  daysAgo: number | null
  keyFindings: string[]
}

export interface PerplexityResearch {
  funding: SignalWithRecency
  hiring: SignalWithRecency
  pain: SignalWithRecency
  personVisibility: SignalWithRecency
  triggers: {
    recentFunding: boolean
    activelyHiring: boolean
    competitivePressure: boolean
    personInNews: boolean
  }
  summary: string
}

// ============================================================================
// CORE API FUNCTIONS
// ============================================================================

async function getPerplexityApiKey(): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey || apiKey === 'pplx-xxx') {
    throw new Error('PERPLEXITY_API_KEY not configured')
  }
  return apiKey
}

/**
 * Search the web using Perplexity's online model
 */
export async function searchWeb(query: string): Promise<WebSearchResult | null> {
  const apiKey = await getPerplexityApiKey()

  console.log(`[Perplexity] Searching: ${query}`)

  const messages: PerplexityMessage[] = [
    {
      role: 'system',
      content: `You are a research assistant finding recent, factual information about companies and people.
Focus on:
- Recent news and announcements (last 12 months, prefer last 90 days)
- Funding rounds and financial news
- Leadership changes and key hires
- Product launches and company updates
- Industry analysis and market positioning
- Public filings (10K, earnings) if available

Always cite your sources. Be factual and concise. Include dates when available.`,
    },
    {
      role: 'user',
      content: query,
    },
  ]

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 2000,
        temperature: 0.2,
        return_citations: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Perplexity API error: ${response.status} - ${error}`)
    }

    const data = (await response.json()) as PerplexityResponse

    if (data.choices && data.choices.length > 0) {
      console.log('[Perplexity] Search completed successfully')
      return {
        content: data.choices[0].message.content,
        citations: data.citations || [],
        query,
      }
    }

    console.log('[Perplexity] No results returned')
    return null
  } catch (error) {
    console.error('[Perplexity] Search error:', error)
    return null
  }
}

// ============================================================================
// LEGACY FUNCTIONS (Backwards Compatible)
// ============================================================================

/**
 * Search for company-specific information
 */
export async function searchCompany(companyName: string, companyDomain?: string): Promise<WebSearchResult | null> {
  const domainPart = companyDomain ? ` (${companyDomain})` : ''
  const query = `${companyName}${domainPart} company recent news funding hiring leadership changes product launches last 12 months`

  return searchWeb(query)
}

/**
 * Search for person-specific information
 */
export async function searchPerson(
  personName: string,
  companyName: string,
  jobTitle?: string
): Promise<WebSearchResult | null> {
  const titlePart = jobTitle ? `, ${jobTitle}` : ''
  const query = `"${personName}"${titlePart} at ${companyName} recent news announcements speaking engagements`

  return searchWeb(query)
}

/**
 * Search for sales-relevant triggers for a company
 */
export async function searchTriggers(companyName: string, companyDomain?: string): Promise<WebSearchResult | null> {
  const domainPart = companyDomain ? ` (${companyDomain})` : ''
  const query = `${companyName}${domainPart} recent:
- hiring marketing growth paid media roles
- new CMO VP Marketing Head of Growth leadership
- funding round Series A B C investment
- product launch new feature expansion
- office opening geographic expansion
- partnership announcement
- layoffs restructuring
- advertising marketing tech stack changes
Include dates and sources for each finding.`

  return searchWeb(query)
}

/**
 * Search for intent-specific triggers for a company
 * Used for intent data leads - looks for multi-channel, attribution, scaling signals
 */
export async function searchIntentTriggers(
  companyName: string,
  companyDomain?: string,
  industry?: string
): Promise<WebSearchResult | null> {
  const domainPart = companyDomain ? ` (${companyDomain})` : ''
  const industryPart = industry ? ` ${industry}` : ''

  const query = `${companyName}${domainPart}${industryPart} recent:
- digital advertising marketing strategy multi-channel
- agency partnerships marketing vendors
- paid media Meta Facebook Google TikTok advertising campaigns
- marketing attribution ROI measurement analytics
- growth challenges scaling marketing spend
- data CDP customer data platform first-party data
- marketing technology martech stack changes
- new marketing leadership CMO VP Marketing
- marketing team expansion or changes
Focus on marketing challenges, agency relationships, channel strategy, and growth signals.
Include dates and sources for each finding.`

  return searchWeb(query)
}

/**
 * Combine multiple search results
 */
export function combineSearchResults(
  results: Array<WebSearchResult | null>
): { combinedContent: string; allCitations: string[] } {
  const validResults = results.filter((r): r is WebSearchResult => r !== null)

  const combinedContent = validResults.map((r) => r.content).join('\n\n---\n\n')

  const allCitations = [...new Set(validResults.flatMap((r) => r.citations))]

  return { combinedContent, allCitations }
}

// ============================================================================
// ENHANCED MULTI-QUERY RESEARCH
// ============================================================================

/**
 * Enhanced research function - runs 4 targeted queries in parallel
 * More efficient signal extraction with the same API cost
 */
export async function researchCompany(
  companyName: string,
  personName: string,
  companyDomain?: string,
  industry?: string
): Promise<PerplexityResearch> {
  const currentYear = new Date().getFullYear()
  const lastYear = currentYear - 1

  console.log(`[Perplexity] Running enhanced multi-query research for ${companyName}`)

  // Run 4 focused queries in parallel (same API cost, better signal extraction)
  const [funding, hiring, pain, person] = await Promise.all([
    // Query 1: Funding/Growth signals (with date context)
    queryPerplexityEnhanced(
      `"${companyName}" (funding OR "Series A" OR "Series B" OR "Series C" OR raises OR acquired OR investment) ${lastYear} OR ${currentYear}`,
      'funding'
    ),

    // Query 2: Hiring signals (budget indicator)
    queryPerplexityEnhanced(
      `"${companyName}" (hiring OR "open roles" OR "we're hiring" OR careers OR "join our team") marketing OR growth OR "demand gen" OR sales`,
      'hiring'
    ),

    // Query 3: Pain/Competitive signals
    queryPerplexityEnhanced(
      `"${companyName}" (challenges OR struggling OR competition OR "market share" OR layoffs OR restructuring OR pivot)`,
      'pain'
    ),

    // Query 4: Person visibility (personalization gold)
    queryPerplexityEnhanced(
      `"${personName}" (podcast OR speaker OR keynote OR interview OR appointed OR promoted OR "joins as") "${companyName}"`,
      'person'
    ),
  ])

  // Determine triggers based on recency
  const triggers = {
    recentFunding: funding.recency === 'hot' || funding.recency === 'warm',
    activelyHiring: hiring.recency === 'hot' || hiring.recency === 'warm',
    competitivePressure: pain.keyFindings.length > 0,
    personInNews: person.recency !== 'unknown' && person.recency !== 'stale',
  }

  // Generate summary
  const summary = generateResearchSummary(companyName, personName, { funding, hiring, pain, person }, triggers)

  console.log(`[Perplexity] Enhanced research complete: ${summary}`)

  return {
    funding,
    hiring,
    pain,
    personVisibility: person,
    triggers,
    summary,
  }
}

/**
 * Query Perplexity API with enhanced signal extraction
 */
async function queryPerplexityEnhanced(query: string, signalType: string): Promise<SignalWithRecency> {
  const apiKey = process.env.PERPLEXITY_API_KEY

  if (!apiKey || apiKey === 'pplx-xxx') {
    console.error('[Perplexity] PERPLEXITY_API_KEY not set')
    return createEmptySignal()
  }

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a research assistant. Extract factual information with dates when available. Be concise and focus on recent events (last 12 months). If no relevant information is found, say "No recent information found."`,
          },
          {
            role: 'user',
            content: query,
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
        return_citations: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`)
    }

    const data = (await response.json()) as PerplexityResponse
    const content = data.choices?.[0]?.message?.content || ''

    return extractWithRecency(content, signalType)
  } catch (error) {
    console.error(`[Perplexity] Query failed for ${signalType}:`, error)
    return createEmptySignal()
  }
}

/**
 * Extract dates and score recency from content
 */
function extractWithRecency(content: string, signalType: string): SignalWithRecency {
  if (
    !content ||
    content.toLowerCase().includes('no recent information') ||
    content.toLowerCase().includes('no relevant')
  ) {
    return createEmptySignal()
  }

  // Date extraction patterns
  const datePatterns = [
    // "January 2025", "March 2024"
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/gi,
    // "Q1 2025", "Q4 2024"
    /q([1-4])\s+(\d{4})/gi,
    // "01/15/2025", "2025-01-15"
    /(\d{4})-(\d{1,2})-(\d{1,2})/g,
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g,
    // Relative: "last month", "this week", "recently"
    /(last week|this week|last month|this month|recently|yesterday|today)/gi,
  ]

  let mostRecentDate: Date | null = null
  const now = new Date()

  // Try to find dates in content
  for (const pattern of datePatterns) {
    pattern.lastIndex = 0 // Reset regex state
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      const extractedDate = parseMatchToDate(match)
      if (extractedDate && (!mostRecentDate || extractedDate > mostRecentDate)) {
        mostRecentDate = extractedDate
      }
    }
  }

  // Calculate recency
  let recency: 'hot' | 'warm' | 'relevant' | 'stale' | 'unknown' = 'unknown'
  let daysAgo: number | null = null

  if (mostRecentDate) {
    daysAgo = Math.floor((now.getTime() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysAgo <= 30) recency = 'hot'
    else if (daysAgo <= 90) recency = 'warm'
    else if (daysAgo <= 180) recency = 'relevant'
    else recency = 'stale'
  }

  // Extract key findings (sentences with signal words)
  const keyFindings = extractKeyFindings(content, signalType)

  return {
    raw: content,
    mostRecentDate,
    recency,
    daysAgo,
    keyFindings,
  }
}

/**
 * Parse date match to Date object
 */
function parseMatchToDate(match: RegExpMatchArray): Date | null {
  const fullMatch = match[0].toLowerCase()
  const now = new Date()

  // Handle relative dates
  if (fullMatch.includes('today')) return now
  if (fullMatch.includes('yesterday')) return new Date(now.getTime() - 86400000)
  if (fullMatch.includes('this week')) return new Date(now.getTime() - 3 * 86400000)
  if (fullMatch.includes('last week')) return new Date(now.getTime() - 10 * 86400000)
  if (fullMatch.includes('this month')) return new Date(now.getTime() - 15 * 86400000)
  if (fullMatch.includes('last month')) return new Date(now.getTime() - 45 * 86400000)
  if (fullMatch.includes('recently')) return new Date(now.getTime() - 30 * 86400000)

  // Handle month year format
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ]

  for (let i = 0; i < monthNames.length; i++) {
    if (fullMatch.includes(monthNames[i])) {
      const yearMatch = fullMatch.match(/\d{4}/)
      if (yearMatch) {
        return new Date(parseInt(yearMatch[0]), i, 15)
      }
    }
  }

  // Handle Q1-Q4 format
  const quarterMatch = fullMatch.match(/q([1-4])\s+(\d{4})/i)
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1])
    const year = parseInt(quarterMatch[2])
    const month = (quarter - 1) * 3 + 1 // Q1=Jan, Q2=Apr, Q3=Jul, Q4=Oct
    return new Date(year, month, 15)
  }

  return null
}

/**
 * Extract key findings from content based on signal type
 */
function extractKeyFindings(content: string, signalType: string): string[] {
  const findings: string[] = []
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 20)

  const signalWords: Record<string, string[]> = {
    funding: ['raised', 'funding', 'investment', 'series', 'acquired', 'valuation', 'investors'],
    hiring: ['hiring', 'roles', 'team', 'positions', 'recruiting', 'expanding'],
    pain: ['challenge', 'struggling', 'competition', 'layoff', 'restructur', 'pivot', 'decline'],
    person: ['appointed', 'joined', 'promoted', 'speaker', 'podcast', 'keynote', 'interview'],
  }

  const relevantWords = signalWords[signalType] || []

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()
    if (relevantWords.some((word) => lower.includes(word))) {
      findings.push(sentence.trim())
    }
  }

  return findings.slice(0, 3) // Max 3 key findings
}

/**
 * Create empty signal object
 */
function createEmptySignal(): SignalWithRecency {
  return {
    raw: '',
    mostRecentDate: null,
    recency: 'unknown',
    daysAgo: null,
    keyFindings: [],
  }
}

/**
 * Generate research summary from signals and triggers
 */
function generateResearchSummary(
  companyName: string,
  personName: string,
  signals: {
    funding: SignalWithRecency
    hiring: SignalWithRecency
    pain: SignalWithRecency
    person: SignalWithRecency
  },
  triggers: Record<string, boolean>
): string {
  const parts: string[] = []

  if (triggers.recentFunding) {
    parts.push(`Recent funding activity detected (${signals.funding.recency})`)
  }
  if (triggers.activelyHiring) {
    parts.push(`Actively hiring in marketing/growth`)
  }
  if (triggers.competitivePressure) {
    parts.push(`Competitive pressure or challenges mentioned`)
  }
  if (triggers.personInNews) {
    parts.push(`${personName} has recent visibility (podcast/speaking/news)`)
  }

  if (parts.length === 0) {
    parts.push('No strong recent signals detected')
  }

  return parts.join('. ') + '.'
}
