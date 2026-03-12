/**
 * KPI Audit Logger - Ghi audit log cho mọi thao tác sản phẩm
 * 
 * Module trung tâm ghi lại mọi thao tác thêm/xóa sản phẩm trong đơn hàng
 * từ tất cả giao diện (chat, edit modal, sale modal, merge).
 * 
 * Features:
 * - Ghi audit log vào Firestore `kpi_audit_log/{auto-id}`
 * - Retry 3 lần với exponential backoff khi Firestore fail
 * - Fallback localStorage queue `kpi_audit_pending` khi offline
 * - Auto-process pending logs on page load
 * 
 * Firestore Structure:
 * - kpi_audit_log/{auto-id} - Append-only audit log entries
 * 
 * Source values:
 * - chat_confirm_held: confirmHeldProduct()
 * - chat_decrease: decreaseMainProductQuantityById()
 * - chat_from_dropped: moveDroppedToOrder()
 * - edit_modal_inline: addProductToOrderFromInline()
 * - edit_modal_remove: removeProduct()
 * - edit_modal_quantity: updateProductQuantity()
 * - sale_modal: addProductToSaleFromSearch()
 * - merge: executeMergeOrderProducts()
 * - system: Auto-generated
 */

(function () {
    'use strict';

    const AUDIT_LOG_COLLECTION = 'kpi_audit_log';
    const PENDING_QUEUE_KEY = 'kpi_audit_pending';
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 1000; // 1s, 2s, 4s exponential backoff

    const REQUIRED_FIELDS = ['orderId', 'action', 'productId', 'productCode', 'productName', 'quantity', 'source'];
    const VALID_ACTIONS = ['add', 'remove', 'merge'];
    const VALID_SOURCES = [
        'chat_confirm_held', 'chat_decrease', 'chat_from_dropped',
        'edit_modal_inline', 'edit_modal_remove', 'edit_modal_quantity',
        'sale_modal', 'merge', 'system'
    ];

    // ==========================================
    // Helper Functions
    // ==========================================

    /**
     * Get current user info from authManager
     * @returns {{ userId: string, userName: string }}
     */
    function getCurrentUserInfo() {
        try {
            if (window.authManager && typeof window.authManager.getAuthState === 'function') {
                const authState = window.authManager.getAuthState();
                return {
                    userId: authState.userId || authState.uid || '',
                    userName: authState.displayName || authState.email || ''
                };
            }
        } catch (error) {
            console.warn('[KPI Audit] Could not get user info from authManager:', error);
        }
        return { userId: '', userName: '' };
    }

    /**
     * Get current campaign info from campaignManager
     * @returns {{ campaignId: string, campaignName: string }}
     */
    function getCampaignInfo() {
        try {
            if (window.campaignManager) {
                return {
                    campaignId: window.campaignManager.activeCampaignId || '',
                    campaignName: (window.campaignManager.activeCampaign && window.campaignManager.activeCampaign.name) || ''
                };
            }
        } catch (error) {
            console.warn('[KPI Audit] Could not get campaign info from campaignManager:', error);
        }
        return { campaignId: '', campaignName: '' };
    }

    /**
     * Sleep for a given number of milliseconds
     * @param {number} ms
     * @returns {Promise<void>}
     */
    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    /**
     * Validate that an entry has all required fields
     * @param {Object} entry
     * @returns {{ valid: boolean, missing: string[] }}
     */
    function validateEntry(entry) {
        var missing = [];
        for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
            var field = REQUIRED_FIELDS[i];
            if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
                missing.push(field);
            }
        }

        if (entry.action && VALID_ACTIONS.indexOf(entry.action) === -1) {
            missing.push('action (invalid: ' + entry.action + ')');
        }

        if (entry.source && VALID_SOURCES.indexOf(entry.source) === -1) {
            missing.push('source (invalid: ' + entry.source + ')');
        }

        if (entry.quantity !== undefined && (typeof entry.quantity !== 'number' || entry.quantity <= 0)) {
            missing.push('quantity (must be positive number)');
        }

        return { valid: missing.length === 0, missing: missing };
    }

    // ==========================================
    // Firestore Operations
    // ==========================================

    /**
     * Get Firestore instance
     * @returns {Object|null} Firestore instance
     */
    function getFirestore() {
        try {
            if (window.firebase && typeof window.firebase.firestore === 'function') {
                return window.firebase.firestore();
            }
        } catch (error) {
            console.error('[KPI Audit] Firestore not available:', error);
        }
        return null;
    }

    /**
     * Write a single audit log entry to Firestore with retry
     * @param {Object} logData - Complete log data to write
     * @returns {Promise<string|null>} Document ID if successful, null if failed
     */
    async function writeToFirestore(logData) {
        var db = getFirestore();
        if (!db) {
            throw new Error('Firestore not available');
        }

        for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                var docRef = await db.collection(AUDIT_LOG_COLLECTION).add(logData);
                return docRef.id;
            } catch (error) {
                console.warn('[KPI Audit] Write attempt ' + (attempt + 1) + '/' + MAX_RETRIES + ' failed:', error.message);
                if (attempt < MAX_RETRIES - 1) {
                    var delay = BASE_DELAY_MS * Math.pow(2, attempt);
                    await sleep(delay);
                }
            }
        }

        throw new Error('Failed to write audit log after ' + MAX_RETRIES + ' retries');
    }

    // ==========================================
    // Pending Queue (localStorage)
    // ==========================================

    /**
     * Get pending logs from localStorage
     * @returns {Array} Pending log entries
     */
    function getPendingLogs() {
        try {
            var data = localStorage.getItem(PENDING_QUEUE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('[KPI Audit] Error reading pending logs:', error);
            return [];
        }
    }

    /**
     * Save pending logs to localStorage
     * @param {Array} logs
     */
    function savePendingLogs(logs) {
        try {
            localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(logs));
        } catch (error) {
            console.error('[KPI Audit] Error saving pending logs:', error);
        }
    }

    /**
     * Add an entry to the pending queue
     * @param {Object} entry - Log entry to queue
     */
    function addToPendingQueue(entry) {
        var pending = getPendingLogs();
        entry._retryCount = 0;
        entry._createdAt = new Date().toISOString();
        pending.push(entry);
        savePendingLogs(pending);
        console.log('[KPI Audit] Entry added to pending queue. Queue size:', pending.length);
    }

    // ==========================================
    // Core Public Functions
    // ==========================================

    /**
     * Log a product action to Firestore audit log.
     * Validates required fields, writes with server timestamp,
     * retries 3 times with exponential backoff,
     * falls back to localStorage pending queue on failure.
     * 
     * @param {Object} entry - Audit log entry
     * @param {string} entry.orderId - Order ID
     * @param {string} entry.action - "add" | "remove" | "merge"
     * @param {number} entry.productId - Product ID
     * @param {string} entry.productCode - Product code
     * @param {string} entry.productName - Product name
     * @param {number} entry.quantity - Quantity changed (always positive)
     * @param {string} entry.source - Source of action
     * @param {string} [entry.userId] - User ID (auto-filled if not provided)
     * @param {string} [entry.userName] - User name (auto-filled if not provided)
     * @param {string} [entry.campaignId] - Campaign ID (auto-filled if not provided)
     * @param {string} [entry.campaignName] - Campaign name (auto-filled if not provided)
     * @param {boolean} [entry.out_of_range] - True if order is outside employee range
     * @param {Object} [entry.mergeInfo] - Merge info (only for action="merge")
     * @returns {Promise<string|null>} Document ID if successful, null if queued to pending
     */
    async function logProductAction(entry) {
        // Auto-fill user info if not provided
        if (!entry.userId || !entry.userName) {
            var userInfo = getCurrentUserInfo();
            if (!entry.userId) entry.userId = userInfo.userId;
            if (!entry.userName) entry.userName = userInfo.userName;
        }

        // Auto-fill campaign info if not provided
        if (!entry.campaignId || !entry.campaignName) {
            var campaignInfo = getCampaignInfo();
            if (!entry.campaignId) entry.campaignId = campaignInfo.campaignId;
            if (!entry.campaignName) entry.campaignName = campaignInfo.campaignName;
        }

        // Validate required fields
        var validation = validateEntry(entry);
        if (!validation.valid) {
            console.error('[KPI Audit] Invalid entry, missing fields:', validation.missing, entry);
            throw new Error('Invalid audit log entry. Missing: ' + validation.missing.join(', '));
        }

        // Build the complete log data with server timestamp
        var logData = {
            orderId: entry.orderId,
            action: entry.action,
            productId: entry.productId,
            productCode: entry.productCode,
            productName: entry.productName,
            quantity: entry.quantity,
            userId: entry.userId,
            userName: entry.userName,
            timestamp: window.firebase.firestore.FieldValue.serverTimestamp(),
            campaignId: entry.campaignId || '',
            campaignName: entry.campaignName || '',
            source: entry.source,
            out_of_range: entry.out_of_range || false
        };

        // Add merge info if present
        if (entry.mergeInfo) {
            logData.mergeInfo = entry.mergeInfo;
        }

        try {
            var docId = await writeToFirestore(logData);
            console.log('[KPI Audit] ✓ Logged:', entry.action, entry.productCode, 'x' + entry.quantity, '→', entry.source, '(doc:', docId + ')');
            return docId;
        } catch (error) {
            console.error('[KPI Audit] ✗ Failed to write audit log, adding to pending queue:', error.message);

            // Fallback: save to localStorage pending queue (without server timestamp)
            var pendingEntry = Object.assign({}, logData);
            pendingEntry.timestamp = new Date().toISOString(); // Use client timestamp for pending
            pendingEntry._pendingServerTimestamp = true; // Flag to replace with server timestamp on retry
            addToPendingQueue(pendingEntry);

            return null;
        }
    }

    /**
     * Process pending audit logs from localStorage.
     * Retries writing each entry to Firestore.
     * Removes successful entries, keeps failed ones (max 3 retries).
     * 
     * @returns {Promise<{ success: number, failed: number }>}
     */
    async function processPendingLogs() {
        var pending = getPendingLogs();
        if (pending.length === 0) {
            return { success: 0, failed: 0 };
        }

        console.log('[KPI Audit] Processing', pending.length, 'pending audit logs...');

        var remaining = [];
        var successCount = 0;
        var failedCount = 0;

        for (var i = 0; i < pending.length; i++) {
            var entry = pending[i];
            var retryCount = entry._retryCount || 0;

            // Skip entries that have exceeded max retries
            if (retryCount >= MAX_RETRIES) {
                entry._expired = true;
                remaining.push(entry);
                failedCount++;
                continue;
            }

            try {
                // Rebuild log data with server timestamp
                var logData = Object.assign({}, entry);
                delete logData._retryCount;
                delete logData._createdAt;
                delete logData._pendingServerTimestamp;
                delete logData._expired;

                // Replace client timestamp with server timestamp
                logData.timestamp = window.firebase.firestore.FieldValue.serverTimestamp();

                await writeToFirestore(logData);
                successCount++;
                console.log('[KPI Audit] ✓ Pending log processed:', entry.action, entry.productCode);
            } catch (error) {
                entry._retryCount = retryCount + 1;
                remaining.push(entry);
                failedCount++;
                console.warn('[KPI Audit] Pending log retry failed (attempt ' + entry._retryCount + '):', error.message);
            }
        }

        savePendingLogs(remaining);
        console.log('[KPI Audit] Pending processing complete. Success:', successCount, 'Failed:', failedCount, 'Remaining:', remaining.length);

        return { success: successCount, failed: failedCount };
    }

    // ==========================================
    // Query Functions
    // ==========================================

    /**
     * Get all audit logs for a specific order, ordered by timestamp ascending.
     * 
     * @param {string} orderId - Order ID to query
     * @returns {Promise<Array>} Array of audit log entries
     */
    async function getAuditLogsForOrder(orderId) {
        var db = getFirestore();
        if (!db) {
            console.error('[KPI Audit] Firestore not available for query');
            return [];
        }

        try {
            var snapshot = await db.collection(AUDIT_LOG_COLLECTION)
                .where('orderId', '==', orderId)
                .orderBy('timestamp', 'asc')
                .get();

            var logs = [];
            snapshot.forEach(function (doc) {
                var data = doc.data();
                data.id = doc.id;
                logs.push(data);
            });

            return logs;
        } catch (error) {
            // Fallback: query without orderBy (no composite index needed)
            console.warn('[KPI Audit] Composite index query failed, using fallback without orderBy:', error.message);
            try {
                var fallbackSnapshot = await db.collection(AUDIT_LOG_COLLECTION)
                    .where('orderId', '==', orderId)
                    .get();

                var fallbackLogs = [];
                fallbackSnapshot.forEach(function (doc) {
                    var data = doc.data();
                    data.id = doc.id;
                    fallbackLogs.push(data);
                });

                // Sort client-side by timestamp
                fallbackLogs.sort(function (a, b) {
                    var tsA = a.timestamp;
                    var tsB = b.timestamp;
                    // Handle Firestore Timestamp objects
                    if (tsA && tsA.toMillis) tsA = tsA.toMillis();
                    else if (tsA && tsA.seconds) tsA = tsA.seconds * 1000;
                    else if (typeof tsA === 'string') tsA = new Date(tsA).getTime();
                    else tsA = 0;
                    if (tsB && tsB.toMillis) tsB = tsB.toMillis();
                    else if (tsB && tsB.seconds) tsB = tsB.seconds * 1000;
                    else if (typeof tsB === 'string') tsB = new Date(tsB).getTime();
                    else tsB = 0;
                    return tsA - tsB;
                });

                console.log('[KPI Audit] Fallback query returned', fallbackLogs.length, 'logs for order', orderId);
                return fallbackLogs;
            } catch (fallbackError) {
                console.error('[KPI Audit] Fallback query also failed for order', orderId, ':', fallbackError);
                return [];
            }
        }
    }

    /**
     * Get audit logs filtered by campaign name and date range.
     * 
     * @param {string} campaignName - Campaign name to filter
     * @param {Date|string} dateFrom - Start date (inclusive)
     * @param {Date|string} dateTo - End date (inclusive)
     * @returns {Promise<Array>} Array of audit log entries
     */
    async function getAuditLogsByCampaign(campaignName, dateFrom, dateTo) {
        var db = getFirestore();
        if (!db) {
            console.error('[KPI Audit] Firestore not available for query');
            return [];
        }

        try {
            var query = db.collection(AUDIT_LOG_COLLECTION)
                .where('campaignName', '==', campaignName);

            // Apply date range filter if provided
            if (dateFrom) {
                var fromDate = dateFrom instanceof Date ? dateFrom : new Date(dateFrom);
                fromDate.setHours(0, 0, 0, 0);
                query = query.where('timestamp', '>=', fromDate);
            }

            if (dateTo) {
                var toDate = dateTo instanceof Date ? dateTo : new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                query = query.where('timestamp', '<=', toDate);
            }

            query = query.orderBy('timestamp', 'asc');

            var snapshot = await query.get();

            var logs = [];
            snapshot.forEach(function (doc) {
                var data = doc.data();
                data.id = doc.id;
                logs.push(data);
            });

            return logs;
        } catch (error) {
            console.error('[KPI Audit] Error querying audit logs by campaign', campaignName, ':', error);
            return [];
        }
    }

    // ==========================================
    // Auto-process on page load
    // ==========================================

    document.addEventListener('DOMContentLoaded', function () {
        // Delay slightly to ensure Firebase is initialized
        setTimeout(function () {
            processPendingLogs().then(function (result) {
                if (result.success > 0 || result.failed > 0) {
                    console.log('[KPI Audit] Page load pending processing:', result);
                }
            }).catch(function (error) {
                console.warn('[KPI Audit] Error processing pending logs on page load:', error);
            });
        }, 2000);
    });

    // ==========================================
    // Export to window
    // ==========================================

    window.kpiAuditLogger = {
        // Core functions
        logProductAction: logProductAction,
        processPendingLogs: processPendingLogs,

        // Query functions
        getAuditLogsForOrder: getAuditLogsForOrder,
        getAuditLogsByCampaign: getAuditLogsByCampaign,

        // Helpers (exposed for testing/debugging)
        getCurrentUserInfo: getCurrentUserInfo,
        getCampaignInfo: getCampaignInfo,

        // Constants
        AUDIT_LOG_COLLECTION: AUDIT_LOG_COLLECTION,
        PENDING_QUEUE_KEY: PENDING_QUEUE_KEY,
        MAX_RETRIES: MAX_RETRIES,
        VALID_ACTIONS: VALID_ACTIONS,
        VALID_SOURCES: VALID_SOURCES
    };

    console.log('[KPI Audit] ✓ KPI Audit Logger initialized');

})();
