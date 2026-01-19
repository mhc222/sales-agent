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
import { calculateTriggerReadiness, type TriggerReadinessInput } from '../src/lib/trigger-readiness'

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
// CRON 1: Daily AudienceLab Ingestion (9am UTC) - Multi-Tenant, Multi-Source
// Processes up to 5 AudienceLab sources per tenant (pixel + intent)
// ============================================================================

export const cronDailyAudienceLab = inngest.createFunction(
  {
    id: 'cron-daily-audiencelab',
    name: 'Daily AudienceLab Ingestion (All Tenants, All Sources)',
    retries: 2,
  },
  { cron: '0 9 * * *' }, // 9am UTC daily
  async ({ step }) => {
    console.log('[Cron AudienceLab] Starting daily ingestion (multi-tenant, multi-source)...')

    // Get all tenants
    const tenants = await step.run('get-tenants', async () => {
      return getAllTenants()
    })

    const results: Array<{
      tenant_id: string
      source_name: string
      source_type: string
      processed: number
      status: string
    }> = []

    // Process each tenant
    for (const tenant of tenants) {
      const sources = tenant.settings?.integrations?.audiencelab || []

      // Skip tenants with no AudienceLab sources configured
      if (sources.length === 0) {
        console.log(`[Cron AudienceLab] Skipping tenant ${tenant.id} - no sources configured`)
        continue
      }

      // Process each source (up to 5)
      for (const source of sources.slice(0, 5)) {
        if (!source.enabled || !source.api_url || !source.api_key) {
          console.log(`[Cron AudienceLab] Skipping source ${source.name} for tenant ${tenant.id} - disabled or missing credentials`)
          continue
        }

        const sourceKey = `${tenant.id}-${source.name}`.replace(/[^a-zA-Z0-9-]/g, '_')
        const result = await step.run(`process-${sourceKey}`, async () => {
          try {
            // Fetch from this source's API
            const response = await fetch(source.api_url, {
              method: 'GET',
              headers: {
                'X-API-Key': source.api_key,
                'Content-Type': 'application/json',
              },
            })

            if (!response.ok) {
              throw new Error(`AudienceLab API failed: ${response.status} ${response.statusText}`)
            }

            const apiResponse = (await response.json()) as AudienceLabResponse
            const visitors = apiResponse.data || []
            const qualifiedVisitors = visitors.filter(
              (v) => v.BUSINESS_VERIFIED_EMAILS && v.FIRST_NAME && v.LAST_NAME
            )

            if (qualifiedVisitors.length === 0) {
              return {
                tenant_id: tenant.id,
                source_name: source.name,
                source_type: source.type,
                processed: 0,
                status: 'no_qualified_visitors',
              }
            }

            // Handle differently based on source type
            if (source.type === 'intent') {
              // Score and rank intent leads
              const autoResearchLimit = tenant.settings?.data_sources?.auto_research_limit ?? 20
              const minIntentScore = tenant.settings?.data_sources?.min_intent_score ?? 60
              const targetingPreferences = tenant.settings?.targeting_preferences || []

              const scoredLeads = qualifiedVisitors
                .map((visitor) => {
                  const intentData = mapVisitorToIntentLead(visitor)
                  const scoreResult = calculateIntentScore(intentData, { targetingPreferences })
                  return {
                    visitor,
                    intentData,
                    score: scoreResult.totalScore,
                    tier: scoreResult.tier,
                    breakdown: scoreResult.breakdown,
                    reasoning: scoreResult.reasoning,
                    preferenceAdjustments: scoreResult.preferenceAdjustments,
                  }
                })
                .filter((lead) => lead.score >= minIntentScore)
                .sort((a, b) => b.score - a.score)
                .slice(0, 100) // Top 100

              // Send intent events (top N get auto-research)
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
                  source_name: source.name,
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
                source_name: source.name,
                source_type: source.type,
                processed: events.length,
                auto_research: Math.min(autoResearchLimit, events.length),
                status: 'success',
              }
            } else {
              // Pixel source - send directly to ingestion
              const events = qualifiedVisitors.map((visitor) => ({
                name: 'lead.ingested' as const,
                data: {
                  ...mapVisitorToLeadEvent(visitor, tenant.id, 'pixel'),
                  source_name: source.name,
                },
              }))

              if (events.length) await inngest.send(events)

              return {
                tenant_id: tenant.id,
                source_name: source.name,
                source_type: source.type,
                processed: events.length,
                status: 'success',
              }
            }
          } catch (error) {
            console.error(`[Cron AudienceLab] Error processing source ${source.name} for tenant ${tenant.id}:`, error)
            return {
              tenant_id: tenant.id,
              source_name: source.name,
              source_type: source.type,
              processed: 0,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            }
          }
        })

        results.push(result)
      }
    }

    return {
      status: 'success',
      sources_processed: results.length,
      results,
    }
  }
)

