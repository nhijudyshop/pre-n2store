// =====================================================
// PANCAKE DATA MANAGER - Quản lý tin nhắn Pancake.vn
// =====================================================

class PancakeDataManager {
    constructor() {
        this.conversations = [];
        // Separate maps for INBOX and COMMENT based on type field
        this.inboxMapByPSID = new Map();   // INBOX conversations by PSID
        this.inboxMapByFBID = new Map();   // INBOX conversations by Facebook ID
        this.commentMapByPSID = new Map(); // COMMENT conversations by PSID
        this.commentMapByFBID = new Map(); // COMMENT conversations by Facebook ID
        this.conversationsByCustomerFbId = new Map(); // All conversations by customers[].fb_id
        this.pages = [];
        this.pageIds = [];
        this.isLoading = false;
        this.isLoadingPages = false;
        this.lastFetchTime = null;
        this.lastPageFetchTime = null;
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

        // Unread pages cache (shorter TTL since it changes more frequently)
        this.unreadPagesCache = null;
        this.lastUnreadPagesFetchTime = null;
        this.UNREAD_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes cache
    }

    /**
     * Lấy token từ PancakeTokenManager (Firebase → Cookie)
     * @returns {Promise<string|null>}
     */
    async getToken() {
        if (!window.pancakeTokenManager) {
            console.error('[PANCAKE] PancakeTokenManager not available');
            return null;
        }

        // PancakeTokenManager tự động lấy từ Firebase hoặc Cookie
        const token = await window.pancakeTokenManager.getToken();
        return token;
    }

    /**
     * Build headers với referer để giống browser thật
     * @param {string} token - JWT token
     * @returns {Object}
     */
    getHeaders(token) {
        if (!token) {
            throw new Error('JWT token not found. Please login to Pancake.vn or set token in settings.');
        }

        return {
            'accept': 'application/json',
            'accept-language': 'vi,en-US;q=0.9,en;q=0.8',
            'referer': 'https://pancake.vn/multi_pages',
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
        };
    }

