// =====================================================
// OVERVIEW - UI: Tab Switching & UI Functions
// =====================================================

// MAIN TAB SWITCHING
// =====================================================
function switchMainTab(tabName) {
    // Update buttons
    document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.main-tab-btn[data-tab="${tabName}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.main-tab-content').forEach(content => content.classList.remove('active'));

    if (tabName === 'overview') {
        document.getElementById('tabOverview').classList.add('active');
    } else if (tabName === 'details') {
        document.getElementById('tabDetails').classList.add('active');
        renderCachedDetailsTab();
    } else if (tabName === 'analysis') {
        document.getElementById('tabAnalysis').classList.add('active');
        // Trigger discount stats calculation if data is available
        if (cachedOrderDetails.length > 0 && window.discountStatsUI) {
            window.discountStatsUI.refreshStats();
        }
    } else if (tabName === 'ledger') {
        document.getElementById('tabLedger').classList.add('active');
        // Auto-refresh ledger from cached data when switching to tab
        if (window.ledgerModule) {
            window.ledgerModule.refreshFromCachedData();
        }
    }
}

// =====================================================
// REQUEST DATA FROM TAB1
// =====================================================
function requestDataFromTab1() {
    console.log('[REPORT] Requesting data from tab1...');

    dataReceivedFromTab1 = false; // Reset flag before request
    setRefreshLoading(true);

    window.parent.postMessage({
        type: 'REQUEST_ORDERS_DATA_FROM_OVERVIEW'
    }, '*');
}

function setRefreshLoading(loading) {
    // Button removed - function kept for compatibility
}

/**
 * Refresh all data - called by "Làm mới danh sách" button
 * This requests fresh data from Tab1 AND reloads the table list from Firebase
 */
function refreshAllData() {
    console.log('[REPORT] 🔄 Refreshing all data...');

    // Reset flags to allow fresh data
    userManuallySelectedTable = false;
    justReceivedFromTab1 = false;

    // Request fresh data from Tab1
    requestDataFromTab1();

    // Also reload table list from Firebase (after a short delay to avoid race condition)
    setTimeout(() => {
        loadAvailableTables();
    }, 500);
}

// =====================================================
// BATCH FETCH ORDER DETAILS
// =====================================================
async function startBatchFetch() {
    if (isFetching) {
        alert('Đang trong quá trình tải, vui lòng đợi...');
        return;
    }

    if (!currentTableName) {
        alert('Không xác định được tên bảng.');
        return;
    }

    // ⚡ NEW: Open professional modal instead of prompt
    openDataSourceModal();
}

// ⚡ NEW: Execute Excel Fetch
async function executeExcelFetch() {
    if (isFetching) {
        alert('Đang trong quá trình tải, vui lòng đợi...');
        return;
    }

    console.log('[REPORT] 📊 User chose Excel - Fetching from Excel');

    isFetching = true;
    const btn = document.getElementById('btnBatchFetch');

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner spinning"></i> Đang tải từ Excel...';

        console.log('[REPORT] 🔄 Fetching Excel for campaign:', currentTableName);
        const allExcelOrders = await fetchAllCampaignsExcel();

        if (allExcelOrders.length === 0) {
            alert('❌ Không tìm thấy đơn hàng nào từ Excel');
            return;
        }

        console.log(`[REPORT] 📊 fetchAllCampaignsExcel returned ${allExcelOrders.length} orders`);
        const parsedOrders = parseExcelOrderData(allExcelOrders);

        // Save to sessionStorage for quick access on refresh (with quota handling)
        try {
            sessionStorage.setItem('reportOrdersExcelCache', JSON.stringify({
                orders: parsedOrders,
                timestamp: Date.now()
            }));
        } catch (storageError) {
            console.warn('[REPORT] ⚠️ Could not cache to sessionStorage (quota exceeded):', storageError.message);
            // Clear old cache and continue - this is not critical
            try { sessionStorage.removeItem('reportOrdersExcelCache'); } catch (e) { }
        }

        console.log(`[REPORT] ✅ Fetched ${parsedOrders.length} orders from Excel`);

        // Save to cachedOrderDetails
        const cacheData = {
            tableName: currentTableName,
            orders: parsedOrders,
            fetchedAt: new Date().toISOString(),
            totalOrders: parsedOrders.length,
            successCount: parsedOrders.length,
            errorCount: 0,
            _source: 'excel_manual_fetch'
        };

        // Load into local cache
        cachedOrderDetails[currentTableName] = cacheData;
        saveCachedData();

        // Save to Firebase
        try {
            const firebaseSaved = await saveToFirebase(currentTableName, cacheData);
            if (firebaseSaved) {
                console.log(`[REPORT] ✅ Excel data saved to Firebase for "${currentTableName}"`);
            }
        } catch (fbError) {
            console.warn('[REPORT] ⚠️ Failed to save Excel data to Firebase:', fbError);
        }

        // Update UI
        updateCachedCountBadge();
        renderCachedDetailsTab();

        // Update statistics
        await loadEmployeeRanges();
        renderStatistics();

        // Show success message
        alert(`✅ Đã tải dữ liệu từ Excel!\n- Số đơn hàng: ${parsedOrders.length}\n- Bảng: ${currentTableName}\n- Đã lưu vào Firebase`);

        // Switch to details tab
        switchMainTab('details');

    } catch (error) {
        console.error('[REPORT] ❌ Error fetching from Excel:', error);
        alert(`Lỗi khi tải từ Excel: ${error.message}`);
    } finally {
        isFetching = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> Lấy chi tiết đơn hàng';
        }
    }
}

