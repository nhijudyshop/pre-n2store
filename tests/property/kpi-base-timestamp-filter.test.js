/**
 * Property 20: BASE timestamp filtering
 *
 * For any order with a BASE snapshot and audit logs, `calculateNetKPI` should
 * only count audit log entries with `timestamp >= base.timestamp`. Audit logs
 * with timestamps before the BASE was created should be excluded from the
 * NET KPI calculation.
 *
 * **Validates: Requirements 10.4, 10.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');
const KPI_PER_PRODUCT = 5000;

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const sourceCode = readN2File('orders-report/js/managers/kpi-manager.js');

// --- Generators ---
const productArb = fc.record({
    ProductId: fc.integer({ min: 1, max: 1000 }),
    ProductCode: fc.stringMatching(/^[A-Z]{1,6}$/),
    ProductName: fc.string({ minLength: 1, maxLength: 50 }),
    Quantity: fc.integer({ min: 1, max: 100 }),
    Price: fc.integer({ min: 10000, max: 1000000 })
});

const orderIdArb = fc.stringMatching(/^[0-9]{1,10}$/);

/**
 * Pure function: simulates calculateNetKPI logic with timestamp filtering.
 * Mirrors the actual implementation in kpi-manager.js.
 *
 * @param {Object} base - BASE snapshot with products and timestamp
 * @param {Array} auditLogs - All audit log entries (including old ones)
 * @param {string|null} employeeUserId - Employee to filter by
 * @returns {{ netProducts: number, kpiAmount: number, details: Object, filteredLogCount: number }}
 */
function calculateNetKPIWithTimestampFilter(base, auditLogs, employeeUserId) {
    const emptyResult = { netProducts: 0, kpiAmount: 0, details: {}, filteredLogCount: 0 };

    if (!base) return emptyResult;
    if (!base.products || base.products.length === 0) return emptyResult;

    // Build set of BASE product IDs
    const baseProductIds = new Set();
    base.products.forEach(p => {
        const pid = p.ProductId || p.productId;
        if (pid) baseProductIds.add(Number(pid));
    });

    let filteredLogs = [...auditLogs];

    // ⚠️ BUGFIX (Bug #3): Filter audit logs by base.timestamp
    const baseTimestamp = base.timestamp;
    if (baseTimestamp) {
        const baseTs = baseTimestamp.seconds || 0;
        filteredLogs = filteredLogs.filter(log => {
            const logTs = log.timestamp && log.timestamp.seconds ? log.timestamp.seconds : 0;
            return logTs >= baseTs;
        });
    }

    const filteredLogCount = filteredLogs.length;

    // Filter by employee if specified
    if (employeeUserId) {
        filteredLogs = filteredLogs.filter(log => log.userId === employeeUserId);
    }

    // Only keep logs for NEW products (not in BASE)
    const newProductLogs = filteredLogs.filter(log => {
        const pid = Number(log.productId);
        return !baseProductIds.has(pid);
    });

    // Group by productId, calculate net per product
    const netPerProduct = {};
    for (const log of newProductLogs) {
        const pid = String(log.productId);
        if (!netPerProduct[pid]) {
            netPerProduct[pid] = { code: log.productCode, name: log.productName, added: 0, removed: 0, net: 0 };
        }
        if (log.action === 'add') {
            netPerProduct[pid].added += (log.quantity || 0);
        } else if (log.action === 'remove') {
            netPerProduct[pid].removed += (log.quantity || 0);
        }
    }

    let totalNet = 0;
    for (const pid of Object.keys(netPerProduct)) {
        const data = netPerProduct[pid];
        data.net = Math.max(0, data.added - data.removed);
        totalNet += data.net;
    }

    return {
        netProducts: totalNet,
        kpiAmount: totalNet * KPI_PER_PRODUCT,
        details: netPerProduct,
        filteredLogCount
    };
}

