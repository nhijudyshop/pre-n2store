/**
 * Shared Browser Modules
 * Browser-only utilities (localStorage, Firebase, DOM, Auth, Cache)
 *
 * @module shared/browser
 */

// =====================================================
// TOKEN MANAGERS
// =====================================================
export { TokenManager, default as TposTokenManager } from './token-manager.js';
export { PancakeTokenManager } from './pancake-token-manager.js';

// =====================================================
// STORAGE UTILITIES
// =====================================================
export {
    IndexedDBStorage,
    createIndexedDBStorage,
    isIndexedDBSupported,
} from './indexeddb-storage.js';

export {
    CacheManager,
    createCacheManager,
} from './cache-manager.js';

// =====================================================
// AUTHENTICATION
// =====================================================
export {
    AuthManager,
    AUTH_CONFIG,
    createAuthManager,
    getAuthManager,
    isAuthenticated,
} from './auth-manager.js';

// =====================================================
// PERSISTENT CACHE (localStorage-based)
// =====================================================
export {
    PersistentCacheManager,
    CACHE_CONFIG,
    createPersistentCache,
    getPersistentCache,
} from './persistent-cache.js';

// =====================================================
// LOGGER
// =====================================================
export {
    Logger,
    logger,
    isProduction,
    createLogger,
    overrideConsoleInProduction,
} from './logger.js';

// =====================================================
// DOM UTILITIES
// =====================================================
export {
    DOMUtils,
    setText,
    setHTML,
    sanitizeHTML,
    createElement,
    appendChild,
    clearChildren,
    escapeHTML,
    unescapeHTML,
    $,
    $$,
    on,
    once,
    toggleClass,
    hasClass,
    show,
    hide,
    data,
    waitFor,
} from './dom-utils.js';

// =====================================================
// COMMON UI UTILITIES
// =====================================================
export {
    CommonUtils,
    showStatusMessage,
    showFloatingAlert,
    hideFloatingAlert,
    showLoading,
    showSuccess,
    showError,
    isPageBlocked,
    forceUnblockPage,
    blockPageInteractions,
    unblockPageInteractions,
    updateTitleWithRole,
    initializePageTitle,
    displayUserInfo,
    setupClipboardContainers,
    setupFormMonitoring,
    setupSecurityIndicators,
    setupPerformanceMonitoring,
    setupErrorHandling,
    setupCommonEventHandlers,
    initializeCommonUtils,
    injectStyles,
    getRoleInfo,
} from './common-utils.js';

// =====================================================
// FIREBASE
// =====================================================
export {
    FIREBASE_CONFIG,
    firebaseConfig,
    initializeFirebaseApp,
    initializeFirestore,
    initializeRealtimeDB,
    getFirestore,
    getRealtimeDB,
    isFirebaseInitialized,
    isFirestoreInitialized,
    isRealtimeDBInitialized,
    getRef,
    createPathHelper,
    FIRESTORE_COLLECTIONS,
    RTDB_PATHS,
} from './firebase-config.js';

// =====================================================
// NOTIFICATION SYSTEM
// =====================================================
export {
    NotificationManager,
    NOTIFICATION_CONFIG,
    getNotificationManager,
    createNotificationManager,
} from './notification-system.js';

// =====================================================
// DATE UTILITIES
// =====================================================
export {
    DateUtils,
    formatDate,
    formatDateTime,
    getFormattedDateTime,
    parseVietnameseDate,
    getTodayVN,
    getCurrentDateForInput,
    formatDateForInput,
    formatDateFromInput,
    compareDates,
    convertToTimestamp,
    numberWithCommas,
} from './date-utils.js';

// =====================================================
// FORM UTILITIES
// =====================================================
export {
    FormUtils,
    sanitizeInput,
    generateUniqueID,
    generateUniqueFileName,
    debounce,
    throttle,
    copyToClipboard,
    exportToCSV,
    isValidEmail,
    isValidPhone,
    getInputValue,
    setInputValue,
} from './form-utils.js';

// =====================================================
// RE-EXPORT UNIVERSAL MODULES
// =====================================================
export * from '../universal/index.js';