// ⚡ NEW: Execute API Fetch
async function executeAPIFetch() {
    if (isFetching) {
        alert('Đang trong quá trình tải, vui lòng đợi...');
        return;
    }

    if (allOrders.length === 0) {
        alert('❌ Chưa có dữ liệu từ Tab1. Vui lòng chọn chiến dịch ở Tab1 trước.');
        return;
    }

    console.log('[REPORT] 📡 User chose API - Fetching detailed data');

    isFetching = true;
    const btn = document.getElementById('btnBatchFetch');
    const progressContainer = document.getElementById('progressContainer');

    // Helper function to reset button state
    function resetButtonState() {
        isFetching = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-download"></i> Lấy chi tiết đơn hàng';
        }
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    }

    try {
        btn.disabled = true;
        btn.classList.remove('highlight-pulse');
        btn.innerHTML = '<i class="fas fa-spinner spinning"></i> Đang tải từ API...';

        // Hide helper message during fetch
        document.getElementById('tableHelperMessage').style.display = 'none';

        // Show progress
        progressContainer.style.display = 'block';

        const fetchedOrders = [];
        const total = allOrders.length;
        let completed = 0;
        let errors = 0;

        console.log(`[REPORT] Starting API fetch for ${total} orders (table: ${currentTableName})`);

        // Process in batches of BATCH_SIZE
        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = allOrders.slice(i, i + BATCH_SIZE);

            // Fetch batch in parallel
            const promises = batch.map(async (order) => {
                try {
                    const detail = await fetchOrderData(order.orderId);
                    // Merge Tags from allOrders (Tab1) into fetched data
                    if (order.Tags) {
                        detail.Tags = order.Tags;
                    }
                    // Also preserve SessionIndex (STT)
                    if (order.stt) {
                        detail.SessionIndex = order.stt;
                    }
                    return { success: true, orderId: order.orderId, data: detail };
                } catch (error) {
                    console.error(`[REPORT] Error fetching order ${order.orderId}:`, error);
                    return { success: false, orderId: order.orderId, error: error.message };
                }
            });

            const results = await Promise.all(promises);

            // Process results
            results.forEach(result => {
                completed++;
                if (result.success) {
                    fetchedOrders.push(result.data);
                } else {
                    errors++;
                }

                // Update progress
                const percent = Math.round((completed / total) * 100);
                document.getElementById('progressBar').style.width = percent + '%';
                document.getElementById('progressText').textContent = `${completed} / ${total}`;
                document.getElementById('progressPercent').textContent = percent + '%';
            });

            // Delay before next batch (if not last batch)
            if (i + BATCH_SIZE < total) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        // Save to cache with timestamp
        const cacheData = {
            tableName: currentTableName,
            orders: fetchedOrders,
            fetchedAt: new Date().toISOString(),
            totalOrders: total,
            successCount: fetchedOrders.length,
            errorCount: errors,
            _source: 'api_manual_fetch'
        };

        cachedOrderDetails[currentTableName] = cacheData;
        saveCachedData();

        // Save to Firebase
        const firebaseSaved = await saveToFirebase(currentTableName, cacheData);

        // Request and save employee ranges from Tab1
        await requestAndSaveEmployeeRanges();

        // Reset button state
        resetButtonState();

        // Update UI
        updateCachedCountBadge();
        renderCachedDetailsTab();

        // Update statistics
        await loadEmployeeRanges();
        renderStatistics();

        // Show completion message
        const firebaseMsg = firebaseSaved ? '✅ Đã lưu Firebase' : '❌ Lỗi lưu Firebase';
        alert(`Hoàn thành!\n- Đã tải: ${fetchedOrders.length}/${total} đơn hàng\n- Lỗi: ${errors}\n- Bảng: ${currentTableName}\n- ${firebaseMsg}`);

        // Switch to details tab
        switchMainTab('details');
    } catch (error) {
        console.error('[REPORT] ❌ Error in API fetch:', error);
        resetButtonState();
        alert(`Lỗi khi tải chi tiết đơn hàng: ${error.message}`);
    }
}

// =====================================================
// FETCH ORDER DETAIL
// =====================================================
async function fetchOrderData(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;

    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
}

// =====================================================
// RENDER CACHED DETAILS TAB
// =====================================================

