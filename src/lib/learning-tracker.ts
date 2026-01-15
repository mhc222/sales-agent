/**
 * Learning Tracker
 *
 * Utilities for tracking outreach events and engagement
 * to power the learning system that optimizes email content
 */

import { supabase } from './supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachEventInput {
  tenantId: string
  leadId: string
  sequenceId: string
  threadNumber: 1 | 2
  emailPosition: number
  subjectLine: string
  emailBody: string
  smartleadCampaignId?: string
  smartleadLeadId?: string
  personaType?: string
  relationshipType?: string
  topTriggerType?: string
  sequenceStrategy?: Record<string, unknown>
  scheduledFor?: Date
}

export interface EngagementEventInput {
  tenantId: string
  outreachEventId?: string
  leadId?: string
  eventType:
    | 'open'
    | 'click'
    | 'reply'
    | 'bounce'
    | 'unsubscribe'
    | 'positive_reply'
    | 'negative_reply'
    | 'meeting_booked'
  eventSource: 'smartlead' | 'manual' | 'webhook'
  replyText?: string
  replySentiment?: 'positive' | 'negative' | 'neutral' | 'ooo'
  interestLevel?: 'hot' | 'warm' | 'cold' | 'not_interested'
  rawPayload?: Record<string, unknown>
  occurredAt?: Date
  attributedToEmailPosition?: number
  daysSinceFirstEmail?: number
}

export interface ElementTag {
  category: string
  elementType: string
  confidence?: number
  extractedText?: string
  positionInEmail?: 'opener' | 'body' | 'close'
}

export interface ContentElement {
  id: string
  category: string
  elementType: string
  description: string | null
}

// ============================================================================
// OUTREACH EVENT TRACKING
// ============================================================================

/**
 * Track an outreach event (email sent)
 */
export async function trackOutreachEvent(input: OutreachEventInput): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('outreach_events')
      .insert({
        tenant_id: input.tenantId,
        lead_id: input.leadId,
        sequence_id: input.sequenceId,
        thread_number: input.threadNumber,
        email_position: input.emailPosition,
        subject_line: input.subjectLine,
        email_body: input.emailBody,
        smartlead_campaign_id: input.smartleadCampaignId,
        smartlead_lead_id: input.smartleadLeadId,
        persona_type: input.personaType,
        relationship_type: input.relationshipType,
        top_trigger_type: input.topTriggerType,
        sequence_strategy: input.sequenceStrategy,
        scheduled_for: input.scheduledFor?.toISOString(),
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('[LearningTracker] Error tracking outreach event:', error)
      return null
    }

    return data.id
  } catch (err) {
    console.error('[LearningTracker] Exception tracking outreach event:', err)
    return null
  }
}

/**
 * Track multiple outreach events (batch)
 */
