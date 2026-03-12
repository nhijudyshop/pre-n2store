# Balance History - Database Structure & Data Flow

## 1. Database Tables

### 1.1 `balance_history` (Main Transaction Table)
Lưu tất cả giao dịch ngân hàng từ Sepay webhook.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | ID nội bộ |
| `sepay_id` | INTEGER UNIQUE | ID từ Sepay |
| `reference_code` | VARCHAR(100) | Mã tham chiếu (VD: 3777) |
| `transaction_date` | TIMESTAMP | Ngày giờ giao dịch |
| `transfer_amount` | BIGINT | Số tiền |
| `transfer_type` | VARCHAR(10) | 'in' hoặc 'out' |
| `content` | TEXT | Nội dung chuyển khoản |
| `gateway` | VARCHAR(100) | Ngân hàng (ACB, VCB...) |
| `account_number` | VARCHAR(50) | Số tài khoản |
| `accumulated` | BIGINT | Số dư sau giao dịch |
| **`linked_customer_phone`** | VARCHAR(50) | SĐT khách hàng được gán |
| **`customer_name`** | VARCHAR(255) | Tên khách hàng |
| **`match_method`** | VARCHAR(50) | Phương thức gán (xem bên dưới) |
| **`verification_status`** | VARCHAR(50) | Trạng thái xác minh |
| **`is_hidden`** | BOOLEAN | True = đã xác nhận trong Live Mode |
| **`wallet_processed`** | BOOLEAN | True = đã cộng tiền vào ví |
| `qr_code` | VARCHAR(50) | Mã QR nếu có |
| `extraction_note` | VARCHAR(255) | Ghi chú trích xuất (MOMO, VCB...) |
| `customer_id` | INTEGER FK | Liên kết đến bảng customers |
| `verified_by` | VARCHAR(100) | Người duyệt |
| `verified_at` | TIMESTAMP | Thời gian duyệt |
| `has_pending_match` | BOOLEAN | True = có nhiều KH trùng khớp |
| `pending_match_id` | INTEGER | ID của pending match |
| `pending_match_options` | JSONB | Danh sách KH có thể chọn |

#### Giá trị `match_method`:
- `qr_code` - Gán tự động qua mã QR N2...
- `exact_phone` - Gán tự động qua SĐT 10 số trong nội dung
- `single_match` - Gán tự động khi TPOS trả về 1 KH duy nhất
- `pending_match` - Chờ chọn từ nhiều KH (đã resolve)
- **`manual_entry`** - NHẬP TAY bởi nhân viên
- `manual_link` - Kế toán gán thủ công

#### Giá trị `verification_status`:
- `PENDING` - Mặc định, chưa xử lý
- `PENDING_VERIFICATION` - Chờ kế toán duyệt
- `AUTO_APPROVED` - Tự động duyệt (qr_code, exact_phone)
- `APPROVED` - Kế toán đã duyệt
- `REJECTED` - Kế toán từ chối

---

### 1.2 `transfer_stats` (Thống Kê Chuyển Khoản - Live Mode)
Bảng phụ chứa danh sách giao dịch được theo dõi riêng.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | ID nội bộ |
| **`transaction_id`** | INTEGER FK | Liên kết đến `balance_history.id` |
| `customer_name` | VARCHAR(255) | Tên KH (copy từ balance_history) |
| `customer_phone` | VARCHAR(50) | SĐT (copy từ balance_history) |
| `amount` | BIGINT | Số tiền |
| `content` | TEXT | Nội dung |
| `notes` | TEXT | Ghi chú riêng |
| `transaction_date` | TIMESTAMP | Ngày giao dịch |
| `is_checked` | BOOLEAN | Đã kiểm tra (hiển thị/ẩn) |
| `is_verified` | BOOLEAN | Đã xác minh |

**QUAN TRỌNG**: `transfer_stats` là bản sao dữ liệu, KHÔNG phải liên kết trực tiếp. Khi update `transfer_stats`, dữ liệu `balance_history` KHÔNG tự động cập nhật và ngược lại.

---

### 1.3 `customer_wallets` (Ví Khách Hàng)

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | ID |
| `phone` | VARCHAR(20) UNIQUE | SĐT khách hàng |
| `balance` | DECIMAL(15,2) | Số dư ví |
| `virtual_balance` | DECIMAL(15,2) | Số dư ảo (credit) |
| `total_deposited` | DECIMAL(15,2) | Tổng đã nạp |
| `total_withdrawn` | DECIMAL(15,2) | Tổng đã rút |

