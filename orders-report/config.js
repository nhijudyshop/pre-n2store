// js/config.js - Configuration & Firebase Setup

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Application Configuration
const APP_CONFIG = {
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 50,
    MAX_VISIBLE_ROWS: 500,
    FILTER_DEBOUNCE_DELAY: 500,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const app = firebase.app(); // Get the default app

// Safely initialize services
const db = (function () {
    try {
        if (firebase.firestore) {
            return firebase.firestore();
        }
        console.warn("Firestore SDK not loaded");
        return null;
    } catch (e) {
        console.warn("Error initializing Firestore:", e);
        return null;
    }
})();

const storageRef = (function () {
    try {
        if (firebase.storage) {
            return firebase.storage().ref();
        }
        return null;
    } catch (e) {
        return null;
    }
})();

const collectionRef = db ? db.collection("livestream_reports") : null;
const historyCollectionRef = db ? db.collection("edit_history") : null;

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
