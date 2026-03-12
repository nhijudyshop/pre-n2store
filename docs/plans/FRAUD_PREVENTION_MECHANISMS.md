# CƠ CHẾ FRAUD PREVENTION (CHỐNG GIAN LẬN)

> **Version:** 1.0
> **Updated:** 2026-01-21
> **Modules:** Issue Tracking, Customer 360, Sepay Webhook

---

## PHẦN 1: NGỮ NGHĨA NGHIỆP VỤ (BUSINESS SEMANTICS - NO CODE)

### 1.1 Fraud là gì trong hệ thống này?

**Fraud (gian lận)** trong hệ thống N2Store bao gồm các hành vi:

| Loại Fraud | Mô tả | Ví dụ |
|------------|-------|-------|
| **Bom hàng** | Khách đặt hàng rồi không nhận | Đặt 10 đơn, trả lại 8 đơn |
| **Trùng lặp công nợ ảo** | Lấy công nợ ảo nhiều lần cho cùng 1 đơn thu về | Bấm "+ Công Nợ Ảo" 5 lần cho 1 ticket |
| **Chuyển khoản 1 lần, cộng ví nhiều lần** | Dùng 1 giao dịch ngân hàng để cộng tiền vào nhiều ví | Chuyển 500k, đổi SĐT liên tục để cộng vào nhiều ví |
| **Rút tiền quá số dư** | Sử dụng công nợ ảo/tiền ví vượt quá số có | Ví có 100k, dùng 200k |

### 1.2 Tại sao cần Fraud Prevention?

1. **Bảo vệ tài chính doanh nghiệp**: Không cho khách lấy tiền/công nợ không chính đáng
2. **Giảm thiểu rủi ro vận hành**: Tự động phát hiện khách có hành vi xấu
3. **Tối ưu nguồn lực CSKH**: Tập trung vào khách hàng tốt, giảm thời gian xử lý khiếu nại
4. **Dữ liệu sạch**: Đảm bảo báo cáo tài chính chính xác

### 1.3 Các ngưỡng quan trọng

| Chỉ số | Ngưỡng | Hậu quả |
|--------|--------|---------|
| Tỷ lệ trả hàng > 20% | Cảnh báo | Gắn nhãn "Bom hàng" |
| Tỷ lệ trả hàng > 30% | Nguy hiểm | Gắn nhãn "Cảnh báo", tier = 'danger' |
| Tỷ lệ trả hàng > 50% | Blacklist | Gắn nhãn "Nguy hiểm", tier = 'blacklist' |

---

## PHẦN 2: NGHIỆP VỤ DOANH NGHIỆP (BUSINESS LOGIC)

### 2.1 Hệ thống Tier khách hàng

```
              Khách mới
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
  ĐƯỜNG TỐT    ĐƯỜNG XẤU    ĐƯỜNG NGUY HIỂM
    │             │             │
    ▼             ▼             ▼
  silver       danger       blacklist
    │         (30-50%)       (>50%)
    ▼
   gold
    │
    ▼
 platinum
```

**Quy tắc chuyển tier:**

| Từ Tier | Điều kiện | Đến Tier |
|---------|-----------|----------|
| new/silver/gold | return_rate > 50% | blacklist |
| new/silver/gold | return_rate > 30% | danger |
| silver | 5 đơn thành công | gold |
| gold | 15 đơn thành công | platinum |

### 2.2 Quy trình xử lý Ticket RETURN_SHIPPER

