import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Get learned patterns
    const { data: patterns, error: patternsError } = await supabase
      .from('learned_patterns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (patternsError) throw patternsError

    // Group patterns by status
    const highPerformers = (patterns || []).filter(p => p.status === 'high_performer')
    const avoidPatterns = (patterns || []).filter(p => p.status === 'avoid')
    const promoted = (patterns || []).filter(p => p.promoted_to_template === true)
    const experimental = (patterns || []).filter(p => p.status === 'experimental')

    // Get recent pattern discoveries (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recentPatterns = (patterns || []).filter(p => p.created_at >= sevenDaysAgo)

    // Transform for frontend
    const transformPattern = (p: Record<string, unknown>) => ({
      id: p.id,
      category: p.category || 'unknown',
      pattern: p.pattern || '',
      status: p.status || 'unknown',
      confidenceScore: p.confidence_score || 0,
      sampleSize: p.sample_size || 0,
      promotedToTemplate: p.promoted_to_template || false,
      createdAt: p.created_at,
      context: p.context || {},
    })

    return NextResponse.json({
      summary: {
        totalPatterns: patterns?.length || 0,
        highPerformers: highPerformers.length,
        avoidPatterns: avoidPatterns.length,
        promoted: promoted.length,
        experimental: experimental.length,
        recentDiscoveries: recentPatterns.length,
      },
      patterns: {
        highPerformers: highPerformers.map(transformPattern),
        avoidPatterns: avoidPatterns.map(transformPattern),
        promoted: promoted.map(transformPattern),
        experimental: experimental.map(transformPattern),
      },
    })
  } catch (error) {
    console.error('Patterns analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pattern analytics' },
      { status: 500 }
    )
  }
}
