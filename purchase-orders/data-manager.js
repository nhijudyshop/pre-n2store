/**
 * PURCHASE ORDERS MODULE - DATA MANAGER
 * File: data-manager.js
 * Purpose: State management, data loading, caching, and event handling
 */

// ========================================
// DATA MANAGER CLASS
// ========================================
class PurchaseOrderDataManager {
    constructor() {
        // State
        this.orders = [];
        this.currentStatus = null;
        this.lastDoc = null;
        this.hasMore = false;
        this.isLoading = false;
        this.error = null;
        this.currentPage = 1;
        this.totalItems = 0;

        // Statistics
        this.stats = {
            totalOrders: 0,
            totalValue: 0,
            todayOrders: 0,
            todayValue: 0,
            tposSyncRate: 0
        };
        this.statusCounts = {};

        // Filters
        this.filters = {
            startDate: null,
            endDate: null,
            searchTerm: '',
            quickFilter: 'all',
            statusFilter: ''
        };

        // Cache
        this.cache = new Map();
        this.cacheTimeout = 30000; // 30 seconds

        // Event listeners
        this.listeners = new Map();

        // Debounce timer
        this.searchDebounceTimer = null;
        this.searchDebounceDelay = 300;
    }

    // ========================================
    // EVENT SYSTEM
    // ========================================

    /**
     * Register event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);

        // Return unsubscribe function
        return () => {
            this.listeners.get(event)?.delete(callback);
        };
    }

    /**
     * Emit event to all listeners
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[DataManager] Event handler error for ${event}:`, error);
                }
            });
        }
    }

    // ========================================
    // LOADING STATE MANAGEMENT
    // ========================================

    /**
     * Set loading state
     * @param {boolean} loading
     */
    setLoading(loading) {
        this.isLoading = loading;
        this.emit('loadingChange', loading);
    }

    /**
     * Set error state
     * @param {Error|null} error
     */
    setError(error) {
        this.error = error;
        this.emit('errorChange', error);
    }

    // ========================================
    // DATA LOADING
    // ========================================

