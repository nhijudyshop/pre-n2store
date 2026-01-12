-- =====================================================
-- CUSTOMER 360° TRIGGERS & FUNCTIONS
-- PostgreSQL PL/pgSQL
-- =====================================================
-- Created: 2026-01-07
-- Depends on: 001_create_customer_360_schema.sql
-- =====================================================

-- =====================================================
-- PART 1: AUTO-CREATE WALLET TRIGGER
-- Automatically create wallet when customer is created
-- =====================================================

CREATE OR REPLACE FUNCTION create_wallet_for_customer()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO customer_wallets (customer_id, phone)
    VALUES (NEW.id, NEW.phone)
    ON CONFLICT (phone) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_create_wallet ON customers;

-- Create trigger
CREATE TRIGGER trg_create_wallet
AFTER INSERT ON customers
FOR EACH ROW
EXECUTE FUNCTION create_wallet_for_customer();

-- =====================================================
-- PART 2: TICKET CODE GENERATOR
-- Auto-generate ticket code: TV-YYYY-NNNNN
-- =====================================================

CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TRIGGER AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    -- Get current year
    year_part := TO_CHAR(CURRENT_DATE, 'YYYY');

    -- Get next sequence number for this year
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(ticket_code FROM 9 FOR 5) AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM customer_tickets
    WHERE ticket_code LIKE 'TV-' || year_part || '-%';

    -- Generate ticket code
    NEW.ticket_code := 'TV-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_generate_ticket_code ON customer_tickets;

-- Create trigger
CREATE TRIGGER trg_generate_ticket_code
BEFORE INSERT ON customer_tickets
FOR EACH ROW
WHEN (NEW.ticket_code IS NULL)
EXECUTE FUNCTION generate_ticket_code();

-- =====================================================
-- PART 3: UPDATE TIMESTAMPS TRIGGERS
-- Auto-update updated_at on UPDATE
-- =====================================================

-- Generic function for updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Customer wallets
DROP TRIGGER IF EXISTS trg_wallets_updated_at ON customer_wallets;
CREATE TRIGGER trg_wallets_updated_at
BEFORE UPDATE ON customer_wallets
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Virtual credits
DROP TRIGGER IF EXISTS trg_vc_updated_at ON virtual_credits;
CREATE TRIGGER trg_vc_updated_at
BEFORE UPDATE ON virtual_credits
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Customer tickets
DROP TRIGGER IF EXISTS trg_tickets_updated_at ON customer_tickets;
CREATE TRIGGER trg_tickets_updated_at
BEFORE UPDATE ON customer_tickets
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Customer notes
DROP TRIGGER IF EXISTS trg_notes_updated_at ON customer_notes;
CREATE TRIGGER trg_notes_updated_at
BEFORE UPDATE ON customer_notes
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- =====================================================
-- PART 4: UPDATE CUSTOMER STATS ON TICKET COMPLETE
-- Auto-update returned_orders, return_rate when ticket completed
-- =====================================================

CREATE OR REPLACE FUNCTION update_customer_stats_on_ticket()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process when ticket status changes to COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN

        -- Update returned_orders count if ticket is BOOM/RETURN type
        IF NEW.type IN ('BOOM', 'RETURN_CLIENT', 'RETURN_SHIPPER') THEN
            UPDATE customers
            SET
                returned_orders = returned_orders + 1,
                return_rate = CASE
                    WHEN total_orders > 0 THEN
                        ROUND((returned_orders + 1)::DECIMAL / total_orders * 100, 2)
                    ELSE 0
                END,
                last_interaction_date = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE phone = NEW.phone;
        END IF;

        -- Update customer status/tier based on return rate
        UPDATE customers
        SET
            status = CASE
                WHEN return_rate > 50 THEN 'Nguy hiểm'
                WHEN return_rate > 30 THEN 'Cảnh báo'
                WHEN return_rate > 20 THEN 'Bom hàng'
                ELSE status
            END,
            tier = CASE
                WHEN return_rate > 50 THEN 'blacklist'
                WHEN return_rate > 30 THEN 'danger'
                ELSE tier
            END
        WHERE phone = NEW.phone AND return_rate > 20;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_update_customer_on_ticket ON customer_tickets;

-- Create trigger
CREATE TRIGGER trg_update_customer_on_ticket
AFTER INSERT OR UPDATE ON customer_tickets
FOR EACH ROW
EXECUTE FUNCTION update_customer_stats_on_ticket();

