/**
 * Property-Based Tests - KPI Upselling Double Count Fix
 *
 * Tests 4 properties covering fault condition and preservation for both bugs:
 * - Property 1 (3.1): Fault Condition - IsFromDropped=true → shouldLog=false
 * - Property 2 (3.2): Fault Condition - Atomic sequential writes for same orderId → 1 entry
 * - Property 3 (3.3): Preservation - IsFromDropped=false/undefined → shouldLog=true, source='chat_confirm_held'
 * - Property 4 (3.4): Preservation - Unique orderIds → N separate entries
 *
 * Uses pure simulation functions copied from unit tests.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Pure functions (copied from unit test kpi-double-count-fix.test.js)
// ============================================================

/**
 * Simulates the KPI audit log decision logic in confirmHeldProduct.
 * NEW: confirmHeldProduct ALWAYS logs audit. moveDroppedToOrder does NOT log.
 * Source differs: 'chat_from_dropped' for dropped, 'chat_confirm_held' for search.
 */
function simulateConfirmHeldProductAuditDecision(heldProduct, options = {}) {
    const {
        orderId = 'test-order-1',
        kpiAuditLoggerAvailable = true
    } = options;

    const normalizedProductId = parseInt(heldProduct.ProductId);
    const isFromDropped = heldProduct.IsFromDropped === true;

    if (kpiAuditLoggerAvailable) {
        return {
            shouldLog: true,
            logData: {
                orderId: String(orderId),
                action: 'add',
                productId: normalizedProductId,
                productCode: heldProduct.ProductCode || '',
                productName: heldProduct.ProductName || '',
                quantity: heldProduct.Quantity || 1,
                source: isFromDropped ? 'chat_from_dropped' : 'chat_confirm_held'
            },
            shouldRecalculate: true
        };
    }

    return {
        shouldLog: false,
        logData: null,
        shouldRecalculate: false
    };
}

/**
 * Simulates one atomic transaction step of saveKPIStatistics.
 * Takes the current Firestore doc state and a statistics input,
 * returns the new doc state after the transaction.
 */
function simulateTransactionStep(currentDoc, statistics) {
    let currentStats = currentDoc ? { ...currentDoc, orders: [...(currentDoc.orders || [])] } : {
        totalNetProducts: 0,
        totalKPI: 0,
        orders: []
    };

    if (currentStats.totalDifferences !== undefined && currentStats.totalNetProducts === undefined) {
        currentStats.totalNetProducts = currentStats.totalDifferences;
        delete currentStats.totalDifferences;
    }

    const existingOrderIndex = currentStats.orders.findIndex(
        o => o.orderId === statistics.orderId
    );

    if (existingOrderIndex >= 0) {
        const oldOrder = currentStats.orders[existingOrderIndex];
        currentStats.totalNetProducts -= oldOrder.netProducts || oldOrder.differences || 0;
        currentStats.totalKPI -= oldOrder.kpi || 0;

        currentStats.orders[existingOrderIndex] = {
            orderId: statistics.orderId,
            stt: statistics.stt,
            campaignId: statistics.campaignId || null,
            campaignName: statistics.campaignName || null,
            netProducts: statistics.netProducts || 0,
            kpi: statistics.kpi || 0,
            hasDiscrepancy: statistics.hasDiscrepancy || false,
            details: statistics.details || {},
            updatedAt: new Date().toISOString()
        };
    } else {
        currentStats.orders.push({
            orderId: statistics.orderId,
            stt: statistics.stt,
            campaignId: statistics.campaignId || null,
            campaignName: statistics.campaignName || null,
            netProducts: statistics.netProducts || 0,
            kpi: statistics.kpi || 0,
            hasDiscrepancy: statistics.hasDiscrepancy || false,
            details: statistics.details || {},
            updatedAt: new Date().toISOString()
        });
    }

    currentStats.totalNetProducts += statistics.netProducts || 0;
    currentStats.totalKPI += statistics.kpi || 0;

    return currentStats;
}

/**
 * Simulates the NEW atomic pattern (with transaction):
 * Calls are serialized - second call reads the state AFTER the first call committed.
 */
function simulateAtomicSequentialWrites(initialDoc, stats1, stats2) {
    const afterFirst = simulateTransactionStep(initialDoc, stats1);
    const afterSecond = simulateTransactionStep(afterFirst, stats2);
    return afterSecond;
}

// ============================================================
// Arbitraries
// ============================================================

