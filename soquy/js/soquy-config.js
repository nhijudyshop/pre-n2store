// =====================================================
// SỔ QUỸ - CONFIGURATION & CONSTANTS
// File: soquy-config.js
// =====================================================

// Firebase initialized by ../shared/js/firebase-config.js
const db = getFirestore();

// Firestore collection reference
const soquyCollectionRef = db.collection('soquy_vouchers');
const soquyCountersRef = db.collection('soquy_counters');
const storageRef = firebase.storage().ref();

// =====================================================
// CONSTANTS
// =====================================================

const FUND_TYPES = {
    CASH: 'cash',
    BANK: 'bank',
    EWALLET: 'ewallet',
    ALL: 'all'
};

const FUND_TYPE_LABELS = {
    [FUND_TYPES.CASH]: 'Tiền mặt',
    [FUND_TYPES.BANK]: 'Ngân hàng',
    [FUND_TYPES.EWALLET]: 'Ví điện tử',
    [FUND_TYPES.ALL]: 'Tổng quỹ'
};

const VOUCHER_TYPES = {
    RECEIPT: 'receipt',
    PAYMENT_CN: 'payment_cn',
    PAYMENT_KD: 'payment_kd'
};

const VOUCHER_TYPE_LABELS = {
    [VOUCHER_TYPES.RECEIPT]: 'Phiếu thu',
    [VOUCHER_TYPES.PAYMENT_CN]: 'Phiếu chi CN',
    [VOUCHER_TYPES.PAYMENT_KD]: 'Phiếu chi KD'
};

// Voucher code prefixes per fund type
const VOUCHER_CODE_PREFIX = {
    receipt: {
        cash: 'TTM',
        bank: 'TNH',
        ewallet: 'TVD'
    },
    payment_cn: {
        cash: 'CCN',
        bank: 'CCN',
        ewallet: 'CCN'
    },
    payment_kd: {
        cash: 'CKD',
        bank: 'CKD',
        ewallet: 'CKD'
    }
};

const VOUCHER_STATUS = {
    PAID: 'paid',
    CANCELLED: 'cancelled'
};

const VOUCHER_STATUS_LABELS = {
    [VOUCHER_STATUS.PAID]: 'Đã thanh toán',
    [VOUCHER_STATUS.CANCELLED]: 'Đã hủy'
};

// Receipt categories (Loại thu)
const RECEIPT_CATEGORIES = [
    'Thu tiền khách hàng',
    'Thu hoàn tiền NCC',
    'Thu từ đối tác giao hàng',
    'Rút tiền ngân hàng',
    'Thu nhập khác',
    'Thu nội bộ',
    'Chuyển/Nạp'
];

// Payment CN categories (Loại chi cá nhân)
const PAYMENT_CN_CATEGORIES = [
    'Chi CC CHỊ NHI',
    'Chi CC A TRƯỜNG',
    'Chi BB ĂN UỐNG+ĐÃM TIỆC+ĐI CHƠI',
    'Chi BB TỪ THIỆN+PHỎNG SANH+CÚNG DƯỜNG',
    'Chi BB ĐI CHỢ HÀNG NGÀY + GIA VỊ',
    'Chi DD KHOẢN CHI XÂY+SỬA NHÀ',
    'Chi phí khác',
    'Chuyển/Rút'
];

// Payment KD categories (Loại chi kinh doanh)
const PAYMENT_KD_CATEGORIES = [
    'Chi trả tiền NCC',
    'Chi phí vận chuyển',
    'Chi phí mặt bằng',
    'Chi lương nhân viên',
    'Chi nội bộ',
    'Chi phí khác',
    'Chuyển/Rút'
];

// Payer/Receiver object types
const OBJECT_TYPES = [
    'Khác',
    'Khách hàng',
    'Nhà cung cấp',
    'Nhân viên'
];

// Firestore collection reference for dynamic metadata (categories, creators)
const soquyMetaRef = db.collection('soquy_meta');

