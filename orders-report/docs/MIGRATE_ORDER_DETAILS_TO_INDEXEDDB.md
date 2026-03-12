# Hướng Dẫn: Auto-Fetch Order Details từ TPOS Excel

> **Trạng thái:** Chưa thực hiện - Chỉ là tài liệu hướng dẫn

---

## Mục đích

Thay đổi cách load dữ liệu chi tiết đơn hàng trong `tab-overview.html`:
- **Bỏ Firebase** cho `report_order_details` (giảm chi phí)
- **Tự động fetch Excel từ TPOS** khi load/refresh trang (data cơ bản)
- **Giữ nguyên nút `btnBatchFetch`** - KHÔNG thay đổi chức năng (data đầy đủ)

---

## Phân biệt các nguồn dữ liệu

### 1. Excel Auto-Fetch (MỚI)
- **Khi nào:** Load trang / F5
- **Data:** Cơ bản (từ Excel export)
- **Lưu trữ:** Không lưu, chỉ hiển thị
- **Mục đích:** Fallback nhanh khi mới vào trang

### 2. Nút `btnBatchFetch` (GIỮ NGUYÊN + CẢI TIẾN)
- **Khi nào:** User bấm thủ công
- **Data:** ✅ Đầy đủ (từ API chi tiết)
- **Lưu trữ:** Firebase **Firestore** (không phải Realtime Database)
- **Mục đích:** Lấy và lưu dữ liệu đầy đủ

### Flow khi bấm nút `btnBatchFetch`:

```
[User bấm btnBatchFetch]
        ↓
    Hiển thị Dialog hỏi:
    ┌─────────────────────────────────────┐
    │  Bạn muốn:                          │
    │  [1] Tải dữ liệu từ Firestore       │
    │  [2] Lấy dữ liệu mới từ API         │
    └─────────────────────────────────────┘
        ↓
    Option 1: Load từ Firestore → Hiển thị
    Option 2: Fetch API → Lưu Firestore → Hiển thị
```

---

## Hiện trạng

### Cách hoạt động hiện tại
```
tab1-orders.html → postMessage → tab-overview.html → Firebase Realtime
                                       ↓
                               Load từ Firebase khi refresh
```

### Cách hoạt động mới
```
[Load/Refresh tab-overview]
        ↓
    Có data trong cache?
        ↓
    KHÔNG → Auto-fetch Excel từ TPOS (data cơ bản)
        ↓
    User cần đầy đủ → Bấm "btnBatchFetch" (data đầy đủ, lưu Firestore)
```

---

## Mapping TableName và CampaignId

### Khái niệm

| Thuật ngữ | Ví dụ | Mô tả |
|-----------|-------|-------|
| `tableName` | `"HOUSE"` hoặc `"STORE"` | Tên loại campaign |
| `campaignId` | `"08381f92-6670-..."` | UUID của campaign trên TPOS |
| `campaignManager` | `window.campaignManager` | Object global chứa thông tin campaigns |

### ⚠️ Một session có thể có NHIỀU campaigns

Thông thường có **2 loại** campaigns chạy cùng lúc:

| Loại | Ví dụ name | campaignId |
|------|------------|------------|
| **HOUSE** | "HOUSE", "Nhi Judy House" | `abc123...` |
| **STORE** | "STORE", "Nhi Judy Store" | `xyz789...` |

```
Ví dụ: User đang xem session 30/12/2025
├── Campaign 1: "HOUSE" → campaignId: abc123...
└── Campaign 2: "STORE" → campaignId: xyz789...

→ Cần fetch Excel từ CẢ 2 campaignIds
→ Merge data lại để hiển thị
```

### Cấu trúc Campaign (từ tab1-orders.js)

```javascript
window.campaignManager = {
    allCampaigns: {
        "abc123...": {
            id: "abc123...",
            name: "HOUSE",
            displayName: "HOUSE 30/12/2025"
        },
        "xyz789...": {
            id: "xyz789...",
            name: "STORE", 
            displayName: "STORE 30/12/2025"
        }
    },
    activeCampaignId: "abc123...",  // Campaign đang active
    activeCampaign: { ... }
};
```

### Cách lấy TẤT CẢ campaignIds cho session hiện tại

