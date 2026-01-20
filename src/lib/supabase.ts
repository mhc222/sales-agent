import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials in environment')
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Database type definitions
export type Lead = {
  id: string
  tenant_id: string
  campaign_id?: string
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
  status: 'ingested' | 'qualified' | 'human_review' | 'researched' | 'sequence_ready' | 'deploying' | 'active' | 'replied' | 'cold' | 'converted' | 'disqualified' | 'bounced' | 'unsubscribed' | 'interested' | 'nurture'
  intent_signal?: Record<string, unknown>
  // Source tracking
  source?: 'jsb_site_pixel' | 'intent_data'
  // Intent data fields
  intent_score?: number
  intent_signals?: Record<string, unknown>
  // Visit tracking
  visit_count: number
  first_seen_at: string
  last_seen_at: string
  // System presence flags
  in_ghl: boolean
  in_ghl_company: boolean
  in_smartlead: boolean
  in_heyreach: boolean
  // GHL CRM Integration
  ghl_contact_id?: string
  ghl_synced_at?: string
  // Qualification results
  qualification_decision?: 'YES' | 'NO' | 'REVIEW'
  qualification_reasoning?: string
  qualification_confidence?: number
  icp_fit?: 'strong' | 'medium' | 'weak'
  // Email engagement tracking
  email_bounced?: boolean
  email_unsubscribed?: boolean
  email_replied?: boolean
  reply_sentiment?: 'interested' | 'not_interested' | 'out_of_office' | 'remove_me'
  email_open_count?: number
  email_click_count?: number
  last_email_opened_at?: string
  high_engagement_triggered?: boolean
  // Timestamps
  created_at: string
  updated_at: string
}

export type PixelVisit = {
  id: string
  lead_id: string
  tenant_id: string
  page_visited?: string
  time_on_page?: number
  event_type?: string
  referrer?: string
  raw_event_data?: Record<string, unknown>
  created_at: string
}

export type ResearchRecord = {
  id: string
  lead_id: string
  perplexity_raw?: string
  apify_raw?: Record<string, unknown>
  extracted_signals?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type SequenceSpec = {
  id: string
  lead_id: string
  tenant_id: string
  trigger?: string
  channel_strategy: 'email_only' | 'multi_channel'
  steps: Array<Record<string, unknown>>
  status: 'draft' | 'deployed' | 'active' | 'paused' | 'completed'
  created_at: string
  updated_at: string
}

export type GHLRecord = {
  id: string
  lead_id: string
  ghl_contact_id?: string
  ghl_data?: Record<string, unknown>
  classification?: string
  created_at: string
  updated_at: string
}
