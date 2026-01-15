/**
 * Agent 2: Research Agent
 * Synthesizes data from LinkedIn (Apify) and web search (Perplexity)
 * into actionable sales triggers and messaging angles
 *
 * Enhanced with multi-query research, pain detection, and intent scoring.
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase, type Lead } from '../lib/supabase'
import type { WebSearchResult, PerplexityResearch } from '../lib/perplexity'
import { researchCompany } from '../lib/perplexity'
import { analyzeLinkedInPostsEnhanced, type EnhancedLinkedInAnalysis } from '../lib/linkedin-analyzer'
import { scoreIntent, type EnhancedIntentScore, type IntentData } from '../lib/intent-scorer'
import { loadPrompt } from '../lib/prompt-loader'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Types
export type TriggerType =
  | 'hiring'
  | 'leadership_change'
  | 'funding'
  | 'product_launch'
  | 'expansion'
  | 'partnership'
  | 'tech_stack'
  | 'market_shift'
  | 'layoffs'
  | 'compliance'
  | 'site_visitor'
  | 'thought_leadership'

export type PersonaType =
  | 'owner'
  | 'marketing_leadership'
  | 'growth_marketing'
  | 'paid_media'
  | 'sales_leadership'
  | 'professional_services'
  | 'unknown'

export type RelationshipType =
  | 'direct_client' // Sell them services directly
  | 'referral_partner' // Mutual referral opportunity (e.g., law firm advising brands)
  | 'white_label' // Any agency/firm/company that wants to offer JSB services under their brand
  | 'strategic_partner' // Co-marketing, joint content, integrations
  | 'unknown'

export interface Trigger {
  type: TriggerType
  fact: string
  source: string | null
  date: string | null
  scores: {
    impact: number // 1-5
    recency: number // 1-5
    relevance: number // 1-5
    total: number // sum
  }
  // For high-scoring triggers (especially thought_leadership)
  content_excerpt?: string // Include if score >= 12
  full_content?: string // Include if score >= 14
}

export interface MessagingAngle {
  angle: string
  triggers_used: string[]
  why_opening: string
}

export interface ResearchResult {
  // Raw data stored for reference
  linkedin_personal: Record<string, unknown> | null
  linkedin_company: Record<string, unknown> | null
  perplexity_results: Record<string, unknown> | null

  // Persona matching (from RAG)
  persona_match: {
    type: PersonaType
    decision_level: 'ATL' | 'BTL' | 'unknown'
    confidence: number
    reasoning: string
  }

  // Triggers (stack ranked by total score)
  triggers: Trigger[]

  // Messaging angles (top 3)
  messaging_angles: MessagingAngle[]

  // Additional intel
  company_intel: {
    tech_stack: string[]
    competitors: string[]
    recent_news: string[]
    growth_signals: string[]
  }

  // Relationship classification
  relationship: {
    type: RelationshipType
    reasoning: string
    who_they_serve: string // e.g., "brands doing influencer marketing"
    opening_question: string // e.g., "How do you advise clients on finding compliant agencies?"
  }
}

interface RawResearchData {
  linkedinProfile: Record<string, unknown> | null
  linkedinCompany: Record<string, unknown> | null
  perplexityResults: WebSearchResult | null
}

/**
 * Main research function - synthesizes all data sources
 */
