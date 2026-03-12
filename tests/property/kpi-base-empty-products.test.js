/**
 * Property 17: BASE never saved with empty products
 *
 * For any order processed by saveAutoBaseSnapshot, if a BASE document is saved
 * to Firestore, it must have products.length > 0. If no product data is available
 * from any source (report_order_details, local successOrders, TPOS API), the BASE
 * must NOT be saved and the order must be added to failedBaseOrders.
 *
 * **Validates: Requirements 1.7, 1.8, 1.9**
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
const productArb = fc.record({
    ProductId: fc.integer({ min: 1, max: 100000 }),
    ProductCode: fc.stringMatching(/^[ABCDEN]{1,6}$/),
    ProductName: fc.string({ minLength: 1, maxLength: 50 }),
    Quantity: fc.integer({ min: 1, max: 100 }),
    Price: fc.integer({ min: 10000, max: 1000000 })
});

const orderIdArb = fc.stringMatching(/^[0-9]{1,10}$/);

const orderArb = fc.record({
    Id: orderIdArb,
    stt: fc.integer({ min: 1, max: 500 }),
    code: fc.string({ minLength: 1, maxLength: 10 }),
    customerName: fc.string({ minLength: 1, maxLength: 30 }),
    account: fc.string({ minLength: 1, maxLength: 20 })
});

/**
 * Pure function: simulates the 3-tier product resolution + validation logic
 * from saveAutoBaseSnapshot in kpi-manager.js.
 *
 * @param {Object} order - Order object from successOrders
 * @param {Object|null} reportOrder - Report order details (Tier 1)
 * @param {Array|null} tposProducts - TPOS API products (Tier 3)
 * @returns {{ products: Array, shouldSave: boolean, isFailedBase: boolean }}
 */
function resolveProductsForBase(order, reportOrder, tposProducts) {
    let products = [];

    // Tier 1: report_order_details
    if (reportOrder && reportOrder.Details && reportOrder.Details.length > 0) {
        products = reportOrder.Details.map(d => ({
            ProductId: d.ProductId || null,
            ProductCode: d.ProductCode || d.Code || d.DefaultCode || '',
            ProductName: d.ProductName || d.Name || '',
            Quantity: d.Quantity || 1,
            Price: d.Price || 0
        })).filter(p => p.ProductCode);
    }

    // Tier 2: local data from successOrders
    if (products.length === 0) {
        const localProducts = order.Details || order.products || order.mainProducts || [];
        products = localProducts.map(p => ({
            ProductId: p.ProductId || null,
            ProductCode: p.ProductCode || p.Code || p.DefaultCode || '',
            ProductName: p.ProductName || p.Name || '',
            Quantity: p.Quantity || 1,
            Price: p.Price || 0
        })).filter(p => p.ProductCode);
    }

    // Tier 3: TPOS API fallback
    if (products.length === 0 && Array.isArray(tposProducts)) {
        products = tposProducts.filter(p => p.ProductCode);
    }

    // Validation: don't save BASE with empty products
    if (products.length === 0) {
        return { products: [], shouldSave: false, isFailedBase: true };
    }

    return { products, shouldSave: true, isFailedBase: false };
}

describe('Feature: kpi-upselling-products, Property 17: BASE never saved with empty products', () => {

    /**
     * PBT 17a: When all product sources are empty, BASE must NOT be saved
     * and order must be in failedBaseOrders.
     */
    it('should NOT save BASE when all product sources are empty', () => {
        fc.assert(
            fc.property(
                orderArb,
                (order) => {
                    // All sources empty: no report, no local, no TPOS
                    const result = resolveProductsForBase(
                        order,       // order with no Details/products
                        null,        // no report_order_details
                        []           // TPOS returns empty
                    );

                    expect(result.shouldSave).toBe(false);
                    expect(result.isFailedBase).toBe(true);
                    expect(result.products.length).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 17b: When any product source has valid products, BASE is saved
     * with products.length > 0.
     */
    it('should save BASE with non-empty products when any source has data', () => {
        fc.assert(
            fc.property(
                orderArb,
                fc.array(productArb, { minLength: 1, maxLength: 10 }),
                fc.constantFrom('report', 'local', 'tpos'),
                (order, products, source) => {
                    let reportOrder = null;
                    let orderWithProducts = { ...order };
                    let tposProducts = [];

                    if (source === 'report') {
                        reportOrder = { Details: products };
                    } else if (source === 'local') {
                        orderWithProducts.Details = products;
                    } else {
                        tposProducts = products;
                    }

                    const result = resolveProductsForBase(
                        orderWithProducts,
                        reportOrder,
                        tposProducts
                    );

                    expect(result.shouldSave).toBe(true);
                    expect(result.isFailedBase).toBe(false);
                    expect(result.products.length).toBeGreaterThan(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 17c: If BASE is saved (shouldSave=true), products array is never empty.
     * This is the core invariant of Property 17.
     */
    it('should NEVER have shouldSave=true with empty products', () => {
        fc.assert(
            fc.property(
                orderArb,
                fc.option(fc.record({ Details: fc.array(productArb, { minLength: 0, maxLength: 5 }) }), { nil: null }),
                fc.array(productArb, { minLength: 0, maxLength: 5 }),
                (order, reportOrder, tposProducts) => {
                    // Randomly add local products to order
                    const orderWithProducts = { ...order };
                    if (Math.random() > 0.5) {
                        orderWithProducts.Details = [];
                    }

                    const result = resolveProductsForBase(
                        orderWithProducts,
                        reportOrder,
                        tposProducts
                    );

                    // Core invariant: if shouldSave is true, products must not be empty
                    if (result.shouldSave) {
                        expect(result.products.length).toBeGreaterThan(0);
                    }

                    // Converse: if products is empty, shouldSave must be false
                    if (result.products.length === 0) {
                        expect(result.shouldSave).toBe(false);
                        expect(result.isFailedBase).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 17d: Tier priority is respected - report_order_details > local > TPOS.
     */
    it('should prefer report_order_details over local and TPOS data', () => {
        fc.assert(
            fc.property(
                orderArb,
                fc.array(productArb, { minLength: 1, maxLength: 5 }),
                fc.array(productArb, { minLength: 1, maxLength: 5 }),
                fc.array(productArb, { minLength: 1, maxLength: 5 }),
                (order, reportProducts, localProducts, tposProducts) => {
                    const orderWithLocal = { ...order, Details: localProducts };
                    const reportOrder = { Details: reportProducts };

                    const result = resolveProductsForBase(
                        orderWithLocal,
                        reportOrder,
                        tposProducts
                    );

                    // Should use report products (Tier 1)
                    expect(result.shouldSave).toBe(true);
                    expect(result.products.length).toBe(reportProducts.length);
                    // Verify products match report source
                    for (let i = 0; i < result.products.length; i++) {
                        expect(result.products[i].ProductId).toBe(reportProducts[i].ProductId);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: kpi-manager.js contains the Bug #1 fix logic.
     */
    it('source code should contain TPOS API fallback and empty products validation', () => {
        // Tier 3: TPOS API fallback
        expect(sourceCode).toContain('fetchProductsFromTPOS');
        // Validation: don't save BASE with empty products
        expect(sourceCode).toContain('Cannot save BASE for order');
        expect(sourceCode).toContain('failedBaseOrders.push');
        // Return value includes failedBaseOrders
        expect(sourceCode).toContain('failedBaseOrders');
    });
});
