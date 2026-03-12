# Hang Rot Xa - Quan ly Hang Rot Xa

## Muc dich

Module quan ly kho hang rot xa (clearance/overstock inventory). Cho phep nguoi dung them, xem, cap nhat so luong, xoa san pham, va loc/tim kiem san pham theo phan loai hoac dot live. Du lieu luu tru tren Firestore, hinh anh upload len Firebase Storage. Giao dien hien thi bang san pham voi lazy loading anh, bo loc theo danh muc va dot live, thong ke tong quan (tong san pham, danh muc, dot live, tong so luong).

## Kien truc & Bo cuc folder

```
hangrotxa/
├── index.html                  # Trang chinh - layout, sidebar, form nhap, bang san pham
├── css/
│   ├── modern.css              # Design system chung (sidebar, topbar, cards, buttons, grid, responsive)
│   └── hangrotxa.css           # Style rieng cho trang (image tabs, table, filter, tooltip, empty state)
├── js/
│   ├── hangrotxa-config.js     # [1/6] Cau hinh Firebase, DOM elements, hang so, bien global
│   ├── hangrotxa-utils.js      # [2/6] Ham tien ich: notification, ID, date, sort, log, compress anh
│   ├── hangrotxa-cache.js      # [3/6] Cache in-memory, preload anh, migration data, load du lieu
│   ├── hangrotxa-ui.js         # [4/6] Xu ly UI: form, tabs anh, clipboard, filter, render bang, tooltip
│   ├── hangrotxa-crud.js       # [5/6] Thao tac CRUD: them, cap nhat so luong, xoa san pham
│   └── hangrotxa-main.js       # [6/6] Khoi tao ung dung, event listeners, error handlers, debug
└── README.md
```

## File Map

| File | Mo ta |
|------|-------|
| `index.html` | Trang HTML chinh. Chua sidebar navigation, top bar (nut them SP, refresh, search), 4 stat cards (tong SP, danh muc, dot live, tong SL), form nhap san pham (phan loai, dot live, hinh anh qua clipboard/file/link, ten SP, kich co, so luong), bang danh sach san pham co bo loc theo phan loai va dot live. Load Firebase SDK, Lucide Icons, shared modules. |
| `css/modern.css` | Design system dung chung. Dinh nghia CSS custom properties (mau, shadow, spacing, radius, transition). Style cho sidebar (co collapse), top bar, buttons, stat cards, cards, forms, filter tabs, image grid, lightbox, lazy loading, responsive breakpoints (1024/768/480px). Ho tro accessibility (prefers-reduced-motion, focus-visible) va GPU acceleration. |
| `css/hangrotxa.css` | Style bo sung rieng cho module. Image input tabs (clipboard/file/link), paste area, file upload container, link input, image preview grid, filter section, modern table (thead, tbody, summary row, hover, quantity input, delete/edit buttons), tooltip, empty state, form animation (slideDown), lazy loading placeholder (blur effect), loading spinner, print styles, responsive adjustments. |
| `js/hangrotxa-config.js` | Khoi tao Firebase (Firestore + Storage). Dinh nghia cac hang so: `CACHE_EXPIRY` (24h), `BATCH_SIZE` (50), `MAX_VISIBLE_ROWS` (500), `FILTER_DEBOUNCE_DELAY` (300ms). Tham chieu DOM elements (tbody, form inputs, filters). Khai bao bien global (`imageUrlFile`, `imgArray`, `searchFilter`). Export tat ca qua `window.HangRotXaConfig`. |
| `js/hangrotxa-utils.js` | Tap hop ham tien ich. Notification wrappers (`showLoading`, `hideLoading`, `showSuccess`, `showError`, `showInfo`). `extractTimestampFromId` - trich timestamp tu ID (format `id_<base36>`). `parseVietnameseDate` - parse ngay Viet Nam (DD/MM/YYYY hoac HH:MM DD/MM/YYYY). `sortDataByNewest` - sap xep theo dot live giam dan, roi theo thoi gian upload. `logAction` - ghi log hanh dong vao Firestore collection `edit_history`. `updateStats` - cap nhat 4 stat cards. `compressImage` - nen anh client-side (max 800px, quality 0.6). Cac ham delegate sang shared utils (`sanitizeInput`, `formatDate`, `generateUniqueID`, `debounce`). |
| `js/hangrotxa-cache.js` | Quan ly cache in-memory voi TTL 24 gio. `getCachedData`/`setCachedData`/`invalidateCache` - doc/ghi/xoa cache. `preloadImagesAndCache` - tai truoc tat ca anh roi cache data. `migrateDataWithIDs` - migration them ID cho du lieu cu (hien da commented out). `displayInventoryData` - tai du lieu tu Firestore (hoac cache), sap xep va render. `initializeWithMigration` - luong khoi tao chinh. Debug: `checkDataIntegrity` (kiem tra ID trung lap, thu tu sap xep), `forceSortByTime`, `forceRefreshData`. |
| `js/hangrotxa-ui.js` | Xu ly tuong tac UI. `toggleForm`/`clearData` - an/hien va reset form. `initializeImageInputTabs` - chuyen tab nhap anh (clipboard/file/link). `initializeClipboardHandling` - xu ly paste anh tu clipboard (ho tro paste URL hoac paste binary image, tu dong compress). `applyFiltersToData` - loc du lieu theo phan loai, dot live, va search text. `renderDataToTable` - render bang san pham voi lazy loading anh (IntersectionObserver), summary row, phan quyen (an nut xoa/disable input theo permission), gioi han hien thi `MAX_VISIBLE_ROWS`. `updateDropdownOptions` - cap nhat dropdown dot live tu du lieu. `updateSuggestions` - cap nhat datalist goi y ten SP. `initializeTooltipHandlers` - hien tooltip user khi click row (chi admin). `initializeImageHoverPreview` - preview anh khi hover, fullscreen khi click. |
| `js/hangrotxa-crud.js` | Thao tac CRUD len Firestore. `addProduct` - validate form, tao object san pham, dieu huong theo kieu nhap anh (link/file/clipboard). `handleFileUpload` - upload nhieu file: nen song song (Promise.all) roi upload song song, toi uu tu 60-90s xuong 8-15s cho 10 anh. `handleClipboardUpload` - upload anh tu clipboard (hoac URL da paste). `uploadToFirestore` - luu san pham vao Firestore bang `arrayUnion`, ghi log, invalidate cache, render lai bang. `updateInventoryByID` - cap nhat so luong san pham, confirm truoc khi thay doi, xoa neu so luong < 1. `deleteInventoryByID` - xoa san pham khoi mang data trong Firestore, ghi log, cap nhat UI. |
| `js/hangrotxa-main.js` | Diem vao cua ung dung. `initializeApplication` - kiem tra auth, khoi tao NotificationManager, khoi tao form/filter/tooltip/search/image preview, goi `initializeWithMigration`, gan su kien cho nut refresh/export, khoi tao Lucide icons. `initializeFormElements` - gan event listeners cho form submit, clear, toggle, image tabs, clipboard, validate so luong. `initializeFilterEvents` - gan su kien thay doi cho dropdown loc. Global error handlers (`window.onerror`, `unhandledrejection`). Export debug functions qua `window.HangRotXaDebug`. |

