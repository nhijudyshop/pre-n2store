-- =====================================================
-- Migration: Create pending_wallet_withdrawals table
-- =====================================================
--
-- Purpose: Outbox pattern for wallet withdrawals
-- Ensures 100% no lost transactions even on network failures
--
-- Created: 2026-01-27
-- =====================================================

-- Drop table if exists (for re-running migration)
-- DROP TABLE IF EXISTS pending_wallet_withdrawals;

CREATE TABLE IF NOT EXISTS pending_wallet_withdrawals (
    id SERIAL PRIMARY KEY,

    -- Order info
    order_id VARCHAR(100) NOT NULL,
    order_number VARCHAR(100),

    -- Customer info
    phone VARCHAR(20) NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

    -- Amount info
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),

    -- Metadata
    source VARCHAR(50) NOT NULL DEFAULT 'SALE_ORDER',  -- SALE_ORDER, FAST_SALE, BULK_SALE
    note TEXT,
    created_by VARCHAR(100),

    -- Status tracking
    -- PENDING: Waiting to be processed
    -- PROCESSING: Currently being processed (prevents double processing)
    -- COMPLETED: Successfully withdrawn
    -- FAILED: Max retries reached, needs manual intervention
    -- CANCELLED: Order cancelled, withdrawal not needed
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),

    -- Retry tracking
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    last_error TEXT,
    last_retry_at TIMESTAMP,

    -- Result tracking (when completed)
    wallet_transaction_id INTEGER,
    virtual_used DECIMAL(15,2) DEFAULT 0,
    real_used DECIMAL(15,2) DEFAULT 0,
    completed_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Prevent duplicate withdrawals for same order+phone
    -- This ensures idempotency - calling the API multiple times is safe
    UNIQUE(order_id, phone)
);

-- =====================================================
-- INDEXES for performance
-- =====================================================

-- Index for cron job: find pending records older than 1 minute
CREATE INDEX IF NOT EXISTS idx_pending_withdrawals_status_created
    ON pending_wallet_withdrawals(status, created_at)
    WHERE status IN ('PENDING', 'PROCESSING');

-- Index for lookup by phone
CREATE INDEX IF NOT EXISTS idx_pending_withdrawals_phone
    ON pending_wallet_withdrawals(phone);

-- Index for lookup by order_id
CREATE INDEX IF NOT EXISTS idx_pending_withdrawals_order_id
    ON pending_wallet_withdrawals(order_id);

-- Index for failed records that need admin attention
CREATE INDEX IF NOT EXISTS idx_pending_withdrawals_failed
    ON pending_wallet_withdrawals(status, created_at)
    WHERE status = 'FAILED';

-- =====================================================
-- TRIGGER for updated_at
-- =====================================================

DROP TRIGGER IF EXISTS update_pending_withdrawals_timestamp ON pending_wallet_withdrawals;
CREATE TRIGGER update_pending_withdrawals_timestamp
    BEFORE UPDATE ON pending_wallet_withdrawals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE pending_wallet_withdrawals IS
'Outbox pattern for wallet withdrawals. Records intent to withdraw BEFORE calling API.
Ensures no lost transactions on network failures. Cron job retries PENDING records.';

COMMENT ON COLUMN pending_wallet_withdrawals.status IS
'PENDING=waiting, PROCESSING=in progress, COMPLETED=done, FAILED=needs admin, CANCELLED=order cancelled';

COMMENT ON COLUMN pending_wallet_withdrawals.source IS
'Where the withdrawal was initiated: SALE_ORDER (single), FAST_SALE (bulk PBH), BULK_SALE (batch)';

-- =====================================================
-- Verification query
-- =====================================================

SELECT
    'pending_wallet_withdrawals table created' as status,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'pending_wallet_withdrawals') as column_count;
