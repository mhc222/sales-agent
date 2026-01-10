-- ============================================================================
-- LEAD MEMORIES TABLE
-- Append-only memory log for all agents and systems
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Who wrote this memory
  source VARCHAR NOT NULL,
  -- Examples: 'agent1_qualification', 'agent2_research', 'agent3_writer',
  --           'email_webhook', 'linkedin_webhook', 'human', 'system'

  -- What type of memory
  memory_type VARCHAR NOT NULL,
  -- Examples: 'research', 'qualification', 'sequence_sent', 'email_sent',
  --           'reply_received', 'status_change', 'meeting_booked', 'note',
  --           'objection', 'follow_up_scheduled', 'disqualified'

  -- The actual content (flexible structure based on memory_type)
  content JSONB NOT NULL,

  -- Quick summary for scanning without parsing full content
  summary TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_lead_memories_lead ON lead_memories(lead_id);
CREATE INDEX idx_lead_memories_tenant ON lead_memories(tenant_id);
CREATE INDEX idx_lead_memories_lead_created ON lead_memories(lead_id, created_at DESC);
CREATE INDEX idx_lead_memories_type ON lead_memories(memory_type);
CREATE INDEX idx_lead_memories_source ON lead_memories(source);

-- ============================================================================
-- COMMENTS (for documentation)
-- ============================================================================

COMMENT ON TABLE lead_memories IS 'Append-only memory log for all lead interactions across agents and systems';

COMMENT ON COLUMN lead_memories.source IS 'Who/what created this memory: agent1_qualification, agent2_research, agent3_writer, email_webhook, human, etc.';

COMMENT ON COLUMN lead_memories.memory_type IS 'Type of memory: research, qualification, sequence_sent, reply_received, status_change, meeting_booked, note, etc.';

COMMENT ON COLUMN lead_memories.content IS 'Flexible JSONB content - structure depends on memory_type';

COMMENT ON COLUMN lead_memories.summary IS 'Human-readable summary for quick scanning without parsing content';

-- ============================================================================
-- VIEW: Latest memory per lead (for quick status checks)
-- ============================================================================

CREATE OR REPLACE VIEW lead_latest_memory AS
SELECT DISTINCT ON (lead_id)
  lead_id,
  source,
  memory_type,
  summary,
  created_at
FROM lead_memories
ORDER BY lead_id, created_at DESC;

-- ============================================================================
-- VIEW: Lead memory timeline (for full context)
-- ============================================================================

CREATE OR REPLACE VIEW lead_memory_timeline AS
SELECT
  lm.lead_id,
  l.first_name,
  l.last_name,
  l.email,
  l.company_name,
  lm.source,
  lm.memory_type,
  lm.summary,
  lm.content,
  lm.created_at
FROM lead_memories lm
JOIN leads l ON l.id = lm.lead_id
ORDER BY lm.lead_id, lm.created_at ASC;
