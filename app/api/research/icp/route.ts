import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { createLLMClient } from '@/src/lib/llm'

// Fetch website content
async function fetchWebsiteContent(url: string): Promise<string> {
  const fullUrl = url.startsWith('http') ? url : `https://${url}`

  try {
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SalesAgentBot/1.0)',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch website: ${response.status}`)
    }

    const html = await response.text()
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000)

    return text
  } catch (error) {
    console.error('Website fetch error:', error)
    throw new Error(`Could not fetch website content from ${url}`)
  }
}

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
    const { url, override } = body

    if (!url && !override) {
      return NextResponse.json(
        { error: 'URL or override required' },
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

    // If override provided, return it immediately
    if (override) {
      return NextResponse.json({
        icp: override,
        source: 'manual_override',
      })
    }

    // Fetch and analyze website
    const websiteContent = await fetchWebsiteContent(url)

    const llm = createLLMClient({
      provider: settings.ai_provider,
      apiKey: settings.ai_api_key,
    })

    const response = await llm.chat(
      [
        {
          role: 'system',
          content:
            'You are an expert B2B sales strategist analyzing companies to understand their ideal customer profile.',
        },
        {
          role: 'user',
          content: `Analyze this website content and create a detailed ICP description:

${websiteContent}

Provide a comprehensive ICP that includes:
1. Company characteristics (size, industry, revenue)
2. Target job titles/departments
3. Key pain points and needs
4. Buying signals and triggers

Format as a clear, actionable ICP description.`,
        },
      ],
      { maxTokens: 2048 }
    )

    return NextResponse.json({
      icp: response.content,
      source_url: url,
    })
  } catch (error: any) {
    console.error('ICP research error:', error)
    return NextResponse.json(
      { error: error.message || 'Research failed' },
      { status: 500 }
    )
  }
}
