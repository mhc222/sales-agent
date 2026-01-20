/**
 * GoHighLevel (GHL) CRM API Client
 * Handles contact management, tagging, and DND settings
 *
 * API Reference: https://highlevel.stoplight.io/docs/integrations
 * Authentication: Bearer token (API key)
 */

const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28' // Private Integration API version

// ============================================================================
// TYPES
// ============================================================================

export interface GHLConfig {
  apiKey: string
  locationId: string
}

export interface GHLContact {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  name?: string
  phone?: string
  companyName?: string
  tags?: string[]
  dnd?: boolean
  dndSettings?: {
    email?: { status: 'active' | 'inactive'; message?: string }
    sms?: { status: 'active' | 'inactive'; message?: string }
  }
  customFields?: Array<{ id: string; key: string; value: string }>
  dateCreated?: string
  dateUpdated?: string
}

export interface CreateContactParams {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  companyName?: string
  tags?: string[]
  customFields?: Array<{ key: string; value: string }>
}

export interface UpdateContactParams {
  email?: string
  firstName?: string
  lastName?: string
  phone?: string
  companyName?: string
  tags?: string[]
  dnd?: boolean
  dndSettings?: {
    email?: { status: 'active' | 'inactive'; message?: string }
    sms?: { status: 'active' | 'inactive'; message?: string }
  }
  customFields?: Array<{ key: string; value: string }>
}

export type ReplyStatus = 'interested' | 'not-interested' | 'do-not-contact' | 'nurture' | 'out-of-office' | 'other'

// Tag mappings per reply status
const STATUS_TAG_MAPPINGS: Record<ReplyStatus, string[]> = {
  'interested': ['interested', 'positive-reply', 'sales-qualified'],
  'not-interested': ['not-interested', 'cold'],
  'do-not-contact': ['do-not-contact', 'unsubscribed', 'dnc'],
  'nurture': ['nurture', 'not-now', 'follow-up-later'],
  'out-of-office': ['out-of-office'],
  'other': ['needs-review'],
}

// ============================================================================
// API REQUEST HELPER
// ============================================================================

