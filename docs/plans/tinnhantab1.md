Plan: Pending Customers List - Lưu danh sách khách chưa trả lời
Mục tiêu mới (CẬP NHẬT)
Tạo cơ chế lưu lại TOÀN BỘ danh sách khách hàng mới gửi tin cho đến khi user nhắn lại họ trong modal chat.

Yêu cầu từ user:

"không mặc định là không mark-seen tin nhắn chỉ xem thôi không mark-seen làm ảnh hưởng đến thông báo chưa đọc trên pancake, tôi cần ở đây là cơ chế lưu lại toàn bộ danh sách các khách mới gửi cho đến khi tôi nhắn lại họ trong modal tin nhắn"

Yêu cầu bổ sung:

"nhân viên đâu có bật máy liên tục và khách hàng nhắn vào pancake từ tối đến sáng sáng họ vào làm mới bật lên xem thì đâu có lưu local tin trước đó, có cơ chế nào lưu trên database render tạm để đồng bộ vào cho client khi họ bật trang"

Kịch bản thực tế

17h: Nhân viên tắt máy về nhà
     │
     ├─ 18h: Khách A nhắn tin
     ├─ 20h: Khách B, C nhắn tin
     ├─ 23h: Khách D comment
     ├─ 2h:  Khách E nhắn tin
     ├─ 6h:  Khách F, G nhắn tin
     │
8h sáng: Nhân viên bật máy lên làm việc
     │
     └─ localStorage TRỐNG → MẤT DANH SÁCH 7 KHÁCH ĐÊM QUA!
Vấn đề: localStorage chỉ tồn tại trên browser → khi tắt máy/đổi máy sẽ mất hết.

Phân tích yêu cầu (Cập nhật)
KHÔNG MUỐN:

❌ Mark-seen tin nhắn trên Pancake (ảnh hưởng thông báo)
❌ Mất danh sách khi reload page
❌ Mất danh sách khi tắt máy/đổi máy
MUỐN:

✅ Lưu TOÀN BỘ danh sách khách hàng mới gửi tin
✅ Danh sách tồn tại cho đến khi nhắn lại khách trong modal chat
✅ LƯU TRÊN SERVER - persist qua tắt máy, đổi máy
✅ Đồng bộ từ server xuống client khi mở trang
✅ Không ảnh hưởng thông báo chưa đọc trên Pancake
Giải pháp: Server-Side Pending Customers
Kiến trúc mới:

┌──────────────────────────────────────────────────────────────────────────┐
│  FLOW: SERVER-SIDE PENDING CUSTOMERS                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [RENDER SERVER]                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ realtime_updates table                                          │    │
│  │ (đã có sẵn - lưu tất cả tin nhắn mới từ Pancake WebSocket)      │    │
│  │                                                                 │    │
│  │ + Thêm cột: replied = BOOLEAN (default FALSE)                   │    │
│  │ + Tin chưa trả lời: replied = FALSE                             │    │
│  │ + Khi user nhắn lại: UPDATE replied = TRUE                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  [API ENDPOINTS - MỚI]                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ GET /api/realtime/pending-customers                              │    │
│  │ → Lấy danh sách khách chưa được trả lời (replied = FALSE)        │    │
│  │ → Group by PSID, trả về unique customers                         │    │
│  │                                                                 │    │
│  │ POST /api/realtime/mark-replied                                  │    │
│  │ → Đánh dấu đã trả lời { psid, pageId }                           │    │
│  │ → UPDATE replied = TRUE WHERE psid = $1 AND page_id = $2         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  [FRONTEND]                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 1. Khi mở trang:                                                 │    │
│  │    → GET /pending-customers                                      │    │
│  │    → Highlight tất cả pending rows                               │    │
│  │                                                                 │    │
│  │ 2. Khi nhắn lại trong modal:                                     │    │
│  │    → POST /mark-replied { psid, pageId }                         │    │
│  │    → Xóa highlight khỏi row                                      │    │
│  │                                                                 │    │
│  │ 3. localStorage (optional cache):                                │    │
│  │    → Cache danh sách để giảm API calls                           │    │
│  │    → TTL: 5 phút                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
So sánh hai approach:
Tiêu chí	localStorage only	Server-side (Đề xuất)
Tắt máy/đổi máy	❌ Mất data	✅ Giữ nguyên
Multi-user	❌ Mỗi người riêng	✅ Shared state
Tin nhắn đêm	❌ Không có	✅ Có đầy đủ
Performance	✅ Nhanh (local)	✅ Nhanh (API + cache)
Complexity	✅ Đơn giản	⚠️ Cần sửa backend
Database Schema Update
Option A: Thêm cột vào bảng hiện có

