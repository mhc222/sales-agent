/**
 * Data Normalization Layer
 * Standardizes data from different sources (pixel, intent, Apollo) for Agent 1 qualification
 */

export type LeadSource = 'pixel' | 'intent' | 'apollo' | 'manual'

export interface NormalizedLead {
  // Person
  firstName: string
  lastName: string
  email: string
  jobTitle: string | null
  headline: string | null
  department: string | null
  seniorityLevel: string | null
  linkedinUrl: string | null
  yearsExperience: number | null

  // Company
  companyName: string
  companyDomain: string | null
  companyIndustry: string | null
  companyEmployeeCount: number | null
  companyRevenue: string | null
  companyDescription: string | null
  companyLinkedinUrl: string | null

  // Intent & Source
  source: LeadSource
  intentSignals: IntentSignals | null
  intentScore: number | null
  visitCount: number

  // Tenant
  tenantId: string

  // Raw data preserved for debugging
  rawData: Record<string, unknown>
}

export interface IntentSignals {
  pageVisited?: string
  timeOnPage?: number
  eventType?: string
  // Intent-specific fields
  tier?: 'strong' | 'medium' | 'weak'
  breakdown?: {
    industry: number
    revenue: number
    title: number
    companySize: number
    dataQuality: number
  }
  reasoning?: string[]
  batchDate?: string
  batchRank?: number
  autoResearch?: boolean
}

/**
 * Clean and trim string values, return null for empty strings
 */
function cleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

/**
 * Parse employee count to a number, handling various formats
 * Examples: "50", "50-100", "100+", "1000", "1,000"
 */
function parseEmployeeCount(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value

  const str = String(value).replace(/,/g, '').trim()

  // Handle range formats like "50-100" - take the average
  if (str.includes('-')) {
    const parts = str.split('-').map((p) => parseInt(p.trim(), 10))
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return Math.round((parts[0] + parts[1]) / 2)
    }
  }

  // Handle "100+" format
  const numMatch = str.match(/^(\d+)/)
  if (numMatch) {
    return parseInt(numMatch[1], 10)
  }

  return null
}

/**
 * Normalize revenue string to consistent format
 * Examples: "$1M", "$1-5M", "$10M+", "1000000"
 */
function normalizeRevenue(value: unknown): string | null {
  if (value === null || value === undefined) return null

  const str = String(value).trim()
  if (str.length === 0) return null

  // If it's already formatted nicely, return as-is
  if (str.match(/^\$?\d+[KMB]?(-\d+[KMB]?)?\+?$/i)) {
    return str
  }

  // Try to parse raw number
  const num = parseFloat(str.replace(/[$,]/g, ''))
  if (!isNaN(num)) {
    if (num >= 1_000_000_000) return `$${Math.round(num / 1_000_000_000)}B`
    if (num >= 1_000_000) return `$${Math.round(num / 1_000_000)}M`
    if (num >= 1_000) return `$${Math.round(num / 1_000)}K`
    return `$${num}`
  }

  return str
}

/**
 * Log warning for missing critical fields
 */
function warnMissing(source: LeadSource, field: string, email?: string): void {
  const identifier = email || 'unknown'
  console.warn(`[Normalizer] Missing critical field "${field}" for ${source} lead: ${identifier}`)
}

/**
 * Normalize pixel visitor data from workflow1
 */
