import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../src/lib/supabase'

/**
 * GET /api/leads/intent
 * Returns intent data leads for daily review, sorted by intent_score DESC
 *
 * Query params:
 * - date: Filter by batch_date (YYYY-MM-DD), defaults to today
 * - status: Filter by lead status (qualified, researched, etc.)
 * - limit: Max results (default 100)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    console.log(`[Intent API] Fetching intent leads for date: ${date}, status: ${status || 'all'}`)

    // Build query
    let query = supabase
      .from('leads')
      .select(`
        id,
        first_name,
        last_name,
        email,
        job_title,
        headline,
        seniority_level,
        linkedin_url,
        company_name,
        company_domain,
        company_industry,
        company_employee_count,
        company_revenue,
        company_linkedin_url,
        source,
        status,
        intent_score,
        intent_signals,
        qualification_decision,
        qualification_reasoning,
        qualification_confidence,
        icp_fit,
        in_ghl,
        in_smartlead,
        in_heyreach,
        created_at,
        updated_at
      `)
      .eq('source', 'intent_data')
      .order('intent_score', { ascending: false })
      .limit(limit)

    // Filter by batch_date from intent_signals
    query = query.filter('intent_signals->batch_date', 'eq', date)

    // Optional status filter
    if (status) {
      query = query.eq('status', status)
    }

    const { data: leads, error } = await query

    if (error) {
      console.error('[Intent API] Database error:', error)
      return NextResponse.json(
        { error: 'Database error', details: error.message },
        { status: 500 }
      )
    }

    // Format response with intent tier indicators
    const formattedLeads = (leads || []).map((lead) => {
      const score = lead.intent_score || 0
      let tier: string
      let indicator: string

      if (score >= 70) {
        tier = 'strong'
        indicator = '🟢'
      } else if (score >= 40) {
        tier = 'medium'
        indicator = '🟡'
      } else {
        tier = 'weak'
        indicator = '🔴'
      }

      return {
        ...lead,
        intent_tier: tier,
        intent_indicator: indicator,
        batch_rank: lead.intent_signals?.batch_rank || null,
        auto_research: lead.intent_signals?.auto_research || false,
      }
    })

    // Calculate summary stats
    const stats = {
      total: formattedLeads.length,
      by_tier: {
        strong: formattedLeads.filter((l) => l.intent_tier === 'strong').length,
        medium: formattedLeads.filter((l) => l.intent_tier === 'medium').length,
        weak: formattedLeads.filter((l) => l.intent_tier === 'weak').length,
      },
      by_status: {
        qualified: formattedLeads.filter((l) => l.status === 'qualified').length,
        researched: formattedLeads.filter((l) => l.status === 'researched').length,
        sequenced: formattedLeads.filter((l) => l.status === 'sequenced').length,
        deployed: formattedLeads.filter((l) => l.status === 'deployed').length,
      },
      auto_researched: formattedLeads.filter((l) => l.auto_research).length,
      in_existing_systems: {
        ghl: formattedLeads.filter((l) => l.in_ghl).length,
        smartlead: formattedLeads.filter((l) => l.in_smartlead).length,
        heyreach: formattedLeads.filter((l) => l.in_heyreach).length,
      },
      score_range: {
        highest: formattedLeads[0]?.intent_score || 0,
        lowest: formattedLeads[formattedLeads.length - 1]?.intent_score || 0,
      },
    }

    return NextResponse.json({
      date,
      stats,
      leads: formattedLeads,
    })
  } catch (error) {
    console.error('[Intent API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
