# Multi-Account Parallel Sending System

## Tổng quan

Hệ thống gửi tin nhắn Facebook sử dụng **tất cả Pancake accounts** để gửi song song, giúp tăng tốc độ gửi tin nhắn đáng kể mà không bị rate limit.

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    Message Template Modal                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ X accounts  │  │  1s delay   │  │ Pancake API (only)  │  │
│  │  (readonly) │  │             │  │ T-Page disabled     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         1. Pre-fetch Page Access (prefetchAllAccountPages)    │
│                                                               │
│   Account A → [Page X, Page Y]                               │
│   Account B → [Page Y, Page Z]                               │
│   Account C → [Page X, Page Z]                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         2. Page-Access-Aware Order Distribution               │
│                                                               │
│   Order 1 (Page X) → eligible: [A, C] → Account A           │
│   Order 2 (Page Y) → eligible: [A, B] → Account B           │
│   Order 3 (Page X) → eligible: [A, C] → Account C           │
│   Order 4 (Page Z) → eligible: [B, C] → Account B           │
│   ...round-robin WITHIN eligible accounts per page           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│         3. Parallel Execution (Workers)                       │
│                                                               │
│   Worker A ──▶ [1] ─delay─ [5] ─delay─ [9] ─delay─          │
│   Worker B ──▶ [2] ─delay─ [4] ─delay─ [8] ─delay─          │
│   Worker C ──▶ [3] ─delay─ [6] ─delay─ [7] ─delay─          │
│                                                               │
│   ↑ Tất cả workers chạy SONG SONG                            │
└─────────────────────────────────────────────────────────────┘
```

## Files liên quan

| File | Mô tả |
|------|-------|
| `js/managers/pancake-token-manager.js` | Quản lý accounts, lưu localStorage |
| `js/chat/message-template-manager.js` | Logic gửi tin nhắn multi-account |

## Cách hoạt động chi tiết

### 1. Lấy danh sách accounts hợp lệ

```javascript
// pancake-token-manager.js
getValidAccountsForSending() {
    const validAccounts = [];
    const now = Math.floor(Date.now() / 1000);

    for (const [accountId, account] of Object.entries(this.accounts)) {
        // Check if not expired (with 1 hour buffer)
        if (account.exp && (now < account.exp - 3600)) {
            validAccounts.push({
                accountId,
                name: account.name,
                uid: account.uid,
                token: account.token,
                exp: account.exp
            });
        }
    }
    return validAccounts;
}
```

### 2. Phân phối đơn hàng (Page-Access-Aware)

Hệ thống **KHÔNG dùng round-robin mù**. Thay vào đó, mỗi đơn được assign cho account có quyền trên page đích.

#### Step 1: Pre-fetch page access

```javascript
// Trước khi phân phối, fetch pages cho tất cả accounts song song
await window.pancakeTokenManager.prefetchAllAccountPages();
// → accountPageAccessMap = { accA: Set(['pageX','pageY']), accB: Set(['pageY','pageZ']), ... }
```

#### Step 2: Smart distribution

```javascript
// message-template-manager.js
this.selectedOrders.forEach((order) => {
    const channelId = order.Facebook_PostId?.split('_')[0]; // Extract pageId

    // Tìm accounts có quyền trên page này
    const eligible = validAccounts.filter(acc =>
        window.pancakeTokenManager.accountHasPageAccess(acc.accountId, channelId)
    );

    if (eligible.length > 0) {
        // Round-robin TRONG nhóm accounts có quyền
        const chosen = eligible[counter % eligible.length];
        accountQueues[chosen.idx].push(order);
    } else {
        // Fallback: round-robin toàn bộ (giữ behavior cũ)
        unassignedOrders.push(order);
    }
});
```

**Ví dụ phân phối (3 accounts, 2 pages):**

| Order | Page | Eligible Accounts | Assigned |
|-------|------|-------------------|----------|
| 1 | Page X | A, C | Account A |
| 2 | Page Y | A, B | Account A |
| 3 | Page X | A, C | Account C |
| 4 | Page Y | A, B | Account B |
| 5 | Page X | A, C | Account A |
| 6 | Page Z | B, C | Account B |

### 3. Tạo Worker cho mỗi account

```javascript
const createWorker = (account, queue) => {
    const context = {
        token: account.token,
        displayName,
        templateContent,
        sendMode
    };

    return async () => {
        for (const order of queue) {
            // Delay before processing
            if (delay > 0) {
                await new Promise(r => setTimeout(r, delay));
            }

            await this._processSingleOrder(order, context);
        }
    };
};
```

### 4. Chạy tất cả workers song song

```javascript
const workers = validAccounts.map((account, i) =>
    createWorker(account, accountQueues[i])()
);

