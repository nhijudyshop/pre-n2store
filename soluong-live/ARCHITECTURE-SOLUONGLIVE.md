# Soluong-Live Architecture Documentation

> **Mục đích tài liệu**: Cung cấp thông tin chi tiết về kiến trúc hệ thống để AI agent có thể phân tích, đánh giá và đề xuất tối ưu hoặc chuyển đổi công nghệ.

---

## 1. Executive Summary

**Soluong-Live** là hệ thống quản lý số lượng sản phẩm real-time cho bán hàng livestream và social media.

### Tính năng chính:
- Quản lý số lượng sản phẩm theo thời gian thực
- Đồng bộ hóa multi-client qua Firebase Realtime Database
- Hỗ trợ livestream sales và social media sales
- Tracking lịch sử bán hàng theo nhân viên và nguồn
- Snapshot/restore danh sách sản phẩm

### Use Cases:
1. **Livestream bán hàng**: Admin quản lý trên `index.html`, màn hình hiển thị OBS dùng `soluong-list.html` (sync real-time)
2. **Bán hàng Social**: Nhân viên bán qua Facebook/Zalo dùng `social-sales.html` (độc lập, có log)
3. **Báo cáo**: Xem thống kê bán hàng qua `sales-report.html`

---

## 2. Cấu trúc thư mục và files

```
soluong-live/
├── index.html                  # Admin dashboard - Trang quản lý chính
├── soluong-list.html           # Display view - Sync với admin (cho OBS)
├── social-sales.html           # Social sales - Độc lập, có log nhân viên
├── hidden-soluong.html         # Hidden products management
├── sales-report.html           # Sales reporting & analytics
├── firebase-helpers.js         # ES Module - Firebase helpers (~950 lines) ⭐ SINGLE SOURCE OF TRUTH
├── firebase-helpers-global.js  # Wrapper để expose functions ra window object
├── migration-soldqty.js        # Script migration tách soldQty ra node riêng
└── js/
    └── main.js                 # ES Module - Logic chính cho index.html (~1000+ lines)
```

### Thay đổi so với phiên bản cũ:

| Trước | Sau |
|-------|-----|
| 2 files `firebase-helpers.js` (root + js/) | 1 file duy nhất `firebase-helpers.js` (root) |
| Script tag import | ES Module import |
| `soldQty` trong `soluongProducts` | `soldQty` tách riêng ra `soluongProductsQty` |

### Tổng quan các pages:

| Page | Mục đích | Sync Mode | Có Edit Qty | Log Sales | Import Method |
|------|----------|-----------|-------------|-----------|---------------|
| `index.html` | Admin dashboard | Yes (master) | Yes | Yes | ES Module via `js/main.js` |
| `soluong-list.html` | Display cho OBS/stream | Yes (slave) | No | No | ES Module via `firebase-helpers-global.js` |
| `social-sales.html` | Nhân viên bán social | No | Yes | Yes | ES Module via `firebase-helpers-global.js` |
| `hidden-soluong.html` | Sản phẩm đã ẩn | Partial | Yes | No | ES Module via `firebase-helpers-global.js` |
| `sales-report.html` | Xem báo cáo | No | No | Read only | ES Module via `firebase-helpers-global.js` |

---

## 3. Technology Stack

### Frontend
| Công nghệ | Version/Notes |
|-----------|---------------|
| HTML5 | Semantic markup |
| CSS3 | CSS Variables, Flexbox, Grid |
| JavaScript | ES6+ (async/await, ES Modules) |
| Framework | **Không có** - Pure vanilla JS |

### Database
| Service | Version | Mục đích |
|---------|---------|----------|
| Firebase Realtime Database | 10.7.1 (compat) | Real-time data sync |
| Firebase Authentication | 10.7.1 | User auth (qua shared lib) |
| Firebase Storage | 10.7.1 | Image uploads |

### External APIs
| API | Base URL | Mục đích |
|-----|----------|----------|
| TPOS Token | `https://tomato.tpos.vn/token` | OAuth authentication |
| TPOS Product Search | `https://tomato.tpos.vn/api/Product/Search` | Tìm kiếm sản phẩm |

