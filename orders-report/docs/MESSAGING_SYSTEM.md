# Hệ thống Tin nhắn & Chat - orders-report

> Tài liệu hướng dẫn toàn diện về hệ thống messaging, realtime display, và chat của module `orders-report`.

## Mục lục
1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu trúc File & Module](#2-cấu-trúc-file--module)
3. [Realtime & Notifications](#3-realtime--notifications)
4. [Chat Modal & UI](#4-chat-modal--ui)
5. [Pancake API Integration](#5-pancake-api-integration)
6. [Firebase Integration](#6-firebase-integration)
7. [Global Variables & State](#7-global-variables--state)
8. [Code Examples](#8-code-examples)
9. [Troubleshooting & Debug](#9-troubleshooting--debug)

---

## 1. Tổng quan kiến trúc

### 1.1 Sơ đồ luồng dữ liệu

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │  Facebook    │    │   TPOS API   │    │   Firebase   │                   │
│  │  Messenger   │    │  (Orders)    │    │ (Quick Reply)│                   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                   │                            │
│         ▼                   ▼                   ▼                            │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │                    PANCAKE.VN API                             │           │
│  │  (Conversations, Messages, Comments, Attachments)            │           │
│  └──────────────────────────┬───────────────────────────────────┘           │
└─────────────────────────────┼───────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROXY / BACKEND                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────┐    ┌────────────────────────────────┐           │
│  │ n2store-fallback       │    │ chatomni-proxy                 │           │
│  │ (Render.com)           │    │ (Cloudflare Worker)            │           │
│  │ - /api/realtime/summary│    │ - /api/realtime/summary        │           │
│  │ - /api/realtime/new-   │    │ - /api/odata/* (TPOS proxy)    │           │
│  │   messages             │    │ - Pancake API proxy            │           │
│  └────────────┬───────────┘    └─────────────┬──────────────────┘           │
└───────────────┼──────────────────────────────┼──────────────────────────────┘
                │                              │
                ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Browser)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │ PancakeData     │     │ PancakeToken    │     │ Realtime        │        │
│  │ Manager         │     │ Manager         │     │ Manager         │        │
│  │ (conversations, │     │ (page access    │     │ (polling,       │        │
│  │  messages,      │     │  tokens)        │     │  notifications) │        │
│  │  avatars)       │     │                 │     │                 │        │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘        │
│           │                       │                       │                  │
│           ▼                       ▼                       ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                    tab1-chat.js (Main Chat Logic)                 │       │
│  │  - openChatModal()   - renderChatMessages()   - sendMessage()    │       │
│  └──────────────────────────────────┬───────────────────────────────┘       │
│                                     │                                        │
│           ┌─────────────────────────┼─────────────────────────┐             │
│           ▼                         ▼                         ▼             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │ Chat Modal      │     │ Comment Modal   │     │ Quick Reply     │        │
│  │ (Messages UI)   │     │ (Comments UI)   │     │ Manager         │        │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘        │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                    tab1-table.js (Order Table)                    │       │
│  │  - renderMessagesColumn()    - renderCommentsColumn()            │       │
│  │  - Click handlers → openChatModal()                              │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Tổng quan các thành phần

| Thành phần | Mô tả |
|------------|-------|
| **Pancake.vn API** | API chính để lấy/gửi tin nhắn Facebook Messenger |
| **TPOS API** | API quản lý đơn hàng, lấy thông tin order details |
| **Firebase** | Lưu trữ Quick Replies (Firestore) + Held Products (RTDB) |
| **Proxy Servers** | Bypass CORS, fallback endpoints |
| **Frontend Managers** | Quản lý state, token, data cho messaging |

---

## 2. Cấu trúc File & Module

### 2.1 Chat Modules (`js/chat/`)

| File | Lines | Chức năng chính |
|------|-------|-----------------|
| `new-messages-notifier.js` | ~341 | Polling tin nhắn mới khi page load, toast notifications, highlight table rows |
| `quick-reply-manager.js` | ~1631 | CRUD templates, autocomplete `/shortcut`, gửi ảnh+text qua Pancake API |
| `comment-modal.js` | ~891 | Modal bình luận, reply public (`reply_comment`) và private (`private_replies`) |
| `live-comments-readonly-modal.js` | - | Xem live comments từ TPOS API (read-only) |
| `message-template-manager.js` | - | Load templates từ ChatOmni API (`/api/odata/MailTemplate`) |
| `chat-products-ui.js` | - | Render UI sản phẩm trong chat right panel |
| `chat-products-actions.js` | - | Actions: add product to order, held products với Firebase RTDB |

### 2.2 Managers (`js/managers/`)

| File | Chức năng chính |
|------|-----------------|
| `pancake-data-manager.js` | **Core manager**: fetch conversations, messages, comments; cache với Maps; avatar URLs; mark read/unread |
| `pancake-token-manager.js` | Quản lý page access tokens cho Pancake Official API |
| `realtime-manager.js` | WebSocket/polling cho realtime message updates |

### 2.3 Tab1 Chat (`js/tab1/`)

| File | Lines | Chức năng chính |
|------|-------|-----------------|
| `tab1-chat.js` | ~6000+ | **Main chat logic**: `openChatModal()`, `renderChatMessages()`, `sendMessage()`, mark read/unread, image upload |
| `tab1-table.js` | - | Render cột "Tin nhắn" và "Bình luận" trong bảng đơn hàng |
| `tab1-chat-products.js` | - | Products trong chat modal, held products Firebase listener |

### 2.4 File Structure Diagram

```
orders-report/js/
├── chat/
│   ├── new-messages-notifier.js    # Polling + notifications
│   ├── quick-reply-manager.js      # Quick reply templates
│   ├── comment-modal.js            # Comment modal
│   ├── live-comments-readonly-modal.js
│   ├── message-template-manager.js
│   ├── chat-products-ui.js
│   └── chat-products-actions.js
├── managers/
│   ├── pancake-data-manager.js     # Core data manager
│   ├── pancake-token-manager.js    # Token management
│   └── realtime-manager.js         # Realtime updates
├── tab1/
│   ├── tab1-chat.js                # Main chat logic
│   ├── tab1-table.js               # Table rendering
│   └── tab1-chat-products.js       # Products in chat
└── core/
    └── api-config.js               # API endpoints config
```

---

## 3. Realtime & Notifications

### 3.1 Polling Mechanism (`new-messages-notifier.js`)

Hệ thống sử dụng **polling** (không phải WebSocket) để kiểm tra tin nhắn mới.

#### Flow:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Page Load   │────▶│ Wait 2 sec   │────▶│ checkNew     │
│              │     │              │     │ Messages()   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
      ┌───────────────────────────────────────────┘
      ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Get last     │────▶│ Fetch from   │────▶│ Show toast   │
│ timestamp    │     │ /api/realtime│     │ notification │
│ (localStorage)     │ /summary     │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                                         ┌──────────────┐
                                         │ Highlight    │
                                         │ table rows   │
                                         │ (data-psid)  │
                                         └──────────────┘
```

#### Key Functions:

```javascript
// Kiểm tra tin nhắn mới
async function checkNewMessages() {
    const since = getLastSeenTimestamp();  // localStorage.getItem('last_realtime_check')
    const summary = await fetchNewMessages(since);

    if (summary.total > 0) {
        showNotification(summary);
        highlightNewMessagesInTable(summary.items);
    }

    saveCurrentTimestamp();  // localStorage.setItem('last_realtime_check', Date.now())
}

// Tự động check khi user quay lại tab
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (Date.now() - lastCheck > 60000) {  // > 1 phút
            checkNewMessages();
        }
    }
});
```

#### API Endpoints (với fallback):

```javascript
const SERVER_URL = 'https://n2store-fallback.onrender.com';
const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// Endpoints
GET /api/realtime/summary?since={timestamp}
GET /api/realtime/new-messages?since={timestamp}&limit=50
```

#### Response Format:

```json
{
  "success": true,
  "total": 5,
  "messages": 3,
  "comments": 2,
  "uniqueCustomers": 2,
  "items": [
    {
      "psid": "123456789",
      "page_id": "987654321",
      "type": "INBOX"  // hoặc "COMMENT"
    }
  ]
}
```

### 3.2 Highlight Table Rows

Khi có tin nhắn mới, hệ thống highlight rows trong bảng:

```javascript
function highlightNewMessagesInTable(items) {
    items.forEach(item => {
        // Tìm row bằng data-psid attribute
        const rows = document.querySelectorAll(`tr[data-psid="${item.psid}"]`);

        rows.forEach(row => {
            // Thêm badge "MỚI" vào cột tin nhắn
            const msgCell = row.querySelector('td[data-column="messages"]');
            if (msgCell) addNewBadge(msgCell, count);

            // Highlight row
            row.classList.add('product-row-highlight');
            setTimeout(() => row.classList.remove('product-row-highlight'), 3000);
        });
    });
}
```

### 3.3 Toast Notifications

```javascript
// Sử dụng notificationManager
if (window.notificationManager) {
    window.notificationManager.success('5 tin nhắn mới từ 2 khách hàng', 8000);
}

// Fallback toast tự tạo nếu notificationManager chưa ready
function showFallbackToast(text) {
    // Tạo toast element với gradient background, animation slideIn/slideOut
}
```

### 3.4 REALTIME SYSTEM DEEP DIVE - Kiến trúc Server & Luồng dữ liệu

Phần này mô tả chi tiết cách hệ thống realtime hoạt động từ **Server Render.com** đến **Frontend**.

#### 3.4.1 Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              PANCAKE.VN                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                    WebSocket: wss://pancake.vn/socket/websocket              │    │
│  │                    Protocol: Phoenix Framework (Elixir)                      │    │
│  │                    Events: pages:update_conversation, online_status          │    │
│  └───────────────────────────────────────┬─────────────────────────────────────┘    │
└──────────────────────────────────────────┼──────────────────────────────────────────┘
                                           │
                                           │ WebSocket Connection
                                           │ (jwt cookie + accessToken)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         SERVER RENDER.COM                                            │
│                    https://n2store-fallback.onrender.com                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                         server.js                                            │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │              class RealtimeClient                                    │    │    │
│  │  │  - Kết nối WebSocket đến Pancake.vn                                 │    │    │
│  │  │  - Join channels: users:{userId}, multiple_pages:{userId}           │    │    │
│  │  │  - Nhận events và lưu vào PostgreSQL                                │    │    │
│  │  │  - Broadcast đến frontend qua WebSocket Server                      │    │    │
│  │  └─────────────────────────────────────────────────────────────────────┘    │    │
│  │                                                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │              WebSocket Server (wss://)                               │    │    │
│  │  │  - Nhận kết nối từ frontend browsers                                │    │    │
│  │  │  - Broadcast tin nhắn mới đến tất cả clients                        │    │    │
│  │  └─────────────────────────────────────────────────────────────────────┘    │    │
│  │                                                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │              PostgreSQL Database                                     │    │    │
│  │  │  Table: realtime_updates                                            │    │    │
│  │  │  - id, conversation_id, type, snippet                               │    │    │
│  │  │  - page_id, psid, customer_name                                     │    │    │
│  │  │  - seen (boolean), created_at                                       │    │    │
│  │  └─────────────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                         routes/realtime.js                                   │    │
│  │  GET  /api/realtime/summary      → Đếm tin nhắn mới (không chi tiết)        │    │
│  │  GET  /api/realtime/new-messages → Lấy danh sách tin nhắn mới               │    │
│  │  POST /api/realtime/mark-seen    → Đánh dấu đã xem                          │    │
│  │  POST /api/realtime/start        → Khởi động WebSocket client               │    │
│  │  GET  /api/realtime/status       → Kiểm tra trạng thái kết nối              │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ HTTP Polling / WebSocket
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND BROWSER                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                    new-messages-notifier.js                                  │    │
│  │  - Polling /api/realtime/summary mỗi khi page load                          │    │
│  │  - Polling khi user quay lại tab (visibility change)                        │    │
│  │  - Hiển thị toast notification                                              │    │
│  │  - Highlight rows trong table                                               │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                    realtime-manager.js (Optional)                            │    │
│  │  - Kết nối WebSocket trực tiếp đến Pancake (Browser Mode)                   │    │
│  │  - Hoặc kết nối đến Proxy Server (Server Mode)                              │    │
│  │  - Nhận events realtime không cần polling                                   │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### 3.4.2 Server Render.com - RealtimeClient Class

**File**: `render.com/server.js` (line 257-446)

```javascript
class RealtimeClient {
    constructor(db = null) {
        this.ws = null;
        this.url = "wss://pancake.vn/socket/websocket?vsn=2.0.0";
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;  // ⚠️ QUAN TRỌNG: Sau 10 lần sẽ dừng hẳn
        this.db = db;  // PostgreSQL pool

        this.token = null;
        this.userId = null;
        this.pageIds = [];
    }

    // Khởi động client với credentials
    start(token, userId, pageIds, cookie = null) {
        this.token = token;
        this.userId = userId;
        this.pageIds = pageIds.map(id => String(id));
        this.cookie = cookie;
        this.connect();
    }

    // Kết nối WebSocket đến Pancake
    connect() {
        if (this.isConnected || !this.token) return;

        const headers = {
            'Origin': 'https://pancake.vn',
            'User-Agent': 'Mozilla/5.0 ...',
        };

        // Cookie rất quan trọng để authenticate
        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
            console.log('[SERVER-WS] Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff: 2s, 4s, 8s... max 60s
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
                this.reconnectAttempts++;
                setTimeout(() => this.connect(), delay);
            } else {
                console.error('[SERVER-WS] ❌ Max reconnect attempts reached. STOPPED.');
            }
        });

        this.ws.on('message', (data) => {
            const msg = JSON.parse(data);
            this.handleMessage(msg);
        });
    }

    // Join các channels Pancake
    joinChannels() {
        // 1. Join User Channel
        const userJoinMsg = [
            ref, ref, `users:${this.userId}`, "phx_join",
            { accessToken: this.token, userId: this.userId, platform: "web" }
        ];
        this.ws.send(JSON.stringify(userJoinMsg));

        // 2. Join Multiple Pages Channel (nhận tin nhắn từ tất cả pages)
        const pagesJoinMsg = [
            ref, ref, `multiple_pages:${this.userId}`, "phx_join",
            {
                accessToken: this.token,
                userId: this.userId,
                clientSession: this.generateClientSession(),
                pageIds: this.pageIds,
                platform: "web"
            }
        ];
        this.ws.send(JSON.stringify(pagesJoinMsg));
    }

    // Xử lý tin nhắn từ Pancake
    handleMessage(msg) {
        const [joinRef, ref, topic, event, payload] = msg;

        if (event === 'pages:update_conversation') {
            const conversation = payload.conversation;
            console.log('[SERVER-WS] New Message/Comment:', conversation.id);

            // 1. Broadcast đến frontend clients qua WebSocket
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload
            });

            // 2. Lưu vào PostgreSQL để frontend polling sau
            if (this.db && conversation) {
                const updateData = {
                    conversationId: conversation.id,
                    type: conversation.type || 'INBOX',
                    snippet: conversation.snippet || conversation.last_message?.message,
                    unreadCount: conversation.unread_count || 0,
                    pageId: conversation.page_id,
                    psid: conversation.from_psid || conversation.customers?.[0]?.fb_id,
                    customerName: conversation.from?.name
                };
                saveRealtimeUpdate(this.db, updateData);
            }
        }
    }
}
```

#### 3.4.3 Database Schema - realtime_updates

```sql
CREATE TABLE realtime_updates (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(255),
    type VARCHAR(50) DEFAULT 'INBOX',      -- 'INBOX' hoặc 'COMMENT'
    snippet TEXT,                           -- Nội dung tin nhắn (200 ký tự đầu)
    unread_count INTEGER DEFAULT 0,
    page_id VARCHAR(255),                   -- Facebook Page ID
    psid VARCHAR(255),                      -- Page-Scoped ID của khách hàng
    customer_name VARCHAR(255),
    seen BOOLEAN DEFAULT FALSE,             -- Đã xem chưa
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index để query nhanh
CREATE INDEX idx_realtime_updates_created_at ON realtime_updates(created_at);
CREATE INDEX idx_realtime_updates_seen ON realtime_updates(seen);
CREATE INDEX idx_realtime_updates_psid ON realtime_updates(psid);
```

#### 3.4.4 API Endpoints chi tiết

**File**: `render.com/routes/realtime.js`

##### GET /api/realtime/summary

Lấy tóm tắt số lượng tin nhắn mới (không lấy chi tiết).

```javascript
router.get('/summary', async (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const sinceDate = since > 0 ? new Date(since) : new Date(Date.now() - 24*60*60*1000);

    const query = `
        SELECT type, COUNT(*) as count, COUNT(DISTINCT psid) as unique_customers
        FROM realtime_updates
        WHERE created_at > $1 AND (seen = FALSE OR seen IS NULL)
        GROUP BY type
    `;

    const result = await db.query(query, [sinceDate]);

    // Response format
    res.json({
        success: true,
        messages: 3,          // Số tin nhắn INBOX
        comments: 2,          // Số bình luận COMMENT
        uniqueCustomers: 2,   // Số khách hàng unique
        total: 5,             // Tổng
        since: sinceDate.toISOString(),
        serverTime: new Date().toISOString()
    });
});
```

##### GET /api/realtime/new-messages

Lấy chi tiết tin nhắn mới để highlight trong table.

```javascript
router.get('/new-messages', async (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    const query = `
        SELECT id, conversation_id, type, snippet, unread_count,
               page_id, psid, customer_name, created_at
        FROM realtime_updates
        WHERE created_at > $1 AND (seen = FALSE OR seen IS NULL)
        ORDER BY created_at DESC
        LIMIT $2
    `;

    const result = await db.query(query, [sinceDate, limit]);

    res.json({
        success: true,
        total: result.rows.length,
        messages: {
            count: messagesCount,
            items: messagesArray  // Mỗi item có { psid, page_id, type }
        },
        comments: {
            count: commentsCount,
            items: commentsArray
        }
    });
});
```

##### POST /api/realtime/mark-seen

Đánh dấu tin nhắn đã xem để không hiển thị lại.

```javascript
router.post('/mark-seen', async (req, res) => {
    const { ids, before } = req.body;

    if (ids && Array.isArray(ids)) {
        // Mark specific IDs
        await db.query('UPDATE realtime_updates SET seen = TRUE WHERE id = ANY($1)', [ids]);
    } else if (before) {
        // Mark all before timestamp
        await db.query('UPDATE realtime_updates SET seen = TRUE WHERE created_at <= $1',
            [new Date(before)]);
    }

    res.json({ success: true, updated: result.rowCount });
});
```

##### POST /api/realtime/start

Khởi động WebSocket client trên server.

```javascript
app.post('/api/realtime/start', async (req, res) => {
    const { token, userId, pageIds, cookie } = req.body;

    // Start WebSocket connection
    realtimeClient.start(token, userId, pageIds, cookie);

    // Save credentials for auto-reconnect after server restart
    await saveRealtimeCredentials(chatDbPool, 'pancake', { token, userId, pageIds, cookie });

    res.json({
        success: true,
        message: 'Realtime client started (credentials saved for auto-reconnect)'
    });
});
```

#### 3.4.5 Frontend Polling Flow

**File**: `orders-report/js/chat/new-messages-notifier.js`

```javascript
(function() {
    const STORAGE_KEY = 'last_realtime_check';
    const SERVER_URL = 'https://n2store-fallback.onrender.com';
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // Lấy timestamp lần check cuối từ localStorage
    function getLastSeenTimestamp() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return parseInt(stored, 10);
        return Date.now() - (60 * 60 * 1000);  // Default: 1 giờ trước
    }

    // Fetch từ server với fallback
    async function fetchNewMessages(since) {
        const urls = [
            `${SERVER_URL}/api/realtime/summary?since=${since}`,
            `${WORKER_URL}/api/realtime/summary?since=${since}`
        ];

        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    signal: AbortSignal.timeout(10000)
                });
                if (response.ok) return await response.json();
            } catch (error) {
                console.warn(`Failed: ${url}`);
            }
        }
        return null;
    }

    // Highlight rows trong table
    function highlightNewMessagesInTable(items) {
        items.forEach(item => {
            // ⚠️ QUAN TRỌNG: Tìm row bằng data-psid attribute
            const rows = document.querySelectorAll(`tr[data-psid="${item.psid}"]`);

            rows.forEach(row => {
                // Thêm badge "MỚI" vào cột tin nhắn
                const msgCell = row.querySelector('td[data-column="messages"]');
                if (msgCell) addNewBadge(msgCell, count);

                // Highlight row 3 giây
                row.classList.add('product-row-highlight');
                setTimeout(() => row.classList.remove('product-row-highlight'), 3000);
            });
        });
    }

    // Main function
    async function checkNewMessages() {
        const since = getLastSeenTimestamp();
        const currentTimestamp = Date.now();

        console.log(`[NEW-MSG-NOTIFIER] Checking since ${new Date(since).toISOString()}`);

        const summary = await fetchNewMessages(since);

        if (summary?.success && summary.total > 0) {
            // Show toast
            showNotification(summary);

            // Fetch details để highlight
            const details = await fetch(`${SERVER_URL}/api/realtime/new-messages?since=${since}&limit=50`);
            const data = await details.json();
            highlightNewMessagesInTable([...data.messages.items, ...data.comments.items]);

            // Mark as seen trên server
            await markMessagesAsSeen(currentTimestamp);
        }

        // Save timestamp
        localStorage.setItem(STORAGE_KEY, currentTimestamp.toString());
    }

    // Init: Check sau 2 giây khi page load
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(checkNewMessages, 2000);
            });
        } else {
            setTimeout(checkNewMessages, 2000);
        }

        // Check khi user quay lại tab
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                const lastCheck = getLastSeenTimestamp();
                if (Date.now() - lastCheck > 60000) {  // > 1 phút
                    checkNewMessages();
                }
            }
        });
    }

    // Export
    window.newMessagesNotifier = {
        check: checkNewMessages,
        getLastSeen: getLastSeenTimestamp
    };

    init();
})();
```

#### 3.4.6 TROUBLESHOOTING - Lỗi không hiển thị tin nhắn mới

##### Bước 1: Kiểm tra Server Status

```bash
# Kiểm tra server có đang chạy không
curl https://n2store-fallback.onrender.com/health

# Kiểm tra WebSocket client có connected không
curl https://n2store-fallback.onrender.com/api/realtime/status
# Kết quả mong đợi: { "connected": true, "hasToken": true, "pageCount": 5 }
```

##### Bước 2: Kiểm tra Database có data không

```bash
# Kiểm tra có tin nhắn mới trong database không
curl "https://n2store-fallback.onrender.com/api/realtime/summary?since=0"
# Kết quả mong đợi: { "success": true, "total": X, "messages": Y, "comments": Z }
```

##### Bước 3: Debug Frontend

Mở Console trên browser và chạy:

```javascript
// 1. Kiểm tra localStorage timestamp
console.log('Last check:', new Date(parseInt(localStorage.getItem('last_realtime_check'))));

// 2. Reset timestamp để force check lại
localStorage.removeItem('last_realtime_check');
window.newMessagesNotifier.check();

// 3. Kiểm tra table có data-psid attribute không
document.querySelectorAll('tr[data-psid]').length;
// Nếu = 0 → Table không có attribute → Không thể highlight

// 4. Manual fetch để test
fetch('https://n2store-fallback.onrender.com/api/realtime/summary?since=0')
    .then(r => r.json())
    .then(console.log);
```

##### Bước 4: Các lỗi thường gặp

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| `connected: false` | WebSocket bị disconnect, đã hết 10 lần retry | Restart server hoặc gọi `/api/realtime/start` lại |
| `total: 0` | Không có tin nhắn mới HOẶC đã mark seen hết | Gọi `/api/realtime/clear-all?confirm=yes` để reset |
| Không highlight rows | Table thiếu `data-psid` attribute | Kiểm tra `tab1-table.js` render có đúng không |
| Toast không hiện | `notificationManager` chưa load | Kiểm tra script load order |
| `since` timestamp quá mới | localStorage lưu timestamp quá gần | `localStorage.removeItem('last_realtime_check')` |

##### Bước 5: Restart Server WebSocket

Nếu WebSocket bị disconnect và không tự reconnect:

```javascript
// Gọi API để start lại
fetch('https://n2store-fallback.onrender.com/api/realtime/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        token: 'YOUR_PANCAKE_JWT_TOKEN',
        userId: 'YOUR_USER_ID',
        pageIds: ['PAGE_ID_1', 'PAGE_ID_2'],
        cookie: 'jwt=YOUR_JWT_TOKEN'  // Quan trọng!
    })
});
```

Hoặc restart server Render.com từ Dashboard.

##### Bước 6: Kiểm tra Console Logs

Trên browser, filter console với prefix:

- `[NEW-MSG-NOTIFIER]` - Polling logs
- `[REALTIME]` - WebSocket connection logs (nếu dùng realtime-manager.js)

Trên server Render.com logs:

- `[SERVER-WS]` - Pancake WebSocket logs
- `[REALTIME-DB]` - Database save logs

---

## 4. Chat Modal & UI

### 4.1 Mở Chat Modal (`openChatModal`)

**File**: `js/tab1/tab1-chat.js`

```javascript
window.openChatModal = async function(orderId, channelId, psid, type = 'message') {
    // 1. Reset state
    window.currentChatChannelId = channelId;
    window.currentChatPSID = psid;
    currentChatType = type;  // 'message' hoặc 'comment'
    window.allChatMessages = [];
    window.allChatComments = [];

    // 2. Fetch order details từ TPOS
    const orderResponse = await API_CONFIG.smartFetch(
        `https://chatomni-proxy.../api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner`
    );

    // 3. Lưu Facebook data
    window.purchaseFacebookPostId = order.Facebook_PostId;
    window.purchaseCommentId = order.Facebook_CommentId;

    // 4. Setup event listeners
    chatReplyInput.addEventListener('paste', handleChatInputPaste);
    chatReplyInput.addEventListener('keydown', handleChatInputKeyDown);

    // 5. Fetch và render messages
    const response = await window.chatDataManager.fetchMessages(channelId, psid);
    window.allChatMessages = response.messages;
    renderChatMessages(window.allChatMessages, true);

    // 6. Auto mark as read
    autoMarkAsRead(3000);  // Sau 3 giây
};
```

### 4.2 Render Messages (`renderChatMessages`)

**File**: `js/tab1/tab1-chat.js` (line ~4882)

```javascript
function renderChatMessages(messages, scrollToBottom = false) {
    const container = document.getElementById('chatModalBody');

    if (messages.length === 0) {
        container.innerHTML = '<div class="chat-empty">Chưa có tin nhắn</div>';
        return;
    }

    // Sort by timestamp (oldest first)
    const sorted = messages.sort((a, b) => {
        const timeA = new Date(a.inserted_at || a.CreatedTime).getTime();
        const timeB = new Date(b.inserted_at || b.CreatedTime).getTime();
        return timeA - timeB;
    });

    // Render each message
    const html = sorted.map(msg => {
        const isOwner = msg.from?.id === window.currentChatChannelId;
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        // Get avatar
        const avatarUrl = window.pancakeDataManager?.getAvatarUrl(
            msg.from?.id,
            window.currentChatChannelId
        );

        // Handle attachments
        let attachmentsHtml = '';
        if (msg.attachments) {
            msg.attachments.forEach(att => {
                if (att.type === 'photo') {
                    attachmentsHtml += `<img src="${att.url}" class="chat-message-image">`;
                } else if (att.mime_type === 'audio/mp4') {
                    attachmentsHtml += `<audio controls><source src="${att.file_url}"></audio>`;
                }
            });
        }

        return `
            <div class="chat-message ${alignClass}">
                ${!isOwner ? `<img src="${avatarUrl}" class="chat-avatar">` : ''}
                <div class="chat-bubble ${bgClass}">
                    <p>${escapeHtml(msg.message)}</p>
                    ${attachmentsHtml}
                    <span class="chat-time">${formatTimeVN(msg.inserted_at)}</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    if (scrollToBottom) {
        container.scrollTop = container.scrollHeight;
    }
}
```

### 4.3 Message Types Supported

| Type | Source | Attachments |
|------|--------|-------------|
| Text Message | Messenger | - |
| Image | Messenger | `type: 'photo'`, `url` |
| Audio | Messenger | `mime_type: 'audio/mp4'`, `file_url` |
| Sticker | Messenger | `type: 'sticker'`, `sticker_id` |
| GIF | Messenger | `type: 'animated_image_share'` |
| Reply Quote | Messenger | `replied_message` object |
| Comment | Facebook Post | Text + attachments |

### 4.4 Mark Read/Unread

```javascript
// Auto mark as read khi mở chat
function autoMarkAsRead(delayMs = 3000) {
    markReadTimer = setTimeout(async () => {
        const { pageId, conversationId, isRead } = window.currentConversationReadState;

        if (!isRead) {
            const success = await window.pancakeDataManager.markConversationAsRead(pageId, conversationId);
            if (success) {
                updateReadBadge(true);
                updateMarkButton(true);
                renderTable();  // Refresh table UI
            }
        }
    }, delayMs);
}

// Toggle read/unread
window.toggleConversationReadState = async function() {
    const { isRead, pageId, conversationId } = window.currentConversationReadState;

    if (isRead) {
        await window.pancakeDataManager.markConversationAsUnread(pageId, conversationId);
    } else {
        await window.pancakeDataManager.markConversationAsRead(pageId, conversationId);
    }

    // Update UI
    updateReadBadge(!isRead);
    updateMarkButton(!isRead);
};
```

### 4.5 UI Components

```
┌─────────────────────────────────────────────────────────────┐
│  Chat Modal Header                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ [Avatar] Tên KH        [Mark Read] [Toggle INBOX/COMMENT]││
│  │ SĐT: 0912345678        [✓ Đã đọc]                       ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  Chat Body (scrollable)                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  [Customer Message]                                      ││
│  │         ┌─────────────────┐                              ││
│  │  [Ava]  │ Chào shop      │                              ││
│  │         │ 14:30          │                              ││
│  │         └─────────────────┘                              ││
│  │                                                          ││
│  │                          [Owner Message]                 ││
│  │                          ┌─────────────────┐             ││
│  │                          │ Chào chị ạ 😊  │             ││
│  │                          │ 14:32          │             ││
│  │                          └─────────────────┘             ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  Input Area                                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ [📎] [📷] [Nhập tin nhắn...              ] [Quick] [📤]││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Reply Type: [Messenger ✓] [Private Reply]               ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Pancake API Integration

### 5.1 API Base URLs

```javascript
// Pancake Official API (pages.fm)
const PANCAKE_BASE = 'https://pages.fm/api/v1';

// Qua proxy để tránh CORS
const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
```

### 5.2 Main Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `pages/{pageId}/conversations` | GET | Lấy danh sách conversations |
| `pages/{pageId}/conversations/{convId}/messages` | GET | Lấy messages của conversation |
| `pages/{pageId}/conversations/{convId}/messages` | POST | Gửi tin nhắn |
| `pages/{pageId}/conversations/{convId}/read` | POST | Đánh dấu đã đọc |
| `pages/{pageId}/conversations/{convId}/unread` | POST | Đánh dấu chưa đọc |
| `pages/{pageId}/images` | POST | Upload ảnh |

### 5.3 Authentication

```javascript
// Lấy page access token
const pageAccessToken = await window.pancakeTokenManager.getOrGeneratePageAccessToken(pageId);

// API call với token
const url = `${PANCAKE_BASE}/pages/${pageId}/conversations/${convId}/messages?page_access_token=${pageAccessToken}`;
```

### 5.4 Send Message Actions

#### 5.4.1 Reply Inbox (Messenger)

```javascript
// Gửi tin nhắn qua Messenger
const payload = {
    action: 'reply_inbox',
    message: 'Nội dung tin nhắn',
    content_ids: ['abc123']  // Optional: IDs của ảnh đã upload
};

await API_CONFIG.smartFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});
```

#### 5.4.2 Reply Comment (Public)

```javascript
// Reply công khai trên post
const payload = {
    action: 'reply_comment',
    message_id: commentId,  // ID comment cần reply
    message: 'Nội dung reply'
};
```

#### 5.4.3 Private Replies (từ Comment)

```javascript
// Gửi tin nhắn riêng từ comment
const payload = {
    action: 'private_replies',
    post_id: `${pageId}_${postId}`,
    message_id: commentId,
    from_id: psid,  // Customer PSID
    message: 'Nội dung tin nhắn riêng'
};
```

### 5.5 Upload Image

```javascript
// Upload ảnh lên Pancake
async function uploadImage(pageId, blob) {
    const formData = new FormData();
    formData.append('file', blob, 'image.jpg');

    const token = await pancakeTokenManager.getOrGeneratePageAccessToken(pageId);
    const url = `${PANCAKE_BASE}/pages/${pageId}/images?page_access_token=${token}`;

    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });

    const result = await response.json();
    return {
        content_id: result.content_id,
        content_url: result.content_url
    };
}
```

### 5.6 Error Handling

```javascript
// 24h Policy Error (Messenger)
if (result.e_code === 10 && result.e_subcode === 2018278) {
    // Không thể gửi tin nhắn sau 24h
    notificationManager.warning('⚠️ Không thể gửi (quá 24h). Vui lòng dùng COMMENT!');
}

// User Unavailable (551)
if (result.e_code === 551) {
    // User đã block hoặc không tồn tại
    notificationManager.warning('⚠️ Người dùng không có mặt. Vui lòng dùng COMMENT!');
}
```

---

## 6. Firebase Integration

### 6.1 Configuration

**File**: `shared/browser/firebase-config.js`

```javascript
const FIREBASE_CONFIG = {
    apiKey: "...",
    authDomain: "...",
    projectId: "n2store-...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};

// Initialize
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();
const database = firebase.database();
```

### 6.2 Quick Replies (Firestore)

**Collection**: `quickReplies`

```javascript
// Load quick replies
async function loadReplies() {
    const snapshot = await db.collection('quickReplies')
        .orderBy('id', 'asc')
        .get();

    return snapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
    }));
}

// Save quick replies (batch write)
async function saveReplies(replies) {
    const batch = db.batch();

    // Delete all existing
    const existing = await db.collection('quickReplies').get();
    existing.docs.forEach(doc => batch.delete(doc.ref));

    // Add new
    replies.forEach(reply => {
        const ref = db.collection('quickReplies').doc();
        batch.set(ref, reply);
    });

    await batch.commit();
}
```

**Quick Reply Document Structure**:

```javascript
{
    id: 1,
    shortcut: 'CAMON',           // Ký tự tắt (VD: /CAMON)
    topic: 'C.ƠN KH',            // Chủ đề
    topicColor: '#cec40c',       // Màu hiển thị
    message: 'Dạ cám ơn...',     // Nội dung tin nhắn
    imageUrl: 'https://...'      // Optional: URL ảnh đính kèm
}
```

### 6.3 Held Products (Realtime Database)

**Path**: `order_products/shared/{orderId}`

```javascript
// Listen for held products changes
function setupHeldProductsListener(orderId) {
    const ref = database.ref(`order_products/shared/${orderId}`);

    ref.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            updateHeldProductsUI(data);
        }
    });

    return () => ref.off();  // Cleanup function
}

// Hold a product
async function holdProduct(orderId, productId, userId) {
    await database.ref(`order_products/shared/${orderId}/${productId}`).set({
        heldBy: userId,
        heldAt: Date.now()
    });
}
```

### 6.4 Image Cache (Firestore)

**File**: `js/utils/firebase-image-cache.js`

```javascript
// Cache image content_id để tránh upload lại
const imageCache = firebase.firestore().collection('imageCache');

async function uploadImageWithCache(channelId, blob) {
    // 1. Tạo hash từ blob
    const hash = await calculateHash(blob);

    // 2. Check cache
    const cached = await imageCache.doc(hash).get();
    if (cached.exists) {
        return cached.data();  // { content_id, content_url }
    }

    // 3. Upload nếu chưa có
    const result = await pancakeDataManager.uploadImage(channelId, blob);

    // 4. Save to cache
    await imageCache.doc(hash).set(result);

    return result;
}
```

---

## 7. Global Variables & State

### 7.1 Core Managers

```javascript
// PancakeDataManager - Quản lý conversations & messages
window.chatDataManager      // Alias
window.pancakeDataManager   // Main instance

// Methods:
// - fetchConversations(force, channelIds)
// - fetchMessages(channelId, psid, cursor)
// - fetchComments(channelId, psid, cursor, postId, customerName)
// - getLastMessageForOrder(order)
// - getLastCommentForOrder(channelId, psid, postId)
// - markConversationAsRead(pageId, conversationId)
// - markConversationAsUnread(pageId, conversationId)
// - getAvatarUrl(userId, pageId, token, directUrl)
// - uploadImage(channelId, blob)
```

### 7.2 Current Chat State

```javascript
// Page & Customer identifiers
window.currentChatChannelId     // Page ID đang view (string)
window.currentChatPSID          // Customer PSID (string)
window.currentRealFacebookPSID  // Real Facebook PSID for Graph API
window.currentConversationId    // Conversation ID for API calls
window.currentCustomerUUID      // Customer UUID from Pancake

// Messages & Comments data
window.allChatMessages          // Array of current messages
window.allChatComments          // Array of current comments

// Order data
window.currentChatOrderData     // Full order object
window.purchaseFacebookPostId   // Post ID của comment đặt hàng
window.purchaseCommentId        // Comment ID đặt hàng
window.purchaseFacebookASUserId // AS User ID

// Read state
window.currentConversationReadState = {
    isRead: boolean,
    conversationId: string,
    pageId: string,
    lastMarkedAt: number,
    chatType: 'message' | 'comment'
};

// Send settings
window.currentSendPageId        // Page ID để gửi tin (có thể khác view)
window.allMatchingConversations // Tất cả conversations matching
window.availableChatPages       // Danh sách pages available
```

### 7.3 Quick Reply Manager

```javascript
window.quickReplyManager        // QuickReplyManager instance

// Methods:
// - openModal(targetInputId)   - Mở modal chọn quick reply
// - closeModal()
// - selectReply(replyId)       - Chọn và insert reply
// - sendQuickReplyWithImage(imageUrl, message)  - Gửi trực tiếp
// - openSettings()             - Mở settings để CRUD templates

// Autocomplete: Gõ /shortcut trong chat input
// VD: /CAMON → auto-send image + text
```

### 7.4 New Messages Notifier

```javascript
window.newMessagesNotifier = {
    check: checkNewMessages,      // Manual trigger check
    getLastSeen: getLastSeenTimestamp,
    saveTimestamp: saveCurrentTimestamp
};
```

---

## 8. Code Examples

### 8.1 Mở Chat Modal từ Table Click

```javascript
// Trong tab1-table.js - renderMessagesColumn()
function renderMessagesColumn(order) {
    const chatInfo = window.chatDataManager.getLastMessageForOrder(order);
    const channelId = order.Facebook_PageId;
    const psid = order.Facebook_ASUID;

    return `
        <td data-column="messages"
            onclick="openChatModal('${order.Id}', '${channelId}', '${psid}', 'message')"
            style="cursor: pointer;">
            ${formatMessagePreview(chatInfo)}
        </td>
    `;
}
```

### 8.2 Gửi Tin Nhắn Thường

```javascript
async function sendMessage() {
    const input = document.getElementById('chatReplyInput');
    const message = input.value.trim();

    if (!message) return;

    const channelId = window.currentSendPageId || window.currentChatChannelId;
    const conversationId = window.currentConversationId;

    // Get token
    const token = await window.pancakeTokenManager.getOrGeneratePageAccessToken(channelId);

    // Build URL
    const url = `https://pages.fm/api/v1/pages/${channelId}/conversations/${conversationId}/messages?page_access_token=${token}`;

    // Send
    const response = await API_CONFIG.smartFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'reply_inbox',
            message: message
        })
    });

    if (response.ok) {
        input.value = '';
        // Refresh messages
        await refreshChatMessages();
    }
}
```

### 8.3 Gửi Tin Nhắn với Ảnh

```javascript
async function sendImageWithText(imageBlob, text) {
    const channelId = window.currentChatChannelId;

    // 1. Upload image
    const uploadResult = await window.pancakeDataManager.uploadImage(channelId, imageBlob);

    // 2. Send message with content_ids
    const payload = {
        action: 'reply_inbox',
        message: text,
        content_ids: [uploadResult.content_id]
    };

    await sendMessagePayload(payload);
}
```

### 8.4 Sử dụng Quick Reply

```javascript
// Cách 1: Mở modal
document.getElementById('quickReplyBtn').onclick = () => {
    window.quickReplyManager.openModal('chatReplyInput');
};

// Cách 2: Autocomplete trong input
// Gõ "/CAMON" rồi Enter hoặc chọn từ dropdown
// System sẽ tự động:
// 1. Clear input
// 2. Gửi ảnh (nếu có)
// 3. Gửi text

// Cách 3: Direct send
window.quickReplyManager.sendQuickReplyWithImage(
    'https://content.pancake.vn/...',
    'Cám ơn chị yêu đã ủng hộ shop ạ ❤️'
);
```

### 8.5 Listen cho Realtime Updates

```javascript
// Setup listener cho realtime message updates
window.addEventListener('realtimeConversationUpdate', (event) => {
    const { conversationId, newMessages } = event.detail;

    if (conversationId === window.currentConversationId) {
        // Append new messages
        window.allChatMessages.push(...newMessages);
        renderChatMessages(window.allChatMessages, true);
    }
});
```

---

## 9. Troubleshooting & Debug

### 9.1 Console Log Prefixes

Mỗi module có prefix riêng để dễ filter:

| Prefix | Module | Ví dụ |
|--------|--------|-------|
| `[CHAT]` | tab1-chat.js | `[CHAT] Opening modal: {...}` |
| `[COMMENT MODAL]` | comment-modal.js | `[COMMENT MODAL] Reply to comment: ...` |
| `[QUICK-REPLY]` | quick-reply-manager.js | `[QUICK-REPLY] 🚀 Sending image...` |
| `[NEW-MSG-NOTIFIER]` | new-messages-notifier.js | `[NEW-MSG-NOTIFIER] Checking messages since...` |
| `[CONVERSATIONS]` | tab1-chat.js | `[CONVERSATIONS] Fetching for X channels` |
| `[MARK-READ]` | tab1-chat.js | `[MARK-READ] Auto marking as read...` |

### 9.2 Common Issues

#### Issue 1: Token Expired

**Triệu chứng**: API trả về 401 hoặc "Invalid token"

**Fix**:
```javascript
// Clear cached token
localStorage.removeItem('pancake_page_tokens');
// Hoặc regenerate
await window.pancakeTokenManager.getOrGeneratePageAccessToken(pageId, true);  // force=true
```

#### Issue 2: 24h Policy Error

**Triệu chứng**:
```json
{ "e_code": 10, "e_subcode": 2018278, "message": "khoảng thời gian cho phép" }
```

**Giải thích**: Facebook chỉ cho phép gửi tin nhắn Messenger trong vòng 24h kể từ tin nhắn cuối của khách.

**Fix**: Dùng Comment (public hoặc private reply) thay vì Messenger.

#### Issue 3: User Unavailable (551)

**Triệu chứng**:
```json
{ "e_code": 551, "message": "không có mặt" }
```

**Giải thích**: User đã block page hoặc không tồn tại.

**Fix**: Không thể gửi tin nhắn cho user này.

#### Issue 4: Messages không hiển thị

**Checklist**:
1. Check `window.chatDataManager` có tồn tại không
2. Check `window.currentChatChannelId` và `window.currentChatPSID` có giá trị
3. Check Network tab xem API có lỗi không
4. Check Console cho errors

```javascript
// Debug helper
console.log({
    chatDataManager: !!window.chatDataManager,
    channelId: window.currentChatChannelId,
    psid: window.currentChatPSID,
    messages: window.allChatMessages?.length
});
```

#### Issue 5: Quick Reply không hoạt động

**Checklist**:
1. Firebase đã init chưa: `typeof firebase !== 'undefined'`
2. Quick replies đã load: `window.quickReplyManager.replies.length`
3. Autocomplete listener attached: Check `chatReplyInput` có event listeners

### 9.3 Debug Commands

Chạy trong Console để debug:

```javascript
// Check chat state
console.table({
    channelId: window.currentChatChannelId,
    psid: window.currentChatPSID,
    conversationId: window.currentConversationId,
    messagesCount: window.allChatMessages?.length,
    commentsCount: window.allChatComments?.length,
    readState: window.currentConversationReadState
});

// Force refresh messages
await window.chatDataManager.fetchMessages(
    window.currentChatChannelId,
    window.currentChatPSID
);

// Check new messages manually
await window.newMessagesNotifier.check();

// List quick replies
console.table(window.quickReplyManager.replies);

// Check token
const token = await window.pancakeTokenManager.getOrGeneratePageAccessToken('PAGE_ID');
console.log('Token:', token?.substring(0, 20) + '...');
```

---

## Appendix: Related Files

| File Path | Description |
|-----------|-------------|
| `orders-report/tab1-orders.html` | Main HTML, loads all chat scripts |
| `orders-report/css/tab1-chat-modal.css` | Chat modal styles |
| `orders-report/css/quick-reply-modal.css` | Quick reply styles |
| `shared/browser/firebase-config.js` | Firebase configuration |
| `shared/js/notification-system.js` | Toast notifications |

---

*Tài liệu này được tạo để hỗ trợ development và maintenance của hệ thống messaging trong module orders-report.*
