# Batch Order Creation (Fast Sale)

## Tổng quan

Hệ thống tạo đơn hàng loạt (Fast Sale) cho phép tạo nhiều đơn hàng cùng lúc thông qua một request duy nhất đến TPOS API.

---

## API Endpoint

### InsertListOrderModel

```
POST /api/fastsaleorder/InsertListOrderModel
```

**Request Body:**
```json
{
  "is_approve": true,    // true = Lưu và xác nhận, false = Chỉ lưu
  "model": [
    {
      "SaleOnline_Ids": [123],
      "PartnerId": 456,
      "PartnerName": "Tên khách hàng",
      "Phone": "0909123456",
      "Address": "Địa chỉ giao hàng",
      "ProductId": 789,
      "ProductName": "Tên sản phẩm",
      "ProductNameGet": "Tên sản phẩm hiển thị",
      "Quantity": 1,
      "PriceUnit": 180000,
      "DeliveryPrice": 20000,
      "CarrierId": 1,
      "AmountDeposit": 0,
      "Discount": 0,
      "Note": "Ghi chú đơn hàng",
      "DeliveryNote": "Ghi chú giao hàng"
    }
    // ... có thể có nhiều đơn hàng
  ]
}
```

**QUAN TRỌNG:** API này đã hỗ trợ tạo hàng loạt trong 1 request. KHÔNG cần gọi nhiều lần.

---

## Flow tạo đơn hàng loạt

```
┌─────────────────────────────────────────────────────────────────┐
│                    User clicks "Lưu xác nhận"                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              Check: isSavingFastSale === true?                   │
│                                                                  │
│   YES → Return immediately (prevent double submit)               │
│   NO  → Set isSavingFastSale = true, disable buttons             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    collectFastSaleData()                         │
│                                                                  │
│   1. Loop through fastSaleOrdersData                             │
│   2. Deduplicate by SaleOnlineId using Set                       │
│   3. Skip orders with ShowState === 'Đã xác nhận'                │
│   4. Collect order data into ordersToSave[]                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              ordersToSave.length === 0?                          │
│                                                                  │
│   YES → Show notification "Không có đơn nào để lưu"              │
│         Reset submission state, Return                           │
│   NO  → Continue                                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│            ONE API Request: InsertListOrderModel                 │
│                                                                  │
│   {                                                              │
│     "is_approve": isApprove,                                     │
│     "model": ordersToSave     // Array of all orders             │
│   }                                                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Process Response                              │
│                                                                  │
│   1. Parse response.value (array of created orders)              │
│   2. For each created order:                                     │
│      - Store to InvoiceStatusStore with complete data            │
│      - Update UI state                                           │
│   3. Show success notification                                   │
│   4. Reset submission state                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Double-Submit Prevention

### Vấn đề
User có thể click nút "Lưu xác nhận" nhiều lần trong khi request đang xử lý, dẫn đến tạo duplicate đơn.

### Giải pháp

```javascript
// Flag global
let isSavingFastSale = false;

// Helper reset state
function resetFastSaleSubmissionState() {
    isSavingFastSale = false;
    const saveBtn = document.getElementById('confirmFastSaleBtn');
    const confirmBtn = document.getElementById('confirmAndCheckFastSaleBtn');
    if (saveBtn) saveBtn.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
}