### Third-party Libraries
| Library | Version | CDN | Mục đích |
|---------|---------|-----|----------|
| Firebase SDK | 10.7.1 | gstatic.com | Database, Auth |
| XLSX.js | 0.18.5 | cdnjs.cloudflare.com | Excel import/export |

### Shared Library (Internal)
| Module | Path | Mục đích |
|--------|------|----------|
| AuthManager | `/shared/esm/compat.js` | Authentication |
| NotificationManager | `/shared/esm/compat.js` | Toast notifications |
| PersistentCacheManager | `/shared/esm/compat.js` | Client-side caching |
| navigation-modern.js | `/shared/js/navigation-modern.js` | Navigation system |

---

## 4. Firebase Configuration

```javascript
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D"
};
```

**Region**: `asia-southeast1` (Singapore)

---

## 5. Firebase Realtime Database Schema

### 5.1 Schema Overview

```
Firebase Realtime Database Root
│
├── soluongProducts/                    # Danh sách sản phẩm chính (static data)
│   └── product_{id}/                   # Key format: "product_123456"
│       ├── Id: number                  # Product ID từ TPOS (e.g., 123456)
│       ├── NameGet: string             # Tên sản phẩm (e.g., "Áo thun trắng (M)")
│       ├── QtyAvailable: number        # Số lượng tồn kho từ TPOS (e.g., 50)
│       ├── soldQty: number             # [DEPRECATED - kept for backward compat]
│       ├── remainingQty: number        # = QtyAvailable - soldQty (calculated)
│       ├── imageUrl: string|null       # URL ảnh sản phẩm
│       ├── ProductTmplId: number       # Template ID cho variant grouping
│       ├── ListPrice: number           # Giá niêm yết (VND)
│       ├── PriceVariant: number        # Giá variant (VND)
│       ├── addedAt: number             # Timestamp khi thêm vào
│       ├── isHidden: boolean           # Trạng thái ẩn/hiện
│       └── lastRefreshed: number       # Timestamp refresh cuối
│
├── soluongProductsQty/                 # ⭐ NODE MỚI: Chỉ chứa soldQty (tách riêng)
│   └── product_{id}/                   # Key format giống soluongProducts
│       └── soldQty: number             # Số lượng đã bán - SOURCE OF TRUTH
│
├── soluongProductsMeta/                # Metadata của products
│   ├── sortedIds: string[]             # Mảng ID để sắp xếp thứ tự
│   ├── count: number                   # Tổng số products
│   └── lastUpdated: number             # Timestamp cập nhật cuối
│
├── soluongSalesLog/                    # Log bán hàng
│   └── {push_key}/                     # Firebase auto-generated key
│       ├── productId: number           # ID sản phẩm
│       ├── productName: string         # Tên sản phẩm (snapshot)
│       ├── change: number              # +1 (bán) hoặc -1 (hoàn)
│       ├── source: string              # "livestream" | "facebook" | "unknown"
│       ├── staffName: string           # Tên hiển thị nhân viên
│       ├── staffUsername: string       # Username nhân viên
│       ├── timestamp: number           # Timestamp của giao dịch
│       └── date: string                # "YYYY-MM-DD" cho filtering
│
├── cartHistory/                        # Lịch sử cart snapshots
│   └── snapshot_{timestamp}/           # Key format: "snapshot_1704067200000"
│       ├── metadata/
│       │   ├── name: string            # Tên snapshot
│       │   ├── savedAt: number         # Timestamp
│       │   └── productCount: number    # Số lượng products
│       └── products/                   # Deep copy của soluongProducts
│           └── product_{id}/
│               └── {...productData}
│
├── cartHistoryMeta/                    # Metadata của cart history
│   ├── sortedIds: string[]             # Mảng snapshot IDs
│   ├── count: number                   # Tổng số snapshots
│   └── lastUpdated: number             # Timestamp
│
├── soluongDisplaySettings/             # Settings hiển thị (sync)
│   ├── gridColumns: number             # Số cột grid (default: 4)
│   ├── gridRows: number                # Số hàng grid (default: 2)
│   ├── gridGap: number                 # Khoảng cách grid (px)
│   └── ...                             # Các CSS settings khác
│
├── hiddenSoluongDisplaySettings/       # Display settings cho hidden page
│   └── {...same as soluongDisplaySettings}
│
├── soluongSyncCurrentPage: number      # Page hiện tại (sync mode)
├── soluongSyncSearchData: string       # Search keyword (sync mode)
└── soluongIsMergeVariants: boolean     # Setting: gộp variants
```

