/**
 * PURCHASE ORDERS MODULE - HISTORY TAB (Lịch sử)
 * File: history-tab.js
 * Purpose: Fetch and display FastPurchaseOrder data from TPOS API with paging
 */

window.PurchaseOrderHistory = (function () {
    'use strict';

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const PAGE_SIZE = 20;

    let currentPage = 1;
    let totalCount = 0;
    let isLoading = false;
    let currentData = [];
    // Track expanded rows: { orderId: orderLinesData[] }
    const expandedRows = {};
    // Track done rows: Set of orderId (synced to Firestore)
    const doneRows = new Set();
    const DONE_DOC_PATH = 'purchase_history_done/done_invoices';
    let doneLoaded = false;

    // DOM containers (set during init)
    let tableContainer = null;
    let paginationContainer = null;
    let filterContainer = null;

    // Filter state
    let filterStartDate = null;
    let filterEndDate = null;
    let searchTerm = '';

    /**
     * Initialize with default date range (current month)
     */
    function init() {
        tableContainer = document.getElementById('tableContainer');
        paginationContainer = document.getElementById('pagination');
        filterContainer = document.getElementById('filterBar');

        // Default: current month
        const now = new Date();
        filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        filterEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        renderHistoryFilterBar();
        loadDoneRows().then(() => loadPage(1));
    }

    /**
     * Load done rows from Firestore
     */
    async function loadDoneRows() {
        if (doneLoaded) return;
        try {
            const db = firebase.firestore();
            const doc = await db.doc(DONE_DOC_PATH).get();
            if (doc.exists) {
                const ids = doc.data().ids || [];
                ids.forEach(id => doneRows.add(id));
            }
            doneLoaded = true;
        } catch (e) {
            console.warn('[History] Failed to load done rows:', e);
        }
    }

    /**
     * Save done rows to Firestore
     */
    function saveDoneRows() {
        try {
            const db = firebase.firestore();
            db.doc(DONE_DOC_PATH).set({ ids: Array.from(doneRows), lastUpdated: Date.now() });
        } catch (e) {
            console.warn('[History] Failed to save done rows:', e);
        }
    }

    /**
     * Render a simplified filter bar for history tab
     */
    function renderHistoryFilterBar() {
        if (!filterContainer) return;

        const fmt = (d) => {
            if (!d) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        filterContainer.innerHTML = `
            <div class="filter-bar">
                <div class="filter-group">
                    <label class="filter-label">Từ ngày</label>
                    <div class="input-icon">
                        <i data-lucide="calendar"></i>
                        <input type="date" id="historyStartDate" class="filter-input" value="${fmt(filterStartDate)}">
                    </div>
                </div>
                <div class="filter-group">
                    <label class="filter-label">Đến ngày</label>
                    <div class="input-icon">
                        <i data-lucide="calendar"></i>
                        <input type="date" id="historyEndDate" class="filter-input" value="${fmt(filterEndDate)}">
                    </div>
                </div>
                <div class="filter-group filter-group--search">
                    <label class="filter-label">Tìm NCC</label>
                    <div class="input-icon">
                        <i data-lucide="search"></i>
                        <input type="text" id="historySearchInput" class="filter-input"
                               value="${searchTerm}"
                               placeholder="Tên NCC... (Enter để tìm)">
                    </div>
                </div>
                <div class="filter-group filter-group--actions">
                    <button id="btnHistoryFilter" class="btn btn-primary">
                        <i data-lucide="search"></i>
                        <span>Tìm</span>
                    </button>
                    <button id="btnHistoryReload" class="btn btn-outline" title="Tải lại bảng">
                        <i data-lucide="refresh-cw"></i>
                    </button>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        const applyFilters = () => {
            const s = document.getElementById('historyStartDate').value;
            const e = document.getElementById('historyEndDate').value;
            filterStartDate = s ? new Date(s) : null;
            filterEndDate = e ? new Date(e + 'T23:59:59') : null;
            searchTerm = (document.getElementById('historySearchInput').value || '').trim();
            loadPage(1);
        };

        document.getElementById('btnHistoryFilter').addEventListener('click', applyFilters);
        document.getElementById('btnHistoryReload').addEventListener('click', () => loadPage(currentPage));

        const searchInput = document.getElementById('historySearchInput');
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyFilters();
            }
        });
        // Clear search: when input is emptied, reload full list
        searchInput.addEventListener('input', () => {
            if (searchInput.value === '' && searchTerm !== '') {
                searchTerm = '';
                loadPage(1);
            }
        });
    }

    /**
     * Build the OData URL for FastPurchaseOrder
     */
    function buildUrl(page) {
        const skip = (page - 1) * PAGE_SIZE;
        let url = `${PROXY_URL}/api/odata/FastPurchaseOrder/OdataService.GetView?&$top=${PAGE_SIZE}`;
        if (skip > 0) url += `&$skip=${skip}`;
        url += `&$orderby=DateInvoice+desc,Id+desc`;

        // Build filter
        const filters = ["Type eq 'invoice'"];
        if (filterStartDate) {
            const iso = toUTCISOString(filterStartDate);
            filters.push(`DateInvoice ge ${iso}`);
        }
        if (filterEndDate) {
            const iso = toUTCISOString(filterEndDate);
            filters.push(`DateInvoice le ${iso}`);
        }
        if (searchTerm) {
            // Remove Vietnamese diacritics for PartnerNameNoSign search
            const normalized = removeVietnameseDiacritics(searchTerm).toLowerCase();
            filters.push(`contains(PartnerNameNoSign,'${encodeODataString(normalized)}')`);
        }
        url += `&$filter=(${filters.join(' and ')})`;
        url += `&$count=true`;

        return url;
    }

    /**
     * Convert date to UTC ISO string for OData filter (offset +07:00 → subtract 7h)
     */
    function toUTCISOString(date) {
        const utc = new Date(date.getTime() - 7 * 60 * 60 * 1000);
        // Encode special chars: + → %2B, : → %3A (OData URL requires this)
        return utc.toISOString().replace('Z', '%2B00%3A00').replaceAll(':', '%3A');
    }

    /**
     * Load a page of data from TPOS API
     */
    async function loadPage(page) {
        if (isLoading) return;
        isLoading = true;
        currentPage = page;

        renderLoading();

        try {
            if (!window.TPOSClient?.authenticatedFetch) {
                throw new Error('TPOSClient not available');
            }
            const url = buildUrl(page);

            const response = await window.TPOSClient.authenticatedFetch(url);

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            totalCount = data['@odata.count'] || 0;
            currentData = data.value || [];

            renderTable(currentData);
            renderPagination();
        } catch (error) {
            console.error('[History] Load failed:', error);
            renderError(error.message);
        } finally {
            isLoading = false;
        }
    }

    /**
     * Format number as VND (with dot separator)
     */
    function formatMoney(value) {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(value);
    }

    /**
     * Format date from ISO string
     */
    function formatDate(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year}\n${hours}:${minutes}`;
    }

    /**
     * Render the history table
     */
    function renderTable(items) {
        if (!tableContainer) return;

        if (!items || items.length === 0) {
            tableContainer.innerHTML = `
                <div class="table-empty">
                    <div class="table-empty__icon"><i data-lucide="inbox"></i></div>
                    <div class="table-empty__title">Không có dữ liệu</div>
                    <div class="table-empty__description">Không tìm thấy hóa đơn nào trong khoảng thời gian này</div>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const rows = items.map((item, idx) => {
            const dateFormatted = formatDate(item.DateInvoice);
            const dateParts = dateFormatted.split('\n');
            const isExpanded = !!expandedRows[item.Id];
            const isDone = doneRows.has(item.Id);
            return `
                <tr class="order-row ${idx === 0 ? 'order-row--first' : ''} ${isExpanded ? 'order-row--expanded' : ''} ${isDone ? 'order-row--done' : ''}"
                    data-order-id="${item.Id}" style="border-top: ${idx > 0 ? '1px solid var(--color-border-light)' : 'none'}; cursor: pointer; position: relative;">
                    <td style="width: 36px; text-align: center;" onclick="event.stopPropagation();">
                        <input type="checkbox" class="history-done-cb" data-id="${item.Id}" ${isDone ? 'checked' : ''}
                               style="width: 16px; height: 16px; cursor: pointer; accent-color: #22c55e;">
                    </td>
                    <td>
                        <div class="cell-supplier">
                            <span class="supplier-name">${escapeHtml(item.PartnerDisplayName || '')}</span>
                        </div>
                    </td>
                    <td>
                        <div class="date-info">
                            <span class="date-main">${dateParts[0] || ''}</span>
                            <span class="date-time">${dateParts[1] || ''}</span>
                        </div>
                    </td>
                    <td><span style="font-family: monospace; font-size: 13px;">${escapeHtml(item.Number || '')}</span></td>
                    <td class="text-right"><span class="price-value">${formatMoney(item.AmountTotal)}</span></td>
                    <td>${renderState(item.ShowState, item.State)}</td>
                    <td><span style="font-size: 13px;">${escapeHtml(item.UserName || '')}</span></td>
                    <td><span style="font-size: 13px;">${escapeHtml(item.CompanyName || '')}</span></td>
                </tr>
                <tr class="expand-row" id="expand-${item.Id}" style="display: ${isExpanded ? 'table-row' : 'none'};">
                    <td colspan="8" style="padding: 0; background: #f8fafc;">
                        <div class="expand-content" id="expand-content-${item.Id}">
                            ${isExpanded ? renderExpandedContent(item.Id, item) : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tableContainer.innerHTML = `
            <div class="table-wrapper">
                <table class="po-table">
                    <thead>
                        <tr>
                            <th style="width: 36px;"></th>
                            <th>Nhà cung cấp</th>
                            <th style="width: 120px;">Ngày đơn hàng</th>
                            <th>Số</th>
                            <th class="text-right">Tổng tiền</th>
                            <th>Trạng thái</th>
                            <th>Nhân viên</th>
                            <th>Công ty</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind row click to toggle expand
        tableContainer.querySelectorAll('tr.order-row[data-order-id]').forEach(row => {
            row.addEventListener('click', () => {
                const orderId = parseInt(row.dataset.orderId, 10);
                toggleExpandRow(orderId);
            });
        });

        // Bind checkbox for Done watermark (persisted to Firestore)
        tableContainer.querySelectorAll('.history-done-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = parseInt(cb.dataset.id, 10);
                const row = tableContainer.querySelector(`tr.order-row[data-order-id="${id}"]`);
                if (cb.checked) {
                    doneRows.add(id);
                    row?.classList.add('order-row--done');
                } else {
                    doneRows.delete(id);
                    row?.classList.remove('order-row--done');
                }
                saveDoneRows();
            });
        });
    }

    /**
     * Toggle expand/collapse for a row
     */
    async function toggleExpandRow(orderId) {
        const expandRow = document.getElementById(`expand-${orderId}`);
        const contentDiv = document.getElementById(`expand-content-${orderId}`);
        const mainRow = tableContainer.querySelector(`tr.order-row[data-order-id="${orderId}"]`);
        if (!expandRow || !contentDiv) return;

        if (expandedRows[orderId]) {
            // Collapse
            delete expandedRows[orderId];
            expandRow.style.display = 'none';
            mainRow?.classList.remove('order-row--expanded');
            return;
        }

        // Expand: show loading, fetch data
        expandRow.style.display = 'table-row';
        mainRow?.classList.add('order-row--expanded');

        const item = currentData.find(d => d.Id === orderId);
        contentDiv.innerHTML = '<div style="padding: 12px 16px; color: var(--color-text-muted); font-size: 13px;">Đang tải chi tiết...</div>';

        try {
            // Ensure Notes items are loaded so we can check existing keys
            if (window.PurchaseOrderNotes?.loadItems) {
                await window.PurchaseOrderNotes.loadItems();
            }
            const url = `${PROXY_URL}/api/odata/FastPurchaseOrder(${orderId})/OrderLines?$expand=Product,ProductUOM,Account`;
            const response = await window.TPOSClient.authenticatedFetch(url);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const lines = data.value || [];
            expandedRows[orderId] = lines;
            contentDiv.innerHTML = renderExpandedContent(orderId, item, lines);
            if (typeof lucide !== 'undefined') lucide.createIcons();
            bindNoteCheckboxes(contentDiv);
        } catch (error) {
            console.error('[History] Expand failed:', error);
            contentDiv.innerHTML = `<div style="padding: 12px 16px; color: var(--color-danger); font-size: 13px;">Lỗi: ${escapeHtml(error.message)}</div>`;
        }
    }

    /**
     * Render expanded detail content (order lines table)
     */
    function renderExpandedContent(orderId, item, lines) {
        if (!lines) lines = expandedRows[orderId];
        if (!lines || lines.length === 0) {
            return '<div style="padding: 12px 16px; color: var(--color-text-muted); font-size: 13px;">Không có chi tiết sản phẩm</div>';
        }

        const supplierName = item?.PartnerDisplayName || '';
        const lineRows = lines.map((line, idx) => {
            const lineKey = `${orderId}_${line.Id}`;
            const alreadyInNotes = window.PurchaseOrderNotes?.hasKey?.(lineKey) || false;
            return `
            <tr${alreadyInNotes ? ' style="opacity: 0.5;"' : ''}>
                <td style="text-align: center; width: 40px;">${idx + 1}</td>
                <td style="font-weight: 500;">${escapeHtml(line.Name || line.ProductNameGet || line.ProductName || '')}</td>
                <td style="text-align: right; width: 80px;">${line.ProductQty ?? ''}</td>
                <td style="text-align: right; width: 120px;">${formatMoney(line.PriceUnit)}</td>
                <td style="text-align: right; width: 120px;">${formatMoney(line.PriceSubTotal)}</td>
                <td style="text-align: center; width: 36px;">
                    <input type="checkbox" class="note-product-cb" title="Thêm vào Ghi chú"
                           data-key="${lineKey}"
                           data-order-id="${orderId}"
                           data-line-id="${line.Id}"
                           data-product-name="${escapeHtml(line.Name || line.ProductNameGet || line.ProductName || '')}"
                           data-product-code="${escapeHtml(line.ProductBarcode || line.Product?.DefaultCode || '')}"
                           data-supplier="${escapeHtml(supplierName)}"
                           data-qty="${line.ProductQty || 0}"
                           data-price="${line.PriceUnit || 0}"
                           ${alreadyInNotes ? 'checked disabled' : ''}
                           style="width: 15px; height: 15px; cursor: pointer; accent-color: #3b82f6;">
                </td>
            </tr>`;
        }).join('');

        const totalAmount = item?.AmountTotal || lines.reduce((s, l) => s + (l.PriceSubTotal || 0), 0);
        const residual = item?.Residual ?? totalAmount;

        return `
            <div style="padding: 8px 16px 12px 36px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #e2e8f0; font-weight: 600;">
                            <th style="padding: 6px 8px; text-align: center; width: 40px;">STT</th>
                            <th style="padding: 6px 8px; text-align: left;">Sản phẩm</th>
                            <th style="padding: 6px 8px; text-align: right; width: 80px;">Số lượng</th>
                            <th style="padding: 6px 8px; text-align: right; width: 120px;">Đơn giá</th>
                            <th style="padding: 6px 8px; text-align: right; width: 120px;">Tổng</th>
                            <th style="padding: 6px 8px; text-align: center; width: 36px;" title="Ghi chú">📝</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineRows}
                        <tr style="border-top: 1px solid #cbd5e1;">
                            <td colspan="5" style="padding: 6px 8px; text-align: right; font-weight: 600;">Tổng tiền:</td>
                            <td style="padding: 6px 8px; text-align: right; font-weight: 700;">${formatMoney(totalAmount)}</td>
                        </tr>
                        <tr>
                            <td colspan="5" style="padding: 6px 8px; text-align: right; font-weight: 600;">Còn nợ:</td>
                            <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: ${residual > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${formatMoney(residual)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Bind note checkboxes inside expanded content
     */
    function bindNoteCheckboxes(container) {
        container.querySelectorAll('.note-product-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    const noteItem = {
                        key: cb.dataset.key,
                        orderId: parseInt(cb.dataset.orderId, 10),
                        lineId: parseInt(cb.dataset.lineId, 10),
                        productName: cb.dataset.productName,
                        productCode: cb.dataset.productCode,
                        supplierName: cb.dataset.supplier,
                        quantity: parseFloat(cb.dataset.qty) || 0,
                        priceUnit: parseFloat(cb.dataset.price) || 0,
                        note: `${cb.dataset.supplier} bán dùm`,
                        createdAt: Date.now()
                    };
                    if (window.PurchaseOrderNotes?.addItem) {
                        window.PurchaseOrderNotes.addItem(noteItem);
                    }
                    cb.disabled = true;
                    cb.closest('tr').style.opacity = '0.5';
                } else {
                    if (window.PurchaseOrderNotes?.removeByKey) {
                        window.PurchaseOrderNotes.removeByKey(cb.dataset.key);
                    }
                }
            });
        });
    }

    /**
     * Render state badge matching the screenshot style
     */
    function renderState(showState, state) {
        const colors = {
            'open': { bg: '#d1fae5', text: '#059669', border: '#a7f3d0' },
            'paid': { bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe' },
            'draft': { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
            'cancel': { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' }
        };
        const c = colors[state] || colors['open'];
        return `<span class="status-badge" style="background: ${c.bg}; color: ${c.text}; border: 1px solid ${c.border};">${escapeHtml(showState || state || '')}</span>`;
    }

    /**
     * Render pagination controls
     */
    function renderPagination() {
        if (!paginationContainer) return;

        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        if (totalPages <= 0) {
            paginationContainer.innerHTML = '';
            return;
        }

        const startItem = totalCount > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
        const endItem = Math.min(currentPage * PAGE_SIZE, totalCount);

        // Generate page numbers
        const pages = generatePageNumbers(currentPage, totalPages, 5);

        paginationContainer.innerHTML = `
            <div class="pagination">
                <div class="pagination__info">
                    Hiển thị ${startItem} - ${endItem} trong ${totalCount} hóa đơn
                </div>
                <div class="pagination__controls">
                    ${totalPages > 1 ? `
                        <button class="pagination__btn pagination__btn--prev ${currentPage <= 1 ? 'disabled' : ''}"
                                data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>
                            <i data-lucide="chevron-left"></i>
                        </button>

                        ${pages.map(p => {
                            if (p === '...') return '<span class="pagination__ellipsis">...</span>';
                            const isActive = p === currentPage;
                            return `<button class="pagination__btn pagination__btn--page ${isActive ? 'active' : ''}"
                                            data-page="${p}" ${isActive ? 'disabled' : ''}>${p}</button>`;
                        }).join('')}

                        <button class="pagination__btn pagination__btn--next ${currentPage >= totalPages ? 'disabled' : ''}"
                                data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>
                            <i data-lucide="chevron-right"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Bind click handlers
        paginationContainer.querySelectorAll('.pagination__btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page, 10);
                if (!isNaN(page) && page >= 1 && page <= totalPages) {
                    loadPage(page);
                }
            });
        });
    }

    /**
     * Generate page numbers array
     */
    function generatePageNumbers(current, total, maxVisible) {
        if (total <= maxVisible) {
            return Array.from({ length: total }, (_, i) => i + 1);
        }

        const pages = [];
        const half = Math.floor(maxVisible / 2);
        let start = current - half;
        let end = current + half;

        if (start < 1) { start = 1; end = maxVisible; }
        if (end > total) { end = total; start = total - maxVisible + 1; }

        if (start > 1) {
            pages.push(1);
            if (start > 2) pages.push('...');
        }

        for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= total && !pages.includes(i)) pages.push(i);
        }

        if (end < total) {
            if (end < total - 1) pages.push('...');
            if (!pages.includes(total)) pages.push(total);
        }

        return pages;
    }

    /**
     * Render loading state
     */
    function renderLoading() {
        if (!tableContainer) return;
        tableContainer.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <div class="loading-text">Đang tải dữ liệu lịch sử...</div>
            </div>
        `;
        if (paginationContainer) paginationContainer.innerHTML = '';
    }

    /**
     * Render error state
     */
    function renderError(message) {
        if (!tableContainer) return;
        tableContainer.innerHTML = `
            <div class="error-state">
                <div class="error-state__icon"><i data-lucide="alert-circle"></i></div>
                <div class="error-state__title">Không thể tải dữ liệu</div>
                <div class="error-state__description">${escapeHtml(message)}</div>
                <button class="btn btn-outline" onclick="window.PurchaseOrderHistory.reload()">
                    <i data-lucide="refresh-cw"></i>
                    <span>Thử lại</span>
                </button>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * View detail - open TPOS URL for this invoice
     */
    function viewDetail(id) {
        window.open(`https://tomato.tpos.vn/FastPurchaseOrder/Edit/${id}`, '_blank');
    }

    /**
     * Remove Vietnamese diacritics for search (PartnerNameNoSign is already without diacritics)
     */
    function removeVietnameseDiacritics(str) {
        if (window.ProductCodeGenerator?.removeVietnameseDiacritics) {
            return window.ProductCodeGenerator.removeVietnameseDiacritics(str);
        }
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }

    /**
     * Escape single quotes for OData string values
     */
    function encodeODataString(str) {
        return str.replace(/'/g, "''");
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Reload current page
     */
    function reload() {
        loadPage(currentPage);
    }

    /**
     * Destroy / cleanup when switching away from history tab
     */
    function destroy() {
        currentData = [];
        currentPage = 1;
        totalCount = 0;
        searchTerm = '';
        // Clear expanded state
        Object.keys(expandedRows).forEach(k => delete expandedRows[k]);
    }

    return {
        init,
        destroy,
        reload,
        viewDetail
    };
})();

console.log('[Purchase Orders] History tab loaded');
