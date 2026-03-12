CUSTOMER 360° - UNIFIED CUSTOMER HUB
TỔNG QUAN GIẢI PHÁP
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                         │
│                         CUSTOMER 360° - UNIFIED CUSTOMER HUB                            │
│                                                                                         │
│   "Một nơi duy nhất để xem TẤT CẢ thông tin về một khách hàng"                         │
│                                                                                         │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                           👤 KHÁCH HÀNG: 0901234567                             │   │
│   │                              Nguyễn Văn A - VIP                                  │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│   │   💰 VÍ      │  │  📋 SỰ VỤ   │  │  🛒 ĐƠN     │  │  💬 TƯƠNG   │              │
│   │   TIỀN      │  │              │  │   HÀNG      │  │   TÁC       │              │
│   ├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤              │
│   │ Số dư: 500k │  │ 3 sự vụ     │  │ 15 đơn      │  │ 8 tin nhắn  │              │
│   │ Ảo: 200k    │  │ 1 đang xử lý│  │ Tổng: 5tr   │  │ 2 comment   │              │
│   │ Tổng: 700k  │  │ 2 hoàn tất  │  │ Last: 3 ngày│  │ Last: hôm qua│              │
│   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                          📊 TIMELINE HOẠT ĐỘNG                                  │   │
│   │  ─────────────────────────────────────────────────────────────────────────────  │   │
│   │  05/01 💰 Chuyển khoản 500,000đ                                                │   │
│   │  04/01 📋 Sự vụ #123 - BOOM - Đã hoàn tất                                      │   │
│   │  03/01 🛒 Đơn NJD/2026/45678 - Giao thành công                                 │   │
│   │  02/01 💬 Inbox hỏi về size áo                                                  │   │
│   │  01/01 📋 Sự vụ #122 - Đổi size - Cấp công nợ ảo 200k                          │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│   ┌──────────────────────────────────┐  ┌────────────────────────────────────────┐     │
│   │  🏷️ TAGS & PHÂN LOẠI            │  │  📈 THỐNG KÊ                           │     │
│   │  ┌─────┐ ┌─────┐ ┌────────────┐ │  │  • Tổng chi tiêu: 5,200,000đ           │     │
│   │  │ VIP │ │Loyal│ │Hay đổi size│ │  │  • Số đơn: 15 (12 thành công)          │     │
│   │  └─────┘ └─────┘ └────────────┘ │  │  • Tỷ lệ hoàn: 20%                     │     │
│   └──────────────────────────────────┘  │  • Điểm tích lũy: 5,200               │     │
│                                          └────────────────────────────────────────┘     │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │  🔮 MỞ RỘNG TƯƠNG LAI                                                           │   │
│   │  • Loyalty Points • Upsell Suggestions • Behavior Analytics • RFM Scoring      │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘



1. KIẾN TRÚC TỔNG THỂ
1.1 High-Level Architecture
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              CUSTOMER 360° ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│                              ┌─────────────────────┐                                    │
│                              │   CLOUDFLARE        │                                    │
│                              │   WORKER            │                                    │
│                              │   (API Gateway)     │                                    │
│                              └──────────┬──────────┘                                    │
│                                         │                                               │
│                    ┌────────────────────┼────────────────────┐                          │
│                    │                    │                    │                          │
│                    ▼                    ▼                    ▼                          │
│           ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                     │
│           │   RENDER     │    │   FIREBASE   │    │   TPOS API   │                     │
│           │   (Main DB)  │    │   (Realtime) │    │   (External) │                     │
│           └──────────────┘    └──────────────┘    └──────────────┘                     │
│                    │                    │                    │                          │
│                    │                    │                    │                          │
│           ┌───────┴───────┐    ┌───────┴───────┐    ┌───────┴───────┐                  │
│           │  CUSTOMER     │    │  REALTIME     │    │  ORDER        │                  │
│           │  DATA HUB     │    │  EVENTS       │    │  HISTORY      │                  │
│           │               │    │               │    │               │                  │
│           │ • customers   │    │ • tickets     │    │ • Orders      │                  │
│           │ • wallets     │    │   (sync)      │    │ • Invoices    │                  │
│           │ • transactions│    │ • activities  │    │ • Products    │                  │
│           │ • tickets     │    │ • presence    │    │               │                  │
│           │ • activities  │    │               │    │               │                  │
│           └───────────────┘    └───────────────┘    └───────────────┘                  │
│                                                                                         │
│           ════════════════════════════════════════════════════════════                  │
│                                                                                         │
│                              ┌─────────────────────┐                                    │
│                              │   FRONTEND APPS     │                                    │
│                              └─────────┬───────────┘                                    │
│                                        │                                                │
│           ┌────────────────────────────┼────────────────────────────┐                   │
│           │                            │                            │                   │
│           ▼                            ▼                            ▼                   │
│   ┌───────────────┐          ┌───────────────┐          ┌───────────────┐              │
│   │  customer-    │          │  orders-      │          │  balance-     │              │
│   │  hub/         │          │  report/      │          │  history/     │              │
│   │               │          │               │          │               │              │
│   │  Main Portal  │          │  PBH + Wallet │          │  Bank TXs     │              │
│   │  Customer 360 │          │  Integration  │          │  QR Codes     │              │
│   └───────────────┘          └───────────────┘          └───────────────┘              │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘


1.2 Data Flow Architecture
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    DATA FLOW                                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────┐                                                                        │
│  │   SePay     │──── Webhook ────┐                                                      │
│  │  (Bank TX)  │                 │                                                      │
│  └─────────────┘                 │                                                      │
│                                  ▼                                                      │
│  ┌─────────────┐         ┌─────────────────┐         ┌─────────────────┐               │
│  │   TPOS      │────────►│                 │────────►│   PostgreSQL    │               │
│  │  (Orders)   │         │  RENDER.COM     │         │                 │               │
│  └─────────────┘         │   Backend       │         │  • customers    │               │
│                          │                 │         │  • wallets      │               │
│  ┌─────────────┐         │  API Routes:    │         │  • tickets      │               │
│  │  Firebase   │◄───────►│  /api/customer  │         │  • transactions │               │
│  │  (Events)   │  sync   │  /api/wallet    │         │  • activities   │               │
│  └─────────────┘         │  /api/ticket    │         │                 │               │
│                          │  /api/activity  │         └─────────────────┘               │
│  ┌─────────────┐         │                 │                                            │
│  │  Frontend   │────────►│                 │                                            │
│  │   Apps      │◄────────│                 │                                            │
│  └─────────────┘         └─────────────────┘                                            │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘



2. DATABASE SCHEMA (PostgreSQL - Render.com)
2.1 Core Table: customers (Master Customer Data)
-- ═══════════════════════════════════════════════════════════════════════════════
-- BẢNG CHÍNH: customers - Master Customer Record
-- Khóa chính: phone (SĐT chuẩn hóa)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    
    -- ═══ IDENTITY ═══
    phone VARCHAR(20) UNIQUE NOT NULL,           -- Khóa chính logic (VD: "0901234567")
    
    -- ═══ THÔNG TIN CƠ BẢN ═══
    name VARCHAR(255),                           -- Tên khách hàng
    email VARCHAR(255),
    
    -- ═══ ĐỊA CHỈ ═══
    addresses JSONB DEFAULT '[]',                -- Array of addresses
    -- Format: [{"id": 1, "address": "123 ABC", "ward": "...", "district": "...", 
    --           "city": "...", "is_default": true, "label": "Nhà"}]
    
    -- ═══ LIÊN KẾT EXTERNAL ═══
    tpos_partner_id INTEGER,                     -- Link đến TPOS Partner.Id
    facebook_id VARCHAR(100),                    -- Facebook PSID (nếu có)
    zalo_id VARCHAR(100),                        -- Zalo ID (nếu có)
    
    -- ═══ PHÂN LOẠI & STATUS ═══
    status VARCHAR(30) DEFAULT 'active',         -- active, warning, danger, blocked
    tier VARCHAR(20) DEFAULT 'normal',           -- normal, silver, gold, vip, blacklist
    tags JSONB DEFAULT '[]',                     -- Flexible tags: ["Hay đổi size", "VIP", ...]
    
    -- ═══ THỐNG KÊ TỰ ĐỘNG (Cập nhật bởi triggers) ═══
    total_orders INTEGER DEFAULT 0,              -- Tổng số đơn hàng
    total_spent DECIMAL(15,2) DEFAULT 0,         -- Tổng chi tiêu
    successful_orders INTEGER DEFAULT 0,         -- Đơn thành công
    returned_orders INTEGER DEFAULT 0,           -- Đơn hoàn/boom
    return_rate DECIMAL(5,2) DEFAULT 0,          -- Tỷ lệ hoàn (%)
    
    -- ═══ ENGAGEMENT METRICS ═══
    first_order_date TIMESTAMP,                  -- Ngày đơn đầu tiên
    last_order_date TIMESTAMP,                   -- Ngày đơn gần nhất
    last_interaction_date TIMESTAMP,             -- Lần tương tác gần nhất
    days_since_last_order INTEGER,               -- Số ngày từ đơn cuối
    
    -- ═══ RFM SCORING (cho Upsell/Marketing) ═══
    rfm_recency_score INTEGER DEFAULT 0,         -- 1-5 (5 = mới mua gần đây)
    rfm_frequency_score INTEGER DEFAULT 0,       -- 1-5 (5 = mua thường xuyên)
    rfm_monetary_score INTEGER DEFAULT 0,        -- 1-5 (5 = chi tiêu cao)
    rfm_segment VARCHAR(30),                     -- Champions, Loyal, At Risk, Lost, etc.
    
    -- ═══ GHI CHÚ ═══
    internal_note TEXT,                          -- Ghi chú nội bộ
    
    -- ═══ METADATA ═══
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    
    -- ═══ CONSTRAINTS ═══
    CONSTRAINT chk_phone_format CHECK (phone ~ '^0[0-9]{9,10}$'),
    CONSTRAINT chk_valid_status CHECK (status IN ('active', 'warning', 'danger', 'blocked')),
    CONSTRAINT chk_valid_tier CHECK (tier IN ('normal', 'silver', 'gold', 'vip', 'blacklist'))
);

-- ═══ INDEXES ═══
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_tpos_id ON customers(tpos_partner_id);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_tier ON customers(tier);
CREATE INDEX idx_customers_last_order ON customers(last_order_date DESC);
CREATE INDEX idx_customers_rfm ON customers(rfm_segment);
CREATE INDEX idx_customers_tags ON customers USING GIN(tags);


