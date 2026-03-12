/**
 * PURCHASE ORDERS MODULE - TABLE RENDERER
 * File: table-renderer.js
 * Purpose: Render purchase orders table with row spanning, image zoom, sync status
 * Matches React app: PurchaseOrderList.tsx
 */

// ========================================
// TABLE RENDERER CLASS
// ========================================
class PurchaseOrderTableRenderer {
    constructor() {
        this.container = null;
        this.handlers = {};
        this.syncStatusMap = new Map(); // orderId -> { processing: number, failed: number }
        this.ordersToUnlock = new Map(); // orderId -> unlockTime
        this.pollingInterval = null;
        this._eventsBound = false;
    }

    /**
     * Initialize table renderer
     * @param {HTMLElement} container - Table container
     * @param {Object} handlers - Event handlers
     */
    init(container, handlers = {}) {
        this.container = container;
        this.handlers = handlers;

        // Start polling for sync status updates
        this.startSyncStatusPolling();
    }

    /**
     * Cleanup polling interval
     */
    destroy() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // ========================================
    // SYNC STATUS POLLING
    // ========================================

    /**
     * Start polling for sync status updates
     */
    startSyncStatusPolling() {
        // Poll every 3 seconds like React app
        this.pollingInterval = setInterval(() => {
            this.updateSyncStatusDisplay();
        }, 3000);
    }

