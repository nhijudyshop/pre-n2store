# Realtime Client Migration Examples

## Tổng Quan

Tài liệu này cung cấp các ví dụ cụ thể để migrate code từ **Firebase Realtime Database** sang **RealtimeClient** (PostgreSQL + SSE).

---

## Setup

### 1. Include Script

Thêm vào HTML file:

```html
<!-- Include Realtime Client -->
<script src="/js/realtime-client.js"></script>
```

### 2. Initialize

```javascript
// Global instance đã tự động khởi tạo
console.log(window.realtimeClient); // RealtimeClient instance

// Hoặc tạo instance mới
const myClient = new RealtimeClient('https://your-api.com');
```

### 3. Connect to SSE

```javascript
// Connect và subscribe đến các keys cần theo dõi
realtimeClient.connect([
    'tpos_token',
    'pancake_token',
    'held_products',
    'kpi_base',
    'settings'
]);
```

---

## Migration Examples

### Example 1: Token Manager

#### BEFORE (Firebase):

```javascript
// File: orders-report/token-manager.js

class TokenManager {
    constructor() {
        this.db = firebase.database();
    }

    async getToken() {
        const snapshot = await this.db.ref('tpos_token').once('value');
        return snapshot.val();
    }

    async saveToken(token) {
        await this.db.ref('tpos_token').set(token);
    }

    watchToken(callback) {
        this.db.ref('tpos_token').on('value', (snapshot) => {
            callback(snapshot.val());
        });
    }
}
```

#### AFTER (RealtimeClient):

```javascript
// File: orders-report/token-manager.js

class TokenManager {
    constructor() {
        // No initialization needed, use global realtimeClient
    }

    async getToken() {
        return await realtimeClient.get('tpos_token');
    }

    async saveToken(token) {
        await realtimeClient.set('tpos_token', token);
    }

    watchToken(callback) {
        realtimeClient.on('tpos_token', callback);
    }
}
```

---

### Example 2: Held Products Manager

#### BEFORE (Firebase):

```javascript
// File: orders-report/held-products-manager.js

async function saveHeldProducts() {
    const orderId = window.currentChatOrderData?.Id;
    const userId = getUserId();

    const heldRef = firebase.database().ref(`held_products/${orderId}`);
    const snapshot = await heldRef.once('value');
    const orderProducts = snapshot.val() || {};

    // Update product
    for (const productId in productData) {
        await firebase.database()
            .ref(`held_products/${orderId}/${productId}/${userId}`)
            .set({
                quantity: productData[productId].quantity,
                isDraft: true
            });
    }
}

function listenHeldProducts(orderId, callback) {
    firebase.database()
        .ref(`held_products/${orderId}`)
        .on('value', (snapshot) => {
            callback(snapshot.val());
        });
}
```

#### AFTER (RealtimeClient):

```javascript
// File: orders-report/held-products-manager.js

async function saveHeldProducts() {
    const orderId = window.currentChatOrderData?.Id;
    const userId = getUserId();

    const orderProducts = await realtimeClient.getHeldProducts(orderId);

    // Update product
    for (const productId in productData) {
        await realtimeClient.setHeldProduct(orderId, productId, userId, {
            quantity: productData[productId].quantity,
            isDraft: true
        });
    }
}

function listenHeldProducts(orderId, callback) {
    realtimeClient.on(`held_products/${orderId}`, callback);
}
```

---

### Example 3: KPI Manager

#### BEFORE (Firebase):

```javascript
// File: orders-report/kpi-manager.js

async function checkKPIBaseExists(orderId) {
    const snapshot = await firebase.database()
        .ref(`kpi_base/${orderId}`)
        .once('value');

    return snapshot.exists();
}

async function saveKPIBase(orderId, userId, stt, products) {
    await firebase.database()
        .ref(`kpi_base/${orderId}`)
        .set({
            orderId,
            userId,
            stt,
            products,
            timestamp: Date.now()
        });
}

async function getKPIBase(orderId) {
    const snapshot = await firebase.database()
        .ref(`kpi_base/${orderId}`)
        .once('value');

    return snapshot.val();
}
```

#### AFTER (RealtimeClient):

