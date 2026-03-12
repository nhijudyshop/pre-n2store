-- Migration: Create recent_transfer_phones table
-- Tracks phone numbers of customers who recently transferred money
-- Auto-expires after 7 days, reset on new transfer

CREATE TABLE IF NOT EXISTS recent_transfer_phones (
    phone VARCHAR(20) PRIMARY KEY,
    last_transfer_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    transfer_amount DECIMAL(15,2),
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_rtp_expires ON recent_transfer_phones(expires_at);