await Promise.all(workers);
```

## Ví dụ thực tế

### Case: 8 Accounts, 1000 Đơn, Delay 1s

#### Phân phối

```
1000 đơn ÷ 8 accounts = 125 đơn/account
```

| Account | Đơn được gán | Số lượng |
|---------|--------------|----------|
| Account 1 | 1, 9, 17, 25, ... 993 | 125 đơn |
| Account 2 | 2, 10, 18, 26, ... 994 | 125 đơn |
| Account 3 | 3, 11, 19, 27, ... 995 | 125 đơn |
| Account 4 | 4, 12, 20, 28, ... 996 | 125 đơn |
| Account 5 | 5, 13, 21, 29, ... 997 | 125 đơn |
| Account 6 | 6, 14, 22, 30, ... 998 | 125 đơn |
| Account 7 | 7, 15, 23, 31, ... 999 | 125 đơn |
| Account 8 | 8, 16, 24, 32, ... 1000 | 125 đơn |

#### Timeline

```
Thời gian (giây)
0s      1s      2s      3s      ...     124s    125s
│       │       │       │               │       │
▼       ▼       ▼       ▼               ▼       ▼

Acc 1:  [Đơn 1] [Đơn 9] [Đơn 17] ...   [Đơn 993] ✅
Acc 2:  [Đơn 2] [Đơn 10][Đơn 18] ...   [Đơn 994] ✅
Acc 3:  [Đơn 3] [Đơn 11][Đơn 19] ...   [Đơn 995] ✅
Acc 4:  [Đơn 4] [Đơn 12][Đơn 20] ...   [Đơn 996] ✅
Acc 5:  [Đơn 5] [Đơn 13][Đơn 21] ...   [Đơn 997] ✅
Acc 6:  [Đơn 6] [Đơn 14][Đơn 22] ...   [Đơn 998] ✅
Acc 7:  [Đơn 7] [Đơn 15][Đơn 23] ...   [Đơn 999] ✅
Acc 8:  [Đơn 8] [Đơn 16][Đơn 24] ...   [Đơn 1000]✅

        ↑       ↑       ↑               ↑
      8 đơn   8 đơn   8 đơn           8 đơn
      /giây   /giây   /giây           /giây
```

#### So sánh hiệu suất

| Phương thức | Công thức | Thời gian |
|-------------|-----------|-----------|
| 1 Account | 1000 × 1s | **16 phút 40 giây** |
| 8 Accounts | 125 × 1s | **2 phút 5 giây** |

**Nhanh hơn ~8 lần!**

## Đảm bảo không trùng lặp

### Tại sao không có đơn nào bị gửi trùng?

1. **Mỗi đơn chỉ nằm trong 1 queue duy nhất**
   ```
   Order 1 → accountQueues[0] → CHỈ Account A xử lý
   Order 2 → accountQueues[1] → CHỈ Account B xử lý
   Order 3 → accountQueues[2] → CHỈ Account C xử lý
   ```

2. **Queue là mảng riêng biệt, không chia sẻ**
   ```javascript
   const accountQueues = validAccounts.map(() => []); // Mỗi account 1 mảng riêng
   ```

3. **Không có cơ chế "lấy từ queue chung"**
   - Khác với worker pool pattern (nhiều worker lấy từ 1 queue)
   - Ở đây: mỗi worker có queue riêng, xử lý tuần tự

### Minh họa

```
KHÔNG TRÙNG:

Account A queue: [1, 4, 7, 10]  ←── Account A CHỈ xử lý những đơn này
Account B queue: [2, 5, 8, 11]  ←── Account B CHỈ xử lý những đơn này
Account C queue: [3, 6, 9, 12]  ←── Account C CHỈ xử lý những đơn này

Không có đơn nào xuất hiện trong 2 queue!
```

## Công thức tính thời gian

```
Thời gian ≈ (Số đơn ÷ Số accounts) × Delay

