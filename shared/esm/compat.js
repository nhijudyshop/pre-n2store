/**
 * Backward Compatibility Layer
 *
 * This module imports ES modules and exports to window.* for backward compatibility.
 * Use this for pages transitioning from script tags to ES modules.
 *
 * Usage in HTML:
 * <script type="module" src="../shared/esm/compat.js"></script>
 *
 * @module shared/esm/compat
 */

// Import all from browser modules
import {
    // Auth
    AuthManager,
    AUTH_CONFIG,
    createAuthManager,
    getAuthManager,
    isAuthenticated,
    getRoleInfo,

    // Cache
    PersistentCacheManager,
    CACHE_CONFIG,
    createPersistentCache,
    getPersistentCache,
    CacheManager,
    createCacheManager,

    // IndexedDB
    IndexedDBStorage,
    createIndexedDBStorage,
    isIndexedDBSupported,

    // Notification
    NotificationManager,
    NOTIFICATION_CONFIG,
    getNotificationManager,
    createNotificationManager,

    // Firebase
    FIREBASE_CONFIG,
    firebaseConfig,
    initializeFirebaseApp,
    initializeFirestore,
    initializeRealtimeDB,
    getFirestore,
    getRealtimeDB,
    isFirebaseInitialized,

    // Logger
    Logger,
    logger,
    createLogger,

    // DOM Utils
    DOMUtils,
    $,
    $$,
    on,
    once,
    show,
    hide,
    toggleClass,
    hasClass,
    createElement,
    appendChild,
    clearChildren,
    setText,
    setHTML,
    sanitizeHTML,
    escapeHTML,
    unescapeHTML,

    // Common Utils
    CommonUtils,
    showStatusMessage,
    showFloatingAlert,
    hideFloatingAlert,
    showLoading,
    showSuccess,
    showError,
    blockPageInteractions,
    unblockPageInteractions,

    // Date Utils
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

    // Form Utils
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

    // Token Managers
    TokenManager,
    PancakeTokenManager,
} from '../browser/index.js';

// Export to window for backward compatibility
if (typeof window !== 'undefined') {
    // Classes
    window.AuthManager = AuthManager;
    window.PersistentCacheManager = PersistentCacheManager;
    window.CacheManager = CacheManager;
    window.IndexedDBStorage = IndexedDBStorage;
    window.NotificationManager = NotificationManager;
    window.Logger = Logger;
    window.DOMUtils = DOMUtils;
    window.CommonUtils = CommonUtils;
    window.DateUtils = DateUtils;
    window.FormUtils = FormUtils;
    window.TokenManager = TokenManager;
    window.PancakeTokenManager = PancakeTokenManager;

    // Config objects
    window.AUTH_CONFIG = AUTH_CONFIG;
    window.CACHE_CONFIG = CACHE_CONFIG;
    window.NOTIFICATION_CONFIG = NOTIFICATION_CONFIG;
    window.FIREBASE_CONFIG = FIREBASE_CONFIG;
    window.firebaseConfig = firebaseConfig;

    // Factory functions
    window.createAuthManager = createAuthManager;
    window.getAuthManager = getAuthManager;
    window.createPersistentCache = createPersistentCache;
    window.getPersistentCache = getPersistentCache;
    window.createCacheManager = createCacheManager;
    window.createIndexedDBStorage = createIndexedDBStorage;
    window.isIndexedDBSupported = isIndexedDBSupported;
    window.getNotificationManager = getNotificationManager;
    window.createNotificationManager = createNotificationManager;
    window.createLogger = createLogger;

    // Auth helpers
    window.isAuthenticated = isAuthenticated;
    window.getRoleInfo = getRoleInfo;

    // Firebase helpers
    window.initializeFirebaseApp = initializeFirebaseApp;
    window.initializeFirestore = initializeFirestore;
    window.initializeRealtimeDB = initializeRealtimeDB;
    window.getFirestore = getFirestore;
    window.getRealtimeDB = getRealtimeDB;
    window.isFirebaseInitialized = isFirebaseInitialized;

    // DOM Utils functions
    window.$ = $;
    window.$$ = $$;
    window.on = on;
    window.once = once;
    window.show = show;
    window.hide = hide;
    window.toggleClass = toggleClass;
    window.hasClass = hasClass;
    window.createElement = createElement;
    window.appendChild = appendChild;
    window.clearChildren = clearChildren;
    window.setText = setText;
    window.setHTML = setHTML;
    window.sanitizeHTML = sanitizeHTML;
    window.escapeHTML = escapeHTML;
    window.unescapeHTML = unescapeHTML;

    // Common Utils functions
    window.showStatusMessage = showStatusMessage;
    window.showFloatingAlert = showFloatingAlert;
    window.hideFloatingAlert = hideFloatingAlert;
    window.showLoading = showLoading;
    window.showSuccess = showSuccess;
    window.showError = showError;
    window.blockPageInteractions = blockPageInteractions;
    window.unblockPageInteractions = unblockPageInteractions;

    // Date Utils functions
    window.formatDate = formatDate;
    window.formatDateTime = formatDateTime;
    window.getFormattedDateTime = getFormattedDateTime;
    window.parseVietnameseDate = parseVietnameseDate;
    window.getTodayVN = getTodayVN;
    window.getCurrentDateForInput = getCurrentDateForInput;
    window.formatDateForInput = formatDateForInput;
    window.formatDateFromInput = formatDateFromInput;
    window.compareDates = compareDates;
    window.convertToTimestamp = convertToTimestamp;
    window.numberWithCommas = numberWithCommas;

    // Form Utils functions
    window.sanitizeInput = sanitizeInput;
    window.generateUniqueID = generateUniqueID;
    window.generateUniqueFileName = generateUniqueFileName;
    window.debounce = debounce;
    window.throttle = throttle;
    window.copyToClipboard = copyToClipboard;
    window.exportToCSV = exportToCSV;
    window.isValidEmail = isValidEmail;
    window.isValidPhone = isValidPhone;
    window.getInputValue = getInputValue;
    window.setInputValue = setInputValue;

    // Logger instance
    window.logger = logger;

    // Auto-initialize authManager if not already defined
    if (!window.authManager && AuthManager) {
        try {
            const authManager = new AuthManager({
                redirectUrl: '../index.html',
                sessionDuration: 8 * 60 * 60 * 1000,  // 8 hours
                rememberDuration: 30 * 24 * 60 * 60 * 1000  // 30 days
            });
            window.authManager = authManager;
            console.log('[ESM Compat] AuthManager auto-initialized');
        } catch (e) {
            console.warn('[ESM Compat] Failed to auto-init AuthManager:', e);
        }
    }

    // Auto-initialize notificationManager if not already defined
    if (!window.notificationManager && getNotificationManager) {
        try {
            window.notificationManager = getNotificationManager();
            console.log('[ESM Compat] NotificationManager auto-initialized');
        } catch (e) {
            console.warn('[ESM Compat] Failed to auto-init NotificationManager:', e);
        }
    }

    // Dispatch event to signal modules are loaded
    window.dispatchEvent(new CustomEvent('sharedModulesLoaded'));

    console.log('[ESM Compat] All shared modules loaded and exported to window');
}
