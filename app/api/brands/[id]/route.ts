import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenantId } from '@/src/lib/auth'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/brands/[id]
 * Get a specific brand by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getTenantId(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: brand, error } = await supabase
      .from('brands')
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    return NextResponse.json({ brand })
  } catch (error) {
    console.error('[Brand API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/brands/[id]
 * Update a brand
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      settings,
      icp,
      is_active,
    } = body

    // Verify brand belongs to this tenant
    const { data: existingBrand } = await supabase
      .from('brands')
      .select('id')
      .eq('id', params.id)
      .eq('tenant_id', tenantId)
      .single()

    if (!existingBrand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    const { data: brand, error } = await supabase
      .from('brands')
      .update({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(website !== undefined && { website }),
        ...(logo_url !== undefined && { logo_url }),
        ...(voice_tone !== undefined && { voice_tone }),
        ...(settings !== undefined && { settings }),
        ...(icp !== undefined && { icp }),
        ...(is_active !== undefined && { is_active }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('[Brand API] Update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ brand })
  } catch (error) {
    console.error('[Brand API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/brands/[id]
 * Delete (soft delete) a brand
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getTenantId(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify brand belongs to this tenant
    const { data: existingBrand } = await supabase
      .from('brands')
      .select('id')
      .eq('id', params.id)
      .eq('tenant_id', tenantId)
      .single()

    if (!existingBrand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Soft delete by setting is_active = false
    const { error } = await supabase
      .from('brands')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (error) {
      console.error('[Brand API] Delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Brand API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
