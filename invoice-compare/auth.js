// =====================================================
// AUTHENTICATION HANDLER FOR INVOICE COMPARE
// Integrates with SharedAuthManager and provides fallback
// =====================================================

// =====================================================
// AUTHMANAGER CLASS (Fallback when SharedAuthManager not available)
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

    clearAuth() {
        this.currentUser = null;
        // Clear from both storage locations
        sessionStorage.removeItem("loginindex_auth");
        localStorage.removeItem("loginindex_auth");
        localStorage.removeItem("remember_login_preference");
        // Clear legacy data
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
    }

    logout() {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            this.clearAuth();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    }
}

// =====================================================
// INITIALIZE AUTHMANAGER (as fallback)
// =====================================================
let authManager = null;
if (typeof window.SharedAuthManager === 'undefined') {
    authManager = new AuthManager();
    window.authManager = authManager;
    console.log("[AUTH] Local AuthManager initialized as fallback");
}

// =====================================================
// AUTHENTICATION CHECK FUNCTIONS
// =====================================================
function checkAuth() {
    // Check if user is logged in via shared auth manager
    if (typeof window.SharedAuthManager !== 'undefined') {
        const isAuthenticated = window.SharedAuthManager.isAuthenticated();

        if (!isAuthenticated) {
            console.warn('[AUTH] User not authenticated, redirecting to login');
            window.location.href = '../index.html';
            return false;
        }

        // Get user info
        const userInfo = window.SharedAuthManager.getUserInfo();
        if (userInfo) {
            updateUserDisplay(userInfo);
        }

        return true;
    }

    // Fallback to local AuthManager
    if (authManager) {
        if (!authManager.isAuthenticated()) {
            console.warn("[AUTH] User not authenticated, redirecting to login...");
            setTimeout(() => {
                if (!authManager.isAuthenticated()) {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = "../index.html";
                }
            }, 500);
            return false;
        }

        const userInfo = authManager.getUserInfo();
        if (userInfo) {
            updateUserDisplay(userInfo);
        }
        return true;
    }

    // Last resort: Check localStorage directly
    const authData = localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth');
    if (!authData) {
        console.warn('[AUTH] No auth data found, redirecting to login');
        window.location.href = '../index.html';
        return false;
    }

    try {
        const auth = JSON.parse(authData);
        if (!auth.isLoggedIn) {
            console.warn('[AUTH] User not logged in, redirecting');
            window.location.href = '../index.html';
            return false;
        }

        // Update user display
        updateUserDisplay(auth);
        return true;
    } catch (error) {
        console.error('[AUTH] Error parsing auth data:', error);
        window.location.href = '../index.html';
        return false;
    }
}

// =====================================================
// UPDATE USER DISPLAY
// =====================================================
function updateUserDisplay(userInfo) {
    const userNameEl = document.getElementById('userName');
    if (userNameEl && userInfo) {
        const displayName = userInfo.displayName ||
                          userInfo.username ||
                          (userInfo.userType ? userInfo.userType.split("-")[0] : null) ||
                          'User';
        userNameEl.textContent = displayName;
    }
}

// =====================================================
// SETUP AUTH BUTTONS
// =====================================================
function setupAuthButtons() {
    // Logout button
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }

    // Permissions button
    const btnPermissions = document.getElementById('btnPermissions');
    if (btnPermissions) {
        btnPermissions.addEventListener('click', showPermissions);
    }
}

// =====================================================
// LOGOUT HANDLER
// =====================================================
function handleLogout() {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
        // Clear all auth data
        localStorage.removeItem('loginindex_auth');
        sessionStorage.removeItem('loginindex_auth');
        localStorage.removeItem('tpos_credentials');
        localStorage.removeItem('remember_login_preference');

        // Clear via SharedAuthManager if available
        if (typeof window.SharedAuthManager !== 'undefined') {
            window.SharedAuthManager.logout();
        } else if (authManager) {
            authManager.clearAuth();
        }

        // Clear everything
        localStorage.clear();
        sessionStorage.clear();

        console.log('[AUTH] User logged out');

        // Redirect to login
        window.location.href = '../index.html';
    }
}

// =====================================================
// SHOW PERMISSIONS
// =====================================================
function showPermissions() {
    let permissionsHtml = 'Quyền Của Tôi:\n\n';

    if (typeof window.SharedAuthManager !== 'undefined') {
        const userInfo = window.SharedAuthManager.getUserInfo();

        if (userInfo && userInfo.permissions) {
            Object.keys(userInfo.permissions).forEach(key => {
                if (userInfo.permissions[key]) {
                    permissionsHtml += `• ${key}\n`;
                }
            });
        } else if (userInfo && userInfo.userType === 'admin') {
            permissionsHtml += '• Admin - Tất cả quyền';
        } else {
            permissionsHtml += 'Không có thông tin quyền';
        }
    } else if (authManager) {
        const userInfo = authManager.getUserInfo();
        if (userInfo) {
            if (userInfo.checkLogin !== undefined) {
                permissionsHtml += `• Level: ${userInfo.checkLogin}\n`;
            }
            if (userInfo.userType) {
                permissionsHtml += `• Role: ${userInfo.userType}`;
            }
        }
    } else {
        // Fallback
        const authData = localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth');
        if (authData) {
            const auth = JSON.parse(authData);
            if (auth.userType === 'admin') {
                permissionsHtml += '• Admin - Tất cả quyền';
            } else {
                permissionsHtml += '• User role: ' + (auth.userType || 'unknown');
            }
        }
    }

    alert(permissionsHtml);
}

// =====================================================
// LEGACY FUNCTIONS (for backward compatibility)
// =====================================================

function getAuthState() {
    if (typeof window.SharedAuthManager !== 'undefined') {
        return window.SharedAuthManager.getUserInfo();
    }
    return authManager ? authManager.getAuthState() : null;
}

function isAuthenticated() {
    if (typeof window.SharedAuthManager !== 'undefined') {
        return window.SharedAuthManager.isAuthenticated();
    }
    return authManager ? authManager.isAuthenticated() : false;
}

function hasPermission(requiredLevel) {
    if (typeof window.SharedAuthManager !== 'undefined') {
        const userInfo = window.SharedAuthManager.getUserInfo();
        return userInfo && parseInt(userInfo.checkLogin) <= requiredLevel;
    }
    return authManager ? authManager.hasPermission(requiredLevel) : false;
}

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split("-")[0] : "Admin";
}

// =====================================================
// INITIALIZATION
// =====================================================

// Run auth check immediately on load
checkAuth();

// Setup buttons when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAuthButtons);
} else {
    // DOM already loaded
    setupAuthButtons();
}

console.log('[INVOICE-COMPARE-AUTH] Auth handler initialized');
