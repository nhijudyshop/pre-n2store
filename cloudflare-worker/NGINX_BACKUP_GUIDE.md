# Nginx Backup Configuration for Cloudflare Worker

## Tổng quan

File `nginx-backup.conf` là bản sao lưu Nginx cho Cloudflare Worker, có **đầy đủ chức năng** giống hệt với `worker.js`.

## Các Endpoint được hỗ trợ

| Endpoint | Mô tả | Method |
|----------|-------|--------|
| `/api/token` | TPOS Token với caching (5 phút buffer) | POST |
| `/api/image-proxy?url=<url>` | Proxy hình ảnh bypass CORS | GET |
| `/api/fb-avatar?id=<fb_id>&page=<page_id>&token=<jwt>` | Avatar Facebook/Pancake | GET |
| `/api/pancake-avatar?hash=<hash>` | Avatar từ content.pancake.vn | GET |
| `/api/proxy?url=<url>` | Generic proxy với custom headers | GET/POST |
| `/api/pancake-direct/*` | Pancake API (24h policy bypass) | GET/POST |
| `/api/pancake-official/*` | pages.fm Public API | GET/POST |
| `/api/facebook-send` | Gửi tin nhắn Facebook với tag | POST |
| `/api/pancake/*` | Pancake API generic | GET/POST |
| `/api/realtime/start` | Realtime server (Render) | GET/POST |
| `/api/chat/*` | Chat server (Render) | GET/POST |
| `/api/sepay/*` | Sepay webhook & balance | GET/POST |
| `/api/customers/*` | Customers API (PostgreSQL) | GET/POST |
| `/api/rest/*` | TPOS REST API v2.0 | GET/POST |
| `/api/*` | TPOS catch-all proxy | GET/POST |

## Yêu cầu hệ thống

### 1. OpenResty (Recommended)
OpenResty bao gồm Nginx + LuaJIT + các module cần thiết.

```bash
# Ubuntu/Debian
wget -O - https://openresty.org/package/pubkey.gpg | sudo apt-key add -
echo "deb http://openresty.org/package/ubuntu $(lsb_release -sc) main" \
    | sudo tee /etc/apt/sources.list.d/openresty.list
sudo apt-get update
sudo apt-get install openresty
```

```bash
# macOS
brew install openresty/brew/openresty
```

### 2. lua-resty-http module
```bash
# Cài đặt qua opm (OpenResty Package Manager)
opm get ledgetech/lua-resty-http
```

## Cài đặt

### 1. Copy file cấu hình
```bash
sudo cp nginx-backup.conf /etc/openresty/sites-available/n2store-api.conf
sudo ln -s /etc/openresty/sites-available/n2store-api.conf /etc/openresty/sites-enabled/
```

### 2. Chỉnh sửa domain
Sửa `server_name` trong file cấu hình:
```nginx
server_name n2store-api.yourdomain.com;
```

### 3. Cấu hình SSL (Production)
Uncomment và cấu hình SSL certificate:
```nginx
ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
```

### 4. Test cấu hình
```bash
sudo openresty -t
```

### 5. Restart Nginx
```bash
sudo systemctl restart openresty
```

## So sánh với Cloudflare Worker

| Feature | Cloudflare Worker | Nginx Backup |
|---------|------------------|--------------|
| Token Caching | ✅ In-memory | ✅ lua_shared_dict |
| CORS Headers | ✅ | ✅ |
| Image Proxy | ✅ | ✅ |
| Avatar Proxy | ✅ | ✅ |
| Pancake API | ✅ | ✅ |
| Facebook Send | ✅ | ✅ |
| TPOS Proxy | ✅ | ✅ |
| Render Backend | ✅ | ✅ |

## Chuyển đổi từ Cloudflare sang Nginx

### 1. Cập nhật DNS
Thay đổi A record hoặc CNAME từ Cloudflare proxy sang IP/domain của Nginx server.

### 2. Cập nhật trong ứng dụng
```javascript
// Thay đổi base URL
const API_BASE = 'https://n2store-api.yourdomain.com';
// thay vì
// const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev';
```

## Troubleshooting

### 1. Lỗi "lua-resty-http" not found
```bash
# Cài đặt lua-resty-http
opm get ledgetech/lua-resty-http

# Hoặc thủ công
wget https://raw.githubusercontent.com/ledgetech/lua-resty-http/master/lib/resty/http.lua \
    -O /usr/local/openresty/lualib/resty/http.lua
wget https://raw.githubusercontent.com/ledgetech/lua-resty-http/master/lib/resty/http_headers.lua \
    -O /usr/local/openresty/lualib/resty/http_headers.lua
```

### 2. Lỗi SSL verification
File cấu hình đã tắt `ssl_verify = false` để tương thích với các certificate tự ký hoặc môi trường development.

### 3. Token cache không hoạt động
Kiểm tra log:
```bash
tail -f /var/log/nginx/n2store-api-error.log
```

## Monitoring

### Access log format
Log được lưu tại:
- `/var/log/nginx/n2store-api-access.log`
- `/var/log/nginx/n2store-api-error.log`

### Health check
```bash
curl -X OPTIONS https://n2store-api.yourdomain.com/api/token
# Expect: 204 No Content với CORS headers
```

## Backup & Recovery

Khi Cloudflare có vấn đề:
1. Chuyển DNS sang Nginx server
2. Đợi TTL hết hạn (hoặc giảm TTL trước)
3. Kiểm tra các endpoint hoạt động bình thường

Khi Cloudflare phục hồi:
1. Chuyển DNS về Cloudflare
2. Đợi TTL hết hạn
