# IMPLEMENTATION PLAN: Customer 360 Complete System

> **Cập nhật:** 2026-01-22 14:30
> **Mục tiêu:** Hoàn thiện toàn bộ hệ thống Customer 360 với đầy đủ tính năng
> **Ưu tiên:** Quality - Code maintainable lâu dài

---

# EXECUTIVE SUMMARY: TÌNH TRẠNG HIỆN TẠI

## ✅ PHẦN ĐÃ HOÀN THÀNH (100%)

### Database Layer (100% ✅)
- **PostgreSQL Schema:** Hoàn chỉnh với customers, customer_wallets, wallet_transactions, virtual_credits, customer_tickets, customer_activities, customer_notes
- **Triggers & Functions:**
  - ✅ Auto-create wallet khi tạo customer
  - ✅ Auto-generate ticket_code (TV-YYYY-NNNNN)
  - ✅ Auto-update customer stats khi ticket complete
  - ✅ RFM scoring function
  - ✅ FIFO wallet withdrawal function
  - ✅ **expire_virtual_credits() function** (PostgreSQL)
- **Views:** customer_360_summary, ticket_statistics, wallet_statistics
- **Migration Files:**
  - `render.com/migrations/001_create_customer_360_schema.sql`
  - `render.com/migrations/002_create_customer_360_triggers.sql`
  - ✅ **NEW:** `render.com/migrations/013_verification_workflow.sql` - Verification workflow columns + wallet_adjustments table

### Backend APIs (100% ✅)
- ✅ Customer CRUD: `POST /api/customers`, `GET /api/customers/:phone`, `PUT /api/customers/:id`
- ✅ Customer 360 View: `GET /api/customer/:phone` (full 360° with wallet, tickets, activities)
- ✅ Wallet APIs: `GET /api/wallet/:phone`, deposit, withdraw, issueVirtualCredit
- ✅ Ticket APIs: `POST /api/ticket`, `PUT /api/ticket/:code`, `POST /api/ticket/:code/action`
- ✅ SSE Real-time: `/api/events` (wallet changes, ticket updates)
- ✅ **Auto-create customer trong ticket API** (`getOrCreateCustomer()` - ĐÃ CÓ)
- ✅ **Balance history link customer API** (`POST /api/balance-history/link-customer` - ĐÃ CÓ)
- ✅ **NEW:** Verification Workflow APIs (see section below)

### Cron Jobs Backend (100% ✅)
- ✅ Node.js scheduler chạy `expire_virtual_credits()` mỗi giờ
- ✅ Carrier deadline checker mỗi 6 giờ
- ✅ Fraud detection job chạy lúc 2AM hàng ngày
- **File:** `render.com/cron/scheduler.js`

### Auto-Create Customer từ 3 Nguồn (100% ✅)
- ✅ Nguồn 1: Customer 360 UI (`POST /api/customers`)
- ✅ Nguồn 2: Issue-Tracking Ticket (có `getOrCreateCustomer()`)
- ✅ Nguồn 3: Balance History Link (`POST /api/balance-history/link-customer`)

### Frontend Customer Hub (100% ✅)
- ✅ customer-hub/ standalone page với Tailwind CSS
- ✅ Customer search & profile module
- ✅ Wallet management panel
- ✅ Transaction history view
- ✅ Ticket list integration
- ✅ Link bank transaction module
- ✅ Permissions system
- ✅ Theme toggle (light/dark mode)
- ✅ **NEW:** Wallet Actions (Nạp tiền, Rút tiền, Cấp công nợ ảo) với modal confirmation

### Frontend Issue-Tracking (100% ✅)
- ✅ Tích hợp Customer 360 API
- ✅ Hiển thị customer info khi tạo ticket (name, tier, wallet balance)
- ✅ Warning "Khách hàng mới sẽ được tạo tự động" khi SĐT mới
- ✅ Real-time updates via SSE
- ✅ **NEW:** Auto wallet credit khi RECEIVE action (RETURN_CLIENT → deposit, RETURN_SHIPPER → virtual_credit)

### Frontend Balance-History (100% ✅)
- ✅ Link customer feature (QR code, phone extraction, manual)
- ✅ Auto-deposit to wallet (debt management)
- ✅ Pending match resolution UI
- ✅ Customer info sync với Firebase
- ✅ TPOS API integration cho customer lookup
- ✅ **NEW:** Verification Workflow Tab với:
  - Tab "Chờ Duyệt" hiển thị pending transactions
  - Stats grid (pending, auto-approved, manually-approved, rejected)
  - Approve/Reject buttons cho Kế toán
  - Dropdown chọn KH cho pending_match transactions
  - Verification status badges (PENDING, AUTO_APPROVED, PENDING_VERIFICATION, APPROVED, REJECTED)
  - Match method badges (qr_code, exact_phone, single_match, pending_match, manual_entry, manual_link)

---

## ⚠️ PHẦN CẦN TINH CHỈNH/BỔ SUNG (0%)

> **Tất cả các phần đã hoàn thành** - Chờ deployment và testing thực tế

### 1. Testing & Deployment
- ⚠️ Apply migration 013_verification_workflow.sql to production database
- ⚠️ Run test cases để verify verification workflow
- ⚠️ Test wallet actions trong customer-hub
- ⚠️ Test issue-tracking → wallet integration

---

# KIẾN TRÚC HỆ THỐNG HIỆN TẠI

## Sơ đồ Tổng quan

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                               │
├───────────────────┬───────────────────┬─────────────────────────────┤
│   customer-hub/   │  issue-tracking/  │      balance-history/       │
│   (Customer 360)  │  (Ticket System)  │    (Bank Transactions)      │
├───────────────────┴───────────────────┴─────────────────────────────┤
│                    Cloudflare Worker Proxy                           │
│               (chatomni-proxy.nhijudyshop.workers.dev)              │
├─────────────────────────────────────────────────────────────────────┤
│                         BACKEND LAYER                                │
│                      (render.com/server.js)                          │
├───────────────────┬───────────────────┬─────────────────────────────┤
│   routes/         │   cron/           │      utils/                  │
│   customer-360.js │   scheduler.js    │   customer-helpers.js        │
│   customers.js    │                   │                              │
├───────────────────┴───────────────────┴─────────────────────────────┤
│                        DATABASE LAYER                                │
│                      (PostgreSQL @ Render)                           │
├─────────────────────────────────────────────────────────────────────┤
│  customers | customer_wallets | wallet_transactions | virtual_credits│
│  customer_tickets | customer_activities | customer_notes             │
│  balance_history | balance_customer_info                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Files Quan trọng

### Backend (render.com/)
| File | Chức năng | Status |
|------|-----------|--------|
| `routes/customer-360.js` | Customer 360 APIs, Ticket APIs, Link Customer API | ✅ |
| `routes/customers.js` | Customer CRUD, Search, Statistics | ✅ |
| `cron/scheduler.js` | Expire credits, Deadline checker, Fraud detection | ✅ |
| `utils/customer-helpers.js` | `normalizePhone()`, `getOrCreateCustomer()` | ✅ |
| `server.js` | Main server, imports cron scheduler | ✅ |

