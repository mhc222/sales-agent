ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'jsb_site_pixel';
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
