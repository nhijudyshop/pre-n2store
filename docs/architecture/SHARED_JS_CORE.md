# SHARED_JS_CORE - Core Utilities trong /shared/js

> Các modules core dùng chung cho toàn bộ dự án, load qua `core-loader.js`.
>
> **Location**: `/shared/js/` (moved from `/js/`)

## Troubleshooting - Import Path Errors

Nếu gặp lỗi `404 Not Found` khi load scripts:

```bash
# Kiểm tra còn path cũ không
grep -r '../js/' . --include="*.html"

# Path đúng phải là:
../shared/js/core-loader.js
../shared/js/navigation-modern.js
../shared/js/common-utils.js
```

## Tổng Quan Sử Dụng

| File | Size | Số folders import |
|------|------|-------------------|
| **`navigation-modern.js`** | 120KB | 15+ folders |
| **`common-utils.js`** | 33KB | 12+ folders |
| **`core-loader.js`** | 2.5KB | 12+ folders |
| `shared-auth-manager.js` | 9.8KB | 3 folders |
| `shared-cache-manager.js` | 8.1KB | 3 folders |
| `firebase-config.js` | 5.2KB | Many folders (Firestore + RTDB) |
| `notification-system.js` | 12KB | Many folders (toasts + confirm) |
| `permissions-helper.js` | 19KB | Via core-loader |
| `ai-chat-widget.js` | 36KB | Dynamic inject |

---

## core-loader.js

### Purpose
Loader tự động load các core utilities theo đúng thứ tự.

### Usage

```html
<script src="../shared/js/core-loader.js"></script>
```

### Load Order

```javascript
const coreUtilities = [
    'logger.js',                    // 1. Logger
    'firebase-config.js',           // 2. Firebase config
    'dom-utils.js',                 // 3. DOM utilities
    'event-manager.js',             // 4. Event management
    'shared-cache-manager.js',      // 5. Cache manager
    'shared-auth-manager.js',       // 6. Auth manager
    'permissions-helper.js'         // 7. Permission system
];
```

### Events

```javascript
// Listen for all utilities loaded
document.addEventListener('coreUtilitiesLoaded', (e) => {
    console.log('Loaded:', e.detail.loadedCount);
});

// Check flag
if (window.CORE_UTILITIES_LOADED) { ... }
```

---

## common-utils.js

### Purpose
Các tiện ích giao diện chung: alerts, loading, blocking.

### SOURCE OF TRUTH
ES Module version: `/shared/browser/common-utils.js`

### Functions

| Function | Mô tả |
|----------|-------|
| `showStatusMessage(msg, type)` | Status bar message |
| `showFloatingAlert(msg, type, duration)` | Floating alert |
| `hideFloatingAlert()` | Ẩn alert |
| `showLoading(msg)` | Loading với page block |
| `showSuccess(msg, duration)` | Success + unblock |
| `showError(msg, duration)` | Error + unblock |
| `blockPageInteractions()` | Khóa tương tác |
| `unblockPageInteractions()` | Mở khóa |
| `forceUnblockPage()` | Force unblock (emergency) |

### FloatingAlert Types

- `info` (default)
- `loading` (với spinner)
- `success` (green)
- `error` (red)

---

## navigation-modern.js

### Purpose
Navigation system với sidebar, responsive, permission-based menu.

### Features
- Sidebar navigation (desktop)
- Bottom navigation (mobile)
- Permission-based menu items
- Active page highlighting
- Mobile hamburger menu
- Custom menu name từ Firebase

### CSS

| Platform | Source |
|----------|--------|
| **Desktop** | `modern.css` (file riêng, load qua `<link>`) |
| **Mobile** | Inject inline trong JS qua `injectMobileStyles()` |

> Desktop sidebar styles được định nghĩa trong `modern.css` của từng module.

### Exports

```javascript
window.navigationManager       // UnifiedNavigationManager instance
window.MenuNameUtils           // Custom menu name utilities
window.UnifiedNavigationManager // Class constructor
```

---

## permissions-helper.js

### Purpose
Global permission system kiểm tra quyền truy cập.

### Usage

```javascript
if (hasGlobalPermission('orders', 'edit')) {
    showEditButton();
}
```

---

## Các Files Hỗ Trợ

| File | Mô tả | ES Module Source |
|------|-------|------------------|
| `logger.js` | Console logging với levels | `/shared/browser/logger.js` |
| `dom-utils.js` | DOM manipulation utilities | `/shared/browser/dom-utils.js` |
| `event-manager.js` | Event pub/sub | - |
| `optimization-helper.js` | Performance utilities | - |
| `service-worker-register.js` | PWA service worker | - |
| `ai-chat-widget.js` | Gemini AI chat widget | - |

---

## Source of Truth Mapping

| Script-Tag Version (`/shared/js/`) | ES Module (`/shared/browser/`) |
|------------------------------------|-------------------------------|
| `shared-auth-manager.js` | `auth-manager.js` |
| `shared-cache-manager.js` | `persistent-cache.js` |
| `logger.js` | `logger.js` |
| `dom-utils.js` | `dom-utils.js` |
| `common-utils.js` | `common-utils.js` |
| `firebase-config.js` | `firebase-config.js` |
| `notification-system.js` | `notification-system.js` |

---

## Xem thêm

- [/shared/js/](../shared/js/) - Script-tag compatible files
- [/shared/browser/](../shared/browser/) - ES Module source of truth
- [/shared/README.md](../shared/README.md) - Full documentation
