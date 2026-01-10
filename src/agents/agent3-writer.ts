/**
 * Agent 3: Email Sequence Writer
 * Takes research output and generates a 7-email TIPS sequence
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase, type Lead } from '../lib/supabase'
import type { ResearchResult, RelationshipType } from './agent2-research'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Types
export interface EmailSequence {
  lead_id: string
  relationship_type: RelationshipType
  thread_1: {
    subject: string
    emails: Email[]
  }
  thread_2: {
    subject: string
    emails: Email[]
  }
  pain_1: PainPoint
  pain_2: PainPoint
  metadata: {
    persona_type: string
    top_trigger: string
    generated_at: string
  }
}

export interface Email {
  email_number: number
  day: number
  structure: string
  subject?: string
  body: string
  word_count: number
}

export interface PainPoint {
  pain: string
  implication: string
  solution: string
  social_proof: string
}

interface WriterInput {
  lead: Lead
  research: ResearchResult
}

/**
 * Main writer function - generates 7-email TIPS sequence
 */
export async function writeSequence(input: WriterInput): Promise<EmailSequence> {
  const { lead, research } = input

  console.log(`[Agent 3] Writing sequence for: ${lead.email}`)
  console.log(`[Agent 3] Relationship type: ${research.relationship.type}`)

  // Fetch RAG documents for value props and case studies
  const { data: ragDocs, error: ragError } = await supabase
    .from('rag_documents')
    .select('content, rag_type, metadata')
    .eq('tenant_id', lead.tenant_id)
    .in('rag_type', ['persona', 'shared'])

  if (ragError) {
    console.error('[Agent 3] Error fetching RAG documents:', ragError)
  }

  // Extract value props and case studies from RAG
  const valueProps = ragDocs
    ?.filter((d) => d.metadata?.category === 'value_propositions')
    .map((d) => d.content)
    .join('\n\n') || ''

  const caseStudies = ragDocs
    ?.filter((d) => d.metadata?.category === 'case_studies')
    .map((d) => d.content)
    .join('\n\n') || ''

  // Get persona-specific content
  const personaContent = ragDocs
    ?.filter((d) => d.rag_type === 'persona' && d.metadata?.persona_type === research.persona_match.type)
    .map((d) => d.content)
    .join('\n\n') || ''

  // Build the writer prompt
  const prompt = buildWriterPrompt(lead, research, valueProps, caseStudies, personaContent)

  // Call Claude with extended thinking for better reasoning
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    thinking: {
      type: 'enabled',
      budget_tokens: 8000,
    },
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  // Parse response - filter out thinking blocks to get the text response
  const textBlock = message.content.find(block => block.type === 'text')
  const responseText = textBlock?.type === 'text' ? textBlock.text : ''

  let result: EmailSequence

  try {
    // Strip markdown code blocks if present
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    const parsed = JSON.parse(jsonText)

    result = {
      lead_id: lead.id,
      relationship_type: research.relationship.type,
      thread_1: parsed.thread_1,
      thread_2: parsed.thread_2,
      pain_1: parsed.pain_1,
      pain_2: parsed.pain_2,
      metadata: {
        persona_type: research.persona_match.type,
        top_trigger: research.triggers[0]?.fact || '',
        generated_at: new Date().toISOString(),
      },
    }
  } catch (error) {
    console.error('[Agent 3] Failed to parse sequence response:', responseText.substring(0, 500))
    throw new Error('Failed to parse email sequence from Claude response')
  }

  console.log(`[Agent 3] Sequence generated - ${result.thread_1.emails.length + result.thread_2.emails.length} emails`)

  // Save to email_sequences table
  const { data: savedSequence, error: sequenceError } = await supabase
    .from('email_sequences')
    .insert({
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      relationship_type: result.relationship_type,
      persona_type: result.metadata.persona_type,
      top_trigger: result.metadata.top_trigger,
      pain_1: result.pain_1,
      pain_2: result.pain_2,
      thread_1: result.thread_1,
      thread_2: result.thread_2,
      status: 'pending',
    })
    .select('id')
    .single()

  if (sequenceError) {
    console.error('[Agent 3] Error saving sequence:', sequenceError)
    throw new Error(`Failed to save sequence: ${sequenceError.message}`)
  }

  console.log(`[Agent 3] Sequence saved with id: ${savedSequence.id}`)

  // Save to lead_memories for history
  const { error: memoryError } = await supabase.from('lead_memories').insert({
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    source: 'agent3_writer',
    memory_type: 'sequence_generated',
    content: {
      sequence_id: savedSequence.id,
      relationship_type: result.relationship_type,
      persona_type: result.metadata.persona_type,
      pain_1_summary: result.pain_1.pain,
      pain_2_summary: result.pain_2.pain,
      thread_1_subject: result.thread_1.subject,
      thread_2_subject: result.thread_2.subject,
      email_count: result.thread_1.emails.length + result.thread_2.emails.length,
    },
    summary: `Generated ${result.thread_1.emails.length + result.thread_2.emails.length}-email ${result.relationship_type} sequence: "${result.thread_1.subject}" + "${result.thread_2.subject}"`,
  })

  if (memoryError) {
    console.error('[Agent 3] Error saving memory:', memoryError)
    // Don't throw - memory is supplementary
  }

  return result
}

