# Inbox Chat - Hộp thư & Chat khách hàng

## Mục đích

Module Inbox cung cấp giao diện chat 3 cột kiểu Pancake, cho phép:
- Quản lý tất cả cuộc hội thoại Facebook (inbox + comment) từ nhiều Page qua Pancake API
- Nhắn tin, trả lời bình luận, nhắn riêng (private reply) cho khách hàng
- Phân loại cuộc hội thoại theo nhóm (label) với đồng bộ cross-device qua server
- Quản lý livestream: tự động phát hiện + đánh dấu thủ công, lọc theo bài post
- Tạo đơn hàng nhanh ngay trong giao diện chat (column 3)
- Real-time qua WebSocket (Render server proxy) hoặc polling fallback
- Tìm kiếm 2 tầng: local filter tức thì + API search debounced

## Kiến trúc & Bố cục folder

```
inbox/
├── index.html              # Layout 3 cột + sidebar + modals
├── css/
│   └── inbox.css           # Toàn bộ styles (3338 dòng)
├── js/
│   ├── inbox-main.js       # Khởi tạo app, column resizer, toast
│   ├── inbox-data.js       # Data layer: Pancake API, groups, labels, livestream
│   ├── inbox-chat.js       # Chat UI controller: messages, search, WebSocket
│   └── inbox-orders.js     # Form tạo đơn hàng (column 3)
└── README.md
```

## File Map

| File | Dòng | Mô tả |
|------|------|--------|
| `index.html` | 688 | Layout 3 cột (Conversation List / Chat Area / Info Panel), sidebar navigation, Pancake Settings modal (quản lý JWT accounts + Page Access Tokens), emoji picker, reaction picker, order form, toast container |
| `css/inbox.css` | 3338 | CSS variables, sidebar, 3-column layout, resizable columns, conversation list, chat bubbles, message actions, label bar, group stats cards, order form, modals, customer stats bar, post info banner, activities panel, emoji picker, quick replies, responsive utilities |
| `js/inbox-main.js` | 200 | `initInboxApp()` -- khởi tạo `InboxDataManager`, `InboxChatController`, `InboxOrderController`, kết nối WebSocket, column resizer (kéo thay đổi kích thước cột), `showToast()` global |
| `js/inbox-data.js` | 1068 | Class `InboxDataManager` -- quản lý conversations, groups, labels, livestream state. Gọi Pancake API, xử lý multi-account fallback, đồng bộ groups/labels với server, quản lý livestream conversations |
| `js/inbox-chat.js` | 3169 | Class `InboxChatController` -- render conversation list, chat messages, gửi tin nhắn qua Pancake API (reply_inbox, reply_comment, private_replies), WebSocket real-time, search, file/image upload, message actions (like, hide, delete, react, copy), customer stats, post info, activities panel, group stats, manage groups modal |
| `js/inbox-orders.js` | 311 | Class `InboxOrderController` -- form tạo đơn hàng: thêm/xóa sản phẩm, tính tổng tiền, lưu vào localStorage, auto-fill thông tin KH từ cuộc hội thoại, Goong Places autocomplete cho địa chỉ |

## Dependencies

### Shared libs (from `../shared/js/`)
- `firebase-config.js` -- Firebase initialization (Firestore, Realtime Database)
- `api-config.js` -- `API_CONFIG` with `buildUrl.pancakeDirect()`, `buildUrl.pancakeOfficial()`, `WORKER_URL`, `smartFetch()`
- `shop-config.js` -- Shop configuration
- `pancake-token-manager.js` -- JWT account management, multi-account support, page access token generation
- `pancake-data-manager.js` -- `pancakeDataManager` singleton: fetch conversations, messages, search, mark read, upload images, like/hide/delete comments
- `pancake-settings.js` -- Modal logic for Pancake account management (add/remove JWT tokens)
- `goong-places.js` -- `goongAttachAutocomplete()` for address autocomplete in order form
- `permissions-helper.js` -- User permissions helper
- `navigation-modern.js` -- Sidebar navigation auto-generation

### Shared ESM
- `../shared/esm/compat.js` -- ES module compatibility shim, auth manager

### CDN Libraries
- **Lucide Icons** v0.294.0 (`unpkg.com/lucide`) -- icon system used throughout
- **Font Awesome** v6.4.0 (`cdnjs.cloudflare.com`) -- icons in Pancake Settings modal
- **Firebase** v9.6.1 compat -- `firebase-app`, `firebase-firestore`, `firebase-database`

