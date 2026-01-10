-- ============================================================================
-- VISIT TRACKING & QUALIFICATION STORAGE
-- ============================================================================

-- Add visit tracking and system presence flags to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS visit_count INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS in_ghl BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS in_ghl_company BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS in_smartlead BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS in_heyreach BOOLEAN DEFAULT FALSE;

-- Add qualification result storage to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS qualification_decision VARCHAR,
ADD COLUMN IF NOT EXISTS qualification_reasoning TEXT,
ADD COLUMN IF NOT EXISTS qualification_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS icp_fit VARCHAR;

-- ============================================================================
-- PIXEL_VISITS TABLE (Individual visit history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pixel_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Visit data
  page_visited VARCHAR,
  time_on_page INT,
  event_type VARCHAR,
  referrer VARCHAR,

  -- Raw event data from AudienceLab
  raw_event_data JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pixel_visits_lead ON pixel_visits(lead_id);
CREATE INDEX idx_pixel_visits_tenant ON pixel_visits(tenant_id);
CREATE INDEX idx_pixel_visits_created ON pixel_visits(created_at DESC);

-- ============================================================================
-- VIEW: Lead Summary with Visit Stats
-- ============================================================================
CREATE OR REPLACE VIEW lead_summary AS
SELECT
  l.id,
  l.tenant_id,
  l.email,
  l.first_name,
  l.last_name,
  l.job_title,
  l.company_name,
  l.company_industry,
  l.company_employee_count,
  l.company_revenue,
  l.status,
  l.visit_count,
  l.first_seen_at,
  l.last_seen_at,
  l.in_ghl,
  l.in_smartlead,
  l.in_heyreach,
  l.qualification_decision,
  l.qualification_confidence,
  l.icp_fit,
  l.created_at,
  l.updated_at
FROM leads l
ORDER BY l.last_seen_at DESC;
