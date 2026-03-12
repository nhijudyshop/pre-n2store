// =====================================================
// BALANCE HISTORY - CONFIGURATION
// Cấu hình API endpoint cho trang lịch sử biến động số dư
// =====================================================

// Import centralized API endpoints if available, fallback to hardcoded
const API_BASE_URL_DEFAULT = 'https://chatomni-proxy.nhijudyshop.workers.dev';

const CONFIG = {
    // API Base URL - Use centralized config if available
    get API_BASE_URL() {
        // Try to get from centralized API_ENDPOINTS
        if (typeof window.API_ENDPOINTS !== 'undefined' && window.API_ENDPOINTS.WORKER) {
            return window.API_ENDPOINTS.WORKER.URL;
        }
        return API_BASE_URL_DEFAULT;
    },

    // Hoặc sử dụng Render.com trực tiếp
    // API_BASE_URL: 'https://n2store-fallback.onrender.com',

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
    CURRENCY_LOCALE: 'vi-VN'
};

// Export for use in main.js
window.CONFIG = CONFIG;
