/**
 * Trigger Matcher
 * Matches leads against tenant-defined ICP triggers to identify buying signals
 */

import { getTenantSettings } from './tenant-settings'
import type { ICPTrigger, TriggerSource } from './tenant-settings'

export interface TriggerMatch {
  trigger: ICPTrigger
  matchedKeywords: string[]
  matchedIn: 'linkedin_post' | 'linkedin_company' | 'perplexity_news' | 'job_posting'
  excerpt?: string
  confidence: 'high' | 'medium' | 'low'
}

export interface TriggerMatchResult {
  matches: TriggerMatch[]
  hasHighConfidenceMatch: boolean
  topTrigger: ICPTrigger | null
  summary: string
}

interface LinkedInPost {
  content: string
  date?: string
  engagement?: number
}

interface CompanyNews {
  title: string
  content: string
  date?: string
  source?: string
}

interface JobPosting {
  title: string
  description?: string
  department?: string
}

export interface TriggerMatchInput {
  tenantId: string
  linkedInPosts?: LinkedInPost[]
  companyLinkedInContent?: string
  companyNews?: CompanyNews[]
  jobPostings?: JobPosting[]
}

/**
 * Match a lead's available data against tenant ICP triggers
 */
export async function matchTriggers(
  input: TriggerMatchInput
): Promise<TriggerMatchResult> {
  const { tenantId, linkedInPosts, companyLinkedInContent, companyNews, jobPostings } =
    input

  // Get tenant's ICP triggers
  const tenant = await getTenantSettings(tenantId)
  const triggers = tenant?.settings?.icp?.triggers || []

  if (triggers.length === 0) {
    return {
      matches: [],
      hasHighConfidenceMatch: false,
      topTrigger: null,
      summary: 'No ICP triggers configured for this tenant',
    }
  }

  const matches: TriggerMatch[] = []

  // Match against each trigger based on its source
  for (const trigger of triggers) {
    const triggerMatches = matchTriggerAgainstData(trigger, {
      linkedInPosts,
      companyLinkedInContent,
      companyNews,
      jobPostings,
    })

    matches.push(...triggerMatches)
  }

  // Sort by confidence (high > medium > low) and number of matched keywords
  matches.sort((a, b) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 }
    if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
    }
    return b.matchedKeywords.length - a.matchedKeywords.length
  })

  return {
    matches,
    hasHighConfidenceMatch: matches.some((m) => m.confidence === 'high'),
    topTrigger: matches[0]?.trigger || null,
    summary: generateMatchSummary(matches),
  }
}

/**
 * Match a single trigger against available data
 */
function matchTriggerAgainstData(
  trigger: ICPTrigger,
  data: {
    linkedInPosts?: LinkedInPost[]
    companyLinkedInContent?: string
    companyNews?: CompanyNews[]
    jobPostings?: JobPosting[]
  }
): TriggerMatch[] {
  const matches: TriggerMatch[] = []
  const keywords = trigger.what_to_look_for.map((k) => k.toLowerCase())

  // Match LinkedIn personal posts
  if (trigger.source === 'linkedin_personal' && data.linkedInPosts?.length) {
    for (const post of data.linkedInPosts) {
      const matchResult = matchKeywordsInText(post.content, keywords)
      if (matchResult.matched.length > 0) {
        matches.push({
          trigger,
          matchedKeywords: matchResult.matched,
          matchedIn: 'linkedin_post',
          excerpt: extractExcerpt(post.content, matchResult.matched[0]),
          confidence: calculateConfidence(matchResult.matched.length, keywords.length),
        })
      }
    }
  }

  // Match LinkedIn company content
  if (trigger.source === 'linkedin_company') {
    // Company page content
    if (data.companyLinkedInContent) {
      const matchResult = matchKeywordsInText(data.companyLinkedInContent, keywords)
      if (matchResult.matched.length > 0) {
        matches.push({
          trigger,
          matchedKeywords: matchResult.matched,
          matchedIn: 'linkedin_company',
          excerpt: extractExcerpt(data.companyLinkedInContent, matchResult.matched[0]),
          confidence: calculateConfidence(matchResult.matched.length, keywords.length),
        })
      }
    }

    // Job postings (often indicate scaling/growth triggers)
    if (data.jobPostings?.length) {
      for (const job of data.jobPostings) {
        const textToSearch = `${job.title} ${job.description || ''} ${job.department || ''}`
        const matchResult = matchKeywordsInText(textToSearch, keywords)
        if (matchResult.matched.length > 0) {
          matches.push({
            trigger,
            matchedKeywords: matchResult.matched,
            matchedIn: 'job_posting',
            excerpt: `Hiring: ${job.title}`,
            confidence: calculateConfidence(matchResult.matched.length, keywords.length),
          })
        }
      }
    }
  }

  // Match Perplexity/web search results
  if (trigger.source === 'perplexity' && data.companyNews?.length) {
    for (const news of data.companyNews) {
      const textToSearch = `${news.title} ${news.content}`
      const matchResult = matchKeywordsInText(textToSearch, keywords)
      if (matchResult.matched.length > 0) {
        matches.push({
          trigger,
          matchedKeywords: matchResult.matched,
          matchedIn: 'perplexity_news',
          excerpt: news.title,
          confidence: calculateConfidence(matchResult.matched.length, keywords.length),
        })
      }
    }
  }

  return matches
}

