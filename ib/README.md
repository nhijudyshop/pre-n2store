# IB Module - Check Inbox Khach Hang (Check Inbox Khach Hang)

## Muc dich

Module quan ly inbox khach hang (Customer Inbox Management). Cho phep nhan vien:
- Them moi inbox voi hinh anh san pham va hinh anh khach hang
- Phan loai san pham theo danh muc: Ao, Quan, Set va Dam, Phu kien & Giay dep (PKGD)
- Xem danh sach inbox dang bang voi bo loc theo phan loai
- Xoa inbox (co kiem tra quyen)
- Upload hinh anh qua 3 phuong thuc: Copy Paste (clipboard), chon File, hoac nhap Link URL
- Hien thi thong ke tong hop (tong inbox, so luong theo loai)

Du lieu luu tru tren Firestore collection `ib`, hinh anh luu tren Firebase Storage tai duong dan `ib/sp/` (san pham) va `ib/kh/` (khach hang).

## Kien truc & Bo cuc folder

```
ib/
├── index.html              # Trang chinh - giao dien Check Inbox
├── css/
│   └── modern.css          # Design system hoan chinh (CSS custom properties)
├── js/
│   ├── config.js           # Cau hinh ung dung (cache, performance, categories, UI)
│   ├── utils.js            # CacheManager + Utils class (helper functions)
│   ├── ui.js               # UIManager - thong bao, image hover/overlay, stats
│   ├── image-handler.js    # ImageHandler - xu ly clipboard, upload hinh anh
│   ├── form-handler.js     # FormHandler - quan ly form nhap lieu
│   ├── table-manager.js    # TableManager - CRUD Firestore, render bang, filter
│   └── main.js             # InboxApp - khoi tao ung dung, event listeners
└── README.md
```

## File Map