Ví dụ:
- 1000 đơn, 8 accounts, 1s delay
- Thời gian = (1000 ÷ 8) × 1s = 125s ≈ 2 phút
```

## Throughput

```
Throughput = Số accounts ÷ Delay

Ví dụ:
- 8 accounts, 1s delay
- Throughput = 8 đơn/giây
```

## UI Changes

### Trước (cũ)

```
[1] người  ←── Có thể chỉnh số thread (1-5)
API: ● T-Page  ○ Pancake
```

### Sau (mới)

```
[8] accounts  ←── Readonly, hiển thị số accounts hợp lệ
API: ○ T-Page (disabled)  ● Pancake (default)
```

## Storage

### Accounts được lưu ở đâu?

| Storage | Key | Mục đích |
|---------|-----|----------|
| Firestore | `pancake_tokens/accounts` | Cloud sync, source of truth |
| localStorage | `pancake_all_accounts` | Fast access, offline |
| Memory | `this.accounts` | Runtime cache |

### Flow load accounts

```
1. App khởi động
2. Load từ Firestore
3. Save vào localStorage (backup)
4. Khi gửi tin → getValidAccountsForSending() từ memory
```

## Error Handling

Mỗi worker xử lý lỗi độc lập:

```javascript
try {
    await this._processSingleOrder(order, context);
    this.sendingState.success++;
} catch (err) {
    this.sendingState.error++;
    this.sendingState.errors.push({
        order: order.code,
        error: err.message,
        account: account.name  // Biết account nào gặp lỗi
    });
}
```

Lỗi của 1 account không ảnh hưởng các account khác.

## Campaign History (Lịch sử gửi tin)

### Tính năng

Sau mỗi lần gửi tin nhắn, hệ thống tự động lưu lịch sử vào Firestore để:
- Xem lại kết quả gửi (thành công/thất bại)
- Biết rõ STT, mã đơn, tên khách hàng của từng đơn
- Gửi lại các đơn thất bại

### UI

```
┌─────────────────────────────────────────────────────────────┐
│  [Lịch sử]  [Hủy]  [Gửi tin nhắn]                          │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│            Lịch sử gửi tin nhắn                              │
├─────────────────────────────────────────────────────────────┤
│  Template: Chốt đơn                                          │
│  Ngày: 27/01/2026, 10:30:00                                 │
│  ┌────────────────┐  ┌────────────────┐                     │
│  │ ✅ 95 thành công│  │ ❌ 5 thất bại  │                     │
│  └────────────────┘  └────────────────┘                     │
│                                                              │
│  ▶ Xem 5 đơn thất bại (click để mở)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ STT  │ Mã đơn    │ Khách hàng  │ Lỗi                 │  │
│  │ 1074 │ SO-12345  │ Nguyễn A    │ Đã quá 24h          │  │
│  │ 1075 │ SO-12346  │ Trần B      │ Người dùng không... │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ▶ Xem 95 đơn thành công (click để mở)                     │
└─────────────────────────────────────────────────────────────┘
```

### Firestore Structure

```
Collection: message_campaigns
└── Document (auto-generated ID)
    {
        // Thông tin cơ bản
        templateName: "Chốt đơn",
        templateId: 123,
        totalOrders: 100,
        successCount: 95,
        errorCount: 5,

        // Chi tiết đơn thành công
        successOrders: [
            {
                stt: "1074",
                code: "SO-12345",
                customerName: "Nguyễn Văn A",
                account: "Huyền Nhi"
            },
            ...
        ],

        // Chi tiết đơn thất bại
        errorOrders: [
            {
                stt: "1075",
                code: "SO-12346",
                customerName: "Trần Văn B",
                account: "Thu Huyền",
                error: "Đã quá 24h - Vui lòng dùng COMMENT",
                is24HourError: true
            },
            ...
        ],

        // Metadata
        accountsUsed: ["Huyền Nhi", "Thu Huyền", "Thu Lai"],
        delay: 1,
        createdAt: Timestamp,
        localCreatedAt: "2026-01-27T10:30:00.000Z",

        // TTL - Auto delete after 7 days
        expireAt: Date (7 ngày sau createdAt)
    }
