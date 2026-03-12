# Hang Hoan - Quản lý Hàng Hoàn (Returned Goods Management)

## Mục đich

Module quản lý toàn bộ quy trình hàng hoàn trả của cửa hàng N2Store. Bao gồm 4 tab chức năng chính:

1. **Hàng Hoàn** - Theo dõi đơn hàng bị hoàn trả (BOOM, sửa COD, thu về, khách gửi, thay đổi thông tin). Nhập liệu thủ công qua form, lưu trực tiếp vào Firestore.
2. **Trả Hàng** - Quản lý phiếu trả hàng (refund invoices) từ TPOS. Hỗ trợ import Excel và tự động đồng bộ nền từ TPOS API (`ExportFileRefund`).
3. **Bán Hàng** - Xem và đối chiếu danh sách đơn bán hàng (sales invoices) từ TPOS. Import Excel, đồng bộ nền TPOS API (`ExportFile`), xem chi tiết sản phẩm trong đơn (expand row).
4. **Đối Soát** - Tra cứu lịch sử đối soát sản phẩm đa bán hàng từ TPOS OData API (`GetHistoryCrossCheckProductView`). Lọc theo ngày, số HD, mã vận đơn.

## Kiến trúc & Bố cục folder

```
hanghoan/
├── index.html              # Trang chính, chứa layout 4 tabs + 2 modals
├── css/
│   ├── modern.css          # Design system gốc (CSS variables, sidebar, topbar, cards, forms, ...)
│   ├── hanghoan.css        # Styles riêng tab Hàng Hoàn (table, filters, modal, empty state)
│   ├── trahang.css         # Styles riêng tab Trả Hàng + tab navigation + return detail modal
│   ├── banhang.css         # Styles riêng tab Bán Hàng (table 33 cột, pagination, sync indicator)
│   └── doisoat.css         # Styles riêng tab Đối Soát (filters, status badges, content expand)
├── js/
│   ├── hanghoan.js         # Logic tab Hàng Hoàn (CRUD Firestore, optimistic UI, permissions)
│   ├── trahang.js          # Logic tab Trả Hàng (IIFE module, TPOS refund sync, tab switching)
│   ├── banhang.js          # Logic tab Bán Hàng (IIFE module, TPOS invoice sync, row expansion)
│   └── doisoat.js          # Logic tab Đối Soát (IIFE module, TPOS OData query, Firebase cache)
└── README.md               # File này
```

## File Map

| File | Mô tả |
|------|--------|
| `index.html` | Layout chính: sidebar nav, top bar, 4 tabs (Hàng Hoàn, Trả Hàng, Bán Hàng, Đối Soát), edit modal, return detail modal (5 sub-tabs: info, receiver, other, images, history) |
| `js/hanghoan.js` | Tab Hàng Hoàn - CRUD trực tiếp trên Firestore collection `hanghoan`, doc `hanghoan` chứa array `data[]`. Optimistic UI với rollback khi lỗi. Permission-based UI (approve/update/view). Cache in-memory + `PersistentCacheManager`. Ghi log vào `edit_history`. Hàm migration `fixCorruptedTimestamps()`. |
| `js/trahang.js` | Tab Trả Hàng - IIFE `TraHangModule`. Firestore collection `tra_hang` (chunked 500 records/doc). Background sync từ TPOS `ExportFileRefund` endpoint. Import Excel thủ công. Merge logic dừng tại duplicate đầu tiên (invoice number). Cũng chứa `initMainTabs()` - logic chuyển tab với localStorage persistence. |
| `js/banhang.js` | Tab Bán Hàng - IIFE `BanHangModule`. Firestore collection `ban_hang` (chunked 500 records/doc). Background sync từ TPOS `ExportFile` endpoint. Client-side pagination. Row click để expand chi tiết đơn (2 API calls: `GetView` + `OrderLines`). Import Excel, 33 cột dữ liệu. |
| `js/doisoat.js` | Tab Đối Soát - IIFE `DoiSoatModule`. Query TPOS OData endpoint `GetHistoryCrossCheckProductView`. Firebase cache collection `doi_soat` (chunked). Server-side pagination. Content expand/collapse cho nội dung dài. Sử dụng `tokenManager` từ `orders-report` module. |
| `css/modern.css` | Design system: CSS custom properties (colors, spacing, shadows, transitions), sidebar layout, topbar, cards, forms, buttons, stat cards, image grid, lightbox, responsive breakpoints (1024/768/480px), accessibility (`prefers-reduced-motion`, `:focus-visible`), GPU acceleration hints. |
| `css/hanghoan.css` | Styles cho filter section, `modern-table` (edit/delete buttons, checkbox), modal overlay với animation (fadeIn/slideUp), empty state, search box, form enhancements, loading state, print styles. |
| `css/trahang.css` | Tab navigation (`.main-tabs`, `.main-tab-btn`), `trahang-table` (clickable rows), status badges (confirmed/draft/cancelled), stat cards, filter groups, action buttons, return detail modal (tabs, info grid, order lines table, summary, images grid, history timeline), loading/empty states. |
| `css/banhang.css` | `banhang-table` (min-width 2500px, horizontal scroll), status badges (confirmed/paid/draft/cancelled + delivery statuses), pagination controls, background sync indicator (pulse + bounce animations), stat cards, filter groups, action buttons. |
| `css/doisoat.css` | Filter form layout, `doisoat-table` (monospace columns cho invoice/tracking), status badges (success/error), content preview với expand/collapse toggle, pagination, loading/empty states. |

