/**
 * TPOS Search Client for Purchase Orders
 * Provides window.TPOSClient for product code operations
 *
 * Token flow:
 *   Each company has its own TPOS account → direct login → correct company token
 *   CompanyId 1 (NJD LIVE): nvktlive1
 *   CompanyId 2 (NJD SHOP): nvktshop1
 *
 * Tokens cached per company in localStorage
 * All requests go through Cloudflare proxy to bypass CORS
 */

window.TPOSClient = (function() {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const TOKEN_URL = `${PROXY_URL}/api/token`;
    const SWITCH_COMPANY_URL = `${PROXY_URL}/api/odata/ApplicationUser/ODataService.SwitchCompany`;
    const TOKEN_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry

    const CREDENTIALS_BY_COMPANY = {
        1: { grant_type: 'password', username: 'nvktlive1', password: 'Aa@28612345678', client_id: 'tmtWebApp' },
        2: { grant_type: 'password', username: 'nvktshop1', password: 'Aa@28612345678', client_id: 'tmtWebApp' }
    };

    function getCredentials(companyId) {
        return CREDENTIALS_BY_COMPANY[companyId] || CREDENTIALS_BY_COMPANY[1];
    }

    // Token storage per company: { access_token, refresh_token, expires_at }
    const tokenStore = {};
    let refreshPromise = null;

    function storageKey(companyId) {
        return `bearer_token_data_${companyId}`;
    }

    function getCompanyId() {
        return window.ShopConfig?.getConfig()?.CompanyId || 1;
    }

    // =====================================================
    // HEADERS - match working pattern from dialogs.js
    // =====================================================

    function getHeaders(authToken) {
        return {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'feature-version': '2',
            'tposappversion': '6.2.6.1'
        };
    }

    // =====================================================
    // TOKEN MANAGEMENT - per company
    // =====================================================

    function isTokenValid(companyId) {
        const t = tokenStore[companyId];
        return t && t.access_token && t.expires_at && Date.now() < (t.expires_at - TOKEN_BUFFER);
    }

    function loadFromStorage(companyId) {
        try {
            const stored = localStorage.getItem(storageKey(companyId));
            if (stored) {
                const data = JSON.parse(stored);
                if (data.access_token && data.expires_at && Date.now() < (data.expires_at - TOKEN_BUFFER)) {
                    tokenStore[companyId] = data;
                    return true;
                }
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    /**
     * Try to get a refresh_token from localStorage (even if access_token expired)
     */
    function getStoredRefreshToken(companyId) {
        try {
            const stored = localStorage.getItem(storageKey(companyId));
            if (stored) {
                const data = JSON.parse(stored);
                if (data.refresh_token) return data.refresh_token;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    /**
     * Refresh token directly using a stored refresh_token.
     * Returns true if successful, false otherwise.
     */
    async function refreshWithToken(companyId, refreshToken) {
        try {
            console.log(`[TPOS-Search] Refreshing token for company ${companyId} using refresh_token...`);
            const response = await fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=tmtWebApp`
            });

            if (!response.ok) {
                console.warn(`[TPOS-Search] Refresh token failed: ${response.status}`);
                return false;
            }

            const data = await response.json();
            saveToken(companyId, data);
            console.log(`[TPOS-Search] Token refreshed OK for company ${companyId}`);
            return true;
        } catch (e) {
            console.warn('[TPOS-Search] Refresh token error:', e);
            return false;
        }
    }

    async function loadFromFirestore(companyId) {
        try {
            if (!window.firebase || !window.firebase.firestore) return false;
            const docId = companyId === 1 ? 'tpos_token' : `tpos_token_${companyId}`;
            const doc = await firebase.firestore().collection('tokens').doc(docId).get();
            if (!doc.exists) return false;
            const data = doc.data();
            if (data.access_token && data.expires_at && Date.now() < (data.expires_at - TOKEN_BUFFER)) {
                tokenStore[companyId] = data;
                try {
                    localStorage.setItem(storageKey(companyId), JSON.stringify(data));
                } catch (e) { /* ignore */ }
                console.log(`[TPOS-Search] Token loaded from Firestore for company ${companyId}`);
                return true;
            }
        } catch (e) {
            console.warn('[TPOS-Search] Firestore token load failed:', e);
        }
        return false;
    }

    function saveToken(companyId, tokenData) {
        const expiresAt = Date.now() + (tokenData.expires_in * 1000);
        const dataToSave = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            token_type: 'Bearer',
            expires_in: tokenData.expires_in,
            expires_at: expiresAt,
            issued_at: Date.now()
        };
        tokenStore[companyId] = dataToSave;

        try {
            localStorage.setItem(storageKey(companyId), JSON.stringify(dataToSave));
        } catch (e) { /* ignore */ }

        // Also save to Firestore
        try {
            if (window.firebase && window.firebase.firestore) {
                const docId = companyId === 1 ? 'tpos_token' : `tpos_token_${companyId}`;
                firebase.firestore().collection('tokens').doc(docId).set(dataToSave, { merge: true });
            }
        } catch (e) { /* ignore */ }
    }

    /**
     * Password login → gets token for the specified company directly
     * Each company has its own account, no SwitchCompany needed
     */
    async function loginWithPassword(companyId) {
        const cid = companyId || getCompanyId();
        const creds = getCredentials(cid);
        console.log(`[TPOS-Search] Password login with ${creds.username} for company ${cid}...`);
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(creds).toString()
        });

        if (!response.ok) {
            throw new Error(`Token fetch failed: ${response.status}`);
        }

        const data = await response.json();
        saveToken(cid, data);
        console.log(`[TPOS-Search] Password login OK, company ${cid} token saved`);
        return data;
    }

    /**
     * SwitchCompany + refresh_token → get token for target company
     * Used ONLY for manual Settings UI action, NOT in normal token flow
     * Flow: SwitchCompany(targetCompanyId) → refresh_token → new token
     */
    async function switchCompanyToken(targetCompanyId, sourceCompanyId) {
        const srcCid = sourceCompanyId || getCompanyId();
        console.log(`[TPOS-Search] Switching company ${srcCid} account to company ${targetCompanyId}...`);

        // Ensure a fresh token for the source company
        if (!isTokenValid(srcCid) || !tokenStore[srcCid]?.refresh_token) {
            await loginWithPassword(srcCid);
        }
        let currentToken = tokenStore[srcCid];

        // Step 1: Call SwitchCompany
        let switchResponse = await fetch(SWITCH_COMPANY_URL, {
            method: 'POST',
            headers: {
                ...getHeaders(currentToken.access_token),
                'Content-Type': 'application/json;charset=UTF-8'
            },
            body: JSON.stringify({ companyId: targetCompanyId })
        });

        // If 401, force fresh login and retry SwitchCompany once
        if (switchResponse.status === 401) {
            console.log('[TPOS-Search] SwitchCompany 401, forcing fresh login...');
            delete tokenStore[srcCid];
            try { localStorage.removeItem(storageKey(srcCid)); } catch (e) { /* ignore */ }
            await loginWithPassword(srcCid);
            currentToken = tokenStore[srcCid];

            switchResponse = await fetch(SWITCH_COMPANY_URL, {
                method: 'POST',
                headers: {
                    ...getHeaders(currentToken.access_token),
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({ companyId: targetCompanyId })
            });
        }

        if (!switchResponse.ok) {
            console.error(`[TPOS-Search] SwitchCompany failed: ${switchResponse.status}`);
            throw new Error(`SwitchCompany failed: ${switchResponse.status}`);
        }
        console.log(`[TPOS-Search] SwitchCompany(${targetCompanyId}) OK`);

        // Step 2: Refresh token to get new token with target CompanyId
        const refreshToken = currentToken.refresh_token;
        if (!refreshToken) {
            throw new Error('No refresh_token available for token refresh');
        }

        const refreshResponse = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${currentToken.access_token}`
            },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=tmtWebApp`
        });

        if (!refreshResponse.ok) {
            console.error(`[TPOS-Search] Token refresh failed: ${refreshResponse.status}`);
            throw new Error(`Token refresh failed: ${refreshResponse.status}`);
        }

        const newTokenData = await refreshResponse.json();
        saveToken(targetCompanyId, newTokenData);
        console.log(`[TPOS-Search] Company ${targetCompanyId} token saved`);
        return newTokenData;
    }

    /**
     * Get valid token for current company
     */
    async function getToken() {
        const companyId = getCompanyId();

        // Always try localStorage first (another tab may have refreshed)
        if (loadFromStorage(companyId) && isTokenValid(companyId)) {
            return tokenStore[companyId].access_token;
        }

        // Fallback to in-memory (if localStorage was cleared but memory still valid)
        if (isTokenValid(companyId)) {
            return tokenStore[companyId].access_token;
        }

        // Check Firestore
        if (await loadFromFirestore(companyId) && isTokenValid(companyId)) {
            return tokenStore[companyId].access_token;
        }

        // Prevent concurrent refresh
        if (refreshPromise) {
            await refreshPromise;
            if (isTokenValid(companyId)) return tokenStore[companyId].access_token;
        }

        // Try refresh_token from localStorage first (avoids SwitchCompany)
        const storedRefresh = getStoredRefreshToken(companyId);
        if (storedRefresh) {
            refreshPromise = (async () => {
                try {
                    return await refreshWithToken(companyId, storedRefresh);
                } finally {
                    refreshPromise = null;
                }
            })();

            const refreshOk = await refreshPromise;
            if (refreshOk && isTokenValid(companyId)) {
                return tokenStore[companyId].access_token;
            }
        }

        // Last resort: direct login with per-company credentials
        refreshPromise = (async () => {
            try {
                await loginWithPassword(companyId);
            } finally {
                refreshPromise = null;
            }
        })();

        await refreshPromise;
        return tokenStore[companyId]?.access_token;
    }

    // =====================================================
    // AUTHENTICATED FETCH - with 401 retry
    // =====================================================

    async function authenticatedFetch(url, options = {}) {
        const authToken = await getToken();
        const response = await fetch(url, {
            ...options,
            headers: {
                ...getHeaders(authToken),
                ...options.headers
            }
        });

        // Handle auth failure: 401 OR 200+HTML (TPOS returns login page instead of 401)
        const needsRetry = response.status === 401 ||
            (response.ok && (response.headers.get('content-type') || '').includes('text/html'));

        if (needsRetry) {
            const companyId = getCompanyId();
            const reason = response.status === 401 ? '401' : '200+HTML';
            console.log(`[TPOS-Search] ${reason} for company ${companyId}, checking for newer token...`);

            // Strategy: check if localStorage has a NEWER token (another tab may have refreshed)
            // Only do full re-login if no newer token is available
            const failedToken = authToken;
            delete tokenStore[companyId]; // Clear in-memory only first

            // Try localStorage — another tab may have refreshed
            let newToken = null;
            if (loadFromStorage(companyId) && isTokenValid(companyId)) {
                const storedToken = tokenStore[companyId].access_token;
                if (storedToken !== failedToken) {
                    console.log(`[TPOS-Search] Found newer token in localStorage, reusing`);
                    newToken = storedToken;
                }
            }

            // No newer token found — clear everything and do full re-login
            if (!newToken) {
                console.log(`[TPOS-Search] No newer token available, forcing re-login...`);
                delete tokenStore[companyId];
                try {
                    localStorage.removeItem(storageKey(companyId));
                } catch (e) { /* ignore */ }
                try {
                    if (window.firebase && window.firebase.firestore) {
                        const docId = companyId === 1 ? 'tpos_token' : `tpos_token_${companyId}`;
                        await firebase.firestore().collection('tokens').doc(docId).delete();
                    }
                } catch (e) { /* ignore */ }
                newToken = await getToken();
            }

            return fetch(url, {
                ...options,
                headers: {
                    ...getHeaders(newToken),
                    ...options.headers
                }
            });
        }

        return response;
    }

    // =====================================================
    // PRODUCT SEARCH
    // =====================================================

    /**
     * Search TPOS for a product by exact code (DefaultCode)
     * Used for duplicate checking: exists on TPOS?
     * @param {string} productCode - e.g. "N133"
     * @returns {Promise<Array>} - matching products (empty = not found)
     */
    async function searchProduct(productCode) {
        if (!productCode || typeof productCode !== 'string') return [];

        try {
            const code = productCode.trim().toUpperCase();
            const url = `${PROXY_URL}/api/odata/Product/OdataService.GetViewV2`
                + `?Active=true`
                + `&DefaultCode=${encodeURIComponent(code)}`
                + `&$top=1`
                + `&$orderby=DateCreated desc`
                + `&$count=true`;

            const response = await authenticatedFetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            return data.value || [];
        } catch (error) {
            console.error('[TPOS-Search] searchProduct error:', error);
            return [];
        }
    }

    /**
     * Get max product code number from TPOS for a category prefix
     * Uses Product entity with OData $filter for prefix search
     * @param {string} category - 'N', 'P', or 'Q'
     * @returns {Promise<number>} - max number found (0 if none)
     */
    async function getMaxProductCode(category) {
        if (!category) return 0;
        const prefix = category.toUpperCase();

        try {
            const url = `${PROXY_URL}/api/odata/Product`
                + `?$filter=Active eq true and startswith(DefaultCode,'${prefix}')`
                + `&$orderby=Id desc`
                + `&$top=100`
                + `&$select=Id,DefaultCode`
                + `&$count=true`;

            console.log(`[TPOS-Search] getMaxProductCode query: ${url}`);
            const response = await authenticatedFetch(url);

            if (!response.ok) {
                console.warn(`[TPOS-Search] getMaxProductCode failed: ${response.status}`);
                return await getMaxProductCodeFallback(prefix);
            }

            const data = await response.json();
            const regex = new RegExp(`^${prefix}(\\d+)`, 'i');
            let maxNum = 0;

            console.log(`[TPOS-Search] getMaxProductCode: ${data['@odata.count'] || data.value?.length || 0} products`);

            if (data.value && data.value.length > 0) {
                for (const product of data.value) {
                    const code = product.DefaultCode || '';
                    const match = code.match(regex);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > maxNum) maxNum = num;
                    }
                }
            }

            console.log(`[TPOS-Search] TPOS max for ${prefix}: ${maxNum}`);
            return maxNum;
        } catch (error) {
            console.error('[TPOS-Search] getMaxProductCode error:', error);
            return 0;
        }
    }

    /**
     * Fallback: probe high numbers to find max code
     * Binary search-like approach using searchProduct
     */
    async function getMaxProductCodeFallback(prefix) {
        console.log(`[TPOS-Search] Using fallback probe for ${prefix}`);
        const regex = new RegExp(`^${prefix}(\\d+)`, 'i');

        try {
            const url = `${PROXY_URL}/api/odata/Product/OdataService.GetViewV2`
                + `?Active=true`
                + `&$top=500`
                + `&$orderby=DateCreated desc`
                + `&$count=true`;

            const response = await authenticatedFetch(url);
            if (!response.ok) return 0;

            const data = await response.json();
            let maxNum = 0;

            if (data.value) {
                for (const product of data.value) {
                    const code = product.DefaultCode || '';
                    const match = code.match(regex);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > maxNum) maxNum = num;
                    }
                }
            }

            console.log(`[TPOS-Search] Fallback max for ${prefix}: ${maxNum} (from ${data.value?.length || 0} recent products)`);
            return maxNum;
        } catch (error) {
            console.error('[TPOS-Search] fallback error:', error);
            return 0;
        }
    }

    // =====================================================
    // INITIALIZE - migrate old storage key
    // =====================================================

    // Migrate old single-key storage to company-1 key
    try {
        const oldData = localStorage.getItem('bearer_token_data');
        if (oldData) {
            const parsed = JSON.parse(oldData);
            if (parsed.access_token && !localStorage.getItem(storageKey(1))) {
                localStorage.setItem(storageKey(1), oldData);
            }
            localStorage.removeItem('bearer_token_data');
        }
    } catch (e) { /* ignore */ }

    loadFromStorage(getCompanyId());
    console.log(`[TPOS-Search] Loaded, company: ${getCompanyId()}, token valid: ${isTokenValid(getCompanyId())}`);

    // Sync token across tabs — when another tab refreshes token, update in-memory cache
    try {
        window.addEventListener('storage', (e) => {
            if (e.key && e.key.startsWith('bearer_token_data_') && e.newValue) {
                const cid = parseInt(e.key.replace('bearer_token_data_', ''));
                if (!isNaN(cid)) {
                    try {
                        const data = JSON.parse(e.newValue);
                        if (data.access_token) {
                            tokenStore[cid] = data;
                            console.log(`[TPOS-Search] Token synced from another tab for company ${cid}`);
                        }
                    } catch (err) { /* ignore */ }
                }
            }
        });
    } catch (e) { /* ignore */ }

    return {
        searchProduct,
        getMaxProductCode,
        getToken,
        authenticatedFetch,
        switchCompanyToken,
        getCredentials,
        isTokenValid: () => isTokenValid(getCompanyId())
    };
})();
