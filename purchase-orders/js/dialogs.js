/**
 * PURCHASE ORDERS MODULE - DIALOGS
 * File: dialogs.js
 * Purpose: Order detail, variant generator, settings, inventory picker, shipping fee dialogs
 * Matches React app components
 */

// ========================================
// ORDER DETAIL DIALOG
// Matches: PurchaseOrderDetailDialog.tsx
// ========================================

class OrderDetailDialog {
    constructor() {
        this.modalElement = null;
        this.order = null;
        this.onRetry = null;
    }

    /**
     * Open order detail dialog
     * @param {Object} order - Order data with items
     * @param {Object} options - { onRetry }
     */
    open(order, options = {}) {
        this.order = order;
        this.onRetry = options.onRetry;

        this.render();
        this.show();
    }

    /**
     * Close dialog
     */
    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
            }, 200);
        }
    }

    /**
     * Show dialog
     */
    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
        }
    }

    /**
     * Render dialog
     */
    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        const config = window.PurchaseOrderConfig;
        const order = this.order;
        const items = order.items || [];

        // Calculate totals
        const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const calculatedTotal = items.reduce((sum, item) =>
            sum + ((item.purchasePrice || 0) * (item.quantity || 0)), 0);

        // Find failed sync items
        const failedItems = items.filter(item => item.tposSyncStatus === 'failed');

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        this.modalElement.innerHTML = `
            <div class="modal modal--lg">
                <div class="modal__header">
                    <div>
                        <h2 class="modal__title">Chi tiết đơn hàng</h2>
                        <p class="modal__subtitle">${order.orderNumber || order.id}</p>
                    </div>
                    <button type="button" class="modal__close" id="btnCloseDetail">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <!-- Order Info -->
                    <div class="detail-info-grid">
                        <div class="detail-info-item">
                            <span class="detail-info-label">Nhà cung cấp</span>
                            <span class="detail-info-value">${order.supplier?.name || 'Chưa cập nhật'}</span>
                        </div>
                        <div class="detail-info-item">
                            <span class="detail-info-label">Ngày đặt</span>
                            <span class="detail-info-value">${config.formatDate(order.orderDate)}</span>
                        </div>
                        <div class="detail-info-item">
                            <span class="detail-info-label">Trạng thái</span>
                            <span class="detail-info-value">${config.getStatusBadgeHTML(order.status)}</span>
                        </div>
                        <div class="detail-info-item">
                            <span class="detail-info-label">Tổng số lượng</span>
                            <span class="detail-info-value">${totalQuantity}</span>
                        </div>
                    </div>

                    <!-- Items Table -->
                    <div class="detail-items-section">
                        <h3 class="detail-section-title">Danh sách sản phẩm (${items.length})</h3>
                        <div class="detail-items-table-wrapper">
                            <table class="detail-items-table">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Tên sản phẩm</th>
                                        <th>Mã SP</th>
                                        <th>Biến thể</th>
                                        <th class="text-center">SL</th>
                                        <th class="text-right">Giá mua</th>
                                        <th class="text-right">Thành tiền</th>
                                        <th>Trạng thái sync</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${items.map((item, index) => `
                                        <tr class="${item.tposSyncStatus === 'failed' ? 'row-error' : ''}">
                                            <td>${index + 1}</td>
                                            <td>${item.productName || 'Sản phẩm đã xóa'}</td>
                                            <td>${item.productCode || '-'}</td>
                                            <td>${item.variant || '-'}</td>
                                            <td class="text-center">${item.quantity || 0}</td>
                                            <td class="text-right">${config.formatVND(item.purchasePrice || 0)}</td>
                                            <td class="text-right">${config.formatVND((item.purchasePrice || 0) * (item.quantity || 0))}</td>
                                            <td>${this.renderSyncStatus(item)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Failed Items Section -->
                    ${failedItems.length > 0 ? `
                        <div class="detail-failed-section">
                            <h3 class="detail-section-title text-danger">
                                <i data-lucide="alert-circle"></i>
                                Sản phẩm lỗi đồng bộ (${failedItems.length})
                            </h3>
                            <ul class="failed-items-list">
                                ${failedItems.map(item => `
                                    <li class="failed-item">
                                        <span class="failed-item-name">${item.productName}</span>
                                        <span class="failed-item-error">${item.tposSyncError || 'Lỗi không xác định'}</span>
                                    </li>
                                `).join('')}
                            </ul>
                            <button class="btn btn-warning" id="btnRetryFailed">
                                <i data-lucide="refresh-cw"></i>
                                <span>Thử lại đồng bộ</span>
                            </button>
                        </div>
                    ` : ''}

                    <!-- Financial Summary -->
                    <div class="detail-summary">
                        <div class="detail-summary-row">
                            <span>Tổng tiền hàng:</span>
                            <span>${config.formatVND(calculatedTotal)}</span>
                        </div>
                        <div class="detail-summary-row">
                            <span>Giảm giá:</span>
                            <span>- ${config.formatVND(order.discountAmount || 0)}</span>
                        </div>
                        <div class="detail-summary-row">
                            <span>Phí ship:</span>
                            <span>+ ${config.formatVND(order.shippingFee || 0)}</span>
                        </div>
                        <div class="detail-summary-row detail-summary-row--total">
                            <span>THÀNH TIỀN:</span>
                            <span>${config.formatVND(order.finalAmount || 0)}</span>
                        </div>
                    </div>

                    <!-- Notes -->
                    ${order.notes ? `
                        <div class="detail-notes">
                            <h3 class="detail-section-title">Ghi chú</h3>
                            <p>${order.notes}</p>
                        </div>
                    ` : ''}

                    <!-- Timestamps -->
                    <div class="detail-timestamps">
                        <span>Tạo lúc: ${config.formatDateTime(order.createdAt)}</span>
                        <span>Cập nhật: ${config.formatDateTime(order.updatedAt)}</span>
                    </div>
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCloseDetailFooter">Đóng</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindEvents();
    }

    /**
     * Render sync status badge
     * @param {Object} item
     * @returns {string} HTML
     */
    renderSyncStatus(item) {
        const status = item.tposSyncStatus;

        switch (status) {
            case 'success':
                return '<span class="sync-badge sync-badge--success"><i data-lucide="check"></i> Đã đồng bộ</span>';
            case 'processing':
                return '<span class="sync-badge sync-badge--processing"><i data-lucide="loader-2" class="spin"></i> Đang xử lý</span>';
            case 'failed':
                return '<span class="sync-badge sync-badge--failed"><i data-lucide="alert-circle"></i> Lỗi</span>';
            case 'pending':
                return '<span class="sync-badge sync-badge--pending">Chờ đồng bộ</span>';
            default:
                return '<span class="text-muted">-</span>';
        }
    }

    /**
     * Bind event handlers
     */
    bindEvents() {
        // Close buttons
        this.modalElement.querySelector('#btnCloseDetail')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCloseDetailFooter')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.close();
            }
        });

        // Retry failed
        this.modalElement.querySelector('#btnRetryFailed')?.addEventListener('click', async () => {
            if (this.onRetry) {
                const btn = this.modalElement.querySelector('#btnRetryFailed');
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Đang xử lý...';
                if (typeof lucide !== 'undefined') lucide.createIcons();

                await this.onRetry(this.order.id);
                this.close();
            }
        });

        // Escape key
        document.addEventListener('keydown', this.handleEscape.bind(this));
    }

    handleEscape(e) {
        if (e.key === 'Escape' && this.modalElement) {
            this.close();
            document.removeEventListener('keydown', this.handleEscape.bind(this));
        }
    }
}

// ========================================
// VARIANT GENERATOR DIALOG
// Matches: VariantGeneratorDialog.tsx - Checkbox-based attribute selection
// ========================================

class VariantGeneratorDialog {
    constructor() {
        this.modalElement = null;
        this.onGenerate = null;
        this.baseProduct = null;

        // Will be loaded from CSV files
        this.attributes = []; // [{id, name, key, values: [{id, value, code, tpos_id}]}]
        this.attributeConfig = {};
        this.selected = {};
        this.searchFilters = {};
        this.csvLoaded = false;

        // Load CSV data on construction
        this.loadCSVData();
    }

    /**
     * Parse CSV text into array of objects
     */
    parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',');
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = [];
            let current = '';
            let inQuotes = false;
            for (const ch of lines[i]) {
                if (ch === '"') { inQuotes = !inQuotes; }
                else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
                else { current += ch; }
            }
            values.push(current.trim());
            const obj = {};
            headers.forEach((h, idx) => { obj[h.trim()] = values[idx] || ''; });
            rows.push(obj);
        }
        return rows;
    }

    /**
     * Load attributes and values from CSV files
     */
    async loadCSVData() {
        try {
            // Determine base path from current page location
            // The page is at .../purchase-orders/index.html, CSVs are in the same directory
            const pathParts = window.location.pathname.split('/');
            // Remove the filename (e.g., index.html) to get the directory
            pathParts.pop();
            const basePath = pathParts.join('/') + '/';

            const [attrsText, valsText] = await Promise.all([
                fetch(`${basePath}product_attributes_rows.csv`).then(r => {
                    if (!r.ok) throw new Error(`Failed to fetch attributes: ${r.status}`);
                    return r.text();
                }),
                fetch(`${basePath}product_attribute_values_rows.csv`).then(r => {
                    if (!r.ok) throw new Error(`Failed to fetch attribute values: ${r.status}`);
                    return r.text();
                })
            ]);

            const attrsRows = this.parseCSV(attrsText);
            const valsRows = this.parseCSV(valsText);

            // Sort attributes by display_order
            attrsRows.sort((a, b) => parseInt(a.display_order || 0) - parseInt(b.display_order || 0));

            // Key mapping: attribute name → internal key
            const keyMap = { 'Màu': 'color', 'Size Số': 'sizeNumber', 'Size Chữ': 'sizeLetter' };

            this.attributes = attrsRows
                .filter(a => a.is_active === 'true')
                .map(attr => {
                    const key = keyMap[attr.name] || attr.name.replace(/\s+/g, '_').toLowerCase();
                    const attrValues = valsRows
                        .filter(v => v.attribute_id === attr.id && v.is_active === 'true')
                        .map(v => ({
                            id: v.id,
                            value: v.value,
                            code: v.code,
                            tpos_id: v.tpos_id,
                            sequence: parseInt(v.sequence || 0)
                        }));

                    // Sort values using VariantUtils if available
                    const sortedValues = window.VariantUtils
                        ? window.VariantUtils.sortAttributeValues(attrValues.map(v => ({ name: v.value, ...v })))
                              .map(v => ({ ...v, value: v.name || v.value }))
                        : attrValues;

                    return { id: attr.id, name: attr.name, key, values: sortedValues };
                });

            // Build attributeConfig, selected, searchFilters
            this.attributeConfig = {};
            this.selected = {};
            this.searchFilters = {};
            for (const attr of this.attributes) {
                this.attributeConfig[attr.key] = {
                    name: attr.name,
                    values: attr.values.map(v => v.value),
                    valueObjects: attr.values
                };
                this.selected[attr.key] = [];
                this.searchFilters[attr.key] = '';
            }

            this.csvLoaded = true;
            console.log('[VariantGenerator] Loaded CSV data:', this.attributes.map(a => `${a.name}(${a.values.length})`).join(', '));
        } catch (error) {
            console.error('[VariantGenerator] Failed to load CSV:', error);
            // Fallback to hardcoded values
            this.attributeConfig = {
                color: { name: 'Màu', values: ['Trắng', 'Đen', 'Đỏ', 'Xanh', 'Xám', 'Nude', 'Vàng', 'Hồng', 'Nâu', 'Cam', 'Tím', 'Be', 'Kem'] },
                sizeNumber: { name: 'Size Số', values: ['1', '2', '3', '4', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'] },
                sizeLetter: { name: 'Size Chữ', values: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Freesize'] }
            };
            this.selected = { color: [], sizeNumber: [], sizeLetter: [] };
            this.searchFilters = { color: '', sizeNumber: '', sizeLetter: '' };
            this.csvLoaded = true;
        }
    }

    /**
     * Open variant generator dialog
     * @param {Object} options - { baseProduct, onGenerate }
     */
    async open(options = {}) {
        this.baseProduct = options.baseProduct || {};
        this.onGenerate = options.onGenerate;

        // Wait for CSV data if not yet loaded
        if (!this.csvLoaded) {
            await this.loadCSVData();
        }

        // Reset selections
        for (const key of Object.keys(this.selected)) {
            this.selected[key] = [];
        }
        for (const key of Object.keys(this.searchFilters)) {
            this.searchFilters[key] = '';
        }

        // Track which variants are checked for adding to PO (all checked by default)
        this.variantChecked = new Set();

        this.render();
    }

    close() {
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
    }

    /**
     * Generate all variant combinations from selected values
     * @returns {Array} Array of {variant: string, selectedAttributeValueIds: string[]}
     */
    generateCombinations() {
        const selectedArrays = [];

        for (const key of Object.keys(this.attributeConfig)) {
            if (this.selected[key] && this.selected[key].length > 0) {
                const config = this.attributeConfig[key];
                // Map selected values to objects with ID
                const valuesWithIds = this.selected[key].map(val => {
                    const obj = config.valueObjects?.find(v => v.value === val);
                    return { value: val, id: obj?.id || null };
                });
                selectedArrays.push(valuesWithIds);
            }
        }

        if (selectedArrays.length === 0) return [];

        // Cartesian product
        const combine = (arrays) => {
            if (arrays.length === 0) return [[]];
            const [first, ...rest] = arrays;
            const restCombinations = combine(rest);
            const result = [];
            for (const item of first) {
                for (const combo of restCombinations) {
                    result.push([item, ...combo]);
                }
            }
            return result;
        };

        // Collect ALL selected attribute value IDs across all groups
        const allSelectedIds = selectedArrays.flat().map(v => v.id).filter(Boolean);

        const combinations = combine(selectedArrays);
        return combinations.map(combo => ({
            variant: combo.map(c => c.value).join(' / '),
            selectedAttributeValueIds: allSelectedIds
        }));
    }

    /**
     * Get selected values summary for header display
     */
    getSelectedSummary() {
        const parts = [];
        for (const key of Object.keys(this.attributeConfig)) {
            if (this.selected[key] && this.selected[key].length > 0) {
                parts.push(this.selected[key].join(', '));
            }
        }
        return parts.length > 0 ? parts.join(' | ') : 'Chưa chọn giá trị nào';
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        const combinations = this.generateCombinations();

        this.modalElement = document.createElement('div');
        this.modalElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 6000;
            padding: 20px;
        `;

        this.modalElement.innerHTML = `
            <div style="
                background: white;
                border-radius: 12px;
                width: 100%;
                max-width: 1100px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            ">
                <!-- Header -->
                <div style="
                    padding: 16px 20px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Tạo biến thể từ thuộc tính</h2>
                    <button type="button" id="btnCloseVariant" style="
                        background: none;
                        border: none;
                        padding: 8px;
                        cursor: pointer;
                        border-radius: 6px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #6b7280;
                    ">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <!-- Selected Summary -->
                <div style="
                    padding: 12px 20px;
                    background: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                    font-size: 14px;
                    color: #6b7280;
                " id="selectedSummary">
                    ${this.getSelectedSummary()}
                </div>

                <!-- Body -->
                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    <div style="display: grid; grid-template-columns: repeat(${Object.keys(this.attributeConfig).length + 1}, 1fr); gap: 16px; height: 100%;">
                        ${Object.entries(this.attributeConfig).map(([key, config]) => `
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; display: flex; flex-direction: column;">
                            <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${config.name}</div>
                            <div style="padding: 8px;">
                                <input type="text" placeholder="Tìm kiếm..." data-search="${key}" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #d1d5db;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 8px; max-height: 300px;" id="${key}List">
                                ${this.renderCheckboxList(key)}
                            </div>
                        </div>
                        `).join('')}

                        <!-- Variant Preview Column -->
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; display: flex; flex-direction: column;">
                            <div id="variantPreviewHeader" style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                                <span>Danh sách Biến Thể</span>
                                ${combinations.length > 0 ? `<label style="font-weight: 400; font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer; color: #6b7280;">
                                    <input type="checkbox" id="variantSelectAll" checked style="width: 14px; height: 14px; accent-color: #3b82f6;">
                                    Chọn tất cả
                                </label>` : ''}
                            </div>
                            <div style="flex: 1; overflow-y: auto; padding: 12px; max-height: 350px;" id="variantPreviewList">
                                ${this.renderVariantPreviewList(combinations)}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="
                    padding: 16px 20px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    background: #f9fafb;
                ">
                    <button type="button" id="btnCancelVariant" style="
                        padding: 10px 20px;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        background: white;
                        cursor: pointer;
                        font-size: 14px;
                    ">Hủy</button>
                    <button type="button" id="btnGenerateVariants" style="
                        padding: 10px 20px;
                        border: none;
                        border-radius: 8px;
                        background: ${combinations.length > 0 ? '#3b82f6' : '#9ca3af'};
                        color: white;
                        cursor: ${combinations.length > 0 ? 'pointer' : 'not-allowed'};
                        font-size: 14px;
                        font-weight: 500;
                    " ${combinations.length === 0 ? 'disabled' : ''}>Tạo ${combinations.length > 0 ? `${combinations.length}/${combinations.length}` : '0'} biến thể</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);
        this.bindEvents();
    }

    renderCheckboxList(attributeKey) {
        const config = this.attributeConfig[attributeKey];
        const selected = this.selected[attributeKey];
        const filter = this.searchFilters[attributeKey].toLowerCase();

        const filteredValues = config.values.filter(v =>
            !filter || v.toLowerCase().includes(filter)
        );

        return filteredValues.map(value => `
            <label style="
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.15s;
            " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                <input type="checkbox"
                       data-attribute="${attributeKey}"
                       value="${value}"
                       ${selected.includes(value) ? 'checked' : ''}
                       style="width: 16px; height: 16px; accent-color: #3b82f6;">
                <span style="font-size: 14px;">${value}</span>
            </label>
        `).join('');
    }

    renderVariantPreviewList(combinations) {
        if (combinations.length === 0) {
            return '<p style="color: #9ca3af; text-align: center; padding: 40px 20px;">Chọn giá trị thuộc tính<br>để tạo biến thể</p>';
        }
        return combinations.map((v, idx) => {
            const variant = v.variant || v;
            const checked = this.variantChecked.has(variant);
            return `<label style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; cursor: pointer;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" data-variant-check="${idx}" value="${variant}" ${checked ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: #3b82f6; flex-shrink: 0;">
                <span>${variant}</span>
            </label>`;
        }).join('');
    }

    updateUI(autoSelectNew = true) {
        // Update summary
        const summaryEl = this.modalElement?.querySelector('#selectedSummary');
        if (summaryEl) {
            summaryEl.textContent = this.getSelectedSummary();
        }

        // Update checkbox lists
        Object.keys(this.attributeConfig).forEach(key => {
            const listEl = this.modalElement?.querySelector(`#${key}List`);
            if (listEl) {
                listEl.innerHTML = this.renderCheckboxList(key);
            }
        });

        // Update preview
        const combinations = this.generateCombinations();

        // Sync variantChecked with current combinations
        const currentVariants = new Set(combinations.map(v => v.variant || v));
        // Remove stale entries (variants that no longer exist)
        for (const v of this.variantChecked) {
            if (!currentVariants.has(v)) this.variantChecked.delete(v);
        }
        // Auto-select new variants only when attribute selection changes
        if (autoSelectNew) {
            for (const v of currentVariants) {
                if (!this.variantChecked.has(v)) this.variantChecked.add(v);
            }
        }

        const previewEl = this.modalElement?.querySelector('#variantPreviewList');
        if (previewEl) {
            previewEl.innerHTML = this.renderVariantPreviewList(combinations);
        }

        // Update select-all checkbox in header (re-render header if needed)
        const headerEl = this.modalElement?.querySelector('#variantPreviewHeader');
        if (headerEl) {
            const selectAllHtml = combinations.length > 0
                ? `<label style="font-weight: 400; font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer; color: #6b7280;">
                    <input type="checkbox" id="variantSelectAll" style="width: 14px; height: 14px; accent-color: #3b82f6;">
                    Chọn tất cả
                </label>`
                : '';
            headerEl.innerHTML = `<span>Danh sách Biến Thể</span>${selectAllHtml}`;
            const selectAllEl = headerEl.querySelector('#variantSelectAll');
            if (selectAllEl) {
                selectAllEl.checked = this.variantChecked.size === combinations.length;
                selectAllEl.indeterminate = this.variantChecked.size > 0 && this.variantChecked.size < combinations.length;
            }
        }

        // Update button
        const checkedCount = this.variantChecked.size;
        const btnGenerate = this.modalElement?.querySelector('#btnGenerateVariants');
        if (btnGenerate) {
            btnGenerate.textContent = combinations.length > 0
                ? `Tạo ${checkedCount}/${combinations.length} biến thể`
                : 'Tạo 0 biến thể';
            btnGenerate.disabled = checkedCount === 0;
            btnGenerate.style.background = checkedCount > 0 ? '#3b82f6' : '#9ca3af';
            btnGenerate.style.cursor = checkedCount > 0 ? 'pointer' : 'not-allowed';
        }
    }

    /**
     * Lightweight update: only button text + select-all state (no list re-render)
     */
    updateVariantCountUI() {
        const combinations = this.generateCombinations();
        const checkedCount = this.variantChecked.size;

        // Update select-all checkbox
        const selectAllEl = this.modalElement?.querySelector('#variantSelectAll');
        if (selectAllEl) {
            selectAllEl.checked = checkedCount === combinations.length;
            selectAllEl.indeterminate = checkedCount > 0 && checkedCount < combinations.length;
        }

        // Update button
        const btnGenerate = this.modalElement?.querySelector('#btnGenerateVariants');
        if (btnGenerate) {
            btnGenerate.textContent = combinations.length > 0
                ? `Tạo ${checkedCount}/${combinations.length} biến thể`
                : 'Tạo 0 biến thể';
            btnGenerate.disabled = checkedCount === 0;
            btnGenerate.style.background = checkedCount > 0 ? '#3b82f6' : '#9ca3af';
            btnGenerate.style.cursor = checkedCount > 0 ? 'pointer' : 'not-allowed';
        }
    }

    bindEvents() {
        if (!this.modalElement) return;

        // Close buttons
        this.modalElement.querySelector('#btnCloseVariant')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelVariant')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Checkbox changes (attribute selection + variant selection)
        this.modalElement.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' && e.target.dataset.attribute) {
                // Attribute checkbox
                const attr = e.target.dataset.attribute;
                const value = e.target.value;

                if (e.target.checked) {
                    if (!this.selected[attr].includes(value)) {
                        this.selected[attr].push(value);
                    }
                } else {
                    this.selected[attr] = this.selected[attr].filter(v => v !== value);
                }

                this.updateUI(true);
            } else if (e.target.type === 'checkbox' && e.target.dataset.variantCheck !== undefined) {
                // Variant row checkbox - just update state, don't re-render list
                const variant = e.target.value;
                if (e.target.checked) {
                    this.variantChecked.add(variant);
                } else {
                    this.variantChecked.delete(variant);
                }
                this.updateVariantCountUI();
            } else if (e.target.id === 'variantSelectAll') {
                // Select all / deselect all
                const combinations = this.generateCombinations();
                if (e.target.checked) {
                    combinations.forEach(v => this.variantChecked.add(v.variant || v));
                } else {
                    this.variantChecked.clear();
                }
                // Re-render variant list to toggle all checkboxes
                const previewEl = this.modalElement?.querySelector('#variantPreviewList');
                if (previewEl) {
                    previewEl.innerHTML = this.renderVariantPreviewList(combinations);
                }
                this.updateVariantCountUI();
            }
        });

        // Search inputs
        this.modalElement.addEventListener('input', (e) => {
            if (e.target.dataset.search) {
                const attr = e.target.dataset.search;
                this.searchFilters[attr] = e.target.value;

                // Update only this column's list
                const listEl = this.modalElement?.querySelector(`#${attr}List`);
                if (listEl) {
                    listEl.innerHTML = this.renderCheckboxList(attr);
                }
            }
        });

        // Generate variants - only pass checked variants to PO
        this.modalElement.querySelector('#btnGenerateVariants')?.addEventListener('click', () => {
            const combinations = this.generateCombinations();
            const checkedCombinations = combinations.filter(v => this.variantChecked.has(v.variant || v));
            if (checkedCombinations.length > 0 && this.onGenerate) {
                this.onGenerate(checkedCombinations, this.baseProduct);
                this.close();
            }
        });
    }
}

