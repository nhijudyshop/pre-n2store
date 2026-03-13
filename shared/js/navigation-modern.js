/* =====================================================
   UNIFIED NAVIGATION MANAGER - PC + Mobile
   Auto-detect device and render appropriate UI
   ===================================================== */

// =====================================================
// SHOP CONFIG - Multi-company selector (NJD LIVE / NJD SHOP)
// =====================================================
window.ShopConfig = window.ShopConfig || (function() {
    'use strict';

    const STORAGE_KEY = 'n2store_selected_shop';

    const SHOPS = {
        'njd-live': { id: 'njd-live', label: 'NJD LIVE', CompanyId: 1 },
        'njd-shop': { id: 'njd-shop', label: 'NJD SHOP', CompanyId: 2 }
    };

    function getSelectedShopId() {
        return localStorage.getItem(STORAGE_KEY) || 'njd-live';
    }

    function getConfig() {
        return SHOPS[getSelectedShopId()] || SHOPS['njd-live'];
    }

    function setShop(shopId) {
        if (!SHOPS[shopId]) return;
        const prev = getSelectedShopId();
        if (prev === shopId) return;
        localStorage.setItem(STORAGE_KEY, shopId);
        window.dispatchEvent(new CustomEvent('shopChanged', {
            detail: { shopId, config: SHOPS[shopId], previousShopId: prev }
        }));
    }

    function getShops() {
        return Object.values(SHOPS).map(s => ({ id: s.id, label: s.label }));
    }

    return { getSelectedShopId, getConfig, setShop, getShops };
})();

// Menu Configuration with Permissions
const MENU_CONFIG = [
    // REMOVED: live nav item (module deleted)
    // REMOVED: livestream nav item (module deleted - cleanup task 9.1)
    // REMOVED: sanphamlive nav item (module deleted - cleanup task 9.1)
    {
        href: "../nhanhang/index.html",
        icon: "scale",
        text: "Cân Nặng Hàng",
        shortText: "Cân Hàng",
        pageIdentifier: "nhanhang",
        permissionRequired: "nhanhang",
    },
    {
        href: "../inventory-tracking/index.html",
        icon: "package-search",
        text: "Theo Dõi Nhập Hàng SL",
        shortText: "Nhập Hàng",
        pageIdentifier: "inventory-tracking",
        permissionRequired: "inventoryTracking",
    },
    {
        href: "../purchase-orders/index.html",
        icon: "clipboard-list",
        text: "Quản Lý Đặt Hàng NCC",
        shortText: "Đặt Hàng",
        pageIdentifier: "purchase-orders",
        adminOnly: true,
        permissionRequired: "purchase-orders",
    },
    {
        href: "../hangrotxa/index.html",
        icon: "clipboard-list",
        text: "Hàng Rớt - Xả",
        shortText: "Rớt/Xả",
        pageIdentifier: "hangrotxa",
        permissionRequired: "hangrotxa",
    },
    {
        href: "../ib/index.html",
        icon: "message-circle",
        text: "Check Inbox Khách",
        shortText: "Inbox",
        pageIdentifier: "ib",
        permissionRequired: "ib",
    },
    {
        href: "../inbox/index.html",
        icon: "messages-square",
        text: "Inbox Chat",
        shortText: "Chat",
        pageIdentifier: "inbox",
        permissionRequired: "inbox",
        publicAccess: true,
    },
    {
        href: "../ck/index.html",
        icon: "credit-card",
        text: "Thông Tin Chuyển Khoản",
        shortText: "CK",
        pageIdentifier: "ck",
        permissionRequired: "ck",
    },
    {
        href: "../hanghoan/index.html",
        icon: "corner-up-left",
        text: "Hàng Hoàn",
        shortText: "Hoàn",
        pageIdentifier: "hanghoan",
        permissionRequired: "hanghoan",
    },
    {
        href: "../issue-tracking/index.html",
        icon: "headphones",
        text: "CSKH + Hàng Hoàn Bưu Cục",
        shortText: "CSKH",
        pageIdentifier: "issue-tracking",
        permissionRequired: "issue-tracking",
    },
    {
        href: "../customer-hub/index.html",
        icon: "users",
        text: "Customer 360°",
        shortText: "KH 360",
        pageIdentifier: "customer-hub",
        permissionRequired: "customer-hub",
        adminOnly: true,
    },
    {
        href: "../orders-report/main.html",
        icon: "shopping-cart",
        text: "Báo Cáo Sale-Online",
        shortText: "SaleOnline",
        pageIdentifier: "orders-report",
        permissionRequired: "baocaosaleonline",
    },
    {
        href: "../don-inbox/index.html",
        icon: "inbox",
        text: "Đơn Inbox",
        shortText: "Đơn Inbox",
        pageIdentifier: "don-inbox",
        permissionRequired: "don-inbox",
    },
    {
        href: "../tpos-pancake/index.html",
        icon: "columns",
        text: "Tpos - Pancake",
        shortText: "Tpos-Pancake",
        pageIdentifier: "tpos-pancake",
        permissionRequired: "tpos-pancake",
    },
    {
        href: "../order-management/index.html",
        icon: "package-check",
        text: "Quản Lý Order",
        shortText: "Order",
        pageIdentifier: "order-management",
        permissionRequired: "order-management",
    },
    {
        href: "../soorder/index.html",
        icon: "book-open",
        text: "Sổ Order",
        shortText: "Sổ Order",
        pageIdentifier: "order-log",
        permissionRequired: "order-log",
    },
    // REMOVED: order-live-tracking nav item (module deleted - cleanup task 9.1)
    {
        href: "../soluong-live/index.html",
        icon: "bar-chart",
        text: "Quản Lý Số Lượng",
        shortText: "Số Lượng",
        pageIdentifier: "soluong-live",
        permissionRequired: "soluong-live",
    },
    {
        href: "../user-management/index.html",
        icon: "users",
        text: "Quản Lý Tài Khoản",
        shortText: "Users",
        pageIdentifier: "user-management",
        adminOnly: true,
        permissionRequired: "user-management",
    },
    {
        href: "../balance-history/index.html",
        icon: "wallet",
        text: "Lịch Sử Biến Động Số Dư",
        shortText: "Số Dư",
        pageIdentifier: "balance-history",
        adminOnly: true,
        permissionRequired: "balance-history",
    },
    {
        href: "../supplier-debt/index.html",
        icon: "receipt",
        text: "NCC",
        shortText: "NCC",
        pageIdentifier: "supplier-debt",
        permissionRequired: "supplier-debt",
    },
    {
        href: "../invoice-compare/index.html",
        icon: "file-check-2",
        text: "So Sánh Đơn Hàng",
        shortText: "So Sánh",
        pageIdentifier: "invoice-compare",
        adminOnly: true,
        permissionRequired: "invoice-compare",
    },
    {
        href: "../quy-trinh/index.html",
        icon: "book-open",
        text: "Quy Trình Nghiệp Vụ",
        shortText: "Quy Trình",
        pageIdentifier: "quy-trinh",
        permissionRequired: "quy-trinh",
    },
    {
        href: "../soquy/index.html",
        icon: "banknote",
        text: "Sổ Quỹ",
        shortText: "Sổ Quỹ",
        pageIdentifier: "soquy",
        adminOnly: true,
        permissionRequired: "soquy",
    },
    {
        href: "../AI/gemini.html",
        icon: "bot",
        text: "Gemini AI Assistant",
        shortText: "AI",
        pageIdentifier: "gemini-ai",
    },
    {
        href: "../lichsuchinhsua/index.html",
        icon: "history",
        text: "Lịch Sử Chỉnh Sửa",
        shortText: "Lịch Sử",
        pageIdentifier: "lichsuchinhsua",
        publicAccess: true,
    },
];

/**
 * Selective logout - clears auth data but preserves module-specific settings
 * Use this instead of localStorage.clear() to prevent losing user preferences
 */
function selectiveLogoutStorage() {
    // Auth keys to remove
    const authKeys = [
        'loginindex_auth',
        'isLoggedIn',
        'userType',
        'checkLogin',
        'remember_login_preference',
        'bearer_token_data',
        'tpos_token',
        'auth',
        'n2shop_current_user',
        'currentUser',
        'n2shop_auth_cache'  // CacheManager storage from login.js - must stay in sync
    ];

    authKeys.forEach(function(key) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });

    console.log('[Navigation] Selective logout completed - module data preserved');
}

// localStorage key for custom menu names (cache)
const CUSTOM_MENU_NAMES_KEY = 'n2shop_custom_menu_names';
const CUSTOM_MENU_NAMES_TIMESTAMP_KEY = 'n2shop_custom_menu_names_timestamp';
const FIREBASE_MENU_NAMES_DOC = 'settings/custom_menu_names';

// Cache expiry time: 24 hours in milliseconds
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Cache for menu names (loaded from Firebase)
let cachedMenuNames = null;

// Helper functions for custom menu names with Firebase sync
function getCustomMenuNames() {
    // Return cached if available
    if (cachedMenuNames !== null) {
        return cachedMenuNames;
    }

    // Try to load from localStorage cache first
    try {
        const stored = localStorage.getItem(CUSTOM_MENU_NAMES_KEY);
        cachedMenuNames = stored ? JSON.parse(stored) : {};
        return cachedMenuNames;
    } catch (e) {
        console.error('[Menu Names] Error loading from cache:', e);
        return {};
    }
}

// Check if cache is still valid (not expired)
function isCacheValid() {
    try {
        const timestamp = localStorage.getItem(CUSTOM_MENU_NAMES_TIMESTAMP_KEY);
        if (!timestamp) return false;

        const cacheTime = parseInt(timestamp, 10);
        const now = Date.now();
        const isValid = (now - cacheTime) < CACHE_EXPIRY_MS;

        if (isValid) {
            const remainingHours = Math.round((CACHE_EXPIRY_MS - (now - cacheTime)) / (60 * 60 * 1000));
            console.log(`[Menu Names] Cache valid, expires in ~${remainingHours}h`);
        }

        return isValid;
    } catch (e) {
        return false;
    }
}

// Load custom menu names from Firebase (call this on page load)
// Only fetches from Firebase if cache is expired or doesn't exist
async function loadCustomMenuNamesFromFirebase() {
    try {
        // Check if we have valid cached data
        const hasCache = localStorage.getItem(CUSTOM_MENU_NAMES_KEY);

        if (hasCache && isCacheValid()) {
            console.log('[Menu Names] Using cached data (not expired)');
            return getCustomMenuNames();
        }

        if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.apps?.length) {
            console.log('[Menu Names] Firebase not available or not initialized, using localStorage only');
            return getCustomMenuNames();
        }

        console.log('[Menu Names] Cache expired or missing, fetching from Firebase...');
        const db = firebase.firestore();
        const doc = await db.doc(FIREBASE_MENU_NAMES_DOC).get();

        if (doc.exists) {
            const data = doc.data();
            cachedMenuNames = data.names || {};
            // Update localStorage cache with timestamp
            localStorage.setItem(CUSTOM_MENU_NAMES_KEY, JSON.stringify(cachedMenuNames));
            localStorage.setItem(CUSTOM_MENU_NAMES_TIMESTAMP_KEY, Date.now().toString());
            console.log('[Menu Names] Loaded from Firebase:', Object.keys(cachedMenuNames).length, 'custom names');
        } else {
            cachedMenuNames = {};
            // Still set timestamp to avoid continuous retry
            localStorage.setItem(CUSTOM_MENU_NAMES_TIMESTAMP_KEY, Date.now().toString());
            console.log('[Menu Names] No custom names in Firebase');
        }

        return cachedMenuNames;
    } catch (e) {
        console.error('[Menu Names] Error loading from Firebase:', e);
        return getCustomMenuNames(); // Fallback to localStorage
    }
}

// Save custom menu names to Firebase
async function saveCustomMenuNames(customNames) {
    try {
        // Save to localStorage first (immediate)
        localStorage.setItem(CUSTOM_MENU_NAMES_KEY, JSON.stringify(customNames));
        cachedMenuNames = customNames;

        // Save to Firebase for sync
        if (typeof firebase !== 'undefined' && firebase.firestore && firebase.apps?.length) {
            const db = firebase.firestore();
            await db.doc(FIREBASE_MENU_NAMES_DOC).set({
                names: customNames,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: localStorage.getItem('currentUser') || 'admin'
            }, { merge: true });
            console.log('[Menu Names] Saved to Firebase successfully');
        }

        return true;
    } catch (e) {
        console.error('[Menu Names] Error saving:', e);
        return false;
    }
}

function getMenuDisplayName(menuItem) {
    const customNames = getCustomMenuNames();
    if (customNames[menuItem.pageIdentifier]) {
        return {
            text: customNames[menuItem.pageIdentifier].text || menuItem.text,
            shortText: customNames[menuItem.pageIdentifier].shortText || menuItem.shortText
        };
    }
    return { text: menuItem.text, shortText: menuItem.shortText };
}

// Export functions for external use (menu-rename-manager.js)
window.MenuNameUtils = {
    getCustomMenuNames,
    saveCustomMenuNames,
    loadCustomMenuNamesFromFirebase,
    getMenuDisplayName,
    MENU_CONFIG,
    CUSTOM_MENU_NAMES_KEY
};

// =====================================================
// MENU LAYOUT STORE - Drag-Drop Groups with Firebase Sync
// =====================================================

const MENU_LAYOUT_STORAGE_KEY = 'n2shop_menu_layout';
const MENU_LAYOUT_TIMESTAMP_KEY = 'n2shop_menu_layout_timestamp';
const MENU_LAYOUT_FIREBASE_DOC = 'settings/menu_layout';

// Default groups configuration by icon type
const DEFAULT_GROUPS_CONFIG = [
    {
        name: "Live & Streaming",
        icon: "video",
        items: ["soluong-live"]
    },
    {
        name: "Đơn Hàng",
        icon: "shopping-cart",
        items: ["orders-report", "order-management", "order-log", "tpos-pancake"]
    },
    {
        name: "Kho & Nhập Hàng",
        icon: "package",
        items: ["inventory-tracking", "purchase-orders", "nhanhang"]
    },
    {
        name: "Khách Hàng",
        icon: "users",
        items: ["customer-hub", "ib", "ck"]
    },
    {
        name: "Hoàn & CSKH",
        icon: "corner-up-left",
        items: ["hanghoan", "issue-tracking", "hangrotxa"]
    },
    {
        name: "Quản Trị",
        icon: "settings",
        items: ["user-management", "balance-history", "soquy", "invoice-compare", "quy-trinh", "lichsuchinhsua"]
    },
    {
        name: "Khác",
        icon: "grid",
        items: ["gemini-ai", "supplier-debt"]
    }
];

