// =====================================================
// PANCAKE TOKEN MANAGER - Quản lý JWT token với localStorage + Firestore
//
// SOURCE OF TRUTH: /shared/browser/pancake-token-manager.js
// This file is a script-tag compatible version.
// For ES module usage, import from '/shared/browser/pancake-token-manager.js'
//
// MIGRATION: Changed from Realtime Database to Firestore
// =====================================================
// Priority order for token retrieval:
// 1. In-memory cache (fastest)
// 2. localStorage (fast, no network)
// 3. Firestore (network required, backup)
// 4. Cookie (fallback)
// =====================================================

class PancakeTokenManager {
    constructor() {
        this.firestoreRef = null;
        this.accountsRef = null;
        this.pageTokensRef = null; // For page_access_tokens
        this.currentToken = null;
        this.currentTokenExpiry = null;
        this.activeAccountId = null;
        this.accounts = {};
        this.pageAccessTokens = {}; // Cache for page_access_tokens

        // localStorage keys
        this.LOCAL_STORAGE_KEYS = {
            JWT_TOKEN: 'pancake_jwt_token',
            JWT_TOKEN_EXPIRY: 'pancake_jwt_token_expiry',
            JWT_ACCOUNT_ID: 'tpos_pancake_active_account_id',
            PAGE_ACCESS_TOKENS: 'pancake_page_access_tokens',
            ALL_ACCOUNTS: 'pancake_all_accounts' // NEW: Store all accounts for multi-account sending
        };
    }

    // =====================================================
    // LOCAL STORAGE METHODS - Fast access without network
    // =====================================================

