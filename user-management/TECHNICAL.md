# User Management - Technical Documentation

> **Tài liệu kỹ thuật chi tiết** về hệ thống quản lý người dùng và phân quyền

---

## 1. Kiến Trúc Hệ Thống

### 1.1 Tổng Quan

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PERMISSION ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐     ┌─────────────────────┐     ┌─────────────────┐  │
│   │   permissions-   │     │   auth-manager.js   │     │  navigation-    │  │
│   │   registry.js    │────▶│   (Browser Module)  │────▶│  modern.js      │  │
│   │   (Source of     │     │                     │     │  (Dynamic Menu) │  │
│   │    Truth)        │     │                     │     │                 │  │
│   └──────────────────┘     └──────────┬──────────┘     └─────────────────┘  │
│                                       │                                      │
│                                       ▼                                      │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                         Firebase Firestore                            │  │
│   │                         Collection: users                             │  │
│   │   ┌──────────────────────────────────────────────────────────────┐   │  │
│   │   │  User Document Structure:                                     │   │  │
│   │   │  {                                                            │   │  │
│   │   │    username (doc ID),                                         │   │  │
│   │   │    displayName, identifier,                                   │   │  │
│   │   │    passwordHash, salt,                                        │   │  │
│   │   │    roleTemplate,                                              │   │  │
│   │   │    detailedPermissions: { pageId: { action: boolean } },      │   │  │
│   │   │    createdAt, createdBy, updatedAt, updatedBy                 │   │  │
│   │   │  }                                                            │   │  │
│   │   └──────────────────────────────────────────────────────────────┘   │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 File Structure

```
user-management/
├── index.html                      # Main UI
├── USER-FLOW.md                    # Non-technical documentation
├── TECHNICAL.md                    # This file
├── user-ARCHITECTURE.md            # Legacy architecture doc
├── css/
│   ├── modern.css                  # Main styles
│   ├── user-management.css         # User management specific
│   └── detailed-permissions.css    # Permission UI styles
└── js/
    ├── permissions-registry.js     # ★ SINGLE SOURCE OF TRUTH
    ├── user-management-enhanced.js # Main CRUD logic
    ├── detailed-permissions-ui.js  # Permission checkbox UI
    ├── permissions-overview.js     # Permission matrix display
    ├── template-manager.js         # Template management
    ├── menu-rename-manager.js      # Menu renaming utility
    └── permissions-migration.js    # Legacy migration script

shared/
├── browser/
│   └── auth-manager.js             # ★ ES Module (SOURCE OF TRUTH)
└── js/
    ├── shared-auth-manager.js      # Script-tag version (wrapper)
    └── navigation-modern.js        # Dynamic navigation
```

---

## 2. Permission Registry (Single Source of Truth)

### 2.1 File: `permissions-registry.js`

Định nghĩa toàn bộ pages và permissions trong hệ thống.

### 2.2 PAGES_REGISTRY Structure

```javascript
const PAGES_REGISTRY = {
    "page-id": {
        id: "page-id",
        name: "Tên đầy đủ",
        shortName: "Tên ngắn",
        icon: "lucide-icon-name",
        href: "../path/to/page.html",
        description: "Mô tả chức năng",
        adminOnly: false,           // true = chỉ hiện trong admin menu
        category: "sales",          // sales | warehouse | orders | reports | admin
        detailedPermissions: {
            view: { name: "Xem", icon: "eye", description: "..." },
            create: { name: "Tạo", icon: "plus-circle", description: "..." },
            edit: { name: "Sửa", icon: "edit", description: "..." },
            delete: { name: "Xóa", icon: "trash-2", description: "..." },
            // ... các quyền khác
        }
    }
};
```

### 2.3 Complete Pages Registry

#### Category: SALES (Bán Hàng & Livestream)

| Page ID | Page Name | Permissions |
|---------|-----------|-------------|
| `live` | Hình Ảnh Live | `view`, `upload`, `edit`, `delete` |
| `livestream` | Báo Cáo Livestream | `view`, `export`, `edit`, `analytics` |
| `sanphamlive` | Sản Phẩm Livestream | `view`, `add`, `edit`, `delete`, `pricing`, `stock` |
| `ib` | Check Inbox Khách | `view`, `reply`, `assign`, `archive`, `export` |

#### Category: WAREHOUSE (Kho & Nhận Hàng)

