# 🚀 Backend API Server (Render.com)

Express.js server deployed on **Render.com** as API backend cho N2Store.

## 📋 API Endpoints

### Health & Status
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/health` | Kiểm tra server status |

### Authentication
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/token` | Lấy access token từ TPOS |

### Data APIs
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/odata/*` | Proxy TPOS OData API |
| `GET` | `/api/api-ms/chatomni/*` | Proxy ChatOmni API |
| `GET` | `/api/pancake/*` | Proxy Pancake.vn API |
| `GET` | `/api/image-proxy?url=<url>` | Proxy image requests |

### Realtime WebSocket
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/realtime/start` | Kết nối Pancake WebSocket |
| `POST` | `/api/realtime/stop` | Ngắt Pancake WebSocket |
| `GET` | `/api/realtime/status` | Status Pancake WebSocket |
| `POST` | `/api/realtime/tpos/start` | Kết nối TPOS WebSocket |
| `POST` | `/api/realtime/tpos/stop` | Ngắt TPOS WebSocket |
| `GET` | `/api/realtime/tpos/status` | Status TPOS WebSocket |

### Database APIs
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/sepay/webhook` | SePay webhook handler |
| `GET` | `/api/sepay/transactions` | Lấy lịch sử giao dịch |
| `GET/POST` | `/api/customers/*` | Customer management |

### AI APIs
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/gemini/chat` | Gemini AI chat |
| `POST` | `/api/deepseek/chat` | DeepSeek AI chat |

---

## 🔧 Smart Fetch (Fallback System)

Frontend sử dụng `smartFetch` để tự động chuyển sang Render.com khi Cloudflare Worker fail.

### Cách sử dụng

```javascript
// Thay vì dùng fetch() thông thường
const response = await API_CONFIG.smartFetch(url, options);
```

### Kiểm tra status

```javascript
const status = API_CONFIG.getStatus();
// { primary: "...", fallback: "...", current: "...", isFallbackActive: false }
```

---

## 📊 Database Patterns

### Kết nối Database

```javascript
router.get('/endpoint', async (req, res) => {
    const db = req.app.locals.chatDb;  // ✅ Sử dụng cách này
    const result = await db.query('SELECT * FROM table');
    res.json({ success: true, data: result.rows });
});
```

### Atomic Insert (ON CONFLICT)

```javascript
const insertQuery = `
    INSERT INTO table (field1, field2)
    VALUES ($1, $2)
    ON CONFLICT (unique_field) DO NOTHING
    RETURNING id
`;
```

---

## 🔌 Realtime WebSocket

Server tự động kết nối lại WebSocket sau restart:

1. User đăng nhập → Frontend gọi `/api/realtime/start`
2. Server lưu credentials vào PostgreSQL
3. Khi server restart → Load credentials và auto-connect

### Kiểm tra trạng thái

```bash
curl https://n2store-realtime.onrender.com/api/realtime/status
curl https://n2store-realtime.onrender.com/api/realtime/tpos/status
```

---

## 📁 Routes Structure

| File | Chức năng |
|------|-----------|
| `token.js` | Xử lý authentication token |
| `odata.js` | Proxy TPOS OData requests |
| `pancake.js` | Proxy Pancake.vn requests |
| `realtime.js` | WebSocket realtime handlers |
| `sepay-webhook.js` | SePay webhook & transactions |
| `customers.js` | Customer CRUD operations |
| `gemini.js` | Google Gemini AI integration |
| `deepseek.js` | DeepSeek AI integration |
| `telegram-bot.js` | Telegram bot handlers |
| `image-proxy.js` | Image proxy để bypass CORS |

---

## ⚠️ Lưu ý quan trọng

### Free Tier limitations
- Server sleep sau **15 phút** không có request
- Cold start: **30-60 giây** cho request đầu tiên

### Giữ server luôn online
Dùng UptimeRobot hoặc Cron-job.org ping `/health` mỗi 10 phút.

---

## 🔗 Links

- **Primary**: `https://chatomni-proxy.nhijudyshop.workers.dev`
- **Fallback**: `https://n2store-api-fallback.onrender.com`
- **Source**: [render.com/](https://github.com/nhijudyshop/n2store/tree/main/render.com)

---

**Last Updated**: 2026-01-02