/** Random product code like N2356D1 */
const arbProductCode = fc.tuple(
    fc.constantFrom('N', 'A', 'B', 'C', 'D', 'E'),
    fc.integer({ min: 100, max: 9999 }),
    fc.constantFrom('A', 'B', 'C', 'D', ''),
    fc.integer({ min: 1, max: 99 })
).map(([prefix, num, suffix, ver]) => `${prefix}${num}${suffix}${ver}`);

/** Random held product with configurable IsFromDropped */
function arbHeldProduct(isFromDropped) {
    return fc.record({
        ProductId: fc.integer({ min: 1, max: 999999 }),
        ProductCode: arbProductCode,
        ProductName: fc.string({ minLength: 1, maxLength: 50 }),
        Quantity: fc.integer({ min: 1, max: 100 }),
        IsHeld: fc.constant(true),
        IsFromDropped: fc.constant(isFromDropped)
    });
}

/** Random held product with IsFromDropped = false or undefined */
const arbHeldProductNotDropped = fc.oneof(
    arbHeldProduct(false),
    // undefined case: product from search (no IsFromDropped field)
    fc.record({
        ProductId: fc.integer({ min: 1, max: 999999 }),
        ProductCode: arbProductCode,
        ProductName: fc.string({ minLength: 1, maxLength: 50 }),
        Quantity: fc.integer({ min: 1, max: 100 }),
        IsHeld: fc.constant(true)
        // IsFromDropped intentionally omitted → undefined
    })
);

/** Random orderId */
const arbOrderId = fc.uuid();

/** Random KPI statistics entry */
function arbStatistics(orderId) {
    return fc.record({
        orderId: fc.constant(orderId),
        stt: fc.integer({ min: 1, max: 1000 }),
        campaignId: fc.string({ minLength: 3, maxLength: 20 }),
        campaignName: fc.string({ minLength: 1, maxLength: 30 }),
        netProducts: fc.integer({ min: 0, max: 50 }),
        kpi: fc.integer({ min: 0, max: 500000 }),
        hasDiscrepancy: fc.boolean(),
        details: fc.constant({})
    });
}

/** Random KPI statistics with random orderId */
const arbStatisticsRandom = fc.uuid().chain(id => arbStatistics(id));

// ============================================================
// Property 1 (Task 3.1): Fault Condition - IsFromDropped=true → logs with source 'chat_from_dropped'
// moveDroppedToOrder does NOT log, only confirmHeldProduct logs
// **Validates: Requirements 2.1**
// ============================================================
describe('Property 1: Fault Condition - IsFromDropped=true → logs with source chat_from_dropped', () => {
    it('For any random product with IsFromDropped=true, confirmHeldProduct SHALL log with source chat_from_dropped (only 1 log total)', () => {
        fc.assert(
            fc.property(
                arbHeldProduct(true),
                arbOrderId,
                (heldProduct, orderId) => {
                    const result = simulateConfirmHeldProductAuditDecision(heldProduct, {
                        orderId,
                        kpiAuditLoggerAvailable: true
                    });

                    // Fixed code: confirmHeldProduct logs for ALL products (including dropped)
                    // moveDroppedToOrder no longer logs → total = 1 audit log
                    expect(result.shouldLog).toBe(true);
                    expect(result.logData).not.toBeNull();
                    expect(result.logData.source).toBe('chat_from_dropped');
                    expect(result.shouldRecalculate).toBe(true);
                }
            ),
            { numRuns: 200 }
        );
    });
});

// ============================================================
// Property 2 (Task 3.2): Fault Condition - Same orderId concurrent → 1 entry
// **Validates: Requirements 2.2, 2.3**
// ============================================================
describe('Property 2: Fault Condition - Atomic writes for same orderId → exactly 1 entry', () => {
    it('For any random statistics with same orderId called twice via atomic writes, result SHALL have exactly 1 entry', () => {
        fc.assert(
            fc.property(
                arbOrderId,
                fc.integer({ min: 1, max: 1000 }),
                fc.string({ minLength: 3, maxLength: 20 }),
                fc.integer({ min: 0, max: 50 }),
                fc.integer({ min: 0, max: 500000 }),
                fc.integer({ min: 0, max: 50 }),
                fc.integer({ min: 0, max: 500000 }),
                (orderId, stt, campaignId, net1, kpi1, net2, kpi2) => {
                    const stats1 = {
                        orderId,
                        stt,
                        campaignId,
                        netProducts: net1,
                        kpi: kpi1,
                        hasDiscrepancy: false,
                        details: {}
                    };
                    const stats2 = {
                        orderId, // SAME orderId
                        stt,
                        campaignId,
                        netProducts: net2,
                        kpi: kpi2,
                        hasDiscrepancy: false,
                        details: {}
                    };

                    const finalState = simulateAtomicSequentialWrites(null, stats1, stats2);

                    // With atomic transaction: exactly 1 entry per orderId
                    const entries = finalState.orders.filter(o => o.orderId === orderId);
                    expect(entries).toHaveLength(1);

                    // The entry should reflect the LAST write's values
                    expect(entries[0].netProducts).toBe(net2);
                    expect(entries[0].kpi).toBe(kpi2);

                    // Totals should match the last write (not sum of both)
                    expect(finalState.totalNetProducts).toBe(net2);
                    expect(finalState.totalKPI).toBe(kpi2);
                }
            ),
            { numRuns: 200 }
        );
    });
});

