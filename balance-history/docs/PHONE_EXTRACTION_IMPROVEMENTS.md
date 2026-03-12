# Phone Extraction Improvements

## 🎯 Vấn đề được giải quyết

Như bạn chỉ ra trong screenshot:

1. ❌ **Phone không hợp lệ vẫn được extract** - Số dài 15 chữ số như `253560094168**53**` vẫn được lưu
2. ❌ **Mã QR N2 bị bỏ qua** - Dù có mã QR 18 ký tự thì vẫn extract phone
3. ❌ **Không có thông tin debug** - Không biết tại sao không lấy được tên và SĐT đầy đủ
4. ❌ **TPOS fetch phones không hợp lệ** - Cố fetch tên cho phone 5 chữ số, 15 chữ số

## ✅ Giải pháp

### 1. Thêm 2 cột tracking vào database

**Cột `extraction_note`** - Lý do extraction thành công/thất bại:
- `QR_CODE_FOUND` - Đã tìm thấy mã QR N2 (18 ký tự)
- `PHONE_EXTRACTED` - Extract phone thành công (10 số)
- `MULTIPLE_PHONES_FOUND` - Có nhiều phone, lấy số cuối cùng
- `INVALID_PHONE_LENGTH:N` - Tìm thấy số N chữ số nhưng không hợp lệ (không phải 10)
- `NO_PHONE_FOUND` - Không tìm thấy phone hoặc QR

**Cột `name_fetch_status`** - Trạng thái fetch tên từ TPOS:
- `PENDING` - Có phone hợp lệ, đang chờ fetch tên
- `SUCCESS` - Đã fetch tên thành công
- `NOT_FOUND_IN_TPOS` - Phone không có trong TPOS
- `INVALID_PHONE` - Phone không hợp lệ (không đủ 10 số)
- `NO_PHONE_TO_FETCH` - Có QR code hoặc không có phone

### 2. Cải thiện logic extraction

**Thứ tự ưu tiên MỚI:**

```javascript
1. CHECK QR CODE N2 (bắt đầu N2, dài 18 ký tự)
   ↓ Nếu có → Dùng QR code, KHÔNG extract phone
   ↓ Nếu không có → Tiếp tục...

2. EXTRACT PHONE (ĐÚNG 10 CHỮ SỐ, bắt đầu bằng 0)
   ↓ Tìm tất cả số 10 chữ số: /\b0\d{9}\b/g
   ↓ Lấy occurrence cuối cùng
   ↓ Return: PHONE{10-digit-number}

3. CHECK INVALID NUMBERS
   ↓ Nếu tìm thấy số >=5 chữ số nhưng không phải 10
   ↓ Ghi log: INVALID_PHONE_LENGTH:N
   ↓ KHÔNG lưu vào database

4. NO VALID IDENTIFIER
   ↓ Return: NO_PHONE_FOUND
```

**Regex cũ (SAI):**
```javascript
/\d{5,}/g  // Match bất kỳ số nào >=5 chữ số
// ❌ Khớp với: 5, 7, 10, 12, 15, 18 chữ số
```

**Regex mới (ĐÚNG):**
```javascript
/\bN2[A-Z0-9]{16}\b/  // QR code: N2 + 16 ký tự
/\b0\d{9}\b/g         // Phone: 0 + 9 chữ số (đúng 10 số)
// ✅ CHỈ khớp với: QR 18 ký tự hoặc phone 10 số
```

### 3. Cải thiện TPOS fetch

**Trước đây:**
```javascript
// Fetch TẤT CẢ phones không có tên
const phones = data.filter(row => !row.customer_name);
// ❌ Bao gồm cả phone 5 số, 15 số → Lãng phí API calls
```

**Bây giờ:**
```javascript
// CHỈ fetch phones hợp lệ với status PENDING
const phones = data.filter(row => {
    const phone = row.customer_phone || '';
    const status = row.name_fetch_status || '';
    return phone.length === 10 && /^0\d{9}$/.test(phone) && status === 'PENDING';
});
// ✅ Chỉ gọi API cho phones 10 số chưa fetch
// ✅ Nếu không tìm thấy → Mark as NOT_FOUND_IN_TPOS
```

