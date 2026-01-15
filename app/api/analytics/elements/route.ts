import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Get element performance data
    const { data: elementData, error: elementError } = await supabase
      .from('element_performance')
      .select('*')
      .order('engagement_score', { ascending: false })

    if (elementError) throw elementError

    // Transform data for frontend
    const elements = (elementData || []).map(el => ({
      category: el.category || 'unknown',
      elementType: el.element_type || 'unknown',
      timesUsed: el.times_used || 0,
      openRate: el.open_rate || 0,
      replyRate: el.reply_rate || 0,
      engagementScore: el.engagement_score || 0,
    }))

    return NextResponse.json({ elements })
  } catch (error) {
    console.error('Elements analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch element analytics' },
      { status: 500 }
    )
  }
}
