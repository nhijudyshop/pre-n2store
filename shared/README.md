# Shared Library

Thư viện dùng chung cho tất cả các module trong n2store project.

## Cấu trúc

```
/shared/
├── universal/          # Works in Browser + Node.js
│   ├── fetch-utils.js          # fetchWithTimeout, fetchWithRetry, SmartFetchManager
│   ├── api-endpoints.js        # All API endpoint configs
│   ├── cors-headers.js         # CORS header utilities
│   ├── facebook-constants.js   # Facebook Graph API constants
│   ├── tpos-client.js          # TPOS API client (token, fetch, endpoints)
│   ├── tpos-odata.js           # TPOS OData query helpers
│   └── index.js
│
├── browser/            # Browser-only ES Modules
│   ├── token-manager.js        # TPOS token manager (browser)
│   ├── pancake-token-manager.js # Pancake JWT manager
│   ├── indexeddb-storage.js    # IndexedDB storage wrapper
│   ├── cache-manager.js        # Cache manager with IndexedDB
│   ├── auth-manager.js         # Authentication manager
│   ├── persistent-cache.js     # localStorage-based cache
│   ├── logger.js               # Production-safe logger
│   ├── dom-utils.js            # XSS-safe DOM utilities
│   ├── common-utils.js         # UI utilities (notifications, loading)
│   ├── firebase-config.js      # Firebase config + init (Firestore & RTDB)
│   ├── notification-system.js  # Toast notifications + confirm dialogs
│   └── index.js
│
├── js/                 # Legacy Script-Tag Compatible (window.*)
│   ├── core-loader.js          # Core dependencies loader
│   ├── navigation-modern.js    # Navigation & sidebar
│   ├── common-utils.js         # UI utilities (window.CommonUtils)
│   ├── shared-auth-manager.js  # Auth manager (window.AuthManager)
│   ├── shared-cache-manager.js # Cache manager (window.PersistentCacheManager)
│   ├── dom-utils.js            # DOM utils (window.DOMUtils)
│   ├── logger.js               # Logger (window.logger)
│   ├── tpos-config.js          # TPOS config (window.TPOS_CONFIG)
│   ├── firebase-config.js      # Firebase config
│   ├── realtime-client.js      # Firebase realtime client
│   ├── permissions-helper.js   # Permissions helper
│   ├── event-manager.js        # Event manager
│   ├── ai-chat-widget.js       # AI chat widget
│   └── ...
│
├── node/               # Node.js-only modules
│   ├── token-cache.js          # Server-side token cache
│   ├── cors-middleware.js      # Express CORS middleware
│   └── index.js
│
└── README.md
```

## Sử dụng

### Browser (ES Modules)

```html
<script type="module">
import {
    fetchWithRetry,
    API_ENDPOINTS,
    TokenManager
} from '/shared/browser/index.js';

// Fetch với retry
const response = await fetchWithRetry('https://api.example.com/data', {
    method: 'GET'
}, 3, 1000, 10000);

// Token manager
const tokenManager = new TokenManager();
const token = await tokenManager.getToken();
</script>
```

### Node.js (ES Modules)

```javascript
import {
    fetchWithRetry,
    API_ENDPOINTS,
    corsMiddleware,
    tposTokenCache
} from '../shared/node/index.js';

// Express app
import express from 'express';
const app = express();

// Add CORS middleware
app.use(corsMiddleware());

// Use token cache
if (!tposTokenCache.isValid()) {
    const tokenData = await fetchNewToken();
    tposTokenCache.set(tokenData);
}
const token = tposTokenCache.get();
```

### Cloudflare Worker

```javascript
import {
    fetchWithRetry,
    corsResponse,
    corsPreflightResponse
} from '../shared/universal/index.js';

export default {
    async fetch(request) {
        if (request.method === 'OPTIONS') {
            return corsPreflightResponse();
        }

        const response = await fetchWithRetry('https://api.example.com/data');
        return corsResponse(await response.json());
    }
};
```

## API Reference

### universal/fetch-utils.js

| Function | Description |
|----------|-------------|
| `delay(ms)` | Promise-based delay |
| `fetchWithTimeout(url, options, timeout)` | Fetch with timeout |
| `fetchWithRetry(url, options, retries, delayMs, timeoutMs)` | Fetch with retry & exponential backoff |
| `simpleFetch(url, options)` | Simple fetch with JSON parsing |
| `safeFetch(url, options, config)` | Safe fetch returning `{success, data, error}` |
| `SmartFetchManager` | Auto fallback to backup server |
| `createSmartFetch(primaryUrl, backupUrl)` | Create SmartFetchManager instance |

