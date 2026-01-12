# Hướng dẫn Realtime WebSocket Auto-Connect

## Tổng quan

Server Render.com có tính năng **tự động kết nối lại WebSocket** khi server restart, đảm bảo không bị mất tin nhắn realtime.

## Cách hoạt động

```
┌─────────────────────────────────────────────────────────────────┐
│  LẦN ĐẦU TIÊN                                                   │
│  ─────────────────                                              │
│  1. User mở web → Frontend gọi POST /api/realtime/start         │
│  2. Server kết nối WebSocket tới Pancake.vn                     │
│  3. Credentials được LƯU vào PostgreSQL                         │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CÁC LẦN SAU (Server restart, deploy mới, etc.)                 │
│  ───────────────────────────────────────────────────────────────│
│  1. Server khởi động                                            │
│  2. Đợi 3 giây để DB sẵn sàng                                   │
│  3. Load credentials từ bảng realtime_credentials               │
│  4. Tự động kết nối WebSocket (không cần user truy cập)         │
└─────────────────────────────────────────────────────────────────┘
```

## Cài đặt ban đầu

### 1. Chạy Migration

Trên Render.com Dashboard → PostgreSQL → Connect → chạy SQL:

```sql
-- File: render.com/migrations/create_realtime_credentials.sql

CREATE TABLE IF NOT EXISTS realtime_credentials (
    id SERIAL PRIMARY KEY,
    client_type VARCHAR(20) NOT NULL UNIQUE CHECK (client_type IN ('pancake', 'tpos')),
    token TEXT NOT NULL,
    user_id VARCHAR(50),
    page_ids TEXT,
    cookie TEXT,
    room VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_realtime_credentials_type
ON realtime_credentials(client_type);
```

### 2. Kích hoạt lần đầu

Mở web app và đăng nhập bình thường. Frontend sẽ tự động gọi `/api/realtime/start` và credentials sẽ được lưu.

## API Endpoints

### Pancake WebSocket

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/realtime/start` | Kết nối + lưu credentials |
| `POST` | `/api/realtime/stop` | Ngắt kết nối + tắt auto-connect |
| `GET` | `/api/realtime/status` | Kiểm tra trạng thái |

### TPOS WebSocket

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/realtime/tpos/start` | Kết nối + lưu credentials |
| `POST` | `/api/realtime/tpos/stop` | Ngắt kết nối + tắt auto-connect |
| `GET` | `/api/realtime/tpos/status` | Kiểm tra trạng thái |

## Kiểm tra trạng thái

### Qua API

```bash
# Pancake status
curl https://your-app.onrender.com/api/realtime/status

# Response:
{
  "connected": true,
  "hasToken": true,
  "userId": "12345",
  "pageCount": 3
}
```

```bash
# TPOS status
curl https://your-app.onrender.com/api/realtime/tpos/status

# Response:
{
  "connected": true,
  "room": "tomato.tpos.vn",
  "hasToken": true,
  "reconnectAttempts": 0
}
```

### Qua Database

```sql
SELECT client_type, is_active, updated_at
FROM realtime_credentials;
```

## Xử lý sự cố

### WebSocket không tự động kết nối

1. **Kiểm tra bảng credentials:**
   ```sql
   SELECT * FROM realtime_credentials WHERE is_active = TRUE;
   ```

2. **Kiểm tra logs trên Render:**
   ```
   [AUTO-CONNECT] Checking for saved credentials...
   [AUTO-CONNECT] Starting Pancake client with 3 pages...
   [SERVER-WS] Connected
   ```

3. **Nếu không có credentials:**
   - Mở web app và đăng nhập lại
   - Hoặc chèn thủ công vào database

### Token hết hạn

Pancake token có thể hết hạn. Khi đó:

1. WebSocket sẽ bị disconnect
2. User cần đăng nhập lại web app
3. Credentials mới sẽ được cập nhật tự động

### Tắt auto-connect

```bash
# Tắt Pancake
curl -X POST https://your-app.onrender.com/api/realtime/stop

# Tắt TPOS
curl -X POST https://your-app.onrender.com/api/realtime/tpos/stop
```

Hoặc trong database:
```sql
UPDATE realtime_credentials SET is_active = FALSE;
```

## Lưu ý quan trọng

### Render.com Free Tier

- Server sẽ **sleep sau 15 phút** không có request
- Khi có request mới → server wake up → auto-connect chạy
- Để server luôn online, cần upgrade lên paid plan hoặc dùng cron job ping

### Giữ server luôn online (Free Tier)

Dùng dịch vụ bên ngoài để ping server mỗi 10-14 phút:

1. **UptimeRobot** (miễn phí): https://uptimerobot.com
   - Tạo monitor HTTP(s)
   - URL: `https://your-app.onrender.com/health`
   - Interval: 5 phút

2. **Cron-job.org** (miễn phí): https://cron-job.org
   - URL: `https://your-app.onrender.com/health`
   - Schedule: Every 10 minutes

3. **GitHub Actions** (miễn phí):
   ```yaml
   # .github/workflows/keep-alive.yml
   name: Keep Render Alive
   on:
     schedule:
       - cron: '*/10 * * * *'  # Mỗi 10 phút
   jobs:
     ping:
       runs-on: ubuntu-latest
       steps:
         - run: curl https://your-app.onrender.com/health
   ```

### Bảo mật

- Token được lưu trong database, không expose ra ngoài
- Chỉ lưu các thông tin cần thiết cho kết nối
- Không log token trong console

## Cấu trúc Database

```
realtime_credentials
├── id              SERIAL PRIMARY KEY
├── client_type     VARCHAR(20)    -- 'pancake' hoặc 'tpos'
├── token           TEXT           -- Access token
├── user_id         VARCHAR(50)    -- User ID (Pancake)
├── page_ids        TEXT           -- JSON array của page IDs
├── cookie          TEXT           -- Cookie (optional)
├── room            VARCHAR(100)   -- Room name (TPOS)
├── is_active       BOOLEAN        -- TRUE = auto-connect
└── updated_at      TIMESTAMP      -- Lần cập nhật cuối
```

## Timeline hoạt động

```
00:00 - Server start
00:03 - autoConnectRealtimeClients() chạy
00:03 - Load credentials từ DB
00:03 - Pancake WebSocket connecting...
00:04 - Pancake WebSocket connected
00:04 - Join channels (users, multiple_pages)
00:05 - TPOS WebSocket connecting...
00:06 - TPOS WebSocket connected
00:06 - Join room tomato.tpos.vn
       ... Server đang lắng nghe tin nhắn ...
```

## Logs mẫu

```
==================================================
🚀 N2Store API Fallback Server
==================================================
📍 Running on port: 3000
🌐 Environment: production
⏰ Started at: 2025-12-26T10:00:00.000Z
==================================================
[DATABASE] PostgreSQL connected successfully
[AUTO-CONNECT] Checking for saved credentials...
[AUTO-CONNECT] Starting Pancake client with 3 pages...
[AUTO-CONNECT] Starting TPOS client for room: tomato.tpos.vn...
[SERVER-WS] Connecting to Pancake...
[TPOS-WS] Connecting to TPOS... (attempt 1)
[SERVER-WS] Connected
[TPOS-WS] Namespace connected, joining room: tomato.tpos.vn
[TPOS-WS] Joined room: tomato.tpos.vn
```
