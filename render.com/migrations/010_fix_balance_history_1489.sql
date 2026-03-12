-- =====================================================
-- MIGRATION 010: Fix balance_history id=1489 for 0932422070
-- =====================================================
-- This fixes:
-- balance_history id=1489 (2,000đ) linked to 0932422070 but wallet_processed=false
-- =====================================================

BEGIN;

DO $$
DECLARE
    v_phone TEXT := '0932422070';
    v_bh_id INT := 1489;
    v_wallet_id INT;
    v_current_balance DECIMAL;
    v_transfer_amount DECIMAL;
    v_new_balance DECIMAL;
    v_customer_id INT;
BEGIN
    -- Get balance_history record
    SELECT transfer_amount INTO v_transfer_amount
    FROM balance_history
    WHERE id = v_bh_id
      AND linked_customer_phone = v_phone
      AND (wallet_processed = FALSE OR wallet_processed IS NULL);

    IF v_transfer_amount IS NULL THEN
        RAISE NOTICE 'balance_history id=% not found or already processed, skipping...', v_bh_id;
        RETURN;
    END IF;

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

    v_new_balance := v_current_balance + v_transfer_amount;

    -- Log wallet transaction
    INSERT INTO wallet_transactions (
        phone, wallet_id, type, amount,
        balance_before, balance_after,
        source, reference_type, reference_id, note
    )
    VALUES (
        v_phone, v_wallet_id, 'DEPOSIT', v_transfer_amount,
        v_current_balance, v_new_balance,
        'BANK_TRANSFER', 'balance_history', v_bh_id::TEXT,
        'Nap tu CK 422070 (migration fix id=1489)'
    );

    -- Update wallet balance
    UPDATE customer_wallets
    SET balance = v_new_balance,
        total_deposited = COALESCE(total_deposited, 0) + v_transfer_amount,
        updated_at = NOW()
    WHERE phone = v_phone;

    -- Mark as processed
    UPDATE balance_history
    SET wallet_processed = TRUE
    WHERE id = v_bh_id;

    -- Log activity
    INSERT INTO customer_activities (
        phone, customer_id, activity_type, title, description,
        reference_type, reference_id, icon, color
    )
    VALUES (
        v_phone, v_customer_id, 'WALLET_DEPOSIT',
        'Nap tien: ' || v_transfer_amount::TEXT || 'd',
        'Tu chuyen khoan 422070 (migration fix)',
        'balance_history', v_bh_id::TEXT, 'university', 'green'
    );

    RAISE NOTICE 'Successfully processed balance_history id=%, amount=% for %', v_bh_id, v_transfer_amount, v_phone;
END $$;

COMMIT;

-- =====================================================
-- Verify the fix
-- =====================================================
SELECT 'Wallet Summary' as info, phone, balance, virtual_balance, (balance + virtual_balance) as total
FROM customer_wallets
WHERE phone = '0932422070';

SELECT 'Balance History Status' as info, id, transfer_amount, wallet_processed, linked_customer_phone
FROM balance_history
WHERE id = 1489;

SELECT 'Recent Wallet Transactions' as info, id, type, amount, balance_before, balance_after, note
FROM wallet_transactions
WHERE phone = '0932422070'
ORDER BY created_at DESC
LIMIT 5;
