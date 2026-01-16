const APOLLO_BASE_URL = 'https://api.apollo.io/v1'

// Apollo industry IDs mapping
export const INDUSTRY_IDS: Record<string, string> = {
  // Technology & Software
  'computer software': '5567cd4e7369643b70010000',
  'information technology': '5567cd4773696439b10b0000',
  'internet': '5567cd4773696439b1090000',
  'telecommunications': '5567cd4773696439b1110000',
  'semiconductors': '5567cd4773696439b10f0000',
  'computer hardware': '5567cd4e7369643b70020000',
  // Business Services
  'marketing and advertising': '5567cd467369644d39040000',
  'management consulting': '5567cd467369644d39030000',
  'staffing and recruiting': '5567cd4773696439b1100000',
  'human resources': '5567cd4773696439b1070000',
  'professional training': '5567cd4773696439b10d0000',
  // Financial Services
  'financial services': '5567cd4773696439b1050000',
  'banking': '5567cd4e7369643b700d0000',
  'insurance': '5567cd4773696439b1080000',
  'investment management': '5567cd4e7369643b700c0000',
  'venture capital': '5567cd4e7369643b700f0000',
  // Healthcare
  'hospital and healthcare': '5567cd4773696439b1060000',
  'medical devices': '5567cd467369644d39020000',
  'pharmaceuticals': '5567cd4773696439b10c0000',
  'biotechnology': '5567cd4e7369643b700e0000',
  'health wellness fitness': '5567cd4773696439b1130000',
  // Manufacturing
  'mechanical industrial engineering': '5567cd467369644d39010000',
  'automotive': '5567cd4e7369643b70080000',
  'electrical electronic manufacturing': '5567cd4e7369643b70050000',
  'machinery': '5567cd467369644d39000000',
  // Retail & Consumer
  'retail': '5567cd4773696439b10e0000',
  'consumer goods': '5567cd4e7369643b70030000',
  'food and beverages': '5567cd4e7369643b70060000',
  'apparel and fashion': '5567cd4e7369643b70070000',
  // Real Estate & Construction
  'real estate': '5567cd4773696439b1140000',
  'construction': '5567cd4e7369643b70040000',
  'architecture and planning': '5567cd4e7369643b70090000',
  // Education
  'education management': '5567cd4e7369643b700b0000',
  'e-learning': '5567cd4e7369643b700a0000',
  'higher education': '5567cd4773696439b1120000',
  // Other
  'non-profit': '5567cd467369644d39050000',
  'government': '5567cd4773696439b1150000',
  'legal services': '5567cd4773696439b10a0000',
  'media': '5567cd467369644d39060000',
  'entertainment': '5567cd4e7369643b70100000',
}

export type ApolloSearchParams = {
  jobTitles?: string[]
  industryIds?: string[]
  locations?: string[]
  employeeRange?: { min: number; max: number }
  page?: number
  perPage?: number
}

export type ApolloLead = {
  id: string
  first_name: string
  last_name: string
  name: string
  email: string
  title: string
  headline: string
  linkedin_url: string
  organization: {
    id: string
    name: string
    website_url: string
    linkedin_url: string
    industry: string
    estimated_num_employees: number
    city: string
    state: string
    country: string
  }
  city: string
  state: string
  country: string
}

export type ApolloSearchResult = {
  leads: ApolloLead[]
  pagination: {
    page: number
    per_page: number
    total_entries: number
    total_pages: number
  }
}

export function createApolloClient(apiKey: string) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  }

  return {
    async searchPeople(params: ApolloSearchParams): Promise<ApolloSearchResult> {
      const body: Record<string, unknown> = {
        api_key: apiKey,
        page: params.page || 1,
        per_page: params.perPage || 25,
        contact_email_status: ['verified'],
      }

      if (params.jobTitles?.length) {
        body.person_titles = params.jobTitles
      }

      if (params.industryIds?.length) {
        body.organization_industry_tag_ids = params.industryIds
      }

      if (params.locations?.length) {
        body.organization_locations = params.locations
      }

      if (params.employeeRange) {
        body.organization_num_employees_ranges = [
          `${params.employeeRange.min},${params.employeeRange.max}`
        ]
      }

      const res = await fetch(`${APOLLO_BASE_URL}/mixed_people/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.message || `Apollo API error: ${res.status}`)
      }

      const data = await res.json()

      return {
        leads: data.people || [],
        pagination: {
          page: data.pagination?.page || 1,
          per_page: data.pagination?.per_page || 25,
          total_entries: data.pagination?.total_entries || 0,
          total_pages: data.pagination?.total_pages || 0,
        },
      }
    },

    async getPersonDetails(id: string): Promise<ApolloLead> {
      const res = await fetch(`${APOLLO_BASE_URL}/people/match`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          api_key: apiKey,
          id,
        }),
      })

      if (!res.ok) {
        throw new Error(`Apollo API error: ${res.status}`)
      }

      const data = await res.json()
      return data.person
    },

    async enrichPerson(email: string): Promise<ApolloLead | null> {
      const res = await fetch(`${APOLLO_BASE_URL}/people/match`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          api_key: apiKey,
          email,
        }),
      })

      if (!res.ok) {
        return null
      }

      const data = await res.json()
      return data.person || null
    },
  }
}

// Build Apollo search URL for browser navigation
export function buildApolloSearchUrl(params: {
  industry?: string
  jobTitles?: string[]
  locations?: string[]
  employeeRange?: { min: number; max: number }
}): string {
  const baseUrl = 'https://app.apollo.io/#/people?page=1&sortAscending=false&sortByField=%5Bnone%5D'
  const searchParams: string[] = []

  // Always include verified emails
  searchParams.push('contactEmailStatusV2[]=verified')

  // Industry
  if (params.industry) {
    const industryKey = params.industry.toLowerCase()
    const industryId = INDUSTRY_IDS[industryKey]
    if (industryId) {
      searchParams.push(`organizationIndustryTagIds[]=${industryId}`)
    }
  }

  // Job titles
  if (params.jobTitles?.length) {
    params.jobTitles.forEach((title) => {
      searchParams.push(`personTitles[]=${encodeURIComponent(title)}`)
    })
  }

  // Locations
  if (params.locations?.length) {
    params.locations.forEach((location) => {
      searchParams.push(`organizationLocations[]=${encodeURIComponent(location)}`)
    })
  }

  // Employee range
  if (params.employeeRange) {
    const { min, max } = params.employeeRange
    searchParams.push(`organizationNumEmployeesRanges[]=${min}%2C${max}`)
  }

  return searchParams.length > 0 ? `${baseUrl}&${searchParams.join('&')}` : baseUrl
}
