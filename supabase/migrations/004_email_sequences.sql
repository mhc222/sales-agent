-- ============================================================================
-- EMAIL SEQUENCES TABLE
-- Stores generated email sequences before deployment to Smartlead
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Sequence context
  relationship_type VARCHAR NOT NULL,
  persona_type VARCHAR,
  top_trigger VARCHAR,

  -- Pain points used
  pain_1 JSONB NOT NULL,
  pain_2 JSONB NOT NULL,

  -- Email threads
  thread_1 JSONB NOT NULL,  -- { subject, emails[] }
  thread_2 JSONB NOT NULL,  -- { subject, emails[] }

  -- Deployment status
  status VARCHAR DEFAULT 'pending',
  -- pending: generated, awaiting review/deployment
  -- approved: reviewed and ready to deploy
  -- deployed: pushed to Smartlead
  -- paused: manually paused
  -- completed: all emails sent
  -- cancelled: sequence cancelled

  -- Smartlead integration
  smartlead_campaign_id VARCHAR,
  smartlead_lead_id VARCHAR,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  deployed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_email_sequences_lead ON email_sequences(lead_id);
CREATE INDEX idx_email_sequences_tenant ON email_sequences(tenant_id);
CREATE INDEX idx_email_sequences_status ON email_sequences(status);
CREATE INDEX idx_email_sequences_tenant_status ON email_sequences(tenant_id, status);

-- Only one active sequence per lead (pending, approved, or deployed)
CREATE UNIQUE INDEX idx_email_sequences_active_per_lead
  ON email_sequences(lead_id)
  WHERE status IN ('pending', 'approved', 'deployed');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE email_sequences IS 'Generated email sequences awaiting or in deployment via Smartlead';

COMMENT ON COLUMN email_sequences.status IS 'Sequence lifecycle: pending → approved → deployed → completed (or cancelled/paused)';

COMMENT ON COLUMN email_sequences.pain_1 IS 'First pain point: { pain, implication, solution, social_proof }';

COMMENT ON COLUMN email_sequences.pain_2 IS 'Second pain point: { pain, implication, solution, social_proof }';

COMMENT ON COLUMN email_sequences.thread_1 IS 'First thread (emails 1-3): { subject, emails[] }';

COMMENT ON COLUMN email_sequences.thread_2 IS 'Second thread (emails 4-7): { subject, emails[] }';

-- ============================================================================
-- VIEW: Sequences ready for deployment
-- ============================================================================

CREATE OR REPLACE VIEW sequences_ready_for_deployment AS
SELECT
  es.id,
  es.lead_id,
  es.tenant_id,
  l.email,
  l.first_name,
  l.last_name,
  l.company_name,
  es.relationship_type,
  es.persona_type,
  es.thread_1->>'subject' as thread_1_subject,
  es.thread_2->>'subject' as thread_2_subject,
  es.created_at
FROM email_sequences es
JOIN leads l ON l.id = es.lead_id
WHERE es.status = 'approved'
ORDER BY es.created_at ASC;

-- ============================================================================
-- VIEW: Sequence performance (for future analytics)
-- ============================================================================

CREATE OR REPLACE VIEW sequence_summary AS
SELECT
  es.id,
  es.lead_id,
  l.email,
  l.company_name,
  es.relationship_type,
  es.persona_type,
  es.top_trigger,
  es.status,
  es.pain_1->>'pain' as pain_1_summary,
  es.pain_2->>'pain' as pain_2_summary,
  jsonb_array_length(es.thread_1->'emails') + jsonb_array_length(es.thread_2->'emails') as total_emails,
  es.created_at,
  es.deployed_at
FROM email_sequences es
JOIN leads l ON l.id = es.lead_id;
