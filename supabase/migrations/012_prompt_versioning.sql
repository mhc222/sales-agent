-- ============================================
-- PROMPT VERSIONING SCHEMA
-- Tracks prompt evolution and performance
-- ============================================

-- ============================================
-- 1. PROMPT DEFINITIONS
-- Master list of all prompts in the system
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL = global prompt

  prompt_name VARCHAR NOT NULL,  -- agent1-qualification, agent3-writer, etc.
  prompt_category VARCHAR NOT NULL,  -- agent, helper, template
  description TEXT,

  -- Base prompt (static part)
  base_prompt TEXT NOT NULL,

  -- Dynamic sections that can be injected
  dynamic_sections JSONB DEFAULT '[]',
  -- e.g., [{"name": "learned_patterns", "position": "before_examples"}, ...]

  -- Current active version
  active_version_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, prompt_name)
);

CREATE INDEX IF NOT EXISTS idx_prompt_def_name ON prompt_definitions(prompt_name);
CREATE INDEX IF NOT EXISTS idx_prompt_def_tenant ON prompt_definitions(tenant_id);


-- ============================================
-- 2. PROMPT VERSIONS
-- Every version of every prompt
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_definition_id UUID NOT NULL REFERENCES prompt_definitions(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id),

  version_number INTEGER NOT NULL,
  version_label VARCHAR,  -- v1.0, v1.1-experiment, etc.

  -- Full prompt content for this version
  full_prompt TEXT NOT NULL,

  -- What changed
  change_description TEXT,
  change_type VARCHAR NOT NULL,  -- manual, learned_injection, ab_test, rollback

  -- Injected learnings in this version
  injected_patterns JSONB DEFAULT '[]',
  -- e.g., [{"pattern_id": "uuid", "pattern_content": "...", "injection_point": "learned_patterns"}]

  -- Performance tracking
  total_uses INTEGER DEFAULT 0,
  total_successes INTEGER DEFAULT 0,  -- positive replies, conversions, etc.
  success_rate DECIMAL(5,4),
  avg_reply_rate DECIMAL(5,4),
  avg_positive_reply_rate DECIMAL(5,4),

  -- Status
  status VARCHAR NOT NULL DEFAULT 'draft',
  -- draft, testing, active, deprecated, rolled_back

  -- A/B test assignment
  ab_test_id UUID,
  ab_test_variant VARCHAR,  -- control, variant_a, variant_b, etc.

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ,

  UNIQUE(prompt_definition_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_prompt_version_def ON prompt_versions(prompt_definition_id);
CREATE INDEX IF NOT EXISTS idx_prompt_version_status ON prompt_versions(status);
CREATE INDEX IF NOT EXISTS idx_prompt_version_active ON prompt_versions(prompt_definition_id, status) WHERE status = 'active';


-- ============================================
-- 3. PROMPT A/B TESTS
-- Experiments comparing prompt versions
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  prompt_definition_id UUID NOT NULL REFERENCES prompt_definitions(id),

  test_name VARCHAR NOT NULL,
  hypothesis TEXT NOT NULL,

  -- Variants
  control_version_id UUID NOT NULL REFERENCES prompt_versions(id),
  variant_version_ids UUID[] NOT NULL,  -- Can test multiple variants

  -- Traffic allocation
  control_percentage INTEGER NOT NULL DEFAULT 50,
  variant_percentages INTEGER[] NOT NULL,  -- Must sum to 100 - control_percentage

  -- Sample requirements
  min_sample_per_variant INTEGER NOT NULL DEFAULT 50,
  max_runtime_days INTEGER DEFAULT 30,

  -- Results
  results JSONB,
  winner_version_id UUID,
  statistical_significance DECIMAL(5,4),

  -- Status
  status VARCHAR NOT NULL DEFAULT 'draft',
  -- draft, running, paused, completed, cancelled

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_status ON prompt_ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_test_prompt ON prompt_ab_tests(prompt_definition_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_tenant ON prompt_ab_tests(tenant_id);


-- ============================================
-- 4. PROMPT USAGE LOG
-- Track which prompt version was used for each outreach
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  outreach_event_id UUID REFERENCES outreach_events(id) ON DELETE CASCADE,
  prompt_version_id UUID NOT NULL REFERENCES prompt_versions(id),
  ab_test_id UUID REFERENCES prompt_ab_tests(id),

  -- Outcome (updated later via trigger or batch)
  had_reply BOOLEAN,
  had_positive_reply BOOLEAN,
  had_meeting BOOLEAN,
  had_conversion BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_version ON prompt_usage_log(prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_usage_outreach ON prompt_usage_log(outreach_event_id);
CREATE INDEX IF NOT EXISTS idx_usage_ab_test ON prompt_usage_log(ab_test_id);


-- ============================================
-- 5. DYNAMIC SECTIONS
-- Reusable content blocks injected into prompts
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_dynamic_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  section_name VARCHAR NOT NULL,  -- learned_patterns, industry_context, anti_patterns, etc.
  section_type VARCHAR NOT NULL,  -- learned, static, conditional

  -- Content
  content TEXT NOT NULL,

  -- Conditions for inclusion
  include_when JSONB,  -- e.g., {"industry": ["saas", "ecommerce"]} or null for always

  -- Source tracking
  source_pattern_ids UUID[],  -- Which learned_patterns contributed

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, section_name)
);

CREATE INDEX IF NOT EXISTS idx_dynamic_section_name ON prompt_dynamic_sections(section_name);
CREATE INDEX IF NOT EXISTS idx_dynamic_section_tenant ON prompt_dynamic_sections(tenant_id);


-- ============================================
-- 6. FUNCTION: Update prompt version stats
-- ============================================

CREATE OR REPLACE FUNCTION update_prompt_version_stats(p_version_id UUID)
RETURNS VOID AS $$
DECLARE
  v_stats RECORD;
BEGIN
  SELECT
    COUNT(*) as total_uses,
    COUNT(CASE WHEN had_reply THEN 1 END) as replies,
    COUNT(CASE WHEN had_positive_reply THEN 1 END) as positive_replies,
    COUNT(CASE WHEN had_meeting THEN 1 END) as meetings,
    COUNT(CASE WHEN had_conversion THEN 1 END) as conversions
  INTO v_stats
  FROM prompt_usage_log
  WHERE prompt_version_id = p_version_id;

  UPDATE prompt_versions
  SET
    total_uses = v_stats.total_uses,
    total_successes = v_stats.positive_replies,
    success_rate = CASE WHEN v_stats.total_uses > 0
      THEN v_stats.positive_replies::DECIMAL / v_stats.total_uses
      ELSE 0 END,
    avg_reply_rate = CASE WHEN v_stats.total_uses > 0
      THEN v_stats.replies::DECIMAL / v_stats.total_uses
      ELSE 0 END,
    avg_positive_reply_rate = CASE WHEN v_stats.total_uses > 0
      THEN v_stats.positive_replies::DECIMAL / v_stats.total_uses
      ELSE 0 END
  WHERE id = p_version_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 7. FUNCTION: Get active prompt with injections
-- ============================================

CREATE OR REPLACE FUNCTION get_active_prompt(
  p_tenant_id UUID,
  p_prompt_name VARCHAR,
  p_context JSONB DEFAULT '{}'
) RETURNS TABLE (
  version_id UUID,
  full_prompt TEXT,
  version_number INTEGER,
  ab_test_id UUID
) AS $$
DECLARE
  v_definition RECORD;
  v_active_version RECORD;
  v_ab_test RECORD;
  v_selected_version_id UUID;
BEGIN
  -- Get prompt definition
  SELECT * INTO v_definition
  FROM prompt_definitions pd
  WHERE (pd.tenant_id = p_tenant_id OR pd.tenant_id IS NULL)
    AND pd.prompt_name = p_prompt_name
  ORDER BY pd.tenant_id NULLS LAST
  LIMIT 1;

  IF v_definition IS NULL THEN
    RETURN;
  END IF;

  -- Check for active A/B test
  SELECT * INTO v_ab_test
  FROM prompt_ab_tests pat
  WHERE pat.prompt_definition_id = v_definition.id
    AND pat.status = 'running'
  LIMIT 1;

  IF v_ab_test IS NOT NULL THEN
    -- Randomly assign to variant based on percentages
    IF random() * 100 < v_ab_test.control_percentage THEN
      v_selected_version_id := v_ab_test.control_version_id;
    ELSE
      -- Simple: pick first variant (extend for multiple variants)
      v_selected_version_id := v_ab_test.variant_version_ids[1];
    END IF;
  ELSE
    -- Use active version
    v_selected_version_id := v_definition.active_version_id;
  END IF;

  -- Return selected version
  RETURN QUERY
  SELECT
    pv.id,
    pv.full_prompt,
    pv.version_number,
    v_ab_test.id
  FROM prompt_versions pv
  WHERE pv.id = v_selected_version_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 8. TRIGGER: Auto-update timestamps
-- ============================================

CREATE OR REPLACE FUNCTION update_prompt_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prompt_definitions_timestamp ON prompt_definitions;
CREATE TRIGGER trg_prompt_definitions_timestamp
  BEFORE UPDATE ON prompt_definitions
  FOR EACH ROW EXECUTE FUNCTION update_prompt_timestamp();

DROP TRIGGER IF EXISTS trg_prompt_ab_tests_timestamp ON prompt_ab_tests;
CREATE TRIGGER trg_prompt_ab_tests_timestamp
  BEFORE UPDATE ON prompt_ab_tests
  FOR EACH ROW EXECUTE FUNCTION update_prompt_timestamp();

DROP TRIGGER IF EXISTS trg_prompt_dynamic_sections_timestamp ON prompt_dynamic_sections;
CREATE TRIGGER trg_prompt_dynamic_sections_timestamp
  BEFORE UPDATE ON prompt_dynamic_sections
  FOR EACH ROW EXECUTE FUNCTION update_prompt_timestamp();


-- ============================================
-- 9. ADD COLUMNS TO LEARNED_PATTERNS
-- Track prompt promotion status
-- ============================================

ALTER TABLE learned_patterns
  ADD COLUMN IF NOT EXISTS promoted_to_prompt BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_to_prompt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prompt_file VARCHAR;


-- ============================================
-- 10. ADD PROMPT VERSION TRACKING TO EMAIL_SEQUENCES
-- Track which prompt version generated each sequence
-- ============================================

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS prompt_version_id UUID REFERENCES prompt_versions(id);

CREATE INDEX IF NOT EXISTS idx_email_seq_prompt_version ON email_sequences(prompt_version_id);


-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE prompt_definitions IS 'Master definitions of all prompts in the system';
COMMENT ON TABLE prompt_versions IS 'Version history for each prompt with performance tracking';
COMMENT ON TABLE prompt_ab_tests IS 'A/B test experiments comparing prompt versions';
COMMENT ON TABLE prompt_usage_log IS 'Links outreach events to the prompt version used';
COMMENT ON TABLE prompt_dynamic_sections IS 'Reusable content blocks injected into prompts';

COMMENT ON FUNCTION update_prompt_version_stats IS 'Recalculates performance stats for a prompt version';
COMMENT ON FUNCTION get_active_prompt IS 'Gets the active prompt version with A/B test assignment';
