// =====================================================
// BEARER TOKEN MANAGER - Auto Refresh & Storage
//
// SOURCE OF TRUTH: /shared/browser/token-manager.js
// This file is a script-tag compatible version.
// For ES module usage, import from '/shared/browser/token-manager.js'
//
// MIGRATION: Changed from Realtime Database to Firestore
// =====================================================

class TokenManager {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.isInitialized = false;
        this.initPromise = null;
        // Multi-company: use bearer_token_data_{companyId} format
        // Default to Company 1 — old modules always operate on Company 1
        this.companyId = TokenManager.getCompanyId();
        this.storageKey = 'bearer_token_data_' + this.companyId;
        this.PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        this.API_URL = this.PROXY_URL + '/api/token';
        this.SWITCH_COMPANY_URL = this.PROXY_URL + '/api/odata/ApplicationUser/ODataService.SwitchCompany';
        this.credentials = TokenManager.getCredentials(this.companyId);
        this.firestoreRef = null;
        this.firestoreReady = false;

        // Listen for storage changes from other tabs
        window.addEventListener('storage', (e) => {
            if (e.key === this.storageKey) {
                console.log('[TOKEN] Token updated in another tab, reloading...');
                this.loadFromStorage();
            }
        });

        // Initialize immediate check for local token
        this.loadFromStorage();
        
