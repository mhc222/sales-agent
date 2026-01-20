import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'
import { getTenantSettings, getTenantLLM } from '@/src/lib/tenant-settings'

export const dynamic = 'force-dynamic'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Available data fields per source - the chat must validate against these
const DATA_SCHEMA = {
  apollo: {
    name: 'Apollo (Lead Enrichment)',
    fields: [
      'job_title', 'seniority', 'department', 'email', 'phone',
      'company_name', 'company_size', 'employee_count', 'industry',
      'location', 'city', 'state', 'country', 'revenue_range',
      'technologies', 'keywords', 'founded_year', 'linkedin_url',
      'is_hiring', 'job_postings', 'funding_stage', 'last_funding_date'
    ],
    notes: 'Does NOT include: social media activity, posting frequency, engagement metrics, gender, age'
  },
  audiencelab: {
    name: 'AudienceLab (Intent Data)',
    fields: [
      'intent_score', 'intent_keywords', 'page_visits', 'visit_count',
      'first_visit', 'last_visit', 'pages_viewed', 'time_on_site',
      'audience_name', 'audience_type'
    ],
    notes: 'Shows buying intent signals. Does NOT include: demographic data, job changes, social activity'
  },
  linkedin: {
    name: 'LinkedIn (via HeyReach)',
    fields: [
      'connection_status', 'message_sent', 'message_opened',
      'replied', 'profile_viewed', 'connection_accepted'
    ],
    notes: 'Engagement data only. Does NOT include: posting frequency, content engagement, follower count'
  },
  derived: {
    name: 'Derived/Computed Fields',
    fields: [
      'lead_score', 'persona_match', 'trigger_matches', 'icp_fit_score',
      'days_since_trigger', 'outreach_stage', 'channel_preference'
    ],
    notes: 'Calculated by the system based on available data'
  }
}

