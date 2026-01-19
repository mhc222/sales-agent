import Anthropic from '@anthropic-ai/sdk'
import { supabase, type Lead, type GHLRecord } from '../lib/supabase'
import { loadPrompt } from '../lib/prompt-loader'
import type { NormalizedLead, IntentSignals } from '../lib/data-normalizer'
import { getICPForLead, formatICPForPrompt } from '../lib/tenant-settings'
import type { Brand, Campaign } from '../lib/brands'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

type QualificationDecision = 'YES' | 'NO' | 'REVIEW'

// Brand context for qualification decisions
export interface BrandContext {
  brand?: Brand
  campaign?: Campaign
}

export interface QualificationResult {
  decision: QualificationDecision
  reasoning: string
  confidence: number
  ghl_status: 'existing_client' | 'existing_company' | 'new'
  icp_fit: 'strong' | 'medium' | 'weak'
  existing_outreach: {
    in_ghl: boolean
    in_smartlead: boolean
    in_heyreach: boolean
  }
}

export interface ExistingRecords {
  ghl: GHLRecord | null
  ghl_company_matches?: Array<{ leads?: { company_name: string } }>
  smartlead: Array<{ campaign_id: string; status: string | null }>
  heyreach: Array<{ outreach_id: string; status: string | null }>
}

interface LegacyIntentSignal {
  page_visited?: string
  time_on_page?: number
  event_type?: string
}

/**
 * Qualify a lead using normalized data
 * @param normalized - Normalized lead data
 * @param existingRecords - Existing system records for deduplication
 * @param brandContext - Optional brand and campaign context for ICP-aware qualification
 */
