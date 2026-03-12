# BALANCE HISTORY - COMPLETE SPECIFICATION
## Tài liệu Đặc tả Toàn diện cho AI Agent

> **Mục đích**: Tài liệu này cung cấp đặc tả hoàn chỉnh về nghiệp vụ, kỹ thuật và cấu trúc code để AI Agent có thể đọc hiểu toàn bộ hệ thống và thực hiện tối ưu hoặc phát triển tiếp.
>
> **Last Updated**: January 2025

---

## MỤC LỤC

1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Cấu Trúc Thư Mục & File](#2-cấu-trúc-thư-mục--file)
3. [Kiến Trúc Kỹ Thuật](#3-kiến-trúc-kỹ-thuật)
4. [Database Schema](#4-database-schema)
5. [API Endpoints](#5-api-endpoints)
6. [Frontend Components](#6-frontend-components)
7. [JavaScript Modules - Chi Tiết](#7-javascript-modules---chi-tiết)
8. [Business Logic - Nghiệp Vụ](#8-business-logic---nghiệp-vụ)
9. [UI Flow & Event Listeners](#9-ui-flow--event-listeners)
10. [Flow Diagrams](#10-flow-diagrams)
11. [Cấu Hình & Environment](#11-cấu-hình--environment)
12. [Dependencies & Libraries](#12-dependencies--libraries)

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mô tả
Balance History là hệ thống theo dõi lịch sử biến động số dư tài khoản ngân hàng, tích hợp với SePay webhook để nhận thông báo giao dịch realtime. Hệ thống hỗ trợ:
- Tạo mã QR chuyển khoản với unique code
- Trích xuất thông tin khách hàng từ nội dung chuyển khoản
- Quản lý công nợ tự động
- Hiển thị lịch sử giao dịch với filter và pagination
- **Verification Workflow** cho kế toán duyệt giao dịch
- **Transfer Stats** theo dõi thống kê chuyển khoản

### 1.2 Tech Stack
| Component | Technology |
|-----------|------------|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (Render.com) |
| Hosting | Render.com (Backend), Cloudflare Workers (Proxy) |
| Real-time | Firebase Firestore (sync), SSE (Server-Sent Events) |
| Icons | Lucide Icons |
| Bank API | VietQR, SePay Webhook |

### 1.3 Main Features
| Feature | Description |
|---------|-------------|
| Balance History | Xem lịch sử giao dịch với filter theo ngày, loại, ngân hàng |
| QR Generation | Tạo mã QR VietQR với unique code N2... |
| Transfer Stats | Thống kê chuyển khoản với workflow kiểm tra |
| Verification Queue | Hàng đợi duyệt giao dịch cho kế toán |
| Customer Mapping | Liên kết giao dịch với khách hàng qua QR/Phone |
| Real-time Updates | SSE stream cập nhật giao dịch mới |

---

## 2. CẤU TRÚC THƯ MỤC & FILE

```
balance-history/
├── index.html                    # Giao diện chính (3 tabs: Balance History, Transfer Stats, Verification)
├── css/
│   ├── modern.css               # Modern design system (~29KB)
│   ├── styles.css               # Main page styles (~34KB)
│   └── transfer-stats.css       # Transfer Stats specific styles
├── js/
│   ├── config.js                # Cấu hình API (32 lines)
│   ├── main.js                  # Logic chính Balance History (~3500 lines)
│   ├── customer-info.js         # Customer info management (443 lines)
│   ├── qr-generator.js          # QR code generation (223 lines)
│   ├── transfer-stats.js        # Transfer Stats module (750 lines)
│   └── verification.js          # Verification workflow module (684 lines)
└── docs/
    ├── COMPLETE_SPECIFICATION.md # This file
    ├── DEPLOYMENT_GUIDE.md
    ├── IMPLEMENTATION_GUIDE.md
    ├── PARTIAL_PHONE_TPOS_SEARCH.md
    ├── PHONE_EXTRACTION_FEATURE.md
    ├── PHONE_EXTRACTION_IMPROVEMENTS.md
    ├── PHONE_PARTNER_FETCH_GUIDE.md
    ├── PR_SUMMARY.md
    ├── QR_DEBT_FLOW.md
    └── README.md
```

---

## 3. KIẾN TRÚC KỸ THUẬT

### 3.1 Architecture Diagram
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

### 3.2 Data Flow
1. **Tạo QR** → Frontend tạo mã QR với unique code (N2...)
2. **Liên kết khách hàng** → Lưu mapping QR code ↔ SĐT khách hàng
3. **Chuyển tiền** → Khách quét QR và chuyển tiền
4. **Webhook** → SePay gửi notification về backend
5. **Trích xuất mã** → Backend extract mã N2... từ nội dung
6. **Verification** → Kiểm tra và duyệt giao dịch
7. **Cập nhật công nợ** → Tự động cộng tiền vào công nợ khách hàng

### 3.3 Storage Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                     MULTI-LAYER STORAGE                          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: localStorage (Offline Support)                        │
│  - Key: 'balance_history_customer_info'                         │
│  - Key: 'bh_cache_*' (transaction cache, 5 min TTL)             │
│  - Key: 'bh_view_mode' (view mode preference)                   │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: PostgreSQL (Primary Database)                         │
│  - Table: balance_history (transactions)                        │
│  - Table: balance_customer_info (QR ↔ customer mapping)         │
│  - Table: pending_customer_matches (ambiguous matches)          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Firebase Firestore (Cross-system sync)                │
│  - Collection: 'customers'                                       │
│  - Only updates existing customers, no creation                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. DATABASE SCHEMA

### 4.1 Table: `balance_history`
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

    -- Verification fields
    verification_status VARCHAR(50),            -- PENDING, AUTO_APPROVED, PENDING_VERIFICATION, APPROVED, REJECTED
    match_method VARCHAR(50),                   -- qr_code, exact_phone, single_match, pending_match, manual_entry, manual_link
    verified_by VARCHAR(100),                   -- Người duyệt
    verified_at TIMESTAMP,                      -- Thời điểm duyệt
    verification_note TEXT,                     -- Ghi chú duyệt

    -- Customer linking
    linked_customer_phone VARCHAR(50),          -- SĐT khách hàng đã link
    customer_name VARCHAR(255),                 -- Tên khách hàng
    qr_code VARCHAR(50),                        -- Mã QR (N2...)
    extraction_note VARCHAR(255),               -- Ghi chú trích xuất

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
CREATE INDEX idx_balance_history_verification_status ON balance_history(verification_status);
```

### 4.2 Table: `balance_customer_info`
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

### 4.3 Table: `pending_customer_matches`
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
```

---

## 5. API ENDPOINTS

### 5.1 Transaction History & Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sepay/history` | Lấy danh sách giao dịch với pagination & filters |
| GET | `/api/sepay/statistics` | Lấy thống kê tổng hợp |
| GET | `/api/sepay/history/stats` | Lấy thống kê theo verification status |
| PUT | `/api/sepay/transaction/{id}/hidden` | Toggle ẩn/hiện giao dịch |
| PUT | `/api/sepay/transaction/{id}/phone` | Cập nhật SĐT khách hàng cho giao dịch |
| POST | `/api/sepay/batch-update-phones` | Batch reprocess transactions |

### 5.2 Customer Info

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sepay/customer-info` | Lấy tất cả customer info |
| POST | `/api/sepay/customer-info` | Lưu customer info mới |
| PUT | `/api/sepay/customer-info/{unique_code}` | Cập nhật customer info |
| GET | `/api/sepay/phone-data` | Lấy phone data với pagination |

### 5.3 Pending Matches

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sepay/pending-matches` | Lấy danh sách pending matches |
| POST | `/api/sepay/pending-matches/{id}/resolve` | Resolve pending match (chọn KH) |
| PUT | `/api/sepay/pending-matches/{id}/customers` | Cập nhật matched customers |

### 5.4 TPOS Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sepay/tpos/search/{partialPhone}` | Tìm KH theo partial phone |
| GET | `/api/sepay/tpos/customer/{phone}` | Lấy thông tin KH từ TPOS |
| GET | `/api/customer/{phone}/quick-view` | Quick view customer info |

### 5.5 Transfer Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sepay/transfer-stats` | Lấy tất cả transfer stats |
| GET | `/api/sepay/transfer-stats/count` | Đếm unchecked items |
| PUT | `/api/sepay/transfer-stats/{id}/check` | Toggle checked status |
| PUT | `/api/sepay/transfer-stats/{id}/verify` | Toggle verified status |
| PUT | `/api/sepay/transfer-stats/mark-all-checked` | Mark nhiều items checked |
| POST | `/api/sepay/transfer-stats/add` | Thêm transaction vào stats |
| POST | `/api/sepay/transfer-stats/sync` | Sync customer info |
| PUT | `/api/sepay/transfer-stats/{id}` | Cập nhật notes/customer |

### 5.6 Verification Queue (v2 API)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/balance-history/verification-queue` | Lấy danh sách chờ duyệt |
| POST | `/api/v2/balance-history/{id}/approve` | Duyệt giao dịch |
| POST | `/api/v2/balance-history/{id}/reject` | Từ chối giao dịch |
| POST | `/api/v2/balance-history/{id}/resolve-match` | Resolve match và link KH |
| GET | `/api/v2/balance-history/stats` | Lấy verification stats |

### 5.7 Real-time & Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| SSE | `/api/sepay/stream` | Real-time event stream |
| POST | `/api/sepay/webhook` | SePay webhook receiver |
| POST | `/api/sepay/detect-gaps` | Phát hiện giao dịch thiếu |
| GET | `/api/sepay/gaps` | Lấy danh sách gaps |
| POST | `/api/sepay/gaps/{ref}/ignore` | Ignore gap |

---

## 6. FRONTEND COMPONENTS

### 6.1 Main Tab Structure
```
index.html
├── Tab 1: Lịch sử biến động số dư (Balance History)
│   ├── Header với QR Generator inline
│   ├── View Mode Tabs (Tất cả | Giao dịch hiện | Chưa có SĐT | Giao dịch ẩn)
│   ├── Verification Status Filter Chips
│   ├── Filters Container (hidden by default)
│   ├── Data Table với columns:
│   │   - Ngày giờ, Số tiền, Nội dung, Mã tham chiếu
│   │   - Tên khách hàng, Số điện thoại, Nguồn, QR Code
│   └── Pagination
│
├── Tab 2: Thống Kê Chuyển Khoản (Transfer Stats)
│   ├── Filters (Ẩn/Hiện, Đã KT, Tìm kiếm)
│   ├── Stats Summary
│   ├── Data Table
│   └── Pagination
│
└── Tab 3: Chờ Duyệt (Verification Queue)
    ├── Stats Cards
    ├── Verification Table
    └── Action Buttons (Duyệt/Thay đổi/Từ chối)
```

### 6.2 Modals
| Modal ID | Purpose |
|----------|---------|
| `detailModal` | Chi tiết giao dịch |
| `qrModal` | QR Code display |
| `editCustomerModal` | Chỉnh sửa thông tin KH |
| `phoneDataModal` | Phone data từ balance_customer_info |
| `editTSModal` | Edit Transfer Stats item |
| `rejectModal` | Nhập lý do từ chối |

### 6.3 View Modes (Balance History Tab)
```javascript
const viewModes = {
    'all': 'Tất cả giao dịch',
    'visible': 'Chỉ giao dịch hiện',
    'hidden': 'Chỉ giao dịch ẩn',
    'no-phone': 'Chưa có SĐT'
};
// Stored in: localStorage.getItem('bh_view_mode')
```

### 6.4 Verification Status Filter Chips
```javascript
const verificationFilters = [
    'all',                    // Tất cả
    'AUTO_APPROVED',          // Tự động (QR Code, exact phone)
    'APPROVED',               // Kế toán duyệt
    'PENDING_VERIFICATION',   // Chờ duyệt
    'REJECTED',               // Từ chối
    'NO_PHONE'               // Chưa gán KH
];
```

### 6.5 Quick Date Filters
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

## 7. JAVASCRIPT MODULES - CHI TIẾT

### 7.1 config.js (32 lines)
Cấu hình ứng dụng.

```javascript
const CONFIG = {
    API_BASE_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    ITEMS_PER_PAGE: 50,
    AUTO_REFRESH_INTERVAL: 0,          // 0 = disabled
    CACHE_EXPIRY: 5 * 60 * 1000,       // 5 minutes
    DATE_FORMAT: 'vi-VN',
    CURRENCY: 'VND',
    CURRENCY_LOCALE: 'vi-VN'
};
window.CONFIG = CONFIG;
```

---

### 7.2 main.js (~3500 lines)
File logic chính cho Balance History tab.

#### State Variables (lines 12-26)
```javascript
let currentPage = 1;
let totalPages = 1;
let currentQuickFilter = 'last30days';
let viewMode = localStorage.getItem('bh_view_mode') || 'all';
let verificationStatusFilter = 'all';
let allLoadedData = [];  // Cache for client-side filtering
let filters = { type: '', gateway: '', startDate: '', endDate: '', search: '', amount: '' };
```

#### Key Functions

| Function | Line | Description |
|----------|------|-------------|
| `resolvePendingMatch(pendingMatchId, selectElement)` | 54-131 | Resolve pending match khi user chọn từ dropdown |
| `refreshPendingMatchList(pendingMatchId, partialPhone, btn)` | 139-233 | Refresh danh sách KH từ TPOS |
| `copyPhoneToClipboard(phone, button)` | 240-264 | Copy SĐT vào clipboard |
| `showNotification(message, type)` | 269-304 | Hiển thị toast notification |
| `setDefaultCurrentMonth()` | 307-332 | Set date filter mặc định (30 ngày) |
| `getQuickFilterDates(filterType)` | 335-411 | Tính toán date range theo filter type |
| `applyQuickFilter(filterType)` | 414-440 | Apply quick date filter |
| `setupEventListeners()` | 466-628 | Initialize tất cả event listeners |
| `applyFilters()` | 631-638 | Apply filter values từ form |
| `parseAmountInput(input)` | 641-664 | Parse amount với suffix k/m/tr |
| `resetFilters()` | 667-688 | Reset tất cả filters |
| `filterByCustomerInfo(data, searchQuery)` | 697-739 | Client-side filter theo customer info |
| `getBHCache()` / `setBHCache()` | 757-786 | LocalStorage cache management |
| `loadData(forceRefresh)` | 822-861 | Load transaction data (cache-first) |
| `fetchFromAPI()` | 864-892 | Fetch data từ API |
| `renderCurrentView()` | 917-953 | Render table theo viewMode |
| `updateHiddenCount()` | 956-971 | Update hidden/no-phone count badges |
| `loadStatistics()` | 974-999 | Load thống kê |
| `renderTable(data, skipGapDetection)` | 1002-1048 | Render transaction table với gap detection |
| `getMappingSource(row, uniqueCode)` | 1060-1202 | Get mapping source info (QR/Phone/Manual...) |
| `renderTransactionRow(row)` | 1215-1300+ | Render single transaction row |

#### Event Listeners (setupEventListeners - line 466)
- Quick filter buttons (`.btn-quick-filter`)
- Refresh button (`#refreshBtn`)
- View phone data (`#viewPhoneDataBtn`)
- Reprocess old transactions (`#reprocessOldTransactionsBtn`)
- Apply/Reset filters (`#applyFiltersBtn`, `#resetFiltersBtn`)
- Pagination (`#prevPageBtn`, `#nextPageBtn`)
- Modal close buttons
- Search input với debounce
- Date input changes

---

### 7.3 customer-info.js (443 lines)
Quản lý thông tin khách hàng.

**Object**: `window.CustomerInfoManager`

| Method | Line | Description |
|--------|------|-------------|
| `init()` | 19-29 | Initialize manager, Firebase, sync từ DB |
| `initFirebase()` | 34-61 | Initialize Firebase Firestore |
| `syncFromDatabase()` | 66-89 | Sync từ PostgreSQL → localStorage |
| `getAllCustomerInfo()` | 95-103 | Lấy tất cả từ localStorage |
| `saveAllCustomerInfo(data)` | 109-117 | Lưu tất cả vào localStorage |
| `getCustomerInfo(uniqueCode)` | 124-129 | Lấy theo unique code |
| `saveCustomerInfo(uniqueCode, customerInfo)` | 139-188 | Lưu vào localStorage + PostgreSQL + Firebase |
| `syncToFirebase(customerInfo)` | 197-251 | Sync tới Firebase (chỉ update, không create) |
| `detectCarrier(phone)` | 258-289 | Nhận diện nhà mạng từ SĐT |
| `updateCustomerInfo(uniqueCode, updates)` | 297-310 | Cập nhật fields cụ thể |
| `deleteCustomerInfo(uniqueCode)` | 317-324 | Xóa customer info |
| `hasCustomerInfo(uniqueCode)` | 331-336 | Kiểm tra có tồn tại không |
| `getCustomerDisplay(uniqueCode)` | 343-359 | Lấy formatted display strings |
| `searchCustomers(query)` | 366-388 | Tìm kiếm theo name/phone |
| `exportCustomerData()` | 394-397 | Export JSON |
| `importCustomerData(jsonString)` | 404-412 | Import JSON |
| `getStatistics()` | 418-437 | Lấy thống kê storage |

---

### 7.4 qr-generator.js (223 lines)
Tạo QR code cho chuyển khoản ngân hàng.

**Object**: `window.QRGenerator`

| Property/Method | Line | Description |
|-----------------|------|-------------|
| `BANK_CONFIG` | 12-19 | Bank configuration (ACB) |
| `generateUniqueCode(prefix)` | 29-36 | Tạo mã 18 ký tự (N2 + 16 chars) |
| `generateVietQRUrl(options)` | 47-69 | Tạo VietQR URL |
| `generateDepositQR(amount)` | 77-92 | Tạo QR mới với unique code |
| `regenerateQR(uniqueCode, amount)` | 101-114 | Tạo lại QR từ existing code |
| `copyQRUrl(qrUrl)` | 122-144 | Copy URL vào clipboard |
| `copyUniqueCode(uniqueCode)` | 152-160 | Copy unique code |
| `downloadQRImage(qrUrl, filename)` | 168-185 | Download QR image |
| `createQRHtml(qrUrl, options)` | 194-218 | Tạo HTML element |

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

**Unique Code Format**: `N2` + 16 chars = **18 ký tự cố định**
```javascript
generateUniqueCode(prefix = 'N2') {
    const timestamp = Date.now().toString(36).toUpperCase().slice(-8);  // 8 chars
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();  // 6 chars
    const sequence = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');  // 2 chars
    return `${prefix}${timestamp}${random}${sequence}`;  // Total: 18 chars
}
// Example: "N2M5K8H2P9Q3R7T1AB"
```

---

### 7.5 transfer-stats.js (750 lines)
Module quản lý Transfer Stats tab.

#### State Variables (lines 11-16)
```javascript
let tsData = [];
let tsFilteredData = [];
let tsCurrentPage = 1;
let tsTotalPages = 1;
const TS_PAGE_SIZE = 50;
```

#### Key Functions

| Function | Line | Description |
|----------|------|-------------|
| `addNewTransferStatRealtime(transaction)` | 26-52 | Thêm transaction realtime (SSE) |
| `loadTransferStats()` | 58-89 | Load data từ API |
| `filterTransferStats()` | 91-126 | Filter theo visibility/verified/search |
| `renderTSTable()` | 128-187 | Render table với pagination |
| `updateTSStats()` | 208-223 | Update stats summary |
| `updateTSPagination()` | 225-241 | Update pagination UI |
| `tsChangePage(delta)` | 243-249 | Change page |
| `updateUncheckedBadge()` | 251-263 | Update badge số unchecked |
| `toggleTSChecked(id, checked)` | 269-336 | Toggle checked status |
| `toggleTSVerified(id, verified)` | 338-377 | Toggle verified status |
| `markAllChecked()` | 379-422 | Mark tất cả visible là checked |
| `transferToStats(transactionId)` | 451-493 | Chuyển GD vào stats |
| `syncTransferStats()` | 499-535 | Sync customer info |
| `openEditTSModal(id)` | 623-634 | Mở modal edit |
| `saveTSEdit(e)` | 640-688 | Lưu thay đổi |

---

### 7.6 verification.js (684 lines)
Module Verification Workflow cho kế toán.

#### Constants (lines 15-33)
```javascript
const VERIFICATION_STATUS = {
    PENDING: 'PENDING',
    AUTO_APPROVED: 'AUTO_APPROVED',
    PENDING_VERIFICATION: 'PENDING_VERIFICATION',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED'
};

const MATCH_METHOD_LABELS = {
    qr_code: 'QR Code',
    exact_phone: 'SĐT đầy đủ (10 số)',
    single_match: 'Tự động (1 KH duy nhất)',
    pending_match: 'NV chọn từ dropdown',
    manual_entry: 'Nhập tay',
    manual_link: 'Kế toán gán tay'
};
```

#### State Variables (lines 71-73)
```javascript
let verificationQueueData = [];
let verificationCurrentPage = 1;
let verificationTotalPages = 1;
```

#### Key Functions

| Function | Line | Description |
|----------|------|-------------|
| `renderVerificationBadge(status)` | 38-47 | Render status badge |
| `renderMatchMethodBadge(method)` | 52-65 | Render match method badge |
| `loadVerificationQueue(page, status)` | 79-124 | Load danh sách chờ duyệt |
| `renderVerificationQueue(tableBody)` | 129-209 | Render verification table |
| `updateVerificationPagination()` | 214-222 | Update pagination |
| `approveTransaction(transactionId)` | 244-284 | Duyệt giao dịch |
| `showRejectModal(transactionId)` | 289-303 | Hiện modal từ chối |
| `rejectTransaction(transactionId, reason)` | 309-349 | Từ chối giao dịch |
| `selectMatchAndApprove(transactionId, select)` | 356-401 | Chọn KH và tự động approve |
| `loadVerificationStats()` | 410-434 | Load thống kê verification |
| `showChangeModal(txId, phone, name)` | 450-522 | Modal thay đổi SĐT |
| `changeAndApproveTransaction(txId, phone, name)` | 531-599 | Thay đổi SĐT và approve |
| `initVerificationModule()` | 604-662 | Initialize module |

#### Permission Checks
```javascript
// Sử dụng authManager.hasDetailedPermission()
// Không có admin bypass - tất cả users phải có detailedPermissions
const permissions = {
    'viewVerificationQueue': 'Xem danh sách chờ duyệt',
    'approveTransaction': 'Duyệt giao dịch',
    'rejectTransaction': 'Từ chối giao dịch',
    'resolveMatch': 'Chọn khách hàng từ dropdown'
};
```

---

## 8. BUSINESS LOGIC - NGHIỆP VỤ

### 8.1 QR Code Generation Flow

```
1. User nhập SĐT khách hàng (optional)
2. Click "Tạo QR"
3. QRGenerator.generateDepositQR() tạo:
   - uniqueCode: N2 + 16 random chars (18 total)
   - qrUrl: VietQR URL với account info
4. Nếu có SĐT → CustomerInfoManager.saveCustomerInfo()
   - Lưu localStorage
   - POST /api/sepay/customer-info
   - Sync Firebase (update only, no create)
5. Hiển thị QR inline
```

### 8.2 Phone Extraction Logic

**Priority Order**:
1. **QR Code** (N2 + 16 chars) - Highest priority → AUTO_APPROVED
2. **Exact Phone** (10 digits) - Full phone match → AUTO_APPROVED
3. **MOMO Pattern** - Momo transfers → Extract từ content
4. **VCB Pattern** - Vietcombank MBVCB format
5. **Partial Phone** (>= 5 digits) - Search TPOS for matches → PENDING_VERIFICATION

**Regex Patterns**:
```javascript
// QR Code: Exactly 18 chars starting with N2
const qrMatch = content.match(/\bN2[A-Z0-9]{16}\b/);

// Phone: 10 digits starting with 0
const phoneMatch = content.match(/\b0\d{9}\b/);

// Partial phone: >= 5 consecutive digits
const partialPhone = content.match(/\d{5,}/g)?.pop();
```

### 8.3 Verification Workflow

```
                    ┌─────────────────┐
                    │   New Transaction │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
   ┌────────────┐    ┌────────────┐    ┌────────────────┐
   │  QR Code   │    │ Exact Phone│    │ Partial Phone  │
   │  Found     │    │ (10 digits)│    │ or Manual Entry│
   └─────┬──────┘    └─────┬──────┘    └───────┬────────┘
         │                 │                    │
         ▼                 ▼                    ▼
  ┌─────────────────────────────┐      ┌───────────────────┐
  │      AUTO_APPROVED          │      │PENDING_VERIFICATION│
  │   (Tự động cộng ví)         │      │  (Chờ KT duyệt)   │
  └─────────────────────────────┘      └─────────┬─────────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    │            │            │
                                    ▼            ▼            ▼
                              ┌──────────┐ ┌──────────┐ ┌──────────┐
                              │ APPROVED │ │ REJECTED │ │ Changed  │
                              │(Duyệt)   │ │(Từ chối) │ │+ Approve │
                              └──────────┘ └──────────┘ └──────────┘
```

### 8.4 Pending Match Resolution

Khi có nhiều khách hàng khớp với partial phone:

```
1. Backend extract partial phone từ content (VD: "57828")
2. Call TPOS API: GET /odata/Partner?Phone=57828
3. Group kết quả theo unique 10-digit phone
4. Nếu 1 unique phone → Auto save → AUTO_APPROVED
5. Nếu nhiều phones → Create pending_customer_matches
   → verification_status = PENDING_VERIFICATION
6. Frontend hiển thị dropdown với options
7. Admin chọn → POST /api/sepay/pending-matches/:id/resolve
8. Hoặc: Kế toán duyệt/từ chối
```

### 8.5 Mapping Source Types

| Source | match_method | Icon | Color | Description |
|--------|--------------|------|-------|-------------|
| QR Code | qr_code | qr-code | #10b981 (green) | Khách quét mã QR |
| SĐT chính xác | exact_phone | phone | #10b981 (green) | Match 10 số SĐT |
| Tự động match | single_match | check-circle | #10b981 (green) | 1 KH duy nhất |
| Nhiều KH | pending_match | users | #f97316 (orange) | Cần chọn KH |
| Nhập tay | manual_entry | pencil | #3b82f6 (blue) | NV nhập thủ công |
| Kế toán gán | manual_link | user-check | #10b981 (green) | Kế toán gán và duyệt |
| Momo | - | smartphone | #a50064 (magenta) | Giao dịch từ Momo |
| Vietcombank | - | building-2 | #007b40 (green) | Giao dịch từ VCB |

### 8.6 Edit Permission Rules (QUAN TRỌNG)

**Nguyên tắc chỉnh sửa giao dịch:**

| Loại giao dịch | Tab Live Mode | Tab Lịch sử GD | Tab Chờ Duyệt |
|----------------|---------------|----------------|---------------|
| **Tự động gán** (qr_code, phone_match, exact_phone, single_match) | ❌ KHÔNG cho phép sửa | ✅ Chỉ **Kế toán** được sửa | ✅ Kế toán duyệt/từ chối |
| **Nhập tay** (manual_entry) | ✅ Cho phép sửa SĐT (nếu chưa duyệt) | ✅ Cho phép sửa | ✅ Kế toán duyệt/từ chối |
| **Đã duyệt** (verification_status = 'APPROVED') | ❌ KHÔNG cho phép sửa | ❌ KHÔNG cho phép sửa | - |

**Lý do:**
- Giao dịch **tự động gán** (QR, SĐT) có độ tin cậy cao, chỉ kế toán mới được phép chỉnh sửa để đảm bảo tính chính xác
- Giao dịch **nhập tay** do nhân viên nhập thủ công, cho phép sửa trước khi kế toán duyệt
- Giao dịch **đã duyệt** không được phép sửa để đảm bảo tính toàn vẹn dữ liệu

**Code implementation (live-mode.js):**
```javascript
// Chỉ cho phép sửa với giao dịch NHẬP TAY (manual_entry) và chưa được kế toán duyệt
const canEdit = tx.match_method === 'manual_entry' && tx.verification_status !== 'APPROVED';
```

### 8.7 Manual Entry vs Manual Link (QUAN TRỌNG)

Phân biệt giữa hai phương thức gán thủ công:

| Field | `manual_entry` | `manual_link` |
|-------|---------------|---------------|
| **Người thực hiện** | Nhân viên (không có quyền `approveTransaction`) | Kế toán (có quyền `approveTransaction`) |
| **Workflow** | Chờ kế toán duyệt trước khi cộng ví | Tự động duyệt và cộng ví ngay |
| **verification_status** | `PENDING_VERIFICATION` | `APPROVED` |
| **Badge hiển thị** | "Nhập tay" (xanh dương) | "Kế toán gán" (xanh lá) |
| **wallet_processed** | `false` (chờ duyệt) | `true` (đã cộng) |
| **is_hidden** | `true` (sau khi gán) | `true` (sau khi gán) |

#### 8.7.1 Logic phân biệt (server-side - sepay-webhook.js)

```javascript
// API: PUT /api/sepay/transaction/{id}/phone
// Request body: { phone, name, is_manual_entry, entered_by }

if (is_manual_entry === true) {
    // Nhân viên nhập tay → chờ kế toán duyệt
    match_method = 'manual_entry';
    verification_status = 'PENDING_VERIFICATION';
    // KHÔNG cộng ví - chờ kế toán approve
} else {
    // Kế toán gán → duyệt ngay
    match_method = 'manual_link';
    verification_status = 'APPROVED';
    // Cộng ví ngay lập tức
}
```

#### 8.7.2 Client-side Implementation

**QUAN TRỌNG - Client phải gửi đúng flag `is_manual_entry`:**

| Source | Gửi `is_manual_entry` | Logic |
|--------|----------------------|-------|
| **Live Mode** | `true` (luôn luôn) | Nhập từ kanban → chờ duyệt |
| **Balance History** | Dựa trên permission check | `saveTransactionCustomer()` kiểm tra `approveTransaction` |
| **Transfer Stats** | Dùng `window.saveTransactionCustomer()` từ main.js | Logic tập trung |

**Live Mode (live-mode.js) - assignManual():**
```javascript
// Line 569-578: Luôn gửi is_manual_entry: true
const response = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/phone`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        phone: phone,
        name: customerName,
        is_manual_entry: true,  // Luôn true từ Live Mode
        entered_by: window.authManager?.getUserInfo()?.username || 'staff'
    })
});

// Sau đó set is_hidden = true để chuyển sang "ĐÃ XÁC NHẬN"
await fetch(`${API_BASE}/api/sepay/transaction/${txId}/hidden`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden: true })
});
```

**Balance History (main.js) - saveTransactionCustomer():**
```javascript
// Line 3044-3089: Kiểm tra permission trước khi quyết định is_manual_entry
async function saveTransactionCustomer(transactionId, newPhone, options = {}) {
    const { isManualEntry = false, name = '' } = options;

    // Check if user is accountant/admin
    const hasApprovePermission = authManager?.hasDetailedPermission('balance-history', 'approveTransaction');
    const isAccountant = hasApprovePermission === true;
    const shouldRequireApproval = isManualEntry && !isAccountant;

    const response = await fetch(`${API_BASE_URL}/api/sepay/transaction/${transactionId}/phone`, {
        method: 'PUT',
        body: JSON.stringify({
            phone: newPhone,
            name: name,
            is_manual_entry: shouldRequireApproval,  // Dựa trên permission
            entered_by: currentUsername
        })
    });

    // Sau khi gán xong, set is_hidden = true
    await fetch(`${API_BASE_URL}/api/sepay/transaction/${transactionId}/hidden`, {
        method: 'PUT',
        body: JSON.stringify({ hidden: true })
    });
}
```

#### 8.7.3 Flow sau khi gán SĐT

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLOW GÁN SĐT THỦ CÔNG                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User nhập SĐT (Live Mode / Balance History / Transfer Stats)               │
│                              │                                               │
│                              ▼                                               │
│         ┌────────────────────────────────────────┐                          │
│         │  API: PUT /api/sepay/transaction/{id}/phone                       │
│         │  Body: { phone, name, is_manual_entry, entered_by }               │
│         └────────────────────┬───────────────────┘                          │
│                              │                                               │
│              ┌───────────────┴───────────────┐                              │
│              │                               │                              │
│              ▼                               ▼                              │
│    ┌─────────────────────┐       ┌─────────────────────┐                    │
│    │ is_manual_entry=true│       │ is_manual_entry=false│                   │
│    │ (Nhân viên nhập)    │       │ (Kế toán gán)       │                    │
│    └──────────┬──────────┘       └──────────┬──────────┘                    │
│               │                              │                              │
│               ▼                              ▼                              │
│    ┌─────────────────────┐       ┌─────────────────────┐                    │
│    │ match_method =      │       │ match_method =      │                    │
│    │   'manual_entry'    │       │   'manual_link'     │                    │
│    │ status =            │       │ status = 'APPROVED' │                    │
│    │   'PENDING_VERIF..' │       │ wallet_processed =  │                    │
│    │ wallet_processed =  │       │   true              │                    │
│    │   false             │       │ ► CỘNG VÍ NGAY     │                    │
│    └──────────┬──────────┘       └──────────┬──────────┘                    │
│               │                              │                              │
│               └──────────────┬───────────────┘                              │
│                              │                                               │
│                              ▼                                               │
│         ┌────────────────────────────────────────┐                          │
│         │  API: PUT /api/sepay/transaction/{id}/hidden                      │
│         │  Body: { hidden: true }                                           │
│         └────────────────────┬───────────────────┘                          │
│                              │                                               │
│                              ▼                                               │
│         ┌────────────────────────────────────────┐                          │
│         │  is_hidden = true                                                 │
│         │  → Giao dịch chuyển sang "ĐÃ XÁC NHẬN" trong Live Mode           │
│         └────────────────────────────────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 8.7.4 Phân loại giao dịch trong Live Mode

**Live Mode classification (live-mode.js - classifyTransaction):**
```javascript
function classifyTransaction(tx) {
    // ĐÃ XÁC NHẬN: is_hidden = true
    if (tx.is_hidden === true) {
        return 'confirmed';
    }

    // TỰ ĐỘNG GÁN: CHỈ các phương thức tự động
    const autoMethods = ['qr_code', 'exact_phone', 'single_match'];
    if (tx.customer_phone && !tx.has_pending_match && autoMethods.includes(tx.match_method)) {
        return 'autoMatched';
    }

    // NHẬP TAY: Tất cả trường hợp còn lại
    // - Chưa có khách hàng
    // - Có pending match
    // - match_method là manual_entry, manual_link, pending_match
    return 'manual';
}
```

**Kết quả phân loại:**

| `is_hidden` | `match_method` | Column | Có nút "Sửa"? |
|-------------|----------------|--------|---------------|
| `true` | `manual_entry` | ĐÃ XÁC NHẬN | ✅ Có (nếu chưa APPROVED) |
| `true` | `manual_link` | ĐÃ XÁC NHẬN | ❌ Không |
| `true` | `qr_code`, `exact_phone` | ĐÃ XÁC NHẬN | ❌ Không |
| `false` | `qr_code`, `exact_phone`, `single_match` | TỰ ĐỘNG GÁN | ❌ Không |
| `false` | Khác hoặc không có | NHẬP TAY | ✅ Có (input phone) |

#### 8.7.5 Edit Permission trong ĐÃ XÁC NHẬN

```javascript
// live-mode.js - renderConfirmedCards()
// Chỉ cho phép sửa với giao dịch NHẬP TAY, chưa APPROVED, chưa cộng ví
const canEdit = tx.match_method === 'manual_entry'
    && tx.verification_status !== 'APPROVED'
    && tx.wallet_processed !== true;

// Hiển thị nút Sửa nếu canEdit = true
${canEdit ? `<button class="btn-edit" data-id="${tx.id}">Sửa</button>` : ''}
```

**Lý do:**
- Giao dịch `manual_entry` chưa được kế toán duyệt → cho phép sửa lại nếu nhập sai
- Giao dịch đã `APPROVED` hoặc `wallet_processed = true` → KHÔNG cho sửa vì đã cộng ví
- Giao dịch tự động (`qr_code`, `exact_phone`) → KHÔNG cho sửa vì độ tin cậy cao

---

## 9. UI FLOW & EVENT LISTENERS

### 9.1 Main Tab Switching

```javascript
// index.html inline script
function switchMainTab(section) {
    // Update tab active states
    document.querySelectorAll('.main-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.section === section);
    });

    // Update panel visibility
    document.querySelectorAll('.main-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Show selected panel and load data
    switch(section) {
        case 'balance-history':
            document.getElementById('balanceHistoryPanel').classList.add('active');
            if (window._balanceHistoryNeedsReload) {
                loadData(true);
                window._balanceHistoryNeedsReload = false;
            }
            break;
        case 'transfer-stats':
            document.getElementById('transferStatsPanel').classList.add('active');
            loadTransferStats();
            break;
        case 'verification':
            document.getElementById('verificationPanel').classList.add('active');
            VerificationModule.loadVerificationQueue();
            loadVerificationStats();
            break;
    }

    localStorage.setItem('bh_main_tab', section);
}
```

### 9.2 Balance History Event Flow

```
Page Load
    ↓
DOMContentLoaded
    ↓
├── setDefaultCurrentMonth() - Set date filter (30 days)
├── setupEventListeners() - Attach all listeners
├── setupVerificationFilterChips() - Setup filter chips
├── loadData() - Load transactions (cache-first)
├── loadStatistics() - Load stats
├── loadVerificationStats() - Load verification stats
└── CustomerInfoManager.init() - Init customer info (background)
```

### 9.3 Search & Filter Flow

```
User types in search box
    ↓
debounce(500ms)
    ↓
applyFilters() - Update filter state
    ↓
loadData() - Fetch from API or cache
    ↓
renderCurrentView() - Filter by viewMode
    ↓
renderTable() - Render HTML
```

### 9.4 Real-time Updates (SSE)

```javascript
// main.js connectRealtimeUpdates()
SSE /api/sepay/stream
    ↓
Events:
├── "new_transaction" → handleNewTransaction()
│   ├── Add to allLoadedData
│   ├── Re-render table
│   └── addNewTransferStatRealtime() (transfer-stats.js)
│
├── "customer_info_updated" → handleCustomerInfoUpdated()
│   └── Refresh affected rows
│
└── "pending_match_created" → handlePendingMatchCreated()
    └── Refresh table to show dropdown
```

---

## 10. FLOW DIAGRAMS

### 10.1 Complete Transaction Flow
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
3. Hoặc extract phone từ content
4. Tìm customer mapping
5. Set verification_status:
   - AUTO_APPROVED (QR/exact phone)
   - PENDING_VERIFICATION (manual/partial)
6. Nếu AUTO_APPROVED → Cập nhật công nợ

PHASE 6: VERIFICATION (if needed)
Kế toán:
├→ Approve → Cập nhật công nợ
├→ Change + Approve → Sửa SĐT + cập nhật công nợ
└→ Reject → Ghi lý do, không cập nhật công nợ

PHASE 7: REALTIME UPDATE
Backend SSE → Frontend → Refresh table
```

### 10.2 Cache Strategy
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

## 11. CẤU HÌNH & ENVIRONMENT

### 11.1 API Endpoints
```javascript
// Production (via Cloudflare Worker)
API_BASE_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev'

// Alternative (direct to Render)
// API_BASE_URL: 'https://n2store-fallback.onrender.com'

// Local development
// API_BASE_URL: 'http://localhost:3000'
```

### 11.2 Environment Variables (Backend)
```bash
DATABASE_URL=postgresql://user:password@host:port/database
SEPAY_API_KEY=sepay_sk_xxx  # Optional, for webhook authentication
TPOS_TOKEN=xxx              # For TPOS API calls
```

### 11.3 Firebase Config
```javascript
// File: ../shared/js/firebase-config.js
window.FIREBASE_CONFIG = {
    apiKey: "xxx",
    authDomain: "xxx.firebaseapp.com",
    projectId: "xxx",
    storageBucket: "xxx.appspot.com",
    messagingSenderId: "xxx",
    appId: "xxx"
};
```

### 11.4 LocalStorage Keys
| Key | Purpose |
|-----|---------|
| `balance_history_customer_info` | Customer info cache |
| `bh_cache_*` | Transaction data cache (5 min TTL) |
| `bh_view_mode` | Current view mode (all/visible/hidden/no-phone) |
| `bh_main_tab` | Current main tab |
| `n2shop_current_user` | Current user info |

---

## 12. DEPENDENCIES & LIBRARIES

### 12.1 Frontend Dependencies
| Library | Version | Purpose |
|---------|---------|---------|
| Lucide Icons | latest | Icon system |
| Firebase | 9.6.1 | Firestore sync |

### 12.2 CDN Links
```html
<script src="https://unpkg.com/lucide@latest"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js"></script>
```

### 12.3 Shared Libraries
```html
<!-- ES Module compatibility -->
<script type="module" src="../shared/esm/compat.js"></script>
```

### 12.4 Backend Dependencies (Render.com)
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

## APPENDIX B: Verification Status Values

| Value | Meaning |
|-------|---------|
| `AUTO_APPROVED` | Tự động duyệt (QR/exact phone match) |
| `PENDING_VERIFICATION` | Chờ kế toán duyệt |
| `APPROVED` | Kế toán đã duyệt |
| `REJECTED` | Kế toán từ chối |
| `PENDING` | Chờ xử lý (legacy) |

## APPENDIX C: Match Method Values

| Value | Meaning |
|-------|---------|
| `qr_code` | Match từ QR code (N2...) |
| `exact_phone` | Match chính xác 10 số SĐT |
| `single_match` | Tự động match 1 KH duy nhất |
| `pending_match` | NV chọn từ dropdown |
| `manual_entry` | NV nhập SĐT thủ công |
| `manual_link` | Kế toán gán tay |

---

**Document Version**: 2.0
**Last Updated**: January 2025
**Author**: AI Agent Documentation System
