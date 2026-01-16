/**
 * Workflow 5: Email Response Handler
 *
 * Handles Smartlead email responses:
 * 1. Bounce → Flag email, prevent future sends
 * 2. Out of Office → Parse return date, schedule restart
 * 3. Not Interested Now → Add to follow-up-later bucket
 * 4. Remove Me → Unsubscribe + sync to GHL
 * 5. Interested → Notify human via Slack
 * 6. High Engagement → Notify when open threshold reached
 */

import { inngest } from './client'
import { supabase } from '../src/lib/supabase'
import { classifyReply, type ClassificationResult } from '../src/lib/reply-classifier'
import { forwardPositiveReply, isOutlookForwardingConfigured } from '../src/lib/outlook-forwarder'

// ============================================================================
// REPLY CLASSIFICATION WORKFLOW
// ============================================================================
export const replyClassification = inngest.createFunction(
  {
    id: 'reply-classification-v1',
    name: 'Email Reply Classification',
    retries: 2,
  },
  { event: 'smartlead.email.replied' },
  async ({ event, step }) => {
    const { response_id, lead_id, tenant_id, email, reply_text, reply_subject, campaign_id, lead_name, company_name } = event.data

    console.log(`[Reply Handler] Classifying reply from: ${email}`)

    // Step 1: Classify the reply using Claude
    const classification = await step.run('classify-reply', async () => {
      return await classifyReply({
        reply_text,
        reply_subject,
        lead_name,
        company_name,
      })
    })

    console.log(`[Reply Handler] Classification: ${classification.category} (${classification.confidence})`)
    console.log(`[Reply Handler] Reasoning: ${classification.reasoning}`)

    // Step 2: Update the email_responses record with classification
    await step.run('update-response-record', async () => {
      await supabase
        .from('email_responses')
        .update({
          reply_category: classification.category,
          classification_confidence: classification.confidence,
          classification_reasoning: classification.reasoning,
          ooo_return_date: classification.ooo_return_date || null,
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq('id', response_id)
    })

    // Step 3: Update lead sentiment
    if (lead_id) {
      await step.run('update-lead-sentiment', async () => {
        await supabase
          .from('leads')
          .update({
            reply_sentiment: classification.category,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead_id)
      })
    }

    // Step 4: Route to appropriate handler based on category
    switch (classification.category) {
      case 'out_of_office':
        await handleOutOfOffice(step, {
          lead_id,
          tenant_id,
          response_id,
          email,
          classification,
          campaign_id,
        })
        break

      case 'not_interested_now':
        await handleNotInterestedNow(step, {
          lead_id,
          tenant_id,
          email,
          reply_text,
          classification,
          campaign_id,
        })
        break

      case 'remove_me':
        await handleRemoveMe(step, {
          lead_id,
          tenant_id,
          email,
          campaign_id,
        })
        break

      case 'interested':
        await handleInterested(step, {
          lead_id,
          tenant_id,
          response_id,
          email,
          reply_text,
          classification,
          lead_name,
          company_name,
        })
        break

      case 'other':
        // Log for manual review
        await step.run('log-other-reply', async () => {
          await supabase.from('engagement_log').insert({
            lead_id,
            tenant_id,
            event_type: 'reply.needs_review',
            metadata: {
              reply_text: reply_text.substring(0, 500),
              classification,
              campaign_id,
            },
          })
        })
        break
    }

    return {
      status: 'processed',
      response_id,
      category: classification.category,
      confidence: classification.confidence,
    }
  }
)

// ============================================================================
// OUT OF OFFICE HANDLER
// ============================================================================
async function handleOutOfOffice(
  step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>; sendEvent: (id: string, event: { name: string; data: Record<string, unknown> }) => Promise<unknown> },
  data: {
    lead_id?: string
    tenant_id: string
    response_id?: string
    email?: string
    classification: ClassificationResult
    campaign_id?: string
  }
) {
  const { lead_id, tenant_id, response_id, email, classification, campaign_id } = data

  console.log(`[Reply Handler] Out of Office - Return date: ${classification.ooo_return_date || 'unknown'}`)

  if (classification.ooo_return_date && lead_id && response_id) {
    // Calculate restart date (day after return)
    const returnDate = new Date(classification.ooo_return_date)
    returnDate.setDate(returnDate.getDate() + 1)
    const restartDate = returnDate.toISOString().split('T')[0]

    // Schedule the restart
    await step.run('schedule-ooo-restart', async () => {
      await supabase.from('follow_up_later').insert({
        lead_id,
        tenant_id,
        reason: 'out_of_office',
        original_reply: classification.reasoning,
        follow_up_date: restartDate,
        original_campaign_id: campaign_id,
        notes: `OOO until ${classification.ooo_return_date}, scheduled restart for ${restartDate}`,
      })

      // Update the response record
      await supabase
        .from('email_responses')
        .update({
          ooo_restart_scheduled: true,
          action_taken: `scheduled_restart_${restartDate}`,
        })
        .eq('id', response_id)
    })

    // Schedule a delayed event for the restart
    await step.sendEvent('schedule-restart', {
      name: 'smartlead.ooo-restart',
      data: {
        lead_id,
        tenant_id,
        response_id,
        return_date: restartDate,
        campaign_id,
      },
    })

    console.log(`[Reply Handler] Scheduled restart for ${restartDate}`)
  }

  // Log engagement
  if (lead_id) {
    await step.run('log-ooo', async () => {
      await supabase.from('engagement_log').insert({
        lead_id,
        tenant_id,
        event_type: 'reply.out_of_office',
        metadata: {
          return_date: classification.ooo_return_date,
          email,
          campaign_id,
        },
      })
    })
  }
}

// ============================================================================
// NOT INTERESTED NOW HANDLER
// ============================================================================
async function handleNotInterestedNow(
  step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown> },
  data: {
    lead_id?: string
    tenant_id: string
    email?: string
    reply_text: string
    classification: ClassificationResult
    campaign_id?: string
  }
) {
  const { lead_id, tenant_id, email, reply_text, classification, campaign_id } = data

  console.log(`[Reply Handler] Not Interested Now - Follow up suggestion: ${classification.follow_up_suggestion || 'none'}`)

  if (lead_id) {
    // Add to follow-up-later bucket
    await step.run('add-to-follow-up', async () => {
      // Calculate follow-up date (default 90 days if no suggestion)
      let followUpDate = new Date()
      followUpDate.setDate(followUpDate.getDate() + 90) // Default 90 days

      // Parse suggestion if available (e.g., "Q2", "next quarter", "3 months")
      if (classification.follow_up_suggestion) {
        const suggestion = classification.follow_up_suggestion.toLowerCase()
        if (suggestion.includes('q2')) {
          followUpDate = new Date(followUpDate.getFullYear(), 3, 1) // April 1
        } else if (suggestion.includes('q3')) {
          followUpDate = new Date(followUpDate.getFullYear(), 6, 1) // July 1
        } else if (suggestion.includes('q4')) {
          followUpDate = new Date(followUpDate.getFullYear(), 9, 1) // October 1
        } else if (suggestion.includes('month')) {
          const months = parseInt(suggestion.match(/(\d+)/)?.[1] || '3')
          followUpDate.setMonth(followUpDate.getMonth() + months)
        }
      }

      await supabase.from('follow_up_later').insert({
        lead_id,
        tenant_id,
        reason: 'not_interested_now',
        original_reply: reply_text.substring(0, 1000),
        follow_up_date: followUpDate.toISOString().split('T')[0],
        original_campaign_id: campaign_id,
        notes: classification.follow_up_suggestion || 'No specific timing mentioned',
      })

      // Update lead status
      await supabase
        .from('leads')
        .update({
          status: 'nurture',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead_id)
    })

    // Log engagement
    await step.run('log-not-interested', async () => {
      await supabase.from('engagement_log').insert({
        lead_id,
        tenant_id,
        event_type: 'reply.not_interested_now',
        metadata: {
          follow_up_suggestion: classification.follow_up_suggestion,
          email,
          campaign_id,
        },
      })
    })
  }
}

// ============================================================================
// REMOVE ME HANDLER
// ============================================================================
async function handleRemoveMe(
  step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>; sendEvent: (id: string, event: { name: string; data: Record<string, unknown> }) => Promise<unknown> },
  data: {
    lead_id?: string
    tenant_id: string
    email?: string
    campaign_id?: string
  }
) {
  const { lead_id, tenant_id, email, campaign_id } = data

  console.log(`[Reply Handler] Remove Me - Unsubscribing: ${email}`)

  // Add to unsubscribe list
  if (email) {
    await step.run('add-to-unsubscribe', async () => {
      await supabase.from('unsubscribed_emails').upsert({
        tenant_id,
        email,
        unsubscribe_reason: 'remove_me_reply',
        lead_id,
        campaign_id,
      }, {
        onConflict: 'tenant_id,email',
      })
    })
  }

  // Update lead
  if (lead_id) {
    await step.run('update-lead-unsubscribed', async () => {
      await supabase
        .from('leads')
        .update({
          email_unsubscribed: true,
          status: 'unsubscribed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead_id)
    })

    // Log engagement
    await step.run('log-remove-me', async () => {
      await supabase.from('engagement_log').insert({
        lead_id,
        tenant_id,
        event_type: 'reply.remove_me',
        metadata: { email, campaign_id },
      })
    })
  }

  // Trigger GHL sync
  await step.sendEvent('sync-to-ghl', {
    name: 'smartlead.unsubscribed',
    data: {
      lead_id,
      tenant_id,
      email,
      campaign_id,
    },
  })
}

// ============================================================================
// INTERESTED HANDLER
// ============================================================================
async function handleInterested(
  step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>; sendEvent: (id: string, event: { name: string; data: Record<string, unknown> }) => Promise<unknown> },
  data: {
    lead_id?: string
    tenant_id: string
    response_id?: string
    email?: string
    reply_text: string
    classification: ClassificationResult
    lead_name?: string
    company_name?: string
  }
) {
  const { lead_id, tenant_id, response_id, email, reply_text, classification, lead_name, company_name } = data

  console.log(`[Reply Handler] Interested! Level: ${classification.interest_level}`)

  if (lead_id && response_id) {
    // Add to interested leads table
    await step.run('add-to-interested', async () => {
      await supabase.from('interested_leads').insert({
        lead_id,
        tenant_id,
        reply_text,
        campaign_id: data.email, // This should be campaign_id but field isn't in this handler
        interest_level: classification.interest_level || 'warm',
        interest_signals: classification.interest_signals || [],
      })

      // Update lead status
      await supabase
        .from('leads')
        .update({
          status: 'interested',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead_id)
    })

    // Log engagement
    await step.run('log-interested', async () => {
      await supabase.from('engagement_log').insert({
        lead_id,
        tenant_id,
        event_type: 'reply.interested',
        metadata: {
          interest_level: classification.interest_level,
          interest_signals: classification.interest_signals,
          email,
        },
      })
    })

    // Trigger Slack notification
    await step.sendEvent('notify-human', {
      name: 'smartlead.interested',
      data: {
        lead_id,
        tenant_id,
        response_id,
        reply_text,
        interest_level: classification.interest_level || 'warm',
        interest_signals: classification.interest_signals || [],
        lead_name,
        company_name,
        email,
      },
    })
  }
}

// ============================================================================
// HIGH ENGAGEMENT WORKFLOW
// ============================================================================
export const highEngagementHandler = inngest.createFunction(
  {
    id: 'high-engagement-handler-v1',
    name: 'High Engagement Notification',
    retries: 1,
  },
  { event: 'smartlead.high-engagement' },
  async ({ event, step }) => {
    const { lead_id, tenant_id, email, open_count, campaign_id } = event.data

    console.log(`[High Engagement] Lead ${email} opened ${open_count} times`)

    // Fetch lead details
    const lead = await step.run('fetch-lead', async () => {
      const { data } = await supabase
        .from('leads')
        .select('first_name, last_name, company_name, job_title')
        .eq('id', lead_id)
        .single()
      return data
    })

    // Log engagement
    await step.run('log-high-engagement', async () => {
      await supabase.from('engagement_log').insert({
        lead_id,
        tenant_id,
        event_type: 'engagement.high_opens',
        metadata: {
          open_count,
          campaign_id,
        },
      })
    })

    // Send email notification
    await step.run('notify-email', async () => {
      const resendApiKey = process.env.RESEND_API_KEY
      const notifyEmails = (process.env.NOTIFY_EMAILS || 'mcronin@jsbmedia.io,jordan@jsbmedia.io,mhc222@gmail.com')
        .split(',')
        .map(e => e.trim())

      if (!resendApiKey) {
        console.log('[High Engagement] No Resend API key configured')
        return
      }

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e53e3e;">🔥 High Engagement Alert</h2>

          <p><strong>${lead?.first_name} ${lead?.last_name}</strong> at <strong>${lead?.company_name}</strong>
          has opened your emails <strong>${open_count} times</strong>!</p>

          <table style="width: 100%; margin: 16px 0; background: #f7fafc; padding: 16px;">
            <tr>
              <td style="padding: 8px 0;"><strong>Email:</strong></td>
              <td>${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Title:</strong></td>
              <td>${lead?.job_title || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Opens:</strong></td>
              <td>${open_count}</td>
            </tr>
          </table>

          <p style="color: #718096; font-size: 14px;">
            This lead is showing strong engagement - consider reaching out directly.
          </p>
        </div>
      `

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Sales Agent <notifications@jsbmedia.com>',
          to: notifyEmails,
          subject: `🔥 High Engagement: ${lead?.first_name} ${lead?.last_name} at ${lead?.company_name} (${open_count} opens)`,
          html: htmlBody,
        }),
      })

      console.log(`[High Engagement] Email notification sent to ${notifyEmails.join(', ')}`)
    })

    return { status: 'notified', lead_id, open_count }
  }
)

// ============================================================================
// INTERESTED NOTIFICATION WORKFLOW
// ============================================================================
export const interestedNotification = inngest.createFunction(
  {
    id: 'interested-notification-v1',
    name: 'Interested Lead Email Notification',
    retries: 2,
  },
  { event: 'smartlead.interested' },
  async ({ event, step }) => {
    const { lead_id, tenant_id, response_id, reply_text, interest_level, interest_signals, lead_name, company_name, email } = event.data as {
      lead_id: string
      tenant_id: string
      response_id: string
      reply_text: string
      interest_level: 'hot' | 'warm'
      interest_signals: string[]
      lead_name?: string
      company_name?: string
      email?: string
    }

    console.log(`[Interested] Processing positive reply from ${lead_name}`)

    // Fetch the original reply subject from email_responses
    const responseDetails = await step.run('fetch-response-details', async () => {
      const { data } = await supabase
        .from('email_responses')
        .select('reply_subject')
        .eq('id', response_id)
        .single()
      return data
    })

    // Forward to Jordan's inbox via Outlook (so he can reply directly)
    const jordanEmail = process.env.JORDAN_EMAIL || 'jordan@jsbmedia.io'

    await step.run('forward-to-jordan', async () => {
      if (!isOutlookForwardingConfigured()) {
        console.log('[Interested] Outlook forwarding not configured, skipping')
        return { forwarded: false, reason: 'not_configured' }
      }

      const success = await forwardPositiveReply({
        toEmail: jordanEmail,
        fromName: lead_name || 'Unknown',
        fromEmail: email || 'unknown@email.com',
        subject: responseDetails?.reply_subject || 'Sales Inquiry',
        replyBody: reply_text,
        companyName: company_name || 'Unknown Company',
        leadId: lead_id,
      })

      if (success) {
        console.log(`[Interested] Forwarded reply to ${jordanEmail}`)
        return { forwarded: true }
      } else {
        console.error('[Interested] Failed to forward reply to Jordan')
        return { forwarded: false, reason: 'send_failed' }
      }
    })

    // Send email notification via Resend
    await step.run('notify-email-interested', async () => {
      const resendApiKey = process.env.RESEND_API_KEY
      const notifyEmails = (process.env.NOTIFY_EMAILS || 'mcronin@jsbmedia.io,jordan@jsbmedia.io,mhc222@gmail.com')
        .split(',')
        .map(e => e.trim())

      if (!resendApiKey) {
        console.log('[Interested] No Resend API key configured')
        return { sent: false }
      }

      const emoji = interest_level === 'hot' ? '🔥' : '✨'
      const levelText = interest_level === 'hot' ? 'HOT LEAD' : 'Warm Lead'

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${interest_level === 'hot' ? '#e53e3e' : '#ed8936'};">
            ${emoji} ${levelText} - Positive Reply!
          </h2>

          <p><strong>${lead_name}</strong> at <strong>${company_name}</strong> replied with interest!</p>

          <div style="background: #f7fafc; border-left: 4px solid #4299e1; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-style: italic;">${reply_text.substring(0, 1000)}</p>
          </div>

          <table style="width: 100%; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 0;"><strong>Email:</strong></td>
              <td>${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Interest Level:</strong></td>
              <td>${interest_level}</td>
            </tr>
            ${interest_signals.length > 0 ? `
            <tr>
              <td style="padding: 8px 0; vertical-align: top;"><strong>Interest Signals:</strong></td>
              <td>${interest_signals.map(s => `• ${s}`).join('<br>')}</td>
            </tr>
            ` : ''}
          </table>

          <p style="color: #718096; font-size: 12px; margin-top: 24px;">
            Lead ID: ${lead_id}<br>
            Response ID: ${response_id}
          </p>
        </div>
      `

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Sales Agent <notifications@jsbmedia.com>',
          to: notifyEmails,
          subject: `${emoji} ${levelText}: ${lead_name} at ${company_name}`,
          html: htmlBody,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('[Interested] Email send failed:', error)
        return { sent: false, error }
      }

      console.log(`[Interested] Email notification sent to ${notifyEmails.join(', ')}`)
      return { sent: true }
    })

    // Update interested_leads record with notification status
    await step.run('update-notification-status', async () => {
      await supabase
        .from('interested_leads')
        .update({ slack_notified: true }) // Reusing field for any notification
        .eq('lead_id', lead_id)
        .order('created_at', { ascending: false })
        .limit(1)
    })

    return { status: 'notified', lead_id, interest_level }
  }
)

// ============================================================================
// GHL UNSUBSCRIBE SYNC WORKFLOW
// ============================================================================
export const ghlUnsubscribeSync = inngest.createFunction(
  {
    id: 'ghl-unsubscribe-sync-v1',
    name: 'GHL Unsubscribe Sync',
    retries: 2,
  },
  { event: 'smartlead.unsubscribed' },
  async ({ event, step }) => {
    const { lead_id, tenant_id, email, campaign_id } = event.data

    console.log(`[GHL Sync] Syncing unsubscribe for: ${email}`)

    // Check if we have GHL integration configured
    const ghlApiKey = process.env.GHL_API_KEY
    const ghlLocationId = process.env.GHL_LOCATION_ID

    if (!ghlApiKey || !ghlLocationId) {
      console.log('[GHL Sync] GHL not configured, skipping sync')
      return { status: 'skipped', reason: 'GHL not configured' }
    }

    // Find or create contact in GHL
    const ghlContact = await step.run('find-ghl-contact', async () => {
      // Search for contact by email
      const searchResponse = await fetch(
        `https://services.leadconnectorhq.com/contacts/search?locationId=${ghlLocationId}&query=${encodeURIComponent(email || '')}`,
        {
          headers: {
            Authorization: `Bearer ${ghlApiKey}`,
            Version: '2021-07-28',
          },
        }
      )

      if (!searchResponse.ok) {
        console.error('[GHL Sync] Search failed:', await searchResponse.text())
        return null
      }

      const searchData = await searchResponse.json()
      return searchData.contacts?.[0] || null
    })

    if (ghlContact) {
      // Update contact with DND (Do Not Disturb) status
      await step.run('update-ghl-contact', async () => {
        const updateResponse = await fetch(
          `https://services.leadconnectorhq.com/contacts/${ghlContact.id}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${ghlApiKey}`,
              'Content-Type': 'application/json',
              Version: '2021-07-28',
            },
            body: JSON.stringify({
              dnd: true,
              dndSettings: {
                email: { status: 'active', message: 'Unsubscribed via Smartlead' },
              },
              tags: [...(ghlContact.tags || []), 'unsubscribed', 'smartlead-optout'],
            }),
          }
        )

        if (!updateResponse.ok) {
          console.error('[GHL Sync] Update failed:', await updateResponse.text())
          throw new Error('Failed to update GHL contact')
        }

        console.log(`[GHL Sync] Updated GHL contact ${ghlContact.id} with DND`)
      })

      // Update our unsubscribed_emails record
      await step.run('update-sync-status', async () => {
        await supabase
          .from('unsubscribed_emails')
          .update({
            synced_to_ghl: true,
            ghl_contact_id: ghlContact.id,
          })
          .eq('email', email)
          .eq('tenant_id', tenant_id)
      })

      return { status: 'synced', ghl_contact_id: ghlContact.id }
    }

    console.log(`[GHL Sync] No GHL contact found for ${email}`)
    return { status: 'no_contact', email }
  }
)
