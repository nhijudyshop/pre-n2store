# SHARED_TPOS - Tích Hợp TPOS API

> Modules quản lý TPOS integration: token, API proxy, product data.

## Tổng Quan

| File | Folders | Ghi chú |
|------|---------|---------|
| `tpos-search.js` | purchase-orders | Multi-company, SwitchCompany, refresh_token |
| `token-manager.js` | orders-report | Company-aware (read from `bearer_token_data_{companyId}`) |
| `tpos-token-manager.js` | tpos-pancake | Company-aware (same as above) |
| `shared/browser/token-manager.js` | ES module source of truth | Parameterized, defaults to company-aware |
| `api-config.js` | orders-report, tpos-pancake, customer-hub | |

---

## Multi-Company Token System

### Companies

| CompanyId | Name | ShopConfig ID |
|-----------|------|---------------|
| 1 | NJD Live | `njd-live` |
| 2 | NJD Shop | `njd-shop` |

### localStorage Keys

| Key | Mô tả |
|-----|-------|
| `bearer_token_data_1` | Token Company 1 (NJD Live) |
| `bearer_token_data_2` | Token Company 2 (NJD Shop) |
| `n2store_selected_shop` | Shop đang chọn: `njd-live` hoặc `njd-shop` |

> **Legacy:** `bearer_token_data` (không có suffix) sẽ được tự động migrate sang `bearer_token_data_1` khi TokenManager khởi tạo.

### Firestore Documents (`tokens` collection)

| Document | CompanyId | Mô tả |
|----------|-----------|-------|
| `tpos_token` | 1 | Token Company 1 (backward compat) |
| `tpos_token_2` | 2 | Token Company 2 |

### Token Data Format

```javascript
{
  "access_token": "eyJhb...",
  "refresh_token": "abc123...",   // Quan trọng - dùng cho token refresh
  "token_type": "Bearer",
  "expires_in": 86400,
  "expires_at": 1772695000000,    // Unix ms
  "issued_at": 1772608600000
}
```

### Company ID Resolution

Tất cả TokenManager đều xác định company bằng:

```javascript
static getCompanyId() {
    // 1. ShopConfig (chỉ có trên purchase-orders page)
    if (window.ShopConfig?.getConfig) return window.ShopConfig.getConfig().CompanyId || 1;
    // 2. localStorage (available everywhere)
    const shop = localStorage.getItem('n2store_selected_shop');
    return shop === 'njd-shop' ? 2 : 1;
}
```

---

## Token Flows

### Flow 1: purchase-orders (`tpos-search.js`)

```
1. localStorage['bearer_token_data_{companyId}'] → valid?
2. Nếu expired → Firestore tokens/tpos_token[_{id}] → valid?
3. Nếu expired → Try refresh_token (grant_type=refresh_token)
4. Nếu fail → Password login → Company 1 token
5. Nếu companyId !== 1 → SwitchCompany(companyId) → Company N token
6. Save → localStorage + Firestore
```

### Flow 2: orders-report, tpos-pancake (`token-manager.js`)

```
1. Auto-migrate: bearer_token_data → bearer_token_data_1
2. localStorage['bearer_token_data_{companyId}'] → valid?
3. Nếu expired → Firestore tokens/tpos_token[_{id}] → valid?
4. Nếu expired → Password login → Save (preserve refresh_token)
```

### 401 Error Handling

```
1. Clear in-memory token
2. Invalidate localStorage (set expires_at: 0, keep refresh_token)
3. Try refresh_token → nếu fail → Password login + SwitchCompany
4. Retry original request
```

---

## TokenManager Methods

| Method | Mô tả |
|--------|-------|
| `tokenManager.getToken()` | Lấy token (auto refresh nếu expired) |
| `tokenManager.getAuthHeader()` | Trả về `{ Authorization: 'Bearer xxx' }` |
| `tokenManager.authenticatedFetch(url, options)` | Fetch với auto token + 401 retry |
| `tokenManager.refresh()` | Force refresh token |
| `tokenManager.getTokenInfo()` | Thông tin token hiện tại |

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
| `/api/odata/FastPurchaseOrder` | Tạo đơn mua hàng |
| `/api/odata/FastPurchaseOrderLine/ODataService.PurchaseByExcel` | Import Excel |
| `/api/odata/DeliveryCarrier` | Đối tác giao hàng |
| `/api/odata/Partner` | Khách hàng / NCC |
| `/api/odata/ApplicationUser` | Users |
| `/api/odata/ApplicationUser/ODataService.SwitchCompany` | Chuyển công ty |
| `/api/odata/CRMTeam/ODataService.GetAllFacebook` | Facebook pages |

---

## Headers Required

```javascript
{
  'Authorization': 'Bearer {access_token}',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'feature-version': '2',
  'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '6.2.6.1'
}
```

---

## Per-Company TPOS Config (Purchase Orders)

Đơn mua hàng cần các ID khác nhau theo công ty:

| Config | Company 1 (NJD Live) | Company 2 (NJD Shop) |
|--------|---------------------|---------------------|
| JournalId | 4 | 11 |
| AccountId | 4 | 32 |
| PickingTypeId | 1 | 5 |
| PaymentJournalId | 1 | 8 |
| WarehouseId | 1 | 2 |

Hardcoded trong `purchase-orders/js/lib/tpos-purchase.js` → `STATIC.Config`

---

## Xem thêm

- [purchase-orders/js/lib/tpos-search.js](../../purchase-orders/js/lib/tpos-search.js) - Multi-company token (source of truth)
- [orders-report/js/core/token-manager.js](../../orders-report/js/core/token-manager.js) - Company-aware TokenManager
- [shared/browser/token-manager.js](../../shared/browser/token-manager.js) - ES module source of truth
- [cloudflare-worker/worker.js](../../cloudflare-worker/worker.js) - CORS proxy
- [guides/DYNAMIC_HEADERS_GUIDE.md](../guides/DYNAMIC_HEADERS_GUIDE.md) - Dynamic tposappversion
