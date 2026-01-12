# Hướng Dẫn Hiện Thực Tính Năng Lịch Sử Biến Động Số Dư

Tài liệu này mô tả chi tiết cách hiện thực tính năng **Lịch sử biến động số dư** với tích hợp **SePay Webhook API** để theo dõi giao dịch ngân hàng realtime.

> [!NOTE]
> **Cập nhật lần cuối:** 2026-01-06
> Tài liệu này được tạo dựa trên phân tích mã nguồn thực tế trong thư mục `balance-history/`.

---

## Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu Trúc File](#2-cấu-trúc-file)
3. [Backend API](#3-backend-api)
4. [Tích Hợp SePay Webhook](#4-tích-hợp-sepay-webhook)
5. [Frontend Components](#5-frontend-components)
6. [Hệ Thống Xác Thực](#6-hệ-thống-xác-thực)
7. [Quản Lý Cache](#7-quản-lý-cache)
8. [Tạo QR Code Chuyển Khoản](#8-tạo-qr-code-chuyển-khoản)
9. [Quản Lý Thông Tin Khách Hàng](#9-quản-lý-thông-tin-khách-hàng)
10. [Mapping Khách Hàng Theo SĐT](#10-mapping-khách-hàng-theo-sđt)
11. [Thu Thập Và Tính Toán Công Nợ](#11-thu-thập-và-tính-toán-công-nợ)
12. [Tích Hợp TPOS OData API](#12-tích-hợp-tpos-odata-api)
13. [Phát Hiện Giao Dịch Thiếu (Gap Detection)](#13-phát-hiện-giao-dịch-thiếu-gap-detection)
14. [Realtime Updates (SSE)](#14-realtime-updates-sse)
15. [Triển Khai](#15-triển-khai)
16. [Column Visibility Control](#16-column-visibility-control)
17. [Fetch Missing Transaction](#17-fetch-missing-transaction)
18. [Tổng Hợp Các Hàm Chính](#18-tổng-hợp-các-hàm-chính-trong-mainjs)
19. [Cấu Trúc Dữ Liệu Cho Customer Wallet](#19-cấu-trúc-dữ-liệu-cho-customer-wallet-integration)



---

## 1. Tổng Quan Kiến Trúc

```mermaid
flowchart TD
    subgraph Bank["Ngân Hàng"]
        ACB[ACB Bank]
    end
    
    subgraph SePay["SePay Service"]
        SW[SePay Webhook]
    end
    
    subgraph Backend["Backend Services"]
        CF[Cloudflare Worker]
        RD[Render.com Server]
        PG[(PostgreSQL)]
    end
    
    subgraph Frontend["Frontend"]
        UI[Balance History UI]
        QR[QR Generator]
        CM[Customer Manager]
    end
    
    subgraph Storage["Client Storage"]
        LS[LocalStorage]
        FB[(Firebase)]
    end
    
    ACB -->|Transaction| SW
    SW -->|Webhook POST| CF
    CF -->|Proxy| RD
    RD -->|Store| PG
    
    UI -->|API Request| CF
    CF -->|Response| UI
    
    QR -->|Generate| UI
    CM -->|Save| LS
    CM -->|Sync| FB
```

### Luồng Dữ Liệu

1. **Webhook Flow**: Ngân hàng → SePay → Cloudflare Worker → Render.com → PostgreSQL
2. **API Flow**: Frontend → Cloudflare Worker → Render.com → PostgreSQL
3. **Realtime Flow**: Server → SSE → Frontend

---

## 2. Cấu Trúc File

```
balance-history/
├── index.html              # Giao diện chính (561 dòng)
├── main.js                 # Logic chính (2592 dòng)
├── config.js               # Cấu hình API endpoints (32 dòng)
├── auth.js                 # Hệ thống xác thực (223 dòng)
├── cache.js                # Quản lý cache với localStorage (197 dòng)
├── customer-info.js        # Quản lý thông tin khách hàng (443 dòng)
├── qr-generator.js         # Tạo QR code VietQR (223 dòng)
├── notification-system.js  # Hệ thống thông báo (438 dòng)
├── modern.css              # CSS framework/design system
├── styles.css              # Custom styles cho trang
│
├── IMPLEMENTATION_GUIDE.md # Tài liệu hướng dẫn chi tiết (file này)
├── DEPLOYMENT_GUIDE.md     # Hướng dẫn triển khai
├── README.md               # Tài liệu cơ bản
├── QR_DEBT_FLOW.md         # Tài liệu flow QR và công nợ
├── PHONE_EXTRACTION_FEATURE.md     # Tài liệu trích xuất SĐT
├── PHONE_EXTRACTION_IMPROVEMENTS.md # Cải tiến trích xuất SĐT
├── PARTIAL_PHONE_TPOS_SEARCH.md    # Tìm kiếm SĐT một phần
├── PHONE_PARTNER_FETCH_GUIDE.md    # Hướng dẫn fetch partner
├── PR_SUMMARY.md           # Tóm tắt PR
│
├── SETUP_ALL.sql           # Script SQL khởi tạo database
├── ADD_EXTRACTION_COLUMNS.sql      # Script bổ sung cột extraction
└── DEBUG_SCRIPT.sql        # Script debug

../js/
├── firebase-config.js      # Cấu hình Firebase (shared)
└── navigation-modern.js    # Navigation (shared)
```

---

## 3. Backend API

### 3.1 API Endpoints

> [!IMPORTANT]
> Tất cả API endpoints đều thông qua **Cloudflare Worker** để proxy tới Render.com backend.

| Endpoint | Method | Mô Tả |
|----------|--------|-------|
| `/api/sepay/webhook` | POST | Nhận webhook từ SePay |
| `/api/sepay/history` | GET | Lấy lịch sử giao dịch |
| `/api/sepay/statistics` | GET | Thống kê giao dịch |
| `/api/sepay/customer-info` | GET/POST | CRUD thông tin khách hàng |
| `/api/sepay/detect-gaps` | GET | Phát hiện giao dịch thiếu |
| `/api/sepay/gaps` | GET | Lấy danh sách gaps |
| `/api/sepay/gaps/:id/ignore` | POST | Bỏ qua gap |
| `/api/sepay/stream` | GET | SSE stream realtime |
| `/api/sepay/debt-summary` | GET | Tổng công nợ theo SĐT |
| `/api/sepay/fetch-by-reference/:code` | POST | Lấy lại GD thiếu từ SePay |
| `/api/sepay/transactions-by-phone` | GET | Lấy GD theo số điện thoại |
| `/api/sepay/retry-failed-queue` | POST | Retry tất cả webhooks failed |
| `/api/customers/search` | GET | Tìm kiếm khách hàng |


### 3.2 Cấu Hình API (config.js)

```javascript
const CONFIG = {
    // API Base URL - Thay đổi theo môi trường
    API_BASE_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    
    // Pagination
    ITEMS_PER_PAGE: 50,
    
    // Auto-refresh interval (milliseconds) - 0 = disable
    AUTO_REFRESH_INTERVAL: 0,
    
    // Cache expiry - 5 minutes
    CACHE_EXPIRY: 5 * 60 * 1000,
    
    // Date format
    DATE_FORMAT: 'vi-VN',
    
    // Currency
    CURRENCY: 'VND',
    CURRENCY_LOCALE: 'vi-VN'
};

window.CONFIG = CONFIG;
```

### 3.3 Database Schema

```sql
-- Table: balance_history
CREATE TABLE balance_history (
    id SERIAL PRIMARY KEY,
    sepay_id INTEGER UNIQUE NOT NULL,
    gateway VARCHAR(100) NOT NULL,
    transaction_date TIMESTAMP WITH TIME ZONE,
    account_number VARCHAR(50),
    code VARCHAR(100),
    content TEXT,
    transfer_type VARCHAR(10) CHECK (transfer_type IN ('in', 'out')),
    transfer_amount DECIMAL(20, 2) NOT NULL,
    accumulated DECIMAL(20, 2),
    sub_account VARCHAR(50),
    reference_code VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_balance_history_date ON balance_history(transaction_date DESC);
CREATE INDEX idx_balance_history_type ON balance_history(transfer_type);
CREATE INDEX idx_balance_history_gateway ON balance_history(gateway);
CREATE INDEX idx_balance_history_reference ON balance_history(reference_code);

-- Table: sepay_webhook_logs
CREATE TABLE sepay_webhook_logs (
    id SERIAL PRIMARY KEY,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- View: balance_statistics
CREATE VIEW balance_statistics AS
SELECT 
    DATE(transaction_date) as date,
    COUNT(*) as total_transactions,
    SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE 0 END) as total_in,
    SUM(CASE WHEN transfer_type = 'out' THEN transfer_amount ELSE 0 END) as total_out,
    SUM(CASE WHEN transfer_type = 'in' THEN 1 ELSE 0 END) as in_count,
    SUM(CASE WHEN transfer_type = 'out' THEN 1 ELSE 0 END) as out_count
FROM balance_history
GROUP BY DATE(transaction_date);
```

---

## 4. Tích Hợp SePay Webhook

> [!CAUTION]
> **Đây là phần quan trọng nhất** - cần cấu hình đúng để nhận được giao dịch realtime.

### 4.1 Đăng Ký Webhook Trên SePay

1. Đăng nhập vào [SePay Dashboard](https://my.sepay.vn/)
2. Vào **Cài đặt** → **Webhook**
3. Thêm webhook mới với các thông tin:

| Trường | Giá Trị |
|--------|---------|
| **URL** | `https://your-worker.workers.dev/api/sepay/webhook` |
| **Method** | POST |
| **Authentication** | API Key (khuyến nghị) |
| **API Key** | `sepay_sk_xxxxxxxx` (do SePay tạo) |

### 4.2 Cấu Hình Authentication

**Phương thức 1: API Key (Khuyến nghị)**

```javascript
// Trong backend server (render.com/routes/sepay-webhook.js)
router.post('/webhook', async (req, res) => {
    // Kiểm tra API Key
    const authHeader = req.headers.authorization;
    const expectedKey = process.env.SEPAY_API_KEY;
    
    if (expectedKey && authHeader !== `Apikey ${expectedKey}`) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid API Key' 
        });
    }
    
    // Xử lý webhook...
});
```

**Environment Variables cần thiết trên Render.com:**

```bash
SEPAY_API_KEY=sepay_sk_xxxxxxxx
DATABASE_URL=postgresql://user:password@host:port/database
```

### 4.3 Payload Webhook Từ SePay

```json
{
    "id": 92704,
    "gateway": "ACB",
    "transactionDate": "2024-12-21 14:02:37",
    "accountNumber": "75918",
    "code": null,
    "content": "N2ABCD1234EFGH5678 chuyen khoan",
    "transferType": "in",
    "transferAmount": 2277000,
    "accumulated": 19077000,
    "subAccount": null,
    "referenceCode": "2567",
    "description": ""
}
```

### 4.4 Xử Lý Webhook

```javascript
router.post('/webhook', async (req, res) => {
    const {
        id: sepay_id,
        gateway,
        transactionDate,
        accountNumber,
        code,
        content,
        transferType,
        transferAmount,
        accumulated,
        subAccount,
        referenceCode,
        description
    } = req.body;

    try {
        // Log webhook request
        await pool.query(
            `INSERT INTO sepay_webhook_logs 
             (request_body, response_status, ip_address) 
             VALUES ($1, $2, $3)`,
            [req.body, 200, req.ip]
        );

        // Insert transaction (ignore if duplicate)
        const result = await pool.query(
            `INSERT INTO balance_history 
             (sepay_id, gateway, transaction_date, account_number, 
              code, content, transfer_type, transfer_amount, 
              accumulated, sub_account, reference_code, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (sepay_id) DO NOTHING
             RETURNING id`,
            [sepay_id, gateway, transactionDate, accountNumber,
             code, content, transferType, transferAmount,
             accumulated, subAccount, referenceCode, description]
        );

        res.json({ 
            success: true, 
            id: result.rows[0]?.id,
            message: 'Transaction recorded successfully'
        });

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});
```

### 4.5 Cloudflare Worker Proxy

```javascript
// cloudflare-worker/worker.js
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        
        // CORS Headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };
        
        // Handle OPTIONS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
        // Proxy to Render.com backend
        if (url.pathname.startsWith('/api/sepay')) {
            const backendUrl = `https://n2store-fallback.onrender.com${url.pathname}${url.search}`;
            
            const response = await fetch(backendUrl, {
                method: request.method,
                headers: request.headers,
                body: request.body,
            });
            
            // Add CORS headers to response
            const newHeaders = new Headers(response.headers);
            for (const [key, value] of Object.entries(corsHeaders)) {
                newHeaders.set(key, value);
            }
            
            return new Response(response.body, {
                status: response.status,
                headers: newHeaders,
            });
        }
        
        return new Response('Not Found', { status: 404 });
    }
};
```

---

## 5. Frontend Components

### 5.1 Giao Diện Chính (index.html)

**Cấu trúc HTML chính:**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lịch sử biến động số dư - Sepay</title>
    
    <!-- Icons -->
    <script src="https://unpkg.com/lucide@latest"></script>
    
    <!-- Styles -->
    <link rel="stylesheet" href="modern.css">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- Sidebar Navigation -->
    <aside class="sidebar" id="sidebar">
        <!-- Auto-generated by navigation-modern.js -->
    </aside>

    <!-- Main Content -->
    <div class="main-content">
        <!-- Header với Inline QR Generator -->
        <header class="header">
            <h1>Lịch sử biến động số dư</h1>
            <div class="inline-qr-form">
                <input type="text" id="inlineCustomerName" placeholder="Tên khách hàng">
                <input type="tel" id="inlineCustomerPhone" placeholder="SĐT (tùy chọn)">
                <button id="inlineGenerateQRBtn">Tạo QR</button>
            </div>
        </header>

        <!-- Statistics Cards -->
        <div class="stats-container">
            <!-- Tổng tiền vào -->
            <div class="stat-card">
                <p id="totalIn">0 ₫</p>
                <small id="totalInCount">0 giao dịch</small>
            </div>
            <!-- Tổng tiền ra -->
            <div class="stat-card">
                <p id="totalOut">0 ₫</p>
            </div>
            <!-- Biến động ròng -->
            <div class="stat-card">
                <p id="netChange">0 ₫</p>
            </div>
            <!-- Số dư hiện tại -->
            <div class="stat-card">
                <p id="latestBalance">0 ₫</p>
            </div>
            <!-- Gap Detection Card -->
            <div class="stat-card" id="gapCard" style="display: none;">
                <p id="totalGaps">0</p>
                <small>Giao dịch thiếu</small>
            </div>
        </div>

        <!-- Quick Date Filters -->
        <div class="quick-filters">
            <button data-filter="today">Hôm nay</button>
            <button data-filter="yesterday">Hôm qua</button>
            <button data-filter="thisWeek">Tuần này</button>
            <button data-filter="thisMonth" class="active">Tháng này</button>
            <!-- ... -->
        </div>

        <!-- Advanced Filters -->
        <div class="filters">
            <select id="filterType">
                <option value="">Tất cả</option>
                <option value="in">Tiền vào</option>
                <option value="out">Tiền ra</option>
            </select>
            <input type="text" id="filterGateway" placeholder="Ngân hàng">
            <input type="date" id="filterStartDate">
            <input type="date" id="filterEndDate">
            <input type="text" id="filterSearch" placeholder="Tìm kiếm...">
            <input type="text" id="filterAmount" placeholder="Số tiền (VD: 100k)">
        </div>

        <!-- Data Table -->
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
                    <th>QR Code</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody id="tableBody">
                <!-- Dynamic content -->
            </tbody>
        </table>

        <!-- Pagination -->
        <div class="pagination">
            <button id="prevPageBtn">Trước</button>
            <span id="pageInfo">Trang 1 / 1</span>
            <button id="nextPageBtn">Sau</button>
        </div>
    </div>

    <!-- Modals -->
    <div id="detailModal" class="modal"><!-- Chi tiết giao dịch --></div>
    <div id="rawDataModal" class="modal"><!-- Xem raw JSON --></div>
    <div id="qrModal" class="modal"><!-- QR Code popup --></div>
    <div id="customerListModal" class="modal"><!-- Danh sách KH theo SĐT --></div>
    <div id="editCustomerModal" class="modal"><!-- Sửa thông tin KH --></div>
    <div id="gapsModal" class="modal"><!-- Giao dịch thiếu --></div>

    <!-- Scripts -->
    <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js"></script>
    <script src="../js/firebase-config.js"></script>
    <script src="../js/navigation-modern.js"></script>
    <script src="auth.js"></script>
    <script src="cache.js"></script>
    <script src="config.js"></script>
    <script src="qr-generator.js"></script>
    <script src="customer-info.js"></script>
    <script src="main.js"></script>
    <script>lucide.createIcons();</script>
</body>
</html>
```

### 5.2 Load Dữ Liệu (main.js)

```javascript
// State
let currentPage = 1;
let totalPages = 1;
let currentQuickFilter = 'thisMonth';
let filters = {
    type: '',
    gateway: '',
    startDate: '',
    endDate: '',
    search: '',
    amount: ''
};

// API Base URL từ config
const API_BASE_URL = window.CONFIG?.API_BASE_URL || 
    'https://your-cloudflare-worker.workers.dev';

// Load Data
async function loadData() {
    showLoading();
    
    try {
        const queryParams = new URLSearchParams({
            page: currentPage,
            limit: 50,
            ...filters
        });
        
        // Remove empty params
        for (let [key, value] of queryParams.entries()) {
            if (!value) queryParams.delete(key);
        }
        
        const response = await fetch(
            `${API_BASE_URL}/api/sepay/history?${queryParams}`
        );
        
        const result = await response.json();
        
        if (result.success) {
            renderTable(result.data);
            updatePagination(result.pagination);
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Lỗi khi tải dữ liệu');
    } finally {
        hideLoading();
    }
}

// Load Statistics
async function loadStatistics() {
    try {
        const queryParams = new URLSearchParams({
            ...filters
        });
        
        const response = await fetch(
            `${API_BASE_URL}/api/sepay/statistics?${queryParams}`
        );
        
        const result = await response.json();
        
        if (result.success) {
            renderStatistics(result.statistics);
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Render Statistics
function renderStatistics(stats) {
    document.getElementById('totalIn').textContent = formatCurrency(stats.total_in);
    document.getElementById('totalInCount').textContent = `${stats.total_in_count} giao dịch`;
    document.getElementById('totalOut').textContent = formatCurrency(stats.total_out);
    document.getElementById('totalOutCount').textContent = `${stats.total_out_count} giao dịch`;
    document.getElementById('netChange').textContent = formatCurrency(stats.net_change);
    document.getElementById('latestBalance').textContent = formatCurrency(stats.latest_balance);
}
```

### 5.3 Quick Filter Dates

```javascript
function getQuickFilterDates(filterType) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate, endDate;
    
    switch (filterType) {
        case 'today':
            startDate = new Date(today);
            endDate = new Date(today);
            break;
            
        case 'yesterday':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(startDate);
            break;
            
        case 'thisWeek':
            startDate = new Date(today);
            const dayOfWeek = startDate.getDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            startDate.setDate(startDate.getDate() + diffToMonday);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            break;
            
        case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
            
        case 'lastMonth':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
            
        case 'last7days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 6);
            endDate = new Date(today);
            break;
            
        case 'last30days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 29);
            endDate = new Date(today);
            break;
    }
    
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
}
```

### 5.4 Parse Amount Input

```javascript
// Hỗ trợ: 100000, 100k, 1m, 1.5tr
function parseAmountInput(input) {
    if (!input) return '';
    
    let normalized = input.trim().toLowerCase();
    
    if (normalized.endsWith('k')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000));
    }
    if (normalized.endsWith('m')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }
    if (normalized.endsWith('tr')) {
        const num = parseFloat(normalized.slice(0, -2).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }
    
    return normalized.replace(/[^\d]/g, '') || '';
}
```

---

## 6. Hệ Thống Xác Thực

### 6.1 AuthManager Class

```javascript
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        try {
            // Check sessionStorage first, then localStorage
            let authData = sessionStorage.getItem("loginindex_auth");
            let isFromSession = true;

            if (!authData) {
                authData = localStorage.getItem("loginindex_auth");
                isFromSession = false;
            }

            if (authData) {
                const auth = JSON.parse(authData);
                if (this.isValidSession(auth, isFromSession)) {
                    this.currentUser = auth;
                    return true;
                } else {
                    this.clearAuth();
                }
            }
        } catch (error) {
            console.error("Error reading auth:", error);
            this.clearAuth();
        }
        return false;
    }

    isValidSession(auth, isFromSession = false) {
        if (!auth.isLoggedIn || !auth.userType || auth.checkLogin === undefined) {
            return false;
        }

        // Session timeout
        const SESSION_TIMEOUT = isFromSession
            ? 8 * 60 * 60 * 1000  // 8 hours for session
            : 30 * 24 * 60 * 60 * 1000; // 30 days for remembered

        if (auth.timestamp && Date.now() - auth.timestamp > SESSION_TIMEOUT) {
            return false;
        }

        return true;
    }

    isAuthenticated() {
        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === "true";
    }

    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;
        return parseInt(auth.checkLogin) <= requiredLevel;
    }

    logout() {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    }
}

// Initialize immediately
const authManager = new AuthManager();
window.authManager = authManager;

// Redirect if not authenticated
if (!authManager.isAuthenticated()) {
    setTimeout(() => {
        if (!authManager.isAuthenticated()) {
            window.location.href = "../index.html";
        }
    }, 500);
}
```

---

## 7. Quản Lý Cache

### 7.1 CacheManager Class

```javascript
class CacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || 5 * 60 * 1000; // 5 minutes
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || "balance_history_cache";
        this.loadFromStorage();
        
        // Auto cleanup every 5 minutes
        setInterval(() => this.cleanExpired(), 5 * 60 * 1000);
    }

    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
        } catch (error) {
            if (error.name === "QuotaExceededError") {
                this.cache.clear();
            }
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const cacheData = JSON.parse(stored);
            const now = Date.now();

            cacheData.forEach(([key, value]) => {
                if (value.expires > now) {
                    this.cache.set(key, value);
                }
            });
        } catch (error) {
            console.warn("[CACHE] Cannot load:", error);
        }
    }

    set(key, value, type = "general") {
        const cacheKey = `${type}_${key}`;
        this.cache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expires: Date.now() + this.maxAge,
            type,
        });
        this.debouncedSave();
    }

    get(key, type = "general") {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
            this.stats.hits++;
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
        }

        this.stats.misses++;
        return null;
    }

    clear(type = null) {
        if (type) {
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
            localStorage.removeItem(this.storageKey);
        }
    }
}

const cacheManager = new CacheManager();
window.cacheManager = cacheManager;
```

---

## 8. Tạo QR Code Chuyển Khoản

### 8.1 QRGenerator Object

```javascript
const QRGenerator = {
    // Bank configuration
    BANK_CONFIG: {
        ACB: {
            bin: '970416',      // Mã BIN ngân hàng
            name: 'ACB',
            accountNo: '75918', // Số tài khoản
            accountName: 'LAI THUY YEN NHI'
        }
    },

    /**
     * Generate unique transaction code
     * Format: N2 + 16 characters = 18 chars total
     * Example: "N2ABCD1234EFGH5678"
     */
    generateUniqueCode(prefix = 'N2') {
        const timestamp = Date.now().toString(36).toUpperCase().slice(-8);
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        const sequence = Math.floor(Math.random() * 1296)
            .toString(36).toUpperCase().padStart(2, '0');
        
        return `${prefix}${timestamp}${random}${sequence}`;
    },

    /**
     * Generate VietQR URL
     * @param {Object} options - { uniqueCode, amount, template }
     */
    generateVietQRUrl(options = {}) {
        const { uniqueCode, amount = 0, template = 'qr_only' } = options;
        const bank = this.BANK_CONFIG.ACB;
        
        // VietQR URL format: {BANK_BIN}-{ACCOUNT_NO}-{TEMPLATE}.png
        const baseUrl = 'https://img.vietqr.io/image';
        let url = `${baseUrl}/${bank.bin}-${bank.accountNo}-${template}.png`;
        
        const params = new URLSearchParams();
        if (amount > 0) {
            params.append('amount', amount);
        }
        params.append('addInfo', uniqueCode);
        params.append('accountName', bank.accountName);
        
        return `${url}?${params.toString()}`;
    },

    /**
     * Generate deposit QR with new unique code
     */
    generateDepositQR(amount = 0) {
        const uniqueCode = this.generateUniqueCode();
        const qrUrl = this.generateVietQRUrl({ uniqueCode, amount });
        
        return {
            uniqueCode,
            qrUrl,
            bankInfo: {
                bank: this.BANK_CONFIG.ACB.name,
                accountNo: this.BANK_CONFIG.ACB.accountNo,
                accountName: this.BANK_CONFIG.ACB.accountName
            },
            amount,
            createdAt: new Date().toISOString()
        };
    },

    /**
     * Regenerate QR from existing unique code
     */
    regenerateQR(uniqueCode, amount = 0) {
        const qrUrl = this.generateVietQRUrl({ uniqueCode, amount });
        
        return {
            uniqueCode,
            qrUrl,
            bankInfo: this.BANK_CONFIG.ACB,
            amount
        };
    },

    /**
     * Copy QR URL to clipboard
     */
    async copyQRUrl(qrUrl) {
        try {
            await navigator.clipboard.writeText(qrUrl);
            return true;
        } catch (error) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = qrUrl;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        }
    },

    /**
     * Download QR image
     */
    async downloadQRImage(qrUrl, filename = 'qr-code.png') {
        try {
            const response = await fetch(qrUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return true;
        } catch (error) {
            return false;
        }
    }
};

window.QRGenerator = QRGenerator;
```

### 8.2 Tạo Custom QR Image (Với Canvas)

```javascript
/**
 * Create custom QR image with bank info but WITHOUT account number
 * @param {string} qrUrl - Original QR URL
 * @param {string} customerInfo - Customer name to display
 * @returns {Promise<Blob>} - PNG image blob
 */
async function createCustomQRImage(qrUrl, customerInfo = '') {
    return new Promise(async (resolve, reject) => {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                const padding = 30;
                const hasCustomer = customerInfo && customerInfo.trim();
                const textAreaHeight = hasCustomer ? 105 : 80;
                const canvasWidth = img.width + padding * 2;
                const canvasHeight = img.height + padding * 2 + textAreaHeight;

                const canvas = document.createElement('canvas');
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                const ctx = canvas.getContext('2d');

                // White background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);

                // Draw QR code
                const qrX = (canvasWidth - img.width) / 2;
                ctx.drawImage(img, qrX, padding, img.width, img.height);

                // Text area
                const textAreaY = img.height + padding * 1.5;
                ctx.fillStyle = '#f8f9fa';
                ctx.fillRect(padding / 2, textAreaY, canvasWidth - padding, textAreaHeight);

                // Bank info (NO account number!)
                ctx.fillStyle = '#333333';
                ctx.textAlign = 'center';
                const centerX = canvasWidth / 2;

                ctx.font = 'bold 16px Arial';
                ctx.fillText('Ngân hàng: ACB', centerX, textAreaY + 28);

                ctx.font = '15px Arial';
                ctx.fillText('Chủ tài khoản: LAI THUY YEN NHI', centerX, textAreaY + 55);

                // Customer info
                if (hasCustomer) {
                    ctx.font = 'bold 14px Arial';
                    ctx.fillStyle = '#10b981';
                    ctx.fillText('Khách hàng: ' + customerInfo, centerX, textAreaY + 82);
                }

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create blob'));
                }, 'image/png');
            };

            img.onerror = () => reject(new Error('Failed to load QR image'));
            img.src = qrUrl;
        } catch (error) {
            reject(error);
        }
    });
}
```

---

## 9. Quản Lý Thông Tin Khách Hàng

### 9.1 CustomerInfoManager

```javascript
const CustomerInfoManager = {
    STORAGE_KEY: 'balance_history_customer_info',
    API_BASE_URL: null,
    firebaseDb: null,

    init() {
        this.API_BASE_URL = window.CONFIG?.API_BASE_URL;
        this.initFirebase();
        this.syncFromDatabase();
    },

    initFirebase() {
        if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG) {
            return;
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(window.FIREBASE_CONFIG);
        }

        this.firebaseDb = firebase.firestore();
        this.customersCollection = this.firebaseDb.collection('customers');
    },

    /**
     * Sync from PostgreSQL to localStorage
     */
    async syncFromDatabase() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/sepay/customer-info`);
            const result = await response.json();

            if (result.success && result.data) {
                const customerData = {};
                result.data.forEach(item => {
                    customerData[item.unique_code] = {
                        name: item.customer_name || '',
                        phone: item.customer_phone || '',
                        updatedAt: item.updated_at
                    };
                });

                this.saveAllCustomerInfo(customerData);
            }
        } catch (error) {
            console.error('[CUSTOMER-INFO] Sync failed:', error);
        }
    },

    /**
     * Get customer info by unique code
     */
    getCustomerInfo(uniqueCode) {
        if (!uniqueCode) return null;
        const allData = this.getAllCustomerInfo();
        return allData[uniqueCode] || null;
    },

    /**
     * Save customer info
     */
    async saveCustomerInfo(uniqueCode, customerInfo) {
        if (!uniqueCode) return false;

        // Save to localStorage
        const allData = this.getAllCustomerInfo();
        allData[uniqueCode] = {
            name: customerInfo.name || '',
            phone: customerInfo.phone || '',
            updatedAt: new Date().toISOString()
        };
        this.saveAllCustomerInfo(allData);

        // Save to PostgreSQL via API
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/sepay/customer-info`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uniqueCode,
                    customerName: customerInfo.name,
                    customerPhone: customerInfo.phone
                })
            });

            const result = await response.json();
            if (result.success) {
                // Sync to Firebase (optional)
                await this.syncToFirebase(customerInfo);
                return true;
            }
        } catch (error) {
            console.error('[CUSTOMER-INFO] Save failed:', error);
        }
        
        return true; // Still return true (saved to localStorage)
    },

    /**
     * Get display info
     */
    getCustomerDisplay(uniqueCode) {
        const info = this.getCustomerInfo(uniqueCode);

        if (!info || (!info.name && !info.phone)) {
            return {
                name: 'Chưa có thông tin',
                phone: 'Chưa có thông tin',
                hasInfo: false
            };
        }

        return {
            name: info.name || 'Chưa có thông tin',
            phone: info.phone || 'Chưa có thông tin',
            hasInfo: true
        };
    },

    // localStorage helpers
    getAllCustomerInfo() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch {
            return {};
        }
    },

    saveAllCustomerInfo(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch {
            return false;
        }
    }
};

window.CustomerInfoManager = CustomerInfoManager;
```

### 9.2 Trích Xuất Unique Code Từ Nội Dung

```javascript
// Trong renderTransactionRow()
function renderTransactionRow(row) {
    const content = row.content || '';
    
    // Tìm pattern N2 + 16 ký tự = 18 chars
    const uniqueCodeMatch = content.match(/\bN2[A-Z0-9]{16}\b/);
    const uniqueCode = uniqueCodeMatch ? uniqueCodeMatch[0] : null;

    let customerDisplay = { name: 'N/A', phone: 'N/A', hasInfo: false };
    if (uniqueCode && window.CustomerInfoManager) {
        customerDisplay = window.CustomerInfoManager.getCustomerDisplay(uniqueCode);
    }

    return `
        <tr>
            <td>${formatDateTime(row.transaction_date)}</td>
            <td>${row.gateway}</td>
            <td>${row.transfer_type === 'in' ? 'Tiền vào' : 'Tiền ra'}</td>
            <td>${formatCurrency(row.transfer_amount)}</td>
            <td>${formatCurrency(row.accumulated)}</td>
            <td>${content}</td>
            <td>${row.reference_code || 'N/A'}</td>
            <td>${customerDisplay.name}</td>
            <td>${customerDisplay.phone}</td>
            <td>
                ${uniqueCode ? `
                    <button onclick="showTransactionQR('${uniqueCode}')">QR</button>
                ` : 'N/A'}
            </td>
            <td>
                <button onclick="showDetail(${row.id})">Chi tiết</button>
            </td>
        </tr>
    `;
}
```

---

## 10. Mapping Khách Hàng Theo SĐT

> [!IMPORTANT]
> **Tính năng này cho phép tra cứu thông tin khách hàng từ nhiều nguồn** (PostgreSQL, TPOS) dựa trên số điện thoại từ giao dịch ngân hàng.

### 10.1 Tổng Quan Workflow

```mermaid
flowchart TD
    subgraph Input["Đầu Vào"]
        TX[Giao dịch ngân hàng]
        PHONE[Số điện thoại từ content]
    end
    
    subgraph Lookup["Tra Cứu Khách Hàng"]
        PROXY[Proxy API: /api/customers/search]
        TPOS[TPOS OData API Fallback]
        MERGE[Merge Duplicate Customers]
    end
    
    subgraph Output["Kết Quả"]
        MODAL[Customer List Modal]
        DEBT[Debt Summary]
        LINK[Link to Customer Management]
    end
    
    TX --> PHONE
    PHONE --> PROXY
    PROXY -->|Empty| TPOS
    PROXY -->|Has Data| MERGE
    TPOS --> MERGE
    MERGE --> MODAL
    MODAL --> DEBT
    MODAL --> LINK
```

### 10.2 API Endpoints

| Endpoint | Method | Mô Tả |
|----------|--------|-------|
| `/api/customers/search?q={phone}` | GET | Tìm khách hàng theo SĐT |
| `/api/sepay/transactions-by-phone?phone={phone}` | GET | Lấy giao dịch theo SĐT |
| `/api/sepay/debt-summary?phone={phone}` | GET | Tổng hợp công nợ theo SĐT |

### 10.3 Hàm showCustomersByPhone()

```javascript
/**
 * Show customers list by phone number
 * @param {string} phone - Phone number to search
 */
async function showCustomersByPhone(phone) {
    if (!phone || phone === 'N/A') {
        window.NotificationManager?.showNotification(
            'Không có số điện thoại để tìm kiếm', 'warning'
        );
        return;
    }

    const modal = document.getElementById('customerListModal');
    const loadingEl = document.getElementById('customerListLoading');
    const emptyEl = document.getElementById('customerListEmpty');
    const contentEl = document.getElementById('customerListContent');

    // Show modal and loading state
    modal.style.display = 'block';
    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';
    contentEl.style.display = 'none';

    try {
        // Fetch customers and transaction stats in parallel
        const [customersResponse, transactionsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/customers/search?q=${encodeURIComponent(phone)}&limit=50`),
            fetch(`${API_BASE_URL}/api/sepay/transactions-by-phone?phone=${encodeURIComponent(phone)}&limit=1`)
        ]);

        const customersResult = await customersResponse.json();
        let balanceStats = null;

        // Get balance statistics from transactions
        if (transactionsResponse.ok) {
            const transactionsResult = await transactionsResponse.json();
            if (transactionsResult.success && transactionsResult.statistics) {
                balanceStats = transactionsResult.statistics;
            }
        }

        // Filter customers with exact phone match
        let customers = (customersResult.data || []).filter(c => {
            const customerPhone = (c.phone || '').replace(/\D/g, '');
            const searchPhone = phone.replace(/\D/g, '');
            return customerPhone === searchPhone || 
                   customerPhone.endsWith(searchPhone) || 
                   searchPhone.endsWith(customerPhone);
        });

        // Fallback to TPOS OData API if proxy returned empty
        if (customers.length === 0) {
            const tposCustomers = await fetchCustomersFromTpos(phone);
            if (tposCustomers.length > 0) {
                customers = tposCustomers;
            }
        }

        renderCustomerList(customers, balanceStats, phone);

    } catch (error) {
        console.error('[CUSTOMER-LIST] Error:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
    }
}
```

### 10.4 Merge Customers Cùng SĐT

```javascript
/**
 * Merge customers with the same phone number
 * Khi có nhiều record KH trùng SĐT, gộp lại thành 1 record với:
 * - mergedNames: Array các tên khác nhau
 * - mergedAddresses: Array các địa chỉ khác nhau
 * - mergedIds: Array các ID để tham chiếu
 * - Status: Lấy status cao nhất (VIP > Nguy hiểm > Cảnh báo > Bom hàng > Bình thường)
 * - Debt: Lấy giá trị nợ cao nhất
 */
function mergeCustomersByPhone(customers) {
    const phoneMap = new Map();

    customers.forEach(customer => {
        const phone = (customer.phone || '').trim();
        if (!phone) {
            // Customers without phone are kept as-is
            const uniqueKey = `no_phone_${customer.id}`;
            phoneMap.set(uniqueKey, {
                ...customer,
                mergedNames: [customer.name || ''],
                mergedAddresses: [customer.address || ''],
                mergedIds: [customer.id]
            });
            return;
        }

        if (phoneMap.has(phone)) {
            // Merge with existing customer
            const existing = phoneMap.get(phone);
            const newName = (customer.name || '').trim();
            const newAddress = (customer.address || '').trim();

            // Add unique names
            if (newName && !existing.mergedNames.includes(newName)) {
                existing.mergedNames.push(newName);
            }

            // Add unique addresses
            if (newAddress && !existing.mergedAddresses.includes(newAddress)) {
                existing.mergedAddresses.push(newAddress);
            }

            // Merge IDs for reference
            existing.mergedIds.push(customer.id);

            // Keep the higher debt
            if ((customer.debt || 0) > (existing.debt || 0)) {
                existing.debt = customer.debt;
            }

            // Keep VIP or worse status
            existing.status = getMergedCustomerStatus(existing.status, customer.status);
        } else {
            // First occurrence
            phoneMap.set(phone, {
                ...customer,
                mergedNames: [customer.name || ''],
                mergedAddresses: [customer.address || ''],
                mergedIds: [customer.id]
            });
        }
    });

    return Array.from(phoneMap.values());
}

/**
 * Get merged status (prioritize VIP > Nguy hiểm > Cảnh báo > Bom hàng > Bình thường)
 */
function getMergedCustomerStatus(status1, status2) {
    const statusPriority = {
        'VIP': 5,
        'Nguy hiểm': 4,
        'Cảnh báo': 3,
        'Bom hàng': 2,
        'Bình thường': 1
    };

    const priority1 = statusPriority[status1] || 1;
    const priority2 = statusPriority[status2] || 1;

    return priority1 >= priority2 ? status1 : status2;
}
```

### 10.5 Customer List Modal UI

```html
<!-- Customer List Modal Structure -->
<div id="customerListModal" class="modal">
    <div class="modal-content modal-large">
        <div class="modal-header">
            <h3><i data-lucide="users"></i> Khách hàng - SĐT: <span id="customerListPhone"></span></h3>
            <button id="closeCustomerListModalBtn" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
            <!-- Loading State -->
            <div id="customerListLoading" style="display: none;">
                <div class="loading-spinner"></div>
            </div>
            
            <!-- Empty State -->
            <div id="customerListEmpty" style="display: none;">
                <p>Không tìm thấy khách hàng</p>
            </div>
            
            <!-- Content -->
            <div id="customerListContent" style="display: none;">
                <div id="customerListCount"></div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Tên KH</th>
                            <th>TPOS ID</th>
                            <th>Trạng thái</th>
                            <th>Công nợ</th>
                            <th>Địa chỉ</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="customerListTableBody"></tbody>
                </table>
            </div>
        </div>
    </div>
</div>
```

---

## 11. Thu Thập Và Tính Toán Công Nợ

> [!IMPORTANT]
> **Công nợ được tính toán dựa trên các giao dịch ngân hàng có liên kết SĐT của khách hàng.**

### 11.1 Workflow Tính Công Nợ

```mermaid
flowchart TD
    subgraph DataCollection["Thu Thập Dữ Liệu"]
        PHONE[Số điện thoại KH]
        UNIQUE_CODE[Mã giao dịch N2xxx]
        CUSTOMER_INFO[Thông tin KH từ customer_info table]
    end
    
    subgraph Processing["Xử Lý"]
        FILTER[Lọc giao dịch theo SĐT]
        GROUP[Nhóm theo khách hàng]
        SUM[Tính tổng tiền vào]
    end
    
    subgraph Output["Kết Quả"]
        TOTAL[Tổng công nợ]
        LIST[Danh sách giao dịch]
        EXPAND[Chi tiết có thể mở rộng]
    end
    
    PHONE --> FILTER
    UNIQUE_CODE --> CUSTOMER_INFO
    CUSTOMER_INFO --> FILTER
    FILTER --> GROUP
    GROUP --> SUM
    SUM --> TOTAL
    SUM --> LIST
    LIST --> EXPAND
```

### 11.2 API Debt Summary

**Endpoint:** `GET /api/sepay/debt-summary?phone={phone}`

**Response:**
```json
{
    "success": true,
    "data": {
        "phone": "0901234567",
        "total_debt": 15000000,
        "total_transactions": 5,
        "transactions": [
            {
                "id": 123,
                "amount": 3000000,
                "date": "2024-12-21T14:02:37Z",
                "content": "N2ABCD1234 chuyen khoan",
                "debt_added": true
            },
            {
                "id": 124,
                "amount": 5000000,
                "date": "2024-12-20T10:15:00Z",
                "content": "N2EFGH5678 thanh toan",
                "debt_added": true
            }
        ]
    }
}
```

### 11.3 Backend API Implementation

```javascript
// routes/sepay-routes.js

/**
 * Get debt summary for a phone number
 * Tính tổng công nợ từ các giao dịch có liên kết với SĐT khách hàng
 */
router.get('/debt-summary', async (req, res) => {
    const { phone } = req.query;
    
    if (!phone) {
        return res.status(400).json({ 
            success: false, 
            error: 'Phone number is required' 
        });
    }

    try {
        // Chuẩn hóa số điện thoại (loại bỏ ký tự không phải số)
        const normalizedPhone = phone.replace(/\D/g, '');
        
        // Query: Tìm tất cả unique_code có liên kết với SĐT này
        const customerInfoQuery = `
            SELECT unique_code, customer_name, customer_phone
            FROM customer_info 
            WHERE REPLACE(customer_phone, ' ', '') LIKE $1
        `;
        const customerInfoResult = await pool.query(customerInfoQuery, [`%${normalizedPhone}%`]);
        
        if (customerInfoResult.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    phone,
                    total_debt: 0,
                    total_transactions: 0,
                    transactions: []
                }
            });
        }
        
        // Lấy danh sách unique codes
        const uniqueCodes = customerInfoResult.rows.map(r => r.unique_code);
        
        // Query: Tìm tất cả giao dịch có chứa các unique codes này
        const transactionsQuery = `
            SELECT id, transfer_amount, transaction_date, content
            FROM balance_history
            WHERE transfer_type = 'in'
              AND content ILIKE ANY($1)
            ORDER BY transaction_date DESC
        `;
        const patterns = uniqueCodes.map(code => `%${code}%`);
        const transactionsResult = await pool.query(transactionsQuery, [patterns]);
        
        // Tính tổng công nợ
        const transactions = transactionsResult.rows.map(row => ({
            id: row.id,
            amount: parseFloat(row.transfer_amount),
            date: row.transaction_date,
            content: row.content,
            debt_added: true
        }));
        
        const totalDebt = transactions.reduce((sum, t) => sum + t.amount, 0);
        
        res.json({
            success: true,
            data: {
                phone,
                total_debt: totalDebt,
                total_transactions: transactions.length,
                transactions
            }
        });
        
    } catch (error) {
        console.error('[DEBT-SUMMARY] Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});
```

### 11.4 Frontend: loadDebtForPhone()

```javascript
/**
 * Load debt data for a phone number and update the debt cell
 * @param {string} phone - Phone number
 */
async function loadDebtForPhone(phone) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/sepay/debt-summary?phone=${encodeURIComponent(phone)}`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch debt');
        }

        const data = result.data;
        const totalDebt = data.total_debt || 0;
        const transactions = data.transactions || [];

        console.log('[DEBT] Loaded for phone:', phone, 'Total:', totalDebt);

        // Update debt cell with expandable transaction list
        const debtCell = document.getElementById('debtCell_0');
        if (debtCell) {
            if (totalDebt > 0) {
                // Build expandable transaction list
                const transactionListHtml = transactions.length > 0 ? `
                    <div id="debtDetail" style="display: none; margin-top: 8px; padding: 8px; background: #f9fafb; border-radius: 6px;">
                        ${transactions.slice(0, 20).map((t, i) => {
                            const isLast = i === Math.min(transactions.length - 1, 19);
                            const prefix = isLast ? '└──' : '├──';
                            const dateStr = new Date(t.date).toLocaleDateString('vi-VN');
                            return `
                                <div style="font-family: monospace; font-size: 12px;">
                                    ${prefix} ✓ <strong>${formatCurrency(t.amount)}</strong>
                                    <span style="color: #9ca3af;">(${dateStr})</span>
                                </div>
                            `;
                        }).join('')}
                        ${transactions.length > 20 ? `
                            <div style="color: #9ca3af; font-style: italic;">
                                ... và ${transactions.length - 20} giao dịch khác
                            </div>
                        ` : ''}
                    </div>
                ` : '';

                debtCell.innerHTML = `
                    <div onclick="toggleDebtDetail()" style="cursor: pointer;">
                        <div style="color: #16a34a; font-weight: 600;">
                            ${formatCurrency(totalDebt)}
                        </div>
                        <small style="color: #9ca3af; font-size: 10px;">
                            ${transactions.length} giao dịch ▼
                        </small>
                    </div>
                    ${transactionListHtml}
                `;
            } else {
                debtCell.innerHTML = `
                    <span style="color: #9ca3af;">0 đ</span>
                    <br><small style="color: #9ca3af;">Chưa có GD</small>
                `;
            }
        }

    } catch (error) {
        console.error('[DEBT] Error loading:', error);
        const debtCell = document.getElementById('debtCell_0');
        if (debtCell) {
            debtCell.innerHTML = `<span style="color: #ef4444;">Lỗi</span>`;
        }
    }
}

/**
 * Toggle debt detail expandable row
 */
function toggleDebtDetail() {
    const detail = document.getElementById('debtDetail');
    const icon = document.getElementById('debtExpandIcon');
    if (detail) {
        const isHidden = detail.style.display === 'none';
        detail.style.display = isHidden ? 'block' : 'none';
        if (icon) {
            icon.textContent = isHidden ? '▲' : '▼';
        }
    }
}

window.toggleDebtDetail = toggleDebtDetail;
```

### 11.5 Database Schema Bổ Sung

```sql
-- Table: customer_info (Liên kết unique_code với thông tin KH)
CREATE TABLE IF NOT EXISTS customer_info (
    id SERIAL PRIMARY KEY,
    unique_code VARCHAR(20) UNIQUE NOT NULL,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index cho tìm kiếm theo SĐT
CREATE INDEX idx_customer_info_phone ON customer_info(customer_phone);

-- Index cho tìm kiếm theo unique_code
CREATE INDEX idx_customer_info_code ON customer_info(unique_code);

-- View: debt_by_phone (Tổng hợp công nợ theo SĐT)
CREATE OR REPLACE VIEW debt_by_phone AS
SELECT 
    ci.customer_phone,
    ci.customer_name,
    COUNT(bh.id) as transaction_count,
    SUM(bh.transfer_amount) as total_debt,
    MAX(bh.transaction_date) as last_transaction
FROM customer_info ci
JOIN balance_history bh ON bh.content ILIKE '%' || ci.unique_code || '%'
WHERE bh.transfer_type = 'in'
GROUP BY ci.customer_phone, ci.customer_name;
```

---

## 12. Tích Hợp TPOS OData API

> [!TIP]
> **TPOS là hệ thống quản lý bán hàng được sử dụng để lấy thông tin khách hàng khi proxy API không có dữ liệu.**

### 12.1 Workflow Fallback TPOS

```mermaid
flowchart TD
    INPUT[Số điện thoại] --> PROXY[Proxy API /api/customers/search]
    PROXY -->|Có dữ liệu| RENDER[Render Customer List]
    PROXY -->|Không có| CHECK_TOKEN{Có TPOS Token?}
    CHECK_TOKEN -->|Không| RENDER_EMPTY[Hiển thị trống]
    CHECK_TOKEN -->|Có| TPOS[TPOS OData API]
    TPOS -->|Có dữ liệu| TRANSFORM[Transform Data Format]
    TPOS -->|Không có| RENDER_EMPTY
    TRANSFORM --> RENDER
```

### 12.2 Lấy TPOS Bearer Token

```javascript
/**
 * Get TPOS bearer token from localStorage
 * Token được lưu bởi orders-report hoặc customer-management page
 * @returns {string|null} - Bearer token or null if not found/expired
 */
function getTposToken() {
    try {
        const tokenData = localStorage.getItem('bearer_token_data');
        if (tokenData) {
            const parsed = JSON.parse(tokenData);
            // Check if token is still valid (with 5 minute buffer)
            if (parsed.access_token && parsed.expires_at) {
                const bufferTime = 5 * 60 * 1000; // 5 minutes
                if (Date.now() < (parsed.expires_at - bufferTime)) {
                    return parsed.access_token;
                }
            }
        }
    } catch (error) {
        console.error('[TPOS] Error reading token:', error);
    }
    return null;
}
```

### 12.3 Gọi TPOS OData API

```javascript
/**
 * Fallback to TPOS OData API when proxy API returns empty
 * @param {string} phone - Phone number to search
 * @returns {Promise<Array>} - Array of customers from TPOS
 */
async function fetchCustomersFromTpos(phone) {
    const token = getTposToken();
    if (!token) {
        console.warn('[TPOS] No valid token available');
        return [];
    }

    try {
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?` +
            `Type=Customer&Active=true` +
            `&Name=${encodeURIComponent(phone)}` +
            `&$top=50` +
            `&$orderby=DateCreated+desc` +
            `&$filter=Type+eq+'Customer'` +
            `&$count=true`;

        console.log('[TPOS] Fetching from:', tposUrl);

        const response = await fetch(tposUrl, {
            headers: {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'authorization': `Bearer ${token}`,
                'x-requested-with': 'XMLHttpRequest'
            }
        });

        if (!response.ok) {
            console.warn('[TPOS] API returned status:', response.status);
            return [];
        }

        const result = await response.json();

        if (!result.value || result.value.length === 0) {
            console.log('[TPOS] No results found');
            return [];
        }

        console.log('[TPOS] Found', result.value.length, 'customers');

        // Transform TPOS response to match expected customer format
        return result.value.map(tposCustomer => ({
            id: tposCustomer.Id,
            tpos_id: tposCustomer.Id,
            name: tposCustomer.Name || tposCustomer.DisplayName || '',
            phone: tposCustomer.Phone || '',
            address: tposCustomer.Street || tposCustomer.FullAddress || '',
            email: tposCustomer.Email || '',
            status: tposCustomer.StatusText || tposCustomer.Status || 'Bình thường',
            debt: tposCustomer.Debit || 0,
            source: 'TPOS',
            // Additional TPOS fields
            facebook_id: tposCustomer.FacebookASIds || null,
            zalo: tposCustomer.Zalo || null,
            created_at: tposCustomer.DateCreated || null,
            updated_at: tposCustomer.LastUpdated || null
        }));

    } catch (error) {
        console.error('[TPOS] Fallback error:', error);
        return [];
    }
}
```

### 12.4 TPOS Response Format

**Request URL:**
```
GET https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2
    ?Type=Customer
    &Active=true
    &Name=0901234567
    &$top=50
    &$orderby=DateCreated+desc
    &$filter=Type+eq+'Customer'
    &$count=true
```

**Response:**
```json
{
    "@odata.context": "https://tomato.tpos.vn/odata/$metadata#Partner",
    "@odata.count": 1,
    "value": [
        {
            "Id": 12345,
            "Name": "Nguyễn Văn A",
            "DisplayName": "Nguyễn Văn A (0901234567)",
            "Phone": "0901234567",
            "Email": "nguyenvana@gmail.com",
            "Street": "123 Đường ABC",
            "FullAddress": "123 Đường ABC, Quận 1, TP.HCM",
            "Status": "VIP",
            "StatusText": "VIP",
            "Debit": 5000000,
            "FacebookASIds": null,
            "Zalo": "0901234567",
            "DateCreated": "2024-01-15T10:30:00Z",
            "LastUpdated": "2024-12-20T15:45:00Z"
        }
    ]
}
```

### 12.5 Data Transformation Mapping

| TPOS Field | App Field | Mô Tả |
|------------|-----------|-------|
| `Id` | `id`, `tpos_id` | ID khách hàng trong TPOS |
| `Name`, `DisplayName` | `name` | Tên khách hàng |
| `Phone` | `phone` | Số điện thoại |
| `Street`, `FullAddress` | `address` | Địa chỉ |
| `Email` | `email` | Email |
| `StatusText`, `Status` | `status` | Trạng thái (VIP, Cảnh báo, etc.) |
| `Debit` | `debt` | Công nợ từ TPOS |
| `FacebookASIds` | `facebook_id` | Facebook ID |
| `Zalo` | `zalo` | Zalo |
| `DateCreated` | `created_at` | Ngày tạo |
| `LastUpdated` | `updated_at` | Ngày cập nhật |

---

## 13. Phát Hiện Giao Dịch Thiếu (Gap Detection)

> [!WARNING]
> **Gap Detection** giúp phát hiện các giao dịch bị mất do webhook fail. Cần thiết cho việc reconciliation.

### 13.1 Cách Hoạt Động

1. Mã tham chiếu (reference_code) từ SePay là số tăng tuần tự
2. Nếu có gap (VD: 2565 → 2567, thiếu 2566), nghĩa là webhook cho 2566 không nhận được
3. UI hiển thị các giao dịch thiếu để user xử lý

### 13.2 API Gap Detection

```javascript
// Backend API
GET /api/sepay/detect-gaps

// Response
{
    "success": true,
    "total_gaps": 3,
    "gaps": [
        {
            "missing_reference_code": "2566",
            "previous_reference_code": "2565",
            "next_reference_code": "2567",
            "status": "detected"
        }
    ]
}
```

### 13.3 Client-Side Gap Detection (Trong Table)

```javascript
// Trong renderTable()
function renderTable(data) {
    const rows = [];

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const currentRef = parseInt(row.reference_code);

        // Check gap với row tiếp theo (data sorted DESC)
        if (i < data.length - 1) {
            const nextRow = data[i + 1];
            const nextRef = parseInt(nextRow.reference_code);

            if (!isNaN(currentRef) && !isNaN(nextRef) && currentRef - nextRef > 1) {
                // Có gap - thêm warning rows
                for (let missing = currentRef - 1; missing > nextRef; missing--) {
                    rows.push(renderGapRow(missing, nextRef, currentRef));
                }
            }
        }

        rows.push(renderTransactionRow(row));
    }

    tableBody.innerHTML = rows.join('');
}

function renderGapRow(missingRef, prevRef, nextRef) {
    return `
    <tr class="gap-row" style="background: #fef3c7; border: 2px dashed #f59e0b;">
        <td colspan="5">
            ⚠️ Giao dịch bị thiếu - Webhook không nhận được
        </td>
        <td style="font-weight: bold; color: #d97706;">
            ${missingRef}
        </td>
        <td colspan="4">
            <button onclick="fetchMissingTransaction('${missingRef}')">
                Lấy lại
            </button>
            <button onclick="ignoreGap('${missingRef}')">
                Bỏ qua
            </button>
        </td>
    </tr>
    `;
}
```

---

## 14. Realtime Updates (SSE)

### 14.1 Server-Sent Events Connection

```javascript
let eventSource = null;
let reconnectTimeout = null;

function connectRealtimeUpdates() {
    if (eventSource) return;

    try {
        eventSource = new EventSource(`${API_BASE_URL}/api/sepay/stream`);

        eventSource.addEventListener('connected', (e) => {
            console.log('[REALTIME] Connected');
            showRealtimeStatus('connected');
        });

        eventSource.addEventListener('new-transaction', (e) => {
            const transaction = JSON.parse(e.data);
            handleNewTransaction(transaction);
        });

        eventSource.onerror = (error) => {
            console.error('[REALTIME] Error:', error);
            showRealtimeStatus('error');

            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }

            // Reconnect after 5 seconds
            reconnectTimeout = setTimeout(() => {
                connectRealtimeUpdates();
            }, 5000);
        };

    } catch (error) {
        console.error('[REALTIME] Failed:', error);
    }
}

async function handleNewTransaction(transaction) {
    showNotification(transaction);

    if (transactionMatchesFilters(transaction)) {
        if (currentPage === 1) {
            loadData();
            loadStatistics();
        } else {
            showNewDataBanner();
        }
    }
}

// Auto-connect on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(connectRealtimeUpdates, 1000);
});
```

---

## 15. Triển Khai

### 15.1 Checklist Triển Khai

- [ ] **Database**
  - [ ] Tạo PostgreSQL database trên Render.com
  - [ ] Chạy migration `create_balance_history.sql`
  - [ ] Verify tables và indexes

- [ ] **Backend (Render.com)**
  - [ ] Deploy server với routes `/api/sepay/*`
  - [ ] Set environment variables: `DATABASE_URL`, `SEPAY_API_KEY`
  - [ ] Test API endpoints

- [ ] **Cloudflare Worker**
  - [ ] Deploy worker với proxy routes
  - [ ] Configure CORS headers
  - [ ] Test from frontend domain

- [ ] **SePay Webhook**
  - [ ] Đăng ký webhook URL: `https://your-worker.workers.dev/api/sepay/webhook`
  - [ ] Chọn API Key authentication
  - [ ] Copy API key → Render env vars
  - [ ] Test webhook với curl/Postman

- [ ] **Frontend**
  - [ ] Update `config.js` với đúng API_BASE_URL
  - [ ] Update `firebase-config.js` nếu dùng Firebase
  - [ ] Update bank config trong `qr-generator.js`
  - [ ] Test chức năng tạo QR, filter, pagination

### 15.2 Test Webhook

```bash
# Test với curl
curl -X POST https://your-worker.workers.dev/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey your_sepay_api_key" \
  -d '{
    "id": 12345,
    "gateway": "ACB",
    "transactionDate": "2024-12-21 10:30:00",
    "accountNumber": "75918",
    "content": "N2TEST123456789012 Test",
    "transferType": "in",
    "transferAmount": 100000,
    "accumulated": 5000000,
    "referenceCode": "99999"
  }'
```

### 15.3 Troubleshooting

| Vấn Đề | Nguyên Nhân | Giải Pháp |
|--------|-------------|-----------|
| Webhook không nhận được | URL sai hoặc API key không đúng | Kiểm tra SePay dashboard, check logs |
| CORS Error | Cloudflare Worker thiếu headers | Thêm CORS headers vào worker |
| Data không hiển thị | API_BASE_URL sai | Kiểm tra `config.js` |
| QR không generate | VietQR URL sai | Kiểm tra bank BIN và account |
| Realtime không hoạt động | SSE endpoint down | Kiểm tra server logs |

---

## 16. Column Visibility Control

Tính năng cho phép người dùng ẩn/hiện các cột trong bảng dữ liệu.

### 16.1 UI Components

```html
<!-- Column Visibility Dropdown (trong Filters) -->
<div class="filter-group" style="position: relative;">
    <label><i data-lucide="columns"></i> Hiển thị cột:</label>
    <button id="columnVisibilityBtn" class="btn btn-secondary">
        <i data-lucide="eye"></i> Chọn cột
    </button>
    <div id="columnVisibilityDropdown" class="column-dropdown" style="display: none;">
        <div class="column-dropdown-header">
            <span>Chọn cột hiển thị</span>
            <button id="selectAllColumnsBtn" class="btn-link">Chọn tất cả</button>
        </div>
        <div class="column-dropdown-content">
            <label class="column-checkbox">
                <input type="checkbox" value="datetime" checked> Ngày giờ
            </label>
            <label class="column-checkbox">
                <input type="checkbox" value="gateway" checked> Ngân hàng
            </label>
            <!-- ... các cột khác -->
        </div>
    </div>
</div>
```

### 16.2 JavaScript Implementation

```javascript
// Load column visibility preferences from localStorage
function loadColumnVisibility() {
    const savedVisibility = localStorage.getItem('columnVisibility');
    if (savedVisibility) {
        const visibility = JSON.parse(savedVisibility);
        Object.entries(visibility).forEach(([column, isVisible]) => {
            const checkbox = document.querySelector(`.column-checkbox input[value="${column}"]`);
            if (checkbox) {
                checkbox.checked = isVisible;
                toggleColumn(column, isVisible);
            }
        });
    }
}

// Toggle column visibility
function toggleColumn(columnName, isVisible) {
    const headers = document.querySelectorAll(`th[data-column="${columnName}"]`);
    const cells = document.querySelectorAll(`td[data-column="${columnName}"]`);

    headers.forEach(header => {
        header.classList.toggle('hidden', !isVisible);
    });

    cells.forEach(cell => {
        cell.classList.toggle('hidden', !isVisible);
    });
}

// Save column visibility preferences to localStorage
function saveColumnVisibility() {
    const checkboxes = document.querySelectorAll('.column-checkbox input[type="checkbox"]');
    const visibility = {};
    checkboxes.forEach(checkbox => {
        visibility[checkbox.value] = checkbox.checked;
    });
    localStorage.setItem('columnVisibility', JSON.stringify(visibility));
}
```

### 16.3 Các Cột Có Thể Ẩn/Hiện

| Column Key | Tên Cột | Mặc Định |
|------------|---------|----------|
| `datetime` | Ngày giờ | ✅ Hiện |
| `gateway` | Ngân hàng | ✅ Hiện |
| `type` | Loại | ✅ Hiện |
| `amount` | Số tiền | ✅ Hiện |
| `balance` | Số dư | ✅ Hiện |
| `content` | Nội dung | ✅ Hiện |
| `reference` | Mã tham chiếu | ✅ Hiện |
| `customer_name` | Tên khách hàng | ✅ Hiện |
| `customer_phone` | Số điện thoại | ✅ Hiện |
| `qr_code` | QR Code | ✅ Hiện |
| `actions` | Thao tác | ✅ Hiện |

---

## 17. Fetch Missing Transaction

Khi phát hiện giao dịch thiếu (gap), có thể gọi API để lấy lại từ SePay.

### 17.1 API Endpoint

```
POST /api/sepay/fetch-by-reference/{referenceCode}
```

### 17.2 Implementation

```javascript
/**
 * Fetch missing transaction from Sepay API by reference code
 */
async function fetchMissingTransaction(referenceCode) {
    if (window.NotificationManager) {
        window.NotificationManager.showNotification(
            `Đang lấy giao dịch ${referenceCode}...`, 'info'
        );
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/sepay/fetch-by-reference/${referenceCode}`,
            { method: 'POST' }
        );
        const result = await response.json();

        if (result.success) {
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(
                    `Đã lấy được giao dịch ${referenceCode}!`, 'success'
                );
            }

            // Reload data to show the new transaction
            await loadGapData();
            loadData();
            loadStatistics();
        } else {
            throw new Error(result.error || 'Không tìm thấy giao dịch');
        }

    } catch (error) {
        console.error('[GAPS] Error fetching missing transaction:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification(
                `Không thể lấy GD ${referenceCode}: ${error.message}`, 'error'
            );
        }
    }
}
```

---

## 18. Tổng Hợp Các Hàm Chính Trong main.js

### 18.1 Data Loading Functions

| Hàm | Mô Tả |
|-----|-------|
| `loadData()` | Tải dữ liệu giao dịch với pagination và filters |
| `loadStatistics()` | Tải thống kê (tổng tiền vào/ra, số dư) |
| `loadGapData()` | Tải danh sách giao dịch thiếu (gaps) |

### 18.2 Filter Functions

| Hàm | Mô Tả |
|-----|-------|
| `applyQuickFilter(filterType)` | Áp dụng quick filter (today, yesterday, thisMonth, etc.) |
| `getQuickFilterDates(filterType)` | Tính toán khoảng ngày cho quick filter |
| `applyFilters()` | Áp dụng tất cả filters từ UI |
| `resetFilters()` | Reset filters về mặc định (tháng này) |
| `parseAmountInput(input)` | Parse số tiền (hỗ trợ 100k, 1m, 1.5tr) |

### 18.3 Render Functions

| Hàm | Mô Tả |
|-----|-------|
| `renderTable(data)` | Render bảng giao dịch với gap detection |
| `renderTransactionRow(row)` | Render 1 dòng giao dịch |
| `renderGapRow(missingRef, ...)` | Render dòng cảnh báo gap |
| `renderStatistics(stats)` | Render thống kê cards |
| `updatePagination(pagination)` | Cập nhật UI pagination |

### 18.4 QR Code Functions

| Hàm | Mô Tả |
|-----|-------|
| `generateDepositQR()` | Tạo QR mới (popup modal) |
| `generateDepositQRInline()` | Tạo QR inline (header) với thông tin KH |
| `showTransactionQR(uniqueCode, amount)` | Hiển thị QR cho giao dịch có sẵn |
| `showQRModal(qrData, isNewQR)` | Hiển thị modal QR |
| `createCustomQRImage(qrUrl, customerInfo)` | Tạo ảnh QR custom (không có STK) |
| `copyQRUrl(qrUrl)` | Copy QR URL |
| `copyUniqueCode(uniqueCode)` | Copy mã giao dịch |
| `downloadQR(qrUrl, uniqueCode)` | Download ảnh QR |

### 18.5 Customer Functions

| Hàm | Mô Tả |
|-----|-------|
| `saveQRCustomerInfo(uniqueCode)` | Lưu thông tin KH từ QR modal |
| `editCustomerInfo(uniqueCode)` | Mở modal sửa thông tin KH |
| `saveEditCustomerInfo(event)` | Lưu thông tin KH từ modal sửa |
| `showCustomersByPhone(phone)` | Hiển thị danh sách KH theo SĐT |
| `renderCustomerList(customers, stats, phone)` | Render danh sách KH trong modal |
| `mergeCustomersByPhone(customers)` | Gộp KH cùng SĐT |
| `loadDebtForPhone(phone)` | Tải công nợ cho SĐT |
| `toggleDebtDetail()` | Mở/đóng chi tiết công nợ |

### 18.6 Gap Detection Functions

| Hàm | Mô Tả |
|-----|-------|
| `loadGapData()` | Tải dữ liệu gaps từ backend |
| `updateGapCard(count)` | Cập nhật card hiển thị số gaps |
| `showGapsModal()` | Mở modal danh sách gaps |
| `renderGapsList(gaps)` | Render danh sách gaps trong modal |
| `closeGapsModal()` | Đóng modal gaps |
| `ignoreGap(referenceCode)` | Bỏ qua 1 gap |
| `rescanGaps()` | Quét lại gaps |
| `retryFailedQueue()` | Retry tất cả webhooks failed |
| `fetchMissingTransaction(referenceCode)` | Lấy lại GD thiếu từ SePay |

### 18.7 Realtime (SSE) Functions

| Hàm | Mô Tả |
|-----|-------|
| `connectRealtimeUpdates()` | Kết nối SSE |
| `disconnectRealtimeUpdates()` | Ngắt kết nối SSE |
| `handleNewTransaction(transaction)` | Xử lý giao dịch mới từ SSE |
| `transactionMatchesFilters(transaction)` | Kiểm tra GD có match filters |
| `showNotification(transaction)` | Hiển thị notification cho GD mới |
| `showNewDataBanner()` | Hiển thị banner "có dữ liệu mới" |
| `showRealtimeStatus(status)` | Hiển thị trạng thái kết nối SSE |

### 18.8 Column Visibility Functions

| Hàm | Mô Tả |
|-----|-------|
| `loadColumnVisibility()` | Load preferences từ localStorage |
| `saveColumnVisibility()` | Lưu preferences vào localStorage |
| `toggleColumn(columnName, isVisible)` | Ẩn/hiện cột cụ thể |

### 18.9 Helper Functions

| Hàm | Mô Tả |
|-----|-------|
| `formatCurrency(amount)` | Format số tiền VND |
| `formatDateTime(dateString)` | Format ngày giờ vi-VN |
| `truncateText(text, maxLength)` | Cắt ngắn text |
| `showLoading()` | Hiển thị loading indicator |
| `hideLoading()` | Ẩn loading indicator |
| `showError(message)` | Hiển thị lỗi |
| `escapeHtmlForCustomer(text)` | Escape HTML cho display |
| `getStatusBadgeClass(status)` | Lấy CSS class cho status badge |

---

## 19. Cấu Trúc Dữ Liệu Cho Customer Wallet Integration

> [!IMPORTANT]
> **Section này dành cho tích hợp Customer Wallet**
> Mô tả chi tiết cách dữ liệu SĐT và công nợ được lưu trữ, liên kết, và tính toán.

### 19.1 Tổng Quan Data Flow

```mermaid
flowchart TD
    subgraph Frontend["Frontend (balance-history)"]
        QR[Tạo QR với mã N2xxx]
        INPUT[Nhập SĐT/Tên KH]
    end

    subgraph Storage["Lưu Trữ"]
        LOCAL[localStorage]
        PG[(PostgreSQL)]
        FB[(Firebase)]
    end

    subgraph Tables["Database Tables"]
        BCI[balance_customer_info]
        BH[balance_history]
        CUST[customers]
    end

    subgraph Output["Kết Quả"]
        DEBT[Công nợ khách hàng]
        WALLET[Customer Wallet]
    end

    QR --> INPUT
    INPUT --> LOCAL
    INPUT --> PG
    INPUT --> FB
    PG --> BCI
    BH -->|Extract N2xxx| BCI
    BCI -->|Lookup phone| CUST
    CUST --> DEBT
    DEBT --> WALLET
```

### 19.2 Database Schema Chi Tiết

#### 19.2.1 Bảng `balance_history` - Lưu Giao Dịch

```sql
CREATE TABLE balance_history (
    id SERIAL PRIMARY KEY,
    
    -- SePay webhook data
    sepay_id INTEGER UNIQUE NOT NULL,        -- ID giao dịch từ SePay
    gateway VARCHAR(100) NOT NULL,           -- Ngân hàng: ACB, VCB, TCB...
    transaction_date TIMESTAMP NOT NULL,     -- Thời gian giao dịch
    account_number VARCHAR(50) NOT NULL,     -- Số tài khoản nhận
    code VARCHAR(100),                       -- Mã giao dịch ngân hàng
    content TEXT,                            -- ⭐ NỘI DUNG CHỨA MÃ QR (N2xxx)
    transfer_type VARCHAR(10) NOT NULL,      -- 'in' (tiền vào) hoặc 'out' (tiền ra)
    transfer_amount BIGINT NOT NULL,         -- Số tiền (VND, không thập phân)
    accumulated BIGINT NOT NULL,             -- Số dư sau giao dịch
    sub_account VARCHAR(100),
    reference_code VARCHAR(100),             -- Mã tham chiếu (dùng cho gap detection)
    description TEXT,
    
    -- ⭐ Flag cho việc đã cộng vào công nợ chưa
    debt_added BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    webhook_received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB                           -- Raw webhook payload
);

-- Indexes quan trọng
CREATE INDEX idx_bh_transaction_date ON balance_history(transaction_date DESC);
CREATE INDEX idx_bh_transfer_type ON balance_history(transfer_type);
CREATE INDEX idx_bh_debt_added ON balance_history(debt_added);
CREATE INDEX idx_bh_content ON balance_history USING GIN(to_tsvector('simple', content));
```

**Ví dụ data:**
```json
{
    "id": 123,
    "sepay_id": 92704,
    "gateway": "ACB",
    "transaction_date": "2024-12-21T14:02:37",
    "content": "CT DEN:0901234567 ND:N2M5K8H2P9Q3R7T1 NGUYEN VAN A CK",
    "transfer_type": "in",
    "transfer_amount": 500000,
    "accumulated": 19077000,
    "debt_added": true
}
```

---

#### 19.2.2 Bảng `balance_customer_info` - Mapping QR → Khách Hàng

```sql
CREATE TABLE balance_customer_info (
    id SERIAL PRIMARY KEY,
    
    -- ⭐ MÃ QR UNIQUE (khóa chính thực tế)
    unique_code VARCHAR(50) UNIQUE NOT NULL,  -- Format: N2 + 16 chars = 18 chars
    
    -- ⭐ THÔNG TIN KHÁCH HÀNG
    customer_name VARCHAR(255),               -- Tên khách hàng
    customer_phone VARCHAR(50),               -- SĐT (chuẩn hóa, không có 0 đầu hoặc +84)
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_bci_unique_code ON balance_customer_info(unique_code);
CREATE INDEX idx_bci_phone ON balance_customer_info(customer_phone);
```

**Ví dụ data:**
```json
{
    "id": 1,
    "unique_code": "N2M5K8H2P9Q3R7T1",
    "customer_name": "Nguyễn Văn A",
    "customer_phone": "0901234567"
}
```

---

#### 19.2.3 Bảng `customers` - Thông Tin & Công Nợ Khách Hàng

```sql
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    
    -- ⭐ SĐT LÀ KHÓA UNIQUE (dùng để join với balance_customer_info)
    phone VARCHAR(50) UNIQUE NOT NULL,
    
    -- Thông tin khách
    name VARCHAR(255),
    email VARCHAR(255),
    address TEXT,
    
    -- ⭐ CÔNG NỢ
    debt DECIMAL(15,2) DEFAULT 0,             -- Tổng công nợ hiện tại (đã điều chỉnh)
    debt_adjusted_at TIMESTAMP,               -- Thời điểm admin điều chỉnh lần cuối
    
    -- Trạng thái
    status VARCHAR(50) DEFAULT 'Bình thường', -- Bình thường, VIP, Cảnh báo, Bom hàng, Nguy hiểm
    active BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Ví dụ data:**
```json
{
    "id": 1,
    "phone": "0901234567",
    "name": "Nguyễn Văn A",
    "debt": 1500000,
    "debt_adjusted_at": null,
    "status": "VIP"
}
```

---

#### 19.2.4 Bảng `pending_customer_matches` - Giao Dịch Chờ Xác Nhận

Khi trích xuất được SĐT từ content nhưng có nhiều khách hàng trùng SĐT.

```sql
CREATE TABLE pending_customer_matches (
    id SERIAL PRIMARY KEY,
    
    -- Reference đến giao dịch
    transaction_id INTEGER NOT NULL REFERENCES balance_history(id),
    
    -- SĐT trích xuất được
    extracted_phone VARCHAR(50) NOT NULL,
    
    -- Danh sách khách hàng matching (JSONB array)
    matched_customers JSONB NOT NULL,
    -- Format: [{"id": 1, "phone": "0901234567", "name": "Nguyen Van A"}, ...]
    
    -- Khách hàng được chọn (sau khi admin xác nhận)
    selected_customer_id INTEGER,
    
    -- Trạng thái: pending, resolved, skipped
    status VARCHAR(20) DEFAULT 'pending',
    
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100)
);
```

---

### 19.3 Cách Lưu Trữ Và Tính Công Nợ

> [!IMPORTANT]
> **Công nợ được LƯU CỘNG DỒN vào `customers.debt`**, KHÔNG phải tính lại từ đầu mỗi lần xem.

#### 19.3.1 Quy Trình Cập Nhật Công Nợ (Khi Webhook Đến)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. Webhook nhận giao dịch mới (transfer_type = 'in')                  │
│  2. Extract mã QR (N2xxx) hoặc SĐT từ content                          │
│  3. Tìm SĐT từ balance_customer_info                                    │
│  4. ⭐ CỘNG DỒN số tiền vào customers.debt                              │
│  5. Đánh dấu balance_history.debt_added = TRUE                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Code Backend (UPSERT):**

```javascript
// Khi có giao dịch mới với mã QR đã liên kết SĐT
const phone = infoResult.rows[0].customer_phone;
const amount = parseInt(tx.transfer_amount) || 0;

// ⭐ CỘNG DỒN vào customers.debt (không tính lại từ đầu)
await db.query(
    `INSERT INTO customers (phone, name, debt, status, active)
     VALUES ($1, $1, $2, 'Bình thường', true)
     ON CONFLICT (phone) DO UPDATE SET
         debt = COALESCE(customers.debt, 0) + $2,   -- ⭐ += amount
         updated_at = CURRENT_TIMESTAMP
     RETURNING id, phone, debt`,
    [phone, amount]
);

// Đánh dấu giao dịch đã xử lý (tránh cộng trùng)
await db.query(
    `UPDATE balance_history SET debt_added = TRUE WHERE id = $1`,
    [transactionId]
);
```

#### 19.3.2 Vai Trò Của Từng Field

| Field | Bảng | Mục Đích |
|-------|------|----------|
| `debt` | `customers` | ⭐ **LƯU CÔNG NỢ TỔNG** (được cộng dồn tự động) |
| `debt_added` | `balance_history` | ⭐ **FLAG tránh cộng trùng** (TRUE = đã xử lý) |
| `debt_adjusted_at` | `customers` | Thời điểm admin điều chỉnh thủ công |

#### 19.3.3 Trường Hợp Admin Điều Chỉnh Công Nợ

Khi admin điều chỉnh công nợ thủ công:

```sql
-- Admin set công nợ mới
UPDATE customers SET 
    debt = 500000,                    -- Giá trị mới
    debt_adjusted_at = NOW()          -- Đánh dấu thời điểm điều chỉnh
WHERE phone = '0901234567';
```

Sau đó, các giao dịch MỚI sẽ tiếp tục cộng dồn vào `debt` như bình thường.

#### 19.3.4 Khi Nào Cần Tính Lại Từ Đầu?

Chỉ cần tính lại khi **KIỂM TRA/ĐỒNG BỘ** dữ liệu:

```sql
-- Query này chỉ dùng để KIỂM TRA, không phải cách tính chính
SELECT SUM(bh.transfer_amount) AS calculated_debt
FROM balance_history bh
JOIN balance_customer_info bci ON bh.content ILIKE '%' || bci.unique_code || '%'
WHERE bci.customer_phone = '0901234567'
  AND bh.transfer_type = 'in'
  AND bh.debt_added = TRUE;

-- So sánh với giá trị lưu
SELECT debt AS stored_debt FROM customers WHERE phone = '0901234567';
```

#### 19.3.5 Tóm Tắt

| Câu hỏi | Trả lời |
|---------|---------|
| Công nợ lưu ở đâu? | `customers.debt` |
| Có tính lại từ đầu mỗi lần xem? | ❌ **KHÔNG** - đọc trực tiếp từ `customers.debt` |
| Làm sao tránh cộng trùng? | Flag `balance_history.debt_added = TRUE` |
| Khi nào dùng query SUM? | Chỉ khi kiểm tra/đồng bộ dữ liệu |

---

### 19.4 API Response Format Cho Customer Wallet

#### GET `/api/sepay/debt-summary?phone={phone}`

**Response:**
```json
{
    "success": true,
    "data": {
        "phone": "0901234567",
        "total_debt": 1500000,
        "baseline_debt": null,
        "new_transactions_after_adjustment": null,
        "debt_adjusted_at": null,
        "source": "balance_history",
        "transaction_count": 3,
        "transactions": [
            {
                "id": 123,
                "amount": 500000,
                "date": "2024-12-21T14:02:37",
                "content": "N2M5K8H2P9Q3R7T1",
                "qr_code": "N2M5K8H2P9Q3R7T1",
                "debt_added": true
            },
            {
                "id": 124,
                "amount": 700000,
                "date": "2024-12-20T10:15:00",
                "content": "N2X7Y9Z1A2B3C4D5",
                "qr_code": "N2X7Y9Z1A2B3C4D5",
                "debt_added": true
            }
        ]
    }
}
```

**Giải thích các trường:**

| Field | Type | Mô tả |
|-------|------|-------|
| `total_debt` | number | Tổng công nợ hiện tại (VND) |
| `baseline_debt` | number\|null | Công nợ baseline nếu admin đã điều chỉnh |
| `new_transactions_after_adjustment` | number\|null | Tổng GD sau khi điều chỉnh |
| `debt_adjusted_at` | string\|null | Thời điểm điều chỉnh cuối |
| `source` | string | Nguồn tính toán: `balance_history`, `admin_adjusted_plus_new`, `customers_table`, `no_data` |
| `transactions` | array | Danh sách giao dịch chi tiết |

#### POST `/api/sepay/debt-summary-batch`

**Request:**
```json
{
    "phones": ["0901234567", "0912345678", "0987654321"]
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "0901234567": {
            "total_debt": 1500000,
            "source": "balance_history",
            "transaction_count": 3
        },
        "0912345678": {
            "total_debt": 0,
            "source": "no_data",
            "transaction_count": 0
        },
        "0987654321": {
            "total_debt": 800000,
            "source": "admin_adjusted_plus_new",
            "transaction_count": 1
        }
    }
}
```

---

### 19.5 LocalStorage Structure

**Key:** `balance_history_customer_info`

```json
{
    "N2M5K8H2P9Q3R7T1": {
        "name": "Nguyễn Văn A",
        "phone": "0901234567",
        "updatedAt": "2024-12-21T14:05:00.000Z"
    },
    "N2X7Y9Z1A2B3C4D5": {
        "name": "Trần Thị B",
        "phone": "0912345678",
        "updatedAt": "2024-12-20T10:20:00.000Z"
    }
}
```

---

### 19.6 Tích Hợp Với Customer Wallet

#### Để đọc công nợ từ Customer Wallet:

```javascript
// 1. Gọi API lấy công nợ theo SĐT
const response = await fetch(
    `${API_BASE_URL}/api/sepay/debt-summary?phone=${customerPhone}`
);
const result = await response.json();

if (result.success) {
    const debtData = result.data;
    
    // Công nợ tổng
    const totalDebt = debtData.total_debt;
    
    // Nguồn tính toán
    const source = debtData.source;
    // - "balance_history": từ giao dịch ngân hàng
    // - "admin_adjusted_plus_new": đã điều chỉnh + GD mới
    // - "customers_table": từ bảng customers
    // - "no_data": không có dữ liệu
    
    // Danh sách giao dịch chi tiết
    const transactions = debtData.transactions;
}
```

#### Để cập nhật công nợ thủ công (Admin):

```javascript
// Gọi API cập nhật công nợ
const response = await fetch(`${API_BASE_URL}/api/customers/${customerId}/debt`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        newDebt: 500000,
        reason: "Điều chỉnh theo yêu cầu khách hàng"
    })
});

// Response sẽ update:
// - customers.debt = newDebt
// - customers.debt_adjusted_at = CURRENT_TIMESTAMP
// - Thêm record vào debt_adjustment_log
```

---

### 19.7 Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────────┘

                    Webhook từ SePay
                           │
                           ▼
              ┌────────────────────────┐
              │    balance_history     │
              │  (sepay_id, content,   │
              │   transfer_amount...)  │
              └────────────────────────┘
                           │
                           │ Extract N2xxx từ content
                           ▼
              ┌────────────────────────┐
              │ balance_customer_info  │
              │  (unique_code, phone)  │◀──── Frontend nhập SĐT/Tên
              └────────────────────────┘
                           │
                           │ Lookup by phone
                           ▼
              ┌────────────────────────┐
              │      customers         │
              │  (phone, debt,         │──────▶ Customer Wallet
              │   debt_adjusted_at)    │
              └────────────────────────┘
                           │
                           │ UPSERT debt
                           ▼
              ┌────────────────────────┐
              │  debt_adjustment_log   │
              │  (history điều chỉnh)  │
              └────────────────────────┘

 ┌──────────────────────────────────────────────────────────────────────────┐
 │ THAM KHẢO THÊM: file `QR_DEBT_FLOW.md` có flow chi tiết với diagrams    │
 └──────────────────────────────────────────────────────────────────────────┘
```

---

## Tài Liệu Tham Khảo

- [SePay Webhook Documentation](https://docs.sepay.vn/tich-hop-webhooks.html)
- [VietQR API](https://vietqr.io/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Render.com](https://render.com/docs)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)

---

> [!NOTE]
> **Lưu ý khi triển khai:**
> - Tài liệu này được tạo dựa trên phân tích mã nguồn thực tế tại `balance-history/`
> - Cần thay đổi các thông tin cấu hình (bank account, API URLs, Firebase config) phù hợp với dự án của bạn
> - Mã nguồn sử dụng nhiều tính năng JavaScript ES6+ (async/await, optional chaining, etc.)
> - Tham khảo thêm các file documentation khác trong thư mục: `QR_DEBT_FLOW.md`, `PHONE_EXTRACTION_FEATURE.md`, `DEPLOYMENT_GUIDE.md`