-- Thêm cột replied vào realtime_updates
ALTER TABLE realtime_updates
ADD COLUMN replied BOOLEAN DEFAULT FALSE;

-- Index để query nhanh
CREATE INDEX idx_realtime_pending ON realtime_updates(psid, page_id, replied)
WHERE replied = FALSE;
Option B: Tạo bảng mới (Cleaner)

-- Bảng riêng cho pending customers
CREATE TABLE pending_customers (
    id SERIAL PRIMARY KEY,
    psid VARCHAR(50) NOT NULL,
    page_id VARCHAR(50) NOT NULL,
    customer_name VARCHAR(200),
    last_message_snippet TEXT,
    last_message_time TIMESTAMP DEFAULT NOW(),
    message_count INTEGER DEFAULT 1,
    type VARCHAR(20) DEFAULT 'INBOX',
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(psid, page_id)  -- Mỗi khách chỉ có 1 record
);

-- Index cho query
CREATE INDEX idx_pending_psid ON pending_customers(psid, page_id);
Khuyến nghị: Option B - tách riêng để dễ quản lý và không ảnh hưởng logic hiện tại.

Files cần sửa
Backend (Render.com)
1. render.com/routes/realtime.js - Thêm 2 API endpoints mới

/**
 * GET /api/realtime/pending-customers
 * Lấy danh sách khách chưa được trả lời
 */
router.get('/pending-customers', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const limit = Math.min(parseInt(req.query.limit) || 500, 1500);

        const query = `
            SELECT
                psid,
                page_id,
                customer_name,
                last_message_snippet,
                last_message_time,
                message_count,
                type
            FROM pending_customers
            ORDER BY last_message_time DESC
            LIMIT $1
        `;

        const result = await db.query(query, [limit]);

        res.json({
            success: true,
            count: result.rows.length,
            customers: result.rows
        });

    } catch (error) {
        console.error('[REALTIME-API] Error fetching pending customers:', error);
        res.status(500).json({ error: 'Failed to fetch pending customers' });
    }
});

/**
 * POST /api/realtime/mark-replied
 * Đánh dấu đã trả lời khách
 */
router.post('/mark-replied', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const { psid, pageId } = req.body;

        if (!psid) {
            return res.status(400).json({ error: 'Missing psid parameter' });
        }

        const query = `
            DELETE FROM pending_customers
            WHERE psid = $1 AND (page_id = $2 OR $2 IS NULL)
            RETURNING *
        `;

        const result = await db.query(query, [psid, pageId || null]);

        console.log(`[REALTIME-DB] Marked replied: ${psid} (${result.rowCount} removed)`);

        res.json({
            success: true,
            removed: result.rowCount
        });

    } catch (error) {
        console.error('[REALTIME-API] Error marking replied:', error);
        res.status(500).json({ error: 'Failed to mark as replied' });
    }
});
2. render.com/server.js - Sửa handleMessage để upsert pending_customers
Trong handleMessage() của RealtimeClient, thêm logic insert/update vào pending_customers:


// Trong handleMessage(), sau khi lưu vào realtime_updates:
async function upsertPendingCustomer(db, data) {
    const query = `
        INSERT INTO pending_customers
        (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type)
        VALUES ($1, $2, $3, $4, NOW(), 1, $5)
        ON CONFLICT (psid, page_id)
        DO UPDATE SET
            customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
            last_message_snippet = EXCLUDED.last_message_snippet,
            last_message_time = NOW(),
            message_count = pending_customers.message_count + 1
    `;

    await db.query(query, [
        data.psid,
        data.pageId,
        data.customerName,
        data.snippet,
        data.type || 'INBOX'
    ]);
}
Frontend
3. orders-report/js/chat/new-messages-notifier.js

const PENDING_API = 'https://n2store-fallback.onrender.com/api/realtime';

/**
 * Fetch pending customers từ server
 */
