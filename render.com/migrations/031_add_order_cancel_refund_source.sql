-- Migration: Add ORDER_CANCEL_REFUND to wallet_transactions source constraint
-- Date: 2026-03-10
-- Description: Allow ORDER_CANCEL_REFUND as a valid source for wallet refunds
--   when cancelled orders had used debt (công nợ)

-- Drop old source constraint
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_source_check;

-- Add new constraint with ORDER_CANCEL_REFUND
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_source_check
CHECK (source IN (
    'BANK_TRANSFER',
    'RETURN_GOODS',
    'ORDER_PAYMENT',
    'ORDER_CANCEL_REFUND',
    'VIRTUAL_CREDIT_ISSUE',
    'VIRTUAL_CREDIT_USE',
    'VIRTUAL_CREDIT_EXPIRE',
    'VIRTUAL_CREDIT_CANCEL',
    'MANUAL_ADJUSTMENT'
));