### 5.2 Kiến trúc tách soldQty (Optimized)

**Vấn đề trước đây:**
- Mỗi lần update `soldQty`, Firebase gửi toàn bộ product object (~1KB) cho TẤT CẢ clients đang listen
- Chi phí bandwidth cao: ~$78/tháng

**Giải pháp:**
- Tách `soldQty` ra node riêng `soluongProductsQty`
- Mỗi update chỉ gửi ~50 bytes thay vì ~1KB
- Tiết kiệm ~98% bandwidth cho qty updates

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TRƯỚC (soldQty trong product)                     │
├─────────────────────────────────────────────────────────────────────┤
│  soluongProducts/product_123: {                                      │
│      Id: 123,                                                        │
│      NameGet: "Áo thun trắng (M)",                                  │
│      QtyAvailable: 50,                                               │
│      soldQty: 5,          ← Thay đổi thường xuyên                   │
│      imageUrl: "https://...",                                        │
│      ...                                                             │
│  }                                                                   │
│  → Mỗi update gửi ~1KB cho mỗi client                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    SAU (soldQty tách riêng)                          │
├─────────────────────────────────────────────────────────────────────┤
│  soluongProducts/product_123: {          (Static data - ít thay đổi)│
│      Id: 123,                                                        │
│      NameGet: "Áo thun trắng (M)",                                  │
│      QtyAvailable: 50,                                               │
│      imageUrl: "https://...",                                        │
│      ...                                                             │
│  }                                                                   │
│                                                                      │
│  soluongProductsQty/product_123: {       (Qty data - thay đổi nhiều)│
│      soldQty: 5                                                      │
│  }                                                                   │
│  → Mỗi update chỉ gửi ~50 bytes                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Data Flow khi update soldQty

```
User clicks +1 on product
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  updateProductQtyInFirebase(database, productId, +1, ...)           │
│                                                                      │
│  1. Calculate new values:                                            │
│     newSoldQty = Math.max(0, Math.min(QtyAvailable, soldQty + 1))   │
│     newRemainingQty = QtyAvailable - newSoldQty                     │
│                                                                      │
│  2. Update LOCAL object immediately (optimistic)                     │
│                                                                      │
│  3. Batch update to Firebase:                                        │
│     updates[`soluongProducts/${key}/soldQty`] = newSoldQty          │
│     updates[`soluongProducts/${key}/remainingQty`] = newRemainingQty│
│     updates[`soluongProductsQty/${key}/soldQty`] = newSoldQty  ⭐   │
│                                                                      │
│  4. Log sale transaction (if logOptions provided)                    │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firebase broadcasts to ALL connected clients                        │
│                                                                      │
│  Client A (index.html) - listens to soluongProducts                 │
│  Client B (soluong-list.html) - listens to soluongProductsQty  ⭐   │
│  Client C (social-sales.html) - listens to soluongProductsQty  ⭐   │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.4 Data Types Summary

| Node | Read Frequency | Write Frequency | Size Estimate | Listener Type |
|------|----------------|-----------------|---------------|---------------|
| soluongProducts | High (realtime) | Low | ~1-5KB per product | child_* |
| **soluongProductsQty** | High (realtime) | **High** | **~50 bytes per product** | child_* |
| soluongProductsMeta | Medium | Medium | ~100 bytes | value |
| soluongSalesLog | Low (reporting) | High (every sale) | ~200 bytes per log | once |
| cartHistory | Low | Low | Depends on products | once |
| soluongDisplaySettings | Medium (on load) | Low | ~500 bytes | value |
| soluongSync* | High (realtime) | High | ~50 bytes each | value |

---

## 6. Realtime Listeners Architecture

### 6.1 Dual-Node Listener Setup

```javascript
function setupFirebaseChildListeners(database, localProductsObject, callbacks) {
    const productsRef = database.ref('soluongProducts');
    const qtyRef = database.ref('soluongProductsQty');  // ⭐ NEW

    // Listen for product static data changes
    productsRef.on('child_added', ...);
    productsRef.on('child_changed', ...);
    productsRef.on('child_removed', ...);

    // Listen for qty changes separately (lightweight)
    qtyRef.on('child_changed', (snapshot) => {
        const qtyData = snapshot.val();
        const productKey = snapshot.key;

        if (localProductsObject[productKey]) {
            // Update local object
            localProductsObject[productKey].soldQty = qtyData.soldQty;
            localProductsObject[productKey].remainingQty =
                localProductsObject[productKey].QtyAvailable - qtyData.soldQty;

            // Notify UI via callback
            callbacks.onQtyChanged?.(productKey, qtyData.soldQty);
        }
    });
}
```

### 6.2 Data Merge on Initial Load

```javascript
async function loadAllProductsFromFirebase(database) {
    // Load both nodes in parallel
    const [productsSnapshot, qtySnapshot] = await Promise.all([
        database.ref('soluongProducts').once('value'),
        database.ref('soluongProductsQty').once('value')
    ]);

    const productsData = productsSnapshot.val() || {};
    const qtyData = qtySnapshot.val() || {};

    // Merge qty data into products
    Object.keys(productsData).forEach(key => {
        if (qtyData[key]) {
            productsData[key].soldQty = qtyData[key].soldQty;
        }
        // Recalculate remainingQty
        productsData[key].remainingQty =
            productsData[key].QtyAvailable - (productsData[key].soldQty || 0);
    });

    return productsData;
}
```

### 6.3 Event Flow Diagram (Updated)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FIREBASE CLOUD                                │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  soluongProductsQty/product_123: { soldQty: 5 -> 6 }           │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                │ WebSocket push (~50 bytes only)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       CLIENT (Browser)                                │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  qtyRef.on('child_changed', callback)                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                │                                      │
│                                ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  1. localProductsObject[key].soldQty = 6                       │  │
│  │  2. localProductsObject[key].remainingQty = 50 - 6 = 44        │  │
│  │  3. callbacks.onQtyChanged(key, 6)                             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                │                                      │
│                                ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  4. UI Update: update product card with new remainingQty       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. Sync Mode Architecture

### 7.1 Overview

Sync Mode cho phép `index.html` (Admin) điều khiển `soluong-list.html` (Display) real-time.

**Activation**: Thêm `#sync` hoặc `#admin` vào URL hash
- `index.html#sync` → Bật sync mode (master)
- `soluong-list.html#sync` → Bật sync mode (slave)

