import { inngest } from './client'
import { NonRetriableError } from 'inngest'
import { qualifyNormalizedLead, type ExistingRecords, type BrandContext } from '../src/agents/agent1-qualification'
import { supabase, type Lead } from '../src/lib/supabase'
import { normalizeLead, type NormalizedLead } from '../src/lib/data-normalizer'
import type { Brand, Campaign } from '../src/lib/brands'

type LeadSource = 'pixel' | 'intent' | 'apollo'

interface LeadIngestedEvent {
  data: {
    first_name: string
    last_name: string
    email: string
    job_title?: string
    headline?: string
    department?: string
    seniority_level?: string
    years_experience?: number
    linkedin_url?: string
    company_name: string
    company_linkedin_url?: string
    company_domain?: string
    company_employee_count?: number
    company_revenue?: string
    company_industry?: string
    company_description?: string
    intent_signal?: Record<string, unknown>
    tenant_id: string
    source?: LeadSource
    source_metadata?: Record<string, unknown>
    // Brand/campaign context (optional - for campaign-sourced leads)
    brand_id?: string
    campaign_id?: string
  }
}

// Source priority: pixel > intent > apollo
// Pixel indicates direct website engagement (highest intent)
// Intent data is second-party data indicating interest
// Apollo is cold outbound data (lowest priority)
const SOURCE_PRIORITY: Record<LeadSource, number> = {
  pixel: 3,
  intent: 2,
  apollo: 1,
}

function shouldUpdateSource(existingSource: string | null | undefined, newSource: LeadSource): boolean {
  if (!existingSource) return true
  const existingPriority = SOURCE_PRIORITY[existingSource as LeadSource] || 0
  const newPriority = SOURCE_PRIORITY[newSource] || 0
  return newPriority > existingPriority
}

