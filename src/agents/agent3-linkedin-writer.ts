/**
 * Agent 3b: LinkedIn DM Sequence Writer
 * Takes research output and generates a 4-message LinkedIn DM sequence
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase, type Lead } from '../lib/supabase'
import type { ResearchResult } from './agent2-research'
import { loadPrompt } from '../lib/prompt-loader'
import type { ContextProfile } from './context-profile-builder'
import { getICPForLead, formatICPForPrompt } from '../lib/tenant-settings'
import type { Brand, Campaign } from '../lib/brands'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Brand context for LinkedIn sequence generation
export interface BrandContext {
  brand?: Brand
  campaign?: Campaign
}

// ============================================================================
// TYPES
// ============================================================================

export interface LinkedInMessage {
  message_number: number
  day: number
  framework: string
  body: string
  word_count: number
  internal_notes?: string
}

export interface LinkedInSequence {
  lead_id: string
  messages: LinkedInMessage[]
  sequence_strategy: {
    primary_angle: string
    personalization_used: string[]
    framework_chosen: string
    trigger_leveraged: string | null
  }
  metadata: {
    persona_type: string
    generated_at: string
    channel: 'linkedin'
  }
}

interface LinkedInWriterInput {
  lead: Lead
  contextProfile: ContextProfile
  research: ResearchResult
  brandContext?: BrandContext
}

interface NewFormatResponse {
  sequence: Array<{
    messageNumber: number
    day: number
    framework: string
    body: string
    wordCount: number
    internalNotes: string
  }>
  sequenceStrategy: {
    primaryAngle: string
    personalizationUsed: string[]
    frameworkChosen: string
    triggerLeveraged: string | null
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate LinkedIn DM sequence using context profile for personalization
 * @param input - Lead data, context profile, research, and optional brand context
 */
