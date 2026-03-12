// #region ═══════════════════════════════════════════════════════════════════════
// ║                    SECTION 18: SALE MODAL - PRODUCT SEARCH                  ║
// ║                            search: #SALE-PROD                               ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// SALE MODAL - PRODUCT SEARCH (Similar to Edit Modal #PRODUCT)
// =====================================================
let saleSearchTimeout = null;

// =====================================================
// DISCOUNT HELPERS FOR SINGLE ORDER SALE MODAL
// =====================================================

/**
 * Parse discount from product note (e.g., "100k" = 100000, "150K ( NÂU )" = 150000)
 * The XXXk pattern can appear anywhere in the note with additional text
 * @param {string} note - Product note
 * @returns {number} Discount amount in VND
 */
function parseDiscountFromNoteSale(note) {
    if (!note || typeof note !== 'string') return 0;

    const cleanNote = note.trim().toLowerCase();
    if (!cleanNote) return 0;

    // Pattern 1: "100k", "150K ( NÂU )", "sale 200k còn" -> finds XXXk anywhere
    const kMatch = cleanNote.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*k(?:\s|$|\(|\))/i);
    if (kMatch) {
        const num = parseFloat(kMatch[1].replace(',', '.'));
        return Math.round(num * 1000);
    }

    // Pattern 2: Plain number "100000" or "100.000" or "100" - only when entire note is just the number
    const plainMatch = cleanNote.match(/^(\d{1,3}(?:[.,]\d{3})*|\d+)$/);
    if (plainMatch) {
        const numStr = plainMatch[1].replace(/[.,]/g, '');
        const num = parseInt(numStr, 10);
        // Numbers >= 1000 are literal values (e.g., "100000", "100.000")
        if (num >= 1000) {
            return num;
        }
        // Small numbers treated as shorthand "k" (e.g., "100" = 100k = 100000)
        if (num > 0) {
            return num * 1000;
        }
    }

    return 0;
}

/**
 * Check if order has "GIẢM GIÁ" tag
 * @param {object} order - Order object (currentSaleOrderData)
 * @returns {boolean}
 */
function saleOrderHasDiscountTag(order) {
    if (!order) return false;

    // Check Tags directly from order
    if (order.Tags) {
        try {
            const tags = typeof order.Tags === 'string'
                ? JSON.parse(order.Tags)
                : order.Tags;

            if (Array.isArray(tags)) {
                return tags.some(tag => {
                    const tagName = (tag.Name || '').toUpperCase();
                    return tagName.includes('GIẢM GIÁ') || tagName.includes('GIAM GIA');
                });
            }
        } catch (e) {
            console.warn('[SALE-DISCOUNT] Error parsing tags:', e);
        }
    }

    return false;
}

/**
 * Calculate total discount for sale order from product notes
 * @param {object} order - Order object with orderLines
 * @returns {{totalDiscount: number, discountedProducts: Array}}
 */
function calculateSaleOrderDiscount(order) {
    const orderLines = order?.orderLines || [];
    let totalDiscount = 0;
    const discountedProducts = [];

    orderLines.forEach(line => {
        const note = line.Note || '';
        const notePrice = parseDiscountFromNoteSale(note);  // "100k" = 100000 (giá bán thực tế)
        if (notePrice > 0) {
            const priceUnit = line.PriceUnit || line.Price || 0;
            const qty = line.ProductUOMQty || line.Quantity || 1;
            const discountPerUnit = priceUnit - notePrice;  // 180000 - 100000 = 80000
            if (discountPerUnit > 0) {
                const lineDiscount = discountPerUnit * qty;  // 80000 * 2 = 160000
                totalDiscount += lineDiscount;
                discountedProducts.push({
                    productName: line.Product?.Name || line.ProductName || 'N/A',
                    discount: lineDiscount,
                    note: note
                });
            }
        }
    });

    return { totalDiscount, discountedProducts };
}

/**
 * Initialize product search for Sale Modal
 * Similar to initInlineProductSearch() from Edit Modal (~7300)
 */
function initSaleProductSearch() {
    const searchInput = document.getElementById("saleProductSearch");
    if (!searchInput) return;

    console.log('[SALE-PRODUCT-SEARCH] Initializing product search...');

    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim();
        if (saleSearchTimeout) clearTimeout(saleSearchTimeout);
        if (query.length < 2) {
            displaySaleProductResults([]);
            return;
        }
        saleSearchTimeout = setTimeout(() => performSaleProductSearch(query), 500);
    });

    // Add F2 keyboard shortcut to focus search
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('saleButtonModal');
        if (modal && modal.style.display === 'flex' && e.key === 'F2') {
            e.preventDefault();
            searchInput.focus();
        }
    });
}

/**
 * Perform product search
 * Similar to performInlineSearch() from Edit Modal (~7300)
 */
