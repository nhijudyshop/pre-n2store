// =====================================================
// CONFIGURATION & INITIALIZATION
// File 1/6: hangrotxa-config.js
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

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

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
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
    firebaseConfig,
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
