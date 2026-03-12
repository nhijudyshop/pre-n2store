/**
 * Orders Report App - ES Module Entry Point
 * Main entry point that imports all modules and initializes the app
 *
 * Usage in HTML:
 * <script type="module" src="js/app.js"></script>
 */

// =====================================================
// IMPORTS FROM SHARED LIBRARY
// =====================================================

import {
    // Fetch utilities
    delay,
    fetchWithTimeout,
    fetchWithRetry,
    simpleFetch,
    safeFetch,
    SmartFetchManager,
    createSmartFetch,

    // API endpoints
    API_ENDPOINTS,

    // CORS
    CORS_HEADERS,

    // Facebook
    FACEBOOK_CONFIG,

    // Storage
    IndexedDBStorage,
    createIndexedDBStorage,
    isIndexedDBSupported,
    CacheManager,
    createCacheManager,

    // Token managers
    TokenManager,
    PancakeTokenManager,
} from '../../shared/browser/index.js';

// =====================================================
// IMPORTS FROM LOCAL MODULES
// =====================================================

import {
    API_CONFIG,
    getCurrentServerURL,
    CONFIG,
    APP_CONFIG,
    initFirebase,
    authManager,
    isAuthenticated,
    NotificationSystem,
    showNotification,
    showToast,
    showLoading,
    hideLoading,
} from './modules/core/index.js';

// =====================================================
// CREATE INSTANCES
// =====================================================

// Storage instances
const indexedDBStorage = createIndexedDBStorage('N2StoreDB', 1);
const cacheManager = createCacheManager({
    storageKey: 'livestream_persistent_cache',
    dbName: 'N2StoreDB'
});

// Token manager instances (company-specific key resolved automatically by TokenManager)
const tokenManager = new TokenManager();

const pancakeTokenManager = new PancakeTokenManager();

// =====================================================
// EXPOSE TO WINDOW FOR BACKWARD COMPATIBILITY
// =====================================================

// Shared utilities
window.delay = delay;
window.fetchWithTimeout = fetchWithTimeout;
window.fetchWithRetry = fetchWithRetry;
window.simpleFetch = simpleFetch;
window.safeFetch = safeFetch;
window.SmartFetchManager = SmartFetchManager;

// Storage
window.indexedDBStorage = indexedDBStorage;
window.isIndexedDBSupported = isIndexedDBSupported;
window.cacheManager = cacheManager;
window.CacheManager = CacheManager;
window.IndexedDBStorage = IndexedDBStorage;

// Cache compatibility functions
window.getCachedData = () => cacheManager.get('reports', 'data');
window.setCachedData = (data) => cacheManager.set('reports', data, 'data');
window.invalidateCache = () => cacheManager.clear('data');

// Token managers
window.tokenManager = tokenManager;
window.TokenManager = TokenManager;
window.pancakeTokenManager = pancakeTokenManager;
window.PancakeTokenManager = PancakeTokenManager;

// API Config
window.API_CONFIG = API_CONFIG;
window.getCurrentServerURL = getCurrentServerURL;
window.WORKER_URL = API_CONFIG.WORKER_URL;

// Config
window.CONFIG = CONFIG;
window.APP_CONFIG = APP_CONFIG;

// Auth
window.authManager = authManager;
window.isAuthenticated = isAuthenticated;

// Notifications
window.notificationManager = NotificationSystem;
window.NotificationSystem = NotificationSystem;
window.showNotification = showNotification;
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;

// Facebook constants
window.FACEBOOK_CONFIG = FACEBOOK_CONFIG;

// =====================================================
// APP INITIALIZATION
// =====================================================

async function initApp() {
    console.log('[APP] Initializing Orders Report App (ES Modules)...');

    try {
        // Wait for storage to be ready
        await indexedDBStorage.readyPromise;
        console.log('[APP] IndexedDB ready');

        // Wait for cache manager
        await cacheManager.initStorage();
        console.log('[APP] CacheManager ready');

        // Initialize Firebase (requires SDK loaded via script tag)
        if (typeof firebase !== 'undefined') {
            initFirebase();
            console.log('[APP] Firebase initialized');
        }

        // Initialize token manager
        await tokenManager.init();
        console.log('[APP] TokenManager ready');

        // Initialize Pancake token manager
        await pancakeTokenManager.initialize();
        console.log('[APP] PancakeTokenManager ready');

        // Dispatch ready event
        window.dispatchEvent(new CustomEvent('appReady', {
            detail: {
                indexedDBStorage,
                cacheManager,
                tokenManager,
                pancakeTokenManager,
                API_CONFIG
            }
        }));

        console.log('[APP] App initialized successfully');
        return true;
    } catch (error) {
        console.error('[APP] Initialization failed:', error);
        return false;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// =====================================================
// EXPORTS
// =====================================================

export {
    // Shared
    delay,
    fetchWithTimeout,
    fetchWithRetry,
    simpleFetch,
    safeFetch,
    SmartFetchManager,
    createSmartFetch,
    API_ENDPOINTS,
    CORS_HEADERS,
    FACEBOOK_CONFIG,

    // Storage
    indexedDBStorage,
    cacheManager,
    IndexedDBStorage,
    CacheManager,
    createIndexedDBStorage,
    createCacheManager,
    isIndexedDBSupported,

    // Token managers
    tokenManager,
    pancakeTokenManager,
    TokenManager,
    PancakeTokenManager,

    // Local
    API_CONFIG,
    getCurrentServerURL,
    CONFIG,
    APP_CONFIG,
    authManager,
    isAuthenticated,
    NotificationSystem,
    showNotification,
    showToast,
    showLoading,
    hideLoading,

    // Init function
    initApp,
};

export default {
    indexedDBStorage,
    cacheManager,
    tokenManager,
    pancakeTokenManager,
    API_CONFIG,
    CONFIG,
    authManager,
    NotificationSystem,
};
