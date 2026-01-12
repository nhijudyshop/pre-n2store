# Hướng dẫn Mapping SĐT → Công nợ

## Tổng quan

Hệ thống tự động tính công nợ dựa trên SĐT khách hàng. Mỗi khi có giao dịch chuyển khoản qua mã QR, công nợ sẽ được cộng dồn vào SĐT tương ứng.

---

## Database Schema

### 1. Bảng `customers` - Lưu công nợ

```sql
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(50) UNIQUE NOT NULL,    -- SĐT (key chính)
    name VARCHAR(255),
    debt DECIMAL(15,2) DEFAULT 0,         -- Tổng công nợ
    debt_adjusted_at TIMESTAMP,           -- Thời điểm admin điều chỉnh
    status VARCHAR(50) DEFAULT 'Bình thường',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Bảng `balance_customer_info` - Mapping QR → SĐT

```sql
CREATE TABLE balance_customer_info (
    id SERIAL PRIMARY KEY,
    unique_code VARCHAR(50) UNIQUE NOT NULL,  -- Mã QR (N2...)
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),               -- SĐT khách hàng
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Bảng `balance_history` - Lịch sử giao dịch

```sql
-- Cột quan trọng
content TEXT,                    -- Nội dung chứa mã QR (N2...)
transfer_amount BIGINT,          -- Số tiền
debt_added BOOLEAN DEFAULT FALSE -- Đã cộng vào công nợ chưa
```

---

## Query công nợ

### Lấy công nợ 1 khách hàng

```sql
SELECT phone, name, debt
FROM customers
WHERE phone = '0901234567';
```

### Lấy công nợ nhiều khách hàng

```sql
SELECT phone, name, debt
FROM customers
WHERE phone IN ('0901234567', '0912345678', '0923456789');
```

### Lấy khách có công nợ > 0

```sql
SELECT phone, name, debt
FROM customers
WHERE debt > 0
ORDER BY debt DESC;
```

### Lấy lịch sử giao dịch của 1 SĐT

```sql
SELECT
    bh.transaction_date,
    bh.transfer_amount,
    bh.content,
    bci.unique_code
FROM balance_history bh
JOIN balance_customer_info bci ON bh.content ILIKE '%' || bci.unique_code || '%'
WHERE bci.customer_phone = '0901234567'
ORDER BY bh.transaction_date DESC;
```

---

## API Endpoints

### Lấy công nợ 1 khách

```bash
GET /api/sepay/debt-summary?phone=0901234567
```

**Response:**
```json
{
    "success": true,
    "data": {
        "phone": "0901234567",
        "total_debt": 1500000,
        "transaction_count": 3,
        "source": "balance_history"
    }
}
```

### Lấy công nợ nhiều khách (batch)

```bash
POST /api/sepay/debt-summary-batch
Content-Type: application/json

{
    "phones": ["0901234567", "0912345678"]
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "901234567": { "total_debt": 1500000 },
        "912345678": { "total_debt": 800000 }
    }
}
```

---

## Flow tự động cập nhật công nợ

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐
│ Khách quét  │───▶│ Sepay gửi   │───▶│ Backend extract     │
│ QR chuyển   │    │ webhook      │    │ mã N2... từ content │
│ tiền        │    │              │    │                     │
└─────────────┘    └──────────────┘    └──────────┬──────────┘
                                                   │
                   ┌──────────────┐    ┌──────────▼──────────┐
                   │ Cộng debt    │◀───│ Lookup SĐT từ       │
                   │ vào bảng     │    │ balance_customer_   │
                   │ customers    │    │ info                │
                   └──────────────┘    └─────────────────────┘
```

### Code xử lý (Backend)

```javascript
// 1. Extract mã QR từ nội dung giao dịch
const qrMatch = content.toUpperCase().match(/N2[A-Z0-9]{16}/);
const qrCode = qrMatch[0];  // "N2ABCD1234EFGH5678"

// 2. Lookup SĐT từ mã QR
const result = await db.query(
    `SELECT customer_phone FROM balance_customer_info
     WHERE UPPER(unique_code) = $1`,
    [qrCode]
);
const phone = result.rows[0].customer_phone;

// 3. Cộng công nợ (UPSERT)
await db.query(
    `INSERT INTO customers (phone, debt) VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET
         debt = COALESCE(customers.debt, 0) + $2`,
    [phone, amount]
);

// 4. Đánh dấu đã xử lý
await db.query(
    `UPDATE balance_history SET debt_added = TRUE WHERE id = $1`,
    [transactionId]
);
```

---

## Lưu ý quan trọng

| Vấn đề | Giải pháp |
|--------|-----------|
| Tránh cộng trùng | Cột `debt_added` đánh dấu giao dịch đã xử lý |
| Admin điều chỉnh công nợ | Cột `debt_adjusted_at` lưu thời điểm điều chỉnh |
| Nhiều QR cùng 1 SĐT | Tất cả giao dịch đều cộng vào cùng 1 `customers.debt` |
| SĐT chuẩn hóa | Bỏ +84, đổi 84 → 0, giữ 10 số |

---

## Ví dụ thực tế

### Scenario: Khách A có 2 mã QR

```
QR1: N2AAAA1111BBBB2222 → SĐT: 0901234567
QR2: N2CCCC3333DDDD4444 → SĐT: 0901234567

Giao dịch 1: Quét QR1, chuyển 500,000đ → debt = 500,000
Giao dịch 2: Quét QR2, chuyển 300,000đ → debt = 800,000
Giao dịch 3: Quét QR1, chuyển 200,000đ → debt = 1,000,000

Query:
SELECT debt FROM customers WHERE phone = '0901234567';
-- Kết quả: 1,000,000
```

---

*Cập nhật: 2025-01*
