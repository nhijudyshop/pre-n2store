/**
 * PURCHASE ORDERS MODULE - TABLE RENDERER
 * File: table-renderer.js
 * Purpose: Render purchase orders table with row spanning
 */

// ========================================
// TABLE RENDERER CLASS
// ========================================
class PurchaseOrderTableRenderer {
    constructor() {
        this.container = null;
        this.handlers = {};
    }

    /**
     * Initialize table renderer
     * @param {HTMLElement} container - Table container
     * @param {Object} handlers - Event handlers
     */
    init(container, handlers = {}) {
        this.container = container;
        this.handlers = handlers;
    }

    // ========================================
    // MAIN RENDER FUNCTION
    // ========================================

    /**
     * Render orders table
     * @param {Array} orders - Array of orders
     * @param {Set} selectedIds - Set of selected order IDs
     */
    render(orders, selectedIds = new Set()) {
        if (!this.container) return;

        if (!orders || orders.length === 0) {
            this.renderEmpty();
            return;
        }

        const tableHTML = `
            <div class="table-wrapper">
                <table class="po-table">
                    <thead>
                        ${this.renderTableHeader()}
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
     * Render table header
     * @returns {string} HTML string
     */
    renderTableHeader() {
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
                <th class="col-actions">Thao tác</th>
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
     * Render rows for a single order with row spanning
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

        // If no items, render a single row
        if (items.length === 0) {
            return this.renderEmptyOrderRow(order, isSelected, canEdit, canDelete);
        }

        // Render rows with row spanning
        return items.map((item, index) => {
            const isFirstRow = index === 0;

            return `
                <tr class="order-row ${isSelected ? 'selected' : ''}" data-order-id="${order.id}">
                    ${isFirstRow ? this.renderSpannedCells(order, rowSpan, isSelected, canEdit, canDelete) : ''}
                    ${this.renderItemCells(item, order.status)}
                </tr>
            `;
        }).join('');
    }

    /**
     * Render cells that span multiple rows (order-level data)
     * @param {Object} order - Order data
     * @param {number} rowSpan - Number of rows to span
     * @param {boolean} isSelected - Is order selected
     * @param {boolean} canEdit - Can order be edited
     * @param {boolean} canDelete - Can order be deleted
     * @returns {string} HTML string
     */
    renderSpannedCells(order, rowSpan, isSelected, canEdit, canDelete) {
        const config = window.PurchaseOrderConfig;

        return `
            <!-- Ngày đặt -->
            <td class="col-date" rowspan="${rowSpan}">
                <div class="cell-date">
                    <i data-lucide="calendar" class="cell-icon"></i>
                    <div class="date-info">
                        <div class="date-main">${this.formatDateShort(order.orderDate)}</div>
                        <div class="date-time">${this.formatTimeOnly(order.orderDate)}</div>
                    </div>
                </div>
            </td>

            <!-- Nhà cung cấp -->
            <td class="col-supplier" rowspan="${rowSpan}">
                <div class="cell-supplier">
                    <div class="supplier-code">${order.supplier?.code || '-'}</div>
                    <div class="supplier-badge">
                        <span class="badge badge-info">${order.totalItems || 0} sản phẩm</span>
                    </div>
                </div>
            </td>

            <!-- Hóa đơn -->
            <td class="col-invoice" rowspan="${rowSpan}">
                <div class="cell-invoice">
                    ${this.renderInvoiceImages(order.invoiceImages)}
                    <div class="invoice-amount">${config.formatVND(order.finalAmount || 0)}</div>
                </div>
            </td>
        `;
    }

    /**
     * Render item-level cells (non-spanning)
     * @param {Object} item - Order item data
     * @param {string} orderStatus - Order status
     * @returns {string} HTML string
     */
    renderItemCells(item, orderStatus) {
        const config = window.PurchaseOrderConfig;

        return `
            <!-- Tên sản phẩm -->
            <td class="col-product">
                <div class="cell-product">
                    <div class="product-name" title="${item.productName || ''}">${this.truncate(item.productName || '-', 40)}</div>
                </div>
            </td>

            <!-- Mã SP -->
            <td class="col-code">
                <span class="product-code">${item.productCode || '-'}</span>
            </td>

            <!-- Biến thể -->
            <td class="col-variant">
                <span class="variant-badge">${item.variant || '-'}</span>
            </td>

            <!-- Số lượng -->
            <td class="col-qty">
                <span class="qty-value">${item.quantity || 0}</span>
            </td>

            <!-- Giá mua -->
            <td class="col-purchase-price">
                <span class="price-value">${config.formatVND(item.purchasePrice || 0)}</span>
            </td>

            <!-- Giá bán -->
            <td class="col-selling-price">
                <div class="cell-selling-price">
                    <span class="price-value">${config.formatVND(item.sellingPrice || 0)}</span>
                    ${item.productImages?.length > 0 ? `
                        <button class="btn-icon btn-sm" title="Xem hình SP" data-action="view-images" data-item-id="${item.id}">
                            <i data-lucide="image"></i>
                        </button>
                    ` : ''}
                </div>
            </td>

            <!-- Ghi chú -->
            <td class="col-notes">
                <span class="notes-text" title="${item.notes || ''}">${this.truncate(item.notes || '', 20)}</span>
            </td>

            <!-- Trạng thái -->
            <td class="col-status">
                ${config.getStatusBadgeHTML(orderStatus)}
            </td>

            <!-- Thao tác (chỉ hiện ở dòng đầu tiên của mỗi order - được xử lý bằng CSS) -->
            <td class="col-actions">
                <!-- Actions được render riêng cho dòng đầu của order -->
            </td>
        `;
    }

    /**
     * Render action buttons for first row
     * @param {Object} order - Order data
     * @param {number} rowSpan - Row span
     * @param {boolean} isSelected - Is selected
     * @param {boolean} canEdit - Can edit
     * @param {boolean} canDelete - Can delete
     * @returns {string} HTML string
     */
    renderActionButtons(order, rowSpan, isSelected, canEdit, canDelete) {
        return `
            <td class="col-actions" rowspan="${rowSpan}">
                <div class="action-buttons">
                    <button class="btn-icon btn-sm ${!canEdit ? 'disabled' : ''}"
                            title="${canEdit ? 'Chỉnh sửa' : 'Không thể sửa đơn này'}"
                            data-action="edit"
                            data-order-id="${order.id}"
                            ${!canEdit ? 'disabled' : ''}>
                        <i data-lucide="pencil"></i>
                    </button>

                    <button class="btn-icon btn-sm"
                            title="Xuất Excel"
                            data-action="export"
                            data-order-id="${order.id}">
                        <i data-lucide="download"></i>
                    </button>

                    <button class="btn-icon btn-sm"
                            title="Sao chép"
                            data-action="copy"
                            data-order-id="${order.id}">
                        <i data-lucide="copy"></i>
                    </button>

                    <button class="btn-icon btn-sm btn-danger ${!canDelete ? 'disabled' : ''}"
                            title="${canDelete ? 'Xóa' : 'Không thể xóa đơn này'}"
                            data-action="delete"
                            data-order-id="${order.id}"
                            ${!canDelete ? 'disabled' : ''}>
                        <i data-lucide="trash-2"></i>
                    </button>

                    <label class="checkbox-wrapper">
                        <input type="checkbox"
                               class="order-checkbox"
                               data-order-id="${order.id}"
                               ${isSelected ? 'checked' : ''}>
                        <span class="checkmark"></span>
                    </label>
                </div>
            </td>
        `;
    }

    /**
     * Render order rows with proper row spanning (fixed version)
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

        // If no items, render a single row
        if (items.length === 0) {
            return `
                <tr class="order-row ${isSelected ? 'selected' : ''}" data-order-id="${order.id}">
                    ${this.renderSpannedCells(order, 1, isSelected, canEdit, canDelete)}
                    <td class="col-product" colspan="8">
                        <span class="text-muted">Chưa có sản phẩm</span>
                    </td>
                    ${this.renderActionButtons(order, 1, isSelected, canEdit, canDelete)}
                </tr>
            `;
        }

        // Render rows with row spanning
        return items.map((item, index) => {
            const isFirstRow = index === 0;

            if (isFirstRow) {
                return `
                    <tr class="order-row order-row--first ${isSelected ? 'selected' : ''}" data-order-id="${order.id}">
                        ${this.renderSpannedCells(order, rowSpan, isSelected, canEdit, canDelete)}
                        ${this.renderItemCellsOnly(item, order.status)}
                        ${this.renderActionButtons(order, rowSpan, isSelected, canEdit, canDelete)}
                    </tr>
                `;
            } else {
                return `
                    <tr class="order-row ${isSelected ? 'selected' : ''}" data-order-id="${order.id}">
                        ${this.renderItemCellsOnly(item, order.status)}
                    </tr>
                `;
            }
        }).join('');
    }

    /**
     * Render only item cells (without actions column)
     * @param {Object} item - Order item data
     * @param {string} orderStatus - Order status
     * @returns {string} HTML string
     */
    renderItemCellsOnly(item, orderStatus) {
        const config = window.PurchaseOrderConfig;

        return `
            <!-- Tên sản phẩm -->
            <td class="col-product">
                <div class="cell-product">
                    <div class="product-name" title="${item.productName || ''}">${this.truncate(item.productName || '-', 40)}</div>
                </div>
            </td>

            <!-- Mã SP -->
            <td class="col-code">
                <span class="product-code">${item.productCode || '-'}</span>
            </td>

            <!-- Biến thể -->
            <td class="col-variant">
                <span class="variant-badge">${item.variant || '-'}</span>
            </td>

            <!-- Số lượng -->
            <td class="col-qty">
                <span class="qty-value">${item.quantity || 0}</span>
            </td>

            <!-- Giá mua -->
            <td class="col-purchase-price">
                <span class="price-value">${config.formatVND(item.purchasePrice || 0)}</span>
            </td>

            <!-- Giá bán -->
            <td class="col-selling-price">
                <div class="cell-selling-price">
                    <span class="price-value">${config.formatVND(item.sellingPrice || 0)}</span>
                    ${item.productImages?.length > 0 ? `
                        <button class="btn-icon btn-sm" title="Xem hình SP" data-action="view-images" data-item-id="${item.id}">
                            <i data-lucide="image"></i>
                        </button>
                    ` : ''}
                </div>
            </td>

            <!-- Ghi chú -->
            <td class="col-notes">
                <span class="notes-text" title="${item.notes || ''}">${this.truncate(item.notes || '', 20)}</span>
            </td>

            <!-- Trạng thái -->
            <td class="col-status">
                ${config.getStatusBadgeHTML(orderStatus)}
            </td>
        `;
    }

    /**
     * Render empty order row
     * @param {Object} order - Order data
     * @param {boolean} isSelected - Is selected
     * @param {boolean} canEdit - Can edit
     * @param {boolean} canDelete - Can delete
     * @returns {string} HTML string
     */
    renderEmptyOrderRow(order, isSelected, canEdit, canDelete) {
        return `
            <tr class="order-row ${isSelected ? 'selected' : ''}" data-order-id="${order.id}">
                ${this.renderSpannedCells(order, 1, isSelected, canEdit, canDelete)}
                <td class="col-product" colspan="8">
                    <span class="text-muted">Chưa có sản phẩm</span>
                </td>
                ${this.renderActionButtons(order, 1, isSelected, canEdit, canDelete)}
            </tr>
        `;
    }

    // ========================================
    // HELPER RENDER FUNCTIONS
    // ========================================

    /**
     * Render invoice images thumbnail
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
            <div class="invoice-thumb" data-action="view-invoice" data-images='${JSON.stringify(images)}'>
                <img src="${images[0]}" alt="Hóa đơn" loading="lazy">
                ${images.length > 1 ? `<span class="thumb-count">+${images.length - 1}</span>` : ''}
            </div>
        `;
    }

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

