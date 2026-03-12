-- =====================================================
-- MIGRATION 007: Updated RFM Function with Config Table
-- Purpose: Replace hardcoded RFM thresholds with configurable values from rfm_config table
-- =====================================================
-- Created: 2026-01-12
-- Depends on: 005_rfm_configuration.sql
-- Part of: Unified Architecture Plan - Phase 1
-- =====================================================

-- =====================================================
-- PART 1: NEW RFM CALCULATION FUNCTION (v2)
-- Uses rfm_config table for dynamic thresholds
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_customer_rfm_v2(p_customer_id INTEGER)
RETURNS TABLE (
    recency_score INTEGER,
    frequency_score INTEGER,
    monetary_score INTEGER,
    total_score INTEGER,
    segment VARCHAR
) AS $$
DECLARE
    v_days_since_order INTEGER;
    v_order_count INTEGER;
    v_total_spent DECIMAL(15,2);
    v_recency INTEGER := 1;
    v_frequency INTEGER := 1;
    v_monetary INTEGER := 1;
    v_segment VARCHAR(30);
BEGIN
    -- Get customer metrics
    SELECT
        COALESCE(EXTRACT(DAY FROM NOW() - last_order_date)::INTEGER, 999),
        COALESCE(total_orders, 0),
        COALESCE(total_spent, 0)
    INTO v_days_since_order, v_order_count, v_total_spent
    FROM customers
    WHERE id = p_customer_id;

    -- If customer not found, return defaults
    IF NOT FOUND THEN
        RETURN QUERY SELECT 1, 1, 1, 3, 'Unknown'::VARCHAR;
        RETURN;
    END IF;

    -- Calculate Recency Score from config table
    SELECT score INTO v_recency
    FROM rfm_config
    WHERE metric_type = 'recency'
    AND is_active = true
    AND v_days_since_order >= COALESCE(min_value, 0)
    AND (max_value IS NULL OR v_days_since_order <= max_value)
    ORDER BY score DESC
    LIMIT 1;

    -- Calculate Frequency Score from config table
    SELECT score INTO v_frequency
    FROM rfm_config
    WHERE metric_type = 'frequency'
    AND is_active = true
    AND v_order_count >= COALESCE(min_value, 0)
    AND (max_value IS NULL OR v_order_count <= max_value)
    ORDER BY score DESC
    LIMIT 1;

    -- Calculate Monetary Score from config table
    SELECT score INTO v_monetary
    FROM rfm_config
    WHERE metric_type = 'monetary'
    AND is_active = true
    AND v_total_spent >= COALESCE(min_value, 0)
    AND (max_value IS NULL OR v_total_spent <= max_value)
    ORDER BY score DESC
    LIMIT 1;

    -- Fallback to 1 if no match found
    v_recency := COALESCE(v_recency, 1);
    v_frequency := COALESCE(v_frequency, 1);
    v_monetary := COALESCE(v_monetary, 1);

    -- Determine Segment based on RFM combination
    v_segment := CASE
        -- Champions: High on all metrics (R>=4, F>=4, M>=4)
        WHEN v_recency >= 4 AND v_frequency >= 4 AND v_monetary >= 4 THEN 'Champion'

        -- Loyal: Good frequency and recency (R>=3, F>=4)
        WHEN v_recency >= 3 AND v_frequency >= 4 THEN 'Loyal'

        -- Potential Loyalist: Recent with moderate frequency (R>=4, F>=2, M>=2)
        WHEN v_recency >= 4 AND v_frequency >= 2 AND v_monetary >= 2 THEN 'Potential_Loyalist'

        -- New Customers: Very recent, low frequency (R>=4, F<=2)
        WHEN v_recency >= 4 AND v_frequency <= 2 THEN 'New_Customer'

        -- Promising: Recent, moderate other scores (R>=4, F=2-3)
        WHEN v_recency >= 4 AND v_frequency BETWEEN 2 AND 3 THEN 'Promising'

        -- Need Attention: Above average but slipping (R=3, F>=3, M>=3)
        WHEN v_recency = 3 AND v_frequency >= 3 AND v_monetary >= 3 THEN 'Need_Attention'

        -- About to Sleep: Below average recency, was good (R=2-3, F>=2, M>=2)
        WHEN v_recency BETWEEN 2 AND 3 AND v_frequency >= 2 AND v_monetary >= 2 THEN 'About_To_Sleep'

        -- At Risk: Used to be good customers (R<=2, F>=3, M>=3)
        WHEN v_recency <= 2 AND v_frequency >= 3 AND v_monetary >= 3 THEN 'At_Risk'

        -- Can't Lose: High value but churning (R<=2, F>=3, M>=4)
        WHEN v_recency <= 2 AND v_frequency >= 3 AND v_monetary >= 4 THEN 'Cant_Lose'

        -- Hibernating: Low recency and frequency (R<=2, F<=2)
        WHEN v_recency <= 2 AND v_frequency <= 2 THEN 'Hibernating'

        -- Lost: Very low on all (R=1, F=1, M<=2)
        WHEN v_recency = 1 AND v_frequency = 1 AND v_monetary <= 2 THEN 'Lost'

        ELSE 'Other'
    END;

    RETURN QUERY SELECT v_recency, v_frequency, v_monetary,
                        (v_recency + v_frequency + v_monetary),
                        v_segment;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 2: UPDATE CUSTOMER RFM FUNCTION (v2)
