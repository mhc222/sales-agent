import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyDailySummary } from '../../../src/lib/slack-notifier'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Daily Stats Cron Job
 * Sends a daily summary to Slack with key metrics
 *
 * Vercel Cron: Configure in vercel.json with schedule "0 9 * * *" (9am daily)
 */

interface DailyStats {
  sends: number
  opens: number
  clicks: number
  replies: number
  bounces: number
  unsubscribes: number
  openRate: number
  replyRate: number
  bounceRate: number
  pendingReviews: number
  correctionsLearned: number
  topCompanies: Array<{ name: string; status: string }>
}

async function getDailyStats(): Promise<DailyStats> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get engagement events from yesterday
  const { data: events } = await supabase
    .from('engagement_log')
    .select('event_type')
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString())

  // Count by event type
  const eventCounts: Record<string, number> = {}
  events?.forEach(e => {
    eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1
  })

  // Get email opens
  const { count: openCount } = await supabase
    .from('email_opens')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString())

  // Get email responses (replies, bounces, etc)
  const { data: responses } = await supabase
    .from('email_responses')
    .select('event_type')
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString())

  const responseCounts: Record<string, number> = {}
  responses?.forEach(r => {
    responseCounts[r.event_type] = (responseCounts[r.event_type] || 0) + 1
  })

  // Get sends (deployed sequences)
  const { count: sendCount } = await supabase
    .from('email_sequences')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'deployed')
    .gte('deployed_at', yesterday.toISOString())
    .lt('deployed_at', today.toISOString())

  // Get pending reviews
  const { count: pendingReviews } = await supabase
    .from('email_sequences')
    .select('*', { count: 'exact', head: true })
    .in('review_status', ['pending', 'human_review', 'revision_needed'])

  // Get corrections learned today
  const { count: correctionsLearned } = await supabase
    .from('human_corrections')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString())

  // Get recent companies with activity
  const { data: recentLeads } = await supabase
    .from('leads')
    .select('company_name, status')
    .gte('updated_at', yesterday.toISOString())
    .order('updated_at', { ascending: false })
    .limit(5)

  const topCompanies = recentLeads?.map(l => ({
    name: l.company_name || 'Unknown',
    status: l.status || 'unknown',
  })) || []

  // Calculate stats
  const sends = sendCount || 0
  const opens = openCount || 0
  const clicks = eventCounts['email.clicked'] || 0
  const replies = responseCounts['reply'] || 0
  const bounces = responseCounts['bounce'] || 0
  const unsubscribes = responseCounts['unsubscribe'] || 0

  return {
    sends,
    opens,
    clicks,
    replies,
    bounces,
    unsubscribes,
    openRate: sends > 0 ? Math.round((opens / sends) * 100) : 0,
    replyRate: sends > 0 ? Math.round((replies / sends) * 100) : 0,
    bounceRate: sends > 0 ? Math.round((bounces / sends) * 100) : 0,
    pendingReviews: pendingReviews || 0,
    correctionsLearned: correctionsLearned || 0,
    topCompanies,
  }
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel passes this automatically)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without auth
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const stats = await getDailyStats()

    console.log('[Daily Stats] Sending summary:', stats)

    // Send to Slack
    await notifyDailySummary({
      pendingReviews: stats.pendingReviews,
      sequencesDeployed: stats.sends,
      correctionsLearned: stats.correctionsLearned,
      topCompanies: stats.topCompanies,
    })

    // Also send a more detailed stats message
    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
    if (SLACK_WEBHOOK_URL) {
      await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `📈 Daily Email Performance (Yesterday)`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '📈 Daily Email Performance',
                emoji: true,
              },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Sends:*\n${stats.sends}` },
                { type: 'mrkdwn', text: `*Opens:*\n${stats.opens} (${stats.openRate}%)` },
                { type: 'mrkdwn', text: `*Clicks:*\n${stats.clicks}` },
                { type: 'mrkdwn', text: `*Replies:*\n${stats.replies} (${stats.replyRate}%)` },
                { type: 'mrkdwn', text: `*Bounces:*\n${stats.bounces} (${stats.bounceRate}%)` },
                { type: 'mrkdwn', text: `*Unsubscribes:*\n${stats.unsubscribes}` },
              ],
            },
            {
              type: 'divider',
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `_Stats from ${new Date(Date.now() - 86400000).toLocaleDateString()}_`,
                },
              ],
            },
          ],
        }),
      })
    }

    return NextResponse.json({
      success: true,
      stats,
      message: 'Daily stats sent to Slack',
    })
  } catch (error) {
    console.error('[Daily Stats] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
