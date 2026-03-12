# Fix: Wallet/Công Nợ Data Source - Chi tiết thay đổi

## Ngày thực hiện: 2026-01-27

## Tóm tắt vấn đề

### Vấn đề 1: Sai nguồn dữ liệu
- **Công nợ** hiển thị trong Chat modal và Sale modal đọc từ **SAI** nguồn dữ liệu
- Đang đọc từ `balance_history` (SUM tiền nạp) thay vì `customer_wallets` (số dư thực tế)

### Vấn đề 2: API deprecated
- Khi tạo hóa đơn, ví không bị trừ vì API `/api/sepay/update-debt` đã bị deprecated (trả về 410 Gone)

---

## Phân tích nguyên nhân gốc

### Nguồn dữ liệu SAI (Trước đây)

```
balance_history table
    ↓
SUM(transfer_amount) WHERE transfer_type = 'in'
    ↓
/api/sepay/debt-summary
    ↓
❌ Chỉ tính TIỀN NẠP VÀO, không tính tiền đã RÚT RA
```

**Ví dụ lỗi:**
- Khách nạp 100,000đ → balance_history ghi +100,000đ
- Khách mua hàng 50,000đ → wallet trừ 50,000đ nhưng balance_history KHÔNG thay đổi
- API cũ vẫn trả về 100,000đ (SAI) thay vì 50,000đ (ĐÚNG)

### Nguồn dữ liệu ĐÚNG (Sau khi sửa)

```
customer_wallets table (SINGLE SOURCE OF TRUTH)
    ├── balance (tiền thực)
    └── virtual_balance (công nợ ảo)
    ↓
/api/wallet/:phone
    ↓
✅ Trả về số dư THỰC TẾ sau khi đã trừ các giao dịch
```

---

## Chi tiết các thay đổi

### File 1: `orders-report/js/tab1/tab1-qr-debt.js`

#### 1.1 Hàm `fetchDebtForPhone()` (dòng 125-153)

**TRƯỚC:**
```javascript
async function fetchDebtForPhone(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return 0;

    try {
        const response = await fetch(`${QR_API_URL}/api/sepay/debt-summary?phone=${encodeURIComponent(normalizedPhone)}`);
        const result = await response.json();

        if (result.success && result.data) {
            const totalDebt = result.data.total_debt || 0;
            saveDebtToCache(normalizedPhone, totalDebt);
            return totalDebt;
        }
    } catch (error) {
        console.error('[DEBT] Error fetching:', error);
    }

    return 0;
}
```

**SAU:**
```javascript
async function fetchDebtForPhone(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return 0;

    try {
        // 🔥 FIX: Use Customer 360 Wallet API instead of SePay debt-summary
        const response = await fetch(`${QR_API_URL}/api/wallet/${encodeURIComponent(normalizedPhone)}`);
        const result = await response.json();

        if (result.success && result.data) {
            // Wallet API returns balance + virtual_balance
            const balance = parseFloat(result.data.balance) || 0;
            const virtualBalance = parseFloat(result.data.virtual_balance || result.data.virtualBalance) || 0;
            const totalBalance = balance + virtualBalance;
            saveDebtToCache(normalizedPhone, totalBalance);
            return totalBalance;
        }
    } catch (error) {
        console.error('[WALLET] Error fetching:', error);
    }

    return 0;
}
```

**Thay đổi:**
- API: `/api/sepay/debt-summary` → `/api/wallet/:phone`
- Response mapping: `total_debt` → `balance + virtual_balance`

---

#### 1.2 Hàm `batchFetchDebts()` (dòng 211-291)

