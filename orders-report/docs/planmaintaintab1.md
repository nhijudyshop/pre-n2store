# KẾ HOẠCH BẢO TRÌ VÀ TỐI ƯU TAB1-ORDER

> **Mục đích:** Tài liệu này giúp AI Agent và developer hiểu rõ cấu trúc, flow, và các vấn đề cần tối ưu của module Tab1-Order.
>
> **Cập nhật:** 2025-01-15

---

## MỤC LỤC

1. [Tổng Quan Module](#1-tổng-quan-module)
2. [Cấu Trúc Files](#2-cấu-trúc-files)
3. [Luồng Khởi Tạo](#3-luồng-khởi-tạo)
4. [Quản Lý State](#4-quản-lý-state)
5. [API Endpoints](#5-api-endpoints)
6. [Các Tính Năng Chi Tiết](#6-các-tính-năng-chi-tiết)
7. [Hệ Thống Realtime](#7-hệ-thống-realtime)
8. [Phân Tích Vấn Đề Kiến Trúc](#8-phân-tích-vấn-đề-kiến-trúc)
9. [Kế Hoạch Tối Ưu](#9-kế-hoạch-tối-ưu)
10. [Hướng Dẫn Triển Khai](#10-hướng-dẫn-triển-khai)

---

## 1. TỔNG QUAN MODULE

### Tab1-Order là gì?

Tab1-Order là module quản lý **đơn hàng online** (Sale Online Orders) trong hệ thống orders-report. Đây là tab chính mà nhân viên sử dụng hàng ngày để:

- **Xem danh sách đơn hàng** từ các chiến dịch livestream
- **Tìm kiếm và lọc** đơn theo nhiều tiêu chí
- **Gán tag** để phân loại đơn (đã xử lý, chờ xác nhận, v.v.)
- **Chat với khách hàng** qua tin nhắn Facebook/bình luận
- **Chỉnh sửa thông tin đơn** (địa chỉ, sản phẩm, ghi chú)
- **Tạo phiếu bán hàng** để xuất kho

### Quy mô dữ liệu

- Trung bình: **2,000-3,000 đơn hàng** mỗi chiến dịch
- Mỗi đơn có: ~50 trường dữ liệu, tin nhắn, bình luận, tags
- Nhiều user cùng làm việc → cần **đồng bộ realtime**

---

## 2. CẤU TRÚC FILES

```
orders-report/js/tab1/
│
├── tab1-core.js           # Biến toàn cục, state management, cache
├── tab1-init.js           # Khởi tạo app, event listeners, Firebase connection
├── tab1-table.js          # Render bảng, sorting, infinite scroll
├── tab1-search.js         # Tìm kiếm, lọc, fetch orders từ API
├── tab1-edit-modal.js     # Modal chỉnh sửa đơn hàng
├── tab1-tags.js           # Quản lý tags (gán, xóa, quick assign)
├── tab1-bulk-tags.js      # Gán tag hàng loạt
├── tab1-chat.js           # Modal chat tin nhắn
├── tab1-firebase.js       # Firebase realtime sync (tags, employee ranges)
├── tab1-employee.js       # Phân chia nhân viên theo STT range
├── tab1-merge.js          # Gộp đơn hàng cùng SĐT
├── tab1-qr-debt.js        # QR code và công nợ khách hàng
├── tab1-sale.js           # Tạo phiếu bán hàng (PBH)
├── tab1-fast-sale.js      # Tạo nhanh PBH nhiều đơn
├── tab1-encoding.js       # Decode/encode ghi chú sản phẩm
├── tab1-checkbox.js       # Quản lý checkbox selection
└── tab1-campaign-*.js     # Quản lý campaigns
```

### Giải thích vai trò từng file

| File | Vai trò | Khi nào được gọi |
|------|---------|------------------|
| `tab1-core.js` | Định nghĩa tất cả biến toàn cục (allData, filteredData, displayedData) | Load đầu tiên |
| `tab1-init.js` | Khởi tạo app, setup event listeners, kết nối Firebase | Khi DOM ready |
| `tab1-search.js` | Fetch đơn hàng từ API, filter, search | User tải chiến dịch |
| `tab1-table.js` | Render bảng HTML, xử lý scroll, sorting | Sau khi có data |
| `tab1-firebase.js` | Lắng nghe thay đổi tag từ Firebase để đồng bộ | Sau init |

---

## 3. LUỒNG KHỞI TẠO

### Giải thích bằng tiếng Việt đơn giản

Khi user mở Tab1, hệ thống thực hiện các bước sau:

```
1. TRANG WEB LOAD
   │
   ├── Load tất cả file JavaScript
   ├── Áp dụng font size từ localStorage
   └── Dọn dẹp localStorage nếu gần đầy (>4MB)
   │
2. DOM READY (DOMContentLoaded)
   │
   ├── Setup các event listener cho buttons
   ├── Khởi tạo Token Manager (để gọi API)
   ├── Khởi tạo Pancake Manager (để lấy tin nhắn)
   ├── Khởi tạo Realtime Manager (để nhận tin nhắn mới)
   │
3. KHỞI TẠO APP (initializeApp)
   │
   ├── Chờ Firebase sẵn sàng (tối đa 10 giây)
   ├── Load danh sách chiến dịch
   ├── Load chiến dịch đang hoạt động
   ├── Load cấu hình phân chia nhân viên
   │
4. TẢI DỮ LIỆU (fetchOrders)
   │
   ├── PHASE 1: Tải 50 đơn đầu tiên → Hiển thị ngay
   │
   ├── PHASE 2 (chạy nền):
   │   ├── Tải tiếp các đơn còn lại (mỗi lần 1000 đơn)
   │   ├── Cập nhật bảng mỗi 200 đơn
   │   └── Tải tin nhắn/bình luận song song
   │
   └── HOÀN TẤT: Hiển thị toàn bộ đơn hàng
```

### Tại sao chia làm 2 phase?

- **Phase 1 (50 đơn):** User thấy kết quả ngay lập tức, không phải chờ đợi
- **Phase 2 (nền):** Tải dần phần còn lại, user vẫn có thể thao tác

---

## 4. QUẢN LÝ STATE

### Các biến toàn cục quan trọng

```javascript
// Dữ liệu đơn hàng
let allData = [];           // TẤT CẢ đơn hàng đã tải từ API
let filteredData = [];      // Đơn hàng SAU KHI lọc (search, status, tag)
let displayedData = [];     // Đơn hàng ĐANG HIỂN THỊ (sau employee filter)

// Trạng thái
let isLoading = false;              // Đang tải dữ liệu?
let isLoadingInBackground = false;  // Đang tải nền?
let isRendering = false;            // Đang render bảng?

// Cấu hình
let employeeRanges = [];    // Danh sách phân chia STT theo nhân viên
let availableTags = [];     // Danh sách tags có sẵn
let selectedOrderIds = new Set();  // Các đơn đang được chọn (checkbox)

// Cache
const orderDetailsCache = new Map();  // Cache chi tiết đơn hàng (5 phút)
```

### Luồng dữ liệu

```
API Response
    │
    ▼
┌─────────────┐
│  allData    │  ← Tất cả đơn hàng gốc từ API
└─────────────┘
    │
    │ Search + Status Filter + Tag Filter
    ▼
┌─────────────┐
│filteredData │  ← Đơn hàng sau khi lọc
└─────────────┘
    │
    │ Employee STT Range Filter
    ▼
┌─────────────┐
│displayedData│  ← Đơn hàng user nhìn thấy
└─────────────┘
    │
    │ Render to DOM
    ▼
┌─────────────┐
│   Bảng HTML │
└─────────────┘
```

---

## 5. API ENDPOINTS

### TPOS OData API (Đơn hàng, Tags)

Tất cả API đi qua Cloudflare Worker: `https://chatomni-proxy.nhijudyshop.workers.dev`

| Endpoint | Phương thức | Mục đích |
|----------|-------------|----------|
| `/api/odata/SaleOnline_Order/ODataService.GetView` | GET | Lấy danh sách đơn hàng |
| `/api/odata/SaleOnline_Order({id})?$expand=Details,Partner` | GET | Lấy chi tiết 1 đơn |
| `/api/odata/SaleOnline_Order({id})` | PUT | Cập nhật đơn hàng |
| `/api/odata/TagSaleOnlineOrder/ODataService.AssignTag` | POST | Gán tag cho đơn |
| `/api/odata/Tag?$top=1000` | GET | Lấy danh sách tags |
| `/api/odata/SaleOnline_LiveCampaign` | GET | Lấy danh sách chiến dịch |

### Pancake API (Tin nhắn, Bình luận)

| Endpoint | Phương thức | Mục đích |
|----------|-------------|----------|
| `/api/v1/pages` | GET | Lấy danh sách Facebook pages |
| `/api/v1/conversations` | GET | Lấy danh sách hội thoại |
| `/api/v1/pages/{pageId}/conversations/{convId}/messages` | GET | Lấy tin nhắn |
| `/api/v1/conversations/mark_read` | POST | Đánh dấu đã đọc |

### SePay API (Công nợ)

| Endpoint | Phương thức | Mục đích |
|----------|-------------|----------|
| `/api/sepay/debt-summary-batch` | POST | Lấy công nợ nhiều SĐT cùng lúc |
| `/api/sepay/stream` | SSE | Nhận thông báo giao dịch mới |

---

## 6. CÁC TÍNH NĂNG CHI TIẾT

### 6.1 Hiển Thị Bảng Đơn Hàng

**Các cột trong bảng:**

| Cột | Dữ liệu | Ghi chú |
|-----|---------|---------|
| ☐ | Checkbox | Chọn nhiều đơn để thao tác hàng loạt |
| ⚙ | Thao tác | Nút Edit, Quick Tag |
| STT | SessionIndex | Số thứ tự trong chiến dịch |
| Nhân viên | Badge màu | Dựa vào STT range |
| TAG | Tag buttons | Có thể click để gán/xóa |
| Mã ĐH | Code | Mã đơn hàng |
| Khách hàng | Name | Tên + badge trạng thái |
| SĐT | Telephone | + nút copy |
| Tin nhắn | Last message | Preview + unread indicator |
| Bình luận | Last comment | Preview + unread indicator |
| QR | QR button | Mã QR thanh toán |
| Công Nợ | Debt amount | Số tiền còn nợ |
| Địa chỉ | Address | Địa chỉ giao hàng |
| Ghi chú | Note | Ghi chú đơn hàng |
| Tổng tiền | TotalAmount | Giá trị đơn hàng |
| SL | TotalQuantity | Số lượng sản phẩm |
| Ngày tạo | DateCreated | Thời gian tạo đơn |
| Trạng thái | Status | Nháp/Đơn hàng/Hủy bỏ |

### 6.2 Infinite Scroll (Cuộn vô hạn)

**Cách hoạt động:**

1. Ban đầu chỉ render 50 dòng đầu tiên
2. Khi user cuộn xuống gần cuối bảng
3. Tự động render thêm 50 dòng tiếp theo
4. Lặp lại cho đến hết dữ liệu

**Vấn đề hiện tại:** Đây KHÔNG phải true virtualization - DOM vẫn tăng lên 2500+ rows!

### 6.3 Quản Lý Tags

**Quick Tag:** Gán nhanh tag "xử lý" hoặc "ok" bằng 1 click

**Tag Modal:** Mở popup để quản lý nhiều tags cho 1 đơn

**Bulk Tag:** Chọn nhiều đơn → Gán tag hàng loạt

**Realtime Sync:** Khi user A gán tag, user B sẽ thấy ngay lập tức (qua Firebase)

### 6.4 Edit Order Modal

**7 tabs trong modal:**

1. **Thông tin liên hệ:** Tên, SĐT, Địa chỉ, Ghi chú
2. **Sản phẩm:** Danh sách SP, thêm/xóa/sửa số lượng
3. **Thông tin giao hàng:** Chi tiết vận chuyển
4. **Lịch sử đơn live:** Thông tin từ livestream
5. **Thông tin hóa đơn:** Chi tiết invoice
6. **Lịch sử hóa đơn:** Các hóa đơn trước của khách
7. **Lịch sử chỉnh sửa:** Audit log ai sửa gì lúc nào

### 6.5 Chat Modal

- Xem toàn bộ tin nhắn với khách
- Gửi tin nhắn text
- Gửi hình ảnh (paste hoặc upload)
- Xem bình luận Facebook
- Reply bình luận

---

## 7. HỆ THỐNG REALTIME

### Tổng quan 3 kênh realtime

```
┌─────────────────────────────────────────────────────────────────┐
│                    3 KÊNH REALTIME                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │  FIREBASE RTDB    │  │  PANCAKE WS   │  │   DEBT SSE      │ │
│  │  (Đồng bộ Tags)   │  │  (Tin nhắn)   │  │   (Công nợ)     │ │
│  └─────────┬─────────┘  └───────┬───────┘  └────────┬────────┘ │
│            │                    │                    │          │
│            ▼                    ▼                    ▼          │
│  • tag_updates          • Tin nhắn mới      • Giao dịch mới   │
│  • kpi_base             • Bình luận mới     • Cập nhật nợ     │
│  • employee_ranges      • Unread counts                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.1 Firebase Realtime Database

**Dùng để làm gì?**
- Đồng bộ TAG giữa các nhân viên
- Lưu trạng thái KPI BASE
- Lưu cấu hình phân chia nhân viên
- Lưu thông tin chiến dịch

**Cách hoạt động:**

```
User A gán tag "XỬ LÝ" cho đơn #42
         │
         ├── 1. Gọi API TPOS để lưu tag
         │
         ├── 2. Ghi vào Firebase: tag_updates/order-id-123
         │      {
         │        orderId: "order-id-123",
         │        orderCode: "SO0042",
         │        STT: 42,
         │        tags: [{Id: 1, Name: "XỬ LÝ", Color: "#ff0000"}],
         │        updatedBy: "User A",
         │        timestamp: 1705123456789
         │      }
         │
         └── 3. Firebase phát sự kiện đến tất cả clients
                    │
                    ▼
         User B nhận được sự kiện
                    │
                    ├── Bỏ qua nếu là update của chính mình
                    ├── Bỏ qua nếu đơn không trong range của mình
                    │
                    └── Cập nhật cell TAG trong bảng (KHÔNG re-render toàn bảng)
```

### 7.2 Pancake WebSocket

**Dùng để làm gì?**
- Nhận tin nhắn mới từ khách hàng
- Nhận bình luận mới
- Cập nhật số tin chưa đọc

**2 chế độ kết nối:**

1. **Browser Mode:** Kết nối trực tiếp từ trình duyệt đến Pancake.vn
2. **Server Mode:** Render server duy trì kết nối 24/7, forward về browser

### 7.3 Debt SSE (Server-Sent Events)

**Dùng để làm gì?**
- Nhận thông báo khi có giao dịch chuyển khoản mới
- Tự động cập nhật số tiền công nợ

**Cách hoạt động:**

```
Khách chuyển khoản 500.000đ
         │
         ▼
SePay API phát sự kiện "new-transaction"
         │
         ▼
Browser nhận qua EventSource
         │
         ├── Trích xuất SĐT từ nội dung chuyển khoản
         ├── Xóa cache công nợ cũ
         ├── Gọi API lấy công nợ mới
         │
         └── Cập nhật cột "Công Nợ" trong bảng
```

### 7.4 TPOS OData - KHÔNG CÓ REALTIME!

**Vấn đề quan trọng:**
- TPOS API là REST thuần túy, KHÔNG có WebSocket/SSE
- Khi user A sửa đơn, user B KHÔNG thấy ngay
- Phải bấm "Tải lại" để thấy thay đổi

---

## 8. PHÂN TÍCH VẤN ĐỀ KIẾN TRÚC

### 8.1 Tóm Tắt 5 Vấn Đề Nghiêm Trọng

| # | Vấn đề | Mức độ | Ảnh hưởng |
|---|--------|--------|-----------|
| 1 | **Infinite Scroll giả** | 🔴 NGHIÊM TRỌNG | DOM tăng lên 2500+ rows, trình duyệt chậm |
| 2 | **Re-render liên tục** | 🔴 NGHIÊM TRỌNG | Gọi performTableSearch() 12-15 lần khi tải |
| 3 | **Nhân bản dữ liệu 3 lần** | 🟠 CAO | 15MB+ RAM bị lãng phí |
| 4 | **Tìm kiếm O(n²)** | 🟠 CAO | findIndex() + re-render mỗi lần cập nhật |
| 5 | **Firebase listener tràn** | 🟠 CAO | child_added fire cho TẤT CẢ data cũ |

### 8.2 Giải Thích Chi Tiết Từng Vấn Đề

#### Vấn đề 1: Infinite Scroll Giả

**Hiện tại:**
```javascript
function loadMoreRows() {
    // THÊM 50 rows mới vào cuối bảng
    nextBatch.forEach(order => {
        tbody.appendChild(newRow);  // Rows cũ VẪN CÒN trong DOM!
    });
}
```

**Vấn đề:**
- Sau khi cuộn hết, DOM có 2500+ rows
- Mỗi row có 18 cột, mỗi cột có event handlers
- Tổng: 45,000 elements + 12,500 event listeners
- Trình duyệt phải quản lý tất cả → LAG

**Giải pháp cần:**
- True virtualization: Chỉ giữ ~50 rows trong DOM
- Khi scroll, THAY ĐỔI nội dung rows cũ thay vì tạo mới
- Rows ngoài viewport bị "recycle" để hiển thị data khác

#### Vấn đề 2: Re-render Liên Tục

**Hiện tại:**
```javascript
// Khi tải nền, cứ 200 đơn lại render 1 lần
while (hasMore) {
    allData = allData.concat(orders);

    if (allData.length - lastUpdateCount >= 200) {
        performTableSearch();  // Re-render TOÀN BỘ bảng!
        lastUpdateCount = allData.length;
    }
}
```

**Vấn đề:**
- Tải 2500 đơn → 2500/200 = 12.5 lần re-render
- Mỗi lần: filter O(n) + sort O(n log n) + render O(n)
- CPU bị chiếm dụng, UI giật

**Giải pháp cần:**
- Debounce: Chỉ render 1 lần mỗi 500ms
- Hoặc dùng requestAnimationFrame

#### Vấn đề 3: Nhân Bản Dữ Liệu 3 Lần

**Hiện tại:**
```javascript
let allData = [];           // 2500 đơn × 2KB = 5MB
let filteredData = [];      // Copy của allData = 5MB
let displayedData = [];     // Copy của filteredData = 5MB
```

**Trong performTableSearch():**
```javascript
let tempData = searchQuery
    ? allData.filter(...)   // Tạo array mới 5MB
    : [...allData];         // Copy TOÀN BỘ array 5MB!

tempData = tempData.filter(employeeFilter);   // Lại copy
tempData = tempData.filter(statusFilter);     // Lại copy
tempData = tempData.filter(tagFilter);        // Lại copy
```

**Vấn đề:**
- Peak memory: 5 + 5 + 4.8 + 4.6 = 19.4MB chỉ cho việc filter!
- Garbage collector phải dọn dẹp liên tục

**Giải pháp cần:**
- Dùng Map<orderId, order> thay vì Array
- Chỉ lưu IDs cho filtered/displayed
- Memoization để không filter lại nếu không đổi

#### Vấn đề 4: Tìm Kiếm O(n²)

**Hiện tại:**
```javascript
function updateOrderInTable(orderId, data) {
    // 3 lần findIndex, mỗi lần duyệt 2500 phần tử
    const indexInAll = allData.findIndex(o => o.Id === orderId);
    const indexInFiltered = filteredData.findIndex(o => o.Id === orderId);
    const indexInDisplayed = displayedData.findIndex(o => o.Id === orderId);

    // Rồi lại render toàn bộ!
    performTableSearch();
}
```

**Vấn đề:**
- findIndex() là O(n) - duyệt từ đầu đến khi tìm thấy
- 3 arrays × O(n) = O(3n) mỗi lần cập nhật
- Nếu cập nhật 100 đơn: 100 × O(3n) × performTableSearch() = O(n²)

**Giải pháp cần:**
- Dùng Map<orderId, order> để lookup O(1)
- Chỉ update cell cần thay đổi, không re-render bảng

#### Vấn đề 5: Firebase Listener Tràn

**Hiện tại:**
```javascript
function setupTagRealtimeListeners() {
    // Lắng nghe TOÀN BỘ node /tag_updates
    database.ref('tag_updates').on('child_added', handleAdd);
    // Nếu có 10,000 tag updates trong DB,
    // child_added sẽ fire 10,000 lần khi mới kết nối!
}
```

**Vấn đề:**
- Mỗi lần mở trang = download TẤT CẢ tag_updates cũ
- 10,000 records × 200 bytes = 2MB download thừa
- Hầu hết bị bỏ qua do timestamp check

**Giải pháp cần:**
```javascript
// Chỉ lắng nghe từ thời điểm hiện tại trở đi
database.ref('tag_updates')
    .orderByChild('timestamp')
    .startAt(Date.now())
    .on('child_added', handleAdd);
```

---

## 9. KẾ HOẠCH TỐI ƯU

### Tổng Quan Các Phase

| Phase | Thay đổi | Độ khó | Thời gian | Cải thiện |
|-------|----------|--------|-----------|-----------|
| 1 | OrderStore (Map thay Array) | THẤP | 2 ngày | Lookup 35,000× nhanh hơn |
| 2 | Thêm $select vào API | THẤP | 1 giờ | Giảm 70% payload |
| 3 | Debounce render khi tải nền | THẤP | 2 giờ | Bớt 12 lần re-render |
| 4 | Virtual Table | TRUNG BÌNH | 3 ngày | DOM giảm 50× |
| 5 | Thay thế renderTable() | CAO | 2 ngày | Scroll mượt 60fps |
| 6 | Event delegation | TRUNG BÌNH | 1 ngày | Giảm 12,500 listeners |
| 7 | Firebase query tối ưu | THẤP | 3 giờ | Bớt 2MB download thừa |
| 8 | Web Worker cho sorting | THẤP | 1 ngày | UI không bị freeze |

### Kết Quả Mong Đợi

| Chỉ số | Hiện tại | Sau tối ưu | Cải thiện |
|--------|----------|------------|-----------|
| Render đầu tiên | ~700ms | ~200ms | 3.5× nhanh hơn |
| Tải toàn bộ 2500 đơn | ~3600ms | ~1500ms | 2.4× nhanh hơn |
| RAM sử dụng | ~20MB | ~2MB | 10× ít hơn |
| DOM nodes | 45,000 | 900 | 50× ít hơn |
| Filter đơn hàng | ~400ms | ~50ms | 8× nhanh hơn |
| Scroll FPS | 20-30 | 60 | 2-3× mượt hơn |
| Update tag | ~200ms | ~5ms | 40× nhanh hơn |

---

## 10. HƯỚNG DẪN TRIỂN KHAI

### Phase 2: Thêm $select vào API (KHUYẾN NGHỊ LÀM TRƯỚC)

**Tại sao nên làm trước?**
- Thay đổi nhỏ (3 dòng code)
- Không ảnh hưởng logic hiện tại
- Hiệu quả ngay lập tức (giảm 70% download)

**File cần sửa:** `D:\n2store\n2store\orders-report\js\tab1\tab1-search.js`

**Bước 1:** Định nghĩa fields cần thiết (thêm sau line ~1160)

```javascript
// Fields cần thiết cho table view (giảm 70% payload)
const SELECT_FIELDS = [
    'Id', 'Code', 'Name', 'Telephone', 'Address', 'Note',
    'TotalAmount', 'TotalQuantity', 'Status', 'StatusText',
    'DateCreated', 'Tags', 'SessionIndex', 'PartnerId',
    'Facebook_ASUserId', 'Facebook_PostId', 'Facebook_CommentId',
    'PartnerStatusText', 'LiveCampaignId', 'LiveCampaignName',
    'UserId', 'UserName'
].join(',');
```

**Bước 2:** Thêm $select vào URL Phase 1 (line 1169)

```javascript
// TRƯỚC
const firstUrl = `...GetView?$top=${INITIAL_PAGE_SIZE}&$skip=${skip}&$orderby=...&$filter=...&$count=true`;

// SAU
const firstUrl = `...GetView?$top=${INITIAL_PAGE_SIZE}&$skip=${skip}&$orderby=...&$filter=...&$count=true&$select=${SELECT_FIELDS}`;
```

**Bước 3:** Thêm $select vào URL Phase 2 (line 1273)

```javascript
// TRƯỚC
const url = `...GetView?$top=${PAGE_SIZE}&$skip=${skip}&$orderby=...&$filter=...`;

// SAU
const url = `...GetView?$top=${PAGE_SIZE}&$skip=${skip}&$orderby=...&$filter=...&$select=${SELECT_FIELDS}`;
```

**Kiểm tra:**
1. Mở Chrome DevTools → Network tab
2. Tải chiến dịch
3. Kiểm tra response size (phải giảm ~70%)
4. Kiểm tra tất cả cột hiển thị đúng

### Phase 7: Firebase Query Optimization

**File cần sửa:** `D:\n2store\n2store\orders-report\js\tab1\tab1-firebase.js`

**Thay đổi:**

```javascript
// TRƯỚC (line 150-186)
function setupTagRealtimeListeners() {
    database.ref('tag_updates').on('child_changed', handleUpdate);
    database.ref('tag_updates').on('child_added', handleAdd);
}

// SAU
function setupTagRealtimeListeners() {
    const startTime = Date.now();

    // Chỉ lắng nghe updates mới (không download data cũ)
    const query = database.ref('tag_updates')
        .orderByChild('timestamp')
        .startAt(startTime);

    query.on('child_added', handleAdd);
    query.on('child_changed', handleUpdate);
}
```

---

## PHỤ LỤC: THAM KHẢO NHANH

### Console Debug Prefixes

```
[TAG-REALTIME]  - Tag sync logs
[PANCAKE]       - Pancake API logs
[CHAT]          - Chat modal logs
[CACHE]         - Cache operations
[APP]           - App initialization
[EMPLOYEE]      - Employee range logs
[UPDATE]        - Order update logs
[DEBT]          - Debt/wallet logs
```

### Kiểm tra state trong Console

```javascript
console.log('allData:', allData.length);
console.log('filteredData:', filteredData.length);
console.log('displayedData:', displayedData.length);
console.log('selectedOrderIds:', selectedOrderIds.size);
console.log('employeeRanges:', employeeRanges);
```

### Test Firebase listeners

```javascript
// Gọi trong Console
testTagListeners();
```

---

*Tài liệu này được tạo để hỗ trợ AI Agent và developer trong việc bảo trì và tối ưu module Tab1-Order.*