// ========================================
// SETTINGS DIALOG
// Validation settings with Firestore persistence
// Rebuilt with inline styles for reliability
// ========================================

class SettingsDialog {
    constructor() {
        this.modalElement = null;
        this.settings = { ...(window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {}) };
        this.onSave = null;
        this.SETTINGS_DOC_PATH = 'settings/validation';
    }

    /**
     * Load settings from Firestore, merged with defaults
     */
    async loadFromFirestore() {
        const defaults = window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {};
        try {
            if (typeof firebase === 'undefined') return { ...defaults };
            const db = firebase.firestore();
            const doc = await db.doc(this.SETTINGS_DOC_PATH).get();
            if (doc.exists) {
                const data = doc.data();
                delete data.updatedAt;
                return { ...defaults, ...data };
            }
        } catch (e) {
            console.warn('[SettingsDialog] Failed to load from Firestore:', e);
        }
        return { ...defaults };
    }

    /**
     * Save settings to Firestore
     */
    async saveToFirestore(settings) {
        try {
            if (typeof firebase === 'undefined') throw new Error('Firebase not loaded');
            const db = firebase.firestore();
            const saveData = { ...settings };
            saveData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.doc(this.SETTINGS_DOC_PATH).set(saveData);
            console.log('[SettingsDialog] Settings saved to Firestore');
        } catch (e) {
            console.error('[SettingsDialog] Failed to save to Firestore:', e);
            throw e;
        }
    }

    /**
     * Format price preview: value in 1000đ units → formatted VND
     */
    _fmtVND(val) {
        const v = (parseInt(val, 10) || 0) * 1000;
        if (window.PurchaseOrderConfig?.formatVND) {
            return window.PurchaseOrderConfig.formatVND(v);
        }
        return new Intl.NumberFormat('vi-VN').format(v) + ' đ';
    }

    /**
     * Open settings dialog
     */
    async open(options = {}) {
        this.onSave = options.onSave;
        const defaults = window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {};
        this.settings = { ...defaults, ...options.settings };

        // Render immediately with current settings
        this._createDialog();

        // Load from Firestore in background
        try {
            const fsSettings = await this.loadFromFirestore();
            const merged = { ...fsSettings, ...options.settings };
            if (JSON.stringify(merged) !== JSON.stringify(this.settings)) {
                this.settings = merged;
                this._updateFormValues();
            }
        } catch (e) {
            console.warn('[SettingsDialog] Firestore load failed, using defaults:', e);
        }
    }

    close() {
        if (this.modalElement) {
            this.modalElement.style.opacity = '0';
            setTimeout(() => {
                if (this.modalElement) {
                    this.modalElement.remove();
                    this.modalElement = null;
                }
            }, 150);
        }
    }

    /**
     * Create the dialog DOM from scratch
     */
    _createDialog() {
        if (this.modalElement) this.modalElement.remove();

        const s = this.settings;

        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:6000;opacity:0;transition:opacity 0.2s';

        // Build checkbox rows data
        const checkboxes = [
            { id: 'enableRequireProductName', label: 'Bắt buộc tên sản phẩm', checked: s.enableRequireProductName },
            { id: 'enableRequireProductCode', label: 'Bắt buộc mã sản phẩm', checked: s.enableRequireProductCode },
            { id: 'enableRequireProductImages', label: 'Bắt buộc hình ảnh sản phẩm', checked: s.enableRequireProductImages },
            { id: 'enableRequirePositivePurchasePrice', label: 'Giá mua phải > 0', checked: s.enableRequirePositivePurchasePrice },
            { id: 'enableRequirePositiveSellingPrice', label: 'Giá bán phải > 0', checked: s.enableRequirePositiveSellingPrice },
            { id: 'enableRequireSellingGreaterThanPurchase', label: 'Giá bán phải > Giá mua', checked: s.enableRequireSellingGreaterThanPurchase },
            { id: 'enableRequireAtLeastOneItem', label: 'Phải có ít nhất 1 sản phẩm', checked: s.enableRequireAtLeastOneItem },
        ];

        const checkboxHTML = checkboxes.map(cb => `
            <label style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;cursor:pointer;border-bottom:1px solid #f3f4f6">
                <span style="font-size:14px;color:#374151">${cb.label}</span>
                <input type="checkbox" id="${cb.id}" ${cb.checked ? 'checked' : ''}
                    style="width:18px;height:18px;accent-color:#2563eb;cursor:pointer">
            </label>
        `).join('');

        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);width:90vw;max-width:560px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
                <!-- Header -->
                <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e5e7eb">
                    <h2 style="margin:0;font-size:17px;font-weight:600;color:#111827">Cài đặt validation giá mua/bán</h2>
                    <button id="btnCloseSettings" style="background:none;border:none;cursor:pointer;padding:4px;color:#9ca3af;border-radius:6px"
                        onmouseover="this.style.background='#f3f4f6';this.style.color='#374151'"
                        onmouseout="this.style.background='none';this.style.color='#9ca3af'">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <!-- Body -->
                <div style="flex:1;overflow-y:auto;padding:20px">
                    <!-- Info box -->
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;font-size:12px;color:#1e40af;margin-bottom:16px;line-height:1.6">
                        <strong>Cách hoạt động:</strong><br>
                        • Đặt giá trị 0 để không giới hạn<br>
                        • Hệ thống sẽ kiểm tra khi tạo đơn đặt hàng<br>
                        • Nếu vi phạm, sẽ hiển thị cảnh báo chi tiết
                    </div>