-- =====================================================
-- PART 5: RFM SCORING FUNCTION
-- Calculate Recency, Frequency, Monetary scores
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_customer_rfm(p_phone VARCHAR)
RETURNS TABLE (
    recency_score INTEGER,
    frequency_score INTEGER,
    monetary_score INTEGER,
    segment VARCHAR
) AS $$
DECLARE
    v_days_since_last INTEGER;
    v_successful_orders INTEGER;
    v_total_spent DECIMAL;
    v_recency INTEGER;
    v_frequency INTEGER;
    v_monetary INTEGER;
    v_segment VARCHAR(30);
BEGIN
    -- Get customer metrics
    SELECT
        EXTRACT(DAY FROM CURRENT_TIMESTAMP - last_order_date)::INTEGER,
        COALESCE(successful_orders, 0),
        COALESCE(total_spent, 0)
    INTO v_days_since_last, v_successful_orders, v_total_spent
    FROM customers
    WHERE phone = p_phone;

    -- Calculate Recency Score (1-5, 5 = recent)
    v_recency := CASE
        WHEN v_days_since_last IS NULL THEN 1
        WHEN v_days_since_last <= 7 THEN 5
        WHEN v_days_since_last <= 30 THEN 4
        WHEN v_days_since_last <= 90 THEN 3
        WHEN v_days_since_last <= 180 THEN 2
        ELSE 1
    END;

    -- Calculate Frequency Score (1-5, 5 = frequent)
    v_frequency := CASE
        WHEN v_successful_orders >= 10 THEN 5
        WHEN v_successful_orders >= 5 THEN 4
        WHEN v_successful_orders >= 3 THEN 3
        WHEN v_successful_orders >= 2 THEN 2
        ELSE 1
    END;

    -- Calculate Monetary Score (1-5, 5 = high value)
    v_monetary := CASE
        WHEN v_total_spent >= 5000000 THEN 5
        WHEN v_total_spent >= 2000000 THEN 4
        WHEN v_total_spent >= 1000000 THEN 3
        WHEN v_total_spent >= 500000 THEN 2
        ELSE 1
    END;

    -- Determine Segment
    v_segment := CASE
        WHEN v_recency >= 4 AND v_frequency >= 4 AND v_monetary >= 4 THEN 'Champions'
        WHEN v_recency >= 3 AND v_frequency >= 3 AND v_monetary >= 3 THEN 'Loyal'
        WHEN v_recency >= 4 AND v_frequency <= 2 THEN 'New Customers'
        WHEN v_recency >= 3 AND v_frequency >= 3 AND v_monetary <= 2 THEN 'Potential Loyalists'
        WHEN v_recency <= 2 AND v_frequency >= 3 AND v_monetary >= 3 THEN 'At Risk'
        WHEN v_recency <= 2 AND v_frequency >= 4 AND v_monetary >= 4 THEN 'Cant Lose Them'
        WHEN v_recency <= 2 AND v_frequency <= 2 THEN 'Lost'
        ELSE 'Others'
    END;

    RETURN QUERY SELECT v_recency, v_frequency, v_monetary, v_segment;
END;
$$ LANGUAGE plpgsql;

-- Function to update RFM for a customer
CREATE OR REPLACE FUNCTION update_customer_rfm(p_phone VARCHAR)
RETURNS VOID AS $$
DECLARE
    v_rfm RECORD;
BEGIN
    -- Calculate RFM
    SELECT * INTO v_rfm FROM calculate_customer_rfm(p_phone);

    -- Update customer
    UPDATE customers
    SET
        rfm_recency_score = v_rfm.recency_score,
        rfm_frequency_score = v_rfm.frequency_score,
        rfm_monetary_score = v_rfm.monetary_score,
        rfm_segment = v_rfm.segment,
        updated_at = CURRENT_TIMESTAMP
    WHERE phone = p_phone;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 6: WALLET FIFO WITHDRAWAL FUNCTION
-- Withdraw using virtual credits first (FIFO by expires_at)
-- =====================================================

CREATE OR REPLACE FUNCTION wallet_withdraw_fifo(
    p_phone VARCHAR,
    p_amount DECIMAL,
    p_order_id VARCHAR,
    p_note TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    virtual_used DECIMAL,
    real_used DECIMAL,
    total_used DECIMAL,
    new_balance DECIMAL,
    new_virtual_balance DECIMAL,
    error_message TEXT
) AS $$
DECLARE
    v_wallet RECORD;
    v_credit RECORD;
    v_remaining DECIMAL;
    v_virtual_used DECIMAL := 0;
    v_real_used DECIMAL := 0;
    v_use_from_credit DECIMAL;
    v_total_available DECIMAL;
