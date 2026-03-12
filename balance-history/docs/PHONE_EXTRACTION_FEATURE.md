# Phone Extraction & Auto Customer Matching Feature

## 📋 Tổng quan

Tính năng tự động trích xuất số điện thoại từ nội dung chuyển khoản và tìm kiếm khách hàng tương ứng.

## 🔄 Flow hoạt động

```
Webhook nhận → Parse content → Tìm SĐT → Search customer DB
                                              ↓
                    ┌─────────────────────────┴─────────────────────────┐
                    ↓                         ↓                         ↓
              0 kết quả                  1 kết quả              Nhiều kết quả
                Skip                   Auto save              Pending review
```

## 📝 Chi tiết Flow

### Bước 1: Parse Content
Khi webhook nhận được giao dịch mới (transfer_type = 'in'):

```javascript
// Nếu có "GD" hoặc "-GD" → lấy phần TRƯỚC
"0901234567 GD: 123456" → "0901234567"
"NGUYEN VAN A-GD 123" → "NGUYEN VAN A"

// Không có GD → lấy toàn bộ
"0901234567 thanh toan" → "0901234567 thanh toan"
```

### Bước 2: Extract Phone (5+ chữ số - lấy số cuối cùng)
```javascript
"0901234567 thanh toan" → "0901234567"
"Nguyen Van A 0912345678" → "0912345678"
"ABC 12345 DEF" → "12345"
"CT DEN:0123456789 ND:0901234567" → "0901234567" (số cuối)
```

**Lưu ý**: Nếu có nhiều chuỗi số, sẽ lấy **số cuối cùng** (rightmost).

### Bước 3: Lưu vào balance_customer_info
**Không cần search customer**, lưu trực tiếp:
```javascript
// Generate unique code
const uniqueCode = `PHONE${extractedPhone}`;

// Insert/Update balance_customer_info
INSERT INTO balance_customer_info (unique_code, customer_phone, customer_name)
VALUES ('PHONE456788', '456788', NULL)
ON CONFLICT (unique_code) DO UPDATE SET
    customer_phone = EXCLUDED.customer_phone,
    updated_at = CURRENT_TIMESTAMP;

// Mark transaction as processed
UPDATE balance_history SET debt_added = TRUE WHERE id = transaction_id;
```

**Ví dụ:**
- Content: `"456788 tam GD 5363IBT1fW6EKWXV"`
- Extracted phone: `456788`
- Unique code: `PHONE456788`
- Customer phone: `456788`
- Customer name: `NULL` (có thể update sau)

**Lưu ý quan trọng:**
- ❌ Không search trong `customers` table
- ❌ Không cập nhật debt vào `customers`
- ✅ Chỉ lưu vào `balance_customer_info` để tracking
- ✅ Mark transaction `debt_added = TRUE`

### Bước 4: Kết quả
Mọi transaction có phone (>4 chữ số) đều được lưu vào `balance_customer_info`:
```json
{
  "success": true,
  "method": "phone_extraction_auto",
  "transactionId": 123,
  "extractedPhone": "456788",
  "uniqueCode": "PHONE456788",
  "amount": 2000
}
```

## 🔌 API Endpoints

### 1. GET /api/sepay/pending-matches
Lấy danh sách pending matches