```javascript
/**
 * Lấy tất cả campaignIds cho session hiện tại
 * @returns {Array<{id: string, name: string}>} - Danh sách campaigns
 */
function getCurrentSessionCampaigns() {
    const allCampaigns = window.campaignManager?.allCampaigns || {};
    const activeCampaign = window.campaignManager?.activeCampaign;
    
    if (!activeCampaign) return [];
    
    // Lấy ngày của campaign đang active
    const activeDate = activeCampaign.customStartDate?.split('T')[0];
    if (!activeDate) return [{ id: activeCampaign.id, name: activeCampaign.name }];
    
    // Tìm tất cả campaigns cùng ngày
    const sameDayCampaigns = [];
    for (const [id, campaign] of Object.entries(allCampaigns)) {
        const campaignDate = campaign.customStartDate?.split('T')[0];
        if (campaignDate === activeDate) {
            sameDayCampaigns.push({
                id: id,
                name: campaign.name,
                displayName: campaign.displayName
            });
        }
    }
    
    console.log(`[REPORT] Found ${sameDayCampaigns.length} campaigns for date ${activeDate}:`, 
        sameDayCampaigns.map(c => c.name));
    
    return sameDayCampaigns;
}
```

### Fetch Excel từ nhiều campaigns

```javascript
/**
 * Fetch và merge orders từ tất cả campaigns trong session
 */
async function fetchAllCampaignsExcel() {
    const campaigns = getCurrentSessionCampaigns();
    
    if (campaigns.length === 0) {
        console.warn('[REPORT] No campaigns found');
        return [];
    }
    
    // Fetch từ tất cả campaigns song song
    const fetchPromises = campaigns.map(campaign => 
        fetchOrdersFromTPOS(campaign.id)
            .then(orders => orders.map(o => ({ ...o, _campaign: campaign.name })))
            .catch(err => {
                console.error(`[REPORT] Error fetching ${campaign.name}:`, err);
                return [];
            })
    );
    
    const results = await Promise.allSettled(fetchPromises);
    
    // Merge tất cả orders
    const allOrders = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);
    
    console.log(`[REPORT] ✅ Fetched total ${allOrders.length} orders from ${campaigns.length} campaigns`);
    return allOrders;
}
```

> ⚠️ **QUAN TRỌNG:** 
> - Một session có thể có **HOUSE + STORE** = 2 campaignIds
> - Cần fetch từ **TẤT CẢ** campaigns cùng ngày
> - Merge data lại trước khi hiển thị

---

## API TPOS Export Orders

### Endpoint
```
POST https://tomato.tpos.vn/SaleOnline_Order/ExportFile
```

### Query Parameters
| Param | Mô tả |
|-------|-------|
| `campaignId` | ID chiến dịch (bảng) |
| `sort` | Sắp xếp (`date`) |

### Headers
```javascript
{
  "Authorization": "Bearer {token}",
  "Content-Type": "application/json"
}
```

### Body
```json
{"data":"{}"}
```

### Response
- **Type:** Binary (Excel file `.xlsx`)
- **Filename:** `don_hang_online_{TABLE_NAME}_{DATE}.xlsx`

---

## Các bước thực hiện

### Bước 1: Thêm thư viện XLSX.js (nếu chưa có)

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

### Bước 2: Tạo function fetch Excel từ TPOS

```javascript
/**
 * Fetch order details từ TPOS ExportFile API
 * @param {string} campaignId - ID của chiến dịch/bảng
 * @returns {Promise<Array>} - Array đơn hàng đã parse
 */
async function fetchOrdersFromTPOS(campaignId) {
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const endpoint = `/api/SaleOnline_Order/ExportFile?campaignId=${campaignId}&sort=date`;
    
    // Lấy token từ tokenManager hoặc localStorage
    const token = await tokenManager.getToken();
    
    const response = await fetch(`${WORKER_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: '{}' })
    });
    
    if (!response.ok) {
        throw new Error(`TPOS API error: ${response.status}`);
    }
    
    // Parse Excel từ response
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    // Lấy sheet đầu tiên
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert sang JSON
    const orders = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`[REPORT] ✅ Fetched ${orders.length} orders from TPOS Excel`);
    return orders;
}
```

### Bước 3: Tạo function parse Excel data

```javascript
/**
 * Parse và chuẩn hóa dữ liệu từ Excel
 * LƯU Ý: Header ở Row 3, Data từ Row 4
 * Cột ### (B) = STT trong bảng TPOS
 * @param {Array} rawData - Data thô từ XLSX
 * @returns {Array} - Data đã chuẩn hóa
 */
