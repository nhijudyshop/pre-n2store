/**
 * TAB3-UPLOAD.JS
 * Upload table views, preview, upload execution, finalize session.
 *
 * Load order: tab3-upload.js (6th, after tab3-export.js)
 * Depends on: window._tab3 (from tab3-core.js)
 */
(function () {
    'use strict';

    const { state, utils, auth, noteEncoding, ui, data: dataFns } = window._tab3;
    const database = window._tab3.database;

    // =====================================================
    // UPLOAD STATE
    // =====================================================

    let uploadData = {};
    let selectedSTTs = new Set();
    let currentViewMode = 'product'; // 'order' or 'product'

    // =====================================================
    // BUILD UPLOAD DATA
    // =====================================================

    function buildUploadData() {
        const data = {};

        state.assignments.forEach(assignment => {
            if (!assignment.sttList || assignment.sttList.length === 0) return;

            assignment.sttList.forEach(sttItem => {
                const stt = typeof sttItem === 'object' ? sttItem.stt : sttItem;
                const orderInfo = typeof sttItem === 'object' ? sttItem.orderInfo : null;

                if (!data[stt]) {
                    data[stt] = {
                        stt: stt,
                        orderInfo: orderInfo,
                        products: []
                    };
                }

                const existingProduct = data[stt].products.find(p => p.productId === assignment.productId);
                if (existingProduct) {
                    existingProduct.quantity++;
                } else {
                    data[stt].products.push({
                        productId: assignment.productId,
                        productName: assignment.productName,
                        productCode: assignment.productCode,
                        imageUrl: assignment.imageUrl,
                        quantity: 1
                    });
                }
            });
        });

        return data;
    }

    // =====================================================
    // RENDER UPLOAD TABLE
    // =====================================================

    function renderUploadTable() {
        uploadData = buildUploadData();

        if (currentViewMode === 'order') {
            renderByOrderView();
        } else {
            renderByProductView();
        }

        updateUploadStats();
        updateUploadButtons();
    }

    function renderByOrderView() {
        const thead = document.getElementById('uploadTableHead');
        const tbody = document.getElementById('uploadTableBody');

        thead.innerHTML = `
            <tr>
                <th class="checkbox-cell"><input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()"></th>
                <th>STT</th>
                <th>Khách hàng</th>
                <th>Sản phẩm</th>
                <th>Số lượng</th>
            </tr>
        `;

        const sttKeys = Object.keys(uploadData).sort((a, b) => Number(a) - Number(b));

        if (sttKeys.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        Chưa có sản phẩm nào để upload. Hãy gán sản phẩm ở bảng trên.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sttKeys.map(stt => {
            const data = uploadData[stt];
            const isSelected = selectedSTTs.has(stt);
            const customerName = data.orderInfo?.customerName || 'N/A';
            const totalQuantity = data.products.reduce((sum, p) => sum + p.quantity, 0);
            const productsList = data.products.map(p => `${p.productName} (x${p.quantity})`).join(', ');

            return `
                <tr class="${isSelected ? 'table-success' : ''}">
                    <td class="checkbox-cell">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSTTSelection('${stt}')">
                    </td>
                    <td><span class="stt-badge">${stt}</span></td>
                    <td>${customerName}</td>
                    <td><small>${productsList}</small></td>
                    <td><span class="product-count-badge"><i class="fas fa-box"></i> ${totalQuantity}</span></td>
                </tr>
            `;
        }).join('');
    }

    function renderByProductView() {
        const thead = document.getElementById('uploadTableHead');
        const tbody = document.getElementById('uploadTableBody');

        thead.innerHTML = `
            <tr>
                <th class="checkbox-cell"><input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()"></th>
                <th>Sản phẩm</th>
                <th>Mã SP</th>
                <th>STT Đơn Hàng</th>
                <th>Tổng SL</th>
            </tr>
        `;

        const byProduct = {};
        Object.entries(uploadData).forEach(([stt, data]) => {
            data.products.forEach(product => {
                const key = product.productId;
                if (!byProduct[key]) {
                    byProduct[key] = {
                        ...product,
                        stts: [],
                        totalQuantity: 0
                    };
                }
                byProduct[key].stts.push(stt);
                byProduct[key].totalQuantity += product.quantity;
            });
        });

        const products = Object.values(byProduct);

        if (products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        Chưa có sản phẩm nào để upload. Hãy gán sản phẩm ở bảng trên.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = products.map(product => {
            const allSelected = product.stts.every(stt => selectedSTTs.has(stt));
            const someSelected = product.stts.some(stt => selectedSTTs.has(stt));
            const isIndeterminate = someSelected && !allSelected;

            const imageHtml = product.imageUrl
                ? `<img src="${product.imageUrl}" class="upload-product-image">`
                : `<div class="upload-product-image no-image">📦</div>`;

            return `
                <tr class="${allSelected ? 'table-success' : ''}">
                    <td class="checkbox-cell">
                        <input type="checkbox" ${allSelected ? 'checked' : ''} ${isIndeterminate ? 'indeterminate' : ''}
                               onchange="toggleProductSelection('${product.productId}')">
                    </td>
                    <td>
                        <div class="upload-product-cell">
                            ${imageHtml}
                            <div>
                                <div class="upload-product-name">${product.productName}</div>
                                <div class="upload-product-code">${product.productCode || 'N/A'}</div>
                            </div>
                        </div>
                    </td>
                    <td>${product.productCode || 'N/A'}</td>
                    <td><small>${product.stts.join(', ')}</small></td>
                    <td><span class="product-count-badge"><i class="fas fa-box"></i> ${product.totalQuantity}</span></td>
                </tr>
            `;
        }).join('');

        setTimeout(() => {
            products.forEach(product => {
                const allSelected = product.stts.every(stt => selectedSTTs.has(stt));
                const someSelected = product.stts.some(stt => selectedSTTs.has(stt));
                if (someSelected && !allSelected) {
                    const checkbox = document.querySelector(`input[onchange*="toggleProductSelection('${product.productId}')"]`);
                    if (checkbox) checkbox.indeterminate = true;
                }
            });
        }, 0);
    }

    // =====================================================
    // UPLOAD STATS & BUTTONS
    // =====================================================

    function updateUploadStats() {
        const totalSTTs = Object.keys(uploadData).length;
        let totalProducts = 0;
        let totalItems = 0;

        Object.values(uploadData).forEach(data => {
            totalProducts += data.products.length;
            totalItems += data.products.reduce((sum, p) => sum + p.quantity, 0);
        });

        document.getElementById('totalOrders').textContent = totalSTTs;
        document.getElementById('totalProducts').textContent = totalProducts;
        document.getElementById('selectedCount').textContent = selectedSTTs.size;
        document.getElementById('totalItems').textContent = totalItems;
    }

    function updateUploadButtons() {
        const hasSelection = selectedSTTs.size > 0;
        document.getElementById('previewUploadBtn').disabled = !hasSelection;
    }

    // =====================================================
    // SELECTION HANDLERS (window globals)
    // =====================================================

    window.switchViewMode = function (mode) {
        currentViewMode = mode;
        document.getElementById('viewByOrderBtn').classList.toggle('active', mode === 'order');
        document.getElementById('viewByProductBtn').classList.toggle('active', mode === 'product');
        renderUploadTable();
    };

    window.toggleSelectAll = function () {
        const checkbox = document.getElementById('selectAllCheckbox');
        const allSTTs = Object.keys(uploadData);

        if (checkbox.checked) {
            allSTTs.forEach(stt => selectedSTTs.add(stt));
        } else {
            selectedSTTs.clear();
        }
        renderUploadTable();
    };

    window.selectAllUpload = function () {
        const allSTTs = Object.keys(uploadData);
        allSTTs.forEach(stt => selectedSTTs.add(stt));
        renderUploadTable();
    };

    window.deselectAllUpload = function () {
        selectedSTTs.clear();
        renderUploadTable();
    };

    window.toggleSTTSelection = function (stt) {
        if (selectedSTTs.has(stt)) {
            selectedSTTs.delete(stt);
        } else {
            selectedSTTs.add(stt);
        }
        renderUploadTable();
    };

    window.toggleProductSelection = function (productId) {
        const sttsWithProduct = [];
        Object.entries(uploadData).forEach(([stt, data]) => {
            if (data.products.some(p => p.productId === productId)) {
                sttsWithProduct.push(stt);
            }
        });

        const allSelected = sttsWithProduct.every(stt => selectedSTTs.has(stt));

        if (allSelected) {
            sttsWithProduct.forEach(stt => selectedSTTs.delete(stt));
        } else {
            sttsWithProduct.forEach(stt => selectedSTTs.add(stt));
        }
        renderUploadTable();
    };

    window.viewSTTDetail = function (stt) {
        const data = uploadData[stt];
        if (!data) return;
        alert(`STT ${stt}\nKhách hàng: ${data.orderInfo?.customerName || 'N/A'}\n\nSản phẩm:\n${data.products.map(p => `- ${p.productName} (x${p.quantity})`).join('\n')}`);
    };

    window.viewProductSTTs = function (productId) {
        const stts = [];
        Object.entries(uploadData).forEach(([stt, data]) => {
            if (data.products.some(p => p.productId === productId)) {
                stts.push(stt);
            }
        });
        alert(`Sản phẩm này có trong các STT:\n${stts.join(', ')}`);
    };

    // =====================================================
    // REFRESH UPLOAD SECTION
    // =====================================================

    function refreshUploadSection() {
        renderUploadTable();
    }

    // Hook into renderAssignmentTable to refresh upload section
    const _origRender = window._tab3.fn.renderAssignmentTable;
    window._tab3.fn.renderAssignmentTable = function () {
        _origRender();
        refreshUploadSection();
    };

    // Initialize upload section on load
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            refreshUploadSection();
        }, 1000);
    });

    // =====================================================
    // HELPER: filterNonEncodedNotes
    // =====================================================

    function filterNonEncodedNotes(note) {
        if (!note) return '';
        let cleaned = note.replace(/\[\"[A-Za-z0-9\-_]+\"\]/g, '');
        cleaned = cleaned.replace(/[A-Z0-9]{40,}/g, '');
        return cleaned.trim();
    }

    // =====================================================
    // PREVIEW & UPLOAD FUNCTIONS
    // =====================================================

    window.previewUpload = async function () {
        if (selectedSTTs.size === 0) {
            ui.showNotification('Vui lòng chọn ít nhất 1 STT để upload', 'error');
            return;
        }

        console.log('[PREVIEW] Opening preview modal for', selectedSTTs.size, 'STTs');

        const modal = new bootstrap.Modal(document.getElementById('previewModal'));
        modal.show();

        const modalBody = document.getElementById('previewModalBody');
        modalBody.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-info"></div><p class="text-muted mt-2">Đang tải preview...</p></div>';

        try {
            const html = await renderPreviewContent(Array.from(selectedSTTs));
            modalBody.innerHTML = html;
        } catch (error) {
            console.error('[PREVIEW] Error:', error);
            modalBody.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> Lỗi: ${error.message}</div>`;
        }
    };

    window.updateProductNote = function (noteKey, value) {
        state.productNotes[noteKey] = value;
        console.log(`Updated note for ${noteKey}:`, value);
    };

    async function renderPreviewContent(stts) {
        const sttProductsData = {};
        for (const stt of stts) {
            const data = uploadData[stt];
            if (!data) continue;

            let existingProducts = [];
            if (data.orderInfo?.orderId) {
                try {
                    existingProducts = await fetchExistingOrderProducts(data.orderInfo.orderId);
                } catch (error) {
                    console.warn(`Failed to fetch existing products for order ${data.orderInfo.orderId}`);
                }
            }

            sttProductsData[stt] = {
                data: data,
                existingProducts: existingProducts
            };
        }

        const sttsWithExistingProducts = [];

        Object.keys(sttProductsData).forEach(stt => {
            const { data, existingProducts } = sttProductsData[stt];
            const existingProductsMap = {};
            existingProducts.forEach(p => {
                if (p.productId) existingProductsMap[p.productId] = p;
            });

            const existingProductsInOrder = [];
            data.products.forEach(product => {
                if (existingProductsMap[product.productId]) {
                    const existing = existingProductsInOrder.find(p => p.code === product.productCode);
                    if (existing) {
                        existing.quantity += 1;
                    } else {
                        existingProductsInOrder.push({
                            code: product.productCode,
                            quantity: 1,
                            currentQuantity: existingProductsMap[product.productId].quantity
                        });
                    }
                }
            });

            if (existingProductsInOrder.length > 0) {
                sttsWithExistingProducts.push({
                    stt: stt,
                    products: existingProductsInOrder
                });
            }
        });

        let html = '';

        if (sttsWithExistingProducts.length > 0) {
            html += `
                <div class="alert alert-warning mb-4" role="alert">
                    <h6 class="alert-heading mb-3">
                        <i class="fas fa-info-circle"></i> Các STT có mã sản phẩm sắp upload đã có sẵn trong đơn hàng
                    </h6>
                    <div class="small">
                        ${sttsWithExistingProducts.map(item => `
                            <div class="mb-2">
                                <strong>STT ${item.stt}:</strong>
                                ${item.products.map(p => `${p.code} +${p.quantity}`).join(', ')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        for (const stt of stts.sort((a, b) => Number(a) - Number(b))) {
            const sttData = sttProductsData[stt];
            if (!sttData) continue;

            const { data, existingProducts } = sttData;

            const existingProductsMap = {};
            existingProducts.forEach(p => {
                if (p.productId) existingProductsMap[p.productId] = p;
            });

            const productsWithStatus = data.products.map(p => ({
                ...p,
                isExisting: !!existingProductsMap[p.productId]
            }));

            existingProducts.forEach(p => {
                const noteKey = `${stt}-${p.productId}`;
                if (p.note && !state.productNotes[noteKey]) {
                    state.productNotes[noteKey] = p.note;
                }
            });

            html += `
                <div class="card mb-3">
                    <div class="card-header bg-primary text-white">
                        <h6 class="mb-0"><i class="fas fa-hashtag"></i> STT ${stt} ${data.orderInfo?.customerName ? ` - ${data.orderInfo.customerName}` : ''}</h6>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6 class="text-success"><i class="fas fa-plus-circle"></i> Sản phẩm sẽ upload (${productsWithStatus.length})</h6>
                                <table class="table table-sm table-bordered">
                                    <thead>
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th class="text-center">SL</th>
                                            <th style="width: 150px;">Note</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${productsWithStatus.map(p => {
                const noteKey = `${stt}-${p.productId}`;
                if (!state.productNotes[noteKey]) {
                    state.productNotes[noteKey] = 'live';
                }
                const existingNote = filterNonEncodedNotes(state.productNotes[noteKey] || '');
                return `
                                            <tr class="${p.isExisting ? 'table-warning' : 'table-success'}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:40px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;">📦</div>'}
                                                        <div>
                                                            <div style="font-weight:600;">${p.productName}</div>
                                                            <div style="font-size:12px;color:#6b7280;">${p.productCode || 'N/A'} ${p.isExisting ? '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-plus"></i> Cộng SL</span>' : '<span class="badge bg-success ms-2"><i class="fas fa-star"></i> Mới</span>'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center"><span class="badge ${p.isExisting ? 'bg-warning text-dark' : 'bg-success'}">${p.quantity}</span></td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        class="form-control form-control-sm"
                                                        placeholder="Ghi chú..."
                                                        value="${existingNote}"
                                                        data-note-key="${noteKey}"
                                                        onchange="updateProductNote('${noteKey}', this.value)"
                                                    />
                                                </td>
                                            </tr>
                                        `}).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-info"><i class="fas fa-box"></i> Sản phẩm có sẵn trong đơn (${existingProducts.length})</h6>
                                ${existingProducts.length > 0 ? `
                                    <table class="table table-sm table-bordered">
                                        <thead>
                                            <tr>
                                                <th>Sản phẩm</th>
                                                <th class="text-center">SL</th>
                                                <th class="text-end">Giá</th>
                                                <th style="width: 130px;">Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${existingProducts.map(p => {
                    const willBeUpdated = productsWithStatus.some(ap => ap.productId === p.productId);
                    const noteKey = `${stt}-${p.productId}`;
                    const rawNote = state.productNotes[noteKey] || p.note || '';
                    const existingNote = filterNonEncodedNotes(rawNote);
                    return `
                                                    <tr class="${willBeUpdated ? 'table-warning' : ''}">
                                                        <td>
                                                            <div class="d-flex align-items-center gap-2">
                                                                ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:40px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;">📦</div>'}
                                                                <div>
                                                                    <div style="font-weight:600;">${p.nameGet || p.name || 'N/A'}</div>
                                                                    <div style="font-size:12px;color:#6b7280;">${p.code || 'N/A'}${willBeUpdated ? '<span class="badge bg-warning text-dark ms-1"><i class="fas fa-arrow-up"></i></span>' : ''}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td class="text-center"><span class="badge bg-info">${p.quantity}</span></td>
                                                        <td class="text-end">
                                                            <span style="font-weight:600;color:#3b82f6;">${(p.price || 0).toLocaleString('vi-VN')}đ</span>
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                class="form-control form-control-sm"
                                                                placeholder="Ghi chú..."
                                                                value="${existingNote}"
                                                                data-note-key="${noteKey}"
                                                                onchange="updateProductNote('${noteKey}', this.value)"
                                                            />
                                                        </td>
                                                    </tr>
                                                `;
                }).join('')}
                                        </tbody>
                                    </table>
                                ` : '<div class="text-center text-muted py-3 border rounded"><i class="fas fa-inbox fa-2x mb-2"></i><p class="mb-0">Không có sản phẩm có sẵn</p><small>(Tất cả sản phẩm đều là mới)</small></div>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        return html || '<div class="alert alert-warning">Không có dữ liệu</div>';
    }

    // =====================================================
    // FETCH EXISTING ORDER PRODUCTS
    // =====================================================

    async function fetchExistingOrderProducts(orderId) {
        try {
            const apiUrl = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product)`;
            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                }
            });

            if (!response.ok) throw new Error('Failed to fetch order');
            const order = await response.json();

            return (order.Details || []).map(detail => ({
                productId: detail.Product?.Id || detail.ProductId,
                nameGet: detail.Product?.NameGet || detail.ProductName || 'N/A',
                code: detail.Product?.DefaultCode || detail.ProductCode || '',
                quantity: detail.Quantity || 0,
                price: detail.Price || 0,
                imageUrl: detail.Product?.ImageUrl || '',
                note: detail.Note || ''
            }));
        } catch (error) {
            console.error('[FETCH-ORDER] Error:', error);
            return [];
        }
    }

    // =====================================================
    // CONFIRM & UPLOAD TO TPOS
    // =====================================================

    window.confirmUpload = function () {
        const previewModal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
        if (previewModal) previewModal.hide();
        uploadToTPOS();
    };

    window.uploadToTPOS = async function () {
        if (selectedSTTs.size === 0) {
            ui.showNotification('Vui lòng chọn ít nhất 1 STT để upload', 'error');
            return;
        }

        if (!confirm(`Bạn có chắc muốn upload ${selectedSTTs.size} STT lên TPOS?`)) return;

        try {
            const uploadId = `upload_${Date.now()}`;
            await createBackupBeforeUpload(uploadId, Array.from(selectedSTTs));

            const results = [];
            for (const stt of Array.from(selectedSTTs).sort((a, b) => Number(a) - Number(b))) {
                const result = await uploadSingleSTT(stt);
                results.push(result);
            }

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            const status = failCount === 0 ? 'completed' : (successCount > 0 ? 'partial' : 'failed');

            await saveToUploadHistory(uploadId, results, status);

            const successfulSTTs = results.filter(r => r.success).map(r => r.stt);
            if (successfulSTTs.length > 0) {
                await removeUploadedSTTsFromAssignments(successfulSTTs);
            }

            selectedSTTs.clear();
            renderUploadTable();

            if (status === 'completed') {
                ui.showNotification(`Upload thành công ${successCount} STT và đã xóa khỏi danh sách gán`);
            } else if (status === 'partial') {
                ui.showNotification(`Upload thành công ${successCount} STT, thất bại ${failCount} STT`, 'error');
            } else {
                ui.showNotification(`Upload thất bại ${failCount} STT`, 'error');
            }
        } catch (error) {
            console.error('[UPLOAD] Error:', error);
            ui.showNotification('Lỗi: ' + error.message, 'error');
        }
    };

    // =====================================================
    // UPLOAD SINGLE STT
    // =====================================================

    async function uploadSingleSTT(stt) {
        try {
            const sessionData = uploadData[stt];
            if (!sessionData) throw new Error('STT data not found');

            const orderId = sessionData.orderInfo?.orderId;
            if (!orderId) throw new Error('No order ID for this STT');

            console.log(`[UPLOAD] Fetching order ${orderId} for STT ${stt}...`);

            const apiUrl = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;
            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch order ${orderId}: ${response.status}`);
            }

            const orderData = await response.json();
            console.log(`[UPLOAD] Fetched order data for STT ${stt}`);

            const existingProducts = (orderData.Details || []).map(detail => ({
                productId: detail.Product?.Id || detail.ProductId,
                nameGet: detail.Product?.NameGet || detail.ProductNameGet || detail.ProductName || 'N/A',
                name: detail.Product?.Name || detail.ProductName || 'N/A',
                code: detail.Product?.DefaultCode || detail.ProductCode || '',
                quantity: detail.Quantity || 0,
                price: detail.Price || 0,
                imageUrl: detail.Product?.ImageUrl || detail.ImageUrl || '',
                note: detail.Note || ''
            }));

            const mergedDetails = await prepareUploadDetails(orderData, sessionData, stt);
            orderData.Details = mergedDetails;

            let totalQty = 0;
            let totalAmount = 0;
            orderData.Details.forEach(detail => {
                totalQty += detail.Quantity || 0;
                totalAmount += (detail.Quantity || 0) * (detail.Price || 0);
            });
            orderData.TotalQuantity = totalQty;
            orderData.TotalAmount = totalAmount;

            const productsForNote = [];
            const priceByProductId = {};
            mergedDetails.forEach(detail => {
                const pid = detail.ProductId || detail.Product?.Id;
                if (pid) {
                    priceByProductId[pid] = detail.Price || 0;
                }
            });

            sessionData.products.forEach(p => {
                const price = priceByProductId[p.productId] || 0;
                productsForNote.push({
                    productCode: p.productCode || p.productName || 'N/A',
                    quantity: p.quantity || 1,
                    price: price
                });
            });

            if (productsForNote.length > 0) {
                console.log(`[UPLOAD] Encoding ${productsForNote.length} products into order note...`);
                const currentNote = orderData.Note || '';
                const encodedNote = noteEncoding.processNoteForUpload(currentNote, productsForNote);
                orderData.Note = encodedNote;
                console.log(`[UPLOAD] Order note updated with encoded products`);
            }

            const payload = prepareUploadPayload(orderData);

            console.log(`[UPLOAD] Uploading order ${orderId}...`);

            const uploadHeaders = await window.tokenManager.getAuthHeader();
            const uploadResponse = await fetch(
                `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})`,
                {
                    method: "PUT",
                    headers: {
                        ...uploadHeaders,
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
            }

            console.log(`[UPLOAD] Successfully uploaded STT ${stt}`);
            return {
                stt: stt,
                success: true,
                orderId: orderId,
                error: null,
                existingProducts: existingProducts
            };

        } catch (error) {
            console.error(`[UPLOAD] Error uploading STT ${stt}:`, error);
            return {
                stt: stt,
                success: false,
                orderId: null,
                error: error.message,
                existingProducts: []
            };
        }
    }

    // =====================================================
    // PREPARE UPLOAD DETAILS
    // =====================================================

    async function prepareUploadDetails(orderData, sessionData, stt) {
        const existingDetails = orderData.Details || [];

        const existingByProductId = {};
        existingDetails.forEach(detail => {
            const pid = detail.Product?.Id || detail.ProductId;
            if (pid) existingByProductId[pid] = detail;
        });

        const assignedByProductId = {};
        sessionData.products.forEach(p => {
            const pid = p.productId;
            if (!assignedByProductId[pid]) {
                assignedByProductId[pid] = { count: 0, productCode: p.productCode, imageUrl: p.imageUrl };
            }
            assignedByProductId[pid].count += p.quantity;
        });

        const mergedDetails = [...existingDetails];

        mergedDetails.forEach(detail => {
            const pid = detail.Product?.Id || detail.ProductId;
            const noteKey = `${stt}-${pid}`;
            if (state.productNotes[noteKey] !== undefined) {
                detail.Note = state.productNotes[noteKey] || '';
                console.log(`   Updated note for ${detail.ProductCode || pid}: "${detail.Note}"`);
            }
        });

        for (const productId of Object.keys(assignedByProductId)) {
            const assignedData = assignedByProductId[productId];
            const existingDetail = existingByProductId[productId];

            const noteKey = `${stt}-${productId}`;
            const noteValue = state.productNotes[noteKey] || 'live';

            if (existingDetail) {
                const oldQty = existingDetail.Quantity || 0;
                existingDetail.Quantity = oldQty + assignedData.count;
                existingDetail.Note = noteValue;
                console.log(`   Updated ${existingDetail.ProductCode || productId}: ${oldQty} -> ${existingDetail.Quantity}, note: "${noteValue}"`);
            } else {
                console.log(`   Adding new product: ${productId} x${assignedData.count}`);

                const fullProduct = await fetchProductDetails(productId);
                if (!fullProduct) {
                    console.error(`   Cannot fetch product ${productId}, skipping...`);
                    continue;
                }

                const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;
                if (salePrice == null || salePrice < 0) {
                    console.error(`   Product "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) has no sale price.`);
                    throw new Error(`Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán.`);
                }

                const newProduct = {
                    ProductId: fullProduct.Id,
                    Quantity: assignedData.count,
                    Price: salePrice,
                    Note: noteValue,
                    UOMId: fullProduct.UOM?.Id || 1,
                    Factor: 1,
                    Priority: 0,
                    OrderId: orderData.Id,
                    LiveCampaign_DetailId: null,
                    ProductWeight: 0,
                    ProductName: fullProduct.Name || fullProduct.NameTemplate,
                    ProductNameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                    ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                    UOMName: fullProduct.UOM?.Name || "Cái",
                    ImageUrl: fullProduct.ImageUrl || assignedData.imageUrl,
                    IsOrderPriority: null,
                    QuantityRegex: null,
                    IsDisabledLiveCampaignDetail: false,
                    CreatedById: orderData.UserId || orderData.CreatedById,
                };

                mergedDetails.push(newProduct);
                console.log(`   Added new product with note: "${noteValue}"`);
            }
        }

        return mergedDetails;
    }

    async function fetchProductDetails(productId) {
        try {
            const apiUrl = `${API_CONFIG.WORKER_URL}/api/odata/Product(${productId})?$expand=UOM`;
            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                }
            });

            if (!response.ok) {
                console.error(`Failed to fetch product ${productId}: ${response.status}`);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error(`Error fetching product ${productId}:`, error);
            return null;
        }
    }

    function prepareUploadPayload(orderData) {
        const payload = JSON.parse(JSON.stringify(orderData));

        if (!payload['@odata.context']) {
            payload['@odata.context'] = 'http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity';
        }

        if (payload.Details && Array.isArray(payload.Details)) {
            payload.Details = payload.Details.map(detail => {
                const cleaned = { ...detail };
                if (!cleaned.Id || cleaned.Id === null || cleaned.Id === undefined) {
                    delete cleaned.Id;
                }
                cleaned.OrderId = payload.Id;
                return cleaned;
            });
        }

        return payload;
    }

    // =====================================================
    // POST-UPLOAD HELPERS
    // =====================================================

    async function removeUploadedSTTsFromAssignments(uploadedSTTs) {
        console.log('[DELETE] Removing uploaded STTs:', uploadedSTTs);

        state.assignments.forEach(assignment => {
            if (assignment.sttList && Array.isArray(assignment.sttList)) {
                assignment.sttList = assignment.sttList.filter(sttItem => {
                    const stt = typeof sttItem === 'object' ? sttItem.stt : sttItem;
                    return !uploadedSTTs.includes(stt.toString());
                });
            }
        });

        state.assignments = state.assignments.filter(a => a.sttList && a.sttList.length > 0);
        dataFns.saveAssignments(true);
        window._tab3.fn.renderAssignmentTable();
        console.log('[DELETE] Removed successfully');
    }

    async function createBackupBeforeUpload(uploadId, uploadedSTTs) {
        try {
            const backupData = {
                uploadId: uploadId,
                timestamp: Date.now(),
                beforeSnapshot: { assignments: JSON.parse(JSON.stringify(state.assignments)) },
                uploadedSTTs: uploadedSTTs
            };
            await database.ref(utils.getUserFirebasePath('productAssignments_backup')).child(uploadId).set(backupData);
            console.log('[BACKUP] Created:', uploadId);
        } catch (error) {
            console.error('[BACKUP] Error:', error);
        }
    }

    async function saveToUploadHistory(uploadId, results, status) {
        try {
            const historyRecord = {
                uploadId: uploadId,
                timestamp: Date.now(),
                uploadStatus: status,
                totalSTTs: results.length,
                successCount: results.filter(r => r.success).length,
                failCount: results.filter(r => !r.success).length,
                uploadedSTTs: results.map(r => r.stt),
                uploadResults: results,
                beforeSnapshot: { assignments: JSON.parse(JSON.stringify(state.assignments)) }
            };

            const historyPath = state.userStorageManager
                ? state.userStorageManager.getUserFirebasePath('productAssignments_history')
                : 'productAssignments_history/guest';
            await database.ref(historyPath).child(uploadId).set(historyRecord);
            console.log('[HISTORY] Saved:', uploadId);

            // Also save to V2 database
            if (window._tab3.fn.saveToUploadHistoryV2) {
                await window._tab3.fn.saveToUploadHistoryV2(uploadId, results, status);
            }
        } catch (error) {
            console.error('[HISTORY] Error:', error);
        }
    }

    // =====================================================
    // FINALIZE SESSION
    // =====================================================

    window.finalizeSession = function () {
        const totalSTTs = Object.keys(uploadData).length;
        let totalProducts = 0;
        let totalItems = 0;

        Object.values(uploadData).forEach(data => {
            totalProducts += data.products.length;
            totalItems += data.products.reduce((sum, p) => sum + p.quantity, 0);
        });

        document.getElementById('finalizeTotalSTT').textContent = totalSTTs;
        document.getElementById('finalizeTotalProducts').textContent = totalProducts;
        document.getElementById('finalizeTotalItems').textContent = totalItems;

        const modal = new bootstrap.Modal(document.getElementById('finalizeModal'));
        modal.show();
    };

    window.confirmFinalize = async function () {
        try {
            const note = document.getElementById('finalizeNote').value.trim();

            const finalizeId = `finalize_${Date.now()}`;
            const finalizeData = {
                finalizeId: finalizeId,
                timestamp: Date.now(),
                type: 'finalize',
                totalSTTs: Object.keys(uploadData).length,
                totalProducts: state.assignments.length,
                note: note,
                beforeSnapshot: { assignments: JSON.parse(JSON.stringify(state.assignments)) }
            };

            await database.ref(utils.getUserFirebasePath('productAssignments_finalize_history')).child(finalizeId).set(finalizeData);

            state.assignments = [];
            dataFns.saveAssignments(true);
            window._tab3.fn.renderAssignmentTable();

            const modal = bootstrap.Modal.getInstance(document.getElementById('finalizeModal'));
            if (modal) modal.hide();

            ui.showNotification('Đã finalize session thành công!');
            console.log('[FINALIZE] Success:', finalizeId);
        } catch (error) {
            console.error('[FINALIZE] Error:', error);
            ui.showNotification('Lỗi: ' + error.message, 'error');
        }
    };

    // =====================================================
    // EXPOSE FUNCTIONS
    // =====================================================

    window._tab3.fn.buildUploadData = buildUploadData;
    window._tab3.fn.renderUploadTable = renderUploadTable;
    window._tab3.fn.refreshUploadSection = refreshUploadSection;
    window._tab3.fn.filterNonEncodedNotes = filterNonEncodedNotes;
    window._tab3.fn.prepareUploadPayload = prepareUploadPayload;
    window._tab3.fn.fetchExistingOrderProducts = fetchExistingOrderProducts;

})();
