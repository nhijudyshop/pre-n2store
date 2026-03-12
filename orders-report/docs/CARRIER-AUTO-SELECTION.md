# Carrier Auto-Selection Logic

## Overview

Hệ thống tự động chọn đối tác giao hàng (carrier) dựa trên địa chỉ khách hàng. Logic này áp dụng cho cả:
- **Sale Modal** (Phiếu bán hàng)
- **Fast Sale Modal** (Thêm hóa đơn nhanh)

## Files liên quan

| File | Chức năng |
|------|-----------|
| `js/tab1/tab1-qr-debt.js` | Định nghĩa các hàm chính: `extractDistrictFromAddress`, `findMatchingCarrier`, `smartSelectDeliveryPartner` |
| `js/tab1/tab1-fast-sale.js` | Sử dụng `smartSelectCarrierForRow` để auto-select cho fast-sale rows |
| `js/tab1/test-address-parsing.js` | Test file để debug address parsing |

## Carrier Mapping

### Phí ship theo quận/huyện HCM

| Carrier | Fee | Quận/Huyện |
|---------|-----|------------|
| **THÀNH PHỐ (20.000 đ)** | 20,000 | Q1, Q3, Q4, Q5, Q6, Q7, Q8, Q10, Q11, Phú Nhuận, Bình Thạnh, Tân Phú, Tân Bình, Gò Vấp |
| **THÀNH PHỐ (30.000 đ)** | 30,000 | Q2, Q12, Bình Tân, Thủ Đức |
| **THÀNH PHỐ (35.000 đ)** | 35,000 | Q9, Bình Chánh, Nhà Bè, Hóc Môn |
| **SHIP TỈNH (35.000 đ)** | 35,000 | Củ Chi, Cần Giờ, tất cả tỉnh khác |

## Flow xử lý

```
Address Input
     │
     ▼
extractDistrictFromAddress(address, extraAddress)
     │
     ├── Check ExtraAddress (structured data from TPOS)
     │
     ├── Check provinces (61 tỉnh, đọc từ cuối địa chỉ)
     │   └── Match → isProvince = true → SHIP TỈNH
     │
     ├── Extract district number (Q1, Q7, quan 10, etc.)
     │
     └── Match named districts (Tân Bình, Gò Vấp, etc.)
           └── Check lastThreeParts của địa chỉ
           └── Tránh false match: "ấp bình thạnh" ≠ "Bình Thạnh"
     │
     ▼
findMatchingCarrier(select, districtInfo)
     │
     ├── Match by fee value (20000, 30000, 35000)
     ├── AND carrier type (THÀNH PHỐ vs SHIP TỈNH)
     │
     ▼
Auto-select carrier in dropdown
```

## Key Functions

### 1. `extractDistrictFromAddress(address, extraAddress)`

Trích xuất thông tin quận/huyện từ địa chỉ.

**Input:**
- `address`: Chuỗi địa chỉ (VD: "123 Nguyễn Văn Cừ, Q5, HCM")
- `extraAddress`: Object có cấu trúc từ TPOS (optional)

**Output:**
```javascript
{
    districtName: "Quận 5" | null,
    districtNumber: "5" | null,
    wardName: "Phường 4" | null,
    cityName: "TP.HCM" | null,
    isProvince: false,
    originalText: "123 Nguyễn Văn Cừ, Q5, HCM"
}
```

**Logic quan trọng:**
- Đọc địa chỉ từ **cuối lên đầu** để ưu tiên detect tỉnh/thành phố trước
- Normalize diacritics: "Tân Bình" → "tan binh"
- Tránh false match: kiểm tra prefix "ấp/xóm/thôn" trước district name

### 2. `findMatchingCarrier(select, districtInfo)`

Tìm carrier phù hợp dựa trên thông tin quận/huyện.

**Input:**
- `select`: HTMLSelectElement của dropdown carrier
- `districtInfo`: Object từ `extractDistrictFromAddress`

**Output:**
```javascript
{ id: "123", name: "THÀNH PHỐ (20.000 đ)" } | null
```

**Logic matching (sử dụng fee value):**
```javascript
const carrierFee = parseFloat(option.dataset.fee) || 0;

// 20k: Inner city
if (targetGroup === '20k' && carrierFee === 20000 && carrierNorm.includes('thanh pho'))

// 30k: Q2, Q12, Bình Tân, Thủ Đức
if (targetGroup === '30k' && carrierFee === 30000 && carrierNorm.includes('thanh pho'))

// 35k THÀNH PHỐ: Q9, Bình Chánh, Nhà Bè, Hóc Môn
if (targetGroup === '35k_tp' && carrierFee === 35000 && carrierNorm.includes('thanh pho'))

// SHIP TỈNH
if (targetGroup === 'ship_tinh' && carrierNorm.includes('ship tinh'))
```

### 3. `smartSelectDeliveryPartner(address, extraAddress)`

Orchestrator function cho Sale Modal.

### 4. `smartSelectCarrierForRow(select, address, extraAddress)`

Wrapper function cho Fast Sale Modal rows.

## Testing

Mở browser console và chạy:

```javascript
// Test single address
window.testSingleAddress("cong lo tan binh")

// Simulate carrier selection
window.simulateCarrierSelection("999 Pham van chieu, go vap")

// Run all tests
window.testAddressParsing()

// Test all HCM districts
window.testAllDistricts()
```

## Bug History

### 2026-02-04: Fix carrier matching by fee value

**Bug:** `findMatchingCarrier` tìm kiếm "20.000" trong tên carrier, nhưng `option.dataset.name` (từ TPOS API) không chứa giá tiền.

**Console log khi bug:**
```
[SMART-DELIVERY] Target carrier group: 20k
[FAST-SALE] No matching carrier, selecting SHIP TỈNH
```

**Fix:** Sử dụng `option.dataset.fee` để match chính xác theo giá trị fee thay vì tìm price string trong tên.

```javascript
// Before (broken)
if (targetGroup === '20k' && carrierNorm.includes('20.000'))

// After (fixed)
const carrierFee = parseFloat(option.dataset.fee) || 0;
if (targetGroup === '20k' && carrierFee === 20000 && carrierNorm.includes('thanh pho'))
```

## Debug Tips

1. **Kiểm tra carrier dropdown đã load chưa:**
   ```javascript
   document.getElementById('saleDeliveryPartner').options
   ```

2. **Xem fee của từng carrier:**
   ```javascript
   Array.from(document.getElementById('saleDeliveryPartner').options)
     .map(o => ({ name: o.dataset.name, fee: o.dataset.fee }))
   ```

3. **Test address parsing:**
   ```javascript
   window.extractDistrictFromAddress("địa chỉ test", null)
   ```

4. **Xem logs:** Filter console bằng `[SMART-DELIVERY]` hoặc `[FAST-SALE]`