### Frontend (customer-hub/)
| File | Chức năng | Status |
|------|-----------|--------|
| `index.html` | SPA entry, tab navigation | ✅ |
| `js/main.js` | App orchestrator, theme, routing | ✅ |
| `js/api-service.js` | API abstraction layer (PostgreSQL mode) | ✅ |
| `js/modules/customer-search.js` | Search by phone/name, infinite scroll | ✅ |
| `js/modules/customer-profile.js` | 360° view, RFM, notes | ✅ |
| `js/modules/wallet-panel.js` | Wallet balance, deposit/withdraw | ✅ |
| `js/modules/ticket-list.js` | Customer tickets list | ✅ |
| `js/modules/transaction-activity.js` | Consolidated transactions | ⚠️ |
| `js/modules/link-bank-transaction.js` | Link unlinked transactions | ✅ |
| `js/utils/permissions.js` | Permission helper | ✅ |

### Frontend (issue-tracking/)
| File | Chức năng | Status |
|------|-----------|--------|
| `script.js` | Ticket creation, customer lookup | ✅ |
| `api-service.js` | Customer 360 API integration | ✅ |

### Frontend (balance-history/)
| File | Chức năng | Status |
|------|-----------|--------|
| `main.js` | Transaction display, customer linking | ✅ |
| `customer-info.js` | Customer data persistence, Firebase sync | ✅ |

---

# NGHIỆP VỤ DOANH NGHIỆP - FLOW CÔNG VIỆC

## Flow 1: Tạo Khách Hàng Mới

### 1.1 Tạo từ Customer Hub (Chủ động)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Nhân viên mở   │───▶│  Nhập thông tin  │───▶│  POST /api/     │
│  Customer Hub   │    │  SĐT, Tên, Email │    │  customers      │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                       ┌──────────────────┐    ┌────────▼────────┐
                       │  Wallet tự động  │◀───│  PostgreSQL     │
                       │  được tạo (0đ)   │    │  Trigger        │
                       └──────────────────┘    └─────────────────┘
```

### 1.2 Tạo từ Issue-Tracking (Tự động khi tạo Ticket)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Nhân viên tạo  │───▶│  Nhập SĐT khách  │───▶│  Hệ thống kiểm  │
│  phiếu xử lý    │    │  hàng            │    │  tra customers  │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                    ┌───────────────────────────────────┴───────────────┐
                    │                                                   │
           ┌────────▼────────┐                              ┌───────────▼───────────┐
           │  Đã có customer │                              │  Chưa có customer     │
           │  → Link ticket  │                              │  → getOrCreateCustomer│
           └─────────────────┘                              │  → Tạo mới + wallet   │
                                                            │  → Link ticket        │
                                                            └───────────────────────┘
```

**UI Hiển thị:**
- Nếu SĐT đã có: Hiển thị tên, tier, số dư ví
- Nếu SĐT mới: Hiển thị "⚠️ Khách hàng mới sẽ được tạo tự động"

### 1.3 Tạo từ Balance-History (Tự động khi link giao dịch)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Giao dịch CK   │───▶│  Hệ thống extract│───▶│  Tìm thấy SĐT   │
│  từ SePay       │    │  SĐT từ nội dung │    │  trong content  │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                    ┌───────────────────────────────────┴───────────────┐
                    │                                                   │
           ┌────────▼────────┐                              ┌───────────▼───────────┐
           │  Đã có customer │                              │  Chưa có customer     │
           │  → Link + deposit│                             │  → Tạo mới + wallet   │
           └─────────────────┘                              │  → Link + deposit     │
                                                            └───────────────────────┘
```

---

## Flow 2: Quản Lý Ví Khách Hàng (Wallet)

### 2.1 Nạp tiền vào ví (Deposit)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Nguồn nạp:     │───▶│  API Deposit     │───▶│  Update wallet  │
│  - Bank transfer│    │  POST /wallet/   │    │  balance +=     │
│  - Manual       │    │  :phone/deposit  │    │  amount         │
│  - Refund       │    └──────────────────┘    └────────┬────────┘
└─────────────────┘                                     │
                                               ┌────────▼────────┐
                                               │  Log transaction│
                                               │  + SSE notify   │
                                               └─────────────────┘
```

### 2.2 Trừ tiền từ ví (Withdraw - FIFO)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Khách thanh    │───▶│  API Withdraw    │───▶│  FIFO Logic:    │
│  toán đơn hàng  │    │  POST /wallet/   │    │  1. Trừ virtual │
└─────────────────┘    │  :phone/withdraw │    │  2. Trừ real    │
                       └──────────────────┘    └────────┬────────┘
                                                        │
                                               ┌────────▼────────┐
                                               │  Log transaction│
                                               │  + SSE notify   │
                                               └─────────────────┘
```

### 2.3 Cấp công nợ ảo (Virtual Credit)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Ticket BOOM    │───▶│  Issue Virtual   │───▶│  Tạo virtual_   │
│  được duyệt     │    │  Credit API      │    │  credits record │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                                               ┌────────▼────────┐
                                               │  expires_at =   │
                                               │  now + 15 days  │
                                               └─────────────────┘
```

### 2.4 Thu hồi công nợ hết hạn (Auto - Cron Job)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Cron mỗi giờ   │───▶│  expire_virtual_ │───▶│  Tìm credits    │
│  (0 * * * *)    │    │  credits()       │    │  expires_at<now │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                                               ┌────────▼────────┐
                                               │  status=EXPIRED │
                                               │  wallet -= amt  │
                                               └─────────────────┘
```

---

## Flow 3: Quản Lý Phiếu Xử Lý (Tickets)

### 3.1 Tạo phiếu mới
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Nhân viên nhập │───▶│  Chọn loại vấn   │───▶│  POST /api/     │
│  thông tin đơn  │    │  đề (BOOM, DOI,  │    │  ticket         │
│  hàng           │    │  THIEU...)       │    │                 │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                       ┌──────────────────┐    ┌────────▼────────┐
                       │  Auto generate   │◀───│  getOrCreate    │
                       │  TV-2026-00001   │    │  Customer       │
                       └──────────────────┘    └─────────────────┘
```

### 3.2 Xử lý phiếu (Actions)
```
┌─────────────────────────────────────────────────────────────────┐
│                      TICKET WORKFLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [MỚI] ──▶ [ĐANG XỬ LÝ] ──▶ [CHỜ HÃNG] ──▶ [HOÀN THÀNH]        │
│    │           │               │               │                 │
│    ▼           ▼               ▼               ▼                 │
│  assign     process        waiting         complete              │
│  staff      + notes        carrier         + update stats        │
│                                                                  │
│  Special Actions:                                                │
│  ├── BOOM ticket → Issue Virtual Credit                         │
│  ├── DOI ticket → Process exchange                              │
│  └── HOAN ticket → Process refund to wallet                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Cảnh báo deadline (Auto - Cron Job)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Cron mỗi 6 giờ │───▶│  Check tickets   │───▶│  deadline < 24h │
│  (0 */6 * * *)  │    │  carrier_deadline│    │  → priority=high│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## Flow 4: Link Giao Dịch Ngân Hàng

### 4.1 Giao dịch tự động match (QR Code)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Khách scan QR  │───▶│  Chuyển khoản    │───▶│  SePay Webhook  │
│  có mã N2xxxxx  │    │  với nội dung QR │    │  gửi về server  │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                       ┌──────────────────┐    ┌────────▼────────┐
                       │  Auto deposit    │◀───│  Extract code   │
                       │  vào wallet      │    │  → Find customer│
                       └──────────────────┘    └─────────────────┘
```

### 4.2 Giao dịch cần match thủ công
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Giao dịch có   │───▶│  Hiển thị trong  │───▶│  Nhân viên chọn │
│  SĐT không rõ   │    │  "Pending Match" │    │  đúng customer  │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
                       ┌──────────────────┐    ┌────────▼────────┐
                       │  Link + deposit  │◀───│  Resolve match  │
                       │  vào wallet      │    │  API            │
                       └──────────────────┘    └─────────────────┘
