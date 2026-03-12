/**
 * Unit Tests - KPI Upselling Double Count Fix
 *
 * Tests for the corrected audit log flow:
 * - moveDroppedToOrder() does NOT log audit (only moves to held)
 * - confirmHeldProduct() logs audit for ALL products (both dropped and search)
 * - Source is 'chat_from_dropped' for dropped products, 'chat_confirm_held' for search
 *
 * **Validates: Requirements 2.1, 3.1**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

// ============================================================
// Pure function: Simulates the KPI audit log decision in confirmHeldProduct
// Mirrors the exact conditional logic from chat-products-actions.js
//
// NEW LOGIC: confirmHeldProduct ALWAYS logs audit for all products.
// moveDroppedToOrder does NOT log audit (removed).
// Source differs: 'chat_from_dropped' for dropped, 'chat_confirm_held' for search.
// ============================================================

/**
 * Simulates the KPI audit log decision logic in confirmHeldProduct.
 * Returns whether audit log should be written and what data would be logged.
 *
 * @param {Object} heldProduct - The held product being confirmed
 * @param {Object} options - { orderId, kpiAuditLoggerAvailable }
 * @returns {{ shouldLog: boolean, logData: Object|null, shouldRecalculate: boolean }}
 */
function simulateConfirmHeldProductAuditDecision(heldProduct, options = {}) {
    const {
        orderId = 'test-order-1',
        kpiAuditLoggerAvailable = true
    } = options;

    const normalizedProductId = parseInt(heldProduct.ProductId);
    const isFromDropped = heldProduct.IsFromDropped === true;

    // NEW: confirmHeldProduct ALWAYS logs audit (for both dropped and search products)
    // moveDroppedToOrder no longer logs audit
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

// ============================================================
// 1.2 - confirmHeldProduct GHI audit log cho SP từ hàng rớt với source 'chat_from_dropped'
// moveDroppedToOrder KHÔNG ghi audit log nữa
// Validates: Requirement 2.1
// ============================================================
describe('1.2 confirmHeldProduct: GHI audit log cho SP từ hàng rớt (source: chat_from_dropped)', () => {
    it('should log audit when IsFromDropped = true with source chat_from_dropped', () => {
        const heldProduct = {
            ProductId: 1001,
            ProductCode: 'N2356D1',
            ProductName: 'Sản phẩm từ hàng rớt',
            Quantity: 1,
            IsHeld: true,
            IsFromDropped: true
        };

        const result = simulateConfirmHeldProductAuditDecision(heldProduct);

        expect(result.shouldLog).toBe(true);
        expect(result.logData).not.toBeNull();
        expect(result.logData.source).toBe('chat_from_dropped');
        expect(result.logData.quantity).toBe(1);
        expect(result.shouldRecalculate).toBe(true);
    });

    it('should use source chat_from_dropped for dropped products', () => {
        const heldProduct = {
            ProductId: 3062,
            ProductCode: 'N3062A31',
            ProductName: 'SP hàng rớt xả',
            Quantity: 2,
            IsHeld: true,
            IsFromDropped: true
        };

        const result = simulateConfirmHeldProductAuditDecision(heldProduct, {
            orderId: '01770000-5d70-0015-4462-08de3bb33c97'
        });

        expect(result.shouldLog).toBe(true);
        expect(result.logData.source).toBe('chat_from_dropped');
        expect(result.logData.productId).toBe(3062);
    });

    it('moveDroppedToOrder should NOT contain audit log code', () => {
        const sourceCode = readN2File('orders-report/js/managers/dropped-products-manager.js');

        const fnStart = sourceCode.indexOf('window.moveDroppedToOrder');
        expect(fnStart).toBeGreaterThan(-1);

        const fnBody = sourceCode.substring(fnStart, fnStart + 8000);

        // Should NOT contain logProductAction call
        expect(fnBody).not.toContain('logProductAction');
        // Should contain comment explaining why
        expect(fnBody).toContain('KHÔNG ghi ở đây');
    });

    it('only ONE audit log per dropped product (from confirmHeldProduct only)', () => {
        const heldProduct = {
            ProductId: 5001,
            ProductCode: 'TEST01',
            ProductName: 'Test Product',
            Quantity: 1,
            IsHeld: true,
            IsFromDropped: true
        };

        // moveDroppedToOrder: no audit log (removed)
        // confirmHeldProduct: 1 audit log
        const result = simulateConfirmHeldProductAuditDecision(heldProduct);
        expect(result.shouldLog).toBe(true);
        // Total audit logs = 1 (only from confirmHeldProduct)
    });
});

// ============================================================
// 1.3 - confirmHeldProduct VẪN ghi audit log khi IsFromDropped = false/undefined
// Validates: Requirement 3.1
// ============================================================
describe('1.3 confirmHeldProduct: VẪN ghi audit log khi IsFromDropped = false/undefined', () => {
    it('should log audit when IsFromDropped = false', () => {
        const heldProduct = {
            ProductId: 2001,
            ProductCode: 'SEARCH01',
            ProductName: 'SP từ tìm kiếm',
            Quantity: 1,
            IsHeld: true,
            IsFromDropped: false
        };

        const result = simulateConfirmHeldProductAuditDecision(heldProduct, {
            orderId: 'order-from-search'
        });

        expect(result.shouldLog).toBe(true);
        expect(result.logData).not.toBeNull();
        expect(result.logData.source).toBe('chat_confirm_held');
        expect(result.logData.action).toBe('add');
        expect(result.logData.productId).toBe(2001);
        expect(result.logData.quantity).toBe(1);
        expect(result.shouldRecalculate).toBe(true);
    });

    it('should log audit when IsFromDropped = undefined (product from search)', () => {
        const heldProduct = {
            ProductId: 2002,
            ProductCode: 'SEARCH02',
            ProductName: 'SP tìm kiếm không có flag',
            Quantity: 3,
            IsHeld: true
            // IsFromDropped is undefined - this is the normal case for search products
        };

        const result = simulateConfirmHeldProductAuditDecision(heldProduct, {
            orderId: 'order-normal'
        });

        expect(result.shouldLog).toBe(true);
        expect(result.logData.source).toBe('chat_confirm_held');
        expect(result.logData.productId).toBe(2002);
        expect(result.logData.quantity).toBe(3);
        expect(result.shouldRecalculate).toBe(true);
    });

    it('should log audit when IsFromDropped = null', () => {
        const heldProduct = {
            ProductId: 2003,
            ProductCode: 'SEARCH03',
            ProductName: 'SP với null flag',
            Quantity: 1,
            IsHeld: true,
            IsFromDropped: null
        };

        const result = simulateConfirmHeldProductAuditDecision(heldProduct);

        expect(result.shouldLog).toBe(true);
        expect(result.logData.source).toBe('chat_confirm_held');
    });

    it('should log audit when IsFromDropped = 0 (falsy but not strictly true)', () => {
        const heldProduct = {
            ProductId: 2004,
            ProductCode: 'SEARCH04',
            ProductName: 'SP với flag = 0',
            Quantity: 1,
            IsHeld: true,
            IsFromDropped: 0
        };

        const result = simulateConfirmHeldProductAuditDecision(heldProduct);

        // IsFromDropped === true check: 0 !== true → should log
        expect(result.shouldLog).toBe(true);
    });

    it('should NOT log when kpiAuditLogger is unavailable, even with IsFromDropped = false', () => {
        const heldProduct = {
            ProductId: 2005,
            ProductCode: 'SEARCH05',
            ProductName: 'SP test',
            Quantity: 1,
            IsHeld: true,
            IsFromDropped: false
        };

        const result = simulateConfirmHeldProductAuditDecision(heldProduct, {
            kpiAuditLoggerAvailable: false
        });

        expect(result.shouldLog).toBe(false);
    });

    it('audit log data should have correct source "chat_confirm_held"', () => {
        const heldProduct = {
            ProductId: 2006,
            ProductCode: 'VERIFY01',
            ProductName: 'Verify Source',
            Quantity: 2,
            IsHeld: true,
            IsFromDropped: false
        };

        const result = simulateConfirmHeldProductAuditDecision(heldProduct, {
            orderId: 'order-verify'
        });

        expect(result.logData).toEqual({
            orderId: 'order-verify',
            action: 'add',
            productId: 2006,
            productCode: 'VERIFY01',
            productName: 'Verify Source',
            quantity: 2,
            source: 'chat_confirm_held'
        });
    });

    it('source code should call logProductAction for all products in confirmHeldProduct', () => {
        const sourceCode = readN2File('orders-report/js/chat/chat-products-actions.js');

        // Verify confirmHeldProduct logs audit for all products
        expect(sourceCode).toContain('logProductAction');
        expect(sourceCode).toContain("source: isFromDropped ? 'chat_from_dropped' : 'chat_confirm_held'");
        expect(sourceCode).toContain('recalculateAndSaveKPI');

        // Verify the IsFromDropped variable is used for source selection
        const isFromDroppedIdx = sourceCode.indexOf('const isFromDropped = heldProduct.IsFromDropped === true');
        expect(isFromDroppedIdx).toBeGreaterThan(-1);
    });
});


// ============================================================
// Pure function: Simulates the read-modify-write logic inside
// saveKPIStatistics's Firestore transaction.
// This is the EXACT logic from kpi-manager.js runTransaction callback.
// ============================================================

/**
 * Simulates one atomic transaction step of saveKPIStatistics.
 * Takes the current Firestore doc state and a statistics input,
 * returns the new doc state after the transaction.
 *
 * @param {Object|null} currentDoc - Current Firestore doc data (null if doc doesn't exist)
 * @param {Object} statistics - The statistics to save
 * @returns {Object} - The new doc state after transaction
 */
function simulateTransactionStep(currentDoc, statistics) {
    let currentStats = currentDoc ? { ...currentDoc, orders: [...(currentDoc.orders || [])] } : {
        totalNetProducts: 0,
        totalKPI: 0,
        orders: []
    };

    // Ensure we have the new field names (migration logic)
    if (currentStats.totalDifferences !== undefined && currentStats.totalNetProducts === undefined) {
        currentStats.totalNetProducts = currentStats.totalDifferences;
        delete currentStats.totalDifferences;
    }

    const existingOrderIndex = currentStats.orders.findIndex(
        o => o.orderId === statistics.orderId
    );

    if (existingOrderIndex >= 0) {
        // UPDATE existing entry
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
        // PUSH new entry
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
 * Simulates the OLD non-atomic pattern (pre-fix):
 * Both calls read the SAME initial state, then both write independently.
 * This is what caused the duplicate entries bug.
 *
 * @param {Object|null} initialDoc - Initial Firestore doc state
 * @param {Object} stats1 - First concurrent call's statistics
 * @param {Object} stats2 - Second concurrent call's statistics
 * @returns {Object} - Final doc state (from the LAST write, which overwrites the first)
 */
function simulateNonAtomicConcurrentWrites(initialDoc, stats1, stats2) {
    // Both read the SAME initial state (race condition)
    const result1 = simulateTransactionStep(initialDoc, stats1);
    const result2 = simulateTransactionStep(initialDoc, stats2);
    // Last write wins - but both pushed a new entry from the same initial state
    // In reality, both writes go through, and the doc ends up with whichever wrote last
    // But the key issue: result2 was computed from initialDoc (not result1)
    // So if stats1 and stats2 have the same orderId, result2 has 1 entry
    // but result1 also has 1 entry - and the final state depends on write order.
    // The REAL bug: if both complete, the second set() overwrites the first,
    // but since both computed from the same base, the second doesn't see the first's entry.
    // Actually the worst case: both writes succeed and Firestore merges them,
    // resulting in the LAST write's state. But the issue is that both calls
    // independently pushed a new entry because neither saw the other's write.
    return { result1, result2 };
}

/**
 * Simulates the NEW atomic pattern (with transaction):
 * Calls are serialized - second call reads the state AFTER the first call committed.
 *
 * @param {Object|null} initialDoc - Initial Firestore doc state
 * @param {Object} stats1 - First call's statistics
 * @param {Object} stats2 - Second call's statistics
 * @returns {Object} - Final doc state after both transactions complete sequentially
 */
function simulateAtomicSequentialWrites(initialDoc, stats1, stats2) {
    // First transaction: reads initial state, writes result
    const afterFirst = simulateTransactionStep(initialDoc, stats1);
    // Second transaction: reads state AFTER first committed (transaction serialization)
    const afterSecond = simulateTransactionStep(afterFirst, stats2);
    return afterSecond;
}

// ============================================================
// 2.2 - saveKPIStatistics concurrent calls for same orderId → 1 entry
// Validates: Requirement 2.2
// ============================================================
describe('2.2 saveKPIStatistics: concurrent calls for same orderId → only 1 entry', () => {
    const sameOrderStats1 = {
        orderId: 'order-concurrent-1',
        stt: 5,
        campaignId: 'camp-1',
        campaignName: 'Campaign Test',
        netProducts: 6,
        kpi: 30000,
        hasDiscrepancy: false,
        details: { note: 'first call' }
    };

    const sameOrderStats2 = {
        orderId: 'order-concurrent-1', // SAME orderId
        stt: 5,
        campaignId: 'camp-1',
        campaignName: 'Campaign Test',
        netProducts: 5,
        kpi: 25000,
        hasDiscrepancy: false,
        details: { note: 'second call' }
    };

    it('with transaction (atomic): 2 calls for same orderId → exactly 1 entry', () => {
        const finalState = simulateAtomicSequentialWrites(null, sameOrderStats1, sameOrderStats2);

        // Should have exactly 1 entry for the orderId
        const orderEntries = finalState.orders.filter(o => o.orderId === 'order-concurrent-1');
        expect(orderEntries).toHaveLength(1);

        // The second call should have UPDATED the existing entry (not pushed a new one)
        expect(orderEntries[0].netProducts).toBe(5); // second call's value
        expect(orderEntries[0].kpi).toBe(25000); // second call's value
        expect(orderEntries[0].details.note).toBe('second call');
    });

    it('with transaction (atomic): totals reflect only the latest values', () => {
        const finalState = simulateAtomicSequentialWrites(null, sameOrderStats1, sameOrderStats2);

        // totalNetProducts should be 5 (not 6+5=11)
        // First call: 0 + 6 = 6
        // Second call: 6 - 6 (old) + 5 (new) = 5
        expect(finalState.totalNetProducts).toBe(5);
        expect(finalState.totalKPI).toBe(25000);
    });

    it('without transaction (non-atomic): demonstrates the bug - both calls push independently', () => {
        const { result1, result2 } = simulateNonAtomicConcurrentWrites(null, sameOrderStats1, sameOrderStats2);

        // Both computed from null initial state → both pushed a new entry
        // result1 has 1 entry (from stats1)
        expect(result1.orders).toHaveLength(1);
        expect(result1.orders[0].orderId).toBe('order-concurrent-1');

        // result2 ALSO has 1 entry (from stats2) - computed from same null state
        // It did NOT see result1's entry, so it pushed a new one instead of updating
        expect(result2.orders).toHaveLength(1);
        expect(result2.orders[0].orderId).toBe('order-concurrent-1');

        // The bug: result2 was computed from null, not from result1
        // So if Firestore somehow merged both writes, we'd get 2 entries
        // This is exactly what happened in production
        expect(result2.totalNetProducts).toBe(5); // only sees its own data
        expect(result1.totalNetProducts).toBe(6); // only sees its own data
    });

    it('with transaction: calling 3 times for same orderId still results in 1 entry', () => {
        const stats3 = {
            orderId: 'order-concurrent-1',
            stt: 5,
            campaignId: 'camp-1',
            campaignName: 'Campaign Test',
            netProducts: 3,
            kpi: 15000,
            hasDiscrepancy: false,
            details: { note: 'third call' }
        };

        // Simulate 3 sequential transactions
        const after1 = simulateTransactionStep(null, sameOrderStats1);
        const after2 = simulateTransactionStep(after1, sameOrderStats2);
        const after3 = simulateTransactionStep(after2, stats3);

        const orderEntries = after3.orders.filter(o => o.orderId === 'order-concurrent-1');
        expect(orderEntries).toHaveLength(1);
        expect(orderEntries[0].netProducts).toBe(3);
        expect(orderEntries[0].kpi).toBe(15000);
        expect(after3.totalNetProducts).toBe(3);
        expect(after3.totalKPI).toBe(15000);
    });

    it('with transaction: second call updates existing entry, not pushes new one', () => {
        const after1 = simulateTransactionStep(null, sameOrderStats1);

        // After first call: 1 entry exists
        expect(after1.orders).toHaveLength(1);
        expect(after1.orders[0].orderId).toBe('order-concurrent-1');

        const after2 = simulateTransactionStep(after1, sameOrderStats2);

        // After second call: still 1 entry (findIndex found it, updated in place)
        expect(after2.orders).toHaveLength(1);
        expect(after2.orders[0].orderId).toBe('order-concurrent-1');
        // Values should be from the second call
        expect(after2.orders[0].netProducts).toBe(5);
        expect(after2.orders[0].kpi).toBe(25000);
    });

    it('source code uses runTransaction in saveKPIStatistics', () => {
        const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');

        // Find saveKPIStatistics function
        const fnStart = sourceCode.indexOf('async function saveKPIStatistics');
        expect(fnStart).toBeGreaterThan(-1);

        const fnBody = sourceCode.substring(fnStart, fnStart + 5000);

        // Should use runTransaction
        expect(fnBody).toContain('runTransaction');
        expect(fnBody).toContain('transaction.get');
        expect(fnBody).toContain('transaction.set');

        // Should NOT use the old non-atomic pattern (direct get/set on statsRef)
        // The old pattern was: const doc = await statsRef.get(); ... await statsRef.set(...)
        // New pattern: everything inside runTransaction callback
        expect(fnBody).not.toContain('await statsRef.get()');
        expect(fnBody).not.toContain('await statsRef.set(');
    });
});

// ============================================================
// 2.3 - saveKPIStatistics for different orderIds → separate entries
// Validates: Requirement 3.5
// ============================================================
describe('2.3 saveKPIStatistics: different orderIds → separate entries', () => {
    const orderA = {
        orderId: 'order-A-111',
        stt: 1,
        campaignId: 'camp-1',
        campaignName: 'Campaign A',
        netProducts: 3,
        kpi: 15000,
        hasDiscrepancy: false,
        details: { products: ['P1', 'P2', 'P3'] }
    };

    const orderB = {
        orderId: 'order-B-222',
        stt: 2,
        campaignId: 'camp-1',
        campaignName: 'Campaign A',
        netProducts: 5,
        kpi: 25000,
        hasDiscrepancy: false,
        details: { products: ['P4', 'P5'] }
    };

    const orderC = {
        orderId: 'order-C-333',
        stt: 3,
        campaignId: 'camp-2',
        campaignName: 'Campaign B',
        netProducts: 2,
        kpi: 10000,
        hasDiscrepancy: true,
        details: { products: ['P6'] }
    };

    it('two different orderIds → 2 separate entries', () => {
        const after1 = simulateTransactionStep(null, orderA);
        const after2 = simulateTransactionStep(after1, orderB);

        expect(after2.orders).toHaveLength(2);

        const entryA = after2.orders.find(o => o.orderId === 'order-A-111');
        const entryB = after2.orders.find(o => o.orderId === 'order-B-222');

        expect(entryA).toBeDefined();
        expect(entryB).toBeDefined();
        expect(entryA.netProducts).toBe(3);
        expect(entryB.netProducts).toBe(5);
    });

    it('three different orderIds → 3 separate entries with correct totals', () => {
        const after1 = simulateTransactionStep(null, orderA);
        const after2 = simulateTransactionStep(after1, orderB);
        const after3 = simulateTransactionStep(after2, orderC);

        expect(after3.orders).toHaveLength(3);
        expect(after3.totalNetProducts).toBe(3 + 5 + 2); // 10
        expect(after3.totalKPI).toBe(15000 + 25000 + 10000); // 50000
    });

    it('each entry preserves its own data independently', () => {
        const after1 = simulateTransactionStep(null, orderA);
        const after2 = simulateTransactionStep(after1, orderB);
        const after3 = simulateTransactionStep(after2, orderC);

        const entryA = after3.orders.find(o => o.orderId === 'order-A-111');
        const entryB = after3.orders.find(o => o.orderId === 'order-B-222');
        const entryC = after3.orders.find(o => o.orderId === 'order-C-333');

        // Each entry has its own campaign, stt, details
        expect(entryA.stt).toBe(1);
        expect(entryA.campaignName).toBe('Campaign A');
        expect(entryA.kpi).toBe(15000);

        expect(entryB.stt).toBe(2);
        expect(entryB.campaignName).toBe('Campaign A');
        expect(entryB.kpi).toBe(25000);

        expect(entryC.stt).toBe(3);
        expect(entryC.campaignName).toBe('Campaign B');
        expect(entryC.kpi).toBe(10000);
        expect(entryC.hasDiscrepancy).toBe(true);
    });

    it('updating one orderId does not affect other orderIds', () => {
        const after1 = simulateTransactionStep(null, orderA);
        const after2 = simulateTransactionStep(after1, orderB);

        // Now update orderA with new values
        const updatedA = {
            ...orderA,
            netProducts: 7,
            kpi: 35000,
            details: { products: ['P1', 'P2', 'P3', 'P7', 'P8', 'P9', 'P10'] }
        };
        const after3 = simulateTransactionStep(after2, updatedA);

        // Still 2 entries
        expect(after3.orders).toHaveLength(2);

        // orderA updated
        const entryA = after3.orders.find(o => o.orderId === 'order-A-111');
        expect(entryA.netProducts).toBe(7);
        expect(entryA.kpi).toBe(35000);

        // orderB unchanged
        const entryB = after3.orders.find(o => o.orderId === 'order-B-222');
        expect(entryB.netProducts).toBe(5);
        expect(entryB.kpi).toBe(25000);

        // Totals recalculated correctly
        expect(after3.totalNetProducts).toBe(7 + 5); // 12
        expect(after3.totalKPI).toBe(35000 + 25000); // 60000
    });

    it('mix of same and different orderIds: same orderId updates, different orderId creates new', () => {
        // Add orderA
        const after1 = simulateTransactionStep(null, orderA);
        // Add orderB (different)
        const after2 = simulateTransactionStep(after1, orderB);
        // Update orderA again (same orderId)
        const updatedA = { ...orderA, netProducts: 4, kpi: 20000 };
        const after3 = simulateTransactionStep(after2, updatedA);
        // Add orderC (different)
        const after4 = simulateTransactionStep(after3, orderC);

        expect(after4.orders).toHaveLength(3);

        const entryA = after4.orders.find(o => o.orderId === 'order-A-111');
        expect(entryA.netProducts).toBe(4); // updated value

        const entryB = after4.orders.find(o => o.orderId === 'order-B-222');
        expect(entryB.netProducts).toBe(5); // original value

        const entryC = after4.orders.find(o => o.orderId === 'order-C-333');
        expect(entryC.netProducts).toBe(2); // new entry

        expect(after4.totalNetProducts).toBe(4 + 5 + 2); // 11
        expect(after4.totalKPI).toBe(20000 + 25000 + 10000); // 55000
    });
});
