# Partial Phone + TPOS Search Feature

## 🎯 Vấn đề

Trước đây, hệ thống chỉ extract phone **đúng 10 chữ số** từ nội dung chuyển khoản. Nhưng thực tế:
- Nhiều người chỉ ghi **số cuối** (VD: "57828" thay vì "0797957828")
- Nhiều người ghi **sai format** (VD: "797957828" thiếu số 0)
- Phải **đoán** phone number từ một số không đầy đủ

## ✅ Giải pháp

### Logic mới (theo file `fetch_response_PhonePartner.txt`)

**3 bước ưu tiên:**

```
1. CHECK QR CODE N2 (18 ký tự)
   → Nếu có QR → Dùng QR, KHÔNG tìm phone

2. EXTRACT PARTIAL PHONE (>= 5 chữ số)
   → Tìm số trong content
   → Call TPOS API với số đó
   → Nhận về danh sách customers

3. SMART MATCHING
   → Group theo unique 10-digit phone
   → Nếu 1 phone → Auto lưu
   → Nếu nhiều phones → Tạo pending match
```

## 📊 Ví dụ thực tế

### Ví dụ 1: Partial Phone "57828"

**Content:** `CT DEN:123 ND:57828 thanh toan`

**1. Extract:**
```javascript
partialPhone = "57828"  // >= 5 digits
```

**2. Search TPOS:**
```bash
GET /odata/Partner/ODataService.GetViewV2?Phone=57828
```

**3. Response từ TPOS (5 customers):**
```json
{
  "@odata.count": 5,
  "value": [
    {"Id": 566098, "Name": "Kim Anh Le", "Phone": "0797957828"},
    {"Id": 444887, "Name": "Kim Anh Le", "Phone": "0797957828"},  // Cùng phone
    {"Id": 564471, "Name": "Utthem Phanthi", "Phone": "0969757828"},
    {"Id": 100752, "Name": "Phuongnghi Tran", "Phone": "0388557828"},
    {"Id": 89395, "Name": "Trang Tran", "Phone": "0913157828"}
  ]
}
```

**4. Group theo unique phone:**
```javascript
uniquePhones = [
  {
    phone: "0797957828",
    count: 2,  // 2 người cùng SĐT
    customers: [
      {id: 566098, name: "Kim Anh Le", ...},  // Lấy người đầu tiên
      {id: 444887, name: "Kim Anh Le", ...}
    ]
  },
  {
    phone: "0969757828",
    count: 1,
    customers: [{id: 564471, name: "Utthem Phanthi", ...}]
  },
  {
    phone: "0388557828",
    count: 1,
    customers: [{id: 100752, name: "Phuongnghi Tran", ...}]
  },
  {
    phone: "0913157828",
    count: 1,
    customers: [{id: 89395, name: "Trang Tran", ...}]
  }
]

// Tổng: 4 unique phones
```

**5. Kết quả: MULTIPLE PHONES → Tạo pending match**
```sql
INSERT INTO pending_customer_matches (
  transaction_id,
  extracted_phone,
  matched_customers,
  status
) VALUES (
  12345,
  '57828',
  '[
    {"phone": "0797957828", "count": 2, "customers": [...]},
    {"phone": "0969757828", "count": 1, "customers": [...]},
    {"phone": "0388557828", "count": 1, "customers": [...]},
    {"phone": "0913157828", "count": 1, "customers": [...]}
  ]',
  'pending'
);
```

**Admin sẽ chọn phone nào?** → Vào UI pending matches để chọn

---

### Ví dụ 2: Partial Phone "90950" (Chỉ 1 unique phone)

**Content:** `CT DEN:456 ND:90950 thanh toan`

**1. Extract:**
```javascript
partialPhone = "90950"  // >= 5 digits
```

**2. Search TPOS:**
```bash
GET /odata/Partner/ODataService.GetViewV2?Phone=90950
```

**3. Response (giả sử):**
```json
{
  "@odata.count": 2,
  "value": [
    {"Id": 100001, "Name": "Tài Lanh", "Phone": "0909505311"},
    {"Id": 100002, "Name": "Tài Lanh", "Phone": "0909505311"}  // Cùng phone
  ]
}
```

**4. Group:**
```javascript
uniquePhones = [
  {
    phone: "0909505311",
    count: 2,  // 2 người cùng SĐT
    customers: [
      {id: 100001, name: "Tài Lanh", ...},  // Lấy người đầu tiên
      {id: 100002, name: "Tài Lanh", ...}
    ]
  }
]

// CHỈ 1 unique phone!
```

**5. Kết quả: AUTO SAVE**
```sql
-- Save to balance_customer_info
INSERT INTO balance_customer_info (
  unique_code,
  customer_phone,
  customer_name,
  extraction_note,
  name_fetch_status
) VALUES (
  'PHONE0909505311',
  '0909505311',
  'Tài Lanh',
  'AUTO_MATCHED_FROM_PARTIAL:90950',
  'SUCCESS'
);

-- Mark transaction as processed
UPDATE balance_history
SET debt_added = TRUE
WHERE id = 12345;
```