## Dependencies

### Shared libs (từ `../shared/`)
- `shared/js/firebase-config.js` - Firebase app config + `initializeFirestore()` helper
- `shared/esm/compat.js` - ES Module wrapper, auto-init `authManager`, `notificationManager`, `logger`, `cache`
- `shared/js/shared-auth-manager.js` - Authentication (fallback cho `file://` protocol)
- `shared/js/notification-system.js` - `NotificationManager` class (toast notifications, confirm dialogs)
- `shared/js/logger.js` - Logging utility
- `shared/js/shared-cache-manager.js` - `PersistentCacheManager` class (localStorage-based cache)
- `shared/js/navigation-modern.js` - Sidebar navigation auto-generation
- `shared/js/shop-config.js` - `ShopConfig` singleton (CompanyId dropdown, multi-company support)
- `shared/js/permissions-helper.js` - `PermissionHelper` class (granular permissions: `hanghoan.approve`, `hanghoan.update`)

### Cross-module references
- `orders-report/js/core/token-manager.js` - `tokenManager` singleton cho TPOS API authentication (bearer token per-company, auto-refresh)

### CDN Libraries
- **Firebase SDK v9.6.1** (compat mode): `firebase-app-compat.js`, `firebase-storage-compat.js`, `firebase-firestore-compat.js`
- **Lucide Icons v0.294.0**: `lucide.min.js` (SVG icon library, `lucide.createIcons()`)
- **SheetJS (XLSX)**: `xlsx.full.min.js` (lazy-loaded khi cần import/parse Excel - loaded from `cdn.sheetjs.com`)

### External APIs
- **TPOS API** via Cloudflare Worker proxy: `chatomni-proxy.nhijudyshop.workers.dev`
  - `POST /api/token` - Lấy access token
  - `POST /api/FastSaleOrder/ExportFile` - Export Excel đơn bán hàng
  - `POST /api/FastSaleOrder/ExportFileRefund` - Export Excel đơn trả hàng
  - `GET /api/odata/FastSaleOrder/ODataService.GetView` - Query đơn hàng (dùng cho expand row)
  - `GET /api/odata/FastSaleOrder({id})/OrderLines` - Chi tiết sản phẩm trong đơn
  - `GET /api/odata/FastSaleOrder/ODataService.GetHistoryCrossCheckProductView` - Lịch sử đối soát

## Luồng dữ liệu

### Tab Hàng Hoàn (hanghoan.js)
```
[Form submit] --> Optimistic UI (add to cache + render) --> Firestore arrayUnion
                                                        --> rollback nếu lỗi
                                                        --> logAction() to edit_history

[Page load] --> PersistentCacheManager (localStorage) --> render table
            --> Firestore hanghoan/hanghoan.data[] --> update cache --> re-render

[Checkbox/Edit/Delete] --> Optimistic UI --> Firestore update --> rollback nếu lỗi
```

### Tab Trả Hàng (trahang.js) & Tab Bán Hàng (banhang.js)
```
[Page load] --> Firebase collection (chunked docs) --> render table
            --> setTimeout(1s) --> Background TPOS sync:
                TPOS token --> ExportFile/ExportFileRefund --> XLSX ArrayBuffer
                --> SheetJS parse --> merge (stop at first duplicate)
                --> save to Firebase (chunked) --> re-render

[Import Excel] --> FileReader --> SheetJS parse --> merge with existing
               --> save to Firebase --> re-render

[Row click - Bán Hàng only] --> TPOS GetView (find order ID)
                             --> TPOS OrderLines (get products)
                             --> render detail row (expand/collapse)
```

### Tab Đối Soát (doisoat.js)
```
[Tab activated] --> Firebase cache (chunked docs) --> render table
                --> setTimeout(500ms) --> Background TPOS sync:
                    tokenManager.getToken() --> OData GetHistoryCrossCheckProductView
                    --> merge with cache --> save to Firebase --> re-render

[Search button] --> tokenManager.getToken() --> OData query with filters
                --> render table + pagination
```

