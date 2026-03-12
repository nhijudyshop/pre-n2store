# SHARED_PANCAKE - Tích Hợp Pancake.vn API

> Modules quản lý Pancake API integration: JWT tokens, messages, conversations, realtime.

## Tổng Quan

| File | Giống 100% | Folders |
|------|------------|---------|
| `pancake-token-manager.js` | ✅ | orders-report, tpos-pancake |
| `pancake-data-manager.js` | ❌ | orders-report (86KB), tpos-pancake (125KB) |
| `realtime-manager.js` | ✅ | orders-report, tpos-pancake |

---

## PancakeTokenManager

### Purpose
Quản lý JWT tokens cho Pancake với multi-account support.

### Token Priority

```
1. In-memory cache (fastest)
2. localStorage (fast, no network)
3. Firebase (network required, backup)
4. Cookie (fallback)
```

### Key Methods

| Method | Mô tả |
|--------|-------|
| `getToken()` | Lấy token (theo priority order) |
| `setTokenManual(token)` | Set token thủ công từ UI |
| `getAllAccounts()` | Lấy tất cả accounts |
| `setActiveAccount(accountId)` | Chuyển account active |
| `deleteAccount(accountId)` | Xóa account |
| `getPageAccessToken(pageId)` | Lấy page access token |
| `decodeToken(token)` | Decode JWT payload |

### Storage Keys

| Key | Storage |
|-----|---------|
| `pancake_jwt_token` | localStorage |
| `pancake_page_access_tokens` | localStorage |
| `pancake_jwt_tokens/` | Firebase RTDB |

---

## PancakeDataManager

### Purpose
Tích hợp Pancake.vn API - messages, conversations, customers.

### Key Methods

| Method | Mô tả |
|--------|-------|
| `fetchPages(forceRefresh)` | Lấy danh sách pages |
| `fetchConversations(forceRefresh)` | Lấy conversations |
| `searchConversations(query, pageIds)` | Tìm kiếm |
| `fetchConversationsByCustomerFbId(pageId, fbId)` | Lấy theo FB ID |
| `getUnreadInfoForOrder(order)` | Số tin chưa đọc |
| `buildConversationMap()` | Build lookup maps |

### Conversation Maps

| Map | Description |
|-----|-------------|
| `inboxMapByPSID` | INBOX conversations by PSID |
| `inboxMapByFBID` | INBOX conversations by Facebook ID |
| `commentMapByPSID` | COMMENT conversations by PSID |
| `commentMapByFBID` | COMMENT conversations by Facebook ID |

---

## RealtimeManager

### Purpose
WebSocket connection cho Pancake realtime updates.

### Key Methods

| Method | Mô tả |
|--------|-------|
| `initialize()` | Khởi tạo WebSocket |
| `connect()` | Kết nối |
| `disconnect()` | Ngắt kết nối |
| `joinChannels()` | Join channels (pages, conversations) |
| `handleMessage(data)` | Xử lý message từ WS |
| `handleUpdateConversation(payload)` | Handle conversation update |
| `handleOrderTagsUpdate(payload)` | Handle tags update |

### Features
- Heartbeat ping
- Auto-reconnect
- Channel subscriptions

---

## Pancake API Reference

### Base URLs

| Server | URL |
|--------|-----|
| User's API | `https://pages.fm/api/v1` |
| Page's API v1 | `https://pages.fm/api/public_api/v1` |
| Page's API v2 | `https://pages.fm/api/public_api/v2` |

### Authentication

| Type | Parameter | Thời hạn |
|------|-----------|----------|
| User Access Token | `?access_token=` | 90 ngày |
| Page Access Token | `?page_access_token=` | Không hết hạn |

---

## Page Switching trong Chat Modal

### Vấn đề: fb_id khác nhau giữa các page

**QUAN TRỌNG:** Facebook PSID (`fb_id`) là **page-scoped** - cùng 1 người nhưng khác `fb_id` trên mỗi page.

Ví dụ: Khách "Huỳnh Thành Đạt"
- Page A: fb_id = `24948162744877764`
- Page B: fb_id = `25717004554573583`

→ Không thể dùng fb_id của page A để tìm conversation trên page B.

### Giải pháp: Search by name, lấy conversation mới nhất

```
1. Mở modal → Lưu tên khách: window.currentCustomerName = order.Name

2. User chọn page khác từ dropdown
   ↓
3. Search conversations theo tên khách trên page mới
   GET /conversations/search?q={customerName}&access_token=...
   ↓
4. Filter kết quả theo page_id, sort by updated_at
   ↓
5. Lấy conversation mới nhất, load messages
```

### API Flow

```javascript
// Khi mở modal - lưu tên khách hàng
window.currentCustomerName = order.Name || order.PartnerName;

// Khi switch page - search by name
const searchResult = await pancakeDataManager.searchConversations(customerName, [pageId]);

// Filter và sort lấy conversation mới nhất
let conversations = searchResult.conversations.filter(conv => conv.page_id === pageId);
conversations.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

const mostRecentConv = conversations[0];

// Update fb_id và UUID từ conversation mới
window.currentCustomerFbId = mostRecentConv.customers[0].fb_id;
window.currentCustomerUUID = mostRecentConv.customers[0].id;

// Load messages
const response = await pancakeDataManager.fetchMessagesForConversation(
    pageId,
    mostRecentConv.id,
    null,
    customerUUID
);
```

### Key APIs

| API | Endpoint | Mô tả |
|-----|----------|-------|
| Search | `GET /conversations/search?q={name}` | Tìm conversations theo tên |
| Messages | `GET /pages/{pageId}/conversations/{convId}/messages` | Lấy tin nhắn |

### Implementation

**File:** `orders-report/js/tab1/tab1-chat.js`

| Function | Line | Mô tả |
|----------|------|-------|
| `openChatModal()` | ~1499 | Lưu `window.currentCustomerName` |
| `onChatPageChanged()` | 851 | Handle page dropdown change, sync send dropdown |
| `reloadChatForSelectedPage()` | 886 | Search by name, lấy conversation mới nhất |

### Sync Dropdowns

Khi chuyển page view, "Gửi từ" dropdown cũng chuyển theo:

```javascript
// In onChatPageChanged():
const sendPageSelect = document.getElementById('chatSendPageSelect');
if (sendPageSelect) {
    sendPageSelect.value = pageId;
}
```

### Lưu ý về trùng tên

Search by name có thể trả về nhiều người cùng tên. Hiện tại chỉ lấy conversation mới nhất.
Nếu cần chính xác hơn, có thể kết hợp thêm số điện thoại hoặc thông tin khác.

---

## Xem thêm

- [orders-report/PANCAKE_API_DOCUMENTATION.md](file:///Users/mac/Downloads/n2store/orders-report/PANCAKE_API_DOCUMENTATION.md) - Full API reference
- [tpos-pancake/PANCAKE_GUIDE.md](file:///Users/mac/Downloads/n2store/tpos-pancake/PANCAKE_GUIDE.md) - Hướng dẫn sử dụng
