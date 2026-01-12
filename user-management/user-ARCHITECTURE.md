# USER MANAGEMENT - ARCHITECTURE

> **Mục đích:** Quản lý users và phân quyền truy cập trong hệ thống N2Store

---

## Tổng Quan

Thư mục `user-management` chứa **18 files** với 4 chức năng chính:

1. **Quản lý Users** - CRUD operations (Create, Read, Update, Delete)
2. **Phân quyền Pages** - User được truy cập trang nào
3. **Phân quyền Chi tiết** - Actions cụ thể trong mỗi trang
4. **Quản lý Tổng quan** - Ma trận quyền và thống kê

```
user-management/
├── index.html ................. Giao diện chính
├── user-management-enhanced.js  User CRUD + permissions
│
├── Permissions Registry
│   └── permissions-registry.js .... Single Source of Truth cho tất cả pages
│
├── Permissions UI
│   ├── page-permissions-ui.js ........... UI cho page permissions
│   ├── detailed-permissions-config.js ... (DEPRECATED - không còn load)
│   ├── detailed-permissions-ui.js ....... UI cho detailed permissions
│   └── permissions-overview.js .......... Ma trận quyền & thống kê
│
├── Authentication
│   ├── auth.js ................. AuthManager class
│   └── auth-with-cache-manager.js ... Auth + cache
│
├── Utilities
│   ├── tool.js ................. Hash generation, Firebase config
│   ├── notification-system.js .. Toast notifications
│   ├── menu-rename-manager.js .. Custom menu names
│   └── image-system.js ......... Image handling
│
└── Styling
    ├── modern.css
    ├── user-management.css
    └── detailed-permissions.css
```

---

## Permissions Registry - Single Source of Truth

> **File:** `permissions-registry.js`

File này là nguồn duy nhất định nghĩa tất cả pages và permissions trong hệ thống.

### Cấu trúc chính

```javascript
// 1. PAGES_REGISTRY - Danh sách tất cả 20 trang
const PAGES_REGISTRY = {
    live: {
        id: "live",
        name: "Hình Ảnh Live",
        shortName: "Live",
        icon: "image",
        href: "../live/index.html",
        description: "Xem và quản lý hình ảnh live stream",
        adminOnly: false,
        category: "sales",
        detailedPermissions: {
            view: { name: "Xem hình ảnh", icon: "eye" },
            upload: { name: "Upload hình ảnh", icon: "upload" },
            // ...
        }
    },
    // ... 19 trang khác
};

// 2. PAGE_CATEGORIES - Phân loại trang
const PAGE_CATEGORIES = {
    sales: { id: "sales", name: "Bán Hàng & Livestream", ... },
    warehouse: { id: "warehouse", name: "Kho & Nhận Hàng", ... },
    orders: { id: "orders", name: "Đơn Hàng & Thanh Toán", ... },
    reports: { id: "reports", name: "Báo Cáo & Thống Kê", ... },
    admin: { id: "admin", name: "Quản Trị Hệ Thống", ... }
};

// 3. PERMISSION_TEMPLATES - Mẫu phân quyền
const PERMISSION_TEMPLATES = {
    admin: { ... },      // Toàn quyền
    manager: { ... },    // Quản lý
    "sales-team": { ... }, // Nhóm bán hàng
    "warehouse-team": { ... }, // Nhóm kho
    staff: { ... },      // Nhân viên
    viewer: { ... },     // Chỉ xem
    custom: { ... }      // Tùy chỉnh
};
```

### Helper Functions

```javascript
// Truy cập qua window.PermissionsRegistry
PermissionsRegistry.getPagesList()        // Lấy danh sách pages
PermissionsRegistry.getPagesIds()          // Lấy danh sách IDs
PermissionsRegistry.getPageById(id)        // Lấy page theo ID
PermissionsRegistry.getPagesByCategory(cat) // Lấy pages theo category
PermissionsRegistry.getAdminOnlyPages()    // Lấy admin-only pages
PermissionsRegistry.getDetailedPermissions(id) // Lấy permissions của page
PermissionsRegistry.generateTemplatePermissions(template) // Tạo permissions từ template
PermissionsRegistry.getTotalPermissionsCount() // Đếm tổng permissions
```

---

## Hệ Thống Phân Quyền - 3 Tầng

### Tầng 1: Role Level (`checkLogin`)

| Value | Role | Mô tả |
|-------|------|-------|
| `0` | **Admin** | Toàn quyền, truy cập mọi trang |
| `1` | **Manager** | Quản lý, không được xóa user |
| `2` | **Staff** | Nhân viên, chỉ view/edit |
| `3` | **Viewer** | Chỉ xem, không thao tác |
| `777` | **Guest** | Khách, hạn chế tối đa |

---

### Tầng 2: Page Permissions

User có array `pagePermissions` chứa danh sách pages được truy cập.

**Danh sách 20 Pages:**