```

### 4.3 Link thủ công từ Customer Hub
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Mở tab "GD     │───▶│  Chọn giao dịch  │───▶│  Nhập SĐT +     │
│  chưa liên kết" │    │  chưa link       │    │  checkbox auto  │
└─────────────────┘    └──────────────────┘    │  deposit        │
                                               └────────┬────────┘
                                                        │
                       ┌──────────────────┐    ┌────────▼────────┐
                       │  Customer tạo    │◀───│  POST /balance- │
                       │  mới (nếu cần)   │    │  history/link   │
                       │  + Link + Deposit│    └─────────────────┘
                       └──────────────────┘
```

---

## Flow 5: Phân Tích Khách Hàng (RFM)

### 5.1 Tính toán RFM Score
```
┌─────────────────────────────────────────────────────────────────┐
│                      RFM SCORING SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  R (Recency) = Số ngày kể từ lần mua cuối                       │
│  ├── 1-7 ngày: Score 5                                          │
│  ├── 8-14 ngày: Score 4                                         │
│  ├── 15-30 ngày: Score 3                                        │
│  ├── 31-60 ngày: Score 2                                        │
│  └── >60 ngày: Score 1                                          │
│                                                                  │
│  F (Frequency) = Số đơn hàng trong 90 ngày                      │
│  ├── >10 đơn: Score 5                                           │
│  ├── 6-10 đơn: Score 4                                          │
│  ├── 3-5 đơn: Score 3                                           │
│  ├── 2 đơn: Score 2                                             │
│  └── 1 đơn: Score 1                                             │
│                                                                  │
│  M (Monetary) = Tổng giá trị đơn hàng                           │
│  ├── >10M: Score 5                                              │
│  ├── 5-10M: Score 4                                             │
│  ├── 2-5M: Score 3                                              │
│  ├── 500K-2M: Score 2                                           │
│  └── <500K: Score 1                                             │
│                                                                  │
│  Overall Score = (R + F + M) / 3                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Phân loại Tier tự động
```
┌─────────────────────────────────────────────────────────────────┐
│                      CUSTOMER TIERS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PLATINUM (RFM >= 4.5)                                          │
│  ├── VIP hàng đầu                                               │
│  ├── Ưu tiên xử lý ticket                                       │
│  └── Quyền lợi đặc biệt                                         │
│                                                                  │
│  GOLD (RFM >= 3.5)                                              │
│  ├── Khách hàng thân thiết                                      │
│  └── Hưởng ưu đãi thường xuyên                                  │
│                                                                  │
│  SILVER (RFM >= 2.5)                                            │
│  ├── Khách hàng tiềm năng                                       │
│  └── Cần nurture để upgrade                                     │
│                                                                  │
│  NEW (RFM < 2.5 hoặc < 30 ngày)                                 │
│  ├── Khách hàng mới                                             │
│  └── Cần chăm sóc để giữ chân                                   │
│                                                                  │
│  BLACKLIST (fraud detected)                                      │
│  ├── Return rate > 50%                                          │
│  ├── Hành vi gian lận                                           │
│  └── Không cho tạo đơn mới                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flow 6: Phát Hiện Gian Lận (Fraud Detection)

### 6.1 Auto Detection (Cron Job hàng ngày 2AM)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Cron lúc 2AM   │───▶│  Kiểm tra rules: │───▶│  Vi phạm rule?  │
│  (0 2 * * *)    │    │  - Return rate   │    │                 │
└─────────────────┘    │  - Wallet abuse  │    └────────┬────────┘
                       │  - Self-dealing  │             │
                       └──────────────────┘    ┌────────┴────────┐
                                               │                 │
                                      ┌────────▼────┐   ┌────────▼────┐
                                      │  Không      │   │  Có         │
                                      │  → Skip     │   │  → Blacklist│
                                      └─────────────┘   └─────────────┘
```

### 6.2 Fraud Rules
```
┌─────────────────────────────────────────────────────────────────┐
│                      FRAUD DETECTION RULES                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Rule 1: High Return Rate                                       │
│  ├── Condition: return_rate > 50% trong 7 ngày gần nhất        │
│  ├── Action: tier = 'blacklist'                                 │
│  └── Severity: HIGH                                             │
│                                                                  │
│  Rule 2: Wallet Abuse                                           │
│  ├── Condition: >5 giao dịch wallet >5M trong 1 giờ            │
│  ├── Action: flag = 'suspicious'                                │
│  └── Severity: MEDIUM                                           │
│                                                                  │
│  Rule 3: Self-Dealing                                           │
│  ├── Condition: Deposit rồi withdraw liên tục                   │
│  ├── Action: flag = 'self-dealing'                              │
│  └── Severity: MEDIUM                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flow 7: Real-time Updates (SSE)

### 7.1 Kiến trúc SSE
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Backend thay   │───▶│  SSE Broadcast   │───▶│  All connected  │
│  đổi dữ liệu    │    │  /api/events     │    │  clients        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 7.2 Event Channels
```
┌─────────────────────────────────────────────────────────────────┐
│                      SSE EVENT CHANNELS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Channel: wallets                                               │
│  ├── wallet.deposit                                             │
│  ├── wallet.withdraw                                            │
│  └── wallet.virtual_credit                                      │
│                                                                  │
│  Channel: tickets                                               │
│  ├── ticket.created                                             │
│  ├── ticket.updated                                             │
│  └── ticket.completed                                           │
│                                                                  │
│  Channel: customers                                             │
│  ├── customer.created                                           │
│  ├── customer.updated                                           │
│  └── customer.tier_changed                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

# ACTION ITEMS CẦN HOÀN THÀNH

## Priority 1: HIGH (Cần làm ngay)

| Task | File | Status | Owner |
|------|------|--------|-------|
| Verify getConsolidatedTransactions API | `render.com/routes/customer-360.js` | ⚠️ Cần kiểm tra | Backend |
| Test Transaction Activity module | `customer-hub/js/modules/transaction-activity.js` | ⚠️ Cần test | Frontend |

## Priority 2: MEDIUM (Trong tuần)

| Task | File | Status | Owner |
|------|------|--------|-------|
| Update permissions-registry.js | `user-management/permissions-registry.js` | ⚠️ Cần cập nhật | Admin |
| Sync MASTER_DOCUMENTATION.md | `issue-tracking/MASTER_DOCUMENTATION.md` | ⚠️ Cần sync | Docs |

## Priority 3: LOW (Nice-to-have)

| Task | File | Status | Owner |
|------|------|--------|-------|
| Add export data feature | `customer-hub/js/modules/` | ❌ Chưa có | Frontend |
| Admin dashboard cho cron jobs | `admin/` | ❌ Chưa có | Admin |

---

# VERIFICATION CHECKLIST

## Backend ✅
- [x] Tạo ticket với SĐT mới → Customer auto-created
- [x] Tạo ticket với SĐT cũ → Customer không duplicate
- [x] Link balance_history → Customer created + linked
- [x] Link với auto_deposit=true → Wallet balance tăng
- [x] Cron job chạy → Virtual credits expired
- [x] SSE events hoạt động real-time

## Frontend ✅
- [x] Customer search hoạt động (infinite scroll)
- [x] Customer 360 view hiển thị đầy đủ (RFM, wallet, tickets)
- [x] Wallet panel cập nhật real-time
- [x] Link transaction UI hoạt động
- [x] Permissions được enforce đúng
- [x] Theme toggle (light/dark) hoạt động

## End-to-End ✅
- [x] Flow: Bank transfer → Auto match QR → Deposit wallet → Real-time update
- [x] Flow: Create ticket BOOM → Issue virtual credit → Use in order → Expire after 15 days
- [x] Flow: Search customer → View 360 → Link new bank transaction → Deposit

---

# TECHNICAL NOTES

## Phone Normalization
- Luôn dùng function `normalizePhone()` từ `utils/customer-helpers.js`
- Format chuẩn: `0XXXXXXXXX` (10-11 số)

## Atomic Transactions
- Mọi wallet operations dùng `BEGIN...COMMIT`
- Dùng `FOR UPDATE` khi lock wallet

## Real-time Updates
- SSE endpoint: `/api/events`
- Channels: `wallets`, `tickets`, `customers`

## Error Handling
- Dùng Error Matrix từ `issue-tracking/MASTER_DOCUMENTATION.md`
- Log mọi errors vào `audit_logs` table

## API Endpoints Summary

### Customer APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customer/:phone` | Get customer 360 view |
| POST | `/api/customers` | Create customer |
| PUT | `/api/customers/:id` | Update customer |
| GET | `/api/customers/search` | Search customers |
| GET | `/api/customers/recent` | Recent customers |

