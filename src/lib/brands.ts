/**
 * Brands & Campaigns Module
 * Manages the Account → Brand → Campaign hierarchy
 */

import { supabase } from './supabase'
import type { CampaignMode } from './orchestration/types'

// ============================================================================
// TYPES
// ============================================================================

import type { TenantICP } from './tenant-settings'

export interface Brand {
  id: string
  tenant_id: string

  // Identity
  name: string
  description?: string
  website?: string
  logo_url?: string

  // Voice & Messaging
  voice_tone: 'professional' | 'casual' | 'formal' | 'friendly'
  value_proposition?: string
  key_differentiators?: string[]
  target_industries?: string[]
  target_titles?: string[]

  // Company Info
  company_size?: 'startup' | 'smb' | 'mid-market' | 'enterprise'
  founded_year?: number
  headquarters?: string

  // Brand-specific ICP (Ideal Customer Profile)
  icp?: TenantICP
  icp_source_url?: string
  icp_research_completed_at?: string

  // Status
  is_active: boolean

  // Timestamps
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  brand_id: string
  tenant_id: string

  // Identity
  name: string
  description?: string

  // Mode
  mode: CampaignMode

  // Campaign-Specific Instructions
  custom_instructions?: string
  target_persona?: string
  primary_angle?: string

  // Email Settings
  email_count: number
  email_tone?: string
  email_cta?: string

  // LinkedIn Settings
  linkedin_count: number
  linkedin_connection_note_enabled: boolean

  // Multi-Channel Settings
  linkedin_first: boolean
  wait_for_connection: boolean
  connection_timeout_hours: number

  // Platform Integration
  smartlead_campaign_id?: string
  heyreach_campaign_id?: string

  // Status
  status: 'draft' | 'active' | 'paused' | 'completed'
  is_active: boolean

  // Stats
  total_leads: number
  leads_contacted: number
  leads_replied: number
  leads_converted: number

  // Timestamps
  created_at: string
  activated_at?: string
  paused_at?: string
  updated_at: string
}

export interface CampaignTemplate {
  id: string
  tenant_id?: string
  name: string
  description?: string
  mode: CampaignMode
  custom_instructions?: string
  target_persona?: string
  primary_angle?: string
  email_count: number
  linkedin_count: number
  linkedin_first: boolean
  wait_for_connection: boolean
  connection_timeout_hours: number
  category?: string
  tags?: string[]
  times_used: number
  created_at: string
  updated_at: string
}

// ============================================================================
// BRAND FUNCTIONS
// ============================================================================

/**
 * Get all brands for a tenant
 */
export async function getBrands(tenantId: string): Promise<Brand[]> {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name')

  if (error) {
    console.error('[Brands] Error fetching brands:', error)
    throw new Error(`Failed to fetch brands: ${error.message}`)
  }

  return data as Brand[]
}

/**
 * Get a single brand by ID
 */
export async function getBrand(brandId: string): Promise<Brand | null> {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('[Brands] Error fetching brand:', error)
    throw new Error(`Failed to fetch brand: ${error.message}`)
  }

  return data as Brand
}

/**
 * Create a new brand
 */
export async function createBrand(
  tenantId: string,
  brand: Partial<Omit<Brand, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>
): Promise<Brand> {
  const { data, error } = await supabase
    .from('brands')
    .insert({
      tenant_id: tenantId,
      ...brand,
    })
    .select()
    .single()

  if (error) {
    console.error('[Brands] Error creating brand:', error)
    throw new Error(`Failed to create brand: ${error.message}`)
  }

  return data as Brand
}

/**
 * Update a brand
 */
export async function updateBrand(
  brandId: string,
  updates: Partial<Omit<Brand, 'id' | 'tenant_id' | 'created_at'>>
): Promise<Brand> {
  const { data, error } = await supabase
    .from('brands')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', brandId)
    .select()
    .single()

  if (error) {
    console.error('[Brands] Error updating brand:', error)
    throw new Error(`Failed to update brand: ${error.message}`)
  }

  return data as Brand
}

/**
 * Delete a brand (soft delete by setting is_active = false)
 */
export async function deleteBrand(brandId: string): Promise<void> {
  const { error } = await supabase
    .from('brands')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', brandId)

  if (error) {
    console.error('[Brands] Error deleting brand:', error)
    throw new Error(`Failed to delete brand: ${error.message}`)
  }
}

// ============================================================================
// CAMPAIGN FUNCTIONS
// ============================================================================

/**
 * Get all campaigns for a brand
 */
export async function getCampaigns(brandId: string): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Campaigns] Error fetching campaigns:', error)
    throw new Error(`Failed to fetch campaigns: ${error.message}`)
  }

  return data as Campaign[]
}

/**
 * Get a single campaign by ID
 */
export async function getCampaign(campaignId: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('[Campaigns] Error fetching campaign:', error)
    throw new Error(`Failed to fetch campaign: ${error.message}`)
  }

  return data as Campaign
}

/**
 * Get campaign with brand info
 */
export async function getCampaignWithBrand(campaignId: string): Promise<(Campaign & { brand: Brand }) | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select(`
      *,
      brand:brands(*)
    `)
    .eq('id', campaignId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('[Campaigns] Error fetching campaign with brand:', error)
    throw new Error(`Failed to fetch campaign: ${error.message}`)
  }

  return data as Campaign & { brand: Brand }
}

/**
 * Create a new campaign
 */
