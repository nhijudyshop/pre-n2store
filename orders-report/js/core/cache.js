// js/cache.js - Enhanced Cache Management System with IndexedDB Storage
// Migrated from localStorage to IndexedDB for large data support
//
// SOURCE OF TRUTH: /shared/browser/cache-manager.js
// This file is a script-tag compatible version.
// For ES module usage, import from '/shared/browser/cache-manager.js'

class CacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || 24 * 60 * 60 * 1000; // Default 24 hours
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || "livestream_persistent_cache";
        this.saveTimeout = null;
        this.isReady = false;

        // Initialize IndexedDB storage
        this.initStorage();

        // Auto cleanup expired entries every 5 minutes
        setInterval(() => this.cleanExpired(), 5 * 60 * 1000);
    }

    async initStorage() {
        try {
            // Wait for IndexedDB to be ready
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.readyPromise;
            }

            // Try to migrate from localStorage if data exists there
            await this.migrateFromLocalStorage();

            // Load from IndexedDB
            await this.loadFromStorage();

            this.isReady = true;
            console.log('[CACHE] ✅ Cache manager initialized with IndexedDB');
        } catch (error) {
            console.error('[CACHE] ❌ Failed to initialize storage:', error);
            // Fallback to memory-only mode
            this.isReady = true;
        }
    }

    async migrateFromLocalStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                console.log('[CACHE] 🔄 Migrating from localStorage to IndexedDB...');

                const cacheData = JSON.parse(stored);

                // Save to IndexedDB
                if (window.indexedDBStorage) {
                    await window.indexedDBStorage.setItem(this.storageKey, cacheData);
                }

                // Remove from localStorage
                localStorage.removeItem(this.storageKey);

                console.log('[CACHE] ✅ Migration complete');
            }
        } catch (error) {
            console.warn('[CACHE] ⚠️ Migration failed:', error);
        }
    }

    async saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());

            if (window.indexedDBStorage) {
                await window.indexedDBStorage.setItem(this.storageKey, cacheData);
                console.log(`💾 [CACHE] Saved ${cacheData.length} items to IndexedDB`);
            } else {
                // Fallback to localStorage for small data
                const jsonData = JSON.stringify(cacheData);
                if (jsonData.length < 4 * 1024 * 1024) { // 4MB limit for safety
                    localStorage.setItem(this.storageKey, jsonData);
                    console.log(`💾 [CACHE] Saved ${cacheData.length} items to localStorage (fallback)`);
                } else {
                    console.warn('[CACHE] ⚠️ Data too large for localStorage, skipping save');
                }
            }
        } catch (error) {
            console.warn("[CACHE] Cannot save to storage:", error);
            if (error.name === "QuotaExceededError") {
                this.cache.clear();
                console.warn("[CACHE] Cleared cache due to quota exceeded");
            }
        }
    }

    async loadFromStorage() {
        try {
            let cacheData = null;

            // Try IndexedDB first
            if (window.indexedDBStorage) {
                cacheData = await window.indexedDBStorage.getItem(this.storageKey);
            }

            // Fallback to localStorage
            if (!cacheData) {
                const stored = localStorage.getItem(this.storageKey);
                if (stored) {
                    cacheData = JSON.parse(stored);
                }
            }

            if (!cacheData) {
                console.log("[CACHE] No cached data found");
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

            console.log(`📦 [CACHE] Loaded ${validCount} valid items from storage`);
        } catch (error) {
            console.warn("[CACHE] Cannot load from storage:", error);
        }
    }

    debouncedSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToStorage();
        }, 2000);
    }

    set(key, value, type = "general") {
        const cacheKey = `${type}_${key}`;
        this.cache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expires: Date.now() + this.maxAge,
            type,
        });
        this.debouncedSave();
    }

    get(key, type = "general") {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
            this.stats.hits++;
            console.log(`✔ [CACHE] HIT: ${cacheKey}`);
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
            this.debouncedSave();
        }

        this.stats.misses++;
        console.log(`✗ [CACHE] MISS: ${cacheKey}`);
        return null;
    }

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
            if (window.indexedDBStorage) {
                await window.indexedDBStorage.removeItem(this.storageKey);
            }
            localStorage.removeItem(this.storageKey);

            console.log("[CACHE] Cleared all cache");
        }
        this.stats = { hits: 0, misses: 0 };
        await this.saveToStorage();
    }

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

    invalidatePattern(pattern) {
        let invalidated = 0;
        for (const [key] of this.cache.entries()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                invalidated++;
            }
        }
        this.saveToStorage();
        console.log(
            `[CACHE] Invalidated ${invalidated} entries matching: ${pattern}`,
        );
        return invalidated;
    }

    async getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate =
            total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : 0;

        let storageSize = 'N/A';

        try {
            if (window.indexedDBStorage) {
                const stats = await window.indexedDBStorage.getStats();
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
            storageSize: storageSize,
        };
    }
}

// Initialize global cache manager
const cacheManager = new CacheManager();

// Compatibility functions for existing code
function getCachedData() {
    return cacheManager.get("reports", "data");
}

function setCachedData(data) {
    cacheManager.set("reports", data, "data");
    console.log("[CACHE] Data cached successfully");
}

function invalidateCache() {
    cacheManager.clear("data");
    console.log("[CACHE] Cache invalidated");
}

// Export for global access
window.cacheManager = cacheManager;
window.getCachedData = getCachedData;
window.setCachedData = setCachedData;
window.invalidateCache = invalidateCache;
