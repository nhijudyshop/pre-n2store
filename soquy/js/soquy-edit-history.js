// =====================================================
// SỔ QUỸ - EDIT HISTORY MODULE
// File: soquy-edit-history.js
// Ghi nhận và hiển thị lịch sử chỉnh sửa
// =====================================================

window.SoquyEditHistory = (function () {
    const config = window.SoquyConfig;

    // =====================================================
    // PRIVATE STATE
    // =====================================================

    const historyState = {
        records: [],
        filteredRecords: [],
        currentPage: 1,
        pageSize: 15,
        filters: {
            actionType: 'all',
            userName: 'all',
            timeRange: 'this_month',
            customStart: null,
            customEnd: null,
            keyword: ''
        }
    };

    // =====================================================
    // CONSTANTS
    // =====================================================

    const VALID_ACTION_TYPES = [
        'create', 'edit', 'cancel', 'delete',
        'import', 'delete_all',
        'category_add', 'category_delete',
        'source_add', 'source_delete'
    ];

    // Action types that relate to a specific voucher
    const VOUCHER_ACTION_TYPES = ['create', 'edit', 'cancel', 'delete'];

    const ACTION_BADGE_MAP = {
        create:          { label: 'Tạo phiếu',        color: '#52c41a' },
        edit:            { label: 'Sửa phiếu',        color: '#1890ff' },
        cancel:          { label: 'Hủy phiếu',        color: '#fa8c16' },
        delete:          { label: 'Xóa phiếu',        color: '#ff4d4f' },
        delete_all:      { label: 'Xóa toàn bộ',      color: '#ff4d4f' },
        import:          { label: 'Import',            color: '#722ed1' },
        category_add:    { label: 'Quản lý danh mục',  color: '#8c8c8c' },
        category_delete: { label: 'Quản lý danh mục',  color: '#8c8c8c' },
        source_add:      { label: 'Quản lý nguồn',     color: '#8c8c8c' },
        source_delete:   { label: 'Quản lý nguồn',     color: '#8c8c8c' }
    };

    // =====================================================
    // HELPER: Get current user info
    // =====================================================

    function getCurrentUserId() {
        try {
            const authStr = sessionStorage.getItem('loginindex_auth') || localStorage.getItem('loginindex_auth') || '{}';
            const authData = JSON.parse(authStr);
            return authData.username || authData.uid || '';
        } catch {
            return '';
        }
    }

    function getCurrentUserName() {
        try {
            const authStr = sessionStorage.getItem('loginindex_auth') || localStorage.getItem('loginindex_auth') || '{}';
            const authData = JSON.parse(authStr);
            return authData.displayName || authData.username || '';
        } catch {
            return '';
        }
    }

    // =====================================================
    // 1.4 - getActionBadge(actionType)
    // =====================================================

    /**
     * Returns {label, color} for a given actionType.
     * @param {string} actionType
     * @returns {{ label: string, color: string }}
     */
    function getActionBadge(actionType) {
        return ACTION_BADGE_MAP[actionType] || { label: actionType || 'Không xác định', color: '#8c8c8c' };
    }

    // =====================================================
    // 1.3 - computeChanges(oldData, newData)
    // =====================================================

    /**
     * Compare two objects field-by-field and return changed fields.
     * @param {Object} oldData
     * @param {Object} newData
     * @returns {Object} { fieldName: { old: value, new: value } }
     */
    function computeChanges(oldData, newData) {
        const changes = {};
        if (!oldData || !newData) return changes;

        // Collect all keys from both objects
        const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

        for (const key of allKeys) {
            const oldVal = oldData[key];
            const newVal = newData[key];

            // Skip if both are strictly equal
            if (oldVal === newVal) continue;

            // Handle both undefined/null as equivalent to no change
            if ((oldVal === undefined || oldVal === null) && (newVal === undefined || newVal === null)) continue;

            // Values differ
            changes[key] = {
                old: oldVal !== undefined ? oldVal : null,
                new: newVal !== undefined ? newVal : null
            };
        }

        return changes;
    }

    // =====================================================
    // 1.5 - buildHistoryRecord(actionType, details)
    // =====================================================

    /**
     * Build a standardized history record object.
     * @param {string} actionType - One of VALID_ACTION_TYPES
     * @param {Object} details - Action-specific details
     * @returns {Object} Normalized record ready for Firestore
     */
    function buildHistoryRecord(actionType, details) {
        if (!VALID_ACTION_TYPES.includes(actionType)) {
            console.error('[EditHistory] Invalid actionType:', actionType);
            return null;
        }

        const record = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            actionType: actionType,
            userId: getCurrentUserId(),
            userName: getCurrentUserName(),
            voucherCode: details.voucherCode || null,
            voucherType: details.voucherType || null,
            description: details.description || '',
            details: details.changes || details.extra || {}
        };

        // Ensure voucherCode/voucherType have values for voucher-related actions
        if (VOUCHER_ACTION_TYPES.includes(actionType)) {
            if (!record.voucherCode) {
                record.voucherCode = details.voucherCode || '';
            }
            if (!record.voucherType) {
                record.voucherType = details.voucherType || '';
            }
        }

        return record;
    }

    // =====================================================
    // 1.2 - logEditHistory(actionType, details)
    // =====================================================

    /**
     * Log an edit history record to Firestore.
     * Wrapped in try/catch — errors are logged but never thrown.
     *
     * @param {string} actionType
     * @param {Object} details
     */
    async function logEditHistory(actionType, details) {
        try {
            const record = buildHistoryRecord(actionType, details || {});
            if (!record) return;

            await config.db.collection('soquy_edit_history').add(record);
        } catch (error) {
            console.error('[EditHistory] Error logging:', error);
            // Do NOT throw — main operation must continue
        }
    }

    // =====================================================
    // 2.1 - applyHistoryFilters(records, filters)
    // =====================================================

    /**
     * Filter history records by all criteria simultaneously (AND logic).
     * @param {Array} records - Array of history record objects
     * @param {Object} filters - Filter criteria
     * @param {string} filters.actionType - 'all' or specific type or group ('category', 'source')
     * @param {string} filters.userName - 'all' or specific userName
     * @param {string} filters.timeRange - 'today'|'last_7_days'|'this_month'|'last_month'|'custom'
     * @param {Date|null} filters.customStart - Start date for custom range
     * @param {Date|null} filters.customEnd - End date for custom range
     * @param {string} filters.keyword - Search keyword (case-insensitive)
     * @returns {Array} Filtered records
     */
    function applyHistoryFilters(records, filters) {
        if (!records || !Array.isArray(records)) return [];
        if (!filters) return records.slice();

        return records.filter(function (record) {
            // --- Filter by actionType ---
            if (filters.actionType && filters.actionType !== 'all') {
                if (filters.actionType === 'category') {
                    if (record.actionType !== 'category_add' && record.actionType !== 'category_delete') {
                        return false;
                    }
                } else if (filters.actionType === 'source') {
                    if (record.actionType !== 'source_add' && record.actionType !== 'source_delete') {
                        return false;
                    }
                } else {
                    if (record.actionType !== filters.actionType) {
                        return false;
                    }
                }
            }

            // --- Filter by userName ---
            if (filters.userName && filters.userName !== 'all') {
                if (record.userName !== filters.userName) {
                    return false;
                }
            }

            // --- Filter by timeRange ---
            if (filters.timeRange && filters.timeRange !== 'all') {
                var recordDate = getRecordDate(record);
                if (!recordDate) return false;

                var now = new Date();
                var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                if (filters.timeRange === 'today') {
                    if (recordDate < startOfDay) return false;
                } else if (filters.timeRange === 'last_7_days') {
                    var sevenDaysAgo = new Date(startOfDay);
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
                    if (recordDate < sevenDaysAgo) return false;
                } else if (filters.timeRange === 'this_month') {
                    var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    if (recordDate < startOfMonth) return false;
                } else if (filters.timeRange === 'last_month') {
                    var startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    var endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                    if (recordDate < startOfLastMonth || recordDate > endOfLastMonth) return false;
                } else if (filters.timeRange === 'custom') {
                    if (filters.customStart) {
                        var customStartDate = new Date(filters.customStart);
                        customStartDate.setHours(0, 0, 0, 0);
                        if (recordDate < customStartDate) return false;
                    }
                    if (filters.customEnd) {
                        var customEndDate = new Date(filters.customEnd);
                        customEndDate.setHours(23, 59, 59, 999);
                        if (recordDate > customEndDate) return false;
                    }
                }
            }

            // --- Filter by keyword ---
            if (filters.keyword && filters.keyword.trim() !== '') {
                var kw = filters.keyword.trim().toLowerCase();
                var voucherCode = (record.voucherCode || '').toLowerCase();
                var description = (record.description || '').toLowerCase();
                if (voucherCode.indexOf(kw) === -1 && description.indexOf(kw) === -1) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Extract a JavaScript Date from a record's timestamp.
     * Handles Firestore Timestamp objects (.toDate()), Date objects, and numeric timestamps.
     * @param {Object} record
     * @returns {Date|null}
     */
    function getRecordDate(record) {
        if (!record || !record.timestamp) return null;
        var ts = record.timestamp;
        if (typeof ts.toDate === 'function') return ts.toDate();
        if (ts instanceof Date) return ts;
        if (typeof ts === 'number') return new Date(ts);
        return null;
    }

    // =====================================================
    // 2.2 - paginateRecords(records, page, pageSize)
    // =====================================================

    /**
     * Paginate an array of records.
     * @param {Array} records - Array of records to paginate
     * @param {number} page - Current page number (1-based)
     * @param {number} pageSize - Number of records per page (15, 30, 50, or 100)
     * @returns {{ items: Array, totalPages: number, currentPage: number, pageSize: number, totalRecords: number }}
     */
    function paginateRecords(records, page, pageSize) {
        var safeRecords = Array.isArray(records) ? records : [];
        var safePage = (typeof page === 'number' && page >= 1) ? Math.floor(page) : 1;
        var safePageSize = [15, 30, 50, 100].indexOf(pageSize) !== -1 ? pageSize : 15;

        var totalRecords = safeRecords.length;
        var totalPages = totalRecords > 0 ? Math.ceil(totalRecords / safePageSize) : 1;

        // Clamp page to valid range
        if (safePage > totalPages) safePage = totalPages;

        var startIndex = (safePage - 1) * safePageSize;
        var items = safeRecords.slice(startIndex, startIndex + safePageSize);

        return {
            items: items,
            totalPages: totalPages,
            currentPage: safePage,
            pageSize: safePageSize,
            totalRecords: totalRecords
        };
    }

    // =====================================================
    // 2.3 - loadHistory()
    // =====================================================

    /**
     * Load history records from Firestore, apply filters, and render.
     * On error: displays error message and allows retry.
     */
    async function loadHistory() {
        try {
            var snapshot = await config.db.collection('soquy_edit_history')
                .orderBy('timestamp', 'desc')
                .get();

            historyState.records = [];
            snapshot.forEach(function (doc) {
                var data = doc.data();
                data.id = doc.id;
                historyState.records.push(data);
            });

            applyFilters();
            renderHistoryTab();
            populateUserNameDropdown();
        } catch (error) {
            console.error('[EditHistory] Error loading history:', error);
            historyState.records = [];
            historyState.filteredRecords = [];
            // Render error state with retry option
            renderHistoryError(error.message || 'Không thể tải lịch sử chỉnh sửa');
        }
    }

    /**
     * Render an error message with retry button in the history tab.
     * @param {string} message
     */
    function renderHistoryError(message) {
        var container = document.getElementById('editHistoryTabContent');
        if (!container) return;
        container.innerHTML =
            '<div class="edit-history-error" style="text-align:center;padding:40px;">' +
            '<p style="color:#ff4d4f;margin-bottom:16px;">' + (message || 'Đã xảy ra lỗi') + '</p>' +
            '<button onclick="SoquyEditHistory.loadHistory()" class="btn btn-primary">Thử lại</button>' +
            '</div>';
    }

    // =====================================================
    // applyFilters — orchestrator that uses applyHistoryFilters
    // =====================================================

    /**
     * Apply current filters from historyState and update filteredRecords.
     */
    function applyFilters() {
        historyState.filteredRecords = applyHistoryFilters(historyState.records, historyState.filters);
        historyState.currentPage = 1;
    }

    // =====================================================
    // HELPER: Format timestamp for display
    // =====================================================

    /**
     * Format a record's timestamp as dd/MM/yyyy HH:mm
     * @param {Object} record
     * @returns {string}
     */
    function formatTimestamp(record) {
        var date = getRecordDate(record);
        if (!date) return 'Đang xử lý...';
        var dd = String(date.getDate()).padStart(2, '0');
        var mm = String(date.getMonth() + 1).padStart(2, '0');
        var yyyy = date.getFullYear();
        var hh = String(date.getHours()).padStart(2, '0');
        var min = String(date.getMinutes()).padStart(2, '0');
        return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + min;
    }

    /**
     * Escape HTML special characters to prevent XSS.
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =====================================================
    // 4.3 - renderHistoryTab() — render desktop table, mobile cards, pagination
    // =====================================================

    function renderHistoryTab() {
        var paginated = paginateRecords(historyState.filteredRecords, historyState.currentPage, historyState.pageSize);
        renderHistoryTable(paginated.items);
        renderMobileCards(paginated.items);
        renderPagination(paginated);
    }

    /**
     * Render the desktop history table.
     * @param {Array} records - Paginated records to display
     */
    function renderHistoryTable(records) {
        var tbody = document.getElementById('editHistoryTableBody');
        if (!tbody) return;

        if (!records || records.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="6" style="text-align:center;padding:40px;color:#999;">' +
                'Không có dữ liệu lịch sử chỉnh sửa</td></tr>';
            return;
        }

        tbody.innerHTML = records.map(function (record) {
            var badge = getActionBadge(record.actionType);
            var timeStr = formatTimestamp(record);
            var userName = escapeHtml(record.userName || '-');
            var voucherCode = record.voucherCode
                ? '<a href="#" class="eh-voucher-link" data-code="' + escapeHtml(record.voucherCode) + '">' + escapeHtml(record.voucherCode) + '</a>'
                : '-';
            var description = escapeHtml(record.description || '-');
            var detailBtn = record.actionType === 'edit'
                ? '<button class="eh-detail-btn" data-id="' + escapeHtml(record.id) + '">Xem chi tiết</button>'
                : '-';

            return '<tr>' +
                '<td>' + timeStr + '</td>' +
                '<td>' + userName + '</td>' +
                '<td><span class="action-badge" style="background:' + badge.color + '1a;color:' + badge.color + ';border:1px solid ' + badge.color + '33;">' + escapeHtml(badge.label) + '</span></td>' +
                '<td>' + voucherCode + '</td>' +
                '<td>' + description + '</td>' +
                '<td>' + detailBtn + '</td>' +
                '</tr>';
        }).join('');
    }

    // =====================================================
    // 4.4 - renderMobileCards(records)
    // =====================================================

    /**
     * Render mobile card view for history records.
     * @param {Array} records - Paginated records to display
     */
    function renderMobileCards(records) {
        var container = document.getElementById('editHistoryMobileCards');
        if (!container) return;

        if (!records || records.length === 0) {
            container.innerHTML =
                '<div style="text-align:center;padding:40px;color:#999;">Không có dữ liệu lịch sử chỉnh sửa</div>';
            return;
        }

        container.innerHTML = records.map(function (record) {
            var badge = getActionBadge(record.actionType);
            var timeStr = formatTimestamp(record);
            var userName = escapeHtml(record.userName || '-');
            var voucherCode = record.voucherCode ? escapeHtml(record.voucherCode) : '';
            var description = escapeHtml(record.description || '-');

            return '<div class="m-voucher-card eh-mobile-card">' +
                '<div class="m-voucher-header">' +
                    '<div class="m-voucher-header-left">' +
                        (voucherCode ? '<span class="m-voucher-code">#' + voucherCode + '</span>' : '') +
                        '<span class="action-badge" style="background:' + badge.color + '1a;color:' + badge.color + ';border:1px solid ' + badge.color + '33;font-size:11px;padding:2px 8px;border-radius:4px;">' + escapeHtml(badge.label) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="m-voucher-details">' +
                    '<div class="m-voucher-row">' +
                        '<span class="m-voucher-label">Thời gian:</span>' +
                        '<span class="m-voucher-value">' + timeStr + '</span>' +
                    '</div>' +
                    '<div class="m-voucher-row">' +
                        '<span class="m-voucher-label">Người thực hiện:</span>' +
                        '<span class="m-voucher-value">' + userName + '</span>' +
                    '</div>' +
                    '<div class="m-voucher-row">' +
                        '<span class="m-voucher-label">Mô tả:</span>' +
                        '<span class="m-voucher-value">' + description + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    // =====================================================
    // 4.5 - renderPagination(paginatedResult)
    // =====================================================

    /**
     * Render pagination controls and bind events.
     * @param {{ totalPages: number, currentPage: number, totalRecords: number }} paginated
     */
    function renderPagination(paginated) {
        var pageInfo = document.getElementById('ehPageInfo');
        var btnPrev = document.getElementById('ehBtnPrevPage');
        var btnNext = document.getElementById('ehBtnNextPage');

        if (pageInfo) {
            pageInfo.textContent = 'Trang ' + paginated.currentPage + ' / ' + paginated.totalPages;
        }
        if (btnPrev) {
            btnPrev.disabled = paginated.currentPage <= 1;
        }
        if (btnNext) {
            btnNext.disabled = paginated.currentPage >= paginated.totalPages;
        }
    }

    // =====================================================
    // 5.1 - renderChangesDetail(changes)
    // =====================================================

    /**
     * Field name mapping for display (Vietnamese labels).
     */
    var FIELD_LABELS = {
        amount: 'Số tiền',
        category: 'Danh mục',
        note: 'Ghi chú',
        description: 'Mô tả',
        date: 'Ngày',
        voucherType: 'Loại phiếu',
        source: 'Nguồn',
        sourceName: 'Tên nguồn',
        sourceCode: 'Mã nguồn',
        status: 'Trạng thái',
        cancelReason: 'Lý do hủy',
        paymentMethod: 'Phương thức thanh toán',
        recipient: 'Người nhận',
        payer: 'Người nộp'
    };

    /**
     * Fields that should be formatted as currency amounts.
     */
    var AMOUNT_FIELDS = ['amount', 'totalAmount', 'total', 'price', 'cost', 'fee', 'balance'];

    /**
     * Format a number with Vietnamese thousand separators (dots).
     * @param {*} value
     * @returns {string}
     */
    function formatAmount(value) {
        var num = Number(value);
        if (isNaN(num)) return String(value || '');
        return num.toLocaleString('vi-VN');
    }

    /**
     * Check if a field name is an amount/money field.
     * @param {string} fieldName
     * @returns {boolean}
     */
    function isAmountField(fieldName) {
        if (!fieldName) return false;
        var lower = fieldName.toLowerCase();
        return AMOUNT_FIELDS.some(function (f) { return lower.indexOf(f.toLowerCase()) !== -1; });
    }

    /**
     * Render a detail view of changes for an edit action.
     * Shows field name, old value (red strikethrough), new value (green highlight).
     *
     * @param {Object} changes - { fieldName: { old: value, new: value } }
     * @returns {string} HTML string
     */
    function renderChangesDetail(changes) {
        if (!changes || typeof changes !== 'object') {
            return '<div class="changes-detail-empty">Không có thông tin thay đổi</div>';
        }

        var keys = Object.keys(changes);
        if (keys.length === 0) {
            return '<div class="changes-detail-empty">Không có thông tin thay đổi</div>';
        }

        var rows = keys.map(function (field) {
            var change = changes[field];
            if (!change || typeof change !== 'object') return '';

            var label = FIELD_LABELS[field] || field;
            var isAmount = isAmountField(field);

            var oldVal = change.old;
            var newVal = change['new'];

            var oldDisplay = (oldVal === null || oldVal === undefined || oldVal === '')
                ? '<em>trống</em>'
                : escapeHtml(isAmount ? formatAmount(oldVal) : String(oldVal));
            var newDisplay = (newVal === null || newVal === undefined || newVal === '')
                ? '<em>trống</em>'
                : escapeHtml(isAmount ? formatAmount(newVal) : String(newVal));

            return '<div class="changes-detail-row">' +
                '<span class="changes-detail-field">' + escapeHtml(label) + ':</span>' +
                '<span class="change-old">' + oldDisplay + '</span>' +
                '<span class="changes-detail-arrow">→</span>' +
                '<span class="change-new">' + newDisplay + '</span>' +
            '</div>';
        }).filter(Boolean);

        return '<div class="changes-detail">' + rows.join('') + '</div>';
    }

    // =====================================================
    // 5.2 - showChangesDetail / closeChangesDetail
    // =====================================================

    /**
     * Show a modal overlay with the changes detail for a record.
     * @param {string} recordId - The record ID to show details for
     */
    function showChangesDetail(recordId) {
        // Find the record in historyState
        var record = null;
        for (var i = 0; i < historyState.records.length; i++) {
            if (historyState.records[i].id === recordId) {
                record = historyState.records[i];
                break;
            }
        }

        if (!record) return;

        var changes = record.details && record.details.changes
            ? record.details.changes
            : record.details || {};

        var html = renderChangesDetail(changes);

        // Create modal overlay
        var overlay = document.createElement('div');
        overlay.className = 'eh-modal-overlay';
        overlay.id = 'ehChangesModal';
        overlay.innerHTML =
            '<div class="eh-modal-content">' +
                '<div class="eh-modal-header">' +
                    '<h3>Chi tiết thay đổi' +
                        (record.voucherCode ? ' - ' + escapeHtml(record.voucherCode) : '') +
                    '</h3>' +
                    '<button class="eh-modal-close" id="ehModalCloseBtn">&times;</button>' +
                '</div>' +
                '<div class="eh-modal-body">' + html + '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        // Close on overlay click or close button
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay || e.target.id === 'ehModalCloseBtn' || e.target.closest('.eh-modal-close')) {
                closeChangesDetail();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', handleModalEscape);
    }

    /**
     * Close the changes detail modal.
     */
    function closeChangesDetail() {
        var overlay = document.getElementById('ehChangesModal');
        if (overlay) {
            overlay.remove();
        }
        document.removeEventListener('keydown', handleModalEscape);
    }

    /**
     * Handle Escape key to close modal.
     * @param {KeyboardEvent} e
     */
    function handleModalEscape(e) {
        if (e.key === 'Escape') {
            closeChangesDetail();
        }
    }

    // =====================================================
    // 4.6 - initTab() — bind filter events and populate dropdowns
    // =====================================================

    function initTab() {
        // --- Bind filter events ---
        var filterActionType = document.getElementById('ehFilterActionType');
        var filterUserName = document.getElementById('ehFilterUserName');
        var filterTimeRange = document.getElementById('ehFilterTimeRange');
        var filterCustomStart = document.getElementById('ehFilterCustomStart');
        var filterCustomEnd = document.getElementById('ehFilterCustomEnd');
        var filterKeyword = document.getElementById('ehFilterKeyword');
        var pageSizeSelect = document.getElementById('ehPageSizeSelect');
        var btnPrev = document.getElementById('ehBtnPrevPage');
        var btnNext = document.getElementById('ehBtnNextPage');

        if (filterActionType) {
            filterActionType.addEventListener('change', function () {
                historyState.filters.actionType = filterActionType.value;
                applyFilters();
                renderHistoryTab();
            });
        }

        if (filterUserName) {
            filterUserName.addEventListener('change', function () {
                historyState.filters.userName = filterUserName.value;
                applyFilters();
                renderHistoryTab();
            });
        }

        if (filterTimeRange) {
            filterTimeRange.addEventListener('change', function () {
                historyState.filters.timeRange = filterTimeRange.value;
                // Toggle custom date inputs
                var showCustom = filterTimeRange.value === 'custom';
                if (filterCustomStart) filterCustomStart.style.display = showCustom ? '' : 'none';
                if (filterCustomEnd) filterCustomEnd.style.display = showCustom ? '' : 'none';
                applyFilters();
                renderHistoryTab();
            });
        }

        if (filterCustomStart) {
            filterCustomStart.addEventListener('change', function () {
                historyState.filters.customStart = filterCustomStart.value || null;
                if (historyState.filters.timeRange === 'custom') {
                    applyFilters();
                    renderHistoryTab();
                }
            });
        }

        if (filterCustomEnd) {
            filterCustomEnd.addEventListener('change', function () {
                historyState.filters.customEnd = filterCustomEnd.value || null;
                if (historyState.filters.timeRange === 'custom') {
                    applyFilters();
                    renderHistoryTab();
                }
            });
        }

        if (filterKeyword) {
            var keywordDebounce;
            filterKeyword.addEventListener('input', function () {
                clearTimeout(keywordDebounce);
                keywordDebounce = setTimeout(function () {
                    historyState.filters.keyword = filterKeyword.value;
                    applyFilters();
                    renderHistoryTab();
                }, 300);
            });
        }

        // --- Pagination events ---
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', function () {
                historyState.pageSize = parseInt(pageSizeSelect.value, 10) || 15;
                historyState.currentPage = 1;
                renderHistoryTab();
            });
        }

        if (btnPrev) {
            btnPrev.addEventListener('click', function () {
                if (historyState.currentPage > 1) {
                    historyState.currentPage--;
                    renderHistoryTab();
                }
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', function () {
                var totalPages = Math.ceil(historyState.filteredRecords.length / historyState.pageSize) || 1;
                if (historyState.currentPage < totalPages) {
                    historyState.currentPage++;
                    renderHistoryTab();
                }
            });
        }

        // --- Event delegation for "Xem chi tiết" button (Task 5.2) ---
        var tableBody = document.getElementById('editHistoryTableBody');
        if (tableBody) {
            tableBody.addEventListener('click', function (e) {
                var btn = e.target.closest('.eh-detail-btn');
                if (btn) {
                    var recordId = btn.getAttribute('data-id');
                    if (recordId) {
                        showChangesDetail(recordId);
                    }
                }
            });
        }

        // --- Populate userName dropdown from actual data ---
        populateUserNameDropdown();
    }

    /**
     * Populate the userName filter dropdown with distinct userNames from records.
     */
    function populateUserNameDropdown() {
        var select = document.getElementById('ehFilterUserName');
        if (!select) return;

        var userNames = [];
        var seen = {};
        historyState.records.forEach(function (record) {
            if (record.userName && !seen[record.userName]) {
                seen[record.userName] = true;
                userNames.push(record.userName);
            }
        });
        userNames.sort();

        // Preserve current selection
        var currentVal = select.value;
        select.innerHTML = '<option value="all">Tất cả người thực hiện</option>';
        userNames.forEach(function (name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
        select.value = currentVal || 'all';
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        logEditHistory,
        loadHistory,
        renderHistoryTab,
        applyFilters,
        initTab,
        // Exposed for testing and internal use
        computeChanges,
        getActionBadge,
        buildHistoryRecord,
        applyHistoryFilters,
        paginateRecords,
        getRecordDate,
        formatTimestamp,
        renderHistoryTable,
        renderMobileCards,
        renderPagination,
        populateUserNameDropdown,
        // Task 5: Changes detail
        renderChangesDetail,
        showChangesDetail,
        closeChangesDetail,
        formatAmount,
        isAmountField,
        // Expose constants for testing
        VALID_ACTION_TYPES,
        VOUCHER_ACTION_TYPES,
        ACTION_BADGE_MAP,
        FIELD_LABELS,
        AMOUNT_FIELDS,
        // Expose state for testing
        _historyState: historyState
    };
})();
