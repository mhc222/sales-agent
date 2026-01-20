import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { TenantSettings, TenantIntegrations } from '@/src/lib/tenant-settings'

export const dynamic = 'force-dynamic'

type Provider = 'smartlead' | 'nureply' | 'instantly' | 'heyreach'

interface TestResult {
  success: boolean
  message: string
  details?: string
}

/**
 * Test Smartlead connection using provided API key
 */
async function testSmartleadConnection(apiKey: string): Promise<TestResult> {
  // Smartlead uses query param for API key
  const url = `https://server.smartlead.ai/api/v1/campaigns?api_key=${apiKey}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        message: 'Smartlead connection failed',
        details: `API returned ${response.status}: ${errorText.slice(0, 100)}`,
      }
    }

    const campaigns = await response.json()
    return {
      success: true,
      message: 'Smartlead connection successful',
      details: `Found ${Array.isArray(campaigns) ? campaigns.length : 0} campaigns`,
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}

/**
 * Test Nureply connection using provided API key
 */
async function testNureplyConnection(apiKey: string): Promise<TestResult> {
  const url = 'https://api.nureply.com/v3/user-api/validate'

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        message: 'Nureply connection failed',
        details: `API returned ${response.status}: ${errorText.slice(0, 100)}`,
      }
    }

    const data = await response.json()
    return {
      success: true,
      message: 'Nureply connection successful',
      details: data.data?.email ? `Connected as ${data.data.email}` : 'API key validated',
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}

/**
 * Test Instantly connection using provided API key
 */
async function testInstantlyConnection(apiKey: string): Promise<TestResult> {
  // Instantly uses API key in query params
  const url = `https://api.instantly.ai/api/v1/campaign/list?api_key=${apiKey}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        message: 'Instantly connection failed',
        details: `API returned ${response.status}: ${errorText.slice(0, 100)}`,
      }
    }

    const data = await response.json()
    const campaigns = Array.isArray(data) ? data : (data.campaigns || [])
    return {
      success: true,
      message: 'Instantly connection successful',
      details: `Found ${campaigns.length} campaigns`,
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}

/**
 * Test HeyReach connection using provided API key
 */
async function testHeyReachConnection(apiKey: string): Promise<TestResult> {
  const url = 'https://api.heyreach.io/api/v1/campaigns?page=0&limit=1'

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        message: 'HeyReach connection failed',
        details: `API returned ${response.status}: ${errorText.slice(0, 100)}`,
      }
    }

    const data = await response.json()
    const campaigns = data.items || data.data || []
    return {
      success: true,
      message: 'HeyReach connection successful',
      details: `API key validated`,
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Connection failed',
    }
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

    // Parse test data
    const body = await request.json()
    const { provider, apiKey: providedApiKey } = body as { provider: Provider; apiKey?: string }

    const validProviders: Provider[] = ['smartlead', 'nureply', 'instantly', 'heyreach']
    if (!provider || !validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Get API key to test - either provided or from existing config
    let apiKey = providedApiKey

    if (!apiKey) {
      // Fetch existing API key from tenant settings
      const { data: userTenant } = await supabase
        .from('user_tenants')
        .select('tenant:tenants(id, settings)')
        .eq('user_id', user.id)
        .single()

      if (!userTenant?.tenant) {
        return NextResponse.json({
          success: false,
          message: 'No tenant found',
        })
      }

      const tenant = userTenant.tenant as unknown as { id: string; settings: TenantSettings | null }
      const integrations = tenant.settings?.integrations || {}
      const providerConfig = integrations[provider as keyof TenantIntegrations] as { api_key?: string } | undefined

      apiKey = providerConfig?.api_key
    }

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: 'API key is required - no existing key found',
      })
    }

    // Test connection based on provider
    let result: TestResult

    switch (provider) {
      case 'smartlead':
        result = await testSmartleadConnection(apiKey)
        break
      case 'nureply':
        result = await testNureplyConnection(apiKey)
        break
      case 'instantly':
        result = await testInstantlyConnection(apiKey)
        break
      case 'heyreach':
        result = await testHeyReachConnection(apiKey)
        break
      default:
        result = { success: false, message: 'Unknown provider' }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Test connection error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Test failed' },
      { status: 500 }
    )
  }
}