#### SmartFetchManager

```javascript
import { createSmartFetch } from '/shared/universal/index.js';

const smartFetch = createSmartFetch(
    'https://primary-server.com',
    'https://backup-server.com',
    { retryPrimaryAfter: 5 * 60 * 1000 } // Retry primary after 5 minutes
);

// Auto fallback to backup if primary fails
const response = await smartFetch.fetch('/api/data', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
});

// Check status
console.log(smartFetch.getStatus());
// { isUsingBackup: false, currentUrl: 'https://primary-server.com', lastFailureTime: null }
```

### universal/api-endpoints.js

| Export | Description |
|--------|-------------|
| `API_ENDPOINTS` | All API endpoint URLs |
| `buildTposODataUrl(endpoint, params)` | Build TPOS OData URL |
| `buildPancakeUrl(endpoint, params)` | Build Pancake API URL |
| `buildFacebookGraphUrl(endpoint, token)` | Build Facebook Graph URL |
| `buildWorkerUrl(route, endpoint, params)` | Build Worker proxy URL |

### universal/cors-headers.js

| Export | Description |
|--------|-------------|
| `CORS_HEADERS` | Standard CORS headers object |
| `corsResponse(body, status, headers)` | Create Response with CORS |
| `corsPreflightResponse()` | CORS preflight response |
| `corsErrorResponse(message, status)` | Error response with CORS |
| `addCorsHeaders(response)` | Add CORS to existing Response |

### universal/tpos-client.js

TPOS API client dùng chung cho Browser, Node.js, và Cloudflare Workers.

```javascript
import { TPOSClient, createBrowserTPOSClient } from '/shared/universal/index.js';

// Browser - với localStorage
const client = createBrowserTPOSClient();

// Hoặc custom config
const client = new TPOSClient({
    credentials: {
        grant_type: 'password',
        username: 'your_user',
        password: 'your_pass',
        client_id: 'tmtWebApp'
    }
});

// Token management
const token = await client.getToken();
const header = await client.getAuthHeader(); // { Authorization: 'Bearer ...' }

// API calls
const orders = await client.get('/api/odata/SaleOnline_Order');
const result = await client.post('/api/odata/SaleOnline_Order/ODataService.UpdateV2', data);

// OData URL builder
const url = client.buildODataUrl('SaleOnline_Order/ODataService.GetView', {
    filter: "StatusText eq 'Mới'",
    expand: 'OrderLines,Partner',
    orderBy: 'DateCreated desc',
    top: 100
});

// Server status
console.log(client.getServerStatus());
client.forceBackupServer();  // Switch to backup
client.forcePrimaryServer(); // Switch back to primary
```

### universal/tpos-odata.js

OData query helpers cho TPOS API.

```javascript
import { TPOSClient, TPOSODataService, ORDER_STATUS, getTodayRange } from '/shared/universal/index.js';

const client = new TPOSClient();
const odata = new TPOSODataService(client);

// Get orders
const orders = await odata.getSaleOnlineOrders({
    filter: "StatusText eq 'Mới'",
    top: 100
});

// Get by date range
const { start, end } = getTodayRange();
const todayOrders = await odata.getOrdersByDateRange(start, end);

// Search
const phoneOrders = await odata.getOrdersByPhone('0901234567');
const order = await odata.getOrderById(12345);

// Products
const products = await odata.searchProducts('áo');

// Customers
const customers = await odata.searchCustomerByPhone('090');

// Update
await odata.updateOrderStatus(orderId, ORDER_STATUS.CONFIRMED);
await odata.updateOrderNote(orderId, 'Ghi chú mới');

// Batch update
await odata.batchUpdateOrders([id1, id2, id3], { StatusText: 'Đã xác nhận' });
```

**OData Filter Builder:**

```javascript
import { buildODataFilter } from '/shared/universal/index.js';

const filter = buildODataFilter({
    StatusText: 'Mới',
    Amount: { $gte: 100000 },
    Phone: { $contains: '090' },
    DateCreated: {
        $gte: '2024-01-01T00:00:00Z',
        $lte: '2024-12-31T23:59:59Z'
    }
});
// Output: "StatusText eq 'Mới' and Amount ge 100000 and contains(Phone, '090') and DateCreated ge 2024-01-01T00:00:00Z and DateCreated le 2024-12-31T23:59:59Z"
```

### browser/token-manager.js

