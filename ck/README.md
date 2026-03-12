# CK - Quản lý Chuyển Khoản (Bank Transfer Management)

## Mục đích

Module quản lý thông tin chuyển khoản ngân hàng cho N2STORE. Cho phép nhân viên ghi nhận các giao dịch chuyển khoản từ khách hàng, theo dõi trạng thái đi đơn (đã xử lý / chưa xử lý), chỉnh sửa, xóa và xuất dữ liệu ra Excel. Dữ liệu được lưu trữ trên Firestore, collection `ck`, với toàn bộ giao dịch nằm trong một document duy nhất dưới dạng mảng.

## Kiến trúc & Bố cục folder

```
ck/
├── index.html                  # Trang chính - layout, form nhập, bảng giao dịch, modal chỉnh sửa
├── css/
│   ├── modern.css              # Design system chung (sidebar, topbar, cards, buttons, forms, responsive)
│   └── transfer-modern.css     # CSS riêng cho module CK (table, modal, checkbox, virtual scrolling)
├── js/
│   ├── config-constants.js     # Cấu hình, state toàn cục, selectors, events, performance thresholds
│   ├── utils-helpers.js        # Utilities: VietnamTime, cache, DOM, performance, throttle, device detect
│   ├── virtual-scrolling.js    # Virtual scrolling cho bảng dữ liệu lớn (>500 dòng)
│   ├── date-slider.js          # Thanh chọn ngày dạng slider ngang (thay thế date picker)
│   ├── filter-system.js        # Hệ thống lọc: ngày, trạng thái, quick filters, Web Worker
│   ├── search-system.js        # Tìm kiếm nội dung trong bảng (ẩn/hiện dòng, hỗ trợ tiếng Việt)
│   └── main-optimized.js       # Class MoneyTransferApp - logic chính: CRUD, Firebase, permissions
└── README.md
```

## File Map

| File | Mô tả |
|------|--------|
| `index.html` | Layout trang: sidebar navigation, top bar, stats cards (ẩn), form thêm giao dịch, bảng danh sách, modal chỉnh sửa. Load shared modules (auth, firebase config, navigation) và local JS theo thứ tự. |
| `css/modern.css` | Design system dùng CSS variables. Định nghĩa sidebar (có collapse), topbar sticky, cards, forms, buttons, image grid, responsive breakpoints (1024/768/480px), accessibility, GPU acceleration. |
| `css/transfer-modern.css` | CSS đặc thù cho module CK: bảng dữ liệu (`modern-table`) với sticky header, checkbox tùy chỉnh, nút edit/delete gradient, modal với backdrop blur, virtual scrolling row optimization, shimmer loading, print styles. |
| `js/config-constants.js` | Định nghĩa `CONFIG` (Firebase, performance tuning, UI timing, collection name `ck`), `APP_STATE` (global state: dữ liệu, filters, virtual scrolling, cache), `SELECTORS`, `EVENTS`, `PERFORMANCE_THRESHOLDS`, `CSS_CLASSES`. |
| `js/utils-helpers.js` | Bộ tiện ích lớn: `VietnamTime` (UTC+7 timezone), `PerformanceMonitor`, `ThrottleManager`, `CacheManager` (memory + localStorage persistence), `DOMManager` (cache + MutationObserver), `ArrayUtils` (chunk, mergeSort, binary search), `DeviceDetector` (performance profiling), `ErrorHandler`. Cung cấp các hàm toàn cục: `generateUniqueId`, `sanitizeInput`, `removeVietnameseAccents`, `numberWithCommas`, `formatDate`, `convertToTimestamp`, `isValidDateFormat`. |
| `js/virtual-scrolling.js` | Class `VirtualScrollManager`: chỉ render các dòng trong viewport + buffer. Dùng IntersectionObserver, ResizeObserver, throttled scroll. Tự động bật khi dataset > 500 items (hoặc > 2000 trên high-perf device). Smooth scroll với easeInOutCubic. |
| `js/date-slider.js` | Class `DateSliderManager`: thanh chọn ngày ngang, hiển thị 90 ngày (45 trước, 45 sau). Hỗ trợ chọn 1 ngày hoặc khoảng ngày, navigation theo tuần/tháng, drag scroll. Tích hợp với FilterManager để tự động lọc dữ liệu. |
| `js/filter-system.js` | Class `FilterManager`: tạo UI lọc (ẩn mặc định), quick filters (Hôm Nay, 7/30 Ngày Qua, Tháng Này/Trước), lọc theo khoảng ngày + trạng thái + tìm kiếm nội dung. Dùng Web Worker cho dataset > 1000 items. Cache kết quả lọc 30 giây. Tạo table rows, tính tổng tiền (chỉ đơn chưa hoàn thành). Mặc định lọc 30 ngày gần nhất. |
| `js/search-system.js` | Class `SimpleSearchManager`: tìm kiếm nội dung trực tiếp trên DOM (ẩn/hiện `<tr>`). Tìm trong các cột: ngày, ghi chú, số tiền, ngân hàng, FB+SĐT. Hỗ trợ bỏ dấu tiếng Việt (`removeVietnameseAccents`). Highlight tạm thời ô khớp. Hoạt động độc lập với filter system. |
| `js/main-optimized.js` | Class `MoneyTransferApp` - ứng dụng chính. Khởi tạo Firebase, các manager (Virtual Scroll, Filter, Search), UI. CRUD giao dịch lên Firestore. Kiểm tra quyền theo `detailedPermissions.ck` (view/verify/edit/delete). Ghi log hành động vào collection `edit_history`. Notification system cho mọi thao tác. Block/unblock UI khi đang xử lý. Export Excel qua XLSX. |

