# Nhanhang - Nhan Hang (Goods Receipt Management)

## Muc dich

Module quan ly phieu nhan hang (goods receipts) cho N2Store. Cho phep nhan vien ghi nhan viec nhan hang voi thong tin can nang (kg), so kien, anh chup hang hoa, va ghi chu. Du lieu duoc luu tru tren Firebase Firestore, anh duoc luu tren Firebase Storage. Ho tro day du CRUD, loc du lieu theo ngay/nguoi nhan, xuat Excel, va giao dien responsive (desktop + mobile).

## Kien truc & Bo cuc folder

```
nhanhang/
  index.html              # Trang chinh - layout, sidebar, modals
  css/
    modern-styles.css      # Toan bo CSS (design system, responsive, mobile)
  js/
    config.js              # Firebase init, CacheManager, DOM refs, auth system
    utility.js             # Helper functions, cache logic, Firestore read, export
    ui.js                  # UIManager class - alerts, image hover/zoom
    camera.js              # Camera capture, file upload, eager upload, image compression
    crud.js                # CRUD operations (add/update/delete receipts), edit modal
    main.js                # App init, table rendering, filters, mobile FAB, event binding
```

## File Map

| File | Mo ta |
|------|-------|
| `index.html` | Layout chinh voi sidebar navigation (auto-generated), top bar, stats cards (Tong Phieu, Tong KG, Tong Kien), bang du lieu desktop, mobile card list, Create Modal (them phieu), Edit Modal (chinh sua phieu), Image Zoom Overlay, Mobile FAB menu |
| `css/modern-styles.css` | Design system day du voi CSS variables (colors, shadows, spacing, radius). Bao gom: sidebar, top bar, stats cards, forms, camera preview (voi overlay controls, capture button animation), table, modals (k-modal pattern), image hover/zoom overlays, mobile responsive (cards thay table, FAB, full-screen modals, file upload thay camera), upload progress bar, accessibility |
| `js/config.js` | **CacheManager class** - persistent cache voi localStorage (set/get/clear/cleanExpired/invalidatePattern, debounced save). Firebase init (Firestore collection `nhanhang`, Storage ref). DOM element references. Authentication system (getAuthState/setAuthState/clearAuthState voi legacy migration). **authManager** object (global, cho navigation). Permission system tich hop PermissionHelper |
| `js/utility.js` | Vietnam timezone helpers (GMT+7). Cache CRUD (getCachedData/setCachedData/invalidateCache/validateCacheWithServer). **displayReceiptData()** - doc tu Firestore, so sanh cache, render. Utility: sanitizeInput, numberWithCommas, formatDate, debounce. ID generation (receipt_timestamp_random). Date parsing (DD/MM/YYYY Vietnamese format). Logging (ghi vao collection `edit_history`). Sort (newest first). Export Excel (XLSX). Alert wrappers cho notificationManager |
| `js/ui.js` | **UIManager class** - floating alerts (loading/success/error), copy notification. Enhanced image hover: preview follow cursor (desktop only), full-screen overlay on click. Position auto-adjust (viewport edges). Performance indicator. Animation helpers (animateIn, smoothHeight, highlightElement). Global backward-compat functions |
| `js/camera.js` | **Eager upload system** - upload anh len Firebase ngay khi chon/chup, khong doi nhan Luu. Image compression (Canvas API, mobile: 1024px/quality 0.5, desktop: 1920px/quality 0.7). Main camera: start/stop/takePicture/retakePicture voi overlay controls (capture button, mode indicator). Edit camera: tuong tu + keepCurrentImage. File upload handlers (main form + edit form, validate type + max 15MB). Upload progress UI (progress bar overlay). Fallback direct upload neu eager fails |
| `js/crud.js` | **addReceipt()** - validate form, upload image (eager hoac fallback), save to Firestore (arrayUnion), log action, invalidate cache. **updateReceipt()** - find by ID, update fields, handle image (new/keep/remove), update datetime format. **deleteReceiptByID()** / **deleteReceiptDirectById()** - confirm, splice from array, log. **openEditModal()** - populate form tu cached data, convert date format, show/hide delete button theo permission. **closeEditModalFunction()** - reset form state. Migration function (da hoan thanh) |
| `js/main.js` | **Filter system** - applyFiltersToData() loc theo user + date range (today/yesterday/week/month/custom). Statistics (totalReceipts/totalKg/totalKien). **renderDataToTable()** - clear, filter, sort DESC, summary row, lazy load images (IntersectionObserver), max 500 rows. **renderMobileCards()** - card layout cho mobile, click mo edit modal. Mobile FAB binding (Them Phieu + Tro ly AI). Mobile file upload (thay camera section). Date range: auto-format dd/mm/yyyy, parse to ISO. **initializeApplication()** - auth check, form/filter/tooltip init, data load. Global error handlers. Cleanup on beforeunload |

