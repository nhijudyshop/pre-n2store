# Project Instructions for Claude Code

## Documentation to Read

When working on this project, always reference the documentation in `/docs` folder for understanding the project structure and conventions.

### Key Documentation Files:
- `docs/` - Contains comprehensive documentation about all modules and folders
- `docs/architecture/DATA-SYNCHRONIZATION.md` - Data sync patterns (localStorage + Firebase real-time)
- `shared/README.md` - Shared library documentation (auth, cache, utils, TPOS client)

## Shared Library Structure

Project sử dụng shared library tại `/shared/` folder. **KHÔNG TẠO FILE auth.js, cache.js, notification-system.js trong các folder riêng** - luôn dùng shared versions.

```
/shared/
├── universal/      # ES Modules - Works in Browser + Node.js
├── browser/        # ES Modules - Browser only (SOURCE OF TRUTH)
├── js/             # Legacy Script-Tag Compatible (window.*)
├── node/           # ES Modules - Node.js only
└── README.md
```

### Import Paths (Script Tags)

```html
<!-- Core utilities -->
<script src="../shared/js/core-loader.js"></script>
<script src="../shared/js/navigation-modern.js"></script>
<script src="../shared/js/common-utils.js"></script>

<!-- Auth, Cache, Notification - ALWAYS use shared versions -->
<script src="../shared/js/shared-auth-manager.js"></script>
<script src="../shared/js/shared-cache-manager.js"></script>
<script src="../shared/js/notification-system.js"></script>

<!-- Firebase -->
<script src="../shared/js/firebase-config.js"></script>
```

### Import Paths (ES Modules)

```javascript
import { AuthManager, CommonUtils } from '/shared/browser/index.js';
import { TPOSClient, fetchWithRetry } from '/shared/universal/index.js';
import { initializeFirestore, initializeRealtimeDB } from '/shared/browser/firebase-config.js';
import { getNotificationManager } from '/shared/browser/notification-system.js';
```

### Troubleshooting - Lỗi Import Path

Nếu gặp lỗi như:
- `404 Not Found` khi load script
- `Module not found`
- `Cannot resolve module`
- `AuthManager is not defined`
- `notificationManager is not defined`

**Kiểm tra:**
1. Đường dẫn script trong HTML phải là `../shared/js/...` (không phải local file)
2. ES Module imports phải trỏ đến `/shared/browser/` hoặc `/shared/universal/`
3. Chạy các lệnh sau để tìm paths sai:
```bash
# Tìm local auth.js references
grep -r 'src="auth.js"' . --include="*.html"

# Tìm local cache.js references
grep -r 'src="cache.js"' . --include="*.html"

# Tìm local notification-system.js references
grep -r 'src="notification-system.js"' . --include="*.html" | grep -v shared
```

### Source of Truth

| Loại | ES Module (SOURCE OF TRUTH) | Script-Tag Version |
|------|----------------------------|-------------------|
| Auth | `/shared/browser/auth-manager.js` | `/shared/js/shared-auth-manager.js` |
| Cache | `/shared/browser/persistent-cache.js` | `/shared/js/shared-cache-manager.js` |
| Notification | `/shared/browser/notification-system.js` | `/shared/js/notification-system.js` |
| Firebase | `/shared/browser/firebase-config.js` | `/shared/js/firebase-config.js` |
| Logger | `/shared/browser/logger.js` | `/shared/js/logger.js` |
| DOM Utils | `/shared/browser/dom-utils.js` | `/shared/js/dom-utils.js` |
| Common Utils | `/shared/browser/common-utils.js` | `/shared/js/common-utils.js` |
| TPOS Client | `/shared/universal/tpos-client.js` | `/shared/js/tpos-config.js` |

### QUAN TRỌNG: Không tạo file duplicate

**KHÔNG BAO GIỜ** tạo các file sau trong folder riêng:
- `auth.js` - Dùng `../shared/js/shared-auth-manager.js`
- `cache.js` - Dùng `../shared/js/shared-cache-manager.js`
- `notification-system.js` - Dùng `../shared/js/notification-system.js`

Các file này đã được consolidated vào shared library và các folders đã được migrate.

## Module-Specific Instructions

### orders-report Module
When working in the `orders-report/` directory, always read these files first:
- `orders-report/.ai-instructions.md` - AI-specific coding instructions
- `orders-report/ARCHITECTURE.md` - System architecture overview
- `orders-report/MODULE_MAP.md` - Module structure and dependencies

## File Organization

### Separate CSS and JS Files for New Features
Khi code phần mới (feature, module, page mới), **luôn hỏi người dùng** trước khi tạo file:
- Có muốn tạo file CSS riêng cho phần này không? (ví dụ: `feature-name.css`)
- Có muốn tạo file JS riêng cho phần này không? (ví dụ: `feature-name.js`)

Điều này giúp:
- Tách biệt code, dễ bảo trì
- Tránh file CSS/JS chính trở nên quá lớn
- Dễ debug và tìm kiếm code

## Database

Use environment variables or `.pgpass` file for PostgreSQL credentials. Never hardcode passwords.

## Git Workflow

**Auto commit & push**: Khi hoàn thành task, tự động commit và push mà không cần hỏi user. Commit message ngắn gọn, rõ ràng.

## Data Synchronization

Project sử dụng pattern **Firebase as Source of Truth + Real-time Listener** - localStorage chỉ là cache.

### Stores có Firestore Sync (Version 2):
| Store | File | localStorage Key | Firestore Collection |
|-------|------|------------------|---------------------|
| `InvoiceStatusStore` | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` | `invoiceStatusStore_v2` | `invoice_status_v2` |
| `InvoiceStatusDeleteStore` | `orders-report/js/tab1/tab1-fast-sale-workflow.js` | `invoiceStatusDelete_v2` | `invoice_status_delete_v2` |

> **Note**: Sử dụng `_v2` suffix để tách biệt hoàn toàn với code cũ.

### Pattern chuẩn:
```javascript
const Store = {
    _data: new Map(),
    _isListening: false,  // Flag tránh infinite loop

    async init() {
        // 1. Load từ Firestore TRƯỚC (source of truth)
        const loaded = await this._loadFromFirestore();

        // 2. Nếu offline, fallback to localStorage cache
        if (!loaded) {
            this._loadFromLocalStorage();
        }

        // 3. Cleanup old entries
        await this.cleanup();

        // 4. Setup real-time listener
        this._setupRealtimeListener();
    },

    // Add/Update: dùng merge:true (an toàn cho concurrent edits)
    _saveToFirestore() {
        await this._getDocRef().set({
            data: Object.fromEntries(this._data),
            lastUpdated: Date.now()
        }, { merge: true });
    },

    save() {
        this._saveToLocalStorage();
        if (!this._isListening) {
            this._saveToFirestore();
        }
    },

    // Delete: dùng FieldValue.delete() để xóa field cụ thể
    async delete(id) {
        this._data.delete(id);
        this._saveToLocalStorage();
        await this._getDocRef().update({
            [`data.${id}`]: firebase.firestore.FieldValue.delete(),
            lastUpdated: Date.now()
        });
    }
};
```

### Tài liệu chi tiết:
Xem `docs/architecture/DATA-SYNCHRONIZATION.md` để hiểu thêm về:
- Firebase as Source of Truth + Real-time Listener pattern
- Strategy: `merge:true` cho add/update, `FieldValue.delete()` cho delete
- Best practices
