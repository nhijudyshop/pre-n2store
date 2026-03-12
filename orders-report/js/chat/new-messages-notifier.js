// =====================================================
// NEW MESSAGES NOTIFIER
// Thông báo tin nhắn/bình luận mới khi user load trang
// =====================================================

(function () {
    'use strict';

    const STORAGE_KEY = 'last_realtime_check';
    // Use n2store-realtime server (has WebSocket + Database + pending-customers API)
    const SERVER_URL = 'https://n2store-realtime.onrender.com';
    // Fallback to n2store-fallback if realtime server is down
    const FALLBACK_URL = 'https://n2store-fallback.onrender.com';
    // Cloudflare Worker fallback
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    /**
     * Get last seen timestamp from localStorage
     */
    function getLastSeenTimestamp() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return parseInt(stored, 10);
        }
        // Default: 1 hour ago (first time user)
        return Date.now() - (60 * 60 * 1000);
    }

    /**
     * Save current timestamp to localStorage
     */
    function saveCurrentTimestamp() {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }

    /**
     * Mark messages as seen on server (so they don't appear again)
     */
    async function markMessagesAsSeen(timestamp) {
        try {
            const response = await fetch(`${SERVER_URL}/api/realtime/mark-seen`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ before: timestamp })
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`[NEW-MSG-NOTIFIER] Marked ${result.updated} messages as seen`);
                return result;
            }
        } catch (error) {
            console.warn('[NEW-MSG-NOTIFIER] Failed to mark messages as seen:', error.message);
        }
        return null;
    }

    /**
     * Fetch new messages from server (legacy - based on timestamp)
     */
    async function fetchNewMessages(since) {
        const urls = [
            `${SERVER_URL}/api/realtime/summary?since=${since}`,
            `${WORKER_URL}/api/realtime/summary?since=${since}`
        ];

        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(10000) // 10s timeout
                });

                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                console.warn(`[NEW-MSG-NOTIFIER] Failed to fetch from ${url}:`, error.message);
            }
        }

        return null;
    }

    /**
     * Fetch pending customers từ server (khách chưa được trả lời)
     * Đây là cách mới - persist qua tắt máy/đổi máy
     * Server 24/7 lưu tin nhắn vào database, frontend fetch nhanh
     */
    async function fetchPendingCustomers() {
        const urls = [
            `${SERVER_URL}/api/realtime/pending-customers?limit=1500`,
            `${FALLBACK_URL}/api/realtime/pending-customers?limit=1500`
        ];

        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(10000)
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        console.log(`[NEW-MSG-NOTIFIER] Fetched from ${url.includes('realtime') ? 'realtime' : 'fallback'} server`);
                        return data.customers || [];
                    }
                }
            } catch (error) {
                console.warn(`[NEW-MSG-NOTIFIER] Failed to fetch from ${url}:`, error.message);
            }
        }

        console.warn('[NEW-MSG-NOTIFIER] All servers failed to fetch pending customers');
        return [];
    }

    /**
     * Đánh dấu đã trả lời khách trên server
     * Gọi cả 2 server để đảm bảo đồng bộ (nếu dùng chung database thì chỉ cần 1)
     */
    async function markRepliedOnServer(psid, pageId) {
        const urls = [
            `${SERVER_URL}/api/realtime/mark-replied`,
            `${FALLBACK_URL}/api/realtime/mark-replied`
        ];

        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ psid, pageId })
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`[NEW-MSG-NOTIFIER] Marked replied: ${psid} (${data.removed} removed)`);
                    return true;
                }
            } catch (error) {
                console.warn(`[NEW-MSG-NOTIFIER] Failed to mark replied on ${url}:`, error.message);
            }
        }

        return false;
    }

    /**
     * Show notification toast
     */
    function showNotification(summary) {
        if (!summary || summary.total === 0) return;

        const { messages, comments, uniqueCustomers } = summary;

        // Build message
        let text = '';
        if (messages > 0 && comments > 0) {
            text = `${messages} tin nhắn và ${comments} bình luận mới`;
        } else if (messages > 0) {
            text = `${messages} tin nhắn mới`;
        } else if (comments > 0) {
            text = `${comments} bình luận mới`;
        }

        if (uniqueCustomers > 0) {
            text += ` từ ${uniqueCustomers} khách hàng`;
        }

        // Add clickable hint
        const clickHint = '<div style="font-size:11px;opacity:0.7;margin-top:4px;display:flex;align-items:center;gap:4px;"><i class="fas fa-hand-pointer" style="font-size:10px;"></i> Bấm để xem chi tiết</div>';

        // Show toast notification (clickable → opens pending customers modal)
        if (window.notificationManager && window.notificationManager.success) {
            const notifId = window.notificationManager.success(text + clickHint, 8000);
            // Make it clickable
            setTimeout(() => {
                const el = document.querySelector(`.toast[data-id="${notifId}"]`);
                if (el) {
                    el.style.cursor = 'pointer';
                    el.addEventListener('click', (e) => {
                        if (e.target.closest('.toast-close')) return;
                        showPendingCustomersModal();
                    });
                }
            }, 50);
        } else {
            // Fallback: Show custom toast if notificationManager not ready
            showFallbackToast(text, summary);
        }

        console.log(`[NEW-MSG-NOTIFIER] ${text}`);
    }

    /**
     * Fallback toast when notificationManager not available
     */
    function showFallbackToast(text, summary) {
        // Create toast element
        const toast = document.createElement('div');
        toast.id = 'new-messages-toast';
        toast.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px 24px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4);
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: slideIn 0.3s ease-out;
                max-width: 350px;
                cursor: pointer;
            ">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 28px;">📬</div>
                    <div>
                        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">
                            Có tin mới!
                        </div>
                        <div style="font-size: 13px; opacity: 0.95;">
                            ${text}
                        </div>
                        <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">
                            <i class="fas fa-hand-pointer" style="font-size: 10px;"></i> Bấm để xem chi tiết
                        </div>
                    </div>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()"
                            style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; opacity: 0.7; margin-left: auto;">
                        ×
                    </button>
                </div>
            </div>
            <style>
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
        `;

        toast.querySelector('div[style*="position: fixed"]').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            showPendingCustomersModal();
        });

        document.body.appendChild(toast);

        // Auto remove after 8 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'slideOut 0.3s ease-in forwards';
                toast.innerHTML += `
                    <style>
                        @keyframes slideOut {
                            from { transform: translateX(0); opacity: 1; }
                            to { transform: translateX(100%); opacity: 0; }
                        }
                    </style>
                `;
                setTimeout(() => toast.remove(), 300);
            }
        }, 8000);
    }

    /**
     * Show modal with all pending customers (messages & comments)
     */
    function showPendingCustomersModal() {
        // Remove existing modal
        document.getElementById('pendingCustomersModal')?.remove();

        const customers = cachedPendingCustomers || [];
        const msgCount = customers.filter(c => c.type === 'INBOX').length;
        const cmtCount = customers.filter(c => c.type === 'COMMENT').length;

        // Sort by time DESC
        const sorted = [...customers].sort((a, b) =>
            new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0)
        );

        function timeAgo(dateStr) {
            if (!dateStr) return '';
            const diff = Date.now() - new Date(dateStr).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'vừa xong';
            if (mins < 60) return `${mins} phút`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs} giờ`;
            const days = Math.floor(hrs / 24);
            return `${days} ngày`;
        }

        function buildRows(filter) {
            const list = filter === 'all' ? sorted : sorted.filter(c => c.type === filter);
            if (list.length === 0) {
                return '<div style="text-align:center;padding:32px;color:#9ca3af;">Không có dữ liệu</div>';
            }
            return list.map(c => {
                const isMsg = c.type === 'INBOX';
                const badge = isMsg
                    ? '<span style="background:#3b82f6;color:#fff;font-size:10px;padding:2px 8px;border-radius:9999px;font-weight:600;">TIN NHẮN</span>'
                    : '<span style="background:#f59e0b;color:#fff;font-size:10px;padding:2px 8px;border-radius:9999px;font-weight:600;">BÌNH LUẬN</span>';
                const snippet = (c.last_message_snippet || '').substring(0, 60);
                const countBadge = (c.message_count || 1) > 1
                    ? `<span style="background:#ef4444;color:#fff;font-size:10px;padding:1px 6px;border-radius:9999px;margin-left:4px;">${c.message_count}</span>`
                    : '';
                return `
                    <div class="pending-row" data-psid="${c.psid || ''}" data-page-id="${c.page_id || ''}" data-type="${c.type || ''}" style="
                        display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f3f4f6;
                        cursor:pointer;transition:background .15s;
                    " onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
                        <div style="width:36px;height:36px;border-radius:50%;background:${isMsg ? '#dbeafe' : '#fef3c7'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="${isMsg ? 'fas fa-comment-dots' : 'fas fa-comments'}" style="color:${isMsg ? '#3b82f6' : '#f59e0b'};font-size:14px;"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                                <span style="font-weight:600;font-size:13px;color:#111827;">${c.customer_name || 'Khách hàng'}</span>
                                ${countBadge}
                                ${badge}
                            </div>
                            <div style="font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                ${snippet || '...'}
                            </div>
                        </div>
                        <div style="font-size:11px;color:#9ca3af;white-space:nowrap;flex-shrink:0;">
                            ${timeAgo(c.last_message_time)}
                        </div>
                    </div>
                `;
            }).join('');
        }

        const modalHTML = `
            <div id="pendingCustomersModal" style="
                position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;
                display:flex;align-items:center;justify-content:center;
                background:rgba(0,0,0,0.5);animation:fadeIn .2s ease;
            ">
                <div style="
                    background:#fff;border-radius:16px;width:90%;max-width:560px;max-height:80vh;
                    display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,0.25);
                    animation:scaleIn .2s ease;overflow:hidden;
                ">
                    <!-- Header -->
                    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <div style="font-weight:700;font-size:16px;color:#111827;">Chưa trả lời</div>
                            <div style="font-size:12px;color:#6b7280;margin-top:2px;">${customers.length} khách hàng</div>
                        </div>
                        <button onclick="document.getElementById('pendingCustomersModal').remove()" style="
                            background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;color:#6b7280;font-size:20px;
                        " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Tab filters -->
                    <div style="display:flex;gap:4px;padding:8px 20px;border-bottom:1px solid #f3f4f6;background:#fafafa;" id="pendingTabs">
                        <button class="pending-tab active" data-filter="all" style="
                            padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600;
                            background:#111827;color:#fff;transition:all .15s;
                        ">Tất cả (${customers.length})</button>
                        <button class="pending-tab" data-filter="INBOX" style="
                            padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:500;
                            background:transparent;color:#6b7280;transition:all .15s;
                        ">Tin nhắn (${msgCount})</button>
                        <button class="pending-tab" data-filter="COMMENT" style="
                            padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:500;
                            background:transparent;color:#6b7280;transition:all .15s;
                        ">Bình luận (${cmtCount})</button>
                    </div>

                    <!-- Customer list -->
                    <div id="pendingList" style="overflow-y:auto;flex:1;">
                        ${buildRows('all')}
                    </div>
                </div>
            </div>
            <style>
                @keyframes fadeIn { from{opacity:0} to{opacity:1} }
                @keyframes scaleIn { from{transform:scale(0.95);opacity:0} to{transform:scale(1);opacity:1} }
            </style>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Tab switching
        document.getElementById('pendingTabs').addEventListener('click', (e) => {
            const btn = e.target.closest('.pending-tab');
            if (!btn) return;
            document.querySelectorAll('.pending-tab').forEach(t => {
                t.style.background = 'transparent';
                t.style.color = '#6b7280';
                t.style.fontWeight = '500';
                t.classList.remove('active');
            });
            btn.style.background = '#111827';
            btn.style.color = '#fff';
            btn.style.fontWeight = '600';
            btn.classList.add('active');
            document.getElementById('pendingList').innerHTML = buildRows(btn.dataset.filter);
            attachRowClicks();
        });

        // Row clicks → open chat modal
        function attachRowClicks() {
            document.querySelectorAll('#pendingList .pending-row').forEach(row => {
                row.addEventListener('click', () => {
                    const psid = row.dataset.psid;
                    const pageId = row.dataset.pageId;
                    const type = row.dataset.type;

                    // Show loading on clicked row
                    const nameEl = row.querySelector('span[style*="font-weight:600"]');
                    if (nameEl) nameEl.insertAdjacentHTML('afterend', ' <i class="fas fa-spinner fa-spin" style="font-size:11px;color:#6b7280;"></i>');
                    row.style.pointerEvents = 'none';
                    row.style.opacity = '0.6';

                    // Try to find matching order in table
                    let tableRow = document.querySelector(`tr[data-psid="${psid}"][data-page-id="${pageId}"]`);
                    if (!tableRow) tableRow = document.querySelector(`tr[data-psid="${psid}"]`);

                    const orderId = tableRow?.dataset?.orderId;
                    if (orderId && window.openChatModal) {
                        document.getElementById('pendingCustomersModal')?.remove();
                        window.openChatModal(orderId, pageId, psid, type === 'COMMENT' ? 'comment' : 'message');
                    } else {
                        // No matching order in current table
                        row.style.pointerEvents = '';
                        row.style.opacity = '';
                        row.querySelector('.fa-spinner')?.remove();
                        if (window.notificationManager) {
                            window.notificationManager.warning('Đơn hàng không có trong bảng hiện tại. Thử tải lại trang hoặc đổi bộ lọc.', 4000);
                        }
                    }
                });
            });
        }
        attachRowClicks();

        // Close on backdrop click
        document.getElementById('pendingCustomersModal').addEventListener('click', (e) => {
            if (e.target.id === 'pendingCustomersModal') {
                e.target.remove();
            }
        });
    }

    /**
     * Update table cells with "NEW" badge
     * Uses chunked processing to avoid blocking main thread
     */
    function highlightNewMessagesInTable(items) {
        if (!items || items.length === 0) return;

        // Group by psid + pageId for accurate matching
        const psidMap = new Map();
        items.forEach(item => {
            if (item.psid) {
                const key = item.page_id ? `${item.psid}_${item.page_id}` : item.psid;
                if (!psidMap.has(key)) {
                    psidMap.set(key, { messages: 0, comments: 0, psid: item.psid, pageId: item.page_id });
                }
                const entry = psidMap.get(key);
                // Use message_count if available (from pending_customers API)
                const count = item.message_count || 1;
                if (item.type === 'INBOX') {
                    entry.messages += count;
                } else {
                    entry.comments += count;
                }
            }
        });

        // Convert to array for chunked processing
        const entries = Array.from(psidMap.values());
        const CHUNK_SIZE = 50; // Process 50 customers per frame
        let index = 0;
        let highlightedCount = 0;

        console.log(`[NEW-MSG-NOTIFIER] Starting chunked highlight for ${entries.length} customers...`);

        // Process in chunks using requestAnimationFrame
        function processChunk() {
            const chunkEnd = Math.min(index + CHUNK_SIZE, entries.length);

            for (; index < chunkEnd; index++) {
                const counts = entries[index];
                const { psid, pageId } = counts;

                // Find rows with matching PSID (and optionally pageId for more precision)
                let rows;
                if (pageId) {
                    rows = document.querySelectorAll(`tr[data-psid="${psid}"][data-page-id="${pageId}"]`);
                    // Fallback to psid-only if no match with pageId
                    if (rows.length === 0) {
                        rows = document.querySelectorAll(`tr[data-psid="${psid}"]`);
                    }
                } else {
                    rows = document.querySelectorAll(`tr[data-psid="${psid}"]`);
                }

                rows.forEach(row => {
                    highlightedCount++;

                    // Add badge to messages column
                    if (counts.messages > 0) {
                        const msgCell = row.querySelector('td[data-column="messages"]');
                        if (msgCell) {
                            addNewBadge(msgCell, counts.messages);
                        }
                    }

                    // Add badge to comments column
                    if (counts.comments > 0) {
                        const cmtCell = row.querySelector('td[data-column="comments"]');
                        if (cmtCell) {
                            addNewBadge(cmtCell, counts.comments);
                        }
                    }

                    // Highlight row (permanent until user replies)
                    row.classList.add('pending-customer-row');
                });
            }

            // Continue with next chunk or finish
            if (index < entries.length) {
                requestAnimationFrame(processChunk);
            } else {
                console.log(`[NEW-MSG-NOTIFIER] Highlighted ${highlightedCount} rows (chunked)`);
            }
        }

        // Start processing
        requestAnimationFrame(processChunk);
    }

    /**
     * Set badge content in cell (replaces cell content)
     * Used for simplified message/comment columns
     */
    function addNewBadge(cell, count) {
        // Skip if badge already exists with same count
        const existingBadge = cell.querySelector('.new-msg-badge');
        if (existingBadge && existingBadge.dataset.count === String(count)) return;

        // SET innerHTML instead of appending (cells now only have "-" placeholder)
        cell.innerHTML = `<span class="new-msg-badge" data-count="${count}" style="
            display: inline-block;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 9999px;
            animation: pulse 2s infinite;
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
        ">${count} MỚI</span>`;

        // Add pulse animation style (only once)
        if (!document.getElementById('new-msg-badge-style')) {
            const style = document.createElement('style');
            style.id = 'new-msg-badge-style';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.85; transform: scale(1.02); }
                }
                .pending-customer-row {
                    background: linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, transparent 50%) !important;
                }
                .pending-customer-row:hover {
                    background: linear-gradient(90deg, rgba(239, 68, 68, 0.12) 0%, rgba(249, 250, 251, 1) 50%) !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Cache pending customers để re-apply sau khi table render
    let cachedPendingCustomers = [];

    /**
     * Wait for table rows to exist
     */
    function waitForTableRows(maxWait = 10000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                const rows = document.querySelectorAll('tr[data-psid]');
                if (rows.length > 0) {
                    resolve(true);
                } else if (Date.now() - startTime > maxWait) {
                    resolve(false);
                } else {
                    setTimeout(check, 500);
                }
            };
            check();
        });
    }

    /**
     * Re-apply highlights (called after table re-renders)
     */
    function reapplyHighlights() {
        if (cachedPendingCustomers.length > 0) {
            console.log('[NEW-MSG-NOTIFIER] Re-applying highlights for', cachedPendingCustomers.length, 'pending customers');
            highlightNewMessagesInTable(cachedPendingCustomers.map(c => ({
                psid: c.psid,
                page_id: c.page_id,
                type: c.type,
                message_count: c.message_count
            })));
        }
    }

    /**
     * Main function - Check for new messages on page load
     * Sử dụng pending_customers API (persist qua tắt máy/đổi máy)
     */
    async function checkNewMessages() {
        try {
            console.log('[NEW-MSG-NOTIFIER] Checking pending customers from server...');

            // Fetch pending customers từ server (thay vì timestamp-based)
            const pendingCustomers = await fetchPendingCustomers();
            cachedPendingCustomers = pendingCustomers || [];

            if (pendingCustomers && pendingCustomers.length > 0) {
                console.log(`[NEW-MSG-NOTIFIER] Found ${pendingCustomers.length} pending customers`);

                // Count messages vs comments
                const messages = pendingCustomers.filter(c => c.type === 'INBOX').length;
                const comments = pendingCustomers.filter(c => c.type === 'COMMENT').length;

                // Show notification
                showNotification({
                    total: pendingCustomers.length,
                    messages: messages,
                    comments: comments,
                    uniqueCustomers: pendingCustomers.length
                });

                // Wait for table rows to exist before highlighting
                const tableReady = await waitForTableRows();
                if (tableReady) {
                    highlightNewMessagesInTable(pendingCustomers.map(c => ({
                        psid: c.psid,
                        page_id: c.page_id,
                        type: c.type,
                        message_count: c.message_count
                    })));
                } else {
                    console.warn('[NEW-MSG-NOTIFIER] Table rows not found, will retry on render');
                }
            } else {
                console.log('[NEW-MSG-NOTIFIER] No pending customers');
            }

            // Save current timestamp for reference
            saveCurrentTimestamp();

        } catch (error) {
            console.error('[NEW-MSG-NOTIFIER] Error checking new messages:', error);
        }
    }

    /**
     * Initialize on page load
     */
    function init() {
        // Wait for page to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Delay check by 2 seconds to let other things load first
                setTimeout(checkNewMessages, 2000);
            });
        } else {
            setTimeout(checkNewMessages, 2000);
        }

        // Also check when user comes back to tab (visibility change)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Check if it's been more than 1 minute since last check
                const lastCheck = getLastSeenTimestamp();
                if (Date.now() - lastCheck > 60000) {
                    checkNewMessages();
                }
            }
        });
    }

    // Export for external use
    window.newMessagesNotifier = {
        check: checkNewMessages,
        getLastSeen: getLastSeenTimestamp,
        saveTimestamp: saveCurrentTimestamp,
        fetchPending: fetchPendingCustomers,
        markReplied: markRepliedOnServer,
        highlight: highlightNewMessagesInTable,
        reapply: reapplyHighlights,
        getCached: () => cachedPendingCustomers,
        showModal: showPendingCustomersModal
    };

    // Auto-initialize
    init();

    console.log('[NEW-MSG-NOTIFIER] Module loaded');

})();
