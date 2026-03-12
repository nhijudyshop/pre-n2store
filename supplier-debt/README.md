# Supplier Debt - Cong no nha cung cap

## Muc dich
Module bao cao va quan ly cong no nha cung cap (supplier debt). Cho phep:
- Xem bao cao cong no theo ky (no dau ky, phat sinh, thanh toan, no cuoi ky) cho tung nha cung cap.
- Mo rong (expand) tung dong de xem chi tiet cong no, hoa don, chi tiet no theo tab.
- Dang ky thanh toan truc tiep cho nha cung cap (tao AccountPayment tren TPOS).
- Xoa thanh toan da tao (cancel + delete tren TPOS).
- Xem chi tiet hoa don nhap hang (FastPurchaseOrder) trong modal.
- Them/sua ghi chu web (web notes) cho tung but toan, luu tru tren Firebase Firestore voi lich su chinh sua.
- Xuat du lieu ra file CSV (Excel).
- An/hien cot trong bang chinh.
- Loc theo nha cung cap, khoang thoi gian, trang thai no cuoi ky.

## Kien truc & Bo cuc folder
```
supplier-debt/
  index.html          # Trang HTML chinh voi sidebar, bang du lieu, 3 modal
  css/
    styles.css        # CSS rieng cua module (1486 dong)
  js/
    main.js           # Toan bo logic JavaScript (2786 dong)
```

## File Map
| File | Mo ta |
|------|-------|
| `index.html` | Giao dien chinh: sidebar navigation, bo loc (ngay, nha cung cap, hien thi), bang du lieu voi pagination, 3 modal (thanh toan, chinh sua ghi chu, chi tiet hoa don) |
| `js/main.js` | Toan bo logic: CONFIG, State management, API calls den TPOS, rendering bang + detail tabs, payment CRUD, web notes Firebase CRUD, export CSV, pagination, column visibility |
| `css/styles.css` | Style cho filter section, bang du lieu chinh + bang chi tiet, expandable row, modal (payment, note edit, invoice detail), pagination, responsive layout |

## Dependencies

### Shared libs (tu `../shared/`)
| File | Chuc nang |
|------|-----------|
| `shared/js/core-loader.js` | Core loader khoi tao ung dung |
| `shared/esm/compat.js` | ES Module compatibility utilities |
| `shared/js/storage-migration.js` | Migration du lieu localStorage |
| `shared/js/firebase-config.js` | Cau hinh Firebase (cung cap `window.db`) |
| `shared/js/shared-auth-manager.js` | Quan ly xac thuc, kiem tra quyen (`window.authManager`) |
| `shared/js/navigation-modern.js` | Sidebar navigation tu dong generate menu |
| `shared/js/notification-system.js` | He thong thong bao (`window.notificationManager`) |
| `shared/js/shop-config.js` | Cau hinh shop, CompanyId selection |
| `shared/images/logo.jpg` | Logo N2STORE |

### Cross-module references
| File | Module goc | Chuc nang |
|------|-----------|-----------|
| `orders-report/js/core/api-config.js` | orders-report | Cau hinh API base URLs |
| `orders-report/js/core/token-manager.js` | orders-report | Quan ly token TPOS, authenticated fetch voi tu dong refresh (`window.tokenManager`) |
| `balance-history/css/modern.css` | balance-history | CSS base cho layout modern (sidebar, responsive) |

### CDN Libraries
| Library | Version | Chuc nang |
|---------|---------|-----------|
| Lucide Icons | 0.294.0 | Icon SVG (filter, calendar, search, chevron, loader, v.v.) |
| Firebase App Compat | 9.6.1 | Firebase core SDK |
| Firebase Firestore Compat | 9.6.1 | Firestore client SDK |

## Luong du lieu

### 1. Bao cao tong hop (bang chinh)
```
User chon ngay + bo loc
       |
       v
fetchData() --> TPOS OData API: Report/PartnerDebtReport
       |         (qua Cloudflare proxy: chatomni-proxy.nhijudyshop.workers.dev)
       v
State.data[] --> applySupplierFilter() --> State.filteredData[]
       |
       v
renderTable() + calculateTotals() + renderPagination()
```

