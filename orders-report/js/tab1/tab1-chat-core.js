// =====================================================
// tab1-chat-core.js - Chat Modal Core Module
// Chat modal open/close, state management, initialization,
// page/conversation selectors, mark read, avatar zoom,
// data transfer, infinite scroll, conversation type toggle
// =====================================================
// Dependencies: Loaded first. Uses globals from tab1-core.js (allData, currentChatOrderId, etc.)
// Exposes: window.openChatModal, window.closeChatModal, window.currentChatChannelId, etc.

console.log('[Tab1-Chat-Core] Loading...');

// Anti-spam: Track fetched channelIds and debounce requests
const fetchedChannelIdsCache = new Set();
let fetchConversationsDebounceTimer = null;
let isFetchingConversationsFromOverview = false;

function handleFetchConversationsRequest(orders) {
    console.log('[CONVERSATIONS] Nhận request fetch conversations từ tab-overview');
    console.log('[CONVERSATIONS] Orders count:', orders.length);

    if (orders.length === 0 || !window.chatDataManager) {
        console.log('[CONVERSATIONS] Skipping - no orders or chatDataManager not ready');
        return;
    }

    // Prevent concurrent fetches
    if (isFetchingConversationsFromOverview) {
        console.log('[CONVERSATIONS] Skipping - already fetching');
        return;
    }

    // Parse channelIds from orders
    const allChannelIds = [...new Set(
        orders
            .map(order => {
                const postId = order.Facebook_PostId;
                if (!postId) return null;
                // Parse channelId from Facebook_PostId (format: "pageId_postId")
                const parts = postId.split('_');
                return parts.length > 0 ? parts[0] : null;
            })
            .filter(id => id)
    )];

    // Filter out already fetched channelIds (anti-spam)
    const newChannelIds = allChannelIds.filter(id => !fetchedChannelIdsCache.has(id));

    console.log('[CONVERSATIONS] All channel IDs:', allChannelIds.length);
    console.log('[CONVERSATIONS] New channel IDs (not cached):', newChannelIds.length);
    console.log('[CONVERSATIONS] Cached channel IDs:', fetchedChannelIdsCache.size);

    if (newChannelIds.length === 0) {
        console.log('[CONVERSATIONS] All channels already fetched, skipping API call');
        // Still re-render in case data changed
        performTableSearch();
        return;
    }

    // Debounce: Wait 500ms before fetching to avoid rapid consecutive calls
    if (fetchConversationsDebounceTimer) {
        clearTimeout(fetchConversationsDebounceTimer);
    }

    fetchConversationsDebounceTimer = setTimeout(async () => {
        isFetchingConversationsFromOverview = true;

        try {
            console.log('[CONVERSATIONS] Fetching conversations for', newChannelIds.length, 'channels...');

            // Fetch conversations
            await window.chatDataManager.fetchConversations(true, newChannelIds);

            // Add to cache after successful fetch
            newChannelIds.forEach(id => fetchedChannelIdsCache.add(id));

            console.log('[CONVERSATIONS] Conversations fetched for Firebase orders');
            console.log('[CONVERSATIONS] Cache size now:', fetchedChannelIdsCache.size);

            // Re-render table to show messages
            performTableSearch();
        } catch (err) {
            console.error('[CONVERSATIONS] Error fetching conversations:', err);
        } finally {
            isFetchingConversationsFromOverview = false;
        }
    }, 500); // 500ms debounce
}

function sendOrdersDataToTab3() {
    // Prepare orders data with STT (SessionIndex)
    const ordersDataToSend = allData.map((order, index) => ({
        stt: order.SessionIndex || (index + 1).toString(), // Use SessionIndex as STT
        orderId: order.Id,
        orderCode: order.Code,
        customerName: order.PartnerName || order.Name,
        phone: order.PartnerPhone || order.Telephone,
        address: order.PartnerAddress || order.Address,
        totalAmount: order.TotalAmount || order.AmountTotal || 0,
        quantity: order.TotalQuantity || order.Details?.reduce((sum, d) => sum + (d.Quantity || d.ProductUOMQty || 0), 0) || 0,
        note: order.Note,
        state: order.Status || order.State,
        dateOrder: order.DateCreated || order.DateOrder,
        Tags: order.Tags, // Tags JSON array for overview aggregation
        LiveCampaignName: order.LiveCampaignName, // Campaign name for overview filtering
        products: order.Details?.map(d => ({
            id: d.ProductId,
            name: d.ProductName,
            nameGet: d.ProductNameGet,
            code: d.ProductCode,
            quantity: d.Quantity || d.ProductUOMQty || 0,
            price: d.Price || 0,
            imageUrl: d.ImageUrl,
            uom: d.UOMName
        })) || []
    }));

    // NOTE: Removed localStorage.setItem to prevent quota exceeded with 1000+ orders
    // Tab3 receives data via postMessage instead

    // Send to product assignment tab via parent window forwarding
    // Updated to avoid "SecurityError: Blocked a frame with origin 'null'"
    if (window.parent) {
        window.parent.postMessage({
            type: 'ORDERS_DATA_RESPONSE_TAB3', // Specific type for Tab3 only
            orders: ordersDataToSend
        }, '*');
        console.log(`Sent ${ordersDataToSend.length} orders to parent for forwarding to tab 3`);
    }
}

function sendOrdersDataToOverview() {
    // Prepare orders data with STT (SessionIndex) - use ALL data (not filtered)
    const ordersDataToSend = allData.map((order, index) => ({
        stt: order.SessionIndex || (index + 1).toString(), // Use SessionIndex as STT
        orderId: order.Id,
        orderCode: order.Code,
        customerName: order.PartnerName || order.Name,
        phone: order.PartnerPhone || order.Telephone,
        address: order.PartnerAddress || order.Address,
        totalAmount: order.TotalAmount || order.AmountTotal || 0,
        quantity: order.TotalQuantity || order.Details?.reduce((sum, d) => sum + (d.Quantity || d.ProductUOMQty || 0), 0) || 0,
        note: order.Note,
        state: order.Status || order.State,
        dateOrder: order.DateCreated || order.DateOrder,
        Tags: order.Tags, // Tags JSON array for overview aggregation
        liveCampaignName: order.LiveCampaignName, // Campaign name for overview filtering
        products: order.Details?.map(d => ({
            id: d.ProductId,
            name: d.ProductName,
            nameGet: d.ProductNameGet,
            code: d.ProductCode,
            quantity: d.Quantity || d.ProductUOMQty || 0,
            price: d.Price || 0,
            imageUrl: d.ImageUrl,
            uom: d.UOMName
        })) || []
    }));

    // Send to overview tab via parent window forwarding
    if (window.parent) {
        // FIXED: Get campaign name from multiple sources for reliability
        let campaignName = null;

        // 1. Primary source: window.campaignManager.activeCampaign (most reliable)
        if (window.campaignManager && window.campaignManager.activeCampaign && window.campaignManager.activeCampaign.name) {
            campaignName = window.campaignManager.activeCampaign.name;
            console.log('[OVERVIEW] Campaign name from campaignManager:', campaignName);
        }

        // 2. Fallback: DOM element activeCampaignLabel
        if (!campaignName) {
            const activeCampaignLabel = document.getElementById('activeCampaignLabel');
            if (activeCampaignLabel) {
                // Extract text content, remove icon HTML
                const labelText = activeCampaignLabel.textContent.trim();
                // Check if it's still loading or empty
                if (labelText && labelText !== 'Đang tải...' && labelText !== '') {
                    campaignName = labelText;
                    console.log('[OVERVIEW] Campaign name from DOM label:', campaignName);
                }
            }
        }

        // 3. Last fallback: Get from first order's LiveCampaignName
        if (!campaignName && allData.length > 0 && allData[0].LiveCampaignName) {
            campaignName = allData[0].LiveCampaignName;
            console.log('[OVERVIEW] Campaign name from first order:', campaignName);
        }

        console.log('[OVERVIEW] Final campaign name to send:', campaignName);

        window.parent.postMessage({
            type: 'ORDERS_DATA_RESPONSE_OVERVIEW', // Specific type for Overview only
            orders: ordersDataToSend,
            tableName: campaignName, // Campaign name (null if not selected)
            timestamp: Date.now()
        }, '*');
        console.log(`[OVERVIEW] Sent ${ordersDataToSend.length} orders with campaign "${campaignName}" to overview tab`);
    }
}

// =====================================================
// CHAT MODAL FUNCTIONS
// =====================================================
// Make these global so they can be accessed from other modules (e.g., chat-modal-products.js)
window.currentChatChannelId = null;
window.currentChatPSID = null;
window.currentRealFacebookPSID = null;  // Real Facebook PSID (from_psid) for Graph API
window.currentConversationId = null;  // Lưu conversation ID cho reply

// Shared state variables - exposed as window.* for cross-file access (browser script-tag architecture)
window.currentChatType = null;
window.currentChatCursor = null;
window.allChatMessages = []; // Make global for WebSocket access
window.skipWebhookUpdate = false; // Flag to skip webhook updates right after sending message
window.isSendingMessage = false; // Flag to prevent double message sending
window.allChatComments = []; // Make global for WebSocket access
window.isLoadingMoreMessages = false;
window.currentOrder = null;  // Lưu order hiện tại để gửi reply

// ============================================================================
// MARK READ/UNREAD STATE MANAGEMENT
// ============================================================================

/**
 * Global state for current conversation read status
 */
window.currentConversationReadState = {
    isRead: false,           // Current read status
    conversationId: null,    // Conversation ID
    pageId: null,            // Page ID
    lastMarkedAt: null,      // Last marked timestamp
    chatType: null           // 'message' or 'comment'
};

/**
 * Timer for auto mark as read debounce
 */
let markReadTimer = null;

/**
 * Update read badge UI
 * @param {boolean} isRead - Read status
 */
function updateReadBadge(isRead) {
    const badge = document.getElementById('chatReadBadge');
    if (!badge) return;

    badge.style.display = 'inline-flex'; // Show badge

    if (isRead) {
        badge.innerHTML = '<i class="fas fa-check-circle"></i> Đã đọc';
        badge.style.color = '#10b981'; // Green
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    } else {
        badge.innerHTML = '<i class="fas fa-circle"></i> Chưa đọc';
        badge.style.color = '#f59e0b'; // Orange
        badge.style.background = 'rgba(245, 158, 11, 0.2)';
        badge.style.border = '1px solid rgba(245, 158, 11, 0.3)';
    }
}

