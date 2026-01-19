import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenantId } from '@/src/lib/auth'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/campaigns
 * List all campaigns for the current tenant
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = await getTenantId(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brand_id')
    const status = searchParams.get('status')

    let query = supabase
      .from('campaigns')
      .select(`
        *,
        brand:brands(id, name)
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (brandId) {
      query = query.eq('brand_id', brandId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('[Campaigns API] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ campaigns: data })
  } catch (error) {
    console.error('[Campaigns API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/campaigns
 * Create a new campaign
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = await getTenantId(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      brand_id,
      name,
      description,
      mode,
      custom_instructions,
      target_persona,
      primary_angle,
      email_count,
      linkedin_count,
      email_tone,
      email_cta,
      linkedin_first,
      wait_for_connection,
      connection_timeout_hours,
      smartlead_campaign_id,
      heyreach_campaign_id,
    } = body

    if (!brand_id || !name || !mode) {
      return NextResponse.json(
        { error: 'brand_id, name, and mode are required' },
        { status: 400 }
      )
    }

    // Verify brand belongs to tenant
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id')
      .eq('id', brand_id)
      .eq('tenant_id', tenantId)
      .single()

    if (brandError || !brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        brand_id,
        tenant_id: tenantId,
        name,
        description,
        mode,
        custom_instructions,
        target_persona,
        primary_angle,
        email_count: email_count || 7,
        linkedin_count: linkedin_count || 4,
        email_tone,
        email_cta,
        linkedin_first: linkedin_first || false,
        wait_for_connection: wait_for_connection ?? true,
        connection_timeout_hours: connection_timeout_hours || 72,
        smartlead_campaign_id,
        heyreach_campaign_id,
        status: 'draft',
      })
      .select(`
        *,
        brand:brands(id, name)
      `)
      .single()

    if (error) {
      console.error('[Campaigns API] Create error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch (error) {
    console.error('[Campaigns API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
