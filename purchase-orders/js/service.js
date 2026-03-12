/**
 * PURCHASE ORDERS MODULE - FIREBASE SERVICE LAYER
 * File: service.js
 * Purpose: CRUD operations for purchase orders using Firestore
 */

// ========================================
// FIREBASE SERVICE CLASS
// ========================================
class PurchaseOrderService {
    constructor() {
        this.db = null;
        this.storage = null;
        this.currentUser = null;
        this.initialized = false;
        this.COLLECTION = 'purchase_orders';
        this.PAGE_SIZE = 20;
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    /**
     * Initialize Firebase connection
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Check if Firebase is loaded
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK not loaded');
            }

            // Check if Firebase is already initialized
            if (!firebase.apps.length) {
                // Initialize Firebase using global config
                const config = window.FIREBASE_CONFIG;
                if (!config) {
                    throw new Error('Firebase config not found');
                }
                firebase.initializeApp(config);
            }

            this.db = firebase.firestore();
            this.storage = firebase.storage();

            // Get current user from shared authManager
            if (window.authManager) {
                const authState = window.authManager.getAuthState?.() || window.authManager.getUserInfo?.();
                if (authState) {
                    this.currentUser = {
                        uid: authState.userId || authState.userType || 'anonymous',
                        displayName: authState.userName || authState.userType?.split('-')[0] || 'User',
                        email: authState.email || ''
                    };
                }
            }

            this.initialized = true;
            console.log('[PurchaseOrderService] Initialized successfully');
        } catch (error) {
            console.error('[PurchaseOrderService] Initialization failed:', error);
            throw new window.PurchaseOrderValidation.ServiceException(
                'INIT_FAILED',
                'Không thể kết nối đến cơ sở dữ liệu. Vui lòng tải lại trang.'
            );
        }
    }

    /**
     * Set current user
     * @param {Object} user - User data { uid, displayName, email }
     */
    setCurrentUser(user) {
        this.currentUser = user;
    }

    /**
     * Get user snapshot for audit trail
     * @returns {Object}
     */
    getUserSnapshot() {
        if (!this.currentUser) {
            return {
                uid: 'anonymous',
                displayName: 'Anonymous',
                email: ''
            };
        }

        return {
            uid: this.currentUser.uid || this.currentUser.id,
            displayName: this.currentUser.displayName || this.currentUser.name || 'Unknown',
            email: this.currentUser.email || ''
        };
    }

    // ========================================
    // CREATE OPERATIONS
    // ========================================

    /**
     * Create new purchase order
     * @param {Object} orderData - Order data without id and timestamps
     * @returns {Promise<string>} Document ID
     */
    async createOrder(orderData) {
        await this.initialize();

        const config = window.PurchaseOrderConfig;
        const validation = window.PurchaseOrderValidation;

        try {
            // Validate order data
            const validationResult = validation.validateOrder(orderData);
            if (!validationResult.isValid) {
                throw new validation.ValidationException(validationResult.errors);
            }

            // Calculate totals
            const totalAmount = this.calculateTotalAmount(orderData.items);
            const finalAmount = totalAmount - (orderData.discountAmount || 0) + (orderData.shippingFee || 0);

            // Generate order number
            const orderNumber = await this.generateOrderNumber();

            // Get user snapshot
            const userSnapshot = this.getUserSnapshot();

            // Prepare document data
            const docData = {
                orderNumber,
                orderType: orderData.orderType || 'NJD SHOP',
                orderDate: orderData.orderDate || firebase.firestore.Timestamp.now(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),

                status: orderData.status || config.OrderStatus.DRAFT,
                statusHistory: [{
                    from: null,
                    to: orderData.status || config.OrderStatus.DRAFT,
                    changedAt: firebase.firestore.Timestamp.now(),
                    changedBy: userSnapshot
                }],

                supplier: orderData.supplier || null,

                invoiceAmount: orderData.invoiceAmount || 0,
                totalAmount,
                discountAmount: orderData.discountAmount || 0,
                shippingFee: orderData.shippingFee || 0,
                finalAmount,

                invoiceImages: this.filterFirebaseUrls(orderData.invoiceImages || []),
                notes: orderData.notes || '',

                items: this.prepareItems(orderData.items),

                totalItems: orderData.items.length,
                totalQuantity: orderData.items.reduce((sum, item) => sum + (item.quantity || 0), 0),

                createdBy: userSnapshot,
                lastModifiedBy: userSnapshot
            };

            // Check document size before writing (Firestore limit: 1MB)
            const estimatedSize = new Blob([JSON.stringify(docData)]).size;
            if (estimatedSize > 900000) {
                console.error(`[PurchaseOrderService] Document too large: ${(estimatedSize / 1024).toFixed(0)}KB`);
                throw new validation.ServiceException('DOC_TOO_LARGE',
                    `Dữ liệu đơn hàng quá lớn (${(estimatedSize / 1024).toFixed(0)}KB). Hãy giảm số lượng hoặc kích thước ảnh.`);
            }
            console.log(`[PurchaseOrderService] Document size: ${(estimatedSize / 1024).toFixed(0)}KB`);

            // Create document
            const docRef = await this.db.collection(this.COLLECTION).add(docData);

            console.log('[PurchaseOrderService] Order created:', docRef.id);
            return docRef.id;
        } catch (error) {
            if (error instanceof validation.ValidationException) throw error;
            console.error('[PurchaseOrderService] Create failed:', error);
            throw new validation.ServiceException('CREATE_FAILED', 'Không thể tạo đơn hàng. Vui lòng thử lại.');
        }
    }

    /**
     * Prepare items with calculated subtotals
     * @param {Array} items - Array of order items
     * @returns {Array}
     */
    prepareItems(items) {
        const config = window.PurchaseOrderConfig;

        return items.map((item, index) => {
            const prepared = {
                id: item.id || config.generateUUID(),
                position: index + 1,
                productCode: item.productCode || '',
                productName: item.productName || '',
                variant: item.variant || '',
                selectedAttributeValueIds: item.selectedAttributeValueIds || [],
                productImages: this.filterFirebaseUrls(item.productImages || []),
                priceImages: this.filterFirebaseUrls(item.priceImages || []),
                purchasePrice: item.purchasePrice || 0,
                sellingPrice: item.sellingPrice || 0,
                quantity: item.quantity || 1,
                subtotal: (item.purchasePrice || 0) * (item.quantity || 1),
                notes: item.notes || '',
                tposSyncStatus: item.tposSyncStatus || null,
                tposProductId: item.tposProductId || null,
                tposProductTmplId: item.tposProductTmplId || null,
                tposSynced: item.tposSynced || false
            };
            console.log(`[PrepareItems] Item ${index + 1}: variant="${prepared.variant}", attrIds=${prepared.selectedAttributeValueIds.length}`);
            return prepared;
        });
    }

    /**
     * Calculate total amount from items
     * @param {Array} items - Array of order items
     * @returns {number}
     */
    /**
     * Filter out base64 data URLs, keep only Firebase Storage URLs
     * Safety net to prevent oversized Firestore documents
     */
    filterFirebaseUrls(urls) {
        if (!Array.isArray(urls)) return [];
        const filtered = urls.filter(url => typeof url === 'string' && !url.startsWith('data:'));
        if (filtered.length < urls.length) {
            console.warn(`[PurchaseOrderService] Stripped ${urls.length - filtered.length} data URL(s) — images not uploaded`);
        }
        return filtered;
    }

    calculateTotalAmount(items) {
        if (!items || !Array.isArray(items)) return 0;
        return items.reduce((sum, item) => {
            return sum + (item.purchasePrice || 0) * (item.quantity || 1);
        }, 0);
    }

    /**
     * Generate order number for today
     * @returns {Promise<string>}
     */
    async generateOrderNumber() {
        const config = window.PurchaseOrderConfig;
        const today = new Date();
        const datePrefix = this.formatDateForOrderNumber(today);

        try {
            // Query today's orders to get the next sequence
            const startOfDay = new Date(today);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(today);
            endOfDay.setHours(23, 59, 59, 999);

            const snapshot = await this.db.collection(this.COLLECTION)
                .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(startOfDay))
                .where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(endOfDay))
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();

            let sequence = 1;
            if (!snapshot.empty) {
                const lastOrder = snapshot.docs[0].data();
                if (lastOrder.orderNumber) {
                    const parts = lastOrder.orderNumber.split('-');
                    if (parts.length >= 3) {
                        const lastSeq = parseInt(parts[2], 10);
                        if (!isNaN(lastSeq)) {
                            sequence = lastSeq + 1;
                        }
                    }
                }
            }

            return `PO-${datePrefix}-${String(sequence).padStart(3, '0')}`;
        } catch (error) {
            // Fallback with timestamp
            console.warn('[PurchaseOrderService] Order number generation fallback:', error);
            return `PO-${datePrefix}-${Date.now().toString().slice(-4)}`;
        }
    }

    /**
     * Format date for order number
     * @param {Date} date
     * @returns {string}
     */
    formatDateForOrderNumber(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    // ========================================
    // READ OPERATIONS
    // ========================================

    /**
     * Get orders by status with pagination
     * @param {string|Array} status - Order status or array of statuses
     * @param {Object} options - Query options
     * @returns {Promise<Object>} { orders, lastDoc, hasMore }
     */
    async getOrdersByStatus(status, options = {}) {
        await this.initialize();

        const {
            lastDoc = null,
            pageSize = this.PAGE_SIZE,
            startDate = null,
            endDate = null,
            searchTerm = null,
            orderBy = 'createdAt',
            orderDirection = 'desc'
        } = options;

        try {
            let query = this.db.collection(this.COLLECTION);

            // Filter by status
            if (status) {
                if (Array.isArray(status)) {
                    query = query.where('status', 'in', status);
                } else {
                    query = query.where('status', '==', status);
                }
            }

            // Filter by date range
            if (startDate) {
                const start = firebase.firestore.Timestamp.fromDate(startDate);
                query = query.where('orderDate', '>=', start);
            }
            if (endDate) {
                const end = firebase.firestore.Timestamp.fromDate(endDate);
                query = query.where('orderDate', '<=', end);
            }

            // Order and limit
            query = query.orderBy(orderBy, orderDirection).limit(pageSize + 1);

            // Pagination
            if (lastDoc) {
                query = query.startAfter(lastDoc);
            }

            const snapshot = await query.get();
            const docs = snapshot.docs;
            const hasMore = docs.length > pageSize;

            let orders = docs.slice(0, pageSize).map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Client-side search filter (Firestore doesn't support full-text search)
            if (searchTerm) {
                const search = searchTerm.toLowerCase();
                orders = orders.filter(order => {
                    // Search in supplier
                    if (order.supplier?.code?.toLowerCase().includes(search)) return true;
                    if (order.supplier?.name?.toLowerCase().includes(search)) return true;

                    // Search in order number
                    if (order.orderNumber?.toLowerCase().includes(search)) return true;

                    // Search in items
                    if (order.items?.some(item =>
                        item.productCode?.toLowerCase().includes(search) ||
                        item.productName?.toLowerCase().includes(search)
                    )) return true;

                    return false;
                });
            }

            return {
                orders,
                lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageSize - 1)] : null,
                hasMore
            };
        } catch (error) {
            console.error('[PurchaseOrderService] Fetch failed:', error);
            throw new window.PurchaseOrderValidation.ServiceException(
                'FETCH_FAILED',
                'Không thể tải danh sách đơn hàng. Vui lòng thử lại.'
            );
        }
    }

    /**
     * Get single order by ID
     * @param {string} orderId - Document ID
     * @returns {Promise<Object|null>}
     */
    async getOrderById(orderId) {
        await this.initialize();

        try {
            const docRef = this.db.collection(this.COLLECTION).doc(orderId);
            const docSnap = await docRef.get();

            if (!docSnap.exists) {
                return null;
            }

            return {
                id: docSnap.id,
                ...docSnap.data()
            };
        } catch (error) {
            console.error('[PurchaseOrderService] Get order failed:', error);
            throw new window.PurchaseOrderValidation.ServiceException(
                'FETCH_FAILED',
                'Không thể tải thông tin đơn hàng.'
            );
        }
    }

    /**
     * Get order statistics
     * @returns {Promise<Object>}
     */
    async getOrderStats() {
        await this.initialize();

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = firebase.firestore.Timestamp.fromDate(today);

            // Get all non-cancelled orders
            const allOrdersSnapshot = await this.db.collection(this.COLLECTION)
                .where('status', '!=', 'CANCELLED')
                .get();

            // Get today's orders
            const todayOrdersSnapshot = await this.db.collection(this.COLLECTION)
                .where('createdAt', '>=', todayTimestamp)
                .get();

            // Calculate totals
            let totalOrders = 0;
            let totalValue = 0;
            let todayOrders = 0;
            let todayValue = 0;
            let tposSyncedCount = 0;

            allOrdersSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.status !== 'CANCELLED') {
                    totalOrders++;
                    totalValue += data.finalAmount || 0;

                    // Check TPOS sync
                    if (data.items?.every(item => item.tposSyncStatus === 'success')) {
                        tposSyncedCount++;
                    }
                }
            });

            todayOrdersSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.status !== 'CANCELLED') {
                    todayOrders++;
                    todayValue += data.finalAmount || 0;
                }
            });

            return {
                totalOrders,
                totalValue,
                todayOrders,
                todayValue,
                tposSyncRate: totalOrders > 0 ? Math.round((tposSyncedCount / totalOrders) * 100) : 0
            };
        } catch (error) {
            console.error('[PurchaseOrderService] Stats failed:', error);
            return {
                totalOrders: 0,
                totalValue: 0,
                todayOrders: 0,
                todayValue: 0,
                tposSyncRate: 0
            };
        }
    }

    /**
     * Get counts by status for tabs
     * @returns {Promise<Object>}
     */
    async getStatusCounts() {
        await this.initialize();

        const config = window.PurchaseOrderConfig;

        try {
            const counts = {};

            // Initialize all statuses with 0
            Object.values(config.OrderStatus).forEach(status => {
                counts[status] = 0;
            });

            const snapshot = await this.db.collection(this.COLLECTION).get();

            snapshot.docs.forEach(doc => {
                const status = doc.data().status;
                if (counts[status] !== undefined) {
                    counts[status]++;
                }
            });

            return counts;
        } catch (error) {
            console.error('[PurchaseOrderService] Count failed:', error);
            return {};
        }
    }

    // ========================================
    // UPDATE OPERATIONS
    // ========================================

    /**
     * Update order
     * @param {string} orderId - Document ID
     * @param {Object} updateData - Fields to update
     * @returns {Promise<void>}
     */
    async updateOrder(orderId, updateData) {
        await this.initialize();

        const validation = window.PurchaseOrderValidation;

        try {
            const docRef = this.db.collection(this.COLLECTION).doc(orderId);
            const docSnap = await docRef.get();

            if (!docSnap.exists) {
                throw new validation.ServiceException('NOT_FOUND', 'Đơn hàng không tồn tại.');
            }

            const currentData = docSnap.data();

            // Check if editable
            const editCheck = validation.validateCanEdit(currentData);
            if (!editCheck.canEdit) {
                throw new validation.ServiceException('EDIT_FORBIDDEN', editCheck.error);
            }

            // Calculate totals if items are updated
            let calculatedFields = {};
            if (updateData.items) {
                const totalAmount = this.calculateTotalAmount(updateData.items);
                const discountAmount = updateData.discountAmount ?? currentData.discountAmount ?? 0;
                const shippingFee = updateData.shippingFee ?? currentData.shippingFee ?? 0;
                const finalAmount = totalAmount - discountAmount + shippingFee;

                calculatedFields = {
                    totalAmount,
                    discountAmount,
                    shippingFee,
                    finalAmount,
                    totalItems: updateData.items.length,
                    totalQuantity: updateData.items.reduce((sum, item) => sum + (item.quantity || 0), 0),
                    items: this.prepareItems(updateData.items)
                };
            }

            // Strip any remaining data URLs from invoice images
            if (updateData.invoiceImages) {
                updateData.invoiceImages = this.filterFirebaseUrls(updateData.invoiceImages);
            }

            // Prepare update
            const userSnapshot = this.getUserSnapshot();
            const update = {
                ...updateData,
                ...calculatedFields,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastModifiedBy: userSnapshot
            };

            // Remove undefined values
            Object.keys(update).forEach(key => {
                if (update[key] === undefined) {
                    delete update[key];
                }
            });

            // Ensure notes is included
            if (updateData.notes !== undefined) {
                update.notes = updateData.notes;
            }

            console.log('[PurchaseOrderService] Saving update:', {
                discountAmount: update.discountAmount,
                shippingFee: update.shippingFee,
                notes: update.notes,
                finalAmount: update.finalAmount,
                totalAmount: update.totalAmount,
                itemCount: (update.items || []).length
            });

            await docRef.update(update);

            console.log('[PurchaseOrderService] Order updated:', orderId);
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Update failed:', error);
            throw new validation.ServiceException('UPDATE_FAILED', 'Không thể cập nhật đơn hàng. Vui lòng thử lại.');
        }
    }

    /**
     * Update order status
     * @param {string} orderId - Document ID
     * @param {string} newStatus - Target status
     * @param {string} reason - Optional reason for status change
     * @returns {Promise<void>}
     */
    async updateOrderStatus(orderId, newStatus, reason = '') {
        await this.initialize();

        const config = window.PurchaseOrderConfig;
        const validation = window.PurchaseOrderValidation;

        try {
            const docRef = this.db.collection(this.COLLECTION).doc(orderId);
            const docSnap = await docRef.get();

            if (!docSnap.exists) {
                throw new validation.ServiceException('NOT_FOUND', 'Đơn hàng không tồn tại.');
            }

            const currentData = docSnap.data();
            const currentStatus = currentData.status;

            // Validate transition
            const transitionCheck = validation.validateStatusTransition(currentStatus, newStatus);
            if (!transitionCheck.isValid) {
                throw new validation.ServiceException('INVALID_TRANSITION', transitionCheck.error);
            }

            // Prepare status change record
            const userSnapshot = this.getUserSnapshot();
            const statusChange = {
                from: currentStatus,
                to: newStatus,
                changedAt: firebase.firestore.Timestamp.now(),
                changedBy: userSnapshot,
                reason: reason || null
            };

            // Update document
            await docRef.update({
                status: newStatus,
                statusHistory: firebase.firestore.FieldValue.arrayUnion(statusChange),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastModifiedBy: userSnapshot
            });

            console.log('[PurchaseOrderService] Status updated:', orderId, currentStatus, '->', newStatus);
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Status update failed:', error);
            throw new validation.ServiceException('UPDATE_FAILED', 'Không thể cập nhật trạng thái. Vui lòng thử lại.');
        }
    }

    // ========================================
    // DELETE OPERATIONS
    // ========================================

    /**
     * Delete order
     * @param {string} orderId - Document ID
     * @returns {Promise<void>}
     */
    async deleteOrder(orderId) {
        await this.initialize();

        const validation = window.PurchaseOrderValidation;

        try {
            const docRef = this.db.collection(this.COLLECTION).doc(orderId);
            const docSnap = await docRef.get();

            if (!docSnap.exists) {
                throw new validation.ServiceException('NOT_FOUND', 'Đơn hàng không tồn tại.');
            }

            const currentData = docSnap.data();

            // Check if deletable
            const deleteCheck = validation.validateCanDelete(currentData);
            if (!deleteCheck.canDelete) {
                throw new validation.ServiceException('DELETE_FORBIDDEN', deleteCheck.error);
            }

            await docRef.delete();

            console.log('[PurchaseOrderService] Order deleted:', orderId);
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Delete failed:', error);
            throw new validation.ServiceException('DELETE_FAILED', 'Không thể xóa đơn hàng. Vui lòng thử lại.');
        }
    }

    // ========================================
    // IMAGE CLEANUP (runs daily on page load)
    // ========================================

    /**
     * Delete a file from Firebase Storage by its download URL.
     * @param {string} downloadUrl - Firebase Storage download URL
     */
    async deleteStorageFile(downloadUrl) {
        try {
            const ref = this.storage.refFromURL(downloadUrl);
            await ref.delete();
            return true;
        } catch (error) {
            // File may already be deleted or URL invalid
            if (error.code !== 'storage/object-not-found') {
                console.warn('[Cleanup] Failed to delete:', downloadUrl, error.message);
            }
            return false;
        }
    }

    /**
     * Clean up Firebase Storage images for orders older than 10 days
     * in AWAITING_PURCHASE / AWAITING_DELIVERY statuses.
     * Replaces productImages with tposImageUrl to free storage space.
     * Runs once per day (tracked via localStorage).
     */
    async cleanupOldFirebaseImages() {
        const STORAGE_KEY = 'po_image_cleanup_last_run';
        const DAYS_THRESHOLD = 10;

        try {
            // Check if already ran today
            const lastRun = localStorage.getItem(STORAGE_KEY);
            const today = new Date().toDateString();
            if (lastRun === today) return;

            console.log('[Cleanup] Starting daily Firebase image cleanup...');

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - DAYS_THRESHOLD);
            const cutoffTimestamp = firebase.firestore.Timestamp.fromDate(cutoffDate);

            // Query orders in target statuses created before cutoff
            const statuses = ['AWAITING_PURCHASE', 'AWAITING_DELIVERY'];
            const snapshot = await this.db.collection(this.COLLECTION)
                .where('status', 'in', statuses)
                .where('createdAt', '<=', cutoffTimestamp)
                .get();

            if (snapshot.empty) {
                console.log('[Cleanup] No old orders to clean up');
                localStorage.setItem(STORAGE_KEY, today);
                return;
            }

            let totalDeleted = 0;
            let totalOrders = 0;

            for (const doc of snapshot.docs) {
                const order = doc.data();
                const items = order.items || [];
                let orderChanged = false;

                for (const item of items) {
                    // Skip if no Firebase images to clean
                    if (!item.productImages || item.productImages.length === 0) continue;
                    // Skip if no tposImageUrl fallback
                    if (!item.tposImageUrl) continue;

                    // Delete Firebase Storage files
                    const firebaseUrls = item.productImages.filter(url =>
                        typeof url === 'string' && url.includes('firebasestorage.googleapis.com')
                    );

                    for (const url of firebaseUrls) {
                        const deleted = await this.deleteStorageFile(url);
                        if (deleted) totalDeleted++;
                    }

                    // Replace with tposImageUrl
                    item.productImages = [];
                    orderChanged = true;
                }

                if (orderChanged) {
                    await doc.ref.update({
                        items,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    totalOrders++;
                }
            }

            localStorage.setItem(STORAGE_KEY, today);
            console.log(`[Cleanup] Done. Deleted ${totalDeleted} files from ${totalOrders} orders.`);
        } catch (error) {
            console.error('[Cleanup] Image cleanup failed:', error);
            // Don't throw - cleanup is non-critical
        }
    }

    // ========================================
    // COPY OPERATIONS
    // ========================================

    /**
     * Copy order (create draft from existing order)
     * productImages are preserved as Firebase URLs (no re-upload needed).
     * @param {string} sourceOrderId - Source document ID
     * @returns {Promise<string>} New document ID
     */
    async copyOrder(sourceOrderId) {
        await this.initialize();

        const config = window.PurchaseOrderConfig;
        const validation = window.PurchaseOrderValidation;

        try {
            const sourceOrder = await this.getOrderById(sourceOrderId);

            if (!sourceOrder) {
                throw new validation.ServiceException('NOT_FOUND', 'Đơn hàng nguồn không tồn tại.');
            }

            // Clone items with new IDs and cleared TPOS sync status
            // Restore productCode to parentProductCode if it was changed by TPOS sync
            const newItems = sourceOrder.items.map(item => ({
                ...item,
                id: config.generateUUID(),
                productCode: item.parentProductCode || item.productCode,
                parentProductCode: null,
                tposSyncStatus: null,
                tposProductId: null,
                tposProductTmplId: null,
                tposSynced: false,
                tposSyncError: null,
                tposImageUrl: null
            }));

            // Create new draft from source
            const newOrderData = {
                orderDate: firebase.firestore.Timestamp.now(),
                status: config.OrderStatus.DRAFT,
                supplier: sourceOrder.supplier,
                invoiceAmount: 0,
                discountAmount: 0,
                shippingFee: 0,
                invoiceImages: [],
                notes: sourceOrder.notes ? `[Sao chép từ ${sourceOrder.orderNumber}] ${sourceOrder.notes}` : `Sao chép từ ${sourceOrder.orderNumber}`,
                items: newItems
            };

            const newOrderId = await this.createOrder(newOrderData);

            console.log('[PurchaseOrderService] Order copied:', sourceOrderId, '->', newOrderId);
            return newOrderId;
        } catch (error) {
            if (error instanceof validation.ServiceException) throw error;
            console.error('[PurchaseOrderService] Copy failed:', error);
            throw new validation.ServiceException('COPY_FAILED', 'Không thể sao chép đơn hàng. Vui lòng thử lại.');
        }
    }

    // ========================================
    // IMAGE UPLOAD
    // ========================================

    /**
     * Upload image to Firebase Storage
     * @param {File} file - File to upload
     * @param {string} folder - Storage folder (e.g., 'invoices', 'products')
     * @returns {Promise<string>} Download URL
     */
    async uploadImage(file, folder = 'purchase-orders') {
        await this.initialize();

        try {
            const timestamp = Date.now();
            const extension = file.name.split('.').pop() || 'jpg';
            const filename = `${folder}/${timestamp}_${Math.random().toString(36).substring(7)}.${extension}`;

            const ref = this.storage.ref().child(filename);

            // Upload file
            const snapshot = await ref.put(file);

            // Get download URL
            const downloadURL = await snapshot.ref.getDownloadURL();

            console.log('[PurchaseOrderService] Image uploaded:', downloadURL);
            return downloadURL;
        } catch (error) {
            console.error('[PurchaseOrderService] Upload failed:', error);
            throw new window.PurchaseOrderValidation.ServiceException(
                'UPLOAD_FAILED',
                'Không thể tải lên hình ảnh. Vui lòng thử lại.'
            );
        }
    }

    /**
     * Upload multiple images
     * @param {FileList|Array} files - Files to upload
     * @param {string} folder - Storage folder
     * @returns {Promise<Array>} Array of download URLs
     */
    async uploadImages(files, folder = 'purchase-orders') {
        const urls = [];

        for (const file of files) {
            const url = await this.uploadImage(file, folder);
            urls.push(url);
        }

        return urls;
    }
}

// ========================================
// EXPORT SINGLETON INSTANCE
// ========================================
window.purchaseOrderService = new PurchaseOrderService();

console.log('[Purchase Orders] Service layer loaded successfully');
