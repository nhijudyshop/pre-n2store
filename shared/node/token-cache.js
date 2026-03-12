/**
 * Server-side Token Cache
 * In-memory token caching with expiry management
 *
 * @module shared/node/token-cache
 */

/**
 * Token Cache for server-side applications
 * Stores tokens in memory with automatic expiry checking
 */
export class TokenCache {
    /**
     * @param {object} options - Configuration options
     * @param {number} options.bufferTime - Time buffer before expiry (ms) - default 5 minutes
     * @param {number} options.defaultTTL - Default TTL for tokens without expiry (ms) - default 1 hour
     */
    constructor(options = {}) {
        this.cache = new Map();
        this.bufferTime = options.bufferTime || 5 * 60 * 1000; // 5 minutes
        this.defaultTTL = options.defaultTTL || 60 * 60 * 1000; // 1 hour
    }

    /**
     * Get a token from cache
     * @param {string} key - Cache key
     * @returns {string|null} Token or null if not found/expired
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        if (this.isExpired(entry.expiry)) {
            this.cache.delete(key);
            return null;
        }

        return entry.token;
    }

    /**
     * Set a token in cache
     * @param {string} key - Cache key
     * @param {string} token - Token value
     * @param {number} expiresIn - Expiry in seconds (optional)
     * @param {object} metadata - Additional metadata (optional)
     */
    set(key, token, expiresIn = null, metadata = {}) {
        const expiry = expiresIn
            ? Date.now() + (expiresIn * 1000)
            : Date.now() + this.defaultTTL;

        this.cache.set(key, {
            token,
            expiry,
            createdAt: Date.now(),
            ...metadata
        });

        console.log(`[TOKEN-CACHE] Set "${key}", expires at:`, new Date(expiry).toISOString());
    }

    /**
     * Check if an entry is expired
     * @param {number} expiry - Expiry timestamp
     * @returns {boolean}
     */
    isExpired(expiry) {
        if (!expiry) return true;
        return Date.now() >= (expiry - this.bufferTime);
    }

    /**
     * Check if cache has a valid token
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Delete a token from cache
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cached tokens
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     * @returns {object}
     */
    getStats() {
        const now = Date.now();
        let validCount = 0;
        let expiredCount = 0;

        for (const [, entry] of this.cache) {
            if (this.isExpired(entry.expiry)) {
                expiredCount++;
            } else {
                validCount++;
            }
        }

        return {
            totalEntries: this.cache.size,
            validEntries: validCount,
            expiredEntries: expiredCount,
            timestamp: new Date(now).toISOString()
        };
    }

    /**
     * Clean up expired entries
     * @returns {number} Number of entries removed
     */
    cleanup() {
        let removed = 0;

        for (const [key, entry] of this.cache) {
            if (this.isExpired(entry.expiry)) {
                this.cache.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            console.log(`[TOKEN-CACHE] Cleaned up ${removed} expired entries`);
        }

        return removed;
    }

    /**
     * Get entry with metadata
     * @param {string} key - Cache key
     * @returns {object|null}
     */
    getEntry(key) {
        const entry = this.cache.get(key);

        if (!entry) return null;

        if (this.isExpired(entry.expiry)) {
            this.cache.delete(key);
            return null;
        }

        return {
            ...entry,
            remainingMs: entry.expiry - Date.now(),
            remainingSec: Math.floor((entry.expiry - Date.now()) / 1000)
        };
    }
}

/**
 * Simple singleton token cache for TPOS tokens
 */
export const tposTokenCache = {
    access_token: null,
    expiry: null,
    expires_in: null,
    token_type: null,

    /**
     * Check if cached token is valid
     * @returns {boolean}
     */
    isValid() {
        if (!this.access_token || !this.expiry) return false;
        const buffer = 5 * 60 * 1000; // 5 minutes
        return Date.now() < (this.expiry - buffer);
    },

    /**
     * Cache token data
     * @param {object} tokenData - Token response from API
     */
    set(tokenData) {
        const expiryTimestamp = Date.now() + (tokenData.expires_in * 1000);

        this.access_token = tokenData.access_token;
        this.expiry = expiryTimestamp;
        this.expires_in = tokenData.expires_in;
        this.token_type = tokenData.token_type || 'Bearer';

        console.log('[TPOS-TOKEN-CACHE] Token cached, expires at:', new Date(expiryTimestamp).toISOString());
    },

    /**
     * Get cached token if valid
     * @returns {object|null}
     */
    get() {
        if (!this.isValid()) return null;

        return {
            access_token: this.access_token,
            expires_in: Math.floor((this.expiry - Date.now()) / 1000),
            token_type: this.token_type
        };
    },

    /**
     * Clear cached token
     */
    clear() {
        this.access_token = null;
        this.expiry = null;
        this.expires_in = null;
        this.token_type = null;
    }
};

// Default export
export default TokenCache;
