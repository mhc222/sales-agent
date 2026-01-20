import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { getTenantLLM } from '@/src/lib/tenant-settings'
import { INDUSTRY_IDS } from '@/src/lib/apollo'

export const dynamic = 'force-dynamic'

interface ParsedSearchParams {
  jobTitles: string[]
  industry?: string
  locations?: string[]
  employeeRange?: {
    min: number
    max: number
  }
  reasoning: string
}

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the natural language query
    const body = await request.json()
    const { query } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single()

    if (!userTenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
    }

    // Get tenant's configured LLM
    const llm = await getTenantLLM(userTenant.tenant_id)

    // Generate structured search parameters from natural language
    const systemPrompt = `You are an expert at extracting Apollo.io search parameters from natural language queries.

Available industries (use exact names): ${Object.keys(INDUSTRY_IDS).join(', ')}

Guidelines:
- Extract job titles that match the intent (e.g., "VPs of Marketing" → ["VP Marketing", "VP of Marketing", "Vice President Marketing"])
- Use full country names (United States, not US or USA)
- Use full state names (Texas, not TX)
- Default employee range is 50-1000 if company size is not specified
- If "startup" or "small company" mentioned, use 10-200
- If "enterprise" or "large company" mentioned, use 500-10000
- If industry is mentioned but doesn't match exactly, find the closest match
- Be generous with job title variations to maximize results

You must respond with ONLY a valid JSON object in this exact format, no additional text:
{
  "jobTitles": ["title1", "title2"],
  "industry": "industry name or null",
  "locations": ["location1", "location2"] or null,
  "employeeRange": {"min": number, "max": number},
  "reasoning": "brief explanation of how you interpreted the query"
}`

    const response = await llm.chat([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Extract Apollo search parameters from this query: "${query}"`,
      },
    ], { maxTokens: 1024 })

    // Parse the JSON response
    let parsed: ParsedSearchParams
    try {
      parsed = JSON.parse(response.content)
    } catch (parseError) {
      // Try to extract JSON from the response if it has extra text
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse LLM response as JSON')
      }
    }

    return NextResponse.json({
      searchParams: {
        jobTitles: parsed.jobTitles || [],
        industry: parsed.industry || undefined,
        locations: parsed.locations || undefined,
        employeeRange: parsed.employeeRange || { min: 50, max: 1000 },
      },
      reasoning: parsed.reasoning || 'Parameters extracted from query',
    })
  } catch (error) {
    console.error('Parse search error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse search query' },
      { status: 500 }
    )
  }
}
