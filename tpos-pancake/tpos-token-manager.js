// =====================================================
// BEARER TOKEN MANAGER - Auto Refresh & Storage
// =====================================================

class TokenManager {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.isInitialized = false;
        this.initPromise = null;
        this.storageKey = 'bearer_token_data';
        this.API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/token';
        this.credentials = {
            grant_type: 'password',
            username: 'nvkt',
            password: 'Aa@123456789',
            client_id: 'tmtWebApp'
        };
        this.firebaseRef = null;
        this.firebaseReady = false;

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

            // Initialize Firebase reference
            this.initFirebase();

            // Initialize token
            await this.init();

            this.isInitialized = true;
            console.log('[TOKEN] ✅ Token Manager fully initialized');
        })();

        return this.initPromise;
    }

    /**
     * Wait for Firebase SDK to be available
     * @returns {Promise<void>}
     */
    async waitForFirebase() {
        const maxRetries = 50; // 5 seconds max (50 * 100ms)
        let retries = 0;

        while (retries < maxRetries) {
            if (window.firebase && window.firebase.database && typeof window.firebase.database === 'function') {
                console.log('[TOKEN] Firebase SDK is ready');
                this.firebaseReady = true;
                return;
            }

            // Wait 100ms before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        console.warn('[TOKEN] Firebase SDK not available after 5 seconds, will use localStorage only');
    }

    initFirebase() {
        try {
            if (window.firebase && window.firebase.database && this.firebaseReady) {
                this.firebaseRef = window.firebase.database().ref('tpos_token');
                console.log('[TOKEN] ✅ Firebase reference initialized successfully');
                return true;
            } else {
                console.warn('[TOKEN] Firebase not available, will use localStorage only');
                return false;
            }
        } catch (error) {
            console.error('[TOKEN] Error initializing Firebase:', error);
            return false;
        }
    }

    /**
     * Retry Firebase initialization (can be called after Firebase loads)
     */
    retryFirebaseInit() {
        if (this.firebaseRef) {
            console.log('[TOKEN] Firebase already initialized');
            return true;
        }
        console.log('[TOKEN] Retrying Firebase initialization...');
        return this.initFirebase();
    }

    async init() {
        console.log('[TOKEN] Initializing Token Manager...');

        // Try localStorage FIRST (faster than Firebase)
        this.loadFromStorage();
        if (this.isTokenValid()) {
            console.log('[TOKEN] ✅ Valid token loaded from localStorage');
            return;
        }

        // Fallback to Firebase if localStorage token is invalid
        const firebaseToken = await this.getTokenFromFirebase();
        if (firebaseToken) {
            this.token = firebaseToken.access_token;
            this.tokenExpiry = firebaseToken.expires_at;
            // Sync to localStorage for faster access next time (but don't save back to Firebase)
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(firebaseToken));
                console.log('[TOKEN] ✅ Valid token loaded from Firebase and synced to localStorage');
            } catch (error) {
                console.error('[TOKEN] Error syncing Firebase token to localStorage:', error);
            }
            return;
        }

        // No valid token found - will fetch on first API request
        console.log('[TOKEN] ⚠️ No valid token found, will fetch on first API request');
    }

    async getTokenFromFirebase() {
        if (!this.firebaseRef) {
            return null;
        }

        try {
            const snapshot = await this.firebaseRef.once('value');
            const tokenData = snapshot.val();

            if (!tokenData || !tokenData.access_token) {
                console.log('[TOKEN] No token found in Firebase');
                return null;
            }

            // Check if token is still valid
            const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
            if (Date.now() < (tokenData.expires_at - bufferTime)) {
                console.log('[TOKEN] Valid token found in Firebase');
                return tokenData;
            } else {
                console.log('[TOKEN] Token in Firebase is expired');
                return null;
            }

        } catch (error) {
            console.error('[TOKEN] Error reading token from Firebase:', error);
            return null;
        }
    }

    async saveTokenToFirebase(tokenData) {
        if (!this.firebaseRef) {
            console.warn('[TOKEN] Cannot save to Firebase - reference not available');
            return;
        }

        try {
            await this.firebaseRef.set(tokenData);
            console.log('[TOKEN] Token saved to Firebase');
        } catch (error) {
            console.error('[TOKEN] Error saving token to Firebase:', error);
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

            // Save to localStorage
            localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));

            this.token = tokenData.access_token;
            this.tokenExpiry = expiresAt;

            console.log('[TOKEN] Token saved to localStorage, expires:', new Date(expiresAt).toLocaleString());

            // Also save to Firebase (only for NEW tokens from API, not from Firebase)
            // New tokens have expires_in but no expires_at
            if (tokenData.expires_in && !tokenData.issued_at) {
                await this.saveTokenToFirebase(dataToSave);
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

        // Also clear from Firebase
        if (this.firebaseRef) {
            try {
                await this.firebaseRef.remove();
                console.log('[TOKEN] Token cleared from localStorage and Firebase');
            } catch (error) {
                console.error('[TOKEN] Error clearing token from Firebase:', error);
            }
        } else {
            console.log('[TOKEN] Token cleared from localStorage');
        }
    }

    async fetchNewToken() {
        if (this.isRefreshing) {
            console.log('[TOKEN] Token refresh already in progress, waiting...');
            // Wait for the ongoing refresh to complete
            return this.waitForRefresh();
        }

        this.isRefreshing = true;
        let notificationId = null;

        try {
            // Show loading notification
            if (window.notificationManager) {
                notificationId = window.notificationManager.show(
                    'Đang lấy token xác thực...',
                    'info',
                    0,
                    {
                        showOverlay: true,
                        persistent: true,
                        icon: 'key',
                        title: 'Xác thực'
                    }
                );
            }

            console.log('[TOKEN] Fetching new token from API...');

            // Create form data
            const formData = new URLSearchParams();
            formData.append('grant_type', this.credentials.grant_type);
            formData.append('username', this.credentials.username);
            formData.append('password', this.credentials.password);
            formData.append('client_id', this.credentials.client_id);

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString()
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const tokenData = await response.json();

            if (!tokenData.access_token) {
                throw new Error('Invalid token response: missing access_token');
            }

            // Save the new token (to both localStorage and Firebase)
            await this.saveToStorage(tokenData);

            // Close loading notification and show success
            if (window.notificationManager && notificationId) {
                window.notificationManager.remove(notificationId);
                window.notificationManager.success('Token đã được cập nhật thành công', 2000);
            }

            console.log('[TOKEN] New token obtained and saved successfully');
            return this.token;

        } catch (error) {
            console.error('[TOKEN] Error fetching token:', error);

            // Show error notification
            if (window.notificationManager) {
                if (notificationId) {
                    window.notificationManager.remove(notificationId);
                }
                window.notificationManager.error(
                    `Không thể lấy token: ${error.message}`,
                    4000,
                    'Lỗi xác thực'
                );
            }

            await this.clearToken();
            throw error;

        } finally {
            this.isRefreshing = false;
        }
    }

    async waitForRefresh() {
        // Wait for ongoing refresh with timeout
        const maxWait = 10000; // 10 seconds
        const startTime = Date.now();

        while (this.isRefreshing && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.isTokenValid()) {
            return this.token;
        }

        throw new Error('Token refresh timeout');
    }

    async getToken() {
        // Wait for initialization to complete first
        if (!this.isInitialized && this.initPromise) {
            console.log('[TOKEN] Waiting for initialization to complete...');
            await this.initPromise;
        }

        // If token is valid, return it
        if (this.isTokenValid()) {
            return this.token;
        }

        // If token is invalid, fetch new one
        console.log('[TOKEN] Token invalid or expired, fetching new token...');
        return await this.fetchNewToken();
    }

    async getAuthHeader() {
        const token = await this.getToken();
        return {
            'Authorization': `Bearer ${token}`
        };
    }

    // Helper method for making authenticated requests
    async authenticatedFetch(url, options = {}) {
        try {
            const headers = await this.getAuthHeader();
            
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...headers,
                    ...options.headers
                }
            });

            // If 401 Unauthorized, token might be invalid - try refreshing once
            if (response.status === 401) {
                console.log('[TOKEN] Received 401, refreshing token and retrying...');
                await this.clearToken();

                const newHeaders = await this.getAuthHeader();
                const retryResponse = await fetch(url, {
                    ...options,
                    headers: {
                        ...newHeaders,
                        ...options.headers
                    }
                });

                return retryResponse;
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
// INITIALIZE TOKEN MANAGER FOR TPOS
// =====================================================

// Initialize token manager globally (use tposTokenManager to avoid conflict with orders-report)
const tposTokenManager = new TokenManager();
window.tposTokenManager = tposTokenManager;

console.log('[TPOS-TOKEN] Token Manager initialized');

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TokenManager;
}