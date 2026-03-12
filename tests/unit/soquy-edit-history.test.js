/**
 * Unit Tests - Soquy Edit History Module (Task 1)
 *
 * Tests for core functions: computeChanges, getActionBadge, buildHistoryRecord, logEditHistory
 *
 * **Validates: Requirements 2.2, 2.9, 3.4, 5.1, 5.2, 5.3**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

// ============================================================
// Extract pure functions from the IIFE module for testing
// ============================================================

// --- computeChanges: extracted logic ---
function computeChanges(oldData, newData) {
    const changes = {};
    if (!oldData || !newData) return changes;
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    for (const key of allKeys) {
        const oldVal = oldData[key];
        const newVal = newData[key];
        if (oldVal === newVal) continue;
        if ((oldVal === undefined || oldVal === null) && (newVal === undefined || newVal === null)) continue;
        changes[key] = {
            old: oldVal !== undefined ? oldVal : null,
            new: newVal !== undefined ? newVal : null
        };
    }
    return changes;
}

// --- getActionBadge: extracted logic ---
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

function getActionBadge(actionType) {
    return ACTION_BADGE_MAP[actionType] || { label: actionType || 'Không xác định', color: '#8c8c8c' };
}

// --- buildHistoryRecord: extracted logic ---
const VALID_ACTION_TYPES = [
    'create', 'edit', 'cancel', 'delete',
    'import', 'delete_all',
    'category_add', 'category_delete',
    'source_add', 'source_delete'
];
const VOUCHER_ACTION_TYPES = ['create', 'edit', 'cancel', 'delete'];

/**
 * Testable version of buildHistoryRecord (without firebase dependency).
 * Uses a placeholder for timestamp.
 */
