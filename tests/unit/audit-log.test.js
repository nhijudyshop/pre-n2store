/**
 * Unit Tests - Audit Log System
 *
 * Task 16.1: AuditLogger service tests
 * Task 16.2: UI component tests (normalizeRecord, computeDiff, getActionBadge, computeStats, applyFilters)
 *
 * **Validates: Yêu cầu 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 8.2, 8.3, 8.4, 9.1, 10.1**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Extracted pure functions from audit-logger.js
// ============================================================

const VALID_ACTION_TYPES = [
    'wallet_add_debt', 'wallet_subtract_debt', 'wallet_adjust_debt',
    'customer_info_update', 'wallet_transaction',
    'ticket_create', 'ticket_add_debt', 'ticket_receive_goods',
    'ticket_payment', 'ticket_update',
    'transaction_assign', 'livemode_confirm_customer',
    'transaction_approve', 'transaction_adjust',
    'customer_info_update_bh', 'transaction_verify',
    'accountant_entry_create',
    'add', 'edit', 'delete', 'update', 'mark'
];

const OPTIONAL_FIELDS = [
    'approverUserId', 'approverUserName',
    'creatorUserId', 'creatorUserName',
    'entityId', 'entityType', 'metadata'
];

function isValidActionType(actionType) {
    return typeof actionType === 'string' && VALID_ACTION_TYPES.indexOf(actionType) !== -1;
}

function buildRecord(actionType, details, user) {
    var record = {
        timestamp: 'SERVER_TIMESTAMP',
        performerUserId: user.userId,
        performerUserName: user.userName,
        module: details.module,
        actionType: actionType,
        description: details.description || '',
        oldData: details.oldData || null,
        newData: details.newData || null
    };
    for (var i = 0; i < OPTIONAL_FIELDS.length; i++) {
        var field = OPTIONAL_FIELDS[i];
        if (details[field] !== undefined && details[field] !== null) {
            record[field] = details[field];
        }
    }
    return record;
}

// ============================================================
// Extracted pure functions from app.js
// ============================================================

function normalizeRecord(record) {
    if (record.performerUserId) return record;
    return {
        timestamp: record.timestamp || null,
        performerUserId: record.user || '',
        performerUserName: record.user || '',
        module: record.page || '',
        actionType: record.action || '',
        description: record.description || '',
        oldData: record.oldData || null,
        newData: record.newData || null,
        approverUserId: record.approverUserId || null,
        approverUserName: record.approverUserName || null,
        id: record.id || null
    };
}

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

const ACTION_BADGE_MAP = {
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

function getActionBadge(actionType) {
    return ACTION_BADGE_MAP[actionType] || { text: actionType || 'Không xác định', color: '#8c8c8c' };
}

function computeStats(records, currentUserId) {
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var total = records.length;
    var today = 0;
    var uniqueUsers = {};
    var mine = 0;
    records.forEach(function(r) {
        var d = r.timestamp instanceof Date ? r.timestamp : null;
        if (d && d >= todayStart) today++;
        if (r.performerUserId) uniqueUsers[r.performerUserId] = true;
        if (r.performerUserId === currentUserId) mine++;
    });
    return { total, today, activeUsers: Object.keys(uniqueUsers).length, mine };
}

function applyFilters(records, filters) {
    return records.filter(function(r) {
        if (filters.module && filters.module !== 'all' && r.module !== filters.module) return false;
        if (filters.actionType && filters.actionType !== 'all' && r.actionType !== filters.actionType) return false;
        if (filters.performer && filters.performer !== 'all' && r.performerUserId !== filters.performer) return false;
        if (filters.approver && filters.approver !== 'all' && r.approverUserId !== filters.approver) return false;
        if (filters.keyword && filters.keyword.trim()) {
            var kw = filters.keyword.toLowerCase();
            var searchable = [
                r.description || '', r.entityId || '',
                r.performerUserName || '', r.actionType || '', r.module || ''
            ].join(' ').toLowerCase();
            if (searchable.indexOf(kw) === -1) return false;
        }
        return true;
    });
}

// ============================================================
// Task 16.1: AuditLogger Service Tests
// ============================================================

describe('AuditLogger Service', () => {
    describe('buildRecord - tạo record với dữ liệu thực tế', () => {
        it('wallet_add_debt record có đầy đủ trường', () => {
            const user = { userId: 'admin1', userName: 'Admin' };
            const details = {
                module: 'customer-hub',
                description: 'Cộng công nợ 500k cho KH001',
                oldData: { balance: 1000000 },
                newData: { balance: 1500000, amount: 500000 },
                entityId: 'KH001',
                entityType: 'customer'
            };
            const record = buildRecord('wallet_add_debt', details, user);

            expect(record.performerUserId).toBe('admin1');
            expect(record.performerUserName).toBe('Admin');
            expect(record.module).toBe('customer-hub');
            expect(record.actionType).toBe('wallet_add_debt');
            expect(record.oldData).toEqual({ balance: 1000000 });
            expect(record.newData).toEqual({ balance: 1500000, amount: 500000 });
            expect(record.entityId).toBe('KH001');
            expect(record.entityType).toBe('customer');
        });

        it('ticket_create record', () => {
            const user = { userId: 'staff1', userName: 'Nhân viên A' };
            const details = {
                module: 'issue-tracking',
                description: 'Tạo phiếu CSKH mới',
                newData: { ticketId: 'T001', issueType: 'return' },
                entityId: 'T001',
                entityType: 'ticket'
            };
            const record = buildRecord('ticket_create', details, user);

            expect(record.module).toBe('issue-tracking');
            expect(record.actionType).toBe('ticket_create');
            expect(record.oldData).toBeNull();
            expect(record.newData).toEqual({ ticketId: 'T001', issueType: 'return' });
        });

        it('transaction_approve record với approver', () => {
            const user = { userId: 'staff2', userName: 'Nhân viên B' };
            const details = {
                module: 'balance-history',
                description: 'Duyệt giao dịch TX001',
                oldData: { status: 'pending' },
                newData: { status: 'approved' },
                approverUserId: 'manager1',
                approverUserName: 'Quản lý',
                entityId: 'TX001',
                entityType: 'transaction'
            };
            const record = buildRecord('transaction_approve', details, user);

            expect(record.approverUserId).toBe('manager1');
            expect(record.approverUserName).toBe('Quản lý');
        });
    });

    describe('isValidActionType', () => {
        it('actionType hợp lệ trả về true', () => {
            expect(isValidActionType('wallet_add_debt')).toBe(true);
            expect(isValidActionType('ticket_create')).toBe(true);
            expect(isValidActionType('transaction_approve')).toBe(true);
            expect(isValidActionType('add')).toBe(true);
            expect(isValidActionType('edit')).toBe(true);
        });

        it('actionType không hợp lệ trả về false', () => {
            expect(isValidActionType('invalid_action')).toBe(false);
            expect(isValidActionType('')).toBe(false);
            expect(isValidActionType('WALLET_ADD_DEBT')).toBe(false);
        });

        it('non-string trả về false', () => {
            expect(isValidActionType(null)).toBe(false);
            expect(isValidActionType(undefined)).toBe(false);
            expect(isValidActionType(123)).toBe(false);
            expect(isValidActionType(true)).toBe(false);
        });
    });

    describe('buildRecord - error handling', () => {
        it('authManager không khả dụng → userId empty, userName empty', () => {
            const user = { userId: '', userName: 'Unknown' };
            const details = { module: 'customer-hub', description: 'test' };
            const record = buildRecord('wallet_add_debt', details, user);

            expect(record.performerUserId).toBe('');
            expect(record.performerUserName).toBe('Unknown');
        });

        it('details.module thiếu → record vẫn build nhưng module empty', () => {
            const user = { userId: 'u1', userName: 'User' };
            const details = { description: 'test' };
            const record = buildRecord('wallet_add_debt', details, user);

            expect(record.module).toBeUndefined();
        });

        it('optional fields không cung cấp → không có trong record', () => {
            const user = { userId: 'u1', userName: 'User' };
            const details = { module: 'customer-hub' };
            const record = buildRecord('wallet_add_debt', details, user);

            expect(record).not.toHaveProperty('approverUserId');
            expect(record).not.toHaveProperty('entityId');
            expect(record).not.toHaveProperty('metadata');
        });
    });
});

// ============================================================
// Task 16.2: UI Component Tests
// ============================================================

describe('UI Components', () => {
    describe('normalizeRecord', () => {
        it('legacy format → new format', () => {
            const legacy = {
                user: 'admin',
                page: 'customer-hub',
                action: 'edit',
                description: 'Sửa thông tin KH',
                oldData: { name: 'Cũ' },
                newData: { name: 'Mới' },
                timestamp: new Date('2025-01-15'),
                id: 'doc123'
            };
            const result = normalizeRecord(legacy);

            expect(result.performerUserId).toBe('admin');
            expect(result.performerUserName).toBe('admin');
            expect(result.module).toBe('customer-hub');
            expect(result.actionType).toBe('edit');
            expect(result.description).toBe('Sửa thông tin KH');
            expect(result.oldData).toEqual({ name: 'Cũ' });
            expect(result.newData).toEqual({ name: 'Mới' });
        });

        it('new format → unchanged', () => {
            const newRec = {
                performerUserId: 'user1',
                performerUserName: 'User 1',
                module: 'customer-hub',
                actionType: 'wallet_add_debt',
                description: 'Test',
                oldData: null,
                newData: { amount: 100 }
            };
            const result = normalizeRecord(newRec);
            expect(result).toBe(newRec);
        });
    });

    describe('computeDiff', () => {
        it('thêm mới: trường chỉ có trong newData', () => {
            const changes = computeDiff({}, { name: 'Mới' });
            expect(changes).toEqual([{ field: 'name', type: 'added', oldVal: null, newVal: 'Mới' }]);
        });

        it('xóa: trường chỉ có trong oldData', () => {
            const changes = computeDiff({ name: 'Cũ' }, {});
            expect(changes).toEqual([{ field: 'name', type: 'removed', oldVal: 'Cũ', newVal: null }]);
        });

        it('thay đổi: cả hai nhưng khác giá trị', () => {
            const changes = computeDiff({ name: 'Cũ' }, { name: 'Mới' });
            expect(changes).toEqual([{ field: 'name', type: 'changed', oldVal: 'Cũ', newVal: 'Mới' }]);
        });

        it('giống nhau → không hiển thị', () => {
            const changes = computeDiff({ name: 'Same' }, { name: 'Same' });
            expect(changes).toEqual([]);
        });

        it('null inputs', () => {
            expect(computeDiff(null, null)).toEqual([]);
            const added = computeDiff(null, { a: 1 });
            expect(added.length).toBe(1);
            expect(added[0].type).toBe('added');
            const removed = computeDiff({ a: 1 }, null);
            expect(removed.length).toBe(1);
            expect(removed[0].type).toBe('removed');
        });
    });

    describe('getActionBadge', () => {
        it('mỗi VALID_ACTION_TYPE có badge hợp lệ', () => {
            for (const type of VALID_ACTION_TYPES) {
                const badge = getActionBadge(type);
                expect(badge.text).toBeTruthy();
                expect(badge.color).toMatch(/^#[0-9a-fA-F]{6}$/);
            }
        });

        it('unknown type trả về fallback', () => {
            const badge = getActionBadge('unknown_type');
            expect(badge.text).toBe('unknown_type');
            expect(badge.color).toBe('#8c8c8c');
        });

        it('null/undefined trả về fallback', () => {
            const badge = getActionBadge(null);
            expect(badge.text).toBe('Không xác định');
            expect(badge.color).toBe('#8c8c8c');
        });
    });

    describe('computeStats', () => {
        it('ví dụ cụ thể với records thực tế', () => {
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);

            const records = [
                { performerUserId: 'user1', timestamp: now },
                { performerUserId: 'user1', timestamp: now },
                { performerUserId: 'user2', timestamp: yesterday },
                { performerUserId: 'user3', timestamp: now }
            ];

            const stats = computeStats(records, 'user1');
            expect(stats.total).toBe(4);
            expect(stats.today).toBe(3); // 2 user1 + 1 user3
            expect(stats.activeUsers).toBe(3);
            expect(stats.mine).toBe(2);
        });

        it('mảng rỗng', () => {
            const stats = computeStats([], 'user1');
            expect(stats.total).toBe(0);
            expect(stats.today).toBe(0);
            expect(stats.activeUsers).toBe(0);
            expect(stats.mine).toBe(0);
        });
    });

    describe('applyFilters', () => {
        const records = [
            { module: 'customer-hub', actionType: 'wallet_add_debt', performerUserId: 'u1', performerUserName: 'User1', approverUserId: null, description: 'Cộng nợ', entityId: 'KH1' },
            { module: 'issue-tracking', actionType: 'ticket_create', performerUserId: 'u2', performerUserName: 'User2', approverUserId: 'u3', description: 'Tạo phiếu', entityId: 'T1' },
            { module: 'balance-history', actionType: 'transaction_approve', performerUserId: 'u1', performerUserName: 'User1', approverUserId: 'u3', description: 'Duyệt GD', entityId: 'TX1' }
        ];

        it('filter module', () => {
            const result = applyFilters(records, { module: 'customer-hub', actionType: 'all', performer: 'all', approver: 'all', keyword: '' });
            expect(result.length).toBe(1);
            expect(result[0].module).toBe('customer-hub');
        });

        it('filter actionType', () => {
            const result = applyFilters(records, { module: 'all', actionType: 'ticket_create', performer: 'all', approver: 'all', keyword: '' });
            expect(result.length).toBe(1);
            expect(result[0].actionType).toBe('ticket_create');
        });

        it('filter performer', () => {
            const result = applyFilters(records, { module: 'all', actionType: 'all', performer: 'u1', approver: 'all', keyword: '' });
            expect(result.length).toBe(2);
        });

        it('filter approver', () => {
            const result = applyFilters(records, { module: 'all', actionType: 'all', performer: 'all', approver: 'u3', keyword: '' });
            expect(result.length).toBe(2);
        });

        it('filter keyword', () => {
            const result = applyFilters(records, { module: 'all', actionType: 'all', performer: 'all', approver: 'all', keyword: 'phiếu' });
            expect(result.length).toBe(1);
            expect(result[0].description).toContain('phiếu');
        });

        it('kết hợp nhiều filter (AND logic)', () => {
            const result = applyFilters(records, { module: 'all', actionType: 'all', performer: 'u1', approver: 'all', keyword: 'Duyệt' });
            expect(result.length).toBe(1);
            expect(result[0].actionType).toBe('transaction_approve');
        });

        it('all filters → trả về toàn bộ', () => {
            const result = applyFilters(records, { module: 'all', actionType: 'all', performer: 'all', approver: 'all', keyword: '' });
            expect(result.length).toBe(3);
        });
    });
});
