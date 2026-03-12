/**
 * GOODS RECEIVING MODULE - MAIN
 * File: main.js
 * Purpose: Goods receiving page logic - matches GoodsReceiving.tsx
 */

// ========================================
// GOODS RECEIVING APP
// ========================================

const GoodsReceivingApp = {
    // State
    orders: [],
    filteredOrders: [],
    statusFilter: 'needInspection',
    dateRange: { from: null, to: null },
    searchQuery: '',
    isLoading: false,

    // Config
    config: window.PurchaseOrderConfig,

    // ========================================
    // INITIALIZATION
    // ========================================

    async init() {
        console.log('[Goods Receiving] Initializing...');

        // Set default date range (this month)
        this.setQuickDateFilter('thisMonth');

        // Bind events
        this.bindEvents();

        // Load data
        await this.loadOrders();

        // Render UI
        this.renderStats();
        this.updateCounts();

        console.log('[Goods Receiving] Initialized');
    },

    // ========================================
    // DATE FILTER HELPERS
    // ========================================

    setQuickDateFilter(filter) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let from, to;

        switch (filter) {
            case 'today':
                from = to = new Date(today);
                break;
            case 'yesterday':
                from = to = new Date(today);
                from.setDate(from.getDate() - 1);
                break;
            case 'week':
                from = new Date(today);
                from.setDate(from.getDate() - 7);
                to = new Date(today);
                break;
            case 'month':
                from = new Date(today);
                from.setDate(from.getDate() - 30);
                to = new Date(today);
                break;
            case 'thisMonth':
                from = new Date(today.getFullYear(), today.getMonth(), 1);
                to = new Date(today);
                break;
            case 'lastMonth':
                from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                to = new Date(today.getFullYear(), today.getMonth(), 0);
                break;
            default:
                from = new Date(today.getFullYear(), today.getMonth(), 1);
                to = new Date(today);
        }

        this.dateRange = { from, to };

        // Update date inputs
        const dateFromInput = document.getElementById('dateFrom');
        const dateToInput = document.getElementById('dateTo');

        if (dateFromInput) {
            dateFromInput.value = this.formatDateForInput(from);
        }
        if (dateToInput) {
            dateToInput.value = this.formatDateForInput(to);
        }
    },

    formatDateForInput(date) {
        if (!date) return '';
        return date.toISOString().split('T')[0];
    },

    // ========================================
    // DATA LOADING
    // ========================================

    async loadOrders() {
        this.isLoading = true;
        this.showLoading(true);

        try {
            const db = firebase.firestore();

            // Query purchase orders within date range
            let query = db.collection('purchase_orders')
                .orderBy('orderDate', 'desc');

            if (this.dateRange.from) {
                query = query.where('orderDate', '>=', this.dateRange.from.toISOString());
            }
            if (this.dateRange.to) {
                const endDate = new Date(this.dateRange.to);
                endDate.setHours(23, 59, 59, 999);
                query = query.where('orderDate', '<=', endDate.toISOString());
            }

            const snapshot = await query.get();

            // Load orders with items and receiving data
            this.orders = await Promise.all(snapshot.docs.map(async (doc) => {
                const orderData = { id: doc.id, ...doc.data() };

                // Load items
                const itemsSnapshot = await db.collection('purchase_order_items')
                    .where('purchaseOrderId', '==', doc.id)
                    .get();

                orderData.items = itemsSnapshot.docs.map(itemDoc => ({
                    id: itemDoc.id,
                    ...itemDoc.data()
                }));

                // Load goods receiving data if exists
                const receivingSnapshot = await db.collection('goods_receiving')
                    .where('purchaseOrderId', '==', doc.id)
                    .limit(1)
                    .get();

                if (!receivingSnapshot.empty) {
                    const receivingDoc = receivingSnapshot.docs[0];
                    orderData.receiving = {
                        id: receivingDoc.id,
                        ...receivingDoc.data()
                    };

                    // Load receiving items
                    const receivingItemsSnapshot = await db.collection('goods_receiving_items')
                        .where('goodsReceivingId', '==', receivingDoc.id)
                        .get();

                    orderData.receiving.items = receivingItemsSnapshot.docs.map(itemDoc => ({
                        id: itemDoc.id,
                        ...itemDoc.data()
                    }));
                }

                // Calculate overall status
                orderData.overallStatus = this.calculateOverallStatus(orderData);

                return orderData;
            }));

            // Filter by status
            this.applyFilters();

            // Render list
            this.renderOrdersList();
            this.updateCounts();

        } catch (error) {
            console.error('Error loading orders:', error);
            this.showNotification('Lỗi tải dữ liệu', 'error');
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    },

    calculateOverallStatus(order) {
        if (!order.receiving) {
            return 'needInspection';
        }

        if (order.receiving.hasDiscrepancy) {
            // Check if shortage or overage
            const items = order.receiving.items || [];
            const hasShortage = items.some(i => i.discrepancyType === 'shortage');
            return hasShortage ? 'shortage' : 'overage';
        }

        return 'match';
    },

    applyFilters() {
        let filtered = [...this.orders];

        // Status filter
        if (this.statusFilter !== 'all') {
            if (this.statusFilter === 'needInspection') {
                filtered = filtered.filter(o => !o.receiving);
            } else if (this.statusFilter === 'inspected') {
                filtered = filtered.filter(o => o.receiving);
            } else if (this.statusFilter === 'shortage') {
                filtered = filtered.filter(o =>
                    o.receiving && o.receiving.hasDiscrepancy
                );
            }
        }

        // Search filter
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(o =>
                (o.supplier?.name || '').toLowerCase().includes(query) ||
                (o.notes || '').toLowerCase().includes(query) ||
                (o.id || '').toLowerCase().includes(query)
            );
        }

        this.filteredOrders = filtered;
    },

    // ========================================
    // RENDERING
    // ========================================

    renderStats() {
        const container = document.getElementById('summaryCards');
        if (!container) return;

        const totalOrders = this.orders.length;
        const totalValue = this.orders.reduce((sum, o) =>
            sum + (o.finalAmount || o.totalAmount || 0), 0);
        const inspectedToday = this.orders.filter(o => {
            if (!o.receiving?.receivingDate) return false;
            const receivingDate = new Date(o.receiving.receivingDate);
            const today = new Date();
            return receivingDate.toDateString() === today.toDateString();
        }).length;
        const withDiscrepancy = this.orders.filter(o =>
            o.receiving?.hasDiscrepancy).length;
        const totalProducts = this.orders.reduce((sum, o) =>
            sum + (o.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0), 0);

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon" style="background: #dbeafe;">
                    <i data-lucide="package" style="color: #2563eb;"></i>
                </div>
                <div class="summary-card__content">
                    <div class="summary-card__value">${totalOrders}</div>
                    <div class="summary-card__label">Tổng đơn hàng</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon" style="background: #d1fae5;">
                    <i data-lucide="banknote" style="color: #059669;"></i>
                </div>
                <div class="summary-card__content">
                    <div class="summary-card__value">${this.config.formatVND(totalValue)}</div>
                    <div class="summary-card__label">Tổng giá trị</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon" style="background: #dcfce7;">
                    <i data-lucide="check-circle" style="color: #16a34a;"></i>
                </div>
                <div class="summary-card__content">
                    <div class="summary-card__value">${inspectedToday}</div>
                    <div class="summary-card__label">Đã kiểm hôm nay</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon" style="background: #fef3c7;">
                    <i data-lucide="alert-triangle" style="color: #d97706;"></i>
                </div>
                <div class="summary-card__content">
                    <div class="summary-card__value">${withDiscrepancy}</div>
                    <div class="summary-card__label">Có chênh lệch</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon" style="background: #f3e8ff;">
                    <i data-lucide="boxes" style="color: #9333ea;"></i>
                </div>
                <div class="summary-card__content">
                    <div class="summary-card__value">${totalProducts}</div>
                    <div class="summary-card__label">Tổng sản phẩm</div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    updateCounts() {
        const needInspection = this.orders.filter(o => !o.receiving).length;
        const inspected = this.orders.filter(o => o.receiving).length;
        const shortage = this.orders.filter(o =>
            o.receiving?.hasDiscrepancy).length;

        const countNeedEl = document.getElementById('countNeedInspection');
        const countInspectedEl = document.getElementById('countInspected');
        const countShortageEl = document.getElementById('countShortage');

        if (countNeedEl) countNeedEl.textContent = needInspection;
        if (countInspectedEl) countInspectedEl.textContent = inspected;
        if (countShortageEl) countShortageEl.textContent = shortage;
    },

    renderOrdersList() {
        const container = document.getElementById('ordersContainer');
        if (!container) return;

        if (this.filteredOrders.length === 0) {
            container.innerHTML = `
                <div class="receiving-empty">
                    <i data-lucide="inbox"></i>
                    <h3 class="receiving-empty__title">Không có đơn hàng</h3>
                    <p class="receiving-empty__text">Không tìm thấy đơn hàng nào trong khoảng thời gian này</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Desktop table + Mobile cards
        container.innerHTML = `
            <div class="receiving-table-wrapper">
                <table class="receiving-table">
                    <thead>
                        <tr>
                            <th class="col-date">Ngày đặt</th>
                            <th class="col-supplier">NCC</th>
                            <th class="col-products">Tổng SP</th>
                            <th class="col-quantity">Tổng SL</th>
                            <th class="col-inspected">Ngày kiểm</th>
                            <th class="col-status">Trạng thái</th>
                            <th class="col-actions">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.filteredOrders.map(order => this.renderTableRow(order)).join('')}
                    </tbody>
                </table>
            </div>

            <div class="receiving-cards">
                ${this.filteredOrders.map(order => this.renderCard(order)).join('')}
            </div>
        `;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    renderTableRow(order) {
        const itemCount = order.items?.length || 0;
        const totalQty = order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
        const receivingDate = order.receiving?.receivingDate
            ? this.config.formatDateTime(order.receiving.receivingDate)
            : '-';

        return `
            <tr data-order-id="${order.id}">
                <td class="col-date">${this.config.formatDate(order.orderDate)}</td>
                <td class="col-supplier">${order.supplier?.name || '-'}</td>
                <td class="col-products">${itemCount}</td>
                <td class="col-quantity">${totalQty}</td>
                <td class="col-inspected">${receivingDate}</td>
                <td class="col-status">${this.renderStatusBadge(order.overallStatus)}</td>
                <td class="col-actions">
                    ${order.receiving
                        ? `<button class="btn btn-sm btn-outline" data-action="view" data-order-id="${order.id}">
                            <i data-lucide="eye"></i>
                            <span>Xem kết quả</span>
                           </button>`
                        : `<button class="btn btn-sm btn-primary" data-action="create" data-order-id="${order.id}">
                            <i data-lucide="clipboard-check"></i>
                            <span>Kiểm hàng</span>
                           </button>`
                    }
                </td>
            </tr>
        `;
    },

    renderCard(order) {
        const itemCount = order.items?.length || 0;
        const totalQty = order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;

        return `
            <div class="receiving-card" data-order-id="${order.id}">
                <div class="receiving-card__header">
                    <span class="receiving-card__supplier">${order.supplier?.name || 'Chưa có NCC'}</span>
                    ${this.renderStatusBadge(order.overallStatus)}
                </div>
                <div class="receiving-card__info">
                    <div class="receiving-card__info-item">
                        <i data-lucide="calendar"></i>
                        <span>${this.config.formatDate(order.orderDate)}</span>
                    </div>
                    <div class="receiving-card__info-item">
                        <i data-lucide="package"></i>
                        <span>${itemCount} SP</span>
                    </div>
                    <div class="receiving-card__info-item">
                        <i data-lucide="hash"></i>
                        <span>${totalQty} sản phẩm</span>
                    </div>
                </div>
                <div class="receiving-card__footer">
                    ${order.receiving
                        ? `<button class="btn btn-sm btn-outline" data-action="view" data-order-id="${order.id}">
                            <i data-lucide="eye"></i>
                            <span>Xem kết quả</span>
                           </button>`
                        : `<button class="btn btn-sm btn-primary" data-action="create" data-order-id="${order.id}">
                            <i data-lucide="clipboard-check"></i>
                            <span>Kiểm hàng</span>
                           </button>`
                    }
                </div>
            </div>
        `;
    },

    renderStatusBadge(status) {
        const badges = {
            needInspection: '<span class="status-badge status-badge--need-inspection"><i data-lucide="clock"></i> Cần kiểm</span>',
            match: '<span class="status-badge status-badge--match"><i data-lucide="check"></i> Đủ hàng</span>',
            shortage: '<span class="status-badge status-badge--shortage"><i data-lucide="alert-circle"></i> Thiếu hàng</span>',
            overage: '<span class="status-badge status-badge--overage"><i data-lucide="alert-triangle"></i> Dư hàng</span>'
        };
        return badges[status] || badges.needInspection;
    },

    // ========================================
    // DIALOGS
    // ========================================

    openCreateReceivingDialog(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;

        const dialog = new CreateReceivingDialog();
        dialog.open({
            order,
            onSuccess: () => {
                this.loadOrders();
                this.showNotification('Kiểm hàng thành công!', 'success');
            }
        });
    },

    openViewReceivingDialog(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order || !order.receiving) return;

        const dialog = new ViewReceivingDialog();
        dialog.open({ order });
    },

    // ========================================
    // EVENT BINDING
    // ========================================

    bindEvents() {
        // Tab clicks
        document.getElementById('tabsContainer')?.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab-btn');
            if (!tab) return;

            // Update active state
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            this.statusFilter = tab.dataset.tab;
            this.applyFilters();
            this.renderOrdersList();
        });

        // Quick date filter
        document.getElementById('quickDateFilter')?.addEventListener('change', (e) => {
            this.setQuickDateFilter(e.target.value);
            this.loadOrders();
        });

        // Custom date range
        document.getElementById('dateFrom')?.addEventListener('change', (e) => {
            this.dateRange.from = e.target.value ? new Date(e.target.value) : null;
            this.loadOrders();
        });

        document.getElementById('dateTo')?.addEventListener('change', (e) => {
            this.dateRange.to = e.target.value ? new Date(e.target.value) : null;
            this.loadOrders();
        });

        // Search
        let searchTimeout;
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchQuery = e.target.value;
                this.applyFilters();
                this.renderOrdersList();
            }, 300);
        });

        // Action buttons (delegated)
        document.getElementById('ordersContainer')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const orderId = btn.dataset.orderId;

            if (action === 'create') {
                this.openCreateReceivingDialog(orderId);
            } else if (action === 'view') {
                this.openViewReceivingDialog(orderId);
            }
        });

        // Sidebar toggle
        document.getElementById('sidebarToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.toggle('collapsed');
        });

        // Logout
        document.getElementById('btnLogout')?.addEventListener('click', () => {
            if (window.authManager) {
                window.authManager.logout();
            }
        });
    },

    // ========================================
    // UTILITIES
    // ========================================

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    },

    showNotification(message, type = 'info') {
        if (window.notificationManager) {
            window.notificationManager.show(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
};

// ========================================
// CREATE RECEIVING DIALOG
// Matches: CreateReceivingDialog.tsx
// ========================================

class CreateReceivingDialog {
    constructor() {
        this.modalElement = null;
        this.order = null;
        this.items = [];
        this.notes = '';
        this.onSuccess = null;
    }

    open(options = {}) {
        this.order = options.order;
        this.onSuccess = options.onSuccess;
        this.notes = '';

        // Initialize items from order
        this.items = (this.order.items || []).map(item => ({
            purchaseOrderItemId: item.id,
            productName: item.productName,
            productCode: item.productCode,
            variant: item.variant,
            expectedQuantity: item.quantity || 0,
            receivedQuantity: item.quantity || 0, // Default to expected
            confirmed: false
        }));

        this.render();
        this.show();
    }

    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
            }, 200);
        }
    }

    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
        }
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        const config = window.PurchaseOrderConfig;

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        this.modalElement.innerHTML = `
            <div class="modal modal--lg">
                <div class="modal__header">
                    <div>
                        <h2 class="modal__title">Kiểm hàng nhập</h2>
                        <p class="modal__subtitle">${this.order.supplier?.name || 'Chưa có NCC'} - ${config.formatDate(this.order.orderDate)}</p>
                    </div>
                    <button type="button" class="modal__close" id="btnCloseReceiving">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <div class="receiving-dialog-items" id="receivingItems">
                        ${this.renderItems()}
                    </div>

                    <div class="form-group">
                        <label class="form-label">Ghi chú</label>
                        <textarea class="form-input" id="receivingNotes" rows="2"
                                  placeholder="Ghi chú về kiểm hàng...">${this.notes}</textarea>
                    </div>
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCancelReceiving">Hủy</button>
                    <button class="btn btn-primary" id="btnSubmitReceiving" disabled>
                        <i data-lucide="check"></i>
                        <span>Xác nhận kiểm hàng</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindEvents();
        this.updateSubmitButton();
    }

    renderItems() {
        return this.items.map((item, index) => {
            const diff = item.receivedQuantity - item.expectedQuantity;
            let resultClass = '';
            let resultBadge = '';
            let inputClass = '';

            if (item.confirmed) {
                if (diff === 0) {
                    resultClass = 'receiving-item--confirmed';
                    inputClass = 'receiving-item__received-input--match';
                    resultBadge = '<span class="receiving-item__result-badge receiving-item__result-badge--match"><i data-lucide="check"></i> Đủ hàng</span>';
                } else if (diff < 0) {
                    resultClass = 'receiving-item--shortage';
                    inputClass = 'receiving-item__received-input--shortage';
                    resultBadge = `<span class="receiving-item__result-badge receiving-item__result-badge--shortage"><i data-lucide="alert-circle"></i> Thiếu ${Math.abs(diff)}</span>`;
                } else {
                    resultClass = 'receiving-item--overage';
                    inputClass = 'receiving-item__received-input--overage';
                    resultBadge = `<span class="receiving-item__result-badge receiving-item__result-badge--overage"><i data-lucide="alert-triangle"></i> Dư ${diff}</span>`;
                }
            }

            return `
                <div class="receiving-item ${resultClass}" data-index="${index}">
                    <div class="receiving-item__product">
                        <div class="receiving-item__product-name">${item.productName || '-'}</div>
                        <div class="receiving-item__product-variant">${item.variant || item.productCode || ''}</div>
                    </div>
                    <div class="receiving-item__expected">
                        <div class="receiving-item__expected-label">Đặt</div>
                        <div class="receiving-item__expected-value">${item.expectedQuantity}</div>
                    </div>
                    <div class="receiving-item__received">
                        <div class="receiving-item__received-label">Nhận</div>
                        <input type="number" class="receiving-item__received-input ${inputClass}"
                               value="${item.receivedQuantity}"
                               min="0"
                               data-index="${index}"
                               ${item.confirmed ? 'disabled' : ''}>
                    </div>
                    <div class="receiving-item__result">
                        ${resultBadge}
                    </div>
                    <div class="receiving-item__confirm">
                        <button class="btn-confirm-item ${item.confirmed ? 'btn-confirm-item--confirmed' : ''}"
                                data-action="${item.confirmed ? 'unconfirm' : 'confirm'}"
                                data-index="${index}">
                            <i data-lucide="${item.confirmed ? 'check' : 'circle'}"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateItemsUI() {
        const container = this.modalElement?.querySelector('#receivingItems');
        if (container) {
            container.innerHTML = this.renderItems();
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
        this.updateSubmitButton();
    }

    updateSubmitButton() {
        const btn = this.modalElement?.querySelector('#btnSubmitReceiving');
        if (!btn) return;

        const allConfirmed = this.items.every(i => i.confirmed);
        btn.disabled = !allConfirmed;
    }

    async submit() {
        const btn = this.modalElement?.querySelector('#btnSubmitReceiving');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> <span>Đang lưu...</span>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        try {
            const db = firebase.firestore();
            const now = new Date().toISOString();

            const totalExpected = this.items.reduce((s, i) => s + i.expectedQuantity, 0);
            const totalReceived = this.items.reduce((s, i) => s + i.receivedQuantity, 0);
            const hasDiscrepancy = this.items.some(i => i.receivedQuantity !== i.expectedQuantity);

            // Create goods_receiving record
            const receivingRef = await db.collection('goods_receiving').add({
                purchaseOrderId: this.order.id,
                receivingDate: now,
                totalItemsExpected: totalExpected,
                totalItemsReceived: totalReceived,
                hasDiscrepancy: hasDiscrepancy,
                notes: this.notes,
                createdAt: now
            });

            // Create goods_receiving_items
            const batch = db.batch();
            for (const item of this.items) {
                const diff = item.receivedQuantity - item.expectedQuantity;
                const itemRef = db.collection('goods_receiving_items').doc();

                batch.set(itemRef, {
                    goodsReceivingId: receivingRef.id,
                    purchaseOrderItemId: item.purchaseOrderItemId,
                    productName: item.productName,
                    productCode: item.productCode,
                    variant: item.variant,
                    expectedQuantity: item.expectedQuantity,
                    receivedQuantity: item.receivedQuantity,
                    discrepancyType: diff < 0 ? 'shortage' : diff > 0 ? 'overage' : 'match',
                    discrepancyQuantity: Math.abs(diff)
                });
            }
            await batch.commit();

            // Update order status
            await db.collection('purchase_orders').doc(this.order.id).update({
                status: 'received',
                updatedAt: now
            });

            this.close();

            if (this.onSuccess) {
                this.onSuccess();
            }

        } catch (error) {
            console.error('Error submitting receiving:', error);
            GoodsReceivingApp.showNotification('Lỗi lưu kiểm hàng', 'error');

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="check"></i> <span>Xác nhận kiểm hàng</span>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }

    bindEvents() {
        // Close buttons
        this.modalElement.querySelector('#btnCloseReceiving')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelReceiving')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Quantity input
        this.modalElement.querySelector('#receivingItems')?.addEventListener('input', (e) => {
            if (!e.target.classList.contains('receiving-item__received-input')) return;

            const index = parseInt(e.target.dataset.index, 10);
            const value = parseInt(e.target.value, 10) || 0;

            this.items[index].receivedQuantity = value;
        });

        // Confirm/Unconfirm buttons
        this.modalElement.querySelector('#receivingItems')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-confirm-item');
            if (!btn) return;

            const index = parseInt(btn.dataset.index, 10);
            const action = btn.dataset.action;

            if (action === 'confirm') {
                this.items[index].confirmed = true;
            } else {
                this.items[index].confirmed = false;
            }

            this.updateItemsUI();
        });

        // Notes
        this.modalElement.querySelector('#receivingNotes')?.addEventListener('input', (e) => {
            this.notes = e.target.value;
        });

        // Submit
        this.modalElement.querySelector('#btnSubmitReceiving')?.addEventListener('click', () => {
            this.submit();
        });
    }
}

// ========================================
// VIEW RECEIVING DIALOG
// Matches: ViewReceivingDialog.tsx
// ========================================

class ViewReceivingDialog {
    constructor() {
        this.modalElement = null;
        this.order = null;
    }

    open(options = {}) {
        this.order = options.order;
        this.render();
        this.show();
    }

    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
            }, 200);
        }
    }

    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
        }
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        const config = window.PurchaseOrderConfig;
        const receiving = this.order.receiving;
        const items = receiving?.items || [];

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        this.modalElement.innerHTML = `
            <div class="modal modal--lg">
                <div class="modal__header">
                    <div>
                        <h2 class="modal__title">Kết quả kiểm hàng</h2>
                        <p class="modal__subtitle">${this.order.supplier?.name || 'Chưa có NCC'} - ${config.formatDate(this.order.orderDate)}</p>
                    </div>
                    <button type="button" class="modal__close" id="btnCloseViewReceiving">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <!-- Header info -->
                    <div class="receiving-view-header">
                        <div class="receiving-view-header__item">
                            <span class="receiving-view-header__label">Ngày kiểm</span>
                            <span class="receiving-view-header__value">${config.formatDateTime(receiving.receivingDate)}</span>
                        </div>
                        <div class="receiving-view-header__item">
                            <span class="receiving-view-header__label">Tổng đặt</span>
                            <span class="receiving-view-header__value">${receiving.totalItemsExpected || 0}</span>
                        </div>
                        <div class="receiving-view-header__item">
                            <span class="receiving-view-header__label">Tổng nhận</span>
                            <span class="receiving-view-header__value">${receiving.totalItemsReceived || 0}</span>
                        </div>
                        <div class="receiving-view-header__item">
                            <span class="receiving-view-header__label">Trạng thái</span>
                            <span class="receiving-view-header__value">
                                ${receiving.hasDiscrepancy
                                    ? '<span class="status-badge status-badge--shortage">Có chênh lệch</span>'
                                    : '<span class="status-badge status-badge--match">Đủ hàng</span>'}
                            </span>
                        </div>
                    </div>

                    <!-- Items table -->
                    <div class="table-wrapper">
                        <table class="receiving-view-table">
                            <thead>
                                <tr>
                                    <th>Sản phẩm</th>
                                    <th>Biến thể</th>
                                    <th style="text-align: center;">SL Đặt</th>
                                    <th style="text-align: center;">SL Nhận</th>
                                    <th>Kết quả</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map(item => this.renderItemRow(item)).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Notes -->
                    ${receiving.notes ? `
                        <div class="detail-notes">
                            <h4>Ghi chú</h4>
                            <p>${receiving.notes}</p>
                        </div>
                    ` : ''}
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCloseViewReceivingFooter">Đóng</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindEvents();
    }

    renderItemRow(item) {
        const diff = item.receivedQuantity - item.expectedQuantity;
        let rowClass = 'row--match';
        let resultHtml = '<span style="color: #16a34a;"><i data-lucide="check"></i> Đủ hàng</span>';

        if (diff < 0) {
            rowClass = 'row--shortage';
            resultHtml = `<span style="color: #b91c1c;"><i data-lucide="alert-circle"></i> Thiếu ${Math.abs(diff)}</span>`;
        } else if (diff > 0) {
            rowClass = 'row--overage';
            resultHtml = `<span style="color: #c2410c;"><i data-lucide="alert-triangle"></i> Dư ${diff}</span>`;
        }

        return `
            <tr class="${rowClass}">
                <td>${item.productName || '-'}</td>
                <td>${item.variant || item.productCode || '-'}</td>
                <td style="text-align: center;">${item.expectedQuantity}</td>
                <td style="text-align: center;">${item.receivedQuantity}</td>
                <td>${resultHtml}</td>
            </tr>
        `;
    }

    bindEvents() {
        this.modalElement.querySelector('#btnCloseViewReceiving')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCloseViewReceivingFooter')?.addEventListener('click', () => this.close());

        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });
    }
}

// ========================================
// INITIALIZE
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Firebase to initialize
    if (window.FIREBASE_CONFIG) {
        if (!firebase.apps.length) {
            firebase.initializeApp(window.FIREBASE_CONFIG);
        }
    }

    // Wait a bit for shared modules to load
    setTimeout(() => {
        GoodsReceivingApp.init();
    }, 500);
});

// Export for global access
window.GoodsReceivingApp = GoodsReceivingApp;
window.CreateReceivingDialog = CreateReceivingDialog;
window.ViewReceivingDialog = ViewReceivingDialog;

console.log('[Goods Receiving] Module loaded');
