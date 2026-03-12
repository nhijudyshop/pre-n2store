# BUSINESS FLOW DOCUMENTATION: Issue-Tracking & Customer Hub Integration

> **Version:** 1.1
> **Last Updated:** 2026-01-22 14:30
> **Purpose:** Tai lieu nghiep vu van hanh day du giua Issue-Tracking va Customer Hub

---

# PHAN 1: NGHIEP VU VAN HANH (NO-CODE)

## 1.1 Tong Quan He Thong

### Muc dich cua 2 Module

| Module | Muc dich | Nguoi dung chinh |
|--------|----------|------------------|
| **Issue-Tracking** | Quan ly su vu sau ban hang (boom, tra hang, sua COD) | Kho, CSKH, Ke toan |
| **Customer Hub** | Quan ly khach hang 360, vi, giao dich | CSKH, Ke toan, Admin |

### Nguyen Tac Cot Loi

```
+-----------------------------------------------------------------------------+
|  CUSTOMER 360 LA NGUON DU LIEU DUY NHAT (Single Source of Truth)            |
+-----------------------------------------------------------------------------+
|                                                                             |
|  * Moi thong tin khach hang deu luu trong PostgreSQL (customers table)      |
|  * Vi khach hang la nguon duy nhat ve so du (customer_wallets table)        |
|  * Issue-Tracking KHONG luu thong tin khach hang rieng                      |
|  * Khi tao ticket -> tu dong tao/lookup customer trong Customer 360         |
|  * Khi hoan tat ticket -> tu dong cap nhat vi khach trong Customer 360      |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## 1.2 So Do Tong Quan Luong Cong Viec

```
                              +--------------------------------------+
                              |        CUSTOMER 360 DATABASE         |
                              |     (PostgreSQL - Source of Truth)   |
                              +--------------------------------------+
                              |  customers | customer_wallets        |
                              |  wallet_transactions | virtual_credits|
                              |  customer_tickets | customer_activities|
                              +---------------+-----------------------+
                                              |
                    +-------------------------+-------------------------+
                    |                         |                         |
                    v                         v                         v
          +-----------------+      +-----------------+      +-----------------+
          |  ISSUE-TRACKING |      |  CUSTOMER-HUB   |      | BALANCE-HISTORY |
          |                 |      |                 |      |                 |
          | * Tao ticket    |      | * Xem 360 view  |      | * Link giao dich|
          | * Nhan hang     |      | * Nap/Rut vi    |      | * Auto-deposit  |
          | * Cong vi tu dong|     | * Cap cong no ao|      | * Duyet CK      |
          +--------+--------+      +--------+--------+      +--------+--------+
                   |                        |                        |
                   |   +--------------------+--------------------+   |
                   |   |                    |                    |   |
                   v   v                    v                    v   v
          +---------------------------------------------------------------------+
          |                    SSE REAL-TIME UPDATES                            |
          |              (Cap nhat tuc thi giua cac module)                     |
          +---------------------------------------------------------------------+
```

---

## 1.3 Cac Loai Su Vu va Luong Xu Ly

### Bang Tom Tat 5 Loai Su Vu

| Loai | Ma | Status Ban Dau | Co Hang Ve? | Cong Vi? | Loai Cong Vi |
|------|-----|---------------|-------------|----------|--------------|
| **Boom hang** | `BOOM` | PENDING_GOODS | Co | **Khong** | - |
| **Sua COD (Tu choi 1 phan)** | `FIX_COD` + `REJECT_PARTIAL` | PENDING_GOODS | Co | Khong | - |
| **Sua COD (Ship sai/Giam gia/Tru no)** | `FIX_COD` + (khac) | PENDING_FINANCE | Khong | Khong | - |
| **Khach gui ve** | `RETURN_CLIENT` | PENDING_GOODS | Co | Co | **deposit** (tien that) |
| **Thu ve (Doi hang)** | `RETURN_SHIPPER` | PENDING_GOODS | Co | Co | **virtual_credit** (cong no ao 15 ngay) |
| **CSKH khac** | `OTHER` | COMPLETED | Khong | Khong | - |

> **LUU Y QUAN TRONG:**
> - **BOOM/FIX_COD khong cong vi** vi khach CHUA tra tien (khong nhan hang = khong tra COD)
> - Chi **RETURN_CLIENT** va **RETURN_SHIPPER** moi cong vi vi khach DA tra COD roi moi tra hang

---

## 1.4 Luong Chi Tiet Tung Loai Su Vu

### 1.4.1 BOOM HANG - Khach Khong Nhan Don

```
+-----------------------------------------------------------------------------+
|                        LUONG BOOM HANG                                      |
+-----------------------------------------------------------------------------+
|                                                                             |
|  BUOC 1: SHIPPER BAO BOOM                                                   |
|  +-------------+                                                            |
|  | Shipper goi |--> CSKH mo Issue-Tracking --> Tim don theo SDT/MVD         |
|  | "KH khong   |                                                            |
|  |  nhan don"  |                                                            |
|  +-------------+                                                            |
|                                                                             |
|  BUOC 2: TAO TICKET                                                         |
|  +-----------------------------------------------------------------------+  |
|  | * Chon loai: BOOM                                                     |  |
|  | * Chon tat ca SP trong don (auto-select)                              |  |
|  | * So tien = Tong COD don hang                                         |  |
|  | * Status: PENDING_GOODS (Cho hang ve)                                 |  |
|  | * Customer tu dong tao neu chua co                                    |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  BUOC 3: KHO NHAN HANG (1-10 ngay sau)                                      |
|  +-----------------------------------------------------------------------+  |
|  | * Kho kiem tra hang ve --> Bam "Nhan hang"                            |  |
|  | * He thong tu dong:                                                   |  |
|  |   1. Tao Phieu tra hang tren TPOS (5 API calls)                       |  |
|  |   2. In phieu tra hang                                                |  |
|  |   3. KHONG cong vi (khach khong tra COD)                              |  |
|  |   4. Status --> COMPLETED                                             |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  KET QUA:                                                                   |
|  +-----------------------------------------------------------------------+  |
|  | * Ton kho TPOS +1 (hang ve kho)                                       |  |
|  | * Vi khach KHONG THAY DOI (khach khong tra COD nen khong hoan)        |  |
|  | * Customer 360 hien thi: ticket hoan tat                              |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  ** TRUONG HOP DAC BIET: DON THANH TOAN TRUOC **                           |
|  +-----------------------------------------------------------------------+  |
|  | Neu don da duoc thanh toan truoc (CK truoc giao), khach boom:         |  |
|  | -> Ke toan phai cong vi THU CONG qua Customer Hub                     |  |
|  | -> Ghi chu: "Hoan tien don TT truoc - [Ma don]"                       |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### 1.4.2 KHACH GUI VE (RETURN_CLIENT) - Khach Gui Hang Qua Buu Dien