### 2. Chi tiet mo rong (expand row) - Lazy loading theo tab
```
User click expand (>) hoac tab
       |
       v
toggleRowExpand() / switchDetailTab()
       |
       v  (Lazy load - chi fetch khi tab duoc chon lan dau)
   +---+---+---+
   |           |           |
   v           v           v
Tab "Cong no"  Tab "Hoa don"  Tab "Chi tiet no"
fetchPartner   fetchPartner    fetchPartner
CongNo()       Invoices()      DebtDetails()
   |              |               |
   v              v               v
PartnerDebt    AccountInvoice/  Partner/Credit
ReportDetail   GetInvoicePartner DebitSupplierDetail
```

### 3. Thanh toan (Payment)
```
User click "Thanh toan" --> openPaymentModal()
       |
       v
Nhap thong tin: phuong thuc, so tien, noi dung, ngay
       |
       v
submitPayment()
  Step 1: POST /AccountPayment  (tao payment draft)
  Step 2: POST /AccountPayment/ODataService.ActionPost  (xac nhan payment)
       |
       v
Refresh detail panels + bang tong
```

### 4. Xoa thanh toan (Delete Payment)
```
User click delete icon tren dong thanh toan (CSH/BANK/TK)
       |
       v
handleDeletePayment() --> lookupPaymentIdByDate()
  (Tim payment ID tu GetAccountPaymentList API bang PaymentDate)
       |
       v
deletePayment()
  Step 1: POST /AccountPayment/ODataService.ActionCancel
  Step 2: DELETE /AccountPayment({id})
       |
       v
Refresh congNo tab + bang tong
```

### 5. Ghi chu web (Web Notes)
```
User click edit note icon --> openNoteEditModal()
       |
       v
Nhap ghi chu web (TPOS note chi doc, web note co the sua)
       |
       v
saveNoteEdit() --> WebNotesStore.set()
  - Luu vao Map noi bo (_data)
  - Luu vao localStorage (cache)
  - Luu vao Firestore collection "supplier_debt_notes" doc "notes"
  - Giu lich su (toi da 10 lan chinh sua)
       |
       v
Realtime listener Firestore --> dong bo giua cac tab/may
```

## Ham chinh

### Configuration & State
| Ham / Object | Mo ta |
|--------------|-------|
| `CONFIG` | Hang so cau hinh: API base URLs, endpoint, page sizes, Firebase collection name |
| `State` | Object luu trang thai: data, filteredData, pagination, expandedRows (Map), columnVisibility |
| `DOM` | Lazy getters cho cac DOM element |

### API & Data Fetching
| Ham | Mo ta |
|-----|-------|
| `tposFetch(url, options)` | Wrapper authenticated fetch qua `tokenManager`, tu dong retry khi 401 |
| `fetchData()` | Lay bao cao cong no tong hop tu `Report/PartnerDebtReport` (OData, co paging) |
| `fetchAllSuppliers()` | Lay danh sach tat ca nha cung cap (toi da 1000) de populate dropdown loc |
| `fetchPartnerCongNo(partnerId, page)` | Lay chi tiet cong no tu `Report/PartnerDebtReportDetail` (sap xep theo ngay) |
| `fetchPartnerInfo(partnerId)` | Lay thong tin doanh so nha cung cap tu `partner/GetPartnerRevenueById` |
| `fetchPartnerInvoices(partnerId, page)` | Lay danh sach hoa don tu `AccountInvoice/ODataService.GetInvoicePartner` |
| `fetchPartnerDebtDetails(partnerId, page)` | Lay chi tiet no tu `Partner/CreditDebitSupplierDetail` |

### Rendering
| Ham | Mo ta |
|-----|-------|
| `renderTable()` | Render bang chinh voi expand rows, action buttons, column visibility |
| `renderDetailPanel(partnerId)` | Render panel 3 tabs (Cong no, Hoa don, Chi tiet no) |
| `renderCongNoTab(partnerId)` | Render tab Cong no voi running balance tinh lai, note icons, pagination |
| `renderInvoiceTab(partnerId)` | Render tab Hoa don voi status badges, view detail button |
| `renderDebtTab(partnerId)` | Render tab Chi tiet no voi ngay, chung tu, con no |
| `renderInfoTab(partnerId)` | Render tab Thong tin (ma, ten, doanh so) |
| `renderPagination()` | Render pagination cho bang chinh |
| `renderDetailPageNumbers(...)` | Render page numbers cho pagination trong detail tabs |
| `calculateTotals()` | Tinh va hien thi tong cac cot so tien o footer bang chinh |
| `renderEmptyState()` | Hien thi trang thai trong khi khong co du lieu |

