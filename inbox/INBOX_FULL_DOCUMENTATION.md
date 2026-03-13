# INBOX PAGE - Tài liệu chi tiết toàn bộ hệ thống

## Tổng quan

Trang Inbox là giao diện chat 3 cột (kiểu Pancake/Messenger), cho phép quản lý tất cả cuộc hội thoại Facebook (inbox + comment) từ nhiều Page thông qua Pancake API. Hỗ trợ nhắn tin real-time, phân loại khách hàng, quản lý livestream, và tạo đơn hàng nhanh.

**URL**: `https://nhijudyshop.github.io/pre-n2store/inbox/index.html`

---

## 1. Kiến trúc File

```
inbox/
├── index.html                 # Layout 3 cột + modals (678 dòng)
├── css/
│   ├── inbox.css              # Toàn bộ styles (3338 dòng)
│   └── quick-reply-modal.css  # Styles cho quick reply modal
├── js/
│   ├── inbox-main.js          # Entry point, khởi tạo app (206 dòng)
│   ├── inbox-data.js          # Data layer, Pancake API integration (1160 dòng)
│   ├── inbox-chat.js          # Chat UI controller chính (3400+ dòng)
│   └── inbox-orders.js        # Form tạo đơn hàng (311 dòng)
└── README.md
```

### Shared Dependencies (từ `../shared/js/`)

| File | Chức năng |
|------|-----------|
| `firebase-config.js` | Firebase initialization (Firestore, Realtime Database) |
| `api-config.js` | `API_CONFIG` object: WORKER_URL, buildUrl helpers, smartFetch |
| `shop-config.js` | Cấu hình shop |
| `pancake-token-manager.js` | Quản lý JWT accounts, multi-account, page access token |
| `pancake-data-manager.js` | Singleton `pancakeDataManager`: fetch conversations, messages, search, upload, like/hide/delete |
| `pancake-settings.js` | Modal quản lý Pancake accounts (add/remove JWT tokens) |
| `goong-places.js` | Autocomplete địa chỉ (Goong Maps API) |
| `permissions-helper.js` | Phân quyền UI theo role |
| `navigation-modern.js` | Sidebar navigation tự động |
| `quick-reply-manager.js` | Quản lý mẫu trả lời nhanh |

### CDN Libraries

| Library | Version | Mục đích |
|---------|---------|----------|
| Lucide Icons | 0.294.0 | Hệ thống icon chính |
| Font Awesome | 6.4.0/6.5.1 | Icon trong Pancake Settings modal |
| Firebase (compat) | 10.7.1 | firebase-app, firebase-firestore, firebase-database |

---

## 2. Accounts & Authentication

### 2.1 Pancake JWT Token

- **Lưu trữ**: Firebase Firestore (cross-device) + localStorage (cache)
- **Quản lý bởi**: `pancakeTokenManager` (singleton)
- **Hỗ trợ multi-account**: Có - nhiều tài khoản Pancake cùng lúc
- **Token format**: JWT từ cookie pancake.vn (`jwt=...`)
- **Expiry check**: `isTokenExpired(exp)` - kiểm tra trước khi dùng

### 2.2 Page Access Token

- **Mục đích**: Gửi tin nhắn qua Pancake Official API (không bị rate limit)
- **Lưu trữ**: Cache trong `pancakeTokenManager`
- **Cách lấy**:
  1. Cache → nếu đã có thì dùng luôn
  2. Generate từ active account JWT
  3. Fallback: thử các account khác có quyền truy cập page

### 2.3 Firebase Auth

- **Module**: `../shared/esm/compat.js` → `AuthManager`
- **Redirect**: Nếu chưa đăng nhập → redirect về `../index.html`
- **Fallback**: Hỗ trợ `file://` protocol (local development)

### 2.4 User Permissions

- **Module**: `PermissionHelper.applyUIRestrictions('inbox')`
- **Các permission sử dụng**:
  - `inbox:settings` - Xem/sửa Pancake settings, Render DB data
  - `inbox:manage_labels` - Quản lý nhóm phân loại, label bar, xóa livestream
  - `inbox:create_order` - Tab tạo đơn hàng (col3)
- **data-perm-action**: `"hide"` - ẩn element nếu không có quyền

---

## 3. External Services & API Endpoints

### 3.1 Cloudflare Worker (CORS Proxy + Server Logic)

