# Hướng Dẫn Tích Hợp TPOS Partner API - Lấy Thông Tin Khách Hàng Từ SĐT

Tài liệu hướng dẫn fetch thông tin khách hàng từ TPOS khi trích xuất được số điện thoại từ nội dung chuyển khoản.

---

## 1. Tổng Quan Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              Content giao dịch từ SePay webhook                 │
│         "GD 850000 - 57828-GD TIEN HANG TAO SHOP"              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────────┐
                │  Extract số có >= 5 chữ số  │
                │  Regex: /\d{5,}/g           │
                │  → "57828"                   │
                └─────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────┐
        │  Fetch TPOS Partner API với param Phone    │
        │  GET .../Partner/ODataService.GetViewV2    │
        │  ?Phone=57828                               │
        └─────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       ✅ 1 SĐT duy nhất              📋 Nhiều SĐT khác nhau
       Tự động lấy Name + Phone        Hiển thị modal chọn
              │                               │
              └───────────────┬───────────────┘
                              ▼
           ┌─────────────────────────────────────┐
           │  Cập nhật vào balance_customer_info │
           │  name: "Kim Anh Le"                 │
           │  phone: "0797957828" (đủ 10 số)     │
           └─────────────────────────────────────┘
                              │
                              ▼
           ┌─────────────────────────────────────┐
           │  Refresh bảng giao dịch             │
           │  Hiển thị Name + Phone mới          │
           └─────────────────────────────────────┘
```

---

## 2. Fetch TPOS qua Cloudflare Worker

### 2.1 Cloudflare Worker Proxy

Sử dụng proxy có sẵn tại: `cloudflare-worker/worker.js`

**Worker URL**: `https://chatomni-proxy.nhijudyshop.workers.dev`

**Endpoint**: `/api/proxy?url={encoded_tpos_url}&headers={encoded_headers}`

### 2.2 TPOS Partner API URL

```
https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2
    ?Type=Customer
    &Active=true
    &Phone={extracted_digits}    ← 5+ số trích xuất từ content
    &$top=50
    &$orderby=DateCreated+desc
    &$count=true
```

### 2.3 JavaScript Fetch Code

```javascript
/**
 * Fetch customer info từ TPOS qua Cloudflare Worker proxy
 * @param {string} phoneDigits - Số điện thoại trích xuất (5+ số)
 * @returns {Promise<Array>} - Danh sách khách hàng unique theo SĐT 10 số
 */
async function fetchCustomerFromTpos(phoneDigits) {
    const WORKER_URL = window.CONFIG?.API_BASE_URL || 
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    
    // 1. Lấy TPOS token từ localStorage
    const tposToken = getTposToken();
    if (!tposToken) {
        console.error('[TPOS] Không có token');
        return [];
    }
    
    // 2. Build TPOS URL
    const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2` +
        `?Type=Customer&Active=true&Phone=${phoneDigits}` +
        `&$top=50&$orderby=DateCreated+desc&$count=true`;
    
    // 3. Headers cho TPOS
    const headers = {
        "accept": "application/json",
        "authorization": `Bearer ${tposToken}`,
        "tposappversion": "5.11.16.1",
        "x-requested-with": "XMLHttpRequest"
    };
    
    // 4. Gọi qua Cloudflare Worker proxy
    const proxyUrl = `${WORKER_URL}/api/proxy` +
        `?url=${encodeURIComponent(tposUrl)}` +
        `&headers=${encodeURIComponent(JSON.stringify(headers))}`;
    
    console.log('[TPOS-FETCH] Fetching:', phoneDigits);
    
    try {
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const customers = data.value || [];
        
        console.log('[TPOS-FETCH] Found', customers.length, 'results');
        
        // 5. Nhóm theo SĐT unique (10 số)
        return groupByPhone(customers);
        
    } catch (error) {
        console.error('[TPOS-FETCH] Error:', error);
        return [];
    }
}

/**
 * Lấy TPOS token từ localStorage
 */
function getTposToken() {
    try {
        const authData = localStorage.getItem('loginindex_auth');
        if (authData) {
            const auth = JSON.parse(authData);
            return auth.token || auth.access_token;
        }
    } catch (e) {
        console.error('[TPOS] Error reading token:', e);
    }
    return null;
}

/**
 * Nhóm customers theo SĐT unique (chỉ lấy SĐT 10 số)
 */
