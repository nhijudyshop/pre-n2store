// =====================================================
// OVERVIEW - CORE: Global State & Permission Helpers
// MIGRATION: Changed from Realtime Database to Firestore
// =====================================================

// =====================================================
// GLOBAL STATE
// =====================================================
let allOrders = [];
let cachedOrderDetails = {}; // { tableName: { orders: [], fetchedAt: timestamp } }
let currentCampaignName = null;
let currentTableName = null; // Table name from tab1-orders
let database = null;
let isFetching = false;
let isLoadingTables = false; // Flag to prevent multiple simultaneous table loads
let userManuallySelectedTable = false; // Flag to track if user manually selected a table from dropdown
let justReceivedFromTab1 = false; // Flag to prevent auto-load from Firebase when just received data from tab1
let dataReceivedFromTab1 = false; // Flag to track if data was received from Tab1 (for retry logic)
let currentProductFilter = ''; // Product search filter for detail list

const STORAGE_KEY = 'report_order_details_by_table';
const FIREBASE_PATH = 'report_order_details';
const TABLE_NAME_SETTINGS_PATH = 'settings/table_name'; // Path to default table name (same as tab1)
const BATCH_SIZE = 10;
const BATCH_DELAY = 1000; // 1 second

// =====================================================
// PERMISSION HELPER
// =====================================================
function getAuthData() {
    try {
        let authData = sessionStorage.getItem("loginindex_auth");
        if (!authData) {
            authData = localStorage.getItem("loginindex_auth");
        }
        return authData ? JSON.parse(authData) : null;
    } catch (e) {
        console.error('[PERMISSION] Error reading auth data:', e);
        return null;
    }
}

function hasDetailedPermission(pageId, action) {
    const authData = getAuthData();
    if (!authData?.detailedPermissions?.[pageId]) return false;
    return authData.detailedPermissions[pageId][action] === true;
}

function canViewAnalysis() {
    return hasDetailedPermission('baocaosaleonline', 'viewAnalysis');
}

function canEditAnalysis() {
    return hasDetailedPermission('baocaosaleonline', 'editAnalysis');
}

function initAnalysisTabVisibility() {
    const analysisTabBtn = document.getElementById('analysisTabBtn');
    if (analysisTabBtn) {
        if (canViewAnalysis()) {
            analysisTabBtn.style.display = '';
            console.log('[PERMISSION] Analysis tab enabled');
        } else {
            analysisTabBtn.style.display = 'none';
            console.log('[PERMISSION] Analysis tab hidden - no permission');
        }
    }
}

// Firebase cached data info
let firebaseTableName = null;
let firebaseDataFetchedAt = null;

// Anti-spam: Track which tables have already requested conversation fetch
const conversationFetchRequestedFor = new Set();

// =====================================================
// STATISTICS STATE
// =====================================================
let employeeRanges = []; // Employee assignment ranges from Tab1
let availableTags = []; // Tags from TPOS
let trackedTags = []; // Tags currently being tracked for statistics

// Default tracked tag patterns
const DEFAULT_TRACKED_TAGS = [
    { pattern: 'giỏ trống', type: 'exact', displayName: 'Giỏ Trống', color: '#f59e0b' },
    { pattern: 'xả khách lạ', type: 'exact', displayName: 'Xả Khách Lạ', color: '#ef4444' },
    { pattern: 'đã gộp không chốt', type: 'exact', displayName: 'Gộp Đơn', color: '#8b5cf6' },
    { pattern: 'đã đi đơn gấp', type: 'exact', displayName: 'Đã Đi Đơn Gấp', color: '#10b981' },
    { pattern: 'ok', type: 'startsWith', displayName: 'OK + NV', color: '#22c55e' },
    { pattern: 'qua lấy', type: 'exact', displayName: 'Qua Lấy', color: '#3b82f6' },
    { pattern: 'xử lý', type: 'startsWith', displayName: 'Xử Lý + NV', color: '#f97316' },
    { pattern: 'chờ live', type: 'exact', displayName: 'Chờ Live', color: '#ec4899' },
    { pattern: 'chờ hàng', type: 'exact', displayName: 'Chờ Hàng', color: '#6366f1' },
    { pattern: 'xả đơn', type: 'startsWith', displayName: 'Xả Đơn', color: '#14b8a6' }
];

// Firebase paths for statistics
const TRACKED_TAGS_PATH = 'settings/tracked_tags';
const EMPLOYEE_RANGES_PATH = 'settings/employee_ranges';

// Firebase config - use shared config (loaded via shared/js/firebase-config.js)
const _fbConfig = (typeof firebaseConfig !== 'undefined') ? firebaseConfig : FIREBASE_CONFIG;

// Initialize Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(_fbConfig);
}
if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
    database = firebase.firestore();
}
