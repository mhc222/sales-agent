import { inngest } from './client'
import { NonRetriableError } from 'inngest'
import { supabase, type Lead } from '../src/lib/supabase'
import { normalizeLead, type NormalizedLead } from '../src/lib/data-normalizer'

/**
 * Workflow 0: Intent Data Qualification
 *
 * Handles leads from daily intent data (AudienceLab intent segment):
 * 1. Create/update lead with source=intent_data
 * 2. Check existing systems (GHL, Smartlead, HeyReach)
 * 3. Store intent score and signals
 * 4. Log to intent_data table
 * 5. If auto_research=true (top 20), trigger Workflow 2
 */

interface IntentIngestedEvent {
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
    tenant_id: string
    campaign_id?: string // Campaign-centric architecture: links lead to campaign
    // Intent-specific fields
    intent_score: number
    intent_tier: 'strong' | 'medium' | 'weak'
    intent_breakdown: {
      industry: number
      revenue: number
      title: number
      companySize: number
      dataQuality: number
    }
    intent_reasoning: string[]
    auto_research: boolean
    batch_date: string
    batch_rank: number
  }
}

export const intentQualification = inngest.createFunction(
  {
    id: 'intent-qualification-v1',
    name: 'Intent Data Qualification Pipeline',
    concurrency: {
      limit: 5, // Process up to 5 intent leads concurrently (plan limit)
    },
  },
  { event: 'lead.intent-ingested' },
  async ({ event, step }) => {
    const eventData = event.data as IntentIngestedEvent['data']
    const now = new Date().toISOString()

    console.log(`[Intent Workflow] Processing: ${eventData.email} (score: ${eventData.intent_score}, rank: ${eventData.batch_rank})`)

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

        console.log(`[Intent Workflow] Campaign ${campaignId} validated (active)`)
        return campaign
      })
    }

    // Normalize incoming data at the start
    const normalizedData = normalizeLead(eventData as Record<string, unknown>, 'intent')
    console.log(`[Intent Workflow] Data normalized from intent source`)

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

    const isExistingLead = !!existingLead
    console.log(`[Intent Workflow] Existing lead: ${isExistingLead}`)

    // Step 2: Create or update lead with intent data
    const lead = await step.run('upsert-lead', async () => {
      const intentSignals = {
        score: eventData.intent_score,
        tier: eventData.intent_tier,
        breakdown: eventData.intent_breakdown,
        reasoning: eventData.intent_reasoning,
        batch_date: eventData.batch_date,
        batch_rank: eventData.batch_rank,
        auto_research: eventData.auto_research,
      }

      if (existingLead) {
        // Update existing lead - don't overwrite pixel data, just add intent data
        const { data, error } = await supabase
          .from('leads')
          .update({
            // Only update if new data is better/more complete
            job_title: eventData.job_title || existingLead.job_title,
            headline: eventData.headline || existingLead.headline,
            department: eventData.department || existingLead.department,
            seniority_level: eventData.seniority_level || existingLead.seniority_level,
            years_experience: eventData.years_experience || existingLead.years_experience,
            linkedin_url: eventData.linkedin_url || existingLead.linkedin_url,
            company_linkedin_url: eventData.company_linkedin_url || existingLead.company_linkedin_url,
            company_domain: eventData.company_domain || existingLead.company_domain,
            company_employee_count: eventData.company_employee_count || existingLead.company_employee_count,
            company_revenue: eventData.company_revenue || existingLead.company_revenue,
            company_industry: eventData.company_industry || existingLead.company_industry,
            company_description: eventData.company_description || existingLead.company_description,
            // Intent-specific fields (always update)
            intent_score: eventData.intent_score,
            intent_signals: intentSignals,
            // Keep existing source if pixel, otherwise set to intent_data
            source: existingLead.source === 'jsb_site_pixel' ? existingLead.source : 'intent_data',
            updated_at: now,
          })
          .eq('id', existingLead.id)
          .select()
          .single()

        if (error) throw error
        return data as Lead
      }

      // Create new lead
      const { data, error } = await supabase
        .from('leads')
        .insert({
          tenant_id: eventData.tenant_id,
          campaign_id: eventData.campaign_id, // Campaign-centric: link lead to campaign
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
          // Intent-specific fields
          source: 'intent_data',
          intent_score: eventData.intent_score,
          intent_signals: intentSignals,
          // Initial status
          status: eventData.auto_research ? 'researched' : 'qualified',
          visit_count: 0, // Intent leads don't have pixel visits
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

      // Handle race condition
      if (error?.code === '23505') {
        console.log(`[Intent Workflow] Race condition - lead exists: ${eventData.email}`)
        const { data: raceExisting } = await supabase
          .from('leads')
          .select('*')
          .eq('tenant_id', eventData.tenant_id)
          .eq('email', eventData.email)
          .single()

        if (raceExisting) {
          const { data: updated } = await supabase
            .from('leads')
            .update({
              intent_score: eventData.intent_score,
              intent_signals: intentSignals,
              updated_at: now,
            })
            .eq('id', raceExisting.id)
            .select()
            .single()
          return updated as Lead
        }
      }

      if (error) throw error
      return data as Lead
    })

    // Step 3: Log to intent_data table (raw ingestion log)
    await step.run('log-intent-data', async () => {
      await supabase.from('intent_data').insert({
        lead_id: lead.id,
        email: eventData.email,
        raw_data: eventData,
        intent_score: eventData.intent_score,
        batch_date: eventData.batch_date,
        processed: true,
        auto_researched: eventData.auto_research,
      })

      console.log(`[Intent Workflow] Logged intent data for ${lead.email}`)
    })

    // Step 4: Check existing systems for lead history
    const existingRecords = await step.run('check-existing-systems', async () => {
      const normalizeCompany = (name: string) =>
        name
          .toLowerCase()
          .replace(/\b(inc|llc|corp|corporation|ltd|limited|co|company|group|holdings)\b\.?/gi, '')
          .replace(/[^a-z0-9]/g, '')
          .trim()

      const normalizedCompany = normalizeCompany(lead.company_name)

      // Check GHL
      const { data: ghlByLead } = await supabase
        .from('ghl_records')
        .select('*, leads(email, company_name)')
        .eq('lead_id', lead.id)
        .maybeSingle()

      const { data: ghlByEmail } = await supabase
        .from('ghl_records')
        .select('*, leads!inner(email, company_name)')
        .eq('leads.email', lead.email)
        .maybeSingle()

      const { data: ghlByCompany } = await supabase
        .from('ghl_records')
        .select('*, leads!inner(company_name)')
        .ilike('leads.company_name', `%${normalizedCompany.slice(0, 10)}%`)
        .limit(5)

      const ghlData = ghlByLead || ghlByEmail || (ghlByCompany && ghlByCompany.length > 0 ? ghlByCompany[0] : null)

      // Check Smartlead
      const { data: smartleadData } = await supabase
        .from('smartlead_campaigns')
        .select('*')
        .eq('lead_id', lead.id)

      // Check HeyReach
      const { data: heyreachData } = await supabase
        .from('heyreach_outreach')
        .select('*')
        .eq('lead_id', lead.id)

      return {
        ghl: ghlData,
        ghl_company_matches: ghlByCompany || [],
        smartlead: smartleadData || [],
        heyreach: heyreachData || [],
      }
    })

    // Step 5: Update system presence flags
    const inGhl = !!existingRecords.ghl
    const inGhlCompany = existingRecords.ghl_company_matches.length > 0
    const inSmartlead = existingRecords.smartlead.length > 0
    const inHeyreach = existingRecords.heyreach.length > 0

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

    console.log(`[Intent Workflow] System presence - GHL: ${inGhl}, Smartlead: ${inSmartlead}, HeyReach: ${inHeyreach}`)

    // Step 6: Log engagement event
    await step.run('log-engagement', async () => {
      await supabase.from('engagement_log').insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        event_type: 'intent.ingested',
        metadata: {
          score: eventData.intent_score,
          tier: eventData.intent_tier,
          batch_rank: eventData.batch_rank,
          auto_research: eventData.auto_research,
          is_existing_lead: isExistingLead,
        },
      })
    })

    // Step 7: If auto_research (top 20), trigger Workflow 2
    if (eventData.auto_research) {
      console.log(`[Intent Workflow] Auto-triggering research for top ${eventData.batch_rank} lead: ${lead.email}`)

      // Update status to researched
      await step.run('mark-for-research', async () => {
        await supabase
          .from('leads')
          .update({
            status: 'researched',
            // Set qualification based on intent score
            qualification_decision: eventData.intent_score >= 70 ? 'YES' : 'REVIEW',
            qualification_reasoning: `Intent score: ${eventData.intent_score}/100 (rank #${eventData.batch_rank} in daily batch). ${eventData.intent_reasoning.join(' ')}`,
            qualification_confidence: eventData.intent_score / 100,
            icp_fit: eventData.intent_tier,
            updated_at: now,
          })
          .eq('id', lead.id)
      })

      // Trigger Workflow 2
      await step.sendEvent('trigger-deployment', {
        name: 'lead.ready-for-deployment',
        data: {
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          qualification: {
            decision: eventData.intent_score >= 70 ? 'YES' : 'REVIEW',
            reasoning: `Intent score: ${eventData.intent_score}/100 (rank #${eventData.batch_rank})`,
            confidence: eventData.intent_score / 100,
            icp_fit: eventData.intent_tier,
          },
          visit_count: 0,
          is_returning_visitor: false,
          source: 'intent_data',
        },
      })

      return {
        status: 'auto_researched',
        lead_id: lead.id,
        email: lead.email,
        intent_score: eventData.intent_score,
        batch_rank: eventData.batch_rank,
        triggered_workflow2: true,
      }
    }

    // Check if score is below 60 - log but don't process further
    if (eventData.intent_score < 60) {
      console.log(`[Intent Workflow] Low score lead (logged only): ${lead.email} (score: ${eventData.intent_score})`)

      await step.run('mark-low-score', async () => {
        await supabase
          .from('leads')
          .update({
            status: 'low_score',
            qualification_decision: 'NO',
            qualification_reasoning: `Intent score: ${eventData.intent_score}/100 - below threshold (60). Logged for reference.`,
            qualification_confidence: eventData.intent_score / 100,
            icp_fit: eventData.intent_tier,
            updated_at: now,
          })
          .eq('id', lead.id)
      })

      return {
        status: 'low_score',
        lead_id: lead.id,
        email: lead.email,
        intent_score: eventData.intent_score,
        batch_rank: eventData.batch_rank,
        triggered_workflow2: false,
        message: 'Below score threshold - logged only',
      }
    }

    // Score 60+ but not in top 20 - stays in qualified status for manual review
    console.log(`[Intent Workflow] Lead qualified (manual review): ${lead.email} (score: ${eventData.intent_score}, rank: ${eventData.batch_rank})`)

    await step.run('mark-qualified', async () => {
      await supabase
        .from('leads')
        .update({
          status: 'qualified',
          qualification_decision: eventData.intent_score >= 70 ? 'YES' : 'NO',
          qualification_reasoning: `Intent score: ${eventData.intent_score}/100 (rank #${eventData.batch_rank}). Available for manual research trigger.`,
          qualification_confidence: eventData.intent_score / 100,
          icp_fit: eventData.intent_tier,
          updated_at: now,
        })
        .eq('id', lead.id)
    })

    return {
      status: 'qualified',
      lead_id: lead.id,
      email: lead.email,
      intent_score: eventData.intent_score,
      batch_rank: eventData.batch_rank,
      triggered_workflow2: false,
      message: 'Available for manual research trigger',
    }
  }
)