### 7.2 Conditional Sync Listeners

```javascript
// Chỉ setup sync listeners khi cần
const isSyncMode = window.location.hash.includes('sync') ||
                   window.location.hash.includes('admin');

if (isSyncMode) {
    setupSyncListeners(database);
}

// Cleanup khi rời trang
window.addEventListener('beforeunload', () => {
    if (isSyncMode) {
        database.ref('soluongSyncCurrentPage').off();
        database.ref('soluongSyncSearchData').off();
        database.ref('soluongDisplaySettings').off();
    }
});
```

### 7.3 Synced Properties

| Property | Firebase Path | Type | Description |
|----------|---------------|------|-------------|
| Current Page | `soluongSyncCurrentPage` | number | Page đang hiển thị |
| Search Keyword | `soluongSyncSearchData` | string | Từ khóa tìm kiếm |
| Display Settings | `soluongDisplaySettings` | object | Tất cả CSS settings |
| Merge Variants | `soluongIsMergeVariants` | boolean | Gộp variants theo template |

---

## 8. Firebase Helper Functions API

### 8.1 ES Module Structure

```javascript
// firebase-helpers.js - Single source of truth
export {
    // Product CRUD
    addProductToFirebase,
    addProductsToFirebase,
    removeProductFromFirebase,
    removeProductsFromFirebase,
    updateProductQtyInFirebase,
    updateProductVisibility,
    cleanupOldProducts,
    clearAllProducts,
    loadAllProductsFromFirebase,
    setupFirebaseChildListeners,
    getProductsArray,

    // Cart cache helpers
    getCartCache,
    setCartCache,
    invalidateCartCache,

    // Cart snapshot functions
    saveCartSnapshot,
    getCartSnapshot,
    getAllCartSnapshots,
    restoreProductsFromSnapshot,
    deleteCartSnapshot,

    // Sales log functions
    logSaleTransaction,
    getSalesLogByDate,
    getAllSalesLogs
};
```

