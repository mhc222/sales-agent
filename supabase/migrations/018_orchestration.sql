-- ============================================================================
-- MULTI-CHANNEL ORCHESTRATION SCHEMA
-- Tracks lead state across email and LinkedIn channels
-- ============================================================================

-- Campaign mode enum
CREATE TYPE campaign_mode AS ENUM ('email_only', 'linkedin_only', 'multi_channel');

-- Orchestration status enum
CREATE TYPE orchestration_status AS ENUM (
  'pending',        -- Not started
  'active',         -- In progress
  'paused',         -- Manually paused
  'waiting',        -- Waiting for cross-channel signal
  'completed',      -- All steps done
  'stopped',        -- Stopped due to reply/negative
  'converted'       -- Meeting booked / positive outcome
);

-- ============================================================================
-- MULTI-CHANNEL SEQUENCES
-- Stores the generated sequence plan (both channels)
-- ============================================================================

CREATE TABLE IF NOT EXISTS multichannel_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Mode
  campaign_mode campaign_mode NOT NULL DEFAULT 'multi_channel',

  -- Sequence content
  email_steps JSONB,      -- Array of email steps with timing
  linkedin_steps JSONB,   -- Array of LinkedIn steps with timing

  -- Strategy metadata
  sequence_strategy JSONB,
  -- {
  --   primary_angle: string,
  --   personalization_hooks: string[],
  --   cross_channel_triggers: { event: string, action: string }[]
  -- }

  -- Platform references (template campaigns)
  smartlead_campaign_id VARCHAR,
  heyreach_campaign_id VARCHAR,

  -- Status
  status orchestration_status DEFAULT 'pending',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  activated_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_multichannel_sequences_lead ON multichannel_sequences(lead_id);
CREATE INDEX idx_multichannel_sequences_tenant ON multichannel_sequences(tenant_id);
CREATE INDEX idx_multichannel_sequences_status ON multichannel_sequences(status);

-- Only one active sequence per lead
CREATE UNIQUE INDEX idx_multichannel_sequences_active_per_lead
  ON multichannel_sequences(lead_id)
  WHERE status IN ('pending', 'active', 'waiting', 'paused');

-- ============================================================================
-- ORCHESTRATION STATE
-- Real-time state tracking for each lead
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES multichannel_sequences(id) ON DELETE CASCADE,

  -- Campaign mode
  campaign_mode campaign_mode NOT NULL DEFAULT 'multi_channel',

  -- Current position in each channel
  email_step_current INTEGER DEFAULT 0,
  email_step_total INTEGER DEFAULT 0,
  linkedin_step_current INTEGER DEFAULT 0,
  linkedin_step_total INTEGER DEFAULT 0,

  -- Email channel status
  email_started BOOLEAN DEFAULT FALSE,
  email_paused BOOLEAN DEFAULT FALSE,
  email_completed BOOLEAN DEFAULT FALSE,
  last_email_sent_at TIMESTAMP,
  next_email_scheduled_at TIMESTAMP,

  -- LinkedIn channel status
  linkedin_started BOOLEAN DEFAULT FALSE,
  linkedin_paused BOOLEAN DEFAULT FALSE,
  linkedin_completed BOOLEAN DEFAULT FALSE,
  last_linkedin_action_at TIMESTAMP,
  next_linkedin_scheduled_at TIMESTAMP,

  -- Cross-channel signals
  linkedin_connected BOOLEAN DEFAULT FALSE,
  linkedin_connected_at TIMESTAMP,
  linkedin_replied BOOLEAN DEFAULT FALSE,
  linkedin_replied_at TIMESTAMP,
  linkedin_reply_sentiment VARCHAR,  -- positive, negative, neutral

  email_opened BOOLEAN DEFAULT FALSE,
  email_opened_count INTEGER DEFAULT 0,
  email_clicked BOOLEAN DEFAULT FALSE,
  email_replied BOOLEAN DEFAULT FALSE,
  email_replied_at TIMESTAMP,
  email_reply_sentiment VARCHAR,

  -- Orchestration control
  status orchestration_status DEFAULT 'pending',
  waiting_for VARCHAR,  -- 'linkedin_connection', 'email_open', 'time', etc.
  waiting_since TIMESTAMP,
  waiting_timeout_at TIMESTAMP,  -- When to give up waiting and continue

  -- Stop reason (if stopped)
  stop_reason VARCHAR,
  stop_details JSONB,

  -- Platform IDs
  smartlead_lead_id VARCHAR,
  heyreach_lead_id VARCHAR,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(lead_id)
);

