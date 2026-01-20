import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'
import { maskApiKey, TenantSettings, TenantIntegrations } from '@/src/lib/tenant-settings'

export const dynamic = 'force-dynamic'

type EmailProvider = 'smartlead' | 'nureply' | 'instantly'
type LinkedInProvider = 'heyreach'
type Provider = EmailProvider | LinkedInProvider

interface ProviderConfig {
  isActive: boolean
  isConfigured: boolean
  apiKeyMasked: string | null
  campaignId?: string
}

interface ProvidersResponse {
  emailProvider: EmailProvider | null
  linkedinProvider: LinkedInProvider | null
  providers: {
    smartlead: ProviderConfig
    nureply: ProviderConfig
    instantly: ProviderConfig
    heyreach: ProviderConfig
  }
}

export async function GET() {
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

    // Determine active providers
    const emailProvider = (settings.email_provider || settings.active_email_provider || null) as EmailProvider | null
    const linkedinProvider = (settings.linkedin_provider || settings.active_linkedin_provider || null) as LinkedInProvider | null

    // Build provider configurations
    const response: ProvidersResponse = {
      emailProvider,
      linkedinProvider,
      providers: {
        smartlead: {
          isActive: emailProvider === 'smartlead',
          isConfigured: !!integrations.smartlead?.api_key,
          apiKeyMasked: maskApiKey(integrations.smartlead?.api_key),
          campaignId: integrations.smartlead?.campaign_id,
        },
        nureply: {
          isActive: emailProvider === 'nureply',
          isConfigured: !!integrations.nureply?.api_key,
          apiKeyMasked: maskApiKey(integrations.nureply?.api_key),
          campaignId: integrations.nureply?.campaign_id,
        },
        instantly: {
          isActive: emailProvider === 'instantly',
          isConfigured: !!integrations.instantly?.api_key,
          apiKeyMasked: maskApiKey(integrations.instantly?.api_key),
        },
        heyreach: {
          isActive: linkedinProvider === 'heyreach',
          isConfigured: !!integrations.heyreach?.api_key,
          apiKeyMasked: maskApiKey(integrations.heyreach?.api_key),
          campaignId: integrations.heyreach?.campaign_id,
        },
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Get providers error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get providers' },
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
    const { provider, apiKey, campaignId, setActive } = body as {
      provider: Provider
      apiKey?: string
      campaignId?: string
      setActive?: boolean
    }

    const validProviders: Provider[] = ['smartlead', 'nureply', 'instantly', 'heyreach']
    if (!provider || !validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Build updated settings
    const currentIntegrations = currentSettings.integrations || {}
    const isEmailProvider = ['smartlead', 'nureply', 'instantly'].includes(provider)

    // Update the specific integration
    const currentProviderConfig = (currentIntegrations[provider as keyof TenantIntegrations] || {}) as Record<string, unknown>
    const updatedIntegration: Record<string, unknown> = { ...currentProviderConfig }

    if (apiKey !== undefined && apiKey !== '') {
      updatedIntegration.api_key = apiKey
      updatedIntegration.enabled = true
    }
    if (campaignId !== undefined) {
      updatedIntegration.campaign_id = campaignId
    }

    // Build the updated settings object
    const updatedSettings: TenantSettings = {
      ...currentSettings,
      integrations: {
        ...currentIntegrations,
        [provider]: updatedIntegration,
      },
    }

    // If setting as active provider
    if (setActive) {
      if (isEmailProvider) {
        updatedSettings.email_provider = provider as EmailProvider
        updatedSettings.active_email_provider = provider as EmailProvider
      } else {
        updatedSettings.linkedin_provider = provider as LinkedInProvider
        updatedSettings.active_linkedin_provider = provider as LinkedInProvider
      }
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
    console.error('Update providers error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update providers' },
      { status: 500 }
    )
  }
}