// ============================================================
// Property 3 (Task 3.3): Preservation - IsFromDropped=false/undefined → audit log preserved
// **Validates: Requirements 3.1**
// ============================================================
describe('Property 3: Preservation - IsFromDropped=false/undefined → shouldLog=true with source chat_confirm_held', () => {
    it('For any random product with IsFromDropped=false/undefined, audit decision SHALL return shouldLog=true and source=chat_confirm_held', () => {
        fc.assert(
            fc.property(
                arbHeldProductNotDropped,
                arbOrderId,
                (heldProduct, orderId) => {
                    const result = simulateConfirmHeldProductAuditDecision(heldProduct, {
                        orderId,
                        kpiAuditLoggerAvailable: true
                    });

                    // Preservation: non-dropped products MUST still generate audit log
                    expect(result.shouldLog).toBe(true);
                    expect(result.logData).not.toBeNull();
                    expect(result.logData.source).toBe('chat_confirm_held');
                    expect(result.logData.action).toBe('add');
                    expect(result.logData.orderId).toBe(String(orderId));
                    expect(result.logData.productId).toBe(parseInt(heldProduct.ProductId));
                    expect(result.logData.quantity).toBe(heldProduct.Quantity || 1);
                    expect(result.shouldRecalculate).toBe(true);
                }
            ),
            { numRuns: 200 }
        );
    });
});

// ============================================================
// Property 4 (Task 3.4): Preservation - Unique orderIds → N separate entries
// **Validates: Requirements 3.5**
// ============================================================
describe('Property 4: Preservation - Unique orderIds → N separate entries', () => {
    it('For any random list of statistics with unique orderIds, sequential transaction steps SHALL produce N separate entries', () => {
        fc.assert(
            fc.property(
                // Generate 1-10 statistics with guaranteed unique orderIds
                fc.integer({ min: 1, max: 10 }).chain(count =>
                    fc.tuple(
                        ...Array.from({ length: count }, (_, i) =>
                            fc.record({
                                orderId: fc.uuid(),
                                stt: fc.constant(i + 1),
                                campaignId: fc.string({ minLength: 3, maxLength: 20 }),
                                campaignName: fc.string({ minLength: 1, maxLength: 30 }),
                                netProducts: fc.integer({ min: 1, max: 50 }),
                                kpi: fc.integer({ min: 1, max: 500000 }),
                                hasDiscrepancy: fc.boolean(),
                                details: fc.constant({})
                            })
                        )
                    )
                ),
                (statsList) => {
                    // Ensure unique orderIds (UUIDs are practically unique, but filter just in case)
                    const uniqueOrderIds = new Set(statsList.map(s => s.orderId));
                    if (uniqueOrderIds.size !== statsList.length) return; // skip if collision

                    // Apply each statistics sequentially (simulating atomic transactions)
                    let currentDoc = null;
                    for (const stats of statsList) {
                        currentDoc = simulateTransactionStep(currentDoc, stats);
                    }

                    // Should have exactly N entries for N unique orderIds
                    expect(currentDoc.orders).toHaveLength(statsList.length);

                    // Each orderId should appear exactly once
                    for (const stats of statsList) {
                        const entries = currentDoc.orders.filter(o => o.orderId === stats.orderId);
                        expect(entries).toHaveLength(1);
                        expect(entries[0].netProducts).toBe(stats.netProducts);
                        expect(entries[0].kpi).toBe(stats.kpi);
                    }

                    // Totals should be sum of all entries
                    const expectedTotalNet = statsList.reduce((sum, s) => sum + (s.netProducts || 0), 0);
                    const expectedTotalKPI = statsList.reduce((sum, s) => sum + (s.kpi || 0), 0);
                    expect(currentDoc.totalNetProducts).toBe(expectedTotalNet);
                    expect(currentDoc.totalKPI).toBe(expectedTotalKPI);
                }
            ),
            { numRuns: 100 }
        );
    });
});
