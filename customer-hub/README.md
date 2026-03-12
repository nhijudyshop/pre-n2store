# Customer Hub - Customer 360 Hub (Trung tam Khach hang)

## Muc dich

Module "Customer 360 Hub" cung cap giao dien quan ly khach hang toan dien cho N2Store. Cho phep nhan vien tim kiem, xem ho so chi tiet (Customer 360), quan ly vi khach hang (nap/rut/cong no ao), theo doi hoat dong giao dich, va lien ket giao dich ngan hang chua duoc ghep noi. Giao dien ho tro dark mode, phan quyen chi tiet theo tung chuc nang, va tich hop TPOS OData API de tra cuu khach hang tu he thong POS.

## Kien truc & Bo cuc folder

```
customer-hub/
  index.html                  # Trang chinh - SPA voi tab navigation va modal
  config.js                   # Cau hinh API endpoint (TPOS proxy URL)
  build-css.js                # Script build Tailwind CSS (PostCSS + Autoprefixer)
  postcss.config.js           # Cau hinh PostCSS
  tailwind.config.js          # Cau hinh Tailwind CSS (theme, colors, fonts)
  favicon.svg                 # Icon trang (chu "N" tren nen xanh)
  styles/
    input.css                 # Tailwind source CSS + custom styles (alias tags, scrollbar)
    tailwind.css              # Output CSS (generated, ~2100 dong)
  js/
    main.js                   # Entry point - routing, theme toggle, modal, permissions
    api-service.js            # ES module wrapper - re-export window.ApiService
    utils/
      permissions.js          # PermissionHelper class - kiem tra quyen truy cap
    modules/
      customer-search.js      # Module tim kiem & danh sach khach hang
      customer-profile.js     # Module ho so khach hang 360 (modal)
      wallet-panel.js         # Module quan ly vi khach hang (so du, nap/rut)
      ticket-list.js          # Module danh sach ticket cua khach hang
      transaction-activity.js # Module hoat dong giao dich tong hop
      link-bank-transaction.js # Module lien ket giao dich ngan hang
```

## File Map

