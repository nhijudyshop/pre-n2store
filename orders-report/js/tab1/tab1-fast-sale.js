// ====================================
// #region IMAGE ZOOM
// ====================================

/**
 * Show image zoom overlay
 * @param {string} imageUrl - URL of the image to zoom
 * @param {string} productName - Name of the product (for caption)
 */
window.showImageZoom = function (imageUrl, productName = '') {
    const overlay = document.getElementById('imageZoomOverlay');
    const img = document.getElementById('imageZoomImg');
    const caption = document.getElementById('imageZoomCaption');

    if (!overlay || !img) {
        console.error('[IMAGE-ZOOM] Overlay elements not found');
        return;
    }

    // Set image source
    img.src = imageUrl;

    // Set caption if provided
    if (caption && productName) {
        caption.textContent = productName;
        caption.style.display = 'block';
    } else if (caption) {
        caption.style.display = 'none';
    }

    // Show overlay with animation
    overlay.classList.add('show');

    // Prevent body scroll when overlay is open
    document.body.style.overflow = 'hidden';

    console.log('[IMAGE-ZOOM] Showing image:', imageUrl);
};

/**
 * Close image zoom overlay
 */
window.closeImageZoom = function () {
    const overlay = document.getElementById('imageZoomOverlay');
    if (!overlay) return;

    // Hide overlay
    overlay.classList.remove('show');

    // Restore body scroll
    document.body.style.overflow = '';

    console.log('[IMAGE-ZOOM] Closed');
};

// Close on ESC key
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const overlay = document.getElementById('imageZoomOverlay');
        if (overlay && overlay.classList.contains('show')) {
            window.closeImageZoom();
        }
    }
});

// #endregion IMAGE ZOOM

// =====================================================
// FAST SALE MODAL (Tạo nhanh PBH)
// =====================================================

let fastSaleOrdersData = [];
window.fastSaleOrdersData = fastSaleOrdersData; // Expose for InvoiceStatusStore to access edited addresses
let fastSaleWalletBalances = {}; // Store wallet balances by phone: { "0909999999": { balance: 200000, virtual_balance: 0 } }

// =====================================================
// DISCOUNT PARSING UTILITIES
// =====================================================

/**
 * Parse discount amount from product note
 * Supports formats: "100k", "100K", "100000", "100.000", "50k", "190k ( THANH TRUC )", etc.
 * The XXXk pattern can appear anywhere in the note with additional text
 * @param {string} note - Product note containing discount
 * @returns {number} Discount amount in VND (0 if no valid discount found)
 */
function parseDiscountFromNote(note) {
    if (!note || typeof note !== 'string') return 0;

    // Trim and lowercase
    const cleanNote = note.trim().toLowerCase();
    if (!cleanNote) return 0;

    // Match patterns: number followed by 'k' anywhere in the note
    // Pattern 1: "100k", "190k ( THANH TRUC )", "hàng 150k sale" -> finds XXXk
    // Use word boundary or start/whitespace to avoid matching partial numbers
    const kMatch = cleanNote.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*k(?:\s|$|\(|\))/i);
    if (kMatch) {
        const num = parseFloat(kMatch[1].replace(',', '.'));
        return Math.round(num * 1000);
    }

    // Pattern 2: Check if the entire note is just a number (could be "100000" or "100.000" or "100")
    // This pattern remains strict - only entire note being a number
    const plainMatch = cleanNote.match(/^(\d{1,3}(?:[.,]\d{3})*|\d+)$/);
    if (plainMatch) {
        // Remove dots/commas used as thousand separators
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
 * Check if an order has the "GIẢM GIÁ" tag
 * @param {Object} order - FastSaleOrder or SaleOnlineOrder
 * @returns {boolean} True if order has discount tag
 */
function orderHasDiscountTag(order) {
    // Check from SaleOnlineOrder (via SaleOnlineIds)
    let saleOnlineOrder = null;
    if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
        const saleOnlineId = order.SaleOnlineIds[0];
        saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);
    }

    // Check Tags from saleOnlineOrder
    if (saleOnlineOrder?.Tags) {
        try {
            const tags = typeof saleOnlineOrder.Tags === 'string'
                ? JSON.parse(saleOnlineOrder.Tags)
                : saleOnlineOrder.Tags;

            if (Array.isArray(tags)) {
                return tags.some(tag => {
                    const tagName = (tag.Name || '').toUpperCase();
                    return tagName.includes('GIẢM GIÁ') || tagName.includes('GIAM GIA');
                });
            }
        } catch (e) {
            console.warn('[FAST-SALE] Error parsing tags:', e);
        }
    }

    return false;
}

/**
 * Calculate total discount for an order by parsing all product notes
 * @param {Object} order - FastSaleOrder with OrderLines
 * @returns {{totalDiscount: number, discountedProducts: Array}} Total discount and list of discounted products
 */
function calculateOrderDiscount(order) {
    const orderLines = order.OrderLines || [];
    let totalDiscount = 0;
    const discountedProducts = [];

    orderLines.forEach(line => {
        const note = line.Note || '';
        const notePrice = parseDiscountFromNote(note);  // "100k" = 100000 (giá bán thực tế)
        if (notePrice > 0) {
            const priceUnit = line.PriceUnit || 0;
            const qty = line.ProductUOMQty || 1;
            const discountPerUnit = priceUnit - notePrice;  // 180000 - 100000 = 80000
            if (discountPerUnit > 0) {
                const lineDiscount = discountPerUnit * qty;  // 80000 * 2 = 160000
                totalDiscount += lineDiscount;
                discountedProducts.push({
                    productName: line.ProductName || 'N/A',
                    discount: lineDiscount,
                    note: note
                });
            }
        }
    });

    return { totalDiscount, discountedProducts };
}

/**
 * Fetch wallet balances for multiple phones (batch)
 * @param {Array<string>} phones - Array of phone numbers
 * @returns {Promise<Object>} Map of phone -> wallet data
 */
async function fetchWalletBalancesForFastSale(phones) {
    if (!phones || phones.length === 0) return {};

    // Normalize and dedupe phones
    const uniquePhones = [...new Set(phones.filter(p => p).map(p => {
        // Use same normalization as normalizePhoneForQR
        let cleaned = String(p).replace(/\D/g, '');
        if (cleaned.startsWith('84') && cleaned.length > 9) {
            cleaned = '0' + cleaned.substring(2);
        }
        return cleaned;
    }).filter(p => p.length >= 9))];

    if (uniquePhones.length === 0) return {};

    console.log(`[FAST-SALE] Fetching wallet balances for ${uniquePhones.length} phones...`);

    try {
        const response = await fetch(`${QR_API_URL}/api/v2/wallets/batch-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phones: uniquePhones })
        });

        if (!response.ok) {
            console.error(`[FAST-SALE] Wallet batch API error: ${response.status}`);
            return {};
        }

        const result = await response.json();

        if (result.success && result.data) {
            console.log(`[FAST-SALE] ✅ Fetched wallet balances for ${Object.keys(result.data).length} phones`);
            return result.data;
        }

        return {};
    } catch (error) {
        console.error('[FAST-SALE] Error fetching wallet balances:', error);
        return {};
    }
}

/**
 * Get TPOS account display for modal subtitle
 * Shows which account will be used for bill creation
 */
function getTposAccountDisplay() {
    if (!window.billTokenManager) {
        return '<span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 8px;">⚠️ BillTokenManager không sẵn sàng</span>';
    }

    if (window.billTokenManager.hasCredentials()) {
        const info = window.billTokenManager.getCredentialsInfo();
        const accountName = info.type === 'password' ? info.username : 'Bearer Token';
        return `<span style="background: #d1fae5; color: #047857; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 8px;">🔑 TK: ${accountName}</span>`;
    } else {
        return '<span style="background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-left: 8px;">🔐 Token mặc định</span>';
    }
}

/**
 * Get auth header for bill operations - MUST use billTokenManager
 * Throws error if not configured
 */
async function getBillAuthHeader() {
    // Ensure credentials are loaded (important for incognito mode)
    if (window.billTokenManager) {
        await window.billTokenManager.ensureCredentialsLoaded();
    }

    // Check if billTokenManager has credentials
    if (!window.billTokenManager?.hasCredentials()) {
        const errorMsg = 'Chưa cấu hình tài khoản TPOS cho bill. Vui lòng vào "Tài khoản TPOS" để cài đặt.';
        window.notificationManager?.error(errorMsg, 5000);
        throw new Error(errorMsg);
    }

    const credInfo = window.billTokenManager.getCredentialsInfo();
    const accountInfo = credInfo.type === 'password' ? credInfo.username : 'Bearer Token';
    console.log(`[FAST-SALE] ✓ Using billTokenManager (${accountInfo})`);

    return await window.billTokenManager.getAuthHeader();
}

/**
 * Show Fast Sale Modal and fetch data for selected orders
 */
async function showFastSaleModal() {
    const modal = document.getElementById('fastSaleModal');
    const modalBody = document.getElementById('fastSaleModalBody');
    const subtitle = document.getElementById('fastSaleModalSubtitle');

    // Reset state
    fastSaleOrdersData = [];
    window.fastSaleOrdersData = fastSaleOrdersData;
    fastSaleWalletBalances = {};
    isSavingFastSale = false; // Reset submission flag

    // Show modal with loading state
    modal.classList.add('show');
    clearFastSaleStatus();  // Clear any previous status messages

    // Reset confirm buttons state (in case they were disabled from previous session)
    const saveBtn = document.getElementById('confirmFastSaleBtn');
    const confirmBtn = document.getElementById('confirmAndCheckFastSaleBtn');
    if (saveBtn) saveBtn.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
    modalBody.innerHTML = `
        <div class="merge-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải dữ liệu đơn hàng...</p>
        </div>
    `;

    // Restore bill type preference from localStorage (default: 'web')
    const savedBillType = localStorage.getItem('fastSaleBillTypePreference') || 'web';
    const billTypeWeb = document.getElementById('fastSaleBillTypeWeb');
    const billTypeTpos = document.getElementById('fastSaleBillTypeTpos');
    if (billTypeWeb && billTypeTpos) {
        billTypeWeb.checked = savedBillType === 'web';
        billTypeTpos.checked = savedBillType === 'tpos';
    }

    try {
        // Get selected order IDs
        const allSelectedIds = Array.from(selectedOrderIds);

        if (allSelectedIds.length === 0) {
            showFastSaleStatus('Vui lòng chọn ít nhất một đơn hàng', 'warning');
            modalBody.innerHTML = `
                <div class="merge-no-duplicates">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Vui lòng chọn ít nhất một đơn hàng.</p>
                </div>
            `;
            return;
        }

        // Filter out orders with no products (TotalQuantity === 0)
        // These orders will cause API error "chưa có chi tiết"
        const emptyCartIds = [];
        const selectedIds = allSelectedIds.filter(orderId => {
            const order = window.OrderStore?.get(orderId) || displayedData.find(o => o.Id === orderId);
            if (!order) return true; // Keep if can't find order data
            if (order.TotalQuantity === 0) {
                emptyCartIds.push(order.Code || orderId);
                return false; // Exclude empty cart orders
            }
            return true;
        });

        // Show warning if some orders were filtered out
        if (emptyCartIds.length > 0) {
            console.warn(`[FAST-SALE] Filtered out ${emptyCartIds.length} empty cart orders:`, emptyCartIds);
            if (window.notificationManager) {
                window.notificationManager.warning(
                    `Đã bỏ qua ${emptyCartIds.length} đơn giỏ trống (không có sản phẩm)`,
                    4000
                );
            }
        }

        if (selectedIds.length === 0) {
            showFastSaleStatus('Tất cả đơn đều là giỏ trống (không có sản phẩm)', 'warning');
            modalBody.innerHTML = `
                <div class="merge-no-duplicates">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Tất cả đơn hàng đã chọn đều là giỏ trống (không có sản phẩm).</p>
                </div>
            `;
            return;
        }

        // Update subtitle with TPOS account info (will be updated again after filtering confirmed orders)
        const tposAccountInfo = getTposAccountDisplay();
        subtitle.innerHTML = `Đang tải... ${tposAccountInfo}`;

        // Fetch FastSaleOrder data using batch API
        let fetchedOrders = await fetchFastSaleOrdersData(selectedIds);

        // DEDUPE: Remove duplicates by SaleOnlineIds[0] (source of truth)
        const seenIds = new Set();
        fetchedOrders = fetchedOrders.filter(order => {
            const key = order.SaleOnlineIds?.[0];
            if (!key) return true; // Keep orders without SaleOnlineIds
            if (seenIds.has(key)) {
                console.warn(`[FAST-SALE] Removed duplicate order: ${order.Reference} (SaleOnlineId: ${key})`);
                return false;
            }
            seenIds.add(key);
            return true;
        });

        if (fetchedOrders.length === 0) {
            showFastSaleStatus('Không thể tải dữ liệu đơn hàng từ API', 'error');
            modalBody.innerHTML = `
                <div class="merge-no-duplicates">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Không thể tải dữ liệu đơn hàng. Vui lòng thử lại.</p>
                </div>
            `;
            return;
        }

        // Filter out orders that already have confirmed/paid invoices
        // These orders should NOT be re-submitted to avoid duplicates
        const confirmedOrderCodes = [];
        fastSaleOrdersData = fetchedOrders.filter(order => {
            // Check 1: FastSaleOrder has confirmed/paid status from API
            if (order.ShowState === 'Đã xác nhận' || order.ShowState === 'Đã thanh toán' || order.State === 'open') {
                const code = order.Reference || order.SaleOnlineIds?.[0] || order.Id;
                confirmedOrderCodes.push(code);
                console.log(`[FAST-SALE] Skipping confirmed/paid order: ${code} (ShowState: ${order.ShowState}, State: ${order.State})`);
                return false;
            }

            // Check 2: InvoiceStatusStore has confirmed/paid invoice for this SaleOnlineId
            const saleOnlineId = order.SaleOnlineIds?.[0];
            if (saleOnlineId && window.InvoiceStatusStore) {
                const invoiceData = window.InvoiceStatusStore.get(saleOnlineId);
                if (invoiceData && (invoiceData.ShowState === 'Đã xác nhận' || invoiceData.ShowState === 'Đã thanh toán' || invoiceData.State === 'open')) {
                    const code = order.Reference || saleOnlineId;
                    confirmedOrderCodes.push(code);
                    console.log(`[FAST-SALE] Skipping order with confirmed/paid invoice in store: ${code}`);
                    return false;
                }
            }

            return true; // Keep order for processing
        });
        window.fastSaleOrdersData = fastSaleOrdersData;

        // Show warning if some orders were filtered out due to confirmed/paid status
        if (confirmedOrderCodes.length > 0) {
            console.warn(`[FAST-SALE] Filtered out ${confirmedOrderCodes.length} confirmed/paid orders:`, confirmedOrderCodes);
            if (window.notificationManager) {
                window.notificationManager.warning(
                    `Đã bỏ qua ${confirmedOrderCodes.length} đơn đã có phiếu "Đã xác nhận" hoặc "Đã thanh toán"`,
                    4000
                );
            }
        }

        // Check if all orders were filtered out
        if (fastSaleOrdersData.length === 0) {
            showFastSaleStatus('Tất cả đơn đã có phiếu "Đã xác nhận" hoặc "Đã thanh toán"', 'warning');
            modalBody.innerHTML = `
                <div class="merge-no-duplicates">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Tất cả đơn hàng đã chọn đều đã có phiếu "Đã xác nhận" hoặc "Đã thanh toán".</p>
                    <p style="font-size: 12px; color: #6b7280;">Không thể tạo phiếu mới cho các đơn đã xử lý.</p>
                </div>
            `;
            return;
        }

        // Update subtitle with final count after filtering
        const totalFiltered = emptyCartIds.length + confirmedOrderCodes.length;
        const filterDetails = [];
        if (emptyCartIds.length > 0) filterDetails.push(`${emptyCartIds.length} giỏ trống`);
        if (confirmedOrderCodes.length > 0) filterDetails.push(`${confirmedOrderCodes.length} đã có phiếu`);
        const filteredInfo = totalFiltered > 0 ? ` (đã bỏ ${filterDetails.join(', ')})` : '';
        subtitle.innerHTML = `Đã chọn ${fastSaleOrdersData.length} đơn hàng${filteredInfo} ${tposAccountInfo}`;

        // Fetch wallet balances for all customer phones
        const phones = fastSaleOrdersData.map(order => {
            // Get phone from SaleOnlineOrder first
            if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                const saleOnlineId = order.SaleOnlineIds[0];
                const saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);
                if (saleOnlineOrder?.Telephone) return saleOnlineOrder.Telephone;
            }
            return order.PartnerPhone || order.Partner?.PartnerPhone;
        }).filter(Boolean);

        fastSaleWalletBalances = await fetchWalletBalancesForFastSale(phones);

        // Render modal body
        renderFastSaleModalBody();

    } catch (error) {
        console.error('[FAST-SALE] Error loading data:', error);
        showFastSaleStatus('Lỗi khi tải dữ liệu: ' + error.message, 'error');
        modalBody.innerHTML = `
            <div class="merge-no-duplicates">
                <i class="fas fa-exclamation-circle"></i>
                <p>Đã xảy ra lỗi khi tải dữ liệu: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Close Fast Sale Modal
 */
function closeFastSaleModal() {
    const modal = document.getElementById('fastSaleModal');
    modal.classList.remove('show');

    // Reset state
    fastSaleOrdersData = [];
    window.fastSaleOrdersData = fastSaleOrdersData;
    clearFastSaleStatus();  // Clear status message when closing modal
}

/**
 * Remove an order from Fast Sale selection
 * @param {number} index - Index of order to remove
 */
function removeOrderFromFastSale(index) {
    if (index < 0 || index >= fastSaleOrdersData.length) {
        console.warn('[FAST-SALE] Invalid index for removal:', index);
        return;
    }

    const removedOrder = fastSaleOrdersData[index];
    console.log(`[FAST-SALE] Removing order at index ${index}:`, removedOrder.Reference || removedOrder.Id);

    // Remove from array
    fastSaleOrdersData.splice(index, 1);

    // Update subtitle count
    const subtitle = document.getElementById('fastSaleModalSubtitle');
    if (subtitle) {
        subtitle.textContent = `Đã chọn ${fastSaleOrdersData.length} đơn hàng (đã bỏ 1 giỏ trống)`;
    }

    // Re-render the modal body
    if (fastSaleOrdersData.length === 0) {
        closeFastSaleModal();
        showNotification('Đã bỏ tất cả đơn hàng khỏi danh sách', 'info');
    } else {
        renderFastSaleModalBody();
        showNotification(`Đã bỏ đơn ${removedOrder.Reference || ''} khỏi danh sách`, 'info');
    }
}

/**
 * Fetch FastSaleOrder data for multiple orders (batch)
 * API has a limit of 200 orders per request, so we batch requests
 * @param {Array<string>} orderIds - Array of Order IDs
 * @returns {Promise<Array<Object>>} Array of FastSaleOrder data
 */
async function fetchFastSaleOrdersData(orderIds) {
    const BATCH_SIZE = 200; // API limit is 200 orders per request

    try {
        // MUST use billTokenManager - no fallback to default tokenManager
        const headers = await getBillAuthHeader();

        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetListOrderIds?$expand=OrderLines,Partner,Carrier`;

        console.log(`[FAST-SALE] Fetching ${orderIds.length} orders from API...`);

        // Split orderIds into batches of BATCH_SIZE
        const batches = [];
        for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
            batches.push(orderIds.slice(i, i + BATCH_SIZE));
        }

        console.log(`[FAST-SALE] Split into ${batches.length} batches (max ${BATCH_SIZE} per batch)`);

        // Fetch all batches in parallel
        const batchPromises = batches.map(async (batchIds, batchIndex) => {
            console.log(`[FAST-SALE] Fetching batch ${batchIndex + 1}/${batches.length} (${batchIds.length} orders)...`);

            const response = await API_CONFIG.smartFetch(url, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ids: batchIds
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[FAST-SALE] Batch ${batchIndex + 1} failed: HTTP ${response.status}`);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log(`[FAST-SALE] Batch ${batchIndex + 1} returned ${data.value?.length || 0} orders`);
            return data.value || [];
        });

        // Wait for all batches
        const batchResults = await Promise.all(batchPromises);

        // Combine all results
        const allOrders = batchResults.flat();

        if (allOrders.length > 0) {
            console.log(`[FAST-SALE] Successfully fetched ${allOrders.length} FastSaleOrders total`);

            // Enrich with SessionIndex from SaleOnlineOrder (displayedData)
            const enrichedOrders = allOrders.map(order => {
                // Find matching SaleOnlineOrder by SaleOnlineIds
                const saleOnlineId = order.SaleOnlineIds?.[0];
                if (saleOnlineId) {
                    const saleOnlineOrder = window.OrderStore?.get(saleOnlineId) ||
                        displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId));
                    if (saleOnlineOrder) {
                        order.SessionIndex = saleOnlineOrder.SessionIndex || '';
                        order.SaleOnlineOrder = saleOnlineOrder; // Store reference for later use
                    }
                }
                return order;
            });

            return enrichedOrders;
        } else {
            console.warn(`[FAST-SALE] No FastSaleOrder found for ${orderIds.length} orders`);
            return [];
        }
    } catch (error) {
        console.error(`[FAST-SALE] Error fetching orders:`, error);

        // Fallback: return basic data from displayedData
        console.warn('[FAST-SALE] Using fallback data from displayedData');
        return orderIds.map(orderId => {
            // O(1) via OrderStore with fallback
            const order = window.OrderStore?.get(orderId) || displayedData.find(o => o.Id === orderId);
            if (!order) return null;

            return {
                Id: null,
                Reference: order.Code,
                PartnerDisplayName: order.Name || order.PartnerName,
                PartnerPhone: order.Telephone,
                PartnerAddress: order.Address,
                DeliveryPrice: 35000,
                CarrierName: 'SHIP TỈNH',
                SaleOnlineOrder: order,
                OrderLines: order.Details || [],
                NotFound: true
            };
        }).filter(o => o !== null);
    }
}