| File | Mo ta |
|------|-------|
| `index.html` | Trang HTML chinh. Chua sidebar navigation, top bar, stats cards (4 card), form nhap inbox (an mac dinh), bang danh sach inbox, image hover overlay. Load shared modules va local JS theo thu tu phu thuoc. |
| `css/modern.css` | Design system day du voi CSS custom properties (colors, shadows, spacing, radius, transitions). Bao gom styles cho sidebar, top bar, buttons, stats cards, cards, forms, table, image overlay, tooltip. Responsive cho 3 breakpoints (1024px, 768px, 480px). Ho tro `prefers-reduced-motion` va `focus-visible`. |
| `js/config.js` | Dinh nghia `CONFIG` global object voi cac nhom: `firebase` (tu shared config), `cache` (expiry 24h, batchSize 50, maxVisibleRows 500), `performance` (image compression maxWidth 800, quality 0.85), `categories` (ALL, Ao, Quan, Set va Dam, PKGD), `storage` (authKey), `ui` (animation/toast/hover delays). Export `STORAGE_METADATA` cho Firebase Storage. |
| `js/utils.js` | **CacheManager** class: cache du lieu vao `localStorage` key `ib_cache` voi TTL 24h. Cac method: `getCachedData()`, `setCachedData()`, `invalidateCache()`, `getCacheStatus()`. **Utils** class (static methods): `formatDate()`, `generateUniqueFileName()`, `debounce()`, `throttle()` (delegate sang shared), `compressImage()` (canvas-based resize + quality), `isValidImageUrl()`, `isMobile()`, `getOptimalImageSize()`, `escapeHtml()`, `createElement()`, `isInViewport()`, `scrollToElement()`, `measurePerformance()`, `safeJsonParse()`, `formatFileSize()`. |
| `js/ui.js` | **UIManager** class: Quan ly notifications (delegate sang shared `NotificationManager`), image hover preview (hien anh lon khi hover, tu dong dinh vi tranh tran viewport), full-screen image overlay (click de xem anh toan man hinh), animations (fadeIn/fadeOut), stats update (dem theo phanLoai roi cap nhat DOM). Export global functions tuong thich nguoc: `showLoading`, `showSuccess`, `showError`, `hideFloatingAlert`. |
| `js/image-handler.js` | **ImageHandler** class: Xu ly 3 luong nhap hinh anh cho ca san pham (SP) va khach hang (KH). (1) Clipboard paste: bat `paste` event, kiem tra URL text truoc, neu khong thi doc image blob tu clipboard, nen anh qua `Utils.compressImage()`. (2) File upload: nen tung file roi upload len Firebase Storage `ib/sp/` hoac `ib/kh/`, hien thi progress. (3) URL paste: luu URL truc tiep, khong upload. Sau khi co anh SP, tu dong chuyen sang xu ly anh KH qua `handleCustomerData()`. Method `clearData()` don dep blob URLs de giai phong memory. |
| `js/form-handler.js` | **FormHandler** class: Toggle hien/an form (kiem tra quyen `ib`), quan ly radio buttons de chuyen doi giua clipboard/file/link container, validate form (phanLoai + tenSanPham bat buoc), xu ly submit (goi tuong ung ImageHandler method), clear/reset form, cap nhat quyen form (an form neu user khong co quyen `ib`). Khoi tao filter category voi debounce. |
| `js/table-manager.js` | **TableManager** class: Core CRUD module. `initializeFirebase()` ket noi Firestore collection `ib` va `edit_history`. `loadData()` doc tu cache truoc, fallback sang Firestore doc `ib/ib`. `renderDataToTable()` render toan bo bang, cap nhat cache va stats. `uploadToFirestore()` them item moi vao dau mang (unshift). `performDelete()` xoa item theo ID tu mang trong Firestore doc. `applyCategoryFilter()` loc bang theo phan loai. `migrateExistingData()` them ID cho items cu chua co. `logAction()` ghi log vao collection `edit_history`. Kiem tra quyen xoa qua `detailedPermissions.ib.delete`. |
| `js/main.js` | **InboxApp** class: Entry point. Kiem tra authentication (redirect ve `../index.html` neu chua dang nhap), khoi tao performance monitoring (memory check moi phut), setup global event listeners (refresh, online/offline, visibility change, keyboard shortcuts Ctrl+R/Ctrl+N/Esc), khoi tao data voi migration. Export `window.inboxDebug` interface de debug (getStatus, clearCache, refreshData, cleanup, reloadIcons). |

## Dependencies

### Shared Modules (tu `../shared/`)
- `shared/esm/compat.js` - ES Module compatibility layer
- `shared/js/shared-auth-manager.js` - Authentication manager (`authManager` global), kiem tra dang nhap, quan ly quyen
- `shared/js/navigation-modern.js` - Sidebar navigation auto-generation
- `shared/js/firebase-config.js` - Firebase configuration (`FIREBASE_CONFIG` global)
- `shared/js/permissions-helper.js` - `PermissionHelper` class, kiem tra quyen truy cap trang va thao tac

### CDN Libraries
- **Lucide Icons** v0.294.0 (`unpkg.com/lucide@0.294.0`) - Icon system, goi `lucide.createIcons()` sau moi thay doi DOM
- **Firebase App Compat** v9.6.1 - Firebase core
- **Firebase Storage Compat** v9.6.1 - Upload/download hinh anh
- **Firebase Firestore Compat** v9.6.1 - Luu tru du lieu inbox

### Cross-module References
- `NotificationManager` - Tu shared notification system, dung cho toast/loading notifications
- `authManager` - Global instance tu shared auth, dung khap noi de kiem tra quyen
- `PermissionHelper` - Kiem tra `canAccessPage('ib')` va `detailedPermissions.ib.delete/edit`

## Luong du lieu