async function ghlRequest<T>(
  config: GHLConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${GHL_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'Version': GHL_API_VERSION,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GHL API error (${response.status}): ${errorText}`)
  }

  // Handle empty responses
  const text = await response.text()
  if (!text) return {} as T

  return JSON.parse(text)
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Validate API key by attempting to search for contacts
 */
export async function validateApiKey(config: GHLConfig): Promise<boolean> {
  try {
    // Try a simple search to validate credentials
    await ghlRequest<{ contacts: GHLContact[] }>(
      config,
      `/contacts/?locationId=${config.locationId}&limit=1`
    )
    return true
  } catch (error) {
    console.error('[GHL] API key validation failed:', error)
    return false
  }
}

// ============================================================================
// CONTACT OPERATIONS
// ============================================================================

/**
 * Find a contact by email address
 */
export async function findContactByEmail(
  config: GHLConfig,
  email: string
): Promise<GHLContact | null> {
  try {
    const response = await ghlRequest<{ contacts: GHLContact[] }>(
      config,
      `/contacts/?locationId=${config.locationId}&query=${encodeURIComponent(email)}`
    )

    // Find exact email match
    const contact = response.contacts?.find(
      (c) => c.email?.toLowerCase() === email.toLowerCase()
    )

    return contact || null
  } catch (error) {
    console.error('[GHL] Error finding contact by email:', error)
    return null
  }
}

/**
 * Create a new contact in GHL
 */
export async function createContact(
  config: GHLConfig,
  params: CreateContactParams
): Promise<GHLContact> {
  const response = await ghlRequest<{ contact: GHLContact }>(
    config,
    '/contacts/',
    {
      method: 'POST',
      body: JSON.stringify({
        locationId: config.locationId,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        phone: params.phone,
        companyName: params.companyName,
        tags: params.tags,
        customFields: params.customFields,
      }),
    }
  )

  return response.contact
}

/**
 * Update an existing contact
 */
export async function updateContact(
  config: GHLConfig,
  contactId: string,
  params: UpdateContactParams
): Promise<GHLContact> {
  const response = await ghlRequest<{ contact: GHLContact }>(
    config,
    `/contacts/${contactId}`,
    {
      method: 'PUT',
      body: JSON.stringify(params),
    }
  )

  return response.contact
}

/**
 * Create or update a contact (upsert by email)
 */
export async function upsertContact(
  config: GHLConfig,
  email: string,
  params: Omit<CreateContactParams, 'email'>
): Promise<{ contact: GHLContact; created: boolean }> {
  // Try to find existing contact
  const existing = await findContactByEmail(config, email)

  if (existing) {
    // Update existing contact
    const updated = await updateContact(config, existing.id, {
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone,
      companyName: params.companyName,
      // Merge tags (don't overwrite existing)
      tags: [...new Set([...(existing.tags || []), ...(params.tags || [])])],
      customFields: params.customFields,
    })
    return { contact: updated, created: false }
  }

  // Create new contact
  const created = await createContact(config, { email, ...params })
  return { contact: created, created: true }
}

/**
 * Add tags to a contact (preserves existing tags)
 */
export async function addTagsToContact(
  config: GHLConfig,
  contactId: string,
  tags: string[]
): Promise<void> {
  // Get current contact to preserve existing tags
  const response = await ghlRequest<{ contact: GHLContact }>(
    config,
    `/contacts/${contactId}`
  )

  const existingTags = response.contact.tags || []
  const newTags = [...new Set([...existingTags, ...tags])]

  await updateContact(config, contactId, { tags: newTags })
}

/**
 * Set contact DND (Do Not Disturb) status
 */
export async function setContactDND(
  config: GHLConfig,
  contactId: string,
  dnd: boolean,
  message?: string
): Promise<void> {
  await updateContact(config, contactId, {
    dnd,
    dndSettings: {
      email: {
        status: dnd ? 'active' : 'inactive',
        message: message || (dnd ? 'Unsubscribed' : undefined),
      },
    },
  })
}

// ============================================================================
// REPLY SYNC
// ============================================================================

/**
 * Sync reply status to GHL
 * Creates/updates contact with appropriate tags and DND settings
 */
export async function syncReplyStatusToGHL(
  config: GHLConfig,
  email: string,
  status: ReplyStatus,
  leadData?: {
    firstName?: string
    lastName?: string
    companyName?: string
    linkedinUrl?: string
  }
): Promise<{ contactId: string; created: boolean }> {
  console.log(`[GHL] Syncing reply status for ${email}: ${status}`)

  // Get tags for this status
  const statusTags = STATUS_TAG_MAPPINGS[status] || ['needs-review']

  // Upsert contact with tags
  const { contact, created } = await upsertContact(config, email, {
    firstName: leadData?.firstName,
    lastName: leadData?.lastName,
    companyName: leadData?.companyName,
    tags: statusTags,
    customFields: leadData?.linkedinUrl
      ? [{ key: 'linkedin_url', value: leadData.linkedinUrl }]
      : undefined,
  })

  // Set DND for do-not-contact status
  if (status === 'do-not-contact') {
    await setContactDND(config, contact.id, true, 'Unsubscribed via email reply')
  }

  console.log(`[GHL] ${created ? 'Created' : 'Updated'} contact ${contact.id} with tags: ${statusTags.join(', ')}`)

  return { contactId: contact.id, created }
}

// ============================================================================
// DEDUPLICATION CHECK
// ============================================================================

// Tags that indicate a contact should be skipped for outreach
const SKIP_TAGS = ['do-not-contact', 'unsubscribed', 'dnc', 'bounced', 'opted-out']

/**
 * Check if a contact exists and should be skipped for outreach
 */
export async function checkContactForDedup(
  config: GHLConfig,
  email: string
): Promise<{
  exists: boolean
  shouldSkip: boolean
  skipReason?: string
  contactId?: string
}> {
  const contact = await findContactByEmail(config, email)

  if (!contact) {
    return { exists: false, shouldSkip: false }
  }

  // Check DND status
  if (contact.dnd) {
    return {
      exists: true,
      shouldSkip: true,
      skipReason: 'GHL contact has DND enabled',
      contactId: contact.id,
    }
  }

  // Check for skip tags
  const contactTags = contact.tags || []
  const matchingSkipTags = contactTags.filter((tag) =>
    SKIP_TAGS.some((skipTag) => tag.toLowerCase().includes(skipTag))
  )

  if (matchingSkipTags.length > 0) {
    return {
      exists: true,
      shouldSkip: true,
      skipReason: `GHL contact has skip tag: ${matchingSkipTags[0]}`,
      contactId: contact.id,
    }
  }

  return {
    exists: true,
    shouldSkip: false,
    contactId: contact.id,
  }
}
