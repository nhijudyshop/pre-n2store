-- Migration: Add VIRTUAL_CANCEL to wallet_transactions type constraint
-- Date: 2026-01-22
-- Description: Allow VIRTUAL_CANCEL type for logging virtual credit cancellations (audit trail)

-- Drop old type constraint
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

-- Add new constraint with VIRTUAL_CANCEL
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
CHECK (type IN (
    'DEPOSIT',
    'WITHDRAW',
    'VIRTUAL_CREDIT',
    'VIRTUAL_DEBIT',
    'VIRTUAL_EXPIRE',
    'VIRTUAL_CANCEL',
    'ADJUSTMENT'
));

-- Drop old source constraint
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_source_check;

-- Add new constraint with VIRTUAL_CREDIT_CANCEL
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_source_check
CHECK (source IN (
    'BANK_TRANSFER',
    'RETURN_GOODS',
    'ORDER_PAYMENT',
    'VIRTUAL_CREDIT_ISSUE',
    'VIRTUAL_CREDIT_USE',
    'VIRTUAL_CREDIT_EXPIRE',
    'VIRTUAL_CREDIT_CANCEL',
    'MANUAL_ADJUSTMENT'
));

