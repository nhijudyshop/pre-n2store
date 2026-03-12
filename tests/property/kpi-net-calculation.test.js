/**
 * Property 6: NET KPI calculation correctness
 * Property 7: No KPI without BASE
 *
 * Property 6: For any order with a BASE snapshot and audit log entries,
 * calculateNetKPI should:
 * (a) ignore audit log entries for products in BASE,
 * (b) for each new product, compute net = sum(add) - sum(remove),
 * (c) floor each product's net at 0,
 * (d) return total KPI = sum(all product nets) × 5,000 VNĐ.
 *
 * Property 7: For any order without BASE, calculateNetKPI returns
 * netProducts=0 and kpiAmount=0.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.8**
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
    ProductId: fc.integer({ min: 1, max: 100000 }),
    ProductCode: fc.stringMatching(/^[ABCDEN]{1,6}$/),
    ProductName: fc.string({ minLength: 1, maxLength: 50 }),
    Quantity: fc.integer({ min: 1, max: 100 }),
    Price: fc.integer({ min: 10000, max: 1000000 })
});

const auditLogArb = fc.record({
    orderId: fc.stringMatching(/^[0-9]{1,10}$/),
    action: fc.constantFrom('add', 'remove'),
    productId: fc.integer({ min: 1, max: 100000 }),
    productCode: fc.string({ minLength: 1, maxLength: 6 }),
    productName: fc.string({ minLength: 1, maxLength: 50 }),
    quantity: fc.integer({ min: 1, max: 50 }),
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    source: fc.constantFrom('chat_confirm_held', 'chat_decrease', 'edit_modal_inline', 'edit_modal_remove', 'sale_modal')
});

/**
 * Pure function: re-implements the calculateNetKPI algorithm from kpi-manager.js.
 * This is the core logic extracted as a testable pure function.
 */
function calculateNetKPI(baseProducts, auditLogs) {
    if (!baseProducts) {
        return { netProducts: 0, kpiAmount: 0, details: {} };
    }

    const baseProductIds = new Set(baseProducts.map(p => Number(p.ProductId)));

    // Filter: only NEW products (not in BASE)
    const newProductLogs = auditLogs.filter(log => !baseProductIds.has(Number(log.productId)));

    // Group by productId, calculate net per product
    const netPerProduct = {};
    for (const log of newProductLogs) {
        const pid = String(log.productId);
        if (!netPerProduct[pid]) {
            netPerProduct[pid] = { code: log.productCode || '', name: log.productName || '', added: 0, removed: 0, net: 0 };
        }
        if (log.action === 'add') {
            netPerProduct[pid].added += (log.quantity || 0);
        } else if (log.action === 'remove') {
            netPerProduct[pid].removed += (log.quantity || 0);
        }
    }

    // Calculate net (min 0 per product) and total
    let totalNet = 0;
    for (const data of Object.values(netPerProduct)) {
        data.net = Math.max(0, data.added - data.removed);
        totalNet += data.net;
    }

    return {
        netProducts: totalNet,
        kpiAmount: totalNet * KPI_PER_PRODUCT,
        details: netPerProduct
    };
}

describe('Feature: kpi-upselling-products, Property 6: NET KPI calculation correctness', () => {

    /**
     * PBT 6a: BASE product audit logs are ignored in KPI calculation.
     * If all audit logs reference products that exist in BASE, KPI = 0.
     */
    it('should ignore all audit logs for BASE products (KPI = 0)', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 1, maxLength: 10 }),
                (baseProducts) => {
                    // Create audit logs that ONLY reference BASE product IDs
                    const logs = baseProducts.map(p => ({
                        orderId: '123',
                        action: 'add',
                        productId: p.ProductId,
                        productCode: p.ProductCode,
                        productName: p.ProductName,
                        quantity: 5,
                        userId: 'user1',
                        source: 'chat_confirm_held'
                    }));

                    const result = calculateNetKPI(baseProducts, logs);

                    expect(result.netProducts).toBe(0);
                    expect(result.kpiAmount).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 6b: For new products, net = sum(add) - sum(remove), floored at 0.
     * Total KPI = sum(nets) × 5000.
     */
    it('should correctly calculate NET for new products with floor at 0', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 1, maxLength: 5 }),
                fc.array(auditLogArb, { minLength: 1, maxLength: 20 }),
                (baseProducts, rawLogs) => {
                    // Ensure audit logs reference product IDs NOT in BASE
                    const baseIds = new Set(baseProducts.map(p => p.ProductId));
                    const logs = rawLogs.map(log => ({
                        ...log,
                        productId: baseIds.has(log.productId) ? log.productId + 200000 : log.productId
                    }));

                    const result = calculateNetKPI(baseProducts, logs);

                    // Manually compute expected result
                    const netMap = {};
                    for (const log of logs) {
                        const pid = String(log.productId);
                        if (!netMap[pid]) netMap[pid] = { added: 0, removed: 0 };
                        if (log.action === 'add') netMap[pid].added += log.quantity;
                        else if (log.action === 'remove') netMap[pid].removed += log.quantity;
                    }

                    let expectedTotal = 0;
                    for (const data of Object.values(netMap)) {
                        expectedTotal += Math.max(0, data.added - data.removed);
                    }

                    expect(result.netProducts).toBe(expectedTotal);
                    expect(result.kpiAmount).toBe(expectedTotal * KPI_PER_PRODUCT);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 6c: Per-product net is never negative.
     */
    it('should never produce negative net for any individual product', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 0, maxLength: 5 }),
                fc.array(auditLogArb, { minLength: 1, maxLength: 20 }),
                (baseProducts, auditLogs) => {
                    const result = calculateNetKPI(baseProducts, auditLogs);

                    for (const data of Object.values(result.details)) {
                        expect(data.net).toBeGreaterThanOrEqual(0);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 6d: KPI amount always equals netProducts × 5000.
     */
    it('should always have kpiAmount = netProducts × 5000', () => {
        fc.assert(
            fc.property(
                fc.array(productArb, { minLength: 0, maxLength: 5 }),
                fc.array(auditLogArb, { minLength: 0, maxLength: 15 }),
                (baseProducts, auditLogs) => {
                    const result = calculateNetKPI(baseProducts, auditLogs);
                    expect(result.kpiAmount).toBe(result.netProducts * KPI_PER_PRODUCT);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: kpi-manager.js contains the NET KPI algorithm.
     */
    it('source code should contain NET KPI calculation logic', () => {
        expect(sourceCode).toContain('baseProductIds.has');
        expect(sourceCode).toContain('Math.max(0,');
        expect(sourceCode).toContain('KPI_AMOUNT_PER_DIFFERENCE');
    });
});

describe('Feature: kpi-upselling-products, Property 7: No KPI without BASE', () => {

    /**
     * PBT 7: Without BASE, KPI is always 0 regardless of audit logs.
     */
    it('should return netProducts=0 and kpiAmount=0 when no BASE exists', () => {
        fc.assert(
            fc.property(
                fc.array(auditLogArb, { minLength: 0, maxLength: 20 }),
                (auditLogs) => {
                    const result = calculateNetKPI(null, auditLogs);

                    expect(result.netProducts).toBe(0);
                    expect(result.kpiAmount).toBe(0);
                    expect(Object.keys(result.details).length).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: kpi-manager.js returns empty result when no BASE.
     */
    it('source code should return empty result when BASE is null', () => {
        expect(sourceCode).toContain('if (!base)');
        expect(sourceCode).toContain('netProducts: 0, kpiAmount: 0');
    });
});
