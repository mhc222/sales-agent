-- ============================================================================
-- BRANDS & CAMPAIGNS STRUCTURE
-- Account → Brand → Campaign hierarchy
-- ============================================================================

-- ============================================================================
-- BRANDS TABLE
-- A brand represents a company/product being sold
-- All RAG data (messaging, playbooks) lives at the brand level
-- ============================================================================

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Brand Identity
  name VARCHAR NOT NULL,
  description TEXT,
  website VARCHAR,
  logo_url VARCHAR,

  -- Brand Voice & Messaging
  voice_tone VARCHAR DEFAULT 'professional', -- professional, casual, formal, friendly
  value_proposition TEXT,
  key_differentiators TEXT[],
  target_industries TEXT[],
  target_titles TEXT[],

  -- Company Info (for context)
  company_size VARCHAR, -- startup, smb, mid-market, enterprise
  founded_year INTEGER,
  headquarters VARCHAR,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_brands_tenant ON brands(tenant_id);
CREATE INDEX idx_brands_active ON brands(tenant_id, is_active);

-- ============================================================================
-- CAMPAIGNS TABLE
-- A campaign is a specific outreach effort under a brand
-- Has its own mode (email_only, linkedin_only, multi_channel) and instructions
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Campaign Identity
  name VARCHAR NOT NULL,
  description TEXT,

  -- Campaign Mode
  mode campaign_mode NOT NULL DEFAULT 'email_only',

  -- Campaign-Specific Instructions (overrides brand defaults)
  custom_instructions TEXT, -- AI instructions for this specific campaign
  target_persona TEXT, -- Who this campaign targets
  primary_angle TEXT, -- Main messaging angle for this campaign

  -- Email Settings (for email_only or multi_channel)
  email_count INTEGER DEFAULT 7,
  email_tone VARCHAR, -- override brand tone
  email_cta VARCHAR, -- primary call to action

  -- LinkedIn Settings (for linkedin_only or multi_channel)
  linkedin_count INTEGER DEFAULT 4,
  linkedin_connection_note_enabled BOOLEAN DEFAULT true,

  -- Multi-Channel Settings
  linkedin_first BOOLEAN DEFAULT false, -- Start with LinkedIn or email?
  wait_for_connection BOOLEAN DEFAULT true, -- Wait for LinkedIn accept before certain emails?
  connection_timeout_hours INTEGER DEFAULT 72,

  -- Platform Integration
  smartlead_campaign_id VARCHAR,
  heyreach_campaign_id VARCHAR,

  -- Status
  status VARCHAR DEFAULT 'draft', -- draft, active, paused, completed
  is_active BOOLEAN DEFAULT true,

  -- Stats (denormalized for quick access)
  total_leads INTEGER DEFAULT 0,
  leads_contacted INTEGER DEFAULT 0,
  leads_replied INTEGER DEFAULT 0,
  leads_converted INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  activated_at TIMESTAMP,
  paused_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_campaigns_brand ON campaigns(brand_id);
CREATE INDEX idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX idx_campaigns_status ON campaigns(brand_id, status);
CREATE INDEX idx_campaigns_mode ON campaigns(brand_id, mode);

-- ============================================================================
-- UPDATE RAG_DOCUMENTS TABLE
-- Add brand_id to associate RAG with brands
-- ============================================================================

ALTER TABLE rag_documents
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;

-- Index for brand-level RAG lookup
CREATE INDEX IF NOT EXISTS idx_rag_documents_brand ON rag_documents(brand_id);

-- ============================================================================
-- UPDATE LEADS TABLE
-- Add campaign_id and brand_id
-- ============================================================================

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_brand ON leads(brand_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);

-- ============================================================================
-- UPDATE MULTICHANNEL_SEQUENCES TABLE
-- Add campaign_id reference
-- ============================================================================

ALTER TABLE multichannel_sequences
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_multichannel_sequences_campaign ON multichannel_sequences(campaign_id);

-- ============================================================================
-- UPDATE ORCHESTRATION_STATE TABLE
-- Add campaign_id reference
-- ============================================================================

ALTER TABLE orchestration_state
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orchestration_state_campaign ON orchestration_state(campaign_id);

-- ============================================================================
-- CAMPAIGN TEMPLATES
-- Pre-built campaign configurations that can be cloned
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = global template

  -- Template Info
  name VARCHAR NOT NULL,
  description TEXT,
  mode campaign_mode NOT NULL,

  -- Template Configuration (same as campaigns)
  custom_instructions TEXT,
  target_persona TEXT,
  primary_angle TEXT,

  email_count INTEGER DEFAULT 7,
  linkedin_count INTEGER DEFAULT 4,
  linkedin_first BOOLEAN DEFAULT false,
  wait_for_connection BOOLEAN DEFAULT true,
  connection_timeout_hours INTEGER DEFAULT 72,

  -- Categorization
  category VARCHAR, -- 'aggressive', 'nurture', 'high-touch', etc.
  tags TEXT[],

  -- Usage tracking
  times_used INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_campaign_templates_tenant ON campaign_templates(tenant_id);
