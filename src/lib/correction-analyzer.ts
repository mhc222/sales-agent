/**
 * Correction Analyzer
 * Analyzes human corrections to identify patterns that should become global guidelines
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface CorrectionPattern {
  patternName: string
  description: string
  rule: string
  examples: string[]
  confidence: number
  sourceCorrections: string[]
}

/**
 * Analyze recent corrections to identify patterns worth promoting to global guidelines
 */
export async function analyzeCorrectionsForPatterns(tenantId: string): Promise<CorrectionPattern[]> {
  console.log('[Correction Analyzer] Analyzing corrections for patterns...')

  // Get all active corrections
  const { data: corrections, error } = await supabase
    .from('human_corrections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[Correction Analyzer] Error fetching corrections:', error)
    return []
  }

  if (!corrections || corrections.length < 3) {
    console.log('[Correction Analyzer] Not enough corrections to analyze patterns')
    return []
  }

  // Format corrections for Claude analysis
  const correctionsText = corrections
    .map((c, i) => `${i + 1}. Company: ${c.company_name || c.company_domain}
   Category: ${c.category}
   Incorrect: "${c.incorrect_content}"
   Correct: "${c.correct_content}"
   Context: ${c.context || 'None'}`)
    .join('\n\n')

  // Use Claude to identify patterns
  const prompt = `You are analyzing human corrections to AI-generated sales emails. Your job is to identify PATTERNS across multiple corrections that should become global guidelines.

Here are the corrections:

${correctionsText}

Look for:
1. Similar types of mistakes being made across different companies
2. Common misconceptions the AI has (e.g., assuming industry = business type)
3. Tone or framing issues that keep recurring
4. Factual error patterns

For each pattern you identify, provide:
- A short pattern name
- A description of the pattern
- A clear rule that would prevent this mistake
- 2-3 example applications
- A confidence score (0-1) based on how many corrections support this pattern

Only include patterns supported by at least 2 corrections.

Return your analysis as a JSON array:
\`\`\`json
[
  {
    "patternName": "Industry vs Business Type Confusion",
    "description": "AI assumes a company in industry X is a type-X company, when they might be a service provider",
    "rule": "Never assume a company's business type from their industry. A company in the travel industry could be a marketing agency, technology provider, or consulting firm.",
    "examples": [
      "Company in travel space → could be travel agency OR travel marketing agency",
      "Company in restaurant space → could be restaurant OR restaurant consultancy"
    ],
    "confidence": 0.85,
    "sourceCorrections": ["correction-id-1", "correction-id-2"]
  }
]
\`\`\`

If no clear patterns emerge, return an empty array: []`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON response
    let jsonText = responseText.trim()
    const jsonMatch = jsonText.match(/```json\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const patterns = JSON.parse(jsonText) as CorrectionPattern[]
    console.log(`[Correction Analyzer] Found ${patterns.length} patterns`)

    return patterns
  } catch (error) {
    console.error('[Correction Analyzer] Error analyzing patterns:', error)
    return []
  }
}

/**
 * Promote identified patterns to global guidelines (approved_patterns table)
 */
export async function promotePatternToGlobal(
  tenantId: string,
  pattern: CorrectionPattern
): Promise<boolean> {
  console.log(`[Correction Analyzer] Promoting pattern: ${pattern.patternName}`)

  // Check if pattern already exists
  const { data: existing } = await supabase
    .from('approved_patterns')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('pattern_type', 'guideline')
    .ilike('pattern_content', `%${pattern.patternName}%`)
    .limit(1)

  if (existing && existing.length > 0) {
    console.log('[Correction Analyzer] Pattern already exists, skipping')
    return false
  }

  // Insert new approved pattern
  const { error } = await supabase.from('approved_patterns').insert({
    tenant_id: tenantId,
    pattern_type: 'guideline',
    pattern_content: pattern.rule,
    description: `${pattern.patternName}: ${pattern.description}`,
    example_emails: pattern.examples,
    success_metrics: {
      confidence: pattern.confidence,
      source: 'correction_analysis',
      corrections_analyzed: pattern.sourceCorrections.length,
    },
    status: 'active',
    confidence_score: pattern.confidence,
    discovered_from: 'correction_analysis',
  })

  if (error) {
    console.error('[Correction Analyzer] Error promoting pattern:', error)
    return false
  }

  console.log('[Correction Analyzer] Pattern promoted successfully')
  return true
}

/**
 * Run full analysis and promotion cycle
 */
export async function runCorrectionAnalysis(tenantId: string): Promise<{
  patternsFound: number
  patternsPromoted: number
}> {
  const patterns = await analyzeCorrectionsForPatterns(tenantId)

  let promoted = 0
  for (const pattern of patterns) {
    // Only promote high-confidence patterns
    if (pattern.confidence >= 0.7) {
      const success = await promotePatternToGlobal(tenantId, pattern)
      if (success) promoted++
    }
  }

  return {
    patternsFound: patterns.length,
    patternsPromoted: promoted,
  }
}

/**
 * Get global guidelines from approved patterns for prompt injection
 */
export async function getGlobalGuidelines(tenantId: string): Promise<string> {
  const { data: patterns, error } = await supabase
    .from('approved_patterns')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .eq('pattern_type', 'guideline')
    .gte('confidence_score', 0.7)
    .order('confidence_score', { ascending: false })
    .limit(10)

  if (error || !patterns || patterns.length === 0) {
    return ''
  }

  const guidelines = patterns
    .map((p, i) => `${i + 1}. ${p.description}\n   Rule: ${p.pattern_content}`)
    .join('\n\n')

  return `
## Global Guidelines (Learned from Corrections)
These rules have been learned from human feedback and should be followed for ALL leads:

${guidelines}
`
}
