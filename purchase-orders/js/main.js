/**
 * PURCHASE ORDERS MODULE - MAIN CONTROLLER
 * File: main.js
 * Purpose: Initialize and coordinate all components
 */

// ========================================
// UTILITY: Variant Matching (Section 15.6)
// ========================================

/**
 * Compare two variant strings order-insensitively and format-insensitively.
 * Supports comma, pipe, slash, and parenthesis formats.
 * e.g. "ĐEN, 4, XL" matches "(Đen) (4) (XL)" or "Đen | 4 | XL" or "Đen / 4 / XL"
 */
function variantsMatch(variant1, variant2) {
    if (!variant1 || !variant2) return false;

    const removeDiacritics = window.ProductCodeGenerator?.removeVietnameseDiacritics
        || ((s) => s);

    const normalize = (str) =>
        removeDiacritics(str.trim())
            .toUpperCase()
            .replace(/[()]/g, '')
            .replace(/\s+/g, ' ');

    const parts1 = variant1.split(/[,|\/]/).map(normalize).filter(p => p.length > 0).sort();
    const parts2 = variant2.split(/[,|\/]/).map(normalize).filter(p => p.length > 0).sort();

    return parts1.length === parts2.length && parts1.every((part, idx) => part === parts2[idx]);
}

// ========================================
// UTILITY: Products CSV Loader (for variant lookup)
// ========================================

let _productsCSVCache = null;

/**
 * Load and parse products_rows.csv
 * @returns {Promise<Array<{product_code: string, variant: string, base_product_code: string}>>}
 */
