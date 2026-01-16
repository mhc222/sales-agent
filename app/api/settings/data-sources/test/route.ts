import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { createApolloClient } from '@/src/lib/apollo'

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
    const { source, api_key, api_url } = body

    if (!source || !['apollo', 'pixel', 'intent'].includes(source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }

    // Test Apollo connection
    if (source === 'apollo') {
      if (!api_key) {
        return NextResponse.json({ success: false, message: 'API key is required' })
      }

      try {
        const apollo = createApolloClient(api_key)
        const result = await apollo.searchPeople({ perPage: 1 })
        return NextResponse.json({
          success: true,
          message: 'Apollo connection successful',
          details: `Found ${result.pagination.total_entries} total leads`,
        })
      } catch (err) {
        return NextResponse.json({
          success: false,
          message: err instanceof Error ? err.message : 'Apollo connection failed',
        })
      }
    }

    // Test Pixel/Intent connection
    if (source === 'pixel' || source === 'intent') {
      if (!api_url || !api_key) {
        return NextResponse.json({
          success: false,
          message: 'Both API URL and API key are required',
        })
      }

      try {
        const response = await fetch(api_url, {
          method: 'GET',
          headers: {
            'X-API-Key': api_key,
            'Content-Type': 'application/json',
          },
        })

        if (response.ok) {
          const data = await response.json()
          const recordCount = data.total_records || data.data?.length || 0
          return NextResponse.json({
            success: true,
            message: 'Connection successful',
            details: `API returned ${recordCount} records`,
          })
        }

        return NextResponse.json({
          success: false,
          message: `API returned ${response.status}: ${response.statusText}`,
        })
      } catch (err) {
        return NextResponse.json({
          success: false,
          message: err instanceof Error ? err.message : 'Connection failed',
        })
      }
    }

    return NextResponse.json({ error: 'Invalid source type' }, { status: 400 })
  } catch (error) {
    console.error('Test connection error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Test failed' },
      { status: 500 }
    )
  }
}
