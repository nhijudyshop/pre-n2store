# Hướng Dẫn Restructure Inventory Tracking - sttNCC làm Key Chính

## Mục Tiêu

Tái cấu trúc hệ thống inventory tracking:
- **sttNCC** là document key (ID) duy nhất - làm CHA
- **datHang[]** là nhánh con thứ 1 (Đặt Hàng)
- **dotHang[]** là nhánh con thứ 2 (Theo Dõi Đơn Hàng)
- Xóa collection `order_bookings`, gộp vào `inventory_tracking`
- Tab 3 (Công Nợ) giữ nguyên logic riêng biệt

---

## Cấu Trúc Dữ Liệu Mới

### Collection: `inventory_tracking`
**Document ID**: `ncc_{sttNCC}` (VD: `ncc_1`, `ncc_2`, ...)

```javascript
{
  // === KEY CHÍNH (CHỈ CÓ sttNCC LÀM CHA) ===
  sttNCC: 1,
  
  // === NHÁNH 1: ĐẶT HÀNG ===
  datHang: [
    {
      id: "booking_xxx",           // ID unique cho mỗi đơn đặt
      ngayDatHang: "2024-12-28",
      tenNCC: "Công ty ABC",       // ← Optional, user tự nhập
      trangThai: "pending",        // pending | received | cancelled
      sanPham: [
        { maSP: "721", soMau: "2", soLuong: 10, giaDonVi: 54, rawText: "MA 721 2 MAU 10X54" }
      ],
      tongTienHD: 50000,
      tongMon: 10,
      anhHoaDon: ["url1", "url2"], // URLs ảnh hóa đơn đặt hàng
      ghiChu: "",
      linkedDotHangId: null,       // Liên kết với đợt hàng khi nhận
      createdAt: timestamp,
      createdBy: "username"
    }
  ],
  
  // === NHÁNH 2: THEO DÕI ĐƠN HÀNG ===
  dotHang: [
    {
      id: "dot_xxx",               // ID unique cho mỗi đợt hàng
      ngayDiHang: "2024-12-30",
      tenNCC: "Công ty ABC",       // ← Optional, user tự nhập
      kienHang: [{ stt: 1, soKg: 10 }, { stt: 2, soKg: 15 }],
      tongKien: 2,
      tongKg: 25,
      sanPham: [
        { maSP: "721", soMau: "2", soLuong: 9, giaDonVi: 54, rawText: "MA 721 2 MAU 9X54" }
      ],
      tongTienHD: 48600,
      tongMon: 9,
      soMonThieu: 1,
      ghiChuThieu: "Thiếu 1 cái màu đỏ",
      anhHoaDon: ["url1"],         // URLs ảnh hóa đơn giao hàng
      createdAt: timestamp,
      createdBy: "username"
    }
  ],
  
  // === METADATA ===
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

## Các Files Cần Sửa

### 1. config.js

**Thay đổi:**
- Xóa `COLLECTIONS.ORDER_BOOKINGS`
- Cập nhật `globalState`:

```javascript
// XÓA:
// orderBookings: [],
// filteredOrderBookings: [],

// THÊM:
nccList: [],           // Danh sách NCC documents
filteredNCCList: [],   // Filtered list
```

---

### 2. data-loader.js

**Thêm function mới:**

```javascript
// Load tất cả NCC documents
async function loadNCCData() {
    const snapshot = await shipmentsRef.get();
    globalState.nccList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    globalState.filteredNCCList = [...globalState.nccList];
}

// Helper: Lấy NCC document theo sttNCC
function getNCCById(sttNCC) {
    return globalState.nccList.find(ncc => ncc.sttNCC === sttNCC);
}

