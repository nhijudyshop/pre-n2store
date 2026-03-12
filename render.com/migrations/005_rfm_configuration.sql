-- =====================================================
-- MIGRATION 005: RFM Configuration Table
-- Purpose: Replace hardcoded RFM thresholds with configurable values
-- =====================================================
-- Created: 2026-01-12
-- Part of: Unified Architecture Plan - Phase 1
-- =====================================================

-- =====================================================
-- PART 1: RFM_CONFIG TABLE
-- Configurable thresholds for RFM scoring
-- =====================================================

CREATE TABLE IF NOT EXISTS rfm_config (
    id SERIAL PRIMARY KEY,

    -- Metric type: recency, frequency, monetary
    metric_type VARCHAR(20) NOT NULL CHECK (metric_type IN ('recency', 'frequency', 'monetary')),

    -- Score value (1-5, where 5 is best)
    score INT NOT NULL CHECK (score BETWEEN 1 AND 5),

    -- Range values (min inclusive, max inclusive, NULL means no limit)
    min_value DECIMAL(15,2),
    max_value DECIMAL(15,2),

    -- Human-readable description
    description TEXT,

    -- Enable/disable specific thresholds
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique metric + score combination
    UNIQUE(metric_type, score)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_rfm_config_metric ON rfm_config(metric_type, is_active);

-- =====================================================
-- PART 2: DEFAULT RFM VALUES
-- These can be updated via admin interface
-- =====================================================

-- Clear existing if any (for re-run safety)
DELETE FROM rfm_config WHERE TRUE;

-- Recency scoring (days since last order)
-- Score 5: Most recent customers (0-7 days)
-- Score 1: Churned customers (>180 days)
INSERT INTO rfm_config (metric_type, score, min_value, max_value, description) VALUES
('recency', 5, 0, 7, 'Active: Dat hang trong 7 ngay'),
('recency', 4, 8, 30, 'Recent: Dat hang trong 30 ngay'),
('recency', 3, 31, 90, 'Moderate: Dat hang trong 90 ngay'),
('recency', 2, 91, 180, 'Lapsing: 3-6 thang'),
('recency', 1, 181, NULL, 'Churned: >6 thang');

-- Frequency scoring (total order count)
-- Score 5: Champion customers (20+ orders)
-- Score 1: New customers (0-1 orders)
INSERT INTO rfm_config (metric_type, score, min_value, max_value, description) VALUES
('frequency', 5, 20, NULL, 'Champion: 20+ don hang'),
('frequency', 4, 10, 19, 'Loyal: 10-19 don hang'),
('frequency', 3, 5, 9, 'Regular: 5-9 don hang'),
('frequency', 2, 2, 4, 'Casual: 2-4 don hang'),
('frequency', 1, 0, 1, 'New: 0-1 don hang');

-- Monetary scoring (total spent in VND)
-- Score 5: High value (>10M VND)
-- Score 1: Minimal (<500K VND)
INSERT INTO rfm_config (metric_type, score, min_value, max_value, description) VALUES
('monetary', 5, 10000000, NULL, 'High Value: >10 trieu VND'),
('monetary', 4, 5000000, 9999999, 'Good Value: 5-10 trieu VND'),
('monetary', 3, 2000000, 4999999, 'Medium: 2-5 trieu VND'),
('monetary', 2, 500000, 1999999, 'Low: 0.5-2 trieu VND'),
('monetary', 1, 0, 499999, 'Minimal: <500K VND');

-- =====================================================
-- PART 3: CUSTOMER ACTIVITY SUMMARY VIEW
-- Aggregated view for Customer 360 dashboard
-- =====================================================

CREATE OR REPLACE VIEW customer_activity_summary AS
SELECT
    c.id AS customer_id,
    c.name,
    c.phone,
    c.tier,

    -- Wallet info
    COALESCE(w.balance, 0) AS wallet_balance,
    COALESCE(w.virtual_balance, 0) AS virtual_balance,

    -- Pending virtual credits (not expired)
    COALESCE(vc.pending_credits, 0) AS pending_virtual_credits,
    COALESCE(vc.credits_count, 0) AS active_credits_count,

    -- Ticket stats
    COALESCE(t.open_tickets, 0) AS open_tickets,
    COALESCE(t.total_tickets, 0) AS total_tickets,

    -- Balance history deposits
    COALESCE(bh.total_deposits, 0) AS total_bank_deposits,
    COALESCE(bh.deposit_count, 0) AS bank_deposit_count,

    -- RFM scores
    c.rfm_recency_score,
    c.rfm_frequency_score,
    c.rfm_monetary_score,
    c.rfm_segment,

    -- Order stats
    c.last_order_date,
    c.total_orders,
    c.total_spent,
    c.return_rate,

    -- Days since last order
    CASE
        WHEN c.last_order_date IS NOT NULL
        THEN EXTRACT(DAY FROM NOW() - c.last_order_date)::INT
        ELSE NULL
    END AS days_since_last_order

FROM customers c

LEFT JOIN customer_wallets w ON c.id = w.customer_id

LEFT JOIN (
    SELECT
        wallet_id,
        SUM(remaining_amount) AS pending_credits,
        COUNT(*) AS credits_count
    FROM virtual_credits
    WHERE status = 'ACTIVE' AND expires_at > NOW()
    GROUP BY wallet_id
) vc ON w.id = vc.wallet_id

LEFT JOIN (
    SELECT
        customer_id,
        COUNT(*) FILTER (WHERE status IN ('PENDING', 'IN_PROGRESS', 'PENDING_GOODS', 'PENDING_FINANCE')) AS open_tickets,
        COUNT(*) AS total_tickets
    FROM customer_tickets
    GROUP BY customer_id
) t ON c.id = t.customer_id

LEFT JOIN (
    SELECT
        customer_id,
        SUM(transfer_amount) AS total_deposits,
        COUNT(*) AS deposit_count
    FROM balance_history
    WHERE customer_id IS NOT NULL AND transfer_amount > 0
    GROUP BY customer_id
) bh ON c.id = bh.customer_id;

-- =====================================================
-- PART 4: RFM SEGMENT MAPPING VIEW
-- Map RFM scores to customer segments
-- =====================================================

CREATE OR REPLACE VIEW rfm_segment_mapping AS
SELECT
    c.id AS customer_id,
    c.phone,
    c.name,
    c.rfm_recency_score AS r,
    c.rfm_frequency_score AS f,
    c.rfm_monetary_score AS m,
    (c.rfm_recency_score + c.rfm_frequency_score + c.rfm_monetary_score) AS total_score,

    -- Segment based on combined scores
    CASE
        -- Champions: High on all metrics (R>=4, F>=4, M>=4)
        WHEN c.rfm_recency_score >= 4 AND c.rfm_frequency_score >= 4 AND c.rfm_monetary_score >= 4
        THEN 'Champion'

        -- Loyal: Good frequency, decent recency (R>=3, F>=4)
        WHEN c.rfm_recency_score >= 3 AND c.rfm_frequency_score >= 4
        THEN 'Loyal'

        -- Potential Loyalist: Recent with moderate frequency (R>=4, F>=2)
        WHEN c.rfm_recency_score >= 4 AND c.rfm_frequency_score >= 2
        THEN 'Potential_Loyalist'

        -- New Customers: Very recent, low frequency (R>=4, F<=2)
        WHEN c.rfm_recency_score >= 4 AND c.rfm_frequency_score <= 2
        THEN 'New_Customer'

        -- At Risk: Used to be good, now lapsing (R<=2, F>=3)
        WHEN c.rfm_recency_score <= 2 AND c.rfm_frequency_score >= 3
        THEN 'At_Risk'

        -- Can't Lose: High value but churning (R<=2, M>=4)
        WHEN c.rfm_recency_score <= 2 AND c.rfm_monetary_score >= 4
        THEN 'Cant_Lose'

        -- Hibernating: Low across all (R<=2, F<=2, M<=2)
        WHEN c.rfm_recency_score <= 2 AND c.rfm_frequency_score <= 2 AND c.rfm_monetary_score <= 2
        THEN 'Hibernating'

        -- Need Attention: Moderate across all
        WHEN c.rfm_recency_score = 3 OR c.rfm_frequency_score = 3
        THEN 'Need_Attention'

        ELSE 'Other'
    END AS segment,

    c.total_orders,
    c.total_spent,
    c.last_order_date

FROM customers c
WHERE c.rfm_recency_score > 0 OR c.rfm_frequency_score > 0 OR c.rfm_monetary_score > 0;

-- =====================================================
-- VERIFICATION
-- =====================================================

/*
-- Verify RFM config populated
SELECT metric_type, COUNT(*) as scores FROM rfm_config GROUP BY metric_type;

-- Expected output:
-- metric_type | scores
-- -----------+---------
-- recency    | 5
-- frequency  | 5
-- monetary   | 5

-- Test customer_activity_summary view
SELECT * FROM customer_activity_summary LIMIT 5;

-- Test rfm_segment_mapping view
SELECT segment, COUNT(*) FROM rfm_segment_mapping GROUP BY segment;
*/

-- =====================================================
-- END OF MIGRATION 005
-- =====================================================
