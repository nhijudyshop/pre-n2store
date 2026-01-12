-- =====================================================
-- REALTIME DATA MIGRATION
-- Thay thế Firebase Realtime Database bằng PostgreSQL + SSE
-- Migration Date: 2026-01-02
-- =====================================================

-- 0. Bảng lưu tin nhắn/bình luận mới từ Pancake WebSocket
-- Dùng cho notification và query recent updates
CREATE TABLE IF NOT EXISTS realtime_updates (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(500) NOT NULL,
    type VARCHAR(50) DEFAULT 'INBOX',
    snippet TEXT,
    unread_count INTEGER DEFAULT 0,
    page_id VARCHAR(255),
    psid VARCHAR(255),
    customer_name VARCHAR(255),
    seen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_realtime_updates_created ON realtime_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_updates_type ON realtime_updates(type);
CREATE INDEX IF NOT EXISTS idx_realtime_updates_psid ON realtime_updates(psid);
CREATE INDEX IF NOT EXISTS idx_realtime_updates_page ON realtime_updates(page_id);
CREATE INDEX IF NOT EXISTS idx_realtime_updates_seen ON realtime_updates(seen, created_at DESC);

COMMENT ON TABLE realtime_updates IS 'Pancake WebSocket updates (messages/comments) for notifications';
COMMENT ON COLUMN realtime_updates.conversation_id IS 'Pancake conversation ID';
COMMENT ON COLUMN realtime_updates.type IS 'INBOX or COMMENT';
COMMENT ON COLUMN realtime_updates.snippet IS 'Preview text of message/comment';

-- =====================================================
-- 1. Bảng chung cho key-value data (tokens, settings, etc.)
-- Thay thế: firebase.database().ref('key').set(value)
CREATE TABLE IF NOT EXISTS realtime_kv (
    key VARCHAR(500) PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying by update time
CREATE INDEX IF NOT EXISTS idx_realtime_kv_updated ON realtime_kv(updated_at DESC);

-- Index for JSONB value queries (if needed)
CREATE INDEX IF NOT EXISTS idx_realtime_kv_value ON realtime_kv USING GIN(value);

COMMENT ON TABLE realtime_kv IS 'Key-Value storage replacing Firebase Realtime Database';
COMMENT ON COLUMN realtime_kv.key IS 'Unique key path (e.g., "tpos_token", "settings/display")';
COMMENT ON COLUMN realtime_kv.value IS 'JSONB value - can store any JSON structure';

-- =====================================================
-- 2. KPI Base Data
-- Stores baseline product snapshot for KPI calculation
-- =====================================================
CREATE TABLE IF NOT EXISTS kpi_base (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL UNIQUE,
    campaign_name VARCHAR(255),
    user_id VARCHAR(255),
    user_name VARCHAR(255),
    stt INTEGER,
    products JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kpi_base_order ON kpi_base(order_id);
CREATE INDEX IF NOT EXISTS idx_kpi_base_campaign ON kpi_base(campaign_name);
CREATE INDEX IF NOT EXISTS idx_kpi_base_user ON kpi_base(user_id);
CREATE INDEX IF NOT EXISTS idx_kpi_base_updated ON kpi_base(updated_at DESC);

COMMENT ON TABLE kpi_base IS 'KPI baseline snapshots for orders';
COMMENT ON COLUMN kpi_base.products IS 'Array of products: [{code, quantity, price, productId}]';

-- =====================================================
-- 3. KPI Statistics
-- Stores aggregated KPI statistics per user per day
-- =====================================================
CREATE TABLE IF NOT EXISTS kpi_statistics (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    stat_date DATE NOT NULL,
    campaign_name VARCHAR(255),
    total_differences INTEGER DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, stat_date, campaign_name)
);

CREATE INDEX IF NOT EXISTS idx_kpi_stats_user_date ON kpi_statistics(user_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_stats_campaign ON kpi_statistics(campaign_name);
CREATE INDEX IF NOT EXISTS idx_kpi_stats_date ON kpi_statistics(stat_date DESC);

COMMENT ON TABLE kpi_statistics IS 'Daily KPI statistics aggregated by user';
COMMENT ON COLUMN kpi_statistics.total_differences IS 'Total number of product differences found';
COMMENT ON COLUMN kpi_statistics.total_amount IS 'Total KPI amount (VNĐ)';

-- =====================================================
-- 4. Held Products
-- Products being held/edited by users in orders
-- =====================================================
CREATE TABLE IF NOT EXISTS held_products (
    order_id VARCHAR(255) NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    is_draft BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id, product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_held_products_order ON held_products(order_id);
CREATE INDEX IF NOT EXISTS idx_held_products_user ON held_products(user_id);
CREATE INDEX IF NOT EXISTS idx_held_products_updated ON held_products(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_held_products_draft ON held_products(is_draft) WHERE is_draft = TRUE;

COMMENT ON TABLE held_products IS 'Products currently held/being edited by users';
COMMENT ON COLUMN held_products.is_draft IS 'TRUE = saved for later, FALSE = temporary hold';
COMMENT ON COLUMN held_products.data IS 'Full product data: {quantity, price, productCode, etc.}';

-- =====================================================
-- 5. Report Order Details
-- Cached order details for reports
-- =====================================================
CREATE TABLE IF NOT EXISTS report_order_details (
    table_name VARCHAR(255) PRIMARY KEY,
    orders JSONB NOT NULL,
    record_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_order_updated ON report_order_details(updated_at DESC);

COMMENT ON TABLE report_order_details IS 'Cached order details for report tables';
COMMENT ON COLUMN report_order_details.table_name IS 'Report table identifier';
COMMENT ON COLUMN report_order_details.orders IS 'Array of order objects';

-- =====================================================
-- 6. Soluong Products (Inventory)
-- Live inventory product data
-- =====================================================
CREATE TABLE IF NOT EXISTS soluong_products (
    id VARCHAR(255) PRIMARY KEY,
    product_code VARCHAR(255),
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_soluong_products_code ON soluong_products(product_code);
CREATE INDEX IF NOT EXISTS idx_soluong_products_updated ON soluong_products(updated_at DESC);

COMMENT ON TABLE soluong_products IS 'Live inventory products';

-- =====================================================
-- 7. Soluong Metadata
-- Metadata for inventory system
-- =====================================================
CREATE TABLE IF NOT EXISTS soluong_meta (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE soluong_meta IS 'Metadata for inventory system (last_updated, config, etc.)';

-- =====================================================
-- TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- =====================================================

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables
DROP TRIGGER IF EXISTS update_realtime_kv_timestamp ON realtime_kv;
CREATE TRIGGER update_realtime_kv_timestamp
    BEFORE UPDATE ON realtime_kv
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_kpi_base_timestamp ON kpi_base;
CREATE TRIGGER update_kpi_base_timestamp
    BEFORE UPDATE ON kpi_base
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_kpi_statistics_timestamp ON kpi_statistics;
CREATE TRIGGER update_kpi_statistics_timestamp
    BEFORE UPDATE ON kpi_statistics
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_held_products_timestamp ON held_products;
CREATE TRIGGER update_held_products_timestamp
    BEFORE UPDATE ON held_products
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_report_order_timestamp ON report_order_details;
CREATE TRIGGER update_report_order_timestamp
    BEFORE UPDATE ON report_order_details
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_soluong_products_timestamp ON soluong_products;
CREATE TRIGGER update_soluong_products_timestamp
    BEFORE UPDATE ON soluong_products
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_soluong_meta_timestamp ON soluong_meta;
CREATE TRIGGER update_soluong_meta_timestamp
    BEFORE UPDATE ON soluong_meta
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- =====================================================
-- 8. Tag Updates (Realtime Tag Sync)
-- Replaces: firebase.database().ref('tag_updates')
-- =====================================================
CREATE TABLE IF NOT EXISTS tag_updates (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    order_code VARCHAR(100),
    stt INTEGER,
    tags JSONB NOT NULL,
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tag_updates_order ON tag_updates(order_id);
CREATE INDEX IF NOT EXISTS idx_tag_updates_updated ON tag_updates(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tag_updates_user ON tag_updates(updated_by);

COMMENT ON TABLE tag_updates IS 'Realtime tag updates for orders (multi-user sync)';
COMMENT ON COLUMN tag_updates.tags IS 'Array of tag objects: [{Id, Name, Color}]';

-- =====================================================
-- 9. Dropped Products (Multi-User Sync)
-- Replaces: firebase.database().ref('dropped_products')
-- =====================================================
CREATE TABLE IF NOT EXISTS dropped_products (
    id VARCHAR(255) PRIMARY KEY,
    product_code VARCHAR(255),
    product_name TEXT,
    size VARCHAR(50),
    quantity INTEGER DEFAULT 1,
    user_id VARCHAR(255),
    user_name VARCHAR(255),
    order_id VARCHAR(255),
    is_draft BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropped_products_user ON dropped_products(user_id);
CREATE INDEX IF NOT EXISTS idx_dropped_products_order ON dropped_products(order_id);
CREATE INDEX IF NOT EXISTS idx_dropped_products_code ON dropped_products(product_code);
CREATE INDEX IF NOT EXISTS idx_dropped_products_updated ON dropped_products(updated_at DESC);

COMMENT ON TABLE dropped_products IS 'Dropped products for multi-user collaboration';
COMMENT ON COLUMN dropped_products.id IS 'Firebase-style ID (e.g., "-OhNkGnH6dnGuTpLhHsX")';

-- =====================================================
-- 10. Note Snapshots (Note Edit Tracking)
-- Replaces: firebase.database().ref('note_snapshots')
-- =====================================================
CREATE TABLE IF NOT EXISTS note_snapshots (
    order_id VARCHAR(255) PRIMARY KEY,
    note_text TEXT,
    encoded_products TEXT,
    snapshot_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_note_snapshots_expires ON note_snapshots(expires_at);
CREATE INDEX IF NOT EXISTS idx_note_snapshots_updated ON note_snapshots(updated_at DESC);

COMMENT ON TABLE note_snapshots IS 'Note snapshots for edit detection (auto-expire after 7 days)';
COMMENT ON COLUMN note_snapshots.snapshot_hash IS 'MD5 hash of note content for quick comparison';

-- Apply triggers to new tables
DROP TRIGGER IF EXISTS update_tag_updates_timestamp ON tag_updates;
CREATE TRIGGER update_tag_updates_timestamp
    BEFORE UPDATE ON tag_updates
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_dropped_products_timestamp ON dropped_products;
CREATE TRIGGER update_dropped_products_timestamp
    BEFORE UPDATE ON dropped_products
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_note_snapshots_timestamp ON note_snapshots;
CREATE TRIGGER update_note_snapshots_timestamp
    BEFORE UPDATE ON note_snapshots
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- =====================================================
-- VERIFICATION QUERIES
-- Run these to verify migration success
-- =====================================================

-- Check all tables created
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%kpi%' OR table_name LIKE '%held%' OR table_name LIKE '%tag%' OR table_name LIKE '%dropped%' OR table_name = 'realtime_kv') ORDER BY table_name;

-- Check all indexes
-- SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;

-- Check all triggers
-- SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table;

-- Count records in each table
-- SELECT 'realtime_kv' as table_name, COUNT(*) as count FROM realtime_kv
-- UNION ALL SELECT 'kpi_base', COUNT(*) FROM kpi_base
-- UNION ALL SELECT 'held_products', COUNT(*) FROM held_products
-- UNION ALL SELECT 'tag_updates', COUNT(*) FROM tag_updates
-- UNION ALL SELECT 'dropped_products', COUNT(*) FROM dropped_products
-- UNION ALL SELECT 'note_snapshots', COUNT(*) FROM note_snapshots;

-- =====================================================
-- MIGRATION COMPLETE
-- Total Tables: 10
-- - realtime_kv
-- - kpi_base
-- - kpi_statistics
-- - held_products
-- - report_order_details
-- - soluong_products
-- - soluong_meta
-- - tag_updates
-- - dropped_products
-- - note_snapshots
-- =====================================================
