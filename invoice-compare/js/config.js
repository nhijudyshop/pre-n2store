// =====================================================
// BALANCE HISTORY - CONFIGURATION
// Cấu hình API endpoint cho trang lịch sử biến động số dư
// =====================================================

// Server URL
const PRIMARY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

const CONFIG = {
    // Server URL
    PRIMARY_URL: PRIMARY_URL,

    // API Base URL
    get API_BASE_URL() {
        return PRIMARY_URL;
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

    // Simple fetch wrapper
    smartFetch: async function (url, options = {}) {
        return fetch(url, options);
    },

    getStatus: function () {
        return {
            primary: PRIMARY_URL,
            current: PRIMARY_URL
        };
    }
};

// Export for use in main.js
window.CONFIG = CONFIG;

console.log('[CONFIG] Loaded:', CONFIG.getStatus());