export async function createCampaign(
  brandId: string,
  campaign: Partial<Omit<Campaign, 'id' | 'brand_id' | 'tenant_id' | 'created_at' | 'updated_at'>>
): Promise<Campaign> {
  // Get tenant from brand
  const { data: brand } = await supabase
    .from('brands')
    .select('tenant_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    throw new Error('Brand not found')
  }

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      brand_id: brandId,
      tenant_id: brand.tenant_id,
      ...campaign,
    })
    .select()
    .single()

  if (error) {
    console.error('[Campaigns] Error creating campaign:', error)
    throw new Error(`Failed to create campaign: ${error.message}`)
  }

  return data as Campaign
}

/**
 * Create campaign from template
 */
export async function createCampaignFromTemplate(
  templateId: string,
  brandId: string,
  name: string
): Promise<Campaign> {
  const { data, error } = await supabase.rpc('clone_campaign_template', {
    p_template_id: templateId,
    p_brand_id: brandId,
    p_name: name,
  })

  if (error) {
    console.error('[Campaigns] Error cloning template:', error)
    throw new Error(`Failed to create campaign from template: ${error.message}`)
  }

  // Fetch the created campaign
  return getCampaign(data) as Promise<Campaign>
}

/**
 * Update a campaign
 */
export async function updateCampaign(
  campaignId: string,
  updates: Partial<Omit<Campaign, 'id' | 'brand_id' | 'tenant_id' | 'created_at'>>
): Promise<Campaign> {
  const { data, error } = await supabase
    .from('campaigns')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)
    .select()
    .single()

  if (error) {
    console.error('[Campaigns] Error updating campaign:', error)
    throw new Error(`Failed to update campaign: ${error.message}`)
  }

  return data as Campaign
}

/**
 * Activate a campaign
 */
export async function activateCampaign(campaignId: string): Promise<Campaign> {
  return updateCampaign(campaignId, {
    status: 'active',
    is_active: true,
    activated_at: new Date().toISOString(),
  })
}

/**
 * Pause a campaign
 */
export async function pauseCampaign(campaignId: string): Promise<Campaign> {
  return updateCampaign(campaignId, {
    status: 'paused',
    paused_at: new Date().toISOString(),
  })
}

/**
 * Update campaign stats
 */
export async function updateCampaignStats(
  campaignId: string,
  stats: Partial<Pick<Campaign, 'total_leads' | 'leads_contacted' | 'leads_replied' | 'leads_converted'>>
): Promise<void> {
  const { error } = await supabase
    .from('campaigns')
    .update({
      ...stats,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)

  if (error) {
    console.error('[Campaigns] Error updating stats:', error)
  }
}

/**
 * Increment a campaign stat
 */
export async function incrementCampaignStat(
  campaignId: string,
  stat: 'total_leads' | 'leads_contacted' | 'leads_replied' | 'leads_converted'
): Promise<void> {
  const { error } = await supabase.rpc(`increment_campaign_${stat}`, {
    campaign_uuid: campaignId,
  })

  // Fallback to manual increment if RPC doesn't exist
  if (error) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select(stat)
      .eq('id', campaignId)
      .single()

    if (campaign) {
      await supabase
        .from('campaigns')
        .update({
          [stat]: ((campaign as Record<string, number>)[stat] || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
    }
  }
}

// ============================================================================
// TEMPLATE FUNCTIONS
// ============================================================================

/**
 * Get all campaign templates (global + tenant-specific)
 */
export async function getCampaignTemplates(tenantId?: string): Promise<CampaignTemplate[]> {
  let query = supabase
    .from('campaign_templates')
    .select('*')
    .order('name')

  if (tenantId) {
    query = query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
  } else {
    query = query.is('tenant_id', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('[Templates] Error fetching templates:', error)
    throw new Error(`Failed to fetch templates: ${error.message}`)
  }

  return data as CampaignTemplate[]
}

/**
 * Get templates by mode
 */
export async function getCampaignTemplatesByMode(
  mode: CampaignMode,
  tenantId?: string
): Promise<CampaignTemplate[]> {
  let query = supabase
    .from('campaign_templates')
    .select('*')
    .eq('mode', mode)
    .order('name')

  if (tenantId) {
    query = query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
  } else {
    query = query.is('tenant_id', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('[Templates] Error fetching templates:', error)
    throw new Error(`Failed to fetch templates: ${error.message}`)
  }

  return data as CampaignTemplate[]
}

// ============================================================================
// RAG HELPERS
// ============================================================================

/**
 * Get RAG documents for a brand
 */
export async function getBrandRagDocuments(brandId: string): Promise<Array<{
  id: string
  rag_type: string
  content: string
  metadata: Record<string, unknown>
}>> {
  const { data, error } = await supabase
    .from('rag_documents')
    .select('id, rag_type, content, metadata')
    .eq('brand_id', brandId)

  if (error) {
    console.error('[RAG] Error fetching brand RAG:', error)
    return []
  }

  return data || []
}

/**
 * Associate RAG document with a brand
 */
export async function associateRagWithBrand(ragDocumentId: string, brandId: string): Promise<void> {
  const { error } = await supabase
    .from('rag_documents')
    .update({ brand_id: brandId })
    .eq('id', ragDocumentId)

  if (error) {
    console.error('[RAG] Error associating RAG with brand:', error)
    throw new Error(`Failed to associate RAG: ${error.message}`)
  }
}