## Dependencies

### Shared Modules (project-internal)
- `../shared/js/firebase-config.js` - Firebase configuration (FIREBASE_CONFIG object)
- `../shared/js/navigation-modern.js` - Sidebar navigation auto-generation
- `../shared/js/permissions-helper.js` - PermissionHelper for role-based access control
- `../shared/esm/compat.js` - ES Module compatibility layer
- `../shared/images/logo.jpg` - Sidebar logo

### CDN Libraries
- **Firebase SDK 9.6.1** (compat): `firebase-app-compat.js`, `firebase-storage-compat.js`, `firebase-firestore-compat.js`
- **jQuery 3.6.4** - DOM manipulation (minimal usage)
- **SheetJS (xlsx) 0.17.5** - Excel export
- **Lucide Icons 0.294.0** - SVG icon system

### Cross-module References
- Firestore collection: `nhanhang` (document `nhanhang` voi field `data[]`)
- Firestore collection: `edit_history` (audit log)
- Firebase Storage path: `nhanhang/photos/`
- Auth storage key: `loginindex_auth` (localStorage)
- Cache storage key: `loginindex_data_cache` (localStorage)
- Login redirect: `../index.html`
- External: `window.notificationManager` (expected global from shared)
- External: `window.AIChatWidget` (optional AI chat integration)

## Luong du lieu

