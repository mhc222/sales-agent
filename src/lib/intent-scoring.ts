/**
 * Intent Scoring Library
 * Calculates ICP fit score (0-100) for intent data leads
 *
 * Factors:
 * - Industry Match: 0-25 pts
 * - Revenue Fit: 0-20 pts
 * - Title/Seniority: 0-20 pts
 * - Company Size: 0-15 pts
 * - Data Quality: 0-20 pts
 *
 * Supports dynamic targeting preferences to adjust scoring weights.
 */

import type { TargetingPreference } from './tenant-settings'

export interface IntentLeadData {
  // Personal
  firstName?: string
  lastName?: string
  email?: string
  jobTitle?: string
  seniority?: string
  linkedinUrl?: string

  // Company
  companyName?: string
  companyLinkedinUrl?: string
  companyDomain?: string
  companyIndustry?: string
  companyEmployeeCount?: number | string
  companyRevenue?: number | string
}

/** Scoring options with optional targeting preferences */
export interface ScoringOptions {
  targetingPreferences?: TargetingPreference[]
}

export interface IntentScoreResult {
  totalScore: number
  breakdown: {
    industry: number
    revenue: number
    title: number
    companySize: number
    dataQuality: number
  }
  preferenceAdjustments?: {
    field: string
    adjustment: number
    reason: string
  }[]
  tier: 'strong' | 'medium' | 'weak'
  reasoning: string[]
}

// ============================================================================
// INDUSTRY SCORING (0-25 pts)
// ============================================================================

const TARGET_INDUSTRIES = [
  'quick service restaurant', 'qsr', 'fast food', 'restaurant',
  'e-commerce', 'ecommerce', 'online retail', 'retail',
  'travel', 'tourism', 'hospitality', 'hotel', 'lodging',
  'franchise', 'franchising',
  'home services', 'home improvement', 'hvac', 'plumbing', 'roofing',
  'consumer services', 'food & beverage', 'food and beverage',
]

const ADJACENT_INDUSTRIES = [
  'marketing', 'advertising', 'media', 'digital marketing',
  'consumer goods', 'cpg', 'fmcg',
  'entertainment', 'leisure', 'recreation',
  'real estate', 'property management',
  'automotive', 'dealership',
  'healthcare', 'medical', 'dental',
  'fitness', 'wellness', 'gym',
  'beauty', 'cosmetics', 'personal care',
  'education', 'edtech',
]

function scoreIndustry(industry: string | undefined): { score: number; reason: string } {
  if (!industry) {
    return { score: 0, reason: 'No industry data' }
  }

  const normalized = industry.toLowerCase().trim()

  // Check target industries
  for (const target of TARGET_INDUSTRIES) {
    if (normalized.includes(target) || target.includes(normalized)) {
      return { score: 25, reason: `Target industry: ${industry}` }
    }
  }

  // Check adjacent industries
  for (const adjacent of ADJACENT_INDUSTRIES) {
    if (normalized.includes(adjacent) || adjacent.includes(normalized)) {
      return { score: 12, reason: `Adjacent industry: ${industry}` }
    }
  }

  return { score: 0, reason: `Non-target industry: ${industry}` }
}

// ============================================================================
// REVENUE SCORING (0-20 pts)
// ============================================================================

function parseRevenue(revenue: number | string | undefined): number | null {
  if (revenue === undefined || revenue === null) return null

  if (typeof revenue === 'number') return revenue

  const str = revenue.toString().toLowerCase().replace(/[,$]/g, '')

  // Handle ranges like "10M-50M" or "$10M - $50M"
  const rangeMatch = str.match(/(\d+\.?\d*)\s*([mk]?).*?-.*?(\d+\.?\d*)\s*([mk]?)/i)
  if (rangeMatch) {
    const low = parseRevenueValue(rangeMatch[1], rangeMatch[2])
    const high = parseRevenueValue(rangeMatch[3], rangeMatch[4])
    return (low + high) / 2 // Use midpoint
  }

  // Handle single values like "50M" or "$50 million"
  const singleMatch = str.match(/(\d+\.?\d*)\s*(m|million|k|thousand|b|billion)?/i)
  if (singleMatch) {
    return parseRevenueValue(singleMatch[1], singleMatch[2] || '')
  }

  return null
}

