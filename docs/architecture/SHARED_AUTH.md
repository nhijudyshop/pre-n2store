# SHARED_AUTH - Hệ Thống Xác Thực Dùng Chung

> Module quản lý authentication với session management, dùng chung cho nhiều sub-apps.

## File Locations

| Type | Path | Description |
|------|------|-------------|
| **ES Module (SOURCE OF TRUTH)** | `/shared/browser/auth-manager.js` | Modern ES module |
| Script-Tag Compatible | `/shared/js/shared-auth-manager.js` | Legacy window.* export |

## Troubleshooting - Import Errors

Nếu gặp lỗi khi load AuthManager:

```bash
# Kiểm tra path trong HTML
grep -r '../js/' . --include="*.html"

# Path đúng:
<script src="../shared/js/shared-auth-manager.js"></script>

# Hoặc dùng ES Module:
import { AuthManager } from '/shared/browser/auth-manager.js';
```

## Tổng Quan

| File | Folders sử dụng (giống 100%) |
|------|------------------------------|
| `auth.js` | balance-history, bangkiemhang, ck, hanghoan, soorder, tpos-pancake |

### Variations

| Folder | Khác biệt |
|--------|-----------|
| `orders-report` | Có thêm `getUserId()`, preserve tokens khi logout |
| `inventory-tracking` | Custom permission helper |
| `customer-hub` | API integration (Customer 360) |
| `user-management` | Auth-with-cache integration |

---

## AuthManager Class

### Methods

| Method | Signature | Mô tả |
|--------|-----------|-------|
| `init()` | `() → boolean` | Khởi tạo từ sessionStorage/localStorage |
| `isAuthenticated()` | `() → boolean` | Kiểm tra đang đăng nhập |
| `hasPermission()` | `(requiredLevel: number) → boolean` | Kiểm tra quyền (level <= checkLogin) |
| `getAuthState()` | `() → object\|null` | Lấy auth state object |
| `getUserInfo()` | `() → object\|null` | Alias cho getAuthState |
| `getUserId()` | `() → string\|null` | Lấy userId cho chat *(chỉ orders-report)* |
| `clearAuth()` | `() → void` | Xóa auth data |
| `logout()` | `() → void` | Đăng xuất với confirm |

### Storage Keys

| Key | Storage | TTL |
|-----|---------|-----|
| `loginindex_auth` | sessionStorage | 8 giờ |
| `loginindex_auth` | localStorage | 30 ngày ("Remember me") |

### Auth State Object

```javascript
{
  isLoggedIn: "true",       // String, không phải boolean
  userType: "Admin-Store",
  checkLogin: 1,            // Permission level (thấp hơn = cao hơn)
  timestamp: 1704164400000,
  expiresAt: 1704250800000, // Optional
  userId: "user123"         // Chỉ orders-report
}
```

---

## Legacy Functions (Backward Compatibility)

| Function | Mô tả |
|----------|-------|
| `getAuthState()` | Wrapper cho `authManager.getAuthState()` |
| `setAuthState()` | Lưu auth vào localStorage |
| `clearAuthState()` | Xóa auth |
| `isAuthenticated()` | Wrapper cho `authManager.isAuthenticated()` |
| `hasPermission()` | Wrapper cho `authManager.hasPermission()` |
| `getUserName()` | Lấy tên từ userType (split "-") |
| `handleLogout()` | Đăng xuất với confirm + invalidateCache |

---

## Sử Dụng

### Script Tag (Legacy)

```html
<script src="../shared/js/shared-auth-manager.js"></script>

<script>
if (authManager.isAuthenticated()) {
  console.log("User:", authManager.getUserInfo());
}

// Kiểm tra quyền admin (level 1)
if (authManager.hasPermission(1)) {
  showAdminFeatures();
}
</script>
```

### ES Module (Modern)

```javascript
import { AuthManager, getAuthManager, isAuthenticated } from '/shared/browser/auth-manager.js';

// Quick check
if (isAuthenticated()) {
  const auth = getAuthManager();
  console.log("User:", auth.getUserInfo());
}
```

---

## Xem thêm

- [/shared/browser/auth-manager.js](../shared/browser/auth-manager.js) - ES Module (SOURCE OF TRUTH)
- [/shared/js/shared-auth-manager.js](../shared/js/shared-auth-manager.js) - Script-tag version
- [/shared/README.md](../shared/README.md) - Full shared library documentation
