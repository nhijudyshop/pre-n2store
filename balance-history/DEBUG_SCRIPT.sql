-- =====================================================
-- DEBUG SCRIPT - Kiểm tra tại sao phone không được match
-- =====================================================

-- 1. Check tables có tồn tại không
SELECT '=== 1. CHECK TABLES EXIST ===' as step;
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('balance_history', 'balance_customer_info', 'pending_customer_matches');

-- 2. Check customer có SĐT chứa "456788" không
SELECT '=== 2. CHECK CUSTOMER WITH PHONE 456788 ===' as step;
SELECT id, phone, name, email, status, debt
FROM customers
WHERE phone LIKE '%456788%';

-- 3. Check customer có SĐT chứa "56788" không
SELECT '=== 3. CHECK CUSTOMER WITH PHONE 56788 ===' as step;
SELECT id, phone, name, email, status, debt
FROM customers
WHERE phone LIKE '%56788%';

-- 4. Check customer với SĐT đầy đủ "0123456788"
SELECT '=== 4. CHECK CUSTOMER WITH EXACT PHONE 0123456788 ===' as step;
SELECT id, phone, name, email, status, debt
FROM customers
WHERE phone = '0123456788' OR phone LIKE '%0123456788%';

-- 5. Check pending matches cho phone "456788" hoặc "56788"
SELECT '=== 5. CHECK PENDING MATCHES ===' as step;
SELECT
    id,
    transaction_id,
    extracted_phone,
    matched_customers,
    status,
    created_at
FROM pending_customer_matches
WHERE extracted_phone IN ('456788', '56788', '0123456788')
ORDER BY created_at DESC
LIMIT 10;

-- 6. Check transaction trong balance_history
SELECT '=== 6. CHECK TRANSACTIONS ===' as step;
SELECT
    id,
    content,
    transfer_amount,
    debt_added,
    created_at
FROM balance_history
WHERE content LIKE '%456788%' OR content LIKE '%56788%'
ORDER BY created_at DESC
LIMIT 10;

-- 7. Check balance_customer_info
SELECT '=== 7. CHECK BALANCE CUSTOMER INFO ===' as step;
SELECT *
FROM balance_customer_info
WHERE customer_phone LIKE '%456788%' OR customer_phone LIKE '%56788%'
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- EXPECTED RESULTS:
-- =====================================================
-- Step 1: Should return 3 tables (balance_history, balance_customer_info, pending_customer_matches)
-- Step 2-4: Should return customer(s) if exists in database
-- Step 5: Should return pending matches if multiple customers found
-- Step 6: Should return transactions with that content
-- Step 7: Should be EMPTY if not yet processed
-- =====================================================
