-- =====================================================
-- MIGRATION 006: Schema Normalization
-- Purpose: Normalize data, add missing indexes, improve data integrity
-- =====================================================
-- Created: 2026-01-12
-- Part of: Unified Architecture Plan - Phase 1
-- =====================================================

-- =====================================================
-- PART 1: ADD customer_id FOREIGN KEY WHERE MISSING
-- Ensure all tables reference customers via customer_id
-- =====================================================

-- 1.1 Add customer_id to virtual_credits if missing
ALTER TABLE virtual_credits
ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);

-- 1.2 Populate customer_id in virtual_credits from phone
UPDATE virtual_credits vc
SET customer_id = c.id
FROM customers c
WHERE vc.phone = c.phone AND vc.customer_id IS NULL;

-- 1.3 Populate customer_id in wallet_transactions from phone
ALTER TABLE wallet_transactions
ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);

UPDATE wallet_transactions wt
SET customer_id = c.id
FROM customers c
WHERE wt.phone = c.phone AND wt.customer_id IS NULL;

-- 1.4 Populate customer_id in customer_activities from phone
UPDATE customer_activities ca
SET customer_id = c.id
FROM customers c
WHERE ca.phone = c.phone AND ca.customer_id IS NULL;

-- 1.5 Populate customer_id in customer_notes from phone
UPDATE customer_notes cn
SET customer_id = c.id
FROM customers c
WHERE cn.phone = c.phone AND cn.customer_id IS NULL;

-- =====================================================
-- PART 2: ADD PERFORMANCE INDEXES
-- Optimize common query patterns
-- =====================================================

-- 2.1 Composite index for virtual credits lookup (customer + status + expiry)
CREATE INDEX IF NOT EXISTS idx_virtual_credits_customer_active
ON virtual_credits(customer_id, status, expires_at)
WHERE status = 'ACTIVE';

-- 2.2 Composite index for tickets by customer and status
CREATE INDEX IF NOT EXISTS idx_tickets_customer_status_composite
ON customer_tickets(customer_id, status, created_at DESC);

-- 2.3 Index for balance_history by customer and date
CREATE INDEX IF NOT EXISTS idx_balance_history_customer_date
ON balance_history(customer_id, created_at DESC)
WHERE customer_id IS NOT NULL;

-- 2.4 Index for wallet transactions by type and date
CREATE INDEX IF NOT EXISTS idx_wtx_type_date
ON wallet_transactions(type, created_at DESC);

-- 2.5 Index for customers by RFM segment and tier
CREATE INDEX IF NOT EXISTS idx_customers_segment_tier
ON customers(rfm_segment, tier);

-- 2.6 Index for active virtual credits (for cron job)
CREATE INDEX IF NOT EXISTS idx_virtual_credits_expiring_soon
ON virtual_credits(expires_at)
WHERE status = 'ACTIVE';

-- =====================================================
-- PART 3: ADD CONSTRAINTS FOR DATA INTEGRITY
-- =====================================================

-- 3.1 Ensure wallet balance never goes negative (if not already)
-- Note: This may fail if constraint already exists, that's OK
DO $$
BEGIN
    ALTER TABLE customer_wallets
    ADD CONSTRAINT chk_wallet_balance_positive
    CHECK (balance >= 0);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3.2 Ensure virtual credit remaining <= original
DO $$
BEGIN
    ALTER TABLE virtual_credits
    ADD CONSTRAINT chk_virtual_credit_remaining
    CHECK (remaining_amount <= original_amount);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- PART 4: ADD HELPER COLUMNS FOR REPORTING
-- =====================================================

-- 4.1 Add rfm_total_score computed column to customers
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS rfm_total_score INTEGER GENERATED ALWAYS AS
    (COALESCE(rfm_recency_score, 0) + COALESCE(rfm_frequency_score, 0) + COALESCE(rfm_monetary_score, 0))
STORED;

-- 4.2 Add wallet_total_balance to include virtual balance (for quick lookups)
-- Note: This is informational, actual FIFO logic is in function

-- =====================================================
-- PART 5: CREATE UTILITY FUNCTIONS
-- =====================================================

-- 5.1 Function to normalize phone number (Vietnamese format)
CREATE OR REPLACE FUNCTION normalize_phone(raw_phone TEXT)
RETURNS VARCHAR(20) AS $$
DECLARE
    cleaned TEXT;
