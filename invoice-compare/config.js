// =====================================================
// BALANCE HISTORY - CONFIGURATION
// Cấu hình API endpoint cho trang lịch sử biến động số dư
// Auto-fallback: Cloudflare → Nginx
// =====================================================

// Server URLs
const PRIMARY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const BACKUP_URL = 'https://n2store-fallback.onrender.com'; // Render.com backup server

// Fallback state
let currentServerURL = PRIMARY_URL;
let isUsingBackup = false;
let lastFailureTime = null;
const RETRY_PRIMARY_AFTER = 5 * 60 * 1000;

function getCurrentServer() {
    if (isUsingBackup && lastFailureTime) {
        if (Date.now() - lastFailureTime > RETRY_PRIMARY_AFTER) {
            console.log('[CONFIG] 🔄 Switching back to primary server...');
            currentServerURL = PRIMARY_URL;
            isUsingBackup = false;
        }
    }
    return currentServerURL;
}

function switchToBackup() {
    if (!isUsingBackup) {
        console.warn('[CONFIG] ⚠️ Switching to BACKUP server:', BACKUP_URL);
        currentServerURL = BACKUP_URL;
        isUsingBackup = true;
        lastFailureTime = Date.now();
    }
}

const CONFIG = {
    // Server URLs
    PRIMARY_URL: PRIMARY_URL,
    BACKUP_URL: BACKUP_URL,

    // Dynamic getter for current API URL
    get API_BASE_URL() {
        return getCurrentServer();
    },

    // Pagination
    ITEMS_PER_PAGE: 50,

    // Auto-refresh interval (milliseconds) - Set to 0 to disable
    AUTO_REFRESH_INTERVAL: 0, // 30000 = 30 seconds

    // Cache expiry (milliseconds) - 5 minutes
    CACHE_EXPIRY: 5 * 60 * 1000,

    // Date format
    DATE_FORMAT: 'vi-VN',

    // Currency
    CURRENCY: 'VND',
    CURRENCY_LOCALE: 'vi-VN',

    // Fallback helpers
    getCurrentServer: getCurrentServer,
    switchToBackup: switchToBackup,

    // Smart fetch with auto-fallback
    smartFetch: async function (url, options = {}) {
        const activeUrl = url.replace(PRIMARY_URL, getCurrentServer()).replace(BACKUP_URL, getCurrentServer());

        try {
            const response = await fetch(activeUrl, options);
            if (response.status >= 500) {
                throw new Error(`Server error: ${response.status}`);
            }
            return response;
        } catch (error) {
            if (!isUsingBackup) {
                console.error('[CONFIG] ❌ Primary failed:', error.message);
                switchToBackup();
                const backupUrl = url.replace(PRIMARY_URL, BACKUP_URL);
                console.log('[CONFIG] 🔄 Retrying with backup...');
                return fetch(backupUrl, options);
            }
            throw error;
        }
    },

    getStatus: function () {
        return {
            primary: PRIMARY_URL,
            backup: BACKUP_URL,
            current: getCurrentServer(),
            isUsingBackup: isUsingBackup
        };
    }
};

// Export for use in main.js
window.CONFIG = CONFIG;

console.log('[CONFIG] 🚀 Loaded with fallback support:', CONFIG.getStatus());

