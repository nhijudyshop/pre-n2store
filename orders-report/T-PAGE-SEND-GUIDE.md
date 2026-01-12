# Hướng Dẫn Gửi Tin Nhắn - T-Page & Pancake

## Tổng Quan

Hệ thống hỗ trợ **2 cách gửi tin nhắn**:
- **T-Page (TPOS)** - MỚI, mặc định
- **Pancake** - Vẫn hoạt động như trước

## Các Chế Độ Gửi

| Chế độ | Mặc định | API | Mô tả |
|--------|----------|-----|-------|
| **T-Page** | ✅ Có | TPOS CRMActivityCampaign | Gửi batch, đồng bộ T-Page |
| Pancake | | Pancake Official API (pages.fm) | Gửi từng đơn qua Pancake |
| Gửi ảnh | | Pancake + Upload | Gửi ảnh đơn hàng qua Pancake |

## Cách Sử Dụng

1. Chọn đơn hàng cần gửi tin nhắn
2. Click nút **"Gửi tin nhắn"** 
3. Chọn template tin nhắn
4. Chọn chế độ **"T-Page"** (mặc định đã chọn)
5. Click **"Gửi tin nhắn"**

## API T-Page

### Endpoint (qua Cloudflare Worker Proxy)

> [!IMPORTANT]
> Tất cả TPOS API calls đều đi qua proxy để bypass CORS.

```
POST https://chatomni-proxy.nhijudyshop.workers.dev/api/rest/v1.0/CRMActivityCampaign/order-campaign
```

*(Proxy forward đến: `https://tomato.tpos.vn/rest/v1.0/...`)*

### Payload
```json
{
  "CRMTeamId": 2,
  "Details": [
    {
      "CRMTeam": { /* thông tin page */ },
      "CRMTeamId": 10037,
      "Facebook_ASId": "25524019323851919",
      "Facebook_CommentId": "...",
      "Facebook_PostId": "...",
      "Facebook_UserName": "Tên khách",
      "Message": "Nội dung tin nhắn",
      "PartnerId": 562767,
      "TypeId": "Message"
    }
  ],
  "Note": "31/12/2025",
  "MailTemplateId": 10
}
```

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

## Ưu Điểm T-Page

- ✅ **Gửi batch** - Tất cả đơn trong 1 request
- ✅ **Nhanh hơn** - Không cần gọi API từng đơn
- ✅ **Đồng bộ TPOS** - Tin nhắn hiển thị trong T-Page
- ✅ **Tracking** - Có thể theo dõi trong hệ thống TPOS

> [!NOTE]
> **Không thêm chữ ký nhân viên** khi gửi hàng loạt qua template. Tin nhắn chỉ chứa nội dung template gốc.

## Flow Xử Lý

```
Chọn đơn → Chọn template → Click Gửi
     ↓
[T-Page Mode?]
     ↓ YES
Fetch từng đơn + CRMTeam → Build payload → POST batch API
     ↓ NO (Pancake)
Gửi song song từng đơn qua Pancake API
```

---

## Cấu Trúc Gửi T-Page Chi Tiết

### 1. Khởi tạo gửi (`_sendViaTPage()`)

```javascript
// Lấy thông tin nhân viên
const auth = window.authManager.getAuthState();
const displayName = auth?.displayName;

// Lấy nội dung template
const templateContent = this.selectedTemplate.BodyPlain;
```

### 2. Xử lý từng đơn hàng

```javascript
for (const order of this.selectedOrders) {
    sttCounter++;
    
    // Fetch đơn hàng + CRMTeam
    const fullOrderData = await this._fetchOrderWithCRMTeam(order.Id);
    
    // Chuẩn bị dữ liệu cho template
    const orderDataForTemplate = {
        Id: fullOrderData.Id,
        code: fullOrderData.Code,
        customerName: fullOrderData.Partner?.Name,
        phone: fullOrderData.Partner?.Telephone,
        address: fullOrderData.Partner?.Address,
        totalAmount: fullOrderData.TotalAmount,
        products: fullOrderData.Details?.map(...)
    };
    
    // Thay thế placeholder trong template
    let messageContent = this.replacePlaceholders(templateContent, orderDataForTemplate);
    
    // NOTE: Không thêm chữ ký nhân viên
    
    // Thêm vào batch
    orderCampaignDetails.push({
        rawOrder: fullOrderData,
        crmTeam: fullOrderData.CRMTeam,
        message: messageContent,
        stt: currentSTT
    });
}
```

