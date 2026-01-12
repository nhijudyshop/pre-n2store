// =====================================================
// NEW MESSAGES NOTIFIER
// Thông báo tin nhắn/bình luận mới khi user load trang
// =====================================================

(function () {
    'use strict';

    const STORAGE_KEY = 'last_realtime_check';
    const SERVER_URL = 'https://n2store-fallback.onrender.com';
    // Fallback to Cloudflare Worker if needed
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
     * Fetch new messages from server
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

        // Show toast notification
        if (window.notificationManager && window.notificationManager.success) {
            window.notificationManager.success(text, 8000);
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
     * Update table cells with "NEW" badge
     */
    function highlightNewMessagesInTable(items) {
        if (!items || items.length === 0) return;

        // Group by psid
        const psidMap = new Map();
        items.forEach(item => {
            if (item.psid) {
                if (!psidMap.has(item.psid)) {
                    psidMap.set(item.psid, { messages: 0, comments: 0 });
                }
                const entry = psidMap.get(item.psid);
                if (item.type === 'INBOX') {
                    entry.messages++;
                } else {
                    entry.comments++;
                }
            }
        });

        // Find rows in table and add badge
        psidMap.forEach((counts, psid) => {
            // Find rows with matching PSID
            const rows = document.querySelectorAll(`tr[data-psid="${psid}"]`);
            rows.forEach(row => {
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

                // Highlight row
                row.classList.add('product-row-highlight');
                setTimeout(() => row.classList.remove('product-row-highlight'), 3000);
            });
        });
    }

    /**
     * Add "NEW" badge to cell
     */
    function addNewBadge(cell, count) {
        // Check if badge already exists
        if (cell.querySelector('.new-msg-badge')) return;

        const badge = document.createElement('span');
        badge.className = 'new-msg-badge';
        badge.innerHTML = `<span style="
            background: #ef4444;
            color: white;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 9999px;
            margin-left: 6px;
            animation: pulse 1s infinite;
        ">${count} MỚI</span>`;

        cell.appendChild(badge);

        // Add pulse animation
        if (!document.getElementById('new-msg-badge-style')) {
            const style = document.createElement('style');
            style.id = 'new-msg-badge-style';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Main function - Check for new messages on page load
     */
    async function checkNewMessages() {
        try {
            const since = getLastSeenTimestamp();
            console.log(`[NEW-MSG-NOTIFIER] Checking messages since ${new Date(since).toISOString()}`);

            const summary = await fetchNewMessages(since);

            if (summary && summary.success && summary.total > 0) {
                showNotification(summary);

                // Optionally fetch full details to highlight rows
                // (only if we have a small number of items)
                if (summary.total <= 50) {
                    try {
                        const detailUrl = `${SERVER_URL}/api/realtime/new-messages?since=${since}&limit=50`;
                        const detailResponse = await fetch(detailUrl);
                        if (detailResponse.ok) {
                            const details = await detailResponse.json();
                            if (details.success) {
                                const allItems = [
                                    ...(details.messages?.items || []),
                                    ...(details.comments?.items || [])
                                ];
                                highlightNewMessagesInTable(allItems);
                            }
                        }
                    } catch (e) {
                        console.warn('[NEW-MSG-NOTIFIER] Could not fetch details for highlighting');
                    }
                }
            } else {
                console.log('[NEW-MSG-NOTIFIER] No new messages');
            }

            // Save current timestamp for next check
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
        saveTimestamp: saveCurrentTimestamp
    };

    // Auto-initialize
    init();

    console.log('[NEW-MSG-NOTIFIER] Module loaded');

})();
