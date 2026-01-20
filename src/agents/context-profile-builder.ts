/**
 * Context Profile Builder
 * Synthesizes research data into a unified context profile for personalized outreach
 */

import { loadPrompt } from '../lib/prompt-loader'
import { getTenantLLM } from '../lib/tenant-settings'
import type { NormalizedLead } from '../lib/data-normalizer'

// ============================================================================
// Types
// ============================================================================

export interface ContextProfile {
  // Lead Summary
  leadSummary: {
    name: string
    title: string
    company: string
    seniorityLevel: string
    decisionMakerLikelihood: 'high' | 'medium' | 'low'
  }

  // Company Intelligence
  companyIntelligence: {
    overview: string // 2-3 sentence summary
    industry: string
    employeeCount: number | null
    revenueRange: string | null
    growthSignals: string[] // e.g., "hiring marketing roles", "expanding locations"
    challenges: string[] // inferred from research
  }

  // Personalization Hooks
  personalizationHooks: {
    recentActivity: string[] // from LinkedIn posts, news mentions
    careerPath: string // notable career moves or background
    sharedContext: string[] // mutual connections, similar companies, etc.
    conversationStarters: string[] // specific openers based on research
  }

  // Pain Point Analysis
  painPointAnalysis: {
    primaryPainPoint: string // most likely based on signals
    secondaryPainPoints: string[]
    evidenceSources: string[] // what data supports these pain points
    relevantValueProp: string // from RAG, matched to pain point
  }

  // Engagement Strategy
  engagementStrategy: {
    recommendedTone: 'formal' | 'conversational' | 'casual'
    triggerEvent: string | null // what prompted outreach timing
    urgencyLevel: 'high' | 'medium' | 'low'
    approachAngle: string // one sentence on how to approach
    avoidTopics: string[] // things not to mention
  }

  // Outreach Guidance (from enhanced research pipeline)
  outreachGuidance?: {
    urgency: 'high' | 'medium' | 'low'
    tone: string // from LinkedIn analysis
    personalizationHooks: string[] // best hooks to use
    compositeTriggers: {
      highIntent: boolean
      warmIntent: boolean
      viewedPricing: boolean
      viewedServices: boolean
      recentFunding: boolean
      activelyHiring: boolean
      competitivePressure: boolean
      hasPainSignals: boolean
      hasHighConfidencePain: boolean
      isActiveOnLinkedIn: boolean
    }
    painSignals: Array<{
      topic: string
      confidence: 'high' | 'medium' | 'low'
    }>
    intentScore?: number
    intentTier?: 'hot' | 'warm' | 'cold' | 'research'
  }

  // Metadata
  metadata: {
    profileGeneratedAt: string
    dataQualityScore: number // 0-100, based on how much data we have
    missingData: string[] // what we couldn't find
  }
}

