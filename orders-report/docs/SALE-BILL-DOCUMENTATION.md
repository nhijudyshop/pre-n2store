# Tạo Phiếu Bán Hàng - Documentation Chi Tiết

> **Module**: `/orders-report/`
> **Phiên bản tài liệu**: 2025-01-29
> **Mục đích**: Hướng dẫn chi tiết tính năng tạo phiếu bán hàng cho 1 đơn và nhiều đơn

---

## MỤC LỤC

1. [Tổng Quan](#1-tổng-quan)
2. [Phiếu Bán Hàng Đơn Lẻ](#2-phiếu-bán-hàng-đơn-lẻ-single-order-sale)
3. [Phiếu Bán Hàng Nhanh](#3-phiếu-bán-hàng-nhanh-fast-sale---multiple-orders)
4. [Bill Service](#4-bill-service-dịch-vụ-tạo-hóa-đơn)
5. [Sequence Diagrams](#5-sequence-diagrams)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. TỔNG QUAN

### 1.1 Mô tả tính năng

| Tính năng | Mô tả | Use case |
|-----------|-------|----------|
| **Phiếu bán hàng đơn lẻ** | Tạo và in phiếu cho từng đơn hàng, cho phép chỉnh sửa thông tin, thêm/xóa sản phẩm | Đơn hàng cần xử lý riêng lẻ, cần điều chỉnh thông tin |
| **Phiếu bán hàng nhanh** | Tạo hàng loạt phiếu cho nhiều đơn đã chọn | Xử lý cao điểm, nhiều đơn cùng lúc |

### 1.2 Files liên quan

| File | Đường dẫn | Mô tả |
|------|-----------|-------|
| `tab1-sale.js` | `orders-report/js/tab1/tab1-sale.js` | Logic xử lý phiếu bán hàng đơn lẻ |
| `tab1-fast-sale.js` | `orders-report/js/tab1/tab1-fast-sale.js` | Logic xử lý phiếu bán hàng nhanh |
| `bill-service.js` | `orders-report/js/utils/bill-service.js` | Service tạo HTML bill, in, gửi cho khách |
| `tab1-orders.html` | `orders-report/tab1-orders.html` | Modal HTML (lines 2769-3111) |

### 1.3 Dependencies

- `billTokenManager` - Quản lý xác thực TPOS cho tạo bill
- `tokenManager` - Quản lý xác thực chung
- `productSearchManager` - Tìm kiếm sản phẩm
- `InvoiceStatusStore` - Lưu trạng thái hóa đơn
- `notificationManager` - Hiển thị thông báo

---

## 2. PHIẾU BÁN HÀNG ĐƠN LẺ (Single Order Sale)

### 2.1 PHẦN KỸ THUẬT (For AI Agents)

#### Entry Point
```javascript
openSaleButtonModal(orderId)
```

#### Core Functions & Flow

| Function | File:Line | Description |
|----------|-----------|-------------|
| `openSaleButtonModal()` | tab1-orders.js | Mở modal, fetch order details |
| `populateSaleModalWithOrder(order)` | tab1-sale.js | Populate form với data |
| `fetchOrderDetailsForSale(orderUuid)` | tab1-sale.js | GET order từ API với $expand |
| `initSaleProductSearch()` | tab1-sale.js:116 | Khởi tạo tìm kiếm sản phẩm |
| `addProductToSaleFromSearch(productId)` | tab1-sale.js:238 | Thêm sản phẩm vào đơn |
| `updateSaleOrderWithAPI()` | tab1-sale.js:398 | Sync changes via PUT API |
| `confirmAndPrintSale()` | tab1-sale.js:598 | Submit và in phiếu (F9) |
| `buildSaleOrderModelForInsertList()` | tab1-sale.js:858 | Build payload cho API |

#### API Endpoints

**1. GET Order Details:**
```http
GET /api/odata/SaleOnline_Order({id})?$expand=Details,Partner,User,CRMTeam
Authorization: Bearer {token}
```

**2. PUT Update Order (khi thêm/xóa sản phẩm):**
```http
PUT /api/odata/SaleOnline_Order({id})
Content-Type: application/json

{
  "@odata.context": "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order...",
  "RowVersion": "base64-string",
  "Details": [...],
  "TotalAmount": 500000,
  "TotalQuantity": 3
}
```

**3. POST Create/Approve Order:**
```http
POST /api/odata/FastSaleOrder/InsertListOrderModel?isForce=true&$expand=DataErrorFast($expand=Partner,OrderLines),OrdersError($expand=Partner,OrderLines),OrdersSucessed($expand=Partner,OrderLines)
Content-Type: application/json

{
  "is_approve": true,
  "model": [orderModel]
}
```

#### Data Structures

```javascript
// currentSaleOrderData - Dữ liệu đơn hàng hiện tại
{
  Id: "uuid",
  Code: "ORD001",
  orderLines: [{
    ProductId: 123,
    ProductUOMId: 1,
    ProductUOMQty: 2,
    PriceUnit: 150000,
    ProductName: "Áo thun",
    Note: "100k",           // Ghi chú giá thực (nếu giảm giá)
    Weight: 200,
    SaleOnlineDetailId: 456 // CRITICAL - ID của detail để API update đúng
  }],
  Partner: {
    Name: "Nguyễn Văn A",
    Phone: "0909123456",
    Street: "123 Nguyễn Huệ, Q1"
  },
  Tags: "[{\"Name\":\"GIẢM GIÁ\",\"Color\":\"#f59e0b\"}]"
}

// InsertListOrderModel Payload - Gửi lên API
{
  is_approve: true,
  model: [{
    PartnerId: "uuid",
    PartnerDisplayName: "Nguyễn Văn A",
    PartnerPhone: "0909123456",
    ReceiverName: "Nguyễn Văn A",
    ReceiverPhone: "0909123456",
    ReceiverAddress: "123 Nguyễn Huệ, Q1",
    AmountTotal: 500000,
    TotalQuantity: 3,
    DecreaseAmount: 80000,      // Giảm giá
    DeliveryPrice: 35000,       // Phí ship
    CarrierId: 789,
    CarrierName: "SHIP TỈNH",
    CashOnDelivery: 455000,     // COD = Total - Prepaid
    PaymentAmount: 200000,      // Trả trước từ ví
    OrderLines: [{
      ProductId: 123,
      PriceUnit: 150000,
      ProductUOMQty: 2,
      Note: "100k"
    }],
    Partner: { ... },
    Carrier: { ... }
  }]
}
```

#### HTML Elements

| Element ID | Type | Mô tả |
|------------|------|-------|
| `saleButtonModal` | Modal | Container modal chính |
| `saleReceiverName` | Input | Tên người nhận |
| `saleReceiverPhone` | Input | SĐT người nhận |
| `saleReceiverAddress` | Textarea | Địa chỉ người nhận |
| `saleDeliveryPartner` | Select | Dropdown chọn đối tác vận chuyển |
| `saleShippingFee` | Input | Phí ship |
| `saleDiscount` | Input | Giảm giá |
| `salePrepaidAmount` | Input | Số tiền trả trước (từ ví) |
| `saleCOD` | Input | Số tiền COD còn lại |
| `saleProductSearch` | Input | Ô tìm kiếm sản phẩm (F2) |
| `saleBillTypeWeb` | Radio | Chọn in bill Web |
| `saleBillTypeTpos` | Radio | Chọn in bill TPOS |

#### Keyboard Shortcuts

| Phím | Chức năng |
|------|-----------|
| `F2` | Focus ô tìm kiếm sản phẩm |
| `F9` | Xác nhận và in phiếu |
| `Escape` | Đóng modal |

---

### 2.2 PHẦN NGỮ NGHĨA (Flow cho người dùng đọc)

#### Luồng hoạt động từng bước

```
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 1: NGƯỜI DÙNG CLICK "TẠO PHIẾU" TRÊN 1 ĐƠN HÀNG           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 2: HỆ THỐNG MỞ MODAL "PHIẾU BÁN HÀNG"                     │
│                                                                 │
│  • Tải thông tin đơn hàng từ API (tên, SĐT, địa chỉ)           │
│  • Tải danh sách sản phẩm trong đơn                            │
│  • Tải số dư ví khách hàng (nếu có)                            │
│  • Tự động chọn đối tác vận chuyển theo địa chỉ                │
│  • Tự động tính giảm giá nếu có tag "GIẢM GIÁ"                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 3: NGƯỜI DÙNG KIỂM TRA VÀ CHỈNH SỬA (NẾU CẦN)             │
│                                                                 │
│  • Sửa thông tin người nhận (tên, SĐT, địa chỉ)                │
│  • Thêm/xóa/sửa sản phẩm (nhấn F2 để tìm kiếm)                 │
│  • Chọn đối tác vận chuyển                                     │
│  • Điều chỉnh phí ship                                         │
│  • Điều chỉnh giảm giá                                         │
│  • Xem số tiền trả trước từ ví                                 │
│  • Xem số tiền COD còn lại                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 4: NGƯỜI DÙNG NHẤN "XÁC NHẬN VÀ IN (F9)"                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 5: HỆ THỐNG XỬ LÝ                                         │
│                                                                 │
│  a) Kiểm tra thông tin bắt buộc:                               │
│     - Phải có số điện thoại                                    │
│     - Phải có địa chỉ                                          │
│     - Phải chọn đối tác vận chuyển                             │
│                                                                 │
│  b) Gọi API InsertListOrderModel với is_approve=true           │
│                                                                 │
│  c) Lưu trạng thái hóa đơn vào:                                │
│     - InvoiceStatusStore (local)                               │
│     - Firebase (cloud)                                         │
│                                                                 │
│  d) Nếu có số dư ví > 0:                                       │
│     → Ghi nhận trừ ví qua pending-withdrawals API              │
│     → Sử dụng Outbox pattern (đảm bảo 100% không mất giao dịch)│
│                                                                 │
│  e) Mở popup in phiếu:                                         │
│     - Web template: Tạo local bằng JavaScript                  │
│     - TPOS template: Fetch từ API TPOS                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 6: KẾT QUẢ                                                │
│                                                                 │
│  ✓ Đơn hàng được tạo thành công                                │
│  ✓ Phiếu được in                                               │
│  ✓ Modal tự động đóng                                          │
│  ✓ Thông báo thành công hiển thị                               │
└─────────────────────────────────────────────────────────────────┘
```

#### Xử lý công nợ & ví khách hàng

| Bước | Mô tả | Công thức |
|------|-------|-----------|
| 1 | Tải số dư ví từ API | `GET /api/wallet/batch-summary` |
| 2 | Tính trả trước | `Trả trước = min(Số dư ví, Tổng tiền)` |
| 3 | Tính COD còn lại | `COD = Tổng tiền - Trả trước` |
| 4 | Sau khi tạo đơn | Ghi nhận trừ ví qua `pending-withdrawals` API |

**Ví dụ:**
- Tổng tiền đơn: 500.000đ
- Số dư ví khách: 200.000đ
- → Trả trước: 200.000đ
- → COD còn lại: 300.000đ

#### Xử lý giảm giá tự động

Hệ thống tự động phát hiện và tính giảm giá khi:

1. **Đơn hàng có tag "GIẢM GIÁ"**
2. **Ghi chú sản phẩm chứa giá bán thực**

**Cách parse giá từ ghi chú:**
| Ghi chú | Giá bán thực |
|---------|--------------|
| `100k` | 100.000đ |
| `100K` | 100.000đ |
| `100000` | 100.000đ |
| `100.000` | 100.000đ |
| `50` | 50.000đ (số < 1000 tự nhân 1000) |

**Công thức:**
```
Giảm giá = Giá gốc - Giá bán thực
```

**Ví dụ:**
- Sản phẩm: Áo thun, giá gốc 180.000đ
- Ghi chú: "100k"
- → Giảm giá: 180.000 - 100.000 = 80.000đ

---

## 3. PHIẾU BÁN HÀNG NHANH (Fast Sale - Multiple Orders)

### 3.1 PHẦN KỸ THUẬT (For AI Agents)

#### Entry Point
```javascript
showFastSaleModal()
```

#### Core Functions & Flow

| Function | File:Line | Description |
|----------|-----------|-------------|
| `showFastSaleModal()` | tab1-fast-sale.js:279 | Mở modal, fetch batch data |
| `fetchFastSaleOrdersData(orderIds)` | tab1-fast-sale.js:473 | Batch fetch với pagination 200/request |
| `fetchWalletBalancesForFastSale(phones)` | tab1-fast-sale.js:191 | Batch fetch wallet balances |
| `renderFastSaleModalBody()` | tab1-fast-sale.js:576 | Render form cho từng đơn |
| `renderFastSaleOrderRow(order, index, carriers)` | tab1-fast-sale.js:688 | Render 1 row đơn hàng |
| `collectFastSaleData()` | tab1-fast-sale.js | Thu thập data từ forms |
| `saveFastSaleOrders(isApprove)` | tab1-fast-sale.js | Submit batch orders |
| `confirmFastSale()` | tab1-fast-sale.js | Lưu (không approve) |
| `confirmAndCheckFastSale()` | tab1-fast-sale.js | Lưu + approve + in |
| `updateFastSaleShippingFee(index)` | tab1-fast-sale.js:912 | Cập nhật phí ship khi đổi carrier |
| `smartSelectCarrierForRow(select, address)` | tab1-fast-sale.js:969 | Tự động chọn carrier theo địa chỉ |

#### API Endpoints

**1. POST Batch Get Orders:**
```http
POST /api/odata/FastSaleOrder/ODataService.GetListOrderIds?$expand=OrderLines,Partner,Carrier
Content-Type: application/json

{
  "ids": ["uuid1", "uuid2", "uuid3", ...]
}

// Limit: 200 orders/request (tự động chia batch)
```

**2. POST Batch Wallet Balances:**
```http
POST /api/wallet/batch-summary
Content-Type: application/json

{
  "phones": ["0909123456", "0901234567", ...]
}
```

**3. POST Create/Approve Batch Orders:**
```http
POST /api/odata/FastSaleOrder/InsertListOrderModel?isForce=true&$expand=...
Content-Type: application/json

{
  "is_approve": true,  // hoặc false nếu chỉ lưu nháp
  "model": [order1, order2, order3, ...]
}

// Response:
{
  "OrdersSucessed": [...],   // Đơn thành công
  "OrdersError": [...],      // Đơn lỗi
  "DataErrorFast": [...]     // Đơn cần cưỡng bức
}
```

#### Data Structures

```javascript
// fastSaleOrdersData - Array các đơn hàng
[{
  Id: "uuid",
  Reference: "ORD001",
  SaleOnlineIds: ["sale-uuid"],
  OrderLines: [{
    ProductName: "Áo thun",
    ProductUOMQty: 2,
    PriceUnit: 150000,
    Note: "100k"
  }],
  Partner: {
    Name: "Nguyễn Văn A",
    Phone: "0909123456"
  },
  SessionIndex: "123",           // STT đơn hàng
  SaleOnlineOrder: {...},        // Reference đến đơn gốc
  AmountTotal: 300000
}]

// fastSaleWalletBalances - Map số dư ví theo SĐT
{
  "0909123456": {
    balance: 200000,
    virtualBalance: 0
  },
  "0901234567": {
    balance: 0,
    virtualBalance: 50000
  }
}
```

#### HTML Elements

| Element ID | Type | Mô tả |
|------------|------|-------|
| `fastSaleModal` | Modal | Container modal chính |
| `fastSaleModalBody` | Div | Body chứa danh sách đơn |
| `fastSaleModalSubtitle` | Span | Hiển thị số đơn đã chọn + TK TPOS |
| `fastSaleSearchInput` | Input | Ô tìm kiếm theo SĐT, tên, mã SP |
| `fastSaleCarrier_{index}` | Select | Dropdown chọn carrier cho đơn {index} |
| `fastSaleShippingFee_{index}` | Input | Phí ship cho đơn {index} |
| `fastSaleNote_{index}` | Input | Ghi chú cho đơn {index} |
| `fastSaleBillTypeWeb` | Radio | Chọn in bill Web |
| `fastSaleBillTypeTpos` | Radio | Chọn in bill TPOS |

#### Filtering Logic (trước khi hiển thị)

```javascript
// 1. Bỏ qua đơn giỏ trống
if (order.TotalQuantity === 0) {
  // Không hiển thị - hiển thị cảnh báo
}

// 2. Bỏ qua đơn đã có phiếu xác nhận
if (order.ShowState === 'Đã xác nhận' || order.State === 'open') {
  // Không hiển thị - hiển thị cảnh báo
}
```

---

### 3.2 PHẦN NGỮ NGHĨA (Flow cho người dùng đọc)

#### Luồng hoạt động từng bước

```
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 1: NGƯỜI DÙNG TICK CHỌN NHIỀU ĐƠN HÀNG TRONG BẢNG         │
│         → CLICK "THÊM HÓA ĐƠN NHANH"                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 2: HỆ THỐNG KIỂM TRA VÀ LỌC ĐƠN HÀNG                      │
│                                                                 │
│  ✗ Bỏ qua đơn giỏ trống (không có sản phẩm)                    │
│  ✗ Bỏ qua đơn đã có phiếu "Đã xác nhận"                        │
│  ⚠ Hiển thị cảnh báo nếu có đơn bị bỏ qua                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 3: HỆ THỐNG TẢI DỮ LIỆU HÀNG LOẠT                         │
│                                                                 │
│  • Fetch thông tin đơn hàng (batch 200 đơn/request)            │
│  • Fetch số dư ví khách hàng (batch)                           │
│  • Fetch danh sách đối tác giao hàng                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 4: HỆ THỐNG RENDER MODAL VỚI DANH SÁCH ĐƠN                │
│                                                                 │
│  Mỗi đơn hiển thị:                                             │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ [STT] Tên khách hàng          [Trạng thái]           │      │
│  │       Mã đơn: ORD001                                 │      │
│  │       📞 0909123456                                  │      │
│  │       💰 Số dư ví: 200.000đ                          │      │
│  │       📍 Địa chỉ...                                  │      │
│  │                                                      │      │
│  │       Đối tác: [Dropdown ▼]                          │      │
│  │       Tiền ship: [35.000]                            │      │
│  │       Ghi chú: [CK 200K ACB 29/01]                   │      │
│  ├──────────────────────────────────────────────────────┤      │
│  │ Sản phẩm          | SL | Giá     | Thành tiền | Note │      │
│  │ Áo thun [N2687]   |  2 | 150.000 | 300.000    | 100k │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 5: NGƯỜI DÙNG KIỂM TRA VÀ ĐIỀU CHỈNH (NẾU CẦN)            │
│                                                                 │
│  • Tìm kiếm theo SĐT, tên, mã SP                               │
│  • Chọn đối tác vận chuyển cho từng đơn                        │
│  • Điều chỉnh phí ship                                         │
│  • Thêm/sửa ghi chú                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 6: NGƯỜI DÙNG CHỌN HÀNH ĐỘNG                              │
│                                                                 │
│  ┌─────────────┐   ┌──────────────────┐                        │
│  │    LƯU      │   │   LƯU XÁC NHẬN   │                        │
│  └─────────────┘   └──────────────────┘                        │
│        ↓                    ↓                                   │
│  Tạo phiếu nháp      Tạo + Xác nhận + In                       │
│  (chưa xác nhận)                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 7: HỆ THỐNG XỬ LÝ BATCH                                   │
│                                                                 │
│  a) Thu thập data từ tất cả forms                              │
│                                                                 │
│  b) Validate từng đơn:                                         │
│     - Phải có đối tác vận chuyển                               │
│     - Phải có số điện thoại                                    │
│     - Phải có địa chỉ                                          │
│                                                                 │
│  c) Gọi API InsertListOrderModel với array models              │
│                                                                 │
│  d) Xử lý response:                                            │
│     - OrdersSucessed: đơn thành công                           │
│     - OrdersError: đơn lỗi                                     │
│     - DataErrorFast: đơn cần cưỡng bức                         │
│                                                                 │
│  e) Cập nhật InvoiceStatusStore                                │
│                                                                 │
│  f) Nếu chọn "Lưu xác nhận" → In tất cả phiếu                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 8: MODAL KẾT QUẢ HIỂN THỊ                                 │
│                                                                 │
│  ┌─────────────┬─────────────┬─────────────┐                   │
│  │  THÀNH CÔNG │    LỖI     │  CƯỠNG BỨC  │                   │
│  └─────────────┴─────────────┴─────────────┘                   │
│                                                                 │
│  Tab Thành công:                                               │
│  ✓ Danh sách đơn tạo thành công                                │
│  ✓ Nút "In tất cả"                                             │
│                                                                 │
│  Tab Lỗi:                                                      │
│  ✗ Danh sách đơn thất bại + lý do                              │
│                                                                 │
│  Tab Cưỡng bức:                                                │
│  ⚠ Đơn cần xử lý thủ công                                      │
│  ⚠ Checkbox chọn + nút "Tạo cưỡng bức"                         │
└─────────────────────────────────────────────────────────────────┘
```

#### Tự động sinh ghi chú đơn

Hệ thống tự động tạo ghi chú dựa trên các điều kiện:

| Điều kiện | Format ghi chú | Ví dụ |
|-----------|----------------|-------|
| Có số dư ví | `CK [amount] ACB [date]` | `CK 200K ACB 29/01` |
| Có tag giảm giá | `GG [amount]` | `GG 80K` |
| Có tag gộp đơn | `ĐƠN GỘP X + Y` | `ĐƠN GỘP 123 + 456` |
| Đủ điều kiện freeship | `FREESHIP` | `FREESHIP` |

**Ghi chú hoàn chỉnh:** `CK 200K ACB 29/01, GG 80K, FREESHIP`

#### Điều kiện freeship tự động

| Đối tác | Điều kiện | Phí ship |
|---------|-----------|----------|
| THÀNH PHỐ | Tổng tiền > 1.500.000đ | 0đ |
| TỈNH | Tổng tiền > 3.000.000đ | 0đ |

---

## 4. BILL SERVICE (Dịch vụ tạo hóa đơn)

### 4.1 PHẦN KỸ THUẬT

#### Core Functions

| Function | Description |
|----------|-------------|
| `generateCustomBillHTML(orderResult, options)` | Tạo HTML bill theo template TPOS |
| `openPrintPopup(orderResult, options)` | Mở popup in 1 bill |
| `openCombinedPrintPopup(orders, options)` | In nhiều bill gộp (có page break) |
| `generateBillImage(orderResult, options)` | Tạo PNG image từ bill HTML (dùng html2canvas) |
| `sendBillToCustomer(orderResult, pageId, psid)` | Gửi bill qua Messenger |
| `fetchTPOSBillHTML(orderId, headers)` | Fetch bill HTML từ TPOS API |
| `fetchAndPrintTPOSBill(orderId, headers)` | Fetch + in TPOS bill (có fallback) |

#### Template Variables trong generateCustomBillHTML

| Variable | Source | Description |
|----------|--------|-------------|
| `shopName` | `company.Name` | Tên shop (default: "NJD Live") |
| `billNumber` | `orderResult.Number` | Số phiếu (VD: "NJD/2026/49318") |
| `dateStr` | `new Date()` | Ngày giờ tạo (DD/MM/YYYY HH:mm) |
| `carrierName` | `Carrier.Name` | Tên đối tác giao hàng |
| `sttDisplay` | `SessionIndex` hoặc `Gộp X Y` | STT hiển thị |
| `receiverName` | `Partner.Name` hoặc form | Tên người nhận |
| `receiverPhone` | `Partner.Phone` hoặc form | SĐT người nhận |
| `receiverAddress` | `Partner.Street` hoặc form | Địa chỉ người nhận |
| `sellerName` | `authManager.currentUser` | Tên người bán |
| `shippingFee` | `DeliveryPrice` | Phí ship |
| `discount` | `DecreaseAmount` | Giảm giá |
| `prepaidAmount` | `min(wallet, total)` | Trả trước |
| `codAmount` | `total - prepaid` | Còn lại |

#### Bill Types

| Type | Source | Use case |
|------|--------|----------|
| **Web Template** | Tạo local bằng JavaScript | Nhanh, không cần gọi API |
| **TPOS Template** | Fetch từ API TPOS | Chính xác 100%, có barcode gốc |

### 4.2 PHẦN NGỮ NGHĨA

#### Gửi bill qua Messenger

```
1. Tạo ảnh PNG từ HTML bill (html2canvas)
        ↓
2. Upload lên Pancake CDN
        ↓
3. Gửi qua Pancake Messaging API
        ↓
4. Nếu lỗi 24h policy:
   → Fallback qua Facebook Graph API
   → Sử dụng tag POST_PURCHASE_UPDATE
        ↓
5. Gửi thêm:
   • Ảnh cảm ơn
   • Tin nhắn cảm ơn
```

---

## 5. SEQUENCE DIAGRAMS

### 5.1 Single Order Sale Flow

```
User                    Modal                   API                     Print
 │                        │                      │                        │
 ├──Click "Tạo phiếu"────>│                      │                        │
 │                        ├──GET Order Details───>│                        │
 │                        │<─────Order Data───────│                        │
 │                        ├──GET Wallet Balance──>│                        │
 │                        │<────Balance Data──────│                        │
 │<──────Show Modal───────│                      │                        │
 │                        │                      │                        │
 ├──Edit/Add Products────>│                      │                        │
 │                        ├──PUT Update Order────>│                        │
 │                        │<────200 OK────────────│                        │
 │                        │                      │                        │
 ├──F9 Confirm & Print───>│                      │                        │
 │                        ├──POST InsertList─────>│                        │
 │                        │<──OrdersSucessed──────│                        │
 │                        │                      ├──Generate Bill────────>│
 │                        │                      │                        ├──Print
 │<──Success Notification─│                      │                        │
```

### 5.2 Fast Sale Flow

```
User                    Modal                   API                     Print
 │                        │                      │                        │
 ├──Select Multiple───────│                      │                        │
 ├──Click "Thêm HĐ nhanh">│                      │                        │
 │                        ├──POST GetListOrderIds>│                        │
 │                        │<───Orders Array───────│                        │
 │                        ├──POST Batch Wallet───>│                        │
 │                        │<───Wallets Map────────│                        │
 │<──────Show Modal───────│                      │                        │
 │                        │                      │                        │
 ├──Review & Adjust──────>│                      │                        │
 │                        │                      │                        │
 ├──"Lưu xác nhận"───────>│                      │                        │
 │                        ├──POST InsertList─────>│                        │
 │                        │<──Results Array───────│                        │
 │                        │                      ├──Combine Bills────────>│
 │                        │                      │                        ├──Print All
 │<──Results Modal────────│                      │                        │
```

---

## 6. TROUBLESHOOTING

### Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|------------|
| "Chưa cấu hình tài khoản TPOS" | `billTokenManager` chưa có credentials | Vào "Tài khoản TPOS" để cài đặt |
| "Vui lòng chọn đối tác vận chuyển" | Chưa chọn carrier | Chọn đối tác trong dropdown |
| "Vui lòng nhập địa chỉ người nhận" | Địa chỉ trống | Nhập địa chỉ vào form |
| "Đơn hàng chưa có chi tiết" | TotalQuantity = 0 | Thêm sản phẩm vào đơn trước |
| "Đã có phiếu xác nhận" | Đơn đã được tạo phiếu trước đó | Không thể tạo lại, bỏ qua đơn này |
| "RowVersion mismatch" | Đơn đã bị sửa đổi bởi user khác | Refresh lại trang, tải đơn mới |

### Debug Tips

```javascript
// Kiểm tra credentials TPOS
window.billTokenManager?.hasCredentials()  // true/false
window.billTokenManager?.getCredentialsInfo()  // {type, username}

// Kiểm tra data đơn hàng
console.log(currentSaleOrderData)  // Single sale
console.log(fastSaleOrdersData)    // Fast sale

// Kiểm tra wallet balances
console.log(fastSaleWalletBalances)  // {phone: {balance, virtualBalance}}

// Kiểm tra invoice status
window.InvoiceStatusStore?.get(orderId)  // {ShowState, State, Number}
```

---

## CHANGELOG

| Ngày | Thay đổi |
|------|----------|
| 2025-01-29 | Tạo documentation đầy đủ với phần kỹ thuật và ngữ nghĩa |

---

*Tài liệu được tạo bởi Claude Code - Anthropic*