function groupByPhone(customers) {
    const phoneMap = new Map();
    
    for (const customer of customers) {
        const phone = customer.Phone;
        if (!phone || phone.length !== 10) continue; // Chỉ lấy SĐT 10 số
        
        if (!phoneMap.has(phone)) {
            phoneMap.set(phone, {
                phone: phone,
                name: customer.Name || customer.DisplayName,
                status: customer.StatusText,
                credit: customer.Credit || 0
            });
        }
    }
    
    return Array.from(phoneMap.values());
}
```

### 2.4 Response Format (từ TPOS)

```json
{
    "@odata.count": 5,
    "value": [
        {
            "Id": 566098,
            "Name": "Kim Anh Le",           // ← Tên khách hàng
            "Phone": "0797957828",          // ← SĐT đầy đủ 10 số
            "Status": "Normal",
            "StatusText": "Bình thường",
            "Credit": 265000.00,
            "FullAddress": "2020 Đại lộ Hùng Vương...",
            "NameNetwork": "Mobifone"
        }
    ]
}
```

---

## 3. Logic Xử Lý Kết Quả

### 3.1 Xử lý theo số lượng SĐT unique

```javascript
/**
 * Xử lý kết quả fetch TPOS
 * @param {string} extractedDigits - Số điện thoại trích xuất từ content
 * @param {number} transactionId - ID giao dịch trong balance_history
 */
async function processPhoneResult(extractedDigits, transactionId) {
    // 1. Fetch từ TPOS qua Cloudflare Worker
    const uniquePhones = await fetchCustomerFromTpos(extractedDigits);
    
    if (uniquePhones.length === 0) {
        console.log('[PHONE] Không tìm thấy khách hàng nào');
        return null;
    }
    
    // 2. Xử lý theo số lượng SĐT unique
    if (uniquePhones.length === 1) {
        // ✅ CHỈ 1 SĐT → Tự động lấy
        const customer = uniquePhones[0];
        console.log('[PHONE] Auto-select:', customer.name, customer.phone);
        await updateTransactionCustomer(transactionId, customer.phone, customer.name);
        return customer;
    } else {
        // 📋 NHIỀU SĐT → Hiển thị modal cho user chọn
        console.log('[PHONE] Multiple phones found:', uniquePhones.length);
        return await showPhoneSelectionModal(uniquePhones, transactionId);
    }
}
```

---

## 4. UI Modal Chọn SĐT (Khi Có Nhiều Kết Quả)

### 4.1 HTML Structure

```html
<!-- Modal chọn SĐT -->
<div id="phoneSelectionModal" class="modal">
    <div class="modal-content">
        <div class="modal-header">
            <h3><i data-lucide="users"></i> Chọn Khách Hàng</h3>
            <button class="close-btn" onclick="closePhoneSelectionModal()">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="modal-body">
            <p>Tìm thấy nhiều khách hàng. Vui lòng chọn:</p>
            <div id="phoneSelectionList" class="phone-list">
                <!-- Dynamic content -->
            </div>
        </div>
    </div>
</div>
```

### 4.2 Render Danh Sách

```javascript
function renderPhoneSelectionList(phones, transactionId) {
    const container = document.getElementById('phoneSelectionList');
    
    container.innerHTML = phones.map(p => `
        <div class="phone-option" onclick="selectPhone('${transactionId}', '${p.phone}', '${p.name}')">
            <div class="phone-main">
                <span class="phone-number">${p.phone}</span>
                <span class="phone-name">${p.name}</span>
            </div>
            <div class="phone-meta">
                <span class="status-badge ${getStatusClass(p.status)}">${p.status}</span>
                ${p.credit > 0 ? `<span class="credit">Dư nợ: ${formatCurrency(p.credit)}</span>` : ''}
            </div>
        </div>
    `).join('');
}
```

### 4.3 CSS Styles

```css
.phone-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
}

.phone-option {
    padding: 15px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.phone-option:hover {
    background: #f0f9ff;
    border-color: #3b82f6;
}

.phone-number {
    font-weight: 600;
    font-size: 1.1em;
    color: #3b82f6;
}

.phone-name {
    margin-left: 12px;
    color: #374151;
}

.status-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.8em;
}

