import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'
import { maskApiKey, TenantSettings } from '@/src/lib/tenant-settings'

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

    // Get user's tenant with settings
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant:tenants(id, settings)')
      .eq('user_id', user.id)
      .single()

    if (!userTenant?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 })
    }

    const tenant = userTenant.tenant as unknown as { id: string; settings: TenantSettings | null }
    const settings = tenant.settings || {}
    const integrations = settings.integrations || {}

    // Return masked keys for display
    return NextResponse.json({
      apollo: {
        enabled: !!integrations.apollo?.api_key,
        api_key_masked: maskApiKey(integrations.apollo?.api_key),
      },
      pixel: {
        enabled: !!integrations.pixel?.api_key,
        api_url: integrations.pixel?.api_url || '',
        api_key_masked: maskApiKey(integrations.pixel?.api_key),
      },
      intent: {
        enabled: !!integrations.intent?.api_key,
        api_url: integrations.intent?.api_url || '',
        api_key_masked: maskApiKey(integrations.intent?.api_key),
      },
      data_sources: settings.data_sources || { enabled: [] },
    })
  } catch (error) {
    console.error('Get data sources error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get data sources' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
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
      .select('tenant:tenants(id, settings)')
      .eq('user_id', user.id)
      .single()

    if (!userTenant?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 })
    }

    const tenant = userTenant.tenant as unknown as { id: string; settings: TenantSettings | null }
    const tenantId = tenant.id
    const currentSettings = tenant.settings || {}

    // Parse update data
    const body = await request.json()
    const { source, api_key, api_url, enabled } = body

    if (!source || !['apollo', 'pixel', 'intent'].includes(source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }

    // Build updated settings
    const currentIntegrations = currentSettings.integrations || {}
    const currentDataSources = currentSettings.data_sources || { enabled: [] }

    // Update the specific integration
    const updatedIntegration: Record<string, unknown> = {
      ...(currentIntegrations[source as keyof typeof currentIntegrations] || {}),
    }

    if (api_key !== undefined && api_key !== '') {
      updatedIntegration.api_key = api_key
    }
    if (api_url !== undefined) {
      updatedIntegration.api_url = api_url
    }
    if (enabled !== undefined) {
      updatedIntegration.enabled = enabled
    }

    // Update enabled data sources array
    let enabledSources = [...(currentDataSources.enabled || [])]
    const hasCredentials =
      source === 'apollo'
        ? !!updatedIntegration.api_key
        : !!(updatedIntegration.api_key && updatedIntegration.api_url)

    if (enabled && hasCredentials) {
      if (!enabledSources.includes(source)) {
        enabledSources.push(source)
      }
    } else {
      enabledSources = enabledSources.filter((s) => s !== source)
    }

    const updatedSettings: TenantSettings = {
      ...currentSettings,
      integrations: {
        ...currentIntegrations,
        [source]: updatedIntegration,
      },
      data_sources: {
        ...currentDataSources,
        enabled: enabledSources,
      },
    }

    // Update tenant settings
    const serviceClient = createServiceClient()
    const { error } = await serviceClient
      .from('tenants')
      .update({ settings: updatedSettings })
      .eq('id', tenantId)

    if (error) {
      console.error('Failed to update tenant settings:', error)
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update data sources error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update data sources' },
      { status: 500 }
    )
  }
}