    /**
     * Save JWT token to localStorage for fast access
     * @param {string} token - JWT token
     * @param {number} expiry - Token expiry timestamp (seconds)
     */
    saveTokenToLocalStorage(token, expiry) {
        try {
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN, token);
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN_EXPIRY, expiry.toString());
            console.log('[PANCAKE-TOKEN] ✅ JWT token saved to localStorage');
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving token to localStorage:', error);
        }
    }

    /**
     * Get JWT token from localStorage
     * @returns {Object|null} { token, expiry } or null
     */
    getTokenFromLocalStorage() {
        try {
            const token = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN);
            const expiry = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_TOKEN_EXPIRY);

            if (!token || !expiry) {
                return null;
            }

            const exp = parseInt(expiry, 10);
            if (this.isTokenExpired(exp)) {
                console.log('[PANCAKE-TOKEN] localStorage token is expired, clearing...');
                this.clearTokenFromLocalStorage();
                return null;
            }

            console.log('[PANCAKE-TOKEN] ✅ Valid JWT token found in localStorage');
            return { token, expiry: exp };
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting token from localStorage:', error);
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
            console.log('[PANCAKE-TOKEN] JWT token cleared from localStorage');
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing token from localStorage:', error);
        }
    }

    // =====================================================
    // ALL ACCOUNTS LOCAL STORAGE - For multi-account sending
    // =====================================================

    /**
     * Save all accounts to localStorage for fast access in multi-account sending
     */
    saveAllAccountsToLocalStorage() {
        try {
            localStorage.setItem(this.LOCAL_STORAGE_KEYS.ALL_ACCOUNTS, JSON.stringify(this.accounts));
            console.log('[PANCAKE-TOKEN] ✅ All accounts saved to localStorage:', Object.keys(this.accounts).length);
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving all accounts to localStorage:', error);
        }
    }

    /**
     * Load all accounts from localStorage
     * @returns {Object} - { accountId: { name, uid, exp, savedAt, token }, ... }
     */
    getAllAccountsFromLocalStorage() {
        try {
            const data = localStorage.getItem(this.LOCAL_STORAGE_KEYS.ALL_ACCOUNTS);
            if (data) {
                const accounts = JSON.parse(data);
                console.log('[PANCAKE-TOKEN] ✅ All accounts loaded from localStorage:', Object.keys(accounts).length);
                return accounts;
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error loading all accounts from localStorage:', error);
        }
        return {};
    }

    /**
     * Get all VALID (non-expired) accounts for multi-account sending
     * @returns {Array} - Array of { accountId, name, uid, token, exp }
     */
    getValidAccountsForSending() {
        const validAccounts = [];
        const now = Math.floor(Date.now() / 1000);

        for (const [accountId, account] of Object.entries(this.accounts)) {
            // Check if not expired (with 1 hour buffer)
            if (account.exp && (now < account.exp - 3600)) {
                validAccounts.push({
                    accountId,
                    name: account.name,
                    uid: account.uid,
                    token: account.token,
                    exp: account.exp
                });
            }
        }

        console.log('[PANCAKE-TOKEN] Valid accounts for sending:', validAccounts.length, '/', Object.keys(this.accounts).length);
        return validAccounts;
    }

    /**
     * Save page_access_tokens to IndexedDB (async)
     * @param {Object} tokens - { pageId: { token, pageId, pageName, timestamp, savedAt }, ... }
     */
    async savePageAccessTokensToStorage(tokens = null) {
        try {
            const data = tokens || this.pageAccessTokens;

            if (window.indexedDBStorage) {
                await window.indexedDBStorage.setItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS, data);
                console.log('[PANCAKE-TOKEN] ✅ Page access tokens saved to IndexedDB:', Object.keys(data).length);
            } else {
                // Fallback to localStorage
                localStorage.setItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS, JSON.stringify(data));
                console.log('[PANCAKE-TOKEN] ✅ Page access tokens saved to localStorage (fallback):', Object.keys(data).length);
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving page access tokens:', error);
        }
    }

    // Alias for backwards compatibility
    savePageAccessTokensToLocalStorage(tokens = null) {
        this.savePageAccessTokensToStorage(tokens);
    }

    /**
     * Get page_access_tokens from IndexedDB/localStorage
     * @returns {Promise<Object>} - { pageId: { token, ... }, ... }
     */
    async getPageAccessTokensFromStorage() {
        try {
            let data = null;

            // Try IndexedDB first
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.readyPromise;
                data = await window.indexedDBStorage.getItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);

                if (data) {
                    console.log('[PANCAKE-TOKEN] ✅ Page access tokens loaded from IndexedDB:', Object.keys(data).length);
                    return data;
                }
            }

            // Fallback to localStorage and migrate
            const localData = localStorage.getItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            if (localData) {
                const parsed = JSON.parse(localData);
                console.log('[PANCAKE-TOKEN] ✅ Page access tokens loaded from localStorage:', Object.keys(parsed).length);

                // Migrate to IndexedDB
                if (window.indexedDBStorage) {
                    await window.indexedDBStorage.setItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS, parsed);
                    localStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
                    console.log('[PANCAKE-TOKEN] 🔄 Migrated page access tokens to IndexedDB');
                }

                return parsed;
            }

            return {};
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting page access tokens:', error);
            return {};
        }
    }

    // Sync version for backwards compatibility (returns cached data, also checks localStorage)
    getPageAccessTokensFromLocalStorage() {
        // If in-memory cache is empty, try to load from localStorage synchronously
        if (!this.pageAccessTokens || Object.keys(this.pageAccessTokens).length === 0) {
            try {
                const localData = localStorage.getItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
                if (localData) {
                    this.pageAccessTokens = JSON.parse(localData);
                    console.log('[PANCAKE-TOKEN] ✅ Loaded page tokens from localStorage (sync):', Object.keys(this.pageAccessTokens).length);
                }
            } catch (error) {
                console.warn('[PANCAKE-TOKEN] Error reading from localStorage:', error);
            }
        }
        return this.pageAccessTokens || {};
    }

    /**
     * Clear page_access_tokens from storage
     */
    async clearPageAccessTokensFromStorage() {
        try {
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            }
            localStorage.removeItem(this.LOCAL_STORAGE_KEYS.PAGE_ACCESS_TOKENS);
            console.log('[PANCAKE-TOKEN] Page access tokens cleared from storage');
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing page access tokens:', error);
        }
    }

    // Alias for backwards compatibility
    clearPageAccessTokensFromLocalStorage() {
        this.clearPageAccessTokensFromStorage();
    }

    /**
     * Initialize Firebase reference
     */
    async initialize() {
        try {
            // PRIORITY 1: Load from storage first (instant, no network)
            console.log('[PANCAKE-TOKEN] Loading from storage first...');
            await this.loadFromLocalStorage();

            if (!window.firebase || !window.firebase.firestore) {
                console.warn('[PANCAKE-TOKEN] Firestore not available, using localStorage only');
                return true; // Still return true if we have localStorage data
            }

            // Firestore structure (migrated from Realtime Database)
            const db = window.firebase.firestore();
            this.firestoreRef = db.collection('pancake_tokens');
            this.accountsRef = this.firestoreRef.doc('accounts');
            this.pageTokensRef = this.firestoreRef.doc('page_access_tokens');

            // Load accounts and active account from Firestore (may update localStorage)
            await this.loadAccounts();

            // Migrate from Realtime Database if Firestore is empty
            if (Object.keys(this.accounts).length === 0) {
                await this.migrateFromRealtimeDB();
            }

            // Load page access tokens from Firestore (merge with localStorage)
            await this.loadPageAccessTokens();

            console.log('[PANCAKE-TOKEN] Firestore reference initialized');
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error initializing Firebase:', error);
            // Even if Firebase fails, we might have localStorage data
            return this.currentToken !== null;
        }
    }

    /**
     * Load tokens from storage (IndexedDB/localStorage)
     */
    async loadFromLocalStorage() {
        // Load JWT token (from localStorage - small data)
        const localToken = this.getTokenFromLocalStorage();
        if (localToken) {
            this.currentToken = localToken.token;
            this.currentTokenExpiry = localToken.expiry;
            console.log('[PANCAKE-TOKEN] ✅ JWT token loaded from localStorage');
        }

        // Load page access tokens from IndexedDB (can be large)
        try {
            const storageTokens = await this.getPageAccessTokensFromStorage();
            if (Object.keys(storageTokens).length > 0) {
                this.pageAccessTokens = storageTokens;
                console.log('[PANCAKE-TOKEN] ✅ Page access tokens loaded from storage');
            }
        } catch (error) {
            console.warn('[PANCAKE-TOKEN] Error loading page tokens from storage:', error);
        }

        // Load active account ID
        this.activeAccountId = localStorage.getItem(this.LOCAL_STORAGE_KEYS.JWT_ACCOUNT_ID);
    }

    /**
     * Load all accounts from Firestore
     */
    async loadAccounts() {
        try {
            const doc = await this.accountsRef.get();
            this.accounts = doc.exists ? (doc.data()?.data || {}) : {};

            // Load active account ID from localStorage (per-device)
            this.activeAccountId = localStorage.getItem('tpos_pancake_active_account_id');

            // If active account is set, load its token
            if (this.activeAccountId && this.accounts[this.activeAccountId]) {
                const account = this.accounts[this.activeAccountId];
                this.currentToken = account.token;
                this.currentTokenExpiry = account.exp;

                // Sync to localStorage for fast access next time
                this.saveTokenToLocalStorage(account.token, account.exp);
            } else if (Object.keys(this.accounts).length > 0) {
                // Auto-select first account if no active account set
                const firstAccountId = Object.keys(this.accounts)[0];
                await this.setActiveAccount(firstAccountId);
            }

            // Save all accounts to localStorage for multi-account sending
            this.saveAllAccountsToLocalStorage();

            console.log('[PANCAKE-TOKEN] Loaded accounts:', Object.keys(this.accounts).length);
            console.log('[PANCAKE-TOKEN] Active account (local):', this.activeAccountId);
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error loading accounts:', error);
            return false;
        }
    }

    /**
     * Migrate data from Realtime Database to Firestore (one-time migration)
     * Old path: pancake_jwt_tokens/accounts/{accountId}
     * New path: Firestore pancake_tokens/accounts
     */
    async migrateFromRealtimeDB() {
        try {
            if (!window.firebase?.database) {
                console.log('[PANCAKE-TOKEN] Realtime Database not available, skipping migration');
                return false;
            }

            console.log('[PANCAKE-TOKEN] 🔄 Checking Realtime Database for migration...');

            // Check old path: pancake_jwt_tokens/accounts
            const rtdb = window.firebase.database();
            const oldAccountsRef = rtdb.ref('pancake_jwt_tokens/accounts');
            const snapshot = await oldAccountsRef.once('value');
            const oldAccounts = snapshot.val();

            if (!oldAccounts || Object.keys(oldAccounts).length === 0) {
                console.log('[PANCAKE-TOKEN] No data in Realtime Database to migrate');
                return false;
            }

            console.log('[PANCAKE-TOKEN] 📦 Found', Object.keys(oldAccounts).length, 'accounts in Realtime Database');

            // Migrate to Firestore
            this.accounts = oldAccounts;
            if (this.accountsRef) {
                await this.accountsRef.set({ data: oldAccounts }, { merge: true });
                console.log('[PANCAKE-TOKEN] ✅ Migrated accounts to Firestore');
            }

            // Auto-select first account if no active account
            if (!this.activeAccountId && Object.keys(oldAccounts).length > 0) {
                const firstAccountId = Object.keys(oldAccounts)[0];
                await this.setActiveAccount(firstAccountId);
            }

            // Migrate page_access_tokens if exists
            const oldPageTokensRef = rtdb.ref('pancake_jwt_tokens/page_access_tokens');
            const pageTokensSnapshot = await oldPageTokensRef.once('value');
            const oldPageTokens = pageTokensSnapshot.val();

            if (oldPageTokens && Object.keys(oldPageTokens).length > 0) {
                console.log('[PANCAKE-TOKEN] 📦 Found', Object.keys(oldPageTokens).length, 'page tokens in Realtime Database');
                this.pageAccessTokens = { ...this.pageAccessTokens, ...oldPageTokens };
                if (this.pageTokensRef) {
                    await this.pageTokensRef.set({ data: oldPageTokens }, { merge: true });
                    console.log('[PANCAKE-TOKEN] ✅ Migrated page tokens to Firestore');
                }
                this.savePageAccessTokensToLocalStorage();
            }

            console.log('[PANCAKE-TOKEN] ✅ Migration from Realtime Database completed!');
            return true;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error migrating from Realtime Database:', error);
            return false;
        }
    }

    /**
     * Decode base64url (JWT uses base64url encoding)
     * @param {string} str - Base64url encoded string
     * @returns {string} - Decoded string with proper UTF-8 handling
     */
    base64UrlDecode(str) {
        try {
            if (!str || typeof str !== 'string') {
                throw new Error('Input must be a non-empty string');
            }

            // Replace URL-safe characters with standard base64 characters
            let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

            // Add padding if needed
            const pad = base64.length % 4;
            if (pad) {
                if (pad === 1) {
                    throw new Error('Invalid base64url string length');
                }
                base64 += '='.repeat(4 - pad);
            }

            // Validate base64 characters (should only contain A-Z, a-z, 0-9, +, /, =)
            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Regex.test(base64)) {
                throw new Error('Invalid characters in base64 string');
            }

            // Decode base64 to binary string
            const binaryString = atob(base64);

            // Convert binary string to UTF-8 string
            // atob() returns a string where each character represents a byte
            // We need to decode it as UTF-8
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Decode UTF-8 bytes to proper string
            const decoded = new TextDecoder('utf-8').decode(bytes);
            return decoded;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Base64 decode error:', error.message);
            console.error('[PANCAKE-TOKEN] Input string:', str?.substring(0, 50) + '...');
            throw error;
        }
    }

    /**
     * Decode JWT token để lấy expiry time
     * @param {string} token - JWT token
     * @returns {Object} { exp, uid, name, ... }
     */
    decodeToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                console.error('[PANCAKE-TOKEN] Token must be a string');
                return null;
            }

            const parts = token.split('.');
            if (parts.length !== 3) {
                console.error('[PANCAKE-TOKEN] Token must have 3 parts, got:', parts.length);
                console.error('[PANCAKE-TOKEN] Parts:', parts);
                return null;
            }

            // Log each part for debugging
            console.log('[PANCAKE-TOKEN] Header length:', parts[0]?.length);
            console.log('[PANCAKE-TOKEN] Payload length:', parts[1]?.length);
            console.log('[PANCAKE-TOKEN] Signature length:', parts[2]?.length);

            // Decode payload (second part)
            const payloadBase64 = parts[1];

            if (!payloadBase64 || payloadBase64.length === 0) {
                console.error('[PANCAKE-TOKEN] Payload part is empty');
                return null;
            }

            console.log('[PANCAKE-TOKEN] Attempting to decode payload...');
            const payloadJson = this.base64UrlDecode(payloadBase64);

            console.log('[PANCAKE-TOKEN] Payload decoded, parsing JSON...');
            const payload = JSON.parse(payloadJson);

            console.log('[PANCAKE-TOKEN] Token decoded successfully');
            console.log('[PANCAKE-TOKEN] Payload contains:', Object.keys(payload).join(', '));
            return payload;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error decoding token:', error.message);
            console.error('[PANCAKE-TOKEN] Error type:', error.name);
            console.error('[PANCAKE-TOKEN] Token length:', token?.length);
            console.error('[PANCAKE-TOKEN] Token starts with:', token?.substring(0, 20));
            console.error('[PANCAKE-TOKEN] Token ends with:', token?.substring(token.length - 20));

            // Check for common issues
            if (token.includes(' ')) {
                console.error('[PANCAKE-TOKEN] ⚠️ Token contains spaces - this should not happen after cleaning');
            }
            if (token.includes('\n') || token.includes('\r')) {
                console.error('[PANCAKE-TOKEN] ⚠️ Token contains newlines - this should not happen after cleaning');
            }

            return null;
        }
    }

    /**
     * Check if token is expired
     * @param {number} exp - Expiry timestamp (seconds)
     * @returns {boolean}
     */
    isTokenExpired(exp) {
        if (!exp) return true;
        const now = Math.floor(Date.now() / 1000); // Convert to seconds
        const buffer = 60 * 60; // 1 hour buffer
        return now >= (exp - buffer);
    }

    /**
     * Lấy token từ Firestore (active account)
     * @returns {Promise<string|null>}
     */
    async getTokenFromFirestore() {
        try {
            if (!this.accountsRef) {
                console.warn('[PANCAKE-TOKEN] Firestore not initialized');
                return null;
            }

            // Use local activeAccountId (from localStorage)
            if (!this.activeAccountId) {
                console.log('[PANCAKE-TOKEN] No active account set (local)');
                return null;
            }

            // Get from in-memory cache first (already loaded from Firestore)
            let data = this.accounts[this.activeAccountId];

            // If not in memory, fetch from Firestore
            if (!data) {
                const doc = await this.accountsRef.get();
                if (doc.exists) {
                    const allAccounts = doc.data()?.data || {};
                    data = allAccounts[this.activeAccountId];
                    // Update memory cache
                    this.accounts = allAccounts;
                }
            }

            if (!data || !data.token) {
                console.log('[PANCAKE-TOKEN] No token in active account');
                return null;
            }

            // Sanitize token - remove 'jwt=' prefix if exists
            let token = data.token;
            if (token.startsWith('jwt=')) {
                token = token.substring(4);
                console.log('[PANCAKE-TOKEN] Stripped jwt= prefix from Firestore token');
            }

            // Check expiry
            const payload = this.decodeToken(token);
            if (!payload || this.isTokenExpired(payload.exp)) {
                console.log('[PANCAKE-TOKEN] Token in active account is expired');
                return null;
            }

            console.log('[PANCAKE-TOKEN] Valid token found in active account');
            this.currentToken = token;
            this.currentTokenExpiry = payload.exp;

            // Cache to localStorage for faster access next time
            this.saveTokenToLocalStorage(token, payload.exp);
            console.log('[PANCAKE-TOKEN] ✅ Token cached to localStorage');

            return token;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error getting token from Firestore:', error);
            return null;
        }
    }

    /**
     * Lưu token vào Firestore (as new account or update existing)
     * @param {string} token - JWT token (cleaned)
     * @param {string} accountId - Optional account ID, auto-generated if not provided
     * @returns {Promise<string>} - Returns account ID
     */
    async saveTokenToFirestore(token, accountId = null) {
        try {
            // Clean token - remove jwt= prefix if exists
            let cleanedToken = token.trim();
            if (cleanedToken.startsWith('jwt=')) {
                cleanedToken = cleanedToken.substring(4).trim();
            }

            const payload = this.decodeToken(cleanedToken);
            if (!payload) {
                console.error('[PANCAKE-TOKEN] Invalid token, cannot save');
                return null;
            }

            // Generate account ID if not provided (use uid from token)
            if (!accountId) {
                accountId = payload.uid || `account_${Date.now()}`;
            }

            const data = {
                token: cleanedToken,
                exp: payload.exp,
                uid: payload.uid,
                name: payload.name || 'Unknown User',
                savedAt: Date.now()
            };

            // Update local state first
            this.accounts[accountId] = data;
            this.activeAccountId = accountId;
            this.currentToken = cleanedToken;
            this.currentTokenExpiry = payload.exp;

            // Save to localStorage (fast, synchronous) - PRIMARY STORAGE
            localStorage.setItem('tpos_pancake_active_account_id', accountId);
            this.saveTokenToLocalStorage(cleanedToken, payload.exp);

            // Save to Firestore (async, backup)
            if (this.accountsRef) {
                // Use update with dot notation to update nested field
                await this.accountsRef.set({
                    data: { [accountId]: data }
                }, { merge: true });
                console.log('[PANCAKE-TOKEN] ✅ Token saved to Firestore as account:', accountId);
            }

            console.log('[PANCAKE-TOKEN] ✅ Token saved to localStorage');
            console.log('[PANCAKE-TOKEN] ✅ Active account set locally (this device only):', accountId);
            console.log('[PANCAKE-TOKEN] Token expires at:', new Date(payload.exp * 1000).toLocaleString());

            return accountId;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error saving token:', error);
            return null;
        }
    }

    /**
     * Get all accounts
     * @returns {Object} - { accountId: { name, uid, exp, savedAt, token }, ... }
     */
    getAllAccounts() {
        return this.accounts;
    }

    /**
     * Set active account
     * @param {string} accountId - Account ID to activate
     * @returns {Promise<boolean>}
     */
    async setActiveAccount(accountId) {
        try {
            if (!this.accounts[accountId]) {
                console.error('[PANCAKE-TOKEN] Account not found:', accountId);
                return false;
            }

            // Check if token is expired
            const account = this.accounts[accountId];
            if (this.isTokenExpired(account.exp)) {
                console.error('[PANCAKE-TOKEN] Cannot activate expired account');
                return false;
            }

            // Update in-memory state
            this.activeAccountId = accountId;
            this.currentToken = account.token;
            this.currentTokenExpiry = account.exp;

            // Save to localStorage (per device) - fast access
            localStorage.setItem('tpos_pancake_active_account_id', accountId);
            this.saveTokenToLocalStorage(account.token, account.exp);

            console.log('[PANCAKE-TOKEN] ✅ Active account set locally (this device only):', accountId);
            return true;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error setting active account:', error);
            return false;
        }
    }

    /**
     * Delete account
     * @param {string} accountId - Account ID to delete
     * @returns {Promise<boolean>}
     */
    async deleteAccount(accountId) {
        try {
            if (!this.accounts[accountId]) {
                console.error('[PANCAKE-TOKEN] Account not found:', accountId);
                return false;
            }

            // Delete from Firestore using FieldValue.delete()
            if (this.accountsRef) {
                await this.accountsRef.update({
                    [`data.${accountId}`]: window.firebase.firestore.FieldValue.delete()
                });
            }
            delete this.accounts[accountId];

            // If deleted account was active, clear local active account
            if (this.activeAccountId === accountId) {
                localStorage.removeItem('tpos_pancake_active_account_id');
                this.activeAccountId = null;
                this.currentToken = null;
                this.currentTokenExpiry = null;

                // Auto-select first available account
                const accountIds = Object.keys(this.accounts);
                if (accountIds.length > 0) {
                    await this.setActiveAccount(accountIds[0]);
                }
            }

            console.log('[PANCAKE-TOKEN] ✅ Account deleted:', accountId);
            return true;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error deleting account:', error);
            return false;
        }
    }

    /**
     * Lấy token từ cookie Pancake.vn
     * @returns {string|null}
     */
    getTokenFromCookie() {
        try {
            const cookies = document.cookie.split(';');
            const jwtCookie = cookies.find(c => c.trim().startsWith('jwt='));
            if (jwtCookie) {
                // Split by '=' and take everything after the first '='
                const parts = jwtCookie.split('=');
                // Join back in case JWT contains '=' characters
                let token = parts.slice(1).join('=').trim();

                // Strip 'jwt=' prefix if exists (safety check)
                if (token.startsWith('jwt=')) {
                    token = token.substring(4);
                }

                console.log('[PANCAKE-TOKEN] Token found in cookie');
                return token;
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error reading token from cookie:', error);
        }
        return null;
    }

    /**
     * Lấy token với priority:
     * 1. In-memory cache (fastest)
     * 2. localStorage (fast, no network)
     * 3. Firebase (network required)
     * 4. Cookie (fallback)
     *
     * Tự động lưu token mới vào localStorage và Firebase
     * @returns {Promise<string|null>}
     */
    async getToken() {
        // Priority 1: Check current token in memory
        if (this.currentToken && !this.isTokenExpired(this.currentTokenExpiry)) {
            console.log('[PANCAKE-TOKEN] Using cached token (memory)');
            return this.currentToken;
        }

        // Priority 2: Check localStorage (fast, no network)
        const localToken = this.getTokenFromLocalStorage();
        if (localToken) {
            console.log('[PANCAKE-TOKEN] Using token from localStorage');
            this.currentToken = localToken.token;
            this.currentTokenExpiry = localToken.expiry;
            return localToken.token;
        }

        // Priority 3: Check Firestore (network required)
        const firestoreToken = await this.getTokenFromFirestore();
        if (firestoreToken) {
            console.log('[PANCAKE-TOKEN] Using token from Firestore');
            return firestoreToken;
        }

        // Priority 4: Check cookie
        const cookieToken = this.getTokenFromCookie();
        if (cookieToken) {
            const payload = this.decodeToken(cookieToken);
            if (payload && !this.isTokenExpired(payload.exp)) {
                console.log('[PANCAKE-TOKEN] Using token from cookie, saving...');
                await this.saveTokenToFirestore(cookieToken);
                return cookieToken;
            } else {
                console.log('[PANCAKE-TOKEN] Cookie token is expired');
            }
        }

        // No valid token found
        console.warn('[PANCAKE-TOKEN] No valid token found. Please login to Pancake.vn or set token manually.');
        return null;
    }

    /**
     * Set token manual (từ UI)
     * @param {string} token - JWT token
     * @returns {Promise<string>} - Returns account ID
     */
    async setTokenManual(token) {
        try {
            if (!token) {
                throw new Error('Token không được để trống');
            }

            console.log('[PANCAKE-TOKEN] Cleaning token input...');

            // Clean token - trim whitespace and newlines
            let cleanedToken = token.trim();

            // Remove jwt= prefix if exists (case insensitive)
            if (cleanedToken.toLowerCase().startsWith('jwt=')) {
                cleanedToken = cleanedToken.substring(4).trim();
            }

            // Remove quotes if present
            cleanedToken = cleanedToken.replace(/^["']|["']$/g, '');

            // Remove any whitespace, tabs, newlines within the token
            cleanedToken = cleanedToken.replace(/\s+/g, '');

            // Remove trailing semicolons or commas
            cleanedToken = cleanedToken.replace(/[;,]+$/g, '');

            console.log('[PANCAKE-TOKEN] Cleaned token length:', cleanedToken.length);

            // Validate not empty after cleaning
            if (!cleanedToken) {
                throw new Error('Token trống sau khi làm sạch. Vui lòng kiểm tra lại token.');
            }

            // Validate token format (should have 3 parts separated by dots)
            const parts = cleanedToken.split('.');
            if (parts.length !== 3) {
                throw new Error(`Token không đúng định dạng JWT (có ${parts.length} phần, cần 3 phần cách nhau bởi dấu chấm)`);
            }

            // Check each part is not empty
            if (!parts[0] || !parts[1] || !parts[2]) {
                throw new Error('Token có phần trống, vui lòng kiểm tra lại');
            }

            console.log('[PANCAKE-TOKEN] Token format valid, decoding...');

            // Decode and validate
            const payload = this.decodeToken(cleanedToken);
            if (!payload) {
                // Check console for detailed error messages
                console.error('[PANCAKE-TOKEN] 🔍 Kiểm tra console để xem chi tiết lỗi');
                console.error('[PANCAKE-TOKEN] 📋 Token đã làm sạch:', cleanedToken.substring(0, 100) + '...');
                throw new Error('Không thể giải mã token. Vui lòng:\n1. Kiểm tra lại token đã copy đúng chưa\n2. Đăng nhập lại Pancake và lấy token mới\n3. Xem console (F12) để biết lỗi chi tiết');
            }

            console.log('[PANCAKE-TOKEN] Token decoded, checking expiry...');

            if (this.isTokenExpired(payload.exp)) {
                const expiryDate = new Date(payload.exp * 1000).toLocaleString('vi-VN');
                throw new Error(`Token đã hết hạn vào ${expiryDate}. Vui lòng đăng nhập lại Pancake để lấy token mới.`);
            }

            console.log('[PANCAKE-TOKEN] Token valid, saving to Firebase...');

            // Save to Firebase
            const accountId = await this.saveTokenToFirestore(cleanedToken);
            if (!accountId) {
                throw new Error('Không thể lưu token vào Firebase. Vui lòng thử lại.');
            }

            console.log('[PANCAKE-TOKEN] ✅ Manual token set successfully');
            return accountId;

        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error setting manual token:', error);
            throw error;
        }
    }

    /**
     * Get token info (for display) - active account
     * @returns {Object|null}
     */
    getTokenInfo() {
        if (!this.activeAccountId || !this.accounts[this.activeAccountId]) {
            return null;
        }

        const account = this.accounts[this.activeAccountId];
        return {
            accountId: this.activeAccountId,
            name: account.name,
            uid: account.uid,
            exp: account.exp,
            expiryDate: new Date(account.exp * 1000).toLocaleString(),
            isExpired: this.isTokenExpired(account.exp),
            savedAt: new Date(account.savedAt).toLocaleString()
        };
    }

    /**
     * Get token info for specific account
     * @param {string} accountId - Account ID
     * @returns {Object|null}
     */
    getAccountInfo(accountId) {
        if (!this.accounts[accountId]) {
            return null;
        }

        const account = this.accounts[accountId];
        return {
            accountId: accountId,
            name: account.name,
            uid: account.uid,
            exp: account.exp,
            expiryDate: new Date(account.exp * 1000).toLocaleString(),
            isExpired: this.isTokenExpired(account.exp),
            savedAt: new Date(account.savedAt).toLocaleString(),
            isActive: this.activeAccountId === accountId
        };
    }

    /**
     * Clear all tokens and accounts
     * @returns {Promise<boolean>}
     */
    async clearToken() {
        try {
            // Clear Firestore documents
            if (this.accountsRef) {
                await this.accountsRef.delete();
                console.log('[PANCAKE-TOKEN] Accounts cleared from Firestore');
            }
            if (this.pageTokensRef) {
                await this.pageTokensRef.delete();
                console.log('[PANCAKE-TOKEN] Page tokens cleared from Firestore');
            }

            // Clear localStorage
            localStorage.removeItem('tpos_pancake_active_account_id');
            this.clearTokenFromLocalStorage();
            this.clearPageAccessTokensFromLocalStorage();
            console.log('[PANCAKE-TOKEN] All tokens cleared from localStorage');

            // Clear in-memory cache
            this.accounts = {};
            this.activeAccountId = null;
            this.currentToken = null;
            this.currentTokenExpiry = null;
            this.pageAccessTokens = {};

            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error clearing token:', error);
            return false;
        }
    }

    /**
     * Debug function to analyze token format
     * @param {string} token - JWT token to analyze
     * @returns {Object} - Analysis results
     */
    debugToken(token) {
        const result = {
            valid: false,
            issues: [],
            info: {}
        };

        try {
            result.info.originalLength = token.length;
            result.info.hasSpaces = token.includes(' ');
            result.info.hasNewlines = token.includes('\n') || token.includes('\r');
            result.info.hasPrefix = token.toLowerCase().startsWith('jwt=');

            // Clean token
            let cleaned = token.trim();
            if (cleaned.toLowerCase().startsWith('jwt=')) {
                cleaned = cleaned.substring(4).trim();
            }
            cleaned = cleaned.replace(/^["']|["']$/g, '');
            cleaned = cleaned.replace(/\s+/g, '');
            cleaned = cleaned.replace(/[;,]+$/g, '');

            result.info.cleanedLength = cleaned.length;

            // Check parts
            const parts = cleaned.split('.');
            result.info.parts = parts.length;
            result.info.partLengths = parts.map(p => p.length);

            if (parts.length !== 3) {
                result.issues.push(`Token có ${parts.length} phần, cần 3 phần`);
                return result;
            }

            if (!parts[0] || !parts[1] || !parts[2]) {
                result.issues.push('Token có phần trống');
                return result;
            }

            // Try to decode
            try {
                const payload = this.decodeToken(cleaned);
                if (payload) {
                    result.valid = true;
                    result.info.name = payload.name;
                    result.info.uid = payload.uid;
                    result.info.exp = payload.exp;
                    result.info.expiryDate = new Date(payload.exp * 1000).toLocaleString('vi-VN');
                    result.info.isExpired = this.isTokenExpired(payload.exp);
                } else {
                    result.issues.push('Không thể giải mã payload');
                }
            } catch (decodeError) {
                result.issues.push('Lỗi giải mã: ' + decodeError.message);
            }

            return result;
        } catch (error) {
            result.issues.push('Lỗi phân tích: ' + error.message);
            return result;
        }
    }

    // =====================================================
    // PAGE ACCESS TOKEN METHODS (for Official API - pages.fm)
    // =====================================================

    /**
     * Load page access tokens from Firestore
     * Smart merge: keeps the newer version based on savedAt timestamp
     */
    async loadPageAccessTokens() {
        try {
            if (!this.pageTokensRef) {
                console.warn('[PANCAKE-TOKEN] pageTokensRef not initialized');
                return;
            }

            const doc = await this.pageTokensRef.get();
            const docData = doc.exists ? (doc.data() || {}) : {};

            // Support both formats:
            // 1. Nested: { data: { pageId: {...}, ... } }
            // 2. Root-level: { pageId: {...}, ... } (current format in Firestore)
            let firestoreTokens = {};
            if (docData.data && typeof docData.data === 'object') {
                firestoreTokens = { ...docData.data };
            }
            // Also check root-level entries (each has a 'token' field)
            // If both exist for same pageId, keep the newer one (by savedAt)
            for (const [key, value] of Object.entries(docData)) {
                if (key !== 'data' && value && typeof value === 'object' && value.token) {
                    const existing = firestoreTokens[key];
                    if (!existing || (value.savedAt || 0) > (existing.savedAt || 0)) {
                        firestoreTokens[key] = value;
                    }
                }
            }

            // Smart merge: keep the newer version for each pageId based on savedAt
            const mergedTokens = { ...this.pageAccessTokens };

            for (const [pageId, firestoreData] of Object.entries(firestoreTokens)) {
                const localData = this.pageAccessTokens[pageId];

                // If no local data, use Firestore data
                if (!localData) {
                    mergedTokens[pageId] = firestoreData;
                    continue;
                }

                // Compare savedAt timestamps - keep the newer one
                const localSavedAt = localData.savedAt || 0;
                const firestoreSavedAt = firestoreData.savedAt || 0;

                if (firestoreSavedAt > localSavedAt) {
                    mergedTokens[pageId] = firestoreData;
                    console.log(`[PANCAKE-TOKEN] Page ${pageId}: Using Firestore data (newer)`);
                } else {
                    console.log(`[PANCAKE-TOKEN] Page ${pageId}: Keeping local data (newer or same)`);
                }
            }

            this.pageAccessTokens = mergedTokens;

            // Sync merged tokens back to localStorage
            this.savePageAccessTokensToLocalStorage();

            console.log('[PANCAKE-TOKEN] Loaded page_access_tokens:', Object.keys(this.pageAccessTokens).length);
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error loading page access tokens:', error);
        }
    }

    /**
     * Save page_access_token for a page
     * @param {string} pageId - Page ID (e.g., "117267091364524")
     * @param {string} token - Page access token
     * @param {string} pageName - Optional page name
     * @returns {Promise<boolean>}
     */
    async savePageAccessToken(pageId, token, pageName = '') {
        try {
            if (!pageId || !token) {
                throw new Error('pageId và token không được để trống');
            }

            // Decode to get timestamp
            let timestamp = null;
            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(this.base64UrlDecode(parts[1]));
                    timestamp = payload.timestamp;
                }
            } catch (e) {
                console.warn('[PANCAKE-TOKEN] Could not decode page_access_token:', e);
            }

            const data = {
                token: token,
                pageId: pageId,
                pageName: pageName,
                timestamp: timestamp,
                savedAt: Date.now()
            };

            // Update in-memory cache first
            this.pageAccessTokens[pageId] = data;

            // Save to localStorage (fast, synchronous)
            this.savePageAccessTokensToLocalStorage();

            // Save to Firestore (async, backup) - save at root level
            if (this.pageTokensRef) {
                await this.pageTokensRef.set({
                    [pageId]: data
                }, { merge: true });
            }

            console.log('[PANCAKE-TOKEN] ✅ page_access_token saved for page:', pageId);
            return true;
        } catch (error) {
            console.error('[PANCAKE-TOKEN] Error saving page_access_token:', error);
            return false;
        }
    }

    /**
     * Get page_access_token for a page
     * @param {string} pageId - Page ID
     * @returns {string|null} - Token or null
     */
    getPageAccessToken(pageId) {
        // Check in-memory cache first
        let data = this.pageAccessTokens[pageId];

        // If not in memory, try localStorage
        if (!data) {
            const localTokens = this.getPageAccessTokensFromLocalStorage();
            if (localTokens[pageId]) {
                data = localTokens[pageId];
                // Update in-memory cache
                this.pageAccessTokens[pageId] = data;
                console.log('[PANCAKE-TOKEN] page_access_token found in localStorage for page:', pageId);
            }
        }

        return data ? data.token : null;
    }

    /**
     * Generate new page_access_token via Pancake API
     * @param {string} pageId - Page ID
     * @returns {Promise<string|null>} - New token or null
     */
    async generatePageAccessToken(pageId) {
        try {
            if (!this.currentToken) {
                throw new Error('Cần đăng nhập Pancake trước');
            }

            console.log('[PANCAKE-TOKEN] ========================================');
            console.log('[PANCAKE-TOKEN] Generating page_access_token for page:', pageId);
            console.log('[PANCAKE-TOKEN] Using access_token (JWT):', this.currentToken.substring(0, 50) + '...');

            // Use worker proxy to avoid CORS
            // API: POST https://pages.fm/api/v1/pages/{page_id}/generate_page_access_token?access_token=xxx
            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/generate_page_access_token`,
                `access_token=${this.currentToken}`
            );

            console.log('[PANCAKE-TOKEN] API URL:', url);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();
            console.log('[PANCAKE-TOKEN] API Response:', result);

            if (result.success && result.page_access_token) {
                console.log('[PANCAKE-TOKEN] ✅ page_access_token generated:', result.page_access_token.substring(0, 50) + '...');
                console.log('[PANCAKE-TOKEN] ========================================');

                // Save to Firebase
                await this.savePageAccessToken(pageId, result.page_access_token);
                return result.page_access_token;
            } else {
                throw new Error(result.message || 'Failed to generate token');
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error generating page_access_token:', error);
            console.log('[PANCAKE-TOKEN] ========================================');
            return null;
        }
    }

    /**
     * Generate page_access_token using a specific account token
     * Safe for parallel/multi-account usage (no global state mutation)
     * @param {string} pageId - Page ID
     * @param {string} accountToken - Account JWT access token
     * @returns {Promise<string|null>} - New token or null
     */
    async generatePageAccessTokenWithToken(pageId, accountToken) {
        try {
            if (!accountToken) {
                throw new Error('Account token is required');
            }

            console.log('[PANCAKE-TOKEN] Generating page_access_token for page:', pageId, '(with explicit token)');

            const url = window.API_CONFIG.buildUrl.pancake(
                `pages/${pageId}/generate_page_access_token`,
                `access_token=${accountToken}`
            );

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success && result.page_access_token) {
                console.log('[PANCAKE-TOKEN] ✅ page_access_token generated for page:', pageId);
                // Save to cache and Firestore
                await this.savePageAccessToken(pageId, result.page_access_token);
                return result.page_access_token;
            } else {
                throw new Error(result.message || 'Failed to generate token');
            }
        } catch (error) {
            console.error('[PANCAKE-TOKEN] ❌ Error generating page_access_token with token:', error);
            return null;
        }
    }

    /**
     * Get page_access_token from cache only (NO auto-generation)
     * Admin must manually add tokens via UI
     * @param {string} pageId - Page ID
     * @returns {Promise<string|null>}
     */
    async getOrGeneratePageAccessToken(pageId) {
        console.log('[PANCAKE-TOKEN] getOrGeneratePageAccessToken called for page:', pageId);

        // Check cache first
        const cached = this.getPageAccessToken(pageId);
        if (cached) {
            console.log('[PANCAKE-TOKEN] ✅ Using CACHED page_access_token:', cached.substring(0, 50) + '...');
            return cached;
        }

        // NO auto-generation - return null if no cached token
        // Admin must manually add tokens via "Quản lý Pancake Accounts" modal
        console.log('[PANCAKE-TOKEN] ⚠️ No cached token for page:', pageId);
        console.log('[PANCAKE-TOKEN] 💡 Admin cần thêm Page Access Token thủ công qua modal "Quản lý Pancake Accounts"');
        return null;
    }

    /**
     * Get all page access tokens info (for display)
     * @returns {Array}
     */
    getAllPageAccessTokens() {
        return Object.entries(this.pageAccessTokens).map(([pageId, data]) => ({
            pageId,
            pageName: data.pageName || pageId,
            token: data.token || null,
            savedAt: data.savedAt || null,
            hasToken: !!data.token
        }));
    }
}

// Create global instance
window.pancakeTokenManager = new PancakeTokenManager();
console.log('[PANCAKE-TOKEN] PancakeTokenManager loaded');
