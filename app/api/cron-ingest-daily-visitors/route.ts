import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '../../../inngest/client'

interface AudienceLabVisitor {
  FIRST_NAME: string
  LAST_NAME: string
  BUSINESS_VERIFIED_EMAILS: string
  JOB_TITLE: string
  HEADLINE: string
  DEPARTMENT: string
  SENIORITY_LEVEL: string
  INFERRED_YEARS_EXPERIENCE: string
  LINKEDIN_URL: string
  COMPANY_NAME: string
  COMPANY_LINKEDIN_URL: string
  COMPANY_DOMAIN: string
  COMPANY_EMPLOYEE_COUNT: string
  COMPANY_REVENUE: string
  COMPANY_INDUSTRY: string
  COMPANY_DESCRIPTION: string
  EVENT_DATA: string
  EVENT_TYPE: string
  URL: string
}

interface AudienceLabResponse {
  segment_id: string
  segment_name: string
  total_records: number
  page_size: number
  page: number
  total_pages: number
  has_more: boolean
  data: AudienceLabVisitor[]
}

function parseEmployeeCount(str: string): number | undefined {
  if (!str) return undefined
  const match = str.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : undefined
}

function parseEventData(jsonStr: string): { url?: string; timeOnPage?: number } {
  if (!jsonStr) return {}
  try {
    return JSON.parse(jsonStr)
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest) {
  // Verify it's a cron job (or authorized request)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('Unauthorized cron request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Cron] Starting daily visitor ingestion...')

    const visitorApiUrl = process.env.VISITOR_API_URL
    const visitorApiKey = process.env.VISITOR_API_KEY

    if (!visitorApiUrl || !visitorApiKey) {
      throw new Error('Missing visitor API credentials')
    }

    // Fetch from AudienceLab API with X-API-Key header
    const visitorsResponse = await fetch(visitorApiUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': visitorApiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!visitorsResponse.ok) {
      throw new Error(
        `Visitor API failed: ${visitorsResponse.status} ${visitorsResponse.statusText}`
      )
    }

    const apiResponse: AudienceLabResponse = await visitorsResponse.json()

    // Extract visitors from the data array
    const visitors = apiResponse.data || []

    // Filter to only visitors with a verified business email
    const qualifiedVisitors = visitors.filter(
      (v) => v.BUSINESS_VERIFIED_EMAILS && v.FIRST_NAME && v.LAST_NAME
    )

    console.log(
      `[Cron] Received ${visitors.length} visitors, ${qualifiedVisitors.length} with verified emails`
    )

    if (qualifiedVisitors.length === 0) {
      return NextResponse.json({
        status: 'success',
        message: 'No qualified visitors (with verified emails)',
        total_visitors: visitors.length,
        processed: 0,
      })
    }

    // Map AudienceLab schema to our lead.ingested event format
    const events = qualifiedVisitors.map((visitor) => {
      const eventData = parseEventData(visitor.EVENT_DATA)

      return {
        name: 'lead.ingested' as const,
        data: {
          first_name: visitor.FIRST_NAME,
          last_name: visitor.LAST_NAME,
          email: visitor.BUSINESS_VERIFIED_EMAILS.split(',')[0].trim(),
          job_title: visitor.JOB_TITLE || undefined,
          headline: visitor.HEADLINE || undefined,
          department: visitor.DEPARTMENT || undefined,
          seniority_level: visitor.SENIORITY_LEVEL || undefined,
          years_experience: visitor.INFERRED_YEARS_EXPERIENCE
            ? parseInt(visitor.INFERRED_YEARS_EXPERIENCE, 10)
            : undefined,
          linkedin_url: visitor.LINKEDIN_URL || undefined,
          company_name: visitor.COMPANY_NAME || 'Unknown',
          company_linkedin_url: visitor.COMPANY_LINKEDIN_URL || undefined,
          company_domain: visitor.COMPANY_DOMAIN || undefined,
          company_employee_count: parseEmployeeCount(visitor.COMPANY_EMPLOYEE_COUNT),
          company_revenue: visitor.COMPANY_REVENUE || undefined,
          company_industry: visitor.COMPANY_INDUSTRY || undefined,
          company_description: visitor.COMPANY_DESCRIPTION || undefined,
          intent_signal: {
            page_visited: eventData.url || visitor.URL,
            time_on_page: eventData.timeOnPage,
            event_type: visitor.EVENT_TYPE,
            timestamp: new Date().toISOString(),
          },
          tenant_id: process.env.TENANT_ID!,
        },
      }
    })

    await inngest.send(events)

    console.log(`[Cron] Successfully sent ${events.length} events to Inngest`)

    return NextResponse.json({
      status: 'success',
      message: 'Daily ingestion completed',
      total_visitors: visitors.length,
      processed: events.length,
      has_more: apiResponse.has_more,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Error during ingestion:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
