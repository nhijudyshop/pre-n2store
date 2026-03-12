// =====================================================
// BALANCE HISTORY - CORE MODULE
// State management, initialization, config, data loading,
// cache, SSE realtime, helpers, notifications
// =====================================================

// Configuration
const API_BASE_URL = window.CONFIG?.API_BASE_URL || (
    window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'chatomni-proxy.nhijudyshop.workers.dev'
);

// State
let currentPage = 1;
let totalPages = 1;
let currentQuickFilter = 'last30days'; // Default quick filter
let viewMode = localStorage.getItem('balanceHistory_view_mode') || 'all'; // View mode: 'all', 'visible', 'hidden'
let verificationStatusFilter = 'all'; // Verification status filter
let allLoadedData = []; // Cache all loaded data (including hidden) for client-side filtering
let filters = {
    type: '',
    gateway: '',
    startDate: '',
    endDate: '',
    search: '',
    amount: ''
};

// DOM Elements
const loadingIndicator = document.getElementById('loadingIndicator');
const tableBody = document.getElementById('tableBody');
const pageInfo = document.getElementById('pageInfo');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const refreshBtn = document.getElementById('refreshBtn');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const detailModal = document.getElementById('detailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalBody = document.getElementById('modalBody');

// =====================================================
// UTILITY / HELPER FUNCTIONS
// =====================================================

// Remove Vietnamese diacritics for accent-insensitive search
function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// Format date for display: yyyy-mm-dd -> dd/mm/yyyy
function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// Parse dd/mm/yyyy to yyyy-mm-dd
function parseDateDisplay(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        if (year.length === 4 && !isNaN(Date.parse(`${year}-${month}-${day}`))) {
            return `${year}-${month}-${day}`;
        }
    }
    return null;
}

// Update date display inputs
function updateDateDisplayInputs(startDate, endDate) {
    const startDisplay = document.getElementById('filterStartDateDisplay');
    const endDisplay = document.getElementById('filterEndDateDisplay');
    if (startDisplay) startDisplay.value = formatDateDisplay(startDate);
    if (endDisplay) endDisplay.value = formatDateDisplay(endDate);
}

// Helper Functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount || 0);
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function truncateText(text, maxLength) {
    if (!text) return 'N/A';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function showLoading() {
    loadingIndicator.style.display = 'block';
    tableBody.style.opacity = '0.5';
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
    tableBody.style.opacity = '1';
}

function showError(message) {
    tableBody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align: center; padding: 40px; color: #e74c3c;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px;"></i>
                <p style="margin-top: 15px;">${message}</p>
            </td>
        </tr>
    `;
}

/**
 * Show notification (uses NotificationManager or fallback)
 */
function showNotification(message, type = 'info') {
    // Try different notification methods
    if (window.NotificationManager?.show) {
        window.NotificationManager.show(message, type);
    } else if (window.NotificationManager?.showNotification) {
        window.NotificationManager.showNotification(message, type);
    } else if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        // Fallback: create simple toast notification
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
            color: white;
            font-weight: 500;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInRight 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);

        console.log(`[Notification] ${type}: ${message}`);
    }
}

// =====================================================
// BALANCE HISTORY CACHE
// =====================================================

const BH_CACHE_KEY_PREFIX = 'bh_cache_';
const BH_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

function getBHCacheKey() {
    const params = new URLSearchParams({
        page: currentPage,
        ...filters
    });
    // Remove empty params
    for (let [key, value] of params.entries()) {
        if (!value) params.delete(key);
    }
    return BH_CACHE_KEY_PREFIX + params.toString();
}

function getBHCache() {
    try {
        const cacheKey = getBHCacheKey();
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;

        const parsed = JSON.parse(cached);
        // Check if cache is expired
        if (Date.now() - parsed.timestamp > BH_CACHE_EXPIRY_MS) {
            localStorage.removeItem(cacheKey);
            return null;
        }
        return parsed;
    } catch (e) {
        return null;
    }
}

function setBHCache(data, pagination) {
    try {
        const cacheKey = getBHCacheKey();
        localStorage.setItem(cacheKey, JSON.stringify({
            data,
            pagination,
            timestamp: Date.now()
        }));
    } catch (e) {
        // localStorage full or disabled, ignore
    }
}

function clearAllBHCache() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(BH_CACHE_KEY_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
        // Ignore errors
    }
}

// Check if data has changed (compare by IDs and key fields)
function hasDataChanged(oldData, newData) {
    if (!oldData || !newData) return true;
    if (oldData.length !== newData.length) return true;

    for (let i = 0; i < newData.length; i++) {
        const oldItem = oldData[i];
        const newItem = newData[i];
        if (oldItem.id !== newItem.id ||
            oldItem.is_hidden !== newItem.is_hidden ||
            oldItem.customer_name !== newItem.customer_name ||
            oldItem.customer_phone !== newItem.customer_phone) {
            return true;
        }
    }
    return false;
}

// =====================================================
// DATA LOADING
// =====================================================

// Load Data with localStorage cache
async function loadData(forceRefresh = false) {
    const cached = !forceRefresh ? getBHCache() : null;

    // If cache exists, render immediately without loading spinner
    if (cached) {
        console.log('[BH-CACHE] Using cached data');
        allLoadedData = cached.data;
        renderCurrentView();
        updatePagination(cached.pagination);
        updateHiddenCount();

        // Fetch in background to check for updates
        fetchAndUpdateIfChanged(cached.data);
        return;
    }

    // No cache - show loading and fetch
    showLoading();

    try {
        const result = await fetchFromAPI();

        if (result.success) {
            allLoadedData = result.data;
            renderCurrentView();
            updatePagination(result.pagination);
            updateHiddenCount();

            // Save to cache
            setBHCache(result.data, result.pagination);
        } else {
            showError('Khong the tai du lieu: ' + result.error);
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Loi khi tai du lieu: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Fetch from API
async function fetchFromAPI() {
    const queryParams = new URLSearchParams({
        page: currentPage,
        limit: 50,
        showHidden: 'true',
        ...filters
    });

    // Add verification status filter
    if (verificationStatusFilter && verificationStatusFilter !== 'all') {
        if (verificationStatusFilter === 'NO_PHONE') {
            queryParams.set('has_phone', 'false');
        } else {
            queryParams.set('verification_status', verificationStatusFilter);
        }
    }

    for (let [key, value] of queryParams.entries()) {
        if (!value) queryParams.delete(key);
    }

    const response = await fetch(`${API_BASE_URL}/api/sepay/history?${queryParams}`);

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

// Background fetch and update only if data changed
async function fetchAndUpdateIfChanged(cachedData) {
    try {
        const result = await fetchFromAPI();

        if (result.success && hasDataChanged(cachedData, result.data)) {
            console.log('[BH-CACHE] Data changed, updating UI');
            allLoadedData = result.data;
            renderCurrentView();
            updatePagination(result.pagination);
            updateHiddenCount();

            // Update cache
            setBHCache(result.data, result.pagination);
        } else {
            console.log('[BH-CACHE] Data unchanged');
        }
    } catch (error) {
        console.error('[BH-CACHE] Background fetch error:', error);
    }
}

// Render current view based on viewMode (no API call)
// viewMode is defined in index.html: 'all', 'visible', 'hidden', 'no-phone'
function renderCurrentView() {
    // Filter data based on viewMode
    // 'all': Show ALL transactions (default)
    // 'visible': Show only non-hidden transactions
    // 'hidden': Show only hidden transactions
    // 'no-phone': Show only transactions without phone info
    let dataToRender;

    // Use global viewMode variable (defined in index.html)
    const mode = typeof viewMode !== 'undefined' ? viewMode : 'all';

    switch (mode) {
        case 'hidden':
            dataToRender = allLoadedData.filter(item => item.is_hidden);
            break;
        case 'visible':
            dataToRender = allLoadedData.filter(item => !item.is_hidden);
            break;
        case 'no-phone':
            // Filter transactions without phone info
            dataToRender = allLoadedData.filter(item => {
                // Check if customer_phone is missing or empty
                return !item.customer_phone || item.customer_phone === '' || item.customer_phone === 'Chua co';
            });
            break;
        case 'all':
        default:
            dataToRender = allLoadedData;
            break;
    }

    // Skip gap detection when searching OR when not in 'all' mode
    // Gap detection only makes sense when viewing all transactions
    const skipGapDetection = !!filters.search || mode !== 'all';
    renderTable(dataToRender, skipGapDetection);
}

// Update hidden count and no-phone count badges
function updateHiddenCount() {
    const hiddenCount = allLoadedData.filter(item => item.is_hidden).length;
    const hiddenEl = document.getElementById('hiddenCount');
    if (hiddenEl) {
        hiddenEl.textContent = hiddenCount > 0 ? `(${hiddenCount} GD da an)` : '';
    }

    // Update no-phone count
    const noPhoneCount = allLoadedData.filter(item => {
        return !item.customer_phone || item.customer_phone === '' || item.customer_phone === 'Chua co';
    }).length;
    const noPhoneEl = document.getElementById('noPhoneCount');
    if (noPhoneEl) {
        noPhoneEl.textContent = noPhoneCount > 0 ? `(${noPhoneCount})` : '';
    }
}

// Load Statistics
async function loadStatistics() {
    try {
        const queryParams = new URLSearchParams({
            ...filters
        });

        // Remove empty params and search (stats don't use search)
        for (let [key, value] of queryParams.entries()) {
            if (!value || key === 'search') queryParams.delete(key);
        }

        const response = await fetch(`${API_BASE_URL}/api/sepay/statistics?${queryParams}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            renderStatistics(result.statistics);
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Update Pagination
function updatePagination(pagination) {
    currentPage = pagination.page;
    totalPages = pagination.totalPages;

    pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;

    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}

// Show Detail Modal
async function showDetail(id) {
    console.log('[SHOW-DETAIL] Opening detail for transaction ID:', id);
    console.log('[SHOW-DETAIL] modalBody element:', modalBody);
    console.log('[SHOW-DETAIL] detailModal element:', detailModal);

    try {
        const response = await fetch(`${API_BASE_URL}/api/sepay/history?page=1&limit=9999`);
        const result = await response.json();

        if (result.success) {
            const transaction = result.data.find(t => t.id === id);
            console.log('[SHOW-DETAIL] Found transaction:', transaction);

            if (transaction) {
                modalBody.innerHTML = `
                    <div class="detail-row">
                        <div class="detail-label">ID giao dich:</div>
                        <div class="detail-value">${transaction.sepay_id}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Ngan hang:</div>
                        <div class="detail-value">${transaction.gateway}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Ngay gio:</div>
                        <div class="detail-value">${formatDateTime(transaction.transaction_date)}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">So tai khoan:</div>
                        <div class="detail-value">${transaction.account_number}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Loai giao dich:</div>
                        <div class="detail-value">
                            <span class="badge ${transaction.transfer_type === 'in' ? 'badge-success' : 'badge-danger'}">
                                ${transaction.transfer_type === 'in' ? 'Tien vao' : 'Tien ra'}
                            </span>
                        </div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">So tien:</div>
                        <div class="detail-value ${transaction.transfer_type === 'in' ? 'amount-in' : 'amount-out'}">
                            ${transaction.transfer_type === 'in' ? '+' : '-'}${formatCurrency(transaction.transfer_amount)}
                        </div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">So du sau GD:</div>
                        <div class="detail-value">${formatCurrency(transaction.accumulated)}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Noi dung:</div>
                        <div class="detail-value">${transaction.content || 'N/A'}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Ma tham chieu:</div>
                        <div class="detail-value">${transaction.reference_code || 'N/A'}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Ma giao dich:</div>
                        <div class="detail-value">${transaction.code || 'N/A'}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Mo ta:</div>
                        <div class="detail-value">${transaction.description || 'N/A'}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Tai khoan phu:</div>
                        <div class="detail-value">${transaction.sub_account || 'N/A'}</div>
                    </div>
                `;

                detailModal.classList.add('active');
            }
        }
    } catch (error) {
        console.error('Error loading detail:', error);
        alert('Loi khi tai chi tiet giao dich');
    }
}

// =====================================================
// REALTIME UPDATES (SSE)
// =====================================================

let eventSource = null;
let reconnectTimeout = null;
let isManualClose = false;
let sseReloadDebounceTimer = null;

// Debounced reload to prevent race conditions when multiple SSE events arrive
function debouncedReloadData(delay = 300) {
    if (sseReloadDebounceTimer) {
        clearTimeout(sseReloadDebounceTimer);
    }
    sseReloadDebounceTimer = setTimeout(() => {
        console.log('[REALTIME] Debounced reload executing...');
        if (currentPage === 1) {
            loadData();
        }
        sseReloadDebounceTimer = null;
    }, delay);
}

// Connect to SSE endpoint for realtime updates
function connectRealtimeUpdates() {
    if (eventSource) return; // Already connected

    try {
        console.log('[REALTIME] Connecting to SSE endpoint...');
        eventSource = new EventSource(`${API_BASE_URL}/api/sepay/stream`);

        // Connection established
        eventSource.addEventListener('connected', (e) => {
            console.log('[REALTIME] Connected to SSE:', JSON.parse(e.data));
            showRealtimeStatus('connected');
        });

        // New transaction received
        eventSource.addEventListener('new-transaction', (e) => {
            const transaction = JSON.parse(e.data);
            console.log('[REALTIME] New transaction received:', transaction);

            handleNewTransaction(transaction);
        });

        // Customer info updated (phone match completed after transaction)
        eventSource.addEventListener('customer-info-updated', (e) => {
            const data = JSON.parse(e.data);
            console.log('[REALTIME] Customer info updated:', data);

            handleCustomerInfoUpdated(data);
        });

        // Pending match created (multiple phones found, need user selection)
        eventSource.addEventListener('pending-match-created', (e) => {
            const data = JSON.parse(e.data);
            console.log('[REALTIME] Pending match created:', data);

            handlePendingMatchCreated(data);
        });

        // Connection error
        eventSource.onerror = (error) => {
            console.error('[REALTIME] SSE Error:', error);
            showRealtimeStatus('error');

            // Close current connection
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }

            // Attempt to reconnect after 5 seconds (if not manually closed)
            if (!isManualClose) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = setTimeout(() => {
                    console.log('[REALTIME] Attempting to reconnect...');
                    connectRealtimeUpdates();
                }, 5000);
            }
        };

    } catch (error) {
        console.error('[REALTIME] Failed to connect:', error);
        showRealtimeStatus('error');
    }
}

// Disconnect from SSE
function disconnectRealtimeUpdates() {
    isManualClose = true;
    clearTimeout(reconnectTimeout);

    if (eventSource) {
        eventSource.close();
        eventSource = null;
        console.log('[REALTIME] Disconnected from SSE');
    }

    showRealtimeStatus('disconnected');
}

// Handle new transaction from SSE
async function handleNewTransaction(transaction) {
    // Show realtime notification
    showRealtimeNotification(transaction);

    // If incoming transaction ('in'), also update Transfer Stats tab
    if (transaction.transfer_type === 'in' && typeof window.addNewTransferStatRealtime === 'function') {
        window.addNewTransferStatRealtime(transaction);
    }

    // Check if transaction matches current filters
    if (!transactionMatchesFilters(transaction)) {
        console.log('[REALTIME] Transaction does not match current filters, skipping UI update');
        return;
    }

    // If on first page, insert new row at top without full reload
    if (currentPage === 1) {
        const tableBody = document.getElementById('tableBody');
        if (tableBody) {
            // Render new transaction row
            const newRowHtml = renderTransactionRow(transaction);

            // Insert at the beginning of table
            tableBody.insertAdjacentHTML('afterbegin', newRowHtml);

            // Re-initialize Lucide icons for the new row
            if (window.lucide) {
                lucide.createIcons();
            }

            console.log('[REALTIME] New transaction row added without full reload');
        }

        // Only reload statistics (doesn't affect table)
        loadStatistics();
    } else {
        // Show a notification that there's new data
        showNewDataBanner();
    }
}

// Handle customer info updated from SSE (phone match completed)
async function handleCustomerInfoUpdated(data) {
    console.log('[REALTIME] Processing customer-info-updated:', data);

    // Update CustomerInfoManager with new data if phone exists
    if (window.CustomerInfoManager && data.customer_phone) {
        const uniqueCode = `PHONE${data.customer_phone}`;
        window.CustomerInfoManager.saveCustomerInfo(uniqueCode, {
            name: data.customer_name || null,
            phone: data.customer_phone
        });
        console.log('[REALTIME] Updated CustomerInfoManager for:', uniqueCode);
    }

    // Update specific row if transaction_id is provided
    if (data.transaction_id) {
        updateTransactionRowCustomerInfo(data.transaction_id, data.customer_phone, data.customer_name);
    } else {
        // Fallback: debounced reload if no transaction_id
        console.log('[REALTIME] No transaction_id provided, using debounced reload...');
        debouncedReloadData(500);
    }
}

// Handle pending match created from SSE (multiple phones found, need user selection)
async function handlePendingMatchCreated(data) {
    console.log('[REALTIME] Processing pending-match-created:', data);

    // Update specific row if transaction_id is provided
    if (data.transaction_id) {
        updateTransactionRowPendingMatch(data.transaction_id, data);
    } else {
        // Fallback: debounced reload if no transaction_id
        console.log('[REALTIME] No transaction_id provided, using debounced reload...');
        debouncedReloadData(500);
    }
}

/**
 * Update customer info in a specific transaction row without full reload
 */
async function updateTransactionRowCustomerInfo(transactionId, customerPhone, customerName) {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) {
        console.log('[REALTIME] Table body not found, skipping row update');
        return;
    }

    // Find the row with matching transaction ID
    const targetRow = tableBody.querySelector(`tr[data-transaction-id="${transactionId}"]`);
    if (!targetRow) {
        console.log('[REALTIME] Row not found for transaction:', transactionId);
        return;
    }

    console.log('[REALTIME] Updating customer info in row:', transactionId, customerPhone, customerName);

    // Fetch full transaction data to re-render the row
    try {
        const response = await fetch(`${API_BASE_URL}/api/sepay/history?page=1&limit=1000`);
        const result = await response.json();

        if (result.success) {
            const transaction = result.data.find(t => t.id === transactionId);
            if (transaction) {
                // Re-render the row with updated data
                const newRowHtml = renderTransactionRow(transaction);
                targetRow.outerHTML = newRowHtml;

                // Re-initialize Lucide icons
                if (window.lucide) {
                    lucide.createIcons();
                }

                console.log('[REALTIME] Row updated successfully without full reload');
            }
        }
    } catch (error) {
        console.error('[REALTIME] Error updating row:', error);
        // Fallback to debounced reload
        debouncedReloadData(500);
    }
}

/**
 * Update pending match in a specific transaction row without full reload
 */
async function updateTransactionRowPendingMatch(transactionId, matchData) {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) {
        console.log('[REALTIME] Table body not found, skipping row update');
        return;
    }

    console.log('[REALTIME] Pending match created for transaction:', transactionId, matchData);

    // For pending matches, we need to fetch full transaction data and re-render
    try {
        const response = await fetch(`${API_BASE_URL}/api/sepay/history?page=1&limit=1000`);
        const result = await response.json();

        if (result.success) {
            const transaction = result.data.find(t => t.id === transactionId);
            if (transaction) {
                const targetRow = tableBody.querySelector(`tr[data-transaction-id="${transactionId}"]`);
                if (targetRow) {
                    // Re-render the row with pending match dropdown
                    const newRowHtml = renderTransactionRow(transaction);
                    targetRow.outerHTML = newRowHtml;

                    // Re-initialize Lucide icons
                    if (window.lucide) {
                        lucide.createIcons();
                    }

                    console.log('[REALTIME] Pending match row updated successfully');
                }
            }
        }
    } catch (error) {
        console.error('[REALTIME] Error updating pending match row:', error);
        // Fallback to debounced reload
        debouncedReloadData(500);
    }
}

// Check if transaction matches current filters
function transactionMatchesFilters(transaction) {
    // Type filter
    if (filters.type && transaction.transfer_type !== filters.type) {
        return false;
    }

    // Gateway filter
    if (filters.gateway && !transaction.gateway.toLowerCase().includes(filters.gateway.toLowerCase())) {
        return false;
    }

    // Date range filter
    const transactionDate = new Date(transaction.transaction_date);
    if (filters.startDate && transactionDate < new Date(filters.startDate)) {
        return false;
    }
    if (filters.endDate) {
        // Set endDate to end of day (23:59:59.999) for proper comparison
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (transactionDate > endOfDay) {
            return false;
        }
    }

    // Search filter (matches server-side search fields, accent-insensitive)
    if (filters.search) {
        const searchNorm = removeAccents(filters.search.toLowerCase());
        const content = removeAccents((transaction.content || '').toLowerCase());
        const refCode = (transaction.reference_code || '').toLowerCase();
        const code = (transaction.code || '').toLowerCase();
        const customerName = removeAccents((transaction.customer_name || '').toLowerCase());
        const customerPhone = (transaction.customer_phone || '').toLowerCase();
        const displayName = removeAccents((transaction.display_name || '').toLowerCase());

        if (!content.includes(searchNorm) &&
            !refCode.includes(searchNorm) &&
            !code.includes(searchNorm) &&
            !customerName.includes(searchNorm) &&
            !customerPhone.includes(searchNorm) &&
            !displayName.includes(searchNorm)) {
            return false;
        }
    }

    // Amount filter
    if (filters.amount) {
        const filterAmount = parseInt(filters.amount, 10);
        const transactionAmount = parseInt(transaction.transfer_amount, 10);
        if (filterAmount !== transactionAmount) {
            return false;
        }
    }

    return true;
}

// Show notification for new transaction (realtime)
function showRealtimeNotification(transaction) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'realtime-notification';
    notification.innerHTML = `
        <div class="notification-icon ${transaction.transfer_type === 'in' ? 'notification-success' : 'notification-danger'}">
            <i data-lucide="arrow-${transaction.transfer_type === 'in' ? 'down' : 'up'}"></i>
        </div>
        <div class="notification-content">
            <strong>${transaction.transfer_type === 'in' ? 'Tien vao' : 'Tien ra'}</strong>
            <p>${formatCurrency(transaction.transfer_amount)} - ${transaction.gateway}</p>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">x</button>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Initialize Lucide icons for the notification
    lucide.createIcons();

    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Show new data banner
function showNewDataBanner() {
    const existingBanner = document.querySelector('.new-data-banner');
    if (existingBanner) return; // Already showing

    const banner = document.createElement('div');
    banner.className = 'new-data-banner';
    banner.innerHTML = `
        <i data-lucide="info"></i>
        <span>Co giao dich moi. Quay ve trang 1 de xem.</span>
        <button onclick="currentPage = 1; loadData(); this.parentElement.remove();">
            Tai lai
        </button>
        <button onclick="this.parentElement.remove();">x</button>
    `;

    const container = document.querySelector('.container');
    container.insertBefore(banner, container.querySelector('.filters'));

    lucide.createIcons();
}

// Show realtime connection status
function showRealtimeStatus(status) {
    let statusElement = document.getElementById('realtimeStatus');

    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'realtimeStatus';
        statusElement.className = 'realtime-status';
        document.body.appendChild(statusElement);
    }

    const statusConfig = {
        connected: {
            icon: 'wifi',
            text: 'Realtime',
            class: 'status-connected'
        },
        error: {
            icon: 'wifi-off',
            text: 'Mat ket noi',
            class: 'status-error'
        },
        disconnected: {
            icon: 'wifi-off',
            text: 'Ngat ket noi',
            class: 'status-disconnected'
        }
    };

    const config = statusConfig[status] || statusConfig.disconnected;

    statusElement.className = `realtime-status ${config.class}`;
    statusElement.innerHTML = `
        <i data-lucide="${config.icon}"></i>
        <span>${config.text}</span>
    `;

    lucide.createIcons();
}

// =====================================================
// RAW DATA VIEWER
// =====================================================

let rawDataCache = null;

// View Raw Data Button
const viewRawDataBtn = document.getElementById('viewRawDataBtn');
const rawDataModal = document.getElementById('rawDataModal');
const closeRawDataModalBtn = document.getElementById('closeRawDataModalBtn');
const rawDataContent = document.getElementById('rawDataContent');
const rawDataCount = document.getElementById('rawDataCount');
const copyRawDataBtn = document.getElementById('copyRawDataBtn');
const downloadRawDataBtn = document.getElementById('downloadRawDataBtn');

viewRawDataBtn?.addEventListener('click', async () => {
    try {
        rawDataContent.textContent = 'Dang tai du lieu...';
        rawDataModal.classList.add('active');

        // Fetch all data (no pagination limit)
        const response = await fetch(`${API_BASE_URL}/api/sepay/history?limit=10000`);
        const result = await response.json();

        if (result.success) {
            rawDataCache = result.data;
            const jsonString = JSON.stringify(result.data, null, 2);
            rawDataContent.textContent = jsonString;
            rawDataCount.textContent = `Tong so: ${result.data.length} records`;

            // Re-initialize Lucide icons
            setTimeout(() => lucide.createIcons(), 100);
        } else {
            rawDataContent.textContent = 'Loi: ' + (result.error || 'Khong the tai du lieu');
        }
    } catch (error) {
        console.error('Error loading raw data:', error);
        rawDataContent.textContent = 'Loi khi tai du lieu: ' + error.message;
    }
});

// Copy Raw Data
copyRawDataBtn?.addEventListener('click', async () => {
    try {
        const jsonString = JSON.stringify(rawDataCache, null, 2);
        await navigator.clipboard.writeText(jsonString);

        // Visual feedback
        const originalText = copyRawDataBtn.innerHTML;
        copyRawDataBtn.innerHTML = '<i data-lucide="check"></i> Da copy!';
        setTimeout(() => {
            copyRawDataBtn.innerHTML = originalText;
            lucide.createIcons();
        }, 2000);

        lucide.createIcons();
    } catch (error) {
        showNotification('Loi khi copy: ' + error.message, 'error');
    }
});

// Download Raw Data
downloadRawDataBtn?.addEventListener('click', () => {
    try {
        const jsonString = JSON.stringify(rawDataCache, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `balance_history_raw_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Visual feedback
        const originalText = downloadRawDataBtn.innerHTML;
        downloadRawDataBtn.innerHTML = '<i data-lucide="check"></i> Da tai!';
        setTimeout(() => {
            downloadRawDataBtn.innerHTML = originalText;
            lucide.createIcons();
        }, 2000);

        lucide.createIcons();
    } catch (error) {
        alert('Loi khi tai file: ' + error.message);
    }
});

// Close Raw Data Modal
closeRawDataModalBtn?.addEventListener('click', () => {
    rawDataModal.classList.remove('active');
});

// Close modal when clicking outside
rawDataModal?.addEventListener('click', (e) => {
    if (e.target === rawDataModal) {
        rawDataModal.classList.remove('active');
    }
});

// Disconnect when page unloads
window.addEventListener('beforeunload', () => {
    disconnectRealtimeUpdates();
});
