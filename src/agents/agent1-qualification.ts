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
  ghl_status: 'good' | 'bad' | 'new'
  icp_fit: 'strong' | 'medium' | 'weak'
}

export async function qualifyLead(
  lead: Lead,
  ghlRecord?: GHLRecord
): Promise<QualificationResult> {
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

  // Build the qualification prompt
  const prompt = `You are a sales qualification agent for JSB Media. Your job is to determine if a lead is worth engaging with.

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

${
  ghlRecord
    ? `RELATIONSHIP HISTORY (from GHL):
Classification: ${ghlRecord.classification || 'Unknown'}
Data: ${JSON.stringify(ghlRecord.ghl_data || {}, null, 2)}`
    : 'RELATIONSHIP HISTORY: No prior GHL record found (new prospect)'
}

MAKE A DECISION:
1. Is this person in our ICP (Ideal Customer Profile)?
2. Are they the right seniority level?
3. Does the company match our target industries/size?
4. Are there any red flags (competitor, bad relationship, etc.)?
5. If known from GHL, should we re-engage?

OUTPUT:
Return a JSON object with this structure:
{
  "decision": "YES" | "NO" | "REVIEW",
  "reasoning": "Clear explanation of your decision",
  "confidence": 0.0 to 1.0,
  "ghl_status": "good" | "bad" | "new",
  "icp_fit": "strong" | "medium" | "weak"
}

Guidelines:
- YES: High confidence we should reach out immediately
- NO: Clear signal to skip (not ICP, competitor, bad relationship, etc.)
- REVIEW: Uncertain - needs human decision

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
    result = JSON.parse(responseText)
  } catch (error) {
    console.error('Failed to parse qualification response:', responseText)
    // Fallback to REVIEW if parsing fails
    result = {
      decision: 'REVIEW',
      reasoning: 'Claude response parsing failed - manual review recommended',
      confidence: 0.5,
      ghl_status: 'new',
      icp_fit: 'medium',
    }
  }

  return result
}
