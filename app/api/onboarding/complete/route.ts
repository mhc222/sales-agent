import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { createServiceClient } from '@/src/lib/supabase-server'
import type {
  AccountCriteria,
  ICPPersona,
  ICPTrigger,
  TenantICP,
} from '@/src/lib/tenant-settings'

// Types for the onboarding data
interface ICPData {
  accountCriteria: AccountCriteria | null
  personas: ICPPersona[]
  triggers: ICPTrigger[]
  researchStatus: 'idle' | 'loading' | 'complete' | 'error'
  marketResearch: string
}

interface AudienceLabSource {
  name: string
  apiUrl: string
  apiKey: string
  type: 'pixel' | 'intent'
  enabled: boolean
}

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { company, icp, channels, emailProvider, apollo, audienceLab, linkedIn, dnc } = body

    // Validate required fields
    if (!company?.companyName || !company?.yourName || !company?.websiteUrl) {
      return NextResponse.json({ error: 'Company information is required' }, { status: 400 })
    }

    if (!icp?.accountCriteria || !icp?.personas?.length || !icp?.triggers?.length) {
      return NextResponse.json({ error: 'ICP research must be completed' }, { status: 400 })
    }

    // Validate channels selection
    const outreachChannels = channels?.outreachChannels || ['email']
    const dataSources = channels?.dataSources || ['apollo']

    if (outreachChannels.length === 0) {
      return NextResponse.json({ error: 'At least one outreach channel is required' }, { status: 400 })
    }

    // Validate email provider if email channel selected
    if (outreachChannels.includes('email') && (!emailProvider?.provider || !emailProvider?.apiKey)) {
      return NextResponse.json({ error: 'Email provider is required when email channel is selected' }, { status: 400 })
    }

    // Validate LinkedIn provider if linkedin channel selected
    if (outreachChannels.includes('linkedin') && !linkedIn?.skip && !linkedIn?.apiKey) {
      return NextResponse.json({ error: 'HeyReach API key is required when LinkedIn channel is selected' }, { status: 400 })
    }

    if (!apollo?.apiKey) {
      return NextResponse.json({ error: 'Apollo API key is required' }, { status: 400 })
    }

    // Use service client for admin operations (bypasses RLS)
    const serviceClient = createServiceClient()

    // Create tenant
    const slug = company.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Build integrations config
    const integrations: Record<string, unknown> = {
      apollo: { api_key: apollo.apiKey, enabled: true },
    }

    // Email provider (only if email channel selected)
    if (outreachChannels.includes('email') && emailProvider?.provider) {
      integrations[emailProvider.provider] = {
        api_key: emailProvider.apiKey,
        ...(emailProvider.campaignId && { campaign_id: emailProvider.campaignId }),
        enabled: true,
      }
    }

    // LinkedIn provider (only if linkedin channel selected)
    if (outreachChannels.includes('linkedin') && linkedIn?.apiKey && !linkedIn.skip) {
      integrations.heyreach = {
        api_key: linkedIn.apiKey,
        enabled: true,
      }
    }

    // AudienceLab sources (only if audiencelab data source selected)
    if (dataSources.includes('audiencelab') && audienceLab?.sources?.length > 0 && !audienceLab.skip) {
      integrations.audiencelab = audienceLab.sources.slice(0, 5).map((s: AudienceLabSource) => ({
        name: s.name,
        api_url: s.apiUrl,
        api_key: s.apiKey,
        type: s.type,
        enabled: s.enabled ?? true,
      }))
    }

    // Build ICP config from research data
    const icpConfig: TenantICP = {
      source_url: company.websiteUrl,
      account_criteria: icp.accountCriteria,
      personas: icp.personas,
      triggers: icp.triggers,
      research_completed_at: new Date().toISOString(),
    }

    const settings = {
      integrations,
      // Active email provider (null if email not selected)
      email_provider: outreachChannels.includes('email') ? emailProvider?.provider : null,
      // Active linkedin provider (null if linkedin not selected)
      linkedin_provider: outreachChannels.includes('linkedin') && !linkedIn?.skip ? 'heyreach' : null,
      onboarding_completed: true,
      research_sources: ['apollo', 'perplexity'],
      // Use the selected outreach channels
      enabled_channels: outreachChannels,
      // Use the selected data sources
      data_sources: {
        enabled: dataSources,
        auto_research_limit: 20,
        min_intent_score: 60,
      },
      // ICP configuration from AI research
      icp: icpConfig,
    }

    const { data: tenant, error: tenantError } = await serviceClient
      .from('tenants')
      .insert({
        name: company.companyName,
        slug,
        settings,
      })
      .select()
      .single()

    if (tenantError) {
      console.error('Tenant creation error:', tenantError)
      if (tenantError.code === '23505') {
        return NextResponse.json({ error: 'A company with this name already exists' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
    }

    // Update user profile with name
    await serviceClient
      .from('users')
      .update({ full_name: company.yourName })
      .eq('id', user.id)

    // Create user-tenant association
    const { error: assocError } = await serviceClient
      .from('user_tenants')
      .insert({
        user_id: user.id,
        tenant_id: tenant.id,
        role: 'owner',
      })

    if (assocError) {
      console.error('User-tenant association error:', assocError)
      return NextResponse.json({ error: 'Failed to link user to company' }, { status: 500 })
    }

    // Seed RAG documents from ICP data
    await seedRAGDocuments(serviceClient, tenant.id, company, icp)

    // Add DNC entries if provided
    if (dnc?.entries?.length > 0 && !dnc.skip) {
      const dncEntries = dnc.entries.map((entry: { type: string; value: string }) => ({
        tenant_id: tenant.id,
        email: entry.type === 'email' ? entry.value : null,
        domain: entry.type === 'domain' ? entry.value : null,
        reason: 'Added during onboarding',
        added_by: user.id,
      }))

      await serviceClient.from('do_not_contact').insert(dncEntries)
    }

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    })
  } catch (error) {
    console.error('Onboarding complete error:', error)
    return NextResponse.json({ error: 'Failed to complete setup' }, { status: 500 })
  }
}

