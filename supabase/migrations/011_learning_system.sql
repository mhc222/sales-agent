-- Migration: Learning System for Outcome Tracking
-- Tracks email content elements, engagement, and learns what works over time

-- ============================================================================
-- CONTENT ELEMENT TAXONOMY
-- ============================================================================

-- Define the types of content elements we track
CREATE TABLE IF NOT EXISTS content_element_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- 'opener', 'pain_point', 'cta', 'subject_line', 'tone', 'length', 'personalization'
  element_type TEXT NOT NULL, -- specific type within category
  description TEXT,
  example TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, element_type)
);

-- Seed the taxonomy with initial element types
INSERT INTO content_element_types (category, element_type, description, example) VALUES
  -- Opener types
  ('opener', 'trigger_reference', 'Opens with specific trigger from research', 'Saw you just raised Series B...'),
  ('opener', 'mutual_connection', 'References shared connection or experience', 'Fellow YC founder here...'),
  ('opener', 'industry_insight', 'Leads with industry-specific observation', 'Most SaaS founders I talk to...'),
  ('opener', 'direct_value', 'Immediately states potential value', 'Quick way to 3x your demo conversion...'),
  ('opener', 'question', 'Opens with thought-provoking question', 'Ever wonder why...?'),
  ('opener', 'congratulation', 'Acknowledges recent achievement', 'Congrats on the product launch...'),

  -- Pain point framing
  ('pain_point', 'time_waste', 'Focuses on time being wasted', 'Hours spent on manual tasks...'),
  ('pain_point', 'revenue_leak', 'Highlights lost revenue opportunity', 'Leaving money on the table...'),
  ('pain_point', 'competitive_gap', 'Points to competitor advantage', 'While competitors are...'),
  ('pain_point', 'scaling_blocker', 'Identifies growth bottleneck', 'Hard to scale when...'),
  ('pain_point', 'team_friction', 'Addresses team/process issues', 'When sales and marketing clash...'),

  -- CTA types
  ('cta', 'soft_question', 'Non-committal question', 'Worth exploring?'),
  ('cta', 'specific_time', 'Proposes specific meeting time', '15 min Tuesday?'),
  ('cta', 'value_offer', 'Offers something of value', 'Happy to share the playbook...'),
  ('cta', 'permission_based', 'Asks permission to continue', 'Mind if I send over...?'),
  ('cta', 'social_proof', 'CTA with peer reference', 'Other CTOs have found...'),

  -- Subject line patterns
  ('subject_line', 'question', 'Subject is a question', 'Quick question about [X]?'),
  ('subject_line', 'trigger_based', 'References specific trigger', 're: your recent funding'),
  ('subject_line', 'curiosity_gap', 'Creates curiosity', 'Interesting pattern with [company]'),
  ('subject_line', 'direct', 'Straight to the point', '[Name] + [Company]'),
  ('subject_line', 'personalized', 'Highly personalized reference', 'Your talk at [Event]'),

  -- Tone variations
  ('tone', 'casual_peer', 'Casual, peer-to-peer', 'Hey, fellow founder...'),
  ('tone', 'professional_warm', 'Professional but warm', 'Hope this finds you well...'),
  ('tone', 'direct_no_fluff', 'Direct, no small talk', 'Straight to it...'),
  ('tone', 'consultative', 'Advisory/consultative', 'In my experience...'),

  -- Length categories
  ('length', 'ultra_short', 'Under 50 words', NULL),
  ('length', 'short', '50-100 words', NULL),
  ('length', 'medium', '100-150 words', NULL),
  ('length', 'detailed', '150+ words', NULL),

  -- Personalization depth
  ('personalization', 'trigger_deep', 'Multiple research triggers used', NULL),
  ('personalization', 'trigger_single', 'One key trigger referenced', NULL),
  ('personalization', 'company_only', 'Company-level personalization', NULL),
  ('personalization', 'template_feel', 'Minimal personalization', NULL)
ON CONFLICT (category, element_type) DO NOTHING;

-- ============================================================================
-- OUTREACH EVENT TRACKING
-- ============================================================================

