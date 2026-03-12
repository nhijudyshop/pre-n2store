/**
 * TAB3-REMOVAL.JS
 * Product removal feature: search, add products to removal list,
 * preview removal, execute removal via TPOS API, save history.
 *
 * Load order: tab3-removal.js (9th, after tab3-history-v2.js)
 * Depends on: window._tab3 (from tab3-core.js)
 *             window._tab3.fn.searchProducts (from tab3-filters.js)
 *             window._tab3.fn.sortVariants (from tab3-filters.js)
 *             window._tab3.fn.prepareUploadPayload (from tab3-upload.js)
 */
(function () {
    'use strict';

    const { state, utils, auth, noteEncoding, ui, data: dataFns } = window._tab3;
    const database = window._tab3.database;

    // =====================================================
    // REMOVAL STATE
    // =====================================================

    let removals = [];
    let removalUploadData = {};
    let currentRemovalViewMode = 'product';
    let selectedRemovalSTTs = new Set();
    let removalDebounceTimer = null;

    // =====================================================
    // MODAL CONTROLS
    // =====================================================

    window.openRemoveProductModal = function () {
        const modalEl = document.getElementById('removeProductModal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        loadRemovals();
        renderRemovalTable();
    };

    window.closeRemoveProductModal = function () {
        const modalEl = document.getElementById('removeProductModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    };

    // =====================================================
    // PRODUCT SEARCH FOR REMOVAL
    // =====================================================

    document.addEventListener('DOMContentLoaded', function () {
        const removalSearchInput = document.getElementById('removalProductSearch');
        if (removalSearchInput) {
            removalSearchInput.addEventListener('input', (e) => {
                const searchText = e.target.value.trim();

                if (searchText.length >= 2) {
                    if (state.productsData.length === 0) {
                        dataFns.loadProductsData().then(() => {
                            const results = window._tab3.fn.searchProducts(searchText);
                            displayRemovalProductSuggestions(results);
                        });
                    } else {
                        const results = window._tab3.fn.searchProducts(searchText);
                        displayRemovalProductSuggestions(results);
                    }
                } else {
                    const suggestionsEl = document.getElementById('removalProductSuggestions');
                    if (suggestionsEl) {
                        suggestionsEl.classList.remove('show');
                    }
                }
            });
        }

        document.addEventListener('click', (e) => {
            const removalModal = document.getElementById('removeProductModal');
            if (removalModal && removalModal.classList.contains('show')) {
                if (!e.target.closest('#removeProductModal .search-wrapper')) {
                    const suggestionsEl = document.getElementById('removalProductSuggestions');
                    if (suggestionsEl) {
                        suggestionsEl.classList.remove('show');
                    }
                }
            }
        });
    });

    // =====================================================
    // STORAGE FUNCTIONS
    // =====================================================

    function saveRemovals(immediate = false) {
        const saveAction = () => {
            try {
                localStorage.setItem('orders_productRemovals', JSON.stringify({
                    removals: removals,
                    _timestamp: Date.now(),
                    _version: 1
                }));
                console.log('[REMOVAL-SAVE] Saved', removals.length, 'removals to localStorage');
            } catch (error) {
                console.error('[REMOVAL-SAVE] Error:', error);
            }
        };

        if (immediate) {
            if (removalDebounceTimer) clearTimeout(removalDebounceTimer);
            saveAction();
        } else {
            if (removalDebounceTimer) clearTimeout(removalDebounceTimer);
            removalDebounceTimer = setTimeout(saveAction, 500);
        }
    }

    function loadRemovals() {
        try {
            const saved = localStorage.getItem('orders_productRemovals');
            if (saved) {
                const data = JSON.parse(saved);
                removals = data.removals || [];
                console.log('[REMOVAL-LOAD] Loaded', removals.length, 'removals from localStorage');
            }
        } catch (error) {
            console.error('[REMOVAL-LOAD] Error:', error);
            removals = [];
        }
    }

    // =====================================================
    // DISPLAY REMOVAL PRODUCT SUGGESTIONS
    // =====================================================

    function displayRemovalProductSuggestions(suggestions) {
        const suggestionsDiv = document.getElementById('removalProductSuggestions');

        if (suggestions.length === 0) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        suggestionsDiv.innerHTML = suggestions.map(product => `
            <div class="suggestion-item" data-id="${product.id}">
                <span class="product-code">${product.code || 'N/A'}</span>
                <span class="product-name">${product.name}</span>
            </div>
        `).join('');

        suggestionsDiv.classList.add('show');

        suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', async () => {
                const productId = item.dataset.id;
                await addProductToRemoval(productId);
                suggestionsDiv.classList.remove('show');
                document.getElementById('removalProductSearch').value = '';
            });
        });
    }

    // =====================================================
    // ADD PRODUCT TO REMOVAL
    // =====================================================

    async function addProductToRemoval(productId) {
        try {
            const response = await auth.authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
            );

            if (!response.ok) {
                throw new Error('Không thể tải thông tin sản phẩm');
            }

            const productData = await response.json();
            let imageUrl = productData.ImageUrl;
            let templateData = null;

            if (productData.ProductTmplId) {
                try {
                    const templateResponse = await auth.authenticatedFetch(
                        `${API_CONFIG.WORKER_URL}/api/odata/ProductTemplate(${productData.ProductTmplId})?$expand=UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues)`
                    );

                    if (templateResponse.ok) {
                        templateData = await templateResponse.json();
                        if (!imageUrl) {
                            imageUrl = templateData.ImageUrl;
                        }
                    }
                } catch (error) {
                    console.error('Error loading template:', error);
                }
            }

            if (state.autoAddVariants && templateData && templateData.ProductVariants && templateData.ProductVariants.length > 0) {
                const activeVariants = templateData.ProductVariants.filter(v => v.Active === true);
                const sortedVariants = window._tab3.fn.sortVariants(activeVariants);

                if (sortedVariants.length === 0) {
                    const existingIndex = removals.findIndex(a => a.productId === productData.Id);
                    if (existingIndex !== -1) {
                        ui.showNotification('Sản phẩm đã có trong danh sách', 'error');
                        return;
                    }

                    const productCode = utils.extractProductCode(productData.NameGet) || productData.DefaultCode || productData.Barcode || '';
                    const removal = {
                        id: Date.now(),
                        productId: productData.Id,
                        productName: productData.NameGet,
                        productCode: productCode,
                        imageUrl: imageUrl,
                        sttList: []
                    };

                    removals.push(removal);
                    saveRemovals();
                    renderRemovalTable();
                    ui.showNotification('Đã thêm sản phẩm vào danh sách');
                    return;
                }

                let addedCount = 0;
                let skippedCount = 0;

                for (const variant of sortedVariants) {
                    const existingIndex = removals.findIndex(a => a.productId === variant.Id);
                    if (existingIndex !== -1) {
                        skippedCount++;
                        continue;
                    }

                    const variantImageUrl = variant.ImageUrl || imageUrl;
                    const productCode = utils.extractProductCode(variant.NameGet) || variant.DefaultCode || variant.Barcode || '';

                    const removal = {
                        id: Date.now() + addedCount,
                        productId: variant.Id,
                        productName: variant.NameGet,
                        productCode: productCode,
                        imageUrl: variantImageUrl,
                        sttList: []
                    };

                    removals.push(removal);
                    addedCount++;
                }

                saveRemovals();
                renderRemovalTable();

                if (addedCount > 0) {
                    ui.showNotification(`Đã thêm ${addedCount} biến thể${skippedCount > 0 ? ` (${skippedCount} đã tồn tại)` : ''}`);
                } else if (skippedCount > 0) {
                    ui.showNotification('Tất cả biến thể đã có trong danh sách', 'error');
                }
            } else {
                const existingIndex = removals.findIndex(a => a.productId === productData.Id);
                if (existingIndex !== -1) {
                    ui.showNotification('Sản phẩm đã có trong danh sách', 'error');
                    return;
                }

                const productCode = utils.extractProductCode(productData.NameGet) || productData.DefaultCode || productData.Barcode || '';
                const removal = {
                    id: Date.now(),
                    productId: productData.Id,
                    productName: productData.NameGet,
                    productCode: productCode,
                    imageUrl: imageUrl,
                    sttList: []
                };

                removals.push(removal);
                saveRemovals();
                renderRemovalTable();
                ui.showNotification('Đã thêm sản phẩm vào danh sách');
            }

        } catch (error) {
            console.error('Error adding product to removal:', error);
            ui.showNotification('Lỗi: ' + error.message, 'error');
        }
    }

    // =====================================================
    // RENDER REMOVAL TABLE
    // =====================================================

    function renderRemovalTable() {
        const tbody = document.getElementById('removalTableBody');
        const countEl = document.getElementById('removalCount');

        if (!removals || removals.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted py-4">
                        <i class="fas fa-inbox fa-3x mb-2"></i>
                        <p class="mb-0">Chưa có sản phẩm nào</p>
                        <small>Vui lòng tìm kiếm và thêm sản phẩm cần gỡ</small>
                    </td>
                </tr>
            `;
            countEl.textContent = '0';
            return;
        }

        let html = '';
        removals.forEach(removal => {
            const sttCount = removal.sttList ? removal.sttList.length : 0;
            const totalQty = removal.sttList ? removal.sttList.reduce((sum, item) => {
                return sum + (item.currentProductDetails?.currentQuantity || 0);
            }, 0) : 0;

            html += `
                <tr>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            ${removal.imageUrl ? `<img src="${removal.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:40px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;">📦</div>'}
                            <div>
                                <div style="font-weight:600;">${removal.productName}</div>
                                <div style="font-size:12px;color:#6b7280;">${removal.productCode}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        ${sttCount > 0 ? `
                            <div class="d-flex flex-wrap gap-1">
                                ${removal.sttList.map((item, index) => `
                                    <span class="badge bg-secondary position-relative">
                                        ${item.stt}
                                        <button type="button" class="btn-close btn-close-white ms-1"
                                            style="font-size:8px;vertical-align:middle;"
                                            onclick="removeSTTFromRemoval(${removal.id}, ${index})"
                                            title="Xóa STT này"></button>
                                    </span>
                                `).join('')}
                            </div>
                            <div class="mt-2">
                                <input type="text" class="form-control form-control-sm"
                                    placeholder="Nhập STT để thêm..."
                                    onkeypress="if(event.key==='Enter'){addSTTToRemoval(${removal.id}, this.value); this.value='';}"
                                    style="max-width:200px;">
                            </div>
                        ` : `
                            <input type="text" class="form-control form-control-sm"
                                placeholder="Nhập STT để thêm..."
                                onkeypress="if(event.key==='Enter'){addSTTToRemoval(${removal.id}, this.value); this.value='';}"
                                style="max-width:200px;">
                        `}
                    </td>
                    <td class="text-center">
                        ${sttCount > 0 ? `<span class="badge bg-info">${totalQty}</span>` : '-'}
                    </td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-danger" onclick="removeProductFromRemovalList(${removal.id})" title="Xóa sản phẩm">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        countEl.textContent = removals.length;
    }

    // =====================================================
    // ADD STT TO REMOVAL
    // =====================================================

    window.addSTTToRemoval = async function (removalId, stt) {
        if (!stt || !stt.trim()) return;

        stt = stt.trim();

        try {
            const removal = removals.find(r => r.id === removalId);
            if (!removal) {
                ui.showNotification('Không tìm thấy sản phẩm', 'error');
                return;
            }

            if (removal.sttList.some(item => item.stt === stt)) {
                ui.showNotification('STT đã tồn tại', 'warning');
                return;
            }

            let order = state.ordersData.find(o => o.stt && o.stt.toString() === stt);
            let orderId = null;

            if (!order) {
                console.log(`[ADD-STT-REMOVAL] Order ${stt} not in cache, fetching by STT...`);
                try {
                    const sttSearchResponse = await auth.authenticatedFetch(
                        `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order?$filter=STT eq '${stt}'`
                    );
                    if (sttSearchResponse.ok) {
                        const sttSearchData = await sttSearchResponse.json();
                        if (sttSearchData.value && sttSearchData.value.length > 0) {
                            orderId = sttSearchData.value[0].Id;
                            console.log(`[ADD-STT-REMOVAL] Found order ID ${orderId} for STT ${stt}`);
                        }
                    }
                } catch (err) {
                    console.error('[ADD-STT-REMOVAL] Error searching by STT:', err);
                }

                if (!orderId) {
                    ui.showNotification(`Không tìm thấy đơn hàng ${stt}`, 'warning');
                    return;
                }
            } else {
                orderId = order.orderId;
            }

            const response = await auth.authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product)`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch order');
            }

            const orderData = await response.json();
            const productInOrder = orderData.Details?.find(d => d.ProductId === removal.productId);

            removal.sttList.push({
                stt: stt,
                orderId: orderId,
                orderInfo: {
                    CustomerName: orderData.CustomerName || 'N/A',
                    Mobile: orderData.Mobile || '',
                    TotalAmount: orderData.TotalAmount || 0
                },
                currentProductDetails: productInOrder ? {
                    currentQuantity: productInOrder.Quantity || 0,
                    unitPrice: productInOrder.Price || 0,
                    detailId: productInOrder.Id,
                    canRemove: true
                } : {
                    canRemove: false,
                    reason: 'Sản phẩm không có trong đơn'
                }
            });

            saveRemovals();
            renderRemovalTable();

            if (!productInOrder) {
                ui.showNotification(`Đã thêm STT ${stt} nhưng sản phẩm không có trong đơn (sẽ bỏ qua khi gỡ)`, 'warning');
            } else {
                ui.showNotification(`Đã thêm STT ${stt} (SL hiện tại: ${productInOrder.Quantity})`, 'success');
            }

        } catch (error) {
            console.error('[ADD-STT-REMOVAL] Error:', error);
            ui.showNotification('Lỗi: ' + error.message, 'error');
        }
    };

    // =====================================================
    // REMOVE STT FROM REMOVAL
    // =====================================================

    window.removeSTTFromRemoval = function (removalId, index) {
        const removal = removals.find(r => r.id === removalId);
        if (!removal || !removal.sttList) return;

        const stt = removal.sttList[index].stt;
        removal.sttList.splice(index, 1);

        saveRemovals(true);
        renderRemovalTable();
        ui.showNotification(`Đã xóa STT ${stt}`, 'success');
    };

    // =====================================================
    // REMOVE PRODUCT FROM REMOVAL LIST
    // =====================================================

    window.removeProductFromRemovalList = function (removalId) {
        if (!confirm('Bạn có chắc muốn xóa sản phẩm này khỏi danh sách gỡ?')) return;

        removals = removals.filter(r => r.id !== removalId);
        saveRemovals(true);
        renderRemovalTable();
        ui.showNotification('Đã xóa sản phẩm', 'success');
    };

    // =====================================================
    // CLEAR ALL REMOVALS
    // =====================================================

    window.clearAllRemovals = function () {
        if (!confirm('Bạn có chắc muốn xóa tất cả sản phẩm trong danh sách gỡ?')) return;

        removals = [];
        saveRemovals(true);
        renderRemovalTable();
        ui.showNotification('Đã xóa tất cả', 'success');
    };

    // =====================================================
    // BUILD REMOVAL DATA
    // =====================================================

    function buildRemovalData() {
        removalUploadData = {};

        removals.forEach(removal => {
            if (!removal.sttList) return;

            removal.sttList.forEach(sttItem => {
                const stt = sttItem.stt;

                if (!removalUploadData[stt]) {
                    removalUploadData[stt] = {
                        stt: stt,
                        orderId: sttItem.orderId,
                        orderInfo: sttItem.orderInfo,
                        products: []
                    };
                }

                const current = sttItem.currentProductDetails?.currentQuantity || 0;
                const after = current > 1 ? current - 1 : 0;

                removalUploadData[stt].products.push({
                    productId: removal.productId,
                    productName: removal.productName,
                    productCode: removal.productCode,
                    imageUrl: removal.imageUrl,
                    currentQuantity: current,
                    removeQuantity: 1,
                    afterQuantity: after,
                    action: after === 0 ? 'remove' : 'decrease',
                    canRemove: sttItem.currentProductDetails?.canRemove || false,
                    skipReason: sttItem.currentProductDetails?.reason || null
                });
            });
        });

        console.log('[BUILD-REMOVAL-DATA]', removalUploadData);
    }

    // =====================================================
    // PREVIEW REMOVAL
    // =====================================================

    window.previewRemoval = function () {
        buildRemovalData();

        const stts = Object.keys(removalUploadData);
        if (stts.length === 0) {
            ui.showNotification('Chưa có sản phẩm nào để gỡ', 'warning');
            return;
        }

        document.getElementById('removalPreviewCard').style.display = 'block';
        document.getElementById('executeRemovalBtn').style.display = 'inline-block';

        selectedRemovalSTTs = new Set(stts);

        renderRemovalPreview();
    };

    window.switchRemovalViewMode = function (mode) {
        currentRemovalViewMode = mode;

        document.getElementById('removalViewByProduct').classList.toggle('active', mode === 'product');
        document.getElementById('removalViewByOrder').classList.toggle('active', mode === 'order');

        renderRemovalPreview();
    };

    // =====================================================
    // RENDER REMOVAL PREVIEW
    // =====================================================

    function renderRemovalPreview() {
        const previewArea = document.getElementById('removalPreviewArea');
        const stts = Array.from(selectedRemovalSTTs);

        let html = '';

        if (currentRemovalViewMode === 'order') {
            stts.forEach(stt => {
                const data = removalUploadData[stt];
                if (!data) return;

                const canRemoveCount = data.products.filter(p => p.canRemove).length;
                const skipCount = data.products.filter(p => !p.canRemove).length;

                html += `
                    <div class="card mb-3">
                        <div class="card-header bg-light d-flex justify-content-between align-items-center">
                            <div>
                                <input type="checkbox" class="form-check-input me-2"
                                    ${selectedRemovalSTTs.has(stt) ? 'checked' : ''}
                                    onchange="toggleRemovalSTT('${stt}', this.checked)">
                                <strong>STT: ${stt}</strong>
                                <span class="text-muted ms-2">${data.orderInfo.CustomerName}</span>
                            </div>
                            <span class="badge ${skipCount > 0 ? 'bg-warning' : 'bg-success'}">${canRemoveCount} sản phẩm</span>
                        </div>
                        <div class="card-body">
                            <table class="table table-sm table-bordered mb-0">
                                <thead>
                                    <tr>
                                        <th>Sản phẩm</th>
                                        <th class="text-center">SL Hiện tại</th>
                                        <th class="text-center">Gỡ</th>
                                        <th class="text-center">Còn lại</th>
                                        <th>Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.products.map(p => {
                    const statusIcon = p.canRemove ? '✅' : '⚠️';
                    const statusText = p.canRemove
                        ? (p.action === 'remove' ? 'Xóa hoàn toàn' : 'Giảm số lượng')
                        : (p.skipReason || 'Bỏ qua');
                    const rowClass = p.canRemove ? '' : 'table-warning';

                    return `
                                            <tr class="${rowClass}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:30px;height:30px;object-fit:cover;border-radius:4px;">` : '📦'}
                                                        <div>
                                                            <div style="font-size:13px;font-weight:600;">${p.productName}</div>
                                                            <div style="font-size:11px;color:#666;">${p.productCode}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center"><strong>${p.currentQuantity}</strong></td>
                                                <td class="text-center text-danger"><strong>-1</strong></td>
                                                <td class="text-center"><strong>${p.afterQuantity}</strong></td>
                                                <td><small>${statusIcon} ${statusText}</small></td>
                                            </tr>
                                        `;
                }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        } else {
            const productGroups = {};

            stts.forEach(stt => {
                const data = removalUploadData[stt];
                if (!data) return;

                data.products.forEach(p => {
                    if (!productGroups[p.productId]) {
                        productGroups[p.productId] = {
                            product: p,
                            stts: []
                        };
                    }
                    productGroups[p.productId].stts.push({
                        stt: stt,
                        ...p
                    });
                });
            });

            Object.values(productGroups).forEach(group => {
                const p = group.product;
                const canRemoveCount = group.stts.filter(s => s.canRemove).length;
                const totalQty = group.stts.reduce((sum, s) => sum + s.currentQuantity, 0);

                html += `
                    <div class="card mb-3">
                        <div class="card-header bg-light">
                            <div class="d-flex align-items-center gap-2">
                                ${p.imageUrl ? `<img src="${p.imageUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : '<div style="width:40px;height:40px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;">📦</div>'}
                                <div>
                                    <strong>${p.productName}</strong>
                                    <div class="text-muted" style="font-size:12px;">${p.productCode}</div>
                                </div>
                                <span class="badge bg-info ms-auto">${group.stts.length} đơn</span>
                                <span class="badge bg-secondary">Tổng SL: ${totalQty}</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <table class="table table-sm table-bordered mb-0">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Khách hàng</th>
                                        <th class="text-center">SL Hiện tại</th>
                                        <th class="text-center">Sau khi gỡ</th>
                                        <th>Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${group.stts.map(s => {
                    const orderInfo = removalUploadData[s.stt].orderInfo;
                    const statusIcon = s.canRemove ? '✅' : '⚠️';
                    const statusText = s.canRemove
                        ? (s.action === 'remove' ? 'Xóa' : 'Giảm')
                        : 'Bỏ qua';
                    const rowClass = s.canRemove ? '' : 'table-warning';

                    return `
                                            <tr class="${rowClass}">
                                                <td><strong>${s.stt}</strong></td>
                                                <td>${orderInfo.CustomerName}</td>
                                                <td class="text-center">${s.currentQuantity}</td>
                                                <td class="text-center">${s.afterQuantity}</td>
                                                <td><small>${statusIcon} ${statusText}</small></td>
                                            </tr>
                                        `;
                }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        }

        previewArea.innerHTML = html || '<div class="alert alert-warning">Không có dữ liệu</div>';

        document.getElementById('removalSelectionSummary').style.display = 'block';
        document.getElementById('removalSelectedCount').textContent = selectedRemovalSTTs.size;
    }

    window.toggleRemovalSTT = function (stt, checked) {
        if (checked) {
            selectedRemovalSTTs.add(stt);
        } else {
            selectedRemovalSTTs.delete(stt);
        }
        renderRemovalPreview();
    };

    // =====================================================
    // EXECUTE REMOVAL - MAIN FUNCTION
    // =====================================================

    window.executeRemoval = async function () {
        const stts = Array.from(selectedRemovalSTTs);

        if (stts.length === 0) {
            ui.showNotification('Vui lòng chọn ít nhất 1 STT để gỡ sản phẩm', 'warning');
            return;
        }

        const confirmMsg = `Bạn có chắc muốn gỡ sản phẩm khỏi ${stts.length} đơn hàng?\n\nLưu ý: Thao tác này không thể hoàn tác!`;
        if (!confirm(confirmMsg)) return;

        const progressModal = new bootstrap.Modal(document.getElementById('removalProgressModal'));
        progressModal.show();

        let results = {
            success: [],
            failed: [],
            skipped: []
        };

        for (let i = 0; i < stts.length; i++) {
            const stt = stts[i];

            document.getElementById('removalProgressText').textContent = `Đang gỡ sản phẩm khỏi STT ${stt}...`;
            document.getElementById('removalProgressDetail').textContent = `${i + 1} / ${stts.length}`;

            const result = await removeSingleSTT(stt);

            if (result.success) {
                results.success.push(result);
            } else {
                results.failed.push(result);
            }

            if (result.skippedProducts && result.skippedProducts.length > 0) {
                results.skipped.push(...result.skippedProducts.map(p => ({
                    stt: stt,
                    ...p
                })));
            }
        }

        progressModal.hide();

        showRemovalResults(results);

        await saveRemovalHistory({
            timestamp: Date.now(),
            results: results,
            totalSTTs: stts.length,
            successCount: results.success.length,
            failedCount: results.failed.length,
            skippedCount: results.skipped.length
        });

        if (results.success.length > 0) {
            removeProcessedSTTsFromRemovals(results.success.map(r => r.stt));
        }

        renderRemovalTable();
    };

    // =====================================================
    // REMOVE SINGLE STT - CORE LOGIC
    // =====================================================

    async function removeSingleSTT(stt) {
        try {
            const sessionData = removalUploadData[stt];
            if (!sessionData) {
                throw new Error('STT data not found');
            }

            const orderId = sessionData.orderId;
            if (!orderId) {
                throw new Error('No order ID for this STT');
            }

            console.log(`[REMOVAL] Fetching order ${orderId} for STT ${stt}...`);

            const response = await auth.authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch order ${orderId}: ${response.status}`);
            }

            const orderData = await response.json();
            console.log(`[REMOVAL] Fetched order data for STT ${stt}`);

            let removedProducts = [];
            let skippedProducts = [];
            let totalQuantityChange = 0;

            for (const product of sessionData.products) {
                if (!product.canRemove) {
                    skippedProducts.push({
                        productId: product.productId,
                        productName: product.productName,
                        productCode: product.productCode,
                        reason: product.skipReason || 'Sản phẩm không có trong đơn'
                    });
                    continue;
                }

                const detailIndex = orderData.Details.findIndex(
                    d => d.ProductId === product.productId
                );

                if (detailIndex === -1) {
                    skippedProducts.push({
                        productId: product.productId,
                        productName: product.productName,
                        productCode: product.productCode,
                        reason: 'Sản phẩm không tồn tại trong đơn'
                    });
                    continue;
                }

                const detail = orderData.Details[detailIndex];
                const currentQty = detail.Quantity;

                if (currentQty > 1) {
                    orderData.Details[detailIndex].Quantity = currentQty - 1;
                    totalQuantityChange -= 1;

                    removedProducts.push({
                        productId: product.productId,
                        productName: product.productName,
                        productCode: product.productCode,
                        action: 'decreased',
                        from: currentQty,
                        to: currentQty - 1
                    });
                } else {
                    orderData.Details.splice(detailIndex, 1);
                    totalQuantityChange -= 1;

                    removedProducts.push({
                        productId: product.productId,
                        productName: product.productName,
                        productCode: product.productCode,
                        action: 'removed',
                        quantity: 1
                    });
                }
            }

            if (removedProducts.length === 0) {
                return {
                    success: false,
                    stt: stt,
                    orderId: orderId,
                    error: 'Không có sản phẩm nào để gỡ',
                    skippedProducts: skippedProducts
                };
            }

            orderData.TotalQuantity = (orderData.TotalQuantity || 0) + totalQuantityChange;
            orderData.TotalAmount = 0;

            orderData.Note = processNoteForRemoval(orderData.Note || '', removedProducts);

            const payload = window._tab3.fn.prepareUploadPayload(orderData);

            console.log(`[REMOVAL] Updating order ${orderId}...`);

            const uploadResponse = await auth.authenticatedFetch(
                `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order(${orderId})`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }
            );

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
            }

            console.log(`[REMOVAL] Successfully removed products from STT ${stt}`);

            return {
                success: true,
                stt: stt,
                orderId: orderId,
                removedProducts: removedProducts,
                skippedProducts: skippedProducts,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error(`[REMOVAL] Error removing from STT ${stt}:`, error);
            return {
                success: false,
                stt: stt,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    // =====================================================
    // PROCESS NOTE FOR REMOVAL
    // =====================================================

    function processNoteForRemoval(currentNote, removedProducts) {
        if (!currentNote || !currentNote.trim()) return '';

        let plainTextOutside = '';
        let decodedContent = '';

        if (currentNote && currentNote.trim() !== '') {
            const { plainText, encodedContent } = noteEncoding.extractNoteComponents(currentNote);
            plainTextOutside = plainText;

            if (encodedContent) {
                decodedContent = noteEncoding.decodeFullNote(encodedContent) || '';
            } else {
                const decoded = noteEncoding.decodeFullNote(currentNote);
                if (decoded) {
                    decodedContent = decoded;
                    plainTextOutside = '';
                } else {
                    decodedContent = currentNote;
                    plainTextOutside = '';
                }
            }
        }

        console.log('[REMOVAL-NOTE] Decoded content:', decodedContent);

        const lines = decodedContent.split('\n');
        const updatedLines = [];

        for (const line of lines) {
            if (!line || !line.trim()) continue;

            const match = line.match(/^(.+?)\s*-\s*(\d+)\s*-\s*(.+)$/);

            if (match) {
                const [, productCode, quantity, price] = match;
                const productCodeTrimmed = productCode.trim();

                const removed = removedProducts.find(p =>
                    p.productCode === productCodeTrimmed
                );

                if (removed) {
                    if (removed.action === 'decreased') {
                        const newQty = parseInt(quantity) - 1;
                        if (newQty > 0) {
                            updatedLines.push(`${productCodeTrimmed} - ${newQty} - ${price.trim()}`);
                        }
                    }
                    // If action === 'removed', skip this line entirely
                } else {
                    updatedLines.push(line);
                }
            } else {
                updatedLines.push(line);
            }
        }

        const updatedContent = updatedLines.join('\n');
        console.log('[REMOVAL-NOTE] Updated content:', updatedContent);

        let finalNote = '';
        if (updatedContent.trim() !== '') {
            const encoded = noteEncoding.encodeFullNote(updatedContent);
            if (plainTextOutside.trim() !== '') {
                finalNote = `${plainTextOutside}\n${encoded}`;
            } else {
                finalNote = encoded;
            }
        } else if (plainTextOutside.trim() !== '') {
            finalNote = plainTextOutside;
        }

        return finalNote;
    }

    // =====================================================
    // SHOW REMOVAL RESULTS
    // =====================================================

    function showRemovalResults(results) {
        const resultsBody = document.getElementById('removalResultsBody');

        let html = '<div class="removal-results">';

        // Summary
        html += `
            <div class="row mb-4 text-center">
                <div class="col-md-4">
                    <div class="card border-success">
                        <div class="card-body">
                            <h3 class="text-success">${results.success.length}</h3>
                            <p class="mb-0">Thành công</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-danger">
                        <div class="card-body">
                            <h3 class="text-danger">${results.failed.length}</h3>
                            <p class="mb-0">Thất bại</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-warning">
                        <div class="card-body">
                            <h3 class="text-warning">${results.skipped.length}</h3>
                            <p class="mb-0">Bỏ qua</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Success details
        if (results.success.length > 0) {
            html += '<h5 class="text-success">Đơn hàng đã gỡ thành công:</h5>';
            html += '<div class="list-group mb-4">';
            results.success.forEach(r => {
                const removedCount = r.removedProducts.length;
                const skippedCount = r.skippedProducts?.length || 0;

                html += `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <strong>STT ${r.stt}</strong>
                            <span class="badge bg-success">${removedCount} sản phẩm đã gỡ</span>
                        </div>
                        <ul class="mb-0" style="font-size:13px;">
                            ${r.removedProducts.map(p => {
                    if (p.action === 'removed') {
                        return `<li>${p.productCode}: <strong>Đã xóa hoàn toàn</strong></li>`;
                    } else {
                        return `<li>${p.productCode}: Giảm từ <strong>${p.from}</strong> → <strong>${p.to}</strong></li>`;
                    }
                }).join('')}
                        </ul>
                        ${skippedCount > 0 ? `<small class="text-muted">(${skippedCount} sản phẩm bỏ qua)</small>` : ''}
                    </div>
                `;
            });
            html += '</div>';
        }

        // Failed details
        if (results.failed.length > 0) {
            html += '<h5 class="text-danger">Đơn hàng thất bại:</h5>';
            html += '<div class="list-group mb-4">';
            results.failed.forEach(r => {
                html += `
                    <div class="list-group-item list-group-item-danger">
                        <strong>STT ${r.stt}:</strong> ${r.error}
                    </div>
                `;
            });
            html += '</div>';
        }

        // Skipped products
        if (results.skipped.length > 0) {
            html += '<h5 class="text-warning">Sản phẩm bỏ qua (không có trong đơn):</h5>';
            html += '<div class="list-group mb-4">';
            results.skipped.forEach(s => {
                html += `
                    <div class="list-group-item list-group-item-warning">
                        <strong>STT ${s.stt}</strong> - ${s.productName} (${s.productCode}): ${s.reason}
                    </div>
                `;
            });
            html += '</div>';
        }

        html += '</div>';

        resultsBody.innerHTML = html;

        const resultsModal = new bootstrap.Modal(document.getElementById('removalResultsModal'));
        resultsModal.show();
    }

    // =====================================================
    // REMOVE PROCESSED STTs FROM REMOVALS
    // =====================================================

    function removeProcessedSTTsFromRemovals(successfulSTTs) {
        removals.forEach(removal => {
            if (!removal.sttList) return;

            removal.sttList = removal.sttList.filter(item =>
                !successfulSTTs.includes(item.stt)
            );
        });

        removals = removals.filter(r => r.sttList && r.sttList.length > 0);

        saveRemovals(true);
    }

    // =====================================================
    // SAVE REMOVAL HISTORY TO FIREBASE
    // =====================================================

    async function saveRemovalHistory(historyData) {
        try {
            const user = firebase.auth().currentUser;
            if (!user) return;

            const historyId = `removal_${Date.now()}`;

            await database.ref(`productRemovals_history/${user.uid}/${historyId}`).set({
                ...historyData,
                userId: user.uid,
                userEmail: user.email
            });

            console.log('[REMOVAL-HISTORY] Saved history:', historyId);

        } catch (error) {
            console.error('[REMOVAL-HISTORY] Error saving history:', error);
        }
    }

})();