## Dependencies

### Shared modules (tu `../shared/`)
- `shared/js/firebase-config.js` - Cau hinh Firebase dung chung (cung cap `FIREBASE_CONFIG` hoac `firebaseConfig`)
- `shared/js/navigation-modern.js` - Sidebar navigation tu dong render menu items
- `shared/js/permissions-helper.js` - `PermissionHelper` kiem tra quyen truy cap trang va hanh dong (mark, delete, price)
- `shared/esm/compat.js` - ES module compatibility layer, cung cap `NotificationManager`, shared utils (`generateUniqueID`, `debounce`, `formatDate`, v.v.)
- `shared/js/shared-auth-manager.js` - `AuthManager` quan ly dang nhap/dang xuat (fallback cho file:// protocol)
- `shared/images/logo.jpg` - Logo N2STORE hien tren sidebar

### CDN libraries
- **Firebase SDK 9.6.1** (compat mode): `firebase-app-compat.js`, `firebase-storage-compat.js`, `firebase-firestore-compat.js`
- **Lucide Icons 0.294.0**: Thu vien icon SVG (`lucide.min.js` qua unpkg CDN)

### Cross-module references
- Firestore collection `hangrotxa` - document `hangrotxa` chua mang `data[]` (tat ca san pham)
- Firestore collection `edit_history` - ghi log moi thao tac add/update/delete
- Firebase Storage path `hangrotxa/sp/` - thu muc luu anh san pham
- `authManager` (global) - doi tuong AuthManager duoc khoi tao boi shared module
- `PermissionHelper` (global) - kiem tra quyen `hangrotxa.mark` (them), `hangrotxa.delete` (xoa), `hangrotxa.price` (sua so luong)

## Luong du lieu

```
1. Khoi tao (DOMContentLoaded)
   └─> initializeApplication()
       ├─> Kiem tra authManager.isAuthenticated()
       ├─> Khoi tao NotificationManager
       ├─> initializeFormElements() - gan event listeners
       ├─> initializeFilterEvents() - gan filter handlers
       ├─> initializeTooltipHandlers(), initializeSearch(), initializeImageHoverPreview()
       └─> initializeWithMigration()
           ├─> migrateDataWithIDs() (hien disabled)
           └─> displayInventoryData()
               ├─> getCachedData() -> co cache? -> renderDataToTable()
               └─> khong cache? -> Firestore.get("hangrotxa/hangrotxa")
                   ├─> sortDataByNewest(data)
                   ├─> renderDataToTable(sortedData)
                   ├─> updateSuggestions(sortedData)
                   └─> preloadImagesAndCache(sortedData) -> setCachedData()

2. Them san pham (Form Submit)
   └─> addProduct()
       ├─> PermissionHelper.checkBeforeAction('hangrotxa', 'mark')
       ├─> Validate form (ten SP, so luong >= 1)
       ├─> Tao newProductData { id, dotLive, thoiGianUpload, phanLoai, tenSanPham, kichCo, soLuong, user }
       └─> Tuy theo input type:
           ├─> Link: uploadToFirestore(data)
           ├─> File: handleFileUpload(data)
           │   ├─> compressImage() song song (Promise.all)
           │   ├─> Upload song song len Firebase Storage (hangrotxa/sp/)
           │   ├─> Lay downloadURLs
           │   └─> uploadToFirestore(data)
           └─> Clipboard: handleClipboardUpload(data)
               ├─> URL paste? -> uploadToFirestore(data)
               └─> Binary image? -> Upload len Storage -> uploadToFirestore(data)
       └─> uploadToFirestore()
           ├─> Firestore arrayUnion (them vao mang data[])
           ├─> logAction("add") -> ghi vao edit_history
           ├─> invalidateCache()
           ├─> displayInventoryData() (render lai)
           └─> clearData() (reset form)

3. Cap nhat so luong (Input change trong bang)
   └─> updateInventoryByID()
       ├─> PermissionHelper.checkBeforeAction('hangrotxa', 'price')
       ├─> Confirm thay doi
       ├─> Neu so luong < 1 -> goi deleteInventoryByID()
       ├─> Firestore: doc du lieu, tim index, cap nhat soLuong
       ├─> logAction("update")
       └─> invalidateCache()

4. Xoa san pham (Click nut xoa)
   └─> deleteInventoryByID()
       ├─> PermissionHelper.checkBeforeAction('hangrotxa', 'delete')
       ├─> Confirm xoa
       ├─> Firestore: doc du lieu, tim index, splice, update
       ├─> logAction("delete")
       ├─> invalidateCache()
       └─> Xoa row khoi DOM, cap nhat so thu tu

5. Loc & Tim kiem
   └─> applyFilters() -> debouncedApplyFilters() (300ms)
       ├─> getCachedData() hoac displayInventoryData()
       └─> renderDataToTable()
           └─> applyFiltersToData() - loc theo phanLoai, dotLive, searchFilter
```

## Ham chinh

### hangrotxa-config.js
| Ham/Bien | Mo ta |
|----------|-------|
| `CACHE_EXPIRY` | Thoi gian song cua cache: 24 gio (ms) |
| `BATCH_SIZE` | Kich thuoc batch xu ly: 50 |
| `MAX_VISIBLE_ROWS` | So dong toi da hien thi trong bang: 500 |
| `collectionRef` | Tham chieu Firestore collection `hangrotxa` |
| `historyCollectionRef` | Tham chieu Firestore collection `edit_history` |
| `storageRef` | Tham chieu Firebase Storage root |

### hangrotxa-utils.js
| Ham | Mo ta |
|-----|-------|
| `showLoading(message)` | Hien thong bao loading qua NotificationManager |
| `hideLoading(id)` | An thong bao loading theo ID |
| `showSuccess/Error/Info(msg)` | Hien thong bao trang thai |
| `extractTimestampFromId(id)` | Trich timestamp tu ID format `id_<base36timestamp>_<random>` |
| `parseVietnameseDate(dateStr)` | Parse chuoi ngay VN (HH:MM DD/MM/YYYY) thanh Unix timestamp |
| `sortDataByNewest(dataArray)` | Sap xep: dot live giam dan, roi thoi gian upload giam dan, fallback theo ID timestamp |
| `logAction(action, desc, old, new)` | Ghi log hanh dong vao Firestore `edit_history` voi thong tin user, trang, thoi gian |
| `updateStats(dataArray)` | Cap nhat 4 stat cards: tong SP, so danh muc, so dot live, tong so luong |
| `compressImage(file)` | Nen anh client-side: max width 800px, JPEG quality 0.6, tra ve File moi |
| `sanitizeInput(input)` | Loai bo ky tu dac biet `<>"'&` khoi chuoi |
| `generateUniqueID()` | Tao ID duy nhat (delegate sang shared utils) |
| `debounce(fn, delay)` | Debounce ham voi delay mac dinh 300ms |

### hangrotxa-cache.js
| Ham | Mo ta |
|-----|-------|
| `getCachedData()` | Lay du lieu tu cache in-memory, tra ve null neu het han hoac chua co |
| `setCachedData(data)` | Sap xep va luu du lieu vao cache in-memory voi timestamp |
| `invalidateCache()` | Xoa cache (dat data va timestamp ve null) |
| `preloadImagesAndCache(dataArray)` | Tai truoc tat ca URL anh (bang Image object), sau do cache data |
| `displayInventoryData()` | Tai du lieu tu cache hoac Firestore, sap xep, render bang, preload anh |
| `initializeWithMigration()` | Luong khoi tao: chay migration (neu co) roi hien thi du lieu |
| `checkDataIntegrity()` | Debug: kiem tra items thieu ID, ID trung lap, thu tu sap xep |
| `forceSortByTime()` | Debug: sap xep lai du lieu tren Firestore theo thoi gian |
| `forceRefreshData()` | Xoa cache va tai lai du lieu tu Firestore |

### hangrotxa-ui.js
| Ham | Mo ta |
|-----|-------|
| `toggleForm()` | An/hien form them san pham (kiem tra quyen truoc) |
| `clearData()` | Reset form: xoa input, xoa anh preview, reset bien global |
| `initializeImageInputTabs()` | Khoi tao tabs chuyen doi kieu nhap anh (clipboard/file/link) |
| `initializeClipboardHandling()` | Xu ly su kien paste: phat hien URL hoac binary image, compress va preview |
| `applyFiltersToData(dataArray)` | Loc mang du lieu theo phan loai, dot live, va search text |
| `applyFilters()` | Goi debounced filter: lay cache hoac reload, render lai bang |
| `initializeSearch()` | Gan su kien input cho o tim kiem voi debounce 300ms |
| `renderDataToTable(dataArray)` | Render bang san pham: loc, tao summary row, lazy load anh (IntersectionObserver), tao input so luong va nut xoa voi phan quyen, gioi han MAX_VISIBLE_ROWS |
| `updateDropdownOptions(data)` | Cap nhat dropdown dot live tu gia tri max trong du lieu |
| `updateSuggestions(data)` | Cap nhat datalist goi y ten san pham (loai bo trung lap) |
| `initializeTooltipHandlers()` | Hien tooltip user info khi click row (chi nguoi co quyen delete) |
| `initializeImageHoverPreview()` | Tao overlay va preview anh: hover hien preview lon, click hien fullscreen |

### hangrotxa-crud.js
| Ham | Mo ta |
|-----|-------|
| `addProduct(event)` | Xu ly form submit: validate, tao product object, dieu huong theo kieu nhap anh |
| `handleFileUpload(data)` | Upload nhieu file: compress song song -> upload song song -> luu Firestore |
| `handleClipboardUpload(data)` | Upload anh tu clipboard: xu ly URL paste hoac binary image |
| `uploadToFirestore(data)` | Luu san pham vao Firestore (arrayUnion), ghi log, invalidate cache, render lai |
| `updateInventoryByID(event)` | Cap nhat so luong: doc Firestore, tim san pham theo ID, update, ghi log |
| `deleteInventoryByID(event)` | Xoa san pham: doc Firestore, tim index, splice, update, ghi log, xoa DOM row |

### hangrotxa-main.js
| Ham | Mo ta |
|-----|-------|
| `initializeApplication()` | Ham khoi tao chinh: auth check, setup NotificationManager, khoi tao components, load data |
| `initializeFormElements()` | Gan event listeners cho form: submit, clear, toggle, image tabs, clipboard, validate SL |
| `initializeQuantityValidation()` | Validate so luong input >= 1, chan scroll wheel thay doi gia tri |
| `initializeFilterEvents()` | Gan su kien change cho dropdown loc phan loai va dot live |
| `window.HangRotXaDebug` | Object debug: checkDataIntegrity, forceSortByTime, forceRefreshData, invalidateCache |
