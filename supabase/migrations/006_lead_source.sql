-- ============================================================================
-- ADD SOURCE COLUMN TO LEADS
-- Tracks where the lead originated from
-- ============================================================================

-- Add source column
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'jsb_site_pixel';

-- Add constraint for valid values
ALTER TABLE leads
ADD CONSTRAINT leads_source_check
CHECK (source IN ('jsb_site_pixel', 'audience_lab', 'apollo_search', 'linkedin_search', 'manual'));

-- Comment for documentation
COMMENT ON COLUMN leads.source IS 'Lead source: jsb_site_pixel, audience_lab, apollo_search, linkedin_search, manual';

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
