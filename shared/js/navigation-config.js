/* =====================================================
   NAVIGATION CONFIG - Menu definitions, constants, stores
   Sub-module of navigation-modern.js
   Load order: 1 (first)
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
        href: "../product-warehouse/index.html",
        icon: "warehouse",
        text: "Kho Sản Phẩm",
        shortText: "Kho SP",
        pageIdentifier: "product-warehouse",
        publicAccess: true,
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
        items: ["product-warehouse", "inventory-tracking", "purchase-orders", "nhanhang"]
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

console.log('[Navigation] Config module loaded');
