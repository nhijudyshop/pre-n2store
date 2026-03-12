-- =====================================================
-- Migration: 024_admin_settings_table.sql
-- Purpose: Create admin_settings table for runtime configuration
-- Created: 2026-01-23
-- =====================================================

-- Admin Settings Table for runtime configuration
CREATE TABLE IF NOT EXISTS admin_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON admin_settings(setting_key);

-- Default: auto_approve_enabled = true (giữ nguyên behavior hiện tại)
-- Khi BẬT: QR/SĐT chính xác/1 KH khớp sẽ tự động duyệt và cộng ví
-- Khi TẮT: tất cả cần kế toán duyệt trước khi cộng ví
INSERT INTO admin_settings (setting_key, setting_value, description)
VALUES (
    'auto_approve_enabled',
    'true',
    'Khi BẬT: QR/SĐT chính xác/1 KH khớp sẽ tự động duyệt và cộng ví. Khi TẮT: tất cả cần kế toán duyệt.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Add comment
COMMENT ON TABLE admin_settings IS 'Runtime configuration settings for admin features';
