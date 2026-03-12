/**
 * Application Configuration - ES Module
 * Firebase setup and app configuration
 */

// Firebase Configuration - import from shared library (source of truth)
import { FIREBASE_CONFIG, firebaseConfig as _sharedFirebaseConfig } from '/shared/browser/firebase-config.js';

// Re-export for backward compatibility
export const firebaseConfig = _sharedFirebaseConfig;

// Application Configuration
export const CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 50,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Alias for backward compatibility
export const APP_CONFIG = CONFIG;

// Firebase instances (initialized after SDK loads)
let firebaseApp = null;
let db = null;
let storageRef = null;
let realtimeDb = null;

/**
 * Initialize Firebase
 * Call this after Firebase SDK is loaded via script tag
 */
export function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn('[CONFIG] Firebase SDK not loaded yet');
        return false;
    }

    if (!firebase.apps.length) {
        firebaseApp = firebase.initializeApp(firebaseConfig);
    } else {
        firebaseApp = firebase.app();
    }

    // Initialize Firestore
    try {
        if (firebase.firestore) {
            db = firebase.firestore();
        }
    } catch (e) {
        console.warn('[CONFIG] Firestore init error:', e);
    }

    // Initialize Storage
    try {
        if (firebase.storage) {
            storageRef = firebase.storage().ref();
        }
    } catch (e) {
        console.warn('[CONFIG] Storage init error:', e);
    }

    // Initialize Realtime Database
    try {
        if (firebase.database) {
            realtimeDb = firebase.database();
        }
    } catch (e) {
        console.warn('[CONFIG] Realtime DB init error:', e);
    }

    console.log('[CONFIG] Firebase initialized');
    return true;
}

/**
 * Get Firestore instance
 */
export function getFirestore() {
    return db;
}

/**
 * Get Realtime Database instance
 */
export function getRealtimeDb() {
    return realtimeDb;
}

/**
 * Get Storage reference
 */
export function getStorageRef() {
    return storageRef;
}

/**
 * Get collection reference
 */
export function getCollection(name) {
    if (!db) return null;
    return db.collection(name);
}

// Collection shortcuts
export const getCollectionRef = () => getCollection("livestream_reports");
export const getHistoryCollectionRef = () => getCollection("edit_history");

// Global state (for backward compatibility during migration)
export const globalState = {
    editingRow: null,
    arrayData: [],
    arrayDate: [],
    currentFilters: {
        startDate: null,
        endDate: null,
        status: "all",
    },
    filterTimeout: null,
    isFilteringInProgress: false,
    filteredDataForTotal: [],
};

console.log('[CONFIG] ES Module loaded');

export default CONFIG;