// Show loading state for cached details tab
function showCachedDetailsLoading() {
    const area = document.getElementById('cachedDetailsArea');
    area.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-spinner fa-spin" style="font-size: 40px; color: #667eea;"></i>
            <h3>Đang tải dữ liệu...</h3>
            <p>Vui lòng chờ trong giây lát</p>
        </div>
    `;
}

function renderCachedDetailsTab() {
    const area = document.getElementById('cachedDetailsArea');

    // Check if campaign has cached details in Firebase
    if (!currentTableName || !cachedOrderDetails[currentTableName]) {
        const campaignName = currentTableName || 'chưa chọn';
        area.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-database"></i>
                <h3>Chưa Lấy chi tiết chiến dịch "${campaignName}"</h3>
                <p>Bấm <strong>"Lấy chi tiết đơn hàng"</strong> để tải dữ liệu đầy đủ từ API và lưu vào Firebase</p>
                ${currentTableName ? `<p style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 8px; color: #856404;"><i class="fas fa-info-circle"></i> Sau khi lấy chi tiết, dữ liệu sẽ được lưu và hiển thị ở đây</p>` : ''}
            </div>
        `;
        return;
    }

    const cached = cachedOrderDetails[currentTableName];
    const orders = cached.orders || [];

    // If cache exists but empty orders (edge case)
    if (orders.length === 0) {
        area.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-database"></i>
                <h3>Chưa Lấy chi tiết chiến dịch "${currentTableName}"</h3>
                <p>Bấm <strong>"Lấy chi tiết đơn hàng"</strong> để tải dữ liệu đầy đủ từ API</p>
            </div>
        `;
        return;
    }

    // =====================================================
    // VALIDATION: Check for duplicates and missing STT
    // =====================================================
    const validation = validateOrderData(orders);

    // Filter orders by product name if filter is set
    let filteredOrders = filterOrdersByProduct(orders, currentProductFilter);

    // Sort by STT descending (high to low)
    filteredOrders.sort((a, b) => {
        const sttA = parseInt(a.order.SessionIndex) || 0;
        const sttB = parseInt(b.order.SessionIndex) || 0;
        return sttB - sttA;
    });

    const fetchedAt = new Date(cached.fetchedAt);

    // Build filter badge HTML if filter is active
    const filterBadgeHtml = currentProductFilter ? `
        <span class="product-filter-badge">
            <i class="fas fa-filter"></i> "${currentProductFilter}" (${filteredOrders.length} đơn)
            <button class="clear-btn" onclick="clearProductFilter()" title="Xóa bộ lọc">×</button>
        </span>
    ` : '';

    // Build validation warning HTML
    let validationHtml = '';
    if (validation.hasErrors) {
        validationHtml = `
            <div class="validation-errors" style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border: 2px solid #ef4444; border-radius: 12px; padding: 15px; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="fas fa-exclamation-triangle" style="color: #dc2626; font-size: 24px;"></i>
                    <strong style="color: #dc2626; font-size: 16px;">Phát hiện lỗi dữ liệu!</strong>
                </div>
                ${validation.duplicateSTT.length > 0 ? `
                    <div style="background: white; padding: 10px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #ef4444;">
                        <strong style="color: #dc2626;"><i class="fas fa-copy"></i> STT trùng (${validation.duplicateSTT.length}):</strong>
                        <span style="color: #991b1b;">${validation.duplicateSTT.slice(0, 20).join(', ')}${validation.duplicateSTT.length > 20 ? '...' : ''}</span>
                    </div>
                ` : ''}
                ${validation.duplicateCodes.length > 0 ? `
                    <div style="background: white; padding: 10px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #ef4444;">
                        <strong style="color: #dc2626;"><i class="fas fa-barcode"></i> Mã đơn trùng (${validation.duplicateCodes.length}):</strong>
                        <span style="color: #991b1b;">${validation.duplicateCodes.slice(0, 10).join(', ')}${validation.duplicateCodes.length > 10 ? '...' : ''}</span>
                    </div>
                ` : ''}
                ${validation.missingSTT.length > 0 ? `
                    <div style="background: white; padding: 10px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #f97316;">
                        <strong style="color: #c2410c;"><i class="fas fa-search-minus"></i> Thiếu STT (${validation.missingSTT.length}):</strong>
                        <span style="color: #9a3412;">${formatMissingSTT(validation.missingSTT)}</span>
                    </div>
                ` : ''}
                ${validation.extraSTT > 0 ? `
                    <div style="background: white; padding: 10px; border-radius: 8px; border-left: 4px solid #f97316;">
                        <strong style="color: #c2410c;"><i class="fas fa-search-plus"></i> Thừa đơn:</strong>
                        <span style="color: #9a3412;">Có ${validation.extraSTT} đơn thừa so với STT cao nhất (${validation.maxSTT})</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Build info section with conditional error styling
    const infoClass = validation.hasErrors ? 'cached-info error' : 'cached-info';
    const infoStyle = validation.hasErrors ? 'background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-color: #ef4444;' : '';
    const textColor = validation.hasErrors ? 'color: #dc2626;' : '';

    let html = `
        <!-- Table Info -->
        <div class="campaign-info">
            <div>
                <div class="campaign-name"><i class="fas fa-table"></i> ${currentTableName}</div>
                <div class="campaign-meta">${orders.length} đơn hàng đã tải</div>
            </div>
            <div class="campaign-meta">
                <i class="fas fa-clock"></i> Lấy lúc: ${fetchedAt.toLocaleString('vi-VN')}
            </div>
        </div>

        <!-- Cached Info -->
        <div class="${infoClass}" style="${infoStyle}">
            <div class="info-text" style="${textColor}">
                ${validation.hasErrors ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-check-circle"></i>'}
                <strong>${orders.length}</strong> đơn hàng đã được lưu |
                Thành công: <strong>${cached.successCount || orders.length}</strong> |
                Lỗi: <strong>${cached.errorCount || 0}</strong>
                ${validation.hasErrors ? `| <strong style="color: #dc2626;">⚠️ Có lỗi dữ liệu</strong>` : ''}
            </div>
            <button class="btn-clear-cache" onclick="reloadFromExcel()" title="Xóa cache và tải lại từ file Excel">
                <i class="fas fa-sync-alt"></i> Tải lại từ Excel
            </button>
        </div>

        ${validationHtml}

        <!-- Orders Table -->
        <div class="content-section">
            <h2><i class="fas fa-list"></i> Danh sách chi tiết (${filteredOrders.length}${currentProductFilter ? '/' + orders.length : ''}) <span style="font-size: 12px; color: #888; font-weight: normal;">- Sắp xếp STT giảm dần</span></h2>

            <!-- Product Search -->
            <div class="product-search-container">
                <input type="text"
                    class="product-search-input"
                    id="productSearchInput"
                    placeholder="Tìm kiếm sản phẩm (mã SP hoặc tên SP)..."
                    value="${currentProductFilter}"
                    onkeyup="handleProductSearchKeyup(event)">
                ${filterBadgeHtml}
            </div>

            <div style="overflow-x: auto;">
                <table class="orders-table">
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Mã đơn</th>
                            <th>Tag</th>
                            <th>Khách hàng</th>
                            <th>SĐT</th>
                            <th>SP</th>
                            <th>Tổng tiền</th>
                            <th>COD</th>
                            <th>Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    filteredOrders.forEach((item) => {
        const order = item.order;
        const originalIndex = item.originalIndex;
        const productCount = order.Details?.length || 0;
        const tagsHtml = parseOrderTagsHtml(order.Tags);
        const stt = order.SessionIndex || originalIndex + 1;

        // Highlight duplicate STT or Code
        const isDuplicateSTT = validation.duplicateSTTSet && validation.duplicateSTTSet.has(parseInt(stt));
        const isDuplicateCode = validation.duplicateCodesSet && validation.duplicateCodesSet.has(order.Code);
        const rowStyle = (isDuplicateSTT || isDuplicateCode) ? 'background: #fef2f2; border-left: 3px solid #ef4444;' : '';
        const sttStyle = isDuplicateSTT ? 'color: #dc2626; font-weight: bold;' : '';
        const codeStyle = isDuplicateCode ? 'color: #dc2626; font-weight: bold;' : '';

        html += `
            <tr onclick="openCachedOrderDetail(${originalIndex})" style="${rowStyle}">
                <td style="${sttStyle}">${stt}${isDuplicateSTT ? ' <i class="fas fa-exclamation-circle" style="color: #ef4444;" title="STT trùng"></i>' : ''}</td>
                <td class="order-code" style="${codeStyle}">${order.Code || ''}${isDuplicateCode ? ' <i class="fas fa-exclamation-circle" style="color: #ef4444;" title="Mã đơn trùng"></i>' : ''}</td>
                <td><div class="tags-cell">${tagsHtml}</div></td>
                <td>${order.Name || order.PartnerName || ''}</td>
                <td>${order.Telephone || ''}</td>
                <td>${productCount}</td>
                <td class="amount">${(order.TotalAmount || 0).toLocaleString('vi-VN')}đ</td>
                <td class="amount">${(order.CashOnDelivery || 0).toLocaleString('vi-VN')}đ</td>
                <td>${order.Status || order.State || ''}</td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    area.innerHTML = html;
}

/**
 * Validate order data for duplicates and missing STT
 */
