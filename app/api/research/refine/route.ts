import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { createLLMClient } from '@/src/lib/llm'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { url, current_icp, additional_context } = body

    if (!current_icp || !additional_context) {
      return NextResponse.json(
        { error: 'Current ICP and additional context required' },
        { status: 400 }
      )
    }

    // Get user settings for LLM
    const { data: settings } = await supabase
      .from('user_settings')
      .select('ai_provider, ai_api_key')
      .eq('user_id', session.user.id)
      .single()

    if (!settings || !settings.ai_api_key) {
      return NextResponse.json(
        { error: 'AI provider not configured. Please complete setup.' },
        { status: 400 }
      )
    }

    const llm = createLLMClient({
      provider: settings.ai_provider,
      apiKey: settings.ai_api_key,
    })

    // Step 1: Analyze what additional research is needed
    const analysisResponse = await llm.chat(
      [
        {
          role: 'system',
          content:
            'You are an expert research analyst. Analyze the user\'s additional context and determine what information needs to be researched.',
        },
        {
          role: 'user',
          content: `Current ICP:
${current_icp}

User's additional context:
${additional_context}

Based on this additional context, what specific information should be researched? List 2-4 specific research topics that would help refine the ICP. Be specific and actionable.

Format as JSON:
{
  "research_needed": [
    "Specific research topic 1",
    "Specific research topic 2"
  ],
  "has_specific_corrections": true/false
}`,
        },
      ],
      { maxTokens: 1024 }
    )

    let researchTopics: string[] = []
    try {
      const analysisData = JSON.parse(
        analysisResponse.content.match(/\{[\s\S]*\}/)?.[0] || '{}'
      )
      researchTopics = analysisData.research_needed || []
    } catch {
      // If JSON parsing fails, just continue without research
      researchTopics = []
    }

    // Step 2: Conduct research on each topic (if any)
    let researchResults = ''
    if (researchTopics.length > 0) {
      const researchPromises = researchTopics.slice(0, 3).map(async (topic) => {
        const res = await llm.chat(
          [
            {
              role: 'system',
              content:
                'You are a research expert with access to general knowledge. Provide factual, concise information.',
            },
            {
              role: 'user',
              content: `Research this topic and provide key insights:

${topic}

Provide 3-5 key facts or insights that would help refine a B2B sales ICP.`,
            },
          ],
          { maxTokens: 512 }
        )
        return `## ${topic}\n${res.content}\n`
      })

      const results = await Promise.all(researchPromises)
      researchResults = results.join('\n')
    }

    // Step 3: Refine the ICP with all information
    const refinedResponse = await llm.chat(
      [
        {
          role: 'system',
          content:
            'You are an expert B2B sales strategist. Refine and improve ICPs based on additional context and research.',
        },
        {
          role: 'user',
          content: `Current ICP:
${current_icp}

User's Additional Context:
${additional_context}

${researchResults ? `Research Findings:\n${researchResults}` : ''}

Based on the user's additional context${researchResults ? ' and the research findings' : ''}, create an updated, refined ICP.

Instructions:
- Incorporate all specific requirements from the user's additional context
- Use research findings to add depth and specificity
- Override or correct any parts of the current ICP that conflict with the new information
- Maintain the same comprehensive format as the current ICP
- Be specific and actionable

Provide the complete refined ICP:`,
        },
      ],
      { maxTokens: 2048 }
    )

    return NextResponse.json({
      icp: refinedResponse.content,
      source_url: url,
      refined_with_context: true,
      research_conducted: researchTopics.length > 0,
    })
  } catch (error: any) {
    console.error('ICP refinement error:', error)
    return NextResponse.json(
      { error: error.message || 'Refinement failed' },
      { status: 500 }
    )
  }
}
