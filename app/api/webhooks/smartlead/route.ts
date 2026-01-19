import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../../src/lib/supabase'
import { inngest } from '../../../../inngest/client'
import {
  trackEngagementEvent,
  findOutreachEventBySmartlead,
  getDaysSinceFirstEmail,
} from '../../../../src/lib/learning-tracker'
import { notifyEmailReply } from '../../../../src/lib/slack-notifier'

/**
 * Smartlead Webhook Handler
 * Receives events: EMAIL_OPEN, EMAIL_LINK_CLICK, EMAIL_REPLY, EMAIL_BOUNCE, EMAIL_UNSUBSCRIBE
 */

interface SmartleadWebhookPayload {
  event_type: string
  lead_id?: string
  email?: string
  campaign_id?: string
  email_id?: string
  sequence_number?: number
  timestamp?: string
  // Reply specific
  reply_text?: string
  reply_subject?: string
  // Bounce specific
  bounce_type?: string
  bounce_reason?: string
  // Additional data
  [key: string]: unknown
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret (optional but recommended)
    const webhookSecret = process.env.SMARTLEAD_WEBHOOK_SECRET
    const signature = request.headers.get('x-smartlead-signature')

    if (webhookSecret && signature !== webhookSecret) {
      console.warn('[Smartlead Webhook] Invalid signature')
      // Still process but log warning - Smartlead may not support signatures
    }

    const payload: SmartleadWebhookPayload = await request.json()
    const eventType = payload.event_type?.toUpperCase()

    console.log(`[Smartlead Webhook] Received: ${eventType}`, {
      email: payload.email,
      campaign_id: payload.campaign_id,
    })

    // Find lead by email
    let lead = null
    if (payload.email) {
      const { data } = await supabase
        .from('leads')
        .select('id, tenant_id, email, first_name, last_name, company_name, email_open_count, high_engagement_triggered')
        .eq('email', payload.email)
        .maybeSingle()
      lead = data
    }

    const tenantId = lead?.tenant_id || process.env.TENANT_ID!

    // Route based on event type
    switch (eventType) {
      case 'EMAIL_OPEN':
        await handleEmailOpen(payload, lead, tenantId)
        break

      case 'EMAIL_LINK_CLICK':
        await handleEmailClick(payload, lead, tenantId)
        break

      case 'EMAIL_REPLY':
        await handleEmailReply(payload, lead, tenantId)
        break

      case 'EMAIL_BOUNCE':
        await handleEmailBounce(payload, lead, tenantId)
        break

      case 'EMAIL_UNSUBSCRIBE':
        await handleUnsubscribe(payload, lead, tenantId)
        break

      default:
        console.log(`[Smartlead Webhook] Unknown event type: ${eventType}`)
        // Log it anyway
        await supabase.from('email_responses').insert({
          lead_id: lead?.id,
          tenant_id: tenantId,
          smartlead_lead_id: payload.lead_id,
          campaign_id: payload.campaign_id,
          email_id: payload.email_id,
          event_type: eventType || 'unknown',
          raw_payload: payload,
        })
    }

