import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Inngest } from 'inngest'

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

  // Fetch lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Fetch sequence
  const { data: sequence, error: seqError } = await supabase
    .from('email_sequences')
    .select('*')
    .eq('lead_id', leadId)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (seqError || !sequence) {
    return NextResponse.json(
      { error: 'No pending/approved sequence found' },
      { status: 400 }
    )
  }

  // Trigger deployment
  await inngest.send({
    name: 'lead.deploy-to-smartlead',
    data: {
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      sequence_id: sequence.id,
      relationship_type: sequence.relationship_type,
      persona_type: sequence.persona_type,
      thread_1_subject: sequence.thread_1.subject,
      thread_2_subject: sequence.thread_2.subject,
    },
  })

  return NextResponse.json({ status: 'triggered', sequence_id: sequence.id })
}
