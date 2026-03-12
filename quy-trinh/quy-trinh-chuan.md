# Quy Trình Nghiệp Vụ — N2Store (Shop thời trang nữ online)

> Bản MD chuẩn để AI agent đọc nhanh. Cập nhật thủ công khi quy trình chuẩn thay đổi.

---

## Sơ đồ luồng tổng quan (8 bộ phận)

1. **Nhập hàng & Làm mã** → 2. **Live Sale** → 3. **Trả hàng theo phiếu** → 4. **Chốt đơn (Sale)**
↓
5. **Đi chợ & Đối soát** → 6. **Đóng đơn & Giao shipper** → 7. **CSKH** → 8. **Check IB**

---

## BP1 — Nhập hàng & Làm mã (7 bước)

### Bước 1: Nhận hàng & Cân hàng
- Khi hàng hóa được gửi về shop, bạn phụ trách nhận hàng sẽ **cân cục hàng** xem bao nhiêu ký.
- Đưa số liệu **CÂN NẶNG + HÌNH ẢNH CÂN NẶNG** lên web của shop.
- Sau khi cân xong mới đưa cục hàng vào trong khu làm hàng (khu làm mã).

### Bước 2: Khui hàng & Phân loại theo nhà cung cấp
- Khui cục hàng ra, bên trong sẽ có nhiều cục hàng nhỏ của nhiều nhà cung cấp khác nhau.
- Phân chia hàng theo từng nhà cung cấp.
- Đếm số lượng sản phẩm của từng nhà.

### Bước 3: Đối soát với bill nhà cung cấp
- Bạn làm mã chính đối soát số lượng thực tế so với bill bên nhà cung cấp gửi.
- Kiểm tra xem có khớp về: **số lượng**, **sản phẩm**, **giá nhập** hay không.
- ⚠️ **Lưu ý quan trọng:** Nếu có sai lệch phải xử lý với nhà cung cấp trước khi tiếp tục các bước sau.

### Bước 4: Nhập sản phẩm lên web shop
- Nhập đầy đủ thông tin: **tên sản phẩm + giá bán + giá nhập + số lượng + hình ảnh sản phẩm** vào web của shop.
- Sau khi nhập xong **xuất excel** từ web.
- Vào `Tpos` để mua hàng (tức là mua sản phẩm để in ra tem mã vạch cho sản phẩm đó).

### Bước 5: Rút mẫu & Dán tem mã
- Tất cả sản phẩm mới về shop sẽ được **rút 1 cái** để ủi và làm mẫu live.
- Khi tất cả sản phẩm đã được dán tem mã đầy đủ sẽ được đưa vào kệ.
- 💡 **Lưu ý:** Hàng đăng bài bán, hàng về để đi đơn trả khách thì **không cần rút mẫu** (tùy vào sản phẩm về là hàng mới để live hay hàng cũ về để trả hàng).

### Bước 6: Sắp xếp hàng vào kệ
- Phân chia theo mục sản phẩm:
  - 👖 Quần → kệ quần
  - 👕 Áo → kệ áo
  - 👗 Set, đầm, v.v. → đúng khu vực

### Bước 7: Đưa mẫu lên lầu (phòng live)
- Sản phẩm được rút mẫu để ủi sẽ được đưa lên lầu.
- Phân theo từng sào của khu vực sản phẩm đó.
- Để mẫu live — khi xuống live sẽ lựa mẫu vào live.

---

## Quản lý kho — Nhận hàng & Sắp xếp (6 bước)

### Bước 1: Nhận hàng mẫu mới (đưa lên phòng live)
- Phân loại mẫu **Việt Nam** – **Quảng Châu**.
- Phân loại kiểu mẫu: Áo – Quần – Set – Đầm…
- Treo mẫu lên sào theo đúng vị trí **bảng tên phân loại** được dán trên sào.
- Thứ tự mẫu mới treo vào sào: **từ trái qua phải**.
- Kiểm tra mẫu đã OK chưa trước khi c Nhi live (VD: cắt khuy, cắt chỉ thừa, cột dây…).
- 💡 **Lưu ý:** Mẫu phải được kiểm tra kỹ trước khi đưa lên sào live để đảm bảo chất lượng hình ảnh khi livestream.

### Bước 2: Nhận hàng số lượng Việt Nam (đưa lên phòng live)
- Để hàng lên **kệ hàng mới bên trái góc live (KỆ SỐ 2)**.
- Để đúng theo tầng đã phân loại: Áo, Quần, Set, Đầm…

