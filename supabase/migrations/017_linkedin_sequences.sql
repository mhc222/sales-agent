-- ============================================================================
-- LINKEDIN SEQUENCES TABLE
-- Stores generated LinkedIn DM sequences before deployment to HeyReach
-- ============================================================================

CREATE TABLE IF NOT EXISTS linkedin_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Sequence context
  persona_type VARCHAR,

  -- Messages (array of DMs)
  messages JSONB NOT NULL,
  -- Array of: { message_number, day, framework, body, word_count, internal_notes }

  -- Strategy used
  sequence_strategy JSONB,
  -- { primary_angle, personalization_used[], framework_chosen, trigger_leveraged }

  -- Deployment status
  status VARCHAR DEFAULT 'pending',
  -- pending: generated, awaiting review/deployment
  -- approved: reviewed and ready to deploy
  -- deployed: pushed to HeyReach
  -- paused: manually paused
  -- completed: all messages sent
  -- cancelled: sequence cancelled

  -- HeyReach integration
  heyreach_campaign_id VARCHAR,
  heyreach_list_id VARCHAR,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  deployed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_linkedin_sequences_lead ON linkedin_sequences(lead_id);
CREATE INDEX idx_linkedin_sequences_tenant ON linkedin_sequences(tenant_id);
CREATE INDEX idx_linkedin_sequences_status ON linkedin_sequences(status);
CREATE INDEX idx_linkedin_sequences_tenant_status ON linkedin_sequences(tenant_id, status);

-- Only one active sequence per lead (pending, approved, or deployed)
CREATE UNIQUE INDEX idx_linkedin_sequences_active_per_lead
  ON linkedin_sequences(lead_id)
  WHERE status IN ('pending', 'approved', 'deployed');

-- ============================================================================
-- LINKEDIN RESPONSES TABLE
-- Stores replies received from LinkedIn (via HeyReach webhooks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS linkedin_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- LinkedIn identifiers
  conversation_id VARCHAR,
  linkedin_url VARCHAR,

  -- Message content
  message_text TEXT NOT NULL,
  received_at TIMESTAMP NOT NULL,

  -- Provider info
  provider VARCHAR DEFAULT 'heyreach',
  raw_payload JSONB,

  -- Processing
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  classification VARCHAR,
  -- interested, not_interested, meeting_request, out_of_office, other

  -- AI analysis
  sentiment VARCHAR,
  -- positive, neutral, negative
  intent_signals JSONB,
  suggested_response TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_linkedin_responses_lead ON linkedin_responses(lead_id);
CREATE INDEX idx_linkedin_responses_tenant ON linkedin_responses(tenant_id);
CREATE INDEX idx_linkedin_responses_processed ON linkedin_responses(processed);
CREATE INDEX idx_linkedin_responses_linkedin_url ON linkedin_responses(linkedin_url);

-- ============================================================================
-- ADD LINKEDIN FIELDS TO LEADS TABLE
-- ============================================================================

-- LinkedIn connection status
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_connected_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_connection_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_connection_requested_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_replied BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_last_reply_at TIMESTAMP;

-- Index for LinkedIn status
CREATE INDEX IF NOT EXISTS idx_leads_linkedin_connected ON leads(linkedin_connected) WHERE linkedin_connected = TRUE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE linkedin_sequences IS 'Generated LinkedIn DM sequences awaiting or in deployment via HeyReach';

COMMENT ON COLUMN linkedin_sequences.status IS 'Sequence lifecycle: pending → approved → deployed → completed (or cancelled/paused)';

COMMENT ON COLUMN linkedin_sequences.messages IS 'Array of messages: { message_number, day, framework, body, word_count, internal_notes }';

COMMENT ON COLUMN linkedin_sequences.sequence_strategy IS 'Strategy metadata: { primary_angle, personalization_used[], framework_chosen, trigger_leveraged }';

COMMENT ON TABLE linkedin_responses IS 'LinkedIn replies received via HeyReach webhooks';

COMMENT ON COLUMN linkedin_responses.classification IS 'AI-classified response type: interested, not_interested, meeting_request, out_of_office, other';

-- ============================================================================
-- VIEW: LinkedIn sequences ready for deployment
-- ============================================================================

CREATE OR REPLACE VIEW linkedin_sequences_ready_for_deployment AS
SELECT
  ls.id,
  ls.lead_id,
  ls.tenant_id,
  l.email,
  l.first_name,
  l.last_name,
  l.company_name,
  l.linkedin_url,
  ls.persona_type,
  jsonb_array_length(ls.messages) as message_count,
  ls.sequence_strategy->>'framework_chosen' as framework,
  ls.created_at
FROM linkedin_sequences ls
JOIN leads l ON l.id = ls.lead_id
WHERE ls.status = 'approved'
  AND l.linkedin_url IS NOT NULL
ORDER BY ls.created_at ASC;

-- ============================================================================
-- VIEW: LinkedIn engagement summary
-- ============================================================================

CREATE OR REPLACE VIEW linkedin_engagement_summary AS
SELECT
  l.id as lead_id,
  l.email,
  l.first_name,
  l.last_name,
  l.company_name,
  l.linkedin_url,
  l.linkedin_connected,
  l.linkedin_connected_at,
  l.linkedin_replied,
  l.linkedin_last_reply_at,
  ls.id as sequence_id,
  ls.status as sequence_status,
  jsonb_array_length(ls.messages) as messages_in_sequence,
  (SELECT COUNT(*) FROM linkedin_responses lr WHERE lr.lead_id = l.id) as total_responses
FROM leads l
LEFT JOIN linkedin_sequences ls ON ls.lead_id = l.id
  AND ls.status IN ('deployed', 'completed')
WHERE l.linkedin_url IS NOT NULL;
