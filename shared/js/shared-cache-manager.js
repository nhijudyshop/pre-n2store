/**
 * SHARED PERSISTENT CACHE MANAGER
 * File: shared-cache-manager.js
 *
 * WRAPPER FILE - Backward compatibility layer
 * SOURCE OF TRUTH: /shared/browser/persistent-cache.js
 *
 * This file is kept for backward compatibility with existing code using:
 *   <script src="../shared/js/shared-cache-manager.js"></script>
 *
 * For new ES Module code, import directly from:
 *   import { PersistentCacheManager } from '/shared/browser/persistent-cache.js';
 */

class PersistentCacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || 24 * 60 * 60 * 1000; // 24h default
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || 'app_cache';
        this.saveTimeout = null;
        this.cleanupInterval = null;

        // Load existing cache from localStorage
        this.loadFromStorage();

        // Auto cleanup expired items every 5 minutes
        this.startAutoCleanup();
    }

    /**
     * Save cache to localStorage
     */
    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            logger.log(`💾 Saved ${cacheData.length} items to localStorage (${this.storageKey})`);
        } catch (error) {
            logger.warn('Cannot save cache to localStorage:', error);
            // If quota exceeded, clear old cache
            if (error.name === 'QuotaExceededError') {
                this.clearExpired();
                try {
                    const cacheData = Array.from(this.cache.entries());
                    localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
                } catch (retryError) {
                    logger.error('Failed to save cache even after cleanup:', retryError);
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

            logger.log(`📦 Loaded ${validCount} valid items from localStorage (${this.storageKey})`);
        } catch (error) {
            logger.warn('Cannot load cache from localStorage:', error);
            // Clear corrupted cache
            localStorage.removeItem(this.storageKey);
        }
    }

    /**
     * Debounced save to localStorage (avoid too frequent writes)
     */
    debouncedSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToStorage();
        }, 2000);
    }

    /**
     * Set cache value
     * @param {string} key
     * @param {*} value
     * @param {string} type - Cache type for grouping
     */
    set(key, value, type = 'general') {
        const cacheKey = type ? `${type}_${key}` : key;
        this.cache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expires: Date.now() + this.maxAge,
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
            logger.log(`✔ Cache HIT: ${cacheKey}`);
            return cached.value;
        }

        if (cached) {
            // Expired, remove it
            this.cache.delete(cacheKey);
        }

        this.stats.misses++;
        logger.log(`✗ Cache MISS: ${cacheKey}`);
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
            logger.log(`🗑️ Cleared ${cleared} items of type: ${type}`);
        } else {
            this.cache.clear();
            localStorage.removeItem(this.storageKey);
            logger.log('🗑️ Cleared ALL cache');
        }
        this.stats = { hits: 0, misses: 0 };
        this.saveToStorage();
    }

    /**
     * Clean expired entries
     * @returns {number} Number of cleaned entries
     */
    cleanExpired() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this.cache.entries()) {
            if (value.expires <= now) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            logger.log(`🧹 Cleaned ${cleaned} expired entries`);
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
            logger.log(`🗑️ Invalidated ${invalidated} entries matching: ${pattern}`);
            this.debouncedSave();
        }
        return invalidated;
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
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
     */
    getStorageSize() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return 0;
            // Return size in KB
            return (stored.length * 2 / 1024).toFixed(2) + ' KB';
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Start auto cleanup interval
     */
    startAutoCleanup() {
        // Clean expired items every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanExpired();
        }, 5 * 60 * 1000);
    }

    /**
     * Stop auto cleanup (call when destroying instance)
     */
    stopAutoCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Destroy cache manager (cleanup)
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

// Export to window
if (typeof window !== 'undefined') {
    window.PersistentCacheManager = PersistentCacheManager;
}

// Module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PersistentCacheManager };
}
