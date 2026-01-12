/**
 * Chat Products UI
 * UI rendering for chat panel - product tables, cards, search
 *
 * Dependencies:
 * - window.currentChatOrderData
 * - window.getChatOrderDetails() / window.setChatOrderDetails() - from tab1-orders.js
 * - window.saveHeldProducts() - from held-products-manager.js
 * - window.confirmHeldProduct() - from chat-products-actions.js
 * - window.deleteHeldProduct() - from chat-products-actions.js
 * - window.updateHeldProductQuantityById() - from chat-products-actions.js
 * - window.decreaseMainProductQuantityById() - from chat-products-actions.js
 * - window.productSearchManager
 * - window.tokenManager
 * - window.notificationManager
 */
(function () {
    'use strict';

    // Search timeout for debounce
    var chatSearchTimeout = null;

    // =====================================================
    // RENDER CHAT PRODUCTS TABLE
    // =====================================================

    /**
     * Render chat products table - displays held and main products
     */
    function renderChatProductsTable() {
        const listContainer = document.getElementById("chatProductsTableContainer");
        const countBadge = document.getElementById("productCount");
        const totalEl = document.getElementById("chatProductTotal");

        if (!listContainer) {
            console.error('[CHAT] Product list container not found');
            return;
        }

        // Get products from window.currentChatOrderData if available (includes held products)
        // Otherwise fallback to currentChatOrderDetails
        const currentChatOrderDetails = typeof window.getChatOrderDetails === 'function'
            ? window.getChatOrderDetails()
            : [];
        const productsToRender = (window.currentChatOrderData && window.currentChatOrderData.Details)
            ? window.currentChatOrderData.Details
            : currentChatOrderDetails;

        // Separate normal and held products
        const normalProducts = productsToRender.filter(p => !p.IsHeld);
        const heldProducts = productsToRender.filter(p => p.IsHeld);

        // Update Count & Total (all products)
        const totalQty = productsToRender.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        const totalAmount = productsToRender.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

        if (countBadge) countBadge.textContent = totalQty;
        if (totalEl) totalEl.textContent = `${totalAmount.toLocaleString("vi-VN")}đ`;

        // Empty State
        if (productsToRender.length === 0) {
            listContainer.innerHTML = `
                <div class="chat-empty-products" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                    <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p style="font-size: 14px; margin: 0;">Chưa có sản phẩm nào</p>
                    <p style="font-size: 12px; margin-top: 4px;">Tìm kiếm để thêm sản phẩm vào đơn</p>
                </div>`;
            return;
        }

        // Render sections
        let htmlContent = '';

        // Render Held Products Section (if any)
        if (heldProducts.length > 0) {
            htmlContent += `
                <div style="margin-bottom: 16px;">
                    <div style="
                        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                        padding: 8px 12px;
                        border-radius: 6px;
                        margin-bottom: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                    ">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-hand-paper" style="color: #d97706;"></i>
                            <span style="font-size: 12px; font-weight: 600; color: #92400e;">
                                Sản phẩm giữ (${heldProducts.length})
                            </span>
                        </div>
                        <button onclick="window.saveHeldProducts()" style="
                            background: #10b981;
                            color: white;
                            border: none;
                            padding: 4px 12px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                        " title="Lưu sản phẩm giữ - sẽ không bị mất khi refresh trang">
                            <i class="fas fa-save"></i> Lưu giữ
                        </button>
                    </div>
                    ${heldProducts.map((p, index) => renderProductCard(p, index, true)).join('')}
                </div>
            `;
        }

        // Render Normal Products Section
        if (normalProducts.length > 0) {
            if (heldProducts.length > 0) {
                htmlContent += `
                    <div style="
                        background: #f1f5f9;
                        padding: 8px 12px;
                        border-radius: 6px;
                        margin-bottom: 8px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <i class="fas fa-box" style="color: #3b82f6;"></i>
                        <span style="font-size: 12px; font-weight: 600; color: #1e293b;">
                            Sản phẩm chính (${normalProducts.length})
                        </span>
                    </div>
                `;
            }
            htmlContent += normalProducts.map((p, index) => renderProductCard(p, index, false)).join('');
        }

        listContainer.innerHTML = htmlContent;

        console.log('[CHAT] Rendered', normalProducts.length, 'normal +', heldProducts.length, 'held products');
    }

    // =====================================================
    // RENDER PRODUCT CARD
    // =====================================================

    /**
     * Render a single product card
     * @param {Object} p - Product object
     * @param {number} index - Index (not used, kept for compatibility)
     * @param {boolean} isHeld - Whether this is a held product
     * @returns {string} HTML string for the product card
     */
    function renderProductCard(p, index, isHeld) {
        const borderColor = isHeld ? '#fbbf24' : '#e2e8f0';
        const bgColor = isHeld ? '#fffbeb' : 'white';
        const heldBadge = isHeld ? `<span style="font-size: 10px; background: #fbbf24; color: #78350f; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">Giữ</span>` : '';
        const escapedProductName = (p.ProductName || p.Name || '').replace(/'/g, "\\'");
        const escapedProductCode = (p.ProductCode || p.Code || '').replace(/'/g, "\\'");

        return `
            <div class="chat-product-card" style="
                background: ${bgColor};
                border: 2px solid ${borderColor};
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 8px;
                display: flex;
                gap: 12px;
                transition: all 0.2s;
            ">
                <!-- Image - Click to zoom, Right-click to send to chat -->
                <div style="
                    width: 48px;
                    height: 48px;
                    border-radius: 6px;
                    background: #f1f5f9;
                    overflow: hidden;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: ${p.ImageUrl ? 'pointer' : 'default'};
                "
                    ${p.ImageUrl ? `onclick="showImageZoom('${p.ImageUrl}', '${escapedProductName}')"` : ''}
                    ${p.ImageUrl ? `oncontextmenu="sendImageToChat('${p.ImageUrl}', '${escapedProductName}', ${p.ProductId || 'null'}, '${escapedProductCode}'); return false;"` : ''}
                    ${p.ImageUrl ? `title="Click: Xem ảnh | Chuột phải: Gửi ảnh vào chat"` : ''}
                >
                    ${p.ImageUrl
                ? `<img src="${p.ImageUrl}" style="width: 100%; height: 100%; object-fit: cover;">`
                : `<i class="fas fa-image" style="color: #cbd5e1;"></i>`}
                </div>

                <!-- Content -->
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                        <div style="font-size: 13px; font-weight: 600; color: #1e293b; line-height: 1.4;">
                            ${(p.ProductCode || p.Code) ? `[${p.ProductCode || p.Code}] ` : ''}${p.ProductName || p.Name || 'Sản phẩm'}${heldBadge}
                        </div>
                    </div>

                    <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
                        ${isHeld && p.HeldBy ? `<div style="color: #f59e0b; margin-bottom: 4px;">👤 ${p.HeldBy}</div>` : ''}
                        <input type="text"
                            class="chat-note-input"
                            data-product-id="${p.ProductId}"
                            value="${(p.Note || '').replace(/"/g, '&quot;')}"
                            placeholder="Ghi chú"
                            onblur="window.updateChatProductNote(${p.ProductId}, this.value)"
                            style="
                                width: 100%;
                                padding: 4px 8px;
                                border: 1px solid #e5e7eb;
                                border-radius: 4px;
                                font-size: 11px;
                                font-family: inherit;
                                color: #374151;
                                background: #f9fafb;
                                transition: all 0.2s;
                            "
                            onfocus="this.style.borderColor='#3b82f6'; this.style.background='white';"
                            onmouseout="if(document.activeElement !== this) { this.style.borderColor='#e5e7eb'; this.style.background='#f9fafb'; }"
                        >
                    </div>

                    <!-- Controls -->
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="font-size: 13px; font-weight: 700; color: #3b82f6;">
                                ${(p.Price || 0).toLocaleString("vi-VN")}đ
                            </div>
                            <button onclick="sendProductToChat(${p.ProductId}, '${escapedProductName}')" style="
                                width: 24px;
                                height: 24px;
                                border: none;
                                background: #3b82f6;
                                color: white;
                                border-radius: 4px;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-size: 10px;
                                transition: all 0.2s;
                            " title="Gửi tên sản phẩm vào chat"
                               onmouseover="this.style.background='#2563eb'"
                               onmouseout="this.style.background='#3b82f6'">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>

                        ${!isHeld ? `
                        <!-- Main product: only show minus button and quantity -->
                        <div style="display: flex; align-items: center; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                            <button onclick="decreaseMainProductQuantityById(${p.ProductId})" style="
                                width: 28px;
                                height: 28px;
                                border: none;
                                background: #fee2e2;
                                color: #ef4444;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-weight: bold;
                            ">−</button>
                            <span style="
                                min-width: 36px;
                                text-align: center;
                                font-size: 13px;
                                font-weight: 600;
                                padding: 4px 8px;
                                background: #f8fafc;
                            ">${p.Quantity || 0}</span>
                        </div>
                        ` : `
                        <!-- Held product: show full quantity controls -->
                        <div style="display: flex; align-items: center; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                            <button onclick="updateHeldProductQuantityById(${p.ProductId}, -1)" style="
                                width: 24px;
                                height: 24px;
                                border: none;
                                background: #f8fafc;
                                color: #64748b;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">−</button>
                            <input type="number" value="${p.Quantity || 0}"
                                onchange="updateHeldProductQuantityById(${p.ProductId}, 0, this.value)"
                                style="
                                width: 36px;
                                text-align: center;
                                border: none;
                                border-left: 1px solid #e2e8f0;
                                border-right: 1px solid #e2e8f0;
                                font-size: 13px;
                                font-weight: 600;
                                padding: 2px 0;
                            ">
                            <button onclick="updateHeldProductQuantityById(${p.ProductId}, 1)" style="
                                width: 24px;
                                height: 24px;
                                border: none;
                                background: #f8fafc;
                                color: #64748b;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">+</button>
                        </div>
                        `}
                    </div>

                    ${isHeld ? `
                    <!-- Held Product Actions -->
                    <div style="display: flex; gap: 6px; margin-top: 8px;">
                        <button onclick="confirmHeldProduct(${p.ProductId})" style="
                            flex: 1;
                            padding: 6px 12px;
                            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                            color: white;
                            border: none;
                            border-radius: 6px;
                            font-size: 12px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 4px;
                            transition: all 0.2s;
                        " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.3)'"
                           onmouseout="this.style.transform=''; this.style.boxShadow=''">
                            <i class="fas fa-check-circle"></i>
                            Xác nhận
                        </button>
                        <button onclick="deleteHeldProduct(${p.ProductId})" style="
                            flex: 1;
                            padding: 6px 12px;
                            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                            color: white;
                            border: none;
                            border-radius: 6px;
                            font-size: 12px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 4px;
                            transition: all 0.2s;
                        " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.3)'"
                           onmouseout="this.style.transform=''; this.style.boxShadow=''">
                            <i class="fas fa-trash"></i>
                            Xóa
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // =====================================================
    // SEARCH LOGIC
    // =====================================================

    /**
     * Initialize chat product search
     */
    function initChatProductSearch() {
        const input = document.getElementById("chatInlineProductSearch");
        console.log("[CHAT-SEARCH] Initializing search. Input found:", !!input);

        if (!input) {
            console.error("[CHAT-SEARCH] Search input not found!");
            return;
        }

        // Prevent duplicate listeners using a custom flag
        if (input.dataset.searchInitialized === "true") {
            console.log("[CHAT-SEARCH] Search already initialized for this input");
            return;
        }

        input.dataset.searchInitialized = "true";

        input.addEventListener("input", (e) => {
            const query = e.target.value.trim();
            console.log("[CHAT-SEARCH] Input event:", query);

            if (chatSearchTimeout) clearTimeout(chatSearchTimeout);

            if (query.length < 2) {
                const resultsDiv = document.getElementById("chatInlineSearchResults");
                if (resultsDiv) resultsDiv.style.display = "none";
                return;
            }

            chatSearchTimeout = setTimeout(() => performChatProductSearch(query), 300);
        });

        // Close dropdown when clicking outside
        document.addEventListener("click", (e) => {
            const dropdown = document.getElementById("chatInlineSearchResults");
            const searchContainer = input.closest('.chat-product-search-inline');
            if (dropdown && searchContainer && !searchContainer.contains(e.target)) {
                dropdown.style.display = "none";
            }
        });
    }

    /**
     * Perform product search
     * @param {string} query - Search query
     */
    async function performChatProductSearch(query) {
        console.log("[CHAT-SEARCH] Performing search for:", query);
        const resultsDiv = document.getElementById("chatInlineSearchResults");
        if (!resultsDiv) {
            console.error("[CHAT-SEARCH] Results div not found!");
            return;
        }

        // Force styles to ensure visibility
        resultsDiv.style.display = "block";
        resultsDiv.style.zIndex = "1000";
        resultsDiv.innerHTML = `<div style="padding: 12px; text-align: center; color: #64748b; font-size: 13px;"><i class="fas fa-spinner fa-spin"></i> Đang tìm kiếm...</div>`;

        try {
            if (!window.productSearchManager) {
                throw new Error("ProductSearchManager not available");
            }

            if (!window.productSearchManager.isLoaded) {
                console.log("[CHAT-SEARCH] Loading products...");
                await window.productSearchManager.fetchExcelProducts();
            }

            const results = window.productSearchManager.search(query, 10);
            console.log("[CHAT-SEARCH] Results found:", results.length);
            displayChatSearchResults(results);
        } catch (error) {
            console.error("[CHAT-SEARCH] Error:", error);
            resultsDiv.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444; font-size: 13px;">Lỗi: ${error.message}</div>`;
        }
    }

    /**
     * Display search results
     * @param {Array} results - Search results array
     */
    function displayChatSearchResults(results) {
        const resultsDiv = document.getElementById("chatInlineSearchResults");
        if (!resultsDiv) return;

        // Ensure visibility and styling
        resultsDiv.style.display = "block";
        resultsDiv.style.zIndex = "1000";
        resultsDiv.style.maxHeight = "400px";
        resultsDiv.style.overflowY = "auto";
        resultsDiv.style.width = "600px";
        resultsDiv.style.left = "-16px";
        resultsDiv.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)";

        if (!results || results.length === 0) {
            resultsDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 14px;">Không tìm thấy sản phẩm phù hợp</div>`;
            return;
        }

        // Check existing products (both main products and held products)
        const productsInOrder = new Map();
        const heldProductIds = new Set();

        // Check main products
        const currentChatOrderDetails = typeof window.getChatOrderDetails === 'function'
            ? window.getChatOrderDetails()
            : [];
        currentChatOrderDetails.forEach(d => {
            productsInOrder.set(d.ProductId, (productsInOrder.get(d.ProductId) || 0) + (d.Quantity || 0));
        });

        // Check held products from window.currentChatOrderData.Details
        if (window.currentChatOrderData && window.currentChatOrderData.Details) {
            window.currentChatOrderData.Details.forEach(d => {
                if (d.IsHeld) {
                    heldProductIds.add(d.ProductId);
                    productsInOrder.set(d.ProductId, (productsInOrder.get(d.ProductId) || 0) + (d.Quantity || 0));
                }
            });
        }

        resultsDiv.innerHTML = results.map(p => {
            const isInOrder = productsInOrder.has(p.Id);
            const isHeld = heldProductIds.has(p.Id);
            const currentQty = productsInOrder.get(p.Id) || 0;

            return `
            <div class="chat-search-item ${isInOrder ? 'in-order' : ''}" data-product-id="${p.Id}" onclick="window.chatProductManager?.addProductFromSearch(${p.Id})" style="
                padding: 12px 16px;
                border-bottom: 1px solid #f1f5f9;
                display: flex;
                align-items: center;
                gap: 16px;
                background: white;
                transition: background 0.2s;
                cursor: pointer;
                position: relative;
            " onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">

                ${isInOrder ? `
                <div class="chat-search-qty-badge" style="
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    background: ${isHeld ? '#f59e0b' : '#10b981'};
                    color: white;
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-weight: 600;
                    z-index: 10;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                "><i class="fas ${isHeld ? 'fa-hand-paper' : 'fa-shopping-cart'}"></i> ${isHeld ? 'Giữ' : 'SL'}: ${currentQty}</div>
                ` : ''}

                <!-- Image -->
                <div style="
                    width: 48px;
                    height: 48px;
                    border-radius: 6px;
                    background: #f1f5f9;
                    overflow: hidden;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid #e2e8f0;
                ">
                    ${(p.ImageUrl || (p.Thumbnails && p.Thumbnails[0]) || p.Parent?.ImageUrl)
                    ? `<img src="${p.ImageUrl || (p.Thumbnails && p.Thumbnails[0]) || p.Parent?.ImageUrl}" style="width: 100%; height: 100%; object-fit: cover;">`
                    : `<i class="fas fa-image" style="color: #cbd5e1; font-size: 20px;"></i>`}
                </div>

                <!-- Info -->
                <div style="flex: 1; min-width: 0;">
                    <div style="
                        font-size: 14px;
                        font-weight: 600;
                        color: #1e293b;
                        margin-bottom: 4px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    ">${p.Name}</div>
                    <div style="font-size: 12px; color: #64748b;">
                        Mã: <span style="font-family: monospace; color: #475569;">${p.Code || 'N/A'}</span>
                    </div>
                </div>

                <!-- Price -->
                <div style="
                    font-size: 14px;
                    font-weight: 700;
                    color: #10b981;
                    text-align: right;
                    min-width: 80px;
                ">
                    ${(p.Price || 0).toLocaleString("vi-VN")}đ
                </div>

                <!-- Add Button -->
                <button style="
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: none;
                    background: ${isInOrder ? '#dcfce7' : '#f1f5f9'};
                    color: ${isInOrder ? '#10b981' : '#64748b'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.background='${isInOrder ? '#dcfce7' : '#e2e8f0'}'" onmouseout="this.style.background='${isInOrder ? '#dcfce7' : '#f1f5f9'}'">
                    <i class="fas ${isInOrder ? 'fa-check' : 'fa-plus'}"></i>
                </button>
            </div>`;
        }).join("");
    }

    /**
     * Update UI for a product item after adding
     * @param {number} productId - Product ID
     */
    function updateChatProductItemUI(productId) {
        const item = document.querySelector(`.chat-search-item[data-product-id="${productId}"]`);
        if (!item) return;

        // Add animation
        item.style.transition = "background 0.3s";
        item.style.background = "#dcfce7";
        setTimeout(() => {
            item.style.background = "white";
        }, 500);

        // Update quantity badge
        const currentChatOrderDetails = typeof window.getChatOrderDetails === 'function'
            ? window.getChatOrderDetails()
            : [];
        const existing = currentChatOrderDetails.find(d => d.ProductId == productId);
        const qty = existing ? existing.Quantity : 0;

        let badge = item.querySelector('.chat-search-qty-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'chat-search-qty-badge';
            badge.style.cssText = `
                position: absolute;
                top: 4px;
                right: 4px;
                background: #10b981;
                color: white;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                font-weight: 600;
                z-index: 10;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
            item.appendChild(badge);
        }
        badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${qty}`;

        // Update button
        const btn = item.querySelector('button');
        if (btn) {
            btn.style.background = '#dcfce7';
            btn.style.color = '#10b981';
            btn.innerHTML = '<i class="fas fa-check"></i>';
        }

        if (!item.classList.contains('in-order')) {
            item.classList.add('in-order');
        }
    }

    // =====================================================
    // ADD PRODUCT FROM SEARCH
    // =====================================================

    /**
     * Add product from search to chat order (as held product)
     * @param {number} productId - Product ID to add
     */
    async function addChatProductFromSearch(productId) {
        // Show loading state on the clicked item
        const searchItem = document.querySelector(`.chat-search-item[data-product-id="${productId}"]`);
        const originalContent = searchItem ? searchItem.innerHTML : '';
        if (searchItem) {
            searchItem.innerHTML = `<div style="text-align: center; width: 100%; color: #6366f1;"><i class="fas fa-spinner fa-spin"></i> Đang tải thông tin...</div>`;
            searchItem.style.pointerEvents = 'none';
        }

        try {
            // Normalize productId to number
            const normalizedProductId = parseInt(productId);
            if (isNaN(normalizedProductId)) {
                throw new Error("Invalid product ID");
            }

            // Check if order data is available
            if (!window.currentChatOrderData) {
                throw new Error("Vui lòng mở một đơn hàng trước khi thêm sản phẩm");
            }

            // Ensure Details array exists
            if (!window.currentChatOrderData.Details) {
                window.currentChatOrderData.Details = [];
            }

            // 1. Fetch full details from TPOS (Required)
            const fullProduct = await window.productSearchManager.getFullProductDetails(normalizedProductId);
            if (!fullProduct) throw new Error("Không tìm thấy thông tin sản phẩm");

            // Logic to inherit image from Product Template if missing (Variant logic)
            if ((!fullProduct.ImageUrl || fullProduct.ImageUrl === "") && (!fullProduct.Thumbnails || fullProduct.Thumbnails.length === 0)) {
                if (fullProduct.ProductTmplId) {
                    try {
                        console.log(`[CHAT-ADD] Fetching product template ${fullProduct.ProductTmplId} for image fallback`);
                        const templateApiUrl = window.productSearchManager.PRODUCT_API_BASE.replace('/Product', '/ProductTemplate');
                        const url = `${templateApiUrl}(${fullProduct.ProductTmplId})?$expand=Images`;

                        const headers = await window.tokenManager.getAuthHeader();
                        const response = await fetch(url, {
                            method: "GET",
                            headers: headers,
                        });

                        if (response.ok) {
                            const templateData = await response.json();
                            if (templateData.ImageUrl) fullProduct.ImageUrl = templateData.ImageUrl;
                        }
                    } catch (e) {
                        console.warn(`[CHAT-ADD] Failed to fetch product template ${fullProduct.ProductTmplId}`, e);
                    }
                }
            }

            // Validate sale price (only use PriceVariant or ListPrice, never StandardPrice)
            const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;
            if (salePrice == null || salePrice < 0) {
                console.error(`[CHAT-ADD] ❌ Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán.`);
                throw new Error(`Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán.`);
            }

            // 2. Check if already exists in HELD list (merge quantity)
            const existingHeldIndex = window.currentChatOrderData?.Details?.findIndex(
                p => p.ProductId === normalizedProductId && p.IsHeld === true
            ) ?? -1;

            if (existingHeldIndex >= 0) {
                // Product already in held list - increment quantity
                window.currentChatOrderData.Details[existingHeldIndex].Quantity += 1;
                console.log('[CHAT-ADD] Merged with existing held product, new qty:',
                    window.currentChatOrderData.Details[existingHeldIndex].Quantity);
            } else {
                // 3. Create new HELD product object (similar to moveDroppedToOrder)
                const heldProduct = {
                    ProductId: fullProduct.Id,
                    Quantity: 1,
                    Price: salePrice,
                    Note: null,
                    UOMId: fullProduct.UOM?.Id || 1,
                    Factor: 1,
                    Priority: 0,
                    OrderId: window.currentChatOrderData?.Id,
                    LiveCampaign_DetailId: null,
                    ProductWeight: 0,

                    // COMPUTED FIELDS
                    ProductName: fullProduct.Name || fullProduct.NameTemplate,
                    ProductNameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                    ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                    UOMName: fullProduct.UOM?.Name || "Cái",
                    ImageUrl: fullProduct.ImageUrl || (fullProduct.Thumbnails && fullProduct.Thumbnails[0]) || fullProduct.Parent?.ImageUrl || '',
                    IsOrderPriority: null,
                    QuantityRegex: null,
                    IsDisabledLiveCampaignDetail: false,

                    // HELD product markers
                    IsHeld: true,
                    IsFromSearch: true,
                    StockQty: fullProduct.QtyAvailable || 0,

                    // Additional fields for compatibility
                    Name: fullProduct.Name,
                    Code: fullProduct.DefaultCode || fullProduct.Barcode
                };

                // Add to Details array
                if (window.currentChatOrderData && window.currentChatOrderData.Details) {
                    window.currentChatOrderData.Details.push(heldProduct);
                }
            }

            // 4. Sync to Firebase held_products for multi-user collaboration
            const orderId = window.currentChatOrderData?.Id;
            if (window.firebase && window.authManager && orderId) {
                const auth = window.authManager.getAuthState();

                if (auth) {
                    let userId = auth.id || auth.Id || auth.username || auth.userType;
                    if (!userId && auth.displayName) {
                        userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
                    }

                    if (userId) {
                        // Get current held quantity for this user
                        const currentHeldProduct = window.currentChatOrderData.Details.find(
                            p => p.ProductId === normalizedProductId && p.IsHeld
                        );
                        const heldQuantity = currentHeldProduct ? currentHeldProduct.Quantity : 1;

                        // Sync to Firebase - include product details for reload
                        const ref = window.firebase.database().ref(`held_products/${orderId}/${normalizedProductId}/${userId}`);

                        await ref.set({
                            productId: normalizedProductId,
                            displayName: auth.displayName || auth.userType || 'Unknown',
                            quantity: heldQuantity,
                            isDraft: false,  // Temporary until user clicks "Lưu giữ"
                            isFromSearch: true,
                            timestamp: window.firebase.database.ServerValue.TIMESTAMP,
                            campaignName: window.currentChatOrderData?.LiveCampaignName || '',
                            stt: window.currentChatOrderData?.SessionIndex || window.currentChatOrderData?.STT || '',
                            // Product details for reload
                            productName: fullProduct.Name || fullProduct.NameTemplate || '',
                            productNameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}` || '',
                            productCode: fullProduct.DefaultCode || fullProduct.Barcode || '',
                            imageUrl: fullProduct.ImageUrl || (fullProduct.Thumbnails && fullProduct.Thumbnails[0]) || '',
                            price: salePrice || 0,
                            uomName: fullProduct.UOM?.Name || 'Cái'
                        });

                        console.log('[CHAT-ADD] ✓ Synced to Firebase held_products:', {
                            orderId,
                            productId: normalizedProductId,
                            userId,
                            quantity: heldQuantity
                        });
                    }
                }
            }

            // 5. Re-render UI (held products will show with Confirm/Delete buttons)
            renderChatProductsTable();

            // Show success notification
            if (window.notificationManager) {
                window.notificationManager.show(`✓ Đã thêm "${fullProduct.Name}" vào danh sách giữ`, 'info');
            }

            // Clear search input and keep focus
            const searchInput = document.getElementById("chatInlineProductSearch");
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }

            // Hide search results
            const resultsDiv = document.getElementById("chatInlineSearchResults");
            if (resultsDiv) {
                resultsDiv.style.display = "none";
            }

            console.log('[CHAT-ADD] ✓ Added product to held list:', normalizedProductId);

        } catch (error) {
            console.error("Error adding product:", error);
            if (searchItem) {
                searchItem.innerHTML = originalContent;
                searchItem.style.pointerEvents = 'auto';
            }
            if (window.notificationManager) {
                window.notificationManager.error("Lỗi khi thêm sản phẩm: " + error.message);
            } else {
                alert("Lỗi khi thêm sản phẩm: " + error.message);
            }
        }
    }

    // =====================================================
    // EXPORTS
    // =====================================================

    // Export to window for external usage
    window.renderChatProductsTable = renderChatProductsTable;
    window.renderProductCard = renderProductCard;
    window.initChatProductSearch = initChatProductSearch;
    window.performChatProductSearch = performChatProductSearch;
    window.displayChatSearchResults = displayChatSearchResults;
    window.updateChatProductItemUI = updateChatProductItemUI;
    window.addChatProductFromSearch = addChatProductFromSearch;

    // Chat Product Manager for external access
    window.chatProductManager = {
        addProductFromSearch: addChatProductFromSearch,
        renderInvoiceHistory: function () {
            const container = document.getElementById('chatInvoiceHistoryContainer');
            if (container) {
                container.innerHTML = `
                    <div class="chat-empty-products" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                        <i class="fas fa-file-invoice-dollar" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                        <p style="font-size: 14px; margin: 0;">Chức năng đang phát triển</p>
                        <p style="font-size: 12px; margin-top: 4px;">Lịch sử hóa đơn sẽ sớm được cập nhật</p>
                    </div>
                `;
            }
        }
    };

    console.log('[CHAT-PRODUCTS-UI] Loaded');

})();
