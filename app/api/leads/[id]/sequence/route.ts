import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { pauseLead, resumeLead, getLeadStatus } from '../../../../../src/lib/smartlead'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH - Update sequence status (pause/resume/cancel)
// This is a MASTER control that affects all platforms (Smartlead, HeyReach, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { action } = body // 'pause' | 'resume' | 'cancel'

  if (!['pause', 'resume', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    // Get lead info including platform flags
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('email, tenant_id, in_smartlead, in_heyreach')
      .eq('id', id)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const { data: sequence, error: seqError } = await supabase
      .from('email_sequences')
      .select('id, status, smartlead_campaign_id, heyreach_campaign_id')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (seqError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
    }

    let newStatus: string
    const platformResults: Record<string, string> = {}

    // Determine new status based on action
    if (action === 'pause') {
      if (sequence.status !== 'deployed' && sequence.status !== 'active') {
        return NextResponse.json({ error: 'Can only pause active/deployed sequences' }, { status: 400 })
      }
      newStatus = 'paused'
    } else if (action === 'resume') {
      if (sequence.status !== 'paused') {
        return NextResponse.json({ error: 'Can only resume paused sequences' }, { status: 400 })
      }
      newStatus = 'deployed'
    } else if (action === 'cancel') {
      newStatus = 'cancelled'
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Handle Smartlead
    const smartleadCampaignId = sequence.smartlead_campaign_id || process.env.SMARTLEAD_CAMPAIGN_ID
    if (smartleadCampaignId && lead.in_smartlead) {
      try {
        if (action === 'pause' || action === 'cancel') {
          await pauseLead(Number(smartleadCampaignId), lead.email)
          platformResults.smartlead = 'paused'
        } else if (action === 'resume') {
          await resumeLead(Number(smartleadCampaignId), lead.email)
          platformResults.smartlead = 'resumed'
        }
      } catch (err) {
        console.error('Smartlead action failed:', err)
        platformResults.smartlead = `error: ${err instanceof Error ? err.message : 'unknown'}`
      }
    }

    // Handle HeyReach (placeholder for when we add it)
    if (sequence.heyreach_campaign_id && lead.in_heyreach) {
      try {
        // TODO: Implement HeyReach pause/resume when API is added
        // await heyreachPause(sequence.heyreach_campaign_id, lead.email)
        platformResults.heyreach = 'not_implemented'
      } catch (err) {
        console.error('HeyReach action failed:', err)
        platformResults.heyreach = `error: ${err instanceof Error ? err.message : 'unknown'}`
      }
    }

    // Update sequence status in database (master status)
    const { error: updateError } = await supabase
      .from('email_sequences')
      .update({ status: newStatus })
      .eq('id', sequence.id)

    if (updateError) {
      console.error('Error updating sequence status:', updateError)
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }

    // Log to lead_memories
    await supabase.from('lead_memories').insert({
      lead_id: id,
      tenant_id: lead.tenant_id,
      source: 'dashboard',
      memory_type: `sequence_${action}d`,
      content: {
        action,
        previous_status: sequence.status,
        new_status: newStatus,
        platform_results: platformResults,
      },
      summary: `Sequence ${action}d from dashboard (${Object.keys(platformResults).join(', ')})`,
    })

    return NextResponse.json({
      success: true,
      status: newStatus,
      platform_results: platformResults,
    })
  } catch (error) {
    console.error('Error updating sequence:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET - Get sequence stats from Smartlead
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // Get lead email
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('email')
      .eq('id', id)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Get sequence with campaign ID
    const { data: sequence, error: seqError } = await supabase
      .from('email_sequences')
      .select('smartlead_campaign_id, status')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (seqError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
    }

    const campaignId = sequence.smartlead_campaign_id || process.env.SMARTLEAD_CAMPAIGN_ID

    if (!campaignId) {
      return NextResponse.json({ stats: null, status: sequence.status })
    }

    // Get stats from Smartlead
    const stats = await getLeadStatus(Number(campaignId), lead.email)

    return NextResponse.json({
      status: sequence.status,
      smartlead_status: stats?.status || null,
      stats: stats?.stats || null,
    })
  } catch (error) {
    console.error('Error fetching sequence stats:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
