import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant:tenants(id)')
      .eq('user_id', user.id)
      .single()

    if (!userTenant?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 })
    }

    const tenantId = (userTenant.tenant as unknown as { id: string }).id

    // Fetch saved searches
    const serviceClient = createServiceClient()
    const { data: searches, error } = await serviceClient
      .from('apollo_saved_searches')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch saved searches:', error)
      return NextResponse.json({ error: 'Failed to load searches' }, { status: 500 })
    }

    return NextResponse.json({ searches: searches || [] })
  } catch (error) {
    console.error('Saved searches error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load searches' },
      { status: 500 }
    )
  }
}