| Page ID | Page Name | Permissions |
|---------|-----------|-------------|
| `nhanhang` | Cân Nặng Hàng | `view`, `create`, `confirm`, `edit`, `cancel`, `weigh` |
| `inventoryTracking` | Theo Dõi Nhập Hàng SL | `tab_tracking`, `tab_congNo`, `create_shipment`, `edit_shipment`, `delete_shipment`, `view_chiPhiHangVe`, `edit_chiPhiHangVe`, `view_ghiChuAdmin`, `edit_ghiChuAdmin`, `edit_soMonThieu`, `create_prepayment`, `edit_prepayment`, `delete_prepayment`, `create_otherExpense`, `edit_otherExpense`, `delete_otherExpense`, `edit_invoice_from_finance`, `edit_shipping_from_finance`, `export_data` |
| `hangrotxa` | Hàng Rớt - Xả | `view`, `mark`, `approve`, `price`, `delete` |
| `hanghoan` | Hàng Hoàn | `view`, `approve`, `reject`, `refund`, `update`, `export` |
| `product-search` | Tìm Kiếm Sản Phẩm | `view`, `viewStock`, `viewPrice`, `export` |
| `soluong-live` | Số Lượng Live | `livestream`, `social`, `viewReport` |

#### Category: ORDERS (Đơn Hàng & Thanh Toán)

| Page ID | Page Name | Permissions |
|---------|-----------|-------------|
| `ck` | Thông Tin Chuyển Khoản | `view`, `verify`, `edit`, `export`, `delete` |
| `order-management` | Quản Lý Order | `view`, `create`, `edit`, `updateStatus`, `cancel`, `export`, `print` |
| `order-log` | Sổ Order | `view`, `add`, `edit`, `delete`, `export` |
| `order-live-tracking` | Sổ Order Live | `view`, `track`, `update`, `export` |

#### Category: REPORTS (Báo Cáo & Thống Kê)

| Page ID | Page Name | Permissions |
|---------|-----------|-------------|
| `baocaosaleonline` | Báo Cáo Sale-Online | `view`, `viewRevenue`, `viewDetails`, `export`, `compare`, `viewAnalysis`, `editAnalysis` |
| `tpos-pancake` | Tpos - Pancake | `view`, `sync`, `import`, `export`, `configure` |

#### Category: ADMIN (Quản Trị Hệ Thống)

| Page ID | Page Name | Permissions |
|---------|-----------|-------------|
| `user-management` | Quản Lý Tài Khoản | `view`, `create`, `edit`, `delete`, `permissions`, `resetPassword`, `manageTemplates` |
| `balance-history` | Lịch Sử Biến Động Số Dư | `view`, `viewDetails`, `export`, `adjust`, `resolveMatch`, `skipMatch`, `undoSkip`, `viewVerificationQueue`, `approveTransaction`, `rejectTransaction`, `createWalletAdjustment`, `manualTransactionEntry` |
| `customer-hub` | Customer 360° | `view`, `viewWallet`, `manageWallet`, `viewTickets`, `createTicket`, `viewActivities`, `addNote`, `editCustomer`, `linkTransactions` |
| `issue-tracking` | CSKH - Quản Lý Sự Vụ | `view`, `create`, `edit`, `delete`, `searchOrder`, `processRefund`, `receiveGoods`, `updateStatus`, `viewFinance`, `export`, `issueVirtualCredit` |
| `invoice-compare` | So Sánh Đơn Hàng | `view`, `compare`, `import`, `export`, `resolve` |

### 2.4 Permission Templates

```javascript
const PERMISSION_TEMPLATES = {
    admin: {
        id: "admin",
        name: "Admin - Toàn quyền",
        icon: "crown",
        description: "Có tất cả quyền trong hệ thống",
        color: "#ef4444"
        // Generated: ALL permissions = true
    },
    manager: {
        id: "manager",
        name: "Manager - Quản lý",
        icon: "briefcase",
        description: "Quản lý nhân viên, không xóa user",
        color: "#f59e0b"
        // Generated: ALL permissions = true EXCEPT:
        //   - user-management.delete = false
    },
    "sales-team": {
        id: "sales-team",
        name: "Sales Team - Nhóm bán hàng",
        icon: "shopping-cart",
        description: "Quyền liên quan đến bán hàng và livestream",
        color: "#10b981"
        // Generated: sales + orders categories (no delete)
        //   + reports category (view/export only)
    },
    "warehouse-team": {
        id: "warehouse-team",
        name: "Warehouse Team - Nhóm kho",
        icon: "package",
        description: "Quyền liên quan đến kho và nhận hàng",
        color: "#6366f1"
        // Generated: warehouse category (full)
        //   + orders + reports (view/export only)
    },
    staff: {
        id: "staff",
        name: "Staff - Nhân viên",
        icon: "users",
        description: "Chỉ xem và chỉnh sửa cơ bản",
        color: "#3b82f6"
        // Generated: non-admin pages with view/edit/update only
    },
    viewer: {
        id: "viewer",
        name: "Viewer - Chỉ xem",
        icon: "eye",
        description: "Chỉ có quyền xem, không thao tác",
        color: "#6b7280"
        // Generated: non-admin pages with view* only
    },
    custom: {
        id: "custom",
        name: "Custom - Tùy chỉnh",
        icon: "sliders",
        description: "Quyền được tùy chỉnh riêng",
        color: "#8b5cf6"
        // No auto-generated permissions
    }
};
```

