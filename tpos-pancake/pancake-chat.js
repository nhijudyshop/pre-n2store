/* =====================================================
   PANCAKE CHAT MANAGER - Giao dien chat Pancake
   ===================================================== */

class PancakeChatManager {
    constructor() {
        this.conversations = [];
        this.activeConversation = null;
        this.messages = [];
        this.isLoading = false;
        this.searchQuery = '';
        this.filterType = 'all'; // 'all', 'tpos-saved', 'inbox', 'comment'

        // API config
        this.proxyBaseUrl = 'https://n2store-fallback.onrender.com';
        this.tposPancakeUrl = 'https://n2store-tpos-pancake.onrender.com';

        // Server mode: 'pancake' (default) or 'n2store' (Facebook Graph API)
        this.serverMode = localStorage.getItem('pancake_server_mode') || 'pancake';
        this.n2storeUrl = 'https://n2store-facebook.onrender.com';

        // TPOS saved customers cache
        this.tposSavedCustomerIds = new Set();

        // Debt cache: phone -> { amount, timestamp }
        this.debtCache = new Map();
        this.debtCacheConfig = {
            maxSize: 200,
            ttl: 10 * 60 * 1000  // 10 minutes
        };

        // Debt display settings
        this.showDebt = true;
        this.showZeroDebt = false;

        // Search state
        this.isSearching = false;
        this.searchResults = null;

        // Page Selector
        this.pages = [];
        this.pagesWithUnread = [];
        this.selectedPageId = null; // null = all pages
        this.isPageDropdownOpen = false;

        // Conversation pagination
        this.isLoadingMoreConversations = false;
        this.hasMoreConversations = true;
        this.lastConversationId = null; // For pagination param

        // WebSocket Realtime (Phoenix Protocol)
        this.socket = null;
        this.socketReconnectAttempts = 0;
        this.socketMaxReconnectAttempts = 3; // Reduced from 10 - WebSocket often blocked on GitHub Pages
        this.socketReconnectDelay = 2000; // Start with 2s, exponential backoff
        this.socketReconnectTimer = null; // Timer for reconnection
        this.isSocketConnecting = false; // Flag to prevent duplicate connections
        this.heartbeatInterval = null;
        this.HEARTBEAT_INTERVAL = 30000; // 30 seconds heartbeat
        this.socketJoinRef = 0;
        this.socketMsgRef = 0;
        this.userId = null;
        this.isSocketConnected = false;

        // Fallback auto-refresh (when socket fails)
        this.autoRefreshInterval = null;
        this.AUTO_REFRESH_INTERVAL = 30000; // 30 seconds fallback

        // Quick reply templates
        this.quickReplies = [
            { label: 'NV My KH dat', color: 'blue', template: '' },
            { label: 'NV My CK + Gap', color: 'blue', template: '' },
            { label: 'NHAC KHACH', color: 'red', template: '' },
            { label: 'XIN DIA CHI', color: 'purple', template: '' },
            { label: 'NV .BO', color: 'teal', template: '' },
            { label: 'NJD OI', color: 'green', template: '' },
            { label: 'NV. Lai', color: 'orange', template: '' },
            { label: 'NV. Hanh', color: 'pink', template: '' },
            { label: 'Nv.Huyen', color: 'pink', template: '' },
            { label: 'Nv. Duyen', color: 'teal', template: '' },
            { label: 'XU LY BC', color: 'purple', template: '' },
            { label: 'BOOM', color: 'red', template: '' },
            { label: 'CHECK IB', color: 'green', template: '' },
            { label: 'Nv My', color: 'blue', template: '' }
        ];

        // DOM Elements
        this.container = null;
        this.conversationList = null;
        this.chatWindow = null;

        // Scroll-to-bottom tracking
        this.isScrolledToBottom = true;
        this.newMessageCount = 0;

        // Message pagination
        this.isLoadingMoreMessages = false;
        this.hasMoreMessages = true;
        this.messageCurrentCount = 0; // Current message index for pagination
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    async initialize(containerId = 'pancakeContent') {
        console.log('[PANCAKE-CHAT] Initializing...');

        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('[PANCAKE-CHAT] Container not found:', containerId);
            return false;
        }

        // Render initial UI
        this.render();

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Initialize token manager and data manager if not already
        if (window.pancakeTokenManager) {
            await window.pancakeTokenManager.initialize();
        }

        if (window.pancakeDataManager) {
            // Load pages first (for Page Selector)
            await this.loadPages();

            // Fetch initial conversations
            await this.loadConversations();
        } else {
            console.warn('[PANCAKE-CHAT] PancakeDataManager not available');
        }

        // Bind events
        this.bindEvents();

        // Initialize WebSocket realtime connection (preferred)
        const socketConnected = await this.initializeWebSocket();

        // Fall back to polling if WebSocket fails
        if (!socketConnected) {
            console.log('[PANCAKE-CHAT] WebSocket unavailable, using polling fallback');
            this.startAutoRefresh();
        }

        // Request notification permission - DISABLED to remove browser popup
        // if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        //     Notification.requestPermission();
        // }

        console.log('[PANCAKE-CHAT] Initialized successfully');
        return true;
    }

    // =====================================================
    // RENDER METHODS
    // =====================================================

    render() {
        this.container.innerHTML = `
            <div class="pancake-chat-container">
                <!-- Header Tabs -->
                <div class="pk-header-tabs">
                    <div class="pk-header-tabs-left">
                        <div class="pk-pancake-logo">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00a884"/>
                                <path d="M2 17L12 22L22 17V12L12 17L2 12V17Z" fill="#00a884" opacity="0.7"/>
                            </svg>
                            <span>Pancake</span>
                        </div>
                        <button class="pk-header-tab active" data-tab="conversations">
                            <i data-lucide="message-circle"></i>
                            <span>Hội thoại</span>
                        </button>
                        <button class="pk-header-tab" data-tab="orders">
                            <i data-lucide="shopping-bag"></i>
                            <span>Đơn hàng</span>
                        </button>
                        <button class="pk-header-tab" data-tab="posts">
                            <i data-lucide="file-text"></i>
                            <span>Bài viết</span>
                        </button>
                        <button class="pk-header-tab" data-tab="stats">
                            <i data-lucide="bar-chart-2"></i>
                            <span>Thống kê</span>
                        </button>
                        <button class="pk-header-tab" data-tab="settings">
                            <i data-lucide="settings"></i>
                            <span>Cài đặt</span>
                        </button>
                    </div>
                    <div class="pk-header-tabs-right">
                        <span class="pk-socket-status" id="pkSocketStatus" title="Trạng thái kết nối realtime">
                            <i data-lucide="wifi-off" class="pk-socket-icon disconnected"></i>
                        </span>
                        <button class="pk-header-icon-btn" title="Thông báo">
                            <i data-lucide="bell"></i>
                        </button>
                        <button class="pk-header-icon-btn" title="Tài khoản">
                            <i data-lucide="user"></i>
                        </button>
                    </div>
                </div>

                <!-- Tab Content Container -->
                <div class="pk-tab-content-container">
                    <!-- Conversations Tab (active) -->
                    <div class="pk-tab-content active" id="pkTabConversations">
                        <div class="pk-conversations-layout">
                            <!-- Conversation List (Left Panel) -->
                            <div class="pk-conversation-list" id="pkConversationList">
                    <!-- Merged Header: Page Selector + actions in one row (title hidden for more space) -->
                    <div class="pk-merged-header">
                        <!-- Page Selector -->
                        <div class="pk-page-selector" style="position: relative;">
                            <button class="pk-page-selector-btn" id="pkPageSelectorBtn">
                                <div class="pk-page-avatar-placeholder" id="pkSelectedPageAvatar">
                                    <i data-lucide="layout-grid"></i>
                                </div>
                                <div class="pk-page-info">
                                    <div class="pk-page-name" id="pkSelectedPageName">Tất cả Pages</div>
                                    <div class="pk-page-hint" id="pkSelectedPageHint">Chọn page để lọc hội thoại</div>
                                </div>
                                <span class="pk-page-unread-badge" id="pkTotalUnreadBadge" style="display: none;">0</span>
                                <i data-lucide="chevron-down" class="pk-page-selector-icon"></i>
                            </button>

                            <!-- Page Dropdown -->
                            <div class="pk-page-dropdown" id="pkPageDropdown">
                                <div class="pk-page-dropdown-header">Chọn Page</div>
                                <div id="pkPageList">
                                    <div class="pk-loading">
                                        <div class="pk-loading-spinner"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Header Actions (only settings) -->
                        <div class="pk-header-actions">
                            <button class="pk-action-icon-btn" title="Cài đặt Pancake" onclick="openPancakeSettingsModal()">
                                <i data-lucide="settings"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Filter Tabs -->
                    <div class="pk-filter-tabs">
                        <button class="pk-filter-tab active" data-filter="all">Tất cả</button>
                        <button class="pk-filter-tab" data-filter="inbox">Inbox</button>
                        <button class="pk-filter-tab" data-filter="comment">Comment</button>
                        <button class="pk-filter-tab" data-filter="tpos-saved">Lưu Tpos</button>
                    </div>

                    <!-- Search Header -->
                    <div class="pk-search-header">
                        <div class="pk-search-wrapper">
                            <div class="pk-search-box">
                                <i data-lucide="search"></i>
                                <input type="text" id="pkSearchInput" placeholder="Tìm kiếm">
                            </div>
                        </div>
                    </div>

                    <!-- Conversations -->
                    <div class="pk-conversations" id="pkConversations">
                        <div class="pk-loading">
                            <div class="pk-loading-spinner"></div>
                        </div>
                    </div>

                    <!-- Context Menu -->
                    <div class="pk-context-menu" id="pkContextMenu" style="display: none;">
                        <button class="pk-context-menu-item" data-action="mark-unread">
                            <i data-lucide="mail"></i>
                            <span>Đánh dấu chưa đọc</span>
                        </button>
                        <button class="pk-context-menu-item" data-action="mark-read">
                            <i data-lucide="mail-open"></i>
                            <span>Đánh dấu đã đọc</span>
                        </button>
                        <div class="pk-context-menu-divider"></div>
                        <button class="pk-context-menu-item" data-action="add-note">
                            <i data-lucide="file-text"></i>
                            <span>Thêm ghi chú</span>
                        </button>
                        <button class="pk-context-menu-item" data-action="manage-tags">
                            <i data-lucide="tag"></i>
                            <span>Quản lý nhãn</span>
                            <i data-lucide="chevron-right" class="pk-menu-arrow"></i>
                        </button>
                        <div class="pk-context-menu-divider pk-tpos-saved-divider" style="display: none;"></div>
                        <button class="pk-context-menu-item pk-tpos-saved-action" data-action="remove-tpos-saved" style="display: none;">
                            <i data-lucide="x-circle"></i>
                            <span>Xóa khỏi Lưu Tpos</span>
                        </button>
                    </div>

                    <!-- Tags Submenu -->
                    <div class="pk-tags-menu" id="pkTagsMenu" style="display: none;">
                        <div class="pk-tags-menu-header">Chọn nhãn</div>
                        <div class="pk-tags-menu-list" id="pkTagsList">
                            <div class="pk-loading-spinner" style="width: 20px; height: 20px;"></div>
                        </div>
                    </div>
                </div>

                            <!-- Chat Window (Right Panel) -->
                            <div class="pk-chat-window" id="pkChatWindow">
                                <div class="pk-empty-state">
                                    <i data-lucide="message-square"></i>
                                    <h3>Chọn hội thoại</h3>
                                    <p>Chọn một cuộc trò chuyện từ danh sách bên trái để bắt đầu nhắn tin</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Orders Tab -->
                    <div class="pk-tab-content" id="pkTabOrders">
                        <div class="pk-tab-placeholder">
                            <i data-lucide="shopping-bag"></i>
                            <h3>Đơn hàng</h3>
                            <p>Quản lý đơn hàng - Đang phát triển</p>
                        </div>
                    </div>

                    <!-- Posts Tab -->
                    <div class="pk-tab-content" id="pkTabPosts">
                        <div class="pk-tab-placeholder">
                            <i data-lucide="file-text"></i>
                            <h3>Bài viết</h3>
                            <p>Quản lý bài viết - Đang phát triển</p>
                        </div>
                    </div>

                    <!-- Stats Tab -->
                    <div class="pk-tab-content" id="pkTabStats">
                        <div class="pk-tab-placeholder">
                            <i data-lucide="bar-chart-2"></i>
                            <h3>Thống kê</h3>
                            <p>Báo cáo thống kê - Đang phát triển</p>
                        </div>
                    </div>

                    <!-- Settings Tab -->
                    <div class="pk-tab-content" id="pkTabSettings">
                        <div class="pk-tab-placeholder">
                            <i data-lucide="settings"></i>
                            <h3>Cài đặt</h3>
                            <p>Cấu hình hệ thống - Đang phát triển</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderConversationList() {
        const container = document.getElementById('pkConversations');
        if (!container) return;

        // If currently searching (API in progress), don't render
        if (this.isSearching) {
            return;
        }

        // Use search results if available, otherwise use all conversations
        let filtered = this.searchResults !== null ? this.searchResults : this.conversations;

        // If search results are empty and we searched
        if (this.searchResults !== null && this.searchResults.length === 0) {
            container.innerHTML = `
                <div class="pk-search-empty">
                    <i data-lucide="search-x"></i>
                    <span>Không tìm thấy kết quả cho "${this.escapeHtml(this.searchQuery)}"</span>
                    <button class="pk-clear-search-btn" onclick="pancakeChatManager.clearSearch()">Xóa tìm kiếm</button>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="inbox"></i>
                    <h3>Không có hội thoại</h3>
                    <p>Chưa có cuộc trò chuyện nào</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Filter by selected page (only when not searching via API)
        if (this.selectedPageId && this.searchResults === null) {
            // Find the selected page to get all possible IDs
            const selectedPage = this.pages.find(p => p.id === this.selectedPageId);
            const pageIdsToMatch = selectedPage
                ? [selectedPage.id, selectedPage.fb_page_id, selectedPage.page_id].filter(Boolean)
                : [this.selectedPageId];

            filtered = filtered.filter(conv =>
                pageIdsToMatch.includes(conv.page_id)
            );
        }

        // Local filtering by search query (for additional client-side filter)
        // Skip if we already have API search results
        if (this.searchQuery && this.searchResults === null) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(conv => {
                const customer = conv.customers?.[0] || {};
                const name = (conv.from?.name || customer.name || '').toLowerCase();
                const phone = (customer.phone || customer.phone_number || '').toLowerCase();
                const snippet = (conv.snippet || '').toLowerCase();
                const fbId = (customer.fb_id || conv.from?.id || '').toLowerCase();
                return name.includes(query) || snippet.includes(query) || phone.includes(query) || fbId.includes(query);
            });
        }

