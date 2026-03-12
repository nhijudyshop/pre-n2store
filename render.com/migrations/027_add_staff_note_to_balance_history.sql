-- =====================================================
-- Migration 027: Add staff_note column to balance_history
-- Date: 2026-02-01
-- Purpose: Allow staff to add notes when confirming/assigning transactions
--          for accountants to review
-- =====================================================

-- Add staff_note column to balance_history
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS staff_note TEXT;

-- Add comment for documentation
COMMENT ON COLUMN balance_history.staff_note IS 'Note from staff when confirming/assigning transaction in Live Mode';
