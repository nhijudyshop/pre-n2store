# Quy Trình Quản Lý Người Dùng & Phân Quyền

> **Tài liệu phi kỹ thuật** - Mô tả flow và quy trình nghiệp vụ

---

## 1. Tổng Quan Hệ Thống

### 1.1 Mục Đích
Hệ thống quản lý người dùng cho phép:
- Tạo, sửa, xóa tài khoản nhân viên
- Phân quyền chi tiết cho từng trang/chức năng
- Áp dụng mẫu quyền (templates) cho nhiều người dùng cùng lúc
- Kiểm soát truy cập vào các module của hệ thống

### 1.2 Ai Có Quyền Truy Cập?
Chỉ những người dùng có quyền `user-management` mới có thể:
- Xem danh sách người dùng
- Tạo/sửa/xóa tài khoản
- Phân quyền cho người khác

---

## 2. Các Vai Trò (Role Templates)

Hệ thống có **7 mẫu quyền** sẵn có:

| Vai Trò | Mô Tả | Phạm Vi Quyền |
|---------|-------|---------------|
| **Admin** | Toàn quyền | Tất cả chức năng trong hệ thống |
| **Manager** | Quản lý | Hầu hết quyền, trừ xóa user và khôi phục lịch sử |
| **Sales Team** | Nhóm bán hàng | Bán hàng, đơn hàng, xem báo cáo (không xóa) |
| **Warehouse Team** | Nhóm kho | Quản lý kho, xem đơn hàng và báo cáo |
| **Staff** | Nhân viên | Xem và chỉnh sửa cơ bản (không xóa, không admin) |
| **Viewer** | Chỉ xem | Chỉ có quyền xem, không thao tác |
| **Custom** | Tùy chỉnh | Quyền được cấu hình riêng từng mục |

---

## 3. Quy Trình Tạo Người Dùng Mới

```
┌─────────────────────────────────────────────────────────────┐
│                    QUY TRÌNH TẠO USER                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ 1. Nhập thông   │
                    │    tin cơ bản   │
                    │  - Username     │
                    │  - Password     │
                    │  - Tên hiển thị │
                    │  - Mã định danh │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ 2. Chọn mẫu     │
                    │    quyền        │
                    │ (hoặc Custom)   │
                    └────────┬────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │ Dùng mẫu sẵn:   │             │ Tùy chỉnh:      │
    │ - Admin         │             │ Chọn từng quyền │
    │ - Manager       │             │ cho từng trang  │
    │ - Sales Team    │             │                 │
    │ - v.v.          │             │                 │
    └────────┬────────┘             └────────┬────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ 3. Xác nhận     │
                    │    tạo user     │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ 4. Password     │
                    │    được mã hóa  │
                    │    an toàn      │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ 5. User được    │
                    │    lưu vào hệ   │
                    │    thống        │
                    └─────────────────┘
```

### Lưu ý quan trọng:
- **Username**: Chỉ chấp nhận chữ thường, số và dấu gạch dưới
- **Password**: Tối thiểu 6 ký tự, được mã hóa PBKDF2
- **Mẫu quyền**: Áp dụng ngay khi chọn, có thể tùy chỉnh thêm

---

## 4. Quy Trình Phân Quyền

### 4.1 Cấu Trúc Quyền

```
┌─────────────────────────────────────────────────────────────┐
│                    CẤU TRÚC PHÂN QUYỀN                      │
└─────────────────────────────────────────────────────────────┘

Nhóm Trang (Category)
    │
    ├── Trang 1 (Page)
    │       │
    │       ├── Quyền xem (view)
    │       ├── Quyền tạo mới (create)
    │       ├── Quyền chỉnh sửa (edit)
    │       ├── Quyền xóa (delete)
    │       └── Quyền xuất dữ liệu (export)
    │
    ├── Trang 2 (Page)
    │       │
    │       └── [Các quyền tương ứng...]
    │
    └── ...
```

### 4.2 Các Nhóm Trang

| Nhóm | Màu | Các Trang |
|------|-----|-----------|
| **Bán Hàng & Livestream** | Xanh lá | Hình Ảnh Live, Báo Cáo Livestream, Sản Phẩm Livestream, Check Inbox |
| **Kho & Nhận Hàng** | Cam | Cân Nặng Hàng, Theo Dõi Nhập Hàng, Hàng Rớt-Xả, Hàng Hoàn, Tìm Kiếm SP, Số Lượng Live |
| **Đơn Hàng & Thanh Toán** | Tím | Thông Tin CK, Quản Lý Order, Sổ Order, Sổ Order Live |
| **Báo Cáo & Thống Kê** | Tím đậm | Báo Cáo Sale-Online, Tpos-Pancake |
| **Quản Trị Hệ Thống** | Đỏ | Quản Lý User, Lịch Sử Số Dư, Customer 360, CSKH, So Sánh Đơn Hàng, Lịch Sử Chỉnh Sửa |