export async function researchLead(
  lead: Lead,
  rawData: RawResearchData
): Promise<ResearchResult> {
  console.log(`[Agent 2] Starting research synthesis for: ${lead.email}`)

  // Fetch RAG documents for persona matching and context
  const { data: ragDocs, error: ragError } = await supabase
    .from('rag_documents')
    .select('content, rag_type, metadata')
    .eq('tenant_id', lead.tenant_id)
    .in('rag_type', ['persona', 'icp', 'shared'])

  if (ragError) {
    console.error('[Agent 2] Error fetching RAG documents:', ragError)
  }

  // Organize RAG content
  const personaDocs =
    ragDocs
      ?.filter((d) => d.rag_type === 'persona')
      .map((d) => d.content)
      .join('\n\n') || ''

  const icpDocs =
    ragDocs
      ?.filter((d) => d.rag_type === 'icp')
      .map((d) => d.content)
      .join('\n\n') || ''

  const sharedDocs =
    ragDocs
      ?.filter((d) => d.rag_type === 'shared')
      .map((d) => d.content)
      .join('\n\n') || ''

  // Build the research synthesis prompt
  const prompt = buildResearchPrompt(lead, rawData, personaDocs, icpDocs, sharedDocs)

  // Call Claude for synthesis
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  // Parse response
  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : ''

  let result: ResearchResult

  try {
    // Strip markdown code blocks if present
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    const parsed = JSON.parse(jsonText)

    result = {
      linkedin_personal: rawData.linkedinProfile,
      linkedin_company: rawData.linkedinCompany,
      perplexity_results: rawData.perplexityResults as Record<string, unknown> | null,
      persona_match: parsed.persona_match || {
        type: 'unknown',
        decision_level: 'unknown',
        confidence: 0.5,
        reasoning: 'Unable to determine persona',
      },
      triggers: (parsed.triggers || []).sort(
        (a: Trigger, b: Trigger) => b.scores.total - a.scores.total
      ),
      messaging_angles: parsed.messaging_angles || [],
      company_intel: parsed.company_intel || {
        tech_stack: [],
        competitors: [],
        recent_news: [],
        growth_signals: [],
      },
      relationship: parsed.relationship || {
        type: 'unknown',
        reasoning: 'Unable to determine relationship type',
        who_they_serve: '',
        opening_question: '',
      },
    }
  } catch (error) {
    console.error('[Agent 2] Failed to parse research response:', responseText)
    // Return minimal result on parse failure
    result = {
      linkedin_personal: rawData.linkedinProfile,
      linkedin_company: rawData.linkedinCompany,
      perplexity_results: rawData.perplexityResults as Record<string, unknown> | null,
      persona_match: {
        type: 'unknown',
        decision_level: 'unknown',
        confidence: 0.5,
        reasoning: 'Parse error - manual review needed',
      },
      triggers: lead.source === 'intent_data'
        ? [] // Intent leads don't have site visitor triggers
        : [
            {
              type: 'site_visitor',
              fact: `Visited website ${lead.visit_count || 1} time(s)`,
              source: 'AudienceLab pixel',
              date: new Date().toISOString().split('T')[0],
              scores: { impact: 3, recency: 5, relevance: 4, total: 12 },
            },
          ],
      messaging_angles: [],
      company_intel: {
        tech_stack: [],
        competitors: [],
        recent_news: [],
        growth_signals: [],
      },
      relationship: {
        type: 'unknown',
        reasoning: 'Parse error - manual review needed',
        who_they_serve: '',
        opening_question: '',
      },
    }
  }

  console.log(
    `[Agent 2] Research complete - ${result.triggers.length} triggers, ${result.messaging_angles.length} angles`
  )

  return result
}

/**
 * Build the comprehensive research synthesis prompt
 */