    /**
     * Lấy URL avatar cho user/customer
     * Ưu tiên sử dụng avatar URL trực tiếp từ Pancake nếu có
     * @param {string} fbId - Facebook User ID
     * @param {string} pageId - Page ID (optional, for Pancake avatar lookup)
     * @param {string} token - Pancake JWT token (optional)
     * @param {string} directAvatarUrl - Avatar URL trực tiếp từ Pancake API (optional)
     * @returns {string} Avatar URL
     */
    getAvatarUrl(fbId, pageId = null, token = null, directAvatarUrl = null) {
        // Ưu tiên sử dụng avatar URL trực tiếp từ Pancake nếu có
        if (directAvatarUrl && typeof directAvatarUrl === 'string') {
            // Nếu là URL content.pancake.vn, sử dụng trực tiếp
            if (directAvatarUrl.includes('content.pancake.vn')) {
                return directAvatarUrl;
            }
            // Nếu là hash, build URL
            if (/^[a-f0-9]{32,}$/i.test(directAvatarUrl)) {
                return `https://content.pancake.vn/2.1-25/avatars/${directAvatarUrl}`;
            }
            // Nếu là URL khác hợp lệ
            if (directAvatarUrl.startsWith('http')) {
                return directAvatarUrl;
            }
        }

        if (!fbId) {
            // Default avatar nếu không có fbId
            return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        }

        // Fallback: Dùng /api/fb-avatar endpoint
        let url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/fb-avatar?id=${fbId}`;
        if (pageId) {
            url += `&page=${pageId}`;
        }
        if (token) {
            url += `&token=${encodeURIComponent(token)}`;
        }
        return url;
    }

    /**
     * Lấy danh sách pages từ Pancake API
     * @param {boolean} forceRefresh - Bắt buộc refresh
     * @returns {Promise<Array>}
     */
    async fetchPages(forceRefresh = false) {
        try {
            // Check cache
            if (!forceRefresh && this.pages.length > 0 && this.lastPageFetchTime) {
                const cacheAge = Date.now() - this.lastPageFetchTime;
                if (cacheAge < this.CACHE_DURATION) {
                    console.log('[PANCAKE] Using cached pages, count:', this.pages.length);
                    return this.pages;
                }
            }

            if (this.isLoadingPages) {
                console.log('[PANCAKE] Already loading pages...');
                return this.pages;
            }

            this.isLoadingPages = true;
            console.log('[PANCAKE] Fetching pages from API via Cloudflare...');

            const token = await this.getToken();

            // Use Cloudflare Worker proxy
            const url = window.API_CONFIG.buildUrl.pancake('pages', `access_token=${token}`);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('[PANCAKE] Pages response status:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Pages response data:', data);

            if (data.success && data.categorized && data.categorized.activated) {
                this.pages = data.categorized.activated;
                this.pageIds = data.categorized.activated_page_ids || [];
                this.lastPageFetchTime = Date.now();
                console.log(`[PANCAKE] ✅ Fetched ${this.pages.length} pages`);
                console.log('[PANCAKE] Page IDs:', this.pageIds);

                // Extract and cache page_access_tokens from settings
                this.extractAndCachePageAccessTokens(data.categorized.activated);

                return this.pages;
            } else {
                console.warn('[PANCAKE] Unexpected response format:', data);
                return [];
            }

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching pages:', error);
            return [];
        } finally {
            this.isLoadingPages = false;
        }
    }

    /**
     * Extract page_access_tokens from pages response and cache to localStorage
     * Response chứa settings.page_access_token cho mỗi page
     * Lưu trực tiếp vào localStorage mà không cần gọi API generate
     * @param {Array} pages - Array of page objects from /api/v1/pages
     */
    extractAndCachePageAccessTokens(pages) {
        try {
            if (!window.pancakeTokenManager) {
                console.warn('[PANCAKE] pancakeTokenManager not available');
                return;
            }

            let extractedCount = 0;
            const tokensToSave = {};

            for (const page of pages) {
                const pageId = page.id;
                const pageAccessToken = page.settings?.page_access_token;
                const pageName = page.name || pageId;

                if (pageId && pageAccessToken) {
                    // Prepare token data
                    tokensToSave[pageId] = {
                        token: pageAccessToken,
                        pageId: pageId,
                        pageName: pageName,
                        savedAt: Date.now()
                    };
                    extractedCount++;
                }
            }

            if (extractedCount > 0) {
                // Merge with existing tokens and save to localStorage (synchronous, fast)
                const existingTokens = window.pancakeTokenManager.pageAccessTokens || {};
                window.pancakeTokenManager.pageAccessTokens = {
                    ...existingTokens,
                    ...tokensToSave
                };
                window.pancakeTokenManager.savePageAccessTokensToLocalStorage();

                console.log(`[PANCAKE] ✅ Extracted and cached ${extractedCount} page_access_tokens from /pages response`);
            }
        } catch (error) {
            console.error('[PANCAKE] Error extracting page_access_tokens:', error);
        }
    }

    /**
     * Lấy danh sách pages với số lượng unread conversations
     * Endpoint: /api/v1/pages/unread_conv_pages_count
     * Uses cache with 2-minute TTL to reduce API calls
     * @param {boolean} forceRefresh - Force refresh cache
     * @returns {Promise<Array>} Array of { page_id, unread_conv_count }
     */
    async fetchPagesWithUnreadCount(forceRefresh = false) {
        try {
            // Check cache first (unless force refresh)
            const now = Date.now();
            if (!forceRefresh && this.unreadPagesCache && this.lastUnreadPagesFetchTime) {
                const cacheAge = now - this.lastUnreadPagesFetchTime;
                if (cacheAge < this.UNREAD_CACHE_DURATION) {
                    console.log(`[PANCAKE] ✅ Unread pages cache HIT (age: ${Math.round(cacheAge / 1000)}s)`);
                    return this.unreadPagesCache;
                }
            }

            console.log('[PANCAKE] Fetching pages with unread count...');

            const token = await this.getToken();
            if (!token) {
                throw new Error('No Pancake token available');
            }

            // Use Cloudflare Worker proxy to bypass CORS
            const url = window.API_CONFIG.buildUrl.pancake('pages/unread_conv_pages_count', `access_token=${token}`);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            console.log('[PANCAKE] Unread pages response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Unread pages response:', data);

            if (data.success && data.data) {
                // Merge with existing pages data to get page names
                const pagesWithUnread = data.data.map(item => {
                    // Find matching page from cached pages to get the name
                    const cachedPage = this.pages.find(p =>
                        p.page_id === item.page_id ||
                        p.fb_page_id === item.page_id ||
                        p.id === item.page_id
                    );
                    return {
                        page_id: item.page_id,
                        unread_conv_count: item.unread_conv_count || 0,
                        page_name: cachedPage?.page_name || cachedPage?.name || item.page_id
                    };
                });

                // Save to cache
                this.unreadPagesCache = pagesWithUnread;
                this.lastUnreadPagesFetchTime = Date.now();

                console.log(`[PANCAKE] ✅ Got ${pagesWithUnread.length} pages with unread count (cached for ${this.UNREAD_CACHE_DURATION / 1000}s)`);
                return pagesWithUnread;
            } else {
                console.warn('[PANCAKE] Unexpected response format:', data);
                return this.unreadPagesCache || []; // Return stale cache if available
            }

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching pages with unread count:', error);
            // Return stale cache on error if available
            if (this.unreadPagesCache) {
                console.log('[PANCAKE] ⚠️ Returning stale cache due to error');
                return this.unreadPagesCache;
            }
            return [];
        }
    }

    /**
     * Search conversations theo query (tên khách hàng, fb_id, etc.)
     * Tối ưu hơn fetchConversations() vì chỉ search những gì cần
     * @param {string} query - Search query (tên hoặc fb_id)
     * @param {Array<string>} pageIds - Danh sách page IDs để search (optional)
     * @returns {Promise<Object>} { conversations: Array, customerId: string|null }
     */
    async searchConversations(query, pageIds = null) {
        try {
            if (!query) {
                console.warn('[PANCAKE] searchConversations: No query provided');
                return { conversations: [], customerId: null };
            }

            console.log(`[PANCAKE] Searching conversations for query: "${query}"`);

            const token = await this.getToken();
            if (!token) {
                throw new Error('No Pancake token available');
            }

            // Use pageIds from parameter or default to all pageIds
            const searchPageIds = pageIds || this.pageIds;

            if (searchPageIds.length === 0) {
                await this.fetchPages();
                if (this.pageIds.length === 0) {
                    console.warn('[PANCAKE] No pages found for search');
                    return { conversations: [], customerId: null };
                }
            }

            // Build search URL with query parameter
            // Format: /conversations/search?q={query}&page_ids={pageIds}&access_token={token}
            const pageIdsParam = (searchPageIds || this.pageIds).join(',');
            const encodedQuery = encodeURIComponent(query);
            const queryString = `q=${encodedQuery}&access_token=${token}&cursor_mode=true`;

            const url = window.API_CONFIG.buildUrl.pancake('conversations/search', queryString);

            console.log('[PANCAKE] Search URL:', url);

            // Need to send page_ids in request body as FormData
            const formData = new FormData();
            formData.append('page_ids', pageIdsParam);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                body: formData
            }, 3, true); // skipFallback = true for conversation search

            console.log('[PANCAKE] Search response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Search error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Search results:', data);

            const conversations = data.conversations || [];

            // Extract customer ID from first conversation's customers array
            let customerId = null;
            if (conversations.length > 0 && conversations[0].customers && conversations[0].customers.length > 0) {
                customerId = conversations[0].customers[0].id;
                console.log(`[PANCAKE] ✅ Found customer ID from search: ${customerId}`);
            }

            return {
                conversations,
                customerId
            };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error searching conversations:', error);
            return { conversations: [], customerId: null };
        }
    }

    /**
     * Fetch conversations for a customer by fb_id directly
     * API: GET /conversations/customer/{fb_id}?pages[{pageId}]=0
     * @param {string} pageId - Facebook Page ID
     * @param {string} fbId - Facebook AS User ID (Facebook_ASUserId)
     * @returns {Promise<Object>} { conversations: Array, customerUuid: string|null, success: boolean }
     */
    async fetchConversationsByCustomerFbId(pageId, fbId) {
        try {
            if (!pageId || !fbId) {
                console.warn('[PANCAKE] fetchConversationsByCustomerFbId: Missing pageId or fbId');
                return { conversations: [], customerUuid: null, success: false };
            }

            console.log(`[PANCAKE] Fetching conversations for pageId=${pageId}, fbId=${fbId}`);

            const token = await this.getToken();
            if (!token) {
                throw new Error('No Pancake token available');
            }

            // Build URL: GET /conversations/customer/{fb_id}?pages[{pageId}]=0
            const queryString = `pages[${pageId}]=0&access_token=${token}`;
            const url = window.API_CONFIG.buildUrl.pancake(
                `conversations/customer/${fbId}`,
                queryString
            );

            console.log('[PANCAKE] Fetch conversations URL:', url);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, 3, true); // skipFallback = true

            console.log('[PANCAKE] Conversations response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Conversations response:', data);

            const conversations = data.conversations || [];

            // DEBUG: Log first conversation structure to find real PSID field
            if (conversations.length > 0) {
                const firstConv = conversations[0];
                console.log('[PANCAKE] 🔍 DEBUG First conversation structure:', JSON.stringify({
                    id: firstConv.id,
                    type: firstConv.type,
                    from_psid: firstConv.from_psid,
                    from: firstConv.from,
                    customers: firstConv.customers?.map(c => ({ id: c.id, fb_id: c.fb_id, name: c.name })),
                    page_id: firstConv.page_id
                }, null, 2));
            }

            // Extract customer UUID from first conversation
            let customerUuid = null;
            if (conversations.length > 0 && conversations[0].customers && conversations[0].customers.length > 0) {
                customerUuid = conversations[0].customers[0].id;
                console.log(`[PANCAKE] ✅ Found customer UUID: ${customerUuid}`);
            }

            return {
                conversations,
                customerUuid,
                success: true
            };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching conversations by fb_id:', error);
            return { conversations: [], customerUuid: null, success: false };
        }
    }

    /**
     * Search conversations by comment IDs and fb_id to get customer UUID
     * @param {string} facebookUserName - Facebook user name for search
     * @param {string} commentIds - Comma-separated comment IDs
     * @param {string} fbId - Facebook AS User ID to match
     * @param {Array<string>} pageIds - Page IDs to search (optional)
     * @returns {Promise<Object>} { customerUuid: string|null, threadId: string|null, threadKey: string|null }
     */
    async searchConversationsByCommentIds(facebookUserName, commentIds, fbId, pageIds = null) {
        try {
            console.log(`[PANCAKE] Searching by comment IDs for user: ${facebookUserName}, fb_id: ${fbId}`);

            // Step 1: Search conversations by name
            const searchResult = await this.searchConversations(facebookUserName, pageIds);

            if (!searchResult.conversations || searchResult.conversations.length === 0) {
                console.warn('[PANCAKE] No conversations found in search');
                return { customerUuid: null, threadId: null, threadKey: null };
            }

            // Step 2: Split comment IDs
            const commentIdArray = commentIds.split(',').map(id => id.trim());
            console.log('[PANCAKE] Looking for comment IDs:', commentIdArray);

            // Step 3: Find conversation matching comment ID
            let matchedConversation = null;
            for (const conv of searchResult.conversations) {
                // Match by conversation.id with any comment ID
                if (commentIdArray.includes(conv.id)) {
                    // Verify fb_id matches
                    const hasMatchingCustomer = conv.customers?.some(c => c.fb_id === fbId);
                    if (hasMatchingCustomer) {
                        matchedConversation = conv;
                        console.log('[PANCAKE] ✅ Found COMMENT conversation matching comment ID:', conv.id);
                        break;
                    }
                }
            }

            if (!matchedConversation) {
                console.warn('[PANCAKE] No COMMENT conversation found matching comment IDs and fb_id');
                return { customerUuid: null, threadId: null, threadKey: null };
            }

            // Step 4: Extract customer UUID
            const customerUuid = matchedConversation.customers?.[0]?.id || null;

            if (!customerUuid) {
                console.warn('[PANCAKE] Customer UUID not found in matched conversation');
                return { customerUuid: null, threadId: null, threadKey: null };
            }

            console.log('[PANCAKE] ✅ Found customer UUID:', customerUuid);

            // Step 5: Find INBOX conversation with same customer UUID to get thread_id and thread_key
            const inboxConversation = searchResult.conversations.find(conv =>
                conv.type === 'INBOX' &&
                conv.customers?.some(c => c.id === customerUuid)
            );

            const threadId = inboxConversation?.thread_id || null;
            const threadKey = inboxConversation?.thread_key || null;

            if (threadId && threadKey) {
                console.log('[PANCAKE] ✅ Found thread_id and thread_key from INBOX conversation');
            } else {
                console.log('[PANCAKE] ℹ️ No thread_id/thread_key found in search, will use inbox_preview');
            }

            return {
                customerUuid,
                threadId,
                threadKey
            };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error in searchConversationsByCommentIds:', error);
            return { customerUuid: null, threadId: null, threadKey: null };
        }
    }

    /**
     * Lấy danh sách conversations từ Pancake API
     * @param {boolean} forceRefresh - Bắt buộc refresh
     * @returns {Promise<Array>}
     */
    async fetchConversations(forceRefresh = false) {
        try {
            // Check cache
            if (!forceRefresh && this.conversations.length > 0 && this.lastFetchTime) {
                const cacheAge = Date.now() - this.lastFetchTime;
                if (cacheAge < this.CACHE_DURATION) {
                    console.log('[PANCAKE] Using cached conversations, count:', this.conversations.length);
                    return this.conversations;
                }
            }

            if (this.isLoading) {
                console.log('[PANCAKE] Already loading conversations...');
                return this.conversations;
            }

            // Fetch pages first if needed
            if (this.pageIds.length === 0) {
                await this.fetchPages();
            }

            if (this.pageIds.length === 0) {
                console.warn('[PANCAKE] No pages found, cannot fetch conversations');
                return [];
            }

            this.isLoading = true;
            console.log('[PANCAKE] Fetching conversations from API via Cloudflare...');

            const token = await this.getToken();

            // Build query params - format: pages[pageId]=offset
            const pagesParams = this.pageIds.map(pageId => `pages[${pageId}]=0`).join('&');
            const queryString = `${pagesParams}&unread_first=true&mode=OR&tags="ALL"&except_tags=[]&access_token=${token}&cursor_mode=true&from_platform=web`;

            // Use Cloudflare Worker proxy
            const url = window.API_CONFIG.buildUrl.pancake('conversations', queryString);

            console.log('[PANCAKE] Conversations URL:', url);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('[PANCAKE] Conversations response status:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Conversations response data:', data);

            this.conversations = data.conversations || [];
            this.lastFetchTime = Date.now();

            // Build conversation map
            this.buildConversationMap();

            console.log(`[PANCAKE] ✅ Fetched ${this.conversations.length} conversations`);

            return this.conversations;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching conversations:', error);
            console.error('[PANCAKE] Error stack:', error.stack);
            return [];
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Build Maps từ PSID và Facebook ID -> conversation để lookup nhanh
     * Phân loại dựa trên field "type": "INBOX" hoặc "COMMENT"
     * - INBOX messages: thường có from_psid
     * - COMMENT messages: thường from_psid = null, chỉ có from.id
     */
    buildConversationMap() {
        this.inboxMapByPSID.clear();
        this.inboxMapByFBID.clear();
        this.commentMapByPSID.clear();
        this.commentMapByFBID.clear();
        this.conversationsByCustomerFbId.clear();

        this.conversations.forEach(conv => {
            const convType = conv.type; // "INBOX" or "COMMENT"

            if (convType === 'INBOX') {
                // INBOX conversations
                if (conv.from_psid) {
                    this.inboxMapByPSID.set(conv.from_psid, conv);
                }
                if (conv.from && conv.from.id) {
                    this.inboxMapByFBID.set(conv.from.id, conv);
                }
            } else if (convType === 'COMMENT') {
                // COMMENT conversations
                if (conv.from_psid) {
                    this.commentMapByPSID.set(conv.from_psid, conv);
                }
                if (conv.from && conv.from.id) {
                    this.commentMapByFBID.set(conv.from.id, conv);
                }
            }

            // Map by customers[].fb_id for both INBOX and COMMENT
            // This is critical for COMMENT conversations where from_psid is null
            if (conv.customers && conv.customers.length > 0) {
                conv.customers.forEach(customer => {
                    if (customer.fb_id) {
                        this.conversationsByCustomerFbId.set(customer.fb_id, conv);
                    }
                });
            }
        });

        console.log(`[PANCAKE] Built conversation maps:`);
        console.log(`  - INBOX by PSID: ${this.inboxMapByPSID.size} entries`);
        console.log(`  - INBOX by FBID: ${this.inboxMapByFBID.size} entries`);
        console.log(`  - COMMENT by PSID: ${this.commentMapByPSID.size} entries`);
        console.log(`  - COMMENT by FBID: ${this.commentMapByFBID.size} entries`);
        console.log(`  - By Customer FB ID: ${this.conversationsByCustomerFbId.size} entries`);
    }

    /**
     * Lấy conversation theo Facebook User ID (bất kỳ type nào)
     * Tìm trong cả INBOX và COMMENT maps
     * Ưu tiên: INBOX by PSID → INBOX by FBID → COMMENT by FBID → COMMENT by PSID → customers[].fb_id
     * @param {string} userId - Facebook User ID (Facebook_ASUserId)
     * @returns {Object|null}
     */
    getConversationByUserId(userId) {
        if (!userId) return null;

        // Try INBOX maps first (most common)
        let conversation = this.inboxMapByPSID.get(userId);
        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userId);
        }

        // Fallback to COMMENT maps
        if (!conversation) {
            conversation = this.commentMapByFBID.get(userId);
        }
        if (!conversation) {
            conversation = this.commentMapByPSID.get(userId);
        }

        // Last resort: Search by customers[].fb_id
        // This is critical for COMMENT conversations where:
        // - from_psid is null
        // - order.Facebook_ASUserId doesn't match conversation.from.id
        // - The correct match is in customers[].fb_id
        if (!conversation) {
            conversation = this.conversationsByCustomerFbId.get(userId);
            if (conversation) {
                console.log('[PANCAKE] ✅ Found conversation via customers[].fb_id:', {
                    userId,
                    convId: conversation.id,
                    convType: conversation.type,
                    customerName: conversation.customers?.[0]?.name
                });
            }
        }

        return conversation || null;
    }

    /**
     * Lấy unread info cho một order
     * @param {Object} order - Order object (có Facebook_ASUserId)
     * @returns {Object} { hasUnread, unreadCount }
     */
    getUnreadInfoForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        const conversation = this.getConversationByUserId(userId);

        if (!conversation) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        // Pancake conversation có field:
        // - seen: false = chưa đọc
        // - unread_count: số tin nhắn chưa đọc
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        return {
            hasUnread,
            unreadCount
        };
    }

    /**
     * Lấy unread info cho TIN NHẮN (INBOX only)
     * @param {Object} order - Order object (có Facebook_ASUserId)
     * @returns {Object} { hasUnread, unreadCount }
     */
    getMessageUnreadInfoForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        // Chỉ tìm trong INBOX maps
        // Ensure string conversion for lookup
        const userIdStr = String(userId);
        let conversation = this.inboxMapByPSID.get(userIdStr);

        if (!conversation) {
            // Try iterating if direct lookup fails (handle number/string mismatch in map keys)
            for (const [key, value] of this.inboxMapByPSID) {
                if (String(key) === userIdStr) {
                    conversation = value;
                    break;
                }
            }
        }

        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userIdStr);
            if (!conversation) {
                // Try iterating for FBID map too
                for (const [key, value] of this.inboxMapByFBID) {
                    if (String(key) === userIdStr) {
                        conversation = value;
                        break;
                    }
                }
            }
        }

        if (!conversation) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        return {
            hasUnread,
            unreadCount
        };
    }

    /**
     * Lấy unread info cho BÌNH LUẬN (COMMENT only)
     * @param {Object} order - Order object (có Facebook_ASUserId)
     * @returns {Object} { hasUnread, unreadCount }
     */
    getCommentUnreadInfoForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        // Chỉ tìm trong COMMENT maps
        let conversation = this.commentMapByFBID.get(userId);
        if (!conversation) {
            conversation = this.commentMapByPSID.get(userId);
        }

        if (!conversation) {
            return {
                hasUnread: false,
                unreadCount: 0
            };
        }

        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        return {
            hasUnread,
            unreadCount
        };
    }

    /**
     * Lấy messages chi tiết của một conversation từ Pancake API
     * @param {string} pageId - Facebook Page ID
     * @param {string} conversationId - Pancake Conversation ID
     * @param {number} currentCount - Vị trí message (optional, for pagination)
     * @param {number} customerId - Customer ID (PartnerId) - required by backend API
     * @returns {Promise<Object>} { messages: Array, conversation: Object }
     */
    async fetchMessagesForConversation(pageId, conversationId, currentCount = null, customerId = null, preloadedPageAccessToken = null) {
        try {
            console.log(`[PANCAKE] Fetching messages for pageId=${pageId}, conversationId=${conversationId}, customerId=${customerId}`);

            // Use preloaded token if available, otherwise fetch (for backward compatibility)
            const pageAccessToken = preloadedPageAccessToken || await window.pancakeTokenManager?.getOrGeneratePageAccessToken(pageId);
            if (!pageAccessToken) {
                throw new Error('No page_access_token available');
            }

            // Build URL: GET /pages/{pageId}/conversations/{conversationId}/messages (Official API)
            let extraParams = '';
            if (currentCount !== null) {
                extraParams += `&current_count=${currentCount}`;
            }
            // FIX: Add customer_id to prevent "Thiếu mã khách hàng" error
            if (customerId !== null) {
                extraParams += `&customer_id=${customerId}`;
            }

            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/messages`,
                pageAccessToken
            ) + extraParams;

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, 3, true); // skipFallback = true for messages

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] Fetched ${data.messages?.length || 0} messages`);

            // Extract customer_id from customers array if available
            const customers = data.customers || data.conv_customers || [];
            const extractedCustomerId = customers.length > 0 ? customers[0].id : null;
            if (extractedCustomerId) {
                console.log(`[PANCAKE] ✅ Extracted customer_id from response: ${extractedCustomerId}`);
            }

            return {
                messages: data.messages || [],
                conversation: data.conversation || null,
                customers: customers,
                customerId: extractedCustomerId // Return customer_id for caller to use
            };

        } catch (error) {
            console.error('[PANCAKE] Error fetching messages:', error);
            return {
                messages: [],
                conversation: null
            };
        }
    }

    /**
     * Lấy inbox preview và conversationId cho một customer
     * @param {string} pageId - Facebook Page ID
     * @param {string} customerId - Customer ID (PartnerId UUID)
     * @returns {Promise<Object>} { conversationId, messages, success }
     */
    async fetchInboxPreview(pageId, customerId) {
        try {
            console.log(`[PANCAKE] Fetching inbox preview for pageId=${pageId}, customerId=${customerId}`);

            const token = await this.getToken();
            if (!token) {
                throw new Error('No Pancake token available');
            }

            // Build URL: GET /api/v1/pages/{pageId}/customers/{customerId}/inbox_preview
            const queryString = `access_token=${token}`;
            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/customers/${customerId}/inbox_preview`,
                queryString
            );

            const response = await API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, 3, true); // skipFallback = true for inbox_preview

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[PANCAKE] Inbox preview response:`, data);

            if (!data.success) {
                console.warn('[PANCAKE] ⚠️ Inbox preview API returned success=false:', data.message || 'No message');
                return {
                    conversationId: null,
                    messages: [],
                    success: false,
                    error: data.message || 'Inbox preview API returned success=false'
                };
            }

            // Extract from_id from data array (first message from customer)
            let fromId = null;
            if (data.data && data.data.length > 0) {
                const customerMessage = data.data.find(msg =>
                    msg.from && msg.from.id && msg.from.id !== pageId
                );
                if (customerMessage) {
                    fromId = customerMessage.from.id;
                }
            }
            // Fallback to from_id field if available
            if (!fromId && data.from_id) {
                fromId = data.from_id;
            }

            // Extract BOTH conversationIds from response
            // - inbox_conv_id: for INBOX messages
            // - comment_conv_id: for COMMENT replies
            const inboxConversationId = data.inbox_conv_id;
            const commentConversationId = data.comment_conv_id;

            // Default conversationId = inbox (for backwards compatibility)
            const conversationId = inboxConversationId;

            console.log(`[PANCAKE] ✅ Got conversationIds from inbox_preview:`);
            console.log(`  - inbox_conv_id: ${inboxConversationId}`);
            console.log(`  - comment_conv_id: ${commentConversationId}`);

            return {
                conversationId: conversationId,          // Default (inbox) - backwards compatible
                inboxConversationId: inboxConversationId,   // Explicit inbox conversation ID
                commentConversationId: commentConversationId, // Explicit comment conversation ID
                messages: data.data || [],
                threadId: data.thread_id_preview || data.thread_id,
                threadKey: data.thread_key_preview || data.thread_key,
                fromId: fromId,
                canInbox: data.can_inbox,
                updatedAt: data.updated_at,
                success: true
            };

        } catch (error) {
            console.error('[PANCAKE] ❌ Error fetching inbox preview:', error);
            return {
                conversationId: null,
                messages: [],
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Tìm tin nhắn cuối cùng TỪ KHÁCH (không phải từ page)
     * Dùng để kiểm tra Facebook 24-hour messaging policy
     * @param {Array} messages - Array of messages from fetchMessagesForConversation
     * @param {string} pageId - Facebook Page ID
     * @returns {Object|null} Last message from customer, or null
     */
    findLastCustomerMessage(messages, pageId) {
        if (!messages || messages.length === 0) {
            return null;
        }

        // Messages are usually sorted newest first, so iterate from start
        // Find the first message that is NOT from the page (is from customer)
        for (const msg of messages) {
            // Check if message is from customer (not from page)
            const isFromPage = msg.from?.id === pageId;
            if (!isFromPage) {
                console.log(`[DEBUG-24H] Found last customer message:`, {
                    id: msg.id,
                    from: msg.from,
                    created_time: msg.created_time,
                    inserted_at: msg.inserted_at,
                    message: msg.message?.substring(0, 50)
                });
                return msg;
            }
        }

        console.warn(`[DEBUG-24H] No customer messages found in conversation - all messages are from page!`);
        return null;
    }

    /**
     * Lấy tin nhắn cuối cùng cho order từ Pancake conversation
     * CHỈ LẤY INBOX conversations (type === "INBOX")
     * @param {Object} order - Order object
     * @returns {Object} { message, messageType, hasUnread, unreadCount, attachments, type, pageId, customerId }
     */
    getLastMessageForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                attachments: null,
                type: null
            };
        }

        // Get INBOX conversation only (check type === "INBOX")
        const userIdStr = String(userId);
        let conversation = this.inboxMapByPSID.get(userIdStr);

        if (!conversation) {
            // Try iterating if direct lookup fails
            for (const [key, value] of this.inboxMapByPSID) {
                if (String(key) === userIdStr) {
                    conversation = value;
                    break;
                }
            }
        }

        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userIdStr);
            if (!conversation) {
                // Try iterating for FBID map too
                for (const [key, value] of this.inboxMapByFBID) {
                    if (String(key) === userIdStr) {
                        conversation = value;
                        break;
                    }
                }
            }
        }

        if (!conversation) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                attachments: null,
                type: null
            };
        }

        // Verify it's actually INBOX type (should always be true due to separate maps)
        if (conversation.type !== 'INBOX') {
            console.warn(`[PANCAKE] Found conversation but type is ${conversation.type}, expected INBOX`);
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                attachments: null,
                type: null
            };
        }

        // Extract last message from Pancake conversation
        // Use last_message.text from Pancake API (not snippet!)
        const lastMessage = conversation.last_message?.text ||
                           conversation.last_message?.message ||
                           conversation.snippet ||
                           null;

        console.log(`[DEBUG-DATA] getLastMessageForOrder: Found conversation ${conversation.id} for user ${userIdStr}`);
        console.log(`[DEBUG-DATA] Last message text: "${lastMessage}", Unread: ${conversation.unread_count}`);

        // DEBUG: Log full conversation structure to understand available fields
        console.log(`[DEBUG-CONVERSATION] Full conversation object:`, conversation);

        // DEBUG: Log timestamp information for 24-hour policy diagnosis
        console.log(`[DEBUG-TIMESTAMP] Conversation updated_at: ${conversation.updated_at}`);
        console.log(`[DEBUG-TIMESTAMP] Conversation inserted_at: ${conversation.inserted_at}`);
        console.log(`[DEBUG-TIMESTAMP] Last message exists: ${!!conversation.last_message}`);

        if (conversation.last_message) {
            console.log(`[DEBUG-TIMESTAMP] Last message object:`, conversation.last_message);
            console.log(`[DEBUG-TIMESTAMP] Last message created_time: ${conversation.last_message.created_time}`);
            console.log(`[DEBUG-TIMESTAMP] Last message inserted_at: ${conversation.last_message.inserted_at}`);
            console.log(`[DEBUG-TIMESTAMP] Last message from.id: ${conversation.last_message.from?.id}`);
            console.log(`[DEBUG-TIMESTAMP] Last message from.name: ${conversation.last_message.from?.name}`);
        } else {
            console.warn(`[DEBUG-TIMESTAMP] ⚠️ conversation.last_message is NULL/UNDEFINED - Cannot determine who sent last message!`);
            console.warn(`[DEBUG-TIMESTAMP] ⚠️ This is why 24-hour check might be failing!`);
        }

        // Calculate time since last message for 24-hour policy check
        const lastMessageTime = conversation.last_message?.created_time ||
            conversation.last_message?.inserted_at ||
            conversation.updated_at;

        if (lastMessageTime) {
            const lastMsgDate = new Date(lastMessageTime);
            const now = new Date();
            const hoursSinceLastMessage = (now - lastMsgDate) / (1000 * 60 * 60);
            console.log(`[DEBUG-TIMESTAMP] Hours since last message: ${hoursSinceLastMessage.toFixed(2)}`);
            console.log(`[DEBUG-TIMESTAMP] Can send (within 24h): ${hoursSinceLastMessage < 24}`);
            console.log(`[DEBUG-TIMESTAMP] Current time: ${now.toISOString()}`);
            console.log(`[DEBUG-TIMESTAMP] Last message time: ${lastMsgDate.toISOString()}`);
        }

        // Determine message type based on attachments
        let messageType = 'text';
        let attachments = null;

        if (conversation.last_message) {
            if (conversation.last_message.attachments && conversation.last_message.attachments.length > 0) {
                attachments = conversation.last_message.attachments;
                messageType = 'attachment';
            }
        }

        // Get unread info
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        // Return pageId and customerId for caller to fetch conversationId from inbox_preview if needed
        const pageId = conversation.page_id;
        const customerId = conversation.customers && conversation.customers.length > 0
            ? conversation.customers[0].id
            : null;

        return {
            message: lastMessage,
            messageType,
            hasUnread,
            unreadCount,
            attachments,
            type: 'message',  // Return 'message' for consistency with UI
            pageId: pageId,
            customerId: customerId,  // Return customerId to fetch conversationId from inbox_preview
            lastMessageTime: lastMessageTime,  // Add timestamp for 24-hour policy check
            updatedAt: conversation.updated_at,
            canSendMessage: lastMessageTime ? ((new Date() - new Date(lastMessageTime)) / (1000 * 60 * 60) < 24) : false
        };
    }

    /**
     * Lấy comment cuối cùng cho order từ Pancake conversation
     * CHỈ LẤY COMMENT conversations (type === "COMMENT")
     * @param {Object} order - Order object
     * @returns {Object} { message, messageType, hasUnread, unreadCount, type }
     */
    getLastCommentForOrder(order) {
        const userId = order.Facebook_ASUserId;

        if (!userId) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                type: 'comment'
            };
        }

        // Get COMMENT conversation only (check type === "COMMENT")
        // Try FBID first as COMMENT usually doesn't have from_psid
        const userIdStr = String(userId);
        let conversation = this.commentMapByFBID.get(userIdStr);

        if (!conversation) {
            // Try iterating if direct lookup fails
            for (const [key, value] of this.commentMapByFBID) {
                if (String(key) === userIdStr) {
                    conversation = value;
                    break;
                }
            }
        }

        if (!conversation) {
            conversation = this.commentMapByPSID.get(userIdStr);
            if (!conversation) {
                // Try iterating for PSID map too
                for (const [key, value] of this.commentMapByPSID) {
                    if (String(key) === userIdStr) {
                        conversation = value;
                        break;
                    }
                }
            }
        }

        if (!conversation) {
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                type: 'comment'
            };
        }

        // Verify it's actually COMMENT type (should always be true due to separate maps)
        if (conversation.type !== 'COMMENT') {
            console.warn(`[PANCAKE] Found conversation but type is ${conversation.type}, expected COMMENT`);
            return {
                message: null,
                messageType: null,
                hasUnread: false,
                unreadCount: 0,
                type: 'comment'
            };
        }

        // Extract last comment
        const lastMessage = conversation.snippet || null;
        const messageType = 'text';

        // Get unread info
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        // Use conversation.id directly from Pancake API
        // Do NOT construct conversationId manually as Pancake uses complex format
        const conversationId = conversation.id;

        return {
            message: lastMessage,
            messageType,
            hasUnread,
            unreadCount,
            type: 'comment',
            conversationId: conversationId,
            pageId: conversation.page_id
        };
    }

    /**
     * Kiểm tra 24-hour messaging window cho một conversation
     * Fetch messages và tìm tin nhắn cuối từ KHÁCH (không phải từ page)
     * @param {string} pageId - Facebook Page ID
     * @param {string} conversationId - Conversation ID
     * @param {number} customerId - Customer ID (PartnerId) - required by backend API
     * @returns {Promise<Object>} { canSend: boolean, hoursSinceLastMessage: number, lastCustomerMessage: Object|null }
     */
    async check24HourWindow(pageId, conversationId, customerId = null) {
        try {
            console.log(`[DEBUG-24H] Checking 24-hour window for pageId=${pageId}, conversationId=${conversationId}, customerId=${customerId}`);

            // Fetch messages for this conversation
            const { messages } = await this.fetchMessagesForConversation(pageId, conversationId, null, customerId);

            if (!messages || messages.length === 0) {
                console.warn(`[DEBUG-24H] Cannot fetch messages - skipping 24h check (allow send)`);
                // FIX: Don't block user if API fails - let Facebook API handle 24h validation
                // Return canSend: true to avoid blocking user experience
                return {
                    canSend: true,  // Changed from false to true
                    hoursSinceLastMessage: null,
                    lastCustomerMessage: null,
                    reason: 'Cannot verify 24-hour window - API unavailable (proceeding anyway)'
                };
            }

            // Find last message FROM customer (not from page)
            const lastCustomerMsg = this.findLastCustomerMessage(messages, pageId);

            if (!lastCustomerMsg) {
                console.warn(`[DEBUG-24H] No customer messages found - all messages are from page (allow send)`);
                // FIX: Don't block user - let Facebook API handle validation
                return {
                    canSend: true,  // Changed from false to true
                    hoursSinceLastMessage: null,
                    lastCustomerMessage: null,
                    reason: 'No customer messages found - cannot verify 24-hour window (proceeding anyway)'
                };
            }

            // Calculate time since last customer message
            const lastMsgTime = lastCustomerMsg.created_time || lastCustomerMsg.inserted_at;
            if (!lastMsgTime) {
                console.warn(`[DEBUG-24H] Last customer message has no timestamp (allow send)`);
                // FIX: Don't block user - let Facebook API handle validation
                return {
                    canSend: true,  // Changed from false to true
                    hoursSinceLastMessage: null,
                    lastCustomerMessage: lastCustomerMsg,
                    reason: 'Cannot determine message timestamp (proceeding anyway)'
                };
            }

            const lastMsgDate = new Date(lastMsgTime);
            const now = new Date();
            const hoursSinceLastMessage = (now - lastMsgDate) / (1000 * 60 * 60);
            const canSend = hoursSinceLastMessage < 24;

            console.log(`[DEBUG-24H] ✅ Analysis complete:`, {
                lastMessageTime: lastMsgDate.toISOString(),
                currentTime: now.toISOString(),
                hoursSinceLastMessage: hoursSinceLastMessage.toFixed(2),
                canSend,
                customerName: lastCustomerMsg.from?.name
            });

            return {
                canSend,
                hoursSinceLastMessage: parseFloat(hoursSinceLastMessage.toFixed(2)),
                lastCustomerMessage: lastCustomerMsg,
                lastMessageTime: lastMsgDate.toISOString(),
                reason: canSend ? 'Within 24-hour window' : `24-hour window expired (${hoursSinceLastMessage.toFixed(1)} hours ago)`
            };

        } catch (error) {
            console.error(`[DEBUG-24H] Error checking 24-hour window:`, error);
            // FIX: Don't block user on error - let Facebook API handle validation
            return {
                canSend: true,  // Changed from false to true
                hoursSinceLastMessage: null,
                lastCustomerMessage: null,
                reason: `Error checking 24h window (proceeding anyway): ${error.message}`
            };
        }
    }

    /**
     * Parse channelId từ Facebook_PostId
     * Format: pageId_postId_... -> lấy pageId (đầu tiên)
     * @param {string} facebookPostId - Facebook Post ID
     * @returns {string|null}
     */
    parseChannelId(facebookPostId) {
        if (!facebookPostId) return null;
        // Format: pageId_postId hoặc pageId_postId_xxx
        const parts = facebookPostId.split('_');
        return parts[0] || null;
    }

    /**
     * Lấy thông tin chat cho một order (channelId, psid, hasChat)
     * @param {Object} order - Order object
     * @returns {Object} { channelId, psid, hasChat }
     */
    getChatInfoForOrder(order) {
        if (!order) {
            return { channelId: null, psid: null, hasChat: false };
        }

        const psid = order.Facebook_ASUserId || null;
        const channelId = this.parseChannelId(order.Facebook_PostId);
        const hasChat = !!(psid && channelId);

        return {
            channelId,
            psid,
            hasChat
        };
    }

    /**
     * Lấy tin nhắn cuối cùng cho một order (INBOX only)
     * @param {Object} order - Order object
     * @returns {Object} { message, hasUnread, unreadCount, attachments }
     */
    getLastMessageForOrder(order) {
        if (!order || !order.Facebook_ASUserId) {
            return {
                message: '',
                hasUnread: false,
                unreadCount: 0,
                attachments: []
            };
        }

        // Find conversation in INBOX map
        const userId = order.Facebook_ASUserId;
        let conversation = this.inboxMapByPSID.get(userId);
        if (!conversation) {
            conversation = this.inboxMapByFBID.get(userId);
        }

        if (!conversation) {
            return {
                message: '',
                hasUnread: false,
                unreadCount: 0,
                attachments: []
            };
        }

        // Extract last message info from conversation
        // Use last_message.text from Pancake API (not snippet!)
        const lastMessage = conversation.last_message?.text ||
                           conversation.last_message?.message ||
                           conversation.snippet ||
                           '';
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        // Check for attachments in last message
        let attachments = [];
        if (conversation.last_message_attachments) {
            attachments = conversation.last_message_attachments;
        }

        return {
            message: lastMessage,
            hasUnread,
            unreadCount,
            attachments
        };
    }

    /**
     * Lấy bình luận cuối cùng cho một order (COMMENT only)
     * @param {string} channelId - Page ID
     * @param {string} psid - Customer PSID
     * @param {Object} order - Order object
     * @returns {Object} { message, hasUnread, unreadCount, attachments }
     */
    getLastCommentForOrder(channelId, psid, order) {
        if (!order || !order.Facebook_ASUserId) {
            return {
                message: '',
                hasUnread: false,
                unreadCount: 0,
                attachments: []
            };
        }

        // Find conversation in COMMENT map
        const userId = order.Facebook_ASUserId;
        let conversation = this.commentMapByFBID.get(userId);
        if (!conversation) {
            conversation = this.commentMapByPSID.get(userId);
        }
        // Also try customers fb_id map for COMMENT type
        if (!conversation) {
            conversation = this.conversationsByCustomerFbId.get(userId);
            // Make sure it's a COMMENT type
            if (conversation && conversation.type !== 'COMMENT') {
                conversation = null;
            }
        }

        if (!conversation) {
            return {
                message: '',
                hasUnread: false,
                unreadCount: 0,
                attachments: []
            };
        }

        // Extract last comment info
        // Use last_message.text from Pancake API (not snippet!)
        const lastMessage = conversation.last_message?.text ||
                           conversation.last_message?.message ||
                           conversation.snippet ||
                           '';
        const hasUnread = conversation.seen === false && conversation.unread_count > 0;
        const unreadCount = conversation.unread_count || 0;

        return {
            message: lastMessage,
            hasUnread,
            unreadCount,
            attachments: []
        };
    }

    /**
     * Wrapper function for fetchMessages - tương thích với tab1-orders.js
     * @param {string} pageId - Page ID (channelId)
     * @param {string} psid - Customer PSID
     * @param {string|number} cursorOrCount - Cursor string (old) or currentCount number (new) for pagination
     * @param {string} customerId - Optional customer UUID (passed from caller)
     * @returns {Promise<Object>} { messages, conversation }
     */
    async fetchMessages(pageId, psid, cursorOrCount = null, customerId = null) {
        try {
            console.log(`[PANCAKE] fetchMessages called: pageId=${pageId}, psid=${psid}, cursorOrCount=${cursorOrCount}, customerId=${customerId}`);

            // Determine if cursorOrCount is a number (currentCount) or null/conversationId (old behavior)
            let currentCount = null;
            let conversationId = null;

            if (typeof cursorOrCount === 'number') {
                // New behavior: count-based pagination
                currentCount = cursorOrCount;
                console.log('[PANCAKE] Using count-based pagination, currentCount:', currentCount);
            } else {
                // Old behavior: conversationId passed
                conversationId = cursorOrCount;
            }

            // Use passed conversationId or try to find from conversation map
            let convId = conversationId;
            let custId = customerId;

            // Try to find conversation in cache
            const cachedConv = this.inboxMapByPSID.get(psid) || this.inboxMapByFBID.get(psid);

            if (cachedConv) {
                if (!convId) convId = cachedConv.id;
                if (!custId) custId = cachedConv.customers?.[0]?.id || null;
                console.log('[PANCAKE] Found conversation in cache:', convId, 'customerId:', custId);
            }

            // CRITICAL: Nếu không có customer_id, cần tìm conversation để lấy
            // Vì Pancake API yêu cầu customer_id cho endpoint messages
            if (!custId) {
                console.log('[PANCAKE] No customer_id in cache, searching for conversation...');

                // Tìm trong tất cả conversations đã load
                const matchingConv = this.conversations.find(conv =>
                    conv.type === 'INBOX' &&
                    conv.page_id === pageId &&
                    (conv.from_psid === psid || conv.from?.id === psid)
                );

                if (matchingConv) {
                    if (!convId) convId = matchingConv.id;
                    custId = matchingConv.customers?.[0]?.id || null;
                    console.log('[PANCAKE] ✅ Found in conversations array:', convId, 'customerId:', custId);
                }
            }

            // Nếu vẫn không có convId, dùng format mặc định
            if (!convId) {
                convId = `${pageId}_${psid}`;
                console.log('[PANCAKE] Using default conversationId format:', convId);
            }

            // Fallback: Nếu vẫn không có customer_id, fetch conversation info từ API
            if (!custId) {
                console.log('[PANCAKE] Still no customer_id, fetching conversation info from API...');
                try {
                    const token = await this.getToken();
                    const convInfoUrl = window.API_CONFIG.buildUrl.pancake(
                        `pages/${pageId}/conversations/${convId}`,
                        `access_token=${token}`
                    );
                    const convResponse = await API_CONFIG.smartFetch(convInfoUrl, { method: 'GET' }, 2, true);
                    if (convResponse.ok) {
                        const convData = await convResponse.json();
                        custId = convData.customers?.[0]?.id || convData.conversation?.customers?.[0]?.id || null;
                        if (custId) {
                            console.log('[PANCAKE] ✅ Got customer_id from API:', custId);
                        }
                    }
                } catch (convError) {
                    console.warn('[PANCAKE] Could not fetch conversation info:', convError.message);
                }
            }

            const result = await this.fetchMessagesForConversation(pageId, convId, currentCount, custId);
            // Trả về thêm conversationId và customerId để caller có thể update state
            return {
                ...result,
                conversationId: convId,
                customerId: result.customerId || custId
            };
        } catch (error) {
            console.error('[PANCAKE] Error in fetchMessages:', error);
            return { messages: [], conversation: null, conversationId: null, customerId: null };
        }
    }

    /**
     * Wrapper function for fetchComments - tương thích với tab1-orders.js
     * @param {string} pageId - Page ID (channelId)
     * @param {string} psid - Customer PSID
     * @param {string} conversationId - Optional conversation ID
     * @param {string} postId - Optional Facebook Post ID for matching
     * @param {string} customerName - Optional customer name for searching
     * @returns {Promise<Object>} { messages, conversation }
     */
    async fetchComments(pageId, psid, conversationId = null, postId = null, customerName = null) {
        try {
            console.log(`[PANCAKE] fetchComments called: pageId=${pageId}, psid=${psid}, convId=${conversationId}, postId=${postId}`);

            // For comments, find conversation in COMMENT map
            let convId = conversationId;
            let customerId = null;

            // CRITICAL: Khi có postId, PHẢI tìm conversation match cả fb_id VÀ post_id
            // Vì cùng 1 khách hàng có thể comment trên NHIỀU post khác nhau
            if (!convId && postId) {
                console.log('[PANCAKE] Looking for conversation matching BOTH psid AND postId');

                // Bước 1: Tìm trong conversations đã load (memory)
                const matchingConvInMemory = this.conversations.find(conv =>
                    conv.type === 'COMMENT' &&
                    conv.post_id === postId &&
                    (conv.from?.id === psid ||
                     conv.from_psid === psid ||
                     conv.customers?.some(c => c.fb_id === psid))
                );

                if (matchingConvInMemory) {
                    convId = matchingConvInMemory.id;
                    customerId = matchingConvInMemory.customers?.[0]?.id || null;
                    console.log('[PANCAKE] ✅ Found in memory - conversation matching psid AND postId:', convId);
                }

                // Bước 2: Nếu không tìm thấy trong memory, fetch trực tiếp theo fb_id
                if (!convId && psid) {
                    console.log('[PANCAKE] Not found in memory, fetching conversations by fb_id:', psid);
                    try {
                        const result = await this.fetchConversationsByFbId(pageId, psid);
                        if (result.success && result.conversations && result.conversations.length > 0) {
                            console.log('[PANCAKE] Direct fetch returned', result.conversations.length, 'conversations');

                            // Debug: log all COMMENT conversations with their post_ids
                            const commentConvs = result.conversations.filter(c => c.type === 'COMMENT');
                            console.log('[PANCAKE] COMMENT conversations from direct fetch:', commentConvs.map(c => ({
                                id: c.id,
                                post_id: c.post_id,
                                from_id: c.from?.id,
                                customer_fb_id: c.customers?.[0]?.fb_id
                            })));

                            // Find conversation matching BOTH post_id AND fb_id/psid
                            const matchingConv = result.conversations.find(c =>
                                c.type === 'COMMENT' &&
                                c.post_id === postId &&
                                (c.from?.id === psid ||
                                 c.from_psid === psid ||
                                 c.customers?.some(cust => cust.fb_id === psid))
                            );

                            if (matchingConv) {
                                convId = matchingConv.id;
                                customerId = matchingConv.customers?.[0]?.id || null;
                                console.log('[PANCAKE] ✅ Found via direct fetch - conversation matching psid AND postId:', convId, 'customerId:', customerId);
                            } else {
                                // Fallback: chỉ match post_id nếu không tìm thấy exact match
                                const postOnlyMatch = result.conversations.find(c =>
                                    c.type === 'COMMENT' && c.post_id === postId
                                );
                                if (postOnlyMatch) {
                                    convId = postOnlyMatch.id;
                                    customerId = postOnlyMatch.customers?.[0]?.id || null;
                                    console.log('[PANCAKE] ⚠️ Fallback: Found conversation by postId only:', convId);
                                } else {
                                    console.log('[PANCAKE] ⚠️ No conversation matched postId:', postId);
                                }
                            }
                        }
                    } catch (fetchError) {
                        console.error('[PANCAKE] Error fetching by fb_id:', fetchError);
                    }
                }
            }

            // Fallback khi KHÔNG có postId: dùng cache như cũ
            if (!convId && !postId) {
                // Try cache first
                const conv = this.commentMapByFBID.get(psid) || this.commentMapByPSID.get(psid);
                if (conv) {
                    convId = conv.id;
                    customerId = conv.customers?.[0]?.id || null;
                    console.log('[PANCAKE] Found conversation in cache (no postId):', convId);
                } else {
                    // Fallback: use customers fb_id map
                    const customerConv = this.conversationsByCustomerFbId.get(psid);
                    if (customerConv && customerConv.type === 'COMMENT') {
                        convId = customerConv.id;
                        customerId = customerConv.customers?.[0]?.id || null;
                    }
                }
            }

            if (!convId) {
                console.log('[PANCAKE] No comment conversation found for PSID:', psid, 'postId:', postId);
                return { comments: [], messages: [], conversation: null };
            }

            const result = await this.fetchMessagesForConversation(pageId, convId, null, customerId);

            // Map messages to comments format for comment-modal.js compatibility
            const comments = (result.messages || []).map(msg => ({
                Id: msg.id,
                Message: msg.original_message || msg.message?.replace(/<[^>]*>/g, '') || '', // Strip HTML tags
                CreatedTime: msg.inserted_at,
                IsOwner: msg.from?.id === pageId, // Check if from page
                PostId: msg.page_id ? `${msg.page_id}_${msg.parent_id?.split('_')[0] || ''}` : null,
                ParentId: msg.parent_id !== msg.id ? msg.parent_id : null,
                FacebookId: msg.id,
                Attachments: msg.attachments || [],
                Status: msg.seen ? 10 : 30, // 30 = New, 10 = Seen
                from: msg.from
            }));

            console.log('[PANCAKE] Mapped', comments.length, 'comments from messages');

            return {
                comments: comments,
                messages: result.messages,
                conversation: result.conversation,
                customers: result.customers,
                customerId: result.customerId, // Return customer_id for caller to use
                after: null // Pagination cursor if needed
            };
        } catch (error) {
            console.error('[PANCAKE] Error in fetchComments:', error);
            return { comments: [], messages: [], conversation: null };
        }
    }

    /**
     * Lấy Facebook page access token từ cache
     * @param {string} pageId - Facebook Page ID
     * @returns {Promise<string|null>} Facebook Page access token
     */
    async getPageToken(pageId) {
        try {
            // Ensure pages are loaded
            if (this.pages.length === 0) {
                await this.fetchPages();
            }

            // Debug: log all pages to see structure
            console.log('[PANCAKE] Looking for pageId:', pageId);
            console.log('[PANCAKE] Available pages:', this.pages.map(p => ({
                id: p.id,
                fb_page_id: p.fb_page_id,
                page_id: p.page_id,
                name: p.name,
                hasToken: !!p.access_token
            })));

            // Find page in cache - try multiple field names
            const page = this.pages.find(p =>
                p.fb_page_id === pageId ||
                p.id === pageId ||
                p.page_id === pageId ||
                String(p.fb_page_id) === String(pageId) ||
                String(p.id) === String(pageId)
            );

            if (page) {
                console.log('[PANCAKE] Found page:', page);
                if (page.access_token) {
                    console.log('[PANCAKE] ✅ Found page token for pageId:', pageId);
                    return page.access_token;
                }
            }

            console.warn('[PANCAKE] ⚠️ No page token found for pageId:', pageId);
            return null;
        } catch (error) {
            console.error('[PANCAKE] Error getting page token:', error);
            return null;
        }
    }

    /**
     * Mark conversation as read (Pancake Official API)
     * POST /pages/{page_id}/conversations/{conversation_id}/read
     * @param {string} pageId - Page ID
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<boolean>}
     */
    async markConversationAsRead(pageId, conversationId) {
        try {
            console.log(`[PANCAKE] Marking conversation as read: ${conversationId}`);

            const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(pageId);
            if (!pageAccessToken) {
                throw new Error('No page_access_token available');
            }

            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/read`,
                pageAccessToken
            );

            const response = await window.API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Mark as read failed: ${response.status}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] ✅ Marked as read:', conversationId, data);
            return data.success !== false;
        } catch (error) {
            console.error('[PANCAKE] ❌ Mark as read failed:', error);
            return false;
        }
    }

    /**
     * Mark conversation as unread (Pancake Official API)
     * POST /pages/{page_id}/conversations/{conversation_id}/unread
     * @param {string} pageId - Page ID
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<boolean>}
     */
    async markConversationAsUnread(pageId, conversationId) {
        try {
            console.log(`[PANCAKE] Marking conversation as unread: ${conversationId}`);

            const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(pageId);
            if (!pageAccessToken) {
                throw new Error('No page_access_token available');
            }

            const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/unread`,
                pageAccessToken
            );

            const response = await window.API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Mark as unread failed: ${response.status}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] ✅ Marked as unread:', conversationId, data);
            return data.success !== false;
        } catch (error) {
            console.error('[PANCAKE] ❌ Mark as unread failed:', error);
            return false;
        }
    }

    /**
     * @deprecated Use markConversationAsRead instead
     * Legacy function for compatibility with TPOS
     */
    async markAsSeen(userId) {
        console.warn('[PANCAKE] markAsSeen is deprecated - use markConversationAsRead instead');
        return false;
    }

    /**
     * Update conversation read status in local cache
     * Called after successfully marking conversation as read/unread
     * @param {string} conversationId - Conversation ID
     * @param {boolean} isRead - true = mark as read, false = mark as unread
     */
    updateConversationReadStatus(conversationId, isRead) {
        if (!conversationId) {
            console.warn('[PANCAKE] updateConversationReadStatus: Missing conversationId');
            return false;
        }

        console.log(`[PANCAKE] Updating local conversation status: ${conversationId} → ${isRead ? 'READ' : 'UNREAD'}`);

        // Find conversation in conversations array (NOT allConversations!)
        const conversation = this.conversations.find(c => c.id === conversationId);

        if (conversation) {
            conversation.seen = isRead;
            conversation.unread_count = isRead ? 0 : (conversation.unread_count || 1);

            // Update in maps as well
            // Check all maps to ensure consistency
            [this.inboxMapByPSID, this.inboxMapByFBID, this.commentMapByPSID, this.commentMapByFBID].forEach(map => {
                for (const [key, conv] of map) {
                    if (conv.id === conversationId) {
                        conv.seen = isRead;
                        conv.unread_count = isRead ? 0 : (conv.unread_count || 1);
                        console.log(`[PANCAKE] ✅ Updated conversation in map:`, key);
                    }
                }
            });

            console.log('[PANCAKE] ✅ Local conversation data updated');
            return true;
        } else {
            console.warn('[PANCAKE] ⚠️ Conversation not found in cache:', conversationId);
            return false;
        }
    }

    /**
     * Initialize - load token và fetch data
     * @returns {Promise<boolean>}
     */
    async initialize() {
        try {
            console.log('[PANCAKE] Initializing...');

            // Try to get token
            if (!this.getToken()) {
                console.error('[PANCAKE] Cannot initialize - no JWT token');
                return false;
            }

            // Fetch pages and conversations
            await this.fetchPages();
            await this.fetchConversations();

            console.log('[PANCAKE] ✅ Initialized successfully');
            return true;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error initializing:', error);
            return false;
        }
    }
    /**
     * Calculate SHA-1 hash of a file
     * @param {File} file 
     * @returns {Promise<string>}
     */
    async calculateSHA1(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    /**
     * Upload image to Pancake API
     * Uses Internal API (pancake.vn/api/v1) for full response with content_url
     * POST /pages/{page_id}/contents
     * @param {string} pageId
     * @param {File} file
     * @returns {Promise<{content_url: string, content_id: string, id: string}>}
     */
    async uploadImage(pageId, file) {
        try {
            const fileName = file.name || 'compressed-image.jpg';
            const fileType = file.type || 'image/jpeg';
            console.log(`[PANCAKE] Uploading image: ${fileName}, size: ${file.size}, type: ${fileType}`);

            // Get JWT access_token for Internal API (pancake.vn)
            const accessToken = await this.getToken();
            if (!accessToken) throw new Error('No Pancake access_token available');

            // Internal API: POST /pages/{page_id}/contents
            // Content-Type: multipart/form-data
            // Body: file=@image.jpg
            // Response includes: content_url, content_id, content_preview_url, fb_id, image_data
            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/contents`,
                `access_token=${accessToken}`
            );

            const formData = new FormData();
            // ⭐ IMPORTANT: Add filename for Blob objects (compressed images)
            // Pancake API needs filename to generate content_url
            const filename = file.name || 'image.jpg';
            formData.append('file', file, filename);

            console.log('[PANCAKE] Uploading to Internal API:', url.replace(/access_token=[^&]+/, 'access_token=***'));
            const response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                body: formData
            }, 3, true); // skipFallback = true for image upload

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PANCAKE] Upload failed:', response.status, errorText);
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[PANCAKE] Upload response:', data);

            // Internal API response format:
            // {
            //   content_id: "abc123...",
            //   content_url: "https://content.pancake.vn/.../image.jpg",
            //   content_preview_url: "https://content.pancake.vn/..._thumb.jpg",
            //   fb_id: "123456",
            //   image_data: { height: 1280, width: 1166 },
            //   mime_type: "image/jpeg",
            //   name: "image.png",
            //   success: true
            // }
            const result = {
                content_url: data.content_url || null,
                content_id: data.content_id || data.id || null,
                id: data.content_id || data.id || null,  // Alias for compatibility
                content_preview_url: data.content_preview_url || null,
                fb_id: data.fb_id || null,
                width: data.image_data?.width || null,
                height: data.image_data?.height || null
            };

            // Validate response
            if (!result.content_id) {
                console.error('[PANCAKE] ❌ Upload response missing content_id:', data);
                throw new Error('Upload response missing content_id');
            }

            // ⚠️ Warning if content_url is missing
            if (!result.content_url) {
                console.warn('[PANCAKE] ⚠️ Upload successful but content_url is NULL - Facebook may not display this image!');
                console.warn('[PANCAKE] Response data:', JSON.stringify(data));
            } else {
                console.log('[PANCAKE] ✅ Upload success - content_id:', result.content_id, 'content_url:', result.content_url);
            }

            return result;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error uploading image:', error);
            throw error;
        }
    }

    /**
     * Xóa ảnh trên Pancake server
     * @param {string} pageId - Facebook Page ID
     * @param {string} contentId - ID của ảnh (content ID)
     * @returns {Promise<boolean>}
     */
    async deleteImage(pageId, contentId) {
        try {
            console.log(`[PANCAKE] Deleting image ID: ${contentId} on page ${pageId}`);

            if (!contentId) {
                console.warn('[PANCAKE] No contentId provided for deletion');
                return false;
            }

            const token = await this.getToken();
            if (!token) throw new Error('No Pancake token available');

            // URL: https://pancake.vn/api/v1/pages/{pageId}/contents?ids={contentId}&access_token={token}
            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/contents`,
                `ids=${contentId}&access_token=${token}`
            );

            const response = await API_CONFIG.smartFetch(url, {
                method: 'DELETE',
                headers: {
                    'accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }, 3, true); // skipFallback = true for image delete

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[PANCAKE] Delete failed: ${response.status} ${response.statusText}`, errorText);
                return false;
            }

            const data = await response.json();
            console.log('[PANCAKE] Delete response:', data);

            return data.success || false;

        } catch (error) {
            console.error('[PANCAKE] ❌ Error deleting image:', error);
            return false;
        }
    }
}

// Create global instance
window.pancakeDataManager = new PancakeDataManager();
console.log('[PANCAKE] PancakeDataManager loaded');
