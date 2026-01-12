/**
 * PURCHASE ORDERS MODULE - UI COMPONENTS
 * File: ui-components.js
 * Purpose: Render summary cards, tabs, filter bar, and other UI elements
 */

// ========================================
// UI COMPONENTS CLASS
// ========================================
class PurchaseOrderUIComponents {
    constructor() {
        this.initialized = false;
    }

    // ========================================
    // SUMMARY CARDS
    // ========================================

    /**
     * Render summary cards
     * @param {Object} stats - Statistics data
     * @param {HTMLElement} container - Container element
     */
    renderSummaryCards(stats, container) {
        if (!container) return;

        const config = window.PurchaseOrderConfig;

        const cards = [
            {
                icon: 'file-text',
                label: 'Tổng đơn hàng',
                value: stats.totalOrders || 0,
                format: 'number',
                color: 'blue'
            },
            {
                icon: 'wallet',
                label: 'Tổng giá trị',
                value: stats.totalValue || 0,
                format: 'currency',
                color: 'green'
            },
            {
                icon: 'calendar',
                label: 'Đơn hôm nay',
                value: stats.todayOrders || 0,
                format: 'number',
                color: 'purple'
            },
            {
                icon: 'trending-up',
                label: 'Giá trị hôm nay',
                value: stats.todayValue || 0,
                format: 'currency',
                color: 'orange'
            },
            {
                icon: 'refresh-cw',
                label: 'Đồng bộ TPOS',
                value: stats.tposSyncRate || 0,
                format: 'percent',
                color: 'cyan'
            }
        ];

        container.innerHTML = cards.map(card => `
            <div class="summary-card summary-card--${card.color}">
                <div class="summary-card__icon">
                    <i data-lucide="${card.icon}"></i>
                </div>
                <div class="summary-card__content">
                    <div class="summary-card__label">${card.label}</div>
                    <div class="summary-card__value">${this.formatCardValue(card.value, card.format)}</div>
                </div>
            </div>
        `).join('');

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Render loading skeleton for summary cards
     * @param {HTMLElement} container - Container element
     */
    renderSummaryCardsSkeleton(container) {
        if (!container) return;

        const skeletons = Array(5).fill(0).map(() => `
            <div class="summary-card summary-card--skeleton">
                <div class="summary-card__icon skeleton"></div>
                <div class="summary-card__content">
                    <div class="summary-card__label skeleton" style="width: 80px; height: 12px;"></div>
                    <div class="summary-card__value skeleton" style="width: 100px; height: 24px;"></div>
                </div>
            </div>
        `).join('');

        container.innerHTML = skeletons;
    }

    /**
     * Format card value based on type
     * @param {number} value
     * @param {string} format
     * @returns {string}
     */
    formatCardValue(value, format) {
        const config = window.PurchaseOrderConfig;

        switch (format) {
            case 'currency':
                return config.formatVND(value);
            case 'percent':
                return `${value}%`;
            default:
                return value.toLocaleString('vi-VN');
        }
    }

    // ========================================
    // TABS
    // ========================================

    /**
     * Render tabs
     * @param {string} activeTab - Currently active tab
     * @param {Object} counts - Status counts
     * @param {HTMLElement} container - Container element
     * @param {Function} onTabClick - Tab click handler
     */
    renderTabs(activeTab, counts, container, onTabClick) {
        if (!container) return;

        const config = window.PurchaseOrderConfig;

        container.innerHTML = config.TAB_CONFIG.map(tab => {
            const count = counts[tab.status] || 0;
            const isActive = activeTab === tab.status;

            return `
                <button class="tab-btn ${isActive ? 'active' : ''}"
                        data-tab="${tab.id}"
                        data-status="${tab.status}">
                    <i data-lucide="${tab.icon}"></i>
                    <span>${tab.label}</span>
                    <span class="tab-badge">${count}</span>
                </button>
            `;
        }).join('');

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind click handlers
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const status = btn.dataset.status;
                if (onTabClick) onTabClick(status);
            });
        });
    }

    /**
     * Update active tab
     * @param {string} status - Active status
     * @param {HTMLElement} container - Container element
     */
    updateActiveTab(status, container) {
        if (!container) return;

        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.status === status);
        });
    }

    // ========================================
    // FILTER BAR
    // ========================================

    /**
     * Render filter bar
     * @param {Object} filters - Current filter state
     * @param {HTMLElement} container - Container element
     * @param {Object} handlers - Event handlers
     */
    renderFilterBar(filters, container, handlers = {}) {
        if (!container) return;

        const config = window.PurchaseOrderConfig;

        const quickFilterOptions = config.QUICK_FILTERS.map(filter => {
            const selected = filters.quickFilter === filter.id ? 'selected' : '';
            return `<option value="${filter.id}" ${selected}>${filter.label}</option>`;
        }).join('');

        // Build status filter options based on current tab
        const statusFilterOptions = this.buildStatusFilterOptions(filters.statusFilter);

        container.innerHTML = `
            <div class="filter-bar">
                <div class="filter-group">
                    <label class="filter-label">Từ ngày</label>
                    <div class="input-icon">
                        <i data-lucide="calendar"></i>
                        <input type="date" id="filterStartDate" class="filter-input"
                               value="${this.formatDateForInput(filters.startDate)}"
                               placeholder="DD/MM/YYYY">
                    </div>
                </div>

                <div class="filter-group">
                    <label class="filter-label">Đến ngày</label>
                    <div class="input-icon">
                        <i data-lucide="calendar"></i>
                        <input type="date" id="filterEndDate" class="filter-input"
                               value="${this.formatDateForInput(filters.endDate)}"
                               placeholder="DD/MM/YYYY">
                    </div>
                </div>

                <div class="filter-group">
                    <label class="filter-label">Lọc nhanh</label>
                    <select id="filterQuick" class="filter-select">
                        ${quickFilterOptions}
                    </select>
                </div>

                <div class="filter-group filter-group--search">
                    <label class="filter-label">Tìm kiếm</label>
                    <div class="input-icon">
                        <i data-lucide="search"></i>
                        <input type="text" id="filterSearch" class="filter-input"
                               value="${filters.searchTerm || ''}"
                               placeholder="Tìm theo NCC, mã SP...">
                    </div>
                </div>

                <div class="filter-group">
                    <label class="filter-label">Trạng thái</label>
                    <select id="filterStatus" class="filter-select">
                        ${statusFilterOptions}
                    </select>
                </div>

                <div class="filter-group filter-group--actions">
                    <button id="btnClearFilters" class="btn btn-outline" title="Xóa bộ lọc">
                        <i data-lucide="x"></i>
                        <span>Xóa lọc</span>
                    </button>
                </div>
            </div>
        `;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind event handlers
        this.bindFilterEvents(container, handlers);
    }

    /**
     * Build status filter options
     * @param {string|null} currentFilter - Currently selected status filter
     * @returns {string} HTML options string
     */
    buildStatusFilterOptions(currentFilter) {
        const config = window.PurchaseOrderConfig;

        const options = [
            { value: '', label: 'Tất cả trạng thái' },
            { value: config.OrderStatus.DRAFT, label: config.STATUS_LABELS[config.OrderStatus.DRAFT] },
            { value: config.OrderStatus.AWAITING_PURCHASE, label: config.STATUS_LABELS[config.OrderStatus.AWAITING_PURCHASE] },
            { value: config.OrderStatus.AWAITING_DELIVERY, label: config.STATUS_LABELS[config.OrderStatus.AWAITING_DELIVERY] },
            { value: config.OrderStatus.RECEIVED, label: config.STATUS_LABELS[config.OrderStatus.RECEIVED] },
            { value: config.OrderStatus.COMPLETED, label: config.STATUS_LABELS[config.OrderStatus.COMPLETED] },
            { value: config.OrderStatus.CANCELLED, label: config.STATUS_LABELS[config.OrderStatus.CANCELLED] }
        ];

        return options.map(opt => {
            const selected = currentFilter === opt.value ? 'selected' : '';
            return `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
        }).join('');
    }

    /**
     * Bind filter event handlers
     * @param {HTMLElement} container
     * @param {Object} handlers
     */
    bindFilterEvents(container, handlers) {
        const startDateInput = container.querySelector('#filterStartDate');
        const endDateInput = container.querySelector('#filterEndDate');
        const quickFilterSelect = container.querySelector('#filterQuick');
        const searchInput = container.querySelector('#filterSearch');
        const statusFilterSelect = container.querySelector('#filterStatus');
        const clearBtn = container.querySelector('#btnClearFilters');

        if (startDateInput && handlers.onDateChange) {
            startDateInput.addEventListener('change', (e) => {
                const startDate = e.target.value ? new Date(e.target.value) : null;
                const endDate = endDateInput.value ? new Date(endDateInput.value) : null;
                handlers.onDateChange(startDate, endDate);
            });
        }

        if (endDateInput && handlers.onDateChange) {
            endDateInput.addEventListener('change', (e) => {
                const startDate = startDateInput.value ? new Date(startDateInput.value) : null;
                const endDate = e.target.value ? new Date(e.target.value) : null;
                handlers.onDateChange(startDate, endDate);
            });
        }

        if (quickFilterSelect && handlers.onQuickFilter) {
            quickFilterSelect.addEventListener('change', (e) => {
                handlers.onQuickFilter(e.target.value);
            });
        }

        if (searchInput && handlers.onSearch) {
            searchInput.addEventListener('input', (e) => {
                handlers.onSearch(e.target.value);
            });
        }

        if (statusFilterSelect && handlers.onStatusFilter) {
            statusFilterSelect.addEventListener('change', (e) => {
                handlers.onStatusFilter(e.target.value);
            });
        }

        if (clearBtn && handlers.onClear) {
            clearBtn.addEventListener('click', handlers.onClear);
        }
    }

    /**
     * Format date for input field
     * @param {Date|null} date
     * @returns {string}
     */
    formatDateForInput(date) {
        if (!date) return '';
        if (date.toDate) date = date.toDate();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ========================================
    // PAGINATION
    // ========================================

    /**
     * Render pagination with page numbers
     * @param {Object} options - Pagination options
     * @param {HTMLElement} container - Container element
     * @param {Object} handlers - Event handlers { onPageChange, onLoadMore }
     */
    renderPagination(options, container, handlers = {}) {
        if (!container) return;

        const {
            currentPage = 1,
            totalItems = 0,
            pageSize = 20,
            hasMore = false
        } = options;

        // Calculate pagination info
        const totalPages = Math.ceil(totalItems / pageSize);
        const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
        const endItem = Math.min(currentPage * pageSize, totalItems);

        // Generate page numbers (show max 5 pages)
        const pageNumbers = this.generatePageNumbers(currentPage, totalPages, 5);

        container.innerHTML = `
            <div class="pagination">
                <div class="pagination__info">
                    Hiển thị ${startItem} - ${endItem} trong ${totalItems} đơn hàng
                </div>
                <div class="pagination__controls">
                    ${totalPages > 1 ? `
                        <button class="pagination__btn pagination__btn--prev ${currentPage <= 1 ? 'disabled' : ''}"
                                data-page="${currentPage - 1}"
                                ${currentPage <= 1 ? 'disabled' : ''}>
                            <i data-lucide="chevron-left"></i>
                        </button>

                        ${pageNumbers.map(page => {
                            if (page === '...') {
                                return '<span class="pagination__ellipsis">...</span>';
                            }
                            const isActive = page === currentPage;
                            return `
                                <button class="pagination__btn pagination__btn--page ${isActive ? 'active' : ''}"
                                        data-page="${page}"
                                        ${isActive ? 'disabled' : ''}>
                                    ${page}
                                </button>
                            `;
                        }).join('')}

                        <button class="pagination__btn pagination__btn--next ${currentPage >= totalPages ? 'disabled' : ''}"
                                data-page="${currentPage + 1}"
                                ${currentPage >= totalPages ? 'disabled' : ''}>
                            <i data-lucide="chevron-right"></i>
                        </button>
                    ` : ''}

                    ${hasMore && currentPage >= totalPages ? `
                        <button id="btnLoadMore" class="btn btn-outline btn-sm" style="margin-left: 16px;">
                            <i data-lucide="chevrons-down"></i>
                            <span>Tải thêm</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind event handlers
        this.bindPaginationEvents(container, handlers, pageSize, totalItems);
    }

    /**
     * Generate page numbers array for pagination display
     * @param {number} currentPage - Current page number
     * @param {number} totalPages - Total number of pages
     * @param {number} maxVisible - Maximum number of visible page buttons
     * @returns {Array} Array of page numbers and ellipsis markers
     */
    generatePageNumbers(currentPage, totalPages, maxVisible = 5) {
        if (totalPages <= maxVisible) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }

        const pages = [];
        const half = Math.floor(maxVisible / 2);

        let start = currentPage - half;
        let end = currentPage + half;

        if (start < 1) {
            start = 1;
            end = maxVisible;
        }

        if (end > totalPages) {
            end = totalPages;
            start = totalPages - maxVisible + 1;
        }

        // Always show first page
        if (start > 1) {
            pages.push(1);
            if (start > 2) {
                pages.push('...');
            }
        }

        // Add middle pages
        for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= totalPages && !pages.includes(i)) {
                pages.push(i);
            }
        }

        // Always show last page
        if (end < totalPages) {
            if (end < totalPages - 1) {
                pages.push('...');
            }
            if (!pages.includes(totalPages)) {
                pages.push(totalPages);
            }
        }

        return pages;
    }

    /**
     * Bind pagination event handlers
     * @param {HTMLElement} container - Container element
     * @param {Object} handlers - Event handlers
     * @param {number} pageSize - Page size
     * @param {number} totalItems - Total items
     */
    bindPaginationEvents(container, handlers, pageSize, totalItems) {
        // Page buttons
        container.querySelectorAll('.pagination__btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page, 10);
                if (!isNaN(page) && handlers.onPageChange) {
                    handlers.onPageChange(page);
                }
            });
        });

        // Load more button
        const loadMoreBtn = container.querySelector('#btnLoadMore');
        if (loadMoreBtn && handlers.onLoadMore) {
            loadMoreBtn.addEventListener('click', handlers.onLoadMore);
        }
    }

    // ========================================
    // STATUS BADGE
    // ========================================

    /**
     * Render status badge
     * @param {string} status - Order status
     * @returns {string} HTML string
     */
    renderStatusBadge(status) {
        const config = window.PurchaseOrderConfig;
        return config.getStatusBadgeHTML(status);
    }

    // ========================================
    // LOADING & EMPTY STATES
    // ========================================

    /**
     * Render loading state
     * @param {HTMLElement} container - Container element
     */
    renderLoadingState(container) {
        if (!container) return;

        container.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <div class="loading-text">Đang tải dữ liệu...</div>
            </div>
        `;
    }

    /**
     * Render empty state
     * @param {HTMLElement} container - Container element
     * @param {Function} onCreateClick - Create button handler
     */
    renderEmptyState(container, onCreateClick) {
        if (!container) return;

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state__icon">
                    <i data-lucide="inbox"></i>
                </div>
                <div class="empty-state__title">Chưa có đơn hàng nào</div>
                <div class="empty-state__description">
                    Tạo đơn đặt hàng đầu tiên để bắt đầu quản lý nhập hàng từ nhà cung cấp
                </div>
                <button class="btn btn-primary" id="btnEmptyCreate">
                    <i data-lucide="plus"></i>
                    <span>Tạo đơn đặt hàng</span>
                </button>
            </div>
        `;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind create handler
        const createBtn = container.querySelector('#btnEmptyCreate');
        if (createBtn && onCreateClick) {
            createBtn.addEventListener('click', onCreateClick);
        }
    }

    /**
     * Render error state
     * @param {Error} error - Error object
     * @param {HTMLElement} container - Container element
     * @param {Function} onRetry - Retry handler
     */
    renderErrorState(error, container, onRetry) {
        if (!container) return;

        const message = error.userMessage || error.message || 'Đã có lỗi xảy ra';

        container.innerHTML = `
            <div class="error-state">
                <div class="error-state__icon">
                    <i data-lucide="alert-circle"></i>
                </div>
                <div class="error-state__title">Không thể tải dữ liệu</div>
                <div class="error-state__description">${message}</div>
                <button class="btn btn-outline" id="btnRetry">
                    <i data-lucide="refresh-cw"></i>
                    <span>Thử lại</span>
                </button>
            </div>
        `;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind retry handler
        const retryBtn = container.querySelector('#btnRetry');
        if (retryBtn && onRetry) {
            retryBtn.addEventListener('click', onRetry);
        }
    }

    // ========================================
    // TOAST NOTIFICATIONS
    // ========================================

    /**
     * Show toast notification
     * @param {string} message - Message to display
     * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
     * @param {number} duration - Duration in milliseconds
     */
    showToast(message, type = 'info', duration = 3000) {
        // Create toast container if not exists
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }

        // Get icon based on type
        const icons = {
            success: 'check-circle',
            error: 'x-circle',
            warning: 'alert-triangle',
            info: 'info'
        };

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
            <i data-lucide="${icons[type] || icons.info}"></i>
            <span>${message}</span>
            <button class="toast__close" aria-label="Đóng">
                <i data-lucide="x"></i>
            </button>
        `;

        // Add to container
        toastContainer.appendChild(toast);

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Bind close handler
        const closeBtn = toast.querySelector('.toast__close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(toast);
        });

        // Auto remove
        setTimeout(() => {
            this.removeToast(toast);
        }, duration);
    }

    /**
     * Remove toast with animation
     * @param {HTMLElement} toast
     */
    removeToast(toast) {
        toast.classList.add('toast--exit');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }

    // ========================================
    // CONFIRMATION DIALOG
    // ========================================

    /**
     * Show confirmation dialog
     * @param {Object} options - Dialog options
     * @returns {Promise<boolean>}
     */
    showConfirmDialog(options) {
        return new Promise((resolve) => {
            const {
                title = 'Xác nhận',
                message = 'Bạn có chắc chắn muốn thực hiện hành động này?',
                confirmText = 'Xác nhận',
                cancelText = 'Hủy',
                type = 'warning'
            } = options;

            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';

            // Get icon based on type
            const icons = {
                warning: 'alert-triangle',
                danger: 'alert-octagon',
                info: 'info'
            };

            overlay.innerHTML = `
                <div class="confirm-dialog confirm-dialog--${type}">
                    <div class="confirm-dialog__icon">
                        <i data-lucide="${icons[type] || icons.warning}"></i>
                    </div>
                    <div class="confirm-dialog__title">${title}</div>
                    <div class="confirm-dialog__message">${message}</div>
                    <div class="confirm-dialog__actions">
                        <button class="btn btn-outline" id="btnDialogCancel">${cancelText}</button>
                        <button class="btn btn-${type === 'danger' ? 'danger' : 'primary'}" id="btnDialogConfirm">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Re-initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            // Bind handlers
            const confirmBtn = overlay.querySelector('#btnDialogConfirm');
            const cancelBtn = overlay.querySelector('#btnDialogCancel');

            const cleanup = () => {
                overlay.classList.add('modal-overlay--exit');
                setTimeout(() => overlay.remove(), 200);
            };

            confirmBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(false);
                }
            });

            // Close on Escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(false);
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }
}

// ========================================
// EXPORT SINGLETON INSTANCE
// ========================================
window.purchaseOrderUI = new PurchaseOrderUIComponents();

console.log('[Purchase Orders] UI components loaded successfully');
