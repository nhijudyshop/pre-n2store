-- Migration: Add TICKET_DELETED to customer_activities activity_type constraint
-- Date: 2026-01-22
-- Description: Allow TICKET_DELETED activity type for logging ticket deletions

-- Drop old constraint
ALTER TABLE customer_activities DROP CONSTRAINT IF EXISTS customer_activities_activity_type_check;

-- Add new constraint with TICKET_DELETED
ALTER TABLE customer_activities ADD CONSTRAINT customer_activities_activity_type_check
CHECK (activity_type IN (
    'WALLET_DEPOSIT',
    'WALLET_WITHDRAW',
    'WALLET_VIRTUAL_CREDIT',
    'TICKET_CREATED',
    'TICKET_UPDATED',
    'TICKET_COMPLETED',
    'TICKET_DELETED',
    'ORDER_CREATED',
    'ORDER_DELIVERED',
    'ORDER_RETURNED',
    'MESSAGE_SENT',
    'MESSAGE_RECEIVED',
    'PROFILE_UPDATED',
    'TAG_ADDED',
    'NOTE_ADDED'
));
