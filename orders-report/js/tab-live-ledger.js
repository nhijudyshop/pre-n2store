/**
 * Tab Live Ledger — Sổ Sách Live Order Tracking
 *
 * Bảng tổng hợp so sánh: SL Khách đặt vs SL Duyên order NCC vs SL NCC giao vs Tồn kho
 *
 * Firebase paths:
 * - live_ledger/{campaignId}/metadata — campaign info
 * - live_ledger/{campaignId}/products/{productId} — per-product ledger data
 * - report_order_details/{campaignName}/orders — TPOS orders data (read-only)
 * - orderProducts/product_{id} — order-management data (Duyên, 2-way sync)
 */
(function () {
    'use strict';

    let db = null;
    let currentCampaignId = '';
    let currentCampaignName = '';
    let ledgerProducts = {};
    let orderManagementListener = null;
    let ledgerListener = null;
    let _syncingFromSave = false; // Prevent echo loop in 2-way sync

    // =====================================================
    // INITIALIZATION
    // =====================================================

    async function init() {
        try {
            if (!firebase.apps.length) {
                if (typeof FIREBASE_CONFIG !== 'undefined') {
                    firebase.initializeApp(FIREBASE_CONFIG);
                } else if (typeof firebaseConfig !== 'undefined') {
                    firebase.initializeApp(firebaseConfig);
                }
            }
            db = firebase.database();
            console.log('[LEDGER] ✓ Firebase initialized');

            await loadCampaigns();
        } catch (error) {
            console.error('[LEDGER] Init error:', error);
        }
    }

    // =====================================================
    // CAMPAIGNS
    // =====================================================

    async function loadCampaigns() {
        try {
            const snapshot = await db.ref('report_order_details').once('value');
            const data = snapshot.val() || {};
            const campaignNames = Object.keys(data).sort().reverse();

            const select = document.getElementById('campaignFilter');
            select.innerHTML = '<option value="">-- Chọn đợt live --</option>';

            campaignNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });

            console.log('[LEDGER] Loaded', campaignNames.length, 'campaigns');
        } catch (error) {
            console.error('[LEDGER] Error loading campaigns:', error);
        }
    }

    window.onCampaignChange = function () {
        const name = document.getElementById('campaignFilter').value;
        if (!name) {
            showEmpty();
            detachListeners();
            return;
        }
        currentCampaignName = name;
        currentCampaignId = name.replace(/[.$#\[\]\/]/g, '_');
        loadLedgerData();
        setupOrderManagementSync();
    };

    window.onDateChange = async function () {
        const dateFilter = document.getElementById('dateFilter').value;
        if (!dateFilter) {
            // No date selected — reload all campaigns
            await loadCampaigns();
            return;
        }

        // Filter campaigns by date — check campaign metadata
        try {
            const snapshot = await db.ref('report_order_details').once('value');
            const data = snapshot.val() || {};
            const campaignNames = Object.keys(data).sort().reverse();

            // Also check live_ledger metadata for date info
            const ledgerSnapshot = await db.ref('live_ledger').once('value');
            const ledgerData = ledgerSnapshot.val() || {};

            const select = document.getElementById('campaignFilter');
            select.innerHTML = '<option value="">-- Chọn đợt live --</option>';

            campaignNames.forEach(name => {
                const campaignId = name.replace(/[.$#\[\]\/]/g, '_');
                const meta = ledgerData[campaignId]?.metadata;
                const campaignDate = meta?.date || '';

                // Show campaign if its date matches, or if no metadata yet (show all)
                if (!campaignDate || campaignDate === dateFilter) {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    select.appendChild(opt);
                }
            });
        } catch (error) {
            console.error('[LEDGER] Error filtering by date:', error);
        }
    };

    window.onNccChange = function () {
        renderFilteredTable();
    };

    // =====================================================
    // LOAD LEDGER DATA
    // =====================================================

    async function loadLedgerData() {
        showLoading();
        detachListeners();

        try {
            // Load existing ledger data
            const ledgerRef = db.ref(`live_ledger/${currentCampaignId}/products`);
            const snapshot = await ledgerRef.once('value');
            ledgerProducts = snapshot.val() || {};

            // Setup realtime listener for ledger changes
            ledgerListener = ledgerRef;
            ledgerRef.on('value', (snap) => {
                ledgerProducts = snap.val() || {};
                renderFilteredTable();
            });

            renderFilteredTable();
            populateNccFilter();
            console.log('[LEDGER] Loaded', Object.keys(ledgerProducts).length, 'products');
        } catch (error) {
            console.error('[LEDGER] Error loading ledger:', error);
            showEmpty('Lỗi tải dữ liệu');
        }
    }

    // =====================================================
    // SYNC FROM ORDER-MANAGEMENT (Duyên's soldQty)
    // =====================================================

    function setupOrderManagementSync() {
        if (orderManagementListener) {
            db.ref('orderProducts').off('value', orderManagementListener);
        }

        orderManagementListener = db.ref('orderProducts').on('value', (snapshot) => {
            // Skip if this change was triggered by our own saveCell (prevent echo loop)
            if (_syncingFromSave) return;

            const orderProducts = snapshot.val() || {};
            let updated = false;

            Object.entries(orderProducts).forEach(([, product]) => {
                if (!product || !product.Id) return;
                const pid = String(product.Id);
                const soldQty = product.soldQty || 0;

                if (ledgerProducts[pid]) {
                    // Existing product — update duyenOrderQty if changed
                    if (ledgerProducts[pid].duyenOrderQty !== soldQty) {
                        db.ref(`live_ledger/${currentCampaignId}/products/${pid}/duyenOrderQty`).set(soldQty);
                        updated = true;
                    }
                } else if (soldQty > 0) {
                    // New product from order-management — auto-create ledger entry
                    db.ref(`live_ledger/${currentCampaignId}/products/${pid}`).set({
                        productCode: product.ProductCode || product.Code || '',
                        productName: product.ProductName || product.Name || product.ProductNameGet || '',
                        nccName: product.supplierName || product.nccName || '',
                        customerOrderQty: 0,
                        duyenOrderQty: soldQty,
                        nccDeliveredQty: 0,
                        stockQty: 0,
                        notes: '',
                        lastUpdated: Date.now()
                    });
                    updated = true;
                }
            });

            if (updated) {
                console.log('[LEDGER] Synced soldQty from order-management');
            }
        });
    }

    // =====================================================
    // PULL CUSTOMER ORDER QTY FROM TPOS ORDERS
    // =====================================================

    window.refreshOrderData = async function () {
        if (!currentCampaignName) return;

        const btn = document.getElementById('btnRefresh');
        btn.disabled = true;
        btn.classList.add('loading');

        try {
            // Pull orders from report_order_details
            const snapshot = await db.ref(`report_order_details/${currentCampaignName}/orders`).once('value');
            const orders = snapshot.val() || [];

            // Aggregate qty per productId
            const qtyMap = {};
            const productInfoMap = {};

            (Array.isArray(orders) ? orders : Object.values(orders)).forEach(order => {
                (order.Details || []).forEach(detail => {
                    const pid = String(detail.ProductId);
                    qtyMap[pid] = (qtyMap[pid] || 0) + (detail.Quantity || 0);

                    if (!productInfoMap[pid]) {
                        productInfoMap[pid] = {
                            productCode: detail.ProductCode || detail.Code || '',
                            productName: detail.ProductName || detail.Name || '',
                        };
                    }
                });
            });

            // Also pull order-management data for Duyên's soldQty
            const omSnapshot = await db.ref('orderProducts').once('value');
            const orderProducts = omSnapshot.val() || {};
            const duyenQtyMap = {};
            const nccMap = {};

            Object.entries(orderProducts).forEach(([, product]) => {
                if (!product || !product.Id) return;
                const pid = String(product.Id);
                duyenQtyMap[pid] = product.soldQty || 0;
                // Try to get NCC info if available
                if (product.supplierName || product.nccName) {
                    nccMap[pid] = product.supplierName || product.nccName || '';
                }
            });

            // Merge all product IDs
            const allPids = new Set([...Object.keys(qtyMap), ...Object.keys(duyenQtyMap)]);

            // Update ledger in Firebase
            const updates = {};
            allPids.forEach(pid => {
                const existing = ledgerProducts[pid] || {};
                updates[pid] = {
                    productCode: existing.productCode || productInfoMap[pid]?.productCode || '',
                    productName: existing.productName || productInfoMap[pid]?.productName || '',
                    nccName: existing.nccName || nccMap[pid] || '',
                    customerOrderQty: qtyMap[pid] || existing.customerOrderQty || 0,
                    duyenOrderQty: duyenQtyMap[pid] || existing.duyenOrderQty || 0,
                    nccDeliveredQty: existing.nccDeliveredQty || 0,
                    stockQty: existing.stockQty || 0,
                    notes: existing.notes || '',
                    lastUpdated: Date.now()
                };
            });

            if (Object.keys(updates).length > 0) {
                await db.ref(`live_ledger/${currentCampaignId}/products`).update(updates);

                // Also save metadata
                await db.ref(`live_ledger/${currentCampaignId}/metadata`).set({
                    campaignName: currentCampaignName,
                    date: new Date().toISOString().split('T')[0],
                    lastUpdated: Date.now()
                });
            }

            console.log('[LEDGER] ✓ Refreshed', Object.keys(updates).length, 'products from', (Array.isArray(orders) ? orders : Object.values(orders)).length, 'orders');

        } catch (error) {
            console.error('[LEDGER] Error refreshing:', error);
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    };

    // =====================================================
    // SAVE CELL (auto-save on blur)
    // =====================================================

    window.saveCell = async function (productId, field, value) {
        if (!currentCampaignId || !productId) return;

        try {
            const numValue = (field === 'notes') ? value : (parseInt(value) || 0);
            await db.ref(`live_ledger/${currentCampaignId}/products/${productId}/${field}`).set(numValue);
            await db.ref(`live_ledger/${currentCampaignId}/products/${productId}/lastUpdated`).set(Date.now());

            // 2-way sync: if editing duyenOrderQty, also update order-management
            if (field === 'duyenOrderQty') {
                _syncingFromSave = true;
                const productKey = `product_${productId}`;
                await db.ref(`orderProducts/${productKey}/soldQty`).set(numValue);
                // Reset flag after a short delay to allow Firebase listener to fire
                setTimeout(() => { _syncingFromSave = false; }, 500);
                console.log('[LEDGER] ✓ Synced duyenOrderQty → order-management soldQty');
            }

            console.log('[LEDGER] ✓ Saved', field, '=', numValue, 'for product', productId);
        } catch (error) {
            console.error('[LEDGER] Error saving cell:', error);
            _syncingFromSave = false;
        }
    };

    // =====================================================
    // RENDER
    // =====================================================

    function renderFilteredTable() {
        const nccFilter = document.getElementById('nccFilter').value;

        let products = Object.entries(ledgerProducts).map(([pid, data]) => ({
            id: pid,
            ...data
        }));

        // Filter by NCC
        if (nccFilter) {
            products = products.filter(p => p.nccName === nccFilter);
        }

        renderLedgerTable(products);
    }

    function renderLedgerTable(products) {
        const container = document.getElementById('ledgerContent');

        if (!products || products.length === 0) {
            if (currentCampaignName) {
                container.innerHTML = `
                    <div class="ledger-empty">
                        <i class="fas fa-inbox"></i>
                        <p>Chưa có dữ liệu cho đợt live này</p>
                        <p style="font-size: 12px;">Nhấn "Refresh đơn hàng" để pull dữ liệu từ TPOS</p>
                    </div>`;
            } else {
                showEmpty();
            }
            return;
        }

        // Sort by productCode
        products.sort((a, b) => (a.productCode || '').localeCompare(b.productCode || ''));

        // Calculate totals
        let totalCustomer = 0, totalDuyen = 0, totalNcc = 0, totalStock = 0;

        const rows = products.map((p, i) => {
            const diff = (p.duyenOrderQty || 0) - (p.nccDeliveredQty || 0);
            const diffClass = diff > 0 ? 'diff-positive' : diff < 0 ? 'diff-negative' : 'diff-zero';
            const diffText = diff > 0 ? `+${diff}` : diff === 0 ? '0' : String(diff);

            totalCustomer += (p.customerOrderQty || 0);
            totalDuyen += (p.duyenOrderQty || 0);
            totalNcc += (p.nccDeliveredQty || 0);
            totalStock += (p.stockQty || 0);

            return `<tr>
                <td>${i + 1}</td>
                <td style="font-weight: 600; color: #3b82f6;">${p.productCode || '—'}</td>
                <td>${p.productName || '—'}</td>
                <td>${p.nccName || '—'}</td>
                <td style="text-align: right;">${p.customerOrderQty || 0}</td>
                <td class="editable-cell">
                    <input type="number" value="${p.duyenOrderQty || 0}" min="0"
                        onblur="saveCell('${p.id}', 'duyenOrderQty', this.value)"
                        onkeydown="if(event.key==='Enter') this.blur()">
                </td>
                <td class="editable-cell">
                    <input type="number" value="${p.nccDeliveredQty || 0}" min="0"
                        onblur="saveCell('${p.id}', 'nccDeliveredQty', this.value)"
                        onkeydown="if(event.key==='Enter') this.blur()">
                </td>
                <td class="editable-cell">
                    <input type="number" value="${p.stockQty || 0}" min="0"
                        onblur="saveCell('${p.id}', 'stockQty', this.value)"
                        onkeydown="if(event.key==='Enter') this.blur()">
                </td>
                <td style="text-align: center;"><span class="${diffClass}">${diffText}</span></td>
                <td class="editable-cell">
                    <input type="text" class="notes-input" value="${p.notes || ''}" placeholder="Ghi chú..."
                        onblur="saveCell('${p.id}', 'notes', this.value)"
                        onkeydown="if(event.key==='Enter') this.blur()">
                </td>
            </tr>`;
        }).join('');

        const totalDiff = totalDuyen - totalNcc;
        const totalDiffClass = totalDiff > 0 ? 'diff-positive' : totalDiff < 0 ? 'diff-negative' : 'diff-zero';

        container.innerHTML = `
            <table class="ledger-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Mã SP</th>
                        <th>Tên SP</th>
                        <th>NCC</th>
                        <th style="text-align: right;">SL Khách đặt</th>
                        <th style="text-align: right;">SL Duyên order</th>
                        <th style="text-align: right;">SL NCC giao</th>
                        <th style="text-align: right;">Tồn kho</th>
                        <th style="text-align: center;">Chênh lệch</th>
                        <th>Ghi chú</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right;">Tổng cộng (${products.length} SP):</td>
                        <td style="text-align: right;">${totalCustomer}</td>
                        <td style="text-align: right;">${totalDuyen}</td>
                        <td style="text-align: right;">${totalNcc}</td>
                        <td style="text-align: right;">${totalStock}</td>
                        <td style="text-align: center;" class="${totalDiffClass}">${totalDiff > 0 ? '+' + totalDiff : totalDiff}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>`;
    }

    function populateNccFilter() {
        const nccSet = new Set();
        Object.values(ledgerProducts).forEach(p => {
            if (p.nccName) nccSet.add(p.nccName);
        });

        const select = document.getElementById('nccFilter');
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
        document.getElementById('ledgerContent').innerHTML = `
            <div class="ledger-empty">
                <i class="fas fa-book-open"></i>
                <p>${msg || 'Chọn đợt live để xem sổ sách'}</p>
                <p style="font-size: 12px;">Dữ liệu sẽ đồng bộ từ Quản lý Order và đơn hàng TPOS</p>
            </div>`;
    }

    function showLoading() {
        document.getElementById('ledgerContent').innerHTML = `
            <div class="ledger-loading">
                <i class="fas fa-spinner"></i> Đang tải dữ liệu...
            </div>`;
    }

    function detachListeners() {
        if (ledgerListener) {
            ledgerListener.off();
            ledgerListener = null;
        }
        if (orderManagementListener) {
            db.ref('orderProducts').off('value', orderManagementListener);
            orderManagementListener = null;
        }
    }

    // =====================================================
    // INIT
    // =====================================================

    document.addEventListener('DOMContentLoaded', init);

})();
