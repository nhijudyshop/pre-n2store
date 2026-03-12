// =====================================================
// AUDIT LOG PAGE - Trang Lịch Sử Chỉnh Sửa
// File: lichsuchinhsua/js/app.js
// Tạo mới hoàn toàn - Nhật ký kiểm toán tập trung
// =====================================================

window.AuditLogApp = (function () {
    'use strict';

    // =====================================================
    // CONSTANTS
    // =====================================================

    var ALL_MODULES = [
        { id: 'bangkiemhang', name: 'Cân Nặng Hàng', implemented: false },
        { id: 'inventory-tracking', name: 'Theo Dõi Nhập Hàng SL', implemented: false },
        { id: 'purchase-orders', name: 'Quản Lý Đặt Hàng NCC', implemented: false },
        { id: 'hangrotxa', name: 'Hàng Rớt - Xả', implemented: false },
        { id: 'inbox', name: 'Check Inbox Khách', implemented: false },
        { id: 'ck', name: 'Thông Tin Chuyển Khoản', implemented: false },
        { id: 'hanghoan', name: 'Hàng Hoàn', implemented: false },
        { id: 'nhanhang', name: 'Nhận Hàng', implemented: false },
        { id: 'issue-tracking', name: 'CSKH + Hàng Hoàn Bưu Cục', implemented: true },
        { id: 'customer-hub', name: 'Customer 360°', implemented: true },
        { id: 'orders-report', name: 'Báo Cáo Sale-Online', implemented: false },
        { id: 'tpos-pancake', name: 'Tpos - Pancake', implemented: false },
        { id: 'order-management', name: 'Quản Lý Order', implemented: false },
        { id: 'soorder', name: 'Sổ Order', implemented: false },
        { id: 'soluong-live', name: 'Quản Lý Số Lượng', implemented: false },
        { id: 'user-management', name: 'Quản Lý Tài Khoản', implemented: false },
        { id: 'balance-history', name: 'Lịch Sử Biến Động Số Dư', implemented: true },
        { id: 'supplier-debt', name: 'NCC', implemented: false },
        { id: 'invoice-compare', name: 'So Sánh Đơn Hàng', implemented: false },
        { id: 'soquy', name: 'Sổ Quỹ', implemented: false },
        { id: 'quy-trinh', name: 'Quy Trình Nghiệp Vụ', implemented: false },
        { id: 'lichsuchinhsua', name: 'Lịch Sử Chỉnh Sửa', implemented: false }
    ];

    // Map legacy Vietnamese page names → module IDs
    // Dữ liệu cũ dùng tên tiếng Việt, dữ liệu mới dùng kebab-case ID
    var PAGE_ALIAS_MAP = {
        'Hàng rớt - xả':           'hangrotxa',
        'Hàng hoàn':               'hanghoan',
        'Nhận Hàng':               'nhanhang',
        'Kiểm Hàng':               'bangkiemhang',
        'Chuyển khoản':            'ck',
        'Check Inbox Khách Hàng':  'inbox',
        'inventory-tracking':      'inventory-tracking',
        'Lịch sử chỉnh sửa':      'lichsuchinhsua',
        'Customer 360°':           'customer-hub',
        'Báo cáo livestream':      'tpos-pancake',
        'Báo Cáo Sale-Online':     'orders-report'
    };

    var MODULE_ACTION_MAP = {
        'customer-hub': ['wallet_add_debt', 'wallet_subtract_debt', 'wallet_adjust_debt', 'customer_info_update', 'wallet_transaction'],
        'issue-tracking': ['ticket_create', 'ticket_add_debt', 'ticket_receive_goods', 'ticket_payment', 'ticket_update'],
        'balance-history': ['transaction_assign', 'livemode_confirm_customer', 'transaction_approve', 'transaction_adjust', 'customer_info_update_bh', 'transaction_verify', 'accountant_entry_create'],
        // Legacy modules dùng action cũ: add, edit, delete, update, mark
        'hangrotxa': ['add', 'edit', 'delete', 'update', 'mark'],
        'hanghoan': ['add', 'edit', 'delete', 'update', 'mark'],
        'nhanhang': ['add', 'edit', 'delete', 'update', 'mark'],
        'bangkiemhang': ['add', 'edit', 'delete', 'update', 'mark'],
        'ck': ['add', 'edit', 'delete', 'update', 'mark'],
        'inbox': ['add', 'edit', 'delete', 'update', 'mark'],
        'inventory-tracking': ['add', 'edit', 'delete', 'update', 'mark'],
        'lichsuchinhsua': ['delete']
    };

    var ACTION_BADGE_MAP = {
        'wallet_add_debt':          { text: 'Cộng công nợ',       color: '#52c41a' },
        'wallet_subtract_debt':     { text: 'Trừ công nợ',        color: '#ff4d4f' },
        'wallet_adjust_debt':       { text: 'Điều chỉnh công nợ', color: '#fa8c16' },
        'customer_info_update':     { text: 'Cập nhật KH',        color: '#1890ff' },
        'wallet_transaction':       { text: 'Giao dịch ví',       color: '#722ed1' },
        'ticket_create':            { text: 'Tạo phiếu',          color: '#52c41a' },
        'ticket_add_debt':          { text: 'Cộng nợ ticket',     color: '#13c2c2' },
        'ticket_receive_goods':     { text: 'Nhận hàng',          color: '#2f54eb' },
        'ticket_payment':           { text: 'Thanh toán',         color: '#eb2f96' },
        'ticket_update':            { text: 'Cập nhật ticket',    color: '#1890ff' },
        'transaction_assign':       { text: 'Gán giao dịch',      color: '#52c41a' },
        'livemode_confirm_customer':{ text: 'Xác nhận KH',        color: '#13c2c2' },
        'transaction_approve':      { text: 'Duyệt GD',           color: '#2f54eb' },
        'transaction_adjust':       { text: 'Điều chỉnh GD',      color: '#fa8c16' },
        'customer_info_update_bh':  { text: 'Cập nhật KH (BH)',   color: '#1890ff' },
        'transaction_verify':       { text: 'Kiểm tra GD',        color: '#722ed1' },
        'accountant_entry_create':  { text: 'Kế toán duyệt',      color: '#eb2f96' },
        'add':    { text: 'Thêm',    color: '#52c41a' },
        'edit':   { text: 'Sửa',     color: '#1890ff' },
        'delete': { text: 'Xóa',     color: '#ff4d4f' },
        'update': { text: 'Cập nhật', color: '#fa8c16' },
        'mark':   { text: 'Đánh dấu', color: '#8c8c8c' }
    };

    // =====================================================
    // STATE
    // =====================================================

    var state = {
        allRecords: [],
        filteredRecords: [],
        currentUserId: ''
    };

    // =====================================================
    // NORMALIZE RECORD (tương thích ngược)
    // =====================================================

    function resolveModule(rawPage) {
        if (!rawPage) return '';
        // Nếu đã là module ID hợp lệ → giữ nguyên
        if (ALL_MODULES.some(function(m) { return m.id === rawPage; })) return rawPage;
        // Tra cứu alias (tên tiếng Việt cũ → module ID)
        return PAGE_ALIAS_MAP[rawPage] || rawPage;
    }

    function normalizeRecord(record) {
        if (record.performerUserId) {
            // Format mới - vẫn cần resolve module phòng trường hợp
            record.module = resolveModule(record.module);
            return record;
        }
        return {
            timestamp: record.timestamp || null,
            performerUserId: record.user || '',
            performerUserName: record.user || '',
            module: resolveModule(record.page || ''),
            actionType: record.action || '',
            description: record.description || '',
            oldData: record.oldData || null,
            newData: record.newData || null,
            approverUserId: record.approverUserId || null,
            approverUserName: record.approverUserName || null,
            id: record.id || null
        };
    }

    // =====================================================
    // HELPERS
    // =====================================================

    function getActionBadge(actionType) {
        return ACTION_BADGE_MAP[actionType] || { text: actionType || 'Không xác định', color: '#8c8c8c' };
    }

    function formatTimestamp(record) {
        var ts = record.timestamp;
        if (!ts) return 'N/A';
        var date;
        if (ts.toDate && typeof ts.toDate === 'function') {
            date = ts.toDate();
        } else if (ts.seconds) {
            date = new Date(ts.seconds * 1000);
        } else if (ts instanceof Date) {
            date = ts;
        } else {
            date = new Date(ts);
        }
        if (isNaN(date.getTime())) return 'N/A';
        var d = String(date.getDate()).padStart(2, '0');
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var y = date.getFullYear();
        var h = String(date.getHours()).padStart(2, '0');
        var mi = String(date.getMinutes()).padStart(2, '0');
        var s = String(date.getSeconds()).padStart(2, '0');
        return d + '/' + m + '/' + y + ' ' + h + ':' + mi + ':' + s;
    }

    function getTimestampDate(record) {
        var ts = record.timestamp;
        if (!ts) return null;
        if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate();
        if (ts.seconds) return new Date(ts.seconds * 1000);
        if (ts instanceof Date) return ts;
        var d = new Date(ts);
        return isNaN(d.getTime()) ? null : d;
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getModuleName(moduleId) {
        var mod = ALL_MODULES.find(function(m) { return m.id === moduleId; });
        return mod ? mod.name : moduleId;
    }

    // =====================================================
    // COMPUTE DIFF
    // =====================================================

    function computeDiff(oldData, newData) {
        var changes = [];
        if (!oldData && !newData) return changes;
        var old = oldData || {};
        var nw = newData || {};
        var allKeys = {};
        Object.keys(old).forEach(function(k) { allKeys[k] = true; });
        Object.keys(nw).forEach(function(k) { allKeys[k] = true; });

        Object.keys(allKeys).forEach(function(key) {
            var oldVal = old[key];
            var newVal = nw[key];
            var hasOld = oldData && key in old;
            var hasNew = newData && key in nw;

            if (hasNew && !hasOld) {
                changes.push({ field: key, type: 'added', oldVal: null, newVal: newVal });
            } else if (hasOld && !hasNew) {
                changes.push({ field: key, type: 'removed', oldVal: oldVal, newVal: null });
            } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                changes.push({ field: key, type: 'changed', oldVal: oldVal, newVal: newVal });
            }
        });
        return changes;
    }

    // =====================================================
    // COMPUTE STATS
    // =====================================================

    function computeStats(records, currentUserId) {
        var now = new Date();
        var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var total = records.length;
        var today = 0;
        var uniqueUsers = {};
        var mine = 0;

        records.forEach(function(r) {
            var d = getTimestampDate(r);
            if (d && d >= todayStart) today++;
            if (r.performerUserId) uniqueUsers[r.performerUserId] = true;
            if (r.performerUserId === currentUserId) mine++;
        });

        return {
            total: total,
            today: today,
            activeUsers: Object.keys(uniqueUsers).length,
            mine: mine
        };
    }

    // =====================================================
    // FILTER LOGIC
    // =====================================================

    function applyFilters(records, filters) {
        return records.filter(function(r) {
            if (filters.module && filters.module !== 'all' && r.module !== filters.module) return false;
            if (filters.actionType && filters.actionType !== 'all' && r.actionType !== filters.actionType) return false;
            if (filters.performer && filters.performer !== 'all' && r.performerUserId !== filters.performer) return false;
            if (filters.approver && filters.approver !== 'all' && r.approverUserId !== filters.approver) return false;

            if (filters.startDate) {
                var d = getTimestampDate(r);
                if (!d || d < new Date(filters.startDate)) return false;
            }
            if (filters.endDate) {
                var d2 = getTimestampDate(r);
                var end = new Date(filters.endDate);
                end.setHours(23, 59, 59, 999);
                if (!d2 || d2 > end) return false;
            }

            if (filters.keyword && filters.keyword.trim()) {
                var kw = filters.keyword.toLowerCase();
                var searchable = [
                    r.description || '',
                    r.entityId || '',
                    r.performerUserName || '',
                    r.actionType || '',
                    r.module || ''
                ].join(' ').toLowerCase();
                if (searchable.indexOf(kw) === -1) return false;
            }

            return true;
        });
    }

    function getFilters() {
        return {
            module: document.getElementById('filterModule').value,
            actionType: document.getElementById('filterActionType').value,
            performer: document.getElementById('filterPerformer').value,
            approver: document.getElementById('filterApprover').value,
            startDate: document.getElementById('filterStartDate').value,
            endDate: document.getElementById('filterEndDate').value,
            keyword: document.getElementById('filterKeyword').value
        };
    }

    function updateActionTypeOptions(selectedModule) {
        var select = document.getElementById('filterActionType');
        var currentVal = select.value;
        select.innerHTML = '<option value="all">Tất cả</option>';

        var types = [];
        if (selectedModule === 'all') {
            Object.keys(MODULE_ACTION_MAP).forEach(function(mod) {
                MODULE_ACTION_MAP[mod].forEach(function(t) {
                    if (types.indexOf(t) === -1) types.push(t);
                });
            });
        } else if (MODULE_ACTION_MAP[selectedModule]) {
            types = MODULE_ACTION_MAP[selectedModule];
        }

        types.forEach(function(t) {
            var badge = getActionBadge(t);
            var opt = document.createElement('option');
            opt.value = t;
            opt.textContent = badge.text;
            select.appendChild(opt);
        });

        // Restore selection if still valid
        if (currentVal && types.indexOf(currentVal) !== -1) {
            select.value = currentVal;
        }
    }

    // =====================================================
    // RENDER FUNCTIONS
    // =====================================================

    function renderStatsCards(stats) {
        document.getElementById('statTotal').textContent = stats.total;
        document.getElementById('statToday').textContent = stats.today;
        document.getElementById('statUsers').textContent = stats.activeUsers;
        document.getElementById('statMine').textContent = stats.mine;
    }

    function renderHistoryTable(records) {
        var tbody = document.getElementById('historyTableBody');
        var emptyState = document.getElementById('emptyState');
        var tableContainer = document.getElementById('historyTableContainer');

        if (records.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'flex';
            tableContainer.querySelector('table').style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        tableContainer.querySelector('table').style.display = '';

        var html = '';
        records.forEach(function(r, i) {
            var badge = getActionBadge(r.actionType);
            html += '<tr class="history-row" data-index="' + i + '">';
            html += '<td>' + (i + 1) + '</td>';
            html += '<td>' + formatTimestamp(r) + '</td>';
            html += '<td>' + escapeHtml(r.performerUserName || r.performerUserId || 'N/A') + '</td>';
            html += '<td>' + escapeHtml(getModuleName(r.module)) + '</td>';
            html += '<td><span class="action-badge" style="background:' + badge.color + '">' + escapeHtml(badge.text) + '</span></td>';
            html += '<td class="desc-cell">' + escapeHtml(r.description || '') + '</td>';
            html += '<td>' + escapeHtml(r.approverUserName || '') + '</td>';
            html += '</tr>';
        });

        tbody.innerHTML = html;

        // Bind click events for detail modal
        tbody.querySelectorAll('.history-row').forEach(function(row) {
            row.addEventListener('click', function() {
                var idx = parseInt(this.dataset.index);
                showDetailModal(state.filteredRecords[idx]);
            });
        });
    }

    function showDetailModal(record) {
        if (!record) return;
        var modal = document.getElementById('detailModal');
        var body = document.getElementById('detailModalBody');

        var html = '<div class="detail-info">';
        html += '<div class="detail-row"><strong>Thời gian:</strong> ' + formatTimestamp(record) + '</div>';
        html += '<div class="detail-row"><strong>Người thực hiện:</strong> ' + escapeHtml(record.performerUserName || record.performerUserId || 'N/A') + '</div>';
        if (record.approverUserName) {
            html += '<div class="detail-row"><strong>Người duyệt:</strong> ' + escapeHtml(record.approverUserName) + '</div>';
        }
        if (record.creatorUserName) {
            html += '<div class="detail-row"><strong>Người tạo:</strong> ' + escapeHtml(record.creatorUserName) + '</div>';
        }
        html += '<div class="detail-row"><strong>Module:</strong> ' + escapeHtml(getModuleName(record.module)) + '</div>';

        var badge = getActionBadge(record.actionType);
        html += '<div class="detail-row"><strong>Loại thao tác:</strong> <span class="action-badge" style="background:' + badge.color + '">' + escapeHtml(badge.text) + '</span></div>';
        html += '<div class="detail-row"><strong>Mô tả:</strong> ' + escapeHtml(record.description || 'Không có mô tả') + '</div>';

        if (record.entityId) {
            html += '<div class="detail-row"><strong>ID đối tượng:</strong> ' + escapeHtml(record.entityId) + '</div>';
        }
        html += '</div>';

        // Diff view
        html += '<div class="diff-section">';
        html += '<h4>So sánh thay đổi</h4>';

        if (!record.oldData && !record.newData) {
            html += '<p class="no-diff">Không có dữ liệu so sánh</p>';
        } else {
            var changes = computeDiff(record.oldData, record.newData);
            if (changes.length === 0) {
                html += '<p class="no-diff">Không có thay đổi</p>';
            } else {
                html += '<table class="diff-table"><thead><tr><th>Trường</th><th>Giá trị cũ</th><th>Giá trị mới</th></tr></thead><tbody>';
                changes.forEach(function(c) {
                    var rowClass = c.type === 'added' ? 'diff-added' : c.type === 'removed' ? 'diff-removed' : 'diff-changed';
                    var oldStr = c.oldVal !== null && c.oldVal !== undefined ? JSON.stringify(c.oldVal) : '—';
                    var newStr = c.newVal !== null && c.newVal !== undefined ? JSON.stringify(c.newVal) : '—';
                    html += '<tr class="' + rowClass + '">';
                    html += '<td>' + escapeHtml(c.field) + '</td>';
                    html += '<td>' + escapeHtml(oldStr) + '</td>';
                    html += '<td>' + escapeHtml(newStr) + '</td>';
                    html += '</tr>';
                });
                html += '</tbody></table>';
            }
        }
        html += '</div>';

        body.innerHTML = html;
        modal.style.display = 'flex';
    }

    // =====================================================
    // FILTER PANEL INIT
    // =====================================================

    function initFilterPanel() {
        var moduleSelect = document.getElementById('filterModule');
        ALL_MODULES.forEach(function(mod) {
            var opt = document.createElement('option');
            opt.value = mod.id;
            opt.textContent = mod.name;
            moduleSelect.appendChild(opt);
        });

        updateActionTypeOptions('all');
        populateUserDropdowns();

        // Bind filter change events
        ['filterModule', 'filterActionType', 'filterPerformer', 'filterApprover', 'filterStartDate', 'filterEndDate'].forEach(function(id) {
            document.getElementById(id).addEventListener('change', function() {
                if (id === 'filterModule') {
                    updateActionTypeOptions(this.value);
                }
                onFilterChange();
            });
        });

        document.getElementById('filterKeyword').addEventListener('input', debounce(onFilterChange, 300));

        document.getElementById('btnClearFilter').addEventListener('click', function() {
            document.getElementById('filterModule').value = 'all';
            document.getElementById('filterActionType').value = 'all';
            document.getElementById('filterPerformer').value = 'all';
            document.getElementById('filterApprover').value = 'all';
            document.getElementById('filterStartDate').value = '';
            document.getElementById('filterEndDate').value = '';
            document.getElementById('filterKeyword').value = '';
            updateActionTypeOptions('all');
            onFilterChange();
        });

        // Close modal
        document.getElementById('btnCloseModal').addEventListener('click', function() {
            document.getElementById('detailModal').style.display = 'none';
        });
        document.getElementById('detailModal').addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });
    }

    function populateUserDropdowns() {
        var performers = {};
        var approvers = {};

        state.allRecords.forEach(function(r) {
            if (r.performerUserId) performers[r.performerUserId] = r.performerUserName || r.performerUserId;
            if (r.approverUserId) approvers[r.approverUserId] = r.approverUserName || r.approverUserId;
        });

        var perfSelect = document.getElementById('filterPerformer');
        perfSelect.innerHTML = '<option value="all">Tất cả</option>';
        Object.keys(performers).forEach(function(uid) {
            var opt = document.createElement('option');
            opt.value = uid;
            opt.textContent = performers[uid];
            perfSelect.appendChild(opt);
        });

        var apprSelect = document.getElementById('filterApprover');
        apprSelect.innerHTML = '<option value="all">Tất cả</option>';
        Object.keys(approvers).forEach(function(uid) {
            var opt = document.createElement('option');
            opt.value = uid;
            opt.textContent = approvers[uid];
            apprSelect.appendChild(opt);
        });
    }

    function onFilterChange() {
        var filters = getFilters();
        state.filteredRecords = applyFilters(state.allRecords, filters);
        document.getElementById('resultCount').textContent = state.filteredRecords.length;

        var stats = computeStats(state.filteredRecords, state.currentUserId);
        renderStatsCards(stats);
        renderHistoryTable(state.filteredRecords);
    }

    function debounce(fn, delay) {
        var timer;
        return function() {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    // =====================================================
    // DATA LOADING
    // =====================================================

    function loadAuditRecords() {
        var loading = document.getElementById('loadingOverlay');
        loading.style.display = 'flex';

        try {
            var db = firebase.firestore();
            db.collection('edit_history')
                .orderBy('timestamp', 'desc')
                .limit(2000)
                .get()
                .then(function(snapshot) {
                    var records = [];
                    snapshot.forEach(function(doc) {
                        var data = doc.data();
                        data.id = doc.id;
                        records.push(normalizeRecord(data));
                    });

                    // Sort mới nhất lên đầu (client-side) để đảm bảo đúng thứ tự
                    // khi timestamp có nhiều format khác nhau
                    records.sort(function(a, b) {
                        var da = getTimestampDate(a);
                        var db = getTimestampDate(b);
                        if (!da && !db) return 0;
                        if (!da) return 1;
                        if (!db) return -1;
                        return db.getTime() - da.getTime();
                    });

                    state.allRecords = records;
                    state.filteredRecords = records;

                    populateUserDropdowns();

                    document.getElementById('resultCount').textContent = records.length;
                    var stats = computeStats(records, state.currentUserId);
                    renderStatsCards(stats);
                    renderHistoryTable(records);

                    loading.style.display = 'none';
                })
                .catch(function(error) {
                    console.error('[AuditLog] Error loading records:', error);
                    loading.style.display = 'none';
                    document.getElementById('historyTableBody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;">Lỗi tải dữ liệu: ' + error.message + '</td></tr>';
                });
        } catch (error) {
            console.error('[AuditLog] Firestore error:', error);
            loading.style.display = 'none';
        }
    }

    // =====================================================
    // PERMISSION CHECK
    // =====================================================

    function checkPermission() {
        if (window.PermissionHelper) {
            return PermissionHelper.enforcePageAccess('lichsuchinhsua');
        }
        return true;
    }

    function getCurrentUserId() {
        try {
            if (window.authManager && typeof window.authManager.getAuthState === 'function') {
                var auth = window.authManager.getAuthState();
                return auth.userId || auth.uid || '';
            }
            var authStr = sessionStorage.getItem('loginindex_auth') || localStorage.getItem('loginindex_auth') || '{}';
            var authData = JSON.parse(authStr);
            return authData.username || authData.uid || '';
        } catch (e) {
            return '';
        }
    }

    // =====================================================
    // INIT
    // =====================================================

    function init() {
        if (!checkPermission()) return;

        state.currentUserId = getCurrentUserId();
        initFilterPanel();
        loadAuditRecords();
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        init: init,
        normalizeRecord: normalizeRecord,
        resolveModule: resolveModule,
        computeDiff: computeDiff,
        computeStats: computeStats,
        applyFilters: applyFilters,
        getActionBadge: getActionBadge,
        ALL_MODULES: ALL_MODULES,
        PAGE_ALIAS_MAP: PAGE_ALIAS_MAP,
        MODULE_ACTION_MAP: MODULE_ACTION_MAP
    };

})();
