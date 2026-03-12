# KẾ HOẠCH HIỆN THỰC: HỆ THỐNG QUẢN LÝ KHÁCH HÀNG & CÔNG NỢ TÍCH HỢP VÍ

> **Ngày tạo:** 2026-01-04
> **Phân tích bởi:** Claude Sonnet 4.5
> **Mục tiêu:** Tạo trang mới "Quản Lý Khách Hàng & Công Nợ" tích hợp đầy đủ: Profile khách hàng + Ví + Lịch sử sự vụ + Ghi chú
> **Độ ưu tiên:** MVP nhanh (2-3 tuần) + Tài liệu đầy đủ cho các phase tiếp theo

---

> ⚠️ **CẬP NHẬT (2026-01-12):** Module `customer-management` đã được XÓA HOÀN TOÀN và thay thế bằng `customer-hub` (Customer 360).
> Tài liệu này giữ lại để tham khảo lịch sử kế hoạch. Tất cả references đến `customer-management` trong tài liệu này nên hiểu là đã được thay thế bằng `customer-hub`.

---

## 📋 TÓM TẮT YÊU CẦU

### Từ Câu Hỏi Của User:

**Scope tính năng:**
- ✅ Xem lịch sử nạp tiền (từ balance-history)
- ✅ Xem công nợ theo đơn hàng (từ issue-tracking)
- ✅ Quản lý số dư ví ảo (tính toán tự động)
- ✅ Tạo/quản lý QR code nạp tiền
- ✅ Ghi chú sự vụ liên quan đến khách hàng
- ✅ Tra cứu nhanh ticket cũ và trạng thái

**Quyết định kiến trúc:**
- 🎯 Tạo page MỚI: "Quản Lý Khách Hàng & Công Nợ" (thay vì tab trong balance-history)
- 🎯 MVP: Chỉ xem balance + lịch sử (KHÔNG có trừ tiền khi tạo đơn)
- 🎯 Approval: Simple (không cần duyệt manual transaction)
- 🎯 TPOS Integration: Phase 2 (chưa làm trong MVP)
- 🎯 Widget: Trang riêng, KHÔNG embed vào customer-management cũ

**Workflow chính:**
1. **CSKH Admin**: Tra cứu KH → Xem ví → Check mapping SĐT giao dịch → Xem lịch sử sự vụ
2. **Sale**: Tra KH trước khi tạo đơn → Xem số dư + sự vụ cũ để quyết định có bán hay không

---

## 🏗️ KIẾN TRÚC KHUYẾN NGHỊ

### Lựa Chọn: **TRANG MỚI ĐỘC LẬP** (không refactor customer-management cũ)

**Lý do:**
- customer-management hiện tại là PostgreSQL-based, 80,000+ records, IndexedDB cache phức tạp
- Mục đích khác biệt:
  - customer-management cũ: Quản lý database khách (import/export Excel, sync TPOS)
  - Trang mới: Theo dõi công nợ và ví cho CSKH/Sale (realtime, transaction-focused)
- Tránh conflict: Hai trang phục vụ hai use case khác nhau, không nên gộp

**Tên trang mới:** `customer-wallet/` (hoặc `customer-debt-tracker/`)

---

## 📐 CẤU TRÚC TRANG MỚI

