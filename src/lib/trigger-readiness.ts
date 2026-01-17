/**
 * Trigger Readiness Scoring
 *
 * Determines if a lead has strong enough triggers to warrant outreach.
 * Leads without active triggers should wait until we have better signals.
 *
 * This gates progression from Research → Sequencing
 */

// Minimal interface for trigger readiness - only the fields we actually use
export interface TriggerReadinessInput {
  outreachGuidance?: {
    urgency?: 'high' | 'medium' | 'low'
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
  }
  engagementStrategy?: {
    triggerEvent?: string | null
    urgencyLevel?: 'high' | 'medium' | 'low'
  }
}

export interface TriggerReadinessResult {
  score: number // 0-100
  isReadyForOutreach: boolean
  tier: 'immediate' | 'this_week' | 'hold' | 'nurture'
  reasons: string[]
  missingTriggers: string[]
  strongestTrigger: string | null
}

// Minimum score required to proceed to sequencing
const OUTREACH_THRESHOLD = 50

// Trigger weights - what makes someone worth reaching out to NOW
const TRIGGER_WEIGHTS = {
  // Tier 1: They're actively solving this problem (25 pts each)
  recentFunding: 25,
  activelyHiring: 20,
  highIntent: 25, // Viewed pricing, demo pages
  hasPainSignals: 20,

  // Tier 2: Good timing indicators (15 pts each)
  warmIntent: 15,
  viewedServices: 15,
  competitivePressure: 15,
  isActiveOnLinkedIn: 10,

  // Tier 3: Context but not triggers (5 pts each)
  viewedPricing: 10, // Already counted in highIntent usually
  hasHighConfidencePain: 15,
}

// Urgency multipliers
const URGENCY_MULTIPLIERS = {
  high: 1.3,
  medium: 1.0,
  low: 0.7,
}

/**
 * Calculate trigger readiness score from context profile
 */