-- Track every email sent with its content elements
CREATE TABLE IF NOT EXISTS outreach_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID NOT NULL REFERENCES leads(id),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id),

  -- Email identification
  thread_number INTEGER NOT NULL, -- 1 or 2
  email_position INTEGER NOT NULL, -- 1-7 within thread
  smartlead_campaign_id TEXT,
  smartlead_lead_id TEXT,

  -- Content snapshot (for historical accuracy)
  subject_line TEXT NOT NULL,
  email_body TEXT NOT NULL,

  -- Timing
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ,

  -- Context at time of send
  persona_type TEXT,
  relationship_type TEXT,
  top_trigger_type TEXT,
  sequence_strategy JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for common queries
  CONSTRAINT outreach_events_thread_check CHECK (thread_number IN (1, 2)),
  CONSTRAINT outreach_events_position_check CHECK (email_position BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_outreach_events_tenant ON outreach_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outreach_events_lead ON outreach_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_events_sequence ON outreach_events(sequence_id);
CREATE INDEX IF NOT EXISTS idx_outreach_events_sent_at ON outreach_events(sent_at);
CREATE INDEX IF NOT EXISTS idx_outreach_events_smartlead ON outreach_events(smartlead_campaign_id, smartlead_lead_id);

-- ============================================================================
-- ELEMENT TAGGING
-- ============================================================================

-- Tag each outreach event with its content elements
CREATE TABLE IF NOT EXISTS outreach_element_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_event_id UUID NOT NULL REFERENCES outreach_events(id) ON DELETE CASCADE,
  element_type_id UUID NOT NULL REFERENCES content_element_types(id),

  -- Additional context
  confidence DECIMAL(3,2) DEFAULT 1.0, -- How confident are we in this tag
  extracted_text TEXT, -- The actual text that matched this element
  position_in_email TEXT, -- 'opener', 'body', 'close'

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(outreach_event_id, element_type_id, position_in_email)
);

CREATE INDEX IF NOT EXISTS idx_outreach_element_tags_event ON outreach_element_tags(outreach_event_id);
CREATE INDEX IF NOT EXISTS idx_outreach_element_tags_type ON outreach_element_tags(element_type_id);

-- ============================================================================
-- ENGAGEMENT EVENT TRACKING
-- ============================================================================

-- Track all engagement events (opens, clicks, replies, etc.)
CREATE TABLE IF NOT EXISTS engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  outreach_event_id UUID REFERENCES outreach_events(id),
  lead_id UUID REFERENCES leads(id),

  -- Event details
  event_type TEXT NOT NULL, -- 'open', 'click', 'reply', 'bounce', 'unsubscribe', 'positive_reply', 'negative_reply', 'meeting_booked'
  event_source TEXT NOT NULL, -- 'smartlead', 'manual', 'webhook'

  -- For replies
  reply_text TEXT,
  reply_sentiment TEXT, -- 'positive', 'negative', 'neutral', 'ooo'
  interest_level TEXT, -- 'hot', 'warm', 'cold', 'not_interested'

  -- Webhook data
  raw_payload JSONB,

  -- Timing
  occurred_at TIMESTAMPTZ DEFAULT NOW(),

  -- Attribution
  attributed_to_email_position INTEGER, -- Which email in sequence triggered this
  days_since_first_email INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_events_tenant ON engagement_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_outreach ON engagement_events(outreach_event_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_lead ON engagement_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_type ON engagement_events(event_type);
CREATE INDEX IF NOT EXISTS idx_engagement_events_occurred ON engagement_events(occurred_at);

-- ============================================================================
-- ELEMENT PERFORMANCE AGGREGATION
-- ============================================================================

-- Aggregated performance metrics per content element
CREATE TABLE IF NOT EXISTS element_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  element_type_id UUID NOT NULL REFERENCES content_element_types(id),

  -- Time window
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Volume
  times_used INTEGER DEFAULT 0,
  unique_leads INTEGER DEFAULT 0,

  -- Engagement metrics
  open_count INTEGER DEFAULT 0,
  open_rate DECIMAL(5,4) DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  click_rate DECIMAL(5,4) DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  reply_rate DECIMAL(5,4) DEFAULT 0,
  positive_reply_count INTEGER DEFAULT 0,
  positive_reply_rate DECIMAL(5,4) DEFAULT 0,
  meeting_count INTEGER DEFAULT 0,
  meeting_rate DECIMAL(5,4) DEFAULT 0,

  -- Bounce/negative
  bounce_count INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,4) DEFAULT 0,
  unsubscribe_count INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,4) DEFAULT 0,

  -- Calculated scores
  engagement_score DECIMAL(5,2) DEFAULT 0, -- Weighted composite score
  confidence_score DECIMAL(3,2) DEFAULT 0, -- Based on sample size

  -- Segmentation
  persona_type TEXT, -- NULL means all personas
  relationship_type TEXT, -- NULL means all relationships
  email_position INTEGER, -- NULL means all positions

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, element_type_id, period_start, period_end, persona_type, relationship_type, email_position)
);