function parseExcelOrders(rawData) {
    return rawData.map(row => ({
        stt: row['STT'],
        orderIndex: row['###'],              // ⚠️ STT trong bảng TPOS
        channel: row['Kênh'] || '',
        orderCode: row['Mã'] || '',
        facebookId: row['Facebook'] || '',
        email: row['Email'] || '',
        customerName: row['Tên'] || '',
        customerStatus: row['Trạng thái khách hàng'] || '',
        phone: row['Điện thoại'] || '',
        carrier: row['Nhà mạng'] || '',
        address: row['Địa chỉ'] || '',
        totalAmount: row['Tổng tiền'] || 0,
        status: row['Trạng thái'] || '',
        createdDate: row['Ngày tạo'] || '',
        products: row['Sản phẩm'] || '',
        totalQuantity: row['Tổng số lượng SP'] || 0,
        employee: row['Nhân viên'] || '',
        note: row['Ghi chú'] || '',
        tags: row['Nhãn'] || ''
    }));
}
```

### Bước 4: Auto-fetch khi load trang

```javascript
// Thêm vào DOMContentLoaded hoặc init function
document.addEventListener('DOMContentLoaded', async function() {
    // ... code hiện tại ...
    
    // Auto-fetch orders từ TPOS
    await autoFetchOrdersOnLoad();
});

async function autoFetchOrdersOnLoad() {
    try {
        // Lấy campaignId từ settings hoặc URL
        const campaignId = await getCurrentCampaignId();
        
        if (!campaignId) {
            console.log('[REPORT] ⚠️ No campaignId, skipping auto-fetch');
            return;
        }
        
        showLoading('Đang tải dữ liệu từ TPOS...');
        
        const rawOrders = await fetchOrdersFromTPOS(campaignId);
        const orders = parseExcelOrders(rawOrders);
        
        // Cập nhật UI
        ordersData = orders;
        renderReport(orders);
        updateStats(orders);
        
        hideLoading();
        console.log(`[REPORT] ✅ Auto-loaded ${orders.length} orders`);
        
    } catch (error) {
        console.error('[REPORT] ❌ Auto-fetch failed:', error);
        hideLoading();
        // Có thể hiển thị thông báo lỗi hoặc fallback
    }
}
```

### Bước 5: Cải tiến nút btnBatchFetch (thêm dialog + Firestore)

```javascript
// Thêm Firestore SDK
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
const db = getFirestore();

// Handler cho nút btnBatchFetch
document.getElementById('btnBatchFetch').addEventListener('click', async function() {
    // Hiển thị dialog hỏi user
    const choice = await showFetchDialog();
    
    if (choice === 'firestore') {
        // Option 1: Load từ Firestore
        await loadFromFirestore();
    } else if (choice === 'api') {
        // Option 2: Fetch mới từ API → Lưu Firestore
        await fetchAndSaveToFirestore();
    }
    // choice === 'cancel' → không làm gì
});

/**
 * Hiển thị dialog hỏi user chọn nguồn dữ liệu
 */