### 3. Fetch đơn hàng với CRMTeam (`_fetchOrderWithCRMTeam()`)

```javascript
const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;

const response = await fetch(apiUrl, {
    headers: {
        ...await window.tokenManager.getAuthHeader(),
        'accept': 'application/json'
    }
});
```

### 4. Gửi batch request (`postOrderCampaign()`)

```javascript
const payload = {
    CRMTeamId: rootCRMTeamId,
    Details: [
        {
            CRMTeam: crmTeam,
            CRMTeamId: order.CRMTeamId,
            Facebook_ASId: order.Facebook_ASUserId,
            Facebook_CommentId: order.Facebook_CommentId,
            Facebook_PostId: order.Facebook_PostId,
            Facebook_UserName: order.Facebook_UserName,
            Message: messageContent,
            PartnerId: order.PartnerId,
            TypeId: "Message"
        }
    ],
    Note: "31/12/2025",  // Ngày hiện tại DD/MM/YYYY
    MailTemplateId: this.selectedTemplate.Id
};

const response = await fetch(
    'https://chatomni-proxy.nhijudyshop.workers.dev/api/rest/v1.0/CRMActivityCampaign/order-campaign',
    {
        method: 'POST',
        headers: {
            ...await window.tokenManager.getAuthHeader(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }
);
```

### 5. Hiển thị kết quả (`showSendSummary()`)

```javascript
this.showSendSummary(
    'tpage',                          // sendMode
    this.selectedTemplate.Name,       // templateName
    this.sendingState.success,        // successCount
    this.sendingState.error,          // errorCount
    this.sendingState.errors,         // errors array với STT
    successOrders                     // danh sách mã đơn thành công
);
```

## Troubleshooting

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| Token hết hạn | Session TPOS hết hạn | Refresh trang, đăng nhập lại |
| Không có CRMTeam | Đơn hàng thiếu dữ liệu page | Kiểm tra đơn hàng gốc |
| API error | Lỗi server TPOS | Thử lại sau vài phút |

---

## Tính Năng Mới: Thống Kê & Lịch Sử

### Hiển thị kết quả sau khi gửi

Sau khi gửi xong, hệ thống sẽ hiển thị modal **"Kết quả gửi tin nhắn"** với:

- ✅ Số đơn **thành công**
- ❌ Số đơn **thất bại**
- 📊 **Tổng cộng**

**Bảng đơn lỗi chi tiết:**

| STT | Mã đơn | Lỗi |
|-----|--------|-----|
| 3 | SO-12345 | Không thể tải thông tin đơn hàng |
| 7 | SO-12350 | Thiếu CRMTeam |

### Lưu lịch sử gửi

Mỗi lần gửi tin nhắn sẽ được lưu vào `localStorage` với key `messageSendHistory`.

**Cấu trúc lịch sử:**
```json
{
  "timestamp": "2025-12-31T12:00:00Z",
  "sendMode": "tpage",
  "templateName": "Xác nhận đơn hàng",
  "successCount": 10,
  "errorCount": 2,
  "errors": [
    { "stt": 3, "order": "SO-12345", "error": "Lỗi..." }
  ],
  "successOrders": ["SO-12340", "SO-12341", ...]
}
```

**Truy cập lịch sử qua Console:**
```javascript
// Xem lịch sử
messageTemplateManager.getHistory()

// Xóa lịch sử
messageTemplateManager.clearHistory()
```

---
*Cập nhật: 31/12/2025*
