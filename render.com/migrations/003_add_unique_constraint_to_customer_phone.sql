-- =====================================================
-- MIGRATION: Add UNIQUE constraint to customers.phone
-- =====================================================
-- Created: 2026-01-11
-- Reason: Prevent duplicate customers with same phone
-- Depends on: create_customers_table.sql
-- =====================================================

-- Step 1: Find and remove duplicates (keep the one with lowest ID)
-- First, create a temp table to store duplicates
CREATE TEMP TABLE duplicate_phones AS
SELECT phone, MIN(id) as keep_id
FROM customers
WHERE phone IS NOT NULL
GROUP BY phone
HAVING COUNT(*) > 1;

-- Delete duplicate records (keep the one with lowest ID)
DELETE FROM customers
WHERE phone IN (SELECT phone FROM duplicate_phones)
  AND id NOT IN (SELECT keep_id FROM duplicate_phones);

-- Drop temp table
DROP TABLE IF EXISTS duplicate_phones;

-- Step 2: Add UNIQUE constraint
-- Use CREATE UNIQUE INDEX instead of ALTER TABLE for better performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique ON customers(phone);

-- Alternative: Add constraint directly (may fail if duplicates exist)
-- ALTER TABLE customers ADD CONSTRAINT customers_phone_unique UNIQUE (phone);

-- =====================================================
-- VERIFICATION
-- =====================================================
/*
-- Check no duplicates exist:
SELECT phone, COUNT(*) as cnt
FROM customers
WHERE phone IS NOT NULL
GROUP BY phone
HAVING COUNT(*) > 1;

-- Check unique index exists:
SELECT indexname FROM pg_indexes
WHERE tablename = 'customers' AND indexname = 'idx_customers_phone_unique';
*/