## Dependencies

### Shared modules (từ `../shared/`)
- `shared/esm/compat.js` - ES Module compat layer (auto-init authManager, notificationManager)
- `shared/js/firebase-config.js` - Cấu hình Firebase (Firestore, Storage)
- `shared/js/permissions-helper.js` - `PermissionHelper.canAccessPage('ck')` - kiểm tra quyền truy cập trang
- `shared/js/navigation-modern.js` - Sidebar navigation tự động generate menu, quản lý collapse/expand
- `shared/js/shared-auth-manager.js` - Fallback auth cho file:// protocol
- `shared/images/logo.jpg` - Logo sidebar

### CDN libraries
- **jQuery 3.6.4** - Dùng hạn chế (có thể cho datalist suggestions)
- **XLSX 0.17.5** (`xlsx.full.min.js`) - Xuất dữ liệu ra file Excel
- **Lucide Icons 0.294.0** - Icon system (calendar, edit, trash, check, v.v.)
- **Firebase SDK 9.6.1** (compat) - `firebase-app`, `firebase-storage`, `firebase-firestore`

### Cross-module references
- Dữ liệu auth đọc từ `localStorage` key `loginindex_auth` (set bởi trang đăng nhập `../index.html`)
- `detailedPermissions.ck` quyết định quyền: `view`, `verify`, `edit`, `delete`
- Collection `edit_history` trên Firestore lưu log hành động (dùng chung với các module khác)

## Luồng dữ liệu

