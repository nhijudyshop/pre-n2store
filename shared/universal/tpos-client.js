/**
 * TPOS Client - Universal TPOS API Client
 * Works in Browser, Node.js, and Cloudflare Workers
 *
 * Consolidates:
 * - Token management
 * - API configuration
 * - OData query builders
 */

import { fetchWithTimeout } from './fetch-utils.js';

// =====================================================
// CONFIGURATION
// =====================================================

export const TPOS_CONFIG = {
    // API Base URL
    PRIMARY_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    DIRECT_TPOS_URL: 'https://tomato.tpos.vn',

    // Token API
    TOKEN_ENDPOINT: '/api/token',

    // Per-company credentials
    CREDENTIALS_BY_COMPANY: {
        1: { grant_type: 'password', username: 'nvktlive1', password: 'Aa@28612345678', client_id: 'tmtWebApp' },
        2: { grant_type: 'password', username: 'nvktshop1', password: 'Aa@28612345678', client_id: 'tmtWebApp' }
    },

    // Default credentials (resolves to company 1 for backward compat)
    get DEFAULT_CREDENTIALS() {
        return this.CREDENTIALS_BY_COMPANY[1];
    },

    // Timeouts
    TOKEN_TIMEOUT: 10000,     // 10 seconds for token requests
    API_TIMEOUT: 15000,       // 15 seconds for API requests

    // Token management
    TOKEN_BUFFER: 5 * 60 * 1000,          // 5 minutes before expiry
    TOKEN_STORAGE_KEY: 'tpos_bearer_token',
    FIREBASE_TOKEN_PATH: 'tokens/tpos_bearer',
};

// =====================================================
// TPOS CLIENT CLASS
// =====================================================

export class TPOSClient {
    constructor(options = {}) {
        this.config = { ...TPOS_CONFIG, ...options };
        // Use per-company credentials if companyId specified
        const companyId = options.companyId || 1;
        this.credentials = options.credentials
            || this.config.CREDENTIALS_BY_COMPANY?.[companyId]
            || this.config.DEFAULT_CREDENTIALS;
        this.baseUrl = this.config.PRIMARY_URL;

        // Token state
        this.token = null;
        this.tokenExpiry = null;
        this.isRefreshing = false;
        this.refreshPromise = null;

        // Storage adapters (set based on environment)
        this.storage = options.storage || null;
        this.firebaseRef = options.firebaseRef || null;

        // Callbacks
        this.onTokenRefresh = options.onTokenRefresh || null;
    }

    // =====================================================
    // TOKEN MANAGEMENT
    // =====================================================

    /**
     * Get valid token, refreshing if needed
     * @returns {Promise<string>}
     */
    async getToken() {
        // Return cached token if valid
        if (this.isTokenValid()) {
            return this.token;
        }

        // Wait for ongoing refresh
        if (this.isRefreshing && this.refreshPromise) {
            await this.refreshPromise;
            return this.token;
        }

        // Try to load from storage
        const stored = await this.loadFromStorage();
        if (stored && this.isTokenValid()) {
            return this.token;
        }

        // Fetch new token
        return this.refreshToken();
    }

    /**
     * Get Authorization header
     * @returns {Promise<Object>}
     */
    async getAuthHeader() {
        const token = await this.getToken();
        return { 'Authorization': `Bearer ${token}` };
    }

    /**
     * Check if token is valid
     * @returns {boolean}
     */
    isTokenValid() {
        if (!this.token || !this.tokenExpiry) return false;
        return Date.now() < (this.tokenExpiry - this.config.TOKEN_BUFFER);
    }

    /**
     * Refresh token
     * @returns {Promise<string>}
     */
    async refreshToken() {
        if (this.isRefreshing) {
            await this.refreshPromise;
            return this.token;
        }

        this.isRefreshing = true;
        this.refreshPromise = this._fetchNewToken();

        try {
            const tokenData = await this.refreshPromise;
            this.token = tokenData.access_token;
            this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);

            // Save to storage
            await this.saveToStorage(tokenData);

            // Callback
            if (this.onTokenRefresh) {
                this.onTokenRefresh(tokenData);
            }

            console.log('[TPOS] Token refreshed, expires in', tokenData.expires_in, 'seconds');
            return this.token;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    }

