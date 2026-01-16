-- ============================================================================
-- AUTH & USER MANAGEMENT MIGRATION
-- Adds users, user-tenant associations, and do-not-contact list
-- ============================================================================

-- ============================================================================
-- USERS TABLE (Links to Supabase Auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL UNIQUE,
  full_name VARCHAR,
  avatar_url VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- USER_TENANTS TABLE (Many-to-many with roles)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON user_tenants(tenant_id);

-- ============================================================================
-- DO_NOT_CONTACT TABLE (Email/domain blocklist per tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS do_not_contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR,
  domain VARCHAR,
  reason VARCHAR,
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (email IS NOT NULL OR domain IS NOT NULL) -- At least one must be set
);

-- Partial unique indexes (only for non-null values)
CREATE UNIQUE INDEX idx_dnc_tenant_email ON do_not_contact(tenant_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_dnc_tenant_domain ON do_not_contact(tenant_id, domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_dnc_tenant ON do_not_contact(tenant_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE do_not_contact ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User_tenants policies
CREATE POLICY "Users can view their tenant associations" ON user_tenants
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Owners can manage tenant associations" ON user_tenants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_tenants ut
      WHERE ut.tenant_id = user_tenants.tenant_id
        AND ut.user_id = auth.uid()
        AND ut.role = 'owner'
    )
  );

-- Do not contact policies
CREATE POLICY "Users can view DNC for their tenants" ON do_not_contact
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage DNC for their tenants" ON do_not_contact
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid())
  );

-- ============================================================================
-- UPDATE TENANT SETTINGS SCHEMA COMMENT
-- ============================================================================
COMMENT ON COLUMN tenants.settings IS 'Tenant configuration including:
{
  "integrations": {
    "apollo": { "api_key": "encrypted..." },
    "smartlead": { "api_key": "encrypted...", "campaign_id": "..." },
    "instantly": { "api_key": "encrypted..." },
    "heyreach": { "api_key": "encrypted..." }
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
-- FUNCTION: Create user profile on auth signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- FUNCTION: Check if email/domain is in DNC list
-- ============================================================================
CREATE OR REPLACE FUNCTION check_dnc(
  p_tenant_id UUID,
  p_email VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  v_domain VARCHAR;
  v_exists BOOLEAN;
BEGIN
  -- Extract domain from email
  v_domain := split_part(p_email, '@', 2);

  -- Check if email or domain exists in DNC
  SELECT EXISTS (
    SELECT 1 FROM do_not_contact
    WHERE tenant_id = p_tenant_id
      AND (email = p_email OR domain = v_domain)
  ) INTO v_exists;

  RETURN v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
