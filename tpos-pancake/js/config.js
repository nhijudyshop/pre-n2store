// js/config.js - Configuration & Firebase Setup

// Firebase is initialized by ../shared/js/firebase-config.js (loaded in index.html)

// Application Configuration
const APP_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 50,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Get Firebase instances from shared config (already initialized by shared/js/firebase-config.js)
const app = firebase.app();
const db = getFirestore();
const database = getRealtimeDB(); // Realtime Database for Pancake accounts
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("livestream_reports");
const historyCollectionRef = db.collection("edit_history");

// DOM Elements
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
