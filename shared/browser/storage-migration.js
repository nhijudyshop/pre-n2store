/**
 * Storage Migration Helper
 * Migrates localStorage keys from old naming to module-prefixed naming
 *
 * Usage:
 * 1. Import and call migrateModuleStorage('orders') on page load
 * 2. Use getModuleItem/setModuleItem for module-specific storage
 */

// Module prefix mapping
export const MODULE_PREFIXES = {
    orders: 'orders_',
    tpos: 'tpos_',
    balanceHistory: 'balanceHistory_',
    soluong: 'soluong_',
    inventory: 'inventory_',
    customerHub: 'customerHub_',
    ck: 'ck_',
    nhanhang: 'nhanhang_',
    userManagement: 'userManagement_'
};

// Keys that are SHARED across all modules (DO NOT prefix these)
export const SHARED_KEYS = [
    'loginindex_auth',
    'isLoggedIn',
    'userType',
    'checkLogin',
    'remember_login_preference',
    'bearer_token_data_1',
    'bearer_token_data_2',
    'bearer_token_data',  // Legacy (auto-migrated to bearer_token_data_1)
    'tpos_token',
    'n2store_selected_shop',
    'auth',
    'n2shop_current_user',
    'currentUser',
    'user_email',
    'appTheme',
    'theme',
    'appFontSize',
    'sidebarCollapsed',
    'ordersTableFontSize',
    'firebaseConfig',
    'user'
];

// Migration mapping: oldKey -> { module, newKey }
export const MIGRATION_MAP = {
    // Orders-report module
    'tab1_filter_data': { module: 'orders', newKey: 'orders_tab1_filter_data' },
    'campaign_user_id': { module: 'orders', newKey: 'orders_campaign_user_id' },
    'order_table_name': { module: 'orders', newKey: 'orders_table_name' },
    'ordersData': { module: 'orders', newKey: 'orders_data' },
    'billTemplateSettings': { module: 'orders', newKey: 'orders_billTemplateSettings' },
    'productAssignments': { module: 'orders', newKey: 'orders_productAssignments' },
    'productRemovals': { module: 'orders', newKey: 'orders_productRemovals' },
    'n2store_held_cleanup_pending': { module: 'orders', newKey: 'orders_held_cleanup_pending' },
    'discount_stats_thresholds': { module: 'orders', newKey: 'orders_discount_stats_thresholds' },
    'discount_opportunity_cost_settings': { module: 'orders', newKey: 'orders_discount_opportunity_cost_settings' },
    'discount_livestream_costs': { module: 'orders', newKey: 'orders_discount_livestream_costs' },
    'chat_realtime_enabled': { module: 'orders', newKey: 'orders_chat_realtime_enabled' },
    'chat_realtime_mode': { module: 'orders', newKey: 'orders_chat_realtime_mode' },
    'chat_api_source': { module: 'orders', newKey: 'orders_chat_api_source' },

    // TPOS-Pancake module (keys that don't already have tpos_/pancake_ prefix)
    'pancake_server_mode': { module: 'tpos', newKey: 'tpos_pancake_server_mode' },
    'pancake_selected_page': { module: 'tpos', newKey: 'tpos_pancake_selected_page' },
    'pk_recent_emojis': { module: 'tpos', newKey: 'tpos_pk_recent_emojis' },
    'pancake_pages_cache': { module: 'tpos', newKey: 'tpos_pancake_pages_cache' },
    'pancake_active_account_id': { module: 'tpos', newKey: 'tpos_pancake_active_account_id' },
    'pancake_jwt_token': { module: 'tpos', newKey: 'tpos_pancake_jwt_token' },
    'pancake_jwt_token_expiry': { module: 'tpos', newKey: 'tpos_pancake_jwt_token_expiry' },
    'pancake_page_access_tokens': { module: 'tpos', newKey: 'tpos_pancake_page_access_tokens' },

    // Balance-history module (bh_ is too short, expand to balanceHistory_)
    'bh_view_mode': { module: 'balanceHistory', newKey: 'balanceHistory_view_mode' },
    'bh_main_tab': { module: 'balanceHistory', newKey: 'balanceHistory_main_tab' },
    'livemode_show_confirmed': { module: 'balanceHistory', newKey: 'balanceHistory_livemode_show_confirmed' },

    // Soluong-live module
    'soluongCartHistoryExpanded': { module: 'soluong', newKey: 'soluong_cartHistoryExpanded' },
    'bearerToken': { module: 'soluong', newKey: 'soluong_bearerToken' },
    'tokenExpiry': { module: 'soluong', newKey: 'soluong_tokenExpiry' },

    // Customer-hub module
    'quickReplies': { module: 'customerHub', newKey: 'customerHub_quickReplies' },
    'soluongDisplaySettings': { module: 'customerHub', newKey: 'customerHub_soluongDisplaySettings' },
    'orderTableExcludedTags': { module: 'customerHub', newKey: 'customerHub_orderTableExcludedTags' },
    'sanphamlive_cache': { module: 'customerHub', newKey: 'customerHub_sanphamlive_cache' },
    'orders_phone_qr_cache': { module: 'customerHub', newKey: 'customerHub_orders_phone_qr_cache' },
    'report_order_details_by_table': { module: 'customerHub', newKey: 'customerHub_report_order_details_by_table' },
    'balance_history_customer_info': { module: 'customerHub', newKey: 'customerHub_balance_history_customer_info' }
};

/**
 * Check if a key is shared (should not be prefixed)
 */
export function isSharedKey(key) {
    return SHARED_KEYS.includes(key);
}

/**
 * Get the prefixed key name for a module
 * @param {string} moduleName - Module name (orders, tpos, etc.)
 * @param {string} key - Original key name (without prefix)
 * @returns {string} Prefixed key name
 */
export function getPrefixedKey(moduleName, key) {
    const prefix = MODULE_PREFIXES[moduleName];
    if (!prefix) {
        console.warn(`[StorageMigration] Unknown module: ${moduleName}`);
        return key;
    }
    // Don't double-prefix if already has the prefix
    if (key.startsWith(prefix)) {
        return key;
    }
    return `${prefix}${key}`;
}

/**
 * Migrate a single key from old to new name
 * @param {string} oldKey
 * @param {string} newKey
 * @returns {boolean} True if migrated
 */
export function migrateKey(oldKey, newKey) {
    const oldValue = localStorage.getItem(oldKey);
    if (oldValue !== null) {
        // Only migrate if new key doesn't exist or is empty
        const newValue = localStorage.getItem(newKey);
        if (newValue === null) {
            localStorage.setItem(newKey, oldValue);
            localStorage.removeItem(oldKey);
            console.log(`[StorageMigration] Migrated: ${oldKey} -> ${newKey}`);
            return true;
        } else {
            // New key exists, just remove old key
            localStorage.removeItem(oldKey);
            console.log(`[StorageMigration] Removed old key (new exists): ${oldKey}`);
            return false;
        }
    }
    return false;
}

/**
 * Migrate all keys for a specific module
 * @param {string} moduleName - Module name to migrate
 * @returns {object} Migration results
 */
export function migrateModuleStorage(moduleName) {
    const results = { migrated: [], skipped: [], errors: [] };

    for (const [oldKey, mapping] of Object.entries(MIGRATION_MAP)) {
        if (mapping.module === moduleName) {
            try {
                if (migrateKey(oldKey, mapping.newKey)) {
                    results.migrated.push({ from: oldKey, to: mapping.newKey });
                } else {
                    results.skipped.push(oldKey);
                }
            } catch (e) {
                results.errors.push({ key: oldKey, error: e.message });
            }
        }
    }

    if (results.migrated.length > 0) {
        console.log(`[StorageMigration] Module '${moduleName}' migrated ${results.migrated.length} keys`);
    }

    return results;
}

/**
 * Migrate all modules at once (use on main page load)
 * @returns {object} All migration results by module
 */
export function migrateAllStorage() {
    const allResults = {};
    for (const moduleName of Object.keys(MODULE_PREFIXES)) {
        allResults[moduleName] = migrateModuleStorage(moduleName);
    }
    return allResults;
}

/**
 * Get item from localStorage with module prefix
 * @param {string} moduleName
 * @param {string} key
 * @returns {string|null}
 */
export function getModuleItem(moduleName, key) {
    const prefixedKey = getPrefixedKey(moduleName, key);
    return localStorage.getItem(prefixedKey);
}

/**
 * Set item in localStorage with module prefix
 * @param {string} moduleName
 * @param {string} key
 * @param {string} value
 */
export function setModuleItem(moduleName, key, value) {
    const prefixedKey = getPrefixedKey(moduleName, key);
    localStorage.setItem(prefixedKey, value);
}

/**
 * Remove item from localStorage with module prefix
 * @param {string} moduleName
 * @param {string} key
 */
export function removeModuleItem(moduleName, key) {
    const prefixedKey = getPrefixedKey(moduleName, key);
    localStorage.removeItem(prefixedKey);
}

/**
 * Clear all module-specific keys (safer than localStorage.clear())
 * This only removes keys with the module prefix, keeping shared keys intact
 * @param {string} moduleName
 */
export function clearModuleStorage(moduleName) {
    const prefix = MODULE_PREFIXES[moduleName];
    if (!prefix) {
        console.warn(`[StorageMigration] Unknown module: ${moduleName}`);
        return;
    }

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`[StorageMigration] Cleared ${keysToRemove.length} keys for module '${moduleName}'`);
}

/**
 * Get all keys for a specific module
 * @param {string} moduleName
 * @returns {string[]}
 */
export function getModuleKeys(moduleName) {
    const prefix = MODULE_PREFIXES[moduleName];
    if (!prefix) return [];

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keys.push(key);
        }
    }
    return keys;
}

// Auto-export for window object if not in module context
if (typeof window !== 'undefined') {
    window.StorageMigration = {
        MODULE_PREFIXES,
        SHARED_KEYS,
        MIGRATION_MAP,
        isSharedKey,
        getPrefixedKey,
        migrateKey,
        migrateModuleStorage,
        migrateAllStorage,
        getModuleItem,
        setModuleItem,
        removeModuleItem,
        clearModuleStorage,
        getModuleKeys
    };
}
