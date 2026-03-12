# QR Code & Debt Management Flow

Tài liệu chi tiết về flow tạo mã QR, trích xuất mã từ nội dung giao dịch, và quản lý công nợ khách hàng.

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Tạo mã QR (QR Generation)](#2-tạo-mã-qr-qr-generation)
3. [Trích xuất mã QR từ nội dung giao dịch](#3-trích-xuất-mã-qr-từ-nội-dung-giao-dịch)
4. [Mapping và lưu công nợ](#4-mapping-và-lưu-công-nợ)
5. [Flow chi tiết End-to-End](#5-flow-chi-tiết-end-to-end)
6. [Database Schema](#6-database-schema)
7. [API Endpoints](#7-api-endpoints)
8. [Các chức năng chính](#8-các-chức-năng-chính)

---

## 1. Tổng quan hệ thống

### 1.1 Kiến trúc hệ thống

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │     │  Cloudflare      │     │   Render.com    │
│ (balance-history)│────▶│  Worker (Proxy)  │────▶│  Backend API    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │   PostgreSQL    │
                                                 │   Database      │
                                                 └─────────────────┘
                                                          ▲
┌─────────────────┐     ┌──────────────────┐              │
│   Ngân hàng     │     │     SePay        │              │
│   (ACB, VCB...) │────▶│   Webhook        │──────────────┘
└─────────────────┘     └──────────────────┘
```

### 1.2 Luồng dữ liệu chính

1. **Tạo QR** → Frontend tạo mã QR với unique code (N2...)
2. **Liên kết khách hàng** → Lưu mapping giữa mã QR và SĐT khách hàng
3. **Chuyển tiền** → Khách quét QR và chuyển tiền vào tài khoản
4. **Webhook** → SePay gửi thông báo giao dịch về backend
5. **Trích xuất mã** → Backend extract mã N2... từ nội dung chuyển khoản
6. **Cập nhật công nợ** → Tự động cộng tiền vào công nợ của khách hàng

---

## 2. Tạo mã QR (QR Generation)

### 2.1 File xử lý
- **File**: `balance-history/qr-generator.js`
- **Object**: `window.QRGenerator`

### 2.2 Cấu hình ngân hàng

```javascript
BANK_CONFIG: {
    ACB: {
        bin: '970416',           // Mã BIN ngân hàng ACB
        name: 'ACB',
        accountNo: '75918',      // Số tài khoản nhận tiền
        accountName: 'LAI THUY YEN NHI'  // Tên chủ tài khoản
    }
}
```

### 2.3 Tạo Unique Code

**Format**: `N2` + 16 ký tự alphanumeric = **18 ký tự cố định**

```javascript
generateUniqueCode(prefix = 'N2') {
    // Timestamp: 8 ký tự (base36 encoded)
    const timestamp = Date.now().toString(36).toUpperCase().slice(-8);

    // Random: 6 ký tự
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Sequence: 2 ký tự (0-1295 → base36)
    const sequence = Math.floor(Math.random() * 1296)
                     .toString(36).toUpperCase().padStart(2, '0');

    return `${prefix}${timestamp}${random}${sequence}`;
    // Kết quả: "N2ABCD1234EFGH5678" (18 ký tự)
}
```

**Ví dụ mã được tạo**:
- `N2M5K8H2P9Q3R7T1AB`
- `N2X7Y9Z1A2B3C4D5EF`
- `N2L0K9J8H7G6F5E4DC`

### 2.4 Tạo URL QR VietQR

```javascript
generateVietQRUrl(options = {}) {
    const { uniqueCode, amount = 0, template = 'qr_only' } = options;

    const baseUrl = 'https://img.vietqr.io/image';

    // Format: {BANK_BIN}-{ACCOUNT_NO}-{TEMPLATE}.png
    let url = `${baseUrl}/970416-75918-${template}.png`;

    // Query params
    const params = new URLSearchParams();
    if (amount > 0) params.append('amount', amount);
    params.append('addInfo', uniqueCode);  // Nội dung chuyển khoản
    params.append('accountName', 'LAI THUY YEN NHI');

    return `${url}?${params.toString()}`;
}
```

**URL mẫu**:
```
https://img.vietqr.io/image/970416-75918-qr_only.png?amount=500000&addInfo=N2ABCD1234EFGH5678&accountName=LAI%20THUY%20YEN%20NHI
```

### 2.5 Templates QR hỗ trợ

| Template | Mô tả |
|----------|-------|
| `qr_only` | Chỉ hiển thị mã QR (mặc định, ẩn số tài khoản) |
| `compact` | QR nhỏ gọn với thông tin cơ bản |
| `compact2` | QR nhỏ gọn dạng 2 |
| `print` | Dành cho in ấn, kích thước lớn |

### 2.6 Các function chính

| Function | Mô tả |
|----------|-------|
| `generateUniqueCode(prefix)` | Tạo mã unique 18 ký tự |
| `generateVietQRUrl(options)` | Tạo URL ảnh QR từ VietQR |
| `generateDepositQR(amount)` | Tạo QR mới với đầy đủ thông tin |
| `regenerateQR(uniqueCode, amount)` | Tạo lại QR từ mã có sẵn |
| `downloadQRImage(qrUrl, filename)` | Tải ảnh QR về máy |
| `copyQRUrl(qrUrl)` | Copy URL QR vào clipboard |
| `copyUniqueCode(uniqueCode)` | Copy mã unique vào clipboard |
| `createQRHtml(qrUrl, options)` | Tạo HTML element hiển thị QR |

---

## 3. Trích xuất mã QR từ nội dung giao dịch

### 3.1 File xử lý
- **File**: `render.com/routes/sepay-webhook.js`
- **Function**: `processDebtUpdate(db, transactionId)`

### 3.2 Quy trình trích xuất

Khi ngân hàng gửi webhook về, nội dung giao dịch (`content`) sẽ chứa mã QR mà khách hàng đã quét.

**Ví dụ nội dung giao dịch**:
```
"content": "CT DEN:0123456789 ND:N2M5K8H2P9Q3R7T1AB NGUYEN VAN A CK"
```

### 3.3 Regex Pattern trích xuất

```javascript
// Pattern: N2 + 16 ký tự alphanumeric (A-Z, 0-9)
const qrMatch = content.toUpperCase().match(/N2[A-Z0-9]{16}/);

if (qrMatch) {
    const qrCode = qrMatch[0];  // "N2M5K8H2P9Q3R7T1AB"
}
```

**Giải thích pattern**:
- `N2` - Prefix cố định để nhận diện mã của hệ thống
- `[A-Z0-9]` - Ký tự chữ in hoa hoặc số
- `{16}` - Chính xác 16 ký tự sau prefix

### 3.4 Code trích xuất đầy đủ

```javascript
async function processDebtUpdate(db, transactionId) {
    // 1. Lấy thông tin giao dịch
    const txResult = await db.query(
        `SELECT id, content, transfer_amount, transfer_type, debt_added
         FROM balance_history WHERE id = $1`,
        [transactionId]
    );
    const tx = txResult.rows[0];

    // 2. Kiểm tra đã xử lý chưa
    if (tx.debt_added === true) {
        return { success: false, reason: 'Already processed' };
    }

    // 3. Chỉ xử lý giao dịch tiền VÀO
    if (tx.transfer_type !== 'in') {
        return { success: false, reason: 'Not incoming transaction' };
    }

    // 4. Trích xuất mã QR từ content
    const content = tx.content || '';
    const qrMatch = content.toUpperCase().match(/N2[A-Z0-9]{16}/);

    if (!qrMatch) {
        return { success: false, reason: 'No QR code found' };
    }

    const qrCode = qrMatch[0];
    // Tiếp tục xử lý mapping...
}
```

---

## 4. Mapping và lưu công nợ

### 4.1 Bảng mapping: `balance_customer_info`

Lưu trữ liên kết giữa mã QR và thông tin khách hàng.

```sql
CREATE TABLE balance_customer_info (
    id SERIAL PRIMARY KEY,
    unique_code VARCHAR(50) UNIQUE NOT NULL,  -- Mã QR (N2...)
    customer_name VARCHAR(255),               -- Tên khách hàng
    customer_phone VARCHAR(50),               -- SĐT khách hàng
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 Quy trình lưu mapping (Frontend)

**File**: `balance-history/customer-info.js`

```javascript
// Khi user nhập thông tin khách hàng cho mã QR
await CustomerInfoManager.saveCustomerInfo(uniqueCode, {
    name: 'Nguyễn Văn A',
    phone: '0901234567'
});
```

**Luồng lưu**:
1. Lưu vào `localStorage` (offline support)
2. Gọi API `POST /api/sepay/customer-info` lưu vào PostgreSQL
3. Sync lên Firebase (nếu có) để đồng bộ với Customer Hub

### 4.3 Quy trình cập nhật công nợ (Backend)

**Khi có giao dịch mới chứa mã QR**:

```javascript
// 5. Tìm SĐT từ mã QR
const infoResult = await db.query(
    `SELECT customer_phone FROM balance_customer_info
     WHERE UPPER(unique_code) = $1`,
    [qrCode]
);

if (!infoResult.rows[0]?.customer_phone) {
    return { success: false, reason: 'No phone linked to QR code' };
}

const phone = infoResult.rows[0].customer_phone;
const amount = parseInt(tx.transfer_amount) || 0;

// 6. Cập nhật công nợ khách hàng (UPSERT)
const updateResult = await db.query(
    `INSERT INTO customers (phone, name, debt, status, active)
     VALUES ($1, $1, $2, 'Bình thường', true)
     ON CONFLICT (phone) DO UPDATE SET
         debt = COALESCE(customers.debt, 0) + $2,
         updated_at = CURRENT_TIMESTAMP
     RETURNING id, phone, debt`,
    [phone, amount]
);

// 7. Đánh dấu giao dịch đã xử lý
await db.query(
    `UPDATE balance_history SET debt_added = TRUE WHERE id = $1`,
    [transactionId]
);
```

### 4.4 Logic tính công nợ

**Có 2 trường hợp**:

#### Trường hợp 1: Admin CHƯA điều chỉnh công nợ
```
Tổng công nợ = SUM(tất cả giao dịch từ các mã QR của khách)
```

#### Trường hợp 2: Admin ĐÃ điều chỉnh công nợ
```
Tổng công nợ = Công nợ baseline (do admin set)
             + SUM(giao dịch SAU thời điểm điều chỉnh)
```

**Code logic**:

```javascript
// GET /api/sepay/debt-summary

// 1. Lấy thông tin khách hàng
const customerResult = await db.query(
    `SELECT debt, debt_adjusted_at FROM customers WHERE phone = $1`,
    [phone]
);
const customerDebt = customerResult.rows[0]?.debt || 0;
const debtAdjustedAt = customerResult.rows[0]?.debt_adjusted_at;

// 2. Tìm tất cả mã QR của khách
const qrResult = await db.query(
    `SELECT unique_code FROM balance_customer_info WHERE customer_phone = $1`,
    [phone]
);
const qrCodes = qrResult.rows.map(r => r.unique_code.toUpperCase());

// 3. Tính tổng giao dịch
// ... (query balance_history với các mã QR)

// 4. Tính công nợ cuối cùng
let totalDebt;
if (debtAdjustedAt) {
    // Admin đã điều chỉnh: baseline + giao dịch mới
    totalDebt = customerDebt + transactionsAfterAdjustment;
    source = 'admin_adjusted_plus_new';
} else if (qrCodes.length > 0) {
    // Chưa điều chỉnh: tổng tất cả giao dịch
    totalDebt = allTransactionsTotal;
    source = 'balance_history';
} else {
    // Không có mã QR: dùng giá trị trong bảng customers
    totalDebt = customerDebt;
    source = 'customers_table';
}
```

---

## 5. Flow chi tiết End-to-End

### 5.1 Sơ đồ luồng hoàn chỉnh

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 1: TẠO MÃ QR                                │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐    generateDepositQR()    ┌──────────────────┐
    │   Frontend   │ ────────────────────────▶ │   QRGenerator    │
    │   User UI    │                           │                  │
    └──────────────┘                           └──────────────────┘
                                                        │
                                                        ▼
                                               ┌──────────────────┐
                                               │ Unique Code:     │
                                               │ N2M5K8H2P9Q3R7T1 │
                                               │                  │
                                               │ QR URL:          │
                                               │ https://img.     │
                                               │ vietqr.io/...    │
                                               └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 2: LIÊN KẾT KHÁCH HÀNG                           │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐    saveCustomerInfo()     ┌──────────────────┐
    │   User nhập  │ ────────────────────────▶ │ CustomerInfo     │
    │   Tên, SĐT   │                           │ Manager          │
    └──────────────┘                           └──────────────────┘
                                                        │
                              ┌──────────────────────────┼───────────────────┐
                              ▼                         ▼                    ▼
                     ┌──────────────┐         ┌──────────────┐      ┌──────────────┐
                     │ localStorage │         │  PostgreSQL  │      │   Firebase   │
                     │ (offline)    │         │  (primary)   │      │   (sync)     │
                     └──────────────┘         └──────────────┘      └──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 3: KHÁCH CHUYỂN TIỀN                            │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐      Quét QR        ┌──────────────────┐
    │   Khách hàng │ ──────────────────▶ │   App Ngân hàng  │
    │   (Mobile)   │                     │   (VCB, ACB...)  │
    └──────────────┘                     └──────────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │   Chuyển khoản   │
                                         │   Số tiền: 500K  │
                                         │   ND: N2M5K8...  │
                                         └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 4: NHẬN WEBHOOK                                │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐                     ┌──────────────────┐
    │   Ngân hàng  │ ──────────────────▶ │      SePay       │
    │              │   Thông báo GD      │                  │
    └──────────────┘                     └──────────────────┘
                                                  │
                                                  ▼  POST /api/sepay/webhook
                                         ┌──────────────────┐
                                         │  Cloudflare      │
                                         │  Worker (Proxy)  │
                                         └──────────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │  Render.com      │
                                         │  Backend API     │
                                         └──────────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │  balance_history │
                                         │  (Lưu giao dịch) │
                                         └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 5: TRÍCH XUẤT & CẬP NHẬT CÔNG NỢ                   │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────┐
    │                     processDebtUpdate(db, transactionId)             │
    └──────────────────────────────────────────────────────────────────────┘
                                        │
         ┌──────────────────────────────┼──────────────────────────────┐
         ▼                              ▼                              ▼
    ┌──────────────┐           ┌──────────────────┐           ┌──────────────┐
    │ 1. Lấy GD    │           │ 2. Extract QR    │           │ 3. Tìm SĐT   │
    │ từ balance_  │──────────▶│ /N2[A-Z0-9]{16}/ │──────────▶│ từ customer  │
    │ history      │           │                  │           │ _info        │
    └──────────────┘           └──────────────────┘           └──────────────┘
                                                                      │
                                                                      ▼
                                                              ┌──────────────┐
                                                              │ 4. UPSERT    │
                                                              │ customers    │
                                                              │ table        │
                                                              │ (debt += amt)│
                                                              └──────────────┘
                                                                      │
                                                                      ▼
                                                              ┌──────────────┐
                                                              │ 5. Đánh dấu  │
                                                              │ debt_added   │
                                                              │ = TRUE       │
                                                              └──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 6: REALTIME UPDATE                              │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐                          ┌──────────────────┐
    │   Backend SSE    │ ────────────────────────▶│   Frontend       │
    │   Broadcast      │   Server-Sent Events     │   Balance UI     │
    └──────────────────┘                          └──────────────────┘
                                                          │
                                                          ▼
                                                  ┌──────────────────┐
                                                  │  Hiển thị GD mới │
                                                  │  Cập nhật thống  │
                                                  │  kê realtime     │
                                                  └──────────────────┘
```

### 5.2 Sequence Diagram

```
┌────────┐ ┌───────────┐ ┌─────────┐ ┌────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐
│Frontend│ │CustomerMgr│ │PostgreSQL│ │Ngân hàng│ │  SePay  │ │  Backend │ │  Frontend  │
└───┬────┘ └─────┬─────┘ └────┬────┘ └────┬────┘ └────┬────┘ └─────┬────┘ └──────┬─────┘
    │            │            │           │           │            │             │
    │ 1. Tạo QR  │            │           │           │            │             │
    │───────────▶│            │           │           │            │             │
    │◀───────────│            │           │           │            │             │
    │ QR + Code  │            │           │           │            │             │
    │            │            │           │           │            │             │
    │ 2. Liên kết│            │           │           │            │             │
    │───────────▶│            │           │           │            │             │
    │            │ 3. Lưu     │           │           │            │             │
    │            │───────────▶│           │           │            │             │
    │            │            │           │           │            │             │
    │            │            │           │ 4. Quét   │            │             │
    │            │            │           │ QR & CK   │            │             │
    │            │            │           │───────────│            │             │
    │            │            │           │           │ 5. Webhook │             │
    │            │            │           │           │───────────▶│             │
    │            │            │           │           │            │             │
    │            │            │           │           │            │ 6. Lưu GD   │
    │            │            │◀──────────────────────────────────│             │
    │            │            │           │           │            │             │
    │            │            │           │           │            │ 7. Extract  │
    │            │            │           │           │            │    QR code  │
    │            │            │           │           │            │             │
    │            │            │ 8. Lookup │           │            │             │
    │            │            │◀──────────────────────────────────│             │
    │            │            │           │           │            │             │
    │            │            │ 9. Update │           │            │             │
    │            │            │    debt   │           │            │             │
    │            │            │◀──────────────────────────────────│             │
    │            │            │           │           │            │             │
    │            │            │           │           │            │ 10. SSE     │
    │            │            │           │           │            │────────────▶│
    │            │            │           │           │            │             │
```

---

## 6. Database Schema

### 6.1 Bảng `balance_history`

Lưu tất cả giao dịch từ SePay webhook.

```sql
CREATE TABLE balance_history (
    id SERIAL PRIMARY KEY,

    -- SePay data
    sepay_id INTEGER UNIQUE NOT NULL,        -- ID giao dịch từ SePay
    gateway VARCHAR(100) NOT NULL,           -- Ngân hàng (ACB, VCB...)
    transaction_date TIMESTAMP NOT NULL,     -- Thời gian giao dịch
    account_number VARCHAR(50) NOT NULL,     -- Số tài khoản
    code VARCHAR(100),                       -- Mã giao dịch ngân hàng
    content TEXT,                            -- ⭐ Nội dung chứa mã QR
    transfer_type VARCHAR(10) NOT NULL,      -- 'in' hoặc 'out'
    transfer_amount BIGINT NOT NULL,         -- Số tiền
    accumulated BIGINT NOT NULL,             -- Số dư sau GD
    sub_account VARCHAR(100),
    reference_code VARCHAR(100),
    description TEXT,

    -- Debt tracking
    debt_added BOOLEAN DEFAULT FALSE,        -- ⭐ Đã cộng vào công nợ chưa

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    webhook_received_at TIMESTAMP,
    raw_data JSONB
);
```

### 6.2 Bảng `balance_customer_info`

Mapping giữa mã QR và thông tin khách hàng.

```sql
CREATE TABLE balance_customer_info (
    id SERIAL PRIMARY KEY,
    unique_code VARCHAR(50) UNIQUE NOT NULL,  -- ⭐ Mã QR (N2...)
    customer_name VARCHAR(255),               -- Tên khách
    customer_phone VARCHAR(50),               -- ⭐ SĐT để lookup công nợ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.3 Bảng `customers`

Thông tin và công nợ khách hàng.

```sql
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(50) UNIQUE NOT NULL,        -- ⭐ SĐT (primary key thực tế)
    name VARCHAR(255),
    debt DECIMAL(15,2) DEFAULT 0,             -- ⭐ Tổng công nợ
    debt_adjusted_at TIMESTAMP,               -- ⭐ Thời điểm admin điều chỉnh
    status VARCHAR(50) DEFAULT 'Bình thường',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.4 Bảng `debt_adjustment_log`

Log các lần admin điều chỉnh công nợ thủ công.

```sql
CREATE TABLE debt_adjustment_log (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(50) NOT NULL,
    old_debt DECIMAL(15,2),
    new_debt DECIMAL(15,2),
    change_amount DECIMAL(15,2),
    reason TEXT,
    adjusted_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.5 Relationships

```
balance_history.content ──extract──▶ N2... code
                                         │
                                         ▼
balance_customer_info.unique_code ◀──────┘
         │
         │ lookup
         ▼
balance_customer_info.customer_phone
         │
         │ FK reference
         ▼
customers.phone ──▶ customers.debt
```

---

## 7. API Endpoints

### 7.1 Webhook Endpoint

#### `POST /api/sepay/webhook`

Nhận giao dịch mới từ SePay.

**Headers**:
```
Authorization: Apikey {SEPAY_API_KEY}
Content-Type: application/json
```

**Request Body**:
```json
{
    "id": 92704,
    "gateway": "ACB",
    "transactionDate": "2024-01-15 14:02:37",
    "accountNumber": "75918",
    "code": null,
    "content": "CT DEN:0123456789 ND:N2M5K8H2P9Q3R7T1AB NGUYEN VAN A CK",
    "transferType": "in",
    "transferAmount": 500000,
    "accumulated": 19077000,
    "subAccount": null,
    "referenceCode": "MBVCB.3278907687",
    "description": ""
}
```

**Response**:
```json
{
    "success": true,
    "id": 123,
    "message": "Transaction recorded successfully",
    "processing_time_ms": 45
}
```

### 7.2 Customer Info Endpoints

#### `POST /api/sepay/customer-info`

Lưu/cập nhật mapping QR → khách hàng.

**Request**:
```json
{
    "uniqueCode": "N2M5K8H2P9Q3R7T1AB",
    "customerName": "Nguyễn Văn A",
    "customerPhone": "0901234567"
}
```

#### `GET /api/sepay/customer-info`

Lấy tất cả mapping đã lưu.

### 7.3 Debt Summary Endpoints

#### `GET /api/sepay/debt-summary?phone={phone}`

Lấy tổng công nợ của 1 khách hàng.

**Response**:
```json
{
    "success": true,
    "data": {
        "phone": "0901234567",
        "total_debt": 1500000,
        "baseline_debt": null,
        "new_transactions": null,
        "debt_adjusted_at": null,
        "transactions": [
            {
                "id": 123,
                "amount": 500000,
                "date": "2024-01-15T14:02:37",
                "content": "N2M5K8H2P9Q3R7T1AB",
                "debt_added": true
            }
        ],
        "transaction_count": 3,
        "source": "balance_history"
    }
}
```

#### `POST /api/sepay/debt-summary-batch`

Lấy công nợ nhiều khách hàng cùng lúc (tối ưu performance).

**Request**:
```json
{
    "phones": ["0901234567", "0912345678", "0923456789"]
}
```

**Response**:
```json
{
    "success": true,
    "data": {
        "901234567": { "total_debt": 1500000, "source": "balance_history" },
        "912345678": { "total_debt": 0, "source": "no_data" },
        "923456789": { "total_debt": 800000, "source": "admin_adjusted_plus_new" }
    }
}
```

### 7.4 History & Statistics

#### `GET /api/sepay/history`

Lấy lịch sử giao dịch với filter & pagination.

**Query params**:
- `page` - Số trang (default: 1)
- `limit` - Số records/trang (default: 50)
- `type` - 'in' hoặc 'out'
- `gateway` - Tên ngân hàng
- `startDate`, `endDate` - Khoảng thời gian
- `search` - Tìm trong content

#### `GET /api/sepay/statistics`

Lấy thống kê tổng hợp.

#### `GET /api/sepay/stream`

Server-Sent Events endpoint cho realtime updates.

---

## 8. Các chức năng chính

### 8.1 Frontend Features

| Chức năng | Mô tả | File |
|-----------|-------|------|
| **Tạo mã QR** | Generate mã unique + URL QR VietQR | `qr-generator.js` |
| **Liên kết khách hàng** | Lưu mapping QR → SĐT/Tên | `customer-info.js` |
| **Xem lịch sử** | Bảng giao dịch với filter, pagination | `main.js` |
| **Tìm kiếm** | Search theo content, mã, ngày | `main.js` |
| **Thống kê** | Tổng tiền vào/ra, số dư | `main.js` |
| **Realtime update** | SSE nhận giao dịch mới ngay | `main.js` |
| **Quick date filters** | Hôm nay, 7 ngày, tháng này... | `main.js` |
| **Copy/Download QR** | Tiện ích làm việc với QR | `qr-generator.js` |
| **Offline support** | Cache + localStorage | `cache.js`, `customer-info.js` |

### 8.2 Backend Features

| Chức năng | Mô tả | File |
|-----------|-------|------|
| **Webhook handler** | Nhận & validate webhook SePay | `sepay-webhook.js` |
| **Auto debt update** | Tự động cộng công nợ | `processDebtUpdate()` |
| **Duplicate prevention** | Bỏ qua GD trùng (ON CONFLICT) | `sepay-webhook.js` |
| **Debt calculation** | Tính công nợ (baseline + new) | `/debt-summary` |
| **Batch lookup** | Tra cứu nhiều SĐT 1 lần | `/debt-summary-batch` |
| **Webhook logging** | Log tất cả request để debug | `sepay_webhook_logs` |
| **SSE broadcast** | Push realtime updates | `broadcastBalanceUpdate()` |

### 8.3 Tính năng bảo mật

| Tính năng | Mô tả |
|-----------|-------|
| **API Key Auth** | Xác thực webhook bằng SePay API key |
| **Atomic operations** | ON CONFLICT để tránh race condition |
| **Input validation** | Validate required fields, transfer_type |
| **Phone normalization** | Chuẩn hóa SĐT (bỏ +84, 0 đầu) |
| **Idempotency** | `debt_added` flag tránh cộng trùng |

### 8.4 Tính năng sync

| Tính năng | Mô tả |
|-----------|-------|
| **Multi-storage** | localStorage + PostgreSQL + Firebase |
| **Offline-first** | Lưu local trước, sync sau |
| **Firebase sync** | Đồng bộ với Customer Hub (customer-hub) |
| **Realtime SSE** | Push updates tới tất cả clients |

---

## Phụ lục: Quick Reference

### Mã QR Format
```
N2 + [A-Z0-9]{16} = 18 ký tự
Ví dụ: N2ABCD1234EFGH5678
```

### Regex Extract
```javascript
/N2[A-Z0-9]{16}/
```

### VietQR URL Format
```
https://img.vietqr.io/image/{BANK_BIN}-{ACCOUNT}-{TEMPLATE}.png
    ?amount={AMOUNT}
    &addInfo={UNIQUE_CODE}
    &accountName={NAME}
```

### Debt Calculation
```
IF (debt_adjusted_at exists)
    total = baseline + sum(tx AFTER adjusted_at)
ELSE
    total = sum(ALL tx from QR codes)
```

### Key Database Fields
```
balance_history.content      → Chứa mã QR
balance_history.debt_added   → Đã xử lý chưa
balance_customer_info.unique_code    → Mã QR
balance_customer_info.customer_phone → SĐT
customers.debt               → Tổng công nợ
customers.debt_adjusted_at   → Thời điểm điều chỉnh
```

---

*Tài liệu cập nhật: 2024-12-26*
