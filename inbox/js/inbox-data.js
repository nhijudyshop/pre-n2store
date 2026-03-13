/* =====================================================
   INBOX DATA - Pancake API integration & group management
   Uses pancakeDataManager + pancakeTokenManager (from tpos-pancake)
   tpos-pancake version has built-in Instagram page filtering
   ===================================================== */

/**
 * Remove Vietnamese diacritics for search matching
 * "Huỳnh Thành Đạt" → "huynh thanh dat"
 */
function removeDiacritics(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

// Default group labels for categorizing conversations
const DEFAULT_GROUPS = [
    { id: 'new', name: 'Inbox Mới', color: '#3b82f6', count: 0, note: 'Các tin nhắn mới từ khách hàng chưa được xử lý, cần phản hồi sớm.' },
    { id: 'processing', name: 'Đang Xử Lý', color: '#f59e0b', count: 0, note: 'Các cuộc hội thoại đang được nhân viên xử lý, chưa hoàn tất.' },
    { id: 'waiting', name: 'Chờ Phản Hồi', color: '#f97316', count: 0, note: 'Đã trả lời khách, đang chờ khách phản hồi lại.' },
    { id: 'ordered', name: 'Đã Đặt Hàng', color: '#10b981', count: 0, note: 'Khách đã chốt đơn và đặt hàng thành công.' },
    { id: 'urgent', name: 'Cần Gấp', color: '#ef4444', count: 0, note: 'Các trường hợp cần xử lý gấp: khiếu nại, đổi trả, lỗi đơn hàng.' },
    { id: 'done', name: 'Hoàn Tất', color: '#6b7280', count: 0, note: 'Cuộc hội thoại đã xử lý xong, không cần theo dõi thêm.' },
];

/**
 * InboxDataManager - Manages conversations from Pancake API + local group labels
 */
class InboxDataManager {
    constructor() {
        this.conversations = [];  // Mapped conversations from Pancake
        this.groups = [];
        this.pages = [];          // Pancake pages
        this.livestreamPostMap = {};    // { post_id: [{ conv_id, name, ... }] } from server
        this.livestreamPostNames = {};  // { post_id: "post name text" } from server
        this.livestreamConvIdSet = new Set(); // derived from livestreamPostMap for O(1) lookup
        this.labelMap = {};       // convId -> labelId (saved to localStorage)
        this.isInitialized = false;

        // Conversation maps for O(1) lookup (like tpos-pancake)
        this.conversationMap = new Map();           // id -> conversation
        this.conversationByPsidMap = new Map();     // psid -> conversation
        this.conversationByCustomerIdMap = new Map(); // customerId -> conversation
    }

    /**
     * Initialize Pancake managers and load data
     * Token manager: orders-report (no Firestore timeout, loads accounts from Firebase)
     * Data manager: tpos-pancake (has built-in IG page filtering)
     */
    async init() {
        this.loadGroups();
        this.loadLocalState();

        try {
            // Initialize Pancake token manager (orders-report version - no timeout)
            await window.pancakeTokenManager.initialize();
            console.log('[InboxData] Pancake token manager initialized, accounts:', Object.keys(window.pancakeTokenManager.accounts || {}).length);

            // Initialize Pancake data manager (tpos-pancake version - IG filter)
            await window.pancakeDataManager.initialize();
            console.log('[InboxData] Pancake data manager initialized, pages:', window.pancakeDataManager.pageIds?.length);

            // Check if initialize() already loaded conversations
            const pdm = window.pancakeDataManager;
            if (pdm.conversations && pdm.conversations.length > 0) {
                this.pages = pdm.pages || [];
                this.conversations = pdm.conversations.map(conv => this.mapConversation(conv));
                console.log(`[InboxData] Got ${this.conversations.length} conversations from initialize()`);
            } else {
                // Try other accounts if current one returned 0
                await this.loadConversations(true);
            }

            // Sync groups + labels from server (cross-device)
            await this.loadGroupsFromServer();
            await this.syncLabelsFromServer();

            this.recalculateGroupCounts();
            this.buildMaps();
            this.isInitialized = true;
            console.log('[InboxData] Initialization complete');

            // Fetch livestream conversations from server (single source of truth)
            this.fetchLivestreamFromServer();
        } catch (error) {
            console.error('[InboxData] Pancake initialization error:', error);
            showToast('Lỗi kết nối Pancake: ' + error.message, 'error');
        }
    }

    /**
     * Load local state: labels, stars, livestream IDs from localStorage
     */
    loadLocalState() {
        try {
            const labels = localStorage.getItem('inbox_conv_labels');
            if (labels) this.labelMap = JSON.parse(labels);
            console.log(`[InboxData] Loaded local state: labels`);
        } catch (e) {
            console.warn('[InboxData] Error loading local state:', e);
        }
    }

    /**
     * Save local state to localStorage
     */
    saveLocalState() {
        try {
            localStorage.setItem('inbox_conv_labels', JSON.stringify(this.labelMap));
        } catch (e) {
            console.warn('[InboxData] Error saving local state:', e);
        }
    }

    loadGroups() {
        // Load from localStorage first (immediate, offline cache)
        try {
            const saved = localStorage.getItem('inbox_groups');
            if (saved) {
                this.groups = JSON.parse(saved).map(g => ({ note: '', ...g }));
            } else {
                this.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
            }
        } catch {
            this.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
        }
    }

    /**
     * Fetch groups from server (call after init, async)
     */
    async loadGroupsFromServer() {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        try {
            const response = await fetch(`${workerUrl}/api/realtime/inbox-groups`);
            const data = await response.json();
            if (data.groups?.length > 0) {
                this.groups = data.groups.map(g => ({
                    id: g.id,
                    name: g.name,
                    color: g.color || '#3b82f6',
                    note: g.note || '',
                    count: 0,
                }));
                localStorage.setItem('inbox_groups', JSON.stringify(this.groups));
                console.log(`[InboxData] Loaded ${this.groups.length} groups from server`);
            } else {
                // Server empty → seed defaults
                console.log('[InboxData] No groups on server, seeding defaults');
                this.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
                this.saveGroupsToServer();
            }
        } catch (err) {
            console.warn('[InboxData] Failed to load groups from server, using local:', err.message);
        }
    }

    /**
     * Save groups to server + localStorage cache. Returns promise for feedback.
     */
    async saveGroupsToServer() {
        localStorage.setItem('inbox_groups', JSON.stringify(this.groups));
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        try {
            const resp = await fetch(`${workerUrl}/api/realtime/inbox-groups`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    groups: this.groups.map((g, i) => ({
                        id: g.id, name: g.name, color: g.color, note: g.note || '', sort_order: i
                    }))
                })
            });
            if (!resp.ok) throw new Error(`Server ${resp.status}`);
            console.log('[InboxData] Groups saved to server');
            return true;
        } catch (err) {
            console.error('[InboxData] Failed to save groups to server:', err.message);
            if (typeof showToast === 'function') showToast('Lỗi lưu nhóm lên server: ' + err.message, 'error');
            return false;
        }
    }

    /**
     * Fetch conversations with proper error checking
     * The data manager's fetchConversations doesn't check data.success,
     * so we intercept the raw response to detect API errors
     */
    async fetchConversationsWithErrorCheck(forceRefresh = false) {
        const pdm = window.pancakeDataManager;

        // Patch: intercept the response to check for API errors
        const origFetch = pdm._origSmartFetch || API_CONFIG.smartFetch;
        if (!pdm._origSmartFetch) {
            pdm._origSmartFetch = API_CONFIG.smartFetch;
        }

        let lastResponseData = null;
        API_CONFIG.smartFetch = async function(url, options) {
            const response = await origFetch.call(this, url, options);
            const cloned = response.clone();
            try {
                lastResponseData = await cloned.json();
            } catch (e) { /* ignore */ }
            return response;
        };

        const result = await pdm.fetchConversations(forceRefresh);

        // Restore original
        API_CONFIG.smartFetch = origFetch;

        // Check if API returned an error
        if (lastResponseData && lastResponseData.success === false) {
            const errorCode = lastResponseData.error_code;
            const errorMsg = lastResponseData.message || 'Unknown error';
            console.error(`[InboxData] ❌ Pancake API error: code=${errorCode}, message="${errorMsg}"`);
            return { conversations: [], error: errorCode, message: errorMsg };
        }

        return { conversations: result, error: null };
    }

    /**
     * Fetch conversations per-page using /pages/{pageId}/conversations endpoint
     * This endpoint works even when the multi-page /conversations endpoint
     * returns error 122 (subscription expired)
     */
    async fetchConversationsPerPage() {
        const ptm = window.pancakeTokenManager;
        const pdm = window.pancakeDataManager;
        if (!ptm || !pdm) return [];

        const token = await ptm.getToken();
        if (!token) {
            console.warn('[InboxData] No token available for per-page fetch');
            return [];
        }

        // Use cached searchable pages if available (excludes expired subscription pages)
        const pageIds = pdm._searchablePageIds || pdm.pageIds || [];
        if (pageIds.length === 0) {
            console.warn('[InboxData] No pages available');
            return [];
        }

        console.log(`[InboxData] 🔄 Fetching conversations per-page for ${pageIds.length} pages...`);
        let allConversations = [];
        const workingPageIds = [];

        for (const pageId of pageIds) {
            try {
                // Use pancakeDirect route: sends JWT as cookie + page-specific Referer
                // (generic /api/pancake/ route has no JWT cookie → error 102)
                const baseUrl = API_CONFIG.buildUrl.pancakeDirect(`pages/${pageId}/conversations`, pageId, token, token);
                const extraParams = `&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&cursor_mode=true&from_platform=web`;
                const url = baseUrl + extraParams;

                console.log(`[InboxData] Fetching page ${pageId} via pancake-direct...`);
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    console.warn(`[InboxData] Page ${pageId}: HTTP ${response.status}`);
                    continue;
                }

                const data = await response.json();

                if (data.success === false) {
                    console.warn(`[InboxData] Page ${pageId}: error ${data.error_code} - ${data.message}`);
                    continue;
                }

                workingPageIds.push(pageId);
                const convs = data.conversations || [];
                // Ensure page_id is set on every conversation (per-page API may omit it)
                for (const c of convs) {
                    if (!c.page_id) c.page_id = pageId;
                }
                console.log(`[InboxData] ✅ Page ${pageId}: ${convs.length} conversations`);
                allConversations = allConversations.concat(convs);
            } catch (e) {
                console.warn(`[InboxData] Page ${pageId} failed:`, e.message);
            }
        }

        // Cache working pages so search can skip expired ones immediately
        if (workingPageIds.length > 0 && workingPageIds.length < pageIds.length) {
            pdm._searchablePageIds = workingPageIds;
            console.log(`[InboxData] Cached searchable pages:`, workingPageIds);
        }

        // Sort: unread first, then by updated_at descending (matches Pancake API order)
        allConversations.sort((a, b) => {
            const aUnread = (a.unread_count || 0) > 0 ? 1 : 0;
            const bUnread = (b.unread_count || 0) > 0 ? 1 : 0;
            if (aUnread !== bUnread) return bUnread - aUnread;
            const ta = new Date(a.updated_at || 0).getTime();
            const tb = new Date(b.updated_at || 0).getTime();
            return tb - ta;
        });

        // Update pdm cache so other parts of the app can use it
        pdm.conversations = allConversations;

        console.log(`[InboxData] ✅ Per-page total: ${allConversations.length} conversations`);
        return allConversations;
    }

    /**
     * Load conversations from Pancake API and map to inbox format
     * Strategy: try multi-page endpoint first, fallback to per-page endpoint
     */
    async loadConversations(forceRefresh = false) {
        try {
            const pdm = window.pancakeDataManager;
            if (!pdm) {
                console.warn('[InboxData] pancakeDataManager not available');
                return;
            }

            // Try multi-page endpoint first
            let { conversations: rawConversations, error, message } = await this.fetchConversationsWithErrorCheck(forceRefresh);

            // If multi-page fails with permission error, try per-page with current account first
            // (account may have access to SOME pages, just not all)
            if (error === 105) {
                console.log(`[InboxData] Error 105 (no permission on some pages), trying per-page with current account...`);
                rawConversations = await this.fetchConversationsPerPage();

                // If current account per-page also fails, try other accounts
                if (rawConversations.length === 0) {
                    console.log('[InboxData] Current account per-page failed, trying other accounts...');
                    rawConversations = await this.tryOtherAccounts();
                    if (rawConversations.length === 0) {
                        rawConversations = await this.tryOtherAccountsPerPage();
                    }
                }
            } else if (error === 122) {
                // Subscription expired on some page(s) - this is page-level, not account-level
                // Go directly to per-page fetch (skips expired pages automatically)
                console.log(`[InboxData] Error 122 (page subscription expired), fetching per-page...`);
                rawConversations = await this.fetchConversationsPerPage();

                if (rawConversations.length === 0) {
                    console.log('[InboxData] Per-page failed, trying other accounts per-page...');
                    rawConversations = await this.tryOtherAccountsPerPage();
                }
            } else if (rawConversations.length === 0) {
                // No error but 0 results, try other accounts
                rawConversations = await this.tryOtherAccounts();
            }

            console.log(`[InboxData] Got ${rawConversations.length} conversations from Pancake`);

            if (rawConversations.length === 0) {
                showToast('Không có cuộc hội thoại. Kiểm tra tài khoản Pancake.', 'warning');
            }

            // Get pages for page name lookup
            this.pages = pdm.pages || [];

            // Map Pancake conversations to inbox format
            this.conversations = rawConversations.map(conv => this.mapConversation(conv));

            this.recalculateGroupCounts();
            this.buildMaps();
            return this.conversations;
        } catch (error) {
            console.error('[InboxData] Error loading conversations:', error);
            return [];
        }
    }

    /**
     * Load more conversations (pagination) using last conversation ID
     */
    async loadMoreConversations() {
        try {
            const pdm = window.pancakeDataManager;
            if (!pdm || !pdm.fetchMoreConversations) return [];

            console.log('[InboxData] Loading more conversations...');

            // fetchMoreConversations uses pages_with_current_count internally for cursor
            const moreRaw = await pdm.fetchMoreConversations();
            if (!moreRaw || moreRaw.length === 0) return [];

            const moreMapped = moreRaw.map(conv => this.mapConversation(conv));

            // Deduplicate
            const existingIds = new Set(this.conversations.map(c => c.id));
            const newConvs = moreMapped.filter(c => !existingIds.has(c.id));

            this.conversations.push(...newConvs);
            this.recalculateGroupCounts();
            this.buildMaps();

            console.log(`[InboxData] Loaded ${newConvs.length} more conversations (total: ${this.conversations.length})`);
            return newConvs;
        } catch (error) {
            console.error('[InboxData] Error loading more conversations:', error);
            return [];
        }
    }

    /**
     * Try other accounts using per-page endpoint
     */
    async tryOtherAccountsPerPage() {
        const ptm = window.pancakeTokenManager;
        if (!ptm || !ptm.accounts) return [];

        const currentId = ptm.activeAccountId;
        const accountIds = Object.keys(ptm.accounts);

        console.log(`[InboxData] Per-page failed for active account, trying ${accountIds.length - 1} others...`);

        for (const accountId of accountIds) {
            if (accountId === currentId) continue;

            const account = ptm.accounts[accountId];
            if (ptm.isTokenExpired && ptm.isTokenExpired(account.exp)) continue;

            console.log(`[InboxData] Trying account: ${account.name || accountId}`);
            const switched = await ptm.setActiveAccount(accountId);
            if (!switched) continue;

            try {
                const convs = await this.fetchConversationsPerPage();
                if (convs.length > 0) {
                    console.log(`[InboxData] ✅ Account "${account.name}" works! ${convs.length} conversations`);
                    showToast(`Đã chuyển sang tài khoản: ${account.name || accountId}`, 'success');
                    return convs;
                }
            } catch (e) {
                console.warn(`[InboxData] Account "${account.name}" failed:`, e.message);
            }
        }

        // All failed, restore original
        if (currentId) await ptm.setActiveAccount(currentId);
        console.warn('[InboxData] All accounts failed (per-page)');
        return [];
    }

    /**
     * Try switching to other Pancake accounts (multi-page endpoint)
     * Returns conversations array from the first working account, or []
     */
    async tryOtherAccounts() {
        const ptm = window.pancakeTokenManager;
        const pdm = window.pancakeDataManager;
        if (!ptm || !ptm.accounts || !pdm) return [];

        const currentId = ptm.activeAccountId;
        const accountIds = Object.keys(ptm.accounts);

        console.log(`[InboxData] Active account returned 0 conversations, trying ${accountIds.length - 1} other accounts...`);

        for (const accountId of accountIds) {
            if (accountId === currentId) continue;

            const account = ptm.accounts[accountId];
            if (ptm.isTokenExpired && ptm.isTokenExpired(account.exp)) continue;

            console.log(`[InboxData] Trying account: ${account.name || accountId}`);
            const switched = await ptm.setActiveAccount(accountId);
            if (!switched) continue;

            try {
                const { conversations: convs, error, message } = await this.fetchConversationsWithErrorCheck(true);
                if (error) {
                    console.warn(`[InboxData] Account "${account.name}" API error (${error}): ${message}`);
                    continue;
                }
                if (convs.length > 0) {
                    console.log(`[InboxData] Account "${account.name}" works! ${convs.length} conversations`);
                    showToast(`Đã chuyển sang tài khoản: ${account.name || accountId}`, 'success');
                    return convs;
                }
            } catch (e) {
                console.warn(`[InboxData] Account "${account.name}" failed:`, e.message);
            }
        }

        // All failed, restore original
        if (currentId) await ptm.setActiveAccount(currentId);
        console.warn('[InboxData] All accounts failed to load conversations');
        return [];
    }

    _filterSystemMessage(text) {
        if (!text) return '';
        const t = text.trim();
        if (t.startsWith('Đã thêm nhãn tự động:') || t.startsWith('Đã đặt giai đoạn')) return '';
        return text;
    }

    /**
     * Map a Pancake conversation to inbox format
     */
    mapConversation(conv) {
        const customerName = conv.from?.name
            || (conv.customers && conv.customers.length > 0 ? conv.customers[0].name : '')
            || 'Khách hàng';

        const pageName = this.getPageName(conv.page_id);

        // Extract phone numbers from recent_phone_numbers for search
        const phones = (conv.recent_phone_numbers || []).map(p => p.phone_number || p.captured).filter(Boolean);

        // Check if last message was from customer (not from page/admin)
        const lastSentById = conv.last_sent_by?.id;
        const isCustomerLast = lastSentById && lastSentById !== conv.page_id;

        return {
            id: conv.id,
            name: customerName,
            avatar: conv.from?.avatar || null,
            lastMessage: this._filterSystemMessage((conv.snippet || conv.last_message?.text || conv.last_message?.message || '').replace(/<[^>]*>/g, '')),
            time: this.parseTimestamp(conv.updated_at || conv.last_message?.inserted_at) || new Date(),
            unread: conv.unread_count || 0,
            online: false,
            phone: phones.join(', '),
            labels: this.getLabelArray(conv.id),
            isLivestream: this.livestreamConvIdSet.has(conv.id),
            type: conv.type, // 'INBOX' or 'COMMENT'
            pageId: conv.page_id,
            pageName: pageName,
            psid: conv.from_psid || conv.from?.id || '',
            customerId: (conv.customers && conv.customers.length > 0) ? conv.customers[0].id : null,
            conversationId: conv.id,
            isCustomerLast, // true = customer sent last message (unanswered)
            messages: [], // Messages loaded on demand
            _raw: conv,   // Keep raw data for reference
        };
    }

    /**
     * Parse timestamp from Pancake API - handles UTC timestamps without timezone suffix
     */
    parseTimestamp(timestamp) {
        if (!timestamp) return null;
        try {
            let date;
            if (typeof timestamp === 'string') {
                if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
                    date = new Date(timestamp + 'Z');
                } else {
                    date = new Date(timestamp);
                }
            } else if (typeof timestamp === 'number') {
                date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
            } else {
                date = new Date(timestamp);
            }
            return isNaN(date.getTime()) ? null : date;
        } catch (e) {
            return null;
        }
    }

    /**
     * Get page name by pageId
     */
    getPageName(pageId) {
        const page = this.pages.find(p => p.id === pageId || p.page_id === pageId);
        return page?.name || '';
    }

    save() {
        try {
            localStorage.setItem('inbox_groups', JSON.stringify(this.groups));
            this.saveLocalState();
        } catch (e) {
            console.error('[InboxData] Save error:', e);
        }
    }

    /**
     * Save groups + sync to server (call from group management operations)
     */
    saveAndSync() {
        this.save();
        this.saveGroupsToServer();
    }

    recalculateGroupCounts(typeFilter = 'all') {
        this.groups.forEach(g => { g.count = 0; });

        // Count from loaded conversations (supports type filter)
        const countedConvIds = new Set();
        this.conversations.forEach(conv => {
            if (typeFilter !== 'all' && conv.type !== typeFilter) return;
            const labels = conv.labels || ['new'];
            for (const labelId of labels) {
                const group = this.groups.find(g => g.id === labelId);
                if (group) group.count++;
            }
            countedConvIds.add(conv.id);
        });

        // Also count from labelMap for non-loaded conversations (when no type filter)
        if (typeFilter === 'all') {
            for (const [convId, labels] of Object.entries(this.labelMap)) {
                if (countedConvIds.has(convId)) continue;
                const labelArr = Array.isArray(labels) ? labels : [labels];
                for (const labelId of labelArr) {
                    if (labelId === 'new') continue;
                    const group = this.groups.find(g => g.id === labelId);
                    if (group) group.count++;
                }
            }
        }
    }

    getConversations({ search = '', filter = 'all', groupFilters = null } = {}) {
        let result = [...this.conversations];

        if (filter === 'unread') {
            result = result.filter(c => c.unread > 0);
        } else if (filter === 'livestream') {
            result = result.filter(c => c.isLivestream);
        } else if (filter === 'inbox_my') {
            result = result.filter(c => !c.isLivestream);
        }

        if (groupFilters && groupFilters.size > 0) {
            result = result.filter(c => {
                const labels = c.labels || ['new'];
                return labels.some(l => groupFilters.has(l));
            });
        }

        if (search) {
            const q = removeDiacritics(search);
            result = result.filter(c => {
                if (removeDiacritics(c.name).includes(q)) return true;
                if (removeDiacritics(c.lastMessage).includes(q)) return true;
                if (c.phone && c.phone.includes(q)) return true;
                if (removeDiacritics(c.pageName).includes(q)) return true;
                // Also search in raw phone numbers (for phone search)
                const rawPhones = c._raw?.recent_phone_numbers;
                if (rawPhones && rawPhones.some(p => (p.phone_number || p.captured || '').includes(search))) return true;
                return false;
            });
        }

        // Sort: unread first, then by updated_at descending (matches Pancake API order)
        result.sort((a, b) => {
            const aUnread = a.unread > 0 ? 1 : 0;
            const bUnread = b.unread > 0 ? 1 : 0;
            if (aUnread !== bUnread) return bUnread - aUnread;
            return b.time - a.time;
        });
        return result;
    }

    /**
     * Build O(1) lookup maps (like tpos-pancake buildConversationMap)
     */
    buildMaps() {
        this.conversationMap.clear();
        this.conversationByPsidMap.clear();
        this.conversationByCustomerIdMap.clear();
        for (const conv of this.conversations) {
            this.conversationMap.set(conv.id, conv);
            if (conv.psid) this.conversationByPsidMap.set(conv.psid, conv);
            if (conv.customerId) this.conversationByCustomerIdMap.set(conv.customerId, conv);
        }
    }

    getConversation(id) {
        return this.conversationMap.get(id) || this.conversations.find(c => c.id === id);
    }

    getConversationByPsid(psid) {
        return this.conversationByPsidMap.get(psid) || null;
    }

    /**
     * Check Facebook 24h messaging window (like tpos-pancake check24HourWindow)
     */
    check24hWindow(convId) {
        const conv = this.getConversation(convId);
        if (!conv) return { isOpen: true, hoursRemaining: null };

        // Find last customer message time from stored messages or raw data
        let lastCustomerTime = null;

        // Check stored messages first
        if (conv.messages && conv.messages.length > 0) {
            for (let i = conv.messages.length - 1; i >= 0; i--) {
                if (conv.messages[i].sender === 'customer') {
                    lastCustomerTime = conv.messages[i].time;
                    break;
                }
            }
        }

        // Fallback to conversation updated_at
        if (!lastCustomerTime) {
            lastCustomerTime = conv.time || conv._raw?.updated_at;
        }

        if (!lastCustomerTime) return { isOpen: true, hoursRemaining: null };

        const lastTime = new Date(lastCustomerTime).getTime();
        const elapsed = Date.now() - lastTime;
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        const remaining = TWENTY_FOUR_HOURS - elapsed;

        return {
            isOpen: remaining > 0,
            hoursRemaining: remaining > 0 ? Math.ceil(remaining / (60 * 60 * 1000)) : 0,
        };
    }

    /**
     * Get labels array for a conversation (backward-compatible with old string format)
     */
    getLabelArray(convId) {
        const val = this.labelMap[convId];
        if (!val) return ['new'];
        if (Array.isArray(val)) return val;
        return [val]; // old string format → convert to array
    }

    /**
     * Toggle a label on a conversation (multi-select)
     * "done" is exclusive — clears all others when selected
     */
    toggleConversationLabel(convId, labelId) {
        const conv = this.getConversation(convId);
        if (!conv) return;

        let labels = [...(conv.labels || ['new'])];

        if (labelId === 'done') {
            labels = ['done'];
        } else {
            labels = labels.filter(l => l !== 'done');
            if (labels.includes(labelId)) {
                labels = labels.filter(l => l !== labelId);
            } else {
                labels.push(labelId);
            }
            if (labels.length === 0) labels = ['new'];
            if (labels.length > 1) labels = labels.filter(l => l !== 'new');
        }

        conv.labels = labels;
        this.labelMap[convId] = labels;
        this.recalculateGroupCounts();
        this.save();

        // Save to dedicated conversation_labels table on server
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        fetch(`${workerUrl}/api/realtime/conversation-label`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ convId, labels: JSON.stringify(labels) })
        }).catch(err => console.warn('[InboxData] Failed to save label to server:', err.message));
    }

    async syncLabelsFromServer() {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        try {
            const response = await fetch(`${workerUrl}/api/realtime/conversation-labels`);
            if (!response.ok) return;
            const data = await response.json();
            if (!data.success || !data.labelMap) return;

            let updated = 0;
            const serverConvIds = new Set(Object.keys(data.labelMap));

            // Server → local: apply server labels
            for (const [convId, labelsStr] of Object.entries(data.labelMap)) {
                let parsed;
                try { parsed = JSON.parse(labelsStr); } catch { parsed = [labelsStr]; }
                if (!Array.isArray(parsed)) parsed = [parsed];

                if (JSON.stringify(this.labelMap[convId]) !== JSON.stringify(parsed)) {
                    this.labelMap[convId] = parsed;
                    const conv = this.getConversation(convId);
                    if (conv) conv.labels = parsed;
                    updated++;
                }
            }

            // Local → server: bulk push local labels missing from server
            const localOnly = {};
            for (const [convId, labels] of Object.entries(this.labelMap)) {
                if (serverConvIds.has(convId)) continue;
                const arr = Array.isArray(labels) ? labels : [labels];
                if (arr.length === 1 && arr[0] === 'new') continue;
                localOnly[convId] = JSON.stringify(arr);
            }

            if (Object.keys(localOnly).length > 0) {
                fetch(`${workerUrl}/api/realtime/conversation-labels/bulk`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ labelMap: localOnly })
                }).catch(() => {});
                console.log(`[InboxData] Pushed ${Object.keys(localOnly).length} local labels to server`);
            }

            if (updated > 0) {
                this.saveLocalState();
                this.recalculateGroupCounts();
                if (window.inboxChat) {
                    window.inboxChat.renderConversationList();
                    window.inboxChat.renderGroupStats();
                }
                console.log(`[InboxData] Applied ${updated} labels from server`);
            }
        } catch (err) {
            console.warn('[InboxData] Failed to sync labels:', err.message);
        }
    }

    markAsRead(convId) {
        const conv = this.getConversation(convId);
        if (conv) {
            conv.unread = 0;
            // Also mark as read on Pancake API
            if (conv.pageId && window.pancakeDataManager) {
                window.pancakeDataManager.markConversationAsRead(conv.pageId, convId).catch(err => {
                    console.warn('[InboxData] Error marking as read on Pancake:', err);
                });
            }
            // Also mark as replied on Render DB (removes from pending_customers)
            if (conv.psid && conv.pageId) {
                this.markRepliedOnServer(conv.psid, conv.pageId);
            }
        }
    }

    markAsUnread(convId) {
        const conv = this.getConversation(convId);
        if (conv) {
            conv.unread = Math.max(conv.unread || 0, 1);
            // Mark as unread on Pancake API
            if (conv.pageId && window.pancakeDataManager) {
                const pdm = window.pancakeDataManager;
                pdm.getOrGeneratePageAccessToken
                    ? window.pancakeTokenManager.getOrGeneratePageAccessToken(conv.pageId).then(token => {
                        if (!token) return;
                        const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                            `pages/${conv.pageId}/conversations/${convId}/unread`, token
                        );
                        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
                            .then(r => { if (r.ok) console.log('[InboxData] Marked as unread:', convId); })
                            .catch(err => console.warn('[InboxData] Error marking as unread:', err));
                    })
                    : null;
            }
        }
    }

    /**
     * Mark customer as replied on Render DB (remove from pending_customers)
     */
    markRepliedOnServer(psid, pageId) {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        fetch(`${workerUrl}/api/realtime/mark-replied`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ psid, pageId })
        }).catch(err => console.warn('[InboxData] Error marking replied:', err.message));
    }

    /**
     * Fetch pending customers from Render DB and merge unread data
     */
    async fetchPendingFromServer() {
        try {
            const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
            const response = await fetch(`${workerUrl}/api/realtime/pending-customers?limit=500`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data.success || !data.customers) return;

            console.log(`[InboxData] Render DB has ${data.customers.length} pending customers`);

            let changed = false;
            for (const pending of data.customers) {
                // Find matching conversations by psid + page_id (may have INBOX + COMMENT)
                const matchingConvs = this.conversations.filter(c =>
                    c.psid === pending.psid && c.pageId === pending.page_id
                    && (!pending.type || c.type === pending.type)
                );
                for (const conv of matchingConvs) {
                    // Update unread count if server has newer data
                    if (pending.message_count > 0 && conv.unread === 0) {
                        conv.unread = pending.message_count;
                        changed = true;
                    }
                    // Update preview from actual last message (pending = customer sent, not replied)
                    const snippet = (pending.last_message_snippet || '').replace(/<[^>]*>/g, '').trim();
                    if (snippet && snippet !== conv.lastMessage) {
                        conv.lastMessage = this._filterSystemMessage(snippet) || conv.lastMessage;
                        conv.isCustomerLast = true;
                        changed = true;
                    }
                }
            }

            if (changed) {
                this.recalculateGroupCounts();
                if (window.inboxChat) window.inboxChat.renderConversationList();
                console.log('[InboxData] Updated unread counts from Render pending_customers');
            }
        } catch (error) {
            console.warn('[InboxData] Error fetching pending customers:', error.message);
        }
    }


    /**
     * Fetch livestream conversations from server (single source of truth)
     * Returns { post_id: [{ conv_id, name, ... }] }
     */
    async fetchLivestreamFromServer() {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

        try {
            const response = await fetch(`${workerUrl}/api/realtime/livestream-conversations`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            this.livestreamPostMap = data.posts || {};
            this.livestreamPostNames = data.postNames || {};

            // Build conv_id Set for fast lookup
            this.livestreamConvIdSet = new Set();
            for (const convs of Object.values(this.livestreamPostMap)) {
                for (const c of convs) this.livestreamConvIdSet.add(c.conv_id);
            }

            // Mark existing conversations + add virtual entries for server-only ones
            const existingIds = new Set(this.conversations.map(c => c.id));
            for (const conv of this.conversations) {
                conv.isLivestream = this.livestreamConvIdSet.has(conv.id);
            }

            // Create virtual conversation entries for conv_ids in server but not in Pancake response
            let virtualCount = 0;
            for (const [postId, convs] of Object.entries(this.livestreamPostMap)) {
                for (const sc of convs) {
                    if (!existingIds.has(sc.conv_id)) {
                        const virtual = {
                            id: sc.conv_id,
                            name: sc.name || 'Khách hàng',
                            avatar: null,
                            lastMessage: '', // will be updated when messages are loaded
                            time: new Date(sc.updated_at || 0),
                            unread: 0,
                            online: false,
                            phone: '',
                            labels: this.labelMap[sc.conv_id] || ['new'],
                            isLivestream: true,
                            type: sc.type || 'COMMENT',
                            pageId: sc.page_id || '',
                            pageName: this.getPageName(sc.page_id) || '',
                            psid: sc.psid || '',
                            customerId: sc.customer_id || null,
                            conversationId: sc.conv_id,
                            isCustomerLast: true, // virtual entries = customer initiated
                            messages: [],
                            _raw: { post_id: postId },
                            _virtual: true, // flag for server-only entries
                        };
                        this.conversations.push(virtual);
                        existingIds.add(sc.conv_id);
                        virtualCount++;
                    }
                }
            }

            if (virtualCount > 0) this.buildMaps();
            this.recalculateGroupCounts();
            if (window.inboxChat) window.inboxChat.renderConversationList();
            console.log(`[InboxData] Livestream from server: ${this.livestreamConvIdSet.size} convs (${virtualCount} virtual) across ${Object.keys(this.livestreamPostMap).length} posts`);
        } catch (error) {
            console.warn('[InboxData] Failed to fetch livestream from server:', error.message);
        }
    }

    /**
     * Mark a conversation as livestream — save to server + update local
     */
    markAsLivestream(convId, postId) {
        const conv = this.getConversation(convId);
        if (!conv) return;

        conv.isLivestream = true;
        this.livestreamConvIdSet.add(convId);

        // Add to local postMap
        const pid = postId || conv._raw?.post_id || 'unknown';
        if (!this.livestreamPostMap[pid]) this.livestreamPostMap[pid] = [];
        if (!this.livestreamPostMap[pid].find(c => c.conv_id === convId)) {
            this.livestreamPostMap[pid].push({ conv_id: convId, name: conv.name, type: conv.type, psid: conv.psid });
        }

        // Also mark this customer's NEWEST INBOX conversation only
        if (conv.psid) {
            let newestInbox = null;
            for (const inboxConv of this.conversations) {
                if (inboxConv.psid === conv.psid && inboxConv.type === 'INBOX' && !inboxConv.isLivestream) {
                    if (!newestInbox || inboxConv.time > newestInbox.time) {
                        newestInbox = inboxConv;
                    }
                }
            }
            if (newestInbox) {
                newestInbox.isLivestream = true;
                this.livestreamConvIdSet.add(newestInbox.id);
                this._saveLivestreamConvToServer(newestInbox.id, pid, newestInbox);
            }
        }

        // Save to server
        this._saveLivestreamConvToServer(convId, pid, conv);
    }

    /**
     * Save a single livestream conversation to server
     */
    _saveLivestreamConvToServer(convId, postId, conv) {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        fetch(`${workerUrl}/api/realtime/livestream-conversation`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                convId,
                postId,
                postName: conv._messagesData?.post?.message || conv._messagesData?.post?.story
                    || conv._raw?.post?.message
                    || this.livestreamPostNames[postId]
                    || (conv._messagesData?.activities?.length ? conv._messagesData.activities[conv._messagesData.activities.length - 1]?.message : null)
                    || null,
                name: conv.name,
                type: conv.type,
                pageId: conv.pageId,
                psid: conv.psid,
                customerId: conv.customerId
            })
        }).catch(err => console.warn('[InboxData] Failed to save livestream conv to server:', err.message));
    }

    /**
     * Mark customer as livestream participant → mark COMMENT + newest INBOX only
     */
    markCustomerAsLivestream(customerPsid, _pageId, _customerName, postId) {
        if (!customerPsid) return;
        const pid = postId || 'unknown';

        let newestInbox = null;
        for (const conv of this.conversations) {
            if (conv.psid === customerPsid && !conv.isLivestream) {
                if (conv.type === 'COMMENT') {
                    conv.isLivestream = true;
                    this.livestreamConvIdSet.add(conv.id);
                    this._saveLivestreamConvToServer(conv.id, pid, conv);
                } else if (conv.type === 'INBOX') {
                    if (!newestInbox || conv.time > newestInbox.time) {
                        newestInbox = conv;
                    }
                }
            }
        }
        if (newestInbox) {
            newestInbox.isLivestream = true;
            this.livestreamConvIdSet.add(newestInbox.id);
            this._saveLivestreamConvToServer(newestInbox.id, pid, newestInbox);
        }
    }

    /**
     * Unmark a conversation as livestream (local only — server uses DELETE by post)
     */
    unmarkAsLivestream(convId) {
        this.livestreamConvIdSet.delete(convId);
        const conv = this.getConversation(convId);
        if (conv) conv.isLivestream = false;
    }

    addMessage(convId, text, sender = 'shop', extra = {}) {
        const conv = this.getConversation(convId);
        if (!conv) return null;

        const message = {
            id: 'm' + Date.now(),
            text,
            time: new Date(),
            sender,
            ...extra,
        };

        conv.messages.push(message);
        conv.lastMessage = text;
        conv.time = message.time;
        return message;
    }

    // ===== Group Management (unchanged) =====

    addGroup(name, color, note) {
        const id = 'group_' + Date.now();
        const group = { id, name, color, count: 0, note: note || '' };
        this.groups.push(group);
        this.saveAndSync();
        return group;
    }

    updateGroup(id, updates) {
        const group = this.groups.find(g => g.id === id);
        if (group) {
            if (updates.name !== undefined) group.name = updates.name;
            if (updates.color !== undefined) group.color = updates.color;
            if (updates.note !== undefined) group.note = updates.note;
            this.saveAndSync();
        }
    }

    deleteGroup(id) {
        const idx = this.groups.findIndex(g => g.id === id);
        if (idx !== -1) {
            this.conversations.forEach(c => {
                if (c.label === id) {
                    c.label = 'new';
                    this.labelMap[c.id] = 'new';
                }
            });
            this.groups.splice(idx, 1);
            this.recalculateGroupCounts();
            this.saveAndSync();
        }
    }

    getStats() {
        const total = this.conversations.length;
        const processing = this.conversations.filter(c => c.label === 'processing').length;
        const waiting = this.conversations.filter(c => c.label === 'waiting').length;
        const urgent = this.conversations.filter(c => c.label === 'urgent').length;
        return { total, processing, waiting, urgent };
    }
}

// Export globally
window.InboxDataManager = InboxDataManager;
window.DEFAULT_GROUPS = DEFAULT_GROUPS;
