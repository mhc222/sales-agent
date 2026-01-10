/**
 * LinkedIn Post Analyzer
 * Quick analysis of LinkedIn posts to determine if we have enough triggers
 * before moving to the next step in the waterfall
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

/**
 * Analyze LinkedIn posts to extract triggers and determine if sufficient
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