/**
 * Update mark read/unread toggle button UI
 * @param {boolean} isRead - Read status
 */
function updateMarkButton(isRead) {
    const btn = document.getElementById('btnMarkReadToggle');
    if (!btn) return;

    btn.style.display = 'flex'; // Show button

    if (isRead) {
        btn.innerHTML = '<i class="fas fa-envelope-open"></i>';
        btn.style.background = 'rgba(245, 158, 11, 0.8)'; // Orange
        btn.title = 'Đánh dấu chưa đọc';
    } else {
        btn.innerHTML = '<i class="fas fa-envelope"></i>';
        btn.style.background = 'rgba(16, 185, 129, 0.8)'; // Green
        btn.title = 'Đánh dấu đã đọc';
    }
}

/**
 * Auto mark conversation as read with debounce
 * @param {number} delayMs - Delay in milliseconds before marking
 */
function autoMarkAsRead(delayMs = 0) {
    clearTimeout(markReadTimer);

    markReadTimer = setTimeout(async () => {
        const { pageId, conversationId, isRead, chatType } = window.currentConversationReadState;

        // Skip if already marked as read
        if (isRead) {
            console.log('[MARK-READ] Already marked as read, skipping');
            return;
        }

        // Skip for comments (if comment read status not supported)
        if (chatType === 'comment') {
            console.log('[MARK-READ] Skipping auto-mark for comment type');
            return;
        }

        if (!pageId || !conversationId) {
            console.warn('[MARK-READ] Missing pageId or conversationId');
            return;
        }

        console.log('[MARK-READ] Auto marking as read...', conversationId);

        const success = await window.pancakeDataManager.markConversationAsRead(pageId, conversationId);

        if (success) {
            window.currentConversationReadState.isRead = true;
            window.currentConversationReadState.lastMarkedAt = Date.now();
            updateReadBadge(true);
            updateMarkButton(true);

            // Update conversation data locally and refresh table UI
            if (window.pancakeDataManager) {
                window.pancakeDataManager.updateConversationReadStatus(conversationId, true);

                // Re-render table to show updated badge/count
                if (typeof renderTable === 'function') {
                    console.log('[MARK-READ] Auto-refresh table UI...');
                    renderTable();
                }
            }
        }
    }, delayMs);
}

/**
 * Toggle conversation read/unread state manually
 */
window.toggleConversationReadState = async function () {
    const { pageId, conversationId, isRead } = window.currentConversationReadState;

    if (!pageId || !conversationId) {
        alert('Không tìm thấy thông tin cuộc hội thoại');
        return;
    }

    const btn = document.getElementById('btnMarkReadToggle');
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        let success;
        if (isRead) {
            // Mark as unread
            console.log('[MARK-READ] Toggling to unread');
            success = await window.pancakeDataManager.markConversationAsUnread(pageId, conversationId);
        } else {
            // Mark as read
            console.log('[MARK-READ] Toggling to read');
            success = await window.pancakeDataManager.markConversationAsRead(pageId, conversationId);
        }

        if (success) {
            window.currentConversationReadState.isRead = !isRead;
            window.currentConversationReadState.lastMarkedAt = Date.now();
            updateReadBadge(!isRead);
            updateMarkButton(!isRead);

            // Update conversation data locally and refresh table UI
            if (window.pancakeDataManager) {
                window.pancakeDataManager.updateConversationReadStatus(conversationId, !isRead);

                // Re-render table to show updated badge/count
                if (typeof renderTable === 'function') {
                    console.log('[MARK-READ] Refreshing table UI...');
                    renderTable();
                }
            }
        } else {
            alert('Không thể thay đổi trạng thái đọc');
        }
    } catch (error) {
        console.error('[MARK-READ] Toggle failed:', error);
        alert('Lỗi khi thay đổi trạng thái đọc');
    } finally {
        btn.disabled = false;
        updateMarkButton(window.currentConversationReadState.isRead);
    }
};

// ============================================================================
// END MARK READ/UNREAD STATE MANAGEMENT
// ============================================================================
window.currentParentCommentId = null;  // Lưu parent comment ID
window.currentPostId = null; // Lưu post ID của comment đang reply
window.availableChatPages = []; // Cache pages for selector
window.currentSendPageId = null; // Page ID selected for SENDING messages (independent from view)
window.allMatchingConversations = []; // Store all matching conversations for selector
window.messageReplyType = 'reply_inbox'; // 'reply_inbox' or 'private_replies' for message modal

// =====================================================
// MESSAGE REPLY TYPE TOGGLE FUNCTIONS
// =====================================================

/**
 * Set the message reply type (toggle between reply_inbox and private_replies)
 * @param {string} type - 'reply_inbox' or 'private_replies'
 */
window.setMessageReplyType = function (type) {
    messageReplyType = type;

    const btnInbox = document.getElementById('btnMsgReplyInbox');
    const btnPrivate = document.getElementById('btnMsgPrivateReply');
    const hintText = document.getElementById('msgReplyTypeHint');

    if (type === 'reply_inbox') {
        // Messenger selected
        if (btnInbox) {
            btnInbox.style.borderColor = '#3b82f6';
            btnInbox.style.background = '#eff6ff';
            btnInbox.style.color = '#1d4ed8';
        }
        if (btnPrivate) {
            btnPrivate.style.borderColor = '#e5e7eb';
            btnPrivate.style.background = 'white';
            btnPrivate.style.color = '#6b7280';
        }
        if (hintText) {
            hintText.textContent = 'Gửi tin nhắn qua Messenger';
        }
    } else {
        // Private reply from comment selected
        if (btnInbox) {
            btnInbox.style.borderColor = '#e5e7eb';
            btnInbox.style.background = 'white';
            btnInbox.style.color = '#6b7280';
        }
        if (btnPrivate) {
            btnPrivate.style.borderColor = '#3b82f6';
            btnPrivate.style.background = '#eff6ff';
            btnPrivate.style.color = '#1d4ed8';
        }
        if (hintText) {
            hintText.textContent = 'Gửi tin nhắn riêng từ comment đặt hàng';
        }
    }

    console.log('[MESSAGE] Reply type set to:', type);
};

/**
 * Show or hide message reply type toggle based on comment availability
 */
window.updateMessageReplyTypeToggle = function () {
    const toggle = document.getElementById('messageReplyTypeToggle');
    if (!toggle) return;

    // Only show toggle for message type and when order has comment
    const hasComment = window.purchaseCommentId && window.purchaseFacebookPostId;
    const isMessageType = currentChatType === 'message';

    if (isMessageType && hasComment) {
        toggle.style.display = 'block';
        console.log('[MESSAGE] Reply type toggle shown - order has comment:', window.purchaseCommentId);
    } else {
        toggle.style.display = 'none';
        // Reset to default when hidden
        messageReplyType = 'reply_inbox';
    }
};

// =====================================================
// CONVERSATION TYPE TOGGLE FUNCTIONS
// =====================================================

// Track current conversation type being viewed
window.currentConversationType = 'INBOX'; // 'INBOX' or 'COMMENT'

/**
 * Update conversation type toggle button states
 * @param {string} type - 'INBOX' or 'COMMENT'
 */
window.updateConversationTypeToggle = function (type) {
    const btnInbox = document.getElementById('btnViewInbox');
    const btnComment = document.getElementById('btnViewComment');

    if (!btnInbox || !btnComment) return;

    if (type === 'INBOX') {
        // INBOX selected
        btnInbox.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        btnInbox.style.background = 'rgba(255, 255, 255, 0.2)';
        btnInbox.style.color = 'white';

        btnComment.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        btnComment.style.background = 'transparent';
        btnComment.style.color = 'rgba(255, 255, 255, 0.7)';
    } else {
        // COMMENT selected
        btnInbox.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        btnInbox.style.background = 'transparent';
        btnInbox.style.color = 'rgba(255, 255, 255, 0.7)';

        btnComment.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        btnComment.style.background = 'rgba(255, 255, 255, 0.2)';
        btnComment.style.color = 'white';
    }

    currentConversationType = type;
    console.log('[CONV-TYPE] Conversation type set to:', type);
};

/**
 * Switch between INBOX and COMMENT conversation types
 * @param {string} type - 'INBOX' or 'COMMENT'
 */