async function fetchPendingCustomers() {
    try {
        const response = await fetch(`${PENDING_API}/pending-customers?limit=1500`, {
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) return [];

        const data = await response.json();
        return data.success ? data.customers : [];

    } catch (error) {
        console.warn('[PENDING] Fetch error:', error.message);
        return [];
    }
}

/**
 * Đánh dấu đã trả lời trên server
 */
async function markRepliedOnServer(psid, pageId) {
    try {
        const response = await fetch(`${PENDING_API}/mark-replied`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ psid, pageId })
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[PENDING] Marked replied on server: ${psid} (${data.removed} removed)`);
            return true;
        }
    } catch (error) {
        console.warn('[PENDING] Mark replied error:', error.message);
    }
    return false;
}

/**
 * Sửa checkNewMessages() - load pending từ server
 */
async function checkNewMessages() {
    try {
        // 1. Fetch pending customers từ server (thay vì localStorage)
        const pendingCustomers = await fetchPendingCustomers();

        console.log(`[PENDING] Loaded ${pendingCustomers.length} pending customers from server`);

        if (pendingCustomers.length > 0) {
            // Show notification
            showNotification({
                total: pendingCustomers.length,
                messages: pendingCustomers.filter(c => c.type === 'INBOX').length,
                comments: pendingCustomers.filter(c => c.type === 'COMMENT').length,
                uniqueCustomers: pendingCustomers.length
            });

            // Highlight rows
            highlightNewMessagesInTable(pendingCustomers.map(c => ({
                psid: c.psid,
                page_id: c.page_id,
                type: c.type
            })));
        }

        saveCurrentTimestamp();

    } catch (error) {
        console.error('[PENDING] Error:', error);
    }
}
4. orders-report/js/tab1/tab1-chat.js - Sửa sendMessage()

// Sau khi gửi tin nhắn thành công:

// Đánh dấu đã trả lời trên SERVER (thay vì localStorage)
if (window.currentChatPSID) {
    // Gọi API mark-replied
    fetch('https://n2store-fallback.onrender.com/api/realtime/mark-replied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            psid: window.currentChatPSID,
            pageId: window.currentChatChannelId
        })
    }).then(res => {
        if (res.ok) {
            console.log('[CHAT] Marked as replied on server');

            // Xóa highlight khỏi row
            const row = document.querySelector(`tr[data-psid="${window.currentChatPSID}"]`);
            if (row) {
                row.querySelectorAll('.new-msg-badge').forEach(b => b.remove());
                row.classList.remove('product-row-highlight');
            }
        }
    }).catch(err => {
        console.warn('[CHAT] Failed to mark replied:', err);
    });
}
Database Migration Script

-- Run on Render PostgreSQL

-- 1. Create pending_customers table
CREATE TABLE IF NOT EXISTS pending_customers (
    id SERIAL PRIMARY KEY,
    psid VARCHAR(50) NOT NULL,
    page_id VARCHAR(50) NOT NULL,
    customer_name VARCHAR(200),
    last_message_snippet TEXT,
    last_message_time TIMESTAMP DEFAULT NOW(),
    message_count INTEGER DEFAULT 1,
    type VARCHAR(20) DEFAULT 'INBOX',
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(psid, page_id)
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_pending_psid ON pending_customers(psid, page_id);
CREATE INDEX IF NOT EXISTS idx_pending_time ON pending_customers(last_message_time DESC);

-- 3. (Optional) Migrate existing unseen messages to pending_customers
INSERT INTO pending_customers (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type)
SELECT
    psid,
    page_id,
    MAX(customer_name) as customer_name,
    MAX(snippet) as last_message_snippet,
    MAX(created_at) as last_message_time,
    COUNT(*) as message_count,
    MAX(type) as type
FROM realtime_updates
WHERE seen = FALSE OR seen IS NULL
GROUP BY psid, page_id
ON CONFLICT (psid, page_id) DO NOTHING;
Implementation Steps
Phase 1: Database Setup
SSH vào Render PostgreSQL
Chạy migration script tạo bảng pending_customers
Phase 2: Backend APIs
Mở render.com/routes/realtime.js
Thêm GET /pending-customers endpoint
Thêm POST /mark-replied endpoint
Sửa server.js - thêm upsertPendingCustomer() trong handleMessage
Phase 3: Frontend Integration
Sửa new-messages-notifier.js - fetch từ server thay vì localStorage
Sửa tab1-chat.js - gọi /mark-replied khi gửi tin
Phase 4: Deploy & Test
Deploy backend lên Render
Test flow: tắt máy → tin nhắn mới → bật lại → verify pending
Verification
Test Server-Side Pending:
Gửi vài tin nhắn test từ Pancake
Kiểm tra database: SELECT * FROM pending_customers;
Tắt browser hoàn toàn
Mở lại browser → pending customers phải hiển thị đầy đủ
Nhắn lại 1 khách → verify đã bị xóa khỏi pending
Debug Commands:

-- Xem pending customers
SELECT * FROM pending_customers ORDER BY last_message_time DESC;

-- Đếm số lượng
SELECT COUNT(*) FROM pending_customers;

-- Clear all (debug only)
DELETE FROM pending_customers;
API Test:

# Lấy pending customers
curl https://n2store-fallback.onrender.com/api/realtime/pending-customers

# Mark replied
curl -X POST https://n2store-fallback.onrender.com/api/realtime/mark-replied \
  -H "Content-Type: application/json" \
  -d '{"psid":"123456789","pageId":"987654321"}