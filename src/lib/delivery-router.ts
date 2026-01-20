/**
 * Delivery Router
 * Routes email and LinkedIn delivery based on tenant-configured provider settings.
 *
 * Each tenant can configure their own delivery tools via the `settings` JSONB column:
 * - email_provider: "smartlead" | "zapmail" | "instantly" | etc.
 * - linkedin_provider: "heyreach" | "phantombuster" | etc.
 *
 * The system provides intelligence (RAG + agents), delivery is routed through
 * the configured provider.
 */

import { supabase } from './supabase'
import * as smartlead from './smartlead'
import * as nureply from './nureply'
import * as heyreach from './heyreach'
import { checkLeadDuplicates } from './deduplication'

// ============================================================================
// TYPES
// ============================================================================

export interface TenantSettings {
  email_provider?: 'smartlead' | 'nureply' | 'zapmail' | 'instantly' | string
  email_provider_config?: Record<string, unknown>
  linkedin_provider?: 'heyreach' | 'phantombuster' | string
  linkedin_provider_config?: Record<string, unknown>
  research_sources?: string[]
  enabled_channels?: string[]
  integrations?: {
    smartlead?: {
      api_key: string
      campaign_id?: string
      enabled?: boolean
    }
    nureply?: {
      api_key: string
      lead_list_id?: string
      campaign_id?: string
      enabled?: boolean
      last_sync?: string
    }
    heyreach?: {
      api_key: string
      campaign_id?: string
      enabled?: boolean
    }
    apollo?: {
      api_key: string
      enabled?: boolean
    }
    // AudienceLab sources (up to 5)
    audiencelab?: Array<{
      name: string
      api_url: string
      api_key: string
      type: 'pixel' | 'intent'
      enabled?: boolean
      schedule_cron?: string
    }>
  }
}

export interface EmailSequenceDelivery {
  lead: {
    email: string
    first_name?: string
    last_name?: string
    company_name?: string
    linkedin_url?: string
  }
  sequence: Array<{
    emailNumber: number
    day: number
    subject: string
    body: string
  }>
  campaignId?: number // For providers that need a campaign ID
}

export interface LinkedInMessageDelivery {
  lead: {
    linkedin_url: string
    first_name?: string
    last_name?: string
  }
  messages: Array<{
    day: number
    message: string
  }>
}

export interface DeliveryResult {
  success: boolean
  provider: string
  providerResponse?: unknown
  error?: string
}

// ============================================================================
// TENANT SETTINGS
// ============================================================================

/**
 * Get tenant settings by tenant ID
 */
export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single()

  if (error) {
    console.error('[DeliveryRouter] Error fetching tenant settings:', error)
    return {}
  }

  return (tenant?.settings as TenantSettings) || {}
}

/**
 * Get tenant settings by tenant slug
 */
export async function getTenantSettingsBySlug(slug: string): Promise<{ tenantId: string; settings: TenantSettings }> {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, settings')
    .eq('slug', slug)
    .single()

  if (error) {
    console.error('[DeliveryRouter] Error fetching tenant by slug:', error)
    return { tenantId: '', settings: {} }
  }

  return {
    tenantId: tenant?.id || '',
    settings: (tenant?.settings as TenantSettings) || {},
  }
}

// ============================================================================
// EMAIL DELIVERY ADAPTERS
// ============================================================================

/**
 * Smartlead adapter - current implementation
 */
