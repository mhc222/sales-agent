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
 * Create a new brand
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = await getTenantId(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      website,
      logo_url,
      voice_tone,
      value_proposition,
      key_differentiators,
      target_industries,
      target_titles,
      company_size,
      founded_year,
      headquarters,
    } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('brands')
      .insert({
        tenant_id: tenantId,
        name,
        description,
        website,
        logo_url,
        voice_tone: voice_tone || 'professional',
        value_proposition,
        key_differentiators,
        target_industries,
        target_titles,
        company_size,
        founded_year,
        headquarters,
      })
      .select()
      .single()

    if (error) {
      console.error('[Brands API] Create error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ brand: data }, { status: 201 })
  } catch (error) {
    console.error('[Brands API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