/**
 * Render Fast Sale Modal Body
 */
async function renderFastSaleModalBody() {
    const modalBody = document.getElementById('fastSaleModalBody');

    // Clear unsaved address tracking when modal re-renders
    unsavedAddressRows.clear();

    if (fastSaleOrdersData.length === 0) {
        modalBody.innerHTML = `
            <div class="merge-no-duplicates">
                <i class="fas fa-inbox"></i>
                <p>Không có dữ liệu để hiển thị.</p>
            </div>
        `;
        return;
    }

    // Fetch delivery carriers first
    const carriers = await fetchDeliveryCarriers();
    console.log(`[FAST-SALE] Fetched ${carriers.length} delivery carriers`);

    // Render table similar to the image provided
    const html = `
        <div class="fast-sale-container">
            <div class="fast-sale-search-box" style="padding: 12px 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                <div style="position: relative; max-width: 400px;">
                    <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9ca3af;"></i>
                    <input type="text" id="fastSaleSearchInput" class="form-control"
                        placeholder="Tìm theo SĐT, tên, mã SP (VD: [N2687])"
                        style="padding-left: 36px; border-radius: 6px;"
                        oninput="filterFastSaleRows(this.value)">
                </div>
            </div>
            <div class="fast-sale-table-wrapper">
                <table class="fast-sale-table">
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Sản phẩm</th>
                            <th>Số lượng</th>
                            <th>Số tiền</th>
                            <th>Tổng tiền</th>
                            <th>Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${fastSaleOrdersData.map((order, index) => renderFastSaleOrderRow(order, index, carriers)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    modalBody.innerHTML = html;

    // Auto-select carriers for each order based on address
    setTimeout(() => {
        fastSaleOrdersData.forEach((order, index) => {
            const rowCarrierSelect = document.querySelector(`#fastSaleCarrier_${index}`);
            if (rowCarrierSelect && rowCarrierSelect.options.length > 1) {
                // Get address from SaleOnlineOrder
                let address = '';
                let saleOnlineOrder = null;
                if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                    const saleOnlineId = order.SaleOnlineIds[0];
                    // O(1) via OrderStore with fallback
                    saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);
                    address = saleOnlineOrder?.Address || '';
                }

                if (address) {
                    console.log(`[FAST-SALE] Auto-selecting carrier for order ${index} with address: ${address}`);
                    smartSelectCarrierForRow(rowCarrierSelect, address, null);
                }
            }
        });
    }, 100);
}

/**
 * Filter Fast Sale rows by search keyword (SĐT, tên, mã SP)
 * @param {string} keyword - Search keyword
 */
function filterFastSaleRows(keyword) {
    const rows = document.querySelectorAll('.fast-sale-table tbody tr');
    const searchTerm = keyword.toLowerCase().trim();

    rows.forEach(row => {
        if (!searchTerm) {
            row.style.display = '';
            return;
        }

        // Get searchable text from row data attributes and content
        const customerName = (row.dataset.customerName || '').toLowerCase();
        const customerPhone = (row.dataset.customerPhone || '').toLowerCase();
        const productCodes = (row.dataset.productCodes || '').toLowerCase();
        const rowText = row.textContent.toLowerCase();

        // Check if any field matches
        const matches = customerName.includes(searchTerm) ||
                       customerPhone.includes(searchTerm) ||
                       productCodes.includes(searchTerm) ||
                       rowText.includes(searchTerm);

        row.style.display = matches ? '' : 'none';
    });
}

/**
 * Render a single order row in Fast Sale Modal
 * @param {Object} order - FastSaleOrder data
 * @param {number} index - Row index
 * @param {Array} carriers - Array of delivery carriers
 * @returns {string} HTML string
 */
function renderFastSaleOrderRow(order, index, carriers = []) {
    // Get SaleOnlineOrder from displayedData to get phone and address - O(1) via OrderStore
    let saleOnlineOrder = null;
    let saleOnlineId = null;
    if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
        saleOnlineId = order.SaleOnlineIds[0];
        saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);
    }

    const customerName = order.PartnerDisplayName || order.Partner?.PartnerDisplayName || saleOnlineOrder?.Name || 'N/A';
    const customerCode = order.Reference || 'N/A';

    // Get phone from SaleOnlineOrder first, then fallback to FastSaleOrder
    const customerPhone = saleOnlineOrder?.Telephone || order.PartnerPhone || order.Partner?.PartnerPhone || 'N/A';

    // Get wallet balance for this customer
    let walletBalance = 0;
    let walletData = null;
    if (customerPhone && customerPhone !== 'N/A') {
        // Normalize phone for lookup
        let normalizedPhone = String(customerPhone).replace(/\D/g, '');
        if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
            normalizedPhone = '0' + normalizedPhone.substring(2);
        }
        walletData = fastSaleWalletBalances[normalizedPhone];
        if (walletData) {
            walletBalance = (parseFloat(walletData.balance) || 0) + (parseFloat(walletData.virtualBalance) || 0);
        }
    }

    // Get address from SaleOnlineOrder first, then fallback to FastSaleOrder
    const customerAddress = saleOnlineOrder?.Address || order.Partner?.PartnerAddress || '*Chưa có địa chỉ';

    // Get partner status from SaleOnlineOrder
    const partnerStatusText = saleOnlineOrder?.PartnerStatusText || '';
    const partnerStatusColors = {
        "Bình thường": "#5cb85c",
        "Bom hàng": "#d1332e",
        "Cảnh báo": "#f0ad4e",
        "Khách sỉ": "#5cb85c",
        "Nguy hiểm": "#d9534f",
        "Thân thiết": "#5bc0de",
        "Vip": "#337ab7",
        "VIP": "#5bc0de"
    };
    const partnerStatusColor = partnerStatusColors[partnerStatusText] || "#6b7280";

    // Get products from OrderLines or SaleOnlineOrder Details
    const products = order.OrderLines || saleOnlineOrder?.Details || [];

    // Build carrier options
    const carrierOptions = carriers.map(c => {
        const fee = c.Config_DefaultFee || c.FixedPrice || 0;
        const feeText = fee > 0 ? ` (${formatCurrencyVND(fee)})` : '';
        return `<option value="${c.Id}" data-fee="${fee}" data-name="${c.Name}">${c.Name}${feeText}</option>`;
    }).join('');

    // Get default shipping fee from order or use 35000
    const defaultShippingFee = order.DeliveryPrice || 35000;

    // Check if order has discount tag and calculate discount
    const hasDiscountTag = orderHasDiscountTag(order);
    const { totalDiscount, discountedProducts } = calculateOrderDiscount(order);
    const hasAnyDiscount = hasDiscountTag && totalDiscount > 0;

    // ========== AUTO-GENERATE ORDER NOTE ==========
    const noteParts = [];

    // 1. Check wallet balance → "CK [amount] ACB [date]"
    // Use last deposit amount and date instead of current balance and today's date
    if (walletBalance > 0) {
        let ckAmount = walletBalance;
        let ckDateStr;
        if (walletData?.lastDepositAmount && walletData?.lastDepositDate) {
            ckAmount = walletData.lastDepositAmount;
            const depositDate = new Date(walletData.lastDepositDate);
            ckDateStr = `${String(depositDate.getDate()).padStart(2, '0')}/${String(depositDate.getMonth() + 1).padStart(2, '0')}`;
        } else {
            const today = new Date();
            ckDateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
        }
        const amountStr = ckAmount >= 1000 ? `${Math.round(ckAmount / 1000)}K` : ckAmount.toLocaleString('vi-VN');
        noteParts.push(`CK ${amountStr} ACB ${ckDateStr}`);
    }

    // 2. Discount tag → "GG [amount]"
    if (hasAnyDiscount) {
        const discountStr = totalDiscount >= 1000 ? `${Math.round(totalDiscount / 1000)}K` : totalDiscount.toLocaleString('vi-VN');
        noteParts.push(`GG ${discountStr}`);
    }

    // 3. Merge tag → "ĐƠN GỘP X + Y"
    let orderTags = [];
    try {
        const tagsRaw = saleOnlineOrder?.Tags || order?.Tags;
        if (tagsRaw) {
            orderTags = typeof tagsRaw === 'string' ? JSON.parse(tagsRaw) : tagsRaw;
            if (!Array.isArray(orderTags)) orderTags = [];
        }
    } catch (e) {
        orderTags = [];
    }

    const mergeTag = orderTags.find(t => {
        const tagName = (t.Name || '').trim();
        return tagName.toLowerCase().startsWith('gộp ') || tagName.startsWith('Gộp ') || tagName.startsWith('GỘP ');
    });
    if (mergeTag) {
        const numbers = mergeTag.Name.match(/\d+/g);
        if (numbers && numbers.length > 1) {
            noteParts.push(`ĐƠN GỘP ${numbers.join(' + ')}`);
        }
    }

    const autoGeneratedNote = noteParts.join(', ');

    // Extract product codes for search (e.g., [N2687])
    const productCodes = products.map(p => {
        const name = p.ProductName || '';
        const match = name.match(/\[([A-Za-z0-9]+)\]/);
        return match ? match[1] : '';
    }).filter(Boolean).join(' ');

    // Build product rows
    const productRows = products.map((product, pIndex) => {
        const productName = product.ProductName || 'N/A';
        const quantity = product.ProductUOMQty || product.Quantity || 0;
        const price = product.PriceUnit || product.Price || 0;
        const total = product.PriceSubTotal || (quantity * price) || 0;
        const note = product.Note || '';

        // Check if this product has a discount in its note
        const productDiscount = parseDiscountFromNote(note);
        const isDiscountedProduct = productDiscount > 0;
        const alternatingBg = index % 2 === 1 ? 'background-color: #e5e7eb;' : '';
        const rowHighlightStyle = isDiscountedProduct ? 'background-color: #fef3c7;' : alternatingBg;
        const orderSeparator = pIndex === 0 && index > 0 ? 'border-top: 4px solid #000;' : '';
        const noteStyle = isDiscountedProduct
            ? 'background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-weight: 600;'
            : '';

        return `
            <tr style="${rowHighlightStyle} ${orderSeparator}"
                data-customer-name="${customerName.replace(/"/g, '&quot;')}"
                data-customer-phone="${customerPhone}"
                data-product-codes="${productCodes}"
                data-order-index="${index}">
                ${pIndex === 0 ? `
                    <td rowspan="${products.length}" style="vertical-align: top; ${hasAnyDiscount ? 'border-left: 4px solid #f59e0b;' : ''}">
                        <div style="display: flex; flex-direction: column; gap: 8px; position: relative;">
                            <button type="button" onclick="removeOrderFromFastSale(${index})"
                                    style="position: absolute; top: -4px; right: -4px; width: 20px; height: 20px; border-radius: 50%; border: none; background: #ef4444; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; line-height: 1;"
                                    title="Bỏ chọn đơn hàng này">
                                <i class="fas fa-times" style="font-size: 10px;"></i>
                            </button>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-weight: 600;">${customerName}</span>
                                ${partnerStatusText ? `<span class="badge" style="background: ${partnerStatusColor}; color: white; font-size: 11px; padding: 2px 6px; border-radius: 4px;">${partnerStatusText}</span>` : ''}
                            </div>
                            <div style="font-size: 12px; color: #6b7280;">${customerCode}</div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <i class="fas fa-phone" style="font-size: 10px; color: #9ca3af;"></i>
                                <span style="font-size: 12px;">${customerPhone}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;" title="Số dư ví khách hàng">
                                <i class="fas fa-wallet" style="font-size: 10px; color: ${walletBalance > 0 ? '#10b981' : '#9ca3af'};"></i>
                                <span style="font-size: 12px; color: ${walletBalance > 0 ? '#10b981' : '#6b7280'}; font-weight: ${walletBalance > 0 ? '600' : '400'};">
                                    ${walletBalance > 0 ? walletBalance.toLocaleString('vi-VN') + 'đ' : '0đ'}
                                </span>
                            </div>
                            ${hasAnyDiscount ? `<span class="badge" style="background: #f59e0b; color: white; font-size: 11px; padding: 2px 6px; border-radius: 4px;"><i class="fas fa-tag"></i> Giảm ${totalDiscount.toLocaleString('vi-VN')}đ</span>` : ''}
                            <div style="margin-top: 4px;">
                                <div style="font-size: 11px; color: #6b7280;">
                                    <i class="fas fa-map-marker-alt" style="font-size: 10px;"></i> Địa chỉ:
                                </div>
                                <!-- Display mode: show address text + Edit button -->
                                <div id="fastSaleAddressDisplay_${index}" style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                                    <span id="fastSaleAddressText_${index}" style="font-size: 12px; flex: 1; color: #374151;">${customerAddress || '<i style="color: #9ca3af;">Chưa có địa chỉ</i>'}</span>
                                    <button type="button" class="btn btn-sm btn-outline-secondary"
                                            style="font-size: 10px; padding: 2px 6px; white-space: nowrap;"
                                            onclick="enableAddressEdit(${index})">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                </div>
                                <!-- Edit mode: input + Save button (hidden by default) -->
                                <div id="fastSaleAddressEditContainer_${index}" style="display: none; gap: 4px; margin-top: 4px;">
                                    <input id="fastSaleAddress_${index}" type="text" class="form-control form-control-sm"
                                           value="${customerAddress.replace(/"/g, '&quot;')}"
                                           data-original="${customerAddress.replace(/"/g, '&quot;')}"
                                           placeholder="Nhập địa chỉ giao hàng"
                                           style="font-size: 12px; flex: 1;" />
                                    <div style="display: flex; gap: 4px; margin-top: 4px;">
                                        <button type="button" class="btn btn-sm btn-outline-secondary"
                                                style="font-size: 10px; padding: 2px 6px;"
                                                onclick="cancelAddressEdit(${index})">
                                            <i class="fas fa-times"></i>
                                        </button>
                                        <button id="fastSaleAddressSaveBtn_${index}" type="button"
                                                class="btn btn-sm btn-primary fast-sale-address-save-btn"
                                                data-row-index="${index}"
                                                data-sale-online-id="${saleOnlineId || ''}"
                                                style="font-size: 10px; padding: 2px 6px;"
                                                onclick="saveAddressForRow(${index})">
                                            <i class="fas fa-save"></i> Lưu
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div style="font-size: 11px; color: #9ca3af;">
                                Chiến dịch Live: ${order.SaleOnlineNames || 'N/A'}
                            </div>
                            <div style="margin-top: 8px;">
                                <div style="font-size: 11px; color: #6b7280;">Đối tác:</div>
                                <select id="fastSaleCarrier_${index}" class="form-control form-control-sm fast-sale-carrier-select"
                                        data-row-index="${index}"
                                        style="font-size: 12px; margin-top: 4px;"
                                        onchange="updateFastSaleShippingFee(${index})">
                                    <option value="">-- Chọn --</option>
                                    ${carrierOptions}
                                </select>
                            </div>
                            <div style="margin-top: 4px;">
                                <div style="font-size: 11px; color: #6b7280;">Tiền ship:</div>
                                <input id="fastSaleShippingFee_${index}" type="number" class="form-control form-control-sm"
                                       value="${defaultShippingFee}" style="font-size: 12px; margin-top: 4px;" />
                            </div>
                            <div style="margin-top: 4px;">
                                <div style="font-size: 11px; color: #6b7280;">Ghi chú đơn:</div>
                                <input id="fastSaleNote_${index}" type="text" class="form-control form-control-sm"
                                       value="${autoGeneratedNote}"
                                       placeholder="CK, GG, gộp..."
                                       style="font-size: 12px; margin-top: 4px;" />
                            </div>
                            <div style="margin-top: 4px; display: none;">
                                <div style="font-size: 11px; color: #6b7280;">KL (g)</div>
                                <input id="fastSaleWeight_${index}" type="number" class="form-control form-control-sm" value="100" style="font-size: 12px; margin-top: 4px;" />
                            </div>
                            <div style="display: none; gap: 8px; margin-top: 8px;">
                                <div style="flex: 1;">
                                    <div style="font-size: 11px; color: #6b7280;">Chiều dài:</div>
                                    <input id="fastSaleLength_${index}" type="number" class="form-control form-control-sm" value="0.00" style="font-size: 12px; margin-top: 4px;" step="0.01" />
                                </div>
                                <div style="flex: 1;">
                                    <div style="font-size: 11px; color: #6b7280;">Chiều rộng:</div>
                                    <input id="fastSaleWidth_${index}" type="number" class="form-control form-control-sm" value="0.00" style="font-size: 12px; margin-top: 4px;" step="0.01" />
                                </div>
                                <div style="flex: 1;">
                                    <div style="font-size: 11px; color: #6b7280;">Chiều cao:</div>
                                    <input id="fastSaleHeight_${index}" type="number" class="form-control form-control-sm" value="0.00" style="font-size: 12px; margin-top: 4px;" step="0.01" />
                                </div>
                            </div>
                        </div>
                    </td>
                ` : ''}
                <td>
                    <div style="font-weight: 500; font-size: 13px;">${productName}</div>
                </td>
                <td style="text-align: center;">${quantity}</td>
                <td style="text-align: right;">${price.toLocaleString('vi-VN')}</td>
                <td style="text-align: right; font-weight: 600;">${total.toLocaleString('vi-VN')}</td>
                <td>${note ? (isDiscountedProduct ? `<span style="${noteStyle}">${note}</span>` : note) : ''}</td>
            </tr>
        `;
    }).join('');

    return productRows;
}