**✅ Không cần admin chọn!** Tự động lưu vì chỉ có 1 phone duy nhất.

---

### Ví dụ 3: No matches in TPOS

**Content:** `CT DEN:789 ND:99999 thanh toan`

**1. Extract:**
```javascript
partialPhone = "99999"  // >= 5 digits
```

**2. Search TPOS:**
```bash
GET /odata/Partner/ODataService.GetViewV2?Phone=99999
```

**3. Response:**
```json
{
  "@odata.count": 0,
  "value": []
}
```

**4. Kết quả: NOT FOUND**
```sql
-- Save to balance_customer_info with note
INSERT INTO balance_customer_info (
  unique_code,
  customer_phone,
  customer_name,
  extraction_note,
  name_fetch_status
) VALUES (
  'PARTIAL99999',
  NULL,
  NULL,
  'PARTIAL_PHONE_NO_TPOS_MATCH:99999',
  'NOT_FOUND_IN_TPOS'
);
```

**Transaction KHÔNG được đánh dấu processed** → Admin có thể kiểm tra lại.

## 🔄 Flow Diagram

```
┌──────────────────────┐
│ Transaction content  │
│ "ND:57828 thanh toan"│
└──────┬───────────────┘
       │
       ▼
┌─────────────────────┐
│ Extract identifier  │
│ Priority:           │
│ 1. QR Code N2       │
│ 2. Partial phone    │
└──────┬──────────────┘
       │
       ├─ QR Found? ──────→ Use QR code ──→ Done ✓
       │
       └─ Partial Phone
          "57828"
          │
          ▼
    ┌─────────────────┐
    │ Search TPOS API │
    │ Phone=57828     │
    └────┬────────────┘
         │
         ├─ No results? ──→ Mark NOT_FOUND_IN_TPOS
         │
         ├─ 1 unique phone? ──→ AUTO SAVE ✓
         │                       (0797957828 + Name)
         │
         └─ Multiple phones? ──→ CREATE PENDING MATCH 📋
                                  (4 phones for admin to choose)
```

## 🎛️ Admin UI - Pending Matches

Khi có multiple phones, admin sẽ thấy:

```
┌────────────────────────────────────────────────────────┐
│ 📋 Pending Customer Matches                            │
├────────────────────────────────────────────────────────┤
│ Transaction #12345                                     │
│ Amount: 500,000đ                                       │
│ Content: "CT DEN:123 ND:57828 thanh toan"             │
│ Extracted: 57828                                       │
│                                                        │
│ Found 4 possible phones:                               │
│                                                        │
│ ○ 0797957828 - Kim Anh Le (2 customers)               │
│   📍 Cam Lộc, Cam Ranh, Khánh Hòa                     │
│   💰 Credit: 265,000đ | Status: Normal                │
│                                                        │
│ ○ 0969757828 - Utthem Phanthi                         │
│   📍 Giá Rai, Cà Mau                                   │
│   ⚠️  Status: Bom hàng                                │
│                                                        │
│ ○ 0388557828 - Phuongnghi Tran Tran                   │
│   📍 Mỹ Phước Tây, Cai Lậy, Tiền Giang                │
│   💰 Credit: 0đ | Status: Normal                      │
│                                                        │
│ ○ 0913157828 - Trang Tran                             │
│   💰 Credit: 0đ | Status: Normal                      │
│                                                        │
│ [Select] [Skip]                                        │
└────────────────────────────────────────────────────────┘
```

Admin chọn phone đúng → System lưu vào `balance_customer_info` → Transaction marked processed.

## 📝 Database Changes

### `balance_customer_info` - New extraction notes

**Extraction Note Values:**
- `AUTO_MATCHED_FROM_PARTIAL:57828` - Auto lưu từ partial phone (chỉ 1 match)
- `PARTIAL_PHONE_NO_TPOS_MATCH:99999` - Không tìm thấy trong TPOS
- `QR_CODE_FOUND` - Đã có QR, không cần tìm phone
- `PARTIAL_PHONE_EXTRACTED` - Extract được partial phone
- `MULTIPLE_NUMBERS_FOUND` - Có nhiều số trong content

**Name Fetch Status:**
- `SUCCESS` - Đã có tên (từ TPOS hoặc manual)
- `PENDING` - Chưa fetch tên
- `NOT_FOUND_IN_TPOS` - Phone không có trong TPOS
- `NO_PHONE_TO_FETCH` - Có QR hoặc không có phone

### `pending_customer_matches`