**Base URL**: `https://chatomni-proxy.nhijudyshop.workers.dev`

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| GET | `/api/realtime/inbox-groups` | Lấy danh sách nhóm phân loại |
| PUT | `/api/realtime/inbox-groups` | Lưu nhóm phân loại |
| GET | `/api/realtime/conversation-labels` | Lấy tất cả label map (cross-device) |
| PUT | `/api/realtime/conversation-label` | Lưu label cho 1 conversation |
| PUT | `/api/realtime/conversation-labels/bulk` | Bulk push local labels lên server |
| GET | `/api/realtime/livestream-conversations` | Lấy tất cả livestream conversations (theo post) |
| PUT | `/api/realtime/livestream-conversation` | Lưu/update 1 livestream conversation |
| DELETE | `/api/realtime/livestream-conversations?conv_id=X` | Xóa 1 conv khỏi livestream |
| DELETE | `/api/realtime/livestream-conversations?post_id=X` | Xóa tất cả conv của 1 post |
| GET | `/api/realtime/pending-customers?limit=500` | Lấy danh sách khách chưa trả lời |
| POST | `/api/realtime/mark-replied` | Đánh dấu đã trả lời (body: `{psid, pageId}`) |
| POST | `/api/realtime/start` | Khởi động server-side Pancake WebSocket proxy |
| GET | `/api/realtime/status` | Kiểm tra trạng thái WebSocket connection |
| * | `/api/pancake/*` | Proxy tới Pancake API (generic) |
| * | `/api/pancake-direct/*` | Proxy tới Pancake API (có JWT cookie + Referer) |
| * | `/api/pancake-official/*` | Proxy tới Pancake Official API (page_access_token) |

### 3.2 Pancake API (qua proxy)

| Endpoint | Mô tả |
|----------|--------|
| `GET /conversations` | Multi-page conversations (primary) |
| `GET /pages/{pageId}/conversations` | Per-page conversations (fallback) |
| `GET /pages/{pageId}/conversations/{convId}/messages` | Lấy tin nhắn |
| `POST /pages/{pageId}/conversations/{convId}/messages` | Gửi tin nhắn |
| `POST /pages/{pageId}/conversations/{convId}/unread` | Đánh dấu chưa đọc |
| `POST /pages/{pageId}/comments/{msgId}/reactions` | Gửi reaction |
| `POST /pages/{pageId}/customers/{customerId}/notes` | Thêm ghi chú |
| Search conversations | Tìm kiếm qua `pancakeDataManager.searchConversations()` |
| Upload image | Upload qua `pancakeDataManager.uploadImage()` |
| Like/Unlike comment | `pancakeDataManager.likeComment()` / `unlikeComment()` |
| Hide/Unhide comment | `pancakeDataManager.hideComment()` / `unhideComment()` |
| Delete comment | `pancakeDataManager.deleteComment()` |
| Mark as read | `pancakeDataManager.markConversationAsRead()` |

### 3.3 Render Server (WebSocket Proxy)

**URL**: `wss://n2store-realtime.onrender.com`

- Nhận events real-time từ Pancake WebSocket
- Broadcast tới tất cả connected clients

### 3.4 Goong Maps API

- Autocomplete địa chỉ trong form đơn hàng
- Module: `goong-places.js` → `goongAttachAutocomplete(textarea)`

---

## 4. Real-time / WebSocket

### 4.1 Kiến trúc Server Mode Proxy

```
                                    Pancake WS
                                    (pancake.vn)
                                        ↑↓
Client Browser ←→ Render Server ←→ Pancake WS Connection
(WebSocket)       (Node.js)        (Server-side)
```

### 4.2 Luồng kết nối

1. **Client POST `/api/realtime/start`** → gửi `{token, userId, pageIds, cookie}` tới Render server
2. Render server dùng JWT token để kết nối Pancake WebSocket (server-side)
3. **Client mở WebSocket** tới `wss://n2store-realtime.onrender.com`
4. Render server broadcast events từ Pancake → tất cả clients
5. Client xử lý events và update UI real-time

### 4.3 Events nhận được

| Event Type | Payload | Xử lý |
|------------|---------|--------|
| `pages:update_conversation` / `update_conversation` | `{conversation: {...}}` | Update/thêm mới conversation, detect livestream |
| `pages:new_message` / `new_message` | `{message: {...}}` | Update lastMessage, reload messages nếu đang xem |
| `post_type_detected` | `{conversationId, postId, postType, liveVideoStatus}` | Auto-detect livestream |

