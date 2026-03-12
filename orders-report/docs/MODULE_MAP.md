# orders-report MODULE MAP

> **AI Agent: ĐỌC FILE NÀY TRƯỚC KHI LÀM BẤT KỲ TASK NÀO!**
>
> File này là bản đồ để AI Agent navigation trong codebase lớn (~73,000 lines).
> Thay vì đọc toàn bộ code, hãy đọc file này trước để xác định section cần sửa.
>
> **Related docs:**
> - [ARCHITECTURE.md](ARCHITECTURE.md) - Chi tiết kỹ thuật, API reference, flow diagrams
> - [.ai-instructions.md](.ai-instructions.md) - Workflow và quy tắc cho AI Agent

---

## THỐNG KÊ TỔNG QUAN

| Metric | Value |
|--------|-------|
| **Tổng số dòng code** | ~73,000 lines |
| **File lớn nhất** | tab1-orders.js (25,975 lines) |
| **Số file JS** | 39 files |
| **Số file HTML** | 5 files |

---

## FILE STRUCTURE OVERVIEW

```
orders-report/
├── main.html ..................... Tab container & navigation (837 lines)
├── tab1-orders.html .............. Orders UI template (6,341 lines)
├── tab1-orders.js ................ Orders logic - FILE LỚN NHẤT (25,975 lines)
├── tab2-statistics.html .......... Statistics tab (1,470 lines)
├── tab3-product-assignment.html .. Product assignment UI (707 lines)
├── tab3-product-assignment.js .... Product assignment logic (6,309 lines)
├── tab-overview.html ............. Overview dashboard (8,806 lines)
│
├── [MANAGERS - Business Logic]
│   ├── pancake-data-manager.js ... Pancake API integration (2,118 lines)
│   ├── pancake-token-manager.js .. JWT token management (1,054 lines)
│   ├── message-template-manager.js Bulk messaging (2,161 lines)
│   ├── kpi-manager.js ............ KPI calculation (778 lines)
│   ├── quick-reply-manager.js .... Quick reply templates (1,591 lines)
│   └── dropped-products-manager.js Dropped products (1,296 lines)
│
├── [UI COMPONENTS]
│   ├── chat-products-ui.js ....... Chat products UI (887 lines)
│   ├── chat-products-actions.js .. Chat products actions (685 lines)
│   ├── comment-modal.js .......... Comment modal (890 lines)
│   ├── discount-stats-ui.js ...... Discount stats UI (1,340 lines)
│   ├── kpi-statistics-ui.js ...... KPI stats UI (739 lines)
│   └── notification-system.js .... Toast notifications (649 lines)
│
├── [UTILITIES]
│   ├── api-config.js ............. API configuration (250 lines)
│   ├── api-handler.js ............ API request handler (196 lines)
│   ├── auth.js ................... Authentication (224 lines)
│   ├── cache.js .................. Caching layer (196 lines)
│   ├── config.js ................. Firebase config (83 lines)
│   ├── token-manager.js .......... TPOS token manager (513 lines)
│   └── realtime-manager.js ....... WebSocket/SSE realtime (495 lines)
│
└── [STYLES]
    └── modern.css ................ Modern UI styles
```

---

## tab1-orders.js - SECTION MAP (25,975 lines)

### HƯỚNG DẪN ĐỌC FILE LỚN

**QUAN TRỌNG:** File này quá lớn để đọc toàn bộ. Sử dụng line ranges dưới đây:

```javascript
// Để đọc section cụ thể trong Claude Code:
Read file_path with offset=START_LINE and limit=LINE_COUNT
```

### SECTION INDEX

