/**
 * PURCHASE ORDERS MODULE - MAIN CONTROLLER
 * File: main.js
 * Purpose: Initialize and coordinate all components
 */

// ========================================
// MAIN CONTROLLER CLASS
// ========================================
class PurchaseOrderController {
    constructor() {
        this.initialized = false;
        this.currentTab = null;

        // Component references
        this.config = null;
        this.service = null;
        this.dataManager = null;
        this.ui = null;
        this.tableRenderer = null;
        this.formModal = null;

        // DOM elements
        this.elements = {};

        // Unsubscribe functions
        this.unsubscribers = [];
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    /**
     * Initialize the module
     */
    async init() {
        if (this.initialized) return;

        console.log('[PurchaseOrderController] Initializing...');

        try {
            // Get component references
            this.config = window.PurchaseOrderConfig;
            this.service = window.purchaseOrderService;
            this.dataManager = window.purchaseOrderDataManager;
            this.ui = window.purchaseOrderUI;
            this.tableRenderer = window.purchaseOrderTableRenderer;
            this.formModal = window.purchaseOrderFormModal;

            // Cache DOM elements
            this.cacheElements();

            // Initialize service
            await this.service.initialize();

            // Initialize table renderer
            this.tableRenderer.init(this.elements.tableContainer, {
                onEdit: (orderId) => this.handleEditOrder(orderId),
                onExport: (orderId) => this.handleExportOrder(orderId),
                onCopy: (orderId) => this.handleCopyOrder(orderId),
                onDelete: (orderId) => this.handleDeleteOrder(orderId),
                onSelect: (orderId, selected) => this.handleSelectOrder(orderId, selected),
                onRowClick: (orderId) => this.handleRowClick(orderId),
                onViewInvoice: (images) => this.handleViewInvoice(images),
                onViewImages: (itemId) => this.handleViewImages(itemId)
            });

            // Subscribe to data manager events
            this.subscribeToEvents();

            // Bind UI events
            this.bindEvents();

            // Load initial data
            await this.loadInitialData();

            this.initialized = true;
            console.log('[PurchaseOrderController] Initialized successfully');

        } catch (error) {
            console.error('[PurchaseOrderController] Initialization failed:', error);
            this.ui.showToast('Không thể khởi tạo module. Vui lòng tải lại trang.', 'error');
        }
    }

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // Header
            createBtn: document.getElementById('btnCreateOrder'),

            // Summary cards
            summaryContainer: document.getElementById('summaryCards'),

            // Tabs
            tabsContainer: document.getElementById('tabsContainer'),

            // Filters
            filterContainer: document.getElementById('filterBar'),

            // Table
            tableContainer: document.getElementById('tableContainer'),

            // Pagination
            paginationContainer: document.getElementById('pagination'),

            // Loading
            loadingOverlay: document.getElementById('loadingOverlay')
        };
    }

    /**
     * Subscribe to data manager events
     */
    subscribeToEvents() {
        // Orders changed
        this.unsubscribers.push(
            this.dataManager.on('ordersChange', (orders) => {
                this.renderTable(orders);
            })
        );

        // Stats changed
        this.unsubscribers.push(
            this.dataManager.on('statsChange', (stats) => {
                this.ui.renderSummaryCards(stats, this.elements.summaryContainer);
            })
        );

        // Status counts changed
        this.unsubscribers.push(
            this.dataManager.on('statusCountsChange', (counts) => {
                this.ui.renderTabs(this.currentTab, counts, this.elements.tabsContainer, (status) => {
                    this.handleTabChange(status);
                });
            })
        );

        // Loading changed
        this.unsubscribers.push(
            this.dataManager.on('loadingChange', (loading) => {
                this.toggleLoading(loading);
            })
        );

        // Error changed
        this.unsubscribers.push(
            this.dataManager.on('errorChange', (error) => {
                if (error) {
                    this.ui.renderErrorState(error, this.elements.tableContainer, () => {
                        this.dataManager.refresh();
                    });
                }
            })
        );

        // Selection changed
        this.unsubscribers.push(
            this.dataManager.on('selectionChange', (selectedIds) => {
                this.updateSelectionUI(selectedIds);
            })
        );

        // Page changed
        this.unsubscribers.push(
            this.dataManager.on('pageChange', (paginationInfo) => {
                this.renderPagination(paginationInfo);
                this.renderTableForCurrentPage();
            })
        );
    }

    /**
     * Bind UI event handlers
     */
    bindEvents() {
        // Create button
        this.elements.createBtn?.addEventListener('click', () => {
            this.handleCreateOrder();
        });

        // Refresh shortcut (F5 or Ctrl+R)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                this.dataManager.refresh();
            }
        });
    }

    /**
     * Load initial data
     */
    async loadInitialData() {
        // Show loading
        this.ui.renderSummaryCardsSkeleton(this.elements.summaryContainer);
        this.tableRenderer.renderSkeleton();

        // Set default tab
        this.currentTab = this.config.OrderStatus.DRAFT;

        // Load data in parallel
        await Promise.all([
            this.dataManager.loadStats(),
            this.dataManager.loadStatusCounts(),
            this.dataManager.loadOrders(this.currentTab, true)
        ]);

        // Render filter bar
        this.ui.renderFilterBar(this.dataManager.filters, this.elements.filterContainer, {
            onDateChange: (start, end) => this.dataManager.setDateRange(start, end),
            onQuickFilter: (filter) => this.dataManager.setQuickFilter(filter),
            onSearch: (term) => this.dataManager.setSearchTerm(term),
            onStatusFilter: (status) => this.dataManager.setStatusFilter(status),
            onClear: () => this.dataManager.clearFilters()
        });
    }

    // ========================================
    // RENDER FUNCTIONS
    // ========================================

    /**
     * Render orders table
     * @param {Array} orders
     */
    renderTable(orders) {
        if (this.dataManager.error) return;

        if (!orders || orders.length === 0) {
            this.ui.renderEmptyState(this.elements.tableContainer, () => {
                this.handleCreateOrder();
            });
            // Clear pagination
            if (this.elements.paginationContainer) {
                this.elements.paginationContainer.innerHTML = '';
            }
            return;
        }

        // Render current page of orders
        this.renderTableForCurrentPage();

        // Render pagination
        this.renderPagination({
            currentPage: this.dataManager.currentPage,
            totalItems: orders.length,
            pageSize: this.config.PAGINATION_CONFIG.pageSize
        });
    }

    /**
     * Render table for current page
     */
    renderTableForCurrentPage() {
        const pageOrders = this.dataManager.getCurrentPageOrders();
        this.tableRenderer.render(pageOrders, this.dataManager.selectedIds);
    }

    /**
     * Render pagination controls
     * @param {Object} paginationInfo - Pagination info
     */
    renderPagination(paginationInfo) {
        const info = paginationInfo || {
            currentPage: this.dataManager.currentPage,
            totalItems: this.dataManager.orders.length,
            pageSize: this.config.PAGINATION_CONFIG.pageSize
        };

        this.ui.renderPagination({
            currentPage: info.currentPage,
            totalItems: info.totalItems,
            pageSize: info.pageSize,
            hasMore: this.dataManager.hasMore
        }, this.elements.paginationContainer, {
            onPageChange: (page) => this.handlePageChange(page),
            onLoadMore: () => this.dataManager.loadMore()
        });
    }

    /**
     * Handle page change
     * @param {number} page - Target page number
     */
    handlePageChange(page) {
        this.dataManager.setCurrentPage(page);
    }

    /**
     * Toggle loading state
     * @param {boolean} loading
     */
    toggleLoading(loading) {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.style.display = loading ? 'flex' : 'none';
        }
    }

    /**
     * Update selection UI
     * @param {Array} selectedIds
     */
    updateSelectionUI(selectedIds) {
        // Update checkboxes
        selectedIds.forEach(id => {
            this.tableRenderer.updateSelection(id, true);
        });

        // Could add bulk action toolbar here
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================

    /**
     * Handle tab change
     * @param {string} status
     */
    handleTabChange(status) {
        if (status === this.currentTab) return;

        this.currentTab = status;
        this.ui.updateActiveTab(status, this.elements.tabsContainer);
        this.dataManager.clearSelection();
        this.dataManager.loadOrders(status, true);
    }

    /**
     * Handle create order
     */
    handleCreateOrder() {
        this.formModal.openCreate({
            onSubmit: async (orderData) => {
                await this.dataManager.createOrder(orderData);
                this.ui.showToast('Tạo đơn hàng thành công!', 'success');
            },
            onCancel: () => {
                // Nothing to do
            }
        });
    }

    /**
     * Handle edit order
     * @param {string} orderId
     */
    async handleEditOrder(orderId) {
        const order = await this.dataManager.getOrder(orderId);

        if (!order) {
            this.ui.showToast('Không tìm thấy đơn hàng', 'error');
            return;
        }

        const editCheck = window.PurchaseOrderValidation.validateCanEdit(order);
        if (!editCheck.canEdit) {
            this.ui.showToast(editCheck.error, 'warning');
            return;
        }

        this.formModal.openEdit(order, {
            onSubmit: async (orderData) => {
                await this.dataManager.updateOrder(orderId, orderData);
                this.ui.showToast('Cập nhật đơn hàng thành công!', 'success');
            },
            onCancel: () => {
                // Nothing to do
            }
        });
    }

    /**
     * Handle export order to Excel
     * @param {string} orderId
     */
    async handleExportOrder(orderId) {
        const order = await this.dataManager.getOrder(orderId);

        if (!order) {
            this.ui.showToast('Không tìm thấy đơn hàng', 'error');
            return;
        }

        try {
            this.exportOrderToExcel(order);
            this.ui.showToast('Xuất Excel thành công!', 'success');
        } catch (error) {
            console.error('Export failed:', error);
            this.ui.showToast('Không thể xuất Excel', 'error');
        }
    }

    /**
     * Export order to Excel using XLSX library
     * @param {Object} order
     */
    exportOrderToExcel(order) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        // Prepare data
        const data = [
            ['ĐƠN ĐẶT HÀNG', '', '', '', '', ''],
            ['Mã đơn:', order.orderNumber, '', 'Ngày đặt:', this.config.formatDate(order.orderDate)],
            ['Nhà cung cấp:', order.supplier?.name || '', '', 'Trạng thái:', this.config.STATUS_LABELS[order.status]],
            [''],
            ['STT', 'Tên sản phẩm', 'Mã SP', 'Biến thể', 'SL', 'Giá mua', 'Giá bán', 'Thành tiền']
        ];

        // Add items
        (order.items || []).forEach((item, index) => {
            data.push([
                index + 1,
                item.productName,
                item.productCode,
                item.variant,
                item.quantity,
                item.purchasePrice,
                item.sellingPrice,
                item.subtotal
            ]);
        });

        // Add totals
        data.push(['']);
        data.push(['', '', '', '', '', '', 'Tổng tiền:', order.totalAmount]);
        data.push(['', '', '', '', '', '', 'Giảm giá:', order.discountAmount]);
        data.push(['', '', '', '', '', '', 'Phí ship:', order.shippingFee]);
        data.push(['', '', '', '', '', '', 'THÀNH TIỀN:', order.finalAmount]);

        // Create workbook
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Đơn hàng');

        // Download
        XLSX.writeFile(wb, `${order.orderNumber}.xlsx`);
    }

    /**
     * Handle copy order
     * @param {string} orderId
     */
    async handleCopyOrder(orderId) {
        const confirmed = await this.ui.showConfirmDialog({
            title: 'Sao chép đơn hàng',
            message: 'Bạn có chắc muốn sao chép đơn hàng này? Đơn mới sẽ được tạo ở trạng thái Nháp.',
            confirmText: 'Sao chép',
            type: 'info'
        });

        if (!confirmed) return;

        try {
            const newOrderId = await this.dataManager.copyOrder(orderId);
            this.ui.showToast('Sao chép đơn hàng thành công!', 'success');

            // Switch to draft tab to see the new order
            this.handleTabChange(this.config.OrderStatus.DRAFT);
        } catch (error) {
            this.ui.showToast(error.userMessage || 'Không thể sao chép đơn hàng', 'error');
        }
    }

    /**
     * Handle delete order
     * @param {string} orderId
     */
    async handleDeleteOrder(orderId) {
        const order = await this.dataManager.getOrder(orderId);

        if (!order) {
            this.ui.showToast('Không tìm thấy đơn hàng', 'error');
            return;
        }

        const deleteCheck = window.PurchaseOrderValidation.validateCanDelete(order);
        if (!deleteCheck.canDelete) {
            this.ui.showToast(deleteCheck.error, 'warning');
            return;
        }

        const confirmed = await this.ui.showConfirmDialog({
            title: 'Xóa đơn hàng',
            message: `Bạn có chắc muốn xóa đơn hàng ${order.orderNumber}? Hành động này không thể hoàn tác.`,
            confirmText: 'Xóa',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            await this.dataManager.deleteOrder(orderId);
            this.ui.showToast('Xóa đơn hàng thành công!', 'success');
        } catch (error) {
            this.ui.showToast(error.userMessage || 'Không thể xóa đơn hàng', 'error');
        }
    }

    /**
     * Handle select order
     * @param {string} orderId
     * @param {boolean} selected
     */
    handleSelectOrder(orderId, selected) {
        this.dataManager.toggleSelection(orderId);
    }

    /**
     * Handle row click
     * @param {string} orderId
     */
    handleRowClick(orderId) {
        // Could open detail view or quick edit
        console.log('Row clicked:', orderId);
    }

    /**
     * Handle view invoice images
     * @param {Array} images
     */
    handleViewInvoice(images) {
        if (!images || images.length === 0) return;
        // Open image viewer modal
        this.openImageViewer(images, 'Hóa đơn');
    }

    /**
     * Handle view product images
     * @param {string} itemId
     */
    handleViewImages(itemId) {
        // Find item and open its images
        console.log('View images for item:', itemId);
    }

    /**
     * Open image viewer
     * @param {Array} images
     * @param {string} title
     */
    openImageViewer(images, title) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="image-viewer">
                <div class="image-viewer__header">
                    <h3>${title}</h3>
                    <button class="btn-icon" id="btnCloseViewer">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="image-viewer__content">
                    <img src="${images[0]}" alt="${title}">
                </div>
                ${images.length > 1 ? `
                    <div class="image-viewer__thumbnails">
                        ${images.map((img, idx) => `
                            <img src="${img}" alt="${title} ${idx + 1}" class="${idx === 0 ? 'active' : ''}" data-index="${idx}">
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(overlay);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Close button
        overlay.querySelector('#btnCloseViewer')?.addEventListener('click', () => {
            overlay.remove();
        });

        // Overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // Thumbnail click
        overlay.querySelectorAll('.image-viewer__thumbnails img').forEach(thumb => {
            thumb.addEventListener('click', () => {
                const index = parseInt(thumb.dataset.index, 10);
                overlay.querySelector('.image-viewer__content img').src = images[index];
                overlay.querySelectorAll('.image-viewer__thumbnails img').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
            });
        });
    }

    // ========================================
    // CLEANUP
    // ========================================

    /**
     * Cleanup and destroy controller
     */
    destroy() {
        // Unsubscribe from all events
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];

        // Reset data manager
        this.dataManager.reset();

        this.initialized = false;
    }
}

// ========================================
// INITIALIZE ON DOM READY
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for all dependencies to load
    const checkDependencies = () => {
        return (
            window.PurchaseOrderConfig &&
            window.purchaseOrderService &&
            window.purchaseOrderDataManager &&
            window.purchaseOrderUI &&
            window.purchaseOrderTableRenderer &&
            window.purchaseOrderFormModal
        );
    };

    // Retry until dependencies are loaded
    let attempts = 0;
    const maxAttempts = 10;

    const tryInit = async () => {
        if (checkDependencies()) {
            const controller = new PurchaseOrderController();
            window.purchaseOrderController = controller;
            await controller.init();
        } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(tryInit, 100);
        } else {
            console.error('[PurchaseOrderController] Dependencies not loaded after max attempts');
        }
    };

    await tryInit();
});

console.log('[Purchase Orders] Main controller loaded');