window.switchConversationType = async function (type) {
    if (currentConversationType === type) {
        console.log('[CONV-TYPE] Already viewing', type);
        return;
    }

    console.log('[CONV-TYPE] Switching from', currentConversationType, 'to', type);

    // Show loading FIRST (before resetting state) to avoid brief "empty" flash
    const modalBody = document.getElementById('chatModalBody');
    const loadingText = type === 'COMMENT' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    // Cleanup realtime listeners to prevent them from rendering empty state during switch
    cleanupRealtimeMessages();

    // Update toggle button states
    window.updateConversationTypeToggle(type);

    // Update modal title
    const titleText = type === 'COMMENT' ? 'Bình luận' : 'Tin nhắn';
    const titleElement = document.getElementById('chatModalTitle');
    if (titleElement && currentOrder) {
        titleElement.textContent = `${titleText} với ${currentOrder.Name}`;
    }

    // Reset state
    window.allChatMessages = [];
    window.allChatComments = [];
    currentChatCursor = null;
    isLoadingMoreMessages = false;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Hide conversation selector
    window.hideConversationSelector();

    // Update input state based on conversation type
    const chatInput = document.getElementById('chatReplyInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const markReadBtn = document.getElementById('chatMarkReadBtn');

    if (type === 'COMMENT') {
        // Disable input for comments (only enable when replying to specific comment)
        if (chatInput) {
            chatInput.disabled = true;
            chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
            chatInput.style.background = '#f3f4f6';
            chatInput.style.cursor = 'not-allowed';
        }
        if (chatSendBtn) {
            chatSendBtn.disabled = true;
            chatSendBtn.style.opacity = '0.5';
            chatSendBtn.style.cursor = 'not-allowed';
        }
        if (markReadBtn) {
            markReadBtn.style.display = 'none';
        }
    } else {
        // Enable input for INBOX messages
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
            chatInput.style.background = '#f9fafb';
            chatInput.style.cursor = 'text';
        }
        if (chatSendBtn) {
            chatSendBtn.disabled = false;
            chatSendBtn.style.opacity = '1';
            chatSendBtn.style.cursor = 'pointer';
        }
        if (markReadBtn) {
            markReadBtn.style.display = 'none'; // Keep hidden for now
        }

        // Auto-focus chat input when switching to INBOX (message mode)
        setTimeout(() => {
            if (chatInput) chatInput.focus();
        }, 150);
    }

    // Update current chat type for other functions to use
    currentChatType = type === 'COMMENT' ? 'comment' : 'message';

    // Fetch messages or comments based on type
    // NOTE: Conversations are already fetched when modal opened, just reuse cached IDs
    try {
        if (type === 'COMMENT') {
            // Use cached COMMENT conversation ID (already fetched when modal opened)
            const commentConvId = window.currentCommentConversationId;

            if (!commentConvId) {
                console.warn('[CONV-TYPE] No COMMENT conversation ID found');
                modalBody.innerHTML = `
                    <div class="chat-error">
                        <i class="fas fa-info-circle"></i>
                        <p>Không tìm thấy bình luận cho khách hàng này</p>
                    </div>`;
                return;
            }

            // Use the cached conversation ID
            window.currentConversationId = commentConvId;
            console.log('[CONV-TYPE] Using cached COMMENT conversationId:', window.currentConversationId);

            // Populate conversation selector if we have cached comment conversations
            if (window.cachedCommentConversations && window.cachedCommentConversations.length > 0) {
                window.populateConversationSelector(window.cachedCommentConversations, commentConvId);
            }

            // Fetch messages for COMMENT conversation
            console.log('[CONV-TYPE] Fetching messages for COMMENT conversation...');

            const messagesResponse = await window.pancakeDataManager.fetchMessagesForConversation(
                window.currentChatChannelId,
                window.currentConversationId,
                null,
                window.currentCustomerUUID
            );

            // Store as comments (they are actually messages from COMMENT conversation)
            window.allChatComments = messagesResponse.messages || [];
            currentChatCursor = messagesResponse.after;

            console.log('[CONV-TYPE] Loaded', window.allChatComments.length, 'comments/messages');

            // Render comments
            renderComments(window.allChatComments, true);

            // Setup infinite scroll
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();

        } else {
            // Use cached INBOX conversation ID (already fetched when modal opened)
            const inboxConvId = window.currentInboxConversationId;

            if (inboxConvId) {
                window.currentConversationId = inboxConvId;
                console.log('[CONV-TYPE] Using cached INBOX conversationId:', window.currentConversationId);
            } else {
                // Fallback if not cached
                window.currentConversationId = `${window.currentChatChannelId}_${window.currentChatPSID}`;
                console.log('[CONV-TYPE] Using fallback conversationId:', window.currentConversationId);
            }

            // Fetch messages for INBOX conversation
            console.log('[CONV-TYPE] Fetching messages for INBOX conversation...');

            const response = await window.pancakeDataManager.fetchMessagesForConversation(
                window.currentChatChannelId,
                window.currentConversationId,
                null,
                window.currentCustomerUUID
            );

            window.allChatMessages = response.messages || [];
            currentChatCursor = response.after;

            // Update conversationId from response if available
            if (response.conversationId) {
                window.currentConversationId = response.conversationId;
                console.log('[CONV-TYPE] Updated conversationId from response:', window.currentConversationId);
            }

            console.log('[CONV-TYPE] Loaded', window.allChatMessages.length, 'messages');
            renderChatMessages(window.allChatMessages, true);

            // Setup infinite scroll and realtime
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();
            setupRealtimeMessages();
        }
    } catch (error) {
        console.error('[CONV-TYPE] Error fetching data:', error);
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Lỗi khi tải ${type === 'COMMENT' ? 'bình luận' : 'tin nhắn'}</p>
                <p style="font-size: 12px; color: #6b7280;">${error.message}</p>
            </div>`;
    }
};

// =====================================================
// PAGE SELECTOR FUNCTIONS
// =====================================================

/**
 * Populate SEND page selector dropdown (for sending messages)
 * @param {string} currentPageId - Current page ID to pre-select
 */
window.populateSendPageSelector = async function (currentPageId) {
    console.log('[SEND-PAGE] Populating send page selector, current:', currentPageId);

    const select = document.getElementById('chatSendPageSelect');
    if (!select) {
        console.warn('[SEND-PAGE] Select element not found');
        return;
    }

    // Show loading state
    select.innerHTML = '<option value="">Đang tải...</option>';
    select.disabled = true;

    try {
        // Use cached pages if available
        let pages = window.availableChatPages;
        if (!pages || pages.length === 0) {
            // Fetch pages if not cached
            if (window.pancakeDataManager) {
                await window.pancakeDataManager.fetchPages();
                pages = await window.pancakeDataManager.fetchPagesWithUnreadCount();
                window.availableChatPages = pages;
            }
        }

        if (!pages || pages.length === 0) {
            select.innerHTML = '<option value="">Không có page</option>';
            select.disabled = true;
            return;
        }

        // Build options
        let optionsHtml = '';
        pages.forEach(page => {
            const isSelected = page.page_id === currentPageId ? 'selected' : '';
            optionsHtml += `<option value="${page.page_id}" ${isSelected}>${page.page_name}</option>`;
        });

        select.innerHTML = optionsHtml;
        select.disabled = false;

        // Set current send page
        window.currentSendPageId = currentPageId;

        // If current page not in list, add it as first option
        if (currentPageId && !pages.find(p => p.page_id === currentPageId)) {
            const currentOption = document.createElement('option');
            currentOption.value = currentPageId;
            currentOption.textContent = `Page ${currentPageId}`;
            currentOption.selected = true;
            select.insertBefore(currentOption, select.firstChild);
        }

        console.log('[SEND-PAGE] Populated with', pages.length, 'pages, selected:', currentPageId);

    } catch (error) {
        console.error('[SEND-PAGE] Error:', error);
        select.innerHTML = '<option value="">Lỗi tải</option>';
        select.disabled = true;
    }
};

/**
 * Handle SEND page selection change
 * @param {string} pageId - Selected page ID for sending
 */
window.onSendPageChanged = function (pageId) {
    console.log('[SEND-PAGE] Send page changed to:', pageId);

    if (!pageId) return;

    // Update send page ID (independent from view page)
    window.currentSendPageId = pageId;

    // Show notification
    const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
    const pageName = selectedPage?.page_name || pageId;

    if (window.notificationManager) {
        window.notificationManager.show(`Sẽ gửi tin nhắn từ page: ${pageName}`, 'info', 2000);
    }

    console.log('[SEND-PAGE] Updated currentSendPageId to:', pageId);
};

/**
 * Populate VIEW page selector dropdown with pages from Pancake API
 * @param {string} currentPageId - Current page ID to pre-select
 */
window.populateChatPageSelector = async function (currentPageId) {
    console.log('[PAGE-SELECTOR] Populating page selector, current:', currentPageId);

    const select = document.getElementById('chatPageSelect');
    if (!select) {
        console.warn('[PAGE-SELECTOR] Select element not found');
        return;
    }

    // Show loading state
    select.innerHTML = '<option value="">Đang tải pages...</option>';
    select.disabled = true;

    try {
        // Ensure pages are fetched first (for page names)
        if (window.pancakeDataManager) {
            await window.pancakeDataManager.fetchPages();
        }

        // Fetch pages with unread count
        const pagesWithUnread = window.pancakeDataManager ?
            await window.pancakeDataManager.fetchPagesWithUnreadCount() : [];

        if (pagesWithUnread.length === 0) {
            select.innerHTML = '<option value="">Không có page nào</option>';
            select.disabled = true;
            return;
        }

        // Cache pages
        window.availableChatPages = pagesWithUnread;

        // Build options
        let optionsHtml = '';
        pagesWithUnread.forEach(page => {
            const isSelected = page.page_id === currentPageId ? 'selected' : '';
            const unreadBadge = page.unread_conv_count > 0 ? ` (${page.unread_conv_count})` : '';
            optionsHtml += `<option value="${page.page_id}" ${isSelected}>${page.page_name}${unreadBadge}</option>`;
        });

        select.innerHTML = optionsHtml;
        select.disabled = false;

        // If current page not in list, add it as first option
        if (currentPageId && !pagesWithUnread.find(p => p.page_id === currentPageId)) {
            const currentOption = document.createElement('option');
            currentOption.value = currentPageId;
            currentOption.textContent = `Page ${currentPageId}`;
            currentOption.selected = true;
            select.insertBefore(currentOption, select.firstChild);
        }

        console.log('[PAGE-SELECTOR] Populated with', pagesWithUnread.length, 'pages');

    } catch (error) {
        console.error('[PAGE-SELECTOR] Error populating:', error);
        select.innerHTML = '<option value="">Lỗi tải pages</option>';
        select.disabled = true;
    }
};

/**
 * Handle page selection change
 * @param {string} pageId - Selected page ID
 */
window.onChatPageChanged = async function (pageId) {
    console.log('[PAGE-SELECTOR] Page changed to:', pageId);

    if (!pageId) return;

    // Update currentChatChannelId to use selected page
    const oldChannelId = window.currentChatChannelId;
    window.currentChatChannelId = pageId;

    // Also update the send page selector to match
    const sendPageSelect = document.getElementById('chatSendPageSelect');
    if (sendPageSelect && sendPageSelect.value !== pageId) {
        sendPageSelect.value = pageId;
        console.log('[PAGE-SELECTOR] Also updated chatSendPageSelect to:', pageId);
    }

    // Show notification
    const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
    const pageName = selectedPage?.page_name || pageId;

    if (window.notificationManager) {
        window.notificationManager.show(`Đang tải tin nhắn từ page: ${pageName}...`, 'info', 2000);
    }

    console.log('[PAGE-SELECTOR] Updated currentChatChannelId to:', pageId);

    // Reload messages/comments for the new page
    await window.reloadChatForSelectedPage(pageId);
};

/**
 * Reload messages/comments when page is changed
 * Uses search by customer name, then gets most recent conversation
 * @param {string} pageId - New page ID to load messages from
 */
window.reloadChatForSelectedPage = async function (pageId) {
    console.log('[PAGE-RELOAD] Reloading chat for page:', pageId);

    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Get customer name saved when modal opened
    const customerName = window.currentCustomerName;
    if (!customerName) {
        console.error('[PAGE-RELOAD] No customer name available');
        const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
        const pageName = selectedPage?.page_name || pageId;
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Không thể chuyển page</p>
                <p style="font-size: 12px; color: #9ca3af;">Thiếu thông tin tên khách hàng</p>
            </div>`;
        return;
    }

    // Show loading
    const loadingText = currentChatType === 'comment' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    try {
        // STEP 1: Search conversations by customer name on the new page
        console.log('[PAGE-RELOAD] Searching conversations for name:', customerName, 'on page:', pageId);

        const searchResult = await window.pancakeDataManager.searchConversations(customerName, [pageId]);

        // Filter to only this page's conversations
        let conversations = (searchResult.conversations || []).filter(conv => conv.page_id === pageId);

        if (conversations.length === 0) {
            console.warn('[PAGE-RELOAD] No conversations found for this page');
            const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
            const pageName = selectedPage?.page_name || pageId;
            modalBody.innerHTML = `
                <div class="chat-error">
                    <i class="fas fa-info-circle"></i>
                    <p>Không có cuộc hội thoại với page "${pageName}"</p>
                    <p style="font-size: 12px; color: #9ca3af;">Khách hàng chưa từng nhắn tin hoặc bình luận với page này</p>
                </div>`;
            return;
        }

        // Sort by updated_at to get most recent first
        conversations.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0).getTime();
            const dateB = new Date(b.updated_at || 0).getTime();
            return dateB - dateA;
        });

        console.log('[PAGE-RELOAD] Found', conversations.length, 'conversations, sorted by most recent');

        // Update customer fb_id and UUID from the most recent conversation
        const mostRecentConv = conversations[0];
        if (mostRecentConv.customers?.[0]) {
            window.currentCustomerFbId = mostRecentConv.customers[0].fb_id;
            window.currentCustomerUUID = mostRecentConv.customers[0].id;
            console.log('[PAGE-RELOAD] Updated fb_id:', window.currentCustomerFbId, 'UUID:', window.currentCustomerUUID);
        }

        // Use conversations as result for the rest of the function
        const result = { conversations, success: true };

        // STEP 2: Filter conversations by current chat type
        const targetType = currentChatType === 'comment' ? 'COMMENT' : 'INBOX';
        const filteredConversations = result.conversations.filter(conv => conv.type === targetType);

        // Also get the other type for quick switching
        const otherType = currentChatType === 'comment' ? 'INBOX' : 'COMMENT';
        const otherConversations = result.conversations.filter(conv => conv.type === otherType);

        console.log('[PAGE-RELOAD] Filtered:', targetType, '=', filteredConversations.length, ', ', otherType, '=', otherConversations.length);

        if (filteredConversations.length === 0) {
            const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
            const pageName = selectedPage?.page_name || pageId;
            const typeText = currentChatType === 'comment' ? 'bình luận' : 'tin nhắn';
            modalBody.innerHTML = `
                <div class="chat-error">
                    <i class="fas fa-info-circle"></i>
                    <p>Không có ${typeText} với page "${pageName}"</p>
                    <p style="font-size: 12px; color: #9ca3af;">Khách hàng chưa có ${typeText} với page này</p>
                </div>`;
            return;
        }

        // STEP 3: Update conversation IDs
        const targetConv = filteredConversations[0];
        window.currentConversationId = targetConv.id;

        if (currentChatType === 'comment') {
            window.currentCommentConversationId = targetConv.id;
            if (otherConversations.length > 0) {
                window.currentInboxConversationId = otherConversations[0].id;
            }
        } else {
            window.currentInboxConversationId = targetConv.id;
            if (otherConversations.length > 0) {
                window.currentCommentConversationId = otherConversations[0].id;
            }
        }

        console.log('[PAGE-RELOAD] Updated conversationIds:', {
            current: window.currentConversationId,
            inbox: window.currentInboxConversationId,
            comment: window.currentCommentConversationId,
            realPSID: window.currentRealFacebookPSID
        });

        // STEP 4: Fetch messages/comments with correct parameters
        if (currentChatType === 'comment') {
            const response = await window.pancakeDataManager.fetchMessagesForConversation(
                pageId,
                window.currentCommentConversationId,
                null,
                window.currentCustomerUUID
            );

            // Map to comments format
            window.allChatComments = (response.messages || []).map(msg => ({
                Id: msg.id,
                Message: msg.original_message || msg.message?.replace(/<[^>]*>/g, '') || '',
                CreatedTime: msg.inserted_at,
                IsOwner: msg.from?.id === pageId,
                PostId: msg.page_id ? `${msg.page_id}_${msg.parent_id?.split('_')[0] || ''}` : null,
                ParentId: msg.parent_id !== msg.id ? msg.parent_id : null,
                FacebookId: msg.id,
                Attachments: msg.attachments || [],
                Status: msg.seen ? 10 : 30,
                from: msg.from
            }));
            currentChatCursor = response.after;

            console.log(`[PAGE-RELOAD] Loaded ${window.allChatComments.length} comments`);

            // Update parent comment ID if available
            if (window.allChatComments.length > 0) {
                const rootComment = window.allChatComments.find(c => !c.ParentId) || window.allChatComments[0];
                if (rootComment && rootComment.Id) {
                    currentParentCommentId = getFacebookCommentId(rootComment);
                    console.log(`[PAGE-RELOAD] Updated parent comment ID: ${currentParentCommentId}`);
                }
            }

            renderComments(window.allChatComments, true);
        } else {
            const response = await window.pancakeDataManager.fetchMessagesForConversation(
                pageId,
                window.currentConversationId,
                null,
                window.currentCustomerUUID
            );
            window.allChatMessages = response.messages || [];
            currentChatCursor = response.after;

            console.log(`[PAGE-RELOAD] Loaded ${window.allChatMessages.length} messages`);

            renderChatMessages(window.allChatMessages, true);

            // Re-setup infinite scroll
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();
        }

        // STEP 5: Update conversation selector if multiple conversations
        if (filteredConversations.length > 1) {
            window.populateConversationSelector(filteredConversations, window.currentConversationId);
        } else {
            window.hideConversationSelector();
        }

        // STEP 6: Re-setup realtime messages for new page/conversation
        setupRealtimeMessages();

        // Show success notification
        const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
        const pageName = selectedPage?.page_name || pageId;
        if (window.notificationManager) {
            window.notificationManager.show(`Đã tải tin nhắn từ page: ${pageName}`, 'success', 2000);
        }

    } catch (error) {
        console.error('[PAGE-RELOAD] Error loading chat:', error);
        const errorText = currentChatType === 'comment' ? 'Lỗi khi tải bình luận' : 'Lỗi khi tải tin nhắn';
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${errorText}</p>
                <p style="font-size: 12px; color: #9ca3af;">${error.message}</p>
            </div>`;
    }
};

// =====================================================
// CONVERSATION SELECTOR FUNCTIONS
// =====================================================

/**
 * Format time ago for conversation selector
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} - Formatted time ago string
 */
function formatConversationTimeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
    return `${Math.floor(diff / 604800)} tuần trước`;
}

/**
 * Populate conversation selector with all matching conversations
 * Sort by most recent (updated_time) and select the most recent by default
 * @param {Array} conversations - Array of matching conversations
 * @param {string} selectedConvId - Optional conversation ID to pre-select
 */
window.populateConversationSelector = function (conversations, selectedConvId = null) {
    console.log('[CONV-SELECTOR] Populating with', conversations?.length || 0, 'conversations');

    const selectorContainer = document.getElementById('chatConversationSelector');
    const select = document.getElementById('chatConversationSelect');

    if (!selectorContainer || !select) {
        console.error('[CONV-SELECTOR] Selector elements not found');
        return;
    }

    // Hide selector if only 1 or no conversations
    if (!conversations || conversations.length <= 1) {
        selectorContainer.style.display = 'none';
        window.allMatchingConversations = conversations || [];
        return;
    }

    // Store all conversations globally
    window.allMatchingConversations = conversations;

    // Sort by updated_time descending (most recent first)
    const sortedConversations = [...conversations].sort((a, b) => {
        const timeA = a.updated_time || a.last_message_at || 0;
        const timeB = b.updated_time || b.last_message_at || 0;
        return timeB - timeA;
    });

    // Build options HTML
    let optionsHtml = '';
    sortedConversations.forEach((conv, index) => {
        const convId = conv.id || conv.conversation_id || `conv_${index}`;
        const convType = conv.type || 'INBOX';
        const typeIcon = convType === 'COMMENT' ? '💬' : '📨';
        const timeAgo = formatConversationTimeAgo(conv.updated_time || conv.last_message_at);
        const lastMessage = conv.last_message?.content || conv.snippet || '';
        const preview = lastMessage.length > 30 ? lastMessage.substring(0, 30) + '...' : lastMessage;
        const pageName = conv.page_name || '';

        // Label format: [Type Icon] [Time] - [Preview] (Page)
        let label = `${typeIcon} ${convType}`;
        if (timeAgo) label += ` • ${timeAgo}`;
        if (preview) label += ` - ${preview}`;
        if (pageName) label += ` (${pageName})`;

        const isSelected = selectedConvId ? (convId === selectedConvId) : (index === 0);
        optionsHtml += `<option value="${convId}" ${isSelected ? 'selected' : ''}>${label}</option>`;
    });

    select.innerHTML = optionsHtml;
    selectorContainer.style.display = 'block';

    console.log('[CONV-SELECTOR] Populated with', sortedConversations.length, 'conversations, default:', sortedConversations[0]?.id);

    // Return the most recent conversation (for initial load)
    return sortedConversations[0];
};

/**
 * Handle conversation selection change
 * @param {string} conversationId - Selected conversation ID
 */
window.onChatConversationChanged = async function (conversationId) {
    console.log('[CONV-SELECTOR] Conversation changed to:', conversationId);

    if (!conversationId) return;

    // Find the selected conversation
    const selectedConv = window.allMatchingConversations.find(c =>
        (c.id || c.conversation_id) === conversationId
    );

    if (!selectedConv) {
        console.error('[CONV-SELECTOR] Selected conversation not found:', conversationId);
        return;
    }

    // Show notification
    const convType = selectedConv.type || 'INBOX';
    if (window.notificationManager) {
        window.notificationManager.show(`Đang tải ${convType === 'COMMENT' ? 'bình luận' : 'tin nhắn'}...`, 'info', 2000);
    }

    // Reload chat for selected conversation
    await window.reloadChatForSelectedConversation(selectedConv);
};

/**
 * Reload messages/comments for selected conversation
 * @param {Object} conversation - Selected conversation object
 */
window.reloadChatForSelectedConversation = async function (conversation) {
    console.log('[CONV-RELOAD] Reloading chat for conversation:', conversation);

    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Get customer UUID from conversation
    const customerUuid = conversation.customers?.[0]?.id || conversation.customer_id;
    const pageId = conversation.page_id || window.currentChatChannelId;
    const convId = conversation.id || conversation.conversation_id;
    const convType = conversation.type || 'INBOX';

    if (!customerUuid) {
        console.error('[CONV-RELOAD] No customer UUID in conversation');
        return;
    }

    // Update global state
    window.currentCustomerUUID = customerUuid;
    window.currentConversationId = convId;
    if (pageId) window.currentChatChannelId = pageId;

    // Show loading
    const loadingText = convType === 'COMMENT' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    try {
        // Fetch inbox_preview to get correct conversationId
        const inboxPreview = await window.pancakeDataManager.fetchInboxPreview(pageId, customerUuid);

        if (inboxPreview.success) {
            // Use appropriate conversationId based on conversation type
            if (convType === 'COMMENT') {
                window.currentConversationId = inboxPreview.commentConversationId
                    || inboxPreview.inboxConversationId
                    || convId;
            } else {
                window.currentConversationId = inboxPreview.inboxConversationId
                    || convId;
            }
            window.currentInboxConversationId = inboxPreview.inboxConversationId;
            window.currentCommentConversationId = inboxPreview.commentConversationId;

            console.log('[CONV-RELOAD] Got conversationIds from inbox_preview:', {
                using: window.currentConversationId,
                inbox: window.currentInboxConversationId,
                comment: window.currentCommentConversationId
            });
        }

        // Fetch messages based on type
        if (convType === 'COMMENT' || currentChatType === 'comment') {
            const response = await window.chatDataManager.fetchComments(
                pageId,
                window.currentChatPSID,
                null,
                conversation.post_id,
                null
            );
            window.allChatComments = response.comments || [];
            currentChatCursor = response.after;

            console.log(`[CONV-RELOAD] Loaded ${window.allChatComments.length} comments`);

            // Update parent comment ID
            if (window.allChatComments.length > 0) {
                const rootComment = window.allChatComments.find(c => !c.ParentId) || window.allChatComments[0];
                if (rootComment && rootComment.Id) {
                    currentParentCommentId = getFacebookCommentId(rootComment);
                }
            }

            renderComments(window.allChatComments, true);
        } else {
            // Fetch messages for INBOX
            const response = await window.chatDataManager.fetchMessages(
                pageId,
                window.currentChatPSID,
                window.currentConversationId,
                customerUuid
            );
            window.allChatMessages = response.messages || [];
            currentChatCursor = response.after;

            // Update conversationId from response if available
            if (response.conversationId) {
                window.currentConversationId = response.conversationId;
            }

            console.log(`[CONV-RELOAD] Loaded ${window.allChatMessages.length} messages`);

            renderChatMessages(window.allChatMessages, true);
        }

        // Re-setup infinite scroll
        setupChatInfiniteScroll();
        setupNewMessageIndicatorListener();

        // Update input state based on conversation type
        const chatInput = document.getElementById('chatReplyInput');
        const chatSendBtn = document.getElementById('chatSendBtn');

        if (convType === 'COMMENT') {
            // Disable input for COMMENT - require selecting specific comment to reply
            if (chatInput) {
                chatInput.disabled = true;
                chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
                chatInput.style.background = '#f3f4f6';
                chatInput.style.cursor = 'not-allowed';
            }
            if (chatSendBtn) {
                chatSendBtn.disabled = true;
                chatSendBtn.style.opacity = '0.5';
                chatSendBtn.style.cursor = 'not-allowed';
            }
            // Update currentChatType to 'comment'
            currentChatType = 'comment';
        } else {
            // Enable input for INBOX
            if (chatInput) {
                chatInput.disabled = false;
                chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
                chatInput.style.background = '#f9fafb';
                chatInput.style.cursor = 'text';
            }
            if (chatSendBtn) {
                chatSendBtn.disabled = false;
                chatSendBtn.style.opacity = '1';
                chatSendBtn.style.cursor = 'pointer';
                chatSendBtn.title = 'Gửi tin nhắn';
            }
            // Update currentChatType to 'message'
            currentChatType = 'message';
        }

        // Show success notification
        const convTypeLabel = convType === 'COMMENT' ? 'bình luận' : 'tin nhắn';
        if (window.notificationManager) {
            window.notificationManager.show(`Đã tải ${convTypeLabel}`, 'success', 2000);
        }

    } catch (error) {
        console.error('[CONV-RELOAD] Error loading chat:', error);
        const errorText = convType === 'COMMENT' ? 'Lỗi khi tải bình luận' : 'Lỗi khi tải tin nhắn';
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${errorText}</p>
                <p style="font-size: 12px; color: #9ca3af;">${error.message}</p>
            </div>`;
    }
};

