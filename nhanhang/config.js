// Enhanced Goods Receipt Management System - Configuration
// Firebase config and global constants with NEW CACHE SYSTEM

// =====================================================
// CACHE MANAGER CLASS - PERSISTENT WITH LOCALSTORAGE
// =====================================================

class CacheManager {
    constructor(config = {}) {
        this.cache = new Map();
        ((this.maxAge = config.CACHE_EXPIRY || 24 * 60 * 60 * 1000),
            (this.stats = { hits: 0, misses: 0 }));
        this.storageKey = config.storageKey || "loginindex_cache";
        this.saveTimeout = null;
        this.loadFromStorage();
    }

    saveToStorage() {
        try {
            const cacheData = Array.from(this.cache.entries());
            localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
            console.log(`💾 Đã lưu ${cacheData.length} items vào localStorage`);
        } catch (error) {
            console.warn("Không thể lưu cache:", error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return;

            const cacheData = JSON.parse(stored);
            const now = Date.now();
            let validCount = 0;

            cacheData.forEach(([key, value]) => {
                if (value.expires > now) {
                    this.cache.set(key, value);
                    validCount++;
                }
            });

            console.log(`📦 Đã load ${validCount} items từ localStorage`);
        } catch (error) {
            console.warn("Không thể load cache:", error);
            // Clear corrupted cache
            localStorage.removeItem(this.storageKey);
        }
    }

    debouncedSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToStorage();
        }, 2000);
    }

    set(key, value, type = "general") {
        const cacheKey = `${type}_${key}`;
        this.cache.set(cacheKey, {
            value,
            timestamp: Date.now(),
            expires: Date.now() + this.maxAge,
            type,
        });
        this.debouncedSave();
    }

    get(key, type = "general") {
        const cacheKey = `${type}_${key}`;
        const cached = this.cache.get(cacheKey);

        if (cached && cached.expires > Date.now()) {
            this.stats.hits++;
            console.log(`✔ Cache HIT: ${cacheKey}`);
            return cached.value;
        }

        if (cached) {
            this.cache.delete(cacheKey);
            this.debouncedSave();
        }

        this.stats.misses++;
        console.log(`✗ Cache MISS: ${cacheKey}`);
        return null;
    }

    clear(type = null) {
        if (type) {
            for (const [key, value] of this.cache.entries()) {
                if (value.type === type) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
            localStorage.removeItem(this.storageKey);
        }
        this.stats = { hits: 0, misses: 0 };
        console.log(`🗑️ Cache cleared${type ? ` for type: ${type}` : ""}`);
    }

    cleanExpired() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this.cache.entries()) {
            if (value.expires <= now) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.debouncedSave();
        }
        return cleaned;
    }

    invalidatePattern(pattern) {
        let invalidated = 0;
        for (const [key] of this.cache.entries()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                invalidated++;
            }
        }
        this.debouncedSave();
        console.log(
            `Invalidated ${invalidated} cache entries matching: ${pattern}`,
        );
        return invalidated;
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate =
            total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : 0;

        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`,
            storageSize: this.getStorageSize(),
        };
    }

    getStorageSize() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return "0 KB";
            const sizeKB = (stored.length / 1024).toFixed(2);
            return `${sizeKB} KB`;
        } catch {
            return "N/A";
        }
    }
}

// =====================================================
// CONFIGURATION & INITIALIZATION
// =====================================================

// Initialize new cache system
const dataCache = new CacheManager({
    CACHE_EXPIRY: 24 * 60 * 60 * 1000,
    storageKey: "loginindex_data_cache",
});

// Legacy constants
const BATCH_SIZE = 50;
const MAX_VISIBLE_ROWS = 500;
const FILTER_DEBOUNCE_DELAY = 500;

// UI Configuration
const CONFIG = {
    ui: {
        toastDuration: 3000,
        animationDuration: 300,
        hoverDelay: 500,
    },
};

// Create file metadata
var newMetadata = {
    cacheControl: "public,max-age=31536000",
};

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("nhanhang");
const historyCollectionRef = db.collection("edit_history");

// =====================================================
// DOM ELEMENTS
// =====================================================

// Main elements
const tbody = document.getElementById("receiptTableBody");
const receiptForm = document.getElementById("receiptForm");
const tenNguoiNhanInput = document.getElementById("tenNguoiNhan");
const soKgInput = document.getElementById("soKg");
const soKienInput = document.getElementById("soKien");

// Camera elements
const cameraPreview = document.getElementById("cameraPreview");
const cameraVideo = document.getElementById("cameraVideo");
const cameraCanvas = document.getElementById("cameraCanvas");
const startCameraButton = document.getElementById("startCamera");
const takePictureButton = document.getElementById("takePicture");
const retakePictureButton = document.getElementById("retakePicture");
const imageDisplayArea = document.getElementById("imageDisplayArea");

// Edit modal elements
const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const editReceiptId = document.getElementById("editReceiptId");
const editTenNguoiNhanInput = document.getElementById("editTenNguoiNhan");
const editSoKgInput = document.getElementById("editSoKg");
const editSoKienInput = document.getElementById("editSoKien");
const closeEditModal = document.getElementById("closeEditModal");
const cancelEditButton = document.getElementById("cancelEditButton");
const updateButton = document.getElementById("updateButton");

// Edit camera elements
const editCameraPreview = document.getElementById("editCameraPreview");
const editCameraVideo = document.getElementById("editCameraVideo");
const editCameraCanvas = document.getElementById("editCameraCanvas");
const editStartCameraButton = document.getElementById("editStartCamera");
const editTakePictureButton = document.getElementById("editTakePicture");
const editRetakePictureButton = document.getElementById("editRetakePicture");
const editKeepCurrentImageButton = document.getElementById(
    "editKeepCurrentImage",
);
const editImageDisplayArea = document.getElementById("editImageDisplayArea");
const currentImageContainer = document.getElementById("currentImageContainer");

// Edit file upload elements
const editUploadFileButton = document.getElementById("editUploadFileButton");
const editFileInput = document.getElementById("editFileInput");

// Main form file upload elements
const uploadFileButton = document.getElementById("uploadFileButton");
const fileInput = document.getElementById("fileInput");

// Filter elements
const filterUserSelect = document.getElementById("filterUser");
const dateFilterSelect = document.getElementById("dateFilter");

// =====================================================
// GLOBAL VARIABLES
// =====================================================

// Image handling
var capturedImageUrl = null;
var capturedImageBlob = null;
var editCapturedImageUrl = null;
var editCapturedImageBlob = null;
var editKeepCurrentImage = false;
var editCurrentImageUrl = null;

// Camera streams
var cameraStream = null;
var editCameraStream = null;

// Form state
let editingRow = null;
let currentFilters = {
    user: "all",
    date: "all",
    weight: "",
};
let filterTimeout = null;
let isFilteringInProgress = false;

// =====================================================
// AUTHENTICATION SYSTEM
// =====================================================

const AUTH_STORAGE_KEY = "loginindex_auth";
let authState = null;

function getAuthState() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            authState = JSON.parse(stored);
            return authState;
        }

        const legacyLogin =
            localStorage.getItem("isLoggedIn") ||
            sessionStorage.getItem("isLoggedIn");
        const legacyUserType =
            localStorage.getItem("userType") ||
            sessionStorage.getItem("userType");
        const legacyCheckLogin =
            localStorage.getItem("checkLogin") ||
            sessionStorage.getItem("checkLogin");

        if (legacyLogin) {
            const migratedAuth = {
                isLoggedIn: legacyLogin,
                userType: legacyUserType,
                checkLogin: legacyCheckLogin,
                timestamp: Date.now(),
            };
            setAuthState(legacyLogin, legacyUserType, legacyCheckLogin);
            clearLegacyAuth();
            return migratedAuth;
        }
    } catch (error) {
        console.error("Error reading auth state:", error);
        clearAuthState();
    }
    return null;
}

function setAuthState(isLoggedIn, userType, checkLogin) {
    authState = {
        isLoggedIn: isLoggedIn,
        userType: userType,
        checkLogin: checkLogin,
        timestamp: Date.now(),
    };

    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
    } catch (error) {
        console.error("Error saving auth state:", error);
    }
}

function clearAuthState() {
    authState = null;
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        clearLegacyAuth();
    } catch (error) {
        console.error("Error clearing auth state:", error);
    }
}

function clearLegacyAuth() {
    try {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userType");
        localStorage.removeItem("checkLogin");
        sessionStorage.clear();
    } catch (error) {
        console.error("Error clearing legacy auth:", error);
    }
}

function isAuthenticated() {
    const auth = getAuthState();
    return auth && auth.isLoggedIn === "true";
}

function hasPermission(requiredLevel) {
    const auth = getAuthState();
    if (!auth) return false;

    const userLevel = parseInt(auth.checkLogin);
    return userLevel <= requiredLevel;
}

function getUserName() {
    const auth = getAuthState();
    return auth && auth.userType ? auth.userType.split("-")[0] : "Unknown";
}

// =====================================================
// AUTH MANAGER OBJECT FOR NAVIGATION
// =====================================================

const authManager = {
    isAuthenticated: function () {
        return isAuthenticated();
    },

    getAuthState: function () {
        return getAuthState();
    },

    hasPermission: function (requiredLevel) {
        return hasPermission(requiredLevel);
    },

    logout: function () {
        if (confirm("Bạn có chắc muốn đăng xuất?")) {
            clearAuthState();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    },

    getUserInfo: function () {
        return getAuthState();
    },
};

// Make it globally available
window.authManager = authManager;

// Auto clean expired cache every 5 minutes
setInterval(
    () => {
        const cleaned = dataCache.cleanExpired();
        if (cleaned > 0) {
            console.log(`🧹 Auto-cleaned ${cleaned} expired cache entries`);
        }
    },
    5 * 60 * 1000,
);

// Log cache stats on page load
console.log("📊 Cache Stats:", dataCache.getStats());
