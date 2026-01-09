import { VercelRequest, VercelResponse } from '@vercel/functions'
import { inngest } from '@inngest/sdk'

const inngestClient = inngest

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // Verify it's a cron job (or authorized request)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.authorization

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('Unauthorized cron request')
    return response.status(401).json({ error: 'Unauthorized' })
  }

  try {
    console.log('[Cron] Starting daily visitor ingestion...')

    // Step 1: Fetch daily visitors from your API
    const visitorApiUrl = process.env.VISITOR_API_URL
    const visitorApiKey = process.env.VISITOR_API_KEY

    if (!visitorApiUrl || !visitorApiKey) {
      throw new Error('Missing visitor API credentials')
    }

    const visitorsResponse = await fetch(visitorApiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${visitorApiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!visitorsResponse.ok) {
      throw new Error(
        `Visitor API failed: ${visitorsResponse.status} ${visitorsResponse.statusText}`
      )
    }

    const visitors = await visitorsResponse.json()

    if (!Array.isArray(visitors)) {
      throw new Error('Visitor API did not return an array')
    }

    console.log(`[Cron] Received ${visitors.length} visitors`)

    if (visitors.length === 0) {
      return response.status(200).json({
        status: 'success',
        message: 'No new visitors',
        processed: 0,
      })
    }

    // Step 2: Send each visitor to Inngest as "lead.ingested" event
    const events = visitors.map((visitor) => ({
      name: 'lead.ingested',
      data: {
        first_name: visitor.first_name || 'Unknown',
        last_name: visitor.last_name || 'Unknown',
        email: visitor.business_verified_emails,
        job_title: visitor.job_title,
        headline: visitor.headline,
        department: visitor.department,
        seniority_level: visitor.seniority_level,
        years_experience: visitor.inferred_years_experience,
        linkedin_url: visitor.linkedin_url,
        company_name: visitor.company_name,
        company_linkedin_url: visitor.company_linkedin_url,
        company_domain: visitor.company_domain,
        company_employee_count: visitor.company_employee_count,
        company_revenue: visitor.company_revenue,
        company_industry: visitor.company_industry,
        company_description: visitor.company_description,
        intent_signal: {
          pages_visited: visitor.pages_visited || [],
          event_types: visitor.event_types || [],
          timestamp: new Date().toISOString(),
        },
        tenant_id: process.env.TENANT_ID || 'jsb-media-001',
      },
    }))

    await inngestClient.send(events)

    console.log(`[Cron] Successfully sent ${events.length} events to Inngest`)

    return response.status(200).json({
      status: 'success',
      message: 'Daily ingestion completed',
      processed: events.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Error during ingestion:', error)
    return response.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })
  }
}
