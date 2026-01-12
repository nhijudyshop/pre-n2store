// config-constants.js
// Configuration and Constants

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

    // Performance Configuration
    performance: {
        CACHE_EXPIRY: 24 * 60 * 60 * 1000,
        VIRTUAL_ROW_HEIGHT: 45, // Estimated row height in pixels
        VIRTUAL_BUFFER: 5, // Extra rows to render above/below viewport
        VISIBLE_ROWS_INITIAL: 30, // Initial rows to show
        VISIBLE_ROWS_INCREMENT: 20, // Rows to add when scrolling
        BATCH_SIZE: 50, // Batch size for rendering
        RENDER_TIME_BUDGET: 16, // Max ms per render frame
        FILTER_DEBOUNCE_DELAY: 150, // Reduced for faster response
        SCROLL_THROTTLE_DELAY: 16, // Throttle scroll events
        MAX_FILTER_CHUNK_SIZE: 2000, // Items to filter per chunk
    },

    // UI Configuration
    ui: {
        LOADING_MIN_DISPLAY_TIME: 300, // Minimum time to show loading
        SUCCESS_MESSAGE_DURATION: 2000,
        ERROR_MESSAGE_DURATION: 3000,
        FORM_ANIMATION_DURATION: 200,
    },

    // Data Configuration
    data: {
        COLLECTION_NAME: "ck",
        HISTORY_COLLECTION_NAME: "edit_history",
        AUTH_STORAGE_KEY: "loginindex_auth",
    },
};

// Global State Management
const APP_STATE = {
    // Data
    arrayData: [],
    filteredData: [],
    currentFilters: {
        startDate: null,
        endDate: null,
        status: "all",
    },

    // UI State
    isOperationInProgress: false,
    isFilteringInProgress: false,
    isVirtualScrollEnabled: false,
    currentOperationType: null,
    editingRow: null,

    // Virtual Scrolling
    virtualScrolling: {
        visibleRange: { start: 0, end: 30 },
        scrollContainer: null,
        observer: null,
        lastScrollTop: 0,
        isScrolling: false,
    },

    // Cache
    memoryCache: {
        data: null,
        timestamp: null,
    },

    // Performance Tracking
    performance: {
        lastFilterTime: 0,
        lastRenderTime: 0,
        filterCount: 0,
        renderCount: 0,
    },
};

// DOM Element Selectors
const SELECTORS = {
    // Main elements
    tableBody: "#tableBody",
    totalAmount: "#totalAmount",
    dataForm: "#dataForm",
    editModal: "#editModal",
    floatingAlert: "#floatingAlert",

    // Form elements
    moneyTransferForm: "#moneyTransferForm",
    toggleFormButton: "#toggleFormButton",
    ngayck: "#ngayck",
    transferNote: "#transferNote",
    transferAmount: "#transferAmount",
    bank: "#bank",
    customerInfo: "#customerInfo",
    clearDataButton: "#clearDataButton",

    // Filter elements
    startDateFilter: "#startDateFilter",
    endDateFilter: "#endDateFilter",
    statusFilterDropdown: "#statusFilterDropdown",
    todayFilterBtn: "#todayFilterBtn",
    allFilterBtn: "#allFilterBtn",
    clearFiltersBtn: "#clearFiltersBtn",
    filterInfo: "#filterInfo",

    // Modal elements
    editDate: "#editDate",
    editNote: "#editNote",
    editAmount: "#editAmount",
    editBank: "#editBank",
    editInfo: "#editInfo",

    // Other elements
    toggleLogoutButton: "#toggleLogoutButton",
    tableContainer: ".table-container",
    filterSystem: "#improvedFilterSystem",
    virtualSpacer: "#virtualSpacer",
};

// Event Names
const EVENTS = {
    FILTER_CHANGED: "filterChanged",
    DATA_LOADED: "dataLoaded",
    VIRTUAL_SCROLL: "virtualScroll",
    OPERATION_START: "operationStart",
    OPERATION_END: "operationEnd",
    TABLE_UPDATED: "tableUpdated",
};

// Performance Thresholds
const PERFORMANCE_THRESHOLDS = {
    LARGE_DATASET: 500, // Consider virtual scrolling above this
    HUGE_DATASET: 2000, // Use more aggressive optimization
    SLOW_DEVICE: 1000, // ms - if operations take longer, reduce quality
};

// CSS Classes
const CSS_CLASSES = {
    muted: "muted-row",
    active: "active-row",
    loading: "loading",
    hidden: "hidden",
    virtualRow: "virtual-row",
    filterActive: "filter-active",
    operationBlocked: "operation-blocked",
};

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        CONFIG,
        APP_STATE,
        SELECTORS,
        EVENTS,
        PERFORMANCE_THRESHOLDS,
        CSS_CLASSES,
    };
} else {
    window.CONFIG = CONFIG;
    window.APP_STATE = APP_STATE;
    window.SELECTORS = SELECTORS;
    window.EVENTS = EVENTS;
    window.PERFORMANCE_THRESHOLDS = PERFORMANCE_THRESHOLDS;
    window.CSS_CLASSES = CSS_CLASSES;
}
