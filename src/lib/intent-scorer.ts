/**
 * Intent Scorer
 *
 * Analyzes intent data signals to score lead quality
 * and identify high-intent page sequences.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface IntentPageView {
  page: string
  url?: string
  timestamp?: Date | string
  duration?: number // seconds on page
}

export interface IntentData {
  companyDomain: string
  companyName?: string
  pageViews: IntentPageView[]
  totalVisits: number
  firstSeen?: Date | string
  lastSeen?: Date | string
  topicInterests?: string[]
  industry?: string
}

export interface IntentScoreBreakdown {
  pageRelevance: number // 0-40 points
  visitFrequency: number // 0-20 points
  recency: number // 0-20 points
  sequenceBonus: number // 0-20 points
}

export interface EnhancedIntentScore {
  score: number // 0-100
  tier: 'hot' | 'warm' | 'cold' | 'research'
  breakdown: IntentScoreBreakdown
  topPages: string[]
  matchedSequences: string[]
  recommendation: string
  urgency: 'immediate' | 'this_week' | 'nurture' | 'low'
}

// ============================================================================
// PAGE WEIGHTS CONFIGURATION
// ============================================================================

/**
 * Page weights for JSB Media / general marketing services
 * Higher weight = stronger buying signal
 */
const PAGE_WEIGHTS: Record<string, number> = {
  // High-intent pages (10 points)
  pricing: 10,
  'get-started': 10,
  'book-call': 10,
  'schedule-demo': 10,
  'contact-sales': 10,
  'request-quote': 10,
  demo: 10,

  // Service pages (8 points)
  services: 8,
  'paid-media': 8,
  'media-buying': 8,
  'performance-marketing': 8,
  'facebook-ads': 8,
  'google-ads': 8,
  'tiktok-ads': 8,
  'meta-ads': 8,
  'social-advertising': 8,

  // Solution pages (7 points)
  solutions: 7,
  ecommerce: 7,
  'lead-generation': 7,
  'b2b-marketing': 7,
  'd2c-marketing': 7,
  saas: 7,
  retail: 7,

  // Case studies / proof (6 points)
  'case-studies': 6,
  'case-study': 6,
  results: 6,
  testimonials: 6,
  clients: 6,
  portfolio: 6,
  'success-stories': 6,

  // About / trust (4 points)
  about: 4,
  team: 4,
  'about-us': 4,
  methodology: 4,
  approach: 4,

  // Content / research (3 points)
  blog: 3,
  resources: 3,
  insights: 3,
  guides: 3,
  webinars: 3,
  podcast: 3,

  // General (2 points)
  careers: 2,
  news: 2,

  // Homepage (1 point)
  home: 1,
  '': 1, // Root path
}

// ============================================================================
// INTENT SEQUENCES
// ============================================================================

/**
 * High-intent page sequences that indicate buying journey progression
 * Each sequence has a bonus multiplier
 */
const INTENT_SEQUENCES: Array<{
  name: string
  pages: string[]
  bonus: number
}> = [
  {
    name: 'pricing_journey',
    pages: ['services', 'pricing'],
    bonus: 15,
  },
  {
    name: 'case_to_contact',
    pages: ['case-studies', 'contact'],
    bonus: 15,
  },
  {
    name: 'service_to_demo',
    pages: ['services', 'book-call'],
    bonus: 20,
  },
  {
    name: 'full_evaluation',
    pages: ['about', 'services', 'case-studies', 'pricing'],
    bonus: 25,
  },
  {
    name: 'research_to_action',
    pages: ['blog', 'services', 'pricing'],
    bonus: 18,
  },
  {
    name: 'solution_explorer',
    pages: ['solutions', 'case-studies'],
    bonus: 12,
  },
  {
    name: 'trust_builder',
    pages: ['about', 'team', 'case-studies'],
    bonus: 10,
  },
]

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

/**
 * Score intent data to determine lead quality and urgency
 */