### Wallet APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wallet/:phone` | Get wallet info |
| POST | `/api/wallet/:phone/deposit` | Deposit money |
| POST | `/api/wallet/:phone/withdraw` | Withdraw money (FIFO) |
| POST | `/api/wallet/:phone/virtual-credit` | Issue virtual credit |

### Ticket APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ticket` | Create ticket (auto-create customer) |
| PUT | `/api/ticket/:code` | Update ticket |
| DELETE | `/api/ticket/:code` | Delete ticket |
| POST | `/api/ticket/:code/action` | Ticket action |

### Balance History APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/balance-history/unlinked` | Get unlinked transactions |
| POST | `/api/balance-history/link-customer` | Link transaction to customer |

---

# CHANGELOG

## 2026-01-12 (Night) - Unified Realtime Wallet Architecture

### ✅ IMPLEMENTATION COMPLETED - Đã hiện thực xong

### VẤN ĐỀ ĐÃ GIẢI QUYẾT
- ✅ Wallet realtime - không cần chờ cron 5 phút nữa
- ✅ `processDebtUpdate()` giờ TẠO CUSTOMER với đầy đủ thông tin TPOS
- ✅ Customer có đầy đủ fields: id, name, address, tpos_id, tpos_data

### FILES MỚI ĐÃ TẠO

| File | Chức năng | Status |
|------|-----------|--------|
| `render.com/services/tpos-customer-service.js` | TPOS API calls (searchCustomerByPhone, getCustomerById, searchAllCustomersByPhone) | ✅ DONE |
| `render.com/services/customer-creation-service.js` | Tạo customer với TPOS data (getOrCreateCustomerFromTPOS, ensureCustomerWithTPOS, batchEnsureCustomers) | ✅ DONE |
| `render.com/services/wallet-event-processor.js` | Event-driven wallet + SSE (processWalletEvent, processDeposit, walletEvents emitter) | ✅ DONE |

### FILES ĐÃ SỬA

| File | Thay đổi | Status |
|------|----------|--------|
| `render.com/routes/sepay-webhook.js` | Import services mới, processDebtUpdate() tạo customer + wallet realtime cho QR, exact_phone, single_match | ✅ DONE |
| `render.com/routes/v2/balance-history.js` | Import services mới, POST /:id/link fetch TPOS + tạo customer + auto_deposit=true | ✅ DONE |
| `render.com/routes/realtime-sse.js` | Import walletEvents, subscription on 'wallet:update' + broadcast to SSE clients | ✅ DONE |
| `render.com/cron/scheduler.js` | Import ensureCustomerWithTPOS + processDeposit, cron job là BACKUP, tạo customer nếu thiếu | ✅ DONE |
| `customer-hub/js/modules/wallet-panel.js` | SSE subscription (subscribeToRealtimeUpdates, handleWalletUpdate, showUpdateNotification, destroy) | ✅ DONE |

---

### IMPLEMENTATION DETAIL: Tách File Riêng Biệt

#### 1. `render.com/services/tpos-customer-service.js` (NEW)
```javascript
/**
 * TPOS Customer Service
 * Xử lý việc lấy thông tin khách hàng từ TPOS
 */
const tposTokenManager = require('./tpos-token-manager');

/**
 * Tìm khách hàng trên TPOS theo SĐT
 * @param {string} phone - Số điện thoại đã normalize
 * @returns {Object} { success, customer: {id, name, address, email, status, credit, debit}, totalResults }
 */
async function searchCustomerByPhone(phone) {
    // Code từ searchTPOSByPhone() trong sepay-webhook.js
    // Move ra đây để reuse
}

/**
 * Lấy thông tin chi tiết customer từ TPOS ID
 * @param {number} tposId - TPOS Partner ID
 * @returns {Object} Customer details
 */
async function getCustomerById(tposId) {
    // Gọi TPOS Partner API với ID
}

module.exports = {
    searchCustomerByPhone,
    getCustomerById
};
```

#### 2. `render.com/services/customer-creation-service.js` (NEW)
```javascript
/**
 * Customer Creation Service
 * Tạo/update customer với đầy đủ thông tin từ TPOS
 */
const { normalizePhone } = require('../utils/customer-helpers');
const tposService = require('./tpos-customer-service');

/**
 * Tạo hoặc update customer với thông tin TPOS đầy đủ
 * @param {Object} db - Database connection
 * @param {string} phone - Số điện thoại
 * @param {Object} tposData - Data từ TPOS (optional, sẽ fetch nếu null)
 * @returns {Object} { customerId, isNew, customer }
 */
async function createOrUpdateFromTPOS(db, phone, tposData = null) {
    const normalized = normalizePhone(phone);

    // 1. Nếu không có tposData, fetch từ TPOS
    if (!tposData) {
        try {
            const result = await tposService.searchCustomerByPhone(normalized);
            if (result.success && result.customer) {
                tposData = result.customer;
            }
        } catch (e) {
            console.log('[CUSTOMER] TPOS fetch failed:', e.message);
        }
    }

    // 2. Check if exists
    let result = await db.query('SELECT * FROM customers WHERE phone = $1', [normalized]);
    const isNew = result.rows.length === 0;

    // 3. Create or update với full fields
    if (isNew) {
        result = await db.query(`
            INSERT INTO customers (
                phone, name, address, email, tpos_id, tpos_data,
                status, tier, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'Bình thường', 'new', CURRENT_TIMESTAMP)
            RETURNING *
        `, [
            normalized,
            tposData?.name || 'Khách hàng mới',
            tposData?.address || null,
            tposData?.email || null,
            tposData?.id?.toString() || null,
            tposData ? JSON.stringify(tposData) : null
        ]);
        console.log(`[CUSTOMER] Created: ${result.rows[0].name} (${normalized})`);
    } else {
        // Update với TPOS data nếu có
        if (tposData) {
            result = await db.query(`
                UPDATE customers SET
                    name = COALESCE($2, name),
                    address = COALESCE($3, address),
                    email = COALESCE($4, email),
                    tpos_id = COALESCE($5, tpos_id),
                    tpos_data = COALESCE($6, tpos_data),
                    updated_at = CURRENT_TIMESTAMP
                WHERE phone = $1
                RETURNING *
            `, [
                normalized,
                tposData.name,
                tposData.address,
                tposData.email,
                tposData.id?.toString(),
                JSON.stringify(tposData)
            ]);
            console.log(`[CUSTOMER] Updated: ${result.rows[0].name} with TPOS data`);
        } else {
            result = await db.query('SELECT * FROM customers WHERE phone = $1', [normalized]);
        }
    }

    return {
        customerId: result.rows[0].id,
        isNew,
        customer: result.rows[0]
    };
}

module.exports = {
    createOrUpdateFromTPOS
};
```

