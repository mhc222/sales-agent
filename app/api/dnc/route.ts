import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { createServiceClient } from '@/src/lib/supabase-server'

// GET - List DNC entries
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

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

    const tenantId = (userTenant.tenant as any).id as string

    // Parse query params
    const url = new URL(request.url)
    const search = url.searchParams.get('search') || undefined
    const type = url.searchParams.get('type') as 'email' | 'domain' | 'all' | undefined
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const serviceClient = createServiceClient()

    let query = serviceClient
      .from('do_not_contact')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`email.ilike.%${search}%,domain.ilike.%${search}%`)
    }

    if (type === 'email') {
      query = query.not('email', 'is', null)
    } else if (type === 'domain') {
      query = query.not('domain', 'is', null)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      console.error('DNC fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch DNC list' }, { status: 500 })
    }

    return NextResponse.json({
      entries: data || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('DNC GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch DNC list' }, { status: 500 })
  }
}

// POST - Add DNC entries
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant:tenants(id)')
      .eq('user_id', user.id)
      .single()

    if (!userTenant?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 })
    }

    const tenantId = (userTenant.tenant as any).id as string

    const body = await request.json()
    const { entries } = body as {
      entries: Array<{ type: 'email' | 'domain'; value: string; reason?: string }>
    }

    if (!entries?.length) {
      return NextResponse.json({ error: 'No entries provided' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    const toInsert = entries.map((entry) => ({
      tenant_id: tenantId,
      email: entry.type === 'email' ? entry.value.toLowerCase() : null,
      domain: entry.type === 'domain' ? entry.value.toLowerCase() : null,
      reason: entry.reason || null,
      added_by: user.id,
    }))

    const { data, error } = await serviceClient
      .from('do_not_contact')
      .insert(toInsert)
      .select()

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Some entries already exist' }, { status: 400 })
      }
      console.error('DNC insert error:', error)
      return NextResponse.json({ error: 'Failed to add entries' }, { status: 500 })
    }

    return NextResponse.json({
      added: data?.length || 0,
      entries: data,
    })
  } catch (error) {
    console.error('DNC POST error:', error)
    return NextResponse.json({ error: 'Failed to add entries' }, { status: 500 })
  }
}

// DELETE - Remove DNC entries
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant:tenants(id)')
      .eq('user_id', user.id)
      .single()

    if (!userTenant?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 })
    }

    const tenantId = (userTenant.tenant as any).id as string

    const body = await request.json()
    const { ids } = body as { ids: string[] }

    if (!ids?.length) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    const { data, error } = await serviceClient
      .from('do_not_contact')
      .delete()
      .eq('tenant_id', tenantId)
      .in('id', ids)
      .select()

    if (error) {
      console.error('DNC delete error:', error)
      return NextResponse.json({ error: 'Failed to remove entries' }, { status: 500 })
    }

    return NextResponse.json({
      removed: data?.length || 0,
    })
  } catch (error) {
    console.error('DNC DELETE error:', error)
    return NextResponse.json({ error: 'Failed to remove entries' }, { status: 500 })
  }
}
