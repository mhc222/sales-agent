-- ============================================================================
-- INTENT DATA SUPPORT
-- Adds scoring and tracking for daily intent data leads
-- ============================================================================

-- Add 'intent_data' to source constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads
ADD CONSTRAINT leads_source_check
CHECK (source IN ('jsb_site_pixel', 'audience_lab', 'apollo_search', 'linkedin_search', 'manual', 'intent_data'));

-- Add intent scoring columns to leads
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS intent_score INTEGER DEFAULT NULL;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS intent_signals JSONB DEFAULT NULL;

-- Comments for documentation
COMMENT ON COLUMN leads.intent_score IS 'ICP fit score 0-100 (industry + revenue + title + company size + data quality)';
COMMENT ON COLUMN leads.intent_signals IS 'Raw intent data from AudienceLab intent segment';

-- Index for sorting by score
CREATE INDEX IF NOT EXISTS idx_leads_intent_score ON leads(intent_score DESC NULLS LAST);

-- Index for filtering intent leads by date
CREATE INDEX IF NOT EXISTS idx_leads_source_created ON leads(source, created_at DESC);

-- ============================================================================
-- INTENT DATA TABLE (raw ingestion log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS intent_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  intent_score INTEGER,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  batch_date DATE DEFAULT CURRENT_DATE,
  processed BOOLEAN DEFAULT FALSE,
  auto_researched BOOLEAN DEFAULT FALSE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intent_data_email ON intent_data(email);
CREATE INDEX IF NOT EXISTS idx_intent_data_batch_date ON intent_data(batch_date);
CREATE INDEX IF NOT EXISTS idx_intent_data_score ON intent_data(intent_score DESC NULLS LAST);

-- Comments
COMMENT ON TABLE intent_data IS 'Raw daily intent data ingestion log from AudienceLab';
COMMENT ON COLUMN intent_data.batch_date IS 'Date of the daily batch (for grouping)';
COMMENT ON COLUMN intent_data.auto_researched IS 'True if this lead was in top 20 and auto-triggered for research';
