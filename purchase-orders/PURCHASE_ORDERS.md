# Purchase Orders - Documentation

> Module quản lý đơn đặt hàng với tích hợp TPOS
> Codebase: React + TypeScript + Supabase

## Mục lục
1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc & File Structure](#2-kiến-trúc--file-structure)
3. [Data Models & Interfaces](#3-data-models--interfaces)
4. [Trang chính - PurchaseOrders.tsx](#4-trang-chính---purchaseorderstsx)
5. [Modal tạo đơn - CreatePurchaseOrderDialog.tsx](#5-modal-tạo-đơn---createpurchaseorderdialogstsx)
6. [Bảng dữ liệu - PurchaseOrderList.tsx](#6-bảng-dữ-liệu---purchaseorderlisttsx)
7. [Thống kê - PurchaseOrderStats.tsx](#7-thống-kê---purchaseorderstatstsx)
8. [Tất cả API Requests](#8-tất-cả-api-requests)
9. [TPOS Integration](#9-tpos-integration)
10. [Export Excel](#10-export-excel)
11. [Firebase + Render Migration Notes](#11-firebase--render-migration-notes)
12. [Database Schema (Supabase Types)](#12-database-schema-supabase-types)
13. [Modal sửa đơn - EditPurchaseOrderDialog.tsx](#13-modal-sửa-đơn---editpurchaseorderdialogstsx)
14. [Chi tiết đơn - PurchaseOrderDetailDialog.tsx](#14-chi-tiết-đơn---purchaseorderdetaildialogstsx)
15. [Variant System](#15-variant-system)
16. [Product Code Generator](#16-product-code-generator)
17. [TPOS Product Sync](#17-tpos-product-sync)
18. [Supplier Detector](#18-supplier-detector)
19. [Utility Functions](#19-utility-functions)
20. [UI Components](#20-ui-components)
21. [Hooks](#21-hooks)
22. [Goods Receiving Module](#22-goods-receiving-module)

---

## 1. Tổng quan

### Tech Stack
| Công nghệ | Mô tả |
|-----------|-------|
| **React + TypeScript** | Frontend framework |
| **Supabase** | Backend (PostgreSQL + Edge Functions + Storage) |
| **TanStack Query** | Data fetching, caching, polling |
| **shadcn/ui** | Component library (Dialog, Table, Badge, Popover...) |
| **Tailwind CSS** | Styling |
| **XLSX (SheetJS)** | Export Excel |
| **date-fns** | Date formatting |
| **sonner** | Toast notifications (loading/progress) |

### Tính năng chính
- Tạo/sửa/xóa/sao chép đơn đặt hàng
- Lưu nháp và submit đơn hàng
- Upload ảnh sản phẩm, ảnh giá, ảnh hóa đơn
- Tự động sinh mã sản phẩm (với check trùng DB + TPOS)
- Đồng bộ sản phẩm lên TPOS (background processing)
- Export Excel: "Thêm SP" (17 cột) và "Mua Hàng" (4 cột + variant matching)
- Lọc theo ngày, lọc nhanh, tìm kiếm, lọc trạng thái
- Chọn nhiều đơn (bulk select) để export/xóa
- Tự động tạo parent products trong bảng `products`
- Polling realtime cho TPOS sync progress

### Status Flow
```
draft → awaiting_export → pending → received
  │          │               │          │
  │          │               │          └─ Đã nhận hàng
  │          │               └─ Chờ hàng (đã export Excel Mua Hàng)
  │          └─ Chờ mua (đã submit, TPOS đang xử lý)
  └─ Nháp (chưa submit)
```

---

## 2. Kiến trúc & File Structure

```
src/
├── pages/
│   ├── PurchaseOrders.tsx                     # Trang chính (1250 lines)
│   └── GoodsReceiving.tsx                     # Trang kiểm hàng nhập (273 lines)
├── components/purchase-orders/
│   ├── CreatePurchaseOrderDialog.tsx          # Modal tạo đơn (~2835 lines)
│   ├── EditPurchaseOrderDialog.tsx            # Modal sửa đơn (1668 lines)
│   ├── PurchaseOrderDetailDialog.tsx          # Dialog xem chi tiết đơn (428 lines)
│   ├── PurchaseOrderList.tsx                  # Bảng dữ liệu (898 lines)
│   ├── PurchaseOrderStats.tsx                 # 5 cards thống kê (179 lines)
│   ├── ImageUploadCell.tsx                    # Wrapper upload ảnh cho table (90 lines)
│   ├── VariantGeneratorDialog.tsx             # Dialog tạo biến thể (419 lines)
│   ├── VariantDropdownSelector.tsx            # Dropdown chọn variant có sẵn (121 lines)
│   └── SelectProductDialog.tsx                # Dialog chọn SP từ kho
├── components/goods-receiving/
│   ├── GoodsReceivingList.tsx                 # Danh sách đơn cần kiểm (408 lines)
│   ├── GoodsReceivingStats.tsx                # Thống kê kiểm hàng (118 lines)
│   ├── CreateReceivingDialog.tsx              # Dialog kiểm hàng nhập (347 lines)
│   ├── ViewReceivingDialog.tsx                # Dialog xem kết quả kiểm (277 lines)
│   └── ReceivingItemRow.tsx                   # Dòng SP trong kiểm hàng (182 lines)
├── components/ui/
│   └── unified-image-upload.tsx               # Upload ảnh đa năng (371 lines)
├── lib/
│   ├── product-code-generator.ts              # Auto-gen mã SP (552 lines)
│   ├── tpos-api.ts                            # TPOS API helper (509 lines)
│   ├── tpos-config.ts                         # TPOS config & token (115 lines)
│   ├── tpos-product-sync.ts                   # Đồng bộ SP từ TPOS (732 lines)
│   ├── tpos-variant-converter.ts              # Chuyển đổi variant → TPOS format (218 lines)
│   ├── tpos-image-loader.ts                   # Load ảnh SP với priority (64 lines)
│   ├── variant-utils.ts                       # Parse/format variant strings (177 lines)
│   ├── supplier-detector.ts                   # Phát hiện NCC từ tên SP (130 lines)
│   ├── image-utils.ts                         # Nén ảnh canvas (83 lines)
│   ├── order-image-generator.ts               # Tạo ảnh đơn hàng (95 lines)
│   ├── currency-utils.ts                      # formatVND() (8 lines)
│   └── utils.ts                               # convertVietnameseToUpperCase()
├── hooks/
│   ├── use-product-variants.ts                # Query variants theo base_product_code (37 lines)
│   ├── use-tpos-order-details.ts              # Fetch TPOS order details (73 lines)
│   ├── use-image-paste.ts                     # Global paste listener cho ảnh (38 lines)
│   ├── use-debounce.ts                        # Debounce hook
│   └── use-mobile.ts                          # Mobile detection
├── integrations/supabase/
│   ├── client.ts                              # Supabase client
│   └── types.ts                               # Database types
└── supabase/functions/
    ├── process-purchase-order-background/     # Edge Function 1: TPOS sync
    └── create-tpos-variants-from-order/       # Edge Function 2: Tạo variants
```

---

## 3. Data Models & Interfaces

### PurchaseOrder (Đơn đặt hàng)
```typescript
interface PurchaseOrder {
  id: string;
  order_date: string;              // Ngày đặt hàng (user chọn)
  status: string;                  // draft | awaiting_export | pending | received
  invoice_amount: number;          // Tiền hóa đơn (VND)
  total_amount: number;            // Tổng tiền hàng (VND)
  final_amount: number;            // Thành tiền = total - discount + shipping (VND)
  discount_amount: number;         // Chiết khấu (VND)
  shipping_fee: number;            // Phí ship (VND)
  supplier_name: string | null;    // Tên NCC
  supplier_id?: string | null;     // ID NCC
  notes: string | null;            // Ghi chú
  invoice_images: string[] | null; // URLs ảnh hóa đơn
  created_at: string;              // Timestamp tạo
  updated_at: string;              // Timestamp cập nhật
  items?: PurchaseOrderItem[];     // Danh sách SP
  hasShortage?: boolean;           // Có thiếu hàng không (từ goods_receiving)
  hasDeletedProduct?: boolean;     // Có SP đã xóa không
}
```

### PurchaseOrderItem (Sản phẩm trong đơn)
```typescript
interface PurchaseOrderItem {
  id?: string;
  quantity: number;
  position?: number;               // Thứ tự hiển thị
  notes: string;

  // Primary fields (lưu trực tiếp vào DB)
  product_code: string;
  product_name: string;
  variant: string;                 // VD: "ĐỎ, M, 2"
  base_product_code?: string;      // Mã SP gốc (cho variant)
  purchase_price: number | string; // Giá mua (đơn vị: 1000 VND trong form, VND trong DB)
  selling_price: number | string;  // Giá bán (đơn vị: 1000 VND trong form, VND trong DB)
  product_images: string[];        // URLs ảnh SP
  price_images: string[];          // URLs ảnh giá

  // Variant generation
  selectedAttributeValueIds?: string[]; // UUIDs cho TPOS API
  hasVariants?: boolean;

  // TPOS metadata
  tpos_product_id?: number | null;
  tpos_sync_status?: string;       // pending | processing | success | failed
  tpos_sync_error?: string | null;

  // UI only (không lưu DB)
  _tempTotalPrice: number;         // quantity * purchase_price
  _manualCodeEdit?: boolean;       // User đã sửa mã tay
}
```

> **LƯU Ý VỀ ĐƠN VỊ GIÁ**: Trong form, giá nhập ở đơn vị **1000 VND** (user nhập `150` = 150.000đ). Khi lưu DB, nhân `* 1000`. Khi load từ DB, chia `/ 1000`.

### ValidationSettings (Cài đặt validation)
```typescript
interface ValidationSettings {
  minPurchasePrice: number;    // Giá mua tối thiểu (đơn vị: 1000 VNĐ)
  maxPurchasePrice: number;    // Giá mua tối đa (0 = không giới hạn)
  minSellingPrice: number;     // Giá bán tối thiểu
  maxSellingPrice: number;     // Giá bán tối đa (0 = không giới hạn)
  minMargin: number;           // Chênh lệch tối thiểu giữa giá bán - giá mua

  // Boolean flags
  enableRequireProductName: boolean;
  enableRequireProductCode: boolean;
  enableRequireProductImages: boolean;
  enableRequirePositivePurchasePrice: boolean;
  enableRequirePositiveSellingPrice: boolean;
  enableRequireSellingGreaterThanPurchase: boolean;
  enableRequireAtLeastOneItem: boolean;
}
```

---

## 4. Trang chính - PurchaseOrders.tsx

### Layout
```
┌─────────────────────────────────────────────┐
│ Quản lý đặt hàng          [Tạo đơn đặt hàng]│
│ Theo dõi và quản lý đơn...                   │
├─────────────────────────────────────────────┤
│ [Tổng đơn] [Tổng giá trị] [Hôm nay] ...    │  ← PurchaseOrderStats
├─────────────────────────────────────────────┤
│ [Nháp (n)] [Chờ mua] [Chờ hàng]            │  ← 3 Tabs
├─────────────────────────────────────────────┤
│ Bulk actions (khi có đơn được chọn)          │
│ [Bỏ chọn] [Xóa đã chọn] [Excel Thêm SP]   │
│ [Excel Mua Hàng]                             │
├─────────────────────────────────────────────┤
│ PurchaseOrderList                            │  ← Bảng + filters
└─────────────────────────────────────────────┘
```

### 3 Tabs

| Tab | Value | Status Filter | Query Key | Mô tả |
|-----|-------|---------------|-----------|-------|
| **Nháp (n)** | `drafts` | `draft` | `["purchase-orders", "draft"]` | Đơn chưa submit, hiển thị count |
| **Chờ mua** | `awaiting_purchase` | `awaiting_export` | `["purchase-orders", "awaiting_purchase"]` | Đã tạo, đang chờ mua |
| **Chờ hàng** | `awaiting_delivery` | `pending` | `["purchase-orders", "awaiting_delivery"]` | Đã export, chờ giao |

### 4 Queries (TanStack Query)

**Query 1: Draft Orders** (`enabled: activeTab === "drafts"`)
```typescript
const { data: draftOrders } = useQuery({
  queryKey: ["purchase-orders", "draft"],
  queryFn: async () => {
    const { data } = await supabase
      .from("purchase_orders")
      .select(`*, items:purchase_order_items(
        id, quantity, position, notes,
        product_code, product_name, variant,
        purchase_price, selling_price,
        product_images, price_images,
        tpos_product_id, selected_attribute_value_ids
      )`)
      .eq("status", "draft")
      .order("created_at", { ascending: false });
    // Sort items by position
    return data.map(order => ({
      ...order,
      items: order.items.sort((a, b) => (a.position || 0) - (b.position || 0))
    }));
  },
  staleTime: 30000,  // 30s cache
});
```

**Query 2: Awaiting Purchase Orders** (`enabled: activeTab === "awaiting_purchase"`)
- Same structure, `.eq("status", "awaiting_export")`

**Query 3: Awaiting Delivery Orders** (`enabled: activeTab === "awaiting_delivery"`)
```typescript
// Includes goods_receiving for shortage detection
.select(`*, items:purchase_order_items(...),
  receiving:goods_receiving(
    id, has_discrepancy,
    items:goods_receiving_items(discrepancy_type, discrepancy_quantity)
  )`)
.eq("status", "pending")
// Sets hasShortage = true if any receiving item has discrepancy_type === 'shortage'
```

**Query 4: Stats (lightweight)**
```typescript
const { data: allOrdersForStats } = useQuery({
  queryKey: ["purchase-orders-stats"],
  queryFn: async () => {
    // Only select order-level fields (no items) for stats
    const { data } = await supabase
      .from("purchase_orders")
      .select(`id, status, total_amount, final_amount, created_at, order_date,
               discount_amount, shipping_fee, supplier_name, supplier_id,
               notes, invoice_images, updated_at`)
      .neq("status", "draft");  // Exclude drafts from stats
    return data;
  },
  staleTime: 60000,  // 1 minute cache
});
```

### Client-side Filtering (useMemo)

Filtering happens client-side after data is fetched:

```typescript
const filteredOrders = useMemo(() => {
  return orders.filter(order => {
    // 1. Date range filter (on created_at, not order_date)
    if (dateFrom && new Date(order.created_at) < dateFrom) return false;
    if (dateTo && new Date(order.created_at) > dateTo) return false;

    // 2. Search (on supplier_name, created_at date, product_name, product_code)
    const matchesSearch = searchTerm === "" ||
      order.supplier_name?.toLowerCase().includes(searchTerm) ||
      format(new Date(order.created_at), "dd/MM").includes(searchTerm) ||
      format(new Date(order.created_at), "dd/MM/yyyy").includes(searchTerm) ||
      order.items?.some(item =>
        item.product_name?.toLowerCase().includes(searchTerm) ||
        item.product_code?.toLowerCase().includes(searchTerm)
      );

    return matchesSearch;
  });
}, [orders, dateFrom, dateTo, searchTerm]);
```

### Quick Filters

| Value | Mô tả |
|-------|-------|
| `all` | Tất cả (xóa date filter) |
| `today` | Hôm nay |
| `yesterday` | Hôm qua |
| `7days` | 7 ngày qua |
| `30days` | 30 ngày qua |
| `thisMonth` | Tháng này |
| `lastMonth` | Tháng trước |

### Selection & Bulk Actions

```typescript
const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

// Toggle single order
const toggleSelectOrder = (orderId: string) => { ... };

// Toggle all orders in current tab
const toggleSelectAll = () => { ... };
```

**Bulk actions (hiển thị khi `selectedOrders.length > 0`):**
| Action | Mô tả |
|--------|-------|
| **Bỏ chọn** | Clear selection |
| **Xóa đã chọn** | Bulk delete (với confirm dialog) |
| **Xuất Excel Thêm SP** | Export selected orders → Excel template 17 cột |
| **Xuất Excel Mua Hàng** | Export 1 order → Excel 4 cột (cần chọn đúng 1 đơn) |

### handleCopyOrder (Sao chép đơn hàng)

```typescript
const handleCopyOrder = async (order: PurchaseOrder) => {
  // 1. Create new draft order with copied data
  const { data: newOrder } = await supabase
    .from('purchase_orders')
    .insert({
      order_date: new Date().toISOString(),
      status: 'draft',
      invoice_amount: order.invoice_amount || 0,
      total_amount: order.total_amount || 0,
      // ... copy all fields except id, created_at
    })
    .select().single();

  // 2. Copy all items
  const copiedItems = order.items.map((item, index) => ({
    purchase_order_id: newOrder.id,
    ...item,  // copy all item fields
    tpos_sync_status: 'pending',
  }));
  await supabase.from('purchase_order_items').insert(copiedItems);

  // 3. Switch to drafts tab
  setActiveTab('drafts');
};
```

### Bulk Delete Mutation

```typescript
const deleteBulkOrdersMutation = useMutation({
  mutationFn: async (orderIds: string[]) => {
    for (const orderId of orderIds) {
      // Step 1: Get purchase_order_item IDs
      // Step 2: Delete goods_receiving_items (by purchase_order_item_id)
      // Step 3: Delete goods_receiving (by purchase_order_id)
      // Step 4: Delete purchase_order_items
      // Step 5: Delete purchase_order
    }
  },
  onSuccess: () => {
    clearSelection();
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    queryClient.invalidateQueries({ queryKey: ["purchase-orders-stats"] });
  }
});
```

---

## 5. Modal tạo đơn - CreatePurchaseOrderDialog.tsx

### Props
```typescript
interface CreatePurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: any | null;  // PurchaseOrder (nếu edit draft)
}
```

### Form State
```typescript
const [formData, setFormData] = useState({
  supplier_name: "",
  order_date: new Date().toISOString(),
  notes: "",
  invoice_images: [] as string[],    // URLs ảnh hóa đơn
  invoice_amount: 0,                 // Tiền hóa đơn (x1000 VND)
  discount_amount: 0,                // Chiết khấu (x1000 VND)
  shipping_fee: 0                    // Phí ship (x1000 VND)
});

const [items, setItems] = useState<PurchaseOrderItem[]>([{
  quantity: 1, notes: "", product_code: "", product_name: "",
  variant: "", purchase_price: 0, selling_price: 0,
  product_images: [], price_images: [], _tempTotalPrice: 0,
}]);

// Image cache: Map<url, base64Data>
const [imageCache] = useState<Map<string, string>>(new Map());
```

### Form Inputs

**Order-level:**
| Input | Field | Type | Validation |
|-------|-------|------|------------|
| Nhà cung cấp | `supplier_name` | Text | Required (khi submit) |
| Ngày đặt | `order_date` | Date picker | Required |
| Ảnh hóa đơn | `invoice_images` | File upload | Optional |
| Tiền hóa đơn | `invoice_amount` | Number (x1000 VND) | Optional |
| Chiết khấu | `discount_amount` | Number (x1000 VND) | Optional |
| Phí ship | `shipping_fee` | Number (x1000 VND) | Optional, toggle hiện/ẩn |
| Ghi chú | `notes` | Textarea | Optional |

**Per Item:**
| Input | Field | Type | Validation (configurable) |
|-------|-------|------|------------|
| Mã SP | `product_code` | Text | Auto-gen hoặc manual, unique check |
| Tên SP | `product_name` | Text | Required |
| Biến thể | `variant` | Text | Optional |
| Số lượng | `quantity` | Number | Min 1 |
| Giá mua | `purchase_price` | Number (x1000 VND) | Min/max from settings |
| Giá bán | `selling_price` | Number (x1000 VND) | Min/max, > giá mua |
| Ảnh SP | `product_images` | File upload | Required (configurable) |
| Ảnh giá | `price_images` | File upload | Optional |

### Buttons

| Button | Action | Mutation | Condition |
|--------|--------|----------|-----------|
| **Lưu nháp** | `saveDraftMutation.mutate()` | Save as draft | Luôn hiển thị |
| **Tạo đơn hàng** | `createOrderMutation.mutate()` | Submit + TPOS sync | Khi form valid |
| **Thêm sản phẩm** | Add empty item row | - | Luôn hiển thị |
| **Xóa** (per item) | Remove item | - | Khi có > 1 item |
| **Chọn SP từ kho** | Open SelectProductDialog | - | Luôn hiển thị |
| **Tạo biến thể** | Open VariantGeneratorDialog | - | Luôn hiển thị |
| **Cài đặt** | Toggle ValidationSettings panel | - | Luôn hiển thị |

### Validation Query (from DB)
```typescript
const { data: dbValidationSettings } = useQuery({
  queryKey: ['purchase-order-validation-settings'],
  queryFn: async () => {
    const { data } = await supabase
      .from('purchase_order_validation_settings')
      .select('*')
      .maybeSingle();
    return data;
  }
});
```

### Save Validation Settings Mutation
```typescript
const saveValidationSettingsMutation = useMutation({
  mutationFn: async (settings: ValidationSettings) => {
    await supabase
      .from('purchase_order_validation_settings')
      .upsert({
        user_id: user.id,
        min_purchase_price: settings.minPurchasePrice,
        max_purchase_price: settings.maxPurchasePrice,
        min_selling_price: settings.minSellingPrice,
        max_selling_price: settings.maxSellingPrice,
        min_margin: settings.minMargin,
        enable_require_product_name: settings.enableRequireProductName,
        enable_require_product_code: settings.enableRequireProductCode,
        enable_require_product_images: settings.enableRequireProductImages,
        enable_require_positive_purchase_price: settings.enableRequirePositivePurchasePrice,
        enable_require_positive_selling_price: settings.enableRequirePositiveSellingPrice,
        enable_require_selling_greater_than_purchase: settings.enableRequireSellingGreaterThanPurchase,
        enable_require_at_least_one_item: settings.enableRequireAtLeastOneItem,
      }, { onConflict: 'user_id' });
  }
});
```

### saveDraftMutation

```typescript
const saveDraftMutation = useMutation({
  mutationFn: async () => {
    const totalAmount = items.reduce((sum, item) => sum + item._tempTotalPrice, 0) * 1000;
    const discountAmount = formData.discount_amount * 1000;
    const shippingFee = formData.shipping_fee * 1000;
    const finalAmount = totalAmount - discountAmount + shippingFee;

    if (initialData?.id) {
      // UPDATE existing draft
      await supabase.from("purchase_orders")
        .update({
          supplier_name: formData.supplier_name.trim().toUpperCase() || null,
          order_date: formData.order_date,
          total_amount: totalAmount,
          final_amount: finalAmount,
          discount_amount: discountAmount,
          shipping_fee: shippingFee,
          invoice_images: formData.invoice_images || null,
          notes: formData.notes.trim().toUpperCase() || null,
          status: 'draft'
        })
        .eq("id", initialData.id);

      // Delete old items → re-insert
      await supabase.from("purchase_order_items").delete().eq("purchase_order_id", initialData.id);
      await supabase.from("purchase_order_items").insert(orderItems);
    } else {
      // INSERT new draft
      const { data: order } = await supabase.from("purchase_orders")
        .insert({ ...orderData, status: 'draft' }).select().single();
      await supabase.from("purchase_order_items").insert(orderItems);
    }
  },
  onSuccess: () => {
    toast({ title: "Đã lưu nháp!" });
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    onOpenChange(false);
    resetForm();
  }
});
```

> **LƯU Ý**: Tất cả text đều được `.trim().toUpperCase()` trước khi lưu DB.

### createOrderMutation (Chi tiết đầy đủ)

```typescript
const createOrderMutation = useMutation({
  mutationFn: async () => {
    // ============= STEP 1: VALIDATION =============
    if (!formData.supplier_name?.trim()) {
      throw new Error("Vui lòng nhập tên nhà cung cấp");
    }
    if (items.length === 0) {
      throw new Error("Vui lòng thêm ít nhất một sản phẩm");
    }
    // Validate price ranges from ValidationSettings
    items.forEach((item, index) => {
      validatePriceSettings(item.purchase_price, item.selling_price, index+1, validationSettings);
    });

    // ============= STEP 2: PRE-CONVERT IMAGES =============
    // Cache ALL product images as base64 BEFORE creating order
    const uncachedUrls = allProductImageUrls.filter(url => !imageCache.has(url));
    if (uncachedUrls.length > 0) {
      sonnerToast.info(`Đang chuẩn bị ${uncachedUrls.length} ảnh...`);
      await Promise.all(uncachedUrls.map(async url => {
        const base64 = await convertUrlToBase64(url);
        if (base64) imageCache.set(url, base64);
      }));
    }

    // ============= STEP 3: CREATE ORDER =============
    const totalAmount = items.reduce(...) * 1000;
    const finalAmount = totalAmount - discountAmount + shippingFee;

    const { data: order } = await supabase.from("purchase_orders")
      .insert({
        supplier_name: formData.supplier_name.trim().toUpperCase(),
        order_date: formData.order_date,
        invoice_amount: formData.invoice_amount * 1000,
        total_amount: totalAmount,
        final_amount: finalAmount,
        discount_amount: discountAmount,
        shipping_fee: shippingFee,
        invoice_images: formData.invoice_images || null,
        notes: formData.notes.trim().toUpperCase(),
        status: 'awaiting_export'     // ← Trạng thái "Chờ mua"
      })
      .select().single();

    // ============= STEP 4: CREATE ITEMS =============
    const orderItems = items.map((item, index) => ({
      purchase_order_id: order.id,
      quantity: item.quantity,
      position: index + 1,
      notes: item.notes.trim().toUpperCase() || null,
      product_code: item.product_code.trim().toUpperCase(),
      product_name: item.product_name.trim().toUpperCase(),
      variant: item.variant?.trim().toUpperCase() || null,
      purchase_price: Number(item.purchase_price) * 1000,    // Convert to VND
      selling_price: Number(item.selling_price) * 1000,
      product_images: item.product_images,
      price_images: item.price_images,
      selected_attribute_value_ids: item.selectedAttributeValueIds || null,
      tpos_product_id: item.tpos_product_id || null,
      tpos_sync_status: item.tpos_product_id ? 'success' : 'pending',
    }));
    await supabase.from("purchase_order_items").insert(orderItems);

    // ============= STEP 5: INVOKE TPOS BACKGROUND PROCESSING =============
    // Fire-and-forget (không await)
    const cacheObject = Object.fromEntries(imageCache);
    supabase.functions.invoke('process-purchase-order-background', {
      body: {
        purchase_order_id: order.id,
        imageCache: cacheObject  // Pass base64 cache to edge function
      }
    });

    // Show loading toast + start polling
    const toastId = `tpos-processing-${order.id}`;
    sonnerToast.loading(`Đang xử lý 0/${totalItems} sản phẩm...`, { id: toastId, duration: Infinity });
    const cleanup = await pollTPOSProcessingProgress(order.id, totalItems, toastId);
    pollingCleanupRef.current = cleanup;

    // ============= STEP 6: CREATE PARENT PRODUCTS =============
    // Group items by product_code → create parent product in `products` table
    for (const [productCode, { variants, data }] of parentProductsMap) {
      const { data: existing } = await supabase
        .from("products")
        .select("product_code")
        .eq("product_code", productCode)
        .maybeSingle();

      if (!existing) {
        // Insert parent product with aggregated variants
        await supabase.from("products").insert({
          product_code: productCode,
          base_product_code: productCode,
          product_name: ...,
          supplier_name: ...,
          stock_quantity: 0,
          unit: 'Cái',
          variant: Array.from(variants).join(', ') || null,
          ...
        });
      }
    }

    return order;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    queryClient.invalidateQueries({ queryKey: ["purchase-order-stats"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["products-select"] });
    onOpenChange(false);
    resetForm();
  }
});
```

### Auto-generate Product Code

```typescript
// Triggered by: useDebounce(items.map(i => i.product_name).join('|'), 500)
// Runs when product name changes (debounced 500ms)

useEffect(() => {
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item.product_name.trim() || item.product_code.trim() || manualProductCodes.has(index)) {
      continue; // Skip if has name, already has code, or manually edited
    }

    // Step 1: Detect category from product name
    const category = detectProductCategory(item.product_name);
    // Categories: AO, QUAN, VAY, DAM, SET, PK, etc.

    // Step 2: Find max number from 3 sources
    const [maxFromProducts, maxFromPurchaseOrderItems] = await Promise.all([
      getMaxNumberFromProductsDB(category),        // RPC function ~20ms
      getMaxNumberFromPurchaseOrderItemsDB(category)
    ]);
    const maxFromForm = getMaxNumberFromItems(currentFormItems, category);
    const maxNumber = Math.max(maxFromProducts, maxFromPurchaseOrderItems, maxFromForm);
    let nextNumber = maxNumber + 1;

    // Step 3: Check uniqueness loop (max 30 attempts)
    while (attempts < 30) {
      const candidateCode = `${category}${nextNumber}`;

      // Check DB + form
      if (await isProductCodeExists(candidateCode, currentFormItems)) {
        nextNumber++; continue;
      }

      // Check TPOS
      if (await searchTPOSProduct(candidateCode)) {
        nextNumber++; continue;
      }

      // Assign code
      setItems(prev => { prev[index].product_code = candidateCode; });
      break;
    }
  }
}, [debouncedProductNames]);
```

### Image Processing

```typescript
const MAX_IMAGE_SIZE = 800;           // Max width/height in pixels
const MAX_IMAGE_BYTES = 500 * 1024;   // 500KB max per image

// resizeImageBlob: Resize using canvas → toBlob('image/jpeg', 0.8)
// convertUrlToBase64: fetch → resize if needed → FileReader → base64Data (without prefix)
// imageCache: Map<url, base64Data> - persists during dialog session

// Pre-cache on draft load:
// When opening with initialData, pre-cache all product_images

// Pre-cache on submit:
// Before createOrderMutation, cache ALL uncached product images
// Then pass cache to edge function
```

### TPOS Processing Polling

```typescript
const pollTPOSProcessingProgress = async (orderId, totalItems, toastId) => {
  let pollInterval = 1000;  // Start 1s, adaptive up to 3s
  let pollCount = 0;
  const MAX_POLLS = 60;     // 2 minute timeout

  const poll = async () => {
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('id, tpos_sync_status, product_code, tpos_sync_error')
      .eq('purchase_order_id', orderId);

    const successCount = items.filter(i => i.tpos_sync_status === 'success').length;
    const failedCount = items.filter(i => i.tpos_sync_status === 'failed').length;
    const completedCount = successCount + failedCount;

    // Update progress toast
    sonnerToast.loading(
      `Đang xử lý ${completedCount}/${totalItems} sản phẩm... (${successCount} ✅, ${failedCount} ❌)`,
      { id: toastId }
    );

    if (completedCount >= totalItems) {
      // Show final result (success/error/warning)
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      return;
    }

    // Adaptive backoff: interval *= 1.2, max 3s
    pollInterval = Math.min(pollInterval * 1.2, 3000);
    setTimeout(poll, pollInterval);
  };

  poll();
  return () => { isCancelled = true; };  // cleanup function
};
```

---

## 6. Bảng dữ liệu - PurchaseOrderList.tsx

### Props
```typescript
interface PurchaseOrderListProps {
  filteredOrders: PurchaseOrder[];
  isLoading: boolean;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  dateFrom: Date | undefined;
  setDateFrom: (date: Date | undefined) => void;
  dateTo: Date | undefined;
  setDateTo: (date: Date | undefined) => void;
  quickFilter: string;
  applyQuickFilter: (type: string) => void;
  selectedOrders: string[];
  onToggleSelect: (orderId: string) => void;
  onToggleSelectAll: () => void;
  onEditDraft?: (order: PurchaseOrder) => void;
  onExportOrder?: (order: PurchaseOrder) => void;  // Export Excel Mua Hàng cho 1 đơn
  onCopyOrder?: (order: PurchaseOrder) => void;
  hideStatusFilter?: boolean;
}
```

### Table Columns

| # | Column | Data | rowSpan | Ghi chú |
|---|--------|------|---------|---------|
| 1 | **Ngày đặt** | `order_date` + `created_at` | Order | Format: dd/MM/yyyy + (dd/MM HH:mm) |
| 2 | **Nhà cung cấp** | `supplier_name` + total quantity | Order | "Tổng SL: n" |
| 3 | **Hóa đơn (VND)** | `invoice_images[0]` + `final_amount` | Order | Image hover zoom x7, mismatch highlight đỏ |
| 4 | **Tên sản phẩm** | `product_name` | Item | - |
| 5 | **Mã sản phẩm** | `product_code` | Item | - |
| 6 | **Biến thể** | `variant` | Item | formatVariantForDisplay() |
| 7 | **Số lượng** | `quantity` | Item | Center aligned |
| 8 | **Giá mua (VND)** | `price_images` + `purchase_price` | Item | Images hover zoom x14 |
| 9 | **Giá bán (VND)** | `product_images` + `selling_price` | Item | Images hover zoom x14 |
| 10 | **Ghi chú** | `notes` | Order | HoverCard (truncate > 20 chars) |
| 11 | **Trạng thái** | `status` + sync status | Order | Badge + processing indicator |
| 12 | **Thao tác** | Actions + Checkbox | Order | 4 buttons + checkbox |

### Row Spanning Structure
```
┌─────────┬──────────┬──────────┬────────┬────────┬─────────┬────┬──────┬──────┬───────┬────────┬────────┐
│ Ngày    │ NCC      │ Hóa đơn  │ Tên SP │ Mã SP  │ Biến thể│ SL │ Giá  │ Giá  │ Note  │ Status │ Action │
│ (span)  │ (span)   │ (span)   │        │        │         │    │ mua  │ bán  │(span) │ (span) │ (span) │
├─────────┤          │          ├────────┼────────┼─────────┼────┼──────┼──────┤       │        │        │
│         │          │          │ SP 2   │ CODE2  │ M, Đỏ   │ 2  │ 150k │ 300k │       │        │        │
├─────────┤          │          ├────────┼────────┼─────────┼────┼──────┼──────┤       │        │        │
│         │          │          │ SP 3   │ CODE3  │ L, Xanh │ 1  │ 200k │ 400k │       │        │        │
└─────────┴──────────┴──────────┴────────┴────────┴─────────┴────┴──────┴──────┴───────┴────────┴────────┘
```

### Filter Bar Layout
```
Row 1: [Từ ngày: ___] [Đến ngày: ___] [Lọc nhanh: ▾] [Xóa lọc ngày]
Row 2: [🔍 Tìm nhà cung cấp, tên/mã SP, ngày...] [Status: ▾]
```

### Hóa đơn Mismatch Detection
```typescript
// Highlight đỏ nếu calculated final_amount !== stored final_amount
const calculatedTotal = items.reduce((sum, item) =>
  sum + (item.purchase_price * item.quantity), 0);
const calculatedFinalAmount = calculatedTotal - discount_amount + shipping_fee;
const hasMismatch = Math.abs(calculatedFinalAmount - final_amount) > 0.01;
// → bg-red-100 border-2 border-red-300
```

### Sync Status Queries

**Query 1: Variant Info (stock count)**
```typescript
const { data: variantInfo } = useQuery({
  queryKey: ['variant-stock-info', allProductCodes],
  queryFn: async () => {
    // Get child products stock for each base_product_code
    const { data } = await supabase
      .from('products')
      .select('base_product_code, stock_quantity')
      .in('base_product_code', allProductCodes);
    // Returns: { [code]: totalStockQuantity }
  },
  enabled: allProductCodes.length > 0
});
```

**Query 2: Sync Status (auto-poll 3s)**
```typescript
const { data: syncStatusMap } = useQuery({
  queryKey: ['order-sync-status', filteredOrders.map(o => o.id)],
  queryFn: async () => {
    const { data } = await supabase
      .from('purchase_order_items')
      .select('purchase_order_id, tpos_sync_status')
      .in('purchase_order_id', orderIds);
    // Returns: { [orderId]: { processing: number, failed: number } }
  },
  refetchInterval: 3000  // Auto-refetch every 3 seconds
});
```

### Order Processing Lock

```typescript
// Orders that just finished processing are locked for 3s before unlock
// This prevents user from editing while data is settling

const isOrderProcessing = (orderId: string): boolean => {
  return (
    (syncStatusMap?.[orderId]?.processing ?? 0) > 0 ||  // Still processing
    (ordersToUnlock.get(orderId) > Date.now())            // In 3s delay period
  );
};

// When processing: opacity-50, pointer-events-none, buttons disabled
```

### Action Buttons per Order

| Button | Icon | Color | Action | Khi nào |
|--------|------|-------|--------|---------|
| **Sửa** (draft) | Pencil | amber | `onEditDraft(order)` | `status === 'draft'` |
| **Sửa** (other) | Pencil | blue | Open `EditPurchaseOrderDialog` | `status !== 'draft'` |
| **Xuất Excel** | FileDown | green | `onExportOrder(order)` | Luôn hiển thị |
| **Sao chép** | Copy | purple | `onCopyOrder(order)` | Luôn hiển thị |
| **Xóa** | Trash2 | red | Open confirm dialog | Luôn hiển thị |
| **Checkbox** | - | - | `onToggleSelect(order.id)` | Luôn hiển thị |

### Status Badges

| Status | Badge | Mô tả |
|--------|-------|-------|
| `draft` | `bg-amber-100 text-amber-800` | Nháp |
| `awaiting_export` | `bg-blue-100 text-blue-800` | CHỜ MUA |
| `pending` | `variant="secondary"` | Chờ Hàng |
| `received` | `variant="default"` | Đã Nhận Hàng |
| `received` + hasShortage | `variant="destructive"` | Giao thiếu hàng |

### Delete Single Order Mutation

```typescript
const deletePurchaseOrderMutation = useMutation({
  mutationFn: async (orderId: string) => {
    // Step 1: Get purchase_order_item IDs
    const { data: itemIds } = await supabase
      .from("purchase_order_items")
      .select("id")
      .eq("purchase_order_id", orderId);

    // Step 2: Delete goods_receiving_items (by purchase_order_item_id)
    await supabase.from("goods_receiving_items")
      .delete()
      .in("purchase_order_item_id", itemIds.map(i => i.id));

    // Step 3: Delete goods_receiving
    await supabase.from("goods_receiving")
      .delete()
      .eq("purchase_order_id", orderId);

    // Step 4: Delete purchase_order_items
    await supabase.from("purchase_order_items")
      .delete()
      .eq("purchase_order_id", orderId);

    // Step 5: Delete purchase_order
    await supabase.from("purchase_orders")
      .delete()
      .eq("id", orderId);
  }
});
```

---

## 7. Thống kê - PurchaseOrderStats.tsx

### Props
```typescript
interface PurchaseOrderStatsProps {
  filteredOrders: PurchaseOrder[];  // Orders in current tab (filtered)
  allOrders: PurchaseOrder[];      // All non-draft orders (for today stats)
  isLoading: boolean;
  isMobile?: boolean;
}
```

### 5 Cards

| Card | Icon | Data Source | Calculation |
|------|------|------------|-------------|
| **Tổng đơn hàng** | FileText | `filteredOrders` | `filteredOrders.length` |
| **Tổng giá trị** | DollarSign | `filteredOrders` | `SUM(final_amount)` |
| **Đơn hôm nay** | Clock | `allOrders` | Count where `created_at` = today |
| **Giá trị hôm nay** | TrendingUp | `allOrders` | `SUM(final_amount)` where today |
| **Đồng bộ TPOS** | Link2 | `filteredOrders.items` | `successCount/totalItems` (% đã đồng bộ) |

> **Lưu ý**: Tổng đơn/giá trị dùng `filteredOrders` (theo tab + filter hiện tại). Đơn hôm nay dùng `allOrders` (không phụ thuộc filter).

---

## 8. Tất cả API Requests

### Supabase Database Queries

| # | Operation | Table | Method | Component |
|---|-----------|-------|--------|-----------|
| 1 | Get draft orders | `purchase_orders` + `purchase_order_items` | `.select().eq('status','draft')` | PurchaseOrders |
| 2 | Get awaiting orders | `purchase_orders` + `purchase_order_items` | `.select().eq('status','awaiting_export')` | PurchaseOrders |
| 3 | Get pending orders | `purchase_orders` + `purchase_order_items` + `goods_receiving` | `.select().eq('status','pending')` | PurchaseOrders |
| 4 | Get stats orders | `purchase_orders` | `.select().neq('status','draft')` | PurchaseOrders |
| 5 | Get validation settings | `purchase_order_validation_settings` | `.select('*').maybeSingle()` | CreateDialog |
| 6 | Save validation settings | `purchase_order_validation_settings` | `.upsert({}, {onConflict:'user_id'})` | CreateDialog |
| 7 | Create order (draft) | `purchase_orders` | `.insert({status:'draft'})` | CreateDialog |
| 8 | Update order (draft) | `purchase_orders` | `.update().eq('id',id)` | CreateDialog |
| 9 | Create order (submit) | `purchase_orders` | `.insert({status:'awaiting_export'})` | CreateDialog |
| 10 | Create items | `purchase_order_items` | `.insert([...])` | CreateDialog |
| 11 | Delete items | `purchase_order_items` | `.delete().eq('purchase_order_id',id)` | CreateDialog |
| 12 | Copy order | `purchase_orders` + `purchase_order_items` | `.insert()` | PurchaseOrders |
| 13 | Delete order (cascade) | 4 tables | Sequential delete | PurchaseOrderList |
| 14 | Bulk delete | 4 tables x N | Loop sequential delete | PurchaseOrders |
| 15 | Get sync status | `purchase_order_items` | `.select().in('purchase_order_id',[...])` | PurchaseOrderList |
| 16 | Get variant info | `products` | `.select().in('base_product_code',[...])` | PurchaseOrderList |
| 17 | Poll TPOS progress | `purchase_order_items` | `.select().eq('purchase_order_id',id)` | CreateDialog |
| 18 | Check product exists | `products` | `.select().eq('product_code',code).maybeSingle()` | CreateDialog |
| 19 | Create parent products | `products` | `.insert([...])` | CreateDialog |
| 20 | Max code from products | `products` | RPC function | product-code-generator |
| 21 | Max code from PO items | `purchase_order_items` | RPC function | product-code-generator |
| 22 | Check code exists | `products` + `purchase_order_items` | `.select().eq(...)` | product-code-generator |
| 23 | Get parent product images | `products` | `.select().eq('product_code',baseCode)` | CreateDialog |
| 24 | Variant candidates (export) | `products` | `.select().eq('base_product_code',code)` | PurchaseOrders |
| 25 | Exact match (export) | `products` | `.select().eq('product_code',code).maybeSingle()` | PurchaseOrders |
| 26 | Update status to pending | `purchase_orders` | `.update({status:'pending'}).eq('id',id)` | PurchaseOrders |

### External API Calls

| # | API | Function | Component |
|---|-----|----------|-----------|
| 1 | TPOS Search | `searchTPOSProduct(code)` | CreateDialog, PurchaseOrders |

### Supabase Edge Functions

| # | Function | Body | Trigger |
|---|----------|------|---------|
| 1 | `process-purchase-order-background` | `{ purchase_order_id, imageCache }` | createOrderMutation (fire-and-forget) |

---

## 9. TPOS Integration (Chi tiết)

### 9.1 TPOS Config

```
Base URL:  https://tomato.tpos.vn
API Base:  https://tomato.tpos.vn/odata/ProductTemplate
Token:     Lưu trong DB table `tpos_credentials` (bearer_token, token_type='tpos')
```

**Headers cho mọi TPOS request:**
```typescript
{
  'Authorization': `Bearer ${bearerToken}`,
  'Content-Type': 'application/json;charset=UTF-8',
  'x-tpos-lang': 'vi',
  'x-request-id': randomUUID(),       // Random mỗi request
  'origin': 'https://tomato.tpos.vn',
  'referer': 'https://tomato.tpos.vn/',
}
```

### 9.2 Tất cả TPOS HTTP Requests

#### REQUEST 1: Search Product by Code (Frontend)
```
GET https://tomato.tpos.vn/odata/Product/OdataService.GetViewV2
    ?Active=true
    &DefaultCode={productCode}
    &$top=50
    &$orderby=DateCreated desc
    &$count=true
```
- **Gọi từ**: `tpos-api.ts → searchTPOSProduct()`
- **Khi nào**: Auto-gen mã SP (check trùng), Export Excel Mua Hàng (fallback step 3)
- **Response**: `{ value: [{ Id, Name, DefaultCode, ListPrice, QtyAvailable, ... }] }`
- **Nếu trùng**: `value.length > 0` → mã đã tồn tại trên TPOS

#### REQUEST 2: Search ProductTemplate by Code (Frontend)
```
GET https://tomato.tpos.vn/odata/ProductTemplate/OdataService.GetViewV2
    ?Active=true
    &DefaultCode={productCode}
    &$top=50
    &$orderby=DateCreated desc
    &$filter=Active+eq+true
    &$count=true
```
- **Gọi từ**: `tpos-api.ts → searchTPOSProductByCode()`
- **Khi nào**: Fetch & Edit flow (tìm SP để sửa)
- **Khác với Request 1**: Dùng `ProductTemplate` thay vì `Product`, có thêm `$filter`
- **Delay**: 100-200ms random trước mỗi call

#### REQUEST 3: Get Full Product Details (Frontend)
```
GET https://tomato.tpos.vn/odata/ProductTemplate({productId})
    ?$expand=UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,
             Product_Teams,Images,UOMView,Distributor,Importer,Producer,
             OriginCountry,
             AttributeLines($expand=Attribute,Values),
             ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues)
```
- **Gọi từ**: `tpos-api.ts → getTPOSProductFullDetails(productId)`
- **Khi nào**: Khi user mở chi tiết SP để sửa
- **Response**: Full product object (~200 fields) bao gồm `ProductVariants[]`, `AttributeLines[]`
- **Delay**: 100-200ms random trước mỗi call

#### REQUEST 4: Update Product (Frontend)
```
POST https://tomato.tpos.vn/odata/ProductTemplate/ODataService.UpdateV2
Body: {full product object from Request 3, with modified fields}
```
- **Gọi từ**: `tpos-api.ts → updateTPOSProductDetails(payload)`
- **Khi nào**: User sửa SP và lưu
- **QUAN TRỌNG**: Phải gửi lại TOÀN BỘ object (không chỉ fields thay đổi)
- **Image**: Nếu có thay đổi, field `Image` = base64 string (đã clean prefix)
- **Delay**: 100-200ms random trước mỗi call

#### REQUEST 5: Create Product - InsertV2 (Edge Function)
```
POST https://tomato.tpos.vn/odata/ProductTemplate/ODataService.InsertV2
     ?$expand=ProductVariants,UOM,UOMPO
Body: {full product payload}
```
- **Gọi từ**: Edge Function `create-tpos-variants-from-order`
- **Khi nào**: Tạo đơn hàng → background sync
- **2 cases**:

**CASE 1: Simple Product (không có variant)**
```json
{
  "Id": 0,
  "Name": "TÊN SẢN PHẨM",
  "Type": "product",
  "ShowType": "Có thể lưu trữ",
  "DefaultCode": "AO123",
  "Barcode": "AO123",
  "ListPrice": 300000,        // Giá bán (VND)
  "PurchasePrice": 150000,    // Giá mua (VND)
  "StandardPrice": 0,
  "Image": "base64...",       // Ảnh SP (base64, không có prefix)
  "Active": true,
  "SaleOK": true,
  "PurchaseOK": true,
  "AvailableInPOS": true,
  "UOMId": 1,
  "UOMPOId": 1,
  "CategId": 2,
  "CompanyId": 1,
  "Tracking": "none",
  "InvoicePolicy": "order",
  "PurchaseMethod": "receive",
  "AttributeLines": [],
  "ProductVariants": [],
  "UOM": { "Id": 1, "Name": "Cái", ... },
  "Categ": { "Id": 2, "Name": "Có thể bán", ... },
  "UOMPO": { "Id": 1, "Name": "Cái", ... },
  // ... ~80 more fields (mostly null)
}
```

**CASE 2: Product with Variants**
```json
{
  // ... same base fields as CASE 1 ...
  "ProductVariantCount": 6,
  "AttributeLines": [
    {
      "Attribute": { "Id": 5, "Name": "Size", "CreateVariant": true },
      "Values": [
        { "Id": 101, "Name": "S", "AttributeId": 5, "AttributeName": "Size" },
        { "Id": 102, "Name": "M", "AttributeId": 5, "AttributeName": "Size" }
      ],
      "AttributeId": 5
    },
    {
      "Attribute": { "Id": 8, "Name": "Màu", "CreateVariant": true },
      "Values": [
        { "Id": 201, "Name": "Đỏ", "AttributeId": 8, "AttributeName": "Màu" },
        { "Id": 202, "Name": "Xanh", "AttributeId": 8, "AttributeName": "Màu" },
        { "Id": 203, "Name": "Trắng", "AttributeId": 8, "AttributeName": "Màu" }
      ],
      "AttributeId": 8
    }
  ],
  "ProductVariants": [
    {
      "Id": 0,
      "Name": "AO123 (Đỏ, S)",
      "NameGet": "AO123 (Đỏ, S)",
      "PriceVariant": 300000,
      "Active": true,
      "SaleOK": true,
      "PurchaseOK": true,
      "AvailableInPOS": true,
      "Type": "product",
      "AttributeValues": [
        { "Id": 101, "Name": "S", "AttributeId": 5, "AttributeName": "Size" },
        { "Id": 201, "Name": "Đỏ", "AttributeId": 8, "AttributeName": "Màu" }
      ]
    }
    // ... more variants (S*3colors = 6 variants)
  ]
}
```

- **Response thành công**: Full product object with `Id > 0`, `ProductVariants[].DefaultCode` được TPOS auto-generate
- **Error 400 (duplicate)**: `"Đã có sản phẩm với mã vạch"` → treated as success

#### REQUEST 6: Create Product - InsertV2 (Frontend, deprecated)
```
POST {TPOS_CONFIG.API_BASE}/ODataService.InsertV2?$expand=ProductVariants,UOM,UOMPO
Body: simplified payload
```
- **Gọi từ**: `tpos-api.ts → createProductDirectly()`
- **Status**: Deprecated, chỉ dùng khi gọi trực tiếp từ frontend

### 9.3 Edge Functions Chain

```
Frontend                    Edge Function 1                    Edge Function 2
────────                    ───────────────                    ───────────────
createOrderMutation()
  │
  ├─ INSERT order + items
  │
  └─ invoke('process-purchase-order-background')
       body: { purchase_order_id, imageCache }
                │
                ├─ Clean stuck items (>5min → failed)
                ├─ Fetch pending items
                ├─ Group items by (product_code + attribute_ids)
                ├─ Process 8 groups in parallel:
                │    │
                │    └─ invoke('create-tpos-variants-from-order')
                │         body: {
                │           baseProductCode,
                │           productName,
                │           purchasePrice,     // đơn vị: 1000 VND
                │           sellingPrice,      // đơn vị: 1000 VND
                │           selectedAttributeValueIds,
                │           productImages,
                │           supplierName,
                │           imageCache
                │         }
                │              │
                │              ├─ Convert image (cache → base64)
                │              ├─ Fetch attribute values from DB
                │              ├─ Generate variant combinations
                │              ├─ POST to TPOS InsertV2 (Request 5)
                │              ├─ Save parent + children to `products` table
                │              └─ Return { success, data }
                │
                ├─ Update items: success/failed
                └─ Return summary { total, succeeded, failed }
```

### 9.4 Processing Config

| Setting | Value | Mô tả |
|---------|-------|-------|
| `MAX_CONCURRENT` | 8 | Số nhóm SP xử lý song song |
| `maxRetries` | 2 | Retry khi TPOS lỗi (429 rate limit) |
| Retry delay | `2000 * attempt` ms | Exponential backoff |
| Stuck timeout | 5 phút | Items processing > 5min → failed |
| Frontend poll | 1-3s adaptive | Tăng dần x1.2, max 3s |
| Frontend timeout | 60 polls (~2min) | Max polls trước khi timeout |

### 9.5 Attribute System

Attributes được lưu trong 2 bảng DB:
- `product_attributes`: Danh sách thuộc tính (Size, Màu, Kiểu...) + `display_order`
- `product_attribute_values`: Giá trị (`S, M, L, XL`, `Đỏ, Xanh`...) + `tpos_id`, `tpos_attribute_id`

```
User chọn attribute values (UUIDs) trong CreateDialog
  → selectedAttributeValueIds = ["uuid1", "uuid2", "uuid3", "uuid4"]
  → Edge Function query DB lấy tpos_id mapping
  → Generate Cartesian product (VD: 2 sizes × 3 colors = 6 variants)
  → Build AttributeLines + ProductVariants cho TPOS payload
  → POST InsertV2
```

### 9.6 Image Flow

```
Frontend:
  Upload ảnh → Supabase Storage → URL
  URL stored in product_images[]
  On submit: URL → fetch → resize (max 800px, 500KB) → base64
  base64 cached in Map<url, base64>
  Cache passed to Edge Function body: { imageCache: { url: base64 } }

Edge Function:
  Nhận imageCache
  Khi cần base64: check cache[url] trước
  Nếu cache miss → fetch URL trực tiếp → base64 (retry 2 lần)
  base64 gửi trong field "Image" của TPOS payload
```

---

## 10. Export Excel

### Export "Thêm SP" (handleExportExcel)

**File name**: `TaoMaSP_{dd-MM}.xlsx`
**Sheet name**: `Đặt Hàng`

**17 cột theo template TPOS:**
| Cột | Giá trị |
|-----|---------|
| Loại sản phẩm | "Có thể lưu trữ" (hardcoded) |
| Mã sản phẩm | `item.product_code` |
| Mã chốt đơn | undefined |
| Tên sản phẩm | `item.product_name` |
| Giá bán | `item.selling_price` |
| Giá mua | `item.purchase_price` |
| Đơn vị | "CÁI" (hardcoded) |
| Nhóm sản phẩm | "QUẦN ÁO" (hardcoded) |
| Mã vạch | `item.product_code` |
| Khối lượng | undefined |
| Chiết khấu bán | undefined |
| Chiết khấu mua | undefined |
| Tồn kho | undefined |
| Giá vốn | undefined |
| Ghi chú | undefined |
| Cho phép bán ở CTY khác | "FALSE" |
| Thuộc tính | undefined |

### Export "Mua Hàng" (handleExportPurchaseExcel)

**File name**: `MuaHang_{supplier}_{dd-MM}.xlsx`
**Sheet name**: `Mua Hàng`
**Yêu cầu**: Phải chọn đúng **1 đơn hàng**

**4 cột:**
| Cột | Giá trị |
|-----|---------|
| Mã sản phẩm (*) | product_code hoặc matched variant code |
| Số lượng (*) | quantity |
| Đơn giá | purchase_price |
| Chiết khấu (%) | 0 |

**3-step Variant Matching Logic cho mỗi item:**

```
CASE 1: item.tpos_product_id != null
  → Đã upload TPOS → dùng item.product_code trực tiếp

CASE 2: Không có variant (empty)
  → Dùng item.product_code trực tiếp

CASE 3: Có variant → 3-step fallback:
  Step 1: Query products WHERE base_product_code = item.product_code
          → variantsMatch() tìm variant phù hợp
          → Nếu tìm thấy → dùng matched.product_code

  Step 2: Query products WHERE product_code = item.product_code (exact)
          → Nếu tìm thấy → dùng item.product_code

  Step 3: searchTPOSProduct(item.product_code)
          → Nếu tìm thấy trên TPOS → dùng item.product_code

  Fallback: SKIP item + error log
            "Upload TPOS Lỗi: {code} - {name} (Variant: {v})"
```

**Sau khi export thành công:**
```typescript
// Auto-update status: 'awaiting_export' → 'pending'
if (orderToExport.status === 'awaiting_export') {
  await supabase
    .from('purchase_orders')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', orderToExport.id);
}
```

---

---

## 11. Migration Notes: Supabase → Firebase + Render

> Bạn đọc file này và code lại bằng Firebase + Render. Đây là những điểm khác biệt cần lưu ý.

### 11.1 Mapping tổng quan

| Supabase | Firebase + Render | Ghi chú |
|----------|-------------------|---------|
| PostgreSQL (tables) | Firestore (collections) | NoSQL, khác schema |
| `.select().eq().order()` | `collection().where().orderBy()` | Query syntax khác hoàn toàn |
| Supabase Storage | Firebase Storage | Upload ảnh, gần giống |
| Edge Functions (Deno) | Render Web Service (Node.js) | Background processing |
| `supabase.functions.invoke()` | `fetch('https://your-render.com/api/...')` | HTTP call thay vì SDK |
| Supabase Realtime / polling | Firestore `onSnapshot()` | Firebase mạnh hơn ở đây |
| Row-Level Security (RLS) | Firestore Security Rules | Cú pháp khác |
| `.upsert({}, {onConflict})` | `doc().set({}, {merge: true})` | Upsert concept |
| TanStack Query cache | TanStack Query cache | Giữ nguyên, không đổi |

### 11.2 Database: PostgreSQL → Firestore

**Vấn đề lớn nhất**: Supabase dùng SQL relational (JOIN, foreign key). Firestore là NoSQL document.

**Cách xử lý:**

```
Supabase (SQL):
  purchase_orders (1) ──→ purchase_order_items (N)
  JOIN bằng: .select('*, items:purchase_order_items(*)')

Firestore (NoSQL) - 2 options:

  Option A: Subcollection (RECOMMENDED)
    purchase_orders/{orderId}
      └── items/{itemId}
    → Query: getDocs(collection(db, 'purchase_orders', orderId, 'items'))
    → Pro: Clean, scalable
    → Con: Không query across orders dễ (VD: tìm tất cả items có code X)

  Option B: Denormalize (embed items trong order doc)
    purchase_orders/{orderId} = { ...orderData, items: [...] }
    → Pro: 1 read = full order
    → Con: Document size limit 1MB, khó query item-level
```

**Recommendation**: Dùng **Option A (subcollection)** + denormalize fields hay query (VD: `total_quantity`, `supplier_name`) lên order doc.

### 11.3 Cascade Delete

Supabase code delete 4 bảng tuần tự. Firestore không có CASCADE.

```typescript
// Supabase: 5 steps manual cascade
// Firestore: Tương tự, nhưng dùng batch write

async function deleteOrder(orderId: string) {
  const batch = writeBatch(db);

  // 1. Delete goods_receiving_items (subcollection)
  // 2. Delete goods_receiving
  // 3. Delete items subcollection
  const itemsSnap = await getDocs(collection(db, 'purchase_orders', orderId, 'items'));
  itemsSnap.forEach(doc => batch.delete(doc.ref));

  // 4. Delete order
  batch.delete(doc(db, 'purchase_orders', orderId));

  await batch.commit();
}
```

### 11.4 Edge Functions → Render API

Supabase Edge Functions = Deno serverless. Thay bằng Render Web Service (Node.js/Express).

```
Supabase:
  supabase.functions.invoke('process-purchase-order-background', {
    body: { purchase_order_id, imageCache }
  })

Render:
  fetch('https://your-app.onrender.com/api/process-purchase-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ...' },
    body: JSON.stringify({ purchase_order_id, imageCache })
  })
```

**Lưu ý quan trọng:**
- Render free tier có **cold start** (~30s). Nếu xử lý background, dùng paid tier hoặc queue
- `imageCache` có thể rất lớn (nhiều ảnh base64). Cân nhắc giới hạn payload size
- Render có timeout mặc định. Đặt đủ lớn cho background processing

### 11.5 Polling → Firestore Realtime

Đây là điểm Firebase **mạnh hơn** Supabase. Code gốc poll DB mỗi 3s. Firebase dùng realtime listener:

```typescript
// Supabase (poll mỗi 3s):
const { data } = useQuery({
  queryKey: ['order-sync-status'],
  refetchInterval: 3000
});

// Firebase (realtime, zero delay):
useEffect(() => {
  const q = query(
    collection(db, 'purchase_orders', orderId, 'items'),
    where('tpos_sync_status', 'in', ['pending', 'processing'])
  );
  const unsubscribe = onSnapshot(q, (snapshot) => {
    // Update UI instantly khi status thay đổi
  });
  return unsubscribe;
}, [orderId]);
```

### 11.6 TPOS Token Storage

```
Supabase: table `tpos_credentials` (bearer_token, token_type, created_at)

Firebase: collection `settings` hoặc `credentials`
  doc('tpos') = { bearer_token: '...', updated_at: Timestamp }
```

### 11.7 RPC Functions (Auto-gen mã SP)

Code gốc dùng Supabase RPC (server-side function) để tìm max product code:
```typescript
getMaxNumberFromProductsDB(category)      // RPC ~20ms
getMaxNumberFromPurchaseOrderItemsDB(category)
```

**Firebase equivalent**: Không có RPC. 2 options:
- **Option A**: Query Firestore trực tiếp (chậm hơn nếu data lớn)
- **Option B**: Maintain counter document (recommended)

```typescript
// Counter document approach:
// Collection: product_code_counters/{category} = { max_number: 150 }

async function getNextCode(category: string): Promise<string> {
  const ref = doc(db, 'product_code_counters', category);
  const newNum = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists() ? snap.data().max_number : 0;
    transaction.set(ref, { max_number: current + 1 });
    return current + 1;
  });
  return `${category}${newNum}`;
}
```

### 11.8 Tóm tắt việc cần làm

| # | Task | Độ phức tạp |
|---|------|-------------|
| 1 | Setup Firestore collections + security rules | Thấp |
| 2 | Chuyển tất cả `supabase.from()` → Firestore queries | Trung bình |
| 3 | Chuyển Supabase Storage → Firebase Storage | Thấp |
| 4 | Tạo Render API thay Edge Functions (2 endpoints) | Trung bình |
| 5 | Thay polling bằng Firestore `onSnapshot()` | Thấp (dễ hơn polling) |
| 6 | Implement cascade delete bằng batch write | Thấp |
| 7 | Implement product code counter | Thấp |
| 8 | TPOS API calls giữ nguyên 100% | Không đổi |
| 9 | TanStack Query giữ nguyên logic | Không đổi |
| 10 | Excel export giữ nguyên logic | Không đổi |

**TPOS requests KHÔNG thay đổi gì**. Chúng là HTTP calls thuần tới `tomato.tpos.vn`. Bạn chỉ cần thay cách lấy token (từ Firestore thay vì Supabase).

---

## 12. Database Schema (Supabase Types)

> File: `src/integrations/supabase/types.ts`

### 12.1 purchase_orders

```typescript
{
  id: string;                    // UUID, auto-generated
  order_date: string;            // Ngày đặt hàng (user chọn)
  status: string;                // draft | awaiting_export | pending | received
  invoice_amount: number | null; // Tiền hóa đơn (VND)
  total_amount: number;          // Tổng tiền hàng (VND) = SUM(quantity * purchase_price)
  final_amount: number;          // Thành tiền = total - discount + shipping (VND)
  discount_amount: number;       // Chiết khấu (VND, đơn vị x1000 trong form)
  shipping_fee: number;          // Phí ship (VND, đơn vị x1000 trong form)
  supplier_name: string | null;  // Tên NCC (auto-detect hoặc user nhập)
  supplier_id: string | null;    // ID NCC
  notes: string | null;          // Ghi chú
  invoice_images: string[] | null; // URLs ảnh hóa đơn (Supabase Storage)
  created_at: string;            // Timestamp tạo
  updated_at: string;            // Timestamp cập nhật
  user_id: string | null;        // User tạo đơn
}
```

### 12.2 purchase_order_items

```typescript
{
  id: string;                           // UUID, auto-generated
  purchase_order_id: string;            // FK → purchase_orders.id
  product_code: string;                 // Mã SP (auto-gen hoặc user nhập)
  product_name: string;                 // Tên SP
  variant: string | null;               // Biến thể: "Đỏ, M, 2"
  quantity: number;                     // Số lượng
  purchase_price: number;               // Giá mua (VND)
  selling_price: number;                // Giá bán (VND)
  product_images: string[] | null;      // URLs ảnh SP
  price_images: string[] | null;        // URLs ảnh giá
  selected_attribute_value_ids: string[] | null; // UUIDs attribute values (cho TPOS)
  position: number | null;              // Thứ tự hiển thị (0-based)
  notes: string | null;                 // Ghi chú

  // TPOS sync metadata
  tpos_product_id: number | null;       // TPOS Product ID sau khi sync thành công
  tpos_deleted: boolean | null;         // SP đã bị xóa trên TPOS
  tpos_deleted_at: string | null;       // Thời điểm xóa
  tpos_sync_status: string | null;      // pending | processing | success | failed
  tpos_sync_error: string | null;       // Lỗi sync (nếu failed)
  tpos_sync_started_at: string | null;  // Bắt đầu sync
  tpos_sync_completed_at: string | null;// Hoàn thành sync

  created_at: string;
  updated_at: string;
}
```

### 12.3 purchase_order_validation_settings

```typescript
{
  id: string;
  user_id: string;                      // FK → auth.users

  // Numeric thresholds (đơn vị: 1000 VND)
  min_purchase_price: number | null;     // Giá mua tối thiểu
  max_purchase_price: number | null;     // Giá mua tối đa
  min_selling_price: number | null;      // Giá bán tối thiểu
  max_selling_price: number | null;      // Giá bán tối đa
  max_quantity: number | null;           // Số lượng tối đa

  // Boolean enable flags
  enable_purchase_price_validation: boolean;
  enable_selling_price_validation: boolean;
  enable_quantity_validation: boolean;
  enable_product_code_validation: boolean;
  enable_product_name_validation: boolean;
  enable_duplicate_detection: boolean;
  enable_image_validation: boolean;

  created_at: string;
  updated_at: string;
}
```

### 12.4 goods_receiving

```typescript
{
  id: string;                        // UUID
  purchase_order_id: string;         // FK → purchase_orders.id
  received_by_user_id: string;       // User thực hiện kiểm hàng
  received_by_username: string;      // Tên user
  receiving_date: string;            // Ngày kiểm (auto = now)
  total_items_expected: number;      // Tổng SL đặt
  total_items_received: number;      // Tổng SL nhận
  has_discrepancy: boolean;          // Có chênh lệch không
  notes: string | null;              // Ghi chú
  created_at: string;
}
```

### 12.5 goods_receiving_items

```typescript
{
  id: string;                        // UUID
  goods_receiving_id: string;        // FK → goods_receiving.id
  purchase_order_item_id: string;    // FK → purchase_order_items.id
  product_name: string;              // Tên SP (snapshot)
  product_code: string | null;       // Mã SP (snapshot)
  variant: string | null;            // Biến thể (snapshot)
  expected_quantity: number;         // SL đặt
  received_quantity: number;         // SL nhận thực tế
  discrepancy_type: string | null;   // 'shortage' | 'overage' | 'match'
  discrepancy_quantity: number | null; // |expected - received|
  product_condition: string | null;  // Tình trạng SP
  item_notes: string | null;         // Ghi chú riêng từng item
  created_at: string;
}
```

### 12.6 Supabase RPC

```sql
-- Hàm lấy max number từ product_code theo category
-- Dùng trong product-code-generator.ts
get_max_product_code_number(category_prefix TEXT)
-- VD: get_max_product_code_number('N') → tìm max từ N001, N002... → trả về 2
-- Quét cả bảng products và purchase_order_items
```

---

## 13. Modal sửa đơn - EditPurchaseOrderDialog.tsx

> File: `src/components/purchase-orders/EditPurchaseOrderDialog.tsx` (1668 lines)

### 13.1 Props

```typescript
interface EditPurchaseOrderDialogProps {
  order: PurchaseOrder | null;  // Đơn hàng cần sửa (null = đóng)
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

### 13.2 Khác biệt so với CreatePurchaseOrderDialog

| Tính năng | Create | Edit |
|-----------|--------|------|
| Load items từ DB | Không | Có - load items rồi convert sang `_temp*` fields |
| Update mutation | INSERT mới | 3 bước: UPDATE order → DELETE items đã xóa → UPSERT items |
| Disable giá cho items đã lưu | Không | Có - `disabled={!!item.id}` |
| Detect unsaved changes | Không | Có - `hasUnsavedChanges` + close confirmation |
| Apply to variants button | Có | Có |

### 13.3 Load Items từ DB

Khi dialog mở, items từ DB được convert sang form format:

```typescript
// DB → Form conversion
const formItem = {
  ...dbItem,
  _tempProductName: dbItem.product_name,
  _tempProductCode: dbItem.product_code,
  _tempVariant: dbItem.variant || "",
  _tempUnitPrice: dbItem.purchase_price / 1000,   // VND → x1000
  _tempSellingPrice: dbItem.selling_price / 1000,  // VND → x1000
  _tempTotalPrice: dbItem.quantity * (dbItem.purchase_price / 1000),
  _tempProductImages: dbItem.product_images || [],
  _tempPriceImages: dbItem.price_images || [],
  _manualCodeEdit: false,
};
```

### 13.4 Update Mutation (3 bước)

```typescript
// Bước 1: Update order header
await supabase.from('purchase_orders').update({
  order_date, supplier_name, supplier_id,
  total_amount: totalAmount * 1000,       // x1000 → VND
  discount_amount: Number(discountAmount) * 1000,
  shipping_fee: Number(shippingFee) * 1000,
  final_amount: finalAmount * 1000,
  notes, invoice_images,
}).eq('id', order.id);

// Bước 2: Delete items đã bị xóa khỏi form
const currentItemIds = items.filter(i => i.id).map(i => i.id);
const deletedIds = originalItemIds.filter(id => !currentItemIds.includes(id));
if (deletedIds.length > 0) {
  await supabase.from('purchase_order_items')
    .delete().in('id', deletedIds);
}

// Bước 3: Upsert remaining items
for (const item of items) {
  const payload = {
    purchase_order_id: order.id,
    product_code: item._tempProductCode,
    product_name: item._tempProductName,
    variant: item._tempVariant || null,
    quantity: item.quantity,
    purchase_price: Number(item._tempUnitPrice) * 1000,
    selling_price: Number(item._tempSellingPrice) * 1000,
    product_images: item._tempProductImages,
    price_images: item._tempPriceImages,
    selected_attribute_value_ids: item.selected_attribute_value_ids,
    position: index,
  };

  if (item.id) {
    await supabase.from('purchase_order_items')
      .update(payload).eq('id', item.id);
  } else {
    await supabase.from('purchase_order_items')
      .insert(payload);
  }
}
```

### 13.5 hasUnsavedChanges Detection

So sánh state hiện tại với state ban đầu:
- `orderDate` vs original
- `supplierName` vs original
- `notes` vs original
- `items.length` vs original
- Mỗi item: name, code, variant, quantity, price, images

Nếu có thay đổi → hiện **AlertDialog** xác nhận khi đóng.

### 13.6 applyAllFieldsToVariants(index)

Áp dụng tên SP, giá mua, giá bán, ảnh SP, ảnh giá từ item tại `index` cho tất cả items cùng `product_code`:

```typescript
function applyAllFieldsToVariants(sourceIndex: number) {
  const source = items[sourceIndex];
  const baseCode = source._tempProductCode;

  setItems(prev => prev.map((item, idx) => {
    if (idx === sourceIndex) return item;
    if (item._tempProductCode !== baseCode) return item;
    return {
      ...item,
      _tempProductName: source._tempProductName,
      _tempUnitPrice: source._tempUnitPrice,
      _tempSellingPrice: source._tempSellingPrice,
      _tempProductImages: [...source._tempProductImages],
      _tempPriceImages: [...source._tempPriceImages],
    };
  }));
}
```

Nút này chỉ hiện khi `shouldShowApplyAllButton(index)` = có ≥2 items cùng product_code.

### 13.7 Table Columns

| # | Column | Field | Ghi chú |
|---|--------|-------|---------|
| 1 | STT | index + 1 | |
| 2 | Tên SP | `_tempProductName` | Input text |
| 3 | Biến thể | `_tempVariant` | Input + VariantDropdown |
| 4 | Mã SP | `_tempProductCode` | Auto-gen + manual edit toggle |
| 5 | SL | `quantity` | Input number |
| 6 | Giá mua | `_tempUnitPrice` | Input, **disabled nếu item đã lưu** |
| 7 | Giá bán | `_tempSellingPrice` | Input, **disabled nếu item đã lưu** |
| 8 | Thành tiền | `_tempTotalPrice * 1000` | Read-only, formatVND |
| 9 | Ảnh SP | `_tempProductImages` | ImageUploadCell, **disabled nếu item đã lưu** |
| 10 | Ảnh giá | `_tempPriceImages` | ImageUploadCell, **disabled nếu item đã lưu** |
| 11 | Thao tác | | Apply All / Chọn từ kho / Copy / Xóa |
| 12 | Debug | `selected_attribute_value_ids` | Toggle show/hide, hiển thị UUIDs |

### 13.8 Footer - Financial Summary

```
Tổng tiền:    formatVND(totalAmount * 1000)      // SUM(quantity * _tempUnitPrice)
Giảm giá:     [Input]                              // discountAmount (x1000 VND)
Tiền ship:    [Input] (toggle show/hide)           // shippingFee (x1000 VND)
──────────────────────────────────────────
Thành tiền:   formatVND(finalAmount * 1000)        // total - discount + shipping
```

### 13.9 Sub-dialogs

- **SelectProductDialog**: Mở khi nhấn icon Warehouse → `handleSelectProduct(product)` hoặc `handleSelectMultipleProducts(products)`
- **VariantGeneratorDialog**: Mở khi nhấn nút tạo biến thể → tạo N dòng variant mới thay thế dòng gốc
- **AlertDialog**: Xác nhận đóng khi có unsaved changes

---

## 14. Chi tiết đơn - PurchaseOrderDetailDialog.tsx

> File: `src/components/purchase-orders/PurchaseOrderDetailDialog.tsx` (428 lines)

### 14.1 Props

```typescript
interface PurchaseOrderDetailDialogProps {
  order: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

### 14.2 Chức năng

Dialog **read-only** hiển thị chi tiết đơn hàng đã submit.

### 14.3 Layout

```
┌─────────────────────────────────────┐
│ Chi tiết đơn hàng                   │
│                                     │
│ Thông tin chung:                    │
│  - Ngày đặt, NCC, Trạng thái       │
│  - Ghi chú                         │
│                                     │
│ Bảng sản phẩm:                      │
│  Hình ảnh | Tên SP | SL | Giá | TT │
│  [img]    | Áo     | 5  | 150k| 750│
│  ...                                │
│                                     │
│ Tổng kết tài chính:                 │
│  Tổng tiền / Giảm giá / Ship / TT  │
│                                     │
│ ⚠️ Cảnh báo chênh lệch (nếu có)    │
│                                     │
│ SP lỗi TPOS (nếu có):              │
│  [Retry Failed Items]              │
└─────────────────────────────────────┘
```

### 14.4 Discrepancy Warning

Nếu `calculatedTotal ≠ order.total_amount`:
```typescript
const calculatedTotal = order.items?.reduce(
  (sum, item) => sum + (item.quantity * item.purchase_price), 0
) || 0;

// Hiện banner cảnh báo nếu calculatedTotal !== order.total_amount
```

### 14.5 Retry Failed Items

Cho các items có `tpos_sync_status === 'failed'`:

```typescript
async function handleRetryFailed() {
  // 1. Reset failed items về 'pending'
  await supabase.from('purchase_order_items')
    .update({ tpos_sync_status: 'pending', tpos_sync_error: null })
    .eq('purchase_order_id', order.id)
    .eq('tpos_sync_status', 'failed');

  // 2. Gọi lại Edge Function
  await supabase.functions.invoke('process-purchase-order-background', {
    body: { purchaseOrderId: order.id }
  });
}
```

---

## 15. Variant System

### 15.1 VariantGeneratorDialog.tsx

> File: `src/components/purchase-orders/VariantGeneratorDialog.tsx` (419 lines)

**Chức năng**: Chọn attribute values → tạo tổ hợp biến thể (Cartesian product).

#### Props
```typescript
interface VariantGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productCode?: string;
  onSubmit: (result: {
    combinations: Array<{
      combinationString: string;            // VD: "Đỏ, M, 2"
      selectedAttributeValueIds: string[];  // UUIDs cho TPOS API
    }>;
    hasVariants: boolean;
  }) => void;
}
```

#### Data Source
```typescript
// Hook useProductAttributes() → query product_attributes + product_attribute_values
const { data: attributes } = useQuery({
  queryKey: ['product-attributes'],
  queryFn: async () => {
    const { data } = await supabase
      .from('product_attributes')
      .select('*, values:product_attribute_values(*)');
    return data;
  }
});
```

#### Thuật toán Cartesian Product

```typescript
function generateCombinations(selectedValues: Record<string, string[]>): Combination[] {
  const arrays = Object.entries(selectedValues)
    .filter(([_, values]) => values.length > 0)
    .map(([attrId, valueIds]) =>
      valueIds.map(vId => ({ attrId, valueId: vId, valueName: getName(vId) }))
    );

  // Cartesian product
  const cartesian = arrays.reduce(
    (acc, curr) => acc.flatMap(a => curr.map(b => [...a, b])),
    [[]] as any[][]
  );

  return cartesian.map(combo => ({
    combinationString: combo.map(c => c.valueName).join(', '),
    selectedAttributeValueIds: combo.map(c => c.valueId),
  }));
}
```

#### Custom Sort: sortAttributeValues()

Sắp xếp values theo logic tùy attribute:
- Kích thước (Size): XS → S → M → L → XL → XXL → 3XL...
- Số: 1, 2, 3, 4, 5...
- Khác: alphabetical

#### UI Layout
```
┌─────────────────────────────────────────┐
│ Tạo biến thể                            │
│                                         │
│ ┌─────────────┐  ┌────────────────────┐ │
│ │ Màu sắc     │  │ Tổ hợp đã chọn:   │ │
│ │ ☑ Đỏ        │  │ ☑ Chọn tất cả (6) │ │
│ │ ☑ Xanh      │  │ ☑ Đỏ, S           │ │
│ │ ☐ Vàng      │  │ ☑ Đỏ, M           │ │
│ │             │  │ ☑ Đỏ, L           │ │
│ │ Kích thước  │  │ ☑ Xanh, S         │ │
│ │ ☑ S         │  │ ☑ Xanh, M         │ │
│ │ ☑ M         │  │ ☑ Xanh, L         │ │
│ │ ☑ L         │  │                    │ │
│ └─────────────┘  └────────────────────┘ │
│                          [Tạo biến thể] │
└─────────────────────────────────────────┘
```

### 15.2 VariantDropdownSelector.tsx

> File: `src/components/purchase-orders/VariantDropdownSelector.tsx` (121 lines)

**Chức năng**: Dropdown chọn variant đã có sẵn từ bảng `products`.

```typescript
interface VariantDropdownSelectorProps {
  baseProductCode?: string;       // Mã SP gốc (VD: "N123")
  value?: string;                 // Giá trị variant hiện tại
  onChange?: (value: string) => void;
  onVariantSelect?: (variant: ProductVariant) => void;
  className?: string;
  disabled?: boolean;
}
```

**Data Source**: `useProductVariants(baseProductCode)` → query products WHERE `base_product_code = baseProductCode AND variant IS NOT NULL AND product_code != baseProductCode`.

**UI**: Popover + Command list → click chọn variant → gọi `onVariantSelect(variant)`.

### 15.3 tpos-variant-converter.ts

> File: `src/lib/tpos-variant-converter.ts` (218 lines)

#### convertVariantsToAttributeLines()

Chuyển đổi selected variants từ DB → TPOS `AttributeLines` format.

```typescript
async function convertVariantsToAttributeLines(
  selectedVariants: Array<{
    variant: string;                      // "Đỏ, M"
    selected_attribute_value_ids: string[]; // UUIDs
  }>
): Promise<TPOSAttributeLine[]>

// Output format (TPOS cần):
[
  {
    "Attribute": { "Id": 123, "Name": "Màu sắc" },
    "Values": [
      { "Id": 456, "Name": "Đỏ", "Code": "DO", "Sequence": 0, ... },
      { "Id": 789, "Name": "Xanh", "Code": "XANH", "Sequence": 1, ... }
    ]
  },
  {
    "Attribute": { "Id": 124, "Name": "Size" },
    "Values": [
      { "Id": 111, "Name": "M", "Code": "M", "Sequence": 0, ... }
    ]
  }
]
```

**Cách hoạt động**:
1. Collect tất cả unique `selected_attribute_value_ids` từ variants
2. Query `product_attribute_values` JOIN `product_attributes` từ DB
3. Group theo `tpos_attribute_id`
4. Build object `{ Attribute: {Id, Name}, Values: [{Id, Name, Code, Sequence, ...}] }`

#### generateProductVariants()

Tạo mảng variant objects (~80 fields mỗi variant) cho TPOS API.

```typescript
function generateProductVariants(
  productName: string,
  listPrice: number,
  attributeLines: TPOSAttributeLine[],
  baseProductId?: number
): TPOSProductVariant[]
```

Mỗi variant object chứa đầy đủ fields theo TPOS template:
- `Id: 0`, `Name`, `NameGet`, `ListPrice`, `StandardPrice`
- `Active: true`, `SaleOk: true`, `PurchaseOk: true`
- `Type: "product"`, `Tracking: "none"`
- `UOMId: 1`, `UOMPOId: 1`, `CategId: 33`
- `AttributeValues: [...]` — mảng selected values
- ~70+ fields khác với giá trị mặc định

### 15.4 variant-utils.ts

> File: `src/lib/variant-utils.ts` (177 lines)

```typescript
// Parse "variant_name - product_code" → { name, code }
parseVariant(variant: string): { name: string; code: string }

// Reverse: { name, code } → "variant_name - product_code"
formatVariant(name: string, code: string): string

// Từ attribute values → format string
// isParent=true:  "(Đỏ | Xanh) (S | M | L)"     → pipe + parentheses
// isParent=false: "Đỏ, S"                         → comma, no parentheses
formatVariantFromAttributeValues(
  attrs: Array<{ attrName: string; values: string[] }>,
  isParent: boolean
): string

// Từ TPOS AttributeLines nested structure → parent format
// "(Đỏ | Xanh) (S | M)"
formatVariantFromTPOSAttributeLines(lines: TPOSAttributeLine[]): string
```

---

## 16. Product Code Generator

> File: `src/lib/product-code-generator.ts` (552 lines)

### 16.1 Tổng quan

Auto-generate mã sản phẩm dạng `{Category}{Number}` (VD: `N123`, `P045`, `Q001`).

### 16.2 Category Detection

```typescript
function detectProductCategory(productName: string): 'N' | 'P' | 'Q' | null
```

**Bước 1**: Chuẩn hóa tên → uppercase, bỏ dấu, bỏ ký tự đặc biệt → tách tokens.

**Bước 2**: Sequential token scanning:
- Token 1: Nếu match `^\d{4}$` → bỏ qua (date ddmm)
- Token 2: Nếu match `^[A-Z]\d{1,4}$` → bỏ qua (NCC code: A43)
- Token 3+: So sánh với keyword lists

**Keyword lists**:

```typescript
const CATEGORY_N_KEYWORDS = [
  "QUAN", "AO", "DAM", "SET", "JUM", "AOKHOAC"
];

const CATEGORY_P_KEYWORDS = [
  "TUI", "MATKINH", "KINH", "MYPHAM", "BANGDO",
  "GIAYDEP", "GIAY", "DEP", "NONBERET", "NON",
  "KHANQUANG", "KHAN", "DAYLUNG", "THATLUNG",
  "BALO", "CLUTCH", "VI", "DONGHO", "TRANGSUC",
  "VONGTAY", "DAYCHUYEN", "BONGTAI", "NHAN",
  "GANG", "TAT", "CAVATCA", "CAVAT", "GHIM",
  "TRAMSAI", "KHOACCHOANG", "KEMMATTROI",
  "NUOCHOA", "SONMOI", "KEMNEN", "PHANKEMOT",
  "MASCARA", "KEBMAT", "COTICA", "KEMDUONG",
  "SERUMDA", "MATTNA", "KEMCHONGNANG",
  // ... thêm
];
```

**Bước 3** (fallback): Nếu sequential scan không match → quét TẤT CẢ tokens.

**Bước 4** (default): Nếu tên có cấu trúc valid (có ≥ keyword token) → mặc định `'N'`.

**Category Q**: Dùng cho sản phẩm không thuộc N hoặc P.

### 16.3 Max Number Lookup (3 nguồn)

```typescript
// Nguồn 1: Bảng products (qua RPC)
async function getMaxNumberFromProductsDB(category: string): Promise<number>
// → supabase.rpc('get_max_product_code_number', { category_prefix: category })

// Nguồn 2: Bảng purchase_order_items (qua RPC)
async function getMaxNumberFromPurchaseOrderItemsDB(category: string): Promise<number>
// → supabase.rpc('get_max_product_code_number', { category_prefix: category })

// Nguồn 3: Items hiện tại trong form
function getMaxNumberFromItems(items: any[], category: string): number
// → Regex match `^{category}(\d+)` → max number
```

**Kết quả cuối cùng**: `maxNumber = Math.max(source1, source2, source3)`

### 16.4 Full Generation Flow

```typescript
async function generateProductCodeFromMax(
  productName: string,
  existingItems: any[],
  maxAttempts: number = 30
): Promise<string | null>
```

```
1. detectProductCategory(productName) → category ('N' | 'P' | 'Q')
2. getMaxNumber từ 3 nguồn → maxNumber
3. Loop (max 30 attempts):
   a. candidateCode = `${category}${(maxNumber + attempt).toString().padStart(3, '0')}`
   b. isProductCodeExists(candidateCode, existingItems)
      - Check form items
      - Check purchase_order_items DB
      - Check products DB
   c. Nếu không trùng → check TPOS: searchTPOSProduct(candidateCode)
   d. Nếu TPOS cũng không có → return candidateCode
   e. Nếu trùng → attempt++, thử tiếp
4. Sau 30 attempts → return null (thất bại)
```

### 16.5 extractBaseProductCode()

```typescript
function extractBaseProductCode(code: string): string
// Pattern: ^([A-Z]+\d+)
// "N123VX" → "N123"
// "P045"   → "P045"
// Dùng để group variants cùng sản phẩm gốc
```

---

## 17. TPOS Product Sync

> File: `src/lib/tpos-product-sync.ts` (732 lines)

### 17.1 upsertProductFromTPOS()

Đồng bộ 1 sản phẩm từ TPOS → Supabase, chiến lược **DELETE-THEN-INSERT**.

```typescript
async function upsertProductFromTPOS(
  productCode: string,
  token: string
): Promise<{ success: boolean; message: string }>
```

**Flow**:
```
1. searchTPOSProduct(productCode, token) → tìm product trên TPOS
2. Nếu không tìm thấy → return { success: false }
3. Fetch chi tiết: GET /odata/Product({id})?$expand=UOM,Categ,AttributeValues,...
4. DELETE FROM products WHERE product_code = productCode
5. INSERT parent product:
   {
     product_code, product_name, tpos_product_id,
     tpos_image_url, purchase_price, selling_price,
     base_product_code: productCode,
     variant: null (parent không có variant)
   }
6. Nếu có variants (AttributeValues):
   - Với mỗi variant → INSERT:
     {
       product_code: variant.DefaultCode,
       product_name: variant.Name,
       base_product_code: productCode,  // trỏ về parent
       variant: "Đỏ, M",
       tpos_product_id: variant.Id,
       purchase_price, selling_price
     }
```

### 17.2 syncAllProducts()

Batch sync tất cả products có `tpos_product_id`.

```typescript
async function syncAllProducts(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncProgress>

interface SyncProgress {
  current: number;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  logs: string[];
}
```

**Config**: 5 concurrent, 200ms delay giữa các batch.

**Flow**:
```
1. Paginated fetch: SELECT DISTINCT product_code FROM products
   WHERE tpos_product_id IS NOT NULL
   LIMIT 100 OFFSET {page * 100}
2. Batch 5 products mỗi lần
3. Mỗi product → upsertProductFromTPOS()
4. Cập nhật: tpos_image_url, purchase_price, selling_price
5. Sleep 200ms giữa batches
6. Report progress qua callback
```

### 17.3 syncAllVariants()

Batch sync tất cả variants có `productid_bienthe` field.

```typescript
async function syncAllVariants(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncProgress>
```

**TPOS endpoint cho variant details**:
```
GET https://tomato.tpos.vn/odata/Product({tpos_product_id})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues
```

Cập nhật variant: `tpos_image_url`, `purchase_price`, `selling_price`, `base_product_code`.

---

## 18. Supplier Detector

> File: `src/lib/supplier-detector.ts` (130 lines)

### 18.1 Phát hiện NCC từ tên sản phẩm

```typescript
function detectSupplierFromProductName(name: string): string | null
function detectSupplierWithConfidence(name: string): {
  supplierName: string | null;
  confidence: 'high' | 'medium' | 'low';
  position: number;  // vị trí trong chuỗi
}
```

### 18.2 Patterns (theo thứ tự ưu tiên)

| # | Pattern | Ví dụ | Confidence |
|---|---------|-------|------------|
| 1 | `^\d{4}\s+([A-Z]\d{1,4})\s+` | "0510 **A43** SET ÁO DÀI" | high |
| 2 | `^\[[\w\d]+\]\s*\d{4}\s+([A-Z]\d{1,4})\s+` | "[TAG] 0510 **A43** SET ÁO" | high |
| 3 | `^([A-Z]\d{1,4})\s+` | "**A43** SET ÁO DÀI" | medium |
| 4 | `\b([A-Z]\d{1,4})\b` | "SET ÁO **A43** DÀI" | low |

**Capture group**: `[A-Z]\d{1,4}` → 1 chữ cái + 1-4 số (VD: A43, B1, C1234).

---

## 19. Utility Functions

### 19.1 image-utils.ts - Nén ảnh

> File: `src/lib/image-utils.ts` (83 lines)

```typescript
async function compressImage(
  file: File,
  maxSizeMB: number = 1,        // Max 1MB
  maxWidth: number = 1920,
  maxHeight: number = 1920
): Promise<File>
```

**Thuật toán**:
1. Nếu `file.size <= maxSizeMB * 1024 * 1024` → return nguyên file
2. Load vào `Image` element
3. Tính size mới giữ tỷ lệ: `ratio = min(maxW/w, maxH/h)`
4. Vẽ lên `<canvas>` với kích thước mới
5. `canvas.toBlob()` với quality bắt đầu `0.9`
6. Nếu vẫn lớn → giảm quality `0.1` mỗi lần, dừng ở `0.5`
7. Return `new File([blob], name, { type: 'image/jpeg' })`

### 19.2 tpos-image-loader.ts - Load ảnh SP

> File: `src/lib/tpos-image-loader.ts` (64 lines)

```typescript
// Lấy ảnh parent nếu đây là child variant
async function getParentImageUrl(
  productCode: string,
  baseProductCode: string | null
): Promise<string | null>
// → Query products WHERE product_code = baseProductCode → tpos_image_url

// Priority-based image URL
function getProductImageUrl(
  productImages: string[] | null,  // Priority 1: Supabase uploaded
  tposImageUrl: string | null,      // Priority 2: TPOS cached
  parentImageUrl?: string | null    // Priority 3: Parent's image
): string | null
```

### 19.3 order-image-generator.ts - Tạo ảnh đơn hàng

> File: `src/lib/order-image-generator.ts` (95 lines)

```typescript
async function generateOrderImage(
  imageUrl: string,
  variant: string,
  quantity: number,
  productName: string
): Promise<void>  // Copies to clipboard
```

**Canvas composition**:
```
┌───────────────────┐
│                   │
│   Product Image   │  ← 2/3 chiều cao
│   (object-fit)    │
│                   │
├───────────────────┤
│  ĐỎ, M - 5       │  ← 1/3 chiều cao, nền đỏ, chữ trắng bold
└───────────────────┘
```

- Font size auto-scale: tính toán sao cho text chiếm 90% width
- Output: copy trực tiếp vào clipboard qua `navigator.clipboard.write([ClipboardItem])`

### 19.4 currency-utils.ts

> File: `src/lib/currency-utils.ts` (8 lines)

```typescript
function formatVND(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}
// formatVND(150000) → "150.000 đ"
```

---

## 20. UI Components

### 20.1 UnifiedImageUpload

> File: `src/components/ui/unified-image-upload.tsx` (371 lines)

Component upload ảnh tổng hợp, dùng xuyên suốt dự án.

#### Props
```typescript
interface UnifiedImageUploadProps {
  value: string[];              // Mảng URL ảnh hiện tại
  onChange: (urls: string[]) => void;
  maxFiles?: number;            // Mặc định: 5
  maxSizeMB?: number;           // Mặc định: 5MB
  bucket?: string;              // Supabase Storage bucket
  folder?: string;              // Sub-folder trong bucket
  placeholder?: string;         // Text placeholder
  showPreview?: boolean;        // Hiện preview (default: true)
  compressThreshold?: number;   // MB, auto-compress nếu > threshold
  preventMultiple?: boolean;    // Chặn upload nhiều file cùng lúc
  customHeight?: string;        // Custom height CSS
}
```

#### Tính năng
| Tính năng | Mô tả |
|-----------|-------|
| Paste (Ctrl+V) | Paste ảnh từ clipboard |
| Drag & Drop | Kéo thả file vào vùng upload |
| File Input | Chọn file từ dialog |
| Camera (mobile) | Chụp ảnh trực tiếp |
| Auto-compress | Nén ảnh nếu > threshold MB |
| Progress | Thanh progress % khi upload |
| Preview | Hiện thumbnail + nút xóa |
| Upload Lock | `globalUploadInProgress` ngăn upload nhiều nơi cùng lúc |

#### Upload Flow
```
1. User chọn/paste/drag file
2. Check globalUploadInProgress (lock nếu đang upload nơi khác)
3. Validate: file type (image/*), size (maxSizeMB)
4. Nếu file > compressThreshold → compressImage()
5. Upload lên Supabase Storage:
   supabase.storage
     .from(bucket)
     .upload(`${folder}/${timestamp}_${filename}`, file)
6. Get public URL:
   supabase.storage.from(bucket).getPublicUrl(path)
7. onChange([...value, publicUrl])
8. Release lock
```

### 20.2 ImageUploadCell

> File: `src/components/purchase-orders/ImageUploadCell.tsx` (90 lines)

Wrapper nhỏ gọn của `UnifiedImageUpload` cho table cell trong Create/Edit dialog.

```typescript
interface ImageUploadCellProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  itemIndex: number;
  disabled?: boolean;
  imageCache?: Map<string, string>;     // URL → base64 cache
  onCacheUpdate?: (url: string, base64: string) => void;
}
```

**Config cố định**: `maxFiles={1}`, `bucket="purchase-images"`, `folder="purchase-order-items"`.

**Auto-cache**: Khi có URL mới → fetch → convert to base64 → gọi `onCacheUpdate(url, base64)`.
Cache dùng khi build TPOS payload (TPOS cần base64, không nhận URL).

---

## 21. Hooks

### 21.1 useProductVariants

> File: `src/hooks/use-product-variants.ts` (37 lines)

```typescript
function useProductVariants(baseProductCode?: string): {
  data: ProductVariant[] | undefined;
  isLoading: boolean;
}

interface ProductVariant {
  id: string;
  product_code: string;
  product_name: string;
  variant: string | null;
  product_images: string[] | null;
  tpos_image_url: string | null;
  stock_quantity: number | null;
  base_product_code: string | null;
}
```

**Query**:
```typescript
supabase.from('products')
  .select('id, product_code, product_name, variant, product_images, tpos_image_url, stock_quantity, base_product_code')
  .eq('base_product_code', baseProductCode)
  .not('variant', 'is', null)
  .neq('product_code', baseProductCode)  // Loại bỏ parent
```

**Khi dùng**: `VariantDropdownSelector` gọi hook này để lấy danh sách variants hiện có cho 1 sản phẩm gốc.

### 21.2 useTPOSOrderDetails

> File: `src/hooks/use-tpos-order-details.ts` (73 lines)

```typescript
function useTPOSOrderDetails(params: {
  sessionIndex: number;
  startDate: string;     // YYYY-MM-DD
  endDate: string;       // YYYY-MM-DD
  enabled: boolean;
}): UseQueryResult<TPOSOrderDetail>
```

**Flow**:
```
1. getTPOSBearerToken() → token
2. fetchTPOSOrdersBySessionIndex(token, sessionIndex, startDate, endDate) → orderId
3. fetchTPOSOrderDetails(token, orderId) → chi tiết đơn hàng TPOS
```

**Config**: `staleTime: 5 * 60 * 1000` (5 phút), `retry: 1`.

### 21.3 useImagePaste

> File: `src/hooks/use-image-paste.ts` (38 lines)

```typescript
function useImagePaste(
  onImagePaste: (dataUrl: string) => void,
  enabled: boolean = true
): void
```

**Cách hoạt động**:
- `useEffect` → `document.addEventListener('paste', handler)`
- Handler: check `e.clipboardData.items` → find type `image/*`
- Convert blob → `FileReader.readAsDataURL()` → callback `onImagePaste(base64DataUrl)`

---

## 22. Goods Receiving Module

### 22.1 Tổng quan

Module kiểm hàng nhập — sau khi đơn hàng ở trạng thái `pending`, nhân viên kiểm tra số lượng thực nhận.

**Status flow**:
```
purchase_orders.status = 'pending'
  → Nhân viên kiểm hàng (CreateReceivingDialog)
  → INSERT goods_receiving + goods_receiving_items
  → UPDATE purchase_orders.status = 'received'
```

### 22.2 GoodsReceiving.tsx (Trang chính)

> File: `src/pages/GoodsReceiving.tsx` (273 lines)

#### State
```typescript
const [statusFilter, setStatusFilter] = useState('needInspection');
const [dateRange, setDateRange] = useState({ from: Date, to: Date });
const [searchQuery, setSearchQuery] = useState('');
const [quickFilter, setQuickFilter] = useState('thisMonth');
```

#### Status Filters
| Filter | Query | Mô tả |
|--------|-------|-------|
| `needInspection` | `status IN ('pending', 'awaiting_export')` AND no goods_receiving | Cần kiểm |
| `inspected` | Has goods_receiving record | Đã kiểm |
| `shortage` | Has goods_receiving AND has_discrepancy = true | Có thiếu/dư |
| `all` | Tất cả | Tất cả |

#### Quick Date Filters
| Filter | Range |
|--------|-------|
| `today` | Hôm nay |
| `yesterday` | Hôm qua |
| `week` | 7 ngày gần nhất |
| `month` | 30 ngày gần nhất |
| `thisMonth` | Đầu tháng → hôm nay |
| `lastMonth` | Đầu tháng trước → cuối tháng trước |

#### Data Query
```typescript
// 1. Fetch purchase orders
const { data: orders } = await supabase
  .from('purchase_orders')
  .select('*, items:purchase_order_items(*)')
  .gte('order_date', dateRange.from)
  .lte('order_date', dateRange.to)
  .order('order_date', { ascending: false });

// 2. Với mỗi order, fetch goods_receiving
for (const order of orders) {
  const { data: receiving } = await supabase
    .from('goods_receiving')
    .select('*, items:goods_receiving_items(*)')
    .eq('purchase_order_id', order.id)
    .maybeSingle();

  order.receiving = receiving;
}

// 3. Tính overallStatus cho mỗi order
order.overallStatus = receiving
  ? (receiving.has_discrepancy
    ? (hasShortage ? 'shortage' : 'overage')
    : 'match')
  : 'needInspection';
```

### 22.3 GoodsReceivingList.tsx

> File: `src/components/goods-receiving/GoodsReceivingList.tsx` (408 lines)

#### Props
```typescript
interface GoodsReceivingListProps {
  orders: any[];
  isLoading: boolean;
  onCreateReceiving: (orderId: string) => void;
  onViewReceiving: (orderId: string) => void;
}
```

#### Desktop Layout (Table)
| Column | Field | Format |
|--------|-------|--------|
| Ngày đặt | `order_date` | dd/MM/yyyy |
| NCC | `supplier_name` | Text |
| Tổng SP | `items.length` | Number |
| Tổng SL | `SUM(items.quantity)` | Number |
| Ngày kiểm | `receiving.receiving_date` | dd/MM/yyyy HH:mm |
| Trạng thái | `overallStatus` | Badge (xem bảng dưới) |
| Thao tác | | Button: Kiểm hàng / Xem kết quả |

#### Status Badges
| Status | Label | Style |
|--------|-------|-------|
| `needInspection` | Cần kiểm | `bg-amber-50 text-amber-700 border-amber-200` |
| `match` | Đủ hàng | `bg-green-50 text-green-700 border-green-200` |
| `shortage` | Thiếu hàng | `bg-red-50 text-red-700 border-red-200` |
| `overage` | Dư hàng | `bg-orange-50 text-orange-700 border-orange-200` |

#### Mobile Layout (Cards)
```
┌─────────────────────────────┐
│ NCC: A43        [Cần kiểm]  │
│ Ngày: 05/02/2026            │
│ 5 SP · 25 sản phẩm          │
│                [Kiểm hàng]  │
└─────────────────────────────┘
```

### 22.4 GoodsReceivingStats.tsx

> File: `src/components/goods-receiving/GoodsReceivingStats.tsx` (118 lines)

**Ẩn trên mobile** (`useIsMobile() → return null`).

5 cards thống kê:

| Card | Tính toán | Icon | Color |
|------|----------|------|-------|
| Tổng đơn hàng | `filteredOrders.length` | Package | blue |
| Tổng giá trị | `SUM(final_amount \|\| total_amount)` | DollarSign | emerald |
| Đã kiểm hôm nay | `COUNT WHERE receiving_date = today` | CheckCircle | green |
| Có chênh lệch | `COUNT WHERE has_discrepancy = true` | AlertTriangle | amber |
| Tổng sản phẩm | `SUM(items.quantity)` | Boxes | purple |

### 22.5 CreateReceivingDialog.tsx

> File: `src/components/goods-receiving/CreateReceivingDialog.tsx` (347 lines)

**Chức năng**: Nhập số lượng thực nhận cho từng item, xác nhận và lưu kết quả kiểm hàng.

#### Props
```typescript
interface CreateReceivingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onSuccess: () => void;
}
```

#### State
```typescript
const [items, setItems] = useState<ReceivingItem[]>([]);
// Mỗi item:
{
  purchase_order_item_id: string;
  product_name: string;
  product_code: string;
  variant: string;
  expected_quantity: number;   // SL đặt (từ purchase_order_items)
  received_quantity: number;   // SL nhận (user nhập)
  confirmed: boolean;          // Đã xác nhận item này chưa
}
```

#### Per-Item Confirmation Pattern
- User **phải confirm từng item** trước khi submit
- Nút Submit chỉ enable khi **tất cả items đã confirmed**
- Mỗi item hiển thị qua `ReceivingItemRow` component

#### Submit Flow (3 bước)
```typescript
async function handleSubmit() {
  const totalExpected = items.reduce((s, i) => s + i.expected_quantity, 0);
  const totalReceived = items.reduce((s, i) => s + i.received_quantity, 0);
  const hasDiscrepancy = items.some(i => i.received_quantity !== i.expected_quantity);

  // Bước 1: INSERT goods_receiving
  const { data: receiving } = await supabase
    .from('goods_receiving')
    .insert({
      purchase_order_id: orderId,
      received_by_user_id: user.id,
      received_by_username: user.email,
      receiving_date: new Date().toISOString(),
      total_items_expected: totalExpected,
      total_items_received: totalReceived,
      has_discrepancy: hasDiscrepancy,
      notes: notes,
    })
    .select()
    .single();

  // Bước 2: INSERT goods_receiving_items (cho từng item)
  const receivingItems = items.map(item => {
    const diff = item.received_quantity - item.expected_quantity;
    return {
      goods_receiving_id: receiving.id,
      purchase_order_item_id: item.purchase_order_item_id,
      product_name: item.product_name,
      product_code: item.product_code,
      variant: item.variant,
      expected_quantity: item.expected_quantity,
      received_quantity: item.received_quantity,
      discrepancy_type: diff < 0 ? 'shortage' : diff > 0 ? 'overage' : 'match',
      discrepancy_quantity: Math.abs(diff),
    };
  });
  await supabase.from('goods_receiving_items').insert(receivingItems);

  // Bước 3: UPDATE purchase_orders status
  await supabase.from('purchase_orders')
    .update({ status: 'received' })
    .eq('id', orderId);
}
```

### 22.6 ReceivingItemRow.tsx

> File: `src/components/goods-receiving/ReceivingItemRow.tsx` (182 lines)

#### Props
```typescript
interface ReceivingItemRowProps {
  item: ReceivingItem;
  onQuantityChange: (quantity: number) => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
}
```

#### Layout (Dual mode)

**Desktop (Table Row)**:
```
│ Tên SP │ Biến thể │ SL Đặt │ SL Nhận [input] │ Kết quả │ [Confirm] │
```

**Mobile (Card)**:
```
┌──────────────────────────────┐
│ Áo dài đỏ - Đỏ, M           │
│ Đặt: 5    Nhận: [  5  ]     │
│ ✅ Đủ hàng       [Xác nhận]  │
└──────────────────────────────┘
```

#### Color Coding
| Trạng thái | Input Style | Badge |
|-----------|-------------|-------|
| Đủ hàng (received = expected) | `border-green-500 bg-green-50` | ✅ Đủ hàng (green) |
| Thiếu (received < expected) | `border-red-500 bg-red-50` | ⚠️ Thiếu N (red) |
| Dư (received > expected) | `border-orange-500 bg-orange-50` | ⚠️ Dư N (orange) |

### 22.7 ViewReceivingDialog.tsx

> File: `src/components/goods-receiving/ViewReceivingDialog.tsx` (277 lines)

**Chức năng**: Xem kết quả kiểm hàng đã hoàn thành (read-only).

#### Data Fetch
```typescript
const { data } = await supabase
  .from('goods_receiving')
  .select(`
    *,
    items:goods_receiving_items(
      *,
      purchase_order_item:purchase_order_items(
        product_images,
        product_code
      )
    )
  `)
  .eq('purchase_order_id', orderId)
  .maybeSingle();
```

#### Fallback Image Loading
Nếu item không có ảnh từ `purchase_order_items.product_images`:
```typescript
// Fetch từ bảng products
const { data: productData } = await supabase
  .from('products')
  .select('product_images, tpos_image_url')
  .eq('product_code', productCode)
  .maybeSingle();

// Priority: product_images[0] → tpos_image_url
```

#### Row Color Coding
```typescript
function getRowClassName(item) {
  const diff = item.received_quantity - item.expected_quantity;
  if (diff < 0) return "bg-red-200 hover:bg-red-300";      // Thiếu
  if (diff > 0) return "bg-orange-50/70 hover:bg-orange-50"; // Dư
  return "bg-green-50/70 hover:bg-green-50";                 // Đủ
}
```

#### Info Section
```
┌───────────────────────────────────────────┐
│ Ngày kiểm: 05/02/2026 14:30              │
│ Người kiểm: admin@example.com            │
│ Tổng đặt: 25   Tổng nhận: 23            │
│ Trạng thái: [Có chênh lệch]             │
└───────────────────────────────────────────┘
```

#### Items Table
| Column | Mô tả |
|--------|-------|
| Hình ảnh | Product image (16x16, hover zoom 150%) |
| Sản phẩm | product_name |
| Biến thể | variant |
| SL Đặt | expected_quantity |
| SL Nhận | received_quantity |
| Kết quả | Icon + text: Thiếu N / Dư N / Đủ hàng |

---

## Tham khảo Code

### Pages
- [PurchaseOrders.tsx](../src/pages/PurchaseOrders.tsx) - Trang chính đơn đặt hàng
- [GoodsReceiving.tsx](../src/pages/GoodsReceiving.tsx) - Trang kiểm hàng nhập

### Components - Purchase Orders
- [CreatePurchaseOrderDialog.tsx](../src/components/purchase-orders/CreatePurchaseOrderDialog.tsx) - Modal tạo đơn
- [EditPurchaseOrderDialog.tsx](../src/components/purchase-orders/EditPurchaseOrderDialog.tsx) - Modal sửa đơn
- [PurchaseOrderDetailDialog.tsx](../src/components/purchase-orders/PurchaseOrderDetailDialog.tsx) - Dialog xem chi tiết
- [PurchaseOrderList.tsx](../src/components/purchase-orders/PurchaseOrderList.tsx) - Bảng dữ liệu
- [PurchaseOrderStats.tsx](../src/components/purchase-orders/PurchaseOrderStats.tsx) - Thống kê
- [ImageUploadCell.tsx](../src/components/purchase-orders/ImageUploadCell.tsx) - Upload ảnh cho table
- [VariantGeneratorDialog.tsx](../src/components/purchase-orders/VariantGeneratorDialog.tsx) - Dialog tạo biến thể
- [VariantDropdownSelector.tsx](../src/components/purchase-orders/VariantDropdownSelector.tsx) - Dropdown chọn variant

### Components - Goods Receiving
- [GoodsReceivingList.tsx](../src/components/goods-receiving/GoodsReceivingList.tsx) - Danh sách đơn kiểm
- [GoodsReceivingStats.tsx](../src/components/goods-receiving/GoodsReceivingStats.tsx) - Thống kê kiểm hàng
- [CreateReceivingDialog.tsx](../src/components/goods-receiving/CreateReceivingDialog.tsx) - Dialog kiểm hàng
- [ViewReceivingDialog.tsx](../src/components/goods-receiving/ViewReceivingDialog.tsx) - Dialog xem kết quả
- [ReceivingItemRow.tsx](../src/components/goods-receiving/ReceivingItemRow.tsx) - Dòng SP kiểm

### Components - UI
- [unified-image-upload.tsx](../src/components/ui/unified-image-upload.tsx) - Upload ảnh đa năng

### Libraries
- [product-code-generator.ts](../src/lib/product-code-generator.ts) - Auto-gen mã SP
- [tpos-api.ts](../src/lib/tpos-api.ts) - TPOS API
- [tpos-config.ts](../src/lib/tpos-config.ts) - TPOS Config & Token
- [tpos-product-sync.ts](../src/lib/tpos-product-sync.ts) - Đồng bộ SP từ TPOS
- [tpos-variant-converter.ts](../src/lib/tpos-variant-converter.ts) - Chuyển đổi variant TPOS
- [tpos-image-loader.ts](../src/lib/tpos-image-loader.ts) - Load ảnh SP
- [variant-utils.ts](../src/lib/variant-utils.ts) - Parse/format variant
- [supplier-detector.ts](../src/lib/supplier-detector.ts) - Phát hiện NCC
- [image-utils.ts](../src/lib/image-utils.ts) - Nén ảnh
- [order-image-generator.ts](../src/lib/order-image-generator.ts) - Tạo ảnh đơn hàng
- [currency-utils.ts](../src/lib/currency-utils.ts) - Format tiền VND

### Hooks
- [use-product-variants.ts](../src/hooks/use-product-variants.ts) - Query variants
- [use-tpos-order-details.ts](../src/hooks/use-tpos-order-details.ts) - TPOS order details
- [use-image-paste.ts](../src/hooks/use-image-paste.ts) - Paste ảnh

### Supabase Functions
- [process-purchase-order-background](../supabase/functions/process-purchase-order-background/index.ts) - Edge Function 1
- [create-tpos-variants-from-order](../supabase/functions/create-tpos-variants-from-order/index.ts) - Edge Function 2