CREATE INDEX IF NOT EXISTS idx_element_performance_tenant ON element_performance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_element_performance_element ON element_performance(element_type_id);
CREATE INDEX IF NOT EXISTS idx_element_performance_period ON element_performance(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_element_performance_score ON element_performance(engagement_score DESC);

-- ============================================================================
-- ELEMENT COMBINATION PERFORMANCE
-- ============================================================================

-- Track how combinations of elements perform together
CREATE TABLE IF NOT EXISTS element_combo_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- The combination (array of element type IDs)
  element_type_ids UUID[] NOT NULL,
  combo_description TEXT, -- Human readable: "trigger_reference + soft_question + casual_peer"

  -- Time window
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Volume
  times_used INTEGER DEFAULT 0,

  -- Performance
  reply_rate DECIMAL(5,4) DEFAULT 0,
  positive_reply_rate DECIMAL(5,4) DEFAULT 0,
  engagement_score DECIMAL(5,2) DEFAULT 0,

  -- Comparison to individual elements
  lift_vs_individual DECIMAL(5,2) DEFAULT 0, -- % improvement over avg of individual elements

  -- Segmentation
  persona_type TEXT,
  relationship_type TEXT,

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_element_combo_tenant ON element_combo_performance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_element_combo_score ON element_combo_performance(engagement_score DESC);

-- ============================================================================
-- LEARNED PATTERNS
-- ============================================================================

-- Store discovered patterns and insights
CREATE TABLE IF NOT EXISTS learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Pattern identification
  pattern_type TEXT NOT NULL, -- 'high_performer', 'avoid', 'persona_specific', 'combo_synergy'
  pattern_name TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Evidence
  supporting_element_ids UUID[],
  sample_size INTEGER NOT NULL,
  confidence_score DECIMAL(3,2) NOT NULL,

  -- Performance data
  performance_metrics JSONB NOT NULL,
  /*
    Example:
    {
      "reply_rate": 0.15,
      "positive_reply_rate": 0.08,
      "vs_baseline": "+45%",
      "statistical_significance": 0.95
    }
  */

  -- Context
  applicable_personas TEXT[], -- NULL means all
  applicable_relationships TEXT[], -- NULL means all
  applicable_positions INTEGER[], -- NULL means all

  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'retired', 'testing'
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_validated_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learned_patterns_tenant ON learned_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_type ON learned_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_status ON learned_patterns(status);

-- ============================================================================
-- EXPERIMENTS (A/B TESTING)
-- ============================================================================

-- Track experiments and their results
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Experiment definition
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  description TEXT,

  -- Variants
  control_description TEXT NOT NULL,
  variant_description TEXT NOT NULL,
  control_element_ids UUID[],
  variant_element_ids UUID[],

  -- Targeting
  target_personas TEXT[],
  target_relationships TEXT[],
  target_positions INTEGER[],
  traffic_split DECIMAL(3,2) DEFAULT 0.5, -- % going to variant

  -- Status
  status TEXT DEFAULT 'draft', -- 'draft', 'running', 'paused', 'completed', 'cancelled'

  -- Results
  control_sample_size INTEGER DEFAULT 0,
  variant_sample_size INTEGER DEFAULT 0,
  control_metrics JSONB,
  variant_metrics JSONB,
  winner TEXT, -- 'control', 'variant', 'no_difference', NULL
  statistical_significance DECIMAL(3,2),

  -- Timing
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiments_tenant ON experiments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);

-- ============================================================================
-- BASELINE METRICS
-- ============================================================================

