-- ============================================================================
-- COMBINED MIGRATIONS: 013, 014, 015
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ============================================================================

-- ============================================================================
-- MIGRATION 013: Human Feedback & Corrections System
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
  AVG(rating) as avg_rating
FROM email_feedback
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY tenant_id, DATE(created_at), feedback_type;

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

-- Trigger: Auto-update timestamps
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

COMMENT ON TABLE human_corrections IS 'User-submitted corrections for AI-generated content';
COMMENT ON TABLE approved_patterns IS 'Patterns and phrases that work well and should be encouraged';
COMMENT ON TABLE email_feedback IS 'Detailed feedback on specific generated emails';
COMMENT ON TABLE company_context_overrides IS 'Human-verified company information that overrides AI inference';

COMMENT ON FUNCTION get_company_corrections IS 'Get all active corrections applicable to a company';
COMMENT ON FUNCTION get_company_override IS 'Get company context override if exists';

-- ============================================================================
-- MIGRATION 014: RAG Fundamentals
-- ============================================================================

-- Add settings JSONB column for brand-specific configuration
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

COMMENT ON COLUMN tenants.settings IS 'Brand-specific configuration including:
{
  "email_provider": "smartlead" | "zapmail" | "instantly" | etc,
  "email_provider_config": { api_key, campaign_defaults, etc },
  "linkedin_provider": "heyreach" | "phantombuster" | etc,
  "linkedin_provider_config": { ... },
  "research_sources": ["linkedin", "perplexity", "audiencelab"],
  "enabled_channels": ["email", "linkedin"]
}';

-- CRITICAL: Allow NULL tenant_id for global/fundamental documents
ALTER TABLE rag_documents ALTER COLUMN tenant_id DROP NOT NULL;

-- Add index for querying fundamentals (where tenant_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_rag_fundamentals
ON rag_documents(rag_type)
WHERE tenant_id IS NULL;

-- Set default settings for JSB Media tenant
UPDATE tenants
SET settings = '{
  "email_provider": "smartlead",
  "email_provider_config": {},
  "linkedin_provider": "heyreach",
  "linkedin_provider_config": {},
  "research_sources": ["linkedin", "perplexity", "audiencelab"],
  "enabled_channels": ["email", "linkedin"]
}'::jsonb
WHERE slug = 'jsb-media';

-- ============================================================================
-- MIGRATION 015: Auth & User Management
-- ============================================================================

-- Users table (links to Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL UNIQUE,
  full_name VARCHAR,
  avatar_url VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- User-tenant associations (many-to-many with roles)
CREATE TABLE IF NOT EXISTS user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- Do not contact list (per tenant)
CREATE TABLE IF NOT EXISTS do_not_contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR,
  domain VARCHAR,
  reason VARCHAR,
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (email IS NOT NULL OR domain IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dnc_tenant_email ON do_not_contact(tenant_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dnc_tenant_domain ON do_not_contact(tenant_id, domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dnc_tenant ON do_not_contact(tenant_id);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE do_not_contact ENABLE ROW LEVEL SECURITY;

-- Users policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User_tenants policies
DROP POLICY IF EXISTS "Users can view their tenant associations" ON user_tenants;
CREATE POLICY "Users can view their tenant associations" ON user_tenants
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can manage tenant associations" ON user_tenants;
CREATE POLICY "Owners can manage tenant associations" ON user_tenants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_tenants ut
      WHERE ut.tenant_id = user_tenants.tenant_id
        AND ut.user_id = auth.uid()
        AND ut.role = 'owner'
    )
  );

-- Do not contact policies
DROP POLICY IF EXISTS "Users can view DNC for their tenants" ON do_not_contact;
CREATE POLICY "Users can view DNC for their tenants" ON do_not_contact
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage DNC for their tenants" ON do_not_contact;
CREATE POLICY "Users can manage DNC for their tenants" ON do_not_contact
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

-- Function: Create user profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function: Check if email/domain is in DNC list
CREATE OR REPLACE FUNCTION check_dnc(
  p_tenant_id UUID,
  p_email VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  v_domain VARCHAR;
  v_exists BOOLEAN;
BEGIN
  -- Extract domain from email
  v_domain := split_part(p_email, '@', 2);

  -- Check if email or domain exists in DNC
  SELECT EXISTS (
    SELECT 1 FROM do_not_contact
    WHERE tenant_id = p_tenant_id
      AND (email = p_email OR domain = v_domain)
  ) INTO v_exists;

  RETURN v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update tenant settings schema comment
COMMENT ON COLUMN tenants.settings IS 'Tenant configuration including:
{
  "integrations": {
    "apollo": { "api_key": "encrypted..." },
    "smartlead": { "api_key": "encrypted...", "campaign_id": "..." },
    "instantly": { "api_key": "encrypted..." },
    "heyreach": { "api_key": "encrypted..." }
  },
  "active_email_provider": "smartlead" | "instantly",
  "active_linkedin_provider": "heyreach",
  "onboarding_completed": true,
  "research_sources": ["apollo", "perplexity", "linkedin"],
  "email_provider": "smartlead",
  "email_provider_config": {},
  "linkedin_provider": "heyreach",
  "linkedin_provider_config": {},
  "enabled_channels": ["email", "linkedin"]
}';

-- ============================================================================
-- DONE! All migrations applied.
-- ============================================================================