---

## 3. Auth Manager API

### 3.1 File: `shared/browser/auth-manager.js`

### 3.2 Configuration

```javascript
export const AUTH_CONFIG = {
    STORAGE_KEY: 'loginindex_auth',
    REDIRECT_URL: '/index.html',
    SESSION_DURATION: 8 * 60 * 60 * 1000,      // 8 hours
    REMEMBER_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
    PERMISSION_LEVELS: {                        // DEPRECATED
        ADMIN: 0,
        MANAGER: 1,
        STAFF: 2,
        BASIC: 3,
        GUEST: 777
    }
};
```

### 3.3 AuthManager Class Methods

#### Authentication Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `isAuthenticated()` | - | `boolean` | Check if user is logged in and session valid |
| `isSessionExpired(authData)` | `Object` | `boolean` | Check if session expired |
| `getAuthData()` | - | `Object\|null` | Get auth data from storage |
| `saveAuthData(authData, rememberMe)` | `Object`, `boolean` | `void` | Save auth data |
| `logout(reason)` | `string` | `void` | Clear auth and redirect |

#### User Information Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `getUserInfo()` | - | `Object\|null` | Get user info object |
| `getPermissionLevel()` | - | `number` | Get legacy checkLogin level (DEPRECATED) |
| `getRoleInfo()` | - | `Object` | Get role display info |

#### Permission Check Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `hasPagePermission(pageName)` | `string` | `boolean` | Check if user can access page |
| `hasDetailedPermission(pageId, action)` | `string`, `string` | `boolean` | **★ PRIMARY METHOD** - Check specific permission |
| `hasPermissionLevel(requiredLevel)` | `number` | `boolean` | **DEPRECATED** - Legacy numeric check |
| `isAdminTemplate()` | - | `boolean` | Check if user has admin template |

#### Guard Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `requireAuth()` | - | `boolean` | Verify auth, redirect if not |
| `requirePagePermission(pageName)` | `string` | `boolean` | Verify page access, redirect if not |

### 3.4 Usage Examples

```javascript
// ES Module import
import { getAuthManager } from '/shared/browser/auth-manager.js';
const authManager = getAuthManager();

// Script-tag (global)
const authManager = window.authManager;

// Check page access
if (authManager.hasPagePermission('balance-history')) {
    // User can access balance-history page
}

// Check specific permission (RECOMMENDED)
if (authManager.hasDetailedPermission('balance-history', 'approveTransaction')) {
    // Show approve button
}

// Guard page on load
if (!authManager.requirePagePermission('user-management')) {
    return; // Will redirect automatically
}

// Get current user
const user = authManager.getUserInfo();
console.log(user.username, user.displayName, user.roleTemplate);
```

---

## 4. Permission Check Locations in Codebase

### 4.1 Using `hasDetailedPermission()`

