# IMPROVE WEBSITE - CHANGELOG & TRACKING

> File này ghi lại TẤT CẢ thay đổi trong quá trình cải tiến website.
> Mục đích: Theo dõi, debug, và revert nếu cần.

---

## TỔNG QUAN PLAN B - QUICK WINS

| Phase | Task | Status | Impact |
|-------|------|--------|--------|
| 1.1 | Thêm `defer` cho External Scripts | ✅ DONE | FCP +20-40% |
| 1.2 | Xóa duplicate cache.js | ⏸️ SKIP | Code consistency |
| 1.3 | Logger production mode | ⏳ Pending | Reduce console noise |
| 1.4 | Pin Lucide version | ✅ DONE | CDN cache efficiency |
| 2.1 | Bundle core utilities | ✅ DONE | Reduce HTTP requests 8→1 |
| 2.2 | Image optimization | ⏳ Pending | Page weight -40-70% |

---

# PHASE 1: QUICK WINS

---

## 1.1 THÊM `defer` CHO EXTERNAL SCRIPTS + 1.4 PIN LUCIDE VERSION

### Mục tiêu
- Thêm `defer` attribute cho các external scripts
- Cải thiện First Contentful Paint (FCP) 20-40%
- Pin version cho CDN scripts (tránh @latest)

### Pattern thay đổi
```html
<!-- BEFORE -->
<script src="https://unpkg.com/lucide@latest"></script>

<!-- AFTER -->
<script defer src="https://unpkg.com/lucide@0.294.0/dist/umd/lucide.min.js"></script>
```

### Files đã sửa (22 files total)

| # | File | Status |
|---|------|--------|
| 1 | AI/gemini.html | ✅ Done |
| 2 | balance-history/index.html | ✅ Done |
| 3 | bangkiemhang/index.html | ✅ Done |
| 4 | ck/index.html | ✅ Done |
| 5 | firebase-stats/index.html | ✅ Done |
| 6 | hanghoan/index.html | ✅ Done |
| 7 | hangrotxa/index.html | ✅ Done |
| 8 | ib/index.html | ✅ Done |
| 9 | inventory-tracking/index.html | ✅ Done |
| 10 | invoice-compare/index.html | ✅ Done |
| 11 | issue-tracking/index.html | ✅ Done |
| 13 | live/index.html | ✅ Done |
| 14 | livestream/index.html | ✅ Done |
| 15 | nhanhang/index.html | ✅ Done |
| 16 | order-management/index.html | ✅ Done |
| 17 | orders-report/main.html | ✅ Done |
| 18 | purchase-orders/index.html | ✅ Done |
| 19 | sanphamlive/index.html | ✅ Done |
| 20 | soorder/index.html | ✅ Done |
| 21 | tpos-pancake/index.html | ✅ Done |
| 22 | user-management/index.html | ✅ Done |

### Cách revert
```bash
# Revert tất cả HTML files về trạng thái trước
git checkout HEAD~1 -- "**/*.html"

# Hoặc revert từng file
git checkout HEAD~1 -- balance-history/index.html
```

---

## 1.2 XÓA DUPLICATE cache.js

### Phân tích
- File `orders-report/js/core/cache.js` là enhanced version với IndexedDB support
- Đã có comment "SOURCE OF TRUTH: /shared/browser/cache-manager.js"
- File này là script-tag compatible version, adapted cho specific use case

### Kết luận
- **SKIP** - File này thực ra là một adapted version với IndexedDB migration support
- Không phải duplicate đơn thuần, có thêm tính năng khác

### Status: ⏸️ SKIPPED

---

## 1.3 LOGGER PRODUCTION MODE

### Mục tiêu
- Disable 1,800+ console.log trong production
- Sử dụng `overrideConsoleInProduction()` từ shared logger

### Top files cần sửa (nhiều console.log nhất)

| # | File | console.log count | Status |
|---|------|-------------------|--------|
| 1 | orders-report/js/tab1/tab1-chat.js | 241 | ⏳ |
| 2 | orders-report/js/managers/pancake-data-manager.js | 119 | ⏳ |
| 3 | orders-report/js/tab3/tab3-product-assignment.js | 106 | ⏳ |

### Pattern thay đổi
```javascript
// Thêm vào đầu file
import { overrideConsoleInProduction } from '/shared/browser/logger.js';
overrideConsoleInProduction();
```