function showFetchDialog() {
    return new Promise((resolve) => {
        // Tạo modal dialog
        const modal = document.createElement('div');
        modal.className = 'fetch-dialog-overlay';
        modal.innerHTML = `
            <div class="fetch-dialog">
                <h3><i class="fas fa-database"></i> Chọn nguồn dữ liệu</h3>
                <div class="fetch-dialog-options">
                    <button class="btn-option firestore" data-choice="firestore">
                        <i class="fas fa-cloud-download-alt"></i>
                        <span>Tải từ Firestore</span>
                        <small>Dữ liệu đã lưu trước đó</small>
                    </button>
                    <button class="btn-option api" data-choice="api">
                        <i class="fas fa-sync-alt"></i>
                        <span>Lấy dữ liệu mới</span>
                        <small>Fetch từ API & lưu Firestore</small>
                    </button>
                </div>
                <button class="btn-cancel" data-choice="cancel">Hủy</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle button clicks
        modal.querySelectorAll('[data-choice]').forEach(btn => {
            btn.onclick = () => {
                document.body.removeChild(modal);
                resolve(btn.dataset.choice);
            };
        });
    });
}

/**
 * Load dữ liệu từ Firestore
 */
async function loadFromFirestore() {
    const campaignId = await getCurrentCampaignId();
    const docRef = doc(db, 'order_details', campaignId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
        const data = docSnap.data();
        ordersData = data.orders;
        renderReport(ordersData);
        console.log('[REPORT] ✅ Loaded from Firestore:', ordersData.length, 'orders');
    } else {
        alert('Chưa có dữ liệu trong Firestore. Vui lòng chọn "Lấy dữ liệu mới".');
    }
}

/**
 * Fetch từ API và lưu vào Firestore
 */
async function fetchAndSaveToFirestore() {
    // ... existing fetch logic từ btnBatchFetch ...
    
    // Sau khi fetch xong, lưu vào Firestore
    const campaignId = await getCurrentCampaignId();
    const docRef = doc(db, 'order_details', campaignId);
    
    await setDoc(docRef, {
        orders: ordersData,
        fetchedAt: new Date().toISOString(),
        orderCount: ordersData.length
    });
    
    console.log('[REPORT] ✅ Saved to Firestore:', ordersData.length, 'orders');
}
```

> ⚠️ **LƯU Ý:** 
> - Dùng **Firestore** (không phải Realtime Database) để lưu data đầy đủ
> - Excel auto-fetch chỉ hiển thị, không lưu
> - Firestore path: `order_details/{campaignId}`

### Bước 6: Xóa code Firebase không dùng

Các phần có thể xóa/comment:
- `saveToFirebase(tableName, data)` cho order details
- `loadFromFirebase(tableName)` cho order details
- `checkFirebaseStatus()` nếu không dùng cho mục đích khác
- Các biến: `firebaseTableName`, `firebaseDataFetchedAt`

> ⚠️ **Lưu ý:** Chỉ xóa phần liên quan đến `report_order_details`. 
> Firebase vẫn dùng cho: tags, KPI, dropped products, etc.

---

## Cấu trúc Excel TPOS (đã xác nhận)

> **Nguồn:** `don_hang_online_HOUSE 30_12_2025.xlsx` (179 rows, 176 đơn hàng)

### Lưu ý quan trọng
- **Header ở Row 3** (Row 1-2 là merged title "DANH SÁCH SALE ONLINE")
- **Data bắt đầu từ Row 4**
- Khi parse với XLSX.js cần set `range: 2` để bỏ qua 2 row đầu

### Mapping cột

| Cột | Header Excel | Mô tả | Map sang |
|-----|--------------|-------|----------|
| A | `STT` | Số thứ tự (auto) | `stt` |
| B | `###` | **⚠️ Đây là STT ở bảng TPOS** | `orderIndex` |
| C | `Kênh` | Tên page/kênh bán | `channel` |
| D | `Mã` | Mã đơn hàng | `orderCode` |
| E | `Facebook` | Facebook ID | `facebookId` |
| F | `Email` | Email khách | `email` |
| G | `Tên` | Tên khách hàng | `customerName` |
| H | `Trạng thái khách hàng` | Bình thường/VIP/... | `customerStatus` |
| I | `Điện thoại` | SĐT khách | `phone` |
| J | `Nhà mạng` | Viettel/Mobi/... | `carrier` |
| K | `Địa chỉ` | Địa chỉ giao hàng | `address` |
| L | `Tổng tiền` | Tổng tiền đơn | `totalAmount` |
| M | `Trạng thái` | Nháp/Đã xác nhận/... | `status` |
| N | `Ngày tạo` | Timestamp tạo đơn | `createdDate` |
| O | `Sản phẩm` | Danh sách SP (text) | `products` |
| P | `Tổng số lượng SP` | Tổng SL sản phẩm | `totalQuantity` |
| Q | `Nhân viên` | Người xử lý | `employee` |
| R | `Ghi chú` | Note (có thể encoded) | `note` |
| S | `Nhãn` | Tags đơn hàng | `tags` |

### Dữ liệu mẫu (Row 4)

```javascript
{
  stt: 1,
  orderIndex: 435,           // Cột ### - STT trong bảng TPOS
  channel: "Nhi Judy House",
  orderCode: "251206062",
  customerName: "Thuy Huynh",
  customerStatus: "Bình thường",
  phone: "0333855812",
  carrier: "Viettel",
  address: "Ấp Long Thuận 2, Xã Long Điền A, Huyện Chợ Mới, Tỉnh An Giang",
  totalAmount: 425000,
  status: "Nháp",
  createdDate: "2025-12-30 15:55:32.023000",
  products: "[LQU52A3] A16 QUẦN SUÔNG... SL: 1 Giá: 230.000\n[LQU56A3] 0409 A16...",
  totalQuantity: 2,
  employee: "Duyên",
  note: "[\"UFJ5WDM4c0hWZ2dGSEZh...\"]"  // Encoded data
}

---

## Mapping Excel → UI Table (Tab Details)

Tab `details` có `onclick="switchMainTab('details')"` và hiển thị bảng trong `#cachedDetailsArea`.

### Cột hiện tại trong UI (function `renderCachedDetailsTab`)

| UI Column | Nguồn API hiện tại | Map từ Excel | Ghi chú |
|-----------|---------------------|--------------|---------|
| STT | `order.SessionIndex` | `row['###']` | ⚠️ Cột ### mới đúng |
| Mã đơn | `order.Code` | `row['Mã']` | |
| Tag | `order.Tags` | `row['Nhãn']` | |
| Khách hàng | `order.Name` | `row['Tên']` | |
| SĐT | `order.Telephone` | `row['Điện thoại']` | |
| SP | `order.Details.length` | `row['Tổng số lượng SP']` | |
| Tổng tiền | `order.TotalAmount` | `row['Tổng tiền']` | |
| ~~COD~~ | ~~`order.CashOnDelivery`~~ | ❌ | **Bỏ cột này** |
| Trạng thái | `order.Status` | `row['Trạng thái']` | |

### Lưu ý quan trọng
- **Cột COD** không có trong Excel → **bỏ khỏi bảng**
- **Cột nào không có data** → để trống `''`
- **Cột STT** trong Excel: cột `###` mới là STT trong bảng TPOS

### Code render table mới (bỏ cột COD)

```javascript
function renderCachedDetailsTab() {
    // ... existing code ...
    
    html += `
        <thead>
            <tr>
                <th>STT</th>
                <th>Mã đơn</th>
                <th>Tag</th>
                <th>Khách hàng</th>
                <th>SĐT</th>
                <th>SP</th>
                <th>Tổng tiền</th>
                <th>Trạng thái</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    filteredOrders.forEach((item, index) => {
        const order = item.order;
        html += `
            <tr onclick="openCachedOrderDetail(${index})">
                <td>${order.orderIndex || ''}</td>
                <td class="order-code">${order.orderCode || ''}</td>
                <td><div class="tags-cell">${parseTagsHtml(order.tags)}</div></td>
                <td>${order.customerName || ''}</td>
                <td>${order.phone || ''}</td>
                <td>${order.totalQuantity || ''}</td>
                <td class="amount">${order.totalAmount ? order.totalAmount.toLocaleString('vi-VN') + 'đ' : ''}</td>
                <td>${order.status || ''}</td>
            </tr>
        `;
    });
}

---

## Lợi ích

| Tiêu chí | Trước (Firebase) | Sau (TPOS API) |
|----------|------------------|----------------|
| Nguồn data | Firebase cache | TPOS trực tiếp |
| Độ mới | Có thể cũ | Luôn mới nhất |
| Chi phí | Firebase reads/writes | $0 |
| Offline | ✅ | ❌ |

---

## Nhược điểm và giải pháp

### 1. Không hoạt động offline
- **Giải pháp:** Hiển thị thông báo "Cần kết nối mạng để tải dữ liệu"

### 2. Chậm hơn nếu mạng yếu
- **Giải pháp:** Thêm loading indicator rõ ràng

### 3. Cần campaignId
- **Giải pháp:** Lấy từ settings/Firebase hoặc yêu cầu user chọn

---

## Proxy qua Cloudflare Worker

API TPOS cần đi qua proxy để bypass CORS:

```javascript
// ❌ Gọi trực tiếp - bị CORS block
fetch('https://tomato.tpos.vn/SaleOnline_Order/ExportFile...')

// ✅ Gọi qua proxy
fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/SaleOnline_Order/ExportFile...')
```

**Cần thêm route vào Cloudflare Worker** nếu chưa có:
- `/api/SaleOnline_Order/ExportFile` → `tomato.tpos.vn/SaleOnline_Order/ExportFile`

---

## Checklist thực hiện

- [ ] Kiểm tra XLSX.js đã load trong trang
- [ ] Thêm route vào Cloudflare Worker (nếu cần)
- [ ] Xác nhận cấu trúc cột Excel thực tế
- [ ] Tạo function `fetchOrdersFromTPOS()`
- [ ] Tạo function `parseExcelOrders()`
- [ ] Tạo function `autoFetchOrdersOnLoad()`
- [ ] Thêm auto-fetch vào `DOMContentLoaded`
- [ ] Update nút `btnBatchFetch` để dùng function mới
- [ ] Xóa/comment code Firebase cho order details
- [ ] Test với campaign thực tế
- [ ] Test lỗi mạng / không có campaignId

---

## Tham khảo

- [SheetJS (XLSX)](https://sheetjs.com/)
- [Cloudflare Worker Proxy](../cloudflare-worker/worker.js)
- [Token Manager](./token-manager.js)
