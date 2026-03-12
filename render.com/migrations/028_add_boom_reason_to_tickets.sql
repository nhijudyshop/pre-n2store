-- Migration: Add boom_reason column to tickets table
-- Purpose: Store sub-reason for "Không Nhận Hàng" type tickets
-- Values: BOOM_HANG (Boom Hàng), TRUNG_DON (Trùng Đơn), DOI_DIA_CHI (Sai Địa Chỉ)

ALTER TABLE customer_tickets
ADD COLUMN IF NOT EXISTS boom_reason VARCHAR(30);

-- Add comment for documentation
COMMENT ON COLUMN customer_tickets.boom_reason IS 'Sub-reason for BOOM type tickets: BOOM_HANG, TRUNG_DON, DOI_DIA_CHI';

-- Create index for filtering by boom_reason (optional, for performance if needed)
CREATE INDEX IF NOT EXISTS idx_customer_tickets_boom_reason ON customer_tickets(boom_reason) WHERE boom_reason IS NOT NULL;
