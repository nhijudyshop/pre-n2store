/**
 * Pancake JWT Token Manager
 * Multi-account support with localStorage + Firestore backup
 *
 * @module shared/browser/pancake-token-manager
 *
 * MIGRATION: Changed from Realtime Database to Firestore
 * - Uses Firestore collection 'pancake_tokens' instead of RTDB
 */

/**
 * Pancake JWT Token Manager
 * Priority: memory → localStorage → Firestore → cookie
 */
export class PancakeTokenManager {
    /**
     * @param {object} options - Configuration options
     * @param {string} options.firestoreCollection - Firestore collection name
     */
    constructor(options = {}) {
        this.firestoreRef = null;
        this.accountsRef = null;
        this.pageTokensRef = null;

        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.activeAccountId = null;
        this.accounts = {};
        this.pageAccessTokens = {};

        this.firestoreCollection = options.firestoreCollection || 'pancake_tokens';

        // localStorage keys
        this.LOCAL_STORAGE_KEYS = {
            JWT_TOKEN: 'pancake_jwt_token',
            JWT_TOKEN_EXPIRY: 'pancake_jwt_token_expiry',
            JWT_ACCOUNT_ID: 'pancake_active_account_id',
            PAGE_ACCESS_TOKENS: 'pancake_page_access_tokens'
        };
    }

    // =====================================================
    // LOCAL STORAGE METHODS
    // =====================================================

