# Hướng Dẫn Chuyển Firebase Realtime Database sang Render với SSE

## Tổng Quan

Hướng dẫn này mô tả chi tiết cách migrate từ **Firebase Realtime Database** sang **Render backend** sử dụng:
- **PostgreSQL** để lưu trữ data
- **REST API** cho CRUD operations  
- **Server-Sent Events (SSE)** cho realtime sync

---

## Mục Lục

1. [Kiến Trúc Mới](#1-kiến-trúc-mới)
2. [Backend: Tạo Database Schema](#2-backend-tạo-database-schema)
3. [Backend: Tạo REST API](#3-backend-tạo-rest-api)
4. [Backend: Implement SSE](#4-backend-implement-sse)
5. [Frontend: Migrate từ Firebase](#5-frontend-migrate-từ-firebase)
6. [Testing & Verification](#6-testing--verification)

---

## 1. Kiến Trúc Mới

### So Sánh Firebase vs SSE

```
┌─────────────────────────────────────────────────────────────────┐
│                     FIREBASE (HIỆN TẠI)                         │
├─────────────────────────────────────────────────────────────────┤
│  Browser ←──WebSocket──→ Firebase Realtime Database             │
│           (tự động sync)                                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     RENDER + SSE (MỚI)                          │
├─────────────────────────────────────────────────────────────────┤
│  Browser ←────SSE────→ Render Server ←──→ PostgreSQL            │
│           (long-lived HTTP connection)                          │
└─────────────────────────────────────────────────────────────────┘
```

### SSE là gì?

**Server-Sent Events** là một công nghệ cho phép server gửi data đến client thông qua một HTTP connection lâu dài (long-lived).

| Đặc điểm | Firebase WebSocket | SSE |
|----------|-------------------|-----|
| Hướng giao tiếp | Hai chiều | Một chiều (server → client) |
| Độ phức tạp | Cao | Trung bình |
| Browser support | Cần library | Native (EventSource API) |
| Reconnect tự động | Có | Có |

---

## 2. Backend: Tạo Database Schema

### File: `render.com/migrations/realtime_data.sql`

```sql
-- =====================================================
-- REALTIME DATA MIGRATION
-- Thay thế Firebase Realtime Database
-- =====================================================

-- 1. Bảng chung cho key-value data (tokens, settings, etc.)
CREATE TABLE IF NOT EXISTS realtime_kv (
    key VARCHAR(500) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_realtime_kv_updated ON realtime_kv(updated_at);

-- 2. KPI Base data
CREATE TABLE IF NOT EXISTS kpi_base (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255) NOT NULL UNIQUE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. KPI Statistics
CREATE TABLE IF NOT EXISTS kpi_statistics (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255) NOT NULL UNIQUE,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Held Products (sản phẩm đang được giữ)
CREATE TABLE IF NOT EXISTS held_products (
    order_id VARCHAR(255) NOT NULL,
    product_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    is_draft BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id, product_id, user_id)
);

CREATE INDEX idx_held_products_order ON held_products(order_id);

-- 5. Report Order Details
CREATE TABLE IF NOT EXISTS report_order_details (
    table_name VARCHAR(255) PRIMARY KEY,
    orders JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Soluong Products (Inventory)
CREATE TABLE IF NOT EXISTS soluong_products (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Soluong Metadata
CREATE TABLE IF NOT EXISTS soluong_meta (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL
);

-- Function để update timestamp tự động
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_realtime_kv_timestamp
    BEFORE UPDATE ON realtime_kv
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_held_products_timestamp
    BEFORE UPDATE ON held_products
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

### Chạy Migration

```bash
# Kết nối và chạy migration
psql $DATABASE_URL -f render.com/migrations/realtime_data.sql
```

---

## 3. Backend: Tạo REST API

### File: `render.com/routes/realtime-db.js`

```javascript
const express = require('express');
const router = express.Router();

// =====================================================
// REALTIME KEY-VALUE API
// Thay thế firebase.database().ref('key')
// =====================================================

/**
 * GET /api/realtime/kv/:key
 * Thay thế: firebase.database().ref(key).once('value')
 */
router.get('/kv/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const pool = req.app.get('chatDbPool');
        
        const result = await pool.query(
            'SELECT value FROM realtime_kv WHERE key = $1',
            [key]
        );
        
        if (result.rows.length === 0) {
            return res.json({ exists: false, value: null });
        }
        
        res.json({ exists: true, value: result.rows[0].value });
    } catch (error) {
        console.error('[REALTIME-DB] GET error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/kv/:key
 * Thay thế: firebase.database().ref(key).set(value)
 */
router.put('/kv/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        const pool = req.app.get('chatDbPool');
        
        await pool.query(`
            INSERT INTO realtime_kv (key, value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
                value = $2,
                updated_at = CURRENT_TIMESTAMP
        `, [key, JSON.stringify(value)]);
        
        // Notify SSE clients
        notifyClients(key, value);
        
        res.json({ success: true });
    } catch (error) {
        console.error('[REALTIME-DB] PUT error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/kv/:key
 * Thay thế: firebase.database().ref(key).remove()
 */
router.delete('/kv/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const pool = req.app.get('chatDbPool');
        
        await pool.query('DELETE FROM realtime_kv WHERE key = $1', [key]);
        
        // Notify SSE clients
        notifyClients(key, null, 'deleted');
        
        res.json({ success: true });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// HELD PRODUCTS API
// =====================================================

/**
 * GET /api/realtime/held-products/:orderId
 * Thay thế: firebase.database().ref(`held_products/${orderId}`).once('value')
 */
router.get('/held-products/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const pool = req.app.get('chatDbPool');
        
        const result = await pool.query(
            'SELECT product_id, user_id, data, is_draft FROM held_products WHERE order_id = $1',
            [orderId]
        );
        
        // Convert to Firebase-like structure
        const heldProducts = {};
        result.rows.forEach(row => {
            if (!heldProducts[row.product_id]) {
                heldProducts[row.product_id] = {};
            }
            heldProducts[row.product_id][row.user_id] = {
                ...row.data,
                isDraft: row.is_draft
            };
        });
        
        res.json(heldProducts);
    } catch (error) {
        console.error('[REALTIME-DB] GET held-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/realtime/held-products/:orderId/:productId/:userId
 * Thay thế: firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`).set(data)
 */
router.put('/held-products/:orderId/:productId/:userId', async (req, res) => {
    try {
        const { orderId, productId, userId } = req.params;
        const data = req.body;
        const pool = req.app.get('chatDbPool');
        
        await pool.query(`
            INSERT INTO held_products (order_id, product_id, user_id, data, is_draft)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (order_id, product_id, user_id) DO UPDATE SET
                data = $4,
                is_draft = $5,
                updated_at = CURRENT_TIMESTAMP
        `, [orderId, productId, userId, JSON.stringify(data), data.isDraft || false]);
        
        // Notify SSE clients watching this order
        notifyClients(`held_products/${orderId}`, { productId, userId, data });
        
        res.json({ success: true });
    } catch (error) {
        console.error('[REALTIME-DB] PUT held-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/realtime/held-products/:orderId/:productId/:userId
 */
router.delete('/held-products/:orderId/:productId/:userId', async (req, res) => {
    try {
        const { orderId, productId, userId } = req.params;
        const pool = req.app.get('chatDbPool');
        
        await pool.query(
            'DELETE FROM held_products WHERE order_id = $1 AND product_id = $2 AND user_id = $3',
            [orderId, productId, userId]
        );
        
        notifyClients(`held_products/${orderId}`, { productId, userId, deleted: true });
        
        res.json({ success: true });
    } catch (error) {
        console.error('[REALTIME-DB] DELETE held-products error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// KPI API
// =====================================================

router.get('/kpi-base/:campaign', async (req, res) => {
    try {
        const { campaign } = req.params;
        const pool = req.app.get('chatDbPool');
        
        const result = await pool.query(
            'SELECT data FROM kpi_base WHERE campaign_name = $1',
            [campaign]
        );
        
        res.json(result.rows[0]?.data || null);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/kpi-base/:campaign', async (req, res) => {
    try {
        const { campaign } = req.params;
        const data = req.body;
        const pool = req.app.get('chatDbPool');
        
        await pool.query(`
            INSERT INTO kpi_base (campaign_name, data)
            VALUES ($1, $2)
            ON CONFLICT (campaign_name) DO UPDATE SET
                data = $2,
                updated_at = CURRENT_TIMESTAMP
        `, [campaign, JSON.stringify(data)]);
        
        notifyClients(`kpi_base/${campaign}`, data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
```

---

## 4. Backend: Implement SSE

### File: `render.com/routes/realtime-sse.js`

```javascript
const express = require('express');
const router = express.Router();

// Store connected SSE clients
const sseClients = new Map(); // key -> Set of response objects

/**
 * SSE endpoint for realtime updates
 * Client connects to: /api/realtime/sse?keys=key1,key2,key3
 * 
 * Thay thế: firebase.database().ref(key).on('value', callback)
 */
router.get('/sse', (req, res) => {
    // Parse keys to subscribe to
    const keysParam = req.query.keys || '';
    const keys = keysParam.split(',').filter(k => k.trim());
    
    if (keys.length === 0) {
        return res.status(400).json({ error: 'No keys specified' });
    }
    
    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send initial connection message
    res.write(`event: connected\ndata: ${JSON.stringify({ keys })}\n\n`);
    
    // Register this client for each key
    keys.forEach(key => {
        if (!sseClients.has(key)) {
            sseClients.set(key, new Set());
        }
        sseClients.get(key).add(res);
    });
    
    console.log(`[SSE] Client connected, watching: ${keys.join(', ')}`);
    
    // Heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(`:heartbeat\n\n`);
    }, 30000);
    
    // Cleanup on disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        keys.forEach(key => {
            const clients = sseClients.get(key);
            if (clients) {
                clients.delete(res);
                if (clients.size === 0) {
                    sseClients.delete(key);
                }
            }
        });
        console.log(`[SSE] Client disconnected`);
    });
});

/**
 * Function to notify all clients watching a specific key
 * Called from other routes when data changes
 */
function notifyClients(key, data, eventType = 'update') {
    const clients = sseClients.get(key);
    if (!clients || clients.size === 0) return;
    
    const message = JSON.stringify({ key, data, timestamp: Date.now() });
    
    clients.forEach(client => {
        try {
            client.write(`event: ${eventType}\ndata: ${message}\n\n`);
        } catch (error) {
            console.error('[SSE] Error sending to client:', error);
        }
    });
    
    console.log(`[SSE] Notified ${clients.size} clients for key: ${key}`);
}

/**
 * Wildcard notify - notify all clients watching keys that start with prefix
 * Useful for: held_products/ORDER123 notifying held_products watchers
 */
function notifyClientsWildcard(keyPrefix, data, eventType = 'update') {
    sseClients.forEach((clients, key) => {
        if (key.startsWith(keyPrefix) || keyPrefix.startsWith(key)) {
            const message = JSON.stringify({ key: keyPrefix, data, timestamp: Date.now() });
            clients.forEach(client => {
                try {
                    client.write(`event: ${eventType}\ndata: ${message}\n\n`);
                } catch (error) {
                    console.error('[SSE] Error sending to client:', error);
                }
            });
        }
    });
}

// Export for use in other routes
module.exports = router;
module.exports.notifyClients = notifyClients;
module.exports.notifyClientsWildcard = notifyClientsWildcard;
```

### Cập nhật `server.js`

```javascript
// Thêm vào phần routes
const realtimeDbRoutes = require('./routes/realtime-db');
const realtimeSseRoutes = require('./routes/realtime-sse');

// Đăng ký routes
app.use('/api/realtime', realtimeDbRoutes);
app.use('/api/realtime', realtimeSseRoutes);

// Export notifyClients để các routes khác dùng
app.set('notifyClients', require('./routes/realtime-sse').notifyClients);
```

---

## 5. Frontend: Migrate từ Firebase

### 5.1 Tạo Realtime Client Helper

### File: `js/shared/realtime-client.js`

```javascript
/**
 * RealtimeClient - Thay thế Firebase Realtime Database
 * Sử dụng REST API + SSE cho realtime sync
 */
class RealtimeClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl || window.location.origin;
        this.eventSource = null;
        this.listeners = new Map(); // key -> Set of callbacks
        this.isConnected = false;
    }
    
    /**
     * Connect to SSE and subscribe to keys
     * Thay thế: firebase.database().ref(key).on('value', callback)
     */
    connect(keys) {
        if (this.eventSource) {
            this.eventSource.close();
        }
        
        const keysParam = Array.isArray(keys) ? keys.join(',') : keys;
        const url = `${this.baseUrl}/api/realtime/sse?keys=${encodeURIComponent(keysParam)}`;
        
        this.eventSource = new EventSource(url);
        
        this.eventSource.onopen = () => {
            console.log('[RealtimeClient] Connected to SSE');
            this.isConnected = true;
        };
        
        this.eventSource.addEventListener('connected', (event) => {
            console.log('[RealtimeClient] Subscribed to:', JSON.parse(event.data).keys);
        });
        
        this.eventSource.addEventListener('update', (event) => {
            const { key, data } = JSON.parse(event.data);
            this._notifyListeners(key, data);
        });
        
        this.eventSource.addEventListener('deleted', (event) => {
            const { key } = JSON.parse(event.data);
            this._notifyListeners(key, null);
        });
        
        this.eventSource.onerror = (error) => {
            console.error('[RealtimeClient] SSE error:', error);
            this.isConnected = false;
            // EventSource will auto-reconnect
        };
    }
    
    /**
     * Subscribe to changes on a key
     * Thay thế: firebase.database().ref(key).on('value', callback)
     */
    on(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);
        
        // Return unsubscribe function
        return () => this.off(key, callback);
    }
    
    /**
     * Unsubscribe from changes
     * Thay thế: firebase.database().ref(key).off('value', callback)
     */
    off(key, callback) {
        const callbacks = this.listeners.get(key);
        if (callbacks) {
            callbacks.delete(callback);
        }
    }
    
    /**
     * Get value once (no realtime)
     * Thay thế: firebase.database().ref(key).once('value')
     */
    async get(key) {
        const response = await fetch(`${this.baseUrl}/api/realtime/kv/${encodeURIComponent(key)}`);
        const result = await response.json();
        return result.value;
    }
    
    /**
     * Set value
     * Thay thế: firebase.database().ref(key).set(value)
     */
    async set(key, value) {
        const response = await fetch(`${this.baseUrl}/api/realtime/kv/${encodeURIComponent(key)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });
        return response.json();
    }
    
    /**
     * Delete value
     * Thay thế: firebase.database().ref(key).remove()
     */
    async remove(key) {
        const response = await fetch(`${this.baseUrl}/api/realtime/kv/${encodeURIComponent(key)}`, {
            method: 'DELETE'
        });
        return response.json();
    }
    
    /**
     * Disconnect SSE
     */
    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            this.isConnected = false;
        }
    }
    
    _notifyListeners(key, data) {
        // Exact match
        const callbacks = this.listeners.get(key);
        if (callbacks) {
            callbacks.forEach(cb => cb(data));
        }
        
        // Prefix match (for nested paths like held_products/ORDER123)
        this.listeners.forEach((cbs, listenerKey) => {
            if (key.startsWith(listenerKey + '/') || listenerKey.startsWith(key + '/')) {
                cbs.forEach(cb => cb(data, key));
            }
        });
    }
}

// Global instance
window.realtimeClient = new RealtimeClient();
```

### 5.2 Ví Dụ Migration Code

#### TRƯỚC (Firebase):

```javascript
// Khởi tạo
const database = firebase.database();

// Đọc 1 lần
const snapshot = await database.ref('tpos_token').once('value');
const token = snapshot.val();

// Theo dõi realtime
database.ref('held_products/ORDER123').on('value', (snapshot) => {
    const data = snapshot.val();
    updateUI(data);
});

// Ghi dữ liệu
await database.ref('settings/display').set({ darkMode: true });

// Xóa
await database.ref('old_data').remove();
```

#### SAU (Render + SSE):

```javascript
// Khởi tạo - connect SSE với các keys cần theo dõi
window.realtimeClient.connect(['held_products', 'settings', 'kpi_base']);

// Đọc 1 lần
const token = await realtimeClient.get('tpos_token');

// Theo dõi realtime
realtimeClient.on('held_products/ORDER123', (data) => {
    updateUI(data);
});

// Ghi dữ liệu
await realtimeClient.set('settings/display', { darkMode: true });

// Xóa
await realtimeClient.remove('old_data');
```

---

## 6. Testing & Verification

### 6.1 Test Backend API

```bash
# Test PUT
curl -X PUT http://localhost:3000/api/realtime/kv/test_key \
  -H "Content-Type: application/json" \
  -d '{"value": {"hello": "world"}}'

# Test GET
curl http://localhost:3000/api/realtime/kv/test_key

# Test DELETE
curl -X DELETE http://localhost:3000/api/realtime/kv/test_key
```

### 6.2 Test SSE

```bash
# Mở terminal 1 - subscribe SSE
curl -N "http://localhost:3000/api/realtime/sse?keys=test_key"

# Mở terminal 2 - update data (should trigger SSE event in terminal 1)
curl -X PUT http://localhost:3000/api/realtime/kv/test_key \
  -H "Content-Type: application/json" \
  -d '{"value": {"updated": true}}'
```

### 6.3 Test trong Browser

```javascript
// Mở DevTools Console
const client = new RealtimeClient();
client.connect(['test_key']);

client.on('test_key', (data) => {
    console.log('Received update:', data);
});

// Trong tab khác, update data
await client.set('test_key', { time: new Date().toISOString() });
```

---

## 7. Migration Checklist

### Phase 1: Backend
- [ ] Chạy SQL migration tạo tables
- [ ] Tạo `realtime-db.js` route
- [ ] Tạo `realtime-sse.js` route
- [ ] Cập nhật `server.js` đăng ký routes
- [ ] Test API endpoints

### Phase 2: Frontend Helper
- [ ] Tạo `realtime-client.js`
- [ ] Include trong HTML files

### Phase 3: Migrate từng module
- [ ] Token Manager (`orders-report/token-manager.js`)
- [ ] Pancake Token Manager (`orders-report/pancake-token-manager.js`)
- [ ] KPI Manager (`orders-report/kpi-manager.js`)
- [ ] Held Products Manager (`orders-report/held-products-manager.js`)
- [ ] Soluong Live (`soluong-live/*.html`, `firebase-helpers.js`)

### Phase 4: Cleanup
- [ ] Remove Firebase Realtime Database config
- [ ] Update documentation
- [ ] Monitor Firebase billing (should drop to $0)

---

## 8. Troubleshooting

### SSE Connection Drops

```javascript
// SSE tự động reconnect, nhưng có thể thêm logging
realtimeClient.eventSource.onerror = (e) => {
    console.log('SSE disconnected, will auto-reconnect...');
};
```

### Data không sync

1. Check browser DevTools → Network → SSE connection
2. Check server logs: `[SSE] Notified X clients for key: Y`
3. Verify client subscribed đúng key

### Performance

- SSE connections nhẹ hơn WebSocket
- Mỗi browser tab = 1 connection
- Nếu cần nhiều keys, batch vào 1 connection: `?keys=key1,key2,key3`

---

## 9. Tài Liệu Tham Khảo

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [Express SSE Example](https://expressjs.com/en/resources/middleware/compression.html)
