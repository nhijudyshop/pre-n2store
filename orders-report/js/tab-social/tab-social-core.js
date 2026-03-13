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
        status: 'draft',
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

// ===== STORAGE KEYS =====
const SOCIAL_ORDERS_STORAGE_KEY = 'socialOrders';
const SOCIAL_TAGS_STORAGE_KEY = 'socialOrderTags';
const SOCIAL_TAGS_IDB_KEY = 'social_tags_cache'; // IndexedDB key for tags

// ===== LOCAL STORAGE PERSISTENCE (Orders - no images, smaller data) =====
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

// ===== INDEXEDDB PERSISTENCE (Tags - may contain base64 images) =====
/**
 * Save tags to IndexedDB (primary local cache) + localStorage (fallback).
 * IndexedDB handles large data (images) better than localStorage's 5MB limit.
 */
function saveSocialTagsToStorage() {
    const tags = SocialOrderState.tags;

    // Primary: IndexedDB (async, large capacity)
    if (window.indexedDBStorage) {
        window.indexedDBStorage.setItem(SOCIAL_TAGS_IDB_KEY, tags).catch(e => {
            console.error('[Tab Social] Failed to save tags to IndexedDB:', e);
        });
    }

    // Fallback: localStorage (sync, for quick reads if IndexedDB not ready)
    // Strip images to avoid localStorage quota issues
    try {
        const tagsWithoutImages = tags.map(t => {
            const { image, ...rest } = t;
            return rest;
        });
        localStorage.setItem(SOCIAL_TAGS_STORAGE_KEY, JSON.stringify(tagsWithoutImages));
    } catch (e) {
        console.warn('[Tab Social] Failed to save tags to localStorage (fallback):', e);
    }
}

/**
 * Load tags from IndexedDB first, fallback to localStorage, then defaults.
 * This is synchronous-compatible: returns cached data immediately.
 * For async IndexedDB load, use loadSocialTagsFromStorageAsync().
 */
function loadSocialTagsFromStorage() {
    // Synchronous fallback: localStorage (may not have images)
    try {
        const data = localStorage.getItem(SOCIAL_TAGS_STORAGE_KEY);
        return data ? JSON.parse(data) : DEFAULT_TAGS;
    } catch (e) {
        console.error('[Tab Social] Failed to load tags from localStorage:', e);
        return DEFAULT_TAGS;
    }
}

/**
 * Async version: loads from IndexedDB (with images), falls back to localStorage.
 * @returns {Promise<Array>} Tags array
 */
async function loadSocialTagsFromStorageAsync() {
    // Try IndexedDB first (has full data including images)
    if (window.indexedDBStorage) {
        try {
            const tags = await window.indexedDBStorage.getItem(SOCIAL_TAGS_IDB_KEY);
            if (tags && Array.isArray(tags) && tags.length > 0) {
                console.log('[Tab Social] Loaded', tags.length, 'tags from IndexedDB cache');
                return tags;
            }
        } catch (e) {
            console.warn('[Tab Social] Failed to load tags from IndexedDB:', e);
        }
    }

    // Fallback to localStorage (sync, may not have images)
    return loadSocialTagsFromStorage();
}

/**
 * Migrate existing tags from localStorage to IndexedDB (one-time).
 * Called during init to ensure IndexedDB has the data.
 */
async function migrateTagsToIndexedDB() {
    if (!window.indexedDBStorage) return;

    try {
        const existing = await window.indexedDBStorage.getItem(SOCIAL_TAGS_IDB_KEY);
        if (existing && Array.isArray(existing) && existing.length > 0) {
            return; // Already migrated
        }

        // Migrate from localStorage
        const localData = localStorage.getItem(SOCIAL_TAGS_STORAGE_KEY);
        if (localData) {
            const tags = JSON.parse(localData);
            await window.indexedDBStorage.setItem(SOCIAL_TAGS_IDB_KEY, tags);
            console.log('[Tab Social] Migrated', tags.length, 'tags from localStorage to IndexedDB');
        }
    } catch (e) {
        console.warn('[Tab Social] Tag migration to IndexedDB failed:', e);
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

        // Migrate tags to IndexedDB if needed (one-time)
        await migrateTagsToIndexedDB();

        // Load data from Firestore (source of truth), fallback to local cache
        if (typeof loadSocialOrdersFromFirebase === 'function') {
            SocialOrderState.orders = await loadSocialOrdersFromFirebase();
            SocialOrderState.tags = await loadSocialTagsFromFirebase();
        } else {
            // Fallback if firebase module not loaded
            SocialOrderState.orders = loadSocialOrdersFromStorage();
            SocialOrderState.tags = await loadSocialTagsFromStorageAsync();
        }
        // Apply default filters (status=draft) and render table
        performTableSearch();

        // Initialize column visibility
        if (typeof initializeColumnVisibility === 'function') {
            initializeColumnVisibility();
        }

        // Populate tag filter
        populateTagFilter();

        // Initialize tag panel (right side filter)
        if (typeof initTagPanel === 'function') {
            initTagPanel();
        }

        // Update search result count
        updateSearchResultCount();

        // Real-time listeners DISABLED - tab social chỉ 1 nhân viên phụ trách, không cần cross-device sync
        // Nếu cần bật lại: bỏ comment 2 dòng bên dưới
        // if (typeof setupSocialOrdersListener === 'function') setupSocialOrdersListener();
        // if (typeof setupSocialTagsListener === 'function') setupSocialTagsListener();

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
        SocialOrderState.tags = await loadSocialTagsFromStorageAsync();
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
window.loadSocialTagsFromStorageAsync = loadSocialTagsFromStorageAsync;
