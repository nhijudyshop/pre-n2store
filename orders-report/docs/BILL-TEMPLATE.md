# Bill Template Documentation

## Nguồn tham khảo chính thức

1. **Template gốc TPOS**: `/orders-report/bill_template.txt`
2. **PDF mẫu**: `/orders-report/Phiếu bán hàng - TPOS.VN.pdf`

> **Lưu ý**: PDF giống template TPOS nhưng có thêm trường **STT** (Session Index).

---

## Cấu trúc Bill

### 1. Header - Thông tin Shop
```
┌─────────────────────────────────────┐
│           NJD Live                  │  <- Tên shop (company.Name)
│  THÀNH PHỐ (1 3 4 5 6 7 8...)      │  <- Carrier name (vùng giao hàng)
│      Tiền thu hộ: 0                 │  <- COD amount (0 nếu trả đủ)
│─────────────────────────────────────│
```

### 2. Tiêu đề + Barcode
```
│         PHIẾU BÁN HÀNG             │
│                                     │
│    |||||||||||||||||||||||||||      │  <- Barcode (Code 128)
│    Số phiếu: NJD/2026/49562         │  <- Bill number
│    Ngày: 28/01/2026 11:16           │  <- Date/time
│─────────────────────────────────────│
```

### 3. Thông tin khách hàng
```
│ Khách hàng: Diệu Nhi                │
│ Địa chỉ: Tân Phú Test               │
│ Điện thoại: 0909999999              │
│ Người bán: Tú                       │
│ STT: 252                            │  <- Session Index (sau Người bán)
└─────────────────────────────────────┘
```

**Thứ tự các trường (quan trọng):**
1. Khách hàng
2. Địa chỉ
3. Điện thoại
4. Người bán
5. **STT** ← Phải nằm sau "Người bán", KHÔNG phải sau "Ngày"

### 4. Bảng sản phẩm
```
┌─────────────┬──────────┬──────────┐
│ Sản phẩm    │   Giá    │   Tổng   │
├─────────────┴──────────┴──────────┤
│ [N23] 0510 A3 ÁO 2D FENDY HỒNG    │  <- Tên sản phẩm (colspan=3)
│ (100)                              │  <- Note sản phẩm (giảm giá)
├─────────────┬──────────┬──────────┤
│   2 Cái     │ 180.000  │ 360.000  │  <- Số lượng, đơn giá, thành tiền
├─────────────┴──────────┴──────────┤
│ Tổng:       │  SL: 2   │ 360.000  │
│             │ Giảm giá:│ 160.000  │  <- Chỉ hiện nếu > 0
│             │Tiền ship:│  20.000  │
│             │Tổng tiền:│ 220.000  │
│             │Trả trước:│ 220.000  │  <- min(walletBalance, finalTotal)
│             │ Còn lại: │       0  │  <- Luôn hiện nếu có trả trước
└─────────────┴──────────┴──────────┘
```

**Ví dụ thực tế (wallet 400K, total 220K):**
- Số dư ví: 400.000
- Tổng tiền: 220.000
- Trả trước: min(400K, 220K) = **220.000**
- Còn lại: 220K - 220K = **0**
- Tiền thu hộ: **0**

### 5. Ghi chú giao hàng
```
Ghi chú giao hàng: KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ
HOTLINE CŨA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ

Sản phẩm nhận đổi trả trong vòng 2-4 ngày kể từ ngày nhận
hàng, "ĐỐI VỚI SẢN PHẨM BỊ LỖI HOẶC SẢN PHẨM SHOP GIAO SAI"
quá thời gian shop không nhận xử lý đổi trả bất kì trường hợp nào.
```

### 6. Ghi chú chung
```
Ghi chú:
STK ngân hàng Lại Thụy Yến Nhi
75918 (ACB)
```

---

## Mapping dữ liệu

