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

function filterTransferStats() {
    const statusFilter = document.getElementById('tsStatusFilter')?.value || 'all';
    const searchInput = document.getElementById('tsSearchInput')?.value?.toLowerCase() || '';

    tsFilteredData = tsData.filter(item => {
        // Status filter
        if (statusFilter === 'checked' && !item.is_checked) return false;
        if (statusFilter === 'unchecked' && item.is_checked) return false;

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

    // Reset to page 1
    tsCurrentPage = 1;
    tsTotalPages = Math.ceil(tsFilteredData.length / TS_PAGE_SIZE) || 1;

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

        return `
            <tr class="${rowClass} ${verifiedClass}" data-id="${item.id}">
                <td>${formattedDate}</td>
                <td class="ts-customer-name">${item.customer_name || '<span style="color: #9ca3af;">—</span>'}</td>
                <td class="ts-customer-phone">${item.customer_phone || '<span style="color: #9ca3af;">—</span>'}</td>
                <td class="ts-amount ${amountClass}">${formattedAmount}</td>
                <td class="ts-content" title="${escapeHtml(item.content || '')}">${item.content || '—'}</td>
                <td class="ts-notes" title="${escapeHtml(item.notes || '')}">${item.notes || '<span style="color: #9ca3af;">—</span>'}</td>
                <td style="text-align: center;">
                    <input type="checkbox" class="ts-checkbox ts-hide-checkbox"
                           ${item.is_checked ? 'checked' : ''}
                           onchange="toggleTSChecked(${item.id}, this.checked)"
                           title="${item.is_checked ? 'Đang hiện' : 'Đang ẩn'}">
                </td>
                <td style="text-align: center;">
                    <input type="checkbox" class="ts-checkbox ts-verify-checkbox"
                           ${item.is_verified ? 'checked' : ''}
                           ${!item.is_checked ? 'disabled' : ''}
                           onchange="toggleTSVerified(${item.id}, this.checked)"
                           title="${item.is_verified ? 'Đã kiểm tra' : 'Chưa kiểm tra'}">
                </td>
                <td style="text-align: center;">
                    <button class="btn-edit-ts" onclick="openEditTSModal(${item.id})" title="Chỉnh sửa">
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

    const totalEl = document.getElementById('tsTotalCount');
    const uncheckedEl = document.getElementById('tsUncheckedCount');
    const checkedEl = document.getElementById('tsCheckedCount');

    if (totalEl) totalEl.textContent = total;
    if (uncheckedEl) uncheckedEl.textContent = unchecked;
    if (checkedEl) checkedEl.textContent = checked;
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
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Không thể bỏ "Ẩn/Hiện" khi đã "Kiểm Tra". Hãy bỏ check "Đã Kiểm Tra" trước.', 'warning');
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
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(
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

            // Show notification
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(
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
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Không có giao dịch nào cần đánh dấu', 'info');
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

            if (window.NotificationManager) {
                window.NotificationManager.showNotification(
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

            if (window.NotificationManager) {
                window.NotificationManager.showNotification('Đã chuyển vào Thống Kê', 'success');
            }
        } else {
            if (result.error === 'Already exists') {
                if (window.NotificationManager) {
                    window.NotificationManager.showNotification('Giao dịch đã có trong Thống Kê', 'info');
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
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Đang đồng bộ...', 'info');
        }

        const response = await fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
            if (window.NotificationManager) {
                window.NotificationManager.showNotification(
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
            if (window.NotificationManager) {
                window.NotificationManager.showNotification('Lỗi đồng bộ', 'error');
            }
        }
    } catch (error) {
        console.error('[TS] Sync error:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Lỗi kết nối', 'error');
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

function openEditTSModal(id) {
    const item = tsData.find(d => d.id === id);
    if (!item) return;

    document.getElementById('editTSId').value = id;
    document.getElementById('editTSCustomerName').value = item.customer_name || '';
    document.getElementById('editTSCustomerPhone').value = item.customer_phone || '';
    document.getElementById('editTSNotes').value = item.notes || '';

    document.getElementById('editTSModal').classList.add('active');
    lucide.createIcons();
}

function closeEditTSModal() {
    document.getElementById('editTSModal').classList.remove('active');
}

async function saveTSEdit(e) {
    e.preventDefault();

    const id = document.getElementById('editTSId').value;
    const customer_name = document.getElementById('editTSCustomerName').value.trim();
    const customer_phone = document.getElementById('editTSCustomerPhone').value.trim();
    const notes = document.getElementById('editTSNotes').value.trim();

    try {
        const response = await fetch(`${TS_API_BASE_URL}/api/sepay/transfer-stats/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_name, customer_phone, notes })
        });

        const result = await response.json();

        if (result.success) {
            // Update local data
            const item = tsData.find(d => d.id === parseInt(id));
            if (item) {
                item.customer_name = customer_name || null;
                item.customer_phone = customer_phone || null;
                item.notes = notes || null;
            }

            // Re-render
            filterTransferStats();
            closeEditTSModal();

            if (window.NotificationManager) {
                window.NotificationManager.showNotification('Đã cập nhật thông tin', 'success');
            }
        } else {
            console.error('[TS] Error saving edit:', result.error);
            if (window.NotificationManager) {
                window.NotificationManager.showNotification('Lỗi cập nhật: ' + result.error, 'error');
            }
        }
    } catch (error) {
        console.error('[TS] Error:', error);
        if (window.NotificationManager) {
            window.NotificationManager.showNotification('Lỗi kết nối', 'error');
        }
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