// =====================================================
// ADDRESS SAVE FUNCTIONS
// =====================================================

// Track which rows have unsaved address changes
const unsavedAddressRows = new Set();

/**
 * Enable address edit mode for a row
 * @param {number} index - Row index
 */
function enableAddressEdit(index) {
    const displayEl = document.getElementById(`fastSaleAddressDisplay_${index}`);
    const editContainer = document.getElementById(`fastSaleAddressEditContainer_${index}`);

    if (displayEl) displayEl.style.display = 'none';
    if (editContainer) editContainer.style.display = 'block';

    // Focus on input + attach Goong autocomplete
    const input = document.getElementById(`fastSaleAddress_${index}`);
    if (input) {
        if (typeof goongAttachAutocomplete === 'function') {
            goongAttachAutocomplete(input);
        }
        input.focus();
    }
}

/**
 * Cancel address edit and return to display mode
 * @param {number} index - Row index
 */
function cancelAddressEdit(index) {
    const displayEl = document.getElementById(`fastSaleAddressDisplay_${index}`);
    const editContainer = document.getElementById(`fastSaleAddressEditContainer_${index}`);
    const addressInput = document.getElementById(`fastSaleAddress_${index}`);

    // Restore original value
    if (addressInput) {
        addressInput.value = addressInput.dataset.original || '';
    }

    // Switch back to display mode
    if (displayEl) displayEl.style.display = 'flex';
    if (editContainer) editContainer.style.display = 'none';

    unsavedAddressRows.delete(index);
}

/**
 * Mark address as modified (show save button)
 * @param {number} index - Row index
 */
function markAddressAsModified(index) {
    const addressInput = document.getElementById(`fastSaleAddress_${index}`);
    const saveBtn = document.getElementById(`fastSaleAddressSaveBtn_${index}`);

    if (!addressInput || !saveBtn) return;

    const currentValue = addressInput.value.trim();
    const originalValue = addressInput.dataset.original || '';

    if (currentValue !== originalValue) {
        saveBtn.style.display = 'inline-block';
        unsavedAddressRows.add(index);
    } else {
        saveBtn.style.display = 'none';
        unsavedAddressRows.delete(index);
    }
}

/**
 * Save address for a specific row
 * If FastSaleOrder already exists (Id > 0): Uses GET + PUT pattern to update server
 * If FastSaleOrder not created yet (Id = 0): Updates local data only, will be used when order is created
 * @param {number} index - Row index
 */
async function saveAddressForRow(index) {
    const addressInput = document.getElementById(`fastSaleAddress_${index}`);
    const saveBtn = document.getElementById(`fastSaleAddressSaveBtn_${index}`);
    const displayEl = document.getElementById(`fastSaleAddressDisplay_${index}`);
    const editContainer = document.getElementById(`fastSaleAddressEditContainer_${index}`);
    const addressTextEl = document.getElementById(`fastSaleAddressText_${index}`);

    if (!addressInput) return;

    const newAddress = addressInput.value.trim();

    // Get FastSaleOrder from fastSaleOrdersData
    const fastSaleOrder = fastSaleOrdersData[index];
    const fastSaleOrderId = fastSaleOrder?.Id;

    // Check if order already exists on server (Id > 0)
    if (fastSaleOrderId && fastSaleOrderId > 0) {
        // Order exists - use GET + PUT pattern to update on server
        await saveAddressToServer(index, fastSaleOrderId, newAddress, saveBtn);
    } else {
        // Order not created yet - just update local data
        // This address will be used when order is created via "Lưu xác nhận"
        updateLocalAddressData(index, newAddress);

        // Update display text
        if (addressTextEl) {
            addressTextEl.innerHTML = newAddress || '<i style="color: #9ca3af;">Chưa có địa chỉ</i>';
        }

        // Update original value in input
        addressInput.dataset.original = newAddress;

        // Switch back to display mode
        if (displayEl) displayEl.style.display = 'flex';
        if (editContainer) editContainer.style.display = 'none';

        unsavedAddressRows.delete(index);
        window.notificationManager?.success('Đã lưu địa chỉ (sẽ áp dụng khi tạo đơn)');
    }
}

/**
 * Update local address data for a row (when order hasn't been created yet)
 * @param {number} index - Row index
 * @param {string} newAddress - New address value
 */
function updateLocalAddressData(index, newAddress) {
    if (fastSaleOrdersData[index]) {
        // Update all address-related fields in local data
        fastSaleOrdersData[index].ReceiverAddress = newAddress;
        fastSaleOrdersData[index].Address = newAddress;

        if (fastSaleOrdersData[index].Ship_Receiver) {
            fastSaleOrdersData[index].Ship_Receiver.Street = newAddress;
            if (fastSaleOrdersData[index].Ship_Receiver.ExtraAddress) {
                fastSaleOrdersData[index].Ship_Receiver.ExtraAddress.Street = newAddress;
            }
        }

        if (fastSaleOrdersData[index].Partner) {
            fastSaleOrdersData[index].Partner.Street = newAddress;
            fastSaleOrdersData[index].Partner.FullAddress = newAddress;
            if (fastSaleOrdersData[index].Partner.ExtraAddress) {
                fastSaleOrdersData[index].Partner.ExtraAddress.Street = newAddress;
            }
        }
    }

    console.log(`[FAST-SALE] Updated local address for row ${index}:`, newAddress);
}

/**
 * Save address to server via TPOS API (for existing orders)
 * Uses GET + PUT pattern: fetch full order, update address fields, PUT back
 * @param {number} index - Row index
 * @param {number} fastSaleOrderId - FastSaleOrder ID
 * @param {string} newAddress - New address value
 * @param {HTMLElement} saveBtn - Save button element
 */
