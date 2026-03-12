// =====================================================
// CONFIGURATION & CONSTANTS
// =====================================================

const CONFIG = {
    // Firebase Configuration - loaded via shared/js/firebase-config.js
    firebase: window.FIREBASE_CONFIG || {},

    // Cache Settings
    cache: {
        expiry: 24 * 60 * 60 * 1000,
        batchSize: 50,
        maxVisibleRows: 500,
        filterDebounceDelay: 300, // Reduced for better responsiveness
    },

    // Performance Settings
    performance: {
        imageCompression: {
            maxWidth: 800, // Increased for better quality
            quality: 0.85, // Improved quality
        },
        lazyLoadOffset: 100,
        virtualScrollThreshold: 100,
    },

    // Categories
    categories: {
        ALL: "all",
        AO: "Áo",
        QUAN: "Quần",
        SET_DAM: "Set và Đầm",
        PKGD: "PKGD",
    },

    // Storage Keys
    storage: {
        authKey: "loginindex_auth",
    },

    // UI Settings
    ui: {
        animationDuration: 300,
        toastDuration: 3000,
        hoverDelay: 200,
    },
};

// File metadata for Firebase storage
const STORAGE_METADATA = {
    cacheControl: "public,max-age=31536000",
};

// Export for use in other modules
window.CONFIG = CONFIG;
window.STORAGE_METADATA = STORAGE_METADATA;
