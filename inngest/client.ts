import { Inngest } from '@inngest/sdk'

export const inngest = new Inngest({
  id: 'jsb-media-sales-agent',
  name: 'JSB Media Sales Agent',
})

// Event types for type safety
export interface Events {
  'lead.ingested': {
    data: {
      first_name: string
      last_name: string
      email: string
      job_title?: string
      headline?: string
      department?: string
      seniority_level?: string
      years_experience?: number
      linkedin_url?: string
      company_name: string
      company_linkedin_url?: string
      company_domain?: string
      company_employee_count?: number
      company_revenue?: string
      company_industry?: string
      company_description?: string
      intent_signal?: Record<string, unknown>
      tenant_id: string
    }
  }
  'lead.ready-for-deployment': {
    data: {
      lead_id: string
      tenant_id: string
      qualification: {
        decision: 'YES' | 'NO' | 'REVIEW'
        reasoning: string
        confidence: number
      }
    }
  }
  'slack.human_decision': {
    data: {
      lead_id: string
      action: 'APPROVE' | 'REJECT'
      user_id: string
      timestamp: string
    }
  }
  'smartlead.email.opened': {
    data: {
      lead_id: string
      campaign_id: string
      email_id: string
      timestamp: string
    }
  }
  'smartlead.email.replied': {
    data: {
      lead_id: string
      campaign_id: string
      email_id: string
      reply_text: string
      timestamp: string
    }
  }
  'smartlead.email.bounced': {
    data: {
      lead_id: string
      campaign_id: string
      email_id: string
      reason: string
      timestamp: string
    }
  }
  'heyreach.connection.accepted': {
    data: {
      lead_id: string
      outreach_id: string
      profile_url: string
      timestamp: string
    }
  }
  'heyreach.message.replied': {
    data: {
      lead_id: string
      outreach_id: string
      message_text: string
      timestamp: string
    }
  }
}
