import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'jsb-media-sales-agent',
  name: 'JSB Media Sales Agent',
  eventKey: process.env.INNGEST_EVENT_KEY,
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
        icp_fit?: string
      }
      visit_count?: number
      is_returning_visitor?: boolean
    }
  }
  'lead.research-complete': {
    data: {
      lead_id: string
      tenant_id: string
      persona_match: {
        type: string
        decision_level: 'ATL' | 'BTL' | 'unknown'
        confidence: number
        reasoning: string
      }
      top_triggers: Array<{
        type: string
        fact: string
        scores: { impact: number; recency: number; relevance: number; total: number }
      }>
      messaging_angles: Array<{
        angle: string
        triggers_used: string[]
        why_opening: string
      }>
      qualification: {
        decision: string
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
  'lead.intent-ingested': {
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
      tenant_id: string
      // Intent-specific fields
      intent_score: number
      intent_tier: 'strong' | 'medium' | 'weak'
      intent_breakdown: {
        industry: number
        revenue: number
        title: number
        companySize: number
        dataQuality: number
      }
      intent_reasoning: string[]
      auto_research: boolean
      batch_date: string
      batch_rank: number
    }
  }
  'lead.sequence-ready': {
    data: {
      lead_id: string
      tenant_id: string
      sequence_id: string
      relationship_type: string
      persona_type: string
      thread_1_subject: string
      thread_2_subject: string
    }
  }
  'lead.deploy-to-smartlead': {
    data: {
      lead_id: string
      tenant_id: string
      sequence_id: string
      relationship_type: string
      persona_type: string
      thread_1_subject: string
      thread_2_subject: string
    }
  }
  // Smartlead response events
  'smartlead.email.replied': {
    data: {
      response_id: string
      lead_id?: string
      tenant_id: string
      email?: string
      reply_text: string
      reply_subject: string
      campaign_id?: string
      lead_name?: string
      company_name?: string
    }
  }
  'smartlead.email.bounced': {
    data: {
      lead_id?: string
      tenant_id: string
      email?: string
      bounce_type?: string
      bounce_reason?: string
      campaign_id?: string
    }
  }
  'smartlead.unsubscribed': {
    data: {
      lead_id?: string
      tenant_id: string
      email?: string
      campaign_id?: string
    }
  }
  'smartlead.high-engagement': {
    data: {
      lead_id: string
      tenant_id: string
      email?: string
      open_count: number
      campaign_id?: string
    }
  }
  'smartlead.ooo-restart': {
    data: {
      lead_id: string
      tenant_id: string
      response_id: string
      return_date: string
      campaign_id?: string
    }
  }
  'smartlead.interested': {
    data: {
      lead_id: string
      tenant_id: string
      response_id: string
      reply_text: string
      interest_level: 'hot' | 'warm'
      interest_signals: string[]
    }
  }
  // Sequence revision events
  'lead.sequence-revision-needed': {
    data: {
      lead_id: string
      tenant_id: string
      sequence_id: string
      revision_instructions: string | null
      attempt: number
    }
  }
  'lead.sequence-revision-complete': {
    data: {
      lead_id: string
      tenant_id: string
      sequence_id: string
      attempt: number
    }
  }
  // Learning system events
  'learning.analyze-requested': {
    data: {
      tenant_id: string
    }
  }
}
