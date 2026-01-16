import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { INDUSTRY_IDS } from '@/src/lib/apollo'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Extract Apollo search parameters from this query: "${query}"`,
        },
      ],
    })

    // Extract the text content
    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    // Parse the JSON response
    let parsed: ParsedSearchParams
    try {
      parsed = JSON.parse(textContent.text)
    } catch (parseError) {
      // Try to extract JSON from the response if it has extra text
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse Claude response as JSON')
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
