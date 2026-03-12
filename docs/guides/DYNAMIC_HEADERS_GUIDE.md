# Dynamic Headers Guide

## Tổng quan

Dự án đã được cập nhật để sử dụng **Dynamic Headers** thay vì hardcode version. Điều này giúp:
- ✅ Tự động cập nhật `tposappversion` khi TPOS thay đổi
- ✅ Không cần thay đổi code khi version mới ra
- ✅ Centralized management thông qua backend

## Kiến trúc

```
Frontend (Browser)
    ↓ fetch dynamic headers on load
Backend API (/dynamic-headers)
    ↓ manages and stores
Dynamic Header Manager
    ↓ learns from responses
TPOS API (tomato.tpos.vn)
```

## Cách hoạt động

### 1. Frontend (Browser)

**File:** [js/tpos-config.js](js/tpos-config.js)

```javascript
const TPOS_CONFIG = {
    tposAppVersion: null, // Dynamically fetched
    _fallbackVersion: '5.12.29.1', // Fallback only

    async fetchDynamicHeaders() {
        const response = await fetch(`${this.fallbackApiUrl}/dynamic-headers`);
        const data = await response.json();
        this.tposAppVersion = data.data.currentHeaders.tposappversion;
    }
};

// Auto-fetch on page load
if (typeof window !== 'undefined') {
    TPOS_CONFIG.fetchDynamicHeaders();
}
```

**Sử dụng trong code:**
```javascript
// ❌ KHÔNG làm thế này nữa:
'tposappversion': '5.12.29.1'

// ✅ Làm thế này:
'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1'
```

### 2. Cloudflare Worker

**File:** [cloudflare-worker/worker.js](cloudflare-worker/worker.js)

```javascript
// In-memory cache of learned headers
const dynamicHeaders = {
  tposappversion: null,
  lastUpdated: null
};

function getDynamicHeader(headerName) {
  return dynamicHeaders[headerName] || null;
}

function learnFromResponse(response) {
  const tposVersion = response.headers.get('tposappversion');
  if (tposVersion && /^\d+\.\d+\.\d+\.\d+$/.test(tposVersion)) {
    dynamicHeaders.tposappversion = tposVersion;
  }
}

// Sử dụng:
tposHeaders.set('tposappversion', getDynamicHeader('tposappversion') || '5.12.29.1');
```

### 3. Backend (Render.com)

**File:** [render.com/helpers/dynamic-header-manager.js](render.com/helpers/dynamic-header-manager.js)

- Quản lý dynamic headers tập trung
- Lưu vào file `dynamic-headers.json`
- Auto-learn từ TPOS responses
- Rate limiting để tránh update quá nhiều

**API Endpoints:**
- `GET /dynamic-headers` - Lấy current headers
- `GET /dynamic-headers/history` - Xem lịch sử cập nhật
- `POST /dynamic-headers/set` - Set header manually (admin)
- `POST /dynamic-headers/reset` - Reset về defaults

## Files đã được cập nhật

### ✅ Frontend (Browser)
- [js/tpos-config.js](js/tpos-config.js) - Central config với dynamic fetch
- [hanghoan/banhang.js](hanghoan/banhang.js) - Sử dụng `window.TPOS_CONFIG`
- [hanghoan/doisoat.js](hanghoan/doisoat.js) - Sử dụng `window.TPOS_CONFIG`
- [invoice-compare/invoice-compare.js](invoice-compare/invoice-compare.js) - Sử dụng `window.TPOS_CONFIG`
- [soorder/soorder-supplier-loader.js](soorder/soorder-supplier-loader.js) - Sử dụng `window.TPOS_CONFIG`
- [orders-report/live-comments-readonly-modal.js](orders-report/live-comments-readonly-modal.js) - Sử dụng `window.TPOS_CONFIG`
- [orders-report/tab1-orders.js](orders-report/tab1-orders.js) - Sử dụng `window.TPOS_CONFIG`
- [orders-report/tab-overview.html](orders-report/tab-overview.html) - Sử dụng `window.TPOS_CONFIG`
- ~~tpos-pancake/tpos-chat.js~~ - Removed (TPOS realtime handled by render.com/server.js)

