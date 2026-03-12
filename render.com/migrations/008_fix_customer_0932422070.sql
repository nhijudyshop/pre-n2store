-- =====================================================
-- MIGRATION 008: Fix customer 0932422070 wallet data
-- =====================================================
-- This fixes existing data where:
-- 1. Ticket TV-2026-00025 was completed but wallet not credited (270,000d)
-- 2. Balance history transactions linked but not processed to wallet (100,000d + 2,000d)
-- =====================================================

-- Start transaction
BEGIN;

-- =====================================================
-- 1. Fix Ticket TV-2026-00025 - Credit 270,000d virtual credit
-- =====================================================

-- Check if virtual credit already exists for this ticket
DO $$
DECLARE
    v_ticket_code TEXT := 'TV-2026-00025';
    v_phone TEXT := '0932422070';
    v_refund_amount DECIMAL := 270000;
    v_ticket_id INT;
    v_customer_id INT;
    v_vc_id INT;
    v_wallet_id INT;
    v_current_virtual_balance DECIMAL;
BEGIN
    -- Get ticket info
    SELECT id, customer_id INTO v_ticket_id, v_customer_id
    FROM customer_tickets
    WHERE ticket_code = v_ticket_code;

    IF v_ticket_id IS NULL THEN
        RAISE NOTICE 'Ticket % not found, skipping...', v_ticket_code;
        RETURN;
    END IF;

    -- Check if already credited
    IF EXISTS (SELECT 1 FROM customer_tickets WHERE ticket_code = v_ticket_code AND wallet_credited = true) THEN
        RAISE NOTICE 'Ticket % already credited, skipping...', v_ticket_code;
        RETURN;
    END IF;

    -- Get or create wallet
    INSERT INTO customer_wallets (phone, balance, virtual_balance)
    VALUES (v_phone, 0, 0)
    ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
    RETURNING id, virtual_balance INTO v_wallet_id, v_current_virtual_balance;

    -- Create virtual credit
    INSERT INTO virtual_credits (
        phone, wallet_id, original_amount, remaining_amount,
        expires_at, source_type, source_id, note, status
    )
    VALUES (
        v_phone, v_wallet_id, v_refund_amount, v_refund_amount,
        NOW() + INTERVAL '15 days', 'RETURN_SHIPPER', v_ticket_code,
        'Cong no ao tu ticket ' || v_ticket_code || ' (migration fix)', 'ACTIVE'
    )
    RETURNING id INTO v_vc_id;

    -- Update wallet virtual balance
    UPDATE customer_wallets
    SET virtual_balance = virtual_balance + v_refund_amount,
        total_virtual_issued = COALESCE(total_virtual_issued, 0) + v_refund_amount,
        updated_at = NOW()
    WHERE phone = v_phone;

    -- Log wallet transaction
    INSERT INTO wallet_transactions (
        phone, wallet_id, type, amount,
        virtual_balance_before, virtual_balance_after,
        source, reference_type, reference_id, note
    )
    VALUES (
        v_phone, v_wallet_id, 'VIRTUAL_CREDIT', v_refund_amount,
        v_current_virtual_balance, v_current_virtual_balance + v_refund_amount,
        'VIRTUAL_CREDIT_ISSUE', 'ticket', v_ticket_code,
        'Cong no ao tu ticket ' || v_ticket_code || ' (migration fix)'
    );

    -- Update ticket
    UPDATE customer_tickets
    SET virtual_credit_id = v_vc_id,
        virtual_credit_amount = v_refund_amount,
        wallet_credited = true,
        updated_at = NOW()
    WHERE ticket_code = v_ticket_code;

    -- Log activity
    INSERT INTO customer_activities (
        phone, customer_id, activity_type, title, description,
        reference_type, reference_id, icon, color
    )
    VALUES (
        v_phone, v_customer_id, 'WALLET_VIRTUAL_CREDIT',
        'Cap cong no ao: ' || v_refund_amount::TEXT || 'd',
        'Tu ticket ' || v_ticket_code || ' (migration fix)',
        'ticket', v_ticket_code, 'gift', 'purple'
    );

    RAISE NOTICE 'Successfully credited % virtual credit from ticket %', v_refund_amount, v_ticket_code;
END $$;

-- =====================================================
-- 2. Process balance_history transactions to wallet
-- =====================================================

DO $$
DECLARE
    v_phone TEXT := '0932422070';
    v_tx RECORD;
    v_wallet_id INT;
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
    v_total_deposited DECIMAL := 0;
BEGIN
    -- Get wallet
    SELECT id, balance INTO v_wallet_id, v_current_balance
    FROM customer_wallets
    WHERE phone = v_phone;

    IF v_wallet_id IS NULL THEN
        RAISE NOTICE 'Wallet not found for %, skipping balance history processing', v_phone;
        RETURN;
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
            phone, activity_type, title, description,
            reference_type, icon, color
        )
        VALUES (
            v_phone, 'WALLET_DEPOSIT',
            'Nap tien: ' || v_total_deposited::TEXT || 'd',
            'Tu chuyen khoan ngan hang (migration fix)',
            'balance_history', 'university', 'green'
        );

        RAISE NOTICE 'Total deposited from balance_history: %', v_total_deposited;
    ELSE
        RAISE NOTICE 'No unprocessed balance_history transactions found for %', v_phone;
    END IF;
END $$;

-- Commit transaction
COMMIT;

-- =====================================================
-- Verify the fix
-- =====================================================
SELECT 'Wallet Summary' as info, phone, balance, virtual_balance, (balance + virtual_balance) as total
FROM customer_wallets
WHERE phone = '0932422070';

SELECT 'Ticket Status' as info, ticket_code, refund_amount, wallet_credited, virtual_credit_id, virtual_credit_amount
FROM customer_tickets
WHERE ticket_code = 'TV-2026-00025';

SELECT 'Virtual Credits' as info, id, original_amount, remaining_amount, expires_at, status
FROM virtual_credits
WHERE phone = '0932422070';

SELECT 'Balance History' as info, id, transfer_amount, wallet_processed
FROM balance_history
WHERE linked_customer_phone = '0932422070';
