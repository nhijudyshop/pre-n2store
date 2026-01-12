# Giải thích các biến trong fetch inbox_preview

## URL mẫu
```
https://pancake.vn/api/v1/pages/{page_id}/customers/{customer_id}/inbox_preview?access_token={token}
```

## Ví dụ thực tế
```
https://pancake.vn/api/v1/pages/117267091364524/customers/658ffee5-09b2-40e9-94de-b7c87afb45b9/inbox_preview?access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 1. **page_id** (`117267091364524`)

### Nguồn gốc
- **Lấy từ**: `order.Facebook_PostId`
- **Xử lý bởi**: `chatDataManager.parseChannelId(order.Facebook_PostId)`
- **File**: `chat-data-manager.js:355-359`

### Cách hoạt động
```javascript
parseChannelId(postId) {
    if (!postId || typeof postId !== 'string') return null;
    const parts = postId.split('_');
    return parts.length > 0 ? parts[0] : null;
}
```

### Ví dụ
- Input: `order.Facebook_PostId = "117267091364524_987654321"`
- Output: `channelId = "117267091364524"`

### Ý nghĩa
- **Page ID**: ID của trang Facebook (Fan Page)
- Là phần đầu tiên của Facebook Post ID khi split bởi dấu `_`
- Được sử dụng để xác định trang Facebook nào đang chat với khách

### Vị trí sử dụng
```javascript
// tab1-orders.js:5020-5023
const inboxPreviewUrl = window.API_CONFIG.buildUrl.pancake(
    `pages/${channelId}/customers/${pancakeCustomerUuid}/inbox_preview`,
    `access_token=${token}`
);
```

---

## 2. **customer_id** (`658ffee5-09b2-40e9-94de-b7c87afb45b9`)

### Nguồn gốc
- **Lấy từ**: Pancake conversation data
- **File**: `tab1-orders.js:4979-4981`

### Cách hoạt động

#### Bước 1: Lấy Facebook PSID từ order
```javascript
// tab1-orders.js:4956
const facebookPsid = order.Facebook_ASUserId;
```

#### Bước 2: Tìm conversation từ Pancake cache
```javascript
// tab1-orders.js:4964-4977
let conversation = window.pancakeDataManager.getConversationByUserId(facebookPsid);

// Nếu không tìm thấy trong cache, fetch từ Pancake API
if (!conversation) {
    await window.pancakeDataManager.fetchConversations(true); // Force refresh
    conversation = window.pancakeDataManager.getConversationByUserId(facebookPsid);
}
```

#### Bước 3: Extract customer UUID
```javascript
// tab1-orders.js:4979-4981
if (conversation && conversation.customers && conversation.customers.length > 0) {
    pancakeCustomerUuid = conversation.customers[0].uuid || conversation.customers[0].id;
    // NOTE: Thực tế API chỉ trả về field "id", không có "uuid"
    // Code có fallback uuid || id để tương thích với cả 2 trường hợp
    console.log('[CHAT-MODAL] ✅ Got Pancake customer UUID:', pancakeCustomerUuid);
}
```

**Response structure thực tế:**
```json
{
    "customers": [
        {
            "fb_id": "24963016583388898",
            "id": "27832f3f-7137-4588-9ff5-bfb93d887486",
            "name": "Khiết Nhi"
        }
    ]
}
```

→ Lấy `conversation.customers[0].id` = `"27832f3f-7137-4588-9ff5-bfb93d887486"`

### Ý nghĩa
- **Pancake Customer UUID**: ID duy nhất của khách hàng trong hệ thống Pancake
- Được lưu trong conversation data của Pancake
- Map với Facebook PSID để liên kết giữa Facebook và Pancake

### Cấu trúc conversation
```javascript
{
    id: "270136663390370_24963016583388898",
    type: "INBOX" hoặc "COMMENT",
    from_psid: "24963016583388898",  // Facebook PSID
    from: {
        id: "24963016583388898",
        name: "Khiết Nhi",
        email: "24963016583388898@facebook.com"
    },
    customers: [
        {
            fb_id: "24963016583388898",
            id: "27832f3f-7137-4588-9ff5-bfb93d887486",  // ← Customer UUID - ĐÂY LÀ GIÁ TRỊ CẦN LẤY
            name: "Khiết Nhi"
        }
    ],
    page_id: "270136663390370",
    thread_id: "122106004893064602",
    thread_key: "t_122106004893064602",
    ...
}
```

---

## 3. **access_token** (JWT Token)

### Nguồn gốc
- **Lấy từ**: `window.pancakeTokenManager.getToken()`
- **File**: `pancake-token-manager.js:423-453`

### Cách hoạt động (Priority order)

#### Priority 1: Memory cache
```javascript
// pancake-token-manager.js:424-428
if (this.currentToken && !this.isTokenExpired(this.currentTokenExpiry)) {
    console.log('[PANCAKE-TOKEN] Using cached token');
    return this.currentToken;
}
```

#### Priority 2: Firebase database
```javascript
// pancake-token-manager.js:430-435
const firebaseToken = await this.getTokenFromFirebase();
if (firebaseToken) {
    console.log('[PANCAKE-TOKEN] Using token from Firebase');
    return firebaseToken;
}
```

**Firebase structure:**
```
pancake_jwt_tokens/
  accounts/
    {accountId}/
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      exp: 1771408156
      uid: "c42ef91d-1a1d-43aa-b8af-8ac014d83d6c"
      name: "Kỳ Thuật NJD"
      savedAt: 1763632156000