### 4.3 Nguyên Tắc Truy Cập Trang

**Người dùng có thể truy cập một trang khi:**
- Có ít nhất 1 quyền chi tiết của trang đó được bật

**Ví dụ:**
- User A có quyền `live.view = true` → Có thể truy cập trang Hình Ảnh Live
- User B không có quyền nào của `live` → Không thể truy cập trang Hình Ảnh Live

---

## 5. Quy Trình Đăng Nhập & Kiểm Tra Quyền

```
┌─────────────────────────────────────────────────────────────┐
│                    QUY TRÌNH ĐĂNG NHẬP                      │
└─────────────────────────────────────────────────────────────┘

User nhập Username + Password
           │
           ▼
┌──────────────────────┐
│ Kiểm tra thông tin   │
│ đăng nhập            │
└──────────┬───────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
  Đúng        Sai → Từ chối
     │
     ▼
┌──────────────────────┐
│ Lưu phiên đăng nhập  │
│ - detailedPermissions│
│ - roleTemplate       │
│ - thông tin user     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Chuyển hướng trang   │
│ mặc định (Live)      │
└──────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│              KIỂM TRA QUYỀN KHI TRUY CẬP TRANG              │
└─────────────────────────────────────────────────────────────┘

User truy cập trang X
           │
           ▼
┌──────────────────────┐
│ Kiểm tra đã đăng     │
│ nhập chưa?           │
└──────────┬───────────┘
           │
     ┌─────┴─────┐
     │           │
  Chưa        Rồi
     │           │
     ▼           ▼
Chuyển về   ┌──────────────────────┐
trang       │ Kiểm tra có quyền    │
đăng nhập   │ truy cập trang X?    │
            └──────────┬───────────┘
                       │
                 ┌─────┴─────┐
                 │           │
              Không         Có
                 │           │
                 ▼           ▼
           Hiển thị    ┌──────────────────────┐
           "Truy cập   │ Cho phép truy cập    │
           bị từ chối" │ Hiển thị nội dung    │
                       │ theo quyền chi tiết  │
                       └──────────────────────┘
```

---

## 6. Quy Trình Áp Dụng Mẫu Quyền Hàng Loạt

```
┌─────────────────────────────────────────────────────────────┐
│                  ÁP DỤNG TEMPLATE HÀNG LOẠT                 │
└─────────────────────────────────────────────────────────────┘

1. Chọn nhiều user (tick checkbox)
           │
           ▼
2. Nhấn "Áp dụng Template"
           │
           ▼
3. Chọn template muốn áp dụng
   (Admin, Manager, Sales Team, v.v.)
           │
           ▼
4. Xác nhận thay đổi
           │
           ▼
5. Hệ thống cập nhật quyền cho tất cả
   user đã chọn cùng lúc
           │
           ▼
6. Ghi nhận người cập nhật và thời gian
```

**Lưu ý quan trọng:**
- Áp dụng template sẽ **GHI ĐÈ TOÀN BỘ** quyền hiện tại
- Thao tác không thể hoàn tác
- Nên xem lại quyền sau khi áp dụng

---

## 7. Các Quyền Chi Tiết Theo Trang

### 7.1 Trang Hình Ảnh Live (`live`)
| Quyền | Mô Tả |
|-------|-------|
| `view` | Xem danh sách hình ảnh live |
| `upload` | Tải lên hình ảnh mới |
| `edit` | Sửa thông tin hình ảnh |
| `delete` | Xóa hình ảnh khỏi hệ thống |

### 7.2 Trang Quản Lý User (`user-management`)
| Quyền | Mô Tả |
|-------|-------|
| `view` | Xem danh sách tài khoản |
| `create` | Tạo user mới |
| `edit` | Chỉnh sửa thông tin user |
| `delete` | Xóa user khỏi hệ thống |
| `permissions` | Cấp/thu hồi quyền |
| `resetPassword` | Đặt lại mật khẩu user |
| `manageTemplates` | Quản lý các mẫu phân quyền |

