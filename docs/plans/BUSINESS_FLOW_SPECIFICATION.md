# ĐẶC TẢ LUỒNG NGHIỆP VỤ (Business Flow Specification)
## Hệ Thống Quản Lý Đơn Hàng & Dòng Tiền - N2Store

> **Document Version:** 1.0
> **Author:** Business Analyst Team
> **Last Updated:** January 2025
> **Status:** Draft for Review

---

## MỤC LỤC

1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Các Bên Liên Quan (Stakeholders)](#2-các-bên-liên-quan-stakeholders)
3. [Quy Trình Nghiệp Vụ Tổng Thể](#3-quy-trình-nghiệp-vụ-tổng-thể)
4. [Chi Tiết Từng Luồng Nghiệp Vụ](#4-chi-tiết-từng-luồng-nghiệp-vụ)
5. [Cơ Chế Kiểm Soát Tài Chính](#5-cơ-chế-kiểm-soát-tài-chính)
6. [Ma Trận Phân Quyền](#6-ma-trận-phân-quyền)
7. [Quy Tắc Nghiệp Vụ (Business Rules)](#7-quy-tắc-nghiệp-vụ-business-rules)
8. [Các Trường Hợp Ngoại Lệ](#8-các-trường-hợp-ngoại-lệ)
9. [Metrics & KPIs](#9-metrics--kpis)
10. [Appendix: Data Dictionary](#10-appendix-data-dictionary)

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mô Tả Doanh Nghiệp

N2Store là doanh nghiệp bán hàng trực tuyến qua **Livestream**, hoạt động theo mô hình:
- Bán hàng **order trực tiếp từ nhà cung cấp** (không tồn kho)
- Khách hàng đặt hàng qua **comment Facebook Livestream**
- Yêu cầu **đặt cọc** với khách mới và khách từng bom hàng
- Công nợ khách hàng được quản lý qua **Ví ảo theo SĐT**

### 1.2 Hệ Thống Liên Quan

| Hệ thống | Vai trò | Mô tả |
|----------|---------|-------|
| **TPOS** | ERP gốc | Quản lý đơn hàng, khách hàng, hóa đơn. **BỊ KHÓA quyền tạo đơn** |
| **Orders-Report (Tab1)** | Master System | Xem đơn, ra đơn, trừ công nợ. **NGUỒN DUY NHẤT tạo đơn** |
| **Balance History** | Quản lý dòng tiền | Theo dõi giao dịch chuyển khoản, match khách hàng, cộng ví |
| **SePay** | Payment Gateway | Nhận webhook từ ngân hàng, gửi thông báo giao dịch |
| **Firebase** | Realtime Sync | Đồng bộ dữ liệu realtime giữa các tabs/users |
| **Pancake** | Chat Management | Quản lý tin nhắn, comment từ Facebook |

### 1.3 Nguyên Tắc Cốt Lõi

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FINANCIAL AIRLOCK PRINCIPLE                           │
│                                                                          │
│  "Một giao dịch chuyển khoản chỉ được dùng MỘT LẦN cho MỘT đơn hàng"    │
│                                                                          │
│  • Orders-Report là MASTER - Chỉ nơi duy nhất được ra đơn & trừ tiền   │
│  • TPOS là SLAVE - Bị khóa quyền tạo đơn, chỉ nhận lệnh từ Master      │
│  • Mỗi giao dịch là UNIQUE - Không thể trừ cho nhiều đơn               │
│  • Audit trail đầy đủ - Mọi thao tác đều được ghi log                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. CÁC BÊN LIÊN QUAN (Stakeholders)

### 2.1 Ma Trận Vai Trò

| Vai trò | Số lượng | Module chính | Nhiệm vụ chính |
|---------|----------|--------------|----------------|
| **Bộ phận xem comment** | 2-3 | Pancake/TPOS | Xem comment, tạo đơn, in phiếu |
| **Nhân viên xử lý cọc** | 1-2 | Balance History | Match giao dịch, nhắc cọc, đưa phiếu |
| **Bộ phận đặt hàng NCC** | 1-2 | Internal | Nhận phiếu đã cọc, đặt hàng NCC |
| **Kế toán** | 1 | Balance History | Duyệt giao dịch, cộng ví, xử lý sai sót |
| **Kiểm soát viên** | 1 | Balance History | Xác nhận cuối cùng, audit định kỳ |
| **Admin** | 1 | All | Cấu hình, phân quyền, báo cáo |

### 2.2 Mô Tả Chi Tiết Vai Trò

#### 2.2.1 Bộ Phận Xem Comment
- **Input:** Comment từ Facebook Livestream
- **Output:** Phiếu đặt hàng (in giấy + digital trên TPOS)
- **Nhiệm vụ:**
  - Theo dõi comment livestream realtime
  - Tạo đơn hàng trên TPOS từ comment
  - Xác định khách cần cọc (khách mới, khách boom)
  - In phiếu giấy và đưa cho Nhân viên xử lý cọc
  - Gán tag "Khách lạ" cho khách mới

#### 2.2.2 Nhân viên Xử Lý Cọc
- **Input:** Phiếu giấy + Giao dịch từ SePay
- **Output:** Phiếu đã cọc đưa cho Bộ phận đặt hàng
- **Nhiệm vụ:**
  - Nhận phiếu giấy từ bộ phận xem comment
  - Nhắn tin/gọi khách nhắc cọc
  - Liên tục kiểm tra Balance History
  - Match giao dịch với phiếu tương ứng
  - Đưa phiếu đã cọc cho Bộ phận đặt hàng
- **Áp lực:** CAO - Phải xử lý nhanh trong phiên live (3h, 100-200 khách)

#### 2.2.3 Bộ Phận Đặt Hàng NCC
- **Input:** Phiếu đã cọc
- **Output:** Hàng từ NCC
- **Nhiệm vụ:**
  - Nhận phiếu từ Nhân viên xử lý cọc
  - Liên hệ NCC đặt hàng
  - Theo dõi tiến độ giao hàng

#### 2.2.4 Kế Toán
- **Input:** Giao dịch cần duyệt
- **Output:** Giao dịch đã duyệt, công nợ cập nhật
- **Nhiệm vụ:**
  - Duyệt giao dịch do nhân viên nhập tay
  - Xử lý sai sót (cộng/trừ công nợ manual)
  - Ghi chú cho từng giao dịch
  - Từ chối giao dịch không hợp lệ

#### 2.2.5 Kiểm Soát Viên
- **Input:** Toàn bộ dòng tiền
- **Output:** Xác nhận cuối cùng, báo cáo audit
- **Nhiệm vụ:**
  - Xác nhận cuối cùng tất cả giao dịch
  - Audit định kỳ (daily/weekly)
  - Phát hiện sai sót hệ thống
  - Kiểm tra toàn bộ công nợ cộng/trừ

---

## 3. QUY TRÌNH NGHIỆP VỤ TỔNG THỂ

### 3.1 Sơ Đồ Tổng Thể (End-to-End Flow)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LUỒNG NGHIỆP VỤ TỔNG THỂ                               │
└─────────────────────────────────────────────────────────────────────────────────┘

PHASE 1: ĐẶT HÀNG
═══════════════════════════════════════════════════════════════════════════════════
     ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
     │    KHÁCH     │      │  BỘ PHẬN XEM │      │     TPOS     │
     │   COMMENT    │─────▶│   COMMENT    │─────▶│  TẠO ĐƠN     │
     │  LIVESTREAM  │      │              │      │              │
     └──────────────┘      └──────┬───────┘      └──────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
           ┌──────────────┐            ┌──────────────┐
           │ KHÁCH CŨ TỐT │            │ KHÁCH MỚI/   │
           │ (Có SĐT, Đ/c)│            │ KHÁCH BOOM   │
           │              │            │ (Cần cọc)    │
           └──────┬───────┘            └──────┬───────┘
                  │                           │
                  │                           ▼
                  │                  ┌──────────────┐
                  │                  │  IN PHIẾU    │
                  │                  │  GIẤY        │
                  │                  └──────┬───────┘
                  │                         │
                  ▼                         ▼

PHASE 2: XỬ LÝ CỌC (Chỉ cho khách mới/boom)
═══════════════════════════════════════════════════════════════════════════════════
                           ┌──────────────┐
                           │  NHÂN VIÊN   │◀─── Nhận phiếu giấy
                           │  XỬ LÝ CỌC   │
                           └──────┬───────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
           ┌──────────────┐            ┌──────────────┐
           │  NHẮC KHÁCH  │            │ CHECK BALANCE│
           │  CHUYỂN KHOẢN│            │   HISTORY    │
           └──────────────┘            │  (Liên tục)  │
                                       └──────┬───────┘
                                              │
                                              ▼
                                     ┌──────────────┐
                                     │  GIAO DỊCH   │
                                     │  KHỚP PHIẾU? │
                                     └──────┬───────┘
                                            │
                              ┌─────────────┴─────────────┐
                              │ YES                    NO │
                              ▼                           ▼
                     ┌──────────────┐            ┌──────────────┐
                     │  ĐƯA PHIẾU   │            │  HẾT LIVE:   │
                     │  CHO BP ĐẶT  │            │  HỦY ĐƠN     │
                     │  HÀNG NCC    │            │              │
                     └──────┬───────┘            └──────────────┘
                            │
                            ▼

PHASE 3: ĐẶT HÀNG NCC
═══════════════════════════════════════════════════════════════════════════════════
                     ┌──────────────┐      ┌──────────────┐
                     │  BỘ PHẬN     │      │     NCC      │
                     │  ĐẶT HÀNG    │─────▶│  GIAO HÀNG   │
                     │              │      │              │
                     └──────────────┘      └──────────────┘
                            │
                            ▼

PHASE 4: GIAO HÀNG & THU TIỀN
═══════════════════════════════════════════════════════════════════════════════════
                     ┌──────────────┐      ┌──────────────┐
                     │  NHẬN HÀNG   │      │  RA ĐƠN      │
                     │  TỪ NCC      │─────▶│  (Tab1)      │
                     │              │      │  TRỪ CÔNG NỢ │
                     └──────────────┘      └──────┬───────┘
                                                  │
                                    ┌─────────────┴─────────────┐
                                    │                           │
                                    ▼                           ▼
                           ┌──────────────┐            ┌──────────────┐
                           │ ĐỦ TIỀN TRONG│            │ THIẾU TIỀN   │
                           │ VÍ ẢO        │            │ THU COD      │
                           └──────────────┘            └──────────────┘
```

### 3.2 Timeline Một Phiên Live

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  14:00        15:00        16:00        17:00        18:00        19:00         │
│    │            │            │            │            │            │           │
│    ▼            ▼            ▼            ▼            ▼            ▼           │
│  ┌────┐      ┌────┐      ┌────┐      ┌────┐      ┌────┐      ┌────┐           │
│  │LIVE│──────│LIVE│──────│LIVE│──────│END │      │    │      │    │           │
│  │BẮT │      │ĐANG│      │KẾT │      │LIVE│      │AUDIT│     │AUDIT│          │
│  │ĐẦU │      │CHẠY│      │THÚC│      │    │      │NV  │      │KT   │          │
│  └────┘      └────┘      └────┘      └────┘      └────┘      └────┘           │
│    │            │            │            │            │            │           │
│    │◀──────────────────────────────────────▶│          │            │           │
│    │     ÁP LỰC CAO - MATCH NHANH          │          │            │           │
│    │     100-200 khách, 35% cần match      │          │            │           │
│    │     40s/giao dịch (target: <15s)      │          │            │           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. CHI TIẾT TỪNG LUỒNG NGHIỆP VỤ

### 4.1 Luồng 1: Khách Đặt Hàng Qua Comment

**Trigger:** Khách comment trên Facebook Livestream

**Flow:**
```
1. Khách comment: "Mua sản phẩm A số lượng 2"
2. Bộ phận xem comment nhận comment (via Pancake)
3. Tạo đơn hàng trên TPOS:
   - Tìm khách theo SĐT/Tên
   - Nếu KH mới → Tạo KH mới, gán tag "Khách lạ"
   - Nếu KH có status "Boom hàng" → Ghi nhận
4. Kiểm tra điều kiện cọc:
   - Khách mới (chưa có SĐT/Địa chỉ)? → CẦN CỌC
   - Khách có tag "Khách lạ"? → CẦN CỌC
   - Khách có status "Boom hàng"? → CẦN CỌC
   - Khách cũ tốt? → KHÔNG CẦN CỌC
5. Nếu CẦN CỌC:
   - In phiếu giấy
   - Đưa phiếu cho Nhân viên xử lý cọc
6. Nếu KHÔNG CẦN CỌC:
   - Đơn sẵn sàng xử lý
```

**Output:** Đơn hàng trên TPOS + Phiếu giấy (nếu cần cọc)

---

### 4.2 Luồng 2: Khách Chuyển Khoản Cọc

**Trigger:** Khách chuyển tiền vào tài khoản ngân hàng

**Flow:**
```
1. Khách chuyển khoản (có thể có nội dung QR code hoặc SĐT)
2. Ngân hàng thông báo → SePay webhook → Balance History
3. Hệ thống tự động xử lý:

   ┌─────────────────────────────────────────────────────────────┐
   │                    AUTO-MATCHING LOGIC                       │
   ├─────────────────────────────────────────────────────────────┤
   │                                                              │
   │  Priority 1: QR Code (N2 + 16 chars)                        │
   │  ├── Tìm exact match trong balance_customer_info            │
   │  ├── Nếu tìm thấy → AUTO_APPROVED                           │
   │  └── Tự động cộng vào Ví ảo                                 │
   │                                                              │
   │  Priority 2: SĐT đầy đủ (10 số bắt đầu 0)                   │
   │  ├── Tìm exact match trong TPOS                             │
   │  ├── Nếu 1 KH duy nhất → AUTO_APPROVED                      │
   │  └── Tự động cộng vào Ví ảo                                 │
   │                                                              │
   │  Priority 3: SĐT một phần (>= 5 số)                         │
   │  ├── Tìm trong TPOS                                         │
   │  ├── Nếu 1 KH duy nhất → AUTO_APPROVED                      │
   │  ├── Nếu nhiều KH → PENDING_VERIFICATION (dropdown)         │
   │  └── Chờ nhân viên chọn                                     │
   │                                                              │
   │  Priority 4: Không match được                                │
   │  ├── PENDING_VERIFICATION                                    │
   │  └── Chờ nhân viên nhập tay SĐT                             │
   │                                                              │
   └─────────────────────────────────────────────────────────────┘

4. Giao dịch hiển thị trên Balance History:
   - Zone "TỰ ĐỘNG GÁN": Các giao dịch auto-match (65%)
   - Zone "NHẬP TAY": Các giao dịch cần xử lý thủ công (35%)
```

**Output:** Giao dịch được gán cho khách hàng

---

### 4.3 Luồng 3: Nhân Viên Match Giao Dịch (Live Mode)

**Trigger:** Giao dịch mới xuất hiện trên Balance History

**Actors:** Nhân viên xử lý cọc

**Flow:**
```
CASE 1: Giao dịch TỰ ĐỘNG GÁN (65%)
────────────────────────────────────
1. Giao dịch xuất hiện ở zone "TỰ ĐỘNG GÁN"
2. Nhân viên nhìn thấy: +500k - Nguyễn Văn A - 0987654321 - QR ✓
3. Nhân viên tìm phiếu giấy tương ứng
4. Click "Đã xác nhận" → Giao dịch chuyển sang zone "Đã xác nhận" (ẩn)
5. Đưa phiếu giấy cho Bộ phận đặt hàng

CASE 2: Giao dịch cần NHẬP TAY - Nhiều KH khớp (15%)
────────────────────────────────────────────────────
1. Giao dịch xuất hiện ở zone "NHẬP TAY"
2. Hiển thị: +200k - "CK 57828" - [Trần B ▼] [Lê C] [Phạm D]
3. Nhân viên chọn đúng khách từ dropdown
4. Ngay khi chọn → Tự động chuyển sang "Đã xác nhận"
5. Tìm phiếu giấy và đưa cho Bộ phận đặt hàng

CASE 3: Giao dịch cần NHẬP TAY - Không match được (20%)
──────────────────────────────────────────────────────
1. Giao dịch xuất hiện ở zone "NHẬP TAY"
2. Hiển thị: +150k - "unknown content" - [_____Nhập SĐT_____]
3. Nhân viên nhập SĐT khách hàng
4. Hệ thống tự động fetch tên từ TPOS
5. Nhấn Enter/blur → Tự động chuyển sang "Đã xác nhận"
6. Tìm phiếu giấy và đưa cho Bộ phận đặt hàng

CHO PHÉP SỬA:
─────────────
- Giao dịch nhập tay trong "Đã xác nhận" có thể sửa lại
- Điều kiện: Chưa được kế toán duyệt
- Hiển thị icon ✏️ để sửa
```

**Output:** Giao dịch đã match + Phiếu giấy đưa cho BP đặt hàng

---

### 4.4 Luồng 4: Kế Toán Duyệt Giao Dịch

**Trigger:** Có giao dịch cần duyệt (nhập tay bởi nhân viên)

**Actors:** Kế toán

**Flow:**
```
1. Kế toán vào tab "Lịch sử GD"
2. Filter "Chờ duyệt" để xem các giao dịch cần duyệt
3. Với mỗi giao dịch:

   ┌─────────────────────────────────────────────────────────────┐
   │                    VERIFICATION WORKFLOW                      │
   ├─────────────────────────────────────────────────────────────┤
   │                                                              │
   │  DUYỆT (APPROVE):                                           │
   │  ├── Xác nhận giao dịch hợp lệ                              │
   │  ├── Tiền được cộng vào Ví ảo khách hàng                    │
   │  └── verification_status = APPROVED                          │
   │                                                              │
   │  THAY ĐỔI + DUYỆT:                                          │
   │  ├── Sửa SĐT/Tên khách hàng nếu sai                         │
   │  ├── Duyệt với thông tin mới                                │
   │  └── verification_status = APPROVED                          │
   │                                                              │
   │  TỪ CHỐI (REJECT):                                          │
   │  ├── Nhập lý do từ chối                                     │
   │  ├── Tiền KHÔNG được cộng vào Ví                            │
   │  └── verification_status = REJECTED                          │
   │                                                              │
   └─────────────────────────────────────────────────────────────┘

4. Ghi chú cho giao dịch (nếu cần)
5. Xử lý sai sót (nếu có):
   - Cộng/trừ manual vào công nợ
   - Ghi log đầy đủ
```

**Output:** Giao dịch đã duyệt/từ chối + Công nợ cập nhật

---

### 4.5 Luồng 5: Ra Đơn & Trừ Công Nợ

**Trigger:** Hàng về, sẵn sàng giao cho khách

**Actors:** Nhân viên (trên Orders-Report Tab1)

**Flow:**
```
1. Nhân viên mở Orders-Report (Tab1)
2. Tìm đơn hàng cần ra đơn
3. Kiểm tra số dư Ví ảo của khách

   ┌─────────────────────────────────────────────────────────────┐
   │                    RA ĐƠN WORKFLOW                            │
   ├─────────────────────────────────────────────────────────────┤
   │                                                              │
   │  KIỂM TRA:                                                   │
   │  ├── Số dư Ví ảo >= Tổng đơn? → Trừ từ Ví                   │
   │  ├── Số dư Ví ảo < Tổng đơn? → Trừ hết Ví + Thu COD phần   │
   │  │                              còn lại                      │
   │  └── Ví = 0? → Thu COD toàn bộ                              │
   │                                                              │
   │  TẠO PHIẾU BÁN HÀNG (PBH):                                  │
   │  ├── Chỉ tạo được từ Orders-Report (Tab1)                   │
   │  ├── TPOS bị khóa quyền tạo đơn                             │
   │  ├── Mỗi giao dịch chuyển khoản chỉ dùng 1 lần              │
   │  └── Sync tự động về TPOS                                    │
   │                                                              │
   │  CƠ CHẾ BẢO VỆ:                                              │
   │  ├── Giao dịch đã dùng không thể dùng lại                   │
   │  ├── Nếu trừ cho đơn A, không thể trừ cho đơn B             │
   │  ├── Khách thiếu tiền phải thu đủ → Có phản ánh nếu sai     │
   │  └── Audit trail đầy đủ                                      │
   │                                                              │
   └─────────────────────────────────────────────────────────────┘

4. Xác nhận ra đơn
5. In phiếu giao hàng
```

**Output:** Phiếu bán hàng + Công nợ đã trừ

---

### 4.6 Luồng 6: Kiểm Soát Viên Audit

**Trigger:** Định kỳ (daily/weekly) hoặc theo yêu cầu

**Actors:** Kiểm soát viên

**Flow:**
```
1. Kiểm soát viên vào tab "Kiểm soát"
2. Xem Dashboard tổng quan:
   - Tổng tiền vào (chuyển khoản)
   - Tổng tiền ra (trừ công nợ)
   - Số giao dịch chờ xác nhận
   - Số giao dịch có vấn đề

3. Kiểm tra từng hạng mục:

   ┌─────────────────────────────────────────────────────────────┐
   │                    AUDIT CHECKLIST                            │
   ├─────────────────────────────────────────────────────────────┤
   │                                                              │
   │  □ Tất cả giao dịch AUTO_APPROVED đúng                      │
   │  □ Tất cả giao dịch APPROVED bởi kế toán hợp lệ             │
   │  □ Không có giao dịch bị miss (so với bank statement)       │
   │  □ Không có giao dịch trùng lặp                             │
   │  □ Tổng công nợ khớp với tổng giao dịch                     │
   │  □ Các giao dịch cộng/trừ manual của kế toán hợp lý         │
   │                                                              │
   └─────────────────────────────────────────────────────────────┘

4. Xác nhận cuối cùng (nút "Xác nhận cuối cùng")
5. Ghi báo cáo audit
6. Xử lý nội bộ nếu phát hiện sai sót
```

**Output:** Báo cáo audit + Xác nhận dòng tiền

---

## 5. CƠ CHẾ KIỂM SOÁT TÀI CHÍNH

### 5.1 Financial Airlock (Khóa An Toàn Tài Chính)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FINANCIAL AIRLOCK ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────────┐                           ┌──────────────────┐           │
│   │                  │      ╔═══════════════╗    │                  │           │
│   │  Orders-Report   │◀═════╣   MASTER      ╠═══▶│      VÍ ẢO       │           │
│   │     (Tab1)       │      ║  Ra đơn       ║    │    (Theo SĐT)    │           │
│   │                  │      ║  Trừ tiền     ║    │                  │           │
│   └──────────────────┘      ╚═══════════════╝    └──────────────────┘           │
│            │                                              ▲                      │
│            │                                              │                      │
│            ▼                                              │                      │
│   ┌──────────────────┐      ╔═══════════════╗    ┌──────────────────┐           │
│   │                  │      ║   SLAVE       ║    │  Balance History │           │
│   │      TPOS        │◀═════╣   BỊ KHÓA     ╠═══▶│   (Cộng tiền)    │           │
│   │  (Nhận lệnh)     │      ║  quyền tạo đơn║    │                  │           │
│   │                  │      ╚═══════════════╝    └──────────────────┘           │
│   └──────────────────┘                                    ▲                      │
│                                                           │                      │
│                                              ╔════════════╧════════════╗         │
│                                              ║   SePay Webhook         ║         │
│                                              ║   (Nguồn duy nhất)      ║         │
│                                              ╚═════════════════════════╝         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Quy Tắc Một Giao Dịch Một Đơn

```
RULE: Mỗi giao dịch chuyển khoản chỉ được sử dụng MỘT LẦN

Ví dụ:
- Giao dịch #123: +500,000đ từ 0987654321
- Được gán cho Đơn #A001 → Trừ 500,000đ
- KHÔNG THỂ dùng lại cho Đơn #B002

Hậu quả nếu vi phạm:
- Khách B sẽ thiếu tiền → Phải thu đủ → Có phản ánh
- Audit phát hiện → Xử lý nội bộ
```

### 5.3 Cơ Chế Audit Trail

| Event | Log Content | Actor |
|-------|-------------|-------|
| Giao dịch vào | Amount, content, timestamp, sepay_id | System |
| Auto match | Transaction ID, Customer, Match method | System |
| Manual match | Transaction ID, Customer, Matched by | Employee |
| Approve | Transaction ID, Approved by, Timestamp | Accountant |
| Reject | Transaction ID, Reason, Rejected by | Accountant |
| Ra đơn | Order ID, Transaction IDs used, Amount | Employee |
| Manual adjustment | Customer, Amount (+/-), Reason | Accountant |

---

## 6. MA TRẬN PHÂN QUYỀN

### 6.1 Permission Matrix

| Action | NV Comment | NV Cọc | Kế Toán | Kiểm Soát | Admin |
|--------|:----------:|:------:|:-------:|:---------:|:-----:|
| Xem comment/tạo đơn TPOS | ✅ | ❌ | ❌ | ❌ | ✅ |
| In phiếu giấy | ✅ | ❌ | ❌ | ❌ | ✅ |
| Xem Balance History Live | ❌ | ✅ | ✅ | ✅ | ✅ |
| Match giao dịch (chọn/nhập) | ❌ | ✅ | ✅ | ❌ | ✅ |
| Xác nhận đã đưa phiếu | ❌ | ✅ | ❌ | ❌ | ✅ |
| Sửa giao dịch nhập tay | ❌ | ✅ | ✅ | ❌ | ✅ |
| Duyệt giao dịch | ❌ | ❌ | ✅ | ❌ | ✅ |
| Từ chối giao dịch | ❌ | ❌ | ✅ | ❌ | ✅ |
| Cộng/trừ công nợ manual | ❌ | ❌ | ✅ | ❌ | ✅ |
| Xem tab Kiểm soát | ❌ | ❌ | ✅ | ✅ | ✅ |
| Xác nhận cuối cùng | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ra đơn (Tab1) | ✅ | ✅ | ❌ | ❌ | ✅ |
| Trừ công nợ từ Ví | ✅ | ✅ | ❌ | ❌ | ✅ |

### 6.2 TPOS Permissions (Bị Khóa)

| Action | Status |
|--------|--------|
| Tạo đơn hàng mới | 🔒 KHÓA |
| Tạo phiếu bán hàng | 🔒 KHÓA |
| Chỉnh sửa công nợ trực tiếp | 🔒 KHÓA |
| Xem đơn hàng | ✅ Cho phép |
| Xem khách hàng | ✅ Cho phép |

---

## 7. QUY TẮC NGHIỆP VỤ (Business Rules)

### 7.1 Quy Tắc Xác Định Khách Cần Cọc

```
BR-001: ĐIỀU KIỆN CẦN CỌC
─────────────────────────
Khách CẦN CỌC nếu thỏa MỘT TRONG các điều kiện:
  1. Khách mới (chưa có trong hệ thống)
  2. Khách chưa có SĐT
  3. Khách chưa có địa chỉ
  4. Khách có tag "Khách lạ"
  5. Khách có status "Boom hàng"

Khách KHÔNG CẦN CỌC nếu:
  - Khách cũ TỐT (có SĐT, địa chỉ, không boom)
```

### 7.2 Quy Tắc Auto-Match

```
BR-002: ĐỘ ƯU TIÊN MATCH
────────────────────────
Priority 1: QR Code (N2 + 16 chars)
  → verification_status = AUTO_APPROVED
  → match_method = qr_code

Priority 2: SĐT đầy đủ 10 số
  → verification_status = AUTO_APPROVED
  → match_method = exact_phone

Priority 3: SĐT một phần >= 5 số, 1 KH duy nhất
  → verification_status = AUTO_APPROVED
  → match_method = single_match

Priority 4: SĐT một phần >= 5 số, nhiều KH
  → verification_status = PENDING_VERIFICATION
  → match_method = pending_match
  → Hiển thị dropdown cho nhân viên chọn

Priority 5: Không match được
  → verification_status = PENDING_VERIFICATION
  → Hiển thị input cho nhân viên nhập SĐT
```

### 7.3 Quy Tắc Cộng Ví

```
BR-003: ĐIỀU KIỆN CỘNG VÍ
─────────────────────────
Tiền được cộng vào Ví ảo KHI:
  1. verification_status = AUTO_APPROVED (tự động)
  2. verification_status = APPROVED (kế toán duyệt)

Tiền KHÔNG được cộng vào Ví KHI:
  1. verification_status = PENDING_VERIFICATION
  2. verification_status = REJECTED
```

### 7.4 Quy Tắc Trừ Công Nợ

```
BR-004: ĐIỀU KIỆN TRỪ CÔNG NỢ
─────────────────────────────
1. Chỉ được trừ từ Orders-Report (Tab1)
2. Mỗi giao dịch chỉ dùng 1 lần
3. Trừ theo thứ tự: Ví ảo trước, COD sau
4. Nếu Ví < Tổng đơn → Thu COD phần còn lại
```

### 7.5 Quy Tắc Sửa Giao Dịch

```
BR-005: ĐIỀU KIỆN SỬA GIAO DỊCH NHẬP TAY
────────────────────────────────────────
Nhân viên có thể sửa giao dịch nhập tay KHI:
  1. verification_status != APPROVED
  2. verification_status != REJECTED
  3. match_method = manual_entry

Không thể sửa KHI:
  1. Đã được kế toán duyệt
  2. Đã được kế toán từ chối
  3. Là giao dịch auto-match (QR, exact phone...)
```

---

## 8. CÁC TRƯỜNG HỢP NGOẠI LỆ

### 8.1 Khách Chuyển Khoản Sai Nội Dung

```
Tình huống: Khách chuyển nhưng không ghi đúng cú pháp QR/SĐT
Xử lý:
  1. Giao dịch vào zone "NHẬP TAY"
  2. Nhân viên hỏi khách để xác nhận
  3. Nhập SĐT thủ công
  4. Kế toán duyệt trước khi cộng ví
```

### 8.2 Nhân Viên Match Sai

```
Tình huống: Nhân viên gán nhầm giao dịch cho khách khác
Xử lý:
  1. Nếu chưa được kế toán duyệt → Nhân viên tự sửa
  2. Nếu đã được kế toán duyệt:
     a. Kế toán thực hiện điều chỉnh manual
     b. Trừ tiền từ khách sai
     c. Cộng tiền cho khách đúng
     d. Ghi log đầy đủ
```

### 8.3 Giao Dịch Bị Miss (Không Nhận Được Webhook)

```
Tình huống: Giao dịch có trên bank statement nhưng không có trong hệ thống
Xử lý:
  1. Kiểm soát viên phát hiện trong audit
  2. Sử dụng tính năng "Phát hiện giao dịch thiếu"
  3. Thêm giao dịch thủ công
  4. Kế toán duyệt
```

### 8.4 Giao Dịch Trùng Lặp

```
Tình huống: Một giao dịch xuất hiện 2 lần
Xử lý:
  1. Hệ thống check sepay_id (unique)
  2. Nếu trùng → Reject bản sau
  3. Nếu do lỗi → Kế toán từ chối bản thừa
```

### 8.5 Khách Đã Cọc Nhưng Hết Hàng

```
Tình huống: Khách đã cọc nhưng NCC hết hàng, không ship được
Xử lý:
  1. Hủy đơn hàng
  2. Tiền vẫn trong Ví ảo của khách
  3. Khách có thể dùng cho đơn khác hoặc yêu cầu hoàn
  4. Nếu hoàn: Kế toán thực hiện điều chỉnh manual
```

---

## 9. METRICS & KPIs

### 9.1 Performance Metrics

| Metric | Hiện tại | Mục tiêu | Đơn vị |
|--------|----------|----------|--------|
| Thời gian match thủ công | 40s | <15s | giây/giao dịch |
| Tỷ lệ auto-match | 65% | >80% | % |
| SSE reliability | N/A | 99.9% | % |
| Context switching | 3 tabs | 1 zone | số lần |

### 9.2 Business Metrics

| Metric | Target | Đơn vị |
|--------|--------|--------|
| Đơn hết live chưa cọc (bị hủy) | <5% | % |
| Thời gian từ cọc → đặt NCC | <5 phút | phút |
| Giao dịch match sai | 0 | số lượng |
| Giao dịch bị miss | 0 | số lượng |

### 9.3 Audit Metrics

| Metric | Target | Frequency |
|--------|--------|-----------|
| Chênh lệch bank statement | 0đ | Daily |
| Giao dịch chờ duyệt quá 24h | 0 | Daily |
| Công nợ âm bất thường | Alert | Realtime |

---

## 10. APPENDIX: DATA DICTIONARY

### 10.1 Trạng Thái Xác Minh (verification_status)

| Value | Mô tả | Cộng Ví? |
|-------|-------|----------|
| `AUTO_APPROVED` | Tự động duyệt (QR/exact phone) | ✅ Có |
| `PENDING_VERIFICATION` | Chờ kế toán duyệt | ❌ Không |
| `APPROVED` | Kế toán đã duyệt | ✅ Có |
| `REJECTED` | Kế toán từ chối | ❌ Không |

### 10.2 Phương Thức Match (match_method)

| Value | Mô tả |
|-------|-------|
| `qr_code` | Match từ QR code (N2...) |
| `exact_phone` | Match chính xác 10 số SĐT |
| `single_match` | Tự động match 1 KH duy nhất |
| `pending_match` | NV chọn từ dropdown |
| `manual_entry` | NV nhập SĐT thủ công |
| `manual_link` | Kế toán gán tay |

### 10.3 Trạng Thái Khách Hàng (Partner Status)

| Value | Mô tả | Cần cọc? |
|-------|-------|----------|
| Bình thường | Khách bình thường | Tùy điều kiện |
| Khách sỉ | Khách mua sỉ | ❌ |
| VIP | Khách VIP | ❌ |
| Thân thiết | Khách quen | ❌ |
| Cảnh báo | Cần chú ý | ⚠️ Xem xét |
| Nguy hiểm | Đã có vấn đề | ✅ Bắt buộc |
| Bom hàng | Đã boom | ✅ Bắt buộc |

### 10.4 Tags Quan Trọng

| Tag | Mô tả | Cần cọc? |
|-----|-------|----------|
| Khách lạ | Khách mới, chưa xác minh | ✅ |
| Cọc | Đơn cần cọc | ✅ |
| Đã cọc | Khách đã cọc | ❌ |
| GIỎ TRỐNG | Đơn không có sản phẩm | N/A |

---

## DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2025 | BA Team | Initial version |

---

**END OF DOCUMENT**