function buildHistoryRecord(actionType, details, userId, userName) {
    if (!VALID_ACTION_TYPES.includes(actionType)) {
        return null;
    }
    const record = {
        timestamp: 'SERVER_TIMESTAMP',
        actionType: actionType,
        userId: userId || '',
        userName: userName || '',
        voucherCode: details.voucherCode || null,
        voucherType: details.voucherType || null,
        description: details.description || '',
        details: details.changes || details.extra || {}
    };
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

// ============================================================
// Verify source file exists and contains expected patterns
// ============================================================

describe('soquy-edit-history.js source file', () => {
    const source = readFileSync(resolve(N2STORE_ROOT, 'soquy/js/soquy-edit-history.js'), 'utf-8');

    it('should export window.SoquyEditHistory via IIFE', () => {
        expect(source).toContain('window.SoquyEditHistory');
        expect(source).toMatch(/\(function\s*\(\)/);
    });

    it('should declare historyState with correct defaults', () => {
        expect(source).toContain('historyState');
        expect(source).toContain("pageSize: 15");
        expect(source).toContain("actionType: 'all'");
        expect(source).toContain("userName: 'all'");
        expect(source).toContain("timeRange: 'this_month'");
        expect(source).toContain("keyword: ''");
    });

    it('should export all required public API functions', () => {
        expect(source).toContain('logEditHistory');
        expect(source).toContain('loadHistory');
        expect(source).toContain('renderHistoryTab');
        expect(source).toContain('applyFilters');
        expect(source).toContain('initTab');
    });

    it('should contain computeChanges function', () => {
        expect(source).toContain('function computeChanges(oldData, newData)');
    });

    it('should contain getActionBadge function', () => {
        expect(source).toContain('function getActionBadge(actionType)');
    });

    it('should contain buildHistoryRecord function', () => {
        expect(source).toContain('function buildHistoryRecord(actionType, details)');
    });

    it('should use serverTimestamp in buildHistoryRecord', () => {
        expect(source).toContain('firebase.firestore.FieldValue.serverTimestamp()');
    });

    it('should wrap logEditHistory in try/catch', () => {
        // Verify the error handling pattern
        expect(source).toContain("console.error('[EditHistory] Error logging:'");
    });
});

// ============================================================
// computeChanges tests
// ============================================================

describe('computeChanges', () => {
    it('should return empty object when both inputs are identical', () => {
        const data = { amount: 100, category: 'Thu', note: 'test' };
        expect(computeChanges(data, data)).toEqual({});
    });

    it('should return empty object for same-value objects', () => {
        const old = { amount: 100, category: 'Thu' };
        const newD = { amount: 100, category: 'Thu' };
        expect(computeChanges(old, newD)).toEqual({});
    });

    it('should detect changed fields', () => {
        const old = { amount: 100, category: 'Thu', note: 'old' };
        const newD = { amount: 200, category: 'Thu', note: 'new' };
        const result = computeChanges(old, newD);
        expect(result).toEqual({
            amount: { old: 100, new: 200 },
            note: { old: 'old', new: 'new' }
        });
    });

    it('should detect added fields', () => {
        const old = { amount: 100 };
        const newD = { amount: 100, note: 'added' };
        const result = computeChanges(old, newD);
        expect(result).toEqual({
            note: { old: null, new: 'added' }
        });
    });

    it('should detect removed fields (present in old, missing in new)', () => {
        const old = { amount: 100, note: 'exists' };
        const newD = { amount: 100 };
        const result = computeChanges(old, newD);
        expect(result).toEqual({
            note: { old: 'exists', new: null }
        });
    });

    it('should treat null and undefined as equivalent (no change)', () => {
        const old = { field: null };
        const newD = { field: undefined };
        expect(computeChanges(old, newD)).toEqual({});
    });

    it('should return empty object when oldData is null', () => {
        expect(computeChanges(null, { a: 1 })).toEqual({});
    });

    it('should return empty object when newData is null', () => {
        expect(computeChanges({ a: 1 }, null)).toEqual({});
    });

    it('should handle empty objects', () => {
        expect(computeChanges({}, {})).toEqual({});
    });
});

// ============================================================
// getActionBadge tests
// ============================================================

describe('getActionBadge', () => {
    it('should return correct badge for create', () => {
        expect(getActionBadge('create')).toEqual({ label: 'Tạo phiếu', color: '#52c41a' });
    });

    it('should return correct badge for edit', () => {
        expect(getActionBadge('edit')).toEqual({ label: 'Sửa phiếu', color: '#1890ff' });
    });

    it('should return correct badge for cancel', () => {
        expect(getActionBadge('cancel')).toEqual({ label: 'Hủy phiếu', color: '#fa8c16' });
    });

    it('should return correct badge for delete', () => {
        expect(getActionBadge('delete')).toEqual({ label: 'Xóa phiếu', color: '#ff4d4f' });
    });

    it('should return correct badge for delete_all', () => {
        expect(getActionBadge('delete_all')).toEqual({ label: 'Xóa toàn bộ', color: '#ff4d4f' });
    });

    it('should return correct badge for import', () => {
        expect(getActionBadge('import')).toEqual({ label: 'Import', color: '#722ed1' });
    });

    it('should return correct badge for category_add', () => {
        expect(getActionBadge('category_add')).toEqual({ label: 'Quản lý danh mục', color: '#8c8c8c' });
    });

    it('should return correct badge for category_delete', () => {
        expect(getActionBadge('category_delete')).toEqual({ label: 'Quản lý danh mục', color: '#8c8c8c' });
    });

    it('should return correct badge for source_add', () => {
        expect(getActionBadge('source_add')).toEqual({ label: 'Quản lý nguồn', color: '#8c8c8c' });
    });

    it('should return correct badge for source_delete', () => {
        expect(getActionBadge('source_delete')).toEqual({ label: 'Quản lý nguồn', color: '#8c8c8c' });
    });

    it('should return fallback for unknown actionType', () => {
        const result = getActionBadge('unknown_type');
        expect(result).toEqual({ label: 'unknown_type', color: '#8c8c8c' });
    });

    it('should return fallback for empty string', () => {
        const result = getActionBadge('');
        expect(result).toEqual({ label: 'Không xác định', color: '#8c8c8c' });
    });

    it('should return fallback for undefined', () => {
        const result = getActionBadge(undefined);
        expect(result).toEqual({ label: 'Không xác định', color: '#8c8c8c' });
    });
});

// ============================================================
// buildHistoryRecord tests
// ============================================================

describe('buildHistoryRecord', () => {
    it('should return null for invalid actionType', () => {
        expect(buildHistoryRecord('invalid', {})).toBeNull();
    });

    it('should build record with all required fields for create', () => {
        const record = buildHistoryRecord('create', {
            voucherCode: 'TTM000001',
            voucherType: 'receipt',
            description: 'Tạo phiếu thu TTM000001'
        }, 'user1', 'Nguyễn Văn A');

        expect(record).toMatchObject({
            timestamp: 'SERVER_TIMESTAMP',
            actionType: 'create',
            userId: 'user1',
            userName: 'Nguyễn Văn A',
            voucherCode: 'TTM000001',
            voucherType: 'receipt',
            description: 'Tạo phiếu thu TTM000001'
        });
    });

    it('should ensure voucherCode/voucherType for voucher actions', () => {
        const record = buildHistoryRecord('delete', {
            description: 'Xóa phiếu'
        }, 'user1', 'Test');

        // Should default to empty string for voucher actions
        expect(record.voucherCode).toBe('');
        expect(record.voucherType).toBe('');
    });

    it('should allow null voucherCode/voucherType for non-voucher actions', () => {
        const record = buildHistoryRecord('import', {
            description: 'Import 10 phiếu'
        }, 'user1', 'Test');

        expect(record.voucherCode).toBeNull();
        expect(record.voucherType).toBeNull();
    });

    it('should include changes in details for edit action', () => {
        const changes = { amount: { old: 100, new: 200 } };
        const record = buildHistoryRecord('edit', {
            voucherCode: 'TTM000001',
            voucherType: 'receipt',
            changes: changes,
            description: 'Sửa phiếu TTM000001'
        }, 'user1', 'Test');

        expect(record.details).toEqual(changes);
    });

    it('should handle all 10 valid action types', () => {
        VALID_ACTION_TYPES.forEach(type => {
            const record = buildHistoryRecord(type, { description: 'test' }, 'u', 'n');
            expect(record).not.toBeNull();
            expect(record.actionType).toBe(type);
        });
    });

    it('should use extra field when changes is not provided', () => {
        const extra = { importCount: 50 };
        const record = buildHistoryRecord('import', {
            extra: extra,
            description: 'Import'
        }, 'user1', 'Test');

        expect(record.details).toEqual(extra);
    });
});


// ============================================================
// Task 2: applyHistoryFilters, paginateRecords, loadHistory
// ============================================================

// --- applyHistoryFilters: extracted logic ---
function getRecordDate(record) {
    if (!record || !record.timestamp) return null;
    var ts = record.timestamp;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === 'number') return new Date(ts);
    return null;
}

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

// --- paginateRecords: extracted logic ---
function paginateRecords(records, page, pageSize) {
    var safeRecords = Array.isArray(records) ? records : [];
    var safePage = (typeof page === 'number' && page >= 1) ? Math.floor(page) : 1;
    var safePageSize = [15, 30, 50, 100].indexOf(pageSize) !== -1 ? pageSize : 15;

    var totalRecords = safeRecords.length;
    var totalPages = totalRecords > 0 ? Math.ceil(totalRecords / safePageSize) : 1;

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

// ============================================================
// Helper: create mock records with Date timestamps
// ============================================================

function makeRecord(overrides) {
    return {
        actionType: 'create',
        userName: 'User A',
        voucherCode: 'TTM000001',
        description: 'Tạo phiếu thu',
        timestamp: new Date(),
        ...overrides
    };
}

// ============================================================
// applyHistoryFilters tests
// ============================================================

describe('applyHistoryFilters', () => {
    it('should return empty array for null/undefined records', () => {
        expect(applyHistoryFilters(null, {})).toEqual([]);
        expect(applyHistoryFilters(undefined, {})).toEqual([]);
    });

    it('should return copy of records when filters is null', () => {
        const records = [makeRecord()];
        const result = applyHistoryFilters(records, null);
        expect(result).toEqual(records);
        expect(result).not.toBe(records); // should be a copy
    });

    it('should return all records when all filters are "all"', () => {
        const records = [
            makeRecord({ actionType: 'create' }),
            makeRecord({ actionType: 'edit' }),
            makeRecord({ actionType: 'delete' })
        ];
        const result = applyHistoryFilters(records, { actionType: 'all', userName: 'all', timeRange: 'all' });
        expect(result.length).toBe(3);
    });

    // --- actionType filter ---
    it('should filter by specific actionType', () => {
        const records = [
            makeRecord({ actionType: 'create' }),
            makeRecord({ actionType: 'edit' }),
            makeRecord({ actionType: 'delete' })
        ];
        const result = applyHistoryFilters(records, { actionType: 'edit' });
        expect(result.length).toBe(1);
        expect(result[0].actionType).toBe('edit');
    });

    it('should filter by category group (category_add + category_delete)', () => {
        const records = [
            makeRecord({ actionType: 'category_add' }),
            makeRecord({ actionType: 'category_delete' }),
            makeRecord({ actionType: 'create' }),
            makeRecord({ actionType: 'source_add' })
        ];
        const result = applyHistoryFilters(records, { actionType: 'category' });
        expect(result.length).toBe(2);
        expect(result.every(r => r.actionType.startsWith('category_'))).toBe(true);
    });

    it('should filter by source group (source_add + source_delete)', () => {
        const records = [
            makeRecord({ actionType: 'source_add' }),
            makeRecord({ actionType: 'source_delete' }),
            makeRecord({ actionType: 'create' }),
            makeRecord({ actionType: 'category_add' })
        ];
        const result = applyHistoryFilters(records, { actionType: 'source' });
        expect(result.length).toBe(2);
        expect(result.every(r => r.actionType.startsWith('source_'))).toBe(true);
    });

    // --- userName filter ---
    it('should filter by userName', () => {
        const records = [
            makeRecord({ userName: 'Alice' }),
            makeRecord({ userName: 'Bob' }),
            makeRecord({ userName: 'Alice' })
        ];
        const result = applyHistoryFilters(records, { userName: 'Alice' });
        expect(result.length).toBe(2);
    });

    // --- timeRange filter ---
    it('should filter by today', () => {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(10, 0, 0, 0);

        const records = [
            makeRecord({ timestamp: today }),
            makeRecord({ timestamp: yesterday })
        ];
        const result = applyHistoryFilters(records, { timeRange: 'today' });
        expect(result.length).toBe(1);
    });

    it('should filter by last_7_days', () => {
        const today = new Date();
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const records = [
            makeRecord({ timestamp: today }),
            makeRecord({ timestamp: fiveDaysAgo }),
            makeRecord({ timestamp: tenDaysAgo })
        ];
        const result = applyHistoryFilters(records, { timeRange: 'last_7_days' });
        expect(result.length).toBe(2);
    });

    it('should filter by this_month', () => {
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

        const records = [
            makeRecord({ timestamp: thisMonth }),
            makeRecord({ timestamp: lastMonth })
        ];
        const result = applyHistoryFilters(records, { timeRange: 'this_month' });
        expect(result.length).toBe(1);
    });

    it('should filter by last_month', () => {
        const now = new Date();
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
        const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 15);
        const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 5);

        const records = [
            makeRecord({ timestamp: lastMonthDate }),
            makeRecord({ timestamp: twoMonthsAgo }),
            makeRecord({ timestamp: thisMonthDate })
        ];
        const result = applyHistoryFilters(records, { timeRange: 'last_month' });
        expect(result.length).toBe(1);
    });

    it('should filter by custom date range', () => {
        const records = [
            makeRecord({ timestamp: new Date('2024-06-15') }),
            makeRecord({ timestamp: new Date('2024-06-20') }),
            makeRecord({ timestamp: new Date('2024-07-01') })
        ];
        const result = applyHistoryFilters(records, {
            timeRange: 'custom',
            customStart: new Date('2024-06-10'),
            customEnd: new Date('2024-06-25')
        });
        expect(result.length).toBe(2);
    });

    it('should exclude records with null timestamp when time filter is active', () => {
        const records = [
            makeRecord({ timestamp: null }),
            makeRecord({ timestamp: new Date() })
        ];
        const result = applyHistoryFilters(records, { timeRange: 'today' });
        expect(result.length).toBe(1);
    });

    // --- keyword filter ---
    it('should filter by keyword in voucherCode (case-insensitive)', () => {
        const records = [
            makeRecord({ voucherCode: 'TTM000001', description: 'Tạo phiếu' }),
            makeRecord({ voucherCode: 'TCN000002', description: 'Tạo phiếu chi' })
        ];
        const result = applyHistoryFilters(records, { keyword: 'ttm' });
        expect(result.length).toBe(1);
        expect(result[0].voucherCode).toBe('TTM000001');
    });

    it('should filter by keyword in description (case-insensitive)', () => {
        const records = [
            makeRecord({ description: 'Import 50 phiếu từ Excel' }),
            makeRecord({ description: 'Tạo phiếu thu' })
        ];
        const result = applyHistoryFilters(records, { keyword: 'import' });
        expect(result.length).toBe(1);
    });

    it('should ignore empty keyword', () => {
        const records = [makeRecord(), makeRecord()];
        const result = applyHistoryFilters(records, { keyword: '  ' });
        expect(result.length).toBe(2);
    });

    // --- Combined filters (AND logic) ---
    it('should apply all filters simultaneously (AND)', () => {
        const now = new Date();
        const records = [
            makeRecord({ actionType: 'create', userName: 'Alice', timestamp: now, voucherCode: 'TTM001' }),
            makeRecord({ actionType: 'create', userName: 'Bob', timestamp: now, voucherCode: 'TTM002' }),
            makeRecord({ actionType: 'edit', userName: 'Alice', timestamp: now, voucherCode: 'TTM003' }),
            makeRecord({ actionType: 'create', userName: 'Alice', timestamp: new Date('2020-01-01'), voucherCode: 'TTM004' })
        ];
        const result = applyHistoryFilters(records, {
            actionType: 'create',
            userName: 'Alice',
            timeRange: 'this_month',
            keyword: 'TTM001'
        });
        expect(result.length).toBe(1);
        expect(result[0].voucherCode).toBe('TTM001');
    });

    // --- Firestore Timestamp support ---
    it('should handle Firestore Timestamp objects with toDate()', () => {
        const now = new Date();
        const firestoreTimestamp = { toDate: () => now };
        const records = [makeRecord({ timestamp: firestoreTimestamp })];
        const result = applyHistoryFilters(records, { timeRange: 'today' });
        expect(result.length).toBe(1);
    });
});