**TRƯỚC:**
```javascript
async function batchFetchDebts(phones) {
    // ...
    const response = await fetch(`${QR_API_URL}/api/sepay/debt-summary-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: uncachedPhones })
    });

    // ...
    for (const [phone, debtData] of Object.entries(result.data)) {
        const totalDebt = debtData.total_debt || 0;
        saveDebtToCache(phone, totalDebt);
        updateDebtCells(phone, totalDebt);
    }
}
```

**SAU:**
```javascript
async function batchFetchDebts(phones) {
    // ...
    // 🔥 FIX: Use Wallet batch API instead of SePay debt-summary-batch
    const response = await fetch(`${QR_API_URL}/api/v2/wallets/batch-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: uncachedPhones })
    });

    // ...
    for (const [phone, walletData] of Object.entries(result.data)) {
        // Wallet API returns: { balance, virtualBalance, total }
        const totalBalance = walletData.total || ((walletData.balance || 0) + (walletData.virtualBalance || 0));
        saveDebtToCache(phone, totalBalance);
        updateDebtCells(phone, totalBalance);
    }
}
```

**Thay đổi:**
- API: `/api/sepay/debt-summary-batch` → `/api/v2/wallets/batch-summary`
- Response mapping: `total_debt` → `total` hoặc `balance + virtualBalance`

---

#### 1.3 Hàm `fetchDebtForSaleModal()` (dòng 1470-1529)

**TRƯỚC:**
```javascript
async function fetchDebtForSaleModal(phone) {
    // ...
    const response = await fetch(`${QR_API_URL}/api/sepay/debt-summary?phone=${encodeURIComponent(normalizedPhone)}`);
    const result = await response.json();

    if (result.success && result.data) {
        const totalDebt = result.data.total_debt || 0;
        console.log('[SALE-MODAL] Realtime debt for phone:', normalizedPhone, '=', totalDebt);

        if (prepaidAmountField) {
            prepaidAmountField.value = totalDebt > 0 ? totalDebt : 0;
        }
        // ...
    }
}
```

**SAU:**
```javascript
async function fetchDebtForSaleModal(phone) {
    // ...
    // 🔥 FIX: Use Customer 360 Wallet API instead of SePay debt-summary
    const response = await fetch(`${QR_API_URL}/api/wallet/${encodeURIComponent(normalizedPhone)}`);
    const result = await response.json();

    if (result.success && result.data) {
        // Wallet API returns balance + virtual_balance
        const balance = parseFloat(result.data.balance) || 0;
        const virtualBalance = parseFloat(result.data.virtual_balance || result.data.virtualBalance) || 0;
        const totalBalance = balance + virtualBalance;

        console.log('[SALE-MODAL] Wallet balance for phone:', normalizedPhone, '=', totalBalance,
                    '(real:', balance, ', virtual:', virtualBalance, ')');

        if (prepaidAmountField) {
            prepaidAmountField.value = totalBalance > 0 ? totalBalance : 0;
        }
        // ...
    }
}
```

---

### File 2: `orders-report/js/tab1/tab1-address-stats.js`

#### 2.1 Hàm `loadChatDebt()` (dòng 1245-1292)

**TRƯỚC:**
```javascript
async function loadChatDebt(phone) {
    // ...
    const response = await fetch(`${QR_API_URL}/api/sepay/debt-summary?phone=${encodeURIComponent(normalizedPhone)}`);
    const result = await response.json();

    if (result.success && result.data) {
        const totalDebt = result.data.total_debt || 0;
        console.log('[CHAT-DEBT] Realtime debt for phone:', normalizedPhone, '=', totalDebt);

        saveDebtToCache(normalizedPhone, totalDebt);
        updateChatDebtDisplay(totalDebt);
        updateDebtCellsInTable(normalizedPhone, totalDebt);
    }
}
```

**SAU:**
```javascript
async function loadChatDebt(phone) {
    // ...
    // 🔥 FIX: Use Customer 360 Wallet API instead of SePay debt-summary
    const response = await fetch(`${QR_API_URL}/api/wallet/${encodeURIComponent(normalizedPhone)}`);
    const result = await response.json();

    if (result.success && result.data) {
        // Wallet API returns balance + virtual_balance
        const balance = parseFloat(result.data.balance) || 0;
        const virtualBalance = parseFloat(result.data.virtual_balance || result.data.virtualBalance) || 0;
        const totalBalance = balance + virtualBalance;

        console.log('[CHAT-DEBT] Wallet balance for phone:', normalizedPhone, '=', totalBalance,
                    '(real:', balance, ', virtual:', virtualBalance, ')');

        saveDebtToCache(normalizedPhone, totalBalance);
        updateChatDebtDisplay(totalBalance);
        updateDebtCellsInTable(normalizedPhone, totalBalance);
    }
}
```

---

### File 3: `orders-report/js/tab1/tab1-sale.js`

#### 3.1 Hàm `confirmAndPrintSale()` - Phần trừ ví (dòng 627-672)

**TRƯỚC:**
```javascript
// Update debt after order creation (same logic as before)
const currentDebt = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
const codAmount = parseFloat(document.getElementById('saleCOD')?.value) || 0;
if (currentDebt > 0) {
    const customerPhone = document.getElementById('saleReceiverPhone')?.value || currentSaleOrderData?.PartnerPhone || currentSaleOrderData?.Telephone;
    if (customerPhone) {
        const actualPayment = Math.min(currentDebt, codAmount);
        const remainingDebt = Math.max(0, currentDebt - codAmount);

        console.log('[SALE-CONFIRM] Debt calculation - current:', currentDebt, 'COD:', codAmount, 'paid:', actualPayment, 'remaining:', remainingDebt);

        const prepaidInput = document.getElementById('salePrepaidAmount');
        if (prepaidInput) {
            prepaidInput.value = remainingDebt;
            updateSaleCOD();
        }

        // ❌ API đã deprecated - trả về 410 Gone
        fetch(`${QR_API_URL}/api/sepay/update-debt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: customerPhone,
                new_debt: remainingDebt,
                old_debt: currentDebt,
                reason: `Thanh toán công nợ ${actualPayment.toLocaleString('vi-VN')}đ qua đơn hàng #${orderNumber}${remainingDebt > 0 ? ` (còn nợ ${remainingDebt.toLocaleString('vi-VN')}đ)` : ''}`
            })
        }).then(res => res.json()).then(debtResult => {
            if (debtResult.success) {
                console.log('[SALE-CONFIRM] ✅ Debt updated to', remainingDebt);
                // ...
            }
        }).catch(err => console.error('[SALE-CONFIRM] Error updating debt:', err));
    }
}
```

**SAU:**
```javascript
// Update wallet after order creation using WalletIntegration
const currentWalletBalance = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
const codAmount = parseFloat(document.getElementById('saleCOD')?.value) || 0;
if (currentWalletBalance > 0) {
    const customerPhone = document.getElementById('saleReceiverPhone')?.value || currentSaleOrderData?.PartnerPhone || currentSaleOrderData?.Telephone;
    if (customerPhone) {
        // Calculate how much to deduct from wallet (max = order total or wallet balance)
        const orderTotal = parseFloat(document.getElementById('saleTotal')?.textContent?.replace(/[^\d]/g, '')) || codAmount;
        const amountToDeduct = Math.min(currentWalletBalance, orderTotal);

        console.log('[SALE-CONFIRM] Wallet calculation - balance:', currentWalletBalance, 'orderTotal:', orderTotal, 'toDeduct:', amountToDeduct);

        // 🔥 FIX: Use WalletIntegration.withdrawWallet() instead of deprecated /api/sepay/update-debt
        if (amountToDeduct > 0 && typeof WalletIntegration !== 'undefined' && WalletIntegration.withdrawWallet) {
            WalletIntegration.withdrawWallet(
                customerPhone,
                amountToDeduct,
                orderNumber,
                `Thanh toán đơn hàng #${orderNumber}`
            ).then(result => {
                console.log('[SALE-CONFIRM] ✅ Wallet deducted:', result);
                const newTotalBalance = (result.newBalance || 0) + (result.newVirtualBalance || 0);
                const normalizedPhone = normalizePhoneForQR(customerPhone);
                if (normalizedPhone) {
                    // Update cache with new balance
                    const cache = getDebtCache();
                    cache[normalizedPhone] = { debt: newTotalBalance, timestamp: Date.now() };
                    saveDebtCache(cache);
                    // Update UI
                    updateDebtCellsInTable(normalizedPhone, newTotalBalance);
                    // Update prepaid input to show remaining balance
                    const prepaidInput = document.getElementById('salePrepaidAmount');
                    if (prepaidInput) {
                        prepaidInput.value = newTotalBalance;
                        updateSaleCOD();
                    }
                }
            }).catch(err => {
                console.error('[SALE-CONFIRM] ❌ Error withdrawing wallet:', err);
                window.notificationManager?.error('Lỗi trừ ví: ' + err.message);
            });
        } else if (amountToDeduct > 0) {
            console.warn('[SALE-CONFIRM] WalletIntegration not available, skipping wallet deduction');
        }
    }
}
```

**Thay đổi chính:**
- API: `/api/sepay/update-debt` (410 Gone) → `WalletIntegration.withdrawWallet()`
- Logic: Thay vì set new_debt trực tiếp, gọi API withdraw để trừ số tiền cụ thể
- FIFO: Wallet API tự động ưu tiên trừ virtual_balance trước, sau đó mới trừ balance

---

## API Endpoints Reference

| Mục đích | API Cũ (SAI) | API Mới (ĐÚNG) |
|----------|--------------|----------------|
| Lấy số dư ví | `/api/sepay/debt-summary` | `/api/wallet/:phone` |
| Lấy số dư ví hàng loạt | `/api/sepay/debt-summary-batch` | `/api/v2/wallets/batch-summary` |
| Trừ tiền từ ví | `/api/sepay/update-debt` (410) | `/api/wallet/:phone/withdraw` |

---

## Response Format Mapping

### `/api/wallet/:phone` Response:
```json
{
    "success": true,
    "data": {
        "phone": "0901234567",
        "balance": 50000,           // Tiền thực
        "virtual_balance": 10000,   // Công nợ ảo
        "virtualCredits": [...]     // Chi tiết các khoản virtual credit
    }
}
```

### `/api/v2/wallets/batch-summary` Response:
```json
{
    "success": true,
    "data": {
        "0901234567": {
            "balance": 50000,
            "virtualBalance": 10000,
            "total": 60000
        },
        "0909876543": {
            "balance": 100000,
            "virtualBalance": 0,
            "total": 100000
        }
    }
}
```

### `WalletIntegration.withdrawWallet()` Response:
```json
{
    "virtualUsed": 10000,      // Số tiền virtual đã trừ
    "realUsed": 40000,         // Số tiền thực đã trừ
    "totalUsed": 50000,        // Tổng số tiền đã trừ
    "newBalance": 10000,       // Số dư thực mới
    "newVirtualBalance": 0     // Số dư virtual mới
}
```

---

## Logic Flow Diagram

### Flow TRƯỚC khi sửa (SAI):

```
[User mở Sale Modal]
        ↓
