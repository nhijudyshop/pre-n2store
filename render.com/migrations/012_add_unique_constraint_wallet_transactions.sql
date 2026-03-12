-- =====================================================
-- Migration: Add UNIQUE constraint to prevent duplicate wallet transactions
-- =====================================================
--
-- Problem: Race condition between webhook and cron job can create
-- duplicate wallet_transactions for the same balance_history record.
--
-- Solution: Add UNIQUE constraint on (reference_type, reference_id)
-- This ensures 1 balance_history can only create 1 wallet_transaction
--
-- Created: 2026-01-12
-- =====================================================

-- Step 1: Find and remove duplicates BEFORE adding constraint
-- Keep only the FIRST transaction (smallest id) for each reference

-- First, let's see duplicates
SELECT reference_type, reference_id, COUNT(*) as count,
       array_agg(id ORDER BY id) as transaction_ids,
       array_agg(amount ORDER BY id) as amounts
FROM wallet_transactions
WHERE reference_type = 'balance_history'
GROUP BY reference_type, reference_id
HAVING COUNT(*) > 1;

-- Delete duplicates (keep smallest id for each reference)
DELETE FROM wallet_transactions wt1
WHERE EXISTS (
    SELECT 1 FROM wallet_transactions wt2
    WHERE wt2.reference_type = wt1.reference_type
      AND wt2.reference_id = wt1.reference_id
      AND wt2.id < wt1.id
)
AND wt1.reference_type = 'balance_history';

-- Step 2: Recalculate wallet balances after removing duplicates
-- For each affected wallet, recalculate from transaction history
UPDATE customer_wallets cw
SET balance = COALESCE((
    SELECT SUM(
        CASE
            WHEN type IN ('DEPOSIT', 'VIRTUAL_CREDIT_ISSUED', 'ADJUSTMENT') THEN amount
            WHEN type IN ('WITHDRAW', 'VIRTUAL_CREDIT_USED', 'VIRTUAL_CREDIT_EXPIRED') THEN -amount
            ELSE 0
        END
    )
    FROM wallet_transactions wt
    WHERE wt.phone = cw.phone
), 0),
total_deposited = COALESCE((
    SELECT SUM(amount)
    FROM wallet_transactions wt
    WHERE wt.phone = cw.phone AND wt.type = 'DEPOSIT'
), 0),
updated_at = NOW();

-- Step 3: Add UNIQUE constraint
-- This will PREVENT any future duplicates at database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_unique_reference
ON wallet_transactions (reference_type, reference_id)
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

-- Step 4: Add comment explaining the constraint
COMMENT ON INDEX idx_wallet_tx_unique_reference IS
'Prevents duplicate wallet transactions for the same source (e.g., balance_history).
Each bank transfer (balance_history) can only create ONE wallet deposit.';

-- Verification query
SELECT
    'Total wallet_transactions' as metric,
    COUNT(*) as value
FROM wallet_transactions
UNION ALL
SELECT
    'Unique (reference_type, reference_id) pairs',
    COUNT(DISTINCT (reference_type, reference_id))
FROM wallet_transactions
WHERE reference_type IS NOT NULL;