function buildResearchPrompt(
  lead: Lead,
  rawData: RawResearchData,
  personaDocs: string,
  icpDocs: string,
  sharedDocs: string
): string {
  const linkedinProfileStr = rawData.linkedinProfile
    ? JSON.stringify(rawData.linkedinProfile, null, 2)
    : 'Not available'

  const linkedinCompanyStr = rawData.linkedinCompany
    ? JSON.stringify(rawData.linkedinCompany, null, 2)
    : 'Not available'

  const perplexityStr = rawData.perplexityResults
    ? `Content:\n${rawData.perplexityResults.content}\n\nCitations:\n${rawData.perplexityResults.citations.join('\n')}`
    : 'Not available'

  // Build intent signal section based on lead source
  const intentScore = (lead as Record<string, unknown>).intent_score as number | undefined
  const intentTier = intentScore !== undefined
    ? intentScore >= 90 ? 'HIGH INTENT (90-100)'
    : intentScore >= 71 ? 'MEDIUM INTENT (71-89)'
    : intentScore >= 54 ? 'ENTERING INTENT (54-70)'
    : 'LOW INTENT (<54)'
    : 'Unknown'

  const intentSignalSection = lead.source === 'intent_data'
    ? `Intent Signal (Daily Intent Data):
- Source: AudienceLab intent data (NOT website visitor)
- Intent Score: ${intentScore || 'N/A'}/100
- Intent Tier: ${intentTier}
- This lead was identified through intent data monitoring, NOT from visiting the JSB Media website
- DO NOT mention or reference website visits in your analysis

================================================================================
CRITICAL: WHAT THE INTENT SCORE ACTUALLY MEANS
================================================================================

AudienceLab measures "DEVIATION FROM STANDARD BEHAVIOR" - not just raw activity.

The score compares this person's LAST 7 DAYS of browsing to their long-term baseline.
A high score means their behavior SPIKED recently - they just entered an active buying cycle.

This is the difference between:
- "Bob the Browser" (steady 66→70 score) - casually interested, no urgency
- "Colin the Customer" (spiked 40→90) - just started actively evaluating, buying window is NOW

INTENT TIERS AND WHAT THEY MEAN:

📍 HIGH INTENT (90-100): ACTIVE BUYING PHASE
   - Their behavior JUST spiked in the last 7 days
   - They're on contact pages, resource pages, comparing options
   - This is "Colin the Customer" - ready to engage NOW
   - The window is narrow - they're making decisions this week
   - Outreach approach: Be direct, confident, assume they're evaluating

📍 MEDIUM INTENT (71-89): CONSIDERATION PHASE
   - Growing upward trend in their behavior
   - They're looking at competitors, diving deeper
   - Moving from education to active consideration
   - Outreach approach: Reference their likely research, show differentiation

📍 ENTERING INTENT (54-70): EARLY RESEARCH PHASE
   - Just starting their journey
   - Visiting blogs, educational content
   - Good for nurture, not aggressive outreach
   - Outreach approach: Lead with pure value, no hard CTAs

YOUR JOB: Find triggers that explain WHY they entered this buying cycle.
The intent score tells us WHEN (now). The triggers tell us WHY (pain points).

================================================================================

TARGET ICP FOR INTENT DATA:
Mid-market companies ($10M-$500M revenue) in competitive, high-volume industries—QSR, e-commerce, travel, tourism, hospitality, franchises, home services—that are scaling across multiple locations or channels but can't compete on marketing sophistication against larger players. They need data-driven, omnichannel activation.

INTENT SIGNAL BEING MEASURED:
Companies activating multiple channels (Meta, TikTok, Reddit, Search, programmatic, organic) but can't execute cohesively, prove ROI, or scale profitably. They have budgets and ambition, but fragmented data, poor attribution, and no unified insight into what actually works. They need identity resolution and smarter targeting.`
    : `Intent Signal (Website Visitor):
- Visit Count: ${lead.visit_count || 1} visits to JSB Media website
- This is a verified intent signal - they are actively researching marketing services.`

  // Build intent trigger section for intent data leads
  const intentTriggerSection = lead.source === 'intent_data'
    ? `
**INTENT DATA PRIORITY TRIGGERS** (Look for these first for intent leads):
• multi_channel_struggle - Evidence of running multiple ad channels without cohesion (Meta + Google + TikTok but fragmented)
• attribution_pain - Posts about not knowing what's working, ROI struggles, measurement challenges
• agency_fragmentation - Working with multiple agencies/vendors, consolidation mentions, agency frustration
• scaling_challenge - Growth hitting a wall, can't scale what's working, execution bottlenecks
• data_silos - Mentions of disconnected data, no single source of truth, CDP discussions
• identity_resolution - Audience targeting challenges, first-party data concerns, privacy changes impact

FOR INTENT LEADS, PRIORITIZE:
1. Any signal that they're running multiple channels but struggling to coordinate
2. Frustration with current agencies or vendors
3. Attribution/measurement mentions (can't prove ROI, dark social, attribution modeling)
4. Scaling challenges despite having budget
5. Data quality or audience targeting concerns

These are HIGHER value triggers than generic hiring/funding for intent leads.`
    : ''

  return loadPrompt('agent2-research', {
    sharedDocs,
    icpDocs,
    personaDocs,
    firstName: lead.first_name,
    lastName: lead.last_name,
    email: lead.email,
    jobTitle: lead.job_title || 'Unknown',
    department: lead.department || 'Unknown',
    seniorityLevel: lead.seniority_level || 'Unknown',
    companyName: lead.company_name,
    companyDomain: lead.company_domain || 'Unknown',
    companyIndustry: lead.company_industry || 'Unknown',
    companyEmployeeCount: String(lead.company_employee_count || 'Unknown'),
    companyRevenue: lead.company_revenue || 'Unknown',
    companyDescription: lead.company_description || 'N/A',
    intentSignalSection,
    linkedinProfileStr,
    linkedinCompanyStr,
    perplexityStr,
    intentTriggerSection,
  })
}

// ============================================================================
// ENHANCED RESEARCH (New Multi-Query Approach)
// ============================================================================