    /**
     * Fetch new token from API
     * @private
     */
    async _fetchNewToken() {
        const url = `${this.baseUrl}${this.config.TOKEN_ENDPOINT}`;

        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(this.credentials).toString()
        }, this.config.TOKEN_TIMEOUT);

        if (!response.ok) {
            throw new Error(`Token fetch failed: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Clear token
     */
    async clearToken() {
        this.token = null;
        this.tokenExpiry = null;

        if (this.storage) {
            await this.storage.removeItem(this.config.TOKEN_STORAGE_KEY);
        }

        if (this.firebaseRef) {
            try {
                await this.firebaseRef.remove();
            } catch (e) {
                console.warn('[TPOS] Failed to clear Firebase token:', e);
            }
        }

        console.log('[TPOS] Token cleared');
    }

    /**
     * Get token info
     */
    getTokenInfo() {
        return {
            hasToken: !!this.token,
            isValid: this.isTokenValid(),
            expiresAt: this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null,
            expiresIn: this.tokenExpiry ? Math.max(0, this.tokenExpiry - Date.now()) : 0,
            server: this.baseUrl
        };
    }

    // =====================================================
    // STORAGE
    // =====================================================

    /**
     * Save token to storage
     */
    async saveToStorage(tokenData) {
        const data = {
            access_token: tokenData.access_token,
            expires_in: tokenData.expires_in,
            expiry: Date.now() + (tokenData.expires_in * 1000),
            savedAt: Date.now()
        };

        // Local storage
        if (this.storage) {
            try {
                await this.storage.setItem(this.config.TOKEN_STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                console.warn('[TPOS] Failed to save to storage:', e);
            }
        }

        // Firebase
        if (this.firebaseRef) {
            try {
                await this.firebaseRef.set(data);
            } catch (e) {
                console.warn('[TPOS] Failed to save to Firebase:', e);
            }
        }
    }

    /**
     * Load token from storage
     */
    async loadFromStorage() {
        let data = null;

        // Try local storage first
        if (this.storage) {
            try {
                const stored = await this.storage.getItem(this.config.TOKEN_STORAGE_KEY);
                if (stored) {
                    data = typeof stored === 'string' ? JSON.parse(stored) : stored;
                }
            } catch (e) {
                console.warn('[TPOS] Failed to load from storage:', e);
            }
        }

        // Try Firebase if local not found
        if (!data && this.firebaseRef) {
            try {
                const snapshot = await this.firebaseRef.get();
                if (snapshot.exists()) {
                    data = snapshot.val();
                }
            } catch (e) {
                console.warn('[TPOS] Failed to load from Firebase:', e);
            }
        }

        if (data && data.access_token && data.expiry) {
            this.token = data.access_token;
            this.tokenExpiry = data.expiry;
            return data;
        }

        return null;
    }

    // =====================================================
    // API METHODS
    // =====================================================

    /**
     * Make authenticated fetch request
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>}
     */
    async fetch(url, options = {}) {
        const authHeader = await this.getAuthHeader();

        const response = await fetch(url, {
            ...options,
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        // Handle 401 - try refresh and retry
        if (response.status === 401) {
            console.log('[TPOS] Got 401, refreshing token...');
            await this.refreshToken();

            const newAuthHeader = await this.getAuthHeader();
            return fetch(url, {
                ...options,
                headers: {
                    ...newAuthHeader,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
        }

        return response;
    }

    /**
     * GET request with JSON response
     */
    async get(endpoint, params = {}) {
        const url = this.buildUrl(endpoint, params);
        const response = await this.fetch(url);
        return response.json();
    }

    /**
     * POST request with JSON body
     */
    async post(endpoint, data = {}, params = {}) {
        const url = this.buildUrl(endpoint, params);
        const response = await this.fetch(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        return response.json();
    }

    /**
     * PATCH request
     */
    async patch(endpoint, data = {}) {
        const url = this.buildUrl(endpoint);
        const response = await this.fetch(url, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
        return response.json();
    }

    // =====================================================
    // URL BUILDERS
    // =====================================================

    /**
     * Build API URL
     */
    buildUrl(endpoint, params = {}) {
        let url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

        if (Object.keys(params).length > 0) {
            const searchParams = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null) {
                    searchParams.set(key, value);
                }
            }
            url += (url.includes('?') ? '&' : '?') + searchParams.toString();
        }

        return url;
    }

    /**
     * Build OData URL
     */
    buildODataUrl(endpoint, options = {}) {
        const { filter, expand, orderBy, top, skip, count, select } = options;
        const params = {};

        if (filter) params.$filter = filter;
        if (expand) params.$expand = expand;
        if (orderBy) params.$orderby = orderBy;
        if (top) params.$top = top;
        if (skip) params.$skip = skip;
        if (count) params.$count = count;
        if (select) params.$select = select;

        return this.buildUrl(`/api/odata/${endpoint}`, params);
    }

    // =====================================================
    // SERVER STATUS
    // =====================================================

    getServerStatus() {
        return {
            primary: this.baseUrl,
            current: this.baseUrl
        };
    }
}

// =====================================================
// ODATA HELPERS
// =====================================================

/**
 * Build OData filter string
 */
export function buildODataFilter(conditions) {
    const parts = [];

    for (const [field, value] of Object.entries(conditions)) {
        if (value === undefined || value === null) continue;

        if (typeof value === 'object') {
            // Handle operators: { field: { $gt: 10, $lt: 20 } }
            if (value.$eq !== undefined) parts.push(`${field} eq ${formatODataValue(value.$eq)}`);
            if (value.$ne !== undefined) parts.push(`${field} ne ${formatODataValue(value.$ne)}`);
            if (value.$gt !== undefined) parts.push(`${field} gt ${formatODataValue(value.$gt)}`);
            if (value.$gte !== undefined) parts.push(`${field} ge ${formatODataValue(value.$gte)}`);
            if (value.$lt !== undefined) parts.push(`${field} lt ${formatODataValue(value.$lt)}`);
            if (value.$lte !== undefined) parts.push(`${field} le ${formatODataValue(value.$lte)}`);
            if (value.$contains !== undefined) parts.push(`contains(${field}, '${value.$contains}')`);
            if (value.$startswith !== undefined) parts.push(`startswith(${field}, '${value.$startswith}')`);
            if (value.$in !== undefined) {
                const inParts = value.$in.map(v => `${field} eq ${formatODataValue(v)}`);
                parts.push(`(${inParts.join(' or ')})`);
            }
        } else {
            parts.push(`${field} eq ${formatODataValue(value)}`);
        }
    }

    return parts.join(' and ');
}

/**
 * Format value for OData
 */
function formatODataValue(value) {
    if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    return String(value);
}

/**
 * Build OData expand string
 */
export function buildODataExpand(relations) {
    if (Array.isArray(relations)) {
        return relations.join(',');
    }
    return relations;
}

// =====================================================
// COMMON TPOS ENDPOINTS
// =====================================================

export const TPOS_ENDPOINTS = {
    // Orders
    SALE_ONLINE_ORDER: 'SaleOnline_Order',
    FAST_SALE_ORDER: 'FastSaleOrder',

    // Products
    PRODUCT: 'Product',

    // CRM
    CRM_TEAM: 'CRMTeam',
    PARTNER: 'Partner',
    CRM_PARTNER: 'CRMPartner',

    // Services
    SALE_ONLINE_ORDER_VIEW: 'SaleOnline_Order/ODataService.GetView',
    SALE_ONLINE_ORDER_VIEW_V2: 'SaleOnline_Order/ODataService.GetViewV2',
    FAST_SALE_ORDER_VIEW: 'FastSaleOrder/ODataService.GetView',
    UPDATE_V2: 'ODataService.UpdateV2',
    ACTION_IMPORT_SIMPLE: 'ODataService.ActionImportSimple',
};

// =====================================================
// FACTORY FUNCTIONS
// =====================================================

/**
 * Create TPOS client for browser
 */
export function createBrowserTPOSClient(options = {}) {
    // Use localStorage adapter
    const storage = {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key)
    };

    return new TPOSClient({
        storage,
        ...options
    });
}

/**
 * Create TPOS client for Node.js
 */
export function createNodeTPOSClient(options = {}) {
    // Simple in-memory storage for Node.js
    const cache = new Map();
    const storage = {
        getItem: (key) => cache.get(key),
        setItem: (key, value) => cache.set(key, value),
        removeItem: (key) => cache.delete(key)
    };

    return new TPOSClient({
        storage,
        ...options
    });
}

console.log('[TPOS-CLIENT] Module loaded');

export default TPOSClient;
