-- Migration: Add review tracking to email_sequences and create review history table
-- Agent 4 (Email Reviewer) tracks review decisions and revision attempts

-- Add review tracking columns to email_sequences
ALTER TABLE email_sequences
ADD COLUMN IF NOT EXISTS review_status VARCHAR DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS review_result JSONB,
ADD COLUMN IF NOT EXISTS review_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP;

-- review_status values: 'pending', 'approved', 'revision_needed', 'rejected', 'human_review'

COMMENT ON COLUMN email_sequences.review_status IS 'Current review status: pending, approved, revision_needed, rejected, human_review';
COMMENT ON COLUMN email_sequences.review_result IS 'Full review result from Agent 4 including email-level reviews and revision instructions';
COMMENT ON COLUMN email_sequences.review_attempts IS 'Number of review attempts for this sequence';
COMMENT ON COLUMN email_sequences.last_reviewed_at IS 'Timestamp of most recent review';

-- Create review history table for audit trail
CREATE TABLE IF NOT EXISTS email_sequence_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  attempt_number INTEGER NOT NULL,
  decision VARCHAR NOT NULL,
  overall_score INTEGER,
  summary TEXT,
  email_reviews JSONB,
  sequence_level_issues JSONB,
  revision_instructions TEXT,
  human_review_reason TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_reviews_sequence ON email_sequence_reviews(sequence_id);
CREATE INDEX IF NOT EXISTS idx_reviews_decision ON email_sequence_reviews(decision);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant ON email_sequence_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sequences_review_status ON email_sequences(review_status);
