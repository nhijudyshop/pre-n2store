# Tính năng Ví Khách Hàng - N2Store

## Mục lục
1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Orders-Report (Tab 1)](#3-orders-report-tab-1)
4. [Customer-Hub (Customer 360°)](#4-customer-hub-customer-360)
5. [Backend APIs](#5-backend-apis)
6. [Database Schema](#6-database-schema)
7. [Outbox Pattern - Pending Withdrawals](#7-outbox-pattern---pending-withdrawals)
8. [Real-time Updates (SSE)](#8-real-time-updates-sse)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Tổng quan

### 1.1 Mục đích
Hệ thống ví khách hàng cho phép:
- **Khách hàng nạp tiền trước** → Số dư được lưu trong ví
- **Trừ ví khi tạo đơn COD** → Giảm số tiền COD phải thu
- **Quản lý công nợ ảo** → Cấp credit có thời hạn cho khách hàng
- **Theo dõi lịch sử giao dịch** → Audit trail đầy đủ

### 1.2 Luồng hoạt động chính

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LUỒNG NẠP TIỀN                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Khách chuyển khoản → SePay Webhook → Balance History                   │
│                              │                                          │
│                              ▼                                          │
│                       Cron Job xử lý → Tạo wallet_transaction           │
│                              │                                          │
│                              ▼                                          │
│                       Cập nhật customer_wallets.balance                 │
│                              │                                          │
│                              ▼                                          │
│                       SSE notify → UI cập nhật realtime                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  LUỒNG TRỪ VÍ KHI TẠO ĐƠN COD                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [1] Nhân viên mở Sale Modal                                            │
│              │                                                          │
│              ▼                                                          │
│  [2] Fetch wallet balance từ API                                        │
│      → Hiển thị trong ô "Công nợ cũ/Số dư ví"                           │
│              │                                                          │
│              ▼                                                          │
│  [3] Tính toán COD:                                                     │
│      COD = Tổng tiền hàng + Phí ship - Số dư ví                         │
│              │                                                          │
│              ▼                                                          │
│  [4] Xác nhận tạo đơn (TPOS API)                                        │
│              │                                                          │
│              ▼                                                          │
│  [5] Gọi Pending-Withdrawals API (Outbox Pattern)                       │
│      → Ghi pending record vào DB                                        │
│      → Gọi wallet_withdraw_fifo()                                       │
│      → Trừ virtual credit trước (FIFO), sau đó trừ real balance        │
│              │                                                          │
│              ▼                                                          │
│  [6] SSE notify → UI cập nhật realtime                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Kiến trúc hệ thống

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐     ┌─────────────────────────────────────┐   │
│  │   orders-report     │     │          customer-hub               │   │
│  │   (Tab 1)           │     │       (Customer 360°)               │   │
│  ├─────────────────────┤     ├─────────────────────────────────────┤   │
│  │ • tab1-sale.js      │     │ • wallet-panel.js                   │   │
│  │ • tab1-fast-sale.js │     │ • api-service.js                    │   │
│  │ • tab1-qr-debt.js   │     │                                     │   │
│  │ • tab1-address-stats│     │                                     │   │
│  └─────────────────────┘     └─────────────────────────────────────┘   │
│            │                              │                             │
│            └──────────────┬───────────────┘                             │
│                           │                                             │
└───────────────────────────┼─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE WORKER (Proxy)                            │
│              chatomni-proxy.nhijudyshop.workers.dev                     │
└─────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Render.com)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐                      │
│  │ V1 API (Legacy)     │  │ V2 API (Current)    │                      │
│  │ customer-360.js     │  │ v2/wallets.js       │                      │
│  │                     │  │ v2/pending-         │                      │
│  │                     │  │   withdrawals.js    │                      │
│  └─────────────────────┘  └─────────────────────┘                      │
│            │                        │                                   │
│            └────────────┬───────────┘                                   │
│                         │                                               │
│                         ▼                                               │
│  ┌─────────────────────────────────────────────┐                       │
│  │         PostgreSQL Functions                 │                       │
│  │  • wallet_withdraw_fifo()                    │                       │
│  │  • expire_virtual_credits()                  │                       │
│  └─────────────────────────────────────────────┘                       │
│                         │                                               │
│                         ▼                                               │
│  ┌─────────────────────────────────────────────┐                       │
│  │              PostgreSQL DB                   │                       │
│  │  • customer_wallets                          │                       │
│  │  • wallet_transactions                       │                       │
│  │  • virtual_credits                           │                       │
│  │  • pending_wallet_withdrawals                │                       │
│  └─────────────────────────────────────────────┘                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 File Structure

```
n2store/
├── orders-report/
│   └── js/
│       └── tab1/
│           ├── tab1-sale.js              # Sale modal, COD calculation
│           ├── tab1-fast-sale.js         # Bulk sale (PBH)
│           ├── tab1-qr-debt.js           # Debt display, cache, fetch
│           ├── tab1-address-stats.js     # QR code, chat debt display
│           └── tab1-table.js             # Main table with debt column
│
├── customer-hub/
│   └── js/
│       ├── api-service.js                # API abstraction layer
│       └── modules/
│           └── wallet-panel.js           # Wallet panel UI
│
└── render.com/
    ├── routes/
    │   ├── customer-360.js               # V1 wallet APIs
    │   └── v2/
    │       ├── wallets.js                # V2 wallet APIs
    │       └── pending-withdrawals.js    # Outbox pattern API
    ├── migrations/
    │   ├── 001_create_customer_360_schema.sql
    │   ├── 002_create_customer_360_triggers.sql
    │   └── 025_create_pending_wallet_withdrawals.sql
    └── cron/
        └── scheduler.js                  # Cron jobs for retry
```

---

## 3. Orders-Report (Tab 1)

### 3.1 Hiển thị số dư ví trong bảng đơn hàng

**File:** `orders-report/js/tab1/tab1-qr-debt.js`

#### Cột "Công nợ" trong bảng chính
- Hiển thị số dư ví của khách hàng dựa trên số điện thoại
- Sử dụng cache để tránh gọi API lặp lại
- Có real-time update qua SSE

```javascript
// Render cột debt trong bảng
function renderDebtColumn(phone) {
    const cachedDebt = getCachedDebt(phone);
    if (cachedDebt !== null) {
        return formatDebtCurrency(cachedDebt);
    }
    return `<span class="debt-loading" data-phone="${phone}">...</span>`;
}
```

#### Cache mechanism
```javascript
// Cache lưu trong IndexedDB và memory
const DEBT_CACHE_TTL = 5 * 60 * 1000; // 5 phút

function getCachedDebt(phone) {
    const cache = getDebtCache();
    const entry = cache[phone];
    if (entry && Date.now() - entry.timestamp < DEBT_CACHE_TTL) {
        return entry.debt;
    }
    return null;
}
```

#### Batch fetch để tối ưu performance
```javascript
// Fetch nhiều phone cùng lúc
async function batchFetchDebts(phones) {
    const response = await fetch(`${QR_API_URL}/api/wallet/batch-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones })
    });
    // Update cache và UI
}
```

### 3.2 Sale Modal - Tạo đơn đơn lẻ

**File:** `orders-report/js/tab1/tab1-sale.js`

#### Fetch và hiển thị số dư ví
```javascript
// Khi mở Sale Modal
async function fetchDebtForSaleModal(phone) {
    const response = await fetch(`${QR_API_URL}/api/wallet/${phone}`);
    const data = await response.json();

    // Hiển thị vào ô Công nợ cũ
    document.getElementById('salePrepaidAmount').value = data.total || 0;
    document.getElementById('saleOldDebt').textContent = formatCurrency(data.total);
}
```

#### Tính toán COD
```javascript
function updateSaleCOD() {
    const productTotal = parseFloat(document.getElementById('saleProductTotal')?.value) || 0;
    const shippingFee = parseFloat(document.getElementById('saleShippingFee')?.value) || 35000;
    const cod = productTotal + shippingFee;
    document.getElementById('saleCOD').value = cod;
    updateSaleRemainingBalance();
}

