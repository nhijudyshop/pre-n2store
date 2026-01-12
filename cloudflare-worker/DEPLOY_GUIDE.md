# 🚀 Hướng dẫn Deploy Cloudflare Worker

## Bước 1: Tạo tài khoản Cloudflare (MIỄN PHÍ)

1. Truy cập: https://dash.cloudflare.com/sign-up
2. Đăng ký tài khoản miễn phí
3. Verify email

## Bước 2: Tạo Worker

1. Đăng nhập vào Cloudflare Dashboard
2. Vào **Workers & Pages** từ menu bên trái
3. Click **Create Application**
4. Chọn **Create Worker**
5. Đặt tên: `chatomni-proxy` (hoặc tên bạn thích)
6. Click **Deploy**

## Bước 3: Deploy Worker Code

### Cách 1: Tự động (Đã cấu hình)
1. Push code lên GitHub
2. Cloudflare Workers tự động deploy khi có thay đổi
3. File `wrangler.jsonc` đã được cấu hình sẵn

### Cách 2: Manual (qua Dashboard)
1. Sau khi tạo worker, click **Edit code**
2. **XÓA HẾT** code mặc định
3. **DÁN** nội dung file `worker.js` vào
4. Click **Save and Deploy**

## Bước 4: Lấy Worker URL

Sau khi deploy, bạn sẽ có URL dạng:
```
https://chatomni-proxy.YOUR-SUBDOMAIN.workers.dev
```

Ví dụ:
```
https://chatomni-proxy.nhijudyshop.workers.dev
```

**Lưu lại URL này!**

## Bước 5: Test Worker

Mở terminal và test:

### Test Pancake API Proxy (MỚI):
```bash
curl "https://YOUR-WORKER-URL.workers.dev/api/pancake/pages?access_token=YOUR_PANCAKE_TOKEN"
```

### Test ChatOmni API Proxy:
```bash
curl "https://YOUR-WORKER-URL.workers.dev/api/api-ms/chatomni/v1/conversations/search" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "Limit": 1,
    "Channels": [{"Id": "270136663390370", "Type": 4}],
    "Type": "message"
  }'
```

### Test Image Proxy:
```bash
curl "https://YOUR-WORKER-URL.workers.dev/api/image-proxy?url=https://img1.tpos.vn/img/abc123.jpg" \
  --output test-image.jpg
```

Nếu trả về dữ liệu → **THÀNH CÔNG!**

## Bước 6: Cập nhật Code

Gửi Worker URL cho Claude để update `chat-data-manager.js`

---

## 📡 API Routes được hỗ trợ

Worker hỗ trợ các API sau:

### 1. Pancake API (MỚI)
```
/api/pancake/* → https://pancake.vn/api/v1/*
```
Headers tự động thêm:
- `Accept: application/json, text/plain, */*`
- `Referer: https://pancake.vn/multi_pages`

### 2. TPOS API
```
/api/odata/* → https://tomato.tpos.vn/odata/*
/api/token → https://tomato.tpos.vn/token (có cache)
```

### 3. ChatOmni API
```
/api/api-ms/chatomni/v1/* → https://api-ms.chatomni.com/v1/*
```

### 4. Image Proxy
```
/api/image-proxy?url=<image_url>
```

### 5. Generic Proxy
```
/api/proxy?url=<target_url>&headers=<json_headers>
```

## 💡 Tips

- **Free tier**: 100,000 requests/ngày
- **Không sleep**: Response luôn nhanh
- **Edge network**: Deploy toàn cầu
- **Monitor**: Xem logs tại Workers Dashboard
- **Auto headers**: Worker tự động thêm headers đúng cho từng API

## 🔧 Troubleshooting

### Lỗi: "Exceeded free tier"
→ Bạn đã dùng > 100,000 requests/ngày (rất khó xảy ra)

### Lỗi: "Worker threw exception"
→ Check logs tại Workers Dashboard → Logs

### CORS vẫn bị block
→ Đảm bảo bạn đã copy đúng code `worker.js`

---

Nếu gặp vấn đề gì, gửi screenshot cho Claude!
