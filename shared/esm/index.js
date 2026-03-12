/**
 * Shared ES Modules - Main Entry Point
 *
 * This is the recommended entry point for ES module imports.
 * It re-exports all modules from browser/ and universal/.
 *
 * Usage:
 * import { AuthManager, formatDate, debounce } from '../shared/esm/index.js';
 *
 * @module shared/esm
 */

// Re-export everything from browser modules (includes universal)
export * from '../browser/index.js';

// Named re-exports for common use cases
export {
    // Auth
    AuthManager,
    createAuthManager,
    getAuthManager,
    isAuthenticated,

    // Cache
    PersistentCacheManager,
    CacheManager,

    // Notification
    NotificationManager,
    getNotificationManager,

    // Firebase
    FIREBASE_CONFIG,
    firebaseConfig,
    initializeFirebaseApp,
    initializeFirestore,
    initializeRealtimeDB,

    // Date Utils
    formatDate,
    formatDateTime,
    parseVietnameseDate,
    numberWithCommas,

    // Form Utils
    debounce,
    throttle,
    sanitizeInput,
    copyToClipboard,

    // DOM Utils
    $,
    $$,
    show,
    hide,

    // Fetch Utils (from universal)
    fetchWithRetry,
    fetchWithTimeout,
    delay,
} from '../browser/index.js';
