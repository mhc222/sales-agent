/**
 * Agent 3: Email Sequence Writer
 * Takes research output and generates a 7-email TIPS sequence
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase, type Lead } from '../lib/supabase'
import type { ResearchResult, RelationshipType } from './agent2-research'
import { loadPrompt } from '../lib/prompt-loader'
import type { ContextProfile } from './context-profile-builder'
import { getLearnedGuidelines } from '../lib/pattern-promoter'
import { loadDynamicPrompt, recordPromptUsage, type PromptContext } from '../lib/prompt-manager'
import { loadCorrections, type CorrectionsContext } from '../lib/corrections-loader'
import { getGlobalGuidelines } from '../lib/correction-analyzer'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Fetch fundamentals RAG documents (global, tenant_id IS NULL)
 */
async function fetchFundamentals(ragTypes: string[]): Promise<string> {
  const { data: docs, error } = await supabase
    .from('rag_documents')
    .select('content, rag_type, metadata')
    .is('tenant_id', null)
    .in('rag_type', ragTypes)

  if (error) {
    console.error('[Agent 3] Error fetching fundamentals:', error)
    return ''
  }

  return docs?.map((d) => d.content).join('\n\n') || ''
}

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
  sequence_strategy?: SequenceStrategy
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

export interface SequenceStrategy {
  primaryAngle: string
  personalizationUsed: string[]
  toneUsed: 'formal' | 'conversational' | 'casual'
  triggerLeveraged: string | null
}

// New format from 95/5 rule prompt
interface NewFormatEmail {
  emailNumber: number
  day: number
  subject: string
  body: string
  wordCount: number
  internalNotes: string
}

interface NewFormatResponse {
  sequence: NewFormatEmail[]
  sequenceStrategy: SequenceStrategy
  pain_1: PainPoint
  pain_2: PainPoint
}

interface WriterInput {
  lead: Lead
  research: ResearchResult
}

interface ProfileWriterInput {
  lead: Lead
  contextProfile: ContextProfile
  research: ResearchResult
}

