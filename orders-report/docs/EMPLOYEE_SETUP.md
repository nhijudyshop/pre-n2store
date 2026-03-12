# Tài liệu: Cài Đặt Phân Chia Nhân Viên

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Giao diện người dùng (UI)](#2-giao-diện-người-dùng-ui)
3. [Cấu trúc file](#3-cấu-trúc-file)
4. [Luồng hoạt động](#4-luồng-hoạt-động)
5. [Chi tiết từng hàm](#5-chi-tiết-từng-hàm)
6. [Cấu trúc dữ liệu Firebase](#6-cấu-trúc-dữ-liệu-firebase)
7. [Khởi tạo & Event Listeners](#7-khởi-tạo--event-listeners)
8. [CSS Styling](#8-css-styling)
9. [Tích hợp với các module khác](#9-tích-hợp-với-các-module-khác)

---

## 1. Tổng quan

Tính năng **Cài đặt phân chia nhân viên** cho phép admin phân công khoảng số thứ tự (STT) đơn hàng cho từng nhân viên. Hệ thống hỗ trợ:

- **Cấu hình chung**: Áp dụng cho tất cả chiến dịch
- **Cấu hình riêng theo chiến dịch live**: Mỗi chiến dịch có phân chia riêng

Ví dụ: Nhân viên "Hạnh" phụ trách đơn STT từ 1 đến 50, nhân viên "Duyên" phụ trách STT từ 51 đến 100.

---

## 2. Giao diện người dùng (UI)

### Nút mở drawer

```html
<!-- tab1-orders.html: dòng ~120 -->
<button class="btn-primary" id="employeeSettingsBtn" onclick="toggleEmployeeDrawer()"
    style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
    title="Cài đặt phân chia nhân viên">
    <i class="fas fa-users-cog"></i>
    Cài đặt phân chia nhân viên
</button>
```

### Drawer (panel trượt từ phải)

**File:** `orders-report/tab1-orders.html` — dòng 2450–2510

Drawer gồm 3 phần chính:

#### Header
```html
<div class="employee-drawer-header">
    <h3>
        <i class="fas fa-users-cog"></i>
        Cài đặt phân chia nhân viên
    </h3>
    <button class="employee-drawer-close" onclick="toggleEmployeeDrawer()">
        <i class="fas fa-times"></i>
    </button>
</div>
```

#### Body — Chọn chiến dịch + Bảng phân chia
```html
<div class="employee-drawer-body">
    <!-- Dropdown chọn chiến dịch -->
    <select id="employeeCampaignSelector">
        <option value="">Cấu hình chung (tất cả chiến dịch)</option>
        <!-- Các chiến dịch được populate động -->
    </select>

    <!-- Bảng nhân viên -->
    <table>
        <thead>
            <tr>
                <th>Nhân viên</th>
                <th>STT Từ</th>
                <th>STT Đến</th>
            </tr>
        </thead>
        <tbody id="employeeAssignmentBody">
            <!-- Render động từ Firestore users collection -->
        </tbody>
    </table>
</div>
```

#### Footer — Nút bấm
```html
<div class="employee-drawer-footer">
    <button class="btn-secondary" onclick="toggleEmployeeDrawer()">
        <i class="fas fa-times"></i> Đóng
    </button>
    <button class="btn-primary" onclick="applyEmployeeRanges()">
        <i class="fas fa-check"></i> Áp dụng
    </button>
</div>
```

---

## 3. Cấu trúc file

| File | Mô tả |
|------|-------|
| `orders-report/tab1-orders.html` | HTML drawer UI (dòng 2450–2510) + nút mở |
| `orders-report/js/tab1/tab1-employee.js` | Toàn bộ logic core (442 dòng) |
| `orders-report/js/core/user-employee-loader.js` | Class load danh sách nhân viên từ Firestore |
| `orders-report/js/tab1/tab1-init.js` | Đăng ký event listener cho campaign selector |
| `orders-report/css/tab1-orders.css` | CSS cho drawer (dòng 5201–5300) |

---

## 4. Luồng hoạt động

```
Người dùng bấm "Cài đặt phân chia nhân viên"
        │
        ▼
toggleEmployeeDrawer()
        │
        ├─ populateEmployeeCampaignSelector()   ← Load danh sách chiến dịch
        │
        └─ loadAndRenderEmployeeTable()          ← Load users từ Firestore
                │
                ▼
        UserEmployeeLoader.loadUsers()           ← Collection: users
                │
                ▼
        renderEmployeeTable(users)               ← Render bảng với giá trị từ employeeRanges[]
                │
                ▼
        Người dùng nhập STT Từ / STT Đến
                │
                ▼
        Bấm "Áp dụng" → applyEmployeeRanges()
                │
                ├─ [Chọn chiến dịch cụ thể]
                │       └─ Lưu vào: settings/employee_ranges_by_campaign
                │
                └─ [Cấu hình chung]
                        └─ Lưu vào: settings/employee_ranges
```

---

## 5. Chi tiết từng hàm

### `tab1-employee.js`

---

#### `loadAndRenderEmployeeTable()`
**Dòng:** 9–31

Khởi tạo `UserEmployeeLoader`, gọi `loadUsers()` từ Firestore rồi render bảng.

```javascript
async function loadAndRenderEmployeeTable() {
    await window.userEmployeeLoader.initialize();
    const users = await window.userEmployeeLoader.loadUsers();
    if (users.length > 0) {
        renderEmployeeTable(users);
    }
}
```

---

#### `renderEmployeeTable(users)`
**Dòng:** 33–77

Render từng dòng trong bảng. Mỗi nhân viên có 2 input: `STT Từ` và `STT Đến`. Giá trị được lấy từ biến global `employeeRanges[]`.

```javascript
function renderEmployeeTable(users) {
    // Map savedRanges từ global employeeRanges
    let savedRanges = {};
    employeeRanges.forEach(range => {
        savedRanges[range.name] = { start: range.start, end: range.end };
    });

    // Mỗi user → 1 dòng table với 2 input number
    users.forEach(user => {
        const savedRange = savedRanges[user.displayName] || { start: '', end: '' };
        // Render <input data-user-id data-user-name data-field="start/end">
    });
}
```

**Attributes trên input:**
| Attribute | Giá trị |
|-----------|---------|
| `data-user-id` | Firebase user document ID |
| `data-user-name` | displayName của nhân viên |
| `data-field` | `"start"` hoặc `"end"` |
| `class` | `employee-range-input` |

---

#### `applyEmployeeRanges()`
**Dòng:** 89–194

Thu thập tất cả input `.employee-range-input`, xây dựng mảng ranges, lưu lên Firestore.

**Validation:** Chỉ lưu nhân viên có cả `start > 0` và `end > 0`.

**Logic rẽ nhánh:**

```
Kiểm tra employeeCampaignSelector.value
    │
    ├─ Có chiến dịch được chọn:
    │     1. doc.get('settings/employee_ranges_by_campaign')
    │     2. Cập nhật key [sanitizedCampaignName] = newRanges
    │     3. doc.set(allCampaignRanges)
    │
    └─ Không chọn chiến dịch (cấu hình chung):
          db.collection('settings').doc('employee_ranges').set({ ranges: newRanges })
```

Sau khi lưu thành công: hiện thông báo qua `window.notificationManager` (hoặc `alert`), rồi đóng drawer.

---

#### `getEmployeeName(stt)`
**Dòng:** 196–209

Tra cứu tên nhân viên dựa vào số STT đơn hàng.

```javascript
function getEmployeeName(stt) {
    const sttNum = parseInt(stt);
    for (const range of employeeRanges) {
        if (sttNum >= range.start && sttNum <= range.end) {
            return range.name;
        }
    }
    return null;
}
```

---

#### `populateEmployeeCampaignSelector()`
**Dòng:** 211–242

Populate dropdown `#employeeCampaignSelector` từ `window.campaignManager.allCampaigns`.

Mỗi option lưu data JSON vào `option.dataset.campaign`:
```json
{ "id": "campaignId", "displayName": "Tên chiến dịch" }
```

---

#### `toggleEmployeeDrawer()`
**Dòng:** 244–263

Mở hoặc đóng drawer bằng cách toggle class `active` trên `#employeeDrawer` và `#employeeDrawerOverlay`.

Khi **mở**: gọi `populateEmployeeCampaignSelector()` và `loadAndRenderEmployeeTable()` để luôn hiển thị dữ liệu mới nhất.

---

#### `sanitizeCampaignName(campaignName)`
**Dòng:** 79–87

Làm sạch tên chiến dịch để dùng làm key trong Firestore (loại bỏ các ký tự không hợp lệ: `. $ # [ ] /`).

```javascript
function sanitizeCampaignName(campaignName) {
    return campaignName.replace(/[.$#\[\]\/]/g, '_').trim();
}
```

---

#### `normalizeEmployeeRanges(data)`
**Dòng:** 296–347

Chuẩn hóa dữ liệu từ Firestore về dạng array. Xử lý 2 trường hợp:
1. **Array**: trả về nguyên
2. **Object với numeric keys** (Firestore đôi khi lưu array dưới dạng object `{0: {...}, 1: {...}}`): convert về array
3. **Object với string keys** và có fields `start`/`end`: convert về array

---

#### `loadEmployeeRangesForCampaign(campaignName)`
**Dòng:** 349–421

Load ranges từ Firestore theo logic:

```
campaignName !== null
    │
    ├─ Đọc: settings/employee_ranges_by_campaign
    │       └─ Lấy key [sanitized(campaignName)]
    │           ├─ Có data → employeeRanges = normalized data
    │           └─ Không có data → fallback: đọc settings/employee_ranges
    │
    └─ campaignName === null
            └─ Đọc: settings/employee_ranges → employeeRanges = data.ranges
```

Sau khi load: sync `window.employeeRanges = employeeRanges`. Nếu drawer đang mở, tự động re-render bảng.

---

#### `syncEmployeeRanges()` *(hiện đã disabled)*
**Dòng:** 423–440

Real-time sync qua Firestore `onSnapshot`. Hiện không được gọi trong production.

---

#### `checkAdminPermission()`
**Dòng:** 286–293

Hiển thị nút `#employeeSettingsBtn`. Trước đây có kiểm tra quyền admin, hiện đã bỏ — tất cả user đều thấy nút này.

---

### `user-employee-loader.js`

**File:** `orders-report/js/core/user-employee-loader.js`

```javascript
class UserEmployeeLoader {
    constructor() {
        this.users = [];
        this.db = null;
        this.initialized = false;
    }

    async initialize()    // Kết nối Firestore
    async loadUsers()     // Load từ collection 'users', sort theo displayName
    getUsers()            // Trả về cache
}

// Global instance
window.userEmployeeLoader = new UserEmployeeLoader();
```

**User object được load:**
```javascript
{
    id: "firebaseDocId",
    displayName: "Tên nhân viên",
    email: "email@example.com",
    checkLogin: 0  // 0 = admin, 1 = user
}
```

---

## 6. Cấu trúc dữ liệu Firebase

### Cấu hình chung
**Path:** `settings/employee_ranges`

```json
{
    "ranges": [
        { "id": "userId1", "name": "Hạnh", "start": 1, "end": 50 },
        { "id": "userId2", "name": "Duyên", "start": 51, "end": 100 },
        { "id": "userId3", "name": "Lài", "start": 101, "end": 150 }
    ]
}
```

### Cấu hình theo chiến dịch
**Path:** `settings/employee_ranges_by_campaign`

```json
{
    "Live_Sale_25_12_2024": [
        { "id": "userId1", "name": "Hạnh", "start": 1, "end": 30 },
        { "id": "userId2", "name": "Duyên", "start": 31, "end": 60 }
    ],
    "Live_Sale_01_01_2025": [
        { "id": "userId1", "name": "Hạnh", "start": 1, "end": 40 },
        { "id": "userId3", "name": "Lài", "start": 41, "end": 80 }
    ]
}
```

> **Lưu ý:** Tên chiến dịch được sanitize trước khi dùng làm key (ví dụ: `Live/Sale 25.12` → `Live_Sale_25_12`).

### Employee Range Object

```typescript
interface EmployeeRange {
    id: string;       // Firebase user document ID
    name: string;     // displayName của nhân viên
    start: number;    // STT bắt đầu (inclusive)
    end: number;      // STT kết thúc (inclusive)
}
```

---

## 7. Khởi tạo & Event Listeners

### `tab1-init.js`

**Dòng 113–127:** Đăng ký event listener khi user thay đổi chiến dịch trong drawer:

```javascript
const employeeCampaignSelector = document.getElementById('employeeCampaignSelector');
employeeCampaignSelector.addEventListener('change', function(e) {
    const selectedOption = e.target.options[e.target.selectedIndex];
    if (selectedOption.dataset.campaign) {
        const campaign = JSON.parse(selectedOption.dataset.campaign);
        loadEmployeeRangesForCampaign(campaign.displayName);
    } else {
        loadEmployeeRangesForCampaign(null);  // Load cấu hình chung
    }
});
```

**Dòng 263:** Gọi `checkAdminPermission()` để hiển thị nút settings.

**Dòng 439:** Gọi `loadEmployeeRangesForCampaign(null)` song song khi khởi tạo app.

**Dòng 591–594:** Gọi `loadEmployeeRangesForCampaign(campaign.name)` khi user chọn chiến dịch từ filter chính.

---

## 8. CSS Styling

**File:** `orders-report/css/tab1-orders.css` — dòng 5201–5300

| Class | Mô tả |
|-------|-------|
| `.employee-drawer-overlay` | Overlay tối phía sau, `z-index: 9998` |
| `.employee-drawer` | Panel trắng bên phải, `width: 450px`, `z-index: 9999` |
| `.employee-drawer.active` | `transform: translateX(0)` — hiện drawer |
| `.employee-drawer-header` | Header gradient `#6366f1 → #4f46e5` |
| `.employee-drawer-body` | Scrollable, `flex: 1` |
| `.employee-drawer-footer` | Footer nền `#f8f9fa`, chứa 2 nút |

**Animation:** Drawer trượt từ phải vào bằng `transition: transform 0.3s ease`.

```css
.employee-drawer {
    position: fixed;
    top: 0; right: 0;
    width: 450px;
    height: 100vh;
    transform: translateX(100%);   /* Ẩn ban đầu */
    transition: transform 0.3s ease;
}

.employee-drawer.active {
    transform: translateX(0);      /* Hiện khi active */
}
```

---

## 9. Tích hợp với các module khác

### `overview-statistics.js`
- Dòng 171: `getEmployeeBySTT(stt)` — dùng `employeeRanges` để lấy thông tin nhân viên theo STT
- Dòng 1114–1115: Hiển thị thông báo khi chưa cấu hình:
  ```
  "Chưa cài đặt phân chia nhân viên"
  "Vui lòng cài đặt phân chia nhân viên ở tab Quản Lý Đơn Hàng"
  ```

### `tab1-campaign-system.js`
- Dòng 615–616: Gọi `loadEmployeeRangesForCampaign()` khi chọn chiến dịch
- Dòng 733–734: Gọi trong luồng campaign thay thế

### Biến global
| Biến | Mô tả |
|------|-------|
| `employeeRanges` | Array hiện tại đang được dùng (local scope) |
| `window.employeeRanges` | Sync từ `employeeRanges` để các module khác truy cập |
| `window.userEmployeeLoader` | Instance của `UserEmployeeLoader` |

---

## Luồng fallback khi load ranges

```
loadEmployeeRangesForCampaign("Tên chiến dịch")
        │
        ▼
   Đọc Firestore: settings/employee_ranges_by_campaign
        │
        ├─ Có data cho chiến dịch đó?
        │     ├─ CÓ → dùng data đó
        │     └─ KHÔNG → đọc settings/employee_ranges (cấu hình chung)
        │
        └─ Cập nhật employeeRanges + window.employeeRanges
```
