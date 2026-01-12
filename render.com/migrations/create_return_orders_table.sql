-- =====================================================
-- RETURN_ORDERS TABLE - PostgreSQL Migration
-- Trả Hàng (Returns) Management
-- =====================================================

-- Drop existing table (be careful in production!)
-- DROP TABLE IF EXISTS return_orders CASCADE;

-- Bảng quản lý đơn trả hàng
CREATE TABLE IF NOT EXISTS return_orders (
    -- Primary key
    id SERIAL PRIMARY KEY,

    -- ============================================
    -- CORE FIELDS
    -- ============================================

    -- Khách hàng
    customer_name VARCHAR(255) NOT NULL,

    -- Số điện thoại
    phone VARCHAR(20),

    -- Số hóa đơn (UNIQUE để tránh duplicate)
    invoice_number VARCHAR(100) NOT NULL UNIQUE,

    -- Tham chiếu (Reference)
    reference VARCHAR(100),

    -- Ngày hóa đơn
    invoice_date TIMESTAMP,

    -- Tổng tiền
    total_amount BIGINT DEFAULT 0,

    -- Còn nợ
    remaining_debt BIGINT DEFAULT 0,

    -- Trạng thái (Đã xác nhận, Nháp, Đã hủy)
    status VARCHAR(50) DEFAULT 'Nháp' CHECK (
        status IN ('Đã xác nhận', 'Nháp', 'Đã hủy')
    ),

    -- Lý do trả hàng
    return_reason TEXT,

    -- Đã trả hàng (checkbox flag)
    is_returned BOOLEAN DEFAULT false,

    -- ============================================
    -- TPOS SYNC DATA (stored as JSONB for flexibility)
    -- ============================================

    -- TPOS ID (external system reference)
    tpos_id VARCHAR(100),

    -- Full TPOS data (stored for reference)
    tpos_data JSONB,

    -- ============================================
    -- METADATA
    -- ============================================

    -- Source của dữ liệu (TPOS, Excel, Manual)
    source VARCHAR(50) DEFAULT 'Manual' CHECK (
        source IN ('TPOS', 'Excel', 'Manual')
    ),

    -- ============================================
    -- TIMESTAMPS
    -- ============================================

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES - OPTIMIZED FOR SEARCH PERFORMANCE
-- =====================================================

-- 1. INVOICE_NUMBER (Unique constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_return_orders_invoice_number ON return_orders(invoice_number);

-- 2. CUSTOMER_NAME SEARCH
CREATE INDEX IF NOT EXISTS idx_return_orders_customer_name ON return_orders(customer_name);
CREATE INDEX IF NOT EXISTS idx_return_orders_customer_name_lower ON return_orders(LOWER(customer_name));

-- 3. PHONE SEARCH
CREATE INDEX IF NOT EXISTS idx_return_orders_phone ON return_orders(phone);

-- 4. STATUS FILTER
CREATE INDEX IF NOT EXISTS idx_return_orders_status ON return_orders(status);

-- 5. IS_RETURNED FILTER
CREATE INDEX IF NOT EXISTS idx_return_orders_is_returned ON return_orders(is_returned);

-- 6. INVOICE_DATE (For date range queries and sorting)
CREATE INDEX IF NOT EXISTS idx_return_orders_invoice_date ON return_orders(invoice_date DESC);

-- 7. CREATED_AT (For pagination and sorting)
CREATE INDEX IF NOT EXISTS idx_return_orders_created_at ON return_orders(created_at DESC);

-- 8. TPOS_ID (For TPOS sync)
CREATE INDEX IF NOT EXISTS idx_return_orders_tpos_id ON return_orders(tpos_id);

-- 9. SOURCE (For filtering by data source)
CREATE INDEX IF NOT EXISTS idx_return_orders_source ON return_orders(source);

-- =====================================================
-- ADVANCED SEARCH INDEXES (pg_trgm for fuzzy matching)
-- =====================================================

-- Enable pg_trgm extension (for similarity search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index for fuzzy customer name matching
CREATE INDEX IF NOT EXISTS idx_return_orders_customer_name_trgm ON return_orders USING gin(customer_name gin_trgm_ops);

-- Trigram index for fuzzy reference matching
CREATE INDEX IF NOT EXISTS idx_return_orders_reference_trgm ON return_orders USING gin(reference gin_trgm_ops);

-- =====================================================
-- TRIGGER - Auto update updated_at
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_return_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call function before update
DROP TRIGGER IF EXISTS trigger_update_return_orders_updated_at ON return_orders;
CREATE TRIGGER trigger_update_return_orders_updated_at
    BEFORE UPDATE ON return_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_return_orders_updated_at();

-- =====================================================
-- VIEWS - For easy statistics access
-- =====================================================

-- Return orders statistics
CREATE OR REPLACE VIEW return_orders_statistics AS
SELECT
    COUNT(*) as total_orders,
    COUNT(*) FILTER (WHERE status = 'Đã xác nhận') as confirmed_count,
    COUNT(*) FILTER (WHERE status = 'Nháp') as draft_count,
    COUNT(*) FILTER (WHERE status = 'Đã hủy') as cancelled_count,
    COUNT(*) FILTER (WHERE is_returned = true) as returned_count,
    COUNT(*) FILTER (WHERE is_returned = false) as pending_return_count,
    SUM(total_amount) as total_amount_sum,
    SUM(remaining_debt) as total_debt_sum,
    AVG(total_amount) as avg_amount,
    COUNT(*) FILTER (WHERE source = 'TPOS') as tpos_count,
    COUNT(*) FILTER (WHERE source = 'Excel') as excel_count,
    COUNT(*) FILTER (WHERE source = 'Manual') as manual_count
FROM return_orders;

-- Return orders by date (for charts)
CREATE OR REPLACE VIEW return_orders_by_date AS
SELECT
    DATE(invoice_date) as order_date,
    COUNT(*) as order_count,
    SUM(total_amount) as daily_amount,
    SUM(remaining_debt) as daily_debt
FROM return_orders
WHERE invoice_date IS NOT NULL
GROUP BY DATE(invoice_date)
ORDER BY order_date DESC;

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function: Search return orders with priority
-- Usage: SELECT * FROM search_return_orders('keyword', 100);
CREATE OR REPLACE FUNCTION search_return_orders(
    search_term TEXT,
    limit_count INTEGER DEFAULT 100
)
RETURNS TABLE (
    id INTEGER,
    customer_name VARCHAR,
    phone VARCHAR,
    invoice_number VARCHAR,
    reference VARCHAR,
    invoice_date TIMESTAMP,
    total_amount BIGINT,
    remaining_debt BIGINT,
    status VARCHAR,
    return_reason TEXT,
    is_returned BOOLEAN,
    tpos_id VARCHAR,
    source VARCHAR,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ro.id,
        ro.customer_name,
        ro.phone,
        ro.invoice_number,
        ro.reference,
        ro.invoice_date,
        ro.total_amount,
        ro.remaining_debt,
        ro.status,
        ro.return_reason,
        ro.is_returned,
        ro.tpos_id,
        ro.source,
        ro.created_at,
        ro.updated_at,
        -- Priority calculation
        CASE
            WHEN ro.invoice_number = search_term THEN 100  -- Exact invoice match = highest
            WHEN ro.phone = search_term THEN 95  -- Exact phone match
            WHEN ro.reference = search_term THEN 90  -- Exact reference match
            WHEN LOWER(ro.customer_name) = LOWER(search_term) THEN 85  -- Exact name match
            WHEN ro.phone LIKE search_term || '%' THEN 80  -- Phone prefix
            WHEN LOWER(ro.customer_name) LIKE LOWER(search_term) || '%' THEN 70  -- Name prefix
            WHEN ro.invoice_number LIKE '%' || search_term || '%' THEN 60  -- Invoice contains
            WHEN LOWER(ro.customer_name) LIKE '%' || LOWER(search_term) || '%' THEN 50  -- Name contains
            ELSE 0
        END AS priority
    FROM return_orders ro
    WHERE
        ro.invoice_number LIKE '%' || search_term || '%'
        OR ro.phone LIKE '%' || search_term || '%'
        OR LOWER(ro.customer_name) LIKE '%' || LOWER(search_term) || '%'
        OR ro.reference LIKE '%' || search_term || '%'
    ORDER BY priority DESC, ro.invoice_date DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SAMPLE DATA (for testing)
-- =====================================================

-- Uncomment to insert sample data
/*
INSERT INTO return_orders (
    customer_name, phone, invoice_number, reference,
    invoice_date, total_amount, remaining_debt,
    status, return_reason, is_returned, source
) VALUES
    ('Nguyễn Văn A', '0123456789', 'TH001', 'REF001', NOW(), 500000, 0, 'Đã xác nhận', 'Hàng lỗi', false, 'Manual'),
    ('Trần Thị B', '0987654321', 'TH002', 'REF002', NOW(), 300000, 100000, 'Đã xác nhận', 'Đổi size', false, 'TPOS'),
    ('Lê Văn C', '0369852147', 'TH003', 'REF003', NOW(), 700000, 0, 'Nháp', 'Khách không muốn mua', true, 'Excel');
*/

-- =====================================================
-- MIGRATION NOTES
-- =====================================================

/*
MIGRATION CHECKLIST:
1. ✅ Create table with optimized schema
2. ✅ Create indexes for search performance
3. ✅ Create views for statistics
4. ✅ Create utility functions
5. ⏳ Create API endpoints (GET, POST batch, PUT, DELETE)
6. ⏳ Update frontend with Fetch TPOS, Import Excel, Download Template buttons
7. ⏳ Test duplicate prevention with ON CONFLICT
8. ⏳ Test Excel import functionality

DUPLICATE PREVENTION:
- invoice_number is UNIQUE
- Use ON CONFLICT (invoice_number) DO NOTHING for batch imports
- Use ON CONFLICT (invoice_number) DO UPDATE SET ... for updates

PERFORMANCE NOTES:
- Invoice search: ~10-50ms (with unique index)
- Customer name search: ~20-80ms (with index)
- Date range queries: ~50-100ms (with index)
- Stats query: ~50-100ms (aggregated view)

API ENDPOINTS TO CREATE:
- GET    /api/return-orders          → List with pagination
- POST   /api/return-orders/batch    → Batch import (Excel/TPOS)
- PUT    /api/return-orders/:id      → Update single order
- DELETE /api/return-orders/:id      → Delete single order
- GET    /api/return-orders/stats    → Statistics
*/