---

### 1.4 `wallet_transactions` (Lịch Sử Ví)

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | ID |
| `phone` | VARCHAR(20) | SĐT |
| `type` | VARCHAR(30) | DEPOSIT, WITHDRAW, ADJUSTMENT... |
| `amount` | DECIMAL(15,2) | Số tiền |
| **`source`** | VARCHAR(50) | Nguồn giao dịch |
| `reference_type` | VARCHAR(30) | Loại tham chiếu (bank_tx, manual...) |
| `reference_id` | VARCHAR(100) | ID tham chiếu |

#### Giá trị `source`:
- `BANK_TRANSFER` - Từ giao dịch ngân hàng
- `MANUAL_ADJUSTMENT` - Kế toán điều chỉnh thủ công

---

### 1.5 `pending_customer_matches`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | ID |
| `transaction_id` | INTEGER FK | Liên kết balance_history |
| `extracted_phone` | VARCHAR(50) | SĐT trích xuất được |
| `matched_customers` | JSONB | Danh sách KH trùng khớp |
| `status` | VARCHAR(20) | pending, resolved, skipped |
| `selected_customer_id` | INTEGER | ID KH đã chọn |

---

## 2. Data Flow Diagram

```
                                    SEPAY WEBHOOK
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │   balance_history   │ (SOURCE OF TRUTH)
                              │  - linked_phone     │
                              │  - match_method     │
                              │  - verification     │
                              │  - wallet_processed │
                              └──────────┬──────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
    ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
    │    Live Mode    │       │ Balance History │       │    Kế Toán      │
    │   (live-mode.js)│       │    (main.js)    │       │ (accountant.js) │
    │                 │       │                 │       │                 │
    │ Classifies by:  │       │ Displays:       │       │ Filters by:     │
    │ - is_hidden     │       │ - match_method  │       │ - verification  │
    │ - customer_phone│       │ - source badge  │       │   _status       │
    │                 │       │                 │       │                 │
    └────────┬────────┘       └────────┬────────┘       └────────┬────────┘
             │                         │                          │
             ▼                         │                          │
    ┌─────────────────┐               │                          │
    │  transfer_stats │ ◄─────────────┘                          │
    │   (COPY DATA)   │  Manual Add via                          │
    │                 │  "Chuyển vào TK"                          │
    │ - customer_name │                                           │
    │ - customer_phone│                                           │
    │ - notes (riêng) │                                           │
    │ - is_checked    │                                           │
    │ - is_verified   │                                           │
    └─────────────────┘                                           │
                                                                  │
                                                                  ▼
                                                       ┌─────────────────┐
                                                       │ customer_wallets│
                                                       │   (Balance)     │
                                                       └────────┬────────┘
                                                                │
                                                                ▼
                                                       ┌─────────────────┐
                                                       │wallet_transactions│
                                                       │   (History)     │
                                                       └─────────────────┘
```

---

## 3. Vấn Đề Hiện Tại: Giao Dịch 3777

### Phân Tích:
- **Balance History tab**: Hiển thị "Nhập tay" ✅ (dựa trên `match_method = 'manual_entry'`)
- **Live Mode tab**: Hiển thị trong "TỰ ĐỘNG GÁN" ❌

### Nguyên Nhân Root Cause:

**Live Mode (`live-mode.js`) phân loại giao dịch theo logic SAI:**

```javascript
// live-mode.js lines 137-155
function classifyTransaction(tx) {
    // ĐÃ XÁC NHẬN: is_hidden = true
    if (tx.is_hidden === true) {
        return 'confirmed';
    }

    // NHẬP TAY: Chưa có khách hàng
    if (!tx.customer_phone || tx.has_pending_match === true) {
        return 'manual';
    }

    // TỰ ĐỘNG GÁN: Có KH nhưng chưa xác nhận
    return 'autoMatched';  // ← BUG: Không check match_method!
}
```

**Logic hiện tại:**
1. `is_hidden = true` → "ĐÃ XÁC NHẬN" ✅
2. Không có `customer_phone` → "NHẬP TAY" ✅
3. Có `customer_phone` + `is_hidden = false` → **"TỰ ĐỘNG GÁN"** ❌

