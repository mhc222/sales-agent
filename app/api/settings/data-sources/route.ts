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

    // AudienceLab sources are stored as an array - find pixel and intent sources
    const audienceLabSources = integrations.audiencelab || []
    const pixelSource = audienceLabSources.find((s: { type: string }) => s.type === 'pixel')
    const intentSource = audienceLabSources.find((s: { type: string }) => s.type === 'intent')

    // Return masked keys for display
    return NextResponse.json({
      apollo: {
        enabled: !!integrations.apollo?.api_key,
        api_key_masked: maskApiKey(integrations.apollo?.api_key),
      },
      pixel: {
        enabled: !!pixelSource?.api_key,
        api_url: pixelSource?.api_url || '',
        api_key_masked: maskApiKey(pixelSource?.api_key),
      },
      intent: {
        enabled: !!intentSource?.api_key,
        api_url: intentSource?.api_url || '',
        api_key_masked: maskApiKey(intentSource?.api_key),
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
    let updatedIntegrations = { ...currentIntegrations }

    // Handle pixel/intent sources - stored in audiencelab array
    if (source === 'pixel' || source === 'intent') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audienceLabSources: any[] = [...(currentIntegrations.audiencelab || [])]
      const existingIndex = audienceLabSources.findIndex((s: { type: string }) => s.type === source)

      const updatedSource: Record<string, unknown> = {
        ...(existingIndex >= 0 ? audienceLabSources[existingIndex] : {}),
        type: source,
        name: source === 'pixel' ? 'Website Visitors' : 'Intent Data',
        enabled: enabled ?? true,
      }

      if (api_key !== undefined && api_key !== '') {
        updatedSource.api_key = api_key
      }
      if (api_url !== undefined) {
        updatedSource.api_url = api_url
      }

      if (existingIndex >= 0) {
        audienceLabSources[existingIndex] = updatedSource
      } else {
        audienceLabSources.push(updatedSource)
      }

      updatedIntegrations.audiencelab = audienceLabSources as typeof updatedIntegrations.audiencelab
    } else {
      // Apollo uses flat structure
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

      updatedIntegrations = {
        ...updatedIntegrations,
        [source]: updatedIntegration,
      }
    }

    // Update enabled data sources array
    let enabledSources = [...(currentDataSources.enabled || [])]

    // Check if audiencelab should be in enabled sources
    const audienceLabSources = updatedIntegrations.audiencelab || []
    const hasAudienceLabCreds = audienceLabSources.some(
      (s: { api_key?: string; api_url?: string; enabled?: boolean }) =>
        s.api_key && s.api_url && s.enabled !== false
    )

    if (hasAudienceLabCreds) {
      if (!enabledSources.includes('audiencelab')) {
        enabledSources.push('audiencelab')
      }
    } else {
      enabledSources = enabledSources.filter((s) => s !== 'audiencelab')
    }

    // Handle apollo separately
    if (source === 'apollo') {
      const apolloIntegration = updatedIntegrations.apollo as { api_key?: string; enabled?: boolean } | undefined
      if (apolloIntegration?.api_key && apolloIntegration?.enabled !== false) {
        if (!enabledSources.includes('apollo')) {
          enabledSources.push('apollo')
        }
      } else {
        enabledSources = enabledSources.filter((s) => s !== 'apollo')
      }
    }

    const updatedSettings: TenantSettings = {
      ...currentSettings,
      integrations: updatedIntegrations,
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
