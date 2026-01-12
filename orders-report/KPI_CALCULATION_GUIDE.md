# Hướng Dẫn Tính KPI (KPI Calculation Guide)

> Tài liệu mô tả logic tính KPI dựa trên việc theo dõi sản phẩm từ lúc xác nhận đến khi hoàn thành đơn hàng.

---

## Tổng Quan Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLOW TÍNH KPI                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Thêm SP từ search ──► held_products (IsHeld: true)                      │
│                                                                              │
│  2. User nhấn "Xác nhận" lần đầu ──► Hỏi: "Tính KPI từ lúc này?"            │
│                                                                              │
│  3. Nếu đồng ý ──► Lưu BASE vào Firebase:                                   │
│     • Danh sách sản phẩm chính (mã SP + số lượng)                           │
│     • Order ID                                                               │
│     • STT đơn hàng                                                           │
│     • User name                                                              │
│     • Timestamp                                                              │
│                                                                              │
│  4. So sánh sản phẩm trong Note (VD: N1769 - 1 - 390000)                    │
│     với BASE đã lưu                                                          │
│                                                                              │
│  5. Tính KPI = Số SP khác biệt × 5,000đ                                     │
│                                                                              │
│  6. Hiển thị thống kê tại tab2-statistics.html                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Chi Tiết Các Bước

### Bước 1: Thêm Sản Phẩm Từ Search

Khi user tìm và thêm sản phẩm:
- Sản phẩm được thêm vào `held_products` (Firebase)
- Đánh dấu `IsHeld: true`
- Hiển thị trong section **"Đang giữ"** với 2 nút: **Xác nhận** / **Xóa**

### Bước 2: Xác Nhận Sản Phẩm Lần Đầu

Khi user nhấn **"Xác nhận"** (`confirmHeldProduct`) lần đầu tiên cho một đơn hàng:

```javascript
// Kiểm tra đã có BASE chưa
const hasBase = await checkKPIBaseExists(orderId);

if (!hasBase) {
    // Hiển thị popup xác nhận
    const confirm = await CustomPopup.confirm(
        "Bạn có muốn tính KPI từ lúc này?\n\n" +
        "Hệ thống sẽ lưu danh sách sản phẩm hiện tại làm base để so sánh.",
        "Xác nhận tính KPI"
    );
    
    if (confirm) {
        await saveKPIBase(orderId, userId, stt, mainProducts);
    }
}
```

### Bước 3: Lưu BASE vào Firebase

**Firebase Path:** `kpi_base/{orderId}`

```javascript
{
    orderId: "d4430000-5d27-0015-db2f-08de24c0016a",
    stt: 1717,
    userId: "fc0f4439-9cf6-4d88-a8c7-759ca8295142",
    userName: "Tú",
    timestamp: 1703318400000,
    products: [
        { code: "N1769", quantity: 1, price: 390000 },
        { code: "N1278L", quantity: 1, price: 360000 },
        { code: "N3050", quantity: 2, price: 190000 }
    ]
}
```

> [!IMPORTANT]
> **CHỈ LƯU SẢN PHẨM CHÍNH** (không phải sản phẩm đang giữ)
> BASE này **KHÔNG thay đổi** sau khi đã tạo

### Bước 4: So Sánh Với Note

**Format Note trong đơn hàng:**
```
N1769 - 1 - 390000
N1278L - 1 - 360000
N3050 - 2 - 190000
```

**Logic so sánh:**

| Trường hợp | Ví dụ | Kết quả |
|------------|-------|---------|
| SP mới (không có trong BASE) | Note có `N9999`, BASE không có | +1 SP khác biệt |
| SP bị xóa (có trong BASE, không có Note) | BASE có `N1769`, Note không có | +1 SP khác biệt |
| Số lượng khác | BASE: `N1769 x 1`, Note: `N1769 x 3` | +2 SP khác biệt (3-1=2) |
| Trùng khớp | BASE = Note | 0 SP khác biệt |

### Bước 5: Tính KPI

**Công thức:**
```
KPI = Số sản phẩm khác biệt × 5,000 VNĐ
```

**Ví dụ:**

| BASE | Note | Khác biệt | KPI |
|------|------|-----------|-----|
| N1769 x 1 | N1769 x 1 | 0 | 0đ |
| N1769 x 1 | N1769 x 3 | 2 | 10,000đ |
| N1769 x 1, N3050 x 1 | N1769 x 1 | 1 (thiếu N3050) | 5,000đ |
| N1769 x 1 | N1769 x 1, N9999 x 1 | 1 (thêm N9999) | 5,000đ |

### Bước 6: Hiển Thị Thống Kê

