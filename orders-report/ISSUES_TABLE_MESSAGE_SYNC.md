# Issues: Table Name & Message Display Sync

> **Ngày tạo:** 2025-12-18
> **Trạng thái:** ✅ Resolved (2025-12-18)

---

## Issue 1: Dropdown "Báo Cáo Tổng Hợp" Chỉ Hiện 1 Bảng

### Mô tả
- Dropdown chọn bảng ở "Báo Cáo Tổng Hợp" chỉ hiện "Bảng 1"
- Khi user đổi filter ở Tab1 và đặt tên bảng mới → không lưu vào Firebase

### Nguyên nhân
| Hành động | Function | Firebase Path | Kết quả |
|-----------|----------|---------------|---------|
| Đổi tên bảng Tab1 | `saveTableName()` | `settings/table_name` | ❌ Chỉ lưu TÊN |
| Nhấn "Lấy chi tiết đơn hàng" | `startBatchFetch()` | `report_order_details/{tableName}` | ✅ Tạo entry mới |

### Giải pháp: ✅ Option A (Đã chọn)

**Giữ logic hiện tại, thêm hướng dẫn để user biết cần nhấn "Lấy chi tiết đơn hàng"**

Lý do chọn:
- Dropdown hiển thị **chỉ các bảng đã fetch chi tiết** - đây là thiết kế đúng
- Tab-overview dùng để xem chi tiết đã tải (có full `Details`, `Partner`...)
- Nếu chưa "Lấy chi tiết đơn hàng" thì không có data để hiển thị

### Hướng dẫn sử dụng (User Guide)

```
1. Mở tab "Báo Cáo Đơn Hàng" (Tab1)
2. Đổi date filter để lấy đơn hàng mới  
3. Đặt tên bảng mới (ví dụ: "Bảng Tháng 12")
4. Chuyển sang tab "Báo Cáo Tổng Hợp"
5. ⚠️ QUAN TRỌNG: Nhấn nút "Lấy chi tiết đơn hàng"
6. Chờ hoàn thành → Bảng mới sẽ xuất hiện trong dropdown
```

### TODO: Thêm UI Guidance ✅ DONE
- [x] Thêm message helper dưới dropdown khi bảng hiện tại chưa có trong Firebase
- [x] Highlight nút "Lấy chi tiết đơn hàng" khi phát hiện bảng mới

**Đã implement (2025-12-18):**
- Thêm `#tableHelperMessage` div dưới dropdown với animation fade-in
- Thêm CSS class `highlight-pulse` cho nút fetch với animation pulse
- Thêm function `updateTableHelperUI(showHelper)` để quản lý UI
- Auto show/hide helper dựa trên `firebaseTableName` matching với `currentTableName`

### Files liên quan
- `tab1-orders.js` dòng 311: `saveTableName()`
- `tab-overview.html` dòng 583-587: `#tableHelperMessage` (helper message)
- `tab-overview.html` dòng 566-596: CSS animations
- `tab-overview.html` dòng 898-922: `updateTableHelperUI()` function
- `tab-overview.html` dòng 1276-1280: Remove highlight khi start fetch

---

## Issue 2: Cột Tin Nhắn Hiển Thị "-" ✅ IMPROVED

### Mô tả
- Cột tin nhắn trong bảng đơn hàng hiển thị "-" thay vì nội dung

### Nguyên nhân
Tin nhắn render **2 giai đoạn**:
1. **Render lần 1:** Chưa fetch Pancake → hiện "-"
2. **Render lần 2:** Sau `fetchConversations()` → hiện nội dung

Hiện "-" nếu:
- `!window.chatDataManager` - Manager chưa sẵn sàng
- `!orderChatInfo.psid` - Không có Facebook_ASUserId
- `!orderChatInfo.channelId` - Không parse được từ Facebook_PostId
- Setting `messagesContent === false` - User tắt hiển thị

### Cải tiến UX (2025-12-18)
**Thêm loading indicator** khi đang fetch conversations:
- Thêm biến `isLoadingConversations` để track trạng thái fetch
- Trong `renderMessagesColumn()` và `renderCommentsColumn()`: hiển thị spinner icon thay vì "-" khi đang fetch
- User sẽ thấy spinner xoay → biết đang tải → sau đó hiện tin nhắn hoặc "-" (nếu không có data)

### Files liên quan
- `tab1-orders.js` dòng 6276: `isLoadingConversations` variable
- `tab1-orders.js` dòng 6355: Set `isLoadingConversations = true` trước fetch
- `tab1-orders.js` dòng 6378: Set `isLoadingConversations = false` sau fetch
- `tab1-orders.js` dòng 7277-7279: Loading indicator trong `renderMessagesColumn()`
- `tab1-orders.js` dòng 7322-7324: Loading indicator trong `renderCommentsColumn()`
- `pancake-data-manager.js`: `getLastMessageForOrder()`
- `column-visibility-manager.js` dòng 17: `messagesContent` setting

### Flow cải tiến
```
loadCampaignList()
    ↓
performTableSearch() → RENDER LẦN 1 (isLoadingConversations=true → spinner icon)
    ↓
fetchConversations() → Gọi Pancake API
    ↓
isLoadingConversations = false
    ↓
performTableSearch() → RENDER LẦN 2 (có tin nhắn ✅ hoặc "-" nếu không có data)
```

---

## Tham khảo

### Pancake API - Lấy tin nhắn
```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conv_id}/messages
?page_access_token=xxx
&current_count=0  (phân trang, 30 messages/lần)
```

### Firebase Paths
| Path | Mô tả |
|------|-------|
| `settings/table_name` | Tên bảng hiện tại (from Tab1) |
| `report_order_details/{tableName}` | Chi tiết đơn hàng đã fetch |

---

*Xem thêm: [ARCHITECTURE.md](./ARCHITECTURE.md), [PANCAKE_API_DOCUMENTATION.md](./PANCAKE_API_DOCUMENTATION.md)*
