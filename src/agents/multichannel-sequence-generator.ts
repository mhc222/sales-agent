/**
 * Multi-Channel Sequence Generator
 * Creates coordinated email + LinkedIn sequences based on campaign mode
 */

import { supabase } from '../lib/supabase'
import type { Lead } from '../lib/supabase'
import type { ContextProfile } from './context-profile-builder'
import type { ResearchResult } from './agent2-research'
import type {
  CampaignMode,
  MultiChannelSequence,
  EmailStep,
  LinkedInStep,
  TimelineEntry,
  SequenceStrategy,
  MultiChannelSequenceInput,
} from '../lib/orchestration/types'
import { getICPForLead, formatICPForPrompt, getTenantLLM } from '../lib/tenant-settings'

// ============================================================================
// TYPES
// ============================================================================

interface CampaignContext {
  id: string
  name: string
  mode: CampaignMode
  custom_instructions?: string
  target_persona?: string
  primary_angle?: string
  email_count: number
  linkedin_count: number
  email_tone?: string
  email_cta?: string
  linkedin_first: boolean
  wait_for_connection: boolean
  connection_timeout_hours: number
}

interface BrandContext {
  id: string
  name: string
  voice_tone: string
  value_proposition?: string
  key_differentiators?: string[]
  target_industries?: string[]
}

interface GeneratorInput {
  lead: Lead
  contextProfile: ContextProfile
  research: ResearchResult
  campaignMode: CampaignMode
  // New: Campaign and Brand context
  campaign?: CampaignContext
  brand?: BrandContext
  preferences?: {
    emailCount?: number
    linkedinCount?: number
    totalDays?: number
    linkedinFirst?: boolean
    waitForConnection?: boolean
    aggressive?: boolean
  }
}

interface GeneratedSequence {
  email_steps: EmailStep[]
  linkedin_steps: LinkedInStep[]
  timeline: TimelineEntry[]
  sequence_strategy: SequenceStrategy
}

// ============================================================================
// RAG LOADING
// ============================================================================

/**
 * Load fundamentals for email and LinkedIn
 * Prioritizes brand-level RAG over tenant-level
 * Also loads brand-specific or tenant-level ICP
 */
