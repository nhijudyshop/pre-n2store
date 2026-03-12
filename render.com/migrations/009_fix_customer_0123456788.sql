-- =====================================================
-- MIGRATION 009: Fix customer 0123456788 wallet data
-- =====================================================
-- This fixes existing data where:
-- 1. Ticket TV-2026-00005 RETURN_SHIPPER COMPLETED but not credited (180,000d)
-- 2. Ticket TV-2026-00012 BOOM COMPLETED - BOOM tickets don't get virtual credit
-- 3. Balance history transactions linked but not processed to wallet
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Fix Ticket TV-2026-00005 - Credit 180,000d virtual credit
-- =====================================================

DO $$
DECLARE
    v_ticket_code TEXT := 'TV-2026-00005';
    v_phone TEXT := '0123456788';
    v_ticket RECORD;
    v_vc_id INT;
    v_wallet_id INT;
    v_current_virtual_balance DECIMAL;
BEGIN
    -- Get ticket info
    SELECT * INTO v_ticket
    FROM customer_tickets
    WHERE ticket_code = v_ticket_code;

    IF v_ticket IS NULL THEN
        RAISE NOTICE 'Ticket % not found, skipping...', v_ticket_code;
        RETURN;
    END IF;

    -- Check if already credited
    IF v_ticket.wallet_credited = true THEN
        RAISE NOTICE 'Ticket % already credited, skipping...', v_ticket_code;
        RETURN;
    END IF;

    -- Only process RETURN_SHIPPER with refund_amount > 0
    IF v_ticket.type != 'RETURN_SHIPPER' OR COALESCE(v_ticket.refund_amount, 0) <= 0 THEN
        RAISE NOTICE 'Ticket % is not eligible for virtual credit (type=%, refund=%)',
            v_ticket_code, v_ticket.type, v_ticket.refund_amount;
        RETURN;
    END IF;

    -- Get wallet
    SELECT id, virtual_balance INTO v_wallet_id, v_current_virtual_balance
    FROM customer_wallets
    WHERE phone = v_phone;

    IF v_wallet_id IS NULL THEN
        -- Create wallet if not exists
        INSERT INTO customer_wallets (phone, balance, virtual_balance)
        VALUES (v_phone, 0, 0)
        RETURNING id, virtual_balance INTO v_wallet_id, v_current_virtual_balance;
    END IF;

    -- Create virtual credit
    INSERT INTO virtual_credits (
        phone, wallet_id, original_amount, remaining_amount,
        expires_at, source_type, source_id, note, status
    )
    VALUES (
        v_phone, v_wallet_id, v_ticket.refund_amount, v_ticket.refund_amount,
        NOW() + INTERVAL '15 days', 'RETURN_SHIPPER', v_ticket_code,
        'Cong no ao tu ticket ' || v_ticket_code || ' (migration fix)', 'ACTIVE'
    )
    RETURNING id INTO v_vc_id;

    -- Update wallet virtual balance
    UPDATE customer_wallets
    SET virtual_balance = virtual_balance + v_ticket.refund_amount,
        total_virtual_issued = COALESCE(total_virtual_issued, 0) + v_ticket.refund_amount,
        updated_at = NOW()
    WHERE phone = v_phone;

    -- Log wallet transaction
    INSERT INTO wallet_transactions (
        phone, wallet_id, type, amount,
        virtual_balance_before, virtual_balance_after,
        source, reference_type, reference_id, note
    )
    VALUES (
        v_phone, v_wallet_id, 'VIRTUAL_CREDIT', v_ticket.refund_amount,
        v_current_virtual_balance, v_current_virtual_balance + v_ticket.refund_amount,
        'VIRTUAL_CREDIT_ISSUE', 'ticket', v_ticket_code,
        'Cong no ao tu ticket ' || v_ticket_code || ' (migration fix)'
    );

    -- Update ticket
    UPDATE customer_tickets
    SET virtual_credit_id = v_vc_id,
        virtual_credit_amount = v_ticket.refund_amount,
        wallet_credited = true,
        updated_at = NOW()
    WHERE ticket_code = v_ticket_code;

    -- Log activity
    INSERT INTO customer_activities (
        phone, customer_id, activity_type, title, description,
        reference_type, reference_id, icon, color
    )
    VALUES (
        v_phone, v_ticket.customer_id, 'WALLET_VIRTUAL_CREDIT',
        'Cap cong no ao: ' || v_ticket.refund_amount::TEXT || 'd',
        'Tu ticket ' || v_ticket_code || ' (migration fix)',
        'ticket', v_ticket_code, 'gift', 'purple'
    );

    RAISE NOTICE 'Successfully credited % virtual credit from ticket %', v_ticket.refund_amount, v_ticket_code;
