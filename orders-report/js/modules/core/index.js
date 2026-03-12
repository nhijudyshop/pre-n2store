/**
 * Core Modules - ES Module Index
 * Re-exports all core modules for easy importing
 */

// API Configuration
export {
    API_CONFIG,
    getCurrentServerURL,
    default as apiConfig,
} from './api-config.js';

// App Configuration
export {
    CONFIG,
    APP_CONFIG,
    firebaseConfig,
    initFirebase,
    getFirestore,
    getRealtimeDb,
    getStorageRef,
    getCollection,
    getCollectionRef,
    getHistoryCollectionRef,
    globalState,
    default as config,
} from './config.js';

// Authentication
export {
    AuthManager,
    authManager,
    isAuthenticated,
    hasPermission,
    getAuthState,
    getUserName,
    getUserId,
    logout,
    requireAuth,
    default as auth,
} from './auth.js';

// Notifications
export {
    NotificationManager,
    NotificationSystem,
    showNotification,
    showToast,
    showLoading,
    hideLoading,
    showConfirm,
    default as notifications,
} from './notification-system.js';

console.log('[CORE] All core modules loaded');
