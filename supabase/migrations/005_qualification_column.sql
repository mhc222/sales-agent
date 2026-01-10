-- ============================================================================
-- ADD QUALIFICATION STATUS COLUMN
-- Separates qualification decision from pipeline stage
-- ============================================================================

-- Add qualification column (yes/no/review)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS qualification VARCHAR DEFAULT 'pending';

-- Add constraint for valid values
ALTER TABLE leads
ADD CONSTRAINT leads_qualification_check
CHECK (qualification IN ('pending', 'qualified', 'disqualified', 'review'));

-- Rename status to stage for clarity
COMMENT ON COLUMN leads.status IS 'Pipeline stage: new, researched, sequence_ready, deployed, replied, meeting_booked, closed';
COMMENT ON COLUMN leads.qualification IS 'Qualification decision: pending, qualified, disqualified, review';

-- Update existing leads that have been processed to qualified
UPDATE leads
SET qualification = 'qualified'
WHERE status IN ('researched', 'sequence_ready', 'deployed', 'replied', 'meeting_booked');

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_leads_qualification ON leads(qualification);
