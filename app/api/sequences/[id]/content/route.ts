import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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
  feedback?: string // Optional feedback explaining what was wrong
  learnFromChanges?: boolean // Whether to auto-detect and learn from edits
}

interface DetectedCorrection {
  incorrectContent: string
  correctContent: string
  context: string
  category: string
}

/**
 * Use Claude to detect meaningful corrections from edit diffs
 */
async function detectCorrectionsFromDiff(
  originalText: string,
  editedText: string,
  companyName: string
): Promise<DetectedCorrection[]> {
  if (originalText === editedText) return []

  const prompt = `You are analyzing edits made to a sales email. Your job is to identify corrections that should be learned for future emails.

Company: ${companyName}

ORIGINAL TEXT:
${originalText}

EDITED TEXT:
${editedText}

Analyze the changes and identify corrections that:
1. Fix factual errors (wrong company type, wrong industry, wrong facts)
2. Improve terminology (better way to describe something)
3. Fix tone issues (too salesy, wrong formality)
4. Remove inappropriate claims

DO NOT flag:
- Minor word changes that don't affect meaning
- Punctuation or formatting changes
- Stylistic preferences without clear improvement

For each meaningful correction, provide:
- incorrectContent: The original problematic text (exact phrase)
- correctContent: The corrected version
- context: Why this correction matters (1 sentence)
- category: One of: business_type, industry, fact, tone, claim, terminology

Return JSON array. If no meaningful corrections, return empty array: []

\`\`\`json
[
  {
    "incorrectContent": "travel agency",
    "correctContent": "marketing agency focused on travel",
    "context": "They serve travel brands, not travelers",
    "category": "business_type"
  }
]
\`\`\``

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON
    let jsonText = responseText.trim()
    const jsonMatch = jsonText.match(/```json\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    return JSON.parse(jsonText) as DetectedCorrection[]
  } catch (error) {
    console.error('[Content API] Error detecting corrections:', error)
    return []
  }
}

/**
 * Save detected corrections to the database
 */
async function saveCorrections(
  tenantId: string,
  companyDomain: string,
  companyName: string,
  corrections: DetectedCorrection[],
  sequenceId: string
) {
  const saved: string[] = []

  for (const correction of corrections) {
    const { error } = await supabase.from('human_corrections').insert({
      tenant_id: tenantId,
      correction_type: 'company',
      company_domain: companyDomain,
      company_name: companyName,
      incorrect_content: correction.incorrectContent,
      correct_content: correction.correctContent,
      context: correction.context,
      category: correction.category,
      severity: 'medium',
      source_sequence_id: sequenceId,
      submitted_by: 'auto-detected',
    })

    if (!error) {
      saved.push(correction.incorrectContent)
    }
  }

  // Also promote high-value corrections to global guidelines
  for (const correction of corrections) {
    if (['business_type', 'fact'].includes(correction.category)) {
      await supabase.from('approved_patterns').insert({
        tenant_id: tenantId,
        pattern_type: 'guideline',
        pattern_content: `Never say "${correction.incorrectContent}" - use "${correction.correctContent}" instead`,
        description: `${correction.category}: ${correction.context}`,
        status: 'active',
        confidence_score: 1.0,
        discovered_from: 'human_edit',
      })
    }
  }

  return saved
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body: ContentUpdate = await request.json()
    const learnFromChanges = body.learnFromChanges !== false // Default to true

    // Validate request
    if (!body.thread1 && !body.thread2) {
      return NextResponse.json(
        { error: 'No content provided' },
        { status: 400 }
      )
    }

    // Fetch original sequence with lead info for diff detection
    const { data: sequence, error: fetchError } = await supabase
      .from('email_sequences')
      .select(`
        id,
        status,
        tenant_id,
        lead_id,
        thread_1,
        thread_2,
        leads!inner(
          company_name,
          company_domain
        )
      `)
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadsData = sequence.leads as any
    const lead = Array.isArray(leadsData)
      ? leadsData[0] as { company_name: string; company_domain: string }
      : leadsData as { company_name: string; company_domain: string }

    // Detect corrections from edits if enabled
    let detectedCorrections: DetectedCorrection[] = []
    let savedCorrections: string[] = []

    if (learnFromChanges) {
      // Build original and edited text for comparison
      const originalThread1 = sequence.thread_1 as Thread | null
      const originalThread2 = sequence.thread_2 as Thread | null

      // Compare thread 1
      if (body.thread1 && originalThread1) {
        const originalText = originalThread1.emails?.map(e => `Subject: ${e.subject}\n${e.body}`).join('\n\n---\n\n') || ''
        const editedText = body.thread1.emails?.map(e => `Subject: ${e.subject}\n${e.body}`).join('\n\n---\n\n') || ''

        if (originalText !== editedText) {
          const corrections = await detectCorrectionsFromDiff(
            originalText,
            editedText,
            lead.company_name
          )
          detectedCorrections.push(...corrections)
        }
      }

      // Compare thread 2
      if (body.thread2 && originalThread2) {
        const originalText = originalThread2.emails?.map(e => `Subject: ${e.subject}\n${e.body}`).join('\n\n---\n\n') || ''
        const editedText = body.thread2.emails?.map(e => `Subject: ${e.subject}\n${e.body}`).join('\n\n---\n\n') || ''

        if (originalText !== editedText) {
          const corrections = await detectCorrectionsFromDiff(
            originalText,
            editedText,
            lead.company_name
          )
          detectedCorrections.push(...corrections)
        }
      }

      // Save detected corrections
      if (detectedCorrections.length > 0) {
        savedCorrections = await saveCorrections(
          sequence.tenant_id,
          lead.company_domain,
          lead.company_name,
          detectedCorrections,
          id
        )
        console.log(`[Content API] Auto-detected ${detectedCorrections.length} corrections, saved ${savedCorrections.length}`)
      }
    }

    // If user provided explicit feedback, save it too
    if (body.feedback) {
      await supabase.from('email_feedback').insert({
        tenant_id: sequence.tenant_id,
        sequence_id: id,
        feedback_type: 'correction',
        comment: body.feedback,
        status: 'pending',
      })
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

    // Log the edit to lead_memories
    if (sequence.lead_id) {
      await supabase.from('lead_memories').insert({
        lead_id: sequence.lead_id,
        tenant_id: sequence.tenant_id,
        source: 'human_edit',
        memory_type: 'sequence_edited',
        content: {
          sequence_id: id,
          edited_threads: [
            body.thread1 !== undefined ? 'thread1' : null,
            body.thread2 !== undefined ? 'thread2' : null,
          ].filter(Boolean),
          corrections_detected: detectedCorrections.length,
          feedback_provided: !!body.feedback,
        },
        summary: `Sequence manually edited${detectedCorrections.length > 0 ? `, ${detectedCorrections.length} corrections learned` : ''}`,
      })
    }

    return NextResponse.json({
      success: true,
      learned: {
        correctionsDetected: detectedCorrections.length,
        correctionsSaved: savedCorrections.length,
        corrections: detectedCorrections,
      },
    })
  } catch (error) {
    console.error('Content update error:', error)
    return NextResponse.json(
      { error: 'Failed to update content' },
      { status: 500 }
    )
  }
}
