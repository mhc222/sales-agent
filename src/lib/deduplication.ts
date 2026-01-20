/**
 * Lead Deduplication Service
 * Unified service for checking lead duplicates across all platforms before sequence deployment
 *
 * Checks in parallel:
 * 1. Local leads table (by email or LinkedIn URL)
 * 2. GHL contacts (if configured)
 * 3. SmartLead campaign (if configured)
 * 4. HeyReach campaign (if configured)
 */

import { supabase } from './supabase'
import { getTenantSettings, type TenantSettings, type TenantIntegrations } from './tenant-settings'
import * as ghl from './gohighlevel'
import * as smartlead from './smartlead'
import * as heyreach from './heyreach'
import { isOnDNC } from './dnc'

// ============================================================================
// TYPES
// ============================================================================

export interface DedupeResult {
  isDuplicate: boolean
  existsIn: {
    dnc?: {
      blocked: boolean
      reason?: string
    }
    local?: {
      leadId: string
      status?: string
    }
    ghl?: {
      contactId: string
      hasSkipTag?: boolean
    }
    smartlead?: {
      found: boolean
    }
    heyreach?: {
      found: boolean
    }
  }
  skipReason?: string
}

interface LocalLeadMatch {
  id: string
  status?: string
  email_unsubscribed?: boolean
}

// ============================================================================
// LOCAL DATABASE CHECK
// ============================================================================

/**
 * Check if lead exists in local database
 */
async function checkLocalLead(
  tenantId: string,
  email?: string,
  linkedinUrl?: string
): Promise<LocalLeadMatch | null> {
  // Build query for email or LinkedIn URL match
  let query = supabase
    .from('leads')
    .select('id, status, email_unsubscribed')
    .eq('tenant_id', tenantId)

  if (email && linkedinUrl) {
    // Check both
    query = query.or(`email.eq.${email},linkedin_url.eq.${linkedinUrl}`)
  } else if (email) {
    query = query.eq('email', email)
  } else if (linkedinUrl) {
    query = query.eq('linkedin_url', linkedinUrl)
  } else {
    return null
  }

  const { data, error } = await query.limit(1).maybeSingle()

  if (error) {
    console.error('[Dedup] Error checking local leads:', error)
    return null
  }

  return data
}

// ============================================================================
// GHL CHECK
// ============================================================================

/**
 * Check if contact exists in GHL
 */
async function checkGHLContact(
  integrations: TenantIntegrations,
  email: string
): Promise<{ exists: boolean; contactId?: string; shouldSkip?: boolean; skipReason?: string } | null> {
  const ghlConfig = integrations.gohighlevel
  if (!ghlConfig?.api_key || !ghlConfig?.location_id) {
    return null // GHL not configured
  }

  try {
    const result = await ghl.checkContactForDedup(
      { apiKey: ghlConfig.api_key, locationId: ghlConfig.location_id },
      email
    )
    return {
      exists: result.exists,
      contactId: result.contactId,
      shouldSkip: result.shouldSkip,
      skipReason: result.skipReason,
    }
  } catch (error) {
    console.error('[Dedup] Error checking GHL contact:', error)
    return null
  }
}

// ============================================================================
// SMARTLEAD CHECK
// ============================================================================

/**
 * Check if lead exists in SmartLead campaign
 */
async function checkSmartLeadLead(
  integrations: TenantIntegrations,
  email: string
): Promise<{ found: boolean } | null> {
  const smartleadConfig = integrations.smartlead
  if (!smartleadConfig?.api_key || !smartleadConfig?.campaign_id) {
    return null // SmartLead not configured
  }

  try {
    // Use getLeadByEmail to check if lead exists
    const campaignId = parseInt(smartleadConfig.campaign_id)
    const lead = await smartlead.getLeadByEmail(campaignId, email)
    return { found: !!lead }
  } catch (error) {
    console.error('[Dedup] Error checking SmartLead:', error)
    return null
  }
}

// ============================================================================
// HEYREACH CHECK
// ============================================================================

/**
 * Check if lead exists in HeyReach campaign
 */
async function checkHeyReachLead(
  integrations: TenantIntegrations,
  linkedinUrl?: string
): Promise<{ found: boolean } | null> {
  if (!linkedinUrl) {
    return null // No LinkedIn URL to check
  }

  const heyreachConfig = integrations.heyreach
  if (!heyreachConfig?.api_key) {
    return null // HeyReach not configured
  }

  try {
    const config = { apiKey: heyreachConfig.api_key }
    const leadDetails = await heyreach.getLeadDetails(config, linkedinUrl)
    return { found: !!leadDetails }
  } catch (error) {
    console.error('[Dedup] Error checking HeyReach:', error)
    return null
  }
}

// ============================================================================
// MAIN DEDUP CHECK
// ============================================================================

/**
 * Check if lead is a duplicate across all configured platforms
 * Returns whether the lead should be skipped and where it was found
 *
 * @param tenantId - The tenant ID
 * @param email - Lead email address
 * @param linkedinUrl - Optional LinkedIn URL
 * @param brandId - Optional brand ID for brand-specific DNC checking
 */
