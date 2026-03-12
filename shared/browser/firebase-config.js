/**
 * Firebase Configuration & Initialization - ES Module (SOURCE OF TRUTH)
 *
 * Provides centralized Firebase config and initialization functions
 * for both Firestore and Realtime Database.
 *
 * @module shared/browser/firebase-config
 *
 * Usage:
 * ```javascript
 * import { FIREBASE_CONFIG, initializeFirestore, initializeRealtimeDB } from '/shared/browser/firebase-config.js';
 *
 * // For Firestore (inventory, etc.)
 * const db = initializeFirestore();
 *
 * // For Realtime Database (soluong-live, order-management, issue-tracking)
 * const rtdb = initializeRealtimeDB();
 * ```
 */

// =====================================================
// FIREBASE CONFIGURATION
// =====================================================

/**
 * Firebase configuration object
 * @constant {Object}
 */
export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Alias for backward compatibility
export const firebaseConfig = FIREBASE_CONFIG;

// =====================================================
// STATE TRACKING
// =====================================================

let _firestoreDB = null;
let _realtimeDB = null;
let _isFirebaseInitialized = false;
let _isFirestoreInitialized = false;
let _isRealtimeDBInitialized = false;

// =====================================================
// CORE INITIALIZATION
// =====================================================

/**
 * Initialize Firebase app (core)
 * Called automatically by initializeFirestore() and initializeRealtimeDB()
 * @returns {boolean} - Success status
 */
export function initializeFirebaseApp() {
    try {
        if (typeof firebase === 'undefined') {
            console.error('[Firebase] SDK not loaded');
            return false;
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
            console.log('[Firebase] App initialized');
        }

        _isFirebaseInitialized = true;
        return true;
    } catch (error) {
        console.error('[Firebase] Initialization error:', error);
        return false;
    }
}

// =====================================================
// FIRESTORE INITIALIZATION
// =====================================================

/**
 * Initialize Firestore with offline persistence
 * @param {Object} options - Configuration options
 * @param {boolean} options.enablePersistence - Enable offline persistence (default: true)
 * @param {boolean} options.synchronizeTabs - Sync across tabs (default: true)
 * @returns {Object|null} - Firestore database instance or null on failure
 */
export function initializeFirestore(options = {}) {
    const { enablePersistence = true, synchronizeTabs = true } = options;

    if (_firestoreDB) {
        return _firestoreDB;
    }

    // Reuse instance from script-tag version if already initialized
    if (typeof window !== 'undefined' && window.db && window.db.collection) {
        _firestoreDB = window.db;
        _isFirestoreInitialized = true;
        return _firestoreDB;
    }

    if (!initializeFirebaseApp()) {
        return null;
    }

    try {
        _firestoreDB = firebase.firestore();

        if (enablePersistence) {
            try {
                _firestoreDB.enablePersistence({ synchronizeTabs })
                    .then(() => {
                        console.log('[Firestore] Offline persistence enabled');
                    })
                    .catch((err) => {
                        if (err.code === 'failed-precondition') {
                            console.warn('[Firestore] Multiple tabs open, persistence in first tab only');
                        } else if (err.code === 'unimplemented') {
                            console.warn('[Firestore] Browser does not support persistence');
                        }
                    });
            } catch (e) {
                console.warn('[Firestore] Persistence already enabled or unavailable');
            }
        }

        _isFirestoreInitialized = true;
        console.log('[Firestore] Initialized successfully');

        // Set global for legacy compatibility
        if (typeof window !== 'undefined') {
            window.db = _firestoreDB;
        }

        return _firestoreDB;
    } catch (error) {
        console.error('[Firestore] Initialization error:', error);
        return null;
    }
}

// =====================================================
// REALTIME DATABASE INITIALIZATION
// =====================================================

/**
 * Initialize Firebase Realtime Database
 * @returns {Object|null} - Realtime Database instance or null on failure
 */
export function initializeRealtimeDB() {
    if (_realtimeDB) {
        return _realtimeDB;
    }

    if (!initializeFirebaseApp()) {
        return null;
    }

    try {
        _realtimeDB = firebase.database();
        _isRealtimeDBInitialized = true;
        console.log('[RealtimeDB] Initialized successfully');

        return _realtimeDB;
    } catch (error) {
        console.error('[RealtimeDB] Initialization error:', error);
        return null;
    }
}

// =====================================================
// GETTERS & UTILITIES
// =====================================================

/**
 * Get Firestore instance (initializes if needed)
 * @returns {Object|null}
 */
export function getFirestore() {
    return _firestoreDB || initializeFirestore();
}

/**
 * Get Realtime Database instance (initializes if needed)
 * @returns {Object|null}
 */
export function getRealtimeDB() {
    return _realtimeDB || initializeRealtimeDB();
}

/**
 * Check if Firebase app is initialized
 * @returns {boolean}
 */
export function isFirebaseInitialized() {
    return _isFirebaseInitialized;
}

/**
 * Check if Firestore is initialized
 * @returns {boolean}
 */
export function isFirestoreInitialized() {
    return _isFirestoreInitialized;
}

/**
 * Check if Realtime Database is initialized
 * @returns {boolean}
 */
export function isRealtimeDBInitialized() {
    return _isRealtimeDBInitialized;
}

// =====================================================
// REALTIME DATABASE HELPERS
// =====================================================

/**
 * Get a reference to a path in Realtime Database
 * @param {string} path - Database path
 * @returns {Object|null} - Database reference or null
 */
export function getRef(path) {
    const db = getRealtimeDB();
    if (!db) return null;
    return db.ref(path);
}

/**
 * Create a helper factory for a specific root path
 * Used by modules like soluong-live (soluongProducts) and order-management (orderProducts)
 *
 * @param {string} rootPath - Root path in database (e.g., 'soluongProducts', 'orderProducts')
 * @returns {Object} - Object with ref() and metaRef() methods
 *
 * @example
 * const helper = createPathHelper('soluongProducts');
 * const productRef = helper.ref('product_123');
 * const metaRef = helper.metaRef('sortedIds');
 */
export function createPathHelper(rootPath) {
    return {
        ref: (subPath = '') => getRef(subPath ? `${rootPath}/${subPath}` : rootPath),
        metaRef: (subPath = '') => getRef(subPath ? `${rootPath}Meta/${subPath}` : `${rootPath}Meta`),
        rootPath,
    };
}

// =====================================================
// COMMON COLLECTION NAMES
// =====================================================

/**
 * Firestore collection names
 */
export const FIRESTORE_COLLECTIONS = {
    INVENTORY: 'inventory',
    LOGS: 'logs',
    SETTINGS: 'settings',
};

/**
 * Realtime Database paths
 */
export const RTDB_PATHS = {
    SOLUONG_PRODUCTS: 'soluongProducts',
    SOLUONG_META: 'soluongProductsMeta',
    ORDER_PRODUCTS: 'orderProducts',
    ORDER_META: 'orderProductsMeta',
    ISSUE_TRACKING: 'issue_tracking',
};

// =====================================================
// DEFAULT EXPORT
// =====================================================

export default {
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
};