| # | Section | Lines | Search Key | Mô tả |
|---|---------|-------|------------|-------|
| 1 | GLOBAL VARIABLES | 119-239 | `#GLOBAL` | State, constants, global vars |
| 2 | FIREBASE & REALTIME | 240-710 | `#FIREBASE` | Firebase init, tag sync, realtime |
| 3 | INITIALIZATION | 711-1236 | `#INIT` | DOMContentLoaded, auto-load |
| 4 | EMPLOYEE RANGE | 1237-1626 | `#EMPLOYEE` | Employee STT range management |
| 5 | TAG MANAGEMENT | 1627-2665 | `#TAG` | CRUD tags, quick assign |
| 6 | BULK TAG | 2666-5037 | `#BULK-TAG` | Bulk tag assignment modal |
| 7 | SEARCH & FILTER | 5038-6863 | `#SEARCH` | Table search, merge by phone |
| 8 | TABLE RENDERING | 6864-7507 | `#RENDER` | renderTable(), createRowHTML() |
| 9 | MERGED COLUMNS | 7508-8220 | `#MERGED` | Merged order columns display |
| 10 | EDIT MODAL | 8221-9193 | `#EDIT` | Order edit modal, preparePayload |
| 11 | INLINE PRODUCT SEARCH | 9194-10001 | `#PRODUCT` | Inline product search |
| 12 | CHAT MODAL | 10002-15761 | `#CHAT` | Chat, messages, comments (LARGEST) |
| 13 | INFINITE SCROLL | 15762-16004 | `#SCROLL` | Chat infinite scroll |
| 14 | NOTE ENCODING | 16005-18786 | `#ENCODE` | Base64, XOR decrypt, note parsing |
| 15 | ORDER MERGE | 18787-20377 | `#MERGE` | Merge order products |
| 16 | ADDRESS LOOKUP | 20378-21679 | `#ADDRESS` | Address autocomplete |
| 17 | QR & DEBT | 21680-23411 | `#QR-DEBT` | QR code, debt display, SSE |
| 18 | SALE MODAL | 23412-25975 | `#SALE-PROD` | Sale modal, product search, F9 |

### SECTION DETAILS

#### SECTION 1: GLOBAL VARIABLES (Lines 119-239)
```
Key Variables:
- allData[]           - Tất cả orders từ API
- filteredData[]      - Orders sau khi filter
- displayedData[]     - Orders hiển thị (after employee filter)
- currentPage         - Pagination state
- selectedOrderIds    - Selected orders Set
- employeeRanges[]    - Employee STT ranges
- currentSortColumn   - Sort state
- availableTags[]     - Available tags for assignment
- currentEditOrderData - Current order being edited

Key Functions:
- formatTimeVN()      - Format time to Vietnam timezone
- getAllOrders()      - Getter for allData (window exposed)
```

#### SECTION 2: FIREBASE & REALTIME (Lines 240-710)
```
Key Functions:
- emitTagUpdateToFirebase(orderId, tags)  - Emit tag to Firebase
- setupTagRealtimeListeners()             - Setup Firebase listeners
- handleRealtimeTagUpdate(data, source)   - Process realtime updates
- updateTagCellOnly(orderId, code, tags)  - Update DOM without re-render

Dependencies:
- firebase.database() from config.js
- window.authManager for user info
```

#### SECTION 3: INITIALIZATION (Lines 711-1236)
```
Key Functions:
- DOMContentLoaded event handler
- initializeApp()
- loadCampaigns()
- setupEventListeners()

Flow:
1. Wait for DOM ready
2. Check auth state
3. Load campaigns from Firebase
4. Initialize managers (pancake, token, etc.)
5. Setup realtime listeners
```

#### SECTION 4: EMPLOYEE RANGE (Lines 1237-1626)
```
Key Functions:
- loadAndRenderEmployeeTable()
- saveEmployeeRanges()
- applyEmployeeRanges(orders)
- getEmployeeName(stt)
- filterOrdersByEmployee(orders)

Data Structure:
employeeRanges = [
  { name: "Nhân viên A", start: 1, end: 50 },
  { name: "Nhân viên B", start: 51, end: 100 }
]
```

