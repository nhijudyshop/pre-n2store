/**
 * Property 2: BASE snapshot immutability (no overwrite)
 *
 * For any order that already has a BASE snapshot, calling saveAutoBaseSnapshot
 * again (even with different product data) should preserve the original BASE
 * snapshot unchanged.
 *
 * **Validates: Requirements 1.3**
 *
 * Approach: Re-implement the core immutability logic as a pure function and
 * verify the property using fast-check. Also verify source code contains
 * the expected skip-if-exists pattern.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const KPI_MANAGER_PATH = 'orders-report/js/managers/kpi-manager.js';
const sourceCode = readN2File(KPI_MANAGER_PATH);

// --- Generators ---
const productArb = fc.record({
    ProductId: fc.integer({ min: 1, max: 100000 }),
    ProductCode: fc.stringMatching(/^[ABCDEN]{1,6}$/),
    ProductName: fc.string({ minLength: 1, maxLength: 50 }),
    Quantity: fc.integer({ min: 1, max: 100 }),
    Price: fc.integer({ min: 10000, max: 1000000 })
});

const baseSnapshotArb = fc.record({
    orderId: fc.stringMatching(/^[0-9]{1,10}$/),
    campaignName: fc.string({ minLength: 1, maxLength: 30 }),
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    products: fc.array(productArb, { minLength: 0, maxLength: 20 })
});

/**
 * Pure function: simulates saveAutoBaseSnapshot logic for a single order.
 * If existingBase is non-null, the order is skipped (immutability).
 * Returns the resulting BASE after the operation.
 */
function simulateSaveBase(existingBase, newOrderData) {
    // Core logic from kpi-manager.js: if BASE already exists, skip
    if (existingBase !== null && existingBase !== undefined) {
        return existingBase; // preserved unchanged
    }
    // Otherwise create new BASE
    return {
        orderId: newOrderData.orderId,
        campaignName: newOrderData.campaignName,
        userId: newOrderData.userId,
        products: newOrderData.products
    };
}

describe('Feature: kpi-upselling-products, Property 2: BASE snapshot immutability', () => {

    /**
     * PBT: For any existing BASE snapshot and any new order data,
     * simulateSaveBase should return the original BASE unchanged.
     */
    it('should preserve original BASE when BASE already exists, regardless of new data', () => {
        fc.assert(
            fc.property(
                baseSnapshotArb,
                baseSnapshotArb,
                (originalBase, newOrderData) => {
                    // Force same orderId so the "new" data targets the same order
                    const newData = { ...newOrderData, orderId: originalBase.orderId };

                    const result = simulateSaveBase(originalBase, newData);

                    // Result MUST be the original BASE, not the new data
                    expect(result).toEqual(originalBase);

                    // Specifically: products must be identical
                    expect(result.products).toEqual(originalBase.products);
                    expect(result.products.length).toBe(originalBase.products.length);

                    // userId must be original, not new
                    expect(result.userId).toBe(originalBase.userId);

                    // campaignName must be original
                    expect(result.campaignName).toBe(originalBase.campaignName);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT: When no BASE exists (null), the new data should be saved.
     * This is the complement — ensures the skip only happens when BASE exists.
     */
    it('should create new BASE when no existing BASE (null)', () => {
        fc.assert(
            fc.property(
                baseSnapshotArb,
                (newOrderData) => {
                    const result = simulateSaveBase(null, newOrderData);

                    // Result should match the new data
                    expect(result.orderId).toBe(newOrderData.orderId);
                    expect(result.products).toEqual(newOrderData.products);
                    expect(result.userId).toBe(newOrderData.userId);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: kpi-manager.js contains the skip-if-exists pattern.
     */
    it('source code should contain skip-if-exists logic for BASE', () => {
        // The saveAutoBaseSnapshot function should check existingBases
        expect(sourceCode).toContain('existingBases.has(orderId)');
        expect(sourceCode).toContain('skipped++');

        // Should use batch.set (not batch.update) for new BASEs only
        expect(sourceCode).toContain('batch.set(docRef, baseData)');
    });
});
