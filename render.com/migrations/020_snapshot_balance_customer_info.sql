-- =====================================================
-- MIGRATION: Snapshot balance_customer_info table
-- Date: 2026-01-16
-- Purpose: Archive old data, create empty table for backward compatibility
-- =====================================================

-- Step 1: Backup current table
CREATE TABLE IF NOT EXISTS balance_customer_info_backup AS
SELECT * FROM balance_customer_info;

-- Step 2: Rename current table to snapshot
ALTER TABLE balance_customer_info RENAME TO balance_customer_info_snapshot;

-- Step 3: Create new empty table with same schema
CREATE TABLE balance_customer_info (
    unique_code VARCHAR(255) PRIMARY KEY,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    extraction_note TEXT,
    name_fetch_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 4: Create indexes for performance
CREATE INDEX idx_bci_phone ON balance_customer_info(customer_phone);
CREATE INDEX idx_bci_unique_code ON balance_customer_info(unique_code);

-- Step 5: Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_balance_customer_info_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bci_timestamp ON balance_customer_info;
CREATE TRIGGER update_bci_timestamp
    BEFORE UPDATE ON balance_customer_info
    FOR EACH ROW
    EXECUTE FUNCTION update_balance_customer_info_timestamp();

-- =====================================================
-- ROLLBACK SCRIPT (if needed):
-- =====================================================
-- DROP TABLE balance_customer_info;
-- ALTER TABLE balance_customer_info_snapshot RENAME TO balance_customer_info;
-- DROP TABLE balance_customer_info_backup;
