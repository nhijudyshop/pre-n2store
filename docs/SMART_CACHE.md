# Smart Cache System

## Tổng quan

Hệ thống Smart Cache được thiết kế để quản lý bộ nhớ hiệu quả, tránh tràn bộ nhớ khi sử dụng lâu dài.

---

## Cấu hình

```javascript
cacheConfig = {
    maxSize: 200,              // Tối đa 200 entries mỗi cache
    ttl: 10 * 60 * 1000,       // 10 phút TTL (Time To Live)
    cleanupInterval: 5 * 60 * 1000  // Cleanup mỗi 5 phút
}
```

---

## Các cơ chế hoạt động

### 1. LRU Eviction (Least Recently Used)

Khi cache đạt `maxSize`, tự động xóa 20% entries cũ nhất:

```javascript
// Khi thêm entry mới và cache đầy
if (cache.size >= maxSize) {
    evictOldestEntries(cache, maxSize * 0.2);  // Xóa 20% cũ nhất
}
```

### 2. TTL Expiration

Mỗi entry có timestamp, tự động hết hạn sau `ttl` ms:

```javascript
// Khi get entry
if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);  // Xóa entry hết hạn
    return null;
}
```

### 3. Periodic Cleanup

Mỗi `cleanupInterval`, tự động quét và xóa entries hết hạn:

```javascript
setInterval(() => {
    cleanupExpiredCache();
}, cleanupInterval);
```

### 4. Clear on Context Switch

Khi chuyển campaign/page, xóa toàn bộ cache:

```javascript
onLiveCampaignChange(campaignId) {
    this.clearAllCaches();  // Giải phóng bộ nhớ
    // ...load new data
}
```

---

## API Reference

### Partner Cache

```javascript
// Lưu partner info với timestamp
setPartnerCache(userId, partnerData)

// Lấy partner info (trả null nếu hết hạn hoặc không có)
getPartnerCache(userId)  // Returns: partnerData | null
```

### Debt Cache

```javascript
// Lưu công nợ với timestamp
setDebtCache(phone, amount)

// Lấy công nợ (trả null nếu hết hạn)
getDebtCache(phone)  // Returns: number | null
```

### Utilities

```javascript
// Xóa toàn bộ cache (gọi khi chuyển context)
clearAllCaches()

// Dọn dẹp entries hết hạn (tự động gọi định kỳ)
cleanupExpiredCache()

// Xóa N entries cũ nhất
evictOldestEntries(cacheMap, count)

// Lấy thống kê cache (debug)
getCacheStats()
// Returns: { partnerCache: 45, debtCache: 30, maxSize: 200, ttlMinutes: 10 }
```

---

## Cấu trúc dữ liệu

### Cache Entry Format

```javascript
// Partner Cache
partnerCache.set(userId, {
    data: { Id: 123, Name: "...", Phone: "...", ... },
    timestamp: 1704067200000  // Date.now()
});

// Debt Cache
debtCache.set(phone, {
    amount: 1500000,
    timestamp: 1704067200000
});
```

---

## Ví dụ sử dụng

### Lưu và lấy Partner

```javascript
// Lưu partner
this.setPartnerCache('user123', {
    Id: 560848,
    Name: 'Nguyễn Văn A',
    Phone: '0901234567',
    Street: '123 ABC, Q1, HCM'
});

// Lấy partner (tự động check TTL)
const partner = this.getPartnerCache('user123');
if (partner) {
    console.log('Partner:', partner.Name);
} else {
    // Cache miss hoặc hết hạn - cần fetch lại
    await this.getPartnerInfo('user123');
}
```

### Lưu và lấy Debt

```javascript
// Lưu debt
this.setDebtCache('0901234567', 1500000);

// Lấy debt
const debt = this.getDebtCache('0901234567');
if (debt !== null) {
    console.log('Công nợ:', debt);
}
```

### Debug Cache

```javascript
// Xem thống kê cache
const stats = this.getCacheStats();
console.log('Cache stats:', stats);
// { partnerCache: 45, debtCache: 30, sessionIndexMap: 100, maxSize: 200, ttlMinutes: 10 }
```

---

## Flow hoạt động

```
┌─────────────────────────────────────────────────────────────────┐
│                     SMART CACHE FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────┐   │
│  │ Request  │───▶│ Check Cache │───▶│ Entry exists & valid? │   │
│  │ Data     │    │             │    │                      │   │
│  └──────────┘    └─────────────┘    └──────────┬───────────┘   │
│                                                 │               │
│                    ┌────────────────────────────┼───────────┐   │
│                    │                            │           │   │
│                    ▼                            ▼           │   │
│            ┌─────────────┐              ┌─────────────┐     │   │
│            │ YES: Return │              │ NO: Fetch   │     │   │
│            │ cached data │              │ from API    │     │   │
│            └─────────────┘              └──────┬──────┘     │   │
│                                                │            │   │
│                                                ▼            │   │
│                                        ┌─────────────┐      │   │
│                                        │ Cache full? │      │   │
│                                        └──────┬──────┘      │   │
│                                               │             │   │
│                         ┌─────────────────────┼─────────┐   │   │
│                         │                     │         │   │   │
│                         ▼                     ▼         │   │   │
│                 ┌─────────────┐       ┌─────────────┐   │   │   │
│                 │ YES: Evict  │       │ NO: Store   │   │   │   │
│                 │ 20% oldest  │──────▶│ with        │   │   │   │
│                 └─────────────┘       │ timestamp   │   │   │   │
│                                       └─────────────┘   │   │   │
│                                                         │   │   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   PERIODIC CLEANUP (5 min)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌─────────────────┐    ┌───────────────┐  │
│  │ Timer fires  │───▶│ Scan all caches │───▶│ Delete        │  │
│  │ every 5 min  │    │                 │    │ expired       │  │
│  └──────────────┘    └─────────────────┘    │ entries       │  │
│                                             │ (TTL > 10min) │  │
│                                             └───────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Best Practices

| Tình huống | Cách xử lý |
|------------|------------|
| Chuyển campaign/page | Gọi `clearAllCaches()` |
| Cần data mới nhất | Xóa entry cụ thể rồi fetch lại |
| Debug memory | Dùng `getCacheStats()` |
| Tùy chỉnh TTL | Sửa `cacheConfig.ttl` |
| Tùy chỉnh max size | Sửa `cacheConfig.maxSize` |

---

## Lưu ý quan trọng

1. **Không truy cập cache trực tiếp** - Luôn dùng `getPartnerCache()`, `setPartnerCache()` thay vì `partnerCache.get()`, `partnerCache.set()`

2. **Cache có thể trả về null** - Luôn kiểm tra kết quả trước khi sử dụng

3. **Timestamp tự động cập nhật** - Khi `get` thành công, timestamp được refresh (LRU behavior)

4. **Cleanup không block UI** - Chạy async trong background

---

*Cập nhật: 2026-01*
