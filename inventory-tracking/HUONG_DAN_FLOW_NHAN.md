# Hướng Dẫn Chi Tiết: Trang Theo Dõi Nhập Hàng SL
## (Mô tả ngữ nghĩa - không code)

> **URL**: https://nhijudyshop.github.io/n2store/inventory-tracking/index.html  
> **Tiêu đề**: Theo Dõi Nhập Hàng SL  
> **Ngày tạo**: 2025-12-28

---

## Mục Lục

1. [Tổng Quan Trang](#1-tổng-quan-trang)
2. [Cấu Trúc Giao Diện](#2-cấu-trúc-giao-diện)
3. [Flow Xác Thực và Khởi Tạo](#3-flow-xác-thực-và-khởi-tạo)
4. [Tab 1: Theo Dõi Đợt Hàng](#4-tab-1-theo-dõi-đợt-hàng)
5. [Tab 2: Quản Lý Công Nợ](#5-tab-2-quản-lý-công-nợ)
6. [Hệ Thống Phân Quyền](#6-hệ-thống-phân-quyền)
7. [Tính Năng Bổ Sung](#7-tính-năng-bổ-sung)

---

## 1. Tổng Quan Trang

### 1.1 Mục Đích Sử Dụng

Trang **Theo Dõi Nhập Hàng SL** được thiết kế để quản lý toàn bộ quy trình nhập hàng từ nhà cung cấp. Trang này phục vụ hai nhóm người dùng chính:

- **Nhân viên vận hành**: Theo dõi các đợt hàng nhập, kiểm tra hóa đơn, đánh dấu món thiếu
- **Quản lý/Admin**: Kiểm soát chi phí, theo dõi công nợ với nhà cung cấp

### 1.2 Chức Năng Chính

Trang cung cấp hai nhóm chức năng được tổ chức thành hai tab riêng biệt:

| Tab | Tên | Chức năng |
|-----|-----|-----------|
| Tab 1 | Theo dõi đợt hàng | Quản lý danh sách đợt hàng, hóa đơn, kiểm đếm số món |
| Tab 2 | Quản lý công nợ | Theo dõi thanh toán, chi phí, số dư với nhà cung cấp |

### 1.3 Nguồn Dữ Liệu

Tất cả dữ liệu được lưu trữ trên **Firebase Firestore** với các bộ sưu tập (collection) riêng biệt cho:
- Đợt hàng (shipments)
- Thanh toán trước (prepayments)
- Chi phí khác (other expenses)
- Lịch sử chỉnh sửa (edit history)
- Thông tin người dùng và quyền

---

## 2. Cấu Trúc Giao Diện

### 2.1 Bố Cục Tổng Thể

Trang được chia thành các vùng giao diện sau:

1. **Header**: Tiêu đề trang và nút đăng xuất
2. **Thanh tab**: Điều hướng giữa Tab 1 và Tab 2
3. **Bộ lọc**: Các ô lọc theo ngày, nhà cung cấp, mã sản phẩm
4. **Nút hành động**: Thêm mới, xuất Excel
5. **Bảng dữ liệu**: Hiển thị danh sách đợt hàng hoặc giao dịch
6. **Các modal**: Cửa sổ popup để thêm/sửa thông tin

### 2.2 Các Thành Phần Modal

Trang sử dụng nhiều modal khác nhau để xử lý các tác vụ:

| Modal | Chức năng |
|-------|-----------|
| Modal đợt hàng | Thêm mới hoặc chỉnh sửa thông tin đợt hàng |
| Modal thanh toán trước | Ghi nhận khoản thanh toán cho nhà cung cấp |
| Modal chi phí khác | Ghi nhận các chi phí phát sinh |
| Modal số món thiếu | Cập nhật số lượng món hàng thiếu |
| Modal chi tiết hóa đơn | Xem chi tiết các hóa đơn theo ngày |
| Modal chi tiết chi phí ship | Xem chi tiết chi phí vận chuyển |

---

## 3. Flow Xác Thực và Khởi Tạo

### 3.1 Quy Trình Khi Tải Trang

Khi người dùng truy cập trang, hệ thống thực hiện các bước sau theo trình tự:

```
Bước 1: Tải trang
    ↓
Bước 2: Kiểm tra trạng thái đăng nhập
    ↓
Bước 3: (Nếu chưa đăng nhập) → Chuyển hướng về trang login
    ↓
Bước 3: (Nếu đã đăng nhập) → Tải quyền người dùng từ Firestore
    ↓
Bước 4: Thiết lập giao diện dựa trên quyền
    ↓
Bước 5: Tải dữ liệu đợt hàng
    ↓
Bước 6: Áp dụng bộ lọc mặc định (30 ngày gần nhất)
    ↓
Bước 7: Hiển thị bảng dữ liệu
```

### 3.2 Cơ Chế Xác Thực

Hệ thống hỗ trợ hai chế độ đăng nhập:

**Chế độ phiên (Session)**
- Thông tin đăng nhập lưu trong bộ nhớ phiên
- Hết hạn sau **8 tiếng** không sử dụng
- Phù hợp cho máy tính công cộng

**Chế độ ghi nhớ (Remember Me)**
- Thông tin đăng nhập lưu trong bộ nhớ cục bộ
- Hết hạn sau **30 ngày**
- Phù hợp cho thiết bị cá nhân

### 3.3 Thiết Lập Bộ Lọc Mặc Định

Khi khởi tạo, hệ thống tự động thiết lập:
- **Ngày từ**: 30 ngày trước ngày hiện tại
- **Ngày đến**: Ngày hiện tại
- **Nhà cung cấp**: Tất cả
- **Mã sản phẩm**: Trống (hiển thị tất cả)

---

## 4. Tab 1: Theo Dõi Đợt Hàng

### 4.1 Khái Niệm "Đợt Hàng"

Một **đợt hàng** đại diện cho một lần nhập hàng từ nhà cung cấp, bao gồm các thông tin:

**Thông tin cơ bản**
- Ngày đi hàng: Ngày hàng được gửi từ nhà cung cấp
- Kiện hàng: Mã định danh các kiện hàng (ví dụ: K1, K2, K3)

**Thông tin hóa đơn**
- Danh sách hóa đơn từ một hoặc nhiều nhà cung cấp
- Mỗi hóa đơn có: ảnh chụp hóa đơn, danh sách sản phẩm, tổng tiền

**Thông tin kiểm đếm**
- Tổng số món hàng dự kiến
- Số món bị thiếu (nếu có)

**Thông tin chi phí (chỉ Admin)**
- Chi phí hàng về (ship nội địa, phụ phí...)
- Ghi chú nội bộ của admin

### 4.2 Modal Hóa Đơn Phụ (Chi Tiết Hóa Đơn)

Khi nhấn vào một hóa đơn trong bảng đợt hàng, hệ thống hiển thị popup **"Hóa Đơn Phụ"** với đầy đủ thông tin chi tiết.

#### Thông Tin Hiển Thị Trong Modal

**Header Modal**
- Tiêu đề: "Hóa Đơn Phụ - NCC [Số]" (ví dụ: "Hóa Đơn Phụ - NCC 23")
- Nút đóng (X) ở góc phải

**Phần Thông Tin Tổng Quan**

| Mục | Mô tả | Ví dụ |
|-----|-------|-------|
| Tiền HĐ | Tổng số tiền của hóa đơn này | 480 ¥ |
| Tổng món | Số lượng món hàng trong hóa đơn | 20 |
| Ghi chú | Thông tin bổ sung về đơn hàng | Khách hàng, nhân viên phụ trách, lưu ý chất lượng |
| Ảnh | Link xem ảnh hóa đơn gốc | "1 ảnh (click để xem)" |

**Bảng Chi Tiết Sản Phẩm**

Bảng liệt kê tất cả sản phẩm trong hóa đơn:

| Cột | Mô tả |
|-----|-------|
| STT | Số thứ tự sản phẩm trong hóa đơn |
| Chi Tiết Sản Phẩm | Mô tả đầy đủ sản phẩm bao gồm: mã sản phẩm, tên, màu sắc, số lượng |

**Dòng Tổng Kết**
- Hiển thị tổng số món và tổng tiền hóa đơn
- Ví dụ: "TỔNG: 20 món - 480 ¥"

#### Ví Dụ Nội Dung Hóa Đơn Phụ

```
┌────────────────────────────────────────────────────────────┐
│           Hóa Đơn Phụ - NCC 23                       [X]   │
├────────────────────────────────────────────────────────────┤
│  Tiền HĐ: 480 ¥                                            │
│  Tổng món: 20                                              │
│  Ghi chú: Khách hàng: Hà Tường Nhi, Nhân viên: Quản trị    │
│           viên. Ghi chú: Nếu có vấn đề chất lượng, vui     │
│           lòng đổi trong vòng 7 ngày.                      │
│  Ảnh: 1 ảnh (click để xem)                                 │
├────────────────────────────────────────────────────────────┤
│  STT  │  Chi Tiết Sản Phẩm                                 │
├───────┼────────────────────────────────────────────────────┤
│   1   │  MA 1082 Áo đính đá cao cấp màu Lý Uyên Quần       │
│       │  MAU Trắng SL 5                                    │
├───────┼────────────────────────────────────────────────────┤
│   2   │  MA 1082 Áo đính đá cao cấp màu Lý Uyên Quần       │
│       │  MAU Đen SL 10                                     │
├───────┼────────────────────────────────────────────────────┤
│   3   │  MA 1082 Áo đính đá cao cấp màu Lý Uyên Quần       │
│       │  MAU Mơ SL 5                                       │
├───────┴────────────────────────────────────────────────────┤
│  TỔNG: 20 món - 480 ¥                                      │
└────────────────────────────────────────────────────────────┘
```

#### Flow Mở Modal Hóa Đơn Phụ

```
1. Người dùng nhấn vào dòng hóa đơn trong bảng đợt hàng
    ↓
2. Hệ thống lấy thông tin hóa đơn từ dữ liệu đợt hàng
    ↓
3. Xác định số thứ tự NCC từ hóa đơn
    ↓
4. Trích xuất danh sách sản phẩm và tính tổng
    ↓
5. Render modal với đầy đủ thông tin:
    ├── Tiêu đề với mã NCC
    ├── Thông tin tổng quan (tiền, số món, ghi chú)
    ├── Link xem ảnh hóa đơn
    └── Bảng chi tiết sản phẩm
    ↓
6. Hiển thị modal
```

#### Cấu Trúc Dữ Liệu Chi Tiết Sản Phẩm

Mỗi sản phẩm trong hóa đơn chứa các thông tin:

| Trường | Mô tả | Ví dụ |
|--------|-------|-------|
| Mã sản phẩm | Mã định danh sản phẩm | MA 1082 |
| Tên sản phẩm | Tên đầy đủ của sản phẩm | Áo đính đá cao cấp màu Lý Uyên Quần |
| Màu sắc | Màu của sản phẩm | Trắng, Đen, Mơ |
| Số lượng | Số lượng đặt hàng | SL 5, SL 10 |
| Đơn giá | Giá mỗi đơn vị (nếu có) | - |
| Thành tiền | Số lượng × Đơn giá (nếu có) | - |

#### Tính Năng Bổ Sung Trong Modal

**Xem Ảnh Hóa Đơn**
- Nhấn vào link "X ảnh (click để xem)"
- Hình ảnh hóa đơn gốc được hiển thị trong lightbox
- Hỗ trợ zoom và tải ảnh về máy

**Ghi Chú Hóa Đơn**
- Hiển thị thông tin khách hàng liên quan
- Nhân viên phụ trách đơn hàng
- Các lưu ý đặc biệt (chính sách đổi trả, chất lượng...)

### 4.3 Các Chức Năng Tab 1

#### Xem Danh Sách Đợt Hàng

Bảng hiển thị các cột:
- STT: Số thứ tự
- Ngày đi hàng
- Kiện hàng
- Hóa đơn (với link xem ảnh)
- Tổng tiền hóa đơn
- Tổng số món
- Số món thiếu
- Chi phí hàng về *(ẩn với nhân viên)*
- Ghi chú Admin *(ẩn với nhân viên)*
- Thao tác (Sửa, Xóa)

#### Lọc Dữ Liệu

Người dùng có thể lọc theo:
- **Khoảng thời gian**: Từ ngày - Đến ngày
- **Nhà cung cấp (NCC)**: Lọc theo số thứ tự NCC từ hóa đơn
- **Mã sản phẩm**: Tìm kiếm theo mã hoặc tên sản phẩm

Bộ lọc hoạt động theo thời gian thực (khi gõ sẽ tự động lọc sau một khoảng ngắn).

#### Thêm Đợt Hàng Mới

Quy trình thêm đợt hàng:

```
1. Nhấn nút "Thêm đợt hàng"
    ↓
2. Modal hiển thị form nhập liệu
    ↓
3. Nhập thông tin: ngày đi hàng, kiện hàng
    ↓
4. Thêm từng hóa đơn: upload ảnh, nhập danh sách sản phẩm
    ↓
5. (Admin) Nhập chi phí hàng về, ghi chú
    ↓
6. Nhấn "Lưu"
    ↓
7. Dữ liệu được gửi lên Firestore
    ↓
8. Lịch sử thao tác được ghi nhận
    ↓
9. Bảng tự động cập nhật
```

#### Chỉnh Sửa Đợt Hàng

- Nhấn nút "Sửa" trên dòng đợt hàng cần chỉnh
- Modal hiển thị với dữ liệu đã có sẵn
- Chỉnh sửa các thông tin cần thiết
- Nhấn "Lưu" để cập nhật

#### Xóa Đợt Hàng

- Nhấn nút "Xóa" trên dòng đợt hàng
- Hộp thoại xác nhận hiển thị
- Xác nhận xóa → Dữ liệu bị xóa vĩnh viễn
- Lịch sử xóa được ghi nhận

#### Cập Nhật Số Món Thiếu

- Nhấn vào ô "Số món thiếu" trên bảng
- Modal hiển thị với số hiện tại
- Nhập số món thiếu mới
- Lưu → Tự động cập nhật bảng

### 4.3 Flow Xử Lý Dữ Liệu Tab 1

```
Tải dữ liệu từ Firestore
    ↓
Sắp xếp theo ngày đi hàng (mới nhất trước)
    ↓
Lưu vào bộ nhớ tạm (global state)
    ↓
Áp dụng các bộ lọc đang hoạt động
    ↓
Lọc theo ngày → Lọc theo NCC → Lọc theo sản phẩm
    ↓
Kết quả lọc được hiển thị lên bảng
```

---

## 5. Tab 2: Quản Lý Công Nợ

### 5.1 Khái Niệm Về Công Nợ

Tab công nợ theo dõi **số dư (balance)** với nhà cung cấp thông qua các loại giao dịch:

| Loại giao dịch | Ảnh hưởng | Mô tả |
|----------------|-----------|-------|
| Thanh toán trước | **Tăng** số dư | Tiền gửi trước cho NCC |
| Tiền hóa đơn | **Giảm** số dư | Tiền hàng phải trả |
| Chi phí ship | **Giảm** số dư | Chi phí vận chuyển |
| Chi phí khác | **Giảm** số dư | Các chi phí phát sinh |

**Công thức tính số dư**:
> Số dư = Tổng thanh toán trước - Tổng tiền hóa đơn - Tổng chi phí ship - Tổng chi phí khác

- Số dư **dương (+)**: Đang thừa tiền với NCC
- Số dư **âm (-)**: Đang nợ NCC

### 5.2 Các Chức Năng Tab 2

#### Xem Bảng Giao Dịch

Bảng hiển thị các giao dịch theo thứ tự thời gian với các cột:
- Ngày giao dịch
- Loại giao dịch (có icon và màu phân biệt)
- Mô tả ngắn
- Số tiền (hiển thị + hoặc -)
- Số dư sau giao dịch
- Thao tác (Xem chi tiết, Sửa, Xóa)

#### Thêm Thanh Toán Trước

```
1. Nhấn "Thêm thanh toán trước"
    ↓
2. Nhập ngày giao dịch
    ↓
3. Nhập số tiền thanh toán
    ↓
4. (Tùy chọn) Nhập ghi chú
    ↓
5. Lưu → Số dư được cập nhật
```

#### Thêm Chi Phí Khác

```
1. Nhấn "Thêm chi phí khác"
    ↓
2. Nhập ngày phát sinh
    ↓
3. Chọn loại chi phí hoặc nhập mới
    ↓
4. Nhập số tiền
    ↓
5. Lưu → Số dư được cập nhật
```

#### Xem Chi Tiết Giao Dịch

Với giao dịch loại **Tiền hóa đơn** hoặc **Chi phí ship**:
- Nhấn nút "Xem chi tiết"
- Modal hiển thị breakdown theo từng đợt hàng trong ngày đó
- Có thể chỉnh sửa từng dòng (nếu có quyền)

### 5.3 Flow Xây Dựng Bảng Giao Dịch

```
Tải dữ liệu thanh toán trước
    ↓
Tải dữ liệu chi phí khác
    ↓
Lấy danh sách đợt hàng (đã có sẵn từ Tab 1)
    ↓
Xây dựng danh sách giao dịch:
    ├── Thêm các khoản thanh toán trước (+)
    ├── Gộp tiền hóa đơn theo ngày (-)
    ├── Gộp chi phí ship theo ngày (-)
    └── Thêm các chi phí khác (-)
    ↓
Sắp xếp theo ngày (cũ nhất trước)
    ↓
Tính số dư luỹ kế cho từng dòng
    ↓
Hiển thị bảng giao dịch
```

### 5.4 Ý Nghĩa Màu Sắc

| Màu | Ý nghĩa |
|-----|---------|
| 🟢 Xanh lá | Thanh toán trước (tiền vào) |
| 🔴 Đỏ | Tiền hóa đơn (tiền ra) |
| 🟠 Cam | Chi phí ship (tiền ra) |
| 🟣 Tím | Chi phí khác (tiền ra) |

---

## 6. Hệ Thống Phân Quyền

### 6.1 Các Cấp Độ Quyền

Hệ thống phân quyền chi tiết theo từng chức năng:

**Quyền truy cập Tab**
- Quyền xem Tab theo dõi (mặc định: Có)
- Quyền xem Tab công nợ (mặc định: Không)

**Quyền thao tác với đợt hàng**
- Tạo đợt hàng mới
- Chỉnh sửa đợt hàng
- Xóa đợt hàng
- Chỉnh sửa số món thiếu

**Quyền xem thông tin nhạy cảm**
- Xem chi phí hàng về
- Chỉnh sửa chi phí hàng về
- Xem ghi chú Admin
- Chỉnh sửa ghi chú Admin

**Quyền thao tác tài chính**
- Xem công nợ
- Tạo/sửa/xóa thanh toán trước
- Tạo/sửa/xóa chi phí khác
- Chỉnh sửa tổng tiền hóa đơn
- Chỉnh sửa chi phí ship

**Quyền xuất dữ liệu**
- Xuất Excel (mặc định: Có)

### 6.2 Cách Áp Dụng Quyền

Khi tải trang:
1. Hệ thống đọc thông tin quyền từ Firestore dựa trên username
2. Kết hợp quyền mặc định với quyền được cấp
3. Ẩn/hiện các nút, cột, tab dựa trên quyền

**Ví dụ áp dụng**:
- Không có quyền Tab công nợ → Tab bị khóa với biểu tượng ổ khóa
- Không có quyền tạo đợt hàng → Nút "Thêm đợt hàng" bị ẩn
- Không có quyền xem chi phí → Cột chi phí không hiển thị

### 6.3 Bảo Mật

- Quyền được kiểm tra cả ở phía giao diện (ẩn/hiện) và logic xử lý (chặn thao tác)
- Mọi thao tác tạo/sửa/xóa đều ghi nhận người thực hiện
- Lịch sử thay đổi được lưu lại để truy vết

---

## 7. Tính Năng Bổ Sung

### 7.1 Xuất Excel

**Chức năng**: Xuất danh sách đợt hàng đang hiển thị ra file Excel

**Quy trình**:
1. Áp dụng các bộ lọc cần thiết
2. Nhấn nút "Xuất Excel"
3. Hệ thống tạo file với dữ liệu đã lọc
4. File tự động tải về máy

**Nội dung xuất**:
- Tất cả các cột hiển thị trên bảng
- Dữ liệu phụ thuộc vào quyền (không có quyền xem chi phí → không xuất chi phí)

### 7.2 Lịch Sử Chỉnh Sửa

Hệ thống tự động ghi nhận mọi thay đổi:

| Thông tin ghi nhận | Mô tả |
|--------------------|-------|
| Thời gian | Thời điểm thực hiện thao tác |
| Người thực hiện | Username của người thao tác |
| Loại thao tác | Tạo mới / Cập nhật / Xóa |
| Đối tượng | Đợt hàng / Thanh toán / Chi phí |
| Dữ liệu cũ | Giá trị trước khi thay đổi |
| Dữ liệu mới | Giá trị sau khi thay đổi |

### 7.3 Thông Báo (Toast Notifications)

Hệ thống hiển thị thông báo popup cho các sự kiện:

| Loại | Màu | Thời gian hiển thị | Ví dụ |
|------|-----|---------------------|-------|
| Thành công | Xanh lá | 3 giây | "Đã tạo đợt hàng mới" |
| Lỗi | Đỏ | 5 giây | "Không thể kết nối server" |
| Cảnh báo | Vàng | 4 giây | "Bạn không có quyền truy cập" |
| Thông tin | Xanh dương | 3 giây | "Đang tải dữ liệu..." |

---

## Sơ Đồ Tổng Quan Flow Trang

```
┌─────────────────────────────────────────────────────────────────┐
│                     NGƯỜI DÙNG TRUY CẬP                         │
└─────────────────────────────────────────────────────────────────┘
                               ↓
                    ┌──────────────────┐
                    │  Kiểm tra đăng   │
                    │      nhập?       │
                    └──────────────────┘
                     ↓              ↓
                   [Có]          [Không]
                     ↓              ↓
                     │        Về trang Login
                     ↓
              ┌─────────────────┐
              │  Tải quyền từ   │
              │    Firestore    │
              └─────────────────┘
                     ↓
              ┌─────────────────┐
              │ Thiết lập giao  │
              │ diện theo quyền │
              └─────────────────┘
                     ↓
              ┌─────────────────┐
              │   Tải dữ liệu   │
              │   đợt hàng      │
              └─────────────────┘
                     ↓
              ┌─────────────────┐
              │  Hiển thị Tab 1 │
              │ (Theo dõi hàng) │
              └─────────────────┘
                     ↓
        ┌────────────┴────────────┐
        ↓                         ↓
   [Tab 1]                    [Tab 2]
   Theo dõi                   Công nợ
   đợt hàng                   (nếu có quyền)
        ↓                         ↓
   ┌─────────┐               ┌─────────┐
   │ - Xem   │               │ - Xem   │
   │ - Lọc   │               │ giao    │
   │ - Thêm  │               │ dịch    │
   │ - Sửa   │               │ - Thêm  │
   │ - Xóa   │               │ thanh   │
   │ - Export│               │ toán    │
   └─────────┘               │ - Thêm  │
                             │ chi phí │
                             └─────────┘
```

---

## Kết Luận

Trang **Theo Dõi Nhập Hàng SL** là một công cụ quản lý toàn diện cho quy trình nhập hàng, kết hợp:

1. **Quản lý đợt hàng** - Theo dõi từng lần nhập hàng với đầy đủ thông tin hóa đơn
2. **Quản lý công nợ** - Kiểm soát tài chính với nhà cung cấp
3. **Phân quyền linh hoạt** - Bảo mật thông tin nhạy cảm
4. **Ghi nhận lịch sử** - Truy vết mọi thay đổi

Trang được thiết kế với giao diện trực quan, hỗ trợ lọc và tìm kiếm hiệu quả, phù hợp cho cả nhân viên vận hành lẫn quản lý cấp cao.