### Bước 3: Nhận hàng số lượng Quảng Châu (dưới kho tầng trệt)
- Sắp xếp các cục hàng lên kệ theo **khu đã phân loại**: Áo, Quần, Set, Đầm…
- Sau khi đưa mẫu lên sào phòng live, bạn làm kho sẽ **mở danh sách kiểm mã** và **quét mã** các mẫu xem có bị sót hay không.
- ✅ **Kiểm tra:** Luôn quét mã đối chiếu sau khi sắp xếp để đảm bảo không sót mẫu nào.

### Bước 4: Nhận hàng lẻ từ nhiều bộ phận

**Các trường hợp hàng rớt/lẻ cần xử lý:**
- Hàng Boom / Hoàn (C.Còi xử lý)
- Khách xã sau khi chốt đơn (từ các bạn Seller)
- Hàng rớt từ trên live (C Nhi live hàng SL bị rớt lại)
- Hàng rớt sau khi đi đơn trả hàng (My hoặc Lài)
- Hàng rớt Inbox (khách xã hàng của My check IB)
- Hàng khách gửi đổi trả lên ở tỉnh + TP (Lài)

Hàng rớt sẽ được **bàn giao qua cho bạn làm kho**. Bạn làm kho vận chuyển hàng rớt lên phòng live và bắt đầu xử lý.

**Cách thức xử lý:**
- Kiểm tra hàng rớt đó **đã có mẫu hay chưa** và bung mẫu treo lên **sào mẫu lẻ** đúng khu phân loại.
- Đối với hàng đã có mẫu: số lượng của mẫu đó sẽ **cột lại** và sắp xếp lên **kệ hàng lẻ** đúng phân loại. Đồng thời **đánh dấu số lượng lên tem mạc** của mẫu đang treo.
- ⚠️ **Hàng lỗi nặng:** Không trả lại được nhà cung cấp, không fix bán được → ghi rõ lỗi gì lên bao và để vào **rổ hàng lỗi**.
- 💡 **Hàng lỗi nhẹ:** Báo c Nhi biết để **fix bán sale** cho khách.

### Bước 5: Sắp xếp mẫu sau buổi live
- C Nhi live xong thì **linh động sắp xếp** tất cả các mẫu, hàng về đúng vị trí theo **sào + kệ** được phân loại.

### Bước 6: Kiểm kê định kỳ (2 đợt live kiểm kho 1 lần)
- Kiểm **số lượng hiển thị trên web** và **số lượng hàng thực tế** đã khớp hay chưa. Nếu thiếu hoặc dư số lượng không khớp thì phải kiểm tra lại.
- Kiểm xem có bị **sót mẫu hàng rớt** chưa treo ra không.
- Kiểm tra **hàng lẻ số lượng trên kệ** và **mẫu lẻ treo sào** đã để đúng khu vực phân loại hay chưa.
- Kiểm tra **số lượng ghi trên tem mạc** của mẫu đã đúng hay chưa.
- Kiểm tra **hạn sử dụng** còn bao lâu để đưa c Nhi tranh thủ live kẻo hết hạn (VD: mỹ phẩm, đồ ăn…).
- 🚫 **Quy tắc quan trọng:** Bạn nào lấy hàng thì chủ động **sửa lại số lượng trên tem mạc** của mẫu cho đúng chính xác. **Tuyệt đối không lấy mẫu nếu còn số lượng trên kệ** để tránh mất mẫu.

---

## Chuẩn bị trước live — Check hàng (Duyên phụ trách)

> Quy trình check hàng trước khi live để nắm số lượng tồn kho NCC, giúp live sale biết giới hạn nhận đơn.

### ❗ CHECK HÀNG:

**Bước 1: Mang hàng mới về lên theo khu vực**
- Hàng mới về — mấy bạn làm mã mang lên để theo từng khu vực.

**Bước 2: Check mẫu theo nhà cung cấp**
- Check mẫu xem của nhà cung cấp nào (từ ngày cũ đến ngày mới nhất).

**Bước 3: Xử lý mẫu NCC hết hàng**
- Mẫu nào bên nhà cung cấp hết sẽ soạn bỏ ra hàng lẻ.

**Bước 4: Note số lượng cụ thể cho mẫu còn ít**
- Mẫu nào còn số lượng cụ thể ví dụ 10–20–30... thì note lại số lượng, khi chị Nhi live sẽ ghi lại và nhận đúng tương đối với số lượng NCC báo.

