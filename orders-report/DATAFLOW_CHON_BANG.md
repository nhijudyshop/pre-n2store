# Data Flow: Ô "Chọn Bảng" - Báo Cáo Tổng Hợp

## Tổng quan

Trang **Báo Cáo Tổng Hợp** (`/orders-report`) có ô dropdown "Chọn bảng" cho phép người dùng chọn các bảng đơn hàng đã lưu. Document này mô tả chi tiết flow lấy data từ Tab 1 (Quản Lý Đơn Hàng).

---

## Sơ đồ Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MAIN.HTML (Tab Container)                          │
│                     Đóng vai trò "Message Broker"                            │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
    ┌────▼─────┐           ┌─────▼─────┐          ┌──────▼──────┐
    │  Tab 1   │◄─────────►│  Tab 2    │          │ Tab-Overview│
    │Quản Lý   │ postMsg   │ Statistics│          │ Báo Cáo     │
    │Đơn Hàng  │           │           │          │ Tổng Hợp    │
    └────┬─────┘           └───────────┘          └──────▲──────┘
         │                                               │
         │ 1. REQUEST_ORDERS_DATA_FROM_OVERVIEW          │
         │◄──────────────────────────────────────────────│
         │                                               │
         │ 2. ORDERS_DATA_RESPONSE                       │
         │   (orders, tableName, timestamp)              │
         │──────────────────────────────────────────────►│
         │                                               │
         │                                        ┌──────┴──────┐
         │                                        │   Firebase  │
         │                                        │report_order │
         │                                        │  _details   │
         │                                        └─────────────┘
```

---

## Chi tiết các bước

### Bước 1: Tab-Overview yêu cầu data từ Tab 1

**File:** `tab-overview.html` - line 1329-1337

```javascript
function requestDataFromTab1() {
    console.log('[REPORT] Requesting data from tab1...');

    window.parent.postMessage({
        type: 'REQUEST_ORDERS_DATA_FROM_OVERVIEW'
    }, '*');
}
```

**Khi nào được gọi:**
- Khi trang load lần đầu
- Khi người dùng nhấn nút "Làm mới danh sách"

---

### Bước 2: Main.html forward request đến Tab 1

**File:** `main.html` - line 488-497

```javascript
} else if (e.data.type === "REQUEST_ORDERS_DATA_FROM_OVERVIEW") {
    // Overview tab requesting orders data
    const ordersFrame = document.getElementById("ordersFrame");
    if (ordersFrame && ordersFrame.contentWindow) {
        // Forward request to tab1 (convert to generic REQUEST_ORDERS_DATA)
        ordersFrame.contentWindow.postMessage(
            { type: "REQUEST_ORDERS_DATA" },
            "*"
        );
    }
}
```

---

### Bước 3: Tab 1 nhận request và gửi data

**File:** `tab1-orders.js` - line 9234-9254

```javascript
// Handle request for orders data from overview tab
if (event.data.type === "REQUEST_ORDERS_DATA_FROM_OVERVIEW") {
    console.log('📨 [OVERVIEW] Nhận request orders data từ tab Báo Cáo Tổng Hợp');

    // Check if data is loaded
    if (!allData || allData.length === 0) {
        // Retry after 1 second
        setTimeout(() => {
            if (allData && allData.length > 0) {
                sendOrdersDataToOverview();
            }
        }, 1000);
        return;
    }

    sendOrdersDataToOverview();
}
```

**Hàm `sendOrdersDataToOverview()`** - line 9381-9424:

```javascript
function sendOrdersDataToOverview() {
    // Prepare orders data with STT - use displayed/filtered data
    const ordersDataToSend = displayedData.map((order, index) => ({
        stt: order.SessionIndex || (index + 1).toString(),
        orderId: order.Id,
        orderCode: order.Code,
        customerName: order.PartnerName || order.Name,
        phone: order.PartnerPhone || order.Telephone,
        address: order.PartnerAddress || order.Address,
        totalAmount: order.TotalAmount || order.AmountTotal || 0,
        quantity: order.TotalQuantity || ...,
        note: order.Note,
        state: order.Status || order.State,
        dateOrder: order.DateCreated || order.DateOrder,
        Tags: order.Tags,
        liveCampaignName: order.LiveCampaignName,
        products: order.Details?.map(d => ({...})) || []
    }));

    // Send to overview tab via parent window
    const tableNameToSend = currentTableName || 'Bảng 1';

    window.parent.postMessage({
        type: 'ORDERS_DATA_RESPONSE',
        orders: ordersDataToSend,
        tableName: tableNameToSend,  // ⭐ Tên bảng từ Tab 1
        timestamp: Date.now()
    }, '*');
}
```

---

### Bước 4: Main.html forward response đến Tab-Overview

**File:** `main.html` - line 498-507

```javascript
} else if (e.data.type === "ORDERS_DATA_RESPONSE") {
    // Forward orders data from Tab 1 to Tab 3 and Overview
    const productAssignmentFrame = document.getElementById("productAssignmentFrame");
    if (productAssignmentFrame && productAssignmentFrame.contentWindow) {
        productAssignmentFrame.contentWindow.postMessage(e.data, "*");
    }
    const overviewFrame = document.getElementById("overviewFrame");
    if (overviewFrame && overviewFrame.contentWindow) {
        overviewFrame.contentWindow.postMessage(e.data, "*");
    }
}
```

---

### Bước 5: Tab-Overview nhận data và cập nhật dropdown

**File:** `tab-overview.html` - line 1180-1280

```javascript
window.addEventListener('message', (event) => {
    if (event.data.type === 'ORDERS_DATA_RESPONSE') {
        const tab1TableName = event.data.tableName || 'Bảng 1';

        // Cập nhật orders và table name
        allOrders = event.data.orders || [];
        currentTableName = tab1TableName;
        justReceivedFromTab1 = true;

        // Cập nhật dropdown selector
        const selector = document.getElementById('tableSelector');
        if (selector && currentTableName) {
            let optionExists = false;
            for (let option of selector.options) {
                if (option.value === currentTableName) {
                    optionExists = true;
                    // Cập nhật text với số đơn hiện tại
                    option.textContent = `${currentTableName} (${allOrders.length} đơn - hiện tại)`;
                    break;
                }
            }

            // Thêm option mới nếu chưa có
            if (!optionExists) {
                const newOption = document.createElement('option');
                newOption.value = currentTableName;
                newOption.textContent = `${currentTableName} (${allOrders.length} đơn - hiện tại)`;
                selector.appendChild(newOption);
            }

            selector.value = currentTableName;
        }

        // Reload available tables từ Firebase
        loadAvailableTables();
    }
});
```

---

## Load danh sách bảng từ Firebase

**Hàm `loadAvailableTables()`** - line 985-1063

```javascript
async function loadAvailableTables() {
    const ref = database.ref(FIREBASE_PATH); // = 'report_order_details'
    const snapshot = await ref.once('value');
    const tables = snapshot.val() || {};

    const selector = document.getElementById('tableSelector');
    selector.innerHTML = '<option value="">-- Chọn bảng --</option>';

    // Duyệt qua các bảng đã lưu trong Firebase
    Object.keys(tables).forEach(safeTableName => {
        const tableData = tables[safeTableName];
        const originalName = tableData.tableName || safeTableName.replace(/_/g, ' ');
        const orderCount = tableData.orders?.length || 0;
        const fetchedAt = tableData.fetchedAt
            ? new Date(tableData.fetchedAt).toLocaleString('vi-VN')
            : '';

        const option = document.createElement('option');
        option.value = originalName;
        option.textContent = `${originalName} (${orderCount} đơn - ${fetchedAt})`;
        selector.appendChild(option);
    });

    // Nếu bảng hiện tại chưa có trong Firebase, thêm vào dropdown
    if (currentTableName && !optionExists && allOrders.length > 0) {
        const newOption = document.createElement('option');
        newOption.value = currentTableName;
        newOption.textContent = `${currentTableName} (${allOrders.length} đơn - hiện tại)`;
        selector.appendChild(newOption);
    }
}
```

---

## Firebase Structure

```
Firebase Realtime Database
└── report_order_details/
    ├── Bang_1/                    // safeTableName (replace spaces with _)
    │   ├── tableName: "Bảng 1"    // Original name
    │   ├── orders: [...]          // Array of order objects
    │   ├── fetchedAt: "2025-12-19T14:30:45.000Z"
    │   ├── totalOrders: 759
    │   ├── successCount: 759
    │   └── errorCount: 0
    │
    ├── Bang_2/
    │   ├── tableName: "Bảng 2"
    │   └── ...
    │
    └── Tet_2025/
        ├── tableName: "Tết 2025"
        └── ...