        // Start async init process for Firebase
        this.waitForFirebaseAndInit();
    }

    /**
     * Wait for Firebase to be ready, then initialize
     */
    async waitForFirebaseAndInit() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            // Wait for Firebase SDK to load
            await this.waitForFirebase();

            // Initialize Firestore reference
            this.initFirestore();

            // Initialize token
            await this.init();

            this.isInitialized = true;
            console.log(`[TOKEN] ✅ Token Manager initialized (company ${this.companyId}, key: ${this.storageKey})`);
        })();

        return this.initPromise;
    }

    /**
     * Wait for Firestore SDK to be available
     * @returns {Promise<void>}
     */
    async waitForFirebase() {
        const maxRetries = 50; // 5 seconds max (50 * 100ms)
        let retries = 0;

        while (retries < maxRetries) {
            // Check for Firestore instead of Realtime Database
            if (window.firebase && window.firebase.firestore && typeof window.firebase.firestore === 'function') {
                console.log('[TOKEN] Firestore SDK is ready');
                this.firestoreReady = true;
                return;
            }

            // Wait 100ms before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        console.warn('[TOKEN] Firestore SDK not available after 5 seconds, will use localStorage only');
    }

    /**
     * Get current company ID from ShopConfig (dropdown sidebar)
     */
    static getCompanyId() {
        return window.ShopConfig?.getConfig?.()?.CompanyId || 1;
    }

    /**
     * Get TPOS credentials for a specific company
     */
    static getCredentials(companyId) {
        const CREDENTIALS_BY_COMPANY = {
            1: { grant_type: 'password', username: 'nvktlive1', password: 'Aa@28612345678', client_id: 'tmtWebApp' },
            2: { grant_type: 'password', username: 'nvktshop1', password: 'Aa@28612345678', client_id: 'tmtWebApp' }
        };
        return CREDENTIALS_BY_COMPANY[companyId] || CREDENTIALS_BY_COMPANY[1];
    }

    initFirestore() {
        try {
            if (window.firebase && window.firebase.firestore && this.firestoreReady) {
                // Company 1 uses 'tpos_token' (backward compat), Company 2+ uses 'tpos_token_{id}'
                const docId = this.companyId === 1 ? 'tpos_token' : 'tpos_token_' + this.companyId;
                this.firestoreRef = window.firebase.firestore().collection('tokens').doc(docId);
                console.log(`[TOKEN] ✅ Firestore reference initialized (company ${this.companyId}, doc: ${docId})`);
                return true;
            } else {
                console.warn('[TOKEN] Firestore not available, will use localStorage only');
                return false;
            }
        } catch (error) {
            console.error('[TOKEN] Error initializing Firestore:', error);
            return false;
        }
    }

    /**
     * Retry Firestore initialization (can be called after Firebase loads)
     */
    retryFirebaseInit() {
        if (this.firestoreRef) {
            console.log('[TOKEN] Firestore already initialized');
            return true;
        }
        console.log('[TOKEN] Retrying Firestore initialization...');
        return this.initFirestore();
    }

    async init() {
        console.log('[TOKEN] Initializing Token Manager...');

        // Migrate old 'bearer_token_data' → 'bearer_token_data_1' if needed
        if (this.companyId === 1) {
            try {
                const oldData = localStorage.getItem('bearer_token_data');
                if (oldData && !localStorage.getItem(this.storageKey)) {
                    localStorage.setItem(this.storageKey, oldData);
                    localStorage.removeItem('bearer_token_data');
                    console.log('[TOKEN] Migrated bearer_token_data → ' + this.storageKey);
                }
            } catch (e) { /* ignore */ }
        }

        // Try localStorage FIRST (faster than Firebase)
        this.loadFromStorage();
        if (this.isTokenValid()) {
            console.log('[TOKEN] ✅ Valid token loaded from localStorage');
            return;
        }

        // Fallback to Firestore if localStorage token is invalid
        const firestoreToken = await this.getTokenFromFirestore();
        if (firestoreToken) {
            this.token = firestoreToken.access_token;
            this.tokenExpiry = firestoreToken.expires_at;
            // Sync to localStorage for faster access next time
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(firestoreToken));
                console.log('[TOKEN] ✅ Valid token loaded from Firestore and synced to localStorage');
            } catch (error) {
                console.error('[TOKEN] Error syncing Firestore token to localStorage:', error);
            }
            return;
        }

        // No valid token found - will fetch on first API request
        console.log('[TOKEN] ⚠️ No valid token found, will fetch on first API request');
    }

    async getTokenFromFirestore() {
        if (!this.firestoreRef) {
            return null;
        }

        try {
            const doc = await this.firestoreRef.get();

            if (!doc.exists) {
                console.log('[TOKEN] No token found in Firestore');
                return null;
            }

            const tokenData = doc.data();
            if (!tokenData || !tokenData.access_token) {
                console.log('[TOKEN] Invalid token data in Firestore');
                return null;
            }

            // Check if token is still valid
            const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
            if (Date.now() < (tokenData.expires_at - bufferTime)) {
                console.log('[TOKEN] Valid token found in Firestore');
                return tokenData;
            } else {
                console.log('[TOKEN] Token in Firestore is expired');
                return null;
            }

        } catch (error) {
            console.error('[TOKEN] Error reading token from Firestore:', error);
            return null;
        }
    }

    async saveTokenToFirestore(tokenData) {
        if (!this.firestoreRef) {
            console.warn('[TOKEN] Cannot save to Firestore - reference not available');
            return;
        }

        try {
            await this.firestoreRef.set(tokenData, { merge: true });
            console.log('[TOKEN] Token saved to Firestore');
        } catch (error) {
            console.error('[TOKEN] Error saving token to Firestore:', error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) {
                console.log('[TOKEN] No token found in localStorage');
                return;
            }

            const data = JSON.parse(stored);
            this.token = data.access_token;
            // Ensure expires_at is a number
            this.tokenExpiry = data.expires_at ? Number(data.expires_at) : null;

            // console.log(`[TOKEN] Loaded from storage. Expires: ${new Date(this.tokenExpiry).toLocaleString()}`);
        } catch (error) {
            console.error('[TOKEN] Error loading token:', error);
            this.clearToken();
        }
    }

    async saveToStorage(tokenData) {
        try {
            // Handle both new tokens (with expires_in) and existing tokens (with expires_at)
            let expiresAt;
            if (tokenData.expires_at) {
                // Token from Firebase or localStorage already has expires_at
                expiresAt = tokenData.expires_at;
            } else if (tokenData.expires_in) {
                // New token from API, calculate expires_at
                expiresAt = Date.now() + (tokenData.expires_in * 1000);
            } else {
                console.error('[TOKEN] Invalid token data: missing both expires_at and expires_in');
                return;
            }

            const dataToSave = {
                access_token: tokenData.access_token,
                token_type: tokenData.token_type || 'Bearer',
                expires_in: tokenData.expires_in || Math.floor((expiresAt - Date.now()) / 1000),
                expires_at: expiresAt,
                issued_at: tokenData.issued_at || Date.now()
            };

            // Only include userName and userId if they exist (they won't be in new API tokens)
            if (tokenData.userName !== undefined) {
                dataToSave.userName = tokenData.userName;
            }
            if (tokenData.userId !== undefined) {
                dataToSave.userId = tokenData.userId;
            }

            // Preserve refresh_token (used by tpos-search.js for multi-company token refresh)
            if (tokenData.refresh_token) {
                dataToSave.refresh_token = tokenData.refresh_token;
            } else {
                try {
                    const existing = localStorage.getItem(this.storageKey);
                    if (existing) {
                        const existingData = JSON.parse(existing);
                        if (existingData.refresh_token) {
                            dataToSave.refresh_token = existingData.refresh_token;
                        }
                    }
                } catch (e) { /* ignore */ }
            }

            // Save to localStorage
            localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));

            this.token = tokenData.access_token;
            this.tokenExpiry = expiresAt;

            console.log('[TOKEN] Token saved to localStorage, expires:', new Date(expiresAt).toLocaleString());

            // Also save to Firestore (only for NEW tokens from API)
            // New tokens have expires_in but no expires_at
            if (tokenData.expires_in && !tokenData.issued_at) {
                await this.saveTokenToFirestore(dataToSave);
            }

        } catch (error) {
            console.error('[TOKEN] Error saving token:', error);
        }
    }

    isTokenValid() {
        if (!this.token) {
            // Try reloading from storage one last time before declaring invalid
            // This handles cases where token exists in storage but wasn't loaded into memory yet
            this.loadFromStorage();
            
            if (!this.token) {
                console.log('[TOKEN] Validation failed: No token in memory or storage');
                return false;
            }
        }

        if (!this.tokenExpiry) {
            console.log('[TOKEN] Validation failed: No expiry date');
            return false;
        }

        // Check if token expires in less than 5 minutes (buffer time)
        const bufferTime = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();
        const isValid = now < (this.tokenExpiry - bufferTime);
        
        if (!isValid) {
             console.log(`[TOKEN] Validation failed: Expired. Now: ${now}, Exp: ${this.tokenExpiry}, Remaining: ${(this.tokenExpiry - now)/1000}s`);
        }

        return isValid;
    }

    async clearToken() {
        this.token = null;
        this.tokenExpiry = null;
        localStorage.removeItem(this.storageKey);

        // Also clear from Firestore
        if (this.firestoreRef) {
            try {
                await this.firestoreRef.delete();
                console.log('[TOKEN] Token cleared from localStorage and Firestore');
            } catch (error) {
                console.error('[TOKEN] Error clearing token from Firestore:', error);
            }
        } else {
            console.log('[TOKEN] Token cleared from localStorage');
        }
    }

    /**
     * Invalidate access_token but preserve refresh_token in localStorage
     */
    invalidateAccessToken() {
        this.token = null;
        this.tokenExpiry = null;
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.refresh_token) {
                    localStorage.setItem(this.storageKey, JSON.stringify({
                        refresh_token: data.refresh_token, expires_at: 0
                    }));
                    return;
                }
            }
            localStorage.removeItem(this.storageKey);
        } catch (e) {
            localStorage.removeItem(this.storageKey);
        }
    }

    /**
     * Read refresh_token from localStorage (even if access_token expired)
     */
    getStoredRefreshToken() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.refresh_token) return data.refresh_token;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    /**
     * Try refreshing token using refresh_token (faster than password login)
     */
    async refreshWithToken(refreshToken) {
        try {
            console.log(`[TOKEN] Refreshing token for company ${this.companyId} using refresh_token...`);
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=tmtWebApp`
            });
            if (!response.ok) {
                console.warn(`[TOKEN] Refresh token failed: ${response.status}`);
                return false;
            }
            const data = await response.json();
            if (!data.access_token) return false;
            await this.saveToStorage(data);
            console.log(`[TOKEN] Token refreshed OK for company ${this.companyId}`);
            return true;
        } catch (e) {
            console.warn('[TOKEN] Refresh token error:', e);
            return false;
        }
    }

    /**
     * Password login → gets token directly for this company
     */
    async passwordLogin() {
        console.log(`[TOKEN] Password login with ${this.credentials.username} for company ${this.companyId}...`);
        const formData = new URLSearchParams();
        formData.append('grant_type', this.credentials.grant_type);
        formData.append('username', this.credentials.username);
        formData.append('password', this.credentials.password);
        formData.append('client_id', this.credentials.client_id);

        const response = await fetch(this.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });

        if (!response.ok) throw new Error(`Password login failed: ${response.status}`);
        const data = await response.json();
        if (!data.access_token) throw new Error('Invalid token response');

        const expiresAt = Date.now() + (data.expires_in * 1000);
        const tokenData = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || null,
            token_type: 'Bearer',
            expires_in: data.expires_in,
            expires_at: expiresAt,
            issued_at: Date.now()
        };
        try { localStorage.setItem(this.storageKey, JSON.stringify(tokenData)); } catch (e) { /* ignore */ }

        this.token = data.access_token;
        this.tokenExpiry = expiresAt;

        console.log(`[TOKEN] Password login OK, company ${this.companyId} token saved`);
        return { data, tokenData };
    }

    /**
     * SwitchCompany + refresh_token → get token for Company 2+
     */
    async switchCompanyToken(loginResult) {
        console.log(`[TOKEN] Switching to company ${this.companyId}...`);
        const { data: loginData, c1Data } = loginResult;
        const accessToken = loginData.access_token;
        const refreshToken = loginData.refresh_token;

        if (!refreshToken) throw new Error('No refresh_token for SwitchCompany');

        // Step 1: SwitchCompany
        const tposHeaders = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json;charset=UTF-8',
            'Accept': 'application/json',
            'feature-version': '2',
            'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '6.2.6.1'
        };

        const switchResp = await fetch(this.SWITCH_COMPANY_URL, {
            method: 'POST',
            headers: tposHeaders,
            body: JSON.stringify({ companyId: this.companyId })
        });

        if (!switchResp.ok) throw new Error(`SwitchCompany failed: ${switchResp.status}`);
        console.log(`[TOKEN] SwitchCompany(${this.companyId}) OK`);

        // Step 2: Refresh token → new token for target company
        const refreshResp = await fetch(this.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${accessToken}`
            },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=tmtWebApp`
        });

        if (!refreshResp.ok) throw new Error(`Token refresh after SwitchCompany failed: ${refreshResp.status}`);

        const newTokenData = await refreshResp.json();
        await this.saveToStorage(newTokenData);
        console.log(`[TOKEN] Company ${this.companyId} token saved`);
    }

    async fetchNewToken() {
        if (this.isRefreshing) {
            console.log('[TOKEN] Token refresh already in progress, waiting...');
            return this.waitForRefresh();
        }

        this.isRefreshing = true;
        let notificationId = null;

        try {
            if (window.notificationManager) {
                notificationId = window.notificationManager.show(
                    'Đang lấy token xác thực...', 'info', 0,
                    { showOverlay: true, persistent: true, icon: 'key', title: 'Xác thực' }
                );
            }

            // Step 1: Try refresh_token first (faster, avoids password login)
            const storedRefresh = this.getStoredRefreshToken();
            if (storedRefresh) {
                const ok = await this.refreshWithToken(storedRefresh);
                if (ok && this.isTokenValid()) {
                    if (window.notificationManager && notificationId) {
                        window.notificationManager.remove(notificationId);
                    }
                    return this.token;
                }
            }

            // Step 2: Direct password login with per-company credentials
            await this.passwordLogin();

            if (window.notificationManager && notificationId) {
                window.notificationManager.remove(notificationId);
                window.notificationManager.success('Token đã được cập nhật thành công', 2000);
            }

            console.log(`[TOKEN] Token obtained for company ${this.companyId}`);
            return this.token;

        } catch (error) {
            console.error('[TOKEN] Error fetching token:', error);
            if (window.notificationManager) {
                if (notificationId) window.notificationManager.remove(notificationId);
                window.notificationManager.error(`Không thể lấy token: ${error.message}`, 4000, 'Lỗi xác thực');
            }
            await this.clearToken();
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    async waitForRefresh() {
        const maxWait = 10000;
        const startTime = Date.now();
        while (this.isRefreshing && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this.isTokenValid()) return this.token;
        throw new Error('Token refresh timeout');
    }

    async getToken() {
        if (!this.isInitialized && this.initPromise) {
            console.log('[TOKEN] Waiting for initialization to complete...');
            await this.initPromise;
        }
        if (this.isTokenValid()) return this.token;
        console.log('[TOKEN] Token invalid or expired, fetching new token...');
        return await this.fetchNewToken();
    }

    async getAuthHeader() {
        const token = await this.getToken();
        return { 'Authorization': `Bearer ${token}` };
    }

    async authenticatedFetch(url, options = {}) {
        try {
            const headers = await this.getAuthHeader();
            const response = await fetch(url, {
                ...options,
                headers: { ...headers, ...options.headers }
            });

            if (response.status === 401) {
                console.log(`[TOKEN] 401 for company ${this.companyId}, invalidating and retrying...`);
                this.invalidateAccessToken();
                const newHeaders = await this.getAuthHeader();
                return await fetch(url, {
                    ...options,
                    headers: { ...newHeaders, ...options.headers }
                });
            }

            return response;
        } catch (error) {
            console.error('[TOKEN] Error in authenticated fetch:', error);
            throw error;
        }
    }

    // Get token info for display
    getTokenInfo() {
        if (!this.token || !this.tokenExpiry) {
            return {
                hasToken: false,
                message: 'No token available'
            };
        }

        const now = Date.now();
        const timeRemaining = this.tokenExpiry - now;
        const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

        return {
            hasToken: true,
            isValid: this.isTokenValid(),
            expiresAt: new Date(this.tokenExpiry).toLocaleString('vi-VN'),
            timeRemaining: `${hoursRemaining}h ${minutesRemaining}m`,
            token: this.token.substring(0, 20) + '...' // Show only first 20 chars
        };
    }

    // Manual refresh method
    async refresh() {
        console.log('[TOKEN] Manual token refresh requested');
        await this.clearToken();
        return await this.fetchNewToken();
    }
}

// =====================================================
// INITIALIZE TOKEN MANAGER
// =====================================================

// Initialize token manager globally
const tokenManager = new TokenManager();
window.tokenManager = tokenManager;

console.log('[TOKEN] Token Manager initialized');

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TokenManager;
}