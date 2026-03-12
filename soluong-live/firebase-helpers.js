/**
 * Firebase Helper Functions for Object-based Structure
 * Provides optimized operations for Firebase Realtime Database
 */

/**
 * Add or update a single product in Firebase
 * OPTIMIZED: Writes soldQty to separate node
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
        const soldQty = existingProduct.soldQty || 0;
        const updatedProduct = {
            ...product,
            soldQty: soldQty, // Keep existing soldQty
            remainingQty: product.QtyAvailable - soldQty,
            addedAt: existingProduct.addedAt || product.addedAt, // Keep original addedAt
            lastRefreshed: Date.now()
        };

        // Update in Firebase (product data)
        await database.ref(`soluongProducts/${productKey}`).set(updatedProduct);

        // Update local object
        localProductsObject[productKey] = updatedProduct;

        return { action: 'updated', product: updatedProduct };
    } else {
        // Add new product
        const soldQty = product.soldQty || 0;

        // Write product to Firebase
        await database.ref(`soluongProducts/${productKey}`).set(product);

        // OPTIMIZED: Also write qty to separate node
        await database.ref(`soluongProductsQty/${productKey}`).set({
            soldQty: soldQty
        });

        // Add to local object
        localProductsObject[productKey] = product;

        // Update sortedIds metadata
        await database.ref('soluongProductsMeta/sortedIds').transaction((currentIds) => {
            const ids = currentIds || [];
            const newId = product.Id.toString();
            if (!ids.includes(newId)) {
                ids.unshift(newId); // Add to beginning (newest first)
            }
            return ids;
        });

        // Update count
        await database.ref('soluongProductsMeta/count').set(Object.keys(localProductsObject).length);

        return { action: 'added', product: product };
    }
}

/**
 * Add multiple products (batch operation)
 * OPTIMIZED: Writes soldQty to separate node
 * Used for adding products with variants
 */
async function addProductsToFirebase(database, products, localProductsObject) {
    const updates = {};
    const qtyUpdates = {}; // OPTIMIZED: Separate qty updates
    const newIds = [];

    products.forEach(product => {
        const productKey = `product_${product.Id}`;

        // Check if exists in local object
        const existingProduct = localProductsObject[productKey];

        if (existingProduct) {
            // Update existing
            const soldQty = existingProduct.soldQty || 0;
            const updatedProduct = {
                ...product,
                soldQty: soldQty,
                remainingQty: product.QtyAvailable - soldQty,
                addedAt: existingProduct.addedAt || product.addedAt,
                lastRefreshed: Date.now()
            };
            updates[`soluongProducts/${productKey}`] = updatedProduct;
            localProductsObject[productKey] = updatedProduct;
        } else {
            // Add new
            const soldQty = product.soldQty || 0;
            updates[`soluongProducts/${productKey}`] = product;
            // OPTIMIZED: Add qty to separate node
            qtyUpdates[`soluongProductsQty/${productKey}`] = { soldQty: soldQty };
            localProductsObject[productKey] = product;
            newIds.push(product.Id.toString());
        }
    });

    // Batch update products in Firebase
    await database.ref().update(updates);

    // OPTIMIZED: Batch update qty in Firebase (for new products)
    if (Object.keys(qtyUpdates).length > 0) {
        await database.ref().update(qtyUpdates);
    }

    // Update metadata if there are new products
    if (newIds.length > 0) {
        await database.ref('soluongProductsMeta/sortedIds').transaction((currentIds) => {
            const ids = currentIds || [];
            newIds.forEach(id => {
                if (!ids.includes(id)) {
                    ids.unshift(id);
                }
            });
            return ids;
        });

        await database.ref('soluongProductsMeta/count').set(Object.keys(localProductsObject).length);
    }

    return { added: newIds.length, updated: products.length - newIds.length };
}

/**
 * Remove a product from Firebase
 * OPTIMIZED: Also removes qty from separate node
 */
async function removeProductFromFirebase(database, productId, localProductsObject) {
    const productKey = `product_${productId}`;

    // Remove from Firebase (product and qty)
    await database.ref(`soluongProducts/${productKey}`).remove();
    await database.ref(`soluongProductsQty/${productKey}`).remove(); // OPTIMIZED: Also remove qty

    // Remove from local object
    delete localProductsObject[productKey];

    // Update metadata
    await database.ref('soluongProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => id !== productId.toString());
    });

    await database.ref('soluongProductsMeta/count').set(Object.keys(localProductsObject).length);
}

/**
 * Update product quantity (soldQty)
 * Writes to BOTH soluongProducts and soluongProductsQty for cross-page compatibility
 */
async function updateProductQtyInFirebase(database, productId, change, localProductsObject) {
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];
    if (!product) return;

    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, (product.soldQty || 0) + change));

    if (newSoldQty === product.soldQty) return;

    // Update local first (optimistic update)
    product.soldQty = newSoldQty;
    product.remainingQty = product.QtyAvailable - newSoldQty;

    // Write to BOTH nodes for cross-page compatibility
    await Promise.all([
        database.ref(`soluongProducts/${productKey}`).update({
            soldQty: newSoldQty,
            remainingQty: product.remainingQty
        }),
        database.ref(`soluongProductsQty/${productKey}`).set({
            soldQty: newSoldQty
        })
    ]);
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
    await database.ref(`soluongProducts/${productKey}/isHidden`).set(isHidden);
}

/**
 * Delete multiple products permanently from Firebase in a single batch operation
 * OPTIMIZED: Also removes qty from separate node
 */
async function removeProductsFromFirebase(database, productIds, localProductsObject) {
    if (!productIds || productIds.length === 0) return;

    // Prepare batch updates
    const updates = {};
    const idsToRemove = [];

    productIds.forEach(productId => {
        const productKey = `product_${productId}`;
        updates[`soluongProducts/${productKey}`] = null; // null means remove
        updates[`soluongProductsQty/${productKey}`] = null; // OPTIMIZED: Also remove qty
        idsToRemove.push(productId.toString());

        // Remove from local object
        delete localProductsObject[productKey];
    });

    // Sync all deletions to Firebase in a single batch
    await database.ref().update(updates);

    // Update sortedIds metadata
    await database.ref('soluongProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => !idsToRemove.includes(id));
    });

    // Update count metadata
    await database.ref('soluongProductsMeta/count').set(Object.keys(localProductsObject).length);
}

/**
 * Cleanup old products (older than 7 days)
 * OPTIMIZED: Also removes qty from separate node
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
        updates[`soluongProducts/${productKey}`] = null; // null means remove
        updates[`soluongProductsQty/${productKey}`] = null; // OPTIMIZED: Also remove qty
        idsToRemove.push(product.Id.toString());
    });

    // Batch remove
    await database.ref().update(updates);

    // Update metadata
    await database.ref('soluongProductsMeta/sortedIds').transaction((currentIds) => {
        return (currentIds || []).filter(id => !idsToRemove.includes(id));
    });

    // Remove from local object
    productsToRemove.forEach(([productKey]) => {
        delete localProductsObject[productKey];
    });

    await database.ref('soluongProductsMeta/count').set(Object.keys(localProductsObject).length);

    return { removed: productsToRemove.length };
}

/**
 * Clear all products
 * OPTIMIZED: Also clears qty from separate node
 */
async function clearAllProducts(database, localProductsObject) {
    // Remove all products and qty
    await database.ref('soluongProducts').remove();
    await database.ref('soluongProductsQty').remove(); // OPTIMIZED: Also remove qty

    // Reset metadata
    await database.ref('soluongProductsMeta').set({
        sortedIds: [],
        count: 0,
        lastUpdated: Date.now()
    });

    // Clear local object
    Object.keys(localProductsObject).forEach(key => delete localProductsObject[key]);
}

/**
 * Load all products from Firebase (initial load)
 * OPTIMIZED: Loads products and qty data from separate nodes, then merges them
 * Returns an object with products keyed by product_${Id}
 */
async function loadAllProductsFromFirebase(database) {
    try {
        // OPTIMIZED: Load products AND qty data in parallel
        const [productsSnapshot, qtySnapshot] = await Promise.all([
            database.ref('soluongProducts').once('value'),
            database.ref('soluongProductsQty').once('value')
        ]);

        const productsObject = productsSnapshot.val();
        const qtyObject = qtySnapshot.val() || {};

        if (!productsObject || typeof productsObject !== 'object') {
            return {};
        }

        // Merge qty data into products
        Object.keys(productsObject).forEach(key => {
            if (qtyObject[key]) {
                productsObject[key].soldQty = qtyObject[key].soldQty || 0;
            } else {
                // Fallback to soldQty in product (for backward compatibility during migration)
                productsObject[key].soldQty = productsObject[key].soldQty || 0;
            }
        });

        console.log(`📦 [loadAllProductsFromFirebase] Loaded ${Object.keys(productsObject).length} products, merged ${Object.keys(qtyObject).length} qty entries`);

        return productsObject;

    } catch (error) {
        console.error('Error loading products:', error);
        return {};
    }
}

/**
 * Setup Firebase child listeners for realtime updates
 * OPTIMIZED: Uses separate listener for qty changes (~20 bytes instead of ~1KB per update)
 * NOTE: This should be called AFTER loadAllProductsFromFirebase() to avoid duplicate loading
 */
function setupFirebaseChildListeners(database, localProductsObject, callbacks) {
    const productsRef = database.ref('soluongProducts');
    const qtyRef = database.ref('soluongProductsQty'); // OPTIMIZED: Separate qty listener

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
            database.ref('soluongProductsMeta/count').once('value', (snapshot) => {
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

    // child_changed: When product STATIC data is updated (name, price, image, etc.)
    // NOTE: soldQty changes now come from qtyRef listener below
    productsRef.on('child_changed', (snapshot) => {
        const updatedProduct = snapshot.val();
        const productKey = snapshot.key;

        // Preserve current soldQty from local (qty updates come from separate listener)
        const currentSoldQty = localProductsObject[productKey]?.soldQty || 0;

        console.log('🔥 [child_changed] Product static data updated:', updatedProduct.NameGet);

        // Update local object with new static data, keeping local soldQty
        localProductsObject[productKey] = {
            ...updatedProduct,
            soldQty: currentSoldQty // Keep local qty (will be synced from qty listener)
        };

        if (callbacks.onProductChanged) {
            callbacks.onProductChanged(localProductsObject[productKey], productKey);
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

    // OPTIMIZED: Listen for qty changes on SEPARATE node (~20 bytes per update instead of ~1KB)
    qtyRef.on('child_changed', (snapshot) => {
        const qtyData = snapshot.val();
        const productKey = snapshot.key;

        console.log('🔥 [qty_changed] Qty updated:', productKey, '→', qtyData.soldQty);

        // Update local object with new qty
        if (localProductsObject[productKey]) {
            localProductsObject[productKey].soldQty = qtyData.soldQty || 0;

            // Use onQtyChanged callback if available, otherwise fallback to onProductChanged
            if (callbacks.onQtyChanged) {
                callbacks.onQtyChanged(localProductsObject[productKey], productKey);
            } else if (callbacks.onProductChanged) {
                callbacks.onProductChanged(localProductsObject[productKey], productKey);
            }
        }
    });

    // Also listen for new qty entries (when new product is added)
    qtyRef.on('child_added', (snapshot) => {
        const qtyData = snapshot.val();
        const productKey = snapshot.key;

        // Only process if product exists in local (ignore initial load)
        if (localProductsObject[productKey] && alreadyLoaded) {
            // Update qty if it's different from what we have
            if (localProductsObject[productKey].soldQty !== qtyData.soldQty) {
                console.log('🔥 [qty_added] New qty entry:', productKey, '→', qtyData.soldQty);
                localProductsObject[productKey].soldQty = qtyData.soldQty || 0;
            }
        }
    });

    // Call onInitialLoadComplete immediately if products were pre-loaded
    if (alreadyLoaded && callbacks.onInitialLoadComplete) {
        console.log('✅ Firebase listeners setup complete (pre-loaded mode)');
        callbacks.onInitialLoadComplete();
    } else if (!alreadyLoaded && Object.keys(localProductsObject).length === 0) {
        // If no products exist, mark complete immediately
        database.ref('soluongProductsMeta/count').once('value', (snapshot) => {
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
            qtyRef.off('child_changed'); // OPTIMIZED: Cleanup qty listener
            qtyRef.off('child_added');
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
 * ============================================================================
 * CART CACHE HELPERS (Optimization - Step 4)
 * ============================================================================
 */
const CART_CACHE_KEY = 'soluong_cartSnapshots_cache';
const CART_CACHE_TTL = 5 * 60 * 1000; // 5 phút

/**
 * Get cart snapshots from localStorage cache
 * @returns {Array|null} Cached data or null if expired/not found
 */
function getCartCache() {
    try {
        const cached = localStorage.getItem(CART_CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CART_CACHE_TTL) {
                console.log('📦 [getCartCache] Using cached data (age: ' + Math.round((Date.now() - timestamp) / 1000) + 's)');
                return data;
            }
            console.log('📦 [getCartCache] Cache expired, will reload from Firebase');
        }
    } catch (e) {
        console.warn('📦 [getCartCache] Cache read error:', e);
    }
    return null;
}

/**
 * Save cart snapshots to localStorage cache
 * @param {Array} data - Snapshots array to cache
 */
function setCartCache(data) {
    try {
        localStorage.setItem(CART_CACHE_KEY, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
        console.log('📦 [setCartCache] Cached ' + data.length + ' snapshots');
    } catch (e) {
        console.warn('📦 [setCartCache] Cache write error:', e);
    }
}

/**
 * Invalidate cart cache (call after save/delete operations)
 */
function invalidateCartCache() {
    localStorage.removeItem(CART_CACHE_KEY);
    console.log('📦 [invalidateCartCache] Cache cleared');
}

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

    // Invalidate cache after saving new snapshot
    invalidateCartCache();

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
 * OPTIMIZED: Uses batch load (1 query) + localStorage cache
 * @param {Object} database - Firebase database reference
 * @param {boolean} forceRefresh - Skip cache and reload from Firebase
 * @returns {Promise<Array>} Array of snapshot objects
 */
async function getAllCartSnapshots(database, forceRefresh = false) {
    console.log('🔵 [getAllCartSnapshots] Loading all snapshots...');

    // Step 1: Check cache first (unless forceRefresh)
    if (!forceRefresh) {
        const cached = getCartCache();
        if (cached) {
            console.log(`✅ [getAllCartSnapshots] Returned ${cached.length} snapshots from cache`);
            return cached;
        }
    }

    console.log('🔵 [getAllCartSnapshots] Loading from Firebase (batch mode)...');

    // Step 2: BATCH LOAD - Load all snapshots in 1 query (instead of N+1)
    const [allSnapshotsRef, metaSnapshot] = await Promise.all([
        database.ref('cartHistory').once('value'),
        database.ref('cartHistoryMeta').once('value')
    ]);

    const allSnapshotsData = allSnapshotsRef.val() || {};
    const meta = metaSnapshot.val();

    console.log('🔵 [getAllCartSnapshots] Meta from Firebase:', meta);
    console.log('🔵 [getAllCartSnapshots] Snapshots loaded in batch:', Object.keys(allSnapshotsData).length);

    if (!meta || Object.keys(allSnapshotsData).length === 0) {
        console.log('⚠️ [getAllCartSnapshots] No snapshots found');
        setCartCache([]); // Cache empty result
        return [];
    }

    // Ensure sortedIds is always an array
    const sortedIds = Array.isArray(meta.sortedIds) ? meta.sortedIds : [];

    // Step 3: Convert to array and sort according to sortedIds
    const snapshots = [];
    let loadedCount = 0;
    let failedCount = 0;

    for (const snapshotId of sortedIds) {
        const data = allSnapshotsData[snapshotId];
        if (data) {
            snapshots.push({
                id: snapshotId,
                ...data
            });
            loadedCount++;
            console.log(`✅ [getAllCartSnapshots] Loaded: ${data.metadata?.name || snapshotId} (${Object.keys(data.products || {}).length} products)`);
        } else {
            failedCount++;
            console.warn(`⚠️ [getAllCartSnapshots] Snapshot in meta but not in data: ${snapshotId}`);
        }
    }

    // Also add any snapshots that exist but aren't in sortedIds (orphaned snapshots)
    Object.keys(allSnapshotsData).forEach(snapshotId => {
        if (!sortedIds.includes(snapshotId)) {
            const data = allSnapshotsData[snapshotId];
            snapshots.push({
                id: snapshotId,
                ...data
            });
            console.log(`⚠️ [getAllCartSnapshots] Found orphaned snapshot: ${snapshotId}`);
        }
    });

    console.log(`✅ [getAllCartSnapshots] Summary: ${loadedCount} loaded, ${failedCount} missing from data`);

    // Step 4: Cache the result
    setCartCache(snapshots);

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
        updates[`soluongProducts/${key}`] = product;
        // Also write soldQty to separate node for cross-page sync
        updates[`soluongProductsQty/${key}`] = { soldQty: product.soldQty || 0 };
        productIds.push(product.Id);

        // Update local object
        localProductsObject[key] = product;
    });

    // Update metadata
    updates['soluongProductsMeta'] = {
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

    // Invalidate cache after deleting snapshot
    invalidateCartCache();
}

/**
 * ============================================================================
 * SALES LOG FUNCTIONS
 * ============================================================================
 */

/**
 * Log a sale transaction
 * @param {Object} database - Firebase database reference
 * @param {Object} logData - Log data object
 * @param {number} logData.productId - Product ID
 * @param {string} logData.productName - Product name
 * @param {number} logData.change - Quantity change (+1 or -1)
 * @param {string} logData.source - Sale source ('livestream' | 'facebook' | etc.)
 * @param {string} logData.staffName - Staff display name
 * @param {string} logData.staffUsername - Staff username
 * @returns {Promise<string>} Log entry key
 */
async function logSaleTransaction(database, logData) {
    const logEntry = {
        productId: logData.productId,
        productName: logData.productName,
        change: logData.change,                    // +1 or -1
        source: logData.source || 'unknown',       // 'livestream' | 'facebook'
        staffName: logData.staffName || 'Unknown',
        staffUsername: logData.staffUsername || 'unknown',
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0]  // 'YYYY-MM-DD' for filtering
    };

    const newLogRef = database.ref('soluongSalesLog').push();
    await newLogRef.set(logEntry);

    console.log('📝 Sale logged:', logEntry);
    return newLogRef.key;
}

/**
 * Get sales log for a specific date
 * @param {Object} database - Firebase database reference
 * @param {string} date - Date string 'YYYY-MM-DD'
 * @returns {Promise<Array>} Array of log entries
 */
async function getSalesLogByDate(database, date) {
    const snapshot = await database.ref('soluongSalesLog')
        .orderByChild('date')
        .equalTo(date)
        .once('value');

    const logs = [];
    snapshot.forEach(child => {
        logs.push({
            id: child.key,
            ...child.val()
        });
    });

    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => b.timestamp - a.timestamp);

    return logs;
}

/**
 * Get all sales logs (for reporting)
 * @param {Object} database - Firebase database reference
 * @param {number} limit - Maximum number of logs to return (default: 1000)
 * @returns {Promise<Array>} Array of log entries
 */
async function getAllSalesLogs(database, limit = 1000) {
    const snapshot = await database.ref('soluongSalesLog')
        .orderByChild('timestamp')
        .limitToLast(limit)
        .once('value');

    const logs = [];
    snapshot.forEach(child => {
        logs.push({
            id: child.key,
            ...child.val()
        });
    });

    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => b.timestamp - a.timestamp);

    return logs;
}

// ES Module exports
export {
    addProductToFirebase,
    addProductsToFirebase,
    removeProductFromFirebase,
    removeProductsFromFirebase,
    updateProductQtyInFirebase,
    updateProductVisibility,
    cleanupOldProducts,
    clearAllProducts,
    loadAllProductsFromFirebase,
    setupFirebaseChildListeners,
    getProductsArray,
    // Cart cache helpers
    getCartCache,
    setCartCache,
    invalidateCartCache,
    // Cart snapshot functions
    saveCartSnapshot,
    getCartSnapshot,
    getAllCartSnapshots,
    restoreProductsFromSnapshot,
    deleteCartSnapshot,
    // Sales log functions
    logSaleTransaction,
    getSalesLogByDate,
    getAllSalesLogs
};
