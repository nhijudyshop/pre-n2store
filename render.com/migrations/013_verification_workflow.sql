-- =====================================================
-- Migration 013: Verification Workflow for Balance History
-- Date: 2026-01-14
-- Purpose: Add verification status tracking for bank transfers
-- Source: Balance-Historywithwallet.md
-- =====================================================

-- =====================================================
-- 1. ADD VERIFICATION COLUMNS TO balance_history
-- =====================================================

-- Verification status for bank transfer transactions
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) DEFAULT 'PENDING'
    CHECK (verification_status IN (
        'PENDING',              -- Chờ xử lý (chưa match được khách)
        'AUTO_APPROVED',        -- Auto duyệt (QR, exact phone, single match)
        'PENDING_VERIFICATION', -- Chờ kế toán duyệt (nhiều match hoặc manual entry)
        'APPROVED',             -- Đã được kế toán duyệt
        'REJECTED'              -- Bị từ chối
    ));

-- Match method tracking
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS match_method VARCHAR(30)
    CHECK (match_method IS NULL OR match_method IN (
        'qr_code',        -- QR code matched (N2 + 16 ký tự)
        'exact_phone',    -- Full 10-digit phone match
        'single_match',   -- Partial phone (6+ digits) với 1 match duy nhất
        'pending_match',  -- Partial phone với nhiều KH match - chờ chọn
        'manual_entry',   -- NV live nhập SĐT tay
        'manual_link'     -- Kế toán gán KH tay
    ));

-- Who verified/approved the transaction
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS verified_by VARCHAR(100);

-- When verification happened
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

-- Verification notes/reason
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS verification_note TEXT;

-- =====================================================
-- 2. CREATE INDEXES FOR VERIFICATION QUEUE
-- =====================================================

-- Index for verification queue (pending items)
CREATE INDEX IF NOT EXISTS idx_bh_verification_status
    ON balance_history(verification_status)
    WHERE verification_status IN ('PENDING_VERIFICATION', 'PENDING');

-- Index for verification audit
CREATE INDEX IF NOT EXISTS idx_bh_verified_by
    ON balance_history(verified_by)
    WHERE verified_by IS NOT NULL;

-- =====================================================
-- 3. CREATE wallet_adjustments TABLE
-- Bảng điều chỉnh ví khi có sai sót mapping
-- Thay vì rollback, tạo giao dịch điều chỉnh
-- =====================================================

CREATE TABLE IF NOT EXISTS wallet_adjustments (
    id SERIAL PRIMARY KEY,

    -- Reference to original transaction that caused the issue
    original_transaction_id INTEGER REFERENCES balance_history(id),

    -- Reference to wallet transaction created for adjustment
    wallet_transaction_id INTEGER REFERENCES wallet_transactions(id),

    -- Type of adjustment
    adjustment_type VARCHAR(30) NOT NULL CHECK (adjustment_type IN (
        'WRONG_MAPPING_CREDIT',    -- Credit back to correct customer
        'WRONG_MAPPING_DEBIT',     -- Debit from wrong customer
        'DUPLICATE_REVERSAL',      -- Reverse duplicate entry
        'ADMIN_CORRECTION'         -- Manual admin correction
    )),

    -- Customer tracking for wrong mapping
    wrong_customer_phone VARCHAR(20),
    correct_customer_phone VARCHAR(20),

    -- Amount being adjusted (positive = credit, negative = debit)
    adjustment_amount DECIMAL(15,2) NOT NULL,

    -- Reason for adjustment
    reason TEXT NOT NULL,

    -- Audit trail
    created_by VARCHAR(100) NOT NULL,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for finding adjustments by customer
CREATE INDEX IF NOT EXISTS idx_wa_wrong_customer ON wallet_adjustments(wrong_customer_phone);
CREATE INDEX IF NOT EXISTS idx_wa_correct_customer ON wallet_adjustments(correct_customer_phone);
CREATE INDEX IF NOT EXISTS idx_wa_original_tx ON wallet_adjustments(original_transaction_id);

-- =====================================================
-- 4. UPDATE EXISTING RECORDS
-- Set default verification_status based on wallet_processed
-- =====================================================

-- Transactions already processed to wallet → mark as AUTO_APPROVED
UPDATE balance_history
SET
    verification_status = 'AUTO_APPROVED',
    match_method = CASE
        WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) = 10 THEN 'exact_phone'
        WHEN linked_customer_phone IS NOT NULL THEN 'manual_link'
        ELSE 'exact_phone'
    END,
    verified_at = COALESCE(debt_adjusted_at, created_at),
    verification_note = 'Auto-migrated from existing data'
WHERE wallet_processed = TRUE
  AND verification_status = 'PENDING';

-- Transactions with customer linked but not wallet processed → PENDING_VERIFICATION
UPDATE balance_history
SET verification_status = 'PENDING_VERIFICATION'
WHERE (customer_phone IS NOT NULL OR linked_customer_phone IS NOT NULL)
  AND wallet_processed = FALSE
  AND verification_status = 'PENDING';

-- =====================================================
-- 5. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN balance_history.verification_status IS
    'Verification status: PENDING (chờ xử lý), AUTO_APPROVED (tự động duyệt), PENDING_VERIFICATION (chờ kế toán), APPROVED (đã duyệt), REJECTED (từ chối)';

COMMENT ON COLUMN balance_history.match_method IS
    'How customer was matched: qr_code, exact_phone, single_match, pending_match, manual_entry, manual_link';

COMMENT ON COLUMN balance_history.verified_by IS
    'Email of user who verified/approved the transaction';

COMMENT ON COLUMN balance_history.verified_at IS
    'Timestamp when verification occurred';

COMMENT ON TABLE wallet_adjustments IS
    'Tracks wallet corrections when wrong customer was credited (no rollback, create adjustment entry instead)';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
