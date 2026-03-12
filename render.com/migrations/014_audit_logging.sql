-- =====================================================
-- Migration 014: Audit Logging for Balance History
-- Date: 2026-01-15
-- Purpose: Track all changes made by NV and Ke toan for audit
-- =====================================================

-- =====================================================
-- 1. CREATE balance_history_audit TABLE
-- Logs all changes for complete audit trail
-- =====================================================

CREATE TABLE IF NOT EXISTS balance_history_audit (
    id SERIAL PRIMARY KEY,

    -- Reference to the transaction being modified
    transaction_id INTEGER REFERENCES balance_history(id) ON DELETE SET NULL,

    -- Type of action performed
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'MANUAL_PHONE_ENTRY',      -- NV nhap SDT tay
        'TPOS_LOOKUP',             -- He thong lookup TPOS tu dong
        'PENDING_MATCH_SELECTED',  -- NV chon tu dropdown (nhieu KH match)
        'APPROVED',                -- Ke toan duyet
        'REJECTED',                -- Ke toan tu choi
        'CHANGED_AND_APPROVED',    -- Ke toan thay doi SDT + duyet
        'WALLET_CREDITED',         -- Tien da cong vao vi
        'WALLET_ADJUSTMENT',       -- Dieu chinh vi (sai mapping)
        'SKIP_MATCH',              -- Bo qua GD
        'UNDO_SKIP'                -- Hoan tac bo qua
    )),

    -- Old and new values as JSON for flexibility
    old_value JSONB,              -- Gia tri cu (phone, name, status, etc.)
    new_value JSONB,              -- Gia tri moi

    -- Who performed the action
    performed_by VARCHAR(100) NOT NULL,
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Optional metadata
    ip_address VARCHAR(50),       -- IP address (optional for future use)
    user_agent TEXT,              -- Browser info (optional for future use)
    notes TEXT                    -- Ghi chu them
);

-- =====================================================
-- 2. CREATE INDEXES
-- =====================================================

-- Index for finding audit logs by transaction
CREATE INDEX IF NOT EXISTS idx_bha_transaction
    ON balance_history_audit(transaction_id);

-- Index for finding audit logs by performer
CREATE INDEX IF NOT EXISTS idx_bha_performed_by
    ON balance_history_audit(performed_by);

-- Index for filtering by action type
CREATE INDEX IF NOT EXISTS idx_bha_action
    ON balance_history_audit(action);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_bha_performed_at
    ON balance_history_audit(performed_at);

-- =====================================================
-- 3. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE balance_history_audit IS
    'Audit log for all changes to balance_history transactions - tracks who did what and when';

COMMENT ON COLUMN balance_history_audit.action IS
    'Type of action: MANUAL_PHONE_ENTRY, TPOS_LOOKUP, PENDING_MATCH_SELECTED, APPROVED, REJECTED, CHANGED_AND_APPROVED, WALLET_CREDITED, WALLET_ADJUSTMENT, SKIP_MATCH, UNDO_SKIP';

COMMENT ON COLUMN balance_history_audit.old_value IS
    'Previous values as JSON - e.g., {"phone": "0912345678", "name": "Nguyen Van A", "verification_status": "PENDING"}';

COMMENT ON COLUMN balance_history_audit.new_value IS
    'New values as JSON - e.g., {"phone": "0987654321", "name": "Tran Van B", "verification_status": "APPROVED"}';

COMMENT ON COLUMN balance_history_audit.performed_by IS
    'Email or username of the person who performed the action';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
