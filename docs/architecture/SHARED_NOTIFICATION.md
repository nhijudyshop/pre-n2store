# SHARED_NOTIFICATION - Hệ Thống Thông Báo

> Toast notifications với Lucide icons + custom confirm dialogs.

## File Locations

| Type | Path | Description |
|------|------|-------------|
| **ES Module (SOURCE OF TRUTH)** | `/shared/browser/notification-system.js` | Modern ES module |
| Script-Tag Compatible | `/shared/js/notification-system.js` | Legacy window.* export |

## Troubleshooting - Import Errors

Nếu gặp lỗi khi load NotificationManager:

```bash
# Kiểm tra path trong HTML
grep -r 'notification-system' . --include="*.html"

# Path đúng:
<script src="../shared/js/notification-system.js"></script>

# Hoặc dùng ES Module:
import { NotificationManager, getNotificationManager } from '/shared/browser/notification-system.js';
```

## Tổng Quan

| Module | Path | Description |
|--------|------|-------------|
| `notification-system.js` | `/shared/js/` | Shared script-tag version |
| `notification-system.js` | `/shared/browser/` | ES Module (SOURCE OF TRUTH) |
| `notification-system.js` | Various folders | Legacy copies (phasing out) |

### Folders using notification-system.js

balance-history, bangkiemhang, ck, hanghoan, tpos-pancake, user-management, inventory-tracking, sanphamlive, live, livestream, nhanhang, hangrotxa, issue-tracking, ib, orders-report

---

## NotificationManager Class

### Basic Methods

| Method | Signature | Mô tả |
|--------|-----------|-------|
| `success()` | `(msg, duration?, title?) → string` | Success toast (green) |
| `error()` | `(msg, duration?, title?) → string` | Error toast (red) |
| `warning()` | `(msg, duration?, title?) → string` | Warning toast (yellow) |
| `info()` | `(msg, duration?, title?) → string` | Info toast (blue) |
| `loading()` | `(msg, title?) → string` | Loading spinner (no auto-dismiss) |

### Action-Specific Methods

| Method | Default Message | Mô tả |
|--------|-----------------|-------|
| `uploading(current, total)` | "Uploading {current}/{total}" | Upload progress |
| `deleting()` | "Đang xóa..." | Delete operation |
| `saving()` | "Đang lưu..." | Save operation |
| `loadingData()` | "Đang tải dữ liệu..." | Data fetch |
| `processing()` | "Đang xử lý..." | Generic processing |

### Control Methods

| Method | Mô tả |
|--------|-------|
| `remove(notificationId)` | Xóa notification theo ID |
| `clearAll()` | Xóa tất cả notifications |
| `showOverlay()` | Hiển thị overlay (disable interaction) |
| `hideOverlay()` | Ẩn overlay |
| `forceHideOverlay()` | Force ẩn overlay |

---

## Custom Confirm Dialog (orders-report only)

```javascript
const confirmed = await notificationManager.confirm(
  "Bạn có chắc muốn xóa?",
  "Xác nhận xóa"
);
if (confirmed) {
  // proceed with delete
}
```

---

## Default Durations

| Type | Duration |
|------|----------|
| success | 2000ms |
| error | 4000ms |
| warning | 3000ms |
| info | 3000ms |
| loading | ∞ (manual dismiss) |

---

## Toast Structure

```html
<div class="toast {type}" id="toast-{id}">
  <div class="toast-icon">
    <i data-lucide="{icon}"></i>
  </div>
  <div class="toast-content">
    <div class="toast-title">{title}</div>
    <div class="toast-message">{message}</div>
  </div>
  <div class="toast-progress" style="--duration: {duration}ms"></div>
</div>
```

---

## Sử Dụng

### Script Tag (Legacy)

```html
<script src="../shared/js/notification-system.js"></script>

<script>
// Basic
notificationManager.success("Lưu thành công!");
notificationManager.error("Có lỗi xảy ra");

// With loading
const loadingId = notificationManager.loading("Đang tải...");
// ... do async work
notificationManager.remove(loadingId);
notificationManager.success("Hoàn tất!");

// Confirm dialog
const confirmed = await notificationManager.confirm("Bạn có chắc?", "Xác nhận");
if (confirmed) {
  // proceed
}
</script>
```

### ES Module (Modern)

```javascript
import { getNotificationManager } from '/shared/browser/notification-system.js';

const notify = getNotificationManager();

notify.success("Saved!");
notify.error("Error occurred");
notify.warning("Warning!");
notify.info("FYI...");

// Action-specific
notify.uploading(1, 5);
notify.deleting();
notify.saving();
notify.loadingData();
notify.processing();

// Confirm
const ok = await notify.confirm("Delete this item?", "Confirm Delete");
```

---

## CSS Variables (Customization)

```css
:root {
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
  --info: #3b82f6;
  --spacing-xl: 24px;
}
```

---

## Xem thêm

- [/shared/browser/notification-system.js](../shared/browser/notification-system.js) - ES Module (SOURCE OF TRUTH)
- [/shared/js/notification-system.js](../shared/js/notification-system.js) - Script-tag version
- [/shared/README.md](../shared/README.md) - Full shared library documentation