**Query params:**
- `status`: pending | resolved | skipped (default: pending)
- `limit`: số lượng tối đa (default: 50, max: 200)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "transaction_id": 123,
      "extracted_phone": "0901234567",
      "matched_customers": [
        {
          "id": 1,
          "phone": "0901234567",
          "name": "Nguyen Van A",
          "email": "a@example.com",
          "status": "Bình thường",
          "debt": 500000
        },
        {
          "id": 2,
          "phone": "0901234567",
          "name": "Nguyen Van B",
          "email": "b@example.com",
          "status": "VIP",
          "debt": 1000000
        }
      ],
      "transaction_content": "CT DEN:0123456789 ND:0901234567 thanh toan",
      "transfer_amount": 500000,
      "transaction_date": "2025-01-15T10:30:00Z",
      "status": "pending",
      "created_at": "2025-01-15T10:30:05Z"
    }
  ],
  "count": 1
}
```

### 2. POST /api/sepay/pending-matches/:id/resolve
Resolve pending match bằng cách chọn customer

**Body:**
```json
{
  "customer_id": 1,
  "resolved_by": "admin_username"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Match resolved successfully",
  "data": {
    "match_id": 1,
    "transaction_id": 123,
    "customer": {
      "id": 1,
      "phone": "0901234567",
      "name": "Nguyen Van A",
      "new_debt": 1500000
    },
    "amount_added": 500000
  }
}
```

**Hành động khi resolve:**
1. Tạo unique code và save vào `balance_customer_info`
2. Update `customers.debt` += amount
3. Mark transaction `debt_added = TRUE`
4. Update pending match: `status = 'resolved'`

### 3. POST /api/sepay/pending-matches/:id/skip
Bỏ qua/skip pending match

**Body:**
```json
{
  "reason": "Wrong transaction",
  "resolved_by": "admin_username"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Match skipped successfully",
  "data": {
    "id": 1,
    "transaction_id": 123,
    "extracted_phone": "0901234567"
  }
}
```

## 🧪 Test Cases

### Test Case 1: Content có "GD"
**Input:**
```json
{
  "content": "0901234567 GD: 123456",
  "transfer_amount": 500000
}
```

**Expected:**
- Extract phone: `0901234567`
- Parse text: `0901234567` (phần trước "GD")

### Test Case 2: Content có "-GD"
**Input:**
```json
{
  "content": "NGUYEN VAN A 0912345678-GD 123",
  "transfer_amount": 300000
}
```

**Expected:**
- Extract phone: `0912345678`
- Parse text: `NGUYEN VAN A 0912345678`

### Test Case 3: Content không có GD
**Input:**
```json
{
  "content": "CT DEN:0123456789 ND:0901234567 thanh toan",
  "transfer_amount": 1000000
}
```

**Expected:**
- Extract phone: `0901234567`
- Parse toàn bộ content

### Test Case 4: Multiple numbers - lấy số cuối cùng >= 5 chữ số
**Input:**
```json
{
  "content": "ABC 123 DEF 0901234567 XYZ 98765",
  "transfer_amount": 200000
}
```

**Expected:**
- Extract phone: `98765` (số cuối cùng có >= 5 chữ số)

### Test Case 5: Single match - Auto save
**Setup:**
- Database có 1 customer: phone = "0901234567"

**Input:**
```json
{
  "content": "0901234567 thanh toan",
  "transfer_amount": 500000
}
```

**Expected:**
- Auto save vào `balance_customer_info`
- Update `customers.debt` += 500000
- Mark `debt_added = TRUE`
- Response: `{ success: true, method: 'phone_extraction_auto' }`

### Test Case 6: Multiple matches - Pending review
**Setup:**
- Database có 2 customers:
  - Customer 1: phone = "0901234567"
  - Customer 2: phone = "0901234567xxx"

**Input:**
```json
{
  "content": "0901234567 thanh toan",
  "transfer_amount": 500000
}
```

**Expected:**
- Save vào `pending_customer_matches`
- Transaction chưa được mark `debt_added = TRUE`
- Response: `{ success: false, reason: 'Multiple customers found - pending admin review', matchCount: 2 }`

### Test Case 7: QR code takes priority
**Input:**
```json
{
  "content": "N2ABCD1234EFGH5678 0901234567 GD: 123",
  "transfer_amount": 500000
}
```

**Expected:**
- Ưu tiên extract QR code: `N2ABCD1234EFGH5678`
- Lookup trong `balance_customer_info`
- Nếu có phone linked → dùng QR method
- Nếu không → fallback sang phone extraction

## 🗃️ Database Schema

### Table: pending_customer_matches
```sql
CREATE TABLE pending_customer_matches (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES balance_history(id),
    extracted_phone VARCHAR(50),
    matched_customers JSONB,  -- Array of customer objects
    selected_customer_id INTEGER REFERENCES customers(id),
    status VARCHAR(20) CHECK (status IN ('pending', 'resolved', 'skipped')),
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100)
);
```

## 📊 Priority Logic

1. **QR Code** (highest priority)
   - Nếu content có `N2[A-Z0-9]{16}` → lookup `balance_customer_info`
   - Nếu có phone linked → dùng QR method

2. **Phone Extraction** (fallback)
   - Nếu không có QR hoặc QR không linked
   - Parse content → extract phone → search customers

## 🔍 Monitoring & Logs

### Log patterns
```
[EXTRACT-PHONE] Found GD, parsing before GD: {text}
[EXTRACT-PHONE] Found phone: {phone}
[SEARCH-CUSTOMER] Searching for phone: {phone}
[SEARCH-CUSTOMER] Found {count} customers
[DEBT-UPDATE] ✅ Success (phone extraction - single match)
[DEBT-UPDATE] ⚠️  Saved to pending matches (multiple customers found)
```

### Success metrics
- **Auto match rate**: Số lượng single match / tổng số extractions
- **Pending rate**: Số lượng pending / tổng số extractions
- **Resolution time**: Thời gian từ pending → resolved

## 🚀 Deployment

### 1. Run migration
```bash
psql $DATABASE_URL -f render.com/migrations/create_pending_customer_matches.sql
```

### 2. Restart server
Backend sẽ tự động sử dụng logic mới khi nhận webhook.

### 3. Monitor logs
```bash
# Watch for phone extraction logs
grep "EXTRACT-PHONE\|SEARCH-CUSTOMER\|PENDING-MATCHES" logs.txt
```

## 🛠️ Troubleshooting

### Issue: Phone không được extract
**Check:**
1. Content có >= 5 chữ số liền kề không?
2. Regex `/\d{5,}/g` có match không?

**Debug:**
```javascript
const content = "...";
console.log(extractPhoneFromContent(content));
// Kiểm tra: hệ thống sẽ lấy số CUỐI CÙNG có >= 5 chữ số
```

### Issue: Multiple matches luôn xảy ra
**Possible causes:**
1. Database có duplicate phone numbers
2. Phone search quá rộng (LIKE '%xxx')

**Solution:**
- Review customer data
- Tăng độ chính xác search (exact match trước)

### Issue: Pending matches không được resolve
**Check:**
1. API endpoint có hoạt động không?
2. `customer_id` có trong `matched_customers` không?
3. Database transaction có lỗi không?

## 📈 Future Enhancements

1. **AI-based matching**: Sử dụng ML để suggest customer có khả năng cao nhất
2. **Auto-resolve rules**: Admin config rules để auto-resolve certain patterns
3. **Bulk resolve**: Resolve nhiều pending matches cùng lúc
4. **Phone normalization**: Chuẩn hóa phone format (84xxx, 0xxx, xxx)
5. **Confidence score**: Thêm score cho mỗi match để prioritize