```

#### Priority 3: Cookie từ pancake.vn
```javascript
// pancake-token-manager.js:437-448
const cookieToken = this.getTokenFromCookie();
if (cookieToken) {
    const payload = this.decodeToken(cookieToken);
    if (payload && !this.isTokenExpired(payload.exp)) {
        console.log('[PANCAKE-TOKEN] Using token from cookie, saving to Firebase...');
        await this.saveTokenToFirebase(cookieToken);
        return cookieToken;
    }
}
```

### Ý nghĩa
- **JWT Token**: Token xác thực để gọi Pancake API
- Format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{payload}.{signature}`
- Chứa thông tin user: uid, name, exp (expiry time), fb_id, session_id

### Token payload (decoded)
```json
{
  "name": "Kỳ Thuật NJD",
  "exp": 1771408156,
  "application": 1,
  "uid": "c42ef91d-1a1d-43aa-b8af-8ac014d83d6c",
  "session_id": "9dbcd4aa-6a91-426f-884c-46ea8e7646d58",
  "iat": 1763632156,
  "fb_id": "130759086650522",
  "login_session": null,
  "fb_name": "Kỳ Thuật NJD"
}
```

### Multi-account support
- Hệ thống hỗ trợ nhiều account Pancake
- Active account được lưu trong localStorage (per-device): `pancake_active_account_id`
- Token expiry có buffer 1 giờ để tự động refresh

---

## Flow tổng hợp

```
1. User click vào tin nhắn/bình luận trong bảng orders
   ↓
2. Gọi openChatModal(orderId, channelId, psid, type='comment')
   ↓
3. Lấy order data từ allData[]
   ↓
4. Parse các biến:
   - channelId = parseChannelId(order.Facebook_PostId)
     → "117267091364524"

   - facebookPsid = order.Facebook_ASUserId
     → "7654321098765432"

   - conversation = pancakeDataManager.getConversationByUserId(facebookPsid)

   - pancakeCustomerUuid = conversation.customers[0].uuid
     → "658ffee5-09b2-40e9-94de-b7c87afb45b9"

   - token = await pancakeTokenManager.getToken()
     → "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   ↓
5. Build URL và fetch inbox_preview:
   GET https://pancake.vn/api/v1/pages/{channelId}/customers/{pancakeCustomerUuid}/inbox_preview?access_token={token}
   ↓
6. Nhận response với thread_id, thread_key, from_id để reply comment
```

---

## Các file liên quan

| File | Vai trò |
|------|---------|
| `tab1-orders.js:4820-5050` | Hàm openChatModal - logic chính |
| `chat-data-manager.js:355-380` | Parse channelId, getChatInfoForOrder |
| `pancake-data-manager.js` | Quản lý Pancake conversations cache |
| `pancake-token-manager.js` | Quản lý JWT tokens với Firebase |
| `orders-report/tab1-orders.html` | UI để click vào chat |

---

## Debug tips

### Xem token info
```javascript
window.pancakeTokenManager.getTokenInfo()
```

### Xem all accounts
```javascript
window.pancakeTokenManager.getAllAccounts()
```

### Xem conversation cache
```javascript
// Tìm conversation theo PSID
const conv = window.pancakeDataManager.getConversationByUserId("7654321098765432");
console.log(conv);

// Xem cache stats
console.log({
    inbox_psid_count: window.pancakeDataManager.inboxMapByPSID.size,
    inbox_fbid_count: window.pancakeDataManager.inboxMapByFBID.size,
    comment_psid_count: window.pancakeDataManager.commentMapByPSID.size,
    comment_fbid_count: window.pancakeDataManager.commentMapByFBID.size
});
```

### Force refresh conversations
```javascript
await window.pancakeDataManager.fetchConversations(true);
```

### Debug token
```javascript
const result = window.pancakeTokenManager.debugToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...");
console.log(result);
```
