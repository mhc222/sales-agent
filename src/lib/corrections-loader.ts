/**
 * Corrections Loader
 * Fetches human corrections and company overrides to inject into email generation
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface Correction {
  id: string
  correctionType: string
  incorrectContent: string
  correctContent: string
  category: string | null
  context: string | null
  severity: string
}

export interface CompanyOverride {
  businessType: string | null
  industryVertical: string | null
  companyDescription: string | null
  keyFacts: Record<string, unknown> | null
  avoidTopics: string[] | null
  preferredAngles: string[] | null
  relationshipNotes: string | null
}

export interface CorrectionsContext {
  corrections: Correction[]
  companyOverride: CompanyOverride | null
  hasCorrections: boolean
  formattedForPrompt: string
}

/**
 * Load corrections for a company to inject into email generation
 */
export async function loadCorrections(
  tenantId: string,
  companyDomain: string,
  companyName?: string
): Promise<CorrectionsContext> {
  try {
    // Get corrections
    const { data: corrections, error: correctionsError } = await supabase
      .from('human_corrections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .or(`company_domain.eq.${companyDomain}${companyName ? `,company_name.ilike.%${companyName}%` : ''}`)
      .order('severity', { ascending: false })

    if (correctionsError) {
      console.error('[Corrections] Error fetching corrections:', correctionsError)
    }

    // Get company override
    const { data: override, error: overrideError } = await supabase
      .from('company_context_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('company_domain', companyDomain)
      .single()

    if (overrideError && overrideError.code !== 'PGRST116') {
      console.error('[Corrections] Error fetching override:', overrideError)
    }

    const mappedCorrections: Correction[] = (corrections || []).map((c) => ({
      id: c.id,
      correctionType: c.correction_type,
      incorrectContent: c.incorrect_content,
      correctContent: c.correct_content,
      category: c.category,
      context: c.context,
      severity: c.severity,
    }))

    const mappedOverride: CompanyOverride | null = override
      ? {
          businessType: override.business_type,
          industryVertical: override.industry_vertical,
          companyDescription: override.company_description,
          keyFacts: override.key_facts,
          avoidTopics: override.avoid_topics,
          preferredAngles: override.preferred_angles,
          relationshipNotes: override.relationship_notes,
        }
      : null

    // Format for prompt injection
    const formattedForPrompt = formatCorrectionsForPrompt(
      mappedCorrections,
      mappedOverride,
      companyName || companyDomain
    )

    return {
      corrections: mappedCorrections,
      companyOverride: mappedOverride,
      hasCorrections: mappedCorrections.length > 0 || mappedOverride !== null,
      formattedForPrompt,
    }
  } catch (error) {
    console.error('[Corrections] Unexpected error:', error)
    return {
      corrections: [],
      companyOverride: null,
      hasCorrections: false,
      formattedForPrompt: '',
    }
  }
}

/**
 * Format corrections into a prompt-injectable string
 */
function formatCorrectionsForPrompt(
  corrections: Correction[],
  override: CompanyOverride | null,
  companyName: string
): string {
  if (corrections.length === 0 && !override) {
    return ''
  }

  const sections: string[] = []

  sections.push(`\n## IMPORTANT: Human-Verified Information for ${companyName}`)
  sections.push(`The following corrections and context have been provided by humans and MUST be followed:\n`)

  // Company override takes priority
  if (override) {
    sections.push('### Verified Company Information:')

    if (override.businessType) {
      sections.push(`- **Business Type**: ${override.businessType} (use this, not AI inference)`)
    }

    if (override.industryVertical) {
      sections.push(`- **Industry**: ${override.industryVertical}`)
    }

    if (override.companyDescription) {
      sections.push(`- **Description**: ${override.companyDescription}`)
    }

    if (override.avoidTopics && override.avoidTopics.length > 0) {
      sections.push(`- **DO NOT MENTION**: ${override.avoidTopics.join(', ')}`)
    }

    if (override.preferredAngles && override.preferredAngles.length > 0) {
      sections.push(`- **Good conversation angles**: ${override.preferredAngles.join(', ')}`)
    }

    if (override.relationshipNotes) {
      sections.push(`- **Relationship Notes**: ${override.relationshipNotes}`)
    }

    sections.push('')
  }

  // Add specific corrections
  if (corrections.length > 0) {
    sections.push('### Specific Corrections (DO NOT make these mistakes):')

    for (const correction of corrections) {
      const severity = correction.severity === 'critical' ? '⚠️ CRITICAL' : ''
      sections.push(
        `- ${severity} DO NOT say "${correction.incorrectContent}" → INSTEAD say "${correction.correctContent}"`
      )

      if (correction.context) {
        sections.push(`  Context: ${correction.context}`)
      }
    }

    sections.push('')
  }

  return sections.join('\n')
}

/**
 * Check if a lead/company has any corrections before generating
 */
export async function hasCorrections(
  tenantId: string,
  companyDomain: string
): Promise<boolean> {
  const { count: correctionsCount } = await supabase
    .from('human_corrections')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('company_domain', companyDomain)
    .eq('status', 'active')

  const { data: override } = await supabase
    .from('company_context_overrides')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('company_domain', companyDomain)
    .single()

  return (correctionsCount || 0) > 0 || override !== null
}