```
+-----------------------------------------------------------------------------+
|                    LUONG KHACH GUI VE (RETURN_CLIENT)                       |
+-----------------------------------------------------------------------------+
|                                                                             |
|  TINH HUONG: Khach o tinh muon doi hang, tu gui hang ve shop               |
|                                                                             |
|  BUOC 1: CSKH NHAN YEU CAU                                                  |
|  +-------------+                                                            |
|  | KH nhan tin |--> "Em muon doi size ao, em gui ve shop"                   |
|  +-------------+                                                            |
|                                                                             |
|  BUOC 2: TAO TICKET                                                         |
|  +-----------------------------------------------------------------------+  |
|  | * Chon loai: KHACH GUI (RETURN_CLIENT)                                |  |
|  | * Nhap ma van don khach gui ve                                        |  |
|  | * Chon SP khach gui ve                                                |  |
|  | * So tien = Gia SP duoc chon (VD: 300,000d)                           |  |
|  | * Status: PENDING_GOODS                                               |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  BUOC 3: KHO NHAN HANG                                                      |
|  +-----------------------------------------------------------------------+  |
|  | * Kho nhan buu kien tu buu dien                                       |  |
|  | * Kiem tra hang OK --> Bam "Nhan hang"                                |  |
|  | * He thong tu dong:                                                   |  |
|  |   1. Tao Phieu tra hang tren TPOS                                     |  |
|  |   2. Cong 300,000d vao vi KH (DEPOSIT - tien that)                    |  |
|  |   3. Status --> COMPLETED                                             |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  BUOC 4: KH DAT DON MOI (tuy chon)                                          |
|  +-----------------------------------------------------------------------+  |
|  | * KH dat don moi 350,000d                                             |  |
|  | * COD thuc = 350,000 - 300,000 (so du vi) = 50,000d                   |  |
|  | * Hoac KH xin rut tien ve tai khoan ngan hang                         |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  DIEM KHAC BIET:                                                            |
|  * Cong vao vi = TIEN THAT (khong het han)                                  |
|  * KH co the xin rut tien ve tai khoan                                      |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### 1.4.3 THU VE (RETURN_SHIPPER) - Doi Hang Tai Nha

> **CAP NHAT 2026-01-20:** RETURN_SHIPPER cap virtual_credit NGAY khi tao ticket (khong phai khi RECEIVE)

```
+-----------------------------------------------------------------------------+
|                    LUONG THU VE (RETURN_SHIPPER)                            |
+-----------------------------------------------------------------------------+
|                                                                             |
|  TINH HUONG: KH muon doi size, shipper giao don moi + thu hang cu ve       |
|                                                                             |
|  BUOC 1: CSKH TAO TICKET                                                    |
|  +-----------------------------------------------------------------------+  |
|  | * Chon loai: THU VE (RETURN_SHIPPER)                                  |  |
|  | * Chon SP khach se tra lai                                            |  |
|  | * So tien = Gia SP (VD: 300,000d)                                     |  |
|  | * Status: PENDING_GOODS                                               |  |
|  | * **He thong CAP NGAY virtual_credit 300,000d (het han 15 ngay)**     |  |
|  | * **API: POST /api/v2/tickets/new/resolve-credit**                    |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  BUOC 2: KH DAT DON MOI (trong 15 ngay)                                     |
|  +-----------------------------------------------------------------------+  |
|  | * KH dat don moi 350,000d                                             |  |
|  | * COD thuc = 350,000 - 300,000 (cong no ao) = 50,000d                 |  |
|  | * Shipper giao don moi + Thu hang cu ve                               |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  BUOC 3: KHO NHAN HANG CU                                                   |
|  +-----------------------------------------------------------------------+  |
|  | * Shipper mang hang cu ve kho                                         |  |
|  | * Kho kiem tra --> Bam "Nhan hang"                                    |  |
|  | * Tao Phieu tra hang TPOS                                             |  |
|  | * Status --> COMPLETED                                                |  |
|  | * **KHONG CONG VI (da cap khi tao ticket)**                           |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  TRUONG HOP XAU: KH KHONG DAT DON MOI                                       |
|  +-----------------------------------------------------------------------+  |
|  | * Sau 15 ngay, cong no ao tu dong EXPIRED                             |  |
|  | * Cron job chay moi gio kiem tra va expire                            |  |
|  | * CSKH can lien he KH de xu ly                                        |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  DIEM KHAC BIET VOI RETURN_CLIENT:                                          |
|  * RETURN_SHIPPER: Cap virtual_credit NGAY khi tao ticket                   |
|  * RETURN_CLIENT: Cong deposit khi RECEIVE (nhan hang ve kho)               |
|  * Cong no ao het han sau 15 ngay neu khong dung                            |
|  * KHONG THE rut tien ve tai khoan                                          |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## 1.5 Luong Tich Hop Giua 2 Module

