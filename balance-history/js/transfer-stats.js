// =====================================================
// TRANSFER STATS - JAVASCRIPT
// =====================================================

const TS_API_BASE_URL = window.CONFIG?.API_BASE_URL || (
    window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://chatomni-proxy.nhijudyshop.workers.dev'
);

// State
let tsData = [];
let tsFilteredData = [];
let tsCurrentPage = 1;
let tsTotalPages = 1;
const TS_PAGE_SIZE = 50;

// =====================================================
// REALTIME UPDATE SUPPORT
// =====================================================

/**
 * Add new transaction to Transfer Stats in realtime (called from main.js SSE handler)
 * @param {Object} transaction - The new incoming transaction
 */
window.addNewTransferStatRealtime = function(transaction) {
    console.log('[TS-REALTIME] New incoming transaction:', transaction);

    // Convert transaction format to match transfer stats format
    const newItem = {
        id: transaction.id,
        transaction_id: transaction.id,
        customer_name: transaction.customer_name || '',
        customer_phone: transaction.linked_customer_phone || '',
        amount: transaction.transfer_amount,
        content: transaction.content,
        notes: '',
        transaction_date: transaction.transaction_date,
        is_checked: false,
        is_verified: false,
        created_at: transaction.created_at
    };

    // Add to beginning of data array
    tsData.unshift(newItem);

    // Re-filter and render
    filterTransferStats();
    updateUncheckedBadge();

    console.log('[TS-REALTIME] Transfer Stats updated, total:', tsData.length);
};

// =====================================================
// LOAD & DISPLAY DATA
// =====================================================

async function loadTransferStats() {
    const tableBody = document.getElementById('tsTableBody');
    if (!tableBody) return;

    // Show loading
    tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="ts-loading">
                <i data-lucide="loader-2"></i>
                <p>Đang tải dữ liệu...</p>
            </td>
        </tr>
    `;
    lucide.createIcons();

    try {
        const response = await fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats`);
        const result = await response.json();

        if (result.success) {
            tsData = result.data || [];
            filterTransferStats();
            updateUncheckedBadge();
        } else {
            console.error('[TS] Error loading data:', result.error);
            showTSEmpty('Không thể tải dữ liệu');
        }
    } catch (error) {
        console.error('[TS] Error:', error);
        showTSEmpty('Lỗi kết nối');
    }
}

function filterTransferStats(keepCurrentPage = false) {
    const visibilityFilter = document.getElementById('tsVisibilityFilter')?.value || 'all';
    const verifiedFilter = document.getElementById('tsVerifiedFilter')?.value || 'all';
    const searchInput = document.getElementById('tsSearchInput')?.value?.toLowerCase() || '';

    tsFilteredData = tsData.filter(item => {
        // Visibility filter (Ẩn/Hiện)
        if (visibilityFilter === 'visible' && !item.is_checked) return false;
        if (visibilityFilter === 'hidden' && item.is_checked) return false;

        // Verified filter (Đã KT)
        if (verifiedFilter === 'verified' && !item.is_verified) return false;
        if (verifiedFilter === 'unverified' && item.is_verified) return false;

        // Search filter
        if (searchInput) {
            const searchFields = [
                item.customer_name || '',
                item.customer_phone || '',
                item.content || '',
                item.notes || ''
            ].join(' ').toLowerCase();

            if (!searchFields.includes(searchInput)) return false;
        }

        return true;
    });

    tsTotalPages = Math.ceil(tsFilteredData.length / TS_PAGE_SIZE) || 1;

    // Reset to page 1 only if not keeping current page, or if current page exceeds total
    if (!keepCurrentPage) {
        tsCurrentPage = 1;
    } else if (tsCurrentPage > tsTotalPages) {
        tsCurrentPage = tsTotalPages;
    }

    renderTSTable();
    updateTSStats();
}

