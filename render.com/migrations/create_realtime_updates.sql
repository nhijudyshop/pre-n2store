-- =====================================================
-- REALTIME UPDATES TABLE
-- Lưu tin nhắn/bình luận mới từ Pancake WebSocket
-- Để thông báo khi user load lại trang
-- =====================================================

CREATE TABLE IF NOT EXISTS realtime_updates (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('INBOX', 'COMMENT')),
    snippet TEXT,
    unread_count INT DEFAULT 0,
    page_id VARCHAR(50),
    psid VARCHAR(50),
    customer_name VARCHAR(255),
    seen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast queries by timestamp
CREATE INDEX IF NOT EXISTS idx_realtime_updates_created_at
ON realtime_updates(created_at DESC);

-- Index for querying by psid (to match with orders)
CREATE INDEX IF NOT EXISTS idx_realtime_updates_psid
ON realtime_updates(psid);

-- Index for querying by page_id
CREATE INDEX IF NOT EXISTS idx_realtime_updates_page_id
ON realtime_updates(page_id);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_realtime_updates_lookup
ON realtime_updates(created_at DESC, type, seen);

-- Auto-cleanup old records (keep last 7 days)
-- Run this periodically via cron or scheduled task
-- DELETE FROM realtime_updates WHERE created_at < NOW() - INTERVAL '7 days';

COMMENT ON TABLE realtime_updates IS 'Lưu tin nhắn/bình luận mới từ Pancake WebSocket để thông báo khi user refresh';
COMMENT ON COLUMN realtime_updates.conversation_id IS 'ID conversation từ Pancake (format: pageId_psid)';
COMMENT ON COLUMN realtime_updates.type IS 'INBOX = tin nhắn, COMMENT = bình luận';
COMMENT ON COLUMN realtime_updates.snippet IS 'Nội dung tin nhắn/bình luận (đã cắt ngắn)';
COMMENT ON COLUMN realtime_updates.psid IS 'Page-scoped User ID của khách hàng';
COMMENT ON COLUMN realtime_updates.seen IS 'TRUE nếu user đã xem thông báo này';