#### SECTION 5: TAG MANAGEMENT (Lines 1627-2665)
```
Key Functions:
- loadAvailableTags()
- openTagModal(orderId)
- closeTagModal()
- saveOrderTags()
- quickAssignTag(orderId, tagId)
- renderTagBadges(tags)

Firebase Path: /available_tags, /orders/{id}/tags
```

#### SECTION 6: BULK TAG (Lines 2666-5037)
```
Key Functions:
- showBulkTagModal()
- closeBulkTagModal()
- parseBulkSTTInput(input)
- applyBulkTags()
- validateSTTRange(start, end)

UI: Modal for assigning tags to multiple orders by STT range
```

#### SECTION 7: SEARCH & FILTER (Lines 5038-6863)
```
Key Functions:
- handleTableSearch(query)
- performTableSearch()
- mergeOrdersByPhone(orders)    - Merge orders with same phone
- normalizePhone(phone)         - Normalize phone format
- applyFilters()
- sortOrders(column, direction)

Merge Logic:
- Group orders by normalized phone
- Order with largest STT becomes target
- Other orders become source (products merged into target)
```

#### SECTION 8: TABLE RENDERING (Lines 6864-7507)
```
Key Functions:
- renderTable()                 - Main render function
- createRowHTML(order)          - Create single row HTML
- renderMessagesColumn(order)   - Render messages column
- renderCommentsColumn(order)   - Render comments column
- updateRowInDOM(orderId)       - Update single row

Performance:
- Uses requestAnimationFrame
- Batch DOM updates
- Virtual scrolling for large lists
```

#### SECTION 9: MERGED COLUMNS (Lines 7508-8220)
```
Key Functions:
- renderMergedMessagesColumn(mergedOrder)
- renderMergedQuantityColumn(mergedOrder)
- renderMergedTotalColumn(mergedOrder)
- renderMergedSTTColumn(mergedOrder)

Note: For orders merged by phone number
```

#### SECTION 10: EDIT MODAL (Lines 8221-9193)
```
Key Functions:
- openEditModal(orderId)
- closeEditModal()
- saveOrderChanges()
- prepareOrderPayload(order)
- validateOrderPayload(payload)

API Calls:
- PUT /api/odata/DraftOrder({id})
```

#### SECTION 11: INLINE PRODUCT SEARCH (Lines 9194-10001)
```
Key Functions:
- initInlineProductSearch()
- performInlineSearch(query)
- displayInlineResults(results)
- addProductToOrderFromInline(productId)

Dependencies:
- window.productSearchManager (from product-search-manager.js)
```

#### SECTION 12: CHAT MODAL (Lines 10002-15761) ⚠️ LARGEST SECTION
```
Key Functions:
- openChatModal(order)          - Line ~10500
- closeChatModal()
- sendMessage(messageData)      - Line ~13593
- sendComment(commentData)
- fetchMessagesFromAPI()
- fetchCommentsFromAPI()
- setupRealtimeMessages()
- cleanupRealtimeMessages()
- autoMarkAsRead()
- updateReadBadge(isRead)

Global State:
- window.currentChatChannelId
- window.currentChatPSID
- window.currentConversationId
- window.allChatMessages[]
- window.allChatComments[]

Image Handling:
- handleImagePaste()
- uploadImageToFacebook()
- removeUploadedImage()
```

#### SECTION 13: INFINITE SCROLL (Lines 15762-16004)
```
Key Functions:
- setupChatInfiniteScroll()
- loadMoreMessages()
- loadMoreComments()
- handleScrollPosition()

Note: Handles pagination for chat history
```

#### SECTION 14: NOTE ENCODING (Lines 16005-18786)
```
Key Functions:
- base64UrlDecode(str)
- xorDecrypt(data, key)
- decodeProductLine(encoded)
- hasValidEncodedProducts(note)
- parseNoteProducts(note)

Format: Products encoded in order Note field
Encryption: XOR with key for obfuscation
```

