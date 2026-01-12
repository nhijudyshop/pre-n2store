// js/cache.js - Enhanced Cache Management System with Persistent Storage

class CacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || APP_CONFIG.CACHE_EXPIRY;
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || "livestream_persistent_cache";
        this.saveTimeout = null;
        this.loadFromStorage();

        // Auto cleanup expired entries every 5 minutes
        setInterval(() => this.cleanExpired(), 5 * 60 * 1000);
    }

    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            console.log(
                `💾 [CACHE] Saved ${cacheData.length} items to localStorage`,
            );
        } catch (error) {
            console.warn("[CACHE] Cannot save to localStorage:", error);
            // If quota exceeded, clear old cache and try again
            if (error.name === "QuotaExceededError") {
                this.cache.clear();
                console.warn("[CACHE] Cleared cache due to quota exceeded");
            }
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) {
                console.log("[CACHE] No cached data found in localStorage");
                return;
            }

            const cacheData = JSON.parse(stored);
            const now = Date.now();
            let validCount = 0;

            cacheData.forEach(([key, value]) => {
                if (value.expires > now) {
                    this.cache.set(key, value);
                    validCount++;
                }
            });

            console.log(
                `📦 [CACHE] Loaded ${validCount} valid items from localStorage`,
            );
        } catch (error) {
            console.warn("[CACHE] Cannot load from localStorage:", error);
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

    clear(type = null) {
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
            localStorage.removeItem(this.storageKey);
            console.log("[CACHE] Cleared all cache");
        }
        this.stats = { hits: 0, misses: 0 };
        this.saveToStorage();
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

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate =
            total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : 0;

        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`,
            storageSize: this.getStorageSize(),
        };
    }

    getStorageSize() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return "0 KB";
            const sizeKB = (stored.length / 1024).toFixed(2);
            return `${sizeKB} KB`;
        } catch {
            return "N/A";
        }
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