export function scoreIntent(intentData: IntentData): EnhancedIntentScore {
  const breakdown: IntentScoreBreakdown = {
    pageRelevance: 0,
    visitFrequency: 0,
    recency: 0,
    sequenceBonus: 0,
  }

  // Extract page paths from views
  const pagePaths = intentData.pageViews.map((pv) => normalizePagePath(pv.page || pv.url || ''))

  // 1. Calculate page relevance score (0-40 points)
  breakdown.pageRelevance = calculatePageRelevance(pagePaths)

  // 2. Calculate visit frequency score (0-20 points)
  breakdown.visitFrequency = calculateVisitFrequency(intentData.totalVisits, pagePaths.length)

  // 3. Calculate recency score (0-20 points)
  breakdown.recency = calculateRecency(intentData.lastSeen)

  // 4. Calculate sequence bonus (0-20 points)
  const { bonus, matchedSequences } = calculateSequenceBonus(pagePaths)
  breakdown.sequenceBonus = bonus

  // Calculate total score
  const score = Math.min(
    100,
    breakdown.pageRelevance + breakdown.visitFrequency + breakdown.recency + breakdown.sequenceBonus
  )

  // Determine tier
  const tier = determineTier(score, pagePaths)

  // Get top pages
  const topPages = getTopPages(pagePaths)

  // Generate recommendation
  const recommendation = generateRecommendation(score, tier, topPages, matchedSequences)

  // Determine urgency
  const urgency = determineUrgency(score, breakdown.recency, matchedSequences.length > 0)

  return {
    score,
    tier,
    breakdown,
    topPages,
    matchedSequences,
    recommendation,
    urgency,
  }
}

// ============================================================================
// SCORING HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize page path for matching
 */
function normalizePagePath(path: string): string {
  // Extract path from URL if full URL provided
  if (path.includes('://')) {
    try {
      const url = new URL(path)
      path = url.pathname
    } catch {
      // If URL parsing fails, use as-is
    }
  }

  return path
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
    .replace(/\.(html|php|aspx?)$/i, '') // Remove extensions
    .split('/')[0] // Get first path segment
}

/**
 * Calculate page relevance score (0-40 points)
 */
function calculatePageRelevance(pagePaths: string[]): number {
  if (pagePaths.length === 0) return 0

  // Get unique pages
  const uniquePages = [...new Set(pagePaths)]

  // Sum weights of unique pages
  let totalWeight = 0
  for (const page of uniquePages) {
    const weight = PAGE_WEIGHTS[page] || 1
    totalWeight += weight
  }

  // Normalize to 0-40 scale
  // Max expected: ~5 high-value pages = 50 points raw
  const normalized = Math.min(40, (totalWeight / 50) * 40)
  return Math.round(normalized * 10) / 10
}

/**
 * Calculate visit frequency score (0-20 points)
 */
function calculateVisitFrequency(totalVisits: number, pageViewCount: number): number {
  // Combine total visits and page depth
  const visitScore = Math.min(10, totalVisits * 2) // 1-5+ visits
  const depthScore = Math.min(10, pageViewCount * 1.5) // 1-7+ pages

  return Math.round((visitScore + depthScore) * 10) / 10
}

/**
 * Calculate recency score (0-20 points)
 */
function calculateRecency(lastSeen: Date | string | undefined): number {
  if (!lastSeen) return 5 // Default moderate score if unknown

  const lastSeenDate = typeof lastSeen === 'string' ? new Date(lastSeen) : lastSeen
  const now = new Date()
  const daysAgo = Math.floor((now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24))

  if (daysAgo <= 1) return 20 // Today or yesterday
  if (daysAgo <= 3) return 18 // Last 3 days
  if (daysAgo <= 7) return 15 // Last week
  if (daysAgo <= 14) return 12 // Last 2 weeks
  if (daysAgo <= 30) return 8 // Last month
  if (daysAgo <= 60) return 5 // Last 2 months
  return 2 // Older
}

/**
 * Calculate sequence bonus (0-20 points)
 */
function calculateSequenceBonus(pagePaths: string[]): { bonus: number; matchedSequences: string[] } {
  const matchedSequences: string[] = []
  let maxBonus = 0

  const uniquePages = new Set(pagePaths)

  for (const sequence of INTENT_SEQUENCES) {
    // Check if all pages in sequence were visited
    const hasAllPages = sequence.pages.every((page) => uniquePages.has(page))

    if (hasAllPages) {
      matchedSequences.push(sequence.name)
      maxBonus = Math.max(maxBonus, sequence.bonus)
    }
  }

  // Cap at 20 points
  return {
    bonus: Math.min(20, maxBonus),
    matchedSequences,
  }
}

/**
 * Determine tier based on score and page patterns
 */