```
1. Khởi tạo (DOMContentLoaded)
   ├── Kiểm tra auth (localStorage) → redirect nếu chưa đăng nhập
   ├── Init Firebase (Firestore)
   ├── Init managers: VirtualScrollManager, FilterManager, SimpleSearchManager
   ├── Init UI: form, table events, keyboard shortcuts
   └── Load dữ liệu
       ├── Kiểm tra CacheManager (memory + localStorage)
       │   ├── Cache HIT → render từ cache
       │   └── Cache MISS → đọc Firestore
       │       └── Collection "ck" / Document "ck" / Field "data" (Array)
       └── Dữ liệu → APP_STATE.arrayData

2. Hiển thị dữ liệu
   APP_STATE.arrayData
   → FilterManager.applyFilters() (lọc theo ngày, trạng thái, tìm kiếm)
   → APP_STATE.filteredData
   → Sắp xếp theo dateCell (mới nhất trước)
   → Render:
       ├── < 500 items: renderNormalTable() (batch rendering)
       └── > 500 items: VirtualScrollManager.enable() (virtual scrolling)
   → updateTotalAmount() (tổng tiền đơn chưa hoàn thành)

3. Thêm giao dịch (Form Submit)
   Form data → validate → createTransaction()
   → addTransactionToUI() (thêm dòng vào đầu bảng)
   → uploadTransaction() (Firestore arrayUnion)
   → APP_STATE.arrayData.unshift()
   → Invalidate cache
   → logAction("add") → collection "edit_history"

4. Cập nhật trạng thái (Checkbox "Đi đơn")
   Click checkbox → confirm() → blockInteraction()
   → updateRowCompletedState() (UI: opacity, background)
   → updateCompletedStateInFirebase() (đọc doc, sửa muted field, ghi lại)
   → updateCompletedStateInData() (APP_STATE)
   → updateTotalAmount()
   → Invalidate cache
   → logAction("update")

5. Chỉnh sửa giao dịch (Edit Modal)
   Click edit button → mở modal (populate fields)
   → Quyền quyết định field nào được sửa:
       ├── delete permission (level 0): sửa tất cả
       ├── edit permission (level 1): sửa tất cả
       ├── view/verify permission (level 3): sửa ngày, số tiền, FB+SĐT
       └── Khác: chỉ sửa FB+SĐT
   → saveChanges() → validate → performEdit()
   → Đọc Firestore doc → tìm item bằng uniqueId → cập nhật
   → updateRowAfterEdit() (UI)
   → updateStateAfterEdit() (APP_STATE)
   → Invalidate cache
   → logAction("edit")

6. Xóa giao dịch
   Click delete → confirm() → blockInteraction()
   → deleteFromFirebase() (filter ra item, ghi lại array)
   → row.remove()
   → removeFromState()
   → updateTotalAmount()
   → Invalidate cache
   → logAction("delete")

7. Xuất Excel
   exportToExcel() → đọc các dòng visible trong bảng
   → XLSX.utils.aoa_to_sheet() → XLSX.writeFile()
   → File .xlsx download
```

## Hàm chính

### MoneyTransferApp (main-optimized.js)
| Hàm | Mô tả |
|-----|--------|
| `init()` | Khởi tạo app: auth check, Firebase, managers, UI, load data |
| `checkAuthentication()` | Kiểm tra đăng nhập từ localStorage, redirect nếu chưa login |
| `loadInitialData()` | Tải dữ liệu từ cache hoặc Firestore, render bảng |
| `handleFormSubmit(e)` | Xử lý thêm giao dịch mới: validate, tạo, upload Firebase |
| `handleCheckboxClick(e)` | Toggle trạng thái "Đi đơn" (completed/muted) |
| `handleEditButton(e)` | Mở modal chỉnh sửa với quyền phù hợp |
| `handleDeleteButton(e)` | Xóa giao dịch (cần quyền delete) |
| `saveChanges()` | Lưu thay đổi từ modal: validate, update Firebase + UI + state |
| `exportToExcel()` | Xuất dữ liệu hiển thị ra file .xlsx |
| `hasPermission(level)` | Kiểm tra quyền dựa trên `detailedPermissions.ck` |
| `blockInteraction(type)` / `unblockInteraction()` | Khóa/mở khóa UI khi đang xử lý |
| `logAction(action, description, oldData, newData)` | Ghi log vào Firestore `edit_history` |

### FilterManager (filter-system.js)
| Hàm | Mô tả |
|-----|--------|
| `createFilterUI()` | Tạo giao diện lọc (hidden by default), set mặc định 30 ngày |
| `applyFilters(data)` | Lọc dữ liệu theo ngày + trạng thái + tìm kiếm, dùng Web Worker nếu > 1000 items |
| `applyQuickFilter(type)` | Áp dụng preset: all, today, yesterday, last7days, last30days, thisMonth, lastMonth |
| `createTableRow(item, formattedTime)` | Tạo `<tr>` cho một giao dịch |
| `updateTotalAmount()` | Tính tổng tiền các đơn chưa hoàn thành |
| `filterDataOptimized(data)` | Lọc theo chunk, hỗ trợ idle callback |

### VietnamTime (utils-helpers.js)
| Hàm | Mô tả |
|-----|--------|
| `now()` | Trả về thời gian hiện tại theo UTC+7 |
| `getDateString(date)` | Format ngày thành `YYYY-MM-DD` (cho input date) |
| `getDateRange(dateString)` | Trả về {start, end} timestamp cho một ngày |
| `formatVietnamDate(timestamp)` | Format timestamp thành `DD-MM-YY` |

