// =====================================================
// AUTHENTICATION SYSTEM WITH STANDALONE CACHE MANAGER
// Fixed version - No dependency on ImageSystem
// =====================================================

// =====================================================
// PERSISTENT CACHE MANAGER FOR AUTH
// =====================================================
class AuthCacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        this.maxAge = config.CACHE_EXPIRY || 30 * 24 * 60 * 60 * 1000;
        this.stats = { hits: 0, misses: 0 };
        this.storageKey = config.storageKey || "auth_system_cache";
        this.saveTimeout = null;
        this.loadFromStorage();
    }

    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            console.log(`[AUTH CACHE] Saved ${cacheData.length} items`);
        } catch (error) {
            console.warn("[AUTH CACHE] Cannot save cache:", error);
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

            console.log(`[AUTH CACHE] Loaded ${validCount} items from storage`);
        } catch (error) {
            console.warn("[AUTH CACHE] Cannot load cache:", error);
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
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
        }

        this.stats.misses++;
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
            `[AUTH CACHE] Invalidated ${invalidated} entries matching: ${pattern}`,
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

// Initialize CacheManager for auth data
const authCacheManager = new AuthCacheManager({
    CACHE_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30 days for remembered login
    storageKey: "auth_system_cache",
});

// Session timeout constants
const SESSION_TIMEOUT = {
    SESSION_STORAGE: 8 * 60 * 60 * 1000, // 8 hours
    REMEMBERED: 30 * 24 * 60 * 60 * 1000, // 30 days
};

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.cacheManager = authCacheManager;
        this.init();
    }

    init() {
        try {
            // Try to get from cache first
            let authData = this.cacheManager.get("current_user", "auth");
            let isFromCache = !!authData;

            // Fallback to checking storage directly if cache miss
            if (!authData) {
                authData = this.checkStorageDirect();
            }

            if (authData) {
                if (this.isValidSession(authData, !isFromCache)) {
                    this.currentUser = authData;
                    // Store in cache for future quick access
                    this.cacheManager.set("current_user", authData, "auth");

                    console.log(
                        "[AUTH] Valid session restored",
                        isFromCache ? "from cache" : "from storage",
                    );
                    return true;
                } else {
                    console.log("[AUTH] Session expired, clearing data");
                    this.clearAuth();
                }
            }
        } catch (error) {
            console.error("[AUTH] Error reading auth:", error);
            this.clearAuth();
        }
        return false;
    }

    checkStorageDirect() {
        // Check sessionStorage first
        try {
            let data = sessionStorage.getItem("loginindex_auth");
            if (data) {
                const authData = JSON.parse(data);
                // Migrate old session format
                if (authData.rememberMe === undefined) {
                    authData.rememberMe = false; // Default to session-only
                }
                if (!authData.expiresAt && authData.timestamp) {
                    authData.expiresAt =
                        authData.timestamp + SESSION_TIMEOUT.SESSION_STORAGE;
                }
                return authData;
            }
        } catch (e) {
            console.warn("[AUTH] SessionStorage read error:", e);
        }

        // Then check localStorage
        try {
            let data = localStorage.getItem("loginindex_auth");
            if (data) {
                const authData = JSON.parse(data);
                // Migrate old session format
                if (authData.rememberMe === undefined) {
                    authData.rememberMe = true; // If in localStorage, assume remembered
                }
                if (!authData.expiresAt && authData.timestamp) {
                    authData.expiresAt =
                        authData.timestamp + SESSION_TIMEOUT.REMEMBERED;
                }
                return authData;
            }
        } catch (e) {
            console.warn("[AUTH] LocalStorage read error:", e);
        }

        return null;
    }

    isValidSession(auth, isFromStorage = false) {
        if (
            !auth.isLoggedIn ||
            !auth.userType ||
            auth.checkLogin === undefined
        ) {
            return false;
        }

        // Determine timeout based on rememberMe flag, not storage source
        // Check rememberMe first, fallback to detecting from storage location
        let timeout = SESSION_TIMEOUT.SESSION_STORAGE; // Default 8 hours

        if (auth.rememberMe === true) {
            // Explicitly remembered
            timeout = SESSION_TIMEOUT.REMEMBERED;
        } else if (auth.rememberMe === false) {
            // Explicitly not remembered
            timeout = SESSION_TIMEOUT.SESSION_STORAGE;
        } else if (isFromStorage) {
            // No explicit flag, check which storage it came from
            try {
                const inLocalStorage = localStorage.getItem("loginindex_auth");
                if (inLocalStorage) {
                    timeout = SESSION_TIMEOUT.REMEMBERED;
                }
            } catch (e) {
                // Can't access localStorage, use session timeout
            }
        }

        // Check timestamp expiry
        if (auth.timestamp && Date.now() - auth.timestamp > timeout) {
            console.log(
                `[AUTH] Session expired (timestamp) - timeout: ${timeout / 1000 / 60 / 60}h`,
            );
            return false;
        }

        // Check explicit expiry
        if (auth.expiresAt && Date.now() > auth.expiresAt) {
            console.log("[AUTH] Session expired (explicit)");
            return false;
        }

        console.log(
            `[AUTH] Session valid - rememberMe: ${auth.rememberMe}, timeout: ${timeout / 1000 / 60 / 60}h`,
        );
        return true;
    }

    isAuthenticated() {
        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === "true";
    }

    hasPermission(requiredLevel) {
        // Legacy wrapper — maps old numeric levels to roleTemplate check
        const auth = this.getAuthState();
        if (!auth) return false;
        if (requiredLevel === 0) return auth.roleTemplate === 'admin';
        // For non-admin, check if user has any detailedPermissions
        if (!auth.detailedPermissions) return false;
        return Object.values(auth.detailedPermissions).some(page =>
            Object.values(page).some(v => v === true)
        );
    }

    getAuthState() {
        // Try cache first
        let cached = this.cacheManager.get("current_user", "auth");
        if (cached) {
            this.currentUser = cached;
            return cached;
        }

        // Fallback to storage
        try {
            let stored = sessionStorage.getItem("loginindex_auth");
            if (!stored) {
                stored = localStorage.getItem("loginindex_auth");
            }

            if (stored) {
                const authData = JSON.parse(stored);
                this.currentUser = authData;
                // Update cache
                this.cacheManager.set("current_user", authData, "auth");
                return authData;
            }
        } catch (error) {
            console.error("[AUTH] Error reading auth:", error);
        }

        return null;
    }

    getUserInfo() {
        return this.getAuthState();
    }

    setAuthState(authData, rememberMe = false) {
        try {
            const authObject = {
                ...authData,
                timestamp: Date.now(),
                rememberMe: rememberMe, // Explicitly set rememberMe
                expiresAt:
                    Date.now() +
                    (rememberMe
                        ? SESSION_TIMEOUT.REMEMBERED
                        : SESSION_TIMEOUT.SESSION_STORAGE),
            };

            // Save to appropriate storage
            if (rememberMe) {
                localStorage.setItem(
                    "loginindex_auth",
                    JSON.stringify(authObject),
                );
                // Also remove from sessionStorage to avoid confusion
                try {
                    sessionStorage.removeItem("loginindex_auth");
                } catch (e) {}
            } else {
                sessionStorage.setItem(
                    "loginindex_auth",
                    JSON.stringify(authObject),
                );
                // Also remove from localStorage to avoid confusion
                try {
                    localStorage.removeItem("loginindex_auth");
                } catch (e) {}
            }

            // Update cache
            this.cacheManager.set("current_user", authObject, "auth");
            this.currentUser = authObject;

            console.log(
                "[AUTH] State saved",
                rememberMe
                    ? "to localStorage (30 days)"
                    : "to sessionStorage (8 hours)",
            );
        } catch (error) {
            console.error("[AUTH] Error saving auth state:", error);
        }
    }

    clearAuth() {
        this.currentUser = null;

        // Clear cache
        this.cacheManager.clear("auth");

        // Clear storage
        try {
            sessionStorage.removeItem("loginindex_auth");
            localStorage.removeItem("loginindex_auth");
            localStorage.removeItem("remember_login_preference");

            // Clear legacy data
            this.clearLegacyAuth();
        } catch (error) {
            console.error("[AUTH] Error clearing auth:", error);
        }

        console.log("[AUTH] All auth data cleared");
    }

    clearLegacyAuth() {
        const legacyKeys = [
            "isLoggedIn",
            "userType",
            "checkLogin",
            "remember_login_preference",
        ];

        legacyKeys.forEach((key) => {
            try {
                localStorage.removeItem(key);
                sessionStorage.removeItem(key);
            } catch (e) {
                console.warn(`[AUTH] Could not clear ${key}:`, e);
            }
        });
    }

    logout() {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            this.clearAuth();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    }

    // Get cache statistics
    getCacheStats() {
        return this.cacheManager.getStats();
    }

    // Clean expired cache entries
    cleanExpiredCache() {
        const cleaned = this.cacheManager.cleanExpired();
        if (cleaned > 0) {
            console.log(`[AUTH] Cleaned ${cleaned} expired cache entries`);
        }
        return cleaned;
    }
}