CREATE INDEX idx_campaign_templates_mode ON campaign_templates(mode);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Brand overview with campaign counts
CREATE OR REPLACE VIEW brand_overview AS
SELECT
  b.id,
  b.tenant_id,
  b.name,
  b.description,
  b.is_active,
  COUNT(DISTINCT c.id) as campaign_count,
  COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_campaigns,
  COUNT(DISTINCT l.id) as total_leads,
  SUM(c.leads_converted) as total_conversions,
  b.created_at
FROM brands b
LEFT JOIN campaigns c ON c.brand_id = b.id
LEFT JOIN leads l ON l.brand_id = b.id
GROUP BY b.id;

-- Campaign performance summary
CREATE OR REPLACE VIEW campaign_performance AS
SELECT
  c.id,
  c.brand_id,
  c.tenant_id,
  c.name,
  c.mode,
  c.status,
  c.total_leads,
  c.leads_contacted,
  c.leads_replied,
  c.leads_converted,
  CASE WHEN c.leads_contacted > 0
    THEN ROUND(c.leads_replied::numeric / c.leads_contacted * 100, 2)
    ELSE 0
  END as reply_rate,
  CASE WHEN c.leads_contacted > 0
    THEN ROUND(c.leads_converted::numeric / c.leads_contacted * 100, 2)
    ELSE 0
  END as conversion_rate,
  c.created_at,
  c.activated_at,
  b.name as brand_name
FROM campaigns c
JOIN brands b ON b.id = c.brand_id;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to clone a campaign template
CREATE OR REPLACE FUNCTION clone_campaign_template(
  p_template_id UUID,
  p_brand_id UUID,
  p_name VARCHAR
) RETURNS UUID AS $$
DECLARE
  v_campaign_id UUID;
  v_tenant_id UUID;
BEGIN
  -- Get tenant from brand
  SELECT tenant_id INTO v_tenant_id FROM brands WHERE id = p_brand_id;

  -- Create campaign from template
  INSERT INTO campaigns (
    brand_id, tenant_id, name, mode, custom_instructions, target_persona,
    primary_angle, email_count, linkedin_count, linkedin_first,
    wait_for_connection, connection_timeout_hours, status
  )
  SELECT
    p_brand_id, v_tenant_id, p_name, mode, custom_instructions, target_persona,
    primary_angle, email_count, linkedin_count, linkedin_first,
    wait_for_connection, connection_timeout_hours, 'draft'
  FROM campaign_templates
  WHERE id = p_template_id
  RETURNING id INTO v_campaign_id;

  -- Update template usage count
  UPDATE campaign_templates
  SET times_used = times_used + 1
  WHERE id = p_template_id;

  RETURN v_campaign_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DEFAULT CAMPAIGN TEMPLATES
-- ============================================================================

INSERT INTO campaign_templates (name, description, mode, custom_instructions, target_persona, primary_angle, email_count, linkedin_count, linkedin_first, wait_for_connection, category, tags)
VALUES
  (
    'Standard Email Sequence',
    '7-touch email sequence following TIPS framework',
    'email_only',
    'Follow TIPS framework strictly. Focus on value, not features. Keep emails under 100 words.',
    'Decision makers at target companies',
    'Problem-solution with social proof',
    7, 0, false, false,
    'standard',
    ARRAY['email', 'tips', 'standard']
  ),
  (
    'LinkedIn Nurture',
    '4-touch LinkedIn sequence for relationship building',
    'linkedin_only',
    'Start conversations, not pitches. Ask permission. Keep messages under 60 words.',
    'Engaged professionals in target market',
    'Relationship-first approach',
    0, 4, true, false,
    'nurture',
    ARRAY['linkedin', 'nurture', 'relationship']
  ),
  (
    'Multi-Channel Blitz',
    'Coordinated email + LinkedIn for maximum touchpoints',
    'multi_channel',
    'Coordinate messaging across channels. Reference cross-channel engagement. Mix value with soft asks.',
    'High-priority prospects',
    'Multi-touch value demonstration',
    7, 4, false, true,
    'aggressive',
    ARRAY['multi-channel', 'high-touch', 'aggressive']
  ),
  (
    'LinkedIn-First Warm',
    'Start with LinkedIn connection, follow up with email',
    'multi_channel',
    'Build LinkedIn rapport before email. Personalize emails based on LinkedIn engagement.',
    'LinkedIn-active professionals',
    'Social proof and relationship building',
    5, 4, true, true,
    'warm',
    ARRAY['multi-channel', 'linkedin-first', 'warm']
  )
ON CONFLICT DO NOTHING;