/**
 * Build the comprehensive writer prompt
 */
function buildWriterPrompt(
  lead: Lead,
  research: ResearchResult,
  valueProps: string,
  caseStudies: string,
  personaContent: string
): string {
  // Format triggers for the prompt
  const triggersStr = research.triggers
    .slice(0, 5)
    .map((t, i) => `${i + 1}. [${t.type}] ${t.fact}${t.content_excerpt ? `\n   Quote: "${t.content_excerpt}"` : ''}`)
    .join('\n')

  // Format messaging angles
  const anglesStr = research.messaging_angles
    .map((a, i) => `${i + 1}. ${a.angle}\n   Why: ${a.why_opening}`)
    .join('\n')

  // Determine framing based on relationship type
  const relationshipFraming = getRelationshipFraming(research.relationship.type)

  return `You are writing cold outbound emails from a CEO/Founder to another business leader.

Your job is to create a 7-step cold outbound email sequence using the T.I.P.S. framework.

VOICE: These emails are from Jason, CEO of JSB Media — NOT an SDR. Write with the confidence and directness of a founder who has built something valuable and wants to help a peer.

================================================================================
CRITICAL: THE TRIGGER IS THE THROUGHLINE
================================================================================

The #1 trigger from the research should carry through the ENTIRE sequence — not just email 1.

If they wrote an article, posted thought leadership, or have a strong signal:
- Actually engage with the CONTENT of what they said
- Reference specific points they made (not just "I saw your article")
- Build the conversation around their ideas, their expertise, their world
- Every email should feel like a continuation of that initial insight

This is NOT about personalization tokens. It's about demonstrating you actually read and understood their work, and you're reaching out because you have something genuinely relevant to add to their world.

Be HUMAN and NIMBLE. If the trigger is strong enough, let it guide the sequence more than the template. The framework is a guide, not a prison.

=== RELATIONSHIP TYPE: ${research.relationship.type.toUpperCase()} ===
${relationshipFraming}

=== TARGET LEAD ===
Name: ${lead.first_name} ${lead.last_name}
Title: ${lead.job_title || 'Unknown'}
Company: ${lead.company_name}
Industry: ${lead.company_industry || 'Unknown'}

=== PERSONA MATCH ===
Type: ${research.persona_match.type}
Decision Level: ${research.persona_match.decision_level}
Reasoning: ${research.persona_match.reasoning}

=== RESEARCH TRIGGERS (use these!) ===
${triggersStr}

=== MESSAGING ANGLES (suggested approaches) ===
${anglesStr}

=== RELATIONSHIP CONTEXT ===
Who they serve: ${research.relationship.who_they_serve}
Opening question: ${research.relationship.opening_question}
Reasoning: ${research.relationship.reasoning}

=== JSB MEDIA VALUE PROPOSITIONS ===
${valueProps}

=== CASE STUDIES / SOCIAL PROOF ===
${caseStudies}

=== PERSONA CONTEXT ===
${personaContent}

${lead.source === 'intent_data' ? `================================================================================
INTENT DATA LEAD - SPECIAL INSTRUCTIONS
================================================================================

This lead came from INTENT DATA monitoring, NOT from visiting the JSB Media website.
DO NOT reference or imply they visited your website, saw your content, or engaged with JSB directly.

TARGET ICP FOR THIS LEAD:
- Mid-market companies ($10M-$500M revenue)
- Industries: QSR, e-commerce, travel, tourism, hospitality, franchises, home services
- Scaling across multiple locations or channels
- Can't compete on marketing sophistication against larger players

INTENT SIGNAL BEING MEASURED:
Companies activating multiple marketing channels (Meta, TikTok, Reddit, Search, programmatic, organic)
but struggling to:
- Execute cohesively across channels
- Prove ROI clearly
- Scale profitably
- Get unified insight into what actually works

PAIN POINT FOCUS FOR INTENT LEADS:
The core problems are:
1. Fragmented data across channels - no single source of truth
2. Poor attribution - can't tell what's actually driving results
3. Channel silos - agencies/teams not working together
4. Can't scale what's working - execution bottleneck
5. Burning budget without clarity on return

ADJUST YOUR APPROACH:
- Instead of "Noticed you visited our site..." → use their LinkedIn content, company news, or industry context
- Instead of site visitor as trigger → use industry challenges, company growth signals, or role-based triggers
- Frame JSB as the solution for unified, cross-channel execution with clear attribution
- Emphasize identity resolution, cohesive strategy, and ROI clarity

NEVER mention: website visit, site traffic, engagement with JSB content, "saw you checking us out"
` : ''}================================================================================
T.I.P.S. FRAMEWORK
================================================================================

**Trigger** - Use a relevant trigger from the research above. First line explains why you're reaching out.
Vary wording: "Noticed...", "Saw...", "Looking at your posts about..."

**Implication** - Imply what's likely a priority based on the trigger.
Vary wording: "Imagine you're...", "Guessing that means...", "That usually signals..."

**Pain** - Identify pain points. Use Before-After-Bridge (BAB) formula with QUANTIFIED costs.
BAB Format:
- BEFORE: What's happening now (the struggle)
- AFTER: What success looks like (the dream state)
- BRIDGE: How to get there (JSB as the path)
Example: "Most [titles] spend 15+ hours/week on content that doesn't convert. Imagine cutting that to 3 hours while 2x-ing inbound. That's what happens when you have a team that actually gets your market."
Vary wording: "Most...", "A lot of [titles] deal with...", "The [industry] leaders I talk to..."

**Social Proof** - ONLY use specific company names/case studies if DIRECTLY relevant to their industry.
- If we have a case study in their exact space (legal, professional services, etc.) → use it
- If NOT, use general language: "teams we work with", "what we hear from [similar titles]", "a pattern we see"
- NEVER mention an irrelevant industry (don't tell a lawyer about an HVAC company)
- General is better than irrelevant. Credibility comes from relevance, not name-dropping.

**Solution** - Brief outcome + mechanism. Confident but not salesy.

**Soft CTA** - Get a reply, not a meeting.
Examples: "Worth a chat?", "Open to hearing more?", "Make sense to connect?"

================================================================================
SEQUENCE STRUCTURE
================================================================================

| Email | Day | Structure |
|-------|-----|-----------|
| Email 1 | Day 1 | T.I.P.S. full (Pain 1) + Subject Line |
| Email 2 | Day 3 | Relevant article + value bump |
| Email 3 | Day 5 | Thoughtful bump |
| Email 4 | Day 12 | T.I.P.S. full (Pain 2) + NEW Subject Line |
| Email 5 | Day 15 | Case study with real link |
| Email 6 | Day 18 | Focus bump |
| Email 7 | Day 21 | Referral bump |

Thread 1: Emails 1, 2, 3 (same subject line)
Thread 2: Emails 4, 5, 6, 7 (new subject line)

================================================================================
EMAIL STRUCTURES
================================================================================

**Email 1 (T.I.P.S. Full - Pain 1):**
Hey [name]
[Trigger - use research]
[Implication based on trigger]
[Pain with BAB and quantified cost]
[Social proof with outcome]
[Solution brief]
[Soft CTA]

**Email 2 (Relevant Article):**
Hey [name], saw this and thought of you:
[REAL URL to a relevant industry article - search for actual articles about their industry/challenge]
[Brief 1-liner on why it's relevant to their situation]
[Key insight or question it raised]
Figured it'd be useful.
P.S. Any thoughts on my last note?

**Email 3 (Thoughtful Bump):**
Hey [name]
[Reference something SPECIFIC from their content - a point they made, a question they raised]
Wanted to see if this resonated.
[Optional: add a small insight related to their trigger]

**Email 4 (T.I.P.S. Full - Pain 2):**
[Same structure as Email 1 but different pain point]

**Email 5 (Proof/Insight Bump):**
Hey [name]
Given [reference back to the trigger/their content], thought you'd find this relevant.
[IF we have a directly relevant case study in their industry: share it with link]
[IF NOT: share a general insight or pattern we see with similar companies/roles]
Example without case study: "A lot of the [similar titles] we talk to are dealing with the same thing. The ones getting ahead are [insight]."
Keep it tied to THEIR world, not ours.

**Email 6 (Focus Bump):**
Hey [name]
[Circle back to their original content/trigger with a new angle or question]
[Connect it to a priority they likely have]
Is that something you're actively working on? Happy to share what's working for others in [their specific space].

**Email 7 (Referral Bump):**
Hey [name]
[Acknowledge the trigger one more time - show you remember what they're focused on]
If this isn't the right time, totally understand.
Would it make sense to connect me with whoever handles [specific area from their trigger]?
Either way — enjoyed reading your thoughts on [topic from trigger].

================================================================================
NON-NEGOTIABLE RULES
================================================================================
- 7 total emails
- Each email <125 words
- 3rd-5th grade reading level
- Direct and confident tone (CEO to CEO) — no hedge words like "just", "maybe", "I think"
- Short lines with white space
- NO emojis, NO bolding, NO italics
- Subject lines: 2-3 words, no punctuation, no adjectives
- Soft CTAs only (never ask for time/meeting directly)
- Speak like a founder helping another founder, not a marketer or SDR

================================================================================
PAIN SELECTION
================================================================================
Based on the research triggers and relationship type, select TWO pain points:

Pain 1 (Emails 1-3): Should tie to the TOP trigger from research
Pain 2 (Emails 4-7): Should tie to a SECONDARY angle or trigger

For each pain, define:
- pain: The specific problem (tied to their trigger/content)
- implication: Quantified cost of inaction (use BAB formula)
- solution: How JSB helps (brief)
- social_proof: ONLY if we have a relevant case study for their industry. Otherwise use general: "teams we work with in [their space]", "what we hear from [similar titles]", etc.

================================================================================
OUTPUT FORMAT — Return ONLY valid JSON:
================================================================================

{
  "pain_1": {
    "pain": "The specific pain point",
    "implication": "Quantified cost/impact",
    "solution": "How JSB helps",
    "social_proof": "Company + outcome"
  },
  "pain_2": {
    "pain": "Second pain point",
    "implication": "Quantified cost/impact",
    "solution": "How JSB helps",
    "social_proof": "Company + outcome"
  },
  "thread_1": {
    "subject": "Two Words",
    "emails": [
      {
        "email_number": 1,
        "day": 1,
        "structure": "tips_full",
        "body": "The full email text...",
        "word_count": 95
      },
      {
        "email_number": 2,
        "day": 3,
        "structure": "resource_bump",
        "body": "The full email text...",
        "word_count": 85
      },
      {
        "email_number": 3,
        "day": 5,
        "structure": "thoughtful_bump",
        "body": "The full email text...",
        "word_count": 40
      }
    ]
  },
  "thread_2": {
    "subject": "Two Words",
    "emails": [
      {
        "email_number": 4,
        "day": 12,
        "structure": "tips_full",
        "body": "The full email text...",
        "word_count": 98
      },
      {
        "email_number": 5,
        "day": 15,
        "structure": "case_study_bump",
        "body": "The full email text...",
        "word_count": 60
      },
      {
        "email_number": 6,
        "day": 18,
        "structure": "focus_bump",
        "body": "The full email text...",
        "word_count": 45
      },
      {
        "email_number": 7,
        "day": 21,
        "structure": "referral_bump",
        "body": "The full email text...",
        "word_count": 35
      }
    ]
  }
}

FINAL REMINDER:
- Use the ACTUAL triggers from the research
- Personalize with their name, company, and specific observations
- Keep it conversational and peer-to-peer
- Return ONLY valid JSON, no other text`
}