```
┌────────────────────────────────────────────────────────────────────────────┐
│  FLOW: RETURN_SHIPPER VỚI FRAUD PREVENTION                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Bước 1: CSKH tạo Ticket Thu Về                                           │
│          ├─ Nhập: orderId, phone, money                                   │
│          └─ Trạng thái: PENDING_GOODS                                     │
│                                                                            │
│  Bước 2: CSKH bấm "+ Công Nợ Ảo"                                          │
│          │                                                                 │
│          ├─► KIỂM TRA FRAUD #1: Ticket đã được cấp công nợ chưa?          │
│          │   └─ Nếu đã cấp → CHẶN, báo lỗi "DUPLICATE_VIRTUAL_CREDIT"     │
│          │                                                                 │
│          ├─► KIỂM TRA FRAUD #2: Khách có bị blacklist không?              │
│          │   └─ Nếu blacklist → CHẶN, không cho cấp công nợ               │
│          │                                                                 │
│          └─► Nếu pass → Tạo virtual_credit (15 ngày)                      │
│                                                                            │
│  Bước 3: Kho bấm "Nhận hàng"                                              │
│          ├─ Tạo phiếu trả hàng TPOS                                       │
│          ├─ Cập nhật customer stats (return_count + 1)                    │
│          └─ Trạng thái: COMPLETED                                         │
│                                                                            │
│  Sau Bước 3: TRIGGER TỰ ĐỘNG CHẠY                                         │
│          └─ Tính lại return_rate                                          │
│          └─ Nếu return_rate > ngưỡng → Cập nhật tier/status               │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Quy trình xử lý Chuyển khoản (Sepay)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  FLOW: SEPAY WEBHOOK VỚI FRAUD PREVENTION                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Bước 1: Nhận webhook từ Sepay                                            │
│          ├─ Trích xuất SĐT từ nội dung chuyển khoản                       │
│          └─ KIỂM TRA FRAUD #1: Lọc số tài khoản ngân hàng                 │
│              (Blacklist: 19034704xxx, 0451000xxx, ...)                    │
│                                                                            │
│  Bước 2: Tìm khách hàng theo SĐT                                          │
│          ├─ Nếu tìm thấy 1 SĐT duy nhất → AUTO_APPROVED                   │
│          ├─ Nếu tìm thấy nhiều SĐT → PENDING_VERIFICATION (cần xác nhận)  │
│          └─ Nếu không tìm thấy → PENDING (chờ nhập thủ công)              │
│                                                                            │
│  Bước 3: CSKH xác nhận/sửa SĐT                                            │
│          │                                                                 │
│          └─► KIỂM TRA FRAUD #2: Giao dịch đã cộng ví chưa?                │
│              └─ Nếu wallet_processed = true → CHẶN đổi SĐT                │
│                 "Không thể đổi SĐT - Giao dịch đã được cộng vào ví"       │
│                                                                            │
│  Bước 4: Cộng tiền vào ví                                                 │
│          │                                                                 │
│          └─► KIỂM TRA FRAUD #3: Đã cộng ví lần nào chưa?                  │
│              └─ Dựa vào wallet_processed flag                             │
│              └─ Nếu đã cộng → CHẶN, không cộng lại                        │
│                                                                            │
│  Bước 5: Cập nhật trạng thái                                              │
│          └─ Set wallet_processed = true                                   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Quy trình xóa Ticket

```
┌────────────────────────────────────────────────────────────────────────────┐
│  FLOW: XÓA TICKET VỚI FRAUD PREVENTION                                     │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Bước 1: User bấm xóa ticket                                              │
│          │                                                                 │
│          └─► KIỂM TRA: Ticket có công nợ ảo không?                        │
│                                                                            │
│  Bước 2a: KHÔNG có công nợ ảo                                             │
│          └─ Cho xóa bình thường                                           │
│                                                                            │
│  Bước 2b: CÓ công nợ ảo                                                   │
│          │                                                                 │
│          └─► KIỂM TRA FRAUD: Công nợ đã sử dụng chưa?                     │
│              │                                                             │
│              ├─ remaining_amount < original_amount → ĐÃ DÙNG → CHẶN XÓA  │
│              │   "Không thể xóa - Công nợ ảo đã được sử dụng"             │
│              │                                                             │
│              ├─ used_in_orders.length > 0 → ĐÃ DÙNG → CHẶN XÓA           │
│              │                                                             │
│              └─ remaining = original, used_in_orders = [] → CHƯA DÙNG     │
│                  └─ Cho xóa + Hủy công nợ ảo (status = 'CANCELLED')       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Sử dụng công nợ ảo khi đặt hàng

