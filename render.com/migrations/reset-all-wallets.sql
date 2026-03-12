-- =============================================
-- RESET TOÀN BỘ SỐ DƯ VÍ KHÁCH HÀNG
-- Xóa sạch dữ liệu ví trong hệ thống Customer 360
-- =============================================

BEGIN;

-- 1. Xóa wallet_adjustments (FK → wallet_transactions, balance_history)
DELETE FROM wallet_adjustments;

-- 2. Xóa wallet_transactions (FK → customer_wallets)
DELETE FROM wallet_transactions;

-- 3. Clear FK reference từ customer_tickets trước khi xóa virtual_credits
UPDATE customer_tickets SET virtual_credit_id = NULL WHERE virtual_credit_id IS NOT NULL;

-- 4. Xóa virtual_credits (FK → customer_wallets)
DELETE FROM virtual_credits;

-- 4. Xóa pending_wallet_withdrawals
DELETE FROM pending_wallet_withdrawals;

-- 5. Xóa customer_wallets
DELETE FROM customer_wallets;

-- 6. Đánh dấu TẤT CẢ balance_history là đã xử lý để cron backup không nạp lại
UPDATE balance_history
SET wallet_processed = TRUE,
    wallet_transaction_id = NULL
WHERE wallet_processed = FALSE OR wallet_processed IS NULL;

COMMIT;

-- =============================================
-- VERIFICATION: Chạy query này để kiểm tra kết quả
-- =============================================
-- SELECT 'customer_wallets' AS tbl, COUNT(*) FROM customer_wallets
-- UNION ALL SELECT 'wallet_transactions', COUNT(*) FROM wallet_transactions
-- UNION ALL SELECT 'virtual_credits', COUNT(*) FROM virtual_credits
-- UNION ALL SELECT 'wallet_adjustments', COUNT(*) FROM wallet_adjustments
-- UNION ALL SELECT 'pending_wallet_withdrawals', COUNT(*) FROM pending_wallet_withdrawals;