```javascript
const manager = new TokenManager({
    apiUrl: 'https://...',
    storageKey: 'my_token',
    firebasePath: 'tokens/my_token',
    credentials: { ... }
});

await manager.getToken();           // Get valid token
await manager.getAuthHeader();      // Get { Authorization: 'Bearer ...' }
await manager.authenticatedFetch(url, options);
await manager.refresh();            // Force refresh
manager.getTokenInfo();             // Display info
```

### browser/pancake-token-manager.js

```javascript
const manager = new PancakeTokenManager();
await manager.initialize();

manager.getToken();                 // Get JWT token
manager.getPageAccessToken(pageId); // Get page token
await manager.setToken(token, expiry, accountId);
await manager.setPageAccessToken(pageId, token, pageName);
```

### browser/indexeddb-storage.js

```javascript
import { IndexedDBStorage, createIndexedDBStorage, isIndexedDBSupported } from '/shared/browser/index.js';

// Check support
if (isIndexedDBSupported()) {
    const storage = createIndexedDBStorage('MyDB', 1);
    await storage.readyPromise;

    // Basic operations (like localStorage)
    await storage.setItem('key', { data: 'value' });
    const data = await storage.getItem('key');
    await storage.removeItem('key');

    // Get all keys matching pattern
    const keys = await storage.getKeys('prefix_*');

    // Get storage stats
    const stats = await storage.getStats();
    console.log(stats.totalSizeFormatted); // "1.5 MB"

    // Migrate from localStorage
    await storage.migrateFromLocalStorage(['key1', 'key2']);
}
```

### browser/cache-manager.js

```javascript
import { CacheManager, createCacheManager } from '/shared/browser/index.js';

const cache = createCacheManager({
    CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
    storageKey: 'my_cache',
    dbName: 'MyDB'
});

// Wait for ready
await cache.initStorage();

// Set/Get with type grouping
cache.set('user_123', { name: 'John' }, 'users');
const user = cache.get('user_123', 'users');

// Check existence
if (cache.has('user_123', 'users')) { ... }

// Clear by type or all
await cache.clear('users');    // Clear only 'users' type
await cache.clear();           // Clear all

// Invalidate by pattern
cache.invalidatePattern('user_');

// Get stats
const stats = await cache.getStats();
console.log(stats); // { size: 10, hits: 50, misses: 5, hitRate: '90.9%', storageSize: '500 KB' }
```

### browser/auth-manager.js

Authentication manager for browser applications.

```javascript
import { AuthManager, getAuthManager, isAuthenticated, getRoleInfo } from '/shared/browser/index.js';

// Quick check
if (isAuthenticated()) {
    console.log('User is logged in');
}

// Get singleton instance
const auth = getAuthManager();

// Or create custom instance
const auth = new AuthManager({
    storageKey: 'my_auth',
    redirectUrl: '/login.html',
    sessionDuration: 8 * 60 * 60 * 1000, // 8 hours
    rememberDuration: 30 * 24 * 60 * 60 * 1000 // 30 days
});

// Check auth status
auth.isAuthenticated();
auth.requireAuth(); // Redirect if not authenticated

// User info
const user = auth.getUserInfo();
const roleInfo = auth.getRoleInfo(); // { name: 'Admin', icon: '👑', color: '#ff6b6b' }

// Permissions
auth.hasPagePermission('orders');
auth.hasDetailedPermission('orders', 'edit');
auth.getPermissionLevel(); // 0=Admin, 1=Manager, 2=Staff, 3=Basic, 777=Guest

// Session management
auth.saveAuthData({ username: 'user' }, rememberMe);
auth.extendSession();
auth.logout('reason');

// Get role info by level
const role = getRoleInfo(0); // { icon: '👑', text: 'Admin', name: 'Admin' }
```

### browser/persistent-cache.js

localStorage-based cache with automatic expiry.

```javascript
import { PersistentCacheManager, createPersistentCache, getPersistentCache } from '/shared/browser/index.js';

// Get singleton
const cache = getPersistentCache();

// Or create instance
const cache = createPersistentCache({
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    storageKey: 'my_cache'
});

// Set/Get with type grouping
cache.set('user_123', { name: 'John' }, 'users');
cache.set('product_456', { name: 'Shirt' }, 'products', 3600000); // Custom TTL

const user = cache.get('user_123', 'users');

// Check/Delete
cache.has('user_123', 'users');
cache.delete('user_123', 'users');

// Clear
cache.clear('users'); // Clear type
cache.clear();        // Clear all

// Pattern invalidation
cache.invalidatePattern('user_');

// Stats
const stats = cache.getStats();
// { hits: 50, misses: 5, hitRate: '90.9%', totalEntries: 10, storageSize: '100 KB' }

// Cleanup
cache.clearExpired();
cache.destroy(); // Stop intervals and save
```

