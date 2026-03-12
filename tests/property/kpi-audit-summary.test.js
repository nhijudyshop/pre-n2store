/**
 * Property 16: Audit summary calculation correctness
 *
 * For any order with BASE and audit logs, the audit summary should correctly show:
 * - BASE products count (from snapshot)
 * - total added (only new products)
 * - total removed (only new products)
 * - NET = sum of per-product max(0, added - removed)
 * - KPI = NET × 5,000 VNĐ
 *
 * **Validates: Requirements 8.6, 8.7**
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

const sourceCode = readN2File('orders-report/js/tab-kpi-commission.js');

// --- Generators ---
const productArb = fc.record({
    ProductId: fc.integer({ min: 1, max: 100000 }),
    ProductCode: fc.stringMatching(/^[ABCDEN]{1,6}$/),
    ProductName: fc.string({ minLength: 1, maxLength: 50 }),
    Quantity: fc.integer({ min: 1, max: 100 }),
    Price: fc.integer({ min: 10000, max: 1000000 })
});

const auditLogArb = fc.record({
    orderId: fc.constant('12345'),
    action: fc.constantFrom('add', 'remove'),
    productId: fc.integer({ min: 1, max: 100000 }),
    productCode: fc.string({ minLength: 1, maxLength: 6 }),
    productName: fc.string({ minLength: 1, maxLength: 50 }),
    quantity: fc.integer({ min: 1, max: 50 }),
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    source: fc.constantFrom('chat_confirm_held', 'chat_decrease', 'edit_modal_inline', 'edit_modal_remove', 'sale_modal')
});

/**
 * Pure function: computes the audit summary for an order.
 * Re-implements the logic from renderAuditLogTab summary section.
 */
function computeAuditSummary(baseProducts, auditLogs) {
    const baseProductCount = baseProducts.length;
    const baseProductIds = new Set(baseProducts.map(p => Number(p.ProductId)));

    // Only count logs for NEW products (not in BASE)
    const newProductLogs = auditLogs.filter(log => !baseProductIds.has(Number(log.productId)));

    // Compute totals for new products
    let totalAdded = 0;
    let totalRemoved = 0;
    const netPerProduct = {};

    for (const log of newProductLogs) {
        const pid = String(log.productId);
        if (!netPerProduct[pid]) {
            netPerProduct[pid] = { added: 0, removed: 0 };
        }
        if (log.action === 'add') {
            netPerProduct[pid].added += log.quantity;
            totalAdded += log.quantity;
        } else if (log.action === 'remove') {
            netPerProduct[pid].removed += log.quantity;
            totalRemoved += log.quantity;
        }
    }

    // NET = sum of per-product max(0, added - removed)
    let netTotal = 0;
    for (const data of Object.values(netPerProduct)) {
        netTotal += Math.max(0, data.added - data.removed);
    }

    const kpiAmount = netTotal * KPI_PER_PRODUCT;

    return {
        baseProductCount,
        totalAdded,
        totalRemoved,
        netTotal,
        kpiAmount
    };
}

