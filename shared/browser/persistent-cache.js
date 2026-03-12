/**
 * PERSISTENT CACHE MANAGER
 * SOURCE OF TRUTH - localStorage-based caching with expiry
 *
 * @module shared/browser/persistent-cache
 * @description Cache manager that persists to localStorage with automatic expiry
 */

// =====================================================
// CONFIGURATION
// =====================================================

export const CACHE_CONFIG = {
    DEFAULT_EXPIRY: 24 * 60 * 60 * 1000,  // 24 hours
    STORAGE_KEY: 'app_cache',
    CLEANUP_INTERVAL: 5 * 60 * 1000,      // 5 minutes
    DEBOUNCE_SAVE: 2000                   // 2 seconds
};

// =====================================================
// PERSISTENT CACHE MANAGER CLASS
// =====================================================

export class PersistentCacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || config.maxAge || CACHE_CONFIG.DEFAULT_EXPIRY;
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || CACHE_CONFIG.STORAGE_KEY;
        this.saveTimeout = null;
        this.cleanupInterval = null;

        // Logger fallback
        this.logger = config.logger || console;

        // Load existing cache
        this.loadFromStorage();

        // Start auto cleanup
        this.startAutoCleanup();
    }

    // =====================================================
    // STORAGE OPERATIONS
    // =====================================================

    /**
     * Save cache to localStorage
     */
    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            this.logger.log(`[Cache] Saved ${cacheData.length} items to localStorage`);
        } catch (error) {
            this.logger.warn('[Cache] Cannot save to localStorage:', error);

            // If quota exceeded, clear old cache
            if (error.name === 'QuotaExceededError') {
                this.clearExpired();
                try {
                    const cacheData = Array.from(this.cache.entries());
                    localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
                } catch (retryError) {
                    this.logger.error('[Cache] Failed to save even after cleanup:', retryError);
                }
            }
        }
    }

    /**
     * Load cache from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const cacheData = JSON.parse(stored);
            const now = Date.now();
            let validCount = 0;

            cacheData.forEach(([key, value]) => {
                if (value.expires > now) {
                    this.cache.set(key, value);
                    validCount++;
                }
            });

            this.logger.log(`[Cache] Loaded ${validCount} valid items from localStorage`);
        } catch (error) {
            this.logger.warn('[Cache] Cannot load from localStorage:', error);
            localStorage.removeItem(this.storageKey);
        }
    }

    /**
     * Debounced save to avoid too frequent writes
     */
    debouncedSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToStorage();
        }, CACHE_CONFIG.DEBOUNCE_SAVE);
    }

    // =====================================================
    // CACHE OPERATIONS
    // =====================================================

    /**
     * Set cache value
     * @param {string} key
     * @param {*} value
     * @param {string} type - Cache type for grouping
     * @param {number} ttl - Time to live in ms (optional)
     */
    set(key, value, type = 'general', ttl = null) {
        const cacheKey = type ? `${type}_${key}` : key;
        this.cache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expires: Date.now() + (ttl || this.maxAge),
            type,
        });
        this.debouncedSave();
    }

    /**
     * Get cache value
     * @param {string} key
     * @param {string} type
     * @returns {*} Cached value or null
     */
    get(key, type = 'general') {
        const cacheKey = type ? `${type}_${key}` : key;
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
            this.stats.hits++;
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
        }

        this.stats.misses++;
        return null;
    }

    /**
     * Check if key exists and is valid
     * @param {string} key
     * @param {string} type
     * @returns {boolean}
     */
    has(key, type = 'general') {
        const cacheKey = type ? `${type}_${key}` : key;
        const cached = this.cache.get(cacheKey);
        return cached && cached.expires > Date.now();
    }

    /**
     * Delete specific cache entry
     * @param {string} key
     * @param {string} type
     * @returns {boolean}
     */
    delete(key, type = 'general') {
        const cacheKey = type ? `${type}_${key}` : key;
        const deleted = this.cache.delete(cacheKey);
        if (deleted) {
            this.debouncedSave();
        }
        return deleted;
    }

    /**
     * Clear cache by type or all
     * @param {string|null} type
     */
    clear(type = null) {
        if (type) {
            let cleared = 0;
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) {
                    this.cache.delete(key);
                    cleared++;
                }
            }
            this.logger.log(`[Cache] Cleared ${cleared} items of type: ${type}`);
        } else {
            this.cache.clear();
            localStorage.removeItem(this.storageKey);
            this.logger.log('[Cache] Cleared ALL cache');
        }
        this.stats = { hits: 0, misses: 0 };
        this.saveToStorage();
    }

    /**
     * Clean expired entries
     * @returns {number} Number of cleaned entries
     */
    clearExpired() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this.cache.entries()) {
            if (value.expires <= now) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logger.log(`[Cache] Cleaned ${cleaned} expired entries`);
            this.saveToStorage();
        }
        return cleaned;
    }

    /**
     * Invalidate cache by pattern
     * @param {string} pattern
     * @returns {number} Number of invalidated entries
     */
    invalidatePattern(pattern) {
        let invalidated = 0;
        for (const [key] of this.cache.entries()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                invalidated++;
            }
        }
        if (invalidated > 0) {
            this.logger.log(`[Cache] Invalidated ${invalidated} entries matching: ${pattern}`);
            this.debouncedSave();
        }
        return invalidated;
    }

    // =====================================================
    // STATISTICS
    // =====================================================

    /**
     * Get cache statistics
     * @returns {Object}
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0
            ? (this.stats.hits / total * 100).toFixed(2)
            : 0;

        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`,
            totalEntries: this.cache.size,
            storageKey: this.storageKey,
            maxAge: this.maxAge,
        };
    }

    /**
     * Get storage size estimate
     * @returns {string}
     */
    getStorageSize() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return '0 KB';
            return (stored.length * 2 / 1024).toFixed(2) + ' KB';
        } catch (error) {
            return 'Unknown';
        }
    }

    // =====================================================
    // AUTO CLEANUP
    // =====================================================

    /**
     * Start auto cleanup interval
     */
    startAutoCleanup() {
        this.cleanupInterval = setInterval(() => {
            this.clearExpired();
        }, CACHE_CONFIG.CLEANUP_INTERVAL);
    }

    /**
     * Stop auto cleanup
     */
    stopAutoCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Destroy cache manager
     */
    destroy() {
        this.stopAutoCleanup();
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveToStorage();
        this.cache.clear();
    }
}

// =====================================================
// FACTORY FUNCTIONS
// =====================================================

/**
 * Create new PersistentCacheManager instance
 * @param {Object} config
 * @returns {PersistentCacheManager}
 */
export function createPersistentCache(config = {}) {
    return new PersistentCacheManager(config);
}

// Default singleton
let defaultInstance = null;

/**
 * Get or create default cache instance
 * @param {Object} config
 * @returns {PersistentCacheManager}
 */
export function getPersistentCache(config = {}) {
    if (!defaultInstance) {
        defaultInstance = new PersistentCacheManager(config);
    }
    return defaultInstance;
}

console.log('[PERSISTENT-CACHE] Module loaded');

export default PersistentCacheManager;