#### SECTION 15: ORDER MERGE (Lines 18787-20377)
```
Key Functions:
- getOrderDetails(orderId)             - Line 18787
- executeMergeOrderProducts(merged)    - Line 18928
- executeBulkMergeOrderProducts()
- validateMergeOperation()

API Calls:
- GET /api/odata/DraftOrder({id})
- PUT /api/odata/DraftOrder({id})
- DELETE /api/odata/DraftOrder({id})
```

#### SECTION 16: ADDRESS LOOKUP (Lines 20378-21679)
```
Key Functions:
- handleAddressLookup(input)
- handleFullAddressLookup(query)
- displayAddressSuggestions(results)
- selectAddressSuggestion(address)

API: Vietnam address database lookup
```

#### SECTION 17: QR & DEBT (Lines 21680-23411)
```
Key Functions:
- renderQRColumn(order)
- renderDebtColumn(order)
- fetchDebtForPhone(phone)
- batchFetchDebts(phones)
- getCachedDebt(phone)
- connectDebtRealtime()

API Calls:
- GET /api/sepay/debt-summary?phone={phone}
- SSE: /api/sepay/debt-stream

Cache: debtCache Map with TTL
```

#### SECTION 18: SALE MODAL (Lines 23412-25975)
```
Key Functions:
- openSaleModal(order)                 - Line ~23500
- closeSaleModal()
- initSaleProductSearch()              - Line ~23700
- performSaleProductSearch(query)
- addProductToSaleFromSearch(pid)      - Line ~24214
- updateSaleOrderWithAPI()             - Line ~24687
- recalculateSaleTotals()              - Line ~24273
- confirmAndPrintSale()                - Line ~25200 (F9 handler)

API Calls:
- PUT /api/odata/DraftOrder({id})
- POST /api/tpos/fast-sale-order

⚠️ CUSTOMER WALLET INTEGRATION POINT:
Line ~25200: confirmAndPrintSale() - Đây là nơi trừ ví khi tạo PBH
```

---

## tab3-product-assignment.js - SECTION MAP (6,309 lines)

### SECTION INDEX

| # | Section | Lines | Search Key | Mô tả |
|---|---------|-------|------------|-------|
| 1 | STATE & FIREBASE | 80-288 | `#STATE` | State variables, Firebase config |
| 11 | NOTE ENCODING | 289-373 | `#NOTE` | processNoteForUpload() |
| 2 | AUTH & API | 374-442 | `#AUTH` | Token management, authenticatedFetch |
| 3 | PRODUCT DATA | 443-623 | `#PRODUCT` | loadProductsData(), searchProducts() |
| 5 | PRODUCT ASSIGNMENT | 624-1780 | `#ASSIGN` | addProductToAssignment(), saveAssignments() |
| 8 | UPLOAD HISTORY | 1781-2651 | `#HISTORY` | loadUploadHistory(), filterHistory() |
| 6 | UPLOAD PREVIEW | 2652-3865 | `#PREVIEW` | renderUploadTable(), showPreviewModal() |
| 7 | UPLOAD FUNCTIONS | 3866-5095 | `#UPLOAD` | uploadSelectedSTTs(), preparePayload() |
| 12 | PRODUCT REMOVAL | 5096-6309 | `#REMOVAL` | Remove product feature |

**Note:** Section numbers match TABLE OF CONTENTS in file header, but code order is different.

### KEY FUNCTIONS

```
State & Data:
- assignments[]       - Stored product assignments
- productsData[]      - Product list from Excel
- ordersData[]        - Orders from Tab1

Auth:
- getAuthToken()      - Get bearer token
- authenticatedFetch() - API call with auth

Assignment:
- addProductToAssignment(productId)  - Add product
- renderAssignmentTable()            - Render table
- saveAssignments()                  - Save to Firebase

Upload:
- uploadSelectedSTTs()   - Upload selected
- prepareUploadPayload() - Build TPOS payload
```

---

## tab-overview.html - SECTION MAP (8,806 lines)

**Note:** Inline JavaScript trong HTML file, không phải file JS riêng.

### SECTION INDEX

