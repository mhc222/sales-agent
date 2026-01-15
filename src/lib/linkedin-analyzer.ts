/**
 * LinkedIn Post Analyzer
 *
 * Enhanced analysis of LinkedIn posts for:
 * - Trigger detection (waterfall early-stop logic)
 * - Pain language detection (personalization hooks)
 * - Tone profiling (message matching)
 * - Conversation hooks (engagement starters)
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ============================================================================
// TYPES
// ============================================================================

// Legacy types (backwards compatible)
interface PostAnalysis {
  has_sufficient_triggers: boolean
  trigger_count: number
  triggers_found: Array<{
    type: string
    fact: string
    recency: 'last_month' | 'last_3_months' | 'last_6_months' | 'last_12_months' | 'older'
    relevance_score: number // 1-5
  }>
  reasoning: string
}

// Enhanced types
export interface LinkedInPost {
  text: string
  date?: string | Date
  likes?: number
  comments?: number
  shares?: number
  url?: string
}

export interface PainSignal {
  text: string
  topic: string
  postDate?: string | Date | null
  confidence: 'high' | 'medium' | 'low'
  pattern: string
}

export interface ToneProfile {
  primary: 'formal' | 'casual' | 'thought_leader' | 'promotional' | 'technical'
  scores: Record<string, number>
  emojisUsed: boolean
  avgSentenceLength: number
}

export interface ConversationHook {
  topic: string
  postSnippet: string
  engagement: number
  angle: string
}

export interface EnhancedLinkedInAnalysis {
  // Basic metrics
  recentTopics: string[]
  postingFrequency: 'active' | 'moderate' | 'inactive'
  isActiveUser: boolean

  // Engagement metrics
  avgEngagement: number
  totalPosts: number
  engagementTrend: 'growing' | 'stable' | 'declining'

  // Pain & opportunity signals
  painIndicators: PainSignal[]
  hasPainSignals: boolean

  // Tone for message matching
  tone: ToneProfile

  // Conversation starters
  conversationHooks: ConversationHook[]
  bestHook: ConversationHook | null
}

// ============================================================================
// LEGACY FUNCTIONS (Backwards Compatible)
// ============================================================================

/**
 * Analyze LinkedIn posts to extract triggers and determine if sufficient
 * Used by the waterfall research pattern to decide whether to continue gathering data
 */
