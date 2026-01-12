-- =====================================================
-- PENDING CUSTOMER MATCHES TABLE
-- Lưu các trường hợp tìm thấy nhiều khách hàng từ số điện thoại trong nội dung chuyển khoản
-- =====================================================

-- Bảng pending customer matches
CREATE TABLE IF NOT EXISTS pending_customer_matches (
    -- Primary key
    id SERIAL PRIMARY KEY,

    -- Reference to balance_history transaction
    transaction_id INTEGER NOT NULL REFERENCES balance_history(id) ON DELETE CASCADE,

    -- Extracted phone number from transaction content
    extracted_phone VARCHAR(50) NOT NULL,

    -- Matched customers (JSONB array of customer records)
    -- Format: [{"id": 1, "phone": "0901234567", "name": "Nguyen Van A"}, ...]
    matched_customers JSONB NOT NULL,

    -- Selected customer (after admin choice)
    selected_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

    -- Status: pending, resolved, skipped
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'skipped')),

    -- Resolution notes
    resolution_notes TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_pending_matches_transaction_id ON pending_customer_matches(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pending_matches_status ON pending_customer_matches(status);
CREATE INDEX IF NOT EXISTS idx_pending_matches_created_at ON pending_customer_matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_matches_extracted_phone ON pending_customer_matches(extracted_phone);

-- Prevent duplicate pending matches for same transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_matches_unique_transaction
    ON pending_customer_matches(transaction_id)
    WHERE status = 'pending';