| # | Section | Lines | Mô tả |
|---|---------|-------|-------|
| 1 | DISCOUNT STATS STYLES | 1622-3303 | CSS cho discount stats |
| 2 | DISCOUNT STATS SECTION | 3304-3644 | HTML cho discount stats UI |
| 3 | AUTH & PERMISSIONS | 3645-3715 | getAuthData(), hasDetailedPermission() |
| 4 | FIREBASE UTILS | 3749-3913 | saveToFirebase(), loadFromFirebase() |
| 5 | CAMPAIGN FETCHING | 3914-4481 | fetchCampaignsFromTPOS(), fetchOrdersFromTPOS() |
| 6 | EMPLOYEE & TAGS | 4496-5259 | loadEmployeeRanges(), calculateTagStats() |
| 7 | STATISTICS RENDERING | 5262-5760 | renderStatistics(), renderEmployeeStats() |
| 8 | TAG MODAL & VIEWS | 5761-6500 | openAddTagModal(), viewTagOrders() |
| 9 | VALIDATION & MODALS | 6311-6806 | findGioTrongValidationErrors(), viewMismatchOrders() |

### KEY FUNCTIONS

```
Campaign & Data:
- fetchCampaignsFromTPOS(dateFilter)    - Line 3978
- fetchOrdersFromTPOS(campaignId)       - Line 4138
- parseExcelOrderData(orders)           - Line 4302
- getCurrentSessionCampaigns()          - Line 4070

Employee & Tags:
- loadEmployeeRanges()                  - Line 4529
- calculateTagStats(orders)             - Line 4728
- calculateEmployeeTagStats(orders)     - Line 5010
- getEmployeeBySTT(stt)                 - Line 4654

Statistics:
- renderStatisticsFromAllOrders()       - Line 5457
- renderEmployeeStats(stats, allOrders) - Line 5590
- calculateActualClosedStats(orders)    - Line 5262

Modals & Views:
- viewEmployeeOrders(name, start, end)  - Line 6178
- viewTagOrders(pattern, type)          - Line 6049
- showGioTrongValidationModal()         - Line 6355
```

---

## tab2-statistics.html - SECTION MAP (1,470 lines)

**Note:** Inline JavaScript trong HTML file cho KPI Statistics.

### SECTION INDEX

| # | Section | Lines | Mô tả |
|---|---------|-------|-------|
| 1 | INITIALIZATION | 578-594 | DOMContentLoaded, event listeners |
| 2 | CAMPAIGN LOADING | 595-635 | loadCampaigns() |
| 3 | CAMPAIGN SELECTION | 636-672 | onCampaignSelected() |
| 4 | KPI CALCULATION | 673-704 | calculateOrderKPI() |
| 5 | LOAD STATISTICS | 705-897 | loadStatsForCampaign() |
| 6 | USER ORDERS VIEW | 898-950 | showUserOrders() |
| 7 | ORDER KPI DETAILS | 951-989 | showOrderKPIDetails() |
| 8 | RENDER TABS | 990-1128 | renderKPIComparisonTab(), renderAllProductsTab() |
| 9 | UTILITY FUNCTIONS | 1129-1161 | clearStatsTable(), updateSummaryCards() |
| 10 | TIMELINE CHART | 1162-1283 | showTimeline() với Chart.js |
| 11 | EXPORT EXCEL | 1284-1358 | exportToExcel() |
| 12 | FETCH ORDER | 1359-1470 | fetchOrderFromTPOS() |

### KEY FUNCTIONS

```
KPI:
- calculateOrderKPI(baseProducts, currentProducts) - Line 674
- loadStatsForCampaign(campaignName, statusEl)     - Line 706
- showOrderKPIDetails(orderId, stt)                - Line 952

Rendering:
- renderKPIComparisonTab(base, currentProducts)    - Line 991
- renderAllProductsTab(currentProducts)            - Line 1075
- renderBaseProductsTab(base)                      - Line 1103

Utils:
- showTimeline()                                   - Line 1163
- exportToExcel()                                  - Line 1285
- refreshStats()                                   - Line 1154
```

