-- =====================================================
-- SEPAY BALANCE HISTORY SCHEMA
-- Lưu lịch sử biến động số dư từ webhook Sepay
-- =====================================================

-- Bảng lịch sử giao dịch
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

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Webhook metadata
    webhook_received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

-- Index cho tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_balance_history_sepay_id ON balance_history(sepay_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_transaction_date ON balance_history(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_balance_history_transfer_type ON balance_history(transfer_type);
CREATE INDEX IF NOT EXISTS idx_balance_history_gateway ON balance_history(gateway);
CREATE INDEX IF NOT EXISTS idx_balance_history_account_number ON balance_history(account_number);
CREATE INDEX IF NOT EXISTS idx_balance_history_created_at ON balance_history(created_at DESC);

-- Bảng webhook logs để debug
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

-- Function để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger cho balance_history
DROP TRIGGER IF EXISTS update_balance_history_updated_at ON balance_history;
CREATE TRIGGER update_balance_history_updated_at
    BEFORE UPDATE ON balance_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View để dễ dàng xem số liệu thống kê
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
