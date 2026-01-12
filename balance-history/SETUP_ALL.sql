-- =====================================================
-- COMPLETE SETUP SQL FOR PHONE EXTRACTION FEATURE
-- Run this file to set up all required database objects
-- =====================================================

-- =====================================================
-- 1. CREATE BALANCE HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS balance_history (
    -- Primary key
    id SERIAL PRIMARY KEY,

    -- Sepay transaction data
    sepay_id INTEGER UNIQUE NOT NULL,
    gateway VARCHAR(100) NOT NULL,
    transaction_date TIMESTAMP NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    code VARCHAR(100),
    content TEXT,
    transfer_type VARCHAR(10) NOT NULL CHECK (transfer_type IN ('in', 'out')),
    transfer_amount BIGINT NOT NULL,
    accumulated BIGINT NOT NULL,
    sub_account VARCHAR(100),
    reference_code VARCHAR(100),
    description TEXT,

    -- Debt processing flag
    debt_added BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Webhook metadata
    webhook_received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

-- Indexes for balance_history
CREATE INDEX IF NOT EXISTS idx_balance_history_sepay_id ON balance_history(sepay_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_transaction_date ON balance_history(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_balance_history_transfer_type ON balance_history(transfer_type);
CREATE INDEX IF NOT EXISTS idx_balance_history_gateway ON balance_history(gateway);
CREATE INDEX IF NOT EXISTS idx_balance_history_account_number ON balance_history(account_number);
CREATE INDEX IF NOT EXISTS idx_balance_history_created_at ON balance_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_history_debt_added ON balance_history(debt_added);

-- =====================================================
-- 2. CREATE WEBHOOK LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS sepay_webhook_logs (
    id SERIAL PRIMARY KEY,
    sepay_id INTEGER,
    request_method VARCHAR(10),
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON sepay_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_sepay_id ON sepay_webhook_logs(sepay_id);

-- =====================================================
-- 3. CREATE BALANCE CUSTOMER INFO TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS balance_customer_info (
    -- Primary key
    id SERIAL PRIMARY KEY,

    -- Transaction unique code (e.g., N2ABC123 or PHONE0901234567123456)
    unique_code VARCHAR(50) UNIQUE NOT NULL,

    -- Customer information
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for balance_customer_info
CREATE INDEX IF NOT EXISTS idx_customer_info_unique_code ON balance_customer_info(unique_code);
CREATE INDEX IF NOT EXISTS idx_customer_info_phone ON balance_customer_info(customer_phone);

-- =====================================================
-- 4. CREATE PENDING CUSTOMER MATCHES TABLE
-- =====================================================
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

-- Indexes for pending_customer_matches
CREATE INDEX IF NOT EXISTS idx_pending_matches_transaction_id ON pending_customer_matches(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pending_matches_status ON pending_customer_matches(status);
CREATE INDEX IF NOT EXISTS idx_pending_matches_created_at ON pending_customer_matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_matches_extracted_phone ON pending_customer_matches(extracted_phone);

-- Prevent duplicate pending matches for same transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_matches_unique_transaction
    ON pending_customer_matches(transaction_id)
    WHERE status = 'pending';

-- =====================================================
-- 5. CREATE UPDATE TRIGGER FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- 6. CREATE TRIGGERS FOR AUTO-UPDATE
-- =====================================================

-- Trigger for balance_history
DROP TRIGGER IF EXISTS update_balance_history_updated_at ON balance_history;
CREATE TRIGGER update_balance_history_updated_at
    BEFORE UPDATE ON balance_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for balance_customer_info
DROP TRIGGER IF EXISTS update_customer_info_updated_at ON balance_customer_info;
CREATE TRIGGER update_customer_info_updated_at
    BEFORE UPDATE ON balance_customer_info
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. CREATE STATISTICS VIEW
-- =====================================================
CREATE OR REPLACE VIEW balance_statistics AS
SELECT
    DATE(transaction_date) as date,
    gateway,
    COUNT(*) as total_transactions,
    SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE 0 END) as total_in,
    SUM(CASE WHEN transfer_type = 'out' THEN transfer_amount ELSE 0 END) as total_out,
    SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE -transfer_amount END) as net_change
FROM balance_history
GROUP BY DATE(transaction_date), gateway
ORDER BY date DESC;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
-- All tables, indexes, triggers, and views have been created.
-- You can now use the phone extraction feature.
--
-- Next steps:
-- 1. Restart your Node.js server
-- 2. Test webhook with: POST /api/sepay/webhook
-- 3. Check pending matches: GET /api/sepay/pending-matches
-- =====================================================