export function normalizePixelVisitor(raw: Record<string, unknown>): NormalizedLead {
  const email = cleanString(raw.email)
  const companyName = cleanString(raw.company_name)

  if (!email) warnMissing('pixel', 'email')
  if (!companyName) warnMissing('pixel', 'company_name', email || undefined)

  // Extract intent signal from raw data
  const intentSignalRaw = raw.intent_signal as Record<string, unknown> | undefined

  const intentSignals: IntentSignals | null = intentSignalRaw
    ? {
        pageVisited: cleanString(intentSignalRaw.page_visited) || undefined,
        timeOnPage: typeof intentSignalRaw.time_on_page === 'number' ? intentSignalRaw.time_on_page : undefined,
        eventType: cleanString(intentSignalRaw.event_type) || undefined,
      }
    : null

  return {
    // Person
    firstName: cleanString(raw.first_name) || '',
    lastName: cleanString(raw.last_name) || '',
    email: email || '',
    jobTitle: cleanString(raw.job_title),
    headline: cleanString(raw.headline),
    department: cleanString(raw.department),
    seniorityLevel: cleanString(raw.seniority_level),
    linkedinUrl: cleanString(raw.linkedin_url),
    yearsExperience: typeof raw.years_experience === 'number' ? raw.years_experience : null,

    // Company
    companyName: companyName || '',
    companyDomain: cleanString(raw.company_domain),
    companyIndustry: cleanString(raw.company_industry),
    companyEmployeeCount: parseEmployeeCount(raw.company_employee_count),
    companyRevenue: normalizeRevenue(raw.company_revenue),
    companyDescription: cleanString(raw.company_description),
    companyLinkedinUrl: cleanString(raw.company_linkedin_url),

    // Intent & Source
    source: 'pixel',
    intentSignals,
    intentScore: null, // Calculated later for pixel leads
    visitCount: 1, // Will be updated by workflow

    // Tenant
    tenantId: cleanString(raw.tenant_id) || '',

    // Raw data
    rawData: raw,
  }
}

/**
 * Normalize intent data from workflow0 (AudienceLab)
 */
export function normalizeIntentData(raw: Record<string, unknown>): NormalizedLead {
  const email = cleanString(raw.email)
  const companyName = cleanString(raw.company_name)

  if (!email) warnMissing('intent', 'email')
  if (!companyName) warnMissing('intent', 'company_name', email || undefined)

  // Extract intent-specific fields
  const intentBreakdown = raw.intent_breakdown as {
    industry: number
    revenue: number
    title: number
    companySize: number
    dataQuality: number
  } | undefined

  const intentSignals: IntentSignals = {
    tier: raw.intent_tier as 'strong' | 'medium' | 'weak' | undefined,
    breakdown: intentBreakdown,
    reasoning: Array.isArray(raw.intent_reasoning) ? raw.intent_reasoning as string[] : undefined,
    batchDate: cleanString(raw.batch_date) || undefined,
    batchRank: typeof raw.batch_rank === 'number' ? raw.batch_rank : undefined,
    autoResearch: typeof raw.auto_research === 'boolean' ? raw.auto_research : undefined,
  }

  return {
    // Person
    firstName: cleanString(raw.first_name) || '',
    lastName: cleanString(raw.last_name) || '',
    email: email || '',
    jobTitle: cleanString(raw.job_title),
    headline: cleanString(raw.headline),
    department: cleanString(raw.department),
    seniorityLevel: cleanString(raw.seniority_level),
    linkedinUrl: cleanString(raw.linkedin_url),
    yearsExperience: typeof raw.years_experience === 'number' ? raw.years_experience : null,

    // Company
    companyName: companyName || '',
    companyDomain: cleanString(raw.company_domain),
    companyIndustry: cleanString(raw.company_industry),
    companyEmployeeCount: parseEmployeeCount(raw.company_employee_count),
    companyRevenue: normalizeRevenue(raw.company_revenue),
    companyDescription: cleanString(raw.company_description),
    companyLinkedinUrl: cleanString(raw.company_linkedin_url),

    // Intent & Source
    source: 'intent',
    intentSignals,
    intentScore: typeof raw.intent_score === 'number' ? raw.intent_score : null,
    visitCount: 0, // Intent leads don't have pixel visits

    // Tenant
    tenantId: cleanString(raw.tenant_id) || '',

    // Raw data
    rawData: raw,
  }
}

/**
 * Normalize Apollo enrichment data (stub for future implementation)
 */