### Firestore Collections
| Collection | Document(s) | Cấu trúc |
|------------|-------------|----------|
| `hanghoan` | `hanghoan` | `{ data: [{ shipValue, scenarioValue, customerInfoValue, totalAmountValue, causeValue, duyetHoanValue, user, muted }] }` |
| `tra_hang` | `chunk_0`, `chunk_1`, ..., `_metadata` | `{ orders: [...], chunkIndex, lastUpdated, count }` |
| `ban_hang` | `chunk_0`, `chunk_1`, ..., `_metadata` | `{ orders: [...], chunkIndex, lastUpdated, count }` |
| `doi_soat` | `chunk_0`, `chunk_1`, ..., `_metadata` | `{ records: [...], chunkIndex, lastUpdated, count }` |
| `edit_history` | auto-generated docs | `{ timestamp, user, page, action, description, oldData, newData, id }` |

## Hàm chính

### hanghoan.js (Global scope)

| Hàm | Mô tả |
|-----|--------|
| `initializeDOMCache()` | Cache tất cả DOM element references vào object `DOM` |
| `refreshAuthCache()` | Đọc auth state + resolve permission level (0=full, 1=edit, 777=view) |
| `updateTable(forceRefresh)` | Load data từ cache hoặc Firestore, gọi `renderTableFromData()` |
| `renderTableFromData(dataArray)` | Filter, sort, batch render bằng DocumentFragment (max 500 rows) |
| `applyFiltersToData(dataArray)` | Filter theo channel, scenario, status, date range, search text |
| `renderSingleRow(item, sttNumber)` | Tạo `<tr>` element với data-item JSON, apply permissions |
| `handleFormSubmit(event)` | Validate form, optimistic UI add, Firestore `arrayUnion`, rollback on error |
| `handleEditButton(button)` | Parse row data, populate edit modal, open modal |
| `handleDeleteButton(button)` | Confirm, optimistic remove with animation, Firestore update, rollback |
| `handleCheckboxClick(checkbox)` | Toggle `muted` flag (đã nhận/chưa nhận), confirm dialog, optimistic UI |
| `saveChanges()` | Validate edit form, update item in array, Firestore update, guard against double-save |
| `updateSuggestions()` | Populate `<datalist>` cho customer info và cause (top 200 unique values) |
| `fixCorruptedTimestamps()` | Migration utility: tìm và sửa duyetHoanValue bị corrupt (0 hoặc invalid) |

### trahang.js - TraHangModule (IIFE)

| Hàm | Mô tả |
|-----|--------|
| `init()` | Init Firebase, cache DOM, bind events, set default dates, load Firebase + background TPOS sync |
| `loadFromFirebase()` | Load chunked docs từ `tra_hang` collection |
| `saveToFirebase(data)` | Delete all + save chunked (500 records/doc) + metadata |
| `importExcel(file)` | Read XLSX, parse rows (header row 3), merge by invoice number, save to Firebase |
| `backgroundFetchFromTPOS()` | Token -> ExportFileRefund -> parse XLSX -> merge (stop at duplicate) -> save |
| `mergeTPOSData(tposData, existingData)` | Merge logic: iterate newest-first, stop at first duplicate invoice number |
| `initMainTabs()` | Tab switching logic với localStorage persistence (`hanghoan_active_tab`) |

### banhang.js - BanHangModule (IIFE)

| Hàm | Mô tả |
|-----|--------|
| `init()` | Init Firebase, cache DOM, bind events, set default dates, load Firebase + background sync |
| `loadFromFirebase()` | Load chunked docs từ `ban_hang` collection |
| `saveToFirebase(data)` | Delete all + save chunked + metadata |
| `importExcel(file)` | Read XLSX (33 cột), merge by invoice number, save to Firebase |
| `backgroundFetchFromTPOS()` | Token -> ExportFile -> parse XLSX -> merge -> save |
| `expandOrderDetails(row, orderId)` | 2 API calls: GetView (find by Number) -> OrderLines (get products) -> render detail table |
| `renderOrderDetails(detailRow, orderLines, orderData)` | Render product lines table trong expanded row (product, UOM, qty, price, totals) |
| `goToPage(page)` | Client-side pagination: slice filteredData, render page, update pagination UI |
| `applyFilters()` | Filter by search, status, date range -> update filteredData -> render |

### doisoat.js - DoiSoatModule (IIFE)

| Hàm | Mô tả |
|-----|--------|
| `init()` | Wait for core utilities, init Firebase, init elements/events/dates |
| `loadDataWithCache()` | Load from Firebase cache first, then background sync from TPOS |
| `fetchData()` | Direct TPOS OData query via proxy, render + paginate |
| `buildQueryParams()` | Build OData query: Number, TrackingRef, DateFrom, DateTo, CompanyId, $top, $count |
| `backgroundFetchFromTPOS()` | Fetch from TPOS -> merge with cache -> save to Firebase |
| `loadDataOnTabActivation()` | Auto-load when Doi Soat tab becomes active |
| `createContentElement(content, error)` | Render content with expand/collapse for long text, decode Unicode escapes |
