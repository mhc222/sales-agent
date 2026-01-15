import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  try {
    const body = await request.json()
    const { decision, notes } = body

    if (!decision || !['approve', 'revise', 'reject'].includes(decision)) {
      return NextResponse.json(
        { error: 'Invalid decision. Must be approve, revise, or reject.' },
        { status: 400 }
      )
    }

    // Get current sequence
    const { data: sequence, error: getError } = await supabase
      .from('email_sequences')
      .select('*')
      .eq('id', id)
      .single()

    if (getError) throw getError
    if (!sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
    }

    // Determine new status based on decision
    let newStatus = sequence.status
    let newReviewStatus = sequence.review_status
    const now = new Date().toISOString()

    switch (decision) {
      case 'approve':
        newStatus = 'approved'
        newReviewStatus = 'approved'
        break
      case 'revise':
        newReviewStatus = 'revision_needed'
        break
      case 'reject':
        newStatus = 'cancelled'
        newReviewStatus = 'rejected'
        break
    }

    // Update sequence
    const updateData: Record<string, unknown> = {
      status: newStatus,
      review_status: newReviewStatus,
      updated_at: now,
    }

    if (decision === 'approve') {
      updateData.approved_at = now
    }

    // Store review decision in review_result
    updateData.review_result = {
      ...(sequence.review_result || {}),
      lastHumanReview: {
        decision,
        notes,
        timestamp: now,
      },
    }

    const { error: updateError } = await supabase
      .from('email_sequences')
      .update(updateData)
      .eq('id', id)

    if (updateError) throw updateError

    // If approved, trigger deployment workflow (using Inngest if available)
    if (decision === 'approve') {
      // Log to lead_memories
      await supabase.from('lead_memories').insert({
        lead_id: sequence.lead_id,
        tenant_id: sequence.tenant_id,
        source: 'human',
        memory_type: 'status_change',
        content: {
          action: 'sequence_approved',
          sequenceId: id,
          notes,
        },
        summary: 'Sequence approved for deployment',
      })

      // Optionally trigger deployment - would integrate with Inngest here
      // For now, we'll let the user manually deploy
    }

    return NextResponse.json({
      success: true,
      sequence: {
        id,
        status: newStatus,
        reviewStatus: newReviewStatus,
      },
    })
  } catch (error) {
    console.error('Review API error:', error)
    return NextResponse.json(
      { error: 'Failed to submit review' },
      { status: 500 }
    )
  }
}
