import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const reviewStatus = searchParams.get('review_status')
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    let query = supabase
      .from('email_sequences')
      .select(`
        id,
        lead_id,
        status,
        review_status,
        review_attempts,
        sequence_strategy,
        created_at,
        approved_at,
        deployed_at,
        leads (
          id,
          first_name,
          last_name,
          email,
          company_name,
          job_title
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Filter by sequence status
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Filter by review status
    if (reviewStatus && reviewStatus !== 'all') {
      if (reviewStatus === 'needs_review') {
        // Show sequences that need attention
        query = query.in('review_status', ['pending', 'revision_needed', 'human_review'])
      } else {
        query = query.eq('review_status', reviewStatus)
      }
    }

    const { data, error } = await query

    if (error) throw error

    // Format response
    const sequences = (data || []).map((seq) => {
      const lead = seq.leads as unknown as {
        id: string
        first_name: string
        last_name: string
        email: string
        company_name: string
        job_title: string | null
      } | null

      return {
        id: seq.id,
        leadId: seq.lead_id,
        leadName: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
        leadEmail: lead?.email || '',
        company: lead?.company_name || 'Unknown',
        jobTitle: lead?.job_title || null,
        status: seq.status,
        reviewStatus: seq.review_status,
        reviewAttempts: seq.review_attempts,
        strategy: seq.sequence_strategy,
        createdAt: seq.created_at,
        approvedAt: seq.approved_at,
        deployedAt: seq.deployed_at,
      }
    })

    return NextResponse.json({ sequences })
  } catch (error) {
    console.error('Sequences API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sequences' },
      { status: 500 }
    )
  }
}