### Layout: **Single-Page với Sections** (KHÔNG dùng tabs)

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                │
│ [Tìm kiếm khách hàng: Tên/SĐT/Mã đơn]  [Tạo Giao Dịch]  [Export]   │
├──────────────────────────────────────────────────────────────────────┤
│ CUSTOMER INFO PANEL (hiện khi chọn KH)                              │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ Tên: Nguyễn Văn A           SĐT: 0901234567                    │  │
│ │ TPOS ID: 12345              Trạng thái: VIP                     │  │
│ │ ┌──────────────┐ ┌───────────────┐ ┌────────────────────────┐ │  │
│ │ │ Số Dư Ví     │ │ Tổng Nạp      │ │ Tổng Công Nợ          │ │  │
│ │ │ 500,000đ     │ │ 2,000,000đ    │ │ 300,000đ (3 vụ)       │ │  │
│ │ └──────────────┘ └───────────────┘ └────────────────────────┘ │  │
│ │ [Tạo QR Nạp Tiền]  [Thêm Ghi Chú]                              │  │
│ └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│ TIMELINE (Timeline gộp tất cả sự kiện theo thứ tự thời gian)        │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ [Filter: Tất cả ▾] [Loại: Tất cả ▾] [Từ ngày] [Đến ngày]      │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │                                                                 │  │
│ │ 📅 21/12/2024 14:02                                            │  │
│ │ 💰 NẠP TIỀN: +2,000,000đ (SePay ACB)                          │  │
│ │ Mã GD: N2ABCD1234  |  Số dư sau: 2,500,000đ                   │  │
│ │ [Xem QR] [Chi tiết]                                            │  │
│ │ ────────────────────────────────────────────────────────────   │  │
│ │                                                                 │  │
│ │ 📅 20/12/2024 10:15                                            │  │
│ │ 🔄 HOÀN HÀNG: +500,000đ (Ticket #DH-RETURN-001)               │  │
│ │ Lý do: Lỗi size  |  Trạng thái: COMPLETED  |  Đã hoàn ví     │  │
│ │ [Xem Ticket]                                                   │  │
│ │ ────────────────────────────────────────────────────────────   │  │
│ │                                                                 │  │
│ │ 📅 18/12/2024 09:30                                            │  │
│ │ 💬 GHI CHÚ: Khách hàng VIP, ship COD ưu tiên                  │  │
│ │ Người tạo: admin_cskh  |  [Sửa] [Xóa]                         │  │
│ │ ────────────────────────────────────────────────────────────   │  │
│ │                                                                 │  │
│ │ 📅 15/12/2024 16:45                                            │  │
│ │ ⚠️ BOOM HÀNG: -300,000đ (Ticket #DH-BOOM-005)                │  │
│ │ Trạng thái: PENDING_FINANCE (Chờ đối soát)                    │  │
│ │ [Xử lý]                                                        │  │
│ │                                                                 │  │
│ └────────────────────────────────────────────────────────────────┘  │
│ [Load More]                                                          │
└──────────────────────────────────────────────────────────────────────┘
```

**Ưu điểm Timeline Layout:**
- ✅ CSKH nhìn nhanh toàn bộ lịch sử khách hàng (nạp tiền + sự vụ + ghi chú) trong 1 view
- ✅ Không cần switch tab, giảm context switching
- ✅ Thứ tự thời gian logic (như Facebook Timeline)
- ✅ Dễ thêm loại event mới (order, payment, etc.)

---

## 📊 DATA MODEL

### Bảng Mới Cần Tạo:

#### 1. `wallet_ledger` (Sổ cái ví - Single source of truth)
```sql
CREATE TABLE wallet_ledger (
    id SERIAL PRIMARY KEY,
    customer_phone VARCHAR(20) UNIQUE NOT NULL,
    customer_name VARCHAR(255),
    tpos_id INTEGER,  -- Link to TPOS Partner.Id

    -- Balance tracking
    current_balance BIGINT DEFAULT 0,
    lifetime_deposits BIGINT DEFAULT 0,
    lifetime_refunds BIGINT DEFAULT 0,
    lifetime_deductions BIGINT DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_transaction_at TIMESTAMP,

    INDEX idx_wallet_phone (customer_phone),
    INDEX idx_wallet_tpos (tpos_id)
);
```

#### 2. `wallet_transactions` (Giao dịch ví - Unified log)
```sql
CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    customer_phone VARCHAR(20) NOT NULL,

    -- Transaction
    transaction_type VARCHAR(50) NOT NULL,  -- 'DEPOSIT', 'REFUND', 'DEDUCTION', 'ADJUSTMENT', 'NOTE'
    amount BIGINT,  -- NULL for notes
    balance_after BIGINT,

    -- Source
    source_type VARCHAR(50) NOT NULL,  -- 'SEPAY', 'ISSUE_TRACKING', 'MANUAL', 'NOTE'
    source_id VARCHAR(100),  -- FK to source table
    source_reference TEXT,  -- Display text

    -- Metadata
    description TEXT,
    created_by VARCHAR(100),
    transaction_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_phone) REFERENCES wallet_ledger(customer_phone),
    INDEX idx_wt_phone_date (customer_phone, transaction_date DESC),
    INDEX idx_wt_source (source_type, source_id)
);
```

#### 3. `customer_notes` (Ghi chú khách hàng - Mới)
```sql
CREATE TABLE customer_notes (
    id SERIAL PRIMARY KEY,
    customer_phone VARCHAR(20) NOT NULL,
    note_text TEXT NOT NULL,
    note_type VARCHAR(50) DEFAULT 'GENERAL',  -- 'GENERAL', 'WARNING', 'VIP', 'ISSUE'
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_pinned BOOLEAN DEFAULT false,

    FOREIGN KEY (customer_phone) REFERENCES wallet_ledger(customer_phone),
    INDEX idx_notes_phone (customer_phone, created_at DESC)
);
```

### Bảng Hiện Có Cần Modify:

#### `issue_tracking` - Thêm cột:
```sql
ALTER TABLE issue_tracking
ADD COLUMN refund_to_wallet BOOLEAN DEFAULT false,
ADD COLUMN wallet_transaction_id INTEGER REFERENCES wallet_transactions(id);
```

#### `balance_history` - Không cần modify (đã có customer_info mapping)

---

## 🔄 LOGIC TÍNH TOÁN VÍ

### Aggregation Pipeline (Backend API):

```javascript
// GET /api/wallet/balance/:phone
async function calculateWalletBalance(phone) {
    // 1. DEPOSITS: Từ balance_history (SePay webhook)
    const deposits = await db.query(`
        SELECT
            bh.id,
            bh.transfer_amount as amount,
            bh.transaction_date,
            bh.content,
            ci.unique_code
        FROM balance_history bh
        JOIN customer_info ci ON bh.content ILIKE '%' || ci.unique_code || '%'
        WHERE ci.customer_phone = $1
          AND bh.transfer_type = 'in'
        ORDER BY bh.transaction_date DESC
    `, [phone]);

    // 2. REFUNDS: Từ issue_tracking (boom/return completed)
    const refunds = await db.query(`
        SELECT
            id,
            money as amount,
            created_at as transaction_date,
            type,
            order_id,
            status
        FROM issue_tracking
        WHERE phone = $1
          AND type IN ('RETURN_CLIENT', 'RETURN_SHIPPER', 'BOOM')
          AND status = 'COMPLETED'
          AND refund_to_wallet = true
        ORDER BY created_at DESC
    `, [phone]);

    // 3. MANUAL ADJUSTMENTS: Từ wallet_transactions
    const manuals = await db.query(`
        SELECT
            id,
            amount,
            transaction_date,
            description,
            created_by
        FROM wallet_transactions
        WHERE customer_phone = $1
          AND source_type = 'MANUAL'
        ORDER BY transaction_date DESC
    `, [phone]);

    // 4. NOTES: Từ customer_notes
    const notes = await db.query(`
        SELECT
            id,
            note_text,
            note_type,
            created_by,
            created_at,
            is_pinned
        FROM customer_notes
        WHERE customer_phone = $1
        ORDER BY is_pinned DESC, created_at DESC
    `, [phone]);

    // 5. Merge thành timeline
    const timeline = [
        ...deposits.map(d => ({
            type: 'DEPOSIT',
            date: d.transaction_date,
            amount: d.amount,
            source: 'SePay',
            reference: d.unique_code,
            details: d.content
        })),
        ...refunds.map(r => ({
            type: 'REFUND',
            date: r.transaction_date,
            amount: r.amount,
            source: 'Issue Tracking',
            reference: r.order_id,
            details: `${r.type} - ${r.status}`,
            ticket_id: r.id
        })),
        ...manuals.map(m => ({
            type: 'MANUAL',
            date: m.transaction_date,
            amount: m.amount,
            source: 'Admin',
            reference: m.created_by,
            details: m.description
        })),
        ...notes.map(n => ({
            type: 'NOTE',
            date: n.created_at,
            amount: null,
            source: n.created_by,
            details: n.note_text,
            note_type: n.note_type,
            is_pinned: n.is_pinned
        }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // 6. Tính balance
    const totalDeposits = deposits.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    const totalRefunds = refunds.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const totalDeductions = 0; // Phase 2
    const totalAdjustments = manuals.reduce((sum, m) => sum + parseFloat(m.amount), 0);

    const currentBalance = totalDeposits + totalRefunds + totalAdjustments - totalDeductions;

    return {
        balance: currentBalance,
        deposits: totalDeposits,
        refunds: totalRefunds,
        deductions: totalDeductions,
        adjustments: totalAdjustments,
        timeline: timeline,
        statistics: {
            total_deposits_count: deposits.length,
            total_refunds_count: refunds.length,
            total_notes_count: notes.length,
            pending_issues: refunds.filter(r => r.status !== 'COMPLETED').length
        }
    };
}
```

---

## 🛠️ BACKEND API ENDPOINTS (MVP)

### Core Wallet APIs:

| Endpoint | Method | Mô Tả | Priority |
|----------|--------|-------|----------|
| `/api/wallet/search` | GET | Tìm khách hàng (phone/name/TPOS ID) | **P0** |
| `/api/wallet/balance/:phone` | GET | Lấy balance + timeline | **P0** |
| `/api/wallet/transactions/manual` | POST | Tạo giao dịch thủ công | **P1** |
| `/api/wallet/notes` | POST | Thêm ghi chú | **P1** |
| `/api/wallet/notes/:id` | PUT/DELETE | Sửa/Xóa ghi chú | **P1** |
| `/api/wallet/qr/generate` | POST | Tạo QR nạp tiền | **P0** |
| `/api/wallet/link-transaction` | POST | Map giao dịch chưa có SĐT vào ví | **P0** |

### Integration APIs (Reuse existing):

| Endpoint | Source | Usage |
|----------|--------|-------|
| `/api/sepay/history` | balance-history | Lấy deposits |
| `/api/sepay/customer-info` | balance-history | Mapping unique_code → phone |
| `/api/customers/search` | customer-management | Search KH từ PostgreSQL |
| `/api/issues/by-phone` | issue-tracking | Lấy tickets theo SĐT |

---

## 📁 CẤU TRÚC CODE (MODULAR - Tránh Monolith)

```
customer-wallet/
├── index.html                    # Main page (300 lines max)
├── styles.css                    # Page-specific styles
├── config.js                     # API endpoints
│
├── app.js                        # Main orchestrator (150 lines)
│   ├── DOMContentLoaded
│   ├── Initialize modules
│   └── Event delegation
│
├── modules/
│   ├── customer-search.js       # Search autocomplete (200 lines)
│   ├── wallet-balance.js        # Balance calculation display (150 lines)
│   ├── timeline-renderer.js     # Timeline UI (300 lines)
│   ├── qr-manager.js            # QR generation (reuse from balance-history)
│   ├── note-manager.js          # CRUD notes (200 lines)
│   └── transaction-linker.js    # Map unmapped transactions (150 lines)
│
├── services/
│   ├── wallet-api.js            # API client (200 lines)
│   └── cache-service.js         # Client cache (reuse shared)
│
└── utils/
    ├── formatters.js            # Currency/date formatters
    └── event-icons.js           # Icon mapping per event type

shared/ (Reuse & Extract)
├── js/
│   ├── customer-mapper.js       # ⭐ EXTRACTED from balance-history
│   ├── qr-generator.js          # ⭐ EXTRACTED from balance-history
│   ├── notification-manager.js  # ⭐ EXTRACTED from balance-history
│   └── cache-manager.js         # ⭐ EXTRACTED from balance-history
```

**Quy tắc:**
- ❌ Không file nào > 300 lines
- ❌ Không function nào > 50 lines
- ✅ Mỗi module export 1 class/object rõ ràng
- ✅ Tất cả API calls qua wallet-api.js

---

## 📅 ROADMAP MVP (2-3 Tuần)

### WEEK 1: Foundation + Backend

**Day 1-2: Database & API**
- [ ] Tạo migration: `create_wallet_tables.sql` (wallet_ledger, wallet_transactions, customer_notes)
- [ ] Tạo API endpoints: `/api/wallet/search`, `/api/wallet/balance/:phone`
- [ ] Test với Postman/curl

**Day 3-4: Shared Components**
- [ ] Extract QRGenerator từ balance-history → `/js/qr-generator.js`
- [ ] Extract NotificationManager → `/js/notification-manager.js`
- [ ] Extract CacheManager → `/js/cache-manager.js`
- [ ] Test balance-history vẫn hoạt động

**Day 5: Customer Search**
- [ ] Tạo `customer-wallet/modules/customer-search.js`
- [ ] API `/api/wallet/search` với autocomplete
- [ ] UI: Search box + result dropdown

### WEEK 2: Core UI + Timeline

**Day 6-7: Page Structure**
- [ ] Tạo `customer-wallet/index.html` với layout
- [ ] Customer info panel (3 cards: Balance, Deposits, Debts)
- [ ] Empty state timeline

**Day 8-9: Timeline Rendering**
- [ ] `timeline-renderer.js`: Render deposits từ balance_history
- [ ] Render refunds từ issue_tracking
- [ ] Render notes từ customer_notes
- [ ] Sort by date DESC
- [ ] Icon per event type

**Day 10: Filters & Pagination**
- [ ] Filter by event type (all, deposit, refund, note)
- [ ] Date range filter
- [ ] Load more pagination (50 events per page)

### WEEK 3: Features + Integration

**Day 11-12: QR Generator**
- [ ] Button "Tạo QR Nạp Tiền" trong customer panel
- [ ] Reuse QRGenerator từ shared
- [ ] Auto-fill customer name/phone
- [ ] Copy URL + Download QR

**Day 13-14: Notes Management**
- [ ] `note-manager.js`: Add/Edit/Delete notes
- [ ] API `/api/wallet/notes` (POST/PUT/DELETE)
- [ ] Pin note functionality
- [ ] Note types: GENERAL, WARNING, VIP, ISSUE

**Day 15: Transaction Linking**
- [ ] Workflow: Tìm giao dịch SePay chưa map SĐT
- [ ] Modal: "Giao dịch N2XXX chưa có SĐT, nhập SĐT để link vào ví"
- [ ] API `/api/wallet/link-transaction`

**Day 16-17: Testing & Polish**
- [ ] Test với 100+ customers
- [ ] Test concurrent updates
- [ ] Mobile responsive
- [ ] Loading states
- [ ] Error handling

**Day 18: Documentation**
- [ ] Tạo `customer-wallet/IMPLEMENTATION_GUIDE.md` (như balance-history)
- [ ] API documentation
- [ ] User guide for CSKH/Sale

---

## 🔗 INTEGRATION POINTS

### 1. Balance-History Integration

**Scenario:** CSKH đang trong balance-history, thấy giao dịch chưa map SĐT

**Solution:**
- Thêm button trong balance-history table: "Link to Wallet"
- Click → Modal: Nhập SĐT → Call `/api/wallet/link-transaction`
- Redirect to customer-wallet page với SĐT đó

**Code change:**
```javascript
// balance-history/main.js (thêm vào renderTransactionRow)
if (!customerDisplay.hasInfo) {
    actions += `<button onclick="linkToWallet('${row.content}')">Link to Wallet</button>`;
}

function linkToWallet(content) {
    const uniqueCode = content.match(/\bN2[A-Z0-9]{16}\b/)[0];
    window.location.href = `../customer-wallet/index.html?link=${uniqueCode}`;
}
```

### 2. Issue-Tracking Integration

**Scenario:** Ticket RETURN_CLIENT hoàn tất, cần hoàn tiền vào ví

**Solution:**
- Khi ticket status → COMPLETED, hiện checkbox "Hoàn tiền vào ví?"
- Nếu check → Call `/api/wallet/transactions/refund` + Set `refund_to_wallet = true`

**Code change:**
```javascript
// issue-tracking/script.js (trong handleConfirmAction)
if (pendingActionType === 'RECEIVE' && ticket.type.includes('RETURN')) {
    const refundToWallet = confirm('Hoàn tiền vào ví khách hàng?');
    if (refundToWallet) {
        await fetch(`${API_BASE}/api/wallet/transactions/refund`, {
            method: 'POST',
            body: JSON.stringify({
                customerPhone: ticket.phone,
                amount: ticket.money,
                sourceType: 'ISSUE_TRACKING',
                sourceId: ticket.firebaseId,
                sourceReference: ticket.orderId
            })
        });
    }
}
```

### 3. Customer-Management Integration

**Scenario:** Admin đang xem customer-management, muốn check ví của KH

**Solution:**
- Thêm cột "Ví" trong customer table
- Button "Xem Ví" → Opens customer-wallet trong tab mới

**Code change:**
```javascript
// customer-management/main.js (thêm vào renderTable)
row += `<td><a href="../customer-wallet/index.html?phone=${customer.phone}" target="_blank">Xem Ví</a></td>`;
```

---

## 🚀 PHASE 2 FEATURES (Tài Liệu Cho Tương Lai)

### 1. TPOS Order Deduction (Trừ Tiền Khi Tạo Đơn)

**Workflow:**
1. Khi tạo đơn TPOS → Check balance via `/api/wallet/balance/:phone`
2. Nếu đủ tiền → Show option "Thanh toán bằng ví"
3. Select wallet payment → Call `/api/wallet/transactions/deduction`
4. TPOS order lưu payment_method = 'WALLET_PARTIAL' hoặc 'WALLET_FULL'

**API:**
```javascript
POST /api/wallet/transactions/deduction
{
    "customerPhone": "0901234567",
    "amount": -500000,
    "sourceType": "TPOS_ORDER",
    "sourceId": "DH-001",
    "description": "Thanh toán đơn hàng DH-001"
}
```

**Backend logic:**
```javascript
// Check balance
const balance = await getWalletBalance(phone);
if (balance.current_balance < amount) {
    throw new Error('Insufficient balance');
}

// Atomic transaction
await db.transaction(async (trx) => {
    // 1. Insert wallet_transaction
    const txn = await trx('wallet_transactions').insert({...}).returning('*');

    // 2. Update wallet_ledger
    await trx('wallet_ledger')
        .where('customer_phone', phone)
        .update({
            current_balance: balance.current_balance - amount,
            lifetime_deductions: trx.raw('lifetime_deductions + ?', [amount])
        });

    // 3. Update TPOS order (if webhook enabled)
    await updateTPOSOrder(sourceId, { wallet_payment: amount });
});
```

### 2. Approval Workflow (Duyệt Giao Dịch Thủ Công)

**Khi nào cần:**
- Số tiền adjustment > 1,000,000 VND
- Admin cấp thấp tạo transaction

**Workflow:**
1. Admin tạo manual transaction → Status = 'PENDING'
2. Manager vào page `/api/wallet/pending-approvals`
3. Review → Click "Approve" hoặc "Reject"
4. Nếu approve → Status = 'APPROVED' + Balance cập nhật
5. Email/notification cho admin tạo

**Database:**
```sql
ALTER TABLE wallet_transactions
ADD COLUMN approval_status VARCHAR(20) DEFAULT 'APPROVED',
ADD COLUMN approved_by VARCHAR(100),
ADD COLUMN approved_at TIMESTAMP,
ADD COLUMN rejection_reason TEXT;

-- Chỉ tính transaction approved vào balance
-- WHERE approval_status = 'APPROVED'
```

### 3. Wallet Credit Limit (Cho Phép Số Dư Âm)

**Use case:** VIP customer được phép nợ tối đa 5,000,000 VND

**Implementation:**
```sql
ALTER TABLE wallet_ledger
ADD COLUMN credit_limit BIGINT DEFAULT 0,
ADD COLUMN is_credit_enabled BOOLEAN DEFAULT false;
```

**Logic:**
```javascript
// Khi deduct
const effectiveBalance = balance.current_balance + balance.credit_limit;
if (effectiveBalance < amount) {
    throw new Error(`Vượt hạn mức. Còn lại: ${effectiveBalance}`);
}
```

### 4. Wallet Transfer Between Customers

**Use case:** Customer A chuyển 100k cho Customer B (gift)

**API:**
```javascript
POST /api/wallet/transfer
{
    "fromPhone": "0901111111",
    "toPhone": "0902222222",
    "amount": 100000,
    "note": "Tặng bạn"
}
```

**Backend:**
```javascript
await db.transaction(async (trx) => {
    // Deduct from A
    await createTransaction(trx, {
        phone: fromPhone,
        type: 'TRANSFER_OUT',
        amount: -amount
    });

    // Add to B
    await createTransaction(trx, {
        phone: toPhone,
        type: 'TRANSFER_IN',
        amount: +amount,
        source_reference: `Từ ${fromPhone}`
    });
});
```

### 5. Multi-Currency (VND + USD)

**Use case:** Khách nước ngoài nạp USD, tự động quy đổi VND

**Database:**
```sql
ALTER TABLE wallet_ledger
ADD COLUMN balance_usd DECIMAL(20,2) DEFAULT 0;

ALTER TABLE wallet_transactions
ADD COLUMN currency VARCHAR(3) DEFAULT 'VND',
ADD COLUMN exchange_rate DECIMAL(10,4);
```

### 6. Analytics Dashboard

**Metrics:**
- Top 10 customers by wallet balance
- Daily deposit/deduction trend
- Average wallet lifetime value
- Churn prediction (customers not using wallet)

**Chart library:** Chart.js hoặc ApexCharts

---

## 🎯 SUCCESS METRICS

### Functional Requirements:
- [ ] Balance tính chính xác 100% (deposits + refunds - deductions)
- [ ] Timeline load < 2s cho 1000 events
- [ ] Search autocomplete < 500ms
- [ ] Zero data loss khi concurrent updates

### User Experience:
- [ ] CSKH workflow: Tra KH + Xem ví + Map giao dịch < 1 phút
- [ ] Sale workflow: Check balance trước order < 30 giây
- [ ] Mobile responsive (tablet 768px+)

### Code Quality:
- [ ] Không file > 300 lines
- [ ] API response < 200ms (P90)
- [ ] Test coverage > 60% cho wallet-api.js
- [ ] Zero code duplication với balance-history

---

## 📝 CRITICAL FILES TO CREATE/MODIFY

### Tạo Mới (MVP):

**Priority P0 (Week 1):**
1. `render.com/migrations/create_wallet_tables.sql` - Database schema
2. `render.com/routes/wallet.routes.js` - Backend API
3. `customer-wallet/index.html` - Main UI structure
4. `customer-wallet/modules/customer-search.js` - Search logic
5. `customer-wallet/services/wallet-api.js` - API client

**Priority P1 (Week 2-3):**
6. `customer-wallet/modules/timeline-renderer.js` - Timeline UI
7. `customer-wallet/modules/wallet-balance.js` - Balance display
8. `customer-wallet/modules/note-manager.js` - Notes CRUD
9. `customer-wallet/modules/transaction-linker.js` - Map transactions
10. `customer-wallet/IMPLEMENTATION_GUIDE.md` - Documentation

### Extract to Shared:

11. `js/qr-generator.js` - From balance-history/qr-generator.js
12. `js/notification-manager.js` - From balance-history/notification-system.js
13. `js/cache-manager.js` - From balance-history/cache.js

### Modify Existing:

14. `balance-history/main.js` - Add "Link to Wallet" button (5 lines)
15. `issue-tracking/script.js` - Add "Refund to Wallet" checkbox (15 lines)
16. `customer-management/main.js` - Add "Xem Ví" link (3 lines)
17. `js/navigation-modern.js` - Add customer-wallet to MENU_CONFIG
18. `balance-history/customer-info.js` - Refactor to use shared customer-mapper (future)

---

## ⚠️ RISKS & MITIGATION

### Risk 1: Data Inconsistency (Balance Drift)
**Vấn đề:** Balance tính từ 3 nguồn có thể sai lệch
**Giải pháp:**
- Daily cron job reconciliation (so sánh wallet_ledger.current_balance vs. SUM(transactions))
- Admin dashboard hiển thị discrepancies
- Database trigger tự động update wallet_ledger khi insert transaction

### Risk 2: Performance với Timeline dài
**Vấn đề:** Customer có 10,000+ events → Load chậm
**Giải pháp:**
- Pagination: 50 events/page
- Lazy load khi scroll
- Cache timeline 5 phút (Redis hoặc PostgreSQL materialized view)

### Risk 3: Concurrent Transaction Conflicts
**Vấn đề:** 2 user cùng deduct wallet → Race condition
**Giải pháp:**
- Database row-level lock: `FOR UPDATE` trong transaction
- Retry logic với exponential backoff
- Transaction isolation: SERIALIZABLE

### Risk 4: Customer Phone Number Change
**Vấn đề:** SĐT là primary key nhưng KH đổi số
**Giải pháp:**
- Add `tpos_id` làm secondary identifier
- Workflow chuyển ví: Old phone → New phone (với approval)
- Audit log mọi phone change

---

## 🎓 LESSONS LEARNED FROM EXISTING MODULES

### Từ balance-history (2,493 lines main.js):
- ❌ **Tránh:** Monolithic file, tất cả logic trong 1 file
- ✅ **Áp dụng:** Tách modules, mỗi file < 300 lines
- ✅ **Reuse:** QRGenerator, CustomerInfoManager, CacheManager

### Từ issue-tracking (1,102 lines script.js):
- ✅ **Áp dụng:** Dual-mode storage (Firebase + PostgreSQL fallback)
- ✅ **Áp dụng:** Clear status flow (PENDING → COMPLETED)
- ❌ **Tránh:** Global variables cho state (dùng class-based state)

### Từ customer-management (IndexedDB cache):
- ✅ **Áp dụng:** Offline-first với cache
- ❌ **Tránh:** 80,000 records in-memory (dùng pagination + API)

---

## 🚢 DEPLOYMENT CHECKLIST

### Pre-launch:
- [ ] Database migrations chạy thành công trên production
- [ ] API endpoints test với real data (staging)
- [ ] Permission check: Only CSKH + Sales access customer-wallet
- [ ] Mobile testing trên tablet (iPad Air)
- [ ] Cross-browser: Chrome, Edge, Safari

### Launch:
- [ ] Deploy backend to Render.com
- [ ] Deploy frontend (customer-wallet/) to GitHub Pages
- [ ] Update navigation-modern.js (add to MENU_CONFIG)
- [ ] Set Firebase permissions: `pagePermissions: ["customer-wallet"]`

### Post-launch:
- [ ] Monitor API logs (check for errors)
- [ ] User training: CSKH + Sales (30 min session)
- [ ] Collect feedback (Google Form hoặc in-app feedback)
- [ ] Plan Phase 2 features based on usage

---

## 📚 TÀI LIỆU THAM KHẢO

### Existing Docs:
- `balance-history/IMPLEMENTATION_GUIDE.md` - SePay integration, QR generation
- `issue-tracking/business_flow_documentation.md` - Issue tracking workflow
- `docs/plans/PRD_Purchase_Orders_Page.md` - UI/UX patterns
- `docs/api-docs/TECH_SPEC_Firebase.md` - Firebase structure

### External:
- [PostgreSQL Row-Level Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [VietQR API](https://vietqr.io/)
- [SePay Webhook Docs](https://docs.sepay.vn/)

---

## ✅ NEXT STEPS

1. **Review kế hoạch này** với stakeholders (Product Owner, Tech Lead)
2. **Tạo Jira/Trello board** với tasks từ roadmap
3. **Kickoff meeting** (1 hour):
   - Giới thiệu architecture
   - Q&A về technical approach
   - Phân công tasks
4. **Start Week 1** - Database + Backend API
5. **Daily standup** (15 min) để track progress

---

## 📊 PHÂN TÍCH CODEBASE HIỆN TẠI (Context)

### 1. balance-history Module (8,303+ lines tổng)
**Điểm mạnh:**
- QR Generator hoàn chỉnh với VietQR integration
- Customer mapping theo SĐT (Section 10)
- Gap detection cho missing transactions
- Realtime SSE updates từ SePay webhook
- Dual storage (Firebase + PostgreSQL)

**Điểm yếu:**
- main.js monolithic (2,493 lines, 39 functions, 6 features)
- Không có component architecture
- Khó reuse specific features

### 2. issue-tracking Module (1,102 lines script.js)
**Điểm mạnh:**
- Tab-based UI (4 tabs: all, pending-goods, pending-finance, completed)
- 53 well-organized functions
- Reconciliation workflow với Excel import
- Clear business flow: Boom/Return → PENDING_GOODS → PENDING_FINANCE → COMPLETED

**Điểm yếu:**
- Global variables cho state management

### 3. customer-management Module
**Hiện tại:**
- PostgreSQL-based với 80,000+ records
- IndexedDB cache phức tạp
- Import/Export Excel
- Sync từ TPOS OData API
- Admin-only access

**Use case khác biệt:**
- Database management (not transaction tracking)
- Bulk operations (import/export)
- Không phù hợp để làm ví realtime

### 4. navigation-modern.js (3,310 lines)
- 21 pages trong MENU_CONFIG
- Permission-based access control
- Mobile + Desktop responsive
- Dễ thêm page mới

---

## 🔍 SO SÁNH KIẾN TRÚC

### Option A: Separate Page (✅ CHOSEN)
**Pros:**
- Independent development
- Clear separation of concerns
- Dễ test và maintain
- Không ảnh hưởng modules cũ

**Cons:**
- Phải duplicate một số logic (search, mapping)
- Context switching giữa pages

### Option B: Tab trong balance-history (❌ REJECTED)
**Pros:**
- Reuse balance-history logic
- Ít code duplication

**Cons:**
- balance-history đã quá lớn (2,493 lines main.js)
- Ví và balance-history có use case khác nhau
- Khó maintain khi gộp chung

### Option C: Refactor customer-management (❌ REJECTED)
**Pros:**
- Có sẵn customer database
- Single source of truth

**Cons:**
- customer-management phục vụ use case khác (bulk management)
- 80,000 records không phù hợp realtime tracking
- Risk cao khi refactor module quan trọng

---

> **Lưu ý:** Kế hoạch này được thiết kế cho MVP trong 2-3 tuần. Các tính năng Phase 2 (TPOS deduction, approval workflow, etc.) đã được document đầy đủ để implement sau khi MVP stable.

**Người tạo kế hoạch:** Claude Sonnet 4.5
**Ngày:** 2026-01-04
**Version:** 1.0 (MVP Focus)
**Status:** Ready for Implementation
