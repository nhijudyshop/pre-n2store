# Invoice Compare - So Sánh Đơn Hàng

Trang so sánh đơn hàng tự động sử dụng Gemini AI để phân tích hóa đơn và so sánh với dữ liệu từ TPOS.

## 🎯 Tính Năng

### 1. **Fetch Dữ Liệu TPOS**
- Nhập link hóa đơn TPOS (format: `https://tomato.tpos.vn/#/app/fastpurchaseorder/invoiceform1?id=53589`)
- Tự động extract ID và fetch dữ liệu qua Cloudflare Worker
- Hiển thị thông tin đơn hàng: số hóa đơn, nhà cung cấp, tổng tiền, chi tiết sản phẩm

### 2. **Phân Tích Hóa Đơn Bằng AI**
- Upload hình ảnh hóa đơn (hỗ trợ nhiều ảnh)
- Gemini AI tự động phân tích và trích xuất:
  - Thông tin hóa đơn (số HĐ, nhà cung cấp, ngày, tổng tiền)
  - Chi tiết sản phẩm (mã hàng, tên, số lượng, đơn giá, thành tiền)
- Group sản phẩm theo mã hàng (5-6 số)

### 3. **So Sánh Thông Minh**
- **Validate nội bộ JSON**: Kiểm tra tổng số lượng, tổng tiền
- **So sánh AI vs JSON**: So sánh từng mã hàng
- **Phát hiện lỗi tự động**:
  - ❌ Lỗi giá (đặc biệt phát hiện lỗi nhập x10)
  - ⚠️ Lỗi số lượng
  - 🔍 Thiếu sản phẩm (có trong JSON nhưng không có trong hóa đơn)
  - ➕ Thừa sản phẩm (có trong hóa đơn nhưng không có trong JSON)

## 🔧 Cấu Hình

### Setup Gemini API Keys

API keys được load từ GitHub Secrets hoặc environment variables:

#### Cách 1: Từ GitHub Secrets (Production)

1. Vào GitHub repository settings → Secrets and variables → Actions
2. Thêm secrets:
   - `GEMINI_KEYS`: Danh sách 10 Gemini API keys (phân cách bằng dấu phẩy)
   - `HF_KEYS`: Danh sách 3 HuggingFace API keys (tùy chọn)

3. Build process sẽ tự động inject keys vào `window.GEMINI_KEYS`

#### Cách 2: Manual Setup (Development)

Thêm vào file HTML trước `<script src="gemini-ai-helper.js">`:

```html
<script>
    window.GEMINI_KEYS = 'key1,key2,key3,...';
    window.HF_KEYS = 'hf_key1,hf_key2,hf_key3';
</script>
```

Hoặc set trực tiếp trong browser console:

```javascript
window.GEMINI_KEYS = 'your_api_key_1,your_api_key_2';
```

### Lấy Gemini API Key

1. Vào https://aistudio.google.com/app/apikey
2. Tạo API key mới
3. Copy và paste vào config

## 🚀 Sử Dụng

### Bước 1: Upload Hóa Đơn
1. Click "Tải lên hình ảnh hóa đơn"
2. Chọn ảnh hóa đơn (hỗ trợ nhiều ảnh)
3. Click "Phân Tích Với AI"

### Bước 2: Fetch Dữ Liệu TPOS
1. Nhập link hóa đơn TPOS
2. Click "Tải Dữ Liệu"

### Bước 3: Xem Kết Quả
- Hệ thống tự động so sánh AI vs JSON
- Hiển thị dashboard với số lượng lỗi
- Chi tiết từng lỗi với thông tin so sánh

## 📊 Logic So Sánh

### 1. Trích Xuất Mã Hàng
```javascript
// Từ tên sản phẩm: "1812 A8 SET ÁO LV BÔNG XÙ"
extractProductCode("1812 A8 SET...") → "1812"
```

### 2. Group Theo Mã Hàng
```javascript
grouped = {
  "1812": {
    qty: 2,
    amount: 354000,
    items: [...]
  }
}
```

### 3. So Sánh
- **Số lượng**: `|json.qty - ai.qty| > 0.01` → Lỗi số lượng
- **Thành tiền**: `|json.amount - ai.amount| > 0.01` → Lỗi giá
- **Phát hiện x10**: `|jsonPrice / aiPrice - 10| < 0.1` → Lỗi nhập x10

## 🔐 Bảo Mật

- API keys được rotate tự động khi gặp rate limit (429, 403, 503)
- Keys thất bại được cache 30 giây trước khi thử lại
- Hỗ trợ tối đa 10 Gemini keys với auto-failover
- TPOS token được cache bởi Cloudflare Worker

## 🎨 UI/UX

- Modern card layout với gradient headers
- Responsive design (mobile + desktop)
- Color-coded error messages:
  - 🔴 Đỏ: Lỗi nghiêm trọng (giá, thiếu)
  - 🟡 Vàng: Cảnh báo (số lượng, thừa)
  - 🟢 Xanh: OK
- Loading overlay khi processing
- Image preview với remove button

## 📝 TODO

- [ ] Thêm support cho nhiều ảnh (hiện tại chỉ analyze ảnh đầu tiên)
- [ ] Export kết quả so sánh ra Excel
- [ ] Lưu lịch sử so sánh
- [ ] Thêm OCR fallback khi AI không khả dụng
- [ ] Hỗ trợ PDF upload

## 🐛 Troubleshooting

### "Gemini AI chưa được tải"
- Kiểm tra `window.GEMINI_KEYS` trong console
- Load lại trang
- Kiểm tra file `gemini-ai-helper.js` đã được include

### "Không thể parse kết quả từ AI"
- AI có thể trả về format không đúng
- Kiểm tra console để xem raw result
- Thử upload ảnh rõ hơn

### "All keys failed"
- Tất cả API keys đã bị rate limit
- Đợi 30 giây để keys được reset
- Hoặc thêm keys mới

## 📚 References

- [Gemini AI Guide](../AI/GEMINI-AI-GUIDE.md)
- [TPOS API Documentation](https://tomato.tpos.vn/)
- [Cloudflare Worker Proxy](../cloudflare-worker/worker.js)
