import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Auto-promote a correction to a global guideline
 */
async function promoteToGlobal(tenantId: string, correction: {
  incorrectContent: string
  correctContent: string
  context: string | null
  category: string
}) {
  // Create a global guideline from the correction
  const rule = `Never say "${correction.incorrectContent}" - instead use "${correction.correctContent}"`
  const description = `${correction.category}: ${correction.context || 'Correct terminology'}`

  const { error } = await supabase.from('approved_patterns').insert({
    tenant_id: tenantId,
    pattern_type: 'guideline',
    pattern_content: rule,
    description: description,
    example_emails: [
      `Wrong: "...${correction.incorrectContent}..."`,
      `Right: "...${correction.correctContent}..."`
    ],
    status: 'active',
    confidence_score: 1.0, // Human-verified = 100% confidence
    discovered_from: 'human_correction',
  })

  if (error) {
    console.error('Error promoting to global:', error)
    return false
  }
  return true
}

// GET - List corrections with optional filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const companyDomain = searchParams.get('company_domain')
    const correctionType = searchParams.get('type')
    const status = searchParams.get('status') || 'active'

    let query = supabase
      .from('human_corrections')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (companyDomain) {
      query = query.eq('company_domain', companyDomain)
    }

    if (correctionType) {
      query = query.eq('correction_type', correctionType)
    }

    const { data: corrections, error } = await query.limit(100)

    if (error) throw error

    // Also get company overrides if filtering by domain
    let overrides = null
    if (companyDomain) {
      const { data: overrideData } = await supabase
        .from('company_context_overrides')
        .select('*')
        .eq('company_domain', companyDomain)
        .single()

      overrides = overrideData
    }

    return NextResponse.json({
      corrections: corrections || [],
      companyOverride: overrides,
      count: corrections?.length || 0,
    })
  } catch (error) {
    console.error('Get corrections error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch corrections' },
      { status: 500 }
    )
  }
}

// POST - Create a new correction or company override
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      type, // 'correction' or 'company_override'
      correctionType, // 'company', 'lead', 'content', 'industry'
      companyDomain,
      companyName,
      leadId,
      incorrectContent,
      correctContent,
      context,
      category,
      severity,
      sourceSequenceId,
      submittedBy,
      makeGlobal, // If true, also create a global guideline
      // For company override
      businessType,
      industryVertical,
      companyDescription,
      keyFacts,
      avoidTopics,
      preferredAngles,
    } = body

    // Get tenant (for now, use first tenant)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .limit(1)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 })
    }

    if (type === 'company_override') {
      // Create or update company override
      const { data: override, error } = await supabase
        .from('company_context_overrides')
        .upsert({
          tenant_id: tenant.id,
          company_domain: companyDomain,
          company_name: companyName,
          business_type: businessType,
          industry_vertical: industryVertical,
          company_description: companyDescription,
          key_facts: keyFacts,
          avoid_topics: avoidTopics,
          preferred_angles: preferredAngles,
          verified_by: submittedBy,
          verified_at: new Date().toISOString(),
        }, {
          onConflict: 'tenant_id,company_domain'
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        type: 'company_override',
        data: override,
      }, { status: 201 })
    }

    // Create correction
    if (!incorrectContent || !correctContent) {
      return NextResponse.json(
        { error: 'incorrectContent and correctContent are required' },
        { status: 400 }
      )
    }

    const { data: correction, error } = await supabase
      .from('human_corrections')
      .insert({
        tenant_id: tenant.id,
        correction_type: correctionType || 'company',
        company_domain: companyDomain,
        company_name: companyName,
        lead_id: leadId,
        incorrect_content: incorrectContent,
        correct_content: correctContent,
        context,
        category: category || 'other',
        severity: severity || 'medium',
        source_sequence_id: sourceSequenceId,
        submitted_by: submittedBy,
      })
      .select()
      .single()

    if (error) throw error

    // Auto-promote to global if requested OR if severity is critical/high
    const shouldPromote = makeGlobal || severity === 'critical' || severity === 'high'
    let promotedToGlobal = false

    if (shouldPromote) {
      promotedToGlobal = await promoteToGlobal(tenant.id, {
        incorrectContent,
        correctContent,
        context,
        category: category || 'other',
      })
      console.log(`[Corrections] Promoted to global: ${promotedToGlobal}`)
    }

    return NextResponse.json({
      success: true,
      type: 'correction',
      data: correction,
      promotedToGlobal,
    }, { status: 201 })
  } catch (error) {
    console.error('Create correction error:', error)
    return NextResponse.json(
      { error: 'Failed to create correction' },
      { status: 500 }
    )
  }
}