export interface ResearchRecord {
  perplexity_raw: string | null
  apify_raw: Record<string, unknown> | null
  extracted_signals: Record<string, unknown> | null
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a minimal profile when parsing fails
 */
function createMinimalProfile(
  lead: NormalizedLead,
  researchRecord: ResearchRecord
): ContextProfile {
  return {
    leadSummary: {
      name: `${lead.firstName} ${lead.lastName}`,
      title: lead.jobTitle || 'Unknown',
      company: lead.companyName,
      seniorityLevel: lead.seniorityLevel || 'Unknown',
      decisionMakerLikelihood: 'medium',
    },
    companyIntelligence: {
      overview: lead.companyDescription || `${lead.companyName} is a company in the ${lead.companyIndustry || 'Unknown'} industry.`,
      industry: lead.companyIndustry || 'Unknown',
      employeeCount: lead.companyEmployeeCount,
      revenueRange: lead.companyRevenue,
      growthSignals: [],
      challenges: [],
    },
    personalizationHooks: {
      recentActivity: [],
      careerPath: lead.jobTitle ? `Currently ${lead.jobTitle} at ${lead.companyName}` : 'Career path unknown',
      sharedContext: [],
      conversationStarters: [
        `Your work at ${lead.companyName} caught our attention.`,
      ],
    },
    painPointAnalysis: {
      primaryPainPoint: 'Marketing effectiveness and ROI measurement',
      secondaryPainPoints: [],
      evidenceSources: ['Industry standard challenges'],
      relevantValueProp: 'Multi-channel campaign orchestration and attribution',
    },
    engagementStrategy: {
      recommendedTone: 'conversational',
      triggerEvent: lead.source === 'pixel' ? 'Website visit' : 'Intent signal detected',
      urgencyLevel: 'medium',
      approachAngle: `Reach out about marketing challenges at ${lead.companyName}`,
      avoidTopics: [],
    },
    metadata: {
      profileGeneratedAt: new Date().toISOString(),
      dataQualityScore: 25, // Low score for minimal profile
      missingData: [
        'LinkedIn activity',
        'Recent company news',
        'Detailed career history',
        'Specific pain point signals',
      ],
    },
  }
}

/**
 * Parse and validate the context profile JSON
 */
function parseContextProfile(jsonText: string, lead: NormalizedLead): ContextProfile {
  // Strip markdown code blocks if present
  let cleanJson = jsonText.trim()
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  const parsed = JSON.parse(cleanJson)

  // Validate and set defaults for required fields
  return {
    leadSummary: {
      name: parsed.leadSummary?.name || `${lead.firstName} ${lead.lastName}`,
      title: parsed.leadSummary?.title || lead.jobTitle || 'Unknown',
      company: parsed.leadSummary?.company || lead.companyName,
      seniorityLevel: parsed.leadSummary?.seniorityLevel || lead.seniorityLevel || 'Unknown',
      decisionMakerLikelihood: parsed.leadSummary?.decisionMakerLikelihood || 'medium',
    },
    companyIntelligence: {
      overview: parsed.companyIntelligence?.overview || '',
      industry: parsed.companyIntelligence?.industry || lead.companyIndustry || 'Unknown',
      employeeCount: parsed.companyIntelligence?.employeeCount ?? lead.companyEmployeeCount,
      revenueRange: parsed.companyIntelligence?.revenueRange || lead.companyRevenue,
      growthSignals: Array.isArray(parsed.companyIntelligence?.growthSignals)
        ? parsed.companyIntelligence.growthSignals
        : [],
      challenges: Array.isArray(parsed.companyIntelligence?.challenges)
        ? parsed.companyIntelligence.challenges
        : [],
    },
    personalizationHooks: {
      recentActivity: Array.isArray(parsed.personalizationHooks?.recentActivity)
        ? parsed.personalizationHooks.recentActivity
        : [],
      careerPath: parsed.personalizationHooks?.careerPath || '',
      sharedContext: Array.isArray(parsed.personalizationHooks?.sharedContext)
        ? parsed.personalizationHooks.sharedContext
        : [],
      conversationStarters: Array.isArray(parsed.personalizationHooks?.conversationStarters)
        ? parsed.personalizationHooks.conversationStarters
        : [],
    },
    painPointAnalysis: {
      primaryPainPoint: parsed.painPointAnalysis?.primaryPainPoint || 'Unknown',
      secondaryPainPoints: Array.isArray(parsed.painPointAnalysis?.secondaryPainPoints)
        ? parsed.painPointAnalysis.secondaryPainPoints
        : [],
      evidenceSources: Array.isArray(parsed.painPointAnalysis?.evidenceSources)
        ? parsed.painPointAnalysis.evidenceSources
        : [],
      relevantValueProp: parsed.painPointAnalysis?.relevantValueProp || '',
    },
    engagementStrategy: {
      recommendedTone: parsed.engagementStrategy?.recommendedTone || 'conversational',
      triggerEvent: parsed.engagementStrategy?.triggerEvent || null,
      urgencyLevel: parsed.engagementStrategy?.urgencyLevel || 'medium',
      approachAngle: parsed.engagementStrategy?.approachAngle || '',
      avoidTopics: Array.isArray(parsed.engagementStrategy?.avoidTopics)
        ? parsed.engagementStrategy.avoidTopics
        : [],
    },
    metadata: {
      profileGeneratedAt: new Date().toISOString(),
      dataQualityScore: parsed.metadata?.dataQualityScore ?? 50,
      missingData: Array.isArray(parsed.metadata?.missingData)
        ? parsed.metadata.missingData
        : [],
    },
  }
}

// ============================================================================
// Main Function
// ============================================================================

// Type for enhanced data from workflow 2
export interface EnhancedResearchData {
  outreachGuidance?: {
    urgency: 'high' | 'medium' | 'low'
    tone: string
    personalizationHooks: string[]
  }
  compositeTriggers?: {
    highIntent?: boolean
    warmIntent?: boolean
    viewedPricing?: boolean
    viewedServices?: boolean
    recentFunding?: boolean
    activelyHiring?: boolean
    competitivePressure?: boolean
    hasPainSignals?: boolean
    hasHighConfidencePain?: boolean
    isActiveOnLinkedIn?: boolean
  }
  painSignals?: Array<{
    topic: string
    confidence: 'high' | 'medium' | 'low'
  }>
  intentScore?: number
  intentTier?: 'hot' | 'warm' | 'cold' | 'research'
}

/**
 * Build a context profile from research data
 */
export async function buildContextProfile(
  lead: NormalizedLead,
  researchRecord: ResearchRecord,
  ragContext: string,
  enhancedData?: EnhancedResearchData
): Promise<ContextProfile> {
  console.log(`[Context Profile] Building profile for: ${lead.email}`)
  if (enhancedData) {
    console.log(`[Context Profile] Enhanced data provided - Urgency: ${enhancedData.outreachGuidance?.urgency}, Intent: ${enhancedData.intentTier}`)
  }

  // Prepare data for prompt
  const leadData = JSON.stringify(
    {
      name: `${lead.firstName} ${lead.lastName}`,
      email: lead.email,
      title: lead.jobTitle,
      headline: lead.headline,
      department: lead.department,
      seniorityLevel: lead.seniorityLevel,
      linkedinUrl: lead.linkedinUrl,
      company: lead.companyName,
      companyDomain: lead.companyDomain,
      companyIndustry: lead.companyIndustry,
      companyEmployeeCount: lead.companyEmployeeCount,
      companyRevenue: lead.companyRevenue,
      companyDescription: lead.companyDescription,
    },
    null,
    2
  )

  const linkedinData = researchRecord.apify_raw
    ? JSON.stringify(researchRecord.apify_raw, null, 2)
    : 'No LinkedIn data available'

  const perplexityData = researchRecord.perplexity_raw || 'No Perplexity research available'

  const intentSignals = JSON.stringify(
    {
      source: lead.source,
      visitCount: lead.visitCount,
      intentScore: lead.intentScore,
      intentSignals: lead.intentSignals,
    },
    null,
    2
  )

  // Build the prompt
  const prompt = loadPrompt('context-profile-builder', {
    leadData,
    linkedinData,
    perplexityData,
    intentSignals,
    jsbContext: ragContext,
  })

  // Get tenant's configured LLM
  const llm = await getTenantLLM(lead.tenantId)

  // Call LLM
  let responseText = ''
  try {
    const response = await llm.chat([
      { role: 'user', content: prompt },
    ], { maxTokens: 4000 })

    responseText = response.content
  } catch (error) {
    console.error('[Context Profile] LLM API error:', error)
    console.log('[Context Profile] Returning minimal profile due to API error')
    return createMinimalProfile(lead, researchRecord)
  }

  // Helper to merge enhanced data into profile
  const mergeEnhancedData = (profile: ContextProfile): ContextProfile => {
    if (!enhancedData) return profile

    // Add outreach guidance if available
    if (enhancedData.outreachGuidance || enhancedData.compositeTriggers || enhancedData.painSignals) {
      profile.outreachGuidance = {
        urgency: enhancedData.outreachGuidance?.urgency || profile.engagementStrategy.urgencyLevel,
        tone: enhancedData.outreachGuidance?.tone || profile.engagementStrategy.recommendedTone,
        personalizationHooks: enhancedData.outreachGuidance?.personalizationHooks || [],
        compositeTriggers: {
          highIntent: enhancedData.compositeTriggers?.highIntent || false,
          warmIntent: enhancedData.compositeTriggers?.warmIntent || false,
          viewedPricing: enhancedData.compositeTriggers?.viewedPricing || false,
          viewedServices: enhancedData.compositeTriggers?.viewedServices || false,
          recentFunding: enhancedData.compositeTriggers?.recentFunding || false,
          activelyHiring: enhancedData.compositeTriggers?.activelyHiring || false,
          competitivePressure: enhancedData.compositeTriggers?.competitivePressure || false,
          hasPainSignals: enhancedData.compositeTriggers?.hasPainSignals || false,
          hasHighConfidencePain: enhancedData.compositeTriggers?.hasHighConfidencePain || false,
          isActiveOnLinkedIn: enhancedData.compositeTriggers?.isActiveOnLinkedIn || false,
        },
        painSignals: enhancedData.painSignals || [],
        intentScore: enhancedData.intentScore,
        intentTier: enhancedData.intentTier,
      }

      // Override engagement strategy urgency with enhanced data
      if (enhancedData.outreachGuidance?.urgency) {
        profile.engagementStrategy.urgencyLevel = enhancedData.outreachGuidance.urgency
      }

      // Override tone if we have LinkedIn-based tone analysis
      if (enhancedData.outreachGuidance?.tone && enhancedData.outreachGuidance.tone !== 'formal') {
        const tone = enhancedData.outreachGuidance.tone.toLowerCase()
        if (tone === 'casual' || tone === 'conversational' || tone === 'formal') {
          profile.engagementStrategy.recommendedTone = tone
        }
      }
    }

    return profile
  }

  // Parse response
  try {
    const profile = parseContextProfile(responseText, lead)
    const enrichedProfile = mergeEnhancedData(profile)
    console.log(`[Context Profile] Profile built - Quality score: ${enrichedProfile.metadata.dataQualityScore}`)
    if (enrichedProfile.outreachGuidance) {
      console.log(`[Context Profile] Outreach guidance added - Urgency: ${enrichedProfile.outreachGuidance.urgency}, Hooks: ${enrichedProfile.outreachGuidance.personalizationHooks.length}`)
    }
    return enrichedProfile
  } catch (parseError) {
    console.error('[Context Profile] Failed to parse response, retrying...')
    console.error('[Context Profile] Response snippet:', responseText.substring(0, 500))

    // Retry once
    try {
      const retryResponse = await llm.chat([
        { role: 'user', content: prompt },
        { role: 'assistant', content: responseText },
        {
          role: 'user',
          content: 'Your response was not valid JSON. Please return ONLY a valid JSON object matching the ContextProfile schema, with no markdown formatting or additional text.',
        },
      ], { maxTokens: 4000 })

      const retryText = retryResponse.content
      const profile = parseContextProfile(retryText, lead)
      const enrichedProfile = mergeEnhancedData(profile)
      console.log(`[Context Profile] Profile built on retry - Quality score: ${enrichedProfile.metadata.dataQualityScore}`)
      return enrichedProfile
    } catch (retryError) {
      console.error('[Context Profile] Retry also failed, returning minimal profile')
      return mergeEnhancedData(createMinimalProfile(lead, researchRecord))
    }
  }
}