```javascript
// File: orders-report/kpi-manager.js

async function checkKPIBaseExists(orderId) {
    const data = await realtimeClient.getKpiBase(orderId);
    return data !== null;
}

async function saveKPIBase(orderId, userId, stt, products) {
    await realtimeClient.setKpiBase(orderId, {
        orderId,
        userId,
        stt,
        products,
        timestamp: Date.now()
    });
}

async function getKPIBase(orderId) {
    return await realtimeClient.getKpiBase(orderId);
}
```

---

### Example 4: Settings Management

#### BEFORE (Firebase):

```javascript
// Read settings
const snapshot = await firebase.database().ref('settings/display').once('value');
const settings = snapshot.val();

// Update settings
await firebase.database().ref('settings/display').set({
    darkMode: true,
    fontSize: 14
});

// Watch settings
firebase.database().ref('settings/display').on('value', (snapshot) => {
    updateUI(snapshot.val());
});
```

#### AFTER (RealtimeClient):

```javascript
// Read settings
const settings = await realtimeClient.get('settings/display');

// Update settings
await realtimeClient.set('settings/display', {
    darkMode: true,
    fontSize: 14
});

// Watch settings
realtimeClient.on('settings/display', (data) => {
    updateUI(data);
});
```

---

## Testing Guide

### 1. Test REST API Endpoints

#### Test Key-Value Operations:

```bash
# Set a value
curl -X PUT http://localhost:3000/api/realtime/kv/test_key \
  -H "Content-Type: application/json" \
  -d '{"value": {"hello": "world", "timestamp": 1234567890}}'

# Get the value
curl http://localhost:3000/api/realtime/kv/test_key

# Delete the value
curl -X DELETE http://localhost:3000/api/realtime/kv/test_key
```

#### Test Held Products:

```bash
# Set held product
curl -X PUT http://localhost:3000/api/realtime/held-products/ORDER123/PROD456/USER789 \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5, "price": 100000, "isDraft": true}'

# Get all held products for order
curl http://localhost:3000/api/realtime/held-products/ORDER123

# Delete held product
curl -X DELETE http://localhost:3000/api/realtime/held-products/ORDER123/PROD456/USER789
```

#### Test KPI Base:

```bash
# Set KPI base
curl -X PUT http://localhost:3000/api/realtime/kpi-base/ORDER123 \
  -H "Content-Type: application/json" \
  -d '{
    "campaignName": "Campaign ABC",
    "userId": "user123",
    "userName": "John Doe",
    "stt": 1,
    "products": [
      {"code": "SP001", "quantity": 10, "price": 50000}
    ]
  }'

# Get KPI base
curl http://localhost:3000/api/realtime/kpi-base/ORDER123
```

---

### 2. Test SSE Connection

#### Terminal 1 - Subscribe to SSE:

```bash
# Subscribe to multiple keys
curl -N "http://localhost:3000/api/realtime/sse?keys=test_key,held_products,kpi_base"
```

Keep this terminal open. You should see:
```
event: connected
data: {"keys":["test_key","held_products","kpi_base"],"connectionId":"conn_...","timestamp":"..."}
```

#### Terminal 2 - Trigger Updates:

```bash
# Update test_key (Terminal 1 should receive update event)
curl -X PUT http://localhost:3000/api/realtime/kv/test_key \
  -H "Content-Type: application/json" \
  -d '{"value": {"updated": true, "time": "'$(date -Iseconds)'"}}'

# Update held product (Terminal 1 should receive update event)
curl -X PUT http://localhost:3000/api/realtime/held-products/ORDER999/PROD1/USER1 \
  -H "Content-Type: application/json" \
  -d '{"quantity": 3, "isDraft": false}'
```

You should see in Terminal 1:
```
event: update
data: {"key":"test_key","data":{...},"timestamp":...}

event: update
data: {"key":"held_products/ORDER999","data":{...},"timestamp":...}
```

---

### 3. Test in Browser Console

#### Setup:

```javascript
// Open DevTools Console on any page with realtime-client.js loaded

// Check if client is available
console.log(window.realtimeClient);

// Connect to SSE
realtimeClient.connect(['test_key', 'settings']);
```

#### Test Read/Write:

```javascript
// Write data
await realtimeClient.set('test_key', {
    message: 'Hello from browser',
    timestamp: Date.now()
});

// Read data
const data = await realtimeClient.get('test_key');
console.log(data);

// Delete data
await realtimeClient.remove('test_key');
```

