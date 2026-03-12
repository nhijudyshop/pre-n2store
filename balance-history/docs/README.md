# Lịch sử biến động số dư - Sepay Webhook Integration

Hệ thống tích hợp webhook Sepay để theo dõi lịch sử biến động số dư tài khoản ngân hàng.

## Cấu trúc dự án

```
balance-history/
├── index.html          # Giao diện chính
├── styles.css          # CSS styling
├── main.js            # JavaScript chính
├── config.js          # Cấu hình API
└── README.md          # Tài liệu này
```

## Backend Components

### 1. Database Schema
- File: `render.com/migrations/create_balance_history.sql`
- Tables:
  - `balance_history`: Lưu lịch sử giao dịch
  - `sepay_webhook_logs`: Logs webhook requests
  - `balance_statistics`: View thống kê

### 2. API Routes
- File: `render.com/routes/sepay-webhook.js`
- Endpoints:
  - `POST /api/sepay/webhook` - Nhận webhook từ Sepay
  - `GET /api/sepay/history` - Lấy lịch sử giao dịch
  - `GET /api/sepay/statistics` - Lấy thống kê

### 3. Cloudflare Worker
- File: `cloudflare-worker/worker.js`
- Route: `/api/sepay/*` → Render.com server

## Cài đặt & Triển khai

### 1. Setup Database

**Lấy Database URL từ Render.com:**