// =====================================================
// INITIALIZE AUTHMANAGER
// =====================================================

// Initialize authManager IMMEDIATELY - no dependencies
(function initializeAuth() {
    console.log("[AUTH] Starting authentication system...");

    // Initialize authManager
    const authManager = new AuthManager();
    window.authManager = authManager;

    console.log(
        "[AUTH] AuthManager initialized:",
        authManager.isAuthenticated(),
    );
    console.log("[AUTH] Cache stats:", authManager.getCacheStats());

    // Clean expired cache on init
    authManager.cleanExpiredCache();

    // Periodic cache cleanup (every 5 minutes)
    setInterval(
        () => {
            authManager.cleanExpiredCache();
        },
        5 * 60 * 1000,
    );

    // Check authentication after a short delay to allow page to load
    setTimeout(() => {
        if (!authManager.isAuthenticated()) {
            console.warn(
                "[AUTH] User not authenticated, redirecting to login...",
            );
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        } else {
            console.log("[AUTH] User authenticated successfully");
        }
    }, 300);
})();

// =====================================================
// LEGACY FUNCTIONS (for backward compatibility)
// =====================================================

function getAuthState() {
    return window.authManager ? window.authManager.getAuthState() : null;
}

function setAuthState(isLoggedIn, userType, checkLogin, rememberMe = false) {
    if (window.authManager) {
        window.authManager.setAuthState(
            {
                isLoggedIn,
                userType,
                checkLogin,
            },
            rememberMe,
        );
    }
}

function clearAuthState() {
    if (window.authManager) {
        window.authManager.clearAuth();
    }
}

function isAuthenticated() {
    return window.authManager ? window.authManager.isAuthenticated() : false;
}

function hasPermission(requiredLevel) {
    // Legacy wrapper — delegates to authManager's isAdminTemplate or page permission check
    if (!window.authManager) return false;
    if (requiredLevel === 0) return window.authManager.isAdminTemplate();
    return window.authManager.isAuthenticated();
}

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split("-")[0] : "Admin";
}

function handleLogout() {
    if (window.authManager) {
        window.authManager.logout();
    }
}

// Invalidate cache helper
function invalidateCache() {
    if (window.authManager) {
        window.authManager.clearAuth();
    }
}

// Get cache statistics
function getAuthCacheStats() {
    return window.authManager ? window.authManager.getCacheStats() : null;
}

console.log("[AUTH] Authentication system with standalone CacheManager loaded");
