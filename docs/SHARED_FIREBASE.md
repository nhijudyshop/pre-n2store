# SHARED_FIREBASE - Firebase Configuration & Utilities

> Firebase configuration và các utilities dùng chung: user storage, image cache.

## Tổng Quan

| Module | Folders |
|--------|---------|
| `config.js` | Mỗi folder riêng (khác config) |
| `firebase-config.js` | js/ (core) |
| `user-storage-manager.js` | orders-report |
| `firebase-image-cache.js` | orders-report |

> [!IMPORTANT]
> `config.js` khác nhau giữa các folders vì chứa module-specific settings.

---

## Firebase Configuration

### Core Config (js/firebase-config.js)

```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "n2shop-69e37.firebaseapp.com",
  databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "n2shop-69e37",
  storageBucket: "n2shop-69e37.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
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
