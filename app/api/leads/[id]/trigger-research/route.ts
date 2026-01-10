import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../../src/lib/supabase'
import { inngest } from '../../../../../inngest/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/leads/[id]/trigger-research
 * Manually triggers research workflow for a qualified intent lead
 * Used for the 80 leads not in the auto-research top 20
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: leadId } = await params

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID required' }, { status: 400 })
    }

    console.log(`[Trigger Research] Processing lead: ${leadId}`)

    // Fetch the lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.error('[Trigger Research] Lead not found:', leadError)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Validate lead can be triggered
    if (lead.status === 'deployed') {
      return NextResponse.json(
        { error: 'Lead already deployed', current_status: lead.status },
        { status: 400 }
      )
    }

    if (lead.status === 'sequenced') {
      return NextResponse.json(
        { error: 'Lead already sequenced - deploy to Smartlead instead', current_status: lead.status },
        { status: 400 }
      )
    }

    if (lead.in_smartlead) {
      return NextResponse.json(
        { error: 'Lead already in Smartlead', in_smartlead: true },
        { status: 400 }
      )
    }

    // Update lead status to researched
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        status: 'researched',
        qualification_decision: 'YES',
        qualification_reasoning: `Manually triggered for research. Original intent score: ${lead.intent_score || 'N/A'}/100`,
        updated_at: now,
      })
      .eq('id', leadId)

    if (updateError) {
      console.error('[Trigger Research] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update lead status', details: updateError.message },
        { status: 500 }
      )
    }

    // Trigger the research pipeline (workflow 2)
    await inngest.send({
      name: 'lead.ready-for-deployment',
      data: {
        lead_id: leadId,
        tenant_id: lead.tenant_id,
        qualification: {
          decision: 'YES',
          reasoning: `Manually triggered. Intent score: ${lead.intent_score || 'N/A'}/100`,
          confidence: (lead.intent_score || 50) / 100,
          icp_fit: lead.intent_signals?.tier || 'medium',
        },
        visit_count: lead.visit_count || 0,
        is_returning_visitor: false,
        source: lead.source || 'intent_data',
      },
    })

    // Log engagement event
    await supabase.from('engagement_log').insert({
      lead_id: leadId,
      tenant_id: lead.tenant_id,
      event_type: 'research.manually_triggered',
      metadata: {
        intent_score: lead.intent_score,
        previous_status: lead.status,
        triggered_at: now,
      },
    })

    console.log(`[Trigger Research] Successfully triggered research for: ${lead.email}`)

    return NextResponse.json({
      status: 'success',
      message: 'Research pipeline triggered',
      lead: {
        id: leadId,
        email: lead.email,
        company: lead.company_name,
        intent_score: lead.intent_score,
        previous_status: lead.status,
        new_status: 'researched',
      },
      workflow: 'lead.ready-for-deployment',
    })
  } catch (error) {
    console.error('[Trigger Research] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