| Trường hiển thị | Source (orderResult) | Fallback |
|-----------------|---------------------|----------|
| Tên shop | `company.Name` | "NJD Live" |
| Carrier | `CarrierName`, `Carrier.Name` | "" |
| Tiền thu hộ | `finalTotal - prepaidAmount` | 0 |
| Số phiếu | `Number` | "" |
| Ngày | `new Date()` | Current time |
| Khách hàng | `Partner.Name`, `PartnerDisplayName` | "" |
| Địa chỉ | `Partner.Street`, `Ship_Receiver.Street` | "" |
| Điện thoại | `Partner.Phone`, `Ship_Receiver.Phone` | "" |
| Người bán | `User.Name`, `UserName` | "" |
| **STT** | `SessionIndex` | "" |
| Sản phẩm | `OrderLines[].ProductName` | "" |
| Số lượng | `OrderLines[].Quantity` | 1 |
| Đơn giá | `OrderLines[].PriceUnit` | 0 |
| Giảm giá | `Discount`, `DiscountAmount`, `DecreaseAmount` | 0 |
| Tiền ship | `DeliveryPrice` | 0 |
| Trả trước | `min(walletBalance, finalTotal)` | 0 |
| Ghi chú GH | `DeliveryNote` | "" |
| Ghi chú | `Comment` (auto-fill từ modal) | "" |

---

## Công thức tính toán

```javascript
// Tổng tiền sản phẩm
totalAmount = sum(OrderLines.map(item => item.Quantity * item.PriceUnit))

// Tổng tiền đơn hàng
finalTotal = totalAmount - discount + shippingFee

// Trả trước = min(số dư ví, tổng tiền cần trả)
// VD: Số dư 400K, tổng tiền 220K → Trả trước = 220K
prepaidAmount = Math.min(walletBalance, finalTotal)

// Tiền thu hộ (COD) = Còn lại
codAmount = Math.max(0, finalTotal - prepaidAmount)
```

---

## walletBalance Priority

Khi tạo bill, `walletBalance` được lấy theo thứ tự ưu tiên:

```javascript
// Priority:
// 1) options.walletBalance - passed explicitly from confirmAndPrintSale
// 2) form field salePrepaidAmount - when modal visible
// 3) orderResult.PaymentAmount - fallback for batch flow

const walletBalance = options.walletBalance ||
    (isModalVisible && parseFloat(document.getElementById('salePrepaidAmount')?.value)) ||
    orderResult?.PaymentAmount ||
    0;
```

**Lý do cần `options.walletBalance`:**

Trong `confirmAndPrintSale()`, sau khi tạo đơn hàng thành công:
1. **Debt update** chạy trước - cập nhật `salePrepaidAmount` thành `remainingDebt` (400K → 180K)
2. **Bill generation** chạy sau - nếu đọc từ form field sẽ lấy sai giá trị

```javascript
// confirmAndPrintSale() flow:
const savedWalletBalance = 400000; // Lưu TRƯỚC debt update

// Debt update: salePrepaidAmount = remainingDebt = 180K
prepaidInput.value = remainingDebt; // Form field bị thay đổi!

// Bill generation: Pass savedWalletBalance để đảm bảo đúng
openPrintPopup(result, { walletBalance: savedWalletBalance });
```

**Kết quả:**
- ❌ Không có fix: `prepaid = min(180K, 220K) = 180K` (SAI)
- ✅ Có fix: `prepaid = min(400K, 220K) = 220K` (ĐÚNG)

---

## Auto-fill Ghi chú đơn hàng

Khi mở modal "Phiếu bán hàng", field **Ghi chú** (`saleReceiverNote`) sẽ được auto-fill từ dữ liệu có sẵn:

```javascript
// Format: "CK 400K ACB 28/01, GG 160K, đơn gộp 1026 + 1074"

// 1. CK (Chuyển khoản) - từ số dư ví (salePrepaidAmount)
// Ghi số dư ví gốc, KHÔNG phải số tiền trả trước
if (walletBalance > 0) {
    noteParts.push(`CK ${walletBalance/1000}K ACB ${dd/mm}`);
}

// 2. GG (Giảm giá) - từ field saleDiscount (đã tính từ product notes)
if (discount > 0) {
    noteParts.push(`GG ${discount/1000}K`);
}

// 3. Gộp - từ tag "Gộp X Y" trong order.Tags
if (mergeTag) {
    noteParts.push(`ĐƠN GỘP ${numbers.join(' + ')}`);
}

// 4. Freeship - nếu đủ điều kiện miễn phí ship
// THÀNH PHỐ: finalTotal > 1,500,000đ
// TỈNH: finalTotal > 3,000,000đ
if (qualifiesForFreeship) {
    noteParts.push('FREESHIP');
}
```