### 8.2 Import Methods

**For index.html (via js/main.js):**
```javascript
// js/main.js
import {
    addProductToFirebase,
    loadAllProductsFromFirebase,
    // ...
} from '../firebase-helpers.js';
```

**For other HTML files (via wrapper):**
```javascript
// firebase-helpers-global.js
import {
    addProductToFirebase,
    // ...
} from './firebase-helpers.js';

// Expose to global window object
Object.assign(window, {
    addProductToFirebase,
    // ...
});
```

```html
<!-- In HTML -->
<script type="module" src="firebase-helpers-global.js"></script>
```

### 8.3 Key Functions

#### `updateProductQtyInFirebase(database, productId, change, localProductsObject, logOptions)`

Cập nhật số lượng đã bán (+1 hoặc -1). **Writes to both nodes**.

```javascript
async function updateProductQtyInFirebase(database, productId, change, localProductsObject, logOptions) {
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];

    // Calculate new values
    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, product.soldQty + change));
    const newRemainingQty = product.QtyAvailable - newSoldQty;

    // Update local object (optimistic)
    product.soldQty = newSoldQty;
    product.remainingQty = newRemainingQty;

    // Batch update to Firebase (BOTH nodes)
    const updates = {};
    updates[`soluongProducts/${productKey}/soldQty`] = newSoldQty;
    updates[`soluongProducts/${productKey}/remainingQty`] = newRemainingQty;
    updates[`soluongProductsQty/${productKey}/soldQty`] = newSoldQty;  // ⭐ NEW NODE

    await database.ref().update(updates);

    // Log sale if options provided
    if (logOptions) {
        await logSaleTransaction(database, {
            productId,
            productName: product.NameGet,
            change,
            ...logOptions
        });
    }
}
```

#### `restoreProductsFromSnapshot(database, snapshotProducts, localProductsObject)`

Khôi phục products từ snapshot. **Also writes to soluongProductsQty**.

```javascript
async function restoreProductsFromSnapshot(database, snapshotProducts, localProductsObject) {
    const updates = {};
    const productIds = [];

    Object.entries(snapshotProducts).forEach(([key, product]) => {
        updates[`soluongProducts/${key}`] = product;
        // Also write soldQty to separate node for cross-page sync
        updates[`soluongProductsQty/${key}`] = { soldQty: product.soldQty || 0 };
        productIds.push(product.Id);
        localProductsObject[key] = product;
    });

    updates['soluongProductsMeta'] = {
        sortedIds: productIds,
        count: productIds.length,
        lastUpdated: Date.now()
    };

    await database.ref().update(updates);
}
```

---

## 9. Cart Cache System

### 9.1 In-Memory Cache

```javascript
let cartCache = null;
let cartCacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCartCache() {
    if (cartCache && cartCacheTimestamp &&
        (Date.now() - cartCacheTimestamp) < CACHE_DURATION) {
        return cartCache;
    }
    return null;
}

function setCartCache(data) {
    cartCache = data;
    cartCacheTimestamp = Date.now();
}

function invalidateCartCache() {
    cartCache = null;
    cartCacheTimestamp = null;
}
```

### 9.2 Batch Load Snapshots

```javascript
async function getAllCartSnapshots(database) {
    // Check cache first
    const cached = getCartCache();
    if (cached) {
        return cached;
    }

    // Batch load in 1 query (instead of N+1)
    const [allSnapshotsRef, metaSnapshot] = await Promise.all([
        database.ref('cartHistory').once('value'),
        database.ref('cartHistoryMeta').once('value')
    ]);

    // Process and cache result
    const snapshots = processSnapshots(allSnapshotsRef.val(), metaSnapshot.val());
    setCartCache(snapshots);

    return snapshots;
}
```

---

## 10. Authentication & Authorization

### Permission Checks per Page

| Page | Required Permission |
|------|---------------------|
| index.html | `permissions.livestream` |
| soluong-list.html | `permissions.livestream` |
| social-sales.html | `permissions.social` |
| hidden-soluong.html | `permissions.livestream` |
| sales-report.html | `permissions.livestream` hoặc `permissions.social` |

---

## 11. Cost Optimization Summary

### Bandwidth Savings

