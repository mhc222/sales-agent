/**
 * Reply Classifier
 * Uses the tenant's configured LLM to classify email replies into categories
 */

import { getTenantLLM } from './tenant-settings'

export type ReplyCategory =
  | 'interested'
  | 'out_of_office'
  | 'not_interested_now'
  | 'remove_me'
  | 'other'

export interface ClassificationResult {
  category: ReplyCategory
  confidence: number
  reasoning: string
  // Out of office specific
  ooo_return_date?: string // ISO date string
  // Interest specific
  interest_level?: 'hot' | 'warm'
  interest_signals?: string[]
  // Not interested specific
  follow_up_suggestion?: string
}

interface ClassifyInput {
  tenantId: string
  reply_text: string
  reply_subject?: string
  lead_name?: string
  company_name?: string
}

/**
 * Classify an email reply into actionable categories
 */
export async function classifyReply(input: ClassifyInput): Promise<ClassificationResult> {
  const { tenantId, reply_text, reply_subject, lead_name, company_name } = input

  const prompt = `You are classifying an email reply to a cold outreach email. Analyze the reply and categorize it.

REPLY SUBJECT: ${reply_subject || 'N/A'}
REPLY TEXT:
${reply_text}

SENDER: ${lead_name || 'Unknown'} from ${company_name || 'Unknown Company'}

Classify this reply into ONE of these categories:

1. **interested** - They want to learn more, schedule a call, or expressed positive interest
   - Look for: "sounds interesting", "let's chat", "tell me more", "can we schedule", questions about services
   - Interest level: "hot" (ready to talk now) or "warm" (curious but not urgent)

2. **out_of_office** - Auto-reply indicating they're away
   - Look for: "out of office", "on vacation", "will return", "limited access to email"
   - IMPORTANT: Extract the return date if mentioned (e.g., "back on January 15th" → "2025-01-15")

3. **not_interested_now** - Not interested currently but not asking to be removed
   - Look for: "not a good time", "maybe later", "not a priority right now", "circle back in Q2"
   - Suggest when to follow up if they mention timing

4. **remove_me** - Explicitly asking to be removed from outreach
   - Look for: "unsubscribe", "remove me", "stop emailing", "not interested" (firm), "don't contact me"

5. **other** - Doesn't fit the above (wrong person, question, complaint, etc.)

Return JSON only:
{
  "category": "interested" | "out_of_office" | "not_interested_now" | "remove_me" | "other",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this category",
  "ooo_return_date": "YYYY-MM-DD or null (only for out_of_office)",
  "interest_level": "hot" | "warm" | null (only for interested),
  "interest_signals": ["signal1", "signal2"] or null (only for interested),
  "follow_up_suggestion": "suggestion or null (only for not_interested_now)"
}`

  // Get tenant's configured LLM
  const llm = await getTenantLLM(tenantId)

  const response = await llm.chat([
    { role: 'user', content: prompt },
  ], { maxTokens: 1000 })

  try {
    // Parse JSON response
    let jsonText = response.content.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const parsed = JSON.parse(jsonText)

    return {
      category: parsed.category as ReplyCategory,
      confidence: parsed.confidence || 0.8,
      reasoning: parsed.reasoning || '',
      ooo_return_date: parsed.ooo_return_date || undefined,
      interest_level: parsed.interest_level || undefined,
      interest_signals: parsed.interest_signals || undefined,
      follow_up_suggestion: parsed.follow_up_suggestion || undefined,
    }
  } catch (error) {
    console.error('[Reply Classifier] Failed to parse response:', response.content)

    // Fallback classification based on keywords
    return fallbackClassification(reply_text)
  }
}

/**
 * Simple keyword-based fallback if LLM parsing fails
 */
function fallbackClassification(text: string): ClassificationResult {
  const lowerText = text.toLowerCase()

  // Check for out of office first (usually auto-replies)
  if (
    lowerText.includes('out of office') ||
    lowerText.includes('on vacation') ||
    lowerText.includes('away from') ||
    lowerText.includes('auto-reply') ||
    lowerText.includes('automatic reply')
  ) {
    return {
      category: 'out_of_office',
      confidence: 0.7,
      reasoning: 'Detected out of office keywords',
    }
  }

  // Check for remove/unsubscribe
  if (
    lowerText.includes('unsubscribe') ||
    lowerText.includes('remove me') ||
    lowerText.includes('stop emailing') ||
    lowerText.includes("don't contact") ||
    lowerText.includes('opt out')
  ) {
    return {
      category: 'remove_me',
      confidence: 0.8,
      reasoning: 'Detected unsubscribe keywords',
    }
  }

  // Check for interest
  if (
    lowerText.includes('interested') ||
    lowerText.includes("let's chat") ||
    lowerText.includes('schedule') ||
    lowerText.includes('tell me more') ||
    lowerText.includes('sounds good')
  ) {
    return {
      category: 'interested',
      confidence: 0.6,
      reasoning: 'Detected interest keywords',
      interest_level: 'warm',
    }
  }

  // Check for not now
  if (
    lowerText.includes('not a good time') ||
    lowerText.includes('maybe later') ||
    lowerText.includes('circle back') ||
    lowerText.includes('not right now')
  ) {
    return {
      category: 'not_interested_now',
      confidence: 0.6,
      reasoning: 'Detected timing-related decline',
    }
  }

  // Default to other
  return {
    category: 'other',
    confidence: 0.5,
    reasoning: 'Could not confidently classify - needs human review',
  }
}

/**
 * Parse a date from natural language
 * Returns ISO date string or undefined
 */
export function parseReturnDate(text: string): string | undefined {
  // Common patterns: "back on January 15", "returning January 15th", "return on 1/15"
  const datePatterns = [
    /(?:back|return|returning)\s+(?:on\s+)?(\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
    /(?:back|return|returning)\s+(?:on\s+)?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
    /(?:until|through)\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
  ]

  for (const pattern of datePatterns) {
    const match = text.match(pattern)
    if (match) {
      try {
        const dateStr = match[1]
        const parsed = new Date(dateStr)
        if (!isNaN(parsed.getTime())) {
          // If year not specified, assume current/next year
          if (!dateStr.match(/\d{4}/)) {
            const now = new Date()
            if (parsed < now) {
              parsed.setFullYear(parsed.getFullYear() + 1)
            }
          }
          return parsed.toISOString().split('T')[0]
        }
      } catch {
        // Continue to next pattern
      }
    }
  }

  return undefined
}
