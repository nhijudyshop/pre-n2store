/**
 * Property-Based Tests - Audit Log Normalize Record
 *
 * Property 12: Normalize record tương thích ngược
 *
 * **Validates: Yêu cầu 10.1**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Pure function extracted from app.js
// ============================================================

function normalizeRecord(record) {
    if (record.performerUserId) return record; // Format mới
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

// ============================================================
// Arbitraries
// ============================================================

const arbSimpleValue = fc.oneof(
    fc.string({ minLength: 0, maxLength: 20 }),
    fc.integer({ min: -999, max: 999 }),
    fc.constant(null)
);

const arbDataObject = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 8 }).filter(s => /^[a-zA-Z]/.test(s)),
    arbSimpleValue,
    { minKeys: 0, maxKeys: 4 }
);

/** Legacy format record (user, page, action) */
const arbLegacyRecord = fc.record({
    user: fc.string({ minLength: 1, maxLength: 20 }),
    page: fc.constantFrom('customer-hub', 'issue-tracking', 'balance-history', 'soquy'),
    action: fc.constantFrom('add', 'edit', 'delete', 'update', 'mark'),
    description: fc.string({ minLength: 0, maxLength: 30 }),
    oldData: fc.option(arbDataObject, { nil: null }),
    newData: fc.option(arbDataObject, { nil: null }),
    timestamp: fc.constant(new Date()),
    id: fc.string({ minLength: 5, maxLength: 20 })
});

/** New format record (performerUserId, module, actionType) */
const arbNewRecord = fc.record({
    performerUserId: fc.string({ minLength: 1, maxLength: 20 }),
    performerUserName: fc.string({ minLength: 1, maxLength: 30 }),
    module: fc.constantFrom('customer-hub', 'issue-tracking', 'balance-history'),
    actionType: fc.string({ minLength: 1, maxLength: 30 }),
    description: fc.string({ minLength: 0, maxLength: 30 }),
    oldData: fc.option(arbDataObject, { nil: null }),
    newData: fc.option(arbDataObject, { nil: null }),
    timestamp: fc.constant(new Date()),
    id: fc.string({ minLength: 5, maxLength: 20 })
});

// ============================================================
// Property 12: Normalize record tương thích ngược
// **Validates: Yêu cầu 10.1**
// ============================================================
describe('Property 12: Normalize record tương thích ngược', () => {
    it('Legacy record → format mới với performerUserName = user, module = page, actionType = action', () => {
        fc.assert(
            fc.property(arbLegacyRecord, (legacy) => {
                const normalized = normalizeRecord(legacy);

                expect(normalized.performerUserId).toBe(legacy.user);
                expect(normalized.performerUserName).toBe(legacy.user);
                expect(normalized.module).toBe(legacy.page);
                expect(normalized.actionType).toBe(legacy.action);
                expect(normalized.description).toBe(legacy.description || '');
                expect(normalized.timestamp).toBe(legacy.timestamp || null);

                // Phải có tất cả trường chuẩn
                expect(normalized).toHaveProperty('performerUserId');
                expect(normalized).toHaveProperty('performerUserName');
                expect(normalized).toHaveProperty('module');
                expect(normalized).toHaveProperty('actionType');
                expect(normalized).toHaveProperty('description');
                expect(normalized).toHaveProperty('oldData');
                expect(normalized).toHaveProperty('newData');
            }),
            { numRuns: 200 }
        );
    });

    it('New format record → trả về không thay đổi (identity)', () => {
        fc.assert(
            fc.property(arbNewRecord, (newRec) => {
                const normalized = normalizeRecord(newRec);
                // Should return the same object reference
                expect(normalized).toBe(newRec);
            }),
            { numRuns: 200 }
        );
    });

    it('Normalize là idempotent: normalize(normalize(r)) === normalize(r)', () => {
        fc.assert(
            fc.property(arbLegacyRecord, (legacy) => {
                const first = normalizeRecord(legacy);
                const second = normalizeRecord(first);
                // After first normalize, it has performerUserId → second returns same
                expect(second).toBe(first);
            }),
            { numRuns: 100 }
        );
    });
});
