-- ============================================================================
-- MULTI-TENANT DATA SOURCES MIGRATION
-- Adds Apollo saved searches and formalizes tenant data source settings
-- ============================================================================

-- ============================================================================
-- APOLLO SAVED SEARCHES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS apollo_saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  description TEXT,
  search_params JSONB NOT NULL,  -- { jobTitles, industry, locations, employeeRange }
  nl_query TEXT,                  -- Original natural language query
  schedule_cron VARCHAR,          -- NULL = manual only, '0 9 * * *' = daily
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP,
  last_result_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for querying saved searches
CREATE INDEX idx_apollo_searches_tenant ON apollo_saved_searches(tenant_id);
CREATE INDEX idx_apollo_searches_enabled ON apollo_saved_searches(enabled) WHERE enabled = true;
CREATE INDEX idx_apollo_searches_scheduled ON apollo_saved_searches(schedule_cron) WHERE schedule_cron IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY FOR APOLLO SAVED SEARCHES
-- ============================================================================
ALTER TABLE apollo_saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view saved searches for their tenants" ON apollo_saved_searches
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage saved searches for their tenants" ON apollo_saved_searches
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

-- ============================================================================
-- INDEX FOR QUERYING TENANTS BY ENABLED DATA SOURCES
-- ============================================================================
CREATE INDEX idx_tenants_data_sources ON tenants
  USING gin ((settings->'data_sources'->'enabled'));

-- ============================================================================
-- UPDATE TENANT SETTINGS SCHEMA COMMENT
-- ============================================================================
COMMENT ON COLUMN tenants.settings IS 'Tenant configuration including:
{
  "integrations": {
    "apollo": { "api_key": "...", "enabled": true },
    "smartlead": { "api_key": "...", "campaign_id": "..." },
    "instantly": { "api_key": "..." },
    "heyreach": { "api_key": "..." },
    "pixel": { "api_url": "...", "api_key": "...", "enabled": true },
    "intent": { "api_url": "...", "api_key": "...", "enabled": true }
  },
  "data_sources": {
    "enabled": ["apollo", "pixel", "intent"],
    "auto_research_limit": 20,
    "min_intent_score": 60
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
-- FUNCTION: Update apollo_saved_searches updated_at on update
-- ============================================================================
CREATE OR REPLACE FUNCTION update_apollo_searches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_apollo_searches_updated_at
  BEFORE UPDATE ON apollo_saved_searches
  FOR EACH ROW EXECUTE FUNCTION update_apollo_searches_updated_at();
