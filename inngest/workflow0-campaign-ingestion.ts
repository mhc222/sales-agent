/**
 * Workflow 0: Campaign Data Ingestion
 *
 * Campaign-centric architecture: processes data ingestion per-campaign
 * Triggered by: cron-campaign-data-ingestion (daily) or manual trigger
 *
 * Flow:
 * 1. Validate campaign is still active
 * 2. Fetch Brand ICP for qualification context
 * 3. Switch on data_source_type (intent, pixel, apollo)
 * 4. Ingest leads with campaign_id attached
 * 5. Update campaign.last_ingested_at
 */

import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'
import { NonRetriableError } from 'inngest'
import { calculateIntentScore, IntentLeadData } from '../src/lib/intent-scoring'
import { createApolloClient, ApolloLead } from '../src/lib/apollo'
import type { TenantICP, CampaignDataSourceConfig, TargetingPreference } from '../src/lib/tenant-settings'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================================
// TYPES
// ============================================================================

interface CampaignIngestionEvent {
  data: {
    campaign_id: string
    tenant_id: string
    brand_id: string
    data_source_type: string
    data_source_config: CampaignDataSourceConfig
    campaign_name: string
  }
}

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

interface BrandWithICP {
  id: string
  icp: TenantICP | null
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
// MAIN WORKFLOW
// ============================================================================

export const campaignIngestion = inngest.createFunction(
  {
    id: 'campaign-ingestion-v1',
    name: 'Campaign Data Ingestion',
    retries: 2,
    concurrency: {
      limit: 3, // Process 3 campaigns concurrently
    },
  },
  { event: 'campaign.ingest-data' },
  async ({ event, step }) => {
    const eventData = (event as CampaignIngestionEvent).data
    const {
      campaign_id,
      tenant_id,
      brand_id,
      data_source_type,
      data_source_config,
      campaign_name,
    } = eventData

    console.log(`[Campaign Ingestion] Starting: ${campaign_name} (${campaign_id})`)
    console.log(`[Campaign Ingestion] Source type: ${data_source_type}`)

    // Step 1: Validate campaign is still active
    const campaign = await step.run('validate-campaign', async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, status, auto_ingest')
        .eq('id', campaign_id)
        .single()

      if (error || !data) {
        throw new NonRetriableError(`Campaign ${campaign_id} not found`)
      }

      if (data.status !== 'active') {
        throw new NonRetriableError(`Campaign ${campaign_id} is not active (status: ${data.status})`)
      }

      return data
    })

    // Step 2: Fetch Brand ICP for qualification context
    const brand = await step.run('fetch-brand-icp', async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('id, icp')
        .eq('id', brand_id)
        .single()

      if (error) {
        console.warn(`[Campaign Ingestion] Could not fetch brand ICP: ${error.message}`)
        return null
      }

      return data as BrandWithICP | null
    })

    const brandIcp = brand?.icp
    console.log(`[Campaign Ingestion] Brand ICP loaded: ${brandIcp ? 'yes' : 'no'}`)

    // Step 3: Process based on data source type
    let result: { processed: number; status: string }

    switch (data_source_type) {
      case 'intent':
        result = await step.run('ingest-intent-data', async () => {
          return await ingestAudienceLabData(
            campaign_id,
            tenant_id,
            data_source_config,
            'intent',
            brandIcp
          )
        })
        break

      case 'pixel':
        result = await step.run('ingest-pixel-data', async () => {
          return await ingestAudienceLabData(
            campaign_id,
            tenant_id,
            data_source_config,
            'pixel',
            brandIcp
          )
        })
        break

      case 'apollo':
        result = await step.run('ingest-apollo-data', async () => {
          return await ingestApolloData(
            campaign_id,
            tenant_id,
            data_source_config,
            brandIcp
          )
        })
        break

      default:
        // csv and manual don't have auto-ingestion
        console.log(`[Campaign Ingestion] Source type ${data_source_type} does not support auto-ingestion`)
        result = { processed: 0, status: 'skipped' }
    }