```
┌────────────────────────────────────────────────────────────────────────────┐
│  FLOW: SỬ DỤNG CÔNG NỢ ẢO (FIFO - First In First Out)                      │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Khi khách đặt hàng muốn dùng công nợ ảo:                                 │
│                                                                            │
│  Bước 1: Lấy danh sách công nợ ảo còn hiệu lực                            │
│          └─ ORDER BY expires_at ASC (ưu tiên sắp hết hạn)                 │
│                                                                            │
│  Bước 2: Trừ tiền theo thứ tự FIFO                                        │
│          │                                                                 │
│          │  Ví dụ: Cần dùng 200k                                          │
│          │  ┌──────────────────────────────────────────────┐              │
│          │  │ Credit #1: 150k (hết hạn 20/01) → Dùng 150k │              │
│          │  │ Credit #2: 100k (hết hạn 25/01) → Dùng 50k  │              │
│          │  └──────────────────────────────────────────────┘              │
│          │                                                                 │
│          └─► FRAUD PREVENTION: Cập nhật used_in_orders                    │
│              [{orderId: 'ORD123', amount: 150000, usedAt: '...'}]         │
│                                                                            │
│  Bước 3: Nếu remaining_amount = 0                                         │
│          └─ Set status = 'USED'                                           │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## PHẦN 3: KỸ THUẬT (TECHNICAL IMPLEMENTATION)

### 3.1 Danh sách các điểm kiểm tra Fraud

| # | Điểm kiểm tra | File | Function/Endpoint |
|---|---------------|------|-------------------|
| 1 | Duplicate Virtual Credit | `routes/v2/tickets.js` | `POST /:id/resolve-credit` |
| 2 | Wallet Processed Flag | `routes/sepay-webhook.js` | `updatePhoneNumber()` |
| 3 | Phone Extraction Blacklist | `routes/sepay-webhook.js` | `extractPhoneFromContent()` |
| 4 | Return Rate > 50% (Cron) | `cron/scheduler.js` | Cron job 2AM daily |
| 5 | Return Rate Trigger | `migrations/002_*.sql` | `update_customer_stats()` |
| 6 | Virtual Credit Usage Check | `routes/v2/tickets.js` | `GET /:id/can-delete` |

### 3.2 Code chi tiết từng điểm

#### 3.2.1 Duplicate Virtual Credit Prevention

**File:** `render.com/routes/v2/tickets.js` (lines 716-738)

```javascript
// FRAUD PREVENTION: Check if virtual credit already issued for this ticket
const ticketRef = ticket_code || id;
const existingCredit = await db.query(`
    SELECT id, original_amount, created_at
    FROM virtual_credits
    WHERE source_id = $1 AND source_type = 'RETURN_SHIPPER' AND status = 'ACTIVE'
    LIMIT 1
`, [ticketRef]);

if (existingCredit.rows.length > 0) {
    const existing = existingCredit.rows[0];
    console.log('[FRAUD PREVENTION] Blocked duplicate virtual credit:', {
        ticketRef,
        existingCreditId: existing.id,
        existingAmount: existing.original_amount
    });
    return res.status(400).json({
        success: false,
        error: 'DUPLICATE_VIRTUAL_CREDIT',
        message: `Ticket ${ticketRef} đã được cấp công nợ ảo (${formatMoney(existing.original_amount)}đ) vào ${formatDate(existing.created_at)}`,
        existingCredit: existing
    });
}
```

**Logic:**
- Trước khi cấp công nợ ảo, kiểm tra xem `source_id` (ticket_code) đã tồn tại trong bảng `virtual_credits` chưa
- Điều kiện: `source_type = 'RETURN_SHIPPER'` AND `status = 'ACTIVE'`
- Nếu đã tồn tại → Return 400 với error code `DUPLICATE_VIRTUAL_CREDIT`

#### 3.2.2 Wallet Processed Flag

**File:** `render.com/routes/sepay-webhook.js` (lines 3397-3411)

```javascript
// SECURITY: Block phone change if transaction already credited to wallet
// This prevents fraud where one transaction is used to credit multiple wallets
if (currentTx.wallet_processed === true) {
    console.log(`[SECURITY] Blocked phone change for tx ${id} - already credited to wallet`);
    return res.status(400).json({
        success: false,
        error: 'Không thể đổi SĐT - Giao dịch đã được cộng vào ví khách hàng'
    });
}
```

**Logic:**
- Khi giao dịch đã được cộng vào ví (`wallet_processed = true`)
- Không cho phép đổi SĐT của giao dịch đó nữa
- Ngăn chặn việc dùng 1 giao dịch để cộng tiền vào nhiều ví khác nhau

#### 3.2.3 Phone Extraction Blacklist

**File:** `render.com/routes/sepay-webhook.js` (lines 847-877)

```javascript
// Blacklist of numbers that should never be extracted as phone numbers
// These are typically bank account numbers that appear in transaction content
const PHONE_EXTRACTION_BLACKLIST = [
    '19034704969696',  // VPBank account number
    '0451000507686',   // Another bank account
    // ... more bank accounts
];

// Filter out blacklisted numbers
const phoneLikeNumbers = allNumbers.filter(num => {
    const isBlacklisted = PHONE_EXTRACTION_BLACKLIST.includes(num);
    if (isBlacklisted) {
        console.log('[EXTRACT] ⏭️ Skipping blacklisted number:', num);
    }
    return isValidLength && !isBlacklisted;
});
```

**Logic:**
- Danh sách các số tài khoản ngân hàng thường xuất hiện trong nội dung chuyển khoản
- Khi trích xuất SĐT, loại bỏ các số này khỏi danh sách ứng viên
- Tránh nhầm số tài khoản ngân hàng thành SĐT khách hàng

#### 3.2.4 Return Rate Fraud Detection (Cron)

**File:** `render.com/cron/scheduler.js` (lines 140-159)

```javascript
// Run at 2:00 AM every day
cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Running fraud detection (return rate)...');

    const result = await db.query(`
        UPDATE customers
        SET tier = 'blacklist',
            status = 'Nguy hiểm',
            updated_at = CURRENT_TIMESTAMP
        WHERE return_rate > 50
          AND tier != 'blacklist'
        RETURNING id, phone, return_rate;
    `);

    if (result.rows.length > 0) {
        console.log(`[CRON] Blacklisted ${result.rows.length} customers:`);
        result.rows.forEach(c => {
            console.log(`  - ${c.phone}: return_rate = ${c.return_rate}%`);
        });
    }
});
```

**Logic:**
- Chạy lúc 2 giờ sáng mỗi ngày
- Tìm tất cả khách có `return_rate > 50%` và chưa bị blacklist
- Tự động chuyển tier thành `blacklist`, status thành `Nguy hiểm`

#### 3.2.5 Can Delete Check

**File:** `render.com/routes/v2/tickets.js` (endpoint GET /:id/can-delete)

```javascript
router.get('/:id/can-delete', async (req, res) => {
    const { id } = req.params;

    // Get ticket
    const ticket = await db.query(`
        SELECT * FROM customer_tickets
        WHERE id = $1 OR ticket_code = $1
    `, [id]);

    if (ticket.rows.length === 0) {
        return res.json({ canDelete: false, reason: 'Ticket không tồn tại' });
    }

    const t = ticket.rows[0];

    // Check for linked virtual credit
    const credit = await db.query(`
        SELECT id, original_amount, remaining_amount, used_in_orders
        FROM virtual_credits
        WHERE source_id = $1 AND source_type = 'RETURN_SHIPPER' AND status = 'ACTIVE'
    `, [t.ticket_code]);

    if (credit.rows.length === 0) {
        return res.json({ canDelete: true });
    }

    const vc = credit.rows[0];
    const usedOrders = vc.used_in_orders || [];

    // If used (remaining < original OR has orders) → can't delete
    if (usedOrders.length > 0 || parseFloat(vc.remaining_amount) < parseFloat(vc.original_amount)) {
        return res.json({
            canDelete: false,
            reason: `Công nợ ảo đã được sử dụng (còn lại: ${vc.remaining_amount}đ)`
        });
    }

    return res.json({ canDelete: true, virtualCreditId: vc.id });
});
```

**Logic:**
- Kiểm tra ticket có công nợ ảo liên kết không
- Nếu có, kiểm tra công nợ đã được sử dụng chưa:
  - `remaining_amount < original_amount` → Đã dùng một phần
  - `used_in_orders.length > 0` → Đã dùng trong đơn hàng
- Nếu đã dùng → Không cho xóa ticket

---

## PHẦN 4: DATABASE LAYER

### 4.1 Các bảng liên quan

#### 4.1.1 Bảng `virtual_credits`

```sql
CREATE TABLE virtual_credits (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    wallet_id INTEGER REFERENCES customer_wallets(id),

    -- Tracking số tiền
    original_amount DECIMAL(15,2) NOT NULL,
    remaining_amount DECIMAL(15,2) NOT NULL,

    -- Thời hạn
    expires_at TIMESTAMP NOT NULL,

    -- Trạng thái
    status VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE, USED, EXPIRED, CANCELLED

    -- Nguồn gốc (QUAN TRỌNG cho fraud prevention)
    source_type VARCHAR(50) NOT NULL,     -- 'RETURN_SHIPPER', 'COMPENSATION', 'PROMOTION'
    source_id VARCHAR(100) NOT NULL,      -- ticket_code hoặc order_id

    -- Tracking sử dụng
    used_in_orders JSONB DEFAULT '[]',    -- [{orderId, amount, usedAt}]

    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index cho fraud prevention query
CREATE INDEX idx_virtual_credits_source ON virtual_credits(source_id, source_type);
CREATE INDEX idx_virtual_credits_status ON virtual_credits(status);
```

**Các cột quan trọng cho Fraud Prevention:**

| Cột | Vai trò |
|-----|---------|
| `source_id` | Định danh ticket → Kiểm tra duplicate |
| `source_type` | Phân loại nguồn → Filter chính xác |
| `remaining_amount` | So sánh với original → Biết đã dùng chưa |
| `used_in_orders` | Lịch sử sử dụng chi tiết |
| `status` | Trạng thái hiện tại |

#### 4.1.2 Bảng `customers`

```sql
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255),

    -- Tier system (fraud prevention)
    tier VARCHAR(50) DEFAULT 'new',       -- new, silver, gold, platinum, danger, blacklist
    status VARCHAR(100) DEFAULT 'Bình thường',

    -- Stats for fraud detection
    return_rate DECIMAL(5,2) DEFAULT 0,   -- Tỷ lệ trả hàng (%)
    return_count INTEGER DEFAULT 0,        -- Số đơn trả
    success_count INTEGER DEFAULT 0,       -- Số đơn thành công
    total_orders INTEGER DEFAULT 0,        -- Tổng số đơn

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index cho fraud detection query
CREATE INDEX idx_customers_tier ON customers(tier);
CREATE INDEX idx_customers_return_rate ON customers(return_rate);
```

#### 4.1.3 Bảng `bank_transactions`

```sql
CREATE TABLE bank_transactions (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(100) UNIQUE,

    amount DECIMAL(15,2),
    content TEXT,
    extracted_phone VARCHAR(20),

    -- Fraud prevention flag
    wallet_processed BOOLEAN DEFAULT FALSE,  -- TRUE = đã cộng ví, không cho đổi SĐT

    status VARCHAR(50),  -- PENDING, AUTO_APPROVED, PENDING_VERIFICATION, COMPLETED

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index
CREATE INDEX idx_bank_tx_wallet_processed ON bank_transactions(wallet_processed);
```

### 4.2 Database Triggers

#### 4.2.1 Trigger cập nhật Customer Stats

**File:** `render.com/migrations/002_create_customer_360_triggers.sql` (lines 138-165)

```sql
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Khi ticket RETURN_SHIPPER hoàn thành → Cập nhật return stats
    IF NEW.type = 'RETURN_SHIPPER' AND NEW.status = 'COMPLETED' THEN

        -- Tăng return_count
        UPDATE customers
        SET
            return_count = return_count + 1,
            return_rate = ROUND(
                (return_count + 1)::DECIMAL / NULLIF(total_orders, 0) * 100,
                2
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE phone = NEW.phone;

        -- FRAUD DETECTION: Auto-update tier based on return rate
        UPDATE customers
        SET
            status = CASE
                WHEN return_rate > 50 THEN 'Nguy hiểm'
                WHEN return_rate > 30 THEN 'Cảnh báo'
                WHEN return_rate > 20 THEN 'Bom hàng'
                ELSE status
            END,
            tier = CASE
                WHEN return_rate > 50 THEN 'blacklist'
                WHEN return_rate > 30 THEN 'danger'
                ELSE tier
            END
        WHERE phone = NEW.phone AND return_rate > 20;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
CREATE TRIGGER trg_update_customer_stats
    AFTER UPDATE ON customer_tickets
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION update_customer_stats();
```

**Logic:**
1. Khi ticket RETURN_SHIPPER được đánh dấu COMPLETED
2. Tăng `return_count` của khách
3. Tính lại `return_rate = return_count / total_orders * 100`
4. Nếu `return_rate > ngưỡng` → Tự động cập nhật `tier` và `status`

### 4.3 Database Indexes cho Performance

```sql
-- Fraud prevention queries need these indexes
CREATE INDEX idx_virtual_credits_fraud_check
    ON virtual_credits(source_id, source_type, status);

CREATE INDEX idx_customers_fraud_detection
    ON customers(return_rate, tier)
    WHERE return_rate > 20;

CREATE INDEX idx_bank_tx_fraud_check
    ON bank_transactions(wallet_processed, status);
```

---

## PHẦN 5: API ENDPOINTS

### 5.1 Endpoints liên quan đến Fraud Prevention

| Method | Endpoint | Mô tả | Fraud Check |
|--------|----------|-------|-------------|
| POST | `/api/v2/tickets/:id/resolve-credit` | Cấp công nợ ảo | Duplicate check |
| GET | `/api/v2/tickets/:id/can-delete` | Kiểm tra có thể xóa | Usage check |
| DELETE | `/api/v2/tickets/:id` | Xóa ticket | Cancel credit if unused |
| PUT | `/api/sepay/transactions/:id/phone` | Đổi SĐT giao dịch | Wallet processed check |
| POST | `/api/v2/wallets/:phone/credit` | Cộng tiền ví | Idempotency check |

### 5.2 Error Codes

| Error Code | Meaning | HTTP Status |
|------------|---------|-------------|
| `DUPLICATE_VIRTUAL_CREDIT` | Ticket đã được cấp công nợ | 400 |
| `VIRTUAL_CREDIT_USED` | Không thể xóa - công nợ đã dùng | 400 |
| `WALLET_ALREADY_PROCESSED` | Giao dịch đã cộng ví | 400 |
| `CUSTOMER_BLACKLISTED` | Khách bị blacklist | 403 |

---

## PHẦN 6: MONITORING & ALERTS

### 6.1 Logs cần theo dõi

```javascript
// Pattern logs để grep
'[FRAUD PREVENTION]'  // Khi chặn duplicate credit
'[SECURITY]'          // Khi chặn đổi SĐT sau cộng ví
'[CRON] Blacklisted'  // Khi cron job blacklist khách
'[EXTRACT] ⏭️ Skipping blacklisted number'  // Khi lọc số tài khoản
```

### 6.2 Metrics cần dashboard

| Metric | Query | Alert Threshold |
|--------|-------|-----------------|
| Số lần chặn duplicate credit | Count error `DUPLICATE_VIRTUAL_CREDIT` | > 10/ngày |
| Số khách bị blacklist/ngày | Count tier changes to 'blacklist' | > 5/ngày |
| Số giao dịch bị chặn đổi SĐT | Count wallet_processed blocks | > 3/ngày |

---

## TÓM TẮT

### Các lớp bảo vệ Fraud Prevention:

1. **Lớp ứng dụng (Application Layer)**
   - Kiểm tra duplicate trước khi cấp công nợ
   - Kiểm tra wallet_processed trước khi đổi SĐT
   - Kiểm tra usage trước khi xóa ticket
![alt text](image.png)2. **Lớp database (Database Layer)**
   - Trigger tự động cập nhật tier khi return_rate tăng
   - Constraint và index đảm bảo data integrity

3. **Lớp scheduled jobs (Cron Layer)**
   - Job 2AM hàng ngày quét và blacklist khách có return_rate > 50%

4. **Lớp business rules**
   - Ngưỡng return_rate: 20% → 30% → 50%
   - FIFO cho việc sử dụng công nợ ảo
   - Không cho đổi SĐT sau khi đã cộng ví

---

*Document generated: 2026-01-21*
*Modules covered: Issue Tracking, Customer 360, Sepay Webhook*
