import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Email {
  subject: string
  body: string
}

interface Thread {
  subject: string
  emails: Email[]
}

interface ContentUpdate {
  thread1?: Thread | null
  thread2?: Thread | null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body: ContentUpdate = await request.json()

    // Validate request
    if (!body.thread1 && !body.thread2) {
      return NextResponse.json(
        { error: 'No content provided' },
        { status: 400 }
      )
    }

    // First check if sequence exists and is editable
    const { data: sequence, error: fetchError } = await supabase
      .from('email_sequences')
      .select('id, status')
      .eq('id', id)
      .single()

    if (fetchError || !sequence) {
      return NextResponse.json(
        { error: 'Sequence not found' },
        { status: 404 }
      )
    }

    // Don't allow editing deployed or completed sequences
    if (['deployed', 'completed'].includes(sequence.status)) {
      return NextResponse.json(
        { error: 'Cannot edit deployed or completed sequences' },
        { status: 400 }
      )
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.thread1 !== undefined) {
      updateData.thread_1 = body.thread1
    }

    if (body.thread2 !== undefined) {
      updateData.thread_2 = body.thread2
    }

    // Update the sequence
    const { error: updateError } = await supabase
      .from('email_sequences')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      throw updateError
    }

    // Get lead_id to log the edit to lead_memories
    const { data: seqData } = await supabase
      .from('email_sequences')
      .select('lead_id')
      .eq('id', id)
      .single()

    if (seqData?.lead_id) {
      await supabase.from('lead_memories').insert({
        lead_id: seqData.lead_id,
        event_type: 'sequence_edited',
        description: 'Sequence content was manually edited',
        context: {
          sequence_id: id,
          edited_threads: [
            body.thread1 !== undefined ? 'thread1' : null,
            body.thread2 !== undefined ? 'thread2' : null,
          ].filter(Boolean),
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Content update error:', error)
    return NextResponse.json(
      { error: 'Failed to update content' },
      { status: 500 }
    )
  }
}
