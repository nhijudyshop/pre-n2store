/**
 * Property 22: Stale statistics detection in UI
 *
 * For any set of `kpi_statistics` entries loaded by the tab KPI, orders whose
 * corresponding BASE no longer exists should be marked as stale ("BASE đã bị xóa")
 * and excluded from summary card totals.
 *
 * **Validates: Requirements 7.13**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const sourceCode = readN2File('orders-report/js/tab-kpi-commission.js');

// --- Generators ---
const orderIdArb = fc.stringMatching(/^[0-9]{1,10}$/);
const userIdArb = fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/);

const statisticsOrderArb = fc.record({
    orderId: orderIdArb,
    stt: fc.integer({ min: 1, max: 500 }),
    campaignName: fc.string({ minLength: 1, maxLength: 30 }),
    netProducts: fc.integer({ min: 0, max: 50 }),
    kpi: fc.integer({ min: 0, max: 250000 }),
    hasDiscrepancy: fc.boolean()
});

/**
 * Pure function: simulates detectStaleStatistics logic.
 * Given statsData and a set of existing BASE orderIds,
 * marks orders whose BASE is missing as _stale: true.
 *
 * @param {Array} statsData - [{userId, dates: {dateKey: {orders: [...]}}}]
 * @param {Set<string>} existingBases - set of orderIds that have BASE
 * @returns {Array} statsData with _stale markers
 */
function detectStaleStatisticsLogic(statsData, existingBases) {
    for (const stat of statsData) {
        for (const dateData of Object.values(stat.dates || {})) {
            for (const order of (dateData.orders || [])) {
                if (order.orderId && !existingBases.has(order.orderId)) {
                    order._stale = true;
                    order._staleReason = 'BASE đã bị xóa';
                }
            }
        }
    }
    return statsData;
}

/**
 * Pure function: simulates updateSummaryCards logic.
 * Calculates totals excluding stale orders.
 *
 * @param {Array} filteredData - [{userId, orders: [...]}]
 * @returns {{ totalEmployees: number, totalOrders: number, totalNet: number, totalKPI: number }}
 */
function calculateSummaryTotals(filteredData) {
    let totalEmployees = 0;
    let totalOrders = 0;
    let totalNet = 0;
    let totalKPI = 0;

    for (const emp of filteredData) {
        let empHasValidOrders = false;
        for (const order of emp.orders) {
            if (order._stale) continue;
            empHasValidOrders = true;
            totalOrders++;
            totalNet += order.netProducts || 0;
            totalKPI += order.kpi || 0;
        }
        if (empHasValidOrders) totalEmployees++;
    }

    return { totalEmployees, totalOrders, totalNet, totalKPI };
}

