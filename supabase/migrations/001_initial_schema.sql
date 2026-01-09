-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- TENANTS TABLE (Multi-tenancy foundation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  slug VARCHAR NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- COMPANIES TABLE (Account-level aggregation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  domain VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  linkedin_url VARCHAR,
  industry VARCHAR,
  employee_count INT,
  revenue VARCHAR,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, domain)
);

CREATE INDEX idx_companies_domain ON companies(domain);
CREATE INDEX idx_companies_tenant ON companies(tenant_id);

-- ============================================================================
-- LEADS TABLE (Core lead tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Person data
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  job_title VARCHAR,
  headline VARCHAR,
  department VARCHAR,
  seniority_level VARCHAR,
  years_experience INT,
  linkedin_url VARCHAR,

  -- Company data
  company_name VARCHAR NOT NULL,
  company_linkedin_url VARCHAR,
  company_domain VARCHAR,
  company_employee_count INT,
  company_revenue VARCHAR,
  company_industry VARCHAR,
  company_description TEXT,

  -- Lead state
  status VARCHAR NOT NULL DEFAULT 'ingested',

  -- Intent tracking
  intent_signal JSONB,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_leads_tenant_status ON leads(tenant_id, status);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_company_domain ON leads(company_domain);

-- ============================================================================
-- GHL_RECORDS TABLE (Relationship history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ghl_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  ghl_contact_id VARCHAR,
  ghl_data JSONB,
  classification VARCHAR,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(lead_id)
);

CREATE INDEX idx_ghl_lead ON ghl_records(lead_id);

-- ============================================================================
-- RESEARCH_RECORDS TABLE (Research findings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS research_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  perplexity_raw TEXT,
  apify_raw JSONB,
  extracted_signals JSONB,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(lead_id)
);

CREATE INDEX idx_research_lead ON research_records(lead_id);

-- ============================================================================
-- SEQUENCE_SPECS TABLE (Outreach sequence definitions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sequence_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  trigger VARCHAR,
  channel_strategy VARCHAR,
  steps JSONB,
  status VARCHAR DEFAULT 'draft',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(lead_id)
);

CREATE INDEX idx_sequence_tenant ON sequence_specs(tenant_id);
CREATE INDEX idx_sequence_lead ON sequence_specs(lead_id);

-- ============================================================================
-- SMARTLEAD_CAMPAIGNS TABLE (Email campaign tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS smartlead_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  campaign_id VARCHAR NOT NULL,
  status VARCHAR,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(campaign_id)
);

CREATE INDEX idx_smartlead_lead ON smartlead_campaigns(lead_id);
CREATE INDEX idx_smartlead_campaign_id ON smartlead_campaigns(campaign_id);

-- ============================================================================
-- HEYREACH_OUTREACH TABLE (LinkedIn outreach tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS heyreach_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  outreach_id VARCHAR NOT NULL,
  status VARCHAR,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(outreach_id)
);

CREATE INDEX idx_heyreach_lead ON heyreach_outreach(lead_id);
CREATE INDEX idx_heyreach_outreach_id ON heyreach_outreach(outreach_id);

-- ============================================================================
-- ENGAGEMENT_LOG TABLE (Event tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS engagement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  event_type VARCHAR NOT NULL,
  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(id)
);

CREATE INDEX idx_engagement_lead ON engagement_log(lead_id);
CREATE INDEX idx_engagement_event ON engagement_log(event_type);
CREATE INDEX idx_engagement_created ON engagement_log(created_at);

-- ============================================================================
-- RAG_DOCUMENTS TABLE (Vector embeddings for RAG)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  rag_type VARCHAR NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(id)
);

CREATE INDEX idx_rag_embedding ON rag_documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_rag_tenant_type ON rag_documents(tenant_id, rag_type);

-- ============================================================================
-- MEMORIES TABLE (Research memory embeddings - future use)
-- ============================================================================
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  content TEXT NOT NULL,
  embedding vector(1536),
  source_type VARCHAR,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(id)
);

CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_memories_lead ON memories(lead_id);
CREATE INDEX idx_memories_tenant ON memories(tenant_id);

-- ============================================================================
-- INSERT DEFAULT TENANT (JSB Media)
-- ============================================================================
INSERT INTO tenants (name, slug)
VALUES ('JSB Media', 'jsb-media')
ON CONFLICT DO NOTHING;
