# Wallet Centralization - Thay Đổi Và Flow Logic Mới

## Ngày Thay Đổi: 2026-01-13

## Mục Tiêu

Đảm bảo TẤT CẢ wallet operations đều đi qua `wallet-event-processor.js` để:
- Single Source of Truth
- SSE realtime notifications
- Idempotency checks
- Consistent logging

---

## SSE NOTIFICATIONS - HIỂN THỊ Ở ĐÂU

### Frontend File: [wallet-panel.js](../customer-hub/js/modules/wallet-panel.js)

### Flow SSE:

```
[Backend: processWalletEvent()]
         │
         ▼
[walletEvents.emit('wallet:update', eventData)]
[walletEvents.emit(`wallet:${phone}`, eventData)]
         │
         ▼
[/api/realtime/sse endpoint]
         │
         ▼
[Frontend: EventSource subscribes to wallet:${phone}]
         │
         ▼
[handleWalletUpdate(data)]
         │
         ├──────────────────────────┐
         ▼                          ▼
[renderWallet(wallet)]    [showUpdateNotification(transaction)]
(Cập nhật số dư panel)    (Toast popup góc phải dưới màn hình)
```

### 2 Cách Hiển Thị:

**1. Cập nhật Wallet Panel (realtime)**
- Method: `renderWallet()`
- Hiển thị: Panel ví được cập nhật ngay lập tức với số dư mới
- Nội dung: "Số dư khả dụng", "Tiền nạp CK", "Công nợ ảo"

**2. Toast Notification (popup)**
- Method: `showUpdateNotification()`
- Hiển thị: Toast popup ở góc phải dưới màn hình
- Nội dung: "Nạp tiền thành công!" hoặc "Cập nhật ví" + số tiền
- Tự động ẩn sau 5 giây

---

## CÁC FILE ĐÃ SỬA

### 1. render.com/services/wallet-event-processor.js

**Thay đổi:** Thêm hàm mới `processManualDeposit`

```javascript
/**
 * Process manual deposit (admin/accounting - no balance_history)
 * Use this for deposits NOT from bank transfers
 */
async function processManualDeposit(db, phone, amount, source, referenceId, note, customerId = null) {
    return processWalletEvent(db, {
        type: WALLET_EVENT_TYPES.DEPOSIT,
        phone,
        amount,
        source: source || WALLET_SOURCES.MANUAL_ADJUSTMENT,
        referenceType: 'manual',
        referenceId: referenceId || 'admin',
        note: note || 'Nạp tiền thủ công',
        customerId
    });
}
```

**Export mới:**
```javascript
module.exports = {
    // ...
    processDeposit,
    processManualDeposit,  // NEW
    // ...
};
```

---

### 2. render.com/routes/customer-360.js

**Thay đổi:**
1. Thêm import `processDeposit`
2. Đổi default `auto_deposit = true`
3. Thay logic wallet riêng bằng `processDeposit()`

**Import mới:**
```javascript
const { processDeposit } = require('../services/wallet-event-processor');
```

**Logic mới (POST /balance-history/link-customer):**
```javascript
if (auto_deposit && tx.transfer_amount > 0) {
    await processDeposit(
        db,
        phone,
        tx.transfer_amount,
        transaction_id,
        `Nạp từ CK ${tx.code || tx.reference_code} (manual link)`,
        customerId
    );
    await db.query('UPDATE balance_history SET wallet_processed = TRUE WHERE id = $1', [transaction_id]);
}
```

---

### 3. render.com/routes/v2/tickets.js

**Thay đổi:**
1. Thêm import `processDeposit`, `issueVirtualCredit`
2. Thay logic compensation riêng bằng các hàm chuẩn

**Import mới:**
```javascript
const { processDeposit, issueVirtualCredit } = require('../../services/wallet-event-processor');
```

**Logic mới (POST /:id/resolve):**
```javascript
if (compensation_amount && compensation_amount > 0) {
    if (compensation_type === 'virtual_credit') {
        await issueVirtualCredit(
            db,
            ticket.phone,
            compensation_amount,
            ticket.ticket_code,
            note || `Bồi thường ticket ${ticket.ticket_code}`,
            15 // expires in 15 days
        );
    } else if (compensation_type === 'deposit') {
        await processDeposit(
            db,
            ticket.phone,
            compensation_amount,
            ticket.id,
            note || `Hoàn tiền ticket ${ticket.ticket_code}`,
            ticket.customer_id
        );
    }
}
```

---

### 4. render.com/routes/v2/wallets.js

**Thay đổi:**
1. Thêm import `processManualDeposit`, `issueVirtualCredit`
2. Thay logic deposit endpoint bằng `processManualDeposit()`
3. Thay logic credit endpoint bằng `issueVirtualCredit()`

**Import mới:**
```javascript
const { processManualDeposit, issueVirtualCredit } = require('../../services/wallet-event-processor');
```

**Logic mới (POST /:customerId/deposit):**
```javascript
const result = await processManualDeposit(
    db,
    phone,
    amount,
    source || 'MANUAL_ADJUSTMENT',
    reference_id || created_by || 'admin',
    note || 'Nạp tiền thủ công',
    customerIdNum
);
```

