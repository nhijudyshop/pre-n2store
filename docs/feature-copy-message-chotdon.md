# Tính năng: Nút "Copy mẫu chốt đơn" trong Modal Chat - Tab 1 Orders Report

## Tổng quan

Nút **"Copy mẫu chốt đơn"** nằm trên thanh toolbar phía dưới modal chat (tab Tin nhắn) của Tab 1 Orders Report. Khi nhấn, hệ thống tự động tạo tin nhắn chốt đơn dựa trên mẫu template và thông tin đơn hàng hiện tại, copy vào clipboard và paste vào ô nhập tin nhắn.

## Vị trí

- **Trang:** `orders-report/tab1-orders.html`
- **Vị trí UI:** Thanh toolbar dưới cùng của modal chat, cạnh các icon khác (Edit Order, Live Comments, Help, Quick Reply, Photos, Files, Stickers)
- **Icon:** Biểu tượng clipboard copy (SVG)
- **Tooltip:** "Copy mẫu chốt đơn"

## File liên quan

| File | Vai trò |
|------|---------|
| `orders-report/tab1-orders.html` (dòng 947-957) | Button HTML trong toolbar |
| `orders-report/js/utils/copy-template-helper.js` | Logic chính xử lý copy template |
| `orders-report/js/tab1/tab1-chat-core.js` | Module chat core quản lý `currentChatOrderData` |
| `orders-report/css/tab1-chat-modal.css` | CSS styling cho modal chat |

## Luồng hoạt động

```
User nhấn nút "Copy mẫu chốt đơn"
    │
    ▼
copyOrderTemplate()
    │
    ├─ 1. Lấy window.currentChatOrderData (data đơn hàng đang mở)
    │     └─ Nếu không có → hiện toast lỗi "Không có thông tin đơn hàng"
    │
    ├─ 2. Gọi API lấy mẫu template (MailTemplate ID=10)
    │     └─ GET /api/odata/MailTemplate(10)
    │     └─ Lấy field BodyPlain chứa nội dung mẫu
    │
    ├─ 3. convertOrderData() - Chuyển đổi data đơn hàng
    │     ├─ Lọc bỏ sản phẩm bị giữ (IsHeld = true)
    │     ├─ Map thông tin: tên, số lượng, giá, ghi chú
    │     └─ Tính tổng tiền từ sản phẩm (không dùng TotalAmount lưu sẵn)
    │
    ├─ 4. replacePlaceholders() - Thay thế placeholder trong mẫu
    │     ├─ {partner.name}   → Tên khách hàng
    │     ├─ {partner.phone}  → Số điện thoại
    │     ├─ {partner.address} → Địa chỉ + SĐT
    │     ├─ {order.code}     → Mã đơn hàng
    │     ├─ {order.total}    → Tổng tiền (formatted)
    │     └─ {order.details}  → Danh sách sản phẩm + tổng tiền
    │
    ├─ 5. Thêm dòng nhắc thanh toán + dòng kết
    │     ├─ "Khách Thanh Toán Phương Thức Chuyển Khoản Hỗ Trợ Báo Trước Giúp Shop Ạ"
    │     └─ "Dạ c xem okee để e đi đơn cho mình c nhé 😍"
    │
    ├─ 6. Copy vào clipboard (navigator.clipboard.writeText hoặc fallback)
    │
    ├─ 7. Paste vào ô chat (#chatReplyInput) + focus
    │
    └─ 8. Hiện toast thông báo thành công/thất bại
```

## Chi tiết format sản phẩm

### Sản phẩm không giảm giá

```
- Áo thun basic x2 = 500.000đ
- Quần jean slim x1 = 350.000đ (ghi chú gì đó)

Tổng tiền: 850.000đ
```

### Sản phẩm có giảm giá (parse từ ghi chú)

Hệ thống nhận diện giá sale từ ghi chú sản phẩm (note):
- `150` hoặc `150k` → Giá sale = 150.000đ/sản phẩm

```
- Áo thun premium x3 = 600.000đ
  📝Sale 150
- Quần jean x2 = 500.000đ
  📝Sale 200 (size L)

Tổng : 1.100.000đ
Giảm giá: 250.000đ
Tổng tiền: 850.000đ
```

**Logic tính giảm giá:**
- `discountPerItem = giá gốc/sp - giá sale/sp`
- `totalDiscount = discountPerItem × số lượng`
- `finalTotal = tổng gốc - totalDiscount`

## Xử lý placeholder khi thiếu dữ liệu

| Placeholder | Khi thiếu data | Giá trị thay thế |
|-------------|----------------|-------------------|
| `{partner.name}` | Không có tên | `(Khách hàng)` |
| `{partner.address}` | Không có địa chỉ | `(Chưa có địa chỉ)` |
| `{partner.phone}` | Không có SĐT | `(Chưa có SĐT)` |
| `{order.details}` | Không có sản phẩm | `(Chưa có sản phẩm)` |
| `{order.code}` | Không có mã | `(Không có mã)` |
| `{order.total}` | Không có tổng | `0đ` |

## Copy to Clipboard

Hỗ trợ 2 phương thức:

1. **Modern:** `navigator.clipboard.writeText()` - ưu tiên dùng
2. **Fallback:** Tạo textarea ẩn + `document.execCommand('copy')` - dùng khi API clipboard không khả dụng

## Toast Notification

- **Vị trí:** Fixed, bottom 100px, giữa màn hình
- **Thành công:** Nền xanh (`#10b981`) - "Đã copy mẫu chốt đơn"
- **Thất bại:** Nền đỏ (`#ef4444`) - "Đã paste mẫu (copy thất bại)" hoặc message lỗi
- **Tự ẩn:** Sau 2.5 giây với animation slide-down
- **z-index:** 100001 (trên modal chat)

## API sử dụng

| Endpoint | Mục đích |
|----------|----------|
| `GET /api/odata/MailTemplate(10)` | Lấy mẫu chốt đơn (BodyPlain) |

- **Base URL:** `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata`
- **Auth:** Token từ `window.tokenManager.getAuthHeader()`
- **Template ID:** `10` (hardcoded constant `CHOTDON_TEMPLATE_ID`)

## Lưu ý kỹ thuật

- `window.currentChatOrderData` được set khi mở modal chat cho một đơn hàng
- Sản phẩm có `IsHeld = true` sẽ bị lọc bỏ, không hiển thị trong tin nhắn
- Tổng tiền được tính lại từ danh sách sản phẩm, không dùng `TotalAmount` lưu sẵn (có thể stale)
- Hàm `copyOrderTemplate()` được gắn vào `window` object để gọi từ onclick