-- Store baseline metrics for comparison
CREATE TABLE IF NOT EXISTS baseline_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Scope
  metric_type TEXT NOT NULL, -- 'overall', 'persona', 'relationship', 'position'
  scope_value TEXT, -- The specific persona/relationship/position, NULL for overall

  -- Time window
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Metrics
  total_sent INTEGER DEFAULT 0,
  open_rate DECIMAL(5,4) DEFAULT 0,
  click_rate DECIMAL(5,4) DEFAULT 0,
  reply_rate DECIMAL(5,4) DEFAULT 0,
  positive_reply_rate DECIMAL(5,4) DEFAULT 0,
  bounce_rate DECIMAL(5,4) DEFAULT 0,
  unsubscribe_rate DECIMAL(5,4) DEFAULT 0,
  meeting_rate DECIMAL(5,4) DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, metric_type, scope_value, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_baseline_metrics_tenant ON baseline_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_baseline_metrics_type ON baseline_metrics(metric_type);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Top performing elements by category
CREATE OR REPLACE VIEW v_top_elements_by_category AS
SELECT
  ep.tenant_id,
  cet.category,
  cet.element_type,
  cet.description,
  ep.times_used,
  ep.reply_rate,
  ep.positive_reply_rate,
  ep.engagement_score,
  ep.confidence_score,
  RANK() OVER (PARTITION BY ep.tenant_id, cet.category ORDER BY ep.engagement_score DESC) as rank_in_category
FROM element_performance ep
JOIN content_element_types cet ON ep.element_type_id = cet.id
WHERE ep.period_end >= CURRENT_DATE - INTERVAL '30 days'
  AND ep.times_used >= 10
  AND ep.persona_type IS NULL  -- Overall metrics
  AND ep.relationship_type IS NULL
  AND ep.email_position IS NULL;

-- View: Element performance by persona
CREATE OR REPLACE VIEW v_element_performance_by_persona AS
SELECT
  ep.tenant_id,
  ep.persona_type,
  cet.category,
  cet.element_type,
  ep.times_used,
  ep.reply_rate,
  ep.positive_reply_rate,
  ep.engagement_score,
  ep.confidence_score
FROM element_performance ep
JOIN content_element_types cet ON ep.element_type_id = cet.id
WHERE ep.period_end >= CURRENT_DATE - INTERVAL '30 days'
  AND ep.persona_type IS NOT NULL
  AND ep.times_used >= 5;

-- View: Recent engagement summary
CREATE OR REPLACE VIEW v_recent_engagement_summary AS
SELECT
  tenant_id,
  DATE(occurred_at) as event_date,
  event_type,
  COUNT(*) as event_count,
  COUNT(DISTINCT lead_id) as unique_leads
FROM engagement_events
WHERE occurred_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY tenant_id, DATE(occurred_at), event_type
ORDER BY event_date DESC, event_count DESC;

-- View: Sequence performance
CREATE OR REPLACE VIEW v_sequence_performance AS
SELECT
  oe.tenant_id,
  oe.sequence_id,
  oe.persona_type,
  oe.relationship_type,
  COUNT(DISTINCT oe.id) as emails_sent,
  COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.outreach_event_id END) as opens,
  COUNT(DISTINCT CASE WHEN ee.event_type = 'reply' THEN ee.outreach_event_id END) as replies,
  COUNT(DISTINCT CASE WHEN ee.event_type IN ('positive_reply', 'meeting_booked') THEN ee.outreach_event_id END) as positive_outcomes,
  ROUND(COUNT(DISTINCT CASE WHEN ee.event_type = 'reply' THEN ee.outreach_event_id END)::DECIMAL /
        NULLIF(COUNT(DISTINCT oe.id), 0), 4) as reply_rate