```

### TTL Auto-Delete (Tự động xóa sau 7 ngày)

```javascript
// Khi lưu campaign
const now = new Date();
const expireAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

const campaign = {
    ...campaignData,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    expireAt: expireAt  // TTL field
};

// Khi mở history modal, tự động cleanup
async cleanupOldCampaigns() {
    const now = new Date();
    const snapshot = await campaignsRef
        .where('expireAt', '<', now)
        .limit(100)
        .get();

    // Batch delete expired campaigns
    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
}
```

### Flow lưu lịch sử

```
1. Gửi tin nhắn hoàn tất
   ↓
2. Thu thập kết quả:
   - successOrders: [{stt, code, customerName, account}, ...]
   - errorOrders: [{stt, code, customerName, account, error}, ...]
   ↓
3. Lưu vào Firestore với expireAt = now + 7 days
   ↓
4. User click "Lịch sử"
   ↓
5. Cleanup campaigns đã hết hạn (expireAt < now)
   ↓
6. Load và hiển thị campaigns còn hạn
```

### Tracking chi tiết trong Worker

```javascript
// Khi gửi thành công
this.sendingState.successOrders.push({
    stt: order.stt || order.STT || '',
    code: order.code || order.Id || '',
    customerName: order.customerName || '',
    account: account.name
});

// Khi gửi thất bại
this.sendingState.errorOrders.push({
    stt: order.stt || order.STT || '',
    code: order.code || order.Id || '',
    customerName: order.customerName || '',
    account: account.name,
    error: errorMessage,
    is24HourError: err.is24HourError || false,
    isUserUnavailable: err.isUserUnavailable || false
});
```

## Gửi lại qua Comment (Failed Orders)

### Tại sao cần tính năng này?

Một số đơn không gửi được tin nhắn Messenger vì:
- Đã quá 24h kể từ lần tương tác cuối
- Khách hàng chưa có cuộc hội thoại Messenger với page
- Facebook chặn gửi tin nhắn

**Giải pháp:** Gửi qua bình luận công khai (reply_comment) trên bài post mà khách đã comment.

### UI trong Lịch sử

```
┌─────────────────────────────────────────────────────────────┐
│  ❌ 5 đơn thất bại                                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [Gửi tất cả qua Comment]                               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ STT │ Mã đơn   │ Khách hàng │ Lỗi        │ Action    │   │
│  │ 74  │ 260108032│ Nguyễn Trâm│ Đã quá 24h │ [Comment] │   │
│  │ 75  │ 260108033│ Trần B     │ Không có...│ [Comment] │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Flow gửi qua Comment

```
1. User click "Gửi qua Comment" (single) hoặc "Gửi tất cả qua Comment"
   ↓
2. Lấy thông tin đơn từ TPOS API:
   - Facebook_PostId (pageId_postId)
   - Facebook_ASUserId (customer fb_id)
   ↓
3. Fetch comments từ Pancake API:
   - Tìm conversation theo post_id và fb_id
   - Lấy danh sách comments
   - Tìm comment MỚI NHẤT của khách hàng
   ↓
4. Gửi reply_comment:
   - URL: /pages/{pageId}/conversations/{commentId}/messages
   - Payload: { action: "reply_comment", message_id: commentId, message: text }
   ↓
5. Cập nhật UI:
   - Thành công: Row chuyển màu xanh ✓
   - Thất bại: Row chuyển màu đỏ ✗
```

### Pancake Comment API

```javascript
// URL format
POST /pages/{pageId}/conversations/{conversationId}/messages?page_access_token=xxx

// Payload
{
    "action": "reply_comment",
    "message_id": "pancake_comment_id",  // ID từ fetchComments, KHÔNG phải TPOS
    "message": "Nội dung reply..."
}
```

**QUAN TRỌNG:**
- `conversationId` và `message_id` phải là **Pancake internal ID** (từ API fetchComments)
- KHÔNG dùng TPOS `Facebook_CommentId` (format `postId_commentId` không tương thích)

### Code implementation