async function performSaleProductSearch(query) {
    const searchInput = document.getElementById("saleProductSearch");
    const productList = document.getElementById("saleProductList");

    searchInput.classList.add("searching");
    productList.innerHTML = `
        <tr>
            <td colspan="4" style="text-align: center; padding: 20px; color: #6b7280;">
                <i class="fas fa-spinner fa-spin"></i> Đang tìm kiếm...
            </td>
        </tr>
    `;

    try {
        if (!window.productSearchManager.isLoaded) {
            await window.productSearchManager.fetchExcelProducts();
        }
        const results = window.productSearchManager.search(query, 20);
        displaySaleProductResults(results);
    } catch (error) {
        console.error('[SALE-PRODUCT-SEARCH] Error:', error);
        productList.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 20px; color: #ef4444;">
                    <i class="fas fa-exclamation-circle"></i> Lỗi: ${error.message}
                </td>
            </tr>
        `;
    } finally {
        searchInput.classList.remove("searching");
    }
}

/**
 * Display search results in the product list table
 * Similar to displayInlineResults() from Edit Modal (~7300)
 */
function displaySaleProductResults(results) {
    const productList = document.getElementById("saleProductList");

    if (!results || results.length === 0) {
        productList.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 20px; color: #9ca3af;">
                    <i class="fas fa-search"></i> Không tìm thấy sản phẩm
                </td>
            </tr>
        `;
        return;
    }

    // Check which products are already in the order
    const productsInOrder = new Map();
    if (currentSaleOrderData && currentSaleOrderData.orderLines) {
        currentSaleOrderData.orderLines.forEach(line => {
            const productId = line.ProductId || line.Product?.Id;
            const qty = line.ProductUOMQty || line.Quantity || 0;
            productsInOrder.set(productId, qty);
        });
    }

    productList.innerHTML = results.map((product) => {
        const isInOrder = productsInOrder.has(product.Id);
        const currentQty = productsInOrder.get(product.Id) || 0;
        const rowClass = isInOrder ? 'style="background-color: #f0fdf4;"' : '';

        return `
            <tr ${rowClass} onclick="addProductToSaleFromSearch(${product.Id})" style="cursor: pointer;">
                <td style="width: 40px; text-align: center;">
                    ${product.ImageUrl ?
                `<img src="${product.ImageUrl}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px;">` :
                `<div style="width: 30px; height: 30px; background: #f3f4f6; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image" style="color: #9ca3af; font-size: 12px;"></i></div>`
            }
                </td>
                <td>
                    <div style="font-weight: 500;">${product.Name}</div>
                    <div style="font-size: 11px; color: #6b7280;">Mã: ${product.Code}</div>
                    ${isInOrder ? `<div style="font-size: 11px; color: #10b981;"><i class="fas fa-shopping-cart"></i> Đã có trong đơn (SL: ${currentQty})</div>` : ''}
                </td>
                <td style="width: 60px; text-align: center;">${product.UOMName || 'Cái'}</td>
                <td style="width: 80px; text-align: right; font-weight: 600; color: #3b82f6;">
                    ${(product.Price || 0).toLocaleString('vi-VN')}
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Add product to sale order from search
 * Similar to addProductToOrderFromInline() from Edit Modal (~2214)
 */
async function addProductToSaleFromSearch(productId) {
    let notificationId = null;

    try {
        // Show loading notification
        if (window.notificationManager) {
            notificationId = window.notificationManager.show(
                "Đang tải thông tin sản phẩm...",
                "info",
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: "package",
                }
            );
        }

        console.log('[SALE-ADD-PRODUCT] Fetching product details for ID:', productId);
        const fullProduct = await window.productSearchManager.getFullProductDetails(productId);

        if (!fullProduct) {
            throw new Error("Không tìm thấy thông tin sản phẩm");
        }

        console.log('[SALE-ADD-PRODUCT] Full product details:', fullProduct);

        // Close loading notification
        if (window.notificationManager && notificationId) {
            window.notificationManager.remove(notificationId);
        }

        // Ensure orderLines array exists
        if (!currentSaleOrderData.orderLines) {
            currentSaleOrderData.orderLines = [];
        }

        // Check if product already exists in order
        const existingIndex = currentSaleOrderData.orderLines.findIndex(
            line => (line.ProductId || line.Product?.Id) === productId
        );

        if (existingIndex > -1) {
            // Product exists - increase quantity
            const existingLine = currentSaleOrderData.orderLines[existingIndex];
            const oldQty = existingLine.ProductUOMQty || existingLine.Quantity || 0;
            const newQty = oldQty + 1;

            existingLine.ProductUOMQty = newQty;
            existingLine.Quantity = newQty;

            console.log(`[SALE-ADD-PRODUCT] Product exists, increased quantity: ${oldQty} → ${newQty}`);

            if (window.notificationManager) {
                window.notificationManager.success(
                    `Đã tăng số lượng ${fullProduct.Name} (${oldQty} → ${newQty})`
                );
            }
        } else {
            // Validate sale price
            const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;
            if (salePrice == null || salePrice < 0) {
                throw new Error(`Sản phẩm "${fullProduct.Name}" không có giá bán.`);
            }

            // Create new order line
            const newLine = {
                ProductId: fullProduct.Id,
                Product: {
                    Id: fullProduct.Id,
                    Name: fullProduct.Name,
                    DefaultCode: fullProduct.DefaultCode,
                    NameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                    ImageUrl: fullProduct.ImageUrl
                },
                ProductUOMId: fullProduct.UOM?.Id || 1,
                ProductUOM: {
                    Id: fullProduct.UOM?.Id || 1,
                    Name: fullProduct.UOM?.Name || 'Cái'
                },
                ProductUOMQty: 1,
                Quantity: 1,
                PriceUnit: salePrice,
                ProductName: fullProduct.Name,
                ProductNameGet: fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                ProductUOMName: fullProduct.UOM?.Name || 'Cái',
                Note: null,
                Discount: 0,
                Weight: fullProduct.Weight || 0
            };

            currentSaleOrderData.orderLines.push(newLine);

            console.log('[SALE-ADD-PRODUCT] Added new product:', newLine);

            if (window.notificationManager) {
                window.notificationManager.success(`Đã thêm ${fullProduct.Name} vào đơn hàng`);
            }
        }

        // Refresh the order items table
        populateSaleOrderLinesFromAPI(currentSaleOrderData.orderLines);

        // Refresh search results to show updated quantity
        const searchInput = document.getElementById("saleProductSearch");
        if (searchInput && searchInput.value.trim().length >= 2) {
            performSaleProductSearch(searchInput.value.trim());
        }

        // 🔥 UPDATE ORDER VIA API (Similar to Edit Modal flow)
        try {
            console.log('[SALE-ADD-PRODUCT] Calling PUT API to update order...');
            await updateSaleOrderWithAPI();
            console.log('[SALE-ADD-PRODUCT] ✅ Order updated successfully via API');

            // KPI Audit Log - ghi nhận thêm sản phẩm từ sale modal
            if (window.kpiAuditLogger) {
                try {
                    const orderId = currentSaleOrderData.Id;
                    await window.kpiAuditLogger.logProductAction({
                        orderId: String(orderId),
                        action: 'add',
                        productId: parseInt(productId),
                        productCode: fullProduct.DefaultCode || '',
                        productName: fullProduct.Name || '',
                        quantity: 1,
                        source: 'sale_modal'
                    });
                    if (window.kpiManager && window.kpiManager.recalculateAndSaveKPI) {
                        await window.kpiManager.recalculateAndSaveKPI(String(orderId));
                    }
                } catch (kpiError) {
                    console.warn('[SALE-ADD-PRODUCT] KPI audit log failed (non-blocking):', kpiError);
                }
            }
        } catch (apiError) {
            console.error('[SALE-ADD-PRODUCT] ⚠️ API update failed:', apiError);
            // Show warning but don't rollback (product is already added locally)
            if (window.notificationManager) {
                window.notificationManager.warning('Sản phẩm đã được thêm nhưng chưa đồng bộ với server. Vui lòng thử lại.');
            }
        }

    } catch (error) {
        console.error('[SALE-ADD-PRODUCT] Error:', error);

        if (window.notificationManager && notificationId) {
            window.notificationManager.remove(notificationId);
        }

        if (window.notificationManager) {
            window.notificationManager.error(error.message || 'Không thể thêm sản phẩm');
        }
    }
}

/**
 * Recalculate totals for sale modal
 * Similar to recalculateTotals() from Edit Modal (~7273)
 */
function recalculateSaleTotals() {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;

    let totalQuantity = 0;
    let totalAmount = 0;

    currentSaleOrderData.orderLines.forEach(item => {
        const qty = item.ProductUOMQty || item.Quantity || 1;
        const price = item.PriceUnit || item.Price || 0;
        totalQuantity += qty;
        totalAmount += qty * price;
    });

    updateSaleTotals(totalQuantity, totalAmount);
}

/**
 * Update Sale Order via PUT API
 * Similar to updateOrderWithFullPayload() from Edit Modal (~15687)
 * Fetches FULL order object from API, merges local changes, then PUTs back
 */
async function updateSaleOrderWithAPI() {
    if (!currentSaleOrderData || !currentSaleOrderData.Id) {
        console.error('[SALE-API] No order data to update');
        return null;
    }

    try {
        console.log('[SALE-API] Preparing to update order:', currentSaleOrderData.Id);

        // Get auth headers
        const headers = await window.tokenManager.getAuthHeader();

        // 🔥 STEP 1: Fetch FULL order object from API first (critical!)
        // This ensures we have all required fields like RowVersion, Partner, User, CRMTeam, etc.
        const getUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${currentSaleOrderData.Id})?$expand=Details,Partner,User,CRMTeam`;
        console.log('[SALE-API] Fetching full order from API...');

        const getResponse = await fetch(getUrl, {
            method: 'GET',
            headers: {
                ...headers,
                Accept: "application/json",
            }
        });

        if (!getResponse.ok) {
            throw new Error(`Failed to fetch order: HTTP ${getResponse.status}`);
        }

        const fullOrder = await getResponse.json();
        console.log('[SALE-API] Got full order from API:', fullOrder);

        // 🔥 STEP 2: Merge local changes (orderLines) into full order object
        // Clone to avoid mutation
        const payload = JSON.parse(JSON.stringify(fullOrder));

        // Add @odata.context (CRITICAL for PUT request)
        if (!payload["@odata.context"]) {
            payload["@odata.context"] = "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        }

        // Get CreatedById from order or auth
        const createdById = fullOrder.CreatedById || fullOrder.UserId;

        // Convert local orderLines to Details format (API expects Details, not orderLines)
        if (currentSaleOrderData.orderLines && Array.isArray(currentSaleOrderData.orderLines)) {
            payload.Details = currentSaleOrderData.orderLines.map(line => {
                const cleaned = {
                    ProductId: line.ProductId || line.Product?.Id,
                    Quantity: line.ProductUOMQty || line.Quantity || 1,
                    Price: line.PriceUnit || line.Price || 0,
                    Note: line.Note || null,
                    UOMId: line.ProductUOMId || line.ProductUOM?.Id || 1,
                    Factor: 1,
                    Priority: 0,
                    OrderId: currentSaleOrderData.Id,
                    LiveCampaign_DetailId: null,
                    ProductWeight: line.Weight || 0,
                    ProductName: line.Product?.Name || line.ProductName || '',
                    ProductNameGet: line.Product?.NameGet || line.ProductNameGet || '',
                    ProductCode: line.Product?.DefaultCode || line.ProductCode || '',
                    UOMName: line.ProductUOMName || line.ProductUOM?.Name || 'Cái',
                    ImageUrl: line.Product?.ImageUrl || '',
                    IsOrderPriority: null,
                    QuantityRegex: null,
                    IsDisabledLiveCampaignDetail: false,
                    CreatedById: createdById
                };

                // Keep Id if it exists (for existing details)
                if (line.Id) {
                    cleaned.Id = line.Id;
                }

                return cleaned;
            });
        }

        // Calculate totals from local orderLines
        let totalQuantity = 0;
        let totalAmount = 0;
        if (payload.Details) {
            payload.Details.forEach(detail => {
                const qty = detail.Quantity || 1;
                const price = detail.Price || 0;
                totalQuantity += qty;
                totalAmount += qty * price;
            });
        }

        payload.TotalAmount = totalAmount;
        payload.TotalQuantity = totalQuantity;

        console.log('[SALE-API] PUT payload:', {
            orderId: currentSaleOrderData.Id,
            detailsCount: payload.Details?.length || 0,
            totalAmount: payload.TotalAmount,
            totalQuantity: payload.TotalQuantity,
            hasContext: !!payload["@odata.context"],
            hasRowVersion: !!payload.RowVersion,
            hasPartner: !!payload.Partner,
            hasUser: !!payload.User,
            hasCRMTeam: !!payload.CRMTeam
        });

        // 🔥 STEP 3: PUT updated order back to API
        const putUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${currentSaleOrderData.Id})`;
        const response = await fetch(putUrl, {
            method: 'PUT',
            headers: {
                ...headers,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[SALE-API] PUT failed:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Handle empty response body (PUT often returns 200 OK with no content)
        let data = null;
        const responseText = await response.text();
        if (responseText && responseText.trim()) {
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.log('[SALE-API] Response is not JSON, treating as success');
            }
        }

        console.log(`[SALE-API] ✅ Updated order ${currentSaleOrderData.Id} with ${payload.Details?.length || 0} products`);

        // Invalidate order details cache so chat modal loads fresh data on reopen
        if (typeof window.invalidateOrderDetailsCache === 'function') {
            window.invalidateOrderDetailsCache(currentSaleOrderData.Id);
        }

        // Update the order table row (quantity column & total)
        if (typeof updateOrderInTable === 'function') {
            updateOrderInTable(currentSaleOrderData.Id, {
                TotalQuantity: totalQuantity,
                TotalAmount: totalAmount
            });
        }

        // 🔥 STEP 4: Fetch updated order AFTER PUT to get new Detail IDs
        console.log('[SALE-API] Fetching updated order to get new Detail IDs...');
        const refreshResponse = await fetch(getUrl, {
            method: 'GET',
            headers: {
                ...headers,
                Accept: "application/json",
            }
        });

        if (!refreshResponse.ok) {
            console.warn('[SALE-API] Could not fetch updated order, using old data');
        } else {
            const updatedOrder = await refreshResponse.json();
            console.log('[SALE-API] Got updated order with fresh Details:', updatedOrder);

            // Update local currentSaleOrderData with fresh data from API
            // Convert Details back to orderLines format for consistency
            currentSaleOrderData = updatedOrder;
            if (updatedOrder.Details && Array.isArray(updatedOrder.Details)) {
                currentSaleOrderData.orderLines = updatedOrder.Details.map(detail => ({
                    Id: detail.Id,
                    ProductId: detail.ProductId,
                    ProductUOMId: detail.UOMId,
                    ProductUOMQty: detail.Quantity,
                    Quantity: detail.Quantity,
                    PriceUnit: detail.Price,
                    Price: detail.Price,
                    ProductName: detail.ProductName,
                    ProductNameGet: detail.ProductNameGet,
                    ProductCode: detail.ProductCode,
                    ProductUOMName: detail.UOMName,
                    Note: detail.Note,
                    Weight: detail.ProductWeight,
                    SaleOnlineDetailId: detail.Id, // 🔥 CRITICAL: Map Detail.Id to SaleOnlineDetailId for FastSaleOrder
                    Product: {
                        Id: detail.ProductId,
                        Name: detail.ProductName,
                        DefaultCode: detail.ProductCode,
                        NameGet: detail.ProductNameGet,
                        ImageUrl: detail.ImageUrl
                    },
                    ProductUOM: {
                        Id: detail.UOMId,
                        Name: detail.UOMName
                    }
                }));
            } else {
                currentSaleOrderData.orderLines = [];
            }
        }

        return data || { success: true, orderId: currentSaleOrderData.Id };

    } catch (error) {
        console.error('[SALE-API] Error updating order:', error);
        throw error;
    }
}

/**
 * Confirm and Print Sale Order (F9)
 * Flow: FastSaleOrder POST -> print1 GET -> ODataService.DefaultGet POST -> Open print popup
 */
async function confirmAndPrintSale() {
    // Block double-click: check if button is already disabled
    const confirmBtn = document.querySelector('.sale-btn-teal');
    if (confirmBtn?.disabled) {
        console.warn('[SALE-CONFIRM] ⚠️ Button already disabled, ignoring duplicate click');
        return;
    }

    console.log('[SALE-CONFIRM] Starting confirm and print via InsertListOrderModel...');

    // Validate we have order data
    if (!currentSaleOrderData) {
        if (window.notificationManager) {
            window.notificationManager.error('Không có dữ liệu đơn hàng');
        }
        return;
    }

    // Show loading state - disable button immediately
    const originalText = confirmBtn?.textContent;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Đang xử lý...';
    }

    try {
        // Get auth header from billTokenManager (same as fastSaleModal)
        let headers;
        if (window.billTokenManager) {
            await window.billTokenManager.ensureCredentialsLoaded();
            if (!window.billTokenManager.hasCredentials()) {
                throw new Error('Chưa cấu hình tài khoản TPOS cho bill. Vui lòng vào "Tài khoản TPOS" để cài đặt.');
            }
            headers = await window.billTokenManager.getAuthHeader();
            console.log('[SALE-CONFIRM] Using billTokenManager for auth');
        } else {
            // Use tokenManager for selected company token
            const token = window.tokenManager ? await window.tokenManager.getToken() : null;
            if (!token) {
                throw new Error('Không tìm thấy token xác thực');
            }
            headers = { 'Authorization': `Bearer ${token}` };
        }

        // Build model for InsertListOrderModel API (same format as fastSaleModal)
        console.log('[SALE-CONFIRM] Building model for InsertListOrderModel...');
        const model = buildSaleOrderModelForInsertList();

        // Store model for later use
        window.lastFastSaleModels = [model];

        // Validate required fields
        if (!model.CarrierId || model.CarrierId === 0) {
            throw new Error('Vui lòng chọn đối tác vận chuyển');
        }
        if (!model.Partner?.Phone) {
            throw new Error('Vui lòng nhập số điện thoại người nhận');
        }
        if (!model.Partner?.Street) {
            throw new Error('Vui lòng nhập địa chỉ người nhận');
        }
        // Validate all order lines have ProductId (TPOS API requires non-zero ProductId)
        const missingProductIds = (model.OrderLines || []).filter(line => !line.ProductId || line.ProductId === 0);
        if (missingProductIds.length > 0) {
            const names = missingProductIds.map(l => l.ProductName).filter(Boolean).join(', ');
            throw new Error(`Sản phẩm chưa có mã trên TPOS: ${names || 'Không xác định'}. Vui lòng chọn sản phẩm từ Kho SP hoặc tìm kiếm trong ô tìm kiếm.`);
        }

        // Build request body (same as fastSaleModal's "Lưu xác nhận")
        const requestBody = {
            is_approve: true,
            model: [model]
        };

        console.log('[SALE-CONFIRM] Request body:', requestBody);

        // Call InsertListOrderModel API with isForce=true (same as fastSaleModal)
        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/InsertListOrderModel?isForce=true&$expand=DataErrorFast($expand=Partner,OrderLines),OrdersError($expand=Partner,OrderLines),OrdersSucessed($expand=Partner,OrderLines)`;

        let response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        // Retry on 401: force-refresh bill token and retry once
        if (response.status === 401 && window.billTokenManager) {
            console.log('[SALE-CONFIRM] 401 received, force-refreshing bill token...');
            window.billTokenManager.token = null;
            window.billTokenManager.tokenExpiry = null;
            headers = await window.billTokenManager.getAuthHeader();
            response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('[SALE-CONFIRM] InsertListOrderModel result:', result);

        // Handle response - check for errors
        const successOrders = result.OrdersSucessed || [];
        const errorOrders = result.OrdersError || [];
        const dataErrorFast = result.DataErrorFast || [];

        if (errorOrders.length > 0 || dataErrorFast.length > 0) {
            const errorMessages = [];
            errorOrders.forEach(o => {
                if (o.Error) errorMessages.push(typeof o.Error === 'string' ? o.Error : (o.Error.Message || o.Error.message || JSON.stringify(o.Error)));
            });
            dataErrorFast.forEach(o => {
                if (o.Error) errorMessages.push(typeof o.Error === 'string' ? o.Error : (o.Error.Message || o.Error.message || JSON.stringify(o.Error)));
            });
            throw new Error(errorMessages.join('; ') || 'Có lỗi khi tạo đơn hàng');
        }

        if (successOrders.length === 0) {
            throw new Error('Không có đơn hàng nào được tạo thành công');
        }

        const createResult = successOrders[0];
        const orderId = createResult.Id;
        const orderNumber = createResult.Number || orderId;

        // Store result globally for social order invoice adapter
        window._lastFastSaleCreateResult = createResult;

        console.log('[SALE-CONFIRM] Order created successfully:', { orderId, orderNumber });

        // Save to order history (Firebase)
        if (window.OrderHistoryManager && createResult) {
            const historyData = {
                saleOnlineId: currentSaleOrderData?.Id,
                reference: currentSaleOrderData?.Code || createResult.Reference,
                fastSaleOrderId: orderId,
                liveCampaignId: currentSaleOrderData?.LiveCampaignId,
                liveCampaignName: currentSaleOrderData?.LiveCampaignName || '',
                customerName: document.getElementById('saleReceiverName')?.value || '',
                customerPhone: document.getElementById('saleReceiverPhone')?.value || '',
                address: document.getElementById('saleReceiverAddress')?.value || '',
                products: (createResult.OrderLines || []),
                totalAmount: createResult.AmountTotal || 0,
                shippingFee: parseFloat(document.getElementById('saleShippingFee')?.value) || 0,
                carrierId: parseInt(document.getElementById('saleDeliveryPartner')?.value) || 0,
                carrierName: document.getElementById('saleDeliveryPartner')?.selectedOptions[0]?.text || '',
                sessionIndex: currentSaleOrderData?.SessionIndex || ''
            };
            window.OrderHistoryManager.saveOrderHistory(historyData, 'sale-modal');
        }

        // IMPORTANT: Save form values BEFORE debt update and BEFORE storing
        // (debt update changes salePrepaidAmount to remainingDebt)
        const prepaidInput = document.getElementById('salePrepaidAmount');
        const savedWalletBalance = parseFloat(prepaidInput?.value) || 0;
        const savedDiscount = parseFloat(document.getElementById('saleDiscount')?.value) || 0;
        // Check if virtual debt (công nợ ảo from return ticket) was used
        const hasVirtualDebt = prepaidInput?.dataset?.hasVirtualDebt === '1' && savedWalletBalance > 0;
        // Get carrier name from dropdown (API response often misses this)
        const carrierSelect = document.getElementById('saleDeliveryPartner');
        const selectedOption = carrierSelect?.selectedOptions[0];
        const savedCarrierName = selectedOption?.dataset?.name || selectedOption?.text?.replace(/\s*\([^)]*\)$/, '') || '';

        // Store invoice status to localStorage + Firebase
        if (window.InvoiceStatusStore) {
            console.log('[SALE-CONFIRM] Storing invoice status...');
            window.InvoiceStatusStore.storeFromApiResult(result);

            // For social orders: store directly by social order ID
            // (storeFromApiResult skips orders with empty SaleOnlineIds)
            if (currentSaleOrderData?._isSocialOrder && window._lastSocialSaleOrderId) {
                const socialId = window._lastSocialSaleOrderId;
                const orderData = successOrders[0];
                if (orderData) {
                    // Enrich with form values before storing
                    orderData.PaymentAmount = savedWalletBalance;
                    orderData.Discount = savedDiscount;
                    orderData.CarrierName = savedCarrierName;
                    window.InvoiceStatusStore.set(socialId, orderData, currentSaleOrderData);
                    console.log('[SALE-CONFIRM] Stored invoice for social order:', socialId);
                }
            }

            // ĐƠN GIẢN HÓA: Cập nhật trực tiếp các giá trị từ form
            // Vì API response không có hoặc sai các field này
            const saleOnlineId = currentSaleOrderData?.Id;
            if (saleOnlineId) {
                const storedData = window.InvoiceStatusStore.get(saleOnlineId);
                if (storedData) {
                    storedData.PaymentAmount = savedWalletBalance;
                    storedData.Discount = savedDiscount;
                    storedData.CarrierName = savedCarrierName;
                    window.InvoiceStatusStore.set(saleOnlineId, storedData, currentSaleOrderData);
                    console.log('[SALE-CONFIRM] Updated InvoiceStatusStore with form values:', {
                        PaymentAmount: savedWalletBalance,
                        Discount: savedDiscount,
                        CarrierName: savedCarrierName
                    });
                }
            }
        }
        if (window.updateMainTableInvoiceCells) {
            setTimeout(() => {
                window.updateMainTableInvoiceCells(result);
            }, 100);
        }

        // Update debt after order creation (same logic as before)
        const currentDebt = savedWalletBalance;
        const codAmount = parseFloat(document.getElementById('saleCOD')?.value) || 0;
        if (currentDebt > 0) {
            const customerPhone = document.getElementById('saleReceiverPhone')?.value || currentSaleOrderData?.PartnerPhone || currentSaleOrderData?.Telephone;
            if (customerPhone) {
                const actualPayment = Math.min(currentDebt, codAmount);
                const remainingDebt = Math.max(0, currentDebt - codAmount);

                console.log('[SALE-CONFIRM] Debt calculation - current:', currentDebt, 'COD:', codAmount, 'paid:', actualPayment, 'remaining:', remainingDebt);

                const prepaidInput = document.getElementById('salePrepaidAmount');
                if (prepaidInput) {
                    prepaidInput.value = remainingDebt;
                    updateSaleCOD();
                }

                // Record payment via pending-withdrawals API (Outbox pattern)
                // This ensures 100% no lost transactions even on network failures
                const performedBy = window.authManager?.getAuthState()?.username || 'system';
                const normalizedPhone = normalizePhoneForQR(customerPhone);

                // Use pending-withdrawals API on Render server directly (not via CF Worker)
                // The API will: 1) Record pending, 2) Try withdraw, 3) Cron will retry if failed
                const RENDER_API_URL = 'https://n2store-fallback.onrender.com';
                fetch(`${RENDER_API_URL}/api/v2/pending-withdrawals`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        order_id: orderNumber,
                        order_number: orderNumber,
                        phone: normalizedPhone,
                        amount: actualPayment,
                        source: 'SALE_ORDER',
                        note: `Thanh toán công nợ qua COD đơn hàng #${orderNumber}`,
                        created_by: performedBy
                    })
                }).then(res => res.json()).then(pendingResult => {
                    if (pendingResult.success) {
                        if (pendingResult.skipped) {
                            console.log('[SALE-CONFIRM] ⏭️ Withdrawal already processed for this order');
                        } else {
                            console.log('[SALE-CONFIRM] ✅ Pending withdrawal created:', pendingResult.pending_id, 'status:', pendingResult.status);
                        }
                        // Update cache and UI
                        if (normalizedPhone) {
                            const cache = getDebtCache();
                            delete cache[normalizedPhone];
                            saveDebtCache(cache);
                            updateDebtCellsInTable(normalizedPhone, remainingDebt);
                        }
                    } else {
                        console.warn('[SALE-CONFIRM] ⚠️ Failed to create pending withdrawal:', pendingResult.error);
                        window.notificationManager?.warning('Không thể ghi nhận trừ ví, sẽ tự động retry');
                    }
                }).catch(err => {
                    console.error('[SALE-CONFIRM] ❌ Error creating pending withdrawal:', err);
                    window.notificationManager?.warning('Lỗi kết nối - Đơn đã tạo, ví sẽ được trừ sau');
                });
            }
        }

        // Check bill type toggle preference
        const billTypeToggle = document.querySelector('input[name="saleBillType"]:checked');
        const useTposBill = billTypeToggle?.value === 'tpos';

        // Store preference in localStorage
        localStorage.setItem('saleBillTypePreference', billTypeToggle?.value || 'web');

        if (useTposBill) {
            // Fetch HTML bill from TPOS API and open print popup
            // Pass savedWalletBalance for fallback case if TPOS API fails
            console.log('[SALE-CONFIRM] Fetching HTML bill from TPOS...');
            window.fetchAndPrintTPOSBill(orderId, headers, currentSaleOrderData, savedWalletBalance, hasVirtualDebt);
        } else {
            // Use Web bill template (local)
            // Pass savedWalletBalance to ensure correct calculation (before debt update modified the form field)
            console.log('[SALE-CONFIRM] Using Web bill template with walletBalance:', savedWalletBalance, 'hasVirtualDebt:', hasVirtualDebt);
            window.openPrintPopup(createResult, { currentSaleOrderData: currentSaleOrderData, walletBalance: savedWalletBalance, hasVirtualDebt: hasVirtualDebt });
        }

        // Success notification
        window.notificationManager?.success(`Đã tạo đơn hàng ${orderNumber}`);

        // For social orders: update status + store invoice BEFORE closing modal
        // (closeSaleButtonModal override was unreliable, so handle directly here)
        if (currentSaleOrderData?._isSocialOrder && window._lastSocialSaleOrderId) {
            const socialOrderId = window._lastSocialSaleOrderId;
            window._lastSocialSaleOrderId = null;

            // Store invoice data in InvoiceStatusStore
            if (window.InvoiceStatusStore && createResult) {
                const mappedOrder = {
                    Name: document.getElementById('saleReceiverName')?.value || '',
                    Telephone: document.getElementById('saleReceiverPhone')?.value || '',
                    Address: document.getElementById('saleReceiverAddress')?.value || '',
                    Code: socialOrderId
                };
                window.InvoiceStatusStore.set(socialOrderId, createResult, mappedOrder);
                console.log('[SALE-CONFIRM] Social: stored invoice for', socialOrderId, 'Number:', createResult.Number);
            }

            // Update social order status to 'order'
            if (typeof window.updateSocialOrderAfterBillCreation === 'function') {
                window.updateSocialOrderAfterBillCreation(socialOrderId);
            }
        }

        // Close modal after successful creation
        setTimeout(() => {
            closeSaleButtonModal(true);
        }, 500);

    } catch (error) {
        console.error('[SALE-CONFIRM] Error:', error);
        window.notificationManager?.error(error.message || 'Lỗi xác nhận đơn hàng');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalText || 'Xác nhận và in (F9)';
        }
    }
}

