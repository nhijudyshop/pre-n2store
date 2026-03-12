# TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ & KỸ THUẬT HỆ THỐNG BÁN HÀNG NỘI BỘ

**Phiên bản:** 2.0 - Chi tiết hóa quy trình xử lý ngoại lệ  
**Ngày lập:** 21/05/2024  
**Người lập:** Ban Quản trị & IT

---

## PHẦN I. TỔNG QUAN HỆ THỐNG & NGUYÊN TẮC CỐT LÕI

### 1. Mô hình Hệ thống

Chúng ta vận hành dựa trên sự kết hợp chặt chẽ giữa 2 hệ thống:

**TPOS (Hệ thống Lõi):**
- Là nơi lưu trữ chính thức về Danh mục sản phẩm và Tồn kho thực tế.
- Thực hiện các nghiệp vụ gốc: Tạo Phiếu Bán Hàng (xuất kho), Tạo Phiếu Trả Hàng (nhập kho).
- Kết nối trực tiếp với Đơn vị vận chuyển (ĐVVC) để đẩy đơn giao hàng.

**WEB NỘI BỘ (CRM & Vận hành):**
- Trung tâm xử lý nghiệp vụ hàng ngày của nhân viên.
- Quản lý thông tin khách hàng và Ví công nợ khách hàng.
- Theo dõi trạng thái các sự vụ (Ticket) như: Hàng hoàn, Sửa COD, Đổi trả.
- Sử dụng API để giao tiếp với TPOS (lấy dữ liệu đơn, gửi lệnh tạo đơn).

**SEPAY:** Tự động ghi nhận giao dịch chuyển khoản ngân hàng và đồng bộ về Web nội bộ.

### 2. Nguyên tắc Tài chính với ĐVVC (CỰC KỲ QUAN TRỌNG)

Tất cả nhân viên phải nắm rõ nguyên tắc này vì nó ảnh hưởng trực tiếp đến dòng tiền và cách xử lý đơn hàng:

> **"ĐVVC ứng trước 100% tiền COD cho Shop ngay khi lấy hàng đi giao."**

- **Hệ quả:** Khi ĐVVC đã lấy hàng, Shop đã nhận đủ tiền của đơn đó.
- **Rủi ro:** Bất kỳ hành động nào làm GIẢM số tiền khách thực trả so với COD ban đầu (khách boom, khách nhận ít món đi, shop giảm giá thêm khi đang giao) đồng nghĩa với việc Shop đang NỢ lại ĐVVC số tiền chênh lệch đó. Kế toán phải thực hiện chuyển khoản trả lại cho ĐVVC sau khi đối soát.

---

## PHẦN II. DÀNH CHO BỘ PHẬN VẬN HÀNH (HƯỚNG DẪN NGHIỆP VỤ)

Phần này quy định quy trình làm việc chuẩn cho nhân viên Sale, CSKH, Kho và Kế toán.

### 1. Quy trình Bán hàng Chuẩn & Sử dụng Công nợ

**Nguyên tắc Ví công nợ:** Công nợ khách hàng (Ví tiền) luôn phải ≥ 0. Được cộng khi khách chuyển khoản trước hoặc trả hàng. Được trừ khi khách mua đơn mới.

**Các bước thực hiện trên Web Nội bộ:**

1. Nhân viên lên đơn nháp khi khách đặt (từ Livestream hoặc MXH).
2. Khi khách chốt đơn, hệ thống Web tự động kiểm tra số dư Ví công nợ của khách.
3. Hệ thống tự động tính toán: `COD cần thu = Tổng giá trị đơn - Số dư ví được trừ`.
4. Hệ thống Web gọi API sang TPOS để tạo Phiếu bán hàng chính thức với số tiền COD đã tính toán ở trên.

**Ví dụ:** Khách mua 500k, trong ví còn 200k. Web sẽ tạo đơn bên TPOS với giá trị 500k nhưng COD thu hộ chỉ là 300k. Ghi nhận khách đã thanh toán trước 200k.

### 2. Quy trình Xử lý Ngoại lệ (Ticket)

Đây là hướng dẫn chi tiết cho 4 trường hợp phát sinh sau khi hàng đã giao cho ĐVVC.

---

#### TICKET LOẠI 1: BOOM HÀNG (Giao thất bại toàn bộ)

**Mô tả:** ĐVVC đã đi giao nhưng khách không nhận hoặc không liên lạc được. Toàn bộ kiện hàng được trả về Shop.

**Quy trình xử lý:**

1. **Tiếp nhận thông tin:** ĐVVC cập nhật trạng thái giao thất bại/chuyển hoàn trên hệ thống.

2. **Ghi nhận trên Web (CSKH/Vận hành):** Hệ thống Web ghi nhận danh sách các đơn "Đang hoàn về" để theo dõi.

3. **Nhận hàng & Đồng kiểm (Kho):**
   - Khi ĐVVC mang hàng hoàn về kho. Nhân viên kho thực hiện đồng kiểm hàng thực tế.
   - Nếu hàng đủ và đúng: Đánh dấu trạng thái "Đã nhận hàng tại shop" trên ticket tương ứng ở Web Nội bộ.

