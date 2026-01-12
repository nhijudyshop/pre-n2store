# BALANCE HISTORY - COMPLETE SPECIFICATION
## Tài liệu Đặc tả Toàn diện cho AI Agent

> **Mục đích**: Tài liệu này cung cấp đặc tả hoàn chỉnh về nghiệp vụ, kỹ thuật và cấu trúc code để AI Agent có thể đọc hiểu toàn bộ hệ thống và thực hiện tối ưu hoặc phát triển tiếp.

---

## MỤC LỤC

1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Kiến Trúc Kỹ Thuật](#2-kiến-trúc-kỹ-thuật)
3. [Database Schema](#3-database-schema)
4. [Business Logic - Nghiệp Vụ](#4-business-logic---nghiệp-vụ)
5. [API Endpoints](#5-api-endpoints)
6. [Frontend Components](#6-frontend-components)
7. [Code Index - Chi Tiết Các File](#7-code-index---chi-tiết-các-file)
8. [Flow Diagrams](#8-flow-diagrams)
9. [Cấu Hình & Environment](#9-cấu-hình--environment)
10. [Dependencies & Libraries](#10-dependencies--libraries)

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mô tả
Balance History là hệ thống theo dõi lịch sử biến động số dư tài khoản ngân hàng, tích hợp với SePay webhook để nhận thông báo giao dịch realtime. Hệ thống hỗ trợ:
- Tạo mã QR chuyển khoản với unique code
- Trích xuất thông tin khách hàng từ nội dung chuyển khoản
- Quản lý công nợ tự động
- Hiển thị lịch sử giao dịch với filter và pagination

### 1.2 Tech Stack
| Component | Technology |
|-----------|------------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (Render.com) |
| Hosting | Render.com (Backend), Cloudflare Workers (Proxy) |
| Real-time | Firebase Firestore (sync), SSE (Server-Sent Events) |
| Icons | Lucide Icons |
| Bank API | VietQR, SePay Webhook |

### 1.3 Cấu Trúc Thư Mục
```
balance-history/
├── index.html              # Giao diện chính
├── styles.css              # CSS styling (34KB)
├── modern.css              # Modern design system (29KB)
├── main.js                 # Logic chính (~3500 lines)
├── config.js               # Cấu hình API
├── auth.js                 # Authentication
├── cache.js                # Cache management
├── customer-info.js        # Customer info management
├── qr-generator.js         # QR code generation
├── notification-system.js  # Toast notifications
├── SETUP_ALL.sql           # Database schema
├── ADD_EXTRACTION_COLUMNS.sql  # Schema updates
├── DEBUG_SCRIPT.sql        # Debug queries
└── *.md                    # Documentation files
```

---

## 2. KIẾN TRÚC KỸ THUẬT

### 2.1 Architecture Diagram
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

### 2.2 Data Flow
1. **Tạo QR** → Frontend tạo mã QR với unique code (N2...)
2. **Liên kết khách hàng** → Lưu mapping QR code ↔ SĐT khách hàng
3. **Chuyển tiền** → Khách quét QR và chuyển tiền
4. **Webhook** → SePay gửi notification về backend
5. **Trích xuất mã** → Backend extract mã N2... từ nội dung
6. **Cập nhật công nợ** → Tự động cộng tiền vào công nợ khách hàng

### 2.3 Storage Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                     MULTI-LAYER STORAGE                          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: localStorage (Offline Support)                        │
│  - Key: 'balance_history_customer_info'                         │
│  - Format: {uniqueCode: {name, phone, updatedAt}}               │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: PostgreSQL (Primary Database)                         │
│  - Table: balance_customer_info                                  │
│  - Synced via API: POST /api/sepay/customer-info                │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Firebase Firestore (Cross-system sync)                │
│  - Collection: 'customers'                                       │
│  - Only updates existing customers, no creation                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. DATABASE SCHEMA

### 3.1 Table: `balance_history`
Lưu trữ tất cả giao dịch từ SePay webhook.

```sql
CREATE TABLE balance_history (
    id SERIAL PRIMARY KEY,
    sepay_id INTEGER UNIQUE NOT NULL,           -- ID từ SePay
    gateway VARCHAR(100) NOT NULL,              -- Ngân hàng (ACB, VCB...)
    transaction_date TIMESTAMP NOT NULL,        -- Thời gian giao dịch
    account_number VARCHAR(50) NOT NULL,        -- Số tài khoản
    code VARCHAR(100),                          -- Mã giao dịch
    content TEXT,                               -- Nội dung (chứa QR code)
    transfer_type VARCHAR(10) NOT NULL,         -- 'in' hoặc 'out'
    transfer_amount BIGINT NOT NULL,            -- Số tiền
    accumulated BIGINT NOT NULL,                -- Số dư sau GD
    sub_account VARCHAR(100),                   -- Tài khoản phụ
    reference_code VARCHAR(100),                -- Mã tham chiếu
    description TEXT,                           -- Mô tả
    debt_added BOOLEAN DEFAULT FALSE,           -- Đã cập nhật công nợ chưa
    is_hidden BOOLEAN DEFAULT FALSE,            -- Ẩn giao dịch
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    webhook_received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB                              -- Raw webhook payload
);

-- Indexes
CREATE INDEX idx_balance_history_sepay_id ON balance_history(sepay_id);
CREATE INDEX idx_balance_history_transaction_date ON balance_history(transaction_date DESC);
CREATE INDEX idx_balance_history_transfer_type ON balance_history(transfer_type);
CREATE INDEX idx_balance_history_gateway ON balance_history(gateway);
CREATE INDEX idx_balance_history_debt_added ON balance_history(debt_added);
```

### 3.2 Table: `balance_customer_info`
Mapping giữa QR code và thông tin khách hàng.

```sql
CREATE TABLE balance_customer_info (
    id SERIAL PRIMARY KEY,
    unique_code VARCHAR(50) UNIQUE NOT NULL,    -- Mã QR (N2... hoặc PHONE...)
    customer_name VARCHAR(255),                  -- Tên khách hàng
    customer_phone VARCHAR(50),                  -- Số điện thoại
    extraction_note VARCHAR(255),                -- Ghi chú cách trích xuất
    name_fetch_status VARCHAR(50),               -- Trạng thái fetch tên từ TPOS
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_customer_info_unique_code ON balance_customer_info(unique_code);
CREATE INDEX idx_customer_info_phone ON balance_customer_info(customer_phone);
```

### 3.3 Table: `pending_customer_matches`
Quản lý các giao dịch có nhiều khách hàng khớp (cần admin chọn).

```sql
CREATE TABLE pending_customer_matches (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES balance_history(id),
    extracted_phone VARCHAR(50) NOT NULL,       -- SĐT trích xuất được
    matched_customers JSONB NOT NULL,           -- Danh sách KH khớp
    selected_customer_id INTEGER,               -- KH được chọn
    status VARCHAR(20) DEFAULT 'pending',       -- pending/resolved/skipped
    resolution_notes TEXT,                       -- Ghi chú
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100)
);

-- JSONB format cho matched_customers:
-- [
--   {
--     "phone": "0797957828",
--     "count": 2,
--     "customers": [
--       {"id": 566098, "name": "Kim Anh Le", "phone": "0797957828"},
--       {"id": 444887, "name": "Kim Anh Le", "phone": "0797957828"}
--     ]
--   }
-- ]
```

### 3.4 Table: `sepay_webhook_logs`
Log tất cả webhook requests (debugging).

```sql
CREATE TABLE sepay_webhook_logs (
    id SERIAL PRIMARY KEY,
    sepay_id INTEGER,
    request_method VARCHAR(10),
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.5 View: `balance_statistics`
View thống kê giao dịch theo ngày.

```sql
CREATE VIEW balance_statistics AS
SELECT
    DATE(transaction_date) as date,
    gateway,
    COUNT(*) as total_transactions,
    SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE 0 END) as total_in,
    SUM(CASE WHEN transfer_type = 'out' THEN transfer_amount ELSE 0 END) as total_out,
    SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE -transfer_amount END) as net_change
FROM balance_history
GROUP BY DATE(transaction_date), gateway
ORDER BY date DESC;
```

---

## 4. BUSINESS LOGIC - NGHIỆP VỤ

### 4.1 QR Code Generation

**Format Unique Code**: `N2` + 16 ký tự alphanumeric = **18 ký tự cố định**

```javascript
// File: qr-generator.js, Function: generateUniqueCode()
generateUniqueCode(prefix = 'N2') {
    const timestamp = Date.now().toString(36).toUpperCase().slice(-8);  // 8 chars
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();  // 6 chars
    const sequence = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');  // 2 chars
    return `${prefix}${timestamp}${random}${sequence}`;  // Total: 18 chars
}
// Ví dụ output: "N2M5K8H2P9Q3R7T1AB"
```

**Bank Configuration**:
```javascript
BANK_CONFIG: {
    ACB: {
        bin: '970416',
        name: 'ACB',
        accountNo: '75918',
        accountName: 'LAI THUY YEN NHI'
    }
}
```

**VietQR URL Format**:
```
https://img.vietqr.io/image/{BIN}-{ACCOUNT}-{TEMPLATE}.png?amount={AMOUNT}&addInfo={UNIQUE_CODE}&accountName={NAME}
```

### 4.2 Phone Extraction Logic

**Priority Order**:
1. **QR Code** (N2 + 16 chars) - Highest priority
2. **MOMO Pattern** - Momo transfers
3. **VCB Pattern** - Vietcombank MBVCB format
4. **Partial Phone** (>= 5 digits) - Search TPOS for matches

**Regex Patterns**:
```javascript
// QR Code: Exactly 18 chars starting with N2
const qrMatch = content.match(/\bN2[A-Z0-9]{16}\b/);

// Phone extraction: >= 5 consecutive digits, take the last occurrence
const phoneNumbers = content.match(/\d{5,}/g);
const partialPhone = phoneNumbers ? phoneNumbers[phoneNumbers.length - 1] : null;
```

**Partial Phone TPOS Search Flow**:
```
1. Extract partial phone từ content (VD: "57828")
2. Call TPOS API: GET /odata/Partner/ODataService.GetViewV2?Phone=57828
3. Group kết quả theo unique 10-digit phone
4. Nếu 1 unique phone → Auto save
5. Nếu nhiều phones → Create pending_customer_matches
6. Nếu không có matches → Mark as NOT_FOUND_IN_TPOS
```

### 4.3 Debt Calculation Logic

**Có 2 trường hợp**:

**Trường hợp 1**: Admin CHƯA điều chỉnh công nợ
```
Tổng công nợ = SUM(tất cả giao dịch từ các mã QR của khách)
```

**Trường hợp 2**: Admin ĐÃ điều chỉnh công nợ
```
Tổng công nợ = Công nợ baseline (do admin set) + SUM(giao dịch SAU thời điểm điều chỉnh)
```

### 4.4 Pending Match Resolution

Khi có nhiều khách hàng khớp với partial phone, tạo pending match và hiển thị dropdown cho admin chọn:

```javascript
// API: POST /api/sepay/pending-matches/:id/resolve
{
    customer_id: 566098,           // ID khách hàng được chọn
    resolved_by: "admin_username"  // Người xử lý
}

// API: POST /api/sepay/pending-matches/:id/skip
{
    reason: "Skipped by user via dropdown",
    resolved_by: "admin_username"
}
```

### 4.5 Mapping Source Types

| Source | Icon | Color | Description |
|--------|------|-------|-------------|
| QR Code | qr-code | #10b981 (green) | Khách quét mã QR |
| Trích xuất SĐT | scan-search | #f59e0b (orange) | Tự động extract từ content |
| Momo | smartphone | #a50064 (magenta) | Giao dịch từ Momo |
| Vietcombank | building-2 | #007b40 (green) | Giao dịch từ VCB (MBVCB) |
| Nhập tay | pencil | #3b82f6 (blue) | Nhập thủ công |
| Chọn KH | user-check | #8b5cf6 (purple) | Chọn từ pending matches |
| Chờ xác nhận | clock | #f97316 (orange-dark) | Pending match chưa resolve |
| Bỏ qua | x-circle | #9ca3af (gray) | Transaction đã skip |

---

## 5. API ENDPOINTS

### 5.1 SePay Webhook

**POST /api/sepay/webhook**
```json
// Request (from SePay)
{
  "id": 92704,
  "gateway": "Vietcombank",
  "transactionDate": "2023-03-25 14:02:37",
  "accountNumber": "0123499999",
  "code": null,
  "content": "CT DEN:0123456789 ND:N2M5K8H2P9Q3R7T1AB CK",
  "transferType": "in",
  "transferAmount": 2277000,
  "accumulated": 19077000,
  "subAccount": null,
  "referenceCode": "MBVCB.3278907687",
  "description": ""
}

// Response
{
  "success": true,
  "id": 123,
  "message": "Transaction recorded successfully"
}
```

### 5.2 Transaction History

**GET /api/sepay/history**
```
Query Parameters:
- page (number): Số trang, default = 1
- limit (number): Số records/trang, default = 50
- type (string): "in" hoặc "out"
- gateway (string): Tên ngân hàng
- startDate (string): YYYY-MM-DD
- endDate (string): YYYY-MM-DD
- search (string): Tìm trong content, reference_code, customer info
- showHidden (boolean): Include hidden transactions
```

### 5.3 Statistics

**GET /api/sepay/statistics**
```json
// Response
{
  "success": true,
  "statistics": {
    "total_transactions": 150,
    "total_in_count": 100,
    "total_out_count": 50,
    "total_in": 50000000,
    "total_out": 20000000,
    "net_change": 30000000,
    "latest_balance": 100000000
  }
}
```

### 5.4 Customer Info

**POST /api/sepay/customer-info**
```json
// Request
{
  "uniqueCode": "N2M5K8H2P9Q3R7T1AB",
  "customerName": "Nguyen Van A",
  "customerPhone": "0901234567"
}

// Response
{
  "success": true,
  "message": "Customer info saved"
}
```

**GET /api/sepay/customer-info**
```json
// Response
{
  "success": true,
  "data": [
    {
      "unique_code": "N2M5K8H2P9Q3R7T1AB",
      "customer_name": "Nguyen Van A",
      "customer_phone": "0901234567",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 5.5 Pending Matches

**GET /api/sepay/pending-matches**
```json
// Response
{
  "success": true,
  "data": [
    {
      "id": 1,
      "transaction_id": 123,
      "extracted_phone": "57828",
      "matched_customers": [...],
      "status": "pending",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**POST /api/sepay/pending-matches/:id/resolve**
**POST /api/sepay/pending-matches/:id/skip**
**POST /api/sepay/pending-matches/:id/undo-skip**

---

## 6. FRONTEND COMPONENTS

### 6.1 Main Table Structure
```html
<table class="data-table">
    <thead>
        <tr>
            <th>Ngày giờ</th>
            <th>Ngân hàng</th>
            <th>Loại</th>
            <th>Số tiền</th>
            <th>Số dư</th>
            <th>Nội dung</th>
            <th>Mã tham chiếu</th>
            <th>Tên khách hàng</th>
            <th>Số điện thoại</th>
            <th>Nguồn</th>
            <th>QR Code</th>
        </tr>
    </thead>
    <tbody id="tableBody"></tbody>
</table>
```

### 6.2 Modals
| Modal ID | Purpose |
|----------|---------|
| detailModal | Chi tiết giao dịch |
| rawDataModal | Raw JSON data viewer |
| qrModal | QR Code display |
| customerListModal | Danh sách KH theo SĐT |
| editCustomerModal | Chỉnh sửa thông tin KH |
| gapsModal | Giao dịch bị thiếu |
| phoneDataModal | Phone data from balance_customer_info |

### 6.3 View Modes
```javascript
// Stored in: localStorage.getItem('bh_view_mode')
const viewModes = {
    'all': 'Tất cả giao dịch',
    'visible': 'Chỉ giao dịch hiện',
    'hidden': 'Chỉ giao dịch ẩn'
};
```

### 6.4 Quick Filters
```javascript
const quickFilters = [
    'today',      // Hôm nay
    'yesterday',  // Hôm qua
    'thisWeek',   // Tuần này
    'lastWeek',   // Tuần trước
    'thisMonth',  // Tháng này
    'lastMonth',  // Tháng trước
    'last7days',  // 7 ngày qua
    'last30days'  // 30 ngày qua (default)
];
```

---

## 7. CODE INDEX - CHI TIẾT CÁC FILE

### 7.1 main.js (~3500 lines)
File chính xử lý tất cả logic frontend.

**State Variables (lines 12-25)**:
```javascript
let currentPage = 1;
let totalPages = 1;
let currentQuickFilter = 'last30days';
let showHidden = false;
let allLoadedData = [];  // Cache cho client-side filtering
let filters = { type: '', gateway: '', startDate: '', endDate: '', search: '', amount: '' };
```

**Key Functions**:

| Function | Line | Description |
|----------|------|-------------|
| `hasDetailedPermission(pageId, permissionKey)` | 50-61 | Check user permission |
| `resolvePendingMatch(pendingMatchId, selectElement)` | 69-147 | Resolve pending customer match |
| `skipPendingMatch(pendingMatchId, selectElement)` | 154-198 | Skip pending match |
| `undoSkipMatch(pendingMatchId)` | 204-241 | Undo skipped match |
| `showNotification(message, type)` | 246-261 | Display notification |
| `setDefaultCurrentMonth()` | 264-289 | Set default date filter (30 days) |
| `getQuickFilterDates(filterType)` | 292-368 | Calculate date ranges |
| `applyQuickFilter(filterType)` | 371-397 | Apply quick date filter |
| `setupEventListeners()` | 421-583 | Initialize all event listeners |
| `applyFilters()` | 586-593 | Apply filter values |
| `parseAmountInput(input)` | 596-619 | Parse amount with k/m suffix |
| `resetFilters()` | 622-643 | Reset all filters |
| `filterByCustomerInfo(data, searchQuery)` | 652-694 | Client-side search in customer info |
| `getBHCache()` | 712-728 | Get cached data |
| `setBHCache(data, pagination)` | 730-741 | Save data to cache |
| `loadData(forceRefresh)` | 777-816 | Load transaction data |
| `fetchFromAPI()` | 819-838 | Fetch data from API |
| `renderCurrentView()` | 863-873 | Render table based on view mode |
| `loadStatistics()` | 885-910 | Load statistics data |
| `renderTable(data, skipGapDetection)` | 913-959 | Render transaction table |
| `getMappingSource(row, uniqueCode)` | 971-1063 | Get mapping source info |
| `renderTransactionRow(row)` | 1076-1240 | Render single transaction row |
| `renderGapRow(missingRef, ...)` | 1245-1271 | Render missing transaction row |
| `renderStatistics(stats)` | 1274-1290 | Render statistics |
| `updatePagination(pagination)` | 1293-1301 | Update pagination controls |
| `showDetail(id)` | 1304-1382 | Show transaction detail modal |
| `formatCurrency(amount)` | 1385-1390 | Format VND currency |
| `formatDateTime(dateString)` | 1392-1403 | Format datetime |
| `showTransactionQR(uniqueCode, amount)` | ~1530+ | Show QR modal |
| `generateDepositQRInline()` | ~1560+ | Generate inline QR |
| `createCustomQRImage(qrUrl, customerInfo)` | ~1580+ | Create custom QR with canvas |
| `showPhoneDataModal(page)` | ~1800+ | Show phone data modal |
| `showCustomersByPhone(phone)` | ~2000+ | Show customers by phone |
| `toggleHideTransaction(id, hide)` | ~2200+ | Toggle transaction visibility |
| `fetchMissingTransaction(referenceCode)` | ~2300+ | Fetch missing transaction |
| `editTransactionCustomer(transactionId, phone, name)` | ~2500+ | Edit customer info |
| `fetchCustomerNamesFromTPOS()` | ~2700+ | Batch fetch names from TPOS |
| `reprocessOldTransactions()` | ~3000+ | Reprocess old transactions |

### 7.2 customer-info.js (443 lines)
Quản lý thông tin khách hàng.

**Object**: `window.CustomerInfoManager`

| Method | Line | Description |
|--------|------|-------------|
| `init()` | 19-29 | Initialize manager, sync from DB |
| `initFirebase()` | 34-61 | Initialize Firebase Firestore |
| `syncFromDatabase()` | 66-89 | Sync from PostgreSQL to localStorage |
| `getAllCustomerInfo()` | 95-103 | Get all from localStorage |
| `saveAllCustomerInfo(data)` | 109-117 | Save all to localStorage |
| `getCustomerInfo(uniqueCode)` | 124-129 | Get by unique code |
| `saveCustomerInfo(uniqueCode, customerInfo)` | 139-188 | Save to localStorage + PostgreSQL + Firebase |
| `syncToFirebase(customerInfo)` | 197-251 | Sync to Firebase (only update, no create) |
| `detectCarrier(phone)` | 258-289 | Detect phone carrier |
| `updateCustomerInfo(uniqueCode, updates)` | 297-310 | Update specific fields |
| `deleteCustomerInfo(uniqueCode)` | 317-324 | Delete customer info |
| `hasCustomerInfo(uniqueCode)` | 331-336 | Check if exists |
| `getCustomerDisplay(uniqueCode)` | 343-359 | Get formatted display strings |
| `searchCustomers(query)` | 366-388 | Search by name or phone |
| `exportCustomerData()` | 394-397 | Export as JSON |
| `importCustomerData(jsonString)` | 404-412 | Import from JSON |
| `getStatistics()` | 418-437 | Get storage statistics |

### 7.3 qr-generator.js (222 lines)
Tạo QR code cho chuyển khoản ngân hàng.

**Object**: `window.QRGenerator`

| Method | Line | Description |
|--------|------|-------------|
| `BANK_CONFIG` | 12-19 | Bank configuration (ACB) |
| `generateUniqueCode(prefix)` | 29-36 | Generate 18-char unique code |
| `generateVietQRUrl(options)` | 47-69 | Generate VietQR URL |
| `generateDepositQR(amount)` | 77-92 | Create new deposit QR |
| `regenerateQR(uniqueCode, amount)` | 101-114 | Regenerate QR from existing code |
| `copyQRUrl(qrUrl)` | 122-144 | Copy QR URL to clipboard |
| `copyUniqueCode(uniqueCode)` | 152-160 | Copy unique code |
| `downloadQRImage(qrUrl, filename)` | 168-185 | Download QR image |
| `createQRHtml(qrUrl, options)` | 194-218 | Create QR HTML element |

### 7.4 config.js (32 lines)
Cấu hình API.

```javascript
const CONFIG = {
    API_BASE_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    ITEMS_PER_PAGE: 50,
    AUTO_REFRESH_INTERVAL: 0,  // 0 = disabled
    CACHE_EXPIRY: 5 * 60 * 1000,  // 5 minutes
    DATE_FORMAT: 'vi-VN',
    CURRENCY: 'VND',
    CURRENCY_LOCALE: 'vi-VN'
};
window.CONFIG = CONFIG;
```

### 7.5 auth.js (~200 lines)
Xác thực và quản lý phiên.

**Object**: `window.AuthManager`

| Method | Description |
|--------|-------------|
| `isLoggedIn()` | Check if user is logged in |
| `getCurrentUser()` | Get current user info |
| `login(username, password, remember)` | Login user |
| `logout()` | Logout user |
| `hasPermission(level)` | Check permission level |
| `getPermissions()` | Get user permissions |

**Session Configuration**:
- Session timeout: 8 hours (sessionStorage)
- Remember me: 30 days (localStorage)

### 7.6 cache.js (~180 lines)
Cache management với localStorage.

**Object**: `window.CacheManager`

| Method | Description |
|--------|-------------|
| `get(key)` | Get cached item |
| `set(key, value, ttl)` | Set cached item with TTL |
| `remove(key)` | Remove cached item |
| `clear()` | Clear all cache |
| `cleanup()` | Remove expired items |

### 7.7 notification-system.js (~350 lines)
Toast notification system.

**Object**: `window.NotificationSystem`

| Method | Description |
|--------|-------------|
| `show(message, type, duration)` | Show notification |
| `success(message)` | Show success notification |
| `error(message)` | Show error notification |
| `warning(message)` | Show warning notification |
| `info(message)` | Show info notification |

**Types**: success, error, warning, info

### 7.8 index.html (627 lines)
Giao diện chính.

**Structure**:
- Lines 1-20: Head (meta, CSS imports)
- Lines 22-58: Sidebar navigation
- Lines 60-128: Header with QR form and filters toggle
- Lines 129-213: Filters container
- Lines 262-302: Main table
- Lines 304-454: Modals (detail, rawData, QR, customerList, editCustomer)
- Lines 456-604: Phone data modal
- Lines 606-625: Script imports

### 7.9 SETUP_ALL.sql (187 lines)
Complete database schema.

**Objects Created**:
- Table: `balance_history`
- Table: `sepay_webhook_logs`
- Table: `balance_customer_info`
- Table: `pending_customer_matches`
- Function: `update_updated_at_column()`
- Trigger: `update_balance_history_updated_at`
- Trigger: `update_customer_info_updated_at`
- View: `balance_statistics`

---

## 8. FLOW DIAGRAMS

### 8.1 Complete Transaction Flow
```
PHASE 1: TẠO MÃ QR
Frontend → QRGenerator.generateDepositQR() → Unique Code (N2...) + VietQR URL

PHASE 2: LIÊN KẾT KHÁCH HÀNG
User nhập SĐT → CustomerInfoManager.saveCustomerInfo()
    ↓
    ├→ localStorage (offline)
    ├→ PostgreSQL (via API)
    └→ Firebase (sync)

PHASE 3: KHÁCH CHUYỂN TIỀN
Khách quét QR → App ngân hàng → Chuyển khoản với nội dung chứa N2...

PHASE 4: WEBHOOK
Ngân hàng → SePay → POST /api/sepay/webhook → Backend

PHASE 5: PROCESSING
Backend:
1. Lưu vào balance_history
2. Extract QR code: /N2[A-Z0-9]{16}/
3. Tìm customer_phone từ balance_customer_info
4. UPSERT customers table (debt += amount)
5. Đánh dấu debt_added = TRUE

PHASE 6: REALTIME UPDATE
Backend SSE → Frontend → Refresh table
```

### 8.2 Pending Match Resolution Flow
```
1. Transaction với partial phone (VD: "57828")
    ↓
2. Search TPOS: GET /odata/Partner?Phone=57828
    ↓
3. Kết quả: 4 unique phones found
    ↓
4. Create pending_customer_matches record
    ↓
5. Frontend hiển thị dropdown với options
    ↓
6. Admin chọn → POST /api/sepay/pending-matches/:id/resolve
    ↓
7. Update balance_customer_info + customers table
```

### 8.3 Cache Strategy
```
┌─────────────────────────────────────────────────────┐
│                    loadData()                        │
├─────────────────────────────────────────────────────┤
│  1. Check localStorage cache (BH_CACHE_KEY_PREFIX)  │
│     ↓                                                │
│  2. If cached & not expired (< 5 min):              │
│     - Render immediately                             │
│     - Background fetch to check for updates          │
│     ↓                                                │
│  3. If no cache or expired:                          │
│     - Show loading spinner                           │
│     - Fetch from API                                 │
│     - Save to cache                                  │
│     - Render                                         │
└─────────────────────────────────────────────────────┘
```

---

## 9. CẤU HÌNH & ENVIRONMENT

### 9.1 API Endpoints
```javascript
// Production
API_BASE_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev'

// Alternative (direct to Render)
// API_BASE_URL: 'https://n2store-fallback.onrender.com'

// Local development
// API_BASE_URL: 'http://localhost:3000'
```

### 9.2 Environment Variables (Backend)
```bash
DATABASE_URL=postgresql://user:password@host:port/database
SEPAY_API_KEY=sepay_sk_xxx  # Optional, for webhook authentication
TPOS_TOKEN=xxx              # For TPOS API calls
```

### 9.3 Firebase Config
```javascript
// File: ../js/firebase-config.js
window.FIREBASE_CONFIG = {
    apiKey: "xxx",
    authDomain: "xxx.firebaseapp.com",
    projectId: "xxx",
    storageBucket: "xxx.appspot.com",
    messagingSenderId: "xxx",
    appId: "xxx"
};
```

### 9.4 LocalStorage Keys
| Key | Purpose |
|-----|---------|
| `balance_history_customer_info` | Customer info cache |
| `bh_cache_*` | Transaction data cache |
| `bh_view_mode` | Current view mode |
| `n2shop_current_user` | Current user info |

---

## 10. DEPENDENCIES & LIBRARIES

### 10.1 Frontend Dependencies
| Library | Version | Purpose |
|---------|---------|---------|
| Lucide Icons | latest | Icon system |
| Firebase | 9.6.1 | Firestore sync |

### 10.2 CDN Links
```html
<script src="https://unpkg.com/lucide@latest"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js"></script>
```

### 10.3 Backend Dependencies (Render.com)
| Package | Purpose |
|---------|---------|
| express | Web framework |
| pg | PostgreSQL client |
| cors | CORS handling |
| dotenv | Environment variables |

---

## APPENDIX A: Extraction Note Values

| Value | Meaning |
|-------|---------|
| `QR_CODE_FOUND` | Có QR code, không cần tìm phone |
| `AUTO_MATCHED_FROM_PARTIAL:xxxxx` | Auto matched từ partial phone |
| `PARTIAL_PHONE_NO_TPOS_MATCH:xxxxx` | Không tìm thấy trong TPOS |
| `MULTIPLE_NUMBERS_FOUND` | Có nhiều số trong content |
| `MOMO:xxxxxxxxxx` | Giao dịch từ Momo |
| `VCB:xxxxxxxxxx` | Giao dịch từ Vietcombank |
| `PARTIAL_PHONE_EXTRACTED` | Đã extract partial phone |

## APPENDIX B: Name Fetch Status Values

| Value | Meaning |
|-------|---------|
| `SUCCESS` | Đã có tên (từ TPOS hoặc manual) |
| `PENDING` | Chưa fetch tên |
| `NOT_FOUND_IN_TPOS` | Phone không có trong TPOS |
| `NO_PHONE_TO_FETCH` | Có QR hoặc không có phone |

---

**Document Version**: 1.0
**Last Updated**: January 2025
**Author**: AI Agent Documentation System
