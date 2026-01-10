/**
 * Apify API Client
 * Handles LinkedIn profile and company scraping via Apify actors
 */

const APIFY_API_BASE = 'https://api.apify.com/v2'

// LinkedIn scraping actors (pay-per-usage)
const ACTORS = {
  linkedinProfile: 'LQQIXN9Othf8f7R5n',  // Personal posts scraper (username input)
  linkedinCompany: 'mrThmKLmkxJPehxCg',  // Company posts scraper
}

interface ApifyRunResult {
  id: string
  status: string
  defaultDatasetId: string
}

interface LinkedInProfile {
  firstName?: string
  lastName?: string
  headline?: string
  summary?: string
  location?: string
  connections?: number
  followerCount?: number
  experience?: Array<{
    title?: string
    companyName?: string
    location?: string
    startDate?: string
    endDate?: string
    description?: string
  }>
  education?: Array<{
    schoolName?: string
    degreeName?: string
    fieldOfStudy?: string
    startDate?: string
    endDate?: string
  }>
  skills?: string[]
  recommendations?: number
  profileUrl?: string
  // Raw data passthrough
  [key: string]: unknown
}

interface LinkedInCompany {
  name?: string
  description?: string
  website?: string
  industry?: string
  companySize?: string
  employeeCount?: number
  headquarters?: string
  founded?: string
  specialties?: string[]
  followerCount?: number
  updates?: Array<{
    text?: string
    date?: string
    likes?: number
    comments?: number
  }>
  jobs?: Array<{
    title?: string
    location?: string
    postedDate?: string
  }>
  // Raw data passthrough
  [key: string]: unknown
}

async function getApifyApiKey(): Promise<string> {
  const apiKey = process.env.APIFY_API_KEY
  if (!apiKey || apiKey === 'apk_xxx') {
    throw new Error('APIFY_API_KEY not configured')
  }
  return apiKey
}

/**
 * Start an Apify actor run and wait for results
 */
async function runActor(
  actorId: string,
  input: Record<string, unknown>,
  timeoutMs = 120000
): Promise<unknown[]> {
  const apiKey = await getApifyApiKey()

  // Start the actor run
  const runResponse = await fetch(
    `${APIFY_API_BASE}/acts/${actorId}/runs?token=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  )

  if (!runResponse.ok) {
    const error = await runResponse.text()
    throw new Error(`Apify actor start failed: ${runResponse.status} - ${error}`)
  }

  const runData = (await runResponse.json()).data as ApifyRunResult
  const runId = runData.id

  // Poll for completion
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    const statusResponse = await fetch(
      `${APIFY_API_BASE}/actor-runs/${runId}?token=${apiKey}`
    )

    if (!statusResponse.ok) {
      throw new Error(`Failed to check run status: ${statusResponse.status}`)
    }

    const statusData = (await statusResponse.json()).data as ApifyRunResult
    const status = statusData.status

    if (status === 'SUCCEEDED') {
      // Fetch results from default dataset
      const datasetResponse = await fetch(
        `${APIFY_API_BASE}/datasets/${statusData.defaultDatasetId}/items?token=${apiKey}`
      )

      if (!datasetResponse.ok) {
        throw new Error(`Failed to fetch results: ${datasetResponse.status}`)
      }

      return await datasetResponse.json()
    }

    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify actor run ${status}`)
    }

    // Wait 2 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error('Apify actor run timed out')
}

/**
 * Extract username from LinkedIn URL
 */
function extractLinkedInUsername(linkedinUrl: string): string | null {
  // Handle formats:
  // https://linkedin.com/in/username
  // https://www.linkedin.com/in/username
  // linkedin.com/in/username
  // /in/username
  // username (already extracted)

  // First try to extract from /in/ pattern
  const inMatch = linkedinUrl.match(/\/in\/([a-zA-Z0-9\-]+)/)
  if (inMatch) {
    return inMatch[1]
  }

  // If no /in/ found, assume it's just the username
  if (!linkedinUrl.includes('/') && !linkedinUrl.includes('.')) {
    return linkedinUrl
  }

  return null
}

/**
 * Scrape a LinkedIn personal profile (posts)
 */