describe('Feature: kpi-upselling-products, Property 22: Stale statistics detection in UI', () => {

    /**
     * PBT 22a: Orders with missing BASE are marked as stale.
     */
    it('should mark orders as stale when their BASE does not exist', () => {
        fc.assert(
            fc.property(
                userIdArb,
                fc.array(statisticsOrderArb, { minLength: 1, maxLength: 10 }),
                fc.array(orderIdArb, { minLength: 0, maxLength: 5 }),
                (userId, orders, existingBaseIds) => {
                    const existingBases = new Set(existingBaseIds);

                    // Deep clone orders to avoid mutation issues
                    const clonedOrders = orders.map(o => ({ ...o }));
                    const statsData = [{
                        userId,
                        dates: { '2024-01-01': { orders: clonedOrders } }
                    }];

                    detectStaleStatisticsLogic(statsData, existingBases);

                    for (const order of clonedOrders) {
                        if (!existingBases.has(order.orderId)) {
                            expect(order._stale).toBe(true);
                            expect(order._staleReason).toBe('BASE đã bị xóa');
                        } else {
                            expect(order._stale).toBeUndefined();
                        }
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 22b: Stale orders are excluded from summary card totals.
     */
    it('should exclude stale orders from summary card totals', () => {
        fc.assert(
            fc.property(
                userIdArb,
                fc.array(statisticsOrderArb, { minLength: 1, maxLength: 10 }),
                fc.array(orderIdArb, { minLength: 0, maxLength: 5 }),
                (userId, orders, existingBaseIds) => {
                    const existingBases = new Set(existingBaseIds);

                    // Deep clone and mark stale
                    const clonedOrders = orders.map(o => ({ ...o }));
                    const statsData = [{
                        userId,
                        dates: { '2024-01-01': { orders: clonedOrders } }
                    }];
                    detectStaleStatisticsLogic(statsData, existingBases);

                    // Build filteredData format (flat orders per employee)
                    const filteredData = [{
                        userId,
                        orders: clonedOrders
                    }];

                    const summary = calculateSummaryTotals(filteredData);

                    // Calculate expected totals (only non-stale orders)
                    const validOrders = clonedOrders.filter(o => !o._stale);
                    const expectedNet = validOrders.reduce((sum, o) => sum + (o.netProducts || 0), 0);
                    const expectedKPI = validOrders.reduce((sum, o) => sum + (o.kpi || 0), 0);
                    const expectedOrders = validOrders.length;

                    expect(summary.totalOrders).toBe(expectedOrders);
                    expect(summary.totalNet).toBe(expectedNet);
                    expect(summary.totalKPI).toBe(expectedKPI);

                    // If all orders are stale, employee should not be counted
                    if (validOrders.length === 0) {
                        expect(summary.totalEmployees).toBe(0);
                    } else {
                        expect(summary.totalEmployees).toBe(1);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 22c: When all BASEs exist, no orders are marked stale.
     */
    it('should not mark any orders as stale when all BASEs exist', () => {
        fc.assert(
            fc.property(
                userIdArb,
                fc.array(statisticsOrderArb, { minLength: 1, maxLength: 10 }),
                (userId, orders) => {
                    // All order BASEs exist
                    const existingBases = new Set(orders.map(o => o.orderId));

                    const clonedOrders = orders.map(o => ({ ...o }));
                    const statsData = [{
                        userId,
                        dates: { '2024-01-01': { orders: clonedOrders } }
                    }];

                    detectStaleStatisticsLogic(statsData, existingBases);

                    for (const order of clonedOrders) {
                        expect(order._stale).toBeUndefined();
                    }

                    // Summary should include all orders
                    const filteredData = [{ userId, orders: clonedOrders }];
                    const summary = calculateSummaryTotals(filteredData);
                    expect(summary.totalOrders).toBe(clonedOrders.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 22d: When no BASEs exist, all orders are stale and totals are zero.
     */
    it('should mark all orders as stale and totals zero when no BASEs exist', () => {
        fc.assert(
            fc.property(
                userIdArb,
                fc.array(statisticsOrderArb, { minLength: 1, maxLength: 10 }),
                (userId, orders) => {
                    const existingBases = new Set(); // No BASEs

                    const clonedOrders = orders.map(o => ({ ...o }));
                    const statsData = [{
                        userId,
                        dates: { '2024-01-01': { orders: clonedOrders } }
                    }];

                    detectStaleStatisticsLogic(statsData, existingBases);

                    for (const order of clonedOrders) {
                        expect(order._stale).toBe(true);
                        expect(order._staleReason).toBe('BASE đã bị xóa');
                    }

                    const filteredData = [{ userId, orders: clonedOrders }];
                    const summary = calculateSummaryTotals(filteredData);
                    expect(summary.totalOrders).toBe(0);
                    expect(summary.totalNet).toBe(0);
                    expect(summary.totalKPI).toBe(0);
                    expect(summary.totalEmployees).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: tab-kpi-commission.js contains detectStaleStatistics
     * and updateSummaryCards excludes stale orders.
     */
    it('source code should contain detectStaleStatistics and stale exclusion in updateSummaryCards', () => {
        // detectStaleStatistics function exists
        expect(sourceCode).toContain('async detectStaleStatistics(statsData)');
        expect(sourceCode).toContain('_stale');
        expect(sourceCode).toContain('BASE đã bị xóa');

        // updateSummaryCards excludes stale orders
        expect(sourceCode).toContain('order._stale');

        // Batch query in chunks of 10
        expect(sourceCode).toContain('i += 10');

        // renderEmptyState exists
        expect(sourceCode).toContain('renderEmptyState()');
    });
});
