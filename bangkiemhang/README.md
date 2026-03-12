# Bang Kiem Hang - Quan Ly Kiem Hang (Inventory Checking Management)

## Muc dich
Module quan ly kiem hang cho phep theo doi quy trinh nhan hang tu nha cung cap. Nguoi dung co the:
- Xem danh sach don hang da dat va trang thai nhan hang (du, thieu, chua nhan)
- Cap nhat so luong thuc nhan va tong nhan cho tung san pham
- Loc va tim kiem don hang theo nha cung cap, khoang thoi gian, hoac tu khoa
- Xuat du lieu kiem hang ra file Excel
- Ghi nhat ky hanh dong (audit log) vao Firestore collection `edit_history`

Du lieu nguon la collection `dathang` tren Firestore, chua mang cac don hang (`data[]`). Module doc du lieu nay, chuyen doi sang dinh dang kiem hang, va hien thi duoi dang bang nhom theo nha cung cap + ngay dat.

## Kien truc & Bo cuc folder
```
bangkiemhang/
  index.html              # Trang chinh (Single Page)
  css/
    styles.css            # Toan bo CSS cho module
  js/
    config.js             # Cau hinh, hang so, khoi tao Firebase
    utils.js              # Ham tien ich rieng cua trang (logAction)
    ui-components.js      # Floating alert, dialog, error handlers
    data-loader.js        # Tai va xu ly du lieu tu Firestore
    filters.js            # He thong loc: quick filter, NCC, ngay, tim kiem
    table-renderer.js     # Render bang, nhom du lieu, thong ke
    crud-operations.js    # Them/Sua/Xoa thong tin kiem hang (modal)
    export.js             # Xuat du lieu ra Excel (.xlsx)
    main.js               # Khoi tao ung dung, dang ky su kien
```

## File Map
| File | Mo ta |
|------|-------|
| `index.html` | Trang HTML chinh voi sidebar navigation, thanh thong ke (4 stat cards), bo loc co the dong/mo, va bang du lieu kiem hang. Load cac shared modules va page scripts theo thu tu. |
| `css/styles.css` | CSS day du cho module: sidebar, top bar, stat cards, filters (collapsible), bang du lieu voi row merging, modal chinh sua, floating alert, va responsive design (1024px, 768px, 480px breakpoints). |
| `js/config.js` | Dinh nghia `APP_CONFIG` (cache 24h, max 500 rows, debounce 500ms), `globalState` (inventoryData, filteredData, filters), va khoi tao Firebase voi 2 collection references: `dathang` (du lieu don hang) va `edit_history` (nhat ky). |
| `js/utils.js` | Chua ham `logAction()` de ghi nhat ky thao tac (edit, delete, export, refresh) vao Firestore collection `edit_history`. Cac ham tien ich chung (sanitizeInput, formatDate, debounce, parseVietnameseDate, etc.) duoc cung cap boi shared modules. |
| `js/ui-components.js` | He thong thong bao floating alert (legacy), cac ham showFloatingAlert/hideFloatingAlert, showConfirmDialog, showInfoMessage, showLoadingMessage, showSuccessMessage, showErrorMessage. Cung co `forceUnblock()` va global error handlers. |
| `js/data-loader.js` | `loadInventoryData()` doc tu Firestore `dathang/dathang` document, lay mang `data[]`, chuyen doi qua `transformOrderDataToInventory()`, sap xep theo ngay dat (moi nhat truoc), luu cache. `refreshInventoryData()` xoa cache va tai lai. |
| `js/filters.js` | He thong loc hien dai voi: Quick filter (hom nay, hom qua, 7/30 ngay, thang nay/truoc, tuy chinh), loc theo NCC (dropdown tu dong tao tu du lieu), loc theo khoang ngay, tim kiem toan van. Filter panel co the dong/mo (collapse). Su dung debounce de tranh goi qua nhieu. |
| `js/table-renderer.js` | `renderInventoryTable()` nhom du lieu theo NCC + ngay dat hang (`groupBySupplierAndDate`), render bang voi cell merging (rowSpan) cho cot Ngay Dat va NCC. `updateStatistics()` tinh va cap nhat 4 stat cards. `addQuantityStatusClass()` gan CSS class (exact/over/under-quantity) cho badge mau. Kiem tra quyen bang `PermissionHelper`. |
| `js/crud-operations.js` | `editInventoryItem()` mo modal de chinh sua thucNhan va tongNhan. `saveModalChanges()` luu vao Firebase (cap nhat item trong mang `data[]` cua document `dathang`), cap nhat cache, refresh bang. `deleteInventoryItem()` xoa thong tin kiem kho (chi xoa truong thucNhan/tongNhan, giu lai don hang goc). Moi thao tac deu kiem tra quyen qua `PermissionHelper`. |
| `js/export.js` | `exportToExcel()` su dung thu vien SheetJS (XLSX) de xuat du lieu da loc ra file Excel voi ten file co timestamp. Tu dong tinh do rong cot. Ghi log hanh dong xuat. |
| `js/main.js` | Diem khoi tao ung dung: kiem tra xac thuc, goi `initializeFilterEvents()`, `loadInventoryData()`, dang ky su kien cho cac nut (refresh, export, logout). Cung export `debugInventoryFunctions` cho development. |

