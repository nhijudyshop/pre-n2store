// =====================================================
// CONFIGURATION & INITIALIZATION
// File: soorder-config.js
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

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Collection reference - using new structure
// Each document represents one day: { date, isHoliday, orders: [] }
const orderLogsCollectionRef = db.collection("order-logs");

// NCC names collection - stores supplier names with Ax codes
// Each document: { code: "A1", name: "A1 Tên gợi nhớ" }
const nccNamesCollectionRef = db.collection("ncc-names");

// Global state
window.SoOrderState = {
    currentDate: new Date(),
    currentDateString: "",
    currentDayData: null, // { date, isHoliday, orders }
    editingOrderId: null,
    deleteOrderId: null,
    differenceNoteOrderId: null, // Order ID for difference note modal

    // Date range state
    isRangeMode: false, // Whether we're viewing a date range
    rangeStartDate: null,
    rangeEndDate: null,
    rangeData: [], // Array of day data for the range
    lastViewedDate: null, // Last viewed single day date (for returning from range mode)

    // Calendar state
    calendarViewDate: new Date(), // Current month being viewed in calendar
    holidays: new Map(), // Map of date strings to holiday status

    // Filter state
    showOnlyUnpaid: false, // Whether to show only unpaid orders
    showOnlyWithDiscrepancy: false, // Whether to show only orders with discrepancy != 0
    nccFilter: "", // Filter orders by NCC name

    // NCC names state
    nccNames: [], // Array of { code: "A1", name: "A1 Tên gợi nhớ" }
};

// DOM elements (will be set after DOM ready)
window.SoOrderElements = {
    // Date navigation
    dateInput: null,
    dateSelector: null,
    btnPrevDay: null,
    btnNextDay: null,
    btnToday: null,
    holidayBadge: null,

    // Add form
    btnToggleAddForm: null,
    addOrderFormContainer: null,
    btnCloseAddForm: null,
    btnCancelAdd: null,
    btnSubmitAdd: null,
    addSupplier: null,
    addAmount: null,
    addDifference: null,
    addNote: null,
    addPerformer: null,
    addIsReconciled: null,
    holidayFieldsAdd: null,

    // Table
    tableContainer: null,
    orderTableBody: null,
    emptyState: null,
    footerSummary: null,
    totalAmount: null,
    totalDifference: null,

    // Edit modal
    editOrderModal: null,
    editModalOverlay: null,
    btnCloseEditModal: null,
    btnCancelEdit: null,
    btnSubmitEdit: null,
    editSupplier: null,
    editAmount: null,
    editDifference: null,
    editNote: null,
    editPerformer: null,
    editIsReconciled: null,
    holidayFieldsEdit: null,

    // Holiday modal
    btnManageHolidays: null,
    holidayModal: null,
    holidayModalOverlay: null,
    btnCloseHolidayModal: null,
    btnCancelHoliday: null,
    btnSaveHoliday: null,
    holidayDate: null,
    isHolidayCheck: null,

    // Calendar elements
    calendarMonthYear: null,
    calendarGrid: null,
    btnPrevMonth: null,
    btnNextMonth: null,

    // Delete modal
    deleteConfirmModal: null,
    deleteModalOverlay: null,
    btnCloseDeleteModal: null,
    btnCancelDelete: null,
    btnConfirmDelete: null,

    // Date Range modal
    dateRangeModal: null,
    dateRangeModalOverlay: null,
    btnCloseDateRangeModal: null,
    btnCancelDateRange: null,
    btnApplyDateRange: null,
    startDateInput: null,
    endDateInput: null,

    // Filter elements
    unpaidFilterCheckbox: null,
    discrepancyFilterCheckbox: null,

    // Toast
    toastContainer: null,

    // NCC management elements
    btnManageNCC: null,
    nccManageModal: null,
    nccManageModalOverlay: null,
    btnCloseNCCManageModal: null,
    btnCancelNCCManage: null,
    nccList: null,
    addSupplierSuggestions: null,
    editSupplierSuggestions: null,

    // NCC conflict modal elements
    nccConflictModal: null,
    nccConflictModalOverlay: null,
    btnCloseNCCConflictModal: null,
    nccConflictNewName: null,
    nccConflictExistingName: null,
    btnUseNewNCC: null,
    btnUseExistingNCC: null,
    btnCancelNCCConflict: null,
};

// Export for other modules
window.SoOrderConfig = {
    firebaseConfig,
    app,
    db,
    orderLogsCollectionRef,
    nccNamesCollectionRef,
};
