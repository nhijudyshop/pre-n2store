-- =====================================================
-- Migration 026: Add RETURN_OLD_ORDER to fix_cod_reason
-- =====================================================
-- Fix: "new row for relation "customer_tickets" violates check constraint "customer_tickets_fix_cod_reason_check""
-- The frontend has RETURN_OLD_ORDER option for "Trả hàng đơn cũ" but database constraint doesn't include it
-- =====================================================

-- Drop the existing constraint
ALTER TABLE customer_tickets
DROP CONSTRAINT IF EXISTS customer_tickets_fix_cod_reason_check;

-- Add new constraint with RETURN_OLD_ORDER included
ALTER TABLE customer_tickets
ADD CONSTRAINT customer_tickets_fix_cod_reason_check
CHECK (fix_cod_reason IN (
    'WRONG_SHIP',       -- Ship nhầm
    'CUSTOMER_DEBT',    -- Khách nợ
    'DISCOUNT',         -- Giảm giá
    'REJECT_PARTIAL',   -- Khách từ chối 1 phần
    'RETURN_OLD_ORDER'  -- Trả hàng đơn cũ
));

-- =====================================================
-- END OF MIGRATION
-- =====================================================