// Column definitions for the table (all 18 data columns)
const COLUMN_DEFINITIONS = [
    { key: 'code', label: 'Mã phiếu', defaultVisible: false },
    { key: 'voucherDateTime', label: 'Thời gian', defaultVisible: true },
    { key: 'createdAt', label: 'Thời gian tạo', defaultVisible: false },
    { key: 'createdBy', label: 'Người tạo', defaultVisible: true },
    { key: 'collector', label: 'Nhân viên', defaultVisible: false },
    { key: 'branch', label: 'Chi nhánh', defaultVisible: false },
    { key: 'source', label: 'Nguồn', defaultVisible: true },
    { key: 'category', label: 'Loại thu chi', defaultVisible: true },
    { key: 'accountName', label: 'Tên tài khoản', defaultVisible: false },
    { key: 'accountNumber', label: 'Số tài khoản', defaultVisible: false },
    { key: 'personCode', label: 'Mã người nộp/nhận', defaultVisible: false },
    { key: 'personName', label: 'Người nộp/nhận', defaultVisible: false },
    { key: 'phone', label: 'Số điện thoại', defaultVisible: false },
    { key: 'address', label: 'Địa chỉ', defaultVisible: false },
    { key: 'amount', label: 'Giá trị', defaultVisible: true },
    { key: 'transferContent', label: 'Nội dung chuyển khoản', defaultVisible: false },
    { key: 'image', label: 'Hình ảnh', defaultVisible: true },
    { key: 'note', label: 'Ghi chú', defaultVisible: true },
    { key: 'fundType', label: 'Loại sổ quỹ', defaultVisible: false },
    { key: 'status', label: 'Trạng thái', defaultVisible: false }
];

const PAGE_SIZES = [15, 30, 50, 100];
const DEFAULT_PAGE_SIZE = 100;

// Time filter options
const TIME_FILTERS = {
    THIS_MONTH: 'this_month',
    LAST_MONTH: 'last_month',
    THIS_QUARTER: 'this_quarter',
    THIS_YEAR: 'this_year',
    CUSTOM: 'custom'
};

const TIME_FILTER_LABELS = {
    [TIME_FILTERS.THIS_MONTH]: 'Tháng này',
    [TIME_FILTERS.LAST_MONTH]: 'Tháng trước',
    [TIME_FILTERS.THIS_QUARTER]: 'Quý này',
    [TIME_FILTERS.THIS_YEAR]: 'Năm nay',
    [TIME_FILTERS.CUSTOM]: 'Tùy chỉnh'
};


// =====================================================
// GLOBAL STATE
// =====================================================

window.SoquyState = {
    // Current filters
    fundType: FUND_TYPES.CASH,
    timeFilter: TIME_FILTERS.THIS_MONTH,
    customStartDate: null,
    customEndDate: null,
    voucherTypeFilter: [], // empty = all, ['receipt'], ['payment_cn'], ['payment_kd'], or combinations
    categoryFilter: '',
    statusFilter: [VOUCHER_STATUS.PAID], // default: show paid only
    creatorFilter: '',
    employeeFilter: '',
    searchQuery: '',

    // Pagination
    currentPage: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,

    // Data
    vouchers: [],
    filteredVouchers: [],
    displayedVouchers: [],

    // Summary
    openingBalance: 0,
    totalReceipts: 0,
    totalPaymentsCN: 0,
    totalPaymentsKD: 0,
    totalPayments: 0,
    closingBalance: 0,

    // Payment sub-type for current modal
    paymentSubType: 'cn',

    // Editing
    editingVoucherId: null,
    viewingVoucherId: null,

    // Loading
    isLoading: false,

    // Creators list (for filter dropdown)
    creators: [],
    employees: [],

    // Column visibility (key -> boolean)
    columnVisibility: COLUMN_DEFINITIONS.reduce((acc, col) => {
        acc[col.key] = col.defaultVisible;
        return acc;
    }, {}),

    // Source filter (Nguồn)
    sourceFilter: '',

    // Dynamic categories, creators & sources (auto-added from imports/entries)
    dynamicReceiptCategories: [],
    dynamicPaymentCNCategories: [],
    dynamicPaymentKDCategories: [],
    dynamicCreators: [],
    dynamicSources: [], // Array of { code: 'AA', name: 'Bán hàng' }

    // All users from Firestore (for collector/creator dropdowns)
    allUsers: [],

    // Edit history tab loaded flag
    editHistoryLoaded: false
};

