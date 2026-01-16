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

// ============================================================================
// TYPES
// ============================================================================

export interface TenantSettings {
  email_provider?: 'smartlead' | 'zapmail' | 'instantly' | string
  email_provider_config?: Record<string, unknown>
  linkedin_provider?: 'heyreach' | 'phantombuster' | string
  linkedin_provider_config?: Record<string, unknown>
  research_sources?: string[]
  enabled_channels?: string[]
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
 * HeyReach adapter - placeholder for future implementation
 */
async function deliverViaHeyReach(_delivery: LinkedInMessageDelivery): Promise<DeliveryResult> {
  // TODO: Implement HeyReach integration
  console.log('[DeliveryRouter] HeyReach delivery not yet implemented')
  return {
    success: false,
    provider: 'heyreach',
    error: 'HeyReach integration not yet implemented',
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
  const settings = await getTenantSettings(tenantId)
  const provider = settings.email_provider || 'smartlead' // Default to smartlead

  console.log(`[DeliveryRouter] Routing email delivery to provider: ${provider}`)

  switch (provider) {
    case 'smartlead':
      return deliverViaSmartlead(delivery)
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
      return deliverViaHeyReach(delivery)
    case 'phantombuster':
      return deliverViaPhantomBuster(delivery)
    default:
      console.warn(`[DeliveryRouter] Unknown LinkedIn provider: ${provider}, falling back to heyreach`)
      return deliverViaHeyReach(delivery)
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
