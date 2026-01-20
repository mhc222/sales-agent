/**
 * Tenant Settings Helper
 * Utilities for fetching and managing tenant-specific credentials and settings
 */

import { createClient } from '@supabase/supabase-js'
import type { LLMProvider } from './llm/types'

// AudienceLab source configuration (up to 5 per tenant)
// DEPRECATED: Data sources are now configured at the campaign level
// Kept for backwards compatibility with existing tenants
export interface AudienceLabSource {
  name: string
  api_url: string
  api_key: string
  type: 'pixel' | 'intent'
  enabled?: boolean
  schedule_cron?: string
}

// =============================================================================
// Campaign-Level Data Source Types (NEW - campaign-centric architecture)
// =============================================================================

/** Data source types available at campaign level */
export type DataSourceType = 'intent' | 'pixel' | 'apollo' | 'csv' | 'manual'

/** Configuration for campaign data sources - varies by type */
export interface CampaignDataSourceConfig {
  // For intent/pixel sources (AudienceLab)
  api_url?: string
  api_key?: string
  // For apollo sources
  saved_search_id?: string
  // For CSV sources
  last_upload_at?: string
  // Manual sources have no config
}

// =============================================================================
// ICP (Ideal Customer Profile) Types - AI-generated from URL research
// =============================================================================

/** Priority level for account criteria items */
export type ICPPriority = 'high' | 'medium' | 'low'

/** A single criterion with its priority */
export interface ICPCriterionItem {
  value: string
  priority: ICPPriority
}

/** Account Criteria - defines the ideal company profile */
export interface AccountCriteria {
  company_types: ICPCriterionItem[]
  industries: ICPCriterionItem[]
  company_sizes: ICPCriterionItem[]
  locations: ICPCriterionItem[]
  revenue_ranges: ICPCriterionItem[]
  technologies: ICPCriterionItem[]
  prospecting_signals: ICPCriterionItem[]
}

/** A target persona with JTBD framework */
export interface ICPPersona {
  job_title: string
  job_to_be_done: string
  currently_they: string
  which_results_in: string
  how_we_solve: string
  additional_benefits: string
}

/** Data source for trigger detection */
export type TriggerSource = 'linkedin_personal' | 'linkedin_company' | 'perplexity'

/** A smart trigger - contextual signal indicating prospect readiness */
export interface ICPTrigger {
  name: string
  what_to_look_for: string[]  // Keywords, phrases, patterns to detect
  source: TriggerSource
  reasoning: string           // Why this trigger matters for this business
}

/** Complete ICP configuration - AI-generated from URL analysis */
export interface TenantICP {
  source_url?: string
  account_criteria?: AccountCriteria
  personas?: ICPPersona[]
  triggers?: ICPTrigger[]
  research_completed_at?: string
}

// Types for tenant settings
export interface TenantIntegrations {
  apollo?: {
    api_key?: string
    enabled?: boolean
  }
  smartlead?: {
    api_key?: string
    campaign_id?: string
    enabled?: boolean
  }
  nureply?: {
    api_key?: string
    lead_list_id?: string
    campaign_id?: string
    enabled?: boolean
    last_sync?: string
  }
  instantly?: {
    api_key?: string
    enabled?: boolean
  }
  heyreach?: {
    api_key?: string
    campaign_id?: string
    enabled?: boolean
  }
  gohighlevel?: {
    api_key?: string
    location_id?: string
    enabled?: boolean
  }
  // Legacy single-source configs (for backwards compat)
  pixel?: {
    api_url?: string
    api_key?: string
    enabled?: boolean
  }
  intent?: {
    api_url?: string
    api_key?: string
    enabled?: boolean
  }
  // New multi-source config (up to 5)
  audiencelab?: AudienceLabSource[]
}

export interface TenantDataSourcesConfig {
  enabled?: string[]
  auto_research_limit?: number
  min_intent_score?: number
}

/** LLM (AI Model) configuration - user provides their own API keys */
export interface TenantLLMConfig {
  provider: LLMProvider
  api_key: string
  model?: string // Optional model override
}

/** Targeting preference for lead scoring/prioritization */
export interface TargetingPreference {
  field: string
  preference: string
  weight?: number
  created_at?: string
  updated_at?: string
}