async function saveAddressToServer(index, fastSaleOrderId, newAddress, saveBtn) {
    const addressInput = document.getElementById(`fastSaleAddress_${index}`);

    // Show loading state
    const originalBtnText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    saveBtn.disabled = true;

    try {
        const baseUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const headers = await window.tokenManager?.getAuthHeader() || {};

        // Step 1: GET full FastSaleOrder with $expand
        const expandParams = '$expand=Partner,User,Warehouse,Company,PriceList,RefundOrder,Account,Journal,PaymentJournal,Carrier,Tax,SaleOrder,HistoryDeliveryDetails,OrderLines($expand=Product,ProductUOM,Account,SaleLine,User),Ship_ServiceExtras,OutstandingInfo($expand=Content),Team,OfferAmountDetails,DestConvertCurrencyUnit,PackageImages';
        const getUrl = `${baseUrl}/api/odata/FastSaleOrder(${fastSaleOrderId})?${expandParams}`;

        console.log(`[FAST-SALE] GET FastSaleOrder ${fastSaleOrderId} for address update...`);
        const getResponse = await fetch(getUrl, {
            method: 'GET',
            headers: {
                ...headers,
                'Accept': 'application/json'
            }
        });

        if (!getResponse.ok) {
            const errorText = await getResponse.text();
            throw new Error(`GET failed: HTTP ${getResponse.status}: ${errorText}`);
        }

        const orderData = await getResponse.json();
        console.log(`[FAST-SALE] Got order data, updating all address fields...`);

        // Step 2: Update ALL address fields
        orderData.ReceiverAddress = newAddress;
        orderData.Address = newAddress;

        if (orderData.Ship_Receiver) {
            orderData.Ship_Receiver.Street = newAddress;
            if (orderData.Ship_Receiver.ExtraAddress) {
                orderData.Ship_Receiver.ExtraAddress.Street = newAddress;
            }
        }

        if (orderData.Partner) {
            orderData.Partner.Street = newAddress;
            orderData.Partner.FullAddress = newAddress;
            if (orderData.Partner.ExtraAddress) {
                orderData.Partner.ExtraAddress.Street = newAddress;
            }
        }

        // Step 3: PUT full order back
        const putUrl = `${baseUrl}/api/odata/FastSaleOrder(${fastSaleOrderId})`;
        console.log(`[FAST-SALE] PUT FastSaleOrder ${fastSaleOrderId} with new address...`);

        const putResponse = await fetch(putUrl, {
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': 'application/json;charset=UTF-8',
                'Accept': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        if (!putResponse.ok) {
            const errorText = await putResponse.text();
            throw new Error(`PUT failed: HTTP ${putResponse.status}: ${errorText}`);
        }

        console.log(`[FAST-SALE] ✅ Address updated successfully`);

        // Update original value
        addressInput.dataset.original = newAddress;
        unsavedAddressRows.delete(index);

        // Update display text and switch back to display mode
        const addressTextEl = document.getElementById(`fastSaleAddressText_${index}`);
        const displayEl = document.getElementById(`fastSaleAddressDisplay_${index}`);
        const editContainer = document.getElementById(`fastSaleAddressEditContainer_${index}`);

        if (addressTextEl) {
            addressTextEl.innerHTML = newAddress || '<i style="color: #9ca3af;">Chưa có địa chỉ</i>';
        }
        if (displayEl) displayEl.style.display = 'flex';
        if (editContainer) editContainer.style.display = 'none';

        // Update OrderStore if available (using SaleOnlineIds from FastSaleOrder)
        if (window.OrderStore && fastSaleOrder.SaleOnlineIds?.length > 0) {
            const saleOnlineId = fastSaleOrder.SaleOnlineIds[0];
            const order = window.OrderStore.get(saleOnlineId);
            if (order) {
                order.Address = newAddress;
            }
        }

        // Also update the local fastSaleOrdersData
        fastSaleOrdersData[index].ReceiverAddress = newAddress;

        // Re-run carrier auto-select with new address
        const carrierSelect = document.getElementById(`fastSaleCarrier_${index}`);
        if (carrierSelect && typeof smartSelectCarrierForRow === 'function') {
            smartSelectCarrierForRow(carrierSelect, newAddress, null);
        }

        window.notificationManager?.success('Đã lưu địa chỉ');
        console.log(`[FAST-SALE] Address saved for row ${index}:`, newAddress);

    } catch (error) {
        console.error('[FAST-SALE] Error saving address:', error);
        window.notificationManager?.error(`Lỗi lưu địa chỉ: ${error.message}`);
    } finally {
        saveBtn.innerHTML = originalBtnText;
        saveBtn.disabled = false;
    }
}

/**
 * Check if there are unsaved address changes
 * @returns {boolean}
 */
function hasUnsavedAddressChanges() {
    return unsavedAddressRows.size > 0;
}

/**
 * Get list of rows with unsaved address changes
 * @returns {number[]}
 */
function getUnsavedAddressRows() {
    return Array.from(unsavedAddressRows);
}

// Expose to window for onclick handlers
window.enableAddressEdit = enableAddressEdit;
window.cancelAddressEdit = cancelAddressEdit;
window.markAddressAsModified = markAddressAsModified;
window.saveAddressForRow = saveAddressForRow;
window.hasUnsavedAddressChanges = hasUnsavedAddressChanges;
window.getUnsavedAddressRows = getUnsavedAddressRows;

/**
 * Update shipping fee when carrier is selected for a row
 * @param {number} index - Row index
 */
function updateFastSaleShippingFee(index) {
    const carrierSelect = document.getElementById(`fastSaleCarrier_${index}`);
    const shippingFeeInput = document.getElementById(`fastSaleShippingFee_${index}`);

    if (carrierSelect && shippingFeeInput) {
        const selectedOption = carrierSelect.options[carrierSelect.selectedIndex];
        let fee = parseFloat(selectedOption.dataset.fee) || 0;
        const carrierName = selectedOption.dataset.name || '';

        // Get order data for this row
        const order = fastSaleOrdersData[index];
        if (order) {
            // Calculate finalAmountTotal (after discount)
            const originalAmountTotal = order.AmountTotal || 0;
            let finalAmountTotal = originalAmountTotal;

            if (orderHasDiscountTag(order)) {
                const { totalDiscount } = calculateOrderDiscount(order);
                if (totalDiscount > 0) {
                    finalAmountTotal = originalAmountTotal - totalDiscount;
                }
            }

            // Free shipping logic
            const isThanhPho = carrierName.startsWith('THÀNH PHỐ');
            const isTinh = carrierName.includes('TỈNH');
            const qualifiesForFreeship = (isThanhPho && finalAmountTotal > 1500000) || (isTinh && finalAmountTotal > 3000000);

            if (qualifiesForFreeship) {
                fee = 0;
                console.log(`[FAST-SALE] Row ${index}: Free shipping - ${isThanhPho ? 'THÀNH PHỐ' : 'TỈNH'}, total ${finalAmountTotal.toLocaleString('vi-VN')}đ`);
            }

            // Update note field to add/remove "FREESHIP"
            const noteInput = document.getElementById(`fastSaleNote_${index}`);
            if (noteInput) {
                let currentNote = noteInput.value || '';
                // Remove existing freeship mention (case insensitive)
                currentNote = currentNote.replace(/,?\s*freeship/gi, '').replace(/freeship,?\s*/gi, '').trim();
                // Add FREESHIP if qualifies
                if (qualifiesForFreeship) {
                    currentNote = currentNote ? `${currentNote}, FREESHIP` : 'FREESHIP';
                }
                noteInput.value = currentNote;
            }
        }

        shippingFeeInput.value = fee;
    }
}

/**
 * Smart select carrier for a specific row based on address
 * @param {HTMLSelectElement} select - The carrier dropdown for this row
 * @param {string} address - Customer address
 * @param {object} extraAddress - Optional ExtraAddress object
 */
function smartSelectCarrierForRow(select, address, extraAddress = null) {
    if (!select || select.options.length <= 1) {
        return;
    }

    // Extract district info
    const districtInfo = extractDistrictFromAddress(address, extraAddress);

    if (!districtInfo) {
        console.log('[FAST-SALE] Could not extract district, selecting default carrier');
        selectCarrierByName(select, 'SHIP TỈNH', false);
        return;
    }

    // If address is detected as province (not HCM/Hanoi), select SHIP TỈNH immediately
    if (districtInfo.isProvince) {
        console.log('[FAST-SALE] Address is in province:', districtInfo.cityName, '- selecting SHIP TỈNH');
        selectCarrierByName(select, 'SHIP TỈNH', false);
        return;
    }

    // Find matching carrier
    const matchedCarrier = findMatchingCarrier(select, districtInfo);

    if (matchedCarrier) {
        console.log('[FAST-SALE] ✅ Auto-selected carrier:', matchedCarrier.name);
        select.value = matchedCarrier.id;
        select.dispatchEvent(new Event('change'));
    } else {
        console.log('[FAST-SALE] No matching carrier, selecting SHIP TỈNH');
        selectCarrierByName(select, 'SHIP TỈNH', false);
    }
}

/**
 * Collect Fast Sale data from modal inputs
 * @returns {Array<Object>} Array of order models
 */
function collectFastSaleData() {
    const models = [];
    const processedSaleOnlineIds = new Set(); // Track processed orders to prevent duplicates

    fastSaleOrdersData.forEach((order, index) => {
        // Prevent duplicate orders in the same batch
        const saleOnlineId = order.SaleOnlineIds?.[0];
        if (saleOnlineId) {
            if (processedSaleOnlineIds.has(saleOnlineId)) {
                console.warn(`[FAST-SALE] Skipping duplicate order ${order.Reference} (SaleOnlineId: ${saleOnlineId})`);
                return; // Skip this order
            }
            processedSaleOnlineIds.add(saleOnlineId);
        }
        // Get input values
        const carrierSelect = document.getElementById(`fastSaleCarrier_${index}`);
        const shippingFeeInput = document.getElementById(`fastSaleShippingFee_${index}`);
        const noteInput = document.getElementById(`fastSaleNote_${index}`);
        const weightInput = document.getElementById(`fastSaleWeight_${index}`);
        const lengthInput = document.getElementById(`fastSaleLength_${index}`);
        const widthInput = document.getElementById(`fastSaleWidth_${index}`);
        const heightInput = document.getElementById(`fastSaleHeight_${index}`);

        // Get carrier info
        const carrierId = parseInt(carrierSelect?.value) || 0;
        const carrierName = carrierSelect?.options[carrierSelect.selectedIndex]?.dataset?.name || '';

        // Get address from editable input
        const addressInput = document.getElementById(`fastSaleAddress_${index}`);
        const editedAddress = addressInput?.value?.trim() || '';

        // Get SaleOnlineOrder for phone and address - O(1) via OrderStore
        let saleOnlineOrder = null;
        if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
            const saleOnlineId = order.SaleOnlineIds[0];
            saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);
        }

        // Get dimensions
        const packageLength = parseFloat(lengthInput?.value) || 0;
        const packageWidth = parseFloat(widthInput?.value) || 0;
        const packageHeight = parseFloat(heightInput?.value) || 0;

        // Get current user ID from token or global context
        const currentUserId = window.tokenManager?.userId || window.currentUser?.Id || null;

        // Calculate discount if order has "GIẢM GIÁ" tag
        let decreaseAmount = 0;
        const originalAmountTotal = order.AmountTotal || 0;
        let finalAmountTotal = originalAmountTotal;

        if (orderHasDiscountTag(order)) {
            const { totalDiscount, discountedProducts } = calculateOrderDiscount(order);
            if (totalDiscount > 0) {
                decreaseAmount = totalDiscount;
                finalAmountTotal = originalAmountTotal - decreaseAmount;
                console.log(`[FAST-SALE] Order ${order.Reference}: Applied discount ${decreaseAmount.toLocaleString('vi-VN')}đ (${discountedProducts.length} products)`);
            }
        }

        // 🔥 WALLET BALANCE / CÔNG NỢ CALCULATION
        // Get customer phone and check wallet balance
        const customerPhone = saleOnlineOrder?.Telephone || order.PartnerPhone || order.Partner?.PartnerPhone || '';
        const defaultShipFee = parseFloat(shippingFeeInput?.value) || 0;
        let walletBalance = 0;
        let paymentAmount = 0;
        let cashOnDelivery = finalAmountTotal + defaultShipFee; // Total payment = amount + ship

        if (customerPhone) {
            // Normalize phone for lookup
            let normalizedPhone = String(customerPhone).replace(/\D/g, '');
            if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
                normalizedPhone = '0' + normalizedPhone.substring(2);
            }

            // Get wallet balance from pre-fetched data
            const walletData = fastSaleWalletBalances[normalizedPhone];
            if (walletData) {
                walletBalance = (parseFloat(walletData.balance) || 0) + (parseFloat(walletData.virtualBalance) || 0);

                if (walletBalance > 0) {
                    // Total payment = Amount (after discount) + Shipping fee
                    const shippingFee = parseFloat(shippingFeeInput?.value) || 0;
                    const totalPayment = finalAmountTotal + shippingFee;
                    // Calculate payment from wallet (min of wallet balance and total payment)
                    paymentAmount = Math.min(walletBalance, totalPayment);
                    // COD = Total - Wallet payment (remaining amount customer needs to pay)
                    cashOnDelivery = totalPayment - paymentAmount;

                    console.log(`[FAST-SALE] Order ${order.Reference}: Wallet ${walletBalance.toLocaleString('vi-VN')}đ, Total ${totalPayment.toLocaleString('vi-VN')}đ, Payment ${paymentAmount.toLocaleString('vi-VN')}đ, COD ${cashOnDelivery.toLocaleString('vi-VN')}đ`);
                }
            }
        }

        // Build order model matching exact API structure
        const model = {
            Id: 0,
            Name: null,
            PrintShipCount: 0,
            PrintDeliveryCount: 0,
            PaymentMessageCount: 0,
            MessageCount: 0,
            PartnerId: order.PartnerId || 0,
            PartnerDisplayName: order.PartnerDisplayName || saleOnlineOrder?.Name || '',
            PartnerEmail: null,
            PartnerFacebookId: null,
            PartnerFacebook: null,
            PartnerPhone: null,
            Reference: order.Reference || '',
            PriceListId: 0,
            AmountTotal: finalAmountTotal,
            TotalQuantity: 0,
            Discount: 0,
            DiscountAmount: 0,
            DecreaseAmount: decreaseAmount,
            DiscountLoyaltyTotal: null,
            WeightTotal: 0,
            AmountTax: 0,
            AmountUntaxed: finalAmountTotal,
            TaxId: null,
            MoveId: null,
            UserId: currentUserId,
            UserName: null,
            DateInvoice: new Date().toISOString(),
            DateCreated: order.DateCreated || new Date().toISOString(),
            CreatedById: null,
            State: "draft",
            ShowState: "Nháp",
            CompanyId: 0,
            Comment: noteInput?.value || '',
            WarehouseId: 0,
            SaleOnlineIds: order.SaleOnlineIds || [],
            SaleOnlineNames: Array.isArray(order.SaleOnlineNames) ? order.SaleOnlineNames : [order.SaleOnlineNames || ''],
            Residual: null,
            Type: null,
            RefundOrderId: null,
            ReferenceNumber: null,
            AccountId: 0,
            JournalId: 0,
            Number: null,
            MoveName: null,
            PartnerNameNoSign: null,
            DeliveryPrice: parseFloat(shippingFeeInput?.value) || 0,
            CustomerDeliveryPrice: null,
            CarrierId: carrierId,
            CarrierName: carrierName,
            CarrierDeliveryType: null,
            DeliveryNote: null,
            ReceiverName: saleOnlineOrder?.Name || order.PartnerDisplayName || null,
            ReceiverPhone: customerPhone || null,
            ReceiverAddress: editedAddress || saleOnlineOrder?.Address || null,
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
            ShowShipStatus: order.ShowShipStatus || "Chưa tiếp nhận",
            SaleOnlineName: order.Reference || '',
            PartnerShippingId: null,
            PaymentJournalId: paymentAmount > 0 ? 1 : null,
            PaymentAmount: paymentAmount,
            SaleOrderId: null,
            SaleOrderIds: [],
            FacebookName: order.PartnerDisplayName || saleOnlineOrder?.Name || '',
            FacebookNameNosign: null,
            FacebookId: null,
            DisplayFacebookName: null,
            Deliver: null,
            ShipWeight: parseFloat(weightInput?.value) || 100,
            ShipPaymentStatus: null,
            ShipPaymentStatusCode: null,
            OldCredit: 0,
            NewCredit: 0,
            Phone: customerPhone || null,
            Address: editedAddress || saleOnlineOrder?.Address || null,
            AmountTotalSigned: null,
            ResidualSigned: null,
            Origin: null,
            AmountDeposit: paymentAmount,
            CompanyName: null,
            PreviousBalance: finalAmountTotal,
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
            DateDeposit: paymentAmount > 0 ? new Date().toISOString() : null,
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
            Ship_Receiver: {
                IsNewAddress: false,
                Name: saleOnlineOrder?.Name || order.PartnerDisplayName || null,
                Phone: customerPhone || null,
                Street: editedAddress || saleOnlineOrder?.Address || null,
                City: saleOnlineOrder?.ExtraAddress?.City || null,
                District: saleOnlineOrder?.ExtraAddress?.District || null,
                Ward: saleOnlineOrder?.ExtraAddress?.Ward || null,
                ExtraAddress: {
                    Street: editedAddress || saleOnlineOrder?.Address || null,
                    NewStreet: null,
                    City: saleOnlineOrder?.ExtraAddress?.City || { name: null, nameNoSign: null, code: null },
                    District: saleOnlineOrder?.ExtraAddress?.District || { name: null, nameNoSign: null, code: null, cityName: null, cityCode: null },
                    Ward: saleOnlineOrder?.ExtraAddress?.Ward || { name: null, nameNoSign: null, code: null, cityName: null, cityCode: null, districtName: null, districtCode: null },
                    NewCity: null,
                    NewWard: null
                }
            },
            Ship_Extras: null,
            PaymentInfo: [],
            Search: null,
            ShipmentDetailsAship: {
                PackageInfo: {
                    PackageLength: packageLength,
                    PackageWidth: packageWidth,
                    PackageHeight: packageHeight
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
                PackageLength: packageLength,
                PackageWidth: packageWidth,
                PackageHeight: packageHeight
            },
            Error: null,
            OrderLines: (order.OrderLines || []).map(line => ({
                Id: 0,
                OrderId: 0,
                ProductId: line.ProductId,
                ProductUOMId: line.ProductUOMId || 1,
                PriceUnit: line.PriceUnit || 0,
                ProductUOMQty: line.ProductUOMQty || 0,
                ProductUOMQtyAvailable: 0,
                UserId: null,
                Discount: 0,
                Discount_Fixed: 0,
                DiscountTotalLoyalty: null,
                PriceTotal: line.PriceTotal || line.PriceSubTotal || 0,
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
                SaleOnlineDetailId: null,
                PriceCheck: null,
                IsNotEnoughInventory: null,
                Tags: [],
                CreatedById: null,
                TrackingRef: null,
                ReturnTotal: 0,
                ConversionPrice: null
            })),
            Partner: order.Partner || {
                Id: order.PartnerId || 0,
                Name: order.PartnerDisplayName || saleOnlineOrder?.Name || '',
                DisplayName: order.PartnerDisplayName || saleOnlineOrder?.Name || '',
                Street: saleOnlineOrder?.Address || order.Partner?.Street || null,
                Phone: saleOnlineOrder?.Telephone || order.Partner?.Phone || '',
                Customer: true,
                Type: "contact",
                CompanyType: "person",
                DateCreated: new Date().toISOString(),
                ExtraAddress: order.Partner?.ExtraAddress || null
            },
            Carrier: order.Carrier || {
                Id: carrierId,
                Name: carrierName,
                DeliveryType: "fixed",
                Config_DefaultFee: parseFloat(shippingFeeInput?.value) || 0
            }
        };

        models.push(model);
    });

    return models;
}

/**
 * Confirm and save Fast Sale (Lưu button)
 */
async function confirmFastSale() {
    await saveFastSaleOrders(false);
}

/**
 * Confirm and check Fast Sale (Lưu xác nhận button)
 */
async function confirmAndCheckFastSale() {
    await saveFastSaleOrders(true);
}

// Flag to prevent double submission
let isSavingFastSale = false;

/**
 * Reset submission state - re-enable buttons and clear flag
 */
function resetFastSaleSubmissionState() {
    isSavingFastSale = false;
    const saveBtn = document.getElementById('confirmFastSaleBtn');
    const confirmBtn = document.getElementById('confirmAndCheckFastSaleBtn');
    if (saveBtn) saveBtn.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
    clearFastSaleStatus();  // Clear status message when reset
    console.log('[FAST-SALE] 🔓 Submission state reset, buttons re-enabled');
}

// =====================================================
// FAST SALE STATUS MESSAGE SYSTEM
// =====================================================

/**
 * Hiển thị status message trong Fast Sale modal
 * @param {string} message - Nội dung thông báo
 * @param {string} type - Loại: 'info', 'warning', 'error', 'loading', 'success'
 */
function showFastSaleStatus(message, type = 'info') {
    const container = document.getElementById('fastSaleStatusMessage');
    const textEl = document.getElementById('fastSaleStatusText');
    const iconEl = container?.querySelector('i');

    if (!container || !textEl || !iconEl) {
        console.warn('[FAST-SALE-STATUS] Status message elements not found');
        return;
    }

    // Update content
    textEl.textContent = message;

    // Update icon based on type
    const icons = {
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-times-circle',
        loading: 'fa-spinner fa-spin',
        success: 'fa-check-circle'
    };
    iconEl.className = 'fas ' + (icons[type] || 'fa-info-circle');

    // Update styling
    container.className = 'fast-sale-status-message ' + type;
    container.style.display = 'flex';

    console.log(`[FAST-SALE-STATUS] ${type.toUpperCase()}: ${message}`);
}

/**
 * Ẩn status message
 */
function clearFastSaleStatus() {
    const container = document.getElementById('fastSaleStatusMessage');
    if (container) {
        container.style.display = 'none';
    }
}

// Export for global access
window.showFastSaleStatus = showFastSaleStatus;
window.clearFastSaleStatus = clearFastSaleStatus;

/**
 * Save Fast Sale orders to backend
 * @param {boolean} isApprove - Whether to approve orders (Lưu xác nhận)
 */
