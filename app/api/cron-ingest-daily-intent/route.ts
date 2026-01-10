import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '../../../inngest/client'
import { calculateIntentScore, IntentLeadData } from '../../../src/lib/intent-scoring'

/**
 * Daily Intent Data Ingestion
 * Fetches 100 leads from AudienceLab intent segment, scores them, and processes:
 * - Top 20 by score → auto-trigger research
 * - Remaining 80 → stay in qualified status for manual review
 */

interface AudienceLabVisitor {
  FIRST_NAME: string
  LAST_NAME: string
  BUSINESS_VERIFIED_EMAILS: string
  JOB_TITLE: string
  HEADLINE: string
  DEPARTMENT: string
  SENIORITY_LEVEL: string
  INFERRED_YEARS_EXPERIENCE: string
  LINKEDIN_URL: string
  COMPANY_NAME: string
  COMPANY_LINKEDIN_URL: string
  COMPANY_DOMAIN: string
  COMPANY_EMPLOYEE_COUNT: string
  COMPANY_REVENUE: string
  COMPANY_INDUSTRY: string
  COMPANY_DESCRIPTION: string
  EVENT_DATA: string
  EVENT_TYPE: string
  URL: string
}

interface AudienceLabResponse {
  segment_id: string
  segment_name: string
  total_records: number
  page_size: number
  page: number
  total_pages: number
  has_more: boolean
  data: AudienceLabVisitor[]
}

function parseEmployeeCount(str: string): number | undefined {
  if (!str) return undefined
  const match = str.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : undefined
}

function mapVisitorToIntentLead(visitor: AudienceLabVisitor): IntentLeadData {
  return {
    firstName: visitor.FIRST_NAME,
    lastName: visitor.LAST_NAME,
    email: visitor.BUSINESS_VERIFIED_EMAILS?.split(',')[0]?.trim(),
    jobTitle: visitor.JOB_TITLE,
    seniority: visitor.SENIORITY_LEVEL,
    linkedinUrl: visitor.LINKEDIN_URL,
    companyName: visitor.COMPANY_NAME,
    companyLinkedinUrl: visitor.COMPANY_LINKEDIN_URL,
    companyDomain: visitor.COMPANY_DOMAIN,
    companyIndustry: visitor.COMPANY_INDUSTRY,
    companyEmployeeCount: parseEmployeeCount(visitor.COMPANY_EMPLOYEE_COUNT),
    companyRevenue: visitor.COMPANY_REVENUE,
  }
}

