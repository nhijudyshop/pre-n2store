-- =====================================================
-- ADD debt_adjusted_at COLUMN TO CUSTOMERS TABLE
-- Used to track when admin manually adjusted the debt
-- =====================================================

-- Add column if not exists
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS debt_adjusted_at TIMESTAMP WITH TIME ZONE;

-- Comment for documentation
COMMENT ON COLUMN customers.debt_adjusted_at IS
'Timestamp when admin manually adjusted the debt. Used to calculate: actual_debt = debt + sum(transactions AFTER this timestamp)';