interface RevisionWriterInput {
  lead: Lead
  contextProfile: ContextProfile
  research: ResearchResult
  revisionInstructions?: string
  previousSequence?: Record<string, unknown>
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
 * Enhanced writer function using context profile for better personalization
 * Implements the 95/5 rule: 95% human touch, 5% soft positioning
 */
export async function writeSequenceWithProfile(input: ProfileWriterInput): Promise<EmailSequence> {
  const { lead, contextProfile, research } = input

  console.log(`[Agent 3] Writing 95/5 sequence with context profile for: ${lead.email}`)
  console.log(`[Agent 3] Relationship type: ${research.relationship.type}`)
  console.log(`[Agent 3] Profile quality score: ${contextProfile.metadata.dataQualityScore}`)

  // Load human corrections for this company (if any)
  const corrections = await loadCorrections(
    lead.tenant_id,
    lead.company_domain || '',
    lead.company_name
  )
  if (corrections.hasCorrections) {
    console.log(`[Agent 3] Loaded ${corrections.corrections.length} corrections for ${lead.company_name}`)
  }

  // Load global guidelines learned from corrections (applies to ALL leads)
  const globalGuidelines = await getGlobalGuidelines(lead.tenant_id)
  if (globalGuidelines) {
    console.log(`[Agent 3] Loaded global guidelines from correction patterns`)
  }

  // Fetch RAG documents - messaging guidelines and anti-patterns
  const { data: ragDocs, error: ragError } = await supabase
    .from('rag_documents')
    .select('content, rag_type, metadata')
    .eq('tenant_id', lead.tenant_id)
    .in('rag_type', ['messaging', 'shared'])

  if (ragError) {
    console.error('[Agent 3] Error fetching RAG documents:', ragError)
  }

  // Extract messaging guidelines from RAG
  const messagingRag = ragDocs
    ?.filter((d) => d.rag_type === 'messaging')
    .map((d) => d.content)
    .join('\n\n') || ''

  // Extract anti-patterns (look for anti-patterns category or default list)
  const antiPatterns = ragDocs
    ?.filter((d) => d.metadata?.category === 'anti_patterns')
    .map((d) => d.content)
    .join('\n\n') || getDefaultAntiPatterns()

  // Build the 95/5 writer prompt with dynamic loading (includes learned patterns via placeholder)
  const { content: prompt, versionId: promptVersionId, abTestId } = await build955WriterPromptDynamic(
    lead.tenant_id,
    contextProfile,
    messagingRag,
    antiPatterns,
    corrections,
    globalGuidelines
  )
  console.log(`[Agent 3] Using prompt version: ${promptVersionId}${abTestId ? ` (A/B test: ${abTestId})` : ''}`)

  // Call Claude with extended thinking for better reasoning
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    thinking: {
      type: 'enabled',
      budget_tokens: 10000, // Increased for quality self-checking
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

  let parsed: NewFormatResponse
  let result: EmailSequence

  try {
    // Strip markdown code blocks if present
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    parsed = JSON.parse(jsonText) as NewFormatResponse

    // Transform new format to EmailSequence format for backward compatibility
    result = transformToEmailSequence(lead.id, research, contextProfile, parsed)
  } catch (error) {
    console.error('[Agent 3] Failed to parse 95/5 sequence response:', responseText.substring(0, 500))
    throw new Error('Failed to parse email sequence from Claude response')
  }

  console.log(`[Agent 3] 95/5 Sequence generated - ${result.thread_1.emails.length + result.thread_2.emails.length} emails`)
  console.log(`[Agent 3] Strategy: ${parsed.sequenceStrategy.primaryAngle}`)
  console.log(`[Agent 3] Tone: ${parsed.sequenceStrategy.toneUsed}`)

  // Save to email_sequences table with sequence_strategy and prompt version tracking
  // Only include prompt_version_id if it's a valid UUID (not static fallback)
  const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(promptVersionId)

  const insertData: Record<string, unknown> = {
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    relationship_type: result.relationship_type,
    persona_type: result.metadata.persona_type,
    top_trigger: result.metadata.top_trigger,
    pain_1: result.pain_1,
    pain_2: result.pain_2,
    thread_1: result.thread_1,
    thread_2: result.thread_2,
    sequence_strategy: result.sequence_strategy,
    status: 'pending',
  }

  // Only add prompt_version_id if it's a valid UUID reference
  if (isValidUuid) {
    insertData.prompt_version_id = promptVersionId
  }

  const { data: savedSequence, error: sequenceError } = await supabase
    .from('email_sequences')
    .insert(insertData)
    .select('id')
    .single()

  if (sequenceError) {
    console.error('[Agent 3] Error saving sequence:', sequenceError)
    throw new Error(`Failed to save sequence: ${sequenceError.message}`)
  }

  console.log(`[Agent 3] Sequence saved with id: ${savedSequence.id}`)

  // Record prompt usage for tracking and A/B test attribution
  // Note: We'll link this to outreach_event when emails are deployed
  // Only record if using dynamic prompts with valid UUID version
  if (isValidUuid) {
    try {
      // Create a temporary outreach event ID for prompt tracking
      // This will be updated when the sequence is deployed to Smartlead
      const tempOutreachId = `sequence-${savedSequence.id}`
      await recordPromptUsage(tempOutreachId, promptVersionId, abTestId)
      console.log(`[Agent 3] Recorded prompt usage for version ${promptVersionId}`)
    } catch (usageErr) {
      console.error('[Agent 3] Error recording prompt usage:', usageErr)
      // Don't throw - usage tracking is supplementary
    }
  }

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
      context_profile_quality: contextProfile.metadata.dataQualityScore,
      sequence_strategy: result.sequence_strategy,
    },
    summary: `Generated ${result.thread_1.emails.length + result.thread_2.emails.length}-email 95/5 sequence: "${result.thread_1.subject}" + "${result.thread_2.subject}"`,
  })

  if (memoryError) {
    console.error('[Agent 3] Error saving memory:', memoryError)
    // Don't throw - memory is supplementary
  }

  return result
}

/**
 * Writer function with revision instructions for failed reviews
 * Called when Agent 4 requests specific changes to a sequence
 */