```
1. KHOI TAO (DOMContentLoaded)
   index.html load scripts theo thu tu:
   permissions-helper.js -> config.js -> utility.js -> ui.js -> camera.js -> crud.js -> main.js

   main.js::initializeApplication()
     -> Kiem tra auth (localStorage "loginindex_auth")
     -> Redirect ve ../index.html neu chua dang nhap
     -> initializeFormElements() (bind form events, modal events)
     -> initializeFilterEvents() (bind filter dropdowns, date range)
     -> initializeTooltipHandlers() (image zoom on click)
     -> initializeWithMigration() -> displayReceiptData()
     -> bindMobileFabEvents(), bindMobileFileUpload()

2. DOC DU LIEU (displayReceiptData)
   Firestore("nhanhang/nhanhang") -> doc.data().data[]
     -> So sanh length voi cache
     -> Neu cache valid: dung cache
     -> Neu khong: dung server data, cap nhat cache
     -> sortDataByNewest() (theo thoiGianNhan DESC)
     -> renderDataToTable() (desktop table + mobile cards)
     -> updateStatisticsDisplay() (Tong Phieu, Tong KG, Tong Kien)
     -> Lazy load images voi IntersectionObserver

3. THEM PHIEU (addReceipt)
   User nhan "Them Phieu" (top bar hoac FAB)
     -> toggleForm() -> kiem tra permission('nhanhang','create')
     -> openCreateModal()
     -> User nhap form: ten (auto tu auth), anh, so kg, so kien, ghi chu
     -> Chon/chup anh:
        Mobile: file input -> compressImage() -> eagerUploadImage()
        Desktop: camera API hoac file upload -> compressImage() -> eagerUploadImage()
     -> Eager upload: blob -> Firebase Storage (nhanhang/photos/xxx.jpg)
        -> Progress bar hien thi tren preview
     -> User nhan "Them Phieu" button
     -> addReceipt():
        -> Validate (ten, kg >= 0, kien >= 0)
        -> uploadCapturedImage(): dung eager result neu done, doi neu uploading, fallback direct upload
        -> uploadToFirestore(): arrayUnion vao Firestore
        -> logAction() -> edit_history collection
        -> invalidateCache()
        -> displayReceiptData() (refresh table)
        -> closeCreateModalFunction()

4. SUA PHIEU (updateReceipt)
   User click row (mobile card) hoac nut "Sua" (desktop)
     -> openEditModal(): tim receipt tu cache theo ID
     -> Populate form (ten, kg, kien, ghi chu, datetime, anh hien tai)
     -> User sua va nhan "Cap nhat"
     -> updateReceipt():
        -> Doc lai tu Firestore
        -> Tim receipt theo ID
        -> Cap nhat fields
        -> Xu ly anh: new blob -> upload, hoac giu cu, hoac xoa
        -> Update Firestore
        -> logAction(), invalidateCache(), refresh

5. XOA PHIEU (deleteReceiptByID / deleteReceiptDirectById)
   User nhan nut "Xoa" (desktop) hoac "Xoa phieu" trong edit modal
     -> Kiem tra permission('nhanhang','cancel')
     -> confirm()
     -> Doc Firestore, tim theo ID, splice
     -> Update Firestore
     -> logAction(), invalidateCache(), refresh

6. LOC DU LIEU (applyFilters)
   User thay doi dropdown (nguoi nhan / ngay) hoac nhap date range
     -> debouncedApplyFilters() (500ms)
     -> applyFiltersToData(): loc theo user + date filters
     -> renderDataToTable() voi filtered data
     -> updateStatisticsDisplay() voi filtered totals

7. XUAT EXCEL (exportToExcel)
   User nhan nut Export
     -> getCachedData() -> applyFiltersToData()
     -> XLSX.utils.json_to_sheet() -> writeFile("NhanHang_dd-mm-yyyy.xlsx")
```

## Ham chinh

### config.js
| Ham | Mo ta |
|-----|-------|
| `CacheManager` | Class quan ly cache voi localStorage persistence. Methods: set/get/clear/cleanExpired/invalidatePattern/getStats |
| `getAuthState()` | Doc auth tu localStorage, ho tro legacy migration |
| `setAuthState(isLoggedIn, userType, checkLogin)` | Luu auth state |
| `isAuthenticated()` | Kiem tra dang nhap |
| `hasPermission(requiredLevel)` | Kiem tra quyen (delegates to PermissionHelper) |
| `getUserName()` | Lay ten user tu auth state |

### utility.js
| Ham | Mo ta |
|-----|-------|
| `getVietnamDate()` | Tra ve Date object theo GMT+7 |
| `getCachedData()` / `setCachedData(data)` | Doc/ghi cache |
| `invalidateCache()` | Xoa cache (goi sau moi thay doi data) |
| `displayReceiptData()` | Doc Firestore, validate cache, render |
| `validateCacheWithServer()` | So sanh cache length voi server |
| `sanitizeInput(input)` | Loai bo ky tu dac biet HTML |
| `generateUniqueID()` | Tao ID dang `receipt_{base36timestamp}_{random}` |
| `generateUniqueFileName()` | Tao ten file anh unique |
| `getFormattedDateTime()` | Dinh dang ngay gio Vietnam `DD/MM/YYYY, HH:MM` |
| `parseVietnameseDate(dateString)` | Parse chuoi ngay Vietnam thanh Date object |
| `sortDataByNewest(dataArray)` | Sap xep moi nhat truoc |
| `logAction(action, description, oldData, newData)` | Ghi log vao Firestore `edit_history` |
| `exportToExcel()` | Xuat du lieu da loc ra file .xlsx |
| `debounce(func, wait)` | Debounce helper |