    return NextResponse.json({ status: 'ok', event: eventType })
  } catch (error) {
    console.error('[Smartlead Webhook] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Handle email open events
 * Track opens and trigger high engagement workflow if threshold met
 */
async function handleEmailOpen(
  payload: SmartleadWebhookPayload,
  lead: { id: string; tenant_id: string; email_open_count: number; high_engagement_triggered: boolean } | null,
  tenantId: string
) {
  const HIGH_ENGAGEMENT_THRESHOLD = 3 // Trigger after 3 opens

  // Log the open
  await supabase.from('email_opens').insert({
    lead_id: lead?.id,
    tenant_id: tenantId,
    smartlead_lead_id: payload.lead_id,
    campaign_id: payload.campaign_id,
    email_id: payload.email_id,
    sequence_number: payload.sequence_number,
    raw_payload: payload,
  })

  if (lead) {
    const newOpenCount = (lead.email_open_count || 0) + 1

    // Update lead open count
    await supabase
      .from('leads')
      .update({
        email_open_count: newOpenCount,
        last_email_opened_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)

    // Check if we should trigger high engagement workflow
    if (newOpenCount >= HIGH_ENGAGEMENT_THRESHOLD && !lead.high_engagement_triggered) {
      console.log(`[Smartlead Webhook] High engagement detected for ${payload.email} (${newOpenCount} opens)`)

      await supabase
        .from('leads')
        .update({ high_engagement_triggered: true })
        .eq('id', lead.id)

      // Emit high engagement event
      await inngest.send({
        name: 'smartlead.high-engagement',
        data: {
          lead_id: lead.id,
          tenant_id: tenantId,
          email: payload.email,
          open_count: newOpenCount,
          campaign_id: payload.campaign_id,
        },
      })
    }

    // Log engagement
    await supabase.from('engagement_log').insert({
      lead_id: lead.id,
      tenant_id: tenantId,
      event_type: 'email.opened',
      metadata: {
        campaign_id: payload.campaign_id,
        sequence_number: payload.sequence_number,
        open_count: newOpenCount,
      },
    })

    // Emit orchestration event for cross-channel coordination
    await inngest.send({
      name: 'smartlead.orchestration-event',
      data: {
        lead_id: lead.id,
        event_type: 'EMAIL_OPEN',
        event_data: {
          campaign_id: payload.campaign_id,
          sequence_number: payload.sequence_number,
          open_count: newOpenCount,
        },
      },
    })
  }

  // Track in learning system
  if (payload.campaign_id && payload.lead_id) {
    const outreachEvent = await findOutreachEventBySmartlead(payload.campaign_id, payload.lead_id)
    if (outreachEvent) {
      await trackEngagementEvent({
        tenantId,
        outreachEventId: outreachEvent.id,
        leadId: outreachEvent.leadId,
        eventType: 'open',
        eventSource: 'smartlead',
        rawPayload: payload as Record<string, unknown>,
        attributedToEmailPosition: outreachEvent.emailPosition,
        daysSinceFirstEmail: lead ? await getDaysSinceFirstEmail(lead.id) : 0,
      })
    }
  }

  console.log(`[Smartlead Webhook] Open tracked: ${payload.email}`)
}

/**
 * Handle email click events
 */
async function handleEmailClick(
  payload: SmartleadWebhookPayload,
  lead: { id: string; tenant_id: string } | null,
  tenantId: string
) {
  // Log the response
  await supabase.from('email_responses').insert({
    lead_id: lead?.id,
    tenant_id: tenantId,
    smartlead_lead_id: payload.lead_id,
    campaign_id: payload.campaign_id,
    email_id: payload.email_id,
    event_type: 'click',
    raw_payload: payload,
    processed: true,
    processed_at: new Date().toISOString(),
  })

  if (lead) {
    // Update click count
    try {
      await supabase.rpc('increment_click_count', { lead_uuid: lead.id })
    } catch {
      // Fallback if RPC doesn't exist - just increment directly
      await supabase
        .from('leads')
        .update({
          email_click_count: ((lead as { email_click_count?: number }).email_click_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
    }

    await supabase.from('engagement_log').insert({
      lead_id: lead.id,
      tenant_id: tenantId,
      event_type: 'email.clicked',
      metadata: { campaign_id: payload.campaign_id },
    })

    // Emit orchestration event for cross-channel coordination
    await inngest.send({
      name: 'smartlead.orchestration-event',
      data: {
        lead_id: lead.id,
        event_type: 'EMAIL_LINK_CLICK',
        event_data: {
          campaign_id: payload.campaign_id,
        },
      },
    })
  }

  // Track in learning system
  if (payload.campaign_id && payload.lead_id) {
    const outreachEvent = await findOutreachEventBySmartlead(payload.campaign_id, payload.lead_id)
    if (outreachEvent) {
      await trackEngagementEvent({
        tenantId,
        outreachEventId: outreachEvent.id,
        leadId: outreachEvent.leadId,
        eventType: 'click',
        eventSource: 'smartlead',
        rawPayload: payload as Record<string, unknown>,
        attributedToEmailPosition: outreachEvent.emailPosition,
        daysSinceFirstEmail: lead ? await getDaysSinceFirstEmail(lead.id) : 0,
      })
    }
  }

  console.log(`[Smartlead Webhook] Click tracked: ${payload.email}`)
}

/**
 * Handle email reply events
 * Classify reply and route to appropriate workflow
 */
async function handleEmailReply(
  payload: SmartleadWebhookPayload,
  lead: { id: string; tenant_id: string; email: string; first_name: string; last_name: string; company_name: string } | null,
  tenantId: string
) {
  // Log raw response first
  const { data: response } = await supabase
    .from('email_responses')
    .insert({
      lead_id: lead?.id,
      tenant_id: tenantId,
      smartlead_lead_id: payload.lead_id,
      campaign_id: payload.campaign_id,
      email_id: payload.email_id,
      event_type: 'reply',
      reply_text: payload.reply_text,
      reply_subject: payload.reply_subject,
      raw_payload: payload,
      processed: false,
    })
    .select('id')
    .single()

  if (lead) {
    await supabase
      .from('leads')
      .update({
        email_replied: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)
  }

  // Track in learning system (initial reply - sentiment TBD by classification)
  let outreachEventId: string | undefined
  if (payload.campaign_id && payload.lead_id) {
    const outreachEvent = await findOutreachEventBySmartlead(payload.campaign_id, payload.lead_id)
    if (outreachEvent) {
      outreachEventId = outreachEvent.id
      await trackEngagementEvent({
        tenantId,
        outreachEventId: outreachEvent.id,
        leadId: outreachEvent.leadId,
        eventType: 'reply',
        eventSource: 'smartlead',
        replyText: payload.reply_text,
        rawPayload: payload as Record<string, unknown>,
        attributedToEmailPosition: outreachEvent.emailPosition,
        daysSinceFirstEmail: lead ? await getDaysSinceFirstEmail(lead.id) : 0,
      })
    }
  }

  // Send real-time Slack notification with direct link to conversation
  await notifyEmailReply({
    leadId: lead?.id,
    leadName: lead ? `${lead.first_name} ${lead.last_name}`.trim() : payload.email || 'Unknown',
    companyName: lead?.company_name || 'Unknown Company',
    email: payload.email || 'unknown',
    replySubject: payload.reply_subject,
    replyPreview: payload.reply_text || '(no content)',
    sentiment: 'unknown', // Will be updated after classification
    smartleadLeadId: payload.lead_id,
    smartleadCampaignId: payload.campaign_id,
  })

  // Emit event for classification workflow
  await inngest.send({
    name: 'smartlead.email.replied',
    data: {
      response_id: response?.id,
      lead_id: lead?.id,
      tenant_id: tenantId,
      email: payload.email,
      reply_text: payload.reply_text || '',
      reply_subject: payload.reply_subject || '',
      campaign_id: payload.campaign_id,
      lead_name: lead ? `${lead.first_name} ${lead.last_name}` : undefined,
      company_name: lead?.company_name,
      outreach_event_id: outreachEventId, // Pass for learning system update after classification
    },
  })

  // Emit orchestration event for cross-channel coordination
  // This will trigger decision-making (e.g., stop LinkedIn on negative reply)
  if (lead) {
    await inngest.send({
      name: 'smartlead.orchestration-event',
      data: {
        lead_id: lead.id,
        event_type: 'EMAIL_REPLY',
        event_data: {
          campaign_id: payload.campaign_id,
          reply_text: payload.reply_text,
          reply_subject: payload.reply_subject,
        },
      },
    })
  }

  console.log(`[Smartlead Webhook] Reply received from ${payload.email}, queued for classification`)
}

/**
 * Handle email bounce events
 * Flag email and prevent future sends
 */
async function handleEmailBounce(
  payload: SmartleadWebhookPayload,
  lead: { id: string; tenant_id: string } | null,
  tenantId: string
) {
  // Log the bounce
  await supabase.from('email_responses').insert({
    lead_id: lead?.id,
    tenant_id: tenantId,
    smartlead_lead_id: payload.lead_id,
    campaign_id: payload.campaign_id,
    email_id: payload.email_id,
    event_type: 'bounce',
    raw_payload: payload,
    processed: true,
    processed_at: new Date().toISOString(),
    action_taken: 'added_to_blocklist',
  })

  // Add to bounced emails blocklist
  if (payload.email) {
    await supabase.from('bounced_emails').upsert({
      tenant_id: tenantId,
      email: payload.email,
      bounce_type: payload.bounce_type || 'unknown',
      bounce_reason: payload.bounce_reason,
      lead_id: lead?.id,
      campaign_id: payload.campaign_id,
    }, {
      onConflict: 'tenant_id,email',
    })
  }

  // Flag the lead
  if (lead) {
    await supabase
      .from('leads')
      .update({
        email_bounced: true,
        status: 'bounced',
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)

    await supabase.from('engagement_log').insert({
      lead_id: lead.id,
      tenant_id: tenantId,
      event_type: 'email.bounced',
      metadata: {
        bounce_type: payload.bounce_type,
        bounce_reason: payload.bounce_reason,
        campaign_id: payload.campaign_id,
      },
    })
  }

  // Track in learning system
  if (payload.campaign_id && payload.lead_id) {
    const outreachEvent = await findOutreachEventBySmartlead(payload.campaign_id, payload.lead_id)
    if (outreachEvent) {
      await trackEngagementEvent({
        tenantId,
        outreachEventId: outreachEvent.id,
        leadId: outreachEvent.leadId,
        eventType: 'bounce',
        eventSource: 'smartlead',
        rawPayload: payload as Record<string, unknown>,
        attributedToEmailPosition: outreachEvent.emailPosition,
      })
    }
  }

  // Emit bounce event for any additional handling
  await inngest.send({
    name: 'smartlead.email.bounced',
    data: {
      lead_id: lead?.id,
      tenant_id: tenantId,
      email: payload.email,
      bounce_type: payload.bounce_type,
      bounce_reason: payload.bounce_reason,
      campaign_id: payload.campaign_id,
    },
  })

  // Emit orchestration event - bounce should stop all outreach
  if (lead) {
    await inngest.send({
      name: 'smartlead.orchestration-event',
      data: {
        lead_id: lead.id,
        event_type: 'EMAIL_BOUNCE',
        event_data: {
          campaign_id: payload.campaign_id,
          bounce_type: payload.bounce_type,
          bounce_reason: payload.bounce_reason,
        },
      },
    })
  }

  console.log(`[Smartlead Webhook] Bounce recorded: ${payload.email} (${payload.bounce_type})`)
}

/**
 * Handle unsubscribe events
 * Add to do-not-contact list and sync with GHL
 */
async function handleUnsubscribe(
  payload: SmartleadWebhookPayload,
  lead: { id: string; tenant_id: string } | null,
  tenantId: string
) {
  // Log the unsubscribe
  await supabase.from('email_responses').insert({
    lead_id: lead?.id,
    tenant_id: tenantId,
    smartlead_lead_id: payload.lead_id,
    campaign_id: payload.campaign_id,
    email_id: payload.email_id,
    event_type: 'unsubscribe',
    reply_category: 'remove_me',
    raw_payload: payload,
    processed: true,
    processed_at: new Date().toISOString(),
    action_taken: 'added_to_unsubscribe_list',
  })

  // Add to unsubscribe list
  if (payload.email) {
    await supabase.from('unsubscribed_emails').upsert({
      tenant_id: tenantId,
      email: payload.email,
      unsubscribe_reason: 'explicit_request',
      lead_id: lead?.id,
      campaign_id: payload.campaign_id,
    }, {
      onConflict: 'tenant_id,email',
    })
  }

  // Flag the lead
  if (lead) {
    await supabase
      .from('leads')
      .update({
        email_unsubscribed: true,
        reply_sentiment: 'remove_me',
        status: 'unsubscribed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)

    await supabase.from('engagement_log').insert({
      lead_id: lead.id,
      tenant_id: tenantId,
      event_type: 'email.unsubscribed',
      metadata: { campaign_id: payload.campaign_id },
    })
  }

  // Track in learning system
  if (payload.campaign_id && payload.lead_id) {
    const outreachEvent = await findOutreachEventBySmartlead(payload.campaign_id, payload.lead_id)
    if (outreachEvent) {
      await trackEngagementEvent({
        tenantId,
        outreachEventId: outreachEvent.id,
        leadId: outreachEvent.leadId,
        eventType: 'unsubscribe',
        eventSource: 'smartlead',
        rawPayload: payload as Record<string, unknown>,
        attributedToEmailPosition: outreachEvent.emailPosition,
      })
    }
  }

  // Emit event for GHL sync
  await inngest.send({
    name: 'smartlead.unsubscribed',
    data: {
      lead_id: lead?.id,
      tenant_id: tenantId,
      email: payload.email,
      campaign_id: payload.campaign_id,
    },
  })

  console.log(`[Smartlead Webhook] Unsubscribe recorded: ${payload.email}`)
}
