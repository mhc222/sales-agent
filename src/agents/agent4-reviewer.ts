/**
 * Agent 4: Email Sequence Reviewer
 * Quality gate that reviews all email sequences before deployment
 * Catches issues Agent 3 might miss and ensures quality standards
 */

import Anthropic from '@anthropic-ai/sdk'
import { loadPrompt } from '../lib/prompt-loader'
import { supabase } from '../lib/supabase'
import type { ContextProfile } from './context-profile-builder'
import type { EmailSequence } from './agent3-writer'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ============================================================================
// Types
// ============================================================================

export interface EmailReview {
  emailNumber: number
  status: 'pass' | 'needs_revision' | 'fail'
  issues: string[]
  suggestions: string[]
  bannedPhrasesFound: string[]
  personalizationVerified: boolean
  wordCount: number
  wordCountStatus: 'ok' | 'over' | 'under'
}

export interface ReviewResult {
  decision: 'APPROVE' | 'REVISE' | 'REJECT'
  overallScore: number
  summary: string
  emailReviews: EmailReview[]
  sequenceLevelIssues: string[]
  revisionInstructions: string | null
  humanReviewReason: string | null
}

export interface ReviewInput {
  emailSequence: EmailSequence
  contextProfile: ContextProfile
  researchSummary: string
  tenantId: string
}

// ============================================================================
// Main Review Function
// ============================================================================

/**
 * Review an email sequence for quality and compliance
 */
export async function reviewEmailSequence(input: ReviewInput): Promise<ReviewResult> {
  const { emailSequence, contextProfile, researchSummary, tenantId } = input

  console.log(`[Agent 4] Reviewing sequence for lead: ${emailSequence.lead_id}`)

  // Fetch messaging RAG for reviewer context
  const { data: messagingDocs, error: ragError } = await supabase
    .from('rag_documents')
    .select('content')
    .eq('tenant_id', tenantId)
    .eq('rag_type', 'messaging')

  if (ragError) {
    console.error('[Agent 4] Error fetching messaging RAG:', ragError)
  }

  const messagingRag = messagingDocs?.map((d) => d.content).join('\n\n') || ''

  // Build the review prompt
  const prompt = loadPrompt('agent4-reviewer', {
    emailSequence: JSON.stringify(emailSequence, null, 2),
    contextProfile: JSON.stringify(contextProfile, null, 2),
    researchSummary: researchSummary,
    messagingRag: messagingRag || 'No specific messaging guidelines available.',
  })

  // Call Claude for review
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    console.error('[Agent 4] Unexpected response type from reviewer')
    return createErrorResult('Unexpected response type from reviewer')
  }

  // Parse the review result
  try {
    // Strip markdown code blocks if present
    let jsonText = content.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const result = JSON.parse(jsonText) as ReviewResult

    // Validate and set defaults
    const validatedResult = validateReviewResult(result)

    console.log(`[Agent 4] Review complete - Decision: ${validatedResult.decision}, Score: ${validatedResult.overallScore}`)

    return validatedResult
  } catch (e) {
    console.error('[Agent 4] Failed to parse review response:', e)
    console.error('[Agent 4] Response snippet:', content.text.substring(0, 500))

    return createErrorResult(`Parser error: ${e}. Raw response: ${content.text.substring(0, 500)}`)
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an error result when review fails
 */
function createErrorResult(reason: string): ReviewResult {
  return {
    decision: 'REJECT',
    overallScore: 0,
    summary: 'Failed to complete review due to system error',
    emailReviews: [],
    sequenceLevelIssues: ['Review process error - could not complete review'],
    revisionInstructions: null,
    humanReviewReason: reason,
  }
}

/**
 * Validate and set defaults for review result
 */
function validateReviewResult(result: ReviewResult): ReviewResult {
  return {
    decision: result.decision || 'REJECT',
    overallScore: typeof result.overallScore === 'number' ? result.overallScore : 0,
    summary: result.summary || 'No summary provided',
    emailReviews: Array.isArray(result.emailReviews)
      ? result.emailReviews.map(validateEmailReview)
      : [],
    sequenceLevelIssues: Array.isArray(result.sequenceLevelIssues)
      ? result.sequenceLevelIssues
      : [],
    revisionInstructions: result.revisionInstructions || null,
    humanReviewReason: result.humanReviewReason || null,
  }
}

/**
 * Validate and set defaults for individual email review
 */
function validateEmailReview(review: EmailReview): EmailReview {
  return {
    emailNumber: review.emailNumber || 0,
    status: review.status || 'fail',
    issues: Array.isArray(review.issues) ? review.issues : [],
    suggestions: Array.isArray(review.suggestions) ? review.suggestions : [],
    bannedPhrasesFound: Array.isArray(review.bannedPhrasesFound) ? review.bannedPhrasesFound : [],
    personalizationVerified: review.personalizationVerified ?? false,
    wordCount: review.wordCount || 0,
    wordCountStatus: review.wordCountStatus || 'ok',
  }
}

/**
 * Store review result in database
 */
export async function storeReviewResult(
  sequenceId: string,
  tenantId: string,
  attemptNumber: number,
  result: ReviewResult
): Promise<void> {
  // Update email_sequences with review result
  const { error: updateError } = await supabase
    .from('email_sequences')
    .update({
      review_status: result.decision.toLowerCase(),
      review_result: result,
      review_attempts: attemptNumber,
      last_reviewed_at: new Date().toISOString(),
    })
    .eq('id', sequenceId)

  if (updateError) {
    console.error('[Agent 4] Error updating sequence review status:', updateError)
  }

  // Store in audit trail
  const { error: auditError } = await supabase.from('email_sequence_reviews').insert({
    sequence_id: sequenceId,
    tenant_id: tenantId,
    attempt_number: attemptNumber,
    decision: result.decision,
    overall_score: result.overallScore,
    summary: result.summary,
    email_reviews: result.emailReviews,
    sequence_level_issues: result.sequenceLevelIssues,
    revision_instructions: result.revisionInstructions,
    human_review_reason: result.humanReviewReason,
  })

  if (auditError) {
    console.error('[Agent 4] Error storing review audit:', auditError)
  }
}

/**
 * Build a research summary from research record for the reviewer
 */
export function buildResearchSummary(research: Record<string, unknown>): string {
  if (!research) return 'No research data available.'

  const parts: string[] = []

  // Extract persona match
  if (research.persona_match) {
    const persona = research.persona_match as Record<string, unknown>
    parts.push(`Persona: ${persona.type} (${persona.decision_level})`)
    if (persona.reasoning) {
      parts.push(`Persona reasoning: ${persona.reasoning}`)
    }
  }

  // Extract relationship
  if (research.relationship) {
    const rel = research.relationship as Record<string, unknown>
    parts.push(`Relationship type: ${rel.type}`)
    if (rel.who_they_serve) {
      parts.push(`Who they serve: ${rel.who_they_serve}`)
    }
  }

  // Extract triggers
  if (Array.isArray(research.triggers) && research.triggers.length > 0) {
    parts.push('\nKey triggers:')
    research.triggers.slice(0, 5).forEach((trigger: Record<string, unknown>, i: number) => {
      parts.push(`${i + 1}. [${trigger.type}] ${trigger.fact}`)
    })
  }

  // Extract messaging angles
  if (Array.isArray(research.messaging_angles) && research.messaging_angles.length > 0) {
    parts.push('\nMessaging angles:')
    research.messaging_angles.forEach((angle: Record<string, unknown>, i: number) => {
      parts.push(`${i + 1}. ${angle.angle}`)
    })
  }

  return parts.join('\n')
}