export async function trackOutreachEventsBatch(
  inputs: OutreachEventInput[]
): Promise<string[]> {
  try {
    const records = inputs.map((input) => ({
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      sequence_id: input.sequenceId,
      thread_number: input.threadNumber,
      email_position: input.emailPosition,
      subject_line: input.subjectLine,
      email_body: input.emailBody,
      smartlead_campaign_id: input.smartleadCampaignId,
      smartlead_lead_id: input.smartleadLeadId,
      persona_type: input.personaType,
      relationship_type: input.relationshipType,
      top_trigger_type: input.topTriggerType,
      sequence_strategy: input.sequenceStrategy,
      scheduled_for: input.scheduledFor?.toISOString(),
      sent_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from('outreach_events')
      .insert(records)
      .select('id')

    if (error) {
      console.error('[LearningTracker] Error tracking batch outreach events:', error)
      return []
    }

    return data.map((d) => d.id)
  } catch (err) {
    console.error('[LearningTracker] Exception tracking batch outreach events:', err)
    return []
  }
}

// ============================================================================
// ENGAGEMENT EVENT TRACKING
// ============================================================================

/**
 * Track an engagement event (open, click, reply, etc.)
 */
export async function trackEngagementEvent(input: EngagementEventInput): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('engagement_events')
      .insert({
        tenant_id: input.tenantId,
        outreach_event_id: input.outreachEventId,
        lead_id: input.leadId,
        event_type: input.eventType,
        event_source: input.eventSource,
        reply_text: input.replyText,
        reply_sentiment: input.replySentiment,
        interest_level: input.interestLevel,
        raw_payload: input.rawPayload,
        occurred_at: input.occurredAt?.toISOString() || new Date().toISOString(),
        attributed_to_email_position: input.attributedToEmailPosition,
        days_since_first_email: input.daysSinceFirstEmail,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[LearningTracker] Error tracking engagement event:', error)
      return null
    }

    return data.id
  } catch (err) {
    console.error('[LearningTracker] Exception tracking engagement event:', err)
    return null
  }
}

/**
 * Find outreach event by Smartlead IDs
 */
export async function findOutreachEventBySmartlead(
  campaignId: string,
  smartleadLeadId: string
): Promise<{ id: string; leadId: string; emailPosition: number } | null> {
  try {
    const { data, error } = await supabase
      .from('outreach_events')
      .select('id, lead_id, email_position')
      .eq('smartlead_campaign_id', campaignId)
      .eq('smartlead_lead_id', smartleadLeadId)
      .order('email_position', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    return {
      id: data.id,
      leadId: data.lead_id,
      emailPosition: data.email_position,
    }
  } catch (err) {
    console.error('[LearningTracker] Exception finding outreach event:', err)
    return null
  }
}

/**
 * Calculate days since first email for a lead
 */
export async function getDaysSinceFirstEmail(leadId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('outreach_events')
      .select('sent_at')
      .eq('lead_id', leadId)
      .order('sent_at', { ascending: true })
      .limit(1)
      .single()

    if (error || !data) {
      return 0
    }

    const firstEmailDate = new Date(data.sent_at)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - firstEmailDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return diffDays
  } catch (err) {
    return 0
  }
}

// ============================================================================
// ELEMENT TAGGING
// ============================================================================

/**
 * Get element type ID by category and type
 */
export async function getElementTypeId(
  category: string,
  elementType: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('content_element_types')
      .select('id')
      .eq('category', category)
      .eq('element_type', elementType)
      .single()

    if (error || !data) {
      return null
    }

    return data.id
  } catch (err) {
    return null
  }
}

/**
 * Tag an outreach event with content elements
 */
export async function tagOutreachEvent(
  outreachEventId: string,
  tags: ElementTag[]
): Promise<number> {
  try {
    // Get element type IDs for all tags
    const tagRecords = await Promise.all(
      tags.map(async (tag) => {
        const elementTypeId = await getElementTypeId(tag.category, tag.elementType)
        if (!elementTypeId) {
          console.warn(
            `[LearningTracker] Element type not found: ${tag.category}/${tag.elementType}`
          )
          return null
        }
        return {
          outreach_event_id: outreachEventId,
          element_type_id: elementTypeId,
          confidence: tag.confidence ?? 1.0,
          extracted_text: tag.extractedText,
          position_in_email: tag.positionInEmail,
        }
      })
    )

    // Filter out nulls
    const validRecords = tagRecords.filter((r) => r !== null)

    if (validRecords.length === 0) {
      return 0
    }

    const { data, error } = await supabase
      .from('outreach_element_tags')
      .upsert(validRecords, {
        onConflict: 'outreach_event_id,element_type_id,position_in_email',
      })
      .select('id')

    if (error) {
      console.error('[LearningTracker] Error tagging outreach event:', error)
      return 0
    }

    return data?.length || 0
  } catch (err) {
    console.error('[LearningTracker] Exception tagging outreach event:', err)
    return 0
  }
}

/**
 * Auto-detect and tag content elements in an email
 * Uses heuristics to identify element types
 */
export async function autoTagEmail(
  outreachEventId: string,
  subjectLine: string,
  emailBody: string
): Promise<ElementTag[]> {
  const tags: ElementTag[] = []
  const bodyLower = emailBody.toLowerCase()
  const subjectLower = subjectLine.toLowerCase()

  // Subject line patterns
  if (subjectLower.includes('?')) {
    tags.push({ category: 'subject_line', elementType: 'question', positionInEmail: 'opener' })
  } else if (subjectLower.includes('re:') || subjectLower.includes('your ')) {
    tags.push({
      category: 'subject_line',
      elementType: 'trigger_based',
      positionInEmail: 'opener',
    })
  } else if (subjectLower.includes('+') || subjectLower.includes('&')) {
    tags.push({ category: 'subject_line', elementType: 'direct', positionInEmail: 'opener' })
  }

  // Opener detection
  const firstLine = emailBody.split('\n')[0].toLowerCase()
  if (firstLine.includes('saw you') || firstLine.includes('noticed')) {
    tags.push({
      category: 'opener',
      elementType: 'trigger_reference',
      positionInEmail: 'opener',
      extractedText: emailBody.split('\n')[0],
    })
  } else if (firstLine.includes('congrat')) {
    tags.push({
      category: 'opener',
      elementType: 'congratulation',
      positionInEmail: 'opener',
      extractedText: emailBody.split('\n')[0],
    })
  } else if (firstLine.includes('fellow') || firstLine.includes('mutual')) {
    tags.push({
      category: 'opener',
      elementType: 'mutual_connection',
      positionInEmail: 'opener',
      extractedText: emailBody.split('\n')[0],
    })
  } else if (firstLine.includes('?')) {
    tags.push({
      category: 'opener',
      elementType: 'question',
      positionInEmail: 'opener',
      extractedText: emailBody.split('\n')[0],
    })
  }

  // Pain point detection
  if (bodyLower.includes('time') && (bodyLower.includes('waste') || bodyLower.includes('spent'))) {
    tags.push({ category: 'pain_point', elementType: 'time_waste', positionInEmail: 'body' })
  }
  if (bodyLower.includes('revenue') || bodyLower.includes('money')) {
    tags.push({ category: 'pain_point', elementType: 'revenue_leak', positionInEmail: 'body' })
  }
  if (bodyLower.includes('competitor') || bodyLower.includes('competition')) {
    tags.push({ category: 'pain_point', elementType: 'competitive_gap', positionInEmail: 'body' })
  }
  if (bodyLower.includes('scale') || bodyLower.includes('growth')) {
    tags.push({ category: 'pain_point', elementType: 'scaling_blocker', positionInEmail: 'body' })
  }

  // CTA detection (last few sentences)
  const lastLines = emailBody.split('\n').slice(-3).join(' ').toLowerCase()
  if (lastLines.includes('worth') && lastLines.includes('?')) {
    tags.push({ category: 'cta', elementType: 'soft_question', positionInEmail: 'close' })
  } else if (lastLines.includes('15 min') || lastLines.includes('quick call')) {
    tags.push({ category: 'cta', elementType: 'specific_time', positionInEmail: 'close' })
  } else if (lastLines.includes('happy to') || lastLines.includes('share')) {
    tags.push({ category: 'cta', elementType: 'value_offer', positionInEmail: 'close' })
  } else if (lastLines.includes('mind if')) {
    tags.push({ category: 'cta', elementType: 'permission_based', positionInEmail: 'close' })
  }

  // Tone detection
  if (bodyLower.includes('hey') || bodyLower.includes('fellow')) {
    tags.push({ category: 'tone', elementType: 'casual_peer' })
  } else if (bodyLower.includes('straight to') || bodyLower.includes('directly')) {
    tags.push({ category: 'tone', elementType: 'direct_no_fluff' })
  } else if (bodyLower.includes('in my experience') || bodyLower.includes("i've seen")) {
    tags.push({ category: 'tone', elementType: 'consultative' })
  } else {
    tags.push({ category: 'tone', elementType: 'professional_warm' })
  }

  // Length detection
  const wordCount = emailBody.split(/\s+/).length
  if (wordCount < 50) {
    tags.push({ category: 'length', elementType: 'ultra_short' })
  } else if (wordCount < 100) {
    tags.push({ category: 'length', elementType: 'short' })
  } else if (wordCount < 150) {
    tags.push({ category: 'length', elementType: 'medium' })
  } else {
    tags.push({ category: 'length', elementType: 'detailed' })
  }

  // Save tags if outreach event ID is provided
  if (outreachEventId) {
    await tagOutreachEvent(outreachEventId, tags)
  }

  return tags
}

// ============================================================================
// ANALYTICS & RECOMMENDATIONS
// ============================================================================

/**
 * Get top performing elements for a category
 */
export async function getTopElements(
  tenantId: string,
  category: string,
  options?: {
    personaType?: string
    relationshipType?: string
    emailPosition?: number
    limit?: number
  }
): Promise<ContentElement[]> {
  try {
    // Use the database function if available, otherwise query directly
    const { data, error } = await supabase.rpc('get_recommended_elements', {
      p_tenant_id: tenantId,
      p_category: category,
      p_persona_type: options?.personaType || null,
      p_relationship_type: options?.relationshipType || null,
      p_email_position: options?.emailPosition || null,
      p_limit: options?.limit || 5,
    })

    if (error) {
      console.error('[LearningTracker] Error getting top elements:', error)
      return []
    }

    return data.map((d: { element_type: string; description: string }) => ({
      id: '',
      category,
      elementType: d.element_type,
      description: d.description,
    }))
  } catch (err) {
    console.error('[LearningTracker] Exception getting top elements:', err)
    return []
  }
}

/**
 * Get element performance summary
 */
export async function getElementPerformanceSummary(
  tenantId: string,
  elementTypeId: string
): Promise<{
  timesUsed: number
  replyRate: number
  positiveReplyRate: number
  engagementScore: number
  confidenceScore: number
} | null> {
  try {
    const { data, error } = await supabase
      .from('element_performance')
      .select('times_used, reply_rate, positive_reply_rate, engagement_score, confidence_score')
      .eq('tenant_id', tenantId)
      .eq('element_type_id', elementTypeId)
      .is('persona_type', null)
      .is('relationship_type', null)
      .is('email_position', null)
      .order('period_end', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    return {
      timesUsed: data.times_used,
      replyRate: parseFloat(data.reply_rate),
      positiveReplyRate: parseFloat(data.positive_reply_rate),
      engagementScore: parseFloat(data.engagement_score),
      confidenceScore: parseFloat(data.confidence_score),
    }
  } catch (err) {
    return null
  }
}

/**
 * Get learned patterns for a tenant
 */
export async function getLearnedPatterns(
  tenantId: string,
  options?: {
    patternType?: string
    status?: string
    limit?: number
  }
): Promise<
  Array<{
    id: string
    patternType: string
    patternName: string
    description: string
    confidenceScore: number
    performanceMetrics: Record<string, unknown>
  }>
> {
  try {
    let query = supabase
      .from('learned_patterns')
      .select('id, pattern_type, pattern_name, description, confidence_score, performance_metrics')
      .eq('tenant_id', tenantId)

    if (options?.patternType) {
      query = query.eq('pattern_type', options.patternType)
    }

    if (options?.status) {
      query = query.eq('status', options.status)
    }

    query = query.order('confidence_score', { ascending: false }).limit(options?.limit || 10)

    const { data, error } = await query

    if (error) {
      console.error('[LearningTracker] Error getting learned patterns:', error)
      return []
    }

    return data.map((d) => ({
      id: d.id,
      patternType: d.pattern_type,
      patternName: d.pattern_name,
      description: d.description,
      confidenceScore: parseFloat(d.confidence_score),
      performanceMetrics: d.performance_metrics,
    }))
  } catch (err) {
    console.error('[LearningTracker] Exception getting learned patterns:', err)
    return []
  }
}

/**
 * Refresh element performance aggregations for a tenant
 */
export async function refreshElementPerformance(
  tenantId: string,
  periodStart?: Date,
  periodEnd?: Date
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('refresh_element_performance', {
      p_tenant_id: tenantId,
      p_period_start: periodStart?.toISOString().split('T')[0],
      p_period_end: periodEnd?.toISOString().split('T')[0],
    })

    if (error) {
      console.error('[LearningTracker] Error refreshing element performance:', error)
      return 0
    }

    return data || 0
  } catch (err) {
    console.error('[LearningTracker] Exception refreshing element performance:', err)
    return 0
  }
}

// ============================================================================
// HELPER: Track full sequence deployment
// ============================================================================

/**
 * Track all emails in a sequence when deployed to Smartlead
 */
export async function trackSequenceDeployment(input: {
  tenantId: string
  leadId: string
  sequenceId: string
  smartleadCampaignId: string
  smartleadLeadId: string
  personaType: string
  relationshipType: string
  topTriggerType?: string
  sequenceStrategy?: Record<string, unknown>
  threads: Array<{
    threadNumber: 1 | 2
    subject: string
    emails: Array<{ body: string }>
  }>
}): Promise<string[]> {
  const outreachEventIds: string[] = []

  for (const thread of input.threads) {
    for (let i = 0; i < thread.emails.length; i++) {
      const email = thread.emails[i]
      const eventId = await trackOutreachEvent({
        tenantId: input.tenantId,
        leadId: input.leadId,
        sequenceId: input.sequenceId,
        threadNumber: thread.threadNumber,
        emailPosition: i + 1,
        subjectLine: thread.subject,
        emailBody: email.body,
        smartleadCampaignId: input.smartleadCampaignId,
        smartleadLeadId: input.smartleadLeadId,
        personaType: input.personaType,
        relationshipType: input.relationshipType,
        topTriggerType: input.topTriggerType,
        sequenceStrategy: input.sequenceStrategy,
      })

      if (eventId) {
        outreachEventIds.push(eventId)
        // Auto-tag the email
        await autoTagEmail(eventId, thread.subject, email.body)
      }
    }
  }

  return outreachEventIds
}