### ✅ Cloudflare Worker
- [cloudflare-worker/worker.js](cloudflare-worker/worker.js) - Sử dụng `getDynamicHeader()` với fallback
- [cloudflare-worker/nginx-backup.conf](cloudflare-worker/nginx-backup.conf) - Forward client headers

### ✅ Backend (Render.com)
- [render.com/helpers/dynamic-header-manager.js](render.com/helpers/dynamic-header-manager.js) - Đã có sẵn
- [render.com/routes/dynamic-headers.routes.js](render.com/routes/dynamic-headers.routes.js) - Đã có sẵn
- [render.com/routes/cloudflare-backup.js](render.com/routes/cloudflare-backup.js) - Đã sử dụng dynamic headers
- [render.com/routes/token.js](render.com/routes/token.js) - Đã sử dụng dynamic headers

## Fallback Strategy

Tất cả các nơi đều có **fallback version** để đảm bảo hoạt động ngay cả khi:
- Dynamic fetch failed
- Backend không available
- Initial request trước khi học được version mới

```javascript
// Pattern được sử dụng everywhere:
tposappversion: window.TPOS_CONFIG?.tposAppVersion || '5.12.29.1'
//                     ↑ Dynamic                      ↑ Fallback
```

## Testing

### 1. Kiểm tra dynamic headers đang hoạt động:
```bash
curl https://n2store-fallback.onrender.com/dynamic-headers
```

Response:
```json
{
  "success": true,
  "data": {
    "currentHeaders": {
      "tposappversion": "5.12.29.1"
    },
    "totalUpdates": 5,
    "storageType": "file"
  }
}
```

### 2. Kiểm tra frontend load được dynamic headers:
```javascript
// Mở browser console trên bất kỳ page nào
console.log(window.TPOS_CONFIG.tposAppVersion);
// Nên thấy: "5.12.29.1" (hoặc version mới hơn)
```

### 3. Kiểm tra update history:
```bash
curl https://n2store-fallback.onrender.com/dynamic-headers/history?limit=10
```

## Admin Operations

### Set version manually (nếu cần):
```bash
curl -X POST https://n2store-fallback.onrender.com/dynamic-headers/set \
  -H "Content-Type: application/json" \
  -d '{
    "headerName": "tposappversion",
    "value": "5.13.0.1"
  }'
```

### Reset về defaults:
```bash
curl -X POST https://n2store-fallback.onrender.com/dynamic-headers/reset
```

## Lưu ý quan trọng

1. **Không hardcode version nữa** - Luôn sử dụng `window.TPOS_CONFIG?.tposAppVersion || fallback`
2. **Fallback là bắt buộc** - Để đảm bảo app hoạt động khi dynamic fetch fail
3. **Nginx limitations** - Nginx không thể dynamic fetch, nên dùng `$http_tposappversion` để forward client headers
4. **Auto-learning** - Backend tự động học version mới từ TPOS responses
5. **Rate limiting** - Updates có cooldown 1 giờ để tránh spam

## Monitoring

Xem logs để theo dõi dynamic headers:
```
[TPOS-CONFIG] ✅ Dynamic headers loaded: 5.12.29.1
[DYNAMIC-HEADERS] 🔄 Updated tposappversion: (none) → 5.12.29.1
[DYNAMIC-HEADERS] 💾 Saved headers to file
```

## Troubleshooting

### Problem: Frontend không fetch được dynamic headers
**Solution:** Kiểm tra fallbackApiUrl trong [js/tpos-config.js](js/tpos-config.js:21)

### Problem: Version cũ vẫn được sử dụng
**Solution:**
1. Kiểm tra backend có version mới chưa: `GET /dynamic-headers`
2. Clear browser cache và reload page
3. Manually set version qua API nếu cần

### Problem: Backend không update version mới
**Solution:**
1. Kiểm tra `dynamic-headers.json` file có writable không
2. Xem logs để check learning process
3. Manually set version qua API
