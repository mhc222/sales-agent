import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Get date ranges
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    // Get engagement events for last 30 days
    const { data: recentEvents, error: eventsError } = await supabase
      .from('engagement_events')
      .select('event_type, occurred_at')
      .gte('occurred_at', thirtyDaysAgo.toISOString())

    if (eventsError) throw eventsError

    // Get previous 30 days for comparison
    const { data: previousEvents, error: prevError } = await supabase
      .from('engagement_events')
      .select('event_type')
      .gte('occurred_at', sixtyDaysAgo.toISOString())
      .lt('occurred_at', thirtyDaysAgo.toISOString())

    if (prevError) throw prevError

    // Count events by type
    const countByType = (events: { event_type: string }[]) => {
      return events.reduce((acc, e) => {
        acc[e.event_type] = (acc[e.event_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    }

    const recentCounts = countByType(recentEvents || [])
    const previousCounts = countByType(previousEvents || [])

    // Get total deployed sequences for rate calculations
    const { count: deployedCount } = await supabase
      .from('email_sequences')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'deployed')

    const totalDeployed = deployedCount || 1 // Avoid division by zero

    // Calculate rates
    const calculateRate = (count: number) => ((count / totalDeployed) * 100).toFixed(1)
    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0
      return Math.round(((current - previous) / previous) * 100)
    }

    const metrics = {
      openRate: {
        value: parseFloat(calculateRate(recentCounts['open'] || 0)),
        change: calculateChange(recentCounts['open'] || 0, previousCounts['open'] || 0),
      },
      replyRate: {
        value: parseFloat(calculateRate(recentCounts['reply'] || 0)),
        change: calculateChange(recentCounts['reply'] || 0, previousCounts['reply'] || 0),
      },
      positiveReplyRate: {
        value: parseFloat(calculateRate(recentCounts['positive_reply'] || 0)),
        change: calculateChange(recentCounts['positive_reply'] || 0, previousCounts['positive_reply'] || 0),
      },
      meetingRate: {
        value: parseFloat(calculateRate(recentCounts['meeting_booked'] || 0)),
        change: calculateChange(recentCounts['meeting_booked'] || 0, previousCounts['meeting_booked'] || 0),
      },
    }

    // Group events by day for trend chart
    const eventsByDay = (recentEvents || []).reduce((acc, event) => {
      const date = new Date(event.occurred_at).toISOString().split('T')[0]
      if (!acc[date]) {
        acc[date] = { opens: 0, replies: 0, meetings: 0 }
      }
      if (event.event_type === 'open') acc[date].opens++
      if (event.event_type === 'reply' || event.event_type === 'positive_reply') acc[date].replies++
      if (event.event_type === 'meeting_booked') acc[date].meetings++
      return acc
    }, {} as Record<string, { opens: number; replies: number; meetings: number }>)

    // Convert to array for chart
    const trendData = Object.entries(eventsByDay)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Get source performance
    const { data: leadsBySource } = await supabase
      .from('leads')
      .select('source, email_replied, email_open_count')
      .not('source', 'is', null)

    const sourcePerformance = (leadsBySource || []).reduce((acc, lead) => {
      const source = lead.source || 'unknown'
      if (!acc[source]) {
        acc[source] = { total: 0, opened: 0, replied: 0 }
      }
      acc[source].total++
      if ((lead.email_open_count || 0) > 0) acc[source].opened++
      if (lead.email_replied) acc[source].replied++
      return acc
    }, {} as Record<string, { total: number; opened: number; replied: number }>)

    const sourceStats = Object.entries(sourcePerformance).map(([source, stats]) => ({
      source,
      total: stats.total,
      openRate: stats.total > 0 ? Math.round((stats.opened / stats.total) * 100) : 0,
      replyRate: stats.total > 0 ? Math.round((stats.replied / stats.total) * 100) : 0,
    }))

    // Get pipeline funnel
    const { data: pipelineData } = await supabase
      .from('leads')
      .select('status')

    const pipelineCounts = (pipelineData || []).reduce((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const funnel = [
      { stage: 'Qualified', count: pipelineCounts['qualified'] || 0 },
      { stage: 'Researched', count: pipelineCounts['researched'] || 0 },
      { stage: 'Deployed', count: pipelineCounts['deployed'] || 0 },
      { stage: 'Replied', count: (pipelineCounts['replied'] || 0) + (pipelineCounts['interested'] || 0) },
      { stage: 'Meeting', count: pipelineCounts['meeting_booked'] || 0 },
    ]

    return NextResponse.json({
      metrics,
      trendData,
      sourceStats,
      funnel,
    })
  } catch (error) {
    console.error('Analytics overview error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
