import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { inngest } from '../../../../inngest/client'

/**
 * HeyReach Webhook Handler
 * Receives LinkedIn engagement events: connection_accepted, message_received, reply_received
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface HeyReachWebhookPayload {
  event_type: string
  lead_id?: string
  campaign_id?: string
  linkedin_url?: string
  first_name?: string
  last_name?: string
  company_name?: string
  // Message/reply specific
  message?: string
  message_text?: string
  conversation_id?: string
  timestamp?: string
  // Connection specific
  connection_status?: string
  // Additional data
  [key: string]: unknown
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret (if configured)
    const webhookSecret = process.env.HEYREACH_WEBHOOK_SECRET
    const signature = request.headers.get('x-heyreach-signature') || request.headers.get('x-webhook-secret')

    if (webhookSecret && signature !== webhookSecret) {
      console.warn('[HeyReach Webhook] Invalid signature')
      // Still process but log warning
    }

    const payload: HeyReachWebhookPayload = await request.json()
    const eventType = payload.event_type?.toLowerCase()

    console.log(`[HeyReach Webhook] Received: ${eventType}`, {
      linkedin_url: payload.linkedin_url,
      campaign_id: payload.campaign_id,
    })

    // Find lead by LinkedIn URL
    let lead = null
    if (payload.linkedin_url) {
      const { data } = await supabase
        .from('leads')
        .select('id, tenant_id, email, first_name, last_name, company_name, linkedin_url')
        .eq('linkedin_url', payload.linkedin_url)
        .maybeSingle()
      lead = data
    }

    const tenantId = lead?.tenant_id || process.env.TENANT_ID

    // Route based on event type
    switch (eventType) {
      case 'connection_accepted':
      case 'connected':
        await handleConnectionAccepted(payload, lead, tenantId)
        break

      case 'message_received':
      case 'reply_received':
      case 'reply':
        await handleMessageReceived(payload, lead, tenantId)
        break

      case 'message_sent':
        await handleMessageSent(payload, lead, tenantId)
        break

      case 'connection_request_sent':
        await handleConnectionRequestSent(payload, lead, tenantId)
        break

      default:
        console.log(`[HeyReach Webhook] Unknown event type: ${eventType}`)
        // Log it anyway for debugging
        if (lead) {
          await supabase.from('engagement_log').insert({
            lead_id: lead.id,
            tenant_id: tenantId,
            event_type: `linkedin.${eventType || 'unknown'}`,
            metadata: payload,
          })
        }
    }

    return NextResponse.json({ status: 'ok', event: eventType })
  } catch (error) {
    console.error('[HeyReach Webhook] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Handle connection accepted events
 */
async function handleConnectionAccepted(
  payload: HeyReachWebhookPayload,
  lead: { id: string; tenant_id: string } | null,
  tenantId: string | undefined
) {
  if (lead && tenantId) {
    // Update lead status
    await supabase
      .from('leads')
      .update({
        linkedin_connected: true,
        linkedin_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)

    // Log engagement
    await supabase.from('engagement_log').insert({
      lead_id: lead.id,
      tenant_id: tenantId,
      event_type: 'linkedin.connected',
      metadata: {
        campaign_id: payload.campaign_id,
      },
    })

    // Emit event for potential follow-up workflow
    await inngest.send({
      name: 'linkedin.connection-accepted',
      data: {
        lead_id: lead.id,
        tenant_id: tenantId,
        linkedin_url: payload.linkedin_url,
        campaign_id: payload.campaign_id,
      },
    })
  }

  console.log(`[HeyReach Webhook] Connection accepted: ${payload.linkedin_url}`)
}

/**
 * Handle message received (reply) events
 */
async function handleMessageReceived(
  payload: HeyReachWebhookPayload,
  lead: { id: string; tenant_id: string; first_name: string; last_name: string; company_name: string } | null,
  tenantId: string | undefined
) {
  const messageText = payload.message || payload.message_text || ''

  // Store the reply
  const { data: response } = await supabase
    .from('linkedin_responses')
    .insert({
      lead_id: lead?.id,
      tenant_id: tenantId,
      conversation_id: payload.conversation_id,
      linkedin_url: payload.linkedin_url,
      message_text: messageText,
      received_at: payload.timestamp || new Date().toISOString(),
      provider: 'heyreach',
      raw_payload: payload,
      processed: false,
    })
    .select('id')
    .single()

  if (lead && tenantId) {
    // Update lead
    await supabase
      .from('leads')
      .update({
        linkedin_replied: true,
        linkedin_last_reply_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)

    // Log engagement
    await supabase.from('engagement_log').insert({
      lead_id: lead.id,
      tenant_id: tenantId,
      event_type: 'linkedin.reply_received',
      metadata: {
        campaign_id: payload.campaign_id,
        conversation_id: payload.conversation_id,
        message_preview: messageText.slice(0, 100),
      },
    })

    // Emit event for reply classification workflow
    await inngest.send({
      name: 'linkedin.reply-received',
      data: {
        response_id: response?.id,
        lead_id: lead.id,
        tenant_id: tenantId,
        linkedin_url: payload.linkedin_url,
        message: messageText,
        conversation_id: payload.conversation_id,
        lead_name: `${lead.first_name} ${lead.last_name}`.trim(),
        company_name: lead.company_name,
      },
    })
  }

  console.log(`[HeyReach Webhook] Reply received from ${payload.linkedin_url}`)
}

/**
 * Handle message sent events (for tracking)
 */
async function handleMessageSent(
  payload: HeyReachWebhookPayload,
  lead: { id: string; tenant_id: string } | null,
  tenantId: string | undefined
) {
  if (lead && tenantId) {
    await supabase.from('engagement_log').insert({
      lead_id: lead.id,
      tenant_id: tenantId,
      event_type: 'linkedin.message_sent',
      metadata: {
        campaign_id: payload.campaign_id,
        conversation_id: payload.conversation_id,
      },
    })
  }

  console.log(`[HeyReach Webhook] Message sent to ${payload.linkedin_url}`)
}

/**
 * Handle connection request sent events
 */
async function handleConnectionRequestSent(
  payload: HeyReachWebhookPayload,
  lead: { id: string; tenant_id: string } | null,
  tenantId: string | undefined
) {
  if (lead && tenantId) {
    await supabase
      .from('leads')
      .update({
        linkedin_connection_requested: true,
        linkedin_connection_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)

    await supabase.from('engagement_log').insert({
      lead_id: lead.id,
      tenant_id: tenantId,
      event_type: 'linkedin.connection_requested',
      metadata: {
        campaign_id: payload.campaign_id,
      },
    })
  }

  console.log(`[HeyReach Webhook] Connection request sent to ${payload.linkedin_url}`)
}
