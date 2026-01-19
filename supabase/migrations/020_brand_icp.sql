-- ============================================================================
-- BRAND-LEVEL ICP (Ideal Customer Profile)
-- Allows each brand to have its own ICP, with tenant-level as fallback
-- ============================================================================

-- Add ICP columns to brands table
ALTER TABLE brands
ADD COLUMN IF NOT EXISTS icp JSONB,
ADD COLUMN IF NOT EXISTS icp_source_url TEXT,
ADD COLUMN IF NOT EXISTS icp_research_completed_at TIMESTAMP;

-- Add comment for documentation
COMMENT ON COLUMN brands.icp IS 'Brand-specific Ideal Customer Profile (JSON structure matches tenant ICP: account_criteria, personas, triggers)';
COMMENT ON COLUMN brands.icp_source_url IS 'Source URL used for brand ICP research (e.g., brand website or product page)';
COMMENT ON COLUMN brands.icp_research_completed_at IS 'When the brand ICP was last researched/updated';

-- Index for fast lookup of brands with ICP
CREATE INDEX IF NOT EXISTS idx_brands_icp ON brands(tenant_id, id) WHERE icp IS NOT NULL;

-- Index for finding brands that need ICP research
CREATE INDEX IF NOT EXISTS idx_brands_no_icp ON brands(tenant_id) WHERE icp IS NULL AND is_active = true;