### So Do Tich Hop Issue-Tracking <-> Customer Hub

```
+------------------------------------------------------------------------------+
|                   LUONG TICH HOP ISSUE-TRACKING <-> CUSTOMER HUB             |
+------------------------------------------------------------------------------+
|                                                                              |
|  (1) TAO TICKET (Issue-Tracking)                                             |
|  +--------------------------------------------------------------------------+|
|  | 1. User nhap SDT khach hang                                              ||
|  | 2. Issue-Tracking goi API: GET /api/customer/:phone                      ||
|  |    +- Neu co --> Hien thi: Ten, Tier, So du vi                           ||
|  |    +- Neu khong --> Hien thi: "Khach hang moi se duoc tao"               ||
|  | 3. User bam "Tao phieu"                                                  ||
|  | 4. API: POST /api/ticket goi getOrCreateCustomer()                       ||
|  | 5. Customer duoc tao trong PostgreSQL (neu chua co)                      ||
|  | 6. Wallet duoc tao tu dong (balance = 0)                                 ||
|  +--------------------------------------------------------------------------+|
|                              |                                               |
|                              v                                               |
|  (2) XEM CUSTOMER 360 (Customer Hub)                                         |
|  +--------------------------------------------------------------------------+|
|  | 1. User mo Customer Hub, tim khach theo SDT                              ||
|  | 2. Thay ticket vua tao trong danh sach "Lich su su vu"                   ||
|  | 3. Thay wallet balance = 0                                               ||
|  +--------------------------------------------------------------------------+|
|                              |                                               |
|                              v                                               |
|  (3) HOAN TAT TICKET (Issue-Tracking)                                        |
|  +--------------------------------------------------------------------------+|
|  | 1. Kho bam "Nhan hang"                                                   ||
|  | 2. He thong tao Phieu tra hang TPOS (5 API calls)                        ||
|  | 3. API: POST /api/v2/tickets/:id/resolve                                 ||
|  |    +- RETURN_CLIENT --> processDeposit() --> balance += 300,000          ||
|  |    +- RETURN_SHIPPER --> issueVirtualCredit() --> virtual += 300,000     ||
|  | 4. SSE event: wallet_update gui toi tat ca clients                       ||
|  +--------------------------------------------------------------------------+|
|                              |                                               |
|                              v                                               |
|  (4) CAP NHAT REAL-TIME (Customer Hub)                                       |
|  +--------------------------------------------------------------------------+|
|  | 1. Customer Hub nhan SSE event wallet_update                             ||
|  | 2. Wallet panel tu dong refresh                                          ||
|  | 3. Hien thi: "So du thuc: 300,000d" hoac "Cong no ao: 300,000d"          ||
|  | 4. Transaction history hien thi giao dich moi                            ||
|  | 5. Activity timeline hien thi "Ticket hoan tat"                          ||
|  +--------------------------------------------------------------------------+|
|                                                                              |
+------------------------------------------------------------------------------+
```

---

## 1.6 Luong Nap Tien Tu Chuyen Khoan Ngan Hang

```
+------------------------------------------------------------------------------+
|              LUONG CHUYEN KHOAN -> VI KHACH HANG                             |
+------------------------------------------------------------------------------+
|                                                                              |
|  (1) KHACH CHUYEN KHOAN                                                      |
|  +--------------------------------------------------------------------------+|
|  | Noi dung CK: "0977888999 nap tien" hoac "N2ABCD1234567890"               ||
|  +--------------------------------------------------------------------------+|
|                              |                                               |
|                              v                                               |
|  (2) SEPAY WEBHOOK NHAN GIAO DICH                                            |
|  +--------------------------------------------------------------------------+|
|  | 1. SePay gui webhook den /api/sepay/webhook                              ||
|  | 2. Luu vao balance_history table                                         ||
|  | 3. Goi processDebtUpdate() de tim khach hang                             ||
|  +--------------------------------------------------------------------------+|
|                              |                                               |
|              +---------------+-------------------+                           |
|              |                                   |                           |
|              v                                   v                           |
|  +-------------------------+      +-----------------------------+            |
|  | MATCH THANH CONG        |      | MATCH KHONG RO RANG         |            |
|  | (QR code / Full phone)  |      | (Partial phone / Nhieu KH)  |            |
|  +-------------------------+      +-----------------------------+            |
|  | verification_status:    |      | verification_status:        |            |
|  | AUTO_APPROVED           |      | PENDING_VERIFICATION        |            |
|  |                         |      |                             |            |
|  | Cong vi ngay lap tuc    |      | Cho Ke toan duyet          |            |
|  +-------------------------+      +-----------------------------+            |
|                                                          |                   |
|                                                          v                   |
|                              +--------------------------------------------+  |
|                              | (3) KE TOAN DUYET (Balance-History)        |  |
|                              +--------------------------------------------+  |
|                              | * Mo tab "Cho Duyet"                       |  |
|                              | * Xem giao dich + chon dung KH tu dropdown |  |
|                              | * Bam "Duyet" --> Cong vao vi              |  |
|                              | * Hoac "Tu choi" neu khong match           |  |
|                              +--------------------------------------------+  |
|                                                          |                   |
|                                                          v                   |
|  (4) CAP NHAT CUSTOMER HUB                                                   |
|  +--------------------------------------------------------------------------+|
|  | * Wallet balance tang len                                                ||
|  | * Transaction history co giao dich "Nap tu CK ngan hang"                 ||
|  | * SSE real-time update                                                   ||
|  +--------------------------------------------------------------------------+|
|                                                                              |
+------------------------------------------------------------------------------+
```