BEGIN
    -- Remove all non-digit characters
    cleaned := REGEXP_REPLACE(raw_phone, '[^0-9]', '', 'g');

    -- Handle Vietnamese phone formats
    -- +84 -> 0
    IF cleaned LIKE '84%' AND LENGTH(cleaned) = 11 THEN
        cleaned := '0' || SUBSTRING(cleaned FROM 3);
    END IF;

    -- Ensure starts with 0
    IF cleaned NOT LIKE '0%' AND LENGTH(cleaned) = 9 THEN
        cleaned := '0' || cleaned;
    END IF;

    RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5.2 Function to get customer by phone (creates if not exists)
CREATE OR REPLACE FUNCTION get_or_create_customer(
    p_phone VARCHAR(20),
    p_name VARCHAR(255) DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_customer_id INTEGER;
    v_normalized_phone VARCHAR(20);
BEGIN
    -- Normalize phone
    v_normalized_phone := normalize_phone(p_phone);

    -- Try to find existing customer
    SELECT id INTO v_customer_id
    FROM customers
    WHERE phone = v_normalized_phone;

    -- Create if not found
    IF v_customer_id IS NULL THEN
        INSERT INTO customers (phone, name, tier, created_at, updated_at)
        VALUES (
            v_normalized_phone,
            COALESCE(p_name, 'Khach hang ' || v_normalized_phone),
            'normal',
            NOW(),
            NOW()
        )
        RETURNING id INTO v_customer_id;

        -- Auto-create wallet for new customer
        INSERT INTO customer_wallets (customer_id, phone, balance, virtual_balance, created_at)
        VALUES (v_customer_id, v_normalized_phone, 0, 0, NOW())
        ON CONFLICT (phone) DO NOTHING;
    END IF;

    RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 6: CREATE ANALYTICS VIEWS
-- =====================================================

-- 6.1 Daily wallet transactions summary
CREATE OR REPLACE VIEW daily_wallet_summary AS
SELECT
    DATE(created_at) AS date,
    type,
    COUNT(*) AS transaction_count,
    SUM(ABS(amount)) AS total_amount,
    COUNT(DISTINCT phone) AS unique_customers
FROM wallet_transactions
GROUP BY DATE(created_at), type
ORDER BY date DESC, type;

-- 6.2 RFM segment distribution
CREATE OR REPLACE VIEW rfm_segment_distribution AS
SELECT
    rfm_segment AS segment,
    tier,
    COUNT(*) AS customer_count,
    ROUND(AVG(total_orders), 1) AS avg_orders,
    ROUND(AVG(total_spent), 0) AS avg_spent,
    ROUND(AVG(EXTRACT(DAY FROM NOW() - last_order_date)), 0) AS avg_days_since_order
FROM customers
WHERE rfm_segment IS NOT NULL
GROUP BY rfm_segment, tier
ORDER BY customer_count DESC;

-- 6.3 Ticket resolution metrics
CREATE OR REPLACE VIEW ticket_resolution_metrics AS
SELECT
    type,
    status,
    COUNT(*) AS ticket_count,
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600), 1) AS avg_resolution_hours,
    SUM(CASE WHEN wallet_credited THEN 1 ELSE 0 END) AS credited_count,
    SUM(COALESCE(virtual_credit_amount, 0)) AS total_virtual_credits_issued
FROM customer_tickets
GROUP BY type, status
ORDER BY type, status;

-- =====================================================
-- VERIFICATION
-- =====================================================

/*
-- Verify customer_id populated
SELECT
    'virtual_credits' AS table_name,
    COUNT(*) FILTER (WHERE customer_id IS NULL) AS missing_customer_id,
    COUNT(*) AS total
FROM virtual_credits
UNION ALL
SELECT
    'wallet_transactions',
    COUNT(*) FILTER (WHERE customer_id IS NULL),
    COUNT(*)
FROM wallet_transactions
UNION ALL
SELECT
    'customer_activities',
    COUNT(*) FILTER (WHERE customer_id IS NULL),
    COUNT(*)
FROM customer_activities;

-- Test normalize_phone function
SELECT
    normalize_phone('+84 123 456 789') AS test1,  -- Should be 0123456789
    normalize_phone('0123456789') AS test2,       -- Should be 0123456789
    normalize_phone('84123456789') AS test3;      -- Should be 0123456789

-- Test get_or_create_customer
SELECT get_or_create_customer('0987654321', 'Test Customer');

-- Verify views work
SELECT * FROM daily_wallet_summary LIMIT 5;
SELECT * FROM rfm_segment_distribution;
SELECT * FROM ticket_resolution_metrics;
*/

-- =====================================================
-- END OF MIGRATION 006
-- =====================================================