/**
 * Build order model for InsertListOrderModel API (same format as fastSaleModal)
 */
function buildSaleOrderModelForInsertList() {
    const order = currentSaleOrderData;
    const partner = currentSalePartnerData;

    // Get form values
    const receiverName = document.getElementById('saleReceiverName')?.value || order.PartnerName || '';
    const receiverPhone = document.getElementById('saleReceiverPhone')?.value || order.PartnerPhone || '';
    const receiverAddress = document.getElementById('saleReceiverAddress')?.value || null;
    const deliveryNote = document.getElementById('saleDeliveryNote')?.value || '';
    const comment = document.getElementById('saleReceiverNote')?.value || '';

    const shippingFeeValue = document.getElementById('saleShippingFee')?.value;
    const shippingFee = (shippingFeeValue !== '' && shippingFeeValue !== null && shippingFeeValue !== undefined)
        ? parseFloat(shippingFeeValue)
        : 35000;

    const codValue = parseFloat(document.getElementById('saleCOD')?.value) || 0;
    const walletBalance = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
    // PaymentAmount = min(số dư ví, tổng tiền cần thanh toán)
    const prepaidAmount = Math.min(walletBalance, codValue);
    // Get remaining balance from span (not input) - parse number from text like "280.000" or "280,000"
    const remainingText = document.getElementById('saleRemainingBalance')?.textContent || '0';
    const cashOnDelivery = parseFloat(remainingText.replace(/[.,]/g, '')) || 0;

    // Get carrier
    const carrierSelect = document.getElementById('saleDeliveryPartner');
    const carrierId = carrierSelect?.value ? parseInt(carrierSelect.value) : 0;
    const selectedOption = carrierSelect?.selectedOptions[0];
    const carrierName = selectedOption?.dataset?.name || selectedOption?.text?.replace(/\s*\([^)]*\)$/, '') || '';

    // Get current user ID
    const currentUserId = window.tokenManager?.userId || window.currentUser?.Id || null;

    // Build order lines
    const orderLines = buildOrderLines();
    const originalAmountTotal = orderLines.reduce((sum, line) => sum + (line.PriceTotal || 0), 0);

    // 🔥 DISCOUNT LOGIC: Use saleDiscount field value (auto-filled or manually edited)
    const decreaseAmount = parseInt(document.getElementById('saleDiscount')?.value) || 0;
    const finalAmountTotal = originalAmountTotal - decreaseAmount;
    if (decreaseAmount > 0) {
        console.log(`[SALE-DISCOUNT] DecreaseAmount: ${decreaseAmount.toLocaleString('vi-VN')}đ, AmountTotal: ${finalAmountTotal.toLocaleString('vi-VN')}đ`);
    }

    // Build model matching InsertListOrderModel format
    return {
        Id: 0,
        Name: null,
        PrintShipCount: 0,
        PrintDeliveryCount: 0,
        PaymentMessageCount: 0,
        MessageCount: 0,
        PartnerId: partner?.Id || order.PartnerId || 0,
        PartnerDisplayName: partner?.DisplayName || partner?.Name || receiverName || '',
        PartnerEmail: null,
        PartnerFacebookId: partner?.FacebookId || order.Facebook_ASUserId || null,
        PartnerFacebook: null,
        PartnerPhone: receiverPhone || null,
        Reference: order.Code || '',
        PriceListId: 0,
        AmountTotal: finalAmountTotal,
        TotalQuantity: 0,
        Discount: 0,
        DiscountAmount: 0,
        DecreaseAmount: decreaseAmount,
        DiscountLoyaltyTotal: null,
        WeightTotal: 0,
        AmountTax: null,
        AmountUntaxed: null,
        TaxId: null,
        MoveId: null,
        UserId: currentUserId,
        UserName: null,
        DateInvoice: new Date().toISOString(),
        DateCreated: new Date().toISOString(),
        CreatedById: null,
        State: "draft",
        ShowState: "Nháp",
        CompanyId: 0,
        Comment: comment,
        WarehouseId: 0,
        SaleOnlineIds: (order.Id && !order._isSocialOrder) ? [order.Id] : [],
        SaleOnlineNames: (order.Code && !order._isSocialOrder) ? [order.Code] : [],
        Residual: null,
        Type: null,
        RefundOrderId: null,
        ReferenceNumber: null,
        AccountId: 0,
        JournalId: 0,
        Number: null,
        MoveName: null,
        PartnerNameNoSign: null,
        DeliveryPrice: shippingFee,
        CustomerDeliveryPrice: null,
        CarrierId: carrierId,
        CarrierName: carrierName,
        CarrierDeliveryType: null,
        DeliveryNote: deliveryNote,
        ReceiverName: receiverName,
        ReceiverPhone: receiverPhone,
        ReceiverAddress: receiverAddress,
        ReceiverDate: null,
        ReceiverNote: null,
        CashOnDelivery: cashOnDelivery,
        TrackingRef: null,
        TrackingArea: null,
        TrackingTransport: null,
        TrackingSortLine: null,
        TrackingUrl: "",
        IsProductDefault: false,
        TrackingRefSort: null,
        ShipStatus: "none",
        ShowShipStatus: "Chưa tiếp nhận",
        SaleOnlineName: order.Code || '',
        PartnerShippingId: null,
        PaymentJournalId: prepaidAmount > 0 ? 1 : null,
        PaymentAmount: prepaidAmount,
        SaleOrderId: null,
        SaleOrderIds: [],
        FacebookName: receiverName,
        FacebookNameNosign: null,
        FacebookId: partner?.FacebookId || order.Facebook_ASUserId || null,
        DisplayFacebookName: null,
        Deliver: null,
        ShipWeight: 100,
        ShipPaymentStatus: null,
        ShipPaymentStatusCode: null,
        OldCredit: 0,
        NewCredit: 0,
        Phone: receiverPhone || null,
        Address: receiverAddress || null,
        AmountTotalSigned: null,
        ResidualSigned: null,
        Origin: null,
        AmountDeposit: 0,
        CompanyName: null,
        PreviousBalance: codValue,
        ToPay: null,
        NotModifyPriceFromSO: false,
        Ship_ServiceId: null,
        Ship_ServiceName: null,
        Ship_ServiceExtrasText: null,
        Ship_ExtrasText: null,
        Ship_InsuranceFee: null,
        CurrencyName: null,
        TeamId: null,
        TeamOrderCode: null,
        TeamOrderId: null,
        TeamType: null,
        Revenue: null,
        SaleOrderDeposit: null,
        Seri: null,
        NumberOrder: null,
        DateOrderRed: null,
        ApplyPromotion: null,
        TimeLock: null,
        PageName: null,
        Tags: null,
        IRAttachmentUrl: null,
        IRAttachmentUrls: [],
        SaleOnlinesOfPartner: null,
        IsDeposited: null,
        LiveCampaignName: order.LiveCampaignName || '',
        LiveCampaignId: order.LiveCampaignId || null,
        Source: null,
        CartNote: null,
        ExtraPaymentAmount: null,
        QuantityUpdateDeposit: null,
        IsMergeCancel: null,
        IsPickUpAtShop: null,
        DateDeposit: prepaidAmount > 0 ? new Date().toISOString() : null,
        IsRefund: null,
        StateCode: "None",
        ActualPaymentAmount: null,
        RowVersion: null,
        ExchangeRate: null,
        DestConvertCurrencyUnitId: null,
        WiPointQRCode: null,
        WiInvoiceId: null,
        WiInvoiceChannelId: null,
        WiInvoiceStatus: null,
        WiInvoiceTrackingUrl: "",
        WiInvoiceIsReplate: false,
        FormAction: null,
        Ship_Receiver: null,
        Ship_Extras: null,
        PaymentInfo: [],
        Search: null,
        ShipmentDetailsAship: {
            PackageInfo: {
                PackageLength: 0,
                PackageWidth: 0,
                PackageHeight: 0
            }
        },
        OrderMergeds: [],
        OrderAfterMerged: null,
        TPayment: null,
        ExtraUpdateCODCarriers: [],
        AppliedPromotionLoyalty: null,
        FastSaleOrderOmniExtras: null,
        Billing: null,
        PackageInfo: {
            PackageLength: 0,
            PackageWidth: 0,
            PackageHeight: 0
        },
        Error: null,
        OrderLines: orderLines.map(line => ({
            Id: 0,
            OrderId: 0,
            ProductId: line.ProductId,
            ProductUOMId: line.ProductUOMId || 1,
            PriceUnit: line.PriceUnit || 0,
            ProductUOMQty: line.ProductUOMQty || 0,
            ProductUOMQtyAvailable: 0,
            UserId: null,
            Discount: line.Discount || 0,
            Discount_Fixed: line.Discount_Fixed || 0,
            DiscountTotalLoyalty: null,
            PriceTotal: line.PriceTotal || 0,
            PriceSubTotal: line.PriceSubTotal || 0,
            Weight: 0,
            WeightTotal: null,
            AccountId: 0,
            PriceRecent: null,
            Name: null,
            IsName: false,
            ProductName: line.ProductName || '',
            ProductUOMName: line.ProductUOMName || 'Cái',
            SaleLineIds: [],
            ProductNameGet: null,
            SaleLineId: null,
            Type: "fixed",
            PromotionProgramId: null,
            Note: line.Note || null,
            FacebookPostId: null,
            ChannelType: null,
            ProductBarcode: null,
            CompanyId: null,
            PartnerId: null,
            PriceSubTotalSigned: null,
            PromotionProgramComboId: null,
            LiveCampaign_DetailId: null,
            LiveCampaignQtyChange: 0,
            ProductImageUrl: "",
            SaleOnlineDetailId: line.SaleOnlineDetailId || null,
            PriceCheck: null,
            IsNotEnoughInventory: null,
            Tags: [],
            CreatedById: null,
            TrackingRef: null,
            ReturnTotal: 0,
            ConversionPrice: null
        })),
        Partner: {
            Id: partner?.Id || order.PartnerId || 0,
            Name: receiverName,
            DisplayName: receiverName,
            Street: receiverAddress,
            Phone: receiverPhone,
            Customer: true,
            Type: "contact",
            CompanyType: "person",
            DateCreated: new Date().toISOString(),
            ExtraAddress: partner?.ExtraAddress || null
        },
        Carrier: {
            Id: carrierId,
            Name: carrierName,
            DeliveryType: "fixed",
            Config_DefaultFee: shippingFee
        }
    };
}