---

# PHASE 2: MEDIUM-TERM IMPROVEMENTS

---

## 2.1 BUNDLE CORE UTILITIES

### Mục tiêu
- Tạo script bundle thay vì load 8 scripts tuần tự
- Giảm HTTP requests từ 8 → 1

### Files mới tạo

| # | File | Purpose | Status |
|---|------|---------|--------|
| 1 | build-scripts/bundle-core.js | Bundle script | ✅ DONE |
| 2 | shared/js/shared-core-bundle.js | Bundled output (92.42 KB) | ✅ DONE |
| 3 | shared/js/shared-core-bundle.min.js | Minified (51.42 KB, -44.4%) | ✅ DONE |

### Files được bundle (theo thứ tự)

| # | File | Size |
|---|------|------|
| 1 | logger.js | 2.50 KB |
| 2 | dom-utils.js | 4.13 KB |
| 3 | common-utils.js | 32.95 KB |
| 4 | date-utils.js | 6.21 KB |
| 5 | form-utils.js | 6.01 KB |
| 6 | shared-cache-manager.js | 8.55 KB |
| 7 | notification-system.js | 18.17 KB |
| 8 | shared-auth-manager.js | 10.44 KB |
| **Total** | | **88.95 KB** |

### Cách sử dụng

```html
<!-- BEFORE: 8 separate requests -->
<script src="../shared/js/logger.js"></script>
<script src="../shared/js/dom-utils.js"></script>
<script src="../shared/js/common-utils.js"></script>
<script src="../shared/js/date-utils.js"></script>
<script src="../shared/js/form-utils.js"></script>
<script src="../shared/js/shared-cache-manager.js"></script>
<script src="../shared/js/notification-system.js"></script>
<script src="../shared/js/shared-auth-manager.js"></script>

<!-- AFTER: 1 request -->
<script src="../shared/js/shared-core-bundle.js"></script>
<!-- or minified version -->
<script src="../shared/js/shared-core-bundle.min.js"></script>
```

### Lưu ý
- `firebase-config.js` và `navigation-modern.js` vẫn load riêng (có dependencies riêng)
- Bundle tự động khởi tạo `authManager` và `notificationManager`
- Dispatch event `coreUtilitiesLoaded` khi load xong

---

## 2.2 IMAGE OPTIMIZATION

### Mục tiêu
- Optimize images với sharp
- Convert to WebP

### Files cần optimize

| # | File | Original Size | Optimized Size | Status |
|---|------|---------------|----------------|--------|
| 1 | index/logo.jpg | | | ⏳ |
| 2 | issue-tracking/images/*.png | | | ⏳ |

---

# CHANGELOG CHI TIẾT

## [Date: 2026-01-19]

### Added
- improve_website.md - File tracking changes

### Changed
- 22 HTML files: Added `defer` attribute to Lucide script
- 22 HTML files: Pinned Lucide version from @latest to @0.294.0

### Removed
- None

### Fixed
- issue-tracking/index.html: Thêm defer + pin Lucide (bị miss ở lần audit đầu)
- order-management/index.html: Thêm defer + pin Lucide (bị miss ở lần audit đầu)

---

# AUDIT NOTES

## Audit Date: 2026-01-19 (Session 2)

### Phát hiện lỗi
1. **2 files bị miss** - issue-tracking và order-management chưa được sửa
   - ✅ ĐÃ FIX

### Cảnh báo
1. **22 files .min.html cũ** - Vẫn chứa `lucide@latest`
   - Cần chạy: `node build-scripts/minify-all.js` để regenerate
   - Các file .min.html là bản minified, sẽ tự động cập nhật khi chạy build

### Kết luận Track B Phase 1
- ✅ 1.1 Thêm `defer` - HOÀN THÀNH (22/22 files)
- ⏸️ 1.2 Xóa duplicate cache.js - SKIP (không phải duplicate)
- ⏳ 1.3 Logger production mode - PENDING
- ✅ 1.4 Pin Lucide version - HOÀN THÀNH (22/22 files)

---

# HOW TO REVERT

## Revert toàn bộ
```bash
git checkout HEAD~N -- .
```

## Revert từng file
```bash
git checkout HEAD~1 -- path/to/file
```

## Xem history của file
```bash
git log --oneline path/to/file
```
