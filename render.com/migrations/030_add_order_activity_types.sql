-- Migration: Add ORDER_CANCELLED and WALLET_REFUND activity types
-- Date: 2026-02-28
-- Description: Support activity logging for order creation/cancellation
--   and wallet refund when cancelled orders had used debt (công nợ)

-- Drop old constraint
ALTER TABLE customer_activities DROP CONSTRAINT IF EXISTS customer_activities_activity_type_check;

-- Add new constraint with ORDER_CANCELLED and WALLET_REFUND
ALTER TABLE customer_activities ADD CONSTRAINT customer_activities_activity_type_check
CHECK (activity_type IN (
    'WALLET_DEPOSIT',
    'WALLET_WITHDRAW',
    'WALLET_VIRTUAL_CREDIT',
    'WALLET_REFUND',
    'TICKET_CREATED',
    'TICKET_UPDATED',
    'TICKET_COMPLETED',
    'TICKET_DELETED',
    'ORDER_CREATED',
    'ORDER_CANCELLED',
    'ORDER_DELIVERED',
    'ORDER_RETURNED',
    'MESSAGE_SENT',
    'MESSAGE_RECEIVED',
    'PROFILE_UPDATED',
    'TAG_ADDED',
    'NOTE_ADDED'
));
