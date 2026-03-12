# SHARED_CACHE - Hệ Thống Cache Dùng Chung

> Module quản lý cache với localStorage persistence và auto-cleanup.

## File Locations

| Type | Path | Description |
|------|------|-------------|
| **ES Module (SOURCE OF TRUTH)** | `/shared/browser/persistent-cache.js` | Modern ES module |
| Script-Tag Compatible | `/shared/js/shared-cache-manager.js` | Legacy window.* export |

## Troubleshooting - Import Errors

Nếu gặp lỗi khi load CacheManager:

```bash
# Kiểm tra path trong HTML
grep -r '../js/' . --include="*.html"

# Path đúng:
<script src="../shared/js/shared-cache-manager.js"></script>

# Hoặc dùng ES Module:
import { PersistentCacheManager } from '/shared/browser/persistent-cache.js';
```

## Tổng Quan

| File | Folders |
|------|---------|
| `cache.js` | orders-report, balance-history, bangkiemhang, tpos-pancake |
| `shared-cache-manager.js` | /shared/js/ (wrapper cho core-loader) |

> [!NOTE]
> Các versions khác nhau về TTL và cache keys, nhưng API giống nhau.

---

## CacheManager Class

### Methods

| Method | Signature | Mô tả |
|--------|-----------|-------|
| `set()` | `(key, value, type?) → void` | Lưu vào cache |
| `get()` | `(key, type?) → any\|null` | Lấy từ cache (tự xóa expired) |
| `clear()` | `(type?) → void` | Xóa cache theo type |
| `cleanExpired()` | `() → void` | Dọn entries hết hạn |
| `invalidatePattern()` | `(pattern) → void` | Xóa theo regex pattern |
| `getStats()` | `() → object` | Hit/miss statistics |

### Cache Types & TTL

| Type | TTL (orders-report) | Mô tả |
|------|---------------------|-------|
| `short` | 5 phút | Realtime data (debt, unread) |
| `medium` | 1 giờ | Semi-static data |
| `long` | 24 giờ | Static data (carriers, products) |
| `permanent` | Không hết hạn | Config, settings |

### Auto-Clean

Tự động clean expired entries mỗi **5 phút** (interval).

---

## Common Cache Keys

| Key | TTL | Folders | Mô tả |
|-----|-----|---------|-------|
| `tpos_delivery_carriers` | 24h | orders-report | Đối tác giao hàng |
| `orders_phone_debt_cache` | 5 phút | orders-report | Công nợ theo SĐT |
| `orders_phone_qr_cache` | Permanent | orders-report | QR code theo SĐT |
| `standard_price_cache_v1` | 6 giờ | orders-report | Giá vốn sản phẩm |
| `product_excel_cache` | Variable | orders-report | Excel products |

---

## Sử Dụng

### Script Tag (Legacy)

```html
<script src="../shared/js/shared-cache-manager.js"></script>

<script>
// Basic usage
cacheManager.set('my_data', { foo: 'bar' }, 'medium');
const data = cacheManager.get('my_data', 'medium');

// Invalidate all order caches
cacheManager.invalidatePattern(/^orders_/);

// Statistics
const stats = cacheManager.getStats();
console.log(`Hit rate: ${stats.hitRate}%`);
</script>
```

### ES Module (Modern)

```javascript
import { PersistentCacheManager, getPersistentCache } from '/shared/browser/persistent-cache.js';

// Get singleton
const cache = getPersistentCache();

// Basic usage
cache.set('my_data', { foo: 'bar' }, 'medium');
const data = cache.get('my_data', 'medium');

// Statistics
const stats = cache.getStats();
console.log(`Hit rate: ${stats.hitRate}`);
```

---

## Xem thêm

- [/shared/browser/persistent-cache.js](../shared/browser/persistent-cache.js) - ES Module (SOURCE OF TRUTH)
- [/shared/js/shared-cache-manager.js](../shared/js/shared-cache-manager.js) - Script-tag version
- [/shared/README.md](../shared/README.md) - Full shared library documentation
