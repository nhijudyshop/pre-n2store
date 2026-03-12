/**
 * Tab Social Orders - Table Module
 * Table rendering, filtering, search
 */

// ===== TABLE RENDERING =====
function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const orders = SocialOrderState.filteredOrders;

    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="15" style="text-align: center; padding: 60px 20px;">
                    <div style="color: #9ca3af;">
                        <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
                        <p style="margin: 0; font-size: 14px;">Không có đơn hàng nào</p>
                        <p style="margin: 8px 0 0; font-size: 13px;">Nhấn "Tạo đơn mới" để bắt đầu</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    orders.forEach((order, index) => {
        html += renderTableRow(order, index);
    });

    tbody.innerHTML = html;

    // Apply column visibility after rendering
    if (window.socialColumnVisibility) {
        const settings = window.socialColumnVisibility.load();
        window.socialColumnVisibility.apply(settings);
    }

    // Update page info
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Hiển thị 1 - ${orders.length} của ${SocialOrderState.orders.length}`;
    }
}

function renderTableRow(order, index) {
    const isSelected = SocialOrderState.selectedOrders.has(order.id);
    const sourceConfig = SOURCE_CONFIG[order.source] || SOURCE_CONFIG.manual;
    const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;

    // Render tags
    let tagsHtml = '';
    if (order.tags && order.tags.length > 0) {
        tagsHtml = order.tags
            .map(
                (tag) => `
            <span class="order-tag" style="background: ${tag.color};">${tag.name}</span>
        `
            )
            .join(' ');
    }

    // Render post link
    let postHtml = '';
    if (order.postUrl) {
        const icon =
            order.source === 'facebook_post'
                ? 'fa-facebook-f'
                : order.source === 'instagram'
                    ? 'fa-instagram'
                    : order.source === 'tiktok'
                        ? 'fa-tiktok'
                        : 'fa-link';
        postHtml = `
            <a href="${order.postUrl}" target="_blank" class="post-link" title="${order.postUrl}">
                <i class="fab ${icon}"></i>
                ${order.postLabel || 'Xem'}
            </a>
        `;
    } else {
        postHtml = '<span class="post-empty">—</span>';
    }

    // Render products summary
    const productCount = order.products?.length || 0;
    const productQty = order.totalQuantity || 0;
    const productsHtml = `
        <div style="font-size: 12px;">
            <strong>${productCount}</strong> SP
            <span style="color: #6b7280;">(${productQty} cái)</span>
        </div>
    `;

    // Chat button (disabled for now)
    const chatHtml = `
        <button class="chat-btn disabled" title="Chưa có thông tin Pancake" disabled>
            <i class="fas fa-comment-dots"></i>
        </button>
    `;

    return `
        <tr data-order-id="${order.id}">
            <td>
                <input type="checkbox" 
                       class="order-checkbox" 
                       data-order-id="${order.id}"
                       ${isSelected ? 'checked' : ''}
                       onchange="toggleOrderSelection('${order.id}')">
            </td>
            <td data-column="actions">
                <div class="action-buttons">
                    <button class="btn-edit-icon" onclick="openEditOrderModal('${order.id}')" title="Sửa đơn">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="tag-icon-btn-red" onclick="confirmDeleteOrder('${order.id}')" title="Xóa đơn">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn-edit-icon" onclick="openRetailSaleFromSocial('${order.id}')" title="Tạo phiếu bán hàng lẻ" style="color: #10b981;">
                        <i class="fas fa-receipt"></i>
                    </button>
                </div>
            </td>
            <td data-column="stt" style="text-align: center;">${order.stt || index + 1}</td>
            <td data-column="tag">
                <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                    <button class="tag-icon-btn" onclick="openTagModal('${order.id}')" title="Gán tag">
                        <i class="fas fa-tag"></i>
                    </button>
                    ${tagsHtml}
                </div>
            </td>
            <td data-column="customer">
                <div class="customer-name">${order.customerName || '—'}</div>
            </td>
            <td data-column="phone">
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span>${order.phone || '—'}</span>
                    ${order.phone
            ? `
                        <button class="copy-phone-btn" onclick="copyPhone('${order.phone}')" 
                                style="background: none; border: none; cursor: pointer; color: #9ca3af; padding: 2px;">
                            <i class="fas fa-copy" style="font-size: 11px;"></i>
                        </button>
                    `
            : ''
        }
                </div>
            </td>
            <td data-column="chat" style="text-align: center;">
                ${chatHtml}
            </td>
            <td data-column="products">
                ${productsHtml}
            </td>
            <td data-column="post">
                ${postHtml}
            </td>
            <td data-column="address" style="max-width: 200px; white-space: normal;">
                ${order.address || '—'}
            </td>
            <td data-column="total" style="text-align: right; font-weight: 600; color: #8b5cf6;">
                ${formatCurrency(order.totalAmount)}
            </td>
            <td data-column="created-date" style="font-size: 12px; color: #6b7280;">
                ${formatDate(order.createdAt)}
            </td>
            <td data-column="invoice-status" style="min-width: 160px;">
                ${typeof window.renderSocialInvoiceCell === 'function' ? window.renderSocialInvoiceCell(order) : '<span style="color: #9ca3af;">—</span>'}
            </td>
            <td data-column="status" style="text-align: center;">
                <span class="status-badge-social ${order.status}" style="background: ${statusConfig.bgColor}; color: ${statusConfig.textColor};">
                    ${statusConfig.label}
                </span>
            </td>
        </tr>
    `;
}

// ===== FILTERING & SEARCH =====

// Date filter state
let currentDateFilter = 'all';
let customDateFrom = null;
let customDateTo = null;

/**
 * Set date filter and update UI
 */
function setDateFilter(range) {
    currentDateFilter = range;

    // Update button states
    document.querySelectorAll('.date-filter-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.range === range);
    });

    // Hide custom date range if not custom
    if (range !== 'custom') {
        document.getElementById('customDateRange').style.display = 'none';
        customDateFrom = null;
        customDateTo = null;
    }

    performTableSearch();
}

/**
 * Toggle custom date range visibility
 */
function toggleCustomDateRange() {
    const container = document.getElementById('customDateRange');
    const isVisible = container.style.display !== 'none';

    if (isVisible) {
        container.style.display = 'none';
        setDateFilter('all');
    } else {
        container.style.display = 'flex';
        currentDateFilter = 'custom';

        // Update button states
        document.querySelectorAll('.date-filter-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.range === 'custom');
        });
    }
}

/**
 * Apply custom date range filter
 */
function applyCustomDateRange() {
    const fromInput = document.getElementById('dateFrom');
    const toInput = document.getElementById('dateTo');

    customDateFrom = fromInput.value ? new Date(fromInput.value) : null;
    customDateTo = toInput.value ? new Date(toInput.value + 'T23:59:59') : null;

    if (customDateFrom || customDateTo) {
        currentDateFilter = 'custom';
        performTableSearch();
    }
}

/**
 * Get date range based on filter selection
 */
function getDateRange(filter) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filter) {
        case 'today':
            return { from: today, to: new Date(today.getTime() + 86400000 - 1) };
        case 'yesterday':
            const yesterday = new Date(today.getTime() - 86400000);
            return { from: yesterday, to: new Date(today.getTime() - 1) };
        case '3days':
            return { from: new Date(today.getTime() - 3 * 86400000), to: now };
        case '7days':
            return { from: new Date(today.getTime() - 7 * 86400000), to: now };
        case '15days':
            return { from: new Date(today.getTime() - 15 * 86400000), to: now };
        case 'custom':
            return { from: customDateFrom, to: customDateTo };
        default:
            return { from: null, to: null };
    }
}

function performTableSearch() {
    const searchInput = document.getElementById('tableSearchInput');
    const statusFilter = document.getElementById('statusFilter');
    const sourceFilter = document.getElementById('sourceFilter');
    const tagFilter = document.getElementById('tagFilter');

    const searchTerm = (searchInput?.value || '').toLowerCase().trim();
    const statusValue = statusFilter?.value || 'all';
    const sourceValue = sourceFilter?.value || 'all';
    const tagValue = tagFilter?.value || 'all';

    // Get date range
    const dateRange = getDateRange(currentDateFilter);

    // Update state
    SocialOrderState.filters = {
        search: searchTerm,
        status: statusValue,
        source: sourceValue,
        tag: tagValue,
        dateFilter: currentDateFilter,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
    };

    // Filter orders
    SocialOrderState.filteredOrders = SocialOrderState.orders.filter((order) => {
        // Date filter
        if (dateRange.from || dateRange.to) {
            const orderDate = new Date(order.createdAt);
            if (dateRange.from && orderDate < dateRange.from) {
                return false;
            }
            if (dateRange.to && orderDate > dateRange.to) {
                return false;
            }
        }

        // Status filter
        if (statusValue !== 'all' && order.status !== statusValue) {
            return false;
        }

        // Source filter
        if (sourceValue !== 'all' && order.source !== sourceValue) {
            return false;
        }

        // Tag filter
        if (tagValue !== 'all') {
            const hasTag = order.tags?.some((t) => t.id === tagValue);
            if (!hasTag) return false;
        }

        // Search filter
        if (searchTerm) {
            const searchFields = [
                order.id,
                order.customerName,
                order.phone,
                order.address,
                order.note,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            if (!searchFields.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    // Update UI
    renderTable();
    updateSearchResultCount();
    updateSearchClearButton();
}

function clearSearch() {
    const searchInput = document.getElementById('tableSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    performTableSearch();
}

function updateSearchResultCount() {
    const countEl = document.getElementById('searchResultCount');
    if (countEl) {
        countEl.textContent = SocialOrderState.filteredOrders.length;
    }
}

function updateSearchClearButton() {
    const clearBtn = document.getElementById('searchClearBtn');
    const searchInput = document.getElementById('tableSearchInput');
    if (clearBtn && searchInput) {
        clearBtn.classList.toggle('active', searchInput.value.length > 0);
    }
}

// ===== TAG FILTER =====
function populateTagFilter() {
    const tagFilter = document.getElementById('tagFilter');
    if (!tagFilter) return;

    // Keep "Tất cả" option
    tagFilter.innerHTML = '<option value="all" selected>Tất cả</option>';

    // Add tags
    SocialOrderState.tags.forEach((tag) => {
        const option = document.createElement('option');
        option.value = tag.id;
        option.textContent = tag.name;
        tagFilter.appendChild(option);
    });
}

// ===== SELECTION =====
function toggleOrderSelection(orderId) {
    if (SocialOrderState.selectedOrders.has(orderId)) {
        SocialOrderState.selectedOrders.delete(orderId);
    } else {
        SocialOrderState.selectedOrders.add(orderId);
    }
    updateSelectionUI();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.order-checkbox');

    if (selectAllCheckbox?.checked) {
        // Select all visible orders
        SocialOrderState.filteredOrders.forEach((order) => {
            SocialOrderState.selectedOrders.add(order.id);
        });
        checkboxes.forEach((cb) => (cb.checked = true));
    } else {
        // Deselect all
        SocialOrderState.selectedOrders.clear();
        checkboxes.forEach((cb) => (cb.checked = false));
    }

    updateSelectionUI();
}

function updateSelectionUI() {
    const count = SocialOrderState.selectedOrders.size;
    const actionSection = document.getElementById('actionButtonsSection');
    const countEl = document.getElementById('selectedOrdersCount');

    if (actionSection) {
        actionSection.style.display = count > 0 ? 'flex' : 'none';
    }

    if (countEl) {
        countEl.textContent = count;
    }

    // Update selectAll checkbox
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        const visibleCount = SocialOrderState.filteredOrders.length;
        selectAllCheckbox.checked = count > 0 && count === visibleCount;
        selectAllCheckbox.indeterminate = count > 0 && count < visibleCount;
    }
}

// ===== UTILITY ACTIONS =====
function copyPhone(phone) {
    navigator.clipboard
        .writeText(phone)
        .then(() => {
            showNotification('Đã copy số điện thoại', 'success');
        })
        .catch(() => {
            showNotification('Không thể copy', 'error');
        });
}

// ===== DELETE =====
let pendingDeleteOrderId = null;

function confirmDeleteOrder(orderId) {
    pendingDeleteOrderId = orderId;
    const order = SocialOrderState.orders.find((o) => o.id === orderId);

    const modal = document.getElementById('confirmDeleteModal');
    const messageEl = document.getElementById('confirmDeleteMessage');

    if (messageEl) {
        messageEl.innerHTML = `Bạn có chắc muốn xóa đơn <strong>${orderId}</strong>?<br>
        <span style="color: #6b7280; font-size: 13px;">Khách: ${order?.customerName || 'N/A'}</span>`;
    }

    if (modal) {
        modal.classList.add('show');
    }
}

function closeConfirmDeleteModal() {
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) {
        modal.classList.remove('show');
    }
    pendingDeleteOrderId = null;
}

function confirmDelete() {
    if (!pendingDeleteOrderId) return;

    const index = SocialOrderState.orders.findIndex((o) => o.id === pendingDeleteOrderId);
    if (index > -1) {
        SocialOrderState.orders.splice(index, 1);
        saveSocialOrdersToStorage();
        // Fire-and-forget: sync to Firestore
        deleteSocialOrder(pendingDeleteOrderId);
        showNotification('Đã xóa đơn hàng', 'success');
        performTableSearch();
    }

    closeConfirmDeleteModal();
}

function deleteSelectedOrders() {
    const count = SocialOrderState.selectedOrders.size;
    if (count === 0) return;

    if (confirm(`Bạn có chắc muốn xóa ${count} đơn đã chọn?`)) {
        // Remove selected orders
        const deletedIds = [...SocialOrderState.selectedOrders];
        SocialOrderState.orders = SocialOrderState.orders.filter(
            (o) => !SocialOrderState.selectedOrders.has(o.id)
        );
        SocialOrderState.selectedOrders.clear();
        saveSocialOrdersToStorage();
        // Fire-and-forget: sync to Firestore
        bulkDeleteSocialOrders(deletedIds);

        showNotification(`Đã xóa ${count} đơn hàng`, 'success');
        performTableSearch();
        updateSelectionUI();
    }
}

// ===== EXPORTS =====
window.renderTable = renderTable;
window.performTableSearch = performTableSearch;
window.clearSearch = clearSearch;
window.setDateFilter = setDateFilter;
window.toggleCustomDateRange = toggleCustomDateRange;
window.applyCustomDateRange = applyCustomDateRange;
window.populateTagFilter = populateTagFilter;
window.toggleOrderSelection = toggleOrderSelection;
window.toggleSelectAll = toggleSelectAll;
window.copyPhone = copyPhone;
window.confirmDeleteOrder = confirmDeleteOrder;
window.closeConfirmDeleteModal = closeConfirmDeleteModal;
window.confirmDelete = confirmDelete;
window.deleteSelectedOrders = deleteSelectedOrders;
window.updateSearchResultCount = updateSearchResultCount;