/**
 * Hide conversation selector
 */
window.hideConversationSelector = function () {
    const selectorContainer = document.getElementById('chatConversationSelector');
    if (selectorContainer) {
        selectorContainer.style.display = 'none';
    }
    window.allMatchingConversations = [];
};

// =====================================================
// AVATAR ZOOM MODAL
// =====================================================
window.openAvatarZoom = function (avatarUrl, senderName) {
    // Remove existing modal if any
    const existingModal = document.getElementById('avatar-zoom-modal');
    if (existingModal) existingModal.remove();

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'avatar-zoom-modal';
    modal.innerHTML = `
        <div class="avatar-zoom-overlay" onclick="closeAvatarZoom()" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            cursor: zoom-out;
            animation: fadeIn 0.2s ease-out;
        ">
            <div style="text-align: center;">
                <img src="${avatarUrl}"
                     alt="${senderName}"
                     style="
                        max-width: 90vw;
                        max-height: 80vh;
                        border-radius: 16px;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                        animation: zoomIn 0.3s ease-out;
                     "
                     onclick="event.stopPropagation();"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><circle cx=%22100%22 cy=%22100%22 r=%22100%22 fill=%22%23e5e7eb%22/><circle cx=%22100%22 cy=%2280%22 r=%2235%22 fill=%22%239ca3af%22/><ellipse cx=%22100%22 cy=%22160%22 rx=%2255%22 ry=%2240%22 fill=%22%239ca3af%22/></svg>'"
                />
                <p style="color: white; font-size: 16px; margin-top: 16px; font-weight: 500;">${senderName}</p>
                <button onclick="closeAvatarZoom()" style="
                    margin-top: 12px;
                    padding: 10px 24px;
                    background: white;
                    color: #111827;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    <i class="fas fa-times" style="margin-right: 6px;"></i>Đóng
                </button>
            </div>
        </div>
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    `;
    modal.appendChild(style);

    document.body.appendChild(modal);

    // Close on Escape key
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            closeAvatarZoom();
            document.removeEventListener('keydown', escHandler);
        }
    });
};

