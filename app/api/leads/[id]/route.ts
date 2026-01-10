import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
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

  // Fetch research
  const { data: researchRecord } = await supabase
    .from('research_records')
    .select('extracted_signals')
    .eq('lead_id', leadId)
    .single()

  // Fetch sequence
  const { data: sequence } = await supabase
    .from('email_sequences')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Fetch memories
  const { data: memories } = await supabase
    .from('lead_memories')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    lead,
    research: researchRecord?.extracted_signals || null,
    sequence: sequence || null,
    memories: memories || [],
  })
}
