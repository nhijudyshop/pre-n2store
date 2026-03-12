-- =====================================================
-- CUSTOMER 360° SCHEMA - PostgreSQL Migration
-- Issue-tracking Firebase → Render PostgreSQL
-- =====================================================
-- Created: 2026-01-07
-- Source: issue-tracking/customer360plan.md
-- =====================================================

-- =====================================================
-- PART 1: ALTER EXISTING CUSTOMERS TABLE
-- Add new columns for Customer 360° features
-- =====================================================

-- 1.1 Add tier column (thay thế status hiện có cho customer segments)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'normal';

-- 1.2 Add tags JSONB column for flexible tagging
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

-- 1.3 Add order statistics columns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent DECIMAL(15,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS successful_orders INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS returned_orders INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS return_rate DECIMAL(5,2) DEFAULT 0;

-- 1.4 Add date tracking columns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_order_date TIMESTAMP;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_date TIMESTAMP;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_interaction_date TIMESTAMP;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS days_since_last_order INTEGER;

-- 1.5 Add RFM scoring columns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rfm_recency_score INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rfm_frequency_score INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rfm_monetary_score INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rfm_segment VARCHAR(30);

-- 1.6 Add internal note column
ALTER TABLE customers ADD COLUMN IF NOT EXISTS internal_note TEXT;

-- 1.7 Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_customers_tier ON customers(tier);
CREATE INDEX IF NOT EXISTS idx_customers_tags ON customers USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_customers_rfm_segment ON customers(rfm_segment);
CREATE INDEX IF NOT EXISTS idx_customers_last_order ON customers(last_order_date DESC);
CREATE INDEX IF NOT EXISTS idx_customers_return_rate ON customers(return_rate DESC);

-- =====================================================
-- PART 2: CUSTOMER_WALLETS TABLE
-- Store wallet balance for each customer
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_wallets (
    id SERIAL PRIMARY KEY,

    -- Link to customer
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    phone VARCHAR(20) UNIQUE NOT NULL,

    -- Balances
    balance DECIMAL(15,2) DEFAULT 0 CHECK (balance >= 0),
    virtual_balance DECIMAL(15,2) DEFAULT 0 CHECK (virtual_balance >= 0),

    -- Totals (for statistics)
    total_deposited DECIMAL(15,2) DEFAULT 0,
    total_withdrawn DECIMAL(15,2) DEFAULT 0,
    total_virtual_issued DECIMAL(15,2) DEFAULT 0,
    total_virtual_used DECIMAL(15,2) DEFAULT 0,
    total_virtual_expired DECIMAL(15,2) DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for customer_wallets
CREATE INDEX IF NOT EXISTS idx_wallets_phone ON customer_wallets(phone);
CREATE INDEX IF NOT EXISTS idx_wallets_customer_id ON customer_wallets(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallets_balance ON customer_wallets(balance) WHERE balance > 0;

-- =====================================================
-- PART 3: WALLET_TRANSACTIONS TABLE
-- Transaction history (immutable log)
-- =====================================================

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id SERIAL PRIMARY KEY,

    -- Links
    phone VARCHAR(20) NOT NULL,
    wallet_id INTEGER REFERENCES customer_wallets(id),

    -- Transaction type
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'DEPOSIT',          -- Nap tien (bank transfer, hoan hang)
        'WITHDRAW',         -- Rut tien (dung de giam COD)
        'VIRTUAL_CREDIT',   -- Cap cong no ao
        'VIRTUAL_DEBIT',    -- Su dung cong no ao
        'VIRTUAL_EXPIRE',   -- Cong no ao het han
        'ADJUSTMENT'        -- Dieu chinh thu cong
    )),

    -- Amount (can be negative for withdrawals)
    amount DECIMAL(15,2) NOT NULL,

    -- Balance snapshots
    balance_before DECIMAL(15,2),
    balance_after DECIMAL(15,2),
    virtual_balance_before DECIMAL(15,2),
    virtual_balance_after DECIMAL(15,2),

    -- Source tracking
    source VARCHAR(50) NOT NULL CHECK (source IN (
        'BANK_TRANSFER',
        'RETURN_GOODS',
        'ORDER_PAYMENT',
        'VIRTUAL_CREDIT_ISSUE',
        'VIRTUAL_CREDIT_USE',
        'VIRTUAL_CREDIT_EXPIRE',
        'MANUAL_ADJUSTMENT'
    )),

    -- Reference to related entity
    reference_type VARCHAR(30),  -- bank_tx, ticket, order, manual
    reference_id VARCHAR(100),

    -- Metadata
    note TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for wallet_transactions
CREATE INDEX IF NOT EXISTS idx_wtx_phone ON wallet_transactions(phone);
CREATE INDEX IF NOT EXISTS idx_wtx_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wtx_type ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wtx_created_at ON wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wtx_reference ON wallet_transactions(reference_type, reference_id);

-- =====================================================
-- PART 4: VIRTUAL_CREDITS TABLE
-- Track virtual credits with expiry
-- =====================================================

CREATE TABLE IF NOT EXISTS virtual_credits (
    id SERIAL PRIMARY KEY,

    -- Links
    phone VARCHAR(20) NOT NULL,
    wallet_id INTEGER REFERENCES customer_wallets(id),

    -- Amounts
    original_amount DECIMAL(15,2) NOT NULL CHECK (original_amount > 0),
    remaining_amount DECIMAL(15,2) NOT NULL CHECK (remaining_amount >= 0),

    -- Time tracking
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN (
        'ACTIVE',     -- Dang hoat dong
        'USED',       -- Da su dung het
        'EXPIRED',    -- Het han
        'CANCELLED'   -- Da huy
    )),

    -- Source tracking
    source_type VARCHAR(30) NOT NULL CHECK (source_type IN (
        'RETURN_SHIPPER',   -- Hang tra ve (thu ve)
        'COMPENSATION',     -- Boi thuong
        'PROMOTION'         -- Khuyen mai
    )),
    source_id VARCHAR(100),  -- ticket_id or promotion_id

    -- Usage tracking
    used_in_orders JSONB DEFAULT '[]',  -- [{orderId, amount, usedAt}]

    -- Metadata
    note TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for virtual_credits
CREATE INDEX IF NOT EXISTS idx_vc_phone ON virtual_credits(phone);
CREATE INDEX IF NOT EXISTS idx_vc_wallet_id ON virtual_credits(wallet_id);
CREATE INDEX IF NOT EXISTS idx_vc_status ON virtual_credits(status);
CREATE INDEX IF NOT EXISTS idx_vc_expires_active ON virtual_credits(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_vc_source ON virtual_credits(source_type, source_id);

-- =====================================================
-- PART 5: CUSTOMER_TICKETS TABLE
-- Migrate from Firebase issue_tracking/tickets
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_tickets (
    id SERIAL PRIMARY KEY,

    -- Unique ticket code (auto-generated)
    ticket_code VARCHAR(20) UNIQUE,  -- TV-2026-00001

    -- Firebase migration reference
    firebase_id VARCHAR(100) UNIQUE,

    -- Customer link
    phone VARCHAR(20) NOT NULL,
    customer_id INTEGER REFERENCES customers(id),
    customer_name VARCHAR(255),

    -- Order link
    order_id VARCHAR(50),           -- TPOS Order Code (VD: "NJD/2026/12345")
    tpos_order_id INTEGER,          -- TPOS internal ID
    tracking_code VARCHAR(50),      -- Ma van don
    carrier VARCHAR(50),            -- DVVC: GHN, SPX, GHTK...

    -- Ticket type and status
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'BOOM',            -- Khach khong nhan
        'FIX_COD',         -- Sua COD
        'RETURN_CLIENT',   -- Khach gui ve
        'RETURN_SHIPPER',  -- Thu ve (cong no ao)
        'COMPLAINT',       -- Khieu nai
        'WARRANTY',        -- Bao hanh
        'OTHER'            -- Khac
    )),

    status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',          -- Cho xu ly
        'IN_PROGRESS',      -- Dang xu ly
        'PENDING_GOODS',    -- Cho hang ve
        'PENDING_FINANCE',  -- Cho doi soat
        'COMPLETED',        -- Hoan tat
        'CANCELLED'         -- Da huy
    )),

    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN (
        'low', 'normal', 'high', 'urgent'
    )),

    -- Ticket details
    subject VARCHAR(255),
    description TEXT,

    -- Products involved
    products JSONB DEFAULT '[]',
    -- Format: [{id, name, sku, price, quantity, status: "returned"|"damaged"|"ok"}]

    -- Financial details
    original_cod DECIMAL(15,2),     -- COD goc
    new_cod DECIMAL(15,2),          -- COD moi (neu sua)
    refund_amount DECIMAL(15,2),    -- So tien hoan

    -- Wallet integration
    wallet_credited BOOLEAN DEFAULT FALSE,
    wallet_transaction_id INTEGER REFERENCES wallet_transactions(id),

    -- Virtual credit (for RETURN_SHIPPER)
    virtual_credit_id INTEGER REFERENCES virtual_credits(id),
    virtual_credit_amount DECIMAL(15,2),

    -- FIX_COD specific
    fix_cod_reason VARCHAR(30) CHECK (fix_cod_reason IN (
        'WRONG_SHIP',       -- Ship nham
        'CUSTOMER_DEBT',    -- Khach no
        'DISCOUNT',         -- Giam gia
        'REJECT_PARTIAL',   -- Khach tu choi 1 phan
        'RETURN_OLD_ORDER'  -- Tra hang don cu
    )),

    -- Timeline tracking
    deadline TIMESTAMP,
    carrier_deadline TIMESTAMP,     -- Deadline DVVC tra hang
    received_at TIMESTAMP,          -- Ngay nhan hang ve kho
    settled_at TIMESTAMP,           -- Ngay doi soat xong

    -- Assignment
    assigned_to VARCHAR(100),

    -- Notes and attachments
    internal_note TEXT,
    attachments JSONB DEFAULT '[]',
    -- Format: [{url, filename, type, uploaded_at}]

    -- Action history
    action_history JSONB DEFAULT '[]',
    -- Format: [{action, old_status, new_status, performed_by, performed_at, note}]

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_by VARCHAR(100)
);

