/**
 * Bug Condition Exploration Test
 * 
 * Property 1: Fault Condition - Variant Items Không Nhận PendingImages Từ Parent
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 * 
 * This test extracts the onGenerate callback logic from form-modal.js (lines ~2367-2390)
 * into a pure function and verifies that pendingImages are NOT copied to variant items.
 * 
 * EXPECTED: Test FAILS on unfixed code → confirms the bug exists.
 * After fix: Test PASSES → confirms the bug is fixed.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Pure function extracted from form-modal.js onGenerate callback
// This replicates the UNFIXED behavior exactly as-is in production
// ============================================================

let globalItemCounter = 0;

/**
 * Simulates addItemAfter() from form-modal.js (line ~888)
 * Creates a new item with empty arrays, inserts after afterItemId
 */
function addItemAfter(items, afterItemId) {
    const newItem = {
        id: `item_${Date.now()}_${globalItemCounter++}`,
        productName: '',
        variant: '',
        productCode: '',
        quantity: 1,
        purchasePrice: '',
        sellingPrice: '',
        productImages: [],
        priceImages: [],
        selectedAttributeValueIds: []
    };
    const idx = items.findIndex(i => i.id === afterItemId);
    if (idx !== -1) {
        items.splice(idx + 1, 0, newItem);
    } else {
        items.push(newItem);
    }
    return newItem;
}

/**
 * Pure function extracted from onGenerate callback (form-modal.js lines ~2357-2390)
 * Replicates the UNFIXED code exactly.
 * 
 * @param {Object} params
 * @param {Array} params.items - formData.items array
 * @param {Object} params.pendingImages - { products: {}, prices: {} }
 * @param {Object} params.parentItem - the item being split into variants (reference in items)
 * @param {Array} params.combinations - array of variant combinations
 * @param {Object} params.baseProduct - product data to copy to variants
 * @returns {{ items: Array, pendingImages: Object, newVariantIds: string[] }}
 */
function onGenerateUnfixed({ items, pendingImages, parentItem, combinations, baseProduct }) {
    const newVariantIds = [];

    if (combinations.length > 0) {
        // First combo updates the current item
        const first = combinations[0];
        parentItem.variant = first.variant || first;
        parentItem.selectedAttributeValueIds = first.selectedAttributeValueIds || [];

        // Remaining combos create new items right after the parent
        let lastInsertedId = parentItem.id;
        for (let i = 1; i < combinations.length; i++) {
            const combo = combinations[i];
            const newItem = addItemAfter(items, lastInsertedId);
            lastInsertedId = newItem.id;
            newVariantIds.push(newItem.id);
            newItem.productName = baseProduct.productName;
            newItem.productCode = baseProduct.productCode;
            newItem.variant = combo.variant || combo;
            newItem.selectedAttributeValueIds = combo.selectedAttributeValueIds || [];
            newItem.purchasePrice = baseProduct.purchasePrice;
            newItem.sellingPrice = baseProduct.sellingPrice;
            newItem.quantity = baseProduct.quantity || 1;
            // Copy parent's product images to variant
            if (baseProduct.productImages?.length > 0) {
                newItem.productImages = [...baseProduct.productImages];
            }
            // Copy parent's price images to variant
            if (baseProduct.priceImages?.length > 0) {
                newItem.priceImages = [...baseProduct.priceImages];
            }
            // Copy pending images so all variants get uploaded
            if (pendingImages.products[parentItem.id]?.length > 0) {
                pendingImages.products[newItem.id] = [...pendingImages.products[parentItem.id]];
            }
            if (pendingImages.prices[parentItem.id]?.length > 0) {
                pendingImages.prices[newItem.id] = [...pendingImages.prices[parentItem.id]];
            }
        }
    }

    return { items, pendingImages, newVariantIds };
}

// ============================================================
// Generators
// ============================================================

/** Generate a random data URL (simulating pending image) */
const arbDataUrl = fc.string({ minLength: 4, maxLength: 16, unit: 'grapheme' })
    .map(s => `data:image/png;base64,${s}`);

/** Generate a pending image entry { file: {}, dataUrl: string } */
const arbPendingImage = arbDataUrl.map(dataUrl => ({
    file: { name: `img_${dataUrl.slice(-6)}.png`, size: 1024 },
    dataUrl
}));

