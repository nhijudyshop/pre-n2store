-- Migration: Create tpos_saved_customers table
-- Purpose: Store customers saved from TPOS Live Campaign to show in Pancake "Lưu Tpos" tab

CREATE TABLE IF NOT EXISTS tpos_saved_customers (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(100) NOT NULL,          -- Facebook PSID/ASUID
    customer_name VARCHAR(255) NOT NULL,
    page_id VARCHAR(100),                        -- Facebook Page ID
    page_name VARCHAR(255),
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    saved_by VARCHAR(100),                       -- User who saved (optional)
    notes TEXT,                                  -- Optional notes
    UNIQUE(customer_id)                          -- Each customer can only be saved once
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tpos_saved_customers_customer_id ON tpos_saved_customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_tpos_saved_customers_page_id ON tpos_saved_customers(page_id);
CREATE INDEX IF NOT EXISTS idx_tpos_saved_customers_saved_at ON tpos_saved_customers(saved_at DESC);

-- Comment for documentation
COMMENT ON TABLE tpos_saved_customers IS 'Stores customers saved from TPOS Live Campaign for Pancake Lưu Tpos tab';