export function calculateTriggerReadiness(
  contextProfile: TriggerReadinessInput | null,
  leadSource: string = 'apollo'
): TriggerReadinessResult {
  const reasons: string[] = []
  const missingTriggers: string[] = []
  let score = 0
  let strongestTrigger: string | null = null
  let strongestTriggerScore = 0

  // No context profile = can't assess
  if (!contextProfile) {
    return {
      score: 0,
      isReadyForOutreach: false,
      tier: 'hold',
      reasons: ['No research data available'],
      missingTriggers: ['Research required'],
      strongestTrigger: null,
    }
  }

  const guidance = contextProfile.outreachGuidance
  const engagement = contextProfile.engagementStrategy
  const triggers = guidance?.compositeTriggers

  // =========================================================================
  // Score from composite triggers
  // =========================================================================
  if (triggers) {
    // Tier 1 triggers
    if (triggers.highIntent) {
      score += TRIGGER_WEIGHTS.highIntent
      reasons.push('High-intent behavior detected (pricing/demo views)')
      if (TRIGGER_WEIGHTS.highIntent > strongestTriggerScore) {
        strongestTrigger = 'High-intent page views'
        strongestTriggerScore = TRIGGER_WEIGHTS.highIntent
      }
    }

    if (triggers.recentFunding) {
      score += TRIGGER_WEIGHTS.recentFunding
      reasons.push('Recent funding - budget available')
      if (TRIGGER_WEIGHTS.recentFunding > strongestTriggerScore) {
        strongestTrigger = 'Recent funding'
        strongestTriggerScore = TRIGGER_WEIGHTS.recentFunding
      }
    }

    if (triggers.activelyHiring) {
      score += TRIGGER_WEIGHTS.activelyHiring
      reasons.push('Actively hiring marketing roles')
      if (TRIGGER_WEIGHTS.activelyHiring > strongestTriggerScore) {
        strongestTrigger = 'Hiring growth/marketing roles'
        strongestTriggerScore = TRIGGER_WEIGHTS.activelyHiring
      }
    }

    if (triggers.hasPainSignals) {
      score += TRIGGER_WEIGHTS.hasPainSignals
      reasons.push('Pain signals detected from content')
      if (TRIGGER_WEIGHTS.hasPainSignals > strongestTriggerScore) {
        strongestTrigger = 'Expressed pain points'
        strongestTriggerScore = TRIGGER_WEIGHTS.hasPainSignals
      }
    }

    // Tier 2 triggers
    if (triggers.warmIntent) {
      score += TRIGGER_WEIGHTS.warmIntent
      reasons.push('Warm intent signals')
    }

    if (triggers.viewedServices) {
      score += TRIGGER_WEIGHTS.viewedServices
      reasons.push('Viewed service pages')
    }

    if (triggers.competitivePressure) {
      score += TRIGGER_WEIGHTS.competitivePressure
      reasons.push('Competitive pressure detected')
    }

    if (triggers.isActiveOnLinkedIn) {
      score += TRIGGER_WEIGHTS.isActiveOnLinkedIn
      reasons.push('Active on LinkedIn (reachable)')
    }

    if (triggers.hasHighConfidencePain) {
      score += TRIGGER_WEIGHTS.hasHighConfidencePain
      reasons.push('High-confidence pain signals')
    }

    // Track missing tier 1 triggers
    if (!triggers.highIntent) missingTriggers.push('No high-intent behavior')
    if (!triggers.recentFunding) missingTriggers.push('No funding news')
    if (!triggers.activelyHiring) missingTriggers.push('Not hiring marketing')
    if (!triggers.hasPainSignals) missingTriggers.push('No pain signals found')
  }

  // =========================================================================
  // Score from engagement strategy
  // =========================================================================
  if (engagement?.triggerEvent) {
    // They have an identified trigger event
    score += 15
    reasons.push(`Trigger event: ${engagement.triggerEvent}`)
    if (!strongestTrigger) {
      strongestTrigger = engagement.triggerEvent
    }
  }

  // =========================================================================
  // Apply urgency multiplier
  // =========================================================================
  const urgency = guidance?.urgency || engagement?.urgencyLevel || 'medium'
  const multiplier = URGENCY_MULTIPLIERS[urgency as keyof typeof URGENCY_MULTIPLIERS] || 1.0
  score = Math.round(score * multiplier)

  if (urgency === 'high') {
    reasons.push('High urgency detected')
  }

  // =========================================================================
  // Source-based adjustments
  // =========================================================================
  // Pixel visitors have implicit intent (they came to us)
  if (leadSource === 'pixel') {
    score += 15
    reasons.push('Direct website visitor (implicit intent)')
  }

  // Intent data leads have some signal
  if (leadSource === 'intent') {
    score += 10
    reasons.push('Intent data match')
  }

  // Cap at 100
  score = Math.min(100, score)

  // =========================================================================
  // Determine tier
  // =========================================================================
  let tier: TriggerReadinessResult['tier']
  if (score >= 70) {
    tier = 'immediate'
  } else if (score >= OUTREACH_THRESHOLD) {
    tier = 'this_week'
  } else if (score >= 25) {
    tier = 'nurture'
  } else {
    tier = 'hold'
  }

  const isReadyForOutreach = score >= OUTREACH_THRESHOLD

  // If not ready, add context
  if (!isReadyForOutreach) {
    if (missingTriggers.length === 0) {
      missingTriggers.push('Insufficient trigger signals for outreach')
    }
    reasons.push(`Score ${score} below threshold ${OUTREACH_THRESHOLD}`)
  }

  return {
    score,
    isReadyForOutreach,
    tier,
    reasons,
    missingTriggers,
    strongestTrigger,
  }
}

/**
 * Check if we should proceed to sequencing or hold the lead
 */
export function shouldProceedToSequencing(
  contextProfile: TriggerReadinessInput | null,
  leadSource: string = 'apollo'
): { proceed: boolean; reason: string; triggerScore: number } {
  const readiness = calculateTriggerReadiness(contextProfile, leadSource)

  return {
    proceed: readiness.isReadyForOutreach,
    reason: readiness.isReadyForOutreach
      ? `Strong triggers: ${readiness.strongestTrigger || 'Multiple signals'}`
      : `Holding: ${readiness.missingTriggers[0] || 'Insufficient triggers'}`,
    triggerScore: readiness.score,
  }
}

/**
 * Get a human-readable summary of trigger readiness
 */
export function getTriggerReadinessSummary(result: TriggerReadinessResult): string {
  const parts: string[] = []

  parts.push(`Trigger Score: ${result.score}/100 (${result.tier})`)

  if (result.strongestTrigger) {
    parts.push(`Best signal: ${result.strongestTrigger}`)
  }

  if (result.isReadyForOutreach) {
    parts.push('Ready for outreach')
  } else {
    parts.push(`Holding - ${result.missingTriggers[0]}`)
  }

  return parts.join('. ')
}