[fetchDebtForSaleModal(phone)]
        ↓
[GET /api/sepay/debt-summary] ──→ Đọc từ balance_history
        ↓                         (SUM tiền nạp, không tính tiền đã dùng)
[Hiển thị công nợ SAI]
        ↓
[User click "Xác nhận và in"]
        ↓
[POST /api/sepay/update-debt] ──→ ❌ 410 Gone (API deprecated)
        ↓
[Ví KHÔNG bị trừ]
```

### Flow SAU khi sửa (ĐÚNG):

```
[User mở Sale Modal]
        ↓
[fetchDebtForSaleModal(phone)]
        ↓
[GET /api/wallet/:phone] ──→ Đọc từ customer_wallets
        ↓                    (balance + virtual_balance = số dư thực tế)
[Hiển thị công nợ ĐÚNG]
        ↓
[User click "Xác nhận và in"]
        ↓
[WalletIntegration.withdrawWallet()] ──→ POST /api/wallet/:phone/withdraw
        ↓                                       ↓
        ↓                              [wallet_withdraw_fifo() PostgreSQL]
        ↓                                       ↓
        ↓                              [Trừ virtual_balance trước (FIFO)]
        ↓                              [Rồi mới trừ balance]
        ↓                                       ↓
[Ví ĐÃ bị trừ ĐÚNG] ←──────────────────────────┘
        ↓
