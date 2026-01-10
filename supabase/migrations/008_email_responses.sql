-- ============================================================================
-- EMAIL RESPONSES TABLE (Track all email events from Smartlead)
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Smartlead identifiers
  smartlead_lead_id VARCHAR,
  campaign_id VARCHAR,
  email_id VARCHAR,

  -- Event details
  event_type VARCHAR NOT NULL, -- bounce, reply, open, click, unsubscribe
  reply_category VARCHAR, -- out_of_office, not_interested, remove_me, interested, other

  -- Reply content (for replies)
  reply_text TEXT,
  reply_subject VARCHAR,

  -- Out of office specific
  ooo_return_date DATE,
  ooo_restart_scheduled BOOLEAN DEFAULT FALSE,

  -- Classification metadata
  classification_confidence DECIMAL(3,2),
  classification_reasoning TEXT,

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  action_taken VARCHAR,

  -- Raw webhook data
  raw_payload JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_responses_lead ON email_responses(lead_id);
CREATE INDEX idx_email_responses_campaign ON email_responses(campaign_id);
CREATE INDEX idx_email_responses_event ON email_responses(event_type);
CREATE INDEX idx_email_responses_category ON email_responses(reply_category);
CREATE INDEX idx_email_responses_processed ON email_responses(processed);

-- ============================================================================
-- BOUNCED EMAILS TABLE (Permanent blocklist)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bounced_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  email VARCHAR NOT NULL,
  bounce_type VARCHAR, -- hard, soft
  bounce_reason TEXT,

  -- Source tracking
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id VARCHAR,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_bounced_emails_email ON bounced_emails(email);
CREATE INDEX idx_bounced_emails_tenant ON bounced_emails(tenant_id);

-- ============================================================================
-- UNSUBSCRIBED_EMAILS TABLE (Do not contact list)
-- ============================================================================
CREATE TABLE IF NOT EXISTS unsubscribed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  email VARCHAR NOT NULL,
  unsubscribe_reason VARCHAR, -- explicit_request, remove_me_reply, ghl_sync

  -- Source tracking
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id VARCHAR,

  -- GHL sync
  synced_to_ghl BOOLEAN DEFAULT FALSE,
  ghl_contact_id VARCHAR,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_unsubscribed_email ON unsubscribed_emails(email);
CREATE INDEX idx_unsubscribed_tenant ON unsubscribed_emails(tenant_id);

-- ============================================================================
-- FOLLOW_UP_LATER TABLE (Not interested right now bucket)
-- ============================================================================
CREATE TABLE IF NOT EXISTS follow_up_later (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  reason VARCHAR, -- not_interested_now, bad_timing, ooo_returned
  original_reply TEXT,

  -- Follow up scheduling
  follow_up_date DATE,
  follow_up_triggered BOOLEAN DEFAULT FALSE,

  -- Context
  original_campaign_id VARCHAR,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_follow_up_lead ON follow_up_later(lead_id);
CREATE INDEX idx_follow_up_date ON follow_up_later(follow_up_date);
CREATE INDEX idx_follow_up_triggered ON follow_up_later(follow_up_triggered);

-- ============================================================================
-- ADD EMAIL FLAGS TO LEADS TABLE
-- ============================================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_bounced BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_replied BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reply_sentiment VARCHAR; -- interested, not_interested, out_of_office, remove_me
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_open_count INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_click_count INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_email_opened_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS high_engagement_triggered BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- EMAIL OPENS TABLE (Track individual opens for engagement scoring)
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_opens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Smartlead identifiers
  smartlead_lead_id VARCHAR,
  campaign_id VARCHAR,
  email_id VARCHAR,
  sequence_number INTEGER, -- Which email in the sequence (1-7)

  -- Open details
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR,
  user_agent TEXT,

  -- Raw data
  raw_payload JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_opens_lead ON email_opens(lead_id);
CREATE INDEX idx_email_opens_campaign ON email_opens(campaign_id);
CREATE INDEX idx_email_opens_opened ON email_opens(opened_at);

-- ============================================================================
-- INTERESTED LEADS TABLE (Hot leads for human review)
-- ============================================================================
CREATE TABLE IF NOT EXISTS interested_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  reply_text TEXT NOT NULL,
  reply_subject VARCHAR,
  campaign_id VARCHAR,

  -- Classification
  interest_level VARCHAR, -- hot, warm
  interest_signals TEXT[],

  -- Human review
  slack_notified BOOLEAN DEFAULT FALSE,
  slack_message_ts VARCHAR,
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by VARCHAR,
  reviewed_at TIMESTAMPTZ,
  review_outcome VARCHAR, -- qualified, disqualified, needs_followup

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interested_lead ON interested_leads(lead_id);
CREATE INDEX idx_interested_reviewed ON interested_leads(reviewed);
CREATE INDEX idx_interested_created ON interested_leads(created_at);
