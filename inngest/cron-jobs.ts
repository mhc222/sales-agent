/**
 * Inngest Cron Jobs
 * All scheduled tasks run via Inngest instead of Vercel cron
 */

import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'
import { calculateIntentScore, IntentLeadData } from '../src/lib/intent-scoring'
import { notifyDailySummary } from '../src/lib/slack-notifier'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// HELPERS
// ============================================================================

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

function mapVisitorToIntentLead(visitor: AudienceLabVisitor): IntentLeadData {
  return {
    firstName: visitor.FIRST_NAME,
    lastName: visitor.LAST_NAME,
    email: visitor.BUSINESS_VERIFIED_EMAILS?.split(',')[0]?.trim(),
    jobTitle: visitor.JOB_TITLE,
    seniority: visitor.SENIORITY_LEVEL,
    linkedinUrl: visitor.LINKEDIN_URL,
    companyName: visitor.COMPANY_NAME,
    companyLinkedinUrl: visitor.COMPANY_LINKEDIN_URL,
    companyDomain: visitor.COMPANY_DOMAIN,
    companyIndustry: visitor.COMPANY_INDUSTRY,
    companyEmployeeCount: parseEmployeeCount(visitor.COMPANY_EMPLOYEE_COUNT),
    companyRevenue: visitor.COMPANY_REVENUE,
  }
}

// ============================================================================
// CRON 1: Daily Intent Data Ingestion (10am UTC)
// ============================================================================