export async function GET(request: NextRequest) {
  // TODO: Re-enable auth before production
  // const cronSecret = process.env.CRON_SECRET
  // const authHeader = request.headers.get('authorization')
  // if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  //   console.error('[Intent] Unauthorized cron request')
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // }

  try {
    console.log('[Intent] Starting daily intent data ingestion...')

    const intentApiUrl = process.env.INTENT_API_URL
    const apiKey = process.env.VISITOR_API_KEY // Same API key

    if (!intentApiUrl || !apiKey) {
      throw new Error('Missing intent API credentials (INTENT_API_URL or VISITOR_API_KEY)')
    }

    // Fetch from AudienceLab API with X-API-Key header
    const response = await fetch(intentApiUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Intent API failed: ${response.status} ${response.statusText}`)
    }

    const apiResponse: AudienceLabResponse = await response.json()
    const visitors = apiResponse.data || []

    // Filter to only visitors with verified business email
    const qualifiedVisitors = visitors.filter(
      (v) => v.BUSINESS_VERIFIED_EMAILS && v.FIRST_NAME && v.LAST_NAME
    )

    console.log(
      `[Intent] Received ${visitors.length} records, ${qualifiedVisitors.length} with verified emails`
    )

    if (qualifiedVisitors.length === 0) {
      return NextResponse.json({
        status: 'success',
        message: 'No qualified intent leads (with verified emails)',
        total_records: visitors.length,
        processed: 0,
      })
    }

    // Score all leads and sort by score descending
    const scoredLeads = qualifiedVisitors.map((visitor) => {
      const intentData = mapVisitorToIntentLead(visitor)
      const scoreResult = calculateIntentScore(intentData)

      return {
        visitor,
        intentData,
        score: scoreResult.totalScore,
        tier: scoreResult.tier,
        breakdown: scoreResult.breakdown,
        reasoning: scoreResult.reasoning,
      }
    }).sort((a, b) => b.score - a.score)

    // Take top 100 (or less if fewer available)
    const top100 = scoredLeads.slice(0, 100)

    // Split into auto-research (top 20) and qualified (rest)
    const autoResearch = top100.slice(0, 20)
    const qualified = top100.slice(20)

    console.log(`[Intent] Scored ${top100.length} leads:`)
    console.log(`  - Top 20 (auto-research): scores ${autoResearch[0]?.score}-${autoResearch[autoResearch.length - 1]?.score}`)
    console.log(`  - Remaining ${qualified.length}: scores ${qualified[0]?.score || 'N/A'}-${qualified[qualified.length - 1]?.score || 'N/A'}`)

    // Create events for all leads
    const events = top100.map((lead, index) => ({
      name: 'lead.intent-ingested' as const,
      data: {
        first_name: lead.visitor.FIRST_NAME,
        last_name: lead.visitor.LAST_NAME,
        email: lead.visitor.BUSINESS_VERIFIED_EMAILS.split(',')[0].trim(),
        job_title: lead.visitor.JOB_TITLE || undefined,
        headline: lead.visitor.HEADLINE || undefined,
        department: lead.visitor.DEPARTMENT || undefined,
        seniority_level: lead.visitor.SENIORITY_LEVEL || undefined,
        years_experience: lead.visitor.INFERRED_YEARS_EXPERIENCE
          ? parseInt(lead.visitor.INFERRED_YEARS_EXPERIENCE, 10)
          : undefined,
        linkedin_url: lead.visitor.LINKEDIN_URL || undefined,
        company_name: lead.visitor.COMPANY_NAME || 'Unknown',
        company_linkedin_url: lead.visitor.COMPANY_LINKEDIN_URL || undefined,
        company_domain: lead.visitor.COMPANY_DOMAIN || undefined,
        company_employee_count: parseEmployeeCount(lead.visitor.COMPANY_EMPLOYEE_COUNT),
        company_revenue: lead.visitor.COMPANY_REVENUE || undefined,
        company_industry: lead.visitor.COMPANY_INDUSTRY || undefined,
        company_description: lead.visitor.COMPANY_DESCRIPTION || undefined,
        tenant_id: process.env.TENANT_ID!,
        // Intent-specific fields
        intent_score: lead.score,
        intent_tier: lead.tier,
        intent_breakdown: lead.breakdown,
        intent_reasoning: lead.reasoning,
        auto_research: index < 20, // Top 20 get auto-research
        batch_date: new Date().toISOString().split('T')[0],
        batch_rank: index + 1,
      },
    }))

    // Send all events to Inngest
    console.log(`[Intent] Event key available: ${!!process.env.INNGEST_EVENT_KEY}`)
    const sendResult = await inngest.send(events)
    console.log(`[Intent] Inngest send result:`, JSON.stringify(sendResult))
    console.log(`[Intent] Auto-research: ${autoResearch.length}, Qualified: ${qualified.length}`)

    return NextResponse.json({
      status: 'success',
      message: 'Daily intent ingestion completed',
      total_records: visitors.length,
      qualified_records: qualifiedVisitors.length,
      processed: top100.length,
      auto_research: autoResearch.length,
      qualified_only: qualified.length,
      score_range: {
        highest: top100[0]?.score,
        lowest: top100[top100.length - 1]?.score,
        cutoff_for_research: autoResearch[autoResearch.length - 1]?.score,
      },
      has_more: apiResponse.has_more,
      timestamp: new Date().toISOString(),
      inngest_result: sendResult,
      event_key_available: !!process.env.INNGEST_EVENT_KEY,
    })
  } catch (error) {
    console.error('[Intent] Error during ingestion:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