1. Vào [Render Dashboard](https://dashboard.render.com/)
2. Click vào PostgreSQL database của bạn
3. Copy **Internal Database URL** hoặc **External Database URL**:
   - **Internal**: Nếu chạy migration từ Render Web Service
   - **External**: Nếu chạy từ máy local

**Chạy migration:**

⭐ **KHUYẾN NGHỊ: Dùng script tự động**

```bash
# Cách 1: Script tự động (dễ nhất) ✅
./render.com/migrations/migrate.sh "postgresql://user:password@host:port/database"

# Script sẽ tự động:
# - Test connection
# - Chạy migration
# - Verify kết quả
# - Hiển thị báo cáo đầy đủ
```

**Hoặc chạy thủ công:**

```bash
# Cách 2: Từ máy local (dùng External Database URL)
psql "postgresql://user:password@host:port/database" -f render.com/migrations/create_balance_history.sql

# Cách 3: Connect rồi run
psql "postgresql://user:password@host:port/database"
\i render.com/migrations/create_balance_history.sql

# Cách 4: Từ Render Shell (dùng Internal Database URL)
psql $DATABASE_URL -f render.com/migrations/create_balance_history.sql
```

**Verify migration thành công:**

```bash
# Option 1: Script tự động verify (khuyến nghị) ✅
node render.com/migrations/verify-migration.js "postgresql://user:password@host:port/database"

# Option 2: Kiểm tra thủ công
psql "postgresql://user:password@host:port/database"
\dt  -- Check tables (balance_history, sepay_webhook_logs)
\dv  -- Check view (balance_statistics)
\di  -- Check indexes
```

**Chi tiết về migration scripts:** Xem `render.com/migrations/README.md`

### 2. Deploy Backend

Backend đã được tích hợp vào `render.com/server.js`. Chỉ cần deploy lên Render.com:

```bash
# Render.com sẽ tự động deploy khi push code lên GitHub
git add .
git commit -m "Add Sepay webhook integration"
git push origin main
```

### 3. Configure Frontend

Sửa file `balance-history/config.js`:

```javascript
const CONFIG = {
    // Thay đổi URL này thành URL Cloudflare Worker của bạn
    API_BASE_URL: 'https://your-worker.your-subdomain.workers.dev',
    // Hoặc dùng trực tiếp Render.com
    // API_BASE_URL: 'https://n2store-fallback.onrender.com',
};
```

### 4. Configure Sepay Webhook

Đăng nhập vào [SePay Dashboard](https://my.sepay.vn/) và cấu hình webhook:

**Webhook URL:**
```
https://your-worker.your-subdomain.workers.dev/api/sepay/webhook
```

**Authentication Method:**

⭐ **KHUYẾN NGHỊ: Chọn "API Key"** (bảo mật hơn)

1. Chọn authentication method: **"API Key"**
2. Sepay sẽ tạo API key cho bạn, ví dụ: `sepay_sk_abc123xyz456`
3. Copy API key và thêm vào **Render.com Environment Variables**:
   - Vào Render Dashboard → Your Service → Environment
   - Add variable: `SEPAY_API_KEY=sepay_sk_abc123xyz456`
4. Webhook header format: `"Authorization": "Apikey YOUR_API_KEY"`

**Nếu chọn "No Authentication":**
- Đơn giản hơn nhưng **KHÔNG AN TOÀN**
- Code vẫn hoạt động (sẽ skip authentication check)
- Chỉ nên dùng cho testing/development

**Expected Response:**
- Status Code: `200`
- Body: `{"success": true}`

## API Documentation

### POST /api/sepay/webhook

Nhận webhook từ Sepay khi có giao dịch mới.

**Request Body (từ Sepay):**
```json
{
  "id": 92704,
  "gateway": "Vietcombank",
  "transactionDate": "2023-03-25 14:02:37",
  "accountNumber": "0123499999",
  "code": null,
  "content": "chuyen tien mua iphone",
  "transferType": "in",
  "transferAmount": 2277000,
  "accumulated": 19077000,
  "subAccount": null,
  "referenceCode": "MBVCB.3278907687",
  "description": ""
}
```

**Response:**
```json
{
  "success": true,
  "id": 123,
  "message": "Transaction recorded successfully"
}
```

### GET /api/sepay/history

Lấy lịch sử giao dịch với filter và pagination.

**Query Parameters:**
- `page` (number): Số trang, default = 1
- `limit` (number): Số records mỗi trang, default = 50
- `type` (string): "in" hoặc "out"
- `gateway` (string): Tên ngân hàng
- `startDate` (string): Ngày bắt đầu (YYYY-MM-DD)
- `endDate` (string): Ngày kết thúc (YYYY-MM-DD)
- `search` (string): Tìm kiếm trong content, reference_code, code

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

### GET /api/sepay/statistics

Lấy thống kê giao dịch.

**Query Parameters:**
- `startDate` (string): Ngày bắt đầu
- `endDate` (string): Ngày kết thúc
- `gateway` (string): Tên ngân hàng

**Response:**
```json
{
  "success": true,
  "statistics": {
    "total_transactions": 150,
    "total_in_count": 100,
    "total_out_count": 50,
    "total_in": 50000000,
    "total_out": 20000000,
    "net_change": 30000000,
    "latest_balance": 100000000
  }
}
```

## Webhook Testing

### Test với curl:

```bash
curl -X POST https://your-worker.workers.dev/api/sepay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": 12345,
    "gateway": "Vietcombank",
    "transactionDate": "2024-01-15 10:30:00",
    "accountNumber": "0123456789",
    "content": "Test transaction",
    "transferType": "in",
    "transferAmount": 1000000,
    "accumulated": 5000000,
    "referenceCode": "TEST123"
  }'
```

### Test với Postman:

1. Method: `POST`
2. URL: `https://your-worker.workers.dev/api/sepay/webhook`
3. Headers: `Content-Type: application/json`
4. Body: Raw JSON (xem ví dụ trên)

## Monitoring & Debugging

### Check webhook logs:

```sql
SELECT * FROM sepay_webhook_logs
ORDER BY created_at DESC
LIMIT 50;
```

### Check transaction data:

```sql
SELECT * FROM balance_history
ORDER BY transaction_date DESC
LIMIT 50;
```

### Check statistics:

```sql
SELECT * FROM balance_statistics
ORDER BY date DESC;
```

## Troubleshooting

### Webhook không nhận được:

1. Kiểm tra URL webhook trong Sepay dashboard
2. Kiểm tra logs: `SELECT * FROM sepay_webhook_logs`
3. Kiểm tra Cloudflare Worker logs
4. Test endpoint bằng curl/Postman

### Frontend không hiển thị data:

1. Kiểm tra `config.js` - URL có đúng không?
2. Mở DevTools Console xem có lỗi API không
3. Kiểm tra CORS trong Cloudflare Worker
4. Test API trực tiếp: `GET /api/sepay/history`

### Duplicate transactions:

Hệ thống tự động bỏ qua giao dịch trùng lặp dựa trên `sepay_id`.

## Security Considerations

1. **API Key Authentication**: Thêm xác thực API key trong `sepay-webhook.js`
2. **IP Whitelisting**: Chỉ cho phép IP của Sepay
3. **Rate Limiting**: Thêm rate limiting cho webhook endpoint
4. **HTTPS Only**: Luôn dùng HTTPS

## Features

✅ Nhận webhook realtime từ Sepay
✅ Lưu lịch sử giao dịch vào PostgreSQL
✅ Hiển thị bảng giao dịch với filter & pagination
✅ Thống kê tổng tiền vào, tiền ra, số dư
✅ Responsive design
✅ Modal chi tiết giao dịch
✅ Webhook logging cho debugging
✅ Duplicate prevention

## Support

Tài liệu Sepay:
- [Tích hợp webhooks](https://docs.sepay.vn/tich-hop-webhooks.html)
- [Lập trình webhooks](https://docs.sepay.vn/lap-trinh-webhooks.html)

Nếu cần thêm thông tin, vui lòng liên hệ.
