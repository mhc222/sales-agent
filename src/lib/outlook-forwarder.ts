/**
 * Outlook Email Forwarder
 *
 * Forwards positive replies to Jordan's inbox using Microsoft Graph API.
 * Formats the email so Jordan can reply directly to the prospect.
 */

interface ForwardEmailParams {
  toEmail: string           // Jordan's email
  fromName: string          // Prospect's name
  fromEmail: string         // Prospect's email (for reply-to)
  subject: string           // Original subject
  replyBody: string         // The actual reply content
  companyName: string       // Prospect's company
  leadId?: string           // Our internal lead ID for reference
}

interface GraphTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

// Azure AD credentials
const TENANT_ID = process.env.AZURE_TENANT_ID
const CLIENT_ID = process.env.AZURE_CLIENT_ID
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET
const SENDER_EMAIL = process.env.OUTLOOK_SENDER_EMAIL // The Outlook account to send from

/**
 * Get an access token from Azure AD
 */
async function getAccessToken(): Promise<string> {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Azure AD credentials not configured')
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get access token: ${error}`)
  }

  const data: GraphTokenResponse = await response.json()
  return data.access_token
}

/**
 * Forward a positive reply to Jordan's inbox
 * Formatted so he can reply directly to the prospect
 */
export async function forwardPositiveReply(params: ForwardEmailParams): Promise<boolean> {
  const { toEmail, fromName, fromEmail, subject, replyBody, companyName, leadId } = params

  if (!SENDER_EMAIL) {
    console.error('[Outlook Forwarder] OUTLOOK_SENDER_EMAIL not configured')
    return false
  }

  try {
    const accessToken = await getAccessToken()

    // Clean subject - ensure it has "Re:" but not "Fwd:"
    let cleanSubject = subject.replace(/^(Fwd:|FW:|Fw:)\s*/i, '').trim()
    if (!cleanSubject.toLowerCase().startsWith('re:')) {
      cleanSubject = `Re: ${cleanSubject}`
    }

    // Build clean email body
    const emailBody = `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <div style="background: #f0f7ff; border-left: 4px solid #0078d4; padding: 12px 16px; margin-bottom: 20px;">
    <strong>${fromName}</strong> from <strong>${companyName}</strong> replied:<br>
    <span style="color: #666; font-size: 12px;">${fromEmail}</span>
  </div>

  <div style="white-space: pre-wrap; line-height: 1.6;">
${replyBody}
  </div>

  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
    This is a positive reply forwarded by Sales Agent.
    ${leadId ? `<a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/leads/${leadId}">View lead details</a>` : ''}
  </div>
</div>
`.trim()

    // Send email via Microsoft Graph
    const sendUrl = `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`

    const emailMessage = {
      message: {
        subject: cleanSubject,
        body: {
          contentType: 'HTML',
          content: emailBody,
        },
        toRecipients: [
          {
            emailAddress: {
              address: toEmail,
            },
          },
        ],
        replyTo: [
          {
            emailAddress: {
              name: fromName,
              address: fromEmail,
            },
          },
        ],
      },
    }

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailMessage),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Outlook Forwarder] Failed to send:', error)
      return false
    }

    console.log(`[Outlook Forwarder] Forwarded reply from ${fromEmail} to ${toEmail}`)
    return true

  } catch (error) {
    console.error('[Outlook Forwarder] Error:', error)
    return false
  }
}

/**
 * Check if Outlook forwarding is configured
 */
export function isOutlookForwardingConfigured(): boolean {
  return !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET && SENDER_EMAIL)
}
