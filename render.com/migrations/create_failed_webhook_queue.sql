-- =====================================================
-- FAILED WEBHOOK QUEUE
-- Lưu webhook thất bại để retry
-- =====================================================

-- Bảng queue cho webhook thất bại
CREATE TABLE IF NOT EXISTS failed_webhook_queue (
    id SERIAL PRIMARY KEY,

    -- Webhook data (raw từ SePay)
    sepay_id INTEGER,
    gateway VARCHAR(100),
    transaction_date TIMESTAMP,
    account_number VARCHAR(50),
    code VARCHAR(100),
    content TEXT,
    transfer_type VARCHAR(10),
    transfer_amount BIGINT,
    accumulated BIGINT,
    sub_account VARCHAR(100),
    reference_code VARCHAR(100),
    description TEXT,
    raw_data JSONB NOT NULL,

    -- Queue metadata
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    last_error TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_retry_at TIMESTAMP,
    processed_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_failed_webhook_status ON failed_webhook_queue(status);
CREATE INDEX IF NOT EXISTS idx_failed_webhook_sepay_id ON failed_webhook_queue(sepay_id);
CREATE INDEX IF NOT EXISTS idx_failed_webhook_reference_code ON failed_webhook_queue(reference_code);
CREATE INDEX IF NOT EXISTS idx_failed_webhook_created_at ON failed_webhook_queue(created_at DESC);

-- Trigger cập nhật updated_at
DROP TRIGGER IF EXISTS update_failed_webhook_queue_updated_at ON failed_webhook_queue;
CREATE TRIGGER update_failed_webhook_queue_updated_at
    BEFORE UPDATE ON failed_webhook_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- REFERENCE CODE GAPS TABLE
-- Theo dõi các khoảng trống trong mã tham chiếu
-- =====================================================

CREATE TABLE IF NOT EXISTS reference_code_gaps (
    id SERIAL PRIMARY KEY,

    -- Gap info
    missing_reference_code VARCHAR(100) NOT NULL,
    previous_reference_code VARCHAR(100),
    next_reference_code VARCHAR(100),

    -- Status
    status VARCHAR(20) DEFAULT 'detected' CHECK (status IN ('detected', 'fetched', 'not_found', 'ignored')),

    -- If fetched successfully, link to balance_history
    balance_history_id INTEGER REFERENCES balance_history(id),

    -- Timestamps
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,

    UNIQUE(missing_reference_code)
);

CREATE INDEX IF NOT EXISTS idx_reference_gaps_status ON reference_code_gaps(status);
CREATE INDEX IF NOT EXISTS idx_reference_gaps_detected_at ON reference_code_gaps(detected_at DESC);