### Payment
| Ham | Mo ta |
|-----|-------|
| `openPaymentModal(partnerId, name, amount)` | Mo modal thanh toan voi so tien mac dinh = no cuoi ky |
| `loadPaymentMethods()` | Lay danh sach phuong thuc thanh toan tu `AccountJournal` (cash/bank) |
| `submitPayment()` | Tao va xac nhan thanh toan (POST + ActionPost) |
| `handleDeletePayment(date, moveName, partnerId)` | Xoa thanh toan: tim ID theo ngay, cancel, delete |
| `deletePayment(paymentId, partnerId)` | Thuc hien ActionCancel + DELETE tren TPOS API |
| `lookupPaymentIdByDate(partnerId, paymentDate)` | Tim payment ID bang cach doi chieu PaymentDate tu GetAccountPaymentList |

### Web Notes (Firebase)
| Ham / Object | Mo ta |
|--------------|-------|
| `WebNotesStore` | Singleton quan ly ghi chu web, dong bo localStorage + Firestore |
| `WebNotesStore.init()` | Khoi tao: load localStorage -> load Firestore -> setup realtime listener |
| `WebNotesStore.get(code, moveName)` | Lay ghi chu theo ma nha cung cap + but toan |
| `WebNotesStore.set(code, moveName, note)` | Luu ghi chu, ghi nhan lich su (toi da 10), dong bo Firestore |
| `WebNotesStore.getHistory(code, moveName)` | Lay lich su chinh sua ghi chu |
| `openNoteEditModal(...)` | Mo modal sua ghi chu voi hien thi note TPOS (chi doc) va note web (co the sua) |
| `saveNoteEdit()` | Luu ghi chu va refresh tab cong no |

### Invoice Detail
| Ham | Mo ta |
|-----|-------|
| `openInvoiceDetailModal(invoiceId)` | Mo modal xem chi tiet hoa don tu `FastPurchaseOrder` API |
| `openInvoiceDetailByMoveName(moveName, partnerId)` | Tim hoa don theo MoveName roi mo chi tiet |
| `renderInvoiceDetailModal(data)` | Render noi dung modal: header (NCC, ngay, phuong thuc), bang san pham, tong tien |

### Permission
| Ham | Mo ta |
|-----|-------|
| `hasSupplierDebtPermission(action)` | Kiem tra quyen theo action: `payment`, `deletePayment`, `editNoteBill`, `editNotePayment` |
| `canEditNoteForMoveName(moveName)` | Xac dinh quyen sua ghi chu dua tren loai but toan (BILL/ vs CSH/BANK/TK/) |

### Column Visibility
| Ham | Mo ta |
|-----|-------|
| `initColumnToggle()` | Khoi tao dropdown an/hien cot, load tu localStorage |
| `toggleColumn(colId, isVisible)` | Bat/tat hien thi cot, luu vao localStorage key `supplierDebt_columnVisibility` |
| `applyColumnVisibility()` | Ap dung trang thai an/hien len DOM (them/xoa class `col-hidden`) |

### Utilities
| Ham | Mo ta |
|-----|-------|
| `formatNumber(num)` | Format so voi dau phan cach hang nghin kieu Viet Nam (vi-VN) |
| `formatNumberWithDots(num)` | Format so voi dau cham phan cach |
| `formatPaymentAmountInput(input)` | Format so tien nhap vao input voi dau cham, giu vi tri con tro |
| `formatDate(date)` | Chuyen Date sang dd/mm/yyyy |
| `formatDateFromISO(isoString)` | Chuyen ISO string sang dd/mm/yyyy |
| `formatDateFromDotNet(dotNetDate)` | Chuyen /Date(timestamp)/ sang dd/mm/yyyy |
| `formatDateTimeFromISO(isoString)` | Chuyen ISO string sang dd/mm/yyyy HH:mm |
| `parseVietnameseDate(dateStr)` | Parse dd/mm/yyyy sang Date object |
| `escapeHtml(text)` | Escape HTML entities |
| `escapeHtmlAttr(text)` | Escape HTML attribute values |
| `exportToExcel()` | Xuat du lieu bang chinh ra file CSV voi BOM UTF-8 |

### Firestore Data
- **Collection**: `supplier_debt_notes`
- **Document**: `notes`
- **Structure**: `{ notes: { "supplierCode_moveName": { note: string, history: [{text, timestamp}] } }, lastUpdated: number }`
- Key format: `{SupplierCode}_{MoveName}` voi `/` trong MoveName duoc thay bang `-` (vd: `NCC001_BILL-2026-0485`)
