import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'

/**
 * GET /api/account/brands
 * List all brands for the current user with onboarding status
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all tenants for this user with their settings
    const { data: userTenants, error } = await supabase
      .from('user_tenants')
      .select(`
        role,
        tenant:tenants (
          id,
          name,
          slug,
          settings,
          created_at
        )
      `)
      .eq('user_id', user.id)

    if (error) {
      console.error('Failed to fetch brands:', error)
      return NextResponse.json({
        error: 'Failed to fetch brands',
        details: error.message,
        code: error.code
      }, { status: 500 })
    }

    // Flatten and transform the response
    const brands = (userTenants || []).map((ut) => {
      // Handle both array and object formats from Supabase
      const tenant = Array.isArray(ut.tenant) ? ut.tenant[0] : ut.tenant
      const settings = tenant?.settings as Record<string, unknown> | null

      return {
        id: tenant?.id,
        name: tenant?.name,
        slug: tenant?.slug,
        role: ut.role,
        onboarding_completed: settings?.onboarding_completed === true,
        created_at: tenant?.created_at,
      }
    }).filter(b => b.id) // Filter out any invalid entries

    return NextResponse.json({ brands })
  } catch (error) {
    console.error('Get brands error:', error)
    return NextResponse.json({
      error: 'Failed to fetch brands',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
