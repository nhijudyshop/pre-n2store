// =====================================================
// CONFIGURATION & CONSTANTS - INVENTORY TRACKING
// =====================================================

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com",
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37.appspot.com",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D",
};

// Application Constants
const APP_CONFIG = {
    PAGE_NAME: 'inventory-tracking',
    PAGE_TITLE: 'Theo Doi Nhap Hang SL',
    CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
    FILTER_DEBOUNCE_DELAY: 300,
    AUTH_STORAGE_KEY: 'loginindex_auth',
    MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
};

// Collection Names
const COLLECTIONS = {
    SHIPMENTS: 'inventory_tracking',  // Now stores NCC documents with datHang[] and dotHang[]
    PREPAYMENTS: 'inventory_prepayments',
    OTHER_EXPENSES: 'inventory_other_expenses',
    EDIT_HISTORY: 'edit_history',
    USERS: 'users',
};

// Order Booking Status
const ORDER_BOOKING_STATUS = {
    PENDING: 'pending',
    RECEIVED: 'received',
    CANCELLED: 'cancelled',
};

// Order Booking Status Config
const ORDER_BOOKING_STATUS_CONFIG = {
    [ORDER_BOOKING_STATUS.PENDING]: {
        label: 'Đang chờ giao',
        icon: 'clock',
        colorClass: 'status-pending',
        badgeClass: 'badge-warning',
    },
    [ORDER_BOOKING_STATUS.RECEIVED]: {
        label: 'Đã nhận hàng',
        icon: 'check-circle',
        colorClass: 'status-received',
        badgeClass: 'badge-success',
    },
    [ORDER_BOOKING_STATUS.CANCELLED]: {
        label: 'Đã hủy',
        icon: 'x-circle',
        colorClass: 'status-cancelled',
        badgeClass: 'badge-danger',
    },
};

// Transaction Types
const TRANSACTION_TYPES = {
    PREPAYMENT: 'prepayment',
    INVOICE: 'invoice',
    SHIPPING_COST: 'shipping_cost',
    OTHER_EXPENSE: 'other_expense',
};

// Transaction Labels & Icons
const TRANSACTION_CONFIG = {
    [TRANSACTION_TYPES.PREPAYMENT]: {
        label: 'Thanh toan truoc',
        icon: 'banknote',
        colorClass: 'positive',
        isPositive: true,
    },
    [TRANSACTION_TYPES.INVOICE]: {
        label: 'Tien hoa don',
        icon: 'receipt',
        colorClass: 'negative',
        isPositive: false,
    },
    [TRANSACTION_TYPES.SHIPPING_COST]: {
        label: 'Chi phi hang ve',
        icon: 'truck',
        colorClass: 'negative',
        isPositive: false,
    },
    [TRANSACTION_TYPES.OTHER_EXPENSE]: {
        label: 'Chi phi khac',
        icon: 'wallet',
        colorClass: 'negative',
        isPositive: false,
    },
};

// Global State - Restructured with sttNCC as primary key
let globalState = {
    // NCC-based structure (new)
    nccList: [],              // Array of NCC documents {sttNCC, datHang[], dotHang[], ...}
    filteredNCCList: [],      // Filtered NCC list

    // Flattened views for convenience (derived from nccList)
    shipments: [],            // Flattened dotHang from all NCCs (for backward compatibility)
    filteredShipments: [],
    orderBookings: [],        // Flattened datHang from all NCCs (for backward compatibility)
    filteredOrderBookings: [],

    // Other collections
    prepayments: [],
    otherExpenses: [],
    transactions: [],

    // UI state
    isLoading: false,
    currentTab: 'booking',    // Default to booking tab
    currentEditingId: null,
    filters: {
        dateFrom: '',
        dateTo: '',
        ncc: 'all',
        product: '',
        bookingStatus: 'all',
    },
    userPermissions: null,
    langMode: 'vi',  // 'vi' = Vietnamese (default), 'cn' = Chinese original
};

// Initialize Firebase
let app, db, storage;
try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    storage = firebase.storage();
    console.log('[CONFIG] Firebase initialized successfully');
} catch (error) {
    console.error('[CONFIG] Firebase initialization error:', error);
}

// Collection References
// Note: shipmentsRef now stores NCC documents with datHang[] and dotHang[]
const shipmentsRef = db?.collection(COLLECTIONS.SHIPMENTS);
const prepaymentsRef = db?.collection(COLLECTIONS.PREPAYMENTS);
const otherExpensesRef = db?.collection(COLLECTIONS.OTHER_EXPENSES);
const editHistoryRef = db?.collection(COLLECTIONS.EDIT_HISTORY);
const usersRef = db?.collection(COLLECTIONS.USERS);

console.log('[CONFIG] Configuration loaded successfully');