export async function qualifyNormalizedLead(
  normalized: NormalizedLead,
  existingRecords?: ExistingRecords,
  brandContext?: BrandContext
): Promise<QualificationResult> {
  const records: ExistingRecords = existingRecords || { ghl: null, smartlead: [], heyreach: [] }

  // Convert NormalizedLead intent signals to legacy format for prompt
  const intent: LegacyIntentSignal = normalized.intentSignals
    ? {
        page_visited: normalized.intentSignals.pageVisited,
        time_on_page: normalized.intentSignals.timeOnPage,
        event_type: normalized.intentSignals.eventType,
      }
    : {}

  // Fetch brand-specific or tenant-level ICP
  const icp = await getICPForLead(normalized.tenantId, brandContext?.brand?.id)
  const icpContext = icp ? formatICPForPrompt(icp) : ''

  // Build brand context string for prompt
  const brandContextParts: string[] = []
  if (brandContext?.brand) {
    brandContextParts.push(`Brand: ${brandContext.brand.name}`)
    if (brandContext.brand.value_proposition) {
      brandContextParts.push(`Value Proposition: ${brandContext.brand.value_proposition}`)
    }
    if (brandContext.brand.target_industries?.length) {
      brandContextParts.push(`Target Industries: ${brandContext.brand.target_industries.join(', ')}`)
    }
  }
  if (brandContext?.campaign) {
    brandContextParts.push(`Campaign: ${brandContext.campaign.name}`)
    if (brandContext.campaign.target_persona) {
      brandContextParts.push(`Target Persona: ${brandContext.campaign.target_persona}`)
    }
  }
  const brandContextString = brandContextParts.length > 0
    ? `\n\nBRAND CONTEXT:\n${brandContextParts.join('\n')}`
    : ''

  // Fetch RAG documents (Shared RAG for qualification)
  // Prefer brand-specific RAG if brand is provided
  let ragDocs
  if (brandContext?.brand?.id) {
    const { data } = await supabase
      .from('rag_documents')
      .select('content')
      .eq('brand_id', brandContext.brand.id)
      .in('rag_type', ['shared', 'qualification'])
      .limit(5)
    ragDocs = data
  }

  // Fall back to tenant-level RAG if no brand RAG found
  if (!ragDocs || ragDocs.length === 0) {
    const { data, error: ragError } = await supabase
      .from('rag_documents')
      .select('content')
      .eq('tenant_id', normalized.tenantId)
      .eq('rag_type', 'shared')
      .is('brand_id', null)
      .limit(5)

    if (ragError) {
      console.error('Error fetching RAG documents:', ragError)
      throw ragError
    }
    ragDocs = data
  }

  const ragContent = ragDocs?.map((doc) => doc.content).join('\n\n') || ''

  // Calculate intent score
  const intentScore = calculateIntentScore(intent, normalized.visitCount || 1)

  // Build existing relationship check string
  const existingRelationshipParts: string[] = []

  if (records.ghl) {
    existingRelationshipParts.push(
      `- GHL: FOUND existing record (Classification: ${records.ghl.classification || 'Unknown'})\n  This may be an EXISTING CLIENT or past contact.`
    )
  } else {
    existingRelationshipParts.push('- GHL: No existing contact found')
  }

  if (records.ghl_company_matches && records.ghl_company_matches.length > 0) {
    existingRelationshipParts.push(
      `- Company Match: Found ${records.ghl_company_matches.length} similar company name(s) in GHL:\n  ${records.ghl_company_matches.map((m) => m.leads?.company_name).join(', ')}\n  This company may already be a client.`
    )
  }

  existingRelationshipParts.push(
    records.smartlead.length > 0
      ? `- Smartlead: ${records.smartlead.length} existing campaign(s)`
      : '- Smartlead: No campaigns'
  )

  existingRelationshipParts.push(
    records.heyreach.length > 0
      ? `- HeyReach: ${records.heyreach.length} existing outreach(s)`
      : '- HeyReach: No outreach'
  )

  // Build the qualification prompt using template
  // Include ICP context and brand context if available
  const ragWithIcpAndBrand = [
    ragContent,
    icpContext ? `\n\nIDEAL CUSTOMER PROFILE (ICP):\n${icpContext}` : '',
    brandContextString,
  ].filter(Boolean).join('\n')

  const prompt = loadPrompt('agent1-qualification', {
    ragContent: ragWithIcpAndBrand,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    email: normalized.email,
    jobTitle: normalized.jobTitle || 'Unknown',
    department: normalized.department || 'Unknown',
    seniorityLevel: normalized.seniorityLevel || 'Unknown',
    companyName: normalized.companyName,
    companyEmployeeCount: normalized.companyEmployeeCount != null ? String(normalized.companyEmployeeCount) : 'Unknown',
    companyIndustry: normalized.companyIndustry || 'Unknown',
    companyRevenue: normalized.companyRevenue || 'Unknown',
    companyDescription: normalized.companyDescription || 'N/A',
    visitCount: String(normalized.visitCount || 1),
    visitCountContext: normalized.visitCount > 1 ? 'RETURNING VISITOR - higher intent' : 'first visit',
    pageVisited: intent.page_visited || 'Unknown',
    timeOnPage: intent.time_on_page ? `${Math.round(intent.time_on_page / 1000)}s` : 'Unknown',
    eventType: intent.event_type || 'Unknown',
    intentScore: String(intentScore),
    intentScoreLevel: intentScore >= 70 ? '(HIGH)' : intentScore >= 40 ? '(MEDIUM)' : '(LOW)',
    existingRelationshipCheck: existingRelationshipParts.join('\n'),
  })

  // Call Claude
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
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

  let result: QualificationResult

  try {
    // Strip markdown code blocks if present
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    result = JSON.parse(jsonText)
  } catch (error) {
    console.error('Failed to parse qualification response:', responseText)
    // Fallback to REVIEW if parsing fails
    result = {
      decision: 'REVIEW',
      reasoning: 'Claude response parsing failed - manual review recommended',
      confidence: 0.5,
      ghl_status: 'new',
      icp_fit: 'medium',
      existing_outreach: {
        in_ghl: !!records.ghl,
        in_smartlead: records.smartlead.length > 0,
        in_heyreach: records.heyreach.length > 0,
      },
    }
  }

  // Enforce minimum confidence threshold - anything below 0.50 is disqualified
  if (result.confidence < 0.5) {
    result.decision = 'NO'
    result.reasoning = `Low confidence (${result.confidence}) - auto-disqualified. Original: ${result.reasoning}`
  }

  return result
}

/**
 * Legacy function for backward compatibility - accepts Lead type
 * @deprecated Use qualifyNormalizedLead with NormalizedLead type instead
 */