**Logic mới (POST /:customerId/credit):**
```javascript
const result = await issueVirtualCredit(
    db,
    phone,
    amount,
    source_id || created_by || 'admin',
    note || `Cấp công nợ ảo (${source_type || 'ADMIN'})`,
    expiry_days
);
```

---

### 5. customer-hub/js/api-service.js

**Thay đổi:**
Migrate sang API v2 cho link bank transaction

**Trước:**
```javascript
linkBankTransaction: async (transaction_id, phone, auto_deposit) => {
    return fetchJson(`${ApiService.RENDER_API_URL}/balance-history/link-customer`, {
        method: 'POST',
        body: JSON.stringify({ transaction_id, phone, auto_deposit })
    });
},
```

**Sau:**
```javascript
linkBankTransaction: async (transaction_id, phone, auto_deposit = true) => {
    return fetchJson(`${ApiService.RENDER_API_URL}/v2/balance-history/${transaction_id}/link`, {
        method: 'POST',
        body: JSON.stringify({ phone, auto_deposit })
    });
},
```

---

## KIẾN TRÚC MỚI

```
┌─────────────────────────────────────────────────────────────┐
│                      WALLET OPERATIONS                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Balance-     │  │ Issue-       │  │ Admin        │       │
│  │ History      │  │ Tracking     │  │ Operations   │       │
│  │ (Bank CK)    │  │ (Tickets)    │  │ (Kế toán)    │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           wallet-event-processor.js                  │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │    │
│  │  │processDeposit│ │issueVirtual │ │processManual│    │    │
│  │  │             │ │Credit       │ │Deposit      │    │    │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘    │    │
│  │         │               │               │           │    │
│  │         └───────────────┼───────────────┘           │    │
│  │                         ▼                           │    │
│  │              ┌─────────────────────┐                │    │
│  │              │  processWalletEvent │                │    │
│  │              │  (Single Source of  │                │    │
│  │              │   Truth)            │                │    │
│  │              └──────────┬──────────┘                │    │
│  └─────────────────────────┼───────────────────────────┘    │
│                            │                                │
│         ┌──────────────────┼──────────────────┐             │
│         ▼                  ▼                  ▼             │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐         │
│  │customer_   │    │wallet_     │    │SSE         │         │
│  │wallets     │    │transactions│    │Notification│         │
│  └────────────┘    └────────────┘    └────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## CÁC HÀM TRONG wallet-event-processor.js

| Hàm | Mục đích | Sử dụng |
|-----|----------|---------|
| `processDeposit` | Nạp tiền từ bank transfer (có idempotency check với balance_history) | Auto-match, Manual link |
| `processManualDeposit` | Nạp tiền thủ công (không cần balance_history) | Admin deposit |
| `processWithdrawal` | Rút tiền | Order payment |
| `issueVirtualCredit` | Cấp virtual credit | Ticket compensation, Admin |
| `useVirtualCredit` | Sử dụng virtual credit | Order payment |
| `processAdjustment` | Điều chỉnh (+/-) | Admin correction |

---

## WALLET EVENT TYPES

| Type | Mô tả |
|------|-------|
| DEPOSIT | Nạp tiền vào real balance |
| WITHDRAW | Rút tiền |
| VIRTUAL_CREDIT_ISSUED | Cấp virtual credit |
| VIRTUAL_DEBIT | Sử dụng virtual credit |
| VIRTUAL_EXPIRE | Virtual credit hết hạn |
| ADJUSTMENT | Điều chỉnh thủ công |

---

## WALLET SOURCES

| Source | Mô tả |
|--------|-------|
| BANK_TRANSFER | Chuyển khoản ngân hàng |
| MANUAL_ADJUSTMENT | Admin điều chỉnh thủ công |
| TICKET_REFUND | Hoàn tiền từ ticket |
| ORDER_PAYMENT | Thanh toán đơn hàng |
| VIRTUAL_CREDIT_ISSUE | Cấp virtual credit |
| VIRTUAL_CREDIT_EXPIRE | Virtual credit hết hạn |

---

## TEST CASES

### 1. Balance-History Manual Link
```
Input: POST /v2/balance-history/:id/link với phone, auto_deposit=true
Expected:
- balance_history.linked_customer_phone được set
- balance_history.wallet_processed = TRUE
- customer_wallets.balance tăng
- wallet_transactions có record với note "(manual link)"
- SSE notification được gửi
```

### 2. Ticket Compensation (Virtual Credit)
```
Input: POST /v2/tickets/:id/resolve với compensation_type='virtual_credit'
Expected:
- virtual_credits có record mới
- customer_wallets.virtual_balance tăng
- wallet_transactions có record
- SSE notification được gửi
```

### 3. Admin Deposit
```
Input: POST /v2/wallets/:customerId/deposit với amount, note
Expected:
- customer_wallets.balance tăng
- wallet_transactions có record với source='MANUAL_ADJUSTMENT'
- SSE notification được gửi
```

---

## LƯU Ý CHO AI KHÁC

1. **LUÔN dùng các hàm trong wallet-event-processor.js** cho mọi wallet operations
2. **KHÔNG tự implement logic wallet** trong routes
3. **Kiểm tra SSE notification** sau mỗi wallet update
4. **processDeposit có idempotency check** - chỉ dùng cho bank transfers có balance_history
5. **processManualDeposit** - dùng cho admin/manual deposits không có balance_history