| File | Line | Page ID | Action | Purpose |
|------|------|---------|--------|---------|
| `balance-history/js/accountant.js` | 570 | `balance-history` | `approveTransaction` | Approve transaction button |
| `balance-history/js/accountant.js` | 634 | `balance-history` | `approveTransaction` | Batch approve |
| `balance-history/js/accountant.js` | 679 | `balance-history` | `approveTransaction` | Reject transaction |
| `balance-history/js/accountant.js` | 738 | `balance-history` | `approveTransaction` | Create adjustment |
| `balance-history/js/accountant.js` | 1029 | `balance-history` | `adjustWallet` | Wallet adjustment |
| `balance-history/js/main.js` | 95 | `balance-history` | `resolveMatch` | Resolve match button |
| `balance-history/js/main.js` | 174 | `balance-history` | `resolveMatch` | Match modal |
| `balance-history/js/main.js` | 1400 | `balance-history` | `edit` | Edit button display |
| `balance-history/js/main.js` | 1431 | `balance-history` | `manualTransactionEntry` | Manual entry |
| `balance-history/js/main.js` | 3049 | `balance-history` | `approveTransaction` | Tab visibility |
| `balance-history/js/verification.js` | 202 | `balance-history` | `approveTransaction` | Approve single |
| `balance-history/js/verification.js` | 273 | `balance-history` | `approveTransaction` | Approve with customer |
| `balance-history/js/verification.js` | 452 | `balance-history` | `approveTransaction` | Reject |
| `balance-history/js/verification.js` | 542 | `balance-history` | `approveTransaction` | Batch approve |
| `issue-tracking/js/script.js` | 1804 | `issue-tracking` | `issueVirtualCredit` | Virtual credit button |
| `issue-tracking/js/script.js` | 1829 | `issue-tracking` | `delete` | Delete ticket button |
| `issue-tracking/js/script.js` | 1996 | `issue-tracking` | `delete` | Delete confirmation |
| `orders-report/js/overview/overview-core.js` | 50 | `baocaosaleonline` | `viewAnalysis` | Analysis tab |
| `orders-report/js/overview/overview-core.js` | 54 | `baocaosaleonline` | `editAnalysis` | Edit analysis |

### 4.2 Using `hasPermissionLevel()` (DEPRECATED)

| File | Line | Level | Purpose |
|------|------|-------|---------|
| `live/js/app.js` | 788 | 3 | Upload image permission |
| `live/js/app.js` | 854 | 0 | Delete image permission (admin) |

**Note:** These should be migrated to `hasDetailedPermission()`:
```javascript
// OLD (deprecated)
if (authManager.hasPermissionLevel(3)) { ... }

// NEW (recommended)
if (authManager.hasDetailedPermission('live', 'upload')) { ... }
```

---

## 5. User CRUD Operations

### 5.1 Create User

**File:** `user-management-enhanced.js` → `createUser()`

```javascript
async function createUser() {
    // 1. Validate inputs
    const username = document.getElementById("newUsername").value.trim().toLowerCase();
    const password = document.getElementById("newPassword").value.trim();

    // 2. Validation rules
    if (!/^[a-z0-9_]+$/.test(username)) { /* error */ }
    if (password.length < 6) { /* error */ }

    // 3. Check username existence
    const userDoc = await db.collection("users").doc(username).get();
    if (userDoc.exists) { /* error: username exists */ }

    // 4. Hash password with PBKDF2
    const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
    const hash = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 1000
    }).toString();

    // 5. Get permissions from UI
    const detailedPermissions = window.newDetailedPermUI.getPermissions();
    const roleTemplate = window.newDetailedPermUI.currentTemplate || 'custom';

    // 6. Save to Firestore
    await db.collection("users").doc(username).set({
        displayName,
        identifier,
        detailedPermissions,
        roleTemplate,
        passwordHash: hash,
        salt,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.username
    });
}
```

### 5.2 Update User

**File:** `user-management-enhanced.js` → `updateUser()`

```javascript
async function updateUser() {
    const username = document.getElementById("editUsername").value.trim();
    const detailedPermissions = window.editDetailedPermUI.getPermissions();
    const roleTemplate = window.editDetailedPermUI.currentTemplate || 'custom';

    let updateData = {
        displayName,
        identifier,
        detailedPermissions,
        roleTemplate,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser.username
    };

    // Optional password change
    if (newPassword) {
        const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
        const hash = CryptoJS.PBKDF2(newPassword, salt, {...}).toString();
        updateData.passwordHash = hash;
        updateData.salt = salt;
    }

    await db.collection("users").doc(username).update(updateData);
}
```

### 5.3 Delete User

**File:** `user-management-enhanced.js` → `deleteUser()`

```javascript
async function deleteUser(username) {
    const user = users.find(u => u.id === username);

    // Safety: Prevent deleting last admin
    const adminCount = users.filter(u => u.roleTemplate === 'admin').length;
    if (user.roleTemplate === 'admin' && adminCount === 1) {
        showError("Không thể xóa admin cuối cùng!");
        return;
    }

    // Confirm and delete
    if (confirm(confirmMsg)) {
        await db.collection("users").doc(username).delete();
    }
}
```

### 5.4 Bulk Apply Template

**File:** `user-management-enhanced.js` → `executeBulkApplyTemplate()`