        // Filter by type
        if (this.filterType === 'tpos-saved') {
            // Debug: Log saved IDs and first few conversations
            console.log('[TPOS-SAVED-FILTER] Saved IDs:', Array.from(this.tposSavedCustomerIds));
            console.log('[TPOS-SAVED-FILTER] Total conversations before filter:', filtered.length);
            if (filtered.length > 0) {
                console.log('[TPOS-SAVED-FILTER] Sample conv[0] IDs:', {
                    'from.id': filtered[0].from?.id,
                    'from_psid': filtered[0].from_psid,
                    'customer.psid': filtered[0].customers?.[0]?.psid,
                    'customer.id': filtered[0].customers?.[0]?.id
                });
            }

            // Filter by saved customer IDs - check ALL possible ID fields
            filtered = filtered.filter(conv => {
                const customer = conv.customers?.[0] || {};
                // Check all possible ID fields - any match = include
                const possibleIds = [
                    conv.from?.id,
                    conv.from_psid,
                    customer.psid,
                    customer.id
                ].filter(Boolean);
                return possibleIds.some(id => this.tposSavedCustomerIds.has(id));
            });
            console.log('[TPOS-SAVED-FILTER] After filter:', filtered.length, 'conversations match');
        } else if (this.filterType === 'inbox') {
            filtered = filtered.filter(conv => conv.type === 'INBOX');
        } else if (this.filterType === 'comment') {
            filtered = filtered.filter(conv => conv.type === 'COMMENT');
        }

