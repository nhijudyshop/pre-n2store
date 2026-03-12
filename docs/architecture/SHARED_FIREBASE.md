# SHARED_FIREBASE - Firebase Configuration & Utilities

> Centralized Firebase configuration và các utilities dùng chung.

## File Locations

| Type | Path | Description |
|------|------|-------------|
| **ES Module (SOURCE OF TRUTH)** | `/shared/browser/firebase-config.js` | Modern ES module |
| Script-Tag Compatible | `/shared/js/firebase-config.js` | Legacy window.* export |

## Troubleshooting - Import Errors

Nếu gặp lỗi khi load Firebase config:

```bash
# Kiểm tra path trong HTML
grep -r 'firebase-config' . --include="*.html"

# Path đúng:
<script src="../shared/js/firebase-config.js"></script>

# Hoặc dùng ES Module:
import { initializeFirestore, initializeRealtimeDB } from '/shared/browser/firebase-config.js';
```

---

## Tổng Quan

| Module | Path | Description |
|--------|------|-------------|
| `firebase-config.js` | `/shared/js/` | Core config + init functions |
| `firebase-config.js` | `/shared/browser/` | ES Module (SOURCE OF TRUTH) |
| `firebase-helpers.js` | `soluong-live/`, `order-management/` | Module-specific RTDB helpers |
| `user-storage-manager.js` | `orders-report/` | Per-user storage |
| `firebase-image-cache.js` | `orders-report/` | Image cache |

---

## Firebase Services

| Service | Use Case | Folders |
|---------|----------|---------|
| **Firestore** | Document database, offline sync | sanphamlive, inventory |
| **Realtime Database** | Live updates, simpler data | soluong-live, order-management, issue-tracking |

---

## API Reference

### Initialization Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `initializeFirebaseApp()` | `() → boolean` | Core Firebase app init |
| `initializeFirestore()` | `(options?) → db\|null` | Firestore with persistence |
| `initializeRealtimeDB()` | `() → db\|null` | Realtime Database |

### Getter Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getFirestore()` | `() → db\|null` | Get Firestore (auto-init) |
| `getRealtimeDB()` | `() → db\|null` | Get RTDB (auto-init) |
| `isFirebaseInitialized()` | `() → boolean` | Check init status |
| `getRef()` | `(path: string) → ref\|null` | Get RTDB reference |

### Constants

| Constant | Description |
|----------|-------------|
| `FIREBASE_CONFIG` | Firebase configuration object |
| `FIRESTORE_COLLECTIONS` | Firestore collection names |
| `RTDB_PATHS` | Realtime Database paths |

---

## Usage Examples

### Script Tag (Legacy)

```html
<!-- Load Firebase SDK first -->
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>

<!-- Load config -->
<script src="../shared/js/firebase-config.js"></script>

<script>
// For Firestore
const db = initializeFirestore();

// For Realtime Database
const rtdb = initializeRealtimeDB();
</script>
```

### ES Module (Modern)

```javascript
import {
    initializeFirestore,
    initializeRealtimeDB,
    getRef,
    RTDB_PATHS
} from '/shared/browser/firebase-config.js';

// Firestore
const db = initializeFirestore();

// Realtime Database
const rtdb = initializeRealtimeDB();
const productsRef = getRef(RTDB_PATHS.SOLUONG_PRODUCTS);
```

---

## Firebase Configuration

```javascript
const FIREBASE_CONFIG = {
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

### Module Configs

| Folder | Settings |
|--------|----------|
| orders-report | Firebase + TPOS endpoints |
| balance-history | Firebase + SePay endpoints |
| bangkiemhang | Firebase only |
| tpos-pancake | Firebase + Pancake endpoints |

---

## UserStorageManager

### Purpose
Storage per-user với Firebase priority.

### Methods

| Method | Mô tả |
|--------|-------|
| `getUserIdentifier()` | Lấy user ID từ auth |
| `getUserFirebasePath(basePath)` | Build path: `{base}/{userId}` |
| `getUserLocalStorageKey(baseKey)` | Build key: `{key}_{userId}` |
| `saveToAll(db, path, key, data)` | Save Firebase + localStorage |
| `loadFromAll(db, path, key)` | Load Firebase → fallback localStorage |
| `listenToFirebase(db, path, callback)` | Realtime listener |

### Example

```javascript
// Save to both Firebase and localStorage
await userStorageManager.saveToAll(
  database,
  'user_settings',
  'settings',
  { theme: 'dark' }
);

// Load with fallback
const settings = await userStorageManager.loadFromAll(
  database,
  'user_settings',
  'settings'
);
```

---

## FirebaseImageCache

### Purpose
Cache ảnh sản phẩm đã upload lên Pancake.

### Methods

| Method | Mô tả |
|--------|-------|
| `get(productId)` | Lấy cached image URL |
| `set(productId, name, url)` | Lưu image URL |
| `clear(productId)` | Xóa cache |
| `getAll()` | Debug: lấy tất cả |

### Firebase Path

```
pancake_images/{productId}
  - name: "Sản phẩm ABC"
  - url: "https://..."
  - timestamp: 1704164400000
```

---

## Common Firebase Paths

| Path | Module | Mô tả |
|------|--------|-------|
| `order_tags/` | orders-report | Tags đơn hàng |
| `held_products/` | orders-report | SP đang giữ |
| `dropped_products/` | orders-report | Hàng rớt-xả |
| `kpi_base/` | orders-report | KPI base snapshots |
| `kpi_statistics/` | orders-report | Thống kê KPI |
| `pancake_jwt_tokens/` | tpos-pancake | Pancake accounts |
| `pancake_images/` | orders-report | Image cache |
| `message_templates/` | orders-report | Templates tin nhắn |
| `quick_replies/` | orders-report | Quick replies |

---

## Xem thêm

- [orders-report/config.js](file:///Users/mac/Downloads/n2store/orders-report/config.js) - Full config với TPOS
- [orders-report/user-storage-manager.js](file:///Users/mac/Downloads/n2store/orders-report/user-storage-manager.js) - User storage implementation
- [orders-report/firebase-image-cache.js](file:///Users/mac/Downloads/n2store/orders-report/firebase-image-cache.js) - Image cache implementation
