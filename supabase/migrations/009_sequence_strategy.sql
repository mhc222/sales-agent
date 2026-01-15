-- Migration: Add sequence_strategy column to email_sequences
-- Stores the strategy metadata from the 95/5 email generation framework

ALTER TABLE email_sequences ADD COLUMN IF NOT EXISTS sequence_strategy JSONB;

-- Add comment for documentation
COMMENT ON COLUMN email_sequences.sequence_strategy IS 'Strategy metadata from 95/5 email generation: primaryAngle, personalizationUsed, toneUsed, triggerLeveraged';
