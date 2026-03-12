/**
 * Property-Based Tests - Audit Log Diff Computation
 *
 * Property 9: Diff computation phân loại đúng thay đổi
 *
 * **Validates: Yêu cầu 8.2, 8.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Pure function extracted from app.js
// ============================================================

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

// ============================================================
// Arbitraries
// ============================================================

const arbValue = fc.oneof(
    fc.string({ minLength: 0, maxLength: 20 }),
    fc.integer({ min: -999, max: 999 }),
    fc.boolean(),
    fc.constant(null)
);

const arbDataObject = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 8 }).filter(s => /^[a-zA-Z]/.test(s)),
    arbValue,
    { minKeys: 0, maxKeys: 6 }
);

// ============================================================
// Property 9: Diff computation phân loại đúng thay đổi
// **Validates: Yêu cầu 8.2, 8.3**
// ============================================================
describe('Property 9: Diff computation phân loại đúng thay đổi', () => {
    it('Trường chỉ có newData → added, chỉ có oldData → removed, khác giá trị → changed', () => {
        fc.assert(
            fc.property(arbDataObject, arbDataObject, (oldData, newData) => {
                const changes = computeDiff(oldData, newData);

                for (const change of changes) {
                    const inOld = change.field in oldData;
                    const inNew = change.field in newData;

                    if (change.type === 'added') {
                        expect(inNew).toBe(true);
                        expect(inOld).toBe(false);
                        expect(change.oldVal).toBeNull();
                    } else if (change.type === 'removed') {
                        expect(inOld).toBe(true);
                        expect(inNew).toBe(false);
                        expect(change.newVal).toBeNull();
                    } else if (change.type === 'changed') {
                        expect(inOld).toBe(true);
                        expect(inNew).toBe(true);
                        expect(JSON.stringify(change.oldVal)).not.toBe(JSON.stringify(change.newVal));
                    }
                }
            }),
            { numRuns: 300 }
        );
    });

    it('Trường giống nhau không xuất hiện trong diff', () => {
        fc.assert(
            fc.property(arbDataObject, (data) => {
                // Same object → no changes
                const changes = computeDiff(data, { ...data });
                expect(changes.length).toBe(0);
            }),
            { numRuns: 200 }
        );
    });

    it('Cả hai null → mảng rỗng', () => {
        const changes = computeDiff(null, null);
        expect(changes).toEqual([]);
    });

    it('oldData null, newData có dữ liệu → tất cả là added', () => {
        fc.assert(
            fc.property(
                arbDataObject.filter(d => Object.keys(d).length > 0),
                (newData) => {
                    const changes = computeDiff(null, newData);
                    expect(changes.length).toBe(Object.keys(newData).length);
                    for (const c of changes) {
                        expect(c.type).toBe('added');
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('oldData có dữ liệu, newData null → tất cả là removed', () => {
        fc.assert(
            fc.property(
                arbDataObject.filter(d => Object.keys(d).length > 0),
                (oldData) => {
                    const changes = computeDiff(oldData, null);
                    expect(changes.length).toBe(Object.keys(oldData).length);
                    for (const c of changes) {
                        expect(c.type).toBe('removed');
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