    /**
     * Update sync status for all visible orders
     */
    async updateSyncStatusDisplay() {
        const rows = this.container?.querySelectorAll('.order-row--first');
        if (!rows || rows.length === 0) return;

        // Get all order IDs
        const orderIds = Array.from(rows).map(row => row.dataset.orderId).filter(Boolean);

        // Update sync status badges
        rows.forEach(row => {
            const orderId = row.dataset.orderId;
            const statusCell = row.querySelector('.sync-status-cell');
            if (statusCell && this.syncStatusMap.has(orderId)) {
                const status = this.syncStatusMap.get(orderId);
                statusCell.innerHTML = this.renderSyncStatusBadges(status);
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
        });
    }

    /**
     * Set sync status for an order
     * @param {string} orderId
     * @param {Object} status - { processing: number, failed: number }
     */
    setSyncStatus(orderId, status) {
        this.syncStatusMap.set(orderId, status);
    }

    /**
     * Check if order is processing
     * @param {string} orderId
     * @returns {boolean}
     */
    isOrderProcessing(orderId) {
        const now = Date.now();
        const unlockTime = this.ordersToUnlock.get(orderId);
        const status = this.syncStatusMap.get(orderId);

        return (
            (status?.processing ?? 0) > 0 ||
            (unlockTime !== undefined && now < unlockTime)
        );
    }

    // ========================================
    // MAIN RENDER FUNCTION
    // ========================================

    /**
     * Render orders table with bulk action toolbar
     * @param {Array} orders - Array of orders
     * @param {Set} selectedIds - Set of selected order IDs
     */
    render(orders, selectedIds = new Set()) {
        if (!this.container) return;

        if (!orders || orders.length === 0) {
            this.renderEmpty();
            return;
        }

        const allSelected = orders.length > 0 && orders.every(o => selectedIds.has(o.id));

        const tableHTML = `
            <!-- Bulk Action Toolbar -->
            ${this.renderBulkActionToolbar(selectedIds, orders.length, orders)}

            <div class="table-wrapper">
                <table class="po-table">
                    <thead>
                        ${this.renderTableHeader(allSelected, orders.length)}
                    </thead>
                    <tbody>
                        ${this.renderTableBody(orders, selectedIds)}
                    </tbody>
                </table>
            </div>
        `;

        this.container.innerHTML = tableHTML;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind event handlers
        this.bindEvents();
    }

    /**
     * Render bulk action toolbar (shown when items selected)
     * @param {Set} selectedIds
     * @param {number} totalOrders
     * @returns {string} HTML string
     */
    renderBulkActionToolbar(selectedIds, totalOrders, orders = []) {
        const selectedCount = selectedIds.size;

        if (selectedCount === 0) {
            return '';
        }

        const allDrafts = orders.length > 0 && orders.every(o => o.status === 'DRAFT');

        return `
            <div class="bulk-action-toolbar">
                <div class="bulk-action-toolbar__info">
                    <span class="bulk-action-toolbar__count">${selectedCount}</span>
                    <span>đơn hàng đã chọn</span>
                </div>
                <div class="bulk-action-toolbar__actions">
                    ${!allDrafts ? `
                    <button class="btn btn-outline btn-sm" data-bulk-action="export">
                        <i data-lucide="download"></i>
                        <span>Xuất Excel</span>
                    </button>
                    ` : ''}
                    <button class="btn btn-outline btn-sm btn-danger" data-bulk-action="delete">
                        <i data-lucide="trash-2"></i>
                        <span>Xóa ${selectedCount} đơn</span>
                    </button>
                    <button class="btn btn-ghost btn-sm" data-bulk-action="clear">
                        <i data-lucide="x"></i>
                        <span>Bỏ chọn</span>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render table header with select all checkbox
     * @param {boolean} allSelected
     * @param {number} totalOrders
     * @returns {string} HTML string
     */
    renderTableHeader(allSelected, totalOrders) {
        return `
            <tr>
                <th class="col-date">Ngày đặt</th>
                <th class="col-supplier">Nhà cung cấp</th>
                <th class="col-invoice">Hóa đơn (VND)</th>
                <th class="col-product">Tên sản phẩm</th>
                <th class="col-code">Mã SP</th>
                <th class="col-variant">Biến thể</th>
                <th class="col-qty">SL</th>
                <th class="col-purchase-price">Giá mua (VND)</th>
                <th class="col-selling-price">Giá bán (VND)</th>
                <th class="col-notes">Ghi chú</th>
                <th class="col-status">Trạng thái</th>
                <th class="col-actions">
                    <div class="col-actions__header">
                        <span>Thao tác</span>
                        <label class="checkbox-wrapper checkbox-wrapper--header" title="Chọn tất cả">
                            <input type="checkbox"
                                   class="select-all-checkbox"
                                   ${allSelected && totalOrders > 0 ? 'checked' : ''}>
                            <span class="checkmark"></span>
                        </label>
                    </div>
                </th>
            </tr>
        `;
    }

    /**
     * Render table body with row spanning
     * @param {Array} orders - Array of orders
     * @param {Set} selectedIds - Set of selected order IDs
     * @returns {string} HTML string
     */
    renderTableBody(orders, selectedIds) {
        return orders.map(order => this.renderOrderRows(order, selectedIds)).join('');
    }

    /**
     * Render order rows with proper row spanning (matches React app)
     * @param {Object} order - Order data
     * @param {Set} selectedIds - Set of selected order IDs
     * @returns {string} HTML string
     */
    renderOrderRows(order, selectedIds) {
        const config = window.PurchaseOrderConfig;
        const items = order.items || [];
        const rowSpan = Math.max(items.length, 1);
        const isSelected = selectedIds.has(order.id);
        const canEdit = config.canEditOrder(order.status);
        const canDelete = config.canDeleteOrder(order.status);
        const isProcessing = this.isOrderProcessing(order.id);

        // Calculate price mismatch
        const calculatedTotal = items.reduce((sum, item) =>
            sum + ((item.purchasePrice || 0) * (item.quantity || 0)), 0);
        const calculatedFinalAmount = calculatedTotal - (order.discountAmount || 0) + (order.shippingFee || 0);
        const hasPriceMismatch = Math.abs(calculatedFinalAmount - (order.finalAmount || 0)) > 0.01;

        // If no items, render a single row
        if (items.length === 0) {
            return `
                <tr class="order-row order-row--first ${isSelected ? 'selected' : ''} ${isProcessing ? 'order-row--processing' : ''}"
                    data-order-id="${order.id}">
                    ${this.renderSpannedCells(order, 1, isSelected, hasPriceMismatch, calculatedFinalAmount)}
                    <td class="col-product" colspan="8">
                        <span class="text-muted">Chưa có sản phẩm</span>
                    </td>
                    ${this.renderActionCell(order, 1, isSelected, canEdit, canDelete, isProcessing)}
                </tr>
            `;
        }

        // Render rows with row spanning
        return items.map((item, index) => {
            const isFirstRow = index === 0;

            if (isFirstRow) {
                return `
                    <tr class="order-row order-row--first ${isSelected ? 'selected' : ''} ${isProcessing ? 'order-row--processing' : ''}"
                        data-order-id="${order.id}">
                        ${this.renderSpannedCells(order, rowSpan, isSelected, hasPriceMismatch, calculatedFinalAmount)}
                        ${this.renderItemCells(item, order.notes)}
                        ${this.renderStatusCell(order, rowSpan)}
                        ${this.renderActionCell(order, rowSpan, isSelected, canEdit, canDelete, isProcessing)}
                    </tr>
                `;
            } else {
                return `
                    <tr class="order-row ${isSelected ? 'selected' : ''} ${isProcessing ? 'order-row--processing' : ''}"
                        data-order-id="${order.id}">
                        ${this.renderItemCells(item)}
                    </tr>
                `;
            }
        }).join('');
    }

    /**
     * Render cells that span multiple rows (order-level data)
     * @param {Object} order - Order data
     * @param {number} rowSpan - Number of rows to span
     * @param {boolean} isSelected - Is order selected
     * @param {boolean} hasPriceMismatch - Has price mismatch
     * @param {number} calculatedFinalAmount - Calculated total
     * @returns {string} HTML string
     */
    renderSpannedCells(order, rowSpan, isSelected, hasPriceMismatch, calculatedFinalAmount) {
        const config = window.PurchaseOrderConfig;
        const totalQuantity = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

        return `
            <!-- Ngày đặt -->
            <td class="col-date" rowspan="${rowSpan}">
                <div class="cell-date">
                    <i data-lucide="calendar" class="cell-icon"></i>
                    <div class="date-info">
                        <div class="date-main">${this.formatDateFull(order.orderDate)}</div>
                        <div class="date-time">(${this.formatDateShort(order.createdAt)} ${this.formatTimeOnly(order.createdAt)})</div>
                    </div>
                </div>
            </td>

            <!-- Nhà cung cấp -->
            <td class="col-supplier" rowspan="${rowSpan}">
                <div class="cell-supplier">
                    <div class="supplier-name">${order.supplier?.name || 'Chưa cập nhật'}</div>
                    <div class="supplier-meta">
                        <span class="text-muted">Tổng SL: ${totalQuantity}</span>
                    </div>
                </div>
            </td>

            <!-- Hóa đơn -->
            <td class="col-invoice ${hasPriceMismatch ? 'col-invoice--mismatch' : ''}" rowspan="${rowSpan}">
                <div class="cell-invoice">
                    ${this.renderInvoiceImages(order.invoiceImages)}
                    <div class="invoice-amounts">
                        <div class="invoice-amount invoice-amount--main">${config.formatVND(order.finalAmount || 0)}</div>
                        ${hasPriceMismatch ? `
                            <div class="invoice-amount invoice-amount--calculated">
                                Thành tiền: ${config.formatVND(calculatedFinalAmount)}
                            </div>
                        ` : ''}
                        ${order.discountAmount ? `<div class="invoice-detail text-muted" style="font-size:11px;">Giảm: ${config.formatVND(order.discountAmount)}</div>` : ''}
                        ${order.shippingFee ? `<div class="invoice-detail text-muted" style="font-size:11px;">Ship: ${config.formatVND(order.shippingFee)}</div>` : ''}
                    </div>
                </div>
            </td>
        `;
    }

    /**
     * Render item-level cells (non-spanning)
     * @param {Object} item - Order item data
     * @returns {string} HTML string
     */
    renderItemCells(item, orderNotes) {
        const config = window.PurchaseOrderConfig;
        const hasDeletedProduct = !item.productName;
        const productName = item.productName || 'Sản phẩm đã xóa';

        return `
            <!-- Tên sản phẩm -->
            <td class="col-product ${hasDeletedProduct ? 'col-product--deleted' : ''}">
                <div class="cell-product">
                    <div class="product-name" title="${productName}">${productName}</div>
                </div>
            </td>

            <!-- Mã SP -->
            <td class="col-code">
                ${item.parentProductCode ? `<span style="color:#6b7280;font-size:11px;">${item.parentProductCode}</span><br>` : ''}
                <span class="product-code">${item.productCode || '-'}</span>
            </td>

            <!-- Biến thể -->
            <td class="col-variant">
                <span class="variant-badge">${this.formatVariant(item.variant)}</span>
            </td>

            <!-- Số lượng -->
            <td class="col-qty">
                <span class="qty-value">${item.quantity || 0}</span>
            </td>

            <!-- Giá mua với hình ảnh -->
            <td class="col-purchase-price">
                <div class="cell-price">
                    ${this.renderPriceImages(item.priceImages)}
                    <span class="price-value">${config.formatVND(item.purchasePrice || 0)}</span>
                </div>
            </td>

            <!-- Giá bán với hình ảnh sản phẩm -->
            <td class="col-selling-price">
                <div class="cell-price">
                    ${this.renderProductImages(item.productImages && item.productImages.length > 0 ? item.productImages : (item.tposImageUrl ? [item.tposImageUrl] : null))}
                    <span class="price-value">${config.formatVND(item.sellingPrice || 0)}</span>
                </div>
            </td>

            <!-- Ghi chú item -->
            <td class="col-notes">
                ${orderNotes ? `
                    <div class="notes-hover" title="${orderNotes}" style="color: #4b5563; font-style: italic;">
                        <span class="notes-text">${this.truncate(orderNotes, 20)}</span>
                    </div>
                ` : ''}
                ${item.notes ? `
                    <div class="notes-hover" title="${item.notes}">
                        <span class="notes-text">${this.truncate(item.notes, 20)}</span>
                    </div>
                ` : ''}
            </td>
        `;
    }

    /**
     * Render status cell with sync badges
     * @param {Object} order
     * @param {number} rowSpan
     * @returns {string} HTML string
     */
    renderStatusCell(order, rowSpan) {
        const config = window.PurchaseOrderConfig;
        const syncStatus = this.syncStatusMap.get(order.id);

        return `
            <td class="col-status" rowspan="${rowSpan}">
                <div class="cell-status">
                    ${config.getStatusBadgeHTML(order.status)}
                    <div class="sync-status-cell">
                        ${syncStatus ? this.renderSyncStatusBadges(syncStatus) : ''}
                    </div>
                </div>
            </td>
        `;
    }

    /**
     * Render sync status badges
     * @param {Object} status - { processing: number, failed: number }
     * @returns {string} HTML string
     */
    renderSyncStatusBadges(status) {
        let html = '';

        if (status.processing > 0) {
            html += `
                <span class="sync-badge sync-badge--processing">
                    <i data-lucide="loader-2" class="spin"></i>
                    <span>Đang xử lý</span>
                </span>
            `;
        }

        if (status.failed > 0 && status.processing === 0) {
            html += `
                <span class="sync-badge sync-badge--failed">
                    <i data-lucide="alert-circle"></i>
                    <span>${status.failed} lỗi</span>
                </span>
            `;
        }

        return html;
    }

    /**
     * Render action cell with buttons
     * @param {Object} order
     * @param {number} rowSpan
     * @param {boolean} isSelected
     * @param {boolean} canEdit
     * @param {boolean} canDelete
     * @param {boolean} isProcessing
     * @returns {string} HTML string
     */
    renderActionCell(order, rowSpan, isSelected, canEdit, canDelete, isProcessing) {
        const isDraft = order.status === 'DRAFT';
        const items = order.items || [];
        const canPrintBarcode = isDraft && items.length > 0 && items.every(item => !!item.tposProductId);

        return `
            <td class="col-actions" rowspan="${rowSpan}">
                <div class="action-buttons">
                    <!-- Edit button (different icon for draft vs non-draft) -->
                    <button class="btn-icon btn-sm ${!canEdit || isProcessing ? 'disabled' : ''}"
                            title="${isDraft ? 'Chỉnh sửa nháp' : 'Chỉnh sửa đơn hàng'}"
                            data-action="edit"
                            data-order-id="${order.id}"
                            ${!canEdit || isProcessing ? 'disabled' : ''}>
                        <i data-lucide="pencil" class="${isDraft ? 'text-amber' : 'text-blue'}"></i>
                    </button>

                    <!-- Export Excel (not available for drafts) -->
                    ${!isDraft ? `
                    <button class="btn-icon btn-sm ${isProcessing ? 'disabled' : ''}"
                            title="Xuất Excel mua hàng"
                            data-action="export"
                            data-order-id="${order.id}"
                            ${isProcessing ? 'disabled' : ''}>
                        <i data-lucide="file-down" class="text-green"></i>
                    </button>
                    ` : ''}

                    <!-- Print barcode (only for drafts with all items from inventory) -->
                    ${canPrintBarcode ? `
                    <button class="btn-icon btn-sm ${isProcessing ? 'disabled' : ''}"
                            title="In tem barcode"
                            data-action="print-barcode"
                            data-order-id="${order.id}"
                            ${isProcessing ? 'disabled' : ''}>
                        <i data-lucide="printer" class="text-teal"></i>
                    </button>
                    ` : ''}

                    <!-- Copy order -->
                    <button class="btn-icon btn-sm ${isProcessing ? 'disabled' : ''}"
                            title="Sao chép đơn hàng"
                            data-action="copy"
                            data-order-id="${order.id}"
                            ${isProcessing ? 'disabled' : ''}>
                        <i data-lucide="copy" class="text-purple"></i>
                    </button>

                    <!-- Delete -->
                    <button class="btn-icon btn-sm btn-danger ${!canDelete || isProcessing ? 'disabled' : ''}"
                            title="${canDelete ? 'Xóa toàn bộ đơn hàng' : 'Không thể xóa đơn này'}"
                            data-action="delete"
                            data-order-id="${order.id}"
                            ${!canDelete || isProcessing ? 'disabled' : ''}>
                        <i data-lucide="trash-2"></i>
                    </button>

                    <!-- Checkbox -->
                    <label class="checkbox-wrapper ${isProcessing ? 'disabled' : ''}" title="Chọn đơn hàng">
                        <input type="checkbox"
                               class="order-checkbox"
                               data-order-id="${order.id}"
                               ${isSelected ? 'checked' : ''}
                               ${isProcessing ? 'disabled' : ''}>
                        <span class="checkmark"></span>
                    </label>
                </div>
            </td>
        `;
    }

    // ========================================
    // IMAGE RENDER FUNCTIONS (with zoom)
    // ========================================

    /**
     * Render invoice images with zoom on hover
     * @param {Array} images - Array of image URLs
     * @returns {string} HTML string
     */
    renderInvoiceImages(images) {
        if (!images || images.length === 0) {
            return `
                <div class="invoice-thumb invoice-thumb--empty">
                    <i data-lucide="image-off"></i>
                </div>
            `;
        }

        return `
            <div class="invoice-thumb image-zoom-container" data-action="view-invoice" data-images='${JSON.stringify(images)}'>
                <img src="${images[0]}" alt="Hóa đơn" loading="lazy" class="zoomable-image">
                ${images.length > 1 ? `<span class="thumb-count">+${images.length - 1}</span>` : ''}
            </div>
        `;
    }

    /**
     * Render price images (purchase price proof)
     * @param {Array} images
     * @returns {string} HTML string
     */
    renderPriceImages(images) {
        if (!images || images.length === 0) {
            return '<span class="text-muted text-xs">Chưa có hình</span>';
        }

        return `
            <div class="price-images image-zoom-container">
                ${images.slice(0, 2).map((url, index) => `
                    <img src="${url}" alt="Giá mua ${index + 1}"
                         class="mini-thumb zoomable-image" loading="lazy">
                `).join('')}
            </div>
        `;
    }

    /**
     * Render product images
     * @param {Array} images
     * @returns {string} HTML string
     */
    renderProductImages(images) {
        if (!images || images.length === 0) {
            return '<span class="text-muted text-xs">Chưa có hình</span>';
        }

        return `
            <div class="product-images image-zoom-container">
                ${images.slice(0, 2).map((url, index) => `
                    <img src="${url}" alt="Sản phẩm ${index + 1}"
                         class="mini-thumb zoomable-image" loading="lazy">
                `).join('')}
            </div>
        `;
    }

    // ========================================
    // EMPTY & LOADING STATES
    // ========================================

    /**
     * Render empty state
     */
    renderEmpty() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="table-empty">
                <div class="table-empty__icon">
                    <i data-lucide="inbox"></i>
                </div>
                <div class="table-empty__title">Không có đơn hàng nào</div>
                <div class="table-empty__description">
                    Chưa có đơn hàng nào trong danh sách này
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Render loading skeleton
     */
    renderSkeleton() {
        if (!this.container) return;

        const skeletonRows = Array(5).fill(0).map(() => `
            <tr class="skeleton-row">
                <td class="col-date"><div class="skeleton" style="width: 80px; height: 40px;"></div></td>
                <td class="col-supplier"><div class="skeleton" style="width: 100px; height: 40px;"></div></td>
                <td class="col-invoice"><div class="skeleton" style="width: 80px; height: 60px;"></div></td>
                <td class="col-product"><div class="skeleton" style="width: 200px; height: 20px;"></div></td>
                <td class="col-code"><div class="skeleton" style="width: 60px; height: 20px;"></div></td>
                <td class="col-variant"><div class="skeleton" style="width: 40px; height: 20px;"></div></td>
                <td class="col-qty"><div class="skeleton" style="width: 30px; height: 20px;"></div></td>
                <td class="col-purchase-price"><div class="skeleton" style="width: 80px; height: 20px;"></div></td>
                <td class="col-selling-price"><div class="skeleton" style="width: 80px; height: 20px;"></div></td>
                <td class="col-notes"><div class="skeleton" style="width: 60px; height: 20px;"></div></td>
                <td class="col-status"><div class="skeleton" style="width: 70px; height: 24px;"></div></td>
                <td class="col-actions"><div class="skeleton" style="width: 120px; height: 32px;"></div></td>
            </tr>
        `).join('');

        this.container.innerHTML = `
            <div class="table-wrapper">
                <table class="po-table po-table--loading">
                    <thead>${this.renderTableHeader(false, 0)}</thead>
                    <tbody>${skeletonRows}</tbody>
                </table>
            </div>
        `;
    }

    // ========================================
    // EVENT BINDING
    // ========================================

    /**
     * Bind event handlers to table
     */
    bindEvents() {
        if (!this.container || this._eventsBound) return;
        this._eventsBound = true;

        // Action buttons
        this.container.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const orderId = target.dataset.orderId;
            const itemId = target.dataset.itemId;

            switch (action) {
                case 'edit':
                    this.handlers.onEdit?.(orderId);
                    break;
                case 'export':
                    this.handlers.onExport?.(orderId);
                    break;
                case 'copy':
                    this.handlers.onCopy?.(orderId);
                    break;
                case 'print-barcode':
                    this.handlers.onPrintBarcode?.(orderId);
                    break;
                case 'delete':
                    this.handlers.onDelete?.(orderId);
                    break;
                case 'view-images':
                    this.handlers.onViewImages?.(itemId);
                    break;
                case 'view-invoice':
                    const images = JSON.parse(target.dataset.images || '[]');
                    this.handlers.onViewInvoice?.(images);
                    break;
                case 'view-detail':
                    this.handlers.onViewDetail?.(orderId);
                    break;
            }
        });

        // Bulk action buttons
        this.container.addEventListener('click', (e) => {
            const bulkButton = e.target.closest('[data-bulk-action]');
            if (!bulkButton) return;

            const action = bulkButton.dataset.bulkAction;

            switch (action) {
                case 'export':
                    this.handlers.onBulkExport?.();
                    break;
                case 'delete':
                    this.handlers.onBulkDelete?.();
                    break;
                case 'clear':
                    this.handlers.onClearSelection?.();
                    break;
            }
        });

        // Select all checkbox
        const selectAllCheckbox = this.container.querySelector('.select-all-checkbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                this.handlers.onSelectAll?.(e.target.checked);
            });
        }

        // Individual checkbox changes
        this.container.addEventListener('change', (e) => {
            const checkbox = e.target.closest('.order-checkbox');
            if (!checkbox) return;

            const orderId = checkbox.dataset.orderId;
            this.handlers.onSelect?.(orderId, checkbox.checked);
        });

        // Row click for detail view
        this.container.addEventListener('dblclick', (e) => {
            const row = e.target.closest('.order-row');
            if (!row) return;

            // Ignore if clicking on action buttons or checkboxes
            if (e.target.closest('[data-action]') || e.target.closest('.order-checkbox')) return;

            const orderId = row.dataset.orderId;
            this.handlers.onViewDetail?.(orderId);
        });
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    /**
     * Format date to full format (dd/mm/yyyy)
     * @param {Date|Object} date
     * @returns {string}
     */
    formatDateFull(date) {
        if (!date) return '-';

        if (date.toDate) {
            date = date.toDate();
        }

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    }

    /**
     * Format date to short format (dd/mm)
     * @param {Date|Object} date
     * @returns {string}
     */
    formatDateShort(date) {
        if (!date) return '-';

        if (date.toDate) {
            date = date.toDate();
        }

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');

        return `${day}/${month}`;
    }

    /**
     * Format time only (HH:mm)
     * @param {Date|Object} date
     * @returns {string}
     */
    formatTimeOnly(date) {
        if (!date) return '';

        if (date.toDate) {
            date = date.toDate();
        }

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${hours}:${minutes}`;
    }

    /**
     * Format variant for display (like React formatVariantForDisplay)
     * @param {string} variant
     * @returns {string}
     */
    formatVariant(variant) {
        if (!variant || variant === '-') return '-';
        return variant;
    }

    /**
     * Truncate text with ellipsis
     * @param {string} text
     * @param {number} maxLength
     * @returns {string}
     */
    truncate(text, maxLength) {
        if (!text || text.length <= maxLength) return text || '';
        return text.substring(0, maxLength) + '...';
    }

    /**
     * Update selection state without full re-render
     * @param {string} orderId
     * @param {boolean} isSelected
     */
    updateSelection(orderId, isSelected) {
        if (!this.container) return;

        const rows = this.container.querySelectorAll(`[data-order-id="${orderId}"]`);
        rows.forEach(row => {
            row.classList.toggle('selected', isSelected);
        });

        const checkbox = this.container.querySelector(`.order-checkbox[data-order-id="${orderId}"]`);
        if (checkbox) {
            checkbox.checked = isSelected;
        }
    }

    /**
     * Update select all checkbox state
     * @param {boolean} allSelected
     */
    updateSelectAllCheckbox(allSelected) {
        const selectAllCheckbox = this.container?.querySelector('.select-all-checkbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = allSelected;
        }
    }
}

// ========================================
// EXPORT SINGLETON INSTANCE
// ========================================
window.purchaseOrderTableRenderer = new PurchaseOrderTableRenderer();

console.log('[Purchase Orders] Table renderer loaded successfully');
