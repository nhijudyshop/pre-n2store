/**
 * Firebase Helper Functions for Object-based Structure
 * Provides optimized operations for Firebase Realtime Database
 * All paths are scoped by campaignId for per-campaign product management
 */

/**
 * Get the Firebase path prefix for a campaign
 * @param {string} campaignId - Campaign identifier
 * @returns {string} Path prefix like "orderProducts/campaign_123"
 */
function getProductsPath(campaignId) {
    return `orderProducts/${campaignId}`;
}

function getMetaPath(campaignId) {
    return `orderProductsMeta/${campaignId}`;
}

function getCartHistoryPath(campaignId) {
    return `cartHistory/${campaignId}`;
}

function getCartHistoryMetaPath(campaignId) {
    return `cartHistoryMeta/${campaignId}`;
}

/**
 * Add or update a single product in Firebase
 */
async function addProductToFirebase(database, campaignId, product, localProductsObject) {
    if (!campaignId) throw new Error('campaignId is required');
    const productKey = `product_${product.Id}`;
    const existingProduct = localProductsObject[productKey];

    if (existingProduct) {
        const updatedProduct = {
            ...product,
            soldQty: existingProduct.soldQty || 0,
            remainingQty: product.QtyAvailable - (existingProduct.soldQty || 0),
            addedAt: existingProduct.addedAt || product.addedAt,
            lastRefreshed: Date.now()
        };
        await database.ref(`${getProductsPath(campaignId)}/${productKey}`).set(updatedProduct);
        localProductsObject[productKey] = updatedProduct;
        return { action: 'updated', product: updatedProduct };
    } else {
        await database.ref(`${getProductsPath(campaignId)}/${productKey}`).set(product);
        localProductsObject[productKey] = product;

        await database.ref(`${getMetaPath(campaignId)}/sortedIds`).transaction((currentIds) => {
            const ids = currentIds || [];
            const newId = product.Id.toString();
            if (!ids.includes(newId)) {
                ids.unshift(newId);
            }
            return ids;
        });
        await database.ref(`${getMetaPath(campaignId)}/count`).set(Object.keys(localProductsObject).length);
        return { action: 'added', product: product };
    }
}

/**
 * Add multiple products (batch operation)
 */
async function addProductsToFirebase(database, campaignId, products, localProductsObject) {
    if (!campaignId) throw new Error('campaignId is required');
    const updates = {};
    const newIds = [];

    products.forEach(product => {
        const productKey = `product_${product.Id}`;
        const existingProduct = localProductsObject[productKey];

        if (existingProduct) {
            const updatedProduct = {
                ...product,
                soldQty: existingProduct.soldQty || 0,
                remainingQty: product.QtyAvailable - (existingProduct.soldQty || 0),
                addedAt: existingProduct.addedAt || product.addedAt,
                lastRefreshed: Date.now()
            };
            updates[`${getProductsPath(campaignId)}/${productKey}`] = updatedProduct;
            localProductsObject[productKey] = updatedProduct;
        } else {
            updates[`${getProductsPath(campaignId)}/${productKey}`] = product;
            localProductsObject[productKey] = product;
            newIds.push(product.Id.toString());
        }
    });

    await database.ref().update(updates);

    if (newIds.length > 0) {
        await database.ref(`${getMetaPath(campaignId)}/sortedIds`).transaction((currentIds) => {
            const ids = currentIds || [];
            newIds.forEach(id => {
                if (!ids.includes(id)) {
                    ids.unshift(id);
                }
            });
            return ids;
        });
        await database.ref(`${getMetaPath(campaignId)}/count`).set(Object.keys(localProductsObject).length);
    }

    return { added: newIds.length, updated: products.length - newIds.length };
}

/**
 * Remove a product from Firebase
 */
async function removeProductFromFirebase(database, campaignId, productId, localProductsObject) {
    if (!campaignId) throw new Error('campaignId is required');
    const productKey = `product_${productId}`;

    await database.ref(`${getProductsPath(campaignId)}/${productKey}`).remove();
    delete localProductsObject[productKey];

    await database.ref(`${getMetaPath(campaignId)}/sortedIds`).transaction((currentIds) => {
        return (currentIds || []).filter(id => id !== productId.toString());
    });
    await database.ref(`${getMetaPath(campaignId)}/count`).set(Object.keys(localProductsObject).length);
}

/**
 * Update product quantity (soldQty)
 */
async function updateProductQtyInFirebase(database, campaignId, productId, change, localProductsObject) {
    if (!campaignId) throw new Error('campaignId is required');
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];
    if (!product) return;

    const newSoldQty = Math.max(0, Math.min(product.QtyAvailable, (product.soldQty || 0) + change));
    if (newSoldQty === product.soldQty) return;

    product.soldQty = newSoldQty;
    await database.ref(`${getProductsPath(campaignId)}/${productKey}`).update({
        soldQty: newSoldQty
    });
}

/**
 * Hide/unhide a product
 */
async function updateProductVisibility(database, campaignId, productId, isHidden, localProductsObject) {
    if (!campaignId) throw new Error('campaignId is required');
    const productKey = `product_${productId}`;
    const product = localProductsObject[productKey];
    if (!product) return;

    product.isHidden = isHidden;
    await database.ref(`${getProductsPath(campaignId)}/${productKey}/isHidden`).set(isHidden);
}

/**
 * Delete multiple products permanently from Firebase in a single batch operation
 */
async function removeProductsFromFirebase(database, campaignId, productIds, localProductsObject) {
    if (!campaignId) throw new Error('campaignId is required');
    if (!productIds || productIds.length === 0) return;

    const updates = {};
    const idsToRemove = [];

    productIds.forEach(productId => {
        const productKey = `product_${productId}`;
        updates[`${getProductsPath(campaignId)}/${productKey}`] = null;
        idsToRemove.push(productId.toString());
        delete localProductsObject[productKey];
    });

    await database.ref().update(updates);

    await database.ref(`${getMetaPath(campaignId)}/sortedIds`).transaction((currentIds) => {
        return (currentIds || []).filter(id => !idsToRemove.includes(id));
    });
    await database.ref(`${getMetaPath(campaignId)}/count`).set(Object.keys(localProductsObject).length);
}

/**
 * Cleanup old products (older than 7 days)
 */
async function cleanupOldProducts(database, campaignId, localProductsObject) {
    if (!campaignId) return { removed: 0 };
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    const productsToRemove = Object.entries(localProductsObject).filter(([key, product]) => {
        return (Date.now() - (product.addedAt || 0)) >= SEVEN_DAYS;
    });

    if (productsToRemove.length === 0) return { removed: 0 };

    const updates = {};
    const idsToRemove = [];

    productsToRemove.forEach(([productKey, product]) => {
        updates[`${getProductsPath(campaignId)}/${productKey}`] = null;
        idsToRemove.push(product.Id.toString());
    });

    await database.ref().update(updates);

    await database.ref(`${getMetaPath(campaignId)}/sortedIds`).transaction((currentIds) => {
        return (currentIds || []).filter(id => !idsToRemove.includes(id));
    });

    productsToRemove.forEach(([productKey]) => {
        delete localProductsObject[productKey];
    });

    await database.ref(`${getMetaPath(campaignId)}/count`).set(Object.keys(localProductsObject).length);
    return { removed: productsToRemove.length };
}

/**
 * Clear all products for a campaign
 */
async function clearAllProducts(database, campaignId, localProductsObject) {
    if (!campaignId) throw new Error('campaignId is required');

    await database.ref(getProductsPath(campaignId)).remove();
    await database.ref(getMetaPath(campaignId)).set({
        sortedIds: [],
        count: 0,
        lastUpdated: Date.now()
    });

    Object.keys(localProductsObject).forEach(key => delete localProductsObject[key]);
}

/**
 * Load all products from Firebase for a specific campaign
 */
async function loadAllProductsFromFirebase(database, campaignId) {
    if (!campaignId) return {};
    try {
        const productsSnapshot = await database.ref(getProductsPath(campaignId)).once('value');
        const productsObject = productsSnapshot.val();
        if (!productsObject || typeof productsObject !== 'object') return {};
        return productsObject;
    } catch (error) {
        console.error('Error loading products:', error);
        return {};
    }
}

/**
 * Setup Firebase child listeners for realtime updates (campaign-scoped)
 */
