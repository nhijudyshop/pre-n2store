-- =====================================================
-- REALTIME CREDENTIALS TABLE
-- Lưu credentials để auto-connect WebSocket khi server restart
-- =====================================================

CREATE TABLE IF NOT EXISTS realtime_credentials (
    id SERIAL PRIMARY KEY,
    client_type VARCHAR(20) NOT NULL UNIQUE CHECK (client_type IN ('pancake', 'tpos')),
    token TEXT NOT NULL,
    user_id VARCHAR(50),
    page_ids TEXT,           -- JSON array as string
    cookie TEXT,
    room VARCHAR(100),       -- For TPOS client
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_realtime_credentials_type
ON realtime_credentials(client_type);

COMMENT ON TABLE realtime_credentials IS 'Lưu credentials để auto-connect WebSocket khi server restart';
COMMENT ON COLUMN realtime_credentials.client_type IS 'pancake hoặc tpos';
COMMENT ON COLUMN realtime_credentials.page_ids IS 'JSON array của page IDs (cho Pancake)';
COMMENT ON COLUMN realtime_credentials.is_active IS 'TRUE = tự động kết nối khi server start';