function updateSaleRemainingBalance() {
    const cod = parseFloat(document.getElementById('saleCOD')?.value) || 0;
    const prepaid = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
    const remaining = Math.max(0, cod - prepaid);
    document.getElementById('saleRemainingBalance').textContent = formatCurrency(remaining);
}
```

#### Trừ ví khi xác nhận đơn (Outbox Pattern)
```javascript
async function confirmAndPrintSale() {
    // ... tạo đơn TPOS thành công ...

    if (currentDebt > 0 && customerPhone) {
        const actualPayment = Math.min(currentDebt, codAmount);

        // Gọi Pending-Withdrawals API (Outbox Pattern)
        const RENDER_API_URL = 'https://n2store-fallback.onrender.com';
        fetch(`${RENDER_API_URL}/api/v2/pending-withdrawals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: orderNumber,
                order_number: orderNumber,
                phone: normalizedPhone,
                amount: actualPayment,
                source: 'SALE_ORDER',
                note: `Thanh toán công nợ qua COD đơn hàng #${orderNumber}`,
                created_by: performedBy
            })
        });
    }
}
```

### 3.3 Fast Sale Modal - Tạo đơn hàng loạt (PBH)

**File:** `orders-report/js/tab1/tab1-fast-sale.js`

#### Fetch wallet balance batch cho tất cả đơn
```javascript
async function fetchWalletBalancesForFastSale(phones) {
    const uniquePhones = [...new Set(phones.map(normalizePhone).filter(Boolean))];

    const response = await fetch(`${QR_API_URL}/api/wallet/batch-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: uniquePhones })
    });

    const data = await response.json();
    fastSaleWalletBalances = data.data || {};
}
```

#### Hiển thị wallet balance trong mỗi row
```javascript
function renderFastSaleOrderRow(order, index) {
    const walletData = fastSaleWalletBalances[normalizedPhone];
    const totalBalance = (walletData?.balance || 0) + (walletData?.virtualBalance || 0);

    return `
        <tr>
            ...
            <td>
                <i class="fas fa-wallet" style="color: ${totalBalance > 0 ? '#28a745' : '#6c757d'}"></i>
                <span>${formatCurrency(totalBalance)}</span>
            </td>
            ...
        </tr>
    `;
}
```

#### Trừ ví sau khi tạo đơn thành công
```javascript
async function processWalletWithdrawalsForSuccessOrders() {
    const successOrders = fastSaleResultsData.success;

    for (const order of successOrders) {
        const walletData = fastSaleWalletBalances[normalizedPhone];
        const totalWalletBalance = (walletData?.balance || 0) + (walletData?.virtualBalance || 0);
        const withdrawAmount = Math.min(totalWalletBalance, codAmount);

        if (withdrawAmount > 0) {
            const RENDER_API_URL = 'https://n2store-fallback.onrender.com';
            await fetch(`${RENDER_API_URL}/api/v2/pending-withdrawals`, {
                method: 'POST',
                body: JSON.stringify({
                    order_id: orderNumber,
                    phone: normalizedPhone,
                    amount: withdrawAmount,
                    source: 'FAST_SALE'
                })
            });
        }
    }
}
```

### 3.4 UI Elements trong Orders-Report

| Element ID | Vị trí | Mô tả |
|------------|--------|-------|
| `td[data-column="debt"]` | Bảng chính | Cột hiển thị số dư ví |
| `#salePrepaidAmount` | Sale Modal | Input số dư ví/công nợ |
| `#saleOldDebt` | Sale Modal | Hiển thị công nợ cũ |
| `#saleCOD` | Sale Modal | Input COD |
| `#saleShippingFee` | Sale Modal | Input phí ship |
| `#saleRemainingBalance` | Sale Modal | Số tiền còn phải thu |
| `#confirmDebtBtn` | Sale Modal | Nút xác nhận cập nhật công nợ |
| `#chatDebtValue` | Chat Modal | Hiển thị số dư ví trong chat |

---

## 4. Customer-Hub (Customer 360°)

### 4.1 Wallet Panel

**File:** `customer-hub/js/modules/wallet-panel.js`

#### Hiển thị thông tin ví
```javascript
async loadWalletDetails() {
    const wallet = await apiService.getWallet(this.customerPhone);
    this.renderWallet(wallet);
}

renderWallet(wallet) {
    const total = (wallet.balance || 0) + (wallet.virtual_balance || 0);

    return `
        <div class="wallet-summary">
            <div class="wallet-total">
                <span class="label">Số dư khả dụng</span>
                <span class="value">${formatCurrency(total)}</span>
            </div>
            <div class="wallet-breakdown">
                <div class="real-balance">
                    <span>Tiền thật:</span>
                    <span>${formatCurrency(wallet.balance)}</span>
                </div>
                <div class="virtual-balance">
                    <span>Công nợ ảo:</span>
                    <span>${formatCurrency(wallet.virtual_balance)}</span>
                </div>
            </div>
        </div>
    `;
}
```

#### Các thao tác với ví

**Nạp tiền (Deposit):**
```javascript
async _handleDeposit(amount, note) {
    const response = await fetch(`${apiService.RENDER_API_URL}/wallets/${this.customerPhone}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: parseFloat(amount),
            note: note,
            source: 'MANUAL_ADJUSTMENT'
        })
    });
}
```

**Rút tiền (Withdraw):**
```javascript
async _handleWithdraw(amount, note) {
    const response = await fetch(`${apiService.RENDER_API_URL}/wallets/${this.customerPhone}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: parseFloat(amount),
            note: note
        })
    });
}
```

**Cấp công nợ ảo (Virtual Credit):**
```javascript
async _handleIssueVirtualCredit(amount, expiryDays, note) {
    const response = await fetch(`${apiService.RENDER_API_URL}/wallets/${this.customerPhone}/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: parseFloat(amount),
            expiry_days: parseInt(expiryDays) || 15,
            note: note
        })
    });
}
```

#### Xem lịch sử giao dịch
```javascript
async _showTransactionHistory() {
    const response = await fetch(
        `${apiService.RENDER_API_URL}/customer/${this.customerPhone}/transactions?limit=50`
    );
    const data = await response.json();

    const html = data.transactions.map(tx => this._renderTransactionItem(tx)).join('');
    // Hiển thị trong modal
}