export async function analyzeLinkedInPosts(
  posts: unknown,
  personName: string,
  companyName: string,
  isCompanyPosts: boolean = false
): Promise<PostAnalysis> {
  if (!posts) {
    return {
      has_sufficient_triggers: false,
      trigger_count: 0,
      triggers_found: [],
      reasoning: 'No LinkedIn data available',
    }
  }

  const postsStr = JSON.stringify(posts, null, 2)
  const sourceType = isCompanyPosts ? 'company' : 'personal'

  const prompt = `Analyze these LinkedIn ${sourceType} posts for ${personName} at ${companyName}.

Extract sales-relevant triggers that indicate a good time to reach out about digital marketing services.

LINKEDIN DATA:
${postsStr}

WHAT TO LOOK FOR (in order of importance):

HIGH VALUE TRIGGERS (relevance 4-5):
- Posts about hiring marketing/growth roles
- Posts about scaling, growth challenges, or expansion
- Posts about new product launches or market expansion
- Posts discussing marketing challenges, ad spend, or ROI
- Posts about leadership changes or promotions
- Posts about funding or investment
- Speaking engagements about marketing/growth topics
- Industry thought leadership on marketing trends

MEDIUM VALUE TRIGGERS (relevance 2-3):
- General business updates or milestones
- Industry commentary
- Team or culture posts
- Event participation

LOW VALUE (relevance 1):
- Personal posts unrelated to business
- Generic motivational content
- Reposts without commentary

RECENCY SCORING:
- Last 30 days = "last_month"
- 31-90 days = "last_3_months"
- 91-180 days = "last_6_months"
- 181-365 days = "last_12_months"
- Older = "older"

SUFFICIENT TRIGGERS CRITERIA:
- At least 2 triggers with relevance >= 4, OR
- At least 1 trigger with relevance = 5 from last 3 months, OR
- At least 3 triggers with relevance >= 3

Return JSON:
{
  "has_sufficient_triggers": true/false,
  "trigger_count": number,
  "triggers_found": [
    {
      "type": "hiring|leadership_change|funding|product_launch|expansion|partnership|tech_stack|market_shift|growth_signal|thought_leadership",
      "fact": "concise description of what the post reveals",
      "recency": "last_month|last_3_months|last_6_months|last_12_months|older",
      "relevance_score": 1-5
    }
  ],
  "reasoning": "brief explanation of why sufficient or not"
}

Return ONLY valid JSON.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    return JSON.parse(jsonText) as PostAnalysis
  } catch (error) {
    console.error('[LinkedIn Analyzer] Error:', error)
    return {
      has_sufficient_triggers: false,
      trigger_count: 0,
      triggers_found: [],
      reasoning: 'Analysis failed - proceeding to next step',
    }
  }
}

/**
 * Combine triggers from multiple analysis steps
 */
export function combineTriggers(
  analyses: PostAnalysis[]
): Array<{ type: string; fact: string; recency: string; relevance_score: number }> {
  const allTriggers = analyses.flatMap((a) => a.triggers_found)

  // Sort by relevance (desc) then recency (most recent first)
  const recencyOrder = ['last_month', 'last_3_months', 'last_6_months', 'last_12_months', 'older']

  return allTriggers.sort((a, b) => {
    if (b.relevance_score !== a.relevance_score) {
      return b.relevance_score - a.relevance_score
    }
    return recencyOrder.indexOf(a.recency) - recencyOrder.indexOf(b.recency)
  })
}

// ============================================================================
// ENHANCED ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Enhanced LinkedIn post analysis with pain detection and tone matching
 */
export function analyzeLinkedInPostsEnhanced(posts: LinkedInPost[]): EnhancedLinkedInAnalysis {
  if (!posts || posts.length === 0) {
    return createEmptyAnalysis()
  }

  // Sort by date (most recent first), posts without dates go last
  const sortedPosts = [...posts].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0
    const dateB = b.date ? new Date(b.date).getTime() : 0
    return dateB - dateA
  })

  return {
    // Basic metrics
    recentTopics: extractTopics(sortedPosts),
    postingFrequency: calculateFrequency(sortedPosts),
    isActiveUser: checkIfActive(sortedPosts),

    // Engagement metrics
    avgEngagement: calculateAvgEngagement(sortedPosts),
    totalPosts: sortedPosts.length,
    engagementTrend: calculateEngagementTrend(sortedPosts),

    // Pain signals
    painIndicators: findPainLanguage(sortedPosts),
    hasPainSignals: findPainLanguage(sortedPosts).length > 0,

    // Tone
    tone: analyzeTone(sortedPosts),

    // Hooks
    conversationHooks: extractHooks(sortedPosts),
    bestHook: extractHooks(sortedPosts)[0] || null,
  }
}

/**
 * Convert raw Apify response to LinkedInPost array
 */
export function normalizeLinkedInPosts(rawPosts: unknown): LinkedInPost[] {
  if (!rawPosts || !Array.isArray(rawPosts)) {
    // Check if it's wrapped in a posts property
    const wrapped = rawPosts as { posts?: unknown[] }
    if (wrapped?.posts && Array.isArray(wrapped.posts)) {
      return normalizeLinkedInPosts(wrapped.posts)
    }
    return []
  }

  return rawPosts
    .map((post: unknown) => {
      const p = post as Record<string, unknown>
      return {
        text: (p.text as string) || (p.post_text as string) || (p.content as string) || '',
        date: (p.date as string) || (p.posted_date as string) || (p.timestamp as string) || new Date().toISOString(),
        likes: (p.likes as number) || (p.like_count as number) || 0,
        comments: (p.comments as number) || (p.comment_count as number) || 0,
        shares: (p.shares as number) || (p.share_count as number) || 0,
        url: (p.url as string) || (p.post_url as string) || undefined,
      }
    })
    .filter((post) => post.text && post.text.length > 0)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract main topics from posts
 */
function extractTopics(posts: LinkedInPost[]): string[] {
  const topicKeywords: Record<string, string[]> = {
    marketing: ['marketing', 'brand', 'campaign', 'awareness', 'content'],
    growth: ['growth', 'scale', 'revenue', 'acquisition', 'conversion'],
    leadership: ['team', 'leadership', 'culture', 'hiring', 'management'],
    technology: ['ai', 'automation', 'tech', 'software', 'digital'],
    sales: ['sales', 'pipeline', 'deals', 'quota', 'revenue'],
    product: ['product', 'launch', 'feature', 'roadmap', 'customer'],
    strategy: ['strategy', 'planning', 'goals', 'okr', 'vision'],
    industry: ['industry', 'market', 'trends', 'competition', 'disruption'],
  }

  const topicCounts: Record<string, number> = {}

  for (const post of posts) {
    const text = (post.text || '').toLowerCase()
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1
          break // Count each topic once per post
        }
      }
    }
  }

  // Sort by frequency and return top 3
  return Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic)
}

/**
 * Calculate posting frequency
 */
function calculateFrequency(posts: LinkedInPost[]): 'active' | 'moderate' | 'inactive' {
  if (posts.length === 0) return 'inactive'

  // Find posts with dates
  const postsWithDates = posts.filter((p) => p.date)
  if (postsWithDates.length === 0) return 'moderate' // Default if no dates

  const now = new Date()
  const oldestPost = new Date(postsWithDates[postsWithDates.length - 1].date!)
  const daySpan = Math.max(1, (now.getTime() - oldestPost.getTime()) / (1000 * 60 * 60 * 24))

  const postsPerWeek = (posts.length / daySpan) * 7

  if (postsPerWeek >= 2) return 'active'
  if (postsPerWeek >= 0.5) return 'moderate'
  return 'inactive'
}

/**
 * Check if user is active (posted in last 30 days)
 */
function checkIfActive(posts: LinkedInPost[]): boolean {
  if (posts.length === 0) return false

  // Find the first post with a date
  const mostRecentWithDate = posts.find((p) => p.date)
  if (!mostRecentWithDate?.date) return true // Assume active if no dates

  const mostRecent = new Date(mostRecentWithDate.date)
  const daysSince = (new Date().getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24)

  return daysSince <= 30
}

/**
 * Calculate average engagement
 */
function calculateAvgEngagement(posts: LinkedInPost[]): number {
  if (posts.length === 0) return 0

  const total = posts.reduce((sum, post) => {
    return sum + (post.likes || 0) + (post.comments || 0) * 2 + (post.shares || 0) * 3
  }, 0)

  return Math.round(total / posts.length)
}

/**
 * Calculate engagement trend
 */
function calculateEngagementTrend(posts: LinkedInPost[]): 'growing' | 'stable' | 'declining' {
  if (posts.length < 4) return 'stable'

  const midpoint = Math.floor(posts.length / 2)
  const recentPosts = posts.slice(0, midpoint)
  const olderPosts = posts.slice(midpoint)

  const recentAvg = calculateAvgEngagement(recentPosts)
  const olderAvg = calculateAvgEngagement(olderPosts)

  const changePercent = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0

  if (changePercent > 20) return 'growing'
  if (changePercent < -20) return 'declining'
  return 'stable'
}

/**
 * Find pain language in posts (THE KEY FUNCTION)
 * This is where we extract personalization gold - admissions of struggle/need
 */
function findPainLanguage(posts: LinkedInPost[]): PainSignal[] {
  const painPatterns: Array<{ pattern: RegExp; confidence: 'high' | 'medium' | 'low'; name: string }> = [
    // High confidence - direct pain admission
    { pattern: /struggling with (.+?)[\.\,\!\?]/gi, confidence: 'high', name: 'struggling' },
    { pattern: /frustrated (with|by) (.+?)[\.\,\!\?]/gi, confidence: 'high', name: 'frustrated' },
    { pattern: /wish (we|I|our team) (had|could) (.+?)[\.\,\!\?]/gi, confidence: 'high', name: 'wish' },
    { pattern: /biggest challenge[s]? (is|are|:) (.+?)[\.\,\!\?]/gi, confidence: 'high', name: 'challenge' },

    // Medium confidence - seeking help
    { pattern: /anyone (else )?(have|know|recommend|using)(.+?)[\?\.\,]/gi, confidence: 'medium', name: 'seeking' },
    { pattern: /looking for (.+?) (solution|tool|platform|help|advice)/gi, confidence: 'medium', name: 'looking' },
    { pattern: /how do you (handle|manage|deal with|solve) (.+?)[\?]/gi, confidence: 'medium', name: 'how_to' },

    // Lower confidence - general difficulty
    { pattern: /difficult to (.+?)[\.\,\!\?]/gi, confidence: 'low', name: 'difficult' },
    { pattern: /problem[s]? with (.+?)[\.\,\!\?]/gi, confidence: 'low', name: 'problem' },
    { pattern: /need[s]? to (improve|fix|solve|address) (.+?)[\.\,\!\?]/gi, confidence: 'low', name: 'need_to' },
  ]

  const signals: PainSignal[] = []

  for (const post of posts) {
    const text = post.text || ''

    for (const { pattern, confidence, name } of painPatterns) {
      // Reset regex state
      pattern.lastIndex = 0

      let match
      while ((match = pattern.exec(text)) !== null) {
        // Extract the topic (usually in capture group 1 or 2)
        const topic = match[1] || match[2] || match[0]

        signals.push({
          text: match[0].trim(),
          topic: topic.trim().substring(0, 100),
          postDate: post.date,
          confidence,
          pattern: name,
        })
      }
    }
  }

  // Sort by confidence (high first) and deduplicate
  return signals
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.confidence] - order[b.confidence]
    })
    .slice(0, 5) // Max 5 pain signals
}

/**
 * Analyze tone for message matching
 */
function analyzeTone(posts: LinkedInPost[]): ToneProfile {
  const indicators: Record<string, string[]> = {
    formal: ['pleased to announce', 'i am delighted', 'we are excited', 'thrilled to share', 'honored to'],
    casual: ['honestly', 'tbh', 'lol', 'haha', 'btw', 'gonna', 'kinda', 'super excited', '!!!!'],
    thought_leader: [
      "here's what i learned",
      'unpopular opinion',
      'hot take',
      'thread',
      'lesson',
      'insight',
      'framework',
    ],
    promotional: ['check out', 'link in', 'dm me', 'sign up', 'join us', 'register', 'announcing'],
    technical: ['implemented', 'architecture', 'infrastructure', 'deployed', 'stack', 'api', 'integration'],
  }

  const scores: Record<string, number> = {
    formal: 0,
    casual: 0,
    thought_leader: 0,
    promotional: 0,
    technical: 0,
  }

  let totalWords = 0
  let totalSentences = 0
  let hasEmojis = false

  for (const post of posts) {
    const text = (post.text || '').toLowerCase()

    // Check for emojis
    if (
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]/u.test(post.text || '')
    ) {
      hasEmojis = true
      scores.casual += 1
    }

    // Count words and sentences
    totalWords += text.split(/\s+/).length
    totalSentences += text.split(/[.!?]+/).filter((s) => s.trim()).length

    // Score each category
    for (const [category, keywords] of Object.entries(indicators)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          scores[category] += 1
        }
      }
    }
  }

  // Determine primary tone
  const primary = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as ToneProfile['primary']

  return {
    primary,
    scores,
    emojisUsed: hasEmojis,
    avgSentenceLength: totalSentences > 0 ? Math.round(totalWords / totalSentences) : 0,
  }
}

/**
 * Extract conversation hooks from top-performing posts
 */
function extractHooks(posts: LinkedInPost[]): ConversationHook[] {
  const hooks: ConversationHook[] = []

  // Sort by engagement
  const sortedByEngagement = [...posts].sort((a, b) => {
    const engA = (a.likes || 0) + (a.comments || 0) * 2
    const engB = (b.likes || 0) + (b.comments || 0) * 2
    return engB - engA
  })

  for (const post of sortedByEngagement.slice(0, 3)) {
    const text = post.text || ''
    const engagement = (post.likes || 0) + (post.comments || 0) * 2

    // Extract first sentence or first 100 chars as snippet
    const firstSentence = text.split(/[.!?]/)[0] || ''
    const snippet = firstSentence.length > 100 ? firstSentence.substring(0, 100) + '...' : firstSentence

    // Determine the topic/angle
    const topics = extractTopics([post])
    const topic = topics[0] || 'general'

    // Create angle suggestion
    let angle = 'Reference their perspective on ' + topic
    if (text.toLowerCase().includes('lesson') || text.toLowerCase().includes('learned')) {
      angle = 'Ask about their experience with ' + topic
    } else if (text.toLowerCase().includes('?')) {
      angle = 'Offer insight on the question they raised'
    } else if (engagement > 50) {
      angle = 'Compliment their viral take on ' + topic
    }

    hooks.push({
      topic,
      postSnippet: snippet,
      engagement,
      angle,
    })
  }

  return hooks
}

/**
 * Create empty analysis result
 */
function createEmptyAnalysis(): EnhancedLinkedInAnalysis {
  return {
    recentTopics: [],
    postingFrequency: 'inactive',
    isActiveUser: false,
    avgEngagement: 0,
    totalPosts: 0,
    engagementTrend: 'stable',
    painIndicators: [],
    hasPainSignals: false,
    tone: {
      primary: 'formal',
      scores: {},
      emojisUsed: false,
      avgSentenceLength: 0,
    },
    conversationHooks: [],
    bestHook: null,
  }
}
