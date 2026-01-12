# 🤖 AI Chat Widget - Hướng Dẫn Sử Dụng

> Widget AI trợ lý thông minh, xuất hiện trên mọi trang của N2Store

---

## 📍 Vị Trí File

```
/Users/mac/Downloads/n2store/js/ai-chat-widget.js
```

---

## ✨ Tính Năng

| Tính năng | Mô tả |
|-----------|-------|
| 🎈 **Floating Button** | Nút chat nổi góc phải dưới màn hình |
| 🧠 **Multi-model AI** | Hỗ trợ Gemini 3/2.5/2.0 và DeepSeek |
| 📄 **Page Context** | Tự động nhận diện nội dung trang để AI hiểu ngữ cảnh |
| 📎 **File Attachments** | Đính kèm hình ảnh, video, audio, PDF |
| 📋 **Paste Image** | Dán hình từ clipboard (Ctrl+V) |
| 📝 **Markdown** | Render response với markdown đẹp |
| 🎨 **Animations** | Hiệu ứng mượt mà với Animate.css |
| 📱 **Responsive** | Fullscreen trên mobile |
| 💾 **Lịch sử hội thoại** | Tự động lưu và khôi phục hội thoại |
| 🗑️ **Xóa hội thoại** | Nút xóa toàn bộ lịch sử chat |

---

## 🔧 Cấu Hình

### API Endpoints

```javascript
const CONFIG = {
    GEMINI_PROXY_URL: 'https://n2store-fallback.onrender.com/api/gemini/chat',
    DEEPSEEK_PROXY_URL: 'https://n2store-fallback.onrender.com/api/deepseek/chat',
    DEFAULT_MODEL: 'gemini-3-flash-preview',
    STORAGE_KEY: 'ai_widget_selected_model',
    HISTORY_KEY: 'ai_widget_conversation_history',  // Key lưu lịch sử
    HISTORY_MAX_MESSAGES: 100  // Giới hạn số tin nhắn lưu
};
```

### Các Model Hỗ Trợ

| Model | Provider | RPM | RPD | Ghi chú |
|-------|----------|-----|-----|---------|
| `gemini-3-flash-preview` | Gemini | 1K | 10K | ⭐ Mặc định |
| `gemini-3-pro-preview` | Gemini | 25 | 250 | Mạnh hơn |
| `gemini-2.5-flash` | Gemini | 1K | 10K | Stable |
| `gemini-2.5-pro` | Gemini | 150 | 10K | 2M token context |
| `gemini-2.0-flash` | Gemini | 1K | Unlimited | Nhanh |
| `deepseek-chat` | DeepSeek | 60 | Unlimited | Giá rẻ |
| `deepseek-reasoner` | DeepSeek | 60 | Unlimited | Suy luận tốt |

> **Lưu ý:** DeepSeek không hỗ trợ file attachments

---

## 🧭 Page Context Detection

Widget tự động nhận diện loại trang để cung cấp ngữ cảnh cho AI:

| URL Pattern | Loại Trang | Dữ Liệu Trích Xuất |
|-------------|------------|-------------------|
| `order-management`, `hangdat` | `order` | Đơn hàng, thống kê |
| `sanphamlive`, `product` | `product` | Sản phẩm, số lượng |
| `customer-management` | `customer` | Thông tin khách hàng |
| `inventory`, `bangkiemhang` | `inventory` | Kho hàng |
| `livestream`, `live` | `livestream` | Livestream |
| `orders-report` | `report` | Báo cáo |
| `/`, `index.html` | `dashboard` | Tổng quan |

### Dữ liệu gửi cho AI

Mỗi tin nhắn sẽ kèm theo context:

```
[CONTEXT - Trang hiện tại]
- Loại trang: order
- Tiêu đề: Quản lý đơn hàng - N2Store
- User: Admin (Quản trị viên)
- Đang tìm kiếm: "Nguyễn Văn A"

[Đơn hàng]
- Tổng số: 150
- Thống kê: {"Chờ xử lý": "25", "Đã giao": "100"}

[CÂU HỎI CỦA USER]
Có bao nhiêu đơn hàng chờ xử lý?
```

---

## 🚀 Cách Sử Dụng

### 1. Mở Chat Widget

- Click vào **nút tròn màu tím** ở góc phải dưới màn hình
- Hoặc gọi: `window.AIChatWidget.toggle()`

### 2. Chọn Model

- Click dropdown ở thanh model
- Model được lưu vào `localStorage` cho lần sau

### 3. Gửi Tin Nhắn

- Nhập tin nhắn và nhấn **Enter** hoặc click nút **Gửi**
- Nhấn **Shift + Enter** để xuống dòng

### 4. Đính Kèm File

- Click nút **📎 (Paperclip)** để chọn file
- Hoặc **Ctrl+V** để dán hình từ clipboard
- Hỗ trợ: Image, Video, Audio, PDF

### 5. Xóa Lịch Sử Hội Thoại