---

## 1.7 Phan Quyen Theo Vai Tro

| Chuc nang | CSKH | Kho | Ke toan | Admin |
|-----------|------|-----|---------|-------|
| **Issue-Tracking** |
| Tao ticket | Yes | Yes | Yes | Yes |
| Nhan hang (RECEIVE) | No | Yes | Yes | Yes |
| Thanh toan (PAY) | No | No | Yes | Yes |
| Xoa ticket | No | No | No | Yes |
| **Customer Hub** |
| Xem 360 | Yes | Yes | Yes | Yes |
| Nap tien vi | No | No | Yes | Yes |
| Rut tien vi | No | No | Yes | Yes |
| Cap cong no ao | No | No | Yes | Yes |
| **Balance-History** |
| Link giao dich | Yes | No | Yes | Yes |
| Duyet giao dich | No | No | Yes | Yes |
| Tu choi giao dich | No | No | Yes | Yes |

---

# PHAN 2: CHI TIET KY THUAT (CODE)

## 2.1 Kien Truc He Thong

```
+-----------------------------------------------------------------------------+
|                           ARCHITECTURE OVERVIEW                              |
+-----------------------------------------------------------------------------+
|                                                                             |
|  FRONTEND (Browser)                                                         |
|  +-----------------+  +-----------------+  +-----------------+              |
|  | issue-tracking/ |  | customer-hub/   |  | balance-history/|              |
|  | index.html      |  | index.html      |  | index.html      |              |
|  | js/script.js    |  | js/main.js      |  | js/main.js      |              |
|  | js/api-service  |  | js/api-service  |  | js/verification |              |
|  +--------+--------+  +--------+--------+  +--------+--------+              |
|           |                    |                    |                       |
|           +--------------------+--------------------+                       |
|                                |                                            |
|                                v                                            |
|  +-----------------------------------------------------------------------+  |
|  |              CLOUDFLARE WORKER PROXY                                  |  |
|  |          (chatomni-proxy.nhijudyshop.workers.dev)                     |  |
|  |                                                                       |  |
|  |  Routes:                                                              |  |
|  |  * /api/v2/customers/* --> handleCustomer360Proxy()                   |  |
|  |  * /api/v2/wallets/*   --> handleCustomer360Proxy()                   |  |
|  |  * /api/v2/tickets/*   --> handleCustomer360Proxy()                   |  |
|  |  * /api/ticket*        --> handleCustomer360Proxy() (legacy)          |  |
|  |  * /api/rest/*         --> handleTposRest() (TPOS API)                |  |
|  +----------------------------------+------------------------------------+  |
|                                     |                                       |
|                                     v                                       |
|  BACKEND (Render.com)                                                       |
|  +-----------------------------------------------------------------------+  |
|  |                         server.js                                     |  |
|  +-----------------------------------------------------------------------+  |
|  |  Routes:                              Services:                       |  |
|  |  +- routes/v2/tickets.js              +- services/wallet-event-       |  |
|  |  +- routes/v2/customers.js            |   processor.js                |  |
|  |  +- routes/v2/wallets.js              +- services/tpos-customer-      |  |
|  |  +- routes/v2/balance-history.js      |   service.js                  |  |
|  |  +- routes/sepay-webhook.js           +- services/customer-           |  |
|  |  +- routes/realtime-sse.js                creation-service.js         |  |
|  +----------------------------------+------------------------------------+  |
|                                     |                                       |
|                                     v                                       |
|  DATABASE (PostgreSQL @ Render)                                             |
|  +-----------------------------------------------------------------------+  |
|  |  Tables:                                                              |  |
|  |  * customers           | customer_wallets      | wallet_transactions  |  |
|  |  * virtual_credits     | customer_tickets      | customer_activities  |  |
|  |  * balance_history     | balance_customer_info                        |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## 2.2 API Endpoints Chi Tiet

### 2.2.1 Ticket APIs (`/api/v2/tickets`)

| Method | Endpoint | Mo ta | File |
|--------|----------|-------|------|
| POST | `/` | Tao ticket moi | routes/v2/tickets.js:178 |
| GET | `/` | Lay danh sach tickets | routes/v2/tickets.js:78 |
| GET | `/:id` | Lay chi tiet ticket | routes/v2/tickets.js:127 |
| PATCH | `/:id` | Cap nhat ticket | routes/v2/tickets.js:252 |
| POST | `/:id/resolve` | Hoan tat + cong vi | routes/v2/tickets.js:362 |
| DELETE | `/:id` | Xoa ticket | routes/v2/tickets.js:487 |

### 2.2.2 Wallet APIs (`/api/v2/wallets`)

| Method | Endpoint | Mo ta | File |
|--------|----------|-------|------|
| GET | `/:phone` | Lay thong tin vi | routes/v2/wallets.js |
| POST | `/:phone/deposit` | Nap tien that | routes/v2/wallets.js |
| POST | `/:phone/withdraw` | Rut tien (FIFO) | routes/v2/wallets.js |
| POST | `/:phone/virtual-credit` | Cap cong no ao | routes/v2/wallets.js |
| GET | `/:phone/transactions` | Lich su giao dich | routes/v2/wallets.js |

---

## 2.3 Code Chi Tiet Cac Chuc Nang Chinh

### 2.3.1 Tao Ticket + Auto-Create Customer

**Frontend: issue-tracking/js/script.js (line 776-912)**

```javascript
async function handleSubmitTicket() {
  // 1. Xac dinh status ban dau theo loai ticket
  let status, products, money;

  switch(selectedType) {
    case 'BOOM':
      status = 'PENDING_GOODS';
      money = selectedOrder.cod;
      products = selectedProducts; // Tat ca SP
      break;

    case 'RETURN_CLIENT':
    case 'RETURN_SHIPPER':
      status = 'PENDING_GOODS';
      money = products.reduce((sum, p) => sum + (p.price * p.returnQuantity), 0);
      break;

    case 'FIX_COD':
      if (reason === 'REJECT_PARTIAL') {
        status = 'PENDING_GOODS';
      } else {
        status = 'PENDING_FINANCE';
      }
      money = originalCod - newCod;
      break;

    case 'OTHER':
      status = 'COMPLETED';
      money = 0;
      break;
  }

  // 2. Goi API tao ticket
  const ticketData = {
    phone: selectedOrder?.phone || currentCustomer?.phone,
    customer_name: selectedOrder?.customer || currentCustomer?.name,
    tpos_id: selectedOrder?.id,
    type: selectedType,
    status,
    products,
    money,
    note
  };

  const result = await ApiService.createTicket(ticketData);
}
```

**Backend: routes/v2/tickets.js (line 178-250)**

```javascript
router.post('/', async (req, res) => {
  const { phone, customer_name, type, status, products, money, note } = req.body;

  await db.query('BEGIN');

  // 1. Normalize phone va tao/lookup customer
  const normalizedPhone = normalizePhone(phone);
  const { customerId } = await getOrCreateCustomer(db, normalizedPhone, customer_name);

  // 2. Cap nhat address neu co
  if (customer_address) {
    await db.query(`
      UPDATE customers SET address = $1, updated_at = NOW()
      WHERE id = $2 AND (address IS NULL OR address = '')
    `, [customer_address, customerId]);
  }

  // 3. Tao ticket (ticket_code auto-generated by trigger)
  const result = await db.query(`
    INSERT INTO customer_tickets (
      phone, customer_id, type, status, products, money, note
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [normalizedPhone, customerId, type, status, JSON.stringify(products), money, note]);

  // 4. Log activity
  await db.query(`
    INSERT INTO customer_activities (phone, customer_id, activity_type, title)
    VALUES ($1, $2, 'TICKET_CREATED', $3)
  `, [normalizedPhone, customerId, `Tao phieu ${result.rows[0].ticket_code}`]);

  await db.query('COMMIT');

  // 5. SSE notify
  sseRouter.notifyClients('tickets', { action: 'created', ticket: result.rows[0] });

  res.json({ success: true, data: result.rows[0] });
});
```

### 2.3.2 RECEIVE Action + Cong Vi

> **CAP NHAT 2026-01-20:** Logic cong vi da thay doi:
> - **RETURN_SHIPPER**: Cap virtual_credit NGAY khi tao ticket (KHONG phai khi RECEIVE)
> - **RETURN_CLIENT**: Cong deposit khi RECEIVE (giu nguyen)

**Frontend: issue-tracking/js/script.js (line 1073-1130)**

```javascript
async function handleConfirmAction() {
  if (pendingActionType === 'RECEIVE') {
    // 1. Tao phieu tra hang TPOS
    const result = await ApiService.processRefund(ticket.tposId, {
      products: ticket.products,
      note: `Ticket ${ticket.ticketCode}`
    });

    // 2. Cap nhat status ticket
    await ApiService.updateTicket(ticket.ticketCode, {
      status: 'COMPLETED',
      completedAt: new Date().toISOString()
    });

    // 3. CHI CONG VI CHO RETURN_CLIENT
    // RETURN_SHIPPER da duoc cap virtual_credit khi TAO ticket roi
    const compensationAmount = parseFloat(ticket.money) || 0;
    const customerPhone = ticket.phone;

    if (compensationAmount > 0 && customerPhone && ticket.type === 'RETURN_CLIENT') {
      // Chi RETURN_CLIENT moi cong deposit khi nhan hang
      await fetch(`${API_URL}/api/v2/tickets/${ticketId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compensation_amount: compensationAmount,
          compensation_type: 'deposit',  // Tien that cho RETURN_CLIENT
          performed_by: window.authManager?.getUserInfo()?.username || 'warehouse_staff',
          note: `Hoan tien tu ticket ${ticket.ticketCode}`
        })
      });
    }
    // RETURN_SHIPPER: Khong goi resolve vi da cap virtual_credit khi tao ticket
  }
}
```

**Backend: routes/v2/tickets.js (line 362-481)**

```javascript
router.post('/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const { compensation_amount, compensation_type, performed_by, note } = req.body;

  await db.query('BEGIN');

  // 1. Get ticket
  const ticket = (await db.query(`
    SELECT * FROM customer_tickets WHERE ticket_code = $1 FOR UPDATE
  `, [id])).rows[0];

  // 2. Issue compensation
  if (compensation_amount > 0) {
    if (compensation_type === 'virtual_credit') {
      // Cap cong no ao (het han 15 ngay)
      await issueVirtualCredit(
        db,
        ticket.phone,
        compensation_amount,
        ticket.ticket_code,
        note || `Boi thuong ticket ${ticket.ticket_code}`,
        15 // expires in 15 days
      );
    } else if (compensation_type === 'deposit') {
      // Cong tien that
      await processDeposit(
        db,
        ticket.phone,
        compensation_amount,
        ticket.id,
        note || `Hoan tien ticket ${ticket.ticket_code}`,
        ticket.customer_id
      );
    }
  }

  // 3. Update ticket status
  await db.query(`
    UPDATE customer_tickets
    SET status = 'COMPLETED', completed_at = NOW(), wallet_credited = TRUE
    WHERE id = $1
  `, [ticket.id]);

  // 4. Log activity
  await db.query(`
    INSERT INTO customer_activities (phone, customer_id, activity_type, title)
    VALUES ($1, $2, 'TICKET_COMPLETED', $3)
  `, [ticket.phone, ticket.customer_id, `Hoan thanh ${ticket.ticket_code}`]);

  await db.query('COMMIT');

  // 5. SSE notify
  sseRouter.notifyClients('tickets', { action: 'resolved', ticket });

  res.json({ success: true });
});
```

### 2.3.3 Wallet Event Processor

> **LUU Y QUAN TRONG (2026-01-20):** Function `issueVirtualCredit()` bypass bang `wallet_transactions`
> vi constraint `wallet_transactions_type_check` khong bao gom type 'VIRTUAL_CREDIT_ISSUED'.
> Thay vao do, truc tiep insert vao `virtual_credits` va update `customer_wallets.virtual_balance`.

**Backend: services/wallet-event-processor.js**

```javascript
// Deposit tien that
async function processDeposit(db, phone, amount, referenceId, note, customerId = null) {
  // Idempotency check
  const check = await db.query(
    'SELECT wallet_processed FROM balance_history WHERE id = $1',
    [referenceId]
  );
  if (check.rows[0]?.wallet_processed) {
    console.log(`[WALLET] Skipping duplicate deposit for ${referenceId}`);
    return { success: true, skipped: true };
  }

  return processWalletEvent(db, {
    type: 'DEPOSIT',
    phone,
    amount,
    source: 'BANK_TRANSFER',
    referenceType: 'balance_history',
    referenceId,
    note,
    customerId
  });
}