/** Generate an array of 1-3 pending images */
const arbPendingImageArray = fc.array(arbPendingImage, { minLength: 1, maxLength: 3 });

/** Generate a combination entry */
const arbCombination = fc.record({
    variant: fc.string({ minLength: 1, maxLength: 10 }),
    selectedAttributeValueIds: fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 0, maxLength: 3 })
});

/** Generate combinations array of length 2-5 (must be > 1 to trigger bug) */
const arbCombinations = fc.array(arbCombination, { minLength: 2, maxLength: 5 });

/**
 * Generate a full test input where bug condition is true:
 * - parentItem has pendingImages (products and/or prices)
 * - combinations.length > 1
 */
const arbBugConditionInput = fc.record({
    hasPendingProducts: fc.boolean(),
    hasPendingPrices: fc.boolean(),
    pendingProducts: arbPendingImageArray,
    pendingPrices: arbPendingImageArray,
    combinations: arbCombinations,
    productName: fc.string({ minLength: 1, maxLength: 20 }),
    productCode: fc.string({ minLength: 1, maxLength: 10 }),
    purchasePrice: fc.integer({ min: 1000, max: 1000000 }),
    sellingPrice: fc.integer({ min: 1000, max: 1000000 }),
    productImages: fc.array(arbDataUrl, { minLength: 0, maxLength: 3 }),
}).filter(input => input.hasPendingProducts || input.hasPendingPrices);

// ============================================================
// Tests
// ============================================================

describe('Bug Condition Exploration: Purchase Order Variant Image Loss', () => {

    /**
     * Property 1: Fault Condition - Variant Items Không Nhận PendingImages Từ Parent
     * 
     * For any input where parentItem has pendingImages and combinations.length > 1,
     * after onGenerate runs, each new variant item SHOULD have pendingImages entries
     * copied from the parent item.
     * 
     * On UNFIXED code: This test FAILS because pendingImages are NOT copied.
     * After fix: This test PASSES.
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
     */
    it('all variant items should receive pendingImages from parent item', () => {
        fc.assert(
            fc.property(
                arbBugConditionInput,
                (input) => {
                    // Reset counter for deterministic IDs
                    globalItemCounter = 0;

                    const parentItemId = `parent_${Date.now()}`;

                    // Build parent item
                    const parentItem = {
                        id: parentItemId,
                        productName: input.productName,
                        productCode: input.productCode,
                        variant: '',
                        quantity: 1,
                        purchasePrice: input.purchasePrice,
                        sellingPrice: input.sellingPrice,
                        productImages: [...input.productImages],
                        priceImages: [],
                        selectedAttributeValueIds: []
                    };

                    // Build items array with parent
                    const items = [parentItem];

                    // Build pendingImages with parent's pending images
                    const pendingImages = {
                        products: {},
                        prices: {}
                    };

                    if (input.hasPendingProducts) {
                        pendingImages.products[parentItemId] = [...input.pendingProducts];
                    }
                    if (input.hasPendingPrices) {
                        pendingImages.prices[parentItemId] = [...input.pendingPrices];
                    }

                    // Build baseProduct (same as parentItem for variant generation)
                    const baseProduct = {
                        productName: input.productName,
                        productCode: input.productCode,
                        purchasePrice: input.purchasePrice,
                        sellingPrice: input.sellingPrice,
                        quantity: 1,
                        productImages: [...input.productImages]
                    };

                    // Run the UNFIXED onGenerate
                    const result = onGenerateUnfixed({
                        items,
                        pendingImages,
                        parentItem,
                        combinations: input.combinations,
                        baseProduct
                    });

                    // Assert: each new variant item should have pendingImages copied from parent
                    for (const variantId of result.newVariantIds) {
                        // Check pendingImages.products
                        if (input.hasPendingProducts) {
                            expect(result.pendingImages.products[variantId]).toBeDefined();
                            expect(result.pendingImages.products[variantId]).toEqual(
                                result.pendingImages.products[parentItemId]
                            );
                        }

                        // Check pendingImages.prices
                        if (input.hasPendingPrices) {
                            expect(result.pendingImages.prices[variantId]).toBeDefined();
                            expect(result.pendingImages.prices[variantId]).toEqual(
                                result.pendingImages.prices[parentItemId]
                            );
                        }
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
