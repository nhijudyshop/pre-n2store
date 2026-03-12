# Tab Don Social - Design Document

> Created: 2026-01-24  
> Last Updated: 2026-01-25  
> Status: In Progress  
> Approach: UI-First (tao UI truoc, API/logic sau)

---

## Muc Luc

1. [Tong Quan](#1-tong-quan)
2. [Technical Stack](#2-technical-stack)
3. [UI Components](#3-ui-components)
4. [Data Structure](#4-data-structure)
5. [UX Flows](#5-ux-flows)
6. [Implementation Plan - Chi Tiet Tat Ca Phases](#6-implementation-plan---chi-tiet-tat-ca-phases)
7. [Files Structure](#7-files-structure)
8. [Notes](#8-notes)

---

## 1. Tong Quan

### Muc dich

Tao tab moi de quan ly don hang nhap tu cac kenh mang xa hoi (Facebook Post, Instagram, TikTok...) - nhung kenh khong co tren TPOS.

### Diem khac biet voi Tab1

| Thuoc tinh     | Tab1 (TPOS)               | Tab Social          |
| -------------- | ------------------------- | ------------------- |
| Nguon du lieu  | TPOS API                  | Firebase            |
| Chien dich     | Bat buoc chon             | Khong co            |
| Tao don        | TPOS tu tao tu livestream | Thu cong tren web   |
| Realtime       | TPOS WebSocket            | Khong can           |
| Nut "Tao don"  | Khong co                  | Co                  |
| Cot "Bai Post" | Khong co                  | Co (link clickable) |

---

## 2. Technical Stack

| Component     | Lua chon                                      |
| ------------- | --------------------------------------------- |
| Database      | Firebase Realtime DB                          |
| Firebase Path | `/social-orders/{orderId}`                    |
| UI Base       | Clone 100% tu Tab1                            |
| File HTML     | `orders-report/tab-social-orders.html`        |
| File JS       | `orders-report/js/tab-social/tab-social-*.js` |
| File CSS      | `orders-report/css/tab-social-orders.css`     |

---

## 3. UI Components

### 3.1 Layout Chinh (Da Cap Nhat - Sau Filter Consolidation)

```
+---------------------------------------------------------------------------------+
|  Don Social                              [Tao don moi] [Gan Tag] [Cai dat cot]  |  <- Header
+---------------------------------------------------------------------------------+
| Row 1: [Tim kiem...]  [Tat ca|Hom nay|Hom qua|3N|7N|15N|Lich] [Tu ngay->Den]    |  <- Unified Filter
| Row 2: Trang thai:[v]  Nguon:[v]  TAG:[v]              5 ket qua [Reload]       |
+---------------------------------------------------------------------------------+
|  TABLE: Checkbox | Thao tac | STT | TAG | Khach | SDT | Chat | SP | Post | ...  |
+---------------------------------------------------------------------------------+
```

### 3.2 Table Columns

| Cot            | Mo ta                                         | An mac dinh? |
| -------------- | --------------------------------------------- | ------------ |
| **Checkbox**   | Chon nhieu don                                | Khong        |
| **Thao Tac**   | Edit + Delete buttons                         | Khong        |
| **STT**        | So thu tu                                     | Khong        |
| **Tag**        | Hien thi tags, click de mo modal gan tag      | Khong        |
| **Khach hang** | Ten khach                                     | Khong        |
| **SDT**        | So dien thoai                                 | Khong        |
| **Chat**       | Icon chat (de trong neu chua co Pancake info) | Khong        |
| **San pham**   | So luong SP + tong so cai                     | Khong        |
| **Bai Post**   | Link clickable den bai dang goc               | Khong        |
| **Dia Chi**    | Dia chi giao hang                             | **Co**       |
| **Tong**       | Tong tien don                                 | Khong        |
| **Ngay tao**   | Thoi gian tao don                             | Khong        |
| **Trang thai** | Badge mau theo status                         | Khong        |

### 3.3 Modals

| Modal             | Clone tu Tab1? | Trang thai | Ghi chu                       |
| ----------------- | -------------- | ---------- | ----------------------------- |
| **Tao/Sua don**   | Khong - Moi    | Done       | Co them field Bai Post, Nguon |
| **Gan Tag**       | Clone          | Done       | Giong Tab1                    |
| **Cai dat cot**   | Moi            | Done       | An/hien cac cot               |
| **Xac nhan xoa**  | Moi            | Done       | Confirm dialog                |
| **Chat**          | Clone          | Phase 4    | De trong, implement sau       |
| **Tim san pham**  | Clone          | Phase 3    | Ket noi TPOS API              |
| **Tao phieu ban** | Clone          | Phase 3    | Ket noi TPOS API              |

---

## 4. Data Structure

### 4.1 Firebase Path

```
/social-orders/{orderId}
```

### 4.2 Order Object

```javascript
{
  // === IDENTIFICATION ===
  id: "SO-20260124-0001",       // Ma don tu sinh: SO-YYYYMMDD-XXXX
  stt: 1,                       // So thu tu (auto-increment)

  // === CUSTOMER INFO ===
  customerName: "Nguyen Van A",
  phone: "0901234567",
  address: "123 Le Loi, Q.1, HCM",

  // === PANCAKE INFO (Phase 4) ===
  pageId: "",                   // Page ID
  psid: "",                     // Customer PSID
  conversationId: "",           // Conversation ID

  // === BAI POST ===
  postUrl: "https://facebook.com/page/posts/123",
  postLabel: "FB Post 24/01",
  source: "facebook_post",      // Enum: facebook_post, instagram, tiktok, manual

  // === PRODUCTS ===
  products: [
    {
      productId: "prod_001",
      name: "Ao thun trang",
      code: "AT001",
      quantity: 2,
      price: 150000,
      note: ""
    }
  ],
  totalQuantity: 2,
  totalAmount: 300000,

  // === TAGS ===
  tags: [
    { id: "tag_vip", name: "VIP", color: "#ef4444" }
  ],

  // === STATUS ===
  status: "draft",              // Enum: draft, processing, completed, cancelled

  // === ASSIGNMENT (Phase 3) ===
  assignedUserId: "",
  assignedUserName: "",

  // === NOTES ===
  note: "Ghi chu cho don hang...",

  // === AUDIT ===
  createdBy: "admin",
  createdByName: "Admin",
  createdAt: 1706108400000,
  updatedAt: 1706108400000
}
```

### 4.3 Source Enum

| Value           | Hien thi      | Icon |
| --------------- | ------------- | ---- |
| `manual`        | Thu cong      | Pen  |
| `facebook_post` | Facebook Post | FB   |
| `instagram`     | Instagram     | IG   |
| `tiktok`        | TikTok        | TT   |

### 4.4 Status Enum

| Value        | Hien thi   | Color            |
| ------------ | ---------- | ---------------- |
| `draft`      | Nhap       | #fbbf24 (yellow) |
| `processing` | Dang xu ly | #3b82f6 (blue)   |
| `completed`  | Hoan thanh | #10b981 (green)  |
| `cancelled`  | Da huy     | #ef4444 (red)    |

---

## 5. UX Flows

### 5.1 Flow: Tao don moi

```
User clicks [Tao don moi]
         |
         v
    Open Modal
         |
         v
+--------------------------------+
|     MODAL TAO DON MOI          |
+--------------------------------+
| Khach hang*: [____________]    |
| SDT*:        [____________]    |
| Dia chi:     [____________]    |
|                                |
| --- Nguon don ---              |
| Bai Post:    [URL____________] |
| Nguon:       [Facebook v]      |
|                                |
| --- San pham ---               |
| [Tim san pham de them...]      |
| +----------------------------+ |
| | Ao thun  x[2]  150k = 300k | |
| | Quan     x[1]  200k = 200k | |
| +----------------------------+ |
| Tong SL: 3    Tong tien: 500k  |
|                                |
| Ghi chu: [__________________]  |
|                                |
|      [Huy]      [Luu don]      |
+--------------------------------+
         |
         v
    Validate fields
         |
         v
    Generate order ID (SO-YYYYMMDD-XXXX)
         |
         v
    Save to Firebase /social-orders/{id}
         |
         v
    Close modal + Refresh table
         |
         v
    Show success notification
```

### 5.2 Flow: Sua don

```
User clicks [Edit] on row
         |
         v
    Get order data from state/Firebase
         |
         v
    Open Modal (same as Create, pre-filled)
         |
         v
    User edits fields
         |
         v
    Click [Luu]
         |
         v
    Update Firebase /social-orders/{id}
         |
         v
    Close modal + Refresh table
```

### 5.3 Flow: Xoa don

```
User clicks [Delete] on row
         |
         v
    Show confirm dialog: "Ban co chac muon xoa don SO-xxx?"
         |
         v
    If [Xac nhan]:
         |
         v
    Delete from Firebase /social-orders/{id}
         |
         v
    Refresh table + Show notification
```

### 5.4 Flow: Gan Tag

```
User clicks [Tag icon] on row
         |
         v
    Open Tag Modal
         |
         v
+-------------------------+
| GAN TAG CHO DON SO-001  |
+-------------------------+
| [Tim tag...]            |
|                         |
| [x] VIP                 |
| [ ] Da goi              |
| [ ] Cho ship            |
| [ ] Khach quen          |
|                         |
| [+ Tao tag moi]         |
|                         |
|    [Dong]    [Luu]      |
+-------------------------+
         |
         v
    Update order.tags in Firebase
         |
         v
    Refresh row
```

### 5.5 Flow: Filter & Search

```
User selects [Loc trang thai: Nhap]
    OR types in [Tim kiem: Nguyen]
    OR clicks date filter [Hom nay]
         |
         v
    Filter orders in memory (client-side)
         |
         v
    Re-render table with filtered results
         |
         v
    Update result count (X ket qua)
```

### 5.6 Flow: Date Filtering

```
User clicks date quick filter button
         |
    +----+----+----+----+----+----+----+
    |    |    |    |    |    |    |    |
    v    v    v    v    v    v    v    v
  [Tat ca] [Hom nay] [Hom qua] [3N] [7N] [15N] [Lich]
         |
         v
    If [Lich] clicked:
         |
         v
    Show custom date range inputs (Tu ngay -> Den ngay)
         |
         v
    User selects dates + clicks [Ap dung]
         |
         v
    Filter orders by createdAt timestamp
         |
         v
    Re-render table
```

### 5.7 Flow: Column Visibility

```
User clicks [Cai dat cot]
         |
         v
    Open Column Settings Modal
         |
         v
+---------------------------+
| CAI DAT COT HIEN THI      |
+---------------------------+
| [x] STT                   |
| [x] Tag                   |
| [x] Khach hang            |
| [x] SDT                   |
| [ ] Dia chi  <- hidden    |
| [x] Tong                  |
| [x] Ngay tao              |
| [x] Trang thai            |
|                           |
|    [Dong]    [Luu]        |
+---------------------------+
         |
         v
    Save to localStorage: socialOrderTableColumnVisibility
         |
         v
    Re-render table with updated columns
```

---

## 6. Implementation Plan - Chi Tiet Tat Ca Phases

### PHASE 1: UI Only - HOAN THANH

**Trang thai**: DONE  
**Commits**: `fa844d2e`, `33c16d6f`, `fa84f566`

#### Tasks da hoan thanh:

- [x] Tao file `tab-social-orders.html`
- [x] Tao file `css/tab-social-orders.css`
- [x] Tao folder `js/tab-social/` voi cac modules:
    - [x] `tab-social-core.js` - Init, state, mock data (5 orders)
    - [x] `tab-social-table.js` - Table render, filters, search
    - [x] `tab-social-modal.js` - Create/Edit order modal
    - [x] `tab-social-tags.js` - Tag management modal
    - [x] `tab-social-firebase.js` - Firebase CRUD (prepared)
    - [x] `tab-social-column-visibility.js` - Column show/hide
- [x] Them tab vao `main.html` navigation
- [x] Tao table voi mock data (5 don)
- [x] Tao Modal Tao/Sua don
- [x] Tao Modal Gan Tag
- [x] Tao Modal Cai dat cot
- [x] Tao Modal Xac nhan xoa
- [x] Them cot "Ngay tao" va "Trang thai"
- [x] Consolidate filters: Date quick filters + Custom date range
- [x] Remove stats-bar, tao unified filter section

#### Mock Data Structure:

```javascript
// 5 mock orders trong tab-social-core.js
const MOCK_ORDERS = [
    {
        id: 'SO-20260124-0001',
        customerName: 'Nguyen Van An',
        phone: '0901234567',
        source: 'facebook_post',
        status: 'draft',
        totalAmount: 650000,
        createdAt: Date.now(),
        // ...
    },
    // ... 4 more orders
];
```

---

### PHASE 2: Firebase Integration

**Trang thai**: PENDING  
**Estimated time**: 2-3 hours  
**Priority**: HIGH

#### 2.1 Firebase Setup

| Task  | Mo ta                                | File                           |
| ----- | ------------------------------------ | ------------------------------ |
| 2.1.1 | Kiem tra Firebase config da san sang | `shared/js/firebase-config.js` |
| 2.1.2 | Tao Firebase Realtime DB path        | `/social-orders/{orderId}`     |
| 2.1.3 | Set Firebase rules cho path moi      | `database.rules.json`          |

**Firebase Rules can them:**

```json
{
    "social-orders": {
        ".read": "auth != null",
        ".write": "auth != null",
        "$orderId": {
            ".validate": "newData.hasChildren(['id', 'customerName', 'phone', 'createdAt'])"
        }
    }
}
```

#### 2.2 CRUD Operations

| Task  | Function                          | Mo ta                          |
| ----- | --------------------------------- | ------------------------------ |
| 2.2.1 | `loadSocialOrdersFromFirebase()`  | Load tat ca orders tu Firebase |
| 2.2.2 | `createSocialOrder(order)`        | Tao order moi, return orderId  |
| 2.2.3 | `updateSocialOrder(id, updates)`  | Cap nhat order                 |
| 2.2.4 | `deleteSocialOrder(id)`           | Xoa order                      |
| 2.2.5 | `updateSocialOrderTags(id, tags)` | Cap nhat tags                  |

**Implementation trong `tab-social-firebase.js`:**

```javascript
// === LOAD ALL ORDERS ===
async function loadSocialOrdersFromFirebase() {
    const db = getDatabase();
    const ordersRef = ref(db, 'social-orders');
    const snapshot = await get(ordersRef);

    if (!snapshot.exists()) return [];

    const orders = [];
    snapshot.forEach((child) => {
        orders.push({ id: child.key, ...child.val() });
    });

    // Sort by createdAt DESC
    return orders.sort((a, b) => b.createdAt - a.createdAt);
}

// === CREATE ORDER ===
async function createSocialOrder(order) {
    const db = getDatabase();
    const orderId = order.id || generateOrderId();
    const orderRef = ref(db, `social-orders/${orderId}`);

    await set(orderRef, {
        ...order,
        id: orderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    return orderId;
}

// === UPDATE ORDER ===
async function updateSocialOrder(orderId, updates) {
    const db = getDatabase();
    const orderRef = ref(db, `social-orders/${orderId}`);

    await update(orderRef, {
        ...updates,
        updatedAt: Date.now(),
    });
}

// === DELETE ORDER ===
async function deleteSocialOrder(orderId) {
    const db = getDatabase();
    const orderRef = ref(db, `social-orders/${orderId}`);
    await remove(orderRef);
}
```

#### 2.3 Integrate voi UI

| Task  | Mo ta                                  | File                  |
| ----- | -------------------------------------- | --------------------- |
| 2.3.1 | Thay mock data bang Firebase load      | `tab-social-core.js`  |
| 2.3.2 | Cap nhat `saveOrder()` de goi Firebase | `tab-social-modal.js` |
| 2.3.3 | Cap nhat delete flow de goi Firebase   | `tab-social-table.js` |
| 2.3.4 | Cap nhat tag save de goi Firebase      | `tab-social-tags.js`  |
| 2.3.5 | Them loading states                    | All files             |
| 2.3.6 | Them error handling                    | All files             |

**Flow sau khi integrate:**

```
Page Load
    |
    v
initSocialOrdersTab()
    |
    v
loadSocialOrdersFromFirebase()  <- NEW
    |
    v
SocialOrderState.orders = data
    |
    v
renderSocialOrdersTable()
```

#### 2.4 Realtime Listener (Optional)

| Task  | Mo ta                          | Priority |
| ----- | ------------------------------ | -------- |
| 2.4.1 | Setup `onValue` listener       | LOW      |
| 2.4.2 | Handle realtime updates        | LOW      |
| 2.4.3 | Cleanup listener on tab change | LOW      |

> **Note**: Realtime listener la optional vi Tab Social khong can realtime nhu Tab1 (TPOS). Co the implement sau neu can.

#### 2.5 Testing Checklist

- [ ] Load orders tu Firebase thanh cong
- [ ] Tao order moi -> save vao Firebase
- [ ] Edit order -> update Firebase
- [ ] Delete order -> remove tu Firebase
- [ ] Tag update -> save vao Firebase
- [ ] Reload page -> data van con
- [ ] Error handling khi Firebase fail

---

### PHASE 3: Features - TPOS Integration

**Trang thai**: PENDING  
**Estimated time**: 4-6 hours  
**Priority**: MEDIUM  
**Dependency**: Phase 2 must be completed

#### 3.1 Tim Kiem San Pham (TPOS API)

| Task  | Mo ta                                 |
| ----- | ------------------------------------- |
| 3.1.1 | Reuse `ProductSearchManager` tu Tab1  |
| 3.1.2 | Connect product search trong modal    |
| 3.1.3 | Thay mock products bang TPOS products |
| 3.1.4 | Handle product selection              |

**Files can sua:**

- `tab-social-modal.js` - Replace MOCK_PRODUCTS

**Flow:**

```
User types in product search
         |
         v
Call TPOS API: /products?search=keyword
         |
         v
Display results in dropdown
         |
         v
User clicks product
         |
         v
Add to currentOrderProducts[]
         |
         v
Re-render product list in modal
```

**Code Example:**

```javascript
// Thay vi dung MOCK_PRODUCTS
async function searchProducts() {
    const term = document.getElementById('productSearchInput').value;
    if (term.length < 2) return;

    // Dung ProductSearchManager tu shared
    const results = await window.ProductSearchManager.search(term);
    renderSearchResults(results);
}
```

#### 3.2 Tao Phieu Ban (Sale Modal)

| Task  | Mo ta                                 |
| ----- | ------------------------------------- |
| 3.2.1 | Clone Sale Modal tu Tab1              |
| 3.2.2 | Adapt cho Social Order data structure |
| 3.2.3 | Call TPOS API de tao phieu ban        |
| 3.2.4 | Update order status sau khi tao phieu |

**Flow:**

```
User clicks [Tao phieu ban] on row
         |
         v
Open Sale Modal (clone tu Tab1)
         |
         v
Pre-fill customer info, products
         |
         v
User confirms
         |
         v
Call TPOS API: POST /invoices
         |
         v
Update order.status = 'completed'
         |
         v
Save to Firebase
         |
         v
Show success notification
```

**Files can tao/sua:**

- `tab-social-sale.js` (NEW) - Clone tu `tab1-sale.js`

#### 3.3 Phan Chia Nhan Vien

| Task  | Mo ta                                    |
| ----- | ---------------------------------------- |
| 3.3.1 | Them dropdown chon nhan vien trong modal |
| 3.3.2 | Load danh sach nhan vien tu Firebase     |
| 3.3.3 | Save assignedUserId, assignedUserName    |
| 3.3.4 | Hien thi ten NV trong table (optional)   |

**Data Structure:**

```javascript
{
  assignedUserId: "user_123",
  assignedUserName: "NV Linh"
}
```

**UI trong Modal:**

```
+--------------------------------+
| Phan cong cho: [Chon NV v]     |
|   - NV Linh                    |
|   - NV Mai                     |
|   - NV Hoa                     |
+--------------------------------+
```

#### 3.4 Export Excel

| Task  | Mo ta                                  |
| ----- | -------------------------------------- |
| 3.4.1 | Them nut [Xuat Excel] trong header     |
| 3.4.2 | Reuse export logic tu Tab1 hoac shared |
| 3.4.3 | Format data cho Social Orders          |
| 3.4.4 | Generate va download file              |

**Columns trong Excel:**
| STT | Ma don | Khach hang | SDT | Dia chi | San pham | Tong tien | Nguon | Trang thai | Ngay tao |

**Code Example:**

```javascript
function exportToExcel() {
    const orders = SocialOrderState.filteredOrders || SocialOrderState.orders;

    const data = orders.map((o, i) => ({
        STT: i + 1,
        'Ma don': o.id,
        'Khach hang': o.customerName,
        SDT: o.phone,
        'Dia chi': o.address,
        'San pham': o.products.map((p) => `${p.name} x${p.quantity}`).join(', '),
        'Tong tien': o.totalAmount,
        Nguon: getSourceLabel(o.source),
        'Trang thai': getStatusLabel(o.status),
        'Ngay tao': formatDate(o.createdAt),
    }));

    // Use shared export utility
    ExportUtils.toExcel(data, 'don-social.xlsx');
}
```

#### 3.5 Testing Checklist Phase 3

- [ ] Tim san pham tu TPOS API hoat dong
- [ ] Them san pham vao don thanh cong
- [ ] Tao phieu ban gui len TPOS
- [ ] Order status update sau khi tao phieu
- [ ] Phan cong NV luu vao Firebase
- [ ] Export Excel download dung format

---

### PHASE 4: Pancake Integration

**Trang thai**: PENDING  
**Estimated time**: 6-8 hours  
**Priority**: LOW  
**Dependency**: Phase 2, 3 must be completed

#### 4.1 Chat Modal

| Task  | Mo ta                                     |
| ----- | ----------------------------------------- |
| 4.1.1 | Clone Chat Modal tu Tab1 (`tab1-chat.js`) |
| 4.1.2 | Adapt cho Social Order (psid, pageId)     |
| 4.1.3 | Kiem tra co Pancake info truoc khi mo     |
| 4.1.4 | Hien thi conversation history             |
| 4.1.5 | Gui tin nhan qua Pancake API              |

**Precondition Check:**

```javascript
function openChatModal(orderId) {
    const order = getOrderById(orderId);

    if (!order.psid || !order.pageId) {
        showNotification('Chua co thong tin Pancake', 'warning');
        return;
    }

    // Proceed to open chat
    ChatModal.open(order.psid, order.pageId);
}
```

**Files can tao:**

- `tab-social-chat.js` (NEW) - Clone tu `tab1-chat.js`

#### 4.2 Import tu Pancake Conversations

| Task  | Mo ta                               |
| ----- | ----------------------------------- |
| 4.2.1 | Them nut [Import tu Pancake]        |
| 4.2.2 | Hien thi modal chon conversations   |
| 4.2.3 | Fetch conversations tu Pancake API  |
| 4.2.4 | Parse customer info tu conversation |
| 4.2.5 | Tao Social Order tu conversation    |

**Flow:**

```
User clicks [Import tu Pancake]
         |
         v
Open Import Modal
         |
         v
+-------------------------------+
| IMPORT TU PANCAKE             |
+-------------------------------+
| Chon Page: [Page 1 v]         |
|                               |
| Conversations gan day:        |
| +---------------------------+ |
| | [ ] Nguyen A - 10:30      | |
| | [ ] Tran B - 09:15        | |
| | [ ] Le C - 08:00          | |
| +---------------------------+ |
|                               |
|    [Huy]    [Import (3)]      |
+-------------------------------+
         |
         v
Parse customer info from each conversation
         |
         v
Create Social Orders in Firebase
         |
         v
Refresh table
```

#### 4.3 Link Order voi Pancake Conversation

| Task  | Mo ta                                       |
| ----- | ------------------------------------------- |
| 4.3.1 | Them button "Lien ket Pancake" trong modal  |
| 4.3.2 | Search conversation by phone number         |
| 4.3.3 | Save psid, pageId, conversationId vao order |

**UI trong Edit Modal:**

```
+--------------------------------+
| --- Lien ket Pancake ---       |
| [Tim conversation theo SDT]    |
|                                |
| Da lien ket: Conversation #123 |
| [Huy lien ket]                 |
+--------------------------------+
```

#### 4.4 Testing Checklist Phase 4

- [ ] Chat modal mo khi co Pancake info
- [ ] Chat modal hien warning khi khong co info
- [ ] Gui tin nhan qua Pancake thanh cong
- [ ] Import conversations tao orders dung
- [ ] Link order voi conversation thanh cong
- [ ] Thong tin Pancake luu vao Firebase

---

### PHASE 5: Polish & Optimization (Future)

**Trang thai**: FUTURE  
**Priority**: LOW

#### 5.1 Performance

| Task  | Mo ta                           |
| ----- | ------------------------------- |
| 5.1.1 | Virtual scrolling cho table lon |
| 5.1.2 | Pagination thay vi load all     |
| 5.1.3 | Cache products search results   |
| 5.1.4 | Lazy load images                |

#### 5.2 UX Improvements

| Task  | Mo ta                                   |
| ----- | --------------------------------------- |
| 5.2.1 | Drag & drop de sap xep orders           |
| 5.2.2 | Bulk actions (xoa nhieu, gan tag nhieu) |
| 5.2.3 | Keyboard shortcuts                      |
| 5.2.4 | Mobile responsive                       |

#### 5.3 Analytics

| Task  | Mo ta                          |
| ----- | ------------------------------ |
| 5.3.1 | Thong ke theo nguon (FB/IG/TT) |
| 5.3.2 | Thong ke theo trang thai       |
| 5.3.3 | Bieu do doanh thu theo ngay    |

---

## 7. Files Structure

### Hien Tai (Sau Phase 1)

```
orders-report/
+-- tab-social-orders.html              # Main HTML
+-- main.html                           # Da them tab link
+-- css/
|   +-- tab-social-orders.css           # Styles (450+ lines)
+-- js/
|   +-- tab-social/
|       +-- tab-social-core.js          # Init, state, mock data
|       +-- tab-social-table.js         # Table render, filters, date filters
|       +-- tab-social-modal.js         # Create/Edit modal
|       +-- tab-social-tags.js          # Tag management
|       +-- tab-social-column-visibility.js  # Column show/hide
|       +-- tab-social-firebase.js      # Firebase CRUD (prepared)
+-- docs/
    +-- plans/
        +-- 2026-01-24-tab-social-orders-design.md  # This file
```

### Sau Phase 3

```
orders-report/
+-- js/
    +-- tab-social/
        +-- ... (existing files)
        +-- tab-social-sale.js          # NEW - Tao phieu ban
        +-- tab-social-export.js        # NEW - Export Excel
```

### Sau Phase 4

```
orders-report/
+-- js/
    +-- tab-social/
        +-- ... (existing files)
        +-- tab-social-chat.js          # NEW - Chat modal
        +-- tab-social-pancake.js       # NEW - Pancake import
```

---

## 8. Notes

### 8.1 Development Guidelines

- **UI-First Approach**: Tao UI hoan chinh voi mock data truoc, sau do moi ket noi Firebase
- **Clone tu Tab1**: Toi da reuse code/styles tu Tab1 de dam bao consistency
- **Incremental Development**: Hoan thanh tung phase truoc khi chuyen sang phase tiep theo
- **Testing**: Test ky moi phase truoc khi commit

### 8.2 Key Differences vs Tab1

| Feature      | Tab1                 | Tab Social |
| ------------ | -------------------- | ---------- |
| Data source  | TPOS API             | Firebase   |
| Realtime     | Required (WebSocket) | Optional   |
| Campaign     | Required             | None       |
| Post URL     | None                 | Required   |
| Create order | Auto from livestream | Manual     |

### 8.3 localStorage Keys

| Key                                | Mo ta                      | Default                      |
| ---------------------------------- | -------------------------- | ---------------------------- |
| `socialOrderTableColumnVisibility` | Column visibility settings | All visible except "Dia chi" |

### 8.4 Firebase Paths

| Path                       | Mo ta                    |
| -------------------------- | ------------------------ |
| `/social-orders/{orderId}` | Order data               |
| `/social-tags/{tagId}`     | Tag definitions (future) |

---

## 9. Changelog

| Date       | Version | Changes                                      |
| ---------- | ------- | -------------------------------------------- |
| 2026-01-24 | 1.0     | Initial design document                      |
| 2026-01-24 | 1.1     | Phase 1 completed - UI with mock data        |
| 2026-01-25 | 1.2     | Added column visibility, date filters        |
| 2026-01-25 | 1.3     | Filter consolidation, removed stats-bar      |
| 2026-01-25 | 2.0     | Added detailed Phase 2-5 implementation plan |

---

> **Current Status**: Phase 1 COMPLETE. Ready for Phase 2 (Firebase Integration).
