// =====================================================
// BILL TOKEN MANAGER - Separate TPOS Auth for Bill Creation
//
// Quản lý TPOS credentials riêng cho việc tạo bill (PBH)
// - Lưu vào Firestore: users/{webUserId}.billCredentials
// - Cache trong localStorage: bill_tpos_credentials
// =====================================================

class BillTokenManager {
    constructor() {
        // Multi-company: use per-company storage keys
        this.companyId = BillTokenManager.getCompanyId();
        this.storageKey = 'bill_tpos_credentials_' + this.companyId;
        this.tokenStorageKey = 'bill_tpos_token_' + this.companyId;
        this.API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/token';

        this.credentials = null; // { username, password } or { bearerToken }
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;

        // Migrate old single-key data to company 1 keys
        this._migrateOldStorage();

        // Load from localStorage immediately
        this.loadFromStorage();

        // Listen for company changes
        window.addEventListener('shopChanged', (e) => {
            const newCompanyId = e.detail?.config?.CompanyId || 1;
            if (newCompanyId !== this.companyId) {
                console.log(`[BILL-TOKEN] Company changed: ${this.companyId} → ${newCompanyId}`);
                this.companyId = newCompanyId;
                this.storageKey = 'bill_tpos_credentials_' + this.companyId;
                this.tokenStorageKey = 'bill_tpos_token_' + this.companyId;
                // Reset state and reload for new company
                this.token = null;
                this.tokenExpiry = null;
                this.credentials = null;
                this.loadFromStorage();
                // Re-init from Firestore for new company
                this.init();
            }
        });
    }

    /**
     * Get current company ID from ShopConfig
     */
    static getCompanyId() {
        return window.ShopConfig?.getConfig?.()?.CompanyId || 1;
    }

    /**
     * Migrate old single-key storage to company 1 keys
     */
    _migrateOldStorage() {
        try {
            const oldCreds = localStorage.getItem('bill_tpos_credentials');
            if (oldCreds && !localStorage.getItem('bill_tpos_credentials_1')) {
                localStorage.setItem('bill_tpos_credentials_1', oldCreds);
                localStorage.removeItem('bill_tpos_credentials');
                console.log('[BILL-TOKEN] Migrated bill_tpos_credentials → bill_tpos_credentials_1');
            }
            const oldToken = localStorage.getItem('bill_tpos_token');
            if (oldToken && !localStorage.getItem('bill_tpos_token_1')) {
                localStorage.setItem('bill_tpos_token_1', oldToken);
                localStorage.removeItem('bill_tpos_token');
                console.log('[BILL-TOKEN] Migrated bill_tpos_token → bill_tpos_token_1');
            }
        } catch (e) { /* ignore */ }
    }

    // =====================================================
    // STORAGE METHODS
    // =====================================================

    /**
     * Load credentials from localStorage
     */
    loadFromStorage() {
        try {
            // Load credentials
            const credStr = localStorage.getItem(this.storageKey);
            if (credStr) {
                this.credentials = JSON.parse(credStr);
                console.log('[BILL-TOKEN] Loaded credentials from localStorage');
            }

            // Load cached token
            const tokenStr = localStorage.getItem(this.tokenStorageKey);
            if (tokenStr) {
                const tokenData = JSON.parse(tokenStr);
                this.token = tokenData.access_token;
                this.tokenExpiry = tokenData.expires_at;

                if (this.isTokenValid()) {
                    console.log('[BILL-TOKEN] Valid token loaded from localStorage');
                }
            }
        } catch (error) {
            console.error('[BILL-TOKEN] Error loading from storage:', error);
        }
    }

    /**
     * Save credentials to localStorage
     */
    saveToStorage() {
        try {
            if (this.credentials) {
                localStorage.setItem(this.storageKey, JSON.stringify(this.credentials));
            }
        } catch (error) {
            console.error('[BILL-TOKEN] Error saving to storage:', error);
        }
    }

    /**
     * Save token to localStorage
     */
    saveTokenToStorage(tokenData) {
        try {
            localStorage.setItem(this.tokenStorageKey, JSON.stringify(tokenData));
        } catch (error) {
            console.error('[BILL-TOKEN] Error saving token to storage:', error);
        }
    }

    /**
     * Clear all stored data
     */
    clearStorage() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.tokenStorageKey);
        this.credentials = null;
        this.token = null;
        this.tokenExpiry = null;
    }

    // =====================================================
    // FIREBASE METHODS
    // =====================================================

    /**
     * Get current web user ID from authManager
     */
    getWebUserId() {
        try {
            const authData = window.authManager?.getAuthData?.() ||
                             window.authManager?.getAuthState?.();
            return authData?.username || authData?.userId || authData?.user?.username || null;
        } catch (error) {
            console.error('[BILL-TOKEN] Error getting web user ID:', error);
            return null;
        }
    }

    /**
     * Get Firestore reference for current user's billCredentials
     */
    getFirestoreRef() {
        const userId = this.getWebUserId();
        if (!userId) {
            console.warn('[BILL-TOKEN] No web user ID, cannot get Firestore ref');
            return null;
        }

        if (!window.firebase?.firestore) {
            console.warn('[BILL-TOKEN] Firestore not available');
            return null;
        }

        return window.firebase.firestore().collection('users').doc(userId);
    }

    /**
     * Get Firestore field name for billCredentials (per-company)
     * Company 1: 'billCredentials' (backward compat), Company 2+: 'billCredentials_2'
     */
    getBillCredentialsField() {
        return this.companyId === 1 ? 'billCredentials' : 'billCredentials_' + this.companyId;
    }

    /**
     * Save credentials to Firestore
     * @param {boolean} retry - Whether to retry if auth not ready
     * @param {string} refreshToken - Optional refresh_token to save
     */
    async saveToFirestore(retry = true, refreshToken = null) {
        if (!this.credentials) {
            console.warn('[BILL-TOKEN] No credentials to save');
            return false;
        }

        const ref = this.getFirestoreRef();
        if (!ref) {
            console.warn('[BILL-TOKEN] Cannot get Firestore ref (auth not ready?)');
            // Schedule retry if auth not ready
            if (retry && !this._pendingSave) {
                this._pendingSave = true;
                this._pendingRefreshToken = refreshToken; // Store for retry
                console.log('[BILL-TOKEN] Will retry save when auth is ready...');
                setTimeout(() => {
                    this._pendingSave = false;
                    this.saveToFirestore(false, this._pendingRefreshToken);
                }, 3000);
            }
            return false;
        }

        try {
            // Include refresh_token if available (from param or localStorage)
            const cachedToken = this.getCachedTokenData();
            const tokenToSave = refreshToken || cachedToken?.refresh_token;

            const dataToSave = {
                ...this.credentials,
                updatedAt: Date.now()
            };

            // Save refresh_token to Firestore for persistence across sessions
            if (tokenToSave) {
                dataToSave.refresh_token = tokenToSave;
            }

            const field = this.getBillCredentialsField();
            await ref.set({
                [field]: dataToSave
            }, { merge: true });

            console.log(`[BILL-TOKEN] ✅ Credentials saved to Firestore (company ${this.companyId}):`,
                this.credentials.bearerToken ? 'bearerToken' : `username: ${this.credentials.username}`,
                tokenToSave ? '(with refresh_token)' : '(no refresh_token)');
            return true;
        } catch (error) {
            console.error('[BILL-TOKEN] Error saving to Firestore:', error);
            return false;
        }
    }

    /**
     * Save refresh_token to Firestore (called after successful token fetch)
     */
    async saveRefreshTokenToFirestore(refreshToken) {
        if (!refreshToken) return false;

        const ref = this.getFirestoreRef();
        if (!ref) return false;

        try {
            const field = this.getBillCredentialsField();
            await ref.set({
                [field]: {
                    refresh_token: refreshToken,
                    updatedAt: Date.now()
                }
            }, { merge: true });

            console.log(`[BILL-TOKEN] ✅ Refresh token saved to Firestore (company ${this.companyId})`);
            return true;
        } catch (error) {
            console.error('[BILL-TOKEN] Error saving refresh token to Firestore:', error);
            return false;
        }
    }

    /**
     * Load credentials from Firestore
     */
    async loadFromFirestore() {
        const ref = this.getFirestoreRef();
        if (!ref) {
            console.warn('[BILL-TOKEN] Cannot load from Firestore (auth not ready?)');
            return false;
        }

        try {
            const doc = await ref.get();
            if (!doc.exists) {
                console.log('[BILL-TOKEN] No credentials in Firestore');
                return false;
            }

            const data = doc.data();
            const field = this.getBillCredentialsField();
            const billCreds = data[field];

            if (billCreds) {
                // Extract refresh_token before setting credentials
                const refreshToken = billCreds.refresh_token;

                // Set credentials (without refresh_token in credentials object)
                this.credentials = {
                    ...billCreds,
                    refresh_token: undefined // Don't store in credentials
                };
                delete this.credentials.refresh_token;

                this.saveToStorage(); // Cache credentials locally

                // If we have a refresh_token from Firestore, save it to token storage
                if (refreshToken) {
                    const tokenData = {
                        refresh_token: refreshToken,
                        expires_at: 0 // Mark as expired so it will try to refresh
                    };
                    this.saveTokenToStorage(tokenData);
                    console.log(`[BILL-TOKEN] ✅ Refresh token loaded from Firestore (company ${this.companyId})`);
                }

                console.log(`[BILL-TOKEN] ✅ Credentials loaded from Firestore (company ${this.companyId}):`,
                    this.credentials.bearerToken ? 'bearerToken' : `username: ${this.credentials.username}`,
                    refreshToken ? '(with refresh_token)' : '');
                return true;
            }

            return false;
        } catch (error) {
            console.error('[BILL-TOKEN] Error loading from Firestore:', error);
            return false;
        }
    }

    // =====================================================
    // AUTHENTICATION METHODS
    // =====================================================

    /**
     * Check if token is valid
     */
    isTokenValid() {
        if (!this.token || !this.tokenExpiry) return false;
        const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
        return Date.now() < (this.tokenExpiry - bufferTime);
    }

    /**
     * Check if credentials are configured
     */
    hasCredentials() {
        if (!this.credentials) return false;
        return !!(this.credentials.bearerToken ||
                  (this.credentials.username && this.credentials.password));
    }

    /**
     * Set credentials (username/password or bearer token)
     * @param {Object} creds - { username, password } or { bearerToken }
     */
    async setCredentials(creds) {
        this.credentials = {
            ...creds,
            updatedAt: Date.now()
        };

        // Get cached token data BEFORE clearing (to preserve refresh_token)
        const cachedToken = this.getCachedTokenData();
        const refreshToken = cachedToken?.refresh_token;

        // Clear old token
        this.token = null;
        this.tokenExpiry = null;
        localStorage.removeItem(this.tokenStorageKey);

        // Save to localStorage
        this.saveToStorage();

        // Save to Firestore (pass refresh_token explicitly)
        await this.saveToFirestore(true, refreshToken);

        console.log('[BILL-TOKEN] Credentials updated');
    }

    /**
     * Fetch new token from TPOS API
     */
    async fetchToken() {
        if (!this.hasCredentials()) {
            throw new Error('No credentials configured');
        }

        // If using direct bearer token (no refresh capability)
        if (this.credentials.bearerToken) {
            this.token = this.credentials.bearerToken;
            // Set expiry to 30 days from now (bearer tokens usually have long validity)
            this.tokenExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000);

            const tokenData = {
                access_token: this.token,
                expires_at: this.tokenExpiry
            };
            this.saveTokenToStorage(tokenData);

            return this.token;
        }

        // Try refresh token first if available
        const cachedToken = this.getCachedTokenData();
        if (cachedToken?.refresh_token) {
            try {
                const refreshed = await this.refreshWithToken(cachedToken.refresh_token);
                if (refreshed) {
                    console.log('[BILL-TOKEN] Token refreshed successfully');
                    return this.token;
                }
            } catch (error) {
                console.warn('[BILL-TOKEN] Refresh token failed, will use password:', error.message);
            }
        }

        // Fetch using username/password
        const { username, password } = this.credentials;

        const formData = new URLSearchParams();
        formData.append('grant_type', 'password');
        formData.append('username', username);
        formData.append('password', password);
        formData.append('client_id', 'tmtWebApp');

        console.log(`[BILL-TOKEN] Fetching token for user: ${username} (company ${this.companyId})`);

        const response = await fetch(this.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Token fetch failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (!data.access_token) {
            throw new Error('Invalid token response');
        }

        // Calculate expiry (expires_in is in seconds)
        const expiresIn = data.expires_in || 3600;
        this.token = data.access_token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);

        // Save token data including refresh_token
        const tokenData = {
            access_token: this.token,
            refresh_token: data.refresh_token,
            expires_at: this.tokenExpiry,
            expires_in: expiresIn
        };
        this.saveTokenToStorage(tokenData);

        // Also save refresh_token to Firestore for persistence
        if (data.refresh_token) {
            this.saveRefreshTokenToFirestore(data.refresh_token);
        }

        console.log('[BILL-TOKEN] Token fetched and cached');
        return this.token;
    }

    /**
     * Get cached token data from localStorage
     */
    getCachedTokenData() {
        try {
            const tokenStr = localStorage.getItem(this.tokenStorageKey);
            if (tokenStr) {
                return JSON.parse(tokenStr);
            }
        } catch (error) {
            console.error('[BILL-TOKEN] Error reading cached token:', error);
        }
        return null;
    }

    /**
     * Refresh token using refresh_token grant
     * @param {string} refreshToken - The refresh token
     * @returns {boolean} - Whether refresh was successful
     */
    async refreshWithToken(refreshToken) {
        const formData = new URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('refresh_token', refreshToken);
        formData.append('client_id', 'tmtWebApp');

        console.log('[BILL-TOKEN] Attempting to refresh token...');

        const response = await fetch(this.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (!response.ok) {
            throw new Error(`Refresh failed: ${response.status}`);
        }

        const data = await response.json();

        if (!data.access_token) {
            throw new Error('Invalid refresh response');
        }

        // Calculate expiry
        const expiresIn = data.expires_in || 3600;
        this.token = data.access_token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);

        // Save new token data (keep new refresh_token if provided)
        const newRefreshToken = data.refresh_token || refreshToken;
        const tokenData = {
            access_token: this.token,
            refresh_token: newRefreshToken,
            expires_at: this.tokenExpiry,
            expires_in: expiresIn
        };
        this.saveTokenToStorage(tokenData);

        // Save new refresh_token to Firestore if it changed
        if (data.refresh_token) {
            this.saveRefreshTokenToFirestore(data.refresh_token);
        }

        return true;
    }

    /**
     * Get valid token (refresh if needed)
     */
    async getToken() {
        // Return cached token if valid
        if (this.isTokenValid()) {
            return this.token;
        }

        // Prevent multiple simultaneous refreshes
        if (this.isRefreshing) {
            // Wait for refresh to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.token;
        }

        this.isRefreshing = true;

        try {
            await this.fetchToken();
            return this.token;
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Get auth header for API requests
     */
    async getAuthHeader() {
        const token = await this.getToken();
        return {
            'Authorization': `Bearer ${token}`
        };
    }

    /**
     * Test credentials by fetching token
     */
    async testCredentials() {
        try {
            // Clear existing token to force fetch (MUST clear localStorage too!)
            this.token = null;
            this.tokenExpiry = null;
            localStorage.removeItem(this.tokenStorageKey); // Clear cached token including refresh_token

            await this.fetchToken();
            return { success: true, message: 'Xác thực thành công!' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Get current credentials info (masked)
     */
    getCredentialsInfo() {
        if (!this.credentials) {
            return { configured: false };
        }

        if (this.credentials.bearerToken) {
            return {
                configured: true,
                type: 'bearer',
                preview: this.credentials.bearerToken.substring(0, 20) + '...'
            };
        }

        if (this.credentials.username) {
            return {
                configured: true,
                type: 'password',
                username: this.credentials.username
            };
        }

        return { configured: false };
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize - load from Firestore if no local credentials
     */
    async init() {
        // Already have credentials from localStorage
        if (this.hasCredentials()) {
            console.log(`[BILL-TOKEN] ✅ Initialized with local credentials (company ${this.companyId}):`, this.credentials.username || 'bearer');
            return;
        }

        // Try loading from Firestore if auth is ready
        if (this.getWebUserId()) {
            console.log('[BILL-TOKEN] Loading from Firestore...');
            await this.loadFromFirestore();
        } else {
            // Auth not ready yet, retry after 2 seconds (by then table should be loaded)
            console.log('[BILL-TOKEN] Auth not ready, will retry in 2s...');
            setTimeout(() => this._retryLoadFromFirestore(), 2000);
        }
    }

    /**
     * Retry loading from Firestore (called after delay)
     */
    async _retryLoadFromFirestore() {
        if (this.hasCredentials()) return; // Already loaded

        if (this.getWebUserId()) {
            console.log('[BILL-TOKEN] Retrying load from Firestore...');
            await this.loadFromFirestore();
        }
    }

    /**
     * Ensure credentials are loaded (fallback if init() didn't load)
     */
    async ensureCredentialsLoaded() {
        if (this.hasCredentials()) {
            return true;
        }

        // Try loading from Firestore
        if (this.getWebUserId()) {
            return await this.loadFromFirestore();
        }

        return false;
    }
}

// Create global instance
window.billTokenManager = new BillTokenManager();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.billTokenManager.init();
    });
} else {
    window.billTokenManager.init();
}

console.log('[BILL-TOKEN] BillTokenManager loaded');