function parseRevenueValue(num: string, suffix: string): number {
  const value = parseFloat(num)
  const s = suffix.toLowerCase()

  if (s === 'b' || s === 'billion') return value * 1_000_000_000
  if (s === 'm' || s === 'million') return value * 1_000_000
  if (s === 'k' || s === 'thousand') return value * 1_000

  // If no suffix and value is small, assume millions
  if (value < 1000) return value * 1_000_000

  return value
}

function scoreRevenue(revenue: number | string | undefined): { score: number; reason: string } {
  const parsed = parseRevenue(revenue)

  if (parsed === null) {
    return { score: 0, reason: 'No revenue data' }
  }

  // Sweet spot: $10M - $500M
  if (parsed >= 10_000_000 && parsed <= 500_000_000) {
    return { score: 20, reason: `Target revenue: $${formatRevenue(parsed)}` }
  }

  // Close: $5M - $10M
  if (parsed >= 5_000_000 && parsed < 10_000_000) {
    return { score: 12, reason: `Near-target revenue: $${formatRevenue(parsed)}` }
  }

  // Acceptable: $500M - $1B
  if (parsed > 500_000_000 && parsed <= 1_000_000_000) {
    return { score: 8, reason: `Above-target revenue: $${formatRevenue(parsed)}` }
  }

  // Too small or too large
  if (parsed < 5_000_000) {
    return { score: 0, reason: `Below target revenue: $${formatRevenue(parsed)}` }
  }

  return { score: 0, reason: `Enterprise (>$1B): $${formatRevenue(parsed)}` }
}

function formatRevenue(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toString()
}

// ============================================================================
// TITLE/SENIORITY SCORING (0-20 pts)
// ============================================================================

const TITLE_SCORES: Array<{ patterns: string[]; score: number; label: string }> = [
  {
    patterns: ['cmo', 'chief marketing', 'vp marketing', 'vp of marketing', 'vice president marketing', 'svp marketing'],
    score: 20,
    label: 'Marketing Executive'
  },
  {
    patterns: ['director marketing', 'director of marketing', 'head of marketing', 'marketing director'],
    score: 20,
    label: 'Marketing Director'
  },
  {
    patterns: ['head of growth', 'vp growth', 'director growth', 'chief growth'],
    score: 16,
    label: 'Growth Leadership'
  },
  {
    patterns: ['founder', 'ceo', 'owner', 'president', 'co-founder', 'cofounder'],
    score: 16,
    label: 'Founder/CEO (decision maker)'
  },
  {
    patterns: ['marketing manager', 'growth manager', 'digital marketing manager', 'performance marketing'],
    score: 12,
    label: 'Marketing Manager'
  },
  {
    patterns: ['brand manager', 'product marketing', 'demand gen', 'demand generation'],
    score: 12,
    label: 'Mid-level Marketing'
  },
  {
    patterns: ['coo', 'chief operating', 'cfo', 'chief financial', 'general manager', 'gm'],
    score: 10,
    label: 'Operations/Finance Executive'
  },
]

// Disqualifying titles (sales, IT, etc.)
const DISQUALIFY_TITLES = [
  'sdr', 'bdr', 'sales rep', 'account executive', 'ae ', 'sales manager',
  'sales director', 'vp sales', 'chief revenue',
  'recruiter', 'hr ', 'human resources',
  'it support', 'help desk', 'receptionist', 'accountant',
  'software engineer', 'developer', 'engineer',
]

