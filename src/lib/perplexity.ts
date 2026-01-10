/**
 * Perplexity API Client
 * Handles web search for company/person research with recent, reputable sources
 */

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions'

// Use sonar model for online search capabilities
// See: https://docs.perplexity.ai/getting-started/models
const MODEL = 'sonar'

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

/**
 * Search for company-specific information
 */
export async function searchCompany(
  companyName: string,
  companyDomain?: string
): Promise<WebSearchResult | null> {
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
export async function searchTriggers(
  companyName: string,
  companyDomain?: string
): Promise<WebSearchResult | null> {
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

  const allCitations = [
    ...new Set(validResults.flatMap((r) => r.citations)),
  ]

  return { combinedContent, allCitations }
}
