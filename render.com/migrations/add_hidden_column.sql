-- =====================================================
-- ADD HIDDEN COLUMN TO BALANCE_HISTORY
-- Cho phép ẩn giao dịch khỏi danh sách mặc định
-- =====================================================

-- Add is_hidden column (default FALSE = không ẩn)
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_balance_history_is_hidden
ON balance_history(is_hidden);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'balance_history' AND column_name = 'is_hidden';
