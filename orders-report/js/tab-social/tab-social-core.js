/**
 * Tab Social Orders - Core Module
 * Initialization, state management, utilities
 */

// ===== GLOBAL STATE =====
const SocialOrderState = {
    orders: [], // All orders from Firebase
    filteredOrders: [], // Orders after filtering
    selectedOrders: new Set(), // Selected order IDs
    tags: [], // Available tags
    isLoading: false,
    currentEditingOrder: null,

    // Filters
    filters: {
        search: '',
        status: 'all',
        source: 'all',
        tag: 'all',
    },
};

// ===== CONSTANTS =====
const SOURCE_CONFIG = {
    manual: { label: 'Thủ công', icon: 'fa-pen', color: '#6b7280' },
    facebook_post: { label: 'Facebook', icon: 'fa-facebook-f', color: '#1877f2' },
    instagram: { label: 'Instagram', icon: 'fa-instagram', color: '#e4405f' },
    tiktok: { label: 'TikTok', icon: 'fa-tiktok', color: '#000000' },
};

const STATUS_CONFIG = {
    draft: { label: 'Nháp', color: '#fbbf24', bgColor: '#fef3c7', textColor: '#92400e' },
    order: { label: 'Đơn hàng', color: '#6366f1', bgColor: '#e0e7ff', textColor: '#4338ca' },
    processing: { label: 'Đang xử lý', color: '#3b82f6', bgColor: '#dbeafe', textColor: '#1e40af' },
    completed: { label: 'Hoàn thành', color: '#10b981', bgColor: '#d1fae5', textColor: '#065f46' },
    cancelled: { label: 'Đã hủy', color: '#ef4444', bgColor: '#fee2e2', textColor: '#991b1b' },
};

// ===== DEFAULT TAGS =====
const DEFAULT_TAGS = [
    { id: 'tag_vip', name: 'VIP', color: '#ef4444' },
    { id: 'tag_new', name: 'Khách mới', color: '#10b981' },
    { id: 'tag_call', name: 'Đã gọi', color: '#3b82f6' },
    { id: 'tag_wait', name: 'Chờ ship', color: '#f59e0b' },
    { id: 'tag_return', name: 'Khách cũ', color: '#8b5cf6' },
];

// ===== LOCAL STORAGE KEYS =====
const SOCIAL_ORDERS_STORAGE_KEY = 'socialOrders';
const SOCIAL_TAGS_STORAGE_KEY = 'socialOrderTags';

// ===== LOCAL STORAGE PERSISTENCE =====
function saveSocialOrdersToStorage() {
    try {
        localStorage.setItem(SOCIAL_ORDERS_STORAGE_KEY, JSON.stringify(SocialOrderState.orders));
    } catch (e) {
        console.error('[Tab Social] Failed to save orders to localStorage:', e);
    }
}

function loadSocialOrdersFromStorage() {
    try {
        const data = localStorage.getItem(SOCIAL_ORDERS_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('[Tab Social] Failed to load orders from localStorage:', e);
        return [];
    }
}

function saveSocialTagsToStorage() {
    try {
        localStorage.setItem(SOCIAL_TAGS_STORAGE_KEY, JSON.stringify(SocialOrderState.tags));
    } catch (e) {
        console.error('[Tab Social] Failed to save tags to localStorage:', e);
    }
}

function loadSocialTagsFromStorage() {
    try {
        const data = localStorage.getItem(SOCIAL_TAGS_STORAGE_KEY);
        return data ? JSON.parse(data) : DEFAULT_TAGS;
    } catch (e) {
        console.error('[Tab Social] Failed to load tags from localStorage:', e);
        return DEFAULT_TAGS;
    }
}

// ===== UTILITY FUNCTIONS =====
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function generateOrderId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
    return `SO-${dateStr}-${random}`;
}

function showLoading(show = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
    SocialOrderState.isLoading = show;
}

