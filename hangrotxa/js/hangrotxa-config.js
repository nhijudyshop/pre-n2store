// =====================================================
// CONFIGURATION & INITIALIZATION
// File 1/6: hangrotxa-config.js
// =====================================================

// Cache configuration
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;
const MAX_VISIBLE_ROWS = 500;
const FILTER_DEBOUNCE_DELAY = 300;

// Firebase metadata - OPTIMIZED FOR FASTER UPLOADS
var optimizedMetadata = {
    cacheControl: "public,max-age=31536000,immutable",
    contentType: "image/jpeg",
};

// Legacy metadata (kept for compatibility)
var newMetadata = {
    cacheControl: "public,max-age=31536000",
};

// Firebase config - use shared config (loaded via shared/js/firebase-config.js)
// FIREBASE_CONFIG and firebaseConfig are provided by shared/js/firebase-config.js

// Get Firebase config (from shared/js/firebase-config.js)
const _fbConfig = (typeof FIREBASE_CONFIG !== 'undefined') ? FIREBASE_CONFIG
    : (typeof firebaseConfig !== 'undefined') ? firebaseConfig
    : null;

// Initialize Firebase
const app = !firebase.apps.length ? firebase.initializeApp(_fbConfig) : firebase.app();
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("hangrotxa");
const historyCollectionRef = db.collection("edit_history");

// Notification Manager
let notificationManager;

// DOM Elements
const tbody = document.getElementById("productTableBody");
const inputFileRadio = document.getElementById("inputFile");
const inputLinkRadio = document.getElementById("inputLink");
const inputClipboardRadio = document.getElementById("inputClipboard");
const inputFileContainer = document.getElementById("inputFileContainer");
const inputLinkContainer = document.getElementById("inputLinkContainer");
const inputClipboardContainer = document.getElementById("container");
const hinhAnhInputFile = document.getElementById("hinhAnhInputFile");
const hinhAnhContainer = document.getElementById("hinhAnhContainer");
const dotLiveInput = document.getElementById("dotLive");
const dateFilterDropdown = document.getElementById("dateFilter");
const filterCategorySelect = document.getElementById("filterCategory");
const dataForm = document.getElementById("dataForm");
const searchInput = document.getElementById("searchInput");

// Global variables
var imageUrlFile = [];
var imgArray = [];
let searchFilter = "";
let filterTimeout = null;

// Export for other modules
window.HangRotXaConfig = {
    firebaseConfig: _fbConfig,
    CACHE_EXPIRY,
    BATCH_SIZE,
    MAX_VISIBLE_ROWS,
    FILTER_DEBOUNCE_DELAY,
    optimizedMetadata, // NEW: Optimized for speed
    newMetadata,
    app,
    db,
    storageRef,
    collectionRef,
    historyCollectionRef,
    notificationManager: null,
    imageUrlFile,
    imgArray,
    searchFilter,
    filterTimeout,
    // DOM elements
    tbody,
    inputFileRadio,
    inputLinkRadio,
    inputClipboardRadio,
    inputFileContainer,
    inputLinkContainer,
    inputClipboardContainer,
    hinhAnhInputFile,
    hinhAnhContainer,
    dotLiveInput,
    dateFilterDropdown,
    filterCategorySelect,
    dataForm,
    searchInput,
};