// Helper: Lấy hoặc tạo NCC document
async function getOrCreateNCC(sttNCC) {
    const docId = `ncc_${sttNCC}`;
    const docRef = shipmentsRef.doc(docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        const newData = {
            sttNCC: sttNCC,
            datHang: [],
            dotHang: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await docRef.set(newData);
        return { id: docId, ...newData };
    }
    return { id: doc.id, ...doc.data() };
}

// Helper: Flat list tất cả đặt hàng
function getAllDatHang() {
    const all = [];
    globalState.nccList.forEach(ncc => {
        (ncc.datHang || []).forEach(dh => {
            all.push({ ...dh, sttNCC: ncc.sttNCC, nccDocId: ncc.id });
        });
    });
    return all.sort((a, b) => new Date(b.ngayDatHang) - new Date(a.ngayDatHang));
}

// Helper: Flat list tất cả đợt hàng
function getAllDotHang() {
    const all = [];
    globalState.nccList.forEach(ncc => {
        (ncc.dotHang || []).forEach(dot => {
            all.push({ ...dot, sttNCC: ncc.sttNCC, nccDocId: ncc.id });
        });
    });
    return all.sort((a, b) => new Date(b.ngayDiHang) - new Date(a.ngayDiHang));
}
```

---

### 3. order-booking-crud.js

**Thay đổi logic CRUD:**

```javascript
// LOAD: Lấy từ nccList
async function loadOrderBookings() {
    // Không cần load riêng, dùng getAllDatHang()
    return getAllDatHang();
}

// CREATE: Push vào datHang[] của NCC
async function createOrderBooking(data) {
    const sttNCC = data.sttNCC;
    const ncc = await getOrCreateNCC(sttNCC);
    
    const newBooking = {
        id: generateId('booking'),
        ngayDatHang: data.ngayDatHang,
        tenNCC: data.tenNCC || '',      // Optional
        trangThai: 'pending',
        sanPham: data.sanPham || [],
        tongTienHD: data.tongTienHD || 0,
        tongMon: data.tongMon || 0,
        anhHoaDon: data.anhHoaDon || [],
        ghiChu: data.ghiChu || '',
        linkedDotHangId: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: authManager?.getUserName() || 'unknown'
    };
    
    await shipmentsRef.doc(ncc.id).update({
        datHang: firebase.firestore.FieldValue.arrayUnion(newBooking),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await loadNCCData();  // Reload
    return newBooking;
}

// UPDATE: Tìm và update trong datHang[]
async function updateOrderBooking(sttNCC, bookingId, data) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) throw new Error('NCC not found');
    
    const datHang = [...(ncc.datHang || [])];
    const idx = datHang.findIndex(b => b.id === bookingId);
    if (idx === -1) throw new Error('Booking not found');
    
    datHang[idx] = { ...datHang[idx], ...data };
    
    await shipmentsRef.doc(ncc.id).update({
        datHang: datHang,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await loadNCCData();
}

// DELETE: Remove từ datHang[]
async function deleteOrderBooking(sttNCC, bookingId) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) return;
    
    const datHang = (ncc.datHang || []).filter(b => b.id !== bookingId);
    
    await shipmentsRef.doc(ncc.id).update({
        datHang: datHang,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await loadNCCData();
}
```

---

### 4. modal-order-booking.js

**Thay đổi form:**
- Thêm field `tenNCC` (optional)
- Khi nhập sttNCC, auto-fill tenNCC nếu đã có từ NCC cũ

```javascript
// Trong renderOrderBookingForm()
// Thêm field:
<div class="form-group">
    <label>Tên NCC (tùy chọn)</label>
    <input type="text" id="bookingTenNCC" class="form-input" 
           value="${booking?.tenNCC || ''}" 
           placeholder="VD: Công ty ABC">
</div>

// Auto-fill khi nhập sttNCC
document.getElementById('bookingNCC')?.addEventListener('change', (e) => {
    const sttNCC = parseInt(e.target.value);
    const ncc = getNCCById(sttNCC);
    if (ncc) {
        // Tìm tenNCC từ datHang hoặc dotHang gần nhất
        const lastDatHang = ncc.datHang?.[ncc.datHang.length - 1];
        const lastDotHang = ncc.dotHang?.[ncc.dotHang.length - 1];
        const suggestedName = lastDatHang?.tenNCC || lastDotHang?.tenNCC || '';
        document.getElementById('bookingTenNCC').value = suggestedName;
    }
});
```

---

### 5. crud-operations.js (Tab 2 - Theo dõi đơn hàng)

**Thay đổi logic:**

```javascript
// CREATE: Push vào dotHang[] của từng NCC
async function createShipment(data) {
    // data.hoaDon là mảng nhiều NCC
    for (const invoice of data.hoaDon) {
        const sttNCC = invoice.sttNCC;
        const ncc = await getOrCreateNCC(sttNCC);
        
        const newDotHang = {
            id: generateId('dot'),
            ngayDiHang: data.ngayDiHang,
            tenNCC: invoice.tenNCC || '',
            kienHang: invoice.kienHang || [],
            tongKien: invoice.tongKien || 0,
            tongKg: invoice.tongKg || 0,
            sanPham: invoice.sanPham || [],
            tongTienHD: invoice.tongTienHD || 0,
            tongMon: invoice.tongMon || 0,
            soMonThieu: invoice.soMonThieu || 0,
            ghiChuThieu: invoice.ghiChuThieu || '',
            anhHoaDon: invoice.anhHoaDon || [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: authManager?.getUserName() || 'unknown'
        };
        
        await shipmentsRef.doc(ncc.id).update({
            dotHang: firebase.firestore.FieldValue.arrayUnion(newDotHang),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    await loadNCCData();
}

// UPDATE và DELETE tương tự như order-booking-crud.js
```

---

### 6. modal-shipment.js

**Thay đổi form:**
- Thêm field `tenNCC` trong mỗi invoice form
- Dropdown gợi ý NCC đã có

---

### 7. order-booking-renderer.js

**Thay đổi source data:**

```javascript
function renderOrderBookings() {
    const bookings = getAllDatHang();  // Lấy từ helper function
    // ... render như cũ
}
```

---

### 8. table-renderer.js

**Thay đổi source data:**

```javascript
function renderShipments() {
    const dotHangList = getAllDotHang();  // Lấy từ helper function
    // Group theo ngayDiHang nếu cần
    // ... render như cũ
}
```

---

### 9. finance-manager.js

**Cập nhật source:**

```javascript
// Tiền hóa đơn: Lấy từ nccList[].dotHang[].tongTienHD
function buildTransactionsList() {
    // ...
    globalState.nccList.forEach(ncc => {
        (ncc.dotHang || []).forEach(dot => {
            // Thêm vào transactions list
        });
    });
}
```

---

### 10. filters.js

**Cập nhật filter:**

```javascript
// Filter by sttNCC
function applyFiltersAndRender() {
    const filterNCC = globalState.filters.ncc;
    
    if (filterNCC !== 'all') {
        globalState.filteredNCCList = globalState.nccList.filter(
            ncc => ncc.sttNCC === parseInt(filterNCC)
        );
    } else {
        globalState.filteredNCCList = [...globalState.nccList];
    }
    
    // Re-render
}
```

---

## Thứ Tự Thực Hiện

1. ✅ **Backup data hiện tại** (nếu cần)
2. **Sửa `config.js`** - Cập nhật globalState
3. **Sửa `data-loader.js`** - Thêm helper functions
4. **Sửa `order-booking-crud.js`** - CRUD cho datHang
5. **Sửa `modal-order-booking.js`** - Form field tenNCC
6. **Sửa `order-booking-renderer.js`** - Render từ source mới
7. **Sửa `crud-operations.js`** - CRUD cho dotHang
8. **Sửa `modal-shipment.js`** - Form field tenNCC
9. **Sửa `table-renderer.js`** - Render từ source mới
10. **Sửa `finance-manager.js`** - Cập nhật source
11. **Sửa `filters.js`** - Filter logic mới
12. **Xóa data cũ** trong Firebase (collection `order_bookings`)
13. **Test toàn bộ flow**

---

## Lưu Ý Quan Trọng

⚠️ **Data cũ sẽ bị xóa** - Đây là data ảo, không ảnh hưởng

⚠️ **sttNCC là cố định** - sttNCC = 1 mãi mãi là NCC số 1

⚠️ **tenNCC là optional** - User có thể nhập hoặc không

⚠️ **Tab 3 giữ nguyên** - Công nợ không gắn vào NCC cụ thể