export async function qualifyLead(
  lead: Lead,
  existingRecords?: ExistingRecords,
  intentSignal?: LegacyIntentSignal
): Promise<QualificationResult> {
  const records: ExistingRecords = existingRecords || { ghl: null, smartlead: [], heyreach: [] }
  const intent = intentSignal || (lead.intent_signal as LegacyIntentSignal) || {}

  // Fetch RAG documents (Shared RAG for qualification)
  const { data: ragDocs, error: ragError } = await supabase
    .from('rag_documents')
    .select('content')
    .eq('tenant_id', lead.tenant_id)
    .eq('rag_type', 'shared')
    .limit(5)

  if (ragError) {
    console.error('Error fetching RAG documents:', ragError)
    throw ragError
  }

  const ragContent = ragDocs?.map((doc) => doc.content).join('\n\n') || ''

  // Calculate intent score
  const intentScore = calculateIntentScore(intent, lead.visit_count || 1)

  // Build existing relationship check string
  const existingRelationshipParts: string[] = []

  if (records.ghl) {
    existingRelationshipParts.push(
      `- GHL: FOUND existing record (Classification: ${records.ghl.classification || 'Unknown'})\n  This may be an EXISTING CLIENT or past contact.`
    )
  } else {
    existingRelationshipParts.push('- GHL: No existing contact found')
  }

  if (records.ghl_company_matches && records.ghl_company_matches.length > 0) {
    existingRelationshipParts.push(
      `- Company Match: Found ${records.ghl_company_matches.length} similar company name(s) in GHL:\n  ${records.ghl_company_matches.map((m) => m.leads?.company_name).join(', ')}\n  This company may already be a client.`
    )
  }

  existingRelationshipParts.push(
    records.smartlead.length > 0
      ? `- Smartlead: ${records.smartlead.length} existing campaign(s)`
      : '- Smartlead: No campaigns'
  )

  existingRelationshipParts.push(
    records.heyreach.length > 0
      ? `- HeyReach: ${records.heyreach.length} existing outreach(s)`
      : '- HeyReach: No outreach'
  )

  // Build the qualification prompt using template
  const prompt = loadPrompt('agent1-qualification', {
    ragContent,
    firstName: lead.first_name,
    lastName: lead.last_name,
    email: lead.email,
    jobTitle: lead.job_title || 'Unknown',
    department: lead.department || 'Unknown',
    seniorityLevel: lead.seniority_level || 'Unknown',
    companyName: lead.company_name,
    companyEmployeeCount: String(lead.company_employee_count || 'Unknown'),
    companyIndustry: lead.company_industry || 'Unknown',
    companyRevenue: lead.company_revenue || 'Unknown',
    companyDescription: lead.company_description || 'N/A',
    visitCount: String(lead.visit_count || 1),
    visitCountContext: lead.visit_count && lead.visit_count > 1 ? 'RETURNING VISITOR - higher intent' : 'first visit',
    pageVisited: intent.page_visited || 'Unknown',
    timeOnPage: intent.time_on_page ? `${Math.round(intent.time_on_page / 1000)}s` : 'Unknown',
    eventType: intent.event_type || 'Unknown',
    intentScore: String(intentScore),
    intentScoreLevel: intentScore >= 70 ? '(HIGH)' : intentScore >= 40 ? '(MEDIUM)' : '(LOW)',
    existingRelationshipCheck: existingRelationshipParts.join('\n'),
  })

  // Call Claude
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
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

  let result: QualificationResult

  try {
    // Strip markdown code blocks if present
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    result = JSON.parse(jsonText)
  } catch (error) {
    console.error('Failed to parse qualification response:', responseText)
    // Fallback to REVIEW if parsing fails
    result = {
      decision: 'REVIEW',
      reasoning: 'Claude response parsing failed - manual review recommended',
      confidence: 0.5,
      ghl_status: 'new',
      icp_fit: 'medium',
      existing_outreach: {
        in_ghl: !!records.ghl,
        in_smartlead: records.smartlead.length > 0,
        in_heyreach: records.heyreach.length > 0,
      },
    }
  }

  // Enforce minimum confidence threshold - anything below 0.50 is disqualified
  if (result.confidence < 0.5) {
    result.decision = 'NO'
    result.reasoning = `Low confidence (${result.confidence}) - auto-disqualified. Original: ${result.reasoning}`
  }

  return result
}

function calculateIntentScore(intent: LegacyIntentSignal, visitCount: number): number {
  let score = 0

  // Visit count (max 30 points)
  score += Math.min(visitCount * 10, 30)

  // Page visited (max 30 points)
  const page = intent.page_visited?.toLowerCase() || ''
  if (page.includes('/pricing') || page.includes('/contact')) {
    score += 30
  } else if (page.includes('/services') || page.includes('/case-studies')) {
    score += 20
  } else if (page.includes('/blog') || page.includes('/about')) {
    score += 10
  } else {
    score += 5 // homepage or other
  }

  // Time on page (max 20 points)
  const timeSeconds = (intent.time_on_page || 0) / 1000
  if (timeSeconds >= 60) {
    score += 20
  } else if (timeSeconds >= 30) {
    score += 15
  } else if (timeSeconds >= 10) {
    score += 10
  }

  // Event type (max 20 points)
  const eventType = intent.event_type?.toLowerCase() || ''
  if (eventType === 'click') {
    score += 20
  } else if (eventType === 'page_view') {
    score += 10
  } else if (eventType === 'user_idle') {
    score += 5
  }

  return Math.min(score, 100)
}
