/**
 * Storage Migration Helper (Script-tag version)
 * Migrates localStorage keys from old naming to module-prefixed naming
 *
 * Usage:
 * 1. Include this script: <script src="../shared/js/storage-migration.js"></script>
 * 2. Call window.StorageMigration.migrateModuleStorage('orders') on page load
 * 3. Use getModuleItem/setModuleItem for module-specific storage
 */

(function() {
    'use strict';

    // Module prefix mapping
    const MODULE_PREFIXES = {
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
    const SHARED_KEYS = [
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
    const MIGRATION_MAP = {
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

        // TPOS-Pancake module
        'pancake_server_mode': { module: 'tpos', newKey: 'tpos_pancake_server_mode' },
        'pancake_selected_page': { module: 'tpos', newKey: 'tpos_pancake_selected_page' },
        'pk_recent_emojis': { module: 'tpos', newKey: 'tpos_pk_recent_emojis' },
        'pancake_pages_cache': { module: 'tpos', newKey: 'tpos_pancake_pages_cache' },
        'pancake_active_account_id': { module: 'tpos', newKey: 'tpos_pancake_active_account_id' },
        'pancake_jwt_token': { module: 'tpos', newKey: 'tpos_pancake_jwt_token' },
        'pancake_jwt_token_expiry': { module: 'tpos', newKey: 'tpos_pancake_jwt_token_expiry' },
        'pancake_page_access_tokens': { module: 'tpos', newKey: 'tpos_pancake_page_access_tokens' },

        // Balance-history module
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
    function isSharedKey(key) {
        return SHARED_KEYS.includes(key);
    }

    /**
     * Get the prefixed key name for a module
     */
    function getPrefixedKey(moduleName, key) {
        const prefix = MODULE_PREFIXES[moduleName];
        if (!prefix) {
            console.warn('[StorageMigration] Unknown module:', moduleName);
            return key;
        }
        if (key.startsWith(prefix)) {
            return key;
        }
        return prefix + key;
    }

    /**
     * Migrate a single key from old to new name
     */
    function migrateKey(oldKey, newKey) {
        const oldValue = localStorage.getItem(oldKey);
        if (oldValue !== null) {
            const newValue = localStorage.getItem(newKey);
            if (newValue === null) {
                localStorage.setItem(newKey, oldValue);
                localStorage.removeItem(oldKey);
                console.log('[StorageMigration] Migrated:', oldKey, '->', newKey);
                return true;
            } else {
                localStorage.removeItem(oldKey);
                console.log('[StorageMigration] Removed old key (new exists):', oldKey);
                return false;
            }
        }
        return false;
    }

    /**
     * Migrate all keys for a specific module
     */
    function migrateModuleStorage(moduleName) {
        const results = { migrated: [], skipped: [], errors: [] };

        for (var oldKey in MIGRATION_MAP) {
            if (MIGRATION_MAP.hasOwnProperty(oldKey)) {
                var mapping = MIGRATION_MAP[oldKey];
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
        }

        if (results.migrated.length > 0) {
            console.log('[StorageMigration] Module "' + moduleName + '" migrated ' + results.migrated.length + ' keys');
        }

        return results;
    }

    /**
     * Migrate all modules at once
     */
    function migrateAllStorage() {
        var allResults = {};
        for (var moduleName in MODULE_PREFIXES) {
            if (MODULE_PREFIXES.hasOwnProperty(moduleName)) {
                allResults[moduleName] = migrateModuleStorage(moduleName);
            }
        }
        return allResults;
    }

    /**
     * Get item from localStorage with module prefix
     */
    function getModuleItem(moduleName, key) {
        var prefixedKey = getPrefixedKey(moduleName, key);
        return localStorage.getItem(prefixedKey);
    }

    /**
     * Set item in localStorage with module prefix
     */
    function setModuleItem(moduleName, key, value) {
        var prefixedKey = getPrefixedKey(moduleName, key);
        localStorage.setItem(prefixedKey, value);
    }

    /**
     * Remove item from localStorage with module prefix
     */
    function removeModuleItem(moduleName, key) {
        var prefixedKey = getPrefixedKey(moduleName, key);
        localStorage.removeItem(prefixedKey);
    }

    /**
     * Clear all module-specific keys (safer than localStorage.clear())
     */
    function clearModuleStorage(moduleName) {
        var prefix = MODULE_PREFIXES[moduleName];
        if (!prefix) {
            console.warn('[StorageMigration] Unknown module:', moduleName);
            return;
        }

        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(function(key) {
            localStorage.removeItem(key);
        });
        console.log('[StorageMigration] Cleared ' + keysToRemove.length + ' keys for module "' + moduleName + '"');
    }

    /**
     * Get all keys for a specific module
     */
    function getModuleKeys(moduleName) {
        var prefix = MODULE_PREFIXES[moduleName];
        if (!prefix) return [];

        var keys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keys.push(key);
            }
        }
        return keys;
    }

    /**
     * Selective logout - removes auth keys but keeps module data
     */
    function selectiveLogout() {
        var authKeys = [
            'loginindex_auth',
            'isLoggedIn',
            'userType',
            'checkLogin',
            'remember_login_preference',
            'bearer_token_data',
            'bearer_token_data_1',
            'bearer_token_data_2',
            'tpos_token',
            'auth'
        ];
        authKeys.forEach(function(key) {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
        console.log('[StorageMigration] Selective logout completed - module data preserved');
    }

    // Export to window
    window.StorageMigration = {
        MODULE_PREFIXES: MODULE_PREFIXES,
        SHARED_KEYS: SHARED_KEYS,
        MIGRATION_MAP: MIGRATION_MAP,
        isSharedKey: isSharedKey,
        getPrefixedKey: getPrefixedKey,
        migrateKey: migrateKey,
        migrateModuleStorage: migrateModuleStorage,
        migrateAllStorage: migrateAllStorage,
        getModuleItem: getModuleItem,
        setModuleItem: setModuleItem,
        removeModuleItem: removeModuleItem,
        clearModuleStorage: clearModuleStorage,
        getModuleKeys: getModuleKeys,
        selectiveLogout: selectiveLogout
    };

})();