**Bước 5: Mẫu còn nhiều — nhận thoải mái**
- Mẫu nào còn số lượng nhiều (hoặc có thể đặt thêm chờ hàng) thì nhận thoải mái.
- Mẫu nào chờ lâu thì báo chị Nhi ngày để báo khách đợi.

---

## BP2 — Live Sale (5–6 nhân sự)

### Nhân sự khu vực live
- Tối thiểu 5–6 người, mục tiêu giảm bớt số lượng theo thời gian tối ưu quy trình.

### Trong phòng live — 2 bạn:
1. **Bạn 1 — Cầm đồ cho mẫu:** Đứng trong phụ cầm đồ cho mẫu live
2. **Bạn 2 — Nói phụ mẫu live:** Báo lại số ký và tên sản phẩm để khách dễ comment đặt hàng

### Ngoài khu vực live — 3 bạn:

#### Bạn 1 — Nhận oder (bấm phiếu + đặt hàng nhà cung cấp)

**📋 Bấm phiếu (Quy trình bấm bill ghi SL):**
- Khách CMT đặt hàng → in đơn từ CMT khách → gạch số.
- Phiếu có **4 cột** phân loại khách:
  1. **Khách bình thường** — Đếm số lượng tổng và quẹt hàng với nhà cung cấp.
  2. **Khách chưa cho SĐT** — Không đặt vì không có thông tin khách hàng → sau live khách cho SĐT thì nếu còn hàng sẽ đặt cho khách, không còn hàng sẽ báo khách hết.
  3. **Khách lạ đã cho SĐT nhưng chờ cọc** — Khách cọc OK thì đặt hàng, nếu không cọc thì không đặt hàng.
  4. **Khách bom** — Đợi liên lạc với khách báo cọc → khách cọc OK mới đặt hàng → nếu khách cọc trễ mà NCC hết hàng thì báo khách đổi mẫu.

**🛒 Đặt hàng nhà cung cấp — 2 tình huống:**
- **Trường hợp NCC nhanh hết hàng:** Trên live nhận tới đâu sẽ đặt liền tới đó (đặt real-time).
- **Trường hợp NCC số lượng không giới hạn (hoặc đặt thêm chờ hàng):** Khi live xong mỗi đợt live sẽ đặt cho chính xác (đặt batch sau live).

#### Bạn 2 — Phân phiếu
- Phân phiếu theo từng sản phẩm.
- Ghi tên + mã sản phẩm lên phiếu.
- Báo lại trên live: *"Khách mới cọc trước 100k để shop giữ hàng"*
- Chuyền phiếu ra cho bạn ngồi máy.

#### Bạn 3 — Ngồi máy (check chuyển khoản + nhập giỏ hàng)

**📲 Check khách mới + báo cọc:**
- Nhắn câu báo cọc **100k** + gửi **mã QR** cho khách.
- Sau **15–20 phút** khách chưa phản hồi → nhắn hối cọc.

**💳 Check chuyển khoản:**
- Vào web shop xem lịch sử biến động số dư, kiểm tra đúng số tiền khách chuyển chưa.
- Sau đó nhắn báo khách ví dụ: *"Dạ đã nhận 100k ACB 23/2"*

**⚠️ Check khách boom (khách có lịch sử boom hàng):**
- 🚫 Bắt buộc phải cọc mới để đơn:
  - Khách mới boom gần đây (2 năm trở lại)
  - Hoàn đơn
  - Xả đơn trước nhiều sản phẩm
- ✅ Trường hợp liên hệ được để đơn lại:
  - Khách boom trên 2 năm, gọi được và cho lại thông tin đúng
  - Chị Nhi ưu tiên cho để đơn lại

**👤 Khách cũ (đã mua hàng trước đó, có thông tin):**
- Chỉ cần xác nhận lại địa chỉ → **không cọc**
- Đánh dấu **OK** và đưa bill lại cho bộ phận chia bill

**✅ Khách đã có thông tin và đã chuyển khoản:**
- Báo nhận tiền trong tin nhắn, ví dụ: *"Dạ đã nhận 100k ACB 23/2"*
- Đánh dấu **✅** lên phiếu và đưa lại cho bộ phận chia bill

**🚫 Khách chưa cho SĐT / Khách không cọc:**
- Không đặt hàng từ đầu vì không có thông tin khách hàng.
- Sau live khách cho SĐT thì nếu còn hàng sẽ đặt cho khách, không còn hàng sẽ báo khách hết.
- Hạn chế khách lạ đặt hàng sau live mà không có thông tin.

