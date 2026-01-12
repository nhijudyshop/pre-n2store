/**
 * PURCHASE ORDERS MODULE - CONFIGURATION & TYPES
 * File: config.js
 * Purpose: Centralized configuration, constants, and type definitions
 */

// ========================================
// FIREBASE CONFIGURATION
// ========================================
// Ensure Firebase config is available before service initialization
if (!window.FIREBASE_CONFIG) {
    window.FIREBASE_CONFIG = {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D",
    };
}

// ========================================
// ORDER STATUS - Constants
// ========================================
const OrderStatus = {
    DRAFT: 'DRAFT',
    AWAITING_PURCHASE: 'AWAITING_PURCHASE',
    AWAITING_DELIVERY: 'AWAITING_DELIVERY',
    RECEIVED: 'RECEIVED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED'
};

// ========================================
// STATUS LABELS - Vietnamese
// ========================================
const STATUS_LABELS = {
    [OrderStatus.DRAFT]: 'Nháp',
    [OrderStatus.AWAITING_PURCHASE]: 'Chờ mua',
    [OrderStatus.AWAITING_DELIVERY]: 'Chờ hàng',
    [OrderStatus.RECEIVED]: 'Đã nhận',
    [OrderStatus.COMPLETED]: 'Hoàn thành',
    [OrderStatus.CANCELLED]: 'Đã hủy'
};

// ========================================
// STATUS COLORS - UI Badge Styling
// ========================================
const STATUS_COLORS = {
    [OrderStatus.DRAFT]: { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
    [OrderStatus.AWAITING_PURCHASE]: { bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe' },
    [OrderStatus.AWAITING_DELIVERY]: { bg: '#fef3c7', text: '#d97706', border: '#fde68a' },
    [OrderStatus.RECEIVED]: { bg: '#d1fae5', text: '#059669', border: '#a7f3d0' },
    [OrderStatus.COMPLETED]: { bg: '#d1fae5', text: '#059669', border: '#a7f3d0' },
    [OrderStatus.CANCELLED]: { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' }
};

// ========================================
// ALLOWED STATUS TRANSITIONS
// ========================================
const ALLOWED_TRANSITIONS = {
    [OrderStatus.DRAFT]: [OrderStatus.AWAITING_PURCHASE, OrderStatus.CANCELLED],
    [OrderStatus.AWAITING_PURCHASE]: [OrderStatus.AWAITING_DELIVERY, OrderStatus.DRAFT, OrderStatus.CANCELLED],
    [OrderStatus.AWAITING_DELIVERY]: [OrderStatus.RECEIVED, OrderStatus.CANCELLED],
    [OrderStatus.RECEIVED]: [OrderStatus.COMPLETED],
    [OrderStatus.COMPLETED]: [], // Final state - no transitions
    [OrderStatus.CANCELLED]: []  // Final state - no transitions
};

// ========================================
// TAB CONFIGURATION
// ========================================
const TAB_CONFIG = [
    { id: 'draft', label: 'Nháp', status: OrderStatus.DRAFT, icon: 'file-edit' },
    { id: 'awaiting-purchase', label: 'Chờ mua', status: OrderStatus.AWAITING_PURCHASE, icon: 'shopping-cart' },
    { id: 'awaiting-delivery', label: 'Chờ hàng', status: OrderStatus.AWAITING_DELIVERY, icon: 'truck' }
];

// ========================================
// QUICK FILTER OPTIONS
// ========================================
const QUICK_FILTERS = [
    { id: 'all', label: 'Tất cả', days: null },
    { id: 'today', label: 'Hôm nay', days: 0 },
    { id: 'yesterday', label: 'Hôm qua', days: 1 },
    { id: 'week', label: '7 ngày qua', days: 7 },
    { id: 'month', label: '30 ngày qua', days: 30 },
    { id: 'this-month', label: 'Tháng này', days: 'this-month' },
    { id: 'last-month', label: 'Tháng trước', days: 'last-month' }
];

// ========================================
// PAGINATION CONFIG
// ========================================
const PAGINATION_CONFIG = {
    pageSize: 20,
    pageSizeOptions: [10, 20, 50, 100]
};

// ========================================
// FIRESTORE COLLECTION NAME
// ========================================
const COLLECTION_NAME = 'purchase_orders';

// ========================================
// TPOS SYNC STATUS
// ========================================
const TposSyncStatus = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SUCCESS: 'success',
    FAILED: 'failed'
};

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Check if transition from one status to another is allowed
 * @param {string} from - Current status
 * @param {string} to - Target status
 * @returns {boolean}
 */
function canTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
}

/**
 * Get status badge HTML
 * @param {string} status - Order status
 * @returns {string} HTML string for badge
 */
function getStatusBadgeHTML(status) {
    const colors = STATUS_COLORS[status] || STATUS_COLORS[OrderStatus.DRAFT];
    const label = STATUS_LABELS[status] || status;
    return `<span class="status-badge" style="background: ${colors.bg}; color: ${colors.text}; border: 1px solid ${colors.border};">${label}</span>`;
}

/**
 * Check if order can be edited
 * @param {string} status - Order status
 * @returns {boolean}
 */
function canEditOrder(status) {
    return status !== OrderStatus.COMPLETED && status !== OrderStatus.CANCELLED;
}

/**
 * Check if order can be deleted
 * Only DRAFT and CANCELLED orders can be deleted (matches Firestore rules)
 * @param {string} status - Order status
 * @returns {boolean}
 */
function canDeleteOrder(status) {
    return status === OrderStatus.DRAFT || status === OrderStatus.CANCELLED;
}

/**
 * Generate unique ID
 * @returns {string}
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Format currency in VND
 * @param {number} value - Amount in VND
 * @returns {string}
 */
function formatVND(value) {
    if (value === null || value === undefined || isNaN(value)) return '0 đ';
    return new Intl.NumberFormat('vi-VN', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value) + ' đ';
}

/**
 * Format date to Vietnamese format
 * @param {Date|Object} date - Date object or Firestore Timestamp
 * @returns {string}
 */
function formatDate(date) {
    if (!date) return '';

    // Handle Firestore Timestamp
    if (date.toDate) {
        date = date.toDate();
    }

    // Handle string
    if (typeof date === 'string') {
        date = new Date(date);
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

/**
 * Format date and time
 * @param {Date|Object} date - Date object or Firestore Timestamp
 * @returns {string}
 */
function formatDateTime(date) {
    if (!date) return '';

    // Handle Firestore Timestamp
    if (date.toDate) {
        date = date.toDate();
    }

    // Handle string
    if (typeof date === 'string') {
        date = new Date(date);
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month} ${hours}:${minutes}`;
}

/**
 * Format relative time
 * @param {Date|Object} date - Date object or Firestore Timestamp
 * @returns {string}
 */
function formatRelativeTime(date) {
    if (!date) return '';

    // Handle Firestore Timestamp
    if (date.toDate) {
        date = date.toDate();
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} ngày trước`;

    return formatDate(date);
}

/**
 * Generate order number
 * @param {number} sequence - Sequence number for the day
 * @returns {string}
 */
function generateOrderNumber(sequence = 1) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const seq = String(sequence).padStart(3, '0');

    return `PO-${year}${month}${day}-${seq}`;
}

/**
 * Parse date from Vietnamese format (dd/mm/yyyy)
 * @param {string} dateStr - Date string in dd/mm/yyyy format
 * @returns {Date|null}
 */
function parseVietnameseDate(dateStr) {
    if (!dateStr) return null;

    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);

    const date = new Date(year, month, day);

    // Validate the date
    if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
        return null;
    }

    return date;
}

