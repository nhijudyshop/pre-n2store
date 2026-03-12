PLAN: Tích hợp Balance-History với Wallet & Thay thế /ck
Tóm tắt
Thay thế hoàn toàn trang /ck bằng balance-history, tích hợp workflow xác minh giao dịch và cộng tiền vào ví khách hàng (customer-360).

1. Yêu cầu nghiệp vụ
1.1 Quy tắc Auto-Approve (Cộng ví ngay lập tức)
Loại mapping	Điều kiện	Hành động
QR Code	Match N2+16 ký tự	Auto cộng ví
Full Phone	10 số SĐT trong nội dung	Auto cộng ví
Partial Phone	6 số, tìm được DUY NHẤT 1 KH	Auto cộng ví
1.2 Quy tắc Manual-Approve (Cần kế toán duyệt)
Loại mapping	Điều kiện	Hành động
Pending Match	Nhiều KH khớp, chọn dropdown	Chờ kế toán duyệt
Manual Entry	NV live nhập tay	Chờ kế toán duyệt
Manual Link	Kế toán gán tay	Cộng ví sau khi lưu
1.3 Xử lý sai mapping
KHÔNG rollback - chỉ tạo phiếu điều chỉnh
Trừ tiền từ KH sai, cộng tiền cho KH đúng (nếu biết)
1.4 Phân quyền
Accountant + Admin: Duyệt/Reject giao dịch, tạo điều chỉnh
2. Database Changes
2.1 File: render.com/migrations/008_verification_workflow.sql

-- Thêm cột verification vào balance_history
ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) DEFAULT 'PENDING'
    CHECK (verification_status IN (
        'PENDING',              -- Chờ xử lý
        'AUTO_APPROVED',        -- Auto duyệt (QR, exact phone, single match)
        'PENDING_VERIFICATION', -- Chờ kế toán duyệt
        'APPROVED',             -- Đã duyệt thủ công
        'REJECTED'              -- Từ chối
    ));

ALTER TABLE balance_history
ADD COLUMN IF NOT EXISTS match_method VARCHAR(30)
    CHECK (match_method IN (
        'qr_code',        -- QR matched
        'exact_phone',    -- Full 10-digit phone
        'single_match',   -- Partial với 1 match duy nhất
        'pending_match',  -- Chờ chọn từ dropdown
        'manual_entry',   -- NV live nhập tay
        'manual_link'     -- Kế toán gán tay
    ));

ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS verified_by VARCHAR(100);
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS verification_note TEXT;

-- Index cho verification queue
CREATE INDEX IF NOT EXISTS idx_bh_verification_status
    ON balance_history(verification_status)
    WHERE verification_status IN ('PENDING_VERIFICATION', 'PENDING');

