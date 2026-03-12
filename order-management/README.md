# Order Management - Quan ly Order (Hang Dat)

## Muc dich

Module quan ly don dat hang (order) cho N2STORE. Cho phep:
- Tim kiem san pham tu TPOS API va them vao danh sach order
- Theo doi so luong ton kho (Tong), da ban (Ban), va da dat (Da Dat) cho tung san pham/bien the
- Hien thi san pham dang luoi (grid) tren man hinh lon voi phan trang
- An/hien san pham, xoa san pham
- Luu va khoi phuc lich su gio hang (cart snapshot)
- Dong bo du lieu realtime giua nhieu thiet bi qua Firebase Realtime Database
- Gop bien the (merge variants) cua cung mot product template thanh 1 card
- Thay doi hinh anh san pham bang paste, upload, camera, hoac link URL

## Kien truc & Bo cuc folder

```
order-management/
├── css/
│   └── modern.css            # Design system CSS (sidebar, cards, table, modal, filters)
├── firebase-helpers.js       # Firebase Realtime DB CRUD helpers (shared across all pages)
├── index.html                # Trang chinh: tim kiem san pham, quan ly danh sach order
├── order-list.html           # Trang hien thi grid san pham (visible products)
├── hidden-products.html      # Trang hien thi grid san pham da an (hidden products)
└── README.md                 # File nay
```

## File Map

| File | Mo ta |
|------|-------|
| `index.html` | **Trang chinh** (~4800 dong). Tim kiem san pham tu TPOS, them vao danh sach, chinh sua so luong (Tong/Ban/Da Dat), thay doi hinh anh (paste/upload/camera/link), quan ly gio hang (luu/khoi phuc/xoa snapshot), settings sidebar. Chua toan bo JS inline. |
| `order-list.html` | **Trang grid san pham** (~2600 dong). Hien thi san pham dang luoi 4x2 (co the tuy chinh). Ho tro phan trang, tim kiem, gop bien the, an/xoa san pham, chinh sua so luong truc tiep tren grid. Sync realtime voi Firebase. |
| `hidden-products.html` | **Trang grid san pham da an** (~2100 dong). Tuong tu `order-list.html` nhung chi hien thi san pham co `isHidden === true`. Ho tro hien lai (unhide) san pham. |
| `firebase-helpers.js` | **Firebase CRUD helpers** (661 dong). Cung cap cac ham CRUD cho `orderProducts` va `cartHistory` tren Firebase Realtime Database. Duoc dung chung boi ca 3 trang HTML. |
| `css/modern.css` | **Design system CSS** (~1400 dong). He thong CSS variables, sidebar navigation, cards, tables, modals, filters, image hover, responsive breakpoints. |

## Dependencies

### Shared libs (tu `../shared/`)
- `../shared/js/firebase-config.js` - Cau hinh Firebase (duoc dung boi `order-list.html` va `hidden-products.html`)
- `../shared/esm/compat.js` - ES Module compat layer, auto-init `authManager` va `notificationManager`
- `../shared/js/shared-auth-manager.js` - Fallback AuthManager cho file:// protocol
- `../shared/js/navigation-modern.js` - Sidebar navigation component (deferred load)

### CDN Libraries
- **Firebase SDK v10.7.1** (compat mode):
  - `firebase-app-compat.js`
  - `firebase-database-compat.js` (Realtime Database)
  - `firebase-firestore-compat.js` (Firestore - imported but used minimally)
- **SheetJS (XLSX) v0.18.5** - Doc file Excel tu TPOS API export (`index.html` only)
- **Lucide Icons v0.294.0** - Icon set cho sidebar navigation (`index.html` only)

### Cross-module references
- Trang `index.html` link sang `order-list.html` (nut "Phong to") va `hidden-products.html` (nut "Xem")
- Trang `order-list.html` va `hidden-products.html` link nguoc ve `index.html` (nut "Quay lai trang tim kiem")
- TPOS API duoc truy cap qua Cloudflare proxy: `chatomni-proxy.nhijudyshop.workers.dev`

## Luong du lieu

### 1. Them san pham vao order (index.html)

```
User nhap ten/ma san pham
       |
       v
loadExcelData() -- TPOS API --> ExportFileWithVariantPrice --> SheetJS parse Excel
       |
       v
searchProducts() -- filter & sort ket qua
       |
       v
User chon san pham tu suggestions
       |
       v
loadProductDetails() -- TPOS OData API --> Product(id)?$expand=... --> ProductTemplate?$expand=ProductVariants
       |
       v
[Neu autoAddVariants = true va co variants]
       |-- Prompt nhap so luong cho tung variant
       |-- cleanProductForFirebase() -- lam sach du lieu
       |-- addProductsToFirebase() -- batch write Firebase
       |
[Neu khong co variants]
       |-- Prompt nhap so luong
       |-- addProductToFirebase() -- single write Firebase
       |
       v
updateProductListPreview() -- render lai danh sach tren UI
```

### 2. Hien thi grid (order-list.html / hidden-products.html)

```
Page load
    |
    v
loadSettings() -- doc cau hinh layout tu Firebase (columns, rows, gap, ...)
    |
    v
loadProducts() -- loadAllProductsFromFirebase()
    |
    v
updateProductGrid()
    |-- Filter visible/hidden products
    |-- [Neu mergeVariants] mergeProductsByTemplate() -- gop variants cung template
    |-- Phan trang (currentPage, itemsPerPage)
    |-- Render grid cards voi image, name, price, stats (Tong/Ban/Da Dat)
    |
    v
setupFirebaseListeners() -- realtime sync
    |-- child_changed --> update local + re-render
    |-- child_added --> add to local + re-render
    |-- child_removed --> remove from local + re-render
```

### 3. Cart History / Snapshot (index.html)

```
saveCartAndRefresh()
    |-- calculateCartStats() -- thong ke gio hang hien tai
    |-- saveCartSnapshot() -- luu vao Firebase: cartHistory/{snapshotId}
    |-- clearAllProducts() -- xoa gio hang hien tai
    |-- refreshCartHistory() -- tai lai danh sach snapshots

restoreSnapshot(snapshotId)
    |-- [Neu gio hang co san pham] showRestoreConfirmDialog()
    |   |-- [Checkbox] Tu dong luu gio hang hien tai truoc khi khoi phuc
    |-- performRestore()
        |-- [Neu autoSave] saveCartSnapshot() -- luu gio cu
        |-- getCartSnapshot() -- tai snapshot can khoi phuc
        |-- clearAllProducts() -- xoa gio hien tai
        |-- restoreProductsFromSnapshot() -- ghi products tu snapshot vao Firebase
```

### 4. Firebase Realtime Database structure

```
Firebase Realtime DB
├── orderProducts/
│   ├── product_123: { Id, NameGet, QtyAvailable, soldQty, remainingQty, imageUrl, ... }
│   ├── product_456: { ... }
│   └── ...
├── orderProductsMeta/
│   ├── sortedIds: ["123", "456", ...]
│   ├── count: 10
│   └── lastUpdated: 1234567890
├── cartHistory/
│   ├── snapshot_1234567890: { metadata: {...}, products: {...} }
│   └── ...
├── cartHistoryMeta/
│   ├── sortedIds: ["snapshot_1234567890", ...]
│   ├── count: 5
│   └── lastUpdated: 1234567890
└── orderSettings/
    ├── columns: 4
    ├── rows: 2
    ├── gap: 15
    └── ... (display settings)
```

## Ham chinh

### firebase-helpers.js

| Ham | Mo ta |
|-----|-------|
| `addProductToFirebase(database, product, localProductsObject)` | Them hoac cap nhat 1 san pham. Neu da ton tai, giu nguyen `soldQty` va `addedAt`. |
| `addProductsToFirebase(database, products, localProductsObject)` | Batch them/cap nhat nhieu san pham (dung khi them variants). |
| `removeProductFromFirebase(database, productId, localProductsObject)` | Xoa 1 san pham khoi Firebase va local. |
| `removeProductsFromFirebase(database, productIds, localProductsObject)` | Batch xoa nhieu san pham. |
| `updateProductQtyInFirebase(database, productId, change, localProductsObject)` | Tang/giam `soldQty` cua 1 san pham (clamp trong khoang [0, QtyAvailable]). |
| `updateProductVisibility(database, productId, isHidden, localProductsObject)` | An/hien 1 san pham (`isHidden` flag). |
| `cleanupOldProducts(database, localProductsObject)` | Tu dong xoa san pham cu hon 7 ngay. |
| `clearAllProducts(database, localProductsObject)` | Xoa toan bo san pham va reset metadata. |
| `loadAllProductsFromFirebase(database)` | Tai toan bo san pham tu Firebase (initial load). |
| `setupFirebaseChildListeners(database, localProductsObject, callbacks)` | Thiet lap realtime listeners (`child_added`, `child_changed`, `child_removed`). |
| `getProductsArray(productsObject, sortedIds)` | Chuyen object thanh array da sap xep. |
| `saveCartSnapshot(database, snapshot)` | Luu snapshot gio hang vao `cartHistory/`. |
| `getCartSnapshot(database, snapshotId)` | Tai 1 snapshot theo ID. |
| `getAllCartSnapshots(database)` | Tai toan bo snapshots (sap xep moi nhat truoc). |
| `restoreProductsFromSnapshot(database, snapshotProducts, localProductsObject)` | Khoi phuc san pham tu snapshot. |
| `deleteCartSnapshot(database, snapshotId)` | Xoa 1 snapshot. |

