import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenantId } from '@/src/lib/auth'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/brands
 * List all brands for the current tenant
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Brands API] Getting tenant ID...')
    let tenantId: string | null = null

    try {
      tenantId = await getTenantId(request)
    } catch (authError) {
      console.error('[Brands API] Auth error:', authError)
      return NextResponse.json({
        error: 'Authentication failed',
        details: authError instanceof Error ? authError.message : 'Unknown auth error'
      }, { status: 401 })
    }

    console.log('[Brands API] Tenant ID:', tenantId)

    if (!tenantId) {
      console.log('[Brands API] No tenant ID found - unauthorized')
      return NextResponse.json({ error: 'No tenant found. Please complete onboarding first.' }, { status: 401 })
    }

    console.log('[Brands API] Fetching brands for tenant:', tenantId)
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('[Brands API] Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[Brands API] Found brands:', data?.length)

    // Get campaign counts for each brand
    const brandIds = data?.map(b => b.id) || []

    if (brandIds.length > 0) {
      const { data: campaignCounts } = await supabase
        .from('campaigns')
        .select('brand_id')
        .in('brand_id', brandIds)

      const countMap: Record<string, number> = {}
      campaignCounts?.forEach(c => {
        countMap[c.brand_id] = (countMap[c.brand_id] || 0) + 1
      })

      // Add campaign counts to brands
      const brandsWithCounts = data?.map(b => ({
        ...b,
        campaign_count: countMap[b.id] || 0,
      }))

      return NextResponse.json({ brands: brandsWithCounts })
    }

    return NextResponse.json({ brands: data })
  } catch (error) {
    console.error('[Brands API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/brands
 * Create a new brand with full wizard data (settings, ICP, integrations)
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = await getTenantId(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      brandInfo,
      llm,
      icp,
      channels,
      emailProvider,
      linkedIn,
      crm,
      dnc,
      // Legacy format support
      name,
      description,
      website,
      logo_url,
    } = body

    // Support both wizard format and legacy format
    const brandName = brandInfo?.name || name
    const brandDescription = brandInfo?.description || description
    const brandWebsite = brandInfo?.website || website
    const brandLogoUrl = brandInfo?.logoUrl || logo_url

    if (!brandName) {
      return NextResponse.json({ error: 'Brand name is required' }, { status: 400 })
    }

    // Build settings object if wizard data provided
    let settings = {}
    if (llm || channels || emailProvider || linkedIn || crm) {
      const integrations: Record<string, unknown> = {}

      // Email provider
      if (channels?.outreachChannels?.includes('email') && emailProvider?.provider) {
        integrations[emailProvider.provider] = {
          api_key: emailProvider.apiKey,
          campaign_id: emailProvider.campaignId || undefined,
        }
      }

      // LinkedIn provider
      if (channels?.outreachChannels?.includes('linkedin') && linkedIn?.provider && !linkedIn?.skip) {
        integrations[linkedIn.provider] = {
          api_key: linkedIn.apiKey,
        }
      }

      // CRM integration
      if (crm?.provider && !crm?.skip) {
        integrations[crm.provider] = {
          api_key: crm.apiKey,
          location_id: crm.locationId || undefined,
        }
      }

      settings = {
        integrations,
        llm_provider: llm?.provider || null,
        llm_config: llm?.provider ? {
          api_key: llm.apiKey,
          model: llm.model || undefined,
        } : null,
        active_email_provider: emailProvider?.provider || null,
        active_linkedin_provider: linkedIn?.provider || null,
        enabled_channels: channels?.outreachChannels || ['email'],
        research_sources: ['apollo', 'perplexity', 'linkedin'],
      }
    }

    // Build ICP object if provided
    let icpData = null
    if (icp?.accountCriteria || icp?.personas?.length || icp?.triggers?.length) {
      icpData = {
        account_criteria: icp.accountCriteria || null,
        personas: icp.personas || [],
        triggers: icp.triggers || [],
        market_research: icp.marketResearch || '',
      }
    }

    // Create the brand
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .insert({
        tenant_id: tenantId,
        name: brandName,
        description: brandDescription,
        website: brandWebsite,
        logo_url: brandLogoUrl,
        voice_tone: 'professional',
        settings: Object.keys(settings).length > 0 ? settings : null,
        icp: icpData,
        icp_source_url: brandWebsite,
        icp_research_completed_at: icpData ? new Date().toISOString() : null,
        setup_completed: Boolean(llm && icp?.accountCriteria),
      })
      .select()
      .single()

    if (brandError) {
      console.error('[Brands API] Create error:', brandError)
      return NextResponse.json({ error: brandError.message }, { status: 500 })
    }

    // Handle DNC entries if provided
    if (dnc?.entries?.length > 0 && !dnc.skip) {
      const dncInserts = dnc.entries.map((entry: { type: string; value: string }) => ({
        tenant_id: tenantId,
        brand_id: brand.id,
        email: entry.type === 'email' ? entry.value : null,
        domain: entry.type === 'domain' ? entry.value : null,
        reason: 'Added during brand setup',
      }))

      const { error: dncError } = await supabase
        .from('do_not_contact')
        .insert(dncInserts)

      if (dncError) {
        console.error('[Brands API] DNC insert error:', dncError)
        // Don't fail the whole operation if DNC insert fails
      }
    }

    return NextResponse.json({ brand }, { status: 201 })
  } catch (error) {
    console.error('[Brands API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
