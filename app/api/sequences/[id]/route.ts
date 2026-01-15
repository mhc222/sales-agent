import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  try {
    // Get sequence with full details
    const { data: sequence, error: seqError } = await supabase
      .from('email_sequences')
      .select(`
        *,
        leads (
          id,
          first_name,
          last_name,
          email,
          company_name,
          job_title,
          linkedin_url,
          status,
          source
        )
      `)
      .eq('id', id)
      .single()

    if (seqError) throw seqError
    if (!sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
    }

    // Get research record if available
    const { data: research } = await supabase
      .from('research_records')
      .select('extracted_signals')
      .eq('lead_id', sequence.lead_id)
      .single()

    // Get review history from email_reviews if exists
    const { data: reviews } = await supabase
      .from('email_reviews')
      .select('*')
      .eq('sequence_id', id)
      .order('created_at', { ascending: false })
      .limit(5)

    const lead = sequence.leads as unknown as {
      id: string
      first_name: string
      last_name: string
      email: string
      company_name: string
      job_title: string | null
      linkedin_url: string | null
      status: string
      source: string | null
    } | null

    return NextResponse.json({
      sequence: {
        id: sequence.id,
        leadId: sequence.lead_id,
        status: sequence.status,
        reviewStatus: sequence.review_status,
        reviewAttempts: sequence.review_attempts,
        reviewResult: sequence.review_result,
        thread1: sequence.thread_1,
        thread2: sequence.thread_2,
        pain1: sequence.pain_1,
        pain2: sequence.pain_2,
        strategy: sequence.sequence_strategy,
        createdAt: sequence.created_at,
        approvedAt: sequence.approved_at,
        deployedAt: sequence.deployed_at,
      },
      lead: lead ? {
        id: lead.id,
        name: `${lead.first_name} ${lead.last_name}`,
        email: lead.email,
        company: lead.company_name,
        jobTitle: lead.job_title,
        linkedInUrl: lead.linkedin_url,
        status: lead.status,
        source: lead.source,
      } : null,
      research: research?.extracted_signals || null,
      reviews: reviews || [],
    })
  } catch (error) {
    console.error('Sequence detail error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sequence' },
      { status: 500 }
    )
  }
}