function scoreTitle(title: string | undefined, seniority: string | undefined): { score: number; reason: string } {
  if (!title) {
    return { score: 4, reason: 'No title data' }
  }

  const normalized = title.toLowerCase().trim()

  // Check for disqualifying titles
  for (const disq of DISQUALIFY_TITLES) {
    if (normalized.includes(disq)) {
      return { score: 0, reason: `Disqualifying title: ${title}` }
    }
  }

  // Check for target titles
  for (const { patterns, score, label } of TITLE_SCORES) {
    for (const pattern of patterns) {
      if (normalized.includes(pattern)) {
        return { score, reason: `${label}: ${title}` }
      }
    }
  }

  // Check seniority as fallback
  if (seniority) {
    const seniorityLower = seniority.toLowerCase()
    if (seniorityLower.includes('c-level') || seniorityLower.includes('executive')) {
      return { score: 10, reason: `Executive seniority: ${seniority}` }
    }
    if (seniorityLower.includes('director') || seniorityLower.includes('vp')) {
      return { score: 8, reason: `Director/VP seniority: ${seniority}` }
    }
    if (seniorityLower.includes('manager')) {
      return { score: 6, reason: `Manager seniority: ${seniority}` }
    }
  }

  return { score: 4, reason: `Unknown title: ${title}` }
}

// ============================================================================
// COMPANY SIZE SCORING (0-15 pts)
// ============================================================================

function parseEmployeeCount(count: number | string | undefined): number | null {
  if (count === undefined || count === null) return null

  if (typeof count === 'number') return count

  const str = count.toString().toLowerCase().replace(/[,+]/g, '')

  // Handle ranges like "50-100" or "100-500"
  const rangeMatch = str.match(/(\d+)\s*-\s*(\d+)/)
  if (rangeMatch) {
    return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2
  }

  // Handle single values
  const num = parseInt(str)
  return isNaN(num) ? null : num
}

function scoreCompanySize(employeeCount: number | string | undefined): { score: number; reason: string } {
  const parsed = parseEmployeeCount(employeeCount)

  if (parsed === null) {
    return { score: 4, reason: 'No employee count data' }
  }

  // Sweet spot: 50-500 employees
  if (parsed >= 50 && parsed <= 500) {
    return { score: 15, reason: `Target size: ${parsed} employees` }
  }

  // Close: 20-50 employees
  if (parsed >= 20 && parsed < 50) {
    return { score: 10, reason: `Small-mid size: ${parsed} employees` }
  }

  // Acceptable: 500-2000 employees
  if (parsed > 500 && parsed <= 2000) {
    return { score: 8, reason: `Mid-large size: ${parsed} employees` }
  }

  // Too small or too large
  if (parsed < 20) {
    return { score: 4, reason: `Very small: ${parsed} employees` }
  }

  return { score: 4, reason: `Enterprise: ${parsed}+ employees` }
}

// ============================================================================
// DATA QUALITY SCORING (0-20 pts)
// ============================================================================

function scoreDataQuality(lead: IntentLeadData): { score: number; reason: string } {
  let score = 0
  const reasons: string[] = []

  // LinkedIn URL (+7)
  if (lead.linkedinUrl && lead.linkedinUrl.includes('linkedin.com')) {
    score += 7
    reasons.push('Has LinkedIn URL')
  }

  // Company LinkedIn URL (+7)
  if (lead.companyLinkedinUrl && lead.companyLinkedinUrl.includes('linkedin.com')) {
    score += 7
    reasons.push('Has Company LinkedIn')
  }

  // Business Email (+6)
  if (lead.email && isBusinessEmail(lead.email)) {
    score += 6
    reasons.push('Has Business Email')
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(', ') : 'Missing data quality signals'
  }
}

function isBusinessEmail(email: string): boolean {
  const freeEmailDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com'
  ]

  const domain = email.toLowerCase().split('@')[1]
  return Boolean(domain && !freeEmailDomains.includes(domain))
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