.status-badge.normal { background: #dcfce7; color: #166534; }
.status-badge.warning { background: #fef3c7; color: #92400e; }
.status-badge.danger { background: #fee2e2; color: #991b1b; }
```

---

## 5. Cập Nhật Bảng Giao Dịch

### 5.1 Sau Khi Chọn/Tự Động Lấy SĐT

```javascript
async function updateTransactionCustomer(transactionId, phone, name) {
    // 1. Lấy unique_code của transaction (nếu có)
    // Hoặc tạo unique_code mới: "PHONE" + phone
    const uniqueCode = `PHONE${phone}`;
    
    // 2. Lưu vào CustomerInfoManager (localStorage + API)
    await CustomerInfoManager.saveCustomerInfo(uniqueCode, {
        name: name,
        phone: phone
    });
    
    // 3. Refresh bảng để hiển thị thông tin mới
    await loadData();
    
    // 4. Thông báo thành công
    NotificationManager.showNotification(
        `Đã cập nhật: ${name} - ${phone}`,
        'success'
    );
}
```

### 5.2 Hiển Thị Trong Bảng

Sau khi cập nhật, cột **Tên khách hàng** và **Số điện thoại** sẽ hiển thị thông tin mới:

| Tên khách hàng | Số điện thoại |
|----------------|---------------|
| Kim Anh Le ✏️ | 0797957828 👥 |

---

## 6. Lưu Ý Kỹ Thuật

### 6.1 Cloudflare Worker Proxy

File: `cloudflare-worker/worker.js`

Worker đã có sẵn endpoint `/api/proxy` hỗ trợ:
- Forward request đến bất kỳ URL nào
- Truyền custom headers qua query param `headers`
- Auto thêm CORS headers

**Không cần tạo thêm backend route mới!**

### 6.2 TPOS Token

Token được lấy từ `localStorage.loginindex_auth`:

```javascript
const authData = JSON.parse(localStorage.getItem('loginindex_auth'));
const token = authData.token || authData.access_token;
```

## 7. Ví Dụ Thực Tế

### Input
```
Content: "GD 850000 - 57828-GD TIEN HANG TAO SHOP"
```

### Bước 1: Extract
```
Extracted digits: "57828"
```

### Bước 2: Fetch TPOS
```
GET .../ODataService.GetViewV2?Phone=57828
```

### Bước 3: Response (5 kết quả, 4 SĐT unique)

| SĐT | Tên | Status |
|-----|-----|--------|
| 0797957828 | Kim Anh Le | Bình thường |
| 0969757828 | Utthem Phanthi | Bom hàng |
| 0388557828 | Phuongnghi Tran | Bình thường |
| 0913157828 | Trang Tran | Bình thường |

### Bước 4: Hiển thị modal chọn (vì có 4 SĐT khác nhau)

### Bước 5: User chọn "0797957828 - Kim Anh Le"

### Bước 6: Cập nhật bảng
- **Tên khách hàng**: Kim Anh Le
- **Số điện thoại**: 0797957828

---

## 8. Lưu Ý Quan Trọng

| Lưu ý | Mô tả |
|-------|-------|
| ⚠️ **SĐT 10 số** | Chỉ lấy các SĐT có đúng 10 ký tự (chuẩn VN) |
| 🔄 **Nhóm theo Phone** | API có thể trả về nhiều record cùng SĐT - cần unique hóa |
| 🎯 **1 SĐT = auto** | Nếu chỉ có 1 SĐT unique → tự động lấy, không cần chọn |
| 👥 **Nhiều SĐT = modal** | Nếu có nhiều SĐT khác nhau → hiển thị modal cho user chọn |
| 💾 **Token TPOS** | Cần lưu token vào environment variable, không hardcode |
| 🔐 **Proxy qua backend** | Nên proxy qua Render.com để ẩn token khỏi client |

---

## 9. Tóm Tắt Logic

```
IF extracted_digits >= 5 số:
    result = fetch_tpos(extracted_digits)
    unique_phones = group_by_phone(result)
    
    IF unique_phones.length == 0:
        SKIP (không tìm thấy)
    ELSE IF unique_phones.length == 1:
        AUTO_SELECT(unique_phones[0])
    ELSE:
        SHOW_MODAL(unique_phones) → USER_SELECT
    
    UPDATE balance_customer_info(name, phone)
    REFRESH table
```