### index.html - Cac ham chinh

| Ham | Mo ta |
|-----|-------|
| `loadExcelData()` | Goi TPOS API `ExportFileWithVariantPrice`, parse Excel bang SheetJS, luu vao `productsData[]`. |
| `searchProducts(searchText)` | Tim kiem san pham theo ten/ma, ho tro Vietnamese no-tone, uu tien match trong `[]`. |
| `loadProductDetails(productId)` | Tai chi tiet san pham + template + variants tu TPOS OData API. |
| `addProductToList(product)` | Them san pham vao danh sach order (clean + write Firebase). |
| `updateProductListPreview()` | Render lai danh sach san pham visible. Group theo `ProductTmplId`, sort variants. |
| `updateHiddenProductListPreview()` | Render lai danh sach san pham da an. |
| `changeProductImage(productId)` | Mo modal thay doi hinh anh (4 tab: paste/upload/camera/link). |
| `saveCartAndRefresh()` | Luu gio hang hien tai thanh snapshot va xoa gio. |
| `restoreSnapshot(snapshotId)` | Khoi phuc gio hang tu snapshot (voi option tu dong luu gio cu). |
| `getAuthToken()` / `getValidToken()` | Lay va cache TPOS bearer token qua Cloudflare proxy. |
| `authenticatedFetch(url, options)` | Fetch wrapper voi tu dong retry khi token het han. |
| `sortVariants(variants)` | Sap xep variants theo so (1), (2), (3) hoac size (S, M, L, XL, ...). |
| `cleanProductForFirebase(product)` | Lam sach du lieu san pham truoc khi ghi Firebase. |

### order-list.html - Cac ham chinh

| Ham | Mo ta |
|-----|-------|
| `loadProducts()` | Tai san pham tu Firebase, render grid. |
| `updateProductGrid()` | Render grid voi phan trang, filter visible, merge variants. |
| `mergeProductsByTemplate(products)` | Gop cac variants cung `ProductTmplId` thanh 1 card (tong hop qty). |
| `changePage(direction)` | Chuyen trang grid (-1/+1). |
| `performSearch(keyword)` | Tim kiem san pham trong grid, sync keyword len Firebase. |
| `hideProduct(productId)` / `hideProducts(productIds)` | An 1 hoac nhieu san pham. |
| `deleteProduct(productId)` / `deleteProducts(productIds)` | Xoa 1 hoac nhieu san pham. |
| `refreshProduct(productId)` | Tai lai thong tin san pham tu TPOS API (cap nhat hinh anh, gia). |
| `updateProductQty(productId, change)` | Tang/giam so luong da ban. |
| `updateProductTotalInput(productId, newValue)` | Chinh so luong tong truc tiep. |
| `updateProductOrderedInput(productId, newValue)` | Chinh so luong da dat truc tiep. |
| `setupFirebaseListeners()` | Realtime listeners de sync du lieu giua cac thiet bi. |
| `handleSwipe()` | Xu ly thao tac swipe trai/phai de chuyen trang (touch devices). |
| `loadSettings()` / `applySettings()` | Tai va ap dung cau hinh layout (columns, rows, gap, ...) tu Firebase. |
| `toggleSyncMode()` | Bat/tat sync mode (cho phep chinh sua tu xa). |
| `toggleMergeVariants()` | Bat/tat gop bien the. |
| `toggleHideEditControls()` | An/hien cac nut chinh sua (mode xem cho khach). |

### hidden-products.html - Cac ham chinh

| Ham | Mo ta |
|-----|-------|
| `loadProducts()` | Tai san pham tu Firebase, filter chi san pham `isHidden === true`. |
| `updateProductGrid()` | Render grid san pham da an voi phan trang. |
| `unhideProduct(productId)` / `unhideProducts(productIds)` | Hien lai 1 hoac nhieu san pham. |
| `performSearch(keyword)` | Tim kiem trong danh sach san pham da an. |

### css/modern.css

Design system CSS bao gom:
- **CSS Variables**: Colors (`--primary`, `--success`, ...), spacing, shadows, radius, transitions
- **Sidebar**: Navigation sidebar co the collapse, voi logo, nav items, user info, logout
- **Top bar**: Sticky header voi breadcrumb va action buttons
- **Stats section**: Grid cards thong ke (blue/green/orange/purple gradients)
- **Cards**: Container voi header, body, actions
- **Forms**: Form sections, grid layout, input styling
- **Table**: Inventory table voi hover effects, badges, action buttons
- **Modals**: Overlay modals voi animation (scale + fade)
- **Image system**: Product image hover preview, fullscreen overlay, lazy load placeholder
- **Filters**: Collapsible filter panel voi toggle animation
- **TPOS indicator**: Visual badge cho san pham co TPOS ID
- **Responsive**: Breakpoints tai 768px va 1024px
