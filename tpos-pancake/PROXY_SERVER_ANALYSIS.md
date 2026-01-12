# 📊 N2Store Proxy Server - Phân Tích Kiến Trúc

> **Tài liệu tập trung vào kiến trúc Cloudflare Worker và Render.com Fallback Server**

---

## 🎯 Tổng Quan

**N2Store** sử dụng kiến trúc **Dual Server + Auto Fallback** để đảm bảo tính sẵn sàng cao cho API proxy:

- **Primary**: Cloudflare Worker (nhanh, edge network)
- **Fallback**: Render.com Express Server (backup khi CF fail)

---

## 🏗️ Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              api-config.js                        │   │
│  │   PRIMARY_URL → Cloudflare Worker                 │   │
│  │   BACKUP_URL  → Render.com Server                 │   │
│  │        ↓ Auto fallback on error                   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
           │                          │
           ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│  CLOUDFLARE WORKER  │    │   RENDER.COM        │
│  (Primary) ⚡        │    │   (Fallback) 🛡️     │
│                     │    │                     │
│  • Edge Network     │    │  • PostgreSQL       │
│  • 100k req/day     │    │  • WebSocket Server │
│  • No cold start    │    │  • SePay Integration│
│  • Token Cache      │    │  • Customer DB      │
└─────────────────────┘    └─────────────────────┘
           │                          │
           └────────────┬─────────────┘
                        ▼
    ┌─────────────────────────────────────────┐
    │             BACKEND SERVERS             │
    │                                         │
    │  • tomato.tpos.vn (TPOS API)           │
    │  • pancake.vn (Pancake API)            │
    │  • pages.fm (Public Pancake API)       │
    │  • graph.facebook.com (Facebook API)   │
    └─────────────────────────────────────────┘
```

---

## ⚡ Cloudflare Worker (`/cloudflare-worker`)

> **URL**: `https://chatomni-proxy.nhijudyshop.workers.dev`

### Đặc điểm

| Thuộc tính | Giá trị |
|------------|---------|
| **File** | `worker.js` |
| **Free Tier** | 100,000 requests/ngày |
| **Cold Start** | Không có (luôn sẵn sàng) |
| **Token Cache** | In-memory với 5-min buffer |
| **CORS** | Allow all origins (*) |

### API Endpoints

| Endpoint | Method | Mục đích |
|----------|--------|----------|
| `/api/token` | POST | TPOS Token (có cache) |
| `/api/image-proxy` | GET | Proxy ảnh bypass CORS |
| `/api/fb-avatar` | GET | Facebook/Pancake avatar |
| `/api/pancake-avatar` | GET | Pancake content avatar |
| `/api/proxy` | ALL | Generic proxy |
| `/api/pancake-direct/*` | ALL | Pancake 24h bypass (JWT cookie) |
| `/api/pancake-official/*` | ALL | pages.fm Public API |
| `/api/facebook-send` | POST | Gửi tin nhắn FB với tag |
| `/api/rest/*` | ALL | TPOS REST API v2.0 |

### Token Caching

```javascript
// Token được cache với 5-minute buffer
const tokenCache = {
  access_token: null,
  expiry: null,  // timestamp + expires_in
};

// Check cache trước khi gọi TPOS
if (isCachedTokenValid()) {
  return cachedToken;  // Tránh gọi API không cần thiết
}
```

### Code mẫu - Pancake Direct (24h Bypass)

```javascript
// /api/pancake-direct/* - JWT cookie authentication
if (pathname.startsWith('/api/pancake-direct/')) {
  const apiPath = pathname.replace(/^\/api\/pancake-direct\//, '');
  const targetUrl = `https://pancake.vn/api/v1/${apiPath}`;
  
  headers.set('Cookie', `jwt=${jwtToken}; locale=vi`);
  headers.set('Referer', 'https://pancake.vn/NhiJudyStore');
  
  // Forward request với headers giả mạo
  const response = await fetch(targetUrl, { method, headers, body });
}
```

### Code mẫu - Facebook Send (Message Tag)

```javascript
// POST /api/facebook-send - POST_PURCHASE_UPDATE tag
const fbBody = {
  recipient: { id: psid },
  message: { text: message },
  messaging_type: 'MESSAGE_TAG',
  tag: 'POST_PURCHASE_UPDATE'  // Bypass 24h restriction
};