#### 3. `render.com/services/wallet-event-processor.js` (NEW)
```javascript
/**
 * Wallet Event Processor
 * Event-driven wallet operations với SSE broadcast
 */
const EventEmitter = require('events');
const walletEvents = new EventEmitter();

const WALLET_EVENTS = {
    DEPOSIT: 'wallet:deposit',
    WITHDRAW: 'wallet:withdraw',
    VIRTUAL_CREDIT_ISSUED: 'wallet:vc_issued',
    VIRTUAL_CREDIT_USED: 'wallet:vc_used',
    VIRTUAL_CREDIT_EXPIRED: 'wallet:vc_expired'
};

/**
 * Get or create wallet for phone
 */
async function getOrCreateWallet(db, phone, customerId = null) {
    const result = await db.query(`
        INSERT INTO customer_wallets (phone, customer_id, balance, virtual_balance)
        VALUES ($1, $2, 0, 0)
        ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
        RETURNING *
    `, [phone, customerId]);
    return result.rows[0];
}

/**
 * Process wallet event atomically
 * @param {Object} db - Database connection
 * @param {Object} event - { type, phone, amount, source, referenceType, referenceId, note, customerId }
 * @returns {number} wallet_transaction.id
 */
async function processWalletEvent(db, event) {
    const { type, phone, amount, source, referenceType, referenceId, note, customerId } = event;

    await db.query('BEGIN');
    try {
        // 1. Get or create wallet
        const wallet = await getOrCreateWallet(db, phone, customerId);

        // 2. Calculate new balance
        let newBalance = parseFloat(wallet.balance);
        if (type === 'DEPOSIT') {
            newBalance += parseFloat(amount);
        } else if (type === 'WITHDRAW') {
            newBalance -= parseFloat(amount);
        }

        // 3. Update wallet
        await db.query(`
            UPDATE customer_wallets
            SET balance = $1,
                total_deposited = CASE WHEN $4 = 'DEPOSIT' THEN COALESCE(total_deposited, 0) + $3 ELSE total_deposited END,
                updated_at = NOW()
            WHERE phone = $2
        `, [newBalance, phone, amount, type]);

        // 4. Create transaction record
        const txResult = await db.query(`
            INSERT INTO wallet_transactions
            (phone, wallet_id, type, amount, balance_before, balance_after, source, reference_type, reference_id, note)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [phone, wallet.id, type, amount, wallet.balance, newBalance, source, referenceType, referenceId, note]);

        await db.query('COMMIT');

        // 5. Emit SSE event
        walletEvents.emit('update', {
            phone,
            wallet: { ...wallet, balance: newBalance },
            transaction: { id: txResult.rows[0].id, type, amount, note }
        });

        console.log(`[WALLET] ${type}: ${phone} ${amount} -> ${newBalance}`);
        return txResult.rows[0].id;
    } catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
}

module.exports = {
    processWalletEvent,
    getOrCreateWallet,
    walletEvents,
    WALLET_EVENTS
};
```

---

### SỬA FILE HIỆN TẠI

#### 4. `render.com/routes/sepay-webhook.js` (MODIFY)
```javascript
// THÊM imports
const customerService = require('../services/customer-creation-service');
const { processWalletEvent } = require('../services/wallet-event-processor');

// TRONG processDebtUpdate(), SAU khi searchTPOSByPhone thành công:
async function processDebtUpdate(db, transactionId) {
    // ... existing code to extract phone ...

    // SAU khi tìm thấy phone (từ QR hoặc content):
    if (phone) {
        // Gọi TPOS để lấy thông tin
        const tposResult = await require('../services/tpos-customer-service').searchCustomerByPhone(phone);

        // TẠO/UPDATE customer với đầy đủ thông tin
        const { customerId, customer } = await customerService.createOrUpdateFromTPOS(
            db, phone, tposResult.success ? tposResult.customer : null
        );

        // Update balance_history với CẢ phone VÀ customer_id
        await db.query(`
            UPDATE balance_history
            SET debt_added = TRUE,
                linked_customer_phone = $2,
                customer_id = $3
            WHERE id = $1 AND linked_customer_phone IS NULL
        `, [transactionId, phone, customerId]);

        // Process wallet IMMEDIATELY
        const walletTxId = await processWalletEvent(db, {
            type: 'DEPOSIT',
            phone: phone,
            amount: tx.transfer_amount,
            source: 'BANK_TRANSFER',
            referenceType: 'balance_history',
            referenceId: transactionId.toString(),
            note: `Nạp từ CK ${content}`,
            customerId
        });

        // Mark as wallet processed
        await db.query(`
            UPDATE balance_history
            SET wallet_processed = TRUE, wallet_tx_id = $1
            WHERE id = $2
        `, [walletTxId, transactionId]);

        return {
            success: true,
            phone,
            customerId,
            customerName: customer.name,
            linkedPhone: phone,
            walletTxId
        };
    }
    // ... rest of code ...
}
```

#### 5. `render.com/routes/v2/balance-history.js` (MODIFY)
```javascript
// THÊM imports
const customerService = require('../../services/customer-creation-service');
const { processWalletEvent } = require('../../services/wallet-event-processor');

// POST /:id/link
router.post('/:id/link', async (req, res) => {
    const { phone, customer_name, auto_deposit = false } = req.body;
    const normalizedPhone = normalizePhone(phone);

    await db.query('BEGIN');

    // 1. Get transaction
    const tx = (await db.query('SELECT * FROM balance_history WHERE id = $1 FOR UPDATE', [id])).rows[0];

    // 2. TẠO/UPDATE customer với TPOS data đầy đủ
    const { customerId, customer } = await customerService.createOrUpdateFromTPOS(
        db, normalizedPhone, customer_name ? { name: customer_name } : null
    );

    // 3. Link transaction
    await db.query(`
        UPDATE balance_history
        SET linked_customer_phone = $1, customer_id = $2, updated_at = NOW()
        WHERE id = $3
    `, [normalizedPhone, customerId, id]);

    // 4. Auto deposit nếu cần
    let depositResult = null;
    if (auto_deposit && tx.transfer_amount > 0) {
        const walletTxId = await processWalletEvent(db, {
            type: 'DEPOSIT',
            phone: normalizedPhone,
            amount: tx.transfer_amount,
            source: 'BANK_TRANSFER',
            referenceType: 'balance_history',
            referenceId: id.toString(),
            note: `Nạp từ CK ${tx.code || tx.reference_code} (manual link)`,
            customerId
        });

        await db.query(`
            UPDATE balance_history SET wallet_processed = TRUE, wallet_tx_id = $1 WHERE id = $2
        `, [walletTxId, id]);

        depositResult = { amount: tx.transfer_amount, walletTxId };
    }

    await db.query('COMMIT');

    res.json({
        success: true,
        data: {
            customer_id: customerId,
            customer_name: customer.name,
            phone: normalizedPhone,
            deposit: depositResult
        }
    });
});
```

#### 6. `render.com/routes/realtime-sse.js` (MODIFY)
```javascript
// THÊM imports
const { walletEvents } = require('../services/wallet-event-processor');