function validateOrderData(orders) {
    const result = {
        hasErrors: false,
        duplicateSTT: [],
        duplicateSTTSet: new Set(),
        duplicateCodes: [],
        duplicateCodesSet: new Set(),
        missingSTT: [],
        extraSTT: 0,
        maxSTT: 0
    };

    if (!orders || orders.length === 0) return result;

    // Collect all STT and Codes
    const sttCount = new Map();
    const codeCount = new Map();
    let maxSTT = 0;

    orders.forEach(order => {
        const stt = parseInt(order.SessionIndex) || 0;
        const code = order.Code || '';

        if (stt > 0) {
            sttCount.set(stt, (sttCount.get(stt) || 0) + 1);
            if (stt > maxSTT) maxSTT = stt;
        }

        if (code) {
            codeCount.set(code, (codeCount.get(code) || 0) + 1);
        }
    });

    result.maxSTT = maxSTT;

    // Find duplicate STT
    sttCount.forEach((count, stt) => {
        if (count > 1) {
            result.duplicateSTT.push(stt);
            result.duplicateSTTSet.add(stt);
        }
    });

    // Find duplicate Codes
    codeCount.forEach((count, code) => {
        if (count > 1) {
            result.duplicateCodes.push(code);
            result.duplicateCodesSet.add(code);
        }
    });

    // Find missing STT (gaps in sequence from 1 to maxSTT)
    if (maxSTT > 0) {
        for (let i = 1; i <= maxSTT; i++) {
            if (!sttCount.has(i)) {
                result.missingSTT.push(i);
            }
        }

        // Check for extra orders (more orders than maxSTT)
        const uniqueSTTCount = sttCount.size;
        if (orders.length > maxSTT) {
            result.extraSTT = orders.length - maxSTT;
        }
    }

    // Mark if has errors
    result.hasErrors = result.duplicateSTT.length > 0 ||
        result.duplicateCodes.length > 0 ||
        result.missingSTT.length > 0 ||
        result.extraSTT > 0;

    return result;
}

/**
 * Format missing STT numbers into ranges for display
 */
