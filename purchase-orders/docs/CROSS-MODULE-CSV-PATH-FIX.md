# Lỗi CSV Path 404 khi dùng purchase-orders modules từ page khác

## Nguyên nhân gốc

Khi các module JS của `purchase-orders/` được load từ page khác (ví dụ `orders-report/tab-social-orders.html`), các file CSV được fetch bằng **relative path** sẽ resolve sai.

### Ví dụ cụ thể

Page: `https://domain.com/orders-report/tab-social-orders.html`

Script tag load đúng (dùng `../`):
```html
<script src="../purchase-orders/js/lib/tpos-product-creator.js"></script>
```

Nhưng bên trong JS, code fetch CSV:
```js
// tpos-product-creator.js dòng 20
const _csvBase = window.location.pathname.includes('/purchase-orders/') ? '' : 'purchase-orders/';
const ATTR_VALUES_CSV = `${_csvBase}product_attribute_values_rows.csv`;
// → resolve thành: /orders-report/purchase-orders/product_attribute_values_rows.csv → 404!
```

**Lý do**: `fetch()` resolve relative path dựa trên `window.location` (URL của page), KHÔNG phải vị trí file JS. Khi page là `/orders-report/...`, path `purchase-orders/xxx.csv` trở thành `/orders-report/purchase-orders/xxx.csv` — file không tồn tại.

### Sơ đồ minh họa

```
Cấu trúc thư mục:
n2store/
├── purchase-orders/
│   ├── product_attribute_values_rows.csv   ← file CSV nằm ở đây
│   ├── product_attributes_rows.csv
│   ├── products_rows.csv
│   └── js/
│       ├── lib/
│       │   └── tpos-product-creator.js     ← fetch CSV bằng relative path
│       ├── dialogs.js                       ← fetch CSV bằng relative path
│       └── main.js                          ← fetch CSV bằng relative path
└── orders-report/
    └── tab-social-orders.html               ← load JS từ ../purchase-orders/
```

```
Khi chạy từ /purchase-orders/:
  fetch('product_attribute_values_rows.csv')
  → /purchase-orders/product_attribute_values_rows.csv ✅

Khi chạy từ /orders-report/:
  fetch('purchase-orders/product_attribute_values_rows.csv')
  → /orders-report/purchase-orders/product_attribute_values_rows.csv ❌ 404!

Fix đúng:
  fetch('../purchase-orders/product_attribute_values_rows.csv')
  → /purchase-orders/product_attribute_values_rows.csv ✅
```

---

## Danh sách các chỗ cần sửa

### 1. `purchase-orders/js/lib/tpos-product-creator.js` — dòng 20

**Trạng thái**: ❌ Cần sửa

```js
// SAI — 'purchase-orders/' resolve thành /orders-report/purchase-orders/
const _csvBase = window.location.pathname.includes('/purchase-orders/') ? '' : 'purchase-orders/';

// ĐÚNG
const _csvBase = window.location.pathname.includes('/purchase-orders/') ? '' : '../purchase-orders/';
```

**File CSV bị ảnh hưởng**:
- `product_attribute_values_rows.csv`
- `product_attributes_rows.csv`

**Tác động**: TPOS sync thất bại hoàn toàn khi lưu đơn hàng từ tab Social.

---

### 2. `purchase-orders/js/dialogs.js` — dòng 331-332 (VariantGeneratorDialog.loadCSVData)

**Trạng thái**: ❌ Cần sửa

```js
// SAI
const basePath = window.location.pathname.includes('/purchase-orders/')
    ? '' : 'purchase-orders/';

// ĐÚNG
const basePath = window.location.pathname.includes('/purchase-orders/')
    ? '' : '../purchase-orders/';
```

**File CSV bị ảnh hưởng**:
- `product_attributes_rows.csv`
- `product_attribute_values_rows.csv`

**Tác động**: Dialog tạo biến thể không load được danh sách thuộc tính (Màu, Size) khi mở từ tab Social. Fallback về hardcoded values (không có UUID → TPOS sync sẽ thiếu attribute mapping).

---

### 3. `purchase-orders/js/main.js` — dòng 48 (loadProductsCSV)

**Trạng thái**: ⚠️ Cần sửa NẾU dùng từ page khác

```js
// Hiện tại — hardcoded relative, không có path detection
const response = await fetch('products_rows.csv');
// Từ /orders-report/ → /orders-report/products_rows.csv → 404!

// ĐÚNG — thêm path detection giống pattern trên
const _csvBase = window.location.pathname.includes('/purchase-orders/') ? '' : '../purchase-orders/';
const response = await fetch(`${_csvBase}products_rows.csv`);
```

**Tác động**: Hàm `loadProductsCSV()` dùng cho export Excel (variant lookup). Hiện chưa gọi từ tab Social nhưng sẽ lỗi nếu tương lai cần dùng.

---

## Tổng kết file cần sửa

| File | Dòng | Pattern sai | Ảnh hưởng | Ưu tiên |
|------|------|-------------|-----------|---------|
| `tpos-product-creator.js` | 20 | `'purchase-orders/'` → `'../purchase-orders/'` | TPOS sync 404 | 🔴 Cao |
| `tpos-product-creator.min.js` | 1 | `"purchase-orders/"` → `"../purchase-orders/"` | TPOS sync 404 | 🔴 Cao |
| `dialogs.js` | 332 | `'purchase-orders/'` → `'../purchase-orders/'` | Variant dialog 404 | 🔴 Cao |
| `dialogs.min.js` | 1 | `"purchase-orders/"` → `"../purchase-orders/"` | Variant dialog 404 | 🔴 Cao |
| `main.js` | 48 | Hardcoded `'products_rows.csv'` | Export CSV 404 | 🟡 Trung bình |

---

## Các module KHÔNG bị ảnh hưởng

| File | Lý do |
|------|-------|
| `tpos-search.js` | Chỉ fetch API URLs tuyệt đối (TPOS proxy) |
| `product-code-generator.js` | Không fetch file local, chỉ dùng Firestore + TPOS API |
| `supplier-detector.js` | Không fetch file local |
| `config.js` | Không fetch file local |
| `service.js` | Không fetch file local, chỉ dùng Firestore |
| `form-modal.js` | Không fetch file local |
| `ncc-manager.js` | Chỉ fetch TPOS API |
| `tpos-purchase.js` | Chỉ fetch TPOS API |

---

## Quy tắc cho tương lai

Khi viết code trong `purchase-orders/` mà cần fetch file local (CSV, JSON, etc.):

```js
// ✅ Pattern đúng — hỗ trợ cross-module reuse
const _base = window.location.pathname.includes('/purchase-orders/') ? '' : '../purchase-orders/';
fetch(`${_base}my-file.csv`);

// ❌ KHÔNG dùng — sẽ 404 từ page khác
fetch('my-file.csv');
fetch('purchase-orders/my-file.csv');
```