[SSE notification sent]
        ↓
[UI cập nhật số dư mới]
```

---

## Database Schema

### Table: `customer_wallets` (SINGLE SOURCE OF TRUTH)

```sql
CREATE TABLE customer_wallets (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    phone VARCHAR(20) NOT NULL UNIQUE,
    balance DECIMAL(15,2) DEFAULT 0,           -- Tiền thực
    virtual_balance DECIMAL(15,2) DEFAULT 0,   -- Công nợ ảo
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Table: `wallet_transactions` (Lịch sử giao dịch)

```sql
CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER REFERENCES customer_wallets(id),
    phone VARCHAR(20) NOT NULL,
    type VARCHAR(50) NOT NULL,      -- DEPOSIT, WITHDRAW, VIRTUAL_CREDIT_ISSUED, etc.
    amount DECIMAL(15,2) NOT NULL,
    balance_before DECIMAL(15,2),
    balance_after DECIMAL(15,2),
    virtual_balance_before DECIMAL(15,2),
    virtual_balance_after DECIMAL(15,2),
    source VARCHAR(100),
    reference_type VARCHAR(50),
    reference_id VARCHAR(100),
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Function: `wallet_withdraw_fifo()` (FIFO Withdrawal)

```sql
-- Trừ virtual_balance trước (theo thứ tự hết hạn sớm nhất)
-- Sau đó mới trừ balance nếu virtual không đủ
CREATE OR REPLACE FUNCTION wallet_withdraw_fifo(
    p_phone VARCHAR,
    p_amount DECIMAL,
    p_order_id VARCHAR,
    p_note TEXT
) RETURNS JSON AS $$
DECLARE
    v_virtual_used DECIMAL := 0;
    v_real_used DECIMAL := 0;
    -- ...
BEGIN
    -- 1. Trừ từ virtual_credits (FIFO by expires_at)
    -- 2. Trừ từ balance nếu còn thiếu
    -- 3. Cập nhật customer_wallets
    -- 4. Ghi wallet_transactions
    -- 5. Return JSON result
END;
$$ LANGUAGE plpgsql;
```

---

## Files đã sửa

| File | Hàm | Thay đổi |
|------|-----|----------|
| `tab1-qr-debt.js` | `fetchDebtForPhone()` | API: debt-summary → wallet |
| `tab1-qr-debt.js` | `batchFetchDebts()` | API: debt-summary-batch → batch-summary |
| `tab1-qr-debt.js` | `fetchDebtForSaleModal()` | API: debt-summary → wallet |
| `tab1-address-stats.js` | `loadChatDebt()` | API: debt-summary → wallet |
| `tab1-sale.js` | `confirmAndPrintSale()` | API: update-debt → withdrawWallet() |

---

## Cách test

### Test 1: Kiểm tra hiển thị công nợ
1. Tìm khách hàng có balance trong `customer_wallets`
2. So sánh giá trị trong `balance_history` (SUM) với `customer_wallets.balance + virtual_balance`
3. Mở Chat modal và Sale modal - số hiển thị phải khớp với `customer_wallets`

### Test 2: Kiểm tra trừ ví
1. Mở Console (F12)
2. Tạo hóa đơn cho khách có số dư ví
3. Kiểm tra log: `[SALE-CONFIRM] ✅ Wallet deducted:`
4. Không có lỗi `410 Gone`
5. Kiểm tra `wallet_transactions` có record WITHDRAW mới

### Test 3: Kiểm tra SSE notification
1. Mở 2 tab cùng khách hàng
2. Trừ ví ở tab 1
3. Tab 2 phải tự động cập nhật số dư mới

---

## Dependencies

Các file/function đã có sẵn (không cần sửa):

- ✅ `/api/wallet/:phone` - customer-360.js:638
- ✅ `/api/wallet/:phone/withdraw` - customer-360.js:749
- ✅ `/api/v2/wallets/batch-summary` - wallets.js:314
- ✅ `WalletIntegration.withdrawWallet()` - wallet-integration.js:184
- ✅ `wallet_withdraw_fifo()` - migrations/002_create_customer_360_triggers.sql
- ✅ SSE notifications - wallet-event-processor.js