export function calculateIntentScore(lead: IntentLeadData, options?: ScoringOptions): IntentScoreResult {
  const industryResult = scoreIndustry(lead.companyIndustry)
  const revenueResult = scoreRevenue(lead.companyRevenue)
  const titleResult = scoreTitle(lead.jobTitle, lead.seniority)
  const sizeResult = scoreCompanySize(lead.companyEmployeeCount)
  const dataQualityResult = scoreDataQuality(lead)

  let totalScore =
    industryResult.score +
    revenueResult.score +
    titleResult.score +
    sizeResult.score +
    dataQualityResult.score

  const breakdown = {
    industry: industryResult.score,
    revenue: revenueResult.score,
    title: titleResult.score,
    companySize: sizeResult.score,
    dataQuality: dataQualityResult.score,
  }

  const reasoning = [
    `Industry (${industryResult.score}/25): ${industryResult.reason}`,
    `Revenue (${revenueResult.score}/20): ${revenueResult.reason}`,
    `Title (${titleResult.score}/20): ${titleResult.reason}`,
    `Company Size (${sizeResult.score}/15): ${sizeResult.reason}`,
    `Data Quality (${dataQualityResult.score}/20): ${dataQualityResult.reason}`,
  ]

  // Apply targeting preferences if provided
  const preferenceAdjustments: IntentScoreResult['preferenceAdjustments'] = []

  if (options?.targetingPreferences && options.targetingPreferences.length > 0) {
    for (const pref of options.targetingPreferences) {
      const adjustment = applyTargetingPreference(lead, pref)
      if (adjustment.adjustment !== 0) {
        preferenceAdjustments.push(adjustment)
        totalScore += adjustment.adjustment
        reasoning.push(`Preference (${adjustment.field}): ${adjustment.reason} (${adjustment.adjustment > 0 ? '+' : ''}${adjustment.adjustment})`)
      }
    }
  }

  // Cap score between 0 and 100
  totalScore = Math.max(0, Math.min(100, totalScore))

  let tier: 'strong' | 'medium' | 'weak'
  if (totalScore >= 70) {
    tier = 'strong'
  } else if (totalScore >= 40) {
    tier = 'medium'
  } else {
    tier = 'weak'
  }

  return {
    totalScore,
    breakdown,
    preferenceAdjustments: preferenceAdjustments.length > 0 ? preferenceAdjustments : undefined,
    tier,
    reasoning,
  }
}

// ============================================================================
// TARGETING PREFERENCE APPLICATION
// ============================================================================

/**
 * Apply a single targeting preference to a lead and return the score adjustment
 */
function applyTargetingPreference(
  lead: IntentLeadData,
  pref: TargetingPreference
): { field: string; adjustment: number; reason: string } {
  const weight = pref.weight || 1.0
  const preference = pref.preference.toLowerCase()

  // Map fields to lead data
  const fieldValue = getFieldValue(lead, pref.field)

  if (fieldValue === null || fieldValue === undefined) {
    return { field: pref.field, adjustment: 0, reason: 'No data for this field' }
  }

  // Parse preference and check for match
  const match = checkPreferenceMatch(fieldValue, preference, pref.field)

  if (match.matches) {
    // Calculate adjustment based on weight
    // Weight of 1.0 = no change, 1.5 = +50% of base points, 0.5 = -50% of base points
    const basePoints = getBasePointsForField(pref.field)
    const adjustment = Math.round(basePoints * (weight - 1.0))

    return {
      field: pref.field,
      adjustment,
      reason: `${match.reason} (weight: ${weight}x)`,
    }
  }

  return { field: pref.field, adjustment: 0, reason: 'No preference match' }
}

/**
 * Get the value of a field from lead data
 */
function getFieldValue(lead: IntentLeadData, field: string): string | number | null {
  const fieldMap: Record<string, string | number | undefined> = {
    // Personal fields
    job_title: lead.jobTitle,
    seniority: lead.seniority,
    email: lead.email,
    // Company fields
    company_name: lead.companyName,
    company_size: lead.companyEmployeeCount,
    employee_count: lead.companyEmployeeCount,
    industry: lead.companyIndustry,
    company_industry: lead.companyIndustry,
    revenue_range: lead.companyRevenue,
    company_revenue: lead.companyRevenue,
    location: undefined, // Would need to be added to IntentLeadData
    country: undefined,
    // Data quality
    linkedin_url: lead.linkedinUrl,
    company_linkedin_url: lead.companyLinkedinUrl,
  }

  const value = fieldMap[field]
  if (value === undefined) return null
  return typeof value === 'string' ? value : value
}

/**
 * Check if a field value matches a preference
 */
