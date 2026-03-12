# EMPLOYEE RANGE - HƯỚNG DẪN CHI TIẾT

## Tổng Quan

Employee Range là hệ thống phân chia đơn hàng theo STT (Session Index) cho từng nhân viên. Mỗi nhân viên được gán một khoảng STT, đơn hàng nào có STT nằm trong khoảng đó sẽ thuộc về nhân viên đó.

---

## Cấu Trúc Dữ Liệu

### Employee Range Object

```javascript
{
    id: "user_abc123",     // ID nhân viên (từ Firebase Auth hoặc tự sinh)
    name: "Nhân viên A",   // Tên hiển thị
    start: 1,              // STT bắt đầu (inclusive)
    end: 50                // STT kết thúc (inclusive)
}
```

### Ví dụ Mảng Employee Ranges

```javascript
[
    { id: "user_1", name: "Nhân viên A", start: 1, end: 50 },
    { id: "user_2", name: "Nhân viên B", start: 51, end: 100 },
    { id: "user_3", name: "Nhân viên C", start: 101, end: 150 }
]
```

---

## Nơi Lưu Trữ Dữ Liệu (Firebase Realtime Database)

### Current Storage Paths

| Path | Mô tả |
|------|-------|
| `settings/employee_ranges` | Cấu hình chung (fallback) |
| `settings/employee_ranges_by_campaign/{campaignName}` | Cấu hình riêng theo chiến dịch |

### Ví dụ Firebase Structure

```
settings/
├── employee_ranges/
│   ├── 0: { id: "user_1", name: "NV A", start: 1, end: 50 }
│   ├── 1: { id: "user_2", name: "NV B", start: 51, end: 100 }
│   └── 2: { id: "user_3", name: "NV C", start: 101, end: 150 }
│
└── employee_ranges_by_campaign/
    ├── Live_Sale_25_12_2024/
    │   ├── 0: { id: "user_1", name: "NV A", start: 1, end: 30 }
    │   └── 1: { id: "user_2", name: "NV B", start: 31, end: 60 }
    │
    └── Live_Sale_26_12_2024/
        ├── 0: { id: "user_1", name: "NV A", start: 1, end: 40 }
        └── 1: { id: "user_3", name: "NV C", start: 41, end: 80 }
```

---

## Flow Load Employee Ranges

```
┌─────────────────────────────────────────────────────────────────┐
│                  loadEmployeeRangesForCampaign()                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ campaignName?   │
                    └─────────────────┘
                      │           │
                   Yes│           │No
                      ▼           ▼
    ┌─────────────────────────┐  ┌────────────────────────────────┐
    │ Load from:              │  │ Load from:                     │
    │ employee_ranges_by_     │  │ settings/employee_ranges       │
    │ campaign/{campaignName} │  │ (general config)               │
    └─────────────────────────┘  └────────────────────────────────┘
                │                              │
                ▼                              │
    ┌─────────────────┐                        │
    │ Data exists?    │                        │
    └─────────────────┘                        │
      │           │                            │
   Yes│           │No                          │
      ▼           ▼                            │
   ┌──────┐  ┌─────────────────────────────┐   │
   │ Use  │  │ Fallback to:                │   │
   │ data │  │ settings/employee_ranges    │◄──┘
   └──────┘  └─────────────────────────────┘
                              │
                              ▼
                 ┌────────────────────────┐
                 │ normalizeEmployeeRanges│
                 │ (convert object→array) │
                 └────────────────────────┘
                              │
                              ▼
                 ┌────────────────────────┐
                 │ employeeRanges = data  │
                 └────────────────────────┘
```

---

## Flow Save Employee Ranges

```
┌─────────────────────────────────────────────────────────────────┐
│                     applyEmployeeRanges()                       │
│              (Called when user clicks "Áp dụng")                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ Collect ranges from input fields:                           │
    │ - data-user-id, data-user-name                              │
    │ - start value, end value                                    │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ Build newRanges array:                                      │
    │ [{ id, name, start, end }, ...]                             │
    │ (Only include if both start & end are filled and > 0)       │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Campaign        │
                    │ selected?       │
                    └─────────────────┘
                      │           │
                   Yes│           │No
                      ▼           ▼
    ┌────────────────────────┐  ┌────────────────────────────────┐
    │ Save to:               │  │ Save to:                       │
    │ employee_ranges_by_    │  │ settings/employee_ranges       │
    │ campaign/{safeName}    │  │ (general config)               │
    └────────────────────────┘  └────────────────────────────────┘
```

---

## Hàm Quan Trọng

### 1. `getEmployeeName(stt)` - tab1-orders.js

```javascript
function getEmployeeName(stt) {
    if (!stt || employeeRanges.length === 0) return null;
    
    const sttNum = parseInt(stt);
    if (isNaN(sttNum)) return null;

    for (const range of employeeRanges) {
        // ⚠️ INCLUSIVE ở cả 2 đầu
        if (sttNum >= range.start && sttNum <= range.end) {
            return range.name;
        }
    }
    return null;
}
```

### 2. `getEmployeeBySTT(stt)` - tab-overview.html

```javascript
function getEmployeeBySTT(stt) {
    if (!stt || !employeeRanges.length) return null;
    
    const sttNum = parseInt(stt);
    if (isNaN(sttNum)) return null;

    for (const range of employeeRanges) {
        if (sttNum >= range.start && sttNum <= range.end) {
            return range; // Trả về toàn bộ object, không chỉ name
        }
    }
    return null;
}
```

### 3. `normalizeEmployeeRanges(data)` - Cả 2 file