_renderTransactionItem(tx) {
    const isCredit = ['DEPOSIT', 'VIRTUAL_CREDIT_ISSUED'].includes(tx.type);
    const color = isCredit ? 'green' : 'red';
    const sign = isCredit ? '+' : '-';

    return `
        <div class="transaction-item">
            <div class="tx-type">${getTypeLabel(tx.type)}</div>
            <div class="tx-amount" style="color: ${color}">
                ${sign}${formatCurrency(tx.amount)}
            </div>
            <div class="tx-note">${tx.note || ''}</div>
            <div class="tx-date">${formatDate(tx.created_at)}</div>
        </div>
    `;
}
```

### 4.2 API Service

**File:** `customer-hub/js/api-service.js`

```javascript
const ApiService = {
    RENDER_API_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev/api',
    RENDER_SSE_URL: 'https://n2store-fallback.onrender.com',

    async getWallet(phone) {
        const response = await fetch(`${this.RENDER_API_URL}/wallet/${phone}`);
        return response.json();
    },

    async walletDeposit(phone, amount, options = {}) {
        return fetch(`${this.RENDER_API_URL}/wallet/${phone}/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, ...options })
        });
    },

    async walletWithdraw(phone, amount, orderId, note) {
        return fetch(`${this.RENDER_API_URL}/wallet/${phone}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, order_id: orderId, note })
        });
    },

    async getWalletBatch(phones) {
        return fetch(`${this.RENDER_API_URL}/wallet/batch-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phones })
        });
    }
};
```

### 4.3 Real-time Updates

```javascript
// Kết nối SSE để nhận cập nhật realtime
_subscribeToWalletUpdates() {
    const eventSource = new EventSource(
        `${apiService.RENDER_SSE_URL}/api/realtime/sse?keys=wallet:${this.customerPhone}`
    );

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'wallet_update') {
            this.loadWalletDetails(); // Refresh wallet display
        }
    };
}
```

---

## 5. Backend APIs

### 5.1 V1 APIs (Legacy)

**File:** `render.com/routes/customer-360.js`

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/wallet/:phone` | GET | Lấy thông tin ví |
| `/api/wallet/:phone/deposit` | POST | Nạp tiền |
| `/api/wallet/:phone/withdraw` | POST | Rút tiền |
| `/api/wallet/:phone/virtual-credit` | POST | Cấp công nợ ảo |
| `/api/wallet/batch-summary` | POST | Lấy ví nhiều khách |

### 5.2 V2 APIs (Current)

**File:** `render.com/routes/v2/wallets.js`

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/v2/wallets/:customerId` | GET | Lấy thông tin ví |
| `/api/v2/wallets/:customerId/deposit` | POST | Nạp tiền |
| `/api/v2/wallets/:customerId/withdraw` | POST | Rút tiền (FIFO) |
| `/api/v2/wallets/:customerId/credit` | POST | Cấp công nợ ảo |
| `/api/v2/wallets/:customerId/transactions` | GET | Lịch sử giao dịch |
| `/api/v2/wallets/batch-summary` | POST | Lấy ví nhiều khách |
| `/api/v2/wallets/adjustment` | POST | Điều chỉnh ví (admin) |

### 5.3 Pending Withdrawals API (Outbox Pattern)

**File:** `render.com/routes/v2/pending-withdrawals.js`

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/v2/pending-withdrawals` | POST | Tạo pending withdrawal |
| `/api/v2/pending-withdrawals` | GET | Liệt kê pending (admin) |
| `/api/v2/pending-withdrawals/stats` | GET | Thống kê |
| `/api/v2/pending-withdrawals/:id/retry` | POST | Retry thủ công |
| `/api/v2/pending-withdrawals/:id/cancel` | POST | Hủy pending |
| `/api/v2/pending-withdrawals/process-pending` | POST | Cron endpoint |

---

## 6. Database Schema

### 6.1 customer_wallets
```sql
CREATE TABLE customer_wallets (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    phone VARCHAR(20) UNIQUE NOT NULL,
    balance DECIMAL(15,2) DEFAULT 0 CHECK (balance >= 0),        -- Tiền thật
    virtual_balance DECIMAL(15,2) DEFAULT 0 CHECK (virtual_balance >= 0), -- Công nợ ảo
    total_deposited DECIMAL(15,2) DEFAULT 0,
    total_withdrawn DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.2 wallet_transactions
```sql
CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    wallet_id INTEGER REFERENCES customer_wallets(id),
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'DEPOSIT',              -- Nạp tiền thật
        'WITHDRAW',             -- Rút tiền thật
        'VIRTUAL_CREDIT',       -- Cấp công nợ ảo
        'VIRTUAL_DEBIT',        -- Dùng công nợ ảo
        'VIRTUAL_EXPIRE',       -- Công nợ ảo hết hạn
        'ADJUSTMENT'            -- Điều chỉnh
    )),
    amount DECIMAL(15,2) NOT NULL,
    balance_before DECIMAL(15,2),
    balance_after DECIMAL(15,2),
    source VARCHAR(50),         -- BANK_TRANSFER, MANUAL, ORDER, etc.
    reference_type VARCHAR(50), -- balance_history, order, etc.
    reference_id INTEGER,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.3 virtual_credits
```sql
CREATE TABLE virtual_credits (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    wallet_id INTEGER REFERENCES customer_wallets(id),
    original_amount DECIMAL(15,2) NOT NULL,
    remaining_amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED')),
    source_type VARCHAR(50),    -- BOOM, RETURN, ADMIN, etc.
    source_id VARCHAR(100),
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used_in_orders JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.4 pending_wallet_withdrawals (Outbox Pattern)
```sql
CREATE TABLE pending_wallet_withdrawals (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(100) NOT NULL,
    order_number VARCHAR(100),
    phone VARCHAR(20) NOT NULL,
    customer_id INTEGER,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    source VARCHAR(50) DEFAULT 'SALE_ORDER',  -- SALE_ORDER, FAST_SALE
    note TEXT,
    created_by VARCHAR(100),
    status VARCHAR(20) DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    last_error TEXT,
    last_retry_at TIMESTAMP,
    wallet_transaction_id INTEGER,
    virtual_used DECIMAL(15,2) DEFAULT 0,
    real_used DECIMAL(15,2) DEFAULT 0,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, phone)  -- Đảm bảo idempotency
);
```

---

## 7. Outbox Pattern - Pending Withdrawals

### 7.1 Tại sao cần Outbox Pattern?

**Vấn đề:**
- Khi tạo đơn TPOS thành công nhưng mất mạng trước khi gọi withdraw API → Mất tiền
- Direct withdraw không idempotent → Gọi nhiều lần = trừ nhiều lần

**Giải pháp:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  OUTBOX PATTERN FLOW                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [1] TPOS tạo đơn thành công                                            │
│              │                                                          │
│              ▼                                                          │
│  [2] POST /api/v2/pending-withdrawals                                   │
│      → INSERT với UNIQUE(order_id, phone)                               │
│      → Nếu đã tồn tại → return existing (idempotent)                    │
│              │                                                          │
│              ▼                                                          │
│  [3] Process ngay (setImmediate, non-blocking)                          │
│      ├── SUCCESS → status='COMPLETED' ✅                                │
│      └── FAIL → status='PENDING' ⏱️                                     │
│              │                                                          │
│              ▼                                                          │
│  [4] CRON mỗi 5 phút                                                    │
│      → Query: status='PENDING' AND created_at < NOW() - 1 minute        │
│      → Retry từng record                                                │
│      → Max 5 retries → status='FAILED' + Alert admin 🚨                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Idempotency

```javascript
// Gọi nhiều lần với cùng order_id + phone → chỉ xử lý 1 lần
const existingResult = await db.query(`
    SELECT id, status FROM pending_wallet_withdrawals
    WHERE order_id = $1 AND phone = $2
`, [order_id, phone]);

if (existingResult.rows.length > 0) {
    if (existing.status === 'COMPLETED') {
        return { success: true, skipped: true };
    }
    // Đã tồn tại, cron sẽ xử lý
    return { success: true, pending_id: existing.id };
}
```

### 7.3 FIFO Withdrawal Logic

```sql
-- Function wallet_withdraw_fifo trừ theo thứ tự:
-- 1. Virtual credits (theo expires_at ASC - sắp hết hạn trước)
-- 2. Real balance

-- Ví dụ: Wallet có 100k real + 50k virtual (hết hạn 3 ngày)
-- Withdraw 120k:
-- → Trừ 50k virtual (hết)
-- → Trừ 70k real
-- → Còn lại 30k real, 0 virtual
```

---

## 8. Real-time Updates (SSE)

### 8.1 Server-Sent Events

**Endpoint:** `GET /api/realtime/sse?keys=wallet:{phone}`

```javascript
// Frontend subscribe
const eventSource = new EventSource(
    `https://n2store-fallback.onrender.com/api/realtime/sse?keys=wallet:0901234567`
);

eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // { type: 'wallet_update', phone: '0901234567', balance: 500000, virtual_balance: 100000 }
    updateWalletDisplay(data);
};
```

### 8.2 Khi nào SSE được trigger?

1. Khi có bank transfer mới (SePay webhook)
2. Khi deposit/withdraw thành công
3. Khi virtual credit được cấp/dùng/hết hạn

---

## 9. Troubleshooting

### 9.1 Số dư ví không hiển thị

**Nguyên nhân:**
- API URL sai hoặc CORS blocked
- Cache hết hạn nhưng không fetch lại
- Phone number format không chuẩn

**Giải pháp:**
```javascript
// Kiểm tra trong Console
console.log('Cache:', getDebtCache());
console.log('Phone format:', normalizePhone('0901234567'));

// Clear cache và refetch
localStorage.removeItem('debtCache');
location.reload();
```

### 9.2 Trừ ví thất bại

**Kiểm tra:**
1. Xem log trong Console: `[SALE-CONFIRM]` hoặc `[FAST-SALE]`
2. Kiểm tra pending_wallet_withdrawals table:
```sql
SELECT * FROM pending_wallet_withdrawals
WHERE phone = '0901234567'
ORDER BY created_at DESC LIMIT 10;
```

3. Kiểm tra status:
   - `PENDING` → Cron sẽ retry
   - `FAILED` → Cần xử lý thủ công
   - `COMPLETED` → Đã thành công

### 9.3 Duplicate withdrawal

**Kiểm tra:**
```sql
-- Tìm duplicate
SELECT order_id, phone, COUNT(*)
FROM pending_wallet_withdrawals
GROUP BY order_id, phone
HAVING COUNT(*) > 1;

-- Kiểm tra wallet_transactions
SELECT * FROM wallet_transactions
WHERE phone = '0901234567'
AND reference_id = 'ORDER_NUMBER'
ORDER BY created_at DESC;
```

### 9.4 Virtual credit không được trừ

**Kiểm tra:**
```sql
-- Xem virtual credits còn active
SELECT * FROM virtual_credits
WHERE phone = '0901234567'
AND status = 'ACTIVE'
AND expires_at > NOW()
ORDER BY expires_at ASC;
```

---

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-01-27 | Thêm Outbox Pattern cho pending withdrawals |
| 2026-01-27 | Viết documentation chi tiết |
