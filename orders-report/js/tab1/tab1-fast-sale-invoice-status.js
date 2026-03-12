/**
 * Fast Sale Invoice Status Module
 * - Stores invoice status for orders (StateCode, Number, etc.)
 * - Renders "Phiếu bán hàng" column in main orders table
 * - Manual bill sending via Messenger button
 * - Disables auto-send bill feature
 *
 * @version 2.0.0
 * @author Claude
 */

(function () {
    'use strict';

    // =====================================================
    // INVOICE STATUS STORE
    // Stores mapping: SaleOnlineId -> FastSaleOrder data
    // =====================================================

    const STORAGE_KEY = 'invoiceStatusStore_v2';
    const FIRESTORE_COLLECTION = 'invoice_status_v2';
    const MAX_AGE_DAYS = 14; // Auto cleanup after 14 days

    // =====================================================
    // CARRIER MAPPING (for auto-detect when CarrierName is empty)
    // =====================================================
    const DISTRICT_TO_CARRIER = {
        // Nội thành - 20k (Q1,3,4,5,6,7,8,10,11 + named)
        inner: {
            numbers: ['1', '3', '4', '5', '6', '7', '8', '10', '11'],
            names: ['Phú Nhuận', 'Bình Thạnh', 'Tân Phú', 'Tân Bình', 'Gò Vấp'],
            carrier: 'THÀNH PHỐ (1 3 4 5 6 7 8 10 11 Phú Nhuận, Bình Thạnh, Tân Phú, Tân Bình, Gò Vấp,) (20.000 đ)'
        },
        // Ngoại thành 2 - 30k (Q2, Q12, Bình Tân, Thủ Đức)
        outer2: {
            numbers: ['2', '12'],
            names: ['Bình Tân', 'Thủ Đức'],
            carrier: 'THÀNH PHỐ (Q2-12-Bình Tân-Thủ Đức) (30.000 đ)'
        },
        // Ngoại thành 1 - 35k (Q9, Bình Chánh, Nhà Bè, Hóc Môn, Củ Chi, Cần Giờ)
        outer1: {
            numbers: ['9'],
            names: ['Bình Chánh', 'Nhà Bè', 'Hóc Môn', 'Củ Chi', 'Cần Giờ'],
            carrier: 'THÀNH PHỐ (Bình Chánh- Q9, Nhà Bè, Hóc Môn) (35.000 đ)'
        }
    };

    /**
     * Get carrier name from district info (fallback for empty CarrierName)
     * @param {object} districtInfo - Result from extractDistrictFromAddress
     * @returns {string} Carrier name or empty string
     */
    function getCarrierNameFromDistrict(districtInfo) {
        if (!districtInfo) return '';

        // Province → SHIP TỈNH
        if (districtInfo.isProvince) {
            return 'SHIP TỈNH (35.000 đ)';
        }

        // Check by district number
        if (districtInfo.districtNumber) {
            const num = districtInfo.districtNumber;
            if (DISTRICT_TO_CARRIER.inner.numbers.includes(num)) return DISTRICT_TO_CARRIER.inner.carrier;
            if (DISTRICT_TO_CARRIER.outer2.numbers.includes(num)) return DISTRICT_TO_CARRIER.outer2.carrier;
            if (DISTRICT_TO_CARRIER.outer1.numbers.includes(num)) return DISTRICT_TO_CARRIER.outer1.carrier;
        }

        // Check by district name
        if (districtInfo.districtName) {
            const name = districtInfo.districtName;
            if (DISTRICT_TO_CARRIER.inner.names.includes(name)) return DISTRICT_TO_CARRIER.inner.carrier;
            if (DISTRICT_TO_CARRIER.outer2.names.includes(name)) return DISTRICT_TO_CARRIER.outer2.carrier;
            if (DISTRICT_TO_CARRIER.outer1.names.includes(name)) return DISTRICT_TO_CARRIER.outer1.carrier;
        }

        // Default → SHIP TỈNH
        return 'SHIP TỈNH (35.000 đ)';
    }

    /**
     * InvoiceStatusStore - Manages invoice status data
     * Syncs to Firestore for persistence across devices
     *
     * Uses BaseStore internally for core data management (localStorage caching, cleanup).
     * Custom Firestore logic (admin vs normal user, sentBills, debounced save) is kept here.
     */
    const _invoiceBaseStore = new BaseStore({
        collectionPath: FIRESTORE_COLLECTION,
        localStorageKey: STORAGE_KEY,
        maxLocalAge: MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    });

    const InvoiceStatusStore = {
        /** @returns {Map} Internal data map (delegated to BaseStore) */
        get _data() { return _invoiceBaseStore._data; },
        set _data(val) { _invoiceBaseStore._data = val; },

        _sentBills: new Set(),
        /** @returns {boolean} Whether store is initialized (delegated to BaseStore) */
        get _initialized() { return _invoiceBaseStore._initialized; },
        set _initialized(val) { _invoiceBaseStore._initialized = val; },

        _syncTimeout: null,
        /** @returns {Function|null} Firestore listener unsubscribe (delegated to BaseStore) */
        get _unsubscribe() { return _invoiceBaseStore._unsubscribe; },
        set _unsubscribe(val) { _invoiceBaseStore._unsubscribe = val; },

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
                    _invoiceBaseStore._loadFromLocal();
                    // Also load sentBills from localStorage (BaseStore doesn't handle this)
                    const saved = localStorage.getItem(STORAGE_KEY);
                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            if (Array.isArray(parsed.sentBills)) {
                                this._sentBills = new Set(parsed.sentBills);
                            }
                        } catch (e) { /* ignore parse errors - BaseStore handles data */ }
                    }
                    console.log(`[INVOICE-STATUS] Offline mode - loaded ${this._data.size} entries from localStorage cache`);
                }

                // 3. Cleanup old entries (delegated to BaseStore)
                _invoiceBaseStore._cleanupOldEntries();

                this._initialized = true;
                console.log(`[INVOICE-STATUS] Store initialized with ${this._data.size} entries`);

                // 4. Setup real-time listener for add/delete from other devices
                this._setupRealtimeListener();
            } catch (e) {
                console.error('[INVOICE-STATUS] Error initializing store:', e);
                this._initialized = true;
            }
        },

        /**
         * Get Firestore doc reference - uses username for cross-device sync
         */
        _getDocRef() {
            const db = firebase.firestore();
            // Get username from authManager or fallback to localStorage
            const authState = window.authManager?.getAuthState();
            const userType = authState?.userType || localStorage.getItem('userType') || '';
            const username = authState?.username || userType.split('-')[0] || 'default';
            return db.collection(FIRESTORE_COLLECTION).doc(username);
        },

        /**
         * Check if current user is admin
         */
        _isAdmin() {
            const authState = window.authManager?.getAuthState();
            const userType = authState?.userType || localStorage.getItem('userType') || '';
            return userType === 'admin-admin@@' || userType.split('-')[0] === 'admin';
        },

        /**
         * Load from Firestore (source of truth) - THAY THẾ toàn bộ _data
         * Admin loads ALL users' data, normal users load only their own
         * @returns {boolean} true nếu load thành công từ Firestore
         */
        async _loadFromFirestore() {
            try {
                const isAdmin = this._isAdmin();

                // CLEAR old data - Firestore là source of truth
                this._data.clear();
                this._sentBills.clear();

                if (isAdmin) {
                    // Admin: load ALL documents from invoice_status collection
                    console.log('[INVOICE-STATUS] Admin detected, loading ALL users data from Firestore...');
                    const db = firebase.firestore();
                    const snapshot = await db.collection(FIRESTORE_COLLECTION).get();

                    let totalEntries = 0;
                    snapshot.forEach(doc => {
                        const firestoreData = doc.data();

                        // Load data từ Firestore (REPLACE, not merge)
                        if (firestoreData.data) {
                            const entries = Array.isArray(firestoreData.data)
                                ? firestoreData.data
                                : Object.entries(firestoreData.data);
                            entries.forEach(([key, value]) => {
                                this._data.set(key, value);
                                totalEntries++;
                            });
                        }

                        // Load sent bills
                        if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                            firestoreData.sentBills.forEach(id => this._sentBills.add(id));
                        }
                    });

                    console.log(`[INVOICE-STATUS] Admin loaded ${totalEntries} entries from ${snapshot.size} users (Firestore = source of truth)`);
                } else {
                    // Normal user: load only their own document
                    const doc = await this._getDocRef().get();
                    if (doc.exists) {
                        const firestoreData = doc.data();

                        // Load data từ Firestore (REPLACE, not merge)
                        if (firestoreData.data) {
                            const entries = Array.isArray(firestoreData.data)
                                ? firestoreData.data
                                : Object.entries(firestoreData.data);
                            entries.forEach(([key, value]) => {
                                this._data.set(key, value);
                            });
                        }

                        // Load sent bills
                        if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                            firestoreData.sentBills.forEach(id => this._sentBills.add(id));
                        }
                    }
                    console.log(`[INVOICE-STATUS] Loaded ${this._data.size} entries from Firestore (source of truth)`);
                }

                // Cache to localStorage
                this._saveToLocalStorage();
                return true;
            } catch (e) {
                console.error('[INVOICE-STATUS] Firestore load error:', e);
                return false; // Signal để fallback về localStorage
            }
        },

        /**
         * Save to localStorage (extends BaseStore's _saveToLocal with sentBills)
         */
        _saveToLocalStorage() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    data: Array.from(this._data.entries()),
                    sentBills: Array.from(this._sentBills),
                    lastUpdated: Date.now(),
                    version: 1
                }));
            } catch (e) {
                console.error('[INVOICE-STATUS] localStorage save error:', e);
            }
        },

        /**
         * Save to Firestore (debounced 2s)
         * Uses merge:true for add/update operations (safe for concurrent edits)
         * Delete uses FieldValue.delete() separately
         */
        _saveToFirestore() {
            clearTimeout(this._syncTimeout);
            this._syncTimeout = setTimeout(async () => {
                try {
                    await this._getDocRef().set({
                        data: Object.fromEntries(this._data),
                        sentBills: Array.from(this._sentBills),
                        lastUpdated: Date.now()
                    }, { merge: true });
                    console.log('[INVOICE-STATUS] Synced to Firestore');
                } catch (e) {
                    console.error('[INVOICE-STATUS] Firestore save error:', e);
                }
            }, 2000);
        },

        /**
         * Save to localStorage + Firestore
         */
        save() {
            this._saveToLocalStorage();
            // Skip Firestore save if currently receiving real-time updates (avoid infinite loops)
            if (!this._isListening) {
                this._saveToFirestore();
            }
        },

        /**
         * Setup real-time listener for add/delete operations from other devices
         * Listens to Firestore changes and updates local _data accordingly
         */
        _setupRealtimeListener() {
            // Don't setup if already listening
            if (this._unsubscribe) {
                console.log('[INVOICE-STATUS] Real-time listener already active');
                return;
            }

            const isAdmin = this._isAdmin();
            const db = firebase.firestore();

            if (isAdmin) {
                // Admin: Listen to ALL documents in the collection
                console.log('[INVOICE-STATUS] Setting up real-time listener for ALL users (admin mode)...');
                this._unsubscribe = db.collection(FIRESTORE_COLLECTION)
                    .onSnapshot((snapshot) => {
                        this._handleCollectionSnapshot(snapshot);
                    }, (error) => {
                        console.error('[INVOICE-STATUS] Real-time listener error:', error);
                    });
            } else {
                // Normal user: Listen only to their own document
                console.log('[INVOICE-STATUS] Setting up real-time listener for current user...');
                this._unsubscribe = this._getDocRef()
                    .onSnapshot((doc) => {
                        this._handleDocSnapshot(doc);
                    }, (error) => {
                        console.error('[INVOICE-STATUS] Real-time listener error:', error);
                    });
            }
        },

        /**
         * Handle collection snapshot (for admin - all docs)
         * @param {firebase.firestore.QuerySnapshot} snapshot
         */
        _handleCollectionSnapshot(snapshot) {
            // Set flag to prevent save loops
            this._isListening = true;

            let hasChanges = false;
            const changedKeys = [];
            const deletedKeys = [];

            // Build a set of all keys currently in Firestore (across all docs)
            const allServerKeys = new Set();
            snapshot.docs.forEach(doc => {
                const firestoreData = doc.data();
                if (firestoreData.data) {
                    Object.keys(firestoreData.data).forEach(key => allServerKeys.add(key));
                }
            });

            // Check for deleted entries (in local but not in any server doc)
            this._data.forEach((value, key) => {
                if (!allServerKeys.has(key)) {
                    this._data.delete(key);
                    this._sentBills.delete(key);
                    hasChanges = true;
                    deletedKeys.push(key);
                    console.log(`[INVOICE-STATUS] Real-time: Entry ${key} deleted (not in server)`);
                }
            });

            snapshot.docChanges().forEach((change) => {
                const doc = change.doc;
                const firestoreData = doc.data();

                if (change.type === 'added' || change.type === 'modified') {
                    // Update entries from this document
                    if (firestoreData.data) {
                        const entries = Array.isArray(firestoreData.data)
                            ? firestoreData.data
                            : Object.entries(firestoreData.data);
                        entries.forEach(([key, value]) => {
                            const existingEntry = this._data.get(key);
                            // Only update if server data is newer or entry doesn't exist locally
                            if (!existingEntry || (value.timestamp && value.timestamp > (existingEntry.timestamp || 0))) {
                                this._data.set(key, value);
                                hasChanges = true;
                                changedKeys.push(key);
                                console.log(`[INVOICE-STATUS] Real-time: Entry ${key} added/updated from doc ${doc.id}`);
                            }
                        });
                    }

                    // Update sentBills
                    if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                        firestoreData.sentBills.forEach(id => {
                            if (!this._sentBills.has(id)) {
                                this._sentBills.add(id);
                                hasChanges = true;
                            }
                        });
                    }
                }
            });

            // Update localStorage cache if there were changes
            if (hasChanges) {
                this._saveToLocalStorage();
                console.log('[INVOICE-STATUS] Real-time: localStorage cache updated');
                // Update UI for changed entries (add/update)
                this._refreshInvoiceStatusUI(changedKeys);
                // Update UI for deleted entries (show "-")
                this._refreshDeletedInvoiceStatusUI(deletedKeys);
            }

            // Reset flag
            this._isListening = false;
        },

        /**
         * Handle single document snapshot (for normal user)
         * @param {firebase.firestore.DocumentSnapshot} doc
         */
        _handleDocSnapshot(doc) {
            // Skip the initial snapshot (we already loaded data in init)
            if (!this._initialized) return;

            // Set flag to prevent save loops
            this._isListening = true;

            let hasChanges = false;
            const changedKeys = [];
            const deletedKeys = [];

            if (doc.exists) {
                const firestoreData = doc.data();
                const serverDataKeys = new Set(Object.keys(firestoreData.data || {}));

                // Check for deleted entries (in local but not in server)
                this._data.forEach((value, key) => {
                    if (!serverDataKeys.has(key)) {
                        this._data.delete(key);
                        this._sentBills.delete(key);
                        hasChanges = true;
                        deletedKeys.push(key);
                        console.log(`[INVOICE-STATUS] Real-time: Entry ${key} deleted (not in server)`);
                    }
                });

                // Update entries from Firestore
                if (firestoreData.data) {
                    const entries = Array.isArray(firestoreData.data)
                        ? firestoreData.data
                        : Object.entries(firestoreData.data);
                    entries.forEach(([key, value]) => {
                        const existingEntry = this._data.get(key);
                        // Only update if server data is newer or entry doesn't exist locally
                        if (!existingEntry || (value.timestamp && value.timestamp > (existingEntry.timestamp || 0))) {
                            this._data.set(key, value);
                            hasChanges = true;
                            changedKeys.push(key);
                            console.log(`[INVOICE-STATUS] Real-time: Entry ${key} added/updated`);
                        }
                    });
                }

                // Update sentBills
                if (firestoreData.sentBills && Array.isArray(firestoreData.sentBills)) {
                    firestoreData.sentBills.forEach(id => {
                        if (!this._sentBills.has(id)) {
                            this._sentBills.add(id);
                            hasChanges = true;
                        }
                    });
                }
            }

            // Update localStorage cache if there were changes
            if (hasChanges) {
                this._saveToLocalStorage();
                console.log('[INVOICE-STATUS] Real-time: localStorage cache updated');
                // Update UI for changed entries (add/update)
                this._refreshInvoiceStatusUI(changedKeys);
                // Update UI for deleted entries (show "-")
                this._refreshDeletedInvoiceStatusUI(deletedKeys);
            }

            // Reset flag
            this._isListening = false;
        },

        /**
         * Refresh UI for invoice status cells when real-time updates are received
         * @param {string[]} changedKeys - Array of saleOnlineIds that changed
         */
        _refreshInvoiceStatusUI(changedKeys) {
            if (!changedKeys || changedKeys.length === 0) return;
            if (typeof window.renderInvoiceStatusCell !== 'function') return;

            changedKeys.forEach(saleOnlineId => {
                // Find the row with this order ID
                const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
                if (row) {
                    const cell = row.querySelector('td[data-column="invoice-status"]');
                    if (cell) {
                        // Get order data from displayedData or OrderStore
                        const orderData = window.OrderStore?.get(saleOnlineId) ||
                            (window.displayedData || []).find(o => String(o.Id) === String(saleOnlineId));

                        if (orderData) {
                            cell.innerHTML = window.renderInvoiceStatusCell(orderData);
                            console.log(`[INVOICE-STATUS] Real-time: Updated UI for order ${saleOnlineId}`);
                        }
                    }
                }
            });
        },

        /**
         * Refresh UI for deleted invoice status entries (show "-")
         * @param {string[]} deletedKeys - Array of saleOnlineIds that were deleted
         */
        _refreshDeletedInvoiceStatusUI(deletedKeys) {
            if (!deletedKeys || deletedKeys.length === 0) return;

            deletedKeys.forEach(saleOnlineId => {
                // Find the row with this order ID
                const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
                if (row) {
                    const cell = row.querySelector('td[data-column="invoice-status"]');
                    if (cell) {
                        cell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                        console.log(`[INVOICE-STATUS] Real-time: Cleared UI for deleted order ${saleOnlineId}`);
                    }
                }
            });
        },

        /**
         * Destroy real-time listener and cleanup (delegates to BaseStore)
         * Call this when the page is unloaded or the store is no longer needed
         */
        destroy() {
            // Delegate core cleanup to BaseStore (unsubscribe, clear timers, clear subscribers)
            _invoiceBaseStore.destroy();
            // Clear any pending sync timeout (custom to InvoiceStatusStore)
            if (this._syncTimeout) {
                clearTimeout(this._syncTimeout);
                this._syncTimeout = null;
            }
            console.log('[INVOICE-STATUS] Store destroyed (via BaseStore)');
        },

        /**
         * Store invoice data for a SaleOnlineOrder
         * @param {string} saleOnlineId - The SaleOnline order ID
         * @param {Object} invoiceData - FastSaleOrder data
         * @param {Object} originalOrder - Optional: SaleOnlineOrder data for enrichment
         */
        set(saleOnlineId, invoiceData, originalOrder = null) {
            if (!saleOnlineId) return;

            // Get original order from store if not provided
            const displayedData = window.displayedData || [];
            const order = originalOrder ||
                window.OrderStore?.get(saleOnlineId) ||
                displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId));

            // Simplify OrderLines to reduce storage size
            // Include Note for product discount display (e.g. "100" = giảm 100k)
            const orderLines = (invoiceData.OrderLines || []).map(line => ({
                ProductName: line.ProductName || line.ProductNameGet || '',
                ProductUOMQty: line.ProductUOMQty || line.Quantity || 1,
                PriceUnit: line.PriceUnit || line.Price || 0,
                PriceTotal: line.PriceTotal || (line.ProductUOMQty || line.Quantity || 1) * (line.PriceUnit || line.Price || 0),
                Note: line.Note || ''  // Ghi chú sản phẩm (giảm giá từng item)
            }));

            // Ensure complete data - use Reference as Number if Number is null (for draft orders)
            const billNumber = invoiceData.Number || invoiceData.Reference || order?.Code || '';

            // Determine ShowState based on payment: "Đã thanh toán" if fully prepaid (CashOnDelivery = 0)
            const cashOnDelivery = invoiceData.CashOnDelivery || 0;
            const paymentAmount = invoiceData.PaymentAmount || 0;
            const isFullyPaid = cashOnDelivery === 0 && paymentAmount > 0;
            const showState = isFullyPaid ? 'Đã thanh toán' : (invoiceData.ShowState || 'Nháp');
            const state = isFullyPaid ? 'paid' : (invoiceData.State || 'draft');

            this._data.set(String(saleOnlineId), {
                Id: invoiceData.Id,
                Number: billNumber,  // Use complete bill number (never null)
                Reference: invoiceData.Reference || order?.Code || '',
                State: state,           // "draft", "open", "cancel", "paid"
                ShowState: showState,   // "Nháp", "Đã xác nhận", "Huỷ bỏ", "Đã thanh toán"
                StateCode: invoiceData.StateCode,   // "None", "NotEnoughInventory", "CrossCheckComplete", etc.
                IsMergeCancel: invoiceData.IsMergeCancel,
                PartnerId: invoiceData.PartnerId,
                PartnerDisplayName: invoiceData.PartnerDisplayName || order?.Name || '',
                AmountTotal: invoiceData.AmountTotal || order?.TotalAmount || 0,
                AmountUntaxed: invoiceData.AmountUntaxed || 0, // Tổng tiền hàng (chưa ship)
                DeliveryPrice: invoiceData.DeliveryPrice || order?.DeliveryPrice || 0,
                CashOnDelivery: invoiceData.CashOnDelivery || 0,
                PaymentAmount: invoiceData.PaymentAmount || 0,  // Số tiền trả trước (wallet balance)
                Discount: invoiceData.Discount || invoiceData.DiscountAmount || invoiceData.DecreaseAmount || 0,  // Giảm giá
                TrackingRef: invoiceData.TrackingRef || '',
                CarrierName: invoiceData.CarrierName || invoiceData.Carrier?.Name || '',
                UserName: invoiceData.UserName || window.authManager?.currentUser?.displayName || '',  // Tên account tạo bill
                SessionIndex: invoiceData.SessionIndex || order?.SessionIndex || '', // STT
                OrderLines: orderLines, // Danh sách sản phẩm (simplified)
                ReceiverName: invoiceData.ReceiverName || order?.Name || '',
                ReceiverPhone: invoiceData.ReceiverPhone || order?.Telephone || '',
                ReceiverAddress: invoiceData.ReceiverAddress || order?.Address || '',
                Comment: invoiceData.Comment || order?.Comment || '',
                DeliveryNote: invoiceData.DeliveryNote || order?.DeliveryNote || '',
                Error: invoiceData.Error,
                DateInvoice: invoiceData.DateInvoice || new Date().toISOString(), // Ngày tạo bill từ API
                DateCreated: invoiceData.DateCreated || order?.DateCreated || new Date().toISOString(), // Ngày tạo đơn
                LiveCampaignId: invoiceData.LiveCampaignId || order?.LiveCampaignId || '', // ID chiến dịch live
                timestamp: Date.now() // Thời điểm lưu vào localStorage
            });
            this.save();
        },

        /**
         * Get invoice data for a SaleOnlineOrder
         * @param {string} saleOnlineId
         * @returns {Object|null}
         */
        get(saleOnlineId) {
            if (!saleOnlineId) return null;
            return this._data.get(String(saleOnlineId)) || null;
        },

        /**
         * Check if order has invoice
         * @param {string} saleOnlineId
         * @returns {boolean}
         */
        has(saleOnlineId) {
            if (!saleOnlineId) return false;
            return this._data.has(String(saleOnlineId));
        },

        /**
         * Mark bill as sent for an order
         * @param {string} saleOnlineId
         */
        markBillSent(saleOnlineId) {
            if (!saleOnlineId) return;
            this._sentBills.add(String(saleOnlineId));
            this.save();
        },

        /**
         * Check if bill was sent
         * @param {string} saleOnlineId
         * @returns {boolean}
         */
        isBillSent(saleOnlineId) {
            if (!saleOnlineId) return false;
            return this._sentBills.has(String(saleOnlineId));
        },

        /**
         * Store multiple invoice results from API response
         * @param {Object} apiResult - Response from InsertListOrderModel API
         */
        storeFromApiResult(apiResult) {
            if (!apiResult) return;

            const displayedData = window.displayedData || [];
            const requestModels = window.lastFastSaleModels || [];

            // Helper: enrich order with SessionIndex from SaleOnlineOrder
            const enrichWithSessionIndex = (order) => {
                if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                    const soId = order.SaleOnlineIds[0];
                    const saleOnlineOrder = window.OrderStore?.get(soId) ||
                        displayedData.find(o => o.Id === soId || String(o.Id) === String(soId));
                    if (saleOnlineOrder && saleOnlineOrder.SessionIndex) {
                        order.SessionIndex = saleOnlineOrder.SessionIndex;
                    }
                }
                return order;
            };

            // Helper: always get OrderLines from request model (source of truth)
            const enrichWithOrderLines = (order) => {
                const matchedModel = requestModels.find(m => m.Reference === order.Reference);
                if (matchedModel?.OrderLines?.length > 0) {
                    order.OrderLines = matchedModel.OrderLines;
                }
                return order;
            };

            // Helper: get PaymentAmount and Discount from request model
            // ALWAYS use request model values (API response may have wrong values)
            const enrichWithPaymentData = (order) => {
                const matchedModel = requestModels.find(m => m.Reference === order.Reference);
                if (matchedModel) {
                    // PaymentAmount = số tiền trả trước từ request (ALWAYS overwrite)
                    if (matchedModel.PaymentAmount !== undefined) {
                        order.PaymentAmount = matchedModel.PaymentAmount;
                    }
                    // Discount = giảm giá từ request (ALWAYS overwrite)
                    const discount = matchedModel.DecreaseAmount || matchedModel.Discount || 0;
                    if (discount > 0) {
                        order.Discount = discount;
                    }
                    console.log('[INVOICE-STATUS] Enriched payment data:', {
                        Reference: order.Reference,
                        PaymentAmount: order.PaymentAmount,
                        Discount: order.Discount
                    });
                }
                return order;
            };

            // Helper: get Address from request model (user may have edited address in form)
            const enrichWithAddress = (order) => {
                // Match by Reference or SaleOnlineIds
                const matchedModel = requestModels.find(m => {
                    if (m.Reference && order.Reference && m.Reference === order.Reference) return true;
                    if (m.SaleOnlineIds?.length && order.SaleOnlineIds?.length) {
                        return JSON.stringify(m.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds);
                    }
                    return false;
                });
                if (matchedModel) {
                    // Get address from request model (edited in form)
                    const requestAddress = matchedModel.ReceiverAddress ||
                        matchedModel.Address ||
                        matchedModel.Partner?.Street;
                    if (requestAddress) {
                        order.ReceiverAddress = requestAddress;
                        order.Address = requestAddress;
                        if (order.Partner) {
                            order.Partner.Street = requestAddress;
                        }
                        console.log('[INVOICE-STATUS] Enriched address from request:', requestAddress);
                    }
                } else {
                    console.warn('[INVOICE-STATUS] No matching request model for address enrichment:', order.Reference);
                }
                return order;
            };

            // Helper: get CarrierName from request model (user selected in form dropdown)
            const enrichWithCarrier = (order) => {
                const matchedModel = requestModels.find(m => {
                    if (m.Reference && order.Reference && m.Reference === order.Reference) return true;
                    if (m.SaleOnlineIds?.length && order.SaleOnlineIds?.length) {
                        return JSON.stringify(m.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds);
                    }
                    return false;
                });
                if (matchedModel) {
                    // Get CarrierName from request model
                    const carrierName = matchedModel.CarrierName || matchedModel.Carrier?.Name || '';
                    if (carrierName) {
                        order.CarrierName = carrierName;
                        if (!order.Carrier) {
                            order.Carrier = {};
                        }
                        order.Carrier.Name = carrierName;
                        console.log('[INVOICE-STATUS] Enriched carrier from request:', carrierName);
                    }
                }
                return order;
            };

            // Store successful orders
            if (apiResult.OrdersSucessed && Array.isArray(apiResult.OrdersSucessed)) {
                apiResult.OrdersSucessed.forEach(order => {
                    enrichWithSessionIndex(order);
                    enrichWithOrderLines(order);
                    enrichWithPaymentData(order);
                    enrichWithAddress(order);
                    enrichWithCarrier(order);
                    if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                        order.SaleOnlineIds.forEach(soId => {
                            // Get original SaleOnlineOrder for enrichment
                            const originalOrder = window.OrderStore?.get(soId) ||
                                displayedData.find(o => o.Id === soId || String(o.Id) === String(soId));

                            // ĐƠN GIẢN: Lấy address từ fastSaleOrdersData (đã được user sửa trong form)
                            const fastSaleData = window.fastSaleOrdersData?.find(f =>
                                f.SaleOnlineIds?.includes(soId) ||
                                JSON.stringify(f.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)
                            );
                            if (fastSaleData?.ReceiverAddress) {
                                order.ReceiverAddress = fastSaleData.ReceiverAddress;
                                order.Address = fastSaleData.ReceiverAddress;
                                console.log('[INVOICE-STATUS] Address from fastSaleOrdersData:', fastSaleData.ReceiverAddress);
                            }

                            this.set(soId, order, originalOrder);
                        });
                    }
                });
            }

            // Store failed orders (they still have invoice created, just not confirmed)
            if (apiResult.OrdersError && Array.isArray(apiResult.OrdersError)) {
                apiResult.OrdersError.forEach(order => {
                    enrichWithSessionIndex(order);
                    enrichWithOrderLines(order);
                    enrichWithPaymentData(order);
                    enrichWithAddress(order);
                    enrichWithCarrier(order);
                    if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                        order.SaleOnlineIds.forEach(soId => {
                            // Get original SaleOnlineOrder for enrichment
                            const originalOrder = window.OrderStore?.get(soId) ||
                                displayedData.find(o => o.Id === soId || String(o.Id) === String(soId));

                            // ĐƠN GIẢN: Lấy address từ fastSaleOrdersData (đã được user sửa trong form)
                            const fastSaleData = window.fastSaleOrdersData?.find(f =>
                                f.SaleOnlineIds?.includes(soId) ||
                                JSON.stringify(f.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)
                            );
                            if (fastSaleData?.ReceiverAddress) {
                                order.ReceiverAddress = fastSaleData.ReceiverAddress;
                                order.Address = fastSaleData.ReceiverAddress;
                                console.log('[INVOICE-STATUS] Address from fastSaleOrdersData:', fastSaleData.ReceiverAddress);
                            }

                            this.set(soId, order, originalOrder);
                        });
                    }
                });
            }

            console.log(`[INVOICE-STATUS] Stored ${this._data.size} invoice entries`);
        },

        /**
         * Clear old entries (delegates to BaseStore's _cleanupOldEntries)
         * Also cleans up sentBills for removed entries
         */
        async cleanup() {
            const sizeBefore = this._data.size;
            // Delegate cleanup to BaseStore
            _invoiceBaseStore._cleanupOldEntries();
            const sizeAfter = this._data.size;
            const removed = sizeBefore - sizeAfter;

            // Also cleanup sentBills for entries that were removed
            if (removed > 0) {
                const currentKeys = new Set(this._data.keys());
                this._sentBills.forEach(id => {
                    if (!currentKeys.has(id)) {
                        this._sentBills.delete(id);
                    }
                });
                this.save();
            }
        },

        /**
         * Get data filtered by date range
         * @param {Date} startDate - Start date
         * @param {Date} endDate - End date
         * @returns {Map} Filtered data
         */
        getByDateRange(startDate, endDate) {
            const filtered = new Map();
            const startTs = startDate?.getTime() || 0;
            const endTs = endDate?.getTime() || Date.now();

            this._data.forEach((value, key) => {
                const ts = value.timestamp || 0;
                if (ts >= startTs && ts <= endTs) {
                    filtered.set(key, value);
                }
            });

            return filtered;
        },

        /**
         * Delete a single invoice entry using FieldValue.delete()
         * This removes only the specific entry without affecting other data
         * Admin: deletes from ALL user docs (since admin loads data from all docs)
         * Normal user: deletes from own doc only
         * @param {string} saleOnlineId - The SaleOnline order ID to delete
         * @returns {boolean} True if deleted, false if not found
         */
        async delete(saleOnlineId) {
            if (!saleOnlineId) return false;

            const key = String(saleOnlineId);
            const existed = this._data.has(key);

            if (existed) {
                // Remove from local _data
                this._data.delete(key);
                this._sentBills.delete(key);
                this._saveToLocalStorage();

                // Delete from Firestore
                try {
                    if (this._isAdmin()) {
                        // Admin: entry may exist in ANY user's doc (since admin loads all docs)
                        // → scan all docs and delete from every doc that contains the entry
                        const db = firebase.firestore();
                        const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
                        const batch = db.batch();
                        let batchCount = 0;
                        snapshot.forEach(doc => {
                            const docData = doc.data();
                            if (docData.data && key in docData.data) {
                                batch.update(doc.ref, {
                                    [`data.${key}`]: firebase.firestore.FieldValue.delete(),
                                    lastUpdated: Date.now()
                                });
                                batchCount++;
                            }
                        });
                        if (batchCount > 0) {
                            await batch.commit();
                            console.log(`[INVOICE-STATUS] Admin deleted invoice ${key} from ${batchCount} user doc(s)`);
                        } else {
                            console.log(`[INVOICE-STATUS] Admin: invoice ${key} not found in any Firestore doc`);
                        }
                    } else {
                        // Normal user: delete from own doc only
                        await this._getDocRef().update({
                            [`data.${key}`]: firebase.firestore.FieldValue.delete(),
                            lastUpdated: Date.now()
                        });
                        console.log(`[INVOICE-STATUS] Deleted invoice for order ${saleOnlineId} from Firestore`);
                    }
                } catch (e) {
                    console.error('[INVOICE-STATUS] Firestore delete error:', e);
                    // Fallback: save entire document if update fails (e.g., document doesn't exist)
                    this._saveToFirestore();
                }
            }

            return existed;
        },

        /**
         * Clear all data (for testing/reset)
         */
        async clearAll() {
            this._data.clear();
            this._sentBills.clear();
            localStorage.removeItem(STORAGE_KEY);

            try {
                await this._getDocRef().delete();
            } catch (e) {
                console.error('[INVOICE-STATUS] Firestore clear error:', e);
            }
        }
    };

    // =====================================================
    // STATE CODE CONFIGURATION
    // =====================================================

    /**
     * ShowState config - order status (State)
     * Values: Nháp, Đã xác nhận, Huỷ bỏ, Đã thanh toán, etc.
     */
    const SHOW_STATE_CONFIG = {
        'Nháp': { color: '#6c757d', bgColor: '#f3f4f6', borderColor: '#d1d5db' },
        'Đã xác nhận': { color: '#2563eb', bgColor: '#dbeafe', borderColor: '#93c5fd' },
        'Huỷ bỏ': { color: '#dc2626', bgColor: '#fee2e2', borderColor: '#fca5a5', style: 'text-decoration: line-through;' },
        'Đã thanh toán': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
        'Hoàn thành': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' }
    };

    /**
     * StateCode config - cross-checking status
     * Values: None, NotEnoughInventory, CrossCheckComplete, CrossCheckSuccess, etc.
     */
    const STATE_CODE_CONFIG = {
        'draft': {
            label: 'Nháp',
            cssClass: 'text-info-lt badge badge-empty',
            color: '#17a2b8'
        },
        'NotEnoughInventory': {
            label: 'Chờ nhập hàng',
            cssClass: 'text-warning-dk',
            color: '#e67e22'
        },
        'cancel': {
            label: 'Hủy',
            cssClass: 'text-danger',
            color: '#6c757d',
            style: 'text-decoration: line-through;'
        },
        'IsMergeCancel': {
            label: 'Hủy do gộp đơn',
            cssClass: 'text-danger',
            color: '#6c757d',
            style: 'text-decoration: line-through;'
        },
        'CrossCheckingError': {
            label: 'Lỗi đối soát',
            cssClass: 'text-danger-dker',
            color: '#c0392b'
        },
        'CrossCheckComplete': {
            label: 'Hoàn thành đối soát',
            cssClass: 'text-success-dk',
            color: '#27ae60'
        },
        'CrossCheckSuccess': {
            label: 'Đối soát OK',
            cssClass: 'text-success-dk',
            color: '#27ae60'
        },
        'CrossChecking': {
            label: 'Đang đối soát',
            cssClass: 'text-success-dk',
            color: '#27ae60'
        },
        'None': {
            label: 'Chưa đối soát',
            cssClass: 'text-secondary',
            color: '#6c757d'
        }
    };

    /**
     * Get StateCode display configuration
     */
    function getStateCodeConfig(stateCode, isMergeCancel) {
        if (isMergeCancel) {
            return STATE_CODE_CONFIG['IsMergeCancel'];
        }
        if (stateCode === 'cancel') {
            return STATE_CODE_CONFIG['cancel'];
        }
        const config = STATE_CODE_CONFIG[stateCode];
        if (config) {
            return config;
        }
        return {
            label: stateCode || 'Chưa đối soát',
            cssClass: 'text-secondary',
            color: '#6c757d'
        };
    }

    // =====================================================
    // RENDER FUNCTIONS FOR MAIN TABLE
    // =====================================================

    /**
     * Get ShowState display configuration
     */
    function getShowStateConfig(showState) {
        const config = SHOW_STATE_CONFIG[showState];
        if (config) {
            return config;
        }
        // Default config
        return { color: '#6c757d', bgColor: '#f3f4f6', borderColor: '#d1d5db' };
    }

    /**
     * Render invoice status cell for main orders table
     * @param {Object} order - SaleOnlineOrder object
     * @returns {string} HTML string
     */
    function renderInvoiceStatusCell(order) {
        if (!order || !order.Id) {
            return '<span style="color: #9ca3af;">−</span>';
        }

        // Check if this order has an invoice
        const invoiceData = InvoiceStatusStore.get(order.Id);

        if (!invoiceData) {
            return '<span style="color: #9ca3af;">−</span>';
        }

        const showState = invoiceData.ShowState || '';
        const stateCode = invoiceData.StateCode || 'None';
        const isMergeCancel = invoiceData.IsMergeCancel === true;
        const showStateConfig = getShowStateConfig(showState);
        const stateCodeConfig = getStateCodeConfig(stateCode, isMergeCancel);
        const stateCodeStyle = stateCodeConfig.style || '';

        // Check if bill was sent
        const billSent = InvoiceStatusStore.isBillSent(order.Id);

        // Build HTML - vertical layout like the image
        let html = `<div class="invoice-status-cell" style="display: flex; flex-direction: column; gap: 2px;">`;

        // Row 1: ShowState badge + UserName + Messenger button
        html += `<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">`;

        // ShowState badge (main status like Huỷ bỏ, Đã thanh toán)
        if (showState) {
            const showStateStyle = showStateConfig.style || '';
            html += `<span style="background: ${showStateConfig.bgColor}; color: ${showStateConfig.color}; border: 1px solid ${showStateConfig.borderColor}; font-size: 11px; padding: 1px 6px; border-radius: 4px; font-weight: 500; ${showStateStyle}" title="Số phiếu: ${invoiceData.Number || ''}">${showState}</span>`;
        }

        // UserName badge (if exists)
        if (invoiceData.UserName) {
            html += `<span style="background: #e0e7ff; color: #4338ca; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 500;" title="Người tạo bill">${invoiceData.UserName}</span>`;
        }

        // Messenger button or sent badge - show for confirmed/paid invoices
        const canSendBill = showState === 'Đã xác nhận' || showState === 'Đã thanh toán';
        if (billSent) {
            // Bill đã gửi: click để xem preview và in (không gửi lại)
            html += `
                <button type="button"
                    class="btn-send-bill-main"
                    data-order-id="${order.Id}"
                    onclick="window.sendBillFromMainTable('${order.Id}'); event.stopPropagation();"
                    title="Xem bill (đã gửi) - chỉ in, không gửi lại"
                    style="background: #d1fae5; color: #059669; border: 1px solid #6ee7b7; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; display: inline-flex; align-items: center; gap: 2px;">
                    ✓
                </button>
            `;
        } else if (canSendBill) {
            // Allow sending bill for confirmed or paid invoices
            html += `
                <button type="button"
                    class="btn-send-bill-main"
                    data-order-id="${order.Id}"
                    onclick="window.sendBillFromMainTable('${order.Id}'); event.stopPropagation();"
                    title="Gửi bill qua Messenger"
                    style="background: #0084ff; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; display: inline-flex; align-items: center; gap: 2px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/>
                    </svg>
                </button>
            `;
        }

        // X button for confirmed/paid invoices - to request cancellation
        if (canSendBill) {
            html += `
                <button type="button"
                    class="btn-cancel-order-main"
                    data-order-id="${order.Id}"
                    onclick="window.showCancelOrderModalFromMain('${order.Id}'); event.stopPropagation();"
                    title="Nhờ hủy đơn"
                    style="background: #dc2626; color: white; border: none; border-radius: 3px; padding: 2px 6px; cursor: pointer; font-size: 10px; display: inline-flex; align-items: center; gap: 2px; margin-left: 2px;">
                    ✕
                </button>
            `;
        }
        html += `</div>`;

        // Row 2: StateCode text (cross-check status like Chưa đối soát, Hoàn thành đối soát)
        html += `<div style="font-size: 11px; color: ${stateCodeConfig.color}; ${stateCodeStyle}">${stateCodeConfig.label}</div>`;

        html += `</div>`;
        return html;
    }

    // =====================================================
    // BILL PREVIEW MODAL FUNCTIONS
    // =====================================================

    /**
     * Pending send data for preview modal
     */
    let pendingSendData = null;

    /**
     * Check if preview before send is enabled
     */
    function isPreviewBeforeSendEnabled() {
        try {
            const settings = window.getBillTemplateSettings ? window.getBillTemplateSettings() : {};
            return settings.previewBeforeSend !== false; // Default true
        } catch (e) {
            return true; // Default true on error
        }
    }

    /**
     * Show bill preview modal before sending
     * @param {Object} enrichedOrder - Order data for bill
     * @param {string} channelId - Pancake channel ID
     * @param {string} psid - Customer PSID
     * @param {string} orderId - SaleOnlineOrder ID
     * @param {string} orderCode - Order code for display
     * @param {string} source - 'main' or 'results' (where the send was triggered)
     * @param {number} resultIndex - Index in results modal (for results source)
     * @param {boolean} viewOnly - If true, hide send buttons (only allow print)
     * @param {number} walletBalance - Optional wallet balance for bill calculation
     */
    async function showBillPreviewModal(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex, viewOnly = false, walletBalance = 0) {
        const modal = document.getElementById('billPreviewSendModal');
        const container = document.getElementById('billPreviewSendContainer');
        const sendBtn = document.getElementById('billPreviewSendBtn');
        const printSendBtn = document.getElementById('billPreviewPrintSendBtn');

        if (!modal || !container) {
            console.error('[INVOICE-STATUS] Preview modal elements not found');
            // Fallback to direct send (only if not view-only)
            if (!viewOnly) {
                return performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex);
            }
            return;
        }

        // Store pending data
        pendingSendData = {
            enrichedOrder,
            channelId,
            psid,
            orderId,
            orderCode,
            source,
            resultIndex,
            viewOnly,
            walletBalance
        };

        // Show loading in container
        container.innerHTML = '<p style="color: #9ca3af; padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Đang tạo bill...</p>';

        // Show modal (use both style and class for compatibility)
        modal.style.display = 'flex';
        modal.classList.add('show');

        // Handle view-only mode: hide send buttons
        if (viewOnly) {
            if (sendBtn) sendBtn.style.display = 'none';
            if (printSendBtn) printSendBtn.style.display = 'none';
        } else {
            if (sendBtn) sendBtn.style.display = '';
            if (printSendBtn) printSendBtn.style.display = '';
        }

        try {
            // Use custom bill template (no TPOS API request)
            let billHTML = null;

            if (typeof window.generateCustomBillHTML === 'function') {
                console.log('[INVOICE-STATUS] Generating custom bill for preview, walletBalance:', walletBalance);
                billHTML = window.generateCustomBillHTML(enrichedOrder, { walletBalance });
            }

            if (billHTML) {
                // Use iframe to display bill exactly as-is (no CSS conflicts)
                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'width: 100%; height: 600px; border: none; background: white;';
                container.innerHTML = '';
                container.appendChild(iframe);

                // Write the full HTML to iframe
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(billHTML);
                iframeDoc.close();

                console.log('[INVOICE-STATUS] Custom bill loaded in iframe');

                // Pre-generate bill image in background (don't await - fire and forget)
                // This makes sending instant when user clicks "Gửi"
                if (!viewOnly && channelId && typeof window.generateBillImage === 'function' && window.pancakeDataManager) {
                    preGenerateBillInBackground(enrichedOrder, channelId, billHTML, walletBalance);
                }
            } else {
                container.innerHTML = '<p style="color: #ef4444; padding: 40px; text-align: center;">Không thể tạo bill preview</p>';
            }
        } catch (error) {
            console.error('[INVOICE-STATUS] Error generating bill preview:', error);
            container.innerHTML = '<p style="color: #ef4444; padding: 40px; text-align: center;">Lỗi khi tạo bill preview</p>';
        }

        // Enable send button (only if not view-only)
        if (sendBtn && !viewOnly) {
            sendBtn.disabled = false;
        }
    }

    /**
     * Pre-generate bill image and upload to Pancake in background
     * Runs while user is viewing the preview - makes sending instant
     */
    async function preGenerateBillInBackground(enrichedOrder, channelId, billHtml, walletBalance) {
        const cacheKey = enrichedOrder.Id || enrichedOrder.Number;
        console.log('[INVOICE-STATUS] 🎨 Pre-generating bill image for:', cacheKey);

        try {
            // Initialize cache if not exists
            if (!window.preGeneratedBillData) {
                window.preGeneratedBillData = new Map();
            }

            // Generate image from the same HTML used in preview
            const imageBlob = await window.generateBillImage(enrichedOrder, { billHtml, walletBalance });

            // Convert blob to File for upload
            const imageFile = new File([imageBlob], `bill_${cacheKey}.png`, { type: 'image/png' });

            // Upload to Pancake
            const uploadResult = await window.pancakeDataManager.uploadImage(channelId, imageFile);
            const contentUrl = typeof uploadResult === 'string' ? uploadResult : uploadResult.content_url;
            const contentId = typeof uploadResult === 'object' ? (uploadResult.content_id || uploadResult.id) : null;

            if (contentUrl && contentId) {
                // Cache for later use
                window.preGeneratedBillData.set(cacheKey, {
                    contentUrl,
                    contentId,
                    timestamp: Date.now()
                });
                console.log('[INVOICE-STATUS] ✅ Bill pre-generated and cached:', cacheKey, contentUrl);
            }
        } catch (error) {
            console.warn('[INVOICE-STATUS] ⚠️ Pre-generation failed (will regenerate on send):', error.message);
        }
    }

    /**
     * Close bill preview modal
     */
    function closeBillPreviewSendModal() {
        const modal = document.getElementById('billPreviewSendModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
            // Reset the container
            const container = document.getElementById('billPreviewSendContainer');
            if (container) {
                container.innerHTML = '<p style="color: #9ca3af; padding: 40px; text-align: center;">Đang tạo bill...</p>';
            }
        }
        // Reset send button
        const sendBtn = document.getElementById('billPreviewSendBtn');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fab fa-facebook-messenger"></i> Gửi bill';
        }
        // Remove any body scroll lock (in case it was added)
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        pendingSendData = null;
    }

    /**
     * Confirm and send bill from preview modal
     */
    async function confirmSendBillFromPreview() {
        if (!pendingSendData) {
            window.notificationManager?.error('Không có dữ liệu để gửi', 5000);
            closeBillPreviewSendModal();
            return;
        }

        const { enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex } = pendingSendData;

        // Close modal immediately and show sending notification
        closeBillPreviewSendModal();
        window.notificationManager?.info(`📤 Đang gửi bill #${orderCode}...`, 10000);

        // Run send in background
        performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex)
            .then(() => {
                // Success handled in performActualSend
            })
            .catch(error => {
                console.error('[INVOICE-STATUS] Error sending from preview:', error);
                window.notificationManager?.error(`❌ Gửi bill #${orderCode} thất bại: ${error.message}`, 5000);
            });
    }

    /**
     * Print bill from preview modal (only print, no send)
     */
    async function printBillFromPreview() {
        if (!pendingSendData) {
            window.notificationManager?.error('Không có dữ liệu để in', 5000);
            return;
        }

        const { enrichedOrder, orderId } = pendingSendData;
        const tposOrderId = enrichedOrder.Id || orderId;

        // Use TPOS bill if order has TPOS ID
        if (tposOrderId && typeof window.fetchAndPrintTPOSBill === 'function') {
            console.log('[INVOICE-STATUS] Printing TPOS bill for order:', tposOrderId);
            const headers = await getBillAuthHeader();
            const orderData = enrichedOrder.SessionIndex ? enrichedOrder :
                (window.OrderStore?.get(enrichedOrder.SaleOnlineIds?.[0]) || enrichedOrder);
            window.fetchAndPrintTPOSBill(tposOrderId, headers, orderData);
        } else if (typeof window.openCombinedPrintPopup === 'function') {
            // Fallback to custom bill
            window.openCombinedPrintPopup([enrichedOrder]);
            console.log('[INVOICE-STATUS] Opened custom print popup for bill');
        } else {
            window.notificationManager?.error('Không thể mở cửa sổ in', 5000);
        }
    }

    /**
     * Print and send bill from preview modal
     */
    async function printAndSendBillFromPreview() {
        if (!pendingSendData) {
            window.notificationManager?.error('Không có dữ liệu để in và gửi', 5000);
            closeBillPreviewSendModal();
            return;
        }

        const { enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex } = pendingSendData;
        const tposOrderId = enrichedOrder.Id || orderId;

        // 1. Open print popup first (TPOS bill if available)
        if (tposOrderId && typeof window.fetchAndPrintTPOSBill === 'function') {
            console.log('[INVOICE-STATUS] Printing TPOS bill for order:', tposOrderId);
            const headers = await getBillAuthHeader();
            const orderData = enrichedOrder.SessionIndex ? enrichedOrder :
                (window.OrderStore?.get(enrichedOrder.SaleOnlineIds?.[0]) || enrichedOrder);
            window.fetchAndPrintTPOSBill(tposOrderId, headers, orderData);
        } else if (typeof window.openCombinedPrintPopup === 'function') {
            window.openCombinedPrintPopup([enrichedOrder]);
            console.log('[INVOICE-STATUS] Opened custom print popup for bill');
        }

        // 2. Close modal immediately and show sending notification
        closeBillPreviewSendModal();
        window.notificationManager?.info(`🖨️ Đang in và gửi bill #${orderCode}...`, 10000);

        // 3. Run send in background
        performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex)
            .then(() => {
                // Success handled in performActualSend
            })
            .catch(error => {
                console.error('[INVOICE-STATUS] Error printing and sending:', error);
                window.notificationManager?.error(`❌ Gửi bill #${orderCode} thất bại: ${error.message}`, 5000);
            });
    }

    /**
     * Perform actual bill send
     */
    async function performActualSend(enrichedOrder, channelId, psid, orderId, orderCode, source, resultIndex) {
        console.log('[INVOICE-STATUS] Sending bill for:', orderCode);

        // Check for pre-generated bill data
        const cachedData = window.preGeneratedBillData?.get(enrichedOrder.Id) ||
            window.preGeneratedBillData?.get(enrichedOrder.Number);
        const sendOptions = {};
        if (cachedData && cachedData.contentUrl && cachedData.contentId) {
            sendOptions.preGeneratedContentUrl = cachedData.contentUrl;
            sendOptions.preGeneratedContentId = cachedData.contentId;
        }

        if (typeof window.sendBillToCustomer !== 'function') {
            throw new Error('sendBillToCustomer function not available');
        }

        const result = await window.sendBillToCustomer(enrichedOrder, channelId, psid, sendOptions);

        if (result.success) {
            console.log(`[INVOICE-STATUS] ✅ Bill sent for ${orderCode}`);

            // Mark as sent
            InvoiceStatusStore.markBillSent(orderId);

            // Update UI based on source
            if (source === 'main') {
                const cell = document.querySelector(`td[data-column="invoice-status"] .btn-send-bill-main[data-order-id="${orderId}"]`);
                if (cell) {
                    // Change button style to green (sent), keep same onclick for viewing
                    cell.style.background = '#d1fae5';
                    cell.style.color = '#059669';
                    cell.style.border = '1px solid #6ee7b7';
                    cell.title = 'Xem bill (đã gửi) - chỉ in, không gửi lại';
                    cell.innerHTML = '✓';
                }
            } else if (source === 'results') {
                const cell = document.querySelector(`.invoice-status-cell[data-order-id="${enrichedOrder.Id}"]`);
                if (cell) {
                    const btn = cell.querySelector('.btn-send-bill-messenger');
                    if (btn) {
                        btn.outerHTML = `<span class="bill-sent-badge" style="color: #27ae60; font-size: 14px;" title="Đã gửi bill">✓ Đã gửi</span>`;
                    }
                }
            }

            window.notificationManager?.success(`Đã gửi bill cho ${orderCode}`);
        } else {
            throw new Error(result.error || 'Gửi bill thất bại');
        }
    }

    /**
     * Send bill from main table
     * @param {string} orderId - SaleOnlineOrder ID
     */
    async function sendBillFromMainTable(orderId) {
        const displayedData = window.displayedData || [];
        const order = window.OrderStore?.get(orderId) ||
            displayedData.find(o => o.Id === orderId || String(o.Id) === String(orderId));

        if (!order) {
            window.notificationManager?.error('Không tìm thấy đơn hàng');
            return;
        }

        const invoiceData = InvoiceStatusStore.get(orderId);
        if (!invoiceData) {
            window.notificationManager?.error('Đơn hàng chưa có phiếu bán hàng');
            return;
        }

        // Check if bill was already sent
        const billAlreadySent = InvoiceStatusStore.isBillSent(orderId);

        // Get customer info for Messenger (only needed if not already sent)
        const psid = order.Facebook_ASUserId;
        const postId = order.Facebook_PostId;
        const channelId = postId ? postId.split('_')[0] : null;

        // Only require Messenger info if bill not sent yet
        if (!billAlreadySent && (!psid || !channelId)) {
            window.notificationManager?.error('Không có thông tin Messenger của khách hàng');
            return;
        }

        // Build enriched order for bill generation
        // invoiceData already has complete data (set() ensures all fields are populated)

        // Fallback: Auto-detect carrier from address if CarrierName is empty
        let carrierName = invoiceData.CarrierName;
        if (!carrierName && invoiceData.ReceiverAddress && typeof window.extractDistrictFromAddress === 'function') {
            const districtInfo = window.extractDistrictFromAddress(invoiceData.ReceiverAddress, null);
            if (districtInfo) {
                carrierName = getCarrierNameFromDistrict(districtInfo);
                console.log('[INVOICE-STATUS] Auto-detected carrier from address:', carrierName);
            }
        }

        const enrichedOrder = {
            Id: invoiceData.Id,
            Number: invoiceData.Number,  // Already complete (never null)
            Reference: invoiceData.Reference,
            DateInvoice: invoiceData.DateInvoice,  // Ngày tạo bill từ TPOS
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName,
            DeliveryPrice: invoiceData.DeliveryPrice,
            CashOnDelivery: invoiceData.CashOnDelivery,
            PaymentAmount: invoiceData.PaymentAmount,  // Số tiền trả trước
            Discount: invoiceData.Discount,            // Giảm giá
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

        // Calculate walletBalance for bill generation
        const walletBalance = invoiceData.PaymentAmount || 0;

        // Check if preview is enabled
        if (isPreviewBeforeSendEnabled()) {
            // Show preview modal (viewOnly if bill already sent)
            await showBillPreviewModal(enrichedOrder, channelId, psid, orderId, order.Code || order.Name, 'main', null, billAlreadySent, walletBalance);
        } else {
            // Direct send with confirm
            const confirmed = confirm(`Xác nhận gửi bill cho đơn hàng ${order.Code || order.Name}?`);
            if (!confirmed) return;

            // Find button and show loading
            const button = document.querySelector(`.btn-send-bill-main[data-order-id="${orderId}"]`);
            if (button) {
                button.disabled = true;
                button.innerHTML = '...';
            }

            try {
                await performActualSend(enrichedOrder, channelId, psid, orderId, order.Code || order.Name, 'main', null);
            } catch (error) {
                console.error('[INVOICE-STATUS] Error sending bill:', error);
                window.notificationManager?.error(`Lỗi: ${error.message}`);

                // Restore button
                if (button) {
                    button.disabled = false;
                    button.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/></svg>`;
                }
            }
        }
    }

    // =====================================================
    // DELETE INVOICE FROM STORE
    // =====================================================

    /**
     * Delete invoice from localStorage and Firebase
     * Called when clicking trash button in "Phiếu bán hàng" column
     * @param {string} saleOnlineId - The SaleOnline order ID
     */
    async function deleteInvoiceFromStore(saleOnlineId) {
        if (!saleOnlineId) return;

        // Get invoice data for display
        const invoiceData = InvoiceStatusStore.get(saleOnlineId);
        if (!invoiceData) {
            window.notificationManager?.warning('Không tìm thấy phiếu bán hàng để xóa', 3000);
            return;
        }

        const billNumber = invoiceData.Number || invoiceData.Reference || 'N/A';
        const customerName = invoiceData.PartnerDisplayName || invoiceData.ReceiverName || 'N/A';

        // Confirmation dialog
        const confirmed = confirm(
            `Xóa phiếu bán hàng?\n\n` +
            `Số phiếu: ${billNumber}\n` +
            `Khách hàng: ${customerName}\n\n` +
            `Dữ liệu sẽ bị xóa khỏi localStorage và Firebase.`
        );

        if (!confirmed) return;

        try {
            // Delete from store (localStorage + Firebase)
            const deleted = await InvoiceStatusStore.delete(saleOnlineId);

            if (deleted) {
                window.notificationManager?.success(`Đã xóa phiếu ${billNumber}`, 3000);

                // Update UI - refresh the cell in main table
                const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
                if (row) {
                    const cell = row.querySelector('td[data-column="invoice-status"]');
                    if (cell) {
                        cell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                    }
                }

                // Also refresh if in results modal
                const resultCell = document.querySelector(`.invoice-status-cell[data-order-id="${saleOnlineId}"]`);
                if (resultCell) {
                    resultCell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                }
            } else {
                window.notificationManager?.warning('Không tìm thấy phiếu để xóa', 3000);
            }
        } catch (error) {
            console.error('[INVOICE-STATUS] Error deleting invoice:', error);
            window.notificationManager?.error(`Lỗi xóa phiếu: ${error.message}`, 5000);
        }
    }

    // =====================================================
    // RESULTS MODAL OVERRIDE (Keep existing functionality)
    // =====================================================

    /**
     * Override renderSuccessOrdersTable to add "Phiếu bán hàng" column
     */
    function renderSuccessOrdersTableWithInvoiceStatus() {
        const container = document.getElementById('successOrdersTable');
        if (!container) return;

        const resultsData = window.fastSaleResultsData;
        if (!resultsData || resultsData.success.length === 0) {
            container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 40px;">Không có đơn hàng thành công</p>';
            return;
        }

        const html = `
            <table class="fast-sale-results-table">
                <thead>
                    <tr>
                        <th style="width: 40px;">#</th>
                        <th style="width: 40px;"><input type="checkbox" id="selectAllSuccess" onchange="toggleAllSuccessOrders(this.checked)"></th>
                        <th>Mã</th>
                        <th>Số phiếu</th>
                        <th>Trạng thái</th>
                        <th>Phiếu bán hàng</th>
                        <th>Khách hàng</th>
                        <th>Mã vận đơn</th>
                    </tr>
                </thead>
                <tbody>
                    ${resultsData.success.map((order, index) => {
            const stateCode = order.StateCode || 'None';
            const isMergeCancel = order.IsMergeCancel === true;
            const config = getStateCodeConfig(stateCode, isMergeCancel);
            const style = config.style || '';
            const saleOnlineId = order.SaleOnlineIds?.[0];
            const billSent = saleOnlineId ? InvoiceStatusStore.isBillSent(saleOnlineId) : false;
            const showState = order.ShowState || '';
            const canSendBill = showState === 'Đã xác nhận' || showState === 'Đã thanh toán';

            // Show send button for confirmed/paid orders
            let sendButtonHtml = '';
            if (billSent) {
                sendButtonHtml = `<span class="bill-sent-badge" style="color: #27ae60; font-size: 14px;" title="Đã gửi bill">✓</span>`;
            } else if (canSendBill) {
                sendButtonHtml = `<button type="button" class="btn-send-bill-messenger" data-index="${index}" data-order-id="${order.Id}" onclick="window.sendBillManually(${index})" title="Gửi bill qua Messenger" style="background: #0084ff; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/></svg>
                </button>`;
            }
            // Note: Non-confirmed/non-paid orders (Nháp, Huỷ bỏ, etc.) don't get a send button

            return `
                        <tr data-order-id="${order.Id}" data-order-index="${index}">
                            <td>${index + 1}</td>
                            <td><input type="checkbox" class="success-order-checkbox" value="${index}" data-order-id="${order.Id}"></td>
                            <td>${order.Reference || 'N/A'}</td>
                            <td>${order.Number || ''}</td>
                            <td><span style="color: ${canSendBill ? '#10b981' : '#f59e0b'}; font-weight: 600;">${canSendBill ? '✓' : '⚠'} ${showState || 'Nhập'}</span></td>
                            <td class="invoice-status-cell" data-order-id="${order.Id}">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span class="state-code-badge ${config.cssClass}" style="color: ${config.color}; font-weight: 500; ${style}">${config.label}</span>
                                    ${sendButtonHtml}
                                </div>
                            </td>
                            <td>${order.Partner?.PartnerDisplayName || order.PartnerDisplayName || 'N/A'}</td>
                            <td>${order.TrackingRef || ''}</td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    }

    /**
     * Send bill manually from results modal
     * @param {number} index - Index in success results
     * @param {boolean} skipPreview - If true, skip preview modal and send directly (for auto-send)
     */
    async function sendBillManually(index, skipPreview = false) {
        const resultsData = window.fastSaleResultsData;
        if (!resultsData || !resultsData.success[index]) {
            window.notificationManager?.error('Không tìm thấy đơn hàng');
            return;
        }

        const order = resultsData.success[index];
        const orderNumber = order.Number || order.Reference;
        const saleOnlineId = order.SaleOnlineIds?.[0];

        try {
            const fastSaleOrdersData = window.fastSaleOrdersData || [];
            const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                (o.SaleOnlineIds && order.SaleOnlineIds &&
                    JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                (o.Reference && o.Reference === order.Reference)
            );
            const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

            const displayedData = window.displayedData || [];
            let saleOnlineOrder = saleOnlineId
                ? (window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                : null;

            if (!saleOnlineOrder) {
                const saleOnlineName = order.SaleOnlineNames?.[0];
                if (saleOnlineName) {
                    saleOnlineOrder = displayedData.find(o => o.Code === saleOnlineName);
                }
            }
            if (!saleOnlineOrder && order.PartnerId) {
                saleOnlineOrder = displayedData.find(o => o.PartnerId === order.PartnerId);
            }

            if (!saleOnlineOrder) {
                throw new Error('Không tìm thấy thông tin khách hàng');
            }

            const psid = saleOnlineOrder.Facebook_ASUserId;
            const postId = saleOnlineOrder.Facebook_PostId;
            const channelId = postId ? postId.split('_')[0] : null;

            if (!psid || !channelId) {
                throw new Error('Không có thông tin Messenger');
            }

            const carrierSelect = originalOrderIndex >= 0 ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`) : null;
            const carrierNameFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
            const carrierName = carrierNameFromDropdown || originalOrder?.Carrier?.Name || originalOrder?.CarrierName || order.CarrierName || '';
            const shippingFee = originalOrderIndex >= 0
                ? parseFloat(document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)?.value) || 0
                : order.DeliveryPrice || 0;

            let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
            if ((!orderLines || orderLines.length === 0) && saleOnlineOrder?.Details) {
                orderLines = saleOnlineOrder.Details.map(d => ({
                    ProductName: d.ProductName || d.ProductNameGet || '',
                    ProductNameGet: d.ProductNameGet || d.ProductName || '',
                    ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                    PriceUnit: d.Price || d.PriceUnit || 0,
                    Note: d.Note || ''
                }));
            }

            // Get wallet balance (PaymentAmount) for bill calculation
            const walletBalance = order.PaymentAmount || originalOrder?.PaymentAmount || 0;

            const enrichedOrder = {
                ...order,
                OrderLines: orderLines,
                CarrierName: carrierName,
                DeliveryPrice: shippingFee,
                PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
                UserName: order.UserName || originalOrder?.UserName || '',  // Account tạo bill
                SessionIndex: saleOnlineOrder?.SessionIndex || originalOrder?.SessionIndex || '', // STT
            };

            // Check if preview is enabled (skip preview for auto-send)
            if (!skipPreview && isPreviewBeforeSendEnabled()) {
                // Show preview modal
                await showBillPreviewModal(enrichedOrder, channelId, psid, saleOnlineId, orderNumber, 'results', index, false, walletBalance);
            } else {
                // Direct send (skip confirm for auto-send)
                if (!skipPreview) {
                    const confirmed = confirm(`Xác nhận gửi bill cho đơn hàng ${orderNumber}?`);
                    if (!confirmed) return;
                }

                const button = document.querySelector(`button.btn-send-bill-messenger[data-index="${index}"]`);
                if (button) {
                    button.disabled = true;
                    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
                }

                try {
                    await performActualSend(enrichedOrder, channelId, psid, saleOnlineId, orderNumber, 'results', index);
                } catch (sendError) {
                    console.error('[INVOICE-STATUS] Error:', sendError);
                    window.notificationManager?.error(`Lỗi: ${sendError.message}`);

                    if (button) {
                        button.disabled = false;
                        button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/></svg>`;
                    }
                }
            }

        } catch (error) {
            console.error('[INVOICE-STATUS] Error preparing bill:', error);
            window.notificationManager?.error(`Lỗi: ${error.message}`);
        }
    }

    /**
     * Override printSuccessOrders to disable auto-send
     */
    async function printSuccessOrdersWithoutAutoSend(type) {
        const selectedIndexes = Array.from(document.querySelectorAll('.success-order-checkbox:checked'))
            .map(cb => parseInt(cb.value));

        if (selectedIndexes.length === 0) {
            window.notificationManager?.warning('Vui lòng chọn ít nhất 1 đơn hàng để in');
            return;
        }

        const resultsData = window.fastSaleResultsData;
        const selectedOrders = selectedIndexes.map(i => resultsData.success[i]);
        const orderIds = selectedOrders.map(o => o.Id).filter(id => id);

        if (orderIds.length === 0) {
            window.notificationManager?.error('Không tìm thấy ID đơn hàng');
            return;
        }

        console.log(`[INVOICE-STATUS] Printing ${type} for ${orderIds.length} orders (auto-send DISABLED)`);

        if (type === 'invoice') {
            const fastSaleOrdersData = window.fastSaleOrdersData || [];
            const displayedData = window.displayedData || [];
            const enrichedOrders = [];

            for (const order of selectedOrders) {
                const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                    (o.SaleOnlineIds && order.SaleOnlineIds && JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                    (o.Reference && o.Reference === order.Reference)
                );
                const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

                const saleOnlineId = order.SaleOnlineIds?.[0];
                const saleOnlineOrderForData = saleOnlineId
                    ? (window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                    : null;

                const carrierSelect = originalOrderIndex >= 0 ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`) : null;
                const carrierName = carrierSelect?.options[carrierSelect.selectedIndex]?.text ||
                    originalOrder?.Carrier?.Name || originalOrder?.CarrierName || order.CarrierName || '';
                const shippingFee = originalOrderIndex >= 0
                    ? parseFloat(document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)?.value) || 0
                    : order.DeliveryPrice || 0;

                let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
                if ((!orderLines || orderLines.length === 0) && saleOnlineOrderForData?.Details) {
                    orderLines = saleOnlineOrderForData.Details.map(d => ({
                        ProductName: d.ProductName || d.ProductNameGet || '',
                        ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                        PriceUnit: d.Price || d.PriceUnit || 0
                    }));
                }

                enrichedOrders.push({
                    ...order,
                    OrderLines: orderLines,
                    CarrierName: carrierName,
                    DeliveryPrice: shippingFee,
                    PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
                });
            }

            if (enrichedOrders.length > 0 && typeof window.openCombinedPrintPopup === 'function') {
                window.openCombinedPrintPopup(enrichedOrders);
            }

            window.selectedOrderIds?.clear();
            document.querySelectorAll('#ordersTable input[type="checkbox"]:checked').forEach(cb => cb.checked = false);
            const headerCheckbox = document.querySelector('#ordersTable thead input[type="checkbox"]');
            if (headerCheckbox) headerCheckbox.checked = false;
            if (typeof window.updateActionButtons === 'function') window.updateActionButtons();

            window.notificationManager?.info(`Đã mở in ${enrichedOrders.length} bill. Bấm nút Messenger để gửi.`, 4000);
            return;
        }

        // For other types, use original function
        if (window._originalPrintSuccessOrders) {
            return window._originalPrintSuccessOrders(type);
        }
    }

    // =====================================================
    // UPDATE ORDER ON INVOICE CONFIRM
    // =====================================================

    /**
     * When invoice is confirmed ("Đã xác nhận"):
     * 1. Update order status from "Nháp" to "Đơn hàng"
     * 2. Remove any "OK ..." tags
     * @param {string|number} saleOnlineId - The SaleOnline order ID
     * @param {string} invoiceShowState - The invoice ShowState (e.g., "Đã xác nhận")
     */
    async function updateOrderOnInvoiceConfirm(saleOnlineId, invoiceShowState) {
        // Only process for confirmed invoices
        if (invoiceShowState !== 'Đã xác nhận') {
            return;
        }

        console.log(`[INVOICE-STATUS] Invoice confirmed for order ${saleOnlineId}, updating status and tags...`);

        try {
            const headers = await window.tokenManager?.getAuthHeader();
            if (!headers) {
                console.warn('[INVOICE-STATUS] No auth headers available');
                return;
            }

            // Get order data
            const displayedData = window.displayedData || [];
            const allData = window.allData || [];
            const order = window.OrderStore?.get(saleOnlineId) ||
                displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)) ||
                allData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId));

            if (!order) {
                console.warn(`[INVOICE-STATUS] Order ${saleOnlineId} not found`);
                return;
            }

            // 1. Update status to "Đơn hàng" if currently "Nháp"
            if (order.Status === 'Draft' || order.StatusText === 'Nháp') {
                const statusUrl = `${window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev'}/api/odata/SaleOnline_Order/OdataService.UpdateStatusSaleOnline?Id=${saleOnlineId}&Status=${encodeURIComponent('Đơn hàng')}`;

                const statusResponse = await fetch(statusUrl, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'content-type': 'application/json;charset=utf-8',
                        'accept': '*/*'
                    },
                    body: null
                });

                if (statusResponse.ok) {
                    console.log(`[INVOICE-STATUS] ✅ Status updated to "Đơn hàng" for order ${saleOnlineId}`);

                    // Update local data using OrderStore.update()
                    if (window.OrderStore) {
                        window.OrderStore.update(saleOnlineId, { Status: 'order', StatusText: 'Đơn hàng' });
                    }
                    // Also update the order reference
                    order.Status = 'order';
                    order.StatusText = 'Đơn hàng';

                    // Update UI
                    const statusBadge = document.querySelector(`.status-badge[data-order-id="${saleOnlineId}"]`);
                    if (statusBadge) {
                        statusBadge.className = 'status-badge status-order';
                        statusBadge.style.backgroundColor = '#5cb85c';
                        statusBadge.innerText = 'Đơn hàng';
                    }
                } else {
                    console.warn(`[INVOICE-STATUS] Failed to update status: ${statusResponse.status}`);
                }
            }

            // =====================================================
            // [DISABLED] 2. Remove "OK ..." tags - Tạm tắt, bỏ comment để mở lại
            // =====================================================
            /*
            let orderTags = [];
            try {
                if (order.Tags) {
                    orderTags = JSON.parse(order.Tags);
                    if (!Array.isArray(orderTags)) orderTags = [];
                }
            } catch (e) {
                orderTags = [];
            }

            // Find tags that start with "OK " (case insensitive)
            const okTags = orderTags.filter(t => t.Name && t.Name.toUpperCase().startsWith('OK '));

            if (okTags.length > 0) {
                console.log(`[INVOICE-STATUS] Found ${okTags.length} OK tags to remove:`, okTags.map(t => t.Name));

                // Filter out OK tags
                const newOrderTags = orderTags.filter(t => !t.Name || !t.Name.toUpperCase().startsWith('OK '));

                // Call AssignTag API with remaining tags
                const tagResponse = await fetch(
                    'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
                    {
                        method: 'POST',
                        headers: {
                            ...headers,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        body: JSON.stringify({
                            Tags: newOrderTags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                            OrderId: saleOnlineId
                        })
                    }
                );

                if (tagResponse.ok) {
                    console.log(`[INVOICE-STATUS] ✅ Removed OK tags from order ${saleOnlineId}`);

                    // Update local data
                    const newTagsJson = JSON.stringify(newOrderTags);
                    order.Tags = newTagsJson;
                    if (window.OrderStore) {
                        window.OrderStore.update(saleOnlineId, { Tags: newTagsJson });
                    }

                    // Update UI - find the TAG cell and update it
                    if (typeof window.updateOrderInTable === 'function') {
                        window.updateOrderInTable(saleOnlineId, { Tags: newTagsJson });
                    }

                    // Emit to Firebase for real-time sync
                    if (typeof window.emitTagUpdateToFirebase === 'function') {
                        window.emitTagUpdateToFirebase(saleOnlineId, newOrderTags);
                    }
                } else {
                    console.warn(`[INVOICE-STATUS] Failed to remove tags: ${tagResponse.status}`);
                }
            }
            */

        } catch (error) {
            console.error(`[INVOICE-STATUS] Error updating order on invoice confirm:`, error);
        }
    }

    // =====================================================
    // UPDATE MAIN TABLE CELLS
    // =====================================================

    /**
     * Update invoice status cells in main table for specific orders
     * @param {Object} apiResult - API response with OrdersSucessed/OrdersError
     */
    function updateMainTableInvoiceCells(apiResult) {
        if (!apiResult) return;

        const allOrders = [
            ...(apiResult.OrdersSucessed || []),
            ...(apiResult.OrdersError || [])
        ];

        console.log(`[INVOICE-STATUS] Updating ${allOrders.length} cells in main table`);

        allOrders.forEach(order => {
            if (!order.SaleOnlineIds || order.SaleOnlineIds.length === 0) return;

            order.SaleOnlineIds.forEach(saleOnlineId => {
                // Find the row in main table
                const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
                if (!row) return;

                // Find the invoice-status cell
                const cell = row.querySelector('td[data-column="invoice-status"]');
                if (!cell) return;

                // Get order data from displayedData for full info
                const displayedData = window.displayedData || [];
                const orderData = window.OrderStore?.get(saleOnlineId) ||
                    displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId));

                if (orderData) {
                    // Re-render the cell content
                    cell.innerHTML = renderInvoiceStatusCell(orderData);
                    console.log(`[INVOICE-STATUS] Updated cell for order ${saleOnlineId}`);
                }

                // When invoice is confirmed, update status to "Đơn hàng" and remove "OK" tags
                if (order.ShowState === 'Đã xác nhận') {
                    updateOrderOnInvoiceConfirm(saleOnlineId, order.ShowState);
                }

                // Uncheck the checkbox in this row
                const checkbox = row.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = false;
                    // Also remove from selectedOrderIds if exists
                    if (window.selectedOrderIds) {
                        window.selectedOrderIds.delete(saleOnlineId);
                        window.selectedOrderIds.delete(String(saleOnlineId));
                    }
                }
            });
        });

        // Update header checkbox and action buttons
        const headerCheckbox = document.querySelector('#ordersTable thead input[type="checkbox"], .employee-section thead input[type="checkbox"]');
        if (headerCheckbox) {
            headerCheckbox.checked = false;
        }

        // Update action buttons visibility
        if (typeof window.updateActionButtons === 'function') {
            window.updateActionButtons();
        }

        console.log('[INVOICE-STATUS] Cleared checkboxes for processed orders');
    }

    // =====================================================
    // HOOK INTO SAVE FUNCTION
    // =====================================================

    /**
     * Hook into showFastSaleResultsModal to store invoice data
     */
    function hookShowFastSaleResultsModal() {
        const original = window.showFastSaleResultsModal;
        if (!original) {
            console.warn('[INVOICE-STATUS] showFastSaleResultsModal not found, will retry...');
            return false;
        }

        window.showFastSaleResultsModal = function (result) {
            // Store invoice data
            InvoiceStatusStore.storeFromApiResult(result);

            // Call original function
            original.call(this, result);

            // Re-render the success table with our version
            setTimeout(() => {
                renderSuccessOrdersTableWithInvoiceStatus();
            }, 50);

            // Update main table cells (realtime update)
            setTimeout(() => {
                updateMainTableInvoiceCells(result);
            }, 100);
        };

        console.log('[INVOICE-STATUS] Hooked showFastSaleResultsModal');
        return true;
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    let _initStarted = false;

    async function init() {
        if (_initStarted) return;
        _initStarted = true;

        console.log('[INVOICE-STATUS] Initializing module v2.1 (with Firestore sync)...');

        // Initialize store (async - loads from localStorage + Firestore)
        await InvoiceStatusStore.init();

        // Save original function
        if (typeof window.printSuccessOrders === 'function' && !window._originalPrintSuccessOrders) {
            window._originalPrintSuccessOrders = window.printSuccessOrders;
        }

        // Override functions
        window.renderSuccessOrdersTable = renderSuccessOrdersTableWithInvoiceStatus;
        window.printSuccessOrders = printSuccessOrdersWithoutAutoSend;

        // Expose functions globally
        window.renderInvoiceStatusCell = renderInvoiceStatusCell;
        window.sendBillFromMainTable = sendBillFromMainTable;
        window.sendBillManually = sendBillManually;
        window.updateMainTableInvoiceCells = updateMainTableInvoiceCells;
        window.InvoiceStatusStore = InvoiceStatusStore;
        window.getStateCodeConfig = getStateCodeConfig;
        window.getShowStateConfig = getShowStateConfig;
        // Preview modal functions
        window.showBillPreviewModal = showBillPreviewModal;
        window.closeBillPreviewSendModal = closeBillPreviewSendModal;
        window.confirmSendBillFromPreview = confirmSendBillFromPreview;
        window.printBillFromPreview = printBillFromPreview;
        window.printAndSendBillFromPreview = printAndSendBillFromPreview;
        // Delete invoice function
        window.deleteInvoiceFromStore = deleteInvoiceFromStore;

        // Hook showFastSaleResultsModal
        if (!hookShowFastSaleResultsModal()) {
            // Retry after delay
            setTimeout(hookShowFastSaleResultsModal, 500);
        }

        console.log('[INVOICE-STATUS] Module initialized successfully');
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init());
    } else {
        init();
    }

})();