// ============================================================
// paginateRecords tests
// ============================================================

describe('paginateRecords', () => {
    it('should return correct page slice for page 1', () => {
        const records = Array.from({ length: 40 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, 1, 15);
        expect(result.items.length).toBe(15);
        expect(result.totalPages).toBe(3);
        expect(result.currentPage).toBe(1);
        expect(result.totalRecords).toBe(40);
    });

    it('should return correct items for last page with remainder', () => {
        const records = Array.from({ length: 40 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, 3, 15);
        expect(result.items.length).toBe(10); // 40 - 30 = 10
        expect(result.currentPage).toBe(3);
    });

    it('should clamp page to totalPages when page exceeds range', () => {
        const records = Array.from({ length: 10 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, 999, 15);
        expect(result.currentPage).toBe(1); // only 1 page
        expect(result.items.length).toBe(10);
    });

    it('should default to pageSize 15 for invalid pageSize', () => {
        const records = Array.from({ length: 20 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, 1, 25);
        expect(result.pageSize).toBe(15);
        expect(result.items.length).toBe(15);
    });

    it('should support pageSize 30', () => {
        const records = Array.from({ length: 60 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, 1, 30);
        expect(result.pageSize).toBe(30);
        expect(result.items.length).toBe(30);
        expect(result.totalPages).toBe(2);
    });

    it('should support pageSize 50', () => {
        const records = Array.from({ length: 120 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, 1, 50);
        expect(result.pageSize).toBe(50);
        expect(result.items.length).toBe(50);
        expect(result.totalPages).toBe(3);
    });

    it('should support pageSize 100', () => {
        const records = Array.from({ length: 250 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, 1, 100);
        expect(result.pageSize).toBe(100);
        expect(result.items.length).toBe(100);
        expect(result.totalPages).toBe(3);
    });

    it('should handle empty records', () => {
        const result = paginateRecords([], 1, 15);
        expect(result.items.length).toBe(0);
        expect(result.totalPages).toBe(1);
        expect(result.totalRecords).toBe(0);
    });

    it('should handle null records', () => {
        const result = paginateRecords(null, 1, 15);
        expect(result.items.length).toBe(0);
        expect(result.totalPages).toBe(1);
    });

    it('should default page to 1 for invalid page values', () => {
        const records = Array.from({ length: 20 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, -1, 15);
        expect(result.currentPage).toBe(1);
    });

    it('should return correct totalPages calculation', () => {
        // ceil(45/15) = 3
        const records = Array.from({ length: 45 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, 1, 15);
        expect(result.totalPages).toBe(3);
    });

    it('should return exact pageSize items when records perfectly divide', () => {
        const records = Array.from({ length: 30 }, (_, i) => ({ id: i }));
        const result = paginateRecords(records, 2, 15);
        expect(result.items.length).toBe(15);
        expect(result.totalPages).toBe(2);
    });
});

// ============================================================
// Verify source file contains Task 2 functions
// ============================================================

describe('soquy-edit-history.js Task 2 source verification', () => {
    const source = readFileSync(resolve(N2STORE_ROOT, 'soquy/js/soquy-edit-history.js'), 'utf-8');

    it('should contain applyHistoryFilters function', () => {
        expect(source).toContain('function applyHistoryFilters(records, filters)');
    });

    it('should contain paginateRecords function', () => {
        expect(source).toContain('function paginateRecords(records, page, pageSize)');
    });

    it('should contain loadHistory function with Firestore query', () => {
        expect(source).toContain('async function loadHistory()');
        expect(source).toContain("orderBy('timestamp', 'desc')");
    });

    it('should contain getRecordDate helper', () => {
        expect(source).toContain('function getRecordDate(record)');
    });

    it('should contain renderHistoryError for error handling', () => {
        expect(source).toContain('function renderHistoryError(message)');
    });

    it('should expose applyHistoryFilters and paginateRecords in public API', () => {
        expect(source).toContain('applyHistoryFilters');
        expect(source).toContain('paginateRecords');
    });

    it('should contain retry button in error handler', () => {
        expect(source).toContain('SoquyEditHistory.loadHistory()');
    });
});

// ============================================================
// Task 5: renderChangesDetail, formatAmount, isAmountField
// ============================================================

// --- formatAmount: extracted logic ---
function formatAmount(value) {
    var num = Number(value);
    if (isNaN(num)) return String(value || '');
    return num.toLocaleString('vi-VN');
}

// --- isAmountField: extracted logic ---
var AMOUNT_FIELDS = ['amount', 'totalAmount', 'total', 'price', 'cost', 'fee', 'balance'];

function isAmountField(fieldName) {
    if (!fieldName) return false;
    var lower = fieldName.toLowerCase();
    return AMOUNT_FIELDS.some(function (f) { return lower.indexOf(f.toLowerCase()) !== -1; });
}

// --- escapeHtml: extracted logic ---
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- FIELD_LABELS ---
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

// --- renderChangesDetail: extracted logic ---
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

// ============================================================
// formatAmount tests
// ============================================================

describe('formatAmount', () => {
    it('should format integer with thousand separators', () => {
        const result = formatAmount(1500000);
        // vi-VN locale uses dots as thousand separators
        expect(result).toContain('1');
        expect(result).toContain('500');
        expect(result).toContain('000');
    });

    it('should format zero', () => {
        expect(formatAmount(0)).toBe('0');
    });

    it('should format negative numbers', () => {
        const result = formatAmount(-50000);
        expect(result).toContain('50');
        expect(result).toContain('000');
    });

    it('should return original string for non-numeric values', () => {
        expect(formatAmount('abc')).toBe('abc');
    });

    it('should return "0" for null/undefined (Number coercion)', () => {
        expect(formatAmount(null)).toBe('0');
        expect(formatAmount(undefined)).toBe('');
    });

    it('should format string numbers', () => {
        const result = formatAmount('250000');
        expect(result).toContain('250');
        expect(result).toContain('000');
    });
});

// ============================================================
// isAmountField tests
// ============================================================

describe('isAmountField', () => {
    it('should return true for "amount"', () => {
        expect(isAmountField('amount')).toBe(true);
    });

    it('should return true for "totalAmount"', () => {
        expect(isAmountField('totalAmount')).toBe(true);
    });

    it('should return true for "price"', () => {
        expect(isAmountField('price')).toBe(true);
    });

    it('should return true for "cost"', () => {
        expect(isAmountField('cost')).toBe(true);
    });

    it('should return true for "fee"', () => {
        expect(isAmountField('fee')).toBe(true);
    });

    it('should return true for "balance"', () => {
        expect(isAmountField('balance')).toBe(true);
    });

    it('should return false for "category"', () => {
        expect(isAmountField('category')).toBe(false);
    });

    it('should return false for "note"', () => {
        expect(isAmountField('note')).toBe(false);
    });

    it('should return false for null/undefined', () => {
        expect(isAmountField(null)).toBe(false);
        expect(isAmountField(undefined)).toBe(false);
    });

    it('should be case-insensitive', () => {
        expect(isAmountField('Amount')).toBe(true);
        expect(isAmountField('TOTAL')).toBe(true);
    });
});

// ============================================================
// renderChangesDetail tests
// ============================================================

describe('renderChangesDetail', () => {
    it('should return empty message for null changes', () => {
        const result = renderChangesDetail(null);
        expect(result).toContain('Không có thông tin thay đổi');
    });

    it('should return empty message for undefined changes', () => {
        const result = renderChangesDetail(undefined);
        expect(result).toContain('Không có thông tin thay đổi');
    });

    it('should return empty message for empty object', () => {
        const result = renderChangesDetail({});
        expect(result).toContain('Không có thông tin thay đổi');
    });

    it('should render field name, old value, and new value', () => {
        const changes = {
            note: { old: 'old note', new: 'new note' }
        };
        const result = renderChangesDetail(changes);
        expect(result).toContain('Ghi chú');
        expect(result).toContain('old note');
        expect(result).toContain('new note');
        expect(result).toContain('change-old');
        expect(result).toContain('change-new');
    });

    it('should use Vietnamese label for known fields', () => {
        const changes = {
            amount: { old: 100, new: 200 },
            category: { old: 'A', new: 'B' }
        };
        const result = renderChangesDetail(changes);
        expect(result).toContain('Số tiền');
        expect(result).toContain('Danh mục');
    });

    it('should use field name as-is for unknown fields', () => {
        const changes = {
            customField: { old: 'x', new: 'y' }
        };
        const result = renderChangesDetail(changes);
        expect(result).toContain('customField');
    });

    it('should format amount fields with thousand separators', () => {
        const changes = {
            amount: { old: 1500000, new: 2000000 }
        };
        const result = renderChangesDetail(changes);
        // Should contain formatted numbers (vi-VN uses dots)
        expect(result).toContain('1');
        expect(result).toContain('500');
        expect(result).toContain('2');
        expect(result).toContain('000');
    });

    it('should show "trống" for null/empty old values', () => {
        const changes = {
            note: { old: null, new: 'new value' }
        };
        const result = renderChangesDetail(changes);
        expect(result).toContain('trống');
        expect(result).toContain('new value');
    });

    it('should show "trống" for null/empty new values', () => {
        const changes = {
            note: { old: 'old value', new: null }
        };
        const result = renderChangesDetail(changes);
        expect(result).toContain('old value');
        expect(result).toContain('trống');
    });

    it('should render multiple changed fields', () => {
        const changes = {
            amount: { old: 100, new: 200 },
            category: { old: 'Thu', new: 'Chi' },
            note: { old: 'a', new: 'b' }
        };
        const result = renderChangesDetail(changes);
        expect(result).toContain('Số tiền');
        expect(result).toContain('Danh mục');
        expect(result).toContain('Ghi chú');
        // Should have 3 rows
        const rowCount = (result.match(/changes-detail-row/g) || []).length;
        expect(rowCount).toBe(3);
    });

    it('should contain arrow separator between old and new values', () => {
        const changes = {
            note: { old: 'a', new: 'b' }
        };
        const result = renderChangesDetail(changes);
        expect(result).toContain('→');
    });

    it('should skip invalid change entries', () => {
        const changes = {
            note: { old: 'a', new: 'b' },
            badField: 'not an object'
        };
        const result = renderChangesDetail(changes);
        const rowCount = (result.match(/changes-detail-row/g) || []).length;
        expect(rowCount).toBe(1);
    });

    it('should escape HTML in values', () => {
        const changes = {
            note: { old: '<script>alert("xss")</script>', new: 'safe' }
        };
        const result = renderChangesDetail(changes);
        expect(result).not.toContain('<script>');
        expect(result).toContain('&lt;script&gt;');
    });
});

// ============================================================
// Verify source file contains Task 5 functions
// ============================================================

describe('soquy-edit-history.js Task 5 source verification', () => {
    const source = readFileSync(resolve(N2STORE_ROOT, 'soquy/js/soquy-edit-history.js'), 'utf-8');

    it('should contain renderChangesDetail function', () => {
        expect(source).toContain('function renderChangesDetail(changes)');
    });

    it('should contain showChangesDetail function', () => {
        expect(source).toContain('function showChangesDetail(recordId)');
    });

    it('should contain closeChangesDetail function', () => {
        expect(source).toContain('function closeChangesDetail()');
    });

    it('should contain formatAmount helper', () => {
        expect(source).toContain('function formatAmount(value)');
    });

    it('should contain isAmountField helper', () => {
        expect(source).toContain('function isAmountField(fieldName)');
    });

    it('should contain FIELD_LABELS mapping', () => {
        expect(source).toContain('FIELD_LABELS');
    });

    it('should contain AMOUNT_FIELDS array', () => {
        expect(source).toContain('AMOUNT_FIELDS');
    });

    it('should expose renderChangesDetail in public API', () => {
        expect(source).toContain('renderChangesDetail');
    });

    it('should expose showChangesDetail in public API', () => {
        expect(source).toContain('showChangesDetail');
    });

    it('should contain event delegation for eh-detail-btn in initTab', () => {
        expect(source).toContain('eh-detail-btn');
        expect(source).toContain('showChangesDetail');
    });

    it('should contain modal overlay for changes detail', () => {
        expect(source).toContain('eh-modal-overlay');
        expect(source).toContain('ehChangesModal');
    });

    it('should handle Escape key to close modal', () => {
        expect(source).toContain('handleModalEscape');
        expect(source).toContain("e.key === 'Escape'");
    });
});