#### Test Realtime Listeners:

```javascript
// Add listener
realtimeClient.on('test_key', (data) => {
    console.log('Received update:', data);
});

// In another tab/browser, update the same key
await realtimeClient.set('test_key', {
    message: 'Update from another tab',
    timestamp: Date.now()
});

// Both tabs should receive the update!
```

---

### 4. Test SSE Statistics

```bash
# Get connection stats
curl http://localhost:3000/api/realtime/sse/stats

# Response:
# {
#   "success": true,
#   "totalClients": 2,
#   "uniqueKeys": 3,
#   "keyStats": {
#     "test_key": 2,
#     "held_products": 1,
#     "kpi_base": 1
#   },
#   "timestamp": "2026-01-02T10:30:00.000Z"
# }
```

---

## Performance Comparison

### Firebase Realtime Database:
- ✅ Automatic realtime sync
- ✅ Offline support
- ❌ Expensive ($25-100/month for medium usage)
- ❌ Limited query capabilities
- ❌ WebSocket overhead

### RealtimeClient (PostgreSQL + SSE):
- ✅ Realtime updates via SSE
- ✅ Full SQL query power
- ✅ Much cheaper (PostgreSQL on Render)
- ✅ Better control over data
- ✅ Lighter than WebSocket (one-way)
- ⚠️ Manual offline handling (if needed)

---

## Migration Checklist

### Phase 1: Backend Setup
- [x] Run database migration: `psql $DATABASE_URL -f render.com/migrations/create_realtime_data.sql`
- [x] Verify tables created: `\dt` in psql
- [x] Test REST API endpoints
- [x] Test SSE connection

### Phase 2: Frontend Setup
- [ ] Include `/js/realtime-client.js` in HTML
- [ ] Initialize connection with keys
- [ ] Test basic operations in browser console

### Phase 3: Code Migration
- [ ] Identify all Firebase database operations
- [ ] Replace with RealtimeClient methods
- [ ] Test each module after migration
- [ ] Remove Firebase SDK dependency

### Phase 4: Cleanup
- [ ] Remove Firebase config
- [ ] Update documentation
- [ ] Monitor Firebase billing (should drop to $0)

---

## Common Patterns

### Pattern 1: Initialize on Page Load

```javascript
// At the top of your main JS file
document.addEventListener('DOMContentLoaded', () => {
    // Connect to SSE with all keys your app needs
    realtimeClient.connect([
        'tpos_token',
        'pancake_token',
        'held_products',
        'kpi_base',
        'settings'
    ]);

    console.log('[App] Realtime client connected');
});
```

### Pattern 2: Conditional Listeners

```javascript
// Only listen when viewing specific order
function viewOrder(orderId) {
    // Clean up previous listener
    if (window.currentOrderListener) {
        window.currentOrderListener();
    }

    // Add new listener (returns unsubscribe function)
    window.currentOrderListener = realtimeClient.on(
        `held_products/${orderId}`,
        (data) => {
            console.log('Order products updated:', data);
            renderProducts(data);
        }
    );
}
```

### Pattern 3: Error Handling

```javascript
async function saveData(key, value) {
    try {
        await realtimeClient.set(key, value);
        console.log('Data saved successfully');
    } catch (error) {
        console.error('Failed to save data:', error);
        alert('Lỗi lưu dữ liệu. Vui lòng thử lại.');
    }
}
```

---

## Troubleshooting

### SSE Connection Not Working?

1. Check browser DevTools → Network tab → Filter by "sse"
2. Look for connection to `/api/realtime/sse?keys=...`
3. Check server logs for SSE connection messages

### Data Not Syncing?

1. Verify SSE connection is active
2. Check if key is in subscribed keys list
3. Check server logs for notification messages
4. Verify listener is properly registered

### Performance Issues?

- Reduce number of SSE subscriptions (combine related keys)
- Use wildcard listeners instead of multiple specific listeners
- Implement debouncing for frequent updates

---

## Need Help?

- Check server logs: `render.com/server.js`
- Test API directly with `curl`
- Use browser DevTools Console for debugging
- Review migration guide: `docs/guides/FIREBASE_TO_RENDER_SSE_MIGRATION.md`