const MenuLayoutStore = {
    _layout: null,
    _unsubscribe: null,
    _isListening: false,
    _saveTimeout: null,
    _isEditing: false,

    /**
     * Initialize the store - load from Firebase or localStorage
     */
    async init() {
        console.log('[MenuLayout] Initializing...');

        // Try to load from localStorage cache first
        const cachedLayout = this._loadFromLocalStorage();
        if (cachedLayout && this._isCacheValid()) {
            this._layout = cachedLayout;
            console.log('[MenuLayout] Loaded from cache');
        }

        // Load from Firebase (async)
        await this._loadFromFirestore();

        // Setup real-time listener
        this._setupRealtimeListener();

        return this._layout;
    },

    /**
     * Check if localStorage cache is still valid
     */
    _isCacheValid() {
        try {
            const timestamp = localStorage.getItem(MENU_LAYOUT_TIMESTAMP_KEY);
            if (!timestamp) return false;
            const cacheTime = parseInt(timestamp, 10);
            return (Date.now() - cacheTime) < CACHE_EXPIRY_MS;
        } catch (e) {
            return false;
        }
    },

    /**
     * Load layout from localStorage
     */
    _loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(MENU_LAYOUT_STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            console.error('[MenuLayout] Error loading from localStorage:', e);
            return null;
        }
    },

    /**
     * Save layout to localStorage
     */
    _saveToLocalStorage() {
        try {
            localStorage.setItem(MENU_LAYOUT_STORAGE_KEY, JSON.stringify(this._layout));
            localStorage.setItem(MENU_LAYOUT_TIMESTAMP_KEY, Date.now().toString());
        } catch (e) {
            console.error('[MenuLayout] Error saving to localStorage:', e);
        }
    },

    /**
     * Load layout from Firestore
     */
    async _loadFromFirestore() {
        try {
            if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.apps?.length) {
                console.log('[MenuLayout] Firebase not available, using default layout');
                if (!this._layout) {
                    this._layout = this.getDefaultLayout();
                }
                return;
            }

            const db = firebase.firestore();
            const doc = await db.doc(MENU_LAYOUT_FIREBASE_DOC).get();

            if (doc.exists) {
                this._layout = doc.data();
                this._saveToLocalStorage();
                console.log('[MenuLayout] Loaded from Firebase:', this._layout.groups?.length, 'groups');
            } else {
                // No layout saved yet - create default
                this._layout = this.getDefaultLayout();
                console.log('[MenuLayout] No saved layout, using default');
            }
        } catch (e) {
            console.error('[MenuLayout] Error loading from Firestore:', e);
            if (!this._layout) {
                this._layout = this.getDefaultLayout();
            }
        }
    },

    /**
     * Setup real-time listener for cross-device sync
     */
    _setupRealtimeListener() {
        if (this._unsubscribe) return;

        try {
            if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.apps?.length) {
                console.log('[MenuLayout] Firebase not available, skipping listener setup');
                return;
            }

            const db = firebase.firestore();
            this._unsubscribe = db.doc(MENU_LAYOUT_FIREBASE_DOC)
                .onSnapshot((doc) => {
                    // Prevent processing during save
                    if (this._isEditing) {
                        console.log('[MenuLayout] Ignoring snapshot during edit');
                        return;
                    }

                    this._isListening = true;

                    if (doc.exists) {
                        const newLayout = doc.data();

                        // Get timestamps for comparison
                        const currentTime = this._layout?.lastUpdated?.toMillis?.() ||
                                          this._layout?.lastUpdated?.seconds * 1000 || 0;
                        const newTime = newLayout.lastUpdated?.toMillis?.() ||
                                       newLayout.lastUpdated?.seconds * 1000 || 0;

                        console.log('[MenuLayout] Snapshot received - current:', currentTime, 'new:', newTime);

                        // Update if newer or if we don't have a timestamp yet
                        if (newTime > currentTime || !this._layout?.lastUpdated) {
                            this._layout = newLayout;
                            this._saveToLocalStorage();
                            console.log('[MenuLayout] Updated from Firebase - groups:', newLayout.groups?.length);

                            // Re-render navigation for other users
                            if (window.navigationManager && !this._isEditing) {
                                console.log('[MenuLayout] Re-rendering navigation...');
                                window.navigationManager.renderNavigation();
                            }
                        }
                    }

                    this._isListening = false;
                }, (error) => {
                    console.error('[MenuLayout] Listener error:', error);
                    this._isListening = false;
                });

            console.log('[MenuLayout] Real-time listener setup successfully');
        } catch (e) {
            console.error('[MenuLayout] Error setting up listener:', e);
        }
    },

    /**
     * Generate default layout from MENU_CONFIG grouped by icon
     */
    getDefaultLayout() {
        const allPageIds = new Set(MENU_CONFIG.map(m => m.pageIdentifier));
        const assignedPageIds = new Set();

        const groups = DEFAULT_GROUPS_CONFIG.map((groupConfig, index) => {
            // Filter items that exist in MENU_CONFIG
            const validItems = groupConfig.items.filter(pageId => {
                if (allPageIds.has(pageId)) {
                    assignedPageIds.add(pageId);
                    return true;
                }
                return false;
            });

            return {
                id: `group_${Date.now()}_${index}`,
                name: groupConfig.name,
                icon: groupConfig.icon,
                collapsed: false,
                items: validItems
            };
        }).filter(g => g.items.length > 0);

        // Find unassigned items
        const ungroupedItems = MENU_CONFIG
            .filter(m => !assignedPageIds.has(m.pageIdentifier))
            .map(m => m.pageIdentifier);

        return {
            version: 1,
            groups: groups,
            ungroupedItems: ungroupedItems
        };
    },

    /**
     * Get current layout
     */
    getLayout() {
        if (!this._layout) {
            this._layout = this.getDefaultLayout();
        }
        return this._layout;
    },

    /**
     * Get layout filtered by user permissions
     * @param {Array} accessiblePageIds - Array of pageIdentifiers user can access
     */
    getFilteredLayout(accessiblePageIds) {
        const layout = this.getLayout();

        // Ensure we have latest items from MENU_CONFIG
        const layoutWithNewItems = this._addNewMenuItems(layout);

        const filteredGroups = layoutWithNewItems.groups.map(group => ({
            ...group,
            items: group.items
                .filter(pageId => this._canAccessPage(pageId, accessiblePageIds))
                .map(pageId => this._getMenuItemByPageId(pageId))
                .filter(item => item !== null)
        })).filter(group => group.items.length > 0);

        const filteredUngrouped = (layoutWithNewItems.ungroupedItems || [])
            .filter(pageId => this._canAccessPage(pageId, accessiblePageIds))
            .map(pageId => this._getMenuItemByPageId(pageId))
            .filter(item => item !== null);

        return {
            groups: filteredGroups,
            ungroupedItems: filteredUngrouped
        };
    },

    /**
     * Add any new MENU_CONFIG items not in saved layout
     */
    _addNewMenuItems(layout) {
        const layoutPageIds = new Set([
            ...layout.groups.flatMap(g => g.items),
            ...(layout.ungroupedItems || [])
        ]);

        const newItems = MENU_CONFIG
            .filter(item => !layoutPageIds.has(item.pageIdentifier))
            .map(item => item.pageIdentifier);

        if (newItems.length > 0) {
            console.log('[MenuLayout] Found new menu items:', newItems);
            return {
                ...layout,
                ungroupedItems: [...(layout.ungroupedItems || []), ...newItems]
            };
        }

        return layout;
    },

    /**
     * Check if user can access a page
     * Admin bypass: isAdmin users can access all pages
     */
    _canAccessPage(pageId, accessiblePageIds) {
        // Admin bypass - grant access to all pages
        if (this.isAdminTemplate) return true;

        const menuItem = MENU_CONFIG.find(m => m.pageIdentifier === pageId);
        if (!menuItem) return false;
        if (!menuItem.permissionRequired) return true; // Public pages
        if (menuItem.publicAccess) return true;
        return accessiblePageIds.includes(menuItem.permissionRequired);
    },

    /**
     * Get full menu item object by pageIdentifier
     */
    _getMenuItemByPageId(pageId) {
        const item = MENU_CONFIG.find(m => m.pageIdentifier === pageId);
        if (!item) return null;

        // Apply custom display names
        const displayName = getMenuDisplayName(item);
        return {
            ...item,
            text: displayName.text,
            shortText: displayName.shortText
        };
    },

    /**
     * Save layout to Firebase (debounced)
     */
    async saveLayout(layout) {
        // Create a deep copy to avoid reference issues
        const layoutCopy = JSON.parse(JSON.stringify(layout));
        this._layout = layoutCopy;
        this._saveToLocalStorage();

        console.log('[MenuLayout] Layout updated locally - groups:', layoutCopy.groups?.length);

        // Debounce Firebase save
        clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(async () => {
            if (this._isListening) {
                console.log('[MenuLayout] Skipping Firebase save - listener active');
                return;
            }

            try {
                if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.apps?.length) {
                    console.log('[MenuLayout] Firebase not available, saved to localStorage only');
                    return;
                }

                const db = firebase.firestore();
                const username = localStorage.getItem('currentUser') ||
                    JSON.parse(localStorage.getItem('loginindex_auth') || '{}').username ||
                    'admin';

                // Save without lastUpdated from local copy (let Firebase set it)
                const { lastUpdated, ...layoutWithoutTimestamp } = this._layout;

                await db.doc(MENU_LAYOUT_FIREBASE_DOC).set({
                    ...layoutWithoutTimestamp,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: username
                });

                console.log('[MenuLayout] Saved to Firebase successfully');
            } catch (e) {
                console.error('[MenuLayout] Error saving to Firebase:', e);
            }
        }, 1000); // Reduced to 1 second for faster sync
    },

    /**
     * Set editing state (prevents listener updates during drag)
     */
    setEditing(isEditing) {
        this._isEditing = isEditing;
    },

    /**
     * Cleanup listener
     */
    destroy() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        clearTimeout(this._saveTimeout);
    }
};

// Export for external use
window.MenuLayoutStore = MenuLayoutStore;

/**
 * Generate default admin permissions for all pages
 * Used to auto-fill missing permissions for admin template users
 */
function getDefaultAdminPermissions() {
    const defaultPerms = {};
    MENU_CONFIG.forEach(item => {
        if (item.permissionRequired) {
            // Default admin permissions for each page
            defaultPerms[item.permissionRequired] = {
                view: true,
                create: true,
                edit: true,
                delete: true,
                export: true
            };
        }
    });
    return defaultPerms;
}

/**
 * Merge missing permissions for admin template users
 * Ensures admins have access to all pages even if their stored permissions are outdated
 */
function mergeAdminPermissions(existingPerms) {
    const defaultPerms = getDefaultAdminPermissions();
    const merged = { ...existingPerms };

    Object.keys(defaultPerms).forEach(pageId => {
        if (!merged[pageId]) {
            merged[pageId] = defaultPerms[pageId];
            console.log(`[Admin Merge] Added missing permission for: ${pageId}`);
        }
    });

    return merged;
}

class UnifiedNavigationManager {
    constructor() {
        this.currentPage = null;
        this.userPermissions = [];
        this.isAdminTemplate = false; // Admin flag: used for bypass in permission checks
        this.isMobile = window.innerWidth <= 768;
        this.isEditMode = false; // Menu edit mode (admin only)
        this.groupSortable = null; // SortableJS instance for groups
        this.itemSortables = []; // SortableJS instances for items
        this.init();
    }

    async init() {
        console.log("[Unified Nav] Starting initialization...");

        // Check authentication - use window.authManager explicitly
        const auth = window.authManager;
        const authData = auth ? auth.getAuthData() : null;
        console.log("[Unified Nav] Auth check - authManager exists:", !!auth, "| authData:", authData);

        if (!auth || !auth.isAuthenticated()) {
            console.log("[Unified Nav] User not authenticated, redirecting...");
            selectiveLogoutStorage();
            sessionStorage.clear();
            window.location.href = "../index.html";
            return;
        }

        try {
            // Get user info and determine admin status
            // IMPORTANT: Check both localStorage AND sessionStorage (depends on "remember me" setting)
            const authDataStr = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth") || "{}";
            const authData = JSON.parse(authDataStr);
            // isAdminTemplate: used for admin bypass in permission checks and UI display
            // Check isAdmin flag, roleTemplate, and legacy userType
            const userType = localStorage.getItem("userType") || "";
            this.isAdminTemplate = authData.isAdmin === true || authData.roleTemplate === 'admin' || userType.startsWith("admin");
            console.log("[Unified Nav] isAdmin:", this.isAdminTemplate, "| roleTemplate:", authData.roleTemplate);

            // Load permissions
            await this.loadUserPermissions();
            console.log(
                "[Unified Nav] Permissions loaded:",
                this.userPermissions,
            );

            // Get current page
            this.currentPage = this.getCurrentPageIdentifier();
            console.log("[Unified Nav] Current page:", this.currentPage);

            // Check page access
            const hasAccess = this.checkPageAccess();
            console.log("[Unified Nav] Has access to page:", hasAccess);

            if (!hasAccess) {
                this.showAccessDenied();
                return;
            }

            // Detect device type
            this.detectDevice();

            // Load custom menu names from Firebase before rendering
            await loadCustomMenuNamesFromFirebase();

            // Initialize menu layout store (for grouped menus)
            await MenuLayoutStore.init();

            // Build UI based on device
            this.renderNavigation();
            this.updateUserInfo();
            this.setupEventListeners();
            this.loadSettings();

            // Handle resize
            window.addEventListener("resize", () => this.handleResize());

            console.log("[Unified Nav] Initialization complete!");
        } catch (error) {
            console.error("[Unified Nav] Initialization error:", error);
        }
    }

    detectDevice() {
        this.isMobile = window.innerWidth <= 768;
        console.log(
            "[Unified Nav] Device type:",
            this.isMobile ? "Mobile" : "Desktop",
        );
    }

    handleResize() {
        const wasMobile = this.isMobile;
        this.detectDevice();

        // Rebuild UI if device type changed
        if (wasMobile !== this.isMobile) {
            console.log("[Unified Nav] Device type changed, rebuilding UI...");
            this.renderNavigation();
            this.setupEventListeners();
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        } else if (!this.isMobile) {
            // On desktop, handle sidebar state during resize
            this.restoreSidebarState();
        }
    }

    async loadUserPermissions() {
        // Load detailedPermissions from auth data
        // Admin (isAdmin === true || roleTemplate === 'admin'): bypass - grant all pages
        // Non-admin: check detailedPermissions

        // Try to load from cache (check both localStorage AND sessionStorage)
        try {
            const authData = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");
            if (authData) {
                const userAuth = JSON.parse(authData);

                // Admin bypass: grant access to ALL pages regardless of detailedPermissions
                const isAdmin = userAuth.isAdmin === true || userAuth.roleTemplate === 'admin';
                if (isAdmin) {
                    // Generate full permissions for all menu pages
                    const fullPermissions = getDefaultAdminPermissions();
                    // Merge with any existing permissions (to preserve extra keys)
                    const merged = { ...fullPermissions, ...(userAuth.detailedPermissions || {}) };
                    // Ensure all default pages are covered
                    Object.keys(fullPermissions).forEach(pageId => {
                        if (!merged[pageId]) {
                            merged[pageId] = fullPermissions[pageId];
                        } else {
                            // Ensure all default actions are true for admin
                            Object.keys(fullPermissions[pageId]).forEach(action => {
                                merged[pageId][action] = true;
                            });
                        }
                    });

                    this.userDetailedPermissions = merged;
                    this.userPermissions = this._getAccessiblePagesFromDetailed(merged);

                    // Update stored auth data with full admin permissions
                    userAuth.detailedPermissions = merged;
                    const storage = localStorage.getItem("loginindex_auth") ? localStorage : sessionStorage;
                    storage.setItem("loginindex_auth", JSON.stringify(userAuth));

                    console.log(
                        "[Permission Load] Admin bypass: granted all",
                        Object.keys(merged).length, "pages"
                    );
                    return;
                }

                // Non-admin: load detailedPermissions normally
                if (userAuth.detailedPermissions && Object.keys(userAuth.detailedPermissions).length > 0) {
                    this.userDetailedPermissions = userAuth.detailedPermissions;
                    // Derive userPermissions from detailedPermissions for menu display
                    this.userPermissions = this._getAccessiblePagesFromDetailed(userAuth.detailedPermissions);
                    console.log(
                        "[Permission Load] Loaded detailedPermissions:",
                        Object.keys(this.userDetailedPermissions).length, "pages configured"
                    );
                    return;
                }
            }
        } catch (error) {
            console.error(
                "[Permission Load] Error loading cached permissions:",
                error,
            );
        }

        // Try to load from Firebase if not in cache
        try {
            if (typeof firebase !== "undefined" && firebase.firestore) {
                const authDataStr = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");
                const authData = authDataStr ? JSON.parse(authDataStr) : null;

                if (!authData || !authData.username) {
                    console.error("[Permission Load] No username in auth data");
                    this.userPermissions = [];
                    this.userDetailedPermissions = null;
                    return;
                }

                const db = firebase.firestore();
                const userDoc = await db
                    .collection("users")
                    .doc(authData.username)
                    .get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const roleTemplate = userData.roleTemplate || 'custom';
                    const isAdmin = userData.isAdmin === true || roleTemplate === 'admin';

                    // Admin bypass from Firebase: grant all pages
                    if (isAdmin) {
                        const fullPermissions = getDefaultAdminPermissions();
                        const existing = userData.detailedPermissions || {};
                        const merged = { ...fullPermissions, ...existing };
                        Object.keys(fullPermissions).forEach(pageId => {
                            if (!merged[pageId]) {
                                merged[pageId] = fullPermissions[pageId];
                            } else {
                                Object.keys(fullPermissions[pageId]).forEach(action => {
                                    merged[pageId][action] = true;
                                });
                            }
                        });

                        this.userDetailedPermissions = merged;
                        this.userPermissions = this._getAccessiblePagesFromDetailed(merged);

                        authData.detailedPermissions = merged;
                        authData.roleTemplate = roleTemplate;
                        authData.isAdmin = true;
                        localStorage.setItem("loginindex_auth", JSON.stringify(authData));

                        console.log("[Permission Load] Admin bypass from Firebase: granted all", Object.keys(merged).length, "pages");
                        return;
                    }

                    // Non-admin: load detailedPermissions
                    if (userData.detailedPermissions && Object.keys(userData.detailedPermissions).length > 0) {
                        this.userDetailedPermissions = userData.detailedPermissions;
                        this.userPermissions = this._getAccessiblePagesFromDetailed(userData.detailedPermissions);

                        // Cache to localStorage
                        authData.detailedPermissions = userData.detailedPermissions;
                        authData.roleTemplate = roleTemplate;
                        localStorage.setItem(
                            "loginindex_auth",
                            JSON.stringify(authData),
                        );

                        console.log(
                            "[Permission Load] Loaded detailedPermissions from Firebase:",
                            Object.keys(this.userDetailedPermissions).length, "pages"
                        );
                        return;
                    }
                } else {
                    console.error(
                        "[Permission Load] User document not found in Firebase",
                    );
                }
            }
        } catch (error) {
            console.error(
                "[Permission Load] Error loading Firebase permissions:",
                error,
            );
        }

        this.userPermissions = [];
        this.userDetailedPermissions = null;
        console.log(
            "[Permission Load] No permissions loaded, defaulting to empty",
        );
    }

    /**
     * NEW: Derive accessible pages from detailedPermissions
     * A page is accessible if user has at least one permission = true for that page
     * @param {Object} detailedPermissions
     * @returns {Array} List of page IDs user can access
     */
    _getAccessiblePagesFromDetailed(detailedPermissions) {
        if (!detailedPermissions) detailedPermissions = {};

        const accessible = Object.entries(detailedPermissions)
            .filter(([pageId, perms]) => {
                // Check if any permission in this page is true
                return Object.values(perms).some(value => value === true);
            })
            .map(([pageId]) => pageId);

        // Always include publicAccess pages
        MENU_CONFIG.forEach(item => {
            if (item.publicAccess && item.permissionRequired && !accessible.includes(item.permissionRequired)) {
                accessible.push(item.permissionRequired);
            }
        });

        return accessible;
    }

    /**
     * Check if user has a specific detailed permission
     * Admin bypass: isAdmin users always return true
     * @param {string} pageId
     * @param {string} permissionKey
     * @returns {boolean}
     */
    hasDetailedPermission(pageId, permissionKey) {
        // Admin bypass - grant all permissions
        if (this.isAdminTemplate) return true;

        if (!this.userDetailedPermissions) return false;

        const pagePerms = this.userDetailedPermissions[pageId];
        if (!pagePerms) return false;

        return pagePerms[permissionKey] === true;
    }

    getCurrentPageIdentifier() {
        const path = window.location.pathname;
        console.log("[Unified Nav] Current path:", path);

        const normalizedPath = path.toLowerCase().replace(/\/$/, "");

        const sortedMenu = [...MENU_CONFIG].sort(
            (a, b) => b.pageIdentifier.length - a.pageIdentifier.length,
        );

        for (const item of sortedMenu) {
            const identifier = item.pageIdentifier.toLowerCase();

            const patterns = [
                new RegExp(`/${identifier}/`, "i"),
                new RegExp(`/${identifier}/index\\.html$`, "i"),
                new RegExp(`/${identifier}$`, "i"),
            ];

            for (const pattern of patterns) {
                if (pattern.test(path)) {
                    console.log(
                        `[Unified Nav] Matched page: ${item.pageIdentifier} using pattern: ${pattern}`,
                    );
                    return item.pageIdentifier;
                }
            }
        }

        console.log("[Unified Nav] No page identifier matched");
        return null;
    }

    checkPageAccess() {
        if (!this.currentPage) {
            console.log("[Permission Check] No current page, allowing access");
            return true;
        }

        // Admin bypass - grant access to all pages
        if (this.isAdminTemplate) {
            console.log("[Permission Check] Admin bypass, allowing access");
            return true;
        }

        const pageInfo = MENU_CONFIG.find(
            (item) => item.pageIdentifier === this.currentPage,
        );

        if (!pageInfo) {
            console.log(
                "[Permission Check] Page not in MENU_CONFIG, allowing access",
            );
            return true;
        }

        if (pageInfo.publicAccess) {
            console.log("[Permission Check] Public page, allowing access");
            return true;
        }

        // Non-admin: check detailedPermissions
        const hasPermission = this.userPermissions.includes(
            pageInfo.permissionRequired,
        );

        console.log("[Permission Check] Details:", {
            currentPage: this.currentPage,
            requiredPermission: pageInfo.permissionRequired,
            userPermissions: this.userPermissions,
            roleTemplate: this.isAdminTemplate ? 'admin' : 'other',
            hasAccess: hasPermission,
        });

        return hasPermission;
    }

    // =====================================================
    // UNIFIED NAVIGATION RENDERING
    // =====================================================

    renderNavigation() {
        console.log("[Unified Nav] Rendering navigation...");

        if (this.isMobile) {
            this.renderMobileNavigation();
        } else {
            this.renderDesktopNavigation();
        }
    }

    // =====================================================
    // MOBILE NAVIGATION
    // =====================================================

    renderMobileNavigation() {
        console.log("[Unified Nav] Rendering mobile UI...");

        this.injectMobileStyles();

        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
            sidebar.style.display = "none";
            console.log("[Unified Nav] Desktop sidebar hidden");
        }

        const existingTopBar = document.querySelector(".mobile-top-bar");
        const existingBottomNav = document.querySelector(".mobile-bottom-nav");
        if (existingTopBar) existingTopBar.remove();
        if (existingBottomNav) existingBottomNav.remove();

        this.createMobileTopBar();
        this.createMobileBottomNav();

        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.style.paddingTop = "60px";
            mainContent.style.paddingBottom = "70px";
            mainContent.style.position = "relative";
            console.log("[Unified Nav] Main content padding adjusted");
        }

        document.body.style.paddingTop = "60px";
        document.body.style.paddingBottom = "65px";

        const bottomNavCheck = document.querySelector(".mobile-bottom-nav");
        if (bottomNavCheck) {
            console.log("[Unified Nav] ✅ Mobile bottom nav exists in DOM");
        } else {
            console.error(
                "[Unified Nav] ❌ Mobile bottom nav NOT found in DOM!",
            );
        }
    }

    createMobileTopBar() {
        const existingBar = document.querySelector(".mobile-top-bar");
        if (existingBar) existingBar.remove();

        const topBar = document.createElement("div");
        topBar.className = "mobile-top-bar";

        const userInfo = window.authManager?.getUserInfo();
        const roleMap = { 0: "Admin", 1: "Manager", 3: "Staff", 777: "Guest" };
        const checkLogin = localStorage.getItem("checkLogin");
        const roleName = roleMap[checkLogin] || "User";

        topBar.innerHTML = `
            <div class="mobile-top-content">
                <div class="mobile-user-info">
                    <div class="mobile-user-avatar">
                        <i data-lucide="user"></i>
                    </div>
                    <div class="mobile-user-details">
                        <div class="mobile-user-name-wrapper">
                            <div class="mobile-user-name">${userInfo?.displayName || "User"}</div>
                            <button class="edit-displayname-btn" id="editDisplayNameMobile" title="Chỉnh sửa tên hiển thị">
                                <i data-lucide="edit-2"></i>
                            </button>
                        </div>
                        <div class="mobile-user-role">${roleName}</div>
                    </div>
                </div>
                <select class="shop-selector mobile-shop-selector" id="mobileShopSelector">
                    ${window.ShopConfig.getShops().map(s =>
                        `<option value="${s.id}"${s.id === window.ShopConfig.getSelectedShopId() ? ' selected' : ''}>${s.label}</option>`
                    ).join('')}
                </select>
                <button class="mobile-menu-btn" id="mobileMenuBtn">
                    <i data-lucide="menu"></i>
                </button>
            </div>
        `;

        document.body.insertBefore(topBar, document.body.firstChild);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Add event listener for edit button
        const editBtn = topBar.querySelector("#editDisplayNameMobile");
        if (editBtn) {
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showEditDisplayNameModal();
            });
        }

        // Mobile shop selector
        const mobileShopSelector = topBar.querySelector('#mobileShopSelector');
        if (mobileShopSelector) {
            mobileShopSelector.addEventListener('change', (e) => {
                window.ShopConfig.setShop(e.target.value);
                if (!window._shopChangeNoReload) {
                    window.location.reload();
                }
            });
        }

        // Inject mobile shop selector styles
        this.injectShopSelectorStyles();
    }

    createMobileBottomNav() {
        const existingNav = document.querySelector(".mobile-bottom-nav");
        if (existingNav) existingNav.remove();

        const bottomNav = document.createElement("div");
        bottomNav.className = "mobile-bottom-nav";

        const accessiblePages = this.getAccessiblePages();

        console.log(
            "[Mobile Nav] Total accessible pages:",
            accessiblePages.length,
        );
        console.log("[Mobile Nav] Current page identifier:", this.currentPage);

        const bottomNavPages = accessiblePages.slice(0, 5);

        console.log(
            "[Mobile Nav] Bottom nav pages:",
            bottomNavPages.map((p) => p.pageIdentifier),
        );

        bottomNavPages.forEach((item) => {
            const navItem = document.createElement("a");
            navItem.href = item.href;
            navItem.className = "mobile-nav-item";

            if (item.pageIdentifier === this.currentPage) {
                navItem.classList.add("active");
                console.log("[Mobile Nav] Active page:", item.pageIdentifier);
            }

            navItem.innerHTML = `
                <i data-lucide="${item.icon}"></i>
                <span>${item.shortText || item.text}</span>
            `;

            bottomNav.appendChild(navItem);
        });

        if (accessiblePages.length > 5) {
            const moreBtn = document.createElement("button");
            moreBtn.className = "mobile-nav-item mobile-more-btn";
            moreBtn.innerHTML = `
                <i data-lucide="more-horizontal"></i>
                <span>Thêm</span>
            `;
            moreBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.showMobileMenu();
            });
            bottomNav.appendChild(moreBtn);
        }

        document.body.appendChild(bottomNav);

        console.log(
            "[Mobile Nav] Bottom nav created with",
            bottomNav.children.length,
            "items",
        );

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    showMobileMenu() {
        const overlay = document.createElement("div");
        overlay.className = "mobile-menu-overlay";

        const menu = document.createElement("div");
        menu.className = "mobile-menu-panel";

        // Get filtered layout based on user permissions
        const filteredLayout = MenuLayoutStore.getFilteredLayout(this.userPermissions);

        // Inject mobile group styles
        this.injectMobileGroupStyles();

        // Build grouped menu HTML
        let menuContentHtml = '';

        filteredLayout.groups.forEach((group) => {
            const hasActivePage = group.items.some(item => item.pageIdentifier === this.currentPage);
            const isCollapsed = !hasActivePage;
            menuContentHtml += `
                <div class="mobile-menu-group ${isCollapsed ? 'collapsed' : ''}" data-group-id="${group.id}">
                    <div class="mobile-group-header">
                        <span class="mobile-group-collapse-icon"><i data-lucide="chevron-down"></i></span>
                        <i data-lucide="${group.icon}" class="mobile-group-icon"></i>
                        <span class="mobile-group-name">${group.name}</span>
                        <span class="mobile-group-count">${group.items.length}</span>
                    </div>
                    <div class="mobile-group-items">
                        ${group.items.map(item => `
                            <a href="${item.href}" class="mobile-menu-item ${item.pageIdentifier === this.currentPage ? 'active' : ''}">
                                <i data-lucide="${item.icon}"></i>
                                <span>${item.text}</span>
                                ${item.pageIdentifier === this.currentPage ? '<i data-lucide="check" class="check-icon"></i>' : ''}
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        // Add ungrouped items if any
        if (filteredLayout.ungroupedItems && filteredLayout.ungroupedItems.length > 0) {
            const hasActivePage = filteredLayout.ungroupedItems.some(item => item.pageIdentifier === this.currentPage);
            const isCollapsed = !hasActivePage;
            menuContentHtml += `
                <div class="mobile-menu-group ${isCollapsed ? 'collapsed' : ''}" data-group-id="ungrouped">
                    <div class="mobile-group-header">
                        <span class="mobile-group-collapse-icon"><i data-lucide="chevron-down"></i></span>
                        <i data-lucide="more-horizontal" class="mobile-group-icon"></i>
                        <span class="mobile-group-name">Khác</span>
                        <span class="mobile-group-count">${filteredLayout.ungroupedItems.length}</span>
                    </div>
                    <div class="mobile-group-items">
                        ${filteredLayout.ungroupedItems.map(item => `
                            <a href="${item.href}" class="mobile-menu-item ${item.pageIdentifier === this.currentPage ? 'active' : ''}">
                                <i data-lucide="${item.icon}"></i>
                                <span>${item.text}</span>
                                ${item.pageIdentifier === this.currentPage ? '<i data-lucide="check" class="check-icon"></i>' : ''}
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        menu.innerHTML = `
            <div class="mobile-menu-header">
                <h3>Tất Cả Trang</h3>
                <button class="mobile-menu-close" id="closeMobileMenu">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="mobile-menu-content">
                ${menuContentHtml}
            </div>
            <div class="mobile-menu-footer">
                <button class="mobile-menu-action" id="mobileSettingsBtn">
                    <i data-lucide="settings"></i>
                    <span>Cài Đặt</span>
                </button>
                <button class="mobile-menu-action" id="mobileLogoutBtn">
                    <i data-lucide="log-out"></i>
                    <span>Đăng Xuất</span>
                </button>
            </div>
        `;

        overlay.appendChild(menu);
        document.body.appendChild(overlay);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        const closeBtn = menu.querySelector("#closeMobileMenu");
        closeBtn.addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // Mobile group collapse/expand handlers
        menu.querySelectorAll('.mobile-group-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const groupEl = header.closest('.mobile-menu-group');
                const groupId = groupEl.dataset.groupId;
                const isCollapsed = groupEl.classList.toggle('collapsed');
                this.saveMobileGroupCollapsedState(groupId, isCollapsed);
            });
        });

        const settingsBtn = menu.querySelector("#mobileSettingsBtn");
        settingsBtn.addEventListener("click", () => {
            overlay.remove();
            this.showSettings();
        });

        const logoutBtn = menu.querySelector("#mobileLogoutBtn");
        logoutBtn.addEventListener("click", () => {
            overlay.remove();
            this.showLogoutConfirmDialog();
        });
    }

    /**
     * Get mobile group collapsed state from localStorage
     */
    getMobileGroupCollapsedState() {
        try {
            const state = localStorage.getItem('n2shop_mobile_group_collapsed');
            return state ? JSON.parse(state) : {};
        } catch (e) {
            return {};
        }
    }

    /**
     * Save mobile group collapsed state to localStorage
     */
    saveMobileGroupCollapsedState(groupId, isCollapsed) {
        try {
            const state = this.getMobileGroupCollapsedState();
            state[groupId] = isCollapsed;
            localStorage.setItem('n2shop_mobile_group_collapsed', JSON.stringify(state));
        } catch (e) {
            console.error('[Mobile Menu] Error saving collapsed state:', e);
        }
    }

    /**
     * Inject CSS styles for mobile grouped menu
     */
    injectMobileGroupStyles() {
        if (document.getElementById('mobileGroupStyles')) return;

        const style = document.createElement('style');
        style.id = 'mobileGroupStyles';
        style.textContent = `
            /* Mobile Menu Groups */
            .mobile-menu-group {
                margin-bottom: 8px;
            }
            .mobile-group-header {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                background: rgba(255,255,255,0.05);
                border-radius: 8px;
                cursor: pointer;
                user-select: none;
            }
            .mobile-group-header:active {
                background: rgba(255,255,255,0.1);
            }
            .mobile-group-collapse-icon {
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: rgba(255,255,255,0.5);
                transition: transform 0.2s ease;
            }
            .mobile-menu-group.collapsed .mobile-group-collapse-icon {
                transform: rotate(-90deg);
            }
            .mobile-group-collapse-icon i,
            .mobile-group-collapse-icon svg {
                width: 16px;
                height: 16px;
                stroke-width: 2.5;
            }
            .mobile-group-icon {
                width: 18px;
                height: 18px;
                color: #a5b4fc;
            }
            .mobile-group-name {
                flex: 1;
                font-size: 13px;
                font-weight: 600;
                color: rgba(255,255,255,0.9);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .mobile-group-count {
                font-size: 11px;
                color: rgba(255,255,255,0.4);
                background: rgba(255,255,255,0.1);
                padding: 2px 8px;
                border-radius: 10px;
            }
            .mobile-group-items {
                padding-left: 16px;
                margin-top: 4px;
            }
            .mobile-menu-group.collapsed .mobile-group-items {
                display: none;
            }
            .mobile-group-items .mobile-menu-item {
                padding-left: 32px;
            }
        `;
        document.head.insertBefore(style, document.head.firstChild);
    }

    // =====================================================
    // DESKTOP NAVIGATION
    // =====================================================

    renderDesktopNavigation() {
        console.log("[Unified Nav] Rendering desktop UI...");

        // Auto-create sidebar + main-content wrapper if page doesn't have them
        this.ensureDesktopStructure();

        const sidebar = document.getElementById("sidebar");
        if (sidebar) {
            sidebar.style.display = "";
        }

        const topBar = document.querySelector(".mobile-top-bar");
        const bottomNav = document.querySelector(".mobile-bottom-nav");
        if (topBar) topBar.remove();
        if (bottomNav) bottomNav.remove();

        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
            mainContent.style.paddingTop = "";
            mainContent.style.paddingBottom = "";
        }

        this.updateSidebarLogo();
        this.initShopSelector();
        this.renderDesktopSidebar();
        this.initializeSidebarToggle();
    }

    /**
     * Auto-create sidebar HTML + inject CSS for pages that don't have sidebar markup.
     * Makes navigation-modern.js plug-and-play: just add <script defer src="navigation-modern.js">
     */
    ensureDesktopStructure() {
        if (document.getElementById("sidebar")) return; // Already has sidebar

        console.log("[Unified Nav] Sidebar not found, auto-creating...");

        // Inject sidebar CSS (with hardcoded fallbacks for pages without modern.css)
        this.injectSidebarStyles();

        // Compute logo path from script src
        const scriptTag = document.querySelector('script[src*="navigation-modern"]');
        let logoPath = '../shared/images/logo.jpg';
        if (scriptTag) {
            const src = scriptTag.getAttribute('src');
            logoPath = src.replace('js/navigation-modern.js', 'images/logo.jpg');
        }

        // Create sidebar HTML
        const sidebar = document.createElement('aside');
        sidebar.className = 'sidebar';
        sidebar.id = 'sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <div class="logo">
                    <img src="${logoPath}" alt="N2STORE" class="sidebar-logo-img">
                    <span>N2STORE</span>
                </div>
                <button class="sidebar-toggle" id="sidebarToggle">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
                </button>
            </div>
            <nav class="sidebar-nav" id="sidebarNav"></nav>
            <div class="sidebar-footer">
                <div class="user-info">
                    <div class="user-avatar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>
                    </div>
                    <div class="user-details">
                        <div class="user-name" id="userName">Admin</div>
                        <div class="user-role">Quản trị viên</div>
                    </div>
                </div>
                <button class="btn-permissions" id="btnPermissions">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
                    <span>Xem Quyền Của Tôi</span>
                </button>
                <button class="btn-logout" id="btnLogout">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                    <span>Đăng xuất</span>
                </button>
            </div>
        `;

        // Wrap existing body content in main-content
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) {
            const wrapper = document.createElement('main');
            wrapper.className = 'main-content';
            // Move all body children into wrapper (except scripts that shouldn't move)
            while (document.body.firstChild) {
                wrapper.appendChild(document.body.firstChild);
            }
            document.body.appendChild(sidebar);
            document.body.appendChild(wrapper);
        } else {
            document.body.insertBefore(sidebar, document.body.firstChild);
        }

        console.log("[Unified Nav] Sidebar auto-created successfully");
    }

    /**
     * Inject sidebar CSS for pages that don't have modern.css
     */
    injectSidebarStyles() {
        if (document.getElementById('unified-nav-sidebar-styles')) return;
        const style = document.createElement('style');
        style.id = 'unified-nav-sidebar-styles';
        style.textContent = `
            /* CSS Variables fallbacks for pages without modern.css */
            :root {
                --sidebar-width: var(--sidebar-width, 260px);
                --surface: var(--surface, #ffffff);
                --border: var(--border, #e5e7eb);
                --primary: var(--primary, #6366f1);
                --primary-dark: var(--primary-dark, #4f46e5);
                --gray-50: var(--gray-50, #f9fafb);
                --gray-100: var(--gray-100, #f3f4f6);
                --gray-200: var(--gray-200, #e5e7eb);
                --gray-300: var(--gray-300, #d1d5db);
                --text-primary: var(--text-primary, #111827);
                --text-secondary: var(--text-secondary, #4b5563);
                --text-tertiary: var(--text-tertiary, #9ca3af);
                --danger: var(--danger, #ef4444);
                --spacing-xs: var(--spacing-xs, 0.25rem);
                --spacing-sm: var(--spacing-sm, 0.5rem);
                --spacing-md: var(--spacing-md, 1rem);
                --spacing-lg: var(--spacing-lg, 1.5rem);
                --radius: var(--radius, 0.5rem);
                --radius-lg: var(--radius-lg, 1rem);
                --transition-fast: var(--transition-fast, 150ms ease);
                --transition: var(--transition, 200ms ease);
                --transition-slow: var(--transition-slow, 300ms ease);
                --shadow-lg: var(--shadow-lg, 0 10px 15px -3px rgb(0 0 0 / 0.1));
                --shadow-xl: var(--shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1));
            }

            .sidebar {
                position: fixed;
                left: 0;
                top: 0;
                width: 260px;
                width: var(--sidebar-width, 260px);
                height: 100vh;
                background: var(--surface, #fff);
                border-right: 1px solid var(--border, #e5e7eb);
                display: flex;
                flex-direction: column;
                z-index: 1000;
                transition: transform 300ms ease;
                font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .sidebar.collapsed { transform: translateX(-100%); }

            .sidebar-header {
                padding: 1.5rem;
                border-bottom: 1px solid var(--border, #e5e7eb);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .sidebar-header .logo {
                display: flex;
                align-items: center;
                gap: 1rem;
                font-size: 1.25rem;
                font-weight: 700;
                color: var(--primary, #6366f1);
            }
            .sidebar-logo-img {
                width: 32px;
                height: 32px;
                object-fit: contain;
                border-radius: 6px;
            }
            .sidebar-toggle {
                width: 36px; height: 36px;
                border: none; background: transparent;
                color: var(--text-secondary, #4b5563);
                border-radius: 0.5rem;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer;
                transition: 150ms ease;
            }
            .sidebar-toggle:hover { background: var(--gray-100, #f3f4f6); }

            .sidebar-nav {
                flex: 1;
                padding: 1.5rem;
                overflow-y: auto;
                overflow-x: hidden;
            }
            .sidebar-nav::-webkit-scrollbar { width: 6px; }
            .sidebar-nav::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }

            .sidebar-footer {
                padding: 1.5rem;
                border-top: 1px solid var(--border, #e5e7eb);
            }
            .user-info {
                display: flex; align-items: center; gap: 1rem;
                margin-bottom: 1rem;
            }
            .user-avatar {
                width: 40px; height: 40px; border-radius: 50%;
                background: var(--gray-100, #f3f4f6);
                display: flex; align-items: center; justify-content: center;
                color: var(--primary, #6366f1);
                flex-shrink: 0;
            }
            .user-details { flex: 1; min-width: 0; }
            .user-name {
                font-weight: 600; color: var(--text-primary, #111827);
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .user-role { font-size: 0.75rem; color: var(--text-tertiary, #9ca3af); }

            .btn-permissions, .btn-logout {
                width: 100%; padding: 1rem; border: none; border-radius: 0.5rem;
                font-weight: 500; font-size: 0.875rem;
                display: flex; align-items: center; justify-content: center; gap: 0.5rem;
                cursor: pointer; transition: 150ms ease;
            }
            .btn-permissions {
                background: var(--gray-100, #f3f4f6);
                color: var(--text-primary, #111827);
                margin-bottom: 0.5rem;
            }
            .btn-permissions:hover { background: var(--gray-200, #e5e7eb); }
            .btn-logout { background: var(--danger, #ef4444); color: white; }
            .btn-logout:hover { background: #dc2626; }

            .main-content {
                margin-left: 260px;
                margin-left: var(--sidebar-width, 260px);
                min-height: 100vh;
                transition: margin-left 300ms ease;
            }
            .sidebar.collapsed ~ .main-content { margin-left: 0; }

            .sidebar-toggle-fixed {
                position: fixed; left: 20px; top: 20px;
                width: 48px; height: 48px;
                border-radius: 1rem; background: var(--primary, #6366f1);
                color: white; border: none;
                box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
                display: none; align-items: center; justify-content: center;
                cursor: pointer; z-index: 1001;
                transition: all 200ms ease;
            }
            .sidebar.collapsed ~ .main-content .sidebar-toggle-fixed {
                display: flex;
            }
            .sidebar-toggle-fixed:hover {
                background: var(--primary-dark, #4f46e5);
                transform: scale(1.05);
            }
        `;
        // Insert at beginning of <head> so page-specific CSS takes priority
        document.head.insertBefore(style, document.head.firstChild);
    }

    /**
     * Replace sidebar header logo icon with N2STORE logo image
     */
    updateSidebarLogo() {
        const logoEl = document.querySelector('.sidebar-header .logo');
        if (!logoEl) return;

        // Compute logo path from navigation-modern.js script src
        const scriptTag = document.querySelector('script[src*="navigation-modern"]');
        let logoPath = '../shared/images/logo.jpg';
        if (scriptTag) {
            const src = scriptTag.getAttribute('src');
            logoPath = src.replace('js/navigation-modern.js', 'images/logo.jpg');
        }

        logoEl.innerHTML = `
            <img src="${logoPath}" alt="N2STORE" class="sidebar-logo-img">
            <span>N2STORE</span>
        `;
    }

    /**
     * Initialize shop selector (NJD LIVE / NJD SHOP) in sidebar header
     */
    initShopSelector() {
        const header = document.querySelector('.sidebar-header');
        if (!header || !window.ShopConfig) return;

        // Remove existing shop selector if any (from HTML or previous render)
        const existing = header.querySelector('.shop-selector');
        if (existing) existing.remove();

        // Create shop selector
        const select = document.createElement('select');
        select.className = 'shop-selector';
        select.id = 'shopSelector';

        window.ShopConfig.getShops().forEach(shop => {
            const opt = document.createElement('option');
            opt.value = shop.id;
            opt.textContent = shop.label;
            select.appendChild(opt);
        });

        select.value = window.ShopConfig.getSelectedShopId();

        select.addEventListener('change', (e) => {
            window.ShopConfig.setShop(e.target.value);
            console.log('[ShopSelector] Switched to:', e.target.value);
            // Reload page to re-init TokenManager with new company
            // Pages that handle shop change in-place (e.g. purchase-orders)
            // should set window._shopChangeNoReload = true before this fires
            if (!window._shopChangeNoReload) {
                window.location.reload();
            }
        });

        // Insert after logo, before toggle button
        const toggle = header.querySelector('.sidebar-toggle');
        if (toggle) {
            header.insertBefore(select, toggle);
        } else {
            header.appendChild(select);
        }

        // Inject shop selector styles
        this.injectShopSelectorStyles();
    }

    /**
     * Inject CSS for shop selector
     */
    injectShopSelectorStyles() {
        if (document.getElementById('shop-selector-styles')) return;
        const style = document.createElement('style');
        style.id = 'shop-selector-styles';
        style.textContent = `
            .shop-selector {
                padding: 4px 8px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                color: #374151;
                background: #f9fafb;
                cursor: pointer;
                outline: none;
                transition: border-color 0.2s;
                -webkit-appearance: none;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 6px center;
                padding-right: 22px;
            }
            .shop-selector:hover {
                border-color: #6366f1;
            }
            .shop-selector:focus {
                border-color: #6366f1;
                box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
            }
            .sidebar.collapsed .shop-selector {
                display: none;
            }
            .mobile-shop-selector {
                margin-left: auto;
                margin-right: 8px;
                font-size: 11px;
                padding: 3px 20px 3px 6px;
            }
        `;
        document.head.insertBefore(style, document.head.firstChild);
    }

    renderDesktopSidebar() {
        console.log("[Unified Nav] Rendering desktop sidebar...");

        const sidebarNav = document.querySelector(".sidebar-nav");
        if (!sidebarNav) {
            console.error("[Unified Nav] Sidebar nav element not found!");
            return;
        }

        sidebarNav.innerHTML = "";

        // Inject grouped menu styles
        this.injectGroupedMenuStyles();

        // Get filtered layout based on user permissions
        const filteredLayout = MenuLayoutStore.getFilteredLayout(this.userPermissions);
        let renderedCount = 0;

        // Create groups container
        const groupsContainer = document.createElement("div");
        groupsContainer.className = "menu-groups-container";
        groupsContainer.id = "menuGroupsContainer";

        // Render each group
        filteredLayout.groups.forEach((group) => {
            const groupEl = this.createGroupElement(group);
            groupsContainer.appendChild(groupEl);
            renderedCount += group.items.length;
        });

        // Render ungrouped items if any
        if (filteredLayout.ungroupedItems && filteredLayout.ungroupedItems.length > 0) {
            const ungroupedGroup = {
                id: 'ungrouped',
                name: 'Chưa phân nhóm',
                icon: 'more-horizontal',
                collapsed: false,
                items: filteredLayout.ungroupedItems
            };
            const ungroupedEl = this.createGroupElement(ungroupedGroup, true);
            groupsContainer.appendChild(ungroupedEl);
            renderedCount += filteredLayout.ungroupedItems.length;
        }

        sidebarNav.appendChild(groupsContainer);

        console.log(
            `[Unified Nav] Rendered ${renderedCount} desktop menu items in ${filteredLayout.groups.length} groups`,
        );

        this.addSettingsToNavigation(sidebarNav);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
            console.log("[Unified Nav] Lucide icons initialized");
        }

        // Setup event listeners
        this.setupGroupCollapseListeners();

    }

    /**
     * Setup group collapse/expand listeners
     */
    setupGroupCollapseListeners() {
        document.querySelectorAll('.menu-group-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const groupEl = header.closest('.menu-group');
                const groupId = groupEl.dataset.groupId;
                const isCollapsed = groupEl.classList.toggle('collapsed');
                this.saveGroupCollapsedState(groupId, isCollapsed);
            });
        });
    }

    /**
     * Create a group element with header and items (for sidebar display only)
     */
    createGroupElement(group, isUngrouped = false) {
        const groupEl = document.createElement("div");
        groupEl.className = `menu-group`;
        groupEl.dataset.groupId = group.id;

        // Always start collapsed on page load
        groupEl.classList.add('collapsed');
        
        // But expand the group containing the active page
        const hasActivePage = group.items.some(item => item.pageIdentifier === this.currentPage);
        if (hasActivePage) groupEl.classList.remove('collapsed');

        // Group header
        const header = document.createElement("div");
        header.className = "menu-group-header";
        header.innerHTML = `
            <span class="group-collapse-icon"><i data-lucide="chevron-down"></i></span>
            <i data-lucide="${group.icon}" class="group-icon"></i>
            <span class="group-name">${group.name}</span>
            <span class="group-count">${group.items.length}</span>
        `;
        groupEl.appendChild(header);

        // Group items container
        const itemsContainer = document.createElement("div");
        itemsContainer.className = "menu-group-items";

        group.items.forEach((menuItem) => {
            const navItem = document.createElement("a");
            navItem.href = menuItem.href;
            navItem.className = "nav-item";

            if (menuItem.pageIdentifier === this.currentPage) {
                navItem.classList.add("active");
            }

            navItem.innerHTML = `
                <i data-lucide="${menuItem.icon}"></i>
                <span>${menuItem.text}</span>
            `;

            itemsContainer.appendChild(navItem);
        });

        groupEl.appendChild(itemsContainer);
        return groupEl;
    }

    /**
     * Get group collapsed state from localStorage
     */
    getGroupCollapsedState() {
        try {
            const state = localStorage.getItem('n2shop_menu_group_collapsed');
            return state ? JSON.parse(state) : {};
        } catch (e) {
            return {};
        }
    }

    /**
     * Save group collapsed state to localStorage
     */
    saveGroupCollapsedState(groupId, isCollapsed) {
        try {
            const state = this.getGroupCollapsedState();
            state[groupId] = isCollapsed;
            localStorage.setItem('n2shop_menu_group_collapsed', JSON.stringify(state));
        } catch (e) {
            console.error('[Menu] Error saving collapsed state:', e);
        }
    }

    /**
     * Inject CSS styles for grouped menus
     */
    injectGroupedMenuStyles() {
        if (document.getElementById('groupedMenuStyles')) return;

        const style = document.createElement('style');
        style.id = 'groupedMenuStyles';
        style.textContent = `
            /* Sidebar Logo */
            .sidebar-logo-img {
                width: 32px;
                height: 32px;
                object-fit: contain;
                border-radius: 6px;
            }

            /* Edit Controls */
            .menu-edit-controls {
                padding: 8px 12px;
                border-bottom: 1px solid var(--border, rgba(0,0,0,0.1));
                margin-bottom: 8px;
            }
            .menu-edit-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                padding: 8px 12px;
                background: rgba(99, 102, 241, 0.1);
                border: 1px solid rgba(99, 102, 241, 0.3);
                border-radius: 8px;
                color: #6366f1;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            }
            .menu-edit-toggle:hover {
                background: rgba(99, 102, 241, 0.2);
            }
            .menu-edit-toggle i {
                width: 16px;
                height: 16px;
            }

            /* Groups Container */
            .menu-groups-container {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            /* Group */
            .menu-group {
                border-radius: 8px;
                overflow: hidden;
            }
            .menu-group-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                background: var(--gray-100, rgba(0,0,0,0.03));
                cursor: pointer;
                user-select: none;
                transition: background 0.2s;
                border-radius: 8px;
                margin-bottom: 2px;
            }
            .menu-group-header:hover {
                background: var(--gray-200, rgba(0,0,0,0.06));
            }
            .group-collapse-icon {
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-secondary, #64748b);
                transition: transform 0.2s ease;
            }
            .menu-group.collapsed .group-collapse-icon {
                transform: rotate(-90deg);
            }
            .group-collapse-icon i,
            .group-collapse-icon svg {
                width: 14px;
                height: 14px;
                stroke-width: 2.5;
            }
            .group-icon {
                width: 16px;
                height: 16px;
                color: #6366f1;
            }
            .group-name {
                flex: 1;
                font-size: 11px;
                font-weight: 600;
                color: var(--text-secondary, #64748b);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .group-count {
                font-size: 10px;
                color: var(--text-secondary, #64748b);
                background: var(--gray-200, rgba(0,0,0,0.06));
                padding: 2px 6px;
                border-radius: 10px;
            }

            /* Group Items */
            .menu-group-items {
                padding-left: 8px;
                overflow: hidden;
                transition: max-height 0.3s ease;
            }
            .menu-group.collapsed .menu-group-items {
                display: none;
            }
            .nav-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                margin-bottom: 4px;
                border-radius: var(--radius, 8px);
                color: var(--gray-600, #4b5563);
                text-decoration: none;
                font-weight: 500;
                transition: 0.2s;
            }
            .nav-item:hover {
                background: var(--gray-100, #f3f4f6);
                color: var(--gray-900, #111827);
            }
            .nav-item.active {
                background: var(--primary, #6366f1);
                color: white;
            }
            .nav-item i {
                width: 20px;
                height: 20px;
            }
            .menu-group-items .nav-item {
                padding-left: 20px;
                font-size: 13px;
            }

        `;
        document.head.insertBefore(style, document.head.firstChild);
    }

    addSettingsToNavigation(sidebarNav) {
        const divider = document.createElement("div");
        divider.className = "nav-divider";
        divider.innerHTML =
            '<hr style="border: none; border-top: 1px solid var(--border, rgba(0,0,0,0.1)); margin: 16px 0;">';
        sidebarNav.appendChild(divider);

        const settingsBtn = document.createElement("button");
        settingsBtn.id = "btnSettings";
        settingsBtn.className = "nav-item nav-settings-btn";
        settingsBtn.innerHTML = `
            <i data-lucide="settings"></i>
            <span>Cài Đặt</span>
        `;
        sidebarNav.appendChild(settingsBtn);

        if (!document.getElementById("settingsNavStyles")) {
            const style = document.createElement("style");
            style.id = "settingsNavStyles";
            style.textContent = `
                .nav-settings-btn {
                    background: none !important;
                    border: none;
                    width: 100%;
                    text-align: left;
                    cursor: pointer;
                    margin-top: 8px;
                }
                .nav-settings-btn:hover {
                    background: rgba(255, 255, 255, 0.1) !important;
                }
                .nav-settings-btn i {
                    color: #fbbf24;
                }
            `;
            document.head.insertBefore(style, document.head.firstChild);
        }

        console.log("[Unified Nav] Settings button added");
    }

    // =====================================================
    // MENU EDIT MODAL (Admin Only)
    // =====================================================

    /**
     * Load SortableJS library dynamically
     */
    async loadSortableJS() {
        if (window.Sortable) return true;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
            script.onload = () => resolve(true);
            script.onerror = () => reject(new Error('Failed to load SortableJS'));
            document.head.appendChild(script);
        });
    }

    /**
     * Show menu edit modal (full screen)
     */
    async showMenuEditModal() {
        if (!this.isAdminTemplate) {
            alert('Chỉ admin mới có thể chỉnh sửa menu');
            return;
        }

        // Load SortableJS first
        await this.loadSortableJS();

        // Get current layout with any new menu items included
        const rawLayout = MenuLayoutStore.getLayout();
        const layout = MenuLayoutStore._addNewMenuItems(rawLayout);
        MenuLayoutStore.setEditing(true);

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'menu-edit-modal-overlay';
        modal.id = 'menuEditModal';

        // Build groups HTML
        const groupsHtml = layout.groups.map(group => `
            <div class="edit-group" data-group-id="${group.id}">
                <div class="edit-group-header">
                    <span class="edit-group-drag-handle"><i data-lucide="grip-vertical"></i></span>
                    <i data-lucide="${group.icon}" class="edit-group-icon"></i>
                    <span class="edit-group-name">${group.name}</span>
                    <span class="edit-group-count">${group.items.length}</span>
                    <div class="edit-group-actions">
                        <button class="edit-group-btn rename-btn" data-group-id="${group.id}" title="Đổi tên">
                            <i data-lucide="pencil"></i>
                        </button>
                        <button class="edit-group-btn delete-btn" data-group-id="${group.id}" title="Xóa nhóm">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
                <div class="edit-group-items" data-group-id="${group.id}">
                    ${group.items.map(pageId => {
                        const menuItem = MENU_CONFIG.find(m => m.pageIdentifier === pageId);
                        if (!menuItem) return '';
                        return `
                            <div class="edit-item" data-page-id="${pageId}">
                                <span class="edit-item-drag-handle"><i data-lucide="grip-vertical"></i></span>
                                <i data-lucide="${menuItem.icon}"></i>
                                <span>${menuItem.text}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `).join('');

        // Build ungrouped items HTML - always show as drop target
        const ungroupedItems = layout.ungroupedItems || [];
        const ungroupedHtml = `
            <div class="edit-group edit-group-ungrouped" data-group-id="ungrouped">
                <div class="edit-group-header">
                    <i data-lucide="more-horizontal" class="edit-group-icon"></i>
                    <span class="edit-group-name">Chưa phân nhóm</span>
                    <span class="edit-group-count">${ungroupedItems.length}</span>
                </div>
                <div class="edit-group-items" data-group-id="ungrouped">
                    ${ungroupedItems.map(pageId => {
                        const menuItem = MENU_CONFIG.find(m => m.pageIdentifier === pageId);
                        if (!menuItem) return '';
                        return `
                            <div class="edit-item" data-page-id="${pageId}">
                                <span class="edit-item-drag-handle"><i data-lucide="grip-vertical"></i></span>
                                <i data-lucide="${menuItem.icon}"></i>
                                <span>${menuItem.text}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        modal.innerHTML = `
            <div class="menu-edit-modal">
                <div class="menu-edit-header">
                    <h2><i data-lucide="layout-grid"></i> Chỉnh Sửa Menu Sidebar</h2>
                    <p>Kéo thả để sắp xếp nhóm và menu items</p>
                    <button class="menu-edit-close" id="closeMenuEditModal">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="menu-edit-body">
                    <div class="menu-edit-groups" id="editGroupsContainer">
                        ${groupsHtml}
                        ${ungroupedHtml}
                    </div>
                    <button class="menu-edit-add-group" id="addNewGroupBtn">
                        <i data-lucide="plus"></i>
                        Thêm Nhóm Mới
                    </button>
                </div>
                <div class="menu-edit-footer">
                    <button class="btn-secondary" id="cancelMenuEdit">Hủy</button>
                    <button class="btn-primary" id="saveMenuEdit">
                        <i data-lucide="check"></i>
                        Lưu Thay Đổi
                    </button>
                </div>
            </div>
        `;

        // Inject modal styles
        this.injectMenuEditModalStyles();

        document.body.appendChild(modal);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Initialize sortable
        this.initializeEditModalSortable();

        // Event listeners
        const closeModal = () => {
            this.destroyEditModalSortables();
            MenuLayoutStore.setEditing(false);
            modal.remove();
        };

        document.getElementById('closeMenuEditModal').addEventListener('click', closeModal);
        document.getElementById('cancelMenuEdit').addEventListener('click', closeModal);

        document.getElementById('saveMenuEdit').addEventListener('click', () => {
            // Layout is already being saved on each drag operation
            closeModal();
            this.renderDesktopSidebar();
        });

        document.getElementById('addNewGroupBtn').addEventListener('click', () => {
            this.showAddGroupModalInEdit();
        });

        // Rename/Delete buttons
        modal.querySelectorAll('.rename-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupId = btn.dataset.groupId;
                this.showRenameGroupModalInEdit(groupId);
            });
        });

        modal.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupId = btn.dataset.groupId;
                this.deleteGroupInEdit(groupId);
            });
        });
    }

    /**
     * Initialize SortableJS for edit modal
     */
    initializeEditModalSortable() {
        if (!window.Sortable) return;

        // Make groups sortable
        const groupsContainer = document.getElementById('editGroupsContainer');
        if (groupsContainer) {
            this.groupSortable = new Sortable(groupsContainer, {
                animation: 150,
                handle: '.edit-group-drag-handle',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                filter: '.edit-group-ungrouped',
                onEnd: (evt) => this.handleGroupReorderInEdit(evt)
            });
        }

        // Make items within each group sortable
        this.itemSortables = [];
        document.querySelectorAll('.edit-group-items').forEach(container => {
            const sortable = new Sortable(container, {
                group: 'edit-menu-items',
                animation: 150,
                handle: '.edit-item-drag-handle',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                onEnd: (evt) => this.handleItemMoveInEdit(evt)
            });
            this.itemSortables.push(sortable);
        });
    }

    /**
     * Destroy sortable instances
     */
    destroyEditModalSortables() {
        if (this.groupSortable) {
            this.groupSortable.destroy();
            this.groupSortable = null;
        }
        this.itemSortables.forEach(s => s.destroy());
        this.itemSortables = [];
    }

    /**
     * Handle group reorder in edit modal
     */
    handleGroupReorderInEdit(evt) {
        const layout = MenuLayoutStore.getLayout();
        const groups = [...layout.groups];
        const [moved] = groups.splice(evt.oldIndex, 1);
        groups.splice(evt.newIndex, 0, moved);
        MenuLayoutStore.saveLayout({ ...layout, groups });
    }

    /**
     * Handle item move in edit modal
     */
    handleItemMoveInEdit(evt) {
        const fromGroupId = evt.from.dataset.groupId;
        const toGroupId = evt.to.dataset.groupId;
        const pageId = evt.item.dataset.pageId;

        const layout = MenuLayoutStore.getLayout();

        // Remove from source
        if (fromGroupId === 'ungrouped') {
            layout.ungroupedItems = layout.ungroupedItems.filter(id => id !== pageId);
        } else {
            const fromGroup = layout.groups.find(g => g.id === fromGroupId);
            if (fromGroup) fromGroup.items = fromGroup.items.filter(id => id !== pageId);
        }

        // Add to target
        if (toGroupId === 'ungrouped') {
            layout.ungroupedItems = layout.ungroupedItems || [];
            layout.ungroupedItems.splice(evt.newIndex, 0, pageId);
        } else {
            const toGroup = layout.groups.find(g => g.id === toGroupId);
            if (toGroup) toGroup.items.splice(evt.newIndex, 0, pageId);
        }

        MenuLayoutStore.saveLayout(layout);

        // Update counts in modal
        this.updateGroupCountsInModal();
    }

    /**
     * Update group counts in edit modal
     */
    updateGroupCountsInModal() {
        const layout = MenuLayoutStore.getLayout();
        layout.groups.forEach(group => {
            const countEl = document.querySelector(`.edit-group[data-group-id="${group.id}"] .edit-group-count`);
            if (countEl) countEl.textContent = group.items.length;
        });
        const ungroupedCountEl = document.querySelector('.edit-group-ungrouped .edit-group-count');
        if (ungroupedCountEl) ungroupedCountEl.textContent = (layout.ungroupedItems || []).length;
    }

    /**
     * Show add group modal (inside edit modal)
     */
    showAddGroupModalInEdit() {
        const name = prompt('Nhập tên nhóm mới:');
        if (!name || !name.trim()) return;

        const layout = MenuLayoutStore.getLayout();
        const newGroup = {
            id: `group_${Date.now()}`,
            name: name.trim(),
            icon: 'folder',
            collapsed: false,
            items: []
        };
        layout.groups.push(newGroup);
        MenuLayoutStore.saveLayout(layout);

        // Refresh edit modal
        document.getElementById('menuEditModal')?.remove();
        this.showMenuEditModal();
    }

    /**
     * Show rename group modal (inside edit modal)
     */
    showRenameGroupModalInEdit(groupId) {
        const layout = MenuLayoutStore.getLayout();
        const group = layout.groups.find(g => g.id === groupId);
        if (!group) return;

        const newName = prompt('Nhập tên mới cho nhóm:', group.name);
        if (!newName || !newName.trim()) return;

        group.name = newName.trim();
        MenuLayoutStore.saveLayout(layout);

        // Update name in modal
        const nameEl = document.querySelector(`.edit-group[data-group-id="${groupId}"] .edit-group-name`);
        if (nameEl) nameEl.textContent = newName.trim();
    }

    /**
     * Delete group (inside edit modal)
     */
    deleteGroupInEdit(groupId) {
        if (!confirm('Xóa nhóm này? Các menu sẽ được chuyển sang "Chưa phân nhóm".')) return;

        const layout = MenuLayoutStore.getLayout();
        const groupIndex = layout.groups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) return;

        const group = layout.groups[groupIndex];
        layout.ungroupedItems = layout.ungroupedItems || [];
        layout.ungroupedItems.push(...group.items);
        layout.groups.splice(groupIndex, 1);
        MenuLayoutStore.saveLayout(layout);

        // Refresh edit modal
        document.getElementById('menuEditModal')?.remove();
        this.showMenuEditModal();
    }

    /**
     * Inject CSS for menu edit modal
     */
    injectMenuEditModalStyles() {
        if (document.getElementById('menuEditModalStyles')) return;

        const style = document.createElement('style');
        style.id = 'menuEditModalStyles';
        style.textContent = `
            .menu-edit-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.8);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .menu-edit-modal {
                background: #1e293b;
                border-radius: 16px;
                width: 100%;
                max-width: 600px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            }
            .menu-edit-header {
                padding: 20px 24px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                position: relative;
            }
            .menu-edit-header h2 {
                margin: 0 0 4px 0;
                font-size: 18px;
                color: white;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .menu-edit-header p {
                margin: 0;
                font-size: 13px;
                color: rgba(255,255,255,0.5);
            }
            .menu-edit-close {
                position: absolute;
                top: 16px;
                right: 16px;
                background: none;
                border: none;
                color: rgba(255,255,255,0.5);
                cursor: pointer;
                padding: 8px;
                border-radius: 8px;
            }
            .menu-edit-close:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            .menu-edit-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px 24px;
            }
            .menu-edit-groups {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .edit-group {
                background: rgba(255,255,255,0.05);
                border-radius: 12px;
                overflow: hidden;
            }
            .edit-group-header {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                background: rgba(255,255,255,0.05);
            }
            .edit-group-drag-handle {
                cursor: grab;
                color: rgba(255,255,255,0.3);
                display: flex;
                align-items: center;
            }
            .edit-group-drag-handle:hover {
                color: rgba(255,255,255,0.6);
            }
            .edit-group-icon {
                width: 18px;
                height: 18px;
                color: #a5b4fc;
            }
            .edit-group-name {
                flex: 1;
                font-weight: 600;
                color: white;
                font-size: 14px;
            }
            .edit-group-count {
                font-size: 12px;
                color: rgba(255,255,255,0.4);
                background: rgba(255,255,255,0.1);
                padding: 2px 8px;
                border-radius: 10px;
            }
            .edit-group-actions {
                display: flex;
                gap: 4px;
            }
            .edit-group-btn {
                padding: 6px;
                background: none;
                border: none;
                color: rgba(255,255,255,0.4);
                cursor: pointer;
                border-radius: 6px;
            }
            .edit-group-btn:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            .edit-group-btn.delete-btn:hover {
                color: #f87171;
            }
            .edit-group-items {
                padding: 8px;
                min-height: 40px;
            }
            .edit-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                background: rgba(255,255,255,0.03);
                border-radius: 8px;
                margin-bottom: 4px;
                color: rgba(255,255,255,0.8);
                font-size: 13px;
            }
            .edit-item:last-child {
                margin-bottom: 0;
            }
            .edit-item-drag-handle {
                cursor: grab;
                color: rgba(255,255,255,0.3);
                display: flex;
                align-items: center;
            }
            .edit-item-drag-handle:hover {
                color: rgba(255,255,255,0.6);
            }
            .edit-item i:not(.edit-item-drag-handle i) {
                width: 16px;
                height: 16px;
                color: rgba(255,255,255,0.5);
            }
            .menu-edit-add-group {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                width: 100%;
                padding: 14px;
                margin-top: 12px;
                background: rgba(34, 197, 94, 0.1);
                border: 2px dashed rgba(34, 197, 94, 0.3);
                border-radius: 12px;
                color: #86efac;
                cursor: pointer;
                font-size: 14px;
            }
            .menu-edit-add-group:hover {
                background: rgba(34, 197, 94, 0.15);
                border-color: rgba(34, 197, 94, 0.5);
            }
            .menu-edit-footer {
                padding: 16px 24px;
                border-top: 1px solid rgba(255,255,255,0.1);
                display: flex;
                justify-content: flex-end;
                gap: 12px;
            }
            .menu-edit-footer .btn-secondary {
                padding: 10px 20px;
                background: rgba(255,255,255,0.1);
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
            }
            .menu-edit-footer .btn-secondary:hover {
                background: rgba(255,255,255,0.15);
            }
            .menu-edit-footer .btn-primary {
                padding: 10px 20px;
                background: #6366f1;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .menu-edit-footer .btn-primary:hover {
                background: #5558e3;
            }
            /* Sortable states */
            .sortable-ghost {
                opacity: 0.4;
            }
            .sortable-chosen {
                background: rgba(99, 102, 241, 0.2) !important;
            }
        `;
        document.head.insertBefore(style, document.head.firstChild);
    }

    // =====================================================
    // SIDEBAR TOGGLE (Desktop Only)
    // =====================================================

    initializeSidebarToggle() {
        const sidebar = document.getElementById("sidebar");
        const sidebarToggle = document.getElementById("sidebarToggle");

        if (!sidebar || !sidebarToggle) {
            console.warn("[Unified Nav] Sidebar toggle elements not found");
            return;
        }

        sidebarToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleSidebar();
        });

        this.createFixedToggleButton();
        this.restoreSidebarState();

        console.log("[Unified Nav] Sidebar toggle initialized");
    }

    toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        if (sidebar.classList.contains("collapsed")) {
            this.showSidebar();
        } else {
            this.hideSidebar();
        }
    }

    hideSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        sidebar.classList.add("collapsed");
        localStorage.setItem("sidebarCollapsed", "true");

        const sidebarToggle = document.getElementById("sidebarToggle");
        const icon = sidebarToggle?.querySelector("i");
        if (icon) {
            icon.setAttribute("data-lucide", "panel-left-open");
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }

        console.log("[Unified Nav] Sidebar hidden");
    }

    showSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;

        sidebar.classList.remove("collapsed");
        localStorage.setItem("sidebarCollapsed", "false");

        const sidebarToggle = document.getElementById("sidebarToggle");
        const icon = sidebarToggle?.querySelector("i");
        if (icon) {
            icon.setAttribute("data-lucide", "panel-left-close");
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
        }

        console.log("[Unified Nav] Sidebar shown");
    }

    createFixedToggleButton() {
        const mainContent = document.querySelector(".main-content");
        if (!mainContent) return;

        if (document.querySelector(".sidebar-toggle-fixed")) return;

        const fixedBtn = document.createElement("button");
        fixedBtn.className = "sidebar-toggle-fixed";
        fixedBtn.innerHTML = '<i data-lucide="panel-left-open"></i>';
        fixedBtn.title = "Mở sidebar";

        fixedBtn.addEventListener("click", () => {
            this.showSidebar();
        });

        mainContent.appendChild(fixedBtn);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        console.log("[Unified Nav] Fixed toggle button created");
    }

    restoreSidebarState() {
        const sidebar = document.getElementById("sidebar");
        const mainContent = document.querySelector(".main-content");

        if (!sidebar || !mainContent) return;

        if (window.innerWidth > 768) {
            const storedState = localStorage.getItem("sidebarCollapsed");
            const isCollapsed =
                storedState === null ? true : storedState === "true";

            if (storedState === null) {
                localStorage.setItem("sidebarCollapsed", "true");
            }

            if (isCollapsed) {
                sidebar.classList.add("collapsed");
                mainContent.classList.add("expanded");

                const sidebarToggle = document.getElementById("sidebarToggle");
                const icon = sidebarToggle?.querySelector("i");
                if (icon) {
                    icon.setAttribute("data-lucide", "panel-left-open");
                    if (typeof lucide !== "undefined") {
                        lucide.createIcons();
                    }
                }

                console.log("[Unified Nav] Sidebar state restored: collapsed");
            }
        }
    }

    // =====================================================
    // SHARED FUNCTIONALITY
    // =====================================================

    updateUserInfo() {
        const userInfo = window.authManager?.getUserInfo();
        if (!userInfo) return;

        const userName = document.getElementById("userName");
        if (userName) {
            // Check if edit button already exists
            const existingEditBtn = userName.parentElement.querySelector('.edit-displayname-btn');
            if (!existingEditBtn) {
                // Create wrapper for name + edit button
                const nameWrapper = document.createElement('div');
                nameWrapper.style.display = 'flex';
                nameWrapper.style.alignItems = 'center';
                nameWrapper.style.gap = '8px';

                // Create name span
                const nameSpan = document.createElement('span');
                nameSpan.id = 'userName';
                nameSpan.textContent = userInfo.displayName || "User";

                // Create edit button
                const editBtn = document.createElement('button');
                editBtn.className = 'edit-displayname-btn';
                editBtn.id = 'editDisplayNameDesktop';
                editBtn.title = 'Chỉnh sửa tên hiển thị';
                editBtn.innerHTML = '<i data-lucide="pencil"></i>';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showEditDisplayNameModal();
                });

                // Replace userName with wrapper
                userName.replaceWith(nameWrapper);
                nameWrapper.appendChild(nameSpan);
                nameWrapper.appendChild(editBtn);

                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            } else {
                userName.textContent = userInfo.displayName || "User";
            }
        }

        const userRole = document.querySelector(".user-role");
        if (userRole) {
            const roleMap = {
                0: "Admin",
                1: "Manager",
                3: "Staff",
                777: "Guest",
            };
            const checkLogin = localStorage.getItem("checkLogin");
            userRole.textContent = roleMap[checkLogin] || "User";
        }

        console.log("[Unified Nav] User info updated");
    }

    setupEventListeners() {
        const mobileMenuBtn = document.getElementById("mobileMenuBtn");
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener("click", () =>
                this.showMobileMenu(),
            );
        }

        const menuToggle = document.getElementById("menuToggle");
        const sidebar = document.getElementById("sidebar");

        if (menuToggle && sidebar && !this.isMobile) {
            menuToggle.addEventListener("click", () => {
                sidebar.classList.toggle("active");
            });
        }

        document.addEventListener("click", (e) => {
            if (window.innerWidth <= 768 && sidebar) {
                if (
                    !sidebar.contains(e.target) &&
                    menuToggle &&
                    !menuToggle.contains(e.target) &&
                    sidebar.classList.contains("active")
                ) {
                    sidebar.classList.remove("active");
                }
            }
        });

        const btnLogout = document.getElementById("btnLogout");
        if (btnLogout) {
            btnLogout.addEventListener("click", () => {
                this.showLogoutConfirmDialog();
            });
        }

        const btnPermissions = document.getElementById("btnPermissions");
        if (btnPermissions) {
            btnPermissions.addEventListener("click", () => {
                this.showPermissionsSummary();
            });
        }

        const btnSettings = document.getElementById("btnSettings");
        if (btnSettings) {
            btnSettings.addEventListener("click", () => {
                this.showSettings();
            });
        }

        console.log("[Unified Nav] Event listeners setup complete");
    }

    getAccessiblePages() {
        // ALL users check detailedPermissions - NO admin bypass
        const accessible = MENU_CONFIG.filter((item) => {
            // Items without permissionRequired are accessible to everyone
            if (!item.permissionRequired) return true;
            // Public access pages are accessible to everyone
            if (item.publicAccess) return true;
            return this.userPermissions.includes(item.permissionRequired);
        });

        console.log(
            "[Get Accessible] Found",
            accessible.length,
            "accessible pages",
        );
        return accessible;
    }

    // =====================================================
    // EDIT DISPLAY NAME FUNCTIONALITY
    // =====================================================

    showEditDisplayNameModal() {
        const userInfo = window.authManager?.getUserInfo();
        const currentDisplayName = userInfo?.displayName || "";

        // For mobile: show modal
        if (this.isMobile) {
            const modal = document.createElement("div");
            modal.className = "settings-modal-overlay";
            modal.innerHTML = `
                <div class="settings-modal" style="max-width: 450px;">
                    <div class="settings-header">
                        <h2>
                            <i data-lucide="edit-2"></i>
                            Chỉnh Sửa Tên Hiển Thị
                        </h2>
                        <button class="settings-close" id="closeEditModal">
                            <i data-lucide="x"></i>
                        </button>
                    </div>

                    <div class="settings-content">
                        <div class="setting-group">
                            <label class="setting-label">
                                <i data-lucide="user"></i>
                                Tên hiển thị hiện tại
                            </label>
                            <div style="padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 8px; color: #6366f1; font-weight: 600; margin-bottom: 16px;">
                                ${currentDisplayName}
                            </div>

                            <label class="setting-label" style="margin-top: 16px;">
                                <i data-lucide="edit"></i>
                                Tên hiển thị mới
                            </label>
                            <input
                                type="text"
                                id="newDisplayNameInput"
                                class="displayname-input"
                                placeholder="Nhập tên... (hỗ trợ emoji ☺️)"
                                value="${currentDisplayName}"
                                maxlength="100"
                            >
                            <div class="emoji-picker" style="margin-top: 12px;">
                                <button type="button" class="emoji-btn" data-emoji="😊">😊</button>
                                <button type="button" class="emoji-btn" data-emoji="🎉">🎉</button>
                                <button type="button" class="emoji-btn" data-emoji="💖">💖</button>
                                <button type="button" class="emoji-btn" data-emoji="⭐">⭐</button>
                                <button type="button" class="emoji-btn" data-emoji="🔥">🔥</button>
                                <button type="button" class="emoji-btn" data-emoji="✨">✨</button>
                                <button type="button" class="emoji-btn" data-emoji="🌸">🌸</button>
                                <button type="button" class="emoji-btn" data-emoji="🎨">🎨</button>
                                <button type="button" class="emoji-btn" data-emoji="💫">💫</button>
                                <button type="button" class="emoji-btn" data-emoji="🎯">🎯</button>
                            </div>
                        </div>
                    </div>

                    <div class="settings-footer">
                        <button class="btn-reset" id="cancelEditBtn">
                            <i data-lucide="x"></i>
                            Hủy
                        </button>
                        <button class="btn-save" id="saveDisplayNameBtn">
                            <i data-lucide="check"></i>
                            Lưu
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            const input = modal.querySelector("#newDisplayNameInput");
            const closeBtn = modal.querySelector("#closeEditModal");
            const cancelBtn = modal.querySelector("#cancelEditBtn");
            const saveBtn = modal.querySelector("#saveDisplayNameBtn");
            const emojiButtons = modal.querySelectorAll('.emoji-btn');

            // Add emoji button listeners
            emojiButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const emoji = btn.getAttribute('data-emoji');
                    const cursorPos = input.selectionStart;
                    const textBefore = input.value.substring(0, cursorPos);
                    const textAfter = input.value.substring(input.selectionEnd);
                    input.value = textBefore + emoji + textAfter;
                    input.focus();
                    input.selectionStart = input.selectionEnd = cursorPos + emoji.length;
                });
            });

            const closeModal = () => modal.remove();

            closeBtn.addEventListener("click", closeModal);
            cancelBtn.addEventListener("click", closeModal);
            modal.addEventListener("click", (e) => {
                if (e.target === modal) closeModal();
            });

            saveBtn.addEventListener("click", async () => {
                const newDisplayName = input.value.trim();

                if (!newDisplayName) {
                    this.showToast("Vui lòng nhập tên hiển thị!", "error");
                    input.focus();
                    return;
                }

                if (newDisplayName === currentDisplayName) {
                    this.showToast("Tên hiển thị không thay đổi!", "error");
                    return;
                }

                if (newDisplayName.length < 2) {
                    this.showToast("Tên hiển thị phải có ít nhất 2 ký tự!", "error");
                    input.focus();
                    return;
                }

                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i data-lucide="loader"></i> Đang lưu...';
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }

                const success = await this.updateDisplayName(newDisplayName);

                if (success) {
                    closeModal();
                    this.showToast("Đã cập nhật tên hiển thị thành công!", "success");
                    this.refreshUserInfo();
                } else {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i data-lucide="check"></i> Lưu';
                    if (typeof lucide !== "undefined") {
                        lucide.createIcons();
                    }
                }
            });

            input.focus();
            input.select();
        } else {
            // For desktop: inline editing on sidebar
            this.showInlineEditDisplayName();
        }

        // Add styles for input
        if (!document.getElementById("editDisplayNameStyles")) {
            const style = document.createElement("style");
            style.id = "editDisplayNameStyles";
            style.textContent = `
                .displayname-input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    color: white;
                    background: rgba(255, 255, 255, 0.1);
                    transition: all 0.2s;
                    outline: none;
                    box-sizing: border-box;
                }

                .displayname-input:focus {
                    border-color: #00bcd4;
                    background: rgba(255, 255, 255, 0.15);
                    box-shadow: 0 0 0 2px rgba(0, 188, 212, 0.2);
                }

                .edit-displayname-btn {
                    background: transparent;
                    border: none;
                    padding: 2px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 3px;
                    transition: all 0.2s;
                    color: #00bcd4;
                    flex-shrink: 0;
                }

                .edit-displayname-btn:hover {
                    background: rgba(0, 188, 212, 0.15);
                    transform: scale(1.1);
                }

                .edit-displayname-btn i {
                    width: 12px;
                    height: 12px;
                }

                .mobile-user-name-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                /* Emoji picker */
                .emoji-picker {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    border: 1px dashed rgba(255, 255, 255, 0.2);
                }

                .emoji-btn {
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    padding: 6px 8px;
                    border-radius: 4px;
                    font-size: 18px;
                    cursor: pointer;
                    transition: all 0.2s;
                    line-height: 1;
                }

                .emoji-btn:hover {
                    background: rgba(0, 188, 212, 0.3);
                    transform: scale(1.15);
                }

                .emoji-btn:active {
                    transform: scale(0.95);
                }

                /* Inline edit form on sidebar */
                .displayname-edit-form {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 8px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 6px;
                    margin-top: 4px;
                }

                .displayname-edit-actions {
                    display: flex;
                    gap: 6px;
                }

                .displayname-edit-actions button {
                    flex: 1;
                    padding: 6px 12px;
                    border: none;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                }

                .displayname-edit-actions button i {
                    width: 14px;
                    height: 14px;
                }

                .btn-save-inline {
                    background: #00bcd4;
                    color: white;
                }

                .btn-save-inline:hover {
                    background: #00a5bb;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 4px rgba(0, 188, 212, 0.3);
                }

                .btn-cancel-inline {
                    background: rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.8);
                }

                .btn-cancel-inline:hover {
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                }

                /* Desktop sidebar edit button */
                #sidebar .edit-displayname-btn {
                    color: #00bcd4;
                }

                #sidebar .edit-displayname-btn:hover {
                    background: rgba(0, 188, 212, 0.15);
                    color: #00e5ff;
                }
            `;
            document.head.insertBefore(style, document.head.firstChild);
        }
    }

    showInlineEditDisplayName() {
        const userInfo = window.authManager?.getUserInfo();
        const currentDisplayName = userInfo?.displayName || "";

        // Find the user info container
        const userInfoContainer = document.querySelector('.user-info');
        if (!userInfoContainer) return;

        // Check if already editing
        if (userInfoContainer.querySelector('.displayname-edit-form')) {
            return;
        }

        // Hide the userName display and edit button
        const userName = document.getElementById("userName");
        const editBtn = document.getElementById("editDisplayNameDesktop");
        if (userName) userName.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';

        // Create inline edit form
        const editForm = document.createElement('div');
        editForm.className = 'displayname-edit-form';
        editForm.innerHTML = `
            <input
                type="text"
                id="inlineDisplayNameInput"
                class="displayname-input"
                placeholder="Nhập tên... (hỗ trợ emoji ☺️)"
                value="${currentDisplayName}"
                maxlength="100"
            >
            <div class="emoji-picker">
                <button type="button" class="emoji-btn" data-emoji="😊">😊</button>
                <button type="button" class="emoji-btn" data-emoji="🎉">🎉</button>
                <button type="button" class="emoji-btn" data-emoji="💖">💖</button>
                <button type="button" class="emoji-btn" data-emoji="⭐">⭐</button>
                <button type="button" class="emoji-btn" data-emoji="🔥">🔥</button>
                <button type="button" class="emoji-btn" data-emoji="✨">✨</button>
                <button type="button" class="emoji-btn" data-emoji="🌸">🌸</button>
                <button type="button" class="emoji-btn" data-emoji="🎨">🎨</button>
            </div>
            <div class="displayname-edit-actions">
                <button class="btn-cancel-inline" id="cancelInlineEdit">
                    <i data-lucide="x"></i>
                    Hủy
                </button>
                <button class="btn-save-inline" id="saveInlineEdit">
                    <i data-lucide="check"></i>
                    Lưu
                </button>
            </div>
        `;

        // Insert form after userName's parent
        const nameWrapper = userName?.parentElement || userInfoContainer;
        nameWrapper.appendChild(editForm);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        const input = editForm.querySelector('#inlineDisplayNameInput');
        const cancelBtn = editForm.querySelector('#cancelInlineEdit');
        const saveBtn = editForm.querySelector('#saveInlineEdit');
        const emojiButtons = editForm.querySelectorAll('.emoji-btn');

        // Add emoji button listeners
        emojiButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const emoji = btn.getAttribute('data-emoji');
                const cursorPos = input.selectionStart;
                const textBefore = input.value.substring(0, cursorPos);
                const textAfter = input.value.substring(input.selectionEnd);
                input.value = textBefore + emoji + textAfter;
                input.focus();
                input.selectionStart = input.selectionEnd = cursorPos + emoji.length;
            });
        });

        const closeEdit = () => {
            editForm.remove();
            if (userName) userName.style.display = '';
            if (editBtn) editBtn.style.display = '';
        };

        cancelBtn.addEventListener('click', closeEdit);

        saveBtn.addEventListener('click', async () => {
            const newDisplayName = input.value.trim();

            if (!newDisplayName) {
                this.showToast("Vui lòng nhập tên hiển thị!", "error");
                input.focus();
                return;
            }

            if (newDisplayName === currentDisplayName) {
                this.showToast("Tên hiển thị không thay đổi!", "error");
                closeEdit();
                return;
            }

            if (newDisplayName.length < 2) {
                this.showToast("Tên hiển thị phải có ít nhất 2 ký tự!", "error");
                input.focus();
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i data-lucide="loader"></i> Đang lưu...';
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            const success = await this.updateDisplayName(newDisplayName);

            if (success) {
                closeEdit();
                this.showToast("Đã cập nhật tên hiển thị!", "success");
                this.refreshUserInfo();
            } else {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i data-lucide="check"></i> Lưu';
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            }
        });

        // Enter to save, Escape to cancel
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeEdit();
            }
        });

        input.focus();
        input.select();
    }

    async updateDisplayName(newDisplayName) {
        try {
            // Get auth data from storage (supporting both localStorage and sessionStorage)
            let authDataStr = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");

            if (!authDataStr) {
                this.showToast("Không tìm thấy thông tin người dùng!", "error");
                return false;
            }

            const authData = JSON.parse(authDataStr);

            if (!authData || !authData.username) {
                this.showToast("Không tìm thấy thông tin người dùng!", "error");
                return false;
            }

            const username = authData.username;

            // Update Firebase
            if (typeof firebase !== "undefined" && firebase.firestore) {
                const db = firebase.firestore();
                await db.collection("users").doc(username).update({
                    displayName: newDisplayName,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });

                console.log("[Edit DisplayName] Updated Firebase successfully");
            } else {
                this.showToast("Không thể kết nối Firebase!", "error");
                return false;
            }

            // Update storage (both localStorage and sessionStorage)
            authData.displayName = newDisplayName;

            const authDataString = JSON.stringify(authData);

            // Update localStorage if exists
            if (localStorage.getItem("loginindex_auth")) {
                localStorage.setItem("loginindex_auth", authDataString);
                console.log("[Edit DisplayName] Updated localStorage");
            }

            // Update sessionStorage if exists
            if (sessionStorage.getItem("loginindex_auth")) {
                sessionStorage.setItem("loginindex_auth", authDataString);
                console.log("[Edit DisplayName] Updated sessionStorage");
            }

            return true;
        } catch (error) {
            console.error("[Edit DisplayName] Error:", error);
            this.showToast("Có lỗi xảy ra khi cập nhật. Vui lòng thử lại!", "error");
            return false;
        }
    }

    refreshUserInfo() {
        const userInfo = window.authManager?.getUserInfo();
        if (!userInfo) return;

        // Update mobile top bar
        const mobileUserName = document.querySelector(".mobile-user-name");
        if (mobileUserName) {
            mobileUserName.textContent = userInfo.displayName || "User";
        }

        // Update desktop sidebar
        const userName = document.getElementById("userName");
        if (userName) {
            userName.textContent = userInfo.displayName || "User";
        }

        console.log("[Unified Nav] User info refreshed");
    }

    // =====================================================
    // SETTINGS FUNCTIONALITY
    // =====================================================

    loadSettings() {
        const savedFontSize = localStorage.getItem("appFontSize") || "14";
        this.applyFontSize(parseInt(savedFontSize));

        const savedTheme = localStorage.getItem("appTheme") || "light";
        this.applyTheme(savedTheme);

        console.log("[Unified Nav] Settings loaded");
    }

    applyFontSize(size) {
        const limitedSize = Math.max(12, Math.min(20, size));
        document.documentElement.style.setProperty(
            "--base-font-size",
            `${limitedSize}px`,
        );
        document.body.style.fontSize = `${limitedSize}px`;
        console.log(`[Unified Nav] Font size applied: ${limitedSize}px`);
    }

    saveFontSize(size) {
        localStorage.setItem("appFontSize", size.toString());
        this.applyFontSize(size);
    }

    applyTheme(theme) {
        if (theme === "dark") {
            document.documentElement.classList.add("dark-mode");
        } else {
            document.documentElement.classList.remove("dark-mode");
        }
        console.log(`[Unified Nav] Theme applied: ${theme}`);
    }

    saveTheme(theme) {
        localStorage.setItem("appTheme", theme);
        this.applyTheme(theme);
    }

    showSettings() {
        const currentFontSize =
            parseInt(localStorage.getItem("appFontSize")) || 14;
        const currentTableFontSize =
            parseInt(localStorage.getItem("ordersTableFontSize")) || 14;
        const currentTheme = localStorage.getItem("appTheme") || "light";

        const modal = document.createElement("div");
        modal.className = "settings-modal-overlay";
        modal.innerHTML = `
            <div class="settings-modal">
                <div class="settings-header">
                    <h2>
                        <i data-lucide="settings"></i>
                        Cài Đặt Hiển Thị
                    </h2>
                    <button class="settings-close" id="closeSettings">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                
                <div class="settings-content">
                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="sun"></i>
                            Chế Độ Hiển Thị
                        </label>
                        <div class="theme-toggle-container">
                            <button class="theme-option ${currentTheme === "light" ? "active" : ""}" data-theme="light">
                                <i data-lucide="sun"></i>
                                <span>Sáng</span>
                            </button>
                            <button class="theme-option ${currentTheme === "dark" ? "active" : ""}" data-theme="dark">
                                <i data-lucide="moon"></i>
                                <span>Tối</span>
                            </button>
                        </div>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="type"></i>
                            Kích Thước Chữ
                        </label>
                        <div class="font-size-slider-container">
                            <div class="slider-labels">
                                <span class="slider-label-min">12px</span>
                                <span class="slider-label-current" id="currentFontSize">${currentFontSize}px</span>
                                <span class="slider-label-max">20px</span>
                            </div>
                            <input 
                                type="range" 
                                id="fontSizeSlider" 
                                class="font-size-slider"
                                min="12" 
                                max="20" 
                                value="${currentFontSize}"
                                step="1"
                            >
                            <div class="slider-ticks">
                                <span>12</span>
                                <span>14</span>
                                <span>16</span>
                                <span>18</span>
                                <span>20</span>
                            </div>
                        </div>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="table"></i>
                            Kích Thước Chữ Bảng Đơn Hàng
                        </label>
                        <div class="font-size-slider-container">
                            <div class="slider-labels">
                                <span class="slider-label-min">10px</span>
                                <span class="slider-label-current" id="currentTableFontSize">${currentTableFontSize}px</span>
                                <span class="slider-label-max">20px</span>
                            </div>
                            <input
                                type="range"
                                id="tableFontSizeSlider"
                                class="font-size-slider"
                                min="10"
                                max="20"
                                value="${currentTableFontSize}"
                                step="1"
                            >
                            <div class="slider-ticks">
                                <span>10</span>
                                <span>12</span>
                                <span>14</span>
                                <span>16</span>
                                <span>18</span>
                                <span>20</span>
                            </div>
                        </div>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="eye"></i>
                            Xem Trước
                        </label>
                        <div class="settings-preview">
                            <p>Đây là văn bản mẫu để xem trước kích thước chữ.</p>
                            <p>This is sample text to preview font size.</p>
                            <p style="font-weight: 600;">Chữ đậm / Bold text</p>
                            <div style="margin-top: 12px; padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 8px;">
                                <span style="font-size: 12px;">Chữ nhỏ 12px</span> • 
                                <span style="font-size: 14px;">Bình thường 14px</span> • 
                                <span style="font-size: 16px;">Lớn 16px</span>
                            </div>
                        </div>
                    </div>
                    ${this.isAdminTemplate ? `
                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="layout-grid"></i>
                            Quản Lý Menu
                        </label>
                        <button class="settings-edit-menu-btn" id="settingsEditMenuBtn">
                            <i data-lucide="grip-vertical"></i>
                            <span>Sửa Menu Sidebar</span>
                            <i data-lucide="chevron-right" style="margin-left: auto; width: 16px; height: 16px; opacity: 0.5;"></i>
                        </button>
                    </div>
                    ` : ''}

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="tag"></i>
                            Cài Đặt Mã Sản Phẩm
                        </label>
                        <div class="prefix-rules-section">
                            <div class="prefix-default-row">
                                <label>Prefix mặc định:</label>
                                <input type="text" id="defaultPrefixInput" class="prefix-input" maxlength="5" placeholder="N" ${!this.isAdminTemplate ? 'disabled' : ''}>
                            </div>
                            <table class="prefix-rules-table" id="prefixRulesTable">
                                <thead>
                                    <tr>
                                        <th>Tên bắt đầu</th>
                                        <th>Mã tạo</th>
                                        ${this.isAdminTemplate ? '<th></th>' : ''}
                                    </tr>
                                </thead>
                                <tbody id="prefixRulesBody">
                                    <tr><td colspan="3" style="text-align:center; color:#999;">Đang tải...</td></tr>
                                </tbody>
                            </table>
                            ${this.isAdminTemplate ? `
                            <button class="btn-add-prefix-rule" id="addPrefixRule">
                                <i data-lucide="plus" style="width:14px;height:14px;"></i>
                                Thêm quy tắc
                            </button>
                            ` : ''}
                        </div>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">
                            <i data-lucide="key"></i>
                            TPOS Account
                        </label>
                        <div class="tpos-accounts-section">
                            <div class="tpos-account-row">
                                <div class="tpos-account-info">
                                    <span class="tpos-account-label">NJD LIVE (Company 1)</span>
                                    <span class="tpos-account-user">nvktlive1</span>
                                </div>
                                <button class="btn-switch-company" id="switchToCompany2From1" title="Switch account nvktlive1 sang Company 2">
                                    <i data-lucide="arrow-right-left" style="width:14px;height:14px;"></i>
                                    Switch → C2
                                </button>
                            </div>
                            <div class="tpos-account-row">
                                <div class="tpos-account-info">
                                    <span class="tpos-account-label">NJD SHOP (Company 2)</span>
                                    <span class="tpos-account-user">nvktshop1</span>
                                </div>
                                <button class="btn-switch-company" id="switchToCompany1From2" title="Switch account nvktshop1 sang Company 1">
                                    <i data-lucide="arrow-right-left" style="width:14px;height:14px;"></i>
                                    Switch → C1
                                </button>
                            </div>
                            <div class="tpos-account-status" id="tposSwitchStatus"></div>
                        </div>
                    </div>
                </div>

                <div class="settings-footer">
                    <button class="btn-reset" id="resetSettings">
                        <i data-lucide="rotate-ccw"></i>
                        Đặt Lại Mặc Định
                    <button class="btn-save" id="saveSettings">
                        <i data-lucide="check"></i>
                        Áp Dụng
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        this.addSettingsStyles();

        const closeBtn = modal.querySelector("#closeSettings");
        const saveBtn = modal.querySelector("#saveSettings");
        const resetBtn = modal.querySelector("#resetSettings");
        const fontSlider = modal.querySelector("#fontSizeSlider");
        const currentSizeLabel = modal.querySelector("#currentFontSize");
        const tableFontSlider = modal.querySelector("#tableFontSizeSlider");
        const currentTableSizeLabel = modal.querySelector("#currentTableFontSize");
        const themeButtons = modal.querySelectorAll(".theme-option");

        let selectedFontSize = currentFontSize;
        let selectedTableFontSize = currentTableFontSize;
        let selectedTheme = currentTheme;

        const closeModal = () => modal.remove();

        closeBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        fontSlider.addEventListener("input", (e) => {
            selectedFontSize = parseInt(e.target.value);
            currentSizeLabel.textContent = `${selectedFontSize}px`;
            this.applyFontSize(selectedFontSize);
        });

        tableFontSlider.addEventListener("input", (e) => {
            selectedTableFontSize = parseInt(e.target.value);
            currentTableSizeLabel.textContent = `${selectedTableFontSize}px`;
        });

        themeButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                themeButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                selectedTheme = btn.dataset.theme;
                this.applyTheme(selectedTheme);
            });
        });

        resetBtn.addEventListener("click", () => {
            selectedFontSize = 14;
            selectedTableFontSize = 14;
            selectedTheme = "light";

            fontSlider.value = 14;
            currentSizeLabel.textContent = "14px";

            tableFontSlider.value = 14;
            currentTableSizeLabel.textContent = "14px";

            themeButtons.forEach((b) => b.classList.remove("active"));
            const lightBtn = modal.querySelector('[data-theme="light"]');
            if (lightBtn) lightBtn.classList.add("active");

            this.applyFontSize(14);
            this.applyTheme("light");
        });

        saveBtn.addEventListener("click", () => {
            this.saveFontSize(selectedFontSize);
            this.saveTheme(selectedTheme);
            localStorage.setItem("ordersTableFontSize", selectedTableFontSize.toString());
            closeModal();
            this.showToast("Đã lưu cài đặt thành công!", "success");
        });

        // Edit menu button (admin only)
        const editMenuBtn = modal.querySelector("#settingsEditMenuBtn");
        if (editMenuBtn) {
            editMenuBtn.addEventListener("click", () => {
                closeModal();
                this.showMenuEditModal();
            });
        }

        // --- Prefix Rules ---
        this._initPrefixRulesUI(modal);

        // --- TPOS SwitchCompany buttons ---
        this._initTposSwitchButtons(modal);
    }

    /**
     * Initialize TPOS SwitchCompany buttons in settings modal
     */
    _initTposSwitchButtons(modal) {
        const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const TOKEN_URL = `${PROXY_URL}/api/token`;
        const SWITCH_URL = `${PROXY_URL}/api/odata/ApplicationUser/ODataService.SwitchCompany`;
        const CREDENTIALS = {
            1: { username: 'nvktlive1', password: 'Aa@28612345678' },
            2: { username: 'nvktshop1', password: 'Aa@28612345678' }
        };

        const statusEl = modal.querySelector('#tposSwitchStatus');

        const doSwitch = async (sourceCompanyId, targetCompanyId, btn) => {
            const creds = CREDENTIALS[sourceCompanyId];
            btn.disabled = true;
            btn.textContent = 'Đang xử lý...';
            if (statusEl) statusEl.textContent = '';

            try {
                // Step 1: Login with source account
                const loginResp = await fetch(TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `grant_type=password&username=${creds.username}&password=${encodeURIComponent(creds.password)}&client_id=tmtWebApp`
                });
                if (!loginResp.ok) throw new Error(`Login failed: ${loginResp.status}`);
                const loginData = await loginResp.json();

                // Step 2: SwitchCompany
                const switchResp = await fetch(SWITCH_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${loginData.access_token}`,
                        'Content-Type': 'application/json;charset=UTF-8',
                        'Accept': 'application/json',
                        'feature-version': '2',
                        'tposappversion': '6.2.6.1'
                    },
                    body: JSON.stringify({ companyId: targetCompanyId })
                });
                if (!switchResp.ok) throw new Error(`SwitchCompany failed: ${switchResp.status}`);

                // Step 3: Refresh token to get new company token
                const refreshResp = await fetch(TOKEN_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Bearer ${loginData.access_token}`
                    },
                    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(loginData.refresh_token)}&client_id=tmtWebApp`
                });
                if (!refreshResp.ok) throw new Error(`Token refresh failed: ${refreshResp.status}`);

                const newToken = await refreshResp.json();
                // Save to localStorage under target company key
                const storageKey = `bearer_token_data_${targetCompanyId}`;
                const dataToSave = {
                    access_token: newToken.access_token,
                    refresh_token: newToken.refresh_token || null,
                    token_type: 'Bearer',
                    expires_in: newToken.expires_in,
                    expires_at: Date.now() + (newToken.expires_in * 1000),
                    issued_at: Date.now()
                };
                localStorage.setItem(storageKey, JSON.stringify(dataToSave));

                if (statusEl) {
                    statusEl.textContent = `OK! Account ${creds.username} switched to Company ${targetCompanyId}. Token saved.`;
                    statusEl.style.color = '#22c55e';
                }
                console.log(`[Settings] SwitchCompany: ${creds.username} → Company ${targetCompanyId} OK`);
            } catch (err) {
                console.error('[Settings] SwitchCompany error:', err);
                if (statusEl) {
                    statusEl.textContent = `Lỗi: ${err.message}`;
                    statusEl.style.color = '#ef4444';
                }
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="arrow-right-left" style="width:14px;height:14px;"></i> Switch → C${targetCompanyId === 1 ? '1' : '2'}`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        };

        const btn1 = modal.querySelector('#switchToCompany2From1');
        const btn2 = modal.querySelector('#switchToCompany1From2');
        if (btn1) btn1.addEventListener('click', () => doSwitch(1, 2, btn1));
        if (btn2) btn2.addEventListener('click', () => doSwitch(2, 1, btn2));
    }

    /**
     * Initialize prefix rules UI in settings modal
     */
    async _initPrefixRulesUI(modal) {
        const tbody = modal.querySelector('#prefixRulesBody');
        const defaultInput = modal.querySelector('#defaultPrefixInput');
        const addBtn = modal.querySelector('#addPrefixRule');
        const saveBtn = modal.querySelector('#saveSettings');
        if (!tbody) return;

        // Load current rules from Firestore
        let rules = [];
        let defaultPrefix = 'N';
        try {
            if (window.firebase && window.firebase.firestore) {
                const doc = await firebase.firestore()
                    .collection('settings').doc('product_code_rules').get();
                if (doc.exists) {
                    const data = doc.data();
                    rules = data.rules || [];
                    defaultPrefix = data.defaultPrefix || 'N';
                }
            }
        } catch (e) {
            console.warn('[Settings] Failed to load prefix rules:', e.message);
        }

        // Use defaults if no rules found
        if (rules.length === 0 && window.ProductCodeGenerator) {
            rules = [...window.ProductCodeGenerator.DEFAULT_PREFIX_RULES];
            defaultPrefix = window.ProductCodeGenerator.DEFAULT_PREFIX || 'N';
        }

        if (defaultInput) defaultInput.value = defaultPrefix;

        const isAdmin = this.isAdminTemplate;

        const renderRules = () => {
            tbody.innerHTML = '';
            if (rules.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#999;padding:8px;">Chưa có quy tắc</td></tr>`;
                return;
            }
            rules.forEach((rule, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="text" class="prefix-input" value="${rule.match || ''}" data-idx="${idx}" data-field="match" maxlength="10" ${!isAdmin ? 'disabled' : ''}></td>
                    <td><input type="text" class="prefix-input" value="${rule.codePrefix || ''}" data-idx="${idx}" data-field="codePrefix" maxlength="5" ${!isAdmin ? 'disabled' : ''}></td>
                    ${isAdmin ? `<td><button class="btn-delete-rule" data-idx="${idx}" title="Xóa"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button></td>` : ''}
                `;
                tbody.appendChild(tr);
            });

            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Bind input change events
            if (isAdmin) {
                tbody.querySelectorAll('input.prefix-input').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const idx = parseInt(e.target.dataset.idx);
                        const field = e.target.dataset.field;
                        if (rules[idx]) rules[idx][field] = e.target.value.trim();
                    });
                });

                tbody.querySelectorAll('.btn-delete-rule').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(e.currentTarget.dataset.idx);
                        rules.splice(idx, 1);
                        renderRules();
                    });
                });
            }
        };

        renderRules();

        // Add rule button
        if (addBtn && isAdmin) {
            addBtn.addEventListener('click', () => {
                rules.push({ match: '', codePrefix: '' });
                renderRules();
                // Focus the new match input
                const lastInput = tbody.querySelector(`input[data-idx="${rules.length - 1}"][data-field="match"]`);
                if (lastInput) lastInput.focus();
            });
        }

        // Override save to also save prefix rules
        if (saveBtn && isAdmin) {
            const originalSave = saveBtn.onclick;
            saveBtn.addEventListener('click', async () => {
                // Save prefix rules to Firestore
                try {
                    const validRules = rules.filter(r => r.match && r.codePrefix);
                    const newDefaultPrefix = (defaultInput?.value || 'N').trim().toUpperCase();

                    if (window.firebase && window.firebase.firestore) {
                        await firebase.firestore()
                            .collection('settings').doc('product_code_rules')
                            .set({
                                rules: validRules,
                                defaultPrefix: newDefaultPrefix,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        console.log('[Settings] Prefix rules saved:', validRules.length, 'rules');
                    }

                    // Clear ProductCodeGenerator cache
                    if (window.ProductCodeGenerator && window.ProductCodeGenerator.clearCache) {
                        window.ProductCodeGenerator.clearCache();
                    }
                } catch (e) {
                    console.error('[Settings] Failed to save prefix rules:', e);
                }
            });
        }
    }

    addSettingsStyles() {
        if (document.getElementById("settingsStyles")) return;

        const style = document.createElement("style");
        style.id = "settingsStyles";
        style.textContent = `
            :root {
                --bg-primary: #ffffff;
                --bg-secondary: #f9fafb;
                --bg-tertiary: #f3f4f6;
                --text-primary: #111827;
                --text-secondary: #374151;
                --text-tertiary: #6b7280;
                --border-color: #e5e7eb;
                --accent-color: #6366f1;
            }

            .dark-mode {
                --bg-primary: #1f2937;
                --bg-secondary: #111827;
                --bg-tertiary: #374151;
                --text-primary: #f9fafb;
                --text-secondary: #e5e7eb;
                --text-tertiary: #9ca3af;
                --border-color: #374151;
                --accent-color: #818cf8;
            }

            .dark-mode body {
                background: var(--bg-secondary);
                color: var(--text-primary);
            }

            .settings-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 20px;
                backdrop-filter: blur(4px);
            }

            .settings-modal {
                background: var(--bg-primary);
                border-radius: 16px;
                max-width: 600px;
                width: 100%;
                max-height: 90vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
                animation: modalSlideIn 0.3s ease-out;
            }

            @keyframes modalSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .settings-header {
                padding: 24px;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .settings-header h2 {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                color: var(--text-primary);
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .settings-header h2 i {
                width: 24px;
                height: 24px;
                color: var(--accent-color);
            }

            .settings-close {
                width: 36px;
                height: 36px;
                border: none;
                background: var(--bg-tertiary);
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                color: var(--text-primary);
            }

            .settings-close:hover {
                background: var(--border-color);
                transform: rotate(90deg);
            }

            .settings-close i {
                width: 20px;
                height: 20px;
            }

            .settings-content {
                padding: 24px;
                overflow-y: auto;
                flex: 1;
            }

            .setting-group {
                margin-bottom: 28px;
            }

            .setting-group:last-child {
                margin-bottom: 0;
            }

            .setting-label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                color: var(--text-secondary);
                margin-bottom: 12px;
                font-size: 14px;
            }

            .setting-label i {
                width: 18px;
                height: 18px;
                color: var(--accent-color);
            }

            .theme-toggle-container {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }

            .theme-option {
                padding: 16px;
                border: 2px solid var(--border-color);
                background: var(--bg-primary);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                font-weight: 500;
                color: var(--text-secondary);
            }

            .theme-option:hover {
                border-color: var(--accent-color);
                background: var(--bg-secondary);
            }

            .theme-option.active {
                border-color: var(--accent-color);
                background: var(--bg-secondary);
                color: var(--accent-color);
            }

            .theme-option i {
                width: 24px;
                height: 24px;
            }

            .theme-option span {
                font-size: 14px;
            }

            .font-size-slider-container {
                background: var(--bg-secondary);
                padding: 20px;
                border-radius: 12px;
                border: 1px solid var(--border-color);
            }

            .slider-labels {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }

            .slider-label-min,
            .slider-label-max {
                font-size: 12px;
                color: var(--text-tertiary);
                font-weight: 500;
            }

            .slider-label-current {
                font-size: 18px;
                font-weight: 700;
                color: var(--accent-color);
            }

            .font-size-slider {
                width: 100%;
                height: 6px;
                border-radius: 3px;
                background: var(--border-color);
                outline: none;
                -webkit-appearance: none;
                appearance: none;
                cursor: pointer;
            }

            .font-size-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--accent-color);
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                transition: all 0.2s;
            }

            .font-size-slider::-webkit-slider-thumb:hover {
                transform: scale(1.2);
                box-shadow: 0 4px 8px rgba(99, 102, 241, 0.4);
            }

            .font-size-slider::-moz-range-thumb {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: var(--accent-color);
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                transition: all 0.2s;
            }

            .font-size-slider::-moz-range-thumb:hover {
                transform: scale(1.2);
                box-shadow: 0 4px 8px rgba(99, 102, 241, 0.4);
            }

            .slider-ticks {
                display: flex;
                justify-content: space-between;
                margin-top: 8px;
                padding: 0 2px;
            }

            .slider-ticks span {
                font-size: 11px;
                color: var(--text-tertiary);
                font-weight: 500;
            }

            .settings-preview {
                padding: 20px;
                background: var(--bg-secondary);
                border-radius: 12px;
                border: 1px solid var(--border-color);
            }

            .settings-preview p {
                margin: 0 0 8px 0;
                color: var(--text-secondary);
                line-height: 1.6;
            }

            .settings-preview p:last-child {
                margin-bottom: 0;
            }

            .settings-footer {
                padding: 20px 24px;
                border-top: 1px solid var(--border-color);
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                background: var(--bg-primary);
            }

            .settings-footer button {
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s;
            }

            .settings-footer button i {
                width: 18px;
                height: 18px;
            }

            .btn-reset {
                background: var(--bg-tertiary);
                color: var(--text-secondary);
            }

            .btn-reset:hover {
                background: var(--border-color);
            }

            .btn-save {
                background: var(--accent-color);
                color: white;
            }

            .btn-save:hover {
                background: #4f46e5;
                transform: translateY(-1px);
                box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);
            }

            .toast-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--bg-primary);
                padding: 16px 20px;
                border-radius: 12px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                display: flex;
                align-items: center;
                gap: 12px;
                z-index: 10001;
                animation: toastSlideIn 0.3s ease-out;
                border: 1px solid var(--border-color);
            }

            @keyframes toastSlideIn {
                from {
                    opacity: 0;
                    transform: translateX(100px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            .toast-notification.success {
                border-left: 4px solid #10b981;
            }

            .toast-notification.success i {
                width: 20px;
                height: 20px;
                color: #10b981;
            }

            .toast-notification.error {
                border-left: 4px solid #ef4444;
            }

            .toast-notification.error i {
                width: 20px;
                height: 20px;
                color: #ef4444;
            }

            .toast-notification.warning {
                border-left: 4px solid #f59e0b;
            }

            .toast-notification.warning i {
                width: 20px;
                height: 20px;
                color: #f59e0b;
            }

            .toast-notification.info {
                border-left: 4px solid #3b82f6;
            }

            .toast-notification.info i {
                width: 20px;
                height: 20px;
                color: #3b82f6;
            }

            .toast-notification span {
                color: var(--text-secondary);
                font-weight: 500;
                font-size: 14px;
            }

            body {
                font-size: var(--base-font-size, 14px);
            }

            .settings-edit-menu-btn {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                padding: 12px 16px;
                background: rgba(99, 102, 241, 0.1);
                border: 1px dashed rgba(99, 102, 241, 0.3);
                border-radius: 10px;
                color: var(--accent-color, #6366f1);
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            .settings-edit-menu-btn:hover {
                background: rgba(99, 102, 241, 0.2);
                border-color: rgba(99, 102, 241, 0.5);
            }
            .settings-edit-menu-btn i {
                width: 18px;
                height: 18px;
            }

            /* Prefix Rules Settings */
            .prefix-rules-section {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .prefix-default-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 4px;
            }
            .prefix-default-row label {
                font-size: 13px;
                color: var(--text-secondary);
                white-space: nowrap;
            }
            .prefix-input {
                padding: 5px 8px;
                border: 1px solid var(--border-color);
                border-radius: 6px;
                font-size: 13px;
                background: var(--bg-primary);
                color: var(--text-primary);
                width: 80px;
                text-align: center;
            }
            .prefix-input:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            .prefix-input:focus {
                outline: none;
                border-color: var(--accent-color);
                box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
            }
            .prefix-rules-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }
            .prefix-rules-table th {
                text-align: left;
                padding: 6px 8px;
                font-weight: 500;
                color: var(--text-tertiary);
                border-bottom: 1px solid var(--border-color);
                font-size: 12px;
            }
            .prefix-rules-table td {
                padding: 4px 4px;
            }
            .prefix-rules-table input.prefix-input {
                width: 100%;
                box-sizing: border-box;
            }
            .btn-delete-rule {
                border: none;
                background: none;
                cursor: pointer;
                color: #ef4444;
                padding: 4px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .btn-delete-rule:hover {
                background: rgba(239, 68, 68, 0.1);
            }
            .btn-add-prefix-rule {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                border: 1px dashed var(--border-color);
                background: transparent;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                color: var(--accent-color);
                transition: all 0.2s;
            }
            .btn-add-prefix-rule:hover {
                background: rgba(99, 102, 241, 0.1);
                border-color: var(--accent-color);
            }

            /* TPOS Account Settings */
            .tpos-accounts-section {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .tpos-account-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 12px;
                background: var(--bg-primary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
            }
            .tpos-account-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .tpos-account-label {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-primary);
            }
            .tpos-account-user {
                font-size: 12px;
                color: var(--text-secondary);
                font-family: monospace;
            }
            .btn-switch-company {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 6px 10px;
                border: 1px solid var(--border-color);
                background: transparent;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                color: var(--accent-color);
                transition: all 0.2s;
                white-space: nowrap;
            }
            .btn-switch-company:hover {
                background: rgba(99, 102, 241, 0.1);
                border-color: var(--accent-color);
            }
            .btn-switch-company:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .tpos-account-status {
                font-size: 12px;
                padding: 0 4px;
                min-height: 16px;
            }

            @media (max-width: 640px) {
                .theme-toggle-container {
                    grid-template-columns: 1fr;
                }

                .settings-footer {
                    flex-direction: column-reverse;
                }

                .settings-footer button {
                    width: 100%;
                    justify-content: center;
                }
            }
        `;
        document.head.insertBefore(style, document.head.firstChild);
    }

    showToast(message, type = "success") {
        const toast = document.createElement("div");
        toast.className = `toast-notification ${type}`;

        const iconMap = {
            success: "check-circle",
            error: "alert-circle",
            warning: "alert-triangle",
            info: "info"
        };

        const icon = iconMap[type] || "check-circle";

        toast.innerHTML = `
            <i data-lucide="${icon}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        setTimeout(() => {
            toast.style.animation = "toastSlideIn 0.3s ease-out reverse";
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // =====================================================
    // LOGOUT CONFIRMATION DIALOG
    // =====================================================

    showLogoutConfirmDialog() {
        // Create overlay
        const overlay = document.createElement("div");
        overlay.className = "logout-confirm-overlay";
        overlay.innerHTML = `
            <div class="logout-confirm-dialog">
                <div class="logout-confirm-icon">
                    <i data-lucide="log-out"></i>
                </div>
                <h3 class="logout-confirm-title">Đăng Xuất</h3>
                <p class="logout-confirm-message">Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?</p>
                <div class="logout-confirm-actions">
                    <button class="logout-confirm-btn logout-cancel-btn" id="logoutCancelBtn">
                        <i data-lucide="x"></i>
                        Hủy
                    </button>
                    <button class="logout-confirm-btn logout-ok-btn" id="logoutOkBtn">
                        <i data-lucide="check"></i>
                        Đăng Xuất
                    </button>
                </div>
            </div>
        `;

        // Add styles
        this.injectLogoutConfirmStyles();

        document.body.appendChild(overlay);

        // Animate in
        requestAnimationFrame(() => {
            overlay.classList.add("show");
        });

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Event handlers
        const cancelBtn = overlay.querySelector("#logoutCancelBtn");
        const okBtn = overlay.querySelector("#logoutOkBtn");

        const closeDialog = () => {
            overlay.classList.remove("show");
            setTimeout(() => overlay.remove(), 300);
        };

        cancelBtn.addEventListener("click", closeDialog);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeDialog();
        });

        okBtn.addEventListener("click", () => {
            selectiveLogoutStorage();
            window.authManager?.logout();
        });
    }

    injectLogoutConfirmStyles() {
        if (document.getElementById("logoutConfirmStyles")) return;

        const style = document.createElement("style");
        style.id = "logoutConfirmStyles";
        style.textContent = `
            .logout-confirm-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .logout-confirm-overlay.show {
                opacity: 1;
            }

            .logout-confirm-dialog {
                background: linear-gradient(145deg, #1a1a2e, #16213e);
                border-radius: 20px;
                padding: 32px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                transform: scale(0.9) translateY(20px);
                transition: transform 0.3s ease;
            }

            .logout-confirm-overlay.show .logout-confirm-dialog {
                transform: scale(1) translateY(0);
            }

            .logout-confirm-icon {
                width: 64px;
                height: 64px;
                margin: 0 auto 20px;
                background: linear-gradient(135deg, #ef4444, #dc2626);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .logout-confirm-icon svg {
                width: 32px;
                height: 32px;
                color: white;
            }

            .logout-confirm-title {
                color: #fff;
                font-size: 24px;
                font-weight: 700;
                margin: 0 0 12px;
            }

            .logout-confirm-message {
                color: rgba(255, 255, 255, 0.7);
                font-size: 15px;
                line-height: 1.5;
                margin: 0 0 28px;
            }

            .logout-confirm-actions {
                display: flex;
                gap: 12px;
                justify-content: center;
            }

            .logout-confirm-btn {
                flex: 1;
                padding: 14px 24px;
                border-radius: 12px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s ease;
                border: none;
            }

            .logout-confirm-btn svg {
                width: 18px;
                height: 18px;
            }

            .logout-cancel-btn {
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.2);
            }

            .logout-cancel-btn:hover {
                background: rgba(255, 255, 255, 0.15);
                color: #fff;
            }

            .logout-ok-btn {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: white;
            }

            .logout-ok-btn:hover {
                background: linear-gradient(135deg, #f87171, #ef4444);
                transform: translateY(-2px);
                box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
            }
        `;
        document.head.insertBefore(style, document.head.firstChild);
    }

    // =====================================================
    // MOBILE STYLES
    // =====================================================

    injectMobileStyles() {
        if (document.getElementById("mobileNavStyles")) return;

        const style = document.createElement("style");
        style.id = "mobileNavStyles";
        style.textContent = `
            .mobile-top-bar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 60px;
                background: linear-gradient(135deg, #6366f1, #4f46e5);
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                z-index: 1000;
            }

            .mobile-top-content {
                display: flex;
                align-items: center;
                justify-content: space-between;
                height: 100%;
                padding: 0 16px;
            }

            .mobile-user-info {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .mobile-user-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .mobile-user-avatar i {
                width: 20px;
                height: 20px;
                color: white;
            }

            .mobile-user-details {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .mobile-user-name {
                color: white;
                font-weight: 600;
                font-size: 14px;
            }

            .mobile-user-role {
                color: rgba(255, 255, 255, 0.8);
                font-size: 12px;
            }

            .mobile-menu-btn {
                width: 40px;
                height: 40px;
                border: none;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            }

            .mobile-menu-btn:active {
                transform: scale(0.95);
                background: rgba(255, 255, 255, 0.3);
            }

            .mobile-menu-btn i {
                width: 24px;
                height: 24px;
                color: white;
            }

            .mobile-bottom-nav {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 65px;
                background: white;
                box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
                display: flex !important;
                align-items: center;
                justify-content: space-around;
                padding: 8px 4px;
                z-index: 1000;
                visibility: visible !important;
                opacity: 1 !important;
            }

            .mobile-nav-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 8px 12px;
                border-radius: 12px;
                text-decoration: none;
                color: #6b7280;
                transition: all 0.2s;
                flex: 1;
                max-width: 80px;
                background: none;
                border: none;
                cursor: pointer;
            }

            .mobile-nav-item i {
                width: 24px;
                height: 24px;
                transition: all 0.2s;
            }

            .mobile-nav-item span {
                font-size: 11px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 100%;
            }

            .mobile-nav-item.active {
                color: #6366f1;
                background: rgba(99, 102, 241, 0.1);
            }

            .mobile-nav-item.active i {
                transform: scale(1.1);
            }

            .mobile-nav-item:active {
                transform: scale(0.95);
            }

            .mobile-menu-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 2000;
                display: flex;
                align-items: flex-end;
                animation: fadeIn 0.3s;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .mobile-menu-panel {
                width: 100%;
                max-height: 80vh;
                background: white;
                border-radius: 20px 20px 0 0;
                display: flex;
                flex-direction: column;
                animation: slideUp 0.3s;
            }

            @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
            }

            .mobile-menu-header {
                padding: 20px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .mobile-menu-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                color: #111827;
            }

            .mobile-menu-close {
                width: 36px;
                height: 36px;
                border: none;
                background: #f3f4f6;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }

            .mobile-menu-close i {
                width: 20px;
                height: 20px;
                color: #6b7280;
            }

            .mobile-menu-content {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
            }

            .mobile-menu-item {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px;
                border-radius: 12px;
                text-decoration: none;
                color: #374151;
                margin-bottom: 4px;
                transition: all 0.2s;
                position: relative;
            }

            .mobile-menu-item:active {
                background: #f3f4f6;
                transform: scale(0.98);
            }

            .mobile-menu-item.active {
                background: rgba(99, 102, 241, 0.1);
                color: #6366f1;
                font-weight: 600;
            }

            .mobile-menu-item i {
                width: 24px;
                height: 24px;
                flex-shrink: 0;
            }

            .mobile-menu-item .check-icon {
                margin-left: auto;
                color: #10b981;
            }

            .mobile-menu-footer {
                padding: 16px;
                border-top: 1px solid #e5e7eb;
                display: flex;
                gap: 12px;
            }

            .mobile-menu-action {
                flex: 1;
                padding: 14px;
                border: none;
                border-radius: 12px;
                background: #f3f4f6;
                color: #374151;
                font-weight: 600;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .mobile-menu-action:active {
                transform: scale(0.95);
                background: #e5e7eb;
            }

            .mobile-menu-action i {
                width: 20px;
                height: 20px;
            }

            @media (max-width: 768px) {
                body {
                    padding-top: 60px;
                    padding-bottom: 65px;
                }
            }
        `;
        document.head.insertBefore(style, document.head.firstChild);
    }

    // =====================================================
    // ACCESS DENIED & PERMISSIONS
    // =====================================================

    showAccessDenied() {
        const pageInfo = MENU_CONFIG.find(
            (item) => item.pageIdentifier === this.currentPage,
        );
        const pageName = pageInfo ? pageInfo.text : this.currentPage;
        const requiredPermission = pageInfo
            ? pageInfo.permissionRequired
            : "unknown";

        const accessiblePages = this.getAccessiblePages();
        const firstAccessiblePage =
            accessiblePages.length > 0 ? accessiblePages[0] : null;

        console.error("[Access Denied]", {
            page: this.currentPage,
            pageName: pageName,
            requiredPermission: requiredPermission,
            userPermissions: this.userPermissions,
            roleTemplate: this.isAdminTemplate ? 'admin' : 'other',
            firstAccessiblePage: firstAccessiblePage
                ? firstAccessiblePage.pageIdentifier
                : "none",
        });

        if (!firstAccessiblePage) {
            console.error(
                "[Access Denied] No accessible pages found, redirecting to login",
            );
            selectiveLogoutStorage();
            sessionStorage.clear();
            window.location.href = "../index.html";
            return;
        }

        const redirectUrl = firstAccessiblePage.href;
        const redirectPageName = firstAccessiblePage.text;

        document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; 
                    background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 20px;">
            <div style="background: white; padding: ${this.isMobile ? "32px 20px" : "40px"}; border-radius: 16px; 
                        max-width: ${this.isMobile ? "400px" : "500px"}; text-align: center; 
                        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); width: 100%;">
                <i data-lucide="alert-circle" style="width: ${this.isMobile ? "56px" : "64px"}; 
                                                     height: ${this.isMobile ? "56px" : "64px"}; color: #ef4444; 
                                                     margin: 0 auto ${this.isMobile ? "16px" : "20px"}; display: block;"></i>
                <h1 style="color: #ef4444; margin-bottom: ${this.isMobile ? "12px" : "16px"}; 
                           font-size: ${this.isMobile ? "20px" : "24px"}; font-weight: 600;">
                    Truy Cập Bị Từ Chối
                </h1>
                <p style="color: #6b7280; margin-bottom: ${this.isMobile ? "12px" : "16px"}; 
                          line-height: ${this.isMobile ? "1.5" : "1.6"}; font-size: ${this.isMobile ? "14px" : "16px"};">
                    Bạn không có quyền truy cập: <strong style="color: #111827;">${pageName}</strong>
                </p>
                <p style="color: #9ca3af; margin-bottom: ${this.isMobile ? "20px" : "24px"}; font-size: 13px;">
                    Quyền yêu cầu: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${requiredPermission}</code>
                </p>
                <button onclick="window.location.href='${redirectUrl}'" 
                        style="${this.isMobile ? "width: 100%" : ""}; padding: 12px 24px; background: #6366f1; 
                               color: white; border: none; border-radius: 8px; cursor: pointer; 
                               font-weight: 600; font-size: 14px; transition: all 0.2s;"
                        onmouseover="this.style.background='#4f46e5'"
                        onmouseout="this.style.background='#6366f1'">
                    Về ${redirectPageName}
                </button>
            </div>
        </div>
    `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    showPermissionsSummary() {
        const accessiblePages = this.getAccessiblePages();
        const userInfo = window.authManager?.getUserInfo();

        const roleMap = { 0: "Admin", 1: "Manager", 3: "Staff", 777: "Guest" };
        const checkLogin = localStorage.getItem("checkLogin");
        const roleName = roleMap[checkLogin] || "Unknown";

        const summary = `
QUYỀN TRUY CẬP CỦA BẠN

Tài khoản: ${userInfo?.displayName || "Unknown"}
Vai trò: ${roleName}
Tổng quyền: ${accessiblePages.length}/${MENU_CONFIG.length} trang

CÁC TRANG ĐƯỢC PHÉP TRUY CẬP:
${accessiblePages.map((item) => `• ${item.text}`).join("\n")}

Liên hệ Administrator nếu cần thêm quyền truy cập.
        `.trim();

        alert(summary);
    }
}

// =====================================================
// INITIALIZATION
// =====================================================

function waitForDependencies(callback, maxRetries = 15, delay = 300) {
    let retries = 0;
    let resolved = false;

    const resolve = () => {
        if (resolved) return;
        resolved = true;
        console.log("[Unified Nav] Dependencies ready!");
        callback();
    };

    // Listen for sharedModulesLoaded event from compat.js
    window.addEventListener('sharedModulesLoaded', () => {
        if (window.authManager) {
            resolve();
        }
    }, { once: true });

    const check = () => {
        if (resolved) return;

        // Explicitly check window.authManager (not bare authManager)
        if (window.authManager) {
            resolve();
        } else if (retries < maxRetries) {
            retries++;
            // Debug: show what's available on first retry
            if (retries === 1) {
                console.log('[Unified Nav] Debug - _esmLoaded:', window._esmLoaded);
                console.log('[Unified Nav] Debug - _authReady:', window._authReady);
                console.log('[Unified Nav] Debug - window.authManager:', typeof window.authManager);
            }
            console.log(`[Unified Nav] Waiting... (${retries}/${maxRetries})`);
            setTimeout(check, delay);
        } else {
            console.error("[Unified Nav] Dependencies failed, redirecting...");
            console.error("[Unified Nav] Final state - _esmLoaded:", window._esmLoaded, "_authReady:", window._authReady, "authManager:", typeof window.authManager);
            selectiveLogoutStorage();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }
    };

    check();
}

let unifiedNavigationManager;

document.addEventListener("DOMContentLoaded", () => {
    console.log("[Unified Nav] DOM loaded...");
    waitForDependencies(() => {
        unifiedNavigationManager = new UnifiedNavigationManager();
        window.navigationManager = unifiedNavigationManager;
    });
});

window.UnifiedNavigationManager = UnifiedNavigationManager;
// console.log("[Unified Nav] Script loaded successfully");

// =====================================================
// APP VERSION SYSTEM - Auto-incremented on each commit
// =====================================================

window.APP_VERSION = {
    version: '1.0.0',
    build: 9,
    timestamp: '2026-01-08T12:00:00.000Z',
    branch: 'main'
};

// console.log(`[VERSION] App version: ${window.APP_VERSION.version} (build ${window.APP_VERSION.build})`);

// =====================================================
// VERSION CHECKER - Force logout on version mismatch
// =====================================================

class VersionChecker {
    constructor() {
        this.firebaseRef = null;
        this.localVersion = window.APP_VERSION || { build: 0 };
        this.isChecking = false;
        this.unsubscribeListener = null;
    }

    /**
     * Cleanup Firestore listener to prevent memory leaks
     */
    cleanup() {
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
            this.unsubscribeListener = null;
            console.log('[VERSION] Firestore listener cleaned up');
        }
    }

    /**
     * Initialize version checker
     */
    async init() {
        try {
            // Wait for Firebase to be ready
            await this.waitForFirebase();

            // Check version
            await this.checkVersion();

            // Listen for version changes
            this.setupVersionListener();

        } catch (error) {
            console.error('[VERSION] Error initializing version checker:', error);
        }
    }

    /**
     * Wait for Firebase SDK to be available
     * MIGRATION: Changed from Realtime Database to Firestore
     */
    async waitForFirebase() {
        const maxRetries = 50; // 5 seconds max
        let retries = 0;

        while (retries < maxRetries) {
            // Check for Firestore instead of Realtime Database
            if (window.firebase && window.firebase.firestore && typeof window.firebase.firestore === 'function') {
                this.firebaseRef = window.firebase.firestore().collection('app_config').doc('version');
                console.log('[VERSION] ✅ Firestore reference initialized');
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        console.warn('[VERSION] Firestore not available, version check disabled');
    }

    /**
     * Check version against Firestore
     */
    async checkVersion() {
        if (!this.firebaseRef || this.isChecking) {
            return;
        }

        this.isChecking = true;

        try {
            console.log('[VERSION] Checking version...');
            console.log('[VERSION] Local version:', this.localVersion);

            // Get version from Firestore
            const doc = await this.firebaseRef.get();
            const firebaseVersion = doc.exists ? doc.data() : null;

            console.log('[VERSION] Firestore version:', firebaseVersion);

            // If Firestore has no version, publish local version
            if (!firebaseVersion) {
                console.log('[VERSION] No version in Firestore, publishing local version...');
                await this.publishVersion();
                this.isChecking = false;
                return;
            }

            // Compare versions by timestamp (newer timestamp = force logout)
            const localTimestamp = new Date(this.localVersion.timestamp).getTime();
            const firebaseTimestamp = new Date(firebaseVersion.timestamp).getTime();

            if (firebaseTimestamp > localTimestamp) {
                console.warn('[VERSION] ⚠️ Version mismatch detected!');
                console.warn('[VERSION] Local timestamp:', this.localVersion.timestamp);
                console.warn('[VERSION] Firestore timestamp:', firebaseVersion.timestamp);
                console.warn('[VERSION] Local build:', this.localVersion.build);
                console.warn('[VERSION] Firestore build:', firebaseVersion.build);

                // Force logout and reload
                this.forceLogout();
            } else {
                console.log('[VERSION] ✅ Version OK (build', this.localVersion.build, 'at', this.localVersion.timestamp + ')');
            }

        } catch (error) {
            console.error('[VERSION] Error checking version:', error);
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Publish current version to Firestore
     */
    async publishVersion() {
        if (!this.firebaseRef) {
            return;
        }

        try {
            await this.firebaseRef.set(this.localVersion);
            console.log('[VERSION] ✅ Version published to Firestore:', this.localVersion);
        } catch (error) {
            console.error('[VERSION] Error publishing version:', error);
        }
    }

    /**
     * Setup listener for version changes (Firestore onSnapshot)
     */
    setupVersionListener() {
        if (!this.firebaseRef) {
            return;
        }

        let isFirstTrigger = true;

        // Use Firestore onSnapshot instead of Realtime Database .on('value')
        this.unsubscribeListener = this.firebaseRef.onSnapshot((doc) => {
            // Skip first trigger (already checked in checkVersion)
            if (isFirstTrigger) {
                isFirstTrigger = false;
                return;
            }

            const firebaseVersion = doc.exists ? doc.data() : null;
            if (!firebaseVersion) {
                return;
            }

            // Check if version changed by timestamp
            const localTimestamp = new Date(this.localVersion.timestamp).getTime();
            const firebaseTimestamp = new Date(firebaseVersion.timestamp).getTime();

            if (firebaseTimestamp > localTimestamp) {
                console.warn('[VERSION] ⚠️ Version changed in Firestore!');
                console.warn('[VERSION] Local timestamp:', this.localVersion.timestamp);
                console.warn('[VERSION] Firestore timestamp:', firebaseVersion.timestamp);
                console.warn('[VERSION] Local build:', this.localVersion.build);
                console.warn('[VERSION] Firestore build:', firebaseVersion.build);

                // Force logout and reload
                this.forceLogout();
            }
        });

        console.log('[VERSION] ✅ Version listener setup complete (Firestore)');
    }

    /**
     * Force logout: clear storage and redirect to login
     * CHANGED: Now only shows notification, user must manually reload
     */
    forceLogout() {
        console.log('[VERSION] ⚠️ Version mismatch detected, showing notification...');

        // Show notification for user to manually reload
        if (window.notificationManager) {
            window.notificationManager.warning(
                'Có phiên bản mới! Vui lòng nhấn F5 hoặc reload trang để cập nhật.',
                0,
                'Cập nhật phiên bản',
                { persistent: true }
            );
        } else {
            // Fallback: show alert
            alert('Có phiên bản mới! Vui lòng reload trang để cập nhật.');
        }

        // DO NOT auto-logout - let user decide when to reload
        // This prevents unexpected logouts
        console.log('[VERSION] User should manually reload to update');
    }

    /**
     * Manual version publish (call this when you want to force all users to logout)
     */
    async forceVersionUpdate() {
        console.log('[VERSION] 📢 Force version update triggered');
        await this.publishVersion();
    }
}

// Initialize version checker after navigation is ready
setTimeout(() => {
    if (window.APP_VERSION) {
        const versionChecker = new VersionChecker();
        window.versionChecker = versionChecker;
        versionChecker.init();
        console.log('[VERSION] Version Checker initialized');

        // Cleanup on page unload to prevent memory leaks
        window.addEventListener('beforeunload', () => {
            versionChecker.cleanup();
        });
    }
}, 2000); // Wait 2 seconds for Firebase to be ready

// =====================================================
// AI CHAT WIDGET LOADER
// Load floating AI chat widget on all pages
// =====================================================
(function loadAIChatWidget() {
    // Check if already loaded
    if (window.AIChatWidget) {
        console.log('[AI Widget] Already loaded');
        return;
    }

    // Determine script path based on current page location
    const currentPath = window.location.pathname;
    let basePath = '../shared/js/';

    // Handle different directory depths
    if (currentPath.includes('/n2store/') && !currentPath.includes('/n2store/js/')) {
        // Find the depth from n2store root
        const parts = currentPath.split('/n2store/')[1]?.split('/').filter(p => p && !p.includes('.html'));
        if (parts && parts.length > 1) {
            basePath = '../'.repeat(parts.length) + 'js/';
        }
    }

    // Create and load the script
    const script = document.createElement('script');
    script.src = basePath + 'ai-chat-widget.js';
    script.async = true;
    script.onerror = () => console.warn('[AI Widget] Failed to load widget script');
    document.head.appendChild(script);

    console.log('[AI Widget] Loading from:', basePath + 'ai-chat-widget.js');
})();
