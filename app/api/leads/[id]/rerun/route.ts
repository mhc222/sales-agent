import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Inngest } from 'inngest'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const inngest = new Inngest({ id: 'jsb-media-sales-agent' })

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const step = request.nextUrl.searchParams.get('step')

  // Fetch lead
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  if (step === 'research') {
    // Trigger research pipeline
    await inngest.send({
      name: 'lead.ready-for-deployment',
      data: {
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        qualification: {
          decision: 'YES',
          reasoning: 'Manual re-run from dashboard',
          confidence: 100,
        },
      },
    })

    return NextResponse.json({ status: 'triggered', step: 'research' })
  }

  if (step === 'sequence') {
    // Fetch research first
    const { data: researchRecord } = await supabase
      .from('research_records')
      .select('extracted_signals')
      .eq('lead_id', leadId)
      .single()

    if (!researchRecord) {
      return NextResponse.json(
        { error: 'Research not found - run research first' },
        { status: 400 }
      )
    }

    const research = researchRecord.extracted_signals

    // Trigger sequencing pipeline
    await inngest.send({
      name: 'lead.research-complete',
      data: {
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        persona_match: research.persona_match,
        top_triggers: research.triggers?.slice(0, 3) || [],
        messaging_angles: research.messaging_angles || [],
        qualification: {
          decision: 'YES',
          reasoning: 'Manual re-run from dashboard',
          confidence: 100,
        },
      },
    })

    return NextResponse.json({ status: 'triggered', step: 'sequence' })
  }

  return NextResponse.json({ error: 'Invalid step parameter' }, { status: 400 })
}
