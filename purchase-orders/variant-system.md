# Hệ Thống Variant (Biến Thể Sản Phẩm)

## 1. Tổng Quan Kiến Trúc

Hệ thống variant quản lý các biến thể sản phẩm (màu sắc, size) với 3 lớp chính:

```
┌─────────────────────────────────────────────────────────┐
│                    UI COMPONENTS                         │
│  VariantSelectorDialog │ VariantDropdownSelector        │
│  VariantGeneratorDialog │ ProductList │ LiveProducts     │
├─────────────────────────────────────────────────────────┤
│                   UTILITY LAYER                          │
│  variant-utils.ts │ variant-display-utils.ts            │
│  tpos-variant-converter.ts │ attribute-sort-utils.ts    │
├─────────────────────────────────────────────────────────┤
│                   DATA LAYER                             │
│  3 JSON files (TPOS cache) │ 3 CSV files │ TPOS API    │
│  use-product-variants.ts │ product-variants-fetcher.ts  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Dữ Liệu Gốc - 3 File JSON

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_mau.json` - Thuộc tính Màu sắc

- **AttributeId**: `3`
- **AttributeName**: `"Màu"`
- **Tổng**: 74 giá trị
- **Ví dụ**: Trắng (`trang`), Đen (`den`), Đỏ (`do`), Vàng (`vang`), Xanh Dương (`xanhduong`), Hồng Đào (`hongdao`)...
- **Nguồn OData**: `http://tomato.tpos.vn/odata/$metadata#ProductAttributeValue`

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_sizeso.json` - Thuộc tính Size Số

- **AttributeId**: `4`
- **AttributeName**: `"Size Số"`
- **Tổng**: 21 giá trị
- **Dải giá trị**: 1, 2, 3, 4, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_sizechu.json` - Thuộc tính Size Chữ

- **AttributeId**: `1`
- **AttributeName**: `"Size Chữ"`
- **Tổng**: 6 giá trị
- **Giá trị**: S (Sequence 1), M (2), L (3), XL (4), XXL, XXXL

### Cấu trúc chung mỗi bản ghi

```json
{
  "Id": 6,
  "Name": "Trắng",
  "Code": "trang",
  "Sequence": null,
  "AttributeId": 3,
  "AttributeName": "Màu",
  "PriceExtra": null,
  "NameGet": "Màu: Trắng",
  "DateCreated": null
}
```

| Field         | Mô tả                                      |
| ------------- | ------------------------------------------- |
| Id            | TPOS ID duy nhất                            |
| Name          | Tên hiển thị                                |
| Code          | Mã code (slug)                              |
| Sequence      | Thứ tự sắp xếp (chỉ Size Chữ có giá trị)  |
| AttributeId   | ID nhóm thuộc tính (1, 3, hoặc 4)          |
| AttributeName | Tên nhóm ("Màu", "Size Số", "Size Chữ")    |
| PriceExtra    | Phụ phí thêm theo variant                   |
| NameGet       | Tên đầy đủ dạng "Nhóm: Giá trị"            |
| DateCreated   | Ngày tạo                                    |

---

## 3. Utility Functions

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant-utils.ts` - Xử lý chuỗi variant

#### 3.1 Parse / Format cơ bản

Định dạng variant string: `"tên_variant - mã_sản_phẩm"` (phân cách bằng ` - `)

| Hàm              | Đầu vào              | Đầu ra                                | Mô tả                          |
| ----------------- | --------------------- | ------------------------------------- | ------------------------------- |
| `parseVariant()`  | `"Size M - N152"`     | `{ name: "Size M", code: "N152" }`   | Tách variant thành tên + mã SP  |
| `formatVariant()` | `("Size M", "N152")`  | `"Size M - N152"`                     | Ghép tên + mã thành chuỗi      |
| `getVariantName()`| `"Size M - N152"`     | `"Size M"`                            | Lấy phần tên                   |
| `getVariantCode()`| `"Size M - N152"`     | `"N152"`                              | Lấy phần mã                    |

Các trường hợp đặc biệt:
- `null` / `undefined` / `""` → `{ name: "", code: "" }`
- `"- N152"` (không có tên) → `{ name: "", code: "N152" }`
- `"Size M"` (format cũ, không có ` - `) → `{ name: "Size M", code: "" }`

#### 3.2 `formatVariantFromAttributeValues()` - Ghép nhóm từ mảng phẳng

```
Input:  [{ AttributeName: "Size Số", Name: "1" }, { AttributeName: "Màu", Name: "Nude" }]

Parent (isParent=true):  "(1) (Nude)"           ← dùng | phân cách, có ngoặc
Child  (isParent=false): "1 Nude"               ← dùng dấu phẩy, không ngoặc
```

- **Parent format**: `"(VALUE1 | VALUE2) (VALUEA | VALUEB)"` - dùng cho sản phẩm cha, liệt kê tất cả variant
- **Child format**: `"VALUE1, VALUE2 VALUEA"` - dùng cho sản phẩm con, chỉ hiện giá trị cụ thể

#### 3.3 `formatVariantFromTPOSAttributeLines()` - Ghép nhóm từ cấu trúc lồng

```
Input:  product.AttributeLines (nested { Attribute, Values[] })
Output: "(Cam | Đỏ | Vàng) (S | M | L)"
```

Khác biệt với `formatVariantFromAttributeValues`:
- `AttributeValues`: Mảng phẳng `{ AttributeName, Name }`
- `AttributeLines`: Cấu trúc lồng `{ Attribute, Values[] }` từ TPOS API

---

### `/Users/mac/Downloads/github-html-starter-main/src/lib/variant-display-utils.ts` - Hiển thị UI

#### `formatVariantForDisplay()`

```
Input:  "(1 | 2) (Nude | Nâu | Hồng)"
Output: "1 | 2 | Nude | Nâu | Hồng"
```

Bỏ ngoặc đơn, gộp tất cả giá trị thành 1 chuỗi phẳng phân cách bằng ` | ` cho hiển thị trên bảng danh sách sản phẩm.

---

## 4. Tương Tác Với TPOS API

### `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-variant-converter.ts`

#### 4.1 `convertVariantsToAttributeLines()` - Chuyển UI → TPOS format

```
Chuỗi UI:  "(Đỏ | Xanh) (S | M)"
     ↓ Regex parse ra từng nhóm: ["(Đỏ | Xanh)", "(S | M)"]
     ↓ Tách ra từng giá trị: ["Đỏ", "Xanh", "S", "M"]
     ↓ Query CSV file product_attribute_values_rows.csv (WHERE value IN (...))
     ↓ Group theo tpos_attribute_id
     ↓
TPOS API Format:
[
  {
    "Attribute": { "Id": 3 },
    "AttributeId": 3,
    "Values": [
      { "Id": 8,  "Name": "Đỏ",   "AttributeName": "Màu", ... },
      { "Id": 17, "Name": "Xanh",  "AttributeName": "Màu", ... }
    ]
  },
  {
    "Attribute": { "Id": 1 },
    "AttributeId": 1,
    "Values": [
      { "Id": 1, "Name": "S", "AttributeName": "Size Chữ", ... },
      { "Id": 2, "Name": "M", "AttributeName": "Size Chữ", ... }
    ]
  }
]
```

#### 4.2 `generateProductVariants()` - Tạo tổ hợp biến thể

```
Input:  AttributeLines gồm Màu(Đỏ, Xanh) + Size(S, M)
     ↓ Tích Descartes (Cartesian Product)
     ↓
Output: 4 variant objects:
  - "Đỏ, S"    → Name: "Áo Thun (Đỏ, S)"
  - "Đỏ, M"    → Name: "Áo Thun (Đỏ, M)"
  - "Xanh, S"  → Name: "Áo Thun (Xanh, S)"
  - "Xanh, M"  → Name: "Áo Thun (Xanh, M)"
```

Mỗi variant được tạo ra là 1 object đầy đủ ~60 fields theo đúng format TPOS API:

```
Id, EAN13, DefaultCode, NameTemplate, ProductTmplId, UOMId, QtyAvailable,
NameGet, Price, Barcode, Image, PriceVariant, SaleOK, PurchaseOK, ListPrice,
StandardPrice, Weight, Type, CategId, Active, ... AttributeValues (cuối cùng)
```

---

## 5. Truy Vấn Dữ Liệu

### `/Users/mac/Downloads/github-html-starter-main/src/hooks/use-product-variants.ts` - React Query Hook

```typescript
useProductVariants("N152")
```

Query từ CSV file `products_rows.csv`:
```sql
SELECT id, product_code, product_name, variant, product_images,
       tpos_image_url, stock_quantity, base_product_code
FROM products_rows.csv
WHERE base_product_code = 'N152'
  AND variant IS NOT NULL
  AND variant != ''
  AND product_code != 'N152'    -- Loại bỏ sản phẩm gốc
ORDER BY created_at ASC
```

Interface trả về:
```typescript
interface ProductVariant {
  id: string;
  product_code: string;
  product_name: string;
  variant: string;
  product_images: string[] | null;
  tpos_image_url: string | null;
  stock_quantity: number;
  base_product_code: string | null;
}
```

### `/Users/mac/Downloads/github-html-starter-main/src/lib/product-variants-fetcher.ts` - Fetch Logic

Hai chiến lược tìm variant dựa trên tên sản phẩm:

```
fetchProductVariants("ABC123")
     │
     ├─ CASE 1: product_name chứa "-"
     │    → Cắt lấy phần trước "-" (base name)
     │    → Ưu tiên cắt theo ' - ' (có space), fallback '-'
     │    → Tìm tất cả SP có tên bắt đầu bằng base name (ILIKE prefix%)
     │
     └─ CASE 2: product_name KHÔNG chứa "-"
          → Lấy base_product_code (hoặc product_code nếu không có)
          → Tìm tất cả SP có cùng base_product_code
          → variant IS NOT NULL AND variant != ''
          → Ghép: sản phẩm gốc + tất cả variant
```

---

## 6. Database (CSV files từ TPOS export)

### `product_attributes_rows.csv`
**Đường dẫn**: `/Users/mac/Downloads/n2store/purchase-orders/product_attributes_rows.csv`
**Tổng**: 3 bản ghi (Màu, Size Số, Size Chữ)

| Column        | Type    | Mô tả                         |
| ------------- | ------- | ------------------------------ |
| id            | UUID    | Primary key                    |
| name          | string  | Tên thuộc tính (Màu, Size...) |
| display_order | number  | Thứ tự hiển thị               |
| is_active     | boolean | Trạng thái hoạt động          |
| created_at    | string  | Ngày tạo                      |
| updated_at    | string  | Ngày cập nhật                 |

### `product_attribute_values_rows.csv`
**Đường dẫn**: `/Users/mac/Downloads/n2store/purchase-orders/product_attribute_values_rows.csv`

| Column            | Type         | Mô tả                           |
| ----------------- | ------------ | -------------------------------- |
| id                | UUID         | Primary key                      |
| attribute_id      | UUID (FK)    | → product_attributes.id          |
| value             | string       | Giá trị (Đỏ, M, 36...)          |
| code              | string/null  | Mã code (slug)                   |
| price_extra       | number/null  | Phụ phí theo variant             |
| name_get          | string/null  | Tên đầy đủ "Nhóm: Giá trị"     |
| sequence          | number/null  | Thứ tự TPOS                     |
| display_order     | number       | Thứ tự hiển thị                 |
| tpos_id           | number/null  | ID mapping sang TPOS             |
| tpos_attribute_id | number/null  | Attribute ID mapping sang TPOS   |
| is_active         | boolean      | Trạng thái hoạt động            |
| created_at        | string       | Ngày tạo                        |
| updated_at        | string       | Ngày cập nhật                   |

### `products_rows.csv`
**Đường dẫn**: `/Users/mac/Downloads/n2store/purchase-orders/products_rows.csv`

| Column             | Type        | Mô tả                                        |
| ------------------ | ----------- | --------------------------------------------- |
| id                 | UUID        | Primary key                                   |
| product_code       | string      | Mã sản phẩm                                  |
| product_name       | string      | Tên sản phẩm                                 |
| variant            | string/null | Chuỗi variant, VD: `"(Đỏ \| Xanh) (S \| M)"` |
| selling_price      | number      | Giá bán                                       |
| purchase_price     | number      | Giá mua                                       |
| unit               | string      | Đơn vị tính                                   |
| category           | string      | Danh mục                                      |
| barcode            | string      | Mã vạch                                       |
| stock_quantity     | number      | Số lượng tồn kho                              |
| supplier_name      | string      | Tên nhà cung cấp                              |
| product_images     | json        | Ảnh sản phẩm (mảng URL)                      |
| price_images       | json        | Ảnh giá                                       |
| created_at         | string      | Ngày tạo                                      |
| updated_at         | string      | Ngày cập nhật                                 |
| tpos_image_url     | string/null | URL ảnh từ TPOS                               |
| tpos_product_id    | number/null | ID sản phẩm trên TPOS                        |
| productid_bienthe  | number/null | ID sản phẩm cha (biến thể) trên TPOS         |
| base_product_code  | string/null | Mã sản phẩm cha (liên kết các variant)       |
| virtual_available  | number      | Số lượng khả dụng ảo                          |

---

## 7. UI Components

### `/Users/mac/Downloads/github-html-starter-main/src/components/products/VariantSelectorDialog.tsx`

Dialog chọn variant dạng multi-column grid:

```
┌──────────────────────────────────────────────┐
│  Chọn Variant                            [X] │
├──────────────┬───────────────┬───────────────┤
│  Màu         │  Size Số      │  Size Chữ     │
│  [🔍 Tìm...] │  [🔍 Tìm...]  │  [🔍 Tìm...]  │
│  ☑ Đỏ       │  ☑ 36        │  ☑ S          │
│  ☑ Xanh     │  ☑ 37        │  ☐ M          │
│  ☐ Vàng     │  ☐ 38        │  ☐ L          │
│  ☐ Trắng    │  ☐ 39        │  ☐ XL         │
│  ...         │  ...          │  ...          │
├──────────────┴───────────────┴───────────────┤
│  Đã chọn: [Đỏ ×] [Xanh ×] [36 ×] [37 ×]   │
│                                              │
│  Output: "(Đỏ | Xanh) (36 | 37) (S)"        │
│                              [Hủy] [Xác nhận]│
└──────────────────────────────────────────────┘
```

- Mỗi cột = 1 nhóm thuộc tính
- Có ô search để lọc nhanh
- Badges hiển thị giá trị đã chọn (click × để bỏ)
- Dùng trong: `EditTPOSProductDialog`

### `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantDropdownSelector.tsx`

- Popover-based dropdown cho purchase order
- Hiển thị badge số lượng variant
- Props: `baseProductCode`, `value`, `onChange`, `onVariantSelect`

### `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantGeneratorDialog.tsx`

- Chọn nhiều thuộc tính → tính tích Descartes tất cả tổ hợp
- Sắp xếp thông minh qua `/Users/mac/Downloads/github-html-starter-main/src/lib/attribute-sort-utils.ts`:
  - **Màu**: thứ tự chuẩn (Trắng → Đen → Đỏ → Xanh...)
  - **Size Số**: tăng dần (27, 28, 29...)
  - **Size Chữ**: S → M → L → XL → XXL → XXXL
- Checkbox chọn tổ hợp mong muốn

### Attribute Management Components

| Component                            | Đường dẫn                                                                                                    | Vai trò                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `AttributeValueTable`                | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/AttributeValueTable.tsx`     | Bảng hiển thị + sắp xếp + xóa |
| `CreateEditAttributeValueDialog`     | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/CreateEditAttributeValueDialog.tsx` | Tạo/sửa giá trị thuộc tính    |
| `ImportAttributesDialog`             | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/ImportAttributesDialog.tsx`  | Import hàng loạt               |

---

## 8. Variant Trong Purchase Order (Đơn Nhập Hàng) - Chi Tiết Từng Bước

### 8.1 Tổng quan luồng

```
User chọn sản phẩm → Mở VariantGeneratorDialog → Chọn thuộc tính (Màu, Size)
  → Tính tích Descartes → Chọn tổ hợp → Tạo N dòng variant items
  → Mỗi dòng lưu selectedAttributeValueIds (UUID[])
  → Lưu DB: purchase_order_items.selected_attribute_value_ids
  → Background: Tạo sản phẩm variant trên TPOS API
```

### 8.2 State Variables

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

```typescript
// Line 440-447
const [isSelectProductOpen, setIsSelectProductOpen] = useState(false);
const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);
const [isVariantGeneratorOpen, setIsVariantGeneratorOpen] = useState(false);
const [variantGeneratorIndex, setVariantGeneratorIndex] = useState<number | null>(null);
const [showDebugColumn, setShowDebugColumn] = useState(false);
```

### 8.3 Bước 1: Thêm sản phẩm vào đơn

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

#### Cách 1: Bấm nút `[+ Thêm sản phẩm]` (line 2006-2009)
```
User bấm → onClick: addItem()
  → Thêm 1 dòng trống vào mảng items[]
  → User nhập tay: tên SP, mã SP, giá...
```
- **Icon**: `<Plus />` + text "Thêm sản phẩm"
- **Handler**: `addItem()` — push 1 item rỗng vào `items` state

#### Cách 2: Bấm nút `[📦 Chọn từ Kho SP]` (line 2010-2018)
```
User bấm → onClick: openSelectProduct(index)
  → State: isSelectProductOpen = true, currentItemIndex = index
  → Mở SelectProductDialog
  → User chọn sản phẩm từ kho
  → Tự điền: tên SP, mã SP, giá mua, giá bán, ảnh...
```
- **Icon**: `<Warehouse />` + text "Chọn từ Kho SP"
- **Handler**: `openSelectProduct(items.length > 0 && items[items.length - 1].product_name ? items.length : items.length - 1)`

### 8.4 Bước 2: Tạo biến thể cho sản phẩm

#### Bấm vào ô "Biến thể" trên mỗi dòng (line 2080-2103)

```
┌─────────────────────┐
│ Nhấn để tạo biến thể │  ← khi chưa có variant
│         HOẶC         │
│ Nude, XXXL       ✏️  │  ← khi đã có variant
│ ✓ 3 thuộc tính đã   │
│   chọn               │
└─────────────────────┘
```

**Text hiển thị**:
- Chưa có variant: `"Nhấn để tạo biến thể"` (line 2081)
- Đã có variant: hiển thị chuỗi variant (VD: `"Nude, XXXL"`) + icon `✏️ Pencil`

**onClick handler** (line 2085-2088):
```typescript
onClick={() => {
  setVariantGeneratorIndex(index);  // Ghi nhớ dòng nào đang edit
  setIsVariantGeneratorOpen(true);  // Mở VariantGeneratorDialog
}}
```

**Badge "✓ X thuộc tính đã chọn"** (line 2098-2102):
```typescript
// Hiển thị khi selectedAttributeValueIds.length > 0
<Badge variant="secondary" className="text-xs">
  ✓ {item.selectedAttributeValueIds.length} thuộc tính đã chọn
</Badge>
```
- Số đếm = `selectedAttributeValueIds.length` (số UUID trong mảng)

### 8.5 Bước 3: VariantGeneratorDialog - Chọn thuộc tính

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantGeneratorDialog.tsx`

#### 8.5.1 Load dữ liệu (line 46)
```typescript
const { attributes, attributeValues, isLoading } = useProductAttributes();
// → Query CSV: product_attributes_rows.csv + product_attribute_values_rows.csv
// → attributes = [{ id, name: "Màu" }, { id, name: "Size Số" }, { id, name: "Size Chữ" }]
// → attributeValues = [{ id: "uuid", value: "Đỏ", attribute_id: "..." }, ...]
```

#### 8.5.2 State variables (line 42-44)
```typescript
const [selectedValues, setSelectedValues] = useState<Record<string, string[]>>({});
// VD: { "attr-uuid-mau": ["Nude"], "attr-uuid-sizechu": ["XXXL"] }

const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
// VD: { "attr-uuid-mau": "nu" }  ← ô tìm kiếm

const [selectedCombinations, setSelectedCombinations] = useState<Set<string>>(new Set());
// VD: Set { "Nude, XXXL", "27, XXXL" }
```

#### 8.5.3 User tick checkbox thuộc tính (line 305-328)
```
┌─────────────────────────────────────────────┐
│  Màu           │  Size Số    │  Size Chữ    │
│  [🔍 Tìm...]   │  [🔍 Tìm...] │ [🔍 Tìm...]  │
│  ☑ Nude        │  ☑ 27      │  ☑ XXXL      │
│  ☐ Đen        │  ☐ 28      │  ☐ S         │
│  ☐ Trắng      │  ☐ 29      │  ☐ M         │
└─────────────────────────────────────────────┘
   Đã chọn: [Nude ×] [27 ×] [XXXL ×]