    /**
     * Save JWT token to localStorage
     * @param {string} token - JWT token
     * @param {number} expiry - Token expiry timestamp (seconds)
     */
    saveTokenToLocalStorage(token, expiry) {
        try {
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN, token);
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN_EXPIRY, expiry.toString());
            console.log('[PANCAKE-TOKEN] JWT saved to localStorage');
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving to localStorage:', error);
        }
    }

    /**
     * Get JWT token from localStorage
     * @returns {object|null} { token, expiry } or null
     */
    getTokenFromLocalStorage() {
        try {
            const token = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN);
            const expiry = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN_EXPIRY);

            if (!token || !expiry) return null;

            const exp = parseInt(expiry, 10);
            if (this.isTokenExpired(exp)) {
                this.clearTokenFromLocalStorage();
                return null;
            }

            return { token, expiry: exp };
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting from localStorage:', error);
            return null;
        }
    }

    /**
     * Clear JWT token from localStorage
     */
    clearTokenFromLocalStorage() {
        try {
            localStorage.removeItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN);
            localStorage.removeItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN_EXPIRY);
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing localStorage:', error);
        }
    }

    /**
     * Save page access tokens to localStorage
     * @param {object} tokens - Page tokens object
     */
    savePageAccessTokensToLocalStorage(tokens = null) {
        try {
            const data = tokens || this.pageAccessTokens;
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS, JSON.stringify(data));
            console.log('[PANCAKE-TOKEN] Page tokens saved:', Object.keys(data).length);
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving page tokens:', error);
        }
    }

    /**
     * Get page access tokens from localStorage
     * @returns {object}
     */
    getPageAccessTokensFromLocalStorage() {
        try {
            const data = localStorage.getItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting page tokens:', error);
            return {};
        }
    }

    /**
     * Clear page access tokens from localStorage
     */
    clearPageAccessTokensFromLocalStorage() {
        try {
            localStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing page tokens:', error);
        }
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize manager
     */
    async initialize() {
        try {
            // Load from localStorage first (instant)
            this.loadFromLocalStorage();

            if (typeof window === 'undefined' || !window.firebase?.firestore) {
                console.warn('[PANCAKE-TOKEN] Firestore not available');
                return this.currentToken !== null;
            }

            // Initialize Firestore references
            const db = window.firebase.firestore();
            this.firestoreRef = db.collection(this.firestoreCollection);
            this.accountsRef = this.firestoreRef.doc('accounts');
            this.pageTokensRef = this.firestoreRef.doc('page_access_tokens');

            // Load from Firestore (may update localStorage)
            await this.loadAccounts();
            await this.loadPageAccessTokens();

            console.log('[PANCAKE-TOKEN] Initialized (Firestore)');
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Initialization error:', error);
            return this.currentToken !== null;
        }
    }

    /**
     * Load from localStorage
     */
    loadFromLocalStorage() {
        const localToken = this.getTokenFromLocalStorage();
        if (localToken) {
            this.currentToken = localToken.token;
            this.currentTokenExpiry = localToken.expiry;
        }

        const localPageTokens = this.getPageAccessTokensFromLocalStorage();
        if (Object.keys(localPageTokens).length > 0) {
            this.pageAccessTokens = localPageTokens;
        }

        this.activeAccountId = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID);
    }

    /**
     * Load accounts from Firestore
     */
    async loadAccounts() {
        if (!this.accountsRef) return;

        try {
            const doc = await this.accountsRef.get();
            this.accounts = doc.exists ? (doc.data()?.data || {}) : {};

            // Load active account
            const configDoc = await this.firestoreRef.doc('config').get();
            const firebaseActiveId = configDoc.exists ? configDoc.data()?.activeAccountId : null;

            if (firebaseActiveId && this.accounts[firebaseActiveId]) {
                this.activeAccountId = firebaseActiveId;
                const account = this.accounts[firebaseActiveId];

                if (account.jwt_token && !this.isTokenExpired(account.jwt_expiry)) {
                    this.currentToken = account.jwt_token;
                    this.currentTokenExpiry = account.jwt_expiry;

                    // Sync to localStorage
                    this.saveTokenToLocalStorage(account.jwt_token, account.jwt_expiry);
                    localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID, firebaseActiveId);
                }
            }

            console.log('[PANCAKE-TOKEN] Loaded', Object.keys(this.accounts).length, 'accounts');
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error loading accounts:', error);
        }
    }

    /**
     * Load page access tokens from Firestore
     */
    async loadPageAccessTokens() {
        if (!this.pageTokensRef) return;

        try {
            const doc = await this.pageTokensRef.get();
            const firestoreTokens = doc.exists ? (doc.data()?.data || {}) : {};

            // Merge with localStorage
            this.pageAccessTokens = { ...this.pageAccessTokens, ...firestoreTokens };
            this.savePageAccessTokensToLocalStorage();

            console.log('[PANCAKE-TOKEN] Loaded', Object.keys(this.pageAccessTokens).length, 'page tokens');
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error loading page tokens:', error);
        }
    }

    // =====================================================
    // TOKEN METHODS
    // =====================================================

    /**
     * Check if token is expired
     * @param {number} expiry - Expiry timestamp (seconds)
     * @returns {boolean}
     */
    isTokenExpired(expiry) {
        if (!expiry) return true;
        const bufferTime = 5 * 60; // 5 minutes buffer
        return Math.floor(Date.now() / 1000) >= (expiry - bufferTime);
    }

    /**
     * Get current JWT token
     * @returns {string|null}
     */
    getToken() {
        if (this.currentToken && !this.isTokenExpired(this.currentTokenExpiry)) {
            return this.currentToken;
        }

        // Try localStorage
        const localToken = this.getTokenFromLocalStorage();
        if (localToken) {
            this.currentToken = localToken.token;
            this.currentTokenExpiry = localToken.expiry;
            return this.currentToken;
        }

        // Try cookie as fallback
        return this.getTokenFromCookie();
    }

    /**
     * Get JWT token from cookie
     * @returns {string|null}
     */
    getTokenFromCookie() {
        try {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'jwt') {
                    return decodeURIComponent(value);
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Set JWT token
     * @param {string} token - JWT token
     * @param {number} expiry - Expiry timestamp (seconds)
     * @param {string} accountId - Account ID (optional)
     */
    async setToken(token, expiry, accountId = null) {
        this.currentToken = token;
        this.currentTokenExpiry = expiry;

        // Save to localStorage
        this.saveTokenToLocalStorage(token, expiry);

        // Save to Firestore
        if (accountId && this.accountsRef) {
            try {
                // Update account in Firestore
                const currentData = (await this.accountsRef.get()).data()?.data || {};
                currentData[accountId] = {
                    ...(currentData[accountId] || {}),
                    jwt_token: token,
                    jwt_expiry: expiry,
                    updated_at: Date.now()
                };
                await this.accountsRef.set({ data: currentData }, { merge: true });
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error saving to Firestore:', error);
            }
        }
    }

    /**
     * Get page access token
     * @param {string} pageId - Page ID
     * @returns {string|null}
     */
    getPageAccessToken(pageId) {
        const tokenData = this.pageAccessTokens[pageId];
        if (tokenData?.token) {
            return tokenData.token;
        }
        return null;
    }

    /**
     * Set page access token
     * @param {string} pageId - Page ID
     * @param {string} token - Page access token
     * @param {string} pageName - Page name (optional)
     */
    async setPageAccessToken(pageId, token, pageName = '') {
        const tokenData = {
            token,
            pageId,
            pageName,
            savedAt: Date.now()
        };

        this.pageAccessTokens[pageId] = tokenData;
        this.savePageAccessTokensToLocalStorage();

        // Save to Firestore
        if (this.pageTokensRef) {
            try {
                const currentData = (await this.pageTokensRef.get()).data()?.data || {};
                currentData[pageId] = tokenData;
                await this.pageTokensRef.set({ data: currentData }, { merge: true });
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error saving page token:', error);
            }
        }
    }

    /**
     * Get all page access tokens
     * @returns {object}
     */
    getAllPageAccessTokens() {
        return { ...this.pageAccessTokens };
    }

    /**
     * Clear all tokens
     */
    async clearAllTokens() {
        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.pageAccessTokens = {};

        this.clearTokenFromLocalStorage();
        this.clearPageAccessTokensFromLocalStorage();

        // Clear Firestore documents
        if (this.firestoreRef) {
            try {
                const batch = window.firebase.firestore().batch();
                batch.delete(this.accountsRef);
                batch.delete(this.pageTokensRef);
                batch.delete(this.firestoreRef.doc('config'));
                await batch.commit();
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error clearing Firestore:', error);
            }
        }
    }

    /**
     * Get token info for display
     * @returns {object}
     */
    getTokenInfo() {
        const hasToken = !!this.currentToken;
        const isValid = hasToken && !this.isTokenExpired(this.currentTokenExpiry);

        if (!hasToken) {
            return { hasToken: false, message: 'No token' };
        }

        const expiresAt = this.currentTokenExpiry
            ? new Date(this.currentTokenExpiry * 1000).toLocaleString('vi-VN')
            : 'Unknown';

        return {
            hasToken: true,
            isValid,
            expiresAt,
            accountId: this.activeAccountId,
            pageTokenCount: Object.keys(this.pageAccessTokens).length
        };
    }
}

// Default export
export default PancakeTokenManager;
