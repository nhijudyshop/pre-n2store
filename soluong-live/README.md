# Soluong-Live - Quan ly So luong Live

## Muc dich

Module quan ly so luong san pham trong phien ban hang livestream (Facebook Live, Social selling). Cung cap giao dien de:

- **Admin (index.html)**: Tim kiem, them san pham tu TPOS, quan ly danh sach san pham, cai dat hien thi, luu/khoi phuc lich su gio hang (cart snapshot).
- **Display (soluong-list.html)**: Hien thi grid san pham tren man hinh cho nguoi xem live, ho tro phan trang, swipe, dong bo realtime trang/search voi admin.
- **Hidden Display (hidden-soluong.html)**: Hien thi grid cac san pham da an (isHidden), cho phep unhide san pham.
- **Social Sales (social-sales.html)**: Giao dien ban hang cho nhan vien ban qua Facebook/Social, ghi log giao dich voi source + staffName.
- **Sales Report (sales-report.html)**: Bao cao ban hang, xem lich su giao dich theo ngay, loc theo nguon/nhan vien.

Du lieu san pham duoc luu tren **Firebase Realtime Database** va dong bo realtime giua tat ca cac trang.

## Kien truc & Bo cuc folder

```
soluong-live/
├── index.html                    # Trang Admin - quan ly san pham
├── soluong-list.html             # Trang Display - hien thi grid cho livestream
├── hidden-soluong.html           # Trang Display - hien thi san pham da an
├── social-sales.html             # Trang ban hang Social (Facebook)
├── sales-report.html             # Trang bao cao ban hang
├── js/
│   └── main.js                   # Logic chinh cua trang Admin (ES Module)
├── css/                          # (Thu muc CSS - hien tai trong)
├── firebase-helpers.js           # Firebase CRUD helpers (ES Module)
├── firebase-helpers-global.js    # Wrapper expose firebase-helpers ra window
├── migration-soldqty.js          # Script migration tach soldQty ra node rieng
├── ARCHITECTURE-SOLUONGLIVE.md   # Tai lieu kien truc chi tiet
└── firebasetorenderplan.md       # Ke hoach migration Firebase
```

## File Map

| File | Mo ta |
|------|-------|
| `index.html` | Trang Admin chinh. Tim san pham tu TPOS (qua Excel export), them/xoa san pham, cap nhat so luong da ban (soldQty), doi hinh anh, cai dat hien thi grid, luu/khoi phuc gio hang (cart history). Chua toan bo CSS inline. |
| `soluong-list.html` | Trang hien thi grid san pham cho livestream. Phan trang, swipe chuyen trang, dong bo page/search realtime voi Admin qua Firebase. Ho tro mode: sync (admin dieu khien), standalone. Co nut +/- de cap nhat soldQty, nut an san pham, nut refresh tong so luong tu TPOS. |
| `hidden-soluong.html` | Tuong tu soluong-list.html nhung chi hien thi san pham co `isHidden = true`. Cho phep unhide (hien lai) san pham. Doc settings tu `hiddenSoluongDisplaySettings` tren Firebase. |
| `social-sales.html` | Giao dien ban hang cho nhan vien Social. Khac voi soluong-list: KHONG sync page/search voi live, CO sync data realtime (soldQty). Moi giao dich +/- duoc ghi log voi `source` (facebook/social) va `staffName`. Kiem tra quyen "soluong" truoc khi cho truy cap. |
| `sales-report.html` | Trang bao cao. Load log ban hang tu Firebase (`soluongSalesLog`), loc theo ngay, loc theo nguon/nhan vien, hien thi thong ke tong. |
| `js/main.js` | Logic chinh cua Admin (ES Module). Xu ly: tim kiem san pham tu TPOS Excel, them san pham (don le + batch variants), cap nhat soldQty, quan ly cart history/snapshot, doi hinh anh (paste/upload/camera/link), cai dat hien thi, barcode scanner detection. |
| `firebase-helpers.js` | Thu vien Firebase CRUD (ES Module). Cac ham: addProductToFirebase, updateProductQtyInFirebase, loadAllProductsFromFirebase, setupFirebaseChildListeners, saveCartSnapshot, getAllCartSnapshots, logSaleTransaction, v.v. Toi uu: tach soldQty ra node rieng (`soluongProductsQty`) de giam bandwidth (~20 bytes thay vi ~1KB moi update). |
| `firebase-helpers-global.js` | Wrapper import tu firebase-helpers.js va expose tat ca ham ra `window` object, de cac HTML page su dung trong inline `<script>` (khong phai ES Module). |
| `migration-soldqty.js` | Script migration chay trong browser console. Tach soldQty tu `soluongProducts` sang `soluongProductsQty`. Co backup, migrate, rollback, verify, restore. |
| `ARCHITECTURE-SOLUONGLIVE.md` | Tai lieu kien truc chi tiet cua module. |
| `firebasetorenderplan.md` | Ke hoach migration Firebase. |