await fetch(`https://graph.facebook.com/v21.0/${pageId}/messages`, {
  method: 'POST',
  body: JSON.stringify(fbBody)
});
```

---

## 🛡️ Render.com Fallback Server (`/render.com`)

> **URL**: `https://n2store-api-fallback.onrender.com`

### Đặc điểm

| Thuộc tính | Giá trị |
|------------|---------|
| **Runtime** | Node.js + Express |
| **Port** | 3000 (configurable) |
| **Database** | PostgreSQL (via `DATABASE_URL`) |
| **WebSocket** | Pancake realtime client |
| **Free Tier** | Sleep after 15 min inactive |

### Route Modules

| File | Mục đích |
|------|----------|
| `routes/token.js` | TPOS Token với cache |
| `routes/odata.js` | TPOS OData proxy |
| `routes/pancake.js` | Pancake API proxy |
| `routes/image-proxy.js` | Image proxy |
| `routes/sepay-webhook.js` | SePay integration |
| `routes/customers.js` | Customer DB (PostgreSQL) |
| `routes/cloudflare-backup.js` | Mirror tất cả CF endpoints |

### API Endpoints (Tương thích Cloudflare)

| Endpoint | Mục đích |
|----------|----------|
| `GET /health` | Health check |
| `GET /api/debug/time` | Server time diagnostic |
| `POST /api/token` | TPOS Token |
| `GET /api/odata/*` | TPOS OData |
| `GET /api/rest/*` | TPOS REST API |
| `ALL /api/pancake-direct/*` | Pancake 24h bypass |
| `ALL /api/pancake-official/*` | pages.fm Public API |
| `GET /api/fb-avatar` | Facebook avatar |
| `GET /api/pancake-avatar` | Pancake avatar |
| `POST /api/facebook-send` | FB message with tag |
| `GET /api/image-proxy` | Image proxy |
| `GET /api/proxy` | Generic proxy |
| `GET /api/customers/*` | Customer PostgreSQL |
| `POST /api/sepay/*` | SePay webhook |
| `POST /api/realtime/start` | Start Pancake WebSocket |

### WebSocket Client (Server-side)

```javascript
// Server tự kết nối Pancake WebSocket
class RealtimeClient {
  url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
  
  start(token, userId, pageIds) {
    this.connect();
  }
  
  joinChannels() {
    // Join user channel
    ws.send([ref, ref, `users:${userId}`, "phx_join", { 
      accessToken: token, userId, platform: "web" 
    }]);
    
    // Join multiple pages channel
    ws.send([ref, ref, `multiple_pages:${userId}`, "phx_join", { 
      accessToken: token, pageIds, platform: "web" 
    }]);
  }
  
  handleMessage(msg) {
    if (event === 'pages:update_conversation') {
      broadcastToClients(payload);  // Forward to frontend
    }
  }
}
```

### Database Schema (PostgreSQL)

```
┌─────────────────────┐       ┌─────────────────────┐
│     customers       │       │    sepay_logs       │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ phone               │       │ transaction_code    │
│ name                │       │ amount              │
│ address             │       │ customer_phone      │
│ created_at          │       │ created_at          │
└─────────────────────┘       └─────────────────────┘
```

---

## 🔄 Auto Fallback Logic

### Client-side (`api-config.js`)