BEGIN
    -- Lock wallet for update
    SELECT * INTO v_wallet
    FROM customer_wallets
    WHERE phone = p_phone
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 'Wallet not found'::TEXT;
        RETURN;
    END IF;

    -- Check available balance
    v_total_available := v_wallet.balance + v_wallet.virtual_balance;
    IF p_amount > v_total_available THEN
        RETURN QUERY SELECT FALSE, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL,
            v_wallet.balance, v_wallet.virtual_balance,
            ('Insufficient balance. Available: ' || v_total_available || ', Required: ' || p_amount)::TEXT;
        RETURN;
    END IF;

    v_remaining := p_amount;

    -- Step 1: Use virtual credits first (FIFO by expires_at)
    IF v_remaining > 0 AND v_wallet.virtual_balance > 0 THEN
        FOR v_credit IN
            SELECT * FROM virtual_credits
            WHERE phone = p_phone
            AND status = 'ACTIVE'
            AND expires_at > CURRENT_TIMESTAMP
            ORDER BY expires_at ASC
            FOR UPDATE
        LOOP
            EXIT WHEN v_remaining <= 0;

            v_use_from_credit := LEAST(v_credit.remaining_amount, v_remaining);

            -- Update credit
            UPDATE virtual_credits
            SET
                remaining_amount = remaining_amount - v_use_from_credit,
                status = CASE WHEN remaining_amount - v_use_from_credit <= 0 THEN 'USED' ELSE 'ACTIVE' END,
                used_in_orders = used_in_orders || jsonb_build_object(
                    'orderId', p_order_id,
                    'amount', v_use_from_credit,
                    'usedAt', CURRENT_TIMESTAMP
                ),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = v_credit.id;

            v_virtual_used := v_virtual_used + v_use_from_credit;
            v_remaining := v_remaining - v_use_from_credit;
        END LOOP;
    END IF;

    -- Step 2: Use real balance for remaining
    IF v_remaining > 0 THEN
        v_real_used := v_remaining;
        v_remaining := 0;
    END IF;

    -- Step 3: Update wallet
    UPDATE customer_wallets
    SET
        balance = balance - v_real_used,
        virtual_balance = virtual_balance - v_virtual_used,
        total_withdrawn = total_withdrawn + v_real_used,
        total_virtual_used = total_virtual_used + v_virtual_used,
        updated_at = CURRENT_TIMESTAMP
    WHERE phone = p_phone;

    -- Step 4: Log transactions
    IF v_virtual_used > 0 THEN
        INSERT INTO wallet_transactions (
            phone, wallet_id, type, amount,
            balance_before, balance_after,
            virtual_balance_before, virtual_balance_after,
            source, reference_type, reference_id, note
        ) VALUES (
            p_phone, v_wallet.id, 'VIRTUAL_DEBIT', -v_virtual_used,
            v_wallet.balance, v_wallet.balance - v_real_used,
            v_wallet.virtual_balance, v_wallet.virtual_balance - v_virtual_used,
            'ORDER_PAYMENT', 'order', p_order_id,
            COALESCE(p_note, 'Tru cong no ao - Don ' || p_order_id)
        );
    END IF;

    IF v_real_used > 0 THEN
        INSERT INTO wallet_transactions (
            phone, wallet_id, type, amount,
            balance_before, balance_after,
            virtual_balance_before, virtual_balance_after,
            source, reference_type, reference_id, note
        ) VALUES (
            p_phone, v_wallet.id, 'WITHDRAW', -v_real_used,
            v_wallet.balance, v_wallet.balance - v_real_used,
            v_wallet.virtual_balance - v_virtual_used, v_wallet.virtual_balance - v_virtual_used,
            'ORDER_PAYMENT', 'order', p_order_id,
            COALESCE(p_note, 'Tru so du thuc - Don ' || p_order_id)
        );
    END IF;

    -- Return result
    RETURN QUERY SELECT
        TRUE,
        v_virtual_used,
        v_real_used,
        v_virtual_used + v_real_used,
        v_wallet.balance - v_real_used,
        v_wallet.virtual_balance - v_virtual_used,
        NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 7: EXPIRE VIRTUAL CREDITS FUNCTION
-- Called by cron job to expire old virtual credits
-- =====================================================

CREATE OR REPLACE FUNCTION expire_virtual_credits()
RETURNS TABLE (
    expired_count INTEGER,
    total_expired_amount DECIMAL
) AS $$
DECLARE
    v_count INTEGER := 0;
    v_amount DECIMAL := 0;
    v_credit RECORD;
