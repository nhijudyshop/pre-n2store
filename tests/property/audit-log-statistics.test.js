/**
 * Property-Based Tests - Audit Log Statistics
 *
 * Property 11: Thống kê tổng quan chính xác
 *
 * **Validates: Yêu cầu 9.1, 9.2, 9.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Pure function extracted from app.js
// ============================================================

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

    return {
        total: total,
        today: today,
        activeUsers: Object.keys(uniqueUsers).length,
        mine: mine
    };
}

// ============================================================
// Arbitraries
// ============================================================

const arbUserId = fc.constantFrom('user1', 'user2', 'user3', 'admin', 'manager');

function makeTimestamp(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(12, 0, 0, 0);
    return d;
}

const arbRecord = fc.record({
    performerUserId: arbUserId,
    performerUserName: fc.string({ minLength: 1, maxLength: 20 }),
    module: fc.constantFrom('customer-hub', 'issue-tracking', 'balance-history'),
    actionType: fc.string({ minLength: 1, maxLength: 20 }),
    timestamp: fc.integer({ min: 0, max: 30 }).map(daysAgo => makeTimestamp(daysAgo)),
    description: fc.string({ minLength: 0, maxLength: 20 }),
    oldData: fc.constant(null),
    newData: fc.constant(null)
});

const arbRecords = fc.array(arbRecord, { minLength: 0, maxLength: 40 });

// ============================================================
// Property 11: Thống kê tổng quan chính xác
// **Validates: Yêu cầu 9.1, 9.2, 9.3**
// ============================================================
describe('Property 11: Thống kê tổng quan chính xác', () => {
    it('Tổng = length records', () => {
        fc.assert(
            fc.property(arbRecords, arbUserId, (records, userId) => {
                const stats = computeStats(records, userId);
                expect(stats.total).toBe(records.length);
            }),
            { numRuns: 200 }
        );
    });

    it('Hôm nay = records có timestamp trong ngày hiện tại', () => {
        fc.assert(
            fc.property(arbRecords, arbUserId, (records, userId) => {
                const stats = computeStats(records, userId);
                const now = new Date();
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const expectedToday = records.filter(r => {
                    const d = r.timestamp instanceof Date ? r.timestamp : null;
                    return d && d >= todayStart;
                }).length;
                expect(stats.today).toBe(expectedToday);
            }),
            { numRuns: 200 }
        );
    });

    it('Users hoạt động = unique performerUserId', () => {
        fc.assert(
            fc.property(arbRecords, arbUserId, (records, userId) => {
                const stats = computeStats(records, userId);
                const uniqueUsers = new Set(records.map(r => r.performerUserId).filter(Boolean));
                expect(stats.activeUsers).toBe(uniqueUsers.size);
            }),
            { numRuns: 200 }
        );
    });

    it('Của bạn = records có performerUserId = currentUserId', () => {
        fc.assert(
            fc.property(arbRecords, arbUserId, (records, userId) => {
                const stats = computeStats(records, userId);
                const expectedMine = records.filter(r => r.performerUserId === userId).length;
                expect(stats.mine).toBe(expectedMine);
            }),
            { numRuns: 200 }
        );
    });

    it('Khi filter module → chỉ tính records module đó', () => {
        fc.assert(
            fc.property(
                arbRecords,
                arbUserId,
                fc.constantFrom('customer-hub', 'issue-tracking', 'balance-history'),
                (records, userId, moduleFilter) => {
                    const filtered = records.filter(r => r.module === moduleFilter);
                    const stats = computeStats(filtered, userId);
                    expect(stats.total).toBe(filtered.length);
                    const expectedMine = filtered.filter(r => r.performerUserId === userId).length;
                    expect(stats.mine).toBe(expectedMine);
                }
            ),
            { numRuns: 200 }
        );
    });
});