```

**Khi tick checkbox** (line 313-319):
```typescript
onClick={() => {
  if (isChecked) {
    removeValue(attr.id, value.value);  // Bỏ chọn
  } else {
    addValue(attr.id, value.value);     // Chọn thêm
  }
}}
```

- `addValue(attrId, valueName)` (line 49-54): thêm value vào `selectedValues[attrId][]`
- `removeValue(attrId, valueName)` (line 57-69): xóa value, xóa key nếu mảng rỗng

**Bấm nút × trên badge đã chọn** (line 240-246):
```typescript
onClick={() => removeValue(attrId, value)
```

#### 8.5.4 Tự động tính tổ hợp (line 72-106, useMemo)

Khi `selectedValues` thay đổi → `useMemo` tự tính lại:

```typescript
// Thuật toán tích Descartes (Cartesian Product)
const cartesian = (...arrays: string[][]): string[][] => {
  return arrays.reduce(
    (acc, curr) => acc.flatMap((a) => curr.map((b) => [...a, b])),
    [[]] as string[][]
  );
};
```

**Sắp xếp** qua `sortAttributeValues()` từ `/Users/mac/Downloads/github-html-starter-main/src/lib/attribute-sort-utils.ts`:

| Attribute Name | Quy tắc sắp xếp |
|---|---|
| "Màu" | Màu cơ bản trước (TRẮNG, ĐEN, ĐỎ, XANH...), rồi theo alphabet |
| "Size Số" | Số tăng dần (27, 28, 29...) |
| "Size Chữ" | Thứ tự chuẩn: S → M → L → XL → XXL → XXXL |
| Khác | Giữ nguyên thứ tự |

**Output**: mảng chuỗi `["Nude, XXXL", "27, XXXL"]`

#### 8.5.5 User tick chọn tổ hợp muốn tạo (line 364-380)

```
┌───────────────────────────────────┐
│  [Chọn tất cả] / [Bỏ chọn tất cả] │
│                                     │
│  ☑ Nude, XXXL                       │
│  ☑ 27, XXXL                         │
│  ☐ Nude, 27                         │  ← bỏ chọn
└───────────────────────────────────┘
```

**Tick/bỏ tick tổ hợp** (line 369-374 → handler line 118-128):
```typescript
const toggleCombination = (combo: string) => {
  setSelectedCombinations(prev => {
    const newSet = new Set(prev);
    if (newSet.has(combo)) newSet.delete(combo);
    else newSet.add(combo);
    return newSet;
  });
};
```

**Bấm "Chọn tất cả" / "Bỏ chọn tất cả"** (line 347-352):
```typescript
const toggleAllCombinations = () => {
  if (selectedCombinations.size === generateCombinations.length) {
    setSelectedCombinations(new Set());         // Bỏ hết
  } else {
    setSelectedCombinations(new Set(generateCombinations)); // Chọn hết
  }
};
```

#### 8.5.6 Bấm nút `[Tạo X biến thể]` (line 409-414)

**Text nút**: `"Tạo {selectedCombinations.size} biến thể"` (VD: "Tạo 2 biến thể")

**Handler** `handleSubmit()` (line 139-183):

```
Bước 1 (line 140-147): Validate - ít nhất 1 tổ hợp phải được chọn

Bước 2 (line 150-160): Tạo allSelectedAttributeValueIds
  selectedValues = { "attr-mau": ["Nude"], "attr-sizeso": ["27"], "attr-sizechu": ["XXXL"] }
  ↓ Duyệt từng attribute → tìm UUID trong attributeValues
  ↓
  allSelectedAttributeValueIds = [
    "44b6c5c5-...",  // Nude → UUID từ product_attribute_values
    "51959c0a-...",  // 27   → UUID từ product_attribute_values
    "c9fb1a11-..."   // XXXL → UUID từ product_attribute_values
  ]

Bước 3 (line 163-166): Tạo mảng combinations
  [
    { combinationString: "Nude, XXXL",  selectedAttributeValueIds: [...3 UUIDs] },
    { combinationString: "27, XXXL",    selectedAttributeValueIds: [...3 UUIDs] }
  ]

Bước 4: Gọi onSubmit(result) callback → trả về CreatePurchaseOrderDialog

Bước 5 (line 180-182): Reset state
  selectedValues = {}
  searchQueries = {}
  selectedCombinations = new Set()
```

**Bấm nút `[Hủy]`** (line 406-407):
```typescript
onClick={() => handleOpenChange(false)
// → Reset tất cả state (selectedValues, searchQueries, selectedCombinations)
// → Đóng dialog
```

### 8.6 Bước 4: Nhận kết quả từ VariantGeneratorDialog

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

**onSubmit handler** (line 2420-2467):

```
VariantGeneratorDialog trả về result.combinations
  ↓
Bước 1 (line 2432-2446): Tạo N dòng item mới
  result.combinations.map((combo, index) => ({
    product_name: sourceItem.product_name,     // Copy từ dòng gốc
    product_code: sourceItem.product_code,     // Copy từ dòng gốc
    variant: combo.combinationString,          // "Nude, XXXL"
    purchase_price: sourceItem.purchase_price,
    selling_price: sourceItem.selling_price,
    quantity: 1,                               // Mỗi variant SL = 1
    product_images: [...sourceItem.product_images],
    price_images: [...sourceItem.price_images],
    selectedAttributeValueIds: combo.selectedAttributeValueIds,  // ← KEY: UUID[]
    hasVariants: true,
    notes: sourceItem.notes || "",
    tempId: `variant-${Date.now()}-${index}`
  }))

Bước 2 (line 2454-2456): Thay thế dòng gốc bằng N dòng variant
  setItems(prev => {
    const filtered = prev.filter((_, idx) => idx !== variantGeneratorIndex);
    return [...filtered, ...newVariantItems];
  });
  // Dòng gốc bị xóa, N dòng variant mới được thêm vào

Bước 3 (line 2459-2462): Hiển thị toast "Đã tạo X biến thể"

Bước 4 (line 2465-2466): Đóng dialog
  setIsVariantGeneratorOpen(false)
  setVariantGeneratorIndex(null)
```

**Kết quả trên UI** (theo screenshot):
```
┌─────┬────────────────┬──────────────┬──────┬────┬───────┬───────┬─────────────┐
│ STT │ Tên sản phẩm   │ Biến thể     │ Mã SP│ SL │Giá mua│Giá bán│ Thành tiền  │
├─────┼────────────────┼──────────────┼──────┼────┼───────┼───────┼─────────────┤
│  1  │ TH ÁO CHỮ NU  │ Nude, XXXL   │ N4023│  1 │  100  │  200  │ 100.000 đ   │
│     │                │ ✓ 3 thuộc    │      │    │       │       │             │
│     │                │   tính đã    │      │    │       │       │             │
│     │                │   chọn       │      │    │       │       │             │
├─────┼────────────────┼──────────────┼──────┼────┼───────┼───────┼─────────────┤
│  2  │ TH ÁO CHỮ NU  │ 27, XXXL     │ N4023│  1 │  100  │  200  │ 100.000 đ   │
│     │                │ ✓ 2 thuộc    │      │    │       │       │             │
│     │                │   tính đã    │      │    │       │       │             │
│     │                │   chọn       │      │    │       │       │             │
└─────┴────────────────┴──────────────┴──────┴────┴───────┴───────┴─────────────┘
```

### 8.7 Bước 5: Debug: Attr IDs - Toggle hiển thị UUID

#### Bấm icon `[◀]` / `[▶]` ở góc phải header bảng (line 2043-2051)

```typescript
// Icon: ChevronLeft (khi đang mở) / ChevronRight (khi đang đóng)
onClick={() => setShowDebugColumn(!showDebugColumn)}
```

**Khi `showDebugColumn = true`**:

Header cột (line 2053):
```typescript
<span className="text-xs text-muted-foreground whitespace-nowrap">
  Debug: Attr IDs
</span>
```

Mỗi dòng hiển thị UUID (line 2246-2257):
```typescript
{item.selectedAttributeValueIds.map((id, idx) => (
  <div className="font-mono text-[10px] bg-yellow-50 px-1 py-0.5 rounded border border-yellow-200">
    {id}   // VD: "44b6c5c5-ed97-46e1-a413-ad037f932f64"
  </div>
))}
```

**Hiển thị trên UI**:
```
┌──────────────────────────────────────────┐
│  Debug: Attr IDs                         │
├──────────────────────────────────────────┤
│  44b6c5c5-ed97-46e1-a413-ad037f932f64   │  ← Nude (Màu)
│  51959c0a-7a96-4858-b6a2-902fb25776d2   │  ← 27 (Size Số)
│  c9fb1a11-4fd5-4db6-9535-7c255d68804f   │  ← XXXL (Size Chữ)
├──────────────────────────────────────────┤
│  0d77152f-9f61-4046-837a-82ca401238fd   │  ← 27 (Size Số)
│  c9fb1a11-4fd5-4db6-9535-7c255d68804f   │  ← XXXL (Size Chữ)
└──────────────────────────────────────────┘
```

**Lưu ý tên field khác nhau giữa Create và Edit**:
- **CreatePurchaseOrderDialog**: `item.selectedAttributeValueIds` (camelCase) - state local
- **EditPurchaseOrderDialog**: `item.selected_attribute_value_ids` (snake_case) - từ DB
- **Database column**: `selected_attribute_value_ids` (snake_case)

### 8.8 Bước 6: Bấm `[Tạo đơn hàng]` hoặc `[Lưu nháp]`

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

#### Bấm `[Lưu nháp]` (line 2358)
```
onClick → saveDraftMutation.mutate()
  → Lưu đơn hàng với status = "draft"
  → Lưu items kèm selected_attribute_value_ids
  → KHÔNG trigger background processing
```

#### Bấm `[Tạo đơn hàng]` (line 2364)
```
onClick → Validate items → createOrderMutation.mutate()
  → Lưu đơn hàng với status = "confirmed"
  → Lưu items kèm selected_attribute_value_ids (line 760-775):

const orderItems = items.map((item, index) => ({
  purchase_order_id: order.id,
  product_code: item.product_code.trim().toUpperCase(),
  product_name: item.product_name.trim().toUpperCase(),
  variant: item.variant?.trim().toUpperCase() || null,     // "NUDE, XXXL"
  purchase_price: Number(item.purchase_price || 0) * 1000,
  selling_price: Number(item.selling_price || 0) * 1000,
  selected_attribute_value_ids: item.selectedAttributeValueIds || null, // ← UUID[]
  // ...
}));

→ INSERT vào bảng purchase_order_items
→ Trigger background processing → Tạo variant trên TPOS
```

#### Bấm `[Hủy]` (line 2353)
```
onClick → handleClose()
  → Đóng dialog, reset tất cả state
```

### 8.9 Bước 7: Background Processing - Tạo variant trên TPOS

#### Step 1: Grouping items

**File (React app legacy)**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/process-purchase-order-background/index.ts`
**N2store**: Xử lý trực tiếp trong `form-modal.js` khi lưu đơn, không cần background processing.

```typescript
// Line 101-112: Group items theo product_code + selected_attribute_value_ids
const groups = new Map<string, typeof items>();

for (const item of items) {
  const sortedIds = (item.selected_attribute_value_ids || []).sort().join(',');
  const groupKey = `${item.product_code}|${sortedIds}`;
  if (!groups.has(groupKey)) {
    groups.set(groupKey, []);
  }
  groups.get(groupKey)!.push(item);
}
```

```
Ví dụ grouping:
  Item 1: N4023 | "Nude, XXXL" | IDs: [uuid-nude, uuid-27, uuid-xxxl]
  Item 2: N4023 | "27, XXXL"   | IDs: [uuid-27, uuid-xxxl]

  → Group 1: "N4023|uuid-27,uuid-nude,uuid-xxxl" → [Item 1]
  → Group 2: "N4023|uuid-27,uuid-xxxl"           → [Item 2]
```

#### Step 2: Gọi create-tpos-variants-from-order

**File (React app legacy)**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants-from-order/index.ts`
**N2store**: Dùng CSV files (variant JSON → attribute mapping) thay vì Supabase Edge Function.

```typescript
// Line 217-219: Nhận selectedAttributeValueIds
const {
  baseProductCode,
  productName,
  purchasePrice,
  sellingPrice,
  selectedAttributeValueIds,  // ← UUID[] từ purchase order item
} = await req.json();
```

```typescript
// Line 538-560: Query attribute values từ UUIDs
// React app legacy: Supabase query
// N2store: Dùng CSV lookup từ product_attribute_values_rows.csv
const { data: attributeValuesWithAttrs } = await supabase
  .from('product_attribute_values')
  .select(`
    id, value, code, tpos_id, tpos_attribute_id, sequence, name_get, attribute_id,
    product_attributes!attribute_id (id, name, display_order)
  `)
  .in('id', selectedAttributeValueIds);  // ← QUERY BẰNG UUID[]
```

```typescript
// Line 604-618: Group theo attribute → tạo AttributeLines cho TPOS
const groupedByAttribute: Record<string, AttributeValue[]> = {};
for (const value of attributeValues) {
  if (!groupedByAttribute[value.attribute_id]) {
    groupedByAttribute[value.attribute_id] = [];
  }
  groupedByAttribute[value.attribute_id].push(value);
}

const attributeGroups = attributes
  .map(attr => groupedByAttribute[attr.id])
  .filter(group => group && group.length > 0);
```

#### Step 3: Tạo sản phẩm trên TPOS

```
selectedAttributeValueIds: ["uuid-nude", "uuid-xxxl"]
  ↓ Query product_attribute_values BY UUID
  ↓
  [
    { value: "Nude",  tpos_id: 14, tpos_attribute_id: 3, attribute: "Màu" },
    { value: "XXXL",  tpos_id: 32, tpos_attribute_id: 1, attribute: "Size Chữ" }
  ]
  ↓ Group by attribute → Build TPOS AttributeLines
  ↓
  [
    { Attribute: { Id: 3 }, Values: [{ Id: 14, Name: "Nude" }] },
    { Attribute: { Id: 1 }, Values: [{ Id: 32, Name: "XXXL" }] }
  ]
  ↓ Gửi TPOS API → Tạo product variant trên hệ thống TPOS
```

### 8.10 EditPurchaseOrderDialog - Chỉnh sửa đơn nhập

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/EditPurchaseOrderDialog.tsx`

#### Load dữ liệu từ DB (line 437-451 → mapping line 485)
```typescript
// Query purchase_order_items
const { data: existingItems } = useQuery({
  queryKey: ["purchaseOrderItems", order?.id],
  queryFn: async () => {
    // React app legacy: Supabase query
    // N2store: Load từ Firestore document purchase_orders/{orderId}.items[]
    const { data } = await supabase
      .from("purchase_order_items")
      .select("*")
      .eq("purchase_order_id", order.id)
      .order("position", { ascending: true });
    return data || [];
  }
});

// Map vào state (line 485)
selected_attribute_value_ids: item.selected_attribute_value_ids || [],
```

#### Tạo variant mới trong edit mode (line 1610-1624)
Luồng giống hệt Create, nhưng dùng `_temp` fields:
```typescript
const newVariantItems = result.combinations.map((combo, index) => ({
  quantity: 1,
  selected_attribute_value_ids: combo.selectedAttributeValueIds,
  variant: combo.combinationString,
  product_name: sourceItem._tempProductName,
  product_code: sourceItem._tempProductCode,
  // ...
}));
```

### 8.11 VariantDropdownSelector - Chọn variant có sẵn

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantDropdownSelector.tsx`

**Khi nào xuất hiện**: Khi sản phẩm đã có variant trong kho (base_product_code khớp)

#### Load variant (line 30)
```typescript
const { data: variants = [] } = useProductVariants(baseProductCode);
// → Query products WHERE base_product_code = "N4023" AND variant IS NOT NULL
```

#### Hiển thị popover
```
User focus vào ô variant → onFocus={() => setOpen(true)}
  ↓
┌──────────────────────────────────┐
│  Badge: "3 biến thể"            │
├──────────────────────────────────┤
│  TRẮNG, L          N4023-TL     │  ← click để chọn
│  ĐEN, M            N4023-DM     │
│  TRẮNG, XL         N4023-TXL    │
└──────────────────────────────────┘
```

#### User click chọn variant (line 32-42)
```typescript
const handleSelectVariant = (variant: ProductVariant) => {
  onVariantSelect?.({
    productCode: variant.product_code,   // "N4023-TL"
    productName: variant.product_name,   // "TH ÁO CHỮ NU (TRẮNG, L)"
    variant: variant.variant             // "TRẮNG, L"
  });
  setTimeout(() => setOpen(false), 100); // Đóng popover sau 100ms
};
```

### 8.12 Load dữ liệu Purchase Order (Page)

**File**: `/Users/mac/Downloads/github-html-starter-main/src/pages/PurchaseOrders.tsx`

**Query (line 250-259)**:
```typescript
.select(`
  *,
  items:purchase_order_items(
    id, quantity, position, notes,
    product_code, product_name, variant,
    purchase_price, selling_price,
    product_images, price_images,
    tpos_product_id, selected_attribute_value_ids  // ← LẤY TỪ DB
  )
`)
```

**Interface (line 34)**:
```typescript
interface PurchaseOrderItem {
  selected_attribute_value_ids?: string[] | null;
}
```

### 8.13 Database Column

**React app legacy - Migration file**: `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251027120913_18e287ad-d774-4cfc-b8b6-d9e99a80718c.sql`

```sql
-- React app legacy (Supabase/PostgreSQL)
-- N2store: Lưu trong Firestore document purchase_orders/{id}.items[].selectedAttributeValueIds (array of strings)
ALTER TABLE purchase_order_items
ADD COLUMN selected_attribute_value_ids uuid[] NULL;
COMMENT ON COLUMN purchase_order_items.selected_attribute_value_ids IS
  'Array of product_attribute_values.id used to generate variants. Null for non-variant products.';
```

**React app legacy - TypeScript type** (`/Users/mac/Downloads/github-html-starter-main/src/integrations/supabase/types.ts`):
```typescript
// Line 1081 - Row type
selected_attribute_value_ids: string[] | null
// Line 1104 - Insert type
selected_attribute_value_ids?: string[] | null
```

**N2store equivalent**: Firestore document field `items[].selectedAttributeValueIds: string[]` (camelCase)

### 8.14 Legacy: create-tpos-variants function

**File (React app legacy)**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants/index.ts`

Phiên bản cũ (Supabase Edge Function, không dùng trong N2store), cùng logic (line 95-98):
```typescript
const { baseProductCode, selectedAttributeValueIds } = await req.json();
```

### 8.15 Bảng tổng hợp: Tất cả nút bấm và handler

| Dialog | Nút bấm (text Vietnamese) | Icon | Line | Handler | State thay đổi |
|--------|--------------------------|------|------|---------|----------------|
| **CreatePO** | "Thêm sản phẩm" | `<Plus />` | 2006 | `addItem()` | `items[]` thêm 1 dòng rỗng |
| **CreatePO** | "Chọn từ Kho SP" | `<Warehouse />` | 2010 | `openSelectProduct(index)` | `isSelectProductOpen=true`, `currentItemIndex` |
| **CreatePO** | Settings icon | `<Settings />` | 1970 | `setShowValidationSettings(true)` | `showValidationSettings=true` |
| **CreatePO** | "Nhấn để tạo biến thể" | — | 2081 | `setVariantGeneratorIndex(i)` + `setIsVariantGeneratorOpen(true)` | `variantGeneratorIndex`, `isVariantGeneratorOpen` |
| **CreatePO** | Variant text + ✏️ | `<Pencil />` | 2085 | same as above | same |
| **CreatePO** | ◀ / ▶ (Debug toggle) | `<ChevronLeft/Right />` | 2043 | `setShowDebugColumn(!showDebugColumn)` | `showDebugColumn` |
| **CreatePO** | Pencil icon (mã SP) | `<Pencil />` / `<Check />` | 2120 | Toggle `_manualCodeEdit` | `item._manualCodeEdit` |
| **CreatePO** | "Hủy" | — | 2353 | `handleClose()` | Đóng dialog, reset state |
| **CreatePO** | "Lưu nháp" | — | 2358 | `saveDraftMutation.mutate()` | Lưu DB status=draft |
| **CreatePO** | "Tạo đơn hàng" | — | 2364 | `createOrderMutation.mutate()` | Lưu DB status=confirmed + trigger TPOS |
| **VariantGen** | Checkbox thuộc tính | `<Checkbox />` | 305 | `addValue()` / `removeValue()` | `selectedValues` |
| **VariantGen** | × trên badge đã chọn | — | 240 | `removeValue(attrId, value)` | `selectedValues` |
| **VariantGen** | "Chọn tất cả" / "Bỏ chọn tất cả" | — | 347 | `toggleAllCombinations()` | `selectedCombinations` |
| **VariantGen** | Checkbox tổ hợp | `<Checkbox />` | 369 | `toggleCombination(combo)` | `selectedCombinations` |
| **VariantGen** | "Tạo X biến thể" | — | 410 | `handleSubmit()` | Gọi `onSubmit()` callback → đóng dialog |
| **VariantGen** | "Hủy" | — | 406 | `handleOpenChange(false)` | Reset tất cả state |
| **VariantDropdown** | Click vào variant item | — | 99 | `handleSelectVariant(variant)` | Gọi `onVariantSelect()` callback |

---

## 9. Hình Ảnh Variant - Chi Tiết Từng Bước

### 9.1 Cấu trúc cột hình ảnh trên bảng Purchase Order

```
┌─────┬──────────┬─────────┬──────┬────┬───────┬───────┬─────────┬────────────┬────────────┬────────┐
│ STT │ Tên SP   │ Biến thể│ Mã SP│ SL │Giá mua│Giá bán│Thành    │ Hình ảnh   │ Hình ảnh   │ Thao   │
│     │          │         │      │    │ (VND) │ (VND) │tiền     │ sản phẩm   │ Giá mua    │ tác    │
├─────┼──────────┼─────────┼──────┼────┼───────┼───────┼─────────┼────────────┼────────────┼────────┤
│  1  │ TH ÁO   │ Nude,   │N4023 │  1 │  100  │  200  │100.000đ │ [Ctrl+V]   │ [Ctrl+V]   │ 📥🖼️📋🗑️│
│     │ CHỮ NU  │ XXXL    │      │    │       │       │         │ Dán ảnh    │ Dán ảnh    │        │
└─────┴──────────┴─────────┴──────┴────┴───────┴───────┴─────────┴────────────┴────────────┴────────┘
```

**Header cột** (CreatePurchaseOrderDialog):
- Line 2038: `"Hình ảnh sản phẩm"` (w-[100px])
- Line 2039: `"Hình ảnh Giá mua"` (w-[100px], có border-l-2 phân cách)

### 9.2 Bước 1: Upload / Dán ảnh vào ô

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/ImageUploadCell.tsx`

3 cách thêm ảnh:

#### Cách 1: Dán ảnh Ctrl+V (phổ biến nhất)

```
User copy ảnh → Focus vào ô ảnh → Ctrl+V
  ↓
handlePaste() (form-modal.js)
  ↓ Kiểm tra clipboard: item.type.indexOf('image') !== -1
  ↓ Convert clipboard item → File object
  ↓ Nếu có ImageUtils → compressImage() (max 1920x1920)
  ↓ Convert → dataUrl cho preview tức thì
  ↓ Lưu vào pendingImages (chưa upload)
  ↓ Khi submit đơn → uploadPendingImages()
  ↓ Upload lên Firebase Storage → nhận download URL
  ↓ Thay dataUrl bằng Firebase URL trong formData
```

#### Cách 2: Kéo thả (Drag & Drop)

```
User kéo file ảnh vào ô → handleDrop() (line 187-196)
  → Cùng luồng upload như Ctrl+V
```

#### Cách 3: Click chọn file

```
User click vào ô → mở file browser → chọn ảnh
  → Cùng luồng upload như Ctrl+V
```

**Placeholder text**: `"Dán ảnh (Ctrl+V)"` (ImageUploadCell.tsx line 86)

### 9.3 Upload lên Firebase Storage

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/service.js` — `PurchaseOrderService.uploadImage()`

```javascript
// Tạo tên file
const timestamp = Date.now();
const extension = file.name.split('.').pop() || 'jpg';
const filename = `${folder}/${timestamp}_${Math.random().toString(36).substring(7)}.${extension}`;
//               ↑ folder VD: "purchase-orders/products"   ↑ VD: "1708912345678_a3b2c1.jpg"

// Upload lên Firebase Storage
const ref = this.storage.ref().child(filename);
const snapshot = await ref.put(file);

// Lấy download URL
const downloadURL = await snapshot.ref.getDownloadURL();
// → "https://firebasestorage.googleapis.com/v0/b/{project}/o/purchase-orders%2Fproducts%2F170891...?alt=media&token=..."
```

**Folder structure trên Firebase Storage**:

| Folder                          | Dùng cho                    |
|---------------------------------|-----------------------------|
| `purchase-orders/invoices/`     | Ảnh hóa đơn                |
| `purchase-orders/products/`     | Ảnh sản phẩm + ảnh giá mua |

| Config      | Giá trị                    |
|-------------|---------------------------|
| Storage     | Firebase Storage           |
| Compression | Auto nếu > 1MB (ImageUtils) |
| Max dims    | 1920x1920                 |

### 9.4 Image Compression (tự động)

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/form-modal.js` — `addLocalImages()`

```
File ảnh được thêm vào?
  ↓ Kiểm tra window.ImageUtils.compressImage
  ↓ Có → compressImage(file, 1, 1920, 1920)
  ↓ Resize xuống max 1920x1920, quality 1
  ↓ Output: File đã nén
  ↓ Convert → dataUrl cho preview
  ↓ Lưu vào pendingImages → Upload khi submit
```

### 9.5 Pending Images System (n2store)

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/form-modal.js`

**Mục đích**: Lưu ảnh dạng dataUrl local trước, chỉ upload Firebase khi submit đơn.

```javascript
// Khởi tạo pending images
this.pendingImages = {
    invoice: [],      // Array of {file: File, dataUrl: string}
    products: {},     // itemId -> Array of {file: File, dataUrl: string}
    prices: {}        // itemId -> Array of {file: File, dataUrl: string}
};
```

#### Khi user dán/chọn ảnh → Lưu local (chưa upload)

```
User dán ảnh (Ctrl+V) hoặc chọn file
  ↓ addLocalImages(files, type, itemId)
  ↓ Compress nếu có ImageUtils
  ↓ Convert file → dataUrl (FileReader)
  ↓ Lưu vào pendingImages[type]
  ↓ Cập nhật formData (dataUrl) cho preview
  ↓ Toast: "Đã thêm N ảnh (sẽ tải lên khi tạo đơn)"
```

#### Khi submit đơn → Upload tất cả lên Firebase

```
handleSubmit() / handleSaveDraft()
  ↓ hasPendingImages()? → true
  ↓ uploadPendingImages()
  ↓ Upload invoice files → Firebase Storage (purchase-orders/invoices/)
  ↓ Upload product files → Firebase Storage (purchase-orders/products/)
  ↓ Upload price files → Firebase Storage (purchase-orders/products/)
  ↓ Thay dataUrl bằng Firebase download URL
  ↓ Clear pendingImages
  ↓ getFormData() → submit với Firebase URLs
```

#### Khi tạo đơn hàng → Lưu Firebase Storage URLs

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/form-modal.js` — `uploadPendingImages()`

```javascript
// Upload ảnh hóa đơn
purchaseOrderService.uploadImages(files, 'purchase-orders/invoices')
  .then(urls => {
    // Thay data URLs bằng Firebase URLs
    this.formData.invoiceImages = this.formData.invoiceImages.map(url => {
      const idx = dataUrls.indexOf(url);
      return idx >= 0 && urls[idx] ? urls[idx] : url;
    });
  });

// Upload ảnh sản phẩm + ảnh giá mua
purchaseOrderService.uploadImages(files, 'purchase-orders/products')
  .then(urls => { ... });
```

### 9.6 Bước 2: Áp dụng ảnh cho tất cả biến thể

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

#### Bấm nút `[📋]` trên mỗi dòng (line 2210)

**Title**: `"Áp dụng giá & hình ảnh cho tất cả biến thể"`

```
User bấm nút 📋 trên dòng 1 (Nude, XXXL)
  ↓
applyAllFieldsToVariants(sourceIndex) (line 1799-1838)
  ↓ Lấy sourceItem = items[sourceIndex]
  ↓ Duyệt tất cả items có cùng product_code
  ↓ Copy các field sang:
     - product_images: [...sourceItem.product_images]
     - price_images: [...sourceItem.price_images]
     - purchase_price
     - selling_price
  ↓
Kết quả: Tất cả dòng variant cùng SP có cùng ảnh + giá
```

### 9.7 Bước 3: Ảnh được lưu trên Firebase Storage

Trong hệ thống n2store, ảnh được upload trực tiếp lên **Firebase Storage** khi submit đơn hàng.

```
Submit đơn hàng
  ↓ uploadPendingImages() (form-modal.js)
  ↓ Upload từng file lên Firebase Storage
  ↓ Nhận download URLs
  ↓ Lưu URLs vào Firestore document:
     - order.invoiceImages: ["https://firebasestorage.googleapis.com/..."]
     - item.productImages: ["https://firebasestorage.googleapis.com/..."]
     - item.priceImages: ["https://firebasestorage.googleapis.com/..."]
  ↓
Khi cần gửi TPOS API → fetch Firebase URL → convert base64 → gửi TPOS
```

**Lưu ý**: React app (github-html-starter-main) là phiên bản cũ dùng Supabase Storage + Edge Functions (không còn dùng). **N2store dùng Firebase Storage + Firestore trực tiếp**, không cần background processing.

### 9.8 Ưu tiên hiển thị ảnh (Image Priority)

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` (line 38-66)

```
getProductImages(product):
  ↓
  Priority 1: product.product_images[]     ← Ảnh upload bởi user
  ↓ nếu rỗng
  Priority 2: product.tpos_image_url       ← Ảnh sync từ TPOS
  ↓ nếu null
  Priority 3: parent product image         ← Ảnh SP cha (nếu là variant con)
  ↓ nếu không có
  return []  ← Không có ảnh
```

### 9.9 Hiển thị ảnh trên các trang

#### Purchase Order List (danh sách đơn nhập)

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/PurchaseOrderList.tsx`

```
Ảnh sản phẩm (line 705):
  className="w-8 h-8 object-cover rounded border cursor-pointer
             hover:scale-[14] hover:z-50"
  → Ảnh 8x8px, hover phóng to 14 lần

Ảnh giá (line 724):
  → Cùng style hover:scale-[14]

Ảnh hóa đơn (line 650):
  className="w-20 h-20 ... hover:scale-[7]"
  → Ảnh 20x20px, hover phóng to 7 lần
```

#### Purchase Order Detail Dialog

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/PurchaseOrderDetailDialog.tsx`

```
Header (line 227): "Hình ảnh"

Hiển thị (line 237-262):
  → Tối đa 2 ảnh
  → Nếu nhiều hơn → hiển thị "+N" badge
  → Click ảnh → window.open(imageUrl, '_blank') → mở tab mới
```

### 9.10 Order Image Generator (tạo ảnh đơn hàng)

**File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/order-image-generator.ts`

```
generateOrderImage(imageUrl, variant, quantity, productName)
  ↓
Bước 1: Lấy variant name
  getVariantName("Nude, XXXL - N4023") → "Nude, XXXL"

Bước 2: Tạo text
  text = "Nude, XXXL - 1"  (variant - số lượng)

Bước 3: Vẽ canvas
  ┌───────────────────────┐
  │                       │
  │    [Ảnh sản phẩm]     │  ← 2/3 canvas
  │                       │
  ├───────────────────────┤
  │   Nude, XXXL - 1      │  ← 1/3 canvas, font đỏ #ff0000
  └───────────────────────┘

Bước 4: Export → Copy to clipboard
  canvas.toBlob() → ClipboardItem → navigator.clipboard.write()
  → Toast: "Đã copy ảnh"
```

### 9.11 tpos_image_url - Ảnh sync từ TPOS

**Field**: `products.tpos_image_url` (string | null)

#### Sync từ TPOS

**File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-product-sync.ts`
```typescript
// Line 167, 209: Khi sync sản phẩm
tpos_image_url: fullProduct.ImageUrl || null,

// Line 313: Khi update
if (tposData.ImageUrl) updateData.tpos_image_url = tposData.ImageUrl;
```

**React app (legacy)** dùng Supabase Edge Function `sync-tpos-images` để batch update (không còn dùng). **N2store** lưu `tpos_image_url` trong CSV file `products_rows.csv`.

#### Sử dụng trong variant

**File**: `/Users/mac/Downloads/github-html-starter-main/src/hooks/use-product-variants.ts` (line 10, 25):
```typescript
// Interface
tpos_image_url: string | null;

// Query
.select("id, product_code, product_name, variant, product_images, tpos_image_url, ...")
```

### 9.12 Bảng tổng hợp: Tất cả file hình ảnh variant

| File | Đường dẫn đầy đủ | Vai trò |
|------|-------------------|---------|
| `ImageUploadCell` | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/ImageUploadCell.tsx` | Ô upload ảnh + auto-cache base64 |
| `service.js` (n2store) | `/Users/mac/Downloads/n2store/purchase-orders/js/service.js` | Upload ảnh lên Firebase Storage (`uploadImage`, `uploadImages`) |
| `form-modal.js` (n2store) | `/Users/mac/Downloads/n2store/purchase-orders/js/form-modal.js` | Pending images: Ctrl+V, browse, compress, upload khi submit |
| `unified-image-upload` (React) | `/Users/mac/Downloads/github-html-starter-main/src/components/ui/unified-image-upload.tsx` | React component upload: Ctrl+V, drag-drop, browse |
| `image-utils` | `/Users/mac/Downloads/github-html-starter-main/src/lib/image-utils.ts` | Compress ảnh: resize, giảm quality |
| `order-image-generator` | `/Users/mac/Downloads/github-html-starter-main/src/lib/order-image-generator.ts` | Tạo ảnh đơn hàng: ảnh SP + variant text đỏ |
| `tpos-product-sync` | `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-product-sync.ts` | Sync `tpos_image_url` từ TPOS |
| `table-renderer.js` (n2store) | `/Users/mac/Downloads/n2store/purchase-orders/js/table-renderer.js` | Hiển thị ảnh thumbnail + hover zoom trên bảng |

### 9.13 Logic Upload Hình Lên TPOS - End-to-End Chi Tiết

Toàn bộ luồng hình ảnh từ user dán/chọn ảnh → Firebase Storage → base64 cache → TPOS API `Image` field.

> **N2store**: Dùng Firebase Storage thay Supabase Storage. Không cần Edge Function — xử lý trực tiếp trong `tpos-product-creator.js`.

#### 9.13.1 Tổng Quan Luồng Hình Ảnh → TPOS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ BƯỚC 1: User dán/kéo/chọn ảnh                                              │
│ ─────────────────────────────                                               │
│ UnifiedImageUpload → handlePaste/handleDrop/handleFileInputChange           │
│   ↓ compressImage() nếu > 1MB                                              │
│   ↓ Upload lên Firebase Storage (purchase-orders/products/)                  │
│   ↓ Nhận downloadURL (https://firebasestorage.googleapis.com/...)           │
│   ↓ onChange([downloadURL]) → item.productImages = [downloadURL]            │
├─────────────────────────────────────────────────────────────────────────────┤
│ BƯỚC 2: Auto-cache base64 ngay khi upload                                   │
│ ──────────────────────────────────────────                                   │
│ N2store: Ảnh được lưu local dạng dataUrl (pendingImages)                    │
│   ↓ Khi submit → uploadPendingImages() → Firebase Storage URLs             │
│   ↓ item.productImages = [firebaseURL]                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ BƯỚC 3: tpos-product-creator.js convert image → base64                      │
│ ──────────────────────────────────────────────────                           │
│ syncOrderToTPOS() → processGroup()                                          │
│   ↓ Lấy productImages[0] (Firebase Storage URL)                            │
│   ↓ convertImageToBase64(url)                                               │
│   ↓ fetch(url) → blob → canvas resize (800×800) → base64                   │
│   ↓ Strip prefix "data:image/...;base64," → pure base64 string             │
├─────────────────────────────────────────────────────────────────────────────┤
│ BƯỚC 4: Gửi TPOS API với Image field                                        │
│ ────────────────────────────────────                                         │
│ POST https://tomato.tpos.vn/odata/ProductTemplate/ODataService.InsertV2     │
│   payload.Image = imageBase64    ← base64 string (CHỈ ảnh đầu tiên)        │
│   payload.ImageUrl = null        ← không dùng                               │
│   payload.Thumbnails = []        ← không dùng                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 9.13.2 Bước 1: User Upload Ảnh → Firebase Storage (N2store)

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/form-modal.js`

```
User dán ảnh (Ctrl+V) / Hover + Paste / Click chọn file
  ↓
addLocalImages(files, type, itemId) (form-modal.js)
  ↓ compressImage() nếu có ImageUtils (max 1920×1920)
  ↓ Convert → dataUrl cho preview tức thì
  ↓ Lưu vào pendingImages (chưa upload)
  ↓
handleSubmit() → uploadPendingImages()
  ↓ Upload lên Firebase Storage (purchase-orders/products/)
  ↓ Nhận downloadURL: "https://firebasestorage.googleapis.com/..."
  ↓ Thay dataUrl bằng Firebase URL trong formData
  ↓ item.productImages = [downloadURL]
```

**Config upload (N2store)**:

| Config | Giá trị |
|--------|---------|
| Storage | Firebase Storage |
| Folder | `purchase-orders/products/` |
| Compress max dimensions | 1920×1920 |
| Compress quality | 1 (ImageUtils) |

#### 9.13.3 Bước 2: TPOS Product Creator Convert Image → Base64 (N2store)

**File**: `/Users/mac/Downloads/n2store/purchase-orders/js/lib/tpos-product-creator.js`

```
syncOrderToTPOS() → processGroup()
  ↓
  ↓ Lấy productImages[0] từ item đầu tiên trong group (Firebase Storage URL)
  ↓
  ↓ convertImageToBase64(url)
  ↓   fetch(url) → blob
  ↓   Nếu blob.size > 512000 (500KB):
  ↓     Canvas resize: max 800×800 px, quality 0.8, image/jpeg
  ↓   FileReader.readAsDataURL(blob)
  ↓   base64Data = result.split(',')[1]  ← Bỏ prefix "data:image/jpeg;base64,"
  ↓   return base64Data (pure base64 string)
  ↓
  ↓ payload.Image = base64Data
```

**Lưu ý quan trọng**:
- Chỉ convert **1 ảnh đầu tiên** (`productImages[0]`) — TPOS API chỉ nhận 1 field `Image`
- Resize xuống **800×800** và compress **80% quality** — nhỏ hơn ảnh gốc, tối ưu cho TPOS
- Base64 **không có prefix** `data:image/...;base64,`

| Constant | Giá trị |
|----------|---------|
| Max resize dimensions | 800×800 px |
| Max bytes before resize | 500KB (512000 bytes) |
| Resize quality | 0.8 (80%) |
| Resize format | `image/jpeg` |

#### 9.13.8 Bước 7: TPOS API Payload - Field Image

**CASE 1: Sản phẩm đơn (không có variant)** — line 268-423

```typescript
const simplePayload = {
  // ... ~60 fields ...
  Image: imageBase64,    // ← base64 string (line 315)
  ImageUrl: null,        // ← không dùng (line 316)
  Thumbnails: [],        // ← không dùng (line 317)
  // ...
  ProductVariants: []
};
```

**CASE 2: Sản phẩm có variant** — line 736-830

```typescript
const parentPayload = {
  // ... ~60 fields ...
  Image: imageBase64,    // ← base64 string (line 799)
  ImageUrl: null,        // ← không dùng (line 800)
  Thumbnails: [],        // ← không dùng (line 801)
  // ...
  ProductVariants: [     // Variant CON không có Image
    {
      Image: null,       // ← null cho variant con (line 677)
      ImageUrl: null,    // ← null cho variant con (line 678)
      Thumbnails: [],
      // ...
    }
  ]
};
```

**POST endpoint**: `https://tomato.tpos.vn/odata/ProductTemplate/ODataService.InsertV2?$expand=ProductVariants,UOM,UOMPO`

**Headers** (line 195-202):

```typescript
{
  'Authorization': 'Bearer {token}',
  'Content-Type': 'application/json',
  'Tpos-Agent': 'Node.js v20.5.1, Mozilla/5.0, Windows NT 10.0; Win64; x64',
  'Tpos-Retailer': '1'
}
```

**Kết luận Image trên TPOS**:
- Chỉ **parent product** có `Image` (base64)
- **Variant con** luôn có `Image: null` → TPOS sẽ dùng ảnh parent
- Chỉ **ảnh đầu tiên** trong `product_images[]` được gửi
- `ImageUrl` và `Thumbnails` luôn `null` / `[]` → không sử dụng

#### 9.13.9 Lưu Ảnh Vào Firestore

Sau khi TPOS trả về kết quả, ảnh URLs (Firebase Storage) đã được lưu trong Firestore document từ trước (khi submit đơn hàng):

```
Firestore document: purchase_orders/{orderId}
  items[]: [
    {
      productCode: "N4033",
      productImages: ["https://firebasestorage.googleapis.com/..."],  ← Firebase Storage URLs
      tposSyncStatus: "success",
      tposProductId: 12345,
      ...
    }
  ]
```

**Lưu ý**: Tất cả variant items cùng productCode dùng **cùng ảnh** (từ item đầu tiên). Trong Firestore, `productImages` lưu **Firebase Storage URLs** (không phải base64). Base64 chỉ dùng để gửi TPOS API.

#### 9.13.10 N2store: Không Cần Pre-Cache

**React app legacy** dùng imageCache (Map) để pre-cache base64 trước khi gửi Edge Function. **N2store không cần pre-cache** vì:

1. Ảnh được lưu local dạng `dataUrl` (pendingImages) trước khi submit
2. Khi submit → upload Firebase Storage → nhận URL
3. Khi sync TPOS → `convertImageToBase64(url)` fetch trực tiếp Firebase Storage URL → convert base64
4. Không có Edge Function trung gian → không cần serialize cache

```
N2store flow (đơn giản hơn):
  pendingImages (dataUrl) → upload Firebase → Firebase URL → fetch → base64 → TPOS

React app legacy (phức tạp hơn, KHÔNG DÙNG):
  upload Supabase → URL → imageCache.set(url, base64) → serialize → Edge Fn 1 → Edge Fn 2 → TPOS
```

#### 9.13.11 Bảng Tổng Hợp: Toàn Bộ Luồng Hình Ảnh → TPOS (N2store)

| Bước | File | Hành động | Input | Output |
|------|------|-----------|-------|--------|
| 1. Paste/Drop ảnh | `form-modal.js` | Compress + lưu local dataUrl | File/Blob | pendingImages (dataUrl) |
| 2. Submit đơn | `form-modal.js` | uploadPendingImages() → Firebase Storage | dataUrl + File | Firebase Storage URL |
| 3. Lưu Firestore | `service.js` | createOrder() / updateOrder() | Firebase URLs | Firestore document |
| 4. Sync TPOS | `tpos-product-creator.js` | convertImageToBase64(url) | Firebase URL | base64 string |
| 5. Resize (nếu cần) | `tpos-product-creator.js` | Canvas resize 800×800 nếu > 500KB | Blob | Blob nhỏ hơn |
| 6. TPOS payload | `tpos-product-creator.js` | `payload.Image = base64` | base64 string | TPOS product created |

#### 9.13.12 Lưu Ý Quan Trọng

1. **Chỉ 1 ảnh gửi TPOS**: Dù `productImages` có thể chứa nhiều URL, chỉ `productImages[0]` được convert base64 và gửi TPOS
2. **2 lần resize**: Ảnh có thể bị resize 2 lần:
   - Lần 1: `compressImage()` khi paste/upload (1920×1920, quality 1) — trong `form-modal.js`
   - Lần 2: `convertImageToBase64()` khi sync TPOS (800×800, quality 0.8) — trong `tpos-product-creator.js`
3. **Base64 không có prefix**: Base64 string gửi TPOS đã **bỏ prefix** `data:image/...;base64,` (chỉ giữ phần data)
4. **Không cần pre-cache**: N2store fetch trực tiếp Firebase Storage URL khi cần convert base64, không cần cache trung gian
5. **Variant con không có ảnh riêng**: TPOS payload variant con có `Image: null`, chỉ parent product có ảnh
6. **DB lưu URLs, TPOS nhận base64**: Firestore `items[].productImages` = Firebase Storage URLs, TPOS `Image` = base64 string

### 9.14 Debug: Attr IDs - Chi Tiết Logic

#### 9.14.1 Tổng Quan

"Debug: Attr IDs" là cột debug ẩn trên bảng sản phẩm trong CreatePurchaseOrderDialog, hiển thị mảng `selectedAttributeValueIds` (UUIDs) của mỗi item. Cột này giúp kiểm tra các attribute value IDs đã được gán cho từng dòng sản phẩm — dữ liệu này **quyết định cách TPOS tạo variant**.

```
┌────────────────────────────────────────────────────────────────────┐
│ ...Thao tác │  < Debug: Attr IDs                                   │
│             │ ┌──────────────────────────────────────────────────┐ │
│             │ │ 885ba459-622d-4ab4-b39b-1a047664f453             │ │ ← UUID value "Đen"
│             │ │ a1b2c3d4-e5f6-7890-abcd-ef1234567890             │ │ ← UUID value "Xám"
│             │ │ 21cfea95-87e8-45dd-a92e-75670151ac1f             │ │ ← UUID value "4"
│             │ │ 3f2318d1-0f3b-4ef0-8c56-b8d62b027beb             │ │ ← UUID value "XL"
│             │ └──────────────────────────────────────────────────┘ │
│             │  ↑ TẤT CẢ attribute values đã chọn (4 IDs)          │
└────────────────────────────────────────────────────────────────────┘
```

**Lưu ý**: Mảng IDs chứa TẤT CẢ values đã chọn (Đen + Xám + 4 + XL = 4 IDs), KHÔNG phải chỉ riêng variant của dòng đó.

#### 9.14.2 UI Toggle - Mở/Đóng Cột Debug

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

**State** (line 446):

```typescript
const [showDebugColumn, setShowDebugColumn] = useState(false); // Mặc định ẩn
```

**Header** (line 2041-2055):

```typescript
<TableHead className={`border-l-2 border-yellow-500/30 transition-all ${showDebugColumn ? 'w-[200px]' : 'w-8'}`}>
  <div className="flex items-center gap-2">
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 shrink-0"
      onClick={() => setShowDebugColumn(!showDebugColumn)}
      title="Toggle debug column"
    >
      {showDebugColumn ? <ChevronLeft /> : <ChevronRight />}
    </Button>
    {showDebugColumn && <span className="text-xs text-muted-foreground">Debug: Attr IDs</span>}
  </div>
</TableHead>
```

**Hiển thị cell** (line 2244-2258):

```typescript
{showDebugColumn && (
  <TableCell className="border-l-2 border-yellow-500/30 align-top">
    {item.selectedAttributeValueIds && item.selectedAttributeValueIds.length > 0 ? (
      <div className="space-y-1 max-h-[120px] overflow-y-auto text-xs">
        {item.selectedAttributeValueIds.map((id, idx) => (
          <div key={idx} className="font-mono text-[10px] bg-yellow-50 px-1 py-0.5 rounded border border-yellow-200">
            {id}
          </div>
        ))}
      </div>
    ) : (
      <span className="text-xs text-muted-foreground italic">—</span>
    )}
  </TableCell>
)}
```

**Style**:
- Cột có `border-l-2 border-yellow-500/30` (viền vàng bên trái)
- Khi đóng: `w-8` (chỉ hiển thị nút `>`)
- Khi mở: `w-[200px]` (hiển thị header "Debug: Attr IDs" + UUIDs)
- UUID box: `font-mono text-[10px] bg-yellow-50 border-yellow-200` (nền vàng nhạt)
- Max height: `120px` với `overflow-y-auto` (scroll nếu nhiều IDs)

#### 9.14.3 Badge "✓ N thuộc tính đã chọn"

Ở cột Biến thể, dưới nút variant, hiển thị badge khi có attribute IDs:

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` (line 2098-2102)

```typescript
{item.selectedAttributeValueIds && item.selectedAttributeValueIds.length > 0 && (
  <Badge variant="secondary" className="text-xs">
    ✓ {item.selectedAttributeValueIds.length} thuộc tính đã chọn
  </Badge>
)}
```

Ví dụ: chọn Màu=[Đen, Xám], Size Số=[4], Size Chữ=[XL] → 4 values → hiển thị `"✓ 4 thuộc tính đã chọn"`

#### 9.14.4 Nguồn Gốc selectedAttributeValueIds - Từ VariantGeneratorDialog

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantGeneratorDialog.tsx`

Khi user chọn variant trong dialog "Tạo biến thể từ thuộc tính":

**handleSubmit()** (line 138-183):

```
User chọn: Màu = [Đen, Xám], Size Số = [4], Size Chữ = [XL]
  ↓
Bước 1: Tạo allSelectedAttributeValueIds (line 150-160)
  ↓ attributes.filter(có selectedValues)
  ↓ .flatMap → lấy UUID cho TỪNG value đã chọn
  ↓ attributeValues.find(av.value === "Đen" && av.attribute_id === "mau_id") → UUID
  ↓ attributeValues.find(av.value === "Xám" && av.attribute_id === "mau_id") → UUID
  ↓ attributeValues.find(av.value === "4" && av.attribute_id === "sizeso_id") → UUID
  ↓ attributeValues.find(av.value === "XL" && av.attribute_id === "sizechu_id") → UUID
  ↓
  ↓ Kết quả: allSelectedAttributeValueIds = [UUID_Đen, UUID_Xám, UUID_4, UUID_XL]
  ↓ (4 IDs cho ví dụ Đen+Xám, 4, XL)
  ↓
Bước 2: Gán CÙNG mảng IDs cho TẤT CẢ combinations (line 163-166)
  ↓ combinations = selectedCombinations.map(combo => ({
  ↓   combinationString: combo,         // VD: "Đen, 4, XL"
  ↓   selectedAttributeValueIds: allSelectedAttributeValueIds  // ← CÙNG mảng!
  ↓ }))
  ↓
  ↓ onSubmit({ combinations, hasVariants: true })
```

**QUAN TRỌNG**: Tất cả variant items từ cùng 1 lần tạo đều có **CÙNG mảng `selectedAttributeValueIds`**. Đây KHÔNG phải là IDs riêng cho từng combo, mà là **tập hợp TẤT CẢ attribute value IDs đã chọn**.

Ví dụ từ screenshot (Đen+Xám, 4, XL):

```
allSelectedAttributeValueIds = [UUID_Đen, UUID_Xám, UUID_4, UUID_XL]  ← 4 IDs

Item 1: "Đen, 4, XL" → IDs = [UUID_Đen, UUID_Xám, UUID_4, UUID_XL]  ← CÙNG 4 IDs
Item 2: "Xám, 4, XL" → IDs = [UUID_Đen, UUID_Xám, UUID_4, UUID_XL]  ← CÙNG 4 IDs
```

Ví dụ mở rộng (chọn nhiều giá trị hơn): Màu=[Đen, Xám, Trắng, Hồng], Size Số=[32, 33], Size Chữ=[S, M, XL]:

```
allSelectedAttributeValueIds = [UUID_Đen, UUID_Xám, UUID_Trắng, UUID_Hồng, UUID_32, UUID_33, UUID_S, UUID_M, UUID_XL]
                                ← 9 IDs cho TẤT CẢ values đã chọn

Tạo 4×2×3 = 24 combos, MỖI combo đều có CÙNG 9 IDs:
  Item 1:  "Đen, 32, S"     → IDs = [9 UUIDs giống nhau]
  Item 2:  "Đen, 32, M"     → IDs = [9 UUIDs giống nhau]
  Item 3:  "Đen, 32, XL"    → IDs = [9 UUIDs giống nhau]
  ...
  Item 24: "Hồng, 33, XL"   → IDs = [9 UUIDs giống nhau]
```

#### 9.14.5 Khi Tạo Variant Items - IDs Được Gán

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` (line 2420-2457)

```
VariantGeneratorDialog.onSubmit(result)
  ↓
result.combinations = [
  { combinationString: "Đen, 4, XL", selectedAttributeValueIds: [id1, id2, id3, id4] },
  { combinationString: "Xám, 4, XL", selectedAttributeValueIds: [id1, id2, id3, id4] }
]
  ↓
Tạo newVariantItems (line 2432-2446):
  const newVariantItems = result.combinations.map((combo, index) => ({
    product_name: sourceItem.product_name,     // "ao 32"
    product_code: sourceItem.product_code,     // "N4033"
    variant: combo.combinationString,          // "Đen, 4, XL"
    selectedAttributeValueIds: combo.selectedAttributeValueIds,  // ← GÁN IDs
    hasVariants: true,
    ...
  }));
  ↓
Xóa source item + thêm variant items (line 2453-2457):
  setItems(prev => {
    const filtered = prev.filter((_, idx) => idx !== variantGeneratorIndex);
    return [...filtered, ...newVariantItems];
  });
```

#### 9.14.6 Khi Xóa Item (Nút ✕) - Ảnh Hưởng Đến Attr IDs

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` (line 1558-1580)

```
User bấm ✕ trên dòng variant
  ↓
removeItem(index) (line 1558)
  ↓
Nếu items.length > 1:
  ↓ setItems(items.filter((_, i) => i !== index))
  ↓ → Item bị xóa hoàn toàn, kể cả selectedAttributeValueIds
  ↓
Nếu items.length === 1 (dòng cuối):
  ↓ Reset thành item trống, KHÔNG có selectedAttributeValueIds
  ↓ setItems([{ product_code: "", product_name: "", variant: "", ... }])
```

**Ảnh hưởng khi xóa 1 variant item**:

```
Trước khi xóa (2 items):
  Item 1: "Đen, 4, XL" - N4033 - IDs: [id1, id2, id3, id4]
  Item 2: "Xám, 4, XL" - N4033 - IDs: [id1, id2, id3, id4]

Xóa Item 1 (Đen, 4, XL):
  Item 2: "Xám, 4, XL" - N4033 - IDs: [id1, id2, id3, id4]  ← KHÔNG ĐỔI

→ selectedAttributeValueIds của item còn lại KHÔNG bị ảnh hưởng
→ IDs vẫn chứa TẤT CẢ attribute values (kể cả Đen đã bị xóa khỏi bảng)
```

**Hệ quả cho TPOS**: Khi "Tạo đơn hàng":
- Edge Function nhóm items theo `product_code|sorted(selectedAttributeValueIds)`
- Item 2 còn lại vẫn có đầy đủ IDs → Edge Fn 2 sẽ query DB lấy tất cả attribute values từ IDs → **vẫn tạo CÙNG Cartesian product** (Đen×4×XL + Xám×4×XL)
- TPOS sẽ tạo **cả 2 variant** (Đen+Xám) dù chỉ còn 1 item trên UI

**Kết luận xóa item**: Xóa dòng trên UI **KHÔNG xóa attribute value IDs** từ các items còn lại. TPOS vẫn tạo tất cả variant combinations dựa trên `selectedAttributeValueIds`.

#### 9.14.7 Khi Thêm Mới Item (Nút "+ Thêm sản phẩm") - Không Có Attr IDs

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` (line ~1430-1444)

```
User bấm "+ Thêm sản phẩm"
  ↓
addNewItem()
  ↓ items.push({
  ↓   product_name: "",
  ↓   product_code: "",
  ↓   variant: "",
  ↓   selectedAttributeValueIds: undefined,  ← KHÔNG CÓ IDs
  ↓   ...
  ↓ })
  ↓
Debug column hiển thị: "—" (dash, italic)
```

Item mới thêm **không có `selectedAttributeValueIds`** → cột Debug hiển thị dấu gạch. Chỉ khi user mở VariantGeneratorDialog và chọn attributes thì IDs mới được gán.

#### 9.14.8 Khi Copy Item (Nút 📋) - IDs Được Copy Theo

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` (line 1447-1554)

```
User bấm 📋 copy dòng "Đen, 4, XL"
  ↓
copyItem(index) (line 1447)
  ↓ const itemToCopy = { ...items[index] }
  ↓   → Spread copy: selectedAttributeValueIds được copy by reference
  ↓
  ↓ Tạo product_code mới (auto-generate)
  ↓ newItems.splice(index + 1, 0, itemToCopy)
  ↓
Kết quả:
  Item 1: "Đen, 4, XL" - N4033 - IDs: [id1, id2, id3, id4]  ← gốc
  Item 2: "Đen, 4, XL" - N4034 - IDs: [id1, id2, id3, id4]  ← copy (MÃ MỚI, IDs GIỐNG)
```

**Lưu ý**: Copy item giữ nguyên `selectedAttributeValueIds` nhưng tạo **mã sản phẩm mới**. Do đó khi nhóm items cho TPOS (theo `product_code|IDs`), item copy sẽ nằm ở **group khác** → tạo sản phẩm TPOS riêng.

#### 9.14.9 Khi Load Draft - IDs Từ Database

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` (line 480-493)

```
Mở dialog với initialData (draft từ DB)
  ↓
loadedItems = initialData.items.map(item => ({
  selectedAttributeValueIds: item.selected_attribute_value_ids || undefined,
  hasVariants: item.selected_attribute_value_ids?.length > 0,
  ...
}))
  ↓
Nếu draft có selected_attribute_value_ids → hiển thị trong Debug column
Nếu draft không có → hiển thị "—"
```

#### 9.14.10 Khi Lưu Vào Database - IDs Lưu Nguyên

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

Cả 2 flow (Lưu nháp + Tạo đơn hàng) đều lưu IDs:

```typescript
// orderItems mapping (line 1095-1120 cho Tạo đơn, line 760-775 cho Lưu nháp)
const orderItems = items.map(item => ({
  selected_attribute_value_ids: item.selectedAttributeValueIds || null,
  // ...
}));

// INSERT vào purchase_order_items table
await supabase.from("purchase_order_items").insert(orderItems);
```

#### 9.14.11 Vai Trò Của selectedAttributeValueIds Trong Edge Function

**File**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/process-purchase-order-background/index.ts` (line 101-112)

```typescript
// Step 1: Group items by (product_code + selected_attribute_value_ids)
for (const item of items) {
  const sortedIds = (item.selected_attribute_value_ids || []).sort().join(',');
  const groupKey = `${item.product_code}|${sortedIds}`;
  // → VD: "N4033|21cfea95...,3f2318d1...,885ba459..."

  groups.get(groupKey)!.push(item);
}
```

**Quy tắc nhóm**: Items có **cùng `product_code`** VÀ **cùng sorted `selected_attribute_value_ids`** → nhóm chung → gọi 1 lần TPOS API.

**Ví dụ từ screenshot** (2 items cùng N4033, cùng 4 IDs):

```
Item 1: N4033 | [885ba..., a1b2c..., 21cfe..., 3f231...]
  → sorted → groupKey = "N4033|21cfe...,3f231...,885ba...,a1b2c..."

Item 2: N4033 | [885ba..., a1b2c..., 21cfe..., 3f231...]
  → sorted → groupKey = "N4033|21cfe...,3f231...,885ba...,a1b2c..."

→ CÙNG GROUP → chỉ gọi TPOS 1 lần → tạo 1 parent + N variants
```

**Ví dụ mở rộng** (9 IDs, 4 Màu × 2 Size Số × 3 Size Chữ = 24 items):

```
24 items cùng N4033 | cùng 9 IDs (sorted)
  → 1 GROUP → 1 lần TPOS API → tạo 1 parent + 24 variant children
```

**File**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants-from-order/index.ts` (line 530+)

```
Edge Fn 2 nhận selectedAttributeValueIds = [id1, id2, id3, id4]  (4 IDs)
  ↓
Query Supabase: attribute_values JOIN attributes (dùng 4 IDs)
  ↓ → id1 = Đen (Màu, tpos_id=X)
  ↓ → id2 = Xám (Màu, tpos_id=Y)
  ↓ → id3 = 4   (Size Số, tpos_id=Z)
  ↓ → id4 = XL  (Size Chữ, tpos_id=W)
  ↓
Group by attribute → Cartesian product
  ↓ Màu=[Đen, Xám] × Size Số=[4] × Size Chữ=[XL] = 2 combos
  ↓
Tạo ProductVariants array → POST TPOS InsertV2

Ví dụ mở rộng (9 IDs):
  ↓ Màu=[Đen, Xám, Trắng, Hồng] × Size Số=[32, 33] × Size Chữ=[S, M, XL]
  ↓ = 4×2×3 = 24 combos → 24 ProductVariants
```

#### 9.14.12 Bảng Tổng Hợp: Hành Vi selectedAttributeValueIds

| Hành động | selectedAttributeValueIds | Ảnh hưởng |
|-----------|--------------------------|-----------|
| **Tạo variant** (VariantGeneratorDialog) | Gán CÙNG mảng IDs cho TẤT CẢ combos | Tất cả items cùng nhóm có cùng IDs |
| **Xóa item** (nút ✕) | Items còn lại KHÔNG ĐỔI IDs | TPOS vẫn tạo đầy đủ Cartesian product |
| **Thêm item mới** (+ Thêm SP) | `undefined` (không có IDs) | Debug hiển thị "—", TPOS tạo simple product |
| **Copy item** (nút 📋) | Copy by reference (CÙNG IDs) | Mã SP mới → group riêng → TPOS SP riêng |
| **Chọn từ kho** (Chọn từ Kho SP) | KHÔNG gán IDs | Debug hiển thị "—" |
| **Load draft** | Restore từ `selected_attribute_value_ids` trong DB | Hiển thị lại IDs đã lưu |
| **Lưu nháp** | Lưu vào `purchase_order_items.selected_attribute_value_ids` | Persist IDs trong DB |
| **Tạo đơn hàng** | Lưu DB + Edge Fn dùng IDs để nhóm + query attributes | IDs quyết định TPOS Cartesian product |
| **Apply All (📋 áp dụng)** | KHÔNG copy IDs (chỉ copy giá + ảnh) | IDs của items khác không đổi |

#### 9.14.13 Lưu Ý Quan Trọng

1. **Cùng IDs ≠ cùng variant**: Tất cả items từ 1 lần tạo variant đều có **CÙNG mảng IDs** (tổng hợp TẤT CẢ attribute values), không phải IDs riêng cho từng combo
2. **IDs dùng cho nhóm**: Edge Fn 1 nhóm items theo `product_code|sorted(IDs)` → items cùng group gọi TPOS 1 lần
3. **IDs dùng cho Cartesian**: Edge Fn 2 dùng IDs query DB → lấy attribute values → tạo Cartesian product → tạo TPOS variants
4. **Xóa item ≠ xóa variant trên TPOS**: Xóa 1 dòng variant trên UI không ảnh hưởng IDs của items còn lại, TPOS vẫn tạo đầy đủ variants
5. **Debug column mặc định ẩn**: `showDebugColumn` = `false`, user phải bấm `>` để mở
6. **Chỉ hiển thị, không sửa được**: Debug column là read-only, không có chức năng edit IDs trực tiếp

---

## 10. Tự Tạo Mã Sản Phẩm (Auto-Generate Product Code) - Chi Tiết Từng Bước

### 10.1. Tổng Quan

Hệ thống tự động tạo mã sản phẩm (product_code) dựa trên **tên sản phẩm** khi tạo đơn nhập hàng. Mã được chia thành 3 **category** theo loại sản phẩm:

| Category | Ý nghĩa | Ví dụ mã | Keyword nhận diện |
| -------- | -------- | --------- | ----------------- |
| **N** | Quần áo (Clothing) | N123, N456 | QUAN, AO, DAM, SET, JUM, AOKHOAC |
| **P** | Phụ kiện (Accessories) | P45, P78 | TUI, MATKINH, GIAY, DEP, SON, SERUM, KHAN, NIT, VONG, NHAN... (32 keywords) |
| **Q** | Nhà cung cấp Q | Q1, Q5 | Tên bắt đầu bằng Q hoặc Q+số |

### 10.2. File Liên Quan (n2store)

| File | Đường dẫn | Vai trò |
| ---- | --------- | ------- |
| `product-code-generator.js` | `purchase-orders/js/lib/product-code-generator.js` | Core logic: detect category, query max (Firestore), generate code, check trùng |
| `form-modal.js` | `purchase-orders/js/form-modal.js` | UI auto-generate + Pencil/Check toggle + edit mode read-only |
| `service.js` | `purchase-orders/js/service.js` | Firestore CRUD, `prepareItems()` lưu `productCode` |

### 10.3. Bước 1: User Nhập Tên Sản Phẩm

```
┌─────────────────────────────────────────────────────────────────┐
│ Tên sản phẩm          │ Biến thể │ Mã SP    │ SL │ Giá mua   │
├────────────────────────┼──────────┼──────────┼────┼───────────┤
│ [0501 A12 Áo thun...] │          │ [Mã SP ✏️]│ 1  │ 0         │
└─────────────────────────────────────────────────────────────────┘
```

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~2078
- **Input**: `<Input placeholder="Nhập tên sản phẩm" onChange={e => updateItem(index, "product_name", e.target.value)} />`
- **Trigger**: Khi user gõ tên sản phẩm → `product_name` thay đổi → debounce 500ms

### 10.4. Bước 2: Debounce 500ms

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~452-456
- **Logic**: Dùng `useDebounce` hook, đợi user ngừng gõ 500ms trước khi chạy auto-generate

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:452
const debouncedProductNames = useDebounce(
  items.map(i => i.product_name).join('|'),
  500
);
```

- Khi `debouncedProductNames` thay đổi → trigger `useEffect` auto-generate

### 10.5. Bước 3: Kiểm Tra Điều Kiện Auto-Generate

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~528-535
- **useEffect** lắng nghe `debouncedProductNames` và `manualProductCodes`

**Điều kiện để auto-generate chạy cho item `[index]`**:
1. `item.product_name.trim()` !== "" → Tên không rỗng
2. `item.product_code.trim()` === "" → Chưa có mã
3. `!manualProductCodes.has(index)` → User chưa bấm vào ô mã để sửa tay

Nếu 1 trong 3 điều kiện sai → **SKIP** item đó

### 10.6. Bước 4: Detect Product Category

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts` line 68-138
- **Hàm**: `detectProductCategory(productName)`

**Quy trình phân tích tên sản phẩm**:

```
Input: "0501 A12 Áo thun trắng đẹp"
         ↓
convertVietnameseToUpperCase() → "0501 A12 AO THUN TRANG DEP"
         ↓
Tokenize: ["0501", "A12", "AO", "THUN", "TRANG", "DEP"]
         ↓
Step 1: Token[0] = "0501" → 4 chữ số → là ngày (ddmm) → skip, index++
         ↓
Step 2: Token[1] = "A12" → match /^[A-Z]\d+$/ → là NCC → skip, index++
         ↓
Step 3: Token[2] = "AO" → match CATEGORY_N_KEYWORDS → return 'N' ✅
```

**Các bước chi tiết**:

| Step | Kiểm tra | Ví dụ match | Kết quả |
| ---- | -------- | ----------- | ------- |
| 1 | Token đầu tiên là ngày? (`/^\d{4}$/`) | "0501" → yes | Skip token, index++ |
| 2 | Token tiếp theo là NCC? | "Q5" → return 'Q' ngay | Return 'Q' |
| 2b | NCC pattern khác? (`/^[A-Z]\d+$/`) | "A12", "B5" → yes | Skip token, index++ |
| 3 | Token tiếp theo match CATEGORY_N_KEYWORDS? | "AO", "QUAN", "DAM" | Return 'N' |
| 3b | Token tiếp theo match CATEGORY_P_KEYWORDS? | "TUI", "GIAY", "SON" | Return 'P' |
| 4 | Fallback: scan TẤT CẢ tokens | Bất kỳ token nào match | Return 'N' hoặc 'P' |
| 5 | Có NCC + text nhưng không match keyword? | "A12 XYZ" | Default return 'N' |
| 6 | Không đủ thông tin | Chỉ có "abc" | Return `null` → skip |

### 10.7. Bước 5: Vietnamese Text Normalization

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/utils.ts` line 8-47
- **Hàm**: `convertVietnameseToUpperCase(text)`

Bỏ **toàn bộ dấu tiếng Việt** + convert sang UPPERCASE:

| Input | Output |
| ----- | ------ |
| "Áo thun" | "AO THUN" |
| "Túi đeo chéo" | "TUI DEO CHEO" |
| "Quần jeans" | "QUAN JEANS" |
| "Đầm maxi" | "DAM MAXI" |
| "Mắt kính" | "MAT KINH" |
| "Sữa rửa mặt" | "SUA RUA MAT" |

**Mapping đầy đủ**: à/á/ạ/ả/ã/â/ầ/ấ/ậ/ẩ/ẫ/ă/ằ/ắ/ặ/ẳ/ẵ → `a`, è/é/ẹ/ẻ/ẽ/ê/ề/ế/ệ/ể/ễ → `e`, đ/Đ → `d`, v.v.

### 10.8. Bước 6: Query Max Number Từ 3 Nguồn

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~560-570
- Chạy **song song** (Promise.all) 2 query DB + 1 scan form:

```typescript
const [maxFromProducts, maxFromPurchaseOrderItems] = await Promise.all([
  getMaxNumberFromProductsDB(category),      // RPC function → nhanh
  getMaxNumberFromPurchaseOrderItemsDB(category)  // RPC function → nhanh
]);
const maxFromForm = getMaxNumberFromItems(currentFormItems, category);
```

| Nguồn | Hàm | File:Line | Cách query |
| ----- | ---- | --------- | ---------- |
| **products** table | `getMaxNumberFromProductsDB(category)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:537-541` | React app legacy: Supabase RPC. **N2store**: `TPOSClient.getMaxProductCode(category)` qua TPOS OData API |
| **purchase_order_items** table | `getMaxNumberFromPurchaseOrderItemsDB(category)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:548-552` | React app legacy: Supabase RPC. **N2store**: `getMaxNumberFromFirestore(category)` scan Firestore `purchase_orders` collection |
| **Form hiện tại** | `getMaxNumberFromItems(items, category)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:216-233` | Scan tất cả `product_code` trong form, regex `/^([NPQ])(\d+)$/` |

**Ví dụ**:
- products table: N125 → max = 125
- purchase_order_items: N130 → max = 130
- Form items: N132 → max = 132
- **Kết quả**: `Math.max(125, 130, 132)` = **132** → nextNumber = **133** → candidateCode = **"N133"**

### 10.9. Bước 7: Kiểm Tra Trùng Mã (Loop Tối Đa 30 Lần)

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~580-640
- **Hàm check**: `isProductCodeExists(candidateCode, currentFormItems)`
- **File check**: `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts` line 452-502

```
candidateCode = "N133"
         ↓
┌─── Loop (max 30 attempts) ───┐
│                               │
│  ① Check FORM items          │  → formItems.some(code === "N133")
│     ↓ Không trùng            │
│  ② Check Firestore           │  → scan purchase_orders/{}.items[].productCode === 'N133'
│     ↓ Không trùng            │
│  ③ Check TPOS (duplicate)    │  → TPOSClient.searchProduct('N133') qua OData API
│     ↓ Không trùng            │
│  ④ Check TPOS API            │  → searchTPOSProduct("N133")
│     ↓ Không tồn tại          │
│                               │
│  ✅ Mã "N133" khả dụng!      │
│  → Assign cho item           │
└───────────────────────────────┘
         │
         │ Nếu trùng ở bất kỳ bước nào:
         │ nextNumber++ → "N134" → loop lại
         │
         │ Nếu loop 30 lần vẫn trùng:
         │ → Toast warning: "⚠️ Mã trùng trên TPOS hơn 30 mã"
         │ → "Vào TPOS tìm mã lớn nhất điền tay cho mã sản phẩm đầu tiên"
```

**4 nguồn kiểm tra trùng** (theo thứ tự):

| # | Nguồn | Cách check | File:Line |
| - | ----- | ---------- | --------- |
| 1 | Form hiện tại | `formItems.some(item => item.product_code === code)` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts:459-461` |
| 2 | Firestore purchase_orders | Scan `purchase_orders/{}.items[].productCode` | `purchase-orders/js/lib/product-code-generator.js` → `codeExistsInFirestore()` |
| 3 | TPOS API (duplicate check) | `TPOSClient.searchProduct(code)` qua OData GetViewV2 | `purchase-orders/js/lib/tpos-search.js` → `searchProduct()` |
| 4 | TPOS API | `searchTPOSProduct(candidateCode)` | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:~600` |

**Chi tiết TPOS API Request (Bước ④)**:

- **Hàm**: `searchTPOSProduct(productCode)`
- **File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-api.ts` line 10-42
- **Import**: `import { searchTPOSProduct } from "@/lib/tpos-api";` (line 34 CreatePurchaseOrderDialog.tsx)

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/lib/tpos-api.ts:10-42
export async function searchTPOSProduct(productCode: string): Promise<TPOSProductSearchResult | null> {
  const token = await getActiveTPOSToken();  // Lấy Bearer Token từ settings

  // GET request lên TPOS OData API
  const url = `https://tomato.tpos.vn/odata/Product/OdataService.GetViewV2`
    + `?Active=true`
    + `&DefaultCode=${encodeURIComponent(productCode)}`  // ← Mã SP cần check
    + `&$top=50`
    + `&$orderby=DateCreated desc`
    + `&$count=true`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getTPOSHeaders(token),  // Authorization: Bearer {token}
  });

  const data = await response.json();

  if (data.value && data.value.length > 0) {
    return data.value[0];  // ← Mã đã tồn tại trên TPOS → trả về product
  }
  return null;  // ← Mã chưa tồn tại → khả dụng
}
```

**Request**:
```
GET https://tomato.tpos.vn/odata/Product/OdataService.GetViewV2
    ?Active=true
    &DefaultCode=N4033
    &$top=50
    &$orderby=DateCreated desc
    &$count=true
