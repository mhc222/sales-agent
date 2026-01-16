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
    const { provider, apiKey } = body

    if (!provider || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'Provider and API key are required' },
        { status: 400 }
      )
    }

    // Test connection based on provider
    let success = false
    let message = ''

    switch (provider) {
      case 'smartlead': {
        const res = await fetch('https://server.smartlead.ai/api/v1/campaigns?api_key=' + apiKey)
        success = res.ok
        if (!success) {
          const data = await res.json().catch(() => ({}))
          message = data.message || 'Invalid API key'
        }
        break
      }

      case 'instantly': {
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
        const res = await fetch('https://api.heyreach.io/api/v1/user', {
          headers: { 'X-API-KEY': apiKey }
        })
        success = res.ok
        if (!success) {
          message = 'Invalid API key'
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
