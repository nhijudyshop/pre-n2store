-- =====================================================
-- ADD debt_added COLUMN TO balance_history TABLE
-- Tracks which transactions have been processed for customer debt
-- =====================================================

-- Add debt_added column to track processed transactions
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS debt_added BOOLEAN DEFAULT FALSE;

-- Create index for efficient querying of unprocessed transactions
CREATE INDEX IF NOT EXISTS idx_balance_history_debt_added
ON balance_history(debt_added)
WHERE debt_added = FALSE;

-- Create composite index for finding unprocessed transactions by content pattern
CREATE INDEX IF NOT EXISTS idx_balance_history_debt_processing
ON balance_history(debt_added, transfer_type, content)
WHERE debt_added = FALSE AND transfer_type = 'in';

-- Add comment to explain the column
COMMENT ON COLUMN balance_history.debt_added IS 'Tracks whether this transaction has been added to customer debt. TRUE = processed, FALSE = not yet processed';