// Cap cong no ao
async function issueVirtualCredit(db, phone, amount, ticketId, reason, expiresInDays = 30) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const wallet = await getOrCreateWallet(db, phone);

  // Tao virtual credit record
  await db.query(`
    INSERT INTO virtual_credits (
      phone, wallet_id, original_amount, remaining_amount,
      expires_at, source_type, source_id, note, status
    ) VALUES ($1, $2, $3, $3, $4, 'TICKET', $5, $6, 'ACTIVE')
  `, [phone, wallet.id, amount, expiresAt, ticketId, reason]);

  // Process wallet event
  return processWalletEvent(db, {
    type: 'VIRTUAL_CREDIT_ISSUED',
    phone,
    amount,
    source: 'TICKET_REFUND',
    referenceType: 'ticket',
    referenceId: ticketId,
    note: reason
  });
}

// Core wallet event processor
async function processWalletEvent(db, event) {
  const { type, phone, amount, source, referenceType, referenceId, note, customerId } = event;

  await db.query('BEGIN');

  // 1. Get or create wallet
  const wallet = await getOrCreateWallet(db, phone, customerId);

  // 2. Calculate new balance
  let newBalance = parseFloat(wallet.balance);
  let newVirtual = parseFloat(wallet.virtual_balance);

  if (type === 'DEPOSIT') {
    newBalance += parseFloat(amount);
  } else if (type === 'VIRTUAL_CREDIT_ISSUED') {
    newVirtual += parseFloat(amount);
  }

  // 3. Update wallet
  await db.query(`
    UPDATE customer_wallets
    SET balance = $1, virtual_balance = $2, updated_at = NOW()
    WHERE phone = $3
  `, [newBalance, newVirtual, phone]);

  // 4. Create transaction record
  const txResult = await db.query(`
    INSERT INTO wallet_transactions (
      phone, wallet_id, type, amount, balance_before, balance_after,
      source, reference_type, reference_id, note
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
  `, [phone, wallet.id, type, amount, wallet.balance, newBalance,
      source, referenceType, referenceId, note]);

  await db.query('COMMIT');

  // 5. Emit SSE event
  walletEvents.emit('wallet:update', {
    phone,
    wallet: { ...wallet, balance: newBalance, virtual_balance: newVirtual },
    transaction: { id: txResult.rows[0].id, type, amount, note }
  });

  return { success: true, transactionId: txResult.rows[0].id };
}
```

### 2.3.4 SSE Real-time Updates

**Backend: routes/realtime-sse.js**

```javascript
const { walletEvents } = require('../services/wallet-event-processor');