-- Indexes
CREATE INDEX idx_orchestration_state_tenant ON orchestration_state(tenant_id);
CREATE INDEX idx_orchestration_state_status ON orchestration_state(status);
CREATE INDEX idx_orchestration_state_waiting ON orchestration_state(status, waiting_timeout_at)
  WHERE status = 'waiting';
CREATE INDEX idx_orchestration_state_next_email ON orchestration_state(next_email_scheduled_at)
  WHERE email_paused = FALSE AND email_completed = FALSE;
CREATE INDEX idx_orchestration_state_next_linkedin ON orchestration_state(next_linkedin_scheduled_at)
  WHERE linkedin_paused = FALSE AND linkedin_completed = FALSE;

-- ============================================================================
-- ORCHESTRATION EVENTS LOG
-- Audit trail of all orchestration decisions
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES multichannel_sequences(id) ON DELETE SET NULL,

  -- Event details
  event_type VARCHAR NOT NULL,
  -- Types:
  -- 'sequence_started', 'sequence_completed', 'sequence_stopped'
  -- 'email_sent', 'email_opened', 'email_clicked', 'email_replied'
  -- 'linkedin_connection_sent', 'linkedin_connected', 'linkedin_message_sent', 'linkedin_replied'
  -- 'channel_paused', 'channel_resumed'
  -- 'waiting_started', 'waiting_completed', 'waiting_timeout'
  -- 'cross_channel_trigger'

  channel VARCHAR,  -- 'email', 'linkedin', 'orchestrator'

  -- Event data
  step_number INTEGER,
  event_data JSONB,

  -- Decision made (if any)
  decision VARCHAR,
  decision_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_orchestration_events_lead ON orchestration_events(lead_id);
CREATE INDEX idx_orchestration_events_tenant ON orchestration_events(tenant_id);
CREATE INDEX idx_orchestration_events_type ON orchestration_events(event_type);
CREATE INDEX idx_orchestration_events_created ON orchestration_events(created_at DESC);

-- ============================================================================
-- CROSS-CHANNEL TRIGGERS
-- Define what events trigger actions on other channels
-- ============================================================================

CREATE TABLE IF NOT EXISTS cross_channel_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- NULL tenant_id = global default triggers

  -- Trigger definition
  name VARCHAR NOT NULL,
  description TEXT,

  -- When this happens...
  source_channel VARCHAR NOT NULL,  -- 'email', 'linkedin'
  source_event VARCHAR NOT NULL,    -- 'opened', 'clicked', 'replied', 'connected', etc.
  source_conditions JSONB,          -- Additional conditions (e.g., { "open_count": { "gte": 3 } })

  -- Do this...
  target_channel VARCHAR NOT NULL,  -- 'email', 'linkedin', 'orchestrator'
  target_action VARCHAR NOT NULL,   -- 'pause', 'resume', 'send_next', 'stop', 'alert'
  target_params JSONB,              -- Action parameters

  -- Priority (higher = evaluated first)
  priority INTEGER DEFAULT 0,

  -- Active flag
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index
CREATE INDEX idx_cross_channel_triggers_lookup
  ON cross_channel_triggers(source_channel, source_event, is_active);

-- ============================================================================
-- DEFAULT CROSS-CHANNEL TRIGGERS
-- ============================================================================

INSERT INTO cross_channel_triggers (tenant_id, name, source_channel, source_event, source_conditions, target_channel, target_action, target_params, priority) VALUES
-- LinkedIn connection → Resume email with context
(NULL, 'LinkedIn Connected → Personalize Email', 'linkedin', 'connected', NULL, 'email', 'resume', '{"add_context": "linkedin_connected"}', 10),