                    <!-- Giá mua -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">Giá mua</h4>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                            <div>
                                <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">Giá mua tối thiểu (1000đ)</label>
                                <input type="number" id="minPurchasePrice" value="${s.minPurchasePrice}" min="0"
                                    style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                                <div id="previewMinPurchase" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.minPurchasePrice)}</div>
                            </div>
                            <div>
                                <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">Giá mua tối đa (1000đ)</label>
                                <input type="number" id="maxPurchasePrice" value="${s.maxPurchasePrice}" min="0"
                                    style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                                <div id="previewMaxPurchase" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.maxPurchasePrice)}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Giá bán -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">Giá bán</h4>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                            <div>
                                <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">Giá bán tối thiểu (1000đ)</label>
                                <input type="number" id="minSellingPrice" value="${s.minSellingPrice}" min="0"
                                    style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                                <div id="previewMinSelling" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.minSellingPrice)}</div>
                            </div>
                            <div>
                                <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">Giá bán tối đa (1000đ)</label>
                                <input type="number" id="maxSellingPrice" value="${s.maxSellingPrice}" min="0"
                                    style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                                <div id="previewMaxSelling" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.maxSellingPrice)}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Chênh lệch -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">Chênh lệch (Margin)</h4>
                        <div>
                            <label style="font-size:13px;color:#374151;display:block;margin-bottom:4px">Chênh lệch tối thiểu giá bán - giá mua (1000đ)</label>
                            <input type="number" id="minMargin" value="${s.minMargin}" min="0"
                                style="width:100%;max-width:260px;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box">
                            <div id="previewMinMargin" style="font-size:12px;color:#9ca3af;margin-top:2px">= ${this._fmtVND(s.minMargin)}</div>
                        </div>
                        <div style="font-size:12px;color:#9ca3af;margin-top:6px">
                            Ví dụ: Đặt 50 nghĩa là giá bán phải cao hơn giá mua ít nhất 50.000đ
                        </div>
                    </div>

                    <!-- Quy tắc kiểm tra -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">Quy tắc kiểm tra</h4>
                        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:4px 12px">
                            ${checkboxHTML}
                        </div>
                    </div>

                    <!-- Mã sản phẩm -->
                    <div style="margin-bottom:20px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">Mã sản phẩm</h4>
                        <label style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;cursor:pointer">
                            <span style="font-size:14px;color:#374151">Tự động tạo mã sản phẩm</span>
                            <input type="checkbox" id="autoGenerateCode" ${s.autoGenerateCode ? 'checked' : ''}
                                style="width:18px;height:18px;accent-color:#2563eb;cursor:pointer">
                        </label>
                    </div>

                    <!-- Ví dụ validation -->
                    <div style="margin-bottom:8px">
                        <h4 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px">Ví dụ validation</h4>
                        <div id="validationExample" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:13px;color:#374151">
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid #e5e7eb;background:#f9fafb;gap:8px">
                    <button id="btnResetSettings" style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:8px 14px;font-size:13px;color:#6b7280;cursor:pointer"
                        onmouseover="this.style.color='#dc2626';this.style.borderColor='#fca5a5'"
                        onmouseout="this.style.color='#6b7280';this.style.borderColor='#d1d5db'">Đặt lại mặc định</button>
                    <div style="display:flex;gap:8px">
                        <button id="btnCancelSettings" style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:8px 16px;font-size:13px;color:#374151;cursor:pointer"
                            onmouseover="this.style.background='#f3f4f6'"
                            onmouseout="this.style.background='none'">Hủy</button>
                        <button id="btnSaveSettings" style="background:#2563eb;border:none;border-radius:6px;padding:8px 16px;font-size:13px;color:#fff;cursor:pointer;font-weight:500"
                            onmouseover="this.style.background='#1d4ed8'"
                            onmouseout="this.style.background='#2563eb'">Lưu cài đặt</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.modalElement = overlay;

        // Fade in
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });

        this._bindEvents();
        this._updateValidationExample();
    }

    /**
     * Update form values without re-creating the DOM
     */
    _updateFormValues() {
        if (!this.modalElement) return;
        const s = this.settings;
        const fields = ['minPurchasePrice', 'maxPurchasePrice', 'minSellingPrice', 'maxSellingPrice', 'minMargin'];
        fields.forEach(f => {
            const input = this.modalElement.querySelector('#' + f);
            if (input) {
                input.value = s[f] || 0;
                input.dispatchEvent(new Event('input'));
            }
        });
        const boolFields = [
            'enableRequireProductName', 'enableRequireProductCode', 'enableRequireProductImages',
            'enableRequirePositivePurchasePrice', 'enableRequirePositiveSellingPrice',
            'enableRequireSellingGreaterThanPurchase', 'enableRequireAtLeastOneItem', 'autoGenerateCode'
        ];
        boolFields.forEach(f => {
            const input = this.modalElement.querySelector('#' + f);
            if (input) input.checked = s[f] !== false;
        });
        this._updateValidationExample();
    }

    /**
     * Update the live validation example section
     */
    _updateValidationExample() {
        const el = this.modalElement?.querySelector('#validationExample');
        if (!el) return;

        const s = this._collectSettings();
        const fmt = (v) => this._fmtVND(v);

        // Example product: purchase=50, selling=120
        const exPurchase = 50;
        const exSelling = 120;
        const exMargin = exSelling - exPurchase;

        const checks = [];

        // Price checks
        if (s.minPurchasePrice > 0) {
            const ok = exPurchase >= s.minPurchasePrice;
            checks.push({ ok, text: `Giá mua ${fmt(exPurchase)} >= tối thiểu ${fmt(s.minPurchasePrice)}` });
        }
        if (s.maxPurchasePrice > 0) {
            const ok = exPurchase <= s.maxPurchasePrice;
            checks.push({ ok, text: `Giá mua ${fmt(exPurchase)} <= tối đa ${fmt(s.maxPurchasePrice)}` });
        }
        if (s.minSellingPrice > 0) {
            const ok = exSelling >= s.minSellingPrice;
            checks.push({ ok, text: `Giá bán ${fmt(exSelling)} >= tối thiểu ${fmt(s.minSellingPrice)}` });
        }
        if (s.maxSellingPrice > 0) {
            const ok = exSelling <= s.maxSellingPrice;
            checks.push({ ok, text: `Giá bán ${fmt(exSelling)} <= tối đa ${fmt(s.maxSellingPrice)}` });
        }
        if (s.minMargin > 0) {
            const ok = exMargin >= s.minMargin;
            checks.push({ ok, text: `Chênh lệch ${fmt(exMargin)} >= tối thiểu ${fmt(s.minMargin)}` });
        }

        // Boolean checks
        if (s.enableRequireProductName) checks.push({ ok: true, text: 'Tên sản phẩm: "Áo thun basic"' });
        if (s.enableRequireProductCode) checks.push({ ok: true, text: 'Mã sản phẩm: "N001"' });
        if (s.enableRequireProductImages) checks.push({ ok: true, text: 'Hình ảnh: 1 ảnh' });
        if (s.enableRequirePositivePurchasePrice) checks.push({ ok: exPurchase > 0, text: `Giá mua ${fmt(exPurchase)} > 0` });
        if (s.enableRequirePositiveSellingPrice) checks.push({ ok: exSelling > 0, text: `Giá bán ${fmt(exSelling)} > 0` });
        if (s.enableRequireSellingGreaterThanPurchase) checks.push({ ok: exSelling > exPurchase, text: `Giá bán > Giá mua (${fmt(exSelling)} > ${fmt(exPurchase)})` });

        if (checks.length === 0) {
            el.innerHTML = '<span style="color:#9ca3af">Chưa có quy tắc nào được bật. Đặt giá trị > 0 hoặc bật checkbox để xem ví dụ.</span>';
            return;
        }

        const header = `<div style="margin-bottom:8px;font-weight:500">SP ví dụ: Giá mua = ${fmt(exPurchase)}, Giá bán = ${fmt(exSelling)}</div>`;
        const rows = checks.map(c => {
            const icon = c.ok ? '<span style="color:#16a34a">✓</span>' : '<span style="color:#dc2626">✗</span>';
            const color = c.ok ? '#374151' : '#dc2626';
            return `<div style="display:flex;gap:6px;align-items:center;padding:2px 0;color:${color}">${icon} ${c.text}</div>`;
        }).join('');

        el.innerHTML = header + rows;
    }

    /**
     * Bind all events
     */
    _bindEvents() {
        const el = this.modalElement;

        // Close
        el.querySelector('#btnCloseSettings')?.addEventListener('click', () => this.close());
        el.querySelector('#btnCancelSettings')?.addEventListener('click', () => this.close());

        // Live preview for price inputs
        const previewMap = {
            minPurchasePrice: 'previewMinPurchase',
            maxPurchasePrice: 'previewMaxPurchase',
            minSellingPrice: 'previewMinSelling',
            maxSellingPrice: 'previewMaxSelling',
            minMargin: 'previewMinMargin'
        };
        Object.entries(previewMap).forEach(([inputId, previewId]) => {
            el.querySelector('#' + inputId)?.addEventListener('input', (e) => {
                const preview = el.querySelector('#' + previewId);
                if (preview) preview.textContent = '= ' + this._fmtVND(e.target.value);
                this._updateValidationExample();
            });
        });

        // Checkboxes also update example
        el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => this._updateValidationExample());
        });

        // Reset
        el.querySelector('#btnResetSettings')?.addEventListener('click', () => {
            const defaults = window.PurchaseOrderValidation?.DEFAULT_VALIDATION_SETTINGS || {};
            this.settings = { ...defaults };
            this._updateFormValues();
            if (window.notificationManager) {
                window.notificationManager.show('Đã đặt lại mặc định', 'info');
            }
        });

        // Save
        el.querySelector('#btnSaveSettings')?.addEventListener('click', async () => {
            const btn = el.querySelector('#btnSaveSettings');
            const origText = btn.textContent;
            btn.textContent = 'Đang lưu...';
            btn.disabled = true;

            try {
                this.settings = this._collectSettings();
                await this.saveToFirestore(this.settings);
                if (this.onSave) this.onSave(this.settings);
                this.close();
            } catch (e) {
                if (window.notificationManager) {
                    window.notificationManager.show('Lỗi lưu cài đặt: ' + e.message, 'error');
                }
            } finally {
                if (btn) {
                    btn.textContent = origText;
                    btn.disabled = false;
                }
            }
        });

        // Close on overlay click (outside dialog)
        el.addEventListener('click', (e) => {
            if (e.target === el) this.close();
        });
    }

    /**
     * Collect all settings from form inputs
     */
    _collectSettings() {
        const el = this.modalElement;
        if (!el) return { ...this.settings };
        return {
            minPurchasePrice: parseInt(el.querySelector('#minPurchasePrice')?.value, 10) || 0,
            maxPurchasePrice: parseInt(el.querySelector('#maxPurchasePrice')?.value, 10) || 0,
            minSellingPrice: parseInt(el.querySelector('#minSellingPrice')?.value, 10) || 0,
            maxSellingPrice: parseInt(el.querySelector('#maxSellingPrice')?.value, 10) || 0,
            minMargin: parseInt(el.querySelector('#minMargin')?.value, 10) || 0,
            enableRequireProductName: el.querySelector('#enableRequireProductName')?.checked ?? true,
            enableRequireProductCode: el.querySelector('#enableRequireProductCode')?.checked ?? true,
            enableRequireProductImages: el.querySelector('#enableRequireProductImages')?.checked ?? true,
            enableRequirePositivePurchasePrice: el.querySelector('#enableRequirePositivePurchasePrice')?.checked ?? true,
            enableRequirePositiveSellingPrice: el.querySelector('#enableRequirePositiveSellingPrice')?.checked ?? true,
            enableRequireSellingGreaterThanPurchase: el.querySelector('#enableRequireSellingGreaterThanPurchase')?.checked ?? true,
            enableRequireAtLeastOneItem: el.querySelector('#enableRequireAtLeastOneItem')?.checked ?? true,
            autoGenerateCode: el.querySelector('#autoGenerateCode')?.checked ?? true
        };
    }
}

// ========================================
// INVENTORY PICKER DIALOG
// Uses TPOS API: ExportFileWithStandardPriceV2 for list, /odata/Product({id}) for details
// ========================================

class InventoryPickerDialog {
    constructor() {
        this.modalElement = null;
        this.products = [];           // Raw products from TPOS (Id, code, name, purchasePrice, costPrice)
        this.filteredProducts = [];   // Filtered by search
        this.selectedProducts = new Map(); // Products with full details (after fetching)
        this.onSelect = null;
        this.searchTerm = '';
        this.isLoading = false;
        this.proxyUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        this._imageBatchId = 0;
    }

    /**
     * Get auth token from localStorage or tokenManager
     */
    async getAuthToken() {
        // Use TPOSClient (purchase-orders) or tokenManager (other pages)
        // Only use the selected company's token, no fallback to other tokens
        if (window.TPOSClient?.getToken) {
            return await window.TPOSClient.getToken();
        }
        if (window.tokenManager?.getToken) {
            return await window.tokenManager.getToken();
        }
        throw new Error('Không có token manager khả dụng');
    }

    /**
     * Open inventory picker dialog
     * @param {Object} options - { onSelect }
     */
    async open(options = {}) {
        this.onSelect = options.onSelect;
        this.searchTerm = '';
        this.filteredProducts = [];

        // Load previously selected products from localStorage
        this.loadSelectedFromStorage();

        this.render();
        this.show();

        // Load products from TPOS API (for search index)
        await this.loadProductsFromTPOS();

        // Show selected products list if any
        this.updateProductsList();
    }

    /**
     * localStorage key for caching product list
     */
    static CACHE_KEY = 'inventory_products_cache';
    static CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
    static SELECTED_CACHE_KEY = 'inventory_selected_products';

    /**
     * Load products from TPOS ExportFileWithStandardPriceV2 API (Excel file)
     * Parse Excel using XLSX library and cache in localStorage
     * @param {boolean} forceReload - Force fetch from API instead of cache
     */
    async loadProductsFromTPOS(forceReload = false) {
        this.isLoading = true;
        this.updateLoadingState(true);

        try {
            // Check localStorage cache first
            if (!forceReload) {
                const cached = this.loadFromCache();
                if (cached) {
                    this.products = cached;
                    this.filteredProducts = [...this.products];
                    console.log(`[InventoryPicker] Loaded ${this.products.length} products from cache`);
                    return;
                }
            }

            // Fetch Excel file from TPOS (authenticatedFetch handles 401 + HTML login page retry)
            if (!window.TPOSClient?.authenticatedFetch) {
                throw new Error('TPOSClient không khả dụng');
            }

            const response = await window.TPOSClient.authenticatedFetch(
                `${this.proxyUrl}/api/Product/ExportFileWithStandardPriceV2`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        model: { Active: 'true' },
                        ids: ''
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`TPOS API error: ${response.status}`);
            }

            // Response is Excel binary - parse with XLSX library
            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);

            if (typeof XLSX === 'undefined') {
                throw new Error('XLSX library not loaded');
            }

            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convert to JSON array (first row is header)
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

            console.log('[InventoryPicker] Excel parsed, first row:', jsonData[0]);

            // Map Excel data to our format
            // Excel columns: Id (*), Mã sản phẩm, Tên sản phẩm, Giá mua, Giá vốn (*)
            this.products = jsonData.map(row => {
                // Find ID - try multiple possible column names
                const id = row['Id (*)'] || row['ID'] || row['Id'] || row['id'] || 0;
                // Find code
                const code = row['Mã sản phẩm'] || row['DefaultCode'] || row['Mã SP'] || '';
                // Find name
                const name = row['Tên sản phẩm'] || row['NameTemplate'] || row['Tên SP'] || '';
                // Giá mua = Purchase price (what we pay to supplier)
                const purchasePrice = parseFloat(row['Giá mua'] || row['Giá vốn (*)'] || row['Giá vốn'] || row['StandardPrice'] || 0) || 0;
                // Giá bán = Selling price (we don't have this in Excel, will fetch from product details)
                const sellingPrice = parseFloat(row['Giá bán'] || row['ListPrice'] || row['PriceVariant'] || 0) || 0;

                return { id, code, name, purchasePrice, sellingPrice };
            }).filter(p => p.id); // Filter out empty rows

            this.filteredProducts = [...this.products];

            // Save to localStorage cache
            this.saveToCache(this.products);

            console.log(`[InventoryPicker] Loaded ${this.products.length} products from TPOS Excel`);

