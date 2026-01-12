-- Migration: Add extraction tracking columns to balance_customer_info table
-- Purpose: Track why phone extraction succeeded/failed and TPOS name fetch status

-- Add extraction_note column (reason for extraction result)
ALTER TABLE balance_customer_info
ADD COLUMN IF NOT EXISTS extraction_note VARCHAR(100);

-- Add name_fetch_status column (TPOS fetch result)
ALTER TABLE balance_customer_info
ADD COLUMN IF NOT EXISTS name_fetch_status VARCHAR(50);

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_balance_customer_info_extraction_note
ON balance_customer_info(extraction_note);

CREATE INDEX IF NOT EXISTS idx_balance_customer_info_name_fetch_status
ON balance_customer_info(name_fetch_status);

-- Update existing records with default values
UPDATE balance_customer_info
SET extraction_note = CASE
    WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) = 10 THEN 'PHONE_EXTRACTED'
    WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) != 10 THEN 'INVALID_PHONE_LENGTH'
    ELSE 'NO_PHONE_FOUND'
END
WHERE extraction_note IS NULL;

UPDATE balance_customer_info
SET name_fetch_status = CASE
    WHEN customer_name IS NOT NULL THEN 'SUCCESS'
    WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) = 10 THEN 'PENDING'
    WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) != 10 THEN 'INVALID_PHONE'
    ELSE 'NO_PHONE_TO_FETCH'
END
WHERE name_fetch_status IS NULL;

-- Show updated table structure
\d balance_customer_info;

-- Show sample data with new columns
SELECT
    unique_code,
    customer_phone,
    customer_name,
    extraction_note,
    name_fetch_status,
    created_at
FROM balance_customer_info
ORDER BY created_at DESC
LIMIT 10;