async function loadFundamentals(tenantId: string, brandId?: string): Promise<{
  emailPlaybook: string
  linkedinPlaybook: string
  messagingRag: string
  antiPatterns: string
  brandGuidelines: string
  icpContext: string
}> {
  // Load brand-specific or tenant-level ICP
  const icp = await getICPForLead(tenantId, brandId)
  const icpContext = icp ? formatICPForPrompt(icp) : ''
  // Load brand-specific RAG if brand provided
  let brandRag: Array<{ content: string; rag_type: string; metadata: Record<string, unknown> | null }> = []
  if (brandId) {
    const { data } = await supabase
      .from('rag_documents')
      .select('content, rag_type, metadata')
      .eq('brand_id', brandId)

    brandRag = data || []
  }

  // Load tenant-specific RAG (fallback)
  const { data: tenantRag } = await supabase
    .from('rag_documents')
    .select('content, rag_type, metadata')
    .eq('tenant_id', tenantId)
    .is('brand_id', null)
    .in('rag_type', ['messaging', 'shared'])

  // Load global fundamentals
  const { data: globalRag } = await supabase
    .from('rag_documents')
    .select('content, rag_type')
    .is('tenant_id', null)
    .in('rag_type', ['fundamental_email', 'fundamental_framework', 'fundamental_linkedin'])

  // Prefer brand RAG, fall back to tenant RAG
  const ragSource = brandRag.length > 0 ? brandRag : (tenantRag || [])

  const messagingRag = ragSource
    .filter(d => d.rag_type === 'messaging')
    .map(d => d.content)
    .join('\n\n') || ''

  const antiPatterns = ragSource
    .filter(d => d.metadata?.category === 'anti_patterns')
    .map(d => d.content)
    .join('\n\n') || ''

  // Brand-specific guidelines
  const brandGuidelines = brandRag
    .filter(d => d.rag_type === 'brand_guidelines' || d.rag_type === 'voice')
    .map(d => d.content)
    .join('\n\n') || ''

  const emailPlaybook = globalRag
    ?.filter(d => d.rag_type === 'fundamental_email' || d.rag_type === 'fundamental_framework')
    .map(d => d.content)
    .join('\n\n') || ''

  const linkedinPlaybook = globalRag
    ?.filter(d => d.rag_type === 'fundamental_linkedin')
    .map(d => d.content)
    .join('\n\n') || ''

  return { emailPlaybook, linkedinPlaybook, messagingRag, antiPatterns, brandGuidelines, icpContext }
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildMultiChannelPrompt(
  input: GeneratorInput,
  fundamentals: {
    emailPlaybook: string
    linkedinPlaybook: string
    messagingRag: string
    antiPatterns: string
    brandGuidelines: string
    icpContext: string
  }
): string {
  const { lead, contextProfile, research, campaignMode, preferences, campaign, brand } = input

  const modeInstructions = getModeInstructions(campaignMode, preferences, campaign)
  const timeline = getDefaultTimeline(campaignMode, preferences, campaign)

  // Build campaign-specific instructions section
  const campaignInstructions = campaign ? `
================================================================================
CAMPAIGN-SPECIFIC INSTRUCTIONS
================================================================================

Campaign: ${campaign.name}
${campaign.target_persona ? `Target Persona: ${campaign.target_persona}` : ''}
${campaign.primary_angle ? `Primary Angle: ${campaign.primary_angle}` : ''}
${campaign.email_cta ? `Email CTA: ${campaign.email_cta}` : ''}

${campaign.custom_instructions ? `Custom Instructions:\n${campaign.custom_instructions}` : ''}
` : ''

  // Build ICP context section
  const icpSection = fundamentals.icpContext ? `
================================================================================
IDEAL CUSTOMER PROFILE (ICP)
================================================================================

${fundamentals.icpContext}
` : ''

  // Build brand context section
  const brandContext = brand ? `
================================================================================
BRAND CONTEXT
================================================================================

Brand: ${brand.name}
Voice/Tone: ${brand.voice_tone}
${brand.value_proposition ? `Value Proposition: ${brand.value_proposition}` : ''}
${brand.key_differentiators?.length ? `Key Differentiators:\n${brand.key_differentiators.map(d => `- ${d}`).join('\n')}` : ''}
${brand.target_industries?.length ? `Target Industries: ${brand.target_industries.join(', ')}` : ''}

${fundamentals.brandGuidelines ? `Brand Guidelines:\n${fundamentals.brandGuidelines}` : ''}
` : ''

  return `You are an expert multi-channel outreach strategist. Generate a coordinated ${campaignMode.replace('_', '-')} sequence.

================================================================================
CAMPAIGN MODE: ${campaignMode.toUpperCase()}
================================================================================

${modeInstructions}
${campaignInstructions}
${brandContext}
${icpSection}
================================================================================
TIMELINE
================================================================================

${timeline}

================================================================================
LEAD CONTEXT
================================================================================

${JSON.stringify(contextProfile, null, 2)}

================================================================================
MESSAGING GUIDELINES
================================================================================

${fundamentals.messagingRag || 'Follow the 95/5 rule: 95% human touch, 5% soft positioning.'}

================================================================================
EMAIL BEST PRACTICES
================================================================================

${fundamentals.emailPlaybook || 'Use TIPS framework. Keep emails under 100 words. Personalize everything.'}

================================================================================
LINKEDIN BEST PRACTICES
================================================================================

${fundamentals.linkedinPlaybook || 'Keep messages under 60 words. Ask permission. Start conversations, not pitches.'}

================================================================================
ANTI-PATTERNS (NEVER DO)
================================================================================

${fundamentals.antiPatterns || 'Never say "hope this finds you well" or "I wanted to reach out because..."'}

================================================================================
CROSS-CHANNEL COORDINATION RULES
================================================================================

1. **Email mentions LinkedIn**: If we've connected on LinkedIn, reference it naturally
   - "Saw we connected on LinkedIn - wanted to follow up here too"

2. **LinkedIn mentions Email**: If they've opened/clicked emails, reference engagement
   - "Noticed you've been checking out some resources - curious what caught your eye"

3. **Timing coordination**: Multi-touch days increase visibility
   - Day 1: Email + LinkedIn connection request
   - Day 3: Email + LinkedIn message (if connected)
   - etc.

4. **Content should differ**: Don't repeat the same message on both channels
   - Email: More detail, case studies, resources
   - LinkedIn: Shorter, more casual, conversation starters

5. **Conditional copy**: Provide alternative versions based on cross-channel status
   - email_body: Default copy
   - email_body_linkedin_connected: Copy if they accepted LinkedIn connection
   - linkedin_body_email_opened: Copy if they've opened emails

6. **LinkedIn fallbacks**: HeyReach requires fallback messages when using variables
   - connection_note_fallback: Generic note that works without personalization
   - body_fallback: Generic message that works for any prospect
   - Fallbacks should be compelling but use no lead-specific details
   - Example fallback: "Hey - saw you're in [industry], curious how you're approaching [common challenge]?"

================================================================================
OUTPUT FORMAT
================================================================================

Return ONLY valid JSON matching this exact structure:

{
  "email_steps": [
    {
      "step_number": 1,
      "day": 1,
      "type": "initial",
      "subject": "Subject line",
      "body": "Email body (default)",
      "body_linkedin_connected": "Alternative body if LinkedIn connected",
      "word_count": 75,
      "internal_notes": "Why this approach",
      "trigger_linkedin": {
        "action": "connection_request",
        "step_number": 1
      }
    }
  ],
  "linkedin_steps": [
    {
      "step_number": 1,
      "day": 1,
      "type": "connection_request",
      "connection_note": "Personalized connection note (under 300 chars)",
      "connection_note_fallback": "Generic fallback note (no personalization, under 300 chars)",
      "internal_notes": "Why this approach"
    },
    {
      "step_number": 2,
      "day": 3,
      "type": "message",
      "body": "LinkedIn message body",
      "body_fallback": "Generic fallback message (no personalization, works for anyone)",
      "body_email_opened": "Alternative if they opened emails",
      "framework": "Relevant Message",
      "requires_connection": true,
      "internal_notes": "Why this approach"
    }
  ],
  "timeline": [
    { "day": 1, "channel": "email", "step_number": 1, "type": "initial", "description": "TIPS email + trigger LinkedIn" },
    { "day": 1, "channel": "linkedin", "step_number": 1, "type": "connection_request", "description": "Send connection request" }
  ],
  "sequence_strategy": {
    "primary_angle": "Main approach for this sequence",
    "personalization_hooks": ["List of personalizations used"],
    "tone": "conversational",
    "linkedin_first": false,
    "wait_for_connection": true,
    "connection_timeout_hours": 72,
    "cross_channel_triggers": [
      {
        "name": "Connection accepted → personalize email",
        "source_channel": "linkedin",
        "source_event": "connected",
        "target_channel": "email",
        "target_action": "use_connected_copy"
      }
    ]
  }
}

================================================================================
REQUIREMENTS
================================================================================

${campaignMode === 'email_only' ? `
- Generate ${preferences?.emailCount || 7} email steps
- No LinkedIn steps (empty array)
- Follow TIPS framework for email structure
` : ''}

${campaignMode === 'linkedin_only' ? `
- No email steps (empty array)
- Generate ${preferences?.linkedinCount || 4} LinkedIn steps
- Start with connection request
- Subsequent messages require connection
- Use LinkedIn DM frameworks
` : ''}

${campaignMode === 'multi_channel' ? `
- Generate ${preferences?.emailCount || 7} email steps
- Generate ${preferences?.linkedinCount || 4} LinkedIn steps
- Coordinate timing (multi-touch days)
- Include conditional copy for cross-channel awareness
- First action: ${preferences?.linkedinFirst ? 'LinkedIn connection request' : 'Email 1'}
` : ''}

Return ONLY valid JSON, no other text.`
}

function getModeInstructions(
  mode: CampaignMode,
  preferences?: GeneratorInput['preferences'],
  campaign?: CampaignContext
): string {
  // Use campaign settings if available, fall back to preferences, then defaults
  const emailCount = campaign?.email_count || preferences?.emailCount || 7
  const linkedinCount = campaign?.linkedin_count || preferences?.linkedinCount || 4
  const linkedinFirst = campaign?.linkedin_first ?? preferences?.linkedinFirst ?? false

  switch (mode) {
    case 'email_only':
      return `EMAIL ONLY MODE
- Focus entirely on email sequence
- ${emailCount} emails over ${preferences?.totalDays || 21} days
- Follow TIPS framework
- Mix of value emails, bumps, case studies, and referral ask
${campaign?.email_tone ? `- Tone: ${campaign.email_tone}` : ''}`

    case 'linkedin_only':
      return `LINKEDIN ONLY MODE
- Focus entirely on LinkedIn sequence
- ${linkedinCount} messages over ${preferences?.totalDays || 14} days
- Start with connection request
- Use LinkedIn DM frameworks (Relevant Message, Pain+Question, etc.)
- Keep messages SHORT (under 60 words)`

    case 'multi_channel':
      return `MULTI-CHANNEL MODE
- Coordinate email (${emailCount}) and LinkedIn (${linkedinCount})
- Multi-touch days for visibility (same day email + LinkedIn)
- Cross-reference channels ("saw we connected on LinkedIn")
- Provide conditional copy for cross-channel status
- ${linkedinFirst ? 'Start with LinkedIn connection request' : 'Start with Email 1 + LinkedIn connection'}
${campaign?.wait_for_connection ? `- Wait for LinkedIn connection before certain emails (timeout: ${campaign.connection_timeout_hours}h)` : ''}`
  }
}

function getDefaultTimeline(
  mode: CampaignMode,
  preferences?: GeneratorInput['preferences'],
  campaign?: CampaignContext
): string {
  if (mode === 'email_only') {
    return `Day 1: Email 1 (TIPS - Initial)
Day 3: Email 2 (Value Add)
Day 5: Email 3 (Bump)
Day 7: Email 4 (New Thread - TIPS)
Day 12: Email 5 (Case Study)
Day 15: Email 6 (Bump)
Day 21: Email 7 (Referral)`
  }

  if (mode === 'linkedin_only') {
    return `Day 1: Connection Request
Day 3: Message 1 (if connected) - Relevant Message
Day 7: Message 2 - Bump
Day 14: Message 3 - Graceful Close`
  }

  // Multi-channel
  return `Day 1: Email 1 (TIPS) + LinkedIn Connection Request
Day 3: Email 2 (Value Add) + LinkedIn Message 1 (if connected)
Day 5: Email 3 (Bump)
Day 7: LinkedIn Message 2
Day 12: Email 4 (New Thread)
Day 15: Email 5 (Case Study) + LinkedIn Message 3
Day 18: Email 6 (Bump)
Day 21: Email 7 (Referral)`
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export async function generateMultiChannelSequence(
  input: GeneratorInput
): Promise<MultiChannelSequence> {
  const { lead, contextProfile, campaignMode, campaign, brand } = input

  console.log(`[MultiChannel Generator] Generating ${campaignMode} sequence for: ${lead.email}`)
  if (campaign) console.log(`[MultiChannel Generator] Campaign: ${campaign.name}`)
  if (brand) console.log(`[MultiChannel Generator] Brand: ${brand.name}`)

  // Load fundamentals (from brand if available)
  const fundamentals = await loadFundamentals(lead.tenant_id, brand?.id)

  // Build prompt
  const prompt = buildMultiChannelPrompt(input, fundamentals)

  // Get tenant's configured LLM
  const llm = await getTenantLLM(lead.tenant_id)

  // Call LLM with extended thinking for better reasoning (Anthropic-only, ignored by others)
  const response = await llm.chat([
    { role: 'user', content: prompt },
  ], { maxTokens: 12000, thinkingBudget: 8000 })

  // Parse response
  const responseText = response.content

  let generated: GeneratedSequence
  try {
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    generated = JSON.parse(jsonText)
  } catch (error) {
    console.error('[MultiChannel Generator] Failed to parse response:', responseText.substring(0, 500))
    throw new Error('Failed to parse multi-channel sequence from Claude response')
  }

  console.log(`[MultiChannel Generator] Generated: ${generated.email_steps?.length || 0} emails, ${generated.linkedin_steps?.length || 0} LinkedIn steps`)

  // Build the full sequence object
  const sequence: MultiChannelSequence = {
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    campaign_mode: campaignMode,
    email_steps: generated.email_steps || [],
    linkedin_steps: generated.linkedin_steps || [],
    timeline: generated.timeline || [],
    sequence_strategy: generated.sequence_strategy,
    status: 'pending',
    created_at: new Date().toISOString(),
  }

  // Save to database
  const { data: saved, error } = await supabase
    .from('multichannel_sequences')
    .insert({
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      campaign_id: campaign?.id,
      campaign_mode: campaignMode,
      email_steps: sequence.email_steps,
      linkedin_steps: sequence.linkedin_steps,
      sequence_strategy: sequence.sequence_strategy,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[MultiChannel Generator] Error saving sequence:', error)
    throw new Error(`Failed to save sequence: ${error.message}`)
  }

  sequence.id = saved.id
  console.log(`[MultiChannel Generator] Saved sequence: ${saved.id}`)

  // Log to lead_memories
  await supabase.from('lead_memories').insert({
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    source: 'multichannel_generator',
    memory_type: 'sequence_generated',
    content: {
      sequence_id: saved.id,
      campaign_id: campaign?.id,
      campaign_name: campaign?.name,
      brand_id: brand?.id,
      brand_name: brand?.name,
      campaign_mode: campaignMode,
      email_count: sequence.email_steps.length,
      linkedin_count: sequence.linkedin_steps.length,
      strategy: sequence.sequence_strategy.primary_angle,
    },
    summary: `Generated ${campaignMode} sequence for ${campaign?.name || 'default campaign'}: ${sequence.email_steps.length} emails, ${sequence.linkedin_steps.length} LinkedIn messages`,
  })

  return sequence
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Generate email-only sequence
 */
export async function generateEmailOnlySequence(
  lead: Lead,
  contextProfile: ContextProfile,
  research: ResearchResult
): Promise<MultiChannelSequence> {
  return generateMultiChannelSequence({
    lead,
    contextProfile,
    research,
    campaignMode: 'email_only',
  })
}

/**
 * Generate LinkedIn-only sequence
 */
export async function generateLinkedInOnlySequence(
  lead: Lead,
  contextProfile: ContextProfile,
  research: ResearchResult
): Promise<MultiChannelSequence> {
  return generateMultiChannelSequence({
    lead,
    contextProfile,
    research,
    campaignMode: 'linkedin_only',
  })
}

/**
 * Generate full multi-channel sequence
 */
export async function generateFullMultiChannelSequence(
  lead: Lead,
  contextProfile: ContextProfile,
  research: ResearchResult,
  options?: {
    linkedinFirst?: boolean
    waitForConnection?: boolean
    aggressive?: boolean
  }
): Promise<MultiChannelSequence> {
  return generateMultiChannelSequence({
    lead,
    contextProfile,
    research,
    campaignMode: 'multi_channel',
    preferences: {
      linkedinFirst: options?.linkedinFirst ?? false,
      waitForConnection: options?.waitForConnection ?? true,
      aggressive: options?.aggressive ?? false,
    },
  })
}