| File | Mo ta |
|------|-------|
| `index.html` | Trang SPA chinh voi sidebar navigation, 3 tab (Tim kiem / Hoat dong giao dich / Giao dich chua lien ket), customer profile modal overlay, va cac script dependencies |
| `config.js` | Dinh nghia `API_CONFIG.TPOS_ODATA` tro den Cloudflare Worker proxy (`chatomni-proxy.nhijudyshop.workers.dev/api/odata`) |
| `build-css.js` | Node.js script doc `styles/input.css`, chay qua PostCSS + Tailwind + Autoprefixer, xuat ra `styles/tailwind.css` |
| `postcss.config.js` | Cau hinh PostCSS voi plugin `@tailwindcss/postcss` va `autoprefixer` |
| `tailwind.config.js` | Cau hinh Tailwind voi dark mode (`class`), custom colors (primary, success, danger, warning, surface, border), font Inter + JetBrains Mono, custom shadows (soft, card, modal, glow) |
| `favicon.svg` | SVG icon - chu "N" trang tren nen xanh (#007bff) voi bo tron |
| `styles/input.css` | Tailwind directives + custom CSS: alias tags (.alias-tag, .alias-tag.primary), scrollbar styling, Material Symbols config, active sidebar link |
| `styles/tailwind.css` | File CSS da build - output cua Tailwind CSS v3.4.19 (khong can chinh sua truc tiep) |
| `js/main.js` | Entry point ES module: doc permissions tu `loginindex_auth`, khoi tao theme toggle, dinh nghia hash-based routing, quan ly customer profile modal (open/close), cap nhat badge so giao dich chua lien ket |
| `js/api-service.js` | Wrapper 1 dong - re-export `window.ApiService` (duoc load tu `shared/js/api-service.js` qua script tag) de dung nhu ES module import |
| `js/utils/permissions.js` | Class `PermissionHelper`: `hasPageAccess(pageId)` kiem tra co it nhat 1 quyen true, `hasPermission(pageId, key)` kiem tra quyen cu the, `getAccessiblePages(registry)` loc danh sach trang duoc phep |
| `js/modules/customer-search.js` | Module tim kiem khach hang: bang danh sach voi infinite scroll, bo loc (SĐT/Ten/Email, trang thai), tich hop TPOS lookup (modal chon va luu KH tu TPOS), hien thi so du vi (batch enrichment), nut tao KH moi (qua `window.CustomerCreator`) |
| `js/modules/customer-profile.js` | Module ho so 360: layout 3 cot (Vi + Ghi chu | Tickets + Activities | RFM Analysis), hien thi header voi ten/SDT/dia chi/aliases, TPOS fallback khi V2 API khong co du lieu, popup chi tiet don hang tu TPOS OData, quan ly alias (them/xoa ten tham khao), audit logging |
| `js/modules/wallet-panel.js` | Module vi khach hang: hien thi so du kha dung (tien that + cong no ao), cac nut Nap tien/Rut tien/Cap cong no ao (voi modal nhap so tien + ghi chu), lich su giao dich vi, SSE realtime updates, toast notification khi co giao dich moi |
| `js/modules/ticket-list.js` | Module danh sach ticket: subscribe realtime qua `apiService.subscribeToTickets`, hien thi toi da 5 ticket gan nhat voi trang thai (Mo/Cho xu ly/Dang xu ly/Da giai quyet/Da dong/Da huy), nut tao moi (neu co quyen) |
| `js/modules/transaction-activity.js` | Module hoat dong giao dich tong hop: bang giao dich voi bo loc (loai su kien, khoang ngay, search), pagination, ho tro nhieu loai giao dich (DEPOSIT, WITHDRAW, VIRTUAL_CREDIT, ORDER_CREATED, BOOM...), nut xuat CSV |
| `js/modules/link-bank-transaction.js` | Module lien ket giao dich ngan hang: hien thi giao dich chua ghep noi, modal lien ket (nhap SDT khach hang + tu dong nap vi), bo loc ngay, pagination, callback cap nhat badge count |

## Dependencies

### Shared Libs (trong project)
- `../shared/js/api-service.js` - ApiService chinh (RENDER_API_URL, methods: searchCustomers, getCustomer360, getWallet, walletDeposit, walletWithdraw, issueVirtualCredit, getUnlinkedBankTransactions, linkBankTransaction, getConsolidatedTransactions...)
- `../shared/js/tpos-customer-lookup.js` - Ham `window.fetchTPOSCustomer(phone)` tra cuu khach hang tren TPOS
- `../shared/js/customer-creator.js` - Module `window.CustomerCreator.open()` tao khach hang moi
- `../shared/js/audit-logger.esm.js` - Ham `logAction()` ghi nhan thao tac audit
- `../shared/js/audit-logger.js` - Audit logger (script tag)
- `../shared/js/firebase-config.js` - Cau hinh Firebase
- `../shared/js/shop-config.js` - ShopConfig (chon Company)
- `../shared/js/navigation-modern.js` - Sidebar navigation tu dong
- `../shared/esm/compat.js` - Shared auth utilities (authManager, notificationManager)
- `../shared/js/shared-auth-manager.js` - Fallback auth cho file:// protocol
- `../orders-report/js/core/token-manager.js` - TokenManager cho TPOS authentication
- `../inventory-tracking/css/modern.css` - CSS chung cho sidebar/navigation

### CDN Libraries
- **Firebase SDK** v10.7.1 (firebase-app-compat, firebase-firestore-compat)
- **Google Fonts**: Inter (300-700), Material Symbols Outlined
- **Lucide Icons** v0.294.0 (UMD) - dung cho sidebar icons
- **Tailwind CSS** v3.4.19 (pre-built, khong dung CDN runtime)

### Cross-module References
- Dung `tokenManager` tu `orders-report/js/core/token-manager.js` de lay TPOS bearer token
- Dung `window.fetchTPOSCustomer` tu `shared/js/tpos-customer-lookup.js`
- Dung `window.CustomerCreator` tu `shared/js/customer-creator.js`
- CSS layout sidebar tu `inventory-tracking/css/modern.css`

## Luong du lieu

```
User tuong tac (tab/search/click)
        |
        v
  main.js (hash-based router)
        |
        +-- #customer-search --> CustomerSearchModule
        |       |
        |       +-- apiService.getRecentCustomers() / searchCustomers()
        |       +-- apiService.getWalletBatch(phones) --> enrich so du vi
        |       +-- window.fetchTPOSCustomer(phone) --> TPOS lookup (modal)
        |       +-- apiService.upsertCustomer() --> luu KH tu TPOS
        |       +-- window.CustomerCreator.open() --> tao KH moi
        |
        +-- #customer/[phone] --> openCustomerModal(phone)
        |       |
        |       +-- CustomerProfileModule.render(phone)
        |       |       +-- apiService.getCustomer360(phone) --> V2 API
        |       |       +-- fallback: fetchTPOSCustomer(phone) --> TPOS
        |       |       +-- WalletPanelModule.render(phone)
        |       |       |       +-- apiService.getWallet(phone)
        |       |       |       +-- SSE realtime: /api/realtime/sse?keys=wallet:{phone}
        |       |       |       +-- walletDeposit / walletWithdraw / issueVirtualCredit
        |       |       +-- _renderTicketsCard (recent tickets)
        |       |       +-- _renderRFMCard (phan tich RFM)
        |       |       +-- _renderNotesSection + addCustomerNote
        |       |       +-- _showOrderDetailPopup --> TPOS OData (FastSaleOrder)
        |       |       +-- Alias management (add/remove qua /api/sepay/customer/{phone}/alias)
        |
        +-- #transaction-activity --> TransactionActivityModule
        |       +-- apiService.getConsolidatedTransactions(page, limit, filters)
        |
        +-- #unlinked-transactions --> LinkBankTransactionModule
                +-- apiService.getUnlinkedBankTransactions(page, limit)
                +-- apiService.linkBankTransaction(id, phone, autoDeposit)
                +-- callback: updateUnlinkedBadge()
```

### API Endpoints su dung

| Endpoint | Module | Mo ta |
|----------|--------|-------|
| `GET /v2/customers/recent` | CustomerSearch | Lay danh sach KH gan day |
| `GET /v2/customers/search` | CustomerSearch | Tim kiem KH theo ten/SDT/email |
| `GET /v2/customers/:phone/360` | CustomerProfile | Lay du lieu Customer 360 |
| `POST /v2/customers/upsert` | CustomerSearch | Tao/cap nhat KH |
| `GET /v2/wallets/:phone` | WalletPanel | Lay thong tin vi |
| `POST /v2/wallets/:phone/deposit` | WalletPanel | Nap tien vao vi |
| `POST /v2/wallets/:phone/withdraw` | WalletPanel | Rut tien tu vi |
| `POST /v2/wallets/:phone/virtual-credit` | WalletPanel | Cap cong no ao |
| `GET /v2/wallets/:phone/transactions` | WalletPanel | Lich su giao dich vi |
| `GET /v2/wallets/batch` | CustomerSearch | Lay so du vi nhieu KH |
| `GET /v2/transactions/consolidated` | TransactionActivity | Giao dich tong hop |
| `GET /v2/transactions/unlinked` | LinkBankTransaction | Giao dich ngan hang chua lien ket |
| `POST /v2/transactions/:id/link` | LinkBankTransaction | Lien ket giao dich voi KH |
| `POST /api/sepay/customer/:phone/alias` | CustomerProfile | Them alias |
| `DELETE /api/sepay/customer/:phone/alias` | CustomerProfile | Xoa alias |
| `GET /api/realtime/sse` | WalletPanel | SSE realtime wallet updates |
| TPOS OData `FastSaleOrder(id)` | CustomerProfile | Chi tiet don hang tu TPOS |
| TPOS OData (via proxy) | CustomerSearch | Tra cuu KH tren TPOS |

## Ham chinh

### main.js
| Ham | Mo ta |
|-----|-------|
| `handleHashChange()` | Router: phan tich URL hash va render module tuong ung |
| `loadModule(name, containerId)` | Factory tao instance module theo ten |
| `openCustomerModal(phone)` | Mo modal ho so khach hang 360 |
| `closeCustomerModal()` | Dong modal ho so |
| `updateUnlinkedBadge()` | Cap nhat badge so giao dich chua lien ket tren tab |
| `setActiveTabLink(tabId)` | Doi style tab dang active |

### CustomerSearchModule
| Ham | Mo ta |
|-----|-------|
| `initUI()` | Render giao dien: search bar + bo loc + bang + pagination |
| `loadRecentCustomers()` | Tai danh sach khach hang gan day tu API |
| `performSearch()` | Tim kiem KH: goi V2 API + TPOS lookup (neu la SDT >= 10 so) |
| `loadMore()` | Infinite scroll - tai them trang tiep theo |
| `enrichCustomersWithWallet(customers)` | Batch load so du vi cho danh sach KH |
| `_showTPOSSelectionModal(customers)` | Hien modal chon KH tim thay tren TPOS |
| `_saveTPOSCustomer(customer, btn)` | Luu KH tu TPOS vao he thong V2 |
| `getStatusBadge(status)` | Render badge trang thai (Binh thuong/Bom hang/Canh bao/VIP) |
| `formatDebt(balance, virtual, real)` | Format hien thi so du vi (kha dung / ao / that) |

### CustomerProfileModule
| Ham | Mo ta |
|-----|-------|
| `render(phone)` | Tai va render toan bo ho so 360: header, RFM, tickets, notes, wallet |
| `_tryTPOSFallback(phone)` | Fallback tra cuu TPOS khi V2 API khong co du lieu |
| `_renderHeader(customer)` | Render header modal: ten, ID, SDT, dia chi |
| `_renderAliasesSection(customer)` | Render danh sach ten tham khao (aliases) voi nut them/xoa |
| `_renderRFMCard(customer)` | Render the phan tich RFM: diem tong, recency, frequency, monetary, xu huong |
| `_renderTicketsCard(tickets, activities)` | Render bang tickets + hoat dong vi gan day |
| `_renderNotesSection(notes)` | Render danh sach ghi chu noi bo + form them ghi chu |
| `_showOrderDetailPopup(orderId)` | Popup chi tiet don hang tu TPOS OData (san pham, gia, COD) |
| `_addCustomerNote(content)` | Them ghi chu cho KH + audit logging |

### WalletPanelModule
| Ham | Mo ta |
|-----|-------|
| `render(phone)` | Kiem tra quyen `viewWallet`, tai va hien thi thong tin vi |
| `loadWalletDetails()` | Goi API lay du lieu vi + render |
| `renderWallet(wallet)` | Hien thi so du (tien that + cong no ao), cac nut thao tac |
| `_showActionModal(action)` | Modal nap tien / rut tien / cap cong no ao (voi validation va audit log) |
| `_showTransactionHistory()` | Modal lich su 50 giao dich vi gan nhat |
| `subscribeToRealtimeUpdates()` | Ket noi SSE de nhan cap nhat vi realtime |
| `_showNotification(tx)` | Toast notification khi co giao dich moi |
| `closeSSE()` / `destroy()` | Dong ket noi SSE va don dep |

### TransactionActivityModule
| Ham | Mo ta |
|-----|-------|
| `initUI()` | Render giao dien: bo loc (loai, ngay, search) + bang giao dich + pagination |
| `loadTransactions()` | Tai giao dich tong hop tu API voi filters |
| `renderTransactions(transactions)` | Render bang: thoi gian, KH, loai, mo ta, so tien, trang thai |
| `getEventTypeInfo(type)` | Map loai giao dich sang icon + text tieng Viet |
| `formatAmount(amount)` | Format so tien voi mau +xanh / -do |
| `updatePagination(total)` | Render thanh pagination voi prev/next + so trang |

### LinkBankTransactionModule
| Ham | Mo ta |
|-----|-------|
| `initUI()` | Render giao dien: header + bo loc + bang + modal lien ket |
| `loadUnlinkedTransactions()` | Tai giao dich ngan hang chua duoc ghep noi |
| `renderTransactions(transactions)` | Render bang: ngay, ma NH, so tien, noi dung, nut lien ket |
| `showModal(transactionData)` | Mo modal lien ket: hien chi tiet GD + input SDT + checkbox tu dong nap |
| `confirmLinkTransaction()` | Goi API lien ket GD voi KH + callback cap nhat badge |

### PermissionHelper
| Ham | Mo ta |
|-----|-------|
| `hasPageAccess(pageId)` | Kiem tra user co it nhat 1 quyen true trong page |
| `hasPermission(pageId, permKey)` | Kiem tra 1 quyen cu the (vd: `viewWallet`, `manageWallet`, `editCustomer`, `addNote`, `viewActivities`, `linkTransactions`, `viewTickets`, `createTicket`) |
| `getAccessiblePages(registry)` | Loc danh sach trang user duoc phep truy cap |
