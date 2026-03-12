# Module Template Chuẩn — N2Store

> Tài liệu mô tả cấu trúc chuẩn cho mỗi module trong hệ thống N2Store.
> Tất cả module mới PHẢI tuân theo template này. Module hiện tại sẽ được migrate dần.

## Cấu trúc thư mục

```
module-name/
├── index.html          # Entry point — trang HTML chính
├── js/
│   └── main.js         # Logic chính (ES Module hoặc script-tag tùy module)
├── styles/
│   └── main.css        # CSS riêng cho module
└── README.md           # Mô tả chức năng, cách sử dụng, dependencies
```

### Mô tả từng file

| File | Vai trò | Bắt buộc |
|---|---|---|
| `index.html` | Entry point, load Firebase SDK, shared libs, và module scripts | ✅ Có |
| `js/main.js` | Logic nghiệp vụ chính của module | ✅ Có |
| `styles/main.css` | Styles riêng cho module (nếu cần) | ❌ Không |
| `README.md` | Tài liệu mô tả chức năng, cách sử dụng | ✅ Có |

## Firebase Configuration

### Nguyên tắc quan trọng

**KHÔNG tạo file Firebase config cục bộ trong module.** Tất cả module PHẢI sử dụng Firebase config từ shared library.

### Hai file Firebase config trong shared

| File | Loại | Dùng khi |
|---|---|---|
| `shared/browser/firebase-config.js` | ES Module (source of truth) | Module sử dụng `import` / ES Modules |
| `shared/js/firebase-config.js` | Script-tag wrapper | Module sử dụng `<script>` tags truyền thống |

Cả hai file chứa cùng config, nhưng khác cách export:
- **ES Module** (`shared/browser/`): dùng `export` / `import`
- **Script-tag** (`shared/js/`): gán vào `window.*` để dùng global

### Import pattern cho ES Modules

```javascript
// Trong js/main.js (ES Module)
import {
    FIREBASE_CONFIG,
    initializeFirestore,
    initializeRealtimeDB
} from '/shared/browser/firebase-config.js';

// Sử dụng
const db = initializeFirestore();
const rtdb = initializeRealtimeDB();
```

### Import pattern cho Script Tags

```html
<!-- Trong index.html — load shared config TRƯỚC module scripts -->
<script src="../shared/js/firebase-config.js"></script>
<script src="js/main.js"></script>
```

```javascript
// Trong js/main.js (script-tag)
// Firebase đã được khởi tạo bởi shared/js/firebase-config.js
// Các hàm global có sẵn: initializeFirestore(), initializeRealtimeDB(), getFirestore(), getRealtimeDB()

const db = getFirestore();       // Firestore instance
const rtdb = getRealtimeDB();    // Realtime Database instance
```

## Import pattern cho Shared Libraries

### Script-tag modules

```html
<!-- index.html — thứ tự load quan trọng -->

<!-- 1. Firebase SDKs -->
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js"></script>
<!-- Thêm SDK khác nếu cần: firebase-database-compat, firebase-storage-compat -->

<!-- 2. Shared libraries -->
<script src="../shared/js/firebase-config.js"></script>
<script src="../shared/js/shared-auth-manager.js"></script>
<script src="../shared/js/shared-cache-manager.js"></script>
<script src="../shared/js/notification-system.js"></script>

<!-- 3. Module scripts -->
<script src="js/main.js"></script>
```

### ES Module modules

```html
<!-- index.html -->
<script type="module" src="js/main.js"></script>
```

```javascript
// js/main.js
import { initializeFirestore } from '/shared/browser/firebase-config.js';
import { PermissionHelper } from '/shared/js/permissions-helper.js';
import { CacheManager } from '/shared/js/shared-cache-manager.js';
```

## Naming Convention

| Loại | Convention | Ví dụ |
|---|---|---|
| Thư mục module | kebab-case | `customer-hub/`, `order-management/` |
| File JavaScript | kebab-case | `main.js`, `crud-operations.js` |
| File CSS | kebab-case | `main.css`, `table-styles.css` |
| Biến / hàm JS | camelCase | `loadData()`, `currentFilters` |
| Constants | UPPER_SNAKE_CASE | `APP_CONFIG`, `FIREBASE_CONFIG` |
| DOM IDs | camelCase | `tableBody`, `editModal` |
| CSS classes | kebab-case | `.table-container`, `.btn-primary` |

## Checklist tạo module mới

- [ ] Tạo thư mục `module-name/` theo kebab-case
- [ ] Tạo `index.html` với Firebase SDK và shared library imports
- [ ] Tạo `js/main.js` — import Firebase config từ shared (KHÔNG copy config cục bộ)
- [ ] Tạo `styles/main.css` nếu cần styles riêng
- [ ] Tạo `README.md` mô tả chức năng và dependencies
- [ ] Đăng ký module trong `PAGES_REGISTRY` (nếu cần phân quyền)
- [ ] Test: xác nhận Firebase init hoạt động từ shared config
- [ ] Test: xác nhận phân quyền hoạt động qua PermissionHelper

## Lưu ý quan trọng

1. **KHÔNG copy Firebase config** vào module — luôn import từ `shared/`
2. **KHÔNG chuyển đổi** module script-tag sang ES Module nếu không cần thiết
3. **Giữ nguyên** cách load hiện tại (script-tag hoặc ES Module) của mỗi module
4. **Config riêng** của module (API endpoints, constants) vẫn đặt trong `js/config.js` của module — chỉ Firebase config phải dùng shared