// NOTE: TPOS bill functions (fetchAndPrintTPOSBill, openPrintPopupWithHtml)
// have been moved to bill-service.js. Use window.fetchAndPrintTPOSBill() instead.
// Keeping local versions as backup in case bill-service.js is not loaded.

/**
 * Fetch HTML bill from TPOS API and open print popup with STT added
 * @param {number} orderId - Order ID from TPOS
 * @param {object} headers - Auth headers for TPOS API
 * @param {object} orderData - Original order data (for getting STT)
 * @param {number} walletBalance - Wallet balance for fallback custom bill (optional)
 * @param {boolean} hasVirtualDebt - Whether order uses virtual debt from return ticket
 * @deprecated Use window.fetchAndPrintTPOSBill from bill-service.js
 */
async function fetchAndPrintTPOSBill(orderId, headers, orderData, walletBalance = null, hasVirtualDebt = false) {
    try {
        console.log('[SALE-CONFIRM] Fetching HTML bill for order:', orderId);

        // Fetch HTML bill from TPOS API via proxy (to avoid CORS and auto-print)
        const printUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/fastsaleorder/print1?ids=${orderId}`;
        const response = await API_CONFIG.smartFetch(printUrl, {
            method: 'GET',
            headers: {
                ...headers,
                'accept': 'application/json, text/javascript, */*; q=0.01'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (!result.html) {
            throw new Error('No HTML returned from TPOS API');
        }

        console.log('[SALE-CONFIRM] HTML bill fetched successfully');

        // Get STT from order data
        let sttDisplay = '';
        console.log('[SALE-CONFIRM] Order data for STT:', {
            SessionIndex: orderData?.SessionIndex,
            IsMerged: orderData?.IsMerged,
            OriginalOrders: orderData?.OriginalOrders?.length
        });

        if (orderData?.IsMerged && orderData?.OriginalOrders?.length > 1) {
            const allSTTs = orderData.OriginalOrders
                .map(o => o.SessionIndex)
                .filter(stt => stt)
                .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
            sttDisplay = allSTTs.join(', ');
        } else {
            sttDisplay = orderData?.SessionIndex || '';
        }
        console.log('[SALE-CONFIRM] STT display value:', sttDisplay);

        // Modify HTML to add STT below "Người bán" if STT exists
        let modifiedHtml = result.html;
        if (sttDisplay) {
            // Find "Người bán:" div and add STT after it
            // HTML may have "á" as either literal or HTML entity (&#225;)
            // Pattern: <div>...<strong>Người bán:</strong> text</div>
            const nguoiBanRegex = /(<div[^>]*>\s*<strong>Người\s+b(?:á|&#225;|&aacute;)n:<\/strong>[^<]*<\/div>)/i;

            if (nguoiBanRegex.test(modifiedHtml)) {
                modifiedHtml = modifiedHtml.replace(
                    nguoiBanRegex,
                    `$1\n                            <div><strong>STT:</strong> ${sttDisplay}</div>`
                );
                console.log('[SALE-CONFIRM] Added STT to bill:', sttDisplay);
            } else {
                console.log('[SALE-CONFIRM] Could not find "Người bán" in HTML. HTML contains nguoi ban?', modifiedHtml.includes('Người') || modifiedHtml.includes('nguoi'));
            }
        } else {
            console.log('[SALE-CONFIRM] No STT to display');
        }

        // Add "CÓ ĐƠN THU VỀ" note when order uses virtual debt from return ticket
        if (hasVirtualDebt) {
            // Insert after carrier name (before "Tiền thu hộ")
            const codRegex = /(<p[^>]*class=['"]size-16 font-bold['"][^>]*>Tiền thu hộ)/i;
            if (codRegex.test(modifiedHtml)) {
                modifiedHtml = modifiedHtml.replace(
                    codRegex,
                    `<span style="font-weight:bold">** CÓ ĐƠN THU VỀ **</span><br/>\n$1`
                );
                console.log('[SALE-CONFIRM] Added "CÓ ĐƠN THU VỀ" to TPOS bill');
            }
        }

        // Open print popup with modified HTML (use BillService)
        window.openPrintPopupWithHtml(modifiedHtml);

    } catch (error) {
        console.error('[SALE-CONFIRM] Error fetching HTML bill:', error);
        // Fallback to custom bill if TPOS API fails
        // Pass walletBalance for correct calculation (form field may have been modified by debt update)
        console.log('[SALE-CONFIRM] Falling back to custom bill with walletBalance:', walletBalance);
        window.openPrintPopup({ Id: orderId }, { currentSaleOrderData: orderData, walletBalance: walletBalance, hasVirtualDebt: hasVirtualDebt });
    }
}

// NOTE: openPrintPopupWithHtml is now provided by BillService (bill-service.js)

/**
 * Format date with timezone like: 2025-12-11T21:58:53.4497898+07:00
 */
function formatDateWithTimezone(date) {
    const pad = (n, len = 2) => n.toString().padStart(len, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const ms = pad(date.getMilliseconds(), 3);

    // Get timezone offset in hours and minutes
    const tzOffset = -date.getTimezoneOffset();
    const tzHours = pad(Math.floor(Math.abs(tzOffset) / 60));
    const tzMinutes = pad(Math.abs(tzOffset) % 60);
    const tzSign = tzOffset >= 0 ? '+' : '-';

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}0000${tzSign}${tzHours}:${tzMinutes}`;
}

/**
 * Build FastSaleOrder payload from current form data
 */
function buildFastSaleOrderPayload() {
    const order = currentSaleOrderData;
    const partner = currentSalePartnerData;
    const defaultData = window.lastDefaultSaleData || {};

    // Get form values
    const receiverName = document.getElementById('saleReceiverName')?.value || order.PartnerName || '';
    const receiverPhone = document.getElementById('saleReceiverPhone')?.value || order.PartnerPhone || '';
    const receiverAddressRaw = document.getElementById('saleReceiverAddress')?.value || '';
    const receiverAddress = receiverAddressRaw || null; // Use null instead of empty string
    const deliveryNote = document.getElementById('saleDeliveryNote')?.value || '';

    // 🔥 FIX: Use ?? instead of || to allow 0 value for shipping fee
    const shippingFeeValue = document.getElementById('saleShippingFee')?.value;
    const shippingFee = (shippingFeeValue !== '' && shippingFeeValue !== null && shippingFeeValue !== undefined)
        ? parseFloat(shippingFeeValue)
        : 35000;

    const codValue = parseFloat(document.getElementById('saleCOD')?.value) || 0;
    const walletBalance = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
    // PaymentAmount = min(số dư ví, tổng tiền cần thanh toán)
    const prepaidAmount = Math.min(walletBalance, codValue);

    // 🔥 CashOnDelivery = Còn lại = Total - Prepaid
    const cashOnDelivery = codValue - prepaidAmount;

    // Get carrier from dropdown (saleDeliveryPartner)
    const carrierSelect = document.getElementById('saleDeliveryPartner');
    const carrierId = carrierSelect?.value ? parseInt(carrierSelect.value) : 7;
    const selectedOption = carrierSelect?.selectedOptions[0];
    // Get carrier name from data-name attribute (clean name without fee), fallback to option text
    const carrierName = selectedOption?.dataset?.name || selectedOption?.text?.replace(/\s*\([^)]*\)$/, '') || 'SHIP TỈNH';
    const carrierFee = parseFloat(selectedOption?.dataset?.fee) || shippingFee;

    // Get full carrier data from cache if available
    const cachedCarriers = getCachedDeliveryCarriers();
    const fullCarrierData = cachedCarriers?.find(c => c.Id === carrierId) || null;

    // Build order lines from current products (with full Product data)
    const orderLines = buildOrderLines();

    // Calculate totals
    const originalAmountTotal = orderLines.reduce((sum, line) => sum + (line.PriceTotal || 0), 0);
    const totalQuantity = orderLines.reduce((sum, line) => sum + (line.ProductUOMQty || 0), 0);

    // 🔥 DISCOUNT LOGIC: Check for "GIẢM GIÁ" tag and apply discount from product notes
    let decreaseAmountPayload = 0;
    let finalAmountTotalPayload = originalAmountTotal;

    if (saleOrderHasDiscountTag(order)) {
        const { totalDiscount, discountedProducts } = calculateSaleOrderDiscount(order);
        if (totalDiscount > 0) {
            decreaseAmountPayload = totalDiscount;
            finalAmountTotalPayload = originalAmountTotal - decreaseAmountPayload;
            console.log(`[SALE-PAYLOAD-DISCOUNT] Applied ${decreaseAmountPayload.toLocaleString('vi-VN')}đ discount`);
        }
    }

    const now = new Date();
    const dateInvoice = now.toISOString();
    // Format DateCreated with timezone like: 2025-12-11T21:58:53.4497898+07:00
    const dateCreated = formatDateWithTimezone(now);

    // Get User from defaultData (from ODataService.DefaultGet)
    const user = defaultData.User || null;
    const userId = user?.Id || null;
    const userName = user?.Name || null;

    // Build payload matching the sample from fetchFastSaleOrder.text
    const payload = {
        Id: 0,
        Name: null,
        PrintShipCount: 0,
        PrintDeliveryCount: 0,
        PaymentMessageCount: 0,
        MessageCount: 0,
        PartnerId: partner?.Id || order.PartnerId || 0,
        PartnerDisplayName: partner?.DisplayName || partner?.Name || receiverName || null,
        PartnerEmail: null,
        PartnerFacebookId: partner?.FacebookId || order.Facebook_ASUserId || null,
        PartnerFacebook: null,
        PartnerPhone: receiverPhone || null,
        Reference: order.Code || '',
        PriceListId: 1,
        AmountTotal: finalAmountTotalPayload,
        TotalQuantity: totalQuantity,
        Discount: 0,
        DiscountAmount: 0,
        DecreaseAmount: decreaseAmountPayload,
        DiscountLoyaltyTotal: null,
        WeightTotal: 0,
        AmountTax: 0,
        AmountUntaxed: finalAmountTotalPayload,
        TaxId: null,
        MoveId: null,
        UserId: userId,
        UserName: userName,
        DateInvoice: dateInvoice,
        DateCreated: dateCreated,
        CreatedById: null,
        State: 'draft',
        ShowState: 'Nháp',
        CompanyId: window.tokenManager?.companyId || 1,
        Comment: document.getElementById('saleReceiverNote')?.value || '',
        WarehouseId: window.lastDefaultSaleData?.Warehouse?.Id || 1,
        SaleOnlineIds: order.Id ? [order.Id] : [],
        SaleOnlineNames: [],
        Residual: null,
        Type: 'invoice',
        RefundOrderId: null,
        ReferenceNumber: null,
        AccountId: window.lastDefaultSaleData?.Account?.Id || 1,
        JournalId: window.lastDefaultSaleData?.Journal?.Id || 3,
        Number: null,
        MoveName: null,
        PartnerNameNoSign: null,
        DeliveryPrice: shippingFee,
        CustomerDeliveryPrice: null,
        CarrierId: carrierId,
        CarrierName: carrierName,
        CarrierDeliveryType: fullCarrierData?.DeliveryType || 'fixed',
        DeliveryNote: deliveryNote,
        ReceiverName: receiverName,
        ReceiverPhone: receiverPhone,
        ReceiverAddress: receiverAddress,
        ReceiverDate: dateCreated,
        ReceiverNote: null,
        CashOnDelivery: cashOnDelivery,
        TrackingRef: null,
        TrackingArea: null,
        TrackingTransport: null,
        TrackingSortLine: null,
        TrackingUrl: '',
        IsProductDefault: false,
        TrackingRefSort: null,
        ShipStatus: 'none',
        ShowShipStatus: 'Chưa tiếp nhận',
        SaleOnlineName: '',
        PartnerShippingId: null,
        PaymentJournalId: 1,
        PaymentAmount: prepaidAmount, // = min(walletBalance, totalPayment)
        SaleOrderId: null,
        SaleOrderIds: [],
        FacebookName: receiverName,
        FacebookNameNosign: null,
        FacebookId: partner?.FacebookId || order.Facebook_ASUserId || null,
        DisplayFacebookName: null,
        Deliver: null,
        ShipWeight: 100,
        ShipPaymentStatus: null,
        ShipPaymentStatusCode: null,
        OldCredit: 0,
        NewCredit: amountTotal,
        Phone: receiverPhone || null,
        Address: receiverAddress || null,
        AmountTotalSigned: null,
        ResidualSigned: null,
        Origin: null,
        AmountDeposit: 0,
        CompanyName: 'NJD Live',
        PreviousBalance: codValue,
        ToPay: null,
        NotModifyPriceFromSO: false,
        Ship_ServiceId: null,
        Ship_ServiceName: null,
        Ship_ServiceExtrasText: '[]',
        Ship_ExtrasText: null,
        Ship_InsuranceFee: 0,
        CurrencyName: 'VND',
        TeamId: null,
        TeamOrderCode: null,
        TeamOrderId: null,
        TeamType: null,
        Revenue: null,
        SaleOrderDeposit: 0,
        Seri: null,
        NumberOrder: null,
        DateOrderRed: null,
        ApplyPromotion: null,
        TimeLock: null,
        PageName: null,
        Tags: null,
        IRAttachmentUrl: null,
        IRAttachmentUrls: [],
        SaleOnlinesOfPartner: null,
        IsDeposited: null,
        LiveCampaignName: null,
        LiveCampaignId: null,
        Source: null,
        CartNote: null,
        ExtraPaymentAmount: null,
        QuantityUpdateDeposit: null,
        IsMergeCancel: null,
        IsPickUpAtShop: null,
        DateDeposit: null,
        IsRefund: null,
        StateCode: 'None',
        ActualPaymentAmount: null,
        RowVersion: null,
        ExchangeRate: null,
        DestConvertCurrencyUnitId: null,
        WiPointQRCode: null,
        WiInvoiceId: null,
        WiInvoiceChannelId: null,
        WiInvoiceStatus: null,
        WiInvoiceTrackingUrl: '',
        WiInvoiceIsReplate: false,
        FormAction: 'SaveAndPrint',
        Ship_Receiver: {
            IsNewAddress: false,
            Name: receiverName,
            Phone: receiverPhone,
            Street: null,
            City: { name: null, code: null, cityCode: null, cityName: null, districtCode: null, districtName: null },
            District: { name: null, code: null, cityCode: null, cityName: null, districtCode: null, districtName: null },
            Ward: { name: null, code: null, cityCode: null, cityName: null, districtCode: null, districtName: null },
            ExtraAddress: {
                Street: null,
                NewStreet: null,
                City: { name: null, nameNoSign: null, code: null },
                District: { name: null, nameNoSign: null, code: null, cityName: null, cityCode: null },
                Ward: { name: null, nameNoSign: null, code: null, cityName: null, cityCode: null, districtName: null, districtCode: null },
                NewCity: null,
                NewWard: null
            }
        },
        Ship_Extras: {
            PickWorkShift: null,
            PickWorkShiftName: null,
            DeliverWorkShift: null,
            DeliverWorkShiftName: null,
            PaymentTypeId: null,
            PosId: null,
            IsDropoff: false,
            IsInsurance: false,
            InsuranceFee: null,
            IsPackageViewable: false,
            Is_Fragile: false,
            PickupAccountId: null,
            SoldToAccountId: null,
            IsPartSign: null,
            IsAllowTryout: false,
            IsDeductCod: false,
            IsCollectMoneyGoods: false,
            CollectMoneyGoods: null,
            ConfirmType: null,
            PartialDelivery: null,
            IsRefund: null,
            ServiceCustoms: [],
            IsInsuranceEqualTotalAmount: false,
            IsReturn: false,
            IsSenderAddress: false,
            SenderAddress: { Street: null, City: null, District: null, Ward: null }
        },
        PaymentInfo: [],
        Search: null,
        ShipmentDetailsAship: {
            ConfigsProvider: [],
            PackageInfo: { PackageLength: 0, PackageWidth: 0, PackageHeight: 0 }
        },
        OrderMergeds: [],
        OrderAfterMerged: null,
        TPayment: null,
        ExtraUpdateCODCarriers: [],
        AppliedPromotionLoyalty: null,
        FastSaleOrderOmniExtras: null,
        Billing: null,
        PackageInfo: { PackageLength: 0, PackageWidth: 0, PackageHeight: 0 },
        Error: null,
        Warehouse: window.lastDefaultSaleData?.Warehouse || null,
        User: window.lastDefaultSaleData?.User || null,
        PriceList: window.lastDefaultSaleData?.PriceList || null,
        Company: window.lastDefaultSaleData?.Company || null,
        Journal: window.lastDefaultSaleData?.Journal || null,
        PaymentJournal: window.lastDefaultSaleData?.PaymentJournal || null,
        Partner: partner || null,
        Carrier: fullCarrierData || { Id: carrierId, Name: carrierName, DeliveryType: 'fixed', Config_DefaultFee: carrierFee, Active: true },
        Tax: null,
        SaleOrder: null,
        DestConvertCurrencyUnit: null,
        Ship_ServiceExtras: [],
        OrderLines: orderLines,
        OfferAmountDetails: [],
        Account: window.lastDefaultSaleData?.Account || null
    };

    return payload;
}

/**
 * Build order lines from current modal data (uses API data with full Product/ProductUOM)
 */
function buildOrderLines() {
    const order = currentSaleOrderData;

    // Use orderLines from API (stored by populateSaleOrderLinesFromAPI)
    if (order?.orderLines && order.orderLines.length > 0) {
        return order.orderLines.map(item => {
            const qty = item.ProductUOMQty || item.Quantity || 1;
            const price = item.PriceUnit || item.Price || 0;
            const total = qty * price;

            return {
                Id: 0,
                ProductId: item.ProductId || item.Product?.Id || 0,
                ProductUOMId: item.ProductUOMId || 1,
                PriceUnit: price,
                ProductUOMQty: qty,
                Discount: item.Discount || 0,
                PriceTotal: total,
                PriceSubTotal: total,
                AccountId: item.AccountId || 5,
                PriceRecent: price,
                ProductName: item.Product?.NameGet || item.ProductName || '',
                ProductUOMName: item.ProductUOMName || item.ProductUOM?.Name || 'Cái',
                Weight: item.Weight || 0,
                Note: item.Note || null,
                SaleOnlineDetailId: item.SaleOnlineDetailId || item.Id || null,
                Product: item.Product || null, // Include full Product object
                ProductUOM: item.ProductUOM || { Id: 1, Name: 'Cái', Factor: 1, FactorInv: 1 }, // Include full ProductUOM
                Discount_Fixed: item.Discount_Fixed || 0,
                Type: item.Type || 'fixed',
                WeightTotal: item.WeightTotal || 0
            };
        });
    }

    // Fallback to order.Details if orderLines not available
    if (order?.Details && order.Details.length > 0) {
        return order.Details.map(detail => {
            const price = detail.Price || 0;
            const quantity = detail.Quantity || 1;
            const total = price * quantity;

            return {
                Id: 0,
                ProductId: detail.ProductId || 0,
                ProductUOMId: 1,
                PriceUnit: price,
                ProductUOMQty: quantity,
                Discount: 0,
                PriceTotal: total,
                PriceSubTotal: total,
                AccountId: 5,
                PriceRecent: price,
                ProductName: detail.ProductName || detail.ProductNameGet || '',
                ProductUOMName: 'Cái',
                Weight: 0,
                Note: detail.Note || null,
                SaleOnlineDetailId: detail.Id || null,
                Product: null,
                ProductUOM: { Id: 1, Name: 'Cái', Factor: 1, FactorInv: 1 },
                Discount_Fixed: 0,
                Type: 'fixed',
                WeightTotal: 0
            };
        });
    }

    return [];
}