function checkPreferenceMatch(
  value: string | number,
  preference: string,
  field: string
): { matches: boolean; reason: string } {
  const strValue = String(value).toLowerCase()

  // Seniority preferences
  if (field === 'seniority' || field === 'job_title') {
    // Check for level indicators
    if (preference.includes('director') && (strValue.includes('director') || strValue.includes('vp') || strValue.includes('vice president') || strValue.includes('chief') || strValue.includes('c-level'))) {
      return { matches: true, reason: 'Director+ level match' }
    }
    if (preference.includes('manager') && strValue.includes('manager')) {
      return { matches: true, reason: 'Manager level match' }
    }
    if (preference.includes('executive') && (strValue.includes('chief') || strValue.includes('c-level') || strValue.includes('ceo') || strValue.includes('cmo') || strValue.includes('cfo') || strValue.includes('coo'))) {
      return { matches: true, reason: 'Executive level match' }
    }
    if (preference.includes('founder') && strValue.includes('founder')) {
      return { matches: true, reason: 'Founder match' }
    }
    // Generic keyword check
    const keywords = preference.split(/[,\s]+/).filter(k => k.length > 2)
    for (const keyword of keywords) {
      if (strValue.includes(keyword)) {
        return { matches: true, reason: `Title contains "${keyword}"` }
      }
    }
  }

  // Company size preferences
  if (field === 'company_size' || field === 'employee_count') {
    const numValue = typeof value === 'number' ? value : parseEmployeeCountForPreference(String(value))
    if (numValue !== null) {
      // Check for range patterns like "50-200" or "under 100" or "over 500"
      if (preference.includes('under') || preference.includes('less than') || preference.includes('<')) {
        const match = preference.match(/(\d+)/)
        if (match && numValue < parseInt(match[1])) {
          return { matches: true, reason: `Under ${match[1]} employees` }
        }
      }
      if (preference.includes('over') || preference.includes('more than') || preference.includes('>')) {
        const match = preference.match(/(\d+)/)
        if (match && numValue > parseInt(match[1])) {
          return { matches: true, reason: `Over ${match[1]} employees` }
        }
      }
      // Range pattern: 50-200
      const rangeMatch = preference.match(/(\d+)\s*-\s*(\d+)/)
      if (rangeMatch) {
        const min = parseInt(rangeMatch[1])
        const max = parseInt(rangeMatch[2])
        if (numValue >= min && numValue <= max) {
          return { matches: true, reason: `${min}-${max} employee range` }
        }
      }
    }
  }

  // Industry preferences
  if (field === 'industry' || field === 'company_industry') {
    const keywords = preference.split(/[,\s]+/).filter(k => k.length > 2)
    for (const keyword of keywords) {
      if (strValue.includes(keyword)) {
        return { matches: true, reason: `Industry contains "${keyword}"` }
      }
    }
  }

  return { matches: false, reason: '' }
}

/**
 * Get base points for a field (used to calculate weighted adjustments)
 */
function getBasePointsForField(field: string): number {
  const pointsMap: Record<string, number> = {
    industry: 25,
    company_industry: 25,
    revenue_range: 20,
    company_revenue: 20,
    job_title: 20,
    seniority: 20,
    company_size: 15,
    employee_count: 15,
  }
  return pointsMap[field] || 10
}

/**
 * Parse employee count from string (helper for preference matching)
 */
function parseEmployeeCountForPreference(count: string): number | null {
  const str = count.toString().toLowerCase().replace(/[,+]/g, '')
  const rangeMatch = str.match(/(\d+)\s*-\s*(\d+)/)
  if (rangeMatch) {
    return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2
  }
  const num = parseInt(str)
  return isNaN(num) ? null : num
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export function getTierEmoji(tier: 'strong' | 'medium' | 'weak'): string {
  switch (tier) {
    case 'strong': return '🟢'
    case 'medium': return '🟡'
    case 'weak': return '🔴'
  }
}

export function getTierFromScore(score: number): 'strong' | 'medium' | 'weak' {
  if (score >= 70) return 'strong'
  if (score >= 40) return 'medium'
  return 'weak'
}
