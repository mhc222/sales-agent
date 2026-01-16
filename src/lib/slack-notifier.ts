/**
 * Slack Notification Service
 *
 * Sends notifications to Slack when human attention is needed.
 * Uses Slack Incoming Webhooks for simplicity.
 */

interface SlackBlock {
  type: string
  text?: {
    type: string
    text: string
    emoji?: boolean
  }
  elements?: Array<{
    type: string
    text?: { type: string; text: string; emoji?: boolean } | string
    url?: string
    action_id?: string
  }>
  fields?: Array<{
    type: string
    text: string
  }>
}

interface SlackMessage {
  text: string // Fallback text
  blocks?: SlackBlock[]
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * Send a message to Slack
 */
async function sendSlackMessage(message: SlackMessage): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) {
    console.log('[Slack] No webhook URL configured, skipping notification')
    return false
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      console.error('[Slack] Failed to send message:', response.status, await response.text())
      return false
    }

    return true
  } catch (error) {
    console.error('[Slack] Error sending message:', error)
    return false
  }
}

/**
 * Notify when a sequence needs human review
 */
export async function notifyHumanReviewNeeded(params: {
  sequenceId: string
  leadName: string
  companyName: string
  reason: string
  reviewerQuestions?: string[]
}): Promise<boolean> {
  const { sequenceId, leadName, companyName, reason, reviewerQuestions } = params

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '👀 Human Review Needed',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Lead:*\n${leadName}` },
        { type: 'mrkdwn', text: `*Company:*\n${companyName}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Reason:*\n${reason}`,
      },
    },
  ]

  // Add reviewer questions if any
  if (reviewerQuestions && reviewerQuestions.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Questions from Agent:*\n${reviewerQuestions.map(q => `• ${q}`).join('\n')}`,
      },
    })
  }

  // Add action button
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Review Sequence',
          emoji: true,
        },
        url: `${APP_BASE_URL}/sequences/${sequenceId}`,
        action_id: 'review_sequence',
      },
    ],
  })

  return sendSlackMessage({
    text: `Human review needed for ${leadName} at ${companyName}: ${reason}`,
    blocks,
  })
}

/**
 * Notify when corrections are detected from user edits
 */
export async function notifyCorrectionsLearned(params: {
  sequenceId: string
  leadName: string
  companyName: string
  corrections: Array<{
    incorrectContent: string
    correctContent: string
    category: string
  }>
}): Promise<boolean> {
  const { sequenceId, leadName, companyName, corrections } = params

  if (corrections.length === 0) return false

  const correctionText = corrections
    .map(c => `• ~${c.incorrectContent}~ → *${c.correctContent}* (${c.category})`)
    .join('\n')

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🧠 Corrections Learned',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Lead:*\n${leadName}` },
        { type: 'mrkdwn', text: `*Company:*\n${companyName}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Learned from edits:*\n${correctionText}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `These corrections will be applied to future emails for ${companyName}.`,
        },
      ],
    },
  ]

  return sendSlackMessage({
    text: `Learned ${corrections.length} correction(s) from edits to ${leadName}'s sequence`,
    blocks,
  })
}

/**
 * Notify when a sequence is approved and ready to deploy
 */
