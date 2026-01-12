# SHARED_CACHE - Hệ Thống Cache Dùng Chung

> Module quản lý cache với localStorage persistence và auto-cleanup.

## Tổng Quan

| File | Folders |
|------|---------|
| `cache.js` | orders-report, balance-history, bangkiemhang, tpos-pancake, hangdat |
| `shared-cache-manager.js` | js/ (wrapper cho core-loader) |

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

```javascript
// Basic usage
cacheManager.set('my_data', { foo: 'bar' }, 'medium');
const data = cacheManager.get('my_data', 'medium');

// Invalidate all order caches
cacheManager.invalidatePattern(/^orders_/);

// Statistics
const stats = cacheManager.getStats();
console.log(`Hit rate: ${stats.hitRate}%`);
```

---

## Xem thêm

- [orders-report/cache.js](file:///Users/mac/Downloads/n2store/orders-report/cache.js) - Phiên bản đầy đủ nhất
- [js/shared-cache-manager.js](file:///Users/mac/Downloads/n2store/js/shared-cache-manager.js) - Wrapper cho core-loader