```javascript
// message-template-manager.js

async _sendOrderViaCommentReply(errorOrder, templateContent) {
    // 1. Fetch order data from TPOS
    const fullOrderData = await this.fetchFullOrderData(orderId);

    // 2. Get page_access_token
    const pageAccessToken = await window.pancakeTokenManager
        ?.getOrGeneratePageAccessToken(channelId);

    // 3. Fetch comments from Pancake (MUST use Pancake IDs)
    const commentsResult = await window.pancakeDataManager
        ?.fetchComments(channelId, psid, null, postId);

    // 4. Find latest customer comment
    const customerComments = commentsResult.comments.filter(c => !c.IsOwner);
    const latestComment = customerComments[customerComments.length - 1];
    const latestCommentId = latestComment.Id; // Pancake internal ID

    // 5. Send reply_comment
    const payload = {
        action: 'reply_comment',
        message_id: latestCommentId,
        message: messageContent
    };
}
```

## Watermark Badge (Đánh dấu đơn thất bại)

### Tính năng

Sau khi gửi tin nhắn, các đơn thất bại sẽ được **đánh dấu** trên cột "Bình luận" ở bảng đơn hàng, giúp người dùng dễ dàng nhận biết và gửi lại.

### UI

```
┌─────────────────────────────────────────────────────────────┐
│ STT │ Mã đơn   │ Khách hàng │ ... │ Bình luận              │
├─────┼──────────┼────────────┼─────┼────────────────────────┤
│ 74  │ 260108032│ Nguyễn Trâm│ ... │ ⚠️ Cần gửi lại         │  ← Badge đỏ
│ 75  │ 260108033│ Trần B     │ ... │ ⚠️ Cần gửi lại         │  ← Badge đỏ
│ 76  │ 260108034│ Lê C       │ ... │ −                      │  ← Bình thường
└─────────────────────────────────────────────────────────────┘
```

### Storage

```javascript
// localStorage key: failed_message_orders
[
    { orderId: "d4430000-...", timestamp: 1706356800000 },
    { orderId: "d4430000-...", timestamp: 1706356800000 }
]

// TTL: 24 giờ - tự động xóa entries cũ khi load
```

### Flow

```
1. Gửi tin nhắn hàng loạt
   ↓
2. Một số đơn thất bại
   ↓
3. Lưu danh sách orderId thất bại vào localStorage
   ↓
4. Dispatch event 'failedOrdersUpdated'
   ↓
5. Bảng đơn hàng hiển thị badge "⚠️ Cần gửi lại"
   ↓
6. User click → Mở modal bình luận → Gửi qua comment
   ↓
7. Gửi thành công → Xóa orderId khỏi danh sách
   ↓
8. Badge tự động biến mất (không cần refresh)
```

### Code implementation

```javascript
// message-template-manager.js

// Track failed orders
this.failedOrderIds = new Set();

addFailedOrders(orderIds) {
    orderIds.forEach(id => this.failedOrderIds.add(id));
    this._saveFailedOrderIds();
    window.dispatchEvent(new CustomEvent('failedOrdersUpdated', {
        detail: { failedOrderIds: Array.from(this.failedOrderIds) }
    }));
}

removeFailedOrder(orderId) {
    this.failedOrderIds.delete(orderId);
    this._saveFailedOrderIds();
    window.dispatchEvent(new CustomEvent('failedOrdersUpdated', ...));
}

isOrderFailed(orderId) {
    return this.failedOrderIds.has(orderId);
}
```

```javascript
// tab1-table.js

function renderCommentsColumn(order) {
    const isFailed = window.messageTemplateManager?.isOrderFailed(order.Id);

    if (isFailed) {
        return `<td style="...">
            <span style="background: #fef2f2; color: #dc2626;">
                ⚠️ Cần gửi lại
            </span>
        </td>`;
    }
    return `<td>−</td>`;
}

// Listen for updates
window.addEventListener('failedOrdersUpdated', (event) => {
    // Update badges in table without re-rendering
});
```

## Page Access Token Pre-loading

### Vấn đề

Khi gửi tin nhắn multi-account, mỗi worker cần `page_access_token` cho page đích. Nếu không pre-load, có thể xảy ra:
- Race condition khi nhiều workers cùng generate token
- Token lookup failure do chưa load từ Firestore

### Giải pháp

Pre-load tất cả page tokens từ Firestore **TRƯỚC** khi bắt đầu gửi:

