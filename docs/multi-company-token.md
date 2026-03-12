# Multi-Company Token System

## Tổng quan

N2store có 2 công ty trên TPOS:
- **NJD LIVE** — CompanyId: `1` (mặc định)
- **NJD SHOP** — CompanyId: `2`

User chọn company qua dropdown ở sidebar → ShopConfig → TokenManager dùng token đúng company.

## ShopConfig — Nguồn duy nhất cho CompanyId

**File:** `shared/js/shop-config.js` (load NON-deferred, trước token-manager)
**Backup:** Cũng có trong `navigation-modern.js` (guard `window.ShopConfig = window.ShopConfig || ...`)

```
window.ShopConfig.getConfig()       → { id, label, CompanyId }
window.ShopConfig.getSelectedShopId() → 'njd-live' | 'njd-shop'
window.ShopConfig.setShop(shopId)   → lưu localStorage + dispatch 'shopChanged'
window.ShopConfig.getShops()        → [{ id, label }, ...]
```

- localStorage key: `n2store_selected_shop`
- Khi đổi shop → dispatch `CustomEvent('shopChanged')` → page reload (trừ purchase-orders dùng `window._shopChangeNoReload`)

**QUAN TRỌNG:** `getCompanyId()` trong TokenManager **chỉ** dùng ShopConfig, KHÔNG đọc trực tiếp localStorage:
```js
static getCompanyId() {
    return window.ShopConfig?.getConfig?.()?.CompanyId || 1;
}
```

## Thứ tự load HTML

```
shop-config.js (non-defer) → token-manager.js → navigation-modern.js (defer)
```

Phải load `shop-config.js` TRƯỚC `token-manager.js` vì TokenManager constructor gọi `getCompanyId()`.

## Token Storage

| Company | localStorage key | Firestore doc |
|---------|-----------------|---------------|
| 1 (NJD LIVE) | `bearer_token_data_1` | `tokens/tpos_token` |
| 2 (NJD SHOP) | `bearer_token_data_2` | `tokens/tpos_token_2` |

Mỗi token chứa:
```json
{
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "Bearer",
    "expires_in": 86400,
    "expires_at": 1709712000000,
    "issued_at": 1709625600000
}
```

## Token Flow — `getToken()`

```
getToken()
  ├── Token còn hạn? → return (0 request)
  └── Hết hạn → fetchNewToken()
        ├── Step 1: refreshWithToken(refresh_token của company đang chọn)
        │   POST /api/token { grant_type=refresh_token }
        │   → OK → return token
        │
        ├── Step 2: refresh fail → passwordLogin()
        │   POST /api/token { grant_type=password, username=nvkt }
        │   → Luôn trả Company 1 token → lưu bearer_token_data_1
        │
        └── Step 3: companyId !== 1 → switchCompanyToken()
            POST /api/odata/.../SwitchCompany { companyId: 2 }
            POST /api/token { grant_type=refresh_token }
            → Trả Company 2 token → lưu bearer_token_data_2
```

## 401 Handling — `authenticatedFetch()`

```
Request → 401
  → invalidateAccessToken() (xóa access_token, GIỮ refresh_token)
  → getToken() → fetchNewToken() (refresh)
  → Retry request với token mới
```

`invalidateAccessToken()` lưu `{ refresh_token, expires_at: 0 }` vào localStorage để lần sau dùng refresh_token mà không cần login lại.

## 3 TokenManager Implementations

| File | Dùng ở | Khác biệt |
|------|--------|-----------|
| `orders-report/js/core/token-manager.js` | orders-report, hanghoan, supplier-debt, invoice-compare, issue-tracking, customer-hub, balance-history | Có UI notification (toast) |
| `tpos-pancake/js/tpos-token-manager.js` | tpos-pancake | Có UI notification |
| `shared/browser/token-manager.js` | ES module version (source of truth) | Không có notification |

Cả 3 cùng logic, cùng `getCompanyId()` từ ShopConfig.

## TPOSClient (purchase-orders)

**File:** `purchase-orders/js/lib/tpos-search.js` → `window.TPOSClient`

Có token logic riêng (không dùng class TokenManager) nhưng cùng flow:
- `getCompanyId()` → `window.ShopConfig?.getConfig()?.CompanyId || 1`
- Token per-company: `bearer_token_data_{companyId}`
- `authenticatedFetch()` với 401 retry

## Nguyên tắc Token (KHÔNG ĐƯỢC VI PHẠM)

1. **Chỉ dùng token của company đang chọn** — không fallback sang token company khác
2. **CompanyId chỉ lấy từ ShopConfig** — không đọc trực tiếp `localStorage.getItem('n2store_selected_shop')`
3. **Hết hạn → refresh token đó** — dùng refresh_token của đúng company
4. **Không fallback localStorage** — dùng `tokenManager.getToken()` hoặc `TPOSClient.getToken()`, không đọc trực tiếp `bearer_token_data_*`

## Pages & Token Manager

| Page | Token source | HTML loads |
|------|-------------|------------|
| orders-report (tab1, tab2, tab3, overview, social) | `window.tokenManager` | shop-config.js + token-manager.js |
| purchase-orders | `window.TPOSClient` | shop-config.js (via lib/shop-config.js) + tpos-search.js |
| hanghoan | `window.tokenManager` | shop-config.js + token-manager.js |
| supplier-debt | `window.tokenManager` | shop-config.js + token-manager.js |
| invoice-compare | `window.tokenManager` | shop-config.js + token-manager.js |
| issue-tracking | `window.tokenManager` | shop-config.js + token-manager.js |
| customer-hub | `window.tokenManager` | shop-config.js + token-manager.js |
| balance-history | `window.tokenManager` | shop-config.js + token-manager.js |
| tpos-pancake | `window.tokenManager` | shop-config.js + tpos-token-manager.js |
| inbox | pancake-token-manager | shop-config.js + pancake-token-manager.js |

## TPOS API Headers

```js
{
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'feature-version': '2',
    'tposappversion': '6.2.6.1'
}
```

## Proxy

Tất cả TPOS request đi qua Cloudflare Worker proxy:
- Proxy URL: `https://chatomni-proxy.nhijudyshop.workers.dev`
- `/api/token` → `tomato.tpos.vn/token`
- `/api/odata/*` → `tomato.tpos.vn/odata/*`
- `/api/odata/ApplicationUser/ODataService.SwitchCompany` → switch company trên TPOS

## Credentials (hardcoded)

```js
{
    grant_type: 'password',
    username: 'nvkt',
    password: 'Aa@123456789',
    client_id: 'tmtWebApp'
}
```