Headers: { Authorization: "Bearer {tpos_token}" }
```

**Response**:
- `data.value.length > 0` → Mã **N4033 đã tồn tại** trên TPOS → `nextNumber++` → thử N4034
- `data.value.length === 0` → Mã **N4033 khả dụng** → assign cho item

**Ví dụ thực tế** (screenshot: "ao 2" → N4033):
```
detectProductCategory("ao 2") → "AO" match CATEGORY_N_KEYWORDS → category = 'N'
         ↓
maxFromDB = 4032 (giả sử)
         ↓
candidateCode = "N4033"
         ↓
isProductCodeExists("N4033") → false (không trùng form + DB)
         ↓
searchTPOSProduct("N4033")
  → GET https://tomato.tpos.vn/odata/Product/OdataService.GetViewV2?DefaultCode=N4033
  → response: data.value = [] (không tồn tại)
  → return null ✅
         ↓
Assign: item.product_code = "N4033"
```

### 10.10. Bước 8: Assign Mã Cho Item

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~610-635
- Sau khi tìm được mã khả dụng:

```typescript
setItems(prev => {
  const newItems = [...prev];
  // Triple-check trước khi assign:
  // 1. Code vẫn rỗng (chưa bị assign bởi race condition)
  // 2. Không phải manual edit
  // 3. Không duplicate trong form
  if (newItems[index] &&
      !newItems[index].product_code.trim() &&
      !manualProductCodes.has(index)) {

    const isDuplicate = newItems.some((item, i) =>
      i !== index && item.product_code.trim().toUpperCase() === candidateCode.toUpperCase()
    );

    if (!isDuplicate) {
      newItems[index] = { ...newItems[index], product_code: candidateCode };
      currentFormItems.push({ product_code: candidateCode });
    }
  }
  return newItems;
});
```

**Kết quả UI**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Tên sản phẩm          │ Biến thể │ Mã SP    │ SL │ Giá mua   │
├────────────────────────┼──────────┼──────────┼────┼───────────┤
│ 0501 A12 Áo thun trắng│          │ [N133 ✏️]│ 1  │ 0         │
└─────────────────────────────────────────────────────────────────┘
                                      ↑
                              Auto-generated!
                              Read-only (disabled)
                              Bấm ✏️ để sửa tay
```

### 10.11. UI: Pencil/Check Toggle (Sửa Tay Mã SP)

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~2106-2144

**Trạng thái mặc định**: Mã SP **read-only** + icon ✏️ (Pencil)

```
[N133 ✏️]  ← Read-only, disabled=true, readOnly=true
```

**Bấm ✏️ Pencil** → Toggle sang chế độ sửa tay:

```
[N133 ✓]  ← Editable, disabled=false, readOnly=false, focus vào input
```

**Bấm ✓ Check** → Khóa lại mã:

```
[N999 ✏️]  ← Read-only lại, disabled=true, readOnly=true
```

**Logic toggle**:

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:~2127
onClick={() => {
  const newItems = [...items];
  newItems[index]._manualCodeEdit = !newItems[index]._manualCodeEdit;  // Toggle
  setItems(newItems);
  if (newItems[index]._manualCodeEdit) {
    // Auto-focus vào input khi bật edit mode
    setTimeout(() => {
      document.getElementById(`product-code-${index}`)?.focus();
    }, 0);
  }
}}
```

**Icon hiển thị**:

```typescript
{item._manualCodeEdit ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
```

### 10.12. Tracking Manual Edit (manualProductCodes)

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line 445

```typescript
const [manualProductCodes, setManualProductCodes] = useState<Set<number>>(new Set());
```

**Khi user focus vào ô mã SP** (onFocus):

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:~2114
onFocus={() => {
  setManualProductCodes(prev => new Set(prev).add(index));
}}
```

→ Thêm `index` vào Set → auto-generate sẽ **SKIP** item này mãi mãi (trừ khi reset form)

**Reset form** → Clear Set:

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:~1372
setManualProductCodes(new Set());
```

### 10.13. Copy Item → Auto-Generate Mã Mới

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~1447-1522
- Khi user bấm nút **Copy** (icon copy) trên 1 row:

```
Bấm Copy  →  copyItem(index)
              ↓
          1. Clone item (deep copy images)
          2. detectProductCategory(itemToCopy.product_name)
          3. Query max từ 3 nguồn (DB + form + purchase_order_items)
          4. Loop check trùng (form + DB + TPOS) tối đa 30 lần
          5. Assign mã mới cho item copy
          6. Insert item mới vào form (sau item gốc)
```

**Nếu category = null** (không detect được) → Toast error:
```
"⚠️ Chưa đủ thông tin để tạo mã SP. Vui lòng nhập thêm:
 • Loại SP (ÁO, TÚI, QUẦN...)
 • Hoặc NCC (Q5, A12...)"
```

### 10.14. Category Keywords Chi Tiết

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts` line 6-40

**CATEGORY_N_KEYWORDS** (Quần áo - 6 keywords):

| Keyword | Tiếng Việt | Ví dụ tên SP |
| ------- | ---------- | ------------ |
| QUAN | Quần | "A12 Quần jeans" |
| AO | Áo | "0501 A5 Áo thun" |
| DAM | Đầm | "B3 Đầm maxi" |
| SET | Set đồ | "A12 Set áo quần" |
| JUM | Jumpsuit | "A5 Jum dài" |
| AOKHOAC | Áo khoác | "A12 Áo khoác dạ" |

**CATEGORY_P_KEYWORDS** (Phụ kiện - 32 keywords):

| Keyword | Tiếng Việt | Keyword | Tiếng Việt |
| ------- | ---------- | ------- | ---------- |
| TUI | Túi | SON | Son |
| MATKINH | Mắt kính | CUSHION | Cushion |
| KINH | Kính | VONG | Vòng (tay, cổ) |
| MAT | Mặt | NHAN | Nhẫn |
| MYPHAM | Mỹ phẩm | BONG | Bông tai |
| BANGDO | Băng đô | PHAN | Phấn |
| GIAYDEP | Giày dép | NA | Nạ (mặt nạ) |
| GIAY | Giày | NUOC | Nước (hoa hồng) |
| DEP | Dép | XIT | Xịt (khoáng) |
| PHU | Phụ (kiện) | GEL | Gel |
| DONG | Đồng (hồ) | TONER | Toner |
| DAY | Dây (chuyền) | SERUM | Serum |
| LAC | Lắc | TINH | Tinh (chất) |
| KHAN | Khăn | TAY | Tẩy (trang) |
| NIT | Nịt | KEM | Kem |
| SUA | Sữa | BANH | Bánh |

### 10.15. Các Hàm Phụ Trợ Trong `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts`

| Hàm | Line | Chức năng |
| ---- | ---- | --------- |
| `extractBaseProductCode(code)` | 47-60 | Tách prefix+số từ variant code: "N123VX" → "N123" |
| `detectProductCategory(name)` | 68-138 | Phân tích tên → return 'N' / 'P' / 'Q' / null |
| `getNextProductCode(category)` | 145-179 | Query products table → tìm max → return next |
| `incrementProductCode(code, existingCodes)` | 187-208 | Tăng mã +1: "N123" → "N124", tránh trùng existingCodes |
| `getMaxNumberFromItems(items, category)` | 216-233 | Scan form items → tìm max number cho category |
| `getMaxNumberFromPurchaseOrderItems(category)` | 242-275 | Query purchase_order_items → tìm max |
| `getMaxNumberFromProducts(category)` | 282-315 | Query products table → tìm max |
| `generateProductCodeFromMax(name, items, userId?)` | 325-368 | Main: detect + max từ 3 nguồn + check TPOS loop |
| `getNextNACode()` | 374-418 | Tạo mã N/A, N/A1, N/A2... cho live_products |
| `generateProductCode(name)` | 425-440 | Simple version: detect + next code (không check form) |
| `isProductCodeExists(code, formItems?)` | 452-502 | Check trùng 3 nguồn: form + purchase_order_items + products |
| `getMaxNumberFromDB(category, tableName)` | 510-530 | RPC version: gọi DB function `get_max_product_code_number` |
| `getMaxNumberFromProductsDB(category)` | 537-541 | Wrapper RPC cho products table |
| `getMaxNumberFromPurchaseOrderItemsDB(category)` | 548-552 | Wrapper RPC cho purchase_order_items table |

### 10.16. EditPurchaseOrderDialog - Khác Biệt

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/EditPurchaseOrderDialog.tsx` line ~213-310 (auto-generate), line ~1276-1315 (UI toggle)

| Điểm | CreatePurchaseOrderDialog | EditPurchaseOrderDialog |
| ---- | ------------------------- | ----------------------- |
| Field tên SP | `product_name` | `_tempProductName` (temp field) |
| Field mã SP | `product_code` | `_tempProductCode` (temp field) |
| Icon | `<Pencil />` / `<Check />` | `<Edit />` / `<Check />` |
| Toggle cho item cũ | Luôn hiện | **Chỉ hiện cho item mới** (`!item.id`) |
| Item cũ (đã lưu DB) | N/A | Read-only, `bg-muted/50 cursor-not-allowed opacity-70` |
| Trigger manual | onFocus → `manualProductCodes.add(index)` | onChange value.trim() → `_manualCodeEdit = true` |
| State tracking | `manualProductCodes` (Set\<number\>) | `_manualCodeEdit` (boolean trên mỗi item) |

### 10.17. Luồng Hoạt Động End-to-End (Tạo Mã SP)

```
User gõ tên SP: "0501 A12 Áo thun trắng"
         │
         ↓ (500ms debounce)
detectProductCategory("0501 A12 Áo thun trắng")
         │
         ↓ convertVietnameseToUpperCase()
"0501 A12 AO THUN TRANG"
         │
         ↓ Tokenize + scan
tokens: ["0501", "A12", "AO", "THUN", "TRANG"]
  "0501" → ngày ddmm → skip
  "A12"  → NCC pattern → skip
  "AO"   → match CATEGORY_N_KEYWORDS ✅
         │
         ↓ category = 'N'
Query MAX from 3 sources (parallel):
  ├─ products table (RPC) → 125
  ├─ purchase_order_items (RPC) → 130
  └─ form items (scan) → 0
         │
         ↓ max = 130, next = 131
candidateCode = "N131"
         │
         ↓ Check trùng loop:
  ① isProductCodeExists("N131", formItems)
     ├─ form: không trùng ✅
     ├─ purchase_order_items: không trùng ✅
     └─ products: không trùng ✅
  ② searchTPOSProduct("N131")
     └─ Không tồn tại trên TPOS ✅
         │
         ↓ Assign
setItems → item.product_code = "N131"
         │
         ↓ UI update
[N131 ✏️] (read-only, auto-generated)
         │
         ↓ User muốn sửa?
Bấm ✏️ → [N131 ✓] (editable) → sửa → bấm ✓ → [N999 ✏️] (locked)
```

---

## 11. Cài Đặt Validation Giá Mua/Bán - Chi Tiết Từng Bước

### 11.1. Tổng Quan

Dialog **"Cài đặt validation giá mua/bán"** cho phép user cấu hình các giới hạn giá khi tạo/sửa đơn nhập hàng. Settings được lưu **per-user** trong Supabase database.

```
┌──────────────────────────────────────────────────────────────┐
│  ⚙️ Cài đặt validation giá mua/bán                          │
│                                                              │
│  📌 Cách hoạt động:                                          │
│  • Đặt giá trị 0 để không giới hạn                           │
│  • Hệ thống sẽ kiểm tra khi tạo/sửa đơn đặt hàng           │
│  • Nếu vi phạm, sẽ hiển thị cảnh báo chi tiết               │
│                                                              │
│  💰 Giá mua                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐            │
│  │ Giá mua tối thiểu   │  │ Giá mua tối đa      │            │
│  │ (1000đ)     [0 ↕]   │  │ (1000đ)     [0]     │            │
│  │ = 0 đ               │  │ = 0 đ               │            │
│  └─────────────────────┘  └─────────────────────┘            │
│                                                              │
│  💸 Giá bán                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐            │
│  │ Giá bán tối thiểu   │  │ Giá bán tối đa      │            │
│  │ (1000đ)     [0]     │  │ (1000đ)     [0]     │            │
│  │ = 0 đ               │  │ = 0 đ               │            │
│  └─────────────────────┘  └─────────────────────┘            │
│                                                              │
│  📊 Chênh lệch (Margin)                                     │
│  ┌──────────────────────────────────────────┐                │
│  │ Chênh lệch tối thiểu (Giá bán - Giá mua)│                │
│  │ (1000đ)                           [0]    │                │
│  │ = 0 đ                                    │                │
│  └──────────────────────────────────────────┘                │
│  Ví dụ: Đặt 50 nghĩa là giá bán phải cao hơn giá mua       │
│  ít nhất 50.000đ                                             │
│                                                              │
│  ✅ Quy tắc kiểm tra                                        │
│  ☑ Bắt buộc tên sản phẩm                                    │
│  ☑ Bắt buộc mã sản phẩm                                     │
│  ☑ Bắt buộc hình ảnh sản phẩm                               │
│  ☑ Giá mua phải > 0                                         │
│  ☑ Giá bán phải > 0                                         │
│  ☑ Giá bán phải > Giá mua                                   │
│  ☑ Phải có ít nhất 1 sản phẩm                               │
│                                                              │
│  [Đặt lại mặc định]  [Hủy]  [✓ Lưu cài đặt]               │
└──────────────────────────────────────────────────────────────┘
```

### 11.2. File Liên Quan

| File | Đường dẫn đầy đủ | Vai trò |
| ---- | ----------------- | ------- |
| `CreatePurchaseOrderDialog.tsx` | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` | Interface, state, dialog UI, validation logic, save mutation |
| `EditPurchaseOrderDialog.tsx` | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/EditPurchaseOrderDialog.tsx` | Cùng logic validation khi sửa đơn |
| `currency-utils.ts` | `/Users/mac/Downloads/github-html-starter-main/src/lib/currency-utils.ts` | `formatVND()` format tiền VNĐ |
| Migration 1 | `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251102132752_208db819-dc8f-4535-8e3b-4f4c6cf9c01b.sql` | Tạo table `purchase_order_validation_settings` |
| Migration 2 | `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251111032036_009be780-e14a-485e-9f91-e96804cafc13.sql` | Thêm 7 boolean columns (quy tắc kiểm tra) |
| `types.ts` | `/Users/mac/Downloads/github-html-starter-main/src/integrations/supabase/types.ts` | TypeScript types cho table (line ~1148) |

### 11.3. Bước 1: User Bấm Nút ⚙️ Settings

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~1966-2003
- **Vị trí**: Cạnh nút "+ Thêm sản phẩm" và "Chọn từ Kho SP"

```
  🔍 Tìm kiếm sản phẩm theo tên...  │  Ghi chú thêm cho đơn hàng...  │ [⚙️] │ + Thêm sản phẩm │ Chọn từ Kho SP │
                                                                          ↑
                                                                    Bấm vào đây
```

**onClick**: `setShowValidationSettings(true)` → mở dialog

**Nút highlight khi có settings active**:
```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:~1976
className={cn(
  "h-10 w-10 p-0 shrink-0 transition-all",
  (validationSettings.minPurchasePrice > 0 ||
   validationSettings.maxPurchasePrice > 0 ||
   validationSettings.minSellingPrice > 0 ||
   validationSettings.maxSellingPrice > 0 ||
   validationSettings.minMargin > 0)
    ? "bg-primary/10 text-primary border-primary hover:bg-primary/20"  // ← Highlight
    : "hover:bg-primary/10 hover:text-primary hover:border-primary"     // ← Bình thường
)}
```

**Tooltip**: "Cài đặt validation giá mua/bán" + "✅ Validation đang hoạt động" (nếu active)

### 11.4. Bước 2: Dialog Mở → Load Settings Từ Database

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~253-264

**Query Supabase** khi component mount:
```typescript
// line ~253
const { data: dbValidationSettings } = useQuery({
  queryKey: ['purchase-order-validation-settings'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('purchase_order_validation_settings')
      .select('*')
      .maybeSingle();
    return data || DEFAULT_VALIDATION_SETTINGS;
  },
});
```

**Mapping DB columns → Frontend state** (useEffect line ~269):

| DB Column (snake_case) | Frontend State (camelCase) | Ý nghĩa |
| ---------------------- | -------------------------- | -------- |
| `min_purchase_price` | `minPurchasePrice` | Giá mua tối thiểu (đơn vị 1000đ) |
| `max_purchase_price` | `maxPurchasePrice` | Giá mua tối đa (đơn vị 1000đ) |
| `min_selling_price` | `minSellingPrice` | Giá bán tối thiểu (đơn vị 1000đ) |
| `max_selling_price` | `maxSellingPrice` | Giá bán tối đa (đơn vị 1000đ) |
| `min_margin` | `minMargin` | Chênh lệch tối thiểu (đơn vị 1000đ) |
| `enable_require_product_name` | `enableRequireProductName` | Bắt buộc tên SP |
| `enable_require_product_code` | `enableRequireProductCode` | Bắt buộc mã SP |
| `enable_require_product_images` | `enableRequireProductImages` | Bắt buộc hình ảnh |
| `enable_require_positive_purchase_price` | `enableRequirePositivePurchasePrice` | Giá mua > 0 |
| `enable_require_positive_selling_price` | `enableRequirePositiveSellingPrice` | Giá bán > 0 |
| `enable_require_selling_greater_than_purchase` | `enableRequireSellingGreaterThanPurchase` | Giá bán > Giá mua |
| `enable_require_at_least_one_item` | `enableRequireAtLeastOneItem` | Ít nhất 1 SP |

### 11.5. Đơn Vị 1000đ - Cách Hoạt Động

Tất cả giá trị trong settings và validation đều dùng **đơn vị 1000 VNĐ**:

| User nhập | Lưu DB | Hiển thị | Khi validate |
| --------- | ------ | -------- | ------------ |
| 50 | `min_purchase_price = 50` | `formatVND(50 * 1000)` = "50.000 đ" | `purchasePrice < 50` |
| 100 | `max_purchase_price = 100` | `formatVND(100 * 1000)` = "100.000 đ" | `purchasePrice > 100` |
| 0 | `min_margin = 0` | "0 đ" | Không check (0 = không giới hạn) |

**Hàm format**:
```typescript
// /Users/mac/Downloads/github-html-starter-main/src/lib/currency-utils.ts
export function formatVND(value: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
}
```

### 11.6. Interface ValidationSettings

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line 201-216

```typescript
interface ValidationSettings {
  minPurchasePrice: number;    // Giá mua tối thiểu (1000đ), 0 = không giới hạn
  maxPurchasePrice: number;    // Giá mua tối đa (1000đ), 0 = không giới hạn
  minSellingPrice: number;     // Giá bán tối thiểu (1000đ), 0 = không giới hạn
  maxSellingPrice: number;     // Giá bán tối đa (1000đ), 0 = không giới hạn
  minMargin: number;           // Chênh lệch tối thiểu (1000đ), 0 = chỉ yêu cầu bán > mua

  enableRequireProductName: boolean;                    // Bắt buộc tên SP
  enableRequireProductCode: boolean;                    // Bắt buộc mã SP
  enableRequireProductImages: boolean;                  // Bắt buộc hình ảnh
  enableRequirePositivePurchasePrice: boolean;           // Giá mua > 0
  enableRequirePositiveSellingPrice: boolean;             // Giá bán > 0
  enableRequireSellingGreaterThanPurchase: boolean;       // Giá bán > Giá mua
  enableRequireAtLeastOneItem: boolean;                   // Ít nhất 1 SP
}
```

**Default values** (line 219-232): Tất cả price = 0 (không giới hạn), tất cả boolean = `true` (bật hết)

### 11.7. Bước 3: User Chỉnh Settings → Bấm "Lưu cài đặt"

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~2823

**Khi bấm "Lưu cài đặt"**:
```typescript
// line ~2823
onClick={() => {
  saveValidationSettingsMutation.mutate(tempValidationSettings);
}}
```

**Mutation logic** (line 298-361):
```
Bấm "Lưu cài đặt"
     ↓
saveValidationSettingsMutation.mutate(tempValidationSettings)
     ↓
supabase.from('purchase_order_validation_settings')
  .upsert({
    user_id: user.id,
    min_purchase_price: settings.minPurchasePrice,
    max_purchase_price: settings.maxPurchasePrice,
    min_selling_price: settings.minSellingPrice,
    max_selling_price: settings.maxSellingPrice,
    min_margin: settings.minMargin,
    enable_require_product_name: settings.enableRequireProductName,
    // ... 6 boolean columns nữa
  }, { onConflict: 'user_id' })   ← UPSERT theo user_id
     ↓
onSuccess:
  ├─ Update validationSettings state
  ├─ Invalidate query cache
  ├─ Đóng dialog: setShowValidationSettings(false)
  └─ Toast: "✅ Đã lưu cài đặt"
     ↓
onError:
  └─ Toast: "❌ Lỗi lưu cài đặt"
```

**3 nút trong dialog**:

| Nút | Label | onClick | Chức năng |
| --- | ----- | ------- | --------- |
| 1 | "Đặt lại mặc định" | `setTempValidationSettings(DEFAULT_VALIDATION_SETTINGS)` | Reset về default (tất cả = 0, boolean = true) |
| 2 | "Hủy" | `setTempValidationSettings(validationSettings); setShowValidationSettings(false)` | Bỏ thay đổi, đóng dialog |
| 3 | "✓ Lưu cài đặt" | `saveValidationSettingsMutation.mutate(tempValidationSettings)` | Lưu vào DB |

### 11.8. Bước 4: Validation Real-Time (Red Border Trên Input)

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~2155-2181

**Giá mua** (line ~2155-2166):
```typescript
<Input
  type="text" inputMode="numeric" placeholder="0"
  value={item.purchase_price === 0 || item.purchase_price === "" ? "" : item.purchase_price}
  onChange={(e) => updateItem(index, "purchase_price", parseNumberInput(e.target.value))}
  className={`... ${
    (item.purchase_price === 0 || item.purchase_price === "")
      ? 'ring-2 ring-red-500 ring-inset'   // ← VIỀN ĐỎ khi = 0 hoặc rỗng
      : ''
  }`}
/>
```

**Giá bán** (line ~2169-2181):
```typescript
<Input
  type="text" inputMode="numeric" placeholder="0"
  value={item.selling_price === 0 || item.selling_price === "" ? "" : item.selling_price}
  onChange={(e) => updateItem(index, "selling_price", parseNumberInput(e.target.value))}
  className={`... ${
    (item.selling_price === 0 || item.selling_price === "") ||
    (Number(item.selling_price) <= Number(item.purchase_price))
      ? 'ring-2 ring-red-500 ring-inset'   // ← VIỀN ĐỎ khi = 0/rỗng HOẶC giá bán ≤ giá mua
      : ''
  }`}
/>
```

**Quy tắc viền đỏ**:

| Field | Điều kiện viền đỏ | Ví dụ |
| ----- | ----------------- | ----- |
| Giá mua | `purchase_price === 0` hoặc rỗng | Screenshot hình 1: viền đỏ vì = 0 |
| Giá bán | `selling_price === 0` hoặc rỗng, HOẶC `selling_price ≤ purchase_price` | Screenshot hình 1: viền đỏ vì = 0 |

**Lưu ý**: Viền đỏ này là validation cứng (hard-coded), KHÔNG phụ thuộc vào ValidationSettings. Settings chỉ ảnh hưởng khi submit.

### 11.9. Bước 5: Validation Khi Submit (Tạo Đơn / Lưu Nháp)

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line ~850-884

**Hàm `validatePriceSettings()`** (line 371-408):

```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:371
const validatePriceSettings = (
  purchasePrice: number,
  sellingPrice: number,
  itemNumber: number,
  settings: ValidationSettings
): string[] => {
  const errors: string[] = [];

  // ① Giá mua tối thiểu
  if (settings.minPurchasePrice > 0 && purchasePrice < settings.minPurchasePrice) {
    errors.push(`Dòng ${itemNumber}: Giá mua (${formatVND(purchasePrice * 1000)}) thấp hơn tối thiểu (${formatVND(settings.minPurchasePrice * 1000)})`);
  }

  // ② Giá mua tối đa
  if (settings.maxPurchasePrice > 0 && purchasePrice > settings.maxPurchasePrice) {
    errors.push(`Dòng ${itemNumber}: Giá mua (${formatVND(purchasePrice * 1000)}) vượt quá tối đa (${formatVND(settings.maxPurchasePrice * 1000)})`);
  }

  // ③ Giá bán tối thiểu
  if (settings.minSellingPrice > 0 && sellingPrice < settings.minSellingPrice) {
    errors.push(`Dòng ${itemNumber}: Giá bán (${formatVND(sellingPrice * 1000)}) thấp hơn tối thiểu (${formatVND(settings.minSellingPrice * 1000)})`);
  }

  // ④ Giá bán tối đa
  if (settings.maxSellingPrice > 0 && sellingPrice > settings.maxSellingPrice) {
    errors.push(`Dòng ${itemNumber}: Giá bán (${formatVND(sellingPrice * 1000)}) vượt quá tối đa (${formatVND(settings.maxSellingPrice * 1000)})`);
  }

  // ⑤ Chênh lệch tối thiểu (Margin)
  const margin = sellingPrice - purchasePrice;
  if (settings.minMargin > 0 && margin < settings.minMargin) {
    errors.push(`Dòng ${itemNumber}: Chênh lệch (${formatVND(margin * 1000)}) thấp hơn mức tối thiểu (${formatVND(settings.minMargin * 1000)})`);
  }

  return errors;
};
```

**Gọi khi submit** (line ~871):
```typescript
items.forEach((item, index) => {
  const priceErrors = validatePriceSettings(
    Number(item.purchase_price),
    Number(item.selling_price),
    index + 1,
    validationSettings
  );
  validationErrors.push(...priceErrors);
});

if (validationErrors.length > 0) {
  throw new Error("❌ Vui lòng điền đầy đủ thông tin:\n\n" + validationErrors.join("\n"));
}
```

### 11.10. Database Schema

- **Table**: `purchase_order_validation_settings`
- **Migration 1**: `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251102132752_208db819-dc8f-4535-8e3b-4f4c6cf9c01b.sql`

```sql
CREATE TABLE IF NOT EXISTS public.purchase_order_validation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  min_purchase_price INTEGER NOT NULL DEFAULT 0,
  max_purchase_price INTEGER NOT NULL DEFAULT 0,
  min_selling_price INTEGER NOT NULL DEFAULT 0,
  max_selling_price INTEGER NOT NULL DEFAULT 0,
  min_margin INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)  -- Mỗi user chỉ có 1 row settings
);