```javascript
// Trước khi gửi
this.log('🔑 Pre-loading page access tokens...');
await window.pancakeTokenManager.loadPageAccessTokens();

// Trong worker, dùng token đã cache
let pageAccessToken = window.pancakeTokenManager.getPageAccessToken(channelId);

// Nếu chưa có, generate với worker's account token (thread-safe)
if (!pageAccessToken) {
    pageAccessToken = await window.pancakeTokenManager
        .generatePageAccessTokenWithToken(channelId, accountToken);
}
```

### Thread-safe Token Generation

```javascript
// KHÔNG DÙNG: this.currentToken có thể bị swap bởi worker khác
async generatePageAccessToken(pageId) {
    // Uses this.currentToken - NOT thread-safe!
}

// DÙNG: Truyền explicit token
async generatePageAccessTokenWithToken(pageId, accountToken) {
    // Uses provided token - Thread-safe for parallel workers
}
```

## Page Access Validation & Account Fallback

### Vấn đề
Mỗi account Pancake chỉ có quyền trên một số pages nhất định. Nếu account không có quyền trên page đích → lỗi gửi tin nhắn.

### Giải pháp: `accountPageAccessMap` cache

```javascript
// pancake-token-manager.js
this.accountPageAccessMap = {}; // { accountId: Set<pageId> }
```

#### Các methods chính

| Method | Mô tả |
|--------|-------|
| `fetchAndCacheAccountPages(accountId, token)` | Fetch pages cho 1 account, cache vào `accountPageAccessMap` |
| `prefetchAllAccountPages()` | Fetch pages cho tất cả accounts song song (`Promise.all`) |
| `accountHasPageAccess(accountId, pageId)` | Check nhanh từ cache |
| `getAccountsWithPageAccess(pageId)` | Lấy tất cả accounts có quyền trên page |
| `findAccountWithPageAccess(pageId, excludeId)` | Tìm 1 account fallback (bỏ qua account đã fail) |

### Áp dụng

#### 1. Gửi hàng loạt (Bulk Sending)
- Pre-fetch page access **TRƯỚC** khi phân phối đơn
- Đơn chỉ được assign cho account có quyền trên page đích
- Round-robin **TRONG** nhóm accounts có quyền (cân bằng tải)

#### 2. Gửi tin nhắn đơn lẻ (Single Message/Comment)
```javascript
// tab1-chat.js - sendMessageInternal() & sendCommentInternal()
let pageAccessToken = pancakeTokenManager.getPageAccessToken(channelId);
if (!pageAccessToken) {
    // Thử active account
    pageAccessToken = await generatePageAccessTokenWithToken(channelId, activeToken);
    if (!pageAccessToken) {
        // Fallback: tìm account khác có quyền
        const fallback = pancakeTokenManager.findAccountWithPageAccess(channelId, activeAccountId);
        if (fallback) {
            pageAccessToken = await generatePageAccessTokenWithToken(channelId, fallback.token);
        }
    }
}
```

### Hiển thị trong UI (Quản lý Pancake Accounts modal)
Mỗi account card hiển thị số pages và tên pages dạng badge tím:
```
✅ Con Nhoc
UID: 99d3d4e1-...
📄 3 pages: [NhiJudy Store] [Nhi Judy Ơi] [Nhi Judy House]
```

## Tóm tắt

| Feature | Mô tả |
|---------|-------|
| **Phân phối** | Page-access-aware, chỉ assign đơn cho account có quyền page |
| **Fallback** | Tự động dùng account khác nếu account chính không có quyền |
| **Song song** | Tất cả accounts chạy cùng lúc |
| **Delay** | Mỗi account có delay riêng giữa các đơn |
| **Trùng lặp** | 0% - Mỗi đơn chỉ 1 account xử lý |
| **Tốc độ** | Nhanh hơn N lần (N = số accounts) |
| **Error isolation** | Lỗi 1 account không ảnh hưởng accounts khác |
| **Lịch sử** | Lưu Firestore, tự động xóa sau 7 ngày |
| **Chi tiết** | Tracking STT, mã đơn, khách hàng, account, lỗi |
| **Gửi lại Comment** | Đơn thất bại có thể gửi qua reply_comment |
| **Watermark Badge** | Đánh dấu đơn thất bại trên bảng, tự động clear |
| **Token Pre-load** | Pre-load page tokens, thread-safe generation |
| **Page Access Cache** | Cache pages/account, prefetch song song, check nhanh in-memory |