        if (filtered.length === 0) {
            const selectedPage = this.pages.find(p => p.id === this.selectedPageId);
            const pageName = selectedPage?.name || 'page này';
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="inbox"></i>
                    <h3>Không có hội thoại</h3>
                    <p>Không tìm thấy hội thoại nào ${this.selectedPageId ? `trong ${pageName}` : ''}</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = filtered.map(conv => this.renderConversationItem(conv)).join('');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderConversationItem(conv) {
        const name = conv.from?.name || conv.customers?.[0]?.name || 'Unknown';
        const avatar = this.getAvatarHtml(conv);
        const preview = conv.snippet || conv.last_message?.text || '';
        const time = this.formatTime(conv.updated_at);
        const unreadCount = conv.unread_count || 0;
        const isUnread = unreadCount > 0;
        const isActive = this.activeConversation?.id === conv.id;
        const tags = this.getTagsHtml(conv);

        // Conversation type: INBOX, COMMENT, LIVESTREAM
        const convType = conv.type || 'INBOX';
        const isInbox = convType === 'INBOX';
        const isComment = convType === 'COMMENT';

        // Check if customer has phone number
        const customer = conv.customers?.[0] || conv.from || {};
        const hasPhone = customer.phone_numbers?.length > 0 ||
            customer.phone ||
            conv.recent_phone_numbers?.length > 0 ||
            conv.has_phone === true;

        // Get debt from cache
        const phone = this.getPhoneFromConversation(conv);
        const debt = phone ? this.getDebtCache(phone) : null;
        // Respect debt display settings
        const hasDebt = this.showDebt && (
            (debt && debt > 0) || // Has positive debt
            (this.showZeroDebt && debt !== null && debt !== undefined) // Show zero debt if enabled
        );
        const debtDisplay = hasDebt ? this.formatDebt(debt) : '';

        return `
            <div class="pk-conversation-item ${isActive ? 'active' : ''}" data-conv-id="${conv.id}" data-page-id="${conv.page_id}">
                <div class="pk-avatar">
                    ${avatar}
                    ${unreadCount > 0 ? `<span class="pk-unread-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
                </div>
                <div class="pk-conversation-content">
                    <div class="pk-conversation-header">
                        <span class="pk-conversation-name">${this.escapeHtml(name)}</span>
                        <span class="pk-conversation-time">${time}</span>
                    </div>
                    <div class="pk-conversation-preview ${isUnread ? 'unread' : ''}">${this.escapeHtml(this.parseMessageHtml(preview))}</div>
                    <div class="pk-conversation-meta" style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                        ${tags ? `<div class="pk-tags-container" style="display: inline-flex;">${tags}</div>` : ''}
                        ${hasDebt ? `<span class="pk-debt-badge" style="padding: 2px 6px; background: #fef2f2; color: #dc2626; border-radius: 4px; font-size: 10px; font-weight: 600;">Nợ: ${debtDisplay}</span>` : ''}
                    </div>
                </div>
                <div class="pk-conversation-actions">
                    <div class="pk-action-icons">
                        <!-- Phone indicator - only show if has phone -->
                        ${hasPhone ? `
                        <span class="pk-icon-indicator has-phone" title="Có SĐT">
                            <i data-lucide="phone"></i>
                        </span>
                        ` : ''}
                        <!-- Conversation type indicator -->
                        <span class="pk-icon-indicator ${isInbox ? 'inbox' : 'comment'}" title="${isInbox ? 'Tin nhắn' : 'Bình luận'}">
                            <i data-lucide="${isInbox ? 'message-circle' : 'message-square'}"></i>
                        </span>
                        <!-- Remove from Tpos saved button - only show in tpos-saved filter -->
                        ${this.filterType === 'tpos-saved' ? `
                        <button class="pk-remove-tpos-btn" title="Xóa khỏi Lưu Tpos" onclick="event.stopPropagation(); window.pancakeChatManager.removeFromTposSaved('${conv.from?.id || conv.from_psid || customer.psid || customer.id || ''}')">
                            <i data-lucide="minus"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>

            </div>
        `;
    }


    renderChatWindow(conv) {
        const chatWindow = document.getElementById('pkChatWindow');
        if (!chatWindow) return;

        const name = conv.from?.name || conv.customers?.[0]?.name || 'Unknown';
        const avatar = this.getAvatarHtml(conv, 'chat');
        const location = conv.customers?.[0]?.address?.province || '';
        const status = this.getChatStatus(conv);

        // Check if this is a comment conversation (for Private Reply button)
        const isComment = conv.type === 'COMMENT' || /^\d+_\d+$/.test(conv.id);
        const commentId = isComment ? (conv.id.includes('_') ? conv.id.split('_')[1] : conv.id) : null;
        const privateReplyStatus = commentId ? window.pancakeDataManager?.getPrivateReplyStatus(commentId) : null;

        chatWindow.innerHTML = `
            <!-- Chat Header -->
            <div class="pk-chat-header">
                <div class="pk-chat-header-left">
                    ${avatar}
                    <div class="pk-chat-info">
                        <div class="pk-chat-name">
                            <span>${this.escapeHtml(name)}</span>
                            ${location ? `<span class="pk-location-badge"><i data-lucide="map-pin"></i> ${this.escapeHtml(location)}</span>` : ''}
                        </div>
                        <div class="pk-chat-status">${this.escapeHtml(status)}</div>
                    </div>
                </div>
                <div class="pk-chat-header-right">
                    ${isComment && this.serverMode === 'n2store' ? `
                    <button class="pk-header-btn pk-private-reply-btn ${privateReplyStatus ? 'replied' : ''}"
                            id="pkPrivateReplyBtn"
                            title="${privateReplyStatus ? 'Đã gửi Private Reply' : 'Gửi tin nhắn riêng (Private Reply)'}"
                            data-comment-id="${commentId}"
                            ${privateReplyStatus ? 'disabled' : ''}>
                        <i data-lucide="mail"></i>
                        <span class="pk-btn-label">${privateReplyStatus ? 'Đã gửi' : 'Private Reply'}</span>
                    </button>
                    ` : ''}
                    <button class="pk-header-btn" title="Liên kết">
                        <i data-lucide="link"></i>
                    </button>
                    <button class="pk-header-btn" title="Lịch sử">
                        <i data-lucide="history"></i>
                    </button>
                    <button class="pk-header-btn" title="Thêm thành viên">
                        <i data-lucide="user-plus"></i>
                    </button>
                    <button class="pk-header-btn" title="In">
                        <i data-lucide="printer"></i>
                    </button>
                </div>
            </div>

            <!-- Customer Stats Bar (below header, like Pancake.vn) -->
            ${this.renderCustomerStatsBar(conv)}

            <!-- Chat Messages -->
            <div class="pk-chat-messages" id="pkChatMessages">
                <div class="pk-loading">
                    <div class="pk-loading-spinner"></div>
                </div>
            </div>

            <!-- Scroll to Bottom Button -->
            <button class="pk-scroll-to-bottom" id="pkScrollToBottom" title="Cuộn xuống tin nhắn mới nhất">
                <i data-lucide="chevron-down"></i>
                <span class="pk-new-msg-badge" id="pkNewMsgBadge">0</span>
            </button>

            <!-- Quick Reply Bar -->
            <div class="pk-quick-reply-bar" id="pkQuickReplyBar">
                ${this.renderQuickReplies()}
            </div>

            <!-- Reply From Label -->
            <div class="pk-reply-from">
                <i data-lucide="reply"></i>
                <span>Trả lời từ <strong>NhiJudy Store</strong></span>
            </div>

            <!-- Chat Input -->
            <div class="pk-chat-input-container">
                <div class="pk-input-actions">
                    <button class="pk-input-btn" title="Đính kèm">
                        <i data-lucide="paperclip"></i>
                    </button>
                    <button class="pk-input-btn" id="pkImageBtn" title="Hình ảnh">
                        <i data-lucide="image"></i>
                    </button>
                    <input type="file" id="pkImageInput" accept="image/*" style="display: none;">
                    <button class="pk-input-btn" id="pkEmojiBtn" title="Emoji">
                        <i data-lucide="smile"></i>
                    </button>
                </div>
                <!-- Emoji Picker Popup -->
                <div id="pkEmojiPicker" class="pk-emoji-picker" style="display: none;">
                    <div class="pk-emoji-categories">
                        <button class="pk-emoji-cat active" data-category="recent" title="Gần đây">🕐</button>
                        <button class="pk-emoji-cat" data-category="smileys" title="Mặt cười">😊</button>
                        <button class="pk-emoji-cat" data-category="gestures" title="Cử chỉ">👋</button>
                        <button class="pk-emoji-cat" data-category="hearts" title="Trái tim">❤️</button>
                        <button class="pk-emoji-cat" data-category="animals" title="Động vật">🐱</button>
                        <button class="pk-emoji-cat" data-category="food" title="Đồ ăn">🍔</button>
                        <button class="pk-emoji-cat" data-category="objects" title="Đồ vật">💡</button>
                    </div>
                    <div class="pk-emoji-grid" id="pkEmojiGrid"></div>
                </div>
                <div class="pk-chat-input-wrapper">
                    <div id="pkImagePreview" class="pk-image-preview" style="display: none;">
                        <img id="pkPreviewImg" src="">
                        <button class="pk-preview-remove" id="pkRemovePreview">×</button>
                    </div>
                    <textarea id="pkChatInput" class="pk-chat-input" placeholder="Nhập tin nhắn..." rows="1"></textarea>
                </div>
                <button class="pk-send-btn" id="pkSendBtn" title="Gửi">
                    <i data-lucide="send"></i>
                </button>
            </div>
        `;


        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Load messages
        this.loadMessages(conv);

        // Bind chat input events
        this.bindChatInputEvents();

        // Bind scroll events for scroll-to-bottom button
        this.bindScrollEvents();
    }

    renderCustomerStatsBar(conv) {
        // Get customer stats from conversation data
        const customer = conv.customers?.[0] || conv.from || {};

        // Phone number - ensure it's a string
        let phoneNumber = customer.phone_numbers?.[0] || customer.phone || conv.recent_phone_numbers?.[0] || '';
        if (typeof phoneNumber !== 'string') phoneNumber = '';
        const hasPhone = !!phoneNumber;

        // Ad ID from ad_clicks array or conversation - ensure it's a string
        let adId = conv.ad_clicks?.[0] || customer.ad_id || '';
        if (typeof adId === 'object') adId = adId?.id || adId?.ad_id || '';
        if (typeof adId !== 'string') adId = String(adId || '');
        const hasAdId = !!adId;

        // Comment count - from customer or conversation data
        const commentCount = customer.comment_count || conv.comment_count || 0;

        // Last comment time (if available)
        const lastCommentTime = customer.last_comment_at || '';

        // Order stats - may come from customer data if available
        const successOrders = customer.success_order_count || customer.order_count || 0;
        const returnedOrders = customer.returned_order_count || customer.cancel_count || 0;

        // Calculate success rate
        const totalOrders = successOrders + returnedOrders;
        const successRate = totalOrders > 0 ? Math.round((successOrders / totalOrders) * 100) : 0;
        const returnRate = totalOrders > 0 ? Math.round((returnedOrders / totalOrders) * 100) : 0;

        // Warning if return rate is high (>30%)
        const isWarning = returnRate > 30;

        // Build phone+ad badge
        let phoneBadge = '';
        if (hasPhone || hasAdId) {
            const displayText = hasAdId ? `Ad ${adId.slice(0, 16)}${adId.length > 16 ? '...' : ''}` : phoneNumber;
            const fullText = hasAdId ? adId : phoneNumber;
            phoneBadge = `
                <span class="pk-phone-ad-badge ${hasPhone ? 'has-phone' : ''}" 
                      data-copy="${this.escapeHtml(fullText)}" 
                      title="Click để copy: ${this.escapeHtml(fullText)}">
                    <i data-lucide="phone" class="pk-phone-icon"></i>
                    <span class="pk-badge-text">${this.escapeHtml(displayText)}</span>
                </span>
            `;
        }

        // Build comment tooltip
        const commentTooltip = lastCommentTime
            ? `Khách hàng này đã bình luận trên trang ${commentCount} lần. Lần cuối vào ${this.formatMessageTime(lastCommentTime)}`
            : `Khách hàng này đã bình luận trên trang ${commentCount} lần`;

        // Build order tooltip
        const orderTooltip = returnedOrders > 0
            ? `Khách hàng này có ${successOrders} đơn hàng thành công, ${returnedOrders} đơn hoàn, tỉ lệ đơn thành công ${successRate}%`
            : `Khách hàng này có ${successOrders} đơn hàng thành công`;

        return `
            <div class="pk-customer-stats-bar">
                <div class="pk-stats-left">
                    ${phoneBadge}
                </div>
                <div class="pk-stats-right">
                    <span class="pk-stat-badge comment" title="${commentTooltip}">
                        <i data-lucide="message-square"></i>
                        <span>${commentCount}</span>
                    </span>
                    <span class="pk-stat-badge success" title="${orderTooltip}">
                        <i data-lucide="check-circle"></i>
                        <span>${successOrders}</span>
                    </span>
                    <span class="pk-stat-badge return" title="Đơn hoàn: ${returnedOrders}">
                        <i data-lucide="undo-2"></i>
                        <span>${returnedOrders}</span>
                    </span>
                    ${isWarning ? `
                        <span class="pk-stat-badge warning" title="Cảnh báo: Tỉ lệ hoàn hàng cao (${returnRate}%)">
                            <i data-lucide="alert-triangle"></i>
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderQuickReplies() {
        // Row 1
        const row1 = this.quickReplies.slice(0, 7);
        // Row 2
        const row2 = this.quickReplies.slice(7);

        return `
            <div class="pk-quick-reply-row">
                ${row1.map(qr => `
                    <button class="pk-quick-reply-btn ${qr.color}" data-template="${this.escapeHtml(qr.template)}">${this.escapeHtml(qr.label)}</button>
                `).join('')}
            </div>
            <div class="pk-quick-reply-row">
                ${row2.map(qr => `
                    <button class="pk-quick-reply-btn ${qr.color}" data-template="${this.escapeHtml(qr.template)}">${this.escapeHtml(qr.label)}</button>
                `).join('')}
            </div>
        `;
    }

    renderMessages() {
        const container = document.getElementById('pkChatMessages');
        if (!container) return;

        if (this.messages.length === 0) {
            container.innerHTML = `
                <div class="pk-empty-state">
                    <i data-lucide="message-circle"></i>
                    <h3>Chưa có tin nhắn</h3>
                    <p>Bắt đầu cuộc trò chuyện bằng cách gửi tin nhắn</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Sort messages by timestamp (oldest first) before grouping
        const sortedMessages = [...this.messages].sort((a, b) => {
            const timeA = new Date(a.inserted_at || a.created_time || 0).getTime();
            const timeB = new Date(b.inserted_at || b.created_time || 0).getTime();
            return timeA - timeB; // Oldest first
        });

        // Group messages by date
        const groupedMessages = this.groupMessagesByDate(sortedMessages);

        let html = '';
        for (const [date, msgs] of Object.entries(groupedMessages)) {
            html += `
                <div class="pk-date-separator">
                    <span>${date}</span>
                </div>
            `;
            html += msgs.map(msg => this.renderMessage(msg)).join('');
        }

        container.innerHTML = html;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Only auto-scroll if user is at/near bottom, otherwise show notification
        if (this.isScrolledToBottom) {
            container.scrollTop = container.scrollHeight;
        } else {
            // User is scrolled up, increment new message count
            this.newMessageCount++;
            this.updateScrollButtonBadge();
        }
    }

    renderMessage(msg) {
        const isOutgoing = msg.from?.id === this.activeConversation?.page_id;
        const text = msg.message || msg.text || '';
        const time = this.formatMessageTime(msg.inserted_at || msg.created_time);
        const sender = isOutgoing ? this.getSenderName(msg) : '';
        const attachments = msg.attachments || [];

        // Filter out reactions from attachments (they're displayed separately)
        const reactions = attachments.filter(att => att.type === 'reaction');
        const mediaAttachments = attachments.filter(att => att.type !== 'reaction');

        let attachmentHtml = '';
        if (mediaAttachments.length > 0) {
            attachmentHtml = mediaAttachments.map(att => {
                // ========== IMAGE ==========
                if (att.type === 'image' || att.type === 'photo' || att.mime_type?.startsWith('image/')) {
                    const imgUrl = att.url || att.file_url || att.preview_url || att.image_data?.url;
                    if (imgUrl) {
                        return `
                            <div class="pk-message-image">
                                <img src="${imgUrl}" alt="Image" onclick="window.open('${imgUrl}', '_blank')" loading="lazy">
                            </div>
                        `;
                    }
                }

                // ========== STICKER ==========
                if (att.type === 'sticker' || att.sticker_id) {
                    const stickerUrl = att.url || att.file_url || att.preview_url;
                    if (stickerUrl) {
                        return `
                            <div class="pk-message-sticker">
                                <img src="${stickerUrl}" alt="Sticker" loading="lazy">
                            </div>
                        `;
                    }
                }

                // ========== ANIMATED STICKER / GIF ==========
                if (att.type === 'animated_image_url' || att.type === 'animated_image_share') {
                    const gifUrl = att.url || att.file_url;
                    if (gifUrl) {
                        return `
                            <div class="pk-message-sticker">
                                <img src="${gifUrl}" alt="GIF" loading="lazy">
                            </div>
                        `;
                    }
                }

                // ========== VIDEO ==========
                if (att.type === 'video' || att.mime_type?.startsWith('video/')) {
                    const videoUrl = att.url || att.file_url;
                    if (videoUrl) {
                        return `
                            <div class="pk-message-video">
                                <video controls src="${videoUrl}" preload="metadata">
                                    Trình duyệt không hỗ trợ video.
                                </video>
                            </div>
                        `;
                    }
                }

                // ========== AUDIO / VOICE ==========
                if (att.type === 'audio' || att.mime_type?.startsWith('audio/')) {
                    const audioUrl = att.url || att.file_url;
                    if (audioUrl) {
                        return `
                            <div class="pk-message-audio">
                                <audio controls src="${audioUrl}" preload="metadata">
                                    Trình duyệt không hỗ trợ audio.
                                </audio>
                            </div>
                        `;
                    }
                }

                // ========== FILE / DOCUMENT ==========
                if (att.type === 'file' || att.type === 'document') {
                    const fileUrl = att.url || att.file_url;
                    const fileName = att.name || att.filename || 'Tệp đính kèm';
                    if (fileUrl) {
                        return `
                            <div class="pk-message-file">
                                <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">
                                    <i data-lucide="file-text"></i>
                                    <span>${this.escapeHtml(fileName)}</span>
                                </a>
                            </div>
                        `;
                    }
                }

                // ========== LIKE/THUMBS UP (Facebook's big like button) ==========
                if (att.type === 'like' || att.type === 'thumbsup') {
                    return `
                        <div class="pk-message-like">
                            <span class="pk-like-icon">👍</span>
                        </div>
                    `;
                }

                return '';
            }).join('');
        }

        // Reactions HTML (displayed as badge on message)
        let reactionsHtml = '';
        if (reactions.length > 0) {
            const reactionEmojis = reactions.map(r => r.emoji || '❤️').join('');
            reactionsHtml = `<span class="pk-message-reactions">${reactionEmojis}</span>`;
        }

        return `
            <div class="pk-message ${isOutgoing ? 'outgoing' : 'incoming'}">
                ${attachmentHtml}
                ${text ? `
                    <div class="pk-message-bubble">
                        <div class="pk-message-text">${this.escapeHtml(this.parseMessageHtml(text))}</div>
                        ${reactionsHtml}
                    </div>
                ` : (reactionsHtml ? `<div class="pk-message-bubble">${reactionsHtml}</div>` : '')}
                <div class="pk-message-meta">
                    <span class="pk-message-time">${time}</span>
                    ${sender ? `<span class="pk-message-sender">${this.escapeHtml(sender)}</span>` : ''}
                    ${isOutgoing ? `
                        <span class="pk-message-status">
                            <i data-lucide="check-check"></i>
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }


    // =====================================================
    // REALTIME UPDATE (Like Messenger/Zalo/Telegram)
    // =====================================================

    /**
     * Handle realtime conversation update - updates UI in-place without reload
     * Like Messenger/Zalo - moves conversation to top and updates preview
     */
    handleRealtimeConversationUpdate(updatedConv) {
        if (!updatedConv) return;

        console.log('[PANCAKE-CHAT] 📨 Realtime update for conversation:', updatedConv.id);

        // Find existing conversation in our list
        const existingIndex = this.conversations.findIndex(c =>
            c.id === updatedConv.id ||
            c.id === updatedConv.conversation?.id
        );

        const convData = updatedConv.conversation || updatedConv;
        const convId = convData.id || updatedConv.id;

        // Check if this is the currently active conversation
        const isActiveConversation = this.activeConversation &&
            (this.activeConversation.id === convId ||
                this.activeConversation.id === updatedConv.id);

        if (existingIndex !== -1) {
            // Update existing conversation data
            const existingConv = this.conversations[existingIndex];

            // Merge updates (keep existing data, override with new)
            // Don't increment unread if this is the active conversation
            Object.assign(existingConv, {
                snippet: convData.snippet || existingConv.snippet,
                updated_at: convData.updated_at || new Date().toISOString(),
                unread_count: isActiveConversation ? 0 : (existingConv.unread_count || 0) + 1,
                last_message: convData.last_message || existingConv.last_message
            });

            // Move to top of list (like Messenger)
            this.conversations.splice(existingIndex, 1);
            this.conversations.unshift(existingConv);

            console.log('[PANCAKE-CHAT] ✅ Conversation moved to top');

            // Update DOM in-place (no loading spinner!)
            this.updateConversationInDOM(existingConv);
        } else {
            // New conversation - add to top
            const newConv = {
                id: convData.id,
                page_id: convData.page_id || updatedConv.page_id,
                snippet: convData.snippet || '',
                updated_at: convData.updated_at || new Date().toISOString(),
                unread_count: 1,
                from: convData.from || convData.customers?.[0] || {},
                customers: convData.customers || [],
                type: convData.type || 'INBOX',
                ...convData
            };

            this.conversations.unshift(newConv);
            console.log('[PANCAKE-CHAT] ✅ New conversation added to top');

            // Re-render just the conversation list (fast, no API call)
            this.renderConversationList();
        }

        // If this is the active conversation, fetch and display new messages
        if (isActiveConversation) {
            console.log('[PANCAKE-CHAT] 🔄 Active conversation updated - fetching new messages...');
            this.fetchNewMessagesForActiveConversation();
        } else {
            // Play notification sound or show visual indicator only for non-active conversations
            this.showNewMessageIndicator();
        }
    }

    /**
     * Fetch only new messages for the active conversation (realtime update)
     * This is called when a realtime update is received for the currently open conversation
     */
    async fetchNewMessagesForActiveConversation() {
        if (!this.activeConversation || !window.pancakeDataManager) return;

        try {
            const pageId = this.activeConversation.page_id;
            const convId = this.activeConversation.id;
            const customerId = this.activeConversation.customers?.[0]?.id || null;

            // Fetch messages (will get latest including new ones)
            const result = await window.pancakeDataManager.fetchMessagesForConversation(
                pageId,
                convId,
                0, // Start from 0 to get latest messages
                customerId
            );

            if (result && result.messages) {
                // Get current message IDs
                const existingIds = new Set(this.messages.map(m => m.id));

                // Find new messages (not already in our list)
                const newMessages = result.messages.filter(m => !existingIds.has(m.id) && !m._temp);

                if (newMessages.length > 0) {
                    console.log(`[PANCAKE-CHAT] 📥 Found ${newMessages.length} new message(s)`);

                    // Add new messages to the end
                    this.messages.push(...newMessages);

                    // Re-render messages
                    this.renderMessages();

                    // Scroll to bottom to show new message
                    this.scrollToBottom();

                    // Mark as read since user is viewing
                    window.pancakeDataManager.markConversationAsRead(pageId, convId);
                }
            }
        } catch (error) {
            console.error('[PANCAKE-CHAT] Error fetching new messages:', error);
        }
    }

    /**
     * Update a single conversation item in DOM without re-rendering everything
     */
    updateConversationInDOM(conv) {
        const container = document.getElementById('pkConversations');
        if (!container) return;

        // Find the existing DOM element
        const existingElement = container.querySelector(`[data-conv-id="${conv.id}"]`);

        if (existingElement) {
            // Update the content of existing element
            const previewEl = existingElement.querySelector('.pk-conversation-preview');
            const timeEl = existingElement.querySelector('.pk-conversation-time');
            const badgeEl = existingElement.querySelector('.pk-unread-badge');
            const avatarContainer = existingElement.querySelector('.pk-avatar');

            if (previewEl) {
                previewEl.textContent = conv.snippet || '';
                previewEl.classList.add('unread');
            }
            if (timeEl) {
                timeEl.textContent = this.formatTime(conv.updated_at);
            }

            // Update or add unread badge
            if (conv.unread_count > 0) {
                if (badgeEl) {
                    badgeEl.textContent = conv.unread_count > 9 ? '9+' : conv.unread_count;
                } else if (avatarContainer) {
                    const newBadge = document.createElement('span');
                    newBadge.className = 'pk-unread-badge';
                    newBadge.textContent = conv.unread_count > 9 ? '9+' : conv.unread_count;
                    avatarContainer.appendChild(newBadge);
                }
            }

            // Move element to top of list
            if (container.firstChild !== existingElement) {
                container.insertBefore(existingElement, container.firstChild);

                // Add animation for visual feedback
                existingElement.classList.add('pk-conv-updated');
                setTimeout(() => existingElement.classList.remove('pk-conv-updated'), 1000);
            }
        } else {
            // Element not in DOM, re-render list
            this.renderConversationList();
        }
    }

    /**
     * Show visual indicator for new message
     */
    showNewMessageIndicator() {
        // Flash the title or show notification
        if (document.hidden) {
            // Page is in background, maybe flash title
            const originalTitle = document.title;
            document.title = '💬 Tin nhắn mới!';
            setTimeout(() => {
                document.title = originalTitle;
            }, 3000);
        }

        // Play sound (optional - uncomment if you have audio file)
        // const audio = new Audio('/notification.mp3');
        // audio.volume = 0.3;
        // audio.play().catch(() => {});
    }

    // =====================================================
    // PAGE SELECTOR METHODS
    // =====================================================

    async loadPages() {
        if (!window.pancakeDataManager) {
            console.warn('[PANCAKE-CHAT] PancakeDataManager not available for loading pages');
            return;
        }

        try {
            console.log('[PANCAKE-CHAT] Loading pages...');

            // Fetch pages list
            this.pages = await window.pancakeDataManager.fetchPages(false) || [];
            console.log('[PANCAKE-CHAT] Loaded pages:', this.pages.length);

            // Fetch unread counts
            this.pagesWithUnread = await window.pancakeDataManager.fetchPagesWithUnreadCount() || [];
            console.log('[PANCAKE-CHAT] Loaded pages with unread:', this.pagesWithUnread.length);

            // Load saved page selection from localStorage
            this.loadSelectedPage();

            // Render page list dropdown
            this.renderPageDropdown();

            // Update selected page display
            this.updateSelectedPageDisplay();

        } catch (error) {
            console.error('[PANCAKE-CHAT] Error loading pages:', error);
        }
    }

    renderPageDropdown() {
        const container = document.getElementById('pkPageList');
        if (!container) return;

        // Calculate total unread
        const totalUnread = this.pagesWithUnread.reduce((sum, p) => sum + (p.unread_conv_count || 0), 0);

        let html = `
            <!-- All Pages Option -->
            <div class="pk-page-item all-pages ${!this.selectedPageId ? 'active' : ''}" data-page-id="">
                <div class="pk-all-pages-icon">
                    <i data-lucide="layout-grid"></i>
                </div>
                <div class="pk-page-info">
                    <div class="pk-page-name">Tất cả Pages</div>
                    <div class="pk-page-hint">${this.pages.length} pages</div>
                </div>
                ${totalUnread > 0 ? `<span class="pk-page-unread-badge">${totalUnread}</span>` : ''}
            </div>
        `;

        // Render each page
        for (const page of this.pages) {
            const pageId = page.id;
            const pageName = page.name || page.page_name || 'Page';
            const isActive = this.selectedPageId === pageId;

            // Find unread count for this page
            const pageUnread = this.pagesWithUnread.find(p =>
                p.page_id === pageId ||
                p.page_id === page.fb_page_id ||
                p.page_id === page.page_id
            );
            const unreadCount = pageUnread?.unread_conv_count || 0;

            // Get avatar
            const avatarUrl = page.avatar || page.picture?.data?.url || null;
            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" class="pk-page-avatar" alt="${this.escapeHtml(pageName)}">`
                : `<div class="pk-page-avatar-placeholder">${pageName.charAt(0).toUpperCase()}</div>`;

            html += `
                <div class="pk-page-item ${isActive ? 'active' : ''}" data-page-id="${pageId}">
                    ${avatarHtml}
                    <div class="pk-page-info">
                        <div class="pk-page-name">${this.escapeHtml(pageName)}</div>
                        <div class="pk-page-hint">ID: ${page.fb_page_id || pageId}</div>
                    </div>
                    ${unreadCount > 0 ? `<span class="pk-page-unread-badge">${unreadCount}</span>` : ''}
                </div>
            `;
        }

        container.innerHTML = html;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    updateSelectedPageDisplay() {
        const nameEl = document.getElementById('pkSelectedPageName');
        const hintEl = document.getElementById('pkSelectedPageHint');
        const avatarEl = document.getElementById('pkSelectedPageAvatar');
        const badgeEl = document.getElementById('pkTotalUnreadBadge');

        if (!nameEl) return;

        if (this.selectedPageId) {
            // Find selected page
            const page = this.pages.find(p => p.id === this.selectedPageId);
            if (page) {
                nameEl.textContent = page.name || page.page_name || 'Page';
                hintEl.textContent = `ID: ${page.fb_page_id || page.id}`;

                // Update avatar
                const avatarUrl = page.avatar || page.picture?.data?.url || null;
                if (avatarUrl) {
                    avatarEl.innerHTML = `<img src="${avatarUrl}" class="pk-page-avatar" style="width: 32px; height: 32px;" alt="">`;
                } else {
                    avatarEl.innerHTML = (page.name || 'P').charAt(0).toUpperCase();
                    avatarEl.className = 'pk-page-avatar-placeholder';
                }

                // Update unread badge
                const pageUnread = this.pagesWithUnread.find(p =>
                    p.page_id === this.selectedPageId ||
                    p.page_id === page.fb_page_id
                );
                const unreadCount = pageUnread?.unread_conv_count || 0;
                if (unreadCount > 0) {
                    badgeEl.textContent = unreadCount;
                    badgeEl.style.display = 'flex';
                } else {
                    badgeEl.style.display = 'none';
                }
            }
        } else {
            // All pages selected
            nameEl.textContent = 'Tất cả Pages';
            hintEl.textContent = `${this.pages.length} pages`;
            avatarEl.innerHTML = '<i data-lucide="layout-grid"></i>';
            avatarEl.className = 'pk-page-avatar-placeholder';

            // Show total unread
            const totalUnread = this.pagesWithUnread.reduce((sum, p) => sum + (p.unread_conv_count || 0), 0);
            if (totalUnread > 0) {
                badgeEl.textContent = totalUnread;
                badgeEl.style.display = 'flex';
            } else {
                badgeEl.style.display = 'none';
            }

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    selectPage(pageId) {
        console.log('[PANCAKE-CHAT] Selecting page:', pageId || 'ALL');

        this.selectedPageId = pageId || null;
        this.isPageDropdownOpen = false;

        // Save to localStorage
        this.saveSelectedPage();

        // Update UI
        this.updateSelectedPageDisplay();
        this.renderPageDropdown();

        // Hide dropdown
        const dropdown = document.getElementById('pkPageDropdown');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
        const btn = document.getElementById('pkPageSelectorBtn');
        if (btn) {
            btn.classList.remove('active');
        }

        // Re-render conversation list with filter
        this.renderConversationList();
    }

    togglePageDropdown() {
        console.log('[PANCAKE-CHAT] togglePageDropdown called, current state:', this.isPageDropdownOpen);
        this.isPageDropdownOpen = !this.isPageDropdownOpen;

        const dropdown = document.getElementById('pkPageDropdown');
        const btn = document.getElementById('pkPageSelectorBtn');

        console.log('[PANCAKE-CHAT] Dropdown element found:', !!dropdown, 'Button found:', !!btn);
        console.log('[PANCAKE-CHAT] New state:', this.isPageDropdownOpen);

        if (dropdown) {
            dropdown.classList.toggle('show', this.isPageDropdownOpen);
            console.log('[PANCAKE-CHAT] Dropdown classes:', dropdown.className);
        }
        if (btn) {
            btn.classList.toggle('active', this.isPageDropdownOpen);
        }
    }


    saveSelectedPage() {
        try {
            if (this.selectedPageId) {
                localStorage.setItem('pancake_selected_page', this.selectedPageId);
            } else {
                localStorage.removeItem('pancake_selected_page');
            }
        } catch (e) {
            console.warn('[PANCAKE-CHAT] Could not save selected page:', e);
        }
    }

    loadSelectedPage() {
        try {
            const savedPageId = localStorage.getItem('pancake_selected_page');
            if (savedPageId) {
                // Verify page still exists
                const pageExists = this.pages.some(p => p.id === savedPageId);
                if (pageExists) {
                    this.selectedPageId = savedPageId;
                    console.log('[PANCAKE-CHAT] Loaded saved page:', savedPageId);
                }
            }
        } catch (e) {
            console.warn('[PANCAKE-CHAT] Could not load selected page:', e);
        }
    }

    // =====================================================
    // DATA LOADING
    // =====================================================

    async loadConversations() {
        if (!window.pancakeDataManager) {
            console.error('[PANCAKE-CHAT] PancakeDataManager not available');
            return;
        }

        this.isLoading = true;
        this.renderLoadingState();

        try {
            // Conversations always from Pancake (N2Store mode only affects messages)
            const conversations = await window.pancakeDataManager.fetchConversations(true);
            this.conversations = conversations || [];
            console.log(`[PANCAKE-CHAT] Loaded ${this.conversations.length} conversations (messages mode: ${this.serverMode})`);

            // Render conversation list
            this.renderConversationList();

            // Load debt info for conversations (in background)
            this.loadDebtForConversations();

            // Pre-load page access tokens in background for faster message loading
            this.preloadPageAccessTokens();
        } catch (error) {
            console.error('[PANCAKE-CHAT] Error loading conversations:', error);
            this.renderErrorState('Không thể tải danh sách hội thoại');
        } finally {
            this.isLoading = false;
        }
    }

    // Pre-load page access tokens for all pages in conversations
    async preloadPageAccessTokens() {
        if (!window.pancakeTokenManager) return;

        try {
            // Get unique page IDs from conversations
            const pageIds = [...new Set(this.conversations.map(conv => conv.page_id).filter(Boolean))];
            console.log('[PANCAKE-CHAT] Pre-loading page access tokens for', pageIds.length, 'pages...');

            // Load tokens in parallel (don't await each one)
            const promises = pageIds.map(pageId =>
                window.pancakeTokenManager.getOrGeneratePageAccessToken(pageId)
                    .catch(err => console.warn(`[PANCAKE-CHAT] Failed to pre-load token for page ${pageId}:`, err))
            );

            // Wait for all with timeout
            await Promise.race([
                Promise.all(promises),
                new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
            ]);

            console.log('[PANCAKE-CHAT] Page access tokens pre-loaded');
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Pre-load page tokens failed:', error);
        }
    }

    async loadMessages(conv, forceRefresh = false) {
        if (!window.pancakeDataManager || !conv) return;

        const messagesContainer = document.getElementById('pkChatMessages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="pk-loading">
                    <div class="pk-loading-spinner"></div>
                    <p style="margin-top: 10px; color: #666;">Đang tải tin nhắn...</p>
                </div>
            `;
        }

        try {
            const pageId = conv.page_id;
            const convId = conv.id;
            const customerId = conv.customers?.[0]?.id || null;

            console.log(`[PANCAKE-CHAT] Loading messages (mode: ${this.serverMode}):`, { pageId, convId, customerId });

            // Create a timeout promise (10 seconds)
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout: Qua lau khong phan hoi')), 10000);
            });

            // Fetch based on server mode
            let fetchPromise;
            if (this.serverMode === 'n2store') {
                fetchPromise = window.pancakeDataManager.fetchMessagesN2Store(pageId, convId);
            } else {
                fetchPromise = window.pancakeDataManager.fetchMessagesForConversation(
                    pageId,
                    convId,
                    null,
                    customerId,
                    forceRefresh
                );
            }

            // Race between fetch and timeout
            const result = await Promise.race([fetchPromise, timeoutPromise]);

            this.messages = (result.messages || []).reverse(); // Reverse to show oldest first
            console.log('[PANCAKE-CHAT] Loaded messages:', this.messages.length, result.fromCache ? '(from cache)' : '(from API)');

            // Reset pagination state for new conversation
            this.messageCurrentCount = this.messages.length;
            this.hasMoreMessages = true;
            this.isLoadingMoreMessages = false;

            this.renderMessages();

            // Show indicator if from cache
            if (result.fromCache && messagesContainer) {
                // Refresh in background if from cache
                this.refreshMessagesInBackground(pageId, convId, customerId);
            }

            // Mark as read (don't await to not block UI)
            if (conv.unread_count > 0) {
                window.pancakeDataManager.markConversationAsRead(pageId, convId).then(() => {
                    conv.unread_count = 0;
                    conv.seen = true;
                    this.renderConversationList();
                }).catch(err => console.warn('[PANCAKE-CHAT] Could not mark as read:', err));
            }
        } catch (error) {
            console.error('[PANCAKE-CHAT] Error loading messages:', error);
            if (messagesContainer) {
                messagesContainer.innerHTML = `
                    <div class="pk-empty-state">
                        <i data-lucide="alert-circle"></i>
                        <h3>Lỗi tải tin nhắn</h3>
                        <p>${error.message || 'Không thể tải tin nhắn'}</p>
                        <button class="pk-retry-btn" onclick="window.pancakeChatManager.loadMessages(window.pancakeChatManager.activeConversation, true)" style="margin-top: 10px; padding: 8px 16px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Thử lại
                        </button>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }

    // Refresh messages in background after showing cached data
    async refreshMessagesInBackground(pageId, convId, customerId) {
        try {
            console.log('[PANCAKE-CHAT] Refreshing messages in background...');
            const result = await window.pancakeDataManager.fetchMessagesForConversation(
                pageId,
                convId,
                null,
                customerId,
                true // forceRefresh
            );

            // Only update if this is still the active conversation
            if (this.activeConversation?.id === convId) {
                const newMessages = (result.messages || []).reverse();
                // Only re-render if messages changed
                if (newMessages.length !== this.messages.length) {
                    console.log('[PANCAKE-CHAT] Background refresh: messages updated');
                    this.messages = newMessages;
                    this.renderMessages();
                }
            }
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Background refresh failed:', error.message);
        }
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    bindEvents() {
        // Header Tabs
        const headerTabs = document.querySelectorAll('.pk-header-tab');
        headerTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Page Selector Button
        const pageSelectorBtn = document.getElementById('pkPageSelectorBtn');
        console.log('[PANCAKE-CHAT] Page Selector Button found:', !!pageSelectorBtn);
        if (pageSelectorBtn) {
            pageSelectorBtn.addEventListener('click', (e) => {
                console.log('[PANCAKE-CHAT] Page Selector Button clicked!');
                e.stopPropagation();
                this.togglePageDropdown();
            });
            // Backup: add onclick attribute
            pageSelectorBtn.onclick = (e) => {
                console.log('[PANCAKE-CHAT] Page Selector Button onclick!');
                e.stopPropagation();
                this.togglePageDropdown();
            };
        } else {
            console.error('[PANCAKE-CHAT] Page Selector Button NOT FOUND!');
        }

        // Page Dropdown - Page Selection
        const pageList = document.getElementById('pkPageList');
        if (pageList) {
            pageList.addEventListener('click', (e) => {
                const pageItem = e.target.closest('.pk-page-item');
                if (pageItem) {
                    const pageId = pageItem.dataset.pageId;
                    this.selectPage(pageId);
                }
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('pkPageDropdown');
            const btn = document.getElementById('pkPageSelectorBtn');
            if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.classList.remove('show');
                btn.classList.remove('active');
                this.isPageDropdownOpen = false;
            }
        });

        // Filter Tabs
        const filterTabs = document.querySelectorAll('.pk-filter-tab');
        filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const filterType = e.target.dataset.filter;
                this.setFilterType(filterType);

                // Update active state
                filterTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // Search input with instant local search + debounced API search
        const searchInput = document.getElementById('pkSearchInput');
        if (searchInput) {
            let searchTimeout = null;

            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                this.searchQuery = query;

                // Clear previous timeout
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }

                // If empty, show all conversations
                if (!query) {
                    this.isSearching = false;
                    this.searchResults = null;
                    this.renderConversationList();
                    return;
                }

                // INSTANT: Local search first (no delay)
                this.searchResults = null; // Reset to use local filter
                this.renderConversationList(); // Will use local filter via searchQuery

                // DEBOUNCED: API search for more results (300ms)
                searchTimeout = setTimeout(async () => {
                    await this.performSearch(query);
                }, 300);
            });

            // Clear search on Escape key
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    this.searchQuery = '';
                    this.isSearching = false;
                    this.searchResults = null;
                    this.renderConversationList();
                }
            });
        }

        // Conversation click
        const conversationsContainer = document.getElementById('pkConversations');
        if (conversationsContainer) {
            conversationsContainer.addEventListener('click', (e) => {
                const convItem = e.target.closest('.pk-conversation-item');
                if (convItem) {
                    const convId = convItem.dataset.convId;
                    this.selectConversation(convId);
                }
            });

            // Infinite scroll for conversations
            conversationsContainer.addEventListener('scroll', () => {
                const threshold = 100; // pixels from bottom
                const isNearBottom = conversationsContainer.scrollHeight - conversationsContainer.scrollTop - conversationsContainer.clientHeight < threshold;

                if (isNearBottom &&
                    this.hasMoreConversations &&
                    !this.isLoadingMoreConversations &&
                    !this.searchResults && // Don't load more during search
                    this.conversations.length > 0) {
                    this.loadMoreConversations();
                }
            });

            // Right-click context menu
            conversationsContainer.addEventListener('contextmenu', (e) => {
                const convItem = e.target.closest('.pk-conversation-item');
                if (convItem) {
                    e.preventDefault();
                    const convId = convItem.dataset.convId;
                    const pageId = convItem.dataset.pageId;
                    this.showContextMenu(e.clientX, e.clientY, convId, pageId);
                }
            });
        }

        // Context menu actions
        const contextMenu = document.getElementById('pkContextMenu');
        if (contextMenu) {
            contextMenu.addEventListener('click', async (e) => {
                const menuItem = e.target.closest('.pk-context-menu-item');
                if (menuItem) {
                    const action = menuItem.dataset.action;
                    await this.handleContextMenuAction(action);
                    this.hideContextMenu();
                }
            });
        }

        // Hide context menu on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.pk-context-menu')) {
                this.hideContextMenu();
            }
        });

        // Listen for TPOS saved list updates
        window.addEventListener('tposSavedListUpdated', async () => {
            console.log('[PANCAKE-CHAT] TPOS saved list updated, refreshing...');
            // Reload saved IDs and re-render if on tpos-saved filter
            if (this.filterType === 'tpos-saved') {
                await this.loadTposSavedCustomerIds();
                this.renderConversationList();
            }
        });
    }