### 4.4 Reconnection Strategy

- **Max attempts**: 3 lần
- **Backoff**: 3s → 4.5s → 6.75s (×1.5, tối đa 15s)
- **Fallback**: Sau 3 lần thất bại → chuyển sang polling mỗi 30 giây
- **Auto-refresh interval**: 30,000ms (30 giây)

### 4.5 WebSocket Status UI

- **Icon Wifi (xanh)**: `ws-status connected` - Đã kết nối
- **Icon Wifi-Off (đỏ)**: `ws-status disconnected` - Mất kết nối
- Hiển thị ở góc trên phải chat header

---

## 5. Chức năng chi tiết

### 5.1 Layout 3 cột (Resizable)

| Cột | ID | Chức năng |
|-----|----|-----------|
| Column 1 | `col1` | Danh sách cuộc hội thoại (conversation list) |
| Column 2 | `col2` | Khu vực chat (messages + input) |
| Column 3 | `col3` | Panel thông tin (Phân Nhóm / Hoạt Động / Đơn Hàng) |

- **Resize handles**: Kéo thả giữa các cột (mouse + touch support)
- **Min width**: Mỗi cột có min-width riêng
- **Toggle col3**: Nút ẩn/hiện panel phải

### 5.2 Conversation List (Column 1)

#### Tìm kiếm 2 tầng
1. **Local filter (tức thì)**: Tìm theo tên, lastMessage, phone, pageName (có remove diacritics)
2. **API search (debounced 300ms)**: Gọi `pancakeDataManager.searchConversations(query)` để tìm kết quả từ server
3. **Merge results**: Kết hợp local + API results, loại trùng theo ID

#### Filter tabs
| Tab | Filter | Mô tả |
|-----|--------|--------|
| Tất cả | `all` | Tất cả conversations |
| Chưa đọc | `unread` | `conv.unread > 0` |
| Livestream | `livestream` | `conv.isLivestream === true` |
| Inbox My | `inbox_my` | `!conv.isLivestream` (không phải livestream) |

- Filter tab hiện tại được lưu vào `localStorage('inbox_current_filter')`

#### Type filter (áp dụng xuyên suốt tất cả tabs)
| Type | Filter | Mô tả |
|------|--------|--------|
| Tất cả | `all` | Cả inbox + comment |
| Tin nhắn | `INBOX` | Chỉ tin nhắn Messenger |
| Bình luận | `COMMENT` | Chỉ bình luận trên post |

- Hiển thị badge count cho mỗi type

#### Page filter (Multi-select)
- Dropdown chọn nhiều Pages cùng lúc
- Hiển thị unread badge per page
- "Tất cả Pages" = không filter

#### Livestream Post Selector
- Chỉ hiện khi ở tab Livestream
- Dropdown chọn bài post cụ thể
- Nút "Lấy tên bài viết" - fetch post names từ API
- Nút "Xóa livestream" - xóa tất cả conv livestream của bài post

#### Conversation Item hiển thị
- Avatar (4-tier fallback: direct → pancake avatar API → FB profile pic → gradient placeholder)
- Tên khách hàng
- Page name
- Preview tin nhắn cuối
- Thời gian (format VN timezone GMT+7)
- Unread badge (9+)
- Labels (multi-label, color-coded)
- Pancake tags (tối đa 3)
- LIVE badge (nếu là livestream)
- Type icon (message-circle / message-square)
- Nút toggle read/unread

#### Phân trang (Infinite scroll)
- Scroll xuống cuối → `loadMoreConversations()`
- Cursor-based pagination từ Pancake API
- Cooldown progressive: 2s, 4s, 6s... max 10s khi filter loại nhiều kết quả
- Error cooldown: 5s khi gặp lỗi (bao gồm 429)

### 5.3 Chat Area (Column 2)

#### Chat Header
- Avatar khách hàng (4-tier fallback)
- Tên khách hàng
- Status line: Page name · Bình luận · Livestream · post type
- WebSocket status icon
- Nút đánh dấu chưa đọc
- Nút toggle Livestream
- Nút toggle right panel
- Header note (inline, từ customer notes)

#### Customer Stats Bar
- Phone number (click to copy)
- Comment count
- Order success count
- Order fail/return count
- Warning badge nếu tỉ lệ hoàn > 30%