export const cronDailyIntent = inngest.createFunction(
  {
    id: 'cron-daily-intent',
    name: 'Daily Intent Data Ingestion',
    retries: 2,
  },
  { cron: '0 10 * * *' }, // 10am UTC daily
  async ({ step }) => {
    console.log('[Cron Intent] Starting daily intent data ingestion...')

    // Step 1: Fetch from AudienceLab
    const apiResponse = await step.run('fetch-intent-data', async () => {
      const intentApiUrl = process.env.INTENT_API_URL
      const apiKey = process.env.VISITOR_API_KEY

      if (!intentApiUrl || !apiKey) {
        throw new Error('Missing intent API credentials (INTENT_API_URL or VISITOR_API_KEY)')
      }

      const response = await fetch(intentApiUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Intent API failed: ${response.status} ${response.statusText}`)
      }

      return response.json() as Promise<AudienceLabResponse>
    })

    const visitors = apiResponse.data || []
    const qualifiedVisitors = visitors.filter(
      (v) => v.BUSINESS_VERIFIED_EMAILS && v.FIRST_NAME && v.LAST_NAME
    )

    console.log(
      `[Cron Intent] Received ${visitors.length} records, ${qualifiedVisitors.length} with verified emails`
    )

    if (qualifiedVisitors.length === 0) {
      return { status: 'success', message: 'No qualified intent leads', processed: 0 }
    }

    // Step 2: Score and rank leads
    const scoredLeads = await step.run('score-leads', async () => {
      return qualifiedVisitors
        .map((visitor) => {
          const intentData = mapVisitorToIntentLead(visitor)
          const scoreResult = calculateIntentScore(intentData)
          return {
            visitor,
            intentData,
            score: scoreResult.totalScore,
            tier: scoreResult.tier,
            breakdown: scoreResult.breakdown,
            reasoning: scoreResult.reasoning,
          }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 100) // Top 100
    })

    // Step 3: Send events (top 20 get auto-research)
    const sendResult = await step.run('send-events', async () => {
      const events = scoredLeads.map((lead, index) => ({
        name: 'lead.intent-ingested' as const,
        data: {
          first_name: lead.visitor.FIRST_NAME,
          last_name: lead.visitor.LAST_NAME,
          email: lead.visitor.BUSINESS_VERIFIED_EMAILS.split(',')[0].trim(),
          job_title: lead.visitor.JOB_TITLE || undefined,
          headline: lead.visitor.HEADLINE || undefined,
          department: lead.visitor.DEPARTMENT || undefined,
          seniority_level: lead.visitor.SENIORITY_LEVEL || undefined,
          years_experience: lead.visitor.INFERRED_YEARS_EXPERIENCE
            ? parseInt(lead.visitor.INFERRED_YEARS_EXPERIENCE, 10)
            : undefined,
          linkedin_url: lead.visitor.LINKEDIN_URL || undefined,
          company_name: lead.visitor.COMPANY_NAME || 'Unknown',
          company_linkedin_url: lead.visitor.COMPANY_LINKEDIN_URL || undefined,
          company_domain: lead.visitor.COMPANY_DOMAIN || undefined,
          company_employee_count: parseEmployeeCount(lead.visitor.COMPANY_EMPLOYEE_COUNT),
          company_revenue: lead.visitor.COMPANY_REVENUE || undefined,
          company_industry: lead.visitor.COMPANY_INDUSTRY || undefined,
          company_description: lead.visitor.COMPANY_DESCRIPTION || undefined,
          tenant_id: process.env.TENANT_ID!,
          intent_score: lead.score,
          intent_tier: lead.tier,
          intent_breakdown: lead.breakdown,
          intent_reasoning: lead.reasoning,
          auto_research: index < 20,
          batch_date: new Date().toISOString().split('T')[0],
          batch_rank: index + 1,
        },
      }))

      return inngest.send(events)
    })

    return {
      status: 'success',
      total_records: visitors.length,
      qualified_records: qualifiedVisitors.length,
      processed: scoredLeads.length,
      auto_research: Math.min(20, scoredLeads.length),
      qualified_only: Math.max(0, scoredLeads.length - 20),
    }
  }
)

// ============================================================================
// CRON 2: Daily Visitor Ingestion (9am UTC)
// ============================================================================

export const cronDailyVisitors = inngest.createFunction(
  {
    id: 'cron-daily-visitors',
    name: 'Daily Pixel Visitor Ingestion',
    retries: 2,
  },
  { cron: '0 9 * * *' }, // 9am UTC daily
  async ({ step }) => {
    console.log('[Cron Visitors] Starting daily visitor ingestion...')

    // Step 1: Fetch from AudienceLab
    const apiResponse = await step.run('fetch-visitor-data', async () => {
      const visitorApiUrl = process.env.VISITOR_API_URL
      const visitorApiKey = process.env.VISITOR_API_KEY

      if (!visitorApiUrl || !visitorApiKey) {
        throw new Error('Missing visitor API credentials')
      }

      const response = await fetch(visitorApiUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': visitorApiKey,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Visitor API failed: ${response.status} ${response.statusText}`)
      }

      return response.json() as Promise<AudienceLabResponse>
    })

    const visitors = apiResponse.data || []
    const qualifiedVisitors = visitors.filter(
      (v) => v.BUSINESS_VERIFIED_EMAILS && v.FIRST_NAME && v.LAST_NAME
    )

    console.log(
      `[Cron Visitors] Received ${visitors.length} visitors, ${qualifiedVisitors.length} with verified emails`
    )

    if (qualifiedVisitors.length === 0) {
      return { status: 'success', message: 'No qualified visitors', processed: 0 }
    }

    // Step 2: Send events to Inngest
    const sendResult = await step.run('send-events', async () => {
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

      return inngest.send(events)
    })

    return {
      status: 'success',
      total_visitors: visitors.length,
      processed: qualifiedVisitors.length,
      has_more: apiResponse.has_more,
    }
  }
)

// ============================================================================
// CRON 3: Daily Stats (8am UTC)
// ============================================================================

