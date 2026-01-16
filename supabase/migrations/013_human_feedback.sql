-- Migration: Human Feedback & Corrections System
-- Allows users to submit corrections that get incorporated into future outreach

-- ============================================================================
-- CORRECTIONS TABLE
-- ============================================================================

-- Store human corrections for companies, leads, and content
CREATE TABLE IF NOT EXISTS human_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- What this correction applies to
  correction_type TEXT NOT NULL, -- 'company', 'lead', 'content', 'industry'

  -- Entity references (nullable based on type)
  company_domain TEXT,           -- For company-level corrections
  company_name TEXT,             -- Company name (for display/matching)
  lead_id UUID REFERENCES leads(id),

  -- The correction itself
  incorrect_content TEXT NOT NULL,    -- What was wrong (e.g., "travel agency")
  correct_content TEXT NOT NULL,      -- What it should be (e.g., "marketing agency focused on travel")
  context TEXT,                       -- Additional context about the correction

  -- Categorization
  category TEXT,                 -- 'business_type', 'industry', 'name', 'fact', 'tone', 'other'
  severity TEXT DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'

  -- Status
  status TEXT DEFAULT 'active',  -- 'active', 'retired', 'superseded'

  -- Source
  source_email_id UUID,          -- If correction came from reviewing specific email
  source_sequence_id UUID REFERENCES email_sequences(id),
  submitted_by TEXT,             -- User who submitted (email or name)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_corrections_tenant ON human_corrections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_corrections_company ON human_corrections(company_domain);
CREATE INDEX IF NOT EXISTS idx_corrections_type ON human_corrections(correction_type);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON human_corrections(status);
CREATE INDEX IF NOT EXISTS idx_corrections_category ON human_corrections(category);

-- ============================================================================
-- APPROVED CONTENT PATTERNS
-- ============================================================================

-- Store patterns/phrases that work well and should be encouraged
CREATE TABLE IF NOT EXISTS approved_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Pattern details
  pattern_type TEXT NOT NULL,    -- 'opener', 'cta', 'subject_line', 'phrase', 'approach'
  pattern_content TEXT NOT NULL, -- The actual pattern/phrase
  description TEXT,              -- Why this works

  -- Context where it applies
  applicable_industries TEXT[],  -- NULL = all industries
  applicable_personas TEXT[],    -- NULL = all personas
  applicable_company_types TEXT[], -- NULL = all company types

  -- Evidence
  example_emails TEXT[],         -- Example uses that performed well
  success_metrics JSONB,         -- Performance data

  -- Status
  status TEXT DEFAULT 'active',  -- 'active', 'testing', 'retired'
  confidence_score DECIMAL(3,2) DEFAULT 0.5, -- How confident we are this works

  -- Source
  discovered_from TEXT,          -- 'manual', 'learning_system', 'a_b_test'
  submitted_by TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approved_patterns_tenant ON approved_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approved_patterns_type ON approved_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_approved_patterns_status ON approved_patterns(status);

-- ============================================================================
-- FEEDBACK ON SPECIFIC EMAILS
-- ============================================================================

-- Detailed feedback on specific generated emails
CREATE TABLE IF NOT EXISTS email_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- What this feedback is on
  sequence_id UUID REFERENCES email_sequences(id),
  email_index INTEGER,           -- Which email in sequence (1-7)

  -- The feedback
  feedback_type TEXT NOT NULL,   -- 'correction', 'praise', 'suggestion', 'issue'
  rating INTEGER,                -- 1-5 scale if applicable

  -- Specific feedback
  original_text TEXT,            -- The text being commented on
  suggested_text TEXT,           -- Suggested replacement if applicable
  comment TEXT,                  -- Free-form feedback

  -- Categorization
  issue_categories TEXT[],       -- ['factual_error', 'tone', 'too_salesy', 'wrong_persona', etc.]

  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'reviewed', 'applied', 'dismissed'
  reviewed_by TEXT,
  review_notes TEXT,

  -- Whether this should create a correction
  creates_correction BOOLEAN DEFAULT FALSE,
  correction_id UUID REFERENCES human_corrections(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_feedback_tenant ON email_feedback(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_feedback_sequence ON email_feedback(sequence_id);
CREATE INDEX IF NOT EXISTS idx_email_feedback_status ON email_feedback(status);
CREATE INDEX IF NOT EXISTS idx_email_feedback_type ON email_feedback(feedback_type);

-- ============================================================================
-- COMPANY CONTEXT OVERRIDES
-- ============================================================================

-- Override AI-inferred company information with human-verified facts
CREATE TABLE IF NOT EXISTS company_context_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Company identification
  company_domain TEXT NOT NULL,
  company_name TEXT,

  -- Override fields (NULL means use AI-inferred value)
  business_type TEXT,            -- e.g., "marketing agency" not "travel agency"
  industry_vertical TEXT,        -- e.g., "travel marketing"
  company_description TEXT,      -- Corrected description
  key_facts JSONB,               -- Additional verified facts
  avoid_topics TEXT[],           -- Topics to NOT mention
  preferred_angles TEXT[],       -- Preferred conversation angles

  -- Relationship context
  relationship_notes TEXT,       -- Any notes about our relationship
  past_interactions JSONB,       -- Summary of past interactions if any

  -- Status
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  verified_by TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, company_domain)
);