// Listen for wallet updates and notify SSE clients
walletEvents.on('wallet:update', (data) => {
  const { phone, wallet, transaction } = data;

  // Notify clients subscribed to this phone's wallet
  const key = `wallet:${phone}`;
  const clients = sseClients.get(key);

  if (clients && clients.size > 0) {
    const message = JSON.stringify({
      key,
      data: { phone, wallet, transaction, timestamp: Date.now() },
      event: 'wallet_update'
    });

    clients.forEach(client => {
      client.write(`event: wallet_update\n`);
      client.write(`data: ${message}\n\n`);
    });
  }

  // Also notify wildcard watchers (admin dashboard)
  notifyClientsWildcard('wallet', data, 'wallet_update');
});
```

**Frontend: customer-hub/js/modules/wallet-panel.js**

```javascript
subscribeToRealtimeUpdates() {
  const phone = this.currentCustomer?.phone;
  if (!phone) return;

  const eventSource = new EventSource(
    `${API_BASE}/api/realtime/sse?keys=wallet:${phone}`
  );

  eventSource.addEventListener('wallet_update', (event) => {
    const data = JSON.parse(event.data);
    this.handleWalletUpdate(data);
  });
}

handleWalletUpdate(data) {
  // Update UI
  this.walletData = data.wallet;
  this.render();

  // Show notification
  this.showUpdateNotification(
    `So du cap nhat: ${data.wallet.balance.toLocaleString()}d`
  );
}
```

### 2.3.5 Cap Virtual Credit khi tao ticket RETURN_SHIPPER (NEW 2026-01-20)

**Frontend: issue-tracking/js/script.js (line 943-980)**

Khi tao ticket RETURN_SHIPPER, he thong tu dong cap cong no ao NGAY LAP TUC:

```javascript
// Sau khi tao ticket thanh cong
if (type === 'RETURN_SHIPPER' && money > 0 && customerPhone) {
    try {
        const resolveResult = await fetch(
            `${ApiService.RENDER_API_URL}/api/v2/tickets/new/resolve-credit`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: customerPhone,
                    amount: money,
                    ticket_code: result.data?.ticket_code || ticketData.orderId,
                    note: `Cong no ao - Thu ve don ${tposOrderId}`,
                    expires_in_days: 15
                })
            }
        );

        if (resolveResult.ok) {
            notificationManager.success(
                `Da cap ${money.toLocaleString()}d cong no ao cho ${customerPhone}`,
                3000,
                'Cong no ao'
            );
        }
    } catch (err) {
        console.error('[APP] Failed to issue virtual credit:', err);
        notificationManager.warning('Khong the cap cong no ao tu dong', 5000);
    }
}
```

**Backend: render.com/routes/v2/tickets.js (line 539-591)**

```javascript
router.post('/new/resolve-credit', async (req, res) => {
    const { phone, amount, ticket_code, note, expires_in_days = 15 } = req.body;

    if (!phone || !amount) {
        return res.status(400).json({ error: 'Missing phone or amount' });
    }

    const normalizedPhone = normalizePhone(phone);

    try {
        // Tao customer neu chua co
        const { customerId } = await getOrCreateCustomer(db, normalizedPhone);

        // Cap virtual credit (bypass wallet_transactions)
        const result = await issueVirtualCredit(
            db,
            normalizedPhone,
            amount,
            ticket_code,
            note || `Virtual credit for ticket ${ticket_code}`,
            expires_in_days
        );

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

### 2.3.6 Wallet History - UNION Query (NEW 2026-01-20)

De hien thi virtual credits trong lich su giao dich, su dung UNION query:

**File:** render.com/routes/customer-360.js (line 478-507)

```sql
WITH combined AS (
    -- Giao dich tien that tu wallet_transactions
    SELECT id, phone, type, amount, balance_before, balance_after,
           source, reference_type, reference_id, note, created_at,
           NULL::timestamp as expires_at
    FROM wallet_transactions
    WHERE phone = $1

    UNION ALL

    -- Cong no ao tu virtual_credits
    SELECT id, phone, 'VIRTUAL_CREDIT_ISSUED' as type,
           original_amount as amount,
           0 as balance_before, 0 as balance_after,
           'TICKET_REFUND' as source,
           'ticket' as reference_type, source_id as reference_id,
           note, created_at, expires_at
    FROM virtual_credits
    WHERE phone = $1 AND status = 'ACTIVE'
)
SELECT *,
    (expires_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') as expires_at
FROM combined
ORDER BY created_at DESC
LIMIT $2 OFFSET $3
```

### 2.3.7 UI - Hien thi han su dung cong no ao (NEW 2026-01-20)

**File:** customer-hub/js/modules/wallet-panel.js (line 430-471)

```javascript
_renderTransactionItem(tx) {
    const isCredit = tx.type === 'DEPOSIT' || tx.type === 'VIRTUAL_CREDIT' ||
                     tx.type === 'VIRTUAL_CREDIT_ISSUED';

    const typeLabels = {
        'DEPOSIT': 'Nap tien',
        'WITHDRAW': 'Rut tien',
        'VIRTUAL_CREDIT': 'Cong cong no ao',
        'VIRTUAL_CREDIT_ISSUED': 'Cong cong no ao (Thu ve)',
        'VIRTUAL_DEBIT': 'Tru cong no ao',
        'VIRTUAL_EXPIRE': 'Cong no het han'
    };

    // Hien thi han su dung cho VIRTUAL_CREDIT_ISSUED
    let expiryText = '';
    if (tx.type === 'VIRTUAL_CREDIT_ISSUED' && tx.expires_at) {
        const expiryDate = new Date(tx.expires_at);
        const expiryStr = expiryDate.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        expiryText = `<span class="text-orange-500 ml-1">• HSD: ${expiryStr}</span>`;
    }

    return `
        <div class="flex items-center justify-between py-2">
            <div>
                <span class="font-medium">${typeLabels[tx.type] || tx.type}</span>
                ${expiryText}
            </div>
            <span class="${isCredit ? 'text-green-600' : 'text-red-600'}">
                ${isCredit ? '+' : '-'}${this._formatMoney(tx.amount)}
            </span>
        </div>
    `;
}
```

---

## 2.4 Database Schema

### Tables chinh

```sql
-- customers: Thong tin khach hang
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  address TEXT,
  email VARCHAR(255),
  tier VARCHAR(20) DEFAULT 'new',
  tpos_id VARCHAR(50),
  tpos_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- customer_wallets: Vi khach hang
CREATE TABLE customer_wallets (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  balance DECIMAL(15,2) DEFAULT 0,        -- Tien that
  virtual_balance DECIMAL(15,2) DEFAULT 0, -- Cong no ao
  total_deposited DECIMAL(15,2) DEFAULT 0,
  total_withdrawn DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- virtual_credits: Cong no ao (co thoi han)
CREATE TABLE virtual_credits (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  wallet_id INTEGER REFERENCES customer_wallets(id),
  original_amount DECIMAL(15,2) NOT NULL,
  remaining_amount DECIMAL(15,2) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  source_type VARCHAR(30), -- 'TICKET', 'MANUAL'
  source_id VARCHAR(50),
  note TEXT,
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, USED, EXPIRED
  created_at TIMESTAMP DEFAULT NOW()
);

-- customer_tickets: Phieu xu ly su vu
CREATE TABLE customer_tickets (
  id SERIAL PRIMARY KEY,
  ticket_code VARCHAR(20) UNIQUE, -- Auto-generated: TV-2026-00001
  phone VARCHAR(20) NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  tpos_id INTEGER,
  type VARCHAR(30) NOT NULL, -- BOOM, FIX_COD, RETURN_CLIENT, RETURN_SHIPPER, OTHER
  status VARCHAR(30) DEFAULT 'PENDING_GOODS',
  products JSONB,
  money DECIMAL(15,2) DEFAULT 0,
  note TEXT,
  wallet_credited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

---

## 2.5 Files Quan Trong Can Sua

| File | Muc dich |
|------|----------|
| `issue-tracking/js/script.js` | Core logic tao ticket, RECEIVE action |
| `issue-tracking/js/api-service.js` | API calls den backend |
| `customer-hub/js/modules/wallet-panel.js` | Hien thi vi, SSE subscription |
| `customer-hub/js/modules/customer-profile.js` | Hien thi 360 view |
| `render.com/routes/v2/tickets.js` | Ticket API + resolve endpoint |
| `render.com/routes/v2/wallets.js` | Wallet API endpoints |
| `render.com/services/wallet-event-processor.js` | Core wallet logic |
| `render.com/routes/realtime-sse.js` | SSE broadcast |
| `cloudflare-worker/modules/config/routes.js` | Proxy routing |
| `cloudflare-worker/worker.js` | Worker main entry |
| `render.com/migrations/023_add_virtual_cancel_type.sql` | **NEW:** Migration them VIRTUAL_CANCEL type |

---

## 2.5.1 XOA TICKET VÀ THU HỒI VIRTUAL CREDIT (NEW 2026-01-22)

### Logic xoa ticket RETURN_SHIPPER

Khi xoa ticket RETURN_SHIPPER (co virtual credit da cap):

```
+-----------------------------------------------------------------------------+
|                   XOA TICKET RETURN_SHIPPER                                  |
+-----------------------------------------------------------------------------+
|                                                                             |
|  BUOC 1: KIEM TRA TRANG THAI VIRTUAL CREDIT                                 |
|  +-----------------------------------------------------------------------+  |
|  | GET /api/v2/tickets/:id/can-delete                                    |  |
|  | Response: { canDelete: true/false, reason: string, creditStatus }     |  |
|  +-----------------------------------------------------------------------+  |
|                                    |                                        |
|              +---------------------+---------------------+                  |
|              |                                           |                  |
|              v                                           v                  |
|  +-----------------------+                   +--------------------------+   |
|  | Virtual Credit        |                   | Virtual Credit           |   |
|  | DA SU DUNG            |                   | CHUA SU DUNG (remaining  |   |
|  | (remaining < original)|                   | = original)              |   |
|  +-----------------------+                   +--------------------------+   |
|              |                                           |                  |
|              v                                           v                  |
|  +-----------------------+                   +--------------------------+   |
|  | KHONG CHO XOA         |                   | CHO PHEP XOA             |   |
|  | Thong bao loi:        |                   | + Tu dong HUY virtual    |   |
|  | "Virtual credit da    |                   |   credit (CANCELLED)     |   |
|  |  su dung, khong the   |                   | + Tao VIRTUAL_CANCEL     |   |
|  |  xoa ticket"          |                   |   transaction            |   |
|  +-----------------------+                   | + Giam virtual_balance   |   |
|                                              +--------------------------+   |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Transaction types moi

| Type | Mo ta | Anh huong vi |
|------|-------|--------------|
| `VIRTUAL_CANCEL` | Thu hoi cong no ao khi xoa ticket | virtual_balance -= amount |
| `VIRTUAL_CREDIT_CANCELLED` | Cong no ao bi huy (dung de hien thi lich su) | Khong anh huong |

### API endpoints lien quan

| Method | Endpoint | Mo ta |
|--------|----------|-------|
| GET | `/api/v2/tickets/:id/can-delete` | Kiem tra ticket co the xoa khong |
| DELETE | `/api/v2/tickets/:id` | Xoa ticket + cancel virtual credit (neu chua su dung) |

---

## 2.6 Verification Checklist

### Test Case 1: Tao Ticket voi SDT moi
1. Mo Issue-Tracking, nhap SDT chua co trong he thong
2. [x] Hien thi "Khach hang moi se duoc tao tu dong"
3. Tao ticket loai BOOM
4. [x] Customer duoc tao trong PostgreSQL
5. [x] Wallet duoc tao voi balance = 0

### Test Case 2: RECEIVE Action cho RETURN_CLIENT
1. Tao ticket RETURN_CLIENT voi so tien 300,000d
2. Bam "Nhan hang"
3. [x] TPOS Phieu tra hang duoc tao
4. [x] Wallet balance += 300,000 (deposit)
5. [x] Customer Hub hien thi so du moi

### Test Case 3: RECEIVE Action cho RETURN_SHIPPER
1. Tao ticket RETURN_SHIPPER voi so tien 300,000d
2. Bam "Nhan hang"
3. [x] Virtual credit duoc cap (expires 15 days)
4. [x] Wallet virtual_balance += 300,000
5. [x] virtual_credits table co record voi status = ACTIVE

### Test Case 4: SSE Real-time
1. Mo Customer Hub xem khach A
2. Tu Issue-Tracking, hoan tat ticket cua khach A
3. [x] Customer Hub tu dong refresh wallet (khong can F5)

---

## 2.7 Related Documentation

- [MASTER_DOCUMENTATION.md](../issue-tracking/MASTER_DOCUMENTATION.md) - Issue-Tracking module details
- [FULLPlan360customer.md](./FULLPlan360customer.md) - Customer 360 implementation plan
- [BUSINESS_FLOW_SPECIFICATION.md](./BUSINESS_FLOW_SPECIFICATION.md) - Orders & Balance History flows
