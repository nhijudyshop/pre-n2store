// =====================================================
// PERSISTENT CACHE MANAGEMENT SYSTEM
// =====================================================

class CacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || APP_CONFIG.CACHE_EXPIRY;
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || "dathang_persistent_cache";
        this.saveTimeout = null;
        this.loadFromStorage();
    }

    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            console.log(`💾 Đã lưu ${cacheData.length} items vào localStorage`);
        } catch (error) {
            console.warn("Không thể lưu cache:", error);
            // If quota exceeded, clear old entries
            if (error.name === "QuotaExceededError") {
                this.cleanExpired();
                this.saveToStorage(); // Retry
            }
        }
    }

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

            console.log(`📦 Đã load ${validCount} items từ localStorage`);
        } catch (error) {
            console.warn("Không thể load cache:", error);
            localStorage.removeItem(this.storageKey);
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
            console.log(`✔ Cache HIT: ${cacheKey}`);
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
        }

        this.stats.misses++;
        console.log(`✗ Cache MISS: ${cacheKey}`);
        return null;
    }

    clear(type = null) {
        if (type) {
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) this.cache.delete(key);
            }
        } else {
            this.cache.clear();
            localStorage.removeItem(this.storageKey);
        }
        this.stats = { hits: 0, misses: 0 };
        console.log(`🗑️ Cache cleared${type ? ` (type: ${type})` : ""}`);
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
            console.log(`🧹 Cleaned ${cleaned} expired entries`);
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
        if (invalidated > 0) {
            this.saveToStorage();
            console.log(
                `Invalidated ${invalidated} cache entries matching: ${pattern}`,
            );
        }
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

// =====================================================
// INITIALIZE GLOBAL CACHE MANAGER
// =====================================================

const cacheManager = new CacheManager({
    CACHE_EXPIRY: APP_CONFIG.CACHE_EXPIRY,
    storageKey: "dathang_persistent_cache",
});

// =====================================================
// LEGACY COMPATIBILITY LAYER
// =====================================================

let memoryCache = { data: null, timestamp: null };

function getCachedData() {
    // Try new cache manager first
    const cached = cacheManager.get("inventory", "data");
    if (cached) {
        console.log("Using persistent cached inventory data");
        return [...cached];
    }

    // Fallback to old memory cache
    if (memoryCache.data && memoryCache.timestamp) {
        if (Date.now() - memoryCache.timestamp < APP_CONFIG.CACHE_EXPIRY) {
            console.log("Using memory cached inventory data");
            return [...memoryCache.data];
        }
    }

    return null;
}

function setCachedData(data) {
    try {
        // Save to new persistent cache
        cacheManager.set("inventory", data, "data");

        // Also save to memory cache for backward compatibility
        memoryCache.data = [...data];
        memoryCache.timestamp = Date.now();

        console.log(`Inventory data cached (${data.length} items)`);
    } catch (e) {
        console.warn("Cannot cache data:", e);
    }
}

function invalidateCache(type = null) {
    if (type) {
        cacheManager.clear(type);
    } else {
        cacheManager.clear();
        memoryCache.data = null;
        memoryCache.timestamp = null;
    }
    console.log("Cache invalidated");
}

// =====================================================
// GLOBAL EXPORTS
// =====================================================

window.cacheManager = cacheManager;
window.getCachedData = getCachedData;
window.setCachedData = setCachedData;
window.invalidateCache = invalidateCache;

// Debug function
window.debugCache = function () {
    console.log("=== CACHE DEBUG ===");
    console.log("Stats:", cacheManager.getStats());
    console.log(
        "Memory cache:",
        memoryCache.data ? `${memoryCache.data.length} items` : "empty",
    );
};

console.log("✅ Persistent cache management system loaded");
