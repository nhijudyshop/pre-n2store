# Tab Bill Chờ Xóa

## Tổng quan

Tab "Bill Chờ Xóa" hiển thị danh sách các đơn hàng đã được yêu cầu hủy. Dữ liệu được lưu trữ cả ở localStorage và Firebase Firestore để đồng bộ giữa các thiết bị.

## Vị trí

- **File**: `orders-report/tab-pending-delete.html`
- **Tab trong main.html**: Tab thứ 6, sau "Đơn Social"
- **Icon**: `trash-2` (Lucide icons)

## Luồng dữ liệu

### 1. Lưu trữ (Storage)

```
localStorage: 'invoiceStatusDelete'
Firebase: collection 'invoice_status_delete' / doc '{username}'
```

### 2. Cấu trúc dữ liệu

```javascript
{
  // Thông tin đơn hàng (copy từ invoiceStatusStore)
  Id: string,
  Number: string,           // Số phiếu (VD: "NJD/2026/51257")
  Reference: string,        // Mã tham chiếu
  ReceiverName: string,     // Tên khách hàng
  ReceiverPhone: string,    // SĐT khách
  ReceiverAddress: string,  // Địa chỉ
  AmountTotal: number,      // Tổng tiền
  CashOnDelivery: number,   // COD
  OrderLines: array,        // Chi tiết sản phẩm

  // Thông tin hủy đơn
  cancelReason: string,     // Lý do hủy
  deletedAt: number,        // Timestamp (Date.now())
  deletedBy: string,        // Username người yêu cầu hủy
  SaleOnlineId: string,     // ID đơn hàng
  isOldVersion: boolean     // false = version mới
}
```

## Tính năng

### 1. Danh sách đơn chờ xóa

| Cột | Mô tả |
|-----|-------|
| # | Số thứ tự |
| Số phiếu | Mã đơn + Reference |
| Khách hàng | Tên + SĐT |
| Tổng tiền | AmountTotal hoặc CashOnDelivery |
| Lý do hủy | cancelReason (hover để xem bill) |
| Thời gian yêu cầu | deletedAt formatted |
| Người hủy | deletedBy |
| Thao tác | Nút "Xem" chi tiết |

### 2. Bộ lọc

- **Tìm kiếm**: Theo số phiếu, tên khách, SĐT
- **Người hủy**: Dropdown lọc theo deletedBy
- **Thời gian**: Hôm nay, Hôm qua, 3 ngày, 7 ngày

### 3. Hover Bill Preview

Khi hover vào cột "Lý do hủy", hiện popup bill preview:
- Width: 350px
- Height: 400px
- Sử dụng `BillService.generateCustomBillHTML()` để render bill

### 4. Modal Chi tiết

Click nút "Xem" để mở modal với:
- Grid thông tin đơn hàng
- Bill preview đầy đủ trong iframe

## Dependencies

```html
<!-- Firebase -->
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>

<!-- Shared -->
<script src="../shared/js/firebase-config.js"></script>
<script src="../shared/js/shared-auth-manager.js"></script>
<script src="../shared/js/notification-system.js"></script>

<!-- Bill Service -->
<script src="js/utils/bill-service.js"></script>
```

## Workflow liên quan

### Tạo yêu cầu hủy đơn

1. Từ tab "Quản Lý Đơn Hàng", click nút X (cancel) ở cột "Phiếu bán hàng"
2. Modal hiện ra với bill preview + input lý do hủy
3. Nhập lý do và click "Xác nhận hủy"
4. Dữ liệu được lưu vào `InvoiceStatusDeleteStore`:
   - Lưu localStorage
   - Sync lên Firebase

### Code liên quan

```javascript
// File: js/tab1/tab1-fast-sale-workflow.js

// Lưu yêu cầu hủy
await InvoiceStatusDeleteStore.add(saleOnlineId, invoiceData, reason);

// Gắn lại tag "OK + NV" cho đơn đã hủy
// Sử dụng window.currentUserIdentifier (từ Firebase users collection)
// Giống hệt logic của nút quick-tag-ok trong tab1-tags.js
const userIdentifier = window.currentUserIdentifier; // VD: "HẠNH", "HUYÊN"
const okTagName = `OK ${userIdentifier}`.toUpperCase(); // VD: "OK HẠNH"
const okTag = window.availableTags.find(t => t.Name.toUpperCase() === okTagName);
await addTagToOrder(saleOnlineId, okTag);
```

## API Functions

### InvoiceStatusDeleteStore (tab1-fast-sale-workflow.js)

| Method | Mô tả |
|--------|-------|
| `init()` | Load từ localStorage + Firebase |
| `add(saleOnlineId, invoiceData, reason)` | Thêm đơn hủy mới |
| `get(saleOnlineId)` | Lấy thông tin 1 đơn |
| `getAll()` | Lấy tất cả đơn hủy |

### tab-pending-delete.html

| Function | Mô tả |
|----------|-------|
| `loadData()` | Load dữ liệu từ localStorage + Firebase |
| `filterTable()` | Áp dụng bộ lọc |
| `renderTable()` | Render bảng dữ liệu |
| `viewBill(index)` | Mở modal chi tiết |
| `loadBillPreview(index, wrapper)` | Load bill preview khi hover |

## Caching

```javascript
const billPreviewCache = new Map();

// Clear khi re-render
billPreviewCache.clear();

// Set khi load bill thành công
billPreviewCache.set(index, true);

// Check trước khi load
if (billPreviewCache.has(index)) return;
```

## UI/UX Notes

- Theme màu đỏ/hồng để nhấn mạnh trạng thái "chờ xóa"
- Hover tooltip có animation fadeInUp
- Responsive design cho mobile
- Keyboard shortcut: ESC để đóng modal

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-01-30 | Tạo tab mới "Bill Chờ Xóa" |
| 2026-01-30 | Thêm hover bill preview |
| 2026-01-30 | Fix Firebase save (getAuthData thay vì getAuthState) |
| 2026-01-30 | Tích hợp BillService cho bill preview |