export interface EnhancedResearchResult extends ResearchResult {
  // Enhanced signals from new modules
  perplexityEnhanced: PerplexityResearch | null
  linkedinEnhanced: EnhancedLinkedInAnalysis | null
  intentScore: EnhancedIntentScore | null

  // Consolidated priority signals
  prioritySignals: {
    hasFundingTrigger: boolean
    hasHiringTrigger: boolean
    hasPainSignal: boolean
    hasPersonVisibility: boolean
    hasHighIntent: boolean
    primaryPain: string | null
    toneMatch: string | null
    conversationHooks: string[]
  }
}

interface EnhancedRawResearchData extends RawResearchData {
  linkedinPosts?: Array<{
    text: string
    date?: string
    likes?: number
    comments?: number
  }>
  intentData?: IntentData
}

/**
 * Enhanced research function using new multi-query modules
 * Runs parallel analysis for better signal extraction
 */
export async function conductEnhancedResearch(
  lead: Lead,
  rawData: EnhancedRawResearchData
): Promise<EnhancedResearchResult> {
  console.log(`[Agent 2] Starting ENHANCED research for: ${lead.email}`)

  // Run enhanced analysis in parallel with base research
  const [baseResult, perplexityEnhanced, linkedinEnhanced, intentScore] = await Promise.all([
    // Base research (existing flow)
    researchLead(lead, rawData),

    // Enhanced Perplexity research (4 parallel queries)
    researchCompany(
      lead.company_name,
      `${lead.first_name} ${lead.last_name}`,
      lead.company_domain || undefined,
      lead.company_industry || undefined
    ).catch((err) => {
      console.error('[Agent 2] Enhanced Perplexity research failed:', err)
      return null
    }),

    // Enhanced LinkedIn analysis with pain detection (synchronous)
    rawData.linkedinPosts && rawData.linkedinPosts.length > 0
      ? Promise.resolve(analyzeLinkedInPostsEnhanced(rawData.linkedinPosts))
      : Promise.resolve(null),

    // Intent scoring (if intent data available)
    rawData.intentData
      ? Promise.resolve(scoreIntent(rawData.intentData))
      : Promise.resolve(null),
  ])

  // Build priority signals from enhanced data
  const prioritySignals = buildPrioritySignals(perplexityEnhanced, linkedinEnhanced, intentScore)

  // Merge enhanced triggers into base result
  const enhancedTriggers = mergeEnhancedTriggers(
    baseResult.triggers,
    perplexityEnhanced,
    linkedinEnhanced
  )

  console.log(
    `[Agent 2] Enhanced research complete - ${enhancedTriggers.length} triggers, ` +
      `pain: ${prioritySignals.hasPainSignal}, intent: ${prioritySignals.hasHighIntent}`
  )

  return {
    ...baseResult,
    triggers: enhancedTriggers,
    perplexityEnhanced,
    linkedinEnhanced,
    intentScore,
    prioritySignals,
  }
}

/**
 * Build consolidated priority signals from all enhanced sources
 */
function buildPrioritySignals(
  perplexity: PerplexityResearch | null,
  linkedin: EnhancedLinkedInAnalysis | null,
  intent: EnhancedIntentScore | null
): EnhancedResearchResult['prioritySignals'] {
  return {
    hasFundingTrigger: perplexity?.triggers.recentFunding ?? false,
    hasHiringTrigger: perplexity?.triggers.activelyHiring ?? false,
    hasPainSignal: linkedin?.painIndicators?.some((p) => p.confidence === 'high') ?? false,
    hasPersonVisibility: perplexity?.triggers.personInNews ?? false,
    hasHighIntent: intent?.tier === 'hot',
    primaryPain: linkedin?.painIndicators?.[0]?.text ?? null,
    toneMatch: linkedin?.tone?.primary ?? null,
    conversationHooks: linkedin?.conversationHooks?.map((h) => h.angle) ?? [],
  }
}

/**
 * Safely convert Date | string | null to ISO date string
 */
function toDateString(date: Date | string | null | undefined): string | null {
  if (!date) return null
  if (typeof date === 'string') {
    // Already a string, extract just the date part if it's an ISO string
    return date.includes('T') ? date.split('T')[0] : date
  }
  return date.toISOString().split('T')[0]
}

/**
 * Merge enhanced triggers with base triggers, avoiding duplicates
 */
