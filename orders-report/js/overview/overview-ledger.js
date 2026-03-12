// =====================================================
// OVERVIEW - LEDGER: Sổ Sách Live Order Tracking
// Tích hợp trong tab Báo Cáo Tổng Hợp
// Tận dụng campaign selector + cachedOrderDetails từ overview
//
// Firebase paths:
// - live_ledger/{campaignId}/products/{productId}
// - live_ledger/{campaignId}/metadata
// - orderProducts/product_{id} — order-management (Duyên, 2-way sync)
// =====================================================

(function () {
    'use strict';

    let ledgerProducts = {};
    let orderManagementListener = null;
    let ledgerListener = null;
    let _syncingFromSave = false;

    function getDb() {
        return window.firebase ? window.firebase.database() : null;
    }

    function getCampaignId() {
        // Reuse currentTableName from overview-core.js (let in global scope, not on window)
        const name = (typeof currentTableName !== 'undefined' ? currentTableName : '') || '';
        if (!name) return '';
        return name.replace(/[.$#\[\]\/]/g, '_');
    }

    function getCampaignName() {
        return (typeof currentTableName !== 'undefined' ? currentTableName : '') || '';
    }

    // =====================================================
    // PRODUCT INFO EXTRACTION FROM NameGet
    // =====================================================

    /**
     * Extract product code from NameGet.
     * Pattern: "[B34C] B4 0603 ÁO THUN..." → code = "B34C"
     * Also checks DefaultCode field from TPOS data.
     */
    function extractProductCode(product) {
        if (product.DefaultCode) return product.DefaultCode;
        const name = product.NameGet || product.Name || '';
        const match = name.match(/^\[([^\]]+)\]/);
        return match ? match[1].trim() : '';
    }

    /**
     * Extract supplier/NCC name from NameGet.
     * Pattern: "[B34C] B4 0603 ÁO THUN..." → ncc = "B4"
     * Takes the first word after the "]" bracket.
     */
    function extractNccName(product) {
        if (product.supplierName) return product.supplierName;
        if (product.nccName) return product.nccName;
        const name = product.NameGet || product.Name || '';
        const match = name.match(/^\[[^\]]+\]\s*(\S+)/);
        return match ? match[1].trim() : '';
    }

    /**
     * Get clean product name from NameGet (full name).
     */
    function extractProductName(product) {
        return product.NameGet || product.ProductNameGet || product.Name || '';
    }

    // =====================================================
    // REFRESH FROM CACHED DATA
    // =====================================================

    /**
     * Main entry: aggregate product qty from cachedOrderDetails
     * and merge with live_ledger Firebase data + orderProducts sync
     */
    async function refreshFromCachedData() {
        const campaignId = getCampaignId();
        const campaignName = getCampaignName();

        if (!campaignName) {
            showEmpty('Chọn chiến dịch live ở dropdown phía trên');
            return;
        }

        const db = getDb();
        if (!db) {
            showEmpty('Firebase chưa sẵn sàng');
            return;
        }

        showLoading();
        detachListeners();

        try {
            // Step 1: Aggregate customerOrderQty from cachedOrderDetails
            const qtyMap = {};
            const productInfoMap = {};
            const cached = (typeof cachedOrderDetails !== 'undefined' && cachedOrderDetails) ? cachedOrderDetails[campaignName] : null;

            if (cached && cached.orders) {
                const orders = cached.orders;
                (Array.isArray(orders) ? orders : Object.values(orders)).forEach(item => {
                    const order = item.order || item;
                    (order.Details || []).forEach(detail => {
                        const pid = String(detail.ProductId);
                        qtyMap[pid] = (qtyMap[pid] || 0) + (detail.Quantity || 0);
                        if (!productInfoMap[pid]) {
                            productInfoMap[pid] = {
                                productCode: detail.ProductCode || detail.Code || detail.DefaultCode || '',
                                productName: detail.ProductName || detail.Name || '',
                            };
                        }
                    });
                });
            }

            // Step 2: Pull order-management data (Duyên's soldQty + product info)
            const omSnapshot = await db.ref('orderProducts').once('value');
            const orderProducts = omSnapshot.val() || {};
            const duyenQtyMap = {};
            const nccMap = {};
            const omProductInfoMap = {}; // Product info from order-management
            const omStockMap = {}; // QtyAvailable from order-management

            // Check current campaign ID for filtering
            const currentCampaignForFilter = campaignId;

            Object.entries(orderProducts).forEach(([key, product]) => {
                if (!product || !product.Id) return;
                const pid = String(product.Id);

                // Filter by campaign if product has campaignId tag
                if (product.campaignId && product.campaignId !== currentCampaignForFilter) {
                    return; // Skip products from other campaigns
                }

                duyenQtyMap[pid] = product.soldQty || 0;

                // Extract NCC from NameGet pattern: "[CODE] NCC ..."
                const ncc = extractNccName(product);
                if (ncc) nccMap[pid] = ncc;

                // Extract product code and name from NameGet
                const code = extractProductCode(product);
                const name = extractProductName(product);
                if (code || name) {
                    omProductInfoMap[pid] = {
                        productCode: code,
                        productName: name,
                    };
                }

                // Stock from QtyAvailable
                if (product.QtyAvailable > 0) {
                    omStockMap[pid] = product.QtyAvailable;
                }
            });

            // Step 3: Load existing ledger data from Firebase
            const ledgerSnapshot = await db.ref(`live_ledger/${campaignId}/products`).once('value');
            const existingLedger = ledgerSnapshot.val() || {};

            // Step 4: Merge all product IDs
            const allPids = new Set([
                ...Object.keys(qtyMap),
                ...Object.keys(duyenQtyMap),
                ...Object.keys(existingLedger)
            ]);

            // Step 5: Build updates — preserve manual edits, enrich from order-management
            const updates = {};
            allPids.forEach(pid => {
                const existing = existingLedger[pid] || {};
                const omInfo = omProductInfoMap[pid] || {};
                const custInfo = productInfoMap[pid] || {};

                // Priority: existing > order-management > customer orders
                updates[pid] = {
                    productCode: existing.productCode || omInfo.productCode || custInfo.productCode || '',
                    productName: existing.productName || omInfo.productName || custInfo.productName || '',
                    nccName: existing.nccName || nccMap[pid] || '',
                    customerOrderQty: qtyMap[pid] || existing.customerOrderQty || 0,
                    duyenOrderQty: duyenQtyMap[pid] || existing.duyenOrderQty || 0,
                    nccDeliveredQty: existing.nccDeliveredQty || 0,
                    stockQty: omStockMap[pid] || existing.stockQty || 0,
                    notes: existing.notes || '',
                    lastUpdated: Date.now()
                };
            });

            // Step 6: Save to Firebase
            if (Object.keys(updates).length > 0) {
                await db.ref(`live_ledger/${campaignId}/products`).update(updates);
                await db.ref(`live_ledger/${campaignId}/metadata`).set({
                    campaignName: campaignName,
                    date: new Date().toISOString().split('T')[0],
                    lastUpdated: Date.now()
                });
            }

            // Step 7: Setup realtime listeners
            setupLedgerListener(campaignId);
            setupOrderManagementSync(campaignId);

            console.log('[LEDGER] ✓ Refreshed', Object.keys(updates).length, 'products from cached data');

        } catch (error) {
            console.error('[LEDGER] Error refreshing:', error);
            showEmpty('Lỗi tải dữ liệu: ' + error.message);
        }
    }

    // =====================================================
    // REALTIME LISTENERS
    // =====================================================

    function setupLedgerListener(campaignId) {
        const db = getDb();
        if (!db) return;

        const ledgerRef = db.ref(`live_ledger/${campaignId}/products`);
        ledgerListener = ledgerRef;
        ledgerRef.on('value', (snap) => {
            ledgerProducts = snap.val() || {};
            renderFilteredTable();
            populateNccFilter();
        });
    }

    function setupOrderManagementSync(campaignId) {
        const db = getDb();
        if (!db) return;

        if (orderManagementListener) {
            db.ref('orderProducts').off('value', orderManagementListener);
        }

        orderManagementListener = db.ref('orderProducts').on('value', (snapshot) => {
            if (_syncingFromSave) return;

            const orderProducts = snapshot.val() || {};
            let updated = false;

            Object.values(orderProducts).forEach(product => {
                if (!product || !product.Id) return;

                // Filter by campaign if product has campaignId tag
                if (product.campaignId && product.campaignId !== campaignId) return;

                const pid = String(product.Id);
                const soldQty = product.soldQty || 0;

                if (ledgerProducts[pid]) {
                    // Update soldQty
                    if (ledgerProducts[pid].duyenOrderQty !== soldQty) {
                        db.ref(`live_ledger/${campaignId}/products/${pid}/duyenOrderQty`).set(soldQty);
                        updated = true;
                    }
                    // Update product info if missing in ledger
                    if (!ledgerProducts[pid].productCode) {
                        const code = extractProductCode(product);
                        if (code) db.ref(`live_ledger/${campaignId}/products/${pid}/productCode`).set(code);
                    }
                    if (!ledgerProducts[pid].productName || ledgerProducts[pid].productName === '—') {
                        const name = extractProductName(product);
                        if (name) db.ref(`live_ledger/${campaignId}/products/${pid}/productName`).set(name);
                    }
                    if (!ledgerProducts[pid].nccName) {
                        const ncc = extractNccName(product);
                        if (ncc) db.ref(`live_ledger/${campaignId}/products/${pid}/nccName`).set(ncc);
                    }
                    // Update stock from QtyAvailable
                    if (product.QtyAvailable > 0 && ledgerProducts[pid].stockQty === 0) {
                        db.ref(`live_ledger/${campaignId}/products/${pid}/stockQty`).set(product.QtyAvailable);
                    }
                } else if (soldQty > 0) {
                    db.ref(`live_ledger/${campaignId}/products/${pid}`).set({
                        productCode: extractProductCode(product),
                        productName: extractProductName(product),
                        nccName: extractNccName(product),
                        customerOrderQty: 0,
                        duyenOrderQty: soldQty,
                        nccDeliveredQty: 0,
                        stockQty: product.QtyAvailable || 0,
                        notes: '',
                        lastUpdated: Date.now()
                    });
                    updated = true;
                }
            });

            if (updated) console.log('[LEDGER] Synced soldQty from order-management');
        });
    }

    // =====================================================
    // SAVE CELL
    // =====================================================

    function saveCell(productId, field, value) {
        const campaignId = getCampaignId();
        if (!campaignId || !productId) return;

        const db = getDb();
        if (!db) return;

        const numValue = (field === 'notes') ? value : (parseInt(value) || 0);
        db.ref(`live_ledger/${campaignId}/products/${productId}/${field}`).set(numValue);
        db.ref(`live_ledger/${campaignId}/products/${productId}/lastUpdated`).set(Date.now());

        if (field === 'duyenOrderQty') {
            _syncingFromSave = true;
            db.ref(`orderProducts/product_${productId}/soldQty`).set(numValue);
            setTimeout(() => { _syncingFromSave = false; }, 500);
        }
    }

    // =====================================================
    // RENDER
    // =====================================================

    function renderFilteredTable() {
        const nccFilter = document.getElementById('ledgerNccFilter');
        const nccValue = nccFilter ? nccFilter.value : '';

        let products = Object.entries(ledgerProducts).map(([pid, data]) => ({
            id: pid, ...data
        }));

        if (nccValue) {
            products = products.filter(p => p.nccName === nccValue);
        }

        renderLedgerTable(products);
    }

    function renderLedgerTable(products) {
        const container = document.getElementById('ledgerContent');
        if (!container) return;

        if (!products || products.length === 0) {
            if (getCampaignName()) {
                container.innerHTML = `
                    <div class="ledger-empty-inline">
                        <i class="fas fa-inbox"></i>
                        <p>Chưa có dữ liệu sổ sách cho chiến dịch này</p>
                        <p style="font-size: 12px;">Nhấn "Cập nhật sổ sách" để tổng hợp từ dữ liệu đã tải</p>
                    </div>`;
            } else {
                showEmpty();
            }
            return;
        }

        products.sort((a, b) => (a.productCode || '').localeCompare(b.productCode || ''));

        let totalCustomer = 0, totalDuyen = 0, totalNcc = 0, totalStock = 0;

        const rows = products.map((p, i) => {
            // Chênh lệch 1: Khách đặt vs Duyên order
            const diff1 = (p.customerOrderQty || 0) - (p.duyenOrderQty || 0);
            const diff1Class = diff1 > 0 ? 'diff-positive' : diff1 < 0 ? 'diff-negative' : 'diff-zero';
            const diff1Text = diff1 > 0 ? `+${diff1}` : diff1 === 0 ? '0' : String(diff1);

            // Chênh lệch 2: Duyên order vs NCC giao
            const diff2 = (p.duyenOrderQty || 0) - (p.nccDeliveredQty || 0);
            const diff2Class = diff2 > 0 ? 'diff-positive' : diff2 < 0 ? 'diff-negative' : 'diff-zero';
            const diff2Text = diff2 > 0 ? `+${diff2}` : diff2 === 0 ? '0' : String(diff2);

            totalCustomer += (p.customerOrderQty || 0);
            totalDuyen += (p.duyenOrderQty || 0);
            totalNcc += (p.nccDeliveredQty || 0);
            totalStock += (p.stockQty || 0);

            return `<tr>
                <td>${i + 1}</td>
                <td class="ledger-code">${p.productCode || '—'}</td>
                <td>${p.productName || '—'}</td>
                <td>${p.nccName || '—'}</td>
                <td class="text-right">${p.customerOrderQty || 0}</td>
                <td class="ledger-editable"><input type="number" value="${p.duyenOrderQty || 0}" min="0"
                    onblur="window.ledgerModule.saveCell('${p.id}', 'duyenOrderQty', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"></td>
                <td class="text-center"><span class="${diff1Class}">${diff1Text}</span></td>
                <td class="ledger-editable"><input type="number" value="${p.nccDeliveredQty || 0}" min="0"
                    onblur="window.ledgerModule.saveCell('${p.id}', 'nccDeliveredQty', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"></td>
                <td class="text-center"><span class="${diff2Class}">${diff2Text}</span></td>
                <td class="ledger-editable"><input type="number" value="${p.stockQty || 0}" min="0"
                    onblur="window.ledgerModule.saveCell('${p.id}', 'stockQty', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"></td>
                <td class="ledger-editable"><input type="text" value="${p.notes || ''}" placeholder="Ghi chú..."
                    onblur="window.ledgerModule.saveCell('${p.id}', 'notes', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"></td>
            </tr>`;
        }).join('');

        const totalDiff1 = totalCustomer - totalDuyen;
        const totalDiff1Class = totalDiff1 > 0 ? 'diff-positive' : totalDiff1 < 0 ? 'diff-negative' : 'diff-zero';
        const totalDiff2 = totalDuyen - totalNcc;
        const totalDiff2Class = totalDiff2 > 0 ? 'diff-positive' : totalDiff2 < 0 ? 'diff-negative' : 'diff-zero';

        container.innerHTML = `
            <table class="ledger-table-inline">
                <thead><tr>
                    <th>#</th><th>Mã SP</th><th>Tên SP</th><th>NCC</th>
                    <th class="text-right">SL Khách đặt</th>
                    <th class="text-right">SL Duyên order</th>
                    <th class="text-center">CL K-D</th>
                    <th class="text-right">SL NCC giao</th>
                    <th class="text-center">CL D-N</th>
                    <th class="text-right">Tồn kho</th>
                    <th>Ghi chú</th>
                </tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr>
                    <td colspan="4" class="text-right"><strong>Tổng (${products.length} SP):</strong></td>
                    <td class="text-right"><strong>${totalCustomer}</strong></td>
                    <td class="text-right"><strong>${totalDuyen}</strong></td>
                    <td class="text-center"><strong class="${totalDiff1Class}">${totalDiff1 > 0 ? '+' + totalDiff1 : totalDiff1}</strong></td>
                    <td class="text-right"><strong>${totalNcc}</strong></td>
                    <td class="text-center"><strong class="${totalDiff2Class}">${totalDiff2 > 0 ? '+' + totalDiff2 : totalDiff2}</strong></td>
                    <td class="text-right"><strong>${totalStock}</strong></td>
                    <td></td>
                </tr></tfoot>
            </table>`;
    }

    function populateNccFilter() {
        const nccSet = new Set();
        Object.values(ledgerProducts).forEach(p => {
            if (p.nccName) nccSet.add(p.nccName);
        });

        const select = document.getElementById('ledgerNccFilter');
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">Tất cả NCC</option>';
        Array.from(nccSet).sort().forEach(ncc => {
            const opt = document.createElement('option');
            opt.value = ncc;
            opt.textContent = ncc;
            if (ncc === currentVal) opt.selected = true;
            select.appendChild(opt);
        });
    }

    // =====================================================
    // HELPERS
    // =====================================================

    function showEmpty(msg) {
        const el = document.getElementById('ledgerContent');
        if (!el) return;
        el.innerHTML = `
            <div class="ledger-empty-inline">
                <i class="fas fa-book-open"></i>
                <p>${msg || 'Chọn chiến dịch live để xem sổ sách'}</p>
                <p style="font-size: 12px;">Dữ liệu sẽ tổng hợp từ đơn hàng đã tải và Quản lý Order</p>
            </div>`;
    }

    function showLoading() {
        const el = document.getElementById('ledgerContent');
        if (!el) return;
        el.innerHTML = `<div class="ledger-loading-inline"><i class="fas fa-spinner spinning"></i> Đang tổng hợp sổ sách...</div>`;
    }

    function detachListeners() {
        const db = getDb();
        if (ledgerListener) {
            ledgerListener.off();
            ledgerListener = null;
        }
        if (orderManagementListener && db) {
            db.ref('orderProducts').off('value', orderManagementListener);
            orderManagementListener = null;
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    window.ledgerModule = {
        refreshFromCachedData: refreshFromCachedData,
        saveCell: saveCell,
        onNccChange: renderFilteredTable
    };

})();