export function normalizeApolloLead(raw: Record<string, unknown>): NormalizedLead {
  const email = cleanString(raw.email)
  const companyName = cleanString(raw.company_name) || cleanString(raw.organization_name)

  if (!email) warnMissing('apollo', 'email')
  if (!companyName) warnMissing('apollo', 'company_name', email || undefined)

  // Apollo field mapping (based on typical Apollo API response)
  // This is a stub - actual field names may vary
  return {
    // Person
    firstName: cleanString(raw.first_name) || '',
    lastName: cleanString(raw.last_name) || '',
    email: email || '',
    jobTitle: cleanString(raw.title) || cleanString(raw.job_title),
    headline: cleanString(raw.headline),
    department: cleanString(raw.department) || cleanString(Array.isArray(raw.departments) ? raw.departments[0] : null),
    seniorityLevel: cleanString(raw.seniority) || cleanString(raw.seniority_level),
    linkedinUrl: cleanString(raw.linkedin_url) || cleanString(raw.person_linkedin_url),
    yearsExperience: null, // Apollo may not provide this

    // Company
    companyName: companyName || '',
    companyDomain: cleanString(raw.domain) || cleanString(raw.company_domain),
    companyIndustry: cleanString(raw.industry) || cleanString(raw.company_industry),
    companyEmployeeCount: parseEmployeeCount(raw.employee_count) || parseEmployeeCount(raw.company_employee_count),
    companyRevenue: normalizeRevenue(raw.estimated_revenue) || normalizeRevenue(raw.company_revenue),
    companyDescription: cleanString(raw.company_description) || cleanString(raw.organization_short_description),
    companyLinkedinUrl: cleanString(raw.company_linkedin_url) || cleanString(raw.organization_linkedin_url),

    // Intent & Source
    source: 'apollo',
    intentSignals: null,
    intentScore: null,
    visitCount: 0,

    // Tenant
    tenantId: cleanString(raw.tenant_id) || '',

    // Raw data
    rawData: raw,
  }
}

/**
 * Normalize manual lead entry
 */
export function normalizeManualLead(raw: Record<string, unknown>): NormalizedLead {
  const email = cleanString(raw.email)
  const companyName = cleanString(raw.company_name)

  if (!email) warnMissing('manual', 'email')
  if (!companyName) warnMissing('manual', 'company_name', email || undefined)

  return {
    // Person
    firstName: cleanString(raw.first_name) || cleanString(raw.firstName) || '',
    lastName: cleanString(raw.last_name) || cleanString(raw.lastName) || '',
    email: email || '',
    jobTitle: cleanString(raw.job_title) || cleanString(raw.jobTitle),
    headline: cleanString(raw.headline),
    department: cleanString(raw.department),
    seniorityLevel: cleanString(raw.seniority_level) || cleanString(raw.seniorityLevel),
    linkedinUrl: cleanString(raw.linkedin_url) || cleanString(raw.linkedinUrl),
    yearsExperience: typeof raw.years_experience === 'number' ? raw.years_experience : null,

    // Company
    companyName: companyName || '',
    companyDomain: cleanString(raw.company_domain) || cleanString(raw.companyDomain),
    companyIndustry: cleanString(raw.company_industry) || cleanString(raw.companyIndustry),
    companyEmployeeCount: parseEmployeeCount(raw.company_employee_count) || parseEmployeeCount(raw.companyEmployeeCount),
    companyRevenue: normalizeRevenue(raw.company_revenue) || normalizeRevenue(raw.companyRevenue),
    companyDescription: cleanString(raw.company_description) || cleanString(raw.companyDescription),
    companyLinkedinUrl: cleanString(raw.company_linkedin_url) || cleanString(raw.companyLinkedinUrl),

    // Intent & Source
    source: 'manual',
    intentSignals: null,
    intentScore: null,
    visitCount: 0,

    // Tenant
    tenantId: cleanString(raw.tenant_id) || cleanString(raw.tenantId) || '',

    // Raw data
    rawData: raw,
  }
}

/**
 * Main normalizer function - routes to appropriate source-specific normalizer
 */
export function normalizeLead(
  raw: Record<string, unknown>,
  source: LeadSource
): NormalizedLead {
  switch (source) {
    case 'pixel':
      return normalizePixelVisitor(raw)
    case 'intent':
      return normalizeIntentData(raw)
    case 'apollo':
      return normalizeApolloLead(raw)
    case 'manual':
      return normalizeManualLead(raw)
    default:
      console.warn(`[Normalizer] Unknown source "${source}", using manual normalizer`)
      return normalizeManualLead(raw)
  }
}