    /**
     * Show context menu at position
     */
    showContextMenu(x, y, convId, pageId) {
        this.contextMenuConvId = convId;
        this.contextMenuPageId = pageId;

        const menu = document.getElementById('pkContextMenu');
        if (menu) {
            menu.style.display = 'block';
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;

            // Show/hide "Xóa khỏi Lưu Tpos" option based on filter
            const tposSavedDivider = menu.querySelector('.pk-tpos-saved-divider');
            const tposSavedAction = menu.querySelector('.pk-tpos-saved-action');
            if (tposSavedDivider && tposSavedAction) {
                const showTposAction = this.filterType === 'tpos-saved';
                tposSavedDivider.style.display = showTposAction ? 'block' : 'none';
                tposSavedAction.style.display = showTposAction ? 'flex' : 'none';
            }

            // Initialize lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        const menu = document.getElementById('pkContextMenu');
        if (menu) {
            menu.style.display = 'none';
        }
        const tagsMenu = document.getElementById('pkTagsMenu');
        if (tagsMenu) {
            tagsMenu.style.display = 'none';
        }
    }

    /**
     * Handle context menu actions
     */
    async handleContextMenuAction(action) {
        const convId = this.contextMenuConvId;
        const pageId = this.contextMenuPageId;

        if (!convId || !pageId) return;

        try {
            if (action === 'mark-unread') {
                await window.pancakeDataManager.markConversationAsUnread(pageId, convId);
                // Update local state
                const conv = this.conversations.find(c => c.id === convId);
                if (conv) {
                    conv.seen = false;
                    conv.unread_count = conv.unread_count || 1;
                    this.renderConversationList();
                }
                console.log('[PANCAKE-CHAT] Marked as unread:', convId);
            } else if (action === 'mark-read') {
                await window.pancakeDataManager.markConversationAsRead(pageId, convId);
                // Update local state
                const conv = this.conversations.find(c => c.id === convId);
                if (conv) {
                    conv.seen = true;
                    conv.unread_count = 0;
                    this.renderConversationList();
                }
                console.log('[PANCAKE-CHAT] Marked as read:', convId);
            } else if (action === 'add-note') {
                // Prompt for note
                const note = prompt('Nhập ghi chú cho khách hàng:');
                if (note && note.trim()) {
                    const conv = this.conversations.find(c => c.id === convId);
                    const customerId = conv?.customers?.[0]?.id;
                    if (customerId) {
                        const success = await window.pancakeDataManager.addCustomerNote(pageId, customerId, note.trim());
                        if (success) {
                            alert('Đã thêm ghi chú thành công!');
                        } else {
                            alert('Lỗi thêm ghi chú');
                        }
                    } else {
                        alert('Không tìm thấy thông tin khách hàng');
                    }
                }
            } else if (action === 'manage-tags') {
                // Show tags submenu
                await this.showTagsSubmenu(pageId, convId);
                return; // Don't hide menu
            } else if (action === 'remove-tpos-saved') {
                // Remove from TPOS saved list - use from.id first
                const conv = this.conversations.find(c => c.id === convId);
                const customer = conv?.customers?.[0] || {};
                const customerId = conv?.from?.id || conv?.from_psid || customer.psid || customer.id;
                if (customerId) {
                    this.removeFromTposSaved(customerId);
                }
            }
        } catch (error) {
            console.error('[PANCAKE-CHAT] Context menu action error:', error);
        }
    }

    /**
     * Show tags submenu
     */
    async showTagsSubmenu(pageId, convId) {
        const tagsMenu = document.getElementById('pkTagsMenu');
        const tagsList = document.getElementById('pkTagsList');
        const contextMenu = document.getElementById('pkContextMenu');

        if (!tagsMenu || !tagsList || !contextMenu) return;

        // Position next to context menu
        const rect = contextMenu.getBoundingClientRect();
        tagsMenu.style.display = 'block';
        tagsMenu.style.left = `${rect.right + 5}px`;
        tagsMenu.style.top = `${rect.top}px`;

        // Show loading
        tagsList.innerHTML = '<div class="pk-loading-spinner" style="width: 20px; height: 20px; margin: 10px auto;"></div>';

        // Fetch tags
        const tags = await window.pancakeDataManager.fetchTags(pageId);

        // Get conversation's current tags
        const conv = this.conversations.find(c => c.id === convId);
        const convTags = conv?.tags || [];

        // Render tags
        if (tags.length === 0) {
            tagsList.innerHTML = '<div class="pk-no-tags">Không có nhãn</div>';
        } else {
            tagsList.innerHTML = tags.map(tag => {
                const isActive = convTags.includes(tag.id) || convTags.includes(String(tag.id));
                return `
                    <button class="pk-tag-item ${isActive ? 'active' : ''}" 
                            data-tag-id="${tag.id}" 
                            style="--tag-color: ${tag.color}">
                        <span class="pk-tag-dot" style="background: ${tag.color}"></span>
                        <span>${this.escapeHtml(tag.text)}</span>
                        ${isActive ? '<i data-lucide="check" style="width: 14px; height: 14px;"></i>' : ''}
                    </button>
                `;
            }).join('');

            // Add click handlers
            tagsList.querySelectorAll('.pk-tag-item').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const tagId = btn.dataset.tagId;
                    const isActive = btn.classList.contains('active');
                    const action = isActive ? 'remove' : 'add';

                    // Toggle tag
                    const success = await window.pancakeDataManager.addRemoveConversationTag(pageId, convId, tagId, action);
                    if (success) {
                        btn.classList.toggle('active');
                        // Update local conversation tags
                        if (conv) {
                            if (action === 'add') {
                                conv.tags = [...(conv.tags || []), tagId];
                            } else {
                                conv.tags = (conv.tags || []).filter(t => t !== tagId && t !== String(tagId));
                            }
                            this.renderConversationList();
                        }
                    }
                });
            });

            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    /**
     * Load more conversations (pagination)
     */
    async loadMoreConversations() {
        if (this.isLoadingMoreConversations || !this.hasMoreConversations) {
            return;
        }

        // Get last conversation ID for pagination
        const lastConv = this.conversations[this.conversations.length - 1];
        if (!lastConv) return;

        this.lastConversationId = lastConv.id;
        this.isLoadingMoreConversations = true;

        console.log('[PANCAKE-CHAT] Loading more conversations... lastId:', this.lastConversationId);

        // Show loading indicator at bottom
        const container = document.getElementById('pkConversations');
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'pk-load-more-indicator';
        loadingDiv.innerHTML = `
            <div class="pk-loading-spinner" style="width: 20px; height: 20px;"></div>
            <span>Đang tải thêm...</span>
        `;
        if (container) {
            container.appendChild(loadingDiv);
        }

        try {
            // Call the data manager to fetch more conversations
            const moreConversations = await window.pancakeDataManager.fetchMoreConversations(this.lastConversationId);

            loadingDiv.remove();

            if (!moreConversations || moreConversations.length === 0) {
                this.hasMoreConversations = false;
                console.log('[PANCAKE-CHAT] No more conversations');
            } else {
                console.log('[PANCAKE-CHAT] Loaded', moreConversations.length, 'more conversations');

                // Append to existing conversations
                this.conversations = [...this.conversations, ...moreConversations];

                // Re-render
                this.renderConversationList();
            }

        } catch (error) {
            console.error('[PANCAKE-CHAT] Error loading more conversations:', error);
            loadingDiv.remove();
        } finally {
            this.isLoadingMoreConversations = false;
        }
    }

    /**
     * Perform search using Pancake API
     * @param {string} query - Search query (name, phone, fb_id)
     */
    async performSearch(query) {
        if (!query || query.length < 2) {
            return;
        }

        console.log('[PANCAKE-CHAT] Searching for:', query);

        // Show loading state
        this.isSearching = true;
        const container = document.getElementById('pkConversations');
        if (container) {
            container.innerHTML = `
                <div class="pk-search-loading">
                    <div class="pk-loading-spinner"></div>
                    <span>Đang tìm kiếm "${this.escapeHtml(query)}"...</span>
                </div>
            `;
        }

        try {
            // Call Pancake API search
            const result = await pancakeDataManager.searchConversations(query);

            if (result && result.conversations) {
                console.log('[PANCAKE-CHAT] Search results:', result.conversations.length);
                this.searchResults = result.conversations;
            } else {
                console.log('[PANCAKE-CHAT] No search results');
                this.searchResults = [];
            }

            // Render results
            this.renderConversationList();

        } catch (error) {
            console.error('[PANCAKE-CHAT] Search error:', error);
            this.searchResults = [];

            if (container) {
                container.innerHTML = `
                    <div class="pk-search-error">
                        <i data-lucide="alert-circle"></i>
                        <span>Lỗi tìm kiếm. Vui lòng thử lại.</span>
                    </div>
                `;
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
        } finally {
            this.isSearching = false;
        }
    }

    /**
     * Clear search and show all conversations
     */
    clearSearch() {
        this.searchQuery = '';
        this.searchResults = null;
        this.isSearching = false;

        // Clear input
        const searchInput = document.getElementById('pkSearchInput');
        if (searchInput) {
            searchInput.value = '';
        }

        // Re-render
        this.renderConversationList();
    }

    async setFilterType(type) {
        this.filterType = type;

        // Load TPOS saved customer IDs when switching to "Lưu Tpos" tab
        if (type === 'tpos-saved') {
            await this.loadTposSavedCustomerIds();
        }

        this.renderConversationList();
    }

    switchTab(tabName) {
        console.log('[PANCAKE-CHAT] Switching to tab:', tabName);

        // Update tab buttons
        const headerTabs = document.querySelectorAll('.pk-header-tab');
        headerTabs.forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update tab content
        const tabContents = document.querySelectorAll('.pk-tab-content');
        const tabContentMap = {
            'conversations': 'pkTabConversations',
            'orders': 'pkTabOrders',
            'posts': 'pkTabPosts',
            'stats': 'pkTabStats',
            'settings': 'pkTabSettings'
        };

        tabContents.forEach(content => {
            content.classList.remove('active');
        });

        const targetTabId = tabContentMap[tabName];
        const targetTab = document.getElementById(targetTabId);
        if (targetTab) {
            targetTab.classList.add('active');
        }
    }

    bindChatInputEvents() {
        // Chat input auto-resize
        const chatInput = document.getElementById('pkChatInput');
        if (chatInput) {
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
            });

            // Send on Enter (without Shift)
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // Send button
        const sendBtn = document.getElementById('pkSendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.sendMessage();
            });
        }

        // Quick reply buttons
        const quickReplyBar = document.getElementById('pkQuickReplyBar');
        if (quickReplyBar) {
            quickReplyBar.addEventListener('click', (e) => {
                const btn = e.target.closest('.pk-quick-reply-btn');
                if (btn) {
                    const template = btn.dataset.template;
                    if (template) {
                        const chatInput = document.getElementById('pkChatInput');
                        if (chatInput) {
                            chatInput.value = template;
                            chatInput.focus();
                        }
                    }
                }
            });
        }

        // Phone/Ad badge click-to-copy
        const statsBar = document.querySelector('.pk-customer-stats-bar');
        if (statsBar) {
            statsBar.addEventListener('click', (e) => {
                const badge = e.target.closest('.pk-phone-ad-badge');
                if (badge) {
                    const textToCopy = badge.dataset.copy;
                    if (textToCopy) {
                        navigator.clipboard.writeText(textToCopy).then(() => {
                            // Show feedback
                            const originalText = badge.querySelector('.pk-badge-text').textContent;
                            badge.querySelector('.pk-badge-text').textContent = 'Đã copy!';
                            setTimeout(() => {
                                badge.querySelector('.pk-badge-text').textContent = originalText;
                            }, 1500);
                        }).catch(err => {
                            console.error('[PANCAKE-CHAT] Failed to copy:', err);
                        });
                    }
                }
            });
        }

        // Image upload button
        const imageBtn = document.getElementById('pkImageBtn');
        const imageInput = document.getElementById('pkImageInput');
        if (imageBtn && imageInput) {
            imageBtn.addEventListener('click', () => {
                imageInput.click();
            });

            imageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleImageSelect(file);
                }
            });
        }

        // Remove image preview
        const removePreview = document.getElementById('pkRemovePreview');
        if (removePreview) {
            removePreview.addEventListener('click', () => {
                this.clearImagePreview();
            });
        }

        // Emoji picker
        this.bindEmojiPicker();

        // Typing indicator (send typing status when user types)
        this.bindTypingIndicator();

        // Private Reply button (for N2Store mode with comment conversations)
        this.bindPrivateReplyButton();
    }

    /**
     * Bind Private Reply button (N2Store mode only)
     */
    bindPrivateReplyButton() {
        const privateReplyBtn = document.getElementById('pkPrivateReplyBtn');
        if (privateReplyBtn && !privateReplyBtn.disabled) {
            privateReplyBtn.addEventListener('click', () => {
                this.showPrivateReplyModal();
            });
        }
    }

    /**
     * Show Private Reply modal
     */
    showPrivateReplyModal() {
        const conv = this.activeConversation;
        if (!conv) return;

        const commentId = conv.id.includes('_') ? conv.id.split('_')[1] : conv.id;
        const customerName = conv.from?.name || conv.customers?.[0]?.name || 'Khách hàng';

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'pk-modal-overlay';
        modal.id = 'pkPrivateReplyModal';
        modal.innerHTML = `
            <div class="pk-modal">
                <div class="pk-modal-header">
                    <h3><i data-lucide="mail"></i> Private Reply</h3>
                    <button class="pk-modal-close" id="pkClosePrivateReplyModal">×</button>
                </div>
                <div class="pk-modal-body">
                    <p class="pk-modal-info">
                        Gửi tin nhắn riêng đến <strong>${this.escapeHtml(customerName)}</strong> qua Messenger.
                    </p>
                    <p class="pk-modal-warning">
                        <i data-lucide="alert-triangle"></i>
                        <span>Lưu ý: Private Reply chỉ gửi được <strong>1 lần</strong> cho mỗi comment và comment phải trong <strong>7 ngày</strong>.</span>
                    </p>
                    <textarea id="pkPrivateReplyMessage" class="pk-modal-textarea" placeholder="Nhập tin nhắn..." rows="4"></textarea>
                </div>
                <div class="pk-modal-footer">
                    <button class="pk-modal-btn pk-modal-btn-cancel" id="pkCancelPrivateReply">Hủy</button>
                    <button class="pk-modal-btn pk-modal-btn-primary" id="pkSendPrivateReply">
                        <i data-lucide="send"></i> Gửi Private Reply
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Initialize Lucide icons in modal
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind events
        document.getElementById('pkClosePrivateReplyModal').addEventListener('click', () => modal.remove());
        document.getElementById('pkCancelPrivateReply').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        document.getElementById('pkSendPrivateReply').addEventListener('click', async () => {
            const message = document.getElementById('pkPrivateReplyMessage').value.trim();
            if (!message) {
                alert('Vui lòng nhập tin nhắn');
                return;
            }

            const sendBtn = document.getElementById('pkSendPrivateReply');
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i data-lucide="loader"></i> Đang gửi...';

            try {
                const pageId = conv.page_id;
                const result = await window.pancakeDataManager.privateReplyN2Store(pageId, commentId, message);

                if (result.success) {
                    modal.remove();

                    // Update button status
                    const btn = document.getElementById('pkPrivateReplyBtn');
                    if (btn) {
                        btn.classList.add('replied');
                        btn.disabled = true;
                        btn.querySelector('.pk-btn-label').textContent = 'Đã gửi';
                        btn.title = 'Đã gửi Private Reply';
                    }

                    // Show success message
                    this.showToast('Private Reply đã gửi thành công!', 'success');

                    // Ask if user wants to go to the new conversation
                    if (result.recipient_id) {
                        const goToConv = confirm('Private Reply đã gửi thành công!\\n\\nBạn có muốn chuyển đến cuộc hội thoại Messenger mới không?');
                        if (goToConv) {
                            this.navigateToConversationByPsid(pageId, result.recipient_id);
                        }
                    }
                }
            } catch (error) {
                console.error('[PANCAKE-CHAT] Private Reply error:', error);
                alert('Lỗi: ' + error.message);
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i data-lucide="send"></i> Gửi Private Reply';
            }
        });

        // Focus textarea
        document.getElementById('pkPrivateReplyMessage').focus();
    }

    /**
     * Navigate to conversation by PSID (after Private Reply)
     */
    async navigateToConversationByPsid(pageId, psid) {
        try {
            this.showToast('Đang tìm cuộc hội thoại...', 'info');

            const result = await window.pancakeDataManager.findConversationByPsidN2Store(pageId, psid);

            if (result.success && result.conversation) {
                // Refresh conversations and select the new one
                await this.loadConversations();

                // Find and select the conversation
                const conv = this.conversations.find(c => c.id === result.conversation.id);
                if (conv) {
                    this.selectConversation(conv);
                    this.showToast('Đã chuyển đến cuộc hội thoại mới', 'success');
                } else {
                    this.showToast('Không tìm thấy cuộc hội thoại trong danh sách', 'warning');
                }
            } else {
                this.showToast('Cuộc hội thoại chưa được tạo. Thử lại sau vài giây.', 'warning');
            }
        } catch (error) {
            console.error('[PANCAKE-CHAT] Navigate to conversation error:', error);
            this.showToast('Lỗi: ' + error.message, 'error');
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Remove existing toast
        const existingToast = document.querySelector('.pk-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `pk-toast pk-toast-${type}`;
        toast.innerHTML = `
            <span>${this.escapeHtml(message)}</span>
        `;
        document.body.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => toast.remove(), 3000);
    }

    /**
     * Bind emoji picker events
     */
    bindEmojiPicker() {
        const emojiBtn = document.getElementById('pkEmojiBtn');
        const emojiPicker = document.getElementById('pkEmojiPicker');
        const emojiGrid = document.getElementById('pkEmojiGrid');
        const chatInput = document.getElementById('pkChatInput');

        if (!emojiBtn || !emojiPicker || !emojiGrid) return;

        // Emoji data by category
        this.emojiData = {
            recent: ['😊', '👍', '❤️', '😂', '🙏', '😍', '🔥', '✨'],
            smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐'],
            gestures: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪'],
            hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❤️‍🔥', '❤️‍🩹', '♥️'],
            animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞'],
            food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝'],
            objects: ['💡', '🔦', '🏮', '🪔', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💎', '⚙️', '🔧', '🔨', '🛠️', '⛏️', '🔩', '🪛', '🔑', '🗝️', '🔒', '🔓', '🔏', '🔐']
        };

        // Load recent emojis from localStorage
        const savedRecent = localStorage.getItem('pk_recent_emojis');
        if (savedRecent) {
            try {
                this.emojiData.recent = JSON.parse(savedRecent);
            } catch (e) { }
        }

        // Toggle emoji picker
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = emojiPicker.style.display === 'block';
            emojiPicker.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                this.renderEmojiGrid('recent');
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
                emojiPicker.style.display = 'none';
            }
        });

        // Category switching
        emojiPicker.querySelectorAll('.pk-emoji-cat').forEach(cat => {
            cat.addEventListener('click', () => {
                emojiPicker.querySelectorAll('.pk-emoji-cat').forEach(c => c.classList.remove('active'));
                cat.classList.add('active');
                this.renderEmojiGrid(cat.dataset.category);
            });
        });

        // Emoji selection
        emojiGrid.addEventListener('click', (e) => {
            const emojiItem = e.target.closest('.pk-emoji-item');
            if (emojiItem && chatInput) {
                const emoji = emojiItem.textContent;

                // Insert emoji at cursor position
                const start = chatInput.selectionStart;
                const end = chatInput.selectionEnd;
                chatInput.value = chatInput.value.substring(0, start) + emoji + chatInput.value.substring(end);
                chatInput.selectionStart = chatInput.selectionEnd = start + emoji.length;
                chatInput.focus();

                // Add to recent emojis
                this.addToRecentEmojis(emoji);
            }
        });
    }

    /**
     * Render emoji grid for a category
     */
    renderEmojiGrid(category) {
        const grid = document.getElementById('pkEmojiGrid');
        if (!grid || !this.emojiData[category]) return;

        grid.innerHTML = this.emojiData[category].map(emoji =>
            `<button class="pk-emoji-item" title="${emoji}">${emoji}</button>`
        ).join('');
    }

    /**
     * Add emoji to recent list
     */
    addToRecentEmojis(emoji) {
        // Remove if exists
        const idx = this.emojiData.recent.indexOf(emoji);
        if (idx > -1) {
            this.emojiData.recent.splice(idx, 1);
        }
        // Add to front
        this.emojiData.recent.unshift(emoji);
        // Keep only 24 recent
        this.emojiData.recent = this.emojiData.recent.slice(0, 24);
        // Save to localStorage
        localStorage.setItem('pk_recent_emojis', JSON.stringify(this.emojiData.recent));
    }

    /**
     * Bind typing indicator (sends typing status to API)
     */
    bindTypingIndicator() {
        const chatInput = document.getElementById('pkChatInput');
        if (!chatInput || !this.activeConversation) return;

        let typingTimeout = null;
        let isTyping = false;

        chatInput.addEventListener('input', () => {
            if (!this.activeConversation) return;

            // Send typing on
            if (!isTyping) {
                isTyping = true;
                window.pancakeDataManager?.sendTypingIndicator(
                    this.activeConversation.page_id,
                    this.activeConversation.id,
                    true
                );
            }

            // Clear previous timeout
            if (typingTimeout) {
                clearTimeout(typingTimeout);
            }

            // Set timeout to stop typing
            typingTimeout = setTimeout(() => {
                isTyping = false;
                window.pancakeDataManager?.sendTypingIndicator(
                    this.activeConversation.page_id,
                    this.activeConversation.id,
                    false
                );
            }, 2000); // Stop typing after 2s of no input
        });
    }

    /**
     * Handle image selection
     */
    handleImageSelect(file) {
        if (!file.type.startsWith('image/')) {
            alert('Vui lòng chọn file ảnh');
            return;
        }

        // Store selected file
        this.selectedImage = file;

        // Show preview
        const preview = document.getElementById('pkImagePreview');
        const previewImg = document.getElementById('pkPreviewImg');
        if (preview && previewImg) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImg.src = e.target.result;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    }

    /**
     * Clear image preview
     */
    clearImagePreview() {
        this.selectedImage = null;
        const preview = document.getElementById('pkImagePreview');
        const previewImg = document.getElementById('pkPreviewImg');
        const imageInput = document.getElementById('pkImageInput');

        if (preview) preview.style.display = 'none';
        if (previewImg) previewImg.src = '';
        if (imageInput) imageInput.value = '';
    }

    /**
     * Bind scroll events for chat messages container
     * Shows/hides scroll-to-bottom button based on scroll position
     */
    bindScrollEvents() {
        const container = document.getElementById('pkChatMessages');
        const scrollBtn = document.getElementById('pkScrollToBottom');

        if (!container || !scrollBtn) return;

        // Reset state when opening new conversation
        this.isScrolledToBottom = true;
        this.newMessageCount = 0;
        this.hasMoreMessages = true;
        this.messageCurrentCount = this.messages.length;
        this.updateScrollButtonVisibility(false);
        this.updateScrollButtonBadge();

        // Track scroll position
        container.addEventListener('scroll', () => {
            const threshold = 100; // pixels from bottom to consider "at bottom"
            const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;

            this.isScrolledToBottom = isAtBottom;

            if (isAtBottom) {
                // User scrolled to bottom, reset new message count
                this.newMessageCount = 0;
                this.updateScrollButtonBadge();
                this.updateScrollButtonVisibility(false);
            } else {
                // User scrolled up, show button
                this.updateScrollButtonVisibility(true);
            }

            // Detect scroll near top to load more messages
            const scrollTopThreshold = 100; // pixels from top
            if (container.scrollTop < scrollTopThreshold &&
                this.hasMoreMessages &&
                !this.isLoadingMoreMessages &&
                this.messages.length > 0) {
                this.loadMoreMessages();
            }
        });

        // Scroll to bottom on button click
        scrollBtn.addEventListener('click', () => {
            this.scrollToBottom();
        });
    }

    /**
     * Load older messages (pagination)
     */
    async loadMoreMessages() {
        if (this.isLoadingMoreMessages || !this.hasMoreMessages || !this.activeConversation) {
            return;
        }

        this.isLoadingMoreMessages = true;
        console.log('[PANCAKE-CHAT] Loading more messages... currentCount:', this.messageCurrentCount);

        // Save scroll position to maintain after loading
        const container = document.getElementById('pkChatMessages');
        const scrollHeightBefore = container ? container.scrollHeight : 0;

        // Show loading indicator at top
        const loadMoreIndicator = document.createElement('div');
        loadMoreIndicator.className = 'pk-load-more-indicator';
        loadMoreIndicator.innerHTML = `
            <div class="pk-loading-spinner" style="width: 24px; height: 24px;"></div>
            <span>Đang tải tin nhắn cũ...</span>
        `;
        if (container) {
            container.insertBefore(loadMoreIndicator, container.firstChild);
        }

        try {
            const pageId = this.activeConversation.page_id;
            const convId = this.activeConversation.id;
            const customerId = this.activeConversation.customers?.[0]?.id || null;

            const result = await window.pancakeDataManager.fetchMessagesForConversation(
                pageId,
                convId,
                this.messageCurrentCount, // Pass current message count for pagination
                customerId,
                false
            );

            // Remove loading indicator
            loadMoreIndicator.remove();

            const olderMessages = result.messages || [];
            console.log('[PANCAKE-CHAT] Loaded', olderMessages.length, 'older messages');

            if (olderMessages.length === 0) {
                this.hasMoreMessages = false;
                // Show "no more messages" indicator
                const noMoreDiv = document.createElement('div');
                noMoreDiv.className = 'pk-no-more-messages';
                noMoreDiv.textContent = '— Đầu cuộc hội thoại —';
                if (container) {
                    container.insertBefore(noMoreDiv, container.firstChild);
                }
            } else {
                // Prepend older messages (they come in reverse order from API)
                const reversedOlder = olderMessages.reverse();
                this.messages = [...reversedOlder, ...this.messages];
                this.messageCurrentCount = this.messages.length;

                // Re-render messages
                this.renderMessages();

                // Maintain scroll position
                if (container) {
                    const scrollHeightAfter = container.scrollHeight;
                    const scrollDelta = scrollHeightAfter - scrollHeightBefore;
                    container.scrollTop = scrollDelta;
                }
            }

        } catch (error) {
            console.error('[PANCAKE-CHAT] Error loading more messages:', error);
            loadMoreIndicator.remove();
        } finally {
            this.isLoadingMoreMessages = false;
        }
    }

    /**
     * Scroll chat to bottom with smooth animation
     */
    scrollToBottom() {
        const container = document.getElementById('pkChatMessages');
        if (!container) return;

        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });

        // Reset state
        this.isScrolledToBottom = true;
        this.newMessageCount = 0;
        this.updateScrollButtonBadge();

        // Hide button after a short delay (after animation completes)
        setTimeout(() => {
            this.updateScrollButtonVisibility(false);
        }, 300);
    }

    /**
     * Update scroll-to-bottom button visibility
     */
    updateScrollButtonVisibility(visible) {
        const scrollBtn = document.getElementById('pkScrollToBottom');
        if (scrollBtn) {
            scrollBtn.classList.toggle('visible', visible);
        }
    }

    /**
     * Update new message badge on scroll button
     */
    updateScrollButtonBadge() {
        const badge = document.getElementById('pkNewMsgBadge');
        if (badge) {
            if (this.newMessageCount > 0) {
                badge.textContent = this.newMessageCount > 99 ? '99+' : this.newMessageCount;
                badge.classList.add('visible');
            } else {
                badge.classList.remove('visible');
            }
        }
    }

    selectConversation(convId) {
        // Look in both regular conversations and search results
        let conv = this.conversations.find(c => c.id === convId);

        // If not found in conversations, check search results
        if (!conv && this.searchResults) {
            conv = this.searchResults.find(c => c.id === convId);
        }

        if (!conv) {
            console.warn('[PANCAKE-CHAT] Conversation not found:', convId);
            return;
        }

        this.activeConversation = conv;
        this.renderConversationList(); // Update active state
        this.renderChatWindow(conv);
    }

    async sendMessage() {
        const chatInput = document.getElementById('pkChatInput');
        if (!chatInput || !this.activeConversation) return;

        const text = chatInput.value.trim();
        const hasImage = !!this.selectedImage;

        // Must have text or image
        if (!text && !hasImage) return;

        // Clear input
        chatInput.value = '';
        chatInput.style.height = 'auto';

        // Disable send button during sending
        const sendBtn = document.getElementById('pkSendBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i data-lucide="loader" class="pk-spin"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // Add message to UI immediately (optimistic update)
        const tempMessage = {
            id: 'temp_' + Date.now(),
            message: text || '[Hình ảnh]',
            from: { id: this.activeConversation.page_id, name: 'You' },
            inserted_at: new Date().toISOString(),
            _temp: true
        };
        this.messages.push(tempMessage);
        this.isScrolledToBottom = true; // Force scroll for own message
        this.renderMessages();
        this.scrollToBottom(); // Scroll immediately to show optimistic update

        try {
            const pageId = this.activeConversation.page_id;
            const convId = this.activeConversation.id;
            const customerId = this.activeConversation.customers?.[0]?.id || null;
            const action = this.activeConversation.type === 'COMMENT' ? 'reply_comment' : 'reply_inbox';

            let contentIds = [];
            let attachmentId = null;
            let attachmentType = null;

            // Upload image if selected
            if (hasImage) {
                console.log(`[PANCAKE-CHAT] Uploading image (mode: ${this.serverMode})...`);

                let uploadResult;
                if (this.serverMode === 'n2store') {
                    // N2Store mode - upload via Facebook Graph API
                    uploadResult = await window.pancakeDataManager.uploadMediaN2Store(pageId, this.selectedImage);
                    if (uploadResult.success && uploadResult.attachment_id) {
                        attachmentId = uploadResult.attachment_id;
                        attachmentType = uploadResult.attachment_type;
                        console.log('[PANCAKE-CHAT] Image uploaded (Facebook):', uploadResult);
                    } else {
                        throw new Error('Upload ảnh thất bại');
                    }
                } else {
                    // Pancake mode - upload via Pancake API
                    uploadResult = await window.pancakeDataManager.uploadMedia(pageId, this.selectedImage);
                    if (uploadResult.success && uploadResult.id) {
                        contentIds = [uploadResult.id];
                        attachmentType = uploadResult.attachment_type;
                        console.log('[PANCAKE-CHAT] Image uploaded (Pancake):', uploadResult);
                    } else {
                        throw new Error('Upload ảnh thất bại');
                    }
                }

                // Clear preview
                this.clearImagePreview();
            }

            console.log(`[PANCAKE-CHAT] Sending message (mode: ${this.serverMode}):`, { pageId, convId, text, action, attachmentId, contentIds });

            let sentMessage;
            if (this.serverMode === 'n2store') {
                // N2Store mode - send via Facebook Graph API (100%)
                sentMessage = await window.pancakeDataManager.sendMessageN2Store(pageId, convId, text, action, attachmentId, attachmentType);
            } else {
                // Pancake mode - send via Pancake API
                sentMessage = await window.pancakeDataManager.sendMessage(pageId, convId, {
                    text: text,
                    action: action,
                    customerId: customerId,
                    content_ids: contentIds,
                    attachment_type: attachmentType
                });
            }

            console.log('[PANCAKE-CHAT] ✅ Message sent successfully:', sentMessage);

            // Replace temp message with real message
            this.messages = this.messages.filter(m => m.id !== tempMessage.id);
            if (sentMessage) {
                this.messages.push(sentMessage);
            }

            // Force scroll to bottom after sending own message
            this.isScrolledToBottom = true;
            this.renderMessages();
            this.scrollToBottom();

            // Update conversation preview
            if (this.activeConversation) {
                this.activeConversation.snippet = text || '[Hình ảnh]';
                this.activeConversation.updated_at = new Date().toISOString();
                this.renderConversationList();
            }

        } catch (error) {
            console.error('[PANCAKE-CHAT] ❌ Error sending message:', error);

            // Remove temp message on error
            this.messages = this.messages.filter(m => m.id !== tempMessage.id);
            this.renderMessages();

            // Show error notification
            alert(`Lỗi gửi tin nhắn: ${error.message || 'Vui lòng thử lại'}`);

        } finally {
            // Re-enable send button
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i data-lucide="send"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }

    // =====================================================
    // AUTO-REFRESH
    // =====================================================

    startAutoRefresh() {
        // Stop any existing interval
        this.stopAutoRefresh();

        console.log(`[PANCAKE-CHAT] Starting auto-refresh (every ${this.AUTO_REFRESH_INTERVAL / 1000}s)`);

        // Set up periodic refresh
        this.autoRefreshInterval = setInterval(async () => {
            try {
                console.log('[PANCAKE-CHAT] Auto-refreshing conversations...');

                // Refresh pages with unread counts
                if (window.pancakeDataManager) {
                    this.pagesWithUnread = await window.pancakeDataManager.fetchPagesWithUnreadCount() || [];
                    this.updateSelectedPageDisplay();
                }

                // Refresh conversations (in background, don't show loading)
                if (window.pancakeDataManager && !this.isLoading) {
                    const conversations = await window.pancakeDataManager.fetchConversations(false); // Don't force, use cache if fresh

                    if (conversations && conversations.length > 0) {
                        // Update conversations list
                        const oldCount = this.conversations.length;
                        this.conversations = conversations;

                        // Re-render if count changed or has unread
                        const hasNewUnread = conversations.some(c => c.unread_count > 0);
                        if (conversations.length !== oldCount || hasNewUnread) {
                            console.log('[PANCAKE-CHAT] ✅ Conversations updated:', conversations.length);
                            this.renderConversationList();
                        }
                    }
                }
            } catch (error) {
                console.warn('[PANCAKE-CHAT] Auto-refresh failed:', error.message);
            }
        }, this.AUTO_REFRESH_INTERVAL);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            console.log('[PANCAKE-CHAT] Stopping auto-refresh');
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    // =====================================================
    // WEBSOCKET REALTIME (Phoenix Protocol)
    // =====================================================

    /**
     * Initialize WebSocket connection for realtime updates
     * Uses Phoenix Protocol v2.0.0 (Pancake's socket server)
     * 
     * NOTE: When using server mode (via realtime-manager.js), this function
     * skips browser WebSocket since the server handles it via proxy.
     */
    async initializeWebSocket() {
        try {
            // Check if server mode is enabled (handled by realtime-manager.js)
            // In server mode, realtime-manager.js connects to wss://n2store-realtime.onrender.com
            // which proxies Pancake WebSocket events. No need for browser WebSocket.
            if (window.chatAPISettings && window.chatAPISettings.getRealtimeMode() === 'server') {
                console.log('[PANCAKE-SOCKET] Server mode enabled, skipping browser WebSocket');
                console.log('[PANCAKE-SOCKET] ✅ Using realtime-manager.js for WebSocket via wss://n2store-realtime.onrender.com');
                // Start auto-refresh as backup
                this.startAutoRefresh();
                return true;
            }

            // Prevent duplicate connection attempts
            if (this.isSocketConnected || this.isSocketConnecting) {
                console.log('[PANCAKE-SOCKET] Already connected or connecting, skipping');
                return this.isSocketConnected;
            }

            // Check if socket is still in CONNECTING state
            if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
                console.log('[PANCAKE-SOCKET] Socket still connecting, skipping');
                return true;
            }

            this.isSocketConnecting = true;

            // Get user ID from token
            if (!window.pancakeTokenManager) {
                console.warn('[PANCAKE-SOCKET] Token manager not available');
                this.isSocketConnecting = false;
                return false;
            }

            const token = await window.pancakeTokenManager.getToken();
            if (!token) {
                console.warn('[PANCAKE-SOCKET] No token available for WebSocket');
                this.isSocketConnecting = false;
                return false;
            }

            // Decode token to get user ID
            const payload = window.pancakeTokenManager.decodeToken(token);
            if (!payload || !payload.uid) {
                console.warn('[PANCAKE-SOCKET] Cannot get user ID from token');
                this.isSocketConnecting = false;
                return false;
            }

            this.userId = payload.uid;
            console.log('[PANCAKE-SOCKET] User ID:', this.userId);

            // Build WebSocket URL with token
            const wsUrl = `wss://pancake.vn/socket/websocket?token=${encodeURIComponent(token)}&vsn=2.0.0`;

            // Close existing socket if any
            this.closeWebSocket();

            console.log('[PANCAKE-SOCKET] Connecting to WebSocket...');
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => this.onSocketOpen();
            this.socket.onclose = (event) => this.onSocketClose(event);
            this.socket.onerror = (error) => this.onSocketError(error);
            this.socket.onmessage = (event) => this.onSocketMessage(event);

            return true;
        } catch (error) {
            console.error('[PANCAKE-SOCKET] Error initializing WebSocket:', error);
            this.isSocketConnecting = false;
            return false;
        }
    }


    /**
     * Handle WebSocket open event
     */
    onSocketOpen() {
        console.log('[PANCAKE-SOCKET] ✅ WebSocket connected');
        this.isSocketConnected = true;
        this.isSocketConnecting = false;
        this.socketReconnectAttempts = 0;
        this.socketReconnectDelay = 2000;

        // Clear any pending reconnect timer
        if (this.socketReconnectTimer) {
            clearTimeout(this.socketReconnectTimer);
            this.socketReconnectTimer = null;
        }

        // Update UI status indicator
        this.updateSocketStatusUI(true);

        // Join Phoenix channels
        this.joinChannels();

        // Start heartbeat
        this.startHeartbeat();

        // Stop polling fallback since socket is connected
        this.stopAutoRefresh();
    }

    /**
     * Handle WebSocket close event
     */
    onSocketClose(event) {
        console.log('[PANCAKE-SOCKET] WebSocket closed:', event.code, event.reason);
        this.isSocketConnected = false;
        this.isSocketConnecting = false;

        // Update UI status indicator
        this.updateSocketStatusUI(false);

        // Stop heartbeat
        this.stopHeartbeat();

        // Clear any existing reconnect timer
        if (this.socketReconnectTimer) {
            clearTimeout(this.socketReconnectTimer);
            this.socketReconnectTimer = null;
        }

        // Attempt reconnection with exponential backoff
        if (this.socketReconnectAttempts < this.socketMaxReconnectAttempts) {
            this.socketReconnectAttempts++;
            const delay = Math.min(this.socketReconnectDelay * Math.pow(1.5, this.socketReconnectAttempts - 1), 30000);
            console.log(`[PANCAKE-SOCKET] Reconnecting in ${delay}ms (attempt ${this.socketReconnectAttempts}/${this.socketMaxReconnectAttempts})`);

            this.socketReconnectTimer = setTimeout(() => {
                this.initializeWebSocket();
            }, delay);
        } else {
            console.warn('[PANCAKE-SOCKET] Max reconnection attempts reached, falling back to polling');
            // Fallback to polling
            this.startAutoRefresh();
        }
    }

    /**
     * Handle WebSocket error event
     */
    onSocketError(error) {
        console.error('[PANCAKE-SOCKET] WebSocket error:', error);
    }

    /**
     * Handle incoming WebSocket messages (Phoenix Protocol)
     */
    onSocketMessage(event) {
        try {
            // Phoenix Protocol v2: [join_ref, ref, topic, event, payload]
            const data = JSON.parse(event.data);

            if (!Array.isArray(data) || data.length < 5) {
                console.log('[PANCAKE-SOCKET] Non-Phoenix message:', data);
                return;
            }

            const [joinRef, ref, topic, eventName, payload] = data;
            console.log('[PANCAKE-SOCKET] Message:', { topic, event: eventName, payload });

            // Handle different events
            switch (eventName) {
                case 'phx_reply':
                    this.handlePhxReply(topic, payload);
                    break;

                case 'pages:update_conversation':
                case 'update_conversation':
                    this.handleConversationUpdate(payload);
                    break;

                case 'pages:new_message':
                case 'new_message':
                    this.handleNewMessage(payload);
                    break;

                case 'order:tags_updated':
                case 'tags_updated':
                    this.handleTagsUpdated(payload);
                    break;

                case 'presence_state':
                case 'presence_diff':
                    // Presence updates - can be used for online status
                    console.log('[PANCAKE-SOCKET] Presence update:', eventName, payload);
                    break;

                default:
                    console.log('[PANCAKE-SOCKET] Unhandled event:', eventName);
            }
        } catch (error) {
            console.error('[PANCAKE-SOCKET] Error parsing message:', error);
        }
    }

    /**
     * Join Phoenix channels
     */
    joinChannels() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[PANCAKE-SOCKET] Socket not ready for joining channels');
            return;
        }

        // Join user channel: users:{userId}
        this.sendPhxMessage('users:' + this.userId, 'phx_join', {});

        // Join multiple_pages channel for conversation updates
        this.sendPhxMessage('multiple_pages:' + this.userId, 'phx_join', {});

        console.log('[PANCAKE-SOCKET] Joined channels for user:', this.userId);
    }

    /**
     * Send Phoenix protocol message
     */
    sendPhxMessage(topic, event, payload) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[PANCAKE-SOCKET] Cannot send message - socket not open');
            return;
        }

        this.socketJoinRef++;
        this.socketMsgRef++;

        // Phoenix Protocol v2: [join_ref, ref, topic, event, payload]
        const message = [
            this.socketJoinRef.toString(),
            this.socketMsgRef.toString(),
            topic,
            event,
            payload
        ];

        this.socket.send(JSON.stringify(message));
    }

    /**
     * Handle Phoenix reply
     */
    handlePhxReply(topic, payload) {
        if (payload.status === 'ok') {
            console.log('[PANCAKE-SOCKET] ✅ Successfully joined:', topic);
        } else {
            console.warn('[PANCAKE-SOCKET] Join failed:', topic, payload);
        }
    }

    /**
     * Handle conversation update from WebSocket
     */
    handleConversationUpdate(payload) {
        console.log('[PANCAKE-SOCKET] 🔔 Conversation update:', payload);

        const conversation = payload.conversation || payload;
        if (!conversation || !conversation.id) return;

        // Find and update conversation in list
        const index = this.conversations.findIndex(c => c.id === conversation.id);

        if (index >= 0) {
            // Update existing conversation
            this.conversations[index] = { ...this.conversations[index], ...conversation };
        } else {
            // Add new conversation at top
            this.conversations.unshift(conversation);
        }

        // Re-sort by updated_at (newest first)
        this.conversations.sort((a, b) => {
            const dateA = new Date(a.updated_at || 0);
            const dateB = new Date(b.updated_at || 0);
            return dateB - dateA;
        });

        // Re-render conversation list
        this.renderConversationList();

        // Update unread counts
        this.updateUnreadCounts();

        // If this is the active conversation, reload messages
        if (this.activeConversation?.id === conversation.id) {
            this.loadMessages(this.activeConversation, true);
        }

        // Show notification for unread
        if (conversation.unread_count > 0) {
            this.showNewMessageNotification(conversation);
        }
    }

    /**
     * Handle new message from WebSocket
     */
    handleNewMessage(payload) {
        console.log('[PANCAKE-SOCKET] 🔔 New message:', payload);

        const message = payload.message || payload;
        const conversationId = payload.conversation_id || message.conversation_id;

        // If this is the active conversation, add message to list
        if (this.activeConversation?.id === conversationId) {
            // Add message if not already exists
            if (!this.messages.find(m => m.id === message.id)) {
                this.messages.push(message);
                this.renderMessages();
            }
        }

        // Update conversation in list
        this.handleConversationUpdate({
            id: conversationId,
            snippet: message.message || message.text,
            updated_at: message.inserted_at || new Date().toISOString(),
            unread_count: (this.activeConversation?.id === conversationId) ? 0 : 1
        });
    }

    /**
     * Handle tags update from WebSocket
     */
    handleTagsUpdated(payload) {
        console.log('[PANCAKE-SOCKET] Tags updated:', payload);

        const conversationId = payload.conversation_id;
        const tags = payload.tags;

        // Find and update conversation tags
        const conv = this.conversations.find(c => c.id === conversationId);
        if (conv) {
            conv.tags = tags;
            this.renderConversationList();
        }
    }

    /**
     * Start heartbeat to keep WebSocket connection alive
     */
    startHeartbeat() {
        this.stopHeartbeat();

        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                // Phoenix heartbeat format
                this.sendPhxMessage('phoenix', 'heartbeat', {});
                console.log('[PANCAKE-SOCKET] 💓 Heartbeat sent');
            }
        }, this.HEARTBEAT_INTERVAL);
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Close WebSocket connection
     */
    closeWebSocket() {
        this.stopHeartbeat();

        // Clear reconnect timer
        if (this.socketReconnectTimer) {
            clearTimeout(this.socketReconnectTimer);
            this.socketReconnectTimer = null;
        }

        if (this.socket) {
            this.socket.onclose = null; // Prevent reconnection
            this.socket.close();
            this.socket = null;
        }

        this.isSocketConnected = false;
        this.isSocketConnecting = false;
        this.updateSocketStatusUI(false);
    }

    /**
     * Update WebSocket status indicator in UI
     */
    updateSocketStatusUI(connected) {
        const statusEl = document.getElementById('pkSocketStatus');
        if (!statusEl) return;

        if (connected) {
            statusEl.innerHTML = '<i data-lucide="wifi" class="pk-socket-icon connected"></i>';
            statusEl.title = 'Realtime: Đã kết nối';
        } else {
            statusEl.innerHTML = '<i data-lucide="wifi-off" class="pk-socket-icon disconnected"></i>';
            statusEl.title = 'Realtime: Mất kết nối';
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Update unread counts for pages
     */
    async updateUnreadCounts() {
        if (window.pancakeDataManager) {
            this.pagesWithUnread = await window.pancakeDataManager.fetchPagesWithUnreadCount() || [];
            this.updateSelectedPageDisplay();
        }
    }

    /**
     * Show notification for new message
     */
    showNewMessageNotification(conversation) {
        const name = conversation.from?.name || conversation.customers?.[0]?.name || 'Tin nhắn mới';
        const snippet = conversation.snippet || '';

        // Browser notification if permission granted
        if (Notification.permission === 'granted') {
            new Notification(name, {
                body: snippet.substring(0, 100),
                icon: '/favicon.ico',
                tag: conversation.id
            });
        }

        // Play notification sound (optional)
        // this.playNotificationSound();
    }

    // =====================================================
    // HELPER METHODS
    // =====================================================

    getAvatarHtml(conv, type = 'list') {
        const customer = conv.customers?.[0] || conv.from;
        const name = customer?.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const pageId = conv.page_id;
        const fbId = customer?.fb_id || customer?.id || conv.from?.id;

        // Try multiple avatar fields (different API responses use different field names)
        let directAvatarUrl = customer?.avatar ||
            customer?.picture?.data?.url ||
            customer?.profile_pic ||
            customer?.image_url ||
            conv.from?.picture?.data?.url ||
            conv.from?.profile_pic ||
            null;

        // Use getAvatarUrl from data manager for better avatar resolution
        let avatarUrl = directAvatarUrl;
        if (window.pancakeDataManager && fbId) {
            avatarUrl = window.pancakeDataManager.getAvatarUrl(fbId, pageId, null, directAvatarUrl);
        }

        // Random gradient colors for placeholder based on name
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
        ];
        const colorIndex = name.charCodeAt(0) % colors.length;
        const gradientColor = colors[colorIndex];

        if (type === 'chat') {
            if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
                return `<img src="${avatarUrl}" class="pk-chat-avatar" alt="${this.escapeHtml(name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="pk-chat-avatar-placeholder" style="display: none; background: ${gradientColor};">${initial}</div>`;
            }
            return `<div class="pk-chat-avatar-placeholder" style="background: ${gradientColor};">${initial}</div>`;
        }

        if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
            return `<img src="${avatarUrl}" alt="${this.escapeHtml(name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="pk-avatar-placeholder" style="display: none; background: ${gradientColor};">${initial}</div>`;
        }
        return `<div class="pk-avatar-placeholder" style="background: ${gradientColor};">${initial}</div>`;
    }

    getTagsHtml(conv) {
        // Render all tags as colored badges (like "BOOM" in Pancake.vn)
        const tags = conv.tags || [];
        if (tags.length === 0) return '';

        // Map tag colors (use tag.color if available, otherwise assign from palette)
        const colorPalette = ['red', 'green', 'blue', 'orange', 'purple', 'pink', 'teal'];

        return tags.map((tag, index) => {
            const tagName = tag.name || tag.tag_name || tag;
            const tagColor = tag.color || tag.tag_color || colorPalette[index % colorPalette.length];
            return `<span class="pk-tag-badge ${tagColor}">${this.escapeHtml(tagName)}</span>`;
        }).join('');
    }

    getChatStatus(conv) {
        const lastSeen = conv.updated_at;
        if (!lastSeen) return '';
        return `Da xem boi Ky Thuat NJD - ${this.formatMessageTime(lastSeen)}`;
    }

    getSenderName(msg) {
        // Determine sender name for outgoing messages
        if (msg.sender_action_name) {
            return msg.sender_action_name;
        }
        return 'Nv.My';
    }

    formatTime(timestamp) {
        if (!timestamp) return '';

        try {
            // Use parseTimestamp helper for proper UTC handling
            const date = this.parseTimestamp(timestamp);
            if (!date) {
                console.warn('[PANCAKE-CHAT] Invalid timestamp:', timestamp);
                return '';
            }

            const now = new Date();


            // Use Intl.DateTimeFormat to get date parts in Vietnam timezone
            const vnFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            // Get date parts for comparison
            const dateParts = vnFormatter.formatToParts(date);
            const nowParts = vnFormatter.formatToParts(now);

            const getPartValue = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0');

            const dateYear = getPartValue(dateParts, 'year');
            const dateMonth = getPartValue(dateParts, 'month');
            const dateDay = getPartValue(dateParts, 'day');

            const nowYear = getPartValue(nowParts, 'year');
            const nowMonth = getPartValue(nowParts, 'month');
            const nowDay = getPartValue(nowParts, 'day');

            // Check if same day in Vietnam timezone
            const isSameDay = dateYear === nowYear && dateMonth === nowMonth && dateDay === nowDay;

            // If today, show time (HH:mm format in Vietnam timezone)
            if (isSameDay) {
                return new Intl.DateTimeFormat('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Ho_Chi_Minh',
                    hour12: false
                }).format(date);
            }

            // Calculate days difference
            const vnDateObj = new Date(dateYear, dateMonth - 1, dateDay);
            const vnNowObj = new Date(nowYear, nowMonth - 1, nowDay);
            const diffDays = Math.floor((vnNowObj - vnDateObj) / (24 * 60 * 60 * 1000));

            // If within last 7 days, show day of week
            if (diffDays > 0 && diffDays < 7) {
                const dayOfWeek = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    weekday: 'short'
                }).format(date);
                const days = { 'Sun': 'CN', 'Mon': 'T2', 'Tue': 'T3', 'Wed': 'T4', 'Thu': 'T5', 'Fri': 'T6', 'Sat': 'T7' };
                return days[dayOfWeek] || dayOfWeek;
            }

            // Otherwise show date
            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh'
            }).format(date);
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Error formatting time:', error);
            return '';
        }
    }

    /**
     * Load TPOS saved customer IDs from database
     * Called when switching to "Lưu Tpos" tab
     */
    async loadTposSavedCustomerIds() {
        try {
            console.log('[PANCAKE-CHAT] Loading TPOS saved customer IDs from database...');
            const response = await fetch(`${this.tposPancakeUrl}/api/tpos-saved/ids`);
            const data = await response.json();

            if (data.success) {
                this.tposSavedCustomerIds = new Set(data.data);
                console.log('[PANCAKE-CHAT] Loaded', this.tposSavedCustomerIds.size, 'saved customer IDs');
            } else {
                console.error('[PANCAKE-CHAT] API error:', data.message);
                this.tposSavedCustomerIds = new Set();
            }
        } catch (e) {
            console.error('[PANCAKE-CHAT] Error loading TPOS saved IDs:', e);
            this.tposSavedCustomerIds = new Set();
        }
    }

    /**
     * Remove customer from TPOS saved list via API
     * @param {string} customerId - The customer ID to remove
     */
    async removeFromTposSaved(customerId) {
        console.log('[PANCAKE-CHAT] removeFromTposSaved called with:', customerId);

        if (!customerId) {
            console.warn('[PANCAKE-CHAT] No customerId provided to removeFromTposSaved');
            return;
        }

        try {
            const response = await fetch(`${this.tposPancakeUrl}/api/tpos-saved/${encodeURIComponent(customerId)}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                console.log('[PANCAKE-CHAT] Removed from database:', customerId);

                // Update local cache
                this.tposSavedCustomerIds.delete(customerId);

                // Re-render if we're on the tpos-saved filter
                if (this.filterType === 'tpos-saved') {
                    this.renderConversationList();
                }

                if (window.notificationManager) {
                    window.notificationManager.show('Đã xóa khỏi Lưu Tpos', 'success');
                }
            } else {
                console.error('[PANCAKE-CHAT] API error:', data.message);
                if (window.notificationManager) {
                    window.notificationManager.show(data.message || 'Lỗi khi xóa', 'error');
                }
            }
        } catch (e) {
            console.error('[PANCAKE-CHAT] Error removing from TPOS saved:', e);
            if (window.notificationManager) {
                window.notificationManager.show('Lỗi kết nối server', 'error');
            }
        }
    }

    formatMessageTime(timestamp) {
        if (!timestamp) return '';

        try {
            // Use parseTimestamp helper for proper UTC handling
            const date = this.parseTimestamp(timestamp);
            if (!date) {
                console.warn('[PANCAKE-CHAT] Invalid message timestamp:', timestamp);
                return '';
            }

            return new Intl.DateTimeFormat('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
                hour12: false
            }).format(date);
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Error formatting message time:', error);
            return '';
        }
    }



    groupMessagesByDate(messages) {
        const groups = {};
        const now = new Date();

        // Get today's date in Vietnam timezone
        const vnFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        const nowParts = vnFormatter.formatToParts(now);
        const getPartValue = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0');

        const todayYear = getPartValue(nowParts, 'year');
        const todayMonth = getPartValue(nowParts, 'month');
        const todayDay = getPartValue(nowParts, 'day');
        const todayKey = `${todayYear}-${todayMonth}-${todayDay}`;

        messages.forEach(msg => {
            const timestamp = msg.inserted_at || msg.created_time;
            const date = this.parseTimestamp(timestamp);
            if (!date) return;

            const dateParts = vnFormatter.formatToParts(date);

            const dateYear = getPartValue(dateParts, 'year');
            const dateMonth = getPartValue(dateParts, 'month');
            const dateDay = getPartValue(dateParts, 'day');
            const dateKey = `${dateYear}-${dateMonth}-${dateDay}`;

            let displayKey;
            if (dateKey === todayKey) {
                displayKey = 'Hôm nay';
            } else {
                displayKey = new Intl.DateTimeFormat('vi-VN', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    timeZone: 'Asia/Ho_Chi_Minh'
                }).format(date);
            }

            if (!groups[displayKey]) {
                groups[displayKey] = [];
            }
            groups[displayKey].push(msg);
        });

        return groups;
    }

    /**
     * Parse timestamp from Pancake API to proper Date object
     * Handles UTC timestamps without timezone suffix
     */
    parseTimestamp(timestamp) {
        if (!timestamp) return null;

        try {
            let date;
            if (typeof timestamp === 'string') {
                // If timestamp doesn't have timezone info, assume it's UTC and add 'Z'
                if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
                    date = new Date(timestamp + 'Z');
                } else {
                    date = new Date(timestamp);
                }
            } else if (typeof timestamp === 'number') {
                // Unix timestamp (seconds or milliseconds)
                date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
            } else {
                date = new Date(timestamp);
            }

            return isNaN(date.getTime()) ? null : date;
        } catch (error) {
            return null;
        }
    }


    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Parse message HTML content from Pancake API to readable text
     * Converts <div>, <br> tags to line breaks, strips other HTML
     */
    parseMessageHtml(html) {
        if (!html) return '';

        // If it doesn't contain HTML tags, return as-is
        if (!html.includes('<')) return html;

        try {
            // Create a temporary element to parse HTML
            const temp = document.createElement('div');
            temp.innerHTML = html;

            // Replace <br> and </div> with newlines before getting text
            let text = temp.innerHTML;
            text = text.replace(/<br\s*\/?>/gi, '\n');
            text = text.replace(/<\/div>/gi, '\n');
            text = text.replace(/<\/p>/gi, '\n');

            // Update temp with modified HTML
            temp.innerHTML = text;

            // Get text content (strips all remaining tags)
            let result = temp.textContent || temp.innerText || '';

            // Clean up multiple consecutive newlines
            result = result.replace(/\n{3,}/g, '\n\n');

            // Trim leading/trailing whitespace
            result = result.trim();

            return result;
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Error parsing message HTML:', error);
            // Fallback: strip all HTML tags with regex
            return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }


    renderLoadingState() {
        const container = document.getElementById('pkConversations');
        if (container) {
            container.innerHTML = `
                <div class="pk-loading">
                    <div class="pk-loading-spinner"></div>
                </div>
            `;
        }
    }

    renderErrorState(message) {
        const container = document.getElementById('pkConversations');
        if (container) {
            container.innerHTML = `
                <div class="pk-empty-state" style="padding: 40px 20px;">
                    <i data-lucide="alert-circle"></i>
                    <h3>Lỗi</h3>
                    <p>${this.escapeHtml(message)}</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    async refresh() {
        // Refresh pages and conversations
        await this.loadPages();
        await this.loadConversations();
    }

    getActiveConversation() {
        return this.activeConversation;
    }

    setQuickReplies(replies) {
        this.quickReplies = replies;
        const quickReplyBar = document.getElementById('pkQuickReplyBar');
        if (quickReplyBar) {
            quickReplyBar.innerHTML = this.renderQuickReplies();
        }
    }

    /**
     * Set server mode (pancake or n2store)
     * @param {string} mode - 'pancake' or 'n2store'
     */
    setServerMode(mode) {
        if (mode !== 'pancake' && mode !== 'n2store') {
            console.warn('[PANCAKE-CHAT] Invalid server mode:', mode);
            return;
        }

        this.serverMode = mode;
        localStorage.setItem('pancake_server_mode', mode);
        console.log(`[PANCAKE-CHAT] Server mode set to: ${mode}`);

        // Update server mode indicator
        this.updateServerModeIndicator();
    }

    /**
     * Update server mode indicator in UI
     */
    updateServerModeIndicator() {
        const indicator = document.getElementById('serverModeIndicator');
        if (indicator) {
            indicator.textContent = this.serverMode === 'n2store' ? 'N2Store' : 'Pancake';
            indicator.style.background = this.serverMode === 'n2store' ? '#10b981' : '#3b82f6';
        }
    }

    // =====================================================
    // DEBT MANAGEMENT
    // =====================================================

    /**
     * Normalize phone number
     */
    normalizePhone(phone) {
        if (!phone) return '';
        let normalized = phone.toString().trim().replace(/[\s-]/g, '');
        if (normalized.startsWith('+84')) normalized = '0' + normalized.slice(3);
        if (normalized.startsWith('84') && normalized.length > 9) normalized = '0' + normalized.slice(2);
        return normalized;
    }

    /**
     * Get phone from conversation
     */
    getPhoneFromConversation(conv) {
        const customer = conv.customers?.[0] || conv.from || {};
        const phone = customer.phone_numbers?.[0] ||
                      customer.phone ||
                      conv.recent_phone_numbers?.[0] ||
                      null;
        return phone ? this.normalizePhone(phone) : null;
    }

    /**
     * Set debt in cache
     */
    setDebtCache(phone, amount) {
        if (this.debtCache.size >= this.debtCacheConfig.maxSize) {
            const entries = Array.from(this.debtCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            entries.slice(0, Math.floor(this.debtCacheConfig.maxSize * 0.2))
                .forEach(([key]) => this.debtCache.delete(key));
        }
        this.debtCache.set(phone, { amount, timestamp: Date.now() });
    }

    /**
     * Get debt from cache
     */
    getDebtCache(phone) {
        const entry = this.debtCache.get(phone);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this.debtCacheConfig.ttl) {
            this.debtCache.delete(phone);
            return null;
        }
        return entry.amount;
    }

    /**
     * Format debt for display
     */
    formatDebt(amount) {
        if (amount === null || amount === undefined) return '';
        if (amount === 0) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
    }

    /**
     * Set debt display settings and re-render
     */
    setDebtDisplaySettings(showDebt, showZeroDebt) {
        this.showDebt = showDebt;
        this.showZeroDebt = showZeroDebt;
        console.log('[PANCAKE-CHAT] Debt display settings:', { showDebt, showZeroDebt });
        // Re-render conversation list
        this.renderConversationList();
    }

    /**
     * Load debt for all conversations
     */
    async loadDebtForConversations() {
        const phones = [];
        for (const conv of this.conversations) {
            const phone = this.getPhoneFromConversation(conv);
            if (phone && !this.debtCache.has(phone)) {
                phones.push(phone);
            }
        }

        if (phones.length === 0) return;

        const uniquePhones = [...new Set(phones)];

        try {
            const response = await fetch(`${this.proxyBaseUrl}/api/sepay/debt-summary-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones: uniquePhones })
            });

            if (!response.ok) {
                console.warn('[PANCAKE-CHAT] Debt API error:', response.status);
                return;
            }

            const result = await response.json();
            if (result.success && result.data) {
                for (const [phone, info] of Object.entries(result.data)) {
                    this.setDebtCache(this.normalizePhone(phone), info.total_debt || 0);
                }
                console.log('[PANCAKE-CHAT] Loaded debt for', Object.keys(result.data).length, 'phones');
                this.renderConversationList();
            }
        } catch (error) {
            console.warn('[PANCAKE-CHAT] Error loading debt:', error);
        }
    }
}

// Create global instance
window.pancakeChatManager = new PancakeChatManager();
console.log('[PANCAKE-CHAT] PancakeChatManager loaded');

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the tpos-pancake page
    const pancakeContent = document.getElementById('pancakeContent');
    if (pancakeContent) {
        // Initialize after a short delay to ensure other managers are loaded
        setTimeout(() => {
            window.pancakeChatManager.initialize('pancakeContent');
        }, 500);
    }
});
