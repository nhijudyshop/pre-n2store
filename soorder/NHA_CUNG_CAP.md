# 📋 TÀI LIỆU CHI TIẾT: PHẦN NHÀ CUNG CẤP (NCC) - SỔ ORDER

> **Cập nhật lần cuối:** 24/02/2026  
> **Module:** `soorder/`  
> **Mục đích:** Quản lý danh sách nhà cung cấp (NCC) – đồng bộ từ TPOS, lưu trữ trên Firebase, autocomplete khi nhập đơn hàng, và xử lý xung đột tên.

---

## 📁 Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu Trúc File Liên Quan](#2-cấu-trúc-file-liên-quan)
3. [Cấu Trúc Dữ Liệu](#3-cấu-trúc-dữ-liệu)
4. [Luồng Dữ Liệu (Data Flow)](#4-luồng-dữ-liệu-data-flow)
5. [Module: soorder-supplier-loader.js](#5-module-soorder-supplier-loaderjs)
6. [Module: soorder-crud.js – Phần NCC](#6-module-soorder-crudjs--phần-ncc)
7. [Module: soorder-ui.js – Phần NCC](#7-module-soorder-uijs--phần-ncc)
8. [Module: soorder-config.js – Phần NCC](#8-module-soorder-configjs--phần-ncc)
9. [Module: soorder-main.js – Event Listeners NCC](#9-module-soorder-mainjs--event-listeners-ncc)
10. [HTML: index.html – Phần NCC](#10-html-indexhtml--phần-ncc)
11. [CSS: soorder.css – Phần NCC](#11-css-soordercss--phần-ncc)
12. [Xử Lý Xung Đột Tên NCC](#12-xử-lý-xung-đột-tên-ncc)
13. [Xử Lý NCC Trùng Mã Từ TPOS](#13-xử-lý-ncc-trùng-mã-từ-tpos)
14. [Quy Trình Kiểm Tra NCC Khi Tạo/Sửa Đơn Hàng](#14-quy-trình-kiểm-tra-ncc-khi-tạosửa-đơn-hàng)
15. [Bộ Lọc NCC Trên Bảng Dữ Liệu](#15-bộ-lọc-ncc-trên-bảng-dữ-liệu)
16. [Sơ Đồ Tương Tác Giữa Các Module](#16-sơ-đồ-tương-tác-giữa-các-module)
17. [Lưu Ý Kỹ Thuật](#17-lưu-ý-kỹ-thuật)

---

## 1. Tổng Quan Kiến Trúc

Phần nhà cung cấp (NCC) trong Sổ Order được thiết kế theo mô hình **đồng bộ từ TPOS → lưu Firebase → sử dụng trong ứng dụng**:

```
┌──────────────┐       ┌──────────────────────┐       ┌────────────────┐
│   TPOS API   │──────▶│  Cloudflare Worker   │──────▶│    Firebase    │
│   (OData)    │       │   (Proxy + Token)    │       │  (ncc-names)   │
└──────────────┘       └──────────────────────┘       └───────┬────────┘
                                                              │
                        ┌─────────────────────────────────────┘
                        ▼
              ┌──────────────────┐
              │    Application   │
              │  State (memory)  │
              │  nccNames: []    │
              └────────┬─────────┘
                       │
          ┌────────────┼────────────────┐
          ▼            ▼                ▼
    ┌──────────┐ ┌──────────┐   ┌─────────────┐
    │Autocomplete│ │  NCC     │   │  NCC Filter │
    │Suggestions│ │Management│   │  (bảng DL)  │
    └──────────┘ │  Modal   │   └─────────────┘
                 └──────────┘
```

### Các Thành Phần Chính:

| Thành phần | Vai trò |
|---|---|
| **TPOS OData API** | Nguồn dữ liệu gốc – danh sách NCC (Partner có `Supplier=true, Active=true`) |
| **Cloudflare Worker** | Proxy API, xử lý CORS và cache token TPOS |
| **Firebase Firestore** | Lưu trữ vĩnh viễn danh sách NCC (`ncc-names` collection) |
| **Application State** | Bộ nhớ runtime (`window.SoOrderState.nccNames`) |
| **UI Components** | Autocomplete, modal quản lý, modal xung đột, bộ lọc |

---

## 2. Cấu Trúc File Liên Quan

```
soorder/
├── index.html                          # HTML: Modal NCC, NCC conflict, input NCC
├── css/
│   └── soorder.css                     # CSS: Styles cho NCC management, suggestions, conflict, filter
└── js/
    ├── soorder-config.js               # Config: nccNamesCollectionRef, SoOrderState.nccNames
    ├── soorder-supplier-loader.js      # ⭐ Core: Tải NCC từ TPOS API, lưu Firebase  
    ├── soorder-crud.js                 # CRUD: loadNCCNames, saveNCCName, updateNCCName, deleteNCCName, parseNCCCode, checkNCCConflict
    ├── soorder-ui.js                   # UI: Suggestions, NCC modal, conflict modal, supplier not found, duplicate supplier
    ├── soorder-main.js                 # Init: Event listeners cho NCC management
    └── soorder-utils.js                # Utils: validateOrder (kiểm tra supplier không rỗng)
```

---

## 3. Cấu Trúc Dữ Liệu

### 3.1 Firebase Firestore – Collection `ncc-names`

Mỗi document trong collection `ncc-names` đại diện cho **một nhà cung cấp**:

```
Collection: ncc-names
└── Document ID: <sanitized TPOS code> (VD: "KH000123", "A1")
    ├── name: string       // Tên đầy đủ NCC (VD: "A1 Nguyễn Văn A")
    ├── axCode: string     // Mã Ax trích xuất từ tên (VD: "A1") hoặc null
    └── tposCode: string   // Mã gốc từ TPOS (VD: "KH000123")
```

**Quy tắc Document ID:**
- Với NCC từ TPOS: `sanitizeDocId(tposCode)` → thay thế ký tự `/ \ . # $ [ ]` bằng `_`
- Với NCC thêm thủ công: Dùng `axCode.toUpperCase()` làm Document ID

### 3.2 Application State – `window.SoOrderState.nccNames`

```javascript
// Mảng các NCC được load từ Firebase vào memory
nccNames: [
    {
        code: "A1",           // axCode hoặc doc.id.toUpperCase()
        tposCode: "KH000123", // Mã TPOS gốc
        docId: "KH000123",    // Document ID trong Firestore (đã sanitized)
        name: "A1 Nguyễn Văn A"  // Tên đầy đủ
    },
    // ...
]
```

**Quy tắc sắp xếp:**
1. NCC có mã Ax (A1, A2, ...) được sắp trước, theo số thứ tự tăng dần
2. NCC không có mã Ax sắp theo tên (alphabetical)

### 3.3 Order Data – Trường `supplier`

Khi tạo/sửa đơn hàng, tên NCC được lưu vào trường `supplier` trong order:

```javascript
{
    id: "uuid",
    supplier: "A1 Nguyễn Văn A",   // Tên đầy đủ NCC
    amount: 500000,
    isPaid: false,
    difference: 0,
    note: "",
    // ...
}
```

---

## 4. Luồng Dữ Liệu (Data Flow)

### 4.1 Luồng Khởi Tạo (DOMContentLoaded)

```
1. soorder-main.js: DOMContentLoaded
   ├── initDOMElements()           → Gán DOM references cho NCC elements
   ├── setupEventListeners()       → Đăng ký event listeners cho NCC
   └── SoOrderCRUD.loadNCCNames()  → Load NCC từ Firebase vào state
       └── Firestore.get("ncc-names") → nccNames[]
```

### 4.2 Luồng Đồng Bộ Từ TPOS (User Click "Tải danh sách NCC từ TPOS")

```
1. User click [btnFetchFromTPOS]
2. SoOrderUI.handleFetchFromTPOS()
3. SoOrderSupplierLoader.loadAndSaveSuppliers()
   ├── Step 1: getTPOSToken()
   │   └── POST /api/token → access_token
   ├── Step 2: fetchSuppliersFromTPOS(token)
   │   └── GET /api/odata/Partner/ODataService.GetView
   │       ?$top=1000&$orderby=Name
   │       &$filter=(Supplier eq true and Active eq true)
   │       &$count=true
   │   └── → suppliers[]
   ├── Step 3: saveSuppliersToFirebase(suppliers)
   │   ├── 3a: Xóa toàn bộ dữ liệu cũ trong Firebase (batch delete)
   │   ├── 3b: Chuẩn bị dữ liệu mới (parse axCode, sanitize docId)
   │   └── 3c: Lưu theo batch (400 docs/batch, dưới limit 500 của Firestore)
   └── Step 4: updateStateFromFirebase()
       └── Reload từ Firebase → cập nhật nccNames[]
4. SoOrderCRUD.loadNCCNames() → Refresh state
5. SoOrderUI.renderNCCList() → Cập nhật hiển thị trong modal
```

### 4.3 Luồng Autocomplete (Khi User Nhập NCC)

```
1. User gõ vào input #addSupplier hoặc #editSupplier
2. Event: "input" → SoOrderUI.showNCCSuggestions(input, suggestionsEl)
3. Lọc nccNames[] theo giá trị nhập (case-insensitive includes)
4. Tìm exact match theo mã Ax (VD: gõ "a5" → match "A5")
5. Render danh sách gợi ý
6. User click gợi ý → điền tên NCC vào input → focus vào ô "Thành tiền"
7. Hoặc: User nhấn Tab → chọn exact match (nếu có)
```

### 4.4 Luồng Tạo/Sửa Đơn Hàng (Kiểm Tra NCC)

```
1. User submit form tạo/sửa đơn hàng
2. SoOrderUI.handleAddOrder() hoặc handleUpdateOrder()
3. SoOrderUI.processOrderWithNCCCheck(orderData, isEdit, mode)
   ├── Parse mã Ax từ tên NCC
   ├── Kiểm tra NCC tồn tại trong nccNames[]?
   │   ├── KHÔNG → showSupplierNotFoundModal() → DỪNG
   │   └── CÓ → Tiếp tục
   ├── Kiểm tra xung đột tên (cùng mã, khác tên)?
   │   ├── CÓ → showNCCConflictModal() → User chọn tên → Tiếp tục
   │   └── KHÔNG → Tiếp tục
   └── CRUD.addOrder() hoặc CRUD.updateOrder()
```

---

## 5. Module: soorder-supplier-loader.js

> **Object:** `window.SoOrderSupplierLoader`  
> **Chức năng:** Tải danh sách NCC từ TPOS OData API qua Cloudflare Worker proxy, lưu vào Firebase.

### 5.1 Cấu Hình

```javascript
WORKER_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev'

TPOS_CREDENTIALS: {
    grant_type: 'password',
    username: 'nvkt',
    password: 'Aa@123456789',
    client_id: 'tmtWebApp'
}
```

### 5.2 Các Hàm

#### `getTPOSToken()` → `Promise<string>`
- **Mục đích:** Lấy access token từ TPOS API
- **Endpoint:** `POST {WORKER_URL}/api/token`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Trả về:** `access_token` (string)

#### `fetchSuppliersFromTPOS(token)` → `Promise<Array>`
- **Mục đích:** Lấy danh sách NCC active từ TPOS OData API
- **Endpoint:** `GET {WORKER_URL}/api/odata/Partner/ODataService.GetView`
- **Parameters:**
  - `$top`: 1000
  - `$orderby`: Name
  - `$filter`: `(Supplier eq true and Active eq true)`
  - `$count`: true
- **Headers:**
  - `Authorization: Bearer {token}`
  - `tposappversion`: Từ `window.TPOS_CONFIG?.tposAppVersion` hoặc mặc định `5.11.16.1`
- **Trả về:** Array các supplier objects. Mỗi object có:
  - `Name`: Tên NCC
  - `Ref`: Mã TPOS (thay vì `Code`)

#### `parseNCCCode(text)` → `string | null`
- **Mục đích:** Trích xuất mã Ax từ tên NCC
- **Ưu tiên:** Dùng `SoOrderCRUD.parseNCCCode` nếu có, fallback regex `/\b(A\d+)\b/i`
- **VD:** `"A1 Nguyễn Văn A"` → `"A1"`

#### `sanitizeDocId(id)` → `string | null`
- **Mục đích:** Loại bỏ ký tự không hợp lệ cho Firestore Document ID
- **Ký tự bị thay thế:** `/ \ . # $ [ ]` → `_`

#### `chunkArray(array, chunkSize)` → `Array<Array>`
- **Mục đích:** Chia mảng lớn thành các mảng nhỏ hơn
- **Sử dụng:** Batch operations với Firestore (limit 500 operations/batch)

#### `deleteAllFromCollection(collectionRef, db)` → `Promise<number>`
- **Mục đích:** Xóa toàn bộ documents trong một collection
- **Batch size:** 400 (an toàn dưới limit 500)
- **Trả về:** Số documents đã xóa

#### `saveSuppliersToFirebase(suppliers)` → `Promise<{success, count}>`
- **Mục đích:** Lưu danh sách NCC vào Firebase (overwrite toàn bộ)
- **Quy trình:**
  1. Xóa toàn bộ dữ liệu cũ (`deleteAllFromCollection`)
  2. Chuẩn bị dữ liệu (parse name, tposCode, axCode, sanitize docId)
  3. Lưu theo batch 400 docs/batch
- **Cấu trúc mỗi document lưu:**
  ```javascript
  {
      name: "A1 Nguyễn Văn A",   // tên đầy đủ (trimmed)
      axCode: "A1",              // mã Ax trích xuất hoặc null
      tposCode: "KH000123"       // mã TPOS gốc
  }
  ```

#### `processDuplicateGroups(duplicateGroups, existingNames)` → `Promise<Array>`
- **Mục đích:** Xử lý các nhóm NCC trùng mã Ax – hỏi user chọn tên
- **Gọi:** `showDuplicateSelectionModal` cho từng group

#### `showDuplicateSelectionModal(code, suppliers, existingName)` → `Promise<object|null>`
- **Mục đích:** Hiển thị modal cho user chọn tên khi có nhiều NCC cùng mã
- **Logic:** Nếu chỉ còn 1 option → auto-select

#### `updateStateFromFirebase()` → `Promise<void>`
- **Mục đích:** Reload danh sách NCC từ Firebase vào `SoOrderState.nccNames`
- **Sắp xếp:** Ax codes trước (theo số), sau đó theo tên

#### `updateState(suppliers)` (Legacy)
- **Mục đích:** Cập nhật state trực tiếp từ supplier data (backward compatibility)
- **Loại bỏ trùng lặp:** Check code trước khi thêm

#### `loadAndSaveSuppliers()` → `Promise<{success, count}|{success, error}>`
- **Mục đích:** Hàm chính – orchestrate toàn bộ quy trình tải NCC
- **Quy trình:**
  1. Show toast "Đang tải..."
  2. Get TPOS token
  3. Fetch suppliers từ TPOS
  4. Save to Firebase
  5. Update state từ Firebase
  6. Show success/error toast
- **Error handling:** Phân loại lỗi (401/Token, network/fetch, Firebase)

---

## 6. Module: soorder-crud.js – Phần NCC

> **Object:** `window.SoOrderCRUD`  
> **Phần NCC:** Dòng 680-873

### 6.1 `loadNCCNames()` → `Promise<Array>`
- **Mục đích:** Load toàn bộ NCC từ Firebase collection `ncc-names` vào `state.nccNames`
- **Cấu trúc mỗi item:**
  ```javascript
  {
      code: data.axCode || doc.id.toUpperCase(),
      tposCode: data.tposCode || doc.id,
      docId: doc.id,
      name: data.name
  }
  ```
- **Sắp xếp:**
  - Ax codes trước (A1, A2, ...), sắp theo số
  - Không có Ax code → sắp theo `name.localeCompare()`

### 6.2 `saveNCCName(supplierName)` → `Promise<{success, conflict, existingName}>`
- **Mục đích:** Lưu NCC mới (thêm thủ công)
- **Quy trình:**
  1. Parse Ax code → nếu không có → return `{success: false}`
  2. Check trùng code nhưng khác tên → return `{conflict: true, existingName}`
  3. Check trùng code và trùng tên → return `{success: true}` (không lưu lại)
  4. Lưu mới vào Firebase:
     ```javascript
     {
         name: trimmedName,
         axCode: docId,
         tposCode: docId  // NCC thủ công dùng axCode làm tposCode
     }
     ```
  5. Cập nhật state, sort lại

### 6.3 `updateNCCName(code, newName)` → `Promise<boolean>`
- **Mục đích:** Cập nhật tên NCC đã tồn tại
- **Document ID:** `code.toUpperCase()`
- **Lưu:**
  ```javascript
  {
      name: trimmedName,
      axCode: newAxCode || docId,
      tposCode: docId
  }
  ```

### 6.4 `deleteNCCName(code)` → `Promise<boolean>`
- **Mục đích:** Xóa NCC
- **Document ID:** `code.toUpperCase()`
- **Cập nhật state:** Filter bỏ NCC khỏi `nccNames[]`

### 6.5 `parseNCCCode(supplierName)` → `string | null`
- **Regex:** `/^(A\d+)/i` (match Ax code ở đầu chuỗi)
- **VD:**
  - `"A1 Tên NCC"` → `"A1"`
  - `"Không có mã"` → `null`

### 6.6 `checkNCCConflict(supplierName)` → `string | null`
- **Mục đích:** Kiểm tra xung đột tên NCC (cùng mã Ax nhưng khác tên)
- **Trả về:** Tên NCC đã lưu nếu có xung đột, `null` nếu không

---

## 7. Module: soorder-ui.js – Phần NCC

> **Object:** `window.SoOrderUI`  
> **Phần NCC:** Dòng 1239-1839

### 7.1 Autocomplete Suggestions

#### `showNCCSuggestions(inputElement, suggestionsElement)`
- **Trigger:** User gõ vào ô NCC (input event)
- **Logic lọc:** `ncc.name.toLowerCase().includes(value)`
- **Exact match:** Tìm NCC có `code.toLowerCase() === value` → highlight đặc biệt
- **Render mỗi item:**
  ```html
  <div class="ncc-suggestion-item [exact-match]">
      <span class="ncc-code">A1</span>
      <span class="ncc-name"> Nguyễn Văn A</span>
  </div>
  ```
- **Click item:** Điền tên → focus vào ô amount

#### `selectExactMatchNCC(inputElement, suggestionsElement)` → `boolean`
- **Trigger:** User nhấn Tab khi có exact match
- **Hành vi:** Điền tên exact match vào input, ẩn suggestions

#### `hideNCCSuggestions()`
- **Mục đích:** Ẩn tất cả dropdowns gợi ý NCC
- **Trigger:** Click ngoài vùng suggestions

### 7.2 NCC Management Modal

#### `showNCCManageModal()`
- **Trigger:** Click nút `btnManageNCC` (icon building-2)
- **Hành vi:**
  1. Reload NCC từ Firebase (`loadNCCNames`)
  2. Render danh sách (`renderNCCList`)
  3. Hiện modal

#### `hideNCCManageModal()`
- **Trigger:** Click overlay, nút X, hoặc nút "Đóng"

#### `renderNCCList()`
- **Mục đích:** Render danh sách NCC trong modal quản lý
- **Mỗi item:**
  ```html
  <div class="ncc-list-item">
      <div class="ncc-list-item-info">
          <span class="ncc-list-item-code">A1</span>
          <span class="ncc-list-item-name">A1 Nguyễn Văn A</span>
      </div>
      <div class="ncc-list-item-actions">
          <button class="btn-icon-sm delete" data-code="A1">
              <i data-lucide="trash-2"></i>
          </button>
      </div>
  </div>
  ```
- **Xóa NCC:** Confirm dialog → `CRUD.deleteNCCName(code)` → re-render
- **Empty state:** Hiển thị khi không có NCC nào

### 7.3 NCC Conflict Modal

#### `showNCCConflictModal(newName, existingName, callback)`
- **Trigger:** Khi phát hiện xung đột tên (cùng mã Ax, khác tên)
- **Hiển thị:**
  - Tên mới (từ user input)
  - Tên đã lưu (trong Firebase)
  - Radio buttons để chọn
- **Callback:** `(chosenName, isNew)` → `isNew=true` nếu chọn tên mới

#### `hideNCCConflictModal()`

#### `handleNCCConflictConfirm()`
- **Logic:** Đọc radio selection, gọi callback với tên được chọn

### 7.4 Process Order With NCC Check

#### `processOrderWithNCCCheck(orderData, isEdit, mode)` → `Promise<boolean>`
- **Mục đích:** Kiểm tra NCC trước khi tạo/sửa đơn hàng
- **Quy trình:**
  1. Parse mã Ax từ `orderData.supplier`
  2. **NCC không tồn tại trong Firebase:** → `showSupplierNotFoundModal()` → return `false`
  3. **NCC tồn tại nhưng tên khác** (conflict): → `showNCCConflictModal()` → user chọn tên → tiếp tục CRUD
  4. **Không conflict:** → thực hiện CRUD bình thường
- **Lưu ý:** Không tự động cập nhật tên NCC trong Firebase khi có conflict (chỉ dùng tên user chọn cho đơn hàng)

### 7.5 Supplier Not Found Modal

#### `showSupplierNotFoundModal()`
- **Trigger:** Khi NCC không tồn tại trong Firebase
- **Nội dung:** "Nhà cung cấp chưa tồn tại trong TPOS, vui lòng tạo NCC trên TPOS sau đó F5 lại trang"
- **Modal được tạo động** (create on first use, reuse after)

#### `createSupplierNotFoundModal()` → `HTMLElement`
- **Tạo modal DOM element** với overlay, header, body, footer
- **Event listeners:** overlay click, close button, confirm button → ẩn modal

### 7.6 Thêm NCC Thủ Công

#### `handleAddNCCManual()`
- **Trigger:** Click nút "Thêm" hoặc Enter trong ô `nccManualInput`
- **Validation:**
  - Input không rỗng
  - Phải bắt đầu bằng Ax (regex `/^(A\d+)/i`)
- **Quy trình:**
  1. Kiểm tra conflict → nếu có → showNCCConflictModal
     - User chọn "Tên mới" → `CRUD.updateNCCName(code, chosenName)`
     - User chọn "Tên đã lưu" → không làm gì
  2. Không conflict → `CRUD.saveNCCName(supplierName)`
  3. Clear input, re-render list

### 7.7 Fetch From TPOS

#### `handleFetchFromTPOS()`
- **Trigger:** Click nút "Tải danh sách NCC từ TPOS"
- **Quy trình:**
  1. Gọi `SoOrderSupplierLoader.loadAndSaveSuppliers()`
  2. Thành công → `CRUD.loadNCCNames()` → `renderNCCList()`
  3. Thất bại → hiển thị toast lỗi

### 7.8 Duplicate Supplier Selection Modal

#### `showDuplicateSupplierModal(code, options, callback)`
- **Trigger:** Khi phát hiện nhiều NCC cùng mã từ TPOS
- **Hiển thị:** Danh sách radio buttons với các options
- **Options format:**
  ```javascript
  { code: "A1", name: "A1 Tên 1", isExisting: false }   // Từ TPOS
  { code: "A1", name: "A1 Tên 2", isExisting: true }    // Đã lưu
  ```
- **Callback:** `(selectedOption)` → null nếu bỏ qua

#### `createDuplicateSupplierModal()` → `HTMLElement`
- **Tạo modal DOM động** với overlay, header ("Trùng mã NCC: ..."), options list, buttons

#### `hideDuplicateSupplierModal(selected)`
- **Ẩn modal** và gọi callback với selected option

#### `handleDuplicateSupplierConfirm()`
- **Đọc radio selection**, lấy option từ stored data, gọi hide with selected

---

## 8. Module: soorder-config.js – Phần NCC

### 8.1 Firebase Collection Reference

```javascript
const nccNamesCollectionRef = db.collection("ncc-names");
```

### 8.2 Global State

```javascript
window.SoOrderState = {
    // ...
    nccNames: [],      // Array of { code, tposCode, docId, name }
    nccFilter: "",     // Bộ lọc NCC trên bảng dữ liệu
};
```

### 8.3 DOM Elements

```javascript
window.SoOrderElements = {
    // NCC Management elements
    btnManageNCC: null,              // Nút mở modal quản lý NCC
    nccManageModal: null,            // Modal quản lý NCC
    nccManageModalOverlay: null,     // Overlay modal
    btnCloseNCCManageModal: null,    // Nút đóng modal
    btnCancelNCCManage: null,        // Nút "Đóng" 
    nccList: null,                   // Container danh sách NCC
    addSupplierSuggestions: null,    // Dropdown gợi ý (form thêm)
    editSupplierSuggestions: null,   // Dropdown gợi ý (form sửa)

    // NCC Conflict modal elements
    nccConflictModal: null,          // Modal xung đột
    nccConflictModalOverlay: null,   // Overlay
    btnCloseNCCConflictModal: null,  // Nút đóng
    nccConflictNewName: null,        // Hiển thị tên mới
    nccConflictExistingName: null,   // Hiển thị tên đã lưu
    btnCancelNCCConflict: null,      // Nút hủy
    btnConfirmNCCConflict: null,     // Nút xác nhận (Sử dụng cả 2 tên)
};
```

### 8.4 Export Config

```javascript
window.SoOrderConfig = {
    nccNamesCollectionRef,  // Firestore collection reference
    db,                     // Firestore instance
    // ...
};
```

---

## 9. Module: soorder-main.js – Event Listeners NCC

### 9.1 Khởi Tạo (DOMContentLoaded)

```javascript
// Dòng 25-26
await window.SoOrderCRUD.loadNCCNames();
```

### 9.2 initDOMElements() – Phần NCC (Dòng 132-150)

Gán tất cả DOM references cho NCC elements.

### 9.3 setupEventListeners() – Phần NCC (Dòng 632-764)

| Event | Element | Handler |
|---|---|---|
| click | `btnManageNCC` | `ui.showNCCManageModal()` |
| click | `btnCloseNCCManageModal` | `ui.hideNCCManageModal()` |
| click | `nccManageModalOverlay` | `ui.hideNCCManageModal()` |
| click | `btnCancelNCCManage` | `ui.hideNCCManageModal()` |
| click | `btnFetchFromTPOS` | `ui.handleFetchFromTPOS()` |
| click | `btnAddNCCManual` | `ui.handleAddNCCManual()` |
| keypress (Enter) | `nccManualInput` | `ui.handleAddNCCManual()` |
| click | `btnCloseNCCConflictModal` | `ui.hideNCCConflictModal()` |
| click | `nccConflictModalOverlay` | `ui.hideNCCConflictModal()` |
| click | `btnCancelNCCConflict` | `ui.hideNCCConflictModal()` |
| click | `btnConfirmNCCConflict` | `ui.handleNCCConflictConfirm()` |

### 9.4 NCC Suggestions Event Listeners (Dòng 716-764)

**Add Form:**
| Event | Element | Handler |
|---|---|---|
| input | `addSupplier` | `ui.showNCCSuggestions(addSupplier, addSupplierSuggestions)` |
| focus | `addSupplier` | `ui.showNCCSuggestions(...)` (nếu có giá trị) |
| keydown (Tab) | `addSupplier` | `ui.selectExactMatchNCC(...)` |

**Edit Form:**
| Event | Element | Handler |
|---|---|---|
| input | `editSupplier` | `ui.showNCCSuggestions(editSupplier, editSupplierSuggestions)` |
| focus | `editSupplier` | `ui.showNCCSuggestions(...)` (nếu có giá trị) |
| keydown (Tab) | `editSupplier` | `ui.selectExactMatchNCC(...)` |

**Returns Tab (Dòng 999-1019):**
| Event | Element | Handler |
|---|---|---|
| input | `addReturnSupplier` | `ui.showNCCSuggestions(...)` |
| focus | `addReturnSupplier` | `ui.showNCCSuggestions(...)` |
| keydown (Tab) | `addReturnSupplier` | `ui.selectExactMatchNCC(...)` |

**Hide suggestions on click outside (Dòng 757-764):**
```javascript
document.addEventListener("click", (e) => {
    const isInsideSuggestion = target.closest(".ncc-suggestions") ||
        target.closest(".ncc-input-wrapper");
    if (!isInsideSuggestion) {
        ui.hideNCCSuggestions();
    }
});
```

### 9.5 NCC Filter Event Listeners (Dòng 536-583, 906-948)

**Tab Sổ Order:**
| Event | Element | Handler |
|---|---|---|
| input | `nccFilterInput` | Cập nhật `state.nccFilter`, re-render table |
| click | `btnClearNCCFilter` | Reset filter, re-render table |

**Tab Trả Hàng:**
| Event | Element | Handler |
|---|---|---|
| input | `returnNccFilterInput` | Cập nhật `state.nccFilter`, re-render table |
| click | `btnReturnClearNCCFilter` | Reset filter, re-render table |

---

## 10. HTML: index.html – Phần NCC

### 10.1 Nút Quản Lý NCC (Dòng 99-101)

```html
<button class="btn-icon" id="btnManageNCC" title="Quản lý tên NCC">
    <i data-lucide="building-2"></i>
</button>
```

### 10.2 Input NCC trong Form Thêm Đơn (Dòng 178-184)

```html
<div class="form-group required">
    <label>NCC <span class="required-mark">*</span></label>
    <div class="ncc-input-wrapper">
        <input type="text" id="addSupplier" placeholder="Nhập tên nhà cung cấp" autocomplete="off"/>
        <div class="ncc-suggestions" id="addSupplierSuggestions"></div>
    </div>
</div>
```

### 10.3 Input NCC trong Form Sửa Đơn (Dòng 457-462)

```html
<div class="form-group required">
    <label>NCC <span class="required-mark">*</span></label>
    <div class="ncc-input-wrapper">
        <input type="text" id="editSupplier" placeholder="Nhập tên nhà cung cấp" autocomplete="off"/>
        <div class="ncc-suggestions" id="editSupplierSuggestions"></div>
    </div>
</div>
```

### 10.4 Bộ Lọc NCC (Dòng 147-154)

```html
<div class="ncc-filter-container">
    <input type="text" id="nccFilterInput" class="ncc-filter-input" 
           placeholder="Lọc NCC..." autocomplete="off"/>
    <button class="btn-icon btn-clear-filter" id="btnClearNCCFilter" 
            title="Xóa bộ lọc" style="display: none;">
        <i data-lucide="x"></i>
    </button>
</div>
```

### 10.5 Modal Quản Lý NCC (Dòng 633-681)

```html
<div class="modal" id="nccManageModal" style="display: none;">
    <!-- Overlay -->
    <!-- Modal Content -->
    ├── Header: "Quản lý tên NCC" (icon building-2)
    ├── Body:
    │   ├── Description: "Danh sách các nhà cung cấp đã lưu..."
    │   ├── Fetch from TPOS button: id="btnFetchFromTPOS"
    │   ├── Add form: input id="nccManualInput" + button id="btnAddNCCManual"
    │   ├── NCC list: div id="nccList" (populated by JS)
    │   └── Empty state: div id="nccEmptyState"
    └── Footer: button "Đóng" id="btnCancelNCCManage"
</div>
```

### 10.6 Modal Xung Đột NCC (Dòng 683-723)

```html
<div class="modal" id="nccConflictModal" style="display: none;">
    <!-- Overlay -->
    <!-- Modal Content -->
    ├── Header: "Xung đột tên NCC" (icon alert-triangle)
    ├── Body:
    │   ├── Description: "Mã NCC này đã tồn tại với tên khác..."
    │   └── Options (radio buttons):
    │       ├── "Tên mới:" span id="nccConflictNewName"
    │       └── "Tên đã lưu:" span id="nccConflictExistingName"
    └── Footer:
        ├── button "Hủy" id="btnCancelNCCConflict"
        └── button "Xác nhận" id="btnConfirmNCCConflict"
</div>
```

### 10.7 Input NCC trong Tab Trả Hàng (Dòng 344-349)

```html
<div class="form-group required">
    <label>NCC <span class="required-mark">*</span></label>
    <div class="ncc-input-wrapper">
        <input type="text" id="addReturnSupplier" placeholder="Nhập tên nhà cung cấp" autocomplete="off"/>
        <div class="ncc-suggestions" id="addReturnSupplierSuggestions"></div>
    </div>
</div>
```

---

## 11. CSS: soorder.css – Phần NCC

### 11.1 NCC Column in Table (Dòng 565-573)

```css
/* NCC column */
.order-table td:nth-child(2) {
    font-weight: 600;
    color: var(--order-primary);        /* Màu tím/indigo */
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
```

### 11.2 NCC Autocomplete Suggestions (Dòng 1455-1536)

| CSS Class | Mô tả |
|---|---|
| `.ncc-input-wrapper` | Container relative cho input + dropdown |
| `.ncc-suggestions` | Dropdown container (hidden mặc định) |
| `.ncc-suggestions.active` | Hiện dropdown |
| `.ncc-suggestion-item` | Mỗi suggestion item |
| `.ncc-suggestion-item:hover` | Gradient background khi hover |
| `.ncc-suggestion-item .ncc-code` | Mã Ax (bold, primary color) |
| `.ncc-suggestion-item .ncc-name` | Tên NCC (secondary color) |
| `.ncc-suggestion-item.exact-match` | Highlight exact match (gradient bg, border left) |
| `.ncc-suggestion-item.exact-match::after` | Badge "Tab ↹" |

### 11.3 NCC Management Modal (Dòng 1538-1623)

| CSS Class | Mô tả |
|---|---|
| `.modal-medium` | Max width 600px |
| `.modal-description` | Mô tả dưới heading |
| `.ncc-list` | Container danh sách NCC (max-height 400px, scroll) |
| `.ncc-list-item` | Mỗi NCC item (flex, border-bottom) |
| `.ncc-list-item-code` | Badge mã Ax (gradient bg, white text) |
| `.ncc-list-item-name` | Tên NCC |
| `.ncc-list-item-actions` | Container nút xóa |
| `.ncc-empty-state` | Trạng thái rỗng (icon + text) |

### 11.4 NCC Conflict Modal (Dòng 1625-1676)

| CSS Class | Mô tả |
|---|---|
| `.ncc-conflict-options` | Container cho các radio options |
| `.ncc-conflict-option` | Mỗi option (border, hover effect) |
| `.ncc-conflict-option:has(input:checked)` | Option đang được chọn (primary border, gradient bg) |
| `.ncc-conflict-label` | Label "Tên mới:" / "Tên đã lưu:" |
| `.ncc-conflict-name` | Tên NCC (bold, primary color) |

### 11.5 NCC Add Form (Dòng 1678-1714)

| CSS Class | Mô tả |
|---|---|
| `.ncc-add-form` | Container form thêm NCC (flex, border-bottom) |
| `.ncc-add-input-wrapper` | Wrapper cho input (flex: 1) |
| `.ncc-add-input-wrapper input` | Input thêm NCC (focus: primary border + shadow) |

### 11.6 NCC Filter (Dòng 1716-1781)

| CSS Class | Mô tả |
|---|---|
| `.ncc-filter-container` | Container relative cho filter |
| `.ncc-filter-input` | Input filter (width 140px, expand to 180px on focus) |
| `.ncc-filter-input.has-value` | Khi có giá trị (primary border) |
| `.btn-clear-filter` | Nút X xóa filter (absolute positioned) |

---

## 12. Xử Lý Xung Đột Tên NCC

### Kịch bản: User nhập NCC có cùng mã Ax nhưng khác tên với NCC đã lưu

```
User nhập: "A1 Tên Mới ABC"
Đã lưu:   "A1 Nguyễn Văn A"
→ Cùng mã A1, nhưng tên khác → XUNG ĐỘT
```

### Xử lý khi TẠO/SỬA ĐƠNHÀNG:

```
processOrderWithNCCCheck()
├── Phát hiện xung đột
├── showNCCConflictModal("A1 Tên Mới ABC", "A1 Nguyễn Văn A", callback)
├── User chọn tên:
│   ├── "Tên mới" → orderData.supplier = "A1 Tên Mới ABC"
│   │   └── (KHÔNG cập nhật tên NCC trong Firebase)
│   └── "Tên đã lưu" → orderData.supplier = "A1 Nguyễn Văn A"
└── Tiếp tục CRUD (addOrder / updateOrder)
```

### Xử lý khi THÊM NCC THỦ CÔNG:

```
handleAddNCCManual()
├── Phát hiện xung đột
├── showNCCConflictModal("A1 Tên Mới ABC", "A1 Nguyễn Văn A", callback)
├── User chọn tên:
│   ├── "Tên mới" → CRUD.updateNCCName("A1", "A1 Tên Mới ABC")
│   │   └── CẬP NHẬT tên NCC trong Firebase
│   └── "Tên đã lưu" → Không làm gì (giữ nguyên)
└── Re-render NCC list
```

---

## 13. Xử Lý NCC Trùng Mã Từ TPOS

Khi đồng bộ từ TPOS, có thể có nhiều NCC cùng mã Ax:

```
From TPOS:
├── "A1 Supplier One"   (Ref: KH001)
├── "A1 Supplier Two"   (Ref: KH002)  ← Trùng mã A1
└── "A2 Another"        (Ref: KH003)
```

### Xử lý:

```
saveSuppliersToFirebase()
├── Overwrite toàn bộ (xóa cũ + lưu mới)
├── Mỗi supplier lưu với docId = sanitizeDocId(tposCode)
│   → KH001 và KH002 là 2 documents khác nhau
│   → Cả 2 đều có axCode = "A1"
└── Không xảy ra conflict ở mức Firestore (vì docId khác nhau)

processDuplicateGroups() → showDuplicateSelectionModal()
├── Hiển thị modal cho user chọn giữa các NCC trùng mã
├── Radio buttons: "Tên từ TPOS" / "Tên đã lưu"
└── User chọn → callback trả về selected option
```

---

## 14. Quy Trình Kiểm Tra NCC Khi Tạo/Sửa Đơn Hàng

```
┌─────────────────┐
│  User nhập NCC  │
│  và submit form │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ Parse mã Ax từ tên  │
│ parseNCCCode("A1..") │
└────────┬────────────┘
         │
         ▼
┌────────────────────────────────┐     ┌──────────────────────────┐
│ NCC tồn tại trong nccNames[]? │─NO─▶│ showSupplierNotFoundModal│
│ (so sánh mã Ax)                │     │ "Tạo NCC trên TPOS       │
└────────┬───────────────────────┘     │  sau đó F5 lại trang"    │
         │ YES                         └──────────────────────────┘
         ▼
┌────────────────────────────────┐     ┌──────────────────────────┐
│ Tên trùng với tên đã lưu?     │─NO─▶│ showNCCConflictModal     │
│ checkNCCConflict()              │     │ User chọn tên mới/cũ    │
└────────┬───────────────────────┘     └──────────┬───────────────┘
         │ YES (hoặc null)                        │
         ▼                                        ▼
┌──────────────────────┐         ┌──────────────────────────┐
│ CRUD.addOrder() hoặc │         │ CRUD.addOrder() hoặc     │
│ CRUD.updateOrder()   │         │ CRUD.updateOrder()       │
│ (với tên gốc)        │         │ (với tên user chọn)      │
└──────────────────────┘         └──────────────────────────┘
```

---

## 15. Bộ Lọc NCC Trên Bảng Dữ Liệu

### Input Filter

- **Orders Tab:** `#nccFilterInput` + `#btnClearNCCFilter`
- **Returns Tab:** `#returnNccFilterInput` + `#btnReturnClearNCCFilter`

### State

```javascript
state.nccFilter = "a1";  // Chuỗi lọc (trimmed)
```

### Logic Lọc (trong renderTable)

Khi `state.nccFilter` có giá trị, bảng chỉ hiển thị các đơn hàng có `order.supplier` chứa chuỗi lọc (case-insensitive).

### UI Feedback

- Input có class `.has-value` khi có giá trị → border color chuyển sang primary
- Nút X (`btn-clear-filter`) hiện ra khi có filter value
- Click nút X → reset filter → re-render bảng

---

## 16. Sơ Đồ Tương Tác Giữa Các Module

```
┌───────────────────────────────────────────────────────────────────┐
│                        soorder-main.js                            │
│  ┌─────────────┐    ┌──────────────────┐   ┌──────────────────┐  │
│  │ DOMContent  │    │ initDOMElements()│   │setupEventListeners│ │
│  │ Loaded      │───▶│ (NCC elements)   │──▶│ (NCC events)     │  │
│  └──────┬──────┘    └──────────────────┘   └──────────────────┘  │
│         │                                                         │
│         └── CRUD.loadNCCNames() ─────────────────────┐           │
└──────────────────────────────────────────────────────┼───────────┘
                                                        │
┌───────────────────────────────────────────────────────┼───────────┐
│                    soorder-crud.js                     │           │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────▼─────────┐│
│  │ loadNCCNames() │  │ saveNCCName()  │  │ parseNCCCode()       ││
│  │ Firebase→State │  │ State→Firebase │  │ Regex: /^(A\d+)/i   ││
│  └────────────────┘  └────────────────┘  └──────────────────────┘│
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐│
│  │updateNCCName() │  │deleteNCCName() │  │checkNCCConflict()    ││
│  └────────────────┘  └────────────────┘  └──────────────────────┘│
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     soorder-ui.js                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │showNCCSuggestions│  │showNCCManageModal│  │showNCCConflict │  │
│  │(autocomplete)   │  │(modal quản lý)   │  │   Modal        │  │
│  └─────────────────┘  └──────────────────┘  └────────────────┘  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │processOrderWith │  │handleAddNCC      │  │handleFetchFrom │  │
│  │NCCCheck         │  │Manual            │  │TPOS            │  │
│  └─────────────────┘  └──────────────────┘  └────────┬───────┘  │
└───────────────────────────────────────────────────────┼──────────┘
                                                        │
┌───────────────────────────────────────────────────────┼──────────┐
│                soorder-supplier-loader.js              │          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────▼───────┐  │
│  │ getTPOSToken()  │  │fetchSuppliersFrom│  │loadAndSave     │  │
│  │ POST /api/token │  │TPOS (OData GET)  │  │Suppliers()     │  │
│  └─────────────────┘  └──────────────────┘  └────────────────┘  │
│  ┌─────────────────┐  ┌──────────────────┐                      │
│  │saveSuppliersTo  │  │updateStateFrom   │                      │
│  │Firebase (batch) │  │Firebase          │                      │
│  └─────────────────┘  └──────────────────┘                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 17. Lưu Ý Kỹ Thuật

### 17.1 Giới Hạn Firestore Batch

- **Firestore limit:** 500 operations/batch
- **App sử dụng:** 400 operations/batch (an toàn)
- **Ảnh hưởng:** Khi có >400 NCC, dữ liệu được lưu/xóa theo nhiều batches

### 17.2 Sanitize Document ID

```javascript
// Firestore document IDs không được chứa: / \ . # $ [ ]
sanitizeDocId(id) {
    return String(id).replace(/[\/\\\\.#$\[\]]/g, '_').trim();
}
```

### 17.3 Parse Ax Code

```javascript
// Regex: Match "A" + số ở ĐẦU chuỗi
parseNCCCode(supplierName) {
    const match = supplierName.trim().match(/^(A\d+)/i);
    return match ? match[1].toUpperCase() : null;
}
```

- **Quan trọng:** Chỉ match ở ĐẦU chuỗi (`^`)
- **Case-insensitive:** `a1`, `A1` đều được chấp nhận
- **Ví dụ:**
  - `"A1 Tên NCC"` → `"A1"` ✅
  - `"a12 Test"` → `"A12"` ✅
  - `"Không có mã"` → `null` ❌
  - `"Test A1"` → `null` ❌ (A1 không ở đầu)

### 17.4 Overwrite Strategy

Khi đồng bộ từ TPOS (`loadAndSaveSuppliers`):
- **Xóa toàn bộ** documents cũ trong `ncc-names` collection
- **Lưu lại toàn bộ** từ dữ liệu TPOS mới
- **Rủi ro:** Nếu TPOS trả về ít hơn expected → mất NCC
- **Validation:** Log warning nếu `suppliersToSave.length === 0` khi `suppliers.length > 0`

### 17.5 TPOS API Response Structure

```javascript
// GET /api/odata/Partner/ODataService.GetView
{
    "@odata.count": 245,            // Tổng số
    "value": [
        {
            "Name": "A1 Tên NCC",   // Tên đầy đủ
            "Ref": "KH000123",      // Mã TPOS (KHÔNG phải Code)
            // ... các trường khác
        }
    ]
}
```

> **Lưu ý:** API trả về `Ref` (không phải `Code`). Code xử lý fallback: `supplier.Ref || supplier.ref || supplier.Code || supplier.code`

### 17.6 Token Authentication

- **Grant type:** `password`
- **Credentials:** hardcoded trong `soorder-supplier-loader.js`
- **Proxy:** Qua Cloudflare Worker (`chatomni-proxy.nhijudyshop.workers.dev`)
- **Token caching:** Worker có thể cache token (implementation side)

### 17.7 NCC Validation Khi Tạo Đơn Hàng

- **Bắt buộc:** Tên NCC không được rỗng (`validateOrder`)
- **Bắt buộc:** NCC phải tồn tại trong Firebase (kiểm tra bằng mã Ax)
- **Nếu NCC không tồn tại:** Hiện modal yêu cầu tạo trên TPOS rồi refresh
- **Nếu có xung đột tên:** Hiện modal cho user chọn

### 17.8 Performance

- NCC nhiều nhất: **~1000** (TPOS query `$top=1000`)
- Load NCC: **1 Firestore read** (get entire collection)
- Autocomplete filter: **In-memory** (không query Firestore)
- Batch write: **Chunked 400/batch** (tránh timeout)

---

> **Ghi chú cho developer:** Khi thay đổi code liên quan NCC, cần kiểm tra ảnh hưởng trên cả 2 tab (Sổ Order + Trả hàng) và cả 2 form (Thêm đơn + Sửa đơn).