function determineTier(score: number, pagePaths: string[]): 'hot' | 'warm' | 'cold' | 'research' {
  const uniquePages = new Set(pagePaths)

  // Hot: High score OR visited pricing/demo pages
  const hasHighIntentPages =
    uniquePages.has('pricing') ||
    uniquePages.has('book-call') ||
    uniquePages.has('schedule-demo') ||
    uniquePages.has('get-started')

  if (score >= 70 || (score >= 50 && hasHighIntentPages)) {
    return 'hot'
  }

  // Warm: Moderate score with service interest
  const hasServicePages =
    uniquePages.has('services') ||
    uniquePages.has('case-studies') ||
    uniquePages.has('solutions')

  if (score >= 40 || (score >= 25 && hasServicePages)) {
    return 'warm'
  }

  // Research: Only content pages
  const onlyContentPages = pagePaths.every(
    (p) => ['blog', 'resources', 'insights', 'guides', 'webinars', 'podcast', ''].includes(p)
  )

  if (onlyContentPages && pagePaths.length > 0) {
    return 'research'
  }

  return 'cold'
}

/**
 * Get top pages by weight
 */
function getTopPages(pagePaths: string[]): string[] {
  const uniquePages = [...new Set(pagePaths)]

  return uniquePages
    .map((page) => ({ page, weight: PAGE_WEIGHTS[page] || 1 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((p) => p.page)
}

/**
 * Determine urgency based on scoring signals
 */
function determineUrgency(
  score: number,
  recencyScore: number,
  hasMatchedSequence: boolean
): 'immediate' | 'this_week' | 'nurture' | 'low' {
  // Immediate: High score + recent activity + intent sequence
  if (score >= 60 && recencyScore >= 15 && hasMatchedSequence) {
    return 'immediate'
  }

  // This week: Good score and recent
  if (score >= 40 && recencyScore >= 12) {
    return 'this_week'
  }

  // Nurture: Some intent but not urgent
  if (score >= 20) {
    return 'nurture'
  }

  return 'low'
}

/**
 * Generate actionable recommendation
 */
function generateRecommendation(
  score: number,
  tier: string,
  topPages: string[],
  matchedSequences: string[]
): string {
  const recommendations: string[] = []

  // Tier-based primary recommendation
  switch (tier) {
    case 'hot':
      recommendations.push('High-intent lead - prioritize immediate outreach.')
      if (topPages.includes('pricing')) {
        recommendations.push('They viewed pricing - lead with ROI/value proposition.')
      }
      if (topPages.includes('case-studies')) {
        recommendations.push('They reviewed case studies - reference relevant success stories.')
      }
      break

    case 'warm':
      recommendations.push('Engaged prospect - personalized follow-up recommended.')
      if (topPages.includes('services')) {
        recommendations.push('Service interest detected - highlight relevant capabilities.')
      }
      break

    case 'research':
      recommendations.push('Early-stage research - nurture with educational content.')
      recommendations.push('Consider adding to content-focused drip campaign.')
      break

    case 'cold':
      recommendations.push('Limited engagement - add to awareness campaign.')
      break
  }

  // Sequence-based insights
  if (matchedSequences.includes('full_evaluation')) {
    recommendations.push('Complete evaluation journey detected - ready for sales conversation.')
  } else if (matchedSequences.includes('pricing_journey')) {
    recommendations.push('Price-conscious buyer - emphasize value and ROI.')
  } else if (matchedSequences.includes('case_to_contact')) {
    recommendations.push('Social proof seeker - lead with testimonials and results.')
  }

  return recommendations.join(' ')
}

// ============================================================================
// BATCH SCORING
// ============================================================================

/**
 * Score multiple intent records and sort by priority
 */
export function scoreAndRankIntentLeads(
  intentRecords: IntentData[]
): Array<IntentData & { intentScore: EnhancedIntentScore }> {
  return intentRecords
    .map((record) => ({
      ...record,
      intentScore: scoreIntent(record),
    }))
    .sort((a, b) => b.intentScore.score - a.intentScore.score)
}

/**
 * Filter intent leads by minimum score threshold
 */
export function filterHighIntentLeads(
  intentRecords: IntentData[],
  minScore: number = 40
): Array<IntentData & { intentScore: EnhancedIntentScore }> {
  return scoreAndRankIntentLeads(intentRecords).filter((r) => r.intentScore.score >= minScore)
}

/**
 * Get intent summary for a company
 */
export function getIntentSummary(intentData: IntentData): string {
  const scored = scoreIntent(intentData)

  const parts: string[] = []

  parts.push(`Intent Score: ${scored.score}/100 (${scored.tier})`)

  if (scored.topPages.length > 0) {
    parts.push(`Top pages: ${scored.topPages.slice(0, 3).join(', ')}`)
  }

  if (scored.matchedSequences.length > 0) {
    parts.push(`Buying signals: ${scored.matchedSequences.join(', ')}`)
  }

  parts.push(`Urgency: ${scored.urgency}`)

  return parts.join('. ') + '.'
}
