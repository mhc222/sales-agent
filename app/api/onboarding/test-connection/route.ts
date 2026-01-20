import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { provider, apiKey, apiUrl, locationId } = body

    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'Provider is required' },
        { status: 400 }
      )
    }

    // Test connection based on provider
    let success = false
    let message = ''

    switch (provider) {
      case 'smartlead': {
        if (!apiKey) {
          return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 })
        }
        const res = await fetch('https://server.smartlead.ai/api/v1/campaigns?api_key=' + apiKey)
        success = res.ok
        if (!success) {
          const data = await res.json().catch(() => ({}))
          message = data.message || 'Invalid API key'
        }
        break
      }

      case 'nureply': {
        if (!apiKey) {
          return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 })
        }
        const res = await fetch('https://api.nureply.com/v3/user-api/validate', {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          }
        })
        success = res.ok
        if (!success) {
          message = 'Invalid API key'
        }
        break
      }

      case 'instantly': {
        if (!apiKey) {
          return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 })
        }
        const res = await fetch('https://api.instantly.ai/api/v1/account/status', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        success = res.ok
        if (!success) {
          message = 'Invalid API key'
        }
        break
      }

      case 'apollo': {
        if (!apiKey) {
          return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 })
        }
        const res = await fetch('https://api.apollo.io/v1/auth/health', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify({ api_key: apiKey }),
        })
        success = res.ok
        if (!success) {
          message = 'Invalid API key'
        }
        break
      }

      case 'heyreach': {
        if (!apiKey) {
          return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 })
        }
        const res = await fetch('https://api.heyreach.io/api/v1/campaigns?page=0&limit=1', {
          headers: { 'X-API-Key': apiKey }
        })
        success = res.ok
        if (!success) {
          message = 'Invalid API key'
        }
        break
      }

      case 'audiencelab': {
        if (!apiUrl || !apiKey) {
          return NextResponse.json(
            { success: false, error: 'API URL and API key are required' },
            { status: 400 }
          )
        }
        try {
          const res = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'X-API-Key': apiKey,
              'Content-Type': 'application/json',
            },
          })
          success = res.ok
          if (!success) {
            message = `API returned ${res.status}: ${res.statusText}`
          }
        } catch (err) {
          message = err instanceof Error ? err.message : 'Failed to connect'
        }
        break
      }

      case 'gohighlevel': {
        if (!apiKey || !locationId) {
          return NextResponse.json(
            { success: false, error: 'API key and Location ID are required' },
            { status: 400 }
          )
        }
        try {
          // Test by searching for contacts (validates both API key and location ID)
          const res = await fetch(
            `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&limit=1`,
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Version': '2021-07-28',
              },
            }
          )
          success = res.ok
          if (!success) {
            const errorData = await res.json().catch(() => ({}))
            message = errorData.message || 'Invalid API key or Location ID'
          }
        } catch (err) {
          message = err instanceof Error ? err.message : 'Failed to connect'
        }
        break
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Unknown provider' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success,
      error: success ? undefined : message || 'Connection failed',
    })
  } catch (error) {
    console.error('Test connection error:', error)
    return NextResponse.json(
      { success: false, error: 'Connection test failed' },
      { status: 500 }
    )
  }
}