### External Services
- **Pancake API** (`pancake.vn`) -- conversation data, messages, send/reply, search, reactions
- **Render server** (`n2store-realtime.onrender.com`) -- WebSocket real-time proxy
- **Cloudflare Worker** (`chatomni-proxy.nhijudyshop.workers.dev`) -- CORS proxy + server-side data persistence (groups, labels, livestream, pending customers)

### Cross-module references
- Không import từ module khác. Module này tự chứa toàn bộ logic inbox.

## Luồng dữ liệu

### Khởi tạo (initInboxApp)
```
1. InboxDataManager.init()
   ├── pancakeTokenManager.initialize()    → Load accounts từ Firebase
   ├── pancakeDataManager.initialize()     → Load pages + conversations từ Pancake API
   ├── loadGroupsFromServer()              → Fetch groups từ Cloudflare Worker
   ├── syncLabelsFromServer()              → Fetch labels map từ server
   ├── fetchLivestreamFromServer()         → Fetch livestream conv_ids từ server
   └── buildMaps()                         → Build O(1) lookup maps (id, psid, customerId)

2. InboxChatController.init()
   ├── bindEvents()                        → Search, filter tabs, send, scroll, etc.
   ├── renderPageSelector()                → Multi-page filter dropdown
   ├── renderConversationList()            → Danh sách cuộc hội thoại
   └── renderGroupStats()                  → Nhóm phân loại cards

3. InboxOrderController.init()
   └── bindEvents() + Goong autocomplete

4. initializeWebSocket()
   ├── POST /api/realtime/start            → Server bắt đầu proxy Pancake WS
   └── new WebSocket(wss://...)            → Client nhận events real-time
```

### Gửi tin nhắn
```
sendMessage()
├── Capture replyData + replyType
├── Optimistic UI update (addMessage → renderMessages)
├── Get page_access_token (cache → generate → fallback other accounts)
├── POST /pages/{pageId}/conversations/{convId}/messages
│   ├── INBOX: _sendInbox()
│   │   ├── reply_inbox (primary)
│   │   └── private_replies (fallback nếu 24h/551 error)
│   └── COMMENT: _sendComment()
│       ├── reply_comment (public) → fallback private_replies
│       └── private_replies → fallback reply_inbox
├── markAsRead()
└── Reload messages sau 2 giây
```

### Real-time (WebSocket)
```
Server Mode Proxy:
1. Client POST /api/realtime/start → Render server kết nối Pancake WS
2. Client mở WebSocket tới Render server
3. Render broadcast events → Client
4. Events: update_conversation, new_message, post_type_detected
5. Auto-detect livestream từ post data trong events
6. Reconnect 3 lần (backoff), rồi fallback polling 30s
```

### Conversation Loading Strategy
```
Multi-page endpoint (primary)
├── Thành công → dùng kết quả
├── Error 105 (no permission) → per-page endpoint
├── Error 122 (subscription expired) → thử account khác
└── 0 kết quả → thử account khác
    └── per-page endpoint cho mỗi account
```

## Hàm chính

### InboxDataManager (inbox-data.js)

| Hàm | Mô tả |
|-----|--------|
| `init()` | Khởi tạo token manager + data manager, load conversations, sync groups/labels từ server |
| `loadConversations(forceRefresh)` | Fetch conversations từ Pancake với multi-account fallback strategy |
| `loadMoreConversations()` | Phân trang: load thêm conversations (cursor-based) |
| `fetchConversationsPerPage()` | Fallback: gọi API từng page riêng khi multi-page endpoint lỗi |
| `tryOtherAccounts()` | Thử các account Pancake khác khi account hiện tại không có dữ liệu |
| `mapConversation(conv)` | Chuyển đổi Pancake conversation → inbox format (id, name, avatar, labels, type...) |
| `getConversations({search, filter, groupFilters})` | Lọc + sắp xếp conversations theo tiêu chí |
| `toggleConversationLabel(convId, labelId)` | Toggle multi-label trên conversation + sync server |
| `markAsLivestream(convId, postId)` | Đánh dấu livestream + liên kết INBOX conv qua psid |
| `markCustomerAsLivestream(psid, pageId, name, postId)` | Đánh dấu tất cả conversations của khách hàng là livestream |
| `fetchLivestreamFromServer()` | Load livestream data từ server (single source of truth) |
| `fetchPendingFromServer()` | Merge unread counts từ Render DB pending_customers |
| `check24hWindow(convId)` | Kiểm tra cửa sổ 24h Facebook messaging |
| `loadGroupsFromServer()` / `saveGroupsToServer()` | Đồng bộ nhóm phân loại với server |
| `syncLabelsFromServer()` | Đồng bộ label map cross-device |
| `buildMaps()` | Build O(1) lookup maps: conversationMap, conversationByPsidMap, conversationByCustomerIdMap |
| `addGroup()` / `updateGroup()` / `deleteGroup()` | CRUD nhóm phân loại |

