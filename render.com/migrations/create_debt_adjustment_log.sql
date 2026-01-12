-- =====================================================
-- DEBT ADJUSTMENT LOG TABLE
-- Lưu lịch sử chỉnh sửa công nợ bằng tay (admin)
-- =====================================================

CREATE TABLE IF NOT EXISTS debt_adjustment_log (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    old_debt DECIMAL(15,2) DEFAULT 0,
    new_debt DECIMAL(15,2) DEFAULT 0,
    change_amount DECIMAL(15,2) DEFAULT 0,
    reason TEXT,
    adjusted_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by phone
CREATE INDEX IF NOT EXISTS idx_debt_adjustment_log_phone ON debt_adjustment_log(phone);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_debt_adjustment_log_created_at ON debt_adjustment_log(created_at DESC);

-- =====================================================
-- USAGE EXAMPLE:
--
-- INSERT INTO debt_adjustment_log (phone, old_debt, new_debt, change_amount, reason, adjusted_by)
-- VALUES ('123456789', 304775, 304770, -5, 'Admin manual adjustment', 'admin@example.com');
--
-- SELECT * FROM debt_adjustment_log WHERE phone = '123456789' ORDER BY created_at DESC;
-- =====================================================