async function saveFastSaleOrders(isApprove = false) {
    // Check for unsaved address changes
    if (hasUnsavedAddressChanges()) {
        const unsavedRows = getUnsavedAddressRows();
        const rowNumbers = unsavedRows.map(i => i + 1).join(', ');
        const confirmed = confirm(
            `Có ${unsavedRows.length} dòng chưa lưu địa chỉ (dòng: ${rowNumbers}).\n\n` +
            `Nếu tiếp tục, địa chỉ sẽ được gửi đi nhưng KHÔNG lưu vào hệ thống.\n\n` +
            `Bạn có muốn tiếp tục không?`
        );
        if (!confirmed) {
            return;
        }
        console.log('[FAST-SALE] User chose to continue with unsaved addresses');
    }

    // Prevent double submission
    if (isSavingFastSale) {
        console.warn('[FAST-SALE] ⚠️ Save already in progress, ignoring duplicate request');
        showFastSaleStatus('Đang xử lý, vui lòng đợi...', 'loading');
        return;
    }

    // Disable buttons to prevent double-click
    const saveBtn = document.getElementById('confirmFastSaleBtn');
    const confirmBtn = document.getElementById('confirmAndCheckFastSaleBtn');
    if (saveBtn) saveBtn.disabled = true;
    if (confirmBtn) confirmBtn.disabled = true;
    isSavingFastSale = true;
    showFastSaleStatus('Đang lưu đơn hàng...', 'loading');
    console.log('[FAST-SALE] 🔒 Buttons disabled, starting submission...');

    try {
        console.log(`[FAST-SALE] Saving Fast Sale orders (is_approve: ${isApprove})...`);

        // Collect data from modal
        const models = collectFastSaleData();

        if (models.length === 0) {
            showFastSaleStatus('Không có dữ liệu để lưu', 'error');
            window.notificationManager.error('Không có dữ liệu để lưu', 'Lỗi');
            resetFastSaleSubmissionState();
            return;
        }

        // Validate required fields
        const invalidOrders = models.filter((m, index) => {
            if (!m.CarrierId || m.CarrierId === 0) {
                console.error(`[FAST-SALE] Order ${index} (${m.Reference}) missing carrier`);
                return true;
            }
            if (!m.Partner || !m.Partner.Phone) {
                console.error(`[FAST-SALE] Order ${index} (${m.Reference}) missing phone`);
                return true;
            }
            if (!m.Partner || !m.Partner.Street) {
                console.error(`[FAST-SALE] Order ${index} (${m.Reference}) missing address`);
                return true;
            }
            return false;
        });

        if (invalidOrders.length > 0) {
            const firstInvalid = invalidOrders[0];
            const missingField = !firstInvalid.CarrierId ? 'đối tác ship' :
                                 !firstInvalid.Partner?.Phone ? 'số điện thoại' : 'địa chỉ';
            showFastSaleStatus(`Đơn ${firstInvalid.Reference || 'N/A'} thiếu ${missingField}`, 'warning');
            window.notificationManager.error(
                `Có ${invalidOrders.length} đơn hàng thiếu thông tin bắt buộc (đối tác ship, SĐT, địa chỉ)`,
                'Lỗi validation'
            );
            resetFastSaleSubmissionState();
            return;
        }

        // =====================================================
        // DEDUPE: Remove duplicate orders by SaleOnlineIds[0]
        // =====================================================
        const seenIds = new Set();
        const uniqueModels = [];
        for (const model of models) {
            const key = model.SaleOnlineIds?.[0];
            if (!key || !seenIds.has(key)) {
                if (key) seenIds.add(key);
                uniqueModels.push(model);
            } else {
                console.warn(`[FAST-SALE] ⚠️ Duplicate removed: ${model.Reference} (SaleOnlineId: ${key})`);
            }
        }

        if (uniqueModels.length < models.length) {
            console.log(`[FAST-SALE] 🔄 Deduplicated: ${models.length} → ${uniqueModels.length} orders`);
        }

        // Store models for later use (to get OrderLines when API response is empty)
        window.lastFastSaleModels = uniqueModels;

        // MUST use billTokenManager - no fallback to default tokenManager
        const headers = await getBillAuthHeader();

        // Use different endpoint based on isApprove
        // "Lưu xác nhận" uses isForce=true endpoint with is_approve: true
        // "Lưu" uses normal endpoint with is_approve: false
        let url;
        if (isApprove) {
            url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/InsertListOrderModel?isForce=true&$expand=DataErrorFast($expand=Partner,OrderLines),OrdersError($expand=Partner,OrderLines),OrdersSucessed($expand=Partner,OrderLines)`;
        } else {
            url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.InsertListOrderModel?$expand=DataErrorFast($expand=Partner,OrderLines),OrdersError($expand=Partner,OrderLines),OrdersSucessed($expand=Partner,OrderLines)`;
        }

        // =====================================================
        // SINGLE REQUEST for all orders (no duplicates)
        // =====================================================
        const requestBody = {
            is_approve: isApprove,
            model: uniqueModels
        };

        console.log(`[FAST-SALE] 📦 Sending ${uniqueModels.length} orders in 1 request...`);
        console.log('[FAST-SALE] Request body:', requestBody);
        showFastSaleStatus(`Đang gửi ${uniqueModels.length} đơn hàng...`, 'loading');

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('[FAST-SALE] ✅ Save result:', result);

        const successCount = result.OrdersSucessed?.length || 0;
        const errorCount = (result.OrdersError?.length || 0) + (result.DataErrorFast?.length || 0);
        showFastSaleStatus(`Hoàn thành: ${successCount} thành công, ${errorCount} lỗi`, 'success');

        // Show results modal
        showFastSaleResultsModal(result);

        // Save to order history (Firebase)
        if (result.OrdersSucessed && result.OrdersSucessed.length > 0) {
            const historyData = result.OrdersSucessed.map(order => {
                // Find original order data for additional info
                const originalOrder = fastSaleOrdersData.find(o =>
                    (o.SaleOnlineIds && order.SaleOnlineIds &&
                        JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                    (o.Reference && o.Reference === order.Reference)
                );
                return {
                    ...order,
                    SessionIndex: originalOrder?.SessionIndex || '',
                    LiveCampaignId: originalOrder?.LiveCampaignId || order.LiveCampaignId,
                    LiveCampaignName: originalOrder?.LiveCampaignName || order.LiveCampaignName
                };
            });
            window.OrderHistoryManager?.saveOrderHistoryBatch(historyData, 'fast-sale');
        }

        // Note: Bill sending is handled manually via "In hóa đơn" button in printSuccessOrders()
        // Success: reset flag but don't re-enable buttons (modal will close)
        isSavingFastSale = false;

    } catch (error) {
        console.error('[FAST-SALE] Error saving orders:', error);

        showFastSaleStatus('Lỗi khi lưu: ' + error.message, 'error');
        window.notificationManager.error(
            `Lỗi khi lưu đơn hàng: ${error.message}`,
            'Lỗi hệ thống'
        );

        // Error: reset submission state so user can try again
        resetFastSaleSubmissionState();
    }
}

/**
 * Store Fast Sale results data
 */
let fastSaleResultsData = {
    forced: [],
    failed: [],
    success: []
};

/**
 * Cache for pre-generated bill images and send tasks
 * Key: order ID or order Number
 * Value: { imageBlob, contentUrl, contentId, enrichedOrder, sendTask }
 */
window.preGeneratedBillData = new Map();

/**
 * Flag to track if pre-generation is in progress
 */
window.isPreGeneratingBills = false;

/**
 * Pre-generate bill images in background after orders are created
 * This runs automatically when success orders are available
 */
async function preGenerateBillImages() {
    // Check if pre-generate is enabled in settings
    const settings = getBillTemplateSettings();
    if (!settings.preGenerateBills) {
        console.log('[FAST-SALE] Pre-generate bills is disabled in settings');
        return;
    }

    const successOrders = fastSaleResultsData.success;
    if (!successOrders || successOrders.length === 0) {
        console.log('[FAST-SALE] No success orders to pre-generate bills for');
        return;
    }

    window.isPreGeneratingBills = true;
    // Run in background - don't disable print button

    console.log(`[FAST-SALE] 🎨 Pre-generating ${successOrders.length} bill images in background...`);
    window.preGeneratedBillData.clear();

    for (let i = 0; i < successOrders.length; i++) {
        const order = successOrders[i];

        try {
            // Find original order by matching SaleOnlineIds or Reference (same logic as printSuccessOrders)
            const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                (o.SaleOnlineIds && order.SaleOnlineIds &&
                    JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                (o.Reference && o.Reference === order.Reference)
            );
            const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

            // Find saleOnline order from displayedData - O(1) via OrderStore
            const saleOnlineId = order.SaleOnlineIds?.[0];
            const saleOnlineOrderForData = saleOnlineId
                ? (window.OrderStore?.get(saleOnlineId) || window.OrderStore?.get(String(saleOnlineId)) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                : null;

            // Get CarrierName from form dropdown
            const carrierSelect = originalOrderIndex >= 0 ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`) : null;
            const carrierNameFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
            const carrierName = carrierNameFromDropdown ||
                originalOrder?.Carrier?.Name ||
                originalOrder?.CarrierName ||
                order.CarrierName ||
                order.Carrier?.Name ||
                '';
            const shippingFee = originalOrderIndex >= 0
                ? parseFloat(document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)?.value) || 0
                : order.DeliveryPrice || 0;

            // Get OrderLines
            let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
            if ((!orderLines || orderLines.length === 0) && saleOnlineOrderForData?.Details) {
                orderLines = saleOnlineOrderForData.Details.map(d => ({
                    ProductName: d.ProductName || d.ProductNameGet || '',
                    ProductNameGet: d.ProductNameGet || d.ProductName || '',
                    ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                    Quantity: d.Quantity || d.ProductUOMQty || 1,
                    PriceUnit: d.Price || d.PriceUnit || 0,
                    Note: d.Note || ''
                }));
            }

            // Create enriched order
            const enrichedOrder = {
                ...order,
                OrderLines: orderLines,
                CarrierName: carrierName,
                DeliveryPrice: shippingFee,
                PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
            };

            // Find saleOnline order for chat info
            // Only use SaleOnlineIds or SaleOnlineNames - don't fallback to PartnerId
            // because that could match the wrong order when same customer has multiple orders
            let saleOnlineOrder = saleOnlineOrderForData;
            const saleOnlineName = order.SaleOnlineNames?.[0];
            if (!saleOnlineOrder && saleOnlineName) {
                saleOnlineOrder = displayedData.find(o => o.Code === saleOnlineName);
            }
            // PartnerId fallback removed - it could return wrong order for same customer

            // Prepare send task
            let sendTask = null;
            if (saleOnlineOrder) {
                const psid = saleOnlineOrder.Facebook_ASUserId;
                const postId = saleOnlineOrder.Facebook_PostId;
                const channelId = postId ? postId.split('_')[0] : null;

                if (psid && channelId) {
                    sendTask = {
                        channelId,
                        psid,
                        customerName: saleOnlineOrder.Name,
                        orderNumber: order.Number
                    };
                }
            }

            // Check bill type toggle preference (TPOS or Web)
            const billTypeToggle = document.querySelector('input[name="fastSaleBillType"]:checked');
            const useTposBill = billTypeToggle?.value === 'tpos';

            // Fetch TPOS bill HTML only if toggle is set to 'tpos'
            let billHtml = null;
            const tposOrderId = order.Id;
            if (useTposBill && tposOrderId && typeof window.getBillAuthHeader === 'function') {
                try {
                    const headers = await window.getBillAuthHeader();
                    const orderData = enrichedOrder.SessionIndex ? enrichedOrder :
                        (window.OrderStore?.get(order.SaleOnlineIds?.[0]) || enrichedOrder);
                    billHtml = await window.fetchTPOSBillHTML(tposOrderId, headers, orderData);
                    if (billHtml) {
                        console.log(`[FAST-SALE] ✅ Got TPOS bill HTML for pre-generate: ${order.Number}`);
                    }
                } catch (tposError) {
                    console.warn(`[FAST-SALE] Failed to fetch TPOS bill for pre-generate ${order.Number}:`, tposError.message);
                }
            } else if (!useTposBill) {
                console.log(`[FAST-SALE] Using Web bill template for pre-generate: ${order.Number}`);
            }

            // Generate bill image using TPOS HTML if available, otherwise custom bill fallback
            const imageBlob = await generateBillImage(enrichedOrder, { billHtml });

            // Upload image to Pancake immediately if we have sendTask
            let contentUrl = null;
            let contentId = null;
            if (sendTask && window.pancakeDataManager) {
                const imageFile = new File([imageBlob], `bill_${order.Number || Date.now()}.png`, { type: 'image/png' });
                const uploadResult = await window.pancakeDataManager.uploadImage(sendTask.channelId, imageFile);
                contentUrl = typeof uploadResult === 'string' ? uploadResult : uploadResult.content_url;
                // IMPORTANT: Use content_id (hash), not id (UUID) - Pancake API expects content_id
                contentId = typeof uploadResult === 'object' ? (uploadResult.content_id || uploadResult.id) : null;
                console.log(`[FAST-SALE] 📤 Pre-uploaded bill image for ${order.Number}: ${contentUrl}, content_id: ${contentId}`);
            }

            // Cache the data
            const cacheKey = order.Id || order.Number;
            window.preGeneratedBillData.set(cacheKey, {
                imageBlob,
                contentUrl,
                contentId,
                enrichedOrder,
                sendTask
            });

            console.log(`[FAST-SALE] ✅ Pre-generated bill ${i + 1}/${successOrders.length}: ${order.Number}`);

        } catch (error) {
            console.error(`[FAST-SALE] ❌ Error pre-generating bill for ${order.Number}:`, error);
        }
    }

    console.log(`[FAST-SALE] 🎨 Pre-generation complete: ${window.preGeneratedBillData.size}/${successOrders.length} bills ready`);
    window.notificationManager.success(`Đã tạo sẵn ${window.preGeneratedBillData.size} bill images`, 2000);

    window.isPreGeneratingBills = false;
}

/**
 * Process wallet withdrawals for successful orders
 * Uses pending-withdrawals API (Outbox pattern) for 100% reliability
 */
async function processWalletWithdrawalsForSuccessOrders() {
    const successOrders = fastSaleResultsData.success;
    if (!successOrders || successOrders.length === 0) return;

    console.log(`[FAST-SALE] Processing wallet withdrawals for ${successOrders.length} successful orders...`);

    const performedBy = window.authManager?.getAuthState()?.username || 'system';
    let pendingCount = 0;
    let skippedCount = 0;
    let pendingTotal = 0;

    for (const order of successOrders) {
        try {
            // Get phone number
            const phone = order.Partner?.Phone || order.PartnerPhone;
            if (!phone) continue;

            // Normalize phone
            let normalizedPhone = String(phone).replace(/\D/g, '');
            if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
                normalizedPhone = '0' + normalizedPhone.substring(2);
            }

            // Check if customer has wallet balance
            const walletData = fastSaleWalletBalances[normalizedPhone];
            if (!walletData) continue;

            const totalWalletBalance = (parseFloat(walletData.balance) || 0) + (parseFloat(walletData.virtualBalance) || 0);
            if (totalWalletBalance <= 0) continue;

            // Get COD amount (CashOnDelivery or AmountTotal)
            const codAmount = parseFloat(order.CashOnDelivery) || parseFloat(order.AmountTotal) || 0;
            if (codAmount <= 0) continue;

            // Calculate how much to withdraw (min of wallet balance and COD amount)
            const withdrawAmount = Math.min(totalWalletBalance, codAmount);
            if (withdrawAmount <= 0) continue;

            const orderNumber = order.Number || order.Code || order.Reference || 'N/A';

            console.log(`[FAST-SALE] Creating pending withdrawal for order ${orderNumber}, phone: ${normalizedPhone}, amount: ${withdrawAmount}`);

            // Use pending-withdrawals API on Render server directly (not via CF Worker)
            // This ensures 100% no lost transactions even on network failures
            const RENDER_API_URL = 'https://n2store-fallback.onrender.com';
            const response = await fetch(`${RENDER_API_URL}/api/v2/pending-withdrawals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: orderNumber,
                    order_number: orderNumber,
                    phone: normalizedPhone,
                    amount: withdrawAmount,
                    source: 'FAST_SALE',
                    note: `Thanh toán công nợ qua PBH hàng loạt đơn #${orderNumber}`,
                    created_by: performedBy
                })
            });

            const result = await response.json();

            if (result.success) {
                if (result.skipped) {
                    console.log(`[FAST-SALE] ⏭️ Already processed for ${orderNumber}`);
                    skippedCount++;
                } else {
                    console.log(`[FAST-SALE] ✅ Pending created #${result.pending_id} for ${orderNumber}: ${withdrawAmount}đ`);
                    pendingCount++;
                    pendingTotal += withdrawAmount;

                    // Update local wallet balance cache (optimistic)
                    if (walletData) {
                        const estimatedNewBalance = Math.max(0, totalWalletBalance - withdrawAmount);
                        fastSaleWalletBalances[normalizedPhone] = {
                            balance: Math.max(0, (parseFloat(walletData.balance) || 0) - withdrawAmount),
                            virtualBalance: parseFloat(walletData.virtualBalance) || 0,
                            total: estimatedNewBalance
                        };
                    }
                }
            } else {
                console.warn(`[FAST-SALE] ⚠️ Failed to create pending for ${normalizedPhone}:`, result.error);
            }
        } catch (error) {
            console.error('[FAST-SALE] Error creating pending withdrawal:', error);
        }
    }

    if (pendingCount > 0) {
        console.log(`[FAST-SALE] ✅ Created ${pendingCount} pending withdrawals, total: ${pendingTotal.toLocaleString('vi-VN')}đ`);
        window.notificationManager?.success(`Đã ghi nhận trừ công nợ ${pendingCount} đơn, tổng: ${pendingTotal.toLocaleString('vi-VN')}đ`);
    }
    if (skippedCount > 0) {
        console.log(`[FAST-SALE] ⏭️ Skipped ${skippedCount} already processed withdrawals`);
    }
}

/**
 * Log customer activity for successful order creation
 * Creates activity records in Customer 360 for each order
 */
