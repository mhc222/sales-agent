-- ============================================================================
-- BRAND-LEVEL SETTINGS MIGRATION
-- Move all configuration from tenant level to brand level
-- Account → Brand → Campaign hierarchy
-- ============================================================================

-- ============================================================================
-- ADD SETTINGS COLUMN TO BRANDS TABLE
-- ============================================================================

ALTER TABLE brands ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN brands.settings IS 'Brand-specific configuration including:
{
  "integrations": {
    "apollo": { "api_key": "encrypted..." },
    "smartlead": { "api_key": "encrypted...", "campaign_id": "..." },
    "instantly": { "api_key": "encrypted..." },
    "nureply": { "api_key": "encrypted..." },
    "heyreach": { "api_key": "encrypted..." },
    "gohighlevel": { "api_key": "encrypted...", "location_id": "..." }
  },
  "llm_provider": "anthropic" | "openai",
  "llm_config": {
    "api_key": "encrypted...",
    "model": "claude-3-5-sonnet-20241022",
    "temperature": 0.7
  },
  "active_email_provider": "smartlead" | "instantly" | "nureply",
  "active_linkedin_provider": "heyreach",
  "enabled_channels": ["email", "linkedin"],
  "email_provider_config": {},
  "linkedin_provider_config": {},
  "research_sources": ["apollo", "perplexity", "linkedin"]
}';

-- Index for fast lookup of brands with integrations configured
CREATE INDEX IF NOT EXISTS idx_brands_settings ON brands USING gin (settings);

-- ============================================================================
-- MIGRATE EXISTING TENANT SETTINGS TO BRANDS
-- Copy tenant-level settings to all brands belonging to that tenant
-- ============================================================================

-- This will copy settings to existing brands
-- For tenants with no brands, settings remain at tenant level temporarily
UPDATE brands b
SET settings = COALESCE(t.settings, '{}'::jsonb)
FROM tenants t
WHERE b.tenant_id = t.id
  AND t.settings IS NOT NULL
  AND t.settings != '{}'::jsonb;

-- ============================================================================
-- ADD ONBOARDING TRACKING TO USERS TABLE
-- Move onboarding_completed from tenant to user level
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Migrate onboarding_completed from tenant settings to users
-- If a user's tenant has onboarding_completed: true, set it on the user
UPDATE users u
SET onboarding_completed = true
FROM user_tenants ut
JOIN tenants t ON t.id = ut.tenant_id
WHERE ut.user_id = u.id
  AND t.settings->>'onboarding_completed' = 'true';

-- ============================================================================
-- CLEANUP: REMOVE SETTINGS FROM TENANTS (OPTIONAL)
-- Uncomment these lines after verifying the migration worked correctly
-- ============================================================================

-- Keep tenant settings for now as a backup
-- We can remove it in a future migration after verifying everything works

-- ALTER TABLE tenants DROP COLUMN IF EXISTS settings;

-- ============================================================================
-- ADD BRAND STATUS TRACKING
-- Track if a brand has completed its setup wizard
-- ============================================================================

ALTER TABLE brands ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT false;

-- Mark existing brands as setup complete if they have settings
UPDATE brands
SET setup_completed = true
WHERE settings IS NOT NULL AND settings != '{}'::jsonb;

-- ============================================================================
-- UPDATE DNC TABLE TO REFERENCE BRAND
-- Do Not Contact lists should be per-brand, not per-tenant
-- ============================================================================

-- Add brand_id column (nullable for backward compatibility)
ALTER TABLE do_not_contact
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;

-- Create index for brand-level DNC lookups
CREATE INDEX IF NOT EXISTS idx_dnc_brand ON do_not_contact(brand_id) WHERE brand_id IS NOT NULL;

-- Keep tenant_id for now for backward compatibility
-- In the future, we can migrate DNC entries to brands

-- ============================================================================
-- UPDATE CHECK_DNC FUNCTION FOR BRAND-LEVEL LOOKUPS
-- ============================================================================

CREATE OR REPLACE FUNCTION check_dnc_brand(
  p_brand_id UUID,
  p_email VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  v_domain VARCHAR;
  v_tenant_id UUID;
  v_exists BOOLEAN;
BEGIN
  -- Extract domain from email
  v_domain := split_part(p_email, '@', 2);

  -- Get tenant_id from brand
  SELECT tenant_id INTO v_tenant_id FROM brands WHERE id = p_brand_id;

  -- Check if email or domain exists in DNC (brand-level or tenant-level fallback)
  SELECT EXISTS (
    SELECT 1 FROM do_not_contact
    WHERE (brand_id = p_brand_id OR (brand_id IS NULL AND tenant_id = v_tenant_id))
      AND (email = p_email OR domain = v_domain)
  ) INTO v_exists;

  RETURN v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get brand settings with tenant fallback
CREATE OR REPLACE FUNCTION get_brand_settings(
  p_brand_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_settings JSONB;
  v_tenant_id UUID;
  v_tenant_settings JSONB;
BEGIN
  -- Get brand settings
  SELECT settings, tenant_id INTO v_settings, v_tenant_id
  FROM brands
  WHERE id = p_brand_id;

  -- If brand has settings, return them
  IF v_settings IS NOT NULL AND v_settings != '{}'::jsonb THEN
    RETURN v_settings;
  END IF;

  -- Otherwise fallback to tenant settings (temporary during migration)
  SELECT settings INTO v_tenant_settings
  FROM tenants
  WHERE id = v_tenant_id;

  RETURN COALESCE(v_tenant_settings, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATE VIEWS
-- ============================================================================

-- Update brand_overview to include setup status
DROP VIEW IF EXISTS brand_overview;
CREATE OR REPLACE VIEW brand_overview AS
SELECT
  b.id,
  b.tenant_id,
  b.name,
  b.description,
  b.is_active,
  b.setup_completed,
  b.settings IS NOT NULL AND b.settings != '{}'::jsonb as has_settings,
  b.icp IS NOT NULL AND b.icp != '{}'::jsonb as has_icp,
  COUNT(DISTINCT c.id) as campaign_count,
  COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_campaigns,
  COUNT(DISTINCT l.id) as total_leads,
  SUM(c.leads_converted) as total_conversions,
  b.created_at
FROM brands b
LEFT JOIN campaigns c ON c.brand_id = b.id
LEFT JOIN leads l ON l.brand_id = b.id
GROUP BY b.id;

-- ============================================================================
-- NOTES
-- ============================================================================

-- After this migration:
-- 1. Brands have their own settings (integrations, channels, providers)
-- 2. Users have onboarding_completed flag (no longer forced through wizard)
-- 3. Brands have setup_completed flag (wizard is now optional)
-- 4. DNC can be scoped to brand level
-- 5. Tenant settings remain as backup for now (can be removed later)

-- Next steps:
-- 1. Update API endpoints to read/write brand.settings instead of tenant.settings
-- 2. Update frontend to use brand-level configuration
-- 3. Build brand creation/setup wizard
-- 4. Remove forced onboarding from auth flow