function renderTSTable() {
    const tableBody = document.getElementById('tsTableBody');
    if (!tableBody) return;

    if (tsFilteredData.length === 0) {
        showTSEmpty('Không có dữ liệu');
        updateTSPagination();
        return;
    }

    // Paginate
    const startIdx = (tsCurrentPage - 1) * TS_PAGE_SIZE;
    const endIdx = startIdx + TS_PAGE_SIZE;
    const pageData = tsFilteredData.slice(startIdx, endIdx);

    tableBody.innerHTML = pageData.map(item => {
        const rowClass = item.is_checked ? 'checked' : 'unchecked';
        const verifiedClass = item.is_verified ? 'verified' : '';
        const amountClass = item.amount >= 0 ? '' : 'negative';
        const formattedAmount = formatCurrency(item.amount);
        const formattedDate = formatDateTime(item.transaction_date);

        // Format date with line break
        const dateObj = new Date(item.transaction_date);
        const datePart = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timePart = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

        return `
            <tr class="${rowClass} ${verifiedClass}" data-id="${item.id}">
                <td>${datePart}<br><small style="color:#888">${timePart}</small></td>
                <td class="truncate-cell" data-tooltip="${escapeHtml(item.customer_name || '')}" onmouseenter="showTooltip(event, this.dataset.tooltip)" onmouseleave="hideTooltip()">${item.customer_name || '<span style="color: #9ca3af;">—</span>'}</td>
                <td class="ts-customer-phone">${item.customer_phone || '<span style="color: #9ca3af;">—</span>'}</td>
                <td class="col-amount ${amountClass}">${formattedAmount}</td>
                <td class="wrap-cell" data-tooltip="${escapeHtml(item.content || '')}" onmouseenter="showTooltip(event, this.dataset.tooltip)" onmouseleave="hideTooltip()">${item.content || '—'}</td>
                <td class="wrap-cell" data-tooltip="${escapeHtml(item.notes || '')}" onmouseenter="showTooltip(event, this.dataset.tooltip)" onmouseleave="hideTooltip()">${item.notes || '<span style="color: #9ca3af;">—</span>'}</td>
                <td class="col-action">
                    <input type="checkbox" class="ts-checkbox ts-hide-checkbox"
                           ${item.is_checked ? 'checked' : ''}
                           onchange="toggleTSChecked(${item.id}, this.checked)"
                           title="${item.is_checked ? 'Đang hiện' : 'Đang ẩn'}">
                </td>
                <td class="col-action">
                    <input type="checkbox" class="ts-checkbox ts-verify-checkbox"
                           ${item.is_verified ? 'checked' : ''}
                           ${!item.is_checked ? 'disabled' : ''}
                           onchange="toggleTSVerified(${item.id}, this.checked)"
                           title="${item.is_verified ? 'Đã kiểm tra' : 'Chưa kiểm tra'}">
                </td>
                <td class="col-action">
                    <button class="btn-edit-ts" onclick="openEditTSModal(${item.id})" title="Sửa">
                        <i data-lucide="pencil"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();
    updateTSPagination();
}

function showTSEmpty(message) {
    const tableBody = document.getElementById('tsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="ts-empty">
                <i data-lucide="inbox"></i>
                <p>${message}</p>
            </td>
        </tr>
    `;
    lucide.createIcons();
}

// =====================================================
// STATS & PAGINATION
// =====================================================

function updateTSStats() {
    const total = tsData.length;
    const unchecked = tsData.filter(item => !item.is_checked).length;
    const checked = total - unchecked;
    const verified = tsData.filter(item => item.is_verified).length;

    const totalEl = document.getElementById('tsTotalCount');
    const uncheckedEl = document.getElementById('tsUncheckedCount');
    const checkedEl = document.getElementById('tsCheckedCount');
    const verifiedEl = document.getElementById('tsVerifiedCount');

    if (totalEl) totalEl.textContent = total;
    if (uncheckedEl) uncheckedEl.textContent = unchecked;
    if (checkedEl) checkedEl.textContent = checked;
    if (verifiedEl) verifiedEl.textContent = verified;
}

function updateTSPagination() {
    const pageInfo = document.getElementById('tsPageInfo');
    const prevBtn = document.getElementById('tsPrevPageBtn');
    const nextBtn = document.getElementById('tsNextPageBtn');

    if (pageInfo) {
        pageInfo.textContent = `Trang ${tsCurrentPage} / ${tsTotalPages}`;
    }

    if (prevBtn) {
        prevBtn.disabled = tsCurrentPage <= 1;
    }

    if (nextBtn) {
        nextBtn.disabled = tsCurrentPage >= tsTotalPages;
    }
}

function tsChangePage(delta) {
    const newPage = tsCurrentPage + delta;
    if (newPage >= 1 && newPage <= tsTotalPages) {
        tsCurrentPage = newPage;
        renderTSTable();
    }
}

function updateUncheckedBadge() {
    const badge = document.getElementById('uncheckedBadge');
    if (!badge) return;

    const unchecked = tsData.filter(item => !item.is_checked).length;

    if (unchecked > 0) {
        badge.textContent = unchecked > 99 ? '99+' : unchecked;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// =====================================================
// TOGGLE CHECKED STATUS
// =====================================================

async function toggleTSChecked(id, checked) {
    // Prevent unchecking if already verified
    const item = tsData.find(d => d.id === id);
    if (!checked && item && item.is_verified) {
        // Revert checkbox state
        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            const hideCheckbox = row.querySelector('.ts-hide-checkbox');
            if (hideCheckbox) hideCheckbox.checked = true;
        }
        if (window.notificationManager) {
            window.notificationManager.show('Không thể bỏ "Ẩn/Hiện" khi đã "Kiểm Tra". Hãy bỏ check "Đã Kiểm Tra" trước.', 'warning');
        }
        return;
    }

    try {
        const response = await fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats/${id}/check`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checked })
        });

        const result = await response.json();

        if (result.success) {
            // Update local data
            if (item) {
                item.is_checked = checked;
                // If unchecking, also uncheck verified
                if (!checked) {
                    item.is_verified = false;
                }
            }

            // Update UI
            const row = document.querySelector(`tr[data-id="${id}"]`);
            if (row) {
                row.classList.toggle('checked', checked);
                row.classList.toggle('unchecked', !checked);
                // Update verified checkbox disabled state
                const verifyCheckbox = row.querySelector('.ts-verify-checkbox');
                if (verifyCheckbox) {
                    verifyCheckbox.disabled = !checked;
                    if (!checked) {
                        verifyCheckbox.checked = false;
                        row.classList.remove('verified');
                    }
                }
            }

            updateTSStats();
            updateUncheckedBadge();

            // Show notification
            if (window.notificationManager) {
                window.notificationManager.show(
                    checked ? 'Đã hiện giao dịch' : 'Đã ẩn giao dịch',
                    'success'
                );
            }
        } else {
            console.error('[TS] Error toggling check:', result.error);
        }
    } catch (error) {
        console.error('[TS] Error:', error);
    }
}

async function toggleTSVerified(id, verified) {
    try {
        const response = await fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats/${id}/verify`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ verified })
        });

        const result = await response.json();

        if (result.success) {
            // Update local data
            const item = tsData.find(d => d.id === id);
            if (item) {
                item.is_verified = verified;
            }

            // Update UI
            const row = document.querySelector(`tr[data-id="${id}"]`);
            if (row) {
                row.classList.toggle('verified', verified);
            }

            // Update stats to reflect verified count change
            updateTSStats();

            // Show notification
            if (window.notificationManager) {
                window.notificationManager.show(
                    verified ? 'Đã đánh dấu kiểm tra' : 'Đã bỏ đánh dấu kiểm tra',
                    'success'
                );
            }
        } else {
            console.error('[TS] Error toggling verified:', result.error);
        }
    } catch (error) {
        console.error('[TS] Error:', error);
    }
}