### Luong them Inbox moi
```
User nhap form (phanLoai, tenSanPham, hinh anh SP + KH)
    │
    ▼
FormHandler.handleFormSubmit()
    ├── Validate form data (phanLoai, tenSanPham bat buoc)
    ├── Kiem tra quyen: authManager.hasDetailedPermission('ib', 'edit')
    │
    ▼
FormHandler.processFormData() → Xac dinh loai input (clipboard/file/link)
    │
    ▼
ImageHandler (xu ly hinh SP truoc)
    ├── uploadProductClipboard() → Upload blob len Firebase Storage ib/sp/
    ├── uploadProductFiles()     → Compress + upload files len Firebase Storage ib/sp/
    └── processLinkInput()       → Luu URL truc tiep (khong upload)
    │
    ▼
ImageHandler.handleCustomerData() (tu dong chuyen sang hinh KH)
    ├── uploadCustomerClipboard() → Upload blob len Firebase Storage ib/kh/
    └── uploadCustomerFiles()     → Compress + upload files len Firebase Storage ib/kh/
    │
    ▼
TableManager.uploadToFirestore()
    ├── Doc Firestore doc ib/ib
    ├── Unshift item moi vao dau mang data[]
    ├── Update Firestore doc
    ├── Log action vao collection edit_history
    ├── Update localStorage cache (unshift)
    └── Goi addProductToTable() de them row vao dau bang
```

### Luong tai du lieu
```
InboxApp.init()
    │
    ▼
TableManager.initializeWithMigration()
    ├── migrateExistingData() → Them ID cho items cu
    │
    ▼
TableManager.loadData()
    ├── Kiem tra localStorage cache (key: ib_cache, TTL: 24h)
    │   ├── Co cache hop le → renderDataToTable(cachedData)
    │   └── Khong co cache  → Doc Firestore doc ib/ib
    │                          └── renderDataToTable(data.data)
    │                          └── Luu vao cache
    │
    ▼
renderDataToTable()
    ├── Tao tung row voi: STT, thoi gian, phan loai, hinh SP, ten SP, hinh KH, nut xoa
    ├── Lazy load images (loading="lazy")
    ├── Cap nhat cache
    └── UIManager.updateStats() → Cap nhat 4 stat cards
```

### Luong xoa Inbox
```
User click nut Xoa
    │
    ▼
TableManager.deleteRow()
    ├── Kiem tra quyen: detailedPermissions.ib.delete
    ├── Hien confirm dialog
    │
    ▼
TableManager.performDelete()
    ├── Doc Firestore doc ib/ib
    ├── Tim item theo ID trong mang data[]
    ├── Splice item ra khoi mang
    ├── Update Firestore doc
    ├── Log action vao edit_history
    ├── Cap nhat cache
    ├── Xoa row khoi DOM
    └── Cap nhat stats
```

## Ham chinh

### InboxApp (main.js)
| Ham | Mo ta |
|-----|-------|
| `init()` | Khoi tao toan bo ung dung: auth check, UI update, performance monitoring, event listeners, load data |
| `checkAuthentication()` | Kiem tra dang nhap, redirect neu chua auth |
| `setupGlobalEventListeners()` | Dang ky: refresh button, error handler, beforeunload, visibility change, online/offline, keyboard shortcuts |
| `handleKeyboardShortcuts(e)` | Ctrl+R = refresh, Ctrl+N = toggle form, Esc = dong modal |
| `cleanupMemory()` | Don cache lon, revoke blob URLs, trigger GC |

### TableManager (table-manager.js)
| Ham | Mo ta |
|-----|-------|
| `loadData()` | Doc du lieu tu cache hoac Firestore, render bang |
| `renderDataToTable(dataArray)` | Render toan bo bang tu mang du lieu, cap nhat cache + stats |
| `uploadToFirestore(formData)` | Them inbox moi vao Firestore (unshift vao dau mang) |
| `performDelete(row, button, itemId)` | Xoa item tu Firestore va cap nhat UI |
| `applyCategoryFilter()` | Loc bang theo phan loai, cap nhat STT |
| `migrateExistingData()` | Migration: them ID cho items cu chua co ID |
| `logAction(action, description, oldData, newData)` | Ghi log thao tac vao collection edit_history |