export async function writeLinkedInSequence(input: LinkedInWriterInput): Promise<LinkedInSequence> {
  const { lead, contextProfile, research, brandContext } = input

  console.log(`[Agent 3-LinkedIn] Writing DM sequence for: ${lead.email}`)
  console.log(`[Agent 3-LinkedIn] LinkedIn URL: ${lead.linkedin_url || 'Not provided'}`)
  console.log(`[Agent 3-LinkedIn] Profile quality score: ${contextProfile.metadata.dataQualityScore}`)
  if (brandContext?.brand) {
    console.log(`[Agent 3-LinkedIn] Brand context: ${brandContext.brand.name}`)
  }

  // Load brand-specific or tenant-level ICP
  const icp = await getICPForLead(lead.tenant_id, brandContext?.brand?.id)
  const icpContext = icp ? formatICPForPrompt(icp) : ''

  // Build brand context string for prompt
  let brandContextString = ''
  if (brandContext?.brand) {
    const parts = [`Brand: ${brandContext.brand.name}`]
    if (brandContext.brand.voice_tone) {
      parts.push(`Brand Voice/Tone: ${brandContext.brand.voice_tone}`)
    }
    if (brandContext.brand.value_proposition) {
      parts.push(`Value Proposition: ${brandContext.brand.value_proposition}`)
    }
    if (brandContext.campaign) {
      parts.push(`Campaign: ${brandContext.campaign.name}`)
    }
    brandContextString = parts.join('\n')
  }

  // Fetch RAG documents - prefer brand-specific if available
  let ragDocs
  if (brandContext?.brand?.id) {
    const { data } = await supabase
      .from('rag_documents')
      .select('content, rag_type, metadata')
      .eq('brand_id', brandContext.brand.id)
      .in('rag_type', ['messaging', 'shared', 'linkedin'])

    if (data && data.length > 0) {
      ragDocs = data
      console.log(`[Agent 3-LinkedIn] Using brand-specific RAG for brand ${brandContext.brand.id}`)
    }
  }

  // Fall back to tenant-level RAG if no brand RAG found
  if (!ragDocs || ragDocs.length === 0) {
    const { data, error: ragError } = await supabase
      .from('rag_documents')
      .select('content, rag_type, metadata')
      .eq('tenant_id', lead.tenant_id)
      .is('brand_id', null)
      .in('rag_type', ['messaging', 'shared'])

    if (ragError) {
      console.error('[Agent 3-LinkedIn] Error fetching RAG documents:', ragError)
    }
    ragDocs = data
  }

  // Extract messaging guidelines from RAG
  let messagingRag = ragDocs
    ?.filter((d) => d.rag_type === 'messaging')
    .map((d) => d.content)
    .join('\n\n') || ''

  // Add brand context and ICP to messaging guidance if available
  if (brandContextString || icpContext) {
    const additionalContext: string[] = []
    if (brandContextString) {
      additionalContext.push(`\n\nBRAND CONTEXT:\n${brandContextString}`)
    }
    if (icpContext) {
      additionalContext.push(`\n\nIDEAL CUSTOMER PROFILE (ICP):\n${icpContext}`)
    }
    messagingRag = messagingRag + additionalContext.join('')
  }

  // Extract anti-patterns
  const antiPatterns = ragDocs
    ?.filter((d) => d.metadata?.category === 'anti_patterns')
    .map((d) => d.content)
    .join('\n\n') || getDefaultLinkedInAntiPatterns()

  // Fetch LinkedIn playbook from fundamentals (global)
  const linkedinPlaybook = await fetchLinkedInPlaybook()

  // Fetch learned patterns
  const learnedPatterns = await fetchLearnedPatterns(lead.tenant_id)

  // Build the prompt
  const prompt = buildLinkedInWriterPrompt(
    contextProfile,
    messagingRag,
    antiPatterns,
    linkedinPlaybook,
    learnedPatterns
  )

  // Call Claude with extended thinking for better reasoning
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    thinking: {
      type: 'enabled',
      budget_tokens: 6000,
    },
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  // Parse response
  const textBlock = message.content.find(block => block.type === 'text')
  const responseText = textBlock?.type === 'text' ? textBlock.text : ''

  let parsed: NewFormatResponse
  let result: LinkedInSequence

  try {
    // Strip markdown code blocks if present
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    parsed = JSON.parse(jsonText) as NewFormatResponse

    result = transformToLinkedInSequence(lead.id, research, parsed)
  } catch (error) {
    console.error('[Agent 3-LinkedIn] Failed to parse response:', responseText.substring(0, 500))
    throw new Error('Failed to parse LinkedIn sequence from Claude response')
  }

  console.log(`[Agent 3-LinkedIn] Sequence generated - ${result.messages.length} messages`)
  console.log(`[Agent 3-LinkedIn] Strategy: ${parsed.sequenceStrategy.primaryAngle}`)
  console.log(`[Agent 3-LinkedIn] Framework: ${parsed.sequenceStrategy.frameworkChosen}`)

  // Save to linkedin_sequences table
  const { data: savedSequence, error: sequenceError } = await supabase
    .from('linkedin_sequences')
    .insert({
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      persona_type: research.persona_match.type,
      messages: result.messages,
      sequence_strategy: result.sequence_strategy,
      status: 'pending',
    })
    .select('id')
    .single()

  if (sequenceError) {
    // Table might not exist yet - log and continue
    console.warn('[Agent 3-LinkedIn] Could not save to linkedin_sequences:', sequenceError.message)
    console.log('[Agent 3-LinkedIn] Sequence generated but not persisted - table may need to be created')
  } else {
    console.log(`[Agent 3-LinkedIn] Sequence saved with id: ${savedSequence.id}`)
  }

  // Save to lead_memories for history
  await supabase.from('lead_memories').insert({
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    source: 'agent3_linkedin_writer',
    memory_type: 'linkedin_sequence_generated',
    content: {
      message_count: result.messages.length,
      strategy: result.sequence_strategy,
      framework_used: parsed.sequenceStrategy.frameworkChosen,
    },
    summary: `Generated ${result.messages.length}-message LinkedIn DM sequence using ${parsed.sequenceStrategy.frameworkChosen} framework`,
  })

  return result
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch LinkedIn playbook from fundamentals (global RAG)
 */
async function fetchLinkedInPlaybook(): Promise<string> {
  const { data: docs, error } = await supabase
    .from('rag_documents')
    .select('content')
    .is('tenant_id', null)
    .eq('rag_type', 'fundamental_linkedin')

  if (error) {
    console.warn('[Agent 3-LinkedIn] Error fetching LinkedIn playbook:', error)
    return getBuiltInLinkedInPlaybook()
  }

  if (!docs || docs.length === 0) {
    console.log('[Agent 3-LinkedIn] No LinkedIn playbook in RAG, using built-in')
    return getBuiltInLinkedInPlaybook()
  }

  return docs.map((d) => d.content).join('\n\n')
}

/**
 * Fetch learned patterns for LinkedIn
 */
async function fetchLearnedPatterns(tenantId: string): Promise<string> {
  const { data: patterns, error } = await supabase
    .from('rag_documents')
    .select('content, metadata')
    .eq('tenant_id', tenantId)
    .eq('rag_type', 'learned')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error || !patterns || patterns.length === 0) {
    return 'No validated patterns yet. The system is gathering performance data.'
  }

  // Filter for LinkedIn-relevant patterns
  const linkedinPatterns = patterns.filter((p) => {
    const metadata = p.metadata as Record<string, unknown> | null
    if (metadata?.deprecated) return false
    if (metadata?.channel && metadata.channel !== 'linkedin') return false
    return true
  })

  if (linkedinPatterns.length === 0) {
    return 'No LinkedIn-specific patterns validated yet.'
  }

  return linkedinPatterns.map((p, i) => `${i + 1}. ${p.content}`).join('\n\n')
}

