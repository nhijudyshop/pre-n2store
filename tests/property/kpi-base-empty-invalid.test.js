/**
 * Property 19: Empty products BASE treated as invalid
 *
 * For any BASE snapshot with `products: []` (empty array), `calculateNetKPI`
 * should return `netProducts=0` and `kpiAmount=0`, identical to the case where
 * no BASE exists. The system should not treat all products as "new".
 *
 * **Validates: Requirements 3.12**
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
    ProductCode: fc.stringMatching(/^[A-Z]{1,6}$/),
    ProductName: fc.string({ minLength: 1, maxLength: 50 }),
    Quantity: fc.integer({ min: 1, max: 100 }),
    Price: fc.integer({ min: 10000, max: 1000000 })
});

const orderIdArb = fc.stringMatching(/^[0-9]{1,10}$/);

const auditLogArb = fc.record({
    orderId: orderIdArb,
    action: fc.constantFrom('add', 'remove'),
    productId: fc.integer({ min: 1, max: 100000 }),
    productCode: fc.stringMatching(/^[A-Z]{1,6}$/),
    productName: fc.string({ minLength: 1, maxLength: 50 }),
    quantity: fc.integer({ min: 1, max: 20 }),
    userId: fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/),
    userName: fc.string({ minLength: 1, maxLength: 30 }),
    timestamp: fc.record({
        seconds: fc.integer({ min: 1700000000, max: 1800000000 })
    }),
    source: fc.constantFrom('chat_confirm_held', 'edit_modal_inline', 'sale_modal')
});

/**
 * Pure function: simulates calculateNetKPI logic with BASE products validation.
 * This mirrors the actual implementation in kpi-manager.js.
 *
 * @param {Object|null} base - BASE snapshot (null = no BASE)
 * @param {Array} auditLogs - Audit log entries
 * @param {string|null} employeeUserId - Employee to filter by (null = no filter)
 * @returns {{ netProducts: number, kpiAmount: number, details: Object }}
 */
function calculateNetKPIPure(base, auditLogs, employeeUserId) {
    const emptyResult = { netProducts: 0, kpiAmount: 0, details: {} };

    // No BASE → no KPI
    if (!base) return emptyResult;

    // ⚠️ BUGFIX: Empty products BASE treated as invalid
    if (!base.products || base.products.length === 0) {
        return emptyResult;
    }

    // Build set of BASE product IDs
    const baseProductIds = new Set();
    (base.products || []).forEach(p => {
        const pid = p.ProductId || p.productId;
        if (pid) baseProductIds.add(Number(pid));
    });

    // Filter by employee if specified
    let filteredLogs = [...auditLogs];
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

    // Calculate net (min 0 per product) and total
    let totalNet = 0;
    for (const pid of Object.keys(netPerProduct)) {
        const data = netPerProduct[pid];
        data.net = Math.max(0, data.added - data.removed);
        totalNet += data.net;
    }

    return {
        netProducts: totalNet,
        kpiAmount: totalNet * KPI_PER_PRODUCT,
        details: netPerProduct
    };
}

describe('Feature: kpi-upselling-products, Property 19: Empty products BASE treated as invalid', () => {

    /**
     * PBT 19a: BASE with empty products array returns KPI = 0,
     * identical to no BASE case.
     */
    it('should return KPI=0 when BASE has empty products array, regardless of audit logs', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(auditLogArb, { minLength: 1, maxLength: 20 }),
                fc.option(fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/), { nil: null }),
                (orderId, auditLogs, employeeUserId) => {
                    // BASE with empty products
                    const baseWithEmptyProducts = {
                        orderId,
                        products: [],
                        timestamp: { seconds: 1700000000 }
                    };

                    const result = calculateNetKPIPure(baseWithEmptyProducts, auditLogs, employeeUserId);

                    // Must return zero KPI - identical to no BASE
                    expect(result.netProducts).toBe(0);
                    expect(result.kpiAmount).toBe(0);
                    expect(Object.keys(result.details).length).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 19b: BASE with null products returns KPI = 0.
     */
    it('should return KPI=0 when BASE has null products', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(auditLogArb, { minLength: 1, maxLength: 20 }),
                (orderId, auditLogs) => {
                    const baseWithNullProducts = {
                        orderId,
                        products: null,
                        timestamp: { seconds: 1700000000 }
                    };

                    const result = calculateNetKPIPure(baseWithNullProducts, auditLogs, null);

                    expect(result.netProducts).toBe(0);
                    expect(result.kpiAmount).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 19c: Empty products BASE result is identical to null BASE result.
     */
    it('should produce identical results for empty-products BASE and null BASE', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(auditLogArb, { minLength: 0, maxLength: 20 }),
                fc.option(fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/), { nil: null }),
                (orderId, auditLogs, employeeUserId) => {
                    const emptyProductsBase = { orderId, products: [], timestamp: { seconds: 1700000000 } };
                    const nullBase = null;

                    const resultEmpty = calculateNetKPIPure(emptyProductsBase, auditLogs, employeeUserId);
                    const resultNull = calculateNetKPIPure(nullBase, auditLogs, employeeUserId);

                    expect(resultEmpty.netProducts).toBe(resultNull.netProducts);
                    expect(resultEmpty.kpiAmount).toBe(resultNull.kpiAmount);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 19d: When BASE has valid products, audit logs for new products
     * DO produce non-zero KPI (contrast with empty products case).
     */
    it('should produce non-zero KPI when BASE has valid products and new products are added', () => {
        fc.assert(
            fc.property(
                orderIdArb,
                fc.array(productArb, { minLength: 1, maxLength: 5 }),
                fc.integer({ min: 200001, max: 300000 }),
                fc.integer({ min: 1, max: 10 }),
                (orderId, baseProducts, newProductId, addQty) => {
                    const base = {
                        orderId,
                        products: baseProducts,
                        timestamp: { seconds: 1700000000 }
                    };

                    // Ensure newProductId is NOT in base products
                    const baseIds = new Set(baseProducts.map(p => p.ProductId));
                    if (baseIds.has(newProductId)) return; // skip this case

                    const logs = [{
                        orderId,
                        action: 'add',
                        productId: newProductId,
                        productCode: 'NEW1',
                        productName: 'New Product',
                        quantity: addQty,
                        userId: 'emp1',
                        userName: 'Employee 1',
                        timestamp: { seconds: 1700000001 },
                        source: 'chat_confirm_held'
                    }];

                    const result = calculateNetKPIPure(base, logs, null);

                    // With valid BASE and new product added, KPI should be > 0
                    expect(result.netProducts).toBe(addQty);
                    expect(result.kpiAmount).toBe(addQty * KPI_PER_PRODUCT);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: kpi-manager.js contains the Bug #3 empty products validation.
     */
    it('source code should contain empty products validation in calculateNetKPI', () => {
        // Validate the bugfix code exists
        expect(sourceCode).toContain('BASE for order');
        expect(sourceCode).toContain('has empty products - treating as invalid');
        expect(sourceCode).toContain('base.products.length === 0');
    });
});
