-- =====================================================
-- MIGRATION 004: Add linking columns to balance_history
-- Purpose: Enable linking bank transactions to customers
-- =====================================================

-- Add column to store linked customer phone
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS linked_customer_phone VARCHAR(20);

-- Add column to store linked customer ID (foreign key reference)
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS customer_id INTEGER;

-- Add column to track if transaction was processed into wallet
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS wallet_processed BOOLEAN DEFAULT FALSE;

-- Index for finding unlinked transactions quickly
CREATE INDEX IF NOT EXISTS idx_balance_history_linked_phone ON balance_history(linked_customer_phone);

-- Index for wallet processing status
CREATE INDEX IF NOT EXISTS idx_balance_history_wallet_processed ON balance_history(wallet_processed);

-- Index for customer_id lookups
CREATE INDEX IF NOT EXISTS idx_balance_history_customer_id ON balance_history(customer_id);

-- Comment for documentation
COMMENT ON COLUMN balance_history.linked_customer_phone IS 'Phone number of linked customer (normalized format)';
COMMENT ON COLUMN balance_history.customer_id IS 'ID reference to customers table';
COMMENT ON COLUMN balance_history.wallet_processed IS 'TRUE if amount was deposited to customer wallet';