// ============================================================================
// BILL SERVICE - Functions moved to bill-service.js
// Use window.BillService.generateCustomBillHTML, openPrintPopup, generateBillImage, sendBillToCustomer
// or global functions: generateCustomBillHTML, openPrintPopup, generateBillImage, sendBillToCustomer
// ============================================================================

// Add keyboard shortcut F9 for confirm and print
document.addEventListener('keydown', function (e) {
    if (e.key === 'F9') {
        const modal = document.getElementById('saleButtonModal');
        if (modal && modal.style.display === 'flex') {
            e.preventDefault();
            confirmAndPrintSale();
        }
    }
});

// ============================================================================
// CHAT MODAL - RIGHT PANEL TOGGLE
// ============================================================================

/**
 * Toggle chat right panel visibility
 */
function toggleChatRightPanel() {
    const rightPanel = document.querySelector('.chat-right-panel');
    const toggleIcon = document.getElementById('chatPanelToggleIcon');

    if (!rightPanel || !toggleIcon) return;

    const isCollapsed = rightPanel.classList.contains('collapsed');

    if (isCollapsed) {
        // Open panel
        rightPanel.classList.remove('collapsed');
        toggleIcon.className = 'fas fa-chevron-right';
    } else {
        // Close panel
        rightPanel.classList.add('collapsed');
        toggleIcon.className = 'fas fa-chevron-left';
    }
}

// Export functions
window.confirmAndPrintSale = confirmAndPrintSale;
if (typeof confirmDebtUpdate !== 'undefined') {
    window.confirmDebtUpdate = confirmDebtUpdate;
}
// Note: openPrintPopup is now exported from bill-service.js
window.toggleChatRightPanel = toggleChatRightPanel;
// Note: removeChatProduct and updateChatProductQuantity are defined in tab1-chat-products.js
if (typeof removeChatProduct !== 'undefined') {
    window.removeChatProduct = removeChatProduct;
}
if (typeof updateChatProductQuantity !== 'undefined') {
    window.updateChatProductQuantity = updateChatProductQuantity;
}

// Chat Product Manager - For Orders tab in right panel
window.chatProductManager = {
    addProductFromSearch: typeof addChatProductFromSearch !== 'undefined' ? addChatProductFromSearch : function() { console.warn('addChatProductFromSearch not loaded yet'); },
    renderInvoiceHistory: function () {
        // TODO: Implement invoice history rendering
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