    /**
     * Load orders by status
     * @param {string} status - Order status
     * @param {boolean} reset - Reset pagination
     * @returns {Promise<void>}
     */
    async loadOrders(status, reset = true) {
        if (this.isLoading) return;

        const service = window.purchaseOrderService;
        const config = window.PurchaseOrderConfig;

        try {
            this.setLoading(true);
            this.setError(null);

            if (reset) {
                this.orders = [];
                this.lastDoc = null;
                this.hasMore = false;
                this.currentPage = 1;
            }

            this.currentStatus = status;

            // Build query options
            const options = {
                lastDoc: this.lastDoc,
                pageSize: config.PAGINATION_CONFIG.pageSize,
                startDate: this.filters.startDate,
                endDate: this.filters.endDate,
                searchTerm: this.filters.searchTerm
            };

            const result = await service.getOrdersByStatus(status, options);

            if (reset) {
                this.orders = result.orders;
            } else {
                this.orders = [...this.orders, ...result.orders];
            }

            this.lastDoc = result.lastDoc;
            this.hasMore = result.hasMore;

            this.emit('ordersChange', this.orders);

        } catch (error) {
            console.error('[DataManager] Load orders failed:', error);
            this.setError(error);
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Load more orders (pagination)
     * @returns {Promise<void>}
     */
    async loadMore() {
        if (!this.hasMore || this.isLoading) return;
        await this.loadOrders(this.currentStatus, false);
    }

    /**
     * Refresh current data
     * @returns {Promise<void>}
     */
    async refresh() {
        await Promise.all([
            this.loadOrders(this.currentStatus, true),
            this.loadStats(),
            this.loadStatusCounts()
        ]);
    }

    /**
     * Load statistics
     * @returns {Promise<void>}
     */
    async loadStats() {
        const service = window.purchaseOrderService;

        try {
            this.stats = await service.getOrderStats();
            this.emit('statsChange', this.stats);
        } catch (error) {
            console.error('[DataManager] Load stats failed:', error);
        }
    }

    /**
     * Load status counts for tabs
     * @returns {Promise<void>}
     */
    async loadStatusCounts() {
        const service = window.purchaseOrderService;

        try {
            this.statusCounts = await service.getStatusCounts();
            this.emit('statusCountsChange', this.statusCounts);
        } catch (error) {
            console.error('[DataManager] Load status counts failed:', error);
        }
    }

    // ========================================
    // FILTER MANAGEMENT
    // ========================================

    /**
     * Set date range filter
     * @param {Date|null} startDate
     * @param {Date|null} endDate
     */
    setDateRange(startDate, endDate) {
        this.filters.startDate = startDate;
        this.filters.endDate = endDate;
        this.emit('filtersChange', this.filters);
        this.loadOrders(this.currentStatus, true);
    }

    /**
     * Set quick filter
     * @param {string} filterType
     */
    setQuickFilter(filterType) {
        const config = window.PurchaseOrderConfig;
        const { startDate, endDate } = config.getDateRangeForQuickFilter(filterType);

        this.filters.quickFilter = filterType;
        this.filters.startDate = startDate;
        this.filters.endDate = endDate;

        this.emit('filtersChange', this.filters);
        this.loadOrders(this.currentStatus, true);
    }

    /**
     * Set search term with debounce
     * @param {string} term
     */
    setSearchTerm(term) {
        this.filters.searchTerm = term;
        this.emit('filtersChange', this.filters);

        // Debounce search
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        this.searchDebounceTimer = setTimeout(() => {
            this.loadOrders(this.currentStatus, true);
        }, this.searchDebounceDelay);
    }

    /**
     * Set status filter
     * @param {string} status - Status to filter by (empty string for all)
     */
    setStatusFilter(status) {
        this.filters.statusFilter = status;
        this.emit('filtersChange', this.filters);

        // If status filter is set, load orders for that status
        // Otherwise reload current tab's orders
        if (status) {
            this.loadOrders(status, true);
        } else {
            this.loadOrders(this.currentStatus, true);
        }
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.filters = {
            startDate: null,
            endDate: null,
            searchTerm: '',
            quickFilter: 'all',
            statusFilter: ''
        };
        this.emit('filtersChange', this.filters);
        this.loadOrders(this.currentStatus, true);
    }

    // ========================================
    // PAGINATION
    // ========================================

    /**
     * Set current page (for client-side pagination)
     * @param {number} page - Page number (1-based)
     */
    setCurrentPage(page) {
        const config = window.PurchaseOrderConfig;
        const pageSize = config.PAGINATION_CONFIG.pageSize;
        const totalPages = Math.ceil(this.orders.length / pageSize);

        if (page < 1) page = 1;
        if (page > totalPages && totalPages > 0) page = totalPages;

        this.currentPage = page;
        this.emit('pageChange', {
            currentPage: this.currentPage,
            totalItems: this.orders.length,
            pageSize
        });
    }

    /**
     * Get current page of orders
     * @returns {Array}
     */
    getCurrentPageOrders() {
        const config = window.PurchaseOrderConfig;
        const pageSize = config.PAGINATION_CONFIG.pageSize;
        const startIndex = (this.currentPage - 1) * pageSize;
        return this.orders.slice(startIndex, startIndex + pageSize);
    }

    // ========================================
    // CRUD OPERATIONS
    // ========================================

    /**
     * Create new order
     * @param {Object} orderData
     * @returns {Promise<string>} New order ID
     */
    async createOrder(orderData) {
        const service = window.purchaseOrderService;

        try {
            this.setLoading(true);
            const orderId = await service.createOrder(orderData);

            // Refresh data
            await this.refresh();

            this.emit('orderCreated', orderId);
            return orderId;
        } catch (error) {
            this.setError(error);
            throw error;
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Update order
     * @param {string} orderId
     * @param {Object} updateData
     * @returns {Promise<void>}
     */
    async updateOrder(orderId, updateData) {
        const service = window.purchaseOrderService;

        try {
            this.setLoading(true);
            await service.updateOrder(orderId, updateData);

            // Refresh data
            await this.refresh();

            this.emit('orderUpdated', orderId);
        } catch (error) {
            this.setError(error);
            throw error;
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Update order status
     * @param {string} orderId
     * @param {string} newStatus
     * @param {string} reason
     * @returns {Promise<void>}
     */
    async updateOrderStatus(orderId, newStatus, reason = '') {
        const service = window.purchaseOrderService;

        try {
            this.setLoading(true);
            await service.updateOrderStatus(orderId, newStatus, reason);

            // Refresh data
            await this.refresh();

            this.emit('orderStatusUpdated', { orderId, newStatus });
        } catch (error) {
            this.setError(error);
            throw error;
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Delete order
     * @param {string} orderId
     * @returns {Promise<void>}
     */
    async deleteOrder(orderId) {
        const service = window.purchaseOrderService;

        try {
            this.setLoading(true);
            await service.deleteOrder(orderId);

            // Remove from local state immediately
            this.orders = this.orders.filter(o => o.id !== orderId);
            this.emit('ordersChange', this.orders);

            // Refresh counts
            await this.loadStatusCounts();
            await this.loadStats();

            this.emit('orderDeleted', orderId);
        } catch (error) {
            this.setError(error);
            throw error;
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Copy order
     * @param {string} sourceOrderId
     * @returns {Promise<string>} New order ID
     */
    async copyOrder(sourceOrderId) {
        const service = window.purchaseOrderService;

        try {
            this.setLoading(true);
            const newOrderId = await service.copyOrder(sourceOrderId);

            // Refresh data
            await this.refresh();

            this.emit('orderCopied', { sourceOrderId, newOrderId });
            return newOrderId;
        } catch (error) {
            this.setError(error);
            throw error;
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Get order by ID (with cache)
     * @param {string} orderId
     * @returns {Promise<Object|null>}
     */
    async getOrder(orderId) {
        // Check local state first
        const localOrder = this.orders.find(o => o.id === orderId);
        if (localOrder) return localOrder;

        // Check cache
        const cacheKey = `order_${orderId}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        // Fetch from service
        const service = window.purchaseOrderService;
        const order = await service.getOrderById(orderId);

        // Update cache
        if (order) {
            this.cache.set(cacheKey, {
                data: order,
                timestamp: Date.now()
            });
        }

        return order;
    }

    // ========================================
    // BATCH OPERATIONS
    // ========================================

    /**
     * Delete multiple orders
     * @param {Array<string>} orderIds
     * @returns {Promise<Object>} { success: number, failed: number }
     */
    async deleteOrders(orderIds) {
        const results = { success: 0, failed: 0 };

        for (const orderId of orderIds) {
            try {
                await this.deleteOrder(orderId);
                results.success++;
            } catch (error) {
                results.failed++;
                console.error(`[DataManager] Failed to delete order ${orderId}:`, error);
            }
        }

        return results;
    }

    /**
     * Update status for multiple orders
     * @param {Array<string>} orderIds
     * @param {string} newStatus
     * @returns {Promise<Object>} { success: number, failed: number }
     */
    async updateOrdersStatus(orderIds, newStatus) {
        const results = { success: 0, failed: 0 };

        for (const orderId of orderIds) {
            try {
                await this.updateOrderStatus(orderId, newStatus);
                results.success++;
            } catch (error) {
                results.failed++;
                console.error(`[DataManager] Failed to update status for order ${orderId}:`, error);
            }
        }

        return results;
    }

    // ========================================
    // SELECTION MANAGEMENT
    // ========================================

    /**
     * Selected order IDs
     */
    selectedIds = new Set();

    /**
     * Toggle order selection
     * @param {string} orderId
     */
    toggleSelection(orderId) {
        if (this.selectedIds.has(orderId)) {
            this.selectedIds.delete(orderId);
        } else {
            this.selectedIds.add(orderId);
        }
        this.emit('selectionChange', Array.from(this.selectedIds));
    }

    /**
     * Select all current orders
     */
    selectAll() {
        this.selectedIds = new Set(this.orders.map(o => o.id));
        this.emit('selectionChange', Array.from(this.selectedIds));
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedIds.clear();
        this.emit('selectionChange', []);
    }

    /**
     * Check if order is selected
     * @param {string} orderId
     * @returns {boolean}
     */
    isSelected(orderId) {
        return this.selectedIds.has(orderId);
    }

    /**
     * Get selected orders
     * @returns {Array}
     */
    getSelectedOrders() {
        return this.orders.filter(o => this.selectedIds.has(o.id));
    }

    // ========================================
    // UTILITY
    // ========================================

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Reset state
     */
    reset() {
        this.orders = [];
        this.currentStatus = null;
        this.lastDoc = null;
        this.hasMore = false;
        this.isLoading = false;
        this.error = null;
        this.currentPage = 1;
        this.totalItems = 0;
        this.filters = {
            startDate: null,
            endDate: null,
            searchTerm: '',
            quickFilter: 'all',
            statusFilter: ''
        };
        this.selectedIds.clear();
        this.clearCache();
    }
}

// ========================================
// EXPORT SINGLETON INSTANCE
// ========================================
window.purchaseOrderDataManager = new PurchaseOrderDataManager();

console.log('[Purchase Orders] Data manager loaded successfully');
