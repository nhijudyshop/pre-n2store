/**
 * Held Products Manager
 * Manages held products lifecycle - Firebase sync, realtime listeners, cleanup
 *
 * Dependencies:
 * - window.firebase
 * - window.authManager
 * - window.currentChatOrderData
 * - window.getDroppedProducts() - from dropped-products-manager.js
 * - window.getDroppedFirebaseDb() - from dropped-products-manager.js
 * - window.clearHeldByIfNotHeld() - from dropped-products-manager.js
 * - window.renderChatProductsTable() - from chat-products-ui.js
 * - window.renderDroppedProductsTable() - from dropped-products-manager.js
 */
(function () {
    'use strict';

    const DROPPED_PRODUCTS_COLLECTION = 'dropped_products';

    // Debounce timer for render functions to prevent stack overflow
    let renderDebounceTimer = null;
    const RENDER_DEBOUNCE_MS = 150;

    /**
     * Debounced render function to prevent "Maximum call stack size exceeded"
     * when multiple Firebase events fire simultaneously
     */
    function debouncedRender() {
        if (renderDebounceTimer) {
            clearTimeout(renderDebounceTimer);
        }
        renderDebounceTimer = setTimeout(() => {
            // Re-render Orders tab
            if (typeof window.renderChatProductsTable === 'function') {
                window.renderChatProductsTable();
            }
            // Also re-render Dropped tab to update "Người giữ" status
            if (typeof window.renderDroppedProductsTable === 'function') {
                window.renderDroppedProductsTable();
            }
        }, RENDER_DEBOUNCE_MS);
    }

    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================

    /**
     * Get userId from auth state
     * @returns {string|null} userId or null if not authenticated
     */
    function getUserId() {
        if (!window.authManager) return null;

        const auth = window.authManager.getAuthState();
        if (!auth) return null;

        let userId = auth.id || auth.Id || auth.username || auth.userType;
        if (!userId && auth.displayName) {
            userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
        }

        return userId || null;
    }

    /**
     * Show success notification
     * @param {string} message - Message to show
     */
    function showSuccess(message) {
        if (window.notificationManager) {
            window.notificationManager.show(message, 'success');
        } else {
            console.log('[HELD-PRODUCTS] Success:', message);
        }
    }

    /**
     * Show error notification
     * @param {string} message - Message to show
     */
    function showError(message) {
        if (window.notificationManager) {
            window.notificationManager.error(message);
        } else {
            console.error('[HELD-PRODUCTS] Error:', message);
        }
    }

    // =====================================================
    // SAVE HELD PRODUCTS
    // =====================================================

    /**
     * Save held products - marks them as persisted (isDraft: true)
     * After saving, held products will persist even when page is refreshed
     */
    window.saveHeldProducts = async function () {
        if (!window.firebase) {
            console.log('[HELD-PRODUCTS] Firebase not available');
            return false;
        }

        const userId = getUserId();
        if (!userId) {
            console.warn('[HELD-PRODUCTS] No userId found');
            return false;
        }

        const orderId = window.currentChatOrderData?.Id;
        if (!orderId) {
            console.log('[HELD-PRODUCTS] No current order');
            return false;
        }

        try {
            console.log('[HELD-PRODUCTS] Saving held products for user:', userId, 'order:', orderId);

            const heldRef = window.firebase.database().ref(`held_products/${orderId}`);
            const snapshot = await heldRef.once('value');
            const orderProducts = snapshot.val() || {};

            let savedCount = 0;

            for (const productId in orderProducts) {
                const productHolders = orderProducts[productId];
                if (productHolders && productHolders[userId] && !productHolders[userId].isDraft) {
                    // Update isDraft to true (persisted)
                    await window.firebase.database().ref(`held_products/${orderId}/${productId}/${userId}/isDraft`).set(true);
                    savedCount++;
                }
            }

            console.log(`[HELD-PRODUCTS] ✓ Saved ${savedCount} held products`);

            if (savedCount > 0) {
                showSuccess(`Đã lưu ${savedCount} sản phẩm đang giữ`);
            }

            // Re-render to update UI
            if (typeof window.renderChatProductsTable === 'function') {
                window.renderChatProductsTable();
            }

            return true;

        } catch (error) {
            console.error('[HELD-PRODUCTS] ❌ Error saving:', error);
            showError('Lỗi khi lưu sản phẩm giữ');
            return false;
        }
    };

    // =====================================================
    // CLEANUP HELD PRODUCTS
    // =====================================================

    /**
     * Cleanup held products for current user when closing modal or disconnecting
     * Only removes temporary (isDraft: false) held products and returns them to dropped
     */
    window.cleanupHeldProducts = async function () {
        if (!window.firebase) {
            console.log('[HELD-PRODUCTS] Firebase not available');
            return;
        }

        const userId = getUserId();
        if (!userId) {
            console.warn('[HELD-PRODUCTS] No userId found');
            return;
        }

        const orderId = window.currentChatOrderData?.Id;
        if (!orderId) {
            console.log('[HELD-PRODUCTS] No current order');
            return;
        }

        try {
            console.log('[HELD-PRODUCTS] Cleaning up temporary held products for user:', userId, 'order:', orderId);

            // Get all held products for this user in this order
            const heldRef = window.firebase.database().ref(`held_products/${orderId}`);
            const snapshot = await heldRef.once('value');
            const orderProducts = snapshot.val() || {};

            // Get dependencies
            const droppedProducts = typeof window.getDroppedProducts === 'function' ? window.getDroppedProducts() : [];
            const firebaseDb = typeof window.getDroppedFirebaseDb === 'function' ? window.getDroppedFirebaseDb() : null;

            let cleanupCount = 0;

            for (const productId in orderProducts) {
                const productHolders = orderProducts[productId];
                if (productHolders && productHolders[userId]) {
                    const holderData = productHolders[userId];

                    // Only cleanup temporary holds (isDraft === false)
                    // Saved holds (isDraft === true) are persisted
                    if (holderData.isDraft === true) {
                        console.log('[HELD-PRODUCTS] Skipping saved product:', productId);
                        continue;
                    }

                    const heldQuantity = parseInt(holderData.quantity) || 1;

                    // Return quantity back to dropped products
                    const droppedProduct = droppedProducts.find(p => String(p.ProductId) === String(productId));
                    if (droppedProduct && droppedProduct.id && firebaseDb) {
                        // Product exists in dropped - increment quantity
                        const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${droppedProduct.id}`);
                        await itemRef.transaction((current) => {
                            if (current === null) return current;
                            return {
                                ...current,
                                Quantity: (current.Quantity || 0) + heldQuantity
                            };
                        });
                        console.log('[HELD-PRODUCTS] Returned', heldQuantity, 'to existing dropped product:', productId);
                    } else if (firebaseDb && holderData.productName) {
                        // Product from search - add new entry to dropped
                        const newDroppedItem = {
                            ProductId: parseInt(productId),
                            ProductName: holderData.productName,
                            ProductNameGet: holderData.productNameGet || holderData.productName,
                            ProductCode: holderData.productCode || '',
                            ImageUrl: holderData.imageUrl || '',
                            Price: holderData.price || 0,
                            Quantity: heldQuantity,
                            UOMName: holderData.uomName || 'Cái',
                            reason: 'returned_from_held',
                            addedAt: window.firebase.database.ServerValue.TIMESTAMP,
                            addedDate: new Date().toLocaleString('vi-VN')
                        };
                        await firebaseDb.ref(DROPPED_PRODUCTS_COLLECTION).push(newDroppedItem);
                        console.log('[HELD-PRODUCTS] Added', heldQuantity, 'to new dropped product:', productId);
                    }

                    // Remove this user's hold from Firebase
                    await window.firebase.database().ref(`held_products/${orderId}/${productId}/${userId}`).remove();
                    cleanupCount++;

                    // Clear heldBy from dropped products if no one else is holding
                    if (typeof window.clearHeldByIfNotHeld === 'function') {
                        await window.clearHeldByIfNotHeld(productId);
                    }
                }
            }

            console.log(`[HELD-PRODUCTS] ✓ Cleaned up ${cleanupCount} temporary held products`);

        } catch (error) {
            console.error('[HELD-PRODUCTS] ❌ Error cleaning up:', error);
        }
    };

    // =====================================================
    // UPDATE HELD PRODUCT QUANTITY
    // =====================================================

    /**
     * Update held product quantity in Firebase
     * @param {number} productId - Product ID
     * @param {number} quantity - New quantity
     */
    window.updateHeldProductQuantity = async function (productId, quantity) {
        if (!window.firebase) return;

        // Normalize productId to number for consistent comparison
        const normalizedProductId = parseInt(productId);
        if (isNaN(normalizedProductId)) {
            console.error('[HELD-PRODUCTS] Invalid productId:', productId);
            return;
        }

        const userId = getUserId();
        const orderId = window.currentChatOrderData?.Id;
        if (!userId || !orderId) return;

        try {
            const ref = window.firebase.database().ref(`held_products/${orderId}/${normalizedProductId}/${userId}`);

            if (quantity > 0) {
                // Update quantity
                await ref.update({
                    productId: normalizedProductId,  // Store productId as number for easy comparison
                    quantity: quantity,
                    timestamp: Date.now()
                });
                console.log('[HELD-PRODUCTS] ✓ Updated quantity to', quantity, 'for productId:', normalizedProductId);
            } else {
                // Remove if quantity is 0
                await ref.remove();
                console.log('[HELD-PRODUCTS] ✓ Removed (quantity = 0) for productId:', normalizedProductId);

                // Clear heldBy if no one else is holding
                if (typeof window.clearHeldByIfNotHeld === 'function') {
                    await window.clearHeldByIfNotHeld(normalizedProductId);
                }
            }

        } catch (error) {
            console.error('[HELD-PRODUCTS] ❌ Error updating quantity:', error);
        }
    };

    // =====================================================
    // REMOVE HELD PRODUCT
    // =====================================================

    /**
     * Remove held product from Firebase
     * @param {number|string} productId - Product ID to remove (will be normalized to number)
     */
    window.removeHeldProduct = async function (productId) {
        if (!window.firebase) return;

        // Normalize productId to number for consistent Firebase path
        const normalizedProductId = parseInt(productId);
        if (isNaN(normalizedProductId)) {
            console.error('[HELD-PRODUCTS] Invalid productId for removal:', productId);
            return;
        }

        const userId = getUserId();
        const orderId = window.currentChatOrderData?.Id;
        if (!userId || !orderId) return;

        try {
            console.log('[HELD-PRODUCTS] Removing held product:', normalizedProductId);

            const ref = window.firebase.database().ref(`held_products/${orderId}/${normalizedProductId}/${userId}`);
            await ref.remove();

            console.log('[HELD-PRODUCTS] ✓ Removed from Firebase, productId:', normalizedProductId);

            // Clear heldBy from dropped products if no one else is holding
            if (typeof window.clearHeldByIfNotHeld === 'function') {
                await window.clearHeldByIfNotHeld(normalizedProductId);
            }

        } catch (error) {
            console.error('[HELD-PRODUCTS] ❌ Error removing:', error);
        }
    };

    // =====================================================
    // REALTIME LISTENER
    // =====================================================

    /**
     * Setup realtime listener for held products changes
     * Syncs changes from other users in real-time
     */
    window.setupHeldProductsListener = function () {
        if (!window.firebase) return;

        const orderId = window.currentChatOrderData?.Id;
        if (!orderId) return;

        // IMPORTANT: Cleanup any existing listener before setting up new one
        // This prevents duplicate listeners when switching between orders
        if (window.heldProductsListener) {
            console.log('[HELD-PRODUCTS] Cleaning up existing listener before setup');
            window.heldProductsListener.off();
            window.heldProductsListener = null;
        }

        console.log('[HELD-PRODUCTS] Setting up realtime listener for order:', orderId);

        const heldRef = window.firebase.database().ref(`held_products/${orderId}`);

        // Listen for changes
        heldRef.on('value', (snapshot) => {
            const heldData = snapshot.val() || {};

            console.log('[HELD-PRODUCTS] Realtime update received:', Object.keys(heldData).length, 'products');

            // Update window.currentChatOrderData.Details with held products
            if (window.currentChatOrderData && window.currentChatOrderData.Details) {
                // IMPORTANT: Save existing held products info BEFORE removing them
                // This preserves product details for items added from inline search (not from dropped products)
                const existingHeldProducts = {};
                window.currentChatOrderData.Details.filter(p => p.IsHeld).forEach(p => {
                    existingHeldProducts[p.ProductId] = {
                        ProductId: p.ProductId,
                        ProductName: p.ProductName,
                        ProductNameGet: p.ProductNameGet,
                        ProductCode: p.ProductCode,
                        ImageUrl: p.ImageUrl,
                        Price: p.Price,
                        UOMId: p.UOMId,
                        UOMName: p.UOMName,
                        IsFromSearch: p.IsFromSearch,
                        StockQty: p.StockQty
                    };
                });

                // Remove old held products
                window.currentChatOrderData.Details = window.currentChatOrderData.Details.filter(p => !p.IsHeld);

                // Get dropped products for product info lookup
                const droppedProducts = typeof window.getDroppedProducts === 'function' ? window.getDroppedProducts() : [];

                // Add current held products from Firebase
                for (const productId in heldData) {
                    const productHolders = heldData[productId];

                    // Sum quantities from all holders and collect product info from Firebase
                    let totalQuantity = 0;
                    let holders = [];
                    let isFromSearch = false;
                    let firebaseProductInfo = null; // Store product info from Firebase

                    for (const odooUserId in productHolders) {
                        const holderData = productHolders[odooUserId];
                        // Show ALL held products (both temporary and saved)
                        // Temporary holds (isDraft: false) will be cleaned up on page refresh
                        // Saved holds (isDraft: true) will persist
                        if (holderData && (parseInt(holderData.quantity) || 0) > 0) {
                            totalQuantity += parseInt(holderData.quantity) || 0;
                            holders.push(holderData.displayName);
                            if (holderData.isFromSearch) {
                                isFromSearch = true;
                            }
                            // Get product info from Firebase (saved with the held product)
                            if (!firebaseProductInfo && holderData.productName) {
                                firebaseProductInfo = {
                                    ProductName: holderData.productName,
                                    ProductNameGet: holderData.productNameGet || holderData.productName,
                                    ProductCode: holderData.productCode || '',
                                    ImageUrl: holderData.imageUrl || '',
                                    Price: holderData.price || 0,
                                    UOMName: holderData.uomName || 'Cái'
                                };
                            }
                        }
                    }

                    if (totalQuantity > 0) {
                        // Try to find product info from multiple sources:
                        // 1. Existing held product data (from inline search)
                        // 2. Dropped products list
                        // 3. Firebase data (product details saved with held product)
                        const existingHeld = existingHeldProducts[parseInt(productId)];
                        const droppedProduct = droppedProducts.find(p => String(p.ProductId) === String(productId));

                        // Use existing held product data first (preserves inline search products),
                        // then fallback to dropped products, then Firebase data
                        const productSource = existingHeld || droppedProduct || firebaseProductInfo;

                        if (productSource) {
                            window.currentChatOrderData.Details.push({
                                ProductId: parseInt(productId),
                                ProductName: productSource.ProductName,
                                ProductCode: productSource.ProductCode,
                                ProductNameGet: productSource.ProductNameGet || productSource.ProductName,
                                ImageUrl: productSource.ImageUrl,
                                Price: productSource.Price,
                                Quantity: totalQuantity,
                                UOMId: productSource.UOMId || 1,
                                UOMName: productSource.UOMName || 'Cái',
                                Factor: 1,
                                Priority: 0,
                                OrderId: window.currentChatOrderData.Id,
                                LiveCampaign_DetailId: null,
                                ProductWeight: 0,
                                Note: null,
                                IsHeld: true,
                                IsFromSearch: isFromSearch || productSource.IsFromSearch,
                                StockQty: productSource.StockQty || 0,
                                HeldBy: holders.join(', ')
                            });
                        } else {
                            // Product not found in any source - this shouldn't happen normally
                            // but we can still show it with minimal info
                            console.warn('[HELD-PRODUCTS] Product not found in any source:', productId);
                            window.currentChatOrderData.Details.push({
                                ProductId: parseInt(productId),
                                ProductName: `Sản phẩm #${productId}`,
                                ProductCode: '',
                                ProductNameGet: `Sản phẩm #${productId}`,
                                ImageUrl: '',
                                Price: 0,
                                Quantity: totalQuantity,
                                UOMId: 1,
                                UOMName: 'Cái',
                                Factor: 1,
                                Priority: 0,
                                OrderId: window.currentChatOrderData.Id,
                                LiveCampaign_DetailId: null,
                                ProductWeight: 0,
                                Note: null,
                                IsHeld: true,
                                IsFromSearch: isFromSearch,
                                HeldBy: holders.join(', ')
                            });
                        }
                    }
                }

                // Use debounced render to prevent "Maximum call stack size exceeded"
                // when multiple Firebase events fire simultaneously
                debouncedRender();
            }
        });

        // Store reference for cleanup
        window.heldProductsListener = heldRef;
    };

    /**
     * Cleanup held products listener
     */
    window.cleanupHeldProductsListener = function () {
        if (window.heldProductsListener) {
            console.log('[HELD-PRODUCTS] Cleaning up listener');
            window.heldProductsListener.off();
            window.heldProductsListener = null;
        }
    };

    // =====================================================
    // PAGE UNLOAD CLEANUP
    // =====================================================

    /**
     * Remove temporary held products for current user when leaving page
     * Only removes isDraft: false (temporary) holds, saved holds are preserved
     * Called from beforeunload event
     */
    window.cleanupAllUserHeldProducts = async function () {
        if (!window.firebase) return;

        const userId = getUserId();
        if (!userId) return;

        try {
            console.log('[HELD-PRODUCTS] Cleaning up temporary held products for user:', userId);

            // Get dependencies
            const droppedProducts = typeof window.getDroppedProducts === 'function' ? window.getDroppedProducts() : [];
            const firebaseDb = typeof window.getDroppedFirebaseDb === 'function' ? window.getDroppedFirebaseDb() : null;

            // Get all held products across all orders
            const heldProductsRef = window.firebase.database().ref('held_products');
            const snapshot = await heldProductsRef.once('value');
            const allOrders = snapshot.val() || {};

            let cleanupCount = 0;
            let skippedCount = 0;
            const updates = {};
            const returnsToDropped = []; // Track products to return to dropped

            // Scan all orders and mark this user's TEMPORARY held products for removal
            for (const orderId in allOrders) {
                const orderProducts = allOrders[orderId];
                if (!orderProducts) continue;

                for (const productId in orderProducts) {
                    const productHolders = orderProducts[productId];
                    if (productHolders && productHolders[userId]) {
                        const holderData = productHolders[userId];

                        // Only cleanup temporary holds (isDraft !== true)
                        if (holderData.isDraft === true) {
                            skippedCount++;
                            continue; // Skip saved holds
                        }

                        // Mark for removal
                        updates[`${orderId}/${productId}/${userId}`] = null;
                        cleanupCount++;

                        // Track quantity to return to dropped
                        returnsToDropped.push({
                            productId: productId,
                            quantity: parseInt(holderData.quantity) || 1
                        });
                    }
                }
            }

            // Return quantities to dropped products
            for (const item of returnsToDropped) {
                const droppedProduct = droppedProducts.find(p => String(p.ProductId) === String(item.productId));
                if (droppedProduct && droppedProduct.id && firebaseDb) {
                    const itemRef = firebaseDb.ref(`${DROPPED_PRODUCTS_COLLECTION}/${droppedProduct.id}`);
                    await itemRef.transaction((current) => {
                        if (current === null) return current;
                        return {
                            ...current,
                            Quantity: (current.Quantity || 0) + item.quantity
                        };
                    });
                }
            }

            // Perform batch removal of held products
            if (cleanupCount > 0) {
                await heldProductsRef.update(updates);
                console.log(`[HELD-PRODUCTS] ✓ Cleaned up ${cleanupCount} temporary held products, skipped ${skippedCount} saved`);
            } else {
                console.log(`[HELD-PRODUCTS] No temporary held products to clean up (${skippedCount} saved)`);
            }

        } catch (error) {
            console.error('[HELD-PRODUCTS] ❌ Error cleaning up all held products:', error);
        }
    };

    /**
     * Synchronous cleanup for beforeunload (sendBeacon approach)
     * Uses navigator.sendBeacon for reliable cleanup when page unloads
     */
    window.cleanupHeldProductsSync = function () {
        if (!window.firebase) return;

        const userId = getUserId();
        if (!userId) return;

        // Store cleanup info in localStorage for next session to verify
        try {
            const cleanupInfo = {
                userId: userId,
                timestamp: Date.now(),
                pending: true
            };
            localStorage.setItem('orders_held_cleanup_pending', JSON.stringify(cleanupInfo));
            console.log('[HELD-PRODUCTS] Marked cleanup as pending for next session');
        } catch (e) {
            console.error('[HELD-PRODUCTS] Failed to mark cleanup pending:', e);
        }
    };

    /**
     * Check and complete any pending cleanup from previous session
     * Called on page load
     */
    window.checkPendingHeldCleanup = async function () {
        try {
            const pendingCleanup = localStorage.getItem('orders_held_cleanup_pending');
            if (!pendingCleanup) return;

            const cleanupInfo = JSON.parse(pendingCleanup);

            // If cleanup was pending less than 1 hour ago, complete it
            if (cleanupInfo.pending && (Date.now() - cleanupInfo.timestamp) < 3600000) {
                console.log('[HELD-PRODUCTS] Found pending cleanup from previous session');
                await window.cleanupAllUserHeldProducts();
            }

            // Clear pending flag
            localStorage.removeItem('orders_held_cleanup_pending');

        } catch (e) {
            console.error('[HELD-PRODUCTS] Error checking pending cleanup:', e);
            localStorage.removeItem('orders_held_cleanup_pending');
        }
    };

    console.log('[HELD-PRODUCTS-MANAGER] Loaded');

})();