// Flatten all available fields for quick lookup
const ALL_AVAILABLE_FIELDS = new Set(
  Object.values(DATA_SCHEMA).flatMap(source => source.fields)
)

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const tenantId = userTenant.tenant_id

    // Get current tenant settings
    const tenant = await getTenantSettings(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const body = await request.json()
    const { message, history = [] } = body as { message: string; history: ChatMessage[] }

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get current DNC entries
    const serviceClient = createServiceClient()
    const { data: dncEntries } = await serviceClient
      .from('do_not_contact')
      .select('email, domain')
      .eq('tenant_id', tenantId)
      .limit(20)

    // Build context about current settings
    const currentSettings = {
      icp: tenant.settings?.icp || {},
      email_provider: tenant.settings?.email_provider,
      enabled_channels: tenant.settings?.enabled_channels || [],
      data_sources: tenant.settings?.data_sources || {},
    }

    // Get tenant's configured LLM
    const llm = await getTenantLLM(tenantId)

    // First, understand what the user wants to do
    const intentResponse = await llm.chat([
      {
        role: 'system',
        content: `You are an AI assistant helping configure a B2B sales outreach platform.

## WHAT YOU CAN HELP WITH:
1. ICP (Ideal Customer Profile): personas, triggers, account criteria
2. Messaging tone and style guidelines
3. Do Not Contact (DNC) list: add emails or domains to block
4. Brand-specific knowledge: case studies, competitor intel, talking points
5. Terminology corrections: learn the right way to describe things
6. Targeting preferences: weight certain attributes higher/lower in lead scoring
7. General questions about the platform

## AVAILABLE DATA SCHEMA - CRITICAL:
You can ONLY set preferences or weights on data fields that actually exist. Here's what's available:

${Object.entries(DATA_SCHEMA).map(([key, source]) => `
**${source.name}:**
Fields: ${source.fields.join(', ')}
Note: ${source.notes}
`).join('\n')}

## HANDLING UNAVAILABLE DATA:
If a user asks to weight or filter by something NOT in the schema above (like "LinkedIn posting frequency", "gender", "age", "social media activity"), you MUST:
1. Politely explain you don't have access to that data
2. Suggest available alternatives that might serve as a proxy
3. Mention they could request this as a feature enhancement

Example response: "I can't weight by LinkedIn posting frequency - that data isn't available from our current sources. As an alternative, I could prioritize by seniority + recent job change, which often correlates with engagement. Want me to set that up instead?"

## CURRENT SETTINGS:
${JSON.stringify(currentSettings, null, 2)}

Current DNC entries (sample):
${JSON.stringify(dncEntries || [], null, 2)}

## ACTIONS:
When the user asks to make changes, respond with a JSON block:
\`\`\`json
{
  "action": "update_settings" | "update_rag" | "add_dnc" | "add_terminology" | "update_targeting" | "no_action",
  "changes": { /* specific changes */ },
  "summary": "Brief description of what was changed"
}
\`\`\`

**update_settings**: Update ICP (personas, triggers, account_criteria)
**update_rag**: Add brand knowledge, tone guidelines, case studies
**add_dnc**: Add to Do Not Contact list
**add_terminology**: Store language/phrasing corrections (use terminology field)
**update_targeting**: Set targeting preferences and weights (use targeting_preferences field)
**no_action**: Just answer the question

## TERMINOLOGY CORRECTIONS:
When users correct language (e.g., "it's not a travel agency, it's an agency that focuses on travel"), store it:
\`\`\`json
{
  "action": "add_terminology",
  "changes": {
    "terminology": {
      "incorrect": "travel agency",
      "correct": "agency that focuses on travel",
      "context": "How to describe the company type"
    }
  }
}
\`\`\`

## TARGETING PREFERENCES:
For weighting and prioritization (ONLY use available fields):
\`\`\`json
{
  "action": "update_targeting",
  "changes": {
    "targeting_preferences": {
      "field": "seniority",
      "preference": "Prioritize Director and above",
      "weight": 1.5
    }
  }
}
\`\`\`

Valid targeting fields: ${Array.from(ALL_AVAILABLE_FIELDS).join(', ')}

## OTHER FORMATS:

For ICP updates:
- account_criteria: { company_types, industries, company_sizes, locations, revenue_ranges, technologies, prospecting_signals }
- personas: array of { job_title, job_to_be_done, currently_they, which_results_in, how_we_solve, additional_benefits }
- triggers: array of { name, what_to_look_for, source, reasoning }

For RAG/knowledge updates:
- rag_content: "The content to add"
- rag_category: "case_study" | "competitor_intel" | "messaging_guidelines" | "objection_handling" | "product_knowledge" | "terminology"

For DNC:
- dnc_entries: [{type: "domain", value: "nike.com"}, {type: "email", value: "john@example.com"}]

Be conversational but efficient. Always validate against available data before accepting preferences.`,
      },
      ...history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ], { maxTokens: 2048 })

    const responseText = intentResponse.content

    // Check if there's an action to perform
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/)

    if (jsonMatch) {
      try {
        const actionData = JSON.parse(jsonMatch[1])

        if (actionData.action === 'update_settings' && actionData.changes) {
          // Apply the changes to tenant settings

          const updatedSettings = { ...tenant.settings }

          // Update ICP if provided
          if (actionData.changes.account_criteria || actionData.changes.personas || actionData.changes.triggers) {
            updatedSettings.icp = {
              ...updatedSettings.icp,
              ...(actionData.changes.account_criteria && { account_criteria: actionData.changes.account_criteria }),
              ...(actionData.changes.personas && { personas: actionData.changes.personas }),
              ...(actionData.changes.triggers && { triggers: actionData.changes.triggers }),
            }
          }

          // Update the tenant
          const { error: updateError } = await serviceClient
            .from('tenants')
            .update({ settings: updatedSettings })
            .eq('id', tenantId)

          if (updateError) {
            console.error('Settings update error:', updateError)
            return NextResponse.json({
              reply: "I understood your request but encountered an error saving the changes. Please try again.",
              error: updateError.message,
            })
          }

          // If there's a messaging update, add/update RAG document
          if (actionData.changes.messaging_update) {
            await serviceClient
              .from('rag_documents')
              .upsert({
                tenant_id: tenantId,
                rag_type: 'messaging',
                content: `Messaging Guidelines (User Feedback):\n\n${actionData.changes.messaging_update}`,
                metadata: { category: 'user_feedback', priority: 'high', updated_via: 'chat' },
              }, {
                onConflict: 'tenant_id,rag_type',
              })
          }

          // Extract the conversational part of the response (before the JSON)
          const conversationalReply = responseText.replace(/```json[\s\S]*?```/, '').trim() ||
            `Done! ${actionData.summary || 'Settings updated successfully.'}`

          return NextResponse.json({
            reply: conversationalReply,
            changes: actionData.changes,
            summary: actionData.summary,
          })
        }

        // Handle RAG updates (brand knowledge, case studies, etc.)
        if (actionData.action === 'update_rag' && actionData.changes) {
          const ragContent = actionData.changes.rag_content || actionData.changes.messaging_update
          const ragCategory = actionData.changes.rag_category || 'user_feedback'

          if (ragContent) {
            await serviceClient
              .from('rag_documents')
              .insert({
                tenant_id: tenantId,
                rag_type: 'shared',
                content: ragContent,
                metadata: {
                  category: ragCategory,
                  priority: 'high',
                  updated_via: 'chat',
                  created_at: new Date().toISOString(),
                },
              })

            const conversationalReply = responseText.replace(/```json[\s\S]*?```/, '').trim() ||
              `Done! ${actionData.summary || 'Knowledge base updated.'}`

            return NextResponse.json({
              reply: conversationalReply,
              summary: actionData.summary,
            })
          }
        }

        // Handle DNC additions
        if (actionData.action === 'add_dnc' && actionData.changes?.dnc_entries) {
          const entries = actionData.changes.dnc_entries as Array<{ type: string; value: string }>

          const dncRecords = entries.map((entry) => ({
            tenant_id: tenantId,
            email: entry.type === 'email' ? entry.value : null,
            domain: entry.type === 'domain' ? entry.value : null,
            reason: 'Added via settings chat',
            added_by: user.id,
          }))

          await serviceClient.from('do_not_contact').insert(dncRecords)

          const conversationalReply = responseText.replace(/```json[\s\S]*?```/, '').trim() ||
            `Done! ${actionData.summary || `Added ${entries.length} entries to Do Not Contact list.`}`

          return NextResponse.json({
            reply: conversationalReply,
            summary: actionData.summary,
            changes: { dnc_added: entries.length },
          })
        }

        // Handle terminology corrections
        if (actionData.action === 'add_terminology' && actionData.changes?.terminology) {
          const term = actionData.changes.terminology as {
            incorrect: string
            correct: string
            context?: string
          }

          // Store terminology in RAG for future reference
          await serviceClient.from('rag_documents').insert({
            tenant_id: tenantId,
            rag_type: 'terminology',
            content: `TERMINOLOGY CORRECTION:
Wrong: "${term.incorrect}"
Correct: "${term.correct}"
Context: ${term.context || 'General usage'}

Always use "${term.correct}" instead of "${term.incorrect}" in all communications.`,
            metadata: {
              category: 'terminology',
              priority: 'high',
              incorrect_term: term.incorrect,
              correct_term: term.correct,
              updated_via: 'chat',
              created_at: new Date().toISOString(),
            },
          })

          const conversationalReply = responseText.replace(/```json[\s\S]*?```/, '').trim() ||
            `Got it! I'll remember to say "${term.correct}" instead of "${term.incorrect}" going forward.`

          return NextResponse.json({
            reply: conversationalReply,
            summary: actionData.summary,
            changes: { terminology_added: term },
          })
        }

        // Handle targeting preferences
        if (actionData.action === 'update_targeting' && actionData.changes?.targeting_preferences) {
          const pref = actionData.changes.targeting_preferences as {
            field: string
            preference: string
            weight?: number
          }

          // Validate field is in our schema
          if (!ALL_AVAILABLE_FIELDS.has(pref.field)) {
            return NextResponse.json({
              reply: `I can't set a preference for "${pref.field}" - that data isn't available from our current sources. Available fields include: job_title, seniority, company_size, industry, intent_score, and more. What would you like to use instead?`,
            })
          }

          // Get current targeting preferences or initialize
          const currentTargeting = tenant.settings?.targeting_preferences || []

          // Add or update the preference
          const existingIndex = currentTargeting.findIndex(
            (p: { field: string }) => p.field === pref.field
          )

          if (existingIndex >= 0) {
            currentTargeting[existingIndex] = {
              ...currentTargeting[existingIndex],
              ...pref,
              updated_at: new Date().toISOString(),
            }
          } else {
            currentTargeting.push({
              ...pref,
              created_at: new Date().toISOString(),
            })
          }

          // Update tenant settings
          const updatedSettings = {
            ...tenant.settings,
            targeting_preferences: currentTargeting,
          }

          const { error: updateError } = await serviceClient
            .from('tenants')
            .update({ settings: updatedSettings })
            .eq('id', tenantId)

          if (updateError) {
            console.error('Targeting update error:', updateError)
            return NextResponse.json({
              reply: "I understood your preference but encountered an error saving it. Please try again.",
              error: updateError.message,
            })
          }

          const conversationalReply = responseText.replace(/```json[\s\S]*?```/, '').trim() ||
            `Done! ${actionData.summary || `I'll now ${pref.preference.toLowerCase()} when scoring leads.`}`

          return NextResponse.json({
            reply: conversationalReply,
            summary: actionData.summary,
            changes: { targeting_updated: pref },
          })
        }
      } catch (parseError) {
        console.error('Failed to parse action JSON:', parseError)
      }
    }

    // No action, just a conversational response
    return NextResponse.json({
      reply: responseText,
    })
  } catch (error) {
    console.error('Settings chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}