function showNotification(message, type = 'success') {
    // Try to use the shared notification system
    if (typeof window.notificationManager !== 'undefined') {
        window.notificationManager.show(message, type);
    } else if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        // Fallback to alert
        alert(message);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function () {
    console.log('[Tab Social] Initializing...');
    initSocialTab();
});

async function initSocialTab() {
    try {
        showLoading(true);

        // Initialize Pancake Token Manager for fetching posts
        if (window.pancakeTokenManager) {
            console.log('[Tab Social] Initializing Pancake Token Manager...');
            await window.pancakeTokenManager.initialize();
            console.log('[Tab Social] Pancake Token Manager initialized');
        } else {
            console.warn('[Tab Social] Pancake Token Manager not available');
        }

        // Load data from Firestore (source of truth), fallback to localStorage
        if (typeof loadSocialOrdersFromFirebase === 'function') {
            SocialOrderState.orders = await loadSocialOrdersFromFirebase();
            SocialOrderState.tags = await loadSocialTagsFromFirebase();
        } else {
            // Fallback if firebase module not loaded
            SocialOrderState.orders = loadSocialOrdersFromStorage();
            SocialOrderState.tags = loadSocialTagsFromStorage();
        }
        SocialOrderState.filteredOrders = [...SocialOrderState.orders];

        // Render table
        renderTable();

        // Initialize column visibility
        if (typeof initializeColumnVisibility === 'function') {
            initializeColumnVisibility();
        }

        // Populate tag filter
        populateTagFilter();

        // Update search result count
        updateSearchResultCount();

        // Setup real-time listener for cross-device sync
        if (typeof setupSocialOrdersListener === 'function') {
            setupSocialOrdersListener();
        }

        // Load currentUserIdentifier from Firestore (needed for cancel order to save canceller name)
        if (!window.currentUserIdentifier) {
            try {
                const auth = window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
                if (auth?.username && typeof firebase !== 'undefined' && firebase.firestore) {
                    const db = firebase.firestore();
                    const userDoc = await db.collection('users').doc(auth.username).get();
                    if (userDoc.exists) {
                        window.currentUserIdentifier = userDoc.data().identifier || null;
                        console.log('[Tab Social] Loaded user identifier:', window.currentUserIdentifier);
                    }
                }
                // Fallback: use displayName from authManager
                if (!window.currentUserIdentifier) {
                    const authFallback = window.authManager?.getAuthData?.();
                    window.currentUserIdentifier = authFallback?.displayName || authFallback?.username || null;
                    console.log('[Tab Social] Using auth displayName as fallback:', window.currentUserIdentifier);
                }
            } catch (e) {
                console.warn('[Tab Social] Could not load user identifier:', e);
            }
        }

        console.log('[Tab Social] Initialized with', SocialOrderState.orders.length, 'orders');
    } catch (error) {
        console.error('[Tab Social] Init error:', error);
        showNotification('Lỗi tải dữ liệu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function loadOrders() {
    console.log('[Tab Social] Reloading orders...');
    if (typeof loadSocialOrdersFromFirebase === 'function') {
        SocialOrderState.orders = await loadSocialOrdersFromFirebase();
        SocialOrderState.tags = await loadSocialTagsFromFirebase();
    } else {
        SocialOrderState.orders = loadSocialOrdersFromStorage();
        SocialOrderState.tags = loadSocialTagsFromStorage();
    }
    performTableSearch();
    populateTagFilter();
    showNotification('Đã tải lại dữ liệu', 'success');
}

// ===== EXPORT FOR OTHER MODULES =====
window.SocialOrderState = SocialOrderState;
window.SOURCE_CONFIG = SOURCE_CONFIG;
window.STATUS_CONFIG = STATUS_CONFIG;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.generateOrderId = generateOrderId;
window.showLoading = showLoading;
window.showNotification = showNotification;
window.debounce = debounce;
window.loadOrders = loadOrders;
window.saveSocialOrdersToStorage = saveSocialOrdersToStorage;
window.saveSocialTagsToStorage = saveSocialTagsToStorage;