-- RLS: Mỗi user chỉ xem/sửa settings của mình
ALTER TABLE public.purchase_order_validation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own" FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own" FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own" FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own" FOR DELETE USING (auth.uid() = user_id);
```

- **Migration 2** (thêm boolean columns): `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251111032036_009be780-e14a-485e-9f91-e96804cafc13.sql`

```sql
ALTER TABLE public.purchase_order_validation_settings
ADD COLUMN IF NOT EXISTS enable_require_product_name BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_require_product_code BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_require_product_images BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_require_positive_purchase_price BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_require_positive_selling_price BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_require_selling_greater_than_purchase BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_require_at_least_one_item BOOLEAN NOT NULL DEFAULT TRUE;
```

### 11.11. Ví Dụ Thực Tế (Theo Screenshot)

**Screenshot 1**: "ao 77", Giá mua = 23, Giá bán = 45, Thành tiền = 23.000 đ

```
Nếu settings: minPurchasePrice = 20, maxPurchasePrice = 200, minMargin = 10

validatePriceSettings(23, 45, 1, settings):
  ① 23 >= 20 → ✅ Giá mua OK
  ② 23 <= 200 → ✅ Giá mua OK
  ③ 45 >= 0  → ✅ Giá bán OK (minSellingPrice = 0)
  ④ 45 <= 0  → ✅ Giá bán OK (maxSellingPrice = 0 = không giới hạn)
  ⑤ margin = 45 - 23 = 22 >= 10 → ✅ Chênh lệch OK