| Optimization | Before | After | Savings |
|--------------|--------|-------|---------|
| Tách soldQty | ~1KB per qty update | ~50 bytes | **~98%** |
| Conditional sync listeners | Always on | Only when needed | **~20%** |
| Cart cache + batch load | N+1 queries | 1 query | **~80%** |

### Monthly Cost Estimate

| Phase | Optimization | Cost Savings |
|-------|--------------|--------------|
| Phase 1 | Tách soldQty | ~$60-65/month |
| Phase 1 | Sync listeners toggle | ~$5/month |
| Phase 1 | Cart cache + batch | ~$3/month |
| **TOTAL** | | **~$68-73/month** |

**Từ ~$78/tháng → ~$5-10/tháng** (tiết kiệm ~90%)

---

## 12. File Dependencies Graph (Updated)

```
                    ┌──────────────────────┐
                    │   Firebase CDN       │
                    │ (firebase-app-compat)│
                    │ (firebase-database)  │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  index.html   │    │ soluong-list.   │    │ social-sales.   │
│               │    │ html            │    │ html            │
└───────┬───────┘    └────────┬────────┘    └────────┬────────┘
        │                     │                      │
        ▼                     ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ js/main.js    │    │ firebase-       │    │ firebase-       │
│ (ES Module)   │    │ helpers-        │    │ helpers-        │
└───────┬───────┘    │ global.js       │    │ global.js       │
        │            │ (ES Module)     │    │ (ES Module)     │
        │            └────────┬────────┘    └────────┬────────┘
        │                     │                      │
        └──────────┬──────────┴──────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ firebase-helpers.js │  ⭐ SINGLE SOURCE OF TRUTH
         │ (ES Module)         │
         │ ~950 lines          │
         └─────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ ../shared/esm/      │
         │ compat.js           │
         │ (AuthManager,       │
         │  NotificationMgr)   │
         └─────────────────────┘
```

---

## 13. Quick Reference: Firebase Paths

```javascript
// Products (static data)
database.ref('soluongProducts')                     // All products
database.ref('soluongProducts/product_123')         // Single product

// ⭐ Qty data (separate node - high frequency updates)
database.ref('soluongProductsQty')                  // All qty data
database.ref('soluongProductsQty/product_123')      // Single product qty

// Metadata
database.ref('soluongProductsMeta')                 // Products metadata
database.ref('soluongProductsMeta/sortedIds')       // Sort order array

// Sales Log
database.ref('soluongSalesLog')                     // All logs
database.ref('soluongSalesLog').orderByChild('date').equalTo('2024-01-15')

// Cart History
database.ref('cartHistory')                         // All snapshots
database.ref('cartHistoryMeta')                     // Snapshots metadata

// Sync
database.ref('soluongSyncCurrentPage')              // Current page number
database.ref('soluongSyncSearchData')               // Search keyword
database.ref('soluongDisplaySettings')              // Display settings
database.ref('soluongIsMergeVariants')              // Merge variants flag

// Hidden page specific
database.ref('hiddenSoluongDisplaySettings')        // Hidden page settings
```

---

## 14. Migration Script

File `migration-soldqty.js` cung cấp các functions để migrate data:

```javascript
// 1. Backup trước khi migrate (RUN FIRST!)
await backupFirebaseData(database);

// 2. Migrate soldQty ra node riêng
await migrateQtyToSeparateNode(database);

// 3. Kiểm tra trạng thái migration
await verifyMigrationState(database);

// 4. Rollback nếu có vấn đề
await rollbackMigration(database);

// 5. Restore từ backup (last resort)
await restoreFromBackup(database);

// 6. Xem danh sách backups
listBackups();
```

---

## 15. Metrics Summary

| Metric | Value |
|--------|-------|
| Total HTML files | 5 |
| Total JS files | 3 (main.js, firebase-helpers.js, firebase-helpers-global.js) |
| Total CSS files | 0 (all inline) |
| Estimated total lines of code | ~4000-5000 |
| External CDN dependencies | 2 (Firebase, XLSX) |
| Internal shared library usage | 4 modules |
| Firebase Realtime DB nodes | 12+ |
| External API integrations | 1 (TPOS) |

---

*Document generated: 2024-01-15*
*Last updated: 2026-01-17*
*Version: 2.0 (Post-optimization)*
