-- GHL CRM Integration
-- Adds GHL contact tracking fields to leads table

-- Add GHL contact ID and sync timestamp to leads
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS ghl_contact_id VARCHAR,
ADD COLUMN IF NOT EXISTS ghl_synced_at TIMESTAMP;

-- Create index for GHL contact lookups
CREATE INDEX IF NOT EXISTS idx_leads_ghl_contact
ON leads(ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN leads.ghl_contact_id IS 'GoHighLevel CRM contact ID for synced leads';
COMMENT ON COLUMN leads.ghl_synced_at IS 'Timestamp of last GHL sync';

-- ============================================================================
-- DNC (Do Not Contact) Brand Support
-- Adds brand_id to allow brand-specific blocklists
-- ============================================================================

-- Add brand_id to do_not_contact table (optional - null means tenant-wide)
ALTER TABLE do_not_contact
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;

-- Create index for brand-level DNC lookups
CREATE INDEX IF NOT EXISTS idx_dnc_brand
ON do_not_contact(brand_id) WHERE brand_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN do_not_contact.brand_id IS 'Optional brand ID for brand-specific DNC entries. NULL means tenant-wide.';