4. **Nhập kho (Kho):** Tạo "Phiếu trả hàng" trên TPOS để đưa sản phẩm về lại tồn kho thực tế.

5. **Xử lý tài chính (Kế toán):** Dựa trên danh sách ticket "Đã nhận hàng tại shop", kế toán thực hiện chuyển khoản hoàn trả lại 100% tiền COD mà ĐVVC đã ứng trước đó cho các đơn này.

---

#### TICKET LOẠI 2: SỬA COD (Xử lý nóng khi đang giao)

**Mô tả:** Shipper đang ở địa chỉ khách nhưng phát sinh vấn đề, Shipper gọi điện về cho Shop để xin ý kiến thay đổi số tiền thu (COD).

**Các lý do phổ biến:**
- Khách chỉ nhận 1 phần (Ví dụ: Đặt 2 áo, chỉ lấy 1 áo).
- Đơn hàng bị tính sai tiền (quên trừ cọc, tính sai ship) cần giảm COD về đúng số tiền khách phải trả.
- Đi đơn thiếu món cho khách (Shop check cam xác nhận).
- Hàng có lỗi, khách phát hiện ngay khi đồng kiểm, khách trả lại món lỗi ngay lập tức.

**Quy trình xử lý:**

1. **Tiếp nhận cuộc gọi (CSKH):** Nhân viên nghe điện thoại của Shipper, xác nhận tình huống với khách hàng (nếu cần).

2. **Ra quyết định & Tính toán (CSKH):** Chốt phương án xử lý và tính ra con số COD MỚI chính xác cần thu của khách. (Nếu không thu gì thì COD = 0đ).

3. **Xác nhận với Shipper:** Thông báo số tiền COD mới cho Shipper thu.

4. **Tạo Ticket ghi nhận (CSKH - Quan trọng):**
   - Tạo ngay ticket "Sửa COD" trên Web Nội bộ cho đơn hàng đó.
   - Ghi rõ lý do (VD: Khách trả lại Áo mã A vì lỗi chỉ, đã giảm COD 200k).
   - **Lưu ý:** Nếu hàng lỗi, phải đánh dấu vào ticket để kho biết đường xử lý khi hàng về.

5. **Xử lý hàng thừa về sau (Kho):** Khi shipper mang các món hàng khách không nhận về lại shop (nếu có). Kho kiểm tra, xác nhận trên ticket Web, và tạo Phiếu trả hàng TPOS để nhập kho (nếu hàng tốt) hoặc xử lý hàng lỗi với NCC.

6. **Xử lý tài chính (Kế toán):** Dựa trên các ticket Sửa COD, kế toán tính toán phần chênh lệch (COD ứng trước - COD thực thu mới) và chuyển khoản trả lại phần tiền thừa này cho ĐVVC.

---

#### TICKET LOẠI 3: KHÁCH GỬI (Đổi trả kênh Tỉnh)

**Mô tả:** Khách ở tỉnh đã nhận hàng và thanh toán đủ COD. Sau đó muốn đổi/trả và tự mang hàng ra bưu cục gửi về địa chỉ Shop.

**Quy trình xử lý:**

1. **Khách gửi hàng:** Khách tự thực hiện việc gửi hàng về Shop.

2. **Nhận hàng (Kho):** Shop nhận được kiện hàng khách gửi về.

3. **Kiểm tra & Nhập kho (Kho):** Kiểm tra tình trạng hàng hóa. Tạo Phiếu trả hàng trên TPOS để nhập lại kho thực tế.

4. **Hoàn tiền vào Ví (CSKH/Kế toán):** Sau khi kho xác nhận đã nhập hàng trên TPOS, vào Web Nội bộ, tìm thông tin khách hàng và thực hiện cộng số tiền tương ứng của món hàng trả về vào Ví công nợ của khách.

---

#### TICKET LOẠI 4: THU VỀ (Đổi trả kênh Thành phố - Quy trình Đặc biệt)

**Mô tả:** Khách ở nội thành muốn đổi trả. Shop sử dụng dịch vụ của ĐVVC: Giao đơn mới đến và shipper tiện thể thu hồi đơn cũ về cùng lúc.

**Quy trình xử lý (Flow Công nợ ảo):**

1. **Tiếp nhận yêu cầu:** Khách liên hệ muốn đổi trả, Shop chấp nhận.

2. **Cấp Công nợ ảo (CSKH - Thực hiện trên Web):**
   - Nhân viên thao tác trên Web để cộng ngay giá trị món hàng khách muốn trả vào Ví khách hàng dưới dạng "Công nợ ảo".
   - **Quy định:** Công nợ ảo này có thời hạn sử dụng 15 ngày.

3. **Khách đặt đơn mới:** Khách dùng "Công nợ ảo" này để đặt một đơn hàng đổi mới. Web sẽ trừ công nợ này vào COD đơn mới (Quy trình bán hàng chuẩn).

4. **Điều phối giao nhận:** ĐVVC đi giao đơn mới và thu hồi hàng cũ.