### 4. Frontend hiển thị chi tiết

**Thêm 2 cột mới vào Phone Data Modal:**

| Extraction Note | Fetch Status |
|----------------|--------------|
| ✓ PHONE_EXTRACTED | ✓ SUCCESS |
| 🔗 QR_CODE_FOUND | - N/A |
| ⚠️ INVALID_PHONE_LENGTH:15 | ⚠ INVALID |
| ✗ NO_PHONE_FOUND | - N/A |
| 📞 MULTIPLE_PHONES_FOUND | ⏳ PENDING |

**Color coding:**
- 🟢 Green: Success (PHONE_EXTRACTED, SUCCESS)
- 🔵 Blue: QR code (QR_CODE_FOUND)
- 🟡 Yellow: Warning (INVALID_PHONE_LENGTH, PENDING)
- 🔴 Red: Error (NOT_FOUND_IN_TPOS)
- ⚫ Gray: N/A (NO_PHONE_TO_FETCH)

## 📊 Ví dụ xử lý

### Ví dụ 1: Nội dung có mã QR N2
```
Content: "CT DEN:0901234567 N2MJEF8K31GAAPD6BN thanh toan"

TRƯỚC ĐÂY:
❌ Extract phone: 0901234567 (bỏ qua QR)
❌ unique_code: PHONE0901234567

BÂY GIỜ:
✅ Detect QR: N2MJEF8K31GAAPD6BN
✅ unique_code: N2MJEF8K31GAAPD6BN
✅ extraction_note: QR_CODE_FOUND
✅ name_fetch_status: NO_PHONE_TO_FETCH
```

### Ví dụ 2: Số dài 15 chữ số (KHÔNG hợp lệ)
```
Content: "CT DEN:123456 ND:253560094168553 thanh toan"

TRƯỚC ĐÂY:
❌ Extract: 253560094168553 (15 số)
❌ unique_code: PHONE253560094168553
❌ Cố fetch tên từ TPOS → Lỗi

BÂY GIỜ:
✅ Detect: 253560094168553 (15 số - không hợp lệ)
✅ KHÔNG lưu vào database
✅ Log: INVALID_PHONE_LENGTH:15
✅ Không gọi TPOS API
```

### Ví dụ 3: Số ngắn 5 chữ số (KHÔNG hợp lệ)
```
Content: "CT DEN:66014 thanh toan"

TRƯỚC ĐÂY:
❌ Extract: 66014 (5 số)
❌ unique_code: PHONE66014
❌ Cố fetch tên từ TPOS → Lỗi

BÂY GIỜ:
✅ Detect: 66014 (5 số - không hợp lệ)
✅ KHÔNG lưu vào database
✅ Log: INVALID_PHONE_LENGTH:5
✅ Không gọi TPOS API
```

### Ví dụ 4: Phone hợp lệ 10 số
```
Content: "CT DEN:0123456789 ND:0909505311 thanh toan"

TRƯỚC & BÂY GIỜ:
✅ Extract: 0909505311 (số cuối, 10 số)
✅ unique_code: PHONE0909505311
✅ extraction_note: PHONE_EXTRACTED
✅ name_fetch_status: PENDING
→ Khi click "Lấy Tên từ TPOS":
  - Nếu tìm thấy → name_fetch_status: SUCCESS
  - Nếu không thấy → name_fetch_status: NOT_FOUND_IN_TPOS
```

## 🚀 Deployment Steps

### 1. Chạy migration SQL
```bash
psql $DATABASE_URL -f balance-history/ADD_EXTRACTION_COLUMNS.sql
```

Hoặc trực tiếp:
```sql
ALTER TABLE balance_customer_info
ADD COLUMN IF NOT EXISTS extraction_note VARCHAR(100),
ADD COLUMN IF NOT EXISTS name_fetch_status VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_balance_customer_info_extraction_note
ON balance_customer_info(extraction_note);

CREATE INDEX IF NOT EXISTS idx_balance_customer_info_name_fetch_status
ON balance_customer_info(name_fetch_status);
```