### InboxChatController (inbox-chat.js)

| Hàm | Mô tả |
|-----|--------|
| `init()` / `bindEvents()` | Đăng ký tất cả event listeners (search, filter, send, scroll, tabs...) |
| `renderConversationList()` | Render danh sách cuộc hội thoại với filter + search + page filter + type filter |
| `selectConversation(convId)` | Chọn cuộc hội thoại: update header, load messages, fill order form |
| `loadMessages(conv)` | Fetch messages từ Pancake API, render chat, detect livestream, extract phone |
| `loadMoreMessages()` | Phân trang tin nhắn (scroll up to load older) |
| `renderMessages(conv)` | Render chat bubbles: text, attachments, reactions, phone tags, action buttons |
| `sendMessage()` | Gửi tin nhắn: validate, optimistic UI, gọi API, fallback chain |
| `_sendInbox()` / `_sendComment()` | Logic gửi riêng cho INBOX và COMMENT conversations |
| `_getPageAccessTokenWithFallback(pageId)` | Lấy page access token: cache → generate → other accounts |
| `attachImage()` / `attachFile()` | Upload và gửi ảnh/file qua Pancake API |
| `handleMessageAction(action, msgId, btn)` | Xử lý like, hide, unhide, delete, copy, reply, react |
| `sendReaction(msgId, reactionType)` | Gửi emoji reaction (LIKE, LOVE, HAHA, WOW, SAD, ANGRY) |
| `performSearch(query)` | Search 2 tầng: local filter + Pancake API search |
| `initializeWebSocket()` | Kết nối WebSocket real-time qua Render proxy |
| `handleConversationUpdate(payload)` | Xử lý update_conversation event (update/add conversation, detect livestream) |
| `handleNewMessage(payload)` | Xử lý new_message event (update conversation, reload nếu đang xem) |
| `renderPageSelector()` | Render dropdown multi-page filter với unread badges |
| `renderGroupStats()` | Render group stats cards (Nhóm Phân Loại) với bộ lọc click |
| `renderChatLabelBar(conv)` | Render label assignment bar dưới chat area |
| `showManageGroupsModal()` | Modal CRUD nhóm phân loại (tên, màu, ghi chú) |
| `renderCustomerStatsBar(conv)` | Render thanh thống kê: phone, comment count, order success/fail, return rate |
| `renderPostInfo(conv)` | Render post banner (thumbnail + title) cho comment/livestream conversations |
| `renderActivities(conv)` | Render activities panel (bài viết liên quan của khách) |
| `renderEmojiGrid(category)` | Render emoji picker grid theo category |
| `toggleLivestreamStatus()` | Toggle đánh dấu livestream cho conversation hiện tại |
| `clearLivestreamForPost()` | Xóa tất cả đánh dấu livestream cho một bài post cụ thể |
| `populateSendPageSelector()` | Dropdown chọn page gửi tin nhắn (khi có nhiều pages) |
| `populateReplyTypeSelector()` | Dropdown kiểu trả lời: bình luận công khai / nhắn riêng |
| `updateSocketStatusUI(connected)` | Cập nhật icon trạng thái WebSocket |
| `startAutoRefresh()` / `stopAutoRefresh()` | Polling fallback mỗi 30 giây khi WebSocket không khả dụng |

### InboxOrderController (inbox-orders.js)

| Hàm | Mô tả |
|-----|--------|
| `init()` | Bind events + Goong Places autocomplete cho địa chỉ |
| `fillCustomerInfo(conv)` | Auto-fill tên + SĐT từ conversation đang chọn |
| `addProductRow()` / `removeProductRow(index)` | Thêm/xóa dòng sản phẩm trong form |
| `updateOrderSummary()` | Tính tạm tính, phí ship, giảm giá, tổng cộng |
| `submitOrder()` | Validate + tạo đơn hàng, lưu localStorage |
| `resetForm()` | Reset form về trạng thái ban đầu, auto-fill lại KH nếu có |

### Hàm global (inbox-main.js)

| Hàm | Mô tả |
|-----|--------|
| `showToast(message, type)` | Hiển thị toast notification (info/success/warning/error) |
| `initColumnResizer()` | Draggable column dividers giữa 3 cột (mouse + touch) |
| `initInboxApp()` | Entry point: khởi tạo tất cả controllers, kết nối WebSocket |
