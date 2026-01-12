-- =====================================================
-- MIGRATION: Add linked_customer_phone column to balance_history
--
-- Purpose: Link each transaction to exactly ONE customer phone
-- This ensures 1 transaction = 1 customer for debt calculation
-- =====================================================

-- Step 1: Add column
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS linked_customer_phone VARCHAR(20) DEFAULT NULL;

-- Step 2: Create index for fast queries
CREATE INDEX IF NOT EXISTS idx_balance_history_linked_phone
ON balance_history(linked_customer_phone)
WHERE linked_customer_phone IS NOT NULL;

-- Step 3: Create composite index for debt calculation
CREATE INDEX IF NOT EXISTS idx_balance_history_debt_calc
ON balance_history(linked_customer_phone, transfer_type, transfer_amount)
WHERE linked_customer_phone IS NOT NULL AND transfer_type = 'in';

-- Step 4: Add comment
COMMENT ON COLUMN balance_history.linked_customer_phone IS
'Full phone (10 digits, e.g. 0971881118) of the customer who owns this transaction. NULL = not yet linked. Once set, should not be changed.';

-- =====================================================
-- BACKFILL EXISTING DATA
-- =====================================================

-- Backfill from QR codes (N2...) - most reliable
UPDATE balance_history bh
SET linked_customer_phone = bci.customer_phone
FROM balance_customer_info bci
WHERE bh.linked_customer_phone IS NULL
  AND bh.transfer_type = 'in'
  AND bh.debt_added = TRUE
  AND bci.unique_code ~* '^N2[A-Z0-9]{16}$'
  AND bh.content ~* bci.unique_code;

-- Backfill from exact phone in content (10 digits starting with 0)
UPDATE balance_history bh
SET linked_customer_phone = bci.customer_phone
FROM balance_customer_info bci
WHERE bh.linked_customer_phone IS NULL
  AND bh.transfer_type = 'in'
  AND bh.debt_added = TRUE
  AND bci.unique_code LIKE 'PHONE%'
  AND bci.customer_phone IS NOT NULL
  AND LENGTH(bci.customer_phone) = 10
  AND bh.content LIKE '%' || bci.customer_phone || '%';

-- Backfill from resolved pending matches
UPDATE balance_history bh
SET linked_customer_phone = (pcm.resolution_notes::jsonb->>'phone')
FROM pending_customer_matches pcm
WHERE bh.linked_customer_phone IS NULL
  AND bh.transfer_type = 'in'
  AND pcm.transaction_id = bh.id
  AND pcm.status = 'resolved'
  AND pcm.resolution_notes IS NOT NULL
  AND pcm.resolution_notes != '';

-- Log results
DO $$
DECLARE
    total_count INTEGER;
    linked_count INTEGER;
    unlinked_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM balance_history WHERE transfer_type = 'in';
    SELECT COUNT(*) INTO linked_count FROM balance_history WHERE transfer_type = 'in' AND linked_customer_phone IS NOT NULL;
    unlinked_count := total_count - linked_count;

    RAISE NOTICE 'Migration completed:';
    RAISE NOTICE '  Total incoming transactions: %', total_count;
    RAISE NOTICE '  Linked to customer: %', linked_count;
    RAISE NOTICE '  Not yet linked: %', unlinked_count;
END $$;
