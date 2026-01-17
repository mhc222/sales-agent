import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Get current date ranges
    const now = new Date()
    const thisWeekStart = new Date(now)
    thisWeekStart.setDate(now.getDate() - 7)
    const lastWeekStart = new Date(now)
    lastWeekStart.setDate(now.getDate() - 14)

    // Fetch lead counts by status
    const { data: statusCounts, error: statusError } = await supabase
      .from('leads')
      .select('status')

    if (statusError) throw statusError

    // Count leads by status
    const countByStatus = (statusCounts || []).reduce((acc, lead) => {
      const status = lead.status || 'new'
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Get total leads
    const totalLeads = statusCounts?.length || 0

    // Get leads created this week vs last week
    const { count: thisWeekCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thisWeekStart.toISOString())

    const { count: lastWeekCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', lastWeekStart.toISOString())
      .lt('created_at', thisWeekStart.toISOString())

    // Calculate week-over-week change
    const leadsChange = lastWeekCount && lastWeekCount > 0
      ? Math.round(((thisWeekCount || 0) - lastWeekCount) / lastWeekCount * 100)
      : 0

    // Get reply counts
    const { count: repliedCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('email_replied', true)

    // Get meeting count (leads with status meeting_booked)
    const meetingCount = countByStatus['meeting_booked'] || 0

    // Get deployed count
    const deployedCount = countByStatus['deployed'] || 0

    // Get sequences pending review
    const { count: pendingReviewCount } = await supabase
      .from('email_sequences')
      .select('*', { count: 'exact', head: true })
      .in('review_status', ['pending', 'revision_needed', 'human_review'])

    // Get recent activity from lead_memories
    const { data: recentActivity, error: activityError } = await supabase
      .from('lead_memories')
      .select(`
        id,
        lead_id,
        source,
        memory_type,
        summary,
        created_at,
        leads (
          first_name,
          last_name,
          company_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10)

    if (activityError) throw activityError

    // Format activity - cast leads to single object (it's a many-to-one relation)
    const activity = (recentActivity || []).map((item) => {
      const lead = item.leads as unknown as { first_name: string; last_name: string; company_name: string } | null
      return {
        id: item.id,
        leadId: item.lead_id,
        leadName: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
        company: lead?.company_name || 'Unknown',
        type: item.memory_type,
        source: item.source,
        summary: item.summary,
        timestamp: item.created_at,
      }
    })

    // Pipeline status breakdown
    const pipeline = [
      { status: 'qualified', label: 'Qualified', count: countByStatus['qualified'] || 0 },
      { status: 'researched', label: 'Researched', count: countByStatus['researched'] || 0 },
      { status: 'sequence_ready', label: 'Seq Ready', count: countByStatus['sequence_ready'] || 0 },
      { status: 'deployed', label: 'Deployed', count: deployedCount },
      { status: 'replied', label: 'Replied', count: countByStatus['replied'] || 0 },
      { status: 'interested', label: 'Interested', count: countByStatus['interested'] || 0 },
      { status: 'meeting_booked', label: 'Meetings', count: meetingCount },
    ]

    // Get holding leads count
    const holdingCount = countByStatus['holding'] || 0

    return NextResponse.json({
      stats: {
        totalLeads,
        leadsChange,
        deployed: deployedCount,
        replies: repliedCount || 0,
        meetings: meetingCount,
        pendingReview: pendingReviewCount || 0,
        holdingLeads: holdingCount,
      },
      pipeline,
      activity,
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