FROM outreach_events oe
LEFT JOIN engagement_events ee ON oe.id = ee.outreach_event_id
GROUP BY oe.tenant_id, oe.sequence_id, oe.persona_type, oe.relationship_type;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Calculate engagement score
CREATE OR REPLACE FUNCTION calculate_engagement_score(
  p_open_rate DECIMAL,
  p_click_rate DECIMAL,
  p_reply_rate DECIMAL,
  p_positive_reply_rate DECIMAL,
  p_meeting_rate DECIMAL,
  p_bounce_rate DECIMAL,
  p_unsubscribe_rate DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
  -- Weighted score: replies and positive outcomes are most valuable
  -- Bounces and unsubscribes are negative
  RETURN (
    (COALESCE(p_open_rate, 0) * 5) +      -- Opens worth 5 points
    (COALESCE(p_click_rate, 0) * 10) +     -- Clicks worth 10 points
    (COALESCE(p_reply_rate, 0) * 30) +     -- Replies worth 30 points
    (COALESCE(p_positive_reply_rate, 0) * 40) + -- Positive replies worth 40 points
    (COALESCE(p_meeting_rate, 0) * 50) -   -- Meetings worth 50 points
    (COALESCE(p_bounce_rate, 0) * 20) -    -- Bounces subtract 20 points
    (COALESCE(p_unsubscribe_rate, 0) * 30) -- Unsubscribes subtract 30 points
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Calculate confidence score based on sample size
CREATE OR REPLACE FUNCTION calculate_confidence_score(
  p_sample_size INTEGER,
  p_min_sample INTEGER DEFAULT 30,
  p_high_confidence_sample INTEGER DEFAULT 100
) RETURNS DECIMAL AS $$
BEGIN
  IF p_sample_size < p_min_sample THEN
    RETURN ROUND(p_sample_size::DECIMAL / p_min_sample * 0.5, 2);
  ELSIF p_sample_size >= p_high_confidence_sample THEN
    RETURN 1.0;
  ELSE
    RETURN ROUND(0.5 + (p_sample_size - p_min_sample)::DECIMAL /
                 (p_high_confidence_sample - p_min_sample) * 0.5, 2);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Refresh element performance for a tenant
CREATE OR REPLACE FUNCTION refresh_element_performance(
  p_tenant_id UUID,
  p_period_start DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_period_end DATE DEFAULT CURRENT_DATE
) RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER := 0;
BEGIN
  -- Delete existing records for this period
  DELETE FROM element_performance
  WHERE tenant_id = p_tenant_id
    AND period_start = p_period_start
    AND period_end = p_period_end;

  -- Insert fresh aggregations
  INSERT INTO element_performance (
    tenant_id, element_type_id, period_start, period_end,
    times_used, unique_leads,
    open_count, open_rate,
    reply_count, reply_rate,
    positive_reply_count, positive_reply_rate,
    bounce_count, bounce_rate,
    engagement_score, confidence_score
  )
  SELECT
    p_tenant_id,
    oet.element_type_id,
    p_period_start,
    p_period_end,
    COUNT(DISTINCT oe.id) as times_used,
    COUNT(DISTINCT oe.lead_id) as unique_leads,
    COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.id END) as open_count,
    ROUND(COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.outreach_event_id END)::DECIMAL /
          NULLIF(COUNT(DISTINCT oe.id), 0), 4) as open_rate,
    COUNT(DISTINCT CASE WHEN ee.event_type = 'reply' THEN ee.id END) as reply_count,
    ROUND(COUNT(DISTINCT CASE WHEN ee.event_type = 'reply' THEN ee.outreach_event_id END)::DECIMAL /
          NULLIF(COUNT(DISTINCT oe.id), 0), 4) as reply_rate,
    COUNT(DISTINCT CASE WHEN ee.event_type IN ('positive_reply', 'meeting_booked') THEN ee.id END) as positive_reply_count,
    ROUND(COUNT(DISTINCT CASE WHEN ee.event_type IN ('positive_reply', 'meeting_booked') THEN ee.outreach_event_id END)::DECIMAL /
          NULLIF(COUNT(DISTINCT oe.id), 0), 4) as positive_reply_rate,
    COUNT(DISTINCT CASE WHEN ee.event_type = 'bounce' THEN ee.id END) as bounce_count,
    ROUND(COUNT(DISTINCT CASE WHEN ee.event_type = 'bounce' THEN ee.outreach_event_id END)::DECIMAL /
          NULLIF(COUNT(DISTINCT oe.id), 0), 4) as bounce_rate,
    calculate_engagement_score(
      ROUND(COUNT(DISTINCT CASE WHEN ee.event_type = 'open' THEN ee.outreach_event_id END)::DECIMAL / NULLIF(COUNT(DISTINCT oe.id), 0), 4),
      0, -- click_rate
      ROUND(COUNT(DISTINCT CASE WHEN ee.event_type = 'reply' THEN ee.outreach_event_id END)::DECIMAL / NULLIF(COUNT(DISTINCT oe.id), 0), 4),
      ROUND(COUNT(DISTINCT CASE WHEN ee.event_type IN ('positive_reply', 'meeting_booked') THEN ee.outreach_event_id END)::DECIMAL / NULLIF(COUNT(DISTINCT oe.id), 0), 4),
      0, -- meeting_rate
      ROUND(COUNT(DISTINCT CASE WHEN ee.event_type = 'bounce' THEN ee.outreach_event_id END)::DECIMAL / NULLIF(COUNT(DISTINCT oe.id), 0), 4),
      0  -- unsubscribe_rate
    ) as engagement_score,
    calculate_confidence_score(COUNT(DISTINCT oe.id)::INTEGER) as confidence_score
  FROM outreach_element_tags oet
  JOIN outreach_events oe ON oet.outreach_event_id = oe.id
  LEFT JOIN engagement_events ee ON oe.id = ee.outreach_event_id
  WHERE oe.tenant_id = p_tenant_id
    AND oe.sent_at >= p_period_start
    AND oe.sent_at <= p_period_end
  GROUP BY oet.element_type_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get recommended elements for a context
