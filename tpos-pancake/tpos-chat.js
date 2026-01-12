// =====================================================
// TPOS CHAT MANAGER - Live Campaign Comment System
// Workflow: Select CRM Team → Select Live Campaign → Load Comments → SSE Realtime
// =====================================================

class TposChatManager {
    constructor() {
        this.containerId = null;
        this.comments = [];
        this.isLoading = false;

        // Selected data
        this.selectedTeamId = null;
        this.selectedPage = null;
        this.selectedPages = []; // Support multiple pages
        this.selectedCampaign = null;

        // Data lists
        this.crmTeams = [];
        this.allPages = []; // All available pages
        this.liveCampaigns = [];

        // Pagination
        this.nextPageUrl = null;
        this.hasMore = false;

        // SSE connection
        this.eventSource = null;
        this.sseConnected = false;

        // SessionIndex map: ASUID -> { index, session, code }
        this.sessionIndexMap = new Map();

        // Smart cache config
        this.cacheConfig = {
            maxSize: 200,           // Max entries per cache
            ttl: 10 * 60 * 1000,    // 10 minutes TTL
            cleanupInterval: 5 * 60 * 1000  // Cleanup every 5 minutes
        };

        // Partner cache: userId -> { data, timestamp }
        this.partnerCache = new Map();
        this.partnerFetchPromises = new Map();

        // Debt cache: phone -> { amount, timestamp }
        this.debtCache = new Map();

        // Debt display settings
        this.showDebt = true;
        this.showZeroDebt = false;

        // Saved to Tpos tracking (to hide "+" button after saving)
        this.savedToTposIds = new Set();

        // Start periodic cache cleanup
        this.startCacheCleanup();

        // API config
        this.proxyBaseUrl = 'https://n2store-fallback.onrender.com';
        this.tposPancakeUrl = 'https://n2store-tpos-pancake.onrender.com';
        this.tposBaseUrl = 'https://tomato.tpos.vn';
    }

    /**
     * Initialize chat manager
     */
    async initialize(containerId) {
        this.containerId = containerId;
        console.log('[TPOS-CHAT] Initializing with container:', containerId);

        // Render initial UI
        this.renderContainer();

        // Setup realtime event listeners (for rt-2.tpos.app SessionIndex)
        this.setupRealtimeListeners();

        // Load CRM Teams
        await this.loadCRMTeams();

        // Restore saved page selection from localStorage
        this.restoreSelection();
    }

    /**
     * Restore saved selection from localStorage
     */
    restoreSelection() {
        const savedPage = localStorage.getItem('tpos_selected_page');
        if (savedPage) {
            const crmSelect = document.getElementById('tposCrmTeamSelect');
            if (crmSelect) {
                // Check if the saved value exists in options
                const optionExists = Array.from(crmSelect.options).some(opt => opt.value === savedPage);
                if (optionExists) {
                    crmSelect.value = savedPage;
                    this.onCrmTeamChange(savedPage);
                }
            }
        }
    }

    /**
     * Setup realtime event listeners (for SessionIndex updates from rt-2.tpos.app)
     */
    setupRealtimeListeners() {
        // Listen for connection status changes
        window.addEventListener('tposRealtimeConnected', () => {
            this.updateConnectionStatus(true, 'session');
        });

        window.addEventListener('tposRealtimeDisconnected', () => {
            this.updateConnectionStatus(false, 'session');
        });
    }