---

## EXTERNAL MANAGERS

### pancake-data-manager.js (2,118 lines)
```
Class: PancakeDataManager

Key Methods:
- getToken()                    - Get JWT from Firebase/Cookie
- fetchConversations(pageIds)   - Fetch all conversations
- fetchMessages(conversationId) - Fetch messages
- sendMessage(params)           - Send message via Graph API
- sendComment(params)           - Reply to comment

Data Maps:
- inboxMapByPSID     - INBOX conversations by PSID
- inboxMapByFBID     - INBOX by Facebook ID
- commentMapByPSID   - COMMENT conversations by PSID
- commentMapByFBID   - COMMENT by Facebook ID

Global: window.pancakeDataManager
```

### message-template-manager.js (2,161 lines)
```
Class: MessageTemplateManager

Key Methods:
- fetchTemplates()              - Load templates from TPOS
- showModal(orders)             - Show template selection modal
- sendBulkMessages(template)    - Send to multiple orders
- parseTemplate(template, order)- Replace placeholders

Placeholders:
- {TenKhachHang} - Customer name
- {SoDienThoai}  - Phone number
- {DiaChi}       - Address
- {SanPham}      - Product list
- {TongTien}     - Total amount

Global: window.messageTemplateManager
```

### kpi-manager.js (778 lines)
```
Key Functions:
- checkKPIBaseExists(orderId)
- saveKPIBase(orderId, userId, stt, products)
- calculateKPIDifference(orderId)
- getKPIStatistics(userId, date)

Firebase Paths:
- /kpi_base/{orderId}
- /kpi_statistics/{userId}/{date}

KPI Calculation: 5,000đ per product difference
```

---

## CROSS-TAB COMMUNICATION

### Message Types (postMessage)

```javascript
// Tab1 → Main → Other Tabs
"FILTER_CHANGED"              // Filter changed in Tab1
"ORDERS_DATA_RESPONSE_TAB3"   // Send orders to Tab3
"ORDERS_DATA_RESPONSE_OVERVIEW" // Send orders to Overview
"TABLE_NAME_CHANGED"          // Campaign table changed

// Other Tabs → Main → Tab1
"REQUEST_ORDERS_DATA"         // Tab3 requests orders
"REQUEST_ORDERS_DATA_FROM_OVERVIEW" // Overview requests orders
"REQUEST_EMPLOYEE_RANGES"     // Request employee config
"FETCH_CONVERSATIONS_FOR_ORDERS" // Request conversation data

// Realtime Events
"realtimeConversationUpdate"  // New message/comment
"realtimeOrderTagsUpdate"     // Tag changed by other user
```

---

## API DEPENDENCIES

### TPOS API (via Cloudflare Worker)
```
Base: https://chatomni-proxy.nhijudyshop.workers.dev

Endpoints:
- GET  /api/odata/DraftOrder    - List draft orders
- GET  /api/odata/DraftOrder({id}) - Get order details
- PUT  /api/odata/DraftOrder({id}) - Update order
- DELETE /api/odata/DraftOrder({id}) - Delete order
- POST /api/tpos/fast-sale-order - Create PBH (F9)
- GET  /api/odata/MailTemplate  - Message templates
```

### Pancake API (via Cloudflare Worker)
```
Base: https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake

Endpoints:
- GET  /pages           - List Facebook pages
- GET  /conversations   - List conversations
- GET  /messages        - Get messages
- POST /messages        - Send message
- POST /comments        - Reply to comment
```

### SePay API (Render.com)
```
Base: https://n2store-balance.onrender.com

Endpoints:
- GET  /api/sepay/debt-summary?phone={phone} - Get debt
- GET  /api/sepay/history      - Transaction history
- POST /api/sepay/webhook      - Receive bank webhook
- SSE  /api/sepay/debt-stream  - Realtime debt updates
```

---

## COMMON TASKS QUICK REFERENCE

