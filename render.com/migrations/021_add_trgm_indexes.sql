-- Migration: Add pg_trgm indexes for faster ILIKE search
-- Purpose: Speed up customer search with leading wildcards (ILIKE '%search%')
-- Impact: Search queries on phone/name will use GIN index instead of full table scan

-- Enable pg_trgm extension (required for trigram indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on phone column for trigram search
-- CONCURRENTLY allows the table to remain available during index creation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_phone_trgm
ON customers USING GIN(phone gin_trgm_ops);

-- Create GIN index on name column for trigram search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_name_trgm
ON customers USING GIN(name gin_trgm_ops);

-- Verify indexes were created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'customers'
  AND indexname LIKE '%trgm%';

-- Example: Before vs After performance
-- BEFORE (no index): Sequential scan, O(n) time
-- AFTER (with pg_trgm GIN index): Index scan, much faster

-- Usage notes:
-- 1. These indexes support ILIKE queries with leading wildcards: WHERE phone ILIKE '%0912%'
-- 2. Also support similarity search: WHERE phone % '0912345678'
-- 3. Index size will be roughly 2-3x the column data size
-- 4. Rebuild may be needed after major data changes: REINDEX INDEX idx_customers_phone_trgm;