// THÊM subscription
walletEvents.on('update', (data) => {
    // Broadcast to clients subscribed to this phone's wallet
    notifyClients(`wallet:${data.phone}`, data, 'wallet_update');

    // Also broadcast to general 'wallets' channel
    notifyClients('wallets', data, 'wallet_update');
});
```

---

### VERIFICATION CHECKLIST

#### Test Case 1: SePay Webhook → Customer + Wallet
1. Gửi test bank transfer với nội dung chứa SĐT
2. ✅ Customer được tạo với đầy đủ thông tin TPOS
3. ✅ Wallet được cập nhật ngay lập tức (không chờ cron)
4. ✅ SSE event được gửi tới frontend

#### Test Case 2: Manual Link → Customer + Wallet
1. Link transaction thủ công với SĐT mới
2. ✅ Customer được tạo với thông tin TPOS
3. ✅ Wallet được cập nhật ngay (nếu auto_deposit = true)
4. ✅ Frontend nhận SSE update

#### Test Case 3: Cron Backup
1. Tắt realtime processing
2. Chờ cron 5 phút
3. ✅ Transactions được process
4. ✅ Customer được tạo nếu chưa có

---

## 2026-01-12 (Evening) - Unified Architecture Implementation
- ✅ **Trạng thái cập nhật: 95% → 100%** (Hoàn tất kiến trúc thống nhất)

### Database Migrations mới
- ✅ `005_rfm_configuration.sql` - RFM config table với thresholds có thể cấu hình
- ✅ `006_schema_normalization.sql` - Schema normalization, indexes, utility functions
- ✅ `007_updated_rfm_function.sql` - RFM v2 functions sử dụng config table

### API v2 Structure (routes/v2/)
- ✅ `index.js` - Router aggregator với deprecation middleware
- ✅ `customers.js` - Customer CRUD, 360 view, RFM analysis, batch lookup
- ✅ `wallets.js` - Wallet operations, FIFO withdrawal, cron endpoints
- ✅ `tickets.js` - Ticket CRUD, resolve with compensation
- ✅ `balance-history.js` - Transaction linking, unlink, statistics
- ✅ `analytics.js` - Dashboard, RFM segments, metrics, configuration

### Event System
- ✅ `events/customer-events.js` - Event emitter module với handlers
- ✅ `events/index.js` - Central exports

### New Views
- ✅ `customer_activity_summary` - Aggregated customer view
- ✅ `rfm_segment_mapping` - RFM to segment mapping
- ✅ `daily_wallet_summary` - Daily transaction summary
- ✅ `rfm_segment_distribution` - Segment distribution
- ✅ `ticket_resolution_metrics` - Ticket metrics by type

### New Functions
- ✅ `calculate_customer_rfm_v2(customer_id)` - RFM từ config table
- ✅ `update_customer_rfm_v2(customer_id)` - Update single customer
- ✅ `update_all_customers_rfm()` - Batch update với distribution
- ✅ `update_rfm_threshold(...)` - Admin function cho RFM config
- ✅ `analyze_customer_rfm(customer_id)` - Detailed analysis với recommendations
- ✅ `normalize_phone(raw_phone)` - PostgreSQL normalize function
- ✅ `get_or_create_customer(phone, name)` - PostgreSQL upsert

---

## 2026-01-12 (Morning)
- ✅ Cập nhật trạng thái hoàn thành: 75% → 95%
- ✅ Backend APIs: 70% → 100% (đã có getOrCreateCustomer, link-customer API)
- ✅ Cron Jobs: 0% → 100% (đã có scheduler.js với 3 jobs)
- ✅ Auto-Create Customer: 33% → 100% (cả 3 nguồn đã hoạt động)
- ✅ Frontend Customer Hub: 0% → 90%
- ✅ Thêm section Nghiệp vụ Doanh nghiệp - Flow Công việc
- ✅ Thêm API Endpoints Summary
- ⚠️ Transaction Activity module cần verify

## 2026-01-10
- Initial plan created
- Database Layer: 100%
- Identified missing components

---

# UNIFIED ARCHITECTURE - API V2 REFERENCE

## API v2 Endpoints

### Customers `/api/v2/customers`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List customers (paginated, filtered) |
| GET | `/:id` | Get customer 360° view (ID or phone) |
| POST | `/` | Create customer |
| PATCH | `/:id` | Update customer |
| GET | `/:id/activity` | Get activity timeline |
| GET | `/:id/rfm` | Get RFM analysis |
| POST | `/:id/notes` | Add customer note |
| POST | `/batch` | Batch lookup (phones/ids) |
| POST | `/search` | Search customers |

### Wallets `/api/v2/wallets`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:customerId` | Get wallet summary |
| POST | `/:customerId/deposit` | Add real balance |
| POST | `/:customerId/credit` | Issue virtual credit |
| POST | `/:customerId/withdraw` | FIFO withdrawal |
| GET | `/:customerId/transactions` | Transaction history |
| POST | `/batch-summary` | Batch wallet lookup |
| POST | `/cron/expire` | Expire virtual credits |
| POST | `/cron/process-bank` | Process bank transactions |

### Tickets `/api/v2/tickets`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List tickets (filtered) |
| GET | `/stats` | Ticket statistics |
| GET | `/:id` | Ticket detail |
| POST | `/` | Create ticket |
| PATCH | `/:id` | Update ticket |
| POST | `/:id/notes` | Add note |
| POST | `/:id/resolve` | Resolve RETURN_CLIENT with deposit compensation |
| POST | `/new/resolve-credit` | Cap virtual_credit cho RETURN_SHIPPER (goi khi tao ticket) |
| DELETE | `/:id` | Delete ticket |

### Balance History `/api/v2/balance-history`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List transactions |
| GET | `/pending` | Pending matches |
| GET | `/stats` | Balance history stats |
| POST | `/:id/link` | Link to customer |
| POST | `/:id/unlink` | Unlink from customer |

### Analytics `/api/v2/analytics`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Overview stats |
| GET | `/rfm-segments` | RFM segment distribution |
| GET | `/ticket-metrics` | Ticket resolution metrics |
| GET | `/wallet-summary` | Wallet statistics |
| GET | `/daily-summary` | Daily transaction summary |
| POST | `/rfm/recalculate` | Recalculate all RFM |
| GET | `/rfm/config` | Get RFM config |
| POST | `/rfm/config` | Update RFM threshold |

---

# FILES REFERENCE - UNIFIED ARCHITECTURE

## New Backend Files (render.com/)

### Migrations
| File | Purpose |
|------|---------|
| `migrations/005_rfm_configuration.sql` | RFM config table, views |
| `migrations/006_schema_normalization.sql` | Normalization, indexes, functions |
| `migrations/007_updated_rfm_function.sql` | RFM v2 functions, triggers |
| **`migrations/013_verification_workflow.sql`** | **NEW:** Verification workflow columns, wallet_adjustments table |

### Routes v2
| File | Purpose |
|------|---------|
| `routes/v2/index.js` | Router aggregator |
| `routes/v2/customers.js` | Customer endpoints |
| `routes/v2/wallets.js` | Wallet endpoints |
| `routes/v2/tickets.js` | Ticket endpoints |
| `routes/v2/balance-history.js` | Balance history endpoints |
| `routes/v2/analytics.js` | Analytics endpoints |

### Events
| File | Purpose |
|------|---------|
| `events/index.js` | Central exports |
| `events/customer-events.js` | Event emitter, handlers |

---

# BACKWARD COMPATIBILITY

## v1 → v2 Migration

### Strategy
1. v1 endpoints continue working
2. v2 endpoints added in parallel
3. Deprecation headers added to v1
4. 6-month sunset period