→ Không có lỗi → Cho phép tạo đơn
```

**Nếu Giá mua = 5 (thấp hơn tối thiểu 20)**:
```
validatePriceSettings(5, 45, 1, settings):
  ① 5 < 20 → ❌ "Dòng 1: Giá mua (5.000 đ) thấp hơn tối thiểu (20.000 đ)"

→ Toast error: "❌ Vui lòng điền đầy đủ thông tin: ..."
→ BLOCK tạo đơn
```

### 11.12. Luồng Hoạt Động End-to-End (Validation)

```
User bấm ⚙️ Settings
     ↓
setShowValidationSettings(true) → Mở dialog
     ↓
Load settings từ Supabase (useQuery → purchase_order_validation_settings)
     ↓
User chỉnh: minPurchasePrice=20, maxPurchasePrice=200, minMargin=10
     ↓
Bấm "Lưu cài đặt"
     ↓
supabase.upsert({ user_id, min_purchase_price: 20, ... })
     ↓
Toast: "✅ Đã lưu cài đặt" → Đóng dialog
     ↓
Nút ⚙️ highlight (bg-primary/10) vì có settings active
     ↓
User nhập sản phẩm: "ao 77", giá mua = 23, giá bán = 45
     ↓
Real-time: Giá mua > 0 → không viền đỏ ✅
Real-time: Giá bán > Giá mua → không viền đỏ ✅
     ↓
User bấm "Tạo đơn hàng" hoặc "Lưu nháp"
     ↓
validatePriceSettings(23, 45, 1, validationSettings)
  ├─ 23 >= 20 (minPurchasePrice) ✅
  ├─ 23 <= 200 (maxPurchasePrice) ✅
  └─ 45 - 23 = 22 >= 10 (minMargin) ✅
     ↓
Không có lỗi → Tạo đơn thành công
```

---

## 12. Nút "Tạo Đơn Hàng" / "Lưu Nháp" / "Hủy" - Chi Tiết Từng Bước

### 12.1. Tổng Quan 3 Nút

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`

```
┌───────────────────────────────────────────────────────────────────┐
│  Tổng số lượng: 1   Tổng tiền: 23.000 đ   Giảm giá: [0]        │
│                                                                   │
│                          THÀNH TIỀN: 23.000 đ                    │
│                                                                   │
│                              [Hủy]  [Lưu nháp]  [Tạo đơn hàng] │
└───────────────────────────────────────────────────────────────────┘
```

| Nút | Label | Line | Handler | Status khi lưu |
| --- | ----- | ---- | ------- | --------------- |
| Hủy | "Hủy" | 2353-2355 | `handleClose()` | Không lưu gì |
| Lưu nháp | "Lưu nháp" / "Đang lưu..." | 2356-2362 | `saveDraftMutation.mutate()` | `status: 'draft'` |
| Tạo đơn hàng | "Tạo đơn hàng" / "Đang tạo..." | 2363-2389 | `createOrderMutation.mutate()` | `status: 'awaiting_export'` |

### 12.2. Nút "Hủy" → handleClose()

- **Line**: 2353-2355
- **Handler**: `handleClose()` (line ~1395)

```
Bấm "Hủy"
     ↓
handleClose()
     ↓
Có thay đổi chưa lưu?
  ├─ Có → setShowCloseConfirm(true) → Hiện dialog xác nhận
  │         ├─ Xác nhận → Đóng dialog, resetForm()
  │         └─ Hủy → Quay lại form
  └─ Không → Đóng dialog ngay, resetForm()
```

### 12.3. Nút "Lưu nháp" → saveDraftMutation

- **Line**: 2356-2362 (button), 725-848 (mutation)
- **KHÔNG validate** (lưu dù chưa đầy đủ thông tin)
- **Status**: `'draft'`

**Luồng chi tiết**:

```
Bấm "Lưu nháp"
     ↓
saveDraftMutation.mutate()
     ↓
① Tính tiền (× 1000 cho DB):
   totalAmount = Σ(item._tempTotalPrice) × 1000
   discountAmount = formData.discount_amount × 1000
   shippingFee = formData.shipping_fee × 1000
   finalAmount = totalAmount - discountAmount + shippingFee
     ↓
② Có initialData?.id? (đang sửa draft cũ?)
   ├─ CÓ → UPDATE purchase_orders (status='draft')
   │        → DELETE old items
   │        → INSERT new items
   └─ KHÔNG → INSERT purchase_orders (status='draft')
              → INSERT purchase_order_items
     ↓
③ Lưu items vào DB:
   items.filter(i => i.product_name.trim())  ← Bỏ dòng rỗng
   .map(item => ({
     purchase_order_id: order.id,
     quantity: item.quantity,
     position: index + 1,
     product_code: item.product_code.trim().toUpperCase(),
     product_name: item.product_name.trim().toUpperCase(),
     variant: item.variant?.trim().toUpperCase() || null,
     purchase_price: Number(item.purchase_price) × 1000,
     selling_price: Number(item.selling_price) × 1000,
     product_images: [...],
     price_images: [...],
     selected_attribute_value_ids: item.selectedAttributeValueIds || null,
   }))
     ↓
onSuccess:
   → Toast: "Đã lưu nháp!"
   → Invalidate cache: ["purchase-orders"]
   → Đóng dialog: onOpenChange(false)
   → resetForm()
     ↓
onError:
   → Toast: "Lỗi lưu nháp" + error.message
```

**Khác biệt với "Tạo đơn hàng"**:
- KHÔNG validate supplier, prices, images
- KHÔNG gọi edge function TPOS
- KHÔNG tạo parent products
- KHÔNG convert images sang base64
- Status = `'draft'` (không phải `'awaiting_export'`)

### 12.4. Nút "Tạo đơn hàng" → Pre-Validation (Real-time)

- **Line**: 2363-2389 (button), 666-723 (validateItems)

**Trước khi gọi mutation**, button check `isItemsValid`:

```typescript
// Line 723 - useMemo chạy real-time khi items thay đổi
const { isValid: isItemsValid, invalidFields } = useMemo(
  () => validateItems(), [items, validationSettings]
);
```

**Nút disabled** khi `!isItemsValid`:
```typescript
// Line 2386
disabled={createOrderMutation.isPending || !isItemsValid}
className={!isItemsValid ? "opacity-50 cursor-not-allowed" : ""}
```

**Khi bấm mà `!isItemsValid`** → Hiện toast lỗi chi tiết:
```typescript
// Line 2366-2380
toast({
  title: "Không thể tạo đơn hàng",
  description: (
    <ul className="list-disc list-inside text-xs">
      {invalidFields.map((field, idx) => <li key={idx}>{field}</li>)}
    </ul>
  ),
  variant: "destructive",
});
return;  // ← KHÔNG gọi mutation
```

### 12.5. validateItems() - 7 Quy Tắc Kiểm Tra

- **File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx` line 666-720
- **Chạy real-time** qua `useMemo` (line 723)
- **Phụ thuộc** vào `validationSettings` (từ section 11)

| # | Check | Điều kiện bật | Lỗi khi vi phạm |
| - | ----- | ------------- | ---------------- |
| 1 | Ít nhất 1 SP | `enableRequireAtLeastOneItem` | "Phải có ít nhất 1 sản phẩm" |
| 2 | Tên SP | `enableRequireProductName` | "Dòng X: Thiếu tên sản phẩm" |
| 3 | Mã SP | `enableRequireProductCode` | "Dòng X: Thiếu mã sản phẩm" |
| 4 | Giá mua > 0 | `enableRequirePositivePurchasePrice` | "Dòng X: Giá mua phải > 0" |
| 5 | Giá bán > 0 | `enableRequirePositiveSellingPrice` | "Dòng X: Giá bán phải > 0" |
| 6 | Giá bán > Giá mua | `enableRequireSellingGreaterThanPurchase` | "Dòng X: Giá bán (Y đ) phải lớn hơn giá mua (Z đ)" |
| 7 | Hình ảnh SP | `enableRequireProductImages` | "Dòng X: Thiếu hình ảnh sản phẩm" |

### 12.6. Bước 1: Validation Khi Submit (createOrderMutation)

- **Line**: 850-884

```
createOrderMutation.mutate()
     ↓
① Validate NCC:
   if (!formData.supplier_name?.trim())
     → throw "❌ Vui lòng nhập tên nhà cung cấp"
     ↓
② Validate items:
   if (items.length === 0)
     → throw "❌ Vui lòng thêm ít nhất một sản phẩm"
     ↓
③ Validate giá từng item (validatePriceSettings):
   items.forEach((item, index) => {
     priceErrors = validatePriceSettings(
       Number(item.purchase_price),
       Number(item.selling_price),
       index + 1,
       validationSettings   ← Settings từ Section 11
     );
   })
     ↓
④ Nếu có lỗi:
   throw "❌ Vui lòng điền đầy đủ thông tin:\n" + errors.join("\n")
   → Toast destructive → STOP
```

### 12.7. Bước 2: Pre-Convert Images Sang Base64

- **Line**: 886-913

```
Lấy tất cả product_images URLs từ items
     ↓
Loại bỏ trùng lặp (Set)
     ↓
Kiểm tra URL nào chưa có trong imageCache (Map<URL, base64>)
     ↓
Nếu có uncached:
  → Toast: "⏳ Đang chuẩn bị X ảnh..."
  → Promise.all: fetch từng URL → convert sang base64
  → Nếu ảnh > MAX_IMAGE_BYTES → resize (resizeImageBlob)
  → Lưu vào imageCache
     ↓
Log: "✅ All images cached: X total"
```

**Hàm convert** (line 140-171):
```typescript
// /Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx:140
const convertUrlToBase64 = async (url: string): Promise<string | null> => {
  const response = await fetch(url);
  let blob = await response.blob();
  if (blob.size > MAX_IMAGE_BYTES) {
    blob = await resizeImageBlob(blob);  // Resize ảnh quá lớn
  }
  // FileReader → base64 (bỏ prefix "data:image/...;base64,")
  return base64Data;
};
```

### 12.8. Bước 3: Tính Tiền (× 1000)

- **Line**: 915-918

```typescript
const totalAmount = items.reduce((sum, item) => sum + item._tempTotalPrice, 0) * 1000;
const discountAmount = formData.discount_amount * 1000;
const shippingFee = formData.shipping_fee * 1000;
const finalAmount = totalAmount - discountAmount + shippingFee;
```

| Giá trị | Công thức | Ví dụ (screenshot: giá mua=23, SL=1) |
| ------- | --------- | ------------------------------------- |
| `_tempTotalPrice` | `quantity × purchase_price` | 1 × 23 = 23 |
| `totalAmount` | `Σ(_tempTotalPrice) × 1000` | 23 × 1000 = 23.000 |
| `discountAmount` | `discount × 1000` | 0 × 1000 = 0 |
| `shippingFee` | `shipping × 1000` | 0 × 1000 = 0 |
| `finalAmount` | `total - discount + shipping` | 23.000 - 0 + 0 = 23.000 |

### 12.9. Bước 4: INSERT purchase_orders

- **Line**: 1075-1092

```
supabase.from("purchase_orders").insert({
  supplier_name: "NCC TÊN".toUpperCase(),
  order_date: "2026-02-23T...",
  invoice_amount: formData.invoice_amount × 1000,
  total_amount: 23000,
  final_amount: 23000,
  discount_amount: 0,
  shipping_fee: 0,
  invoice_images: [...] hoặc null,
  notes: "GHI CHÚ".toUpperCase(),
  status: 'awaiting_export'       ← ⚠️ KHÔNG phải 'draft'
}).select().single()
     ↓
Trả về: order { id, ... }
```

**Data transformations**:
- Tất cả text → `.trim().toUpperCase()`
- Tất cả tiền → `× 1000`
- Images rỗng → `null`
- Status = `'awaiting_export'`

### 12.10. Bước 5: INSERT purchase_order_items

- **Line**: 1095-1128

```
items
  .filter(item => item.product_name.trim())    ← Bỏ dòng rỗng
  .map((item, index) => ({
    purchase_order_id: order.id,
    quantity: item.quantity,                     // 1
    position: index + 1,                        // 1, 2, 3...
    notes: "...".toUpperCase() || null,
    product_code: "N4033",                      // toUpperCase
    product_name: "AO 77",                      // toUpperCase
    variant: "TRANG, M" || null,                // toUpperCase
    purchase_price: 23 × 1000 = 23000,          // × 1000
    selling_price: 45 × 1000 = 45000,           // × 1000
    product_images: ["url1", "url2"],
    price_images: ["url3"],
    selected_attribute_value_ids: ["uuid1", "uuid2"] || null,
    tpos_product_id: null,                      // Chưa có TPOS ID
    tpos_sync_status: 'pending',                // Chờ edge function xử lý
    tpos_sync_completed_at: null,
  }))
     ↓
supabase.from("purchase_order_items").insert(orderItems)
```

### 12.11. Bước 6: Gọi Edge Function (Background TPOS Processing)

- **Line**: 1130-1169

```
① Convert imageCache Map → plain Object:
   cacheObject = Object.fromEntries(imageCache)
     ↓
② Toast loading: "Đang xử lý 0/1 sản phẩm..."
     ↓
③ Fire-and-forget (KHÔNG await):
   supabase.functions.invoke(
     'process-purchase-order-background',
     { body: {
         purchase_order_id: order.id,
         imageCache: cacheObject    ← base64 images
     }}
   )
     ↓
④ Start polling:
   pollTPOSProcessingProgress(order.id, totalItems, toastId)
```

**Edge function**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/process-purchase-order-background/index.ts`
- Nhận `purchase_order_id` + `imageCache`
- Group items theo `product_code` + `selected_attribute_value_ids`
- Tạo sản phẩm variant trên TPOS API
- Update `tpos_sync_status` = 'success' / 'failed' cho từng item

### 12.12. Bước 7: Polling Tiến Trình TPOS

- **Line**: 1258-1355

```
pollTPOSProcessingProgress(orderId, totalItems, toastId)
     ↓
Mỗi 1-3 giây (adaptive backoff × 1.2, max 3s):
     ↓
Query: supabase.from('purchase_order_items')
  .select('id, tpos_sync_status, product_code, tpos_sync_error')
  .eq('purchase_order_id', orderId)
     ↓
Đếm:
  successCount = items.filter(status === 'success').length
  failedCount = items.filter(status === 'failed').length
  completedCount = successCount + failedCount
     ↓
Update toast: "Đang xử lý 1/3 sản phẩm... (1 ✅, 0 ❌)"
     ↓
Khi completedCount >= totalItems:
  ├─ Tất cả ✅: "✅ Đã tạo thành công X sản phẩm trên TPOS!"
  ├─ Tất cả ❌: "❌ Tất cả X sản phẩm đều lỗi"
  └─ Pha trộn: "⚠️ X thành công, Y lỗi. Retry trong chi tiết đơn"
     ↓
Timeout: 60 polls (≈2 phút) → "⏱️ Timeout: Xử lý quá lâu"
```

### 12.13. Bước 8: Tạo Parent Products

- **Line**: 1171-1236

```
① Group items theo product_code:
   Map<product_code, { variants: Set<string>, data: {...} }>
     ↓
② Với mỗi product_code (ví dụ "N4033"):
   → Check: supabase.from("products").select().eq("product_code", "N4033")
   → Nếu CHƯA tồn tại → Thêm vào danh sách tạo mới
     ↓
③ INSERT vào products table:
   {
     product_code: "N4033",
     base_product_code: "N4033",
     product_name: "AO 77",
     purchase_price: 23000,
     selling_price: 45000,
     supplier_name: "NCC TÊN",
     product_images: ["url1"],
     price_images: ["url3"],
     stock_quantity: 0,
     unit: 'Cái',
     variant: "TRANG, M" (nếu có nhiều variant gộp lại)
   }
```

### 12.14. Bước 9: onSuccess → Đóng Dialog

- **Line**: 1240-1248

```
onSuccess:
  ├─ Invalidate cache:
  │   ├─ ["purchase-orders"]      → Refresh danh sách đơn
  │   ├─ ["purchase-order-stats"] → Refresh thống kê
  │   ├─ ["products"]             → Refresh danh sách SP
  │   └─ ["products-select"]      → Refresh dropdown SP
  ├─ onOpenChange(false)          → Đóng dialog
  └─ resetForm()                  → Reset form về mặc định
       ├─ imageCache.clear()
       ├─ formData = { supplier: "", ... }
       ├─ items = [{ empty item }]
       └─ manualProductCodes = new Set()
```

**KHÔNG hiện toast success** ở đây (toast do polling function hiện khi TPOS xong)

### 12.15. onError → Hiện Toast Lỗi

- **Line**: 1249-1255

```
onError:
  → Toast destructive: "Lỗi tạo đơn hàng" + error.message
  → Dialog KHÔNG đóng → User sửa lỗi rồi thử lại
```

### 12.16. Luồng End-to-End Hoàn Chỉnh

```
User điền form: NCC="A12", SP="ao 77", Mã="N4033", Giá mua=23, Giá bán=45
     │
     ↓ Bấm "Tạo đơn hàng"
     │
Pre-check: isItemsValid? (useMemo real-time)
  ├─ Tên SP ✅, Mã SP ✅, Giá mua > 0 ✅, Giá bán > 0 ✅, Giá bán > Giá mua ✅
  └─ Hình ảnh? (tùy settings)
     │
     ↓ createOrderMutation.mutate()
     │
① VALIDATE:
   NCC="A12" ✅ (không rỗng)
   items.length=1 ✅ (≥ 1)
   validatePriceSettings(23, 45, 1, settings) → [] (không lỗi)
     │
     ↓
② PRE-CONVERT IMAGES:
   product_images = [] → uncached = 0 → skip
     │
     ↓
③ TÍNH TIỀN:
   totalAmount = 23 × 1000 = 23.000
   finalAmount = 23.000 - 0 + 0 = 23.000
     │
     ↓
④ INSERT purchase_orders:
   { supplier="A12", status="awaiting_export", total=23000, final=23000 }
   → order.id = "abc-123..."
     │
     ↓
⑤ INSERT purchase_order_items:
   [{ order_id="abc-123", code="N4033", name="AO 77",
      purchase_price=23000, selling_price=45000,
      tpos_sync_status="pending" }]
     │
     ↓
⑥ EDGE FUNCTION (fire-and-forget):
   process-purchase-order-background({ purchase_order_id: "abc-123", imageCache: {} })
     │
     ↓
⑦ POLLING (mỗi 1-3s):
   Toast: "Đang xử lý 0/1 sản phẩm..."
   → Query DB → tpos_sync_status = 'success'
   → Toast: "✅ Đã tạo thành công 1 sản phẩm trên TPOS!"
     │
     ↓
⑧ TẠO PARENT PRODUCT:
   Check products table → "N4033" chưa tồn tại
   → INSERT { product_code="N4033", name="AO 77", stock=0, unit="Cái" }
     │
     ↓
⑨ ON SUCCESS:
   → Invalidate 4 query caches
   → Đóng dialog
   → Reset form
     │
     ↓
DONE ✅
```

---

## 13. Edge Functions: Variant + TPOS Logic Sau Khi Tạo Đơn - Chi Tiết Từng Bước

### 13.1. Tổng Quan 2 Edge Functions

Sau khi bấm **"Tạo đơn hàng"**, frontend gọi edge function theo chuỗi:

```
Frontend (CreatePurchaseOrderDialog)
     ↓ fire-and-forget
Edge Function 1: process-purchase-order-background
     ↓ gọi cho từng group
Edge Function 2: create-tpos-variants-from-order
     ↓ POST
TPOS API: https://tomato.tpos.vn/odata/ProductTemplate/ODataService.InsertV2
```

| Edge Function | Đường dẫn đầy đủ | Vai trò |
| ------------- | ----------------- | ------- |
| `process-purchase-order-background` | `/Users/mac/Downloads/github-html-starter-main/supabase/functions/process-purchase-order-background/index.ts` | Orchestrator: group items, batch processing, retry, status tracking |
| `create-tpos-variants-from-order` | `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants-from-order/index.ts` | Worker: build TPOS payload, POST API, save products to DB |

### 13.2. Ví Dụ Thực Tế (Theo Screenshot)

Screenshot: 2 items cùng mã **N4033** nhưng variant khác nhau:

```
┌────┬──────────┬──────────────┬──────────┐
│ #  │ Tên SP   │ Biến thể     │ Mã SP    │
├────┼──────────┼──────────────┼──────────┤
│ 1  │ ao 32    │ Đen, 4, XL   │ N4033    │
│    │          │ ✓ 4 thuộc tính│          │
├────┼──────────┼──────────────┼──────────┤
│ 2  │ ao 32    │ Xám, 4, XL   │ N4033    │
│    │          │ ✓ 4 thuộc tính│          │
└────┴──────────┴──────────────┴──────────┘
```

**Khi "Tạo đơn hàng"**: 2 items này sẽ được **GROUP lại thành 1 product** trên TPOS vì cùng `product_code = N4033`.

### 13.3. Edge Function 1: process-purchase-order-background

- **File**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/process-purchase-order-background/index.ts`
- **Input**: `{ purchase_order_id, imageCache }`

**Bước 1: Clean up stuck items** (line 31-50)
```
Tìm items có tpos_sync_status = 'processing' quá 5 phút
     ↓
Update status = 'failed', error = "Timeout: Xử lý quá lâu (> 5 phút)"
```

**Bước 2: Fetch items cần xử lý** (line 72-78)
```sql
SELECT * FROM purchase_order_items
WHERE purchase_order_id = '{id}'
  AND tpos_sync_status IN ('pending', 'failed')
  AND tpos_product_id IS NULL
ORDER BY position
```

**Bước 3: GROUP items theo product_code + attribute IDs** (line 101-112)

```typescript
// Key = "product_code|sorted_attribute_value_ids"
const groupKey = `${item.product_code}|${sortedIds}`;
```

**Ví dụ với screenshot**:
```
Item 1: product_code="N4033", selected_attribute_value_ids=["uuid-den","uuid-4","uuid-xl"]
Item 2: product_code="N4033", selected_attribute_value_ids=["uuid-xam","uuid-4","uuid-xl"]

Sorted IDs:
  Item 1: "uuid-4,uuid-den,uuid-xl"
  Item 2: "uuid-4,uuid-xam,uuid-xl"

Group keys:
  "N4033|uuid-4,uuid-den,uuid-xl" → [Item 1]
  "N4033|uuid-4,uuid-xam,uuid-xl" → [Item 2]

→ 2 groups (vì attribute IDs khác nhau)
```

**LƯU Ý**: Nếu 2 items có CÙNG product_code VÀ CÙNG attribute IDs → chúng nằm trong 1 group → chỉ tạo 1 sản phẩm TPOS.

**Bước 4: Lock items = 'processing'** (line 143-155)
```
Mỗi group → UPDATE tpos_sync_status = 'processing', tpos_sync_started_at = NOW()
```

**Bước 5: Gọi Edge Function 2 cho mỗi group** (line 158-205)
```
Batch processing: MAX_CONCURRENT = 8 groups song song
     ↓
Mỗi group → supabase.functions.invoke('create-tpos-variants-from-order', {
  body: {
    baseProductCode: "N4033",
    productName: "AO 32",
    purchasePrice: 23000 / 1000 = 23,     ← Chia 1000 lại (edge function sẽ × 1000)
    sellingPrice: 45000 / 1000 = 45,       ← Chia 1000 lại
    selectedAttributeValueIds: ["uuid-den","uuid-4","uuid-xl"],
    productImages: ["url1"],
    supplierName: "NCC TÊN",
    imageCache: { "url1": "base64data..." }
  }
})
     ↓
Retry logic: max 2 lần, backoff 2s/4s nếu 429 (rate limit)
```

**Bước 6: Update final status** (line 236-277)
```
Thành công → tpos_sync_status = 'success', tpos_sync_completed_at = NOW()
Thất bại   → tpos_sync_status = 'failed', tpos_sync_error = "error message"
```

### 13.4. Edge Function 2: create-tpos-variants-from-order

- **File**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants-from-order/index.ts`
- **Input**: `{ baseProductCode, productName, purchasePrice, sellingPrice, selectedAttributeValueIds, productImages, supplierName, imageCache }`

**2 CASE chính**:

| Case | Điều kiện | Ý nghĩa |
| ---- | --------- | ------- |
| **CASE 1** | `selectedAttributeValueIds` rỗng hoặc null | Sản phẩm ĐƠN GIẢN (không có variant) |
| **CASE 2** | `selectedAttributeValueIds` có giá trị | Sản phẩm CÓ VARIANT (có biến thể) |

### 13.5. CASE 1: Sản Phẩm Đơn Giản (Không Variant)

- **Line**: 263-528

```
selectedAttributeValueIds = [] hoặc null
     ↓
① Convert ảnh sang base64 (dùng cache hoặc fetch)
     ↓
② Build payload ~60 fields:
   {
     Id: 0,
     Name: "AO 32",
     DefaultCode: "N4033",
     Barcode: "N4033",
     ListPrice: 45000,           // sellingPrice × 1000
     PurchasePrice: 23000,       // purchasePrice × 1000
     Image: "base64data...",
     IsProductVariant: false,
     ProductVariantCount: 0,
     AttributeLines: [],         // ← Rỗng (không có variant)
     ProductVariants: [],        // ← Rỗng
     UOM: { Id: 1, Name: "Cái" },
     Categ: { Id: 2, Name: "Có thể bán" },
     ...
   }
     ↓
③ GET TPOS token từ tpos_credentials table
     ↓
④ POST lên TPOS API:
   URL: https://tomato.tpos.vn/odata/ProductTemplate/ODataService.InsertV2
        ?$expand=ProductVariants,UOM,UOMPO
   Method: POST
   Headers: { Authorization: "Bearer {token}", Tpos-Agent: "...", Tpos-Retailer: "1" }
   Body: payload JSON
     ↓
⑤ Nếu TPOS trả về lỗi "đã tồn tại" (400):
   → Coi như success (sản phẩm đã có)
     ↓
⑥ Upsert vào products table (Supabase):
   {
     product_code: "N4033",
     base_product_code: "N4033",
     tpos_product_id: tposData.Id,
     product_name: "AO 32",
     variant: null,
     selling_price: 45000,
     purchase_price: 23000,
     stock_quantity: 0,
     product_images: ["url1"],
     supplier_name: "NCC TÊN"
   }
```

### 13.6. CASE 2: Sản Phẩm Có Variant (Theo Screenshot)

- **Line**: 530-1112

```
selectedAttributeValueIds = ["uuid-den", "uuid-4", "uuid-xl", "uuid-xam"]
     ↓
① Query product_attribute_values + JOIN product_attributes:
   SELECT *, product_attributes!attribute_id(id, name, display_order)
   FROM product_attribute_values
   WHERE id IN ('uuid-den', 'uuid-4', 'uuid-xl', 'uuid-xam')
     ↓
② Group values theo attribute (sort by display_order):
   Attribute "Màu" (display_order=1):     [Đen, Xám]
   Attribute "Size Số" (display_order=2):  [4]
   Attribute "Size Chữ" (display_order=3): [XL]
     ↓
③ Tạo tổ hợp Cartesian (tích Descartes):
   [Đen, Xám] × [4] × [XL] = 2 combinations:
     [Đen, 4, XL]
     [Xám, 4, XL]
     ↓
④ Build AttributeLines (cho TPOS biết có những thuộc tính nào):
   [
     { Attribute: {Id: 3, Name: "Màu"}, Values: [{Id: tpos_den, Name: "Đen"}, {Id: tpos_xam, Name: "Xám"}] },
     { Attribute: {Id: 4, Name: "Size Số"}, Values: [{Id: tpos_4, Name: "4"}] },
     { Attribute: {Id: 1, Name: "Size Chữ"}, Values: [{Id: tpos_xl, Name: "XL"}] }
   ]
     ↓
⑤ Build ProductVariants (mỗi tổ hợp = 1 variant):
   [
     {
       NameGet: "N4033 (XL, 4, Đen)",    // ← Đảo ngược thứ tự cho NameGet
       Name: "N4033 (XL, 4, Đen)",
       PriceVariant: 45000,
       AttributeValues: [
         {Id: tpos_den, Name: "Đen", AttributeId: 3},
         {Id: tpos_4, Name: "4", AttributeId: 4},
         {Id: tpos_xl, Name: "XL", AttributeId: 1}
       ]
     },
     {
       NameGet: "N4033 (XL, 4, Xám)",
       Name: "N4033 (XL, 4, Xám)",
       PriceVariant: 45000,
       AttributeValues: [...]
     }
   ]
     ↓
⑥ Build full payload (~60 fields + AttributeLines + ProductVariants):
   {
     Name: "AO 32",
     DefaultCode: "N4033",
     ListPrice: 45000,
     PurchasePrice: 23000,
     Image: "base64...",
     ProductVariantCount: 2,
     AttributeLines: [...],       // ← 3 attribute lines
     ProductVariants: [...],      // ← 2 variant combinations
     ...
   }
     ↓
⑦ POST lên TPOS API InsertV2
   → TPOS tạo 1 parent product + 2 variant products
   → Response chứa ProductVariants[].DefaultCode (mã TPOS tự tạo)
     ↓
⑧ Parse response → Lưu vào Supabase products table:

   Parent product:
   {
     product_code: "N4033",
     variant: "(Đen | Xám) (4) (XL)",     // ← parseParentVariant()
     tpos_product_id: tposData.Id,
     ...
   }

   Child products (từ TPOS response):
   [
     {
       product_code: "N4033DEN4XL",         // ← TPOS tự generate
       base_product_code: "N4033",
       variant: "XL, 4, Đen",              // ← parseChildVariant()
       productid_bienthe: variant.Id,
       ...
     },
     {
       product_code: "N4033XAM4XL",
       base_product_code: "N4033",
       variant: "XL, 4, Xám",
       ...
     }
   ]
     ↓
⑨ Upsert song song: parent + children → products table
```

### 13.7. Giá Tiền Qua Các Tầng

| Tầng | Giá mua | Giá bán | Đơn vị |
| ---- | ------- | ------- | ------ |
| UI (user nhập) | 23 | 45 | × 1000đ |
| INSERT purchase_order_items | 23000 | 45000 | đồng |
| Edge Fn 1 gửi Edge Fn 2 | 23000/1000 = 23 | 45000/1000 = 45 | × 1000đ |
| Edge Fn 2 `parsePriceAndMultiply` | 23 × 1000 = 23000 | 45 × 1000 = 45000 | đồng |
| TPOS API payload | 23000 | 45000 | đồng |
| Supabase products table | 23000 | 45000 | đồng |

### 13.8. NameGet: Đảo Ngược Thứ Tự Variant

- **File**: `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants-from-order/index.ts` line 655-657

```typescript
// Line 657 - Đảo ngược thứ tự cho NameGet
const variantName = `${baseProductCode} (${[...combo].reverse().map(v => v.value).join(", ")})`;
```

| Thứ tự user chọn (display_order) | AttributeValues (giữ nguyên) | NameGet (đảo ngược) |
| --------------------------------- | ---------------------------- | ------------------- |
| Màu=Đen, Size Số=4, Size Chữ=XL | [Đen, 4, XL] | "N4033 (XL, 4, Đen)" |
| Màu=Xám, Size Số=4, Size Chữ=XL | [Xám, 4, XL] | "N4033 (XL, 4, Xám)" |

### 13.9. "Lưu nháp" vs "Tạo đơn hàng" - So Sánh Logic Variant/TPOS

| Khía cạnh | Lưu nháp | Tạo đơn hàng |
| --------- | -------- | ------------- |
| Status | `'draft'` | `'awaiting_export'` |
| Validate | KHÔNG | CÓ (NCC, giá, images) |
| Pre-convert images | KHÔNG | CÓ (base64 cache) |
| Gọi edge function | **KHÔNG** | **CÓ** (`process-purchase-order-background`) |
| Tạo SP trên TPOS | **KHÔNG** | **CÓ** (qua `create-tpos-variants-from-order`) |
| Tạo parent products | KHÔNG | CÓ (INSERT products table) |
| Polling progress | KHÔNG | CÓ (1-3s, max 60 polls) |
| `selected_attribute_value_ids` | Lưu vào DB | Lưu vào DB + gửi TPOS |
| `tpos_sync_status` | Không set | `'pending'` → `'processing'` → `'success'`/`'failed'` |

### 13.10. Xử Lý Lỗi TPOS

| Lỗi | Xử lý | Line |
| ---- | ------ | ---- |
| Rate limit 429 | Retry sau 2s × attempt (max 2 retries) | `process-purchase-order-background:190-193` |
| SP đã tồn tại (400) | Coi như success: `already_exists: true` | `create-tpos-variants-from-order:453-470` |
| TPOS token hết hạn | Throw error → status='failed' | `create-tpos-variants-from-order:436-438` |
| DB save lỗi | Throw error nhưng TPOS đã tạo xong | `create-tpos-variants-from-order:1077-1090` |
| Stuck > 5 phút | Auto clean: status='failed', error="Timeout" | `process-purchase-order-background:31-50` |

### 13.11. TPOS API Endpoint

```
POST https://tomato.tpos.vn/odata/ProductTemplate/ODataService.InsertV2
     ?$expand=ProductVariants,UOM,UOMPO

Headers:
  Authorization: Bearer {tpos_token}
  Content-Type: application/json
  Tpos-Agent: "Node.js v20.5.1, Mozilla/5.0, Windows NT 10.0; Win64; x64"
  Tpos-Retailer: "1"

Body: JSON payload (~60 fields + AttributeLines + ProductVariants)

Response (success):
  {
    Id: 12345,                    // TPOS product template ID
    DefaultCode: "N4033",
    Name: "AO 32",
    ProductVariants: [
      { Id: 67890, DefaultCode: "N4033DEN4XL", Name: "N4033 (XL, 4, Đen)", ... },
      { Id: 67891, DefaultCode: "N4033XAM4XL", Name: "N4033 (XL, 4, Xám)", ... }
    ]
  }
```

---

## 14. Luồng Hoạt Động End-to-End (Toàn Bộ Hệ Thống)


```
                    ┌──────────────────────┐
                    │   TPOS API (OData)   │
                    │  tomato.tpos.vn      │
                    └─────────┬────────────┘
                              │ Sync
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
  variant_mau.json    variant_sizeso.json   variant_sizechu.json
  (74 màu)            (21 size số)          (6 size chữ)
              │               │               │
              └───────────────┼───────────────┘
                              │ Export thành CSV
                              ▼
              ┌─────────────────────────────────┐
              │  3 CSV Files (từ TPOS export)   │
              │  ┌──────────────────────────┐   │
              │  │ product_attributes_rows  │   │
              │  │ .csv (Màu, Size Số, ...) │   │
              │  └──────┬───────────────────┘   │
              │         │ 1:N                   │
              │  ┌──────▼───────────────────┐   │
              │  │ product_attribute_values  │   │
              │  │ _rows.csv (Đỏ, S, 36..) │   │
              │  └──────────────────────────┘   │
              │                                 │
              │  ┌──────────────────────────┐   │
              │  │ products_rows.csv        │   │
              │  │ - variant: string        │   │
              │  │ - base_product_code      │   │
              │  └──────────────────────────┘   │
              └─────────────────────────────────┘
                              │
                              │ Load CSV data
                              ▼
              ┌─────────────────────────────────┐
              │  Frontend (React)               │
              │                                 │
              │  1. VariantSelectorDialog        │
              │     → Chọn: Đỏ, Xanh, S, M     │
              │     → Output: "(Đỏ|Xanh)(S|M)" │
              │                                 │
              │  2. tpos-variant-converter       │
              │     → Tạo AttributeLines        │
              │     → generateProductVariants()  │
              │     → 4 variant objects          │
              │                                 │
              │  3. Push lên TPOS API            │
              │     + Lưu CSV                   │
              │                                 │
              │  4. ProductList / LiveProducts   │
              │     → formatVariantForDisplay()  │
              │     → Hiển thị "Đỏ|Xanh|S|M"   │
              └─────────────────────────────────┘
```

### Chi tiết từng bước:

1. **Đồng bộ dữ liệu**: TPOS API → 3 file JSON cache → Export thành 3 CSV files (`product_attributes_rows.csv` + `product_attribute_values_rows.csv` + `products_rows.csv`)
2. **Chọn variant**: User mở `VariantSelectorDialog`, chọn các giá trị → output chuỗi `"(Đỏ | Xanh) (S | M)"`
3. **Chuyển đổi**: `convertVariantsToAttributeLines()` query DB, map sang TPOS `AttributeLines` format
4. **Tạo tổ hợp**: `generateProductVariants()` tính tích Descartes → N variant objects đầy đủ
5. **Đẩy lên TPOS**: Gửi variant objects qua TPOS API để tạo sản phẩm con
6. **Lưu local**: Lưu vào `products_rows.csv` với `variant` string + `base_product_code`
7. **Hiển thị**: `formatVariantForDisplay()` bỏ ngoặc để hiển thị phẳng trên UI

---

## 15. Xuất Excel Mua Hàng - Chi Tiết Từng Bước

### 15.1 Tổng Quan

Nút xuất Excel (icon `FileDown` màu xanh lá 📥) trên mỗi dòng đơn hàng tại trang "Quản lý đặt hàng". Tạo file `.xlsx` dùng để import vào TPOS (template "Mua Hàng").

```
┌────────────────────────────────────────────────────────────────────────┐
│ Thao tác                                                               │
│  [✏️ Sửa] [📥 Xuất Excel] [📋 Copy] [🗑️ Xóa]                         │
│            ↑ FileDown icon, text-green-600                             │
│            title="Xuất Excel mua hàng"                                 │
└────────────────────────────────────────────────────────────────────────┘
```

**2 loại xuất Excel** trong hệ thống:

| Nút | Function | Mục đích | Template |
|-----|----------|----------|----------|
| "Xuất Excel Thêm SP" | `handleExportExcel()` | Tạo sản phẩm mới trên TPOS | 17 cột (Mã SP, Tên SP, Giá bán, Giá mua, Đơn vị...) |
| **"Xuất Excel Mua Hàng"** (📥) | `handleExportPurchaseExcel()` | Import đơn mua hàng vào TPOS | **4 cột** (Mã SP, Số lượng, Đơn giá, Chiết khấu) |

Section này tập trung vào **"Xuất Excel Mua Hàng"** — nút 📥 trên mỗi dòng đơn hàng.

### 15.2 File Liên Quan

| File | Đường dẫn đầy đủ | Vai trò |
|------|-------------------|---------|
| `PurchaseOrders.tsx` | `/Users/mac/Downloads/github-html-starter-main/src/pages/PurchaseOrders.tsx` | Chứa `handleExportPurchaseExcel()` — toàn bộ logic xuất Excel |
| `PurchaseOrderList.tsx` | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/PurchaseOrderList.tsx` | UI nút 📥 → gọi `onExportOrder(order)` |
| `tpos-api.ts` | `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-api.ts` | `searchTPOSProduct()` — fallback tìm SP trên TPOS |
| `utils.ts` | `/Users/mac/Downloads/github-html-starter-main/src/lib/utils.ts` | `convertVietnameseToUpperCase()` — normalize variant matching |
| `xlsx` (thư viện) | `node_modules/xlsx` | Thư viện SheetJS — tạo file .xlsx |

### 15.3 UI Nút Xuất Excel

**File**: `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/PurchaseOrderList.tsx` (line 813-822)

```typescript
{/* Export Excel button */}
<Button
  variant="ghost"
  size="sm"
  onClick={() => onExportOrder?.(flatItem)}
  title="Xuất Excel mua hàng"
  disabled={isOrderProcessing(flatItem.id)}
>
  <FileDown className="w-4 h-4 text-green-600" />
</Button>
```

- Icon: `FileDown` (lucide-react), màu `text-green-600`
- Disabled khi đơn hàng đang processing (TPOS sync)
- Gọi `onExportOrder` prop → map tới `handleExportPurchaseExcel(singleOrder)`

**2 cách gọi**:
1. **Nút trên mỗi dòng**: `handleExportPurchaseExcel(flatItem)` — truyền trực tiếp đơn hàng
2. **Nút chính (header)**: `handleExportPurchaseExcel()` — không truyền param, lấy từ `selectedOrders`

### 15.4 Luồng Chính - handleExportPurchaseExcel()

**File**: `/Users/mac/Downloads/github-html-starter-main/src/pages/PurchaseOrders.tsx` (line 626-862)

```
handleExportPurchaseExcel(singleOrder?)
  ↓
STEP 1: Xác định đơn hàng (line 627-658)
  ↓ Nếu có singleOrder → dùng trực tiếp
  ↓ Nếu không → validate selectedOrders.length === 1
  ↓   → Lỗi nếu chọn != 1 đơn: "Chỉ được xuất từ 1 đơn hàng tại 1 thời điểm"
  ↓
STEP 2: Lấy items (line 660-670)
  ↓ allItems = orderToExport.items || []
  ↓ Nếu rỗng → toast "Đơn hàng không có sản phẩm nào"
  ↓
STEP 3: Process từng item — 3 CASES (line 672-796)
  ↓ Duyệt từng item → quyết định mã SP nào đưa vào Excel
  ↓ (Chi tiết bên dưới 15.5)
  ↓
STEP 4: Validate có items (line 798-806)
  ↓ excelRows.length === 0 → toast "Không có sản phẩm nào phù hợp"
  ↓
STEP 5: Tạo file Excel (line 808-814)
  ↓ XLSX.utils.json_to_sheet(excelRows)
  ↓ Sheet name: "Mua Hàng"
  ↓ File name: MuaHang_{supplier}_{DD-MM}.xlsx
  ↓   VD: "MuaHang_TESTEXCEL_24-02.xlsx"
  ↓
STEP 6: Toast kết quả (line 816-831)
  ↓ Thành công: "Xuất Excel thành công! Đã xuất N sản phẩm"
  ↓ Có lỗi: "⚠️ Xuất Excel với lỗi! Đã xuất N SP, bỏ qua M SP"
  ↓   → Hiển thị tối đa 3 lỗi đầu tiên
  ↓
STEP 7: Auto-update trạng thái (line 833-852)
  ↓ Nếu status === 'awaiting_export':
  ↓   → UPDATE purchase_orders SET status = 'pending'
  ↓   → Toast: "Đơn hàng chuyển sang trạng thái Chờ Hàng"
  ↓   → invalidateQueries → refresh UI
```

### 15.5 3 Cases Xử Lý Từng Item

**File**: `/Users/mac/Downloads/github-html-starter-main/src/pages/PurchaseOrders.tsx` (line 684-796)

#### CASE 1: Đã có tpos_product_id (line 686-694)

```
item.tpos_product_id != null?
  ↓ YES → Đã upload TPOS thành công trước đó
  ↓ Dùng trực tiếp item.product_code
  ↓
  excelRows.push({
    "Mã sản phẩm (*)": item.product_code,    // VD: "N4033"
    "Số lượng (*)": item.quantity,             // VD: 1
    "Đơn giá": item.purchase_price,            // VD: 150000 (đồng)
    "Chiết khấu (%)": 0
  })