export async function writeSequenceWithRevisions(input: RevisionWriterInput): Promise<EmailSequence> {
  const { lead, contextProfile, research, revisionInstructions, previousSequence } = input

  console.log(`[Agent 3] Writing REVISED sequence for: ${lead.email}`)
  console.log(`[Agent 3] Revision instructions provided: ${revisionInstructions ? 'Yes' : 'No'}`)

  // Load human corrections for this company (if any)
  const corrections = await loadCorrections(
    lead.tenant_id,
    lead.company_domain || '',
    lead.company_name
  )
  if (corrections.hasCorrections) {
    console.log(`[Agent 3] Loaded ${corrections.corrections.length} corrections for ${lead.company_name}`)
  }

  // Fetch RAG documents - messaging guidelines and anti-patterns
  const { data: ragDocs, error: ragError } = await supabase
    .from('rag_documents')
    .select('content, rag_type, metadata')
    .eq('tenant_id', lead.tenant_id)
    .in('rag_type', ['messaging', 'shared'])

  if (ragError) {
    console.error('[Agent 3] Error fetching RAG documents:', ragError)
  }

  // Extract messaging guidelines from RAG
  const messagingRag = ragDocs
    ?.filter((d) => d.rag_type === 'messaging')
    .map((d) => d.content)
    .join('\n\n') || ''

  // Extract anti-patterns
  const antiPatterns = ragDocs
    ?.filter((d) => d.metadata?.category === 'anti_patterns')
    .map((d) => d.content)
    .join('\n\n') || getDefaultAntiPatterns()

  // Fetch learned patterns from the learning system
  const learnedPatterns = await getLearnedGuidelines(lead.tenant_id)

  // Append corrections to anti-patterns if we have them
  const fullAntiPatterns = corrections.hasCorrections
    ? `${antiPatterns}\n\n${corrections.formattedForPrompt}`
    : antiPatterns

  // Build the prompt with revision instructions and learned patterns
  const prompt = build955WriterPromptWithRevisions(
    contextProfile,
    messagingRag,
    fullAntiPatterns,
    revisionInstructions,
    previousSequence,
    learnedPatterns
  )

  // Call Claude with extended thinking
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    thinking: {
      type: 'enabled',
      budget_tokens: 12000, // Extra thinking budget for revisions
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
  let result: EmailSequence

  try {
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    parsed = JSON.parse(jsonText) as NewFormatResponse

    result = transformToEmailSequence(lead.id, research, contextProfile, parsed)
  } catch (error) {
    console.error('[Agent 3] Failed to parse revised sequence response:', responseText.substring(0, 500))
    throw new Error('Failed to parse revised email sequence from Claude response')
  }

  console.log(`[Agent 3] Revised sequence generated - ${result.thread_1.emails.length + result.thread_2.emails.length} emails`)
  console.log(`[Agent 3] Strategy: ${parsed.sequenceStrategy.primaryAngle}`)

  // Note: We don't save to database here - the revision workflow handles the update

  return result
}

/**
 * Build the 95/5 writer prompt with revision instructions appended
 */
function build955WriterPromptWithRevisions(
  profile: ContextProfile,
  messagingRag: string,
  antiPatterns: string,
  revisionInstructions?: string,
  previousSequence?: Record<string, unknown>,
  learnedPatterns?: string
): string {
  // Start with the base prompt including learned patterns
  let basePrompt = build955WriterPrompt(profile, messagingRag, antiPatterns, learnedPatterns)

  // Append revision instructions if provided
  if (revisionInstructions) {
    const revisionSection = `

================================================================================
REVISION REQUIRED
================================================================================

A previous version of this sequence was reviewed and needs changes. Here are the specific revision instructions from the reviewer:

${revisionInstructions}

${previousSequence ? `
Previous sequence that failed review:
${JSON.stringify(previousSequence, null, 2).substring(0, 2000)}...
` : ''}

IMPORTANT:
- Address ALL the issues mentioned above
- Do not repeat the same mistakes
- Pay special attention to any banned phrases that were flagged
- Ensure personalization is specific and verifiable
- Double-check word counts for each email
`
    basePrompt += revisionSection
  }

  return basePrompt
}

/**
 * Build the 95/5 writer prompt with new template variables and learned patterns
 * Uses dynamic prompt loading with version tracking when available
 */
async function build955WriterPromptDynamic(
  tenantId: string,
  profile: ContextProfile,
  messagingRag: string,
  antiPatterns: string,
  corrections?: CorrectionsContext,
  globalGuidelines?: string
): Promise<{ content: string; versionId: string; abTestId: string | null }> {
  // Build context for dynamic section injection
  const context: PromptContext = {
    industry: profile.companyIntelligence.industry,
    seniority: profile.leadSummary.seniorityLevel,
    channel: 'email',
  }

  // Fetch fundamentals for email best practices and frameworks
  const [emailBestPractices, tipsFramework] = await Promise.all([
    fetchFundamentals(['fundamental_email']),
    fetchFundamentals(['fundamental_framework']),
  ])
  console.log(`[Agent 3] Loaded fundamentals: email=${emailBestPractices.length > 0}, framework=${tipsFramework.length > 0}`)

  // Build full anti-patterns with corrections and global guidelines
  let fullAntiPatterns = antiPatterns

  // Add global guidelines first (applies to ALL leads)
  if (globalGuidelines) {
    fullAntiPatterns = `${fullAntiPatterns}\n\n${globalGuidelines}`
  }

  // Add company-specific corrections (applies only to this company)
  if (corrections?.hasCorrections) {
    fullAntiPatterns = `${fullAntiPatterns}\n\n${corrections.formattedForPrompt}`
  }

  try {
    const dynamicPrompt = await loadDynamicPrompt(
      tenantId,
      'agent3-writer',
      {
        contextProfile: JSON.stringify(profile, null, 2),
        messagingRag: messagingRag || 'No specific messaging guidelines available.',
        antiPatterns: fullAntiPatterns,
        emailBestPractices: emailBestPractices || 'No email best practices fundamentals available.',
        tipsFramework: tipsFramework || 'No TIPS framework fundamentals available.',
      },
      context
    )

    return {
      content: dynamicPrompt.content,
      versionId: dynamicPrompt.versionId,
      abTestId: dynamicPrompt.abTestId,
    }
  } catch (err) {
    console.log('[Agent 3] Dynamic prompt loading failed, falling back to static:', err)
    // Fallback to static prompt loading (with fundamentals)
    const staticPrompt = build955WriterPromptStatic(profile, messagingRag, fullAntiPatterns, undefined, emailBestPractices, tipsFramework)
    return {
      content: staticPrompt,
      versionId: `static-agent3-writer-${Date.now()}`,
      abTestId: null,
    }
  }
}

/**
 * Static fallback for prompt building (used when dynamic loading fails)
 */
function build955WriterPromptStatic(
  profile: ContextProfile,
  messagingRag: string,
  antiPatterns: string,
  learnedPatterns?: string,
  emailBestPractices?: string,
  tipsFramework?: string
): string {
  const basePrompt = loadPrompt('agent3-writer', {
    contextProfile: JSON.stringify(profile, null, 2),
    messagingRag: messagingRag || 'No specific messaging guidelines available.',
    antiPatterns: antiPatterns,
    emailBestPractices: emailBestPractices || 'No email best practices fundamentals available.',
    tipsFramework: tipsFramework || 'No TIPS framework fundamentals available.',
  })

  // Append learned patterns section if available
  if (learnedPatterns && !learnedPatterns.includes('No learned patterns')) {
    const learnedSection = `

================================================================================
LEARNED PATTERNS (Data-Driven Insights)
================================================================================

The following guidelines have been validated by our learning system based on actual
performance data. These patterns are data-driven and should take precedence over
generic best practices when they apply to this prospect's profile:

${learnedPatterns}

Apply these insights when relevant to the current prospect's context.
`
    return basePrompt + learnedSection
  }

  return basePrompt
}

/**
 * Legacy static prompt builder - kept for backward compatibility
 * @deprecated Use build955WriterPromptDynamic instead
 */
function build955WriterPrompt(
  profile: ContextProfile,
  messagingRag: string,
  antiPatterns: string,
  learnedPatterns?: string
): string {
  return build955WriterPromptStatic(profile, messagingRag, antiPatterns, learnedPatterns)
}

/**
 * Transform new format response to EmailSequence for backward compatibility
 */
function transformToEmailSequence(
  leadId: string,
  research: ResearchResult,
  profile: ContextProfile,
  parsed: NewFormatResponse
): EmailSequence {
  // Split emails into two threads (emails 1-3 in thread 1, 4-7 in thread 2)
  const thread1Emails = parsed.sequence.filter(e => e.emailNumber <= 3)
  const thread2Emails = parsed.sequence.filter(e => e.emailNumber >= 4)

  // Get subject from first email of each thread
  const thread1Subject = thread1Emails[0]?.subject || 'Quick question'
  const thread2Subject = thread2Emails[0]?.subject || 'Following up'

  return {
    lead_id: leadId,
    relationship_type: research.relationship.type,
    thread_1: {
      subject: thread1Subject,
      emails: thread1Emails.map(e => ({
        email_number: e.emailNumber,
        day: e.day,
        structure: getEmailStructure(e.emailNumber),
        subject: e.subject,
        body: e.body,
        word_count: e.wordCount,
      })),
    },
    thread_2: {
      subject: thread2Subject,
      emails: thread2Emails.map(e => ({
        email_number: e.emailNumber,
        day: e.day,
        structure: getEmailStructure(e.emailNumber),
        subject: e.subject,
        body: e.body,
        word_count: e.wordCount,
      })),
    },
    pain_1: parsed.pain_1,
    pain_2: parsed.pain_2,
    sequence_strategy: parsed.sequenceStrategy,
    metadata: {
      persona_type: research.persona_match.type,
      top_trigger: parsed.sequenceStrategy.triggerLeveraged || research.triggers[0]?.fact || '',
      generated_at: new Date().toISOString(),
    },
  }
}

/**
 * Get email structure type based on email number (95/5 framework)
 */
function getEmailStructure(emailNumber: number): string {
  const structures: Record<number, string> = {
    1: 'pure_value',
    2: 'trigger_connection',
    3: 'insight_share',
    4: 'pattern_interrupt',
    5: 'case_study_teaser',
    6: 'direct_value_offer',
    7: 'graceful_close',
  }
  return structures[emailNumber] || 'unknown'
}

/**
 * Default anti-patterns list if none found in RAG
 */
function getDefaultAntiPatterns(): string {
  return `PHRASES TO NEVER USE:
- "Hope this email finds you well"
- "I wanted to reach out because..."
- "We help companies like yours..."
- "I'd love to pick your brain"
- "Do you have 15 minutes?"
- "I came across your profile and was impressed"
- "Quick question" (as opening, not subject)
- "Just following up"
- "Per my last email"
- "As per our conversation"
- "I hope I'm not bothering you"
- "Sorry to bother you"
- "I know you're busy, but..."

PATTERNS TO AVOID:
- Starting with "Hi [Name]," on every email
- Bullet points listing services
- More than 2 paragraphs
- Multiple CTAs in one email
- Generic compliments without specific evidence
- Fake familiarity ("I've been following your work")
- Mentioning competitors
- Desperate language or multiple follow-ups referencing silence`
}

/**
 * Build the comprehensive writer prompt (legacy - for backward compatibility)
 * @deprecated Use writeSequenceWithProfile with 95/5 prompt instead
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

  // Build intent data section if applicable
  const intentDataSection = lead.source === 'intent_data'
    ? `================================================================================
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

`
    : ''

  return loadPrompt('agent3-writer-legacy', {
    relationshipType: research.relationship.type.toUpperCase(),
    relationshipFraming,
    firstName: lead.first_name,
    lastName: lead.last_name,
    jobTitle: lead.job_title || 'Unknown',
    companyName: lead.company_name,
    companyIndustry: lead.company_industry || 'Unknown',
    personaType: research.persona_match.type,
    decisionLevel: research.persona_match.decision_level,
    personaReasoning: research.persona_match.reasoning,
    triggersStr,
    anglesStr,
    whoTheyServe: research.relationship.who_they_serve,
    openingQuestion: research.relationship.opening_question,
    relationshipReasoning: research.relationship.reasoning,
    valueProps,
    caseStudies,
    personaContent,
    intentDataSection,
  })
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