**Structure:**
```sql
id                  SERIAL PRIMARY KEY
transaction_id      INTEGER REFERENCES balance_history(id)
extracted_phone     VARCHAR(50)          -- "57828"
matched_customers   JSONB                -- Array of {phone, count, customers}
selected_customer_id INTEGER
status              VARCHAR(20)          -- pending/resolved/skipped
created_at          TIMESTAMP
resolved_at         TIMESTAMP
resolved_by         VARCHAR(100)
```

**Example JSONB:**
```json
[
  {
    "phone": "0797957828",
    "count": 2,
    "customers": [
      {
        "id": 566098,
        "name": "Kim Anh Le",
        "phone": "0797957828",
        "email": null,
        "address": "2020 Đai lộ Hùng Vương...",
        "network": "Mobifone",
        "status": "Normal",
        "credit": 265000,
        "debit": 0
      }
    ]
  },
  {
    "phone": "0969757828",
    "count": 1,
    "customers": [...]
  }
]
```

## 🚀 API Endpoints

### 1. Search TPOS by Partial Phone (Internal function)

```javascript
const result = await searchTPOSByPartialPhone("57828");

// Returns:
{
  success: true,
  uniquePhones: [
    {phone: "0797957828", count: 2, customers: [...]},
    {phone: "0969757828", count: 1, customers: [...]}
  ],
  totalResults: 5
}
```

### 2. Batch Update Phones

```bash
POST /api/sepay/batch-update-phones
{
  "limit": 100,
  "force": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Batch update completed: 50 success, 10 pending matches, 5 not found, 30 skipped, 5 failed",
  "data": {
    "total": 100,
    "processed": 100,
    "success": 50,           // Auto-matched (1 unique phone)
    "pending_matches": 10,   // Multiple phones → pending
    "not_found": 5,          // No TPOS matches
    "skipped": 30,           // Already processed / No phone
    "failed": 5,             // Errors
    "details": [...]
  }
}
```

## 📊 Statistics

Sau khi deploy, bạn có thể query để xem hiệu quả:

```sql
-- Xem phân bố extraction notes
SELECT
  extraction_note,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM balance_customer_info
GROUP BY extraction_note
ORDER BY count DESC;

-- Expected results:
-- AUTO_MATCHED_FROM_PARTIAL:*  (nhiều nhất - auto matched)
-- PARTIAL_PHONE_NO_TPOS_MATCH:*  (không tìm thấy)
-- QR_CODE_FOUND  (có QR code)

-- Xem pending matches chưa xử lý
SELECT COUNT(*)
FROM pending_customer_matches
WHERE status = 'pending';
```

## ✅ Benefits

| Before | After |
|--------|-------|
| ❌ Cần đúng 10 số | ✅ Chỉ cần >= 5 số |
| ❌ Phải đoán phone | ✅ TPOS API tìm giúp |
| ❌ Miss nhiều transactions | ✅ Catch được hầu hết |
| ❌ Không biết lý do fail | ✅ Chi tiết extraction_note |
| ❌ Không handle trùng phone | ✅ Group + lấy người đầu |
| ❌ Không handle nhiều phones | ✅ Tạo pending match |

## 🧪 Testing

### Test Case 1: Auto-match với 1 unique phone

```bash
curl -X POST http://localhost:3000/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": 999991,
    "gateway": "TEST",
    "content": "CT DEN:123 ND:90950 thanh toan",
    "transferType": "in",
    "transferAmount": 100000
  }'
```

**Expected:**
- Log: `✅ Single phone found: 0909505311`
- Auto save to `balance_customer_info`
- `extraction_note = AUTO_MATCHED_FROM_PARTIAL:90950`

### Test Case 2: Multiple phones → Pending match

```bash
curl -X POST http://localhost:3000/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": 999992,
    "gateway": "TEST",
    "content": "CT DEN:456 ND:57828 thanh toan",
    "transferType": "in",
    "transferAmount": 200000
  }'
```

**Expected:**
- Log: `⚠️ Multiple phones found (4), creating pending match...`
- Insert to `pending_customer_matches`
- Transaction NOT marked as processed

### Test Case 3: No TPOS matches

```bash
curl -X POST http://localhost:3000/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": 999993,
    "gateway": "TEST",
    "content": "CT DEN:789 ND:99999 thanh toan",
    "transferType": "in",
    "transferAmount": 50000
  }'
```

**Expected:**
- Log: `No customers found in TPOS for: 99999`
- Save with `extraction_note = PARTIAL_PHONE_NO_TPOS_MATCH:99999`
- `name_fetch_status = NOT_FOUND_IN_TPOS`

## 📚 Next Steps

1. **Deploy to production**
2. **Run batch update** để process old transactions
3. **Monitor pending matches** - Admin cần chọn phones
4. **Check NOT_FOUND cases** - Có thể là số mới chưa có trong TPOS

---

**Feature này giúp hệ thống thông minh hơn nhiều!** 🎉
