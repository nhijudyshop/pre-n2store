-- =====================================================
-- CUSTOMER INFO TABLE
-- Lưu thông tin khách hàng liên kết với mã giao dịch
-- =====================================================

-- Bảng thông tin khách hàng
CREATE TABLE IF NOT EXISTS balance_customer_info (
    -- Primary key
    id SERIAL PRIMARY KEY,

    -- Transaction unique code (e.g., N2ABC123)
    unique_code VARCHAR(50) UNIQUE NOT NULL,

    -- Customer information
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index cho tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_customer_info_unique_code ON balance_customer_info(unique_code);

-- Trigger để tự động cập nhật updated_at
DROP TRIGGER IF EXISTS update_customer_info_updated_at ON balance_customer_info;
CREATE TRIGGER update_customer_info_updated_at
    BEFORE UPDATE ON balance_customer_info
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
