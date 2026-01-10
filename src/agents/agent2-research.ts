/**
 * Agent 2: Research Agent
 * Synthesizes data from LinkedIn (Apify) and web search (Perplexity)
 * into actionable sales triggers and messaging angles
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase, type Lead } from '../lib/supabase'
import type { WebSearchResult } from '../lib/perplexity'

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

  return `You are my "Outbound Research Analyst."
Your job is to ANALYZE the research data I've gathered and return sales-relevant triggers + messaging angles.

I have already gathered research from LinkedIn and web sources. Your job is to analyze this data and extract actionable insights.

KEY QUESTION: What is a natural change or shift happening that might create an opening for JSB Media?

JSB Media helps companies with digital marketing and paid media - identity resolution, match rate optimization, AI-powered content, and performance marketing.

Return a list of items, stacked ranked based on:
1. The level of priority (how urgent/timely)
2. The level of impact on the business

=== JSB MEDIA CONTEXT ===
${sharedDocs}

=== IDEAL CUSTOMER PROFILE ===
${icpDocs}

=== BUYER PERSONAS ===
${personaDocs}

=== TARGET LEAD ===
Person:
- Name: ${lead.first_name} ${lead.last_name}
- Email: ${lead.email}
- Title: ${lead.job_title || 'Unknown'}
- Department: ${lead.department || 'Unknown'}
- Seniority: ${lead.seniority_level || 'Unknown'}

Company:
- Name: ${lead.company_name}
- Domain: ${lead.company_domain || 'Unknown'}
- Industry: ${lead.company_industry || 'Unknown'}
- Size: ${lead.company_employee_count || 'Unknown'} employees
- Revenue: ${lead.company_revenue || 'Unknown'}
- Description: ${lead.company_description || 'N/A'}

${lead.source === 'intent_data' ? `Intent Signal (Daily Intent Data):
- Source: AudienceLab intent data (NOT website visitor)
- Intent Score: ${(lead as Record<string, unknown>).intent_score || 'N/A'}/100
- This lead was identified through intent data monitoring, NOT from visiting the JSB Media website
- DO NOT mention or reference website visits in your analysis

TARGET ICP FOR INTENT DATA:
Mid-market companies ($10M-$500M revenue) in competitive, high-volume industries—QSR, e-commerce, travel, tourism, hospitality, franchises, home services—that are scaling across multiple locations or channels but can't compete on marketing sophistication against larger players. They need data-driven, omnichannel activation.

INTENT SIGNAL BEING MEASURED:
Companies activating multiple channels (Meta, TikTok, Reddit, Search, programmatic, organic) but can't execute cohesively, prove ROI, or scale profitably. They have budgets and ambition, but fragmented data, poor attribution, and no unified insight into what actually works. They need identity resolution and smarter targeting.` : `Intent Signal (Website Visitor):
- Visit Count: ${lead.visit_count || 1} visits to JSB Media website
- This is a verified intent signal - they are actively researching marketing services.`}

=== RESEARCH DATA: LINKEDIN PROFILE ===
${linkedinProfileStr}

=== RESEARCH DATA: LINKEDIN COMPANY ===
${linkedinCompanyStr}

=== RESEARCH DATA: WEB RESEARCH ===
${perplexityStr}

================================================================================
STEP 1 — PERSONA MATCHING
================================================================================
Match the lead to one of the buyer personas by analyzing ALL available signals:

1. Title - What is their job title?
2. Industry - What industry is their company in?
3. Company description - What does their company do?
4. Seniority/Department - What level are they? What function?
5. LinkedIn posts - What do they talk about? What are their priorities?
6. Company size/revenue - Is this a small business or enterprise?

Combine these signals to determine their actual FUNCTION and persona.

Example: "Partner at Law Firm" could be:
- marketing_leadership (if they run the firm's marketing)
- professional_services (if they're a practicing attorney who needs to originate business)
- owner (if they own/founded the firm)

Example: "CEO" at a 5-person company = owner persona
Example: "CEO" at a 500-person company = could be marketing_leadership if they oversee marketing directly

The persona should reflect their FUNCTION based on the full picture, not just one data point.
Determine if they are ATL (Above The Line - decision maker) or BTL (Below The Line - influencer).

================================================================================
STEP 2 — ANALYZE RESEARCH & EXTRACT TRIGGERS
================================================================================
Analyze the research data above and return as many factual sales-relevant triggers from the last 12 months (prefer last 90 days).

Relevant trigger categories:
• hiring - Hiring for marketing/growth roles (CMO, VP Marketing, Growth Lead, Paid Media, etc.)
• leadership_change - Leadership changes (new CMO, VP Marketing, Head of Growth, etc.)
• funding - Funding announcements (with stated growth goals)
• product_launch - Product/feature launches (new SKUs, upmarket moves)
• expansion - Geographic expansion (new offices, first hires in region)
• partnership - Partnerships/channel programs
• tech_stack - Marketing tech stack changes (new ad platforms, CRM, CDP, etc.)
• market_shift - ICP or market shift (moving upmarket, new industry)
• layoffs - Layoffs or hiring freezes in marketing orgs
• compliance - Compliance/market changes impacting marketing
• site_visitor - They visited our website (ONLY include if lead source is pixel/website visitor, NOT intent data)
• thought_leadership - Content themes from their LinkedIn posts that reveal what they care about AND who they serve
${lead.source === 'intent_data' ? `
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

These are HIGHER value triggers than generic hiring/funding for intent leads.` : ''}

HOW TO ANALYZE POSTS FOR thought_leadership:

Step 1 - Identify recurring topics:
- What subjects do they post about repeatedly?
- What's their area of expertise?

Step 2 - Determine WHO they're talking TO:
- Are they advising/warning an audience? (advisory role)
- Are they showcasing work for clients? (agency role)
- Are they sharing their own company's challenges? (direct client)

Step 3 - Extract the INSIGHT, not just the topic:
- BAD: "Posts about influencer marketing" (too vague)
- GOOD: "Advises brands on FTC compliance for influencer campaigns - warns about class action risks"

SCORING for thought_leadership:
- Impact: How much does this reveal about their priorities and who they serve?
- Recency: Are they posting about this consistently/recently?
- Relevance: Does this create an opening for JSB Media?

CONTENT INCLUSION for thought_leadership triggers:
- Score >= 12: Include a key quote in "content_excerpt" that shows their POV
- Score >= 14: Include full post text in "full_content"

EXAMPLE thought_leadership:
Posts say: "Brands are being called out for failing to properly disclose paid endorsements... Are your influencer agreements up to par?"
Analysis:
- Topic: Influencer marketing compliance
- Audience: BRANDS (she's advising them, not recruiting plaintiffs)
- Insight: She's defense-side, helping brands avoid lawsuits
Output:
- type: thought_leadership
- fact: "Advises brands on FTC compliance for influencer marketing - posts about class action risks and disclosure requirements"
- content_excerpt: "Brands are being called out for failing to properly disclose paid endorsements... Are your influencer agreements up to par?"
- scores: { impact: 5, recency: 4, relevance: 5, total: 14 }

RULES FOR TRIGGERS:
- Each trigger must be a FACT found in the research data above
- Include source + date when available
- Do NOT generate fluff or guesses
- You don't have to return all 10 categories - just find the relevant ones from the data

Format each trigger with:
• Type: [category from list above]
• Fact: [Concise factual statement]
• Source: [URL or source]
• Date: [YYYY-MM-DD if available]

================================================================================
STEP 3 — STACK RANKING
================================================================================
Score each trigger by:
- Impact (1-5): How significant is this for the business?
- Recency (1-5): How recent? (Last 30 days = 5, 90 days = 4, 6 months = 3, 12 months = 2)
- Relevance (1-5): How relevant to JSB Media's marketing services?

Return triggers RANKED highest → lowest by total score.

================================================================================
STEP 4 — MESSAGING ANGLES
================================================================================
Create 3 messaging angles based on the triggers. You can stack multiple triggers together to show what could be a focus for the org as a whole.

Each angle MUST include:
- The angle/approach
- Which triggers support it
- "Why this creates an opening:" - A short breakdown of why this is a good time to reach out

================================================================================
STEP 5 — RELATIONSHIP TYPE
================================================================================
Determine the best relationship type by analyzing:
1. What they DO (their job function)
2. WHO they serve (their clients/customers)
3. What their clients NEED that JSB could provide

Relationship types:
• direct_client - They need marketing services for themselves
• referral_partner - They advise/serve clients who need marketing (e.g., law firms, consultants, advisors)
• white_label - Any agency, firm, or company that could offer JSB services under their own brand to their clients
• strategic_partner - Co-marketing opportunity, joint content, integrations

HOW TO REASON THROUGH THIS:

Step A: Analyze their content to understand WHO they're talking TO (not just what they talk about)
- Are they warning/advising clients? → They're an advisor (referral_partner potential)
- Are they selling services to end customers? → They're direct_client potential
- Are they an agency serving clients? → They're white_label potential

Step B: For non-direct-client relationships, identify:
- WHO they serve (their clients)
- What those clients need that JSB could provide
- An opening question to explore the relationship

EXAMPLE REASONING (Law firm partner posting about influencer marketing compliance):
Posts say: "Brands are being called out for failing to properly disclose paid endorsements... Are your influencer agreements up to par?"
Analysis:
- She's WARNING brands (not recruiting plaintiffs for lawsuits)
- Her language is advisory: "ensure your brand is protected"
- She's on the DEFENSE side - helping brands stay compliant
- Her CLIENTS are brands doing influencer marketing
- Those brands need agencies who understand FTC compliance
Conclusion:
- Type: referral_partner (not direct_client)
- Who she serves: "Brands doing influencer marketing who need compliance guidance"
- Her clients' need: Agencies that won't create legal risk
- Opening: "Curious how you advise clients on finding agencies that understand disclosure requirements"

EXAMPLE REASONING (Creative agency posting about campaign work):
Posts say: "Excited to share our latest campaign for [Brand X]... Proud of the results we delivered"
Analysis:
- They're an AGENCY serving brand clients
- They do creative/strategy but may not do paid media in-house
- Their clients need full-service marketing execution
- JSB could power their paid media offering
Conclusion:
- Type: white_label
- Who they serve: "Brands needing creative campaigns"
- Their clients' need: Paid media execution to complement creative
- Opening: "Do your clients ever ask for paid media services beyond creative?"

================================================================================
STEP 6 — COMPANY INTEL
================================================================================
Extract from the research:
- tech_stack: What marketing/ad tech do they use?
- competitors: Who are their main competitors?
- recent_news: Key recent announcements
- growth_signals: Signs they're growing/investing

================================================================================
OUTPUT FORMAT — Return ONLY valid JSON:
================================================================================

{
  "persona_match": {
    "type": "owner" | "marketing_leadership" | "growth_marketing" | "paid_media" | "sales_leadership" | "professional_services" | "unknown",
    "decision_level": "ATL" | "BTL" | "unknown",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation"
  },
  "triggers": [
    {
      "type": "hiring | leadership_change | funding | product_launch | expansion | partnership | tech_stack | market_shift | layoffs | compliance | site_visitor | thought_leadership",
      "fact": "Concise factual statement from the research",
      "source": "URL or source name (null if unavailable)",
      "date": "YYYY-MM-DD (null if unavailable)",
      "scores": {
        "impact": 1-5,
        "recency": 1-5,
        "relevance": 1-5,
        "total": sum
      },
      "content_excerpt": "Key quote if score >= 12 (optional, for thought_leadership)",
      "full_content": "Full post if score >= 14 (optional, for thought_leadership)"
    }
  ],
  "messaging_angles": [
    {
      "angle": "The messaging angle/approach",
      "triggers_used": ["trigger type 1", "trigger type 2"],
      "why_opening": "Why this creates an opening: [specific breakdown of timing and opportunity]"
    }
  ],
  "relationship": {
    "type": "direct_client" | "referral_partner" | "white_label" | "strategic_partner" | "unknown",
    "reasoning": "Why this relationship type makes sense",
    "who_they_serve": "Description of their clients (if applicable)",
    "opening_question": "Suggested opening question for outreach"
  },
  "company_intel": {
    "tech_stack": ["tool1", "tool2"],
    "competitors": ["competitor1", "competitor2"],
    "recent_news": ["news item 1"],
    "growth_signals": ["signal 1"]
  }
}

FINAL RULES:
- Keep triggers factual - only include what you found in the research data
- Keep angles concise - do NOT write full outbound messages
- Stack rank everything by priority and impact
- Return ONLY the JSON, no other text.`
}