| Task | Files cần đọc | Line Ranges |
|------|---------------|-------------|
| **Tab1 - Orders:** | | |
| Sửa hiển thị bảng | tab1-orders.js | 6864-7507 |
| Sửa tag feature | tab1-orders.js | 1627-2665, 2666-5037 |
| Sửa chat modal | tab1-orders.js | 10002-15761 |
| Sửa debt display | tab1-orders.js | 21680-23411 |
| Sửa tạo PBH (F9) | tab1-orders.js | 23412-25975 |
| Sửa merge orders | tab1-orders.js | 5038-6863, 18787-20377 |
| Sửa employee filter | tab1-orders.js | 1237-1626 |
| Sửa search | tab1-orders.js | 5038-6863 |
| **Tab3 - Product Assignment:** | | |
| Sửa gán sản phẩm | tab3-product-assignment.js | 624-1780 |
| Sửa upload TPOS | tab3-product-assignment.js | 3866-5095 |
| Sửa upload history | tab3-product-assignment.js | 1781-2651 |
| Sửa note encoding | tab3-product-assignment.js | 289-373 |
| **Tab Overview - Báo Cáo:** | | |
| Sửa employee stats | tab-overview.html | 5262-5760 |
| Sửa tag stats | tab-overview.html | 4728-5259 |
| Sửa campaign fetch | tab-overview.html | 3914-4481 |
| Sửa validation modals | tab-overview.html | 6311-6806 |
| **Tab2 - KPI Statistics:** | | |
| Sửa KPI calculation | tab2-statistics.html | 673-897 |
| Sửa timeline chart | tab2-statistics.html | 1162-1283 |
| Sửa export Excel | tab2-statistics.html | 1284-1358 |
| **Managers:** | | |
| Sửa Pancake integration | pancake-data-manager.js | Toàn bộ |
| Sửa message templates | message-template-manager.js | Toàn bộ |
| Sửa KPI calculation | kpi-manager.js | Toàn bộ |
| **New Features:** | | |
| Thêm Social orders tab | main.html, new file | - |
| Thêm Customer Hub | new module | - |

---

## CUSTOMER WALLET INTEGRATION POINTS

### Nơi cần tích hợp Wallet khi tạo PBH:

```javascript
// File: tab1-orders.js
// Section: SECTION 18 - SALE MODAL
// Line: ~25200

async function confirmAndPrintSale() {
    // ... existing code ...

    // 🎯 INTEGRATION POINT: Trừ ví tại đây
    // 1. Lấy thông tin khách hàng từ order.Telephone
    // 2. Gọi API Customer Hub để kiểm tra/trừ ví
    // 3. Nếu có virtual credits, áp dụng FIFO
    // 4. Tạo wallet_transaction record

    // ... continue with TPOS API call ...
}
```

### API cần tạo cho Customer Hub:
```
POST /api/customer-hub/wallet/deduct
Body: { phone, amount, orderId, orderCode }
Response: { success, newBalance, transactionId }
```

---

## AI AGENT INSTRUCTIONS

### BEFORE ANY TASK:
1. Đọc file này (MODULE_MAP.md) trước
2. Xác định section(s) liên quan từ bảng trên
3. Đọc CHỈ những section đó bằng offset/limit

### DO NOT:
- Đọc toàn bộ tab1-orders.js (25K lines = context overflow)
- Modify functions không hiểu dependencies
- Thay đổi global state mà không check side effects

### ARCHITECTURE RULES:
- State được quản lý bởi global variables ở SECTION 1
- Firebase listeners chỉ setup ở SECTION 2
- API calls thông qua Cloudflare Worker proxy
- Debt data từ SePay API (Render.com)
- Cross-tab communication qua postMessage

### TESTING CHECKLIST:
1. Check console for errors
2. Test affected feature manually
3. Verify Firebase sync still works
4. Check realtime updates from other tabs

---

*Last updated: 2025-01-07*
*Total lines analyzed: ~73,000*
