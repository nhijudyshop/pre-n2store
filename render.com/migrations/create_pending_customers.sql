-- =====================================================
-- PENDING CUSTOMERS TABLE
-- Lưu danh sách khách hàng chưa được trả lời
-- Persist qua tắt máy/đổi máy - không mất khi reload
-- =====================================================

CREATE TABLE IF NOT EXISTS pending_customers (
    id SERIAL PRIMARY KEY,
    psid VARCHAR(50) NOT NULL,
    page_id VARCHAR(50) NOT NULL,
    customer_name VARCHAR(200),
    last_message_snippet TEXT,
    last_message_time TIMESTAMP DEFAULT NOW(),
    message_count INTEGER DEFAULT 1,
    type VARCHAR(20) DEFAULT 'INBOX' CHECK (type IN ('INBOX', 'COMMENT')),
    created_at TIMESTAMP DEFAULT NOW(),

    -- Mỗi khách chỉ có 1 record per page
    UNIQUE(psid, page_id)
);

-- Index cho query pending customers
CREATE INDEX IF NOT EXISTS idx_pending_customers_psid
ON pending_customers(psid, page_id);

-- Index cho sort by time
CREATE INDEX IF NOT EXISTS idx_pending_customers_time
ON pending_customers(last_message_time DESC);

-- Index cho filter by type
CREATE INDEX IF NOT EXISTS idx_pending_customers_type
ON pending_customers(type);

COMMENT ON TABLE pending_customers IS 'Khách hàng có tin nhắn/bình luận chưa được trả lời - persist qua server restart';
COMMENT ON COLUMN pending_customers.psid IS 'Page-scoped User ID của khách hàng';
COMMENT ON COLUMN pending_customers.page_id IS 'Facebook Page ID';
COMMENT ON COLUMN pending_customers.message_count IS 'Số tin nhắn chưa trả lời (tăng mỗi khi có tin mới)';
COMMENT ON COLUMN pending_customers.type IS 'INBOX = tin nhắn, COMMENT = bình luận';
