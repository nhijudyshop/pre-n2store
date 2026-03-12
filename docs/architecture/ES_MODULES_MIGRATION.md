# Orders-Report ES Modules Migration Guide

## Tổng quan

Đã tạo cấu trúc ES modules cho orders-report. Các file cũ vẫn hoạt động, nhưng có thể migrate dần sang ES modules.

## Cấu trúc mới

```
orders-report/
├── js/
│   ├── app.js                    # Entry point (ES Module)
│   ├── modules/
│   │   ├── core/
│   │   │   ├── index.js          # Core exports
│   │   │   ├── api-config.js     # API configuration
│   │   │   ├── config.js         # App config & Firebase
│   │   │   ├── auth.js           # Authentication
│   │   │   └── notification-system.js
│   │   ├── managers/             # (Pending)
│   │   ├── utils/                # (Pending)
│   │   └── tab1/                 # (Pending)
│   └── core/                     # Legacy files (script-tag)
```

## Cách sử dụng ES Modules

### 1. Trong HTML (Đơn giản nhất)

```html
<!-- Thay thế nhiều script tags bằng 1 module -->
<script type="module" src="js/app.js"></script>

<!-- Các script tags khác vẫn hoạt động nhờ window.* exports -->
<script src="js/tab1/tab1-core.js"></script>
```

### 2. Trong JavaScript file khác

```javascript
// Import từ app.js
import {
    tokenManager,
    cacheManager,
    API_CONFIG,
    showToast,
} from './app.js';

// Sử dụng
const token = await tokenManager.getToken();
showToast('Hello!', 'success');
```

### 3. Import trực tiếp từ shared

```javascript
import { fetchWithRetry } from '../../shared/universal/index.js';
import { TokenManager } from '../../shared/browser/index.js';
```

## Migration từng bước

### Bước 1: Thêm app.js vào HTML (Đã sẵn sàng)

```html
<!-- Thêm sau Firebase scripts -->
<script type="module" src="js/app.js"></script>

<!-- Giữ các script tags cũ - chúng dùng window.* -->
```

**Lợi ích ngay lập tức:**
- ✅ Dùng shared modules (IndexedDB, CacheManager, TokenManager)
- ✅ Auto-fallback server với SmartFetch
- ✅ Các file cũ vẫn hoạt động

### Bước 2: Xóa dần script tags trùng lặp

Sau khi thêm app.js, có thể xóa:
```html
<!-- Xóa - đã có trong app.js -->
<!-- <script src="js/core/indexeddb-storage.js"></script> -->
<!-- <script src="js/core/cache.js"></script> -->
<!-- <script src="js/core/token-manager.js"></script> -->
<!-- <script src="js/managers/pancake-token-manager.js"></script> -->
<!-- <script src="js/core/api-config.js"></script> -->
```

### Bước 3: Convert file-by-file (Tùy chọn)

Khi cần sửa file nào, convert sang ES module:

```javascript
// Trước: js/managers/some-manager.js
class SomeManager {
    constructor() { ... }
}
window.someManager = new SomeManager();

// Sau: js/modules/managers/some-manager.js
export class SomeManager {
    constructor() { ... }
}
export const someManager = new SomeManager();
export default someManager;
```

## Backward Compatibility

app.js expose tất cả ra window.* nên code cũ vẫn hoạt động:

```javascript
// Cả hai cách đều hoạt động
window.tokenManager.getToken()  // Legacy
import { tokenManager } from './app.js';  // Modern
```

## Files đã convert

| Legacy File | ES Module |
|-------------|-----------|
| `js/core/api-config.js` | `js/modules/core/api-config.js` |
| `js/core/config.js` | `js/modules/core/config.js` |
| `js/core/auth.js` | `js/modules/core/auth.js` |
| `js/core/notification-system.js` | `js/modules/core/notification-system.js` |
| `js/core/indexeddb-storage.js` | Dùng từ `/shared/browser/` |
| `js/core/cache.js` | Dùng từ `/shared/browser/` |
| `js/core/token-manager.js` | Dùng từ `/shared/browser/` |
| `js/managers/pancake-token-manager.js` | Dùng từ `/shared/browser/` |

## Lưu ý

1. **Firebase SDK** vẫn load qua script tag (CDN)
2. **Lucide Icons** vẫn load qua script tag (CDN)
3. **XLSX.js** vẫn load qua script tag (CDN)
4. ES Modules cần server (không chạy được từ file://)
5. Browsers cũ (IE11) không hỗ trợ ES modules