export async function scrapeLinkedInProfile(
  linkedinUrl: string
): Promise<LinkedInProfile | null> {
  if (!linkedinUrl) {
    console.log('[Apify] No LinkedIn URL provided, skipping profile scrape')
    return null
  }

  // Extract username from URL
  const username = extractLinkedInUsername(linkedinUrl)

  if (!username) {
    console.log(`[Apify] Could not extract username from: ${linkedinUrl}`)
    return null
  }

  console.log(`[Apify] Scraping LinkedIn posts for username: ${username}`)

  try {
    const results = await runActor(ACTORS.linkedinProfile, {
      username: username,
      page_number: 1,
      limit: 10,  // Recent posts - enough to find signals without overfetching
    })

    if (results && results.length > 0) {
      console.log(`[Apify] LinkedIn profile scraped successfully - ${results.length} posts found`)
      // Return all posts as an object with posts array
      return { posts: results, username } as unknown as LinkedInProfile
    }

    console.log('[Apify] No profile data returned')
    return null
  } catch (error) {
    console.error('[Apify] Profile scrape error:', error)
    return null
  }
}

/**
 * Extract company name/slug from LinkedIn company URL
 */
function extractCompanyName(companyUrl: string): string | null {
  // Handle formats:
  // https://linkedin.com/company/google
  // https://www.linkedin.com/company/davis-plus-gilbert-llp
  // linkedin.com/company/google
  // /company/google
  // google (already extracted)

  // First try to extract from /company/ pattern
  const companyMatch = companyUrl.match(/\/company\/([a-zA-Z0-9\-]+)/)
  if (companyMatch) {
    return companyMatch[1]
  }

  // If no /company/ found, assume it's just the company name
  if (!companyUrl.includes('/') && !companyUrl.includes('.')) {
    return companyUrl
  }

  return null
}

/**
 * Scrape a LinkedIn company page (posts)
 */
export async function scrapeLinkedInCompany(
  companyUrl: string
): Promise<LinkedInCompany | null> {
  if (!companyUrl) {
    console.log('[Apify] No company LinkedIn URL provided, skipping company scrape')
    return null
  }

  // Extract company name from URL
  const companyName = extractCompanyName(companyUrl)

  if (!companyName) {
    console.log(`[Apify] Could not extract company name from: ${companyUrl}`)
    return null
  }

  console.log(`[Apify] Scraping LinkedIn posts for company: ${companyName}`)

  try {
    const results = await runActor(ACTORS.linkedinCompany, {
      company_name: companyName,
      page_number: 1,
      limit: 10,  // Recent posts - enough to find signals without overfetching
      sort: 'recent',
    })

    if (results && results.length > 0) {
      console.log(`[Apify] LinkedIn company scraped successfully - ${results.length} posts found`)
      // Return all posts as an object with posts array
      return { posts: results, companyName } as unknown as LinkedInCompany
    }

    console.log('[Apify] No company data returned')
    return null
  } catch (error) {
    console.error('[Apify] Company scrape error:', error)
    return null
  }
}

/**
 * Extract recent job postings from company data (hiring signals)
 */
export function extractHiringSignals(
  companyData: LinkedInCompany | null
): Array<{ title: string; location?: string; date?: string }> {
  if (!companyData?.jobs) return []

  // Filter for marketing/growth related roles
  const marketingKeywords = [
    'marketing',
    'growth',
    'paid',
    'media',
    'digital',
    'acquisition',
    'performance',
    'demand',
    'brand',
    'content',
    'seo',
    'sem',
    'ppc',
    'social',
  ]

  return companyData.jobs
    .filter((job) => {
      const title = (job.title || '').toLowerCase()
      return marketingKeywords.some((kw) => title.includes(kw))
    })
    .map((job) => ({
      title: job.title || 'Unknown Role',
      location: job.location,
      date: job.postedDate,
    }))
}

/**
 * Extract recent company updates/posts
 */
export function extractRecentUpdates(
  companyData: LinkedInCompany | null
): Array<{ text: string; date?: string; engagement?: number }> {
  if (!companyData?.updates) return []

  return companyData.updates.slice(0, 5).map((update) => ({
    text: update.text || '',
    date: update.date,
    engagement: (update.likes || 0) + (update.comments || 0),
  }))
}