export interface TenantSettings {
  integrations?: TenantIntegrations
  data_sources?: TenantDataSourcesConfig
  // LLM configuration (AI provider)
  llm?: TenantLLMConfig
  // Active providers (selected during onboarding)
  email_provider?: 'smartlead' | 'nureply' | 'instantly' | string
  linkedin_provider?: 'heyreach' | string
  crm_provider?: 'gohighlevel' | string
  // Legacy aliases
  active_email_provider?: 'smartlead' | 'nureply' | 'instantly'
  active_linkedin_provider?: 'heyreach'
  // Onboarding state
  onboarding_completed?: boolean
  onboarding_step?: number
  // Channel configuration
  enabled_channels?: ('email' | 'linkedin')[]
  // ICP - AI-generated from URL research
  icp?: TenantICP
  // Targeting preferences - weights and prioritization for lead scoring
  targeting_preferences?: TargetingPreference[]
  // Misc
  research_sources?: string[]
  email_provider_config?: Record<string, unknown>
  linkedin_provider_config?: Record<string, unknown>
}

export interface Tenant {
  id: string
  name: string
  slug: string
  settings: TenantSettings | null
  created_at: string
  updated_at: string
}

// Create service client (bypasses RLS)
function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Get tenant settings by tenant ID
 */
export async function getTenantSettings(tenantId: string): Promise<Tenant | null> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single()

  if (error || !data) {
    console.error(`[TenantSettings] Failed to fetch tenant ${tenantId}:`, error)
    return null
  }

  return data as Tenant
}

/**
 * Get all tenants with a specific data source enabled
 */
export async function getTenantsWithDataSource(source: 'pixel' | 'intent' | 'apollo'): Promise<Tenant[]> {
  const supabase = getServiceClient()

  // Query tenants where settings->'data_sources'->'enabled' contains the source
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .filter('settings->data_sources->enabled', 'cs', `["${source}"]`)

  if (error) {
    console.error(`[TenantSettings] Failed to fetch tenants with ${source}:`, error)
    return []
  }

  return (data || []) as Tenant[]
}

/**
 * Get all tenants - used when we need to check credentials directly
 */
export async function getAllTenants(): Promise<Tenant[]> {
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('tenants')
    .select('*')

  if (error) {
    console.error('[TenantSettings] Failed to fetch all tenants:', error)
    return []
  }

  return (data || []) as Tenant[]
}

/**
 * Update tenant settings
 */
export async function updateTenantSettings(
  tenantId: string,
  settings: Partial<TenantSettings>
): Promise<boolean> {
  const supabase = getServiceClient()

  // Get current settings first
  const { data: current } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single()

  const updatedSettings = {
    ...(current?.settings || {}),
    ...settings,
  }

  const { error } = await supabase
    .from('tenants')
    .update({ settings: updatedSettings })
    .eq('id', tenantId)

  if (error) {
    console.error(`[TenantSettings] Failed to update tenant ${tenantId}:`, error)
    return false
  }

  return true
}

/**
 * Check if tenant has valid credentials for a data source
 */
export function hasValidCredentials(
  tenant: Tenant,
  source: 'pixel' | 'intent' | 'apollo'
): boolean {
  const integrations = tenant.settings?.integrations

  switch (source) {
    case 'pixel':
      return !!(integrations?.pixel?.api_url && integrations?.pixel?.api_key)
    case 'intent':
      return !!(integrations?.intent?.api_url && integrations?.intent?.api_key)
    case 'apollo':
      return !!integrations?.apollo?.api_key
    default:
      return false
  }
}

/**
 * Mask API key for display (show last 6 chars)
 */
export function maskApiKey(apiKey?: string): string | null {
  if (!apiKey) return null
  if (apiKey.length <= 6) return '******'
  return '●'.repeat(12) + apiKey.slice(-6)
}

/**
 * Get ICP for a lead - tries brand-specific ICP first, falls back to tenant ICP
 * This is the primary function agents should use to get ICP context
 */