2.2 Table: customer_wallets (Ví Tiền)
-- ═══════════════════════════════════════════════════════════════════════════════
-- BẢNG: customer_wallets - Ví tiền khách hàng
-- Liên kết 1-1 với customers qua phone
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE customer_wallets (
    id SERIAL PRIMARY KEY,
    
    -- ═══ LIÊN KẾT ═══
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    phone VARCHAR(20) UNIQUE NOT NULL REFERENCES customers(phone),
    
    -- ═══ SỐ DƯ ═══
    balance DECIMAL(15,2) DEFAULT 0,             -- Số dư THỰC
    virtual_balance DECIMAL(15,2) DEFAULT 0,     -- Số dư ẢO (công nợ ảo active)
    
    -- ═══ TỔNG HỢP ═══
    total_deposited DECIMAL(15,2) DEFAULT 0,     -- Tổng tiền đã nạp
    total_withdrawn DECIMAL(15,2) DEFAULT 0,     -- Tổng tiền đã rút/dùng
    total_virtual_issued DECIMAL(15,2) DEFAULT 0,-- Tổng công nợ ảo đã cấp
    total_virtual_used DECIMAL(15,2) DEFAULT 0,  -- Tổng công nợ ảo đã dùng
    total_virtual_expired DECIMAL(15,2) DEFAULT 0,-- Tổng công nợ ảo đã hết hạn
    
    -- ═══ METADATA ═══
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- ═══ CONSTRAINTS ═══
    CONSTRAINT chk_balance_positive CHECK (balance >= 0),
    CONSTRAINT chk_virtual_balance_positive CHECK (virtual_balance >= 0)
);

-- Auto-create wallet when customer is created
CREATE OR REPLACE FUNCTION create_wallet_for_customer()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO customer_wallets (customer_id, phone)
    VALUES (NEW.id, NEW.phone)
    ON CONFLICT (phone) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_wallet
AFTER INSERT ON customers
FOR EACH ROW EXECUTE FUNCTION create_wallet_for_customer();


2.3 Table: wallet_transactions (Lịch Sử Giao Dịch Ví)
-- ═══════════════════════════════════════════════════════════════════════════════
-- BẢNG: wallet_transactions - Lịch sử giao dịch ví (IMMUTABLE)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    
    -- ═══ LIÊN KẾT ═══
    phone VARCHAR(20) NOT NULL REFERENCES customers(phone),
    wallet_id INTEGER REFERENCES customer_wallets(id),
    
    -- ═══ LOẠI GIAO DỊCH ═══
    type VARCHAR(30) NOT NULL,
    -- DEPOSIT: Nạp tiền (từ bank transfer, hoàn hàng)
    -- WITHDRAW: Rút tiền (dùng để giảm COD, rút về)
    -- VIRTUAL_CREDIT: Cấp công nợ ảo
    -- VIRTUAL_DEBIT: Sử dụng công nợ ảo
    -- VIRTUAL_EXPIRE: Công nợ ảo hết hạn
    -- ADJUSTMENT: Điều chỉnh thủ công
    
    -- ═══ SỐ TIỀN ═══
    amount DECIMAL(15,2) NOT NULL,               -- Số tiền (+ hoặc -)
    balance_before DECIMAL(15,2),
    balance_after DECIMAL(15,2),
    virtual_balance_before DECIMAL(15,2),
    virtual_balance_after DECIMAL(15,2),
    
    -- ═══ NGUỒN ═══
    source VARCHAR(50) NOT NULL,
    -- BANK_TRANSFER, RETURN_GOODS, ORDER_PAYMENT, VIRTUAL_CREDIT_ISSUE,
    -- VIRTUAL_CREDIT_USE, VIRTUAL_CREDIT_EXPIRE, MANUAL_ADJUSTMENT
    
    -- ═══ THAM CHIẾU ═══
    reference_type VARCHAR(30),                  -- bank_tx, ticket, order, manual
    reference_id VARCHAR(100),
    
    -- ═══ METADATA ═══
    note TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wtx_phone ON wallet_transactions(phone);
CREATE INDEX idx_wtx_type ON wallet_transactions(type);
CREATE INDEX idx_wtx_created_at ON wallet_transactions(created_at DESC);
CREATE INDEX idx_wtx_reference ON wallet_transactions(reference_type, reference_id);