async function loadProductsCSV() {
    if (_productsCSVCache) return _productsCSVCache;

    try {
        const response = await fetch('products_rows.csv');
        if (!response.ok) {
            console.warn('[ExportMH] products_rows.csv fetch failed:', response.status);
            return [];
        }
        const text = await response.text();
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(',');
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((h, idx) => {
                row[h.trim()] = (values[idx] || '').trim();
            });
            rows.push(row);
        }

        _productsCSVCache = rows;
        console.log(`[ExportMH] Loaded ${rows.length} products from CSV`);
        return rows;
    } catch (error) {
        console.error('[ExportMH] Failed to load products CSV:', error);
        return [];
    }
}

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

            // Initialize table renderer with all handlers (matches React app)
            this.tableRenderer.init(this.elements.tableContainer, {
                onEdit: (orderId) => this.handleEditOrder(orderId),
                onExport: (orderId) => this.handleExportOrder(orderId),
                onCopy: (orderId) => this.handleCopyOrder(orderId),
                onPrintBarcode: (orderId) => this.handlePrintBarcode(orderId),
                onDelete: (orderId) => this.handleDeleteOrder(orderId),
                onSelect: (orderId, selected) => this.handleSelectOrder(orderId, selected),
                onSelectAll: (selected) => this.handleSelectAll(selected),
                onRowClick: (orderId) => this.handleRowClick(orderId),
                onViewInvoice: (images) => this.handleViewInvoice(images),
                onViewImages: (itemId) => this.handleViewImages(itemId),
                onViewDetail: (orderId) => this.handleViewDetail(orderId),
                onBulkExport: () => this.handleBulkExport(),
                onBulkDelete: () => this.handleBulkDelete(),
                onClearSelection: () => this.handleClearSelection()
            });

            // Subscribe to data manager events
            this.subscribeToEvents();

            // Bind UI events
            this.bindEvents();

            // Init shop selector
            this.initShopSelector();

            // Pre-load NCC names for supplier autocomplete
            if (window.NCCManager) {
                window.NCCManager.loadNCCNames().catch(err =>
                    console.warn('[Init] NCC names load failed:', err)
                );
            }

            // Load initial data
            await this.loadInitialData();

            this.initialized = true;
            console.log('[PurchaseOrderController] Initialized successfully');

            // Run daily image cleanup in background (non-blocking)
            this.service.cleanupOldFirebaseImages().catch(err =>
                console.warn('[Init] Image cleanup failed:', err)
            );

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
     * Init shop selector dropdown in sidebar
     */
    initShopSelector() {
        // Prevent page reload on shop change — purchase-orders handles it in-place
        window._shopChangeNoReload = true;
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
        if (!this.formModal) {
            this.ui.showToast('Form modal chưa sẵn sàng. Vui lòng tải lại trang.', 'error');
            return;
        }

        this.formModal.openCreate({
            onSubmit: async (orderData) => {
                const isConfirmed = orderData.status === 'AWAITING_PURCHASE';

                // Save as DRAFT first, then sync TPOS to get product codes
                if (isConfirmed) {
                    orderData.status = 'DRAFT';
                }

                const orderId = await this.dataManager.createOrder(orderData);
                this.ui.showToast('Tạo đơn hàng thành công!', 'success');

                // Sync products to TPOS (await result)
                if (isConfirmed && window.TPOSProductCreator) {
                    this.ui.showToast('Đang đồng bộ sản phẩm lên TPOS...', 'info');
                    const syncResult = await window.TPOSProductCreator.syncOrderToTPOS(orderId, orderData.items, orderData.supplier);

                    if (syncResult?.failCount === 0 && syncResult?.successCount > 0) {
                        // All synced OK → update status to AWAITING_PURCHASE
                        await this.dataManager.updateOrderStatus(orderId, this.config.OrderStatus.AWAITING_PURCHASE);
                        this.handleTabChange(this.config.OrderStatus.AWAITING_PURCHASE);
                    } else {
                        // Sync failed → stay as DRAFT, show warning
                        this.ui.showToast('Đồng bộ TPOS có lỗi — đơn giữ ở Nháp để thử lại', 'warning');
                        this.handleTabChange(this.config.OrderStatus.DRAFT);
                    }
                } else {
                    // Draft save — just switch tab
                    const targetTab = orderData.status || this.config.OrderStatus.DRAFT;
                    if (this.currentTab !== targetTab) {
                        this.handleTabChange(targetTab);
                    }
                }
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

                // Sync products to TPOS if order is confirmed
                const isConfirmed = orderData.status === 'AWAITING_PURCHASE' || order.status === 'AWAITING_PURCHASE';
                if (isConfirmed && window.TPOSProductCreator) {
                    this.ui.showToast('Đang đồng bộ sản phẩm lên TPOS...', 'info');
                    const syncResult = await window.TPOSProductCreator.syncOrderToTPOS(orderId, orderData.items, orderData.supplier);

                    if (syncResult?.failCount > 0) {
                        this.ui.showToast('Đồng bộ TPOS có lỗi — một số SP chưa có mã variant', 'warning');
                    }
                }

                // Refresh table to show updated codes
                this.dataManager.loadOrders(this.currentTab, true);
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

        this.showPurchaseOrderPreview(order);
    }

    /**
     * Show purchase order preview UI (replaces old export format dialog)
     * Displays order items in TPOS-style table with editable Giảm giá, Cước phí, Ghi chú
     */
    showPurchaseOrderPreview(order) {
        const orders = Array.isArray(order) ? order : [order];
        const singleOrder = orders[0];
        const items = singleOrder.items || [];
        let ncc = window.NCCManager?.findByName(singleOrder.supplier?.name);
        const supplierDisplay = ncc
            ? `[${ncc.code}] ${ncc.name}`
            : (singleOrder.supplier?.name || 'Không rõ');

        const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

        // Build item rows with readonly qty/price (double-click to edit)
        const rowsHTML = items.map((item, idx) => {
            const qty = item.quantity || 0;
            const price = item.purchasePrice || 0;
            const lineTotal = qty * price;
            const code = item.productCode || '';
            const name = item.productName || '';
            const variant = item.variant || '';
            return `
                <tr style="border-bottom: 1px solid #dee2e6;" data-idx="${idx}" data-tpos-id="${item.tposProductId || ''}" data-tpos-tmpl-id="${item.tposProductTmplId || ''}" data-code="${code}">
                    <td style="padding: 10px 8px; text-align: center; color: #333; font-size: 14px; vertical-align: top; width: 40px; border-right: 1px solid #dee2e6;">${idx + 1}</td>
                    <td style="padding: 10px 12px; font-size: 14px; border-right: 1px solid #dee2e6;">
                        <div style="font-weight: 700; color: #000;">[${code}] ${name}</div>
                        <div style="color: #999; font-size: 12px; margin-top: 2px;">${variant || 'Ghi chú'}</div>
                    </td>
                    <td style="padding: 10px 4px; text-align: center; width: 100px; border-right: 1px solid #dee2e6;">
                        <input type="number" class="po-qty" data-idx="${idx}" value="${qty}" min="0" readonly style="
                            width: 70px; height: 32px; text-align: center; border: 1px solid #e5e7eb;
                            border-radius: 3px; font-size: 14px; padding: 0 4px;
                            background: #f9fafb; cursor: default;
                        ">
                    </td>
                    <td style="padding: 10px 4px; text-align: right; width: 200px; border-right: 1px solid #dee2e6;">
                        <div style="display: flex; align-items: center; gap: 4px; justify-content: flex-end;">
                            <input type="number" class="po-price" data-idx="${idx}" data-original="${price}" value="${price}" min="0" readonly style="
                                width: 110px; height: 32px; text-align: right; border: 1px solid #e5e7eb;
                                border-radius: 3px; font-size: 14px; padding: 0 8px;
                                background: #f9fafb; cursor: default;
                            ">
                            <span class="po-price-actions" data-idx="${idx}" style="display: none; white-space: nowrap;">
                                <button class="po-price-cancel" data-idx="${idx}" title="Hủy" style="
                                    width: 26px; height: 26px; border: 1px solid #fca5a5; border-radius: 4px;
                                    background: #fef2f2; color: #ef4444; cursor: pointer; font-size: 14px; line-height: 24px;
                                ">&times;</button>
                                <button class="po-price-save" data-idx="${idx}" title="Lưu giá lên TPOS" style="
                                    width: 26px; height: 26px; border: 1px solid #86efac; border-radius: 4px;
                                    background: #f0fdf4; color: #16a34a; cursor: pointer; font-size: 14px; line-height: 24px;
                                ">&#10003;</button>
                            </span>
                            <input type="checkbox" class="po-bypass-zero" data-idx="${idx}" title="Cho phép giá 0" style="
                                width: 16px; height: 16px; cursor: pointer; accent-color: #f59e0b;
                                display: ${price === 0 ? 'block' : 'none'};
                            ">
                        </div>
                    </td>
                    <td style="padding: 10px 10px; text-align: right; font-size: 14px; font-weight: 600; width: 120px; white-space: nowrap; border-right: 1px solid #dee2e6;" class="po-line-total">${fmt(lineTotal)}</td>
                    <td style="padding: 10px 6px; text-align: center; width: 50px;">
                        <span class="po-del-btn" data-idx="${idx}" style="
                            display: inline-block; width: 28px; height: 28px; line-height: 26px;
                            text-align: center; color: #999; cursor: pointer; font-size: 18px;
                        " title="Xóa dòng">&times;</span>
                    </td>
                </tr>`;
        }).join('');

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.4);
            display: flex; align-items: center; justify-content: center; z-index: 5000;
        `;

        overlay.innerHTML = `
            <div style="
                background: white; border-radius: 4px; padding: 0;
                max-width: 960px; width: 96%; max-height: 92vh; display: flex; flex-direction: column;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15); border: 1px solid #ccc;
            ">
                <!-- Header -->
                <div style="padding: 14px 20px; border-bottom: 1px solid #dee2e6; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa;">
                    <div>
                        <h3 style="margin: 0 0 2px; font-size: 16px; font-weight: 700; color: #333;">
                            Đơn mua hàng - ${singleOrder.orderNumber || ''}
                        </h3>
                        <div style="font-size: 13px; color: #666;">NCC: <strong style="color: #333;">${supplierDisplay}</strong></div>
                    </div>
                    <div style="font-size: 12px; color: #999;">${new Date().toLocaleDateString('vi-VN')}</div>
                </div>

                <!-- Scrollable table -->
                <div style="overflow-y: auto; flex: 1; min-height: 0;">
                    <table style="width: 100%; border-collapse: collapse;" id="poItemsTable">
                        <thead>
                            <tr style="background: #d6dce4; border-bottom: 1px solid #bfc7d1;">
                                <th style="padding: 10px 8px; text-align: center; font-size: 13px; font-weight: 700; color: #333; width: 40px; border-right: 1px solid #bfc7d1;">STT</th>
                                <th style="padding: 10px 12px; text-align: left; font-size: 13px; font-weight: 700; color: #333; border-right: 1px solid #bfc7d1;">Sản phẩm</th>
                                <th style="padding: 10px 8px; text-align: center; font-size: 13px; font-weight: 700; color: #333; width: 100px; border-right: 1px solid #bfc7d1;">Số lượng</th>
                                <th style="padding: 10px 8px; text-align: center; font-size: 13px; font-weight: 700; color: #333; width: 140px; border-right: 1px solid #bfc7d1;">Đơn giá</th>
                                <th style="padding: 10px 10px; text-align: right; font-size: 13px; font-weight: 700; color: #333; width: 120px; border-right: 1px solid #bfc7d1;">Tổng</th>
                                <th style="padding: 10px 6px; text-align: center; font-size: 13px; font-weight: 700; color: #333; width: 50px;"></th>
                            </tr>
                        </thead>
                        <tbody>${rowsHTML}</tbody>
                    </table>
                </div>

                <!-- Summary -->
                <div style="padding: 12px 20px 16px; border-top: 1px solid #dee2e6;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 6px 0; font-size: 14px; font-weight: 700; text-align: right; color: #333;">Tổng số lượng: &nbsp;<span id="poTotalQty" style="min-width: 40px; display: inline-block;">0</span></td>
                            <td style="padding: 6px 0; font-size: 14px; font-weight: 700; text-align: right; width: 190px; color: #333;">Tổng: &nbsp;<span id="poSubtotal">0</span></td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; text-align: right;">
                                <input type="number" id="poDecreaseAmount" value="${singleOrder.discountAmount || 0}" min="0" placeholder="Chiết khấu - Giảm giá" style="
                                    width: 200px; height: 32px; text-align: left; border: 1px solid #ccc;
                                    border-radius: 3px; font-size: 13px; padding: 0 8px;
                                ">
                            </td>
                            <td style="padding: 4px 0; font-size: 14px; font-weight: 700; text-align: right; width: 190px; color: #333;" id="poDecreaseDisplay">0</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; text-align: right;">
                                <span style="font-size: 14px; color: #64748b; margin-right: 6px;">&#x1F69A;</span>
                                <span style="font-size: 14px; font-weight: 600; color: #64748b;">Tiền ship:</span>
                                <input type="number" id="poCostsIncurred" value="${singleOrder.shippingFee || 0}" min="0" style="
                                    width: 120px; height: 36px; text-align: right; border: 1px solid #e2e8f0;
                                    border-radius: 8px; font-size: 14px; padding: 0 10px; margin-left: 8px;
                                    background: #f8fafc;
                                ">
                            </td>
                            <td style="padding: 4px 0; font-size: 14px; font-weight: 700; text-align: right; width: 190px; color: #333;" id="poCostsDisplay">0</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; text-align: right;">
                                <span style="font-size: 13px; color: #666; margin-right: 8px;">Ghi chú</span>
                                <input type="text" id="poNote" value="${singleOrder.notes || ''}" placeholder="Nhập ghi chú..." style="
                                    width: 220px; height: 32px; border: 1px solid #ccc;
                                    border-radius: 3px; font-size: 13px; padding: 0 8px;
                                ">
                            </td>
                            <td></td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0 4px; font-size: 16px; font-weight: 700; text-align: right; color: #333;">Tổng tiền:</td>
                            <td style="padding: 8px 0 4px; font-size: 16px; font-weight: 700; text-align: right; width: 190px; color: #333;" id="poFinalAmount">0</td>
                        </tr>
                    </table>
                </div>

                <!-- Zero-price warning -->
                <div id="poZeroPriceWarning" style="padding: 8px 20px; background: #fef3c7; border-top: 1px solid #fde68a; display: none;">
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #92400e;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <span id="poZeroPriceText">Có sản phẩm giá 0. Tick checkbox bên cạnh đơn giá để cho phép.</span>
                    </div>
                </div>

                <!-- Editing warning -->
                <div id="poEditingWarning" style="padding: 8px 20px; background: #dbeafe; border-top: 1px solid #bfdbfe; display: none;">
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1e40af;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        <span>Đang chỉnh sửa đơn giá. Lưu hoặc hủy trước khi xuất.</span>
                    </div>
                </div>

                <!-- Buttons -->
                <div style="padding: 12px 20px; border-top: 1px solid #dee2e6; display: flex; gap: 8px; justify-content: flex-end; background: #f8f9fa;">
                    <button type="button" id="btnCancelPO" style="
                        padding: 8px 20px; border: 1px solid #ccc; border-radius: 4px;
                        background: white; cursor: pointer; font-size: 14px; color: #333;
                    ">Hủy</button>
                    <button type="button" id="btnExportExcel" style="
                        padding: 8px 20px; border: 1px solid #28a745; border-radius: 4px;
                        background: white; color: #28a745; cursor: pointer; font-size: 14px; font-weight: 600;
                    ">Xuất Excel</button>
                    <button type="button" id="btnSubmitTPOS" style="
                        padding: 8px 20px; border: none; border-radius: 4px;
                        background: #28a745; color: white; cursor: pointer;
                        font-size: 14px; font-weight: 600;
                    ">Tạo đơn TPOS</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Track editing state
        const editingPrices = new Set();

        // Update button states based on zero-price and editing state
        const updateButtonStates = () => {
            let zeroPriceCount = 0;
            overlay.querySelectorAll('tr[data-idx]').forEach(row => {
                const price = parseFloat(row.querySelector('.po-price').value) || 0;
                const bypass = row.querySelector('.po-bypass-zero');
                if (bypass) {
                    bypass.style.display = price === 0 ? 'block' : 'none';
                    if (price !== 0) bypass.checked = false;
                }
                if (price === 0 && (!bypass || !bypass.checked)) {
                    zeroPriceCount++;
                }
            });

            const zeroWarning = overlay.querySelector('#poZeroPriceWarning');
            const editWarning = overlay.querySelector('#poEditingWarning');
            const btnExcel = overlay.querySelector('#btnExportExcel');
            const btnTPOS = overlay.querySelector('#btnSubmitTPOS');

            const isEditing = editingPrices.size > 0;
            const isBlocked = zeroPriceCount > 0 || isEditing;

            // Zero-price warning
            if (zeroPriceCount > 0) {
                zeroWarning.style.display = 'block';
                zeroWarning.querySelector('#poZeroPriceText').textContent =
                    `Có ${zeroPriceCount} sản phẩm giá 0. Tick checkbox bên cạnh đơn giá để cho phép.`;
            } else {
                zeroWarning.style.display = 'none';
            }

            // Editing warning
            editWarning.style.display = isEditing ? 'block' : 'none';

            // Button states
            if (isBlocked) {
                btnExcel.disabled = true;
                btnExcel.style.opacity = '0.5';
                btnExcel.style.cursor = 'not-allowed';
                btnTPOS.disabled = true;
                btnTPOS.style.opacity = '0.5';
                btnTPOS.style.cursor = 'not-allowed';
            } else {
                btnExcel.disabled = false;
                btnExcel.style.opacity = '';
                btnExcel.style.cursor = 'pointer';
                btnTPOS.disabled = false;
                btnTPOS.style.opacity = '';
                btnTPOS.style.cursor = 'pointer';
            }
        };

        // Enable editing on an input
        const enableInput = (input) => {
            input.readOnly = false;
            input.style.background = 'white';
            input.style.border = '1px solid #3b82f6';
            input.style.cursor = 'text';
            input.focus();
            input.select();
        };

        // Lock input back to readonly
        const lockInput = (input) => {
            input.readOnly = true;
            input.style.background = '#f9fafb';
            input.style.border = '1px solid #e5e7eb';
            input.style.cursor = 'default';
        };

        // Recalculate all totals from current input values
        const recalcAll = () => {
            let totalQty = 0, totalAmount = 0;
            overlay.querySelectorAll('tr[data-idx]').forEach(row => {
                const idx = parseInt(row.dataset.idx);
                const qty = parseFloat(row.querySelector('.po-qty').value) || 0;
                const price = parseFloat(row.querySelector('.po-price').value) || 0;
                const lineTotal = qty * price;
                totalQty += qty;
                totalAmount += lineTotal;
                row.querySelector('.po-line-total').textContent = fmt(lineTotal);
                if (items[idx]) {
                    items[idx].quantity = qty;
                    items[idx].purchasePrice = price;
                }
            });
            const decrease = parseFloat(overlay.querySelector('#poDecreaseAmount').value) || 0;
            const costs = parseFloat(overlay.querySelector('#poCostsIncurred').value) || 0;
            overlay.querySelector('#poTotalQty').textContent = totalQty;
            overlay.querySelector('#poSubtotal').textContent = fmt(totalAmount);
            overlay.querySelector('#poDecreaseDisplay').textContent = fmt(decrease);
            overlay.querySelector('#poCostsDisplay').textContent = fmt(costs);
            overlay.querySelector('#poFinalAmount').textContent = fmt(totalAmount - decrease + costs);
            updateButtonStates();
        };
        recalcAll();

        // Double-click to edit qty
        overlay.querySelectorAll('.po-qty').forEach(input => {
            input.addEventListener('dblclick', () => {
                enableInput(input);
            });
            input.addEventListener('blur', () => {
                lockInput(input);
                recalcAll();
            });
        });

        // Double-click to edit price — shows X/Lưu buttons
        overlay.querySelectorAll('.po-price').forEach(input => {
            input.addEventListener('dblclick', () => {
                const idx = input.dataset.idx;
                enableInput(input);
                editingPrices.add(idx);
                const actions = overlay.querySelector(`.po-price-actions[data-idx="${idx}"]`);
                if (actions) actions.style.display = 'inline-flex';
                updateButtonStates();
            });
            input.addEventListener('input', recalcAll);
        });

        // Price cancel (X) button
        overlay.querySelectorAll('.po-price-cancel').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = btn.dataset.idx;
                const input = overlay.querySelector(`.po-price[data-idx="${idx}"]`);
                if (input) {
                    input.value = input.dataset.original;
                    lockInput(input);
                }
                editingPrices.delete(idx);
                const actions = overlay.querySelector(`.po-price-actions[data-idx="${idx}"]`);
                if (actions) actions.style.display = 'none';
                recalcAll();
            });
        });

        // Price save (✓) button — calls TPOS UpdateStandPrice
        overlay.querySelectorAll('.po-price-save').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = btn.dataset.idx;
                const row = overlay.querySelector(`tr[data-idx="${idx}"]`);
                const input = overlay.querySelector(`.po-price[data-idx="${idx}"]`);
                let tposId = parseInt(row?.dataset.tposId) || 0;
                let tposTmplId = parseInt(row?.dataset.tposTmplId) || 0;
                const newPrice = parseFloat(input?.value) || 0;
                const code = items[idx]?.productCode || row?.dataset.code || '';
                const name = items[idx]?.productName || '';

                btn.disabled = true;
                btn.textContent = '...';

                try {
                    const token = await window.inventoryPickerDialog?.getAuthToken();
                    if (!token) throw new Error('Không có token');

                    const proxyUrl = window.inventoryPickerDialog?.proxyUrl || 'https://chatomni-proxy.nhijudyshop.workers.dev';

                    // If no TPOS ID, look up by product code
                    if (!tposId && code) {
                        const lookupResp = await fetch(
                            `${proxyUrl}/api/odata/Product?$filter=DefaultCode eq '${code}'&$top=1&$select=Id,ProductTmplId`,
                            { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'feature-version': '2', 'tposappversion': '6.2.6.1' } }
                        );
                        if (lookupResp.ok) {
                            const lookupData = await lookupResp.json();
                            const found = lookupData.value?.[0];
                            if (found) {
                                tposId = found.Id;
                                tposTmplId = found.ProductTmplId || tposTmplId;
                                row.dataset.tposId = tposId;
                                row.dataset.tposTmplId = tposTmplId;
                            }
                        }
                    }

                    if (!tposId) {
                        this.ui.showToast(`Không tìm thấy sản phẩm ${code} trên TPOS`, 'warning');
                        btn.disabled = false;
                        btn.textContent = '✓';
                        return;
                    }

                    const response = await fetch(`${proxyUrl}/api/odata/ProductTemplate/ODataService.UpdateStandPrice`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json;charset=UTF-8',
                            'Accept': 'application/json',
                            'feature-version': '2',
                            'tposappversion': '6.2.6.1'
                        },
                        body: JSON.stringify({
                            model: [{
                                Id: tposId,
                                ProductTmplId: tposTmplId,
                                DefaultCode: code,
                                Barcode: code,
                                StandardPrice: newPrice,
                                NameTemplate: name
                            }]
                        })
                    });

                    if (!response.ok) throw new Error(`API error: ${response.status}`);

                    const result = await response.json();
                    if (result.value === true) {
                        this.ui.showToast(`Đã cập nhật giá ${code}: ${fmt(newPrice)} đ`, 'success');
                        input.dataset.original = newPrice;
                        lockInput(input);
                        editingPrices.delete(idx);
                        const actions = overlay.querySelector(`.po-price-actions[data-idx="${idx}"]`);
                        if (actions) actions.style.display = 'none';
                        recalcAll();
                    } else {
                        throw new Error('API trả về false');
                    }
                } catch (error) {
                    console.error('[PO Preview] UpdateStandPrice failed:', error);
                    this.ui.showToast('Lỗi cập nhật giá TPOS: ' + error.message, 'error');
                    btn.disabled = false;
                    btn.textContent = '✓';
                }
            });
        });

        overlay.querySelector('#poDecreaseAmount').addEventListener('input', recalcAll);
        overlay.querySelector('#poCostsIncurred').addEventListener('input', recalcAll);

        // Bypass checkboxes
        overlay.querySelectorAll('.po-bypass-zero').forEach(cb => {
            cb.addEventListener('change', updateButtonStates);
        });

        // Cancel / close
        overlay.querySelector('#btnCancelPO').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // Delete row buttons
        overlay.querySelectorAll('.po-del-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr[data-idx]');
                if (row) {
                    row.remove();
                    recalcAll();
                }
            });
        });

        // Export Excel button
        overlay.querySelector('#btnExportExcel').addEventListener('click', async () => {
            const btn = overlay.querySelector('#btnExportExcel');
            btn.disabled = true;
            btn.textContent = 'Đang xuất...';
            try {
                const result = await this.exportMuaHang(orders);
                if (result.exported > 0) {
                    this.ui.showToast(`Xuất Excel thành công! ${result.exported} SP`, 'success');
                } else {
                    this.ui.showToast('Không có SP nào phù hợp', 'error');
                }
            } catch (err) {
                this.ui.showToast('Lỗi xuất Excel: ' + err.message, 'error');
            }
            btn.disabled = false;
            btn.textContent = 'Xuất Excel';
        });

        // Submit to TPOS
        overlay.querySelector('#btnSubmitTPOS').addEventListener('click', async () => {
            console.log('[PO Preview] btnSubmitTPOS clicked');
            const btn = overlay.querySelector('#btnSubmitTPOS');
            btn.disabled = true;
            btn.textContent = 'Đang tạo...';
            btn.style.opacity = '0.6';

            const resetBtn = () => {
                btn.disabled = false;
                btn.textContent = 'Tạo đơn TPOS';
                btn.style.opacity = '';
            };

            try {
                // Attach extra fields to order for TPOS
                singleOrder.decreaseAmount = parseFloat(overlay.querySelector('#poDecreaseAmount').value) || 0;
                singleOrder.costsIncurred = parseFloat(overlay.querySelector('#poCostsIncurred').value) || 0;
                singleOrder.tposNote = overlay.querySelector('#poNote').value || '';

                // Step 1: Export MH (resolve codes + build workbook, no download)
                console.log('[PO Preview] Step 1: exportMuaHang...');
                const result = await this.exportMuaHang(orders, { download: false });
                console.log('[PO Preview] exportMuaHang result:', { exported: result.exported, skipped: result.skipped, errors: result.errors });

                if (result.exported === 0) {
                    const errMsg = result.errors?.length > 0
                        ? 'Không tìm thấy SP trên TPOS:\n' + result.errors.join('\n')
                        : 'Không có SP nào phù hợp để tạo đơn TPOS';
                    this.ui.showToast(errMsg, 'error');
                    resetBtn();
                    return;
                }

                // Auto-create NCC on TPOS if no tposId
                if (!ncc?.tposId) {
                    const supplierName = singleOrder.supplier?.name;
                    if (!supplierName) {
                        this.ui.showToast('Không tìm thấy tên NCC', 'error');
                        resetBtn();
                        return;
                    }
                    this.ui.showToast('NCC chưa có TPOS ID, đang tạo NCC trên TPOS...', 'info');
                    console.log('[PO Preview] Auto-creating NCC on TPOS:', supplierName);
                    try {
                        const tposId = await window.NCCManager.createPartnerOnTPOS(supplierName);
                        if (tposId) {
                            if (ncc) {
                                ncc.tposId = tposId;
                            } else {
                                ncc = { tposId, name: supplierName, docId: supplierName.split(' ')[0] };
                            }
                            console.log('[PO Preview] NCC tposId set:', tposId);
                        } else {
                            this.ui.showToast('Không thể tạo NCC trên TPOS', 'error');
                            resetBtn();
                            return;
                        }
                    } catch (err) {
                        console.error('[PO Preview] Auto-create NCC failed:', err);
                        this.ui.showToast('Lỗi tạo NCC trên TPOS: ' + err.message, 'error');
                        resetBtn();
                        return;
                    }
                }

                if (!window.TPOSPurchase?.createFromExcel) {
                    this.ui.showToast('Module TPOSPurchase chưa được tải. Hãy reload trang.', 'error');
                    resetBtn();
                    return;
                }

                // Step 2: Create on TPOS
                console.log('[PO Preview] Step 2: createFromExcel...');
                const tposResult = await window.TPOSPurchase.createFromExcel(result.workbook, singleOrder, { ncc });
                console.log('[PO Preview] createFromExcel result:', tposResult);

                if (!tposResult.success) {
                    this.ui.showToast('Lỗi tạo đơn TPOS: ' + (tposResult.error || 'Không rõ lỗi'), 'error');
                    resetBtn();
                    return;
                }

                overlay.remove();

                if (tposResult.success) {
                    this.ui.showToast(
                        `Đã tạo đơn TPOS: ${tposResult.poNumber || 'ID ' + tposResult.poId} (${tposResult.linesCount} SP)`,
                        'success'
                    );

                    // Run barcode print & Firebase update in parallel
                    const parallelTasks = [];

                    // Task 1: Print barcode labels (2 TPOS API calls — slowest)
                    if (tposResult.poId && tposResult.orderLines?.length > 0 && window.TPOSPurchase?.printBarcodeLabel) {
                        parallelTasks.push(
                            (async () => {
                                this.ui.showToast('Đang tạo tem barcode...', 'info');
                                await window.TPOSPurchase.printBarcodeLabel(tposResult.poId, tposResult.orderLines);
                            })().catch(err => {
                                console.warn('[Print] Barcode print failed:', err);
                                this.ui.showToast('Không thể in tem: ' + err.message, 'warning');
                            })
                        );
                    }

                    // Task 2: Single combined Firebase write (TPOS data + variant codes + status)
                    if (singleOrder.id) {
                        parallelTasks.push(
                            (async () => {
                                const updateData = {};

                                // 2a. TPOS PO data (for later barcode reprinting)
                                if (tposResult.poId) {
                                    updateData.tposPoId = tposResult.poId;
                                    updateData.tposPoNumber = tposResult.poNumber || null;
                                    updateData.tposOrderLines = (tposResult.orderLines || []).map(l => ({
                                        ProductId: l.Product?.Id || l.ProductId,
                                        ProductQty: l.ProductQty || 1,
                                        PriceUnit: l.PriceUnit || 0,
                                        PriceVariant: l.Product?.PriceVariant || 0,
                                        Product: l.Product ? {
                                            Id: l.Product.Id,
                                            DefaultCode: l.Product.DefaultCode,
                                            Barcode: l.Product.Barcode,
                                            NameTemplate: l.Product.NameTemplate,
                                            PriceVariant: l.Product.PriceVariant,
                                            ProductTmplId: l.Product.ProductTmplId,
                                            ImageUrl: l.Product.ImageUrl
                                        } : null
                                    }));
                                }

                                // 2b. Update items with TPOS variant codes
                                if (tposResult.orderLines && result.itemCodeMap) {
                                    const updatedItems = [...(singleOrder.items || [])];
                                    let updatedCount = 0;
                                    for (let i = 0; i < tposResult.orderLines.length && i < result.itemCodeMap.length; i++) {
                                        const line = tposResult.orderLines[i];
                                        const mapping = result.itemCodeMap[i];
                                        const barcode = line.Product?.Barcode || line.Product?.DefaultCode;
                                        const tposProductId = line.Product?.Id || line.ProductId;
                                        if (barcode && mapping.itemIndex < updatedItems.length) {
                                            const item = updatedItems[mapping.itemIndex];
                                            if (item.productCode !== barcode || !item.tposProductId) {
                                                updatedItems[mapping.itemIndex] = { ...item, productCode: barcode, tposProductId };
                                                updatedCount++;
                                            }
                                        }
                                    }
                                    if (updatedCount > 0) {
                                        updateData.items = updatedItems;
                                        console.log(`[TPOSPurchase] Updated ${updatedCount} items with TPOS variant codes`);
                                    }
                                }

                                // 2c. Auto-update status (AWAITING_PURCHASE → AWAITING_DELIVERY)
                                const config = window.PurchaseOrderConfig;
                                if (singleOrder.status === config?.OrderStatus?.AWAITING_PURCHASE) {
                                    const userSnapshot = window.purchaseOrderService?.getUserSnapshot?.()
                                        || { uid: 'system', displayName: 'System', email: '' };
                                    updateData.status = config.OrderStatus.AWAITING_DELIVERY;
                                    updateData.statusHistory = firebase.firestore.FieldValue.arrayUnion({
                                        from: singleOrder.status,
                                        to: config.OrderStatus.AWAITING_DELIVERY,
                                        changedAt: firebase.firestore.Timestamp.now(),
                                        changedBy: userSnapshot,
                                        reason: null
                                    });
                                    updateData.lastModifiedBy = userSnapshot;
                                }

                                // Single Firestore write (was 3 separate writes)
                                if (Object.keys(updateData).length > 0) {
                                    updateData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                                    const db = firebase.firestore();
                                    await db.collection('purchase_orders').doc(singleOrder.id).update(updateData);
                                    console.log('[TPOSPurchase] Saved all TPOS data to Firebase in 1 write');
                                }

                                // UI feedback
                                if (updateData.items) {
                                    this.ui.showToast(`Đã cập nhật mã biến thể từ TPOS`, 'info');
                                }
                                if (updateData.status) {
                                    this.ui.showToast('Đơn hàng chuyển sang trạng thái Chờ Hàng', 'info');
                                }

                                // Refresh table once
                                if (this.dataManager?.loadOrders) {
                                    this.dataManager.loadOrders(this.currentTab, true);
                                }
                            })().catch(err => console.error('[TPOSPurchase] Firebase update failed:', err))
                        );
                    }

                    await Promise.allSettled(parallelTasks);
                }
            } catch (error) {
                console.error('[PO Preview] Submit failed:', error);
                this.ui.showToast('Lỗi tạo đơn TPOS: ' + error.message, 'error');
                resetBtn();
            }
        });
    }

    /**
     * Show confirm dialog to push Excel to TPOS as purchase order
     */
    showTPOSPurchaseConfirm(workbook, order, exportedCount, itemCodeMap) {
        // Check if NCC has tposId
        const ncc = window.NCCManager?.findByName(order.supplier?.name);
        if (!ncc?.tposId) {
            console.log('[TPOSPurchase] NCC not found or no tposId, skipping TPOS confirm');
            return;
        }

        const confirmOverlay = document.createElement('div');
        confirmOverlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center; z-index: 5001;
        `;
        confirmOverlay.innerHTML = `
            <div style="
                background: white; border-radius: 12px; padding: 24px;
                max-width: 420px; width: 90%;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            ">
                <h3 style="margin: 0 0 12px; font-size: 16px; font-weight: 600;">
                    Tạo đơn mua hàng trên TPOS?
                </h3>
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px;">
                    Đã xuất <strong>${exportedCount}</strong> sản phẩm. Bạn có muốn tạo đơn mua hàng trực tiếp trên TPOS?
                </p>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px;">
                    <div><strong>NCC:</strong> ${ncc.name}</div>
                    <div><strong>TPOS ID:</strong> ${ncc.tposId}</div>
                    <div><strong>Số SP:</strong> ${exportedCount}</div>
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="btnSkipTPOS" style="
                        padding: 10px 20px; border: 1px solid #d1d5db; border-radius: 8px;
                        background: white; cursor: pointer; font-size: 14px;
                    ">Bỏ qua</button>
                    <button id="btnConfirmTPOS" style="
                        padding: 10px 20px; border: none; border-radius: 8px;
                        background: #16a34a; color: white; cursor: pointer;
                        font-size: 14px; font-weight: 500;
                    ">Tạo đơn TPOS</button>
                </div>
            </div>
        `;

        document.body.appendChild(confirmOverlay);

        confirmOverlay.querySelector('#btnSkipTPOS').addEventListener('click', () => {
            confirmOverlay.remove();
        });
        confirmOverlay.addEventListener('click', (e) => {
            if (e.target === confirmOverlay) confirmOverlay.remove();
        });

        confirmOverlay.querySelector('#btnConfirmTPOS').addEventListener('click', async () => {
            const btn = confirmOverlay.querySelector('#btnConfirmTPOS');
            btn.disabled = true;
            btn.textContent = 'Đang tạo...';
            btn.style.opacity = '0.6';

            const result = await window.TPOSPurchase.createFromExcel(workbook, order);

            confirmOverlay.remove();

            if (result.success) {
                this.ui.showToast(
                    `Đã tạo đơn TPOS: ${result.poNumber || 'ID ' + result.poId} (${result.linesCount} SP)`,
                    'success'
                );

                // Update Firebase items with TPOS variant codes
                if (result.orderLines && itemCodeMap && order.id) {
                    try {
                        await this.updateItemsWithTPOSCodes(order, result.orderLines, itemCodeMap);
                    } catch (err) {
                        console.warn('[TPOSPurchase] Failed to update variant codes:', err);
                    }
                }
            }
        });
    }

    /**
     * Update Firebase order items with resolved product codes from TPOS PurchaseByExcel response
     * Maps OrderLine.Product.Barcode + Product.Id back to original items
     */
    async updateItemsWithTPOSCodes(order, orderLines, itemCodeMap) {
        if (!order.id || !order.items) return;

        const updatedItems = [...order.items];
        let updatedCount = 0;

        for (let i = 0; i < orderLines.length && i < itemCodeMap.length; i++) {
            const line = orderLines[i];
            const mapping = itemCodeMap[i];
            const barcode = line.Product?.Barcode || line.Product?.DefaultCode;
            const tposProductId = line.Product?.Id || line.ProductId;

            if (barcode && mapping.itemIndex < updatedItems.length) {
                const item = updatedItems[mapping.itemIndex];
                if (item.productCode !== barcode || !item.tposProductId) {
                    updatedItems[mapping.itemIndex] = {
                        ...item,
                        productCode: barcode,
                        tposProductId: tposProductId
                    };
                    updatedCount++;
                }
            }
        }

        if (updatedCount > 0) {
            const db = firebase.firestore();
            await db.collection('purchase_orders').doc(order.id).update({
                items: updatedItems
            });
            console.log(`[TPOSPurchase] Updated ${updatedCount} items with TPOS variant codes`);

            this.ui.showToast(`Đã cập nhật ${updatedCount} mã biến thể từ TPOS`, 'info');

            // Refresh table to show updated codes
            if (this.dataManager?.loadOrders) {
                this.dataManager.loadOrders(this.currentTab, true);
            }
        }
    }

    /**
     * Export "Mua Hàng" format - TPOS-importable 4 columns (Section 15)
     * Columns: Mã sản phẩm (*), Số lượng (*), Đơn giá, Chiết khấu (%)
     * Uses 3-case product code resolution with variant matching
     * @param {Array} orders - Orders to export (single order in array)
     * @returns {Promise<{exported: number, skipped: number, errors: string[]}>}
     */
    async exportMuaHang(orders, { download = true } = {}) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const order = orders[0];
        const allItems = order.items || [];
        if (allItems.length === 0) {
            return { exported: 0, skipped: 0, errors: ['Đơn hàng không có sản phẩm nào'] };
        }

        // Load products CSV for variant lookup (CASE 3)
        const productsCSV = await loadProductsCSV();

        const excelRows = [];
        const skippedErrors = [];
        const itemCodeMap = []; // Track resolved code → item index for TPOS update

        for (let i = 0; i < allItems.length; i++) {
            const item = allItems[i];
            let productCode = null;

            // CASE 1: Already has tposProductId → use productCode directly
            if (item.tposProductId) {
                productCode = item.productCode;
            }
            // CASE 2: No variant → use productCode directly
            else if (!item.variant || item.variant.trim() === '') {
                productCode = item.productCode;
            }
            // CASE 3: Has variant + no tposProductId → 3-step fallback
            else {
                // Step 1: Find variant match in products CSV by base_product_code
                const candidates = productsCSV.filter(
                    row => row.base_product_code === item.productCode
                        && row.variant && row.variant.trim() !== ''
                );

                const matched = candidates.find(
                    row => variantsMatch(row.variant, item.variant)
                );

                if (matched) {
                    productCode = matched.product_code;
                } else {
                    // Step 2: Check if productCode exists as exact product_code in CSV
                    // BUT skip base codes that have variant children (TPOS only has variant-level codes)
                    const exactMatch = productsCSV.find(
                        row => row.product_code === item.productCode
                    );
                    const hasVariantsInCSV = candidates.length > 0 || productsCSV.some(
                        row => row.base_product_code === item.productCode
                            && row.variant && row.variant.trim() !== ''
                    );

                    if (exactMatch && !hasVariantsInCSV) {
                        productCode = item.productCode;
                    } else {
                        // Step 3: Search TPOS for variant codes using startswith
                        try {
                            const resp = await window.TPOSClient?.authenticatedFetch(
                                `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Product?$filter=startswith(DefaultCode,'${encodeURIComponent(item.productCode)}')&$top=50&$select=Id,DefaultCode,NameGet`
                            );
                            if (resp?.ok) {
                                const fetchData = await resp.json();
                                const tposVariants = fetchData.value || [];
                                if (tposVariants.length > 0 && item.variant) {
                                    // Try to match by variant name
                                    const extractAttrs = (nameGet) => {
                                        if (!nameGet) return [];
                                        const m = nameGet.match(/\(([^)]+)\)\s*$/);
                                        return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
                                    };
                                    const variantMatch = tposVariants.find(v => {
                                        const vAttrs = extractAttrs(v.NameGet).join(', ');
                                        return variantsMatch(vAttrs, item.variant);
                                    });
                                    if (variantMatch) {
                                        productCode = variantMatch.DefaultCode;
                                        console.log(`[ExportMH] Matched variant "${item.variant}" → ${variantMatch.DefaultCode}`);
                                    }
                                } else if (tposVariants.length === 1) {
                                    // Single product, no variants
                                    productCode = tposVariants[0].DefaultCode;
                                }
                            }
                        } catch (err) {
                            console.warn('[ExportMH] TPOS variant search failed for', item.productCode, err);
                        }
                    }
                }

                // All steps failed → skip
                if (!productCode) {
                    const candidateCodes = candidates.map(c => c.product_code).slice(0, 3).join(', ');
                    skippedErrors.push(
                        `❌ ${item.productCode} - ${item.productName || ''} (Variant: ${item.variant}${candidateCodes ? ', Có trong kho: [' + candidateCodes + ']' : ''})`
                    );
                    continue;
                }
            }

            itemCodeMap.push({ itemIndex: i, resolvedCode: productCode });

            excelRows.push({
                'Mã sản phẩm (*)': productCode,
                'Số lượng (*)': item.quantity || 0,
                'Đơn giá': item.purchasePrice || 0,
                'Chiết khấu (%)': 0
            });
        }

        if (excelRows.length === 0) {
            return { exported: 0, skipped: skippedErrors.length, errors: skippedErrors };
        }

        // Create workbook with json_to_sheet (preserves column headers as keys)
        const ws = XLSX.utils.json_to_sheet(excelRows);

        // Set column widths
        ws['!cols'] = [
            { wch: 25 },  // Mã sản phẩm
            { wch: 12 },  // Số lượng
            { wch: 12 },  // Đơn giá
            { wch: 14 }   // Chiết khấu
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mua Hàng');

        // Filename: MuaHang_{AxCode}_{DD-MM}.xlsx (e.g. MuaHang_A12_24-02.xlsx)
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const ncc = window.NCCManager?.findByName(order.supplier?.name);
        const supplierLabel = ncc?.code || order.orderNumber || 'Export';
        const filename = `MuaHang_${supplierLabel}_${dd}-${mm}.xlsx`;

        if (download) {
            XLSX.writeFile(wb, filename);
        }

        return {
            exported: excelRows.length,
            skipped: skippedErrors.length,
            errors: skippedErrors,
            workbook: wb,
            order: order,
            itemCodeMap: itemCodeMap
        };
    }

    /**
     * Export "Thêm SP" format - 17 columns for adding products to TPOS
     * @param {Array} orders - Orders to export
     */
    exportThemSP(orders) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const data = [];

        // Header row - 17 columns matching TPOS import template
        data.push([
            'Mã sản phẩm',      // 1
            'Tên sản phẩm',     // 2
            'Mô tả',            // 3
            'Danh mục',         // 4
            'Giá bán',          // 5
            'Giá vốn',          // 6
            'Tồn kho',          // 7
            'Đơn vị tính',      // 8
            'Barcode',          // 9
            'Trọng lượng (g)',  // 10
            'Dài (cm)',         // 11
            'Rộng (cm)',        // 12
            'Cao (cm)',         // 13
            'Thương hiệu',      // 14
            'Xuất xứ',          // 15
            'Ghi chú',          // 16
            'Hình ảnh URL'      // 17
        ]);

        orders.forEach(order => {
            (order.items || []).forEach((item) => {
                const productName = item.variant
                    ? `${item.productName} - ${item.variant}`
                    : item.productName;

                data.push([
                    item.productCode || '',           // Mã sản phẩm
                    productName || '',                // Tên sản phẩm
                    '',                               // Mô tả
                    '',                               // Danh mục
                    item.sellingPrice || 0,           // Giá bán
                    item.purchasePrice || 0,          // Giá vốn
                    item.quantity || 0,               // Tồn kho
                    'Cái',                            // Đơn vị tính
                    '',                               // Barcode
                    '',                               // Trọng lượng
                    '',                               // Dài
                    '',                               // Rộng
                    '',                               // Cao
                    order.supplier?.name || '',       // Thương hiệu (using supplier)
                    '',                               // Xuất xứ
                    `Đơn hàng: ${order.orderNumber}`, // Ghi chú
                    (item.productImages && item.productImages.length > 0 ? item.productImages[0] : item.tposImageUrl) || '' // Hình ảnh URL
                ]);
            });
        });

        // Create workbook
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 15 },  // Mã SP
            { wch: 40 },  // Tên SP
            { wch: 30 },  // Mô tả
            { wch: 15 },  // Danh mục
            { wch: 12 },  // Giá bán
            { wch: 12 },  // Giá vốn
            { wch: 10 },  // Tồn kho
            { wch: 10 },  // Đơn vị
            { wch: 15 },  // Barcode
            { wch: 12 },  // Trọng lượng
            { wch: 8 },   // Dài
            { wch: 8 },   // Rộng
            { wch: 8 },   // Cao
            { wch: 20 },  // Thương hiệu
            { wch: 15 },  // Xuất xứ
            { wch: 25 },  // Ghi chú
            { wch: 50 }   // Hình ảnh URL
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Thêm SP');

        // Filename
        const filename = orders.length === 1
            ? `TSP_${orders[0].orderNumber}.xlsx`
            : `TSP_${new Date().toISOString().slice(0, 10)}_${orders.length}don.xlsx`;

        XLSX.writeFile(wb, filename);
    }

    /**
     * Export full order details to Excel
     * @param {Array} orders - Orders to export
     */
    exportOrderToExcelFull(orders) {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const data = [];

        orders.forEach((order, orderIndex) => {
            if (orderIndex > 0) {
                data.push(['']); // Separator between orders
            }

            // Order header
            data.push(['ĐƠN ĐẶT HÀNG', '', '', '', '', '', '', '']);
            data.push(['Mã đơn:', order.orderNumber, '', 'Ngày đặt:', this.config.formatDate(order.orderDate), '', '', '']);
            data.push(['Nhà cung cấp:', order.supplier?.name || '', '', 'Trạng thái:', this.config.STATUS_LABELS[order.status] || order.status, '', '', '']);
            data.push(['Ghi chú:', order.notes || '', '', '', '', '', '', '']);
            data.push(['']);

            // Items header
            data.push(['STT', 'Tên sản phẩm', 'Mã SP', 'Biến thể', 'SL', 'Giá mua', 'Giá bán', 'Thành tiền']);

            // Add items
            (order.items || []).forEach((item, index) => {
                data.push([
                    index + 1,
                    item.productName || '',
                    item.productCode || '',
                    item.variant || '',
                    item.quantity || 0,
                    item.purchasePrice || 0,
                    item.sellingPrice || 0,
                    item.subtotal || ((item.purchasePrice || 0) * (item.quantity || 0))
                ]);
            });

            // Add totals
            data.push(['']);
            data.push(['', '', '', '', '', '', 'Tổng tiền:', order.totalAmount || 0]);
            data.push(['', '', '', '', '', '', 'Giảm giá:', order.discountAmount || 0]);
            data.push(['', '', '', '', '', '', 'Phí ship:', order.shippingFee || 0]);
            data.push(['', '', '', '', '', '', 'THÀNH TIỀN:', order.finalAmount || 0]);
        });

        // Create workbook
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 5 },   // STT
            { wch: 35 },  // Tên SP
            { wch: 12 },  // Mã SP
            { wch: 15 },  // Biến thể
            { wch: 6 },   // SL
            { wch: 12 },  // Giá mua
            { wch: 12 },  // Giá bán
            { wch: 15 }   // Thành tiền
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Đơn hàng');

        // Filename
        const filename = orders.length === 1
            ? `${orders[0].orderNumber}.xlsx`
            : `DonHang_${new Date().toISOString().slice(0, 10)}_${orders.length}don.xlsx`;

        XLSX.writeFile(wb, filename);
    }

    /**
     * Handle copy order
     * @param {string} orderId
     */
    async handlePrintBarcode(orderId) {
        const order = await this.dataManager.getOrder(orderId);
        if (!order?.items?.length) {
            this.ui.showToast('Đơn hàng không có sản phẩm', 'warning');
            return;
        }
        window.BarcodeLabelDialog.open(order);
    }

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
     * Handle select all
     * @param {boolean} selected
     */
    handleSelectAll(selected) {
        if (selected) {
            // Select all current orders
            const orders = this.dataManager.getCurrentPageOrders();
            orders.forEach(order => {
                if (!this.dataManager.selectedIds.has(order.id)) {
                    this.dataManager.toggleSelection(order.id);
                }
            });
        } else {
            // Deselect all
            this.dataManager.clearSelection();
        }
        this.renderTableForCurrentPage();
    }

    /**
     * Handle clear selection
     */
    handleClearSelection() {
        this.dataManager.clearSelection();
        this.renderTableForCurrentPage();
    }

    /**
     * Handle bulk export
     */
    async handleBulkExport() {
        const selectedIds = Array.from(this.dataManager.selectedIds);
        if (selectedIds.length === 0) return;

        try {
            // Gather all selected orders
            const orders = [];
            for (const orderId of selectedIds) {
                const order = await this.dataManager.getOrder(orderId);
                if (order) {
                    orders.push(order);
                }
            }

            if (orders.length === 0) {
                this.ui.showToast('Không tìm thấy đơn hàng nào', 'error');
                return;
            }

            this.showPurchaseOrderPreview(orders);
        } catch (error) {
            console.error('Bulk export failed:', error);
            this.ui.showToast('Không thể xuất đơn hàng', 'error');
        }
    }

    /**
     * Handle bulk delete
     */
    async handleBulkDelete() {
        const selectedIds = Array.from(this.dataManager.selectedIds);
        if (selectedIds.length === 0) return;

        const confirmed = await this.ui.showConfirmDialog({
            title: 'Xóa nhiều đơn hàng',
            message: `Bạn có chắc muốn xóa ${selectedIds.length} đơn hàng? Hành động này không thể hoàn tác.`,
            confirmText: `Xóa ${selectedIds.length} đơn`,
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            let deletedCount = 0;
            let skippedCount = 0;

            for (const orderId of selectedIds) {
                const order = await this.dataManager.getOrder(orderId);
                if (order && this.config.canDeleteOrder(order.status)) {
                    await this.dataManager.deleteOrder(orderId);
                    deletedCount++;
                } else {
                    skippedCount++;
                }
            }

            this.dataManager.clearSelection();

            if (skippedCount > 0) {
                this.ui.showToast(`Đã xóa ${deletedCount} đơn, bỏ qua ${skippedCount} đơn không thể xóa`, 'warning');
            } else {
                this.ui.showToast(`Đã xóa ${deletedCount} đơn hàng`, 'success');
            }
        } catch (error) {
            console.error('Bulk delete failed:', error);
            this.ui.showToast('Không thể xóa đơn hàng', 'error');
        }
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
     * Handle view order detail (double click)
     * @param {string} orderId
     */
    async handleViewDetail(orderId) {
        const order = await this.dataManager.getOrder(orderId);

        if (!order) {
            this.ui.showToast('Không tìm thấy đơn hàng', 'error');
            return;
        }

        // Open detail dialog
        window.orderDetailDialog.open(order, {
            onRetry: async (id) => {
                try {
                    // Reset sync status for failed items and trigger re-sync
                    await this.dataManager.retrySyncFailedItems(id);
                    this.ui.showToast('Đang thử lại đồng bộ...', 'info');
                } catch (error) {
                    this.ui.showToast('Không thể thử lại đồng bộ', 'error');
                }
            }
        });
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