async function markAllChecked() {
    const uncheckedIds = tsFilteredData.filter(item => !item.is_checked).map(item => item.id);

    if (uncheckedIds.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.show('Không có giao dịch nào cần đánh dấu', 'info');
        }
        return;
    }

    if (!confirm(`Đánh dấu ${uncheckedIds.length} giao dịch đã kiểm tra?`)) {
        return;
    }

    try {
        const response = await fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats/mark-all-checked`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: uncheckedIds })
        });

        const result = await response.json();

        if (result.success) {
            // Update local data
            uncheckedIds.forEach(id => {
                const item = tsData.find(d => d.id === id);
                if (item) item.is_checked = true;
            });

            filterTransferStats();
            updateUncheckedBadge();

            if (window.notificationManager) {
                window.notificationManager.show(
                    `Đã đánh dấu ${uncheckedIds.length} giao dịch`,
                    'success'
                );
            }
        }
    } catch (error) {
        console.error('[TS] Error marking all:', error);
    }
}

// =====================================================
// SELECT ALL
// =====================================================

function toggleSelectAllTS() {
    const selectAll = document.getElementById('tsSelectAll');
    const checkboxes = document.querySelectorAll('.ts-row-select');

    checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
    });
}

function toggleTSRowSelect(id) {
    // Update select all checkbox state
    const checkboxes = document.querySelectorAll('.ts-row-select');
    const selectAll = document.getElementById('tsSelectAll');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    if (selectAll) {
        selectAll.checked = allChecked;
    }
}

// =====================================================
// TRANSFER FROM BALANCE HISTORY
// =====================================================

async function transferToStats(transactionId) {
    try {
        const response = await fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_id: transactionId })
        });

        const result = await response.json();

        if (result.success) {
            // Update button
            const btn = document.querySelector(`button[onclick="transferToStats(${transactionId})"]`);
            if (btn) {
                btn.classList.add('transferred');
                btn.innerHTML = '<i data-lucide="check"></i> Đã chuyển';
                btn.onclick = null;
                lucide.createIcons();
            }

            // Reload transfer stats if panel is visible
            if (document.getElementById('transferStatsPanel')?.classList.contains('active')) {
                loadTransferStats();
            }

            updateUncheckedBadge();

            if (window.notificationManager) {
                window.notificationManager.show('Đã chuyển vào Thống Kê', 'success');
            }
        } else {
            if (result.error === 'Already exists') {
                if (window.notificationManager) {
                    window.notificationManager.show('Giao dịch đã có trong Thống Kê', 'info');
                }
            } else {
                console.error('[TS] Error transferring:', result.error);
            }
        }
    } catch (error) {
        console.error('[TS] Error:', error);
    }
}

// =====================================================
// SYNC CUSTOMER INFO
// =====================================================

async function syncTransferStats() {
    try {
        if (window.notificationManager) {
            window.notificationManager.show('Đang đồng bộ...', 'info');
        }

        const response = await fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
            if (window.notificationManager) {
                window.notificationManager.show(
                    `Đã đồng bộ ${result.synced} giao dịch`,
                    result.synced > 0 ? 'success' : 'info'
                );
            }
            // Reload data to show updated customer info
            if (result.synced > 0) {
                await loadTransferStats();
            }
        } else {
            console.error('[TS] Sync error:', result.error);
            if (window.notificationManager) {
                window.notificationManager.show('Lỗi đồng bộ', 'error');
            }
        }
    } catch (error) {
        console.error('[TS] Sync error:', error);
        if (window.notificationManager) {
            window.notificationManager.show('Lỗi kết nối', 'error');
        }
    }
}

// =====================================================
// HELPERS
// =====================================================

function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '—';
    const formatted = Math.abs(amount).toLocaleString('vi-VN');
    const sign = amount >= 0 ? '+' : '-';
    return `${sign}${formatted} đ`;
}

function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =====================================================
// EVENT LISTENERS
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Edit modal close buttons
    const closeEditTSModalBtn = document.getElementById('closeEditTSModalBtn');
    if (closeEditTSModalBtn) {
        closeEditTSModalBtn.addEventListener('click', closeEditTSModal);
    }

    const cancelEditTSBtn = document.getElementById('cancelEditTSBtn');
    if (cancelEditTSBtn) {
        cancelEditTSBtn.addEventListener('click', closeEditTSModal);
    }

    // Edit form submit
    const editTSForm = document.getElementById('editTSForm');
    if (editTSForm) {
        editTSForm.addEventListener('submit', saveTSEdit);
    }

    // Close modal on background click
    const editTSModal = document.getElementById('editTSModal');
    if (editTSModal) {
        editTSModal.addEventListener('click', (e) => {
            if (e.target === editTSModal) {
                closeEditTSModal();
            }
        });
    }

    // Load initial badge count
    setTimeout(() => {
        fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats/count`)
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    const badge = document.getElementById('uncheckedBadge');
                    if (badge && result.unchecked > 0) {
                        badge.textContent = result.unchecked > 99 ? '99+' : result.unchecked;
                        badge.style.display = 'inline-block';
                    }
                }
            })
            .catch(() => {});
    }, 500);
});

