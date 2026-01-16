/**
 * Tenant Settings Helper
 * Utilities for fetching and managing tenant-specific credentials and settings
 */

import { createClient } from '@supabase/supabase-js'

// Types for tenant settings
export interface TenantIntegrations {
  apollo?: {
    api_key?: string
    enabled?: boolean
  }
  smartlead?: {
    api_key?: string
    campaign_id?: string
  }
  instantly?: {
    api_key?: string
  }
  heyreach?: {
    api_key?: string
  }
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
}

export interface TenantDataSourcesConfig {
  enabled?: string[]
  auto_research_limit?: number
  min_intent_score?: number
}

export interface TenantSettings {
  integrations?: TenantIntegrations
  data_sources?: TenantDataSourcesConfig
  active_email_provider?: 'smartlead' | 'instantly'
  active_linkedin_provider?: 'heyreach'
  onboarding_completed?: boolean
  research_sources?: string[]
  email_provider?: string
  email_provider_config?: Record<string, unknown>
  linkedin_provider?: string
  linkedin_provider_config?: Record<string, unknown>
  enabled_channels?: string[]
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
