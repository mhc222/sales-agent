import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'
import { getTenantSettings } from '@/src/lib/tenant-settings'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

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

    // First, understand what the user wants to do
    const intentResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `You are an AI assistant helping configure a B2B sales outreach platform.
You can help users with:

1. ICP (Ideal Customer Profile): personas, triggers, account criteria
2. Messaging tone and style guidelines
3. Do Not Contact (DNC) list: add emails or domains to block
4. Brand-specific knowledge: case studies, competitor intel, talking points
5. General questions about the platform

Current tenant settings:
${JSON.stringify(currentSettings, null, 2)}

Current DNC entries (sample):
${JSON.stringify(dncEntries || [], null, 2)}

When the user asks to make changes, respond with a JSON block:
\`\`\`json
{
  "action": "update_settings" | "update_rag" | "add_dnc" | "no_action",
  "changes": {
    // The specific changes to make
  },
  "summary": "Brief description of what was changed"
}
\`\`\`

ACTIONS:
- "update_settings": Update ICP (personas, triggers, account_criteria)
- "update_rag": Add brand knowledge, tone guidelines, case studies (use rag_content field)
- "add_dnc": Add to Do Not Contact list (use dnc_entries: [{type: "email"|"domain", value: "..."}])
- "no_action": Just answer the question, no changes needed

For ICP updates:
- account_criteria: { company_types, industries, company_sizes, locations, revenue_ranges, technologies, prospecting_signals }
- personas: array of { job_title, job_to_be_done, currently_they, which_results_in, how_we_solve, additional_benefits }
- triggers: array of { name, what_to_look_for, source, reasoning }

For RAG/knowledge updates, use:
- rag_content: "The content to add"
- rag_category: "case_study" | "competitor_intel" | "messaging_guidelines" | "objection_handling" | "product_knowledge"

For DNC, use:
- dnc_entries: [{type: "domain", value: "nike.com"}, {type: "email", value: "john@example.com"}]

If unclear, ask clarifying questions. Be conversational but efficient.`,
      messages: [
        ...history.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user' as const, content: message },
      ],
    })

    const responseText = intentResponse.content.find(block => block.type === 'text')?.text || ''

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