```javascript
const API_CONFIG = {
  PRIMARY_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',
  BACKUP_URL: 'https://n2store-api-fallback.onrender.com'
};

async function fetchWithFallback(endpoint, options) {
  try {
    const response = await fetch(`${PRIMARY_URL}${endpoint}`, options);
    if (response.status >= 500) throw new Error('Primary failed');
    return response;
  } catch (error) {
    console.log('⚠️ Primary failed, using backup...');
    return fetch(`${BACKUP_URL}${endpoint}`, options);
  }
}
```

### Fallback Flow

```
1. Request → Cloudflare Worker
       ↓
2. Success? → Return response
   Error?  → Continue to step 3
       ↓
3. Request → Render.com Server
       ↓
4. Return response (backup)
```

---

## 📡 WebSocket Architecture

### Pancake Realtime (Phoenix Protocol)

| Aspect | Value |
|--------|-------|
| **URL** | `wss://pancake.vn/socket/websocket?vsn=2.0.0` |
| **Protocol** | Phoenix (Elixir) |
| **Heartbeat** | 30 seconds |
| **Message Format** | `[joinRef, ref, topic, event, payload]` |

### Channels

| Channel | Purpose |
|---------|---------|
| `users:{userId}` | User notifications |
| `multiple_pages:{userId}` | Page conversations |

### Message Event

```json
{
  "type": "pages:update_conversation",
  "payload": {
    "conversation": {
      "id": "683498e07b342896aec155d6",
      "page_id": "270136663390370",
      "customer_id": "9484319011642026"
    },
    "last_message": {
      "content": "Xin chào",
      "created_at": "2025-12-19T14:22:35.887Z"
    }
  }
}
```

---

## 🔐 Authentication

### TPOS Token

```
POST /api/token
Content-Type: application/x-www-form-urlencoded

client_id=tmtWebApp&grant_type=password&username=xxx&password=xxx&scope=profile

Response: { access_token: "eyJhbG...", expires_in: 3600 }
```

### Pancake JWT

```
GET /api/pancake-direct/*?jwt=<JWT_TOKEN>&page_id=<PAGE_ID>

Cookie: jwt=<JWT_TOKEN>; locale=vi
```

### Facebook Page Token

```
POST /api/facebook-send
{
  "pageId": "270136663390370",
  "psid": "9484319011642026",
  "message": "Hello",
  "pageToken": "EAA...",
  "useTag": true
}
```

---

## 🆘 Troubleshooting

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|-----------|
| Cloudflare 500 | Rate limit / code error | Tự động fallback sang Render |
| Render cold start | Server sleep 15 min | Đợi 30-60s hoặc upgrade paid |
| CORS error | Missing headers | Đã handle CORS ở cả 2 server |
| Token expired | Cache expired | Tự động refresh token |
| WebSocket disconnect | Network issue | Auto reconnect 5 giây |

### Debug Commands

```bash
# Test Cloudflare
curl https://chatomni-proxy.nhijudyshop.workers.dev/api/token -X POST -d "..."

# Test Render.com
curl https://n2store-api-fallback.onrender.com/health

# Test fallback
curl https://n2store-api-fallback.onrender.com/api/debug/time
```

---

## 📊 Bảng So Sánh

| Feature | Cloudflare Worker | Render.com |
|---------|-------------------|------------|
| **Latency** | ~50ms (edge) | ~200ms (Singapore) |
| **Free Tier** | 100k req/day | Sleep after 15min |
| **Cold Start** | None | 30-60 seconds |
| **Database** | None | PostgreSQL |
| **WebSocket** | None | Full support |
| **Token Cache** | In-memory | In-memory |
| **CORS** | ✅ | ✅ |

---

## 🚀 Deploy

### Cloudflare Worker

```bash
cd cloudflare-worker
npm install -g wrangler
wrangler login
wrangler deploy
```

### Render.com

1. Push to GitHub
2. Connect repo in Render Dashboard
3. Set `Root Directory: render.com`
4. Set `Start Command: npm start`
5. Add env: `DATABASE_URL`, `NODE_ENV=production`

---

*Tài liệu Proxy Server - Cập nhật: 2025-12-19*
