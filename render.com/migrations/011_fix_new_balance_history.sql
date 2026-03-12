-- =====================================================
-- MIGRATION 011: Process newest balance_history for 0932422070
-- =====================================================
-- Transaction: 14:50 12/01/2026, 2,000đ, content "422070"
-- This should have been processed by cron but wasn't yet
-- =====================================================

BEGIN;

-- First, check for any unprocessed balance_history for this customer
DO $$
DECLARE
    v_phone TEXT := '0932422070';
    v_tx RECORD;
    v_wallet_id INT;
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
    v_total_deposited DECIMAL := 0;
    v_customer_id INT;
    v_processed_count INT := 0;
BEGIN
    -- Get customer_id
    SELECT id INTO v_customer_id FROM customers WHERE phone = v_phone;

    -- Get wallet
    SELECT id, balance INTO v_wallet_id, v_current_balance
    FROM customer_wallets
    WHERE phone = v_phone;

    IF v_wallet_id IS NULL THEN
        RAISE NOTICE 'Wallet not found for %, creating...', v_phone;
        INSERT INTO customer_wallets (phone, customer_id, balance, virtual_balance)
        VALUES (v_phone, v_customer_id, 0, 0)
        RETURNING id, balance INTO v_wallet_id, v_current_balance;
    END IF;

    RAISE NOTICE 'Current wallet balance: %', v_current_balance;

    -- Process ALL unprocessed balance_history transactions
    FOR v_tx IN
        SELECT id, transfer_amount, content, code, reference_code, transaction_date
        FROM balance_history
        WHERE linked_customer_phone = v_phone
          AND (wallet_processed = FALSE OR wallet_processed IS NULL)
          AND transfer_amount > 0
          AND transfer_type = 'in'
        ORDER BY transaction_date ASC
    LOOP
        v_new_balance := v_current_balance + v_tx.transfer_amount;

        RAISE NOTICE 'Processing balance_history id=%, amount=%, date=%',
            v_tx.id, v_tx.transfer_amount, v_tx.transaction_date;

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
            'Nap tu CK ' || COALESCE(v_tx.code, v_tx.reference_code, 'N/A')
        );

        -- Update current balance for next iteration
        v_current_balance := v_new_balance;
        v_total_deposited := v_total_deposited + v_tx.transfer_amount;
        v_processed_count := v_processed_count + 1;

        -- Mark as processed
        UPDATE balance_history
        SET wallet_processed = TRUE
        WHERE id = v_tx.id;

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
            'Tu chuyen khoan ngan hang (auto-sync)',
            'balance_history', 'university', 'green'
        );

        RAISE NOTICE 'Processed % transactions, total: % VND', v_processed_count, v_total_deposited;
    ELSE
        RAISE NOTICE 'No unprocessed balance_history transactions found for %', v_phone;
    END IF;
END $$;

COMMIT;

-- =====================================================
-- Verify
-- =====================================================
SELECT 'Wallet Summary' as info, phone, balance, virtual_balance, (balance + virtual_balance) as total
FROM customer_wallets
WHERE phone = '0932422070';

SELECT 'Recent Balance History' as info, id, transfer_amount, wallet_processed, transaction_date, content
FROM balance_history
WHERE linked_customer_phone = '0932422070'
ORDER BY transaction_date DESC
LIMIT 5;

SELECT 'Recent Wallet Transactions' as info, id, type, amount, balance_after, note, created_at
FROM wallet_transactions
WHERE phone = '0932422070'
ORDER BY created_at DESC
LIMIT 5;