**📦 Khách cần kiểm tra đơn cũ — báo trực tiếp trên live:**
- Liên hệ với bạn **CSKH – Xử lý đơn bưu cục** (VD: khách hỏi đơn có vấn đề khi giao hàng,...)

**🗑️ Khách báo xả ngoài live / báo xả buổi live sau:**
- Xóa mã → báo bạn đi chợ bỏ hàng thực tế lên kệ hoặc bạn trả đơn bỏ bill.

**🛒 Nhập sản phẩm vào giỏ hàng:**
- Nhập mã sản phẩm (ví dụ: `N1234`) → Nhập STT của khách hàng trên phiếu → Nhập hết thì bấm `Update` là hoàn thành.
- Đưa lại cọc phiếu cho bạn nhận oder để khi hàng về trả hàng theo từng phiếu của khách.

### Sau khi kết thúc live
- Có bạn xuống xin thông tin lại hoặc nhắc lại khách để khách chuyển khoản → tránh mất khách hoặc mất đơn hàng.

---

## BP3 — Trả hàng theo phiếu (Nhận oder)

> Shop live **2 ngày**, làm đơn **1 ngày**.

### Bước 1: Nhận hàng từ bộ phận làm mã
- Khi kết thúc buổi live, hàng về thì bên làm mã làm xong hoàn tất sản phẩm có mã.
- Bạn nhận oder xuống và trả hàng theo từng mẫu, từng phiếu khách đặt.
- Trả hàng hết phiếu thì dừng.

### Bước 2: Xử lý khi hết hàng còn phiếu
- ⚠️ **Hết hàng mà còn phiếu đặt:** Bắt buộc bạn nhận oder phải **đặt lại số lượng đang còn thiếu** để trả cho đủ.
- **Trường hợp hết hàng hoàn toàn:** Bạn nhận oder phải nhắn tin cho khách biết để **hủy mẫu** hoặc **đổi màu** nếu có.

### Bước 3: Đưa hàng lên kệ theo STT — "ĐI CHỢ"
- Khi sản phẩm đã có phiếu tên khách hàng → chuyển sang bước đi chợ.
- **2 bạn phụ trách đi chợ:** đưa hàng lên kệ theo đúng STT.
- Hàng trên kệ phải được sắp xếp đúng STT để bộ phận đi chợ có thể lấy nhanh và chính xác.

---

## BP4 — Chốt đơn (Sale) (3 bạn sale)

### Những mục chính khi làm đơn:

#### 1. MỤC OKE
- **Đi đơn** — những đơn bình thường chỉ việc ra đơn, không có phát sinh thêm vấn đề.
- **Chờ hàng** — BẮT BUỘC PHẢI CÓ TAG T + MÓN CHỜ (những đơn có sản phẩm oder chưa về, cần ra phiếu chờ hàng).
- **Khách CKhoan** — những đơn chờ + khách đã chuyển khoản. Đơn nào đã chuyển khoản sẽ hiển thị công nợ.
- **Bán hàng** — những đơn khách đang mua thêm + seller đang chào hàng.
- **Chờ live + Giữ đơn** — những đơn khách muốn gộp live sau hoặc giữ đơn nhiều ngày.
- **Qua lấy** — những đơn khách qua nhà lấy.
- **Trừ công nợ** — những đơn trừ hàng thu về và trừ tiền còn nợ khách.
- **Giảm giá** — BẮT BUỘC PHẢI CÓ TAG (những đơn khách mua hàng sale đi đơn chiết khấu).
- **Đã đi đơn gấp** — BẮT BUỘC PHẢI CÓ TAG (những đơn khách yêu cầu đi đơn trước, bạn check IB đã đi đơn trước đó).
- **Khác — Gắn tag ghi chú** — những vấn đề ít xuất hiện VD: bookgrap, chờ my thêm mã xử lý vấn đề trước khi đẩy đơn, khách cần tách đơn đi 2 địa chỉ,...

#### 2. MỤC XỬ LÝ
- **Đơn chưa phản hồi** — những đơn khách chưa trả lời tin nhắn + chưa gọi được.
- **Đơn chưa đúng SP** — những đơn thiếu, dư, sai sản phẩm cần kiểm tra lại để sửa đơn.
- **Đơn khách muốn xã** — những đơn khách xã 1 hoặc vài món đang năn nỉ chờ phản hồi.
- **NCC hết hàng** — những đơn báo khách hết hàng hoặc đổi qua mẫu khác.
- **Khác — Gắn tag ghi chú** — những vấn đề ít xuất hiện VD: xử lý bưu cục, khách yêu cầu thêm deal,...