// Legacy cron aliases for backwards compatibility
export const cronDailyIntent = cronDailyAudienceLab
export const cronDailyVisitors = cronDailyAudienceLab

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

// ============================================================================
// CRON 6: Nureply Engagement Sync (Every 15 minutes)
// Polls Nureply for replies since they don't support webhooks
// ============================================================================

export const cronNureplySync = inngest.createFunction(
  {
    id: 'cron-nureply-sync',
    name: 'Nureply Engagement Sync (All Tenants)',
    retries: 2,
  },
  { cron: '*/15 * * * *' }, // Every 15 minutes
  async ({ step }) => {
    console.log('[Cron Nureply] Starting engagement sync...')

    // Dynamic import to avoid loading nureply client in other contexts
    const nureply = await import('../src/lib/nureply')

    // Get all tenants using Nureply
    const tenants = await step.run('get-nureply-tenants', async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, settings')
        .or('settings->>email_provider.eq.nureply,settings->integrations->nureply->>enabled.eq.true')

      return data || []
    })

    if (tenants.length === 0) {
      return { status: 'success', message: 'No tenants using Nureply', processed: 0 }
    }

    const results: Array<{
      tenant_id: string
      replies_processed: number
      status: string
    }> = []

    for (const tenant of tenants) {
      const nureplyConfig = (tenant.settings as TenantSettings)?.integrations?.nureply
      if (!nureplyConfig?.api_key) {
        console.log(`[Cron Nureply] Skipping tenant ${tenant.id} - no API key`)
        continue
      }

      const result = await step.run(`sync-${tenant.id}`, async () => {
        try {
          const config = { apiKey: nureplyConfig.api_key! }

          // Get replies since last sync (or last 24 hours)
          const lastSync = nureplyConfig.last_sync
            ? new Date(nureplyConfig.last_sync)
            : new Date(Date.now() - 24 * 60 * 60 * 1000)

          const replies = await nureply.getReceivedReplies(config, {
            since: lastSync,
            limit: 100,
          })

          if (replies.length === 0) {
            // Update last sync even if no replies
            await supabase
              .from('tenants')
              .update({
                settings: {
                  ...(tenant.settings as Record<string, unknown>),
                  integrations: {
                    ...((tenant.settings as TenantSettings)?.integrations || {}),
                    nureply: {
                      ...nureplyConfig,
                      last_sync: new Date().toISOString(),
                    },
                  },
                },
              })
              .eq('id', tenant.id)

            return {
              tenant_id: tenant.id,
              replies_processed: 0,
              status: 'success',
            }
          }

          // Process each reply
          for (const reply of replies) {
            // Find the lead by email
            const { data: lead } = await supabase
              .from('leads')
              .select('id, email_sequence_id')
              .eq('email', reply.leadEmail)
              .eq('tenant_id', tenant.id)
              .single()

            if (!lead) continue

            // Check if we already processed this reply
            const { data: existing } = await supabase
              .from('email_responses')
              .select('id')
              .eq('lead_id', lead.id)
              .eq('event_type', 'reply')
              .eq('received_at', reply.receivedAt)
              .single()

            if (existing) continue

            // Store the reply
            await supabase.from('email_responses').insert({
              lead_id: lead.id,
              sequence_id: lead.email_sequence_id,
              event_type: 'reply',
              email_number: reply.sequenceNumber,
              reply_text: reply.body,
              received_at: reply.receivedAt,
              tenant_id: tenant.id,
              provider: 'nureply',
            })

            // Emit event for reply classification workflow
            await inngest.send({
              name: 'email.reply-received' as const,
              data: {
                leadId: lead.id,
                replyText: reply.body,
                tenantId: tenant.id,
                provider: 'nureply',
              },
            })
          }

          // Update last sync timestamp
          await supabase
            .from('tenants')
            .update({
              settings: {
                ...(tenant.settings as Record<string, unknown>),
                integrations: {
                  ...((tenant.settings as TenantSettings)?.integrations || {}),
                  nureply: {
                    ...nureplyConfig,
                    last_sync: new Date().toISOString(),
                  },
                },
              },
            })
            .eq('id', tenant.id)

          return {
            tenant_id: tenant.id,
            replies_processed: replies.length,
            status: 'success',
          }
        } catch (error) {
          console.error(`[Cron Nureply] Error syncing tenant ${tenant.id}:`, error)
          return {
            tenant_id: tenant.id,
            replies_processed: 0,
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
// CRON 7: HeyReach Engagement Sync (Backup - Daily)
// Backup sync for any missed webhooks - HeyReach now sends webhooks for real-time updates
// Primary webhook handler: /api/webhooks/heyreach
// ============================================================================

export const cronHeyReachSync = inngest.createFunction(
  {
    id: 'cron-heyreach-sync',
    name: 'HeyReach Backup Sync (All Tenants)',
    retries: 2,
  },
  { cron: '0 7 * * *' }, // Daily at 7am UTC (backup only, webhooks handle real-time)
  async ({ step }) => {
    console.log('[Cron HeyReach] Starting engagement sync...')

    // Dynamic import
    const heyreach = await import('../src/lib/heyreach')

    // Get all tenants using HeyReach
    const tenants = await step.run('get-heyreach-tenants', async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, settings')
        .or('settings->>linkedin_provider.eq.heyreach,settings->integrations->heyreach->>enabled.eq.true')

      return data || []
    })

    if (tenants.length === 0) {
      return { status: 'success', message: 'No tenants using HeyReach', processed: 0 }
    }

    const results: Array<{
      tenant_id: string
      conversations_processed: number
      status: string
    }> = []

    for (const tenant of tenants) {
      const heyreachConfig = (tenant.settings as TenantSettings)?.integrations?.heyreach
      if (!heyreachConfig?.api_key) {
        console.log(`[Cron HeyReach] Skipping tenant ${tenant.id} - no API key`)
        continue
      }

      const result = await step.run(`sync-${tenant.id}`, async () => {
        try {
          const config = { apiKey: heyreachConfig.api_key! }

          // Get unread conversations
          const conversations = await heyreach.getConversations(config, {
            unreadOnly: true,
            limit: 50,
          })

          if (conversations.length === 0) {
            return {
              tenant_id: tenant.id,
              conversations_processed: 0,
              status: 'success',
            }
          }

          // Process each conversation
          for (const conv of conversations) {
            // Find the lead by LinkedIn URL
            const { data: lead } = await supabase
              .from('leads')
              .select('id')
              .eq('linkedin_url', conv.linkedinUrl)
              .eq('tenant_id', tenant.id)
              .single()

            if (!lead) continue

            // Store the reply
            await supabase.from('linkedin_responses').upsert({
              lead_id: lead.id,
              conversation_id: conv.conversationId,
              last_message: conv.lastMessage,
              received_at: conv.lastMessageAt,
              tenant_id: tenant.id,
              provider: 'heyreach',
            })

            // Emit event for reply handling
            await inngest.send({
              name: 'linkedin.reply-received' as const,
              data: {
                leadId: lead.id,
                message: conv.lastMessage,
                tenantId: tenant.id,
                conversationId: conv.conversationId,
              },
            })
          }

          return {
            tenant_id: tenant.id,
            conversations_processed: conversations.length,
            status: 'success',
          }
        } catch (error) {
          console.error(`[Cron HeyReach] Error syncing tenant ${tenant.id}:`, error)
          return {
            tenant_id: tenant.id,
            conversations_processed: 0,
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
// CRON 8: Re-evaluate Holding Leads (Weekly, Monday 6am UTC)
// Checks if leads in "holding" status now have sufficient triggers
// ============================================================================

interface ResearchRecordSignals {
  persona_match?: { type: string; decision_level: string }
  triggers?: Array<{ type?: string; fact?: string }>
  messaging_angles?: Array<{ angle?: string }>
  enhanced?: {
    intentScore?: number
    intentTier?: 'hot' | 'warm' | 'cold' | 'research'
    painSignals?: Array<{ topic: string; confidence: string }>
    compositeTriggers?: Record<string, boolean>
    outreachGuidance?: {
      urgency?: 'high' | 'medium' | 'low'
    }
    bestHook?: { topic: string; angle: string } | null
  }
}

interface HoldingLeadWithResearch {
  id: string
  email: string
  first_name: string
  last_name: string
  company_name: string
  source: string | null
  tenant_id: string
  research_records: Array<{ extracted_signals: ResearchRecordSignals | null }> | null
}

export const cronReevaluateHolding = inngest.createFunction(
  {
    id: 'cron-reevaluate-holding-leads',
    name: 'Re-evaluate Holding Leads (Weekly)',
    retries: 1,
  },
  { cron: '0 6 * * 1' }, // Every Monday at 6 AM UTC
  async ({ step }) => {
    console.log('[Cron Reevaluate] Starting weekly re-evaluation of holding leads')

    // Get all leads in holding status with their research data
    const holdingLeads = await step.run('fetch-holding-leads', async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          id,
          email,
          first_name,
          last_name,
          company_name,
          source,
          tenant_id,
          research_records (
            extracted_signals
          )
        `)
        .eq('status', 'holding')
        .limit(500)

      if (error) {
        console.error('[Cron Reevaluate] Error fetching holding leads:', error)
        throw error
      }

      return (data || []) as HoldingLeadWithResearch[]
    })

    console.log(`[Cron Reevaluate] Found ${holdingLeads.length} leads in holding status`)

    if (holdingLeads.length === 0) {
      return { status: 'completed', processed: 0, promoted: 0, stillHolding: 0 }
    }

    let promoted = 0
    let stillHolding = 0
    let errors = 0

    for (const lead of holdingLeads) {
      const result = await step.run(`evaluate-${lead.id}`, async () => {
        try {
          const research = lead.research_records?.[0]?.extracted_signals
          if (!research?.enhanced) {
            return { action: 'hold', reason: 'No research data' }
          }

          const contextProfile: TriggerReadinessInput = {
            outreachGuidance: {
              urgency: research.enhanced.outreachGuidance?.urgency || 'low',
              compositeTriggers: research.enhanced.compositeTriggers || {},
            },
            engagementStrategy: {
              triggerEvent: research.triggers?.[0]?.fact || null,
              urgencyLevel: research.enhanced.outreachGuidance?.urgency || 'low',
            },
          }

          const readiness = calculateTriggerReadiness(contextProfile, lead.source || 'apollo')

          if (readiness.isReadyForOutreach) {
            await supabase
              .from('leads')
              .update({ status: 'researched', updated_at: new Date().toISOString() })
              .eq('id', lead.id)

            await supabase.from('engagement_log').insert({
              lead_id: lead.id,
              tenant_id: lead.tenant_id,
              event_type: 'lead.promoted_from_holding',
              metadata: {
                trigger_score: readiness.score,
                trigger_tier: readiness.tier,
                strongest_trigger: readiness.strongestTrigger,
                reasons: readiness.reasons,
              },
            })

            await inngest.send({
              name: 'lead.research-complete' as const,
              data: {
                lead_id: lead.id,
                tenant_id: lead.tenant_id,
                persona_match: research.persona_match || { type: 'unknown', decision_level: 'unknown' },
                top_triggers: research.triggers?.slice(0, 3) || [],
                messaging_angles: research.messaging_angles || [],
                qualification: {
                  decision: 'qualified',
                  reasoning: 'Promoted from holding - triggers now sufficient',
                  confidence: 0.7,
                  icp_fit: 'medium',
                },
                enhanced: {
                  intentScore: research.enhanced.intentScore || 0,
                  intentTier: research.enhanced.intentTier || 'cold',
                  painSignals: research.enhanced.painSignals || [],
                  outreachGuidance: research.enhanced.outreachGuidance || {},
                  compositeTriggers: research.enhanced.compositeTriggers || {},
                  bestHook: research.enhanced.bestHook || null,
                  triggerReadiness: {
                    score: readiness.score,
                    tier: readiness.tier,
                    strongestTrigger: readiness.strongestTrigger,
                  },
                },
              },
            })

            console.log(`[Cron Reevaluate] Promoted ${lead.email} (score: ${readiness.score})`)
            return { action: 'promote', score: readiness.score }
          } else {
            await supabase.from('engagement_log').insert({
              lead_id: lead.id,
              tenant_id: lead.tenant_id,
              event_type: 'lead.holding_reevaluated',
              metadata: {
                trigger_score: readiness.score,
                trigger_tier: readiness.tier,
                missing_triggers: readiness.missingTriggers,
                next_evaluation: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              },
            })
            return { action: 'hold', score: readiness.score }
          }
        } catch (err) {
          console.error(`[Cron Reevaluate] Error evaluating lead ${lead.id}:`, err)
          return { action: 'error', error: String(err) }
        }
      })

      if (result.action === 'promote') promoted++
      else if (result.action === 'hold') stillHolding++
      else errors++
    }

    console.log(`[Cron Reevaluate] Complete: ${promoted} promoted, ${stillHolding} still holding, ${errors} errors`)

    return { status: 'completed', processed: holdingLeads.length, promoted, stillHolding, errors }
  }
)

// Manual trigger: Re-evaluate holding leads for a specific tenant
export const reevaluateHoldingForTenant = inngest.createFunction(
  {
    id: 'reevaluate-holding-for-tenant',
    name: 'Re-evaluate Holding Leads (Single Tenant)',
    retries: 1,
  },
  { event: 'tenant.reevaluate-holding' },
  async ({ event, step }) => {
    const { tenant_id } = event.data as { tenant_id: string }

    const holdingLeads = await step.run('fetch-tenant-holding-leads', async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          id, email, first_name, last_name, company_name, source, tenant_id,
          research_records (extracted_signals)
        `)
        .eq('status', 'holding')
        .eq('tenant_id', tenant_id)
        .limit(200)

      if (error) throw error
      return (data || []) as HoldingLeadWithResearch[]
    })

    let promoted = 0

    for (const lead of holdingLeads) {
      const result = await step.run(`evaluate-${lead.id}`, async () => {
        const research = lead.research_records?.[0]?.extracted_signals
        if (!research?.enhanced) return { action: 'hold' }

        const contextProfile: TriggerReadinessInput = {
          outreachGuidance: {
            urgency: research.enhanced.outreachGuidance?.urgency || 'low',
            compositeTriggers: research.enhanced.compositeTriggers || {},
          },
          engagementStrategy: {
            triggerEvent: research.triggers?.[0]?.fact || null,
            urgencyLevel: research.enhanced.outreachGuidance?.urgency || 'low',
          },
        }

        const readiness = calculateTriggerReadiness(contextProfile, lead.source || 'apollo')

        if (readiness.isReadyForOutreach) {
          await supabase
            .from('leads')
            .update({ status: 'researched', updated_at: new Date().toISOString() })
            .eq('id', lead.id)

          await inngest.send({
            name: 'lead.research-complete' as const,
            data: {
              lead_id: lead.id,
              tenant_id: lead.tenant_id,
              persona_match: research.persona_match || { type: 'unknown', decision_level: 'unknown' },
              top_triggers: research.triggers?.slice(0, 3) || [],
              messaging_angles: research.messaging_angles || [],
              qualification: { decision: 'qualified', reasoning: 'Promoted from holding', confidence: 0.7, icp_fit: 'medium' },
              enhanced: { triggerReadiness: { score: readiness.score, tier: readiness.tier, strongestTrigger: readiness.strongestTrigger } },
            },
          })
          return { action: 'promote' }
        }
        return { action: 'hold' }
      })

      if (result.action === 'promote') promoted++
    }

    return { processed: holdingLeads.length, promoted }
  }
)