/**
 * Seed RAG documents with tenant-specific content from onboarding
 */
async function seedRAGDocuments(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  company: { companyName: string; yourName: string; websiteUrl: string },
  icp: ICPData
) {
  const ragDocuments: Array<{
    tenant_id: string
    rag_type: string
    content: string
    metadata: Record<string, unknown>
  }> = []

  // Account Criteria document
  if (icp.accountCriteria) {
    const ac = icp.accountCriteria
    ragDocuments.push({
      tenant_id: tenantId,
      rag_type: 'shared',
      content: `Ideal Customer Profile for ${company.companyName}:

COMPANY TYPES:
${ac.company_types.map((c) => `- ${c.value} (${c.priority} priority)`).join('\n')}

TARGET INDUSTRIES:
${ac.industries.map((i) => `- ${i.value} (${i.priority} priority)`).join('\n')}

COMPANY SIZES:
${ac.company_sizes.map((s) => `- ${s.value} (${s.priority} priority)`).join('\n')}

TARGET LOCATIONS:
${ac.locations.map((l) => `- ${l.value} (${l.priority} priority)`).join('\n')}

REVENUE RANGES:
${ac.revenue_ranges.map((r) => `- ${r.value} (${r.priority} priority)`).join('\n')}

TECHNOLOGY SIGNALS:
${ac.technologies.map((t) => `- ${t.value} (${t.priority} priority)`).join('\n')}

PROSPECTING SIGNALS:
${ac.prospecting_signals.map((s) => `- ${s.value} (${s.priority} priority)`).join('\n')}`,
      metadata: { category: 'icp', priority: 'high' },
    })
  }

  // Persona documents - include persona_type for agent3 matching
  for (const persona of icp.personas) {
    // Generate a persona_type key from job title for agent matching
    const personaType = persona.job_title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')

    ragDocuments.push({
      tenant_id: tenantId,
      rag_type: 'persona',
      content: `TARGET PERSONA: ${persona.job_title}

JOB TO BE DONE: ${persona.job_to_be_done}

CURRENT SITUATION: ${persona.currently_they}

RESULTING PAIN: ${persona.which_results_in}

HOW WE SOLVE THIS: ${persona.how_we_solve}

ADDITIONAL BENEFITS: ${persona.additional_benefits}`,
      metadata: {
        category: 'persona',
        job_title: persona.job_title,
        persona_type: personaType, // For agent3-writer matching
        priority: 'high',
      },
    })
  }

  // Messaging guidelines based on personas
  const painPoints = icp.personas.map((p) => `- ${p.currently_they}`).join('\n')
  const solutions = icp.personas.map((p) => `- ${p.how_we_solve}`).join('\n')
  const benefits = icp.personas.map((p) => `- ${p.additional_benefits}`).join('\n')

  ragDocuments.push({
    tenant_id: tenantId,
    rag_type: 'messaging',
    content: `Messaging Guidelines for ${company.companyName}:

VOICE: Emails are from ${company.yourName} at ${company.companyName}. Write with confidence and directness.

TARGET PERSONAS:
${icp.personas.map((p) => `- ${p.job_title}`).join('\n')}

KEY PAIN POINTS TO ADDRESS:
${painPoints}

HOW WE SOLVE THESE PROBLEMS:
${solutions}

BENEFITS TO EMPHASIZE:
${benefits}`,
    metadata: { category: 'messaging_guidelines', priority: 'high' },
  })

  // Trigger signals document
  if (icp.triggers.length > 0) {
    ragDocuments.push({
      tenant_id: tenantId,
      rag_type: 'shared',
      content: `Buying Triggers for ${company.companyName}:

${icp.triggers
  .map(
    (t) => `TRIGGER: ${t.name}
Source: ${t.source}
Why it matters: ${t.reasoning}
Look for: ${t.what_to_look_for.join(', ')}`
  )
  .join('\n\n')}`,
      metadata: { category: 'triggers', priority: 'high' },
    })
  }

  // Market research (unstructured text from user)
  if (icp.marketResearch?.trim()) {
    ragDocuments.push({
      tenant_id: tenantId,
      rag_type: 'shared',
      content: `Market Research and Case Studies for ${company.companyName}:

${icp.marketResearch}`,
      metadata: { category: 'market_research', priority: 'medium' },
    })
  }

  // Insert RAG documents
  const { error } = await supabase.from('rag_documents').insert(ragDocuments)

  if (error) {
    console.error('RAG document seeding error:', error)
    // Non-fatal, continue
  }
}