export async function notifySequenceApproved(params: {
  sequenceId: string
  leadName: string
  companyName: string
  approvedBy: string
}): Promise<boolean> {
  const { sequenceId, leadName, companyName, approvedBy } = params

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '✅ Sequence Approved',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Lead:*\n${leadName}` },
        { type: 'mrkdwn', text: `*Company:*\n${companyName}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Approved by ${approvedBy}. Ready for deployment.`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View Sequence',
            emoji: true,
          },
          url: `${APP_BASE_URL}/sequences/${sequenceId}`,
          action_id: 'view_sequence',
        },
      ],
    },
  ]

  return sendSlackMessage({
    text: `Sequence for ${leadName} at ${companyName} approved by ${approvedBy}`,
    blocks,
  })
}

/**
 * Notify when a lead fails qualification or has issues
 */
export async function notifyLeadIssue(params: {
  leadId: string
  leadName: string
  companyName: string
  issue: string
  details?: string
}): Promise<boolean> {
  const { leadId, leadName, companyName, issue, details } = params

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⚠️ Lead Issue',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Lead:*\n${leadName}` },
        { type: 'mrkdwn', text: `*Company:*\n${companyName}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Issue:*\n${issue}`,
      },
    },
  ]

  if (details) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Details:*\n${details}`,
      },
    })
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Lead',
          emoji: true,
        },
        url: `${APP_BASE_URL}/leads/${leadId}`,
        action_id: 'view_lead',
      },
    ],
  })

  return sendSlackMessage({
    text: `Issue with ${leadName} at ${companyName}: ${issue}`,
    blocks,
  })
}

/**
 * Send a daily summary of pending reviews
 */
export async function notifyDailySummary(params: {
  pendingReviews: number
  sequencesDeployed: number
  correctionsLearned: number
  topCompanies: Array<{ name: string; status: string }>
}): Promise<boolean> {
  const { pendingReviews, sequencesDeployed, correctionsLearned, topCompanies } = params

  const companiesList = topCompanies.length > 0
    ? topCompanies.map(c => `• ${c.name} (${c.status})`).join('\n')
    : 'No active leads'

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Daily Sales Agent Summary',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Pending Reviews:*\n${pendingReviews}` },
        { type: 'mrkdwn', text: `*Deployed Today:*\n${sequencesDeployed}` },
        { type: 'mrkdwn', text: `*Corrections Learned:*\n${correctionsLearned}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Recent Activity:*\n${companiesList}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Open Dashboard',
            emoji: true,
          },
          url: `${APP_BASE_URL}/dashboard`,
          action_id: 'open_dashboard',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Review Queue',
            emoji: true,
          },
          url: `${APP_BASE_URL}/sequences?status=human_review`,
          action_id: 'review_queue',
        },
      ],
    },
  ]

  return sendSlackMessage({
    text: `Daily summary: ${pendingReviews} pending reviews, ${sequencesDeployed} deployed, ${correctionsLearned} corrections learned`,
    blocks,
  })
}

/**
 * Notify when an email reply is received (real-time)
 */
export async function notifyEmailReply(params: {
  leadId?: string
  leadName: string
  companyName: string
  email: string
  replySubject?: string
  replyPreview: string
  sentiment?: 'positive' | 'neutral' | 'negative' | 'unknown'
  smartleadLeadId?: string
  smartleadCampaignId?: string
}): Promise<boolean> {
  const { leadId, leadName, companyName, email, replySubject, replyPreview, sentiment, smartleadLeadId, smartleadCampaignId } = params

  const sentimentEmoji: Record<string, string> = {
    positive: '🎉',
    neutral: '💬',
    negative: '⚠️',
    unknown: '📩',
  }

  const emoji = sentimentEmoji[sentiment || 'unknown']
  // Show full reply - no truncation
  const fullReply = replyPreview || '(empty message)'

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} New Reply Received!`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*From:*\n${leadName}` },
        { type: 'mrkdwn', text: `*Company:*\n${companyName}` },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Email:*\n${email}` },
        { type: 'mrkdwn', text: `*Subject:*\n${replySubject || '(no subject)'}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Full Reply:*`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `>${fullReply.split('\n').join('\n>')}`,
      },
    },
  ]

  // Add action buttons
  const actionElements: Array<{
    type: string
    text: { type: string; text: string; emoji?: boolean }
    url: string
    action_id: string
    style?: string
  }> = []

  if (leadId) {
    actionElements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'View Lead',
        emoji: true,
      },
      url: `${APP_BASE_URL}/leads/${leadId}`,
      action_id: 'view_lead',
      style: 'primary',
    })
  }

  // Link directly to conversation in Smartlead
  const smartleadUrl = smartleadLeadId && smartleadCampaignId
    ? `https://app.smartlead.ai/app/email-accounts/master-inbox?campaignId=${smartleadCampaignId}&leadId=${smartleadLeadId}`
    : 'https://app.smartlead.ai/app/email-accounts/master-inbox'

  actionElements.push({
    type: 'button',
    text: {
      type: 'plain_text',
      text: 'Reply to This Email',
      emoji: true,
    },
    url: smartleadUrl,
    action_id: 'smartlead_reply',
  })

  if (actionElements.length > 0) {
    blocks.push({
      type: 'actions',
      elements: actionElements,
    })
  }

  return sendSlackMessage({
    text: `Reply from ${leadName} (${companyName}): ${fullReply.substring(0, 100)}...`,
    blocks,
  })
}

/**
 * Generic notification for custom messages
 */
export async function notifyGeneric(params: {
  title: string
  message: string
  link?: { text: string; url: string }
  emoji?: string
}): Promise<boolean> {
  const { title, message, link, emoji = '📢' } = params

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: message,
      },
    },
  ]

  if (link) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: link.text,
            emoji: true,
          },
          url: link.url,
          action_id: 'custom_link',
        },
      ],
    })
  }

  return sendSlackMessage({
    text: `${title}: ${message}`,
    blocks,
  })
}