### browser/logger.js

Production-safe logger that automatically disables in production.

```javascript
import { Logger, logger, createLogger, isProduction, overrideConsoleInProduction } from '/shared/browser/index.js';

// Use default logger
logger.log('This is hidden in production');
logger.warn('Warning');
logger.error('Error - always shown');
logger.info('Info');
logger.debug('Debug');

// Create custom logger
const myLogger = createLogger({
    prefix: 'MyApp',
    showTimestamp: true,
    enabled: true // Force enable even in production
});

myLogger.log('Hello'); // [12:34:56] [MyApp] Hello

// Create child logger
const childLogger = myLogger.child('SubModule');
childLogger.log('Hello'); // [12:34:56] [MyApp:SubModule] Hello

// Control
logger.enable();
logger.disable();
logger.toggle();

// Groups and timing
logger.group('Group');
logger.log('Inside group');
logger.groupEnd();

logger.time('operation');
// ... do work
logger.timeEnd('operation');

// Override console in production (optional)
overrideConsoleInProduction();
console.log('Hidden in production');
console._restore(); // Restore original
```

### browser/dom-utils.js

XSS-safe DOM manipulation utilities.

```javascript
import { DOMUtils, $, $$, on, setText, setHTML, createElement, sanitizeHTML } from '/shared/browser/index.js';

// Query shortcuts
const el = $('#myId');
const els = $$('.my-class');

// Safe text/HTML
setText(el, 'Safe text');
setHTML(el, '<p>Safe HTML</p>'); // Auto sanitized

// Sanitize HTML (removes scripts, event handlers)
const safe = sanitizeHTML('<script>alert(1)</script><p onclick="bad()">Hello</p>');
// Result: '<p>Hello</p>'

// Create element safely
const div = createElement('div', {
    className: 'my-class',
    id: 'myId',
    dataset: { value: '123' }
}, 'Text content');

// Event listeners with cleanup
const cleanup = on(el, 'click', handler);
// Later: cleanup();

// Utility functions
DOMUtils.show(el);
DOMUtils.hide(el);
DOMUtils.toggleClass(el, 'active', true);
DOMUtils.hasClass(el, 'active');
DOMUtils.clearChildren(el);
DOMUtils.escapeHTML('<script>'); // '&lt;script&gt;'
DOMUtils.unescapeHTML('&lt;'); // '<'

// Wait for element
await DOMUtils.waitFor('.my-element', 5000);
```

### browser/firebase-config.js

Firebase configuration and initialization for Firestore and Realtime Database.

```javascript
import {
    FIREBASE_CONFIG,
    initializeFirestore,
    initializeRealtimeDB,
    getFirestore,
    getRealtimeDB,
    getRef,
    createPathHelper,
    RTDB_PATHS
} from '/shared/browser/index.js';

// Initialize Firestore (with offline persistence)
const db = initializeFirestore();
const docs = await db.collection('inventory').get();

// Initialize Realtime Database
const rtdb = initializeRealtimeDB();
const snapshot = await rtdb.ref('soluongProducts').once('value');

// Get reference to a path
const productsRef = getRef(RTDB_PATHS.SOLUONG_PRODUCTS);

// Create path helper for module-specific operations
const helper = createPathHelper('soluongProducts');
const productRef = helper.ref('product_123');
const metaRef = helper.metaRef('sortedIds');

// Constants
console.log(RTDB_PATHS.SOLUONG_PRODUCTS); // 'soluongProducts'
console.log(RTDB_PATHS.ORDER_PRODUCTS);   // 'orderProducts'
```

### browser/notification-system.js

Toast notifications with Lucide icons and custom confirm dialogs.

```javascript
import { getNotificationManager, NotificationManager } from '/shared/browser/index.js';

// Get singleton instance
const notify = getNotificationManager();

// Basic notifications
notify.success('Saved successfully!');
notify.error('Something went wrong');
notify.warning('Please check your input');
notify.info('FYI: New feature available');

// Loading with overlay (blocks page)
const loadingId = notify.loading('Processing...');
// ... do async work
notify.remove(loadingId);

// Action-specific notifications
notify.uploading(1, 5);    // "Đang tải lên 1/5 ảnh"
notify.deleting();         // "Đang xóa..."
notify.saving();           // "Đang lưu..."
notify.loadingData();      // "Đang tải dữ liệu..."
notify.processing();       // "Đang xử lý..."

// Custom confirm dialog (replaces native confirm)
const confirmed = await notify.confirm('Delete this item?', 'Confirm');
if (confirmed) {
    // User clicked OK
}

// Control methods
notify.clearAll();         // Remove all notifications
notify.forceHideOverlay(); // Force hide loading overlay
```

