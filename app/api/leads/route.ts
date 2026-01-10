import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const qualification = searchParams.get('qualification')
  const source = searchParams.get('source')
  const search = searchParams.get('search')
  const minScore = searchParams.get('min_score')
  const showAll = searchParams.get('show_all') === 'true'

  let query = supabase
    .from('leads')
    .select(`
      id,
      first_name,
      last_name,
      email,
      company_name,
      job_title,
      status,
      qualification_decision,
      source,
      intent_score,
      created_at,
      research_records (
        extracted_signals
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  // By default, hide low-score intent leads (below 60)
  // Unless show_all=true or filtering by specific source
  if (!showAll && source !== 'intent_data') {
    // For intent_data leads, only show score >= 60
    // For other sources (or null), show all
    query = query.or('intent_score.gte.60,intent_score.is.null,source.neq.intent_data')
  }

  // Custom min score filter
  if (minScore) {
    query = query.gte('intent_score', parseInt(minScore))
  }

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  // Map qualified/disqualified to YES/NO for database query
  if (qualification && qualification !== 'all') {
    if (qualification === 'qualified') {
      query = query.eq('qualification_decision', 'YES')
    } else if (qualification === 'disqualified') {
      query = query.eq('qualification_decision', 'NO')
    } else if (qualification === 'pending') {
      query = query.is('qualification_decision', null)
    }
  }

  if (source && source !== 'all') {
    query = query.eq('source', source)
  }

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company_name.ilike.%${search}%`
    )
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform data to include research info at top level
  const leads = data?.map((lead) => {
    const research = lead.research_records?.[0]?.extracted_signals
    return {
      id: lead.id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      company_name: lead.company_name,
      job_title: lead.job_title,
      status: lead.status,
      qualification_decision: lead.qualification_decision,
      source: lead.source,
      intent_score: lead.intent_score,
      created_at: lead.created_at,
      research: research
        ? {
            relationship_type: research.relationship?.type,
            persona_type: research.persona_match?.type,
          }
        : null,
    }
  })

  return NextResponse.json({ leads })
}