```

**Firebase Path:** `report_order_details`

---

## Xử lý khi người dùng chọn bảng khác

**Hàm `handleTableChange()`** - line 1066-1087

```javascript
async function handleTableChange() {
    const selector = document.getElementById('tableSelector');
    const selectedTable = selector.value;

    if (!selectedTable) return;

    console.log(`[REPORT] 📋 User manually switching to table: ${selectedTable}`);
    userManuallySelectedTable = true; // Đánh dấu user đã chọn thủ công
    currentTableName = selectedTable;

    // Load data từ Firebase
    await loadTableDataFromFirebase(selectedTable);

    // Update UI
    updateCachedCountBadge();
    renderCachedDetailsTab();
    renderOrdersTable();
}
```

---

## Luồng thay đổi tên bảng từ Tab 1

Khi người dùng đổi tên bảng ở Tab 1, message được forward đến Tab-Overview:

**File:** `main.html` - line 548-554

```javascript
} else if (e.data.type === "TABLE_NAME_CHANGED") {
    // Forward table name change from Tab1 to Overview
    const overviewFrame = document.getElementById("overviewFrame");
    if (overviewFrame && overviewFrame.contentWindow) {
        overviewFrame.contentWindow.postMessage(e.data, "*");
    }
}
```

**File:** `tab-overview.html` - line 1282-1304

```javascript
// Handle table name change notification from tab1
if (event.data.type === 'TABLE_NAME_CHANGED') {
    // Nếu user đang chọn bảng khác, không override
    if (userManuallySelectedTable && currentTableName !== event.data.tableName) {
        loadAvailableTables(); // Chỉ reload list
        return;
    }

    currentTableName = event.data.tableName;
    const selector = document.getElementById('tableSelector');
    if (selector) {
        selector.value = currentTableName;
    }
    loadAvailableTables();
}
```

---

## Tóm tắt Data Source

| Nguồn | Mô tả |
|-------|-------|
| **Tab 1 (Quản Lý Đơn Hàng)** | Cung cấp orders hiện tại + tên bảng qua postMessage |
| **Firebase** | Lưu trữ các bảng đã fetch chi tiết (`report_order_details/{tableName}`) |
| **localStorage** | Cache metadata bảng (`report_order_details_by_table`) |

---

## Files liên quan

| File | Chức năng |
|------|-----------|
| `tab-overview.html` | Trang Báo Cáo Tổng Hợp, hiển thị dropdown "Chọn bảng" |
| `tab1-orders.js` | Tab Quản Lý Đơn Hàng, gửi data orders |
| `main.html` | Container chứa các tab, forward messages giữa các iframe |
