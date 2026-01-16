import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    // Parse update data
    const body = await request.json()
    const { enabled, name, description, schedule_cron } = body

    // Build update object
    const updates: Record<string, unknown> = {}
    if (enabled !== undefined) updates.enabled = enabled
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (schedule_cron !== undefined) updates.schedule_cron = schedule_cron

    // Update the saved search (ensure it belongs to the tenant)
    const serviceClient = createServiceClient()
    const { error } = await serviceClient
      .from('apollo_saved_searches')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) {
      console.error('Failed to update saved search:', error)
      return NextResponse.json({ error: 'Failed to update search' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update saved search error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update search' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    // Delete the saved search (ensure it belongs to the tenant)
    const serviceClient = createServiceClient()
    const { error } = await serviceClient
      .from('apollo_saved_searches')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) {
      console.error('Failed to delete saved search:', error)
      return NextResponse.json({ error: 'Failed to delete search' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete saved search error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete search' },
      { status: 500 }
    )
  }
}