async function deliverViaSmartlead(delivery: EmailSequenceDelivery): Promise<DeliveryResult> {
  try {
    if (!delivery.campaignId) {
      return {
        success: false,
        provider: 'smartlead',
        error: 'Campaign ID is required for Smartlead delivery',
      }
    }

    // Transform sequence to Smartlead format with dynamic variables
    const customFields: Record<string, string> = {}

    // Map each email to custom fields
    delivery.sequence.forEach((email, index) => {
      const emailNum = index + 1
      customFields[`email_${emailNum}_body`] = email.body
      // Set subject for thread starters (emails 1 and 4)
      if (emailNum === 1) {
        customFields['thread_1_subject'] = email.subject
      } else if (emailNum === 4) {
        customFields['thread_2_subject'] = email.subject
      }
    })

    const result = await smartlead.addLeadToCampaign(delivery.campaignId, {
      email: delivery.lead.email,
      first_name: delivery.lead.first_name,
      last_name: delivery.lead.last_name,
      company_name: delivery.lead.company_name,
      linkedin_url: delivery.lead.linkedin_url,
      custom_fields: customFields,
    })

    return {
      success: result.ok,
      provider: 'smartlead',
      providerResponse: result,
      error: result.ok ? undefined : result.message,
    }
  } catch (err) {
    return {
      success: false,
      provider: 'smartlead',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Nureply adapter - uses template campaign with dynamic variables
 */
async function deliverViaNureply(
  tenantId: string,
  settings: TenantSettings,
  delivery: EmailSequenceDelivery
): Promise<DeliveryResult> {
  try {
    const nureplyConfig = settings.integrations?.nureply
    if (!nureplyConfig?.api_key) {
      return {
        success: false,
        provider: 'nureply',
        error: 'Nureply API key not configured',
      }
    }

    const config = { apiKey: nureplyConfig.api_key }

    // 1. Get or create lead list for this tenant
    let leadListId = nureplyConfig.lead_list_id
    if (!leadListId) {
      const list = await nureply.createLeadList(config, 'Sales Agent Leads')
      leadListId = list.id
      // Update tenant settings with lead list ID
      await updateTenantIntegration(tenantId, 'nureply', { lead_list_id: leadListId })
    }

    // 2. Check DNC before adding
    const dncCheck = await nureply.checkDNC(config, delivery.lead.email)
    if (dncCheck.blocked) {
      return {
        success: false,
        provider: 'nureply',
        error: 'Email is on DNC list',
      }
    }

    // 3. Transform sequence to Nureply format with dynamic variables
    const customFields: Record<string, string> = {}
    delivery.sequence.forEach((email, index) => {
      const emailNum = index + 1
      customFields[`email_${emailNum}_body`] = email.body
      // Set subject for thread starters (emails 1 and 4)
      if (emailNum === 1) {
        customFields['thread_1_subject'] = email.subject
      } else if (emailNum === 4) {
        customFields['thread_2_subject'] = email.subject
      }
    })

    // 4. Add lead to list with custom fields
    const result = await nureply.addLeadsToList(config, leadListId, [{
      email: delivery.lead.email,
      first_name: delivery.lead.first_name,
      last_name: delivery.lead.last_name,
      company_name: delivery.lead.company_name,
      linkedin_url: delivery.lead.linkedin_url,
      other_variables: customFields,
    }])

    return {
      success: result.success,
      provider: 'nureply',
      providerResponse: result,
      error: result.success ? undefined : result.errors?.join(', '),
    }
  } catch (err) {
    return {
      success: false,
      provider: 'nureply',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Helper to update tenant integration settings
 */
async function updateTenantIntegration(
  tenantId: string,
  integration: string,
  updates: Record<string, unknown>
): Promise<void> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single()

  if (!tenant) return

  const currentSettings = (tenant.settings as TenantSettings) || {}
  const currentIntegrations = currentSettings.integrations || {}
  const currentIntegration = (currentIntegrations as Record<string, Record<string, unknown>>)[integration] || {}

  await supabase
    .from('tenants')
    .update({
      settings: {
        ...currentSettings,
        integrations: {
          ...currentIntegrations,
          [integration]: {
            ...currentIntegration,
            ...updates,
          },
        },
      },
    })
    .eq('id', tenantId)
}

/**
 * Zapmail adapter - placeholder for future implementation
 */
async function deliverViaZapmail(_delivery: EmailSequenceDelivery): Promise<DeliveryResult> {
  // TODO: Implement Zapmail integration
  console.log('[DeliveryRouter] Zapmail delivery not yet implemented')
  return {
    success: false,
    provider: 'zapmail',
    error: 'Zapmail integration not yet implemented',
  }
}

/**
 * Instantly adapter - placeholder for future implementation
 */
async function deliverViaInstantly(_delivery: EmailSequenceDelivery): Promise<DeliveryResult> {
  // TODO: Implement Instantly integration
  console.log('[DeliveryRouter] Instantly delivery not yet implemented')
  return {
    success: false,
    provider: 'instantly',
    error: 'Instantly integration not yet implemented',
  }
}

// ============================================================================
// LINKEDIN DELIVERY ADAPTERS
// ============================================================================

/**
 * HeyReach adapter - LinkedIn automation
 */
async function deliverViaHeyReach(
  tenantId: string,
  settings: TenantSettings,
  delivery: LinkedInMessageDelivery
): Promise<DeliveryResult> {
  try {
    const heyreachConfig = settings.integrations?.heyreach
    if (!heyreachConfig?.api_key) {
      return {
        success: false,
        provider: 'heyreach',
        error: 'HeyReach API key not configured',
      }
    }

    const config = { apiKey: heyreachConfig.api_key }

    // 1. Get or use configured campaign
    let campaignId = heyreachConfig.campaign_id
    if (!campaignId) {
      // Find an active campaign or fail
      const activeCampaigns = await heyreach.getActiveCampaigns(config)
      if (activeCampaigns.length === 0) {
        return {
          success: false,
          provider: 'heyreach',
          error: 'No active HeyReach campaign found. Please create one in HeyReach first.',
        }
      }
      campaignId = activeCampaigns[0].id
      // Save for future use
      await updateTenantIntegration(tenantId, 'heyreach', { campaign_id: campaignId })
    }

    // 2. Format the lead for HeyReach
    const lead = heyreach.formatLeadForHeyReach(delivery.lead)
    if (!lead) {
      return {
        success: false,
        provider: 'heyreach',
        error: 'Lead missing LinkedIn URL',
      }
    }

    // 3. Add custom fields for message personalization
    if (delivery.messages?.length) {
      lead.customFields = {}
      delivery.messages.forEach((msg, i) => {
        lead.customFields![`message_${i + 1}`] = msg.message
      })
    }

    // 4. Add lead to campaign
    const result = await heyreach.addLeadToCampaign(config, {
      campaignId,
      linkedinUrl: lead.linkedinUrl,
      firstName: lead.firstName,
      lastName: lead.lastName,
      companyName: lead.companyName,
      jobTitle: lead.jobTitle,
      email: lead.email,
      customFields: lead.customFields,
    })

    return {
      success: result.success,
      provider: 'heyreach',
      providerResponse: result,
      error: result.error,
    }
  } catch (err) {
    return {
      success: false,
      provider: 'heyreach',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * PhantomBuster adapter - placeholder for future implementation
 */
async function deliverViaPhantomBuster(_delivery: LinkedInMessageDelivery): Promise<DeliveryResult> {
  // TODO: Implement PhantomBuster integration
  console.log('[DeliveryRouter] PhantomBuster delivery not yet implemented')
  return {
    success: false,
    provider: 'phantombuster',
    error: 'PhantomBuster integration not yet implemented',
  }
}

// ============================================================================
// MAIN ROUTER FUNCTIONS
// ============================================================================

/**
 * Route email delivery to the tenant's configured provider
 */
export async function deliverEmail(
  tenantId: string,
  delivery: EmailSequenceDelivery
): Promise<DeliveryResult> {
  // Check for duplicates before delivery
  const dedupResult = await checkLeadDuplicates(
    tenantId,
    delivery.lead.email,
    delivery.lead.linkedin_url
  )

  if (dedupResult.isDuplicate) {
    console.log(`[DeliveryRouter] Skipping duplicate lead: ${delivery.lead.email} - ${dedupResult.skipReason}`)
    return {
      success: false,
      provider: 'dedup',
      error: dedupResult.skipReason || 'Lead is a duplicate',
    }
  }

  const settings = await getTenantSettings(tenantId)
  const provider = settings.email_provider || 'smartlead' // Default to smartlead

  console.log(`[DeliveryRouter] Routing email delivery to provider: ${provider}`)

  switch (provider) {
    case 'smartlead':
      return deliverViaSmartlead(delivery)
    case 'nureply':
      return deliverViaNureply(tenantId, settings, delivery)
    case 'zapmail':
      return deliverViaZapmail(delivery)
    case 'instantly':
      return deliverViaInstantly(delivery)
    default:
      console.warn(`[DeliveryRouter] Unknown email provider: ${provider}, falling back to smartlead`)
      return deliverViaSmartlead(delivery)
  }
}

/**
 * Route LinkedIn delivery to the tenant's configured provider
 */
export async function deliverLinkedIn(
  tenantId: string,
  delivery: LinkedInMessageDelivery
): Promise<DeliveryResult> {
  // Check for duplicates before delivery (using LinkedIn URL)
  const dedupResult = await checkLeadDuplicates(
    tenantId,
    '', // No email for LinkedIn-only
    delivery.lead.linkedin_url
  )

  if (dedupResult.isDuplicate) {
    console.log(`[DeliveryRouter] Skipping duplicate LinkedIn lead: ${delivery.lead.linkedin_url} - ${dedupResult.skipReason}`)
    return {
      success: false,
      provider: 'dedup',
      error: dedupResult.skipReason || 'Lead is a duplicate',
    }
  }

  const settings = await getTenantSettings(tenantId)
  const provider = settings.linkedin_provider || 'heyreach' // Default to heyreach

  console.log(`[DeliveryRouter] Routing LinkedIn delivery to provider: ${provider}`)

  // Check if LinkedIn is enabled for this tenant
  const enabledChannels = settings.enabled_channels || ['email', 'linkedin']
  if (!enabledChannels.includes('linkedin')) {
    return {
      success: false,
      provider: provider,
      error: 'LinkedIn channel is not enabled for this tenant',
    }
  }

  switch (provider) {
    case 'heyreach':
      return deliverViaHeyReach(tenantId, settings, delivery)
    case 'phantombuster':
      return deliverViaPhantomBuster(delivery)
    default:
      console.warn(`[DeliveryRouter] Unknown LinkedIn provider: ${provider}, falling back to heyreach`)
      return deliverViaHeyReach(tenantId, settings, delivery)
  }
}

/**
 * Check if a channel is enabled for a tenant
 */
export async function isChannelEnabled(tenantId: string, channel: 'email' | 'linkedin'): Promise<boolean> {
  const settings = await getTenantSettings(tenantId)
  const enabledChannels = settings.enabled_channels || ['email', 'linkedin']
  return enabledChannels.includes(channel)
}

/**
 * Get the configured provider for a channel
 */
export async function getProviderForChannel(
  tenantId: string,
  channel: 'email' | 'linkedin'
): Promise<string | null> {
  const settings = await getTenantSettings(tenantId)

  if (channel === 'email') {
    return settings.email_provider || 'smartlead'
  } else if (channel === 'linkedin') {
    return settings.linkedin_provider || 'heyreach'
  }

  return null
}
