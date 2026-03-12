# Pancake Chat & Comment API - Chi tiet cac ham va duong dan

> **Muc dich**: Tai lieu nay mo ta chi tiet tat ca cac ham, class, API endpoint lien quan den **Pancake** (chat, binh luan, quan ly account, gui tin nhan) trong du an `n2store/orders-report`. Dung de tai su dung cac chuc nang nay o web khac.

---

## Muc luc

1. [Kien truc tong quan](#1-kien-truc-tong-quan)
2. [PancakeTokenManager - Quan ly JWT Token](#2-pancaketokenmanager---quan-ly-jwt-token)
3. [PancakeDataManager - Quan ly du lieu Pancake API](#3-pancakedatamanager---quan-ly-du-lieu-pancake-api)
4. [Tab1 Pancake Settings - UI Quan ly Account](#4-tab1-pancake-settings---ui-quan-ly-account)
5. [Tab1 Chat - Chat Modal chinh](#5-tab1-chat---chat-modal-chinh)
6. [Tab1 Chat Products - San pham trong chat](#6-tab1-chat-products---san-pham-trong-chat)
7. [Chat Modules nho](#7-chat-modules-nho)
8. [Backend - Render.com Route](#8-backend---rendercom-route)
9. [Backend - Cloudflare Worker Handler](#9-backend---cloudflare-worker-handler)
10. [API Endpoints tong hop](#10-api-endpoints-tong-hop)
11. [Cac file can copy khi tai su dung](#11-cac-file-can-copy-khi-tai-su-dung)

---

## 1. Kien truc tong quan

```
Browser (Client)
    |
    |-- PancakeTokenManager (JWT token, multi-account)
    |-- PancakeDataManager (conversations, messages, pages)
    |-- Tab1 Chat (UI modal, gui/nhan tin nhan)
    |-- Chat Modules (comment, quick-reply, templates, notifier)
    |
    v
Cloudflare Worker (CORS Proxy)
    |-- /api/pancake/*          --> pancake.vn/api/v1/*  (Generic)
    |-- /api/pancake-direct/*   --> pancake.vn/api/v1/*  (JWT cookie bypass)
    |-- /api/pancake-official/* --> pages.fm/api/public_api/v1/*  (Official API)
    |
    v
Render.com (Fallback Proxy)
    |-- /api/pancake/*          --> pancake.vn/api/v1/*
    |
    v
Pancake API (pancake.vn + pages.fm)
```

### Luu tru Token

```
Priority: Memory -> localStorage -> Firestore -> Cookie

Firestore collection: pancake_tokens/
    - accounts     (doc): { data: { [accountId]: { token, exp, uid, name, savedAt } } }
    - page_access_tokens (doc): { data: { [pageId]: { token, pageId, pageName, savedAt } } }
```

---

## 2. PancakeTokenManager - Quan ly JWT Token

**File**: `orders-report/js/managers/pancake-token-manager.js`
**Shared version**: `shared/browser/pancake-token-manager.js`
**Global instance**: `window.pancakeTokenManager`

### Class: PancakeTokenManager

#### Constructor Properties

| Property | Type | Mo ta |
|---|---|---|
| `currentToken` | string\|null | JWT token dang dung |
| `currentTokenExpiry` | number\|null | Expiry timestamp (seconds) |
| `activeAccountId` | string\|null | Account ID dang active |
| `accounts` | Object | Tat ca accounts: `{ accountId: { token, exp, uid, name, savedAt } }` |
| `pageAccessTokens` | Object | Page tokens: `{ pageId: { token, pageId, pageName, savedAt } }` |

#### localStorage Keys

| Key | Mo ta |
|---|---|
| `pancake_jwt_token` | JWT token hien tai |
| `pancake_jwt_token_expiry` | Token expiry |
| `tpos_pancake_active_account_id` | Active account ID |
| `pancake_page_access_tokens` | Page access tokens (JSON) |
| `pancake_all_accounts` | Tat ca accounts (cho multi-account sending) |

#### Cac phuong thuc

##### Khoi tao & Load

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `initialize()` | - | `Promise<boolean>` | Load tu localStorage -> Firestore -> Migrate tu RealtimeDB |
| `loadFromLocalStorage()` | - | `Promise<void>` | Load JWT + page tokens tu localStorage/IndexedDB |
| `loadAccounts()` | - | `Promise<boolean>` | Load accounts tu Firestore `pancake_tokens/accounts` |
| `loadPageAccessTokens()` | - | `Promise<void>` | Load page tokens tu Firestore, smart merge voi localStorage |
| `migrateFromRealtimeDB()` | - | `Promise<boolean>` | Migrate data tu Realtime Database sang Firestore (1 lan) |

##### Token CRUD

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `getToken()` | - | `Promise<string\|null>` | Lay token theo priority: memory -> localStorage -> Firestore -> cookie |
| `setTokenManual(token)` | `token: string` | `Promise<string>` | Set token thu cong tu UI, clean + validate + save |
| `saveTokenToFirestore(token, accountId?)` | `token: string, accountId?: string` | `Promise<string>` | Luu token vao Firestore, return accountId |
| `getTokenFromFirestore()` | - | `Promise<string\|null>` | Lay token tu active account trong Firestore |
| `getTokenFromCookie()` | - | `string\|null` | Lay token tu cookie `jwt=` |
| `clearToken()` | - | `Promise<boolean>` | Xoa tat ca tokens (Firestore + localStorage + memory) |

##### Account Management

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `getAllAccounts()` | - | `Object` | Tra ve tat ca accounts |
| `setActiveAccount(accountId)` | `accountId: string` | `Promise<boolean>` | Chuyen sang account khac |
| `deleteAccount(accountId)` | `accountId: string` | `Promise<boolean>` | Xoa 1 account |
| `getTokenInfo()` | - | `Object\|null` | Thong tin active account (name, uid, exp, isExpired) |
| `getAccountInfo(accountId)` | `accountId: string` | `Object\|null` | Thong tin 1 account cu the |
| `getValidAccountsForSending()` | - | `Array` | Cac account chua het han (dung cho multi-account sending) |

##### Page Access Token

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `savePageAccessToken(pageId, token, pageName?)` | `pageId, token, pageName?` | `Promise<boolean>` | Luu page_access_token |
| `getPageAccessToken(pageId)` | `pageId: string` | `string\|null` | Lay page_access_token tu cache |
| `generatePageAccessToken(pageId)` | `pageId: string` | `Promise<string\|null>` | Tao token moi qua API |
| `generatePageAccessTokenWithToken(pageId, accountToken)` | `pageId, accountToken` | `Promise<string\|null>` | Tao token bang account cu the |
| `getOrGeneratePageAccessToken(pageId)` | `pageId: string` | `Promise<string\|null>` | Lay tu cache, KHONG tu generate |
| `getAllPageAccessTokens()` | - | `Array` | Danh sach tat ca page tokens |

##### Utilities

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `decodeToken(token)` | `token: string` | `Object\|null` | Decode JWT payload (exp, uid, name) |
| `isTokenExpired(exp)` | `exp: number` | `boolean` | Check het han (1h buffer) |
| `base64UrlDecode(str)` | `str: string` | `string` | Decode base64url (JWT format) |
| `debugToken(token)` | `token: string` | `Object` | Phan tich token chi tiet (debug) |

##### localStorage Helpers

| Method | Params | Mo ta |
|---|---|---|
| `saveTokenToLocalStorage(token, expiry)` | `token, expiry` | Luu JWT vao localStorage |
| `getTokenFromLocalStorage()` | - | Lay JWT tu localStorage |
| `clearTokenFromLocalStorage()` | - | Xoa JWT khoi localStorage |
| `saveAllAccountsToLocalStorage()` | - | Luu tat ca accounts |
| `getAllAccountsFromLocalStorage()` | - | Load tat ca accounts |
| `savePageAccessTokensToStorage(tokens?)` | `tokens?` | Luu page tokens vao IndexedDB/localStorage |
| `getPageAccessTokensFromStorage()` | - | Load page tokens tu IndexedDB/localStorage |

---

## 3. PancakeDataManager - Quan ly du lieu Pancake API

**File**: `orders-report/js/managers/pancake-data-manager.js`
**Global instance**: `window.pancakeDataManager`

### Class: PancakeRequestQueue

Rate limiter queue (max 1 dong thoi, 1500ms giua cac request).

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `add(fn, dedupeKey?)` | `fn: Function, dedupeKey?: string` | `Promise` | Them request vao queue, ho tro dedupe |
| `process()` | - | `void` | Xu ly queue tuan tu |
| `getStatus()` | - | `Object` | `{ queueLength, running, pendingRequests }` |

### Class: PancakeDataManager

#### Cache Constants

| Constant | Gia tri | Mo ta |
|---|---|---|
| `CACHE_DURATION` | 5 phut | TTL cho conversations/pages (memory) |
| `UNREAD_CACHE_DURATION` | 2 phut | TTL cho unread counts |
| `LOCALSTORAGE_CACHE_DURATION` | 30 phut | TTL cho pages (localStorage) |
| `MIN_REQUEST_INTERVAL` | 1000ms | Deprecated, thay boi queue |

#### Khoi tao & Token

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `initialize()` | - | `Promise<boolean>` | Singleton: getToken -> fetchPages -> fetchConversations |
| `getToken()` | - | `Promise<string\|null>` | Lay JWT tu PancakeTokenManager |
| `getHeaders(token)` | `token: string` | `Object` | Build headers voi referer + browser UA |
| `getPageToken(pageId)` | `pageId: string` | `Promise<string\|null>` | Lay page_access_token tu cache |

#### Pages API

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `fetchPages(forceRefresh?)` | `forceRefresh?: boolean` | `Promise<Array>` | Lay danh sach pages tu `/api/v1/pages` |
| `extractAndCachePageAccessTokens(pages)` | `pages: Array` | `void` | Trich xuat page_access_token tu response |
| `fetchPagesWithUnreadCount(forceRefresh?)` | `forceRefresh?: boolean` | `Promise<Array>` | Lay so tin chua doc moi page |

**API**: `GET /api/v1/pages` -> tra ve `{ success, categorized: { activated }, activated_page_ids }`
**API**: `GET /api/v1/pages/unread_conv_pages_count` -> `[{ page_id, unread_conv_count, page_name }]`

#### Conversations

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `fetchConversations(forceRefresh?)` | `forceRefresh?: boolean` | `Promise<Array>` | Lay tat ca conversations, build map |
| `searchConversations(query, pageIds?)` | `query, pageIds?` | `Promise<{conversations, customerId}>` | Tim conversation theo ten/SDT |
| `fetchConversationsByCustomerFbId(pageId, fbId)` | `pageId, fbId` | `Promise<{conversations, customerUuid, success}>` | Tim conversations theo FB ID khach |
| `searchConversationsByCommentIds(name, commentIds, fbId, pageIds?)` | `name, commentIds, fbId, pageIds?` | `Promise<{customerUuid, threadId, threadKey}>` | Tim conversation tu comment IDs |
| `buildConversationMap()` | - | `void` | Rebuild 5 Maps (INBOX/COMMENT x PSID/FBID + customerFbId) |

**API**: `GET /api/v1/conversations?pages[{pageId}]=0&unread_first=true&cursor_mode=true`
**API**: `POST /api/v1/conversations/search` (FormData: q, page_ids)
**API**: `GET /api/v1/conversations/customer/{fb_id}?pages[{pageId}]=0`

#### Conversation Lookup

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `getConversationByUserId(userId)` | `userId: string` | `Object\|null` | Tra cuu theo PSID -> FBID (INBOX truoc, COMMENT sau) |
| `getUnreadInfoForOrder(order)` | `order: Object` | `{hasUnread, unreadCount}` | Kiem tra chua doc |
| `getMessageUnreadInfoForOrder(order)` | `order: Object` | `{hasUnread, unreadCount}` | Chi INBOX |
| `getCommentUnreadInfoForOrder(order)` | `order: Object` | `{hasUnread, unreadCount}` | Chi COMMENT |
| `getLastMessageForOrder(order)` | `order: Object` | `Object` | Lay tin nhan cuoi cung (INBOX) |
| `getLastCommentForOrder(order)` | `order: Object` | `Object` | Lay binh luan cuoi cung (COMMENT) |
| `getChatInfoForOrder(order)` | `order: Object` | `{channelId, psid, hasChat}` | Lay thong tin chat tu order |

#### Messages & Comments

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `fetchMessagesForConversation(pageId, conversationId, currentCount?, customerId?, preloadedPageAccessToken?)` | ... | `Promise<{messages, conversation, customers, customerId}>` | Lay tin nhan tu Official API |
| `fetchInboxPreview(pageId, customerId)` | `pageId, customerId` | `Promise<Object>` | Lay preview inbox (conv IDs, thread IDs) |
| `fetchMessages(pageId, psid, cursorOrCount?, customerId?)` | ... | `Promise<{messages, conversation, conversationId, customerId}>` | Wrapper lay tin nhan |
| `fetchComments(pageId, psid, conversationId?, postId?, customerName?)` | ... | `Promise<{comments, messages, conversation, customers, customerId, after}>` | Lay binh luan, map sang comment format |
| `findLastCustomerMessage(messages, pageId)` | `messages, pageId` | `Object\|null` | Tim tin nhan cuoi tu khach |
| `check24HourWindow(pageId, conversationId, customerId?)` | ... | `Promise<{canSend, hoursSinceLastMessage, reason}>` | Kiem tra chinh sach 24h cua Facebook |

**API (Official)**: `GET /pages/{pageId}/conversations/{conversationId}/messages?current_count=...&customer_id=...`
**API (Internal)**: `GET /api/v1/pages/{pageId}/customers/{customerId}/inbox_preview`

#### Read/Unread

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `markConversationAsRead(pageId, conversationId)` | `pageId, conversationId` | `Promise<boolean>` | Danh dau da doc |
| `markConversationAsUnread(pageId, conversationId)` | `pageId, conversationId` | `Promise<boolean>` | Danh dau chua doc |
| `updateConversationReadStatus(conversationId, isRead)` | `conversationId, isRead` | `boolean` | Cap nhat cache local |

**API (Official)**: `POST /pages/{pageId}/conversations/{conversationId}/read`
**API (Official)**: `POST /pages/{pageId}/conversations/{conversationId}/unread`

#### Image Upload

| Method | Params | Return | Mo ta |
|---|---|---|---|
| `uploadImage(pageId, file, allowFallback?)` | `pageId, file, allowFallback?` | `Promise<Object>` | Upload anh len Pancake (limit 500KB) |
| `uploadToImgbb(file)` | `file: File` | `Promise<{url, delete_url}>` | Fallback upload len imgbb |
| `deleteImage(pageId, contentId)` | `pageId, contentId` | `Promise<boolean>` | Xoa anh |
| `calculateSHA1(file)` | `file: File` | `Promise<string>` | Tinh hash SHA1 de dedupe |

**API (Internal)**: `POST /api/v1/pages/{pageId}/contents` (FormData)
**API (Internal)**: `DELETE /api/v1/pages/{pageId}/contents?ids={contentId}`
**API (Worker)**: `POST /api/imgbb-upload` (base64)

#### Cache

| Method | Params | Mo ta |
|---|---|---|
| `saveConversationsToSessionStorage()` | - | Luu conversations vao sessionStorage |
| `loadConversationsFromSessionStorage()` | - | Load conversations tu sessionStorage |
| `savePagesToLocalStorage()` | - | Luu pages vao localStorage |
| `loadPagesFromLocalStorage()` | - | Load pages tu localStorage |

---

## 4. Tab1 Pancake Settings - UI Quan ly Account

**File**: `orders-report/js/tab1/tab1-pancake-settings.js`

### Modal Pancake Settings

| Function | Params | Mo ta |
|---|---|---|
| `openPancakeSettingsModal()` | - | Mo modal quan ly accounts |
| `closePancakeSettingsModal()` | - | Dong modal |
| `showAddAccountForm()` | - | Hien form them account |
| `hideAddAccountForm()` | - | An form them account |

### Account CRUD

| Function | Params | Mo ta |
|---|---|---|
| `addAccountManual()` | - | Them account tu JWT token nhap thu cong |
| `addAccountFromCookie()` | - | Them account tu cookie pancake.vn |
| `selectAccount(accountId)` | `accountId: string` | Chuyen sang account khac |
| `deleteAccount(accountId)` | `accountId: string` | Xoa 1 account (admin only) |
| `clearAllPancakeAccounts()` | - | Xoa tat ca accounts (admin only) |
| `refreshAccountsList()` | - | Render lai danh sach accounts |

### Token Validation

| Function | Params | Mo ta |
|---|---|---|
| `validateTokenInput()` | - | Validate token real-time khi nhap |
| `debugTokenInput()` | - | Debug chi tiet token (xem console) |
| `isUserAdmin()` | - | Check quyen admin |
| `checkAdminPermission(action)` | `action: string` | Check admin truoc khi thao tac |

### Page Access Token Management

| Function | Params | Mo ta |
|---|---|---|
| `showAddPageTokenForm()` | - | Hien form them page token |
| `hideAddPageTokenForm()` | - | An form |
| `loadPagesToSelector()` | - | Load danh sach pages vao dropdown |
| `generatePageTokenFromAPI()` | - | Generate token tu API (admin only) |
| `addPageAccessTokenManual()` | - | Them page token thu cong |
| `refreshPageTokensList()` | - | Render lai danh sach page tokens |
| `deletePageAccessToken(pageId)` | `pageId: string` | Xoa page token |

### Chat API Source Toggle

| Function | Params | Mo ta |
|---|---|---|
| `toggleChatAPISource()` | - | Chuyen giua Pancake API va ChatOmni API |
| `updateChatAPISourceLabel()` | - | Cap nhat label hien thi |

### Realtime Mode

| Function | Params | Mo ta |
|---|---|---|
| `toggleRealtimeMode(enabled)` | `enabled: boolean` | Bat/tat realtime |
| `changeRealtimeMode(mode)` | `mode: 'browser'\|'server'` | Chuyen che do realtime |
| `updateRealtimeCheckbox()` | - | Cap nhat UI checkbox |

### Tag Settings

| Function | Params | Mo ta |
|---|---|---|
| `loadAvailableTags()` | - | Lay tags tu TPOS OData API |
| `getTagSettings()` | - | Lay tag settings tu localStorage |
| `setTagSettings(settings)` | `settings: Object` | Luu tag settings |
| `openTagSettingsModal()` | - | Mo modal tag settings |
| `closeTagSettingsModal()` | - | Dong modal |
| `renderTagSettingsList(filteredTags?)` | `filteredTags?: Array` | Render danh sach tags |
| `filterTagSettings()` | - | Loc tags theo keyword |
| `saveTagSettingItem(tagId)` | `tagId: string` | Luu 1 tag setting |
| `saveTagSettings()` | - | Luu tat ca tag settings |

---

## 5. Tab1 Chat - Chat Modal chinh

**File**: `orders-report/js/tab1/tab1-chat.js`

### State quan trong (window globals)

| Variable | Type | Mo ta |
|---|---|---|
| `currentChatOrderId` | string | Order ID dang mo chat |
| `currentChatOrderData` | Object | Order data dang mo |
| `currentChatType` | 'INBOX'\|'COMMENT' | Loai conversation |
| `currentConversationId` | string | Conversation ID hien tai |
| `currentInboxConversationId` | string | INBOX conversation ID |
| `currentCommentConversationId` | string | COMMENT conversation ID |
| `currentConversationReadState` | boolean | Trang thai da doc |
| `chatMessageQueue` | Array | Queue tin nhan cho gui |
| `uploadedImagesData` | Array | Anh da upload cho gui |
| `allChatMessages` | Array | Tat ca tin nhan |
| `allChatComments` | Array | Tat ca binh luan |

### Mo/Dong Chat Modal

| Function | Params | Mo ta |
|---|---|---|
| `openChatModal(orderId, channelId, psid, type)` | `orderId, channelId, psid, type` | Mo chat modal: load order, fetch conversations, render messages |
| `closeChatModal()` | - | Dong modal, cleanup listeners, reset state |

### Chuyen doi INBOX / COMMENT

| Function | Params | Mo ta |
|---|---|---|
| `switchConversationType(type)` | `type: 'INBOX'\|'COMMENT'` | Chuyen giua tin nhan va binh luan |
| `updateConversationTypeToggle(type)` | `type` | Cap nhat UI buttons |

### Page & Conversation Selectors

| Function | Params | Mo ta |
|---|---|---|
| `populateChatPageSelector(currentPageId)` | `currentPageId` | Load dropdown chon page xem |
| `onChatPageChanged(pageId)` | `pageId` | Khi doi page xem |
| `reloadChatForSelectedPage(pageId)` | `pageId` | Tai lai chat cho page moi |
| `populateSendPageSelector(currentPageId)` | `currentPageId` | Load dropdown chon page gui |
| `onSendPageChanged(pageId)` | `pageId` | Khi doi page gui |
| `populateConversationSelector(conversations, selectedConvId)` | `conversations, selectedConvId` | Load dropdown chon conversation |
| `onChatConversationChanged(conversationId)` | `conversationId` | Khi doi conversation |
| `reloadChatForSelectedConversation(conversation)` | `conversation` | Tai lai tin nhan |

### Doc/Chua doc

| Function | Params | Mo ta |
|---|---|---|
| `updateReadBadge(isRead)` | `isRead: boolean` | Cap nhat badge doc/chua doc |
| `updateMarkButton(isRead)` | `isRead: boolean` | Cap nhat nut toggle |
| `autoMarkAsRead(delayMs?)` | `delayMs?: number` | Tu dong danh dau da doc |
| `toggleConversationReadState()` | - | Toggle doc/chua doc |

### Reply

| Function | Params | Mo ta |
|---|---|---|
| `setMessageReplyType(type)` | `type: 'reply_inbox'\|'private_replies'` | Chon kieu reply (inbox/private) |
| `setReplyMessageById(messageId)` | `messageId` | Reply tin nhan cu the theo ID |
| `setReplyMessage(message)` | `message: Object` | Set reply target, hien preview |
| `cancelReplyMessage()` | - | Huy reply tin nhan |
| `cancelReplyComment()` | - | Huy reply binh luan |

### Gui tin nhan

| Function | Params | Mo ta |
|---|---|---|
| `sendMessage()` | - | Gui tin nhan (queue, split 2000 chars, attach images) |
| `sendComment()` | - | Gui binh luan |
| `sendReplyComment()` | - | Wrapper: route den sendMessage hoac sendComment |
| `sendMessageInternal(messageData)` | `messageData` | Core gui tin nhan qua Pancake Official API |
| `sendCommentInternal(messageData)` | `messageData` | Core gui binh luan qua Pancake API |
| `processChatMessageQueue()` | - | Xu ly queue tin nhan tuan tu |
| `splitMessageIntoParts(message, maxLength?)` | `message, maxLength?` | Chia tin nhan dai (limit 2000 chars) |

### 24h Policy Fallback

| Function | Params | Mo ta |
|---|---|---|
| `sendMessageViaFacebookTag(params)` | `params` | Gui tin nhan qua Facebook Graph API (bypass 24h) |
| `show24hFallbackPrompt(messageText, pageId, psid)` | `messageText, pageId, psid` | Hien prompt chon phuong an |
| `sendViaFacebookTagFromModal(encodedMessage, pageId, psid, imageUrls)` | ... | Gui tu modal fallback |
| `switchToCommentMode()` | - | Chuyen sang che do binh luan |

### Image Upload trong Chat

| Function | Params | Mo ta |
|---|---|---|
| `uploadImageWithCache(imageBlob, productId, productName, channelId, productCode)` | ... | Upload anh voi Firebase cache |
| `handleChatInputPaste(event)` | `event` | Xu ly paste anh tu clipboard |
| `handleFileInputChange(event)` | `event` | Xu ly chon file dinh kem |
| `updateMultipleImagesPreview()` | - | Cap nhat preview nhieu anh |
| `removeImageAtIndex(index)` | `index` | Xoa 1 anh |
| `clearAllImages()` | - | Xoa tat ca anh |
| `retryUploadAtIndex(index)` | `index` | Thu lai upload 1 anh |
| `sendImageToChat(imageUrl, productName, productId, productCode)` | ... | Gui anh vao chat |

### Render tin nhan

| Function | Params | Mo ta |
|---|---|---|
| `renderChatMessages(messages, scrollToBottom)` | `messages, scrollToBottom` | Render danh sach tin nhan (avatar, time, attachments, reply) |
| `renderComments(comments, scrollToBottom)` | `comments, scrollToBottom` | Render danh sach binh luan (nested replies) |
| `handleReplyToComment(commentId, postId)` | `commentId, postId` | Xu ly reply binh luan |

### Realtime & Infinite Scroll

| Function | Params | Mo ta |
|---|---|---|
| `setupRealtimeMessages()` | - | Setup polling/websocket realtime |
| `startRealtimePolling()` | - | Bat polling tin nhan moi |
| `cleanupRealtimeMessages()` | - | Cleanup realtime listeners |
| `setupChatInfiniteScroll()` | - | Setup lazy load tin nhan cu khi scroll len |
| `scrollToMessage(messageId)` | `messageId` | Scroll den tin nhan cu the |

### Utilities

| Function | Params | Mo ta |
|---|---|---|
| `handleFetchConversationsRequest(orders)` | `orders` | Fetch conversations cho nhieu orders (debounce) |
| `sendOrdersDataToTab3()` | - | Gui data don hang sang Tab 3 |
| `sendOrdersDataToOverview()` | - | Gui data don hang sang Overview |
| `openAvatarZoom(avatarUrl, senderName)` | `avatarUrl, senderName` | Zoom avatar |
| `closeAvatarZoom()` | - | Dong zoom |

---

## 6. Tab1 Chat Products - San pham trong chat

**File**: `orders-report/js/tab1/tab1-chat-products.js`

### Render san pham

| Function | Params | Mo ta |
|---|---|---|
| `renderChatProductsTable()` | - | Render bang san pham (held + main) |
| `renderProductCard(p, index, isHeld)` | `p, index, isHeld` | Render card 1 san pham |

### Tim kiem san pham

| Function | Params | Mo ta |
|---|---|---|
| `initChatProductSearch()` | - | Khoi tao search input (debounce 300ms) |
| `performChatProductSearch(query)` | `query: string` | Tim san pham |
| `displayChatSearchResults(results)` | `results: Array` | Hien ket qua tim kiem |
| `updateChatProductItemUI(productId)` | `productId` | Cap nhat UI sau khi them |
| `addChatProductFromSearch(productId)` | `productId` | Them san pham tu ket qua search (IsHeld=true) |

### Held Products (San pham giu)

| Function | Params | Mo ta |
|---|---|---|
| `confirmHeldProduct(productId)` | `productId` | Xac nhan san pham giu -> chuyen sang main (update TPOS) |
| `deleteHeldProduct(productId)` | `productId` | Xoa san pham giu (Firebase) |
| `updateHeldProductQuantityById(productId, delta, specificValue?)` | `productId, delta, specificValue?` | Cap nhat so luong san pham giu |

### Main Products

| Function | Params | Mo ta |
|---|---|---|
| `decreaseMainProductQuantityById(productId)` | `productId` | Giam so luong san pham chinh |
| `removeChatProduct(index)` | `index` | Xoa san pham khoi don hang |

### Quick Add Modal

| Function | Params | Mo ta |
|---|---|---|
| `openQuickAddProductModal()` | - | Mo modal them nhanh san pham |
| `closeQuickAddProductModal()` | - | Dong modal |
| `addQuickProduct(productId)` | `productId` | Them san pham vao danh sach chon |
| `removeQuickProduct(index)` | `index` | Xoa san pham khoi danh sach chon |
| `updateQuickProductQuantity(index, change)` | `index, change` | Cap nhat so luong |
| `clearSelectedProducts()` | - | Xoa tat ca san pham da chon |
| `saveSelectedProductsToOrders()` | - | Luu san pham da chon vao Firebase |

### Firebase Sync

| Function | Params | Mo ta |
|---|---|---|
| `saveChatProductsToFirebase(orderId, products)` | `orderId, products` | Luu san pham vao Firebase `order_products/{orderId}` |

---

## 7. Chat Modules nho

### 7.1 Comment Modal

**File**: `orders-report/js/chat/comment-modal.js`

| Function | Params | Mo ta |
|---|---|---|
| `openCommentModal(orderId, channelId, psid)` | `orderId, channelId, psid` | Mo modal binh luan (redirect sang unified chat) |
| `closeCommentModal()` | - | Dong modal |
| `renderCommentModalComments(comments, scrollToPurchase)` | `comments, scrollToPurchase` | Render binh luan |
| `handleCommentModalReply(commentId, postId)` | `commentId, postId` | Reply binh luan |
| `setCommentReplyType(type)` | `type: 'reply_comment'\|'private_replies'` | Public reply / Private message |
| `sendCommentReply()` | - | Gui reply |
| `cancelCommentReply()` | - | Huy reply |

### 7.2 Quick Reply Manager

**File**: `orders-report/js/chat/quick-reply-manager.js`
**Global**: `window.quickReplyManager`

**Class QuickReplyManager** - Quan ly tin nhan mau voi autocomplete.

| Method | Mo ta |
|---|---|
| `init()` | Khoi tao (Firebase, DOM, events) |
| `loadReplies()` | Load templates tu IndexedDB -> localStorage -> Firebase `quickReplies` collection |
| `saveReplies()` | Luu templates vao Firebase (batch write) |
| `openModal(targetInputId)` | Mo modal chon mau |
| `selectReply(replyId)` | Chon 1 mau (ho tro gui anh) |
| `setupAutocomplete()` | Setup autocomplete tren chat input (trigger bang `/`) |
| `sendQuickReplyWithImage(imageUrl, message)` | Gui anh + text tu quick reply |
| `openSettings()` | Mo modal cai dat mau |
| `addNewTemplate()` | Them template moi |
| `editTemplate(id)` | Sua template |
| `deleteTemplate(id)` | Xoa template |

### 7.3 Message Template Manager

**File**: `orders-report/js/chat/message-template-manager.js`
**Global**: `window.messageTemplateManager`

**Class MessageTemplateManager** - Quan ly mau tin nhan va gui hang loat.

| Method | Mo ta |
|---|---|
| `loadTemplates()` | Load tu Firestore `message_templates` collection |
| `openModal(orderData)` | Mo modal chon template |
| `replacePlaceholders(content, orderData)` | Thay the `{partner.name}`, `{order.details}`, v.v. |
| `getSelectedOrdersFromTable()` | Lay danh sach don hang da tick |
| `saveTemplate(templateId)` | Luu template |
| `deleteTemplate(templateId)` | Xoa template |
| `saveCampaignToFirestore(campaignData)` | Luu chien dich gui (TTL 7 ngay) |
| `openQuickCommentReply(orderId)` | Mo quick comment reply cho 1 don hang |
| `_sendOrderViaCommentReply(errorOrder, templateContent)` | Gui qua comment reply |

### 7.4 Live Comments Modal

**File**: `orders-report/js/chat/live-comments-readonly-modal.js`

| Function | Params | Mo ta |
|---|---|---|
| `openLiveCommentsModal()` | - | Mo modal xem binh luan live tu tat ca don hang cung SDT |
| `closeLiveCommentsModal()` | - | Dong modal |
| `fetchLiveCommentsByUser(pageId, postId, userId)` | ... | Lay binh luan live tu TPOS API |
| `findRelatedOrdersByPhone(currentOrder)` | `currentOrder` | Tim don hang cung SDT |
| `getCompanyIdByPageId(pageId)` | `pageId` | Map pageId -> companyId (cho TPOS API) |

**API**: `GET /api/rest/v2.0/facebookpost/{objectId}/commentsbyuser?userId={userId}`

### 7.5 New Messages Notifier

**File**: `orders-report/js/chat/new-messages-notifier.js`
**Global**: `window.newMessagesNotifier`

| Method | Mo ta |
|---|---|
| `check()` | Kiem tra tin nhan moi (pending customers) |
| `fetchPending()` | Lay danh sach khach chua tra loi tu server |
| `markReplied(psid, pageId)` | Danh dau da tra loi |
| `highlight(items)` | Hien badge "MOI" tren bang |
| `reapply()` | Ap lai highlights sau khi re-render bang |

**API**: `GET /api/realtime/pending-customers?limit=1500`
**API**: `POST /api/realtime/mark-replied`

### 7.6 Chat Products UI

**File**: `orders-report/js/chat/chat-products-ui.js`

| Function | Params | Mo ta |
|---|---|---|
| `renderChatProductsTable()` | - | Render san pham (held + main) |
| `renderProductCard(product, index, isHeld)` | ... | Render card san pham |
| `initChatProductSearch()` | - | Khoi tao tim kiem san pham |
| `performChatProductSearch(query)` | `query` | Tim kiem san pham |
| `displayChatSearchResults(results)` | `results` | Hien thi ket qua |
| `addChatProductFromSearch(productId)` | `productId` | Them san pham vao don |

### 7.7 Chat Products Actions

**File**: `orders-report/js/chat/chat-products-actions.js`

| Function | Params | Mo ta |
|---|---|---|
| `confirmHeldProduct(productId)` | `productId` | Xac nhan san pham giu -> main |
| `deleteHeldProduct(productId)` | `productId` | Xoa san pham giu |
| `updateHeldProductQuantityById(productId, delta, specificValue)` | ... | Cap nhat so luong |
| `updateChatProductNote(productId, newNote)` | `productId, newNote` | Cap nhat ghi chu |
| `decreaseMainProductQuantityById(productId)` | `productId` | Giam so luong san pham chinh |

---

## 8. Backend - Render.com Route

**File**: `render.com/routes/pancake.js`

### Route: `ALL /api/pancake/*`

Proxy toi `https://pancake.vn/api/v1/{path}`.

| Function | Params | Mo ta |
|---|---|---|
| `fetchWithTimeout(url, options, timeout)` | `url, options, timeout=15000` | Fetch voi 15s timeout |
| `router.all('/*')` | - | Proxy handler: forward headers + body, retry logic |

**Config**: Timeout 15s, rejectUnauthorized: false, forward Authorization header.

---

## 9. Backend - Cloudflare Worker Handler

**File**: `cloudflare-worker/modules/handlers/pancake-handler.js`

### 3 Handlers

| Handler | Route | Target | Mo ta |
|---|---|---|---|
| `handlePancakeDirect` | `/api/pancake-direct/*` | `pancake.vn/api/v1/*` | JWT cookie bypass, custom Referer theo page_id |
| `handlePancakeOfficial` | `/api/pancake-official/*` | `pages.fm/api/public_api/v1/*` | Official API (page_access_token) |
| `handlePancakeGeneric` | `/api/pancake/*` | `pancake.vn/api/v1/*` | Generic proxy voi standard headers |

### Page ID Mapping (Direct handler)

| Page ID | Referer URL |
|---|---|
| `117267091364524` | `https://pancake.vn/NhiJudyHouse.VietNam` |
| `270136663390370` | `https://pancake.vn/NhiJudyStore` |
| Default | `https://pancake.vn/multi_pages` |

### Config chung

- **Retry**: 3 lan, 1000ms initial delay, 15000ms timeout
- **CORS**: Su dung `proxyResponseWithCors()` tu cors-utils

---

## 10. API Endpoints tong hop

### Pancake Internal API (`pancake.vn/api/v1`)

| Method | Endpoint | Mo ta |
|---|---|---|
| GET | `/pages` | Lay danh sach pages |
| GET | `/pages/unread_conv_pages_count` | So tin chua doc moi page |
| GET | `/conversations` | Lay conversations |
| POST | `/conversations/search` | Tim conversations |
| GET | `/conversations/customer/{fb_id}` | Conversations theo FB ID |
| GET | `/pages/{pageId}/customers/{customerId}/inbox_preview` | Preview inbox |
| POST | `/pages/{pageId}/contents` | Upload anh |
| DELETE | `/pages/{pageId}/contents?ids={contentId}` | Xoa anh |

### Pancake Official API (`pages.fm/api/public_api/v1`)

| Method | Endpoint | Mo ta |
|---|---|---|
| GET | `/pages/{pageId}/conversations/{convId}/messages` | Lay tin nhan |
| POST | `/pages/{pageId}/conversations/{convId}/messages` | Gui tin nhan/binh luan |
| POST | `/pages/{pageId}/conversations/{convId}/read` | Danh dau da doc |
| POST | `/pages/{pageId}/conversations/{convId}/unread` | Danh dau chua doc |
| POST | `/pages/{pageId}/generate_page_access_token` | Tao page_access_token |

### N2Store Realtime API

| Method | Endpoint | Mo ta |
|---|---|---|
| GET | `/api/realtime/pending-customers` | Danh sach khach chua tra loi |
| POST | `/api/realtime/mark-replied` | Danh dau da tra loi |
| POST | `/api/realtime/mark-seen` | Danh dau da xem |

---

## 11. Cac file can copy khi tai su dung

### Core (BAT BUOC)

```
orders-report/js/managers/pancake-token-manager.js   # Quan ly JWT token
orders-report/js/managers/pancake-data-manager.js     # Quan ly data Pancake API
```

Hoac dung shared version:
```
shared/browser/pancake-token-manager.js               # ES module version
```

### UI Chat Modal

```
orders-report/js/tab1/tab1-chat.js                    # Chat modal chinh
orders-report/js/tab1/tab1-chat-products.js            # San pham trong chat
orders-report/js/tab1/tab1-pancake-settings.js         # UI settings/accounts
orders-report/css/tab1-chat-modal.css                  # CSS cho chat modal
```

### Chat Modules

```
orders-report/js/chat/comment-modal.js                 # Modal binh luan
orders-report/js/chat/quick-reply-manager.js           # Tin nhan mau + autocomplete
orders-report/js/chat/message-template-manager.js      # Mau tin nhan gui hang loat
orders-report/js/chat/chat-products-ui.js              # UI san pham
orders-report/js/chat/chat-products-actions.js         # Actions san pham
orders-report/js/chat/live-comments-readonly-modal.js  # Xem binh luan live
orders-report/js/chat/new-messages-notifier.js         # Thong bao tin moi
```

### Backend

```
cloudflare-worker/modules/handlers/pancake-handler.js  # CORS proxy (Cloudflare)
render.com/routes/pancake.js                           # Fallback proxy (Render)
```

### Dependencies can thiet

- **Firebase**: Firestore (luu token, templates, campaigns)
- **Cloudflare Worker**: CORS proxy (`chatomni-proxy.nhijudyshop.workers.dev`)
- **window.API_CONFIG**: Config URL builder cho proxy
- **window.notificationManager**: Hien thi thong bao
- **window.authManager**: Quan ly quyen admin
- **window.productSearchManager**: Tim kiem san pham (TPOS)
- **window.indexedDBStorage**: Cache lon (page tokens, templates)

### Thu tu load script

```html
<!-- 1. Firebase SDK -->
<script src="firebase-app.js"></script>
<script src="firebase-firestore.js"></script>

<!-- 2. Core Managers -->
<script src="js/managers/pancake-token-manager.js"></script>
<script src="js/managers/pancake-data-manager.js"></script>

<!-- 3. Chat Modules -->
<script src="js/chat/quick-reply-manager.js"></script>
<script src="js/chat/message-template-manager.js"></script>
<script src="js/chat/live-comments-readonly-modal.js"></script>
<script src="js/chat/new-messages-notifier.js"></script>
<script src="js/chat/chat-products-ui.js"></script>
<script src="js/chat/chat-products-actions.js"></script>
<script src="js/chat/comment-modal.js"></script>

<!-- 4. Tab1 Main -->
<script src="js/tab1/tab1-chat.js"></script>
<script src="js/tab1/tab1-chat-products.js"></script>
<script src="js/tab1/tab1-pancake-settings.js"></script>
```