```

#### CASE 2: Chưa upload TPOS + Không có biến thể (line 696-705)

```
!item.variant || item.variant.trim() === ''?
  ↓ YES → Sản phẩm đơn (simple product)
  ↓ Dùng trực tiếp item.product_code
  ↓
  excelRows.push({
    "Mã sản phẩm (*)": item.product_code,
    "Số lượng (*)": item.quantity,
    "Đơn giá": item.purchase_price,
    "Chiết khấu (%)": 0
  })
```

#### CASE 3: Chưa upload TPOS + Có biến thể → 3-Step Fallback (line 707-796)

Đây là case phức tạp nhất — cần tìm **mã variant con** từ DB hoặc TPOS.

```
item có variant (VD: "ĐEN, 4, XL") nhưng chưa upload TPOS
  ↓
FALLBACK STEP 1: Tìm variant match trong bảng products (line 708-736)
  ↓ Query: products WHERE base_product_code = item.product_code
  ↓         AND variant IS NOT NULL AND variant != ''
  ↓
  ↓ candidates = [
  ↓   { product_code: "N4033-DEN-4-XL", variant: "(Đen) (4) (XL)" },
  ↓   { product_code: "N4033-XAM-4-XL", variant: "(Xám) (4) (XL)" },
  ↓   ...
  ↓ ]
  ↓
  ↓ variantsMatch(candidate.variant, item.variant)?
  ↓   → Normalize: bỏ dấu, uppercase, bỏ ngoặc, sort parts
  ↓   → "(Đen) (4) (XL)" → ["4", "DEN", "XL"]
  ↓   → "ĐEN, 4, XL"    → ["4", "DEN", "XL"]
  ↓   → MATCH! → Dùng matchedProduct.product_code (mã variant con)
  ↓
  ↓ Nếu MATCH:
  ↓   excelRows.push({ "Mã sản phẩm (*)": "N4033-DEN-4-XL", ... })
  ↓   → Dùng MÃ VARIANT CON (không phải mã parent)
  ↓
FALLBACK STEP 2: Tìm exact product_code trong kho (line 738-764)
  ↓ Nếu không match variant → query products WHERE product_code = item.product_code
  ↓ Nếu tồn tại → dùng item.product_code (mã parent)
  ↓
FALLBACK STEP 3: Tìm trên TPOS API (line 766-786)
  ↓ Nếu không có trong kho → searchTPOSProduct(item.product_code)
  ↓ GET https://tomato.tpos.vn/odata/Product/OdataService.GetViewV2?DefaultCode={code}
  ↓ Nếu tìm thấy → dùng item.product_code
  ↓
❌ FINAL: Không tìm thấy ở đâu (line 788-796)
  ↓ Skip item + ghi log lỗi
  ↓ skippedItems.push("❌ Upload TPOS Lỗi: N4033 - AO 32 (Variant: ĐEN, 4, XL, Có trong kho: [...])")
```

### 15.6 variantsMatch() - So Khớp Biến Thể

**File**: `/Users/mac/Downloads/github-html-starter-main/src/pages/PurchaseOrders.tsx` (line 92-110)

```typescript
const variantsMatch = (variant1: string | null, variant2: string | null): boolean => {
  // Normalize: uppercase, bỏ dấu, bỏ ngoặc, trim
  const normalize = (str: string) =>
    convertVietnameseToUpperCase(str.trim())
      .replace(/[()]/g, '')         // Bỏ ngoặc (format cũ)
      .replace(/\s+/g, ' ');        // Normalize spaces

  // Split by comma hoặc pipe (hỗ trợ 2 format)
  const parts1 = variant1.split(/[,|]/).map(normalize).filter(p => p.length > 0).sort();
  const parts2 = variant2.split(/[,|]/).map(normalize).filter(p => p.length > 0).sort();

  // So sánh sorted arrays (thứ tự không quan trọng)
  return parts1.length === parts2.length && parts1.every((part, idx) => part === parts2[idx]);
};
```

**Ví dụ matching**:

| DB variant (format cũ) | Item variant (format mới) | Normalize 1 | Normalize 2 | Match? |
|------------------------|--------------------------|-------------|-------------|--------|
| `"(Đen) (4) (XL)"` | `"ĐEN, 4, XL"` | `["4", "DEN", "XL"]` | `["4", "DEN", "XL"]` | ✅ |
| `"(Xám) (32) (S)"` | `"Xám, 32, S"` | `["32", "S", "XAM"]` | `["32", "S", "XAM"]` | ✅ |
| `"(Đen) (4) (XL)"` | `"Xám, 4, XL"` | `["4", "DEN", "XL"]` | `["4", "XAM", "XL"]` | ❌ |
| `"Đen \| 4 \| XL"` | `"ĐEN, 4, XL"` | `["4", "DEN", "XL"]` | `["4", "DEN", "XL"]` | ✅ |

**Đặc điểm**: So sánh **order-insensitive** (sort trước khi compare) và **format-insensitive** (hỗ trợ `,` lẫn `|` lẫn `()`)

### 15.7 Cấu Trúc File Excel Output

**Sheet name**: `"Mua Hàng"`

| Cột | Key | Kiểu | Ví dụ |
|-----|-----|------|-------|
| A | `Mã sản phẩm (*)` | string | `"N4033-DEN-4-XL"` hoặc `"N4033"` |
| B | `Số lượng (*)` | number | `1` |
| C | `Đơn giá` | number | `150000` (đồng, đã ×1000 trong DB) |
| D | `Chiết khấu (%)` | number | `0` (luôn = 0) |

**File name format**: `MuaHang_{SupplierName}_{DD-MM}.xlsx`
- VD: `MuaHang_TESTEXCEL_24-02.xlsx`

**Lưu ý**: `Đơn giá` lấy trực tiếp `item.purchase_price` từ DB (đã ×1000 khi lưu), KHÔNG chia lại.

### 15.8 Auto-Update Trạng Thái Sau Xuất

**File**: `/Users/mac/Downloads/github-html-starter-main/src/pages/PurchaseOrders.tsx` (line 833-852)

```
Xuất Excel thành công
  ↓
Kiểm tra: orderToExport.status === 'awaiting_export'?
  ↓ YES:
  ↓   UPDATE purchase_orders
  ↓     SET status = 'pending', updated_at = now()
  ↓     WHERE id = orderToExport.id
  ↓
  ↓   → Đơn hàng chuyển từ tab "Chờ mua" sang "Chờ hàng"
  ↓   → invalidateQueries → refresh danh sách
  ↓   → Toast: "Đã cập nhật trạng thái - Đơn hàng chuyển sang trạng thái Chờ Hàng"
  ↓
  ↓ NO (status khác):
  ↓   → Không đổi trạng thái
```

**Luồng trạng thái**:

```
awaiting_export (Chờ mua) → [Xuất Excel] → pending (Chờ hàng)
```

### 15.9 Xử Lý Lỗi + Toast

| Tình huống | Toast title | Toast variant | Chi tiết |
|-----------|-------------|---------------|----------|
| Chọn != 1 đơn (nút chính) | "Vui lòng chọn 1 đơn hàng" | destructive | Chỉ cho xuất 1 đơn/lần |
| Đơn hàng 0 items | "Không có sản phẩm" | destructive | — |
| Xuất OK, 0 skip | "Xuất Excel thành công!" | default | "Đã xuất N sản phẩm" |
| Xuất OK, có skip | "⚠️ Xuất Excel với lỗi!" | destructive | "Đã xuất N SP, bỏ qua M SP" + 3 lỗi đầu |
| 0 items xuất được | "Không thể xuất Excel" | destructive | "Không có SP nào phù hợp" |
| Exception | "Lỗi khi xuất Excel!" | destructive | "Vui lòng thử lại" |

### 15.10 Xử Lý Sản Phẩm Nhiều Biến Thể - Chi Tiết

**Quan trọng**: Vòng lặp `for (const item of allItems)` xử lý **TỪNG item riêng lẻ**, KHÔNG nhóm theo product_code. Mỗi item tự tìm mã variant con của nó.

#### Ví dụ: Đơn TESTEXCEL — 2 items cùng N4033, khác biến thể

```
Đơn: TESTEXCEL (24/02/2026) - NCC: TESTEXCEL - Tổng SL: 2
Đồng bộ TPOS: 0/15 (0.0%) → TPOS sync lỗi, chưa có tpos_product_id

Item 1: AO 32 - N4033 - ĐEN, 4, XL - SL: 1 - Giá mua: 0đ - "2 lỗi" (đỏ)
Item 2: AO 32 - N4033 - XÁM, 4, XL - SL: 1 - Giá mua: 0đ
```

#### Bấm 📥 → xử lý từng item:

```
═══════════════════════════════════════════════════════════════════
ITEM 1: AO 32 - N4033 - ĐEN, 4, XL
═══════════════════════════════════════════════════════════════════

CHECK CASE 1: item.tpos_product_id != null?
  → tpos_product_id = null (TPOS sync lỗi) → ❌ Bỏ qua

CHECK CASE 2: !item.variant?
  → variant = "ĐEN, 4, XL" (có biến thể) → ❌ Bỏ qua

VÀO CASE 3: Chưa upload + Có biến thể → 3-step fallback
  ↓
  ↓ Query: products WHERE base_product_code = 'N4033'
  ↓         AND variant IS NOT NULL AND variant != ''
  ↓
  ↓ candidates = [
  ↓   { product_code: "N4033-1", variant: "(Đen) (4) (XL)" },
  ↓   { product_code: "N4033-2", variant: "(Xám) (4) (XL)" },
  ↓ ]
  ↓
  ↓ Duyệt từng candidate:
  ↓   variantsMatch("(Đen) (4) (XL)", "ĐEN, 4, XL")?
  ↓     normalize: "(Đen) (4) (XL)" → bỏ dấu, bỏ ngoặc → "DEN 4 XL"
  ↓                                  → split → sort → ["4", "DEN", "XL"]
  ↓     normalize: "ĐEN, 4, XL"    → bỏ dấu → "DEN, 4, XL"
  ↓                                  → split → sort → ["4", "DEN", "XL"]
  ↓     → ["4","DEN","XL"] === ["4","DEN","XL"] → ✅ MATCH!
  ↓
  ↓ → Dùng matchedProduct.product_code = "N4033-1" (MÃ VARIANT CON)
  ↓
  excelRows.push({ "Mã sản phẩm (*)": "N4033-1", "Số lượng (*)": 1, "Đơn giá": 0 })

═══════════════════════════════════════════════════════════════════
ITEM 2: AO 32 - N4033 - XÁM, 4, XL
═══════════════════════════════════════════════════════════════════

VÀO CASE 3 (tương tự):
  ↓
  ↓ Query: products WHERE base_product_code = 'N4033' (CÙNG query, CÙNG candidates)
  ↓
  ↓ candidates = [
  ↓   { product_code: "N4033-1", variant: "(Đen) (4) (XL)" },
  ↓   { product_code: "N4033-2", variant: "(Xám) (4) (XL)" },
  ↓ ]
  ↓
  ↓ Duyệt từng candidate:
  ↓   variantsMatch("(Đen) (4) (XL)", "XÁM, 4, XL")?
  ↓     → ["4","DEN","XL"] vs ["4","XAM","XL"] → ❌ DEN ≠ XAM
  ↓
  ↓   variantsMatch("(Xám) (4) (XL)", "XÁM, 4, XL")?
  ↓     normalize: "(Xám) (4) (XL)" → ["4", "XAM", "XL"]
  ↓     normalize: "XÁM, 4, XL"    → ["4", "XAM", "XL"]
  ↓     → ✅ MATCH!
  ↓
  ↓ → Dùng matchedProduct.product_code = "N4033-2" (MÃ VARIANT CON KHÁC)
  ↓
  excelRows.push({ "Mã sản phẩm (*)": "N4033-2", "Số lượng (*)": 1, "Đơn giá": 0 })
```

#### Kết quả file Excel: `MuaHang_TESTEXCEL_24-02.xlsx`

```
Sheet: "Mua Hàng"
┌──────────────────┬──────────────┬─────────┬────────────────┐
│ Mã sản phẩm (*)  │ Số lượng (*) │ Đơn giá │ Chiết khấu (%) │
├──────────────────┼──────────────┼─────────┼────────────────┤
│ N4033-1          │ 1            │ 0       │ 0              │  ← variant Đen,4,XL
│ N4033-2          │ 1            │ 0       │ 0              │  ← variant Xám,4,XL
└──────────────────┴──────────────┴─────────┴────────────────┘
```

**Lưu ý**: Mã trong Excel là **mã variant con** (`N4033-1`, `N4033-2`), KHÔNG phải mã parent (`N4033`). TPOS cần mã con để nhập kho đúng biến thể.

#### Ví dụ mở rộng: 1 SP có 6 biến thể (3 Màu × 2 Size)

```
Đơn hàng có 6 items cùng mã P100:
  Item 1: P100 - ĐỎ, S     Item 4: P100 - XANH, S
  Item 2: P100 - ĐỎ, M     Item 5: P100 - XANH, M
  Item 3: P100 - VÀNG, S   Item 6: P100 - VÀNG, M

Bảng products có variant children:
  P100-1: "(Đỏ) (S)"     P100-4: "(Xanh) (S)"
  P100-2: "(Đỏ) (M)"     P100-5: "(Xanh) (M)"
  P100-3: "(Vàng) (S)"   P100-6: "(Vàng) (M)"

→ Duyệt TỪNG item × query candidates × variantsMatch()
→ Mỗi item tìm được đúng 1 variant con match

Kết quả Excel:
  P100-1 | 1 | giá | 0    ← Đỏ, S
  P100-2 | 1 | giá | 0    ← Đỏ, M
  P100-3 | 1 | giá | 0    ← Vàng, S
  P100-4 | 1 | giá | 0    ← Xanh, S
  P100-5 | 1 | giá | 0    ← Xanh, M
  P100-6 | 1 | giá | 0    ← Vàng, M
```

#### Trường hợp TPOS chưa sync xong (như screenshot: "2 lỗi")

```
TPOS sync lỗi → tpos_product_id = null
             → Chưa có variant children trong bảng products
             → candidates = [] (rỗng)
             → Không match được
  ↓
FALLBACK STEP 2: exact match 'N4033' trong products?
  → Nếu có parent product N4033 → dùng "N4033" (mã parent, không lý tưởng)
  → Nếu không →
  ↓
FALLBACK STEP 3: searchTPOSProduct('N4033')?
  → Nếu TPOS có N4033 → dùng "N4033"
  → Nếu không →
  ↓
❌ SKIP: "Upload TPOS Lỗi: N4033 - AO 32 (Variant: ĐEN, 4, XL, Có trong kho: [])"
  → Toast đỏ: "⚠️ Xuất Excel với lỗi! Bỏ qua 2 sản phẩm"
```

### 15.11 Lưu Ý Quan Trọng

1. **Xử lý TỪNG item riêng lẻ**: Vòng `for...of` duyệt từng item, KHÔNG nhóm theo product_code. Mỗi item tự query + match variant con
2. **Mã variant con vs mã parent**: CASE 3 ưu tiên tìm **mã variant con** (VD: `N4033-1`) thay vì mã parent (`N4033`), vì TPOS cần mã con để nhập kho đúng biến thể
3. **Cùng query, khác match**: 2 items cùng N4033 chạy cùng query `base_product_code = 'N4033'` nhưng `variantsMatch()` match ra **variant con khác nhau**
4. **3-step fallback**: variant match → exact match trong kho → TPOS API search → skip
5. **variantsMatch order-insensitive**: `"ĐEN, 4, XL"` match `"(XL) (4) (Đen)"` vì sort trước compare
6. **Giá lấy trực tiếp từ DB**: `purchase_price` trong DB đã ×1000, không cần convert thêm
7. **Auto-update status**: Chỉ update nếu status hiện tại là `'awaiting_export'`
8. **Chiết khấu luôn = 0**: Không hỗ trợ chiết khấu, hardcode `0`
9. **TPOS chưa sync = fallback**: Nếu TPOS sync lỗi, chưa có variant children trong DB → fallback dùng mã parent hoặc skip

---

## 16. Bảng Tóm Tắt Tất Cả File

### Data files (JSON cache từ TPOS)

| File                          | Đường dẫn đầy đủ                                                                          | Vai trò                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `variant_mau.json`            | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_mau.json`                  | Cache 74 màu từ TPOS (AttributeId=3)            |
| `variant_sizeso.json`         | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_sizeso.json`               | Cache 21 size số từ TPOS (AttributeId=4)         |
| `variant_sizechu.json`        | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant_sizechu.json`              | Cache 6 size chữ từ TPOS (AttributeId=1)         |

### Utility / Hook files

| File                          | Đường dẫn đầy đủ                                                                          | Vai trò                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `variant-utils.ts`            | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant-utils.ts`                  | Parse/format chuỗi variant, chuyển đổi values    |
| `variant-display-utils.ts`    | `/Users/mac/Downloads/github-html-starter-main/src/lib/variant-display-utils.ts`          | Format variant cho hiển thị UI (bỏ ngoặc)        |
| `tpos-variant-converter.ts`   | `/Users/mac/Downloads/github-html-starter-main/src/lib/tpos-variant-converter.ts`         | Chuyển đổi UI ↔ TPOS, tạo tổ hợp variant        |
| `product-variants-fetcher.ts` | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-variants-fetcher.ts`       | Fetch variants từ CSV theo product_code          |
| `use-product-variants.ts`     | `/Users/mac/Downloads/github-html-starter-main/src/hooks/use-product-variants.ts`         | React Query hook lấy variants theo base code     |
| `attribute-sort-utils.ts`     | `/Users/mac/Downloads/github-html-starter-main/src/lib/attribute-sort-utils.ts`           | Sắp xếp thông minh (màu chuẩn, size số/chữ)    |
| `product-code-generator.ts`  | `/Users/mac/Downloads/github-html-starter-main/src/lib/product-code-generator.ts`         | Auto-generate mã SP: detect category, query max, check trùng 4 nguồn |
| `utils.ts`                    | `/Users/mac/Downloads/github-html-starter-main/src/lib/utils.ts`                          | `convertVietnameseToUpperCase()` bỏ dấu tiếng Việt |
| `currency-utils.ts`           | `/Users/mac/Downloads/github-html-starter-main/src/lib/currency-utils.ts`                 | `formatVND()` format tiền VNĐ |

### Database - Validation Settings

| File | Đường dẫn đầy đủ | Vai trò |
| ---- | ----------------- | ------- |
| Migration (table) | `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251102132752_208db819-dc8f-4535-8e3b-4f4c6cf9c01b.sql` | Tạo table `purchase_order_validation_settings` (RLS per-user) |
| Migration (booleans) | `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251111032036_009be780-e14a-485e-9f91-e96804cafc13.sql` | Thêm 7 boolean columns (quy tắc kiểm tra) |

### UI Components

| Component                        | Đường dẫn đầy đủ                                                                                              | Cách sử dụng                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `ProductList`                    | `/Users/mac/Downloads/github-html-starter-main/src/components/products/ProductList.tsx`                        | `formatVariantForDisplay()` hiển thị bảng |
| `LiveProducts`                   | `/Users/mac/Downloads/github-html-starter-main/src/pages/LiveProducts.tsx`                                     | `getVariantName()` tìm kiếm + lọc        |
| `EditTPOSProductDialog`          | `/Users/mac/Downloads/github-html-starter-main/src/components/products/EditTPOSProductDialog.tsx`              | Chỉnh sửa variant qua VariantSelector    |
| `AddProductToLiveDialog`         | `/Users/mac/Downloads/github-html-starter-main/src/components/live-products/AddProductToLiveDialog.tsx`        | Tự nhận diện variant khi thêm SP live     |
| `PurchaseOrderList`              | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/PurchaseOrderList.tsx`           | Hiển thị variant trong đơn nhập hàng      |
| `VariantSelectorDialog`          | `/Users/mac/Downloads/github-html-starter-main/src/components/products/VariantSelectorDialog.tsx`              | Dialog chọn variant multi-column grid     |
| `VariantDropdownSelector`        | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantDropdownSelector.tsx`     | Dropdown chọn variant cho purchase order  |
| `VariantGeneratorDialog`         | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/VariantGeneratorDialog.tsx`      | Tạo tổ hợp variant (tích Descartes)      |
| `AttributeValueTable`            | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/AttributeValueTable.tsx`     | Bảng hiển thị + sắp xếp + xóa           |
| `CreateEditAttributeValueDialog` | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/CreateEditAttributeValueDialog.tsx` | Tạo/sửa giá trị thuộc tính          |
| `ImportAttributesDialog`         | `/Users/mac/Downloads/github-html-starter-main/src/components/attribute-warehouse/ImportAttributesDialog.tsx`  | Import hàng loạt                          |
| `order-image-generator`          | `/Users/mac/Downloads/github-html-starter-main/src/lib/order-image-generator.ts`                               | `getVariantName()` in trên ảnh đơn hàng  |

### Purchase Order - Variant Flow (Debug: Attr IDs)

| Component                            | Đường dẫn đầy đủ                                                                                              | Cách sử dụng                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `CreatePurchaseOrderDialog`          | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/CreatePurchaseOrderDialog.tsx`    | Tạo đơn, lưu `selectedAttributeValueIds`, Debug column |
| `EditPurchaseOrderDialog`            | `/Users/mac/Downloads/github-html-starter-main/src/components/purchase-orders/EditPurchaseOrderDialog.tsx`      | Sửa đơn, load/lưu `selected_attribute_value_ids`      |
| `PurchaseOrders` (page)              | `/Users/mac/Downloads/github-html-starter-main/src/pages/PurchaseOrders.tsx`                                   | Query `selected_attribute_value_ids` từ DB             |

### React App Legacy - Supabase Edge Functions (Không dùng trong N2store)

> **Lưu ý**: N2store KHÔNG dùng Supabase. Các Edge Functions dưới đây chỉ tồn tại trong React app cũ (github-html-starter-main) để tham khảo logic. N2store xử lý trực tiếp trong `form-modal.js` + `product-code-generator.js` + `tpos-search.js`.

| Function                               | Đường dẫn đầy đủ                                                                                                   | Vai trò (legacy)                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `process-purchase-order-background`    | `/Users/mac/Downloads/github-html-starter-main/supabase/functions/process-purchase-order-background/index.ts`       | Group items theo product_code + attribute IDs      |
| `create-tpos-variants-from-order`      | `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants-from-order/index.ts`         | Query UUIDs → Build AttributeLines → Push TPOS API |
| `create-tpos-variants` (legacy)        | `/Users/mac/Downloads/github-html-starter-main/supabase/functions/create-tpos-variants/index.ts`                    | Phiên bản cũ, cùng logic                          |

### N2store Backend Stack

| Service | Vai trò |
| ------- | ------- |
| **Firebase Firestore** | Lưu purchase_orders, items, selectedAttributeValueIds |
| **Firebase Storage** | Lưu ảnh sản phẩm, hóa đơn |
| **TPOS OData API** (qua Cloudflare proxy) | Product search, max code query, variant creation |
| **Cloudflare Worker** | Proxy CORS bypass (`chatomni-proxy.nhijudyshop.workers.dev`) |

### React App Legacy - Database Migration (Tham khảo)

| File                                   | Đường dẫn đầy đủ                                                                                                   | Vai trò (legacy)                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Migration `20251027120913`             | `/Users/mac/Downloads/github-html-starter-main/supabase/migrations/20251027120913_18e287ad-d774-4cfc-b8b6-d9e99a80718c.sql` | Thêm column `selected_attribute_value_ids uuid[]`  |

**N2store equivalent**: Field `items[].selectedAttributeValueIds` trong Firestore document `purchase_orders/{id}` (camelCase, array of strings)