BEGIN
    -- Find and expire active credits past expiry date
    FOR v_credit IN
        SELECT * FROM virtual_credits
        WHERE status = 'ACTIVE'
        AND expires_at <= CURRENT_TIMESTAMP
        FOR UPDATE
    LOOP
        -- Update credit status
        UPDATE virtual_credits
        SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
        WHERE id = v_credit.id;

        -- Update wallet virtual balance
        UPDATE customer_wallets
        SET
            virtual_balance = virtual_balance - v_credit.remaining_amount,
            total_virtual_expired = total_virtual_expired + v_credit.remaining_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE phone = v_credit.phone;

        -- Log transaction
        INSERT INTO wallet_transactions (
            phone, wallet_id, type, amount, source, reference_type, reference_id, note
        )
        SELECT
            v_credit.phone,
            cw.id,
            'VIRTUAL_EXPIRE',
            -v_credit.remaining_amount,
            'VIRTUAL_CREDIT_EXPIRE',
            'virtual_credit',
            v_credit.id::TEXT,
            'Cong no ao het han - ID: ' || v_credit.id
        FROM customer_wallets cw WHERE cw.phone = v_credit.phone;

        v_count := v_count + 1;
        v_amount := v_amount + v_credit.remaining_amount;
    END LOOP;

    RETURN QUERY SELECT v_count, v_amount;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 8: VIEWS FOR STATISTICS
-- =====================================================

-- Customer 360 summary view
CREATE OR REPLACE VIEW customer_360_summary AS
SELECT
    c.id,
    c.phone,
    c.name,
    c.email,
    c.status,
    c.tier,
    c.tags,
    c.total_orders,
    c.total_spent,
    c.return_rate,
    c.rfm_segment,
    w.balance AS wallet_balance,
    w.virtual_balance AS wallet_virtual_balance,
    (w.balance + w.virtual_balance) AS wallet_total,
    (SELECT COUNT(*) FROM customer_tickets t WHERE t.phone = c.phone AND t.status NOT IN ('COMPLETED', 'CANCELLED')) AS pending_tickets,
    c.last_order_date,
    c.last_interaction_date,
    c.created_at
FROM customers c
LEFT JOIN customer_wallets w ON c.phone = w.phone;

-- Ticket statistics view
CREATE OR REPLACE VIEW ticket_statistics AS
SELECT
    COUNT(*) AS total_tickets,
    COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count,
    COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress_count,
    COUNT(*) FILTER (WHERE status = 'PENDING_GOODS') AS pending_goods_count,
    COUNT(*) FILTER (WHERE status = 'PENDING_FINANCE') AS pending_finance_count,
    COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
    COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_count,
    COUNT(*) FILTER (WHERE type = 'BOOM') AS boom_count,
    COUNT(*) FILTER (WHERE type = 'FIX_COD') AS fix_cod_count,
    COUNT(*) FILTER (WHERE type = 'RETURN_CLIENT') AS return_client_count,
    COUNT(*) FILTER (WHERE type = 'RETURN_SHIPPER') AS return_shipper_count,
    SUM(refund_amount) FILTER (WHERE status = 'COMPLETED') AS total_refunded,
    SUM(virtual_credit_amount) FILTER (WHERE virtual_credit_id IS NOT NULL) AS total_virtual_issued
FROM customer_tickets;

-- Wallet statistics view
CREATE OR REPLACE VIEW wallet_statistics AS
SELECT
    COUNT(*) AS total_wallets,
    COUNT(*) FILTER (WHERE balance > 0) AS wallets_with_balance,
    COUNT(*) FILTER (WHERE virtual_balance > 0) AS wallets_with_virtual,
    SUM(balance) AS total_real_balance,
    SUM(virtual_balance) AS total_virtual_balance,
    SUM(balance + virtual_balance) AS total_available,
    SUM(total_deposited) AS total_deposited,
    SUM(total_withdrawn) AS total_withdrawn,
    SUM(total_virtual_issued) AS total_virtual_issued,
    SUM(total_virtual_used) AS total_virtual_used,
    SUM(total_virtual_expired) AS total_virtual_expired
FROM customer_wallets;

-- =====================================================
-- VERIFICATION
-- =====================================================

/*
-- Test ticket code generation
INSERT INTO customer_tickets (phone, customer_name, type, status)
VALUES ('0901234567', 'Test', 'BOOM', 'PENDING')
RETURNING ticket_code;

-- Test RFM calculation
SELECT * FROM calculate_customer_rfm('0901234567');

-- Test FIFO withdrawal
SELECT * FROM wallet_withdraw_fifo('0901234567', 100000, 'TEST-001');

-- Test expire credits
SELECT * FROM expire_virtual_credits();

-- Check views
SELECT * FROM customer_360_summary LIMIT 5;
SELECT * FROM ticket_statistics;
SELECT * FROM wallet_statistics;
*/

-- =====================================================
-- END OF TRIGGERS & FUNCTIONS
-- =====================================================