**Vấn đề:** Live Mode KHÔNG kiểm tra `match_method`. Bất kỳ giao dịch nào có `customer_phone` đều bị đưa vào "TỰ ĐỘNG GÁN", bất kể đó là nhập tay hay tự động.

**Balance History (`main.js`) thì dùng `match_method` để hiển thị badge đúng.**

---

## 4. Liên Kết Dữ Liệu Giữa Các Tab

| Tab | Source Data | Update Target | Độc Lập? |
|-----|-------------|---------------|----------|
| **Live Mode** | `balance_history` | `balance_history` (is_hidden, customer_phone) | ❌ Shares data |
| **Balance History** | `balance_history` | `balance_history` | ❌ Shares data |
| **Transfer Stats** | `transfer_stats` | `transfer_stats` ONLY | ⚠️ Partially isolated |
| **Kế Toán** | `balance_history` + `wallet_*` | Both | ❌ Shares data |

### Vấn đề với Transfer Stats:
- `transfer_stats` là **BẢN SAO** của dữ liệu từ `balance_history`
- Khi update `transfer_stats.customer_name/phone`, **KHÔNG** update `balance_history`
- Ngược lại, update `balance_history` **KHÔNG** auto-sync đến `transfer_stats`
- Chỉ có API `/api/sepay/transfer-stats/sync` mới đồng bộ từ `balance_history` → `transfer_stats`

---

## 5. API Endpoints Liên Quan

### Balance History APIs (`sepay-webhook.js`):
- `GET /api/sepay/history` - Lấy danh sách giao dịch
- `PUT /api/sepay/transaction/{id}/phone` - Gán SĐT cho giao dịch
- `PUT /api/sepay/transaction/{id}/hidden` - Toggle is_hidden

### Transfer Stats APIs:
- `GET /api/sepay/transfer-stats` - Lấy danh sách
- `PUT /api/sepay/transfer-stats/{id}` - Update name/phone/notes (CHỈ bảng transfer_stats)
- `POST /api/sepay/transfer-stats/sync` - Đồng bộ từ balance_history

### Kế Toán APIs (`v2/balance-history.js`):
- `GET /api/v2/balance-history/verification-queue` - Danh sách chờ duyệt
- `POST /api/v2/balance-history/{id}/approve` - Duyệt + cộng ví
- `POST /api/v2/balance-history/{id}/reject` - Từ chối

---

## 6. Đề Xuất Sửa Lỗi

### Fix 1: Sửa `classifyTransaction` trong Live Mode

```javascript
function classifyTransaction(tx) {
    // ĐÃ XÁC NHẬN: is_hidden = true
    if (tx.is_hidden === true) {
        return 'confirmed';
    }

    // NHẬP TAY:
    // 1. Chưa có khách hàng
    // 2. HOẶC có pending match
    // 3. HOẶC match_method là manual_entry (nhập tay nhưng chưa hidden)
    if (
        !tx.customer_phone ||
        tx.has_pending_match === true ||
        (tx.pending_match_skipped && tx.pending_match_options?.length > 0) ||
        tx.match_method === 'manual_entry'  // ← THÊM CHECK NÀY
    ) {
        return 'manual';
    }

    // TỰ ĐỘNG GÁN: Có KH (tự động match) nhưng chưa xác nhận
    return 'autoMatched';
}
```

### Fix 2: Sync Transfer Stats với Balance History

Khi update `transfer_stats`, cũng update `balance_history`:

```javascript
// transfer-stats.js - saveTSEdit()
// Sau khi update transfer_stats, gọi thêm API update balance_history
if (item.transaction_id && customer_phone?.length === 10) {
    await fetch(`${API_BASE_URL}/api/sepay/transaction/${item.transaction_id}/phone`, {
        method: 'PUT',
        body: JSON.stringify({
            phone: customer_phone,
            name: customer_name,
            match_method: 'manual_entry'
        })
    });
}
```

---

## 7. Tổng Kết

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|-----------|
| Cùng giao dịch hiển thị khác nhau giữa tabs | Live Mode không check `match_method` | Thêm check `match_method === 'manual_entry'` |
| Update Transfer Stats không đồng bộ | `transfer_stats` là bảng riêng biệt | Gọi thêm API update `balance_history` |
| Nhập tay bị hiển thị "Tự động gán" | Logic phân loại thiếu điều kiện | Sửa `classifyTransaction()` |