            if (window.notificationManager && forceReload) {
                window.notificationManager.success(`Đã tải ${this.products.length} sản phẩm từ TPOS`);
            }

        } catch (error) {
            console.error('Error loading products from TPOS:', error);

            // Try fallback to cache even on error
            const cached = this.loadFromCache();
            if (cached) {
                this.products = cached;
                this.filteredProducts = [...this.products];
                console.log(`[InventoryPicker] Error occurred, fallback to cache: ${this.products.length} products`);
                if (window.notificationManager) {
                    window.notificationManager.warning('Không thể tải từ TPOS, đang dùng dữ liệu đã lưu');
                }
            } else {
                this.products = [];
                this.filteredProducts = [];
                if (window.notificationManager) {
                    window.notificationManager.error('Không thể tải danh sách sản phẩm: ' + error.message);
                }
            }
        } finally {
            this.isLoading = false;
            this.updateLoadingState(false);
        }
    }

    /**
     * Load products from localStorage cache
     * @returns {Array|null} Cached products or null if expired/not found
     */
    loadFromCache() {
        try {
            const cached = localStorage.getItem(InventoryPickerDialog.CACHE_KEY);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);

            // Check expiry
            if (Date.now() - timestamp > InventoryPickerDialog.CACHE_EXPIRY) {
                console.log('[InventoryPicker] Cache expired');
                localStorage.removeItem(InventoryPickerDialog.CACHE_KEY);
                return null;
            }

            return data;
        } catch (e) {
            console.warn('[InventoryPicker] Failed to load from cache:', e);
            return null;
        }
    }

    /**
     * Save products to localStorage cache
     * @param {Array} products - Products to cache
     */
    saveToCache(products) {
        try {
            const cacheData = {
                data: products,
                timestamp: Date.now()
            };
            localStorage.setItem(InventoryPickerDialog.CACHE_KEY, JSON.stringify(cacheData));
            console.log(`[InventoryPicker] Saved ${products.length} products to cache`);
        } catch (e) {
            console.warn('[InventoryPicker] Failed to save to cache:', e);
        }
    }

    /**
     * localStorage key for caching individual product details
     */
    static DETAILS_CACHE_KEY = 'inventory_product_details_cache';

    /**
     * Get product details from session cache (cleared on modal close)
     */
    getProductDetailsFromCache(productId) {
        try {
            const cached = localStorage.getItem(InventoryPickerDialog.DETAILS_CACHE_KEY);
            if (!cached) return null;

            const detailsMap = JSON.parse(cached);
            return detailsMap[String(productId)] || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Save product details to session cache. Excludes _raw data to save space.
     * Cache is cleared when modal closes.
     */
    saveProductDetailsToCache(productId, details) {
        try {
            const cached = localStorage.getItem(InventoryPickerDialog.DETAILS_CACHE_KEY);
            const detailsMap = cached ? JSON.parse(cached) : {};

            const { _raw, ...detailsWithoutRaw } = details;
            detailsMap[String(productId)] = {
                ...detailsWithoutRaw,
                cachedAt: Date.now()
            };

            localStorage.setItem(InventoryPickerDialog.DETAILS_CACHE_KEY, JSON.stringify(detailsMap));
        } catch (e) {
            console.warn('[InventoryPicker] Failed to cache product details:', e);
            if (e.name === 'QuotaExceededError') {
                try {
                    localStorage.removeItem(InventoryPickerDialog.DETAILS_CACHE_KEY);
                } catch (_) {}
            }
        }
    }

    /**
     * Load selected products from localStorage
     */
    loadSelectedFromStorage() {
        try {
            const cached = localStorage.getItem(InventoryPickerDialog.SELECTED_CACHE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                this.selectedProducts = new Map(Object.entries(data));
                console.log(`[InventoryPicker] Loaded ${this.selectedProducts.size} selected products from storage`);
            } else {
                this.selectedProducts = new Map();
            }
        } catch (e) {
            console.warn('[InventoryPicker] Failed to load selected products:', e);
            this.selectedProducts = new Map();
        }
    }

    /**
     * Save selected products to localStorage
     */
    saveSelectedToStorage() {
        try {
            const data = Object.fromEntries(this.selectedProducts);
            localStorage.setItem(InventoryPickerDialog.SELECTED_CACHE_KEY, JSON.stringify(data));
            console.log(`[InventoryPicker] Saved ${this.selectedProducts.size} selected products to storage`);
        } catch (e) {
            console.warn('[InventoryPicker] Failed to save selected products:', e);
        }
    }

    /**
     * Clear selected products from localStorage
     */
    clearSelectedFromStorage() {
        try {
            localStorage.removeItem(InventoryPickerDialog.SELECTED_CACHE_KEY);
            this.selectedProducts = new Map();
            console.log('[InventoryPicker] Cleared selected products from storage');
        } catch (e) {
            console.warn('[InventoryPicker] Failed to clear selected products:', e);
        }
    }

    /**
     * Reload products from TPOS API (clear cache)
     */
    async reloadProducts() {
        await this.loadProductsFromTPOS(true);
        this.updateProductsList();
    }

    /**
     * Fetch product details from TPOS by ID
     * @param {number} productId - Product ID
     * @returns {Object} Product details with ImageUrl, DefaultCode, NameTemplate, QtyAvailable, StandardPrice, PriceVariant
     */
    async fetchProductDetails(productId) {
        try {
            const response = await window.TPOSClient.authenticatedFetch(
                `${this.proxyUrl}/api/odata/Product(${productId})?$expand=UOM,Categ,UOMPO,POSCateg,AttributeValues`
            );

            if (!response.ok) {
                throw new Error(`TPOS API error: ${response.status}`);
            }

            const data = await response.json();

            let image = data.ImageUrl || (data.Thumbnails && data.Thumbnails[2]) || '';

            // If variant has no image, try to get parent product's image
            if (!image && data.ProductTmplId) {
                image = await this.fetchParentImage(data.ProductTmplId);
            }

            // Map to our format - use original productId to preserve variant identity
            return {
                id: productId,
                code: data.DefaultCode || data.Barcode || '',
                name: data.NameTemplate || data.Name || '',
                image: image,
                qtyAvailable: data.QtyAvailable || 0,
                purchasePrice: data.StandardPrice || 0,
                sellingPrice: data.PriceVariant || data.ListPrice || 0,
                variant: data.DisplayAttributeValues || '',
                tposProductId: data.Id || null,
                tposProductTmplId: data.ProductTmplId || null,
                // Keep original data for reference
                _raw: data
            };

        } catch (error) {
            console.error(`Error fetching product ${productId}:`, error);
            return null;
        }
    }

    /**
     * Fetch parent product image by ProductTmplId
     * Uses ProductTemplate API to get the template's canonical image
     * Logic: variant.ImageUrl → templateData.ImageUrl → ''
     */
    async fetchParentImage(templateId) {
        try {
            if (!this._templateImageCache) this._templateImageCache = {};
            if (this._templateImageCache[templateId] !== undefined) {
                return this._templateImageCache[templateId];
            }

            const response = await window.TPOSClient.authenticatedFetch(
                `${this.proxyUrl}/api/odata/ProductTemplate(${templateId})?$select=Id,ImageUrl`
            );

            if (!response.ok) {
                this._templateImageCache[templateId] = '';
                return '';
            }

            const templateData = await response.json();
            const img = templateData.ImageUrl || '';
            this._templateImageCache[templateId] = img;
            return img;
        } catch (error) {
            console.warn('[InventoryPicker] Failed to fetch template image:', error);
            this._templateImageCache[templateId] = '';
            return '';
        }
    }

    /**
     * Update loading state in UI
     */
    updateLoadingState(loading) {
        const listContainer = this.modalElement?.querySelector('#inventoryProductsList');
        const countText = this.modalElement?.querySelector('#productCountText');

        if (loading) {
            if (listContainer) {
                listContainer.innerHTML = `
                    <div style="padding: 60px 20px; text-align: center; color: #9ca3af;">
                        <div style="width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px;"></div>
                        <p>Đang tải sản phẩm từ TPOS...</p>
                    </div>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                `;
            }
            if (countText) countText.textContent = 'Đang tải...';
        }
    }

    close() {
        if (this._zoomCleanup) this._zoomCleanup();
        // Clear details cache on close - only needed during browsing session
        localStorage.removeItem(InventoryPickerDialog.DETAILS_CACHE_KEY);
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
    }

    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
            // Focus search input
            setTimeout(() => {
                this.modalElement.querySelector('#inventorySearchInput')?.focus();
            }, 100);
        }
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        this.modalElement = document.createElement('div');
        this.modalElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 6000;
            padding: 20px;
        `;

        this.modalElement.innerHTML = `
            <div style="
                background: white;
                border-radius: 12px;
                width: 100%;
                max-width: 1000px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            ">
                <!-- Header -->
                <div style="
                    padding: 16px 20px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Chọn sản phẩm từ kho</h2>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button type="button" id="btnReloadInventory" title="Tải lại danh sách sản phẩm từ TPOS" style="
                            background: none;
                            border: 1px solid #d1d5db;
                            padding: 6px 12px;
                            cursor: pointer;
                            border-radius: 6px;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            color: #374151;
                            font-size: 13px;
                            transition: all 0.15s;
                        ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="reloadIcon">
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <polyline points="1 20 1 14 7 14"></polyline>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                            Tải lại
                        </button>
                        <button type="button" id="btnCloseInventory" style="
                            background: none;
                            border: none;
                            padding: 8px;
                            cursor: pointer;
                            border-radius: 6px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #6b7280;
                        ">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Search -->
                <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; position: relative;">
                    <input type="text" id="inventorySearchInput" placeholder="Tìm kiếm theo mã SP, tên, variant (tối thiểu 2 ký tự)..." autocomplete="off" style="
                        width: 100%;
                        padding: 10px 14px;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        font-size: 14px;
                        box-sizing: border-box;
                    ">
                    <!-- Search suggestions dropdown -->
                    <div id="searchSuggestionsDropdown" style="
                        display: none;
                        position: absolute;
                        left: 20px;
                        right: 20px;
                        top: 52px;
                        background: white;
                        border: 1px solid #d1d5db;
                        border-radius: 0 0 8px 8px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        z-index: 10;
                        overflow: hidden;
                    ">
                        <div class="search-suggestion-item" data-search-mode="name" style="
                            padding: 10px 14px;
                            cursor: pointer;
                            font-size: 14px;
                            background: #5b6abf;
                            color: white;
                        ">
                            Tìm kiếm <em>Tên</em> Cho: <strong id="suggestionTermName"></strong>
                        </div>
                        <div class="search-suggestion-item" data-search-mode="code" style="
                            padding: 10px 14px;
                            cursor: pointer;
                            font-size: 14px;
                        ">
                            Tìm kiếm <em>Mã</em> Cho: <strong id="suggestionTermCode"></strong>
                        </div>
                    </div>
                    <p id="productCountText" style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">
                        Hiển thị ${this.filteredProducts.length} sản phẩm mới nhất
                    </p>
                </div>

                <!-- Products List -->
                <div style="flex: 1; overflow-y: auto; padding: 0;" id="inventoryProductsList">
                    ${this.renderProductsList()}
                </div>

                <!-- Footer -->
                <div style="
                    padding: 12px 20px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #f9fafb;
                ">
                    <div style="font-size: 13px; color: #6b7280; display: flex; align-items: center; gap: 12px;">
                        <span>Đã chọn <span id="selectedCount" style="font-weight: 600; color: #3b82f6;">${this.selectedProducts.size}</span> sản phẩm</span>
                        <button type="button" id="btnDeselectAll" style="
                            background: none;
                            border: 1px solid #d1d5db;
                            border-radius: 6px;
                            color: #6b7280;
                            font-size: 12px;
                            cursor: pointer;
                            padding: 4px 10px;
                            display: ${this.selectedProducts.size > 0 ? 'inline-block' : 'none'};
                        ">Bỏ chọn tất cả</button>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" id="btnCancelInventory" style="
                            padding: 8px 16px;
                            border: 1px solid #d1d5db;
                            border-radius: 8px;
                            background: white;
                            cursor: pointer;
                            font-size: 14px;
                        ">Hủy</button>
                        <button type="button" id="btnAddSelectedProducts" style="
                            padding: 8px 16px;
                            border: none;
                            border-radius: 8px;
                            background: #3b82f6;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                        ">Thêm sản phẩm đã chọn</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);
        this.bindEvents();
        this.initImageZoomHover();
    }

    renderProductsList() {
        if (this.isLoading) {
            return `
                <div style="padding: 60px 20px; text-align: center; color: #9ca3af;">
                    <p>Đang tải sản phẩm...</p>
                </div>
            `;
        }

        // When no search term: show selected products list
        if (this.searchTerm.length < 2) {
            // If has selected products, show them
            if (this.selectedProducts.size > 0) {
                return this.renderSelectedProductsList();
            }
            // Otherwise show search instruction
            return `
                <div style="padding: 60px 20px; text-align: center; color: #9ca3af;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin: 0 auto 12px; display: block; opacity: 0.5;">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.3-4.3"></path>
                    </svg>
                    <p>Nhập từ khóa tìm kiếm (tối thiểu 2 ký tự)</p>
                    <p style="font-size: 12px; margin-top: 8px;">Có ${this.products.length} sản phẩm trong kho</p>
                </div>
            `;
        }

        if (this.filteredProducts.length === 0) {
            return `
                <div style="padding: 60px 20px; text-align: center; color: #9ca3af;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin: 0 auto 12px; display: block; opacity: 0.5;">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    </svg>
                    <p>Không tìm thấy sản phẩm</p>
                </div>
            `;
        }

        return `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f9fafb;">
                        <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 60px;">Hình ảnh</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 80px;">Mã SP</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Tên sản phẩm</th>
                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 70px;">Tồn kho</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">Giá mua</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">Giá bán</th>
                        <th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 50px;">
                            <input type="checkbox" id="selectAllCheckbox" title="Chọn tất cả" style="width: 18px; height: 18px; accent-color: #3b82f6; cursor: pointer;">
                        </th>
                    </tr>
                </thead>
                <tbody>
                    ${this.filteredProducts.map(product => {
                        const isSelected = this.selectedProducts.has(String(product.id));
                        // Get cached details if available
                        const cachedDetails = this.getProductDetailsFromCache(product.id);
                        const imageUrl = cachedDetails?.image || product.image || '';
                        const productCode = product.code || '';
                        const productName = product.name || '';
                        const qtyAvailable = cachedDetails?.qtyAvailable ?? product.qtyAvailable ?? '-';
                        const purchasePrice = cachedDetails?.purchasePrice || product.purchasePrice || 0;
                        const sellingPrice = cachedDetails?.sellingPrice || product.sellingPrice || 0;

                        return `
                            <tr data-product-id="${product.id}" style="
                                cursor: pointer;
                                transition: background 0.15s;
                                ${isSelected ? 'background: #eff6ff;' : ''}
                            " onmouseover="if(!this.dataset.selected)this.style.background='#f9fafb'" onmouseout="if(!this.dataset.selected)this.style.background='${isSelected ? '#eff6ff' : 'transparent'}'" ${isSelected ? 'data-selected="true"' : ''}>
                                <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6;" class="inventory-image-cell">
                                    ${imageUrl
                                        ? `<img src="${imageUrl}" alt="" class="inventory-thumb" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" data-product-id="${product.id}">`
                                        : `<div class="inventory-thumb-placeholder" data-product-id="${product.id}" style="width: 40px; height: 40px; background: #f3f4f6; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                                <polyline points="21,15 16,10 5,21"></polyline>
                                            </svg>
                                        </div>`
                                    }
                                </td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; font-weight: 500; color: #3b82f6;">${productCode || '-'}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6;">${productName}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #6b7280;">${qtyAvailable}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: right;">${this.formatPrice(purchasePrice)}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: right;">${this.formatPrice(sellingPrice)}</td>
                                <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6; text-align: center;">
                                    <input type="checkbox" ${isSelected ? 'checked' : ''} style="
                                        width: 18px;
                                        height: 18px;
                                        accent-color: #3b82f6;
                                        cursor: pointer;
                                    ">
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Format price in VND
     */
    formatPrice(value) {
        if (!value || value === 0) return '-';
        const num = parseFloat(value);
        if (isNaN(num)) return '-';
        return num.toLocaleString('vi-VN') + ' đ';
    }

    /**
     * Render selected products list (shown when no search term)
     */
    renderSelectedProductsList() {
        const selectedArray = Array.from(this.selectedProducts.values());

        return `
            <div style="padding: 12px 16px; background: #f0f9ff; border-bottom: 1px solid #bfdbfe;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13px; color: #1e40af; font-weight: 500;">
                        Danh sách đã chọn (${selectedArray.length} sản phẩm)
                    </span>
                    <button type="button" id="btnClearSelected" style="
                        background: none;
                        border: none;
                        color: #dc2626;
                        font-size: 12px;
                        cursor: pointer;
                        padding: 4px 8px;
                        border-radius: 4px;
                    ">Xóa tất cả</button>
                </div>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f9fafb;">
                        <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 60px;">Hình ảnh</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 80px;">Mã SP</th>
                        <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb;">Tên sản phẩm</th>
                        <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 70px;">Tồn kho</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">Giá mua</th>
                        <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 100px;">Giá bán</th>
                        <th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; width: 50px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedArray.map(product => {
                        const imageUrl = product.image || '';
                        const productCode = product.code || '';
                        const productName = product.name || '';
                        const qtyAvailable = product.qtyAvailable ?? '-';
                        const purchasePrice = product.purchasePrice || 0;
                        const sellingPrice = product.sellingPrice || 0;

                        return `
                            <tr data-product-id="${product.id}" data-selected="true" style="background: #eff6ff; cursor: pointer;">
                                <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6;" class="inventory-image-cell">
                                    ${imageUrl
                                        ? `<img src="${imageUrl}" alt="" class="inventory-thumb" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" data-product-id="${product.id}">`
                                        : `<div class="inventory-thumb-placeholder" data-product-id="${product.id}" style="width: 40px; height: 40px; background: #f3f4f6; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                                <polyline points="21,15 16,10 5,21"></polyline>
                                            </svg>
                                        </div>`
                                    }
                                </td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; font-weight: 500; color: #3b82f6;">${productCode || '-'}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6;">${productName}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #6b7280;">${qtyAvailable}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: right;">${this.formatPrice(purchasePrice)}</td>
                                <td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: right;">${this.formatPrice(sellingPrice)}</td>
                                <td style="padding: 10px 16px; border-bottom: 1px solid #f3f4f6; text-align: center;">
                                    <button type="button" class="btn-remove-product" data-id="${product.id}" style="
                                        background: none;
                                        border: none;
                                        color: #dc2626;
                                        cursor: pointer;
                                        padding: 4px;
                                    ">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Update products list in UI
     */
    updateProductsList() {
        const listContainer = this.modalElement?.querySelector('#inventoryProductsList');
        const countText = this.modalElement?.querySelector('#productCountText');

        if (listContainer) {
            listContainer.innerHTML = this.renderProductsList();

            // Bind event for clear all button (in selected list view)
            listContainer.querySelector('#btnClearSelected')?.addEventListener('click', () => {
                this.clearSelectedFromStorage();
                this.updateProductsList();
                this.updateSelectedCount();
            });

            // Update select-all checkbox state
            const selectAllCb = listContainer.querySelector('#selectAllCheckbox');
            if (selectAllCb && this.filteredProducts.length > 0) {
                const allSelected = this.filteredProducts.every(p => this.selectedProducts.has(String(p.id)));
                selectAllCb.checked = allSelected;
            }

            // Bind select-all checkbox event
            selectAllCb?.addEventListener('change', (e) => {
                const checked = e.target.checked;
                if (checked) {
                    this.selectAllFiltered();
                } else {
                    this.deselectAllFiltered();
                }
            });

            // Bind events for remove individual product buttons
            listContainer.querySelectorAll('.btn-remove-product').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const productId = btn.dataset.id;
                    this.selectedProducts.delete(String(productId));
                    this.saveSelectedToStorage();
                    this.updateProductsList();
                    this.updateSelectedCount();
                });
            });
        }
        if (countText) {
            if (this.searchTerm.length < 2) {
                if (this.selectedProducts.size > 0) {
                    countText.textContent = `Đã chọn ${this.selectedProducts.size} sản phẩm`;
                } else {
                    countText.textContent = `Có ${this.products.length} sản phẩm trong kho`;
                }
            } else {
                const modeLabel = this.searchMode === 'name' ? ' (theo tên)' : this.searchMode === 'code' ? ' (theo mã)' : '';
                countText.textContent = `Tìm thấy ${this.filteredProducts.length} sản phẩm${modeLabel}`;
            }
        }

        // Load images for visible products
        this.loadImagesForVisibleProducts();
    }

    /**
     * Batch load images for visible search result products.
     * Fetches product details from TPOS API for products without cached images,
     * then updates the image cells in-place without re-rendering the whole list.
     */
    async loadImagesForVisibleProducts() {
        if (!this.modalElement) return;

        // Collect product IDs that don't have images yet
        const productsNeedingImages = [];
        const rows = this.modalElement.querySelectorAll('#inventoryProductsList tr[data-product-id]');

        rows.forEach(row => {
            const productId = row.dataset.productId;
            const cachedDetails = this.getProductDetailsFromCache(productId);
            const hasImage = cachedDetails?.image || this.products.find(p => String(p.id) === productId)?.image;
            if (!hasImage) {
                productsNeedingImages.push({ id: productId, row });
            }
        });

        if (productsNeedingImages.length === 0) return;

        // Limit concurrent fetches to avoid overwhelming the API
        const BATCH_SIZE = 5;
        const batchId = ++this._imageBatchId;

        for (let i = 0; i < productsNeedingImages.length; i += BATCH_SIZE) {
            // Abort if a new search happened
            if (this._imageBatchId !== batchId) return;

            const batch = productsNeedingImages.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async ({ id, row }) => {
                try {
                    // Check cache again (might have been fetched by another batch)
                    let details = this.getProductDetailsFromCache(id);
                    if (!details) {
                        details = await this.fetchProductDetails(id);
                        if (details) {
                            this.saveProductDetailsToCache(id, details);
                        }
                    }

                    if (details?.image && this._imageBatchId === batchId) {
                        // Update image cell in-place
                        const imgCell = row.querySelector('.inventory-image-cell');
                        if (imgCell) {
                            imgCell.innerHTML = `<img src="${details.image}" alt="" class="inventory-thumb" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" data-product-id="${id}">`;
                        }

                        // Also update row data (qty, prices) if available
                        const qtyCell = row.querySelector('td:nth-child(4)');
                        if (qtyCell && details.qtyAvailable != null) {
                            qtyCell.textContent = details.qtyAvailable;
                        }
                        const buyCell = row.querySelector('td:nth-child(5)');
                        if (buyCell && details.purchasePrice) {
                            buyCell.textContent = this.formatPrice(details.purchasePrice);
                        }
                        const sellCell = row.querySelector('td:nth-child(6)');
                        if (sellCell && details.sellingPrice) {
                            sellCell.textContent = this.formatPrice(details.sellingPrice);
                        }
                    }
                } catch (err) {
                    console.warn(`[InventoryPicker] Failed to load image for product ${id}:`, err);
                }
            });

            await Promise.all(promises);
        }
    }

    /**
     * Initialize image zoom hover for the inventory picker modal.
     * Shows a large preview next to the cursor when hovering over product thumbnails.
     */
    initImageZoomHover() {
        if (!this.modalElement) return;

        let zoomEl = null;

        const getOrCreateZoom = () => {
            if (!zoomEl) {
                zoomEl = document.createElement('img');
                zoomEl.className = 'inventory-zoom-preview';
                document.body.appendChild(zoomEl);
            }
            return zoomEl;
        };

        const positionZoom = (e, el) => {
            const offset = 16;
            const w = 280, h = 280;
            let x = e.clientX + offset;
            let y = e.clientY - h / 2;

            if (x + w > window.innerWidth) x = e.clientX - w - offset;
            if (y < 4) y = 4;
            if (y + h > window.innerHeight - 4) y = window.innerHeight - h - 4;

            el.style.left = x + 'px';
            el.style.top = y + 'px';
        };

        const listContainer = this.modalElement.querySelector('#inventoryProductsList');
        if (!listContainer) return;

        listContainer.addEventListener('mouseenter', (e) => {
            const thumb = e.target.closest('.inventory-thumb');
            if (!thumb) return;
            const zoom = getOrCreateZoom();
            zoom.src = thumb.src;
            zoom.classList.add('visible');
            positionZoom(e, zoom);
        }, true);

        listContainer.addEventListener('mousemove', (e) => {
            const thumb = e.target.closest('.inventory-thumb');
            if (!thumb || !zoomEl) return;
            positionZoom(e, zoomEl);
        }, true);

        listContainer.addEventListener('mouseleave', (e) => {
            const thumb = e.target.closest('.inventory-thumb');
            if (!thumb || !zoomEl) return;
            zoomEl.classList.remove('visible');
        }, true);

        // Clean up zoom element when modal is closed
        this._zoomCleanup = () => {
            if (zoomEl) {
                zoomEl.remove();
                zoomEl = null;
            }
        };
    }

    /**
     * Filter products by search term (min 2 characters)
     * Search by: Mã SP (code) and Tên sản phẩm (name)
     * Only show results when searching to avoid lag with large lists
     * @param {string} term - search term
     * @param {string} mode - 'all' (default), 'name', or 'code'
     */
    filterProducts(term, mode = 'all') {
        this.searchTerm = term.toLowerCase().trim();
        this.searchMode = mode;

        // Helper: lấy phần tên sau [] - VD: "[B13] B1 0603 QUẦN..." → "b1 0603 quần..."
        const getNameWithoutBracket = (name) => {
            const idx = name.indexOf(']');
            return idx !== -1 ? name.substring(idx + 1).trim() : name;
        };

        // Require at least 2 characters - don't show all products to avoid lag
        if (this.searchTerm.length < 2) {
            this.filteredProducts = []; // Empty - will show search instruction
        } else {
            this.filteredProducts = this.products.filter(p => {
                const fullName = (p.name || '').toLowerCase();
                const code = (p.code || '').toLowerCase();

                if (mode === 'name') {
                    // Tìm theo tên: chỉ tìm trong phần sau []
                    const nameOnly = getNameWithoutBracket(fullName);
                    return nameOnly.includes(this.searchTerm);
                }
                if (mode === 'code') return code.includes(this.searchTerm);
                return fullName.includes(this.searchTerm) || code.includes(this.searchTerm);
            });

            // Sort: exact/earlier matches first
            const term = this.searchTerm;
            this.filteredProducts.sort((a, b) => {
                const aFullName = (a.name || '').toLowerCase();
                const aCode = (a.code || '').toLowerCase();
                const bFullName = (b.name || '').toLowerCase();
                const bCode = (b.code || '').toLowerCase();

                const scoreName = (fullName) => {
                    const nameOnly = getNameWithoutBracket(fullName);
                    const pos = nameOnly.indexOf(term);
                    if (pos === -1) return 999;
                    return pos;
                };

                const scoreCode = (code) => {
                    if (code === term) return -2;
                    if (code.startsWith(term)) return -1;
                    if (code.includes(term)) return 0;
                    return 999;
                };

                if (mode === 'name') {
                    return scoreName(aFullName) - scoreName(bFullName);
                } else if (mode === 'code') {
                    return scoreCode(aCode) - scoreCode(bCode);
                }
                const aScore = Math.min(scoreCode(aCode), scoreName(aFullName));
                const bScore = Math.min(scoreCode(bCode), scoreName(bFullName));
                return aScore - bScore;
            });
        }

        this.updateProductsList();
    }

    /**
     * Update selected count in footer
     */
    updateSelectedCount() {
        const countEl = this.modalElement?.querySelector('#selectedCount');
        if (countEl) {
            countEl.textContent = this.selectedProducts.size;
        }
        const deselectBtn = this.modalElement?.querySelector('#btnDeselectAll');
        if (deselectBtn) {
            deselectBtn.style.display = this.selectedProducts.size > 0 ? 'inline-block' : 'none';
        }
    }

    /**
     * Handle product selection - fetch full details from TPOS and cache
     */
    async handleProductSelect(productId, row) {
        const productIdStr = String(productId);

        // If already selected, deselect
        if (this.selectedProducts.has(productIdStr)) {
            this.selectedProducts.delete(productIdStr);
            this.saveSelectedToStorage();
            row.style.background = 'transparent';
            row.removeAttribute('data-selected');
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = false;
            this.updateSelectedCount();
            return;
        }

        // Check cache first
        let productDetails = this.getProductDetailsFromCache(productId);

        if (!productDetails) {
            // Show loading on this row
            row.style.opacity = '0.6';
            row.style.pointerEvents = 'none';

            try {
                // Fetch full product details from TPOS
                productDetails = await this.fetchProductDetails(productId);

                if (productDetails) {
                    // Save to localStorage cache for future use
                    this.saveProductDetailsToCache(productId, productDetails);
                }
            } catch (error) {
                console.error('Failed to fetch product details:', error);
            } finally {
                row.style.opacity = '1';
                row.style.pointerEvents = 'auto';
            }
        }

        // Get original product from Excel list (has full name with variant info)
        const basicProduct = this.products.find(p => String(p.id) === productIdStr);

        if (productDetails) {
            // Preserve the original full name from Excel (includes variant prefix/suffix)
            // e.g. "[B35T] B4 0603 ÁO THUN CHỮ GUESS 7688 (Trắng)" instead of "B4 0603 ÁO THUN CHỮ GUESS 7688"
            if (basicProduct?.name) {
                productDetails.name = basicProduct.name;
            }
            this.selectedProducts.set(productIdStr, productDetails);
        } else if (basicProduct) {
            this.selectedProducts.set(productIdStr, basicProduct);
        }

        // Save selected products to localStorage
        this.saveSelectedToStorage();

        // Update UI without clearing search - allow continued multi-selection
        if (this.searchTerm.length >= 2) {
            // Stay in search results view - just update checkbox and row style
            row.style.background = '#eff6ff';
            row.setAttribute('data-selected', 'true');
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = true;
        } else {
            this.updateProductsList();
        }
        this.updateSelectedCount();
    }

    /**
     * Update table row with fetched product details
     */
    updateRowWithDetails(row, details) {
        // Update image
        if (details.image) {
            const imgCell = row.querySelector('td:first-child');
            if (imgCell) {
                imgCell.innerHTML = `<img src="${details.image}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb;">`;
            }
        }

        // Update Tồn kho (4th column, index 3)
        const cells = row.querySelectorAll('td');
        if (cells[3] && details.qtyAvailable !== undefined) {
            cells[3].textContent = details.qtyAvailable;
        }

        // Update Giá bán (6th column, index 5)
        if (cells[5] && details.sellingPrice) {
            cells[5].textContent = this.formatPrice(details.sellingPrice);
        }
    }

    /**
     * Select all currently filtered/visible products
     */
    async selectAllFiltered() {
        for (const product of this.filteredProducts) {
            const productIdStr = String(product.id);
            if (!this.selectedProducts.has(productIdStr)) {
                let productDetails = this.getProductDetailsFromCache(product.id);
                if (productDetails) {
                    // Preserve original full name from Excel (includes variant info)
                    if (product.name) {
                        productDetails = { ...productDetails, name: product.name };
                    }
                    this.selectedProducts.set(productIdStr, productDetails);
                } else {
                    this.selectedProducts.set(productIdStr, product);
                }
            }
        }
        this.saveSelectedToStorage();
        this.updateProductsList();
        this.updateSelectedCount();
    }

    /**
     * Deselect all currently filtered/visible products
     */
    deselectAllFiltered() {
        for (const product of this.filteredProducts) {
            this.selectedProducts.delete(String(product.id));
        }
        this.saveSelectedToStorage();
        this.updateProductsList();
        this.updateSelectedCount();
    }

    bindEvents() {
        // Close buttons
        this.modalElement.querySelector('#btnCloseInventory')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelInventory')?.addEventListener('click', () => this.close());

        // Deselect all button
        this.modalElement.querySelector('#btnDeselectAll')?.addEventListener('click', () => {
            this.clearSelectedFromStorage();
            this.updateProductsList();
            this.updateSelectedCount();
        });

        // Reload button
        this.modalElement.querySelector('#btnReloadInventory')?.addEventListener('click', async () => {
            const btn = this.modalElement.querySelector('#btnReloadInventory');
            const icon = btn?.querySelector('#reloadIcon');

            // Add spinning animation
            if (icon) {
                icon.style.animation = 'spin 1s linear infinite';
            }
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.6';
            }

            try {
                await this.reloadProducts();
            } finally {
                // Remove spinning animation
                if (icon) {
                    icon.style.animation = '';
                }
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            }
        });

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Search with suggestions dropdown
        let searchTimeout;
        const searchInput = this.modalElement.querySelector('#inventorySearchInput');
        const suggestionsDropdown = this.modalElement.querySelector('#searchSuggestionsDropdown');
        const suggestionItems = this.modalElement.querySelectorAll('.search-suggestion-item');
        const suggestionTermName = this.modalElement.querySelector('#suggestionTermName');
        const suggestionTermCode = this.modalElement.querySelector('#suggestionTermCode');
        let activeSuggestionIndex = 0; // 0 = name (default), 1 = code

        const updateSuggestionHighlight = () => {
            suggestionItems.forEach((item, i) => {
                if (i === activeSuggestionIndex) {
                    item.style.background = '#5b6abf';
                    item.style.color = 'white';
                } else {
                    item.style.background = 'white';
                    item.style.color = '#333';
                }
            });
        };

        const hideSuggestions = () => {
            if (suggestionsDropdown) suggestionsDropdown.style.display = 'none';
        };

        const showSuggestions = (term) => {
            if (!suggestionsDropdown || term.trim().length === 0) {
                hideSuggestions();
                return;
            }
            if (suggestionTermName) suggestionTermName.textContent = term;
            if (suggestionTermCode) suggestionTermCode.textContent = term;
            activeSuggestionIndex = 0;
            updateSuggestionHighlight();
            suggestionsDropdown.style.display = 'block';
        };

        const executeSearch = (mode) => {
            const term = searchInput?.value || '';
            hideSuggestions();
            this.filterProducts(term, mode);
        };

        searchInput?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const term = e.target.value;
            showSuggestions(term);
            // Don't auto-search while suggestions are showing - wait for selection or Enter
        });

        searchInput?.addEventListener('keydown', (e) => {
            if (suggestionsDropdown?.style.display === 'block') {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, suggestionItems.length - 1);
                    updateSuggestionHighlight();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
                    updateSuggestionHighlight();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const mode = activeSuggestionIndex === 0 ? 'name' : 'code';
                    executeSearch(mode);
                } else if (e.key === 'Escape') {
                    hideSuggestions();
                }
            } else if (e.key === 'Enter') {
                // If suggestions not visible, default search by name
                e.preventDefault();
                executeSearch('name');
            }
        });

        // Click on suggestion items
        suggestionItems.forEach((item, i) => {
            item.addEventListener('mouseenter', () => {
                activeSuggestionIndex = i;
                updateSuggestionHighlight();
            });
            item.addEventListener('click', () => {
                const mode = item.dataset.searchMode;
                executeSearch(mode);
            });
        });

        // Hide suggestions when clicking outside
        this.modalElement.addEventListener('click', (e) => {
            if (!e.target.closest('#inventorySearchInput') && !e.target.closest('#searchSuggestionsDropdown')) {
                hideSuggestions();
            }
        });

        // Select products (using event delegation)
        this.modalElement.querySelector('#inventoryProductsList')?.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-product-id]');
            if (!row) return;

            const productId = row.dataset.productId;
            this.handleProductSelect(productId, row);
        });

        // Add selected products
        this.modalElement.querySelector('#btnAddSelectedProducts')?.addEventListener('click', () => {
            console.log('[InventoryPicker] btnAddSelectedProducts clicked');
            console.log('[InventoryPicker] selectedProducts size:', this.selectedProducts.size);
            console.log('[InventoryPicker] onSelect exists:', !!this.onSelect);

            if (this.selectedProducts.size > 0 && this.onSelect) {
                const productsArray = Array.from(this.selectedProducts.values());
                console.log('[InventoryPicker] Products to add:', productsArray.length, productsArray);

                try {
                    this.onSelect(productsArray);
                    console.log('[InventoryPicker] onSelect completed successfully');
                } catch (error) {
                    console.error('[InventoryPicker] onSelect ERROR:', error);
                }

                this.clearSelectedFromStorage(); // Reset for next time
                this.close();
            } else {
                console.log('[InventoryPicker] Skipping - no products or no callback');
            }
        });
    }
}

