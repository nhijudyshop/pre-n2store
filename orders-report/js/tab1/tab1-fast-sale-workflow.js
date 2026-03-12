/**
 * Fast Sale Workflow Module
 * - Xử lý quy trình sau khi đi đơn hàng loạt
 * - Nút "Nhờ hủy đơn" cho đơn thành công
 * - Gắn tag "Âm Mã" cho đơn thất bại
 * - Gỡ tag "OK + NV" cho đơn khách OK
 * - Toggle auto gửi bill sau khi thành công
 *
 * @version 1.0.0
 */

(function () {
    'use strict';

    // =====================================================
    // INVOICE STATUS DELETE STORE
    // Lưu trữ thông tin đơn hủy với lý do
    // Uses BaseStore internally for core data management
    // =====================================================

    const DELETE_STORAGE_KEY = 'invoiceStatusDelete_v2';
    const DELETE_FIRESTORE_COLLECTION = 'invoice_status_delete_v2';
    const DELETE_MAX_AGE_DAYS = 14; // Auto cleanup after 14 days

    const _deleteBaseStore = new BaseStore({
        collectionPath: DELETE_FIRESTORE_COLLECTION,
        localStorageKey: DELETE_STORAGE_KEY,
        maxLocalAge: DELETE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    });

    const InvoiceStatusDeleteStore = {
        /** @returns {Map} Internal data map (delegated to BaseStore) */
        get _data() { return _deleteBaseStore._data; },
        set _data(val) { _deleteBaseStore._data = val; },

        /** @returns {boolean} Whether store is initialized (delegated to BaseStore) */
        get _initialized() { return _deleteBaseStore._initialized; },
        set _initialized(val) { _deleteBaseStore._initialized = val; },

        /** @returns {Function|null} Firestore listener unsubscribe (delegated to BaseStore) */
        get _unsubscribe() { return _deleteBaseStore._unsubscribe; },
        set _unsubscribe(val) { _deleteBaseStore._unsubscribe = val; },

        _isListening: false,       // Flag to prevent save loops when receiving updates

        /**
         * Initialize store from Firestore (source of truth)
         * Firebase là source of truth - localStorage chỉ là cache
         */
        async init() {
            if (this._initialized) return;

            try {
                // 1. Load from Firestore FIRST (source of truth)
                const loadedFromFirestore = await this._loadFromFirestore();

                // 2. Nếu không load được từ Firestore, fallback to localStorage (offline mode)
                if (!loadedFromFirestore) {
                    // Use BaseStore's localStorage loading
                    _deleteBaseStore._loadFromLocal();
                    console.log(`[INVOICE-DELETE] Offline mode - loaded ${this._data.size} entries from localStorage cache`);
                }

                // 3. Cleanup old entries (>14 days) - delegate to BaseStore
                _deleteBaseStore._cleanupOldEntries();

                this._initialized = true;

                // 4. Setup real-time listener for add/delete from other devices
                this._setupRealtimeListener();
            } catch (e) {
                console.error('[INVOICE-DELETE] Error initializing store:', e);
                this._initialized = true;
            }
        },

        /**
         * Get Firestore doc reference
         */
        _getDocRef() {
            const db = firebase.firestore();
            // Get username from authManager or fallback to localStorage
            const authData = window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
            const userType = authData?.userType || localStorage.getItem('userType') || '';
            const username = authData?.username || userType.split('-')[0] || 'default';
            console.log(`[INVOICE-DELETE] Using Firestore doc: ${DELETE_FIRESTORE_COLLECTION}/${username}`);
            return db.collection(DELETE_FIRESTORE_COLLECTION).doc(username);
        },

        /**
         * Save only to localStorage (extends BaseStore's format)
         */
        _saveToLocalStorage() {
            try {
                localStorage.setItem(DELETE_STORAGE_KEY, JSON.stringify({
                    data: Array.from(this._data.entries()),
                    timestamp: Date.now(),
                    version: 1
                }));
                console.log(`[INVOICE-DELETE] Saved to localStorage: ${this._data.size} entries`);
            } catch (e) {
                console.error('[INVOICE-DELETE] Error saving to localStorage:', e);
            }
        },

        /**
         * Load from Firestore (source of truth) - THAY THẾ toàn bộ _data
         * @returns {boolean} true nếu load thành công từ Firestore
         */
        async _loadFromFirestore() {
            try {
                const docRef = this._getDocRef();
                const doc = await docRef.get();

                // CLEAR old data - Firestore là source of truth
                this._data.clear();

                if (doc.exists) {
                    const firestoreData = doc.data();
                    if (firestoreData.data) {
                        const entries = Object.entries(firestoreData.data);
                        entries.forEach(([key, value]) => {
                            this._data.set(key, value);
                        });
                    }
                }

                console.log(`[INVOICE-DELETE] Loaded ${this._data.size} entries from Firestore (source of truth)`);
                // Cache to localStorage
                this._saveToLocalStorage();
                return true;
            } catch (e) {
                console.error('[INVOICE-DELETE] Error loading from Firestore:', e);
                return false; // Signal để fallback về localStorage
            }
        },

        /**
         * Remove undefined values from object (Firestore doesn't accept undefined)
         */
        _cleanForFirestore(obj) {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) {
                return obj.map(item => this._cleanForFirestore(item)).filter(item => item !== undefined);
            }
            const cleaned = {};
            for (const [key, value] of Object.entries(obj)) {
                if (value !== undefined) {
                    cleaned[key] = this._cleanForFirestore(value);
                }
            }
            return cleaned;
        },

        /**
         * Save to localStorage and sync to Firestore
         */
        async _save() {
            try {
                // Save to localStorage (using BaseStore-compatible format)
                this._saveToLocalStorage();

                // Skip Firestore save if currently receiving real-time updates (avoid infinite loops)
                if (this._isListening) {
                    console.log(`[INVOICE-DELETE] Skipping Firestore save (receiving real-time updates)`);
                    return;
                }

                // Sync to Firestore (if Firebase is available)
                // Uses merge:true for add/update, delete uses FieldValue.delete() separately
                if (typeof firebase !== 'undefined' && firebase.firestore) {
                    const docRef = this._getDocRef();
                    console.log(`[INVOICE-DELETE] Saving to Firestore collection: ${DELETE_FIRESTORE_COLLECTION}`);
                    // Clean data to remove undefined values (Firestore doesn't accept them)
                    const dataObj = Object.fromEntries(this._data);
                    const cleanedData = this._cleanForFirestore(dataObj);
                    await docRef.set({ data: cleanedData, lastUpdated: Date.now() }, { merge: true });
                    console.log(`[INVOICE-DELETE] Synced to Firestore successfully`);
                } else {
                    console.warn('[INVOICE-DELETE] Firebase not available, skipping Firestore sync');
                }
            } catch (e) {
                console.error('[INVOICE-DELETE] Error saving:', e);
            }
        },

        /**
         * Setup real-time listener for add/delete operations from other devices
         */
        _setupRealtimeListener() {
            // Don't setup if already listening
            if (this._unsubscribe) {
                console.log('[INVOICE-DELETE] Real-time listener already active');
                return;
            }

            console.log('[INVOICE-DELETE] Setting up real-time listener...');
            this._unsubscribe = this._getDocRef()
                .onSnapshot((doc) => {
                    this._handleDocSnapshot(doc);
                }, (error) => {
                    console.error('[INVOICE-DELETE] Real-time listener error:', error);
                });
        },

        /**
         * Handle document snapshot from real-time listener
         * @param {firebase.firestore.DocumentSnapshot} doc
         */
        _handleDocSnapshot(doc) {
            // Skip the initial snapshot (we already loaded data in init)
            if (!this._initialized) return;

            // Set flag to prevent save loops
            this._isListening = true;

            let hasChanges = false;

            if (doc.exists) {
                const firestoreData = doc.data();

                // Update entries from Firestore
                if (firestoreData.data) {
                    const entries = Object.entries(firestoreData.data);
                    entries.forEach(([key, value]) => {
                        const existingEntry = this._data.get(key);
                        // Only update if entry doesn't exist locally or server data is newer
                        if (!existingEntry || (value.deletedAt && value.deletedAt > (existingEntry.deletedAt || 0))) {
                            this._data.set(key, value);
                            hasChanges = true;
                            console.log(`[INVOICE-DELETE] Real-time: Entry ${key} added/updated`);
                        }
                    });

                    // Check for deleted entries (entries in local but not in server)
                    // Note: Only sync deletes if the server entry is completely gone
                    const serverKeys = new Set(Object.keys(firestoreData.data));
                    this._data.forEach((value, key) => {
                        if (!serverKeys.has(key)) {
                            this._data.delete(key);
                            hasChanges = true;
                            console.log(`[INVOICE-DELETE] Real-time: Entry ${key} removed (deleted on server)`);
                        }
                    });
                }
            }

            // Update localStorage cache if there were changes
            if (hasChanges) {
                this._saveToLocalStorage();
                console.log('[INVOICE-DELETE] Real-time: localStorage cache updated');
            }

            // Reset flag
            this._isListening = false;
        },

        /**
         * Destroy real-time listener and cleanup (delegates to BaseStore)
         * Call this when the page is unloaded or the store is no longer needed
         */
        destroy() {
            _deleteBaseStore.destroy();
            console.log('[INVOICE-DELETE] Store destroyed (via BaseStore)');
        },

        /**
         * Add a cancelled order with reason
         * IMPORTANT: Does NOT overwrite existing entries - creates unique key with timestamp
         * @param {string} saleOnlineId - SaleOnline order ID
         * @param {object} invoiceData - Full invoice data from invoiceStatusStore
         * @param {string} reason - Cancellation reason
         */
        async add(saleOnlineId, invoiceData, reason) {
            // Generate unique key: saleOnlineId_timestamp to avoid overwriting duplicates
            const timestamp = Date.now();
            const key = `${String(saleOnlineId)}_${timestamp}`;

            // Get username from authManager
            const authData = window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
            const username = authData?.username || (authData?.userType ? authData.userType.split('-')[0] : 'unknown');
            // Get displayName from Firebase users collection (same as currentUserIdentifier)
            const displayName = window.currentUserIdentifier || username;

            const entry = {
                ...invoiceData,
                SaleOnlineId: String(saleOnlineId), // Store original ID for reference
                cancelReason: reason,
                deletedAt: timestamp,
                deletedBy: username,
                deletedByDisplayName: displayName, // Tên hiển thị từ Firebase (VD: "HẠNH", "HUYÊN")
                isOldVersion: false, // Đánh dấu version mới
                hidden: false // Trạng thái ẩn/hiện - mặc định là hiện
            };

            this._data.set(key, entry);
            await this._save();

            console.log(`[INVOICE-DELETE] Added cancelled order: ${saleOnlineId} (key: ${key}), reason: ${reason}`);
            return entry;
        },

        /**
         * Toggle hidden status of an entry
         * @param {string} key - Entry key (saleOnlineId_timestamp)
         * @returns {boolean} - New hidden status
         */
        async toggleHidden(key) {
            const entry = this._data.get(key);
            if (!entry) {
                console.warn(`[INVOICE-DELETE] Entry not found: ${key}`);
                return null;
            }

            entry.hidden = !entry.hidden;
            this._data.set(key, entry);
            await this._save();

            console.log(`[INVOICE-DELETE] Toggled hidden for ${key}: ${entry.hidden}`);
            return entry.hidden;
        },

        /**
         * Delete an entry from the store
         * @param {string} key - Entry key (saleOnlineId_timestamp)
         */
        async delete(key) {
            if (!this._data.has(key)) {
                console.warn(`[INVOICE-DELETE] Entry not found for deletion: ${key}`);
                return false;
            }

            // Remove from local _data
            this._data.delete(key);
            this._saveToLocalStorage();

            // Delete specific field from Firestore using FieldValue.delete()
            try {
                if (typeof firebase !== 'undefined' && firebase.firestore) {
                    await this._getDocRef().update({
                        [`data.${key}`]: firebase.firestore.FieldValue.delete(),
                        lastUpdated: Date.now()
                    });
                    console.log(`[INVOICE-DELETE] Deleted entry from Firestore: ${key}`);
                }
            } catch (e) {
                console.error('[INVOICE-DELETE] Firestore delete error:', e);
                // Fallback: save entire document if update fails
                await this._save();
            }

            return true;
        },

        /**
         * Get cancelled order data
         */
        get(saleOnlineId) {
            return this._data.get(String(saleOnlineId));
        },

        /**
         * Get all cancelled orders
         */
        getAll() {
            return Array.from(this._data.entries());
        },

        /**
         * Cleanup old entries (delegates to BaseStore's _cleanupOldEntries)
         * BaseStore checks both `timestamp` and `lastUpdated` fields;
         * InvoiceStatusDeleteStore entries use `deletedAt` as their timestamp,
         * so we also handle that here for entries that only have `deletedAt`.
         */
        async cleanup() {
            const now = Date.now();
            const maxAge = DELETE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

            // First, let BaseStore handle entries with standard timestamp/lastUpdated
            _deleteBaseStore._cleanupOldEntries();

            // Then handle entries that only have deletedAt (custom to this store)
            let removed = 0;
            const keysToRemove = [];
            this._data.forEach((value, key) => {
                if (value.deletedAt && !value.timestamp && !value.lastUpdated && (now - value.deletedAt) > maxAge) {
                    keysToRemove.push(key);
                    removed++;
                }
            });
            keysToRemove.forEach(key => this._data.delete(key));

            if (removed > 0) {
                console.log(`[INVOICE-DELETE] Cleaned up ${removed} old entries (>${DELETE_MAX_AGE_DAYS} days)`);
                await this._save();
            }
        }
    };

    // =====================================================
    // AUTO SEND BILL SETTINGS
    // =====================================================

    const WORKFLOW_SETTINGS_KEY = 'fastSaleWorkflowSettings';

    const WorkflowSettings = {
        _settings: {
            autoSendBillOnSuccess: false // Mặc định tắt
        },

        load() {
            try {
                const saved = localStorage.getItem(WORKFLOW_SETTINGS_KEY);
                if (saved) {
                    this._settings = { ...this._settings, ...JSON.parse(saved) };
                }
            } catch (e) {
                console.error('[WORKFLOW] Error loading settings:', e);
            }
            return this._settings;
        },

        save() {
            localStorage.setItem(WORKFLOW_SETTINGS_KEY, JSON.stringify(this._settings));
        },

        get autoSendBillOnSuccess() {
            return this._settings.autoSendBillOnSuccess;
        },

        set autoSendBillOnSuccess(value) {
            this._settings.autoSendBillOnSuccess = value;
            this.save();
        }
    };

    // Initialize settings
    WorkflowSettings.load();

    // =====================================================
    // CANCEL ORDER MODAL
    // =====================================================

    /**
     * Show modal to enter cancellation reason
     * @param {object} order - Success order data
     * @param {number} index - Index in success orders array
     */
    function showCancelOrderModal(order, index) {
        const saleOnlineId = order.SaleOnlineIds?.[0];
        if (!saleOnlineId) {
            window.notificationManager?.error('Không tìm thấy SaleOnline ID');
            return;
        }

        // Get invoice data from InvoiceStatusStore
        const invoiceData = window.InvoiceStatusStore?.get(saleOnlineId);
        if (!invoiceData) {
            window.notificationManager?.error('Không tìm thấy dữ liệu phiếu bán hàng');
            return;
        }

        // Create modal HTML
        const modalHtml = `
            <div id="cancelOrderModal" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: white; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; color: #dc2626;">
                            <i class="fas fa-times-circle"></i> Nhờ Hủy Đơn
                        </h3>
                        <button onclick="closeCancelOrderModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                    </div>

                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                        <p style="margin: 0 0 8px 0; font-weight: 600;">Thông tin đơn:</p>
                        <p style="margin: 0; font-size: 14px;">
                            <strong>Mã:</strong> ${order.Reference || order.Code || 'N/A'}<br>
                            <strong>Số phiếu:</strong> ${order.Number || invoiceData.Number || 'N/A'}<br>
                            <strong>Khách:</strong> ${order.PartnerDisplayName || order.Partner?.PartnerDisplayName || 'N/A'}<br>
                            <strong>Trạng thái:</strong> ${order.ShowState || invoiceData.ShowState || 'N/A'}
                        </p>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px;">Lý do hủy đơn:</label>
                        <textarea id="cancelReasonInput" rows="3" placeholder="Nhập lý do khách hủy / đổi ý..." style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; resize: vertical; font-size: 14px;"></textarea>
                    </div>

                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button onclick="closeCancelOrderModal()" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; border-radius: 8px; cursor: pointer;">
                            Đóng
                        </button>
                        <button onclick="confirmCancelOrder(${index})" style="padding: 10px 20px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            <i class="fas fa-check"></i> Xác nhận hủy
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('cancelOrderModal');
        if (existingModal) existingModal.remove();

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * Close cancel order modal
     */
    function closeCancelOrderModal() {
        const modal = document.getElementById('cancelOrderModal');
        if (modal) modal.remove();
    }

    /**
     * Confirm cancel order - save to invoiceStatusDelete
     * @param {number} index - Index in success orders array
     */
    async function confirmCancelOrder(index) {
        // Block double-click: check if button is already disabled
        const confirmBtn = document.querySelector('#cancelOrderModal button[onclick*="confirmCancelOrder"]');
        if (confirmBtn?.disabled) {
            console.warn('[WORKFLOW] ⚠️ Cancel button already disabled, ignoring duplicate click');
            return;
        }

        const reason = document.getElementById('cancelReasonInput')?.value?.trim();
        if (!reason) {
            window.notificationManager?.warning('Vui lòng nhập lý do hủy đơn');
            return;
        }

        const order = window.fastSaleResultsData?.success?.[index];
        if (!order) {
            window.notificationManager?.error('Không tìm thấy đơn hàng');
            closeCancelOrderModal();
            return;
        }

        const saleOnlineId = order.SaleOnlineIds?.[0];
        const invoiceData = window.InvoiceStatusStore?.get(saleOnlineId);

        if (!invoiceData) {
            window.notificationManager?.error('Không tìm thấy dữ liệu phiếu');
            closeCancelOrderModal();
            return;
        }

        // Disable button to prevent double-click
        const originalBtnText = confirmBtn?.innerHTML;
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        }

        try {
            // Step 1: Call TPOS API to cancel the order
            // Parse ID to integer - API requires Int64, not string
            const fastSaleOrderId = parseInt(order.Id, 10);
            if (fastSaleOrderId && !isNaN(fastSaleOrderId)) {
                console.log(`[WORKFLOW] Calling TPOS API to cancel order ID: ${fastSaleOrderId}`);
                const cancelResponse = await window.tokenManager.authenticatedFetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.ActionCancel', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({ ids: [fastSaleOrderId] })
                });

                if (!cancelResponse.ok) {
                    const errorText = await cancelResponse.text();
                    console.error('[WORKFLOW] TPOS cancel API error:', cancelResponse.status, errorText);
                    window.notificationManager?.error(`Lỗi hủy đơn trên TPOS: ${cancelResponse.status}`);
                    return;
                }

                // Handle empty response (API may return 200/204 with no body)
                const responseText = await cancelResponse.text();
                const cancelResult = responseText ? JSON.parse(responseText) : { success: true };
                console.log('[WORKFLOW] TPOS cancel result:', cancelResult);
            } else {
                console.warn('[WORKFLOW] No valid FastSaleOrder ID found, skipping TPOS cancel API');
            }

            // Step 2: Save to delete store
            await InvoiceStatusDeleteStore.add(saleOnlineId, {
                ...invoiceData,
                ...order,
                SaleOnlineId: saleOnlineId
            }, reason);

            // Step 3: Delete from InvoiceStatusStore (localStorage + Firebase)
            if (window.InvoiceStatusStore?.delete) {
                await window.InvoiceStatusStore.delete(saleOnlineId);
                console.log(`[WORKFLOW] Deleted invoice from InvoiceStatusStore: ${saleOnlineId}`);
            }

            // Re-add "OK + định danh" tag using quickAssignTag (same as quick-tag-ok button)
            const orderCode = order.Reference || order.Number || '';
            if (typeof window.quickAssignTag === 'function') {
                console.log(`[WORKFLOW] Adding OK tag to cancelled order: ${saleOnlineId}`);
                await window.quickAssignTag(saleOnlineId, orderCode, 'ok');
            } else {
                console.warn('[WORKFLOW] quickAssignTag function not available');
            }

            // Step 5: Update SaleOnline order status to "Nháp"
            if (typeof window.updateOrderStatus === 'function') {
                console.log(`[WORKFLOW] Updating order status to "Nháp": ${saleOnlineId}`);
                await window.updateOrderStatus(saleOnlineId, 'Nháp', 'Nháp', '#f0ad4e');
            } else {
                console.warn('[WORKFLOW] updateOrderStatus function not available');
            }

            // Step 6: Log cancel activity & refund wallet (async, non-blocking)
            const orderNumber = order.Number || order.Reference || '';
            const customerPhone = order.Partner?.Phone || order.PartnerPhone || order.Partner?.PartnerPhone || order.ReceiverPhone || order.Phone || '';
            if (customerPhone) {
                logCancelOrderActivity(customerPhone, orderNumber, order, reason);
            } else {
                console.warn(`[WORKFLOW] No phone found for cancel activity, order: ${orderNumber}`);
            }

            window.notificationManager?.success(`Đã lưu yêu cầu hủy đơn + gắn lại tag OK: ${order.Number || order.Reference}`);
            closeCancelOrderModal();

            // Update results modal UI - mark as cancelled
            const row = document.querySelector(`.success-order-checkbox[data-order-id="${order.Id}"]`)?.closest('tr');
            if (row) {
                row.style.backgroundColor = '#fef2f2';
                row.style.opacity = '0.7';

                // Update cancel button to show cancelled
                const rowCancelBtn = row.querySelector('.btn-cancel-order');
                if (rowCancelBtn) {
                    rowCancelBtn.innerHTML = '<i class="fas fa-check"></i> Đã nhờ hủy';
                    rowCancelBtn.disabled = true;
                    rowCancelBtn.style.background = '#9ca3af';
                }
            }

            // Update main table UI - show "−" since invoice was deleted
            const mainRow = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
            if (mainRow) {
                const invoiceCell = mainRow.querySelector('td[data-column="invoice-status"]');
                if (invoiceCell) {
                    invoiceCell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                }
            }
        } catch (e) {
            console.error('[WORKFLOW] Error confirming cancel:', e);
            window.notificationManager?.error('Lỗi khi lưu yêu cầu hủy đơn');

            // Re-enable button on error
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = originalBtnText || '<i class="fas fa-check"></i> Xác nhận hủy';
            }
        }
    }

    // =====================================================
    // TAG MANAGEMENT FUNCTIONS
    // =====================================================

    /**
     * Find tag by name pattern (case insensitive, supports prefix)
     * @param {string} namePattern - Tag name pattern (e.g., "OK" to find "OK Hạnh", "OK Huyên")
     * @param {boolean} exactMatch - If true, match exact name; if false, match prefix
     */
    function findTagByPattern(namePattern, exactMatch = false) {
        if (!window.availableTags) return null;

        const pattern = namePattern.toUpperCase();

        return window.availableTags.find(tag => {
            const tagName = (tag.Name || '').toUpperCase();
            if (exactMatch) {
                return tagName === pattern;
            }
            return tagName.startsWith(pattern);
        });
    }

    /**
     * Find tag by exact name
     */
    function findTagByName(name) {
        if (!window.availableTags) return null;
        return window.availableTags.find(tag =>
            (tag.Name || '').toUpperCase() === name.toUpperCase()
        );
    }

    /**
     * Generate random color for new tag
     */
    function generateRandomColor() {
        const colors = [
            '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
            '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
            '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
            '#ec4899', '#f43f5e'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Find or create tag by name
     * @param {string} tagName - Tag name to find or create
     * @returns {object|null} - Tag object {Id, Name, Color}
     */
    async function findOrCreateTag(tagName) {
        // Try to find existing tag first
        let tag = findTagByName(tagName);
        if (tag) {
            return tag;
        }

        // Tag not found - create new one
        console.log(`[WORKFLOW] Tag "${tagName}" not found, creating...`);

        try {
            const headers = await window.tokenManager.getAuthHeader();
            const color = generateRandomColor();

            const response = await API_CONFIG.smartFetch(
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'accept': 'application/json, text/plain, */*',
                        'content-type': 'application/json;charset=UTF-8',
                    },
                    body: JSON.stringify({
                        Name: tagName.toUpperCase(),
                        Color: color
                    })
                }
            );

            if (!response.ok) {
                // Tag might already exist (race condition)
                if (response.status === 400) {
                    // Refresh tags and try to find again
                    if (typeof loadTags === 'function') {
                        await loadTags();
                    }
                    return findTagByName(tagName);
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const newTag = await response.json();
            console.log(`[WORKFLOW] Created tag "${tagName}":`, newTag);

            // Remove @odata.context
            if (newTag['@odata.context']) {
                delete newTag['@odata.context'];
            }

            // Update local tags list
            if (Array.isArray(window.availableTags)) {
                window.availableTags.push(newTag);
                window.cacheManager?.set("tags", window.availableTags, "tags");
            }

            return newTag;
        } catch (error) {
            console.error(`[WORKFLOW] Error creating tag "${tagName}":`, error);
            return null;
        }
    }

    /**
     * Assign tag to order via API
     * @param {string} orderId - Order ID
     * @param {array} tags - Array of tags to assign [{Id, Name, Color}]
     */
    async function assignTagsToOrder(orderId, tags) {
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const response = await API_CONFIG.smartFetch(
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        Tags: tags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                        OrderId: orderId
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            console.log(`[WORKFLOW] Assigned tags to order ${orderId}:`, tags.map(t => t.Name));
            return true;
        } catch (e) {
            console.error(`[WORKFLOW] Error assigning tags to order ${orderId}:`, e);
            return false;
        }
    }

    /**
     * Remove tag from order (by assigning all other tags except the one to remove)
     * @param {string} orderId - Order ID
     * @param {string} tagNamePattern - Tag name pattern to remove (e.g., "OK " to remove "OK Hạnh")
     */
    async function removeTagFromOrder(orderId, tagNamePattern) {
        // Get current order tags from OrderStore or displayedData
        const order = window.OrderStore?.get(orderId) || window.displayedData?.find(o => o.Id === orderId);
        if (!order) {
            console.error(`[WORKFLOW] Order not found: ${orderId}`);
            return false;
        }

        let currentTags = [];
        try {
            if (typeof order.Tags === 'string') {
                currentTags = JSON.parse(order.Tags);
            } else if (Array.isArray(order.Tags)) {
                currentTags = order.Tags;
            }
        } catch (e) {
            currentTags = [];
        }

        // Filter out tags matching the pattern
        const pattern = tagNamePattern.toUpperCase();
        const newTags = currentTags.filter(tag => {
            const tagName = (tag.Name || '').toUpperCase();
            return !tagName.startsWith(pattern);
        });

        // Assign new tags (without the removed one)
        return await assignTagsToOrder(orderId, newTags);
    }

    /**
     * Add tag to order (keeping existing tags)
     * @param {string} orderId - Order ID
     * @param {object} tagToAdd - Tag to add {Id, Name, Color}
     */
    async function addTagToOrder(orderId, tagToAdd) {
        // Get current order tags
        const order = window.OrderStore?.get(orderId) || window.displayedData?.find(o => o.Id === orderId);
        if (!order) {
            console.error(`[WORKFLOW] Order not found: ${orderId}`);
            return false;
        }

        let currentTags = [];
        try {
            if (typeof order.Tags === 'string') {
                currentTags = JSON.parse(order.Tags);
            } else if (Array.isArray(order.Tags)) {
                currentTags = order.Tags;
            }
        } catch (e) {
            currentTags = [];
        }

        // Check if tag already exists
        if (currentTags.some(t => t.Id === tagToAdd.Id)) {
            console.log(`[WORKFLOW] Tag "${tagToAdd.Name}" already exists on order ${orderId}`);
            return true;
        }

        // Add new tag
        const newTags = [...currentTags, tagToAdd];
        return await assignTagsToOrder(orderId, newTags);
    }

    // =====================================================
    // WORKFLOW ACTIONS
    // =====================================================

    /**
     * Handle failed order - Add "Âm Mã" tag (auto-create if not exists)
     * @param {object} order - Failed order data
     */
    async function handleFailedOrder(order) {
        const saleOnlineId = order.SaleOnlineIds?.[0];
        if (!saleOnlineId) {
            console.error('[WORKFLOW] No SaleOnlineId found for failed order');
            return false;
        }

        // Find or create "Âm Mã" tag
        const amMaTag = await findOrCreateTag('ÂM MÃ');

        if (!amMaTag) {
            console.error('[WORKFLOW] Could not find or create tag "Âm Mã"');
            return false;
        }

        const success = await addTagToOrder(saleOnlineId, {
            Id: amMaTag.Id,
            Name: amMaTag.Name,
            Color: amMaTag.Color
        });

        if (success) {
            console.log(`[WORKFLOW] Added "Âm Mã" tag to failed order: ${order.Reference || saleOnlineId}`);
        }

        return success;
    }

    /**
     * Process all failed orders - Add "Âm Mã" tag
     * @param {array} failedOrders - Array of failed order data
     */
    async function processFailedOrders(failedOrders) {
        if (!failedOrders || failedOrders.length === 0) return;

        console.log(`[WORKFLOW] Processing ${failedOrders.length} failed orders...`);

        let successCount = 0;
        let failCount = 0;

        for (const order of failedOrders) {
            const success = await handleFailedOrder(order);
            if (success) {
                successCount++;
            } else {
                failCount++;
            }
        }

        if (successCount > 0) {
            window.notificationManager?.info(`Đã gắn tag "Âm Mã" cho ${successCount} đơn thất bại`);
        }

        console.log(`[WORKFLOW] Failed orders processed: ${successCount} success, ${failCount} failed`);
    }

    /**
     * Process successful orders - Auto remove "OK + NV" tag
     * @param {array} successOrders - Array of success order data
     */
    async function processSuccessOrders(successOrders) {
        if (!successOrders || successOrders.length === 0) return;

        // Filter orders with "Đã thanh toán" or "Đã xác nhận"
        const ordersToProcess = successOrders.filter(order =>
            order.ShowState === 'Đã thanh toán' || order.ShowState === 'Đã xác nhận'
        );

        if (ordersToProcess.length === 0) {
            console.log('[WORKFLOW] No successful orders to remove OK tag');
            return;
        }

        console.log(`[WORKFLOW] Auto removing "OK + NV" tag from ${ordersToProcess.length} successful orders...`);

        let successCount = 0;
        for (const order of ordersToProcess) {
            const saleOnlineId = order.SaleOnlineIds?.[0];
            if (!saleOnlineId) continue;

            // Store the removed tag info for potential re-add on cancel
            const orderData = window.OrderStore?.get(saleOnlineId) || window.displayedData?.find(o => o.Id === saleOnlineId);
            let currentTags = [];
            try {
                if (typeof orderData?.Tags === 'string') {
                    currentTags = JSON.parse(orderData.Tags);
                } else if (Array.isArray(orderData?.Tags)) {
                    currentTags = orderData.Tags;
                }
            } catch (e) {
                currentTags = [];
            }

            // Find "OK + NV" tag to store for later re-add
            const okTag = currentTags.find(t => (t.Name || '').toUpperCase().startsWith('OK '));
            if (okTag) {
                // Store in order object for re-add on cancel
                order._removedOkTag = okTag;
            }

            const success = await removeTagFromOrder(saleOnlineId, 'OK ');
            if (success) {
                successCount++;
            }
        }

        if (successCount > 0) {
            window.notificationManager?.success(`Đã gỡ tag "OK + NV" cho ${successCount} đơn thành công`);
        }

        console.log(`[WORKFLOW] Success orders processed: ${successCount} tags removed`);
    }

    /**
     * Auto send bill for successful orders (if enabled)
     * @param {array} successOrders - Array of success order data
     */
    async function autoSendBillsIfEnabled(successOrders) {
        console.log('[WORKFLOW] autoSendBillsIfEnabled called with', successOrders?.length, 'orders');

        // Check setting from Bill Template Settings
        const billSettings = window.getBillTemplateSettings ? window.getBillTemplateSettings() : {};
        console.log('[WORKFLOW] autoSendOnSuccess setting:', billSettings.autoSendOnSuccess);

        if (!billSettings.autoSendOnSuccess) {
            console.log('[WORKFLOW] Auto send bill is disabled');
            return;
        }

        if (!successOrders || successOrders.length === 0) return;

        // Filter orders with "Đã thanh toán" or "Đã xác nhận"
        const ordersToSend = successOrders.filter(order =>
            order.ShowState === 'Đã thanh toán' || order.ShowState === 'Đã xác nhận'
        );
        console.log('[WORKFLOW] Orders eligible (Đã thanh toán/Đã xác nhận):', ordersToSend.length, 'ShowStates:', successOrders.map(o => o.ShowState));

        if (ordersToSend.length === 0) {
            console.log('[WORKFLOW] No orders eligible for auto bill sending');
            return;
        }

        console.log(`[WORKFLOW] Auto sending bills for ${ordersToSend.length} orders...`);
        window.notificationManager?.info(`Đang tự động gửi bill cho ${ordersToSend.length} đơn...`);

        // Use existing sendBillManually function for each order
        let sentCount = 0;
        for (let i = 0; i < ordersToSend.length; i++) {
            const order = ordersToSend[i];
            const originalIndex = successOrders.indexOf(order);

            try {
                if (typeof window.sendBillManually === 'function') {
                    // Pass skipPreview=true for auto-send to bypass preview modal
                    await window.sendBillManually(originalIndex, true);
                    sentCount++;
                }
            } catch (e) {
                console.error(`[WORKFLOW] Error auto-sending bill for order ${order.Number}:`, e);
            }

            // Small delay between sends
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (sentCount > 0) {
            window.notificationManager?.success(`Đã gửi ${sentCount} bill thành công`);
        }
    }

    // =====================================================
    // UI ENHANCEMENTS
    // =====================================================

    /**
     * Show cancel order modal from main table
     * @param {string} orderId - SaleOnlineOrder ID (same as saleOnlineId in main table)
     */
    function showCancelOrderModalFromMain(orderId) {
        if (!orderId) {
            window.notificationManager?.error('Không tìm thấy Order ID');
            return;
        }

        // Get invoice data from InvoiceStatusStore (primary source)
        const invoiceData = window.InvoiceStatusStore?.get(orderId);
        if (!invoiceData) {
            window.notificationManager?.error('Không tìm thấy dữ liệu phiếu bán hàng');
            return;
        }

        // Try to find order from displayedData for additional info (optional)
        const orderData = window.displayedData?.find(o => o.Id === orderId);

        // Create a compatible order object using invoiceData as primary source
        const order = {
            Id: invoiceData.Id, // FastSaleOrder ID for TPOS API calls (e.g., 419211)
            SaleOnlineIds: [orderId], // Main table: orderId IS the SaleOnlineId (e.g., 15810000-5d48-...)
            Reference: invoiceData.Reference || orderData?.Code || orderData?.Reference,
            Number: invoiceData.Number,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName || orderData?.PartnerDisplayName,
            ShowState: invoiceData.ShowState,
            // Phone fields for wallet refund on cancel
            ReceiverPhone: invoiceData.ReceiverPhone || orderData?.Telephone || '',
            Phone: invoiceData.ReceiverPhone || orderData?.Telephone || '',
            AmountTotal: invoiceData.AmountTotal || orderData?.AmountTotal || 0
        };

        // Store in a temporary global for confirmCancelOrder to access
        window._cancelOrderFromMain = order;

        // Auto-detect carrier from address if CarrierName is empty
        // Maps to correct fee tier based on CARRIER-AUTO-SELECTION.md
        let carrierName = invoiceData.CarrierName;
        if (!carrierName && invoiceData.ReceiverAddress) {
            const normalized = invoiceData.ReceiverAddress.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            // District mappings
            const districts20k = ['1', '3', '4', '5', '6', '7', '8', '10', '11'];
            const named20k = ['phu nhuan', 'binh thanh', 'tan phu', 'tan binh', 'go vap'];
            const districts30k = ['2', '12'];
            const named30k = ['binh tan', 'thu duc'];
            const districts35kTP = ['9'];
            const named35kTP = ['binh chanh', 'nha be', 'hoc mon'];
            const shipTinh = ['cu chi', 'can gio'];
            const provinceKeywords = ['tinh', 'province', 'binh duong', 'dong nai', 'long an', 'tay ninh', 'ba ria', 'can tho'];

            // Use extractDistrictFromAddress if available
            if (typeof window.extractDistrictFromAddress === 'function') {
                const districtInfo = window.extractDistrictFromAddress(invoiceData.ReceiverAddress, null);
                if (districtInfo.isProvince) {
                    carrierName = 'SHIP TỈNH';
                } else if (districtInfo.districtNumber) {
                    const num = districtInfo.districtNumber;
                    if (districts20k.includes(num)) carrierName = 'THÀNH PHỐ (20.000 đ)';
                    else if (districts30k.includes(num)) carrierName = 'THÀNH PHỐ (30.000 đ)';
                    else if (districts35kTP.includes(num)) carrierName = 'THÀNH PHỐ (35.000 đ)';
                }
            }

            // Fallback pattern matching if not detected yet
            if (!carrierName) {
                if (shipTinh.some(kw => normalized.includes(kw)) || provinceKeywords.some(kw => normalized.includes(kw))) {
                    carrierName = 'SHIP TỈNH';
                } else if (named35kTP.some(kw => normalized.includes(kw))) {
                    carrierName = 'THÀNH PHỐ (35.000 đ)';
                } else if (named30k.some(kw => normalized.includes(kw))) {
                    carrierName = 'THÀNH PHỐ (30.000 đ)';
                } else if (named20k.some(kw => normalized.includes(kw))) {
                    carrierName = 'THÀNH PHỐ (20.000 đ)';
                } else {
                    // Check district number pattern
                    const distMatch = normalized.match(/(?:q|quan|quận)\s*\.?\s*(\d+)/);
                    if (distMatch) {
                        const num = distMatch[1];
                        if (districts20k.includes(num)) carrierName = 'THÀNH PHỐ (20.000 đ)';
                        else if (districts30k.includes(num)) carrierName = 'THÀNH PHỐ (30.000 đ)';
                        else if (districts35kTP.includes(num)) carrierName = 'THÀNH PHỐ (35.000 đ)';
                    }
                }
            }

            // Default
            if (!carrierName) carrierName = 'SHIP TỈNH';
        }

        // Create enriched order for bill generation
        const enrichedOrder = {
            Id: invoiceData.Id,
            Number: invoiceData.Number,
            Reference: invoiceData.Reference,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName,
            DeliveryPrice: invoiceData.DeliveryPrice,
            CashOnDelivery: invoiceData.CashOnDelivery,
            PaymentAmount: invoiceData.PaymentAmount,
            Discount: invoiceData.Discount,
            AmountTotal: invoiceData.AmountTotal,
            AmountUntaxed: invoiceData.AmountUntaxed,
            CarrierName: carrierName,
            UserName: invoiceData.UserName,
            SessionIndex: invoiceData.SessionIndex,
            Comment: invoiceData.Comment,
            DeliveryNote: invoiceData.DeliveryNote,
            SaleOnlineIds: [orderId],
            OrderLines: invoiceData.OrderLines || [],
            Partner: {
                Name: invoiceData.ReceiverName,
                Phone: invoiceData.ReceiverPhone,
                Street: invoiceData.ReceiverAddress
            }
        };

        // Create modal HTML with bill preview section
        const modalHtml = `
            <div id="cancelOrderModal" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: white; border-radius: 12px; padding: 24px; max-width: 1200px; width: 98%; max-height: 95vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; color: #dc2626;">
                            <i class="fas fa-times-circle"></i> Nhờ Hủy Đơn
                        </h3>
                        <button onclick="closeCancelOrderModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                    </div>

                    <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                        <!-- Left: Bill Preview -->
                        <div style="flex: 1.2; min-width: 400px;">
                            <div id="cancelBillPreview" style="border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; min-height: 600px; max-height: 75vh; overflow: auto;">
                                <p style="color: #9ca3af; padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Đang tạo bill...</p>
                            </div>
                        </div>

                        <!-- Right: Order Info & Reason -->
                        <div style="flex: 0.8; min-width: 320px;">
                            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                                <p style="margin: 0 0 8px 0; font-weight: 600;">Thông tin đơn:</p>
                                <p style="margin: 0; font-size: 14px;">
                                    <strong>Mã:</strong> ${order.Reference || 'N/A'}<br>
                                    <strong>Số phiếu:</strong> ${order.Number || 'N/A'}<br>
                                    <strong>Khách:</strong> ${order.PartnerDisplayName || 'N/A'}<br>
                                    <strong>Trạng thái:</strong> ${order.ShowState || 'N/A'}
                                </p>
                            </div>

                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-weight: 600; margin-bottom: 8px;">Lý do hủy đơn:</label>
                                <textarea id="cancelReasonInput" rows="4" placeholder="Nhập lý do khách hủy / đổi ý..." style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; resize: vertical; font-size: 14px;"></textarea>
                            </div>

                            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                                <button onclick="closeCancelOrderModal()" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; border-radius: 8px; cursor: pointer;">
                                    Đóng
                                </button>
                                <button onclick="confirmCancelOrderFromMain()" style="padding: 10px 20px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                    <i class="fas fa-check"></i> Xác nhận hủy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('cancelOrderModal');
        if (existingModal) existingModal.remove();

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Generate bill preview
        const previewContainer = document.getElementById('cancelBillPreview');
        if (previewContainer && typeof window.generateCustomBillHTML === 'function') {
            try {
                const walletBalance = invoiceData.PaymentAmount || 0;
                const billHTML = window.generateCustomBillHTML(enrichedOrder, { walletBalance });

                if (billHTML) {
                    // Use iframe to display bill
                    const iframe = document.createElement('iframe');
                    iframe.style.cssText = 'width: 100%; height: 600px; border: none; background: white;';
                    previewContainer.innerHTML = '';
                    previewContainer.appendChild(iframe);

                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    iframeDoc.open();
                    iframeDoc.write(billHTML);
                    iframeDoc.close();
                } else {
                    previewContainer.innerHTML = '<p style="color: #9ca3af; padding: 20px; text-align: center;">Không thể tạo bill preview</p>';
                }
            } catch (e) {
                console.error('[WORKFLOW] Error generating bill preview:', e);
                previewContainer.innerHTML = '<p style="color: #ef4444; padding: 20px; text-align: center;">Lỗi tạo bill</p>';
            }
        }
    }

    /**
     * Confirm cancel order from main table
     */
    async function confirmCancelOrderFromMain() {
        // Block double-click: check if button is already disabled
        const cancelBtn = document.querySelector('#cancelOrderModal button[onclick*="confirmCancelOrderFromMain"]');
        if (cancelBtn?.disabled) {
            console.warn('[WORKFLOW] ⚠️ Cancel button already disabled, ignoring duplicate click');
            return;
        }

        const reason = document.getElementById('cancelReasonInput')?.value?.trim();
        if (!reason) {
            window.notificationManager?.warning('Vui lòng nhập lý do hủy đơn');
            return;
        }

        const order = window._cancelOrderFromMain;
        if (!order) {
            window.notificationManager?.error('Không tìm thấy dữ liệu đơn hủy');
            closeCancelOrderModal();
            return;
        }

        const saleOnlineId = order.SaleOnlineIds?.[0];
        const invoiceData = window.InvoiceStatusStore?.get(saleOnlineId);

        if (!invoiceData) {
            window.notificationManager?.error('Không tìm thấy dữ liệu phiếu bán hàng');
            closeCancelOrderModal();
            return;
        }

        // Disable button to prevent double-click
        const originalBtnText = cancelBtn?.innerHTML;
        if (cancelBtn) {
            cancelBtn.disabled = true;
            cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        }

        try {
            // Step 1: Call TPOS API to cancel the order
            // Parse ID to integer - API requires Int64, not string
            const fastSaleOrderId = parseInt(order.Id, 10);
            if (fastSaleOrderId && !isNaN(fastSaleOrderId)) {
                console.log(`[WORKFLOW] Calling TPOS API to cancel order ID: ${fastSaleOrderId}`);
                const cancelResponse = await window.tokenManager.authenticatedFetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.ActionCancel', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({ ids: [fastSaleOrderId] })
                });

                if (!cancelResponse.ok) {
                    const errorText = await cancelResponse.text();
                    console.error('[WORKFLOW] TPOS cancel API error:', cancelResponse.status, errorText);
                    window.notificationManager?.error(`Lỗi hủy đơn trên TPOS: ${cancelResponse.status}`);
                    return;
                }

                // Handle empty response (API may return 200/204 with no body)
                const responseText = await cancelResponse.text();
                const cancelResult = responseText ? JSON.parse(responseText) : { success: true };
                console.log('[WORKFLOW] TPOS cancel result:', cancelResult);
            } else {
                console.warn('[WORKFLOW] No valid FastSaleOrder ID found, skipping TPOS cancel API');
            }

            // Step 2: Save to delete store
            await InvoiceStatusDeleteStore.add(saleOnlineId, {
                ...invoiceData,
                ...order,
                SaleOnlineId: saleOnlineId
            }, reason);

            // Step 3: Delete from InvoiceStatusStore (localStorage + Firebase)
            if (window.InvoiceStatusStore?.delete) {
                await window.InvoiceStatusStore.delete(saleOnlineId);
                console.log(`[WORKFLOW] Deleted invoice from InvoiceStatusStore: ${saleOnlineId}`);
            }

            // Step 4: Add "OK + định danh" tag using quickAssignTag
            const orderCode = order.Reference || order.Number || '';
            if (typeof window.quickAssignTag === 'function') {
                console.log(`[WORKFLOW] Adding OK tag to cancelled order: ${saleOnlineId}`);
                await window.quickAssignTag(saleOnlineId, orderCode, 'ok');
            } else {
                console.warn('[WORKFLOW] quickAssignTag function not available');
            }

            // Step 5: Update SaleOnline order status to "Nháp"
            if (typeof window.updateOrderStatus === 'function') {
                console.log(`[WORKFLOW] Updating order status to "Nháp": ${saleOnlineId}`);
                await window.updateOrderStatus(saleOnlineId, 'Nháp', 'Nháp', '#f0ad4e');
            } else {
                console.warn('[WORKFLOW] updateOrderStatus function not available');
            }

            // Step 6: Log cancel activity & refund wallet (async, non-blocking)
            const orderNumber = order.Number || order.Reference || '';
            const customerPhone = order.Partner?.Phone || order.PartnerPhone || order.Partner?.PartnerPhone || order.ReceiverPhone || order.Phone || '';
            if (customerPhone) {
                logCancelOrderActivity(customerPhone, orderNumber, order, reason);
            } else {
                console.warn(`[WORKFLOW] No phone found for cancel activity, order: ${orderNumber}`);
            }

            window.notificationManager?.success(`Đã lưu yêu cầu hủy đơn: ${order.Number || order.Reference}`);
            closeCancelOrderModal();

            // Update main table UI - show "−" since invoice was deleted
            const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
            if (row) {
                const invoiceCell = row.querySelector('td[data-column="invoice-status"]');
                if (invoiceCell) {
                    invoiceCell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                }
            }

            // Clear temp data
            delete window._cancelOrderFromMain;

        } catch (error) {
            console.error('[WORKFLOW] Error saving cancel order:', error);
            window.notificationManager?.error('Lỗi lưu yêu cầu hủy đơn');

            // Re-enable button on error
            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.innerHTML = originalBtnText || '<i class="fas fa-check"></i> Xác nhận hủy';
            }
        }
    }

    /**
     * Add cancel button to success orders table row
     * Called when rendering success orders
     */
    function getCancelButtonHtml(order, index) {
        // Only show for "Đã thanh toán" or "Đã xác nhận"
        const showState = order.ShowState || '';
        if (showState !== 'Đã thanh toán' && showState !== 'Đã xác nhận') {
            return '';
        }

        return `
            <button class="btn-cancel-order"
                    onclick="window.showCancelOrderModal(window.fastSaleResultsData.success[${index}], ${index}); event.stopPropagation();"
                    title="Nhờ hủy đơn"
                    style="background: #dc2626; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; margin-left: 4px;">
                <i class="fas fa-times"></i>
            </button>
        `;
    }


    // =====================================================
    // CUSTOMER ACTIVITY LOGGING & WALLET REFUND
    // =====================================================

    /**
     * Log cancel order activity to Customer 360 and refund wallet if debt was used
     * @param {string} phone - Customer phone number
     * @param {string} orderNumber - Order number (e.g., "NJD/2026/45068")
     * @param {Object} order - Order data
     * @param {string} reason - Cancellation reason
     */
    async function logCancelOrderActivity(phone, orderNumber, order, reason) {
        const RENDER_API_URL = 'https://n2store-fallback.onrender.com';
        const performedBy = window.authManager?.getAuthState()?.username || 'system';

        try {
            let normalizedPhone = String(phone).replace(/\D/g, '');
            if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
                normalizedPhone = '0' + normalizedPhone.substring(2);
            }

            console.log(`[WORKFLOW] logCancelOrderActivity: phone=${normalizedPhone}, order=${orderNumber}`);

            const amountTotal = parseFloat(order.AmountTotal) || 0;
            const customerName = order.Partner?.Name || order.PartnerDisplayName || '';

            // Step 1: Try to refund wallet if debt was used
            let refundResult = null;
            try {
                console.log(`[WORKFLOW] Calling refund-by-order for ${orderNumber}...`);
                const refundResponse = await fetch(`${RENDER_API_URL}/api/v2/wallets/refund-by-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        order_id: orderNumber,
                        phone: normalizedPhone,
                        reason: reason,
                        created_by: performedBy
                    })
                });

                if (!refundResponse.ok) {
                    const errText = await refundResponse.text().catch(() => '');
                    console.error(`[WORKFLOW] ❌ Refund API error ${refundResponse.status}:`, errText);
                } else {
                    refundResult = await refundResponse.json();

                    if (refundResult.success && refundResult.refunded) {
                        console.log(`[WORKFLOW] ✅ Wallet refunded for order ${orderNumber}: ${refundResult.data.refund_amount}đ`);
                        window.notificationManager?.info(
                            `Đã hoàn ${refundResult.data.refund_amount.toLocaleString('vi-VN')}đ vào ví khách (Thật: ${refundResult.data.real_refunded.toLocaleString('vi-VN')}đ, CN: ${refundResult.data.virtual_refunded.toLocaleString('vi-VN')}đ)`,
                            5000
                        );
                    } else if (refundResult.success && refundResult.cancelled_pending) {
                        console.log(`[WORKFLOW] ✅ Pending withdrawal cancelled for order ${orderNumber}`);
                        window.notificationManager?.info('Đã hủy giao dịch trừ ví chờ xử lý');
                    } else {
                        console.log(`[WORKFLOW] Refund result for ${orderNumber}:`, refundResult.message || 'no withdrawal found');
                    }
                }
            } catch (refundError) {
                console.error('[WORKFLOW] ❌ Wallet refund failed:', refundError.message);
            }

            // Step 2: Log ORDER_CANCELLED activity
            let description = `Hủy đơn hàng #${orderNumber}`;
            if (customerName) description += ` - ${customerName}`;
            description += `. Tổng: ${amountTotal.toLocaleString('vi-VN')}đ. Lý do: ${reason}`;

            if (refundResult?.refunded && refundResult?.data) {
                description += `. Hoàn ví: ${refundResult.data.refund_amount.toLocaleString('vi-VN')}đ (Thật: ${refundResult.data.real_refunded.toLocaleString('vi-VN')}đ, Công nợ: ${refundResult.data.virtual_refunded.toLocaleString('vi-VN')}đ)`;
            }

            const metadata = {
                order_number: orderNumber,
                order_id: order.Id,
                amount_total: amountTotal,
                cancel_reason: reason,
                source: 'FAST_SALE_CANCEL'
            };
            if (refundResult?.refunded && refundResult?.data) {
                metadata.wallet_refunded = true;
                metadata.refund_amount = refundResult.data.refund_amount;
                metadata.real_refunded = refundResult.data.real_refunded;
                metadata.virtual_refunded = refundResult.data.virtual_refunded;
            }

            console.log(`[WORKFLOW] Posting cancel activity for ${normalizedPhone}...`);
            const activityResponse = await fetch(`${RENDER_API_URL}/api/v2/customers/${normalizedPhone}/activities`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activity_type: 'ORDER_CANCELLED',
                    title: `Hủy đơn #${orderNumber}`,
                    description,
                    reference_type: 'order',
                    reference_id: orderNumber,
                    metadata,
                    icon: 'cancel',
                    color: 'red',
                    created_by: performedBy
                })
            });

            if (!activityResponse.ok) {
                const errText = await activityResponse.text().catch(() => '');
                console.error(`[WORKFLOW] ❌ Activity API error ${activityResponse.status}:`, errText);
            } else {
                console.log(`[WORKFLOW] ✅ Cancel activity logged for order ${orderNumber}, phone: ${normalizedPhone}`);
            }
        } catch (error) {
            console.error('[WORKFLOW] ❌ Error logging cancel activity:', error.message);
        }
    }

    // =====================================================
    // INITIALIZATION & EXPORTS
    // =====================================================

    async function initWorkflow() {
        await InvoiceStatusDeleteStore.init();
        console.log('[WORKFLOW] Fast Sale Workflow initialized');
    }

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWorkflow);
    } else {
        initWorkflow();
    }

    // Export to window
    window.InvoiceStatusDeleteStore = InvoiceStatusDeleteStore;
    window.WorkflowSettings = WorkflowSettings;
    window.showCancelOrderModal = showCancelOrderModal;
    window.showCancelOrderModalFromMain = showCancelOrderModalFromMain;
    window.closeCancelOrderModal = closeCancelOrderModal;
    window.confirmCancelOrder = confirmCancelOrder;
    window.confirmCancelOrderFromMain = confirmCancelOrderFromMain;
    window.handleFailedOrder = handleFailedOrder;
    window.processFailedOrders = processFailedOrders;
    window.processSuccessOrders = processSuccessOrders;
    window.autoSendBillsIfEnabled = autoSendBillsIfEnabled;
    window.getCancelButtonHtml = getCancelButtonHtml;
    window.removeTagFromOrder = removeTagFromOrder;
    window.addTagToOrder = addTagToOrder;
    window.assignTagsToOrder = assignTagsToOrder;
    window.logCancelOrderActivity = logCancelOrderActivity;

})();