| Category | ID | Tên | Admin Only |
|----------|-----|-----|:----------:|
| **Sales** | `live` | Hình Ảnh Live | |
| | `livestream` | Báo Cáo Livestream | |
| | `sanphamlive` | Sản Phẩm Livestream | ✅ |
| | `ib` | Check Inbox Khách | |
| **Warehouse** | `nhanhang` | Cân Nặng Hàng | |
| | `hangrotxa` | Hàng Rớt - Xả | |
| | `hanghoan` | Hàng Hoàn | |
| | `product-search` | Tìm Kiếm Sản Phẩm | |
| | `soluong-live` | Quản Lý Số Lượng | |
| **Orders** | `ck` | Thông Tin Chuyển Khoản | |
| | `order-management` | Quản Lý Order | |
| | `order-log` | Sổ Order | |
| | `order-live-tracking` | Sổ Order Live | |
| **Reports** | `baocaosaleonline` | Báo Cáo Sale-Online | |
| | `tpos-pancake` | Tpos - Pancake | |
| **Admin** | `user-management` | Quản Lý Tài Khoản | ✅ |
| | `balance-history` | Lịch Sử Số Dư | ✅ |
| | `customer-management` | Quản Lý Khách Hàng | ✅ |
| | `invoice-compare` | So Sánh Đơn Hàng | ✅ |
| | `lichsuchinhsua` | Lịch Sử Chỉnh Sửa | ✅ |

---

### Tầng 3: Detailed Permissions

Mỗi trang có các quyền chi tiết riêng:

```javascript
// Ví dụ: sanphamlive có 6 quyền chi tiết
{
    view: "Xem sản phẩm",
    add: "Thêm sản phẩm",
    edit: "Sửa sản phẩm",
    delete: "Xóa sản phẩm",
    pricing: "Chỉnh sửa giá",
    stock: "Quản lý tồn kho"
}
```

**Tổng cộng: 101 quyền chi tiết** trên 20 trang.

---

## Firebase Structure

```
Firebase Firestore
└── users/
    └── {username}/
        ├── username: "admin"
        ├── displayName: "Administrator"
        ├── identifier: "Admin01"
        ├── passwordHash: "pbkdf2_hash..."
        ├── salt: "random_salt..."
        ├── checkLogin: 0
        ├── pagePermissions: ["live", "user-management", ...]
        ├── detailedPermissions: {
        │     live: { view: true, upload: true, ... },
        │     sanphamlive: { view: true, add: false, ... }
        │   }
        ├── createdAt: Timestamp
        ├── createdBy: "admin"
        ├── updatedAt: Timestamp
        └── updatedBy: "admin"
```

---

## Permission Templates

| Template | Mô tả | Pages | Quyền chi tiết |
|----------|-------|-------|----------------|
| `admin` | Toàn quyền | 20/20 | 101/101 |
| `manager` | Quản lý | 20/20 | ~95 (không delete user, restore history) |
| `sales-team` | Nhóm bán hàng | 8/20 | Sales + Orders pages |
| `warehouse-team` | Nhóm kho | 11/20 | Warehouse + view Reports |
| `staff` | Nhân viên | 14/20 | View + Edit (không admin pages) |
| `viewer` | Chỉ xem | 14/20 | Chỉ View (không admin pages) |
| `custom` | Tùy chỉnh | Tùy chọn | Tùy chọn |

---

## Quick Access

| Chức năng | File | Function/Class |
|-----------|------|----------------|
| Registry | `permissions-registry.js` | `PAGES_REGISTRY`, `PermissionsRegistry` |
| Page permissions UI | `page-permissions-ui.js` | `PagePermissionsUI` class |
| Detailed permissions UI | `detailed-permissions-ui.js` | `DetailedPermissionsUI` class |
| Permissions Overview | `permissions-overview.js` | `PermissionsOverview` class |
| Auth check | `auth.js` | `authManager.hasPermission()` |
| CRUD users | `user-management-enhanced.js` | `createUser()`, `updateUser()`, etc. |

---

## Lưu Ý Quan Trọng

### ✅ Đã Hoàn Thành (Phase 1-3)

**Phase 1: Single Source of Truth**
- Tạo `permissions-registry.js` - Single Source of Truth
- 20 pages với đầy đủ cấu hình
- 5 categories phân loại
- 7 templates phân quyền
- 101 detailed permissions
- Helper functions đầy đủ

**Phase 2: Refactor UI**
- `page-permissions-ui.js` sử dụng PAGES_REGISTRY
- `detailed-permissions-ui.js` sử dụng PermissionsRegistry
- Backward compatibility với DETAILED_PERMISSIONS global

**Phase 3: Permissions Overview**
- `permissions-overview.js` - Tab Quyền Truy Cập hoàn chỉnh
- Ma trận User × Pages với 3 chế độ xem
- Filters: role, page, search
- Export CSV
- Inline toggle permissions

### 📋 Kế Hoạch (Phase 4+)
- Enforce detailed permissions trong các trang
- Auto-sync khi thêm trang mới

---

*Cập nhật: 2025-12-25*
