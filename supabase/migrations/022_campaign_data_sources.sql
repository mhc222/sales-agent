-- Migration: Campaign-centric data sources
-- Move data source configuration from tenant level to campaign level
-- Hierarchy: Tenant → Brand (ICP) → Campaign (data source + channels) → Leads

-- Add data source configuration to campaigns
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS data_source_type VARCHAR
  CHECK (data_source_type IN ('intent', 'pixel', 'apollo', 'csv', 'manual')),
ADD COLUMN IF NOT EXISTS data_source_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS auto_ingest BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_ingested_at TIMESTAMP;

-- Add comment explaining data_source_config structure
COMMENT ON COLUMN campaigns.data_source_config IS 'Config varies by type:
  intent: { api_url, api_key }
  pixel: { api_url, api_key }
  apollo: { api_key, saved_search_id? }
  csv: { last_upload_at? }
  manual: {}';

-- Index for active campaign queries with auto_ingest
-- This index is critical for the cron job that iterates active campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_active_ingest
ON campaigns(tenant_id, status, auto_ingest)
WHERE status = 'active' AND auto_ingest = true;

-- Ensure leads have campaign_id index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_leads_campaign
ON leads(campaign_id) WHERE campaign_id IS NOT NULL;

-- Add index for campaign + status queries on leads
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status
ON leads(campaign_id, status) WHERE campaign_id IS NOT NULL;
