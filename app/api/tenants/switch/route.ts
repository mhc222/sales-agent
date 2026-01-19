import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { cookies } from 'next/headers'

const ACTIVE_TENANT_COOKIE = 'active_tenant_id'

/**
 * POST /api/tenants/switch
 * Switch the active tenant for the current user
 * Stores preference in a cookie for server-side consistency
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tenantId } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 })
    }

    // Verify user has access to this tenant
    const { data: userTenant, error } = await supabase
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !userTenant) {
      return NextResponse.json({ error: 'Tenant not found or access denied' }, { status: 403 })
    }

    // Set the active tenant cookie
    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    })

    return NextResponse.json({
      success: true,
      tenantId,
      role: userTenant.role,
    })
  } catch (error) {
    console.error('Switch tenant error:', error)
    return NextResponse.json({ error: 'Failed to switch tenant' }, { status: 500 })
  }
}

/**
 * GET /api/tenants/switch
 * Get the current active tenant ID from cookie
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const activeTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value

    return NextResponse.json({
      activeTenantId: activeTenantId || null,
    })
  } catch (error) {
    console.error('Get active tenant error:', error)
    return NextResponse.json({ error: 'Failed to get active tenant' }, { status: 500 })
  }
}