#### 3. MỤC ĐƠN KHÔNG CẦN CHỐT
- **Đã gộp không chốt** — BẮT BUỘC PHẢI CÓ TAG (những đơn khách mua 2 page đã được gộp vào 1 đơn).
- **Giỏ trống** — BẮT BUỘC PHẢI CÓ TAG (những đơn không có sản phẩm trong giỏ đã được xử lý trước đó VD: khách mới không cọc, khách xã trên live hoặc IB, giỏ trống dự bị,...).

#### 4. MỤC KHÁCH XÃ SAU CHỐT ĐƠN
- **Khách chủ động hủy nguyên đơn** — những đơn khách báo lí do không nhận đơn được yêu cầu hủy nguyên đơn VD: khách đi công tác, khách không có tiền nhận, khách đổi ý,...
- **Khách không liên lạc được** — những đơn sau khi kết thúc buổi chốt đơn vẫn không liên lạc được bắt buộc phải xã đơn.

### Quy trình làm đơn:

#### Bước 1: Gộp đơn & Đẩy tin nhắn

**🔀 Gộp đơn:**
- Sau khi đã bấm đơn xong sẽ chọn chiến dịch live và bắt đầu gộp những đơn khách mua 2 page trùng SĐT.
- Vào web shop → chọn **chiến dịch live** → chọn thẻ **Gộp đơn**
- Khách mua ở 2 page sẽ được gộp sản phẩm vào **1 giỏ**, giỏ còn lại sẽ được gắn thẻ `Đã gộp không chốt`

**📨 Đẩy tin nhắn chốt đơn (đẩy đơn tự động):**
- Lọc ngày theo đợt live đó
- Lọc tag `Đã gộp không chốt`, `Đã đi đơn gấp`, `Giỏ trống` và chọn đồng loạt tất cả các đơn bình thường để đẩy tin nhắn.
- Vào **Cài đặt cột** → bỏ chọn (không đẩy tin nhắn) các thẻ:
  - `Đã gộp không chốt`
  - `Giỏ trống`
  - `Đã đi đơn gấp`

**Chia STT cho từng seller:**
- VD: bạn A chốt từ 1 → 300 hoặc bạn B từ 301 → 600.
- Bạn sale nào làm số bao nhiêu chịu trách nhiệm với đơn đó.

#### Bước 2: Bắt đầu chốt đơn
- Check tin nhắn và đưa từng đơn của khách vào mục phân loại chính xác đến khi hết đơn, trống trang.
- Sau khi trống trang vào từng mục đã được phân loại để xử lý các đơn trong mục cần xử lý.
- Sau khi xử lý xong các mục phân loại thì tiến hành ra đơn.

#### Bước 3: Xử lý phản hồi khách

**✅ Khách xác nhận OKI:**
- Gắn thẻ `OK [tên bạn sale]`

**💰 Đơn có công nợ:**
- Trừ thu về (tp):
  - Đơn cũ có hàng lỗi / chật / khách không thích (chịu lỗ 80k)
  - Nhầm mẫu hoặc size
- Trừ công nợ (tỉnh):
  - Hàng đơn trước khách nhận có vấn đề → khách gửi lên
  - Đơn cũ khách chuyển khoản dư
  - Kho sẽ báo trong tin nhắn, ví dụ: *"ĐÃ NHẬN ĐƯỢC HÀNG KHÁCH GỬI LÊN ĐI ĐƠN TRỪ 290K"* hoặc *"NỢ LẠI 290K TRỪ VÀO ĐƠN SAU"*
  - Đi đơn mới sẽ trừ vào bill luôn

**📋 Ra bill đi đơn (thông thường):**
- Báo cho 2 bạn ở ngoài khu vực đi chợ vào lấy bill đi đơn đúng theo STT trên bill

**🚚 Đơn Bookgrap:**
- Ra bill → chọn **"Bán hàng shop"**
- Đối soát sản phẩm → đưa đơn cho shipper
- Đơn thu COD: đưa **tiền mặt cho anh Phước** + bill của đơn hàng

**⏳ Khách chưa OKI:**
- Gắn thẻ `XỬ LÝ ĐƠN [tên bạn sale]`
- Nhắn tin hối khách hoặc gọi để chốt đơn