function mergeEnhancedTriggers(
  baseTriggers: Trigger[],
  perplexity: PerplexityResearch | null,
  linkedin: EnhancedLinkedInAnalysis | null
): Trigger[] {
  const enhanced = [...baseTriggers]

  // Add funding trigger from enhanced Perplexity
  if (perplexity?.triggers.recentFunding && perplexity.funding.recency !== 'unknown') {
    const existingFunding = enhanced.find((t) => t.type === 'funding')
    if (!existingFunding) {
      enhanced.push({
        type: 'funding',
        fact:
          perplexity.funding.keyFindings[0] ||
          `Recent funding activity (${perplexity.funding.recency})`,
        source: 'Perplexity enhanced search',
        date: toDateString(perplexity.funding.mostRecentDate),
        scores: {
          impact: perplexity.funding.recency === 'hot' ? 5 : 4,
          recency: perplexity.funding.recency === 'hot' ? 5 : perplexity.funding.recency === 'warm' ? 4 : 3,
          relevance: 4,
          total: 0,
        },
      })
      enhanced[enhanced.length - 1].scores.total =
        enhanced[enhanced.length - 1].scores.impact +
        enhanced[enhanced.length - 1].scores.recency +
        enhanced[enhanced.length - 1].scores.relevance
    }
  }

  // Add hiring trigger from enhanced Perplexity
  if (perplexity?.triggers.activelyHiring && perplexity.hiring.recency !== 'unknown') {
    const existingHiring = enhanced.find((t) => t.type === 'hiring')
    if (!existingHiring) {
      enhanced.push({
        type: 'hiring',
        fact:
          perplexity.hiring.keyFindings[0] ||
          `Actively hiring in marketing/growth (${perplexity.hiring.recency})`,
        source: 'Perplexity enhanced search',
        date: toDateString(perplexity.hiring.mostRecentDate),
        scores: {
          impact: 4,
          recency: perplexity.hiring.recency === 'hot' ? 5 : 4,
          relevance: 4,
          total: 0,
        },
      })
      enhanced[enhanced.length - 1].scores.total =
        enhanced[enhanced.length - 1].scores.impact +
        enhanced[enhanced.length - 1].scores.recency +
        enhanced[enhanced.length - 1].scores.relevance
    }
  }

  // Add thought leadership from enhanced Perplexity
  if (perplexity?.triggers.personInNews) {
    const existingTL = enhanced.find((t) => t.type === 'thought_leadership')
    if (!existingTL && perplexity.personVisibility.keyFindings.length > 0) {
      enhanced.push({
        type: 'thought_leadership',
        fact: perplexity.personVisibility.keyFindings[0],
        source: 'Perplexity enhanced search',
        date: toDateString(perplexity.personVisibility.mostRecentDate),
        scores: {
          impact: 4,
          recency: perplexity.personVisibility.recency === 'hot' ? 5 : 4,
          relevance: 5,
          total: 0,
        },
        content_excerpt: perplexity.personVisibility.raw.slice(0, 300),
      })
      enhanced[enhanced.length - 1].scores.total =
        enhanced[enhanced.length - 1].scores.impact +
        enhanced[enhanced.length - 1].scores.recency +
        enhanced[enhanced.length - 1].scores.relevance
    }
  }

  // Add pain-based triggers from LinkedIn analysis
  if (linkedin?.painIndicators && linkedin.painIndicators.length > 0) {
    const highConfidencePains = linkedin.painIndicators.filter((p) => p.confidence === 'high')
    for (const pain of highConfidencePains.slice(0, 2)) {
      // Check if we already have a trigger about this pain
      const alreadyExists = enhanced.some(
        (t) => t.fact.toLowerCase().includes(pain.text.toLowerCase().slice(0, 30))
      )
      if (!alreadyExists) {
        // Convert postDate to string if it's a Date
        const dateStr = pain.postDate
          ? typeof pain.postDate === 'string'
            ? pain.postDate
            : pain.postDate.toISOString().split('T')[0]
          : null
        enhanced.push({
          type: 'market_shift', // Use market_shift as closest trigger type for pain
          fact: `Pain signal detected: "${pain.text.slice(0, 150)}..."`,
          source: 'LinkedIn post analysis',
          date: dateStr,
          scores: {
            impact: 5, // Pain signals are high impact
            recency: 4,
            relevance: 5,
            total: 14,
          },
        })
      }
    }
  }

  // Re-sort by total score
  return enhanced.sort((a, b) => b.scores.total - a.scores.total)
}
