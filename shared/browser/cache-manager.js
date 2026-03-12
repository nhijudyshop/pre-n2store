// =====================================================
// CACHE MANAGER
// Enhanced Cache Management System with IndexedDB Storage
// =====================================================

import { IndexedDBStorage } from './indexeddb-storage.js';

export class CacheManager {
    /**
     * Create a new CacheManager instance
     * @param {Object} config - Configuration options
     * @param {number} config.CACHE_EXPIRY - Cache expiry time in ms (default: 24 hours)
     * @param {string} config.storageKey - Key to use for persistent storage
     * @param {string} config.dbName - IndexedDB database name
     * @param {IndexedDBStorage} config.storage - Optional external IndexedDB instance
     */
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || 24 * 60 * 60 * 1000; // Default 24 hours
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || 'app_persistent_cache';
        this.saveTimeout = null;
        this.isReady = false;

        // Use provided storage or create new one
        this.dbName = config.dbName || 'N2StoreDB';
        this.storage = config.storage || null;

        // Initialize storage
        this.initStorage();

        // Auto cleanup expired entries every 5 minutes
        this.cleanupInterval = setInterval(() => this.cleanExpired(), 5 * 60 * 1000);
    }

    async initStorage() {
        try {
            // Create IndexedDB storage if not provided
            if (!this.storage) {
                this.storage = new IndexedDBStorage(this.dbName, 1);
            }

            // Wait for storage to be ready
            await this.storage.readyPromise;

            // Try to migrate from localStorage if data exists there
            await this.migrateFromLocalStorage();

            // Load from IndexedDB
            await this.loadFromStorage();

            this.isReady = true;
            console.log('[CACHE] Cache manager initialized with IndexedDB');
        } catch (error) {
            console.error('[CACHE] Failed to initialize storage:', error);
            // Fallback to memory-only mode
            this.isReady = true;
        }
    }

    async migrateFromLocalStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                console.log('[CACHE] Migrating from localStorage to IndexedDB...');

                const cacheData = JSON.parse(stored);

                // Save to IndexedDB
                if (this.storage) {
                    await this.storage.setItem(this.storageKey, cacheData);
                }

                // Remove from localStorage
                localStorage.removeItem(this.storageKey);

                console.log('[CACHE] Migration complete');
            }
        } catch (error) {
            console.warn('[CACHE] Migration failed:', error);
        }
    }

    async saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());

            if (this.storage && this.storage.isReady) {
                await this.storage.setItem(this.storageKey, cacheData);
                console.log(`[CACHE] Saved ${cacheData.length} items to IndexedDB`);
            } else {
                // Fallback to localStorage for small data
                const jsonData = JSON.stringify(cacheData);
                if (jsonData.length < 4 * 1024 * 1024) { // 4MB limit for safety
                    localStorage.setItem(this.storageKey, jsonData);
                    console.log(`[CACHE] Saved ${cacheData.length} items to localStorage (fallback)`);
                } else {
                    console.warn('[CACHE] Data too large for localStorage, skipping save');
                }
            }
        } catch (error) {
            console.warn('[CACHE] Cannot save to storage:', error);
            if (error.name === 'QuotaExceededError') {
                this.cache.clear();
                console.warn('[CACHE] Cleared cache due to quota exceeded');
            }
        }
    }

    async loadFromStorage() {
        try {
            let cacheData = null;

            // Try IndexedDB first
            if (this.storage && this.storage.isReady) {
                cacheData = await this.storage.getItem(this.storageKey);
            }

            // Fallback to localStorage
            if (!cacheData) {
                const stored = localStorage.getItem(this.storageKey);
                if (stored) {
                    cacheData = JSON.parse(stored);
                }
            }

            if (!cacheData) {
                console.log('[CACHE] No cached data found');
                return;
            }

            const now = Date.now();
            let validCount = 0;

            cacheData.forEach(([key, value]) => {
                if (value.expires > now) {
                    this.cache.set(key, value);
                    validCount++;
                }
            });

            console.log(`[CACHE] Loaded ${validCount} valid items from storage`);
        } catch (error) {
            console.warn('[CACHE] Cannot load from storage:', error);
        }
    }

    debouncedSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToStorage();
        }, 2000);
    }

    /**
     * Set a value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {string} type - Cache type for grouping
     */
    set(key, value, type = 'general') {
        const cacheKey = `${type}_${key}`;
        this.cache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expires: Date.now() + this.maxAge,
            type
        });
        this.debouncedSave();
    }

    /**
     * Get a value from cache
     * @param {string} key - Cache key
     * @param {string} type - Cache type
     * @returns {any} - Cached value or null
     */
    get(key, type = 'general') {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
            this.stats.hits++;
            console.log(`[CACHE] HIT: ${cacheKey}`);
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
            this.debouncedSave();
        }

        this.stats.misses++;
        console.log(`[CACHE] MISS: ${cacheKey}`);
        return null;
    }

    /**
     * Check if key exists and is valid
     * @param {string} key - Cache key
     * @param {string} type - Cache type
     * @returns {boolean}
     */
    has(key, type = 'general') {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);
        return cached && cached.expires > Date.now();
    }

    /**
     * Clear cache
     * @param {string|null} type - Clear only this type, or all if null
     */
    async clear(type = null) {
        if (type) {
            let cleared = 0;
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) {
                    this.cache.delete(key);
                    cleared++;
                }
            }
            console.log(`[CACHE] Cleared ${cleared} items of type: ${type}`);
        } else {
            this.cache.clear();

            // Clear from storage
            if (this.storage && this.storage.isReady) {
                await this.storage.removeItem(this.storageKey);
            }
            localStorage.removeItem(this.storageKey);

            console.log('[CACHE] Cleared all cache');
        }
        this.stats = { hits: 0, misses: 0 };
        await this.saveToStorage();
    }

    /**
     * Clean expired entries
     * @returns {number} - Number of entries cleaned
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
            this.saveToStorage();
            console.log(`[CACHE] Cleaned ${cleaned} expired entries`);
        }
        return cleaned;
    }

    /**
     * Invalidate entries matching a pattern
     * @param {string} pattern - Pattern to match
     * @returns {number} - Number of entries invalidated
     */
    invalidatePattern(pattern) {
        let invalidated = 0;
        for (const [key] of this.cache.entries()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                invalidated++;
            }
        }
        this.saveToStorage();
        console.log(`[CACHE] Invalidated ${invalidated} entries matching: ${pattern}`);
        return invalidated;
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : 0;

        let storageSize = 'N/A';

        try {
            if (this.storage && this.storage.isReady) {
                const stats = await this.storage.getStats();
                storageSize = stats.totalSizeFormatted;
            }
        } catch {
            storageSize = 'N/A';
        }

        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`,
            storageSize: storageSize
        };
    }

    /**
     * Destroy the cache manager (cleanup)
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
    }
}

/**
 * Create a new CacheManager instance
 * @param {Object} config - Configuration options
 * @returns {CacheManager}
 */
export function createCacheManager(config = {}) {
    return new CacheManager(config);
}

// Default export
export default CacheManager;