**🚫 Khách không phản hồi sau nhiều lần liên hệ:**
- Bắt buộc **xả đơn**
- Note boom khách đó trên `Tpos` (tránh khách boom lại vào live mới đặt hàng tiếp)

### Quy trình ra đơn:

#### 1. Đơn mã vạch:
- Đợi bạn trả bill thông báo những đơn nào ra đơn mã vạch và ra phiếu chờ.

**Đi đơn bình thường:**
- Chọn đơn đồng loạt → chỉnh kênh (tính năng web) → xác nhận in phiếu → chụp bill + gửi câu cảm ơn khách.

**Đi đơn công nợ (trừ thu về, trừ nợ đơn trước, khách CK, giảm giá):**
- Chọn từng đơn → chỉnh kênh (tính năng web) → chiết khấu công nợ, giảm giá (tính năng web) → check lại công nợ cho chính xác → ghi chú (tính năng web) → xác nhận in phiếu → chụp bill + gửi câu cảm ơn khách.

**Đi đơn Qua Lấy / Bookgrap:**
- Chọn từng đơn → chỉnh kênh **BÁN HÀNG SHOP** → xác nhận in phiếu → chụp bill + gửi câu cảm ơn khách (đơn qua lấy gửi khách câu SĐT quản lý).

→ Sau khi ra bill mã vạch sẽ báo cho các bạn khâu đi chợ vào lấy bill để đi hàng.
- Số thứ tự của từng đơn sẽ được web tự động in trong bill.
- Những đơn bị sai sẽ tự xóa và làm lại bill đúng.

#### 2. Đơn phiếu chờ:
- Đợi bạn trả bill thông báo những đơn nào ra đơn mã vạch và ra phiếu chờ.

**Ra phiếu chờ hàng oder:**
- Copy + Dán SĐT khách vào mục ra phiếu chờ bên Tpos → Copy + Dán tất cả các mã trong đơn → Ghi chú **CHỜ HÀNG** dưới sản phẩm đang chờ về → Ghi chú số thứ tự → Xác nhận và in phiếu chờ.
- *(QUY TRÌNH XỬ LÝ TRONG TPOS — CHỜ PHÁT TRIỂN LẠI TRÊN WEBSITE NỘI BỘ)*

**Ra phiếu chờ live / giữ đơn / qua lấy:**
- Copy + Dán SĐT khách vào mục ra phiếu chờ bên Tpos → Copy + Dán tất cả các mã trong đơn → Ghi chú **CHỜ LIVE** hoặc **QUA LẤY** → Ghi chú số thứ tự → Xác nhận và in phiếu chờ.
- *(QUY TRÌNH XỬ LÝ TRONG TPOS — CHỜ PHÁT TRIỂN LẠI TRÊN WEBSITE NỘI BỘ)*

→ Sau khi ra phiếu chờ hoàn tất sẽ báo các bạn khâu đi chợ vào lấy bill đi hàng.

### Quy trình xử lý sau khi ra đơn — sau khi bàn giao đi chợ:

**Các vấn đề gặp phải:**
- Đơn bị sai, thiếu hoặc dư sản phẩm
- Sai mã và sót mã (hàng thực tế không khớp hoặc không có mã trong bill)
- Khách báo chuyển khoản, sửa địa chỉ SĐT, đổi ý sau khi ra bill

**Cách xử lý các đơn có vấn đề:**
- Check lại đơn và sản phẩm thực tế xem bị sai ở đâu
- Tìm hàng và bổ sung mã nếu có
- Tự xóa bill + nhập lý do xóa + làm lại bill
- Báo lại khách và chụp bill đã chỉnh sửa đúng cho khách
- Trường hợp phiếu hàng chờ đưa lại báo đủ hàng thì ra lại bill mã vạch
- ⚠️ **LƯU Ý:** Những đơn đã được đóng gói ra khu vực SHIP bắt buộc seller đảm nhận đơn đó sẽ ra tìm đơn lại để xử lý.

### Quy trình gom hàng từ kệ vào trong máy xử lý:
- Ra kệ gom tất cả hàng theo số thứ tự được phân công chốt đơn.
- Check từng món hàng xem khách còn vấn đề gì và xử lý.
- Cuối buổi còn những đơn khách quen chưa phản hồi, vẫn đang chờ chuyển khoản hoặc chờ bán hàng sẽ cho hàng vào **bao trắng** sau đó để lên kệ và bàn giao lại cho bạn khâu xử lý đơn trước khi lên live. (Số lượng bao trắng phải khớp với số lượng đơn còn lại trên hệ thống)

