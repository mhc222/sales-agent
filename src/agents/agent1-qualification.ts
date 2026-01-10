import Anthropic from '@anthropic-ai/sdk'
import { supabase, type Lead, type GHLRecord } from '../lib/supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

type QualificationDecision = 'YES' | 'NO' | 'REVIEW'

interface QualificationResult {
  decision: QualificationDecision
  reasoning: string
  confidence: number
  ghl_status: 'existing_client' | 'existing_company' | 'new'
  icp_fit: 'strong' | 'medium' | 'weak'
  existing_outreach: {
    in_ghl: boolean
    in_smartlead: boolean
    in_heyreach: boolean
  }
}

interface ExistingRecords {
  ghl: GHLRecord | null
  ghl_company_matches?: Array<{ leads?: { company_name: string } }>
  smartlead: Array<{ campaign_id: string; status: string | null }>
  heyreach: Array<{ outreach_id: string; status: string | null }>
}

interface IntentSignal {
  page_visited?: string
  time_on_page?: number
  event_type?: string
}

export async function qualifyLead(
  lead: Lead,
  existingRecords?: ExistingRecords,
  intentSignal?: IntentSignal
): Promise<QualificationResult> {
  const records: ExistingRecords = existingRecords || { ghl: null, smartlead: [], heyreach: [] }
  const intent = intentSignal || (lead.intent_signal as IntentSignal) || {}

  // Fetch RAG documents (Shared RAG for qualification)
  const { data: ragDocs, error: ragError } = await supabase
    .from('rag_documents')
    .select('content')
    .eq('tenant_id', lead.tenant_id)
    .eq('rag_type', 'shared')
    .limit(5)

  if (ragError) {
    console.error('Error fetching RAG documents:', ragError)
    throw ragError
  }

  const ragContent = ragDocs?.map((doc) => doc.content).join('\n\n') || ''

  // Calculate intent score
  const intentScore = calculateIntentScore(intent, lead.visit_count || 1)

  // Build the qualification prompt
  const prompt = `You are a sales qualification agent for JSB Media. Your job is to quickly assess if a lead is worth engaging with.

COMPANY CONTEXT (JSB Media):
${ragContent}

LEAD DATA:
- Name: ${lead.first_name} ${lead.last_name}
- Email: ${lead.email}
- Title: ${lead.job_title || 'Unknown'}
- Department: ${lead.department || 'Unknown'}
- Seniority: ${lead.seniority_level || 'Unknown'}
- Company: ${lead.company_name}
- Company Size: ${lead.company_employee_count || 'Unknown'} employees
- Industry: ${lead.company_industry || 'Unknown'}
- Revenue: ${lead.company_revenue || 'Unknown'}
- Company Description: ${lead.company_description || 'N/A'}

INTENT SIGNALS:
- Visit Count: ${lead.visit_count || 1} (${lead.visit_count && lead.visit_count > 1 ? 'RETURNING VISITOR - higher intent' : 'first visit'})
- Page Visited: ${intent.page_visited || 'Unknown'}
- Time on Page: ${intent.time_on_page ? `${Math.round(intent.time_on_page / 1000)}s` : 'Unknown'}
- Action Type: ${intent.event_type || 'Unknown'}
- Intent Score: ${intentScore}/100 ${intentScore >= 70 ? '(HIGH)' : intentScore >= 40 ? '(MEDIUM)' : '(LOW)'}

EXISTING RELATIONSHIP CHECK:
${
  records.ghl
    ? `- GHL: FOUND existing record (Classification: ${records.ghl.classification || 'Unknown'})
  This may be an EXISTING CLIENT or past contact.`
    : '- GHL: No existing contact found'
}
${
  records.ghl_company_matches && records.ghl_company_matches.length > 0
    ? `- Company Match: Found ${records.ghl_company_matches.length} similar company name(s) in GHL:
  ${records.ghl_company_matches.map((m) => m.leads?.company_name).join(', ')}
  This company may already be a client.`
    : ''
}
${records.smartlead.length > 0 ? `- Smartlead: ${records.smartlead.length} existing campaign(s)` : '- Smartlead: No campaigns'}
${records.heyreach.length > 0 ? `- HeyReach: ${records.heyreach.length} existing outreach(s)` : '- HeyReach: No outreach'}

QUALIFICATION RULES:

1. AUTOMATIC DISQUALIFIERS (return NO with confidence < 0.50):
   - Existing client/company already in GHL (we don't want to cold outreach clients)
   - ANY sales role (SDR, BDR, Account Executive, Sales Rep, Sales Manager, Sales Director, VP Sales, Head of Sales, Business Development, Sales Operations) - they're not buyers, they're sellers
   - Roles completely irrelevant to marketing/growth decisions (e.g., IT Support, Receptionist, Accountant)
   - Very small companies (<5 employees) with no growth signals

   IMPORTANT: For disqualified leads, set confidence below 0.50 to ensure they are filtered out.

2. QUALIFIES (return YES):
   - Marketing leadership: CMO, VP Marketing, Director of Marketing, Head of Growth
   - Business owners, Founders, CEOs of SMB companies
   - Growth/Performance marketing roles
   - Law firms - they ARE in our ICP (we work with professional services)
   - SaaS companies - OK as long as the person is NOT in a sales role
   - Agencies: If creative-focused agency → YES. If media-buying agency → REVIEW (potential competitor)
   - High intent signals (multiple visits, visited /services or /pricing pages, clicked)

3. NEEDS REVIEW (return REVIEW):
   - Media agencies (potential competitor, but could be partner)
   - Unclear role or seniority
   - Very large enterprise (10,000+ employees) - different sales motion needed
   - Existing outreach in Smartlead/HeyReach with unclear status

4. INTENT SIGNAL WEIGHTING:
   - Multiple visits (2+) = stronger signal, lean towards YES
   - Visited /services, /pricing, /contact = high intent
   - Visited /blog, homepage only = lower intent (but not disqualifying)
   - Clicked or spent 30+ seconds = engaged
   - user_idle = may have left tab open, weaker signal

OUTPUT:
Return a JSON object:
{
  "decision": "YES" | "NO" | "REVIEW",
  "reasoning": "Brief explanation (1-2 sentences)",
  "confidence": 0.0 to 1.0,
  "ghl_status": "existing_client" | "existing_company" | "new",
  "icp_fit": "strong" | "medium" | "weak",
  "existing_outreach": {
    "in_ghl": true | false,
    "in_smartlead": true | false,
    "in_heyreach": true | false
  }
}

Be PERMISSIVE early on - we'd rather review a borderline lead than miss a good one.
Return ONLY valid JSON.`

  // Call Claude
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  // Parse response
  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : ''

  let result: QualificationResult

  try {
    // Strip markdown code blocks if present
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    result = JSON.parse(jsonText)
  } catch (error) {
    console.error('Failed to parse qualification response:', responseText)
    // Fallback to REVIEW if parsing fails
    result = {
      decision: 'REVIEW',
      reasoning: 'Claude response parsing failed - manual review recommended',
      confidence: 0.5,
      ghl_status: 'new',
      icp_fit: 'medium',
      existing_outreach: {
        in_ghl: !!records.ghl,
        in_smartlead: records.smartlead.length > 0,
        in_heyreach: records.heyreach.length > 0,
      },
    }
  }

  // Enforce minimum confidence threshold - anything below 0.50 is disqualified
  if (result.confidence < 0.5) {
    result.decision = 'NO'
    result.reasoning = `Low confidence (${result.confidence}) - auto-disqualified. Original: ${result.reasoning}`
  }

  return result
}

function calculateIntentScore(intent: IntentSignal, visitCount: number): number {
  let score = 0

  // Visit count (max 30 points)
  score += Math.min(visitCount * 10, 30)

  // Page visited (max 30 points)
  const page = intent.page_visited?.toLowerCase() || ''
  if (page.includes('/pricing') || page.includes('/contact')) {
    score += 30
  } else if (page.includes('/services') || page.includes('/case-studies')) {
    score += 20
  } else if (page.includes('/blog') || page.includes('/about')) {
    score += 10
  } else {
    score += 5 // homepage or other
  }

  // Time on page (max 20 points)
  const timeSeconds = (intent.time_on_page || 0) / 1000
  if (timeSeconds >= 60) {
    score += 20
  } else if (timeSeconds >= 30) {
    score += 15
  } else if (timeSeconds >= 10) {
    score += 10
  }

  // Event type (max 20 points)
  const eventType = intent.event_type?.toLowerCase() || ''
  if (eventType === 'click') {
    score += 20
  } else if (eventType === 'page_view') {
    score += 10
  } else if (eventType === 'user_idle') {
    score += 5
  }

  return Math.min(score, 100)
}
