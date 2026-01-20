import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { createServiceClient } from '@/src/lib/supabase-server'
import { normalizeDomain } from '@/src/lib/dnc'

export const dynamic = 'force-dynamic'
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

// Note: AudienceLabSource interface removed - data sources are now campaign-level

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    // Note: apollo and audienceLab removed - data sources are now campaign-level
    const { llm, company, icp, channels, emailProvider, linkedIn, crm, dnc, tenantId } = body

    // Use service client for admin operations (bypasses RLS)
    const serviceClient = createServiceClient()

    // Check if we're updating an existing tenant (multi-brand flow)
    // or creating a new one (first-time user or legacy flow)
    let existingTenant: { id: string; name: string; slug: string } | null = null

    if (tenantId) {
      // Verify user has access to this tenant
      const { data: userTenant } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .single()

      if (userTenant) {
        const { data: tenant } = await serviceClient
          .from('tenants')
          .select('id, name, slug, settings')
          .eq('id', tenantId)
          .single()

        if (tenant && !tenant.settings?.onboarding_completed) {
          existingTenant = tenant
        }
      }
    } else {
      // Check for any incomplete tenant for this user
      const { data: userTenants } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)

      if (userTenants && userTenants.length > 0) {
        for (const ut of userTenants) {
          const { data: tenant } = await serviceClient
            .from('tenants')
            .select('id, name, slug, settings')
            .eq('id', ut.tenant_id)
            .single()

          if (tenant && !tenant.settings?.onboarding_completed) {
            existingTenant = tenant
            break
          }
        }
      }
    }

    // Validate required fields
    if (!llm?.provider || !llm?.apiKey) {
      return NextResponse.json({ error: 'AI provider configuration is required' }, { status: 400 })
    }

    if (!company?.companyName || !company?.yourName || !company?.websiteUrl) {
      return NextResponse.json({ error: 'Company information is required' }, { status: 400 })
    }

    if (!icp?.accountCriteria || !icp?.personas?.length || !icp?.triggers?.length) {
      return NextResponse.json({ error: 'ICP research must be completed' }, { status: 400 })
    }

    // Validate channels selection
    const outreachChannels = channels?.outreachChannels || ['email']
    // Note: dataSources removed - now configured at campaign level

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

    // Note: Data source validation removed - now configured at campaign level

    // Generate slug from company name
    const baseSlug = company.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Check if slug already exists (excluding current tenant if updating)
    let slugQuery = serviceClient
      .from('tenants')
      .select('id, slug')
      .eq('slug', baseSlug)

    // If updating existing tenant, exclude it from the check
    if (existingTenant) {
      slugQuery = slugQuery.neq('id', existingTenant.id)
    }

    const { data: existingSlug } = await slugQuery.maybeSingle()

    // If slug exists for another tenant, append random suffix
    const slug = existingSlug
      ? `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`
      : baseSlug

    // Build integrations config
    // Note: apollo and audiencelab removed - data sources are now campaign-level
    const integrations: Record<string, unknown> = {}

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

    // GHL CRM (optional)
    if (crm?.apiKey && crm?.locationId && !crm.skip) {
      integrations.gohighlevel = {
        api_key: crm.apiKey,
        location_id: crm.locationId,
        enabled: true,
      }
    }

    // Note: AudienceLab integration removed - data sources are now campaign-level

    // Build ICP config from research data - will be stored at brand level
    const icpConfig: TenantICP = {
      source_url: company.websiteUrl,
      account_criteria: icp.accountCriteria,
      personas: icp.personas,
      triggers: icp.triggers,
      research_completed_at: new Date().toISOString(),
    }

    const settings = {
      integrations,
      // LLM configuration (tenant-level, shared across brands)
      llm: {
        provider: llm.provider,
        api_key: llm.apiKey,
        ...(llm.model && { model: llm.model }),
      },
      // Active providers (tenant-level, shared across brands)
      email_provider: outreachChannels.includes('email') ? emailProvider?.provider : null,
      linkedin_provider: outreachChannels.includes('linkedin') && !linkedIn?.skip ? 'heyreach' : null,
      crm_provider: crm?.apiKey && crm?.locationId && !crm.skip ? 'gohighlevel' : null,
      onboarding_completed: true,
      research_sources: ['perplexity'],
      enabled_channels: outreachChannels,
      // Note: ICP moved to brand level - each brand has its own ICP
    }

    let tenant: { id: string; name: string; slug: string }

    if (existingTenant) {
      // Update existing tenant (multi-brand flow)
      const { data: updatedTenant, error: updateError } = await serviceClient
        .from('tenants')
        .update({
          name: company.companyName,
          slug,
          settings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingTenant.id)
        .select()
        .single()

      if (updateError || !updatedTenant) {
        console.error('Tenant update error:', updateError)
        if (updateError?.code === '23505') {
          return NextResponse.json({ error: 'A company with this name already exists' }, { status: 400 })
        }
        return NextResponse.json({ error: 'Failed to update company' }, { status: 500 })
      }

      tenant = updatedTenant
    } else {
      // Create new tenant (first-time user flow)
      const { data: newTenant, error: tenantError } = await serviceClient
        .from('tenants')
        .insert({
          name: company.companyName,
          slug,
          settings,
        })
        .select()
        .single()

      if (tenantError || !newTenant) {
        console.error('Tenant creation error:', tenantError)
        if (tenantError?.code === '23505') {
          return NextResponse.json({ error: 'A company with this name already exists' }, { status: 400 })
        }
        return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
      }

      tenant = newTenant

      // Create user-tenant association (only for new tenants)
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
    }

    // Update user profile with name
    await serviceClient
      .from('users')
      .update({ full_name: company.yourName })
      .eq('id', user.id)

    // Create first brand with ICP (each brand has its own ICP)
    const { data: brand, error: brandError } = await serviceClient
      .from('brands')
      .insert({
        tenant_id: tenant.id,
        name: company.companyName, // Default first brand name = company name
        description: `Primary brand for ${company.companyName}`,
        website: company.websiteUrl,
        voice_tone: 'professional',
        is_active: true,
        icp: icpConfig, // Brand-specific ICP
        icp_source_url: company.websiteUrl,
        icp_research_completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (brandError || !brand) {
      console.error('Brand creation error:', brandError)
      return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
    }

    // Seed RAG documents from ICP data (brand-specific)
    // Note: audienceLab parameter removed - data sources are now campaign-level
    await seedRAGDocuments(serviceClient, tenant.id, company, icp, brand.id)

    // Add DNC entries if provided
    if (dnc?.entries?.length > 0 && !dnc.skip) {
      const dncEntries = dnc.entries.map((entry: { type: string; value: string }) => ({
        tenant_id: tenant.id,
        email: entry.type === 'email' ? entry.value.toLowerCase() : null,
        domain: entry.type === 'domain' ? normalizeDomain(entry.value) : null,
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
      brand: {
        id: brand.id,
        name: brand.name,
      },
    })
  } catch (error) {
    console.error('Onboarding complete error:', error)
    return NextResponse.json({ error: 'Failed to complete setup' }, { status: 500 })
  }
}

// Note: AudienceLabOnboarding interface removed - data sources are now campaign-level

/**
 * Seed RAG documents with brand-specific content from onboarding
 * Note: audienceLab parameter removed - data sources are now campaign-level
 */
async function seedRAGDocuments(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  company: { companyName: string; yourName: string; websiteUrl: string },
  icp: ICPData,
  brandId: string
) {
  const ragDocuments: Array<{
    tenant_id: string
    brand_id: string
    rag_type: string
    content: string
    metadata: Record<string, unknown>
  }> = []

  // Account Criteria document
  if (icp.accountCriteria) {
    const ac = icp.accountCriteria
    ragDocuments.push({
      tenant_id: tenantId,
      brand_id: brandId,
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
      brand_id: brandId,
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
      brand_id: brandId,
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
      brand_id: brandId,
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
      brand_id: brandId,
      rag_type: 'shared',
      content: `Market Research and Case Studies for ${company.companyName}:

${icp.marketResearch}`,
      metadata: { category: 'market_research', priority: 'medium' },
    })
  }

  // Note: AudienceLab RAG document seeding removed - data sources are now campaign-level

  // Insert RAG documents
  const { error } = await supabase.from('rag_documents').insert(ragDocuments)

  if (error) {
    console.error('RAG document seeding error:', error)
    // Non-fatal, continue
  }
}