// ========================================
// SHIPPING FEE DIALOG
// ========================================

class ShippingFeeDialog {
    constructor() {
        this.modalElement = null;
        this.currentFee = 0;
        this.onSave = null;
    }

    /**
     * Open shipping fee dialog
     * @param {Object} options - { currentFee, onSave }
     */
    open(options = {}) {
        this.currentFee = options.currentFee || 0;
        this.onSave = options.onSave;

        this.render();
        this.show();
    }

    close() {
        if (this.modalElement) {
            this.modalElement.classList.add('modal-overlay--exit');
            setTimeout(() => {
                this.modalElement.remove();
                this.modalElement = null;
            }, 200);
        }
    }

    show() {
        if (this.modalElement) {
            this.modalElement.style.display = 'flex';
            // Focus input
            setTimeout(() => {
                this.modalElement.querySelector('#shippingFeeInput')?.focus();
            }, 100);
        }
    }

    render() {
        if (this.modalElement) {
            this.modalElement.remove();
        }

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-overlay';
        // Use higher z-index to appear above the form modal (which uses 5000)
        this.modalElement.style.zIndex = '6000';
        this.modalElement.innerHTML = `
            <div class="modal modal--xs">
                <div class="modal__header">
                    <h2 class="modal__title">Phí vận chuyển</h2>
                    <button type="button" class="modal__close" id="btnCloseShipping">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <div class="modal__body">
                    <div class="form-group">
                        <label class="form-label">Nhập phí ship (VND)</label>
                        <input type="text" class="form-input form-input--lg form-input--number"
                               id="shippingFeeInput"
                               placeholder="0"
                               value="${this.formatNumber(this.currentFee)}">
                    </div>

                    <div class="shipping-presets">
                        <button class="btn btn-sm btn-outline" data-amount="0">0</button>
                        <button class="btn btn-sm btn-outline" data-amount="20000">20.000</button>
                        <button class="btn btn-sm btn-outline" data-amount="30000">30.000</button>
                        <button class="btn btn-sm btn-outline" data-amount="50000">50.000</button>
                    </div>
                </div>

                <div class="modal__footer">
                    <button class="btn btn-outline" id="btnCancelShipping">Hủy</button>
                    <button class="btn btn-primary" id="btnSaveShipping">
                        <i data-lucide="check"></i>
                        <span>Xác nhận</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.bindEvents();
    }

    formatNumber(value) {
        if (!value || value === 0) return '';
        return value.toLocaleString('vi-VN');
    }

    parseNumber(value) {
        if (!value) return 0;
        return parseInt(value.replace(/[^\d]/g, ''), 10) || 0;
    }

    bindEvents() {
        const input = this.modalElement.querySelector('#shippingFeeInput');

        // Close buttons
        this.modalElement.querySelector('#btnCloseShipping')?.addEventListener('click', () => this.close());
        this.modalElement.querySelector('#btnCancelShipping')?.addEventListener('click', () => this.close());

        // Overlay click
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        // Format input
        input?.addEventListener('input', (e) => {
            const value = this.parseNumber(e.target.value);
            e.target.value = value ? value.toLocaleString('vi-VN') : '';
        });

        // Preset buttons
        this.modalElement.querySelectorAll('[data-amount]').forEach(btn => {
            btn.addEventListener('click', () => {
                const amount = parseInt(btn.dataset.amount, 10);
                input.value = amount ? amount.toLocaleString('vi-VN') : '0';
            });
        });

        // Save
        this.modalElement.querySelector('#btnSaveShipping')?.addEventListener('click', () => {
            const fee = this.parseNumber(input.value);
            if (this.onSave) {
                this.onSave(fee);
            }
            this.close();
        });

        // Enter key
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.modalElement.querySelector('#btnSaveShipping')?.click();
            }
        });
    }
}

// ========================================
// VARIANT DROPDOWN SELECTOR
// Matches: VariantDropdownSelector.tsx
// ========================================

class VariantDropdownSelector {
    constructor() {
        this.element = null;
        this.isOpen = false;
        this.variants = [];
        this.baseProductCode = null;
        this.currentValue = '';
        this.onSelect = null;
        this.onChange = null;
        this.disabled = false;
        this.targetInput = null;
    }

    /**
     * Attach to input element
     * @param {HTMLInputElement} inputElement - The variant input field
     * @param {Object} options - { baseProductCode, onSelect, onChange, disabled }
     */
    attach(inputElement, options = {}) {
        this.targetInput = inputElement;
        this.baseProductCode = options.baseProductCode;
        this.onSelect = options.onSelect;
        this.onChange = options.onChange;
        this.disabled = options.disabled || false;
        this.currentValue = inputElement.value || '';

        // Create dropdown wrapper
        this.createDropdown();

        // Bind events
        this.bindEvents();

        // Load variants if we have a base code
        if (this.baseProductCode) {
            this.loadVariants();
        }
    }

    /**
     * Update base product code and reload variants
     * @param {string} baseCode
     */
    updateBaseCode(baseCode) {
        this.baseProductCode = baseCode;
        if (baseCode) {
            this.loadVariants();
        } else {
            this.variants = [];
            this.updateDropdownContent();
        }
    }

    /**
     * Load variants from Firestore
     */
    async loadVariants() {
        if (!this.baseProductCode) {
            this.variants = [];
            this.updateDropdownContent();
            return;
        }

        try {
            const db = firebase.firestore();

            // Query products where base_product_code matches and has variant
            const snapshot = await db.collection('products')
                .where('base_product_code', '==', this.baseProductCode)
                .get();

            this.variants = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                .filter(p =>
                    p.variant &&
                    p.product_code !== this.baseProductCode
                );

            // Sort variants
            if (window.VariantUtils) {
                this.variants = window.VariantUtils.sortAttributeValues(this.variants);
            }

            this.updateDropdownContent();
        } catch (error) {
            console.error('Error loading variants:', error);
            this.variants = [];
            this.updateDropdownContent();
        }
    }

    /**
     * Create dropdown element
     */
    createDropdown() {
        // Create wrapper if input is not already wrapped
        const wrapper = document.createElement('div');
        wrapper.className = 'variant-dropdown-wrapper';

        // Insert wrapper and move input inside
        if (this.targetInput.parentNode) {
            this.targetInput.parentNode.insertBefore(wrapper, this.targetInput);
            wrapper.appendChild(this.targetInput);
        }

        // Create dropdown button
        const triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.className = 'variant-dropdown-trigger';
        triggerBtn.innerHTML = '<i data-lucide="chevron-down"></i>';
        triggerBtn.disabled = this.disabled;
        wrapper.appendChild(triggerBtn);

        // Create dropdown content
        const dropdown = document.createElement('div');
        dropdown.className = 'variant-dropdown-content';
        dropdown.style.display = 'none';
        wrapper.appendChild(dropdown);

        this.element = wrapper;
        this.triggerBtn = triggerBtn;
        this.dropdown = dropdown;

        // Initialize icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Update dropdown content
     */
    updateDropdownContent() {
        if (!this.dropdown) return;

        if (this.variants.length === 0) {
            this.dropdown.innerHTML = `
                <div class="variant-dropdown-empty">
                    <p class="text-muted">Không có biến thể</p>
                </div>
            `;
            return;
        }

        this.dropdown.innerHTML = `
            <div class="variant-dropdown-list">
                ${this.variants.map(v => `
                    <button type="button" class="variant-dropdown-item"
                            data-variant="${this.escapeHtml(v.variant || '')}"
                            data-code="${this.escapeHtml(v.product_code || '')}"
                            data-id="${v.id}">
                        <span class="variant-name">${v.variant || '-'}</span>
                        <span class="variant-code text-muted">${v.product_code || ''}</span>
                    </button>
                `).join('')}
            </div>
        `;
    }

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Toggle dropdown
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open dropdown
     */
    open() {
        if (this.disabled || !this.dropdown) return;

        this.isOpen = true;
        this.dropdown.style.display = 'block';
        this.triggerBtn?.classList.add('active');

        // Position dropdown
        this.positionDropdown();
    }

    /**
     * Close dropdown
     */
    close() {
        if (!this.dropdown) return;

        this.isOpen = false;
        this.dropdown.style.display = 'none';
        this.triggerBtn?.classList.remove('active');
    }

    /**
     * Position dropdown below input
     */
    positionDropdown() {
        if (!this.element || !this.dropdown) return;

        const rect = this.element.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // Check if there's space below
        const spaceBelow = viewportHeight - rect.bottom;
        const dropdownHeight = Math.min(this.dropdown.scrollHeight, 200);

        if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
            // Show above
            this.dropdown.style.bottom = '100%';
            this.dropdown.style.top = 'auto';
        } else {
            // Show below
            this.dropdown.style.top = '100%';
            this.dropdown.style.bottom = 'auto';
        }
    }

    /**
     * Select a variant
     * @param {Object} variant
     */
    selectVariant(variant) {
        if (this.targetInput) {
            this.targetInput.value = variant.variant || '';
            this.currentValue = variant.variant || '';

            // Trigger input event
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (this.onChange) {
            this.onChange(variant.variant || '');
        }

        if (this.onSelect) {
            this.onSelect(variant);
        }

        this.close();
    }

    /**
     * Bind events
     */
    bindEvents() {
        // Toggle on button click
        this.triggerBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });

        // Select variant on item click
        this.dropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.variant-dropdown-item');
            if (!item) return;

            const variantData = {
                variant: item.dataset.variant,
                product_code: item.dataset.code,
                id: item.dataset.id
            };

            this.selectVariant(variantData);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this.isOpen && this.element && !this.element.contains(e.target)) {
                this.close();
            }
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        if (this.element && this.targetInput) {
            // Move input back out of wrapper
            if (this.element.parentNode) {
                this.element.parentNode.insertBefore(this.targetInput, this.element);
                this.element.remove();
            }
        }

        this.element = null;
        this.dropdown = null;
        this.triggerBtn = null;
        this.targetInput = null;
    }
}

// ========================================
// EXPORT DIALOG INSTANCES
// ========================================

window.orderDetailDialog = new OrderDetailDialog();
window.variantGeneratorDialog = new VariantGeneratorDialog();
window.settingsDialog = new SettingsDialog();
window.inventoryPickerDialog = new InventoryPickerDialog();
window.shippingFeeDialog = new ShippingFeeDialog();
window.VariantDropdownSelector = VariantDropdownSelector;

console.log('[Purchase Orders] Dialogs loaded successfully');
