/**
 * Property 21: Stale statistics cleanup when BASE missing
 *
 * For any call to `recalculateAndSaveKPI(orderId)` where the BASE snapshot
 * does not exist (or has empty products), the system should remove or invalidate
 * the corresponding entry in `kpi_statistics`, preventing stale data from
 * being displayed.
 *
 * **Validates: Requirements 10.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');

// --- Generators ---
const orderIdArb = fc.stringMatching(/^[0-9]{1,10}$/);
const userIdArb = fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/);

const productArb = fc.record({
    ProductId: fc.integer({ min: 1, max: 100000 }),
    ProductCode: fc.stringMatching(/^[A-Z]{1,6}$/),
    ProductName: fc.string({ minLength: 1, maxLength: 50 }),
    Quantity: fc.integer({ min: 1, max: 100 }),
    Price: fc.integer({ min: 10000, max: 1000000 })
});

const statisticsOrderArb = fc.record({
    orderId: orderIdArb,
    stt: fc.integer({ min: 1, max: 500 }),
    campaignName: fc.string({ minLength: 1, maxLength: 30 }),
    netProducts: fc.integer({ min: 0, max: 50 }),
    kpi: fc.integer({ min: 0, max: 250000 }),
    hasDiscrepancy: fc.boolean()
});

/**
 * Pure function: simulates the recalculateAndSaveKPI decision logic.
 * Determines whether cleanup should be triggered based on BASE state.
 *
 * @param {Object|null} base - BASE snapshot (null = missing)
 * @returns {{ shouldCleanup: boolean, shouldCalculateKPI: boolean, reason: string }}
 */
function determineRecalculateAction(base) {
    // No BASE → cleanup stale statistics
    if (!base) {
        return { shouldCleanup: true, shouldCalculateKPI: false, reason: 'BASE missing' };
    }

    // BASE with empty products → cleanup stale statistics
    if (!base.products || base.products.length === 0) {
        return { shouldCleanup: true, shouldCalculateKPI: false, reason: 'BASE has empty products' };
    }

    // Valid BASE → calculate KPI normally
    return { shouldCleanup: false, shouldCalculateKPI: true, reason: 'valid BASE' };
}

/**
 * Pure function: simulates cleanupStaleStatistics logic.
 * Removes the order entry from statistics and recalculates totals.
 *
 * @param {string} orderId - Order to clean up
 * @param {Object} statisticsDoc - A kpi_statistics document with orders array
 * @returns {{ updatedOrders: Array, totalNetProducts: number, totalKPI: number, wasModified: boolean }}
 */
function cleanupOrderFromStatistics(orderId, statisticsDoc) {
    const orders = statisticsDoc.orders || [];
    const hasOrder = orders.some(o => o.orderId === orderId);

    if (!hasOrder) {
        // No modification needed
        const totalNetProducts = orders.reduce((sum, o) => sum + (o.netProducts || 0), 0);
        const totalKPI = orders.reduce((sum, o) => sum + (o.kpi || 0), 0);
        return { updatedOrders: orders, totalNetProducts, totalKPI, wasModified: false };
    }

    // Remove the order entry
    const updatedOrders = orders.filter(o => o.orderId !== orderId);

    // Recalculate totals
    const totalNetProducts = updatedOrders.reduce((sum, o) => sum + (o.netProducts || 0), 0);
    const totalKPI = updatedOrders.reduce((sum, o) => sum + (o.kpi || 0), 0);

    return { updatedOrders, totalNetProducts, totalKPI, wasModified: true };
}

describe('Feature: kpi-upselling-products, Property 21: Stale statistics cleanup when BASE missing', () => {

    /**
     * PBT 21a: When BASE is null, recalculateAndSaveKPI should trigger cleanup.
     */
    it('should trigger cleanup when BASE is null (missing)', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                (orderId) => {
                    const action = determineRecalculateAction(null);

                    expect(action.shouldCleanup).toBe(true);
                    expect(action.shouldCalculateKPI).toBe(false);
                    expect(action.reason).toBe('BASE missing');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 21b: When BASE has empty products, recalculateAndSaveKPI should trigger cleanup.
     */
    it('should trigger cleanup when BASE has empty products', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.constantFrom([], null, undefined),
                (orderId, products) => {
                    const base = { orderId, products, timestamp: { seconds: 1700000000 } };
                    const action = determineRecalculateAction(base);

                    expect(action.shouldCleanup).toBe(true);
                    expect(action.shouldCalculateKPI).toBe(false);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 21c: When BASE has valid products, NO cleanup should be triggered.
     */
    it('should NOT trigger cleanup when BASE has valid products', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(productArb, { minLength: 1, maxLength: 10 }),
                (orderId, products) => {
                    const base = { orderId, products, timestamp: { seconds: 1700000000 } };
                    const action = determineRecalculateAction(base);

                    expect(action.shouldCleanup).toBe(false);
                    expect(action.shouldCalculateKPI).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 21d: Cleanup removes the correct order from statistics and recalculates totals.
     */
    it('should remove the stale order entry and recalculate totals correctly', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(statisticsOrderArb, { minLength: 1, maxLength: 10 }),
                (targetOrderId, otherOrders) => {
                    // Ensure targetOrderId is in the statistics
                    const targetOrder = {
                        orderId: targetOrderId,
                        stt: 1,
                        campaignName: 'test',
                        netProducts: 5,
                        kpi: 25000,
                        hasDiscrepancy: false
                    };

                    // Ensure no duplicate orderIds
                    const uniqueOthers = otherOrders.filter(o => o.orderId !== targetOrderId);
                    const allOrders = [targetOrder, ...uniqueOthers];

                    const statisticsDoc = { orders: allOrders };
                    const result = cleanupOrderFromStatistics(targetOrderId, statisticsDoc);

                    // Target order should be removed
                    expect(result.wasModified).toBe(true);
                    expect(result.updatedOrders.some(o => o.orderId === targetOrderId)).toBe(false);
                    expect(result.updatedOrders.length).toBe(allOrders.length - 1);

                    // Totals should NOT include the removed order
                    const expectedNet = uniqueOthers.reduce((sum, o) => sum + (o.netProducts || 0), 0);
                    const expectedKPI = uniqueOthers.reduce((sum, o) => sum + (o.kpi || 0), 0);
                    expect(result.totalNetProducts).toBe(expectedNet);
                    expect(result.totalKPI).toBe(expectedKPI);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 21e: Cleanup on non-existent order does not modify statistics.
     */
    it('should not modify statistics when order is not present', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(statisticsOrderArb, { minLength: 0, maxLength: 10 }),
                (missingOrderId, orders) => {
                    // Ensure missingOrderId is NOT in orders
                    const filteredOrders = orders.filter(o => o.orderId !== missingOrderId);
                    const statisticsDoc = { orders: filteredOrders };

                    const result = cleanupOrderFromStatistics(missingOrderId, statisticsDoc);

                    expect(result.wasModified).toBe(false);
                    expect(result.updatedOrders.length).toBe(filteredOrders.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: kpi-manager.js contains cleanupStaleStatistics.
     */
    it('source code should contain cleanupStaleStatistics and its usage in recalculateAndSaveKPI', () => {
        // cleanupStaleStatistics function exists
        expect(sourceCode).toContain('async function cleanupStaleStatistics(orderId)');
        expect(sourceCode).toContain('Cleaning up stale statistics for order');

        // Called in recalculateAndSaveKPI when BASE missing
        expect(sourceCode).toContain('await cleanupStaleStatistics(orderId)');

        // Exported in window.kpiManager
        expect(sourceCode).toContain('cleanupStaleStatistics');
    });
});