/**
 * Get relationship-specific framing guidance
 */
function getRelationshipFraming(type: RelationshipType): string {
  switch (type) {
    case 'direct_client':
      return `This is a DIRECT CLIENT opportunity.
Frame the emails around THEIR pain points and how JSB can help THEM directly.
Standard T.I.P.S. approach - you're selling to them.`

    case 'referral_partner':
      return `This is a REFERRAL PARTNER opportunity.
They advise/serve clients who need marketing services.
Frame emails around:
- How THEIR CLIENTS struggle with marketing
- How recommending the right agency helps THEIR reputation
- Mutual value: they send clients, we deliver results
- Opening question style: "When clients ask about agencies, who do you recommend?"
DON'T sell them services directly. Explore partnership.`

    case 'white_label':
      return `This is a WHITE LABEL opportunity.
They're an agency/firm that could offer JSB services under their brand.
Frame emails around:
- Expanding their service offering without hiring
- Keeping clients happy with full-service capabilities
- Revenue share / partnership model
- "Do your clients ever ask for [service] beyond what you offer?"
Position as a behind-the-scenes partner.`

    case 'strategic_partner':
      return `This is a STRATEGIC PARTNER opportunity.
Frame emails around:
- Co-marketing or joint content opportunities
- Complementary audiences
- Thought leadership collaboration
- "Would you be open to collaborating on..."
This is about building a relationship, not selling.`

    default:
      return `Relationship type unclear - default to exploratory approach.
Use the opening question from research to start a conversation.
Don't hard-sell. Explore fit first.`
  }
}