### Bước 4: Bàn giao đơn xử lý khi lên live tiếp
- Phải bàn giao lại cho bạn nhận trách nhiệm xử lý những đơn sau live để xử lý tiếp. Không được bỏ sót đơn.

---

## BP5 — Đi chợ & Đối soát hàng (2 bạn đi chợ)

### Khu vực đi chợ — 2 bạn phụ trách

#### Bước 1: Nhận bill & Đi chợ
- Nhận bill từ bạn sale.
- Đi chợ theo đúng STT.
- Check lại số lượng của kệ đó xem có khớp với STT không.
- Bỏ bao đem vào trong tới khu đối soát sản phẩm trên `Tpos`.

#### Chi tiết quy trình đi chợ (Dung phụ trách):
- Sau khi kết thúc live hàng trên live sẽ được đưa xuống đi chợ. Hàng sẽ được sắp xếp theo những con số và thứ tự tương ứng (của tên khách) vào những số đã có sẵn trong bill và số lượng tên và các món trong bill đã có sẵn.
- Trong lúc đi chợ khi các bạn ra đơn sẽ đi lại tên và số thứ tự tên sản phẩm số lượng món giống với bill và tên khách hàng. Trong trường hợp khi bill thiếu hàng trong bill sẽ được giữ lại kiểm tra sau (hoặc tìm gặp sản phẩm). Nếu trường hợp không tìm được sản phẩm hoặc vấn đề khác thì sẽ trực tiếp đưa lại phiếu đặt hàng cho mấy bạn.
- Trong quá trình đi chợ, trong bill (hoặc đơn hàng có thiếu hàng oder) sẽ được giữ lại bill. Khi hàng về đi đủ sản phẩm sẽ tiếp tục đi lại.
- Trường hợp bill khách qua lấy sẽ được giữ lại và để vào chỗ hoặc nơi có sẵn đã có tên bill khi khách qua lấy.
- Trường hợp phiếu đặt hàng cho live thì sẽ giữ lại và gộp, khi mấy bạn làm đơn gộp vào live sau. Trường hợp hàng chưa về kịp sẽ đi chợ vào bao và kiểm tra sản phẩm số lượng tên sản phẩm và tên khách hàng.

### Khu vực đối soát — Sơ đồ xử lý

```
📦 Nhận bao hàng từ đi chợ
        ↓
  Đơn đủ & đúng mã sản phẩm?
    ├── ✅ Đúng → Khu gói hàng
    └── ❌ Sai mã
          ↓
      Bạn đi chợ lấy đúng STT?
        ├── ✅ Đúng STT → Báo bạn làm đơn STT đó kiểm tra sai mã → sửa lại
        └── ❌ Sai STT → Báo bạn đi chợ check lại hàng trên kệ có bị lấy nhầm sản phẩm của STT khách không
```

---

## BP6 — Đóng đơn & Giao shipper (3 bước)

### Bước 1: Đóng gói
- Nhận bao hàng đã được đối soát thành công.
- Kiểm tra lại số lượng thực tế xem có khớp với trên bill không.
- Đóng vào bao và **dán bill niêm yết bao hàng lại**.

### Bước 2: Phân đơn theo khu vực
- Phân đơn theo: **THÀNH PHỐ** và **TỈNH**

### Bước 3: Xuất excel & Quét mã vận đơn
- Vào `Tpos` xuất excel theo từng khu vực.
- Highlight lên để quét mã vận đơn.

**Đơn không có trong excel:** Để riêng ra và đưa lại vào trong cho bạn làm đơn đó.

**Tích đơn xong hết mà thiếu đơn:**
- Vào trong báo các bạn check lại tại sao không thấy đơn
- Nếu đơn có vấn đề: báo xóa bill
- Đơn chưa đóng vào bao: đóng đơn rồi đưa ra ngoài

**Khi đã đủ đơn:** Gọi ship qua lấy hàng.

---

## BP7 — CSKH (Chăm sóc khách hàng — Xử lý đơn bưu cục & ship) — Trực liên tục

> **Nhiệm vụ chính:** Ngồi trực để liên hệ và xử lý những đơn ở bưu cục và bên ship khi khách liên hệ và giao hàng được cho khách.