-- Wrapper to update customer record with new RFM
-- =====================================================

CREATE OR REPLACE FUNCTION update_customer_rfm_v2(p_customer_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_rfm RECORD;
BEGIN
    -- Calculate RFM using v2 function
    SELECT * INTO v_rfm FROM calculate_customer_rfm_v2(p_customer_id);

    -- Update customer record
    UPDATE customers
    SET
        rfm_recency_score = v_rfm.recency_score,
        rfm_frequency_score = v_rfm.frequency_score,
        rfm_monetary_score = v_rfm.monetary_score,
        rfm_segment = v_rfm.segment,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 3: BATCH UPDATE ALL CUSTOMERS RFM
-- For daily cron job
-- =====================================================

CREATE OR REPLACE FUNCTION update_all_customers_rfm()
RETURNS TABLE (
    updated_count INTEGER,
    segment_distribution JSONB
) AS $$
DECLARE
    v_count INTEGER := 0;
    v_customer RECORD;
    v_distribution JSONB;
BEGIN
    -- Loop through all active customers
    FOR v_customer IN
        SELECT id FROM customers
        WHERE status IS NULL OR status NOT IN ('blocked', 'deleted')
    LOOP
        PERFORM update_customer_rfm_v2(v_customer.id);
        v_count := v_count + 1;
    END LOOP;

    -- Calculate segment distribution
    SELECT jsonb_object_agg(
        COALESCE(rfm_segment, 'Unknown'),
        cnt
    ) INTO v_distribution
    FROM (
        SELECT rfm_segment, COUNT(*) as cnt
        FROM customers
        WHERE rfm_segment IS NOT NULL
        GROUP BY rfm_segment
    ) t;

    RETURN QUERY SELECT v_count, COALESCE(v_distribution, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 4: UPDATE RFM CONFIG FUNCTION
-- Admin function to update RFM thresholds
-- =====================================================

CREATE OR REPLACE FUNCTION update_rfm_threshold(
    p_metric_type VARCHAR(20),
    p_score INTEGER,
    p_min_value DECIMAL(15,2),
    p_max_value DECIMAL(15,2),
    p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Validate metric_type
    IF p_metric_type NOT IN ('recency', 'frequency', 'monetary') THEN
        RAISE EXCEPTION 'Invalid metric_type: %. Must be recency, frequency, or monetary', p_metric_type;
    END IF;

    -- Validate score
    IF p_score < 1 OR p_score > 5 THEN
        RAISE EXCEPTION 'Invalid score: %. Must be between 1 and 5', p_score;
    END IF;

    -- Upsert the threshold
    INSERT INTO rfm_config (metric_type, score, min_value, max_value, description, updated_at)
    VALUES (p_metric_type, p_score, p_min_value, p_max_value, COALESCE(p_description, ''), NOW())
    ON CONFLICT (metric_type, score)
    DO UPDATE SET
        min_value = EXCLUDED.min_value,
        max_value = EXCLUDED.max_value,
        description = COALESCE(EXCLUDED.description, rfm_config.description),
        updated_at = NOW();

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 5: GET RFM THRESHOLDS FUNCTION
-- Return current RFM configuration
-- =====================================================

CREATE OR REPLACE FUNCTION get_rfm_thresholds()
RETURNS TABLE (
    metric_type VARCHAR(20),
    score INTEGER,
    min_value DECIMAL(15,2),
    max_value DECIMAL(15,2),
    description TEXT,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rc.metric_type,
        rc.score,
        rc.min_value,
        rc.max_value,
        rc.description,
        rc.is_active
    FROM rfm_config rc
    ORDER BY rc.metric_type, rc.score DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 6: CUSTOMER RFM ANALYSIS FUNCTION
-- Detailed RFM analysis for a single customer
-- =====================================================

CREATE OR REPLACE FUNCTION analyze_customer_rfm(p_customer_id INTEGER)
RETURNS TABLE (
    customer_id INTEGER,
    customer_name VARCHAR,
    customer_phone VARCHAR,
    days_since_order INTEGER,
    total_orders INTEGER,
    total_spent DECIMAL,
    recency_score INTEGER,
    recency_description TEXT,
    frequency_score INTEGER,
    frequency_description TEXT,
    monetary_score INTEGER,
    monetary_description TEXT,
    total_score INTEGER,
    segment VARCHAR,
    recommendations TEXT[]
) AS $$
DECLARE
    v_customer RECORD;
    v_rfm RECORD;
    v_days INTEGER;
    v_orders INTEGER;
    v_spent DECIMAL;
    v_r_desc TEXT;
    v_f_desc TEXT;
    v_m_desc TEXT;
    v_recommendations TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Get customer data
    SELECT
        c.id, c.name, c.phone,
        COALESCE(EXTRACT(DAY FROM NOW() - c.last_order_date)::INTEGER, 999),
        COALESCE(c.total_orders, 0),
        COALESCE(c.total_spent, 0)
    INTO v_customer.id, v_customer.name, v_customer.phone, v_days, v_orders, v_spent
    FROM customers c
    WHERE c.id = p_customer_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Get RFM scores
    SELECT * INTO v_rfm FROM calculate_customer_rfm_v2(p_customer_id);

    -- Get descriptions
    SELECT description INTO v_r_desc FROM rfm_config
    WHERE metric_type = 'recency' AND score = v_rfm.recency_score AND is_active LIMIT 1;

    SELECT description INTO v_f_desc FROM rfm_config
    WHERE metric_type = 'frequency' AND score = v_rfm.frequency_score AND is_active LIMIT 1;

    SELECT description INTO v_m_desc FROM rfm_config
    WHERE metric_type = 'monetary' AND score = v_rfm.monetary_score AND is_active LIMIT 1;

    -- Generate recommendations based on segment
    CASE v_rfm.segment
        WHEN 'Champion' THEN
            v_recommendations := ARRAY['Thuong VIP cho khach hang tot nhat', 'Moi tham gia chuong trinh gioi thieu'];
        WHEN 'Loyal' THEN
            v_recommendations := ARRAY['Gui thong bao san pham moi', 'Cung cap uu dai doc quyen'];
        WHEN 'Potential_Loyalist' THEN
            v_recommendations := ARRAY['Khuyen khich mua them', 'De xuat san pham lien quan'];
        WHEN 'New_Customer' THEN
            v_recommendations := ARRAY['Gui huong dan su dung', 'Cung cap ma giam gia cho don ke tiep'];
        WHEN 'At_Risk' THEN
            v_recommendations := ARRAY['Gui thong bao khoi phuc', 'Cung cap uu dai dac biet'];
        WHEN 'Cant_Lose' THEN
            v_recommendations := ARRAY['Lien he truc tiep', 'Uu dai ca nhan hoa lon'];
        WHEN 'Hibernating' THEN
            v_recommendations := ARRAY['Chien dich tai kich hoat', 'Khao sat ly do roi bo'];
        WHEN 'Lost' THEN
            v_recommendations := ARRAY['Email/SMS tai kich hoat cuoi cung', 'Xem xet loai khoi danh sach'];
        ELSE
            v_recommendations := ARRAY['Theo doi va phan tich them'];
    END CASE;

    RETURN QUERY SELECT
        v_customer.id,
        v_customer.name,
        v_customer.phone,
        v_days,
        v_orders,
        v_spent,
        v_rfm.recency_score,
        v_r_desc,
        v_rfm.frequency_score,
        v_f_desc,
        v_rfm.monetary_score,
        v_m_desc,
        v_rfm.total_score,
        v_rfm.segment,
        v_recommendations;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 7: TRIGGER TO AUTO-UPDATE RFM ON ORDER STATS CHANGE
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_update_rfm_on_order_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if order-related fields changed
    IF (NEW.total_orders IS DISTINCT FROM OLD.total_orders) OR
       (NEW.total_spent IS DISTINCT FROM OLD.total_spent) OR
       (NEW.last_order_date IS DISTINCT FROM OLD.last_order_date) THEN
        PERFORM update_customer_rfm_v2(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_auto_update_rfm ON customers;

-- Create trigger (only fires on UPDATE of relevant columns)
CREATE TRIGGER trg_auto_update_rfm
AFTER UPDATE OF total_orders, total_spent, last_order_date ON customers
FOR EACH ROW
EXECUTE FUNCTION trigger_update_rfm_on_order_change();

-- =====================================================
-- VERIFICATION
-- =====================================================

/*
-- Verify rfm_config is populated
SELECT * FROM get_rfm_thresholds();

-- Test calculate_customer_rfm_v2 for a customer
SELECT * FROM calculate_customer_rfm_v2(1);

-- Test update a single customer
SELECT update_customer_rfm_v2(1);

-- Test batch update all customers
SELECT * FROM update_all_customers_rfm();

-- Test detailed analysis
SELECT * FROM analyze_customer_rfm(1);

-- Update a threshold (example: change recency score 5 to 10 days)
SELECT update_rfm_threshold('recency', 5, 0, 10, 'Very Active: 0-10 days');

-- Verify segment distribution
SELECT rfm_segment, COUNT(*) FROM customers GROUP BY rfm_segment ORDER BY COUNT(*) DESC;
*/

-- =====================================================
-- END OF MIGRATION 007
-- =====================================================
