/**
 * Inngest Cron Jobs
 * All scheduled tasks run via Inngest instead of Vercel cron
 * Multi-tenant: Each cron iterates over all tenants with configured credentials
 */

import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'
import { calculateIntentScore, IntentLeadData } from '../src/lib/intent-scoring'
import { notifyDailySummary } from '../src/lib/slack-notifier'
import {
  getAllTenants,
  hasValidCredentials,
  Tenant,
  TenantSettings,
} from '../src/lib/tenant-settings'
import { createApolloClient, ApolloLead, INDUSTRY_IDS } from '../src/lib/apollo'

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

function mapVisitorToLeadEvent(
  visitor: AudienceLabVisitor,
  tenantId: string,
  source: 'pixel' | 'intent'
) {
  const eventData = parseEventData(visitor.EVENT_DATA)
  return {
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
    intent_signal:
      source === 'pixel'
        ? {
            page_visited: eventData.url || visitor.URL,
            time_on_page: eventData.timeOnPage,
            event_type: visitor.EVENT_TYPE,
            timestamp: new Date().toISOString(),
          }
        : undefined,
    tenant_id: tenantId,
    source,
  }
}

function normalizeApolloLead(
  lead: ApolloLead,
  tenantId: string,
  sourceMetadata?: Record<string, unknown>
) {
  return {
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    job_title: lead.title || undefined,
    headline: lead.headline || undefined,
    linkedin_url: lead.linkedin_url || undefined,
    company_name: lead.organization?.name || 'Unknown',
    company_linkedin_url: lead.organization?.linkedin_url || undefined,
    company_domain: lead.organization?.website_url?.replace(/^https?:\/\//, '') || undefined,
    company_employee_count: lead.organization?.estimated_num_employees || undefined,
    company_industry: lead.organization?.industry || undefined,
    tenant_id: tenantId,
    source: 'apollo' as const,
    source_metadata: sourceMetadata,
  }
}

// ============================================================================
// CRON 1: Daily Intent Data Ingestion (10am UTC) - Multi-Tenant
// ============================================================================

export const cronDailyIntent = inngest.createFunction(
  {
    id: 'cron-daily-intent',
    name: 'Daily Intent Data Ingestion (All Tenants)',
    retries: 2,
  },
  { cron: '0 10 * * *' }, // 10am UTC daily
  async ({ step }) => {
    console.log('[Cron Intent] Starting daily intent data ingestion (multi-tenant)...')

    // Get all tenants
    const tenants = await step.run('get-tenants', async () => {
      return getAllTenants()
    })

    const results: Array<{ tenant_id: string; processed: number; status: string }> = []

    // Process each tenant with intent credentials
    for (const tenant of tenants) {
      const config = tenant.settings?.integrations?.intent
      if (!config?.api_url || !config?.api_key) {
        console.log(`[Cron Intent] Skipping tenant ${tenant.id} - no intent credentials`)
        continue
      }

      const result = await step.run(`process-tenant-${tenant.id}`, async () => {
        try {
          // Fetch from tenant's intent API
          const response = await fetch(config.api_url!, {
            method: 'GET',
            headers: {
              'X-API-Key': config.api_key!,
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            throw new Error(`Intent API failed: ${response.status} ${response.statusText}`)
          }

          const apiResponse = (await response.json()) as AudienceLabResponse
          const visitors = apiResponse.data || []
          const qualifiedVisitors = visitors.filter(
            (v) => v.BUSINESS_VERIFIED_EMAILS && v.FIRST_NAME && v.LAST_NAME
          )

          if (qualifiedVisitors.length === 0) {
            return { tenant_id: tenant.id, processed: 0, status: 'no_qualified_leads' }
          }

          // Score and rank leads
          const autoResearchLimit = tenant.settings?.data_sources?.auto_research_limit ?? 20
          const minIntentScore = tenant.settings?.data_sources?.min_intent_score ?? 60

          const scoredLeads = qualifiedVisitors
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
            .filter((lead) => lead.score >= minIntentScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, 100) // Top 100

          // Send events (top N get auto-research based on tenant config)
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
              tenant_id: tenant.id,
              intent_score: lead.score,
              intent_tier: lead.tier,
              intent_breakdown: lead.breakdown,
              intent_reasoning: lead.reasoning,
              auto_research: index < autoResearchLimit,
              batch_date: new Date().toISOString().split('T')[0],
              batch_rank: index + 1,
            },
          }))

          if (events.length) await inngest.send(events)

          return {
            tenant_id: tenant.id,
            processed: events.length,
            auto_research: Math.min(autoResearchLimit, events.length),
            status: 'success',
          }
        } catch (error) {
          console.error(`[Cron Intent] Error processing tenant ${tenant.id}:`, error)
          return {
            tenant_id: tenant.id,
            processed: 0,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })

      results.push(result)
    }

    return {
      status: 'success',
      tenants_processed: results.length,
      results,
    }
  }
)

// ============================================================================
// CRON 2: Daily Pixel Visitor Ingestion (9am UTC) - Multi-Tenant
// ============================================================================

export const cronDailyVisitors = inngest.createFunction(
  {
    id: 'cron-daily-visitors',
    name: 'Daily Pixel Visitor Ingestion (All Tenants)',
    retries: 2,
  },
  { cron: '0 9 * * *' }, // 9am UTC daily
  async ({ step }) => {
    console.log('[Cron Visitors] Starting daily visitor ingestion (multi-tenant)...')

    // Get all tenants
    const tenants = await step.run('get-tenants', async () => {
      return getAllTenants()
    })

    const results: Array<{ tenant_id: string; processed: number; status: string }> = []

    // Process each tenant with pixel credentials
    for (const tenant of tenants) {
      const config = tenant.settings?.integrations?.pixel
      if (!config?.api_url || !config?.api_key) {
        console.log(`[Cron Visitors] Skipping tenant ${tenant.id} - no pixel credentials`)
        continue
      }

      const result = await step.run(`process-tenant-${tenant.id}`, async () => {
        try {
          // Fetch from tenant's pixel API
          const response = await fetch(config.api_url!, {
            method: 'GET',
            headers: {
              'X-API-Key': config.api_key!,
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            throw new Error(`Pixel API failed: ${response.status} ${response.statusText}`)
          }

          const apiResponse = (await response.json()) as AudienceLabResponse
          const visitors = apiResponse.data || []
          const qualifiedVisitors = visitors.filter(
            (v) => v.BUSINESS_VERIFIED_EMAILS && v.FIRST_NAME && v.LAST_NAME
          )

          if (qualifiedVisitors.length === 0) {
            return { tenant_id: tenant.id, processed: 0, status: 'no_qualified_visitors' }
          }

          // Send events to Inngest
          const events = qualifiedVisitors.map((visitor) => ({
            name: 'lead.ingested' as const,
            data: mapVisitorToLeadEvent(visitor, tenant.id, 'pixel'),
          }))

          if (events.length) await inngest.send(events)

          return {
            tenant_id: tenant.id,
            processed: events.length,
            status: 'success',
          }
        } catch (error) {
          console.error(`[Cron Visitors] Error processing tenant ${tenant.id}:`, error)
          return {
            tenant_id: tenant.id,
            processed: 0,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })

      results.push(result)
    }

    return {
      status: 'success',
      tenants_processed: results.length,
      results,
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
        topCompanies:
          recentLeads?.map((l) => ({
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
// Multi-Tenant: Triggers learning for each tenant
// ============================================================================

export const cronLearningAnalysis = inngest.createFunction(
  {
    id: 'cron-learning-analysis',
    name: 'Daily Learning Analysis Trigger (All Tenants)',
    retries: 1,
  },
  { cron: '0 6 * * *' }, // 6am UTC daily
  async ({ step }) => {
    console.log('[Cron Learning] Triggering daily learning analysis (multi-tenant)...')

    // Get all tenants
    const tenants = await step.run('get-tenants', async () => {
      return getAllTenants()
    })

    // Trigger learning for each tenant
    await step.run('trigger-learning', async () => {
      const events = tenants.map((tenant) => ({
        name: 'learning.analyze-requested' as const,
        data: { tenant_id: tenant.id },
      }))
      if (events.length) await inngest.send(events)
    })

    return { status: 'success', tenants_triggered: tenants.length }
  }
)

// ============================================================================
// CRON 5: Apollo Saved Searches (11am UTC)
// Processes scheduled Apollo searches for all tenants
// ============================================================================

export const cronApolloSavedSearches = inngest.createFunction(
  {
    id: 'cron-apollo-saved-searches',
    name: 'Apollo Saved Searches (All Tenants)',
    retries: 2,
  },
  { cron: '0 11 * * *' }, // 11am UTC daily - after pixel/intent
  async ({ step }) => {
    console.log('[Cron Apollo] Starting Apollo saved searches...')

    // Get all enabled saved searches with their tenant settings
    const searches = await step.run('get-searches', async () => {
      const { data, error } = await supabase
        .from('apollo_saved_searches')
        .select('*, tenants!inner(id, settings)')
        .eq('enabled', true)
        .not('schedule_cron', 'is', null)

      if (error) {
        console.error('[Cron Apollo] Failed to fetch saved searches:', error)
        return []
      }

      return data || []
    })

    if (searches.length === 0) {
      return { status: 'success', message: 'No scheduled searches', processed: 0 }
    }

    const results: Array<{
      search_id: string
      tenant_id: string
      leads_found: number
      status: string
    }> = []

    // Process each saved search
    for (const search of searches) {
      const tenant = search.tenants as unknown as { id: string; settings: TenantSettings }
      const apiKey = tenant?.settings?.integrations?.apollo?.api_key

      if (!apiKey) {
        console.log(`[Cron Apollo] Skipping search ${search.id} - tenant has no Apollo API key`)
        results.push({
          search_id: search.id,
          tenant_id: search.tenant_id,
          leads_found: 0,
          status: 'no_api_key',
        })
        continue
      }

      const result = await step.run(`search-${search.id}`, async () => {
        try {
          const apollo = createApolloClient(apiKey)
          const searchResults = await apollo.searchPeople(search.search_params)

          if (searchResults.leads.length === 0) {
            return {
              search_id: search.id,
              tenant_id: search.tenant_id,
              leads_found: 0,
              status: 'no_results',
            }
          }

          // Emit events for leads
          const events = searchResults.leads
            .filter((lead) => lead.email) // Only leads with emails
            .map((lead) => ({
              name: 'lead.ingested' as const,
              data: normalizeApolloLead(lead, search.tenant_id, {
                search_id: search.id,
                search_name: search.name,
              }),
            }))

          if (events.length) await inngest.send(events)

          // Update last run metadata
          await supabase
            .from('apollo_saved_searches')
            .update({
              last_run_at: new Date().toISOString(),
              last_result_count: searchResults.leads.length,
            })
            .eq('id', search.id)

          return {
            search_id: search.id,
            tenant_id: search.tenant_id,
            leads_found: events.length,
            total_results: searchResults.leads.length,
            status: 'success',
          }
        } catch (error) {
          console.error(`[Cron Apollo] Error processing search ${search.id}:`, error)
          return {
            search_id: search.id,
            tenant_id: search.tenant_id,
            leads_found: 0,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })

      results.push(result)
    }

    return {
      status: 'success',
      searches_processed: results.length,
      results,
    }
  }
)
