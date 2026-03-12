/**
 * TPOS Token Manager
 * Auto refresh & storage with localStorage + Firestore backup
 *
 * @module shared/browser/token-manager
 *
 * MIGRATION: Changed from Realtime Database to Firestore
 * - Uses Firestore collection 'tokens' instead of RTDB path
 * - Better query support and offline capabilities
 */

import { API_ENDPOINTS } from '../universal/api-endpoints.js';

/**
 * TPOS Bearer Token Manager
 * Handles token lifecycle: fetch, cache, refresh, sync across tabs
 */
export class TokenManager {
    /**
     * @param {object} options - Configuration options
     * @param {string} options.apiUrl - Token API URL (default: worker proxy)
     * @param {string} options.storageKey - localStorage key
     * @param {string} options.firestoreCollection - Firestore collection name
     * @param {string} options.firestoreDocId - Firestore document ID
     * @param {object} options.credentials - TPOS credentials
     */
    constructor(options = {}) {
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.isInitialized = false;
        this.initPromise = null;

        // Multi-company support
        this.companyId = options.companyId || TokenManager.getCompanyId();

        // Configuration - use company-specific keys
        this.storageKey = options.storageKey || ('bearer_token_data_' + this.companyId);
        this.PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        this.API_URL = options.apiUrl || API_ENDPOINTS.WORKER.TOKEN;
        this.SWITCH_COMPANY_URL = this.PROXY_URL + '/api/odata/ApplicationUser/ODataService.SwitchCompany';

        // Firestore config - Company 1 uses 'tpos_token' (backward compat)
        this.firestoreCollection = options.firestoreCollection || 'tokens';
        this.firestoreDocId = options.firestoreDocId
            || (this.companyId === 1 ? 'tpos_token' : 'tpos_token_' + this.companyId);

        this.credentials = options.credentials || TokenManager.getCredentials(this.companyId);

        this.firestoreRef = null;
        this.firestoreReady = false;

        // Listen for storage changes from other tabs
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (e) => {
                if (e.key === this.storageKey) {
                    console.log('[TOKEN] Token updated in another tab, reloading...');
                    this.loadFromStorage();
                }
            });
        }

        // Initialize
        this.loadFromStorage();
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
            await this.waitForFirebase();
            this.initFirestore();
            await this.init();
            this.isInitialized = true;
            console.log(`[TOKEN] Token Manager initialized (company ${this.companyId}, key: ${this.storageKey})`);
        })();

        return this.initPromise;
    }

    /**
     * Wait for Firebase SDK to be available
     */
    async waitForFirebase() {
        if (typeof window === 'undefined') return;

        const maxRetries = 50; // 5 seconds max
        let retries = 0;

        while (retries < maxRetries) {
            // Check for Firestore instead of Realtime Database
            if (window.firebase?.firestore && typeof window.firebase.firestore === 'function') {
                console.log('[TOKEN] Firestore SDK is ready');
                this.firestoreReady = true;
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        console.warn('[TOKEN] Firestore SDK not available, using localStorage only');
    }

    /**
     * Initialize Firestore reference
     */
    initFirestore() {
        try {
            if (typeof window !== 'undefined' && window.firebase?.firestore && this.firestoreReady) {
                this.firestoreRef = window.firebase.firestore()
                    .collection(this.firestoreCollection)
                    .doc(this.firestoreDocId);
                console.log('[TOKEN] Firestore reference initialized');
                return true;
            }
            return false;
        } catch (error) {
            console.error('[TOKEN] Error initializing Firestore:', error);
            return false;
        }
    }

    /**
     * Get current company ID from ShopConfig (dropdown sidebar)
     */
    static getCompanyId() {
        return window.ShopConfig?.getConfig?.()?.CompanyId || 1;
    }

    /**
     * Get TPOS credentials for a specific company
     * Company 1 (NJD LIVE): nvktlive1
     * Company 2 (NJD SHOP): nvktshop1
     */
    static getCredentials(companyId) {
        const CREDENTIALS_BY_COMPANY = {
            1: { grant_type: 'password', username: 'nvktlive1', password: 'Aa@28612345678', client_id: 'tmtWebApp' },
            2: { grant_type: 'password', username: 'nvktshop1', password: 'Aa@28612345678', client_id: 'tmtWebApp' }
        };
        return CREDENTIALS_BY_COMPANY[companyId] || CREDENTIALS_BY_COMPANY[1];
    }

    /**
     * Initialize token - try localStorage first, then Firebase
     */
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

        // Try localStorage first
        this.loadFromStorage();
        if (this.isTokenValid()) {
            console.log('[TOKEN] Valid token loaded from localStorage');
            return;
        }

        // Fallback to Firestore
        const firebaseToken = await this.getTokenFromFirestore();
        if (firebaseToken) {
            this.token = firebaseToken.access_token;
            this.tokenExpiry = firebaseToken.expires_at;
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(firebaseToken));
                console.log('[TOKEN] Valid token loaded from Firestore');
            } catch (error) {
                console.error('[TOKEN] Error syncing Firestore token:', error);
            }
            return;
        }

        console.log('[TOKEN] No valid token found, will fetch on first request');
    }

    /**
     * Get token from Firestore
     */
    async getTokenFromFirestore() {
        if (!this.firestoreRef) return null;

        try {
            const doc = await this.firestoreRef.get();

            if (!doc.exists) return null;

            const tokenData = doc.data();
            if (!tokenData?.access_token) return null;

            const bufferTime = 5 * 60 * 1000; // 5 minutes
            if (Date.now() < (tokenData.expires_at - bufferTime)) {
                return tokenData;
            }
            return null;
        } catch (error) {
            console.error('[TOKEN] Error reading from Firestore:', error);
            return null;
        }
    }

    /**
     * Save token to Firestore
     */
    async saveTokenToFirestore(tokenData) {
        if (!this.firestoreRef) return;

        try {
            await this.firestoreRef.set(tokenData, { merge: true });
            console.log('[TOKEN] Token saved to Firestore');
        } catch (error) {
            console.error('[TOKEN] Error saving to Firestore:', error);
        }
    }

    /**
     * Load token from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const data = JSON.parse(stored);
            this.token = data.access_token;
            this.tokenExpiry = data.expires_at ? Number(data.expires_at) : null;
        } catch (error) {
            console.error('[TOKEN] Error loading token:', error);
            this.clearToken();
        }
    }

    /**
     * Save token to storage
     */
    async saveToStorage(tokenData) {
        try {
            let expiresAt;
            if (tokenData.expires_at) {
                expiresAt = tokenData.expires_at;
            } else if (tokenData.expires_in) {
                expiresAt = Date.now() + (tokenData.expires_in * 1000);
            } else {
                console.error('[TOKEN] Invalid token data');
                return;
            }

            const dataToSave = {
                access_token: tokenData.access_token,
                token_type: tokenData.token_type || 'Bearer',
                expires_in: tokenData.expires_in || Math.floor((expiresAt - Date.now()) / 1000),
                expires_at: expiresAt,
                issued_at: tokenData.issued_at || Date.now()
            };

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

            localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));
            this.token = tokenData.access_token;
            this.tokenExpiry = expiresAt;

            console.log('[TOKEN] Token saved, expires:', new Date(expiresAt).toLocaleString());

            // Save to Firestore for new tokens
            if (tokenData.expires_in && !tokenData.issued_at) {
                await this.saveTokenToFirestore(dataToSave);
            }
        } catch (error) {
            console.error('[TOKEN] Error saving token:', error);
        }
    }

    /**
     * Check if token is valid
     */
    isTokenValid() {
        if (!this.token) {
            this.loadFromStorage();
            if (!this.token) return false;
        }
        if (!this.tokenExpiry) return false;

        const bufferTime = 5 * 60 * 1000; // 5 minutes
        return Date.now() < (this.tokenExpiry - bufferTime);
    }

    /**
     * Clear token from all storage
     */
    async clearToken() {
        this.token = null;
        this.tokenExpiry = null;
        localStorage.removeItem(this.storageKey);

        if (this.firestoreRef) {
            try {
                await this.firestoreRef.delete();
            } catch (error) {
                console.error('[TOKEN] Error clearing Firestore:', error);
            }
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
     * Each company has its own TPOS account, no SwitchCompany needed
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

        // Save token for this company
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
        const { data: loginData } = loginResult;
        const accessToken = loginData.access_token;
        const refreshToken = loginData.refresh_token;

        if (!refreshToken) throw new Error('No refresh_token for SwitchCompany');

        // Step 1: SwitchCompany
        const tposHeaders = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json;charset=UTF-8',
            'Accept': 'application/json',
            'feature-version': '2',
            'tposappversion': '6.2.6.1'
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

    /**
     * Fetch new token from API
     */
    async fetchNewToken() {
        if (this.isRefreshing) {
            return this.waitForRefresh();
        }

        this.isRefreshing = true;

        try {
            // Step 1: Try refresh_token first (faster, avoids password login)
            const storedRefresh = this.getStoredRefreshToken();
            if (storedRefresh) {
                const ok = await this.refreshWithToken(storedRefresh);
                if (ok && this.isTokenValid()) return this.token;
            }

            // Step 2: Direct password login with per-company credentials
            await this.passwordLogin();

            console.log(`[TOKEN] Token obtained for company ${this.companyId}`);
            return this.token;

        } catch (error) {
            console.error('[TOKEN] Error fetching token:', error);
            await this.clearToken();
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Wait for ongoing refresh
     */
    async waitForRefresh() {
        const maxWait = 10000;
        const startTime = Date.now();

        while (this.isRefreshing && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.isTokenValid()) {
            return this.token;
        }

        throw new Error('Token refresh timeout');
    }

    /**
     * Get valid token (fetch if needed)
     */
    async getToken() {
        if (!this.isInitialized && this.initPromise) {
            await this.initPromise;
        }

        if (this.isTokenValid()) {
            return this.token;
        }

        return await this.fetchNewToken();
    }

    /**
     * Get Authorization header
     */
    async getAuthHeader() {
        const token = await this.getToken();
        return { 'Authorization': `Bearer ${token}` };
    }

    /**
     * Make authenticated fetch request
     */
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

    /**
     * Get token info for display
     */
    getTokenInfo() {
        if (!this.token || !this.tokenExpiry) {
            return { hasToken: false, message: 'No token available' };
        }

        const timeRemaining = this.tokenExpiry - Date.now();
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

        return {
            hasToken: true,
            isValid: this.isTokenValid(),
            expiresAt: new Date(this.tokenExpiry).toLocaleString('vi-VN'),
            timeRemaining: `${hours}h ${minutes}m`,
            token: this.token.substring(0, 20) + '...'
        };
    }

    /**
     * Manual refresh
     */
    async refresh() {
        console.log('[TOKEN] Manual refresh requested');
        await this.clearToken();
        return await this.fetchNewToken();
    }
}

// Default export
export default TokenManager;
