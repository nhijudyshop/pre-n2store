/**
 * Preservation Property Test
 * 
 * Property 2: Preservation - Hành Vi Không Liên Quan Đến Bug Không Thay Đổi
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * Tests that for all inputs where isBugCondition is FALSE (no pendingImages
 * OR combinations.length <= 1), the onGenerate function produces correct results
 * and no unexpected pendingImages side effects occur.
 * 
 * EXPECTED: Tests PASS on UNFIXED code → confirms baseline behavior to preserve.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Pure function extracted from form-modal.js onGenerate callback
// Replicates the UNFIXED behavior exactly as-is in production
// (Same as bug-condition test)
// ============================================================

let globalItemCounter = 0;

/**
 * Simulates addItemAfter() from form-modal.js
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
 */
function onGenerateUnfixed({ items, pendingImages, parentItem, combinations, baseProduct }) {
    const newVariantIds = [];

    if (combinations.length > 0) {
        const first = combinations[0];
        parentItem.variant = first.variant || first;
        parentItem.selectedAttributeValueIds = first.selectedAttributeValueIds || [];

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
            if (baseProduct.productImages?.length > 0) {
                newItem.productImages = [...baseProduct.productImages];
            }
            // BUG: pendingImages NOT copied — this is the unfixed code
        }
    }

    return { items, pendingImages, newVariantIds };
}

// ============================================================
// Generators for NON-bug-condition inputs
// ============================================================

/** Generate a combination entry */
const arbCombination = fc.record({
    variant: fc.string({ minLength: 1, maxLength: 10 }),
    selectedAttributeValueIds: fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 0, maxLength: 3 })
});

/** Generate combinations array of length 2-5 (multiple variants, no pendingImages) */
const arbMultipleCombinations = fc.array(arbCombination, { minLength: 2, maxLength: 5 });

/** Generate a single combination (only 1 variant → no new items created) */
const arbSingleCombination = fc.array(arbCombination, { minLength: 1, maxLength: 1 });

/** Generate base product data */
const arbBaseProduct = fc.record({
    productName: fc.string({ minLength: 1, maxLength: 20 }),
    productCode: fc.string({ minLength: 1, maxLength: 10 }),
    purchasePrice: fc.integer({ min: 1000, max: 1000000 }),
    sellingPrice: fc.integer({ min: 1000, max: 1000000 }),
    quantity: fc.integer({ min: 1, max: 100 }),
    productImages: fc.array(
        fc.string({ minLength: 4, maxLength: 16, unit: 'grapheme' }).map(s => `data:image/png;base64,${s}`),
        { minLength: 0, maxLength: 3 }
    )
});

// ============================================================
// Tests
// ============================================================

describe('Preservation: Purchase Order Variant Image - Non-Bug Conditions', () => {

    /**
     * Case 1: Sản phẩm không có ảnh tạo biến thể → no pendingImages entries created
     * 
     * When parentItem has NO pendingImages and multiple combinations are generated,
     * variants should be created normally and pendingImages should remain empty.
     * 
     * **Validates: Requirements 3.1**
     */
    it('products without pendingImages → variants created normally, no pendingImages side effects', () => {
        fc.assert(
            fc.property(
                arbMultipleCombinations,
                arbBaseProduct,
                (combinations, baseProduct) => {
                    globalItemCounter = 0;

                    const parentItemId = `parent_${Date.now()}`;
                    const parentItem = {
                        id: parentItemId,
                        productName: baseProduct.productName,
                        productCode: baseProduct.productCode,
                        variant: '',
                        quantity: 1,
                        purchasePrice: baseProduct.purchasePrice,
                        sellingPrice: baseProduct.sellingPrice,
                        productImages: [...baseProduct.productImages],
                        priceImages: [],
                        selectedAttributeValueIds: []
                    };

                    const items = [parentItem];
                    // No pendingImages at all — bug condition is FALSE
                    const pendingImages = { products: {}, prices: {} };

                    const result = onGenerateUnfixed({
                        items,
                        pendingImages,
                        parentItem,
                        combinations,
                        baseProduct
                    });

                    // Variants should be created (combinations.length - 1 new items)
                    expect(result.newVariantIds.length).toBe(combinations.length - 1);
                    expect(result.items.length).toBe(1 + combinations.length - 1);

                    // Parent item should have first combination's variant
                    expect(parentItem.variant).toBe(combinations[0].variant);

                    // No pendingImages entries should exist for any item
                    expect(Object.keys(result.pendingImages.products)).toHaveLength(0);
                    expect(Object.keys(result.pendingImages.prices)).toHaveLength(0);

                    // Each new variant should have correct product data
                    for (const variantId of result.newVariantIds) {
                        const variantItem = result.items.find(i => i.id === variantId);
                        expect(variantItem).toBeDefined();
                        expect(variantItem.productName).toBe(baseProduct.productName);
                        expect(variantItem.productCode).toBe(baseProduct.productCode);
                        expect(variantItem.purchasePrice).toBe(baseProduct.purchasePrice);
                        expect(variantItem.sellingPrice).toBe(baseProduct.sellingPrice);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Case 2: Sản phẩm đơn (1 combination) → item gốc không bị ảnh hưởng
     * 
     * When only 1 combination is provided, no new variants are created.
     * The original item is updated with the variant name but nothing else changes.
     * 
     * **Validates: Requirements 3.4**
     */
    it('single combination → no new variants created, original item updated only', () => {
        fc.assert(
            fc.property(
                arbSingleCombination,
                arbBaseProduct,
                (combinations, baseProduct) => {
                    globalItemCounter = 0;

                    const parentItemId = `parent_${Date.now()}`;
                    const parentItem = {
                        id: parentItemId,
                        productName: baseProduct.productName,
                        productCode: baseProduct.productCode,
                        variant: '',
                        quantity: 1,
                        purchasePrice: baseProduct.purchasePrice,
                        sellingPrice: baseProduct.sellingPrice,
                        productImages: [...baseProduct.productImages],
                        priceImages: [],
                        selectedAttributeValueIds: []
                    };

                    const items = [parentItem];
                    const pendingImages = { products: {}, prices: {} };

                    const result = onGenerateUnfixed({
                        items,
                        pendingImages,
                        parentItem,
                        combinations,
                        baseProduct
                    });

                    // No new variants created
                    expect(result.newVariantIds).toHaveLength(0);
                    expect(result.items).toHaveLength(1);

                    // Parent item updated with variant name from first combination
                    expect(parentItem.variant).toBe(combinations[0].variant);
                    expect(parentItem.selectedAttributeValueIds).toEqual(
                        combinations[0].selectedAttributeValueIds
                    );

                    // Original item data preserved
                    expect(parentItem.productName).toBe(baseProduct.productName);
                    expect(parentItem.purchasePrice).toBe(baseProduct.purchasePrice);
                    expect(parentItem.sellingPrice).toBe(baseProduct.sellingPrice);

                    // No pendingImages side effects
                    expect(Object.keys(result.pendingImages.products)).toHaveLength(0);
                    expect(Object.keys(result.pendingImages.prices)).toHaveLength(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Case 3: 0 combinations → nothing happens at all
     * 
     * When combinations array is empty, onGenerate does nothing.
     * 
     * **Validates: Requirements 3.4**
     */
    it('zero combinations → no changes to items or pendingImages', () => {
        fc.assert(
            fc.property(
                arbBaseProduct,
                (baseProduct) => {
                    globalItemCounter = 0;

                    const parentItemId = `parent_${Date.now()}`;
                    const originalVariant = 'original-variant';
                    const originalAttrs = ['attr1', 'attr2'];
                    const parentItem = {
                        id: parentItemId,
                        productName: baseProduct.productName,
                        productCode: baseProduct.productCode,
                        variant: originalVariant,
                        quantity: 1,
                        purchasePrice: baseProduct.purchasePrice,
                        sellingPrice: baseProduct.sellingPrice,
                        productImages: [...baseProduct.productImages],
                        priceImages: [],
                        selectedAttributeValueIds: [...originalAttrs]
                    };

                    const items = [parentItem];
                    const pendingImages = { products: {}, prices: {} };

                    const result = onGenerateUnfixed({
                        items,
                        pendingImages,
                        parentItem,
                        combinations: [], // empty
                        baseProduct
                    });

                    // Nothing changed
                    expect(result.newVariantIds).toHaveLength(0);
                    expect(result.items).toHaveLength(1);
                    expect(parentItem.variant).toBe(originalVariant);
                    expect(parentItem.selectedAttributeValueIds).toEqual(originalAttrs);
                    expect(Object.keys(result.pendingImages.products)).toHaveLength(0);
                    expect(Object.keys(result.pendingImages.prices)).toHaveLength(0);
                }
            ),
            { numRuns: 50 }
        );
    });

    /**
     * Case 4: Copy item action → không bị ảnh hưởng bởi fix
     * 
     * Simulates that when items exist independently (like after a copy),
     * onGenerate with no pendingImages doesn't create unexpected side effects.
     * Multiple items in the list, generating variants for one doesn't affect others.
     * 
     * **Validates: Requirements 3.5**
     */
    it('multiple items in list → generating variants for one does not affect others', () => {
        fc.assert(
            fc.property(
                arbMultipleCombinations,
                arbBaseProduct,
                fc.integer({ min: 1, max: 3 }),
                (combinations, baseProduct, extraItemCount) => {
                    globalItemCounter = 0;

                    const parentItemId = `parent_${Date.now()}`;
                    const parentItem = {
                        id: parentItemId,
                        productName: baseProduct.productName,
                        productCode: baseProduct.productCode,
                        variant: '',
                        quantity: 1,
                        purchasePrice: baseProduct.purchasePrice,
                        sellingPrice: baseProduct.sellingPrice,
                        productImages: [...baseProduct.productImages],
                        priceImages: [],
                        selectedAttributeValueIds: []
                    };

                    // Create extra items (simulating copied or other items)
                    const extraItems = [];
                    for (let i = 0; i < extraItemCount; i++) {
                        extraItems.push({
                            id: `extra_${i}`,
                            productName: `Extra Product ${i}`,
                            productCode: `EX${i}`,
                            variant: `variant_${i}`,
                            quantity: 1,
                            purchasePrice: 10000,
                            sellingPrice: 20000,
                            productImages: ['https://firebase.com/existing.jpg'],
                            priceImages: [],
                            selectedAttributeValueIds: []
                        });
                    }

                    const items = [...extraItems, parentItem];
                    const pendingImages = { products: {}, prices: {} };

                    // Snapshot extra items before
                    const extraItemsBefore = extraItems.map(item => ({
                        ...item,
                        productImages: [...item.productImages],
                        selectedAttributeValueIds: [...item.selectedAttributeValueIds]
                    }));

                    const result = onGenerateUnfixed({
                        items,
                        pendingImages,
                        parentItem,
                        combinations,
                        baseProduct
                    });

                    // Extra items should be completely unchanged
                    for (let i = 0; i < extraItemCount; i++) {
                        const extraItem = result.items.find(it => it.id === `extra_${i}`);
                        expect(extraItem).toBeDefined();
                        expect(extraItem.productName).toBe(extraItemsBefore[i].productName);
                        expect(extraItem.productCode).toBe(extraItemsBefore[i].productCode);
                        expect(extraItem.variant).toBe(extraItemsBefore[i].variant);
                        expect(extraItem.productImages).toEqual(extraItemsBefore[i].productImages);
                    }

                    // No pendingImages for any item
                    expect(Object.keys(result.pendingImages.products)).toHaveLength(0);
                    expect(Object.keys(result.pendingImages.prices)).toHaveLength(0);
                }
            ),
            { numRuns: 100 }
        );
    });
});
