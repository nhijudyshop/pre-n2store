# SHARED_TPOS - Tích Hợp TPOS API

> Modules quản lý TPOS integration: token, API proxy, product data.

## Tổng Quan

| File | Folders |
|------|---------|
| `token-manager.js` | orders-report |
| `tpos-token-manager.js` | tpos-pancake |
| `api-config.js` | orders-report, tpos-pancake, customer-management |

---

## TokenManager (`token-manager.js`)

### Purpose
Quản lý TPOS Bearer Token với auto-refresh và Firebase sync.

### Methods

| Method | Mô tả |
|--------|-------|
| `tokenManager.getToken()` | Lấy token (auto refresh nếu expired) |
| `tokenManager.getAuthHeader()` | Trả về `{ Authorization: 'Bearer xxx' }` |
| `tokenManager.authenticatedFetch(url, options)` | Fetch với auto token |
| `tokenManager.refresh()` | Force refresh token |
| `tokenManager.getTokenInfo()` | Thông tin token hiện tại |

### Token Flow

```
1. localStorage['bearer_token_data'] → Check expired?
2. Nếu expired → Firebase → Check expired?
3. Nếu expired → Fetch từ TPOS /token API
4. Save → localStorage + Firebase
```

### Storage Keys

| Key | Priority | Mô tả |
|-----|----------|-------|
| `bearer_token_data` | 1 | Key chính TPOS |
| `auth` | 2 | Fallback |
| `tpos_token` | 3 | Fallback |

---

## API Proxy (Cloudflare Worker)

> **QUAN TRỌNG:** Tất cả TPOS API calls PHẢI đi qua proxy để bypass CORS.

### Proxy URL

```
https://chatomni-proxy.nhijudyshop.workers.dev
```

**Worker source:** `cloudflare-worker/worker.js`

### Route Mapping

| Client Request | Target |
|----------------|--------|
| `/api/odata/*` | `tomato.tpos.vn/odata/*` |
| `/api/token` | `tomato.tpos.vn/token` (cached) |
| `/api/Product/ExportFileWithVariantPrice` | Giá bán (Excel) |
| `/api/Product/ExportFileWithStandardPriceV2` | Giá vốn (Excel) |
| `/api/pancake/*` | `pancake.vn/api/v1/*` |
| `/api/sepay/*` | `n2store-fallback.onrender.com/api/sepay/*` |
| `/api/customers/*` | `n2store-fallback.onrender.com/api/customers/*` |

### Usage Example

```javascript
// ❌ SAI - Bị CORS block
fetch('https://tomato.tpos.vn/odata/DeliveryCarrier...')

// ✅ ĐÚNG - Qua proxy
fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/DeliveryCarrier...')
```

---

## Common TPOS Endpoints

| Endpoint | Mô tả |
|----------|-------|
| `/api/odata/SaleOnline_Order` | Đơn hàng online |
| `/api/odata/Product({id})` | Chi tiết sản phẩm |
| `/api/odata/DeliveryCarrier` | Đối tác giao hàng |
| `/api/odata/Partner` | Khách hàng |
| `/api/odata/ApplicationUser` | Users |
| `/api/odata/CRMTeam/ODataService.GetAllFacebook` | Facebook pages |

---

## Headers Required

```javascript
{
  'Authorization': 'Bearer {access_token}',
  'Content-Type': 'application/json',
  'tposappversion': '5.11.16.1'
}
```

---

## Xem thêm

- [orders-report/token-manager.js](file:///Users/mac/Downloads/n2store/orders-report/token-manager.js)
- [orders-report/api-config.js](file:///Users/mac/Downloads/n2store/orders-report/api-config.js)
- [cloudflare-worker/worker.js](file:///Users/mac/Downloads/n2store/cloudflare-worker/worker.js)
