/**
 * Chat Products Actions
 * Actions on held and main products - confirm, delete, update quantity
 *
 * Dependencies:
 * - window.currentChatOrderData
 * - window.getChatOrderDetails() / window.setChatOrderDetails() - from tab1-orders.js
 * - window.renderChatProductsTable() - from chat-products-ui.js
 * - window.saveChatProductsToFirebase() - from tab1-orders.js
 * - window.updateHeldProductQuantity() - from held-products-manager.js
 * - window.removeHeldProduct() - from held-products-manager.js
 * - window.addToDroppedProducts() - from dropped-products-manager.js
 * - window.renderDroppedProductsTable() - from dropped-products-manager.js
 * - window.getOrderDetails() - from tab1-orders.js
 * - window.updateOrderWithFullPayload() - from tab1-orders.js
 * - window.productSearchManager
 * - window.tokenManager
 * - window.kpiManager
 * - window.notificationManager
 * - window.CustomPopup
 */
(function () {
    'use strict';

    // Lock state to prevent duplicate confirmHeldProduct calls
    const confirmHeldProductLocks = new Set();

    // Export locks for external access
    window.confirmHeldProductLocks = confirmHeldProductLocks;

    // =====================================================
    // CONFIRM HELD PRODUCT
    // =====================================================

    /**
     * Confirm held product - Move from held list to main product list
     * Fetches full product details from TPOS, updates order on backend, and removes from Firebase held_products
     * @param {number|string} productId - Product ID (will be normalized to number)
     */
    window.confirmHeldProduct = async function (productId) {
        // Normalize productId to number for consistent comparison
        const normalizedProductId = parseInt(productId);
        if (isNaN(normalizedProductId)) {
            console.error('[HELD-CONFIRM] Invalid product ID:', productId);
            if (window.notificationManager) {
                window.notificationManager.error("ID sản phẩm không hợp lệ");
            }
            return;
        }

        // Lock key includes orderId to allow same product in different orders
        const orderId = window.currentChatOrderData?.Id;
        const lockKey = `${orderId}_${normalizedProductId}`;

        // Check if already processing this product
        if (confirmHeldProductLocks.has(lockKey)) {
            console.warn('[HELD-CONFIRM] Already processing product:', normalizedProductId, '- skipping duplicate call');
            return;
        }

        // Acquire lock
        confirmHeldProductLocks.add(lockKey);
        console.log('[HELD-CONFIRM] Lock acquired for:', lockKey);

        try {
            // Find the held product using normalized ID
            const heldProduct = window.currentChatOrderData?.Details?.find(
                p => p.ProductId === normalizedProductId && p.IsHeld === true
            );

            if (!heldProduct) {
                throw new Error("Không tìm thấy sản phẩm giữ");
            }

            // Show loading notification
            if (window.notificationManager) {
                window.notificationManager.show("Đang xác nhận sản phẩm...", "info");
            }

            // KPI CHECK: Before confirming first product, ask user if they want to track KPI
            // Get current main products (before adding new one) for potential BASE save
            const currentMainProducts = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
            const orderSTT = window.currentChatOrderData.SessionIndex || window.currentChatOrderData.STT || window.currentChatOrderData.Stt || 0;

            if (window.kpiManager) {
                try {
                    // This will check if BASE exists and prompt user if not
                    await window.kpiManager.promptAndSaveKPIBase(orderId, orderSTT, currentMainProducts);
                } catch (kpiError) {
                    console.warn('[HELD-CONFIRM] KPI check failed (non-blocking):', kpiError);
                }
            }

            // Fetch full product details from TPOS using normalized ID
            const fullProduct = await window.productSearchManager.getFullProductDetails(normalizedProductId);
            if (!fullProduct) {
                throw new Error("Không tìm thấy thông tin sản phẩm từ TPOS");
            }

            // Fetch product template image if needed
            if ((!fullProduct.ImageUrl || fullProduct.ImageUrl === "") &&
                (!fullProduct.Thumbnails || fullProduct.Thumbnails.length === 0)) {
                if (fullProduct.ProductTmplId) {
                    try {
                        const templateApiUrl = window.productSearchManager.PRODUCT_API_BASE.replace('/Product', '/ProductTemplate');
                        const url = `${templateApiUrl}(${fullProduct.ProductTmplId})?$expand=Images`;
                        const headers = await window.tokenManager.getAuthHeader();
                        const response = await fetch(url, { method: "GET", headers: headers });

                        if (response.ok) {
                            const templateData = await response.json();
                            if (templateData.ImageUrl) fullProduct.ImageUrl = templateData.ImageUrl;
                        }
                    } catch (e) {
                        console.warn(`[HELD-CONFIRM] Failed to fetch product template ${fullProduct.ProductTmplId}`, e);
                    }
                }
            }

            // Validate sale price
            const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;
            if (salePrice == null || salePrice < 0) {
                throw new Error(`Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" không có giá bán`);
            }

            // STEP 1: Remove held product from local Details array first
            window.currentChatOrderData.Details = window.currentChatOrderData.Details.filter(
                p => !(p.ProductId === normalizedProductId && p.IsHeld === true)
            );

            // STEP 2: Check if product already exists in main list (non-held) using normalized ID
            const existingIndex = window.currentChatOrderData.Details.findIndex(
                p => p.ProductId === normalizedProductId && !p.IsHeld
            );

            let newProduct = null;

            if (existingIndex >= 0) {
                // Add quantity to existing product
                window.currentChatOrderData.Details[existingIndex].Quantity += heldProduct.Quantity;
                // Update note if held product has one and existing doesn't
                if (heldProduct.Note && !window.currentChatOrderData.Details[existingIndex].Note) {
                    window.currentChatOrderData.Details[existingIndex].Note = heldProduct.Note;
                }
                console.log('[HELD-CONFIRM] Merged with existing product, new qty:',
                    window.currentChatOrderData.Details[existingIndex].Quantity);
            } else {
                // Create new product object for main list
                newProduct = {
                    ProductId: fullProduct.Id,
                    Quantity: heldProduct.Quantity,
                    Price: salePrice,
                    Note: heldProduct.Note || null,  // Preserve note from held product
                    UOMId: fullProduct.UOM?.Id || 1,
                    Factor: 1,
                    Priority: 0,
                    OrderId: window.currentChatOrderData.Id,
                    LiveCampaign_DetailId: null,
                    ProductWeight: 0,

                    // Computed fields - use original names from held product if available
                    ProductName: heldProduct.ProductName || fullProduct.Name || fullProduct.NameTemplate,
                    ProductNameGet: heldProduct.ProductNameGet || fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                    ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                    UOMName: fullProduct.UOM?.Name || "Cái",
                    ImageUrl: fullProduct.ImageUrl || (fullProduct.Thumbnails && fullProduct.Thumbnails[0]) || fullProduct.Parent?.ImageUrl || '',
                    IsOrderPriority: null,
                    QuantityRegex: null,
                    IsDisabledLiveCampaignDetail: false,

                    // Additional fields
                    Name: heldProduct.ProductName || heldProduct.Name || fullProduct.Name,
                    Code: fullProduct.DefaultCode || fullProduct.Barcode
                };

                window.currentChatOrderData.Details.push(newProduct);
            }

            // STEP 3: Get only main products (non-held) for API update
            const mainProducts = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
            const totalQuantity = mainProducts.reduce((sum, p) => sum + (p.Quantity || 0), 0);
            const totalAmount = mainProducts.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

            console.log('[HELD-CONFIRM] Updating order on backend:', {
                orderId: window.currentChatOrderData.Id,
                mainProductsCount: mainProducts.length,
                totalQuantity,
                totalAmount
            });

            // STEP 4: Update order on backend via API
            await window.updateOrderWithFullPayload(
                window.currentChatOrderData,
                mainProducts,
                totalAmount,
                totalQuantity
            );

            console.log('[HELD-CONFIRM] ✓ Order updated on backend');

            // STEP 5: Remove from Firebase held_products
            if (typeof window.removeHeldProduct === 'function') {
                await window.removeHeldProduct(normalizedProductId);
                console.log('[HELD-CONFIRM] ✓ Removed from Firebase held_products');
            }

            // STEP 6: Sync currentChatOrderDetails for consistency
            const newDetails = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
            if (typeof window.setChatOrderDetails === 'function') {
                window.setChatOrderDetails(newDetails);
            }

            // STEP 7: Re-render Orders tab
            if (typeof window.renderChatProductsTable === 'function') {
                window.renderChatProductsTable();
            }
            if (typeof window.saveChatProductsToFirebase === 'function') {
                window.saveChatProductsToFirebase('shared', newDetails);
            }

            // STEP 8: Trigger Dropped tab re-render to update "Người giữ" status
            if (typeof window.renderDroppedProductsTable === 'function') {
                await window.renderDroppedProductsTable();
            }

            // Show success notification
            if (window.notificationManager) {
                window.notificationManager.show("✅ Đã xác nhận và thêm vào đơn hàng", "success");
            }

            console.log('[HELD-CONFIRM] ✓ Confirmed held product:', normalizedProductId);

        } catch (error) {
            console.error('[HELD-CONFIRM] Error:', error);
            if (window.notificationManager) {
                window.notificationManager.error("❌ Lỗi khi xác nhận: " + error.message);
            } else {
                alert("❌ Lỗi khi xác nhận: " + error.message);
            }
        } finally {
            // Always release the lock
            const currentOrderId = window.currentChatOrderData?.Id;
            const currentLockKey = `${currentOrderId}_${normalizedProductId}`;
            confirmHeldProductLocks.delete(currentLockKey);
            console.log('[HELD-CONFIRM] Lock released for:', currentLockKey);
        }
    };

    // =====================================================
    // DELETE HELD PRODUCT
    // =====================================================

    /**
     * Delete held product - Remove from held list with confirmation
     * @param {number|string} productId - Product ID (will be normalized to number)
     */
    window.deleteHeldProduct = async function (productId) {
        try {
            // Normalize productId to number for consistent comparison
            const normalizedProductId = parseInt(productId);
            if (isNaN(normalizedProductId)) {
                throw new Error("Invalid product ID");
            }

            // Find the held product using normalized ID
            const heldProduct = window.currentChatOrderData?.Details?.find(
                p => p.ProductId === normalizedProductId && p.IsHeld === true
            );

            if (!heldProduct) {
                if (window.notificationManager) {
                    window.notificationManager.error("Không tìm thấy sản phẩm giữ");
                }
                return;
            }

            // Show confirmation dialog
            const confirmed = window.CustomPopup
                ? await window.CustomPopup.confirm(
                    `Bạn có chắc muốn xóa sản phẩm "${heldProduct.ProductName || heldProduct.Name}" khỏi danh sách giữ?`,
                    'Xác nhận xóa'
                )
                : confirm(`Bạn có chắc muốn xóa sản phẩm "${heldProduct.ProductName || heldProduct.Name}" khỏi danh sách giữ?`);

            if (!confirmed) return;

            // Remove from Firebase held_products using normalized ID
            if (typeof window.removeHeldProduct === 'function') {
                await window.removeHeldProduct(normalizedProductId);
            }

            // Trigger Dropped tab re-render to update "Người giữ" status
            if (typeof window.renderDroppedProductsTable === 'function') {
                await window.renderDroppedProductsTable();
            }

            // Show success notification
            if (window.notificationManager) {
                window.notificationManager.show("✅ Đã xóa sản phẩm khỏi danh sách giữ", "success");
            }

            console.log('[HELD-DELETE] ✓ Deleted held product:', normalizedProductId);

        } catch (error) {
            console.error('[HELD-DELETE] Error:', error);
            if (window.notificationManager) {
                window.notificationManager.error("❌ Lỗi khi xóa: " + error.message);
            } else {
                alert("❌ Lỗi khi xóa: " + error.message);
            }
        }
    };

    // =====================================================
    // UPDATE HELD PRODUCT QUANTITY BY ID
    // =====================================================

    /**
     * Update held product quantity by ProductId
     * This version uses ProductId instead of array index to avoid bugs when arrays are filtered
     * @param {number} productId - Product ID to update
     * @param {number} delta - Amount to add/subtract (-1 or +1)
     * @param {string|null} specificValue - Specific value to set (from input field)
     */
    window.updateHeldProductQuantityById = function (productId, delta, specificValue = null) {
        // Normalize productId
        const normalizedProductId = parseInt(productId);
        if (isNaN(normalizedProductId)) {
            console.error('[UPDATE-QTY] Invalid productId:', productId);
            return;
        }

        // Get the correct data source
        const currentChatOrderDetails = typeof window.getChatOrderDetails === 'function'
            ? window.getChatOrderDetails()
            : [];
        const productsArray = (window.currentChatOrderData && window.currentChatOrderData.Details)
            ? window.currentChatOrderData.Details
            : currentChatOrderDetails;

        // Find product by ProductId and IsHeld flag
        const product = productsArray.find(p => p.ProductId === normalizedProductId && p.IsHeld === true);
        if (!product) {
            console.error('[UPDATE-QTY] Held product not found:', normalizedProductId);
            return;
        }

        // Update quantity
        if (specificValue !== null) {
            const val = parseInt(specificValue);
            if (val > 0) product.Quantity = val;
        } else {
            const newQty = (product.Quantity || 0) + delta;
            if (newQty > 0) product.Quantity = newQty;
        }

        // Sync to Firebase
        if (typeof window.updateHeldProductQuantity === 'function') {
            window.updateHeldProductQuantity(product.ProductId, product.Quantity);
        }

        // Sync both arrays if needed
        if (window.currentChatOrderData && window.currentChatOrderData.Details) {
            const newDetails = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
            if (typeof window.setChatOrderDetails === 'function') {
                window.setChatOrderDetails(newDetails);
            }
        }

        if (typeof window.renderChatProductsTable === 'function') {
            window.renderChatProductsTable();
        }
        if (typeof window.saveChatProductsToFirebase === 'function') {
            const details = typeof window.getChatOrderDetails === 'function' ? window.getChatOrderDetails() : [];
            window.saveChatProductsToFirebase('shared', details);
        }
    };

    // =====================================================
    // UPDATE CHAT PRODUCT NOTE
    // =====================================================

    /**
     * Update product note in chat order
     * Triggered when user clicks outside the note input (onblur)
     * Updates both local data and backend via API
     * @param {number} productId - Product ID to update
     * @param {string} newNote - New note value
     */
    window.updateChatProductNote = async function (productId, newNote) {
        // Normalize productId
        const normalizedProductId = parseInt(productId);
        if (isNaN(normalizedProductId)) {
            console.error('[UPDATE-NOTE] Invalid productId:', productId);
            return;
        }

        // Get the correct data source
        const productsArray = (window.currentChatOrderData && window.currentChatOrderData.Details)
            ? window.currentChatOrderData.Details
            : [];

        // Find product by ProductId (both held and non-held)
        const product = productsArray.find(p => p.ProductId === normalizedProductId);
        if (!product) {
            console.error('[UPDATE-NOTE] Product not found:', normalizedProductId);
            return;
        }

        // Check if note actually changed
        const oldNote = product.Note || '';
        const trimmedNewNote = (newNote || '').trim();

        if (oldNote === trimmedNewNote) {
            console.log('[UPDATE-NOTE] Note unchanged, skipping update');
            return;
        }

        // Update note in local data
        product.Note = trimmedNewNote || null;
        console.log('[UPDATE-NOTE] Updated local note for product:', normalizedProductId, '→', trimmedNewNote);

        // If it's a held product, don't update backend (will be saved when confirmed)
        if (product.IsHeld === true) {
            if (window.notificationManager) {
                window.notificationManager.show("✓ Ghi chú đã cập nhật", "success", 1500);
            }
            return;
        }

        // For main products (non-held), update backend via API
        try {
            const orderId = window.currentChatOrderData?.Id;
            if (!orderId) {
                throw new Error("Không tìm thấy đơn hàng");
            }

            // Get only main products for API update
            const mainProducts = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
            const totalQuantity = mainProducts.reduce((sum, p) => sum + (p.Quantity || 0), 0);
            const totalAmount = mainProducts.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

            console.log('[UPDATE-NOTE] Updating order on backend:', {
                orderId,
                productId: normalizedProductId,
                newNote: trimmedNewNote
            });

            // Update order on backend
            await window.updateOrderWithFullPayload(
                window.currentChatOrderData,
                mainProducts,
                totalAmount,
                totalQuantity
            );

            console.log('[UPDATE-NOTE] ✓ Order note updated successfully');

            // Show success notification
            if (window.notificationManager) {
                window.notificationManager.show("✓ Ghi chú đã lưu", "success", 1500);
            }

        } catch (error) {
            console.error('[UPDATE-NOTE] Error updating note:', error);
            if (window.notificationManager) {
                window.notificationManager.error("❌ Lỗi khi lưu ghi chú: " + error.message);
            }
        }
    };

    // =====================================================
    // DECREASE MAIN PRODUCT QUANTITY BY ID
    // =====================================================

    /**
     * Decrease main product quantity by ProductId
     * Shows confirmation, updates order via API, moves 1 product to dropped
     * @param {number} productId - Product ID to decrease
     */
    window.decreaseMainProductQuantityById = async function (productId) {
        // Normalize productId
        const normalizedProductId = parseInt(productId);
        if (isNaN(normalizedProductId)) {
            console.error('[DECREASE] Invalid productId:', productId);
            return;
        }

        // Get the correct data source
        const currentChatOrderDetails = typeof window.getChatOrderDetails === 'function'
            ? window.getChatOrderDetails()
            : [];
        const productsArray = (window.currentChatOrderData && window.currentChatOrderData.Details)
            ? window.currentChatOrderData.Details
            : currentChatOrderDetails;

        // Find product by ProductId (non-held only)
        const product = productsArray.find(p => p.ProductId === normalizedProductId && !p.IsHeld);
        if (!product) {
            console.error('[DECREASE] Main product not found:', normalizedProductId);
            return;
        }

        // Show confirmation
        const productName = product.ProductName || product.Name || 'Sản phẩm';
        const confirmMsg = `Xóa 1 "${productName}" khỏi đơn hàng?\n\nSản phẩm sẽ được chuyển sang hàng rớt-xả.`;

        let confirmed = false;
        if (window.CustomPopup) {
            confirmed = await window.CustomPopup.confirm(confirmMsg, 'Xác nhận xóa sản phẩm');
        } else {
            confirmed = confirm(confirmMsg);
        }

        if (!confirmed) return;

        try {
            // Show loading
            if (window.notificationManager) {
                window.notificationManager.show("Đang cập nhật đơn hàng...", "info");
            }

            // Fetch latest order data from API to ensure we have fresh data
            const orderId = window.currentChatOrderData?.Id;
            if (!orderId) {
                throw new Error("Không tìm thấy đơn hàng");
            }

            console.log('[DECREASE-BY-ID] Fetching latest order data:', orderId);
            const freshOrderData = await window.getOrderDetails(orderId);

            // Update window.currentChatOrderData with fresh data
            window.currentChatOrderData = freshOrderData;

            // Find the product in fresh data by ProductId
            const freshProductIndex = freshOrderData.Details.findIndex(
                p => p.ProductId === normalizedProductId && !p.IsHeld
            );

            if (freshProductIndex === -1) {
                throw new Error("Không tìm thấy sản phẩm trong đơn hàng");
            }

            const freshProduct = freshOrderData.Details[freshProductIndex];

            // Create product object to add to dropped
            const droppedProductData = {
                ProductId: freshProduct.ProductId,
                ProductName: freshProduct.ProductName || freshProduct.Name,
                ProductNameGet: freshProduct.ProductNameGet || freshProduct.ProductName || freshProduct.Name,
                ProductCode: freshProduct.ProductCode || freshProduct.Code,
                Price: freshProduct.Price || 0,
                ImageUrl: freshProduct.ImageUrl || '',
                UOMId: freshProduct.UOMId || 1,
                UOMName: freshProduct.UOMName || 'Cái',
                Quantity: 1 // Moving 1 quantity to dropped
            };

            console.log('[DECREASE-BY-ID] Moving 1 to dropped:', droppedProductData);

            // Add to dropped products
            if (typeof window.addToDroppedProducts === 'function') {
                await window.addToDroppedProducts(droppedProductData, 1, 'removed', null);
            }

            // Decrease quantity in order
            if (freshProduct.Quantity <= 1) {
                // Remove product entirely
                freshOrderData.Details.splice(freshProductIndex, 1);
            } else {
                // Decrease by 1
                freshProduct.Quantity -= 1;
            }

            // Get only main products for API update
            const newDetails = freshOrderData.Details.filter(p => !p.IsHeld);
            const totalQuantity = newDetails.reduce((sum, p) => sum + (p.Quantity || 0), 0);
            const totalAmount = newDetails.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

            console.log('[DECREASE-BY-ID] Updating order on backend:', {
                orderId: freshOrderData.Id,
                newDetailsCount: newDetails.length,
                totalQuantity,
                totalAmount
            });

            // Update order on backend
            await window.updateOrderWithFullPayload(
                freshOrderData,
                newDetails,
                totalAmount,
                totalQuantity
            );

            console.log('[DECREASE-BY-ID] ✓ Order updated successfully');

            // Sync arrays
            if (typeof window.setChatOrderDetails === 'function') {
                window.setChatOrderDetails(freshOrderData.Details.filter(p => !p.IsHeld));
            }

            // Re-render UI
            if (typeof window.renderChatProductsTable === 'function') {
                window.renderChatProductsTable();
            }
            if (typeof window.saveChatProductsToFirebase === 'function') {
                const details = typeof window.getChatOrderDetails === 'function' ? window.getChatOrderDetails() : [];
                window.saveChatProductsToFirebase('shared', details);
            }

            // Re-render Dropped tab if visible
            if (typeof window.renderDroppedProductsTable === 'function') {
                await window.renderDroppedProductsTable();
            }

            // Show success notification
            if (window.notificationManager) {
                window.notificationManager.show("✅ Đã chuyển 1 sản phẩm sang hàng rớt", "success");
            }

        } catch (error) {
            console.error('[DECREASE-BY-ID] Error:', error);
            if (window.notificationManager) {
                window.notificationManager.error("❌ Lỗi: " + error.message);
            }
        }
    };

    // =====================================================
    // LEGACY FUNCTIONS (for backward compatibility)
    // =====================================================

    /**
     * Update product quantity in chat order (legacy - by index)
     * @deprecated Use updateHeldProductQuantityById instead
     * Works with both currentChatOrderDetails and window.currentChatOrderData.Details
     * Syncs held products to Firebase for multi-user collaboration
     */
    window.updateChatProductQuantity = function (index, delta, specificValue = null) {
        // Get the correct data source
        const currentChatOrderDetails = typeof window.getChatOrderDetails === 'function'
            ? window.getChatOrderDetails()
            : [];
        const productsArray = (window.currentChatOrderData && window.currentChatOrderData.Details)
            ? window.currentChatOrderData.Details
            : currentChatOrderDetails;

        if (index < 0 || index >= productsArray.length) return;

        const product = productsArray[index];
        const isHeldProduct = product.IsHeld === true;

        if (specificValue !== null) {
            const val = parseInt(specificValue);
            if (val > 0) product.Quantity = val;
        } else {
            const newQty = (product.Quantity || 0) + delta;
            if (newQty > 0) product.Quantity = newQty;
        }

        // If it's a held product, sync to Firebase
        if (isHeldProduct && typeof window.updateHeldProductQuantity === 'function') {
            window.updateHeldProductQuantity(product.ProductId, product.Quantity);
        }

        // Sync both arrays if needed
        if (window.currentChatOrderData && window.currentChatOrderData.Details) {
            const newDetails = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
            if (typeof window.setChatOrderDetails === 'function') {
                window.setChatOrderDetails(newDetails);
            }
        }

        if (typeof window.renderChatProductsTable === 'function') {
            window.renderChatProductsTable();
        }
        if (typeof window.saveChatProductsToFirebase === 'function') {
            const details = typeof window.getChatOrderDetails === 'function' ? window.getChatOrderDetails() : [];
            window.saveChatProductsToFirebase('shared', details);
        }
    };

    console.log('[CHAT-PRODUCTS-ACTIONS] Loaded');

})();
