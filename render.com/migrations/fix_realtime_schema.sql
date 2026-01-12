-- =====================================================
-- FIX REALTIME DATA SCHEMA
-- Add missing columns to existing tables
-- Migration Date: 2026-01-02
-- =====================================================

-- =====================================================
-- 1. FIX kpi_base table
-- Current: id, campaign_name, data, updated_at
-- Expected: Add order_id, user_id, user_name, stt, products, created_at
-- =====================================================

-- Add missing columns
ALTER TABLE kpi_base ADD COLUMN IF NOT EXISTS order_id VARCHAR(255);
ALTER TABLE kpi_base ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
ALTER TABLE kpi_base ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE kpi_base ADD COLUMN IF NOT EXISTS stt INTEGER;
ALTER TABLE kpi_base ADD COLUMN IF NOT EXISTS products JSONB;
ALTER TABLE kpi_base ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_kpi_base_order ON kpi_base(order_id);
CREATE INDEX IF NOT EXISTS idx_kpi_base_user ON kpi_base(user_id);

-- Add unique constraint on order_id (only if order_id has values)
-- Note: This may fail if order_id has duplicates - run manually if needed
-- ALTER TABLE kpi_base ADD CONSTRAINT kpi_base_order_id_unique UNIQUE (order_id);

-- Add comments
COMMENT ON COLUMN kpi_base.order_id IS 'Order ID for KPI tracking';
COMMENT ON COLUMN kpi_base.products IS 'Array of products: [{code, quantity, price, productId}]';

-- =====================================================
-- 2. FIX kpi_statistics table
-- Current: id, campaign_name, data, updated_at
-- Expected: Add user_id, stat_date, total_differences, total_amount, order_count, created_at
-- =====================================================

-- Add missing columns
ALTER TABLE kpi_statistics ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
ALTER TABLE kpi_statistics ADD COLUMN IF NOT EXISTS stat_date DATE;
ALTER TABLE kpi_statistics ADD COLUMN IF NOT EXISTS total_differences INTEGER DEFAULT 0;
ALTER TABLE kpi_statistics ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE kpi_statistics ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;
ALTER TABLE kpi_statistics ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS idx_kpi_stats_user_date ON kpi_statistics(user_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_stats_date ON kpi_statistics(stat_date DESC);

-- Add comments
COMMENT ON COLUMN kpi_statistics.user_id IS 'User ID for statistics';
COMMENT ON COLUMN kpi_statistics.stat_date IS 'Date of statistics';
COMMENT ON COLUMN kpi_statistics.total_differences IS 'Total number of product differences found';
COMMENT ON COLUMN kpi_statistics.total_amount IS 'Total KPI amount (VNĐ)';

-- =====================================================
-- 3. FIX soluong_products table
-- Current: id, data, updated_at
-- Expected: Add product_code, created_at
-- =====================================================

-- Add missing columns
ALTER TABLE soluong_products ADD COLUMN IF NOT EXISTS product_code VARCHAR(255);
ALTER TABLE soluong_products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create missing index
CREATE INDEX IF NOT EXISTS idx_soluong_products_code ON soluong_products(product_code);

-- Add comment
COMMENT ON COLUMN soluong_products.product_code IS 'Product code for quick lookup';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify kpi_base columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'kpi_base' 
ORDER BY ordinal_position;

-- Verify kpi_statistics columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'kpi_statistics' 
ORDER BY ordinal_position;

-- Verify soluong_products columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'soluong_products' 
ORDER BY ordinal_position;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