// =====================================================
// DOM ELEMENT REFERENCES
// =====================================================

window.SoquyElements = {
    // Fund type radio buttons
    fundTypeRadios: null,

    // Time filter
    timeFilterSelect: null,
    timeFilterCustom: null,
    customStartDate: null,
    customEndDate: null,

    // Voucher type checkboxes
    receiptCheckbox: null,
    paymentCNCheckbox: null,
    paymentKDCheckbox: null,

    // Category filter
    categoryFilter: null,

    // Status checkboxes
    statusPaidCheckbox: null,
    statusCancelledCheckbox: null,

    // Creator/Employee filter
    creatorFilter: null,
    employeeFilter: null,

    // Search
    searchInput: null,

    // Summary stats
    statOpeningBalance: null,
    statTotalReceipts: null,
    statTotalPaymentsCN: null,
    statTotalPaymentsKD: null,
    statClosingBalance: null,

    // Table
    tableBody: null,
    selectAllCheckbox: null,

    // Pagination
    pageSizeSelect: null,
    btnFirstPage: null,
    btnPrevPage: null,
    btnNextPage: null,
    btnLastPage: null,
    currentPageSpan: null,
    pageInfoSpan: null,

    // Action buttons
    btnCreateReceipt: null,
    btnCreatePaymentCN: null,
    btnCreatePaymentKD: null,
    btnExportFile: null,

    // Receipt modal
    receiptModal: null,
    receiptForm: null,
    receiptDateTime: null,
    receiptCategory: null,
    receiptCollector: null,
    receiptAmount: null,
    receiptNote: null,
    receiptImageUpload: null,
    receiptImageFile: null,
    receiptImagePlaceholder: null,
    receiptImagePreview: null,
    receiptImagePreviewImg: null,
    receiptImageRemoveBtn: null,
    btnSaveReceipt: null,
    saveReceiptWrapper: null,
    btnSavePrintReceipt: null,
    btnCancelReceipt: null,
    btnCloseReceipt: null,
    receiptOverlay: null,

    // Payment modal
    paymentModal: null,
    paymentForm: null,
    paymentDateTime: null,
    paymentCategory: null,
    paymentCollector: null,
    paymentAmount: null,
    paymentNote: null,
    paymentImageUpload: null,
    paymentImageFile: null,
    paymentImagePlaceholder: null,
    paymentImagePreview: null,
    paymentImagePreviewImg: null,
    paymentImageRemoveBtn: null,
    btnSavePayment: null,
    savePaymentWrapper: null,
    btnSavePrintPayment: null,
    btnCancelPayment: null,
    btnClosePayment: null,
    paymentOverlay: null,

    // Detail/View modal
    detailModal: null,
    detailOverlay: null,
    btnCloseDetail: null,

    // Cancel confirm modal
    cancelModal: null,
    cancelOverlay: null,
    cancelReason: null,
    btnConfirmCancel: null,
    btnDismissCancel: null,
    btnCloseCancel: null,

    // Sidebar title
    sidebarTitle: null
};

// Export config
window.SoquyConfig = {
    db,
    storageRef,
    soquyCollectionRef,
    soquyCountersRef,
    soquyMetaRef,
    FUND_TYPES,
    FUND_TYPE_LABELS,
    VOUCHER_TYPES,
    VOUCHER_TYPE_LABELS,
    VOUCHER_CODE_PREFIX,
    VOUCHER_STATUS,
    VOUCHER_STATUS_LABELS,
    RECEIPT_CATEGORIES,
    PAYMENT_CN_CATEGORIES,
    PAYMENT_KD_CATEGORIES,
    OBJECT_TYPES,
    COLUMN_DEFINITIONS,
    PAGE_SIZES,
    DEFAULT_PAGE_SIZE,
    TIME_FILTERS,
    TIME_FILTER_LABELS
};
