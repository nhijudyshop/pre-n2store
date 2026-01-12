// =====================================================
// BALANCE HISTORY - CONFIGURATION
// Cấu hình API endpoint cho trang lịch sử biến động số dư
// =====================================================

const CONFIG = {
    // API Base URL - Thay đổi theo môi trường triển khai
    API_BASE_URL: 'https://chatomni-proxy.nhijudyshop.workers.dev',

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
