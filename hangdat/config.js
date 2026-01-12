// =====================================================
// OPTIMIZED CONFIGURATION FOR FASTER UPLOADS
// =====================================================

const CONFIG = {
    // Firebase Configuration
    firebase: {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D",
    },

    // Cache Settings
    cache: {
        expiry: 24 * 60 * 60 * 1000,
        batchSize: 50,
        maxVisibleRows: 500,
        filterDebounceDelay: 300,
    },

    // OPTIMIZED: More aggressive compression for faster uploads
    performance: {
        imageCompression: {
            thumbnail: {
                maxWidth: 200,
                maxHeight: 200,
                quality: 0.5,
            },
            preview: {
                maxWidth: 400,
                maxHeight: 400,
                quality: 0.6,
            },
            storage: {
                maxWidth: 800, // Giảm từ 1200
                maxHeight: 800, // Giảm từ 1200
                quality: 0.6, // Giảm từ 0.75
            },
        },
        upload: {
            maxConcurrent: 3, // Upload tối đa 3 ảnh cùng lúc
            timeout: 60000,
            retryAttempts: 2,
        },
        lazyLoadOffset: 100,
        virtualScrollThreshold: 100,
        useWebP: false,
    },

    // UI Settings
    ui: {
        animationDuration: 300,
        toastDuration: 3000,
        hoverDelay: 150,
        showUploadProgress: true,
        showCompressionProgress: true,
    },
};

// Application Constants
const APP_CONFIG = {
    CACHE_EXPIRY: CONFIG.cache.expiry,
    MAX_VISIBLE_ROWS: CONFIG.cache.maxVisibleRows,
    FILTER_DEBOUNCE_DELAY: CONFIG.cache.filterDebounceDelay,
    AUTH_STORAGE_KEY: "loginindex_auth",
};

// Storage metadata for optimized caching
const STORAGE_METADATA = {
    contentType: "image/jpeg",
    cacheControl: "public,max-age=31536000",
    customMetadata: {
        compressed: "true",
        quality: "0.6",
    },
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

// Initialize Firebase
const app = firebase.initializeApp(CONFIG.firebase);
const db = firebase.firestore();
const collectionRef = db.collection("dathang");
const historyCollectionRef = db.collection("edit_history");

// Export for use in other modules
window.CONFIG = CONFIG;
window.STORAGE_METADATA = STORAGE_METADATA;

console.log("Configuration loaded successfully");