### ui.js
| Ham | Mo ta |
|-----|-------|
| `UIManager` | Class quan ly UI: floating alerts, image hover preview (desktop), full-screen image overlay, animations |
| `showImageHover(src, event)` | Hien preview anh theo vi tri cursor |
| `showImageOverlay(src)` | Hien anh full-screen overlay |

### camera.js
| Ham | Mo ta |
|-----|-------|
| `eagerUploadImage(blob, containerId)` | Upload anh len Firebase ngay lap tuc, hien progress bar |
| `cancelPendingUpload()` | Huy upload dang cho |
| `compressImage(file, maxWidth, quality)` | Nen anh bang Canvas API |
| `startCamera()` / `stopCamera()` | Khoi dong/dung camera (WebRTC) |
| `takePicture()` / `retakePicture()` | Chup/chup lai anh |
| `uploadCapturedImage()` | Lay URL anh: uu tien eager result, fallback direct upload |
| `uploadEditCapturedImage()` | Upload anh cho form chinh sua |
| `handleMainFileSelect(event)` | Xu ly chon file anh (validate, compress, preview, eager upload) |
| `handleEditFileSelect(event)` | Tuong tu cho form edit |

### crud.js
| Ham | Mo ta |
|-----|-------|
| `addReceipt(event)` | Them phieu moi: validate, upload anh, luu Firestore |
| `uploadToFirestore(receiptData)` | Ghi receipt vao Firestore (arrayUnion) |
| `updateReceipt(event)` | Cap nhat phieu: doc Firestore, cap nhat fields + anh, ghi lai |
| `deleteReceiptByID(event)` | Xoa phieu tu nut xoa trong bang |
| `deleteReceiptDirectById(id, info)` | Xoa phieu tu edit modal |
| `openEditModal(event)` | Mo modal chinh sua, populate du lieu tu cache |
| `closeEditModalFunction()` | Dong modal, reset state |
| `clearReceiptForm()` | Xoa form them phieu |

### main.js
| Ham | Mo ta |
|-----|-------|
| `applyFiltersToData(dataArray)` | Loc data theo user + date (today/yesterday/week/month/custom range) |
| `calculateStatistics(dataArray)` | Tinh tong phieu, tong kg, tong kien |
| `renderDataToTable(dataArray)` | Render bang desktop + mobile cards, lazy load images |
| `renderMobileCards(sortedData)` | Render card list cho mobile |
| `initializeApplication()` | Khoi tao app: auth check, form/filter/tooltip init, load data |
| `toggleForm()` | Mo form them phieu (kiem tra permission truoc) |
| `showImageZoom(imgSrc)` / `hideImageZoom()` | Phong to/thu nho anh |
| `bindMobileFabEvents()` | Bind events cho FAB menu mobile |
| `bindMobileFileUpload()` | Bind events cho file upload mobile (thay camera section) |
| `applyDateRangeFilter()` | Ap dung loc theo khoang ngay tuy chon (dd/mm/yyyy) |

## Firestore Data Structure

Collection `nhanhang`, document `nhanhang`:
```json
{
  "data": [
    {
      "id": "receipt_m5abc123_xyz789def",
      "tenNguoiNhan": "TenUser",
      "soKg": 12.5,
      "soKien": 3,
      "ghiChu": "Ghi chu tuy chon",
      "anhNhanHang": "https://firebasestorage.googleapis.com/...",
      "thoiGianNhan": "15/01/2026, 09:30",
      "user": "TenUser"
    }
  ]
}
```

## Permission System

Su dung `PermissionHelper` (shared module) voi module key `nhanhang`:
- `view` - Xem danh sach phieu nhan
- `create` - Them phieu moi
- `edit` - Chinh sua phieu
- `cancel` / `delete` - Xoa phieu

## Responsive Design

- **Desktop (> 768px)**: Sidebar navigation, data table voi large product images (320px), camera preview voi overlay controls, image hover preview
- **Mobile (<= 768px)**: Sidebar an, table an thay bang card list, camera section thay bang file input don gian, modals full-screen, FAB menu (Them Phieu + Tro ly AI), stats grid 2 cot
