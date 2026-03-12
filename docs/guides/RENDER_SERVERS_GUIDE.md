# Hướng dẫn Render.com Servers - N2Store

## Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Browser)                              │
│                      nhijudyshop.github.io/n2store                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE WORKER (Proxy)                                │
│               chatomni-proxy.nhijudyshop.workers.dev                        │
│                                                                              │
│   Routes:                                                                    │
│   • /api/realtime/*     → n2store-realtime.onrender.com                     │
│   • /api/sepay/*        → n2store-fallback.onrender.com                     │
│   • /api/customers/*    → n2store-fallback.onrender.com                     │
│   • /api/chat/*         → n2store-fallback.onrender.com                     │
│   • /api/pancake/*      → pancake.vn (direct)                               │
│   • /api/token          → tomato.tpos.vn (direct)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                          │                           │
                          ▼                           ▼
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│    n2store-realtime (MỚI)           │   │    n2store-fallback (CŨ)            │
│    Standard Plan                     │   │    Free/Starter Plan                │
│                                      │   │                                      │
│    WebSocket Only:                   │   │    Database APIs:                    │
│    • Pancake realtime               │   │    • SePay webhook                   │
│    • TPOS realtime                  │   │    • Customers API                   │
│    • Broadcast to clients           │   │    • Chat history                    │
│                                      │   │    • Return orders                   │
│    NO DATABASE                       │   │    • PostgreSQL                      │
└─────────────────────────────────────┘   └─────────────────────────────────────┘
```

---

## Server 1: n2store-realtime (MỚI - v2.0)

### Thông tin cơ bản

| Thuộc tính | Giá trị |
|------------|---------|
| **URL** | https://n2store-realtime.onrender.com |
| **WebSocket** | wss://n2store-realtime.onrender.com |
| **Plan** | Standard (24/7) |
| **Region** | Singapore |
| **Repository** | nhijudyshop/n2store |
| **Root Directory** | `n2store-realtime` |
| **Database** | PostgreSQL (shared với n2store-fallback) |

### Chức năng

Server này xử lý WebSocket realtime VÀ lưu trữ tin nhắn:

1. **Pancake Realtime** - Nhận tin nhắn mới từ Facebook/Pancake
2. **TPOS Realtime** - Nhận events từ TPOS ChatOmni
3. **Broadcast** - Forward events tới browser clients
4. **Database Persistence** - Lưu tin nhắn vào `pending_customers` table
5. **Auto-Connect** - Tự động kết nối lại WebSocket khi server restart
6. **Pending Customers API** - API để frontend fetch khách chưa trả lời

### API Endpoints

#### Pancake

```bash
# Khởi động Pancake WebSocket
POST /api/realtime/start
Content-Type: application/json
{
    "token": "pancake_jwt_token",
    "userId": "12345",
    "pageIds": ["page1", "page2"],
    "cookie": "jwt=xxx" (optional)
}

# Dừng Pancake WebSocket
POST /api/realtime/stop

# Kiểm tra trạng thái
GET /api/realtime/status
# Response: { "connected": true, "userId": "12345", "pageCount": 2 }
```

#### TPOS

```bash
# Khởi động TPOS WebSocket
POST /api/realtime/tpos/start
Content-Type: application/json
{
    "token": "tpos_access_token",
    "room": "tomato.tpos.vn"
}

# Dừng TPOS WebSocket
POST /api/realtime/tpos/stop

# Kiểm tra trạng thái
GET /api/realtime/tpos/status
# Response: { "connected": true, "room": "tomato.tpos.vn" }
```

#### Health Check

```bash
GET /health
# Response: { "status": "ok", "uptime": 3600, "database": "connected", "clients": {...} }
```

#### Pending Customers (MỚI v2.0)

```bash
# Lấy danh sách khách chưa được trả lời
GET /api/realtime/pending-customers?limit=500
# Response: { "success": true, "count": 50, "customers": [...] }

# Đánh dấu đã trả lời khách
POST /api/realtime/mark-replied
Content-Type: application/json
{ "psid": "123456789", "pageId": "987654321" }
# Response: { "success": true, "removed": 1 }

# Clear all pending (debug only)
POST /api/realtime/clear-pending
{ "confirm": "yes" }
```

### WebSocket Connection (Frontend)

```javascript
// Browser kết nối trực tiếp tới server
const ws = new WebSocket('wss://n2store-realtime.onrender.com');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
        case 'pages:update_conversation':
            // Tin nhắn mới từ Pancake
            console.log('New message:', data.payload.conversation);
            break;

        case 'order:tags_updated':
            // Tags đơn hàng được cập nhật
            console.log('Tags updated:', data.payload);
            break;

        case 'tpos:event':
            // Event từ TPOS
            console.log('TPOS event:', data.event, data.payload);
            break;

        case 'tpos:parsed-event':
            // Event từ TPOS đã parse
            console.log('TPOS parsed:', data.data);
            break;
    }
};
```

### Environment Variables

| Variable | Value | Required |
|----------|-------|----------|
| `NODE_ENV` | `production` | Yes |
| `PORT` | (auto set by Render) | No |

### Deploy Settings

| Setting | Value |
|---------|-------|
| Build Command | `npm install` |
| Start Command | `npm start` |
| Auto-Deploy | Yes (on push to main) |

---

## Server 2: n2store-fallback (CŨ)

### Thông tin cơ bản

| Thuộc tính | Giá trị |
|------------|---------|
| **URL** | https://n2store-fallback.onrender.com |
| **Plan** | Standard |
| **Region** | Singapore |
| **Repository** | nhijudyshop/n2store |
| **Root Directory** | `render.com` |
| **Database** | PostgreSQL |

### Chức năng

Server này xử lý các API cần **database**:

1. **SePay Webhook** - Nhận thông báo thanh toán
2. **Customers API** - CRUD customers
3. **Chat History** - Lưu trữ lịch sử chat
4. **Return Orders** - Quản lý đơn hoàn

### API Endpoints chính

#### SePay

```bash
# Webhook nhận thanh toán
POST /api/sepay/webhook

# Kiểm tra số dư
GET /api/sepay/balance

# Lấy debt summary
GET /api/sepay/debt-summary?phone=0123456789
```

#### Customers

```bash
# CRUD customers
GET    /api/customers
GET    /api/customers/:id
POST   /api/customers
PUT    /api/customers/:id
DELETE /api/customers/:id

# Search
GET /api/customers/search?q=keyword
```

#### Other APIs

```bash
# Token proxy
POST /api/token

# OData proxy
GET /api/odata/*

# Pancake proxy
GET /api/pancake/*

# Image proxy
GET /api/image-proxy?url=xxx

# Facebook avatar
GET /api/fb-avatar?id=xxx
```

### Environment Variables

| Variable | Value | Required |
|----------|-------|----------|
| `NODE_ENV` | `production` | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SEPAY_API_KEY` | SePay API key | Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Optional |
| `GEMINI_API_KEY` | Gemini AI key | Optional |

---

## So sánh 2 Server

| Feature | n2store-realtime (v2.0) | n2store-fallback |
|---------|--------------------------|------------------|
| **Purpose** | WebSocket + Pending Customers | Full API + DB |
| **Plan** | Standard | Standard |
| **Database** | PostgreSQL (shared) | PostgreSQL (shared) |
| **Sleep** | No | No |
| **Uptime** | 24/7 | 24/7 |
| **WebSocket** | ✅ Pancake + TPOS | ❌ None |
| **Auto-Connect** | ✅ On restart | ❌ None |
| **Pending API** | ✅ Yes | ✅ Yes (fallback) |
| **Dependencies** | 5 packages (pg added) | 15+ packages |
| **Cold start** | ~3s | ~5s |

### Lưu ý: Cả 2 server dùng CHUNG PostgreSQL database

---

## Luồng dữ liệu Realtime

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Pancake.vn │────▶│ n2store-realtime │────▶│  Browser WebSocket  │
│  WebSocket  │     │    (Render.com)   │     │  (realtime-manager) │
└─────────────┘     └──────────────────┘     └─────────────────────┘
      │                     │                         │
      │                     │                         │
      ▼                     ▼                         ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ New message │     │ Broadcast to all │     │ Update UI, show     │
│ from FB     │     │ connected clients│     │ notification        │
└─────────────┘     └──────────────────┘     └─────────────────────┘
```

---

## Troubleshooting

### Server không nhận được tin nhắn

1. **Kiểm tra WebSocket connected:**
   ```bash
   curl https://n2store-realtime.onrender.com/api/realtime/status
   ```

2. **Kiểm tra logs trên Render Dashboard**

3. **Restart connection:**
   ```bash
   # Stop
   curl -X POST https://n2store-realtime.onrender.com/api/realtime/stop

   # Start lại
   curl -X POST https://n2store-realtime.onrender.com/api/realtime/start \
     -H "Content-Type: application/json" \
     -d '{"token":"xxx","userId":"xxx","pageIds":["xxx"]}'
   ```

### Kiểm tra server status

Cả 2 server đều là **Standard plan** nên không bị sleep. Kiểm tra status:

```bash
# Realtime server
curl https://n2store-realtime.onrender.com/health

# Fallback server
curl https://n2store-fallback.onrender.com/health
```

### Token hết hạn

1. Pancake token: Đăng nhập lại web app
2. TPOS token: Refresh qua `/api/token`

---

## Files liên quan trong codebase

### Frontend

| File | Mô tả |
|------|-------|
| `orders-report/realtime-manager.js` | Quản lý WebSocket connection |
| `orders-report/debug-realtime.js` | Debug tools |
| `cloudflare-worker/worker.js` | Proxy routing |

### Server (n2store-realtime)

| File | Mô tả |
|------|-------|
| `n2store-realtime/server.js` | Main server |
| `n2store-realtime/package.json` | Dependencies |

### Server (n2store-fallback)

| File | Mô tả |
|------|-------|
| `render.com/server.js` | Main server |
| `render.com/routes/realtime.js` | Realtime routes (legacy) |
| `render.com/routes/sepay-webhook.js` | SePay integration |
| `render.com/routes/customers.js` | Customers API |

---

## Monitoring

### Health Check URLs

```bash
# Realtime server
curl https://n2store-realtime.onrender.com/health

# Fallback server
curl https://n2store-fallback.onrender.com/health
```

### Render Dashboard

- **n2store-realtime:** https://dashboard.render.com → n2store-realtime
- **n2store-fallback:** https://dashboard.render.com → n2store-fallback

### Logs

Xem logs realtime trên Render Dashboard → Logs tab

---

## Server 3: n2store-facebook (Facebook Graph API)

### Thông tin cơ bản

| Thuộc tính | Giá trị |
|------------|---------|
| **URL** | Chưa deploy riêng (có thể tích hợp vào fallback) |
| **Source Code** | `/n2store-facebook/server/server.js` |
| **API** | Facebook Graph API v21.0 trực tiếp |

### Chức năng

Server gọi Facebook Graph API 100% trực tiếp, không qua Pancake:

```bash
# Lấy conversations
GET /api/pages/:pageId/conversations

# Lấy messages
GET /api/conversations/:convId/messages?page_id=xxx

# Gửi message
POST /api/pages/:pageId/messages

# Upload attachment
POST /api/pages/:pageId/upload

# Private Reply từ comment
POST /api/pages/:pageId/comments/:commentId/private-reply

# Refresh tokens từ TPOS CRM
POST /api/refresh-tokens
```

### Token Management

- Lấy Page Access Token từ TPOS CRM API (`/odata/CRMTeam/ODataService.GetAllFacebook`)
- Cache tokens tối đa 5 phút
- Lưu file `tokens.json` để persist qua restart

---

## Server 4: n2shop.onrender.com (Legacy Upload)

### Thông tin cơ bản

| Thuộc tính | Giá trị |
|------------|---------|
| **URL** | `https://n2shop.onrender.com` |
| **Source Code** | Không có trong repo (external/legacy) |

### Chức năng

Server upload hình ảnh, được sử dụng bởi:
- `inventory-tracking/image-upload.js`
- `inventory-tracking/order-booking-crud.js`

```bash
# Upload image
POST /api/upload/image
```

---

## Server 5: n2store-balance.onrender.com (Legacy)

### Thông tin cơ bản

| Thuộc tính | Giá trị |
|------------|---------|
| **URL** | `https://n2store-balance.onrender.com` |
| **Trạng thái** | Legacy - có thể đã merge vào n2store-fallback |

### Chức năng

- Balance history API (cũ)
- Documented trong `orders-report/MODULE_MAP.md`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-20 | **v2.0**: Thêm Database persistence cho n2store-realtime |
| 2026-01-20 | Thêm pending_customers table + API |
| 2026-01-20 | Thêm auto-connect WebSocket khi server restart |
| 2026-01-20 | Frontend sử dụng n2store-realtime cho pending-customers API |
| 2026-01-11 | Bổ sung thêm 3 servers: n2store-facebook, n2shop, n2store-balance |
| 2026-01-05 | Tạo server mới `n2store-realtime` (Standard plan) |
| 2026-01-05 | Chuyển WebSocket realtime sang server mới |
| 2026-01-05 | Giữ database APIs trên `n2store-fallback` |
