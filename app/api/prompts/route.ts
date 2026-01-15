import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, category, description, basePrompt, tenantId } = body

    // Validate required fields
    if (!name || !category || !basePrompt) {
      return NextResponse.json(
        { error: 'Name, category, and base prompt are required' },
        { status: 400 }
      )
    }

    // Check for duplicate name
    const { data: existing } = await supabase
      .from('prompt_definitions')
      .select('id')
      .eq('prompt_name', name)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'A prompt with this name already exists' },
        { status: 409 }
      )
    }

    // Create prompt definition
    const { data: prompt, error: promptError } = await supabase
      .from('prompt_definitions')
      .insert({
        prompt_name: name,
        prompt_category: category,
        description: description || null,
        base_prompt: basePrompt,
        tenant_id: tenantId || null,
        dynamic_sections: [],
      })
      .select()
      .single()

    if (promptError) throw promptError

    // Create initial version (v1)
    const { data: version, error: versionError } = await supabase
      .from('prompt_versions')
      .insert({
        prompt_definition_id: prompt.id,
        tenant_id: tenantId || null,
        version_number: 1,
        version_label: 'v1.0',
        full_prompt: basePrompt,
        change_description: 'Initial version',
        change_type: 'manual',
        status: 'active',
        activated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (versionError) throw versionError

    // Update prompt definition with active version
    const { error: updateError } = await supabase
      .from('prompt_definitions')
      .update({ active_version_id: version.id })
      .eq('id', prompt.id)

    if (updateError) throw updateError

    return NextResponse.json({
      id: prompt.id,
      name: prompt.prompt_name,
      category: prompt.prompt_category,
      description: prompt.description,
      versionId: version.id,
    }, { status: 201 })
  } catch (error) {
    console.error('Create prompt error:', error)
    return NextResponse.json(
      { error: 'Failed to create prompt' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    // Get prompt definitions with their active versions
    const { data: prompts, error: promptsError } = await supabase
      .from('prompt_definitions')
      .select(`
        id,
        prompt_name,
        prompt_category,
        description,
        active_version_id,
        created_at,
        updated_at
      `)
      .order('prompt_category', { ascending: true })
      .order('prompt_name', { ascending: true })

    if (promptsError) throw promptsError

    // Get version counts and stats for each prompt
    const promptIds = (prompts || []).map(p => p.id)

    const { data: versionStats, error: versionError } = await supabase
      .from('prompt_versions')
      .select('prompt_definition_id, status, total_uses, success_rate')

    if (versionError) throw versionError

    // Get active A/B tests
    const { data: abTests, error: abError } = await supabase
      .from('prompt_ab_tests')
      .select('prompt_definition_id, status, test_name')
      .eq('status', 'running')

    if (abError) throw abError

    // Aggregate stats per prompt
    const statsMap = new Map<string, {
      versionCount: number
      activeVersion: number | null
      totalUses: number
      avgSuccessRate: number
      hasActiveTest: boolean
      activeTestName: string | null
    }>()

    for (const prompt of (prompts || [])) {
      const versions = (versionStats || []).filter(v => v.prompt_definition_id === prompt.id)
      const activeVersion = versions.find(v => v.status === 'active')
      const activeTest = (abTests || []).find(t => t.prompt_definition_id === prompt.id)

      const totalUses = versions.reduce((sum, v) => sum + (v.total_uses || 0), 0)
      const rates = versions.filter(v => v.success_rate != null).map(v => v.success_rate)
      const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0

      statsMap.set(prompt.id, {
        versionCount: versions.length,
        activeVersion: activeVersion ? versions.indexOf(activeVersion) + 1 : null,
        totalUses,
        avgSuccessRate: avgRate,
        hasActiveTest: !!activeTest,
        activeTestName: activeTest?.test_name || null,
      })
    }

    // Transform for frontend
    const transformedPrompts = (prompts || []).map(p => {
      const stats = statsMap.get(p.id)
      return {
        id: p.id,
        name: p.prompt_name,
        category: p.prompt_category,
        description: p.description,
        versionCount: stats?.versionCount || 0,
        totalUses: stats?.totalUses || 0,
        avgSuccessRate: stats?.avgSuccessRate || 0,
        hasActiveTest: stats?.hasActiveTest || false,
        activeTestName: stats?.activeTestName,
        updatedAt: p.updated_at,
      }
    })

    // Group by category
    const byCategory = transformedPrompts.reduce((acc, prompt) => {
      const cat = prompt.category || 'other'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(prompt)
      return acc
    }, {} as Record<string, typeof transformedPrompts>)

    // Summary stats
    const summary = {
      totalPrompts: transformedPrompts.length,
      totalVersions: transformedPrompts.reduce((sum, p) => sum + p.versionCount, 0),
      activeTests: transformedPrompts.filter(p => p.hasActiveTest).length,
      totalUses: transformedPrompts.reduce((sum, p) => sum + p.totalUses, 0),
    }

    return NextResponse.json({
      summary,
      prompts: transformedPrompts,
      byCategory,
    })
  } catch (error) {
    console.error('Prompts list error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch prompts' },
      { status: 500 }
    )
  }
}
