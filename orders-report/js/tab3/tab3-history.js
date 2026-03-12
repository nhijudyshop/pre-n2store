/**
 * TAB3-HISTORY.JS
 * Upload History V1 viewer, detail view, and cart comparison.
 *
 * Load order: tab3-history.js (7th, after tab3-upload.js)
 * Depends on: window._tab3 (from tab3-core.js)
 */
(function () {
    'use strict';

    const { state, utils, ui } = window._tab3;
    const database = window._tab3.database;

    // =====================================================
    // HISTORY V1 STATE
    // =====================================================

    let uploadHistoryRecords = [];
    let filteredHistoryRecords = [];
    let currentHistoryPage = 1;
    const HISTORY_PAGE_SIZE = 20;

    // =====================================================
    // OPEN UPLOAD HISTORY MODAL
    // =====================================================

    window.openUploadHistoryModal = async function () {
        console.log('[HISTORY] Opening upload history modal...');

        try {
            const modal = new bootstrap.Modal(document.getElementById('uploadHistoryModal'));
            modal.show();

            const container = document.getElementById('historyListContainer');
            container.innerHTML = `
                <div class="history-loading">
                    <div class="spinner-border text-info" role="status">
                        <span class="visibly-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải lịch sử upload...</p>
                </div>
            `;

            await loadUploadHistory();
            renderUploadHistoryList();

        } catch (error) {
            console.error('[HISTORY] Error opening history modal:', error);
            ui.showNotification('Lỗi khi tải lịch sử upload', 'error');

            const container = document.getElementById('historyListContainer');
            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Lỗi khi tải lịch sử upload</p>
                    <p class="small text-danger">${error.message}</p>
                    <button class="btn btn-sm btn-primary mt-2" onclick="openUploadHistoryModal()">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    };

    // =====================================================
    // LOAD UPLOAD HISTORY
    // =====================================================

    async function loadUploadHistory() {
        try {
            console.log('[HISTORY] Loading history from Firebase...');

            const historyPath = state.userStorageManager
                ? state.userStorageManager.getUserFirebasePath('productAssignments_history')
                : 'productAssignments_history/guest';
            console.log('[HISTORY] Loading from path:', historyPath);
            const snapshot = await database.ref(historyPath)
                .orderByChild('timestamp')
                .limitToLast(100)
                .once('value');

            const data = snapshot.val();

            if (!data) {
                console.log('[HISTORY] No history records found');
                uploadHistoryRecords = [];
                filteredHistoryRecords = [];
                return;
            }

            uploadHistoryRecords = Object.keys(data).map(key => {
                const record = data[key];
                return {
                    uploadId: record.uploadId || key,
                    timestamp: record.timestamp || 0,
                    uploadStatus: record.uploadStatus || 'unknown',
                    totalSTTs: record.totalSTTs || 0,
                    successCount: record.successCount || 0,
                    failCount: record.failCount || 0,
                    uploadedSTTs: record.uploadedSTTs || [],
                    note: record.note || '',
                    committedAt: record.committedAt || null,
                    restoredAt: record.restoredAt || null
                };
            });

            uploadHistoryRecords.sort((a, b) => b.timestamp - a.timestamp);
            filteredHistoryRecords = [...uploadHistoryRecords];

            console.log(`[HISTORY] Loaded ${uploadHistoryRecords.length} history records`);

        } catch (error) {
            console.error('[HISTORY] Error loading history:', error);
            throw error;
        }
    }

    // =====================================================
    // FILTER UPLOAD HISTORY
    // =====================================================

    window.filterUploadHistory = function () {
        const status = document.getElementById('historyStatusFilter').value;
        const dateFrom = document.getElementById('historyDateFrom').value;
        const dateTo = document.getElementById('historyDateTo').value;
        const searchSTT = document.getElementById('historySearchSTT').value.trim();

        console.log('[HISTORY] Filtering history:', { status, dateFrom, dateTo, searchSTT });

        filteredHistoryRecords = [...uploadHistoryRecords];

        if (status && status !== 'all') {
            filteredHistoryRecords = filteredHistoryRecords.filter(record => record.uploadStatus === status);
        }

        if (dateFrom) {
            const fromTimestamp = new Date(dateFrom).getTime();
            filteredHistoryRecords = filteredHistoryRecords.filter(record => record.timestamp >= fromTimestamp);
        }

        if (dateTo) {
            const toTimestamp = new Date(dateTo).setHours(23, 59, 59, 999);
            filteredHistoryRecords = filteredHistoryRecords.filter(record => record.timestamp <= toTimestamp);
        }

        if (searchSTT) {
            filteredHistoryRecords = filteredHistoryRecords.filter(record => {
                return record.uploadedSTTs.some(stt => stt.toString().includes(searchSTT));
            });
        }

        currentHistoryPage = 1;
        renderUploadHistoryList();

        console.log(`[HISTORY] Filtered to ${filteredHistoryRecords.length} records`);
    };

    // =====================================================
    // RENDER UPLOAD HISTORY LIST
    // =====================================================

    function renderUploadHistoryList() {
        const container = document.getElementById('historyListContainer');

        if (filteredHistoryRecords.length === 0) {
            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Không tìm thấy lịch sử upload nào</p>
                    <p class="small">Lịch sử sẽ được lưu tự động sau mỗi lần upload</p>
                </div>
            `;
            document.getElementById('historyPagination').innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(filteredHistoryRecords.length / HISTORY_PAGE_SIZE);
        const startIndex = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
        const endIndex = Math.min(startIndex + HISTORY_PAGE_SIZE, filteredHistoryRecords.length);
        const pageRecords = filteredHistoryRecords.slice(startIndex, endIndex);

        container.innerHTML = pageRecords.map(record => formatHistoryCard(record)).join('');
        renderHistoryPagination(totalPages);
    }

    // =====================================================
    // FORMAT HISTORY CARD
    // =====================================================

    function formatHistoryCard(record) {
        const statusConfig = {
            'completed': { icon: '✅', text: 'Thành công', class: 'completed' },
            'partial': { icon: '⚠️', text: 'Thành công một phần', class: 'partial' },
            'failed': { icon: '❌', text: 'Thất bại', class: 'failed' },
            'deletion_failed': { icon: '⚠️', text: 'Upload OK - Xóa failed', class: 'deletion_failed' }
        };

        const config = statusConfig[record.uploadStatus] || { icon: '❓', text: 'Unknown', class: 'unknown' };

        const date = new Date(record.timestamp);
        const dateStr = date.toLocaleString('vi-VN');
        const shortId = record.uploadId.slice(-8);
        const sttList = record.uploadedSTTs.slice(0, 20).join(', ');
        const moreStt = record.uploadedSTTs.length > 20 ? ` và ${record.uploadedSTTs.length - 20} STT khác` : '';

        return `
            <div class="history-card ${config.class}">
                <div class="history-card-header">
                    <div>
                        <h6 class="history-card-title">
                            ${config.icon} Upload #${shortId}
                            <span class="history-card-date">${dateStr}</span>
                        </h6>
                    </div>
                    <span class="history-status-badge ${config.class}">${config.text}</span>
                </div>

                <div class="history-stats">
                    <div class="history-stat-item history-stat-success">
                        <i class="fas fa-check-circle"></i>
                        <span><strong>${record.successCount}</strong> thành công</span>
                    </div>
                    <div class="history-stat-item history-stat-failed">
                        <i class="fas fa-times-circle"></i>
                        <span><strong>${record.failCount}</strong> thất bại</span>
                    </div>
                    <div class="history-stat-item history-stat-total">
                        <i class="fas fa-list"></i>
                        <span><strong>${record.totalSTTs}</strong> tổng STT</span>
                    </div>
                </div>

                <div class="history-stts">
                    <strong>STT:</strong> ${sttList}${moreStt}
                </div>

                <div class="history-actions">
                    <button class="btn btn-sm btn-info" onclick="compareCartHistory('${record.uploadId}')">
                        <i class="fas fa-balance-scale"></i> So Sánh Giỏ
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="viewUploadHistoryDetail('${record.uploadId}')">
                        <i class="fas fa-eye"></i> Xem Chi Tiết
                    </button>
                </div>

                ${record.note ? `
                    <div class="history-note">
                        <i class="fas fa-sticky-note"></i>
                        ${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(record.note) : record.note}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // =====================================================
    // HISTORY PAGINATION
    // =====================================================

    function renderHistoryPagination(totalPages) {
        const pagination = document.getElementById('historyPagination');

        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let html = '';

        html += `
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="changeHistoryPage(${currentHistoryPage - 1})"
                    ${currentHistoryPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        const maxPageButtons = 7;
        let startPage = Math.max(1, currentHistoryPage - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

        if (endPage - startPage < maxPageButtons - 1) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }

        if (startPage > 1) {
            html += `
                <button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPage(1)">1</button>
                ${startPage > 2 ? '<span>...</span>' : ''}
            `;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <button class="btn btn-sm ${i === currentHistoryPage ? 'btn-info active' : 'btn-outline-secondary'}"
                        onclick="changeHistoryPage(${i})">
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            html += `
                ${endPage < totalPages - 1 ? '<span>...</span>' : ''}
                <button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPage(${totalPages})">${totalPages}</button>
            `;
        }

        html += `
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="changeHistoryPage(${currentHistoryPage + 1})"
                    ${currentHistoryPage === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        pagination.innerHTML = html;
    }

    window.changeHistoryPage = function (page) {
        currentHistoryPage = page;
        renderUploadHistoryList();
        document.getElementById('historyListContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // =====================================================
    // VIEW UPLOAD HISTORY DETAIL
    // =====================================================

    window.viewUploadHistoryDetail = async function (uploadId) {
        console.log('[HISTORY] Viewing detail for:', uploadId);

        try {
            const detailModal = new bootstrap.Modal(document.getElementById('uploadHistoryDetailModal'));
            detailModal.show();

            const titleEl = document.getElementById('historyDetailModalTitle');
            const bodyEl = document.getElementById('historyDetailModalBody');

            titleEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
            bodyEl.innerHTML = `
                <div class="history-loading">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visibly-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải chi tiết upload...</p>
                </div>
            `;

            const historyPath = state.userStorageManager
                ? state.userStorageManager.getUserFirebasePath('productAssignments_history')
                : 'productAssignments_history/guest';
            const snapshot = await database.ref(`${historyPath}/${uploadId}`).once('value');
            const record = snapshot.val();

            if (!record) {
                throw new Error('Không tìm thấy record');
            }

            const shortId = uploadId.slice(-8);
            titleEl.innerHTML = `<i class="fas fa-info-circle"></i> Chi Tiết Upload #${shortId}`;
            bodyEl.innerHTML = renderUploadHistoryDetail(record);

        } catch (error) {
            console.error('[HISTORY] Error viewing detail:', error);
            ui.showNotification('Lỗi khi tải chi tiết upload', 'error');

            const bodyEl = document.getElementById('historyDetailModalBody');
            bodyEl.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    Lỗi: ${error.message}
                </div>
            `;
        }
    };

    // =====================================================
    // RENDER UPLOAD HISTORY DETAIL
    // =====================================================

    function renderUploadHistoryDetail(record) {
        const statusConfig = {
            'completed': { icon: '✅', text: 'Thành công hoàn toàn', class: 'success' },
            'partial': { icon: '⚠️', text: 'Thành công một phần', class: 'warning' },
            'failed': { icon: '❌', text: 'Thất bại hoàn toàn', class: 'danger' },
            'deletion_failed': { icon: '⚠️', text: 'Upload OK - Không xóa được', class: 'warning' }
        };

        const config = statusConfig[record.uploadStatus] || { icon: '❓', text: 'Unknown', class: 'secondary' };
        const date = new Date(record.timestamp).toLocaleString('vi-VN');

        let html = `
            <div class="history-detail-info mb-4">
                <div class="row">
                    <div class="col-md-6">
                        <span class="history-detail-label">Upload ID:</span>
                        <span class="history-detail-value">${record.uploadId}</span>
                    </div>
                    <div class="col-md-6">
                        <span class="history-detail-label">Thời gian:</span>
                        <span class="history-detail-value">${date}</span>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <span class="history-detail-label">Trạng thái:</span>
                        <span class="history-detail-value">
                            <span class="badge bg-${config.class}">${config.icon} ${config.text}</span>
                        </span>
                    </div>
                    <div class="col-md-6">
                        <span class="history-detail-label">Tổng STT:</span>
                        <span class="history-detail-value">
                            <strong>${record.totalSTTs}</strong>
                            (✅ ${record.successCount} | ❌ ${record.failCount})
                        </span>
                    </div>
                </div>
            </div>
        `;

        const productsBySTT = {};

        if (record.beforeSnapshot && record.beforeSnapshot.assignments) {
            record.beforeSnapshot.assignments.forEach(assignment => {
                assignment.sttList.forEach(stt => {
                    if (!productsBySTT[stt]) {
                        productsBySTT[stt] = [];
                    }
                    productsBySTT[stt].push({
                        productId: assignment.productId,
                        productCode: assignment.productCode,
                        productName: assignment.productName,
                        imageUrl: assignment.imageUrl,
                        note: assignment.note || '',
                        sessionIndexes: assignment.sttList
                    });
                });
            });
        }

        const uploadResultsMap = {};
        if (record.uploadResults) {
            record.uploadResults.forEach(result => {
                uploadResultsMap[result.stt] = result;
            });
        }

        html += '<h6 class="mb-3"><i class="fas fa-shopping-cart"></i> Chi Tiết Từng Giỏ Hàng</h6>';

        const sortedSTTs = Object.keys(productsBySTT).sort((a, b) => Number(a) - Number(b));

        if (sortedSTTs.length === 0) {
            html += `
                <div class="alert alert-warning" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    Không có dữ liệu products trong beforeSnapshot
                </div>
            `;
        } else {
            sortedSTTs.forEach(stt => {
                const products = productsBySTT[stt];
                const uploadResult = uploadResultsMap[stt];

                let cardClass = 'border-secondary';
                let headerClass = 'bg-secondary';
                let resultBadge = '';

                if (uploadResult) {
                    if (uploadResult.success) {
                        cardClass = 'border-success';
                        headerClass = 'bg-success';
                        resultBadge = `<span class="badge bg-success ms-2">✅ Upload thành công → Order #${uploadResult.orderId}</span>`;
                    } else {
                        cardClass = 'border-danger';
                        headerClass = 'bg-danger';
                        resultBadge = `<span class="badge bg-danger ms-2">❌ Upload thất bại</span>`;
                    }
                }

                const productCounts = {};
                products.forEach(product => {
                    const key = product.productId;
                    if (!productCounts[key]) {
                        productCounts[key] = { ...product, count: 0 };
                    }
                    productCounts[key].count++;
                });

                html += `
                    <div class="card mb-3 ${cardClass}">
                        <div class="card-header ${headerClass} text-white">
                            <h6 class="mb-0">
                                <i class="fas fa-hashtag"></i> STT ${stt}
                                ${resultBadge}
                            </h6>
                        </div>
                        <div class="card-body">
                            <h6 class="text-primary mb-3">
                                <i class="fas fa-box"></i> Sản phẩm đã upload (${Object.keys(productCounts).length})
                            </h6>
                            <table class="table table-sm table-bordered">
                                <thead class="table-light">
                                    <tr>
                                        <th style="width: 40%;">Sản phẩm</th>
                                        <th class="text-center" style="width: 12%;">Số lượng</th>
                                        <th class="text-center" style="width: 25%;">Mã đơn hàng</th>
                                        <th style="width: 23%;">Note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.values(productCounts).map(product => `
                                        <tr>
                                            <td>
                                                <div class="d-flex align-items-center gap-2">
                                                    ${product.imageUrl
                        ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                        : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 20px;">📦</div>'}
                                                    <div>
                                                        <div style="font-weight: 600; font-size: 14px;">${product.productName}</div>
                                                        <div style="font-size: 12px; color: #6b7280;">${product.productCode || 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td class="text-center">
                                                <span class="badge bg-primary">${product.count}</span>
                                            </td>
                                            <td class="text-center">
                                                <span class="text-muted" style="font-size: 13px;">
                                                    ${(product.sessionIndexes || []).map(item => typeof item === 'object' ? item.stt : item).join(', ') || 'N/A'}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="text-muted" style="font-size: 13px;">${product.note || '(Không có ghi chú)'}</span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>

                            ${uploadResult && !uploadResult.success && uploadResult.error ? `
                                <div class="alert alert-danger mt-3 mb-0" role="alert">
                                    <strong><i class="fas fa-exclamation-circle"></i> Lỗi:</strong> ${uploadResult.error}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
        }

        if (record.note) {
            html += `
                <div class="history-note mt-3">
                    <i class="fas fa-sticky-note"></i>
                    <strong>Ghi chú:</strong> ${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(record.note) : record.note}
                </div>
            `;
        }

        return html;
    }

    // =====================================================
    // COMPARE CART HISTORY
    // =====================================================

    window.compareCartHistory = async function (uploadId) {
        console.log('[HISTORY-COMPARE] Comparing cart for uploadId:', uploadId);

        try {
            const compareModal = new bootstrap.Modal(document.getElementById('compareCartHistoryModal'));
            compareModal.show();

            const modalBody = document.getElementById('compareCartHistoryModalBody');
            modalBody.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-2">Đang tải dữ liệu so sánh...</p>
                </div>
            `;

            const historyPath = state.userStorageManager
                ? state.userStorageManager.getUserFirebasePath('productAssignments_history')
                : 'productAssignments_history/guest';
            const snapshot = await database.ref(`${historyPath}/${uploadId}`).once('value');
            const record = snapshot.val();

            if (!record || !record.beforeSnapshot) {
                throw new Error('Không tìm thấy dữ liệu snapshot');
            }

            console.log('[HISTORY-COMPARE] Loaded record:', record);

            modalBody.innerHTML = window._tab3.fn.renderComparisonContent(record);

        } catch (error) {
            console.error('[HISTORY-COMPARE] Error:', error);
            ui.showNotification('Lỗi khi tải dữ liệu so sánh', 'error');

            const modalBody = document.getElementById('compareCartHistoryModalBody');
            modalBody.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Lỗi:</strong> ${error.message}
                </div>
            `;
        }
    };

    // =====================================================
    // RENDER COMPARISON CONTENT (shared by V1 and V2)
    // =====================================================

    function renderComparisonContent(record) {
        const beforeSnapshot = record.beforeSnapshot;
        const uploadResults = record.uploadResults || [];

        const uploadResultsMap = {};
        uploadResults.forEach(result => {
            uploadResultsMap[result.stt] = result;
        });

        const productsBySTT = {};

        if (beforeSnapshot && beforeSnapshot.assignments) {
            beforeSnapshot.assignments.forEach(assignment => {
                if (!assignment.sttList || !Array.isArray(assignment.sttList)) return;

                assignment.sttList.forEach(sttItem => {
                    const stt = typeof sttItem === 'object' ? sttItem.stt : sttItem;

                    if (!productsBySTT[stt]) {
                        productsBySTT[stt] = {
                            assignedProducts: [],
                            orderInfo: typeof sttItem === 'object' ? sttItem.orderInfo : null
                        };
                    }

                    productsBySTT[stt].assignedProducts.push({
                        productId: assignment.productId,
                        productName: assignment.productName,
                        productCode: assignment.productCode,
                        imageUrl: assignment.imageUrl,
                        note: assignment.note || ''
                    });
                });
            });
        }

        let html = '';
        const sortedSTTs = Object.keys(productsBySTT).sort((a, b) => Number(a) - Number(b));

        sortedSTTs.forEach(stt => {
            const data = productsBySTT[stt];
            const uploadResult = uploadResultsMap[stt];

            const assignedProductCounts = {};
            data.assignedProducts.forEach(product => {
                const key = product.productId;
                if (!assignedProductCounts[key]) {
                    assignedProductCounts[key] = { ...product, count: 0 };
                }
                assignedProductCounts[key].count++;
            });

            const existingProducts = uploadResult?.existingProducts || [];

            const existingProductsMap = {};
            existingProducts.forEach(product => {
                if (product.productId) {
                    existingProductsMap[product.productId] = product;
                }
            });

            Object.values(assignedProductCounts).forEach(product => {
                product.isExisting = !!existingProductsMap[product.productId];
            });

            let statusBadge = '';
            let cardClass = '';
            if (uploadResult) {
                if (uploadResult.success) {
                    statusBadge = `<span class="badge bg-success ms-2">✅ Upload thành công</span>`;
                    cardClass = 'border-success';
                } else {
                    statusBadge = `<span class="badge bg-danger ms-2">❌ Upload thất bại</span>`;
                    cardClass = 'border-danger';
                }
            }

            const formatNote = window._tab3.fn.formatNoteWithClickableEncoded || ((n) => n || '<span class="text-muted">(Không có)</span>');

            html += `
                <div class="card mb-4 ${cardClass}">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0">
                            <i class="fas fa-hashtag"></i> STT ${stt}
                            ${data.orderInfo?.customerName ? `- ${data.orderInfo.customerName}` : ''}
                            ${statusBadge}
                        </h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="text-success">
                                    <i class="fas fa-plus-circle"></i> Sản phẩm đã upload (${Object.keys(assignedProductCounts).length})
                                </h6>
                                <table class="table table-sm table-bordered">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th class="text-center">SL</th>
                                            <th>Note</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${Object.values(assignedProductCounts).map(product => {
                const sBadge = product.isExisting
                    ? '<span class="badge bg-warning text-dark ms-2" title="Sản phẩm đã có trong đơn, đã cộng thêm số lượng"><i class="fas fa-plus"></i> Cộng SL</span>'
                    : '<span class="badge bg-success ms-2" title="Sản phẩm mới đã được thêm vào đơn"><i class="fas fa-star"></i> Mới</span>';

                return `
                                            <tr class="${product.isExisting ? 'table-warning' : 'table-success'}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${product.imageUrl
                        ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                        : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                        <div style="flex: 1;">
                                                            <div style="font-weight: 600; font-size: 14px;">${product.productName}</div>
                                                            <div style="font-size: 12px; color: #6b7280;">
                                                                ${product.productCode || 'N/A'}
                                                                ${sBadge}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center">
                                                    <span class="badge ${product.isExisting ? 'bg-warning text-dark' : 'bg-success'}">${product.count}</span>
                                                </td>
                                                <td>
                                                    ${formatNote(product.note)}
                                                </td>
                                            </tr>
                                        `}).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <div class="col-md-6">
                                <h6 class="text-info">
                                    <i class="fas fa-box"></i> Sản phẩm có sẵn trong đơn (${existingProducts.length})
                                </h6>
                                ${existingProducts.length > 0 ? `
                                    <table class="table table-sm table-bordered">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Sản phẩm</th>
                                                <th class="text-center">SL</th>
                                                <th class="text-end">Giá</th>
                                                <th>Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${existingProducts.map(product => {
                            const willBeUpdated = !!assignedProductCounts[product.productId];
                            const updateBadge = willBeUpdated
                                ? '<span class="badge bg-warning text-dark ms-1" title="Sản phẩm này đã được cộng thêm số lượng"><i class="fas fa-arrow-up"></i></span>'
                                : '';

                            return `
                                                <tr class="${willBeUpdated ? 'table-warning' : ''}">
                                                    <td>
                                                        <div class="d-flex align-items-center gap-2">
                                                            ${product.imageUrl
                                    ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                                    : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                            <div style="flex: 1;">
                                                                <div style="font-weight: 600; font-size: 14px;">${product.nameGet || product.name || 'N/A'}</div>
                                                                <div style="font-size: 12px; color: #6b7280;">${product.code || 'N/A'}${updateBadge}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="badge bg-info">${product.quantity}</span>
                                                    </td>
                                                    <td class="text-end">
                                                        <span style="font-weight: 600; color: #3b82f6;">${(product.price || 0).toLocaleString('vi-VN')}đ</span>
                                                    </td>
                                                    <td>
                                                        ${formatNote(product.note)}
                                                    </td>
                                                </tr>
                                            `}).join('')}
                                        </tbody>
                                    </table>
                                ` : `
                                    <div class="text-center text-muted py-3 border rounded">
                                        <i class="fas fa-inbox fa-2x mb-2"></i>
                                        <p class="mb-0">Không có sản phẩm có sẵn</p>
                                        <small>(Tất cả sản phẩm đều là mới)</small>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        if (sortedSTTs.length === 0) {
            html = `
                <div class="alert alert-warning" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Không có dữ liệu để hiển thị</strong>
                    <p class="mb-0 mt-2">Bản ghi lịch sử này không chứa thông tin sản phẩm.</p>
                </div>
            `;
        }

        return html;
    }

    // =====================================================
    // HELPER: formatNoteWithClickableEncoded
    // =====================================================

    function formatNoteWithClickableEncoded(note) {
        if (!note) return '<span class="text-muted">(Không có)</span>';

        const encodedPattern = /([A-Z0-9]{40,})/g;
        const parts = note.split(encodedPattern);

        return parts.map(part => {
            if (part.match(encodedPattern)) {
                return `<span class="encoded-string-clickable badge bg-secondary"
                            data-encoded="${part}"
                            style="cursor: pointer; font-size: 0.75rem;"
                            title="Click to decode">
                            Encoded (${part.length} chars)
                        </span>`;
            } else {
                return part;
            }
        }).join('');
    }

    // =====================================================
    // EXPOSE FUNCTIONS
    // =====================================================

    window._tab3.fn.renderComparisonContent = renderComparisonContent;
    window._tab3.fn.formatNoteWithClickableEncoded = formatNoteWithClickableEncoded;

})();
