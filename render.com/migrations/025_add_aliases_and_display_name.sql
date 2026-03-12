-- =====================================================
-- Migration 025: Add aliases to customers and display_name to balance_history
-- Date: 2026-01-29
-- Purpose: Support multiple reference names (Facebook nicknames) per phone
-- Source: Plan - Multiple Reference Names per Phone Number
-- =====================================================

-- =====================================================
-- PART 1: Add aliases array to customers table
-- =====================================================
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN customers.aliases IS
    'Array of alternative names (Facebook nicknames) for this customer. Format: ["Tên A", "Tên B", ...]';

-- Index for searching aliases (GIN index for JSONB containment queries)
CREATE INDEX IF NOT EXISTS idx_customers_aliases ON customers USING gin(aliases);

-- =====================================================
-- PART 2: Add display_name to balance_history
-- =====================================================
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

COMMENT ON COLUMN balance_history.display_name IS
    'Display/reference name for this transaction (Facebook nickname). FOR DISPLAY ONLY - wallet uses linked_customer_phone.';

CREATE INDEX IF NOT EXISTS idx_balance_history_display_name ON balance_history(display_name)
WHERE display_name IS NOT NULL;

-- =====================================================
-- PART 3: Helper function to add alias if not exists
-- =====================================================
CREATE OR REPLACE FUNCTION add_customer_alias(p_phone VARCHAR, p_alias VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    current_aliases JSONB;
    new_aliases JSONB;
BEGIN
    -- Validate input
    IF p_alias IS NULL OR p_alias = '' THEN
        RETURN FALSE;
    END IF;

    -- Get current aliases
    SELECT COALESCE(aliases, '[]'::jsonb) INTO current_aliases
    FROM customers WHERE phone = p_phone;

    -- If customer not found, return false
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Check if alias already exists (case-sensitive comparison)
    IF current_aliases @> to_jsonb(p_alias) THEN
        RETURN FALSE; -- Already exists
    END IF;

    -- Add new alias to array
    new_aliases := current_aliases || to_jsonb(p_alias);

    UPDATE customers SET aliases = new_aliases WHERE phone = p_phone;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION add_customer_alias(VARCHAR, VARCHAR) IS
    'Add a new alias to customer if not already exists. Returns TRUE if added, FALSE if already exists or invalid input.';

-- =====================================================
-- PART 4: Helper function to remove alias
-- =====================================================
CREATE OR REPLACE FUNCTION remove_customer_alias(p_phone VARCHAR, p_alias VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    current_aliases JSONB;
    new_aliases JSONB;
BEGIN
    -- Validate input
    IF p_alias IS NULL OR p_alias = '' THEN
        RETURN FALSE;
    END IF;

    -- Get current aliases
    SELECT COALESCE(aliases, '[]'::jsonb) INTO current_aliases
    FROM customers WHERE phone = p_phone;

    -- If customer not found, return false
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Check if alias exists
    IF NOT (current_aliases @> to_jsonb(p_alias)) THEN
        RETURN FALSE; -- Alias doesn't exist
    END IF;

    -- Remove alias from array
    new_aliases := (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements(current_aliases) elem
        WHERE elem != to_jsonb(p_alias)
    );

    UPDATE customers SET aliases = new_aliases WHERE phone = p_phone;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION remove_customer_alias(VARCHAR, VARCHAR) IS
    'Remove an alias from customer. Returns TRUE if removed, FALSE if not found.';

-- =====================================================
-- PART 5: Backfill existing data
-- =====================================================

-- Add current name to aliases array if not empty
UPDATE customers
SET aliases = CASE
    WHEN name IS NOT NULL AND name != '' THEN jsonb_build_array(name)
    ELSE '[]'::jsonb
END
WHERE aliases IS NULL OR aliases = '[]'::jsonb;

-- Backfill display_name in balance_history from linked customer or balance_customer_info
UPDATE balance_history bh
SET display_name = COALESCE(
    (SELECT c.name FROM customers c WHERE c.id = bh.customer_id),
    (SELECT bci.customer_name FROM balance_customer_info bci
     WHERE bci.customer_phone = bh.linked_customer_phone
     ORDER BY bci.created_at DESC LIMIT 1)
)
WHERE bh.display_name IS NULL
  AND bh.linked_customer_phone IS NOT NULL;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