-- Indexes for customer_tickets
CREATE INDEX IF NOT EXISTS idx_tickets_phone ON customer_tickets(phone);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON customer_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_firebase_id ON customer_tickets(firebase_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_code ON customer_tickets(ticket_code);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON customer_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON customer_tickets(type);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON customer_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON customer_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON customer_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_pending ON customer_tickets(status) WHERE status IN ('PENDING', 'IN_PROGRESS', 'PENDING_GOODS', 'PENDING_FINANCE');

-- =====================================================
-- PART 6: CUSTOMER_ACTIVITIES TABLE
-- Unified activity timeline
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_activities (
    id SERIAL PRIMARY KEY,

    -- Customer link
    phone VARCHAR(20) NOT NULL,
    customer_id INTEGER REFERENCES customers(id),

    -- Activity type
    activity_type VARCHAR(30) NOT NULL CHECK (activity_type IN (
        'WALLET_DEPOSIT',
        'WALLET_WITHDRAW',
        'WALLET_VIRTUAL_CREDIT',
        'TICKET_CREATED',
        'TICKET_UPDATED',
        'TICKET_COMPLETED',
        'ORDER_CREATED',
        'ORDER_DELIVERED',
        'ORDER_RETURNED',
        'MESSAGE_SENT',
        'MESSAGE_RECEIVED',
        'PROFILE_UPDATED',
        'TAG_ADDED',
        'NOTE_ADDED'
    )),

    -- Content
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Reference to related entity
    reference_type VARCHAR(30),  -- wallet_tx, ticket, order, message
    reference_id VARCHAR(100),

    -- Extra data
    metadata JSONB DEFAULT '{}',

    -- UI hints
    icon VARCHAR(30),    -- Font Awesome icon name
    color VARCHAR(20),   -- green, red, blue, orange...

    -- Metadata
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for customer_activities
CREATE INDEX IF NOT EXISTS idx_activities_phone ON customer_activities(phone);
CREATE INDEX IF NOT EXISTS idx_activities_customer_id ON customer_activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON customer_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON customer_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_reference ON customer_activities(reference_type, reference_id);

-- =====================================================
-- PART 7: CUSTOMER_NOTES TABLE
-- Internal notes about customers
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_notes (
    id SERIAL PRIMARY KEY,

    -- Customer link
    phone VARCHAR(20) NOT NULL,
    customer_id INTEGER REFERENCES customers(id),

    -- Note content
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,

    -- Category
    category VARCHAR(30) DEFAULT 'general' CHECK (category IN (
        'general',      -- Ghi chu chung
        'warning',      -- Canh bao
        'important',    -- Quan trong
        'follow_up'     -- Can theo doi
    )),

    -- Metadata
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for customer_notes
CREATE INDEX IF NOT EXISTS idx_notes_phone ON customer_notes(phone);
CREATE INDEX IF NOT EXISTS idx_notes_customer_id ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON customer_notes(is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_category ON customer_notes(category);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON customer_notes(created_at DESC);

-- =====================================================
-- PART 8: UPDATE BALANCE_HISTORY TABLE
-- Link to customer wallet
-- =====================================================

-- Add customer link columns to balance_history
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20);
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS customer_id INTEGER;
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS wallet_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS wallet_transaction_id INTEGER;

-- Indexes for balance_history customer link
CREATE INDEX IF NOT EXISTS idx_bh_customer_phone ON balance_history(customer_phone);
CREATE INDEX IF NOT EXISTS idx_bh_unprocessed ON balance_history(wallet_processed) WHERE wallet_processed = FALSE;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

/*
-- Run after migration to verify:

-- 1. Check all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('customers', 'customer_wallets', 'wallet_transactions',
                   'virtual_credits', 'customer_tickets', 'customer_activities', 'customer_notes');

-- 2. Check customers table has new columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'customers'
AND column_name IN ('tier', 'tags', 'rfm_segment', 'total_orders');

-- 3. Count indexes created
SELECT COUNT(*) as index_count FROM pg_indexes
WHERE schemaname = 'public'
AND (indexname LIKE 'idx_wallets_%'
     OR indexname LIKE 'idx_wtx_%'
     OR indexname LIKE 'idx_vc_%'
     OR indexname LIKE 'idx_tickets_%'
     OR indexname LIKE 'idx_activities_%'
     OR indexname LIKE 'idx_notes_%');

*/

-- =====================================================
-- END OF SCHEMA
-- =====================================================
