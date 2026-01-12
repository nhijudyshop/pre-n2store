# SHARED_NOTIFICATION - Hệ Thống Thông Báo

> Toast notifications với Lucide icons + custom confirm dialogs.

## Tổng Quan

| File | Folders sử dụng (giống 100%) |
|------|------------------------------|
| `notification-system.js` | balance-history, bangkiemhang, ck, hanghoan, tpos-pancake, user-management |

### Variations

| Folder | Khác biệt |
|--------|-----------|
| `orders-report` | Có thêm overlay, uploading với progress |
| `inventory-tracking` | Minimal version |
| `hangdat` | Minimal version |

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

```javascript
// Basic
notificationManager.success("Lưu thành công!");
notificationManager.error("Có lỗi xảy ra");

// With loading
const loadingId = notificationManager.loading("Đang tải...");
// ... do async work
notificationManager.remove(loadingId);
notificationManager.success("Hoàn tất!");

// Upload progress
for (let i = 0; i < files.length; i++) {
  notificationManager.uploading(i + 1, files.length);
}
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

- [orders-report/notification-system.js](file:///Users/mac/Downloads/n2store/orders-report/notification-system.js) - Full version với confirm dialog