5. **Xử lý hàng thu hồi (Kho):** Khi ĐVVC mang hàng cũ về Shop. Kho kiểm tra và tạo Phiếu trả hàng TPOS để nhập kho.

6. **Xử lý rủi ro (Quan trọng):**
   - **Rủi ro 1:** Quá 15 ngày khách không đặt đơn mới. Hệ thống Web tự động hủy "Công nợ ảo". CSKH phải liên hệ khách để xử lý thủ công (gia hạn hoặc thỏa thuận khác) vì hàng vẫn chưa về shop.
   - **Rủi ro 2:** ĐVVC làm mất hàng thu hồi. Nếu quá 10 ngày kể từ ngày giao đơn mới thành công mà hàng thu hồi chưa về shop. CSKH làm việc với ĐVVC để yêu cầu ĐVVC đền bù giá trị hàng hóa đó.

---

## PHẦN III. DÀNH CHO BỘ PHẬN KỸ THUẬT (ĐẶC TẢ HỆ THỐNG WEB NỘI BỘ)

Phần này mô tả các yêu cầu kỹ thuật, trạng thái dữ liệu và logic API cần hiện thực trên Web Nội bộ.

### 1. Đồng bộ Dữ liệu & Vai trò Master

- **Inventory Master:** TPOS. Web nội bộ chỉ hiển thị tồn kho (read-only) lấy từ API TPOS. Mọi hành động thay đổi tồn kho thực tế phải thông qua việc gọi API tạo Phiếu Bán/Trả hàng sang TPOS.
- **Customer Credit Master:** Web Nội bộ. Là nơi duy nhất lưu trữ và tính toán số dư ví của khách hàng.
- **Ticket Status Master:** Web Nội bộ. Là nơi theo dõi quy trình xử lý các sự vụ (Boom, Sửa COD...) trước khi nó kết thúc bằng một hành động trên TPOS hoặc kế toán.

### 2. Logic API Tạo đơn (Web -> TPOS)

Khi nhân viên nhấn nút "Tạo đơn" trên Web Nội bộ:

1. Web Server tính toán: `Final_COD = Order_Total_Value - Customer_Wallet_Balance`.
2. Nếu `Final_COD < 0`, báo lỗi (Công nợ không được âm).
3. Gọi API tạo đơn của TPOS. Trong payload gửi đi, map giá trị `Customer_Wallet_Balance` vào trường "Tiền trả trước" (hoặc trường tương đương) của TPOS, và `Final_COD` vào trường tiền thu hộ.
4. Sau khi TPOS trả về success, Web Server thực hiện trừ số tiền tương ứng trong ví khách hàng trên database của Web.

### 3. Quản lý Trạng thái Ticket (Trên Web Nội bộ)

Cần thiết kế các trạng thái (status) cho từng loại ticket để theo dõi tiến độ.

#### Ticket Boom hàng / Ticket Sửa COD (Chờ hàng về):

| Trạng thái | Mô tả |
|------------|-------|
| `New` | Vừa ghi nhận (ĐVVC báo boom hoặc Shipper vừa gọi sửa COD). |
| `Pending_Return` | Đang chờ ĐVVC mang hàng thực tế về shop. |
| `Received_Verified` | Kho đã nhận hàng thực tế và kiểm tra OK (Chờ kế toán xử lý tiền). |
| `Accounting_Done` | Kế toán đã hoàn tiền ứng cho ĐVVC (Ticket đóng). |

#### Ticket Thu về (Kênh Thành phố - Công nợ ảo):

| Trạng thái | Mô tả |
|------------|-------|
| `Virtual_Credit_Issued` | Đã cấp công nợ ảo, chờ khách đặt đơn mới. (Kích hoạt timer 15 ngày). |
| `New_Order_Placed` | Khách đã dùng công nợ đặt đơn mới, chờ shipper đi giao và thu hồi. |
| `Pending_Recovery` | Đơn mới đã giao, đang chờ hàng cũ về (Kích hoạt timer 10 ngày cho ĐVVC). |
| `Completed` | Hàng cũ đã về và nhập kho TPOS. |
| `Expired_NoAction` | Quá 15 ngày khách không mua (Cần nhân viên xử lý tay). |
| `Logistics_Issue` | Quá 10 ngày hàng chưa về (Cần claim ĐVVC). |

### 4. Cron Job & Tự động hóa

**Tích hợp SePay:** Webhook nhận dữ liệu từ SePay → Parse nội dung chuyển khoản để tìm mã khách hàng/SĐT → Cộng tiền vào ví khách hàng tương ứng.

**Job quét Công nợ ảo (Hàng ngày):**
- Quét các ticket "Thu về" trạng thái `Virtual_Credit_Issued` quá 15 ngày.
- Chuyển trạng thái sang `Expired_NoAction` và thu hồi công nợ ảo trên ví.

**Job cảnh báo ĐVVC (Hàng ngày):**
- Quét các ticket "Thu về" trạng thái `Pending_Recovery` quá 10 ngày kể từ ngày giao đơn mới thành công.
- Bắn thông báo cho CSKH để làm việc với ĐVVC.
