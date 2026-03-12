# Pancake API Documentation

> **Tài liệu API chính thức của Pancake Platform**
> 
> **Version:** 1.0.0

---

## Servers

| Server | URL | Description |
|--------|-----|-------------|
| User's API | `https://pages.fm/api/v1` | API cho user authentication |
| Page's API v1 | `https://pages.fm/api/public_api/v1` | API chính cho page operations |
| Page's API v2 | `https://pages.fm/api/public_api/v2` | API v2 cho conversations |

---

## Authentication

### 1. User Access Token

```
access_token (query parameter)
```

- **Mô tả:** Token xác thực user duy nhất
- **Lấy token:** Pancake → **Account → Personal Settings**
- **Thời hạn:** 90 ngày hoặc cho đến khi user logout

### 2. Page Access Token

```
page_access_token (query parameter)
```

- **Mô tả:** Token xác thực cho Page APIs
- **Lấy token:** Pancake → **Settings → Tools** hoặc gọi Generate page_access_token API
- **Thời hạn:** Không hết hạn trừ khi xóa hoặc renew thủ công

---

## Mục Lục

1. [Pages API](#pages-api)
2. [Conversations API](#conversations-api)
3. [Messages API](#messages-api)
4. [Statistics API](#statistics-api)
5. [Customers API](#customers-api)
6. [Export Data API](#export-data-api)
7. [Call Logs API](#call-logs-api)
8. [Tags API](#tags-api)
9. [Posts API](#posts-api)
10. [Users API](#users-api)
11. [Page Contents API](#page-contents-api)

---

## Pages API

### List Pages

Lấy danh sách các pages của user.

```http
GET https://pages.fm/api/v1/pages
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `access_token` | string | ✅ | User access token |

**Response:**
```json
{
  "pages": [
    {
      "id": "string",
      "platform": "string",
      "name": "string",
      "avatar_url": "string"
    }
  ]
}
```

---

### Generate Page Access Token

Tạo hoặc refresh page_access_token.

```http
POST https://pages.fm/api/v1/pages/{page_id}/generate_page_access_token
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_id` | string | ✅ | ID của page |
| `access_token` | string | ✅ | User access token với quyền admin |

---

## Conversations API

### Get Conversations

Lấy danh sách 60 conversations mới nhất.

```http
GET https://pages.fm/api/public_api/v2/pages/{page_id}/conversations
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_id` | string | ✅ | ID của page |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `last_conversation_id` | string | ❌ | ID conversation cuối để phân trang |
| `tags` | string | ❌ | Filter theo tag IDs (comma-separated) |
| `type` | array | ❌ | Filter theo loại: `INBOX`, `COMMENT` |
| `post_ids` | array | ❌ | Filter theo post IDs |
| `since` | integer | ❌ | Filter từ timestamp (seconds) |
| `until` | integer | ❌ | Filter đến timestamp (seconds) |
| `unread_first` | boolean | ❌ | Ưu tiên conversations chưa đọc |
| `order_by` | string | ❌ | `inserted_at` hoặc `updated_at` |

**Response:**
```json
{
  "conversations": [
    {
      "id": "string",
      "type": "INBOX | COMMENT | LIVESTREAM",
      "page_uid": "string",
      "updated_at": "2019-08-24T14:15:22Z",
      "inserted_at": "2019-08-24T14:15:22Z",
      "tags": ["string"],
      "last_message": {
        "text": "string",
        "sender": "string",
        "created_at": "2019-08-24T14:15:22Z"
      },
      "participants": [
        {
          "name": "string",
          "email": "string",
          "phone": "string"
        }
      ]
    }
  ]
}
```

---

### Add/Remove Conversation Tag

Thêm hoặc xóa tag khỏi conversation.

```http
POST https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/tags
```

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_id` | string | ✅ | ID của page |
| `conversation_id` | string | ✅ | ID của conversation |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |

**Request Body:**
```json
{
  "action": "add | remove",
  "tag_id": "string"
}
```

**Response:**
```json
{
  "data": [0],
  "success": true,
  "timestamp": 0
}
```

---

### Assign Conversation

Gán nhân viên cho conversation.

```http
POST https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/assign
```

**Request Body:**
```json
{
  "assignee_ids": ["user_id_1", "user_id_2"]
}
```

**Response:**
```json
{
  "success": true,
  "assignee_group_id": "string",
  "assignee_ids": ["string"],
  "customers": [
    {
      "fb_id": "string",
      "id": "string",
      "name": "string"
    }
  ],
  "from": {
    "email": "string",
    "id": "string",
    "name": "string"
  },
  "seen": true,
  "updated_at": "2019-08-24T14:15:22Z"
}
```

---

### Mark Conversation as Read

```http
POST https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/read
```

**Response:**
```json
{
  "success": true
}
```

---

### Mark Conversation as Unread

```http
POST https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/unread
```

**Response:**
```json
{
  "success": true
}
```

---

## Messages API

### Get Messages

Lấy danh sách tin nhắn trong conversation.

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/messages
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `current_count` | number | ❌ | Index để phân trang (trả về 30 messages trước index này) |

**Response:**
```json
{
  "messages": [
    {
      "conversation_id": "string",
      "from": {
        "email": "string",
        "id": "string",
        "name": "string"
      },
      "has_phone": true,
      "inserted_at": "string",
      "is_hidden": false,
      "is_removed": false,
      "message": "string",
      "page_id": "string",
      "type": "string"
    }
  ]
}
```

---

### Send Message

Gửi tin nhắn (inbox, reply comment, private reply).

```http
POST https://pages.fm/api/public_api/v1/pages/{page_id}/conversations/{conversation_id}/messages
```

**Request Body - Inbox Message:**
```json
{
  "action": "reply_inbox",
  "message": "Nội dung tin nhắn",
  "name": "filename (optional)",
  "mime_type": "image/png",
  "content_ids": ["content_id từ upload API"],
  "attachment_type": "PHOTO | VIDEO | DOCUMENT | AUDIO_ATTACHMENT_ID"
}
```

**Request Body - Reply Comment:**
```json
{
  "action": "reply_comment",
  "message_id": "ID của comment cần reply",
  "message": "Nội dung reply",
  "content_url": "URL ảnh (optional)",
  "mentions": [
    {
      "psid": "customer PSID",
      "name": "customer name",
      "offset": 0,
      "length": 0
    }
  ]
}
```

**Request Body - Private Reply:**
```json
{
  "action": "private_replies",
  "post_id": "ID của post chứa comment",
  "message_id": "ID của comment",
  "from_id": "sender ID",
  "message": "Nội dung tin nhắn"
}
```

**Response:**
```json
{
  "success": true,
  "id": "string",
  "message": "string"
}
```

---

## Statistics API

### Ads Campaign Statistics

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/statistics/pages_campaign
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `since` | integer | ✅ | Start time (Unix timestamp UTC+0) |
| `until` | integer | ✅ | End time (Unix timestamp UTC+0) |

**Response:**
```json
[
  {
    "account_id": "string",
    "ad_id": "string",
    "adset_id": "string",
    "budget_remaining": "string",
    "currency": "string",
    "daily_budget": "string",
    "status": "string"
  }
]
```

---

### Ads Statistics

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/statistics/ads
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `since` | integer | ✅ | Start time (Unix timestamp) |
| `until` | integer | ✅ | End time (Unix timestamp) |
| `type` | string | ✅ | `by_id` hoặc `by_time` |

**Response:**
```json
[
  {
    "name": "string",
    "status": "string",
    "currency": "string",
    "reach": "string",
    "impressions": "string",
    "spend": "string"
  }
]
```

---

### Engagement Statistics

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/statistics/customer_engagements
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `date_range` | string | ✅ | VD: `27/07/2021 00:00:00 - 26/08/2021 23:59:59` |
| `by_hour` | boolean | ❌ | Nhóm theo giờ |
| `user_ids` | string | ❌ | Filter theo staff user IDs |

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": ["26/8"],
    "series": [
      {
        "name": "inbox",
        "data": [0]
      }
    ]
  },
  "statistics": [
    {
      "hour": "2019-08-24T14:15:22Z",
      "inbox": 0,
      "comment": 0,
      "total": 0,
      "new_customer": 0,
      "new_customer_from_inbox": 0
    }
  ]
}
```

---

### Page Statistics

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/statistics/pages
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `since` | integer | ✅ | Start time (Unix timestamp UTC+0) |
| `until` | integer | ✅ | End time (Unix timestamp UTC+0) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "customer_comment_count": 0,
      "customer_inbox_count": 0,
      "hour": "2019-08-24T14:15:22Z",
      "inbox_interactive_count": 0,
      "new_customer_count": 0,
      "new_inbox_count": 0,
      "page_comment_count": 0,
      "page_inbox_count": 0,
      "phone_number_count": 0,
      "today_uniq_website_referral": 0,
      "today_website_guest_referral": 0,
      "uniq_phone_number_count": 0
    }
  ]
}
```

---

### Tag Statistics

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/statistics/tags
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `since` | integer | ✅ | Start time (Unix timestamp UTC+0) |
| `until` | integer | ✅ | End time (Unix timestamp UTC+0) |

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": ["string"],
    "series": {
      "property1": [0]
    }
  },
  "data_today": {
    "categories": ["string"],
    "series": {
      "property1": [0]
    }
  },
  "tags": [
    {
      "id": "string",
      "text": "string",
      "color": "string",
      "lighten_color": "string",
      "description": "string"
    }
  ]
}
```

---

### User Statistics

Thống kê tương tác của nhân viên.

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/statistics/users
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `date_range` | string | ✅ | VD: `27/07/2021 00:00:00 - 26/08/2021 23:59:59` |

**Response:**
```json
{
  "success": true,
  "data": {
    "statistics": {
      "property1": [
        {
          "average_response_time": 74276,
          "comment_count": 0,
          "inbox_count": 6,
          "phone_number_count": 0,
          "private_reply_count": 0,
          "unique_comment_count": 0,
          "unique_inbox_count": 2,
          "hour": "2021-07-28T10:00:00"
        }
      ]
    },
    "users": {
      "user_id": {
        "user_name": "Quyết Nguyễn",
        "user_fb_id": "570423649807405",
        "average_response_time": 588569,
        "inbox_count": 637,
        "unique_inbox_count": 30
      }
    }
  }
}
```

---

## Customers API

### Get Page Customers

Lấy danh sách khách hàng của page.

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/page_customers
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `since` | integer | ✅ | Start time (Unix timestamp UTC+0) |
| `until` | integer | ✅ | End time (Unix timestamp UTC+0) |
| `page_number` | integer | ✅ | Số trang (minimum: 1) |
| `page_size` | integer | ❌ | Số records/trang (maximum: 100) |
| `order_by` | string | ❌ | `inserted_at` hoặc `updated_at` |

**Response:**
```json
{
  "total": 500,
  "customers": [
    {
      "birthday": "2019-08-24",
      "gender": "string",
      "inserted_at": "2019-08-24T14:15:22Z",
      "lives_in": "string",
      "name": "string",
      "phone_numbers": ["string"],
      "psid": "string",
      "notes": [
        {
          "created_at": -9007199254740991,
          "created_by": {
            "fb_id": "string",
            "fb_name": "string",
            "uid": "string"
          },
          "id": "string",
          "images": ["string"],
          "links": ["string"],
          "message": "string",
          "order_id": "string"
        }
      ]
    }
  ],
  "success": true
}
```

---

### Update Customer Information

```http
PUT https://pages.fm/api/public_api/v1/pages/{page_id}/page_customers/{page_customer_id}
```

**Request Body:**
```json
{
  "changes": {
    "gender": "male | female | unknown",
    "birthday": "YYYY-MM-DD",
    "phone_numbers": ["0123456789"],
    "name": "Customer Name"
  }
}
```

**Response:**
```json
{
  "success": true
}
```

---

### Add Customer Note

```http
POST https://pages.fm/api/public_api/v1/pages/{page_id}/page_customers/{page_customer_id}/notes
```

**Request Body:**
```json
{
  "message": "This customer prefers afternoon calls."
}
```

**Response:**
```json
{
  "success": true
}
```

---

### Update Customer Note

```http
PUT https://pages.fm/api/public_api/v1/pages/{page_id}/page_customers/{page_customer_id}/notes
```

**Request Body:**
```json
{
  "note_id": "string",
  "message": "Updated note content."
}
```

---

### Delete Customer Note

```http
DELETE https://pages.fm/api/public_api/v1/pages/{page_id}/page_customers/{page_customer_id}/notes
```

**Request Body:**
```json
{
  "note_id": "string"
}
```

---

## Export Data API

### Export Conversations from Ads

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/export_data
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `since` | integer | ✅ | Start time (Unix timestamp UTC+0) |
| `until` | integer | ✅ | End time (Unix timestamp UTC+0) |
| `action` | string | ✅ | `conversations_from_ads` |
| `offset` | integer | ❌ | Offset phân trang (default: 0, mỗi lần trả 60 records) |

**Response:**
```json
{
  "data": [
    {
      "id": "string",
      "tags": ["string"],
      "from": {
        "email": "user@example.com",
        "id": "string",
        "name": "string"
      },
      "inserted_at": "2019-08-24T14:15:22Z",
      "updated_at": "2019-08-24T14:15:22Z",
      "customers": [
        {
          "fb_id": "string",
          "id": "string",
          "name": "string"
        }
      ],
      "recent_phone_numbers": ["string"],
      "ad_clicks": ["string"],
      "is_banned": false
    }
  ],
  "success": true
}
```

---

## Call Logs API

### Retrieve Call Logs

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/sip_call_logs
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `id` | string | ✅ | ID của SIP package |
| `page_number` | integer | ✅ | Số trang (minimum: 1) |
| `page_size` | integer | ✅ | Số records/trang (maximum: 30) |
| `since` | integer | ❌ | Start time (Unix timestamp UTC+0) |
| `until` | integer | ❌ | End time (Unix timestamp UTC+0) |

**Response:**
```json
{
  "data": [
    {
      "call_id": "string",
      "caller": "string",
      "callee": "string",
      "start_time": "2019-08-24T14:15:22Z",
      "duration": 0,
      "status": "completed | missed"
    }
  ],
  "success": true
}
```

---

## Tags API

### Get List Tags

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/tags
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |

**Response:**
```json
{
  "tags": [
    {
      "id": 0,
      "text": "Kiểm hàng",
      "color": "#4b5577",
      "lighten_color": "#c9ccd6"
    }
  ]
}
```

---

## Posts API

### Get Posts

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/posts
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |
| `since` | integer | ✅ | Start time (Unix timestamp UTC+0) |
| `until` | integer | ✅ | End time (Unix timestamp UTC+0) |
| `page_number` | integer | ✅ | Số trang (minimum: 1) |
| `page_size` | integer | ✅ | Số records/trang (maximum: 30) |
| `type` | string | ❌ | `video`, `photo`, `text`, `livestream` |

**Response:**
```json
{
  "success": true,
  "total": 200,
  "posts": [
    {
      "id": "256469571178082_1719461745119729",
      "page_id": "256469571178082",
      "from": {
        "id": "5460527857372996",
        "name": "Djamel Belkessa"
      },
      "message": "edit review là 1 nghệ thuật",
      "type": "rating",
      "inserted_at": "2022-08-22T03:09:27",
      "comment_count": 0,
      "reactions": {
        "angry_count": 1,
        "care_count": 2,
        "haha_count": 1,
        "like_count": 111,
        "love_count": 14,
        "sad_count": 12,
        "wow_count": 17
      },
      "phone_number_count": 0
    }
  ]
}
```

---

## Users API

### Get List Users

```http
GET https://pages.fm/api/public_api/v1/pages/{page_id}/users
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ❌ | Page access token |

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "c4bafd84-7b96-4f28-b59a-031f17c32ddf",
      "name": "Anh Ngoc Nguyen",
      "status": "available",
      "fb_id": "116256249766099",
      "page_permissions": {
        "permissions": [100, 71, 81]
      },
      "status_in_page": "active",
      "is_online": false
    }
  ],
  "disabled_users": [
    {
      "id": "69586d78-dd37-4d25-ad2b-0716697b1c34",
      "name": "Khanh khanh",
      "fb_id": "1736243166628197"
    }
  ],
  "round_robin_users": {
    "comment": ["79d4e769-ac31-4821-8304-d6e251d532e9"],
    "inbox": ["fb5ff8ed-434b-4d4b-a213-b595b242b81a"]
  }
}
```

---

### Update Round Robin Users

```http
POST https://pages.fm/api/public_api/v1/pages/{page_id}/round_robin_users
```

**Request Body:**
```json
{
  "inbox": ["user_id_1", "user_id_2"],
  "comment": ["user_id_1"]
}
```

**Response:**
```json
{
  "message": "Cài đặt đã được cập nhật thành công",
  "success": true
}
```

---

## Page Contents API

### Upload Media Content

Upload file (ảnh, video) lên Page.

```http
POST https://pages.fm/api/public_api/v1/pages/{page_id}/upload_contents
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_access_token` | string | ✅ | Page access token |

**Request Body:** `multipart/form-data`
| Field | Type | Description |
|-------|------|-------------|
| `file` | binary | File cần upload |

**Video Size Limits:**
| Platform | Max Size |
|----------|----------|
| Shopee | 30MB |
| Whatsapp Official | 16MB |
| Lazada | 100MB |
| Other | 25MB |

**Response:**
```json
{
  "id": "HXrxioWFIc5DFwffhmOVHspLuMwpWCXfWDoBxiov6DLa3MvakLeGpLQAly7oHDvZT66VEhnYG4zQEi2MhEzhlg",
  "attachment_type": "PHOTO | VIDEO | DOCUMENT | AUDIO_ATTACHMENT_ID",
  "success": true
}
```

---

## Error Handling

Tất cả API responses đều có format:

**Success:**
```json
{
  "success": true,
  "data": {}
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## Rate Limiting

> ⚠️ **Lưu ý:** Thông tin về rate limiting chưa được cung cấp trong tài liệu. Khuyến nghị giới hạn requests để tránh bị block.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12-12 | Initial documentation from OpenAPI spec |

---

*Tài liệu được tạo tự động từ OpenAPI Specification của Pancake API.*