    /**
     * Render the main container structure
     */
    renderContainer() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('[TPOS-CHAT] Container not found:', this.containerId);
            return;
        }

        container.innerHTML = `
            <div class="tpos-chat-wrapper">
                <!-- Merged Header: TPOS title + selectors + actions in one row -->
                <div class="tpos-chat-header tpos-merged-header">
                    <!-- TPOS Logo/Title -->
                    <div class="tpos-title-section">
                        <i data-lucide="shopping-cart" class="tpos-icon"></i>
                        <span class="tpos-title">TPOS</span>
                    </div>

                    <!-- Selectors -->
                    <div class="tpos-selectors">
                        <!-- CRM Team/Page Selector -->
                        <select id="tposCrmTeamSelect" class="tpos-filter-select" disabled>
                            <option value="">Chọn Page...</option>
                        </select>

                        <!-- Live Campaign Selector -->
                        <select id="tposLiveCampaignSelect" class="tpos-filter-select" disabled>
                            <option value="">Chọn Live Campaign...</option>
                        </select>
                    </div>

                    <!-- Actions -->
                    <div class="tpos-header-actions">
                        <div class="tpos-status-indicator" id="tposStatusIndicator">
                            <span class="status-dot disconnected"></span>
                            <span class="status-text">Live</span>
                        </div>
                        <button class="tpos-btn-refresh" id="btnTposRefresh" title="Refresh">
                            <i data-lucide="refresh-cw"></i>
                        </button>
                        <button class="tpos-btn-expand" id="btnTposExpand" title="Mở rộng" onclick="toggleFullscreen('tpos')">
                            <i data-lucide="maximize-2"></i>
                        </button>
                    </div>
                </div>

                <!-- Comment list -->
                <div class="tpos-conversation-list" id="tposCommentList">
                    <div class="tpos-empty">
                        <i data-lucide="message-square"></i>
                        <span>Chọn Page và Live Campaign để xem comment</span>
                    </div>
                </div>

                <!-- Loading indicator for infinite scroll -->
                <div class="tpos-load-more" id="tposLoadMore" style="display: none;">
                    <div class="tpos-loading-more">
                        <i data-lucide="loader-2" class="spin"></i>
                        <span>Đang tải thêm...</span>
                    </div>
                </div>
            </div>
        `;

        // Refresh Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Setup event handlers
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // CRM Team selector
        const crmSelect = document.getElementById('tposCrmTeamSelect');
        if (crmSelect) {
            crmSelect.addEventListener('change', (e) => this.onCrmTeamChange(e.target.value));
        }

        // Live Campaign selector
        const campaignSelect = document.getElementById('tposLiveCampaignSelect');
        if (campaignSelect) {
            campaignSelect.addEventListener('change', (e) => this.onLiveCampaignChange(e.target.value));
        }

        // Refresh button
        const btnRefresh = document.getElementById('btnTposRefresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.refresh());
        }

        // Infinite scroll - auto load more when near bottom
        const commentList = document.getElementById('tposCommentList');
        if (commentList) {
            commentList.addEventListener('scroll', () => this.handleScroll(commentList));
        }
    }

    /**
     * Handle scroll for infinite loading
     */
    handleScroll(container) {
        // Check if near bottom (within 100px)
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

        if (scrollBottom < 100 && this.hasMore && !this.isLoading) {
            console.log('[TPOS-CHAT] Auto-loading more comments...');
            this.loadMoreComments();
        }
    }

    /**
     * Update load more indicator visibility
     */
    updateLoadMoreIndicator() {
        const loadMoreContainer = document.getElementById('tposLoadMore');
        if (loadMoreContainer) {
            // Show spinner when loading more or when there's more to load
            loadMoreContainer.style.display = (this.isLoading && this.comments.length > 0) || this.hasMore ? 'flex' : 'none';

            // Refresh icon if showing
            if (loadMoreContainer.style.display !== 'none' && typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    // =====================================================
    // API METHODS
    // =====================================================

    /**
     * Get TPOS token
     */
    async getToken() {
        if (window.tposTokenManager) {
            return await window.tposTokenManager.getToken();
        }
        return null;
    }

    /**
     * Authenticated fetch with auto-retry on 401
     */
    async authenticatedFetch(url, options = {}) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('No token available');
        }

        let response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                ...options.headers
            }
        });

        // Auto-retry on 401: refresh token and retry once
        if (response.status === 401) {
            console.log('[TPOS-CHAT] Got 401, refreshing token and retrying...');
            if (window.tposTokenManager?.refresh) {
                await window.tposTokenManager.refresh();
                const newToken = await this.getToken();
                if (newToken) {
                    response = await fetch(url, {
                        ...options,
                        headers: {
                            'Authorization': `Bearer ${newToken}`,
                            'Accept': 'application/json',
                            ...options.headers
                        }
                    });
                }
            }
        }

        return response;
    }

    /**
     * Load CRM Teams with Pages (via proxy)
     */
    async loadCRMTeams() {
        try {
            const response = await this.authenticatedFetch(`${this.proxyBaseUrl}/facebook/crm-teams`);

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            this.crmTeams = data.value || [];

            console.log('[TPOS-CHAT] Loaded CRM Teams:', this.crmTeams.length);
            this.renderCrmTeamOptions();

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading CRM Teams:', error);
        }
    }

    /**
     * Load Live Campaigns for selected page (via proxy)
     */
    async loadLiveCampaigns(pageId) {
        try {
            const response = await this.authenticatedFetch(`${this.proxyBaseUrl}/facebook/live-campaigns?top=20`);

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            // Filter campaigns by pageId
            this.liveCampaigns = (data.value || []).filter(c =>
                c.Facebook_UserId === pageId && c.Facebook_LiveId
            );

            console.log('[TPOS-CHAT] Loaded Live Campaigns:', this.liveCampaigns.length);
            this.renderLiveCampaignOptions();

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading Live Campaigns:', error);
        }
    }

    /**
     * Load Live Campaigns from ALL pages
     */
    async loadLiveCampaignsFromAllPages() {
        try {
            const response = await this.authenticatedFetch(`${this.proxyBaseUrl}/facebook/live-campaigns?top=50`);

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            const allPageIds = this.allPages.map(p => p.Facebook_PageId);

            // Filter campaigns that belong to any of the selected pages
            this.liveCampaigns = (data.value || []).filter(c =>
                allPageIds.includes(c.Facebook_UserId) && c.Facebook_LiveId
            );

            console.log('[TPOS-CHAT] Loaded Live Campaigns from all pages:', this.liveCampaigns.length);
            this.renderLiveCampaignOptions();

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading Live Campaigns:', error);
        }
    }

    /**
     * Load comments for selected campaign
     */
    async loadComments(append = false) {
        if (this.isLoading || !this.selectedPage || !this.selectedCampaign) return;

        this.isLoading = true;
        const listContainer = document.getElementById('tposCommentList');

        // Show loading indicator for infinite scroll
        if (append) {
            this.updateLoadMoreIndicator();
        }

        if (!append) {
            this.comments = [];
            this.nextPageUrl = null;
            if (listContainer) {
                listContainer.innerHTML = `
                    <div class="tpos-loading">
                        <i data-lucide="loader-2" class="spin"></i>
                        <span>Đang tải comment...</span>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }

        try {
            const token = await this.getToken();
            if (!token) throw new Error('No token');

            const pageId = this.selectedPage.Facebook_PageId;
            const postId = this.selectedCampaign.Facebook_LiveId;

            let url;
            if (append && this.nextPageUrl) {
                // For pagination, extract cursor and use proxy
                const nextUrl = new URL(this.nextPageUrl);
                const after = nextUrl.searchParams.get('after');
                url = `${this.proxyBaseUrl}/facebook/comments?pageid=${pageId}&postId=${postId}&limit=50${after ? '&after=' + encodeURIComponent(after) : ''}`;
            } else {
                url = `${this.proxyBaseUrl}/facebook/comments?pageid=${pageId}&postId=${postId}&limit=50`;
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            const newComments = data.data || [];

            if (append) {
                this.comments = [...this.comments, ...newComments];
            } else {
                this.comments = newComments;
            }

            // Update pagination
            this.nextPageUrl = data.paging?.next || null;
            this.hasMore = !!this.nextPageUrl;

            console.log('[TPOS-CHAT] Loaded comments:', newComments.length, 'Total:', this.comments.length);
            this.renderComments();

            // Start SSE and load SessionIndex after loading initial comments
            if (!append) {
                this.startSSE();
                this.loadSessionIndex();
            }

            // Load partner info for comments (async, will re-render when done)
            this.loadPartnerInfoForComments();

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading comments:', error);
            if (listContainer) {
                listContainer.innerHTML = `
                    <div class="tpos-error">
                        <i data-lucide="alert-circle"></i>
                        <span>Lỗi: ${error.message}</span>
                        <button class="tpos-btn-retry" onclick="window.tposChatManager.loadComments()">Thử lại</button>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } finally {
            this.isLoading = false;
            this.updateLoadMoreIndicator();
        }
    }

    /**
     * Load more comments (pagination)
     */
    async loadMoreComments() {
        if (this.hasMore && !this.isLoading) {
            await this.loadComments(true);
        }
    }

    /**
     * Load SessionIndex (comment orders) for the current post
     * Maps ASUID -> order index for displaying badges
     */
    async loadSessionIndex() {
        if (!this.selectedCampaign) return;

        try {
            const token = await this.getToken();
            if (!token) return;

            // Facebook_LiveId format: "pageId_postId"
            const fullPostId = this.selectedCampaign.Facebook_LiveId;

            const url = `${this.proxyBaseUrl}/facebook/comment-orders?postId=${fullPostId}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            const orders = data.value || [];

            // Clear and rebuild map
            this.sessionIndexMap.clear();

            orders.forEach(item => {
                const asuid = item.asuid || item.id;
                if (asuid && item.orders && item.orders.length > 0) {
                    // Use the first order's index (usually the earliest)
                    const firstOrder = item.orders[0];
                    this.sessionIndexMap.set(asuid, {
                        index: firstOrder.index,
                        session: firstOrder.session,
                        code: firstOrder.code
                    });
                }
            });

            console.log('[TPOS-CHAT] Loaded SessionIndex for', this.sessionIndexMap.size, 'users');

            // Re-render to show badges
            if (this.comments.length > 0) {
                this.renderComments();
            }

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading SessionIndex:', error);
        }
    }

    // =====================================================
    // SSE REALTIME
    // =====================================================

    /**
     * Start SSE connection for realtime comments (via proxy)
     */
    startSSE() {
        if (!this.selectedPage || !this.selectedCampaign) return;

        // Close existing connection
        this.stopSSE();

        const pageId = this.selectedPage.Facebook_PageId;
        const postId = this.selectedCampaign.Facebook_LiveId;

        // Get token synchronously (it should be cached)
        this.getToken().then(token => {
            if (!token) {
                console.error('[TPOS-CHAT] No token for SSE');
                return;
            }

            // Use proxy for SSE to avoid CORS
            // Note: EventSource doesn't support custom headers, so we pass token in URL
            const sseUrl = `${this.proxyBaseUrl}/facebook/comments/stream?pageid=${pageId}&postId=${postId}&token=${encodeURIComponent(token)}`;

            console.log('[TPOS-CHAT] Starting SSE connection via proxy...');

            this.eventSource = new EventSource(sseUrl);

            this.eventSource.onopen = () => {
                console.log('[TPOS-CHAT] SSE connected');
                this.sseConnected = true;
                this.updateConnectionStatus(true, 'sse');
            };

            this.eventSource.onmessage = (event) => {
                this.handleSSEMessage(event.data);
            };

            this.eventSource.onerror = (error) => {
                console.error('[TPOS-CHAT] SSE error:', error);
                this.sseConnected = false;
                this.updateConnectionStatus(false, 'sse');

                // Auto-reconnect after 5 seconds
                setTimeout(() => {
                    if (this.selectedCampaign) {
                        console.log('[TPOS-CHAT] SSE reconnecting...');
                        this.startSSE();
                    }
                }, 5000);
            };
        });
    }

    /**
     * Stop SSE connection
     */
    stopSSE() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            this.sseConnected = false;
            console.log('[TPOS-CHAT] SSE disconnected');
        }
    }

    /**
     * Check if a comment is from Page or Pancake accounts (not a customer)
     */
    isPageOrStaffComment(comment) {
        const fromId = comment.from?.id;
        if (!fromId) return false;

        // Check if from current page
        const pageId = this.selectedPage?.Facebook_PageId;
        if (pageId && fromId === pageId) {
            return true;
        }

        // Check if from any selected pages (multi-page mode)
        if (this.selectedPages.length > 0) {
            const selectedPageIds = this.selectedPages.map(p => p.Facebook_PageId);
            if (selectedPageIds.includes(fromId)) {
                return true;
            }
        }

        // Check if from any Pancake-managed pages
        if (window.pancakeDataManager?.pageIds) {
            if (window.pancakeDataManager.pageIds.includes(fromId)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Handle SSE message
     */
    handleSSEMessage(data) {
        try {
            // SSE data format: array of comments
            const comments = JSON.parse(data);

            if (!Array.isArray(comments)) return;

            comments.forEach(comment => {
                // Check if comment already exists
                const exists = this.comments.some(c => c.id === comment.id);

                if (!exists) {
                    const isStaff = this.isPageOrStaffComment(comment);
                    console.log('[TPOS-CHAT] 💬 New comment:', comment.from?.name, '-', comment.message?.substring(0, 30), isStaff ? '(staff)' : '(customer)');

                    if (isStaff) {
                        // Staff/Page comment - add to end, don't highlight or scroll
                        this.comments.push(comment);
                        this.renderComments();
                    } else {
                        // Customer comment - add to beginning and highlight
                        this.comments.unshift(comment);
                        this.renderComments();

                        // Highlight and scroll to new customer comment
                        setTimeout(() => {
                            const item = document.querySelector(`[data-comment-id="${comment.id}"]`);
                            if (item) {
                                item.classList.add('highlight');
                                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                setTimeout(() => item.classList.remove('highlight'), 3000);
                            }
                        }, 100);
                    }
                }
            });
        } catch (error) {
            console.error('[TPOS-CHAT] Error parsing SSE message:', error);
        }
    }

    // =====================================================
    // UI RENDER METHODS
    // =====================================================

    /**
     * Render CRM Team/Page options
     */
    renderCrmTeamOptions() {
        const select = document.getElementById('tposCrmTeamSelect');
        if (!select) return;

        // Collect all pages first
        this.allPages = [];
        this.crmTeams.forEach(team => {
            if (team.Childs && team.Childs.length > 0) {
                team.Childs.forEach(page => {
                    if (page.Facebook_PageId && page.Facebook_TypeId === 'Page') {
                        this.allPages.push({
                            ...page,
                            teamId: team.Id,
                            teamName: team.Name
                        });
                    }
                });
            }
        });

        let options = '<option value="">Chọn Page...</option>';

        // Add "All Pages" option if more than 1 page
        if (this.allPages.length > 1) {
            options += `<option value="all">📋 Tất cả Pages (${this.allPages.length})</option>`;
        }

        this.crmTeams.forEach(team => {
            // Add parent team as optgroup
            if (team.Childs && team.Childs.length > 0) {
                options += `<optgroup label="${this.escapeHtml(team.Name)}">`;
                team.Childs.forEach(page => {
                    if (page.Facebook_PageId && page.Facebook_TypeId === 'Page') {
                        options += `<option value="${team.Id}:${page.Id}" data-page-id="${page.Facebook_PageId}">
                            ${this.escapeHtml(page.Facebook_PageName || page.Name)}
                        </option>`;
                    }
                });
                options += '</optgroup>';
            }
        });

        select.innerHTML = options;
        select.disabled = false;
    }

    /**
     * Render Live Campaign options
     */
    renderLiveCampaignOptions() {
        const select = document.getElementById('tposLiveCampaignSelect');
        if (!select) return;

        let options = '<option value="">Chọn Live Campaign...</option>';

        this.liveCampaigns.forEach(campaign => {
            options += `<option value="${campaign.Id}">
                ${this.escapeHtml(campaign.Name)} (${campaign.Facebook_UserName || ''})
            </option>`;
        });

        select.innerHTML = options;
        select.disabled = this.liveCampaigns.length === 0;
    }

    /**
     * Render comments list
     */
    renderComments() {
        const listContainer = document.getElementById('tposCommentList');
        if (!listContainer) return;

        if (this.comments.length === 0) {
            listContainer.innerHTML = `
                <div class="tpos-empty">
                    <i data-lucide="message-square"></i>
                    <span>Chưa có comment nào</span>
                    <p style="font-size: 12px; color: #94a3b8; margin-top: 8px;">
                        Comment mới sẽ tự động hiển thị khi có người bình luận
                    </p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        listContainer.innerHTML = this.comments.map(comment => this.renderCommentItem(comment)).join('');

        // Update load more indicator (show when loading more)
        this.updateLoadMoreIndicator();

        // Refresh Lucide icons
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Render single comment item
     */
    renderCommentItem(comment) {
        const id = comment.id;
        const message = comment.message || '';
        const fromName = comment.from?.name || 'Unknown';
        const fromId = comment.from?.id || '';
        const createdTime = comment.created_time;
        const isHidden = comment.is_hidden;

        // Get avatar URL - prioritize SSE direct URL, fallback to building from PSID
        const directPictureUrl = comment.from?.picture?.data?.url || '';
        const pictureUrl = this.getAvatarUrl(fromId, directPictureUrl);

        // Format time
        const timeStr = this.formatTime(createdTime);

        // Get SessionIndex badge for this user
        const sessionInfo = this.sessionIndexMap.get(fromId);
        const sessionIndexBadge = sessionInfo
            ? `<span class="session-index-badge" title="${sessionInfo.code || '#' + sessionInfo.index}">${sessionInfo.index}</span>`
            : '';

        // Generate placeholder color based on name
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
        ];
        const colorIndex = fromName.charCodeAt(0) % colors.length;
        const gradientColor = colors[colorIndex];
        const initial = fromName.charAt(0).toUpperCase();

        // Get partner info from cache (using smart cache getter)
        const partner = this.getPartnerCache(fromId) || {};
        const statusText = partner.StatusText || '';
        const phone = partner.Phone || '';
        const address = partner.Street || '';

        // Get debt from cache
        const debt = this.getDebtForPhone(phone);
        const debtDisplay = debt !== null && debt !== undefined ? this.formatDebt(debt) : '';
        // Respect debt display settings
        const hasDebt = this.showDebt && (
            (debt && debt > 0) || // Has positive debt
            (this.showZeroDebt && debt !== null && debt !== undefined) // Show zero debt if enabled
        );

        // Check if already saved to Tpos (also check Pancake's cache)
        const isSavedToTpos = this.savedToTposIds.has(fromId) ||
            (window.pancakeChatManager?.tposSavedCustomerIds?.has(fromId));

        // Status dropdown options
        const statusOptions = this.getStatusOptions();

        // Build status dropdown HTML
        const statusDropdownHtml = statusOptions.map(opt =>
            `<div class="inline-status-option" style="padding: 6px 10px; cursor: pointer; font-size: 12px;"
                 onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'"
                 onclick="event.stopPropagation(); window.tposChatManager.selectInlineStatus('${fromId}', '${opt.value}', '${opt.text}')">
                ${opt.text}
            </div>`
        ).join('');

        return `
            <div class="tpos-conversation-item ${isHidden ? 'is-hidden' : ''}"
                 data-comment-id="${id}"
                 onclick="window.tposChatManager.selectComment('${id}')">
                <div class="tpos-conv-avatar">
                    ${pictureUrl
                ? `<img src="${pictureUrl}" class="avatar-img" alt="${this.escapeHtml(fromName)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <div class="avatar-placeholder" style="display: none; background: ${gradientColor};">${initial}</div>`
                : `<div class="avatar-placeholder" style="background: ${gradientColor};">${initial}</div>`
            }
                    ${sessionIndexBadge}
                    <span class="channel-badge">
                        <i data-lucide="facebook" class="channel-icon fb"></i>
                    </span>
                </div>
                <div class="tpos-conv-content" style="flex: 1; min-width: 0;">
                    <!-- Row 1: Name + Hidden tag -->
                    <div class="tpos-conv-header" style="display: flex; align-items: center; gap: 6px;">
                        <span class="customer-name" style="font-weight: 600;">${this.escapeHtml(fromName)}</span>
                        ${isHidden ? '<span class="tpos-tag" style="background:#fee2e2;color:#dc2626;font-size:10px;padding:2px 6px;border-radius:4px;">Ẩn</span>' : ''}
                    </div>

                    <!-- Row 2: COMMENT - Most important, prominent display -->
                    <div class="tpos-conv-message" style="margin-top: 6px; color: #1f2937; font-size: 14px; font-weight: 500; line-height: 1.4; background: #f0f9ff; padding: 8px 10px; border-radius: 6px; border-left: 3px solid #3b82f6;">${this.escapeHtml(message)}</div>

                    <!-- Row 3: Status + Phone + Address (compact row) -->
                    <div class="tpos-conv-info" style="display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap;" onclick="event.stopPropagation();">
                        <!-- Status Dropdown -->
                        <div class="inline-status-container" style="position: relative; display: inline-flex;">
                            <button id="status-btn-${fromId}" style="display: flex; align-items: center; gap: 3px; padding: 3px 8px; border: 1px solid #e5e7eb; border-radius: 4px; background: #f9fafb; cursor: pointer; font-size: 11px; color: #374151;"
                                    onclick="event.stopPropagation(); window.tposChatManager.toggleInlineStatusDropdown('${fromId}')">
                                <span id="status-text-${fromId}">${statusText || 'Trạng thái'}</span>
                                <i data-lucide="chevron-down" style="width: 10px; height: 10px;"></i>
                            </button>
                            <div id="status-dropdown-${fromId}" style="display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #e5e7eb; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; min-width: 120px;">
                                ${statusDropdownHtml}
                            </div>
                        </div>

                        <!-- Phone Input + Debt Badge -->
                        <div class="inline-phone-container" style="display: inline-flex; align-items: center; gap: 2px;">
                            <input type="text" id="phone-${fromId}" value="${this.escapeHtml(phone)}" placeholder="SĐT"
                                   style="width: 100px; padding: 3px 6px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 11px; background: #f9fafb;"
                                   onclick="event.stopPropagation();">
                            <button id="save-phone-${fromId}" style="padding: 3px 4px; border: none; background: transparent; cursor: pointer;"
                                    onclick="event.stopPropagation(); window.tposChatManager.saveInlinePhone('${fromId}', 'phone-${fromId}')"
                                    title="Lưu SĐT">
                                <i data-lucide="save" style="width: 14px; height: 14px; color: #6b7280;"></i>
                            </button>
                            ${hasDebt ? `<span class="debt-badge" style="padding: 2px 6px; background: #fef2f2; color: #dc2626; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap;" title="Công nợ">Nợ: ${debtDisplay}</span>` : ''}
                        </div>

                        <!-- Address Input -->
                        <div class="inline-addr-container" style="display: inline-flex; align-items: center; gap: 2px; flex: 1; min-width: 150px;">
                            <input type="text" id="addr-${fromId}" value="${this.escapeHtml(address)}" placeholder="Địa chỉ"
                                   style="flex: 1; padding: 3px 6px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 11px; background: #f9fafb; min-width: 0;"
                                   onclick="event.stopPropagation();">
                            <button id="save-addr-${fromId}" style="padding: 3px 4px; border: none; background: transparent; cursor: pointer;"
                                    onclick="event.stopPropagation(); window.tposChatManager.saveInlineAddress('${fromId}', 'addr-${fromId}')"
                                    title="Lưu địa chỉ">
                                <i data-lucide="save" style="width: 14px; height: 14px; color: #6b7280;"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="tpos-conv-actions">
                    <button class="tpos-action-btn tpos-phone-btn" title="Xem thông tin khách hàng" onclick="event.stopPropagation(); window.tposChatManager.showCustomerInfo('${fromId}', '${this.escapeHtml(fromName)}')">
                        <i data-lucide="phone"></i>
                    </button>
                    ${isSavedToTpos
                        ? `<span class="tpos-saved-badge" title="Đã lưu vào Tpos" style="color: #10b981; padding: 4px;">
                               <i data-lucide="check" style="width: 16px; height: 16px;"></i>
                           </span>`
                        : `<button class="tpos-action-btn tpos-save-btn" title="Lưu vào Tpos (Pancake)" onclick="event.stopPropagation(); window.tposChatManager.handleSaveToTpos('${fromId}', '${this.escapeHtml(fromName)}')">
                               <i data-lucide="plus"></i>
                           </button>`
                    }
                </div>
                <div class="tpos-conv-meta">
                    <span class="tpos-conv-time">${timeStr}</span>
                </div>
            </div>
        `;
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    /**
     * Handle CRM Team selection change
     */
    async onCrmTeamChange(value) {
        if (!value) {
            this.selectedTeamId = null;
            this.selectedPage = null;
            this.selectedPages = [];
            this.liveCampaigns = [];
            this.renderLiveCampaignOptions();
            return;
        }

        // Handle "all pages" selection
        if (value === 'all') {
            this.selectedTeamId = null;
            this.selectedPage = this.allPages[0] || null; // Use first page as primary
            this.selectedPages = [...this.allPages]; // All pages selected

            console.log('[TPOS-CHAT] Selected ALL pages:', this.allPages.length);

            // Save to localStorage
            localStorage.setItem('tpos_selected_page', value);

            // Load campaigns from all pages
            await this.loadLiveCampaignsFromAllPages();

            // Auto-select first campaign if available
            if (this.liveCampaigns.length > 0) {
                const firstCampaign = this.liveCampaigns[0];
                const campaignSelect = document.getElementById('tposLiveCampaignSelect');
                if (campaignSelect) {
                    campaignSelect.value = firstCampaign.Id;
                }
                await this.onLiveCampaignChange(firstCampaign.Id);
                return;
            }
        } else {
            // Single page selection
            const [teamId, pageId] = value.split(':');
            this.selectedTeamId = parseInt(teamId);

            // Find the selected page
            for (const team of this.crmTeams) {
                if (team.Id === this.selectedTeamId) {
                    this.selectedPage = team.Childs?.find(p => p.Id === parseInt(pageId));
                    break;
                }
            }

            this.selectedPages = this.selectedPage ? [this.selectedPage] : [];

            if (this.selectedPage) {
                console.log('[TPOS-CHAT] Selected page:', this.selectedPage.Facebook_PageName);

                // Save to localStorage
                localStorage.setItem('tpos_selected_page', value);

                await this.loadLiveCampaigns(this.selectedPage.Facebook_PageId);

                // Auto-select first campaign if available
                if (this.liveCampaigns.length > 0) {
                    const firstCampaign = this.liveCampaigns[0];
                    const campaignSelect = document.getElementById('tposLiveCampaignSelect');
                    if (campaignSelect) {
                        campaignSelect.value = firstCampaign.Id;
                    }
                    await this.onLiveCampaignChange(firstCampaign.Id);
                    return;
                }
            }
        }

        // Reset campaign selection
        this.selectedCampaign = null;
        this.stopSSE();
        this.comments = [];
        this.renderComments();
    }

    /**
     * Handle Live Campaign selection change
     */
    async onLiveCampaignChange(campaignId) {
        if (!campaignId) {
            this.selectedCampaign = null;
            this.stopSSE();
            this.comments = [];
            this.clearAllCaches(); // Clear caches when deselecting
            this.renderComments();
            return;
        }

        // Clear caches when switching campaigns to free memory
        this.clearAllCaches();

        this.selectedCampaign = this.liveCampaigns.find(c => c.Id === campaignId);

        if (this.selectedCampaign) {
            // When multiple pages selected, update selectedPage to match campaign's page
            if (this.selectedPages.length > 1) {
                const campaignPageId = this.selectedCampaign.Facebook_UserId;
                this.selectedPage = this.allPages.find(p => p.Facebook_PageId === campaignPageId) || this.selectedPage;
            }

            console.log('[TPOS-CHAT] Selected campaign:', this.selectedCampaign.Name, '- Page:', this.selectedPage?.Facebook_PageName);
            await this.loadComments();
        }
    }

    /**
     * Select a comment
     */
    selectComment(commentId) {
        // Update selection UI
        document.querySelectorAll('.tpos-conversation-item').forEach(item => {
            item.classList.remove('selected');
        });
        const selectedItem = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        // Dispatch event for other components
        const comment = this.comments.find(c => c.id === commentId);
        if (comment) {
            window.dispatchEvent(new CustomEvent('tposCommentSelected', {
                detail: { comment }
            }));
        }
    }

    /**
     * Refresh - reload everything
     */
    async refresh() {
        this.stopSSE();

        if (this.selectedCampaign) {
            await this.loadComments();
        } else if (this.selectedPage) {
            await this.loadLiveCampaigns(this.selectedPage.Facebook_PageId);
        } else {
            await this.loadCRMTeams();
        }
    }

    // =====================================================
    // ACTIONS
    // =====================================================

    /**
     * Handle phone action - placeholder for future functionality
     */
    handlePhoneAction(customerId, customerName) {
        console.log('[TPOS-CHAT] Phone action:', { customerId, customerName });
        // TODO: Add phone functionality here
        if (window.notificationManager) {
            window.notificationManager.show(`Gọi điện: ${customerName}`, 'info');
        }
    }

    /**
     * Handle save to Tpos button click (the "+" button)
     * Saves customer to "Lưu Tpos" list on Pancake side
     */
    async handleSaveToTpos(customerId, customerName) {
        console.log('='.repeat(50));
        console.log('[TPOS-SAVE] 🔵 BẮT ĐẦU LƯU VÀO TPOS');
        console.log('[TPOS-SAVE] Customer ID:', customerId);
        console.log('[TPOS-SAVE] Customer Name:', customerName);
        console.log('[TPOS-SAVE] ID Type:', typeof customerId);
        console.log('[TPOS-SAVE] ID Length:', customerId?.length);

        // Validate inputs
        if (!customerId || !customerName) {
            console.error('[TPOS-SAVE] ❌ THIẾU DỮ LIỆU:', { customerId, customerName });
            if (window.notificationManager) {
                window.notificationManager.show('Thiếu thông tin khách hàng', 'error');
            }
            return;
        }

        // Get partner info from cache for notes
        const partner = this.getPartnerCache(customerId) || {};
        console.log('[TPOS-SAVE] Partner cache:', partner);
        const phone = partner.Phone || '';
        const address = partner.Street || '';

        // Build notes from partner info
        const notes = [
            phone ? `SĐT: ${phone}` : '',
            address ? `Địa chỉ: ${address}` : '',
            this.selectedCampaign?.title ? `Campaign: ${this.selectedCampaign.title}` : ''
        ].filter(Boolean).join(' | ');

        const requestBody = {
            customerId,
            customerName,
            pageId: this.selectedPage?.id || null,
            pageName: this.selectedPage?.name || null,
            savedBy: 'TPOS Comment',
            notes: notes || null
        };
        console.log('[TPOS-SAVE] 📤 Request body:', JSON.stringify(requestBody, null, 2));
        console.log('[TPOS-SAVE] API URL:', `${this.tposPancakeUrl}/api/tpos-saved`);

        try {
            const response = await fetch(`${this.tposPancakeUrl}/api/tpos-saved`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            console.log('[TPOS-SAVE] Response status:', response.status);
            console.log('[TPOS-SAVE] Response ok:', response.ok);

            const result = await response.json();
            console.log('[TPOS-SAVE] 📥 Response body:', JSON.stringify(result, null, 2));

            if (result.success) {
                console.log('[TPOS-SAVE] ✅ LƯU THÀNH CÔNG!');

                // Track locally to hide "+" button
                this.savedToTposIds.add(customerId);
                console.log('[TPOS-SAVE] Added to savedToTposIds:', Array.from(this.savedToTposIds));

                // Update Pancake's saved IDs cache
                if (window.pancakeChatManager) {
                    window.pancakeChatManager.tposSavedCustomerIds.add(customerId);
                    console.log('[TPOS-SAVE] Added to Pancake cache');
                    // Re-render if on Lưu Tpos tab
                    if (window.pancakeChatManager.filterType === 'tpos-saved') {
                        window.pancakeChatManager.renderConversationList();
                    }
                }

                // Update only the specific button (not full re-render)
                this.updateSaveButtonToCheckmark(customerId);

                if (window.notificationManager) {
                    window.notificationManager.show(`Đã lưu: ${customerName}`, 'success');
                }
            } else {
                console.error('[TPOS-SAVE] ❌ API TRẢ VỀ LỖI:', result);
                throw new Error(result.message || 'Lỗi không xác định');
            }
        } catch (error) {
            console.error('[TPOS-SAVE] ❌ EXCEPTION:', error);
            console.error('[TPOS-SAVE] Error name:', error.name);
            console.error('[TPOS-SAVE] Error message:', error.message);
            console.error('[TPOS-SAVE] Error stack:', error.stack);
            if (window.notificationManager) {
                window.notificationManager.show(`Lỗi: ${error.message}`, 'error');
            }
        }
        console.log('='.repeat(50));
    }

    /**
     * Update save button to checkmark without full re-render
     */
    updateSaveButtonToCheckmark(customerId) {
        // Find all comment items and look for the one with this customer
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Find button by onclick attribute containing the customerId
        const saveBtn = container.querySelector(`button[onclick*="handleSaveToTpos('${customerId}'"]`);
        if (saveBtn) {
            // Replace button with checkmark span
            const checkmark = document.createElement('span');
            checkmark.className = 'tpos-saved-badge';
            checkmark.title = 'Đã lưu vào Tpos';
            checkmark.style.cssText = 'color: #10b981; padding: 4px;';
            checkmark.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i>';
            saveBtn.replaceWith(checkmark);

            // Re-initialize lucide icons for the new element
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    /**
     * Show customer info modal
     * Fetches data from TPOS API and displays in modal
     */
    async showCustomerInfo(customerId, customerName) {
        console.log('[TPOS-CHAT] Show customer info:', { customerId, customerName });

        if (!customerId) {
            console.error('[TPOS-CHAT] No customerId provided');
            if (window.notificationManager) {
                window.notificationManager.show('Không có ID khách hàng', 'error');
            }
            return;
        }

        // Show modal with loading state
        const modal = document.getElementById('customerInfoModal');
        const titleEl = document.getElementById('customerInfoTitle');
        const bodyEl = document.getElementById('customerInfoBody');

        if (!modal || !bodyEl) {
            console.error('[TPOS-CHAT] Customer info modal not found');
            return;
        }

        titleEl.textContent = `Thông tin: ${customerName}`;
        bodyEl.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i data-lucide="loader-2" class="spin" style="width: 32px; height: 32px; color: #3b82f6;"></i>
                <p style="margin-top: 12px; color: #6b7280;">Đang tải thông tin...</p>
            </div>
        `;
        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();

        try {
            // Get CRM Team ID - use selectedTeamId or extract from selectedPage
            const crmTeamId = this.selectedTeamId || this.selectedPage?.CRMTeamId || this.selectedPage?.Id;

            if (!crmTeamId) {
                throw new Error('Không xác định được CRM Team ID');
            }

            // Fetch customer info from TPOS API
            const apiUrl = `${this.tposBaseUrl}/rest/v2.0/chatomni/info/${crmTeamId}_${customerId}`;
            console.log('[TPOS-CHAT] Fetching customer info:', apiUrl);

            const response = await this.authenticatedFetch(apiUrl);

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            console.log('[TPOS-CHAT] Customer info loaded:', data);

            // Render the customer info
            this.renderCustomerInfoModal(data, customerName);

        } catch (error) {
            console.error('[TPOS-CHAT] Error loading customer info:', error);
            bodyEl.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444;"></i>
                    <p style="margin-top: 12px; color: #ef4444; font-weight: 500;">Lỗi tải thông tin</p>
                    <p style="color: #6b7280; font-size: 13px;">${error.message}</p>
                    <button onclick="window.tposChatManager.closeCustomerInfoModal()"
                            style="margin-top: 16px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        Đóng
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }

    /**
     * Status options for partner
     */
    getStatusOptions() {
        return [
            { value: '#5cb85c_Bình thường', text: 'Bình thường', color: '#5cb85c' },
            { value: '#d9534f_Bom hàng', text: 'Bom hàng', color: '#d9534f' },
            { value: '#f0ad4e_Cảnh báo', text: 'Cảnh báo', color: '#f0ad4e' },
            { value: '#5bc0de_Khách sỉ', text: 'Khách sỉ', color: '#5bc0de' },
            { value: '#d9534f_Nguy hiểm', text: 'Nguy hiểm', color: '#d9534f' },
            { value: '#337ab7_Thân thiết', text: 'Thân thiết', color: '#337ab7' },
            { value: '#9c27b0_Vip', text: 'Vip', color: '#9c27b0' },
            { value: '#ff9800_VIP', text: 'VIP', color: '#ff9800' }
        ];
    }

    /**
     * Update partner status via TPOS API
     */
    async updatePartnerStatus(partnerId, statusValue) {
        console.log('[TPOS-CHAT] Updating partner status:', partnerId, statusValue);

        try {
            const apiUrl = `${this.tposBaseUrl}/odata/Partner(${partnerId})/ODataService.UpdateStatus`;

            const response = await this.authenticatedFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({ status: statusValue })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            // Extract status text from value (e.g., "#5cb85c_Bình thường" -> "Bình thường")
            const statusText = statusValue.split('_')[1] || statusValue;

            if (window.notificationManager) {
                window.notificationManager.show(`Đã cập nhật trạng thái: ${statusText}`, 'success');
            }

            return true;
        } catch (error) {
            console.error('[TPOS-CHAT] Error updating status:', error);
            if (window.notificationManager) {
                window.notificationManager.show(`Lỗi cập nhật trạng thái: ${error.message}`, 'error');
            }
            return false;
        }
    }

    /**
     * Render customer info data into modal
     */
    renderCustomerInfoModal(data, customerName) {
        const bodyEl = document.getElementById('customerInfoBody');
        if (!bodyEl) return;

        const partner = data.Partner || {};
        const order = data.Order || {};
        const conversation = data.Conversation || {};
        const revenue = data.Revenue || {};

        // Store partner ID for status update
        this.currentPartnerId = partner.Id;

        // Status options
        const statusOptions = this.getStatusOptions();
        const currentStatus = partner.StatusText || 'Bình thường';
        const currentStatusOption = statusOptions.find(s => s.text === currentStatus) || statusOptions[0];

        // Build status dropdown options HTML (simple text only)
        const statusOptionsHtml = statusOptions.map(opt =>
            `<div class="status-option" data-value="${opt.value}" style="padding: 8px 12px; cursor: pointer; font-size: 13px;"
                 onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'"
                 onclick="window.tposChatManager.selectStatus('${opt.value}', '${opt.text}')">
                ${opt.text}
            </div>`
        ).join('');

        // Status badge class for order
        const getStatusClass = (status) => {
            if (status === 0 || status === 'Nháp') return 'status-normal';
            if (status === 1 || status === 'Đã xác nhận') return 'status-normal';
            if (status === 'cancel' || status === 'Huỷ bỏ') return 'status-danger';
            return 'status-warning';
        };

        // Format date
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
            return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        };

        bodyEl.innerHTML = `
            <!-- Customer Basic Info -->
            <div class="customer-section">
                <h4><i data-lucide="user" style="width: 16px; height: 16px;"></i> Thông tin khách hàng</h4>
                <div class="customer-field">
                    <label>Tên:</label>
                    <span><strong>${this.escapeHtml(partner.Name || customerName)}</strong> (Id: ${partner.Id || '-'})</span>
                </div>
                <div class="customer-field">
                    <label>Trạng thái:</label>
                    <div class="status-dropdown-container" style="position: relative; display: inline-block;">
                        <button id="statusDropdownBtn" class="status-dropdown-btn"
                                style="display: flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid #d1d5db; border-radius: 4px; background: white; cursor: pointer; font-size: 13px;"
                                onclick="window.tposChatManager.toggleStatusDropdown()">
                            <span id="statusText">${currentStatus}</span>
                            <i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>
                        </button>
                        <div id="statusDropdown" style="display: none; position: absolute; top: 100%; left: 0; min-width: 160px; background: white; border: 1px solid #d1d5db; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; margin-top: 4px;">
                            ${statusOptionsHtml}
                        </div>
                    </div>
                </div>
                <div class="customer-field">
                    <label>Điện thoại:</label>
                    <span>${partner.Phone || conversation.Phone || '-'}</span>
                </div>
                <div class="customer-field">
                    <label>Email:</label>
                    <span>${partner.Email || '-'}</span>
                </div>
                <div class="customer-field">
                    <label>Địa chỉ:</label>
                    <span>${partner.FullAddress || partner.Street || '-'}</span>
                </div>
                ${partner.Comment ? `
                <div class="customer-field">
                    <label>Ghi chú:</label>
                    <span>${this.escapeHtml(partner.Comment)}</span>
                </div>
                ` : ''}
            </div>

            <!-- Revenue Info -->
            <div class="customer-section">
                <h4><i data-lucide="trending-up" style="width: 16px; height: 16px;"></i> Doanh thu</h4>
                <div class="customer-field">
                    <label>Tổng doanh thu:</label>
                    <span><strong>${(revenue.RevenueTotal || 0).toLocaleString('vi-VN')}đ</strong></span>
                </div>
            </div>

            <!-- Order Info -->
            ${order.Id ? `
            <div class="customer-section">
                <h4><i data-lucide="shopping-bag" style="width: 16px; height: 16px;"></i> Đơn hàng gần nhất</h4>
                <table class="order-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Trạng thái</th>
                            <th>Ngày tạo</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><span class="order-code">${order.Code || order.Id}</span></td>
                            <td><span class="status-badge ${getStatusClass(order.Status)}">${order.StatusText || 'Nháp'}</span></td>
                            <td>${formatDate(order.DateCreated)}</td>
                        </tr>
                    </tbody>
                </table>
                ${order.Note ? `
                <div style="margin-top: 12px; padding: 8px 12px; background: #fef3c7; border-radius: 6px;">
                    <strong style="font-size: 12px; color: #92400e;">Ghi chú đơn:</strong>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #92400e;">${this.escapeHtml(order.Note)}</p>
                </div>
                ` : ''}
            </div>
            ` : `
            <div class="customer-section">
                <h4><i data-lucide="shopping-bag" style="width: 16px; height: 16px;"></i> Đơn hàng</h4>
                <p style="color: #6b7280; font-size: 13px; text-align: center; padding: 20px 0;">Chưa có đơn hàng</p>
            </div>
            `}

            <!-- Actions -->
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="window.tposChatManager.closeCustomerInfoModal()"
                        style="flex: 1; padding: 10px 16px; background: #f3f4f6; color: #374151; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    Đóng
                </button>
                ${order.Code ? `
                <button onclick="window.open('https://tomato.tpos.vn/sale-online/order/${order.Id}', '_blank')"
                        style="flex: 1; padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    <i data-lucide="external-link" style="width: 14px; height: 14px; display: inline; vertical-align: middle;"></i>
                    Mở đơn trên TPOS
                </button>
                ` : ''}
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Close customer info modal
     */
    closeCustomerInfoModal() {
        const modal = document.getElementById('customerInfoModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Toggle status dropdown visibility
     */
    toggleStatusDropdown() {
        const dropdown = document.getElementById('statusDropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    }

    /**
     * Select status from dropdown and update via API
     */
    async selectStatus(value, text) {
        // Hide dropdown
        const dropdown = document.getElementById('statusDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }

        // Update UI immediately
        const statusText = document.getElementById('statusText');
        if (statusText) statusText.textContent = text;

        // Call API to update status
        if (this.currentPartnerId) {
            await this.updatePartnerStatus(this.currentPartnerId, value);
        }
    }

    // =====================================================
    // PARTNER INFO FOR LIST ITEMS
    // =====================================================

    /**
     * Get partner info (with smart caching)
     */
    async getPartnerInfo(userId) {
        // Return from cache if available and not expired
        const cached = this.getPartnerCache(userId);
        if (cached) {
            return cached;
        }

        // Return existing promise if already fetching
        if (this.partnerFetchPromises.has(userId)) {
            return this.partnerFetchPromises.get(userId);
        }

        // Fetch partner info
        const fetchPromise = (async () => {
            try {
                const crmTeamId = this.selectedTeamId || this.selectedPage?.CRMTeamId || this.selectedPage?.Id;
                if (!crmTeamId) return null;

                const apiUrl = `${this.tposBaseUrl}/rest/v2.0/chatomni/info/${crmTeamId}_${userId}`;
                const response = await this.authenticatedFetch(apiUrl);

                if (!response.ok) return null;

                const data = await response.json();
                const partner = data?.Partner || {};

                // Cache the result with timestamp
                this.setPartnerCache(userId, partner);
                return partner;
            } catch (error) {
                console.error('[TPOS-CHAT] Error fetching partner info:', error);
                return null;
            } finally {
                this.partnerFetchPromises.delete(userId);
            }
        })();

        this.partnerFetchPromises.set(userId, fetchPromise);
        return fetchPromise;
    }

    /**
     * Load partner info for all comments (batch)
     */
    async loadPartnerInfoForComments() {
        // Get unique user IDs
        const userIds = [...new Set(this.comments.map(c => c.from?.id).filter(Boolean))];

        // Fetch in parallel (limit to 5 concurrent requests)
        const batchSize = 5;
        for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize);
            await Promise.all(batch.map(userId => this.getPartnerInfo(userId)));
        }

        // Re-render to show partner info
        this.renderComments();

        // Load debt info for all phones (async)
        this.loadDebtForPartners();
    }

    /**
     * Load debt info for all partners that have phone numbers
     */
    async loadDebtForPartners() {
        // Collect unique phones from partner cache (cache stores {data, timestamp})
        const phones = [];
        for (const [userId, entry] of this.partnerCache) {
            const partner = entry.data || entry; // Support both formats
            if (partner.Phone) {
                phones.push(this.normalizePhone(partner.Phone));
            }
        }

        if (phones.length === 0) return;

        // Remove duplicates
        const uniquePhones = [...new Set(phones)];

        try {
            // Use batch API
            const response = await fetch(`${this.proxyBaseUrl}/api/sepay/debt-summary-batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phones: uniquePhones })
            });

            if (!response.ok) {
                console.warn('[TPOS-CHAT] Debt API error:', response.status);
                return;
            }

            const result = await response.json();
            if (result.success && result.data) {
                // Store in debt cache with smart caching
                for (const [phone, info] of Object.entries(result.data)) {
                    this.setDebtCache(this.normalizePhone(phone), info.total_debt || 0);
                }

                console.log('[TPOS-CHAT] Loaded debt for', Object.keys(result.data).length, 'phones');

                // Re-render to show debt
                this.renderComments();
            }
        } catch (error) {
            console.warn('[TPOS-CHAT] Error loading debt:', error);
        }
    }

    /**
     * Get debt for a phone number from cache (with TTL check)
     */
    getDebtForPhone(phone) {
        if (!phone) return null;
        return this.getDebtCache(this.normalizePhone(phone));
    }

    /**
     * Normalize phone number (remove +84, change 84 to 0)
     */
    normalizePhone(phone) {
        if (!phone) return '';
        let normalized = phone.toString().trim();
        // Remove spaces and dashes
        normalized = normalized.replace(/[\s-]/g, '');
        // Remove +84
        if (normalized.startsWith('+84')) {
            normalized = '0' + normalized.slice(3);
        }
        // Change 84 to 0
        if (normalized.startsWith('84') && normalized.length > 9) {
            normalized = '0' + normalized.slice(2);
        }
        return normalized;
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
        console.log('[TPOS-CHAT] Debt display settings:', { showDebt, showZeroDebt });
        // Re-render comment list
        this.renderComments();
    }

    /**
     * Save partner data via CreateUpdatePartner API
     */
    async savePartnerData(partnerId, updates, teamId) {
        try {
            // Get current partner from cache (using smart cache)
            let partner = this.getPartnerCache(updates.userId);
            if (!partner || !partner.Id) {
                throw new Error('Partner not found in cache');
            }

            // Merge updates into partner model
            const model = {
                ...partner,
                ...updates.fields
            };

            const apiUrl = `${this.proxyBaseUrl}/api/odata/SaleOnline_Order/ODataService.CreateUpdatePartner`;

            const response = await this.authenticatedFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;IEEE754Compatible=false;charset=UTF-8',
                    'tposappversion': '6.1.8.1',
                    'x-requested-with': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    model: model,
                    teamId: teamId || this.selectedTeamId || this.selectedPage?.CRMTeamId || this.selectedPage?.Id
                })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const result = await response.json();

            // Update cache with new data (using smart cache)
            this.setPartnerCache(updates.userId, result);

            return result;
        } catch (error) {
            console.error('[TPOS-CHAT] Error saving partner:', error);
            throw error;
        }
    }

    /**
     * Save phone inline edit
     */
    async saveInlinePhone(userId, inputId) {
        const input = document.getElementById(inputId);
        const saveBtn = document.getElementById(`save-phone-${userId}`);
        if (!input) return;

        const newPhone = input.value.trim();
        if (!newPhone) {
            if (window.notificationManager) {
                window.notificationManager.show('Vui lòng nhập số điện thoại', 'warning');
            }
            return;
        }

        // Show loading
        if (saveBtn) {
            saveBtn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:12px;height:12px;"></i>';
            saveBtn.disabled = true;
        }

        try {
            await this.savePartnerData(null, {
                userId: userId,
                fields: { Phone: newPhone }
            });

            if (window.notificationManager) {
                window.notificationManager.success('Đã lưu số điện thoại');
            }

            // Update UI
            if (saveBtn) {
                saveBtn.innerHTML = '<i data-lucide="check" style="width:12px;height:12px;color:#22c55e;"></i>';
                setTimeout(() => {
                    saveBtn.innerHTML = '<i data-lucide="save" style="width:12px;height:12px;"></i>';
                    saveBtn.disabled = false;
                    if (window.lucide) lucide.createIcons();
                }, 1500);
            }
        } catch (error) {
            if (window.notificationManager) {
                window.notificationManager.error('Lỗi lưu SĐT: ' + error.message);
            }
            if (saveBtn) {
                saveBtn.innerHTML = '<i data-lucide="save" style="width:12px;height:12px;"></i>';
                saveBtn.disabled = false;
            }
        }
        if (window.lucide) lucide.createIcons();
    }

    /**
     * Save address inline edit
     */
    async saveInlineAddress(userId, inputId) {
        const input = document.getElementById(inputId);
        const saveBtn = document.getElementById(`save-addr-${userId}`);
        if (!input) return;

        const newAddress = input.value.trim();

        // Show loading
        if (saveBtn) {
            saveBtn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:12px;height:12px;"></i>';
            saveBtn.disabled = true;
        }

        try {
            await this.savePartnerData(null, {
                userId: userId,
                fields: { Street: newAddress }
            });

            if (window.notificationManager) {
                window.notificationManager.success('Đã lưu địa chỉ');
            }

            // Update UI
            if (saveBtn) {
                saveBtn.innerHTML = '<i data-lucide="check" style="width:12px;height:12px;color:#22c55e;"></i>';
                setTimeout(() => {
                    saveBtn.innerHTML = '<i data-lucide="save" style="width:12px;height:12px;"></i>';
                    saveBtn.disabled = false;
                    if (window.lucide) lucide.createIcons();
                }, 1500);
            }
        } catch (error) {
            if (window.notificationManager) {
                window.notificationManager.error('Lỗi lưu địa chỉ: ' + error.message);
            }
            if (saveBtn) {
                saveBtn.innerHTML = '<i data-lucide="save" style="width:12px;height:12px;"></i>';
                saveBtn.disabled = false;
            }
        }
        if (window.lucide) lucide.createIcons();
    }

    /**
     * Toggle inline status dropdown for list item
     */
    toggleInlineStatusDropdown(userId) {
        const dropdown = document.getElementById(`status-dropdown-${userId}`);
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    }

    /**
     * Select inline status and save
     */
    async selectInlineStatus(userId, value, text) {
        // Hide dropdown
        const dropdown = document.getElementById(`status-dropdown-${userId}`);
        if (dropdown) dropdown.style.display = 'none';

        // Update UI immediately
        const statusText = document.getElementById(`status-text-${userId}`);
        if (statusText) statusText.textContent = text;

        // Get partner from cache (using smart cache)
        const partner = this.getPartnerCache(userId);
        if (!partner || !partner.Id) {
            if (window.notificationManager) {
                window.notificationManager.error('Không tìm thấy thông tin khách hàng');
            }
            return;
        }

        // Call UpdateStatus API
        try {
            const apiUrl = `${this.proxyBaseUrl}/api/odata/Partner(${partner.Id})/ODataService.UpdateStatus`;
            const response = await this.authenticatedFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8',
                    'tposappversion': '6.1.8.1'
                },
                body: JSON.stringify({ status: value })
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            // Update cache (using smart cache)
            partner.StatusText = text;
            this.setPartnerCache(userId, partner);

            if (window.notificationManager) {
                window.notificationManager.success('Đã cập nhật trạng thái');
            }
        } catch (error) {
            console.error('[TPOS-CHAT] Error updating status:', error);
            if (window.notificationManager) {
                window.notificationManager.error('Lỗi cập nhật: ' + error.message);
            }
        }
    }

    /**
     * Toggle hide/show comment
     */
    async toggleHideComment(commentId, hide) {
        console.log('[TPOS-CHAT] Toggle hide comment:', commentId, hide);

        // TODO: Implement API call to hide/show comment
        // For now, just update local state
        const comment = this.comments.find(c => c.id === commentId);
        if (comment) {
            comment.is_hidden = hide;
            this.renderComments();
        }

        if (window.notificationManager) {
            window.notificationManager.show(hide ? 'Đã ẩn comment' : 'Đã hiện comment', 'success');
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(connected, type = 'sse') {
        const indicator = document.getElementById('tposStatusIndicator');
        if (!indicator) return;

        const dot = indicator.querySelector('.status-dot');
        const text = indicator.querySelector('.status-text');

        if (connected) {
            dot?.classList.remove('disconnected');
            dot?.classList.add('connected');
            if (text) text.textContent = type === 'sse' ? 'Live' : 'Connected';
        } else {
            dot?.classList.remove('connected');
            dot?.classList.add('disconnected');
            if (text) text.textContent = 'Offline';
        }
    }

    // =====================================================
    // SMART CACHE MANAGEMENT
    // =====================================================

    /**
     * Start periodic cache cleanup
     */
    startCacheCleanup() {
        // Clear any existing interval
        if (this.cacheCleanupTimer) {
            clearInterval(this.cacheCleanupTimer);
        }

        // Run cleanup periodically
        this.cacheCleanupTimer = setInterval(() => {
            this.cleanupExpiredCache();
        }, this.cacheConfig.cleanupInterval);

        console.log('[TPOS-CHAT] Cache cleanup started (interval:', this.cacheConfig.cleanupInterval / 1000, 's)');
    }

    /**
     * Set value in partner cache with timestamp
     */
    setPartnerCache(userId, data) {
        // Enforce max size - remove oldest entries if needed
        if (this.partnerCache.size >= this.cacheConfig.maxSize) {
            this.evictOldestEntries(this.partnerCache, Math.floor(this.cacheConfig.maxSize * 0.2));
        }

        this.partnerCache.set(userId, {
            data: data,
            timestamp: Date.now()
        });
    }

    /**
     * Get value from partner cache (returns null if expired)
     */
    getPartnerCache(userId) {
        const entry = this.partnerCache.get(userId);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > this.cacheConfig.ttl) {
            this.partnerCache.delete(userId);
            return null;
        }

        // Update timestamp (LRU behavior)
        entry.timestamp = Date.now();
        return entry.data;
    }

    /**
     * Set value in debt cache with timestamp
     */
    setDebtCache(phone, amount) {
        // Enforce max size
        if (this.debtCache.size >= this.cacheConfig.maxSize) {
            this.evictOldestEntries(this.debtCache, Math.floor(this.cacheConfig.maxSize * 0.2));
        }

        this.debtCache.set(phone, {
            amount: amount,
            timestamp: Date.now()
        });
    }

    /**
     * Get value from debt cache (returns null if expired)
     */
    getDebtCache(phone) {
        const entry = this.debtCache.get(phone);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > this.cacheConfig.ttl) {
            this.debtCache.delete(phone);
            return null;
        }

        return entry.amount;
    }

    /**
     * Evict oldest entries from a cache map
     */
    evictOldestEntries(cacheMap, count) {
        const entries = Array.from(cacheMap.entries())
            .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));

        const toRemove = entries.slice(0, count);
        toRemove.forEach(([key]) => cacheMap.delete(key));

        console.log('[TPOS-CHAT] Evicted', toRemove.length, 'old cache entries');
    }

    /**
     * Cleanup expired entries from all caches
     */
    cleanupExpiredCache() {
        const now = Date.now();
        let cleaned = 0;

        // Cleanup partner cache
        for (const [key, entry] of this.partnerCache) {
            if (now - entry.timestamp > this.cacheConfig.ttl) {
                this.partnerCache.delete(key);
                cleaned++;
            }
        }

        // Cleanup debt cache
        for (const [key, entry] of this.debtCache) {
            if (now - entry.timestamp > this.cacheConfig.ttl) {
                this.debtCache.delete(key);
                cleaned++;
            }
        }

        // Cleanup fetch promises (shouldn't have old ones, but just in case)
        this.partnerFetchPromises.clear();

        if (cleaned > 0) {
            console.log('[TPOS-CHAT] Cleaned up', cleaned, 'expired cache entries');
        }
    }

    /**
     * Clear all caches (call when switching campaigns)
     */
    clearAllCaches() {
        this.partnerCache.clear();
        this.debtCache.clear();
        this.partnerFetchPromises.clear();
        this.sessionIndexMap.clear();
        console.log('[TPOS-CHAT] All caches cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            partnerCache: this.partnerCache.size,
            debtCache: this.debtCache.size,
            sessionIndexMap: this.sessionIndexMap.size,
            maxSize: this.cacheConfig.maxSize,
            ttlMinutes: this.cacheConfig.ttl / 60000
        };
    }

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    /**
     * Get avatar URL for a Facebook user
     * Uses Cloudflare Worker proxy that tries:
     * 1. Pancake Avatar API: https://pancake.vn/api/v1/pages/{pageId}/avatar/{fbId}
     * 2. Facebook Graph API: https://graph.facebook.com/{fbId}/picture
     * 3. Default SVG placeholder
     */
    getAvatarUrl(userId, directUrl = null) {
        // Priority 1: Use direct URL from SSE stream (has signed params)
        if (directUrl && directUrl.startsWith('http')) {
            return directUrl;
        }

        // Priority 2: Use Cloudflare Worker proxy for avatar
        // This proxy tries Pancake first, then Facebook Graph API
        if (userId) {
            const pageId = this.selectedPage?.Facebook_PageId || '270136663390370';
            return `https://chatomni-proxy.nhijudyshop.workers.dev/api/fb-avatar?id=${userId}&page=${pageId}`;
        }

        // Fallback: Return null - will use gradient placeholder
        return null;
    }

    formatTime(dateStr) {
        if (!dateStr) return '';

        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        // Today
        if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }

        // This week
        if (diff < 7 * 24 * 60 * 60 * 1000) {
            return date.toLocaleDateString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        }

        // Older
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Create global instance
window.tposChatManager = new TposChatManager();
console.log('[TPOS-CHAT] TposChatManager loaded');