```javascript
async function executeBulkApplyTemplate() {
    const templateId = document.querySelector('input[name="bulkTemplate"]:checked').value;
    const permissions = PermissionsRegistry.generateTemplatePermissions(templateId);

    const batch = db.batch();
    selectedUsers.forEach(userId => {
        const userRef = db.collection('users').doc(userId);
        batch.update(userRef, {
            detailedPermissions: permissions.detailedPermissions,
            roleTemplate: templateId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser.username
        });
    });

    await batch.commit();
}
```

---

## 6. Firestore User Document Schema

```javascript
// Collection: users
// Document ID: username (lowercase)
{
    // Basic Info
    displayName: String,        // e.g., "Nguyễn Văn A"
    identifier: String,         // e.g., employee ID "NV001"

    // Authentication
    passwordHash: String,       // PBKDF2 hash
    salt: String,               // Random 128-bit salt

    // Permissions (NEW SYSTEM)
    roleTemplate: String,       // "admin" | "manager" | "sales-team" | ...
    detailedPermissions: {
        "live": {
            "view": true,
            "upload": true,
            "edit": false,
            "delete": false
        },
        "user-management": {
            "view": true,
            "create": true,
            "edit": true,
            "delete": false,
            "permissions": true,
            "resetPassword": true,
            "manageTemplates": false
        }
        // ... other pages
    },

    // DEPRECATED (legacy)
    checkLogin: Number,         // 0=Admin, 1=Manager, 2=Staff, 3=Basic, 777=Guest
    pagePermissions: Array,     // ["live", "livestream", ...]

    // Audit
    createdAt: Timestamp,
    createdBy: String,
    updatedAt: Timestamp,
    updatedBy: String
}
```

---

## 7. Navigation Permission Integration

### 7.1 File: `shared/js/navigation-modern.js`

Menu items chỉ hiển thị nếu user có quyền:

```javascript
const MENU_CONFIG = [
    {
        href: "../live/index.html",
        icon: "image",
        text: "Hình Ảnh Live",
        pageIdentifier: "live",
        permissionRequired: "live",     // Must have any permission in "live" page
    },
    {
        href: "../user-management/index.html",
        icon: "users",
        text: "Quản Lý Tài Khoản",
        pageIdentifier: "user-management",
        adminOnly: true,                // Additional flag
        permissionRequired: "user-management",
    },
    // ...
];

// Menu render logic
MENU_CONFIG.filter(item => {
    if (item.permissionRequired) {
        return authManager.hasPagePermission(item.permissionRequired);
    }
    return true;
});
```

### 7.2 hasPagePermission Logic

```javascript
hasPagePermission(pageName) {
    const authData = this.getAuthData();
    if (!authData) return false;

    if (authData.detailedPermissions && authData.detailedPermissions[pageName]) {
        const pagePerms = authData.detailedPermissions[pageName];
        // User has access if ANY permission is true
        return Object.values(pagePerms).some(v => v === true);
    }

    return false;
}
```

---

## 8. Permission Check Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PERMISSION CHECK FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks on "Approve Transaction" button
              │
              ▼
┌─────────────────────────────────────┐
│ authManager.hasDetailedPermission(  │
│   'balance-history',                │
│   'approveTransaction'              │
│ )                                   │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ getAuthData() from storage          │
│ (localStorage or sessionStorage)    │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│ Check:                              │
│ authData.detailedPermissions        │
│   ['balance-history']               │
│   ['approveTransaction']            │
│   === true                          │
└────────────────┬────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
      true              false
        │                 │
        ▼                 ▼
┌──────────────┐   ┌──────────────┐
│ Allow action │   │ Show error/  │
│ Execute code │   │ Hide button  │
└──────────────┘   └──────────────┘
```

---

## 9. Client-Side Auth Data Structure

Stored in `localStorage` or `sessionStorage` with key `loginindex_auth`:

```javascript
{
    isLoggedIn: "true",
    username: "admin",
    displayName: "Administrator",
    uid: "...",
    userType: "...",
    checkLogin: 0,                    // DEPRECATED
    pagePermissions: ["live", ...],   // DEPRECATED
    roleTemplate: "admin",
    detailedPermissions: {
        "live": { view: true, upload: true, edit: true, delete: true },
        "user-management": { view: true, create: true, ... },
        // ...
    },
    timestamp: 1706000000000,
    expiresAt: 1706028800000,
    isRemembered: false
}
```

---

## 10. Security Considerations

### 10.1 Password Security
- **Algorithm:** PBKDF2 with 1000 iterations
- **Salt:** 128-bit random, unique per user
- **Key Size:** 256-bit

### 10.2 Session Security
- Session stored client-side (localStorage/sessionStorage)
- Auto-expiry after 8 hours (or 30 days if "remember me")
- No server-side session validation (client-side only)

### 10.3 Important Notes
- Firebase Security Rules **MUST** be configured properly
- Client-side permission checks can be bypassed
- Server-side (Firebase Rules) should enforce the same permissions
- Never trust client-side permission checks for sensitive operations

### 10.4 Recommended Firebase Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid))
           .data.detailedPermissions['user-management'].create == true;
    }
  }
}
```