CREATE INDEX IF NOT EXISTS idx_company_overrides_domain ON company_context_overrides(company_domain);
CREATE INDEX IF NOT EXISTS idx_company_overrides_tenant ON company_context_overrides(tenant_id);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Active corrections for a company
CREATE OR REPLACE VIEW v_active_company_corrections AS
SELECT
  hc.*,
  cco.business_type as override_business_type,
  cco.industry_vertical as override_industry,
  cco.company_description as override_description
FROM human_corrections hc
LEFT JOIN company_context_overrides cco
  ON hc.company_domain = cco.company_domain
  AND hc.tenant_id = cco.tenant_id
WHERE hc.status = 'active'
  AND hc.correction_type IN ('company', 'industry');

-- View: Recent feedback summary
CREATE OR REPLACE VIEW v_feedback_summary AS
SELECT
  tenant_id,
  DATE(created_at) as feedback_date,
  feedback_type,
  COUNT(*) as count,
  AVG(rating) as avg_rating,
  ARRAY_AGG(DISTINCT unnest(issue_categories)) as all_categories
FROM email_feedback
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY tenant_id, DATE(created_at), feedback_type;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Get all corrections applicable to a company
CREATE OR REPLACE FUNCTION get_company_corrections(
  p_tenant_id UUID,
  p_company_domain TEXT,
  p_company_name TEXT DEFAULT NULL
) RETURNS TABLE (
  correction_type TEXT,
  incorrect_content TEXT,
  correct_content TEXT,
  category TEXT,
  context TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    hc.correction_type,
    hc.incorrect_content,
    hc.correct_content,
    hc.category,
    hc.context
  FROM human_corrections hc
  WHERE hc.tenant_id = p_tenant_id
    AND hc.status = 'active'
    AND (
      hc.company_domain = p_company_domain
      OR (p_company_name IS NOT NULL AND hc.company_name ILIKE '%' || p_company_name || '%')
    )
  ORDER BY hc.severity DESC, hc.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Get company context override if exists
CREATE OR REPLACE FUNCTION get_company_override(
  p_tenant_id UUID,
  p_company_domain TEXT
) RETURNS company_context_overrides AS $$
DECLARE
  v_override company_context_overrides;
BEGIN
  SELECT * INTO v_override
  FROM company_context_overrides
  WHERE tenant_id = p_tenant_id
    AND company_domain = p_company_domain;

  RETURN v_override;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_feedback_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_corrections_timestamp ON human_corrections;
CREATE TRIGGER trg_corrections_timestamp
  BEFORE UPDATE ON human_corrections
  FOR EACH ROW EXECUTE FUNCTION update_feedback_timestamp();

DROP TRIGGER IF EXISTS trg_patterns_timestamp ON approved_patterns;
CREATE TRIGGER trg_patterns_timestamp
  BEFORE UPDATE ON approved_patterns
  FOR EACH ROW EXECUTE FUNCTION update_feedback_timestamp();

DROP TRIGGER IF EXISTS trg_company_overrides_timestamp ON company_context_overrides;
CREATE TRIGGER trg_company_overrides_timestamp
  BEFORE UPDATE ON company_context_overrides
  FOR EACH ROW EXECUTE FUNCTION update_feedback_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE human_corrections IS 'User-submitted corrections for AI-generated content';
COMMENT ON TABLE approved_patterns IS 'Patterns and phrases that work well and should be encouraged';
COMMENT ON TABLE email_feedback IS 'Detailed feedback on specific generated emails';
COMMENT ON TABLE company_context_overrides IS 'Human-verified company information that overrides AI inference';

COMMENT ON FUNCTION get_company_corrections IS 'Get all active corrections applicable to a company';
COMMENT ON FUNCTION get_company_override IS 'Get company context override if exists';