window.closeAvatarZoom = function () {
    const modal = document.getElementById('avatar-zoom-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
    }
};

// =====================================================
// OPEN / CLOSE CHAT MODAL
// =====================================================
// Note: openChatModal calls functions from other sub-modules:
//   - renderChatMessages, renderComments (tab1-chat-messages.js)
//   - handleChatInputPaste, handleFileInputChange (tab1-chat-images.js)
//   - setupRealtimeMessages, cleanupRealtimeMessages (tab1-chat-realtime.js)
//   - setupChatInfiniteScroll, setupNewMessageIndicatorListener (this file)
//   - handleChatInputKeyDown, handleChatInputInput, updateSendButtonState (tab1-chat-messages.js)
// These functions will exist as globals when loaded in correct order.

window.openChatModal = async function (orderId, channelId, psid, type = 'message') {
    console.log('[CHAT] Opening modal:', { orderId, channelId, psid, type });
    if (!channelId || !psid) {
        alert('Không có thông tin tin nhắn cho đơn hàng này');
        return;
    }

    // Reset pagination state
    window.currentChatChannelId = channelId;
    window.currentChatPSID = psid;
    currentChatType = type;
    currentChatCursor = null;
    window.allChatMessages = [];
    window.allChatComments = [];
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Hide conversation selector initially (will show if multiple conversations found)
    window.hideConversationSelector();

    // Get order info
    // First try to find order by exact ID match - O(1) via OrderStore
    let order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
    // If not found, check if this orderId is in a merged order's OriginalIds
    if (!order) {
        order = allData.find(o => o.IsMerged && o.OriginalIds && o.OriginalIds.includes(orderId));
    }
    if (!order) {
        alert('Không tìm thấy đơn hàng');
        return;
    }

    // Lưu order hiện tại
    currentOrder = order;
    currentChatOrderId = orderId;

    // Save customer name for page switching (search by name across pages)
    window.currentCustomerName = order.Name || order.PartnerName;
    console.log('[CHAT] Saved customer name for page switching:', window.currentCustomerName);

    // Update modal title based on type
    const titleText = type === 'comment' ? 'Bình luận' : 'Tin nhắn';
    document.getElementById('chatModalTitle').textContent = `${titleText} với ${order.Name}`;
    const phone = order.Telephone || 'N/A';
    const phoneHtml = phone !== 'N/A'
        ? `<span style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="navigator.clipboard.writeText('${phone}'); this.querySelector('.copy-icon').classList.replace('fa-copy', 'fa-check'); setTimeout(() => this.querySelector('.copy-icon').classList.replace('fa-check', 'fa-copy'), 1500);" title="Click để copy SĐT">SĐT: ${phone} <i class="fas fa-copy copy-icon" style="font-size: 11px; opacity: 0.8;"></i></span>`
        : `SĐT: ${phone}`;
    document.getElementById('chatModalSubtitleText').innerHTML = `${phoneHtml} • Mã ĐH: ${order.Code}`;

    // Initialize conversation type toggle
    const initialConvType = type === 'comment' ? 'COMMENT' : 'INBOX';
    window.updateConversationTypeToggle(initialConvType);
    // IMPORTANT: Also set currentConversationType so switchConversationType works correctly
    currentConversationType = initialConvType;

    // Show modal
    document.getElementById('chatModal').classList.add('show');

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    // Load and display debt for this order's phone
    loadChatDebt(order.Telephone);

    // Populate page selectors with current channelId
    window.populateChatPageSelector(channelId);  // View page selector
    window.populateSendPageSelector(channelId);  // Send page selector (independent)

    // OPTIMIZATION: Fetch TPOS order details in parallel (non-blocking)
    // This runs independently while messages are being fetched
    // Uses cache to avoid redundant API calls (TTL: 5 minutes)
    const orderDetailsPromise = (async () => {
        try {
            // Check cache first
            let fullOrderData = getOrderDetailsFromCache(orderId);

            if (!fullOrderData) {
                // Cache miss - fetch from API
                console.log(`[CACHE] Order details cache MISS for ${orderId}, fetching from API...`);
                const headers = await window.tokenManager.getAuthHeader();
                const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
                const response = await API_CONFIG.smartFetch(apiUrl, {
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                fullOrderData = await response.json();

                // Save to cache for future use
                saveOrderDetailsToCache(orderId, fullOrderData);
            }

            // Store full order data for dropped products manager (needed by moveDroppedToOrder)
            window.currentChatOrderData = fullOrderData;

            // Store Facebook data for highlighting purchase comment
            window.purchaseFacebookPostId = fullOrderData.Facebook_PostId || null;
            window.purchaseFacebookASUserId = fullOrderData.Facebook_ASUserId || null;
            window.purchaseCommentId = fullOrderData.Facebook_CommentId || null;

            console.log('[CHAT] Order Facebook data loaded:', {
                PostId: window.purchaseFacebookPostId,
                ASUserId: window.purchaseFacebookASUserId,
                CommentId: window.purchaseCommentId
            });

            // Store CRMTeam for Facebook_PageToken access (for 24h bypass)
            window.currentCRMTeam = fullOrderData.CRMTeam || null;
            if (window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
                console.log('[CHAT] CRMTeam loaded with Facebook_PageToken');
            }

            // Store order details for products display
            currentChatOrderDetails = fullOrderData.Details ? JSON.parse(JSON.stringify(fullOrderData.Details)) : [];
            console.log('[CHAT] Order details loaded:', currentChatOrderDetails.length, 'products');

            // Render products table
            renderChatProductsTable();

            // Initialize KPI badge for this order (non-blocking)
            if (window.kpiManager && window.kpiManager.initKPIBadge) {
                window.kpiManager.initKPIBadge(fullOrderData.Id).catch(function () {});
            }

            // Initialize search after render (with delay for DOM ready)
            setTimeout(() => {
                initChatProductSearch();
            }, 100);

            // Setup realtime listener for held products (multi-user collaboration)
            if (typeof window.setupHeldProductsListener === 'function') {
                window.setupHeldProductsListener();
            }

            // Update message reply type toggle (show if order has comment)
            window.updateMessageReplyTypeToggle();
        } catch (error) {
            console.error('[CHAT] Error loading order details:', error);
            // Reset order data
            window.currentChatOrderData = null;
            // Reset Facebook data on error
            window.purchaseFacebookPostId = null;
            window.purchaseFacebookASUserId = null;
            window.purchaseCommentId = null;
            // Reset order details
            currentChatOrderDetails = [];
            renderChatProductsTable();

            // Hide message reply type toggle on error
            window.updateMessageReplyTypeToggle();
        }
    })(); // Execute immediately but don't await - runs in parallel

    // Show loading
    const modalBody = document.getElementById('chatModalBody');
    const loadingText = type === 'comment' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    // Show/hide reply container and mark as read button
    const replyContainer = document.getElementById('chatReplyContainer');
    const markReadBtn = document.getElementById('chatMarkReadBtn');

    // Always show reply container for both comment and message
    replyContainer.style.display = 'block';
    const chatInput = document.getElementById('chatReplyInput');
    chatInput.value = '';

    // Reset pasted image and uploaded images array
    currentPastedImage = null;
    window.currentPastedImage = null;
    window.uploadedImagesData = [];
    window.isUploadingImages = false;
    const previewContainer = document.getElementById('chatImagePreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';
    }

    // Remove old listener to avoid duplicates (if any) and add new one
    chatInput.removeEventListener('paste', handleChatInputPaste);
    chatInput.addEventListener('paste', handleChatInputPaste);

    // Remove old Enter key listener and add new one with proper event handling
    chatInput.removeEventListener('keydown', handleChatInputKeyDown);
    chatInput.addEventListener('keydown', handleChatInputKeyDown);

    // Add input event listener for auto-resize
    chatInput.removeEventListener('input', handleChatInputInput);
    chatInput.addEventListener('input', handleChatInputInput);

    // Add file input listener for attachment button
    const fileInput = document.getElementById('uploadFileInput');
    if (fileInput) {
        fileInput.removeEventListener('change', handleFileInputChange);
        fileInput.addEventListener('change', handleFileInputChange);
    }

    if (type === 'comment') {
        if (markReadBtn) {
            markReadBtn.style.display = 'none';
        }

        // Disable input and send button by default for comments
        // Only enable when replying to a specific comment
        const chatSendBtn = document.getElementById('chatSendBtn');
        chatInput.disabled = true;
        chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
        chatInput.style.background = '#f3f4f6';
        chatInput.style.cursor = 'not-allowed';
        if (chatSendBtn) {
            chatSendBtn.disabled = true;
            chatSendBtn.style.opacity = '0.5';
            chatSendBtn.style.cursor = 'not-allowed';
        }
    } else {
        if (markReadBtn) {
            markReadBtn.style.display = 'none'; // Keep hidden for now or show if needed
        }

        // Re-enable input and send button for chat (message mode)
        // Reset to default state in case it was disabled from previous comment modal
        const chatSendBtn = document.getElementById('chatSendBtn');
        chatInput.disabled = false;
        chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
        chatInput.style.background = '#f9fafb';
        chatInput.style.cursor = 'text';
        chatInput.style.opacity = '1';
        if (chatSendBtn) {
            chatSendBtn.disabled = false;
            chatSendBtn.style.opacity = '1';
            chatSendBtn.style.cursor = 'pointer';
            chatSendBtn.title = 'Gửi tin nhắn';
        }

        // Auto-focus chat input for immediate typing (message mode only)
        setTimeout(() => {
            chatInput.focus();
        }, 150);
    }

    // Ensure send button is in correct state after modal initialization
    updateSendButtonState();

    // Fetch messages or comments based on type
    try {
        if (type === 'comment') {
            // Fetch COMMENT conversations from Pancake to get conversation IDs
            const facebookPsid = order.Facebook_ASUserId;
            const facebookPostId = order.Facebook_PostId;

            console.log('[CHAT-MODAL] Fetching COMMENT conversations by fb_id:', facebookPsid, 'post_id:', facebookPostId);

            if (window.pancakeDataManager && facebookPsid) {
                try {
                    // OPTIMIZATION: Fetch conversations AND page access token in parallel
                    console.log('[CHAT-MODAL] Starting parallel fetch: conversations + pageAccessToken');
                    const parallelStartTime = Date.now();

                    const [result, preloadedPageAccessToken] = await Promise.all([
                        window.pancakeDataManager.fetchConversationsByCustomerFbId(channelId, facebookPsid),
                        window.pancakeTokenManager?.getOrGeneratePageAccessToken(channelId)
                    ]);

                    console.log(`[CHAT-MODAL] Parallel fetch completed in ${Date.now() - parallelStartTime}ms`);

                    if (result.success && result.conversations.length > 0) {
                        console.log('[CHAT-MODAL] Found', result.conversations.length, 'conversations for fb_id:', facebookPsid);

                        // Save customer UUID
                        window.currentCustomerUUID = result.customerUuid;
                        console.log('[CHAT-MODAL] Got customer UUID:', window.currentCustomerUUID);

                        // Filter COMMENT conversations
                        let commentConversations;

                        // First, get all COMMENT conversations
                        const allCommentConvs = result.conversations.filter(conv => conv.type === 'COMMENT');

                        // Log all COMMENT conversations for debugging
                        console.log('[CHAT-MODAL] All COMMENT conversations:', allCommentConvs.map(c => ({
                            id: c.id,
                            snippet: c.snippet,
                            updated_at: c.updated_at
                        })));

                        if (facebookPostId && allCommentConvs.length > 0) {
                            // Extract POST_ID from order.Facebook_PostId (format: "PAGE_ID_POST_ID")
                            const postIdParts = facebookPostId.split('_');
                            const postId = postIdParts.length > 1 ? postIdParts[postIdParts.length - 1] : facebookPostId;

                            console.log('[CHAT-MODAL] Extracted POST_ID from order:', postId);

                            // Match conversation where conversation.id starts with POST_ID
                            commentConversations = allCommentConvs.filter(conv => {
                                const convIdFirstPart = conv.id.split('_')[0];
                                const match = convIdFirstPart === postId;
                                if (match) {
                                    console.log('[CHAT-MODAL] Match found:', conv.id, 'starts with', postId);
                                }
                                return match;
                            });

                            // If no match, use most recent COMMENT conversation
                            if (commentConversations.length === 0) {
                                console.warn('[CHAT-MODAL] No match by post_id, using most recent COMMENT conversation');
                                commentConversations = allCommentConvs;
                            }

                            console.log('[CHAT-MODAL] Filtered COMMENT conversations by post_id:', facebookPostId, '→', commentConversations.length, 'found');
                        } else {
                            commentConversations = allCommentConvs;
                            console.log('[CHAT-MODAL] No post_id or no COMMENT conversations, getting all →', commentConversations.length, 'found');
                        }

                        if (commentConversations.length > 0) {
                            // Populate conversation selector if multiple COMMENT conversations
                            const mostRecentConv = window.populateConversationSelector(commentConversations, commentConversations[0]?.id);
                            const selectedConv = mostRecentConv || commentConversations[0];

                            // Save COMMENT conversation ID
                            window.currentConversationId = selectedConv.id;
                            window.currentCommentConversationId = selectedConv.id;

                            console.log('[CHAT-MODAL] Found', commentConversations.length, 'COMMENT conversations matching post_id:', facebookPostId);
                            console.log('[CHAT-MODAL] Using conversationId:', window.currentConversationId);

                            // Initialize read state for COMMENT (will skip auto-mark since chatType = 'comment')
                            window.currentConversationReadState = {
                                isRead: false,
                                conversationId: window.currentConversationId,
                                pageId: channelId,
                                lastMarkedAt: null,
                                chatType: 'comment'
                            };
                            updateReadBadge(false); // Show badge (but won't auto-mark for comments)
                            updateMarkButton(false);

                            // Now fetch messages for this COMMENT conversation
                            // Pass preloaded pageAccessToken to skip redundant token fetch
                            console.log('[CHAT-MODAL] Fetching messages for COMMENT conversation (using preloaded token)...');

                            const messagesResponse = await window.pancakeDataManager.fetchMessagesForConversation(
                                channelId,
                                window.currentConversationId,
                                null,
                                window.currentCustomerUUID,
                                preloadedPageAccessToken  // Use preloaded token from parallel fetch
                            );

                            // Store as comments (they are messages from COMMENT conversation)
                            window.allChatComments = messagesResponse.messages || [];
                            currentChatCursor = messagesResponse.after;

                            console.log('[CHAT-MODAL] Loaded', window.allChatComments.length, 'comments/messages');

                            // Render comments
                            renderComments(window.allChatComments, true);

                        } else {
                            console.warn('[CHAT-MODAL] No COMMENT conversation found for post:', facebookPostId);
                            modalBody.innerHTML = `
                                <div class="chat-error">
                                    <i class="fas fa-info-circle"></i>
                                    <p>Không tìm thấy bình luận cho bài viết này</p>
                                </div>`;
                        }

                        // Also save INBOX conversation ID for quick switching
                        const inboxConv = result.conversations.find(conv => conv.type === 'INBOX');
                        if (inboxConv) {
                            window.currentInboxConversationId = inboxConv.id;
                            console.log('[CHAT-MODAL] Found INBOX conversationId:', window.currentInboxConversationId);
                        }

                    } else {
                        console.warn('[CHAT-MODAL] No conversations found for fb_id:', facebookPsid);
                        modalBody.innerHTML = `
                            <div class="chat-error">
                                <i class="fas fa-info-circle"></i>
                                <p>Không tìm thấy cuộc hội thoại</p>
                            </div>`;
                    }
                } catch (fetchError) {
                    console.error('[CHAT-MODAL] Error fetching COMMENT conversations:', fetchError);
                    modalBody.innerHTML = `
                        <div class="chat-error">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Lỗi khi tải bình luận</p>
                            <p style="font-size: 12px; color: #6b7280;">${fetchError.message}</p>
                        </div>`;
                }
            } else {
                console.warn('[CHAT-MODAL] Missing pancakeDataManager or required data');
                modalBody.innerHTML = `
                    <div class="chat-error">
                        <i class="fas fa-info-circle"></i>
                        <p>Thiếu thông tin để tải bình luận</p>
                    </div>`;
            }

            // Setup infinite scroll for comments
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();

        } else {
            // Fetch INBOX messages from Pancake
            const facebookPsid = order.Facebook_ASUserId;
            const facebookPostId = order.Facebook_PostId;

            console.log('[CHAT-MODAL] Fetching INBOX conversations by fb_id:', facebookPsid);

            if (window.pancakeDataManager && facebookPsid) {
                try {
                    // OPTIMIZATION: Fetch conversations AND page access token in parallel
                    console.log('[CHAT-MODAL] Starting parallel fetch: conversations + pageAccessToken');
                    const parallelStartTime = Date.now();

                    const [result, preloadedPageAccessToken] = await Promise.all([
                        window.pancakeDataManager.fetchConversationsByCustomerFbId(channelId, facebookPsid),
                        window.pancakeTokenManager?.getOrGeneratePageAccessToken(channelId)
                    ]);

                    console.log(`[CHAT-MODAL] Parallel fetch completed in ${Date.now() - parallelStartTime}ms`);

                    if (result.success && result.conversations.length > 0) {
                        console.log('[CHAT-MODAL] Found', result.conversations.length, 'conversations for fb_id:', facebookPsid);

                        // Save customer UUID
                        window.currentCustomerUUID = result.customerUuid;
                        console.log('[CHAT-MODAL] Got customer UUID:', window.currentCustomerUUID);

                        // Filter INBOX conversations
                        const inboxConversations = result.conversations.filter(conv => conv.type === 'INBOX');

                        // Also save COMMENT conversations for quick switching
                        const commentConversations = result.conversations.filter(conv => conv.type === 'COMMENT');

                        console.log('[CHAT-MODAL] - INBOX:', inboxConversations.length, 'conversations, COMMENT:', commentConversations.length, 'conversations');

                        if (inboxConversations.length > 0) {
                            // Use first INBOX conversation
                            const inboxConv = inboxConversations[0];
                            window.currentConversationId = inboxConv.id;
                            window.currentInboxConversationId = inboxConv.id;

                            // DEBUG: Log conversation structure to find real PSID field
                            console.log('[CHAT-MODAL] DEBUG Conversation data:', JSON.stringify({
                                id: inboxConv.id,
                                from_psid: inboxConv.from_psid,
                                from: inboxConv.from,
                                customers: inboxConv.customers,
                                page_id: inboxConv.page_id
                            }, null, 2));

                            // IMPORTANT: Save the real Facebook PSID from conversation data
                            window.currentRealFacebookPSID = inboxConv.from_psid
                                || inboxConv.from?.id
                                || (inboxConv.customers && inboxConv.customers[0]?.fb_id);
                            console.log('[CHAT-MODAL] Real Facebook PSID:', window.currentRealFacebookPSID);

                            // Save customer fb_id for page switching
                            window.currentCustomerFbId = inboxConv.customers?.[0]?.fb_id
                                || inboxConv.from?.id
                                || inboxConv.from_psid;
                            console.log('[CHAT-MODAL] Customer fb_id for page switching:', window.currentCustomerFbId);

                            console.log('[CHAT-MODAL] Using INBOX conversationId:', window.currentConversationId);

                            // Initialize read state for INBOX
                            window.currentConversationReadState = {
                                isRead: false,
                                conversationId: window.currentConversationId,
                                pageId: channelId,
                                lastMarkedAt: null,
                                chatType: 'message'
                            };
                            updateReadBadge(false);
                            updateMarkButton(false);

                            // Populate conversation selector if multiple INBOX conversations
                            if (inboxConversations.length > 1) {
                                window.populateConversationSelector(inboxConversations, window.currentConversationId);
                            } else {
                                window.hideConversationSelector();
                            }

                            // Now fetch messages for this INBOX conversation
                            console.log('[CHAT-MODAL] Fetching messages for INBOX conversation (using preloaded token)...');

                            const messagesResponse = await window.pancakeDataManager.fetchMessagesForConversation(
                                channelId,
                                window.currentConversationId,
                                null,
                                window.currentCustomerUUID,
                                preloadedPageAccessToken  // Use preloaded token from parallel fetch
                            );

                            window.allChatMessages = messagesResponse.messages || [];
                            currentChatCursor = messagesResponse.after;

                            console.log('[CHAT-MODAL] Loaded', window.allChatMessages.length, 'messages');

                            // Render messages
                            renderChatMessages(window.allChatMessages, true);

                        } else {
                            console.warn('[CHAT-MODAL] No INBOX conversation found');
                            modalBody.innerHTML = `
                                <div class="chat-error">
                                    <i class="fas fa-info-circle"></i>
                                    <p>Không tìm thấy tin nhắn cho khách hàng này</p>
                                </div>`;
                        }

                        // Save COMMENT conversation ID for quick switching
                        if (commentConversations.length > 0) {
                            let matchedCommentConvs = commentConversations;
                            if (facebookPostId) {
                                const postIdParts = facebookPostId.split('_');
                                const postId = postIdParts.length > 1 ? postIdParts[postIdParts.length - 1] : facebookPostId;
                                const filtered = commentConversations.filter(conv => {
                                    const convIdFirstPart = conv.id.split('_')[0];
                                    return convIdFirstPart === postId;
                                });
                                if (filtered.length > 0) {
                                    matchedCommentConvs = filtered;
                                }
                            }
                            const targetCommentConv = matchedCommentConvs[0];

                            window.currentCommentConversationId = targetCommentConv.id;
                            // Also save all matched conversations for selector when switching
                            window.cachedCommentConversations = matchedCommentConvs;
                            console.log('[CHAT-MODAL] Found COMMENT conversationId:', window.currentCommentConversationId);
                        }

                    } else {
                        console.warn('[CHAT-MODAL] No conversations found for fb_id:', facebookPsid);
                        modalBody.innerHTML = `
                            <div class="chat-error">
                                <i class="fas fa-info-circle"></i>
                                <p>Không tìm thấy cuộc hội thoại</p>
                            </div>`;
                    }
                } catch (fetchError) {
                    console.error('[CHAT-MODAL] Error fetching INBOX conversations:', fetchError);
                    modalBody.innerHTML = `
                        <div class="chat-error">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Lỗi khi tải tin nhắn</p>
                            <p style="font-size: 12px; color: #6b7280;">${fetchError.message}</p>
                        </div>`;
                }
            } else {
                console.warn('[CHAT-MODAL] Missing pancakeDataManager or required data');
                modalBody.innerHTML = `
                    <div class="chat-error">
                        <i class="fas fa-info-circle"></i>
                        <p>Thiếu thông tin để tải tin nhắn</p>
                    </div>`;
            }

            // Setup infinite scroll and realtime
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();
            setupRealtimeMessages();
        }

        /* LEGACY CODE REMOVED
        // Initialize Chat Product State
        initChatProductSearch();

        // Firebase Sync Logic - Shared products across all orders
        if (database) {
            currentChatProductsRef = database.ref('order_products/shared');
            currentChatProductsRef.on('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    console.log('[CHAT-FIREBASE] Loaded shared products from Firebase:', data);
                    currentChatOrderDetails = data;
                    renderChatProductsPanel();
                } else {
                    console.log('[CHAT-FIREBASE] No shared data in Firebase, initializing from order details');
                    // If no data in Firebase, initialize from order and save to shared
                    currentChatOrderDetails = order.Details ? JSON.parse(JSON.stringify(order.Details)) : [];
                    renderChatProductsPanel();
                    // Save initial state to shared Firebase path
                    saveChatProductsToFirebase('shared', currentChatOrderDetails);
                }
            });
        } else {
            // Fallback if no firebase
            currentChatOrderDetails = order.Details ? JSON.parse(JSON.stringify(order.Details)) : [];
            renderChatProductsPanel();
        }
        */



    } catch (error) {
        console.error(`[CHAT] Error loading ${type}:`, error);
        const errorText = type === 'comment' ? 'Lỗi khi tải bình luận' : 'Lỗi khi tải tin nhắn';
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${errorText}</p>
                <p style="font-size: 12px; color: #9ca3af;">${error.message}</p>
            </div>`;
    }
}

window.closeChatModal = async function () {
    // Cleanup temporary held products (isDraft: false) - return them to dropped
    // Only persisted held products (isDraft: true, user clicked "Lưu giữ") will remain
    if (typeof window.cleanupHeldProducts === 'function') {
        await window.cleanupHeldProducts();
    }

    // Cleanup held products listener
    if (typeof window.cleanupHeldProductsListener === 'function') {
        window.cleanupHeldProductsListener();
    }

    // Cleanup realtime messages (stop polling, remove event listeners)
    cleanupRealtimeMessages();

    document.getElementById('chatModal').classList.remove('show');

    // Restore body scroll when modal is closed
    document.body.style.overflow = '';

    // Clean up scroll listener
    const modalBody = document.getElementById('chatModalBody');
    if (modalBody) {
        modalBody.removeEventListener('scroll', handleChatScroll);
    }

    // Reset pagination state
    window.currentChatChannelId = null;
    window.currentChatPSID = null;
    window.currentRealFacebookPSID = null;
    currentChatType = null;
    currentChatCursor = null;
    window.allChatMessages = [];
    window.allChatComments = [];
    window.chatMessagesById = {}; // Clear messages map for reply functionality
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    currentChatOrderDetails = [];
    window.currentChatOrderData = null;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Reset conversation selector
    window.hideConversationSelector();

    // Reset image upload state
    currentPastedImage = null;
    window.currentPastedImage = null;
    window.uploadedImagesData = [];
    window.isUploadingImages = false;

    // Reset purchase comment highlight state
    window.purchaseCommentId = null;
    window.purchaseFacebookPostId = null;
    window.purchaseFacebookASUserId = null;

    // Reset message reply type and hide toggle
    messageReplyType = 'reply_inbox';
    const msgReplyToggle = document.getElementById('messageReplyTypeToggle');
    if (msgReplyToggle) {
        msgReplyToggle.style.display = 'none';
    }

    // Hide reply preview
    const replyPreviewContainer = document.getElementById('chatReplyPreviewContainer');
    if (replyPreviewContainer) {
        replyPreviewContainer.style.display = 'none';
    }

    // Detach Firebase listener
    if (currentChatProductsRef) {
        currentChatProductsRef.off();
        currentChatProductsRef = null;
    }
}

// Close chat modal when clicking outside (on backdrop)
document.addEventListener('click', function (event) {
    const modal = document.getElementById('chatModal');
    if (!modal || !modal.classList.contains('show')) return;

    const modalContent = modal.querySelector('.chat-modal-content');
    // If click is on the backdrop (modal itself, not its content), close the modal
    if (event.target === modal && modalContent && !modalContent.contains(event.target)) {
        closeChatModal();
    }
});

// =====================================================
// SCROLL TO MESSAGE FUNCTION
// =====================================================

/**
 * Scroll to a specific message in the chat modal and highlight it
 * @param {string} messageId - The ID of the message to scroll to
 */
window.scrollToMessage = function (messageId) {
    if (!messageId) return;

    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Find message element by data-message-id attribute
    const messageElement = modalBody.querySelector(`[data-message-id="${messageId}"]`);

    if (messageElement) {
        // Scroll to message
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Add highlight animation
        messageElement.classList.add('message-highlight');

        // Remove highlight after animation
        setTimeout(() => {
            messageElement.classList.remove('message-highlight');
        }, 2000);
    } else {
        console.log('[SCROLL] Message not found:', messageId);
        // Message might not be loaded yet - show notification
        showToast && showToast('Tin nhắn không tìm thấy trong cuộc hội thoại hiện tại', 'warning');
    }
};

// =====================================================
// INFINITE SCROLL FOR MESSAGES & COMMENTS
// =====================================================

function setupChatInfiniteScroll() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Remove existing listener to avoid duplicates
    modalBody.removeEventListener('scroll', handleChatScroll);

    // Add scroll listener
    modalBody.addEventListener('scroll', handleChatScroll);
}

async function handleChatScroll(event) {
    const modalBody = event.target;

    // Check if scrolled to top (or near top)
    const isNearTop = modalBody.scrollTop < 100;

    // Only load more if:
    // 1. Near the top of the scroll
    // 2. Not already loading
    if (isNearTop && !isLoadingMoreMessages) {
        if (currentChatType === 'message') {
            await loadMoreMessages();
        } else if (currentChatType === 'comment' && currentChatCursor) {
            await loadMoreComments();
        }
    }
}

async function loadMoreMessages() {
    if (!window.currentChatChannelId || !window.currentChatPSID) {
        return;
    }

    // Stop if already loading
    if (isLoadingMoreMessages) {
        console.log('[CHAT] Already loading messages, skipping...');
        return;
    }

    isLoadingMoreMessages = true;

    try {
        const modalBody = document.getElementById('chatModalBody');
        const loadMoreIndicator = document.getElementById('chatLoadMoreIndicator');

        // Show loading state with better visual feedback
        if (loadMoreIndicator) {
            loadMoreIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px; color: #3b82f6;"></i>
                <span style="font-weight: 500; color: #3b82f6;">Đang tải thêm tin nhắn...</span>
            `;
            loadMoreIndicator.style.background = 'linear-gradient(to bottom, #eff6ff 0%, transparent 100%)';
        }

        // Use count-based pagination (current_count parameter)
        const currentCount = window.allChatMessages.length;
        console.log(`[CHAT] Loading more messages with current_count: ${currentCount}`);

        // Fetch more messages using count-based pagination
        const response = await window.chatDataManager.fetchMessages(
            window.currentChatChannelId,
            window.currentChatPSID,
            currentCount,  // Pass number for count-based pagination
            window.currentCustomerUUID  // Pass customerId
        );

        // Get scroll height before updating
        const scrollHeightBefore = modalBody.scrollHeight;
        const scrollTopBefore = modalBody.scrollTop;

        // Append older messages to the beginning of the array
        const newMessages = response.messages || [];
        if (newMessages.length > 0) {
            window.allChatMessages = [...window.allChatMessages, ...newMessages];
            console.log(`[CHAT] Loaded ${newMessages.length} more messages. Total: ${window.allChatMessages.length}`);
        } else {
            console.log(`[CHAT] No new messages loaded. Reached the beginning of conversation.`);
        }

        // Re-render with all messages, don't scroll to bottom
        renderChatMessages(window.allChatMessages, false);

        // Restore scroll position (adjust for new content height)
        setTimeout(() => {
            const scrollHeightAfter = modalBody.scrollHeight;
            const heightDifference = scrollHeightAfter - scrollHeightBefore;
            modalBody.scrollTop = scrollTopBefore + heightDifference;
        }, 50);

    } catch (error) {
        console.error('[CHAT] Error loading more messages:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

async function loadMoreComments() {
    if (!window.currentChatChannelId || !window.currentChatPSID || !currentChatCursor) {
        return;
    }

    isLoadingMoreMessages = true;

    try {
        const modalBody = document.getElementById('chatModalBody');
        const loadMoreIndicator = document.getElementById('chatLoadMoreIndicator');

        // Show loading state with better visual feedback
        if (loadMoreIndicator) {
            loadMoreIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px; color: #3b82f6;"></i>
                <span style="font-weight: 500; color: #3b82f6;">Đang tải thêm bình luận...</span>
            `;
            loadMoreIndicator.style.background = 'linear-gradient(to bottom, #eff6ff 0%, transparent 100%)';
        }

        console.log(`[CHAT] Loading more comments with cursor: ${currentChatCursor}`);

        // Fetch more comments using the cursor
        const response = await window.chatDataManager.fetchComments(
            window.currentChatChannelId,
            window.currentChatPSID,
            currentChatCursor
        );

        // Get scroll height before updating
        const scrollHeightBefore = modalBody.scrollHeight;
        const scrollTopBefore = modalBody.scrollTop;

        // Append older comments to the beginning of the array
        const newComments = response.comments || [];
        if (newComments.length > 0) {
            window.allChatComments = [...window.allChatComments, ...newComments];
            console.log(`[CHAT] Loaded ${newComments.length} more comments. Total: ${window.allChatComments.length}`);
        } else {
            console.log(`[CHAT] No new comments loaded. Reached end or empty batch.`);
        }

        // Update cursor for next page (null = no more comments)
        currentChatCursor = response.after;
        if (currentChatCursor) {
            console.log(`[CHAT] Next cursor available: ${currentChatCursor.substring(0, 20)}...`);
        } else {
            console.log(`[CHAT] No more comments. Reached the beginning.`);
        }

        // Re-render with all comments, don't scroll to bottom
        renderComments(window.allChatComments, false);

        // Restore scroll position (adjust for new content height)
        setTimeout(() => {
            const scrollHeightAfter = modalBody.scrollHeight;
            const heightDifference = scrollHeightAfter - scrollHeightBefore;
            modalBody.scrollTop = scrollTopBefore + heightDifference;
        }, 50);

    } catch (error) {
        console.error('[CHAT] Error loading more comments:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

window.markChatAsRead = async function () {
    if (!window.currentChatChannelId || !window.currentChatPSID) return;

    try {
        const markReadBtn = document.getElementById('chatMarkReadBtn');
        if (markReadBtn) {
            markReadBtn.disabled = true;
            markReadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        }

        await window.chatDataManager.markAsSeen(window.currentChatChannelId, window.currentChatPSID);

        // Hide button
        if (markReadBtn) {
            markReadBtn.style.display = 'none';
            markReadBtn.disabled = false;
            markReadBtn.innerHTML = '<i class="fas fa-check"></i> Đánh dấu đã đọc';
        }

        // Re-render table to update UI
        renderTable();

        if (window.notificationManager) {
            window.notificationManager.success('Đã đánh dấu tin nhắn là đã đọc', 2000);
        }
    } catch (error) {
        console.error('[CHAT] Error marking as read:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi khi đánh dấu đã đọc: ' + error.message, 3000);
        }
    }
}

console.log('[Tab1-Chat-Core] Loaded successfully');
