import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'

/**
 * GET /api/tenants
 * List all tenants the current user belongs to
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all tenants for this user with their roles
    const { data: userTenants, error } = await supabase
      .from('user_tenants')
      .select(`
        role,
        tenant:tenants (
          id,
          name,
          slug,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch tenants:', error)
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
    }

    // Flatten the response - Supabase returns nested relations
    const tenants = (userTenants || []).map((ut) => {
      // Handle both array and object formats from Supabase
      const tenant = Array.isArray(ut.tenant) ? ut.tenant[0] : ut.tenant
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        role: ut.role,
        created_at: tenant.created_at,
      }
    }).filter(t => t.id) // Filter out any invalid entries

    return NextResponse.json({ tenants })
  } catch (error) {
    console.error('Get tenants error:', error)
    return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
  }
}

/**
 * POST /api/tenants
 * Create a new tenant (brand) for the current user
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Brand name is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Generate a slug from the name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Check if slug exists, append random suffix if needed
    const { data: existing } = await serviceClient
      .from('tenants')
      .select('slug')
      .eq('slug', baseSlug)
      .single()

    const slug = existing
      ? `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`
      : baseSlug

    // Create the tenant
    const { data: tenant, error: tenantError } = await serviceClient
      .from('tenants')
      .insert({
        name: name.trim(),
        slug,
        settings: {
          onboarding_completed: false,
          onboarding_step: 0,
        },
      })
      .select()
      .single()

    if (tenantError || !tenant) {
      console.error('Failed to create tenant:', tenantError)
      return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
    }

    // Associate user with tenant as owner
    const { error: assocError } = await serviceClient
      .from('user_tenants')
      .insert({
        user_id: user.id,
        tenant_id: tenant.id,
        role: 'owner',
      })

    if (assocError) {
      console.error('Failed to associate user with tenant:', assocError)
      // Cleanup: delete the tenant we just created
      await serviceClient.from('tenants').delete().eq('id', tenant.id)
      return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
    }

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        role: 'owner',
        created_at: tenant.created_at,
      },
    })
  } catch (error) {
    console.error('Create tenant error:', error)
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
  }
}