/**
 * Get date range for quick filter
 * @param {string|number} filterType - Filter type from QUICK_FILTERS
 * @returns {Object} { startDate, endDate }
 */
function getDateRangeForQuickFilter(filterType) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    let startDate = new Date(today);

    if (filterType === null || filterType === 'all') {
        return { startDate: null, endDate: null };
    }

    if (filterType === 0 || filterType === 'today') {
        return { startDate: today, endDate };
    }

    if (filterType === 1 || filterType === 'yesterday') {
        startDate.setDate(startDate.getDate() - 1);
        const yesterdayEnd = new Date(startDate);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { startDate, endDate: yesterdayEnd };
    }

    if (filterType === 'this-month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate, endDate };
    }

    if (filterType === 'last-month') {
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
        return { startDate, endDate: lastMonthEnd };
    }

    // For numeric days
    if (typeof filterType === 'number') {
        startDate.setDate(startDate.getDate() - filterType);
        return { startDate, endDate };
    }

    return { startDate: null, endDate: null };
}

// ========================================
// EXPORT TO GLOBAL SCOPE
// ========================================
window.PurchaseOrderConfig = {
    // Constants
    OrderStatus,
    STATUS_LABELS,
    STATUS_COLORS,
    ALLOWED_TRANSITIONS,
    TAB_CONFIG,
    QUICK_FILTERS,
    PAGINATION_CONFIG,
    COLLECTION_NAME,
    TposSyncStatus,

    // Helper Functions
    canTransition,
    getStatusBadgeHTML,
    canEditOrder,
    canDeleteOrder,
    generateUUID,
    formatVND,
    formatDate,
    formatDateTime,
    formatRelativeTime,
    generateOrderNumber,
    parseVietnameseDate,
    getDateRangeForQuickFilter
};

console.log('[Purchase Orders] Config loaded successfully');