/**
 * Match keywords against text content
 */
function matchKeywordsInText(
  text: string,
  keywords: string[]
): { matched: string[]; unmatched: string[] } {
  const lowerText = text.toLowerCase()
  const matched: string[] = []
  const unmatched: string[] = []

  for (const keyword of keywords) {
    // Support partial matching for phrases
    if (lowerText.includes(keyword)) {
      matched.push(keyword)
    } else {
      unmatched.push(keyword)
    }
  }

  return { matched, unmatched }
}

/**
 * Extract a relevant excerpt around a matched keyword
 */
function extractExcerpt(text: string, keyword: string, contextLength = 100): string {
  const lowerText = text.toLowerCase()
  const index = lowerText.indexOf(keyword.toLowerCase())

  if (index === -1) return text.substring(0, contextLength * 2)

  const start = Math.max(0, index - contextLength)
  const end = Math.min(text.length, index + keyword.length + contextLength)

  let excerpt = text.substring(start, end)

  if (start > 0) excerpt = '...' + excerpt
  if (end < text.length) excerpt = excerpt + '...'

  return excerpt.trim()
}

/**
 * Calculate confidence based on keyword match ratio
 */
function calculateConfidence(
  matchedCount: number,
  totalKeywords: number
): 'high' | 'medium' | 'low' {
  const ratio = matchedCount / totalKeywords

  if (ratio >= 0.5 || matchedCount >= 3) return 'high'
  if (ratio >= 0.25 || matchedCount >= 2) return 'medium'
  return 'low'
}

/**
 * Generate a human-readable summary of trigger matches
 */
function generateMatchSummary(matches: TriggerMatch[]): string {
  if (matches.length === 0) {
    return 'No trigger matches found'
  }

  const highConfidence = matches.filter((m) => m.confidence === 'high')
  const mediumConfidence = matches.filter((m) => m.confidence === 'medium')

  const parts: string[] = []

  if (highConfidence.length > 0) {
    const triggerNames = [...new Set(highConfidence.map((m) => m.trigger.name))]
    parts.push(`Strong signals: ${triggerNames.join(', ')}`)
  }

  if (mediumConfidence.length > 0) {
    const triggerNames = [...new Set(mediumConfidence.map((m) => m.trigger.name))]
    parts.push(`Potential signals: ${triggerNames.join(', ')}`)
  }

  return parts.join('. ') || `${matches.length} trigger(s) matched with low confidence`
}

/**
 * Format trigger matches for inclusion in agent prompts
 */
export function formatTriggersForPrompt(result: TriggerMatchResult): string {
  if (result.matches.length === 0) {
    return 'No ICP triggers matched for this lead.'
  }

  const lines: string[] = ['MATCHED ICP TRIGGERS:', '']

  for (const match of result.matches.slice(0, 5)) {
    lines.push(`[${match.confidence.toUpperCase()}] ${match.trigger.name}`)
    lines.push(`  Source: ${match.matchedIn}`)
    lines.push(`  Why it matters: ${match.trigger.reasoning}`)
    lines.push(`  Matched: ${match.matchedKeywords.join(', ')}`)
    if (match.excerpt) {
      lines.push(`  Excerpt: "${match.excerpt}"`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