export async function getICPForLead(tenantId: string, brandId?: string): Promise<TenantICP | null> {
  const supabase = getServiceClient()

  // 1. Try brand-specific ICP first
  if (brandId) {
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('icp')
      .eq('id', brandId)
      .single()

    if (!brandError && brand?.icp) {
      console.log(`[TenantSettings] Using brand-specific ICP for brand ${brandId}`)
      return brand.icp as TenantICP
    }
  }

  // 2. Fall back to tenant ICP
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant) {
    console.error(`[TenantSettings] Failed to fetch tenant ICP for ${tenantId}:`, tenantError)
    return null
  }

  const settings = tenant.settings as TenantSettings | null
  if (settings?.icp) {
    console.log(`[TenantSettings] Using tenant-level ICP for tenant ${tenantId}`)
    return settings.icp
  }

  console.log(`[TenantSettings] No ICP found for tenant ${tenantId}`)
  return null
}

/**
 * Format ICP for use in prompts
 * Creates a structured text representation of the ICP
 */
export function formatICPForPrompt(icp: TenantICP): string {
  const sections: string[] = []

  // Account Criteria
  if (icp.account_criteria) {
    const ac = icp.account_criteria
    const criteria: string[] = []

    if (ac.industries?.length) {
      const highPriority = ac.industries.filter(i => i.priority === 'high').map(i => i.value)
      criteria.push(`Industries (high priority): ${highPriority.join(', ') || 'Any'}`)
    }
    if (ac.company_sizes?.length) {
      const sizes = ac.company_sizes.filter(s => s.priority === 'high').map(s => s.value)
      criteria.push(`Company sizes: ${sizes.join(', ') || 'Any'}`)
    }
    if (ac.revenue_ranges?.length) {
      const revenues = ac.revenue_ranges.filter(r => r.priority === 'high').map(r => r.value)
      criteria.push(`Revenue ranges: ${revenues.join(', ') || 'Any'}`)
    }
    if (ac.prospecting_signals?.length) {
      const signals = ac.prospecting_signals.map(s => s.value)
      criteria.push(`Prospecting signals: ${signals.join(', ')}`)
    }

    if (criteria.length > 0) {
      sections.push(`ACCOUNT CRITERIA:\n${criteria.join('\n')}`)
    }
  }

  // Personas
  if (icp.personas?.length) {
    const personaDescriptions = icp.personas.map((p, i) => {
      return `Persona ${i + 1}: ${p.job_title}
  - Job to be done: ${p.job_to_be_done}
  - Currently they: ${p.currently_they}
  - Which results in: ${p.which_results_in}
  - How we solve: ${p.how_we_solve}`
    })
    sections.push(`TARGET PERSONAS:\n${personaDescriptions.join('\n\n')}`)
  }

  // Triggers
  if (icp.triggers?.length) {
    const triggerDescriptions = icp.triggers.map(t => {
      return `- ${t.name}: Look for ${t.what_to_look_for.join(', ')} (${t.source})`
    })
    sections.push(`BUYING TRIGGERS:\n${triggerDescriptions.join('\n')}`)
  }

  return sections.join('\n\n') || 'No ICP criteria defined'
}

// =============================================================================
// LLM Client Helpers
// =============================================================================

import { createLLMClient, type LLMClient } from './llm'

/**
 * Get an LLM client for a tenant
 * Uses the tenant's configured LLM provider and API key
 */
export async function getTenantLLM(tenantId: string): Promise<LLMClient> {
  const tenant = await getTenantSettings(tenantId)

  if (!tenant?.settings?.llm) {
    throw new Error(`Tenant ${tenantId} has no LLM configuration. Please complete onboarding to set up your AI provider.`)
  }

  const { provider, api_key, model } = tenant.settings.llm

  if (!provider || !api_key) {
    throw new Error(`Tenant ${tenantId} has incomplete LLM configuration. Please set up your AI provider in settings.`)
  }

  return createLLMClient({
    provider,
    apiKey: api_key,
    model,
  })
}

/**
 * Get an LLM client for a brand (falls back to tenant)
 * Checks brand settings first, then tenant settings
 */
export async function getLLMForBrand(tenantId: string, brandId?: string): Promise<LLMClient> {
  const supabase = getServiceClient()

  // 1. Try brand-specific LLM config first
  if (brandId) {
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('settings')
      .eq('id', brandId)
      .single()

    if (!brandError && brand?.settings?.llm) {
      const { provider, api_key, model } = brand.settings.llm
      if (provider && api_key) {
        console.log(`[TenantSettings] Using brand-specific LLM config for brand ${brandId}`)
        return createLLMClient({ provider, apiKey: api_key, model })
      }
    }
  }

  // 2. Fall back to tenant LLM config
  return getTenantLLM(tenantId)
}