export const cronDailyStats = inngest.createFunction(
  {
    id: 'cron-daily-stats',
    name: 'Daily Stats & Slack Summary',
    retries: 2,
  },
  { cron: '0 8 * * *' }, // 8am UTC daily
  async ({ step }) => {
    console.log('[Cron Stats] Generating daily stats...')

    // Step 1: Compute stats
    const stats = await step.run('compute-stats', async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Get engagement events from yesterday
      const { data: events } = await supabase
        .from('engagement_log')
        .select('event_type')
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString())

      const eventCounts: Record<string, number> = {}
      events?.forEach((e) => {
        eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1
      })

      // Get email opens
      const { count: openCount } = await supabase
        .from('email_opens')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString())

      // Get email responses
      const { data: responses } = await supabase
        .from('email_responses')
        .select('event_type')
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString())

      const responseCounts: Record<string, number> = {}
      responses?.forEach((r) => {
        responseCounts[r.event_type] = (responseCounts[r.event_type] || 0) + 1
      })

      // Get sends (deployed sequences)
      const { count: sendCount } = await supabase
        .from('email_sequences')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'deployed')
        .gte('deployed_at', yesterday.toISOString())
        .lt('deployed_at', today.toISOString())

      // Get pending reviews
      const { count: pendingReviews } = await supabase
        .from('email_sequences')
        .select('*', { count: 'exact', head: true })
        .in('review_status', ['pending', 'human_review', 'revision_needed'])

      // Get corrections learned
      const { count: correctionsLearned } = await supabase
        .from('human_corrections')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString())

      // Get recent companies
      const { data: recentLeads } = await supabase
        .from('leads')
        .select('company_name, status')
        .gte('updated_at', yesterday.toISOString())
        .order('updated_at', { ascending: false })
        .limit(5)

      const sends = sendCount || 0
      const opens = openCount || 0
      const replies = responseCounts['reply'] || 0
      const bounces = responseCounts['bounce'] || 0

      return {
        sends,
        opens,
        clicks: eventCounts['email.clicked'] || 0,
        replies,
        bounces,
        unsubscribes: responseCounts['unsubscribe'] || 0,
        openRate: sends > 0 ? Math.round((opens / sends) * 100) : 0,
        replyRate: sends > 0 ? Math.round((replies / sends) * 100) : 0,
        bounceRate: sends > 0 ? Math.round((bounces / sends) * 100) : 0,
        pendingReviews: pendingReviews || 0,
        correctionsLearned: correctionsLearned || 0,
        topCompanies: recentLeads?.map((l) => ({
          name: l.company_name || 'Unknown',
          status: l.status || 'unknown',
        })) || [],
      }
    })

    // Step 2: Send to Slack
    await step.run('send-slack-summary', async () => {
      await notifyDailySummary({
        pendingReviews: stats.pendingReviews,
        sequencesDeployed: stats.sends,
        correctionsLearned: stats.correctionsLearned,
        topCompanies: stats.topCompanies,
      })

      // Send detailed stats via webhook
      const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
      if (SLACK_WEBHOOK_URL) {
        await fetch(SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `📈 Daily Email Performance (Yesterday)`,
            blocks: [
              {
                type: 'header',
                text: { type: 'plain_text', text: '📈 Daily Email Performance', emoji: true },
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Sends:*\n${stats.sends}` },
                  { type: 'mrkdwn', text: `*Opens:*\n${stats.opens} (${stats.openRate}%)` },
                  { type: 'mrkdwn', text: `*Clicks:*\n${stats.clicks}` },
                  { type: 'mrkdwn', text: `*Replies:*\n${stats.replies} (${stats.replyRate}%)` },
                  { type: 'mrkdwn', text: `*Bounces:*\n${stats.bounces} (${stats.bounceRate}%)` },
                  { type: 'mrkdwn', text: `*Unsubscribes:*\n${stats.unsubscribes}` },
                ],
              },
              { type: 'divider' },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `_Stats from ${new Date(Date.now() - 86400000).toLocaleDateString()}_`,
                  },
                ],
              },
            ],
          }),
        })
      }
    })

    return { status: 'success', stats }
  }
)

// ============================================================================
// CRON 4: Learning Analysis (6am UTC)
// Note: This just triggers the existing learningAnalysis workflow
// ============================================================================

export const cronLearningAnalysis = inngest.createFunction(
  {
    id: 'cron-learning-analysis',
    name: 'Daily Learning Analysis Trigger',
    retries: 1,
  },
  { cron: '0 6 * * *' }, // 6am UTC daily
  async ({ step }) => {
    console.log('[Cron Learning] Triggering daily learning analysis...')

    const tenantId = process.env.TENANT_ID
    if (!tenantId) {
      throw new Error('Missing TENANT_ID environment variable')
    }

    // Trigger the learning analysis workflow
    await step.run('trigger-learning', async () => {
      await inngest.send({
        name: 'learning.analyze-requested',
        data: { tenant_id: tenantId },
      })
    })

    return { status: 'success', tenant_id: tenantId }
  }
)