### Bước 1: Theo dõi & xử lý đơn tại bưu cục
- Khi đơn hàng đang ở bưu cục gặp vấn đề (khách không nhận, không liên lạc được, v.v.), bạn CSKH phải **chủ động liên hệ bưu cục** để nắm tình trạng đơn.
- Phối hợp với bưu cục để hỗ trợ giao lại hoặc xử lý theo từng trường hợp cụ thể.
- Theo dõi và cập nhật trạng thái đơn liên tục cho đến khi đơn được giao thành công hoặc xác nhận hoàn.

### Bước 2: Nhập thông tin & xử lý hoàn
- Đối với những đơn liên hệ nhiều lần hoặc không thể liên hệ được khách, **bắt buộc phải hoàn**.
- Bạn CSKH nhập vào web thông tin khách + đơn hàng để chuẩn bị nhận hoàn.
- Khi hàng hoàn về: nhập nhận trả hàng là xong → toàn bộ hóa đơn có những sản phẩm đó được hoàn trả lại vào kho sản phẩm + **khách được lưu boom**.

### Bước 3: Kiểm tra & nhận hàng hoàn
- Khi bên ship mang hàng hoàn về shop: bạn nhận đủ số đơn, kiểm tra khớp với tờ giấy hàng hoàn ship đưa không.
- Đưa vào trong cho bạn bên bộ phận CSKH trả hàng hoàn.
- Khi đã trả hàng hoàn xong: check lại số tiền và **báo lên group là nhận đủ hàng trong giấy hoàn đơn**.

### Bước 4: Đưa hàng hoàn lên phòng live
- Hàng hoàn khi được trả xong sẽ đưa lên phòng live.
- Có bạn chuyên về hàng boom / hàng hoàn:
  - 🪝 Lấy ra móc mẫu lại lên
  - 🔀 Xào hàng lẻ
  - 🏷️ Note ký hiệu `SL` nếu có số lượng
  - 📦 Hàng có SL: để lên kệ trong phòng live

> 💡 Khi live sale cũng biết `SL` mà báo khách — giúp tăng tỷ lệ chốt đơn cho hàng hoàn.

---

## BP8 — Check IB (Tin nhắn — Bán ngoài live)

> **Nhiệm vụ chính:** Bán những sản phẩm đăng bài hoặc nhận sản phẩm trên live sau khi đã tắt live (khách coi lại và vào IB để hỏi hàng). Hỗ trợ khách khi nhận đơn về có vấn đề cần xử lý.

### Bước 1: Đặt hàng IB qua Zalo
- Các bạn gửi ảnh vào Zalo nếu còn thì thả tim và đặt hàng, nếu hết thì báo lại các bạn báo khách.

### Bước 2: Nhận oder & Gắn thẻ chờ (hàng oder)
- Nhận oder và báo khách chờ **1–2 ngày**.
- Vào web nhập thông tin khách hàng.
- Gắn thẻ chờ sản phẩm: `"TÊN SẢN PHẨM KHÁCH ĐẶT"`
- Khi hàng về: vào thẻ chờ món đó và **ra đơn đồng loạt** để đi đơn (gắn thẻ dành cho hàng oder).

#### Quy trình gắn thẻ chờ trên web Hệ thống quản lí:

**❗ Bước 1:** Bấm vào HIỂN THỊ BỘ LỌC → Chọn chiến dịch live của đợt live đó.

**👉 NẾU GẮN THẺ CHỜ MẪU NHIỀU:**
- Bấm vào **GẮN TAG ĐỒNG LOẠT**
- Tạo tên thẻ cần gắn — VD: `T1 Áo smi trắng tag hoa ...`
- Nhập số thứ tự của khách trên phiếu theo đợt live đó
- Bấm **Lưu**

**👉 NẾU GẮN THẺ CHỜ LẺ ÍT:**
- Kéo xuống thanh tìm kiếm
- Nhập số thứ tự của khách theo trên phiếu hoặc bấm tên khách
- Kéo xuống sẽ hiện ra đúng theo STT hoặc tên trên phiếu
- Bấm vào dấu **gắn tag**
- Tạo tên tag và gắn thẻ

### Bước 3: Đi đơn ngay (hàng có sẵn)
- Note tên khách lên trên bao sản phẩm đó.
- Đi đơn luôn.

### Bước 4: Xử lý đổi size / lỗi sản phẩm
Khách nhận hàng về có vấn đề bị lỗi hoặc muốn đổi size (chật / rộng):
- **Khách ở TP:** Đi đơn **thu về** (shop gửi hàng mới, thu hàng cũ).
- **Khách ở tỉnh:** Khách **gửi sản phẩm cần đổi lên shop**, nhận được sẽ trừ tiền sau.