    // Step 4: Update campaign.last_ingested_at
    await step.run('update-campaign-timestamp', async () => {
      await supabase
        .from('campaigns')
        .update({ last_ingested_at: new Date().toISOString() })
        .eq('id', campaign_id)
    })

    console.log(`[Campaign Ingestion] Complete: ${campaign_name} - ${result.processed} leads processed`)

    return {
      campaign_id,
      campaign_name,
      data_source_type,
      ...result,
    }
  }
)

// ============================================================================
// INGESTION FUNCTIONS
// ============================================================================

async function ingestAudienceLabData(
  campaignId: string,
  tenantId: string,
  config: CampaignDataSourceConfig,
  sourceType: 'intent' | 'pixel',
  brandIcp?: TenantICP | null
): Promise<{ processed: number; status: string }> {
  if (!config.api_url || !config.api_key) {
    console.warn(`[Campaign Ingestion] Missing AudienceLab credentials for campaign ${campaignId}`)
    return { processed: 0, status: 'missing_credentials' }
  }

  try {
    const response = await fetch(config.api_url, {
      method: 'GET',
      headers: {
        'X-API-Key': config.api_key,
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
      return { processed: 0, status: 'no_qualified_visitors' }
    }

    if (sourceType === 'intent') {
      // Score and rank intent leads
      // Note: Targeting preferences are now stored at tenant level, not in ICP
      // For campaign-level scoring, we use the base ICP criteria
      const targetingPreferences: TargetingPreference[] = []

      const scoredLeads = qualifiedVisitors
        .map((visitor) => {
          const intentData = mapVisitorToIntentLead(visitor)
          const scoreResult = calculateIntentScore(intentData, { targetingPreferences })
          return {
            visitor,
            score: scoreResult.totalScore,
            tier: scoreResult.tier,
            breakdown: scoreResult.breakdown,
            reasoning: scoreResult.reasoning,
          }
        })
        .filter((lead) => lead.score >= 50) // Minimum score threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, 100) // Top 100

      // Emit intent events with campaign_id
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
          tenant_id: tenantId,
          campaign_id: campaignId,
          intent_score: lead.score,
          intent_tier: lead.tier,
          intent_breakdown: lead.breakdown,
          intent_reasoning: lead.reasoning,
          auto_research: index < 20, // Top 20 get auto-research
          batch_date: new Date().toISOString().split('T')[0],
          batch_rank: index + 1,
        },
      }))

      if (events.length) await inngest.send(events)

      return { processed: events.length, status: 'success' }
    } else {
      // Pixel source - send directly to ingestion
      const eventData = qualifiedVisitors.map((visitor) => {
        const parsedEvent = parseEventData(visitor.EVENT_DATA)
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
              page_visited: parsedEvent.url || visitor.URL,
              time_on_page: parsedEvent.timeOnPage,
              event_type: visitor.EVENT_TYPE,
              timestamp: new Date().toISOString(),
            },
            tenant_id: tenantId,
            campaign_id: campaignId,
            source: 'pixel',
          },
        }
      })

      if (eventData.length) await inngest.send(eventData)

      return { processed: eventData.length, status: 'success' }
    }
  } catch (error) {
    console.error(`[Campaign Ingestion] AudienceLab error:`, error)
    return { processed: 0, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' } as {
      processed: number
      status: string
    }
  }
}

