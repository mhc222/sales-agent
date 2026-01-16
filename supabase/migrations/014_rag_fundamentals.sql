-- ============================================================================
-- RAG FUNDAMENTALS MIGRATION
-- Adds new rag_types for 3-tier architecture + tenant settings
-- ============================================================================

-- ============================================================================
-- NEW RAG TYPES SUPPORTED:
-- ============================================================================
-- 'fundamental_email'      - Email writing best practices (universal)
-- 'fundamental_intent'     - Intent signal definitions (universal)
-- 'fundamental_framework'  - Frameworks like TIPS, prioritization (universal)
-- 'fundamental_sequence'   - Sequence strategy (universal)
-- 'prompt_research'        - AI prompts for persona/ICP research
-- 'prompt_email'           - AI prompts for email generation
-- 'prompt_content'         - AI prompts for content creation
--
-- NOTE: rag_type is VARCHAR, so no enum update needed. Documents with NULL
-- tenant_id are considered global/fundamental (shared across all brands).

-- ============================================================================
-- TENANT SETTINGS COLUMN
-- ============================================================================
-- Add settings JSONB column for brand-specific configuration

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Add comment to document the schema
COMMENT ON COLUMN tenants.settings IS 'Brand-specific configuration including:
{
  "email_provider": "smartlead" | "zapmail" | "instantly" | etc,
  "email_provider_config": { api_key, campaign_defaults, etc },
  "linkedin_provider": "heyreach" | "phantombuster" | etc,
  "linkedin_provider_config": { ... },
  "research_sources": ["linkedin", "perplexity", "audiencelab"],
  "enabled_channels": ["email", "linkedin"]
}';

-- ============================================================================
-- ALLOW NULL TENANT_ID FOR FUNDAMENTALS
-- ============================================================================
-- Modify rag_documents to allow NULL tenant_id for global/fundamental documents

ALTER TABLE rag_documents ALTER COLUMN tenant_id DROP NOT NULL;

-- Add index for querying fundamentals (where tenant_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_rag_fundamentals
ON rag_documents(rag_type)
WHERE tenant_id IS NULL;

-- ============================================================================
-- SET DEFAULT SETTINGS FOR JSB MEDIA
-- ============================================================================

UPDATE tenants
SET settings = '{
  "email_provider": "smartlead",
  "email_provider_config": {},
  "linkedin_provider": "heyreach",
  "linkedin_provider_config": {},
  "research_sources": ["linkedin", "perplexity", "audiencelab"],
  "enabled_channels": ["email", "linkedin"]
}'::jsonb
WHERE slug = 'jsb-media';