```javascript
function normalizeEmployeeRanges(data) {
    if (!data) return [];
    
    // If already an array, return it
    if (Array.isArray(data)) return data;
    
    // If it's an object (from Firebase), convert to array
    if (typeof data === 'object') {
        const result = [];
        const keys = Object.keys(data)
            .filter(k => !isNaN(k))
            .sort((a, b) => Number(a) - Number(b));
        for (const key of keys) {
            result.push(data[key]);
        }
        return result;
    }
    return [];
}
```

### 4. `sanitizeCampaignName(campaignName)` - tab1-orders.js

```javascript
function sanitizeCampaignName(campaignName) {
    if (!campaignName) return null;
    // Replace invalid Firebase key chars: . $ # [ ] /
    return campaignName.replace(/[.$#\[\]\/]/g, '_').trim();
}
```

---

## Sử Dụng Trong Statistics (tab-overview.html)

### calculateEmployeeTagStats()

```javascript
function calculateEmployeeTagStats(orders) {
    if (!employeeRanges.length) return [];

    const employeeStats = [];

    employeeRanges.forEach(emp => {
        // Lọc đơn hàng theo range
        const empOrders = orders.filter(order => {
            const stt = parseInt(order.SessionIndex || 0);
            return stt >= emp.start && stt <= emp.end;
        });

        if (empOrders.length === 0) return;

        // Tính toán thống kê cho từng nhân viên...
    });

    return employeeStats;
}
```

---

## ⚠️ Lưu Ý Quan Trọng

### 1. Range là INCLUSIVE
```
start=1, end=50 → STT 1, 2, 3, ..., 50 đều thuộc range này
```

### 2. Không có Overlap Validation
Nếu 2 nhân viên có range trùng nhau, đơn sẽ được tính cho nhân viên **đầu tiên** trong danh sách.

### 3. STT = 0 hoặc null
Đơn hàng không có STT (SessionIndex = 0 hoặc null) sẽ **không thuộc về** nhân viên nào.

### 4. Campaign Name Sanitization
Tên chiến dịch được sanitize trước khi lưu vào Firebase:
- Ký tự `.` `$` `#` `[` `]` `/` → `_`

---

## Đề Xuất Migration: Realtime Database → Firestore

### Lý do nên chuyển sang Firestore

| Tiêu chí | Realtime Database | Firestore |
|----------|-------------------|-----------|
| Cấu trúc | JSON tree | Document-Collection |
| Query | Hạn chế | Mạnh mẽ, compound queries |
| Offline | Có | Có, tốt hơn |
| Chi phí | Theo bandwidth | Theo operations |
| Scale | Vertical | Horizontal |

### Firestore Schema đề xuất

```
employees (collection)
├── {userId} (document)
│   ├── displayName: "Nhân viên A"
│   ├── email: "nva@example.com"
│   └── createdAt: timestamp

employeeRanges (collection)
├── {rangeId} (document)
│   ├── employeeId: "user_1"
│   ├── employeeName: "Nhân viên A"
│   ├── start: 1
│   ├── end: 50
│   ├── campaignId: null | "campaign_abc" 
│   ├── campaignName: null | "Live Sale 25/12"
│   ├── isGeneral: true | false
│   ├── createdAt: timestamp
│   └── updatedAt: timestamp
```

### Migration Steps

1. **Tạo Firestore collections** theo schema trên
2. **Migrate data** từ Realtime DB sang Firestore
3. **Update code** để dùng Firestore SDK:
   - `firebase.firestore()` thay vì `firebase.database()`
   - `collection().doc().set()` thay vì `ref().set()`
   - `where('campaignId', '==', id)` cho queries

### Ví dụ Code sau Migration

```javascript
// Load employee ranges for campaign
async function loadEmployeeRangesForCampaign(campaignId = null) {
    const db = firebase.firestore();
    
    let query = db.collection('employeeRanges');
    
    if (campaignId) {
        // Try campaign-specific first
        query = query.where('campaignId', '==', campaignId);
    } else {
        // General config
        query = query.where('isGeneral', '==', true);
    }
    
    const snapshot = await query.orderBy('start').get();
    
    if (snapshot.empty && campaignId) {
        // Fallback to general
        return loadEmployeeRangesForCampaign(null);
    }
    
    employeeRanges = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    
    return employeeRanges;
}

// Save employee ranges
async function saveEmployeeRanges(ranges, campaignId = null) {
    const db = firebase.firestore();
    const batch = db.batch();
    
    // Delete existing ranges for this campaign
    const existingQuery = campaignId 
        ? db.collection('employeeRanges').where('campaignId', '==', campaignId)
        : db.collection('employeeRanges').where('isGeneral', '==', true);
    
    const existing = await existingQuery.get();
    existing.docs.forEach(doc => batch.delete(doc.ref));
    
    // Add new ranges
    ranges.forEach(range => {
        const ref = db.collection('employeeRanges').doc();
        batch.set(ref, {
            ...range,
            campaignId: campaignId,
            isGeneral: !campaignId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    });
    
    await batch.commit();
}
```

---

## Files Liên Quan

| File | Chức năng |
|------|-----------|
| [tab1-orders.js](file:///Users/mac/Downloads/n2store/orders-report/tab1-orders.js) | CRUD employee ranges, getEmployeeName() |
| [tab-overview.html](file:///Users/mac/Downloads/n2store/orders-report/tab-overview.html) | Load ranges, calculateEmployeeTagStats() |
| [main.html](file:///Users/mac/Downloads/n2store/orders-report/main.html) | Forward messages between tabs |
| [user-employee-loader.js](file:///Users/mac/Downloads/n2store/orders-report/user-employee-loader.js) | Load danh sách nhân viên |