2.4 Table: virtual_credits (Công Nợ Ảo)
-- ═══════════════════════════════════════════════════════════════════════════════
-- BẢNG: virtual_credits - Công nợ ảo có thời hạn
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE virtual_credits (
    id SERIAL PRIMARY KEY,
    
    -- ═══ LIÊN KẾT ═══
    phone VARCHAR(20) NOT NULL REFERENCES customers(phone),
    wallet_id INTEGER REFERENCES customer_wallets(id),
    
    -- ═══ SỐ TIỀN ═══
    original_amount DECIMAL(15,2) NOT NULL,
    remaining_amount DECIMAL(15,2) NOT NULL,
    
    -- ═══ THỜI HẠN ═══
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    
    -- ═══ TRẠNG THÁI ═══
    status VARCHAR(20) DEFAULT 'ACTIVE',         -- ACTIVE, USED, EXPIRED, CANCELLED
    
    -- ═══ NGUỒN ═══
    source_type VARCHAR(30) NOT NULL,            -- RETURN_SHIPPER, COMPENSATION, PROMOTION
    source_id VARCHAR(100),                      -- ticket_id hoặc promotion_id
    
    -- ═══ SỬ DỤNG ═══
    used_in_orders JSONB DEFAULT '[]',           -- [{orderId, amount, usedAt}]
    
    -- ═══ METADATA ═══
    note TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vc_phone ON virtual_credits(phone);
CREATE INDEX idx_vc_status ON virtual_credits(status);
CREATE INDEX idx_vc_expires_at ON virtual_credits(expires_at) WHERE status = 'ACTIVE';


2.5 Table: customer_tickets (Sự Vụ Khách Hàng)
-- ═══════════════════════════════════════════════════════════════════════════════
-- BẢNG: customer_tickets - Sự vụ khách hàng (MIGRATE từ Firebase)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE customer_tickets (
    id SERIAL PRIMARY KEY,
    
    -- ═══ IDENTITY ═══
    ticket_code VARCHAR(20) UNIQUE NOT NULL,     -- TV-2026-00001 (auto-generated)
    
    -- ═══ LIÊN KẾT KHÁCH HÀNG ═══
    phone VARCHAR(20) NOT NULL REFERENCES customers(phone),
    customer_id INTEGER REFERENCES customers(id),
    customer_name VARCHAR(255),
    
    -- ═══ LIÊN KẾT ĐƠN HÀNG ═══
    order_id VARCHAR(50),                        -- TPOS Order ID (VD: "NJD/2026/12345")
    tpos_order_id INTEGER,                       -- TPOS internal ID
    tracking_code VARCHAR(50),                   -- Mã vận đơn
    carrier VARCHAR(50),                         -- ĐVVC: GHN, SPX, GHTK...
    
    -- ═══ LOẠI & TRẠNG THÁI ═══
    type VARCHAR(30) NOT NULL,
    -- BOOM: Khách không nhận
    -- FIX_COD: Sửa COD
    -- RETURN_CLIENT: Khách gửi về
    -- RETURN_SHIPPER: Thu về (công nợ ảo)
    -- COMPLAINT: Khiếu nại
    -- WARRANTY: Bảo hành
    -- OTHER: Khác
    
    status VARCHAR(30) DEFAULT 'PENDING',
    -- PENDING: Chờ xử lý
    -- IN_PROGRESS: Đang xử lý
    -- PENDING_GOODS: Chờ hàng về
    -- PENDING_FINANCE: Chờ đối soát
    -- COMPLETED: Hoàn tất
    -- CANCELLED: Đã hủy
    
    priority VARCHAR(20) DEFAULT 'normal',       -- low, normal, high, urgent
    
    -- ═══ CHI TIẾT SỰ VỤ ═══
    subject VARCHAR(255),                        -- Tiêu đề ngắn
    description TEXT,                            -- Mô tả chi tiết
    
    -- ═══ SẢN PHẨM LIÊN QUAN ═══
    products JSONB DEFAULT '[]',
    -- [{id, name, sku, price, quantity, status: "returned"|"damaged"|"ok"}]
    
    -- ═══ TÀI CHÍNH ═══
    original_cod DECIMAL(15,2),                  -- COD gốc
    new_cod DECIMAL(15,2),                       -- COD mới (nếu sửa)
    refund_amount DECIMAL(15,2),                 -- Số tiền hoàn
    wallet_credited BOOLEAN DEFAULT FALSE,       -- Đã cộng ví chưa
    wallet_transaction_id INTEGER,               -- Ref đến wallet_transaction
    
    -- ═══ CÔNG NỢ ẢO (cho RETURN_SHIPPER) ═══
    virtual_credit_id INTEGER REFERENCES virtual_credits(id),
    virtual_credit_amount DECIMAL(15,2),
    
    -- ═══ FIX_COD DETAILS ═══
    fix_cod_reason VARCHAR(30),                  -- WRONG_SHIP, CUSTOMER_DEBT, DISCOUNT, REJECT_PARTIAL
    
    -- ═══ TIMELINE & TRACKING ═══
    deadline TIMESTAMP,                          -- Deadline xử lý
    carrier_deadline TIMESTAMP,                  -- Deadline ĐVVC trả hàng
    received_at TIMESTAMP,                       -- Ngày nhận hàng về kho
    settled_at TIMESTAMP,                        -- Ngày đối soát xong
    
    -- ═══ NGƯỜI XỬ LÝ ═══
    assigned_to VARCHAR(100),                    -- Nhân viên phụ trách
    
    -- ═══ GHI CHÚ & ATTACHMENTS ═══
    internal_note TEXT,
    attachments JSONB DEFAULT '[]',              -- [{url, filename, type, uploaded_at}]
    
    -- ═══ LỊCH SỬ XỬ LÝ ═══
    action_history JSONB DEFAULT '[]',
    -- [{action, old_status, new_status, performed_by, performed_at, note}]
    
    -- ═══ METADATA ═══
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_by VARCHAR(100),
    
    -- ═══ FIREBASE MIGRATION ═══
    firebase_id VARCHAR(100),                    -- Original Firebase push ID
    
    -- ═══ CONSTRAINTS ═══
    CONSTRAINT chk_valid_type CHECK (type IN ('BOOM', 'FIX_COD', 'RETURN_CLIENT', 
        'RETURN_SHIPPER', 'COMPLAINT', 'WARRANTY', 'OTHER')),
    CONSTRAINT chk_valid_status CHECK (status IN ('PENDING', 'IN_PROGRESS', 
        'PENDING_GOODS', 'PENDING_FINANCE', 'COMPLETED', 'CANCELLED'))
);

-- ═══ INDEXES ═══
CREATE INDEX idx_tickets_phone ON customer_tickets(phone);
CREATE INDEX idx_tickets_status ON customer_tickets(status);
CREATE INDEX idx_tickets_type ON customer_tickets(type);
CREATE INDEX idx_tickets_order_id ON customer_tickets(order_id);
CREATE INDEX idx_tickets_created_at ON customer_tickets(created_at DESC);
CREATE INDEX idx_tickets_assigned ON customer_tickets(assigned_to);

-- ═══ TICKET CODE GENERATOR ═══
CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TRIGGER AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(ticket_code FROM 9 FOR 5) AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM customer_tickets
    WHERE ticket_code LIKE 'TV-' || year_part || '-%';
    
    NEW.ticket_code := 'TV-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_ticket_code
BEFORE INSERT ON customer_tickets
FOR EACH ROW
WHEN (NEW.ticket_code IS NULL)
EXECUTE FUNCTION generate_ticket_code();


2.6 Table: customer_activities (Timeline Hoạt Động)
-- ═══════════════════════════════════════════════════════════════════════════════
-- BẢNG: customer_activities - Timeline hoạt động khách hàng
-- Unified activity stream cho Customer 360° view
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE customer_activities (
    id SERIAL PRIMARY KEY,
    
    -- ═══ LIÊN KẾT ═══
    phone VARCHAR(20) NOT NULL REFERENCES customers(phone),
    customer_id INTEGER REFERENCES customers(id),
    
    -- ═══ LOẠI HOẠT ĐỘNG ═══
    activity_type VARCHAR(30) NOT NULL,
    -- WALLET_DEPOSIT, WALLET_WITHDRAW, WALLET_VIRTUAL_CREDIT
    -- TICKET_CREATED, TICKET_UPDATED, TICKET_COMPLETED
    -- ORDER_CREATED, ORDER_DELIVERED, ORDER_RETURNED
    -- MESSAGE_SENT, MESSAGE_RECEIVED
    -- PROFILE_UPDATED, TAG_ADDED, NOTE_ADDED
    
    -- ═══ NỘI DUNG ═══
    title VARCHAR(255) NOT NULL,                 -- "Chuyển khoản 500,000đ"
    description TEXT,                            -- Chi tiết (optional)
    
    -- ═══ THAM CHIẾU ═══
    reference_type VARCHAR(30),                  -- wallet_tx, ticket, order, message
    reference_id VARCHAR(100),
    
    -- ═══ DỮ LIỆU BỔ SUNG ═══
    metadata JSONB DEFAULT '{}',                 -- Flexible extra data
    
    -- ═══ ICON & COLOR (cho UI) ═══
    icon VARCHAR(30),                            -- Font Awesome icon name
    color VARCHAR(20),                           -- green, red, blue, orange...
    
    -- ═══ METADATA ═══
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activities_phone ON customer_activities(phone);
CREATE INDEX idx_activities_type ON customer_activities(activity_type);
CREATE INDEX idx_activities_created_at ON customer_activities(created_at DESC);

-- ═══ VIEW: Unified Timeline ═══
CREATE OR REPLACE VIEW customer_timeline AS
SELECT 
    id,
    phone,
    activity_type,
    title,
    description,
    reference_type,
    reference_id,
    metadata,
    icon,
    color,
    created_by,
    created_at
FROM customer_activities
ORDER BY created_at DESC;


2.7 Table: customer_notes (Ghi Chú)
-- ═══════════════════════════════════════════════════════════════════════════════
-- BẢNG: customer_notes - Ghi chú về khách hàng
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE customer_notes (
    id SERIAL PRIMARY KEY,
    
    phone VARCHAR(20) NOT NULL REFERENCES customers(phone),
    customer_id INTEGER REFERENCES customers(id),
    
    -- ═══ NỘI DUNG ═══
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,             -- Ghim lên đầu
    
    -- ═══ PHÂN LOẠI ═══
    category VARCHAR(30) DEFAULT 'general',      -- general, warning, important, follow_up
    
    -- ═══ METADATA ═══
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notes_phone ON customer_notes(phone);
CREATE INDEX idx_notes_pinned ON customer_notes(is_pinned) WHERE is_pinned = TRUE;


2.8 Cập Nhật: balance_history (Link to Customer)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ALTER: balance_history - Thêm liên kết customer
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE balance_history 
ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS customer_id INTEGER,
ADD COLUMN IF NOT EXISTS wallet_processed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS wallet_transaction_id INTEGER;

-- Foreign key (soft - không bắt buộc vì có thể có GD không match customer)
CREATE INDEX idx_bh_customer_phone ON balance_history(customer_phone);
CREATE INDEX idx_bh_unprocessed ON balance_history(wallet_processed) WHERE wallet_processed = FALSE;



3. ENTITY RELATIONSHIP DIAGRAM
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              ENTITY RELATIONSHIP DIAGRAM                                │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│                              ┌───────────────────────┐                                  │
│                              │      customers        │                                  │
│                              │  ═══════════════════  │                                  │
│                              │  PK: id               │                                  │
│                              │  UK: phone ◄──────────┼──────────────────────┐          │
│                              │                       │                      │          │
│                              │  name                 │                      │          │
│                              │  status, tier, tags   │                      │          │
│                              │  total_orders         │                      │          │
│                              │  rfm_segment          │                      │          │
│                              └───────────┬───────────┘                      │          │
│                                          │                                  │          │
│               ┌──────────────────────────┼──────────────────────────┐       │          │
│               │                          │                          │       │          │
│               ▼                          ▼                          ▼       │          │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐│          │
│   │  customer_wallets   │   │  customer_tickets   │   │ customer_activities ││          │
│   │  ═══════════════════│   │  ═══════════════════│   │ ════════════════════││          │
│   │  PK: id             │   │  PK: id             │   │ PK: id              ││          │
│   │  FK: phone ─────────┼───│  FK: phone ─────────┼───│ FK: phone ──────────┼┘          │
│   │                     │   │                     │   │                     │           │
│   │  balance            │   │  ticket_code        │   │ activity_type       │           │
│   │  virtual_balance    │   │  type, status       │   │ title               │           │
│   │                     │   │  order_id           │   │ reference_type/id   │           │
│   └──────────┬──────────┘   │  refund_amount      │   │ metadata            │           │
│              │              │  virtual_credit_id ─┼─┐ └─────────────────────┘           │
│              │              └─────────────────────┘ │                                   │
│              │                                      │                                   │
│   ┌──────────┴──────────┐              ┌────────────┴────────┐                          │
│   │                     │              │                     │                          │
│   ▼                     ▼              ▼                     │                          │
│   ┌─────────────────────┐   ┌─────────────────────┐         │                          │
│   │ wallet_transactions │   │   virtual_credits   │◄────────┘                          │
│   │ ════════════════════│   │ ════════════════════│                                    │
│   │ PK: id              │   │ PK: id              │                                    │
│   │ FK: phone           │   │ FK: phone           │                                    │
│   │ FK: wallet_id       │   │ FK: wallet_id       │                                    │
│   │                     │   │                     │                                    │
│   │ type, amount        │   │ original_amount     │                                    │
│   │ source              │   │ remaining_amount    │                                    │
│   │ reference_type/id   │   │ expires_at          │                                    │
│   └─────────────────────┘   │ status              │                                    │
│                             └─────────────────────┘                                    │
│                                                                                         │
│   ┌─────────────────────┐   ┌─────────────────────┐                                    │
│   │   customer_notes    │   │   balance_history   │                                    │
│   │ ════════════════════│   │ ════════════════════│                                    │
│   │ PK: id              │   │ PK: id              │                                    │
│   │ FK: phone           │   │ FK: customer_phone  │ (soft link)                        │
│   │                     │   │                     │                                    │
│   │ content             │   │ sepay_id            │                                    │
│   │ category            │   │ transfer_amount     │                                    │
│   │ is_pinned           │   │ wallet_processed    │                                    │
│   └─────────────────────┘   └─────────────────────┘                                    │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘



4. API ENDPOINTS
4.1 Customer APIs
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CUSTOMER APIs                                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  GET    /api/customer/:phone                                                            │
│         → Lấy thông tin đầy đủ của khách hàng (Customer 360° View)                     │
│         Response: {                                                                     │
│           customer: {...},                                                              │
│           wallet: {...},                                                                │
│           tickets: [{...}],        // Latest 10                                         │
│           activities: [{...}],     // Latest 20                                         │
│           notes: [{...}],                                                               │
│           stats: {...}                                                                  │
│         }                                                                               │
│                                                                                         │
│  POST   /api/customer                                                                   │
│         → Tạo khách hàng mới (auto-create wallet)                                      │
│         Body: { phone, name, email?, addresses? }                                       │
│                                                                                         │
│  PUT    /api/customer/:phone                                                            │
│         → Cập nhật thông tin khách hàng                                                │
│                                                                                         │
│  GET    /api/customer/:phone/tickets                                                    │
│         → Lấy danh sách sự vụ (paginated)                                              │
│         Query: ?status=&type=&page=&limit=                                             │
│                                                                                         │
│  GET    /api/customer/:phone/activities                                                 │
│         → Lấy timeline hoạt động (paginated)                                           │
│         Query: ?type=&from=&to=&page=&limit=                                           │
│                                                                                         │
│  GET    /api/customer/:phone/transactions                                               │
│         → Lấy lịch sử giao dịch ví (paginated)                                         │
│                                                                                         │
│  POST   /api/customer/:phone/note                                                       │
│         → Thêm ghi chú về khách hàng                                                   │
│                                                                                         │
│  PUT    /api/customer/:phone/tags                                                       │
│         → Cập nhật tags                                                                │
│                                                                                         │
│  POST   /api/customer/search                                                            │
│         → Tìm kiếm khách hàng                                                          │
│         Body: { query, filters: {status, tier, tags}, sort, page, limit }              │
│                                                                                         │
│  POST   /api/customer/batch                                                             │
│         → Lấy thông tin nhiều khách cùng lúc                                           │
│         Body: { phones: ["0901234567", "0912345678"] }                                  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘


4.2 Wallet APIs
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   WALLET APIs                                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  GET    /api/wallet/:phone                                                              │
│         → Lấy thông tin ví                                                             │
│         Response: { balance, virtual_balance, virtual_credits: [...], totals }         │
│                                                                                         │
│  POST   /api/wallet/:phone/deposit                                                      │
│         → Nạp tiền vào ví                                                              │
│         Body: { amount, source, reference_type?, reference_id?, note? }                │
│                                                                                         │
│  POST   /api/wallet/:phone/withdraw                                                     │
│         → Rút tiền/sử dụng ví                                                          │
│         Body: { amount, order_id?, note? }                                              │
│         → Tự động trừ virtual credits trước (FIFO)                                     │
│                                                                                         │
│  POST   /api/wallet/:phone/virtual-credit                                               │
│         → Cấp công nợ ảo                                                               │
│         Body: { amount, expiry_days?, source_type, source_id?, note? }                 │
│                                                                                         │
│  POST   /api/wallet/batch-summary                                                       │
│         → Lấy số dư nhiều khách cùng lúc (cho orders-report)                           │
│         Body: { phones: [...] }                                                         │
│                                                                                         │
│  POST   /api/wallet/cron/expire-virtual-credits                                         │
│         → Cron job: Thu hồi công nợ ảo hết hạn                                         │
│                                                                                         │
│  POST   /api/wallet/cron/process-bank-transactions                                      │
│         → Cron job: Xử lý giao dịch bank chưa process                                  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘


4.3 Ticket APIs
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TICKET APIs                                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  GET    /api/ticket                                                                     │
│         → Danh sách tất cả sự vụ (paginated)                                           │
│         Query: ?status=&type=&phone=&assigned_to=&from=&to=&page=&limit=              │
│                                                                                         │
│  GET    /api/ticket/:id                                                                 │
│         → Chi tiết sự vụ                                                               │
│                                                                                         │
│  POST   /api/ticket                                                                     │
│         → Tạo sự vụ mới                                                                │
│         Body: { phone, type, order_id?, products?, ... }                               │
│         → Auto-create customer nếu chưa có                                             │
│         → Auto-issue virtual credit nếu type = RETURN_SHIPPER                          │
│                                                                                         │
│  PUT    /api/ticket/:id                                                                 │
│         → Cập nhật sự vụ                                                               │
│                                                                                         │
│  POST   /api/ticket/:id/action                                                          │
│         → Thực hiện action trên sự vụ                                                  │
│         Body: { action: "receive_goods"|"settle"|"complete"|"cancel", note? }          │
│         → Auto-credit wallet khi complete (nếu applicable)                             │
│                                                                                         │
│  GET    /api/ticket/stats                                                               │
│         → Thống kê sự vụ theo status/type                                              │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘



5. FRONTEND MODULE: customer-hub/
5.1 Cấu Trúc Thư Mục
n2store/
├── customer-hub/                      # ⭐ MODULE MỚI - Customer 360°
│   ├── index.html                     # Main page - Danh sách khách hàng
│   ├── customer-detail.html           # Customer 360° View
│   │
│   ├── js/
│   │   ├── main.js                    # Entry point, routing
│   │   ├── customer-service.js        # API calls
│   │   ├── customer-list.js           # Danh sách khách
│   │   ├── customer-detail.js         # Chi tiết khách (360° View)
│   │   ├── wallet-panel.js            # Panel ví tiền
│   │   ├── ticket-panel.js            # Panel sự vụ
│   │   ├── activity-timeline.js       # Timeline hoạt động
│   │   └── utils.js                   # Utilities
│   │
│   ├── css/
│   │   ├── main.css
│   │   ├── customer-detail.css
│   │   └── components.css
│   │
│   └── README.md
│
├── orders-report/                     # SỬA: Tích hợp Customer Hub
│   ├── tab1-orders.js                 # SỬA: Link đến Customer Hub
│   └── wallet-integration.js          # MỚI: Module wallet
│
├── balance-history/                   # SỬA: Link đến Customer Hub
│   └── main.js                        # SỬA: Click SĐT → Customer Hub
│
└── issue-tracking/                    # SẼ MIGRATE → customer-hub
    └── (deprecated - migrate tickets to PostgreSQL)


5.2 UI Mockup: Customer 360° View
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  ◀ Quay lại              CUSTOMER 360° VIEW                              🔔  👤        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│  │  HEADER - THÔNG TIN CHÍNH                                                         │ │
│  │  ┌──────┐                                                                         │ │
│  │  │  👤  │  Nguyễn Văn A                              ┌─────┐  ┌────────────┐      │ │
│  │  │      │  📱 0901234567                             │ VIP │  │ Hay đổi size│      │ │
│  │  │ Avatar│  ✉️ nguyenvana@gmail.com                  └─────┘  └────────────┘      │ │
│  │  └──────┘  📍 123 ABC, Quận 1, TP.HCM                                             │ │
│  │                                                                                   │ │
│  │  Khách hàng từ: 15/01/2025  •  Lần mua gần nhất: 3 ngày trước  •  15 đơn hàng    │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐│
│  │  QUICK STATS                                                                        ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               ││
│  │  │  💰 VÍ TIỀN  │ │  📋 SỰ VỤ   │ │  🛒 ĐƠN HÀNG │ │  📈 CHI TIÊU │               ││
│  │  │              │ │              │ │              │ │              │               ││
│  │  │  700,000đ   │ │   3 tổng     │ │  15 đơn      │ │  5,200,000đ │               ││
│  │  │  (Thực: 500k)│ │  (1 đang XL) │ │  (12 OK)     │ │  (Avg: 347k) │               ││
│  │  │  (Ảo: 200k) │ │              │ │  Hoàn: 20%   │ │              │               ││
│  │  │ ───────────  │ │              │ │              │ │              │               ││
│  │  │[Xem chi tiết]│ │[Xem chi tiết]│ │[Xem chi tiết]│ │              │               ││
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘               ││
│  └─────────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                         │
│  ┌──────────────────────────┐  ┌────────────────────────────────────────────────────┐  │
│  │  📝 GHI CHÚ NỘI BỘ       │  │  📊 TIMELINE HOẠT ĐỘNG                             │  │
│  │  ────────────────────────│  │  ──────────────────────────────────────────────────│  │
│  │  📌 Khách VIP, ưu tiên   │  │  ● 05/01 💰 Chuyển khoản 500,000đ vào ví          │  │
│  │     xử lý đổi trả        │  │       └─ Nội dung: N2ABC123 Nguyen Van A          │  │
│  │                          │  │                                                    │  │
│  │  ────────────────────────│  │  ● 04/01 📋 Sự vụ #TV-2026-00003 đã hoàn tất      │  │
│  │  05/01 - admin:          │  │       └─ BOOM - Đơn NJD/2026/45678                 │  │
│  │  Đã xử lý xong vấn đề    │  │       └─ Hoàn 300,000đ vào ví                      │  │
│  │  đổi size lần 2          │  │                                                    │  │
│  │                          │  │  ● 03/01 🛒 Đơn NJD/2026/45678 giao thành công    │  │
│  │  ────────────────────────│  │       └─ COD: 350,000đ - Áo thun nam             │  │
│  │  [+ Thêm ghi chú]        │  │                                                    │  │
│  │                          │  │  ● 02/01 💬 Inbox từ khách: "Cho em hỏi size..."  │  │
│  └──────────────────────────┘  │                                                    │  │
│                                │  ● 01/01 📋 Sự vụ #TV-2026-00002 - Cấp công nợ ảo │  │
│                                │       └─ RETURN_SHIPPER - Đổi size áo              │  │
│                                │       └─ Công nợ ảo: 200,000đ (còn 12 ngày)        │  │
│                                │                                                    │  │
│                                │  [Xem thêm...]                                     │  │
│                                └────────────────────────────────────────────────────┘  │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐│
│  │  🎯 HÀNH ĐỘNG NHANH                                                                 ││
│  │                                                                                     ││
│  │  [📋 Tạo sự vụ mới]  [💰 Nạp tiền ví]  [💬 Gửi tin nhắn]  [📦 Xem đơn trên TPOS]  ││
│  │                                                                                     ││
│  └─────────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘


5.3 Modal: Chi Tiết Ví Tiền
┌─────────────────────────────────────────────────────────────────────────────┐
│  💰 CHI TIẾT VÍ TIỀN - 0901234567                                    [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  TỔNG SỐ DƯ KHẢ DỤNG                                                  │ │
│  │                                                                       │ │
│  │               💵 700,000đ                                             │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────┐  ┌─────────────────────────┐            │ │
│  │  │  SỐ DƯ THỰC             │  │  CÔNG NỢ ẢO             │            │ │
│  │  │  500,000đ              │  │  200,000đ              │            │ │
│  │  │  ───────────────────── │  │  ─────────────────────  │            │ │
│  │  │  Có thể rút về         │  │  ⏰ Còn 12 ngày hết hạn │            │ │
│  │  └─────────────────────────┘  └─────────────────────────┘            │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  📋 CÔNG NỢ ẢO CHI TIẾT                                               │ │
│  │  ─────────────────────────────────────────────────────────────────── │ │
│  │  #1  200,000đ  RETURN_SHIPPER  01/01/2026  Hết hạn: 16/01  🟢 ACTIVE │ │
│  │      └─ Ticket: TV-2026-00002 - Đổi size áo                          │ │
│  │                                                                       │ │
│  │  (Không có công nợ ảo khác)                                           │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  📜 LỊCH SỬ GIAO DỊCH                                     [Xem tất cả]│ │
│  │  ─────────────────────────────────────────────────────────────────── │ │
│  │  05/01  DEPOSIT      +500,000đ  Bank transfer   N2ABC123             │ │
│  │  04/01  DEPOSIT      +300,000đ  Return goods    Ticket TV-2026-00003 │ │
│  │  01/01  VIRTUAL_CR   +200,000đ  Virtual credit  Ticket TV-2026-00002 │ │
│  │  28/12  WITHDRAW     -150,000đ  Order payment   NJD/2026/44444       │ │
│  │  ...                                                                  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  HÀNH ĐỘNG                                                            │ │
│  │                                                                       │ │
│  │  [💵 Nạp tiền thủ công]    [📤 Điều chỉnh số dư]                     │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘



6. THUẬT TOÁN & LOGIC QUAN TRỌNG
6.1 Thuật Toán Trừ Ví (FIFO Virtual Credits)
/**
 * Trừ ví khách hàng - Ưu tiên Virtual Credits (FIFO by expires_at)
 * 
 * @param {string} phone - SĐT khách
 * @param {number} amount - Số tiền cần trừ
 * @param {string} orderId - Mã đơn hàng
 * @returns {Object} Result
 */
async function useWalletBalance(phone, amount, orderId) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. Lock wallet for update
        const walletResult = await client.query(
            `SELECT * FROM customer_wallets WHERE phone = $1 FOR UPDATE`,
            [phone]
        );
        
        if (!walletResult.rows.length) {
            throw new WalletError('WALLET_NOT_FOUND', 'Ví không tồn tại');
        }
        
        const wallet = walletResult.rows[0];
        const totalAvailable = Number(wallet.balance) + Number(wallet.virtual_balance);
        
        if (amount > totalAvailable) {
            throw new WalletError('INSUFFICIENT_BALANCE', 
                `Số dư không đủ (Có: ${totalAvailable}, Cần: ${amount})`);
        }
        
        let remaining = amount;
        let virtualUsed = 0;
        let realUsed = 0;
        const usedCredits = [];
        
        // 2. Trừ Virtual Credits trước (FIFO by expires_at)
        if (remaining > 0 && Number(wallet.virtual_balance) > 0) {
            const creditsResult = await client.query(
                `SELECT * FROM virtual_credits 
                 WHERE phone = $1 AND status = 'ACTIVE' AND expires_at > NOW()
                 ORDER BY expires_at ASC
                 FOR UPDATE`,
                [phone]
            );
            
            for (const credit of creditsResult.rows) {
                if (remaining <= 0) break;
                
                const creditRemaining = Number(credit.remaining_amount);
                const useFromCredit = Math.min(creditRemaining, remaining);
                const newCreditRemaining = creditRemaining - useFromCredit;
                const newStatus = newCreditRemaining <= 0 ? 'USED' : 'ACTIVE';
                
                // Update credit
                const usedInOrders = credit.used_in_orders || [];
                usedInOrders.push({
                    orderId,
                    amount: useFromCredit,
                    usedAt: new Date().toISOString()
                });
                
                await client.query(
                    `UPDATE virtual_credits 
                     SET remaining_amount = $1, status = $2, 
                         used_in_orders = $3, updated_at = NOW()
                     WHERE id = $4`,
                    [newCreditRemaining, newStatus, JSON.stringify(usedInOrders), credit.id]
                );
                
                usedCredits.push({
                    creditId: credit.id,
                    amount: useFromCredit
                });
                
                virtualUsed += useFromCredit;
                remaining -= useFromCredit;
            }
        }
        
        // 3. Trừ Real Balance
        if (remaining > 0) {
            realUsed = remaining;
            remaining = 0;
        }
        
        // 4. Update wallet
        const newBalance = Number(wallet.balance) - realUsed;
        const newVirtualBalance = Number(wallet.virtual_balance) - virtualUsed;
        
        await client.query(
            `UPDATE customer_wallets 
             SET balance = $1, virtual_balance = $2, 
                 total_withdrawn = total_withdrawn + $3,
                 total_virtual_used = total_virtual_used + $4,
                 updated_at = NOW()
             WHERE phone = $5`,
            [newBalance, newVirtualBalance, realUsed, virtualUsed, phone]
        );
        
        // 5. Log transactions
        const transactions = [];
        
        if (virtualUsed > 0) {
            const txResult = await client.query(
                `INSERT INTO wallet_transactions 
                 (phone, wallet_id, type, amount, 
                  balance_before, balance_after,
                  virtual_balance_before, virtual_balance_after,
                  source, reference_type, reference_id, note)
                 VALUES ($1, $2, 'VIRTUAL_DEBIT', $3, $4, $5, $6, $7, 
                         'ORDER_PAYMENT', 'order', $8, $9)
                 RETURNING id`,
                [phone, wallet.id, -virtualUsed, 
                 wallet.balance, newBalance,
                 wallet.virtual_balance, newVirtualBalance,
                 orderId, `Trừ công nợ ảo - Đơn ${orderId}`]
            );
            transactions.push({ type: 'VIRTUAL_DEBIT', id: txResult.rows[0].id });
        }
        
        if (realUsed > 0) {
            const txResult = await client.query(
                `INSERT INTO wallet_transactions 
                 (phone, wallet_id, type, amount,
                  balance_before, balance_after,
                  virtual_balance_before, virtual_balance_after,
                  source, reference_type, reference_id, note)
                 VALUES ($1, $2, 'WITHDRAW', $3, $4, $5, $6, $7,
                         'ORDER_PAYMENT', 'order', $8, $9)
                 RETURNING id`,
                [phone, wallet.id, -realUsed,
                 wallet.balance, newBalance,
                 wallet.virtual_balance, newVirtualBalance,
                 orderId, `Trừ số dư thực - Đơn ${orderId}`]
            );
            transactions.push({ type: 'WITHDRAW', id: txResult.rows[0].id });
        }
        
        // 6. Log activity
        await client.query(
            `INSERT INTO customer_activities 
             (phone, customer_id, activity_type, title, description,
              reference_type, reference_id, metadata, icon, color)
             VALUES ($1, (SELECT id FROM customers WHERE phone = $1),
                     'WALLET_WITHDRAW', $2, $3, 'order', $4, $5, 'money-bill', 'orange')`,
            [phone, 
             `Sử dụng ví ${formatCurrency(virtualUsed + realUsed)} cho đơn hàng`,
             `Virtual: ${formatCurrency(virtualUsed)}, Real: ${formatCurrency(realUsed)}`,
             orderId,
             JSON.stringify({ virtualUsed, realUsed, usedCredits })]
        );
        
        await client.query('COMMIT');
        
        return {
            success: true,
            virtualUsed,
            realUsed,
            totalUsed: virtualUsed + realUsed,
            newBalance,
            newVirtualBalance,
            usedCredits,
            transactions
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


6.2 Thuật Toán Cập Nhật RFM Score
/**
 * Cập nhật RFM Score cho khách hàng
 * Chạy daily hoặc khi có đơn hàng mới
 * 
 * RFM = Recency (mới mua) x Frequency (tần suất) x Monetary (giá trị)
 */
async function updateCustomerRFM(phone) {
    const result = await pool.query(`
        WITH customer_metrics AS (
            SELECT 
                c.phone,
                c.last_order_date,
                c.total_orders,
                c.successful_orders,
                c.total_spent,
                EXTRACT(DAY FROM NOW() - c.last_order_date) as days_since_last
            FROM customers c
            WHERE c.phone = $1
        ),
        
        -- Percentile thresholds (có thể điều chỉnh theo business)
        rfm_calc AS (
            SELECT 
                phone,
                
                -- Recency Score (1-5, 5 = mới mua gần đây)
                CASE 
                    WHEN days_since_last IS NULL THEN 1
                    WHEN days_since_last <= 7 THEN 5
                    WHEN days_since_last <= 30 THEN 4
                    WHEN days_since_last <= 90 THEN 3
                    WHEN days_since_last <= 180 THEN 2
                    ELSE 1
                END as recency_score,
                
                -- Frequency Score (1-5, 5 = mua thường xuyên)
                CASE 
                    WHEN successful_orders >= 10 THEN 5
                    WHEN successful_orders >= 5 THEN 4
                    WHEN successful_orders >= 3 THEN 3
                    WHEN successful_orders >= 2 THEN 2
                    ELSE 1
                END as frequency_score,
                
                -- Monetary Score (1-5, 5 = chi tiêu cao)
                CASE 
                    WHEN total_spent >= 5000000 THEN 5
                    WHEN total_spent >= 2000000 THEN 4
                    WHEN total_spent >= 1000000 THEN 3
                    WHEN total_spent >= 500000 THEN 2
                    ELSE 1
                END as monetary_score
                
            FROM customer_metrics
        ),
        
        rfm_segment AS (
            SELECT 
                phone,
                recency_score,
                frequency_score,
                monetary_score,
                
                -- RFM Segment Classification
                CASE 
                    WHEN recency_score >= 4 AND frequency_score >= 4 AND monetary_score >= 4 
                        THEN 'Champions'
                    WHEN recency_score >= 3 AND frequency_score >= 3 AND monetary_score >= 3 
                        THEN 'Loyal'
                    WHEN recency_score >= 4 AND frequency_score <= 2 
                        THEN 'New Customers'
                    WHEN recency_score >= 3 AND frequency_score >= 3 AND monetary_score <= 2 
                        THEN 'Potential Loyalists'
                    WHEN recency_score <= 2 AND frequency_score >= 3 AND monetary_score >= 3 
                        THEN 'At Risk'
                    WHEN recency_score <= 2 AND frequency_score >= 4 AND monetary_score >= 4 
                        THEN 'Cant Lose Them'
                    WHEN recency_score <= 2 AND frequency_score <= 2 
                        THEN 'Lost'
                    ELSE 'Others'
                END as segment
                
            FROM rfm_calc
        )
        
        UPDATE customers c
        SET 
            rfm_recency_score = r.recency_score,
            rfm_frequency_score = r.frequency_score,
            rfm_monetary_score = r.monetary_score,
            rfm_segment = r.segment,
            updated_at = NOW()
        FROM rfm_segment r
        WHERE c.phone = r.phone
        RETURNING c.*;
    `, [phone]);
    
    return result.rows[0];
}


6.3 Trigger: Auto-Update Customer Stats
-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Tự động cập nhật customer stats khi có ticket completed
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_customer_stats_on_ticket()
RETURNS TRIGGER AS $$
BEGIN
    -- Chỉ xử lý khi ticket chuyển sang COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
        
        -- Update returned_orders count nếu là BOOM/RETURN
        IF NEW.type IN ('BOOM', 'RETURN_CLIENT', 'RETURN_SHIPPER') THEN
            UPDATE customers
            SET 
                returned_orders = returned_orders + 1,
                return_rate = CASE 
                    WHEN total_orders > 0 THEN 
                        ROUND((returned_orders + 1)::DECIMAL / total_orders * 100, 2)
                    ELSE 0 
                END,
                last_interaction_date = NOW(),
                updated_at = NOW()
            WHERE phone = NEW.phone;
        END IF;
        
        -- Update tier if return rate too high
        UPDATE customers
        SET 
            status = CASE 
                WHEN return_rate > 50 THEN 'danger'
                WHEN return_rate > 30 THEN 'warning'
                ELSE status 
            END
        WHERE phone = NEW.phone AND return_rate > 30;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_customer_on_ticket
AFTER INSERT OR UPDATE ON customer_tickets
FOR EACH ROW EXECUTE FUNCTION update_customer_stats_on_ticket();



7. MIGRATION PLAN
7.1 Phase 1: Database Setup (Tuần 1)
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: DATABASE SETUP                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Day 1-2: Create Tables                                                     │
│  ├── Run migration: customers table                                         │
│  ├── Run migration: customer_wallets table                                  │
│  ├── Run migration: wallet_transactions table                               │
│  ├── Run migration: virtual_credits table                                   │
│  ├── Run migration: customer_tickets table                                  │
│  ├── Run migration: customer_activities table                               │
│  └── Run migration: customer_notes table                                    │
│                                                                             │
│  Day 3-4: Create Triggers & Functions                                       │
│  ├── Auto-create wallet trigger                                             │
│  ├── Ticket code generator                                                  │
│  ├── Customer stats update trigger                                          │
│  └── RFM calculation function                                               │
│                                                                             │
│  Day 5: Migrate Existing Data                                               │
│  ├── Import customers from balance_customer_info                            │
│  ├── Create wallets with existing debt from balance_history                 │
│  └── Migrate tickets from Firebase → PostgreSQL                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


7.2 Phase 2: Backend APIs (Tuần 2)
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: BACKEND APIs (Render.com)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Day 1-2: Customer APIs                                                     │
│  ├── GET /api/customer/:phone (360° view)                                   │
│  ├── POST /api/customer (create)                                            │
│  ├── PUT /api/customer/:phone (update)                                      │
│  └── POST /api/customer/search                                              │
│                                                                             │
│  Day 3-4: Wallet APIs                                                       │
│  ├── GET /api/wallet/:phone                                                 │
│  ├── POST /api/wallet/:phone/deposit                                        │
│  ├── POST /api/wallet/:phone/withdraw                                       │
│  ├── POST /api/wallet/:phone/virtual-credit                                 │
│  └── POST /api/wallet/batch-summary                                         │
│                                                                             │
│  Day 5: Ticket APIs                                                         │
│  ├── CRUD /api/ticket/*                                                     │
│  ├── POST /api/ticket/:id/action                                            │
│  └── Webhook integration with wallet                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


7.3 Phase 3: Frontend - Customer Hub (Tuần 3-4)
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: FRONTEND - CUSTOMER HUB                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Week 3:                                                                    │
│  ├── Create customer-hub/ folder structure                                  │
│  ├── Build customer list page (index.html)                                  │
│  ├── Build customer detail page (customer-detail.html)                      │
│  └── Implement wallet panel component                                       │
│                                                                             │
│  Week 4:                                                                    │
│  ├── Implement ticket panel component                                       │
│  ├── Implement activity timeline component                                  │
│  ├── Integrate with orders-report (wallet deduction)                        │
│  └── Testing & bug fixes                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


7.4 Phase 4: Integration & Cleanup (Tuần 5)
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: INTEGRATION & CLEANUP                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ├── Update orders-report: Link SĐT → Customer Hub                          │
│  ├── Update balance-history: Link SĐT → Customer Hub                        │
│  ├── Deprecate issue-tracking (redirect to customer-hub)                    │
│  ├── ✅ DONE: customer-management folder deleted (replaced by customer-hub) │
│  ├── Update navigation menu                                                 │
│  └── Documentation & training                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘



8. ISSUE-TRACKING MIGRATION: Firebase → PostgreSQL (Render.com)

8.1 Firebase Current Structure (Source)
```
Firebase Realtime Database
│
├── issue_tracking/
│   ├── tickets/
│   │   └── {pushId}/                    # Ticket object
│   │       ├── firebaseId              → firebase_id (VARCHAR)
│   │       ├── orderId                 → order_id (VARCHAR)
│   │       ├── trackingCode            → tracking_code (VARCHAR)
│   │       ├── customer                → customer_name (VARCHAR)
│   │       ├── phone                   → phone (VARCHAR) ★ FK to customers
│   │       ├── channel                 → (lưu vào metadata JSONB)
│   │       ├── type                    → type (VARCHAR)
│   │       ├── status                  → status (VARCHAR)
│   │       ├── extendedStatus          → (merge vào status hoặc metadata)
│   │       ├── products: []            → products (JSONB)
│   │       ├── money                   → refund_amount (DECIMAL)
│   │       ├── originalCod             → original_cod (DECIMAL)
│   │       ├── newCod                  → new_cod (DECIMAL)
│   │       ├── codDifference           → (computed: new_cod - original_cod)
│   │       ├── fixReason               → fix_cod_reason (VARCHAR)
│   │       ├── virtualCredit: {}       → Tách ra virtual_credits table
│   │       ├── carrierRecoveryDeadline → carrier_deadline (TIMESTAMP)
│   │       ├── note                    → internal_note (TEXT)
│   │       ├── createdAt               → created_at (TIMESTAMP)
│   │       ├── updatedAt               → updated_at (TIMESTAMP)
│   │       ├── completedAt             → completed_at (TIMESTAMP)
│   │       ├── createdBy               → created_by (VARCHAR)
│   │       └── actionHistory: []       → action_history (JSONB)
│   │
│   └── reconciliation_batches/         # Lịch sử đối soát - KHÔNG migrate
│
├── customer_wallets/                   # Migrate → customer_wallets table
│   └── {normalizedPhone}/
│       ├── phone                       → phone (VARCHAR)
│       ├── customerName                → (lấy từ customers.name)
│       ├── balance                     → balance (DECIMAL)
│       ├── virtualBalance              → virtual_balance (DECIMAL)
│       ├── virtualCredits: []          → Tách ra virtual_credits table
│       └── createdAt/updatedAt         → created_at/updated_at
│
└── wallet_transactions/                # Migrate → wallet_transactions table
    └── {transactionId}/
        ├── phone                       → phone (VARCHAR)
        ├── type                        → type (VARCHAR)
        ├── amount                      → amount (DECIMAL)
        ├── balanceAfter                → balance_after (DECIMAL)
        ├── source                      → source (VARCHAR)
        ├── reference                   → reference_id (VARCHAR)
        ├── note                        → note (TEXT)
        └── createdAt                   → created_at (TIMESTAMP)
```


8.2 Field Mapping: Firebase → PostgreSQL
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     TICKETS: Firebase → customer_tickets                                 │
├──────────────────────────┬──────────────────────────┬───────────────────────────────────┤
│ Firebase Field           │ PostgreSQL Column        │ Transformation                    │
├──────────────────────────┼──────────────────────────┼───────────────────────────────────┤
│ firebaseId               │ firebase_id              │ Direct copy                       │
│ orderId                  │ order_id                 │ Direct copy                       │
│ trackingCode             │ tracking_code            │ Direct copy                       │
│ customer                 │ customer_name            │ Direct copy                       │
│ phone                    │ phone                    │ normalizePhone() → "0xxxyyy"      │
│ channel                  │ metadata.channel         │ Move to JSONB metadata            │
│ type                     │ type                     │ Map: BOOM/FIX_COD/RETURN_*        │
│ status                   │ status                   │ Map (see below)                   │
│ extendedStatus           │ metadata.extendedStatus  │ Preserve for reference            │
│ products[]               │ products                 │ JSONB array (keep structure)      │
│ money                    │ refund_amount            │ Direct copy as DECIMAL            │
│ originalCod              │ original_cod             │ Direct copy                       │
│ newCod                   │ new_cod                  │ Direct copy                       │
│ fixReason                │ fix_cod_reason           │ Direct copy                       │
│ virtualCredit.amount     │ virtual_credit_amount    │ Copy to column                    │
│ virtualCredit.*          │ virtual_credits table    │ Create separate record            │
│ carrierRecoveryDeadline  │ carrier_deadline         │ Unix timestamp → TIMESTAMP        │
│ note                     │ internal_note            │ Direct copy                       │
│ createdAt                │ created_at               │ Unix timestamp → TIMESTAMP        │
│ updatedAt                │ updated_at               │ Unix timestamp → TIMESTAMP        │
│ completedAt              │ completed_at             │ Unix timestamp → TIMESTAMP        │
│ createdBy                │ created_by               │ Direct copy                       │
│ actionHistory[]          │ action_history           │ JSONB array (keep structure)      │
│ (auto-gen)               │ ticket_code              │ Generate: TV-YYYY-NNNNN           │
└──────────────────────────┴──────────────────────────┴───────────────────────────────────┘


8.3 Status Mapping

Firebase Status → PostgreSQL Status:
┌─────────────────────────┬─────────────────────┐
│ Firebase status         │ PostgreSQL status   │
├─────────────────────────┼─────────────────────┤
│ PENDING_GOODS           │ PENDING_GOODS       │
│ PENDING_FINANCE         │ PENDING_FINANCE     │
│ COMPLETED               │ COMPLETED           │
└─────────────────────────┴─────────────────────┘

Firebase extendedStatus (lưu vào metadata.extendedStatus):
- NEW, PENDING_RETURN, RECEIVED_VERIFIED
- ACCOUNTING_DONE, VIRTUAL_CREDIT_ISSUED
- NEW_ORDER_PLACED, PENDING_RECOVERY
- COMPLETED, EXPIRED_NO_ACTION, LOGISTICS_ISSUE


8.4 Migration Script (Node.js)
```javascript
/**
 * Migration Script: Firebase issue-tracking → PostgreSQL (Render.com)
 *
 * Chạy từ local hoặc Render shell:
 * $ node scripts/migrate-issue-tracking.js
 */

const admin = require('firebase-admin');
const { Pool } = require('pg');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
const BATCH_SIZE = 100;  // Insert batch size
const DRY_RUN = false;   // Set true to test without writing to PostgreSQL

// Firebase Admin SDK init
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://your-project.firebaseio.com'
});

// PostgreSQL connection (Render.com)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function normalizePhone(phone) {
    if (!phone) return null;
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('84')) cleaned = '0' + cleaned.slice(2);
    if (cleaned.startsWith('+84')) cleaned = '0' + cleaned.slice(3);
    if (!cleaned.startsWith('0')) cleaned = '0' + cleaned;
    return cleaned.length >= 10 ? cleaned : null;
}

function timestampToDate(ts) {
    if (!ts) return null;
    if (typeof ts === 'number') {
        return new Date(ts > 1e12 ? ts : ts * 1000).toISOString();
    }
    return new Date(ts).toISOString();
}

function mapTicketStatus(status) {
    const mapping = {
        'PENDING_GOODS': 'PENDING_GOODS',
        'PENDING_FINANCE': 'PENDING_FINANCE',
        'COMPLETED': 'COMPLETED',
        // Fallback
        'NEW': 'PENDING',
        'PENDING_RETURN': 'PENDING_GOODS',
        'RECEIVED_VERIFIED': 'PENDING_FINANCE'
    };
    return mapping[status] || 'PENDING';
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1: MIGRATE CUSTOMERS (upsert từ tickets + wallets)
// ═══════════════════════════════════════════════════════════════════════════════

async function migrateCustomers() {
    console.log('\n📦 STEP 1: Migrate Customers...');

    // Collect unique phones from tickets and wallets
    const db = admin.database();
    const ticketsSnap = await db.ref('issue_tracking/tickets').once('value');
    const walletsSnap = await db.ref('customer_wallets').once('value');

    const customerMap = new Map(); // phone → { name, ... }

    // From tickets
    ticketsSnap.forEach(child => {
        const ticket = child.val();
        const phone = normalizePhone(ticket.phone);
        if (phone && !customerMap.has(phone)) {
            customerMap.set(phone, {
                phone,
                name: ticket.customer || 'Unknown',
                firstSeen: ticket.createdAt
            });
        }
    });

    // From wallets (might have more info)
    walletsSnap.forEach(child => {
        const wallet = child.val();
        const phone = normalizePhone(wallet.phone);
        if (phone) {
            const existing = customerMap.get(phone) || {};
            customerMap.set(phone, {
                ...existing,
                phone,
                name: wallet.customerName || existing.name || 'Unknown',
                firstSeen: Math.min(existing.firstSeen || Infinity, wallet.createdAt || Infinity)
            });
        }
    });

    console.log(`   Found ${customerMap.size} unique customers`);

    if (DRY_RUN) {
        console.log('   [DRY RUN] Skipping database insert');
        return;
    }

    // Batch insert with upsert
    const customers = Array.from(customerMap.values());
    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
        const batch = customers.slice(i, i + BATCH_SIZE);

        const values = batch.map((c, idx) => {
            const offset = idx * 3;
            return `($${offset+1}, $${offset+2}, $${offset+3})`;
        }).join(', ');

        const params = batch.flatMap(c => [
            c.phone,
            c.name,
            timestampToDate(c.firstSeen)
        ]);

        await pool.query(`
            INSERT INTO customers (phone, name, created_at)
            VALUES ${values}
            ON CONFLICT (phone) DO UPDATE SET
                name = COALESCE(EXCLUDED.name, customers.name),
                updated_at = NOW()
        `, params);

        console.log(`   Inserted batch ${Math.ceil((i+1)/BATCH_SIZE)}/${Math.ceil(customers.length/BATCH_SIZE)}`);
    }

    console.log(`   ✅ Migrated ${customerMap.size} customers`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: MIGRATE CUSTOMER WALLETS
// ═══════════════════════════════════════════════════════════════════════════════

async function migrateWallets() {
    console.log('\n💰 STEP 2: Migrate Customer Wallets...');

    const db = admin.database();
    const snapshot = await db.ref('customer_wallets').once('value');

    let count = 0;
    const wallets = [];

    snapshot.forEach(child => {
        const wallet = child.val();
        const phone = normalizePhone(wallet.phone);
        if (!phone) return;

        wallets.push({
            phone,
            balance: wallet.balance || 0,
            virtualBalance: wallet.virtualBalance || 0,
            virtualCredits: wallet.virtualCredits || [],
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt
        });
        count++;
    });

    console.log(`   Found ${count} wallets`);

    if (DRY_RUN) {
        console.log('   [DRY RUN] Skipping database insert');
        return;
    }

    for (const wallet of wallets) {
        // Upsert wallet
        const result = await pool.query(`
            INSERT INTO customer_wallets (phone, balance, virtual_balance, created_at, updated_at)
            SELECT $1, $2, $3, $4, $5
            FROM customers WHERE phone = $1
            ON CONFLICT (phone) DO UPDATE SET
                balance = EXCLUDED.balance,
                virtual_balance = EXCLUDED.virtual_balance,
                updated_at = NOW()
            RETURNING id
        `, [
            wallet.phone,
            wallet.balance,
            wallet.virtualBalance,
            timestampToDate(wallet.createdAt),
            timestampToDate(wallet.updatedAt)
        ]);

        if (result.rows.length === 0) continue;
        const walletId = result.rows[0].id;

        // Migrate virtual credits
        for (const vc of wallet.virtualCredits || []) {
            if (vc.status !== 'ACTIVE') continue; // Only migrate active credits

            await pool.query(`
                INSERT INTO virtual_credits
                (phone, wallet_id, original_amount, remaining_amount,
                 issued_at, expires_at, status, source_type, source_id, note)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                wallet.phone,
                walletId,
                vc.amount,
                vc.amount, // remaining = original for active
                timestampToDate(vc.issuedAt),
                timestampToDate(vc.expiresAt),
                vc.status,
                'RETURN_SHIPPER',
                vc.ticketId,
                'Migrated from Firebase'
            ]);
        }
    }

    console.log(`   ✅ Migrated ${count} wallets`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3: MIGRATE TICKETS
// ═══════════════════════════════════════════════════════════════════════════════

async function migrateTickets() {
    console.log('\n📋 STEP 3: Migrate Tickets...');

    const db = admin.database();
    const snapshot = await db.ref('issue_tracking/tickets').once('value');

    let count = 0;
    let skipped = 0;

    const tickets = [];
    snapshot.forEach(child => {
        const firebaseId = child.key;
        const ticket = child.val();
        const phone = normalizePhone(ticket.phone);

        if (!phone) {
            skipped++;
            return;
        }

        tickets.push({
            firebaseId,
            phone,
            customerName: ticket.customer,
            orderId: ticket.orderId,
            trackingCode: ticket.trackingCode,
            type: ticket.type,
            status: mapTicketStatus(ticket.status),
            products: ticket.products || [],
            originalCod: ticket.originalCod,
            newCod: ticket.newCod,
            refundAmount: ticket.money,
            fixCodReason: ticket.fixReason,
            virtualCredit: ticket.virtualCredit,
            carrierDeadline: ticket.carrierRecoveryDeadline,
            internalNote: ticket.note,
            actionHistory: ticket.actionHistory || [],
            metadata: {
                channel: ticket.channel,
                extendedStatus: ticket.extendedStatus,
                hasDefectiveItems: ticket.hasDefectiveItems,
                defectiveItemsNote: ticket.defectiveItemsNote
            },
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
            completedAt: ticket.completedAt,
            createdBy: ticket.createdBy
        });
        count++;
    });

    console.log(`   Found ${count} tickets (skipped ${skipped} invalid)`);

    if (DRY_RUN) {
        console.log('   [DRY RUN] Skipping database insert');
        return;
    }

    for (const ticket of tickets) {
        // Get customer_id
        const customerResult = await pool.query(
            'SELECT id FROM customers WHERE phone = $1',
            [ticket.phone]
        );
        const customerId = customerResult.rows[0]?.id;

        // Insert ticket
        const result = await pool.query(`
            INSERT INTO customer_tickets (
                firebase_id, phone, customer_id, customer_name,
                order_id, tracking_code, type, status,
                products, original_cod, new_cod, refund_amount,
                fix_cod_reason, virtual_credit_amount, carrier_deadline,
                internal_note, action_history,
                created_at, updated_at, completed_at, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING id, ticket_code
        `, [
            ticket.firebaseId,
            ticket.phone,
            customerId,
            ticket.customerName,
            ticket.orderId,
            ticket.trackingCode,
            ticket.type,
            ticket.status,
            JSON.stringify(ticket.products),
            ticket.originalCod,
            ticket.newCod,
            ticket.refundAmount,
            ticket.fixCodReason,
            ticket.virtualCredit?.amount,
            timestampToDate(ticket.carrierDeadline),
            ticket.internalNote,
            JSON.stringify(ticket.actionHistory),
            timestampToDate(ticket.createdAt),
            timestampToDate(ticket.updatedAt),
            timestampToDate(ticket.completedAt),
            ticket.createdBy
        ]);

        // Create virtual credit if applicable
        if (ticket.virtualCredit && ticket.virtualCredit.status === 'ACTIVE') {
            const ticketId = result.rows[0].id;

            // Get wallet_id
            const walletResult = await pool.query(
                'SELECT id FROM customer_wallets WHERE phone = $1',
                [ticket.phone]
            );
            const walletId = walletResult.rows[0]?.id;

            if (walletId) {
                const vcResult = await pool.query(`
                    INSERT INTO virtual_credits
                    (phone, wallet_id, original_amount, remaining_amount,
                     issued_at, expires_at, status, source_type, source_id, note)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'RETURN_SHIPPER', $8, 'From ticket migration')
                    RETURNING id
                `, [
                    ticket.phone,
                    walletId,
                    ticket.virtualCredit.amount,
                    ticket.virtualCredit.amount,
                    timestampToDate(ticket.virtualCredit.issuedAt),
                    timestampToDate(ticket.virtualCredit.expiresAt),
                    ticket.virtualCredit.status,
                    ticket.firebaseId
                ]);

                // Link virtual_credit_id back to ticket
                await pool.query(
                    'UPDATE customer_tickets SET virtual_credit_id = $1 WHERE id = $2',
                    [vcResult.rows[0].id, ticketId]
                );
            }
        }

        // Log activity
        await pool.query(`
            INSERT INTO customer_activities
            (phone, customer_id, activity_type, title, description,
             reference_type, reference_id, icon, color, created_at)
            VALUES ($1, $2, 'TICKET_CREATED', $3, $4, 'ticket', $5, 'clipboard-list', 'blue', $6)
        `, [
            ticket.phone,
            customerId,
            `Sự vụ ${ticket.type} - ${ticket.orderId}`,
            ticket.internalNote || '',
            result.rows[0].ticket_code,
            timestampToDate(ticket.createdAt)
        ]);
    }

    console.log(`   ✅ Migrated ${count} tickets`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4: MIGRATE WALLET TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function migrateWalletTransactions() {
    console.log('\n💳 STEP 4: Migrate Wallet Transactions...');

    const db = admin.database();
    const snapshot = await db.ref('wallet_transactions').once('value');

    let count = 0;

    if (DRY_RUN) {
        snapshot.forEach(() => count++);
        console.log(`   [DRY RUN] Would migrate ${count} transactions`);
        return;
    }

    const transactions = [];
    snapshot.forEach(child => {
        const tx = child.val();
        const phone = normalizePhone(tx.phone);
        if (!phone) return;

        transactions.push({
            phone,
            type: tx.type,
            amount: tx.amount,
            balanceAfter: tx.balanceAfter,
            source: tx.source,
            referenceId: tx.reference,
            note: tx.note,
            createdAt: tx.createdAt,
            createdBy: tx.createdBy
        });
        count++;
    });

    for (const tx of transactions) {
        // Get wallet_id
        const walletResult = await pool.query(
            'SELECT id FROM customer_wallets WHERE phone = $1',
            [tx.phone]
        );
        const walletId = walletResult.rows[0]?.id;

        await pool.query(`
            INSERT INTO wallet_transactions
            (phone, wallet_id, type, amount, balance_after,
             source, reference_id, note, created_at, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            tx.phone,
            walletId,
            tx.type,
            tx.amount,
            tx.balanceAfter,
            tx.source,
            tx.referenceId,
            tx.note,
            timestampToDate(tx.createdAt),
            tx.createdBy
        ]);
    }

    console.log(`   ✅ Migrated ${count} transactions`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  ISSUE-TRACKING MIGRATION: Firebase → PostgreSQL (Render.com)     ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    console.log(`\nMode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '🚀 LIVE MIGRATION'}`);
    console.log(`Batch size: ${BATCH_SIZE}\n`);

    try {
        await migrateCustomers();
        await migrateWallets();
        await migrateTickets();
        await migrateWalletTransactions();

        console.log('\n════════════════════════════════════════════════════════════════════');
        console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
        console.log('════════════════════════════════════════════════════════════════════\n');

        // Verification counts
        const counts = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM customers) as customers,
                (SELECT COUNT(*) FROM customer_wallets) as wallets,
                (SELECT COUNT(*) FROM customer_tickets) as tickets,
                (SELECT COUNT(*) FROM wallet_transactions) as transactions,
                (SELECT COUNT(*) FROM virtual_credits) as virtual_credits
        `);

        console.log('📊 MIGRATION SUMMARY:');
        console.log(`   Customers:     ${counts.rows[0].customers}`);
        console.log(`   Wallets:       ${counts.rows[0].wallets}`);
        console.log(`   Tickets:       ${counts.rows[0].tickets}`);
        console.log(`   Transactions:  ${counts.rows[0].transactions}`);
        console.log(`   V.Credits:     ${counts.rows[0].virtual_credits}`);

    } catch (error) {
        console.error('\n❌ MIGRATION FAILED:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await pool.end();
        admin.app().delete();
    }
}

main();
```


8.5 Migration Checklist
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                          MIGRATION CHECKLIST                                             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  PRE-MIGRATION:                                                                         │
│  □ Backup Firebase data (export JSON)                                                   │
│  □ Create PostgreSQL tables (run schema.sql)                                            │
│  □ Set up Firebase Admin SDK credentials                                                │
│  □ Configure DATABASE_URL environment variable                                          │
│  □ Run migration script với DRY_RUN = true                                              │
│  □ Review dry run output, check for errors                                              │
│                                                                                         │
│  MIGRATION:                                                                             │
│  □ Set DRY_RUN = false                                                                  │
│  □ Run migration script                                                                 │
│  □ Verify counts match Firebase data                                                    │
│  □ Spot check 10 random tickets                                                         │
│  □ Verify wallet balances match                                                         │
│  □ Test virtual credits expiry dates                                                    │
│                                                                                         │
│  POST-MIGRATION:                                                                        │
│  □ Update frontend to use new API endpoints                                             │
│  □ Deploy new API routes to Render                                                      │
│  □ Test create/update/delete operations                                                 │
│  □ Monitor for 24-48 hours                                                              │
│  □ Archive Firebase data (keep for 30 days)                                             │
│  □ Disable Firebase writes (read-only mode)                                             │
│  □ After 30 days: Delete Firebase issue_tracking data                                   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘


8.6 Verification Queries
```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES - Run after migration
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Count comparison
SELECT
    'customers' as table_name, COUNT(*) as count FROM customers
UNION ALL
SELECT 'wallets', COUNT(*) FROM customer_wallets
UNION ALL
SELECT 'tickets', COUNT(*) FROM customer_tickets
UNION ALL
SELECT 'transactions', COUNT(*) FROM wallet_transactions
UNION ALL
SELECT 'virtual_credits', COUNT(*) FROM virtual_credits;

-- 2. Tickets by status
SELECT status, COUNT(*)
FROM customer_tickets
GROUP BY status
ORDER BY COUNT(*) DESC;

-- 3. Tickets by type
SELECT type, COUNT(*)
FROM customer_tickets
GROUP BY type
ORDER BY COUNT(*) DESC;

-- 4. Wallet balance totals
SELECT
    SUM(balance) as total_real_balance,
    SUM(virtual_balance) as total_virtual_balance,
    COUNT(*) as wallet_count
FROM customer_wallets;

-- 5. Active virtual credits
SELECT
    COUNT(*) as active_count,
    SUM(remaining_amount) as total_remaining
FROM virtual_credits
WHERE status = 'ACTIVE' AND expires_at > NOW();

-- 6. Sample ticket with all relations
SELECT
    t.ticket_code,
    t.type,
    t.status,
    t.order_id,
    c.name as customer_name,
    c.phone,
    w.balance,
    w.virtual_balance,
    vc.remaining_amount as virtual_credit_amount,
    vc.expires_at as vc_expires
FROM customer_tickets t
LEFT JOIN customers c ON t.phone = c.phone
LEFT JOIN customer_wallets w ON t.phone = w.phone
LEFT JOIN virtual_credits vc ON t.virtual_credit_id = vc.id
LIMIT 10;

-- 7. Check for orphan records
SELECT 'Tickets without customer' as issue, COUNT(*) as count
FROM customer_tickets t
LEFT JOIN customers c ON t.phone = c.phone
WHERE c.id IS NULL
UNION ALL
SELECT 'Wallets without customer', COUNT(*)
FROM customer_wallets w
LEFT JOIN customers c ON w.phone = c.phone
WHERE c.id IS NULL;
```


8.7 Rollback Plan
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              ROLLBACK PLAN                                               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  NẾU MIGRATION THẤT BẠI:                                                                │
│                                                                                         │
│  1. STOP - Không tiếp tục nếu có lỗi                                                   │
│                                                                                         │
│  2. ROLLBACK PostgreSQL:                                                                │
│     ```sql                                                                              │
│     -- Xóa data đã migrate (KHÔNG xóa schema)                                          │
│     TRUNCATE customer_activities CASCADE;                                               │
│     TRUNCATE wallet_transactions CASCADE;                                               │
│     TRUNCATE virtual_credits CASCADE;                                                   │
│     TRUNCATE customer_tickets CASCADE;                                                  │
│     TRUNCATE customer_wallets CASCADE;                                                  │
│     TRUNCATE customers CASCADE;                                                         │
│     ```                                                                                 │
│                                                                                         │
│  3. RESTORE Firebase:                                                                   │
│     - Firebase data vẫn còn nguyên (không bị xóa trong migration)                      │
│     - Chỉ cần revert frontend code về dùng Firebase APIs                               │
│                                                                                         │
│  4. FIX & RETRY:                                                                        │
│     - Debug migration script                                                            │
│     - Run DRY_RUN again                                                                 │
│     - Re-run migration                                                                  │
│                                                                                         │
│  NẾU CẦN PARTIAL ROLLBACK (chỉ rollback tickets):                                      │
│     ```sql                                                                              │
│     TRUNCATE customer_activities CASCADE;                                               │
│     DELETE FROM virtual_credits WHERE source_type = 'RETURN_SHIPPER';                  │
│     TRUNCATE customer_tickets CASCADE;                                                  │
│     ```                                                                                 │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘


8.8 Post-Migration: Update Frontend
```javascript
// ═══════════════════════════════════════════════════════════════════════════════
// BEFORE: Firebase API (issue-tracking/api-service.js)
// ═══════════════════════════════════════════════════════════════════════════════
// const db = firebase.database();
// const ticketsRef = db.ref('issue_tracking/tickets');
//
// async function getTickets() {
//     const snapshot = await ticketsRef.once('value');
//     return snapshot.val();
// }
//
// async function createTicket(data) {
//     const newRef = ticketsRef.push();
//     await newRef.set({ ...data, firebaseId: newRef.key });
//     return newRef.key;
// }

// ═══════════════════════════════════════════════════════════════════════════════
// AFTER: PostgreSQL API (customer-hub/js/ticket-service.js)
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE = 'https://your-render-app.onrender.com/api';

// GET all tickets (with filters)
async function getTickets(filters = {}) {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${API_BASE}/ticket?${params}`);
    return response.json();
}

// GET single ticket
async function getTicket(ticketCode) {
    const response = await fetch(`${API_BASE}/ticket/${ticketCode}`);
    return response.json();
}

// CREATE new ticket
async function createTicket(data) {
    const response = await fetch(`${API_BASE}/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

// UPDATE ticket
async function updateTicket(ticketCode, data) {
    const response = await fetch(`${API_BASE}/ticket/${ticketCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

// PERFORM action (receive_goods, settle, complete)
async function ticketAction(ticketCode, action, note) {
    const response = await fetch(`${API_BASE}/ticket/${ticketCode}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note })
    });
    return response.json();
}

export { getTickets, getTicket, createTicket, updateTicket, ticketAction };
```


---

9. TÓM TẮT GIẢI PHÁP
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              TÓM TẮT GIẢI PHÁP                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ❓ VẤN ĐỀ                          │  ✅ GIẢI PHÁP                                     │
│  ─────────────────────────────────────────────────────────────────────────────────────  │
│  Dữ liệu khách hàng phân tán        │  PostgreSQL làm SSOT, SĐT là khóa chính          │
│  Không có Customer 360° view        │  Module customer-hub/ với full 360° view          │
│  Công nợ ảo chưa có                 │  Table virtual_credits với expiry & FIFO          │
│  Trừ ví khi tạo PBH chưa có         │  API useWalletBalance() + UI integration          │
│  Sự vụ nằm riêng Firebase           │  Migrate → customer_tickets trong PostgreSQL      │
│  Không có timeline hoạt động        │  Table customer_activities + unified view         │
│  Thiếu phân loại khách              │  RFM Scoring + Tags + Tiers                       │
│                                                                                         │
│  ═══════════════════════════════════════════════════════════════════════════════════   │
│                                                                                         │
│  🏗️ KIẾN TRÚC CHÍNH:                                                                   │
│  ├── Storage: PostgreSQL (Render.com) - Single Source of Truth                         │
│  ├── Realtime: Firebase (chỉ cho notifications, không lưu data)                        │
│  ├── External: TPOS API (read-only, orders & products)                                 │
│  └── Gateway: Cloudflare Worker (proxy & auth)                                         │
│                                                                                         │
│  📊 DATABASE TABLES:                                                                    │
│  ├── customers (master)                                                                │
│  ├── customer_wallets (1-1 với customers)                                              │
│  ├── wallet_transactions (log)                                                         │
│  ├── virtual_credits (công nợ ảo)                                                      │
│  ├── customer_tickets (sự vụ)                                                          │
│  ├── customer_activities (timeline)                                                    │
│  └── customer_notes (ghi chú)                                                          │
│                                                                                         │
│  🔑 KEY FEATURES:                                                                       │
│  ├── Customer 360° View - Xem tất cả về 1 khách hàng                                   │
│  ├── Unified Wallet - Số dư thực + Công nợ ảo                                          │
│  ├── Smart Withdraw - FIFO virtual credits                                             │
│  ├── Activity Timeline - Lịch sử tương tác                                             │
│  ├── RFM Scoring - Phân loại khách hàng                                                │
│  └── Extensible - Sẵn sàng cho Loyalty, Upsell, Analytics                              │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘

