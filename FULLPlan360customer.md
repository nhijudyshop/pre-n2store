# IMPLEMENTATION PLAN: Customer 360 Complete System

> **Cập nhật:** 2026-01-10
> **Mục tiêu:** Hoàn thiện toàn bộ hệ thống Customer 360 với đầy đủ tính năng
> **Ưu tiên:** Quality - Code maintainable lâu dài

---

# EXECUTIVE SUMMARY: TÌNH TRẠNG HIỆN TẠI

## ✅ PHẦN ĐÃ HOÀN THÀNH (75%)

### Database Layer (100% ✅)
- **PostgreSQL Schema:** Hoàn chỉnh với customers, customer_wallets, wallet_transactions, virtual_credits, customer_tickets, customer_activities, customer_notes
- **Triggers & Functions:**
  - ✅ Auto-create wallet khi tạo customer
  - ✅ Auto-generate ticket_code (TV-YYYY-NNNNN)
  - ✅ Auto-update customer stats khi ticket complete
  - ✅ RFM scoring function
  - ✅ FIFO wallet withdrawal function
  - ✅ **expire_virtual_credits() function** (PostgreSQL)
- **Views:** customer_360_summary, ticket_statistics, wallet_statistics
- **File:** `render.com/migrations/001_create_customer_360_schema.sql`, `002_create_customer_360_triggers.sql`

### Backend APIs (70% ✅)
- ✅ Customer CRUD: `POST /api/customers`, `GET /api/customers/:phone`, `PUT /api/customers/:id`
- ✅ Customer 360 View: `GET /api/customer/:phone` (full 360° with wallet, tickets, activities)
- ✅ Wallet APIs: `GET /api/wallet/:phone`, deposit, withdraw, issueVirtualCredit
- ✅ Ticket APIs: `POST /api/ticket`, `PUT /api/ticket/:code`, `POST /api/ticket/:code/action`
- ✅ SSE Real-time: `/api/events` (wallet changes, ticket updates)
- ❌ **Auto-create customer trong ticket API** (THIẾU)
- ❌ **Balance history link customer API** (THIẾU HOÀN TOÀN)

### Frontend (30% ✅)
- ✅ issue-tracking: Script.js, API Service (đã migrate PostgreSQL)
- ✅ balance-history: Main.js (monolithic, cần refactor)
- ❌ customer-hub: CHƯA CÓ (cần tạo mới standalone page)

## ❌ PHẦN THIẾU QUAN TRỌNG (25%)

### 1. Cron Jobs Backend (0% - CRITICAL)
- ❌ Node.js scheduler chạy `expire_virtual_credits()` theo giờ
- ❌ Carrier deadline checker
- ❌ Fraud detection job

### 2. Auto-Create Customer từ 3 Nguồn (33% - 1/3)
- ✅ Nguồn 1: Customer 360 UI (`POST /api/customers`)
- ❌ Nguồn 2: Issue-Tracking Ticket (thiếu `getOrCreateCustomer()`)
- ❌ Nguồn 3: Balance History Link (thiếu API hoàn toàn)

### 3. Frontend Customer Hub (0%)
- ❌ customer-hub/ standalone page
- ❌ Customer search & profile module
- ❌ Wallet management panel
- ❌ Transaction history unified view
- ❌ Ticket list integration

---

# PHÂN TÍCH CHI TIẾT CÁC VẤN ĐỀ

## PHẦN 1: CRON JOBS - GIẢI THÍCH CHI TIẾT

### Cron Jobs Là Gì?

**Cron Jobs** = Các tác vụ tự động chạy theo lịch định kỳ trên server (backend), KHÔNG phụ thuộc vào user mở trình duyệt.

### Mục Đích Trong Customer 360

Theo plan và PostgreSQL triggers đã implement, có **2 cron jobs chính**:

#### 1. **Virtual Credit Expiry Job** (ĐÃ CÓ FUNCTION PostgreSQL)
**Chức năng:** Thu hồi công nợ ảo đã hết hạn (15 ngày)

**Flow:**
```
Mỗi giờ chạy 1 lần:
1. Tìm virtual_credits có status='ACTIVE' và expires_at <= now
2. Update status = 'EXPIRED'
3. Trừ wallet.virtual_balance
4. Ghi wallet_transaction loại 'VIRTUAL_EXPIRE'
5. (Tùy chọn) Update ticket extendedStatus = 'EXPIRED_NO_ACTION'
```

**PostgreSQL Function:** `expire_virtual_credits()` - **ĐÃ TỒN TẠI** tại:
- File: `render.com/migrations/002_create_customer_360_triggers.sql:411-462`
- Function hoàn chỉnh với atomic transactions

**Backend Scheduler:** ❌ **THIẾU** - Chưa có code Node.js gọi function này theo lịch

#### 2. **Carrier Deadline Checker Job** (CHƯA CÓ)
**Chức năng:** Cảnh báo các ticket sắp quá deadline của hãng vận chuyển

**Flow:**
```
Mỗi 1 giờ:
1. Tìm tickets có carrier_deadline < now + 24h
2. Gửi thông báo warning cho nhân viên
3. Tự động tăng priority = 'high'
```

**Status:** ⚠️ **CHƯA IMPLEMENT** - Không có function PostgreSQL cũng không có backend code

#### 3. **Fraud Detection Rules** (CHƯA CÓ)
**Chức năng:** Tự động phát hiện khách hàng gian lận

**Flow:**
```
Mỗi ngày:
1. Tìm customers có return_rate > 50% trong 7 ngày
2. Tự động đánh dấu tier = 'blacklist'
3. Khóa khả năng tạo đơn mới
```

**Status:** ⚠️ **CHƯA IMPLEMENT**

### Kết Luận Cron Jobs
- **PostgreSQL Function đã có:** `expire_virtual_credits()` ✅
- **Backend Scheduler chưa có:** Cần Node.js code chạy theo lịch ❌
- **Các job khác:** Chưa có ❌

---

## PHẦN 2: 3 NGUỒN TẠO CUSTOMER - PHÂN TÍCH CHI TIẾT

### ✅ NGUỒN 1: Tạo Trực Tiếp Tại Customer 360

**API:** `POST /api/customers` (đã có)
**File:** `render.com/routes/customers.js:500-554`

**Flow:**
```javascript
1. User nhập thông tin: phone, name, email, address...
2. Validate dữ liệu
3. INSERT INTO customers
4. PostgreSQL trigger tự động tạo wallet (002_create_customer_360_triggers.sql:14-33)
```

**Status:** ✅ **ĐÃ HOÀN THÀNH**

**Auto-create wallet:** ✅ **ĐÃ CÓ TRIGGER**
```sql
CREATE TRIGGER trg_create_wallet
AFTER INSERT ON customers
FOR EACH ROW
EXECUTE FUNCTION create_wallet_for_customer();
```

---

### ❌ NGUỒN 2: Tự Động Tạo Khi Thêm Ticket (THIẾU)

**API hiện tại:** `POST /api/ticket`
**File:** `render.com/routes/customer-360.js:957-1003`

**Code hiện tại (THIẾU LOGIC):**
```javascript
// Line 971-973
const customerResult = await db.query('SELECT id FROM customers WHERE phone = $1', [normalizedPhone]);
const customerId = customerResult.rows[0]?.id;  // ⚠️ Có thể null nếu customer chưa tồn tại

// Line 985 - Insert ticket với customerId = null
INSERT INTO customer_tickets (..., customer_id, ...)
VALUES (..., $2, ...)  // $2 = customerId có thể null
```

**VẤN ĐỀ:**
- ❌ Không tự động tạo customer nếu chưa tồn tại
- ❌ Ticket được tạo với `customer_id = NULL`
- ❌ Không thể mapping ticket vào customer sau này

**GIẢI PHÁP CẦN LÀM:**

**Option A: Thêm logic `getOrCreateCustomer()` vào API**
```javascript
// Thêm vào customer-360.js hoặc tách thành service
async function getOrCreateCustomer(db, phone, name) {
    // Try get existing
    let result = await db.query('SELECT id FROM customers WHERE phone = $1', [phone]);

    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    // Create new customer if not exists
    result = await db.query(`
        INSERT INTO customers (phone, name, status, tier, created_at)
        VALUES ($1, $2, 'Bình thường', 'new', CURRENT_TIMESTAMP)
        ON CONFLICT (phone) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `, [phone, name || 'Khách hàng mới']);

    return result.rows[0].id;
}

// Sử dụng trong POST /api/ticket
const customerId = await getOrCreateCustomer(db, normalizedPhone, customer_name);
```

**Option B: Sử dụng PostgreSQL Trigger/Function**
```sql
-- Tạo function tự động tạo customer nếu ticket có phone chưa tồn tại
CREATE OR REPLACE FUNCTION ensure_customer_exists_for_ticket()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id INTEGER;
BEGIN
    -- Try find customer
    SELECT id INTO v_customer_id FROM customers WHERE phone = NEW.phone;

    IF NOT FOUND THEN
        -- Create customer
        INSERT INTO customers (phone, name, status, tier)
        VALUES (NEW.phone, NEW.customer_name, 'Bình thường', 'new')
        RETURNING id INTO v_customer_id;
    END IF;

    NEW.customer_id := v_customer_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ensure_customer_before_ticket
BEFORE INSERT ON customer_tickets
FOR EACH ROW
EXECUTE FUNCTION ensure_customer_exists_for_ticket();
```

**KHUYẾN NGHỊ:** Dùng **Option A (getOrCreateCustomer)** vì:
- Rõ ràng, dễ debug
- Có thể validate/enrich data từ TPOS trước khi tạo
- Có thể ghi log chi tiết

---

### ❌ NGUỒN 3: Tự Động Tạo Khi Mapping từ Balance History (THIẾU)

**Flow mong muốn:**
```
1. User trong balance-history nhận được giao dịch chuyển khoản
2. User mapping giao dịch với SĐT khách hàng (QR code hoặc manual)
3. System tự động tạo customer mới nếu SĐT chưa tồn tại trong customers table
4. Link balance_history.linked_customer_phone = customers.phone
5. (Tùy chọn) Tự động nạp tiền vào wallet
```

**API hiện tại:** `POST /api/balance-history/link-customer`

**Status:** ⚠️ **API CHƯA TỒN TẠI** - Cần tạo mới

**Code cần implement:**
```javascript
// render.com/routes/balance-history.js (file mới hoặc thêm vào customer-360.js)

router.post('/balance-history/link-customer', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { transaction_id, phone, auto_deposit = false } = req.body;

    try {
        await db.query('BEGIN');

        // 1. Get transaction
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [transaction_id]
        );

        if (txResult.rows.length === 0) {
            throw new Error('Transaction not found');
        }

        const tx = txResult.rows[0];

        // 2. Get or create customer
        let customerResult = await db.query(
            'SELECT id, name FROM customers WHERE phone = $1',
            [phone]
        );

        if (customerResult.rows.length === 0) {
            // Auto-create customer
            customerResult = await db.query(`
                INSERT INTO customers (phone, name, status, tier, created_at)
                VALUES ($1, $2, 'Bình thường', 'new', CURRENT_TIMESTAMP)
                RETURNING id, name
            `, [phone, tx.customer_name || 'Khách hàng mới']);
        }

        const customerId = customerResult.rows[0].id;

        // 3. Link transaction to customer
        await db.query(`
            UPDATE balance_history
            SET linked_customer_phone = $1,
                customer_id = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [phone, customerId, transaction_id]);

        // 4. Optional: Auto deposit to wallet
        if (auto_deposit && tx.amount > 0) {
            // Call wallet deposit API
            await db.query(`
                UPDATE customer_wallets
                SET balance = balance + $1,
                    total_deposited = total_deposited + $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE phone = $2
            `, [tx.amount, phone]);

            // Log transaction
            await db.query(`
                INSERT INTO wallet_transactions (
                    phone, wallet_id, type, amount, source,
                    reference_type, reference_id, note
                )
                SELECT $1, id, 'DEPOSIT', $2, 'BANK_TRANSFER',
                       'balance_history', $3, $4
                FROM customer_wallets WHERE phone = $1
            `, [phone, tx.amount, transaction_id, `Nạp từ CK ${tx.transaction_code}`]);

            // Mark as processed
            await db.query(`
                UPDATE balance_history
                SET wallet_processed = true,
                    wallet_transaction_id = (
                        SELECT id FROM wallet_transactions
                        WHERE phone = $1 AND reference_id = $2::TEXT
                        ORDER BY created_at DESC LIMIT 1
                    )
                WHERE id = $2
            `, [phone, transaction_id]);
        }

        await db.query('COMMIT');

        res.json({
            success: true,
            message: 'Đã liên kết giao dịch với khách hàng',
            data: { customer_id: customerId, auto_deposited: auto_deposit }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('[LINK-CUSTOMER] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
```

---

## TÓM TẮT: CHECKLIST CÔNG VIỆC CẦN LÀM

### A. Cron Jobs Backend

| Task | File | Status | Priority |
|------|------|--------|----------|
| PostgreSQL Function `expire_virtual_credits()` | `002_create_customer_360_triggers.sql:411` | ✅ Đã có | - |
| Node.js Scheduler chạy `expire_virtual_credits()` | `render.com/cron/expire-credits.js` (MỚI) | ❌ Thiếu | **CAO** |
| Carrier Deadline Checker | `render.com/cron/deadline-checker.js` (MỚI) | ❌ Thiếu | TRUNG BÌNH |
| Fraud Detection | `render.com/cron/fraud-detection.js` (MỚI) | ❌ Thiếu | THẤP |

**Cách chạy cron jobs trong Node.js:**
```javascript
// render.com/cron/scheduler.js
const cron = require('node-cron');
const db = require('../db/pool');

// Chạy mỗi giờ
cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running expire_virtual_credits...');
    const result = await db.query('SELECT * FROM expire_virtual_credits()');
    console.log(`[CRON] ✅ Expired ${result.rows[0].expired_count} credits, total: ${result.rows[0].total_expired_amount} VND`);
});

// Chạy mỗi ngày lúc 2AM
cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Running fraud detection...');
    // TODO: Implement fraud detection logic
});
```

### B. Auto-Create Customer

| Nguồn | API/Trigger | Status | Priority |
|-------|-------------|--------|----------|
| 1. Customer 360 UI | `POST /api/customers` | ✅ Đã có | - |
| 2. Issue-Tracking Ticket | `POST /api/ticket` + `getOrCreateCustomer()` | ❌ Thiếu logic | **CAO** |
| 3. Balance History Link | `POST /api/balance-history/link-customer` | ❌ Thiếu API | **CAO** |

### C. Database Triggers

| Trigger | Function | Status |
|---------|----------|--------|
| Auto-create wallet khi tạo customer | `trg_create_wallet` | ✅ Đã có |
| Auto-create customer khi tạo ticket | - | ❌ Không khuyến nghị (dùng app logic) |
| Auto-generate ticket code | `trg_generate_ticket_code` | ✅ Đã có |

---

## KẾ HOẠCH IMPLEMENT ƯU TIÊN

### Phase 1: Critical (1-2 ngày)

1. **Sửa POST /api/ticket - Thêm getOrCreateCustomer()**
   - File: `render.com/routes/customer-360.js:957`
   - Đảm bảo mọi ticket đều có `customer_id` hợp lệ

2. **Tạo POST /api/balance-history/link-customer**
   - File: `render.com/routes/customer-360.js` hoặc `render.com/routes/balance-history.js`
   - Cho phép link giao dịch + auto create customer + auto deposit wallet

3. **Tạo Node.js Cron Scheduler cho expire_virtual_credits()**
   - File: `render.com/cron/scheduler.js`
   - Import vào `server.js`

### Phase 2: Important (3-5 ngày)

4. **Frontend Customer 360: Module Link Transaction**
   - UI để search giao dịch từ balance_history chưa link
   - Button "Liên kết khách hàng" → call API mới
   - Checkbox "Tự động nạp vào ví"

5. **Frontend Issue-Tracking: Auto-fill customer info**
   - Khi nhập SĐT → tự động load customer từ DB
   - Hiển thị thông tin: name, tier, wallet balance
   - Nếu SĐT mới → hiện warning "Sẽ tạo khách hàng mới"

### Phase 3: Nice-to-have

6. Carrier Deadline Checker cron job
7. Fraud Detection cron job
8. Admin dashboard để monitor cron job status

---

# IMPLEMENTATION TASKS (Theo thứ tự ưu tiên)

## 🔥 PHASE 1: CRITICAL FIXES (1-2 ngày)

### Task 1.1: Fix POST /api/ticket - Auto-create Customer
**File:** `render.com/routes/customer-360.js:957-1003`

**Hiện trạng:**
```javascript
// Line 971-973 - KHÔNG TẠO CUSTOMER MỚI
const customerResult = await db.query('SELECT id FROM customers WHERE phone = $1', [phone]);
const customerId = customerResult.rows[0]?.id;  // ❌ Có thể null
```

**Cần làm:**
1. Tạo helper function `getOrCreateCustomer(db, phone, name)`
2. Update POST /api/ticket để dùng helper này
3. Đảm bảo mọi ticket có `customer_id` hợp lệ

**Code mẫu:**
```javascript
// render.com/utils/customer-helpers.js
async function getOrCreateCustomer(db, phone, name) {
    const normalized = normalizePhone(phone);

    let result = await db.query('SELECT id FROM customers WHERE phone = $1', [normalized]);

    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    // Auto-create customer
    result = await db.query(`
        INSERT INTO customers (phone, name, status, tier, created_at)
        VALUES ($1, $2, 'Bình thường', 'new', CURRENT_TIMESTAMP)
        ON CONFLICT (phone) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `, [normalized, name || 'Khách hàng mới']);

    console.log(`[AUTO-CREATE] Created customer: ${name} (${normalized})`);
    return result.rows[0].id;
}
```

**Test:**
- Tạo ticket với SĐT mới → Check customers table có record mới
- Tạo ticket với SĐT đã có → Check không tạo duplicate

---

### Task 1.2: Create POST /api/balance-history/link-customer
**File:** `render.com/routes/customer-360.js` (thêm route mới)

**Mục đích:** Cho phép link giao dịch balance_history với customer + tự động tạo customer mới + auto deposit wallet

**API Spec:**
```
POST /api/balance-history/link-customer
Body: {
  transaction_id: number,
  phone: string,
  auto_deposit: boolean (default: false)
}
```

**Flow:**
1. Get balance_history transaction by ID
2. getOrCreateCustomer(phone, tx.customer_name)
3. UPDATE balance_history SET linked_customer_phone, customer_id
4. If auto_deposit: Deposit to wallet + log transaction
5. Mark wallet_processed = true

**Test:**
- Link giao dịch với SĐT mới → Check customer created + linked
- Link với auto_deposit=true → Check wallet balance increased
- Link giao dịch đã link → Return error

---

### Task 1.3: Create Cron Jobs Scheduler
**File:** `render.com/cron/scheduler.js` (MỚI)

**Mục đích:** Chạy PostgreSQL function `expire_virtual_credits()` mỗi giờ

**Code:**
```javascript
const cron = require('node-cron');
const db = require('../db/pool');

// Chạy mỗi giờ
cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running expire_virtual_credits...');
    try {
        const result = await db.query('SELECT * FROM expire_virtual_credits()');
        const { expired_count, total_expired_amount } = result.rows[0];
        console.log(`[CRON] ✅ Expired ${expired_count} credits, total: ${total_expired_amount} VND`);
    } catch (error) {
        console.error('[CRON] ❌ Error:', error);
    }
});

console.log('[CRON] Scheduler started');
```

**File:** `render.com/server.js` (update)
```javascript
// Thêm vào cuối file
require('./cron/scheduler');
```

**Test:**
- Insert virtual_credit với expires_at = yesterday
- Chạy server → Đợi 1 giờ hoặc trigger manual
- Check virtual_credits status = 'EXPIRED'
- Check wallet.virtual_balance đã giảm

---

## ⭐ PHASE 2: FRONTEND CUSTOMER HUB (3-5 ngày)

### Task 2.1: Create customer-hub/ Structure
**Thư mục:** `customer-hub/`

**Cấu trúc:**
```
customer-hub/
├── index.html
├── styles/
│   ├── main.css
│   └── components.css
├── js/
│   ├── main.js
│   ├── api-service.js       # Copy từ issue-tracking (đã có)
│   ├── modules/
│   │   ├── customer-search.js
│   │   ├── customer-profile.js
│   │   ├── wallet-panel.js
│   │   ├── transaction-history.js
│   │   ├── ticket-list.js
│   │   └── link-bank-transaction.js  # MỚI
│   └── utils/
│       └── permissions.js    # Import PermissionHelper
└── config.js
```

---

### Task 2.2: Customer Search Module
**File:** `customer-hub/js/modules/customer-search.js`

**Features:**
- Search by phone/name
- Display results in table
- Click → navigate to customer detail

---

### Task 2.3: Customer Profile 360° View
**File:** `customer-hub/js/modules/customer-profile.js`

**API:** `GET /api/customer/:phone` (đã có)

**Sections:**
1. Customer Info Card (name, phone, tier, status, tags)
2. Wallet Balance (real + virtual)
3. RFM Scores (visual chart)
4. Recent Tickets (last 10)
5. Activity Timeline (last 20)

---

### Task 2.4: Link Bank Transaction Module
**File:** `customer-hub/js/modules/link-bank-transaction.js`

**Features:**
- List unlinked balance_history transactions
- Search/filter by date, amount, description
- Button "Liên kết khách hàng"
  → Modal: Nhập SĐT + checkbox "Auto deposit"
  → Call `POST /api/balance-history/link-customer`
- Show success message + update customer wallet in real-time

---

## 🎯 PHASE 3: ADVANCED FEATURES (Tuần 2-3)

### Task 3.1: Carrier Deadline Checker Cron
**File:** `render.com/cron/scheduler.js` (update)

**Cần thêm field:** `carrier_deadline TIMESTAMP` vào `customer_tickets`

**Flow:**
```javascript
cron.schedule('0 */6 * * *', async () => { // Mỗi 6 giờ
    // Tìm tickets có carrier_deadline < now + 24h
    // Update priority = 'high'
    // Gửi notification
});
```

---

### Task 3.2: Fraud Detection Job
**File:** `render.com/cron/fraud-detection.js` (MỚI)

**Rules:**
- return_rate > 50% trong 7 ngày → tier = 'blacklist'
- Nhiều giao dịch wallet > 5M trong 1 giờ → flag suspicious
- Tự deposit rồi withdraw liên tục → flag self-dealing

---

## 📋 FILES QUAN TRỌNG

### Cần sửa:
1. `render.com/routes/customer-360.js:957-1003` (POST /api/ticket)
2. `render.com/server.js` (import cron scheduler)

### Cần tạo mới:
1. `render.com/utils/customer-helpers.js` (getOrCreateCustomer)
2. `render.com/routes/customer-360.js` (thêm POST /api/balance-history/link-customer)
3. `render.com/cron/scheduler.js` (cron jobs)
4. `customer-hub/` (toàn bộ frontend mới)

### Cần cập nhật permissions:
1. `user-management/permissions-registry.js`:
```javascript
"customer-hub": {
    id: "customer-hub",
    icon: "users",
    name: "CUSTOMER 360",
    subPermissions: {
        view: { name: "Xem thông tin", icon: "eye" },
        edit_profile: { name: "Sửa hồ sơ", icon: "edit" },
        manage_wallet: { name: "Quản lý ví", icon: "wallet" },
        view_transactions: { name: "Xem giao dịch", icon: "list" },
        link_transactions: { name: "Liên kết giao dịch", icon: "link" },
        export_data: { name: "Xuất dữ liệu", icon: "download" },
    },
}
```

---

## ✅ VERIFICATION CHECKLIST

### Backend:
- [ ] Tạo ticket với SĐT mới → Customer auto-created
- [ ] Tạo ticket với SĐT cũ → Customer không duplicate
- [ ] Link balance_history → Customer created + linked
- [ ] Link với auto_deposit=true → Wallet balance tăng
- [ ] Cron job chạy → Virtual credits expired
- [ ] SSE events hoạt động real-time

### Frontend:
- [ ] Customer search hoạt động
- [ ] Customer 360 view hiển thị đầy đủ
- [ ] Wallet panel cập nhật real-time
- [ ] Link transaction UI hoạt động
- [ ] Permissions được enforce đúng

### End-to-End:
- [ ] Flow: Bank transfer → Auto match QR → Deposit wallet → Real-time update
- [ ] Flow: Create ticket BOOM → Issue virtual credit → Use in order → Expire after 15 days
- [ ] Flow: Search customer → View 360 → Link new bank transaction → Deposit

---

## 🚀 RECOMMENDED IMPLEMENTATION ORDER

**Tuần 1:**
1. Task 1.1: Fix POST /api/ticket (2 giờ)
2. Task 1.2: Create link-customer API (3 giờ)
3. Task 1.3: Cron scheduler (1 giờ)
4. Test backend thoroughly (2 giờ)

**Tuần 2:**
5. Task 2.1-2.2: Customer hub structure + search (1 ngày)
6. Task 2.3: Customer profile 360 (2 ngày)
7. Task 2.4: Link transaction module (1 ngày)

**Tuần 3:**
8. Task 3.1-3.2: Advanced cron jobs (2 ngày)
9. End-to-end testing + bug fixes (3 ngày)

---

## 📞 DEPENDENCIES & ASSUMPTIONS

### Dependencies:
- PostgreSQL migrations đã chạy xong
- Firebase authentication đang hoạt động
- Cloudflare Worker proxy hoạt động
- SePay webhook đang nhận được transactions

### Assumptions:
- User sẽ tự động tạo customer khi tạo ticket (Option A - im lặng)
- Balance history link sẽ có manual step (không auto-link 100%)
- Cron jobs chạy trên Render.com (không cần separate service)

---

## 🎓 TECHNICAL NOTES

### Phone Normalization:
- Luôn dùng function `normalizePhone()` từ `002_create_customer_360_triggers.sql`
- Format chuẩn: `0XXXXXXXXX` (10-11 số)

### Atomic Transactions:
- Mọi wallet operations dùng `BEGIN...COMMIT`
- Dùng `FOR UPDATE` khi lock wallet

### Real-time Updates:
- SSE endpoint: `/api/events`
- Channels: `wallets`, `tickets`, `customers`

### Error Handling:
- Dùng Error Matrix từ `issue-tracking/MASTER_DOCUMENTATION.md`
- Log mọi errors vào `audit_logs` table