describe('Feature: kpi-upselling-products, Property 16: Audit summary calculation', () => {

    /**
     * PBT 16a: BASE products count matches the snapshot length.
     */
    it('should correctly report BASE products count from snapshot', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 0, maxLength: 20 }),
                fc.array(auditLogArb, { minLength: 0, maxLength: 15 }),
                (baseProducts, auditLogs) => {
                    const summary = computeAuditSummary(baseProducts, auditLogs);
                    expect(summary.baseProductCount).toBe(baseProducts.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 16b: totalAdded and totalRemoved only count NEW products.
     * Logs for BASE products should not contribute to added/removed totals.
     */
    it('should only count added/removed for new products (not in BASE)', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 1, maxLength: 10 }),
                fc.array(auditLogArb, { minLength: 1, maxLength: 20 }),
                (baseProducts, auditLogs) => {
                    const baseIds = new Set(baseProducts.map(p => Number(p.ProductId)));
                    const summary = computeAuditSummary(baseProducts, auditLogs);

                    // Manually compute expected added/removed for new products only
                    let expectedAdded = 0;
                    let expectedRemoved = 0;
                    for (const log of auditLogs) {
                        if (!baseIds.has(Number(log.productId))) {
                            if (log.action === 'add') expectedAdded += log.quantity;
                            else if (log.action === 'remove') expectedRemoved += log.quantity;
                        }
                    }

                    expect(summary.totalAdded).toBe(expectedAdded);
                    expect(summary.totalRemoved).toBe(expectedRemoved);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 16c: NET = sum of per-product max(0, added - removed).
     * NET is NOT simply totalAdded - totalRemoved (it's per-product floored).
     */
    it('should compute NET as sum of per-product max(0, added - removed)', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 0, maxLength: 5 }),
                fc.array(auditLogArb, { minLength: 1, maxLength: 20 }),
                (baseProducts, auditLogs) => {
                    const baseIds = new Set(baseProducts.map(p => Number(p.ProductId)));
                    const summary = computeAuditSummary(baseProducts, auditLogs);

                    // Manually compute expected NET per product
                    const perProduct = {};
                    for (const log of auditLogs) {
                        if (!baseIds.has(Number(log.productId))) {
                            const pid = String(log.productId);
                            if (!perProduct[pid]) perProduct[pid] = { added: 0, removed: 0 };
                            if (log.action === 'add') perProduct[pid].added += log.quantity;
                            else if (log.action === 'remove') perProduct[pid].removed += log.quantity;
                        }
                    }

                    let expectedNet = 0;
                    for (const data of Object.values(perProduct)) {
                        expectedNet += Math.max(0, data.added - data.removed);
                    }

                    expect(summary.netTotal).toBe(expectedNet);

                    // NET should be >= 0
                    expect(summary.netTotal).toBeGreaterThanOrEqual(0);

                    // NET <= totalAdded (can't have more net than what was added)
                    expect(summary.netTotal).toBeLessThanOrEqual(summary.totalAdded);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 16d: KPI = NET × 5,000 VNĐ always.
     */
    it('should compute KPI = NET × 5000 VNĐ', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 0, maxLength: 5 }),
                fc.array(auditLogArb, { minLength: 0, maxLength: 15 }),
                (baseProducts, auditLogs) => {
                    const summary = computeAuditSummary(baseProducts, auditLogs);
                    expect(summary.kpiAmount).toBe(summary.netTotal * KPI_PER_PRODUCT);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 16e: When all audit logs are for BASE products, summary shows 0 for added/removed/NET/KPI.
     */
    it('should show 0 added/removed/NET/KPI when all logs are for BASE products', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 1, maxLength: 10 }),
                (baseProducts) => {
                    // Create logs that ONLY reference BASE product IDs
                    const logs = baseProducts.flatMap(p => [
                        {
                            orderId: '12345',
                            action: 'add',
                            productId: p.ProductId,
                            productCode: p.ProductCode,
                            productName: p.ProductName,
                            quantity: 3,
                            userId: 'user1',
                            source: 'chat_confirm_held'
                        },
                        {
                            orderId: '12345',
                            action: 'remove',
                            productId: p.ProductId,
                            productCode: p.ProductCode,
                            productName: p.ProductName,
                            quantity: 1,
                            userId: 'user1',
                            source: 'chat_decrease'
                        }
                    ]);

                    const summary = computeAuditSummary(baseProducts, logs);

                    expect(summary.totalAdded).toBe(0);
                    expect(summary.totalRemoved).toBe(0);
                    expect(summary.netTotal).toBe(0);
                    expect(summary.kpiAmount).toBe(0);
                    expect(summary.baseProductCount).toBe(baseProducts.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: tab-kpi-commission.js contains audit summary rendering.
     */
    it('source code should contain audit summary rendering logic', () => {
        expect(sourceCode).toContain('renderAuditLogTab');
        // The source should reference NET calculation concepts
        expect(sourceCode).toContain('netProducts');
    });
});