### browser/common-utils.js

Common UI utilities for notifications, loading states, and page interactions.

```javascript
import {
    showLoading,
    showSuccess,
    showError,
    showFloatingAlert,
    hideFloatingAlert,
    showStatusMessage,
    initializePageTitle,
    displayUserInfo,
    CommonUtils
} from '/shared/browser/index.js';

// Loading state (blocks page interactions)
showLoading('Đang xử lý...');
// ... do work
hideFloatingAlert();

// Success/Error
showSuccess('Thành công!', 2000);
showError('Có lỗi xảy ra!', 3000);

// Custom alerts
showFloatingAlert('Message', 'info', 3000);
showFloatingAlert('Warning', 'warning', 3000);

// Status message
showStatusMessage('Processing...', 'info');

// Page title with role icon
initializePageTitle(); // Auto-reads from localStorage

// User info display
displayUserInfo('.user-info-container');

// Setup functions
CommonUtils.init(); // Initialize all utilities
CommonUtils.setupErrorHandling();
CommonUtils.setupPerformanceMonitoring();

// Check/control page blocking
if (CommonUtils.isPageBlocked()) {
    CommonUtils.forceUnblockPage();
}
```

### node/token-cache.js

```javascript
import { TokenCache, tposTokenCache } from '../shared/node/index.js';

// Generic cache
const cache = new TokenCache({ bufferTime: 5 * 60 * 1000 });
cache.set('key', 'token', 3600);
const token = cache.get('key');

// Singleton TPOS cache
tposTokenCache.set({ access_token: '...', expires_in: 3600 });
const tposToken = tposTokenCache.get();
```

### node/cors-middleware.js

```javascript
import { corsMiddleware, simpleCors } from '../shared/node/index.js';

// Full middleware
app.use(corsMiddleware({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

// Simple middleware
app.use(simpleCors());
```

## Migration Guide

### Từ orders-report/js/core/token-manager.js

```javascript
// Old
const tokenManager = new TokenManager();

// New
import { TokenManager } from '/shared/browser/index.js';
const tokenManager = new TokenManager();
```

### Từ cloudflare-worker/worker.js

```javascript
// Old (inline)
async function fetchWithRetry(...) { ... }

// New
import { fetchWithRetry } from './modules/utils/fetch-utils.js';
```

## Script-Tag Compatibility (Legacy)

Một số project vẫn sử dụng script tags thay vì ES modules.
Các file trong `/shared/js/` folder là legacy script-tag compatible versions:

| ES Module (SOURCE OF TRUTH) | Script-Tag Version (`../shared/js/...`) |
|----------------------------|----------------------------------------|
| `/shared/browser/auth-manager.js` | `/shared/js/shared-auth-manager.js` |
| `/shared/browser/persistent-cache.js` | `/shared/js/shared-cache-manager.js` |
| `/shared/browser/logger.js` | `/shared/js/logger.js` |
| `/shared/browser/dom-utils.js` | `/shared/js/dom-utils.js` |
| `/shared/browser/common-utils.js` | `/shared/js/common-utils.js` |
| `/shared/browser/firebase-config.js` | `/shared/js/firebase-config.js` |
| `/shared/browser/notification-system.js` | `/shared/js/notification-system.js` |
| `/shared/universal/tpos-client.js` | `/shared/js/tpos-config.js` |

**Sử dụng trong HTML:**
```html
<!-- Legacy script tags -->
<script src="../shared/js/core-loader.js"></script>
<script src="../shared/js/navigation-modern.js"></script>
<script src="../shared/js/common-utils.js"></script>

<!-- Modern ES Modules -->
<script type="module">
import { AuthManager, CommonUtils } from '/shared/browser/index.js';
</script>
```

**IMPORTANT**: ES Modules trong `/shared/browser/` và `/shared/universal/` là SOURCE OF TRUTH.
- Khi update logic, update ES modules trước
- Script-tag files trong `/shared/js/` có comment chỉ đến source of truth
- Legacy code vẫn hoạt động vì expose `window.*`

## Notes

- Tất cả modules sử dụng ES Modules (`export`/`import`)
- Browser modules yêu cầu `<script type="module">`
- Node.js cần `"type": "module"` trong package.json hoặc `.mjs` extension
- Cloudflare Worker tự động bundle với wrangler
- Để migrate từ script-tag sang ES modules, chỉ cần đổi `<script>` thành `<script type="module">` và import từ shared