async function ingestApolloData(
  campaignId: string,
  tenantId: string,
  config: CampaignDataSourceConfig,
  brandIcp?: TenantICP | null
): Promise<{ processed: number; status: string }> {
  if (!config.api_key) {
    console.warn(`[Campaign Ingestion] Missing Apollo API key for campaign ${campaignId}`)
    return { processed: 0, status: 'missing_credentials' }
  }

  try {
    const apollo = createApolloClient(config.api_key)

    // Use saved search if configured, otherwise use ICP-based search
    let searchResults: { leads: ApolloLead[] }

    if (config.saved_search_id) {
      // Fetch saved search params
      const { data: savedSearch } = await supabase
        .from('apollo_saved_searches')
        .select('search_params')
        .eq('id', config.saved_search_id)
        .single()

      if (savedSearch?.search_params) {
        searchResults = await apollo.searchPeople(savedSearch.search_params)
      } else {
        console.warn(`[Campaign Ingestion] Saved search ${config.saved_search_id} not found`)
        return { processed: 0, status: 'saved_search_not_found' }
      }
    } else if (brandIcp) {
      // Build search params from ICP
      const searchParams: Record<string, unknown> = {
        per_page: 50,
      }

      // Extract job titles from personas
      const jobTitles = brandIcp.personas?.map(p => p.job_title).filter(Boolean)
      if (jobTitles?.length) {
        searchParams.person_titles = jobTitles
      }

      // Extract industries from account criteria
      const industries = brandIcp.account_criteria?.industries
        ?.filter(i => i.priority === 'high')
        .map(i => i.value)
        .filter(Boolean)
      if (industries?.length) {
        searchParams.organization_industry_tag_ids = industries
      }

      // Extract company sizes from account criteria
      const companySizes = brandIcp.account_criteria?.company_sizes
        ?.filter(s => s.priority === 'high')
        .map(s => s.value)
        .filter(Boolean)
      if (companySizes?.length) {
        searchParams.organization_num_employees_ranges = companySizes
      }

      searchResults = await apollo.searchPeople(searchParams)
    } else {
      console.warn(`[Campaign Ingestion] No saved search or ICP for Apollo campaign ${campaignId}`)
      return { processed: 0, status: 'no_search_criteria' }
    }

    if (searchResults.leads.length === 0) {
      return { processed: 0, status: 'no_results' }
    }

    // Emit events for leads with emails
    const events = searchResults.leads
      .filter((lead) => lead.email)
      .map((lead) => ({
        name: 'lead.ingested' as const,
        data: {
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
          campaign_id: campaignId,
          source: 'apollo',
          source_metadata: {
            apollo_id: lead.id,
          },
        },
      }))

    if (events.length) await inngest.send(events)

    return { processed: events.length, status: 'success' }
  } catch (error) {
    console.error(`[Campaign Ingestion] Apollo error:`, error)
    return { processed: 0, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' } as {
      processed: number
      status: string
    }
  }
}

// ============================================================================
// MANUAL TRIGGER: Ingest data for a specific campaign
// ============================================================================

export const manualCampaignIngestion = inngest.createFunction(
  {
    id: 'manual-campaign-ingestion',
    name: 'Manual Campaign Data Ingestion',
    retries: 1,
  },
  { event: 'campaign.manual-ingest' },
  async ({ event, step }) => {
    const { campaign_id } = event.data as { campaign_id: string }

    // Fetch campaign details
    const campaign = await step.run('fetch-campaign', async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, tenant_id, brand_id, data_source_type, data_source_config, name, status')
        .eq('id', campaign_id)
        .single()

      if (error || !data) {
        throw new NonRetriableError(`Campaign ${campaign_id} not found`)
      }

      return data
    })

    if (campaign.status !== 'active') {
      return { status: 'skipped', reason: `Campaign is ${campaign.status}` }
    }

    if (!campaign.data_source_type) {
      return { status: 'skipped', reason: 'No data source configured' }
    }

    // Trigger the main ingestion workflow
    await inngest.send({
      name: 'campaign.ingest-data',
      data: {
        campaign_id: campaign.id,
        tenant_id: campaign.tenant_id,
        brand_id: campaign.brand_id,
        data_source_type: campaign.data_source_type,
        data_source_config: campaign.data_source_config || {},
        campaign_name: campaign.name,
      },
    })

    return { status: 'triggered', campaign_id }
  }
)
