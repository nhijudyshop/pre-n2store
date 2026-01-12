// =====================================================
// PERSISTENT CACHE MANAGEMENT SYSTEM - UPDATED
// =====================================================

class CacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge =
            config.CACHE_EXPIRY || CONFIG.cache.expiry || 10 * 60 * 1000;
        this.stats = { hits: 0, misses: 0 };
        this.storageKey =
            config.storageKey || CONFIG.storage.cacheKey || "inbox_cache";
        this.saveTimeout = null;

        // Load existing cache from storage
        this.loadFromStorage();

        // Auto cleanup every 5 minutes
        this.startAutoCleanup();
    }

    // =====================================================
    // PERSISTENT STORAGE METHODS
    // =====================================================

    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            console.log(`💾 Đã lưu ${cacheData.length} items vào localStorage`);
        } catch (error) {
            console.warn("Không thể lưu cache vào localStorage:", error);
            // If storage is full, clear old cache
            if (error.name === "QuotaExceededError") {
                this.cache.clear();
                localStorage.removeItem(this.storageKey);
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

            console.log(`📦 Đã load ${validCount} valid items từ localStorage`);
        } catch (error) {
            console.warn("Không thể load cache từ localStorage:", error);
            // Clear corrupted cache
            localStorage.removeItem(this.storageKey);
        }
    }

    debouncedSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToStorage();
        }, 2000); // Save after 2 seconds of inactivity
    }

    // =====================================================
    // CACHE OPERATIONS
    // =====================================================

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
            this.debouncedSave();
        }

        this.stats.misses++;
        console.log(`✗ Cache MISS: ${cacheKey}`);
        return null;
    }

    has(key, type = "general") {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);
        return cached && cached.expires > Date.now();
    }

    delete(key, type = "general") {
        const cacheKey = `${type}_${key}`;
        const deleted = this.cache.delete(cacheKey);
        if (deleted) {
            this.debouncedSave();
        }
        return deleted;
    }

    clear(type = null) {
        if (type) {
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
            localStorage.removeItem(this.storageKey);
        }
        this.stats = { hits: 0, misses: 0 };
        console.log(`🗑️ Cache cleared${type ? ` for type: ${type}` : ""}`);
    }

    // =====================================================
    // MAINTENANCE METHODS
    // =====================================================

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
            this.debouncedSave();
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
            this.debouncedSave();
            console.log(
                `Invalidated ${invalidated} entries matching: ${pattern}`,
            );
        }

        return invalidated;
    }

    startAutoCleanup() {
        setInterval(
            () => {
                const cleaned = this.cleanExpired();
                if (cleaned > 0) {
                    console.log(
                        `Auto-cleanup removed ${cleaned} expired entries`,
                    );
                }
            },
            5 * 60 * 1000,
        ); // Every 5 minutes
    }

    // =====================================================
    // STATISTICS & MONITORING
    // =====================================================

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
            types: this.getTypeBreakdown(),
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

    getTypeBreakdown() {
        const breakdown = {};
        for (const [, value] of this.cache.entries()) {
            breakdown[value.type] = (breakdown[value.type] || 0) + 1;
        }
        return breakdown;
    }

    getCacheStatus() {
        if (!this.cache.size) {
            return { status: "empty", age: 0, size: 0 };
        }

        // Find oldest entry
        let oldestTimestamp = Date.now();
        for (const [, value] of this.cache.entries()) {
            if (value.timestamp < oldestTimestamp) {
                oldestTimestamp = value.timestamp;
            }
        }

        const age = Date.now() - oldestTimestamp;
        const isValid = age < this.maxAge;

        return {
            status: isValid ? "valid" : "expired",
            age: age,
            size: this.cache.size,
        };
    }

    // =====================================================
    // LEGACY COMPATIBILITY METHODS
    // =====================================================

    getCachedData() {
        return this.get("inbox_data", "data");
    }

    setCachedData(data) {
        this.set("inbox_data", data, "data");
    }

    invalidateCache() {
        this.clear("data");
    }

    cleanup() {
        this.cleanExpired();
    }
}

// =====================================================
// GLOBAL INSTANCE & DEBUG INTERFACE
// =====================================================

// Create global cache manager instance
window.cacheManager = new CacheManager();

// Debug interface
window.cacheDebug = {
    getStats: () => {
        const stats = cacheManager.getStats();
        console.table(stats);
        return stats;
    },

    clear: (type = null) => {
        cacheManager.clear(type);
        console.log("Cache cleared");
    },

    viewCache: () => {
        const data = cacheManager.getCachedData();
        console.log("Cached inbox data:", data);
        return data;
    },

    cleanExpired: () => {
        const cleaned = cacheManager.cleanExpired();
        console.log(`Cleaned ${cleaned} expired entries`);
        return cleaned;
    },

    invalidatePattern: (pattern) => {
        const invalidated = cacheManager.invalidatePattern(pattern);
        console.log(`Invalidated ${invalidated} entries matching: ${pattern}`);
        return invalidated;
    },

    getStatus: () => {
        const status = cacheManager.getCacheStatus();
        console.log("Cache status:", status);
        return status;
    },

    forceSync: () => {
        cacheManager.saveToStorage();
        console.log("Cache synced to localStorage");
    },
};

console.log("✅ Persistent Cache Manager initialized");
console.log("💡 Use window.cacheDebug for cache management");