async function logOrderCreationActivities() {
    const successOrders = fastSaleResultsData.success;
    if (!successOrders || successOrders.length === 0) return;

    const RENDER_API_URL = 'https://n2store-fallback.onrender.com';
    const performedBy = window.authManager?.getAuthState()?.username || 'system';

    console.log(`[FAST-SALE] Logging activities for ${successOrders.length} successful orders...`);

    let loggedCount = 0;

    for (const order of successOrders) {
        try {
            // Try multiple phone fields (TPOS response may use different naming)
            const phone = order.Partner?.Phone || order.PartnerPhone || order.Partner?.PartnerPhone || order.ReceiverPhone || order.Phone;
            if (!phone) {
                console.warn(`[FAST-SALE] No phone found for order ${order.Number || order.Id}, skipping activity log. Order keys:`, Object.keys(order));
                continue;
            }

            let normalizedPhone = String(phone).replace(/\D/g, '');
            if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
                normalizedPhone = '0' + normalizedPhone.substring(2);
            }

            const orderNumber = order.Number || order.Code || order.Reference || 'N/A';
            const customerName = order.Partner?.Name || order.PartnerDisplayName || '';
            const amountTotal = parseFloat(order.AmountTotal) || 0;
            const codAmount = parseFloat(order.CashOnDelivery) || 0;

            // Check if this order used wallet/debt
            const walletData = fastSaleWalletBalances[normalizedPhone];
            const totalWalletBalance = walletData
                ? (parseFloat(walletData.balance) || 0) + (parseFloat(walletData.virtualBalance) || 0)
                : 0;

            let debtUsed = 0;
            if (totalWalletBalance > 0) {
                const shippingFee = parseFloat(order.DeliveryPrice) || 0;
                const totalPayment = amountTotal + shippingFee;
                debtUsed = Math.min(totalWalletBalance, totalPayment);
            }

            // Build description
            let description = `Tạo đơn hàng #${orderNumber}`;
            if (customerName) description += ` - ${customerName}`;
            description += `. Tổng: ${amountTotal.toLocaleString('vi-VN')}đ, COD: ${codAmount.toLocaleString('vi-VN')}đ`;
            if (debtUsed > 0) {
                description += `. Sử dụng công nợ: ${debtUsed.toLocaleString('vi-VN')}đ`;
            }

            // Build metadata
            const metadata = {
                order_number: orderNumber,
                order_id: order.Id,
                amount_total: amountTotal,
                cod_amount: codAmount,
                carrier: order.Carrier?.Name || order.CarrierName || '',
                source: 'FAST_SALE'
            };
            if (debtUsed > 0) {
                metadata.debt_used = debtUsed;
                metadata.wallet_balance_at_order = totalWalletBalance;
            }

            // Log activity with response checking
            // Skip if debt was used - backend pending-withdrawals.js already logs ORDER_CREATED
            if (debtUsed > 0) {
                console.log(`[FAST-SALE] Skipping activity log for ${orderNumber} (debt used, backend already logged)`);
                loggedCount++;
                continue;
            }
            console.log(`[FAST-SALE] Posting activity for ${normalizedPhone}, order ${orderNumber}...`);
            const response = await fetch(`${RENDER_API_URL}/api/v2/customers/${normalizedPhone}/activities`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activity_type: 'ORDER_CREATED',
                    title: debtUsed > 0
                        ? `Tạo đơn #${orderNumber} (CK ${debtUsed.toLocaleString('vi-VN')}đ)`
                        : `Tạo đơn hàng #${orderNumber}`,
                    description,
                    reference_type: 'order',
                    reference_id: orderNumber,
                    metadata,
                    icon: 'shopping_cart',
                    color: 'green',
                    created_by: performedBy
                })
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                console.error(`[FAST-SALE] ❌ Activity API error ${response.status} for ${orderNumber}:`, errText);
            } else {
                loggedCount++;
                console.log(`[FAST-SALE] ✅ Activity logged for order ${orderNumber}, phone: ${normalizedPhone}`);
            }
        } catch (error) {
            console.error('[FAST-SALE] Error logging order activity:', error);
        }
    }

    if (loggedCount > 0) {
        console.log(`[FAST-SALE] ✅ Logged ${loggedCount}/${successOrders.length} order activities`);
    } else if (successOrders.length > 0) {
        console.warn(`[FAST-SALE] ⚠️ No activities logged for ${successOrders.length} orders`);
    }
}

/**
 * Show Fast Sale Results Modal
 * @param {Object} results - API response with OrdersSucessed, OrdersError, DataErrorFast
 */
function showFastSaleResultsModal(results) {
    // Store results
    fastSaleResultsData = {
        forced: results.DataErrorFast || [],
        failed: results.OrdersError || [],
        success: results.OrdersSucessed || []
    };

    // Export to window for other modules (tab1-fast-sale-invoice-status.js)
    window.fastSaleResultsData = fastSaleResultsData;

    // Update counts
    document.getElementById('forcedCount').textContent = fastSaleResultsData.forced.length;
    document.getElementById('failedCount').textContent = fastSaleResultsData.failed.length;
    document.getElementById('successCount').textContent = fastSaleResultsData.success.length;

    // Render tables
    renderForcedOrdersTable();
    renderFailedOrdersTable();
    renderSuccessOrdersTable();

    // Show modal
    const modal = document.getElementById('fastSaleResultsModal');
    if (modal) {
        modal.style.display = 'flex';
    }

    // Switch to appropriate tab
    if (fastSaleResultsData.forced.length > 0) {
        switchResultsTab('forced');
    } else if (fastSaleResultsData.failed.length > 0) {
        switchResultsTab('failed');
    } else {
        switchResultsTab('success');
    }

    // Pre-generate bill images in background (don't await - run async)
    if (fastSaleResultsData.success.length > 0) {
        setTimeout(() => preGenerateBillImages(), 100);
        // Process wallet withdrawals for successful orders (async)
        setTimeout(() => processWalletWithdrawalsForSuccessOrders(), 200);
        // Log customer activities for successful orders (async)
        setTimeout(() => logOrderCreationActivities(), 300);
    }

    // Process failed orders - add "Âm Mã" tag (async)
    if (fastSaleResultsData.failed.length > 0 && window.processFailedOrders) {
        setTimeout(() => window.processFailedOrders(fastSaleResultsData.failed), 400);
    }
}

/**
 * Close Fast Sale Results Modal
 */
function closeFastSaleResultsModal() {
    const modal = document.getElementById('fastSaleResultsModal');
    if (modal) {
        modal.style.display = 'none';
    }

    // Close Fast Sale modal if still open
    closeFastSaleModal();

    // Refresh table
    selectedOrderIds.clear();
    updateActionButtons();
    if (typeof filterAndDisplayOrders === 'function') {
        filterAndDisplayOrders();
    }
}

/**
 * Switch between results tabs
 * @param {string} tabName - 'forced', 'failed', or 'success'
 */
function switchResultsTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.fast-sale-results-tab').forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.fast-sale-results-content').forEach(content => {
        if (content.id === `${tabName}Tab`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

/**
 * Render Forced Orders Table (Cưỡng bức)
 */
function renderForcedOrdersTable() {
    const container = document.getElementById('forcedOrdersTable');
    if (!container) return;

    if (fastSaleResultsData.forced.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 40px;">Không có đơn hàng cần cưỡng bức</p>';
        return;
    }

    const html = `
        <table class="fast-sale-results-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th style="width: 40px;"><input type="checkbox" id="selectAllForced" onchange="toggleAllForcedOrders(this.checked)"></th>
                    <th>Mã</th>
                    <th>Số phiếu</th>
                    <th>Khách hàng</th>
                    <th>Lỗi</th>
                </tr>
            </thead>
            <tbody>
                ${fastSaleResultsData.forced.map((order, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td><input type="checkbox" class="forced-order-checkbox" value="${index}"></td>
                        <td>${order.Reference || 'N/A'}</td>
                        <td>${order.Number || ''}</td>
                        <td>${order.Partner?.PartnerDisplayName || order.PartnerDisplayName || 'N/A'}</td>
                        <td><div class="fast-sale-error-msg">${order.DeliveryNote || 'Lỗi không xác định'}</div></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

/**
 * Render Failed Orders Table (Thất bại)
 */
function renderFailedOrdersTable() {
    const container = document.getElementById('failedOrdersTable');
    if (!container) return;

    if (fastSaleResultsData.failed.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 40px;">Không có đơn hàng thất bại</p>';
        return;
    }

    const html = `
        <table class="fast-sale-results-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th>Mã</th>
                    <th>Số phiếu</th>
                    <th>Khách hàng</th>
                    <th>Lỗi</th>
                </tr>
            </thead>
            <tbody>
                ${fastSaleResultsData.failed.map((order, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${order.Reference || 'N/A'}</td>
                        <td>${order.Number || ''}</td>
                        <td>${order.Partner?.PartnerDisplayName || order.PartnerDisplayName || 'N/A'}</td>
                        <td><div class="fast-sale-error-msg">${order.DeliveryNote || 'Lỗi không xác định'}</div></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

/**
 * Render Success Orders Table (Thành công)
 */
function renderSuccessOrdersTable() {
    const container = document.getElementById('successOrdersTable');
    if (!container) return;

    if (fastSaleResultsData.success.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 40px;">Không có đơn hàng thành công</p>';
        return;
    }

    const html = `
        <table class="fast-sale-results-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th style="width: 40px;"><input type="checkbox" id="selectAllSuccess" onchange="toggleAllSuccessOrders(this.checked)"></th>
                    <th>Mã</th>
                    <th>Số phiếu</th>
                    <th>Trạng thái</th>
                    <th>Khách hàng</th>
                    <th>Mã vận đơn</th>
                    <th style="width: 120px;">Thao tác</th>
                </tr>
            </thead>
            <tbody>
                ${fastSaleResultsData.success.map((order, index) => {
                    const showState = order.ShowState || '';
                    const isActionable = showState === 'Đã thanh toán' || showState === 'Đã xác nhận';
                    const cancelBtn = isActionable ? (window.getCancelButtonHtml ? window.getCancelButtonHtml(order, index) : '') : '';

                    return `
                    <tr>
                        <td>${index + 1}</td>
                        <td><input type="checkbox" class="success-order-checkbox" value="${index}" data-order-id="${order.Id}"></td>
                        <td>${order.Reference || 'N/A'}</td>
                        <td>${order.Number || ''}</td>
                        <td><span style="color: #10b981; font-weight: 600;">✓ ${showState || 'Nhập'}</span></td>
                        <td>${order.Partner?.PartnerDisplayName || order.PartnerDisplayName || 'N/A'}</td>
                        <td>${order.TrackingRef || ''}</td>
                        <td style="white-space: nowrap;">${cancelBtn}</td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;

    // Trigger auto send bills if enabled
    console.log('[FAST-SALE] Checking auto send bills:', {
        functionExists: !!window.autoSendBillsIfEnabled,
        successCount: fastSaleResultsData.success.length
    });
    if (window.autoSendBillsIfEnabled && fastSaleResultsData.success.length > 0) {
        window.autoSendBillsIfEnabled(fastSaleResultsData.success);
    }

    // Auto-remove "OK + NV" tags from success orders (Đã thanh toán/Đã xác nhận)
    if (window.processSuccessOrders && fastSaleResultsData.success.length > 0) {
        window.processSuccessOrders(fastSaleResultsData.success);
    }
}

/**
 * Toggle all forced orders checkboxes
 * @param {boolean} checked
 */
function toggleAllForcedOrders(checked) {
    document.querySelectorAll('.forced-order-checkbox').forEach(cb => {
        cb.checked = checked;
    });
}

/**
 * Create Forced Orders (Tạo cưỡng bức)
 */
async function createForcedOrders() {
    const selectedIndexes = Array.from(document.querySelectorAll('.forced-order-checkbox:checked'))
        .map(cb => parseInt(cb.value));

    if (selectedIndexes.length === 0) {
        window.notificationManager.warning('Vui lòng chọn ít nhất 1 đơn hàng để tạo cưỡng bức', 'Thông báo');
        return;
    }

    const selectedOrders = selectedIndexes.map(i => fastSaleResultsData.forced[i]);

    // Store models for later use (to get OrderLines when API response is empty)
    window.lastFastSaleModels = selectedOrders;

    try {
        // MUST use billTokenManager - no fallback to default tokenManager
        const headers = await getBillAuthHeader();
        // Use isForce=true query parameter for forced creation
        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/InsertListOrderModel?isForce=true&$expand=DataErrorFast($expand=Partner,OrderLines),OrdersError($expand=Partner,OrderLines),OrdersSucessed($expand=Partner,OrderLines)`;

        // Use is_approve: false with isForce=true for forced creation
        const requestBody = {
            is_approve: false,
            model: selectedOrders
        };

        const loadingNotif = window.notificationManager.info(
            `Đang tạo cưỡng bức ${selectedIndexes.length} đơn hàng...`,
            3000 // Auto-dismiss after 3 seconds
        );

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log('[FAST-SALE] Force create result:', result);

        // Close loading notification
        if (loadingNotif && typeof loadingNotif.close === 'function') {
            loadingNotif.close();
        }

        // Show results in the same modal
        showFastSaleResultsModal(result);

        // Auto-switch to Success tab if there are successful orders
        if (result.OrdersSucessed && result.OrdersSucessed.length > 0) {
            setTimeout(() => {
                switchResultsTab('success');
            }, 100);
        }

        window.notificationManager.success(
            `Đã tạo cưỡng bức ${result.OrdersSucessed?.length || 0} đơn hàng`,
            'Thành công'
        );

    } catch (error) {
        console.error('[FAST-SALE] Error creating forced orders:', error);

        // Close loading notification on error
        if (loadingNotif && typeof loadingNotif.close === 'function') {
            loadingNotif.close();
        }

        window.notificationManager.error(`Lỗi khi tạo cưỡng bức: ${error.message}`, 'Lỗi');
    }
}

/**
 * Toggle all success orders checkboxes
 * @param {boolean} checked
 */
function toggleAllSuccessOrders(checked) {
    document.querySelectorAll('.success-order-checkbox').forEach(cb => {
        cb.checked = checked;
    });
}

/**
 * Print success orders (In hóa đơn, In phiếu ship, In soạn hàng)
 * @param {string} type - 'invoice', 'shipping', or 'picking'
 */
async function printSuccessOrders(type) {
    // Pre-generation runs in background - if cached data exists, use it; otherwise generate on-the-fly

    const selectedIndexes = Array.from(document.querySelectorAll('.success-order-checkbox:checked'))
        .map(cb => parseInt(cb.value));

    if (selectedIndexes.length === 0) {
        window.notificationManager.warning('Vui lòng chọn ít nhất 1 đơn hàng để in', 'Thông báo');
        return;
    }

    const selectedOrders = selectedIndexes.map(i => fastSaleResultsData.success[i]);
    const orderIds = selectedOrders.map(o => o.Id).filter(id => id);

    if (orderIds.length === 0) {
        window.notificationManager.error('Không tìm thấy ID đơn hàng để in', 'Lỗi');
        return;
    }

    console.log(`[FAST-SALE] Printing ${type} for ${orderIds.length} orders:`, orderIds);

    // For invoice type, use TPOS bill (fetched from TPOS API with STT)
    if (type === 'invoice') {
        console.log('[FAST-SALE] Using TPOS bill for invoice printing...');

        // Clear currentSaleOrderData to prevent old data interference
        currentSaleOrderData = null;

        // Collect enriched orders and send tasks (for Messenger sending)
        const enrichedOrders = [];
        const sendTasks = [];

        for (let i = 0; i < selectedOrders.length; i++) {
            const order = selectedOrders[i];

            // Find original order by matching SaleOnlineIds or Reference
            const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                (o.SaleOnlineIds && order.SaleOnlineIds &&
                    JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                (o.Reference && o.Reference === order.Reference)
            );
            const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

            // Also try to find saleOnline order from displayedData for additional data - O(1) via OrderStore
            const saleOnlineId = order.SaleOnlineIds?.[0];
            const saleOnlineOrderForData = saleOnlineId
                ? (window.OrderStore?.get(saleOnlineId) || window.OrderStore?.get(String(saleOnlineId)) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                : null;

            // Get CarrierName from form dropdown (same logic as collectFastSaleData)
            const carrierSelect = originalOrderIndex >= 0 ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`) : null;
            const carrierNameFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
            // Fallback chain: dropdown > originalOrder.Carrier.Name > order.CarrierName > order.Carrier.Name
            const carrierName = carrierNameFromDropdown ||
                originalOrder?.Carrier?.Name ||
                originalOrder?.CarrierName ||
                order.CarrierName ||
                order.Carrier?.Name ||
                '';
            const shippingFee = originalOrderIndex >= 0
                ? parseFloat(document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)?.value) || 0
                : order.DeliveryPrice || 0;

            // Get OrderLines - priority: originalOrder (from FastSale API) > saleOnlineOrder.Details > order.OrderLines
            let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
            if ((!orderLines || orderLines.length === 0) && saleOnlineOrderForData?.Details) {
                // Map saleOnline Details to OrderLines format
                orderLines = saleOnlineOrderForData.Details.map(d => ({
                    ProductName: d.ProductName || d.ProductNameGet || '',
                    ProductNameGet: d.ProductNameGet || d.ProductName || '',
                    ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                    Quantity: d.Quantity || d.ProductUOMQty || 1,
                    PriceUnit: d.Price || d.PriceUnit || 0,
                    Note: d.Note || ''
                }));
            }

            // Check if order uses virtual debt (công nợ ảo) from return ticket
            const orderPhone = order.Partner?.Phone || order.PartnerPhone || '';
            let orderNormalizedPhone = String(orderPhone).replace(/\D/g, '');
            if (orderNormalizedPhone.startsWith('84') && orderNormalizedPhone.length > 9) {
                orderNormalizedPhone = '0' + orderNormalizedPhone.substring(2);
            }
            const orderWalletData = fastSaleWalletBalances[orderNormalizedPhone];
            const orderHasVirtualDebt = orderWalletData && (parseFloat(orderWalletData.virtualBalance) || 0) > 0;

            // Merge data: API result + original OrderLines + form values
            const enrichedOrder = {
                ...order,
                OrderLines: orderLines,
                CarrierName: carrierName,
                DeliveryPrice: shippingFee,
                PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
                hasVirtualDebt: orderHasVirtualDebt,
            };

            enrichedOrders.push(enrichedOrder);

            console.log('[FAST-SALE] Enriched order for Messenger:', {
                number: enrichedOrder.Number,
                carrierName: enrichedOrder.CarrierName,
                orderLinesCount: enrichedOrder.OrderLines?.length
            });

            // Find saleOnline order for chat info
            // Only use SaleOnlineIds or SaleOnlineNames - don't fallback to PartnerId
            // because that could match the wrong order when same customer has multiple orders
            let saleOnlineOrder = saleOnlineOrderForData;
            const saleOnlineName = order.SaleOnlineNames?.[0];
            if (!saleOnlineOrder && saleOnlineName) {
                saleOnlineOrder = displayedData.find(o => o.Code === saleOnlineName);
            }
            // PartnerId fallback removed - it could return wrong order for same customer

            // DEBUG: Log customer matching info
            console.log('[FAST-SALE] DEBUG - Customer matching for order:', order.Number, {
                saleOnlineId,
                saleOnlineName,
                partnerId: order.PartnerId,
                foundSaleOnlineOrder: !!saleOnlineOrder,
                saleOnlineOrderId: saleOnlineOrder?.Id,
                saleOnlineOrderName: saleOnlineOrder?.Name,
                saleOnlineOrderCode: saleOnlineOrder?.Code,
                Facebook_ASUserId: saleOnlineOrder?.Facebook_ASUserId,
                Facebook_PostId: saleOnlineOrder?.Facebook_PostId
            });

            // Prepare send task for this customer
            if (saleOnlineOrder) {
                const psid = saleOnlineOrder.Facebook_ASUserId;
                const postId = saleOnlineOrder.Facebook_PostId;
                const channelId = postId ? postId.split('_')[0] : null;

                console.log('[FAST-SALE] DEBUG - Send task check:', {
                    orderNumber: order.Number,
                    customerName: saleOnlineOrder.Name,
                    psid,
                    postId,
                    channelId,
                    willAddToSendTasks: !!(psid && channelId)
                });

                if (psid && channelId) {
                    console.log('[FAST-SALE] Will send bill to:', saleOnlineOrder.Name, 'for order:', order.Number);
                    sendTasks.push({
                        enrichedOrder,
                        channelId,
                        psid,
                        customerName: saleOnlineOrder.Name,
                        orderNumber: order.Number
                    });
                } else {
                    console.warn('[FAST-SALE] ⚠️ Missing psid or channelId for order:', order.Number, {
                        psid: psid || 'MISSING',
                        channelId: channelId || 'MISSING'
                    });
                }
            } else {
                console.warn('[FAST-SALE] ⚠️ No saleOnlineOrder found for order:', order.Number);
            }
        }

        // DEBUG: Summary of collected data
        console.log('[FAST-SALE] DEBUG - Collection summary:', {
            selectedOrdersCount: selectedOrders.length,
            orderIds: orderIds,
            enrichedOrdersCount: enrichedOrders.length,
            sendTasksCount: sendTasks.length
        });

        // 1. Check bill type toggle preference
        const billTypeToggle = document.querySelector('input[name="fastSaleBillType"]:checked');
        const useTposBill = billTypeToggle?.value === 'tpos';

        // Store preference in localStorage
        localStorage.setItem('fastSaleBillTypePreference', billTypeToggle?.value || 'web');

        // Open print popup based on toggle preference
        if (orderIds.length > 0) {
            if (useTposBill) {
                // TPOS Bill - fetch from TPOS API with STT
                console.log('[FAST-SALE] Using TPOS bill for', orderIds.length, 'bills...');

                try {
                    const headers = await getBillAuthHeader();
                    console.log('[FAST-SALE] Got auth headers:', headers ? 'OK' : 'MISSING');

                    // Build TPOS orders array for printing
                    const tposOrders = selectedOrders.map((order, idx) => {
                        // Find saleOnline order for SessionIndex
                        const saleOnlineId = order.SaleOnlineIds?.[0];
                        const saleOnlineOrder = saleOnlineId
                            ? (window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId))
                            : null;

                        // Check if order uses virtual debt (công nợ ảo) from return ticket
                        const tposPhone = order.Partner?.Phone || order.PartnerPhone || '';
                        let tposNormalizedPhone = String(tposPhone).replace(/\D/g, '');
                        if (tposNormalizedPhone.startsWith('84') && tposNormalizedPhone.length > 9) {
                            tposNormalizedPhone = '0' + tposNormalizedPhone.substring(2);
                        }
                        const tposWalletData = fastSaleWalletBalances[tposNormalizedPhone];
                        const tposHasVirtualDebt = tposWalletData && (parseFloat(tposWalletData.virtualBalance) || 0) > 0;

                        const baseOrderData = saleOnlineOrder || order;
                        return {
                            orderId: order.Id,
                            orderData: { ...baseOrderData, hasVirtualDebt: tposHasVirtualDebt }
                        };
                    });

                    console.log('[FAST-SALE] TPOS orders for print:', tposOrders.map(o => ({
                        orderId: o.orderId,
                        sessionIndex: o.orderData?.SessionIndex
                    })));

                    // Check if function exists
                    if (typeof window.openCombinedTPOSPrintPopup !== 'function') {
                        console.error('[FAST-SALE] ERROR: window.openCombinedTPOSPrintPopup is not a function!');
                        window.notificationManager?.error('Lỗi: Hàm in TPOS bill không tồn tại');
                        return;
                    }

                    // Use TPOS bill style with STT
                    console.log('[FAST-SALE] Calling openCombinedTPOSPrintPopup...');
                    await window.openCombinedTPOSPrintPopup(tposOrders, headers);
                    console.log('[FAST-SALE] openCombinedTPOSPrintPopup completed');

                } catch (error) {
                    console.error('[FAST-SALE] Error printing TPOS bills:', error);
                    window.notificationManager?.error(`Lỗi khi in TPOS bill: ${error.message}`);
                }
            } else {
                // Web Bill - use local template (generateCustomBillHTML)
                console.log('[FAST-SALE] Using Web bill template for', enrichedOrders.length, 'bills...');

                if (typeof window.openCombinedPrintPopup !== 'function') {
                    console.error('[FAST-SALE] ERROR: window.openCombinedPrintPopup is not a function!');
                    window.notificationManager?.error('Lỗi: Hàm in Web bill không tồn tại');
                    return;
                }

                // Use Web bill (local template)
                window.openCombinedPrintPopup(enrichedOrders);
                console.log('[FAST-SALE] openCombinedPrintPopup completed');
            }
        } else {
            window.notificationManager?.error('Không có đơn hàng để in');
        }

        // 3. Clear main table checkboxes after printing
        console.log('[FAST-SALE] Clearing main table checkboxes after print...');
        selectedOrderIds.clear();
        // Uncheck all checkboxes in main table
        document.querySelectorAll('#ordersTable input[type="checkbox"]:checked').forEach(cb => {
            cb.checked = false;
        });
        // Also uncheck header checkbox
        const headerCheckbox = document.querySelector('#ordersTable thead input[type="checkbox"]');
        if (headerCheckbox) headerCheckbox.checked = false;
        // Update action buttons visibility
        updateActionButtons();

        // 2. Send all bills to Messenger in PARALLEL
        if (sendTasks.length > 0) {
            console.log('[FAST-SALE] Sending', sendTasks.length, 'bills to Messenger in parallel...');
            window.notificationManager.info(`Đang gửi ${sendTasks.length} bill qua Messenger...`, 3000);

            const sendPromises = sendTasks.map(task => {
                // Check for pre-generated bill data
                const orderId = task.enrichedOrder?.Id;
                const orderNumber = task.enrichedOrder?.Number;
                const cachedData = window.preGeneratedBillData?.get(orderId) ||
                    window.preGeneratedBillData?.get(orderNumber);

                const sendOptions = {};
                if (cachedData && cachedData.contentUrl && cachedData.contentId) {
                    console.log(`[FAST-SALE] ⚡ Using pre-generated bill for ${task.orderNumber}`);
                    sendOptions.preGeneratedContentUrl = cachedData.contentUrl;
                    sendOptions.preGeneratedContentId = cachedData.contentId;
                }

                return sendBillToCustomer(task.enrichedOrder, task.channelId, task.psid, sendOptions)
                    .then(res => {
                        if (res.success) {
                            console.log(`[FAST-SALE] ✅ Bill sent for ${task.orderNumber} to ${task.customerName}`);
                            return { success: true, orderNumber: task.orderNumber, customerName: task.customerName };
                        } else {
                            console.warn(`[FAST-SALE] ⚠️ Failed to send bill for ${task.orderNumber}:`, res.error);
                            return { success: false, orderNumber: task.orderNumber, error: res.error };
                        }
                    })
                    .catch(err => {
                        console.error(`[FAST-SALE] ❌ Error sending bill for ${task.orderNumber}:`, err);
                        return { success: false, orderNumber: task.orderNumber, error: err.message };
                    });
            });

            // Wait for all sends to complete
            Promise.all(sendPromises).then(results => {
                const successCount = results.filter(r => r.success).length;
                const failCount = results.filter(r => !r.success).length;

                if (successCount > 0) {
                    window.notificationManager.success(`Đã gửi ${successCount}/${results.length} bill qua Messenger`, 3000);
                }
                if (failCount > 0) {
                    window.notificationManager.warning(`${failCount} bill gửi thất bại`, 3000);
                }
            });
        }

        return;
    }

    // For shipping and picking types, use TPOS API
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const idsParam = orderIds.join(',');

        let printEndpoint = '';
        let printLabel = '';

        // Determine endpoint based on print type
        if (type === 'shipping') {
            printEndpoint = 'print2'; // In phiếu ship
            printLabel = 'phiếu ship';
        } else if (type === 'picking') {
            printEndpoint = 'print3'; // In soạn hàng
            printLabel = 'soạn hàng';
        }

        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/fastsaleorder/${printEndpoint}?ids=${idsParam}`;

        console.log(`[FAST-SALE] Fetching print HTML from: ${url}`);

        // Show loading notification
        const loadingNotif = window.notificationManager.info(
            `Đang chuẩn bị in ${printLabel}...`,
            3000
        );

        // Fetch the print HTML
        const response = await API_CONFIG.smartFetch(url, {
            method: 'GET',
            headers: {
                ...headers,
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log('[FAST-SALE] Print response:', result);

        // Close loading notification
        if (loadingNotif && typeof loadingNotif.close === 'function') {
            loadingNotif.close();
        }

        // Check for errors
        if (result.listErrors && result.listErrors.length > 0) {
            window.notificationManager.error(
                `Lỗi khi in: ${result.listErrors.join(', ')}`,
                'Lỗi'
            );
            return;
        }

        // Open new window and write HTML
        if (result.html) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(result.html);
                printWindow.document.close();

                // Use both onload and setTimeout for reliability
                let printed = false;

                printWindow.onload = function () {
                    if (!printed) {
                        printed = true;
                        printWindow.focus();
                        printWindow.print();
                    }
                };

                // Fallback timeout in case onload doesn't fire
                setTimeout(() => {
                    if (!printed) {
                        printed = true;
                        printWindow.focus();
                        printWindow.print();
                    }
                }, 1000); // Increased to 1000ms for complex HTML

                window.notificationManager.success(
                    `Đã mở cửa sổ in ${printLabel} cho ${orderIds.length} đơn hàng`,
                    2000
                );
            } else {
                window.notificationManager.error(
                    'Không thể mở cửa sổ in. Vui lòng kiểm tra popup blocker',
                    'Lỗi'
                );
            }
        } else {
            window.notificationManager.error(
                'Không nhận được HTML để in',
                'Lỗi'
            );
        }

    } catch (error) {
        console.error('[FAST-SALE] Error printing orders:', error);

        // Better error message extraction
        let errorMessage = 'Không xác định';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (error && error.toString) {
            errorMessage = error.toString();
        }

        window.notificationManager.error(
            `Lỗi khi in: ${errorMessage}`,
            'Lỗi'
        );
    }
}

// Make functions globally accessible
window.showFastSaleModal = showFastSaleModal;
window.closeFastSaleModal = closeFastSaleModal;
window.confirmFastSale = confirmFastSale;
window.confirmAndCheckFastSale = confirmAndCheckFastSale;
window.updateFastSaleShippingFee = updateFastSaleShippingFee;
window.showFastSaleResultsModal = showFastSaleResultsModal;
window.closeFastSaleResultsModal = closeFastSaleResultsModal;
window.switchResultsTab = switchResultsTab;
window.toggleAllForcedOrders = toggleAllForcedOrders;
window.toggleAllSuccessOrders = toggleAllSuccessOrders;
window.createForcedOrders = createForcedOrders;
window.printSuccessOrders = printSuccessOrders;

// #endregion FAST SALE MODAL

// #region BILL TEMPLATE SETTINGS

/**
 * Default bill template settings
 */
const defaultBillSettings = {
    // General
    shopName: '',
    shopPhone: '',
    shopAddress: '',
    billTitle: 'PHIẾU BÁN HÀNG',
    footerText: 'Cảm ơn quý khách! Hẹn gặp lại!',
    // Sections visibility
    showHeader: true,
    showTitle: true,
    showSTT: true,
    showBarcode: true,
    showOrderInfo: true,
    showCarrier: true,
    showCustomer: true,
    showSeller: true,
    showProducts: true,
    showTotals: true,
    showCOD: true,
    showDeliveryNote: true,
    showFooter: true,
    // Style
    fontShopName: 18,
    fontTitle: 16,
    fontContent: 13,
    fontCOD: 18,
    billWidth: '80mm',
    billPadding: 20,
    codBackground: '#fef3c7',
    codBorder: '#f59e0b',
    // Send behavior
    previewBeforeSend: true,  // Xem trước bill trước khi gửi (mặc định: bật)
    preGenerateBills: false,  // Tự động tạo trước hình bill sau khi lưu đơn (mặc định: tắt)
    autoSendOnSuccess: false  // Tự động gửi bill khi đơn thành công (mặc định: tắt)
};

/**
 * Get bill template settings from localStorage
 */
function getBillTemplateSettings() {
    try {
        const saved = localStorage.getItem('orders_billTemplateSettings');
        if (saved) {
            return { ...defaultBillSettings, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.error('[BILL-SETTINGS] Error loading settings:', e);
    }
    return { ...defaultBillSettings };
}

/**
 * Open bill template settings modal
 */
function openBillTemplateSettings() {
    const modal = document.getElementById('billTemplateSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
        loadBillSettingsToForm();
    }
}

/**
 * Close bill template settings modal
 */
function closeBillTemplateSettings() {
    const modal = document.getElementById('billTemplateSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Switch between settings tabs
 */
function switchBillSettingsTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.bill-settings-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    // Update content
    document.querySelectorAll('.bill-settings-content').forEach(content => {
        content.style.display = 'none';
    });
    const tabMap = {
        'general': 'billSettingsGeneral',
        'sections': 'billSettingsSections',
        'style': 'billSettingsStyle',
        'preview': 'billSettingsPreview'
    };
    const targetContent = document.getElementById(tabMap[tabName]);
    if (targetContent) {
        targetContent.style.display = 'block';
    }
}

/**
 * Load settings to form
 */
function loadBillSettingsToForm() {
    const settings = getBillTemplateSettings();
    // General
    document.getElementById('billShopName').value = settings.shopName || '';
    document.getElementById('billShopPhone').value = settings.shopPhone || '';
    document.getElementById('billShopAddress').value = settings.shopAddress || '';
    document.getElementById('billTitle').value = settings.billTitle || 'PHIẾU BÁN HÀNG';
    document.getElementById('billFooterText').value = settings.footerText || '';
    // Sections
    document.getElementById('billShowHeader').checked = settings.showHeader !== false;
    document.getElementById('billShowTitle').checked = settings.showTitle !== false;
    document.getElementById('billShowSTT').checked = settings.showSTT !== false;
    document.getElementById('billShowBarcode').checked = settings.showBarcode !== false;
    document.getElementById('billShowOrderInfo').checked = settings.showOrderInfo !== false;
    document.getElementById('billShowCarrier').checked = settings.showCarrier !== false;
    document.getElementById('billShowCustomer').checked = settings.showCustomer !== false;
    document.getElementById('billShowSeller').checked = settings.showSeller !== false;
    document.getElementById('billShowProducts').checked = settings.showProducts !== false;
    document.getElementById('billShowTotals').checked = settings.showTotals !== false;
    document.getElementById('billShowCOD').checked = settings.showCOD !== false;
    document.getElementById('billShowDeliveryNote').checked = settings.showDeliveryNote !== false;
    document.getElementById('billShowFooter').checked = settings.showFooter !== false;
    // Send behavior
    const previewCheckbox = document.getElementById('billPreviewBeforeSend');
    if (previewCheckbox) {
        previewCheckbox.checked = settings.previewBeforeSend !== false;
    }
    const preGenerateCheckbox = document.getElementById('billPreGenerateBills');
    if (preGenerateCheckbox) {
        preGenerateCheckbox.checked = settings.preGenerateBills === true; // default: false
    }
    const autoSendCheckbox = document.getElementById('billAutoSendOnSuccess');
    if (autoSendCheckbox) {
        autoSendCheckbox.checked = settings.autoSendOnSuccess === true; // default: false
    }
    // Style
    document.getElementById('billFontShopName').value = settings.fontShopName || 18;
    document.getElementById('billFontTitle').value = settings.fontTitle || 16;
    document.getElementById('billFontContent').value = settings.fontContent || 13;
    document.getElementById('billFontCOD').value = settings.fontCOD || 18;
    document.getElementById('billWidth').value = settings.billWidth || '80mm';
    document.getElementById('billPadding').value = settings.billPadding || 20;
    document.getElementById('billCODBackground').value = settings.codBackground || '#fef3c7';
    document.getElementById('billCODBorder').value = settings.codBorder || '#f59e0b';
}

/**
 * Save bill template settings
 */
function saveBillTemplateSettings() {
    const previewCheckbox = document.getElementById('billPreviewBeforeSend');
    const preGenerateCheckbox = document.getElementById('billPreGenerateBills');
    const autoSendCheckbox = document.getElementById('billAutoSendOnSuccess');
    const settings = {
        // General
        shopName: document.getElementById('billShopName').value.trim(),
        shopPhone: document.getElementById('billShopPhone').value.trim(),
        shopAddress: document.getElementById('billShopAddress').value.trim(),
        billTitle: document.getElementById('billTitle').value.trim() || 'PHIẾU BÁN HÀNG',
        footerText: document.getElementById('billFooterText').value.trim(),
        // Sections
        showHeader: document.getElementById('billShowHeader').checked,
        showTitle: document.getElementById('billShowTitle').checked,
        showSTT: document.getElementById('billShowSTT').checked,
        showBarcode: document.getElementById('billShowBarcode').checked,
        showOrderInfo: document.getElementById('billShowOrderInfo').checked,
        showCarrier: document.getElementById('billShowCarrier').checked,
        showCustomer: document.getElementById('billShowCustomer').checked,
        showSeller: document.getElementById('billShowSeller').checked,
        showProducts: document.getElementById('billShowProducts').checked,
        showTotals: document.getElementById('billShowTotals').checked,
        showCOD: document.getElementById('billShowCOD').checked,
        showDeliveryNote: document.getElementById('billShowDeliveryNote').checked,
        showFooter: document.getElementById('billShowFooter').checked,
        // Send behavior
        previewBeforeSend: previewCheckbox ? previewCheckbox.checked : true,
        preGenerateBills: preGenerateCheckbox ? preGenerateCheckbox.checked : false,
        autoSendOnSuccess: autoSendCheckbox ? autoSendCheckbox.checked : false,
        // Style
        fontShopName: parseInt(document.getElementById('billFontShopName').value) || 18,
        fontTitle: parseInt(document.getElementById('billFontTitle').value) || 16,
        fontContent: parseInt(document.getElementById('billFontContent').value) || 13,
        fontCOD: parseInt(document.getElementById('billFontCOD').value) || 18,
        billWidth: document.getElementById('billWidth').value || '80mm',
        billPadding: parseInt(document.getElementById('billPadding').value) || 20,
        codBackground: document.getElementById('billCODBackground').value || '#fef3c7',
        codBorder: document.getElementById('billCODBorder').value || '#f59e0b'
    };

    try {
        localStorage.setItem('orders_billTemplateSettings', JSON.stringify(settings));
        window.notificationManager.success('Đã lưu cài đặt bill template', 2000);
        closeBillTemplateSettings();
    } catch (e) {
        console.error('[BILL-SETTINGS] Error saving settings:', e);
        window.notificationManager.error('Lỗi khi lưu cài đặt', 2000);
    }
}

/**
 * Reset bill template settings to default
 */
function resetBillTemplateSettings() {
    localStorage.removeItem('orders_billTemplateSettings');
    loadBillSettingsToForm();
    window.notificationManager.info('Đã đặt lại cài đặt mặc định', 2000);
}

/**
 * Preview bill template with sample data
 */
function previewBillTemplate() {
    const sampleOrder = {
        Number: 'NJD/2026/SAMPLE',
        PartnerDisplayName: 'Nguyễn Văn A',
        Partner: { Name: 'Nguyễn Văn A', Phone: '0901234567', Street: '123 Đường ABC, Quận 1, TP.HCM' },
        CarrierName: 'THÀNH PHỐ (1 3 4 5 6 7 8 10 11 Phú Nhuận, Bình Thạnh, Tân Phú, Tân Bình, Gò Vấp,)',
        DeliveryPrice: 20000,
        CashOnDelivery: 220000,
        AmountDeposit: 0,
        Discount: 160000,
        DeliveryNote: 'KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ HOTLINE CŨA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ\n\nSản phẩm nhận đổi trả trong vòng 2-4 ngày kể từ ngày nhận hàng , "ĐỐI VỚI SẢN PHẨM BỊ LỖI HOẶC SẢN PHẨM SHOP GIAO SAI" quá thời gian shop không nhận xử lý đổi trả bất kì trường hợp nào .',
        Comment: 'STK ngân hàng Lại Thụy Yến Nhi\n75918 (ACB)',
        SessionIndex: '252',
        UserName: 'Tú',
        OrderLines: [
            { ProductName: '[N23] 0510 A3 ÁO 2D FENDY HỒNG', Quantity: 2, PriceUnit: 180000 }
        ]
    };

    const html = window.generateCustomBillHTML(sampleOrder, {});
    const container = document.getElementById('billPreviewContainer');
    if (container) {
        // Use iframe to render full HTML with CSS (browser strips CSS from innerHTML)
        container.innerHTML = `<iframe id="billPreviewIframe" style="width: 100%; min-height: 600px; border: none; background: white;"></iframe>`;
        const iframe = document.getElementById('billPreviewIframe');
        if (iframe) {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();
            // Auto-resize iframe to content height
            iframe.onload = () => {
                try {
                    iframe.style.height = (doc.body.scrollHeight + 20) + 'px';
                } catch (e) {}
            };
            // Fallback resize
            setTimeout(() => {
                try {
                    iframe.style.height = (doc.body.scrollHeight + 20) + 'px';
                } catch (e) {}
            }, 100);
        }
    }
}

// Make functions globally accessible
window.openBillTemplateSettings = openBillTemplateSettings;
window.closeBillTemplateSettings = closeBillTemplateSettings;
window.switchBillSettingsTab = switchBillSettingsTab;
window.saveBillTemplateSettings = saveBillTemplateSettings;
window.resetBillTemplateSettings = resetBillTemplateSettings;
window.previewBillTemplate = previewBillTemplate;
window.getBillTemplateSettings = getBillTemplateSettings;

/**
 * Open bill settings from preview modal
 * Opens settings modal on top of preview, refreshes preview after save
 */
window.openBillSettingsFromPreview = function() {
    // Mark that settings was opened from preview
    window._billSettingsOpenedFromPreview = true;
    openBillTemplateSettings();
};

// Override saveBillTemplateSettings to refresh preview if opened from preview
const originalSaveBillTemplateSettings = saveBillTemplateSettings;
window.saveBillTemplateSettings = async function() {
    await originalSaveBillTemplateSettings();

    // If settings was opened from preview, refresh the preview
    if (window._billSettingsOpenedFromPreview) {
        window._billSettingsOpenedFromPreview = false;
        // Refresh preview if modal is still open
        const previewModal = document.getElementById('billPreviewSendModal');
        if (previewModal && previewModal.style.display === 'flex') {
            // Re-render bill with new settings
            if (window._currentBillPreviewOrder) {
                const container = document.getElementById('billPreviewSendContainer');
                if (container && window.generateCustomBillHTML) {
                    container.innerHTML = window.generateCustomBillHTML(window._currentBillPreviewOrder, {});
                }
            }
        }
    }
};

// #endregion BILL TEMPLATE SETTINGS

// #region TPOS ACCOUNT SETTINGS
// =====================================================
// TPOS ACCOUNT MODAL - Manage bill-specific TPOS credentials
// =====================================================

/**
 * Open TPOS Account Modal
 */
async function openTposAccountModal() {
    const modal = document.getElementById('tposAccountModal');
    if (modal) {
        modal.classList.add('show');

        // Try to reload from Firestore if no local credentials (for incognito mode)
        if (window.billTokenManager && !window.billTokenManager.hasCredentials()) {
            console.log('[TPOS-ACCOUNT] No local credentials, trying to reload from Firestore...');
            await window.billTokenManager.loadFromFirestore();
        }

        updateTposAccountStatus();
    }
}

/**
 * Close TPOS Account Modal
 */
function closeTposAccountModal() {
    const modal = document.getElementById('tposAccountModal');
    if (modal) {
        modal.classList.remove('show');
    }
    // Clear test result
    const testResult = document.getElementById('tposTestResult');
    if (testResult) {
        testResult.style.display = 'none';
    }
}

/**
 * Switch between password and bearer auth tabs
 */
function switchTposAuthTab(tab) {
    const passwordTab = document.getElementById('tposAuthTabPassword');
    const bearerTab = document.getElementById('tposAuthTabBearer');
    const passwordForm = document.getElementById('tposAuthPasswordForm');
    const bearerForm = document.getElementById('tposAuthBearerForm');

    if (tab === 'password') {
        passwordTab.classList.add('active');
        bearerTab.classList.remove('active');
        passwordForm.style.display = 'block';
        bearerForm.style.display = 'none';
    } else {
        passwordTab.classList.remove('active');
        bearerTab.classList.add('active');
        passwordForm.style.display = 'none';
        bearerForm.style.display = 'block';
    }
}

/**
 * Update status display in modal
 */
function updateTposAccountStatus() {
    const statusDiv = document.getElementById('tposAccountStatus');
    if (!statusDiv || !window.billTokenManager) return;

    const info = window.billTokenManager.getCredentialsInfo();

    if (!info.configured) {
        statusDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
                <span style="color: #92400e;">Chưa cấu hình tài khoản TPOS cho bill. Đang dùng token mặc định.</span>
            </div>
        `;
    } else if (info.type === 'bearer') {
        statusDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-check-circle" style="color: #10b981;"></i>
                <div>
                    <div style="color: #047857; font-weight: 600;">Đã cấu hình Bearer Token</div>
                    <div style="font-size: 12px; color: #6b7280; font-family: monospace;">${info.preview}</div>
                </div>
            </div>
        `;
        // Show bearer form with token
        switchTposAuthTab('bearer');
        const bearerInput = document.getElementById('tposBearerToken');
        if (bearerInput && window.billTokenManager.credentials?.bearerToken) {
            bearerInput.value = window.billTokenManager.credentials.bearerToken;
        }
    } else if (info.type === 'password') {
        statusDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-check-circle" style="color: #10b981;"></i>
                <div>
                    <div style="color: #047857; font-weight: 600;">Đã cấu hình Username/Password</div>
                    <div style="font-size: 12px; color: #6b7280;">Username: <strong>${info.username}</strong></div>
                </div>
            </div>
        `;
        // Show password form with username
        switchTposAuthTab('password');
        const usernameInput = document.getElementById('tposUsername');
        const passwordInput = document.getElementById('tposPassword');
        if (usernameInput && window.billTokenManager.credentials?.username) {
            usernameInput.value = window.billTokenManager.credentials.username;
        }
        if (passwordInput && window.billTokenManager.credentials?.password) {
            passwordInput.value = window.billTokenManager.credentials.password;
        }
    }
}

/**
 * Save TPOS account credentials
 */
async function saveTposAccount() {
    if (!window.billTokenManager) {
        window.notificationManager?.error('BillTokenManager chưa sẵn sàng', 5000);
        return;
    }

    const passwordTab = document.getElementById('tposAuthTabPassword');
    const isPasswordAuth = passwordTab.classList.contains('active');

    let credentials;

    if (isPasswordAuth) {
        const username = document.getElementById('tposUsername')?.value?.trim();
        const password = document.getElementById('tposPassword')?.value?.trim();

        if (!username || !password) {
            window.notificationManager?.warning('Vui lòng nhập username và password', 4000);
            return;
        }

        credentials = { username, password };
    } else {
        const bearerToken = document.getElementById('tposBearerToken')?.value?.trim();

        if (!bearerToken) {
            window.notificationManager?.warning('Vui lòng nhập Bearer Token', 4000);
            return;
        }

        // Clean bearer token (remove "Bearer " prefix if present)
        const cleanToken = bearerToken.replace(/^Bearer\s+/i, '');
        credentials = { bearerToken: cleanToken };
    }

    try {
        await window.billTokenManager.setCredentials(credentials);
        window.notificationManager?.success('Đã lưu tài khoản TPOS', 3000);
        updateTposAccountStatus();
    } catch (error) {
        console.error('[TPOS-ACCOUNT] Error saving:', error);
        window.notificationManager?.error(`Lỗi: ${error.message}`, 5000);
    }
}

/**
 * Test TPOS account credentials
 */
async function testTposAccount() {
    if (!window.billTokenManager) {
        window.notificationManager?.error('BillTokenManager chưa sẵn sàng', 5000);
        return;
    }

    const testResult = document.getElementById('tposTestResult');
    if (!testResult) return;

    // Save first (temporary)
    const passwordTab = document.getElementById('tposAuthTabPassword');
    const isPasswordAuth = passwordTab.classList.contains('active');

    let credentials;

    if (isPasswordAuth) {
        const username = document.getElementById('tposUsername')?.value?.trim();
        const password = document.getElementById('tposPassword')?.value?.trim();

        if (!username || !password) {
            testResult.style.display = 'block';
            testResult.style.background = '#fef2f2';
            testResult.style.color = '#dc2626';
            testResult.innerHTML = '<i class="fas fa-times-circle"></i> Vui lòng nhập username và password';
            return;
        }

        credentials = { username, password };
    } else {
        const bearerToken = document.getElementById('tposBearerToken')?.value?.trim();

        if (!bearerToken) {
            testResult.style.display = 'block';
            testResult.style.background = '#fef2f2';
            testResult.style.color = '#dc2626';
            testResult.innerHTML = '<i class="fas fa-times-circle"></i> Vui lòng nhập Bearer Token';
            return;
        }

        const cleanToken = bearerToken.replace(/^Bearer\s+/i, '');
        credentials = { bearerToken: cleanToken };
    }

    // Show testing state
    testResult.style.display = 'block';
    testResult.style.background = '#f0f9ff';
    testResult.style.color = '#0369a1';
    testResult.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang kiểm tra...';

    try {
        // Temporarily set credentials
        window.billTokenManager.credentials = credentials;

        const result = await window.billTokenManager.testCredentials();

        if (result.success) {
            testResult.style.background = '#d1fae5';
            testResult.style.color = '#047857';
            testResult.innerHTML = '<i class="fas fa-check-circle"></i> ' + result.message;
        } else {
            testResult.style.background = '#fef2f2';
            testResult.style.color = '#dc2626';
            testResult.innerHTML = '<i class="fas fa-times-circle"></i> ' + result.message;
        }
    } catch (error) {
        testResult.style.background = '#fef2f2';
        testResult.style.color = '#dc2626';
        testResult.innerHTML = '<i class="fas fa-times-circle"></i> Lỗi: ' + error.message;
    }
}

/**
 * Clear TPOS account credentials
 */
async function clearTposAccount() {
    if (!window.billTokenManager) return;

    if (!confirm('Xác nhận xóa tài khoản TPOS? Sẽ sử dụng token mặc định để tạo bill.')) {
        return;
    }

    try {
        // Clear local storage
        window.billTokenManager.clearStorage();

        // Clear from Firestore
        const ref = window.billTokenManager.getFirestoreRef();
        if (ref) {
            await ref.update({
                billCredentials: firebase.firestore.FieldValue.delete()
            });
        }

        // Clear form inputs
        document.getElementById('tposUsername').value = '';
        document.getElementById('tposPassword').value = '';
        document.getElementById('tposBearerToken').value = '';

        // Hide test result
        const testResult = document.getElementById('tposTestResult');
        if (testResult) {
            testResult.style.display = 'none';
        }

        // Update status
        updateTposAccountStatus();

        window.notificationManager?.success('Đã xóa tài khoản TPOS', 3000);
    } catch (error) {
        console.error('[TPOS-ACCOUNT] Error clearing:', error);
        window.notificationManager?.error(`Lỗi: ${error.message}`, 5000);
    }
}

// Expose functions globally
window.openTposAccountModal = openTposAccountModal;
window.closeTposAccountModal = closeTposAccountModal;
window.switchTposAuthTab = switchTposAuthTab;
window.saveTposAccount = saveTposAccount;
window.testTposAccount = testTposAccount;
window.clearTposAccount = clearTposAccount;

// #endregion TPOS ACCOUNT SETTINGS