**Ví dụ thực tế:** `"CK 400K ACB 28/01, GG 160K, FREESHIP"`
- Số dư ví 400K → ghi "CK 400K" (ghi số dư gốc để track)
- Giảm giá 160K → ghi "GG 160K"

**Điều kiện hiển thị:**
- CK: Chỉ hiện nếu `walletBalance > 0`
- GG: Chỉ hiện nếu `discount > 0` (từ tag "GIẢM GIÁ" + product notes)
- Gộp: Chỉ hiện nếu có tag bắt đầu bằng "Gộp "
- Freeship: Chỉ hiện nếu đủ điều kiện (THÀNH PHỐ > 1.5M hoặc TỈNH > 3M)

---

## Barcode

- **Loại**: Code 128
- **URL**: `https://statics.tpos.vn/Web/Barcode?type=Code 128&value={billNumber}&width=600&height=100`
- **Kích thước**: width 95%

---

## CSS quan trọng

```css
/* Kích thước bill */
html, body {
    width: 80mm;           /* Độ rộng giấy in nhiệt */
    font-size: 13px;
    font-family: Arial, Helvetica, sans-serif;
    line-height: 1.2;
}

/* Đường kẻ ngang dạng nét đứt */
hr.dash-cs {
    margin-top: 5px;
    margin-bottom: 5px;
    border-top: 1px dashed black;
}

/* Font size tiền thu hộ */
.size-16 {
    font-size: 16px;
}

/* Border bảng sản phẩm */
.table-cs > tbody > tr > td,
.table-cs > thead > tr > th {
    border-top: 1px solid gray !important;
    border-bottom: 1px solid gray !important;
}
```

---

## File liên quan

| File | Mô tả |
|------|-------|
| `js/utils/bill-service.js` | Function `generateCustomBillHTML()` - tạo HTML bill |
| `js/tab1/tab1-sale.js` | `confirmAndPrintSale()` - xác nhận đơn và in bill |
| `js/tab1/tab1-fast-sale.js` | Preview bill, sample data, batch print |
| `js/tab1/tab1-qr-debt.js` | `fetchDebtForSaleModal()` - lấy wallet balance |
| `bill_template.txt` | Template gốc từ TPOS API |
| `html_bill.txt` | Ví dụ response từ TPOS API |
| `Phiếu bán hàng - TPOS.VN.pdf` | PDF mẫu chuẩn (có STT) |

---

## Lưu ý khi chỉnh sửa

1. **KHÔNG đổi thứ tự các trường** - Giữ nguyên thứ tự như PDF mẫu
2. **STT phải sau Người bán** - Không phải sau Ngày
3. **Giữ nguyên CSS** - Đã được tối ưu cho máy in nhiệt 80mm
4. **Điều kiện hiển thị**:
   - Giảm giá: chỉ hiện nếu `discount > 0`
   - Trả trước: chỉ hiện nếu `safePrepaidAmount > 0`
   - **Còn lại**: Luôn hiện nếu có trả trước (giống TPOS)
   - Ghi chú GH: chỉ hiện nếu có nội dung
   - Ghi chú: chỉ hiện nếu có nội dung

---

## Render bill trong preview

**QUAN TRỌNG**: `generateCustomBillHTML()` trả về full HTML document (có `<!DOCTYPE>`, `<html>`, `<head>`, `<style>`).

Khi render trong preview, **PHẢI dùng iframe**:

```javascript
// SAI - CSS bị browser strip mất
container.innerHTML = html;

// ĐÚNG - Dùng iframe để giữ CSS
const iframe = document.createElement('iframe');
container.appendChild(iframe);
const doc = iframe.contentDocument;
doc.open();
doc.write(html);
doc.close();
```

Lý do: Browser tự động strip `<html>`, `<head>`, `<style>` tags khi insert vào `innerHTML`, làm mất toàn bộ CSS.