        // Re-initialize Lucide icons
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
                <td class="col-invoice"><div class="skeleton" style="width: 80px; height: 40px;"></div></td>
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
                    <thead>${this.renderTableHeader()}</thead>
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
        if (!this.container) return;

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
            }
        });

        // Checkbox changes
        this.container.addEventListener('change', (e) => {
            const checkbox = e.target.closest('.order-checkbox');
            if (!checkbox) return;

            const orderId = checkbox.dataset.orderId;
            this.handlers.onSelect?.(orderId, checkbox.checked);
        });

        // Row click for selection
        this.container.addEventListener('click', (e) => {
            const row = e.target.closest('.order-row');
            if (!row) return;

            // Ignore if clicking on action buttons or checkboxes
            if (e.target.closest('[data-action]') || e.target.closest('.order-checkbox')) return;

            const orderId = row.dataset.orderId;
            this.handlers.onRowClick?.(orderId);
        });
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    /**
     * Format date to short format (dd/mm)
     * @param {Date|Object} date
     * @returns {string}
     */
    formatDateShort(date) {
        if (!date) return '-';

        // Handle Firestore Timestamp
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

        // Handle Firestore Timestamp
        if (date.toDate) {
            date = date.toDate();
        }

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${hours}:${minutes}`;
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
}

// ========================================
// EXPORT SINGLETON INSTANCE
// ========================================
window.purchaseOrderTableRenderer = new PurchaseOrderTableRenderer();

console.log('[Purchase Orders] Table renderer loaded successfully');