## Dependencies

### Shared libs (tu `../shared/`)
- `shared/js/firebase-config.js` - Cau hinh Firebase dung chung
- `shared/esm/compat.js` - ES Module utilities (auto-init authManager, notificationManager, tokenManager)
- `shared/js/shared-auth-manager.js` - Quan ly xac thuc (fallback cho file:// protocol)
- `shared/js/shared-cache-manager.js` - Quan ly cache
- `shared/js/storage-migration.js` - Migration localStorage giua cac phien ban
- `shared/js/navigation-modern.js` - Navigation menu dung chung (deferred load)

### CDN libraries
- **Firebase SDK 10.7.1** (compat): `firebase-app-compat.js`, `firebase-database-compat.js`, `firebase-firestore-compat.js`
- **SheetJS (XLSX) 0.18.5**: Doc file Excel export tu TPOS de lay danh sach san pham (`index.html` only)

### Cross-module references
- **TPOS API** qua Cloudflare proxy (`chatomni-proxy.nhijudyshop.workers.dev`):
  - `POST /api/Product/ExportFileWithVariantPrice` - Export danh sach san pham (Excel)
  - `GET /api/odata/Product({id})` - Chi tiet san pham
  - `GET /api/odata/ProductTemplate({id})` - Chi tiet template + variants
- **TokenManager** (tu shared/esm/compat.js) - Quan ly TPOS authentication token
- **BroadcastChannel** (`soluong-settings`) - Dong bo settings giua cac tab browser

## Luong du lieu

### 1. Them san pham (Admin)
```
User search san pham
  -> loadExcelData() goi TPOS API ExportFileWithVariantPrice
  -> XLSX parse Excel -> productsData[]
  -> searchProducts() loc ket qua
  -> User chon san pham
  -> loadProductDetails() goi TPOS OData API lay chi tiet + variants
  -> cleanProductForFirebase() lam sach du lieu
  -> addProductToFirebase() / addProductsToFirebase() ghi len Firebase
  -> Firebase realtime sync -> tat ca trang khac cap nhat
```

### 2. Cap nhat so luong da ban (soldQty)
```
User nhan nut +/- tren bat ky trang nao
  -> updateProductQtyInFirebase()
  -> Ghi DONG THOI 2 node:
     - soluongProducts/{productKey}/soldQty (static data)
     - soluongProductsQty/{productKey}/soldQty (optimized ~20 bytes)
  -> Firebase listener (child_changed tren soluongProductsQty)
  -> Tat ca trang khac nhan realtime update
```

### 3. Cart History (Luu/Khoi phuc gio hang)
```
Admin nhan "Luu & Lam moi"
  -> saveCartSnapshot() luu snapshot len Firebase (cartHistory/{snapshotId})
  -> clearAllProducts() xoa gio hang hien tai
  -> Khi khoi phuc: restoreProductsFromSnapshot() ghi lai toan bo san pham
  -> Auto-save gio hang cu truoc khi khoi phuc (tuy chon)
```

### 4. Dong bo trang Admin <-> Display (soluong-list.html)
```
Admin chuyen trang/search
  -> Ghi len Firebase: soluongSyncCurrentPage, soluongSyncSearchData
  -> soluong-list.html (#sync mode) lang nghe Firebase
  -> Tu dong chuyen trang/loc san pham theo admin

Display settings (columns, rows, gap, font size, v.v.)
  -> Admin luu: database.ref('soluongDisplaySettings').set(settings)
  -> soluong-list.html doc settings va apply CSS variables
  -> BroadcastChannel 'soluong-settings' dong bo giua cac tab
```

### 5. Social Sales logging
```
Nhan vien nhan +/- tren social-sales.html
  -> updateProductQtyInFirebase() cap nhat so luong
  -> logSaleTransaction() ghi log vao soluongSalesLog
     { productId, productName, change, source, staffName, timestamp, date }
  -> sales-report.html doc log theo ngay: getSalesLogByDate()
```

## Firebase Realtime Database Nodes

| Node | Mo ta |
|------|-------|
| `soluongProducts/{product_ID}` | Du lieu san pham day du (Name, Qty, image, price, isHidden, ...) |
| `soluongProductsQty/{product_ID}` | Chi chua `{ soldQty }` - toi uu bandwidth cho realtime update |
| `soluongProductsMeta` | Metadata: `{ sortedIds[], count, lastUpdated }` |
| `soluongDisplaySettings` | Cai dat hien thi grid (columns, rows, gap, font, ...) |
| `hiddenProductsDisplaySettings` | Cai dat hien thi cho trang san pham an |
| `soluongSyncCurrentPage` | Trang hien tai dang hien thi (dong bo Admin -> Display) |
| `soluongSyncSearchData` | Tu khoa tim kiem hien tai (dong bo Admin -> Display) |
| `soluongIsMergeVariants` | Che do gop variants theo template |
| `soluongSalesLog/{autoId}` | Log giao dich ban hang (productId, change, source, staff, timestamp) |
| `cartHistory/{snapshot_ID}` | Snapshot gio hang da luu (metadata + products) |
| `cartHistoryMeta` | Metadata cart history: `{ sortedIds[], count, lastUpdated }` |

## Ham chinh

### firebase-helpers.js

| Ham | Mo ta |
|-----|-------|
| `addProductToFirebase(db, product, local)` | Them/cap nhat 1 san pham. Giu nguyen soldQty neu da ton tai. |
| `addProductsToFirebase(db, products, local)` | Them hang loat (batch). Dung cho variants. |
| `removeProductFromFirebase(db, id, local)` | Xoa 1 san pham khoi Firebase va local. |
| `removeProductsFromFirebase(db, ids, local)` | Xoa nhieu san pham (batch). |
| `updateProductQtyInFirebase(db, id, change, local)` | Cap nhat soldQty (+1/-1). Ghi dong thoi 2 node. |
| `updateProductVisibility(db, id, isHidden, local)` | An/hien san pham (set isHidden). |
| `cleanupOldProducts(db, local)` | Xoa san pham cu hon 7 ngay. |
| `clearAllProducts(db, local)` | Xoa toan bo san pham. |
| `loadAllProductsFromFirebase(db)` | Load tat ca san pham + merge qty data. |
| `setupFirebaseChildListeners(db, local, callbacks)` | Thiet lap realtime listeners (child_added/changed/removed + qty_changed). |
| `getProductsArray(obj, sortedIds)` | Chuyen products object thanh sorted array. |
| `saveCartSnapshot(db, snapshot)` | Luu snapshot gio hang len Firebase. |
| `getAllCartSnapshots(db, forceRefresh)` | Load tat ca snapshots (co localStorage cache 5 phut). |
| `restoreProductsFromSnapshot(db, products, local)` | Khoi phuc san pham tu snapshot. |
| `deleteCartSnapshot(db, snapshotId)` | Xoa snapshot. |
| `logSaleTransaction(db, logData)` | Ghi log giao dich ban hang. |
| `getSalesLogByDate(db, date)` | Lay log theo ngay (YYYY-MM-DD). |
| `getAllSalesLogs(db, limit)` | Lay tat ca log (gioi han 1000). |

### js/main.js (Admin page)

| Ham | Mo ta |
|-----|-------|
| `loadExcelData()` | Goi TPOS API, parse Excel -> productsData[]. |
| `searchProducts(text)` | Tim san pham trong productsData, uu tien match trong [bracket], code, ten. |
| `loadProductDetails(id)` | Load chi tiet san pham + template variants tu TPOS OData. |
| `addProductToList(product)` | Them san pham vao danh sach + Firebase. |
| `cleanProductForFirebase(product)` | Chuan hoa du lieu san pham truoc khi luu Firebase. |
| `sortVariants(variants)` | Sap xep variants theo so (1,2,3) va size (S,M,L,XL). |
| `updateProductListPreview()` | Render lai danh sach san pham visible tren Admin. |
| `updateHiddenProductListPreview()` | Render lai danh sach san pham an tren Admin. |
| `changeProductImage(id)` | Mo modal doi hinh anh (paste/upload/camera/link). |
| `saveCartAndRefresh()` | Luu cart snapshot + xoa gio hang hien tai. |
| `restoreSnapshot(id)` | Khoi phuc tu snapshot voi bao ve auto-save. |
| `loadSettings()` / `applySettings()` | Doc/luu cai dat hien thi tu/len Firebase. |
| `performListSearch(keyword)` | Tim kiem trong danh sach san pham Admin. |
| `autoSearchExactMatch(text)` | Xu ly barcode scanner - tu dong tim exact match. |
| `setupFirebaseListeners()` | Thiet lap realtime sync cho products va settings. |

### migration-soldqty.js

| Ham | Mo ta |
|-----|-------|
| `backupFirebaseData(db)` | Backup toan bo du lieu Firebase (download JSON + localStorage). |
| `migrateQtyToSeparateNode(db)` | Tach soldQty sang node rieng soluongProductsQty. |
| `rollbackMigration(db)` | Xoa node soluongProductsQty (rollback). |
| `restoreFromBackup(db, key)` | Khoi phuc tu backup (last resort). |
| `verifyMigrationState(db)` | Kiem tra trang thai migration. |