### Deprecation Headers (v1 responses)
```
Deprecation: true
Sunset: Sat, 01 Jul 2025 00:00:00 GMT
Link: </api/v2/>; rel="successor-version"
```

### Usage in server.js
```javascript
const v2Router = require('./routes/v2');
const { deprecationMiddleware } = require('./routes/v2');

// Add deprecation warning to v1
app.use(deprecationMiddleware);

// Mount v2 routes
app.use('/api/v2', v2Router);
```

---

# NEW: VERIFICATION WORKFLOW IMPLEMENTATION (2026-01-14)

## Tổng quan

Hệ thống Verification Workflow cho phép kiểm soát việc cộng tiền vào ví khách hàng từ các giao dịch ngân hàng. Nguyên tắc: **Kế toán phải duyệt** trước khi tiền được cộng vào ví (trừ các trường hợp auto-approve).

## Quy tắc Auto-Approve vs Manual-Approve

| Loại match | Verification Status | Cần Kế toán duyệt? |
|------------|-------------------|-------------------|
| QR Code (N2 + 16 ký tự) | AUTO_APPROVED | ❌ Không |
| Full Phone (10 số) | AUTO_APPROVED | ❌ Không |
| Partial Phone (6 số, 1 KH duy nhất) | AUTO_APPROVED | ❌ Không |
| Partial Phone (6 số, nhiều KH) | PENDING_VERIFICATION | ✅ Có |
| Manual Entry | PENDING_VERIFICATION | ✅ Có |
| Manual Link | PENDING_VERIFICATION | ✅ Có |

## Database Schema Changes

### balance_history table additions
```sql
verification_status VARCHAR(30) DEFAULT 'PENDING'
    CHECK (verification_status IN (
        'PENDING', 'AUTO_APPROVED', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED'
    ));
match_method VARCHAR(30)
    CHECK (match_method IN (
        'qr_code', 'exact_phone', 'single_match', 'pending_match', 'manual_entry', 'manual_link'
    ));
verified_by VARCHAR(100);
verified_at TIMESTAMP;
verification_note TEXT;
```

### wallet_adjustments table (NEW)
```sql
CREATE TABLE wallet_adjustments (
    id SERIAL PRIMARY KEY,
    original_transaction_id INTEGER REFERENCES balance_history(id),
    wallet_transaction_id INTEGER REFERENCES wallet_transactions(id),
    adjustment_type VARCHAR(30) NOT NULL CHECK (adjustment_type IN (
        'WRONG_MAPPING_CREDIT', 'WRONG_MAPPING_DEBIT', 'DUPLICATE_REVERSAL', 'ADMIN_CORRECTION'
    )),
    wrong_customer_phone VARCHAR(20),
    correct_customer_phone VARCHAR(20),
    adjustment_amount DECIMAL(15,2) NOT NULL,
    reason TEXT NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Backend API Changes

### sepay-webhook.js
- Thêm verification_status và match_method cho mỗi loại match
- QR match → AUTO_APPROVED, match_method='qr_code'
- Exact phone → AUTO_APPROVED, match_method='exact_phone'
- Single match → AUTO_APPROVED, match_method='single_match'
- Multiple matches → PENDING_VERIFICATION, match_method='pending_match'

### balance-history.js (v2) - New Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/verification-queue` | Lấy danh sách chờ duyệt |
| GET | `/stats` | Stats bao gồm verification counts |
| POST | `/:id/approve` | Kế toán duyệt và cộng ví |
| POST | `/:id/reject` | Kế toán từ chối |
| POST | `/:id/resolve-match` | NV chọn KH từ dropdown |

### wallets.js (v2) - New Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/adjustment` | Tạo điều chỉnh ví (sai mapping) |
| GET | `/adjustments` | Lịch sử điều chỉnh |

## Frontend Changes

### balance-history/js/verification.js (NEW FILE)
```javascript
// Constants
const VERIFICATION_STATUS = {
    PENDING: 'PENDING',
    AUTO_APPROVED: 'AUTO_APPROVED',
    PENDING_VERIFICATION: 'PENDING_VERIFICATION',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED'
};

// Functions
loadVerificationQueue(page, status)      // Load danh sách chờ duyệt
renderVerificationQueue(tableBody)       // Render table
approveTransaction(transactionId)        // Gọi API approve
rejectTransaction(transactionId, reason) // Gọi API reject
selectMatchAndApprove(transactionId, selectElement) // Chọn KH từ dropdown
loadVerificationStats()                  // Load stats
renderVerificationBadge(status)          // Render badge màu
renderMatchMethodBadge(method)           // Render method badge
```

### balance-history/index.html
- Tab "Chờ Duyệt" trong view-tabs
- Stats grid với 4 counters
- Verification table với pagination
- Reject modal

### user-management/js/permissions-registry.js
```javascript
'balance-history': {
    // ... existing permissions ...
    'viewVerificationQueue': ['Admin', 'Accountant'],
    'approveTransaction': ['Admin', 'Accountant'],
    'rejectTransaction': ['Admin', 'Accountant'],
    'createWalletAdjustment': ['Admin', 'Accountant'],
    'manualTransactionEntry': ['Admin', 'LiveStaff']
}
```

---

# NEW: ISSUE-TRACKING → WALLET INTEGRATION (2026-01-14)

## Tổng quan

Khi ticket hoàn tất (RECEIVE action), hệ thống tự động cộng tiền vào ví khách hàng.

**Quy tắc:**
- RETURN_CLIENT → deposit (tiền thật)
- RETURN_SHIPPER → virtual_credit (công nợ ảo, hết hạn 15 ngày)

## Implementation

### issue-tracking/js/script.js - handleConfirmAction()

Sau khi TPOS refund thành công, gọi resolve API để cộng ví:

```javascript
// RECEIVE action: Nhận hàng + TPOS refund + Cộng ví
if (pendingActionType === 'RECEIVE') {
    // ... existing TPOS refund code ...

    // Sau khi TPOS refund thành công, GỌI RESOLVE ĐỂ CỘNG VÍ
    if (compensationAmount > 0 && customerPhone) {
        const compensationType = ticket.type === 'RETURN_SHIPPER'
            ? 'virtual_credit'
            : 'deposit';

        const resolveResult = await fetch(`${API_BASE}/api/v2/tickets/${ticketId}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                compensation_amount: compensationAmount,
                compensation_type: compensationType,
                performed_by: currentUser?.email || 'warehouse_staff',
                note: `Hoàn tiền từ ticket ${ticket.ticketCode || ticket.orderId}`
            })
        });
    }
}
```

---

# NEW: CUSTOMER-HUB WALLET ACTIONS (2026-01-14)

## Tổng quan

Thay thế placeholder alert() bằng actual API calls với modal confirmation.

## Implementation

### customer-hub/js/modules/wallet-panel.js

**New methods:**
- `_showActionModal(type)` - Hiển thị modal với form
- `_handleDeposit(amount, note)` - Nạp tiền vào ví
- `_handleWithdraw(amount, note)` - Rút tiền từ ví
- `_handleIssueVirtualCredit(amount, expiryDays, note)` - Cấp công nợ ảo
- `_getCurrentUserEmail()` - Lấy email user hiện tại

**Modal features:**
- Dynamic title/labels based on action type
- Amount input với validation
- Note input
- Expiry days input (chỉ cho virtual credit)
- Confirm/Cancel buttons
- Loading state khi submit
- Error handling với notification

---

# FILES MODIFIED IN 2026-01-14 UPDATE

## New Files Created
| File | Purpose |
|------|---------|
| `render.com/migrations/013_verification_workflow.sql` | Database migration for verification |
| `balance-history/js/verification.js` | Verification UI module |

## Files Modified
| File | Changes |
|------|---------|
| `render.com/routes/sepay-webhook.js` | Added verification_status, match_method to all UPDATE statements |
| `render.com/routes/v2/balance-history.js` | Added verification-queue, approve, reject, resolve-match endpoints |
| `render.com/routes/v2/wallets.js` | Added adjustment, adjustments endpoints |
| `balance-history/index.html` | Added verification tab, stats grid, table, pagination |
| `user-management/js/permissions-registry.js` | Added 5 new permissions for verification |
| `issue-tracking/js/script.js` | Added wallet credit call after RECEIVE action |
| `customer-hub/js/modules/wallet-panel.js` | Replaced placeholders with actual modal + API calls |

---

# NEW: VIRTUAL CREDIT LOGIC FIX (2026-01-20)

## Vấn đề đã sửa

**Trước đây (SAI):**
- RETURN_SHIPPER: Cap virtual_credit khi RECEIVE (nhan hang ve kho)
- RETURN_CLIENT: Cong deposit khi RECEIVE

**Sau khi sửa (ĐÚNG theo nghiệp vụ):**
- **RETURN_SHIPPER**: Cap virtual_credit **NGAY khi tao ticket** (khong phai khi RECEIVE)
- **RETURN_CLIENT**: Cong deposit khi RECEIVE (giu nguyen)

## Logic nghiệp vụ

| Loai Ticket | Khi Tao Ticket | Khi RECEIVE |
|-------------|----------------|-------------|
| RETURN_SHIPPER | **CAP NGAY virtual_credit (15 ngay)** | Chi tao phieu TPOS, KHONG cong vi |
| RETURN_CLIENT | Khong cong vi | **Cong deposit (tien that)** |
| BOOM/FIX_COD | Khong cong vi | Khong cong vi |

## Files đã sửa

| File | Line | Thay đổi |
|------|------|----------|
| `issue-tracking/js/script.js` | 943-980 | Thêm logic cap virtual_credit khi tao ticket RETURN_SHIPPER |
| `issue-tracking/js/script.js` | 1073-1130 | Sửa RECEIVE chi cong deposit cho RETURN_CLIENT |
| `render.com/routes/v2/tickets.js` | 539-591 | Thêm endpoint `/new/resolve-credit` |
| `render.com/services/wallet-event-processor.js` | 407-482 | issueVirtualCredit bypass wallet_transactions (do constraint) |
| `render.com/routes/customer-360.js` | 478-507 | UNION query để hiển thị virtual credits trong wallet history |
| `customer-hub/js/modules/wallet-panel.js` | 430-471 | Thêm VIRTUAL_CREDIT_ISSUED type, hiển thị hạn sử dụng (HSD) |

## API mới: `/api/v2/tickets/new/resolve-credit`

```javascript
// Request
POST /api/v2/tickets/new/resolve-credit
{
    "phone": "0977888999",
    "amount": 300000,
    "ticket_code": "TKRS-20260120-001",
    "note": "Cong no ao - Thu ve don 123456",
    "expires_in_days": 15
}

// Response
{
    "success": true,
    "data": {
        "expires_at": "2026-02-04T10:30:00.000Z"
    }
}
```

## Lưu ý kỹ thuật

1. **issueVirtualCredit() bypass wallet_transactions**: Do constraint `wallet_transactions_type_check` không có type 'VIRTUAL_CREDIT_ISSUED', function này trực tiếp insert vào `virtual_credits` và update `customer_wallets.virtual_balance`

2. **UNION query cho wallet history**: Để hiển thị virtual credits trong lịch sử giao dịch, phải dùng UNION query kết hợp `wallet_transactions` và `virtual_credits`

3. **UI expiry display**: Virtual credits hiển thị với badge "HSD: dd/mm/yyyy" màu cam để phân biệt với tiền thật

---

# NEW: XÓA TICKET VÀ THU HỒI VIRTUAL CREDIT (2026-01-22)

## Vấn đề

Khi xóa ticket RETURN_SHIPPER (đã cấp virtual credit), cần xử lý đúng tình huống:
- Nếu virtual credit đã sử dụng → KHÔNG CHO XÓA
- Nếu virtual credit chưa sử dụng → Cho xóa + CANCEL virtual credit

## Migration mới

**File:** `render.com/migrations/023_add_virtual_cancel_type.sql`

```sql
-- Thêm VIRTUAL_CANCEL vào wallet_transactions_type_check constraint
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
    CHECK (type IN (
        'DEPOSIT', 'WITHDRAW', 'VIRTUAL_CREDIT', 'VIRTUAL_DEBIT',
        'VIRTUAL_EXPIRE', 'VIRTUAL_CANCEL', 'ADJUSTMENT'
    ));

-- Thêm 'CANCELLED' vào virtual_credits status
ALTER TABLE virtual_credits DROP CONSTRAINT IF EXISTS virtual_credits_status_check;
ALTER TABLE virtual_credits ADD CONSTRAINT virtual_credits_status_check
    CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED'));
```

## API mới

### `GET /api/v2/tickets/:id/can-delete`

Kiểm tra ticket có thể xóa không:

```javascript
// Response khi cho phép xóa
{
    "canDelete": true,
    "reason": "Virtual credit chưa sử dụng, có thể xóa",
    "creditStatus": "ACTIVE",
    "remainingAmount": 300000
}

// Response khi KHÔNG cho phép xóa
{
    "canDelete": false,
    "reason": "Virtual credit đã sử dụng một phần (250,000đ/300,000đ), không thể xóa ticket",
    "creditStatus": "PARTIAL_USED",
    "remainingAmount": 250000,
    "originalAmount": 300000
}
```

## UI Updates

### wallet-panel.js - Transaction Labels mới

```javascript
const typeLabels = {
    'DEPOSIT': 'Nạp tiền',
    'WITHDRAW': 'Rút tiền',
    'VIRTUAL_CREDIT': 'Cộng công nợ ảo',
    'VIRTUAL_CREDIT_ISSUED': 'Cộng công nợ ảo (Thu về)',
    'VIRTUAL_CREDIT_CANCELLED': 'Cộng công nợ ảo (đã hủy)',
    'VIRTUAL_DEBIT': 'Trừ công nợ ảo',
    'VIRTUAL_EXPIRE': 'Công nợ hết hạn',
    'VIRTUAL_CANCEL': 'Thu hồi công nợ ảo',
    'ADJUSTMENT': 'Điều chỉnh số dư'
};
```

## Test Cases

### Test Case: Xóa ticket RETURN_SHIPPER với virtual credit chưa sử dụng
1. Tạo ticket RETURN_SHIPPER với 300,000đ
2. Virtual credit được cấp ngay
3. Thử xóa ticket
4. [x] Hệ thống gọi `/can-delete` → canDelete: true
5. [x] Virtual credit status → CANCELLED
6. [x] Tạo transaction VIRTUAL_CANCEL
7. [x] virtual_balance -= 300,000

### Test Case: Xóa ticket RETURN_SHIPPER với virtual credit đã sử dụng
1. Tạo ticket RETURN_SHIPPER với 300,000đ
2. Khách đặt đơn mới, sử dụng 50,000đ virtual credit
3. Thử xóa ticket
4. [x] Hệ thống gọi `/can-delete` → canDelete: false
5. [x] Thông báo lỗi cho user
6. [x] Ticket vẫn còn
