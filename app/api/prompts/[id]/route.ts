import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { fullPrompt, changeDescription, changeType, versionLabel, setActive } = body

    // Validate required fields
    if (!fullPrompt) {
      return NextResponse.json(
        { error: 'Full prompt content is required' },
        { status: 400 }
      )
    }

    // Get prompt definition
    const { data: prompt, error: promptError } = await supabase
      .from('prompt_definitions')
      .select('id, tenant_id')
      .eq('id', id)
      .single()

    if (promptError || !prompt) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
    }

    // Get current highest version number
    const { data: latestVersion, error: latestError } = await supabase
      .from('prompt_versions')
      .select('version_number')
      .eq('prompt_definition_id', id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single()

    if (latestError && latestError.code !== 'PGRST116') {
      throw latestError
    }

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1
    const defaultLabel = `v${nextVersionNumber}.0`

    // If setting as active, deprecate current active version
    if (setActive) {
      await supabase
        .from('prompt_versions')
        .update({
          status: 'deprecated',
          deprecated_at: new Date().toISOString()
        })
        .eq('prompt_definition_id', id)
        .eq('status', 'active')
    }

    // Create new version
    const { data: newVersion, error: versionError } = await supabase
      .from('prompt_versions')
      .insert({
        prompt_definition_id: id,
        tenant_id: prompt.tenant_id,
        version_number: nextVersionNumber,
        version_label: versionLabel || defaultLabel,
        full_prompt: fullPrompt.trim(),
        change_description: changeDescription || null,
        change_type: changeType || 'manual',
        status: setActive ? 'active' : 'draft',
        activated_at: setActive ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (versionError) throw versionError

    // Update prompt definition if setting as active
    if (setActive) {
      const { error: updateError } = await supabase
        .from('prompt_definitions')
        .update({
          active_version_id: newVersion.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      if (updateError) throw updateError
    }

    return NextResponse.json({
      id: newVersion.id,
      versionNumber: newVersion.version_number,
      versionLabel: newVersion.version_label,
      status: newVersion.status,
    }, { status: 201 })
  } catch (error) {
    console.error('Create version error:', error)
    return NextResponse.json(
      { error: 'Failed to create version' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get prompt definition
    const { data: prompt, error: promptError } = await supabase
      .from('prompt_definitions')
      .select('*')
      .eq('id', id)
      .single()

    if (promptError) throw promptError
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
    }

    // Get all versions
    const { data: versions, error: versionsError } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('prompt_definition_id', id)
      .order('version_number', { ascending: false })

    if (versionsError) throw versionsError

    // Get A/B tests for this prompt
    const { data: abTests, error: abError } = await supabase
      .from('prompt_ab_tests')
      .select('*')
      .eq('prompt_definition_id', id)
      .order('created_at', { ascending: false })

    if (abError) throw abError

    // Get dynamic sections
    const { data: dynamicSections, error: sectionsError } = await supabase
      .from('prompt_dynamic_sections')
      .select('*')
      .order('section_name', { ascending: true })

    if (sectionsError) throw sectionsError

    // Transform versions
    const transformedVersions = (versions || []).map(v => ({
      id: v.id,
      versionNumber: v.version_number,
      versionLabel: v.version_label,
      status: v.status,
      changeType: v.change_type,
      changeDescription: v.change_description,
      totalUses: v.total_uses || 0,
      successRate: v.success_rate ? (v.success_rate * 100).toFixed(1) : null,
      replyRate: v.avg_reply_rate ? (v.avg_reply_rate * 100).toFixed(1) : null,
      positiveReplyRate: v.avg_positive_reply_rate ? (v.avg_positive_reply_rate * 100).toFixed(1) : null,
      injectedPatterns: v.injected_patterns || [],
      fullPrompt: v.full_prompt,
      createdAt: v.created_at,
      activatedAt: v.activated_at,
    }))

    // Transform A/B tests
    const transformedTests = (abTests || []).map(t => ({
      id: t.id,
      name: t.test_name,
      hypothesis: t.hypothesis,
      status: t.status,
      controlPercentage: t.control_percentage,
      winnerVersionId: t.winner_version_id,
      significance: t.statistical_significance ? (t.statistical_significance * 100).toFixed(1) : null,
      results: t.results,
      startedAt: t.started_at,
      completedAt: t.completed_at,
    }))

    // Calculate summary stats
    const activeVersion = transformedVersions.find(v => v.status === 'active')
    const totalUses = transformedVersions.reduce((sum, v) => sum + v.totalUses, 0)
    const runningTests = transformedTests.filter(t => t.status === 'running')

    return NextResponse.json({
      prompt: {
        id: prompt.id,
        name: prompt.prompt_name,
        category: prompt.prompt_category,
        description: prompt.description,
        basePrompt: prompt.base_prompt,
        dynamicSections: prompt.dynamic_sections || [],
        activeVersionId: prompt.active_version_id,
        createdAt: prompt.created_at,
        updatedAt: prompt.updated_at,
      },
      versions: transformedVersions,
      abTests: transformedTests,
      dynamicSections: dynamicSections || [],
      summary: {
        totalVersions: transformedVersions.length,
        activeVersion: activeVersion?.versionNumber || null,
        totalUses,
        currentSuccessRate: activeVersion?.successRate || null,
        runningTests: runningTests.length,
      },
    })
  } catch (error) {
    console.error('Prompt detail error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch prompt details' },
      { status: 500 }
    )
  }
}