### ImageHandler (image-handler.js)
| Ham | Mo ta |
|-----|-------|
| `handleSPPaste(e)` | Xu ly paste clipboard cho hinh san pham |
| `handleKHPaste(e)` | Xu ly paste clipboard cho hinh khach hang |
| `uploadProductFiles(files, formData)` | Compress + upload nhieu file SP len Firebase Storage |
| `uploadProductClipboard(formData)` | Upload hinh tu clipboard (blob hoac URL) len Storage |
| `uploadCustomerFiles(files, formData)` | Compress + upload nhieu file KH len Firebase Storage |
| `handleCustomerData(formData)` | Dispatcher: chon phuong thuc upload KH (clipboard/file) |
| `clearData()` | Xoa het du lieu hinh, revoke blob URLs, reset file inputs |

### FormHandler (form-handler.js)
| Ham | Mo ta |
|-----|-------|
| `toggleForm()` | Hien/an form nhap lieu (kiem tra quyen ib) |
| `handleFormSubmit(e)` | Validate + xu ly submit form |
| `validateAndGetFormData()` | Trich xuat va validate du lieu form |
| `processFormData(formData)` | Dispatch xu ly theo loai input (clipboard/file/link) |
| `clearForm()` | Reset toan bo form ve trang thai mac dinh |
| `updateFormPermissions()` | An form neu user khong co quyen |

### UIManager (ui.js)
| Ham | Mo ta |
|-----|-------|
| `showLoading/showSuccess/showError/showWarning` | Hien thi thong bao tuong ung |
| `showImageHover(imageSrc, event)` | Hien preview anh khi hover (tu dong dinh vi) |
| `showImageOverlay(imageSrc)` | Hien anh toan man hinh khi click |
| `updateStats(data)` | Dem va cap nhat 4 stat cards (tong, ao, quan, khac) |
| `animateIn(element, animation)` | Them hieu ung animation cho element |

### CacheManager (utils.js)
| Ham | Mo ta |
|-----|-------|
| `getCachedData()` | Doc cache tu localStorage, tra ve null neu het han |
| `setCachedData(data)` | Luu data + timestamp vao localStorage |
| `invalidateCache()` | Xoa cache |
| `getCacheStatus()` | Tra ve trang thai cache: valid, age, expiresIn |

## Firestore Data Structure

```
Collection: ib
  └── Document: ib
        └── Field: data (Array)
              └── Each item:
                    {
                      id: "1709123456789_abc123def",
                      cellShow: true,
                      phanLoai: "Ao" | "Quan" | "Set va Dam" | "PKGD",
                      tenSanPham: "Ten san pham",
                      thoiGianUpload: "25/02/2025, 09:21",
                      sp: ["https://firebasestorage.../ib/sp/..."],
                      kh: ["https://firebasestorage.../ib/kh/..."],
                      user: "admin"
                    }

Collection: edit_history
  └── Auto-generated documents (log entries)
        {
          timestamp: Timestamp,
          user: "admin",
          page: "Check Inbox Khach Hang",
          action: "add" | "delete",
          description: "...",
          oldData: {...} | null,
          newData: {...} | null,
          id: "..."
        }
```

## Firebase Storage Structure

```
ib/
├── sp/    # Hinh anh san pham (product images)
│   └── <unique-filename>.png
└── kh/    # Hinh anh khach hang (customer images)
    └── <unique-filename>.png
```

## Permission System

Module su dung 2 cap quyen:
1. **Page-level**: `authManager.hasPagePermission('ib')` - Quyen truy cap trang, hien/an form
2. **Detail-level**: `authManager.hasDetailedPermission('ib', 'edit')` - Quyen them inbox
3. **Detail-level**: `detailedPermissions.ib.delete` - Quyen xoa inbox

Neu user khong co quyen `ib`, form va nut "Them Inbox" se bi an hoan toan.
