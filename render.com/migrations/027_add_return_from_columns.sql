-- =====================================================
-- Migration 027: Add return_from columns for RETURN_OLD_ORDER
-- =====================================================
-- For RETURN_OLD_ORDER flow: need to store reference to the OLD order
-- that the customer is returning products from
-- =====================================================

-- Add columns to store old order reference
ALTER TABLE customer_tickets
ADD COLUMN IF NOT EXISTS return_from_order_id VARCHAR(50);  -- Old order code (VD: "NJD/2025/38611")

ALTER TABLE customer_tickets
ADD COLUMN IF NOT EXISTS return_from_tpos_id INTEGER;       -- Old order TPOS internal ID

-- Add index for lookups
CREATE INDEX IF NOT EXISTS idx_tickets_return_from ON customer_tickets(return_from_tpos_id)
WHERE return_from_tpos_id IS NOT NULL;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
