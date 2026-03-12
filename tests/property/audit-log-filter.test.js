/**
 * Property-Based Tests - Audit Log Filter
 *
 * Property 7: ActionType filter phụ thuộc module đã chọn
 * Property 8: Bộ lọc kết hợp trả về đúng kết quả
 *
 * **Validates: Yêu cầu 7.2, 7.4, 7.6, 7.7, 7.9**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Pure functions extracted from app.js
// ============================================================

const MODULE_ACTION_MAP = {
    'customer-hub': ['wallet_add_debt', 'wallet_subtract_debt', 'wallet_adjust_debt', 'customer_info_update', 'wallet_transaction'],
    'issue-tracking': ['ticket_create', 'ticket_add_debt', 'ticket_receive_goods', 'ticket_payment', 'ticket_update'],
    'balance-history': ['transaction_assign', 'livemode_confirm_customer', 'transaction_approve', 'transaction_adjust', 'customer_info_update_bh', 'transaction_verify', 'accountant_entry_create']
};

const ALL_ACTION_TYPES = Object.values(MODULE_ACTION_MAP).flat();

function getActionTypeOptionsForModule(selectedModule) {
    if (selectedModule === 'all') {
        const types = [];
        Object.keys(MODULE_ACTION_MAP).forEach(function(mod) {
            MODULE_ACTION_MAP[mod].forEach(function(t) {
                if (types.indexOf(t) === -1) types.push(t);
            });
        });
        return types;
    }
    return MODULE_ACTION_MAP[selectedModule] || [];
}

function getTimestampDate(record) {
    var ts = record.timestamp;
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    var d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
}

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
                r.description || '', r.entityId || '',
                r.performerUserName || '', r.actionType || '', r.module || ''
            ].join(' ').toLowerCase();
            if (searchable.indexOf(kw) === -1) return false;
        }
        return true;
    });
}

// ============================================================
// Arbitraries
// ============================================================

const arbModuleKey = fc.constantFrom('all', 'customer-hub', 'issue-tracking', 'balance-history');
const arbModuleId = fc.constantFrom('customer-hub', 'issue-tracking', 'balance-history');
const arbActionType = fc.constantFrom(...ALL_ACTION_TYPES);
const arbUserId = fc.constantFrom('user1', 'user2', 'user3', 'admin');
const arbUserName = fc.constantFrom('Nguyen A', 'Tran B', 'Le C', 'Admin');

const arbRecord = fc.record({
    module: arbModuleId,
    actionType: arbActionType,
    performerUserId: arbUserId,
    performerUserName: arbUserName,
    approverUserId: fc.option(arbUserId, { nil: null }),
    approverUserName: fc.option(arbUserName, { nil: null }),
    description: fc.string({ minLength: 0, maxLength: 30 }),
    entityId: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }),
    timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
    oldData: fc.constant(null),
    newData: fc.constant(null)
});

const arbRecords = fc.array(arbRecord, { minLength: 0, maxLength: 30 });

// ============================================================
// Property 7: ActionType filter phụ thuộc module đã chọn
// **Validates: Yêu cầu 7.2**
// ============================================================
describe('Property 7: ActionType filter phụ thuộc module đã chọn', () => {
    it('Khi chọn module cụ thể, actionType options chỉ chứa types thuộc module đó', () => {
        fc.assert(
            fc.property(arbModuleId, (moduleId) => {
                const options = getActionTypeOptionsForModule(moduleId);
                const expected = MODULE_ACTION_MAP[moduleId] || [];
                expect(options).toEqual(expected);
                // Mỗi option phải thuộc module đã chọn
                for (const opt of options) {
                    expect(MODULE_ACTION_MAP[moduleId]).toContain(opt);
                }
            }),
            { numRuns: 100 }
        );
    });

    it('Khi chọn "all", actionType options chứa tất cả types từ mọi module', () => {
        const allOptions = getActionTypeOptionsForModule('all');
        // Phải chứa tất cả action types
        for (const mod of Object.keys(MODULE_ACTION_MAP)) {
            for (const type of MODULE_ACTION_MAP[mod]) {
                expect(allOptions).toContain(type);
            }
        }
        // Không có duplicate
        const unique = [...new Set(allOptions)];
        expect(allOptions.length).toBe(unique.length);
    });

    it('Module không tồn tại trả về mảng rỗng', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 20 }).filter(s => !MODULE_ACTION_MAP[s] && s !== 'all'),
                (invalidModule) => {
                    const options = getActionTypeOptionsForModule(invalidModule);
                    expect(options).toEqual([]);
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ============================================================
// Property 8: Bộ lọc kết hợp trả về đúng kết quả
// **Validates: Yêu cầu 7.4, 7.6, 7.7, 7.9**
// ============================================================
describe('Property 8: Bộ lọc kết hợp trả về đúng kết quả', () => {
    it('Kết quả lọc là tập con chính xác thỏa mãn TẤT CẢ điều kiện', () => {
        fc.assert(
            fc.property(
                arbRecords,
                fc.record({
                    module: fc.constantFrom('all', 'customer-hub', 'issue-tracking', 'balance-history'),
                    actionType: fc.constantFrom('all', ...ALL_ACTION_TYPES),
                    performer: fc.constantFrom('all', 'user1', 'user2', 'user3', 'admin'),
                    approver: fc.constantFrom('all', 'user1', 'user2', 'user3', 'admin'),
                    startDate: fc.constantFrom('', '2025-01-01', '2025-06-01'),
                    endDate: fc.constantFrom('', '2025-12-31', '2026-06-30'),
                    keyword: fc.constantFrom('', 'test', 'wallet')
                }),
                (records, filters) => {
                    const result = applyFilters(records, filters);

                    // Kết quả phải là tập con của records
                    expect(result.length).toBeLessThanOrEqual(records.length);

                    // Mỗi record trong kết quả phải thỏa mãn TẤT CẢ điều kiện
                    for (const r of result) {
                        if (filters.module !== 'all') expect(r.module).toBe(filters.module);
                        if (filters.actionType !== 'all') expect(r.actionType).toBe(filters.actionType);
                        if (filters.performer !== 'all') expect(r.performerUserId).toBe(filters.performer);
                        if (filters.approver !== 'all') expect(r.approverUserId).toBe(filters.approver);
                    }

                    // Mỗi record KHÔNG trong kết quả phải vi phạm ÍT NHẤT 1 điều kiện
                    for (const r of records) {
                        if (!result.includes(r)) {
                            const fails = [];
                            if (filters.module !== 'all' && r.module !== filters.module) fails.push('module');
                            if (filters.actionType !== 'all' && r.actionType !== filters.actionType) fails.push('actionType');
                            if (filters.performer !== 'all' && r.performerUserId !== filters.performer) fails.push('performer');
                            if (filters.approver !== 'all' && r.approverUserId !== filters.approver) fails.push('approver');
                            if (filters.startDate) {
                                const d = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
                                if (!d || isNaN(d.getTime()) || d < new Date(filters.startDate)) fails.push('startDate');
                            }
                            if (filters.endDate) {
                                const d = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
                                const end = new Date(filters.endDate);
                                end.setHours(23, 59, 59, 999);
                                if (!d || isNaN(d.getTime()) || d > end) fails.push('endDate');
                            }
                            if (filters.keyword && filters.keyword.trim()) {
                                const kw = filters.keyword.toLowerCase();
                                const searchable = [
                                    r.description || '', r.entityId || '',
                                    r.performerUserName || '', r.actionType || '', r.module || ''
                                ].join(' ').toLowerCase();
                                if (searchable.indexOf(kw) === -1) fails.push('keyword');
                            }
                            expect(fails.length).toBeGreaterThan(0);
                        }
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('Bộ lọc "all" cho tất cả trường trả về toàn bộ records', () => {
        fc.assert(
            fc.property(arbRecords, (records) => {
                const filters = {
                    module: 'all', actionType: 'all',
                    performer: 'all', approver: 'all',
                    startDate: '', endDate: '', keyword: ''
                };
                const result = applyFilters(records, filters);
                expect(result.length).toBe(records.length);
            }),
            { numRuns: 100 }
        );
    });
});