export const qualificationAndResearch = inngest.createFunction(
  {
    id: 'qualification-and-research-v1',
    name: 'Qualification & Research Pipeline',
  },
  { event: 'lead.ingested' },
  async ({ event, step }) => {
    const eventData = event.data as LeadIngestedEvent['data']
    const now = new Date().toISOString()
    const source: LeadSource = eventData.source || 'pixel' // Default to pixel for backward compatibility

    console.log(`[Workflow 1] Starting qualification for: ${eventData.email} (source: ${source})`)

    // Campaign Gate: Validate campaign is active (if campaign_id provided)
    // This is the campaign-centric architecture: workflows only run for active campaigns
    const campaignId = eventData.campaign_id
    if (campaignId) {
      await step.run('validate-campaign', async () => {
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .select('id, status')
          .eq('id', campaignId)
          .single()

        if (error || !campaign) {
          throw new NonRetriableError(`Campaign ${campaignId} not found`)
        }

        if (campaign.status !== 'active') {
          throw new NonRetriableError(`Campaign ${campaignId} is not active (status: ${campaign.status})`)
        }

        console.log(`[Workflow 1] Campaign ${campaignId} validated (active)`)
        return campaign
      })
    }

    // Normalize incoming data at the start
    const normalizedData = normalizeLead(eventData as Record<string, unknown>, source)
    console.log(`[Workflow 1] Data normalized from ${source} source`)

    // Step 1: Check if lead already exists by email
    const existingLead = await step.run('check-existing-lead', async () => {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', eventData.tenant_id)
        .eq('email', eventData.email)
        .maybeSingle()

      return data as Lead | null
    })

    const isReturningVisitor = !!existingLead
    console.log(`[Workflow 1] Returning visitor: ${isReturningVisitor}, visit count: ${existingLead?.visit_count || 0}`)

    // Step 2: Create or update lead with visit tracking
    // Use upsert pattern to handle race conditions when multiple events arrive for same email
    // Note: Visit count only increments for pixel source (actual website visits)
    const lead = await step.run('upsert-lead', async () => {
      const updateLead = async (existingId: string, existingLeadData: Lead) => {
        // Only increment visit count for pixel source (website visits)
        const newVisitCount = source === 'pixel'
          ? (existingLeadData.visit_count || 0) + 1
          : existingLeadData.visit_count || 0

        // Determine if we should update the source (based on priority)
        const newSource = shouldUpdateSource(existingLeadData.source, source)
          ? source
          : existingLeadData.source

        const { data, error } = await supabase
          .from('leads')
          .update({
            first_name: eventData.first_name,
            last_name: eventData.last_name,
            job_title: eventData.job_title,
            headline: eventData.headline,
            department: eventData.department,
            seniority_level: eventData.seniority_level,
            years_experience: eventData.years_experience,
            linkedin_url: eventData.linkedin_url,
            company_name: eventData.company_name,
            company_linkedin_url: eventData.company_linkedin_url,
            company_domain: eventData.company_domain,
            company_employee_count: eventData.company_employee_count,
            company_revenue: eventData.company_revenue,
            company_industry: eventData.company_industry,
            company_description: eventData.company_description,
            visit_count: newVisitCount,
            source: newSource,
            last_seen_at: now,
            updated_at: now,
          })
          .eq('id', existingId)
          .select()
          .single()
        if (error) throw error
        return data as Lead
      }

      if (existingLead) {
        return await updateLead(existingLead.id, existingLead)
      }

      // Try to insert new lead
      const { data, error } = await supabase
        .from('leads')
        .insert({
          tenant_id: eventData.tenant_id,
          first_name: eventData.first_name,
          last_name: eventData.last_name,
          email: eventData.email,
          job_title: eventData.job_title,
          headline: eventData.headline,
          department: eventData.department,
          seniority_level: eventData.seniority_level,
          years_experience: eventData.years_experience,
          linkedin_url: eventData.linkedin_url,
          company_name: eventData.company_name,
          company_linkedin_url: eventData.company_linkedin_url,
          company_domain: eventData.company_domain,
          company_employee_count: eventData.company_employee_count,
          company_revenue: eventData.company_revenue,
          company_industry: eventData.company_industry,
          company_description: eventData.company_description,
          intent_signal: eventData.intent_signal,
          status: 'ingested',
          source: source,
          visit_count: source === 'pixel' ? 1 : 0, // Only count pixel visits
          first_seen_at: now,
          last_seen_at: now,
          in_ghl: false,
          in_ghl_company: false,
          in_smartlead: false,
          in_heyreach: false,
          updated_at: now,
        })
        .select()
        .single()

      // Handle race condition: if insert fails due to duplicate, fetch and update instead
      if (error?.code === '23505') {
        console.log(`[Workflow 1] Race condition handled - lead already exists, updating: ${eventData.email}`)
        const { data: raceExisting } = await supabase
          .from('leads')
          .select('*')
          .eq('tenant_id', eventData.tenant_id)
          .eq('email', eventData.email)
          .single()

        if (raceExisting) {
          return await updateLead(raceExisting.id, raceExisting as Lead)
        }
      }

      if (error) throw error
      return data as Lead
    })

    // Step 3: Log pixel visit (only for pixel source - actual website visits)
    if (source === 'pixel') {
      await step.run('log-pixel-visit', async () => {
        const intentSignal = eventData.intent_signal || {}

        await supabase.from('pixel_visits').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          page_visited: intentSignal.page_visited as string || null,
          time_on_page: intentSignal.time_on_page as number || null,
          event_type: intentSignal.event_type as string || null,
          raw_event_data: intentSignal,
        })

        console.log(`[Workflow 1] Logged pixel visit #${lead.visit_count} for ${lead.email}`)
      })
    } else {
      // Log ingestion from other sources
      await step.run('log-source-ingestion', async () => {
        await supabase.from('engagement_log').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          event_type: `lead.ingested.${source}`,
          metadata: {
            source,
            source_metadata: eventData.source_metadata,
          },
        })

        console.log(`[Workflow 1] Logged ${source} ingestion for ${lead.email}`)
      })
    }

    // Step 4: Check existing systems for lead history
    const existingRecords = await step.run('check-existing-systems', async () => {
      // Normalize company name for fuzzy matching
      const normalizeCompany = (name: string) =>
        name
          .toLowerCase()
          .replace(/\b(inc|llc|corp|corporation|ltd|limited|co|company|group|holdings)\b\.?/gi, '')
          .replace(/[^a-z0-9]/g, '')
          .trim()

      const normalizedCompany = normalizeCompany(lead.company_name)

      // Check GHL for existing contact by lead_id, email, or company name
      const { data: ghlByLead } = await supabase
        .from('ghl_records')
        .select('*, leads(email, company_name)')
        .eq('lead_id', lead.id)
        .maybeSingle()

      // Also check GHL by email across all leads
      const { data: ghlByEmail } = await supabase
        .from('ghl_records')
        .select('*, leads!inner(email, company_name)')
        .eq('leads.email', lead.email)
        .maybeSingle()

      // Check GHL by company name (fuzzy match using normalized name)
      const { data: ghlByCompany } = await supabase
        .from('ghl_records')
        .select('*, leads!inner(company_name)')
        .ilike('leads.company_name', `%${normalizedCompany.slice(0, 10)}%`)
        .limit(5)

      // Combine GHL results - prioritize exact matches
      const ghlData = ghlByLead || ghlByEmail || (ghlByCompany && ghlByCompany.length > 0 ? ghlByCompany[0] : null)
      const ghlCompanyMatches = ghlByCompany || []

      // Check Smartlead for existing campaigns
      const { data: smartleadData } = await supabase
        .from('smartlead_campaigns')
        .select('*')
        .eq('lead_id', lead.id)

      // Check HeyReach for existing outreach
      const { data: heyreachData } = await supabase
        .from('heyreach_outreach')
        .select('*')
        .eq('lead_id', lead.id)

      return {
        ghl: ghlData,
        ghl_company_matches: ghlCompanyMatches,
        smartlead: smartleadData || [],
        heyreach: heyreachData || [],
      }
    })

    // Step 5: Update system presence flags
    const inGhl = !!existingRecords.ghl
    const inGhlCompany = existingRecords.ghl_company_matches && existingRecords.ghl_company_matches.length > 0
    const inSmartlead = existingRecords.smartlead.length > 0
    const inHeyreach = existingRecords.heyreach.length > 0

    if (inGhl !== lead.in_ghl || inGhlCompany !== lead.in_ghl_company || inSmartlead !== lead.in_smartlead || inHeyreach !== lead.in_heyreach) {
      await step.run('update-system-flags', async () => {
        await supabase
          .from('leads')
          .update({
            in_ghl: inGhl,
            in_ghl_company: inGhlCompany,
            in_smartlead: inSmartlead,
            in_heyreach: inHeyreach,
            updated_at: now,
          })
          .eq('id', lead.id)
      })
    }

    console.log(`[Workflow 1] System presence - GHL: ${inGhl}, GHL Company: ${inGhlCompany}, Smartlead: ${inSmartlead}, HeyReach: ${inHeyreach}`)

    // Step 5b: Fetch brand and campaign context if provided
    const brandContext = await step.run('fetch-brand-context', async () => {
      let brand: Brand | undefined
      let campaign: Campaign | undefined

      // If campaign_id provided, fetch campaign and its brand
      if (eventData.campaign_id) {
        const { data: campaignData } = await supabase
          .from('campaigns')
          .select('*, brand:brands(*)')
          .eq('id', eventData.campaign_id)
          .single()

        if (campaignData) {
          campaign = campaignData as Campaign
          brand = campaignData.brand as Brand
        }
      }
      // If only brand_id provided (no campaign), fetch just the brand
      else if (eventData.brand_id) {
        const { data: brandData } = await supabase
          .from('brands')
          .select('*')
          .eq('id', eventData.brand_id)
          .single()

        if (brandData) {
          brand = brandData as Brand
        }
      }

      if (brand) {
        console.log(`[Workflow 1] Using brand context: ${brand.name}`)
      }

      return { brand, campaign } as BrandContext
    })

    // Step 6: Check if we should run qualification or skip (for returning visitors)
    const hasExistingQualification = existingLead?.qualification_decision != null
    const autoQualifyThreshold = 5 // 5+ visits = auto-qualify (strong intent)

    // Returning visitor with existing qualification
    if (hasExistingQualification) {
      // Visit 5+: Auto-qualify due to strong intent (persistence)
      if (lead.visit_count >= autoQualifyThreshold) {
        console.log(`[Workflow 1] Auto-qualifying at visit #${lead.visit_count} (strong intent): ${lead.email}`)

        await step.run('auto-qualify-intent', async () => {
          await supabase
            .from('leads')
            .update({
              qualification_decision: 'YES',
              qualification_reasoning: `Auto-qualified: ${lead.visit_count} visits demonstrates strong intent`,
              qualification_confidence: 0.9,
              status: 'researched',
              updated_at: new Date().toISOString(),
            })
            .eq('id', lead.id)

          await supabase.from('engagement_log').insert({
            lead_id: lead.id,
            tenant_id: lead.tenant_id,
            event_type: 'qualification.auto_qualified',
            metadata: {
              visit_count: lead.visit_count,
              previous_decision: existingLead.qualification_decision,
              reason: 'Strong intent - multiple return visits',
            },
          })
        })

        // Trigger Workflow 2 for deployment
        await step.sendEvent('trigger-deployment', {
          name: 'lead.ready-for-deployment',
          data: {
            lead_id: lead.id,
            tenant_id: lead.tenant_id,
            qualification: {
              decision: 'YES',
              reasoning: `Auto-qualified: ${lead.visit_count} visits demonstrates strong intent`,
              confidence: 0.9,
              icp_fit: existingLead.icp_fit || 'medium',
            },
            visit_count: lead.visit_count,
            is_returning_visitor: true,
          },
        })

        return {
          status: 'auto_qualified',
          lead_id: lead.id,
          visit_count: lead.visit_count,
          reason: 'Strong intent - 5+ visits',
        }
      }

      // Visits 2-4: Skip qualification, just log the visit
      console.log(`[Workflow 1] Skipping qualification for returning visitor (visit #${lead.visit_count}): ${lead.email}`)

      await step.run('log-return-visit', async () => {
        await supabase.from('engagement_log').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          event_type: 'visit.return',
          metadata: {
            visit_count: lead.visit_count,
            existing_decision: existingLead.qualification_decision,
            existing_status: existingLead.status,
          },
        })
      })

      return {
        status: 'skipped_qualification',
        lead_id: lead.id,
        visit_count: lead.visit_count,
        existing_decision: existingLead.qualification_decision,
        reason: 'Returning visitor - qualification already exists',
      }
    }

    // First visit: Run Agent 1 - Qualification with normalized data
    const qualification = await step.run('agent1-qualify', async () => {
      // Update normalized data with current visit count
      const normalizedWithVisitCount: NormalizedLead = {
        ...normalizedData,
        visitCount: lead.visit_count || 1,
      }
      // Pass brand context for brand-specific ICP qualification
      return await qualifyNormalizedLead(normalizedWithVisitCount, existingRecords as ExistingRecords, brandContext)
    })

    console.log(`[Workflow 1] Qualification decision: ${qualification.decision} (confidence: ${qualification.confidence})`)

    // Step 7: Store qualification results on lead
    await step.run('store-qualification', async () => {
      await supabase
        .from('leads')
        .update({
          qualification_decision: qualification.decision,
          qualification_reasoning: qualification.reasoning,
          qualification_confidence: qualification.confidence,
          icp_fit: qualification.icp_fit,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
    })

    // Step 8: Handle decision (first-time visitors only reach this point)
    if (qualification.decision === 'NO') {
      await step.run('mark-disqualified', async () => {
        await supabase
          .from('leads')
          .update({
            status: 'disqualified',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)

        await supabase.from('engagement_log').insert({
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          event_type: 'qualification.rejected',
          metadata: {
            reason: qualification.reasoning,
            confidence: qualification.confidence,
            visit_count: lead.visit_count,
          },
        })
      })

      console.log(`[Workflow 1] Lead disqualified: ${lead.email}`)
      return { status: 'disqualified', lead_id: lead.id, visit_count: lead.visit_count }
    }

    if (qualification.decision === 'REVIEW') {
      await step.run('mark-for-review', async () => {
        await supabase
          .from('leads')
          .update({
            status: 'human_review',
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)
      })

      console.log(`[Workflow 1] Lead marked for review: ${lead.email}`)
      // For now, auto-approve in MVP
    }

    // Step 9: Mark as researched
    await step.run('mark-researched', async () => {
      await supabase
        .from('leads')
        .update({
          status: 'researched',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
    })

    // Step 10: Trigger Workflow 2
    await step.sendEvent('trigger-deployment', {
      name: 'lead.ready-for-deployment',
      data: {
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        qualification,
        visit_count: lead.visit_count,
        is_returning_visitor: isReturningVisitor,
      },
    })

    console.log(`[Workflow 1] Completed for: ${lead.email} (visit #${lead.visit_count})`)

    return {
      status: 'qualified',
      lead_id: lead.id,
      decision: qualification.decision,
      visit_count: lead.visit_count,
      is_returning_visitor: isReturningVisitor,
    }
  }
)