function formatMissingSTT(missingSTT) {
    if (missingSTT.length === 0) return '';
    if (missingSTT.length <= 10) return missingSTT.join(', ');

    // Group consecutive numbers into ranges
    const ranges = [];
    let start = missingSTT[0];
    let end = missingSTT[0];

    for (let i = 1; i < missingSTT.length; i++) {
        if (missingSTT[i] === end + 1) {
            end = missingSTT[i];
        } else {
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = end = missingSTT[i];
        }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    const rangeStr = ranges.slice(0, 10).join(', ');
    return ranges.length > 10 ? `${rangeStr}... (+${ranges.length - 10} khác)` : rangeStr;
}

// Filter orders by product (ProductCode, ProductName)
function filterOrdersByProduct(orders, searchTerm) {
    if (!searchTerm || !searchTerm.trim()) {
        // Return all orders with original indices
        return orders.map((order, index) => ({ order, originalIndex: index }));
    }

    const term = searchTerm.toLowerCase().trim();
    const result = [];

    orders.forEach((order, index) => {
        const details = order.Details || [];
        // Check if any product in the order matches the search term
        const hasMatchingProduct = details.some(product => {
            const productCode = (product.ProductCode || '').toLowerCase();
            const productName = (product.ProductName || '').toLowerCase();
            return productCode.includes(term) || productName.includes(term);
        });

        if (hasMatchingProduct) {
            result.push({ order, originalIndex: index });
        }
    });

    return result;
}

// Handle Enter key on product search input
function handleProductSearchKeyup(event) {
    if (event.key === 'Enter') {
        const searchInput = document.getElementById('productSearchInput');
        currentProductFilter = searchInput.value.trim();
        renderCachedDetailsTab();
    }
}

// Clear product filter
function clearProductFilter() {
    currentProductFilter = '';
    renderCachedDetailsTab();
}

/**
 * Reload orders from Excel files and save to Firebase
 * This replaces the old clearCacheForTable function
 */
async function reloadFromExcel() {
    if (!currentTableName) {
        alert('Chưa chọn chiến dịch!');
        return;
    }

    if (!confirm(`Tải lại dữ liệu từ file Excel cho "${currentTableName}"?\n\nThao tác này sẽ:\n1. Xóa cache hiện tại\n2. Tải lại từ file Excel\n3. Lưu lên Firebase`)) {
        return;
    }

    // Get button and show loading state
    const btn = document.querySelector('.btn-clear-cache');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
    btn.disabled = true;

    try {
        console.log('[REPORT] 🔄 Reloading from Excel for:', currentTableName);

        // Step 1: Clear current cache
        delete cachedOrderDetails[currentTableName];
        console.log('[REPORT] 🗑️ Cache cleared');

        // Step 2: Fetch Excel data from campaigns
        const rawOrders = await fetchAllCampaignsExcel();

        if (!rawOrders || rawOrders.length === 0) {
            throw new Error('Không tìm thấy dữ liệu Excel từ các chiến dịch');
        }

        console.log(`[REPORT] 📊 Fetched ${rawOrders.length} raw orders from Excel`);

        // Step 3: Parse Excel data to Firebase format
        const orders = parseExcelOrderData(rawOrders);
        console.log(`[REPORT] 📋 Parsed ${orders.length} orders`);

        // Step 4: Create cache data structure
        const cacheData = {
            tableName: currentTableName,
            orders: orders,
            fetchedAt: new Date().toISOString(),
            totalOrders: orders.length,
            successCount: orders.length,
            errorCount: 0,
            _source: 'excel_reload'
        };

        // Step 5: Save to cache
        cachedOrderDetails[currentTableName] = cacheData;
        saveCachedData();
        console.log('[REPORT] 💾 Saved to local cache');

        // Step 6: Save to Firebase
        const firebaseSaved = await saveToFirebase(currentTableName, cacheData);
        console.log('[REPORT] ☁️ Firebase save result:', firebaseSaved);

        // Step 7: Update UI
        updateCachedCountBadge();
        renderCachedDetailsTab();

        // Step 8: Reload statistics
        await loadEmployeeRanges();
        renderStatistics();

        // Show success message
        const firebaseMsg = firebaseSaved ? '✅ Đã lưu Firebase' : '❌ Lỗi lưu Firebase';
        alert(`✅ Tải lại thành công!\n\n- Số đơn hàng: ${orders.length}\n- Bảng: ${currentTableName}\n- ${firebaseMsg}`);

    } catch (error) {
        console.error('[REPORT] ❌ Error reloading from Excel:', error);
        alert(`❌ Lỗi tải lại từ Excel:\n${error.message}`);

        // Restore UI
        renderCachedDetailsTab();
    } finally {
        // Restore button state
        if (btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}

// Keep old function name for backward compatibility
function clearCacheForTable() {
    reloadFromExcel();
}

function openCachedOrderDetail(index) {
    if (!currentTableName || !cachedOrderDetails[currentTableName]) return;

    const order = cachedOrderDetails[currentTableName].orders[index];
    if (!order) return;

    const modal = document.getElementById('orderDetailModal');
    modal.classList.add('show');

    renderOrderDetailModal({ orderCode: order.Code }, order);
}

// =====================================================
// UPDATE STATISTICS
// =====================================================
function updateStats() {
    const totalOrders = allOrders.length;
    const totalAmount = allOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalProducts = allOrders.reduce((sum, order) => sum + (order.quantity || 0), 0);
    const uniqueCustomers = new Set(allOrders.map(order => order.phone).filter(Boolean));

    document.getElementById('statTotalOrders').textContent = totalOrders.toLocaleString('vi-VN');
    document.getElementById('statTotalAmount').textContent = formatCurrency(totalAmount);
    document.getElementById('statTotalProducts').textContent = totalProducts.toLocaleString('vi-VN');
    document.getElementById('statTotalCustomers').textContent = uniqueCustomers.size.toLocaleString('vi-VN');
}

function formatCurrency(amount) {
    if (amount >= 1000000) {
        return (amount / 1000000).toFixed(1) + 'M';
    } else if (amount >= 1000) {
        return (amount / 1000).toFixed(0) + 'K';
    }
    return amount.toLocaleString('vi-VN');
}


// =====================================================
// ORDER DETAIL MODAL
// =====================================================
async function openOrderDetail(orderId, index) {
    const modal = document.getElementById('orderDetailModal');
    const modalBody = document.getElementById('modalBody');
    const order = allOrders[index];

    modal.classList.add('show');
    modalBody.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner"></i>
            <h3>Đang tải chi tiết...</h3>
        </div>
    `;

    try {
        const fullOrderData = await fetchOrderData(orderId);
        renderOrderDetailModal(order, fullOrderData);
    } catch (error) {
        console.error('[REPORT] Error loading order detail:', error);
        renderOrderDetailModal(order, null);
    }
}

function renderOrderDetailModal(basicOrder, fullOrder) {
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');

    modalTitle.textContent = `Chi tiết đơn hàng - ${fullOrder?.Code || basicOrder.orderCode || ''}`;

    const order = fullOrder || basicOrder;

    let html = `
        <div class="tabs">
            <button class="tab-btn active" onclick="switchModalTab('info')">Thông tin</button>
            <button class="tab-btn" onclick="switchModalTab('products')">Sản phẩm</button>
            <button class="tab-btn" onclick="switchModalTab('json')">JSON Data</button>
        </div>

        <div class="tab-content active" id="modalTabInfo">
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="label">Mã đơn hàng</div>
                    <div class="value">${order.Code || basicOrder.orderCode || ''}</div>
                </div>
                <div class="detail-item">
                    <div class="label">STT</div>
                    <div class="value">${order.SessionIndex || basicOrder.stt || ''}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Khách hàng</div>
                    <div class="value">${order.Name || order.PartnerName || basicOrder.customerName || ''}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Số điện thoại</div>
                    <div class="value">${order.Telephone || order.PartnerPhone || basicOrder.phone || ''}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Địa chỉ</div>
                    <div class="value">${order.Address || order.PartnerAddress || basicOrder.address || ''}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Tổng tiền</div>
                    <div class="value" style="color: #11998e;">${(order.TotalAmount || order.AmountTotal || basicOrder.totalAmount || 0).toLocaleString('vi-VN')}đ</div>
                </div>
                <div class="detail-item">
                    <div class="label">COD</div>
                    <div class="value" style="color: #f5576c;">${(order.CashOnDelivery || 0).toLocaleString('vi-VN')}đ</div>
                </div>
                <div class="detail-item">
                    <div class="label">Trạng thái</div>
                    <div class="value">${order.Status || order.State || basicOrder.state || ''}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Ngày tạo</div>
                    <div class="value">${formatDate(order.DateCreated || order.DateOrder || basicOrder.dateOrder)}</div>
                </div>
                <div class="detail-item">
                    <div class="label">Nhân viên</div>
                    <div class="value">${order.UserName || order.User?.Name || ''}</div>
                </div>
            </div>

            ${order.Note ? `
                <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 10px;">
                    <div class="label" style="margin-bottom: 10px;"><i class="fas fa-sticky-note"></i> Ghi chú</div>
                    <div style="white-space: pre-wrap;">${order.Note}</div>
                </div>
            ` : ''}
        </div>

        <div class="tab-content" id="modalTabProducts">
            ${renderProductsList(order.Details || basicOrder.products || [])}
        </div>

        <div class="tab-content" id="modalTabJson">
            <div class="json-preview">${syntaxHighlightJSON(fullOrder || basicOrder)}</div>
        </div>
    `;

    modalBody.innerHTML = html;
}

function renderProductsList(products) {
    if (!products || products.length === 0) {
        return `
            <div class="empty-state" style="padding: 30px;">
                <i class="fas fa-box-open" style="font-size: 40px;"></i>
                <h3>Không có sản phẩm</h3>
            </div>
        `;
    }

    // Calculate totals
    let totalQty = 0;
    let totalAmount = 0;

    let html = `
        <div class="products-list">
            <h4><i class="fas fa-box"></i> Danh sách sản phẩm (${products.length})</h4>
            <table class="products-detail-table" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                        <th style="padding: 10px; text-align: center; width: 40px;">#</th>
                        <th style="padding: 10px; text-align: center; width: 60px;">Ảnh</th>
                        <th style="padding: 10px; text-align: left;">Sản phẩm</th>
                        <th style="padding: 10px; text-align: center; width: 60px;">SL</th>
                        <th style="padding: 10px; text-align: right; width: 100px;">Đơn giá</th>
                        <th style="padding: 10px; text-align: right; width: 100px;">Thành tiền</th>
                        <th style="padding: 10px; text-align: left; width: 120px;">Ghi chú</th>
                    </tr>
                </thead>
                <tbody>`;

    products.forEach((product, index) => {
        const name = product.ProductName || product.ProductNameGet || product.name || product.nameGet || '';
        const code = product.ProductCode || product.productCode || product.Code || product.code || '';
        const qty = product.Quantity || product.ProductUOMQty || product.quantity || 0;
        const price = product.Price || product.PriceUnit || product.price || 0;
        const subtotal = price * qty;
        const note = product.Note || product.note || product.Description || '';
        const image = product.ProductImage || product.ImageUrl || product.image || '';

        totalQty += qty;
        totalAmount += subtotal;

        html += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; text-align: center; color: #64748b;">${index + 1}</td>
                <td style="padding: 10px; text-align: center;">
                    ${image
                ? `<img src="${image}" alt="${name}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0;">`
                : `<div style="width: 45px; height: 45px; background: #f1f5f9; border-radius: 6px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image" style="color: #cbd5e1;"></i></div>`
            }
                </td>
                <td style="padding: 10px;">
                    <div style="font-weight: 600; color: #1e293b;">${name}</div>
                    ${code ? `<div style="font-size: 12px; color: #64748b;">Mã: ${code}</div>` : ''}
                </td>
                <td style="padding: 10px; text-align: center; font-weight: 600;">${qty}</td>
                <td style="padding: 10px; text-align: right; color: #64748b;">${price.toLocaleString('vi-VN')}đ</td>
                <td style="padding: 10px; text-align: right; font-weight: 600; color: #059669;">${subtotal.toLocaleString('vi-VN')}đ</td>
                <td style="padding: 10px; font-size: 12px; color: #64748b;">${note || '-'}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
                <tfoot>
                    <tr style="background: #f0fdf4; border-top: 2px solid #10b981;">
                        <td colspan="3" style="padding: 12px; text-align: right; font-weight: 700; color: #047857;">Tổng cộng:</td>
                        <td style="padding: 12px; text-align: center; font-weight: 700; color: #047857;">${totalQty}</td>
                        <td style="padding: 12px;"></td>
                        <td style="padding: 12px; text-align: right; font-weight: 700; font-size: 16px; color: #059669;">${totalAmount.toLocaleString('vi-VN')}đ</td>
                        <td style="padding: 12px;"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    return html;
}

function switchModalTab(tabName) {
    document.querySelectorAll('#modalBody .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`#modalBody .tab-btn[onclick*="${tabName}"]`).classList.add('active');

    document.querySelectorAll('#modalBody .tab-content').forEach(content => content.classList.remove('active'));

    const tabMap = { 'info': 'modalTabInfo', 'products': 'modalTabProducts', 'json': 'modalTabJson' };
    document.getElementById(tabMap[tabName]).classList.add('active');
}

function closeOrderDetailModal() {
    document.getElementById('orderDetailModal').classList.remove('show');
}

// Function để mở modal chi tiết đơn hàng chỉ với orderId (cho discount stats UI)
async function openOrderDetailById(orderId) {
    // Tìm order trong allOrders
    const index = allOrders.findIndex(o => o.orderId === orderId || o.Id === orderId);

    if (index >= 0) {
        // Tìm thấy trong cache, gọi function cũ
        openOrderDetail(orderId, index);
    } else {
        // Không tìm thấy, fetch từ API và hiển thị
        const modal = document.getElementById('orderDetailModal');
        const modalBody = document.getElementById('modalBody');

        modal.classList.add('show');
        modalBody.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner"></i>
                <h3>Đang tải chi tiết...</h3>
            </div>
        `;

        try {
            const fullOrderData = await fetchOrderData(orderId);
            // Tạo basicOrder từ fullOrderData
            const basicOrder = {
                orderId: orderId,
                orderCode: fullOrderData?.Code || '',
                customerName: fullOrderData?.Name || '',
                stt: fullOrderData?.SessionIndex || ''
            };
            renderOrderDetailModal(basicOrder, fullOrderData);
        } catch (error) {
            console.error('[REPORT] Error loading order detail by ID:', error);
            modalBody.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Không thể tải chi tiết đơn hàng</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

// Export to window for discount stats UI
window.openOrderDetailById = openOrderDetailById;

document.getElementById('orderDetailModal').addEventListener('click', function (e) {
    if (e.target === this) closeOrderDetailModal();
});

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Parse order tags from JSON or comma-separated string and render as HTML
 * @param {string|Array} tagsData - Tags JSON string, comma-separated string, or array
 * @returns {string} HTML string for displaying tags
 */
function parseOrderTagsHtml(tagsData, order = null) {
    try {
        let tags = [];
        let html = '';

        // Add virtual "ĐÃ RA ĐƠN" tag if order has matched 'ordered' key (for TAG TRÙNG display)
        if (order && order._matchedTagKeys && order._matchedTagKeys.includes('ordered')) {
            html += `<span class="order-tag" style="background-color: #22c55e; border: 2px dashed #15803d;" title="Tag ảo - Trạng thái Đơn hàng">✓ ĐÃ RA ĐƠN</span>`;
        }

        if (!tagsData) return html;

        if (Array.isArray(tagsData)) {
            tags = tagsData;
        } else if (typeof tagsData === 'string') {
            // Try to parse as JSON first
            try {
                const parsed = JSON.parse(tagsData);
                if (Array.isArray(parsed)) {
                    tags = parsed;
                }
            } catch (e) {
                // Not JSON - treat as comma-separated string (from Excel)
                tags = tagsData.split(',').map(t => t.trim()).filter(t => t).map(name => ({
                    Name: name,
                    Color: getTagColor(name)
                }));
            }
        }

        if (tags.length > 0) {
            html += tags.map(tag => {
                const tagName = tag.Name || tag.name || tag;
                const tagColor = tag.Color || tag.color || getTagColor(tagName);
                return `<span class="order-tag" style="background-color: ${tagColor};" title="${tagName}">${tagName}</span>`;
            }).join('');
        }

        return html;
    } catch (e) {
        return '';
    }
}

/**
 * Get color for tag based on LIVE_STAT_TAGS or default
 */
function getTagColor(tagName) {
    if (!tagName) return '#6b7280';
    const normalizedName = tagName.toLowerCase().trim();

    for (const liveTag of LIVE_STAT_TAGS) {
        if (liveTag.patterns) {
            for (const pattern of liveTag.patterns) {
                if (normalizedName.startsWith(pattern.toLowerCase())) {
                    return liveTag.color;
                }
            }
        }
    }
    return '#6b7280'; // Default gray
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleString('vi-VN');
    } catch {
        return dateStr;
    }
}

function syntaxHighlightJSON(obj) {
    if (!obj) return 'null';

    const json = JSON.stringify(obj, null, 2);
    return json
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        });
}

// =====================================================
// SAVE REPORT FUNCTIONS
// =====================================================

// Update save report and refresh tags button state
function updateSaveReportButton() {
    const btnSave = document.getElementById('btnSaveReport');
    const btnRefreshTags = document.getElementById('btnRefreshTags');

    const currentData = cachedOrderDetails[currentTableName];
    const hasData = currentData && currentData.orders && currentData.orders.length > 0;

    if (btnSave) btnSave.disabled = !hasData;
    if (btnRefreshTags) btnRefreshTags.disabled = !hasData;
}

// Open save report modal
function openSaveReportModal() {
    const currentData = cachedOrderDetails[currentTableName];
    if (!currentData || !currentData.orders || currentData.orders.length === 0) {
        alert('Chưa có dữ liệu chi tiết để lưu. Vui lòng "Lấy chi tiết đơn hàng" trước.');
        return;
    }

    // Set default name suggestion
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN').replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
    const suggestedName = `${currentTableName} - Bản lưu ${dateStr} ${timeStr}`;

    document.getElementById('saveReportName').value = suggestedName;
    document.getElementById('saveReportOriginalCampaign').textContent = currentTableName;
    document.getElementById('saveReportOrderCount').textContent = currentData.orders.length;

    document.getElementById('saveReportModal').style.display = 'flex';
}

// Close save report modal
function closeSaveReportModal() {
    document.getElementById('saveReportModal').style.display = 'none';
}

// ⚡ NEW: Data Source Modal Functions
function openDataSourceModal() {
    const modal = document.getElementById('dataSourceModal');
    modal.style.display = 'flex';

    // Add click handlers to options
    const options = modal.querySelectorAll('.data-source-option');
    options.forEach(option => {
        option.onclick = function() {
            const choice = this.getAttribute('data-choice');
            handleDataSourceChoice(choice);
        };
    });
}

function closeDataSourceModal() {
    document.getElementById('dataSourceModal').style.display = 'none';
}

async function handleDataSourceChoice(choice) {
    closeDataSourceModal();

    if (choice === 'excel') {
        await executeExcelFetch();
    } else if (choice === 'api') {
        await executeAPIFetch();
    }
}

// Confirm and save report copy
async function confirmSaveReport() {
    const reportName = document.getElementById('saveReportName').value.trim();

    if (!reportName) {
        alert('Vui lòng nhập tên bản lưu');
        return;
    }

    // Check if name already exists
    const safeReportName = reportName.replace(/[.$#\[\]\/]/g, '_');
    const existingDoc = await database.collection(FIREBASE_PATH).doc(safeReportName).get();

    if (existingDoc.exists) {
        if (!confirm(`Tên "${reportName}" đã tồn tại. Bạn có muốn ghi đè không?`)) {
            return;
        }
    }

    // Get current data
    const currentData = cachedOrderDetails[currentTableName];
    if (!currentData) {
        alert('Không tìm thấy dữ liệu để lưu');
        return;
    }

    try {
        // Save to Firebase with isSavedCopy flag
        const saveData = {
            tableName: reportName,
            orders: sanitizeForFirebase(currentData.orders),
            fetchedAt: new Date().toISOString(),
            totalOrders: currentData.orders.length,
            successCount: currentData.successCount || currentData.orders.length,
            errorCount: currentData.errorCount || 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            isSavedCopy: true,
            originalCampaign: currentTableName
        };

        await database.collection(FIREBASE_PATH).doc(safeReportName).set(saveData);

        console.log(`[REPORT] ✅ Saved report copy: ${reportName}`);

        closeSaveReportModal();
        alert(`Đã lưu bản sao "${reportName}" thành công!`);

        // Reload dropdown to show new saved copy
        await loadAvailableTables();

    } catch (error) {
        console.error('[REPORT] ❌ Error saving report copy:', error);
        alert('Lỗi khi lưu bản sao: ' + error.message);
    }
}

// Open manage reports modal
async function openManageReportsModal() {
    document.getElementById('manageReportsModal').style.display = 'flex';
    document.getElementById('manageReportsLoading').style.display = 'block';
    document.getElementById('manageReportsList').style.display = 'none';
    document.getElementById('manageReportsEmpty').style.display = 'none';

    await loadAllReportsForManagement();
}

// Close manage reports modal
function closeManageReportsModal() {
    document.getElementById('manageReportsModal').style.display = 'none';
}

// Load all reports for management modal
async function loadAllReportsForManagement() {
    try {
        const snapshot = await database.collection(FIREBASE_PATH).get();
        const tables = {};
        snapshot.forEach(doc => {
            tables[doc.id] = doc.data();
        });

        const tbody = document.getElementById('manageReportsTableBody');
        tbody.innerHTML = '';

        const tableKeys = Object.keys(tables);

        if (tableKeys.length === 0) {
            document.getElementById('manageReportsLoading').style.display = 'none';
            document.getElementById('manageReportsEmpty').style.display = 'block';
            return;
        }

        // Sort: Main reports first, then saved copies, both sorted by fetchedAt desc
        tableKeys.sort((a, b) => {
            const dataA = tables[a];
            const dataB = tables[b];
            const isCopyA = dataA.isSavedCopy || false;
            const isCopyB = dataB.isSavedCopy || false;

            if (isCopyA !== isCopyB) return isCopyA ? 1 : -1;

            const dateA = dataA.fetchedAt ? new Date(dataA.fetchedAt).getTime() : 0;
            const dateB = dataB.fetchedAt ? new Date(dataB.fetchedAt).getTime() : 0;
            return dateB - dateA;
        });

        tableKeys.forEach(safeTableName => {
            const tableData = tables[safeTableName];
            const originalName = tableData.tableName || safeTableName.replace(/_/g, ' ');
            const orderCount = tableData.totalOrders || tableData.orders?.length || 0;
            const fetchedAt = tableData.fetchedAt ? new Date(tableData.fetchedAt).toLocaleString('vi-VN') : '-';
            const isSavedCopy = tableData.isSavedCopy || false;

            const icon = isSavedCopy ? '💾' : '📌';
            const typeLabel = isSavedCopy ? 'Bản lưu' : 'Chính';
            const typeBadgeColor = isSavedCopy ? '#3b82f6' : '#10b981';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                    <span style="font-size: 20px;">${icon}</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                    <div style="font-weight: 600;">${originalName}</div>
                    ${isSavedCopy && tableData.originalCampaign ? `<div style="font-size: 12px; color: #6b7280;">Từ: ${tableData.originalCampaign}</div>` : ''}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                    <span style="background: #f3f4f6; padding: 4px 10px; border-radius: 20px; font-weight: 600;">${orderCount}</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px; color: #6b7280;">
                    ${fetchedAt}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                    <button onclick="deleteReport('${safeTableName}', '${originalName.replace(/'/g, "\\'")}', ${isSavedCopy})"
                        style="padding: 6px 12px; background: #fee2e2; color: #dc2626; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s;"
                        onmouseover="this.style.background='#fecaca'"
                        onmouseout="this.style.background='#fee2e2'">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('manageReportsLoading').style.display = 'none';
        document.getElementById('manageReportsList').style.display = 'block';

    } catch (error) {
        console.error('[REPORT] ❌ Error loading reports for management:', error);
        document.getElementById('manageReportsLoading').innerHTML = `
            <i class="fas fa-exclamation-triangle fa-2x" style="color: #dc2626;"></i>
            <p style="color: #dc2626;">Lỗi khi tải danh sách: ${error.message}</p>
        `;
    }
}

// Delete a report
async function deleteReport(safeTableName, displayName, isSavedCopy) {
    const typeLabel = isSavedCopy ? 'bản lưu' : 'báo cáo chính';
    const warningMsg = isSavedCopy
        ? `Bạn có chắc muốn xóa ${typeLabel} "${displayName}"?`
        : `⚠️ CẢNH BÁO: Đây là báo cáo CHÍNH!\n\nBạn có chắc muốn xóa "${displayName}"?\n\nHành động này không thể hoàn tác!`;

    if (!confirm(warningMsg)) {
        return;
    }

    try {
        await database.collection(FIREBASE_PATH).doc(safeTableName).delete();

        console.log(`[REPORT] ✅ Deleted report: ${displayName}`);

        // Reload the list
        await loadAllReportsForManagement();

        // Also reload dropdown
        await loadAvailableTables();

        alert(`Đã xóa "${displayName}" thành công!`);

    } catch (error) {
        console.error('[REPORT] ❌ Error deleting report:', error);
        alert('Lỗi khi xóa: ' + error.message);
    }
}

// =====================================================
// SYNC SPECIFIC FIELDS FROM TAB1
// =====================================================

let isSyncingData = false;

/**
 * Sync specific fields from Tab1 (allData) to Firebase cache
 * Only updates: Tags, TotalAmount, Status, Quantity (SL)
 * Preserves all other data in cache
 */
async function syncAllDataFromTab1() {
    if (isSyncingData) {
        alert('Đang trong quá trình đồng bộ, vui lòng đợi...');
        return;
    }

    const currentData = cachedOrderDetails[currentTableName];
    if (!currentData || !currentData.orders || currentData.orders.length === 0) {
        alert('Chưa có dữ liệu chi tiết để đồng bộ. Vui lòng "Lấy chi tiết đơn hàng" trước.');
        return;
    }

    // Confirm before syncing
    const confirmMsg = `Sẽ cập nhật 4 trường dữ liệu cho ${currentData.orders.length} đơn hàng từ Tab Quản lý đơn hàng:\n\n✅ Tags\n✅ Tổng tiền (TotalAmount)\n✅ Trạng thái (Status)\n✅ Số lượng (SL)\n\nGiữ nguyên: Tất cả dữ liệu khác\n\nBạn có muốn tiếp tục?`;
    if (!confirm(confirmMsg)) {
        return;
    }

    isSyncingData = true;
    const btn = document.getElementById('btnRefreshTags');

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner spinning"></i> Đang đồng bộ...';

        console.log('[REPORT] 🔄 Starting selective data sync from Tab1...');

        // Request fresh data from Tab1
        await requestFreshDataFromTab1();

        // Wait a bit for data to arrive
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Now allOrders should have fresh data from Tab1
        if (allOrders.length === 0) {
            throw new Error('Không nhận được dữ liệu từ Tab Quản lý đơn hàng. Vui lòng đảm bảo tab này đang mở.');
        }

        // Build a map of orderId -> order data from allOrders (Tab1)
        const ordersMap = new Map();
        allOrders.forEach(order => {
            const orderId = order.orderId || order.Id;
            if (orderId) {
                ordersMap.set(orderId, order);
            }
        });

        console.log(`[REPORT] 🔄 Built orders map with ${ordersMap.size} entries from Tab1`);

        // Update ONLY specific fields in cachedOrderDetails
        let updatedCount = 0;
        currentData.orders.forEach(cachedOrder => {
            const orderId = cachedOrder.Id || cachedOrder.orderId;

            if (ordersMap.has(orderId)) {
                const freshOrder = ordersMap.get(orderId);

                // ONLY update these 4 fields - keep everything else unchanged
                if (freshOrder.Tags !== undefined) {
                    cachedOrder.Tags = freshOrder.Tags;
                }
                if (freshOrder.TotalAmount !== undefined) {
                    cachedOrder.TotalAmount = freshOrder.TotalAmount;
                }
                if (freshOrder.Status !== undefined) {
                    cachedOrder.Status = freshOrder.Status;
                }
                if (freshOrder.StatusText !== undefined) {
                    cachedOrder.StatusText = freshOrder.StatusText;
                }
                if (freshOrder.Quantity !== undefined) {
                    cachedOrder.Quantity = freshOrder.Quantity;
                }
                // Also check for SL field name variant
                if (freshOrder.SL !== undefined) {
                    cachedOrder.SL = freshOrder.SL;
                }

                cachedOrder._syncedAt = new Date().toISOString();
                updatedCount++;
            }
        });

        console.log(`[REPORT] 🔄 Updated ${updatedCount}/${currentData.orders.length} orders`);

        // Save updated data to Firebase
        const safeTableName = currentTableName.replace(/[.$#\[\]\/]/g, '_');
        await database.collection(FIREBASE_PATH).doc(safeTableName).update({
            orders: sanitizeForFirebase(currentData.orders),
            lastSyncedAt: new Date().toISOString(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('[REPORT] ✅ Data synced and saved to Firebase');

        // Refresh statistics and UI
        renderStatistics();
        renderCachedDetailsTab();
        updateCachedCountBadge();

        // Show success message
        alert(`Đã đồng bộ thành công!\n\n✅ Cập nhật: ${updatedCount}/${currentData.orders.length} đơn hàng\n\nCác trường đã cập nhật:\n- Tags\n- TotalAmount\n- Status\n- SL`);

    } catch (error) {
        console.error('[REPORT] ❌ Error syncing data:', error);
        alert('Lỗi khi đồng bộ dữ liệu: ' + error.message);
    } finally {
        isSyncingData = false;
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync"></i> Đồng bộ Tab1';
        updateSaveReportButton();
    }
}

// Request fresh data from Tab1
function requestFreshDataFromTab1() {
    return new Promise((resolve) => {
        console.log('[REPORT] 🔄 Requesting fresh data from Tab1...');
        window.parent.postMessage({
            type: 'REQUEST_ORDERS_DATA_FROM_OVERVIEW'
        }, '*');

        // Resolve after a timeout (data will arrive via message listener)
        setTimeout(resolve, 500);
    });
}

// =====================================================
// REFRESH STANDARD PRICE CACHE
// =====================================================
async function downloadProductPriceExcel() {
    try {
        console.log('[STANDARD-PRICE] Refreshing standard price cache...');

        // Check if standardPriceManager is available
        if (!window.standardPriceManager) {
            throw new Error('StandardPriceManager not initialized');
        }

        // Fetch products (force refresh cache)
        // standardPriceManager.fetchProducts() sẽ tự động:
        // 1. Show loading notification
        // 2. Fetch Excel từ API
        // 3. Parse và cache vào localStorage
        // 4. Show success/error notification
        await window.standardPriceManager.fetchProducts(true);

        console.log('[STANDARD-PRICE] Cache refresh completed successfully!');

    } catch (error) {
        console.error('[STANDARD-PRICE] Cache refresh error:', error);
        if (window.notificationManager) {
            window.notificationManager.error(
                `Không thể tải giá vốn: ${error.message}`,
                4000,
                'Lỗi'
            );
        }
    }
}

// =====================================================
