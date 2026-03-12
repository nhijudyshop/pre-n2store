-- Migration 029: Add manager review columns to balance_history
-- Purpose: Support manager final review feature for approved transactions
-- Created: 2026-02-02

-- Add manager review columns
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS manager_reviewed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS manager_review_note TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Create index for filtering reviewed transactions
CREATE INDEX IF NOT EXISTS idx_balance_history_manager_reviewed
ON balance_history(manager_reviewed)
WHERE manager_reviewed = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN balance_history.manager_reviewed IS 'Whether the transaction has been reviewed by manager';
COMMENT ON COLUMN balance_history.manager_review_note IS 'Note from manager about which order used this transaction';
COMMENT ON COLUMN balance_history.reviewed_by IS 'Email/username of the manager who reviewed';
COMMENT ON COLUMN balance_history.reviewed_at IS 'When the transaction was reviewed by manager';
