# Chức năng "Nhận hàng" - TPOS Refund Flow

## Tổng quan

Khi user bấm nút **"📦 Nhận hàng"** trên một ticket có trạng thái `PENDING_GOODS`, hệ thống sẽ thực hiện quy trình hoàn hàng (refund) trên TPOS thông qua 5 bước API calls tuần tự.

## Flow xử lý

```
User bấm "Nhận hàng"
        ↓
Modal xác nhận hiện lên
        ↓
User bấm "Xác Nhận"
        ↓
┌─────────────────────────────────────────────┐
│           TPOS REFUND FLOW (5 steps)        │
├─────────────────────────────────────────────┤
│ 1. ActionRefund      → Tạo phiếu hoàn       │
│ 2. GET Details       → Lấy chi tiết         │
│ 3. PUT SaveAndPrint  → Lưu + chuẩn bị in    │
│ 4. ActionInvoiceOpenV2 → Xác nhận phiếu     │
│ 5. PrintRefund       → Lấy HTML bill        │
└─────────────────────────────────────────────┘
        ↓
Cập nhật Firebase (COMPLETED)
        ↓
Mở cửa sổ in bill
```

## Chi tiết các API calls

### Step 1: ActionRefund - Tạo phiếu hoàn

```javascript
POST /odata/FastSaleOrder/ODataService.ActionRefund

Headers:
- Content-Type: application/json;charset=UTF-8
- Authorization: Bearer {token}

Body:
{
    "id": 409596  // ID đơn hàng gốc (tposId từ ticket)
}

Response:
{
    "@odata.context": "...",
    "value": 409602  // ID của phiếu hoàn mới tạo
}
```

### Step 2: GET Details - Lấy chi tiết phiếu hoàn

```javascript
GET /odata/FastSaleOrder(409602)?$expand=Partner,User,Warehouse,Company,PriceList,RefundOrder,Account,Journal,PaymentJournal,Carrier,Tax,SaleOrder,HistoryDeliveryDetails,OrderLines($expand=Product,ProductUOM,Account,SaleLine,User),Ship_ServiceExtras,OutstandingInfo($expand=Content),Team,OfferAmountDetails,+DestConvertCurrencyUnit,PackageImages

Headers:
- Accept: application/json
- Authorization: Bearer {token}

Response:
{
    "Id": 409602,
    "Type": "refund",
    "State": "draft",
    "RefundOrderId": 409596,
    "Partner": {...},
    "OrderLines": [...],
    ...
}
```

### Step 3: PUT Update - Lưu với FormAction

```javascript
PUT /odata/FastSaleOrder(409602)

Headers:
- Content-Type: application/json;charset=UTF-8
- Authorization: Bearer {token}

Body:
{
    // Copy toàn bộ data từ Step 2
    "Id": 409602,
    "FormAction": "SaveAndPrint",  // KEY: Trigger save and print
    "Partner": {...},
    "OrderLines": [...],
    ...
}

Response:
{
    "Id": 409602,
    "State": "draft",
    ...
}
```

### Step 4: ActionInvoiceOpenV2 - Xác nhận phiếu

```javascript
POST /odata/FastSaleOrder/ODataService.ActionInvoiceOpenV2

Headers:
- Content-Type: application/json;charset=UTF-8
- Authorization: Bearer {token}

Body:
{
    "ids": [409602]
}

Response:
{
    "value": [{
        "Id": 409602,
        "State": "open",
        "Number": "RINV/2026/1470",
        ...
    }]
}
```

### Step 5: PrintRefund - Lấy HTML bill

**Lưu ý**: Endpoint này gọi **trực tiếp đến TPOS** (không qua proxy) vì:
- Trả về HTML content, không phải JSON
- Proxy không có route `/fastsaleorder/PrintRefund`

```javascript
GET https://tomato.tpos.vn/fastsaleorder/PrintRefund/409602

Headers:
- Accept: */*
- Authorization: Bearer {token}

Response:
<!DOCTYPE html>
<html>
<head>
    <title>Phiếu trả hàng - TPOS.VN</title>
    ...
</head>
<body>
    <!-- Nội dung bill in -->
</body>
</html>
```

## Cấu trúc code

### api-service.js

```javascript
ApiService.processRefund(originalOrderId, onProgress)
```

- **Input**:
  - `originalOrderId` - ID đơn hàng gốc (ticket.tposId)
  - `onProgress` - Callback function(step, message) để cập nhật progress
- **Output**:
  ```javascript
  {
      refundOrderId: 409602,      // ID phiếu hoàn
      printHtml: "<html>...",     // HTML bill để in
      confirmResult: {...}        // Response từ ActionInvoiceOpenV2
  }
  ```

### script.js

```javascript
handleConfirmAction()
```

- Hiển thị notification loading với progress từng bước
- Gọi `ApiService.processRefund(ticket.tposId, onProgress)` khi action là `RECEIVE`
- Cập nhật ticket Firebase với `refundOrderId` và `refundNumber`
- Gọi `showPrintDialog(result.printHtml)` để in bill (nếu setting bật)
- Hiển thị notification success/error

```javascript
showPrintDialog(html)
```

- Mở popup window mới
- Render HTML bill
- Trigger print dialog

## Cài đặt (Settings)

Nút ⚙️ mở modal cài đặt với các tùy chọn:

| Setting | Key | Default | Mô tả |
|---------|-----|---------|-------|
| In bill khi nhận hàng | `printBillEnabled` | `false` | Tự động mở cửa sổ in sau khi xử lý |

Settings được lưu vào `localStorage` với key `issue_tracking_settings`.

## Notification System

Sử dụng `NotificationManager` theo chuẩn SHARED_NOTIFICATION:

| Thời điểm | Method | Message |
|-----------|--------|---------|
| Bắt đầu | `loading()` | "Bước 1/5: Tạo phiếu hoàn..." |
| Mỗi step | `loading()` | "Bước X/5: {message}" |
| Thành công | `success()` | "Đã tạo phiếu hoàn: {refundNumber}" |
| Lỗi | `error()` | Error message từ API |

## Dữ liệu lưu vào Firebase

Sau khi hoàn thành refund:

```javascript
{
    status: 'COMPLETED',
    completedAt: <timestamp>,
    refundOrderId: 409602,           // ID phiếu hoàn trên TPOS
    refundNumber: "RINV/2026/1470"   // Số phiếu hoàn
}
```

## Xử lý lỗi

- Nếu thiếu `tposId`: Throw error "Thiếu TPOS Order ID để xử lý nhận hàng"
- Nếu API call fail: Hiển thị alert với error message
- Nếu popup bị chặn: Hiển thị alert "Không thể mở cửa sổ in"

## Lưu ý quan trọng

1. **FormAction: "SaveAndPrint"** - Đây là key quan trọng trong Step 3, trigger việc lưu và chuẩn bị in

2. **Payload Step 3** - Phải copy đầy đủ tất cả fields từ response Step 2, bao gồm nested objects (Partner, OrderLines, etc.)

3. **Token Manager** - Tất cả API calls sử dụng `window.tokenManager.authenticatedFetch()` để tự động refresh token khi cần

4. **Thứ tự tuần tự** - Các steps phải thực hiện tuần tự vì mỗi step phụ thuộc vào kết quả step trước