---

## 11. Migration from Legacy System

### 11.1 Legacy vs New System

| Aspect | Legacy | New |
|--------|--------|-----|
| Permission Storage | `checkLogin` (number) | `detailedPermissions` (object) |
| Page Access | `pagePermissions` (array) | Derived from `detailedPermissions` |
| Role Identification | `checkLogin` value | `roleTemplate` string |
| Permission Check | `hasPermissionLevel(n)` | `hasDetailedPermission(page, action)` |
| Granularity | Page-level | Action-level |

### 11.2 Migration Script

The `permissions-migration.js` file handles migrating users from old to new system:

```javascript
// Auto-migrate user on login
if (!user.detailedPermissions && user.checkLogin !== undefined) {
    // Generate detailedPermissions from checkLogin
    const template = mapCheckLoginToTemplate(user.checkLogin);
    const permissions = generateTemplatePermissions(template);

    await db.collection('users').doc(username).update({
        detailedPermissions: permissions.detailedPermissions,
        roleTemplate: template
    });
}

function mapCheckLoginToTemplate(checkLogin) {
    switch(checkLogin) {
        case 0: return 'admin';
        case 1: return 'manager';
        case 2: return 'staff';
        case 3: return 'viewer';
        default: return 'custom';
    }
}
```

---

## 12. Helper Functions Reference

### From `permissions-registry.js`

```javascript
// Get all pages
PermissionsRegistry.getPagesList()           // Array<Page>
PermissionsRegistry.getPagesIds()            // Array<string>

// Get page info
PermissionsRegistry.getPageById(pageId)      // Page | null

// Get by category
PermissionsRegistry.getPagesByCategory(cat)  // Array<Page>
PermissionsRegistry.getPagesGroupedByCategory() // Object

// Admin pages
PermissionsRegistry.getAdminOnlyPages()      // Array<Page>
PermissionsRegistry.getNonAdminPages()       // Array<Page>

// Permissions
PermissionsRegistry.getDetailedPermissions(pageId) // Object
PermissionsRegistry.getAllDetailedPermissions()    // Object
PermissionsRegistry.getTotalPermissionsCount()     // number

// Templates
PermissionsRegistry.generateTemplatePermissions(templateId) // Object

// Validation
PermissionsRegistry.isValidPageId(pageId)    // boolean
PermissionsRegistry.isValidPermission(pageId, permKey) // boolean

// Simplified checks
PermissionsRegistry.hasPageAccess(perms, pageId)     // boolean
PermissionsRegistry.hasPermission(perms, pageId, action) // boolean
PermissionsRegistry.getAccessiblePages(perms)        // Array<string>
PermissionsRegistry.countGrantedPermissions(perms)   // Object

// Generate permissions
PermissionsRegistry.generateFullDetailedPermissions()  // All true
PermissionsRegistry.generateEmptyDetailedPermissions() // All false
```

---

## 13. Debugging & Troubleshooting

### 13.1 Check Current User Permissions

```javascript
// In browser console
const auth = JSON.parse(localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth'));
console.log('Role Template:', auth.roleTemplate);
console.log('Permissions:', auth.detailedPermissions);

// Check specific permission
console.log('Can approve:', auth.detailedPermissions?.['balance-history']?.['approveTransaction']);
```

### 13.2 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Menu item not showing | No permission for page | Grant at least 1 permission |
| Button hidden | Missing specific action | Grant the specific action |
| "Access Denied" on page | No permissions in page | Grant view permission |
| Login loop | Session expired | Clear storage, re-login |
| Permissions not updating | Old session data | Logout and login again |

### 13.3 Force Refresh Permissions

```javascript
// After updating user permissions in Firestore,
// user must logout and login again to get new permissions
authManager.logout('Permission refresh required');
```

---

*Last Updated: January 2026*
