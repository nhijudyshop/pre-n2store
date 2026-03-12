// =====================================================
// CONFIGURATION & CONSTANTS
// =====================================================

// Application Constants
const APP_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Global Variables
let globalState = {
    inventoryData: [],
    filteredData: [],
    isLoading: false,
    currentFilters: {
        supplier: "all",
        dateFrom: "",
        dateTo: "",
        product: "",
    },
};

// Firebase references (initialized later)
let app = null;
let db = null;
let collectionRef = null;
let historyCollectionRef = null;

// Firebase config - use shared config (loaded via shared/js/firebase-config.js)
// FIREBASE_CONFIG and firebaseConfig are provided by shared/js/firebase-config.js

// Initialize Firebase
function initializeFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn('[Config] Firebase SDK not loaded');
        return false;
    }

    const config = (typeof FIREBASE_CONFIG !== 'undefined') ? FIREBASE_CONFIG
        : (typeof firebaseConfig !== 'undefined') ? firebaseConfig
        : null;

    if (!config) {
        console.warn('[Config] No Firebase config found. Ensure shared/js/firebase-config.js is loaded.');
        return false;
    }

    try {
        app = !firebase.apps.length ? firebase.initializeApp(config) : firebase.app();
        db = firebase.firestore();
        collectionRef = db.collection("dathang");
        historyCollectionRef = db.collection("edit_history");

        // Export to window
        window.db = db;
        window.collectionRef = collectionRef;
        window.historyCollectionRef = historyCollectionRef;

        console.log('[Config] Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('[Config] Firebase init error:', error);
        return false;
    }
}

// Try initialize immediately
if (!initializeFirebase()) {
    // Wait for shared modules to load
    window.addEventListener('sharedModulesLoaded', initializeFirebase);
}

// Export to window
window.APP_CONFIG = APP_CONFIG;
window.globalState = globalState;

console.log("[Config] Configuration loaded");