CREATE OR REPLACE FUNCTION get_recommended_elements(
  p_tenant_id UUID,
  p_category TEXT,
  p_persona_type TEXT DEFAULT NULL,
  p_relationship_type TEXT DEFAULT NULL,
  p_email_position INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
) RETURNS TABLE (
  element_type TEXT,
  description TEXT,
  engagement_score DECIMAL,
  confidence_score DECIMAL,
  times_used INTEGER,
  reply_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cet.element_type,
    cet.description,
    ep.engagement_score,
    ep.confidence_score,
    ep.times_used,
    ep.reply_rate
  FROM element_performance ep
  JOIN content_element_types cet ON ep.element_type_id = cet.id
  WHERE ep.tenant_id = p_tenant_id
    AND cet.category = p_category
    AND ep.period_end >= CURRENT_DATE - INTERVAL '30 days'
    AND ep.times_used >= 5
    AND (p_persona_type IS NULL OR ep.persona_type = p_persona_type OR ep.persona_type IS NULL)
    AND (p_relationship_type IS NULL OR ep.relationship_type = p_relationship_type OR ep.relationship_type IS NULL)
    AND (p_email_position IS NULL OR ep.email_position = p_email_position OR ep.email_position IS NULL)
  ORDER BY
    CASE WHEN ep.persona_type IS NOT NULL THEN 1 ELSE 2 END, -- Prefer specific matches
    ep.engagement_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_learning_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables that need it
DROP TRIGGER IF EXISTS trg_element_performance_timestamp ON element_performance;
CREATE TRIGGER trg_element_performance_timestamp
  BEFORE UPDATE ON element_performance
  FOR EACH ROW EXECUTE FUNCTION update_learning_timestamp();

DROP TRIGGER IF EXISTS trg_experiments_timestamp ON experiments;
CREATE TRIGGER trg_experiments_timestamp
  BEFORE UPDATE ON experiments
  FOR EACH ROW EXECUTE FUNCTION update_learning_timestamp();

DROP TRIGGER IF EXISTS trg_baseline_metrics_timestamp ON baseline_metrics;
CREATE TRIGGER trg_baseline_metrics_timestamp
  BEFORE UPDATE ON baseline_metrics
  FOR EACH ROW EXECUTE FUNCTION update_learning_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE content_element_types IS 'Taxonomy of content elements for email tracking';
COMMENT ON TABLE outreach_events IS 'Every email sent with full content snapshot';
COMMENT ON TABLE outreach_element_tags IS 'Tags linking outreach events to content elements';
COMMENT ON TABLE engagement_events IS 'All engagement events from email recipients';
COMMENT ON TABLE element_performance IS 'Aggregated performance metrics per content element';
COMMENT ON TABLE element_combo_performance IS 'Performance of element combinations';
COMMENT ON TABLE learned_patterns IS 'Discovered patterns and insights for optimization';
COMMENT ON TABLE experiments IS 'A/B test definitions and results';
COMMENT ON TABLE baseline_metrics IS 'Baseline metrics for performance comparison';

COMMENT ON FUNCTION calculate_engagement_score IS 'Calculates weighted engagement score from metrics';
COMMENT ON FUNCTION calculate_confidence_score IS 'Calculates confidence based on sample size';
COMMENT ON FUNCTION refresh_element_performance IS 'Refreshes element performance aggregations';
COMMENT ON FUNCTION get_recommended_elements IS 'Gets top performing elements for a context';
