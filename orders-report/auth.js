// =====================================================
// AUTHENTICATION SYSTEM WITH AUTHMANAGER CLASS
// =====================================================

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        try {
            // Check sessionStorage first (for session-only login)
            let authData = sessionStorage.getItem("loginindex_auth");
            let isFromSession = true;

            // If not in sessionStorage, check localStorage (for remembered login)
            if (!authData) {
                authData = localStorage.getItem("loginindex_auth");
                isFromSession = false;
            }

            if (authData) {
                const auth = JSON.parse(authData);
                if (this.isValidSession(auth, isFromSession)) {
                    this.currentUser = auth;
                    console.log(
                        "[AUTH] Valid session restored from",
                        isFromSession ? "sessionStorage" : "localStorage",
                    );
                    return true;
                } else {
                    console.log("[AUTH] Session expired, clearing data");
                    this.clearAuth();
                }
            }
        } catch (error) {
            console.error("Error reading auth:", error);
            this.clearAuth();
        }
        return false;
    }

    isValidSession(auth, isFromSession = false) {
        if (!auth.isLoggedIn || !auth.userType || auth.checkLogin === undefined)
            return false;

        // Define session timeout based on source and remember preference
        const SESSION_TIMEOUT = isFromSession
            ? 8 * 60 * 60 * 1000 // 8 hours for session storage
            : 30 * 24 * 60 * 60 * 1000; // 30 days for remembered login

        // Check if session has expired
        if (auth.timestamp && Date.now() - auth.timestamp > SESSION_TIMEOUT) {
            console.log("Session expired");
            return false;
        }

        // Check explicit expiry if exists
        if (auth.expiresAt && Date.now() > auth.expiresAt) {
            console.log("Session expired (explicit expiry)");
            return false;
        }

        return true;
    }

    isAuthenticated() {
        const auth = this.getAuthState();
        return auth && auth.isLoggedIn === "true";
    }

    hasPermission(requiredLevel) {
        const auth = this.getAuthState();
        if (!auth) return false;
        return parseInt(auth.checkLogin) <= requiredLevel;
    }

    getAuthState() {
        try {
            // Check sessionStorage first
            let stored = sessionStorage.getItem("loginindex_auth");

            // If not in sessionStorage, check localStorage
            if (!stored) {
                stored = localStorage.getItem("loginindex_auth");
            }

            if (stored) {
                this.currentUser = JSON.parse(stored);
                return this.currentUser;
            }
        } catch (error) {
            console.error("Error reading auth:", error);
        }
        return null;
    }

    getUserInfo() {
        return this.getAuthState();
    }

    // 🆕 NEW - Get userId for chat system
    getUserId() {
        const auth = this.getAuthState();
        return auth ? auth.userId : null;
    }

    clearAuth() {
        this.currentUser = null;
        // Clear ONLY auth-related data, preserve tokens and other data
        sessionStorage.removeItem('loginindex_auth');
        localStorage.removeItem('loginindex_auth');
        console.log('[AUTH] Cleared auth data (preserved other localStorage data)');
    }

    logout() {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            this.clearAuth();
            // Preserve bearer token and other important data when logging out
            // Only clear if user explicitly wants to clear everything
            window.location.href = "../index.html";
        }
    }
}

// =====================================================
// INITIALIZE AUTHMANAGER IMMEDIATELY
// =====================================================

// Initialize authManager IMMEDIATELY
const authManager = new AuthManager();
window.authManager = authManager;

console.log("[AUTH] AuthManager initialized:", authManager.isAuthenticated());

// Redirect to login if not authenticated (production mode)
if (!authManager.isAuthenticated()) {
    console.warn("[AUTH] User not authenticated, redirecting to login...");
    // Clear ONLY auth data, preserve tokens and other data
    authManager.clearAuth();
    // Allow a brief moment for any pending operations
    setTimeout(() => {
        if (!authManager.isAuthenticated()) {
            window.location.href = "../index.html";
        }
    }, 500);
}

// =====================================================
// LEGACY FUNCTIONS (for backward compatibility)
// =====================================================

let authState = null;

function getAuthState() {
    return authManager ? authManager.getAuthState() : null;
}

function setAuthState(isLoggedIn, userType, checkLogin) {
    authState = {
        isLoggedIn: isLoggedIn,
        userType: userType,
        checkLogin: checkLogin,
        timestamp: Date.now(),
    };

    try {
        localStorage.setItem("loginindex_auth", JSON.stringify(authState));
        if (authManager) {
            authManager.currentUser = authState;
        }
    } catch (error) {
        console.error("Error saving auth state:", error);
    }
}

function clearAuthState() {
    authState = null;
    try {
        // Clear ONLY auth-related data, preserve tokens
        sessionStorage.removeItem('loginindex_auth');
        localStorage.removeItem('loginindex_auth');
    } catch (error) {
        console.error("Error clearing auth state:", error);
    }
}

function clearLegacyAuth() {
    try {
        // Clear ONLY auth-related data, preserve tokens
        sessionStorage.removeItem('loginindex_auth');
        localStorage.removeItem('loginindex_auth');
    } catch (error) {
        console.error("Error clearing legacy auth:", error);
    }
}

function isAuthenticated() {
    return authManager ? authManager.isAuthenticated() : false;
}

function hasPermission(requiredLevel) {
    return authManager ? authManager.hasPermission(requiredLevel) : false;
}

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split("-")[0] : "Admin";
}

function handleLogout() {
    const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
    if (confirmLogout) {
        // Clear ONLY auth data, preserve tokens and other data
        clearAuthState();
        if (typeof invalidateCache === 'function') {
            invalidateCache();
        }
        window.location.href = "../index.html";
    }
}

console.log("Authentication system loaded");