/**
 * Build the LinkedIn writer prompt
 */
function buildLinkedInWriterPrompt(
  profile: ContextProfile,
  messagingRag: string,
  antiPatterns: string,
  linkedinPlaybook: string,
  learnedPatterns: string
): string {
  return loadPrompt('agent3-linkedin-writer', {
    contextProfile: JSON.stringify(profile, null, 2),
    messagingRag: messagingRag || 'No specific messaging guidelines available.',
    antiPatterns: antiPatterns,
    linkedinPlaybook: linkedinPlaybook,
    learnedPatterns: learnedPatterns,
  })
}

/**
 * Transform parsed response to LinkedInSequence
 */
function transformToLinkedInSequence(
  leadId: string,
  research: ResearchResult,
  parsed: NewFormatResponse
): LinkedInSequence {
  return {
    lead_id: leadId,
    messages: parsed.sequence.map((m) => ({
      message_number: m.messageNumber,
      day: m.day,
      framework: m.framework,
      body: m.body,
      word_count: m.wordCount,
      internal_notes: m.internalNotes,
    })),
    sequence_strategy: {
      primary_angle: parsed.sequenceStrategy.primaryAngle,
      personalization_used: parsed.sequenceStrategy.personalizationUsed,
      framework_chosen: parsed.sequenceStrategy.frameworkChosen,
      trigger_leveraged: parsed.sequenceStrategy.triggerLeveraged,
    },
    metadata: {
      persona_type: research.persona_match.type,
      generated_at: new Date().toISOString(),
      channel: 'linkedin',
    },
  }
}

/**
 * Default anti-patterns for LinkedIn DMs
 */
function getDefaultLinkedInAntiPatterns(): string {
  return `PHRASES TO NEVER USE IN LINKEDIN DMs:
- "Hope this message finds you well"
- "I wanted to reach out because..."
- "We help companies like yours..."
- "I'd love to pick your brain"
- "Do you have 15 minutes?"
- "I came across your profile and was impressed"
- "I noticed we have mutual connections"
- "I've been following your work"

PATTERNS TO AVOID:
- Long messages (over 60 words for initial DM)
- Bullet points listing services
- Multiple CTAs in one message
- Meeting requests in first message
- Generic compliments
- Mentioning competitors
- Feature dumps`
}

/**
 * Built-in LinkedIn playbook (fallback if not in RAG)
 */
function getBuiltInLinkedInPlaybook(): string {
  return `## LinkedIn DM Best Practices

### Core Principle
Messages exist for one reason: **start conversations, not pitch.**
Your only goal is **a reply**.

### Initial Message Frameworks

1. **The Relevant Message**: Trigger + Compliment + Permission
   "Hey {name} – {trigger}. {compliment}. Mind if I ask a few questions?"

2. **Relevant + Curiosity**: Trigger + Curious how + Permission
   "Hey {name} – {trigger}. Curious how you're handling {challenge}. Mind if I ask a few questions?"

3. **Pain + Question**: Pain statement + Simple question
   "{name} – most {role}s I speak with struggle to {pain}. Have you seen this?"

### Follow-Up Frameworks

- **Thoughtful Bump**: "Given you're focused on {priority}, thought this might be useful. Any thoughts?"
- **One-Liners**: "Bad timing?" / "Wrong person?" / "Already solved?"
- **Labeling**: "Seems like my timing's off." (people love correcting assumptions)

### Key Rules
- Keep messages SHORT (30-60 words max for initial)
- Ask permission before diving deep
- Use soft language: curious, usually, might be
- Never pitch in first message
- Reference specific details from their profile/posts`
}
