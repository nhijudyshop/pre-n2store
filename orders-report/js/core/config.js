// js/config.js - Configuration & Firebase Setup

// Application Configuration
const APP_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 50,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Firebase config - use shared config (loaded via shared/js/firebase-config.js)
// FIREBASE_CONFIG and firebaseConfig are provided by shared/js/firebase-config.js

// Global Firebase references
let app = null;
let db = null;
let storageRef = null;
let collectionRef = null;
let historyCollectionRef = null;

// Initialize Firebase function
function initializeFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn('[Config] Firebase SDK not loaded yet');
        return false;
    }

    // Get config from shared library (FIREBASE_CONFIG from shared/js/firebase-config.js)
    const config = (typeof FIREBASE_CONFIG !== 'undefined') ? FIREBASE_CONFIG
        : (typeof firebaseConfig !== 'undefined') ? firebaseConfig
        : null;

    if (!config) {
        console.warn('[Config] No Firebase config found. Ensure shared/js/firebase-config.js is loaded.');
        return false;
    }

    try {
        // Initialize Firebase app
        app = !firebase.apps.length ? firebase.initializeApp(config) : firebase.app();

        // Safely initialize Firestore
        if (firebase.firestore) {
            try {
                db = firebase.firestore();
                collectionRef = db.collection("livestream_reports");
                historyCollectionRef = db.collection("edit_history");
            } catch (e) {
                console.warn("[Config] Error initializing Firestore:", e);
            }
        }

        // Safely initialize Storage
        if (firebase.storage) {
            try {
                storageRef = firebase.storage().ref();
            } catch (e) {
                console.warn("[Config] Error initializing Storage:", e);
            }
        }

        // Export to window
        window.db = db;
        window.collectionRef = collectionRef;
        window.historyCollectionRef = historyCollectionRef;
        window.storageRef = storageRef;

        console.log('[Config] Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('[Config] Firebase init error:', error);
        return false;
    }
}

// Try to initialize immediately if Firebase is available
if (typeof firebase !== 'undefined') {
    initializeFirebase();
} else {
    // Wait for Firebase SDK to load
    console.log('[Config] Waiting for Firebase SDK...');
    window.addEventListener('DOMContentLoaded', () => {
        if (!initializeFirebase()) {
            // Retry after a short delay
            setTimeout(initializeFirebase, 500);
        }
    });
}

// DOM Elements - Safely get elements if they exist
const livestreamForm = document.getElementById("livestreamForm");
const tableBody = document.getElementById("tableBody");
const toggleFormButton = document.getElementById("toggleFormButton");
const dataForm = document.getElementById("dataForm");
const ngayLive = document.getElementById("ngayLive");
const editModal = document.getElementById("editModal");

// Global Variables
let editingRow = null;
let arrayData = [];
let arrayDate = [];
let currentFilters = {
    startDate: null,
    endDate: null,
    status: "all",
};
let filterTimeout = null;
let isFilteringInProgress = false;
let filteredDataForTotal = [];

// Export for global access
window.APP_CONFIG = APP_CONFIG;
window.db = db;
window.collectionRef = collectionRef;
window.historyCollectionRef = historyCollectionRef;