function setupFirebaseChildListeners(database, campaignId, localProductsObject, callbacks) {
    if (!campaignId) return { detach: () => {} };
    const productsRef = database.ref(getProductsPath(campaignId));

    console.log(`🔧 Setting up Firebase child listeners for campaign: ${campaignId}`);

    const alreadyLoaded = Object.keys(localProductsObject).length > 0;
    let isInitialLoad = !alreadyLoaded;
    let initialLoadCount = 0;

    productsRef.on('child_added', (snapshot) => {
        const product = snapshot.val();
        const productKey = snapshot.key;

        if (alreadyLoaded) {
            if (!localProductsObject[productKey]) {
                localProductsObject[productKey] = product;
                if (callbacks.onProductAdded) callbacks.onProductAdded(product);
            }
            return;
        }

        if (isInitialLoad) {
            initialLoadCount++;
            localProductsObject[productKey] = product;
            database.ref(`${getMetaPath(campaignId)}/count`).once('value', (snapshot) => {
                const expectedCount = snapshot.val() || 0;
                if (expectedCount === 0 || initialLoadCount >= expectedCount) {
                    isInitialLoad = false;
                    if (callbacks.onInitialLoadComplete) callbacks.onInitialLoadComplete();
                }
            });
            return;
        }

        if (!localProductsObject[productKey]) {
            localProductsObject[productKey] = product;
            if (callbacks.onProductAdded) callbacks.onProductAdded(product);
        }
    });

    productsRef.on('child_changed', (snapshot) => {
        const updatedProduct = snapshot.val();
        const productKey = snapshot.key;
        localProductsObject[productKey] = updatedProduct;
        if (callbacks.onProductChanged) callbacks.onProductChanged(updatedProduct, productKey);
    });

    productsRef.on('child_removed', (snapshot) => {
        const removedProduct = snapshot.val();
        const productKey = snapshot.key;
        if (localProductsObject[productKey]) {
            delete localProductsObject[productKey];
            if (callbacks.onProductRemoved) callbacks.onProductRemoved(removedProduct, productKey);
        }
    });

    if (alreadyLoaded && callbacks.onInitialLoadComplete) {
        callbacks.onInitialLoadComplete();
    } else if (!alreadyLoaded && Object.keys(localProductsObject).length === 0) {
        database.ref(`${getMetaPath(campaignId)}/count`).once('value', (snapshot) => {
            const expectedCount = snapshot.val() || 0;
            if (expectedCount === 0) {
                isInitialLoad = false;
                if (callbacks.onInitialLoadComplete) callbacks.onInitialLoadComplete();
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
 */
function getProductsArray(productsObject, sortedIds = null) {
    const productsArray = Object.values(productsObject);

    if (!sortedIds || sortedIds.length === 0) {
        return productsArray.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }

    return productsArray.sort((a, b) => {
        const indexA = sortedIds.indexOf(a.Id.toString());
        const indexB = sortedIds.indexOf(b.Id.toString());
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return (b.addedAt || 0) - (a.addedAt || 0);
    });
}

/**
 * ============================================================================
 * CART HISTORY / SNAPSHOT FUNCTIONS (campaign-scoped)
 * ============================================================================
 */

async function saveCartSnapshot(database, campaignId, snapshot) {
    if (!campaignId) throw new Error('campaignId is required');
    const snapshotId = `snapshot_${snapshot.metadata.savedAt}`;

    await database.ref(`${getCartHistoryPath(campaignId)}/${snapshotId}`).set(snapshot);

    const metaRef = database.ref(getCartHistoryMetaPath(campaignId));
    const metaSnapshot = await metaRef.once('value');
    const currentMeta = metaSnapshot.val() || { sortedIds: [], count: 0 };
    const currentIds = Array.isArray(currentMeta.sortedIds) ? currentMeta.sortedIds : [];
    const newSortedIds = [snapshotId, ...currentIds];

    await metaRef.set({
        sortedIds: newSortedIds,
        count: newSortedIds.length,
        lastUpdated: Date.now()
    });

    return snapshotId;
}

async function getCartSnapshot(database, campaignId, snapshotId) {
    if (!campaignId) return null;
    const snapshot = await database.ref(`${getCartHistoryPath(campaignId)}/${snapshotId}`).once('value');
    const data = snapshot.val();
    if (!data) return null;
    return { id: snapshotId, ...data };
}

async function getAllCartSnapshots(database, campaignId) {
    if (!campaignId) return [];
    const metaSnapshot = await database.ref(getCartHistoryMetaPath(campaignId)).once('value');
    const meta = metaSnapshot.val();
    if (!meta) return [];

    const sortedIds = Array.isArray(meta.sortedIds) ? meta.sortedIds : [];
    if (sortedIds.length === 0) return [];

    const snapshots = [];
    for (const snapshotId of sortedIds) {
        const snapshot = await getCartSnapshot(database, campaignId, snapshotId);
        if (snapshot) snapshots.push(snapshot);
    }
    return snapshots;
}

async function restoreProductsFromSnapshot(database, campaignId, snapshotProducts, localProductsObject) {
    if (!campaignId) throw new Error('campaignId is required');
    const updates = {};
    const productIds = [];

    Object.entries(snapshotProducts).forEach(([key, product]) => {
        updates[`${getProductsPath(campaignId)}/${key}`] = product;
        productIds.push(product.Id);
        localProductsObject[key] = product;
    });

    updates[getMetaPath(campaignId)] = {
        sortedIds: productIds,
        count: productIds.length,
        lastUpdated: Date.now()
    };

    await database.ref().update(updates);
}

async function deleteCartSnapshot(database, campaignId, snapshotId) {
    if (!campaignId) throw new Error('campaignId is required');

    await database.ref(`${getCartHistoryPath(campaignId)}/${snapshotId}`).remove();

    const metaRef = database.ref(getCartHistoryMetaPath(campaignId));
    const metaSnapshot = await metaRef.once('value');
    const currentMeta = metaSnapshot.val() || { sortedIds: [], count: 0 };
    const currentIds = Array.isArray(currentMeta.sortedIds) ? currentMeta.sortedIds : [];
    const newSortedIds = currentIds.filter(id => id !== snapshotId);

    await metaRef.set({
        sortedIds: newSortedIds,
        count: newSortedIds.length,
        lastUpdated: Date.now()
    });
}