END $$;

-- =====================================================
-- 2. Process balance_history transactions to wallet
-- =====================================================

DO $$
DECLARE
    v_phone TEXT := '0123456788';
    v_tx RECORD;
    v_wallet_id INT;
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
    v_total_deposited DECIMAL := 0;
    v_customer_id INT;
BEGIN
    -- Get customer_id
    SELECT id INTO v_customer_id FROM customers WHERE phone = v_phone;

    -- Get wallet
    SELECT id, balance INTO v_wallet_id, v_current_balance
    FROM customer_wallets
    WHERE phone = v_phone;

    IF v_wallet_id IS NULL THEN
        -- Create wallet if not exists
        INSERT INTO customer_wallets (phone, customer_id, balance, virtual_balance)
        VALUES (v_phone, v_customer_id, 0, 0)
        RETURNING id, balance INTO v_wallet_id, v_current_balance;
    END IF;

    -- Process each unprocessed balance_history transaction
    FOR v_tx IN
        SELECT id, transfer_amount, content, code, reference_code
        FROM balance_history
        WHERE linked_customer_phone = v_phone
          AND (wallet_processed = FALSE OR wallet_processed IS NULL)
          AND transfer_amount > 0
          AND transfer_type = 'in'
        ORDER BY transaction_date ASC
    LOOP
        v_new_balance := v_current_balance + v_tx.transfer_amount;

        -- Log wallet transaction
        INSERT INTO wallet_transactions (
            phone, wallet_id, type, amount,
            balance_before, balance_after,
            source, reference_type, reference_id, note
        )
        VALUES (
            v_phone, v_wallet_id, 'DEPOSIT', v_tx.transfer_amount,
            v_current_balance, v_new_balance,
            'BANK_TRANSFER', 'balance_history', v_tx.id::TEXT,
            'Nap tu CK ' || COALESCE(v_tx.code, v_tx.reference_code, 'N/A') || ' (migration fix)'
        );

        -- Update current balance for next iteration
        v_current_balance := v_new_balance;
        v_total_deposited := v_total_deposited + v_tx.transfer_amount;

        -- Mark as processed
        UPDATE balance_history
        SET wallet_processed = TRUE
        WHERE id = v_tx.id;

        RAISE NOTICE 'Processed balance_history id=%, amount=%', v_tx.id, v_tx.transfer_amount;
    END LOOP;

    -- Update wallet balance if we processed any transactions
    IF v_total_deposited > 0 THEN
        UPDATE customer_wallets
        SET balance = v_current_balance,
            total_deposited = COALESCE(total_deposited, 0) + v_total_deposited,
            updated_at = NOW()
        WHERE phone = v_phone;

        -- Log activity
        INSERT INTO customer_activities (
            phone, customer_id, activity_type, title, description,
            reference_type, icon, color
        )
        VALUES (
            v_phone, v_customer_id, 'WALLET_DEPOSIT',
            'Nap tien: ' || v_total_deposited::TEXT || 'd',
            'Tu chuyen khoan ngan hang (migration fix)',
            'balance_history', 'university', 'green'
        );

        RAISE NOTICE 'Total deposited from balance_history: %', v_total_deposited;
    ELSE
        RAISE NOTICE 'No unprocessed balance_history transactions found for %', v_phone;
    END IF;
END $$;

COMMIT;

-- =====================================================
-- Verify the fix
-- =====================================================
SELECT 'Wallet Summary' as info, phone, balance, virtual_balance, (balance + virtual_balance) as total
FROM customer_wallets
WHERE phone = '0123456788';

SELECT 'Completed Tickets' as info, ticket_code, type, refund_amount, wallet_credited, virtual_credit_id
FROM customer_tickets
WHERE phone = '0123456788' AND status = 'COMPLETED';

SELECT 'Virtual Credits' as info, id, original_amount, remaining_amount, expires_at, status
FROM virtual_credits
WHERE phone = '0123456788';

SELECT 'Balance History Processed' as info, COUNT(*) as processed_count, SUM(transfer_amount) as total_amount
FROM balance_history
WHERE linked_customer_phone = '0123456788' AND wallet_processed = true;