-- Bảng điều chỉnh ví (thay vì rollback)
CREATE TABLE IF NOT EXISTS wallet_adjustments (
    id SERIAL PRIMARY KEY,
    original_transaction_id INTEGER REFERENCES balance_history(id),
    wallet_transaction_id INTEGER REFERENCES wallet_transactions(id),
    adjustment_type VARCHAR(30) NOT NULL CHECK (adjustment_type IN (
        'WRONG_MAPPING_CREDIT',
        'WRONG_MAPPING_DEBIT',
        'DUPLICATE_REVERSAL',
        'ADMIN_CORRECTION'
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
3. Backend API Changes
3.1 File: render.com/routes/sepay-webhook.js
Sửa function processDebtUpdate:

Sau khi match thành công, set verification_status và match_method
Nếu auto-approve → gọi depositToWallet() ngay
Nếu pending → set verification_status = 'PENDING_VERIFICATION'
3.2 File: render.com/routes/v2/balance-history.js (thêm endpoints)

// Lấy danh sách chờ duyệt
GET /api/v2/balance-history/verification-queue
Query: { status, page, limit }

// Duyệt giao dịch
POST /api/v2/balance-history/:id/approve
Body: { note?, verified_by }
Action: Cộng tiền vào ví KH

// Từ chối giao dịch
POST /api/v2/balance-history/:id/reject
Body: { reason, verified_by }
Action: Set status = REJECTED, không cộng ví

// Chọn KH từ pending matches
POST /api/v2/balance-history/:id/resolve-match
Body: { phone, customer_name?, resolved_by }
Action: Set status = PENDING_VERIFICATION (chờ duyệt)
3.3 File: render.com/routes/v2/wallets.js (thêm endpoints)

// Tạo điều chỉnh ví
POST /api/v2/wallets/adjustment
Body: {
    original_transaction_id,
    wrong_customer_phone,
    correct_customer_phone?,
    adjustment_type,
    reason,
    created_by
}

// Lịch sử điều chỉnh
GET /api/v2/wallets/adjustments
3.4 Helper Function: depositToWallet()
Tạo/update customer_wallets
Cộng balance
Log wallet_transactions (type: DEPOSIT, source: BANK_TRANSFER)
Log customer_activities
Set balance_history.wallet_processed = TRUE
4. Frontend Changes
4.1 File: balance-history/index.html
Thêm tab "Chờ Duyệt" trong view-tabs
Thêm modal "Điều chỉnh ví"
Thêm nút Duyệt/Từ chối cho row pending
4.2 File: balance-history/main.js
Thêm function loadVerificationQueue()
Thêm function approveTransaction(id)
Thêm function rejectTransaction(id)
Thêm badges hiển thị verification_status
Thêm permission check cho nút Duyệt/Từ chối
4.3 File: balance-history/styles.css
Style cho verification status badges
Style cho verification queue table
5. Workflow States

Webhook nhận GD
    │
    ├── QR/Full Phone/Single Match ──► AUTO_APPROVED ──► Cộng ví ngay
    │
    ├── Multiple Matches ──► PENDING_VERIFICATION ──► Chờ NV chọn KH
    │                                                    │
    │                                                    ▼
    │                                              Chờ kế toán duyệt
    │                                                    │
    │                                          ┌────────┴────────┐
    │                                          ▼                 ▼
    │                                      APPROVED          REJECTED
    │                                          │                 │
    │                                     Cộng ví           Không cộng
    │
    └── Manual Entry (NV live) ──► PENDING_VERIFICATION ──► Chờ kế toán
6. Cấu trúc thư mục hiện tại (ĐÃ KIỂM TRA)

balance-history/
├── css/
│   ├── modern.css          # Modern UI base styles
│   ├── styles.css          # Main styles cho balance-history
│   └── transfer-stats.css  # Styles cho Transfer Stats tab
├── docs/
│   ├── COMPLETE_SPECIFICATION.md
│   ├── DEPLOYMENT_GUIDE.md
│   ├── IMPLEMENTATION_GUIDE.md
│   ├── PARTIAL_PHONE_TPOS_SEARCH.md
│   ├── PHONE_EXTRACTION_FEATURE.md
│   ├── PHONE_EXTRACTION_IMPROVEMENTS.md
│   ├── PHONE_PARTNER_FETCH_GUIDE.md
│   ├── PR_SUMMARY.md
│   ├── QR_DEBT_FLOW.md
│   └── README.md
├── js/
│   ├── auth.js              # Authentication logic
│   ├── cache.js             # Caching utilities
│   ├── config.js            # Configuration constants
│   ├── customer-info.js     # Customer info handling
│   ├── main.js              # Main balance history logic
│   ├── notification-system.js # Notification utilities
│   ├── qr-generator.js      # QR code generation
│   └── transfer-stats.js    # Transfer stats tab logic
└── index.html               # Main HTML entry point
7. Files cần sửa/tạo
File	Action	Mô tả
render.com/migrations/008_verification_workflow.sql	CREATE	Schema mới
render.com/routes/sepay-webhook.js	MODIFY	Thêm verification logic
render.com/routes/v2/balance-history.js	MODIFY	Thêm verification APIs
render.com/routes/v2/wallets.js	MODIFY	Thêm adjustment APIs
balance-history/js/main.js	MODIFY	Thêm verification UI logic
balance-history/js/verification.js	CREATE	Module mới cho verification workflow
balance-history/index.html	MODIFY	Thêm verification tab/modal
balance-history/css/styles.css	MODIFY	Thêm verification styles
balance-history/css/verification.css	CREATE	Styles riêng cho verification (optional)
user-management/permissions-registry.js	MODIFY	Thêm permissions mới
8. Permissions mới

'balance-history': {
    'viewVerificationQueue': ['Admin', 'Accountant'],
    'approveTransaction': ['Admin', 'Accountant'],
    'rejectTransaction': ['Admin', 'Accountant'],
    'createWalletAdjustment': ['Admin', 'Accountant'],
    'manualTransactionEntry': ['Admin', 'LiveStaff']
}
9. Testing Checklist
 QR code matched → Auto cộng ví ngay
 Full 10-digit phone → Auto cộng ví ngay
 6-digit partial, 1 match duy nhất → Auto cộng ví ngay
 6-digit partial, nhiều matches → Hiện dropdown, chờ duyệt
 NV live chọn từ dropdown → Chờ kế toán duyệt
 Kế toán approve → Cộng ví
 Kế toán reject → Không cộng ví
 Phát hiện sai mapping → Tạo điều chỉnh (không rollback)
 Permission check cho nút Duyệt/Từ chối
10. Giai đoạn triển khai
Phase 1: Database & Backend (2-3 ngày)
Tạo migration file
Sửa sepay-webhook.js
Thêm verification APIs
Thêm adjustment APIs
Phase 2: Frontend (2-3 ngày)
Thêm verification queue tab
Thêm approve/reject UI
Thêm adjustment modal
Thêm status badges
Phase 3: Testing & Migration (1-2 ngày)
Test tất cả scenarios
Migrate existing data
Deprecate /ck folder
11. Quyết định đã xác nhận
Câu hỏi	Quyết định
NV live nhập tay ở đâu?	Trực tiếp trên balance-history
Giao dịch cũ xử lý thế nào?	Chỉ áp dụng cho GD mới (không xử lý GD cũ)
Thông báo realtime?	Không cần (kế toán tự F5)
12. Verification Strategy
12.1 Với GD mới (sau khi triển khai)
Webhook nhận → xử lý theo workflow mới
Set verification_status tương ứng
Auto/Manual approve theo quy tắc
12.2 Với GD cũ (trước khi triển khai)
KHÔNG xử lý - giữ nguyên
verification_status = NULL (không áp dụng workflow)
wallet_processed giữ nguyên
12.3 NV Live nhập tay
Trực tiếp trên balance-history
Click vào GD chưa có KH → hiện form nhập SĐT + Tên
Sau khi nhập → set verification_status = 'PENDING_VERIFICATION'
Chờ kế toán duyệt
13. UI Flow cho NV Live

1. NV live mở balance-history
2. Xem danh sách GD (filter: "Chưa có SĐT")
3. Click vào GD cần gán KH
4. Hiện form:
   - Input SĐT (bắt buộc)
   - Input Tên (tùy chọn - có thể auto-fetch từ TPOS)
   - Nút "Lưu & Chờ duyệt"
5. Lưu → set verification_status = 'PENDING_VERIFICATION'
6. Kế toán vào tab "Chờ Duyệt" → Approve/Reject
14. UI Flow cho Kế toán

1. Kế toán mở balance-history
2. Xem tab "Chờ Duyệt" (hiện badge số lượng)
3. Mỗi row hiển thị:
   - Thông tin GD (ngày, số tiền, nội dung)
   - Thông tin KH đã gán (SĐT, tên, nguồn mapping)
   - Nút "Duyệt" (màu xanh) + "Từ chối" (màu đỏ)
4. Click "Duyệt":
   - Xác nhận popup
   - Cộng tiền vào ví KH
   - Set verification_status = 'APPROVED'
5. Click "Từ chối":
   - Nhập lý do
   - Set verification_status = 'REJECTED'
   - Không cộng ví