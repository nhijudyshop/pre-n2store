// Customer Management System - PostgreSQL Backend
// This version uses PostgreSQL API instead of Firebase Firestore

let customers = [];
let filteredCustomers = [];

// Pagination state
let currentPage = 1;
let pageSize = 100;
let totalCustomers = 0;
let isSearching = false;
let currentSearchTerm = '';
let searchDebounceTimer = null;
let isDuplicateFilter = false;

// TPOS API Configuration - using Cloudflare Worker proxy
const CLOUDFLARE_PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const TPOS_API_URL = `${CLOUDFLARE_PROXY}/api/odata/Partner/ODataService.GetViewV2`;
let isSyncing = false;
let tposAccessToken = null;

// ============================================
// INDEXEDDB CACHE LAYER (Kept for offline support)
// ============================================
const DB_NAME = 'CustomerDB';
const DB_VERSION = 1;
const STORE_NAME = 'customers';
const CACHE_KEY = 'customers_cache';
const STATS_CACHE_KEY = 'stats_cache';
let indexedDB_instance = null;

// Initialize IndexedDB
async function initIndexedDB() {
    if (indexedDB_instance) return indexedDB_instance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            indexedDB_instance = request.result;
            console.log('✅ IndexedDB initialized');
            resolve(indexedDB_instance);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                console.log('📦 IndexedDB store created');
            }
        };
    });
}

// Save to cache
async function saveToCache(key, data) {
    try {
        const db = await initIndexedDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const cacheData = {
            key: key,
            data: data,
            timestamp: Date.now()
        };

        await store.put(cacheData);
        console.log(`💾 Cached: ${key}`);
    } catch (error) {
        console.error('Error saving to cache:', error);
    }
}

// Load from cache
async function loadFromCache(key, maxAge = 5 * 60 * 1000) {
    try {
        const db = await initIndexedDB();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        return new Promise((resolve, reject) => {
            const request = store.get(key);

            request.onsuccess = () => {
                const cached = request.result;

                if (!cached) {
                    console.log(`⚠️ Cache miss: ${key}`);
                    resolve(null);
                    return;
                }

                const age = Date.now() - cached.timestamp;

                if (age > maxAge) {
                    console.log(`⏰ Cache expired: ${key}`);
                    resolve(null);
                    return;
                }

                console.log(`✅ Cache hit: ${key}`);
                resolve(cached.data);
            };

            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error loading from cache:', error);
        return null;
    }
}

// Clear cache
async function clearCache(key = null) {
    try {
        const db = await initIndexedDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        if (key) {
            await store.delete(key);
            console.log(`🗑️ Cleared cache: ${key}`);
        } else {
            await store.clear();
            console.log('🗑️ Cleared all cache');
        }
    } catch (error) {
        console.error('Error clearing cache:', error);
    }
}

// Check authentication - ALL users check detailedPermissions
if (typeof authManager !== 'undefined') {
    if (!authManager.requireAuth()) {
        throw new Error('Authentication required');
    }
    // Check detailedPermissions for customer-management page - NO admin bypass
    const auth = authManager.getAuthData ? authManager.getAuthData() : authManager.getAuthState();
    const hasAccess = auth?.detailedPermissions?.['customer-management'] &&
        Object.values(auth.detailedPermissions['customer-management']).some(v => v === true);
    if (!hasAccess) {
        alert('Bạn không có quyền truy cập trang này. Cần quyền customer-management trong detailedPermissions.');
        window.location.href = '../index.html';
        throw new Error('customer-management permission required');
    }
}

// Initialize Firebase (keep for auth only)
if (!firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    await loadCustomers();
    initializeEventListeners();
    lucide.createIcons();

    // Load statistics in background
    loadTotalCountAndStats();

    // Auto-sync from TPOS if needed
    autoSyncFromTPOS();
});

// Initialize event listeners
function initializeEventListeners() {
    document.getElementById('importExcelBtn').addEventListener('click', openImportModal);
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
    document.getElementById('syncTPOSBtn').addEventListener('click', syncFromTPOS);
    document.getElementById('selectAll').addEventListener('click', handleSelectAll);
    document.getElementById('prevPageBtn').addEventListener('click', goToPreviousPage);
    document.getElementById('nextPageBtn').addEventListener('click', goToNextPage);
    document.getElementById('pageSizeSelect').addEventListener('change', handlePageSizeChange);
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.getElementById('statusFilter').addEventListener('change', handleFilter);
    document.getElementById('duplicateFilter').addEventListener('change', handleDuplicateFilter);
    document.getElementById('excelFile').addEventListener('change', handleFileSelect);
    document.getElementById('confirmImportBtn').addEventListener('click', handleImportConfirm);

    const uploadArea = document.getElementById('uploadArea');
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
}

// ============================================
// POSTGRESQL API CALLS (Replacing Firebase)
// ============================================

/**
 * Load total customer count and statistics
 */
async function loadTotalCountAndStats(forceRefresh = false) {
    try {
        // Try cache first
        if (!forceRefresh) {
            const cached = await loadFromCache(STATS_CACHE_KEY, 10 * 60 * 1000);

            if (cached) {
                console.log('⚡ Loading stats from cache');
                totalCustomers = cached.total;
                updateStatsUI(cached);
                updatePaginationUI();

                // Refresh in background
                loadStatsFromAPI();
                return;
            }
        }

        // Cache miss - show loading
        document.getElementById('totalCount').textContent = '...';
        document.getElementById('normalCount').textContent = '...';
        document.getElementById('dangerCount').textContent = '...';
        document.getElementById('warningCount').textContent = '...';
        document.getElementById('criticalCount').textContent = '...';
        document.getElementById('vipCount').textContent = '...';

        await loadStatsFromAPI();
    } catch (error) {
        console.error('Error loading statistics:', error);
        document.getElementById('totalCount').textContent = '?';
        showNotification('Lỗi khi tải thống kê', 'error');
    }
}

/**
 * Load stats from PostgreSQL API
 */
async function loadStatsFromAPI() {
    try {
        const response = await API.getStats();

        if (!response.success) {
            throw new Error(response.message || 'Failed to load stats');
        }

        const stats = response.data;
        totalCustomers = stats.total;

        // Save to cache
        await saveToCache(STATS_CACHE_KEY, stats);

        // Update UI
        updateStatsUI(stats);
        updatePaginationUI();

        console.log(`[STATS] Loaded in ${response.query_time_ms}ms`);
    } catch (error) {
        console.error('Error loading stats from API:', error);
        throw error;
    }
}

/**
 * Update statistics UI
 */
function updateStatsUI(stats) {
    document.getElementById('totalCount').textContent = formatNumber(stats.total);
    document.getElementById('normalCount').textContent = formatNumber(stats.normal);
    document.getElementById('dangerCount').textContent = formatNumber(stats.danger);
    document.getElementById('warningCount').textContent = formatNumber(stats.warning);
    document.getElementById('criticalCount').textContent = formatNumber(stats.critical);
    document.getElementById('vipCount').textContent = formatNumber(stats.vip);
}

/**
 * Load customers from PostgreSQL API with pagination
 */
async function loadCustomers(forceRefresh = false) {
    try {
        // Try cache first (only for initial load)
        if (!isSearching && currentPage === 1 && !forceRefresh) {
            const cacheKey = `${CACHE_KEY}_page${currentPage}_size${pageSize}`;
            const cached = await loadFromCache(cacheKey, 5 * 60 * 1000);

            if (cached) {
                console.log('⚡ Loading from cache (instant)');
                customers = cached.customers || [];
                filteredCustomers = [...customers];
                renderCustomers();
                updatePaginationUI();
                showEmptyState(customers.length === 0);

                // Refresh in background
                loadCustomersFromAPI();
                return;
            }
        }

        // Cache miss or force refresh - show loading
        showLoading(true);
        await loadCustomersFromAPI();
    } catch (error) {
        console.error('Error loading customers:', error);
        showNotification('Lỗi khi tải dữ liệu khách hàng', 'error');
        showLoading(false);
    }
}

/**
 * Load customers from PostgreSQL API (internal)
 */
async function loadCustomersFromAPI() {
    try {
        const statusFilter = document.getElementById('statusFilter').value;

        const response = await API.getCustomers(
            currentPage,
            pageSize,
            statusFilter || null
        );

        if (!response.success) {
            throw new Error(response.message || 'Failed to load customers');
        }

        customers = response.data || [];
        filteredCustomers = [...customers];

        // Update pagination info from server
        if (response.pagination) {
            totalCustomers = response.pagination.total;
        }

        // Cache the data
        const cacheKey = `${CACHE_KEY}_page${currentPage}_size${pageSize}`;
        await saveToCache(cacheKey, { customers });

        renderCustomers();
        updatePaginationUI();
        showEmptyState(customers.length === 0);

        console.log(`[CUSTOMERS] Loaded ${customers.length} customers (page ${currentPage})`);
    } catch (error) {
        console.error('Error loading from API:', error);
        throw error;
    } finally {
        showLoading(false);
    }
}

// Update pagination UI
function updatePaginationUI() {
    const totalPages = Math.ceil(totalCustomers / pageSize);
    document.getElementById('pageInfo').textContent = `Trang ${currentPage} / ${totalPages} (${totalCustomers} khách hàng)`;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
}

// Go to previous page
async function goToPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        if (isDuplicateFilter) {
            await loadDuplicateCustomers();
        } else {
            await loadCustomers();
        }
    }
}

// Go to next page
async function goToNextPage() {
    const totalPages = Math.ceil(totalCustomers / pageSize);
    if (currentPage < totalPages) {
        currentPage++;
        if (isDuplicateFilter) {
            await loadDuplicateCustomers();
        } else {
            await loadCustomers();
        }
    }
}

// Handle page size change
async function handlePageSizeChange(e) {
    pageSize = parseInt(e.target.value);
    currentPage = 1;
    if (isDuplicateFilter) {
        await loadDuplicateCustomers();
    } else {
        await loadCustomers();
    }
}

// Merge customers with the same phone number
function mergeCustomersByPhone(customers) {
    const phoneMap = new Map();

    customers.forEach(customer => {
        const phone = (customer.phone || '').trim();
        if (!phone) {
            // Customers without phone are kept as-is
            const uniqueKey = `no_phone_${customer.id}`;
            phoneMap.set(uniqueKey, {
                ...customer,
                mergedNames: [customer.name || ''],
                mergedAddresses: [customer.address || ''],
                mergedIds: [customer.id]
            });
            return;
        }

        if (phoneMap.has(phone)) {
            // Merge with existing customer
            const existing = phoneMap.get(phone);
            const newName = (customer.name || '').trim();
            const newAddress = (customer.address || '').trim();

            // Add unique names
            if (newName && !existing.mergedNames.includes(newName)) {
                existing.mergedNames.push(newName);
            }

            // Add unique addresses
            if (newAddress && !existing.mergedAddresses.includes(newAddress)) {
                existing.mergedAddresses.push(newAddress);
            }

            // Merge IDs for reference
            existing.mergedIds.push(customer.id);

            // Keep the higher debt (display the max debt from merged customers)
            if ((customer.debt || 0) > (existing.debt || 0)) {
                existing.debt = customer.debt;
            }

            // Keep VIP or worse status
            existing.status = getMergedStatus(existing.status, customer.status);
        } else {
            // First occurrence
            phoneMap.set(phone, {
                ...customer,
                mergedNames: [customer.name || ''],
                mergedAddresses: [customer.address || ''],
                mergedIds: [customer.id]
            });
        }
    });

    return Array.from(phoneMap.values());
}

// Get merged status (prioritize VIP > Nguy hiểm > Cảnh báo > Bom hàng > Bình thường)
function getMergedStatus(status1, status2) {
    const statusPriority = {
        'VIP': 5,
        'Nguy hiểm': 4,
        'Cảnh báo': 3,
        'Bom hàng': 2,
        'Bình thường': 1
    };

    const priority1 = statusPriority[status1] || 1;
    const priority2 = statusPriority[status2] || 1;

    return priority1 >= priority2 ? status1 : status2;
}

// Render customers in table
function renderCustomers() {
    const tbody = document.getElementById('customerTableBody');
    tbody.innerHTML = '';

    if (filteredCustomers.length === 0) {
        showEmptyState(true);
        return;
    }

    showEmptyState(false);

    // Display each customer separately (no phone merging)
    // const mergedCustomers = mergeCustomersByPhone(filteredCustomers);

    filteredCustomers.forEach(customer => {
        const row = createCustomerRow(customer);
        tbody.appendChild(row);
    });

    lucide.createIcons();
}

// Create customer table row
function createCustomerRow(customer) {
    const tr = document.createElement('tr');

    // Handle merged names display (Tên 1 | Tên 2 | Tên 3...)
    const mergedNames = customer.mergedNames || [customer.name || ''];
    const displayName = mergedNames.filter(n => n.trim()).join(' | ');

    // Handle merged addresses display (each on separate line)
    const mergedAddresses = customer.mergedAddresses || [customer.address || ''];
    const displayAddress = mergedAddresses
        .filter(a => a.trim())
        .map(a => escapeHtml(a))
        .join('<br>');

    // Check if this is a merged customer (has multiple entries)
    const isMerged = (customer.mergedIds && customer.mergedIds.length > 1);
    const mergedBadge = isMerged ? `<span class="merged-badge" title="${customer.mergedIds.length} khách hàng trùng SĐT" style="background: #f59e0b; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${customer.mergedIds.length} trùng</span>` : '';

    // Badge for duplicate phone count (from duplicates API)
    const duplicateBadge = customer.duplicate_count && customer.duplicate_count > 1
        ? `<span class="duplicate-badge" title="${customer.duplicate_count} khách hàng có cùng SĐT" style="background: #dc2626; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${customer.duplicate_count} trùng SĐT</span>`
        : '';

    tr.innerHTML = `
        <td>
            <input type="checkbox" class="customer-checkbox" data-id="${customer.id}">
        </td>
        <td>
            <div class="customer-name">
                <span class="name">${escapeHtml(displayName)}</span>
                ${mergedBadge}
                ${duplicateBadge}
                <span class="status-badge ${getStatusClass(customer.status)}">${customer.status || 'Bình thường'}</span>
            </div>
        </td>
        <td>
            <div class="customer-phone">
                ${customer.phone ? `
                    <a href="javascript:void(0)" onclick="openTransactionHistory('${customer.id}', '${escapeHtml(customer.phone || '')}', '${escapeHtml(displayName)}')" class="phone-link" title="Xem lịch sử giao dịch" style="color: #3b82f6; text-decoration: none; cursor: pointer;">
                        <span class="phone">${escapeHtml(customer.phone)}</span>
                        <i data-lucide="receipt" style="width: 12px; height: 12px; vertical-align: middle; margin-left: 4px;"></i>
                    </a>
                ` : '<span class="phone" style="color: #999;">N/A</span>'}
                ${customer.carrier ? `<span class="carrier">${customer.carrier}</span>` : ''}
            </div>
        </td>
        <td style="text-align: center;">
            ${customer.tpos_id ? `<code style="background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${customer.tpos_id}</code>` : '<span style="color: #999;">-</span>'}
        </td>
        <td>${escapeHtml(customer.email || '')}</td>
        <td style="white-space: pre-line; line-height: 1.4;">${displayAddress}</td>
        <td>
            ${customer.phone ? `<a href="https://zalo.me/${customer.phone}" target="_blank" class="zalo-link" title="Chat Zalo">
                <i data-lucide="message-circle"></i>
            </a>` : ''}
        </td>
        <td>
            <div class="debt-amount ${customer.debt > 0 ? 'negative' : 'positive'}">
                ${formatNumber(customer.debt || 0)}
            </div>
        </td>
        <td>
            ${customer.active !== false ? '<div class="active-badge"><i data-lucide="check"></i></div>' : ''}
        </td>
        <td>
            <div class="action-buttons">
                <button class="icon-btn view" onclick="openTransactionHistory('${customer.id}', '${escapeHtml(customer.phone || '')}', '${escapeHtml(displayName)}')" title="Lịch sử giao dịch">
                    <i data-lucide="receipt"></i>
                </button>
                <button class="icon-btn delete" onclick="deleteCustomer(${customer.id})" title="Xóa">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </td>
    `;
    return tr;
}

// Get status CSS class
function getStatusClass(status) {
    const statusMap = {
        'Bình thường': 'normal',
        'Bom hàng': 'danger',
        'Cảnh báo': 'warning',
        'Nguy hiểm': 'critical',
        'VIP': 'vip'
    };
    return statusMap[status] || 'normal';
}

// Update statistics
function updateStatistics() {
    loadTotalCountAndStats().catch(err => {
        console.error('Failed to update statistics:', err);
    });
}

/**
 * Search handler - PostgreSQL API search
 */
function handleSearch(e) {
    const searchTerm = e.target.value.trim();

    // Clear previous debounce timer
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }

    // Turn off duplicate filter when searching
    if (searchTerm !== '' && isDuplicateFilter) {
        isDuplicateFilter = false;
        document.getElementById('duplicateFilter').checked = false;
    }

    // Show instant feedback
    if (searchTerm !== '') {
        const searchInput = document.getElementById('searchInput');
        searchInput.style.borderColor = '#3b82f6';
    }

    // Debounce search
    searchDebounceTimer = setTimeout(async () => {
        currentSearchTerm = searchTerm;

        if (searchTerm === '') {
            // No search term - reset to normal pagination mode
            isSearching = false;
            currentPage = 1;
            await loadCustomers();
        } else {
            // Has search term - switch to search mode
            isSearching = true;
            currentPage = 1;
            await searchCustomers(searchTerm);
        }

        // Reset border color
        const searchInput = document.getElementById('searchInput');
        searchInput.style.borderColor = '';
    }, 200);
}

/**
 * Search customers using PostgreSQL API
 */
async function searchCustomers(searchTerm) {
    try {
        showLoading(true);

        const statusFilter = document.getElementById('statusFilter').value;

        const startTime = Date.now();
        const response = await API.searchCustomers(
            searchTerm,
            100,
            statusFilter || null
        );
        const duration = Date.now() - startTime;

        if (!response.success) {
            throw new Error(response.message || 'Search failed');
        }

        customers = response.data || [];
        filteredCustomers = [...customers];

        renderCustomers();
        updatePaginationUI();
        showEmptyState(customers.length === 0);
        showLoading(false);

        console.log(`[SEARCH] ✅ Found ${customers.length} customers in ${duration}ms`);

    } catch (error) {
        console.error('[SEARCH] Error:', error);
        showNotification('Lỗi khi tìm kiếm khách hàng', 'error');
        showLoading(false);
    }
}

// Filter handler
function handleFilter() {
    if (isDuplicateFilter) {
        // Turn off duplicate filter when changing status filter
        isDuplicateFilter = false;
        document.getElementById('duplicateFilter').checked = false;
    }

    if (isSearching && currentSearchTerm) {
        // Re-search with new filter
        searchCustomers(currentSearchTerm);
    } else {
        // Reload with new filter
        currentPage = 1;
        loadCustomers();
    }
}

/**
 * Handle duplicate phone filter toggle
 */
async function handleDuplicateFilter() {
    const checkbox = document.getElementById('duplicateFilter');
    isDuplicateFilter = checkbox.checked;

    // Reset search when toggling duplicate filter
    if (isDuplicateFilter) {
        document.getElementById('searchInput').value = '';
        document.getElementById('statusFilter').value = '';
        isSearching = false;
        currentSearchTerm = '';
    }

    currentPage = 1;

    if (isDuplicateFilter) {
        await loadDuplicateCustomers();
    } else {
        await loadCustomers();
    }
}

/**
 * Load customers with duplicate phone numbers
 */
async function loadDuplicateCustomers() {
    showLoading(true);
    showEmptyState(false);

    try {
        console.log(`[DUPLICATES] Loading page ${currentPage}, limit ${pageSize}`);

        const response = await API.getDuplicateCustomers(currentPage, pageSize);

        if (!response.success) {
            throw new Error(response.message || 'Failed to load duplicate customers');
        }

        customers = response.data || [];
        filteredCustomers = [...customers];

        // Update pagination info from server
        if (response.pagination) {
            totalCustomers = response.pagination.total;

            // Update duplicate count badge
            const countEl = document.getElementById('duplicateCount');
            if (countEl && response.pagination.duplicate_phones_count !== undefined) {
                countEl.textContent = response.pagination.duplicate_phones_count;
                countEl.style.display = response.pagination.duplicate_phones_count > 0 ? 'inline' : 'none';
            }
        }

        renderCustomers();
        updatePaginationUI();
        showLoading(false);

        if (customers.length === 0) {
            showEmptyState(true);
            showNotification('Không có khách hàng nào trùng số điện thoại', 'info');
        } else {
            console.log(`[DUPLICATES] ✅ Found ${customers.length} customers with duplicate phones`);
        }

    } catch (error) {
        console.error('[DUPLICATES] Error:', error);
        showNotification('Lỗi khi tải danh sách khách hàng trùng SĐT', 'error');
        showLoading(false);
        showEmptyState(true);
    }
}

// Delete customer
async function deleteCustomer(customerId) {
    const customer = customers.find(c => c.id === customerId);

    if (!confirm(`Bạn có chắc chắn muốn xóa khách hàng "${customer.name}"?`)) {
        return;
    }

    try {
        const response = await API.deleteCustomer(customerId, false); // Soft delete

        if (!response.success) {
            throw new Error(response.message || 'Delete failed');
        }

        showNotification('Xóa khách hàng thành công', 'success');

        // Clear cache
        await clearCache(CACHE_KEY);
        await clearCache(STATS_CACHE_KEY);

        updateStatistics();
        await loadCustomers(true);
    } catch (error) {
        console.error('Error deleting customer:', error);
        showNotification(error.message || 'Lỗi khi xóa khách hàng', 'error');
    }
}

// Handle select all
function handleSelectAll(e) {
    const checkboxes = document.querySelectorAll('.customer-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
}

// Open import modal
function openImportModal() {
    document.getElementById('importModal').classList.add('active');
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('excelFile').value = '';
}

// Close import modal
function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
}

// Handle file select
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processExcelFile(file);
    }
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
}

// Handle drag leave
function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
}

// Handle drop
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        processExcelFile(file);
    } else {
        showNotification('Vui lòng chọn file Excel (.xlsx hoặc .xls)', 'error');
    }
}

// Process Excel file
let importData = [];

function processExcelFile(file) {
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            // Map Excel columns to customer fields
            // NOTE: debt is NOT imported from Excel - new customers get debt=0, existing customers keep their debt
            importData = jsonData.map(row => ({
                name: row['Tên'] || row['Ten'] || '',
                phone: String(row['Điện thoại'] || row['Dien thoai'] || '').trim(),
                email: row['Email'] || '',
                address: row['Địa chỉ'] || row['Dia chi'] || '',
                status: row['Trạng thái'] || row['Trang thai'] || 'Bình thường',
                carrier: detectCarrier(String(row['Điện thoại'] || row['Dien thoai'] || '')),
                // debt: Not imported - backend handles this (0 for new, preserve for existing)
                active: true
            })).filter(customer => customer.name && customer.phone);

            if (importData.length === 0) {
                showNotification('Không tìm thấy dữ liệu hợp lệ trong file Excel', 'error');
                return;
            }

            displayPreview();
        } catch (error) {
            console.error('Error processing Excel file:', error);
            showNotification('Lỗi khi đọc file Excel', 'error');
        }
    };

    reader.readAsArrayBuffer(file);
}

// Detect carrier from phone number
function detectCarrier(phone) {
    const phoneClean = phone.replace(/\D/g, '');

    if (/^(086|096|097|098|032|033|034|035|036|037|038|039)/.test(phoneClean)) {
        return 'Viettel';
    }
    if (/^(088|091|094|083|084|085|081|082)/.test(phoneClean)) {
        return 'Vinaphone';
    }
    if (/^(089|090|093|070|079|077|076|078)/.test(phoneClean)) {
        return 'Mobifone';
    }
    if (/^(092|056|058)/.test(phoneClean)) {
        return 'Vietnamobile';
    }
    if (/^(099|059)/.test(phoneClean)) {
        return 'Gmobile';
    }

    return '';
}

// Display preview of import data
function displayPreview() {
    const previewBody = document.getElementById('previewTableBody');
    previewBody.innerHTML = '';

    importData.slice(0, 100).forEach(customer => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(customer.name)}</td>
            <td>${escapeHtml(customer.phone)}</td>
            <td>${escapeHtml(customer.email)}</td>
            <td>${escapeHtml(customer.address)}</td>
            <td><span class="status-badge ${getStatusClass(customer.status)}">${customer.status}</span></td>
        `;
        previewBody.appendChild(tr);
    });

    document.getElementById('previewCount').textContent = importData.length;
    document.getElementById('previewSection').style.display = 'block';

    lucide.createIcons();
}

// Handle import confirm - chunked import for large datasets with retry
async function handleImportConfirm() {
    if (importData.length === 0) {
        showNotification('Không có dữ liệu để import', 'error');
        return;
    }

    const confirmBtn = document.getElementById('confirmImportBtn');
    confirmBtn.disabled = true;

    // Configuration
    const CHUNK_SIZE = 100;
    const MAX_RETRIES = 3;
    const DIRECT_API_URL = 'https://n2store-fallback.onrender.com';
    const totalChunks = Math.ceil(importData.length / CHUNK_SIZE);

    let totalSuccess = 0;
    let totalSkipped = 0;
    let failedChunks = [];

    console.log(`[IMPORT] Starting chunked import: ${importData.length} customers in ${totalChunks} chunks (with ${MAX_RETRIES} retries)`);

    // Helper function to import a single chunk with retry
    async function importChunkWithRetry(chunk, chunkIndex, retryCount = 0) {
        try {
            const response = await fetch(`${DIRECT_API_URL}/api/customers/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customers: chunk })
            });

            const result = await response.json();

            if (result.success && result.data) {
                return { success: true, data: result.data };
            } else {
                throw new Error(result.message || 'Import failed');
            }
        } catch (error) {
            if (retryCount < MAX_RETRIES) {
                // Exponential backoff: 200ms, 400ms, 800ms
                const delay = 200 * Math.pow(2, retryCount);
                console.log(`[IMPORT] Chunk ${chunkIndex} failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return importChunkWithRetry(chunk, chunkIndex, retryCount + 1);
            }
            // All retries failed
            console.error(`[IMPORT] Chunk ${chunkIndex} failed after ${MAX_RETRIES} retries:`, error.message);
            return { success: false, error: error.message };
        }
    }

    try {
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, importData.length);
            const chunk = importData.slice(start, end);

            // Update button with progress
            const progress = Math.round(((i + 1) / totalChunks) * 100);
            confirmBtn.innerHTML = `<i data-lucide="loader" class="animate-spin"></i> Đang import... ${progress}% (${end}/${importData.length})`;

            // Log every 10 chunks
            if (i % 10 === 0 || i === totalChunks - 1) {
                console.log(`[IMPORT] Chunk ${i + 1}/${totalChunks}: ${chunk.length} customers`);
            }

            const result = await importChunkWithRetry(chunk, i + 1);

            if (result.success) {
                totalSuccess += result.data.success || 0;
                totalSkipped += result.data.skipped || 0;
            } else {
                failedChunks.push({ index: i + 1, count: chunk.length, error: result.error });
            }

            // Small delay between chunks
            if (i < totalChunks - 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        const totalFailed = failedChunks.reduce((sum, c) => sum + c.count, 0);
        console.log(`[IMPORT] Complete: Success=${totalSuccess}, Skipped=${totalSkipped}, Failed=${totalFailed}`);

        if (failedChunks.length > 0) {
            console.warn(`[IMPORT] Failed chunks:`, failedChunks);
            showNotification(`Import: ${totalSuccess} thành công, ${totalFailed} thất bại (${failedChunks.length} chunks)`, 'warning');
        } else {
            showNotification(`Import hoàn tất: ${totalSuccess}/${importData.length} khách hàng thành công`, 'success');
        }

        closeImportModal();

        // Clear cache
        await clearCache(CACHE_KEY);
        await clearCache(STATS_CACHE_KEY);

        updateStatistics();
        await loadCustomers(true);
    } catch (error) {
        console.error('Error importing customers:', error);
        showNotification(error.message || 'Lỗi khi import khách hàng', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i data-lucide="check"></i> Xác nhận Import';
        lucide.createIcons();
    }
}

// Export to Excel
function exportToExcel() {
    if (customers.length === 0) {
        showNotification('Không có dữ liệu để export', 'error');
        return;
    }

    const exportData = customers.map(customer => ({
        'Tên': customer.name || '',
        'Điện thoại': customer.phone || '',
        'Email': customer.email || '',
        'Địa chỉ': customer.address || '',
        'Nhà mạng': customer.carrier || '',
        'Trạng thái': customer.status || 'Bình thường',
        'Nợ hiện tại': customer.debt || 0,
        'Kích hoạt': customer.active !== false ? 'Có' : 'Không'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Khách hàng');

    const fileName = `khach-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    showNotification('Export Excel thành công', 'success');
}

// ============================================
// TPOS API SYNCHRONIZATION (Keep unchanged)
// ============================================

// Get TPOS access token
async function getTPOSToken() {
    try {
        if (tposAccessToken) {
            return tposAccessToken;
        }

        const response = await fetch(`${CLOUDFLARE_PROXY}/api/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=password&username=nvkt&password=Aa%40123456789&client_id=tmtWebApp'
        });

        if (!response.ok) {
            throw new Error(`Failed to get token: ${response.status}`);
        }

        const tokenData = await response.json();
        if (!tokenData.access_token) {
            throw new Error('No access_token in response');
        }

        tposAccessToken = tokenData.access_token;

        if (tokenData.expires_in) {
            setTimeout(() => {
                tposAccessToken = null;
            }, (tokenData.expires_in - 300) * 1000);
        }

        console.log('✅ TPOS token obtained');
        return tposAccessToken;
    } catch (error) {
        console.error('Error getting TPOS token:', error);
        throw error;
    }
}

// Fetch customers from TPOS API
async function fetchTPOSCustomers(skip = 0, top = 100) {
    try {
        const token = await getTPOSToken();

        const url = `${TPOS_API_URL}?Type=Customer&Active=true&$skip=${skip}&$top=${top}&$orderby=DateCreated+desc&$count=true`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            }
        });

        if (!response.ok) {
            if (response.status === 401 && tposAccessToken) {
                console.log('Token expired, refreshing...');
                tposAccessToken = null;
                const newToken = await getTPOSToken();

                const retryResponse = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${newToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json, text/javascript, */*; q=0.01'
                    }
                });

                if (!retryResponse.ok) {
                    throw new Error(`HTTP error! status: ${retryResponse.status}`);
                }

                const retryData = await retryResponse.json();
                return {
                    count: retryData['@odata.count'] || 0,
                    customers: retryData.value || []
                };
            }

            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return {
            count: data['@odata.count'] || 0,
            customers: data.value || []
        };
    } catch (error) {
        console.error('Error fetching from TPOS:', error);
        throw error;
    }
}

// Map TPOS customer to API format
function mapTPOSToAPI(tposCustomer) {
    const carrier = detectCarrier(tposCustomer.Phone || '');

    let status = 'Bình thường';
    if (tposCustomer.Status) {
        const statusLower = tposCustomer.Status.toLowerCase();
        if (statusLower.includes('bom') || statusLower.includes('danger')) {
            status = 'Bom hàng';
        } else if (statusLower.includes('cảnh báo') || statusLower.includes('warning')) {
            status = 'Cảnh báo';
        } else if (statusLower.includes('nguy hiểm') || statusLower.includes('critical')) {
            status = 'Nguy hiểm';
        } else if (statusLower.includes('vip')) {
            status = 'VIP';
        }
    }

    // NOTE: debt is NOT synced from TPOS - new customers get debt=0, existing customers keep their debt
    return {
        tpos_id: tposCustomer.Id,
        name: tposCustomer.Name || '',
        phone: (tposCustomer.Phone || '').trim(),
        email: tposCustomer.Email || '',
        address: tposCustomer.Street || '',
        carrier: carrier,
        status: status,
        // debt: Not synced from TPOS - backend handles this (0 for new, preserve for existing)
        active: tposCustomer.IsActive !== false,
        tpos_data: {
            code: tposCustomer.Code,
            createdDate: tposCustomer.CreatedDate,
            modifiedDate: tposCustomer.ModifiedDate
        }
    };
}

// Check if customer exists by phone
async function customerExists(phone) {
    try {
        if (!phone) return false;

        const response = await API.searchCustomers(phone, 1);
        return response.success && response.count > 0;
    } catch (error) {
        console.error('Error checking customer existence:', error);
        return false;
    }
}

// Sync customers from TPOS
async function syncFromTPOS() {
    if (isSyncing) {
        showNotification('Đang đồng bộ, vui lòng đợi...', 'warning');
        return;
    }

    isSyncing = true;
    const syncBtn = document.getElementById('syncTPOSBtn');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Đang đồng bộ...';
        lucide.createIcons();
    }

    try {
        showNotification('Bắt đầu đồng bộ từ TPOS...', 'info');

        const result = await fetchTPOSCustomers(0, 100);

        if (!result.customers || result.customers.length === 0) {
            showNotification('Không có dữ liệu từ TPOS', 'warning');
            return;
        }

        console.log(`Fetched ${result.customers.length} customers from TPOS`);

        const newCustomers = [];

        for (const tposCustomer of result.customers) {
            if (!tposCustomer.Phone || !tposCustomer.Phone.trim()) {
                continue;
            }

            const exists = await customerExists(tposCustomer.Phone);

            if (exists) {
                console.log(`Duplicate found, stopping sync: ${tposCustomer.Name} (${tposCustomer.Phone})`);
                break;
            }

            newCustomers.push(mapTPOSToAPI(tposCustomer));
        }

        if (newCustomers.length === 0) {
            showNotification('Không có khách hàng mới để đồng bộ', 'info');
            return;
        }

        // Batch create using API
        const response = await API.batchCreateCustomers(newCustomers);

        if (!response.success) {
            throw new Error(response.message || 'Sync failed');
        }

        localStorage.setItem('lastTPOSSync', new Date().toISOString());

        showNotification(`Đồng bộ thành công ${response.data.success} khách hàng mới từ TPOS`, 'success');

        // Clear cache and reload
        await clearCache(CACHE_KEY);
        await clearCache(STATS_CACHE_KEY);

        updateStatistics();
        currentPage = 1;
        await loadCustomers(true);

    } catch (error) {
        console.error('Error syncing from TPOS:', error);
        showNotification('Lỗi khi đồng bộ từ TPOS: ' + error.message, 'error');
    } finally {
        isSyncing = false;
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Sync từ TPOS';
            lucide.createIcons();
        }
    }
}

// Auto-sync on page load if needed
async function autoSyncFromTPOS() {
    try {
        const lastSync = localStorage.getItem('lastTPOSSync');
        const now = new Date();

        if (!lastSync) {
            console.log('No previous sync found, skipping auto-sync');
            return;
        }

        const lastSyncDate = new Date(lastSync);
        const hoursSinceSync = (now - lastSyncDate) / (1000 * 60 * 60);

        if (hoursSinceSync >= 1) {
            console.log(`Auto-syncing from TPOS (${hoursSinceSync.toFixed(1)} hours since last sync)`);
            await syncFromTPOS();
        }
    } catch (error) {
        console.error('Error during auto-sync:', error);
    }
}

// Utility functions
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showEmptyState(show) {
    document.getElementById('emptyState').style.display = show ? 'block' : 'none';
    document.querySelector('.table-container').style.display = show ? 'none' : 'block';
}

function showNotification(message, type = 'info') {
    if (window.showFloatingNotification) {
        window.showFloatingNotification(message, type);
    } else {
        alert(message);
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat('vi-VN').format(num);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// TRANSACTION HISTORY INTEGRATION (Keep unchanged)
// =====================================================

const BALANCE_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

async function openTransactionHistory(customerId, phone, name) {
    if (!phone) {
        showNotification('Khách hàng chưa có số điện thoại', 'error');
        return;
    }

    const modal = document.getElementById('transactionHistoryModal');
    modal.classList.add('active');

    document.getElementById('txHistoryCustomerName').textContent = name || phone;

    document.getElementById('txLoadingState').style.display = 'block';
    document.getElementById('txEmptyState').style.display = 'none';
    document.getElementById('txTableContainer').style.display = 'none';

    await loadTransactionHistory(phone);

    lucide.createIcons();
}

function closeTransactionHistoryModal() {
    const modal = document.getElementById('transactionHistoryModal');
    modal.classList.remove('active');
}

async function loadTransactionHistory(phone) {
    try {
        const response = await fetch(`${BALANCE_API_URL}/api/sepay/transactions-by-phone?phone=${encodeURIComponent(phone)}&limit=100`);

        if (!response.ok) {
            throw new Error('Failed to fetch transaction history');
        }

        const result = await response.json();

        document.getElementById('txLoadingState').style.display = 'none';

        if (!result.success || result.data.length === 0) {
            document.getElementById('txEmptyState').style.display = 'block';
            return;
        }

        updateTransactionStats(result.statistics);
        renderTransactionTable(result.data);
        document.getElementById('txTableContainer').style.display = 'block';

    } catch (error) {
        console.error('[TRANSACTION-HISTORY] Error loading:', error);
        document.getElementById('txLoadingState').style.display = 'none';
        showNotification('Không thể tải lịch sử giao dịch', 'error');
        setTimeout(() => closeTransactionHistoryModal(), 2000);
    }
}

function updateTransactionStats(stats) {
    document.getElementById('txTotalIn').textContent = formatCurrency(stats.total_in);
    document.getElementById('txTotalInCount').textContent = `${stats.total_in_count} giao dịch`;

    document.getElementById('txTotalOut').textContent = formatCurrency(stats.total_out);
    document.getElementById('txTotalOutCount').textContent = `${stats.total_out_count} giao dịch`;

    document.getElementById('txNetChange').textContent = formatCurrency(stats.net_change);
    document.getElementById('txTotalCount').textContent = `${stats.total_transactions} giao dịch`;
}

function renderTransactionTable(transactions) {
    const tbody = document.getElementById('txTableBody');
    tbody.innerHTML = '';

    transactions.forEach(tx => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatTransactionDate(tx.transaction_date)}</td>
            <td><code>${tx.code || tx.reference_code || '-'}</code></td>
            <td>
                <span class="status-badge ${tx.transfer_type === 'in' ? 'normal' : 'danger'}">
                    ${tx.transfer_type === 'in' ? 'Tiền vào' : 'Tiền ra'}
                </span>
            </td>
            <td>
                <div class="debt-amount ${tx.transfer_type === 'in' ? 'positive' : 'negative'}">
                    ${formatCurrency(tx.transfer_amount)}
                </div>
            </td>
            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(tx.content || '')}">
                ${escapeHtml(tx.content || '-')}
            </td>
            <td>${escapeHtml(tx.gateway || '-')}</td>
        `;
        tbody.appendChild(tr);
    });
}

function formatTransactionDate(dateString) {
    if (!dateString) return '-';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 24) {
        if (diffHours < 1) {
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            return diffMinutes < 1 ? 'Vừa xong' : `${diffMinutes} phút trước`;
        }
        return `${diffHours} giờ trước`;
    }

    return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

// Make functions globally available
window.closeImportModal = closeImportModal;
window.deleteCustomer = deleteCustomer;
window.openTransactionHistory = openTransactionHistory;
window.closeTransactionHistoryModal = closeTransactionHistoryModal;