-- LinkedIn reply (positive) → Pause email, alert
(NULL, 'LinkedIn Positive Reply → Stop & Alert', 'linkedin', 'replied', '{"sentiment": "positive"}', 'orchestrator', 'stop', '{"reason": "positive_linkedin_reply", "alert": true}', 100),

-- LinkedIn reply (negative) → Stop everything
(NULL, 'LinkedIn Negative Reply → Stop All', 'linkedin', 'replied', '{"sentiment": "negative"}', 'orchestrator', 'stop', '{"reason": "negative_reply", "stop_all": true}', 100),

-- Email reply (positive) → Pause LinkedIn, alert
(NULL, 'Email Positive Reply → Stop & Alert', 'email', 'replied', '{"sentiment": "positive"}', 'orchestrator', 'stop', '{"reason": "positive_email_reply", "alert": true}', 100),

-- Email reply (negative) → Stop everything
(NULL, 'Email Negative Reply → Stop All', 'email', 'replied', '{"sentiment": "negative"}', 'orchestrator', 'stop', '{"reason": "negative_reply", "stop_all": true}', 100),

-- High email engagement → Trigger LinkedIn action
(NULL, 'High Email Engagement → LinkedIn Message', 'email', 'opened', '{"open_count": {"gte": 3}}', 'linkedin', 'send_next', '{"priority": true}', 50),

-- Email bounce → Stop email, continue LinkedIn only
(NULL, 'Email Bounce → LinkedIn Only', 'email', 'bounced', NULL, 'email', 'stop', '{"continue_linkedin": true}', 90),

-- No LinkedIn connection after timeout → Continue email anyway
(NULL, 'LinkedIn Connection Timeout → Continue Email', 'linkedin', 'connection_timeout', NULL, 'email', 'resume', '{"use_fallback_copy": true}', 20);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE multichannel_sequences IS 'Generated multi-channel outreach sequences combining email and LinkedIn';
COMMENT ON TABLE orchestration_state IS 'Real-time state tracking for each lead across all channels';
COMMENT ON TABLE orchestration_events IS 'Audit log of all orchestration decisions and events';
COMMENT ON TABLE cross_channel_triggers IS 'Rules that define cross-channel reactions (e.g., LinkedIn reply → pause email)';

COMMENT ON COLUMN orchestration_state.waiting_for IS 'What cross-channel signal we are waiting for before proceeding';
COMMENT ON COLUMN orchestration_state.waiting_timeout_at IS 'When to give up waiting and proceed with fallback';

-- ============================================================================
-- VIEW: Active Orchestrations
-- ============================================================================

CREATE OR REPLACE VIEW active_orchestrations AS
SELECT
  os.id,
  os.lead_id,
  os.tenant_id,
  l.email,
  l.first_name,
  l.last_name,
  l.company_name,
  l.linkedin_url,
  os.campaign_mode,
  os.status,
  os.email_step_current,
  os.email_step_total,
  os.linkedin_step_current,
  os.linkedin_step_total,
  os.linkedin_connected,
  os.email_opened_count,
  os.waiting_for,
  os.waiting_timeout_at,
  os.next_email_scheduled_at,
  os.next_linkedin_scheduled_at,
  os.updated_at
FROM orchestration_state os
JOIN leads l ON l.id = os.lead_id
WHERE os.status IN ('active', 'waiting')
ORDER BY
  LEAST(
    COALESCE(os.next_email_scheduled_at, '2099-01-01'),
    COALESCE(os.next_linkedin_scheduled_at, '2099-01-01')
  );

-- ============================================================================
-- VIEW: Orchestration Summary by Tenant
-- ============================================================================

CREATE OR REPLACE VIEW orchestration_summary AS
SELECT
  tenant_id,
  campaign_mode,
  status,
  COUNT(*) as lead_count,
  COUNT(*) FILTER (WHERE linkedin_connected) as linkedin_connected_count,
  COUNT(*) FILTER (WHERE email_replied OR linkedin_replied) as replied_count,
  AVG(email_step_current::float / NULLIF(email_step_total, 0)) as avg_email_progress,
  AVG(linkedin_step_current::float / NULLIF(linkedin_step_total, 0)) as avg_linkedin_progress
FROM orchestration_state
GROUP BY tenant_id, campaign_mode, status;
