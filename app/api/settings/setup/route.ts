import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      ai_provider,
      ai_api_key,
      smartlead_api_key,
      apollo_api_key,
      audiencelab_api_url,
      audiencelab_api_key,
    } = body

    if (!ai_provider || !ai_api_key) {
      return NextResponse.json(
        { error: 'AI provider and API key are required' },
        { status: 400 }
      )
    }

    // Get or create user settings
    const { data: existing } = await supabase
      .from('user_settings')
      .select('id')
      .eq('user_id', session.user.id)
      .single()

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('user_settings')
        .update({
          ai_provider,
          ai_api_key,
          smartlead_api_key,
          apollo_api_key,
          audiencelab_api_url,
          audiencelab_api_key,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', session.user.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      // Insert new
      const { error } = await supabase.from('user_settings').insert({
        user_id: session.user.id,
        ai_provider,
        ai_api_key,
        smartlead_api_key,
        apollo_api_key,
        audiencelab_api_url,
        audiencelab_api_key,
      })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to save settings' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: data || null })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get settings' },
      { status: 500 }
    )
  }
}