#### Post Info Banner (cho COMMENT/Livestream)
- Thumbnail ảnh/video bài post
- Tiêu đề bài post (truncated 100 chars)
- Status badge: LIVE / VOD / POST / video
- Link "Xem trên Facebook"

#### Chat Messages
- **Date separators**: "Hôm nay", "Hôm qua", "dd/MM/yyyy"
- **Message bubbles**: incoming (trái) / outgoing (phải)
- **Avatar**: Chỉ hiện cho incoming messages
- **Attachments**: Image, Photo, Sticker, GIF, Video, Audio, File, Like/Thumbsup
- **Quoted messages** (replied_message): Hiển thị nội dung trích dẫn + attachment preview
- **Phone tags**: Highlight số điện thoại (click to copy)
- **Reactions**: Emoji reactions + reaction summary (LIKE, LOVE, HAHA, WOW, SAD, ANGRY, CARE)
- **Status indicators**: Ẩn (eye-off), Đã xóa (trash-2)
- **Reply type badge**: "Nhắn riêng" cho private_replies
- **Sender name**: Tên nhân viên cho outgoing messages
- **Type icon**: Comment (message-circle) / Inbox (mail)
- **Read receipt**: Check-check icon cho outgoing
- **Typing indicator**: 3 dots animation (set via WebSocket)
- **System message filter**: Ẩn "Đã thêm nhãn tự động:", "Đã đặt giai đoạn", "[Tin nhắn trống]"

#### Message Hover Actions
| Action | Loại | Mô tả |
|--------|------|--------|
| Reply | INBOX + COMMENT | Set reply target, hiện reply preview bar |
| React | COMMENT | Mở reaction picker (6 emoji) |
| Like/Unlike | COMMENT | Toggle like trên bình luận |
| Hide/Unhide | COMMENT | Ẩn/hiện bình luận |
| Copy | Tất cả | Copy text tin nhắn |
| Delete | COMMENT | Xóa bình luận (có confirm) |

#### Reaction Picker
- 6 emoji: 👍 LIKE, ❤️ LOVE, 😆 HAHA, 😮 WOW, 😢 SAD, 😠 ANGRY
- Positioned floating near message button
- Gửi reaction qua `/pages/{pageId}/comments/{msgId}/reactions`

#### Reply Preview Bar
- Hiện khi đang reply tin nhắn
- Tên người gửi + nội dung trích dẫn (truncated 80 chars)
- Nút hủy reply

#### Message Pagination (scroll up)
- Scroll lên đầu → load older messages
- Loading indicator ở trên cùng
- Maintain scroll position sau khi prepend
- "Đầu cuộc hội thoại" marker khi hết messages

### 5.4 Chat Input Area