// Trong saveFastSaleOrders()
async function saveFastSaleOrders(isApprove = false) {
    // Check flag
    if (isSavingFastSale) {
        console.warn('[FAST-SALE] ⚠️ Save already in progress, ignoring duplicate request');
        return;
    }

    // Set flag and disable buttons
    isSavingFastSale = true;
    const saveBtn = document.getElementById('confirmFastSaleBtn');
    const confirmBtn = document.getElementById('confirmAndCheckFastSaleBtn');
    if (saveBtn) saveBtn.disabled = true;
    if (confirmBtn) confirmBtn.disabled = true;

    try {
        // ... process orders ...
    } catch (error) {
        // ... handle error ...
    } finally {
        // ALWAYS reset state
        resetFastSaleSubmissionState();
    }
}
```

### Button IDs
- `confirmFastSaleBtn` - Nút "Lưu" (chỉ lưu, không xác nhận)
- `confirmAndCheckFastSaleBtn` - Nút "Lưu xác nhận"

---

## Order Deduplication

### Vấn đề
Dữ liệu đầu vào có thể chứa duplicate orders (cùng SaleOnlineId).

### Giải pháp

```javascript
function collectFastSaleData() {
    const ordersToSave = [];
    const processedSaleOnlineIds = new Set();  // Track processed IDs

    fastSaleOrdersData.forEach((order, index) => {
        const saleOnlineId = order.SaleOnlineIds?.[0];

        // Skip duplicates
        if (saleOnlineId) {
            if (processedSaleOnlineIds.has(saleOnlineId)) {
                console.log(`[FAST-SALE] Skipping duplicate SaleOnlineId: ${saleOnlineId}`);
                return;  // Skip this iteration
            }
            processedSaleOnlineIds.add(saleOnlineId);
        }

        // ... collect order data ...
    });

    return ordersToSave;
}
```

---

## Confirmed Order Filtering

### Vấn đề
Đơn đã được xác nhận (ShowState === 'Đã xác nhận') không được phép tạo lại.

### Giải pháp - 2 lớp filtering:

#### 1. Khi fetch data (showFastSaleModal)

```javascript
async function showFastSaleModal(selectedOrders) {
    // ... fetch orders ...

    // Filter out confirmed orders
    fastSaleOrdersData = fetchedOrders.filter(order => {
        // Skip if order is already confirmed from API
        if (order.ShowState === 'Đã xác nhận' || order.State === 'open') {
            console.log(`[FAST-SALE] Skipping confirmed order: ${order.Code}`);
            return false;
        }

        // Skip if order is confirmed in local store
        const saleOnlineId = order.SaleOnlineIds?.[0];
        if (saleOnlineId && window.InvoiceStatusStore) {
            const invoiceData = window.InvoiceStatusStore.get(saleOnlineId);
            if (invoiceData && (invoiceData.ShowState === 'Đã xác nhận' || invoiceData.State === 'open')) {
                console.log(`[FAST-SALE] Skipping locally confirmed order: ${saleOnlineId}`);
                return false;
            }
        }

        return true;
    });
}
```

#### 2. Khi collect data (collectFastSaleData)

```javascript
function collectFastSaleData() {
    fastSaleOrdersData.forEach((order, index) => {
        // Skip confirmed orders
        if (order.ShowState === 'Đã xác nhận') {
            console.log(`[FAST-SALE] Skipping confirmed order in collect: ${order.Code}`);
            return;
        }

        // ... process order ...
    });
}
```

---

## InvoiceStatusStore - Complete Data Storage

### Vấn đề cũ
Bill generation dùng fallback logic để lấy `Number`, `DeliveryNote`, `Comment`... Nếu không lưu đầy đủ vào Firebase, khi generate bill sẽ bị thiếu data.

### Giải pháp
Lưu đầy đủ data ngay từ khi nhận response từ API.

```javascript
// Trong InvoiceStatusStore.set()
set(saleOnlineId, invoiceData, originalOrder = null) {
    const order = originalOrder;

    // Ensure complete data - use Reference as Number if Number is null
    const billNumber = invoiceData.Number || invoiceData.Reference || order?.Code || '';

    this._data.set(String(saleOnlineId), {
        Id: invoiceData.Id,
        Number: billNumber,  // Never null - always have a value
        Reference: invoiceData.Reference || order?.Code || '',
        State: invoiceData.State || '',
        ShowState: invoiceData.ShowState || 'Đã xác nhận',
        Comment: invoiceData.Comment || order?.Comment || '',
        DeliveryNote: invoiceData.DeliveryNote || order?.DeliveryNote || '',
        // ... other fields ...
    });

    this._saveToStorage();
}
```

### Khi store từ API result

```javascript
// Trong storeFromApiResult()
storeFromApiResult(apiResult, originalOrders = []) {
    apiResult.forEach(invoiceData => {
        const saleOnlineId = invoiceData.SaleOnline_Id || invoiceData.SaleOnlineId;

        // Find matching original order
        const originalOrder = originalOrders.find(o =>
            o.SaleOnlineIds?.includes(saleOnlineId)
        );

        // Pass original order for complete data
        this.set(saleOnlineId, invoiceData, originalOrder);
    });
}
```

---

## File liên quan

| File | Mô tả |
|------|-------|
| `js/tab1/tab1-fast-sale.js` | Logic chính Fast Sale modal, collect data, save orders |
| `js/tab1/tab1-fast-sale-invoice-status.js` | InvoiceStatusStore - quản lý trạng thái đơn hàng |
| `js/utils/bill-service.js` | Generate bill HTML |
| `InsertListOrderModel.txt` | Sample API request/response |

---

## Test Scenarios

### Scenario 1: 50 đơn hàng loạt

1. User chọn 50 đơn → Click "Lưu xác nhận"
2. `isSavingFastSale = true`, buttons disabled
3. `collectFastSaleData()` tạo array 50 orders (đã dedupe)
4. **1 request** InsertListOrderModel với `model: [50 orders]`
5. Response trả về 50 created orders
6. Loop qua response, lưu vào InvoiceStatusStore
7. Reset state, enable buttons

### Scenario 2: 1 đơn hàng

1. User chọn 1 đơn → Click "Lưu xác nhận"
2. `isSavingFastSale = true`, buttons disabled
3. `collectFastSaleData()` tạo array 1 order
4. **1 request** InsertListOrderModel với `model: [1 order]`
5. Response trả về 1 created order
6. Lưu vào InvoiceStatusStore
7. Reset state, enable buttons

### Scenario 3: Double-click prevention

1. User click "Lưu xác nhận"
2. `isSavingFastSale = true`
3. User click lại trong khi request đang chạy
4. Check `isSavingFastSale === true` → Return immediately
5. Không có duplicate request

### Scenario 4: Có đơn đã xác nhận

1. User chọn 10 đơn (3 đã xác nhận, 7 chưa)
2. `showFastSaleModal()` filter ra 3 đơn đã xác nhận
3. `fastSaleOrdersData` chỉ còn 7 đơn
4. Request chỉ tạo 7 đơn mới

---

## Troubleshooting

### Vấn đề: Duplicate orders

**Nguyên nhân:**
- Double-click nút save
- Dữ liệu đầu vào có duplicate SaleOnlineId

**Giải pháp:**
- Check `isSavingFastSale` flag
- Dùng Set để deduplicate

### Vấn đề: Bill thiếu thông tin

**Nguyên nhân:**
- InvoiceStatusStore không lưu đầy đủ data

**Giải pháp:**
- Lưu complete data ngay từ `set()` method
- Pass `originalOrder` khi gọi `storeFromApiResult()`

### Vấn đề: Đơn đã xác nhận bị tạo lại

**Nguyên nhân:**
- Không filter đơn đã xác nhận

**Giải pháp:**
- Filter ở `showFastSaleModal()` khi fetch
- Filter ở `collectFastSaleData()` khi collect

---

## Changelog

### 2026-01-28
- Fix duplicate order creation by adding Set deduplication
- Add double-submit prevention with flag and button disable
- Filter confirmed orders (ShowState === 'Đã xác nhận')
- Store complete data to InvoiceStatusStore
- Ensure single API request for batch creation
