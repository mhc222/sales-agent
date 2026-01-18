import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'
import { getTenantSettings } from '@/src/lib/tenant-settings'
import type { TargetingPreference } from '@/src/lib/tenant-settings'

/**
 * GET /api/settings/targeting
 * Fetch current targeting preferences for the tenant
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single()

    if (!userTenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
    }

    const tenant = await getTenantSettings(userTenant.tenant_id)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const preferences = tenant.settings?.targeting_preferences || []

    return NextResponse.json({
      preferences,
      availableFields: [
        { field: 'seniority', label: 'Seniority Level', basePoints: 20 },
        { field: 'job_title', label: 'Job Title', basePoints: 20 },
        { field: 'company_size', label: 'Company Size', basePoints: 15 },
        { field: 'employee_count', label: 'Employee Count', basePoints: 15 },
        { field: 'industry', label: 'Industry', basePoints: 25 },
        { field: 'company_industry', label: 'Company Industry', basePoints: 25 },
        { field: 'revenue_range', label: 'Revenue Range', basePoints: 20 },
        { field: 'company_revenue', label: 'Company Revenue', basePoints: 20 },
      ],
    })
  } catch (error) {
    console.error('Get targeting preferences error:', error)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }
}

/**
 * POST /api/settings/targeting
 * Add or update a targeting preference
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single()

    if (!userTenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
    }

    const tenant = await getTenantSettings(userTenant.tenant_id)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const body = await request.json()
    const { field, preference, weight } = body

    if (!field || !preference) {
      return NextResponse.json({ error: 'Field and preference are required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Get current preferences
    const currentPreferences: TargetingPreference[] = tenant.settings?.targeting_preferences || []

    // Check if preference for this field already exists
    const existingIndex = currentPreferences.findIndex(p => p.field === field)

    const newPref: TargetingPreference = {
      field,
      preference,
      weight: weight || 1.5,
      created_at: existingIndex >= 0 ? currentPreferences[existingIndex].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (existingIndex >= 0) {
      currentPreferences[existingIndex] = newPref
    } else {
      currentPreferences.push(newPref)
    }

    // Update tenant settings
    const { error: updateError } = await serviceClient
      .from('tenants')
      .update({
        settings: {
          ...tenant.settings,
          targeting_preferences: currentPreferences,
        },
      })
      .eq('id', userTenant.tenant_id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      preference: newPref,
      preferences: currentPreferences,
    })
  } catch (error) {
    console.error('Save targeting preference error:', error)
    return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 })
  }
}

/**
 * DELETE /api/settings/targeting
 * Remove a targeting preference
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single()

    if (!userTenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
    }

    const tenant = await getTenantSettings(userTenant.tenant_id)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const field = searchParams.get('field')

    if (!field) {
      return NextResponse.json({ error: 'Field is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Remove preference for this field
    const currentPreferences: TargetingPreference[] = tenant.settings?.targeting_preferences || []
    const updatedPreferences = currentPreferences.filter(p => p.field !== field)

    // Update tenant settings
    const { error: updateError } = await serviceClient
      .from('tenants')
      .update({
        settings: {
          ...tenant.settings,
          targeting_preferences: updatedPreferences,
        },
      })
      .eq('id', userTenant.tenant_id)

    if (updateError) {
      console.error('Delete error:', updateError)
      return NextResponse.json({ error: 'Failed to remove preference' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      preferences: updatedPreferences,
    })
  } catch (error) {
    console.error('Delete targeting preference error:', error)
    return NextResponse.json({ error: 'Failed to remove preference' }, { status: 500 })
  }
}