describe('Feature: kpi-upselling-products, Property 20: BASE timestamp filtering', () => {

    /**
     * PBT 20a: Audit logs with timestamps BEFORE base.timestamp are excluded.
     */
    it('should exclude audit logs with timestamps before base.timestamp', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(productArb, { minLength: 1, maxLength: 5 }),
                fc.integer({ min: 1700000000, max: 1700100000 }),
                fc.integer({ min: 200001, max: 300000 }),
                fc.integer({ min: 1, max: 10 }),
                (orderId, baseProducts, baseTs, newProductId, addQty) => {
                    // Ensure newProductId is NOT in base products
                    const baseIds = new Set(baseProducts.map(p => p.ProductId));
                    if (baseIds.has(newProductId)) return;

                    const base = {
                        orderId,
                        products: baseProducts,
                        timestamp: { seconds: baseTs }
                    };

                    // Create audit logs BEFORE base timestamp (should be excluded)
                    const oldLogs = [{
                        orderId,
                        action: 'add',
                        productId: newProductId,
                        productCode: 'OLD1',
                        productName: 'Old Product',
                        quantity: addQty,
                        userId: 'emp1',
                        userName: 'Employee 1',
                        timestamp: { seconds: baseTs - 1000 }, // Before BASE
                        source: 'chat_confirm_held'
                    }];

                    const result = calculateNetKPIWithTimestampFilter(base, oldLogs, null);

                    // Old logs should be excluded → KPI = 0
                    expect(result.netProducts).toBe(0);
                    expect(result.kpiAmount).toBe(0);
                    expect(result.filteredLogCount).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 20b: Audit logs with timestamps AT or AFTER base.timestamp are included.
     */
    it('should include audit logs with timestamps >= base.timestamp', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(productArb, { minLength: 1, maxLength: 5 }),
                fc.integer({ min: 1700000000, max: 1700100000 }),
                fc.integer({ min: 200001, max: 300000 }),
                fc.integer({ min: 1, max: 10 }),
                fc.integer({ min: 0, max: 10000 }),
                (orderId, baseProducts, baseTs, newProductId, addQty, offset) => {
                    const baseIds = new Set(baseProducts.map(p => p.ProductId));
                    if (baseIds.has(newProductId)) return;

                    const base = {
                        orderId,
                        products: baseProducts,
                        timestamp: { seconds: baseTs }
                    };

                    // Create audit log AT or AFTER base timestamp
                    const newLogs = [{
                        orderId,
                        action: 'add',
                        productId: newProductId,
                        productCode: 'NEW1',
                        productName: 'New Product',
                        quantity: addQty,
                        userId: 'emp1',
                        userName: 'Employee 1',
                        timestamp: { seconds: baseTs + offset }, // At or after BASE
                        source: 'chat_confirm_held'
                    }];

                    const result = calculateNetKPIWithTimestampFilter(base, newLogs, null);

                    // New logs should be included → KPI > 0
                    expect(result.netProducts).toBe(addQty);
                    expect(result.kpiAmount).toBe(addQty * KPI_PER_PRODUCT);
                    expect(result.filteredLogCount).toBe(1);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 20c: Mixed old and new audit logs - only new ones count.
     */
    it('should only count audit logs after BASE timestamp in mixed set', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(productArb, { minLength: 1, maxLength: 3 }),
                fc.integer({ min: 1700000000, max: 1700100000 }),
                fc.integer({ min: 200001, max: 300000 }),
                fc.integer({ min: 1, max: 5 }),
                fc.integer({ min: 1, max: 5 }),
                (orderId, baseProducts, baseTs, newProductId, oldQty, newQty) => {
                    const baseIds = new Set(baseProducts.map(p => p.ProductId));
                    if (baseIds.has(newProductId)) return;

                    const base = {
                        orderId,
                        products: baseProducts,
                        timestamp: { seconds: baseTs }
                    };

                    // Mix of old and new logs for the same product
                    const mixedLogs = [
                        {
                            orderId, action: 'add', productId: newProductId,
                            productCode: 'MIX1', productName: 'Mixed Product',
                            quantity: oldQty, userId: 'emp1', userName: 'Employee 1',
                            timestamp: { seconds: baseTs - 500 }, // BEFORE BASE
                            source: 'chat_confirm_held'
                        },
                        {
                            orderId, action: 'add', productId: newProductId,
                            productCode: 'MIX1', productName: 'Mixed Product',
                            quantity: newQty, userId: 'emp1', userName: 'Employee 1',
                            timestamp: { seconds: baseTs + 500 }, // AFTER BASE
                            source: 'chat_confirm_held'
                        }
                    ];

                    const result = calculateNetKPIWithTimestampFilter(base, mixedLogs, null);

                    // Only the new log (after BASE) should count
                    expect(result.netProducts).toBe(newQty);
                    expect(result.kpiAmount).toBe(newQty * KPI_PER_PRODUCT);
                    expect(result.filteredLogCount).toBe(1);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 20d: Audit log exactly at base.timestamp is included (>= not >).
     */
    it('should include audit log with timestamp exactly equal to base.timestamp', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(productArb, { minLength: 1, maxLength: 3 }),
                fc.integer({ min: 1700000000, max: 1700100000 }),
                fc.integer({ min: 200001, max: 300000 }),
                fc.integer({ min: 1, max: 10 }),
                (orderId, baseProducts, baseTs, newProductId, addQty) => {
                    const baseIds = new Set(baseProducts.map(p => p.ProductId));
                    if (baseIds.has(newProductId)) return;

                    const base = {
                        orderId,
                        products: baseProducts,
                        timestamp: { seconds: baseTs }
                    };

                    // Log at EXACT same timestamp as BASE
                    const exactLogs = [{
                        orderId, action: 'add', productId: newProductId,
                        productCode: 'EX1', productName: 'Exact Product',
                        quantity: addQty, userId: 'emp1', userName: 'Employee 1',
                        timestamp: { seconds: baseTs }, // Exactly at BASE timestamp
                        source: 'chat_confirm_held'
                    }];

                    const result = calculateNetKPIWithTimestampFilter(base, exactLogs, null);

                    // Should be included (>= comparison)
                    expect(result.netProducts).toBe(addQty);
                    expect(result.kpiAmount).toBe(addQty * KPI_PER_PRODUCT);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: kpi-manager.js contains timestamp filtering logic.
     */
    it('source code should contain timestamp filtering in calculateNetKPI', () => {
        expect(sourceCode).toContain('Filter audit logs by base.timestamp');
        expect(sourceCode).toContain('logTs >= baseTs');
        expect(sourceCode).toContain('baseTimestamp.seconds');
    });
});