### CacheManager (utils-helpers.js)
| Hàm | Mô tả |
|-----|--------|
| `get(key)` | Đọc cache (memory -> localStorage), kiểm tra expiry |
| `set(data, key)` | Ghi cache, tự debounce save localStorage |
| `invalidate(key)` | Xóa cache, trigger khi dữ liệu thay đổi |
| `cleanExpired()` | Dọn cache hết hạn (chạy tự động mỗi 5 phút) |

### SimpleSearchManager (search-system.js)
| Hàm | Mô tả |
|-----|--------|
| `handleSearch(searchText)` | Tìm kiếm: normalize text (bỏ dấu tiếng Việt) -> ẩn/hiện `<tr>` |
| `searchInRow(row, normalizedSearch)` | Tìm trong các cột: ngày, ghi chú, số tiền, ngân hàng, FB+SĐT |
| `normalizeText(text)` | Lowercase + bỏ dấu tiếng Việt (dùng `removeVietnameseAccents`) |

### DateSliderManager (date-slider.js)
| Hàm | Mô tả |
|-----|--------|
| `generateDateList()` | Tạo danh sách 90 ngày (45 trước + 45 sau hôm nay) |
| `handleDateClick(dateItem)` | Chọn 1 ngày hoặc khoảng ngày (click 2 lần) |
| `applyFilter()` | Cập nhật FilterManager.filters và trigger applyFilters() |
| `scrollToToday()` | Cuộn thanh slider tới ngày hôm nay |

## Cấu trúc dữ liệu Firestore

```
Collection: "ck"
  Document: "ck"
    Field: "data" (Array)
      [
        {
          uniqueId: "tx_m2abc_xyz123456",   // ID duy nhất
          dateCell: "1710345600000",         // Timestamp dạng string
          noteCell: "CK hàng ABC",           // Ghi chú chuyển khoản
          amountCell: "1,500",               // Số tiền (có dấu phẩy)
          bankCell: "ACB",                   // Ngân hàng: ACB/VCB/TCB/MB
          customerInfoCell: "Tên FB 0912...",// Facebook + SĐT khách
          muted: false,                      // true = đã đi đơn (completed)
          user: "Admin"                      // Người tạo/sửa
        },
        ...
      ]

Collection: "edit_history"
  Document: (auto-generated)
    {
      timestamp: Timestamp,
      user: "Admin",
      page: "Chuyen khoan",
      action: "add" | "edit" | "update" | "delete",
      description: "...",
      oldData: { ... } | null,
      newData: { ... } | null,
      id: "1710345600000_abc123"
    }
```

## Hệ thống quyền

Quyền được đọc từ `localStorage.loginindex_auth.detailedPermissions.ck`:

| Quyền | Level | Khả năng |
|-------|-------|----------|
| `delete` | 0 | Xóa giao dịch, có mọi quyền edit |
| `edit` | 1 | Sửa tất cả trường, xuất Excel, toggle checkbox |
| `view` / `verify` | 3 | Sửa ngày, số tiền, FB+SĐT. Được thêm giao dịch mới |
| Không có | - | Chỉ xem, không tương tác |

## Performance optimizations

- **Virtual Scrolling**: tự động bật cho dataset > 500 items, chỉ render dòng trong viewport + buffer
- **Web Worker filtering**: dataset > 1000 items được lọc trong background thread
- **Chunked rendering**: bảng được render theo batch (50 dòng/frame) để tránh block main thread
- **Filter caching**: kết quả lọc được cache 30 giây
- **Data caching**: CacheManager lưu dữ liệu vào memory + localStorage (24h expiry)
- **DOM caching**: DOMManager cache querySelector results, dọn bằng MutationObserver
- **Throttle/Debounce**: scroll events (16ms), filter changes (150ms)
- **Device-adaptive**: DeviceDetector đo performance score, điều chỉnh batch size, buffer, animation
- **GPU acceleration**: `translateZ(0)`, `will-change`, `content-visibility: auto`