### 7.3 Trang Lịch Sử Số Dư (`balance-history`)
| Quyền | Mô Tả |
|-------|-------|
| `view` | Xem biến động số dư |
| `viewDetails` | Xem chi tiết giao dịch |
| `export` | Export lịch sử |
| `adjust` | Điều chỉnh số dư |
| `resolveMatch` | Chọn KH từ danh sách nhiều SĐT khớp |
| `skipMatch` | Bỏ qua khi không khớp KH |
| `undoSkip` | Hoàn tác các match đã bỏ qua |
| `viewVerificationQueue` | Xem danh sách chờ duyệt |
| `approveTransaction` | Duyệt giao dịch và cộng tiền vào ví |
| `rejectTransaction` | Từ chối giao dịch không hợp lệ |
| `createWalletAdjustment` | Tạo điều chỉnh ví |
| `manualTransactionEntry` | Nhập giao dịch thủ công |

### 7.4 Trang CSKH (`issue-tracking`)
| Quyền | Mô Tả |
|-------|-------|
| `view` | Xem danh sách sự vụ |
| `create` | Tạo sự vụ mới |
| `edit` | Chỉnh sửa thông tin sự vụ |
| `delete` | Xóa sự vụ |
| `searchOrder` | Tìm kiếm đơn hàng |
| `processRefund` | Xử lý hoàn tiền |
| `receiveGoods` | Xác nhận nhận hàng hoàn |
| `updateStatus` | Cập nhật trạng thái sự vụ |
| `viewFinance` | Xem thông tin tài chính |
| `export` | Export danh sách sự vụ |
| `issueVirtualCredit` | Cấp công nợ ảo cho khách |

*(Xem đầy đủ trong file TECHNICAL.md)*

---

## 8. Các Quy Tắc An Toàn

### 8.1 Bảo Vệ Admin Cuối Cùng
- Hệ thống **KHÔNG CHO PHÉP** xóa admin cuối cùng
- Luôn phải có ít nhất 1 admin trong hệ thống

### 8.2 Mật Khẩu
- Mật khẩu được mã hóa bằng thuật toán PBKDF2
- Mỗi user có salt riêng biệt
- Không lưu mật khẩu dạng thuần (plain text)

### 8.3 Phiên Đăng Nhập
- Phiên thường: 8 giờ
- Phiên "Ghi nhớ đăng nhập": 30 ngày
- Hết phiên → Tự động đăng xuất

### 8.4 Ghi Nhận Thay Đổi
Mọi thay đổi đều được ghi nhận:
- `createdAt` / `createdBy`: Thời điểm và người tạo
- `updatedAt` / `updatedBy`: Thời điểm và người cập nhật cuối

---

## 9. Sơ Đồ Tổng Quan Hệ Thống

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HỆ THỐNG N2STORE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────┐   │
│  │   Firebase  │     │  Auth Manager   │     │   Navigation Manager    │   │
│  │  Firestore  │◀───▶│   (Xác thực)    │◀───▶│   (Menu động theo      │   │
│  │  (Database) │     │                 │     │    quyền user)          │   │
│  └─────────────┘     └────────┬────────┘     └─────────────────────────┘   │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Permissions Registry                              │   │
│  │           (Định nghĩa tất cả trang và quyền chi tiết)               │   │
│  │                                                                      │   │
│  │  • PAGES_REGISTRY: 20 trang                                         │   │
│  │  • PERMISSION_TEMPLATES: 7 mẫu quyền                                │   │
│  │  • Tổng cộng: ~100 quyền chi tiết                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                             │
│                               ▼                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                         CÁC MODULE                                  │    │
│  │                                                                     │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │    │
│  │  │   Live   │ │   Kho    │ │  Order   │ │ Báo Cáo  │ │  Admin   │ │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Câu Hỏi Thường Gặp (FAQ)

### Q: Tôi không truy cập được một trang, tại sao?
**A:** Bạn cần có ít nhất 1 quyền chi tiết của trang đó. Liên hệ Admin để được cấp quyền.

### Q: Tại sao tôi không thể xóa một user?
**A:** Có thể do:
1. Bạn không có quyền `delete` trong user-management
2. Đó là admin cuối cùng (hệ thống bảo vệ)

### Q: Làm sao để cấp quyền giống nhau cho nhiều người?
**A:** Dùng tính năng "Áp dụng Template hàng loạt":
1. Tick chọn các user cần cập nhật
2. Nhấn "Áp dụng Template"
3. Chọn template mong muốn
4. Xác nhận

### Q: Tôi quên mật khẩu, làm sao?
**A:** Liên hệ người có quyền `resetPassword` trong user-management để đặt lại mật khẩu.

---

*Cập nhật lần cuối: Tháng 1/2026*