// =====================================================
// EDIT MODAL
// =====================================================

// TPOS Lookup state for Transfer Stats
let tsTPOSLookupTimeout = null;
let tsTPOSLookupCache = {};
let tsCurrentEditItem = null; // Store current editing item

function openEditTSModal(id) {
    const item = tsData.find(d => d.id === id);
    if (!item) return;

    tsCurrentEditItem = item; // Store for later use

    document.getElementById('editTSId').value = id;
    document.getElementById('editTSCustomerName').value = item.customer_name || '';
    document.getElementById('editTSCustomerPhone').value = item.customer_phone || '';
    document.getElementById('editTSNotes').value = item.notes || '';

    // Reset TPOS lookup UI
    resetTSTPOSLookupUI();

    // Setup phone input listener for TPOS lookup
    const phoneInput = document.getElementById('editTSCustomerPhone');
    phoneInput.removeEventListener('input', handleTSPhoneInputForTPOS);
    phoneInput.addEventListener('input', handleTSPhoneInputForTPOS);

    // Setup dropdown change listener
    const dropdown = document.getElementById('tsTPOSCustomerDropdown');
    if (dropdown) {
        dropdown.removeEventListener('change', handleTSTPOSDropdownChange);
        dropdown.addEventListener('change', handleTSTPOSDropdownChange);
    }

    // If phone already has 10 digits, trigger lookup
    if (item.customer_phone && item.customer_phone.length === 10) {
        handleTSPhoneInputForTPOS();
    }

    document.getElementById('editTSModal').classList.add('active');
    lucide.createIcons();
}

function closeEditTSModal() {
    document.getElementById('editTSModal').classList.remove('active');
    tsCurrentEditItem = null;
    resetTSTPOSLookupUI();
}

/**
 * Reset TPOS lookup UI elements
 */
function resetTSTPOSLookupUI() {
    const loading = document.getElementById('tsTPOSLookupLoading');
    const result = document.getElementById('tsTPOSLookupResult');
    const single = document.getElementById('tsTPOSLookupSingle');
    const multiple = document.getElementById('tsTPOSLookupMultiple');
    const empty = document.getElementById('tsTPOSLookupEmpty');
    const note = document.getElementById('tsTPOSLookupNote');
    const nameInput = document.getElementById('editTSCustomerName');

    if (loading) loading.style.display = 'none';
    if (result) result.style.display = 'none';
    if (single) single.style.display = 'none';
    if (multiple) multiple.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (note) note.style.display = 'block';

    // Reset name input state
    if (nameInput) {
        nameInput.readOnly = true;
        nameInput.style.background = '#f9fafb';
        nameInput.placeholder = 'Tự động tìm từ TPOS...';
    }
}

/**
 * Fetch customer(s) from TPOS by phone number (for Transfer Stats)
 */
async function fetchTSTPOSCustomer(phone) {
    // Check cache first
    if (tsTPOSLookupCache[phone]) {
        return tsTPOSLookupCache[phone];
    }

    try {
        const response = await fetch(`${TS_API_BASE_URL}/api/sepay/tpos/customer/${phone}`);
        const result = await response.json();

        if (result.success) {
            const cacheResult = {
                success: true,
                customers: result.data || [],
                count: result.count || 0
            };
            // Cache for 5 minutes
            tsTPOSLookupCache[phone] = cacheResult;
            setTimeout(() => delete tsTPOSLookupCache[phone], 5 * 60 * 1000);
            return cacheResult;
        } else {
            return { success: false, customers: [], count: 0, error: result.error };
        }
    } catch (error) {
        console.error('[TS-TPOS-LOOKUP] Error:', error);
        return { success: false, customers: [], count: 0, error: error.message };
    }
}

/**
 * Handle phone input for TPOS auto-lookup
 */
function handleTSPhoneInputForTPOS() {
    const phoneInput = document.getElementById('editTSCustomerPhone');
    const phone = phoneInput?.value?.replace(/\D/g, '') || '';

    // Clear previous timeout
    if (tsTPOSLookupTimeout) {
        clearTimeout(tsTPOSLookupTimeout);
    }

    // Reset UI
    resetTSTPOSLookupUI();

    // Only lookup if exactly 10 digits
    if (phone.length !== 10) {
        return;
    }

    // Show loading
    const loading = document.getElementById('tsTPOSLookupLoading');
    const note = document.getElementById('tsTPOSLookupNote');
    if (loading) loading.style.display = 'block';
    if (note) note.style.display = 'none';
    lucide.createIcons();

    // Debounce the lookup
    tsTPOSLookupTimeout = setTimeout(async () => {
        try {
            const result = await fetchTSTPOSCustomer(phone);

            // Hide loading
            if (loading) loading.style.display = 'none';

            const resultContainer = document.getElementById('tsTPOSLookupResult');
            const single = document.getElementById('tsTPOSLookupSingle');
            const multiple = document.getElementById('tsTPOSLookupMultiple');
            const empty = document.getElementById('tsTPOSLookupEmpty');
            const nameInput = document.getElementById('editTSCustomerName');

            if (resultContainer) resultContainer.style.display = 'block';

            if (result.success && result.count > 0) {
                if (result.count === 1) {
                    // Single customer found
                    const customer = result.customers[0];
                    if (single) {
                        single.style.display = 'block';
                        document.getElementById('tsTPOSLookupName').textContent = customer.name || customer.Name || 'N/A';
                    }
                    // Auto-fill name
                    if (nameInput) {
                        nameInput.value = customer.name || customer.Name || '';
                    }
                } else {
                    // Multiple customers found
                    if (multiple) {
                        multiple.style.display = 'block';
                        const dropdown = document.getElementById('tsTPOSCustomerDropdown');
                        if (dropdown) {
                            dropdown.innerHTML = '<option value="">-- Chọn khách hàng --</option>' +
                                result.customers.map(c => {
                                    const name = c.name || c.Name || 'N/A';
                                    const balance = c.wallet_balance !== undefined ? c.wallet_balance : (c.WalletBalance || 0);
                                    return `<option value="${escapeHtml(name)}" data-balance="${balance}">${name} (Ví: ${formatCurrency(balance)})</option>`;
                                }).join('');
                        }
                    }
                    // Clear name - user must select
                    if (nameInput) {
                        nameInput.value = '';
                        nameInput.placeholder = 'Chọn khách hàng từ danh sách...';
                    }
                }
            } else {
                // No customer found
                if (empty) empty.style.display = 'block';
                // Allow manual name entry
                if (nameInput) {
                    nameInput.readOnly = false;
                    nameInput.style.background = '#fff';
                    nameInput.placeholder = 'Nhập tên khách hàng (không tìm thấy trong TPOS)';
                }
            }

            lucide.createIcons();
        } catch (error) {
            console.error('[TS-TPOS-LOOKUP] Error:', error);
            if (loading) loading.style.display = 'none';
            const empty = document.getElementById('tsTPOSLookupEmpty');
            if (empty) {
                empty.style.display = 'block';
                empty.innerHTML = '<i data-lucide="alert-circle" style="width: 14px; height: 14px; vertical-align: middle;"></i> Lỗi khi tìm TPOS';
            }
            lucide.createIcons();
        }
    }, 500);
}

/**
 * Handle TPOS dropdown selection
 */
function handleTSTPOSDropdownChange() {
    const dropdown = document.getElementById('tsTPOSCustomerDropdown');
    const nameInput = document.getElementById('editTSCustomerName');

    if (dropdown && nameInput) {
        const selectedName = dropdown.value;
        if (selectedName) {
            nameInput.value = selectedName;
        }
    }
}

async function saveTSEdit(e) {
    e.preventDefault();

    const id = document.getElementById('editTSId').value;
    const customer_name = document.getElementById('editTSCustomerName').value.trim();
    const customer_phone = document.getElementById('editTSCustomerPhone').value.trim();
    const notes = document.getElementById('editTSNotes').value.trim();

    const item = tsData.find(d => d.id === parseInt(id));
    if (!item) {
        window.notificationManager?.show('Không tìm thấy giao dịch', 'error');
        return;
    }

    try {
        // Chỉ update transfer_stats record (name, phone, notes)
        // KHÔNG gọi API gán phone/credit wallet - sẽ implement lại sau
        const tsResponse = await fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_name, customer_phone, notes })
        });

        const tsResult = await tsResponse.json();
        if (!tsResult.success) {
            console.error('[TS] Error:', tsResult.error);
            window.notificationManager?.show('Lỗi cập nhật: ' + tsResult.error, 'error');
            return;
        }

        // Update local data
        item.customer_name = customer_name || null;
        item.customer_phone = customer_phone || null;
        item.notes = notes || null;

        // Re-render
        filterTransferStats(true);
        closeEditTSModal();

        window.notificationManager?.show('Đã cập nhật thông tin', 'success');

    } catch (error) {
        console.error('[TS] Error:', error);
        window.notificationManager?.show('Lỗi kết nối', 'error');
    }
}

// Make functions globally available
window.loadTransferStats = loadTransferStats;
window.filterTransferStats = filterTransferStats;
window.toggleTSChecked = toggleTSChecked;
window.toggleTSVerified = toggleTSVerified;
window.toggleSelectAllTS = toggleSelectAllTS;
window.toggleTSRowSelect = toggleTSRowSelect;
window.tsChangePage = tsChangePage;
window.transferToStats = transferToStats;
window.markAllChecked = markAllChecked;
window.openEditTSModal = openEditTSModal;
window.closeEditTSModal = closeEditTSModal;
window.saveTSEdit = saveTSEdit;
window.syncTransferStats = syncTransferStats;

// =====================================================
// FLOATING TOOLTIP
// =====================================================
let tooltipElement = null;

function showTooltip(event, text) {
    if (!text || text === '—') return;

    // Remove existing tooltip
    hideTooltip();

    // Create tooltip
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'ts-floating-tooltip';
    tooltipElement.textContent = text;
    document.body.appendChild(tooltipElement);

    // Position tooltip
    const rect = event.target.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();

    let left = rect.left;
    let top = rect.bottom + 8;

    // Adjust if tooltip goes off screen
    if (left + tooltipRect.width > window.innerWidth - 20) {
        left = window.innerWidth - tooltipRect.width - 20;
    }
    if (top + tooltipRect.height > window.innerHeight - 20) {
        top = rect.top - tooltipRect.height - 8;
    }

    tooltipElement.style.left = left + 'px';
    tooltipElement.style.top = top + 'px';
}

function hideTooltip() {
    if (tooltipElement) {
        tooltipElement.remove();
        tooltipElement = null;
    }
}

window.showTooltip = showTooltip;
window.hideTooltip = hideTooltip;