export async function checkLeadDuplicates(
  tenantId: string,
  email: string,
  linkedinUrl?: string,
  brandId?: string
): Promise<DedupeResult> {
  console.log(`[Dedup] Checking duplicates for email=${email}, linkedin=${linkedinUrl || 'none'}, brand=${brandId || 'none'}`)

  // Build result object
  const result: DedupeResult = {
    isDuplicate: false,
    existsIn: {},
  }

  // FIRST: Check DNC list (email and domain) - this is the highest priority check
  if (email) {
    const dncResult = await isOnDNC(tenantId, email, brandId)
    if (dncResult.blocked) {
      console.log(`[Dedup] Email ${email} blocked by DNC: ${dncResult.reason}`)
      result.existsIn.dnc = { blocked: true, reason: dncResult.reason }
      result.isDuplicate = true
      result.skipReason = dncResult.reason
      return result // Early return - DNC is final
    }
  }

  // Get tenant settings to determine which integrations are configured
  const tenant = await getTenantSettings(tenantId)
  if (!tenant) {
    console.error(`[Dedup] Tenant ${tenantId} not found`)
    return result
  }

  const integrations = tenant.settings?.integrations || {}

  // Run remaining checks in parallel
  const [localResult, ghlResult, smartleadResult, heyreachResult] = await Promise.all([
    checkLocalLead(tenantId, email, linkedinUrl),
    email ? checkGHLContact(integrations, email) : Promise.resolve(null),
    email ? checkSmartLeadLead(integrations, email) : Promise.resolve(null),
    checkHeyReachLead(integrations, linkedinUrl),
  ])

  // Check local database
  if (localResult) {
    result.existsIn.local = {
      leadId: localResult.id,
      status: localResult.status,
    }

    // Check if lead is unsubscribed or in a terminal status
    if (localResult.email_unsubscribed) {
      result.isDuplicate = true
      result.skipReason = 'Lead is unsubscribed'
    } else if (['unsubscribed', 'not_interested', 'bounced'].includes(localResult.status || '')) {
      result.isDuplicate = true
      result.skipReason = `Lead has status: ${localResult.status}`
    }
  }

  // Check GHL
  if (ghlResult?.exists) {
    result.existsIn.ghl = {
      contactId: ghlResult.contactId!,
      hasSkipTag: ghlResult.shouldSkip,
    }

    if (ghlResult.shouldSkip && !result.isDuplicate) {
      result.isDuplicate = true
      result.skipReason = ghlResult.skipReason
    }
  }

  // Check SmartLead
  if (smartleadResult?.found) {
    result.existsIn.smartlead = { found: true }
    // Note: Finding in SmartLead doesn't automatically mean skip
    // The lead might be in a sequence already
  }

  // Check HeyReach
  if (heyreachResult?.found) {
    result.existsIn.heyreach = { found: true }
    // Note: Finding in HeyReach doesn't automatically mean skip
    // The lead might be in a LinkedIn sequence already
  }

  // If found in any sequence platform but not marked as skip, still consider it a duplicate
  // to avoid sending the same lead through multiple campaigns
  if (!result.isDuplicate && (smartleadResult?.found || heyreachResult?.found)) {
    result.isDuplicate = true
    result.skipReason = `Lead already in ${smartleadResult?.found ? 'SmartLead' : 'HeyReach'} campaign`
  }

  console.log(`[Dedup] Result: isDuplicate=${result.isDuplicate}, skipReason=${result.skipReason || 'none'}`)

  return result
}

/**
 * Quick check if lead should be skipped (simplified version for high-volume use)
 * Checks: DNC list, local DB, and GHL
 *
 * @param tenantId - The tenant ID
 * @param email - Lead email address
 * @param brandId - Optional brand ID for brand-specific DNC checking
 */
export async function shouldSkipLead(
  tenantId: string,
  email: string,
  brandId?: string
): Promise<{ skip: boolean; reason?: string }> {
  // FIRST: Check DNC list (highest priority)
  const dncResult = await isOnDNC(tenantId, email, brandId)
  if (dncResult.blocked) {
    return { skip: true, reason: dncResult.reason }
  }

  // Quick local check
  const localLead = await checkLocalLead(tenantId, email)
  if (localLead?.email_unsubscribed) {
    return { skip: true, reason: 'Lead is unsubscribed' }
  }
  if (['unsubscribed', 'not_interested', 'bounced'].includes(localLead?.status || '')) {
    return { skip: true, reason: `Lead has status: ${localLead?.status}` }
  }

  // Check GHL if configured
  const tenant = await getTenantSettings(tenantId)
  const integrations = tenant?.settings?.integrations || {}
  const ghlResult = await checkGHLContact(integrations, email)

  if (ghlResult?.shouldSkip) {
    return { skip: true, reason: ghlResult.skipReason }
  }

  return { skip: false }
}
