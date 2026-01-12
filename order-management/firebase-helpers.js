/**
 * Firebase Helper Functions for Object-based Structure
 * Provides optimized operations for Firebase Realtime Database
 */

/**
 * Add or update a single product in Firebase
 * @param {Object} database - Firebase database reference
 * @param {Object} product - Product object to add/update
 * @param {Object} localProductsObject - Local products object reference
 * @returns {Promise}
 */
async function addProductToFirebase(database, product, localProductsObject) {
    const productKey = `product_${product.Id}`;

    // Check if product exists in local object
    const existingProduct = localProductsObject[productKey];

    if (existingProduct) {
        // Update existing product
        const updatedProduct = {
            ...product,
            soldQty: existingProduct.soldQty || 0, // Keep existing soldQty
            remainingQty: product.QtyAvailable - (existingProduct.soldQty || 0),
            addedAt: existingProduct.addedAt || product.addedAt, // Keep original addedAt
            lastRefreshed: Date.now()
        };

        // Update in Firebase
        await database.ref(`orderProducts/${productKey}`).set(updatedProduct);

        // Update local object
        localProductsObject[productKey] = updatedProduct;

        return { action: 'updated', product: updatedProduct };
    } else {
        // Add new product
        await database.ref(`orderProducts/${productKey}`).set(product);

        // Add to local object
        localProductsObject[productKey] = product;

        // Update sortedIds metadata
        await database.ref('orderProductsMeta/sortedIds').transaction((currentIds) => {
            const ids = currentIds || [];
            const newId = product.Id.toString();
            if (!ids.includes(newId)) {
                ids.unshift(newId); // Add to beginning (newest first)
            }
            return ids;
        });

        // Update count
        await database.ref('orderProductsMeta/count').set(Object.keys(localProductsObject).length);

        return { action: 'added', product: product };
    }
}

/**
 * Add multiple products (batch operation)
 * Used for adding products with variants
 */
async function addProductsToFirebase(database, products, localProductsObject) {
    const updates = {};
    const newIds = [];

    products.forEach(product => {
        const productKey = `product_${product.Id}`;

        // Check if exists in local object
        const existingProduct = localProductsObject[productKey];

        if (existingProduct) {
            // Update existing
            const updatedProduct = {
                ...product,
                soldQty: existingProduct.soldQty || 0,
                remainingQty: product.QtyAvailable - (existingProduct.soldQty || 0),
                addedAt: existingProduct.addedAt || product.addedAt,
                lastRefreshed: Date.now()
            };
            updates[`orderProducts/${productKey}`] = updatedProduct;
            localProductsObject[productKey] = updatedProduct;
        } else {
            // Add new
            updates[`orderProducts/${productKey}`] = product;
            localProductsObject[productKey] = product;
            newIds.push(product.Id.toString());
        }
    });

    // Batch update in Firebase
    await database.ref().update(updates);

    // Update metadata if there are new products
    if (newIds.length > 0) {
        await database.ref('orderProductsMeta/sortedIds').transaction((currentIds) => {
            const ids = currentIds || [];
            newIds.forEach(id => {
                if (!ids.includes(id)) {
                    ids.unshift(id);
                }
            });
            return ids;
        });

        await database.ref('orderProductsMeta/count').set(Object.keys(localProductsObject).length);
    }

    return { added: newIds.length, updated: products.length - newIds.length };
}

/**
 * Remove a product from Firebase
 */
async function removeProductFromFirebase(database, productId, localProductsObject) {
    const productKey = `product_${productId}`;

    // Remove from Firebase
    await database.ref(`orderProducts/${productKey}`).remove();

    // Remove from local object
    delete localProductsObject[productKey];

    // Update metadata
    await database.ref('orderProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => id !== productId.toString());
    });

    await database.ref('orderProductsMeta/count').set(Object.keys(localProductsObject).length);
}

/**
 * Update product quantity (soldQty)
 */
async function updateProductQtyInFirebase(database, productId, change, localProductsObject) {
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];
    if (!product) return;

    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, (product.soldQty || 0) + change));

    if (newSoldQty === product.soldQty) return;

    // Update local first (optimistic update)
    product.soldQty = newSoldQty;

    // Sync to Firebase (just soldQty, remainingQty is now independent)
    await database.ref(`orderProducts/${productKey}`).update({
        soldQty: newSoldQty
    });
}

/**
 * Hide/unhide a product
 */
async function updateProductVisibility(database, productId, isHidden, localProductsObject) {
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];
    if (!product) return;

    // Update local
    product.isHidden = isHidden;

    // Sync to Firebase
    await database.ref(`orderProducts/${productKey}/isHidden`).set(isHidden);
}

/**
 * Delete a product permanently from Firebase
 */
async function removeProductFromFirebase(database, productId, localProductsObject) {
    const productKey = `product_${productId}`;

    // Prepare updates
    const updates = {};
    updates[`orderProducts/${productKey}`] = null; // null means remove

    // Sync to Firebase
    await database.ref().update(updates);

    // Update sortedIds metadata
    await database.ref('orderProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => id !== productId.toString());
    });

    // Update count metadata
    await database.ref('orderProductsMeta/count').set(Object.keys(localProductsObject).length);
}

/**
 * Delete multiple products permanently from Firebase in a single batch operation
 */
async function removeProductsFromFirebase(database, productIds, localProductsObject) {
    if (!productIds || productIds.length === 0) return;

    // Prepare batch updates
    const updates = {};
    const idsToRemove = [];

    productIds.forEach(productId => {
        const productKey = `product_${productId}`;
        updates[`orderProducts/${productKey}`] = null; // null means remove
        idsToRemove.push(productId.toString());

        // Remove from local object
        delete localProductsObject[productKey];
    });

    // Sync all deletions to Firebase in a single batch
    await database.ref().update(updates);

    // Update sortedIds metadata
    await database.ref('orderProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => !idsToRemove.includes(id));
    });

    // Update count metadata
    await database.ref('orderProductsMeta/count').set(Object.keys(localProductsObject).length);
}

/**
 * Cleanup old products (older than 7 days)
 */
async function cleanupOldProducts(database, localProductsObject) {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - SEVEN_DAYS;

    // Find products to remove
    const productsToRemove = Object.entries(localProductsObject).filter(([key, product]) => {
        const addedAt = product.addedAt || 0;
        return (Date.now() - addedAt) >= SEVEN_DAYS;
    });

    if (productsToRemove.length === 0) {
        return { removed: 0 };
    }

    // Prepare batch remove
    const updates = {};
    const idsToRemove = [];

    productsToRemove.forEach(([productKey, product]) => {
        updates[`orderProducts/${productKey}`] = null; // null means remove
        idsToRemove.push(product.Id.toString());
    });

    // Batch remove
    await database.ref().update(updates);

    // Update metadata
    await database.ref('orderProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => !idsToRemove.includes(id));
    });

    // Remove from local object
    productsToRemove.forEach(([productKey]) => {
        delete localProductsObject[productKey];
    });

    await database.ref('orderProductsMeta/count').set(Object.keys(localProductsObject).length);

    return { removed: productsToRemove.length };
}

/**
 * Clear all products
 */
async function clearAllProducts(database, localProductsObject) {
    // Remove all products
    await database.ref('orderProducts').remove();

    // Reset metadata
    await database.ref('orderProductsMeta').set({
        sortedIds: [],
        count: 0,
        lastUpdated: Date.now()
    });

    // Clear local object
    Object.keys(localProductsObject).forEach(key => delete localProductsObject[key]);
}

/**
 * Load all products from Firebase (initial load)
 * Returns an object with products keyed by product_${Id}
 */
async function loadAllProductsFromFirebase(database) {
    try {
        // Load products
        const productsSnapshot = await database.ref('orderProducts').once('value');
        const productsObject = productsSnapshot.val();

        if (!productsObject || typeof productsObject !== 'object') {
            return {};
        }

        // Return the object as-is (already in correct format)
        return productsObject;

    } catch (error) {
        console.error('Error loading products:', error);
        return {};
    }
}

/**
 * Setup Firebase child listeners for realtime updates
 * NOTE: This should be called AFTER loadAllProductsFromFirebase() to avoid duplicate loading
 */
function setupFirebaseChildListeners(database, localProductsObject, callbacks) {
    const productsRef = database.ref('orderProducts');

    console.log('🔧 Setting up Firebase child listeners...');

    // Check if products were already loaded (from loadAllProductsFromFirebase)
    const alreadyLoaded = Object.keys(localProductsObject).length > 0;
    let isInitialLoad = !alreadyLoaded; // Skip initial load if already loaded
    let initialLoadCount = 0;

    console.log(`📊 Products already loaded: ${alreadyLoaded} (${Object.keys(localProductsObject).length} products)`);

    // Setup listeners IMMEDIATELY (not inside any async callback)
    // This ensures they are always attached and ready

    // child_added: Fired for each existing child and when new child is added
    productsRef.on('child_added', (snapshot) => {
        const product = snapshot.val();
        const productKey = snapshot.key;

        // If products were pre-loaded, skip all initial Firebase events
        if (alreadyLoaded) {
            // Check if this is truly a NEW product (not in local object)
            if (!localProductsObject[productKey]) {
                console.log('🔥 [child_added] New product (pre-loaded mode):', product.NameGet);
                localProductsObject[productKey] = product;

                if (callbacks.onProductAdded) {
                    callbacks.onProductAdded(product);
                }
            }
            // Skip existing products during initial Firebase scan
            return;
        }

        // If NOT pre-loaded, use initial load counting logic
        if (isInitialLoad) {
            initialLoadCount++;
            // Add to local object during initial load (silent mode)
            localProductsObject[productKey] = product;

            // Check if initial load is complete
            database.ref('orderProductsMeta/count').once('value', (snapshot) => {
                const expectedCount = snapshot.val() || 0;
                if (expectedCount === 0 || initialLoadCount >= expectedCount) {
                    isInitialLoad = false;
                    console.log('✅ Initial load complete:', initialLoadCount, 'products');
                    if (callbacks.onInitialLoadComplete) {
                        callbacks.onInitialLoadComplete();
                    }
                }
            });
            return; // Don't trigger callback during initial load
        }

        // After initial load, this is a real addition
        if (!localProductsObject[productKey]) {
            console.log('🔥 [child_added] New product:', product.NameGet);
            localProductsObject[productKey] = product;

            if (callbacks.onProductAdded) {
                callbacks.onProductAdded(product);
            }
        }
    });

    // child_changed: When a product is updated
    productsRef.on('child_changed', (snapshot) => {
        const updatedProduct = snapshot.val();
        const productKey = snapshot.key;

        console.log('🔥 [child_changed] Product updated:', updatedProduct.NameGet);

        // Always update local object with latest data
        localProductsObject[productKey] = updatedProduct;

        if (callbacks.onProductChanged) {
            callbacks.onProductChanged(updatedProduct, productKey);
        }
    });

    // child_removed: When a product is deleted
    productsRef.on('child_removed', (snapshot) => {
        const removedProduct = snapshot.val();
        const productKey = snapshot.key;

        console.log('🔥 [child_removed] Product removed:', removedProduct.NameGet);

        if (localProductsObject[productKey]) {
            delete localProductsObject[productKey];

            if (callbacks.onProductRemoved) {
                callbacks.onProductRemoved(removedProduct, productKey);
            }
        }
    });

    // Call onInitialLoadComplete immediately if products were pre-loaded
    if (alreadyLoaded && callbacks.onInitialLoadComplete) {
        console.log('✅ Firebase listeners setup complete (pre-loaded mode)');
        callbacks.onInitialLoadComplete();
    } else if (!alreadyLoaded && Object.keys(localProductsObject).length === 0) {
        // If no products exist, mark complete immediately
        database.ref('orderProductsMeta/count').once('value', (snapshot) => {
            const expectedCount = snapshot.val() || 0;
            if (expectedCount === 0) {
                isInitialLoad = false;
                console.log('✅ No products to load');
                if (callbacks.onInitialLoadComplete) {
                    callbacks.onInitialLoadComplete();
                }
            }
        });
    }

    return {
        detach: () => {
            productsRef.off('child_added');
            productsRef.off('child_changed');
            productsRef.off('child_removed');
        }
    };
}

/**
 * Convert products object to sorted array
 * @param {Object} productsObject - Products object { product_123: {...}, ... }
 * @param {Array} sortedIds - Optional array of IDs in sort order
 * @returns {Array} Sorted products array
 */
function getProductsArray(productsObject, sortedIds = null) {
    const productsArray = Object.values(productsObject);

    if (!sortedIds || sortedIds.length === 0) {
        // Sort by addedAt (newest first) if no sortedIds provided
        return productsArray.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }

    // Sort according to sortedIds
    return productsArray.sort((a, b) => {
        const indexA = sortedIds.indexOf(a.Id.toString());
        const indexB = sortedIds.indexOf(b.Id.toString());

        // If both in sortedIds, use that order
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }

        // If only one in sortedIds, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        // Otherwise sort by addedAt (newest first)
        return (b.addedAt || 0) - (a.addedAt || 0);
    });
}

/**
 * ============================================================================
 * CART HISTORY / SNAPSHOT FUNCTIONS
 * ============================================================================
 */

/**
 * Save cart snapshot to Firebase
 * @param {Object} database - Firebase database reference
 * @param {Object} snapshot - Snapshot object with metadata and products
 * @returns {Promise<string>} Returns snapshot ID
 */
async function saveCartSnapshot(database, snapshot) {
    const snapshotId = `snapshot_${snapshot.metadata.savedAt}`;

    console.log('🔵 [saveCartSnapshot] Saving snapshot:', snapshotId);
    console.log('🔵 [saveCartSnapshot] Metadata:', snapshot.metadata);
    console.log('🔵 [saveCartSnapshot] Product count:', Object.keys(snapshot.products).length);

    // Save snapshot data
    await database.ref(`cartHistory/${snapshotId}`).set(snapshot);
    console.log('✅ [saveCartSnapshot] Snapshot data saved to Firebase');

    // Update metadata
    const metaRef = database.ref('cartHistoryMeta');
    const metaSnapshot = await metaRef.once('value');
    const currentMeta = metaSnapshot.val() || { sortedIds: [], count: 0 };

    console.log('🔵 [saveCartSnapshot] Current meta:', currentMeta);

    // Ensure sortedIds is always an array
    const currentIds = Array.isArray(currentMeta.sortedIds) ? currentMeta.sortedIds : [];

    // Add to beginning of array (newest first)
    const newSortedIds = [snapshotId, ...currentIds];

    console.log('🔵 [saveCartSnapshot] New sortedIds:', newSortedIds);

    await metaRef.set({
        sortedIds: newSortedIds,
        count: newSortedIds.length,
        lastUpdated: Date.now()
    });

    console.log('✅ [saveCartSnapshot] Metadata saved to Firebase');
    console.log('✅ [saveCartSnapshot] Total snapshots now:', newSortedIds.length);

    return snapshotId;
}

/**
 * Get single cart snapshot
 * @param {Object} database - Firebase database reference
 * @param {string} snapshotId - Snapshot ID to retrieve
 * @returns {Promise<Object|null>} Snapshot object or null if not found
 */
async function getCartSnapshot(database, snapshotId) {
    console.log(`🔵 [getCartSnapshot] Loading snapshot: ${snapshotId}`);

    const snapshot = await database.ref(`cartHistory/${snapshotId}`).once('value');
    const data = snapshot.val();

    if (!data) {
        console.error(`❌ [getCartSnapshot] Snapshot not found in Firebase: ${snapshotId}`);
        return null;
    }

    console.log(`✅ [getCartSnapshot] Snapshot found: ${data.metadata?.name || 'Unknown'}`);
    console.log(`🔵 [getCartSnapshot] Products in snapshot: ${Object.keys(data.products || {}).length}`);

    return {
        id: snapshotId,
        ...data
    };
}

/**
 * Get all cart snapshots (sorted by date, newest first)
 * @param {Object} database - Firebase database reference
 * @returns {Promise<Array>} Array of snapshot objects
 */
async function getAllCartSnapshots(database) {
    console.log('🔵 [getAllCartSnapshots] Loading all snapshots...');

    const metaSnapshot = await database.ref('cartHistoryMeta').once('value');
    const meta = metaSnapshot.val();

    console.log('🔵 [getAllCartSnapshots] Meta from Firebase:', meta);

    if (!meta) {
        console.log('⚠️ [getAllCartSnapshots] No metadata found, returning empty array');
        return [];
    }

    // Ensure sortedIds is always an array
    const sortedIds = Array.isArray(meta.sortedIds) ? meta.sortedIds : [];

    console.log('🔵 [getAllCartSnapshots] Total snapshot IDs:', sortedIds.length);
    console.log('🔵 [getAllCartSnapshots] Snapshot IDs:', sortedIds);

    if (sortedIds.length === 0) {
        console.log('⚠️ [getAllCartSnapshots] No snapshots in metadata');
        return [];
    }

    const snapshots = [];
    let loadedCount = 0;
    let failedCount = 0;

    for (const snapshotId of sortedIds) {
        console.log(`🔵 [getAllCartSnapshots] Loading snapshot ${loadedCount + 1}/${sortedIds.length}: ${snapshotId}`);
        const snapshot = await getCartSnapshot(database, snapshotId);
        if (snapshot) {
            snapshots.push(snapshot);
            loadedCount++;
            console.log(`✅ [getAllCartSnapshots] Loaded: ${snapshot.metadata.name} (${Object.keys(snapshot.products || {}).length} products)`);
        } else {
            failedCount++;
            console.error(`❌ [getAllCartSnapshots] Failed to load snapshot: ${snapshotId}`);
        }
    }

    console.log(`✅ [getAllCartSnapshots] Summary: ${loadedCount} loaded, ${failedCount} failed`);

    return snapshots;
}

/**
 * Restore products from snapshot
 * @param {Object} database - Firebase database reference
 * @param {Object} snapshotProducts - Products object from snapshot
 * @param {Object} localProductsObject - Local products object reference
 * @returns {Promise}
 */
async function restoreProductsFromSnapshot(database, snapshotProducts, localProductsObject) {
    // Batch write all products
    const updates = {};
    const productIds = [];

    Object.entries(snapshotProducts).forEach(([key, product]) => {
        updates[`orderProducts/${key}`] = product;
        productIds.push(product.Id);

        // Update local object
        localProductsObject[key] = product;
    });

    // Update metadata
    updates['orderProductsMeta'] = {
        sortedIds: productIds,
        count: productIds.length,
        lastUpdated: Date.now()
    };

    await database.ref().update(updates);
}

/**
 * Delete cart snapshot
 * @param {Object} database - Firebase database reference
 * @param {string} snapshotId - Snapshot ID to delete
 * @returns {Promise}
 */
async function deleteCartSnapshot(database, snapshotId) {
    console.log(`🔵 [deleteCartSnapshot] Deleting snapshot: ${snapshotId}`);

    // Remove snapshot data
    await database.ref(`cartHistory/${snapshotId}`).remove();
    console.log(`✅ [deleteCartSnapshot] Snapshot data removed from Firebase`);

    // Update metadata
    const metaRef = database.ref('cartHistoryMeta');
    const metaSnapshot = await metaRef.once('value');
    const currentMeta = metaSnapshot.val() || { sortedIds: [], count: 0 };

    console.log(`🔵 [deleteCartSnapshot] Current meta before delete:`, currentMeta);

    // Ensure sortedIds is always an array
    const currentIds = Array.isArray(currentMeta.sortedIds) ? currentMeta.sortedIds : [];

    const newSortedIds = currentIds.filter(id => id !== snapshotId);

    console.log(`🔵 [deleteCartSnapshot] Snapshots before: ${currentIds.length}, after: ${newSortedIds.length}`);

    await metaRef.set({
        sortedIds: newSortedIds,
        count: newSortedIds.length,
        lastUpdated: Date.now()
    });

    console.log(`✅ [deleteCartSnapshot] Metadata updated. Total snapshots now: ${newSortedIds.length}`);
}