Thống kê KPI được hiển thị tại: [tab2-statistics.html](file:///Users/mac/Downloads/n2store/orders-report/tab2-statistics.html)

---

## Firebase Structure

```
Firebase Realtime Database
├── kpi_base/
│   └── {orderId}/
│       ├── orderId: string
│       ├── stt: number
│       ├── userId: string
│       ├── userName: string
│       ├── timestamp: number
│       └── products: [
│           { code: string, quantity: number, price: number }
│       ]
│
├── kpi_statistics/
│   └── {userId}/
│       └── {date}/
│           ├── totalDifferences: number
│           ├── totalKPI: number
│           └── orders: [
│               { orderId, stt, differences: number, kpi: number }
│           ]
```

---

## Lưu Ý Quan Trọng

> [!WARNING]
> **KHÔNG tính sản phẩm mới thêm vào sau khi đã lưu BASE**
> 
> BASE chỉ được lưu **1 lần duy nhất** khi user xác nhận lần đầu.
> Các sản phẩm thêm sau đó sẽ chỉ được so sánh với BASE ban đầu.

> [!NOTE]
> **Trùng mã sản phẩm → So sánh số lượng**
> 
> Nếu mã sản phẩm giống nhau, chỉ tính số lượng chênh lệch.
> VD: BASE có 1, Note có 3 → Khác biệt = 2 (không phải 1)

---

## Ví Dụ Thực Tế

### Đơn hàng STT 1717

**1. Sản phẩm đang giữ ban đầu (held_products):**

![Product Card](uploaded_image_1766483560411.png)

**2. User nhấn "Xác nhận" → Popup hỏi tính KPI:**
```
"Bạn có muốn tính KPI từ lúc này?"
[Có] [Không]
```

**3. User chọn "Có" → Lưu BASE:**
```json
{
    "orderId": "d4430000-5d27-0015-db2f-08de24c0016a",
    "stt": 1717,
    "userName": "Tú",
    "products": [
        { "code": "N3050", "quantity": 1, "price": 190000 }
    ]
}
```

**4. Sau đó, Note đơn hàng được cập nhật:**
```
N3050 - 3 - 190000
N1769 - 1 - 390000
```

**5. Tính KPI:**
| Sản phẩm | BASE | Note | Khác biệt |
|----------|------|------|-----------|
| N3050 | 1 | 3 | +2 |
| N1769 | 0 | 1 | +1 |
| **Tổng** | | | **3** |

**KPI = 3 × 5,000đ = 15,000đ**

---

## API Functions (✅ Đã implement)

### Core Functions - `kpi-manager.js`

| Function | Mô tả | Status |
|----------|-------|--------|
| `checkKPIBaseExists(orderId)` | Kiểm tra đã có BASE chưa | ✅ |
| `saveKPIBase(orderId, userId, stt, products)` | Lưu BASE vào Firebase | ✅ |
| `getKPIBase(orderId)` | Lấy BASE đã lưu | ✅ |
| `parseNoteProducts(note)` | Parse sản phẩm từ Note (N1769 - 1 - 390000) | ✅ |
| `calculateKPIDifference(base, noteProducts)` | Tính số SP khác biệt | ✅ |
| `calculateKPIAmount(differences)` | Tính tiền KPI (× 5,000đ) | ✅ |
| `saveKPIStatistics(userId, date, statistics)` | Lưu thống kê KPI | ✅ |

### Helper Functions - `kpi-manager.js`

| Function | Mô tả | Status |
|----------|-------|--------|
| `promptAndSaveKPIBase(orderId, stt, mainProducts)` | Popup hỏi user + lưu BASE | ✅ |
| `calculateAndSaveKPI(orderId, noteText)` | Tính và lưu KPI hoàn chỉnh | ✅ |
| `getCurrentDateString()` | Trả về YYYY-MM-DD | ✅ |

### UI Functions - `kpi-statistics-ui.js`

| Function | Mô tả | Status |
|----------|-------|--------|
| `loadKPIStatistics(dateFilter)` | Load statistics từ Firebase | ✅ |
| `loadKPIBase(orderId)` | Load BASE cho đơn hàng | ✅ |
| `aggregateByUser(statsData, dateFilter)` | Tổng hợp theo user | ✅ |
| `renderKPIStatisticsTable(containerId, dateFilter)` | Render bảng thống kê | ✅ |
| `showUserKPIDetail(userId)` | Modal chi tiết KPI user | ✅ |
| `showOrderKPIComparison(orderId)` | Modal so sánh BASE | ✅ |
| `renderKPITimelineChart(canvasId, userId)` | Render chart timeline | ✅ |

---

## Files Đã Tạo

| File | Dòng | Mô tả |
|------|------|-------|
| `kpi-manager.js` | ~400 | Core logic tính KPI |
| `kpi-statistics-ui.js` | ~500 | UI hiển thị thống kê |

---

## Tích Hợp

- `addChatProductFromSearch()` trong `tab1-orders.js`: Thêm SP vào `held_products` thay vì trực tiếp vào đơn
- `confirmHeldProduct()` trong `tab1-orders.js`: Gọi `kpiManager.promptAndSaveKPIBase()` khi xác nhận SP lần đầu
- `tab2-statistics.html`: Include `kpi-manager.js` và `kpi-statistics-ui.js`

---

*Cập nhật: 2025-12-23*