## Dependencies

### Shared Modules (tu `../shared/`)
| Module | Chuc nang |
|--------|-----------|
| `shared/esm/compat.js` | ES Module compatibility layer, tai shared utilities |
| `shared/js/firebase-config.js` | Cau hinh Firebase chung (FIREBASE_CONFIG) |
| `shared/js/navigation-modern.js` | Sidebar navigation tu dong tao menu |
| `shared/js/permissions-helper.js` | `PermissionHelper` kiem tra quyen (inventoryTracking: edit_shipment, delete_shipment) |
| `shared/js/shared-auth-manager.js` | Quan ly xac thuc (fallback cho file:// protocol) |
| `shared/js/date-utils.js` | `parseVietnameseDate()`, `formatDate()`, `getFormattedDateTime()` |
| `shared/js/form-utils.js` | `sanitizeInput()`, `debounce()` |
| `shared/js/common-utils.js` | `generateUniqueID()`, `getUserName()`, `getAuthState()`, `isAuthenticated()` |
| `shared/js/shared-cache-manager.js` | `getCachedData()`, `setCachedData()`, `invalidateCache()` |
| `shared/js/notification-system.js` | `NotificationManager` class (success, error, warning, info, loadingData, processing, saving, deleting, remove) |

### CDN Libraries
| Thu vien | Version | Chuc nang |
|----------|---------|-----------|
| Firebase App Compat | 9.6.1 | Firebase SDK (app initialization) |
| Firebase Firestore Compat | 9.6.1 | Firestore database client |
| Lucide Icons | 0.294.0 | Icon system (edit-3, trash-2, filter, package, check-circle, etc.) |
| SheetJS (XLSX) | 0.18.5 | Doc/ghi file Excel |

### Cross-module References
- Doc du lieu tu Firestore collection `dathang`, document `dathang`, field `data[]` (mang don hang)
- Ghi nhat ky vao Firestore collection `edit_history`
- Dung chung Firebase config va auth system voi cac module khac
- Quyen truy cap duoc quan ly tap trung qua `PermissionHelper` (module `inventoryTracking`)

## Luong du lieu

```
1. Khoi tao (main.js)
   |
   v
2. Kiem tra auth (getAuthState/isAuthenticated)
   |
   v
3. loadInventoryData() (data-loader.js)
   |-- Kiem tra cache (getCachedData)
   |   |-- Co cache --> Render truc tiep
   |   |-- Khong cache --> Doc Firestore
   |                        |
   |                        v
   |                    Firestore: dathang/dathang.data[]
   |                        |
   |                        v
   |                    transformOrderDataToInventory()
   |                    (map fields: ngayDatHang, nhaCungCap, maSanPham,
   |                     tenSanPham, soLuong, thucNhan, tongNhan, ...)
   |                        |
   |                        v
   |                    Sort theo ngay dat (moi nhat truoc)
   |                        |
   |                        v
   |                    Luu cache (setCachedData)
   |
   v
4. renderInventoryTable() (table-renderer.js)
   |-- applyFiltersToInventory() --> Loc du lieu
   |-- groupBySupplierAndDate() --> Nhom theo NCC + Ngay
   |-- renderGroupedData()      --> Tao HTML rows voi rowSpan merge
   |-- updateStatistics()       --> Cap nhat 4 stat cards
   |
   v
5. Nguoi dung tuong tac
   |-- Loc/Tim kiem --> applyFilters() --> renderInventoryTable()
   |-- Chinh sua    --> editInventoryItem() --> showEditModal()
   |                    --> saveModalChanges() --> updateOrderInventoryData()
   |                    --> Cap nhat Firestore + cache + re-render
   |-- Xoa          --> deleteInventoryItem() --> removeInventoryDataFromOrder()
   |                    --> Cap nhat Firestore + cache + re-render
   |-- Xuat Excel   --> exportToExcel() --> XLSX.writeFile()
   |-- Lam moi      --> refreshInventoryData() --> invalidateCache + loadInventoryData()
```

## Ham chinh

### config.js
| Ham | Mo ta |
|-----|-------|
| `initializeFirebase()` | Khoi tao Firebase app, tao references den collection `dathang` va `edit_history`. Retry khi shared modules chua load xong. |

### data-loader.js
| Ham | Mo ta |
|-----|-------|
| `loadInventoryData()` | Tai du lieu tu cache hoac Firestore, chuyen doi, sap xep, render bang, cap nhat filter options. |
| `transformOrderDataToInventory(orderData)` | Map mang don hang thanh mang inventory items voi cac truong chuan hoa (id, ngayDatHang, nhaCungCap, maSanPham, tenSanPham, soLuong, thucNhan, tongNhan, ...). |
| `refreshInventoryData()` | Xoa cache va goi lai `loadInventoryData()`. |

### filters.js
| Ham | Mo ta |
|-----|-------|
| `getQuickFilterDates(quickFilterValue)` | Tinh khoang ngay cho quick filter (today, yesterday, last7days, last30days, thisMonth, lastMonth). |
| `applyFiltersToInventory(dataArray)` | Loc du lieu theo NCC, khoang ngay (quick hoac custom), va tu khoa tim kiem toan van. |
| `updateFilterOptions(fullDataArray)` | Tu dong tao danh sach NCC trong dropdown tu du lieu. |
| `updateFilterCount(count)` | Cap nhat badge hien thi so san pham sau khi loc. |
| `toggleFilterPanel()` | Dong/mo panel bo loc (collapse animation). |
| `initializeFilterEvents()` | Dang ky event listeners cho tat ca cac input/select cua bo loc. |

### table-renderer.js
| Ham | Mo ta |
|-----|-------|
| `renderInventoryTable(inventoryData)` | Diem vao chinh: loc, nhom, render bang, cap nhat thong ke. |
| `groupBySupplierAndDate(data)` | Nhom items theo key `${nhaCungCap}_${ngayDatHang}`, tra ve mang groups. |
| `renderGroupedData(groupedData, tbody)` | Tao DOM elements cho tung row, merge cell Ngay Dat va NCC bang rowSpan, gan su kien edit/delete, kiem tra quyen. |
| `updateStatistics(inventoryData)` | Tinh so luong: tong SP, da nhan du (received >= ordered), nhan thieu (0 < received < ordered), chua nhan. |
| `addQuantityStatusClass(element, receivedQty, orderedQty)` | Gan CSS class `exact-quantity` (xanh), `over-quantity` (xanh duong), hoac `under-quantity` (do) cho badge. |

### crud-operations.js
| Ham | Mo ta |
|-----|-------|
| `editInventoryItem(event)` | Kiem tra quyen, tim item tu cache, mo modal chinh sua. |
| `showEditModal(itemData)` | Tao va hien thi modal voi thong tin san pham va form nhap thucNhan/tongNhan. |
| `closeEditModal()` | Dong modal voi animation. |
| `saveModalChanges(inventoryId, itemInfo)` | Doc gia tri tu form, goi `updateOrderInventoryData()` de luu Firestore, cap nhat cache, re-render, ghi log. |
| `updateOrderInventoryData(orderId, updateData)` | Doc document `dathang`, tim order theo ID trong mang `data[]`, merge updateData, ghi lai Firestore. |
| `deleteInventoryItem(event)` | Xac nhan xoa, goi `removeInventoryDataFromOrder()`, cap nhat cache, re-render, ghi log. Co rollback khi loi. |
| `removeInventoryDataFromOrder(inventoryId)` | Xoa cac truong kiem kho (thucNhan, tongNhan, inventoryUpdated) khoi order trong Firestore, giu lai don hang goc. |

### export.js
| Ham | Mo ta |
|-----|-------|
| `exportToExcel()` | Tao file Excel tu du lieu da loc, voi cac cot: STT, Ngay dat, NCC, Ngay nhan, Ma SP, Ten SP, SL Dat, Thuc Nhan, Tong Nhan, Cap nhat luc, Nguoi cap nhat. Tu dong fit column widths. |

### utils.js
| Ham | Mo ta |
|-----|-------|
| `logAction(action, description, oldData, newData, pageName)` | Ghi mot entry vao Firestore `edit_history` voi thong tin: timestamp, user, page, action, description, oldData, newData. |

### ui-components.js
| Ham | Mo ta |
|-----|-------|
| `showFloatingAlert(message, isLoading, duration)` | Hien thi floating alert o goc tren phai (legacy, dang duoc thay the boi NotificationManager). |
| `hideFloatingAlert()` | An floating alert. |
| `forceUnblock()` | Ham khan cap de mo khoa trang khi bi block boi overlay/pointer-events. |

### main.js
| Ham | Mo ta |
|-----|-------|
| `initializeInventorySystem()` | Ham khoi tao chinh: tao NotificationManager, kiem tra auth, khoi tao filters, tai du lieu, dang ky su kien. |
| `setupEventListeners()` | Gan click handler cho cac nut Refresh, Export, Logout. |