#### Input Toolbar
- **Send Page Selector** ("Gửi từ"): Dropdown chọn page gửi (khi có nhiều pages)
- **Reply Type Selector** (chỉ COMMENT): "Bình luận (công khai)" / "Nhắn riêng"
- **Quick Reply button**: Mở modal mẫu trả lời nhanh
- **Attach Image**: File picker (accept: image/*)
- **Attach File**: File picker (accept: .pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar, max 25MB)
- **Emoji Picker**: 7 categories (recent, smileys, gestures, hearts, animals, food, objects)

#### Emoji Picker
- **Categories**: Gần đây, Mặt cười, Cử chỉ, Trái tim, Động vật, Đồ ăn, Đồ vật
- **Recent**: Lưu vào `localStorage('inbox_recent_emojis')`, tối đa 24
- **Insert**: Chèn tại vị trí cursor

#### Image Preview
- Hiện khi paste ảnh hoặc chọn file
- Thumbnail preview
- Nút xóa (×)
- Gửi kèm text khi nhấn Enter/Send

#### Auto-resize Textarea
- Tự điều chỉnh chiều cao theo nội dung
- Max height: 120px
- Enter = gửi, Shift+Enter = xuống dòng

### 5.5 Gửi tin nhắn (Send Message Flow)

#### Luồng tổng quát
```
1. Validate input (text hoặc image)
2. COMMENT: phải chọn bình luận target hoặc đổi sang "Nhắn riêng"
3. Clear input + image preview
4. Optimistic UI update (addMessage → renderMessages)
5. Lấy page_access_token (3-step fallback)
6. Upload image (nếu có) → gửi content_url
7. Gửi text theo loại conversation
8. markAsRead()
9. Reload messages sau 2 giây
```

#### Send cho INBOX conversations (`_sendInbox`)
```
reply_inbox (primary)
  ↓ nếu 24h error hoặc 551 (user unavailable)
private_replies (fallback - cần post_id + from_id)
```

#### Send cho COMMENT conversations (`_sendComment`)

**Mode: reply_comment** (bình luận công khai)
```
reply_comment (target: message_id)
  ↓ nếu thất bại
private_replies (fallback - nhắn riêng)
```

**Mode: private_replies** (nhắn riêng)
```
private_replies (target: post_id + message_id + from_id)
  ↓ nếu thất bại
reply_inbox (fallback - gửi qua Messenger)
```

#### Facebook API Error Handling
| Error | Mô tả | Xử lý |
|-------|--------|--------|
| e_code=10, e_subcode=2018278 | Quá 24h messaging window | Thông báo + fallback private_replies |
| e_code=551 | User unavailable / chưa inbox / block page | Thông báo + fallback |
| Khác | Lỗi chung | Hiển thị error message |

### 5.6 Label Bar (Phân loại cuộc hội thoại)

- Hiện dưới chat area
- Multi-select: Toggle nhiều label cùng lúc
- "Hoàn Tất" (done) là exclusive - xóa tất cả label khác
- Nếu bỏ hết label → tự về "Inbox Mới" (new)
- Drag-to-resize: Kéo handle để mở rộng/thu gọn
- Double-click: Toggle expand/collapse

#### Default Labels
| ID | Tên | Màu | Mô tả |
|----|-----|------|--------|
| `new` | Inbox Mới | #3b82f6 | Tin nhắn mới chưa xử lý |
| `processing` | Đang Xử Lý | #f59e0b | Đang được nhân viên xử lý |
| `waiting` | Chờ Phản Hồi | #f97316 | Đã trả lời, chờ khách phản hồi |
| `ordered` | Đã Đặt Hàng | #10b981 | Khách đã chốt đơn |
| `urgent` | Cần Gấp | #ef4444 | Khiếu nại, đổi trả, lỗi đơn |
| `done` | Hoàn Tất | #6b7280 | Đã xử lý xong |

### 5.7 Nhóm Phân Loại (Column 3 - Tab Stats)

#### Group Stats Cards
- Hiển thị tất cả nhóm với icon + tên + count
- Click để filter conversation list theo nhóm (multi-select toggle)
- Tooltip (?) hiển thị ghi chú mô tả nhóm
- Recalculate counts khi thay đổi type filter

#### Manage Groups Modal
- CRUD nhóm: thêm, sửa tên, sửa ghi chú, đổi màu, xóa
- 10 màu có sẵn để chọn
- Color picker popover cho từng nhóm
- Save: lưu local + sync server (async)
- Xóa nhóm → conversations chuyển về "Inbox Mới"

#### Đồng bộ cross-device
- Groups: `GET/PUT /api/realtime/inbox-groups`
- Labels: `GET /api/realtime/conversation-labels` → merge local ↔ server
- Bulk push: local-only labels → `PUT /api/realtime/conversation-labels/bulk`

### 5.8 Notes (Ghi chú khách hàng)

#### Hiển thị
- **Header inline**: Note mới nhất hiện cạnh tên khách (với tooltip full list)
- **Right panel section**: Danh sách tất cả notes + input thêm mới

#### Thêm note
- Enter trong input → gọi `pancakeDataManager.addCustomerNote(pageId, customerId, text)`
- Sau khi thêm → clear cache + reload messages để cập nhật

### 5.9 Activities Panel (Column 3 - Tab Hoạt Động)

- Hiển thị các bài viết liên quan của khách hàng
- Thumbnail + tiêu đề (truncated 80 chars) + ngày
- Click → mở bài viết trên Facebook
- Data từ `conv._messagesData.activities`

### 5.10 Tạo Đơn Hàng (Column 3 - Tab Đơn Hàng)

#### Form fields
| Field | Type | Mô tả |
|-------|------|--------|
| Tên Khách Hàng | text | Auto-fill từ conversation |
| SĐT | tel | Auto-fill từ extracted phone |
| Địa Chỉ | textarea | Goong Places autocomplete |
| Sản phẩm (nhiều) | group | Tên SP, Phân Loại, SL, Giá |
| Phí Ship | text | VNĐ |
| Giảm Giá | text | VNĐ |
| Thanh Toán | select | COD / Chuyển khoản / Đặt cọc |
| Đặt Cọc | text | Chỉ hiện khi chọn "Đặt cọc một phần" |
| Ghi Chú | textarea | |

#### Tính toán
- **Tạm tính**: Σ(giá × số lượng)
- **Tổng cộng**: Tạm tính + Phí ship - Giảm giá
- Auto-update khi thay đổi giá/SL/ship/discount

#### Lưu trữ
- Lưu vào `localStorage('inbox_orders')` (mảng JSON)
- Order ID format: `ORD-{timestamp}`
- Trạng thái: `pending`

#### Validation
- Bắt buộc: Tên KH, SĐT, ít nhất 1 sản phẩm
- Reset form sau khi tạo thành công
- Re-fill KH info nếu đang chọn conversation

### 5.11 Livestream Management

#### Auto-detect Livestream
- Khi load messages: kiểm tra `post.type === 'livestream'` hoặc `post.live_video_status === 'vod'/'live'`
- Khi nhận WebSocket event: kiểm tra `conversation.post` data
- Khi nhận `post_type_detected` event

#### Manual Toggle
- Nút radio icon trên chat header
- Toggle on: `markAsLivestream(convId, postId)`
  - Tự động mark COMMENT conv + newest INBOX conv cùng customer (qua psid)
  - Save to server
- Toggle off: `unmarkAsLivestream(convId)` + DELETE on server

#### Livestream Data (Server = Single Source of Truth)
```
{
  posts: {
    "post_id_1": [
      { conv_id, name, type, psid, page_id, customer_id, updated_at }
    ]
  },
  postNames: {
    "post_id_1": "Tên bài post livestream"
  }
}
```

#### Virtual Conversations
- Server có conv_id nhưng Pancake API chưa trả về → tạo virtual entry
- `_virtual: true` flag
- Hiển thị trong danh sách Livestream tab

#### Clear Livestream
- Xóa tất cả conv livestream của 1 bài post
- DELETE `/api/realtime/livestream-conversations?post_id=X`
- Refetch từ server sau khi xóa

### 5.12 Pancake Settings Modal

#### Quản lý Accounts
- Danh sách tài khoản Pancake (JWT token)
- **Thêm tài khoản**:
  - Input JWT token (textarea)
  - Auto-clean: xóa khoảng trắng, prefix "jwt=", v.v.
  - Token validation (decode JWT, check exp)
  - "Lấy từ Cookie" / "Debug" / "Thêm Token"
- **Hướng dẫn**: Cách lấy JWT từ pancake.vn DevTools
- **Xóa tất cả**: Clear all accounts

#### Quản lý Page Access Tokens
- Danh sách page tokens đã lưu
- **Thêm Page Token**:
  - Dropdown chọn Page
  - Input page access token
  - "Tự động tạo" (generate from API) / "Lưu Token" (manual)
- **Hướng dẫn**: Cách lấy từ Pancake Settings → Tools → API

### 5.13 Render Data Modal

- Hiển thị dữ liệu raw từ Render DB
- 4 tabs:
  1. **Livestream Convs**: `/api/realtime/livestream-conversations`
  2. **Labels**: `/api/realtime/conversation-labels`
  3. **Pending Customers**: `/api/realtime/pending-customers`
  4. **Realtime Status**: `/api/realtime/status`
- Fetch all endpoints in parallel
- JSON pretty print

---

## 6. Conversation Loading Strategy

### Multi-account Fallback Chain

```
1. Multi-page endpoint (GET /conversations)
   ├── Success → dùng kết quả
   ├── Error 105 (no permission)
   │   ├── Per-page endpoint (current account)
   │   │   ├── Success → dùng kết quả
   │   │   └── Fail → tryOtherAccounts()
   │   │       ├── Multi-page endpoint (per account)
   │   │       └── tryOtherAccountsPerPage()
   │   └── 0 results → tryOtherAccounts()
   ├── Error 122 (subscription expired)
   │   ├── Per-page endpoint (current account, skip expired pages)
   │   └── tryOtherAccountsPerPage()
   └── 0 results → tryOtherAccounts()
       └── Per-page endpoint (per account)
```

### Per-page Fetch
- Gọi API riêng cho từng page: `GET /pages/{pageId}/conversations`
- Cache working pages (skip expired ones)
- Sort: unread first → updated_at desc

### Pending Customers (Unread Merge)
- Fetch từ Render DB: `/api/realtime/pending-customers`
- Merge unread_count vào loaded conversations
- Update lastMessage từ actual message snippet

---

## 7. Data Storage

### localStorage

| Key | Mô tả |
|-----|--------|
| `inbox_conv_labels` | Label map: `{ convId: ["label1", "label2"] }` |
| `inbox_groups` | Groups array: `[{ id, name, color, note, count }]` |
| `inbox_current_filter` | Active filter tab: "all" / "unread" / "livestream" / "inbox_my" |
| `inbox_recent_emojis` | Recent emojis array (max 24) |
| `inbox_orders` | Orders array: `[{ id, customerName, phone, ... }]` |

### Server (Cloudflare Worker → Render DB)

| Data | Endpoint | Mô tả |
|------|----------|--------|
| Groups | `/api/realtime/inbox-groups` | Nhóm phân loại |
| Labels | `/api/realtime/conversation-labels` | Label map cross-device |
| Livestream | `/api/realtime/livestream-conversations` | Livestream conv_ids + post_ids |
| Pending | `/api/realtime/pending-customers` | Khách chưa trả lời |

### Firebase

| Collection | Mô tả |
|------------|--------|
| Pancake accounts | JWT tokens + account metadata |
| Page access tokens | Cached page tokens |

---

## 8. Classes & Objects

### 8.1 InboxDataManager (inbox-data.js)

**Properties:**
- `conversations: []` - Mapped conversations
- `groups: []` - Nhóm phân loại
- `pages: []` - Pancake pages
- `labelMap: {}` - convId → labels array
- `livestreamPostMap: {}` - postId → conv array
- `livestreamPostNames: {}` - postId → post name
- `livestreamConvIdSet: Set` - O(1) lookup
- `conversationMap: Map` - id → conversation
- `conversationByPsidMap: Map` - psid → conversation
- `conversationByCustomerIdMap: Map` - customerId → conversation

### 8.2 InboxChatController (inbox-chat.js)

**Properties:**
- `activeConversationId` - ID cuộc hội thoại đang chọn
- `currentFilter` - Filter tab hiện tại
- `currentGroupFilters: Set` - Multi-select group filter
- `currentTypeFilter` - 'all' / 'INBOX' / 'COMMENT'
- `selectedPageIds: Set` - Multi-page filter
- `selectedLivestreamPostId` - Filter livestream theo post
- `searchQuery` / `isSearching` / `searchResults` - Search state
- `isSending` / `isLoadingMessages` - Loading flags
- `currentSendPageId` - Page gửi tin (null = conversation's page)
- `currentReplyType` - 'reply_comment' / 'private_replies' / 'reply_inbox'
- `replyingTo` - Reply state: `{ msgId, text, senderName, isOutgoing }`
- `pendingImage` - File object cho image paste/attach
- `socket` / `isSocketConnected` / `isSocketConnecting` - WebSocket state
- `socketReconnectAttempts` / `socketMaxReconnectAttempts` (3) - Reconnect
- `autoRefreshInterval` / `AUTO_REFRESH_INTERVAL` (30000ms) - Polling fallback
- `quickReplies: []` - Predefined quick reply buttons
- `emojiData: {}` - Emoji categories data
- `pageUnreadCounts: {}` - Unread count per page

### 8.3 InboxOrderController (inbox-orders.js)

**Properties:**
- `productIndex` - Counter cho product rows
- `elements: {}` - DOM element references

---

## 9. Luồng khởi tạo (`initInboxApp`)

```
1. Show loading state (conversation list spinner)
2. lucide.createIcons()
3. initColumnResizer() - draggable column dividers
4. new InboxDataManager() → init()
   a. loadGroups() - localStorage cache
   b. loadLocalState() - labels from localStorage
   c. pancakeTokenManager.initialize() - load accounts from Firebase
   d. pancakeDataManager.initialize() - load pages + conversations
   e. loadConversations(true) - if initialize() returned 0
   f. loadGroupsFromServer() - fetch/seed groups on server
   g. syncLabelsFromServer() - merge labels local ↔ server
   h. recalculateGroupCounts()
   i. buildMaps() - O(1) lookup maps
   j. fetchLivestreamFromServer() - async, updates isLivestream flags

5. new InboxChatController(dataManager) → init()
   a. bindEvents() - all event listeners
   b. renderPageSelector() - multi-page dropdown
   c. renderConversationList() - conversation items
   d. renderGroupStats() - group stats cards

6. new InboxOrderController(dataManager) → init()
   a. bindEvents() - form events
   b. goongAttachAutocomplete() - address autocomplete

7. initializeWebSocket()
   - POST /api/realtime/start → connect proxy WS
   - Fallback: startAutoRefresh() (30s polling)

8. updatePageUnreadCounts()
9. fetchPendingFromServer() - merge unread data
10. Listen 'pancakeAccountChanged' event → reinitialize
11. PermissionHelper.applyUIRestrictions('inbox')
```

---

## 10. 24h Messaging Window

- Facebook giới hạn: chỉ gửi tin nhắn trong 24h sau khi khách nhắn cuối
- `check24hWindow(convId)` → `{ isOpen: boolean, hoursRemaining: number }`
- Warning toast khi còn ≤ 2h
- Không block gửi (API tự reject) → fallback to private_replies

---

## 11. Mapped Conversation Format

```javascript
{
  id: "conv_id",
  name: "Tên khách hàng",
  avatar: "url_or_null",
  lastMessage: "Nội dung tin nhắn cuối",
  time: Date,
  unread: 3,
  online: false,
  phone: "0944333435",
  labels: ["new", "processing"],
  isLivestream: false,
  type: "INBOX" | "COMMENT",
  pageId: "page_id",
  pageName: "Nhi Judy House",
  psid: "customer_psid",
  customerId: "customer_id",
  conversationId: "conv_id",
  isCustomerLast: true,  // khách gửi tin cuối (chưa trả lời)
  messages: [],          // loaded on demand
  _raw: {},              // raw Pancake data
  _messagesData: {},     // full response metadata
  _virtual: false,       // true = server-only entry
}
```

---

## 12. Mapped Message Format

```javascript
{
  id: "msg_id",
  text: "Nội dung tin nhắn (clean text)",
  time: Date,
  sender: "shop" | "customer",
  attachments: [],          // image, video, file, sticker, etc.
  senderName: "Tên NV",
  fromId: "sender_fb_id",
  reactions: [],            // from attachments type=reaction
  reactionSummary: {},      // { LIKE: 1, LOVE: 2, ... }
  phoneInfo: [],            // detected phone numbers
  isHidden: false,          // comment ẩn
  isRemoved: false,         // comment đã xóa
  userLikes: false,         // page đã like
  canHide: true,
  canRemove: true,
  canLike: true,
  replyType: "private_replies" | undefined,  // for outgoing
}
```

---

## 13. Attachment Types Supported

| Type | Render | Mô tả |
|------|--------|--------|
| `image` / `photo` | `<img>` click to open | Ảnh |
| `sticker` | `<img>` nhỏ hơn | Sticker |
| `animated_image_url` | `<img>` | GIF |
| `video` | `<video controls>` | Video |
| `audio` | `<audio controls>` | Audio |
| `file` / `document` | `<a>` download link | Tệp đính kèm |
| `like` / `thumbsup` | 👍 | Like icon |
| `replied_message` | Quoted message box | Tin nhắn trích dẫn |
| `reaction` | Filtered out from media | Reaction data |

---

## 14. Toast Notification System

- **Function**: `showToast(message, type)`
- **Types**: `info`, `success`, `warning`, `error`
- **Duration**: 3 giây → fade out (0.3s transition)
- **Container**: `#toastContainer` (bottom-right)
- **Alias**: `window.notificationManager.show()` (compat shim)

---

## 15. Quick Reply (Mẫu trả lời nhanh)

- **Manager**: `window.quickReplyManager` (shared module)
- **Button**: Zap icon trên toolbar
- **Modal**: Mở modal chọn mẫu, chèn vào chat input
- **Quick Reply Bar**: 14 predefined buttons (hiện tại disabled `bar.style.display = 'none'`)

---

## 16. Responsive & UI Features

- **Column resizer**: Drag handle giữa 3 cột (mouse + touch)
- **Label bar resize**: Drag handle hoặc double-click để expand/collapse
- **Auto-resize textarea**: Tự mở rộng theo nội dung, max 120px
- **Scroll-to-bottom button**: Hiện khi scroll lên > 200px từ bottom
- **Vietnam timezone**: Tất cả thời gian hiển thị theo GMT+7
- **Diacritics-free search**: "Huỳnh Thành Đạt" → "huynh thanh dat"
- **Debounced icon render**: `_debouncedCreateIcons()` via requestAnimationFrame