- Click nút **🗑️ Xóa** trên thanh model bar
- Xác nhận để xóa toàn bộ lịch sử
- Hoặc gọi: `window.AIChatWidget.clearHistory()`

### 6. Lịch Sử Tự Động

- Hội thoại tự động lưu vào `localStorage`
- Khi mở lại widget, hội thoại cũ sẽ được hiển thị
- Giới hạn: 100 tin nhắn gần nhất

---

## 📁 Cấu Trúc Code

```
ai-chat-widget.js
├── CONFIG              # Cấu hình API endpoints
├── MODELS              # Danh sách AI models
├── STATE               # Trạng thái widget
│   ├── isOpen
│   ├── currentModel
│   ├── conversationHistory
│   └── pendingAttachments
│
├── PAGE CONTEXT        # Nhận diện ngữ cảnh trang
│   ├── detectPageType()
│   ├── extractProductData()
│   ├── extractOrderData()
│   ├── extractCustomerData()
│   ├── extractGeneralPageData()
│   ├── getPageContext()
│   └── formatContextForAI()
│
├── CSS STYLES          # Inline styles
├── HTML TEMPLATE       # Widget HTML
│
├── CORE FUNCTIONS
│   ├── injectStyles()
│   ├── injectDependencies()
│   ├── createWidget()
│   ├── setupEventListeners()
│   ├── toggleChat()
│   └── updateRateInfo()
│
├── CONVERSATION HISTORY     # 🆕 Quản lý lịch sử
│   ├── loadConversationHistory()
│   ├── saveConversationHistory()
│   ├── clearConversation()
│   └── addMessageToDOM()
│
├── MESSAGING
│   ├── addMessage()
│   ├── showLoading()
│   ├── hideLoading()
│   └── sendMessage()
│
├── ATTACHMENTS
│   ├── handleFileSelect()
│   ├── handlePaste()
│   ├── processFile()
│   ├── updateAttachmentPreview()
│   └── removeAttachment()
│
└── INITIALIZATION
    └── init()
```

---

## 🌐 API Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   AI Widget     │───▶│  Render Proxy    │───▶│   Gemini API    │
│   (Frontend)    │    │  (Backend)       │    │   (Google)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  DeepSeek API   │
                       └─────────────────┘
```

### Request Format (Gemini)

```javascript
POST /api/gemini/chat
{
    "model": "gemini-3-flash-preview",
    "contents": [{
        "role": "user",
        "parts": [
            { "text": "[CONTEXT...]\\n\\n[CÂU HỎI]..." },
            { "inline_data": { "mime_type": "image/png", "data": "base64..." }}
        ]
    }]
}
```

### Request Format (DeepSeek)

```javascript
POST /api/deepseek/chat
{
    "model": "deepseek-chat",
    "messages": [{ "role": "user", "content": "..." }],
    "max_tokens": 4096,
    "temperature": 0.7
}
```

---

## 🔌 Global API

Widget expose các hàm sau:

```javascript
// Khởi tạo widget (tự động khi DOM ready)
window.AIChatWidget.init();

// Mở/đóng chat
window.AIChatWidget.toggle();

// Xóa attachment theo ID
window.AIChatWidget.removeAttachment(id);

// 🆕 Xóa toàn bộ lịch sử hội thoại
window.AIChatWidget.clearHistory();
```

---

## 📱 Responsive

| Màn hình | Hành vi |
|----------|---------|
| Desktop (> 480px) | Widget 380x520px, góc phải |
| Mobile (≤ 480px) | Fullscreen, FAB nhỏ hơn |

---

## 🎨 Tùy Chỉnh Giao Diện

### Thay đổi màu gradient

Tìm và sửa trong `WIDGET_STYLES`:

```css
/* Gradient chính */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Gradient khi mở */
background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
```

### Thay đổi vị trí FAB

```css
.ai-chat-fab {
    bottom: 24px;  /* Khoảng cách dưới */
    right: 24px;   /* Khoảng cách phải */
}
```

---

## ⚠️ Lưu Ý

1. **DeepSeek không hỗ trợ file** - Chọn model Gemini nếu cần gửi hình

2. **Rate Limit** - Mỗi model có giới hạn khác nhau, xem bảng models ở trên

3. **Context size** - Trang có nhiều dữ liệu sẽ chỉ gửi sample (3-5 items đầu)

4. **API Key** - Được lưu an toàn trên Render server, không expose ở client

5. **Lịch sử hội thoại** - Lưu trong `localStorage`, tối đa 100 tin nhắn. Hình ảnh chỉ lưu preview (không lưu base64 đầy đủ) để tránh vượt dung lượng

---

## 🔗 Liên Kết

- **Gemini API Docs**: https://ai.google.dev/docs
- **DeepSeek API Docs**: https://platform.deepseek.com/docs
- **Render Proxy**: `/Users/mac/Downloads/n2store/render.com/routes/gemini.js`
- **DeepSeek Proxy**: `/Users/mac/Downloads/n2store/render.com/routes/deepseek.js`

---

*Cập nhật: 2025-12-30*
