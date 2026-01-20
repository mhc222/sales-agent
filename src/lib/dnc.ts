import { createServiceClient } from './supabase-server'

export type DNCEntry = {
  id: string
  tenant_id: string
  brand_id: string | null
  email: string | null
  domain: string | null
  reason: string | null
  added_by: string | null
  created_at: string
}

export interface DNCCheckResult {
  blocked: string[]
  allowed: string[]
  blockReasons: Record<string, string>
}

/**
 * Check if emails are on the DNC list
 * Checks both tenant-wide and brand-specific entries
 *
 * @param tenantId - The tenant ID to check
 * @param emails - Array of emails to check
 * @param brandId - Optional brand ID for brand-specific checking
 */
export async function checkDNC(
  tenantId: string,
  emails: string[],
  brandId?: string
): Promise<DNCCheckResult> {
  const serviceClient = createServiceClient()

  const normalizedEmails = emails.map((e) => e.toLowerCase())

  // Fetch DNC entries for tenant (tenant-wide + brand-specific if brandId provided)
  let query = serviceClient
    .from('do_not_contact')
    .select('email, domain, brand_id')
    .eq('tenant_id', tenantId)

  // If brandId provided, get both tenant-wide (brand_id is null) and brand-specific entries
  // If no brandId, only get tenant-wide entries
  if (brandId) {
    query = query.or(`brand_id.is.null,brand_id.eq.${brandId}`)
  } else {
    query = query.is('brand_id', null)
  }

  const { data: dncEntries } = await query

  const blockedEmails = new Set<string>()
  const blockedDomains = new Set<string>()

  dncEntries?.forEach((entry: { email: string | null; domain: string | null; brand_id: string | null }) => {
    if (entry.email) blockedEmails.add(entry.email.toLowerCase())
    if (entry.domain) blockedDomains.add(entry.domain.toLowerCase())
  })

  const blocked: string[] = []
  const allowed: string[] = []
  const blockReasons: Record<string, string> = {}

  normalizedEmails.forEach((email) => {
    const domain = email.split('@')[1]
    if (blockedEmails.has(email)) {
      blocked.push(email)
      blockReasons[email] = 'Email on DNC list'
    } else if (domain && blockedDomains.has(domain)) {
      blocked.push(email)
      blockReasons[email] = `Domain @${domain} on DNC list`
    } else {
      allowed.push(email)
    }
  })

  return { blocked, allowed, blockReasons }
}

/**
 * Check a single email against DNC (convenience wrapper)
 */
export async function isOnDNC(
  tenantId: string,
  email: string,
  brandId?: string
): Promise<{ blocked: boolean; reason?: string }> {
  const result = await checkDNC(tenantId, [email], brandId)
  const blocked = result.blocked.length > 0
  return {
    blocked,
    reason: blocked ? result.blockReasons[email.toLowerCase()] : undefined,
  }
}

export async function addToDNC(
  tenantId: string,
  entries: Array<{ type: 'email' | 'domain'; value: string; reason?: string; brandId?: string }>,
  addedBy?: string
): Promise<{ added: number; skipped: number }> {
  const serviceClient = createServiceClient()

  const toInsert = entries.map((entry) => ({
    tenant_id: tenantId,
    brand_id: entry.brandId || null,
    email: entry.type === 'email' ? entry.value.toLowerCase() : null,
    domain: entry.type === 'domain' ? entry.value.toLowerCase() : null,
    reason: entry.reason || null,
    added_by: addedBy || null,
  }))

  const { data, error } = await serviceClient
    .from('do_not_contact')
    .upsert(toInsert, {
      onConflict: 'tenant_id,email',
      ignoreDuplicates: true,
    })
    .select()

  if (error) {
    console.error('DNC insert error:', error)
    throw new Error('Failed to add entries to DNC list')
  }

  return {
    added: data?.length || 0,
    skipped: entries.length - (data?.length || 0),
  }
}

export async function removeFromDNC(
  tenantId: string,
  entryIds: string[]
): Promise<number> {
  const serviceClient = createServiceClient()

  const { data, error } = await serviceClient
    .from('do_not_contact')
    .delete()
    .eq('tenant_id', tenantId)
    .in('id', entryIds)
    .select()

  if (error) {
    console.error('DNC delete error:', error)
    throw new Error('Failed to remove entries from DNC list')
  }

  return data?.length || 0
}

export async function getDNCList(
  tenantId: string,
  options?: {
    search?: string
    type?: 'email' | 'domain' | 'all'
    limit?: number
    offset?: number
  }
): Promise<{ entries: DNCEntry[]; total: number }> {
  const serviceClient = createServiceClient()

  let query = serviceClient
    .from('do_not_contact')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (options?.search) {
    query = query.or(`email.ilike.%${options.search}%,domain.ilike.%${options.search}%`)
  }

  if (options?.type === 'email') {
    query = query.not('email', 'is', null)
  } else if (options?.type === 'domain') {
    query = query.not('domain', 'is', null)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('DNC fetch error:', error)
    throw new Error('Failed to fetch DNC list')
  }

  return {
    entries: data || [],
    total: count || 0,
  }
}