### 2. Deploy code lên Render.com
```bash
git push origin claude/review-balance-history-yRCqn
# Merge PR và deploy
```

### 3. Kiểm tra existing data
```sql
-- Xem các phone không hợp lệ hiện tại
SELECT unique_code, customer_phone, LENGTH(customer_phone) as phone_length
FROM balance_customer_info
WHERE customer_phone !~ '^0\d{9}$';

-- Update existing records với default status
UPDATE balance_customer_info
SET extraction_note = CASE
    WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) = 10 THEN 'PHONE_EXTRACTED'
    WHEN customer_phone IS NOT NULL AND LENGTH(customer_phone) != 10 THEN 'INVALID_PHONE_LENGTH'
    ELSE 'NO_PHONE_FOUND'
END
WHERE extraction_note IS NULL;
```

### 4. Test workflow mới
1. Click **"Cập nhật Phone"** → Chỉ lưu phones 10 số hợp lệ
2. Click **"Xem Phone Data"** → Thấy 2 cột mới với badges màu
3. Click **"Lấy Tên từ TPOS"** → Chỉ fetch phones status PENDING

## 📈 Benefits

| Before | After |
|--------|-------|
| ❌ Phone 5-15 số vẫn lưu | ✅ Chỉ lưu phone 10 số |
| ❌ Bỏ qua QR code N2 | ✅ Ưu tiên QR code |
| ❌ Không biết lý do fail | ✅ Hiển thị extraction_note |
| ❌ TPOS fetch phones lỗi | ✅ Chỉ fetch phones hợp lệ |
| ❌ Không track fetch status | ✅ Hiển thị name_fetch_status |

## 🧪 Testing

```bash
# Test QR code priority
curl -X POST http://localhost:3000/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": 999991,
    "gateway": "TEST",
    "content": "CT DEN:0901234567 N2MJEF8K31GAAPD6BN thanh toan",
    "transferType": "in",
    "transferAmount": 100000
  }'

# Expected: unique_code = N2MJEF8K31GAAPD6BN (not PHONE0901234567)

# Test invalid phone (15 digits)
curl -X POST http://localhost:3000/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": 999992,
    "gateway": "TEST",
    "content": "CT DEN:253560094168553 thanh toan",
    "transferType": "in",
    "transferAmount": 100000
  }'

# Expected: NOT saved to balance_customer_info, log shows INVALID_PHONE_LENGTH:15

# Test valid phone (10 digits)
curl -X POST http://localhost:3000/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": 999993,
    "gateway": "TEST",
    "content": "CT DEN:0909505311 thanh toan",
    "transferType": "in",
    "transferAmount": 100000
  }'

# Expected: unique_code = PHONE0909505311, extraction_note = PHONE_EXTRACTED
```

## 📝 Notes

- **Backward compatible**: Existing data không bị ảnh hưởng, chỉ thêm columns
- **Migration tự động**: SQL script update default values cho records cũ
- **Performance**: Thêm indexes cho extraction_note và name_fetch_status
- **Security**: Không có thay đổi authentication/authorization logic

## 🔍 Debug Queries

```sql
-- Xem phân bố extraction notes
SELECT extraction_note, COUNT(*) as count
FROM balance_customer_info
GROUP BY extraction_note
ORDER BY count DESC;

-- Xem phân bố fetch status
SELECT name_fetch_status, COUNT(*) as count
FROM balance_customer_info
GROUP BY name_fetch_status
ORDER BY count DESC;

-- Tìm phones không hợp lệ
SELECT unique_code, customer_phone, extraction_note
FROM balance_customer_info
WHERE extraction_note LIKE 'INVALID_PHONE_LENGTH%'
ORDER BY created_at DESC
LIMIT 20;

-- Tìm phones chưa fetch tên
SELECT unique_code, customer_phone, name_fetch_status
FROM balance_customer_info
WHERE name_fetch_status = 'PENDING'
ORDER BY created_at DESC
LIMIT 20;
```

---

**Tất cả issues đã được fix! ✅**
