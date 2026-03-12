// =====================================================
// QUICK ADD PRODUCT LOGIC
// =====================================================
// Initialize global variables (use var to allow redeclaration if needed)
var quickAddSelectedProducts = [];
var quickAddSearchTimeout = null;

// Export to window for other files
window.quickAddSelectedProducts = quickAddSelectedProducts;

function openQuickAddProductModal() {
    // Update UI - Global List
    document.getElementById('targetOrdersCount').textContent = "Danh sách chung";

    // Reset state
    quickAddSelectedProducts = [];
    renderQuickAddSelectedProducts();
    document.getElementById('quickProductSearch').value = '';
    document.getElementById('quickProductSuggestions').style.display = 'none';

    // Show modal
    document.getElementById('quickAddProductModal').style.display = 'block';
    document.getElementById('quickAddProductModal').classList.add('show');
    document.getElementById('quickAddProductBackdrop').style.display = 'block';

    // Focus search
    setTimeout(() => {
        document.getElementById('quickProductSearch').focus();
    }, 100);

    // Initialize search manager if needed
    if (window.enhancedProductSearchManager && !window.enhancedProductSearchManager.isLoaded) {
        window.enhancedProductSearchManager.fetchExcelProducts();
    }
}

function closeQuickAddProductModal() {
    document.getElementById('quickAddProductModal').style.display = 'none';
    document.getElementById('quickAddProductModal').classList.remove('show');
    document.getElementById('quickAddProductBackdrop').style.display = 'none';
}

// Search Input Handler
const quickProductSearchEl = document.getElementById('quickProductSearch');
if (quickProductSearchEl) {
    quickProductSearchEl.addEventListener('input', function (e) {
        const query = e.target.value;

        if (quickAddSearchTimeout) clearTimeout(quickAddSearchTimeout);

        if (!query || query.trim().length < 2) {
            const suggestionsEl = document.getElementById('quickProductSuggestions');
            if (suggestionsEl) suggestionsEl.style.display = 'none';
            return;
        }

        quickAddSearchTimeout = setTimeout(() => {
            if (window.enhancedProductSearchManager) {
                const results = window.enhancedProductSearchManager.search(query, 10);
                renderQuickAddSuggestions(results);
            }
        }, 300);
    });
}

// Hide suggestions on click outside
document.addEventListener('click', function (e) {
    const suggestions = document.getElementById('quickProductSuggestions');
    const searchInput = document.getElementById('quickProductSearch');

    if (suggestions && searchInput && e.target !== searchInput && !suggestions.contains(e.target)) {
        suggestions.style.display = 'none';
    }
});

function renderQuickAddSuggestions(products) {
    const suggestionsEl = document.getElementById('quickProductSuggestions');

    if (products.length === 0) {
        suggestionsEl.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #9ca3af;">
                <i class="fas fa-search" style="font-size: 20px; opacity: 0.5; margin-bottom: 8px;"></i>
                <p style="margin: 0; font-size: 13px;">Không tìm thấy sản phẩm</p>
            </div>
        `;
        suggestionsEl.style.display = 'block';
        return;
    }

    suggestionsEl.innerHTML = products.map(product => {
        const imageUrl = product.ImageUrl || (product.Thumbnails && product.Thumbnails[0]);
        return `
            <div class="suggestion-item" onclick="addQuickProduct(${product.Id})" style="
                display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid #f3f4f6;
            " onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                <div style="width: 40px; height: 40px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                    ${imageUrl
                ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <i class="fas fa-box" style="color: #9ca3af; display: none;"></i>`
                : `<i class="fas fa-box" style="color: #9ca3af;"></i>`
            }
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 500; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${product.Name}</div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                        ${product.Code ? `<span style="font-size: 11px; color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${product.Code}</span>` : ''}
                        <span style="font-size: 12px; font-weight: 600; color: #8b5cf6;">${(product.Price || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                </div>
                <i class="fas fa-plus-circle" style="color: #8b5cf6; font-size: 18px;"></i>
            </div>
        `;
    }).join('');

    suggestionsEl.style.display = 'block';
}

async function addQuickProduct(productId) {
    // Check if already added
    const existing = quickAddSelectedProducts.find(p => p.Id === productId);
    if (existing) {
        existing.Quantity += 1;
        renderQuickAddSelectedProducts();
        document.getElementById('quickProductSuggestions').style.display = 'none';
        document.getElementById('quickProductSearch').value = '';
        return;
    }

    // Get product details
    let product = null;
    if (window.enhancedProductSearchManager) {
        // Try to get from Excel cache first
        product = window.enhancedProductSearchManager.getFromExcel(productId);

        // If not full details, try to fetch
        if (product && !product.HasFullDetails) {
            try {
                const fullProduct = await window.enhancedProductSearchManager.getFullProductDetails(productId);
                product = { ...product, ...fullProduct };
            } catch (e) {
                console.warn("Could not fetch full details", e);
            }
        }
    }

    if (!product) return;

    quickAddSelectedProducts.push({
        Id: product.Id,
        Name: product.Name,
        Code: product.Code || product.DefaultCode || '',
        Price: product.Price || 0,
        ImageUrl: product.ImageUrl,
        Quantity: 1
    });

    renderQuickAddSelectedProducts();
    document.getElementById('quickProductSuggestions').style.display = 'none';
    document.getElementById('quickProductSearch').value = '';
    document.getElementById('quickProductSearch').focus();
}

function removeQuickProduct(index) {
    quickAddSelectedProducts.splice(index, 1);
    renderQuickAddSelectedProducts();
}

function updateQuickProductQuantity(index, change) {
    const product = quickAddSelectedProducts[index];
    const newQty = product.Quantity + change;

    if (newQty <= 0) {
        removeQuickProduct(index);
    } else {
        product.Quantity = newQty;
        renderQuickAddSelectedProducts();
    }
}

function clearSelectedProducts() {
    quickAddSelectedProducts = [];
    renderQuickAddSelectedProducts();
}

function renderQuickAddSelectedProducts() {
    const container = document.getElementById('selectedProductsList');
    const countEl = document.getElementById('selectedProductsCount');
    const clearBtn = document.getElementById('clearAllProductsBtn');

    countEl.textContent = quickAddSelectedProducts.length;
    clearBtn.style.display = quickAddSelectedProducts.length > 0 ? 'block' : 'none';

    if (quickAddSelectedProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px 0; color: #9ca3af;">
                <i class="fas fa-basket-shopping" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                <p style="margin: 0; font-weight: 500;">Chưa có sản phẩm nào</p>
                <p style="margin: 4px 0 0 0; font-size: 13px;">Tìm kiếm và chọn sản phẩm để thêm</p>
            </div>
        `;
        return;
    }

    container.innerHTML = quickAddSelectedProducts.map((product, index) => {
        const imageUrl = product.ImageUrl;
        const total = (product.Price * product.Quantity).toLocaleString('vi-VN');

        return `
            <div class="selected-product-item" style="
                display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid #f3f4f6; background: white;
            ">
                <div style="width: 48px; height: 48px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;">
                    ${imageUrl
                ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <i class="fas fa-box" style="color: #9ca3af; display: none;"></i>`
                : `<i class="fas fa-box" style="color: #9ca3af;"></i>`
            }
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 14px; font-weight: 500; color: #1f2937; margin-bottom: 4px;">${product.Name}</div>
                    <div style="font-size: 12px; color: #6b7280;">${product.Code || 'No Code'}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="display: flex; align-items: center; border: 1px solid #e5e7eb; border-radius: 6px;">
                        <button onclick="updateQuickProductQuantity(${index}, -1)" style="padding: 4px 8px; background: none; border: none; cursor: pointer; color: #6b7280;">-</button>
                        <span style="font-size: 13px; font-weight: 600; min-width: 24px; text-align: center;">${product.Quantity}</span>
                        <button onclick="updateQuickProductQuantity(${index}, 1)" style="padding: 4px 8px; background: none; border: none; cursor: pointer; color: #6b7280;">+</button>
                    </div>
                    <div style="font-size: 13px; font-weight: 600; color: #374151; min-width: 80px; text-align: right;">
                        ${total}đ
                    </div>
                    <button onclick="removeQuickProduct(${index})" style="padding: 6px; background: none; border: none; cursor: pointer; color: #ef4444; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function saveSelectedProductsToOrders() {
    if (quickAddSelectedProducts.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning("Vui lòng chọn ít nhất một sản phẩm!");
        } else {
            alert("Vui lòng chọn ít nhất một sản phẩm!");
        }
        return;
    }

    showLoading(true);

    try {
        // Initialize Firebase if needed
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        const db = firebase.database();
        const ref = db.ref(`chat_products/shared`);

        // Get existing products first to merge quantities
        const snapshot = await ref.once('value');
        const existingProducts = snapshot.val() || {};

        // Merge new products
        quickAddSelectedProducts.forEach(newProduct => {
            if (existingProducts[newProduct.Id]) {
                // Update quantity
                existingProducts[newProduct.Id].Quantity = (existingProducts[newProduct.Id].Quantity || 0) + newProduct.Quantity;
            } else {
                // Add new
                existingProducts[newProduct.Id] = {
                    Id: newProduct.Id,
                    Name: newProduct.Name,
                    Code: newProduct.Code,
                    Price: newProduct.Price,
                    Quantity: newProduct.Quantity,
                    ImageUrl: newProduct.ImageUrl || '',
                    AddedAt: firebase.database.ServerValue.TIMESTAMP
                };
            }
        });

        // Save back to Firebase
        await ref.set(existingProducts);

        showLoading(false);
        closeQuickAddProductModal();

        if (window.notificationManager) {
            window.notificationManager.success(`Đã thêm sản phẩm vào danh sách chung!`);
        } else {
            alert(`✅ Đã thêm sản phẩm vào danh sách chung!`);
        }

    } catch (error) {
        console.error("Error saving products:", error);
        showLoading(false);
        if (window.notificationManager) {
            window.notificationManager.error("Lỗi khi lưu sản phẩm: " + error.message);
        } else {
            alert("❌ Lỗi khi lưu sản phẩm: " + error.message);
        }
    }
}
// =====================================================
// CHAT SHOPPING CART LOGIC
// =====================================================

/* LEGACY CODE REMOVED
function renderChatProductsPanel() {
    const listContainer = document.getElementById("chatProductList");
    const countBadge = document.getElementById("chatProductCountBadge");
    const totalEl = document.getElementById("chatOrderTotal");
 
    if (!listContainer) return;
 
    // Update Count & Total
    const totalQty = currentChatOrderDetails.reduce((sum, p) => sum + (p.Quantity || 0), 0);
    const totalAmount = currentChatOrderDetails.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);
 
    if (countBadge) countBadge.textContent = `${totalQty} sản phẩm`;
    if (totalEl) totalEl.textContent = `${totalAmount.toLocaleString("vi-VN")}đ`;
 
    // Empty State
    if (currentChatOrderDetails.length === 0) {
        listContainer.innerHTML = `
            <div class="chat-empty-cart" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <i class="fas fa-box-open" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                <p style="font-size: 14px; margin: 0;">Chưa có sản phẩm nào</p>
                <p style="font-size: 12px; margin-top: 4px;">Tìm kiếm để thêm sản phẩm vào đơn</p>
            </div>`;
        return;
    }
 
    // Render List
    listContainer.innerHTML = currentChatOrderDetails.map((p, index) => `
        <div class="chat-product-card" style="
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            display: flex;
            gap: 12px;
            transition: all 0.2s;
        ">
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
            ">
                ${p.ImageUrl
            ? `<img src="${p.ImageUrl}" style="width: 100%; height: 100%; object-fit: cover;">`
            : `<i class="fas fa-image" style="color: #cbd5e1;"></i>`}
            </div>
 
            <!-- Content -->
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <div style="font-size: 13px; font-weight: 600; color: #1e293b; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${p.ProductName || p.Name || 'Sản phẩm'}
                    </div>
                    <button onclick="removeChatProduct(${index})" style="
                        background: none;
                        border: none;
                        color: #ef4444;
                        cursor: pointer;
                        padding: 4px;
                        margin-top: -4px;
                        margin-right: -4px;
                        opacity: 0.6;
                        transition: opacity 0.2s;
                    " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
                    Mã: ${p.ProductCode || p.Code || 'N/A'}
                </div>
 
                <!-- Controls -->
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 13px; font-weight: 700; color: #3b82f6;">
                        ${(p.Price || 0).toLocaleString("vi-VN")}đ
                    </div>
                    
                    <div style="display: flex; align-items: center; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
                        <button onclick="updateChatProductQuantity(${index}, -1)" style="
                            width: 24px;
                            height: 24px;
                            border: none;
                            background: #f8fafc;
                            color: #64748b;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 10px;
                        "><i class="fas fa-minus"></i></button>
                        <input type="number" value="${p.Quantity || 1}" onchange="updateChatProductQuantity(${index}, 0, this.value)" style="
                            width: 32px;
                            height: 24px;
                            border: none;
                            border-left: 1px solid #e2e8f0;
                            border-right: 1px solid #e2e8f0;
                            text-align: center;
                            font-size: 12px;
                            font-weight: 600;
                            color: #1e293b;
                            -moz-appearance: textfield;
                        ">
                        <button onclick="updateChatProductQuantity(${index}, 1)" style="
                            width: 24px;
                            height: 24px;
                            border: none;
                            background: #f8fafc;
                            color: #64748b;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 10px;
                        "><i class="fas fa-plus"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `).join("");
}
*/

// =====================================================
// RENDER CHAT PRODUCTS TABLE - Hiển thị sản phẩm đơn hàng trong modal tin nhắn
// =====================================================
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

    // Update the "Đơn hàng" tab badge count
    const orderTabBadge = document.getElementById("chatOrdersCountBadge");
    if (orderTabBadge) orderTabBadge.textContent = totalQty;

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

/**
 * Render a single product card
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
                        ${p.ProductName || p.Name || 'Sản phẩm'}${heldBadge}
                    </div>
                </div>

                <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
                    Mã: ${p.ProductCode || p.Code || 'N/A'}
                    ${isHeld && p.HeldBy ? `<br><span style="color: #f59e0b;">👤 ${p.HeldBy}</span>` : ''}
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

// Expose to window for external usage
window.renderChatProductsTable = renderChatProductsTable;

// --- Search Logic ---
var chatSearchTimeout = null;

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

function displayChatSearchResults(results) {
    const resultsDiv = document.getElementById("chatInlineSearchResults");
    if (!resultsDiv) return;

    // Ensure visibility and styling
    resultsDiv.style.display = "block";
    resultsDiv.style.zIndex = "1000";
    resultsDiv.style.maxHeight = "400px";
    resultsDiv.style.overflowY = "auto";
    resultsDiv.style.width = "600px"; // Make it wider like the screenshot
    resultsDiv.style.left = "-16px"; // Align with container padding
    resultsDiv.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)";

    if (!results || results.length === 0) {
        resultsDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 14px;">Không tìm thấy sản phẩm phù hợp</div>`;
        return;
    }

    // Check existing products (both main products and held products)
    const productsInOrder = new Map();
    const heldProductIds = new Set();

    // Check main products
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
            position: relative; /* For badge positioning */
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

function updateChatProductItemUI(productId) {
    const item = document.querySelector(`.chat-search-item[data-product-id="${productId}"]`);
    if (!item) return;

    // Add animation class (assuming CSS exists or we add inline style for animation)
    item.style.transition = "background 0.3s";
    item.style.background = "#dcfce7";
    setTimeout(() => {
        item.style.background = "white";
    }, 500);

    // Update quantity badge
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
// FIREBASE SYNC HELPER
// =====================================================
function saveChatProductsToFirebase(orderId, products) {
    if (!database || !orderId) return;
    const ref = database.ref('order_products/' + orderId);
    ref.set(products).catch(err => console.error("[CHAT-FIREBASE] Save error:", err));
}

/**
 * Add product from search to chat order
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
                OrderId: window.currentChatOrderData?.Id || currentChatOrderId,
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

                    // Sync to Firebase
                    const ref = window.firebase.database().ref(`held_products/${orderId}/${normalizedProductId}/${userId}`);

                    await ref.set({
                        productId: normalizedProductId,
                        displayName: auth.displayName || auth.userType || 'Unknown',
                        quantity: heldQuantity,
                        isDraft: true,
                        isFromSearch: true,
                        timestamp: window.firebase.database.ServerValue.TIMESTAMP
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

// Lock state to prevent duplicate confirmHeldProduct calls
const confirmHeldProductLocks = new Set();

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
        const orderId = window.currentChatOrderData.Id;
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
            console.log('[HELD-CONFIRM] Merged with existing product, new qty:',
                window.currentChatOrderData.Details[existingIndex].Quantity);
        } else {
            // Create new product object for main list
            newProduct = {
                ProductId: fullProduct.Id,
                Quantity: heldProduct.Quantity,
                Price: salePrice,
                Note: null,
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
        await updateOrderWithFullPayload(
            window.currentChatOrderData,
            mainProducts,
            totalAmount,
            totalQuantity
        );

        console.log('[HELD-CONFIRM] ✓ Order updated on backend');

        // Invalidate order details cache so modal loads fresh data on reopen
        if (typeof window.invalidateOrderDetailsCache === 'function') {
            window.invalidateOrderDetailsCache(window.currentChatOrderData.Id);
        }

        // Update the order table row (quantity column & total)
        if (typeof updateOrderInTable === 'function') {
            updateOrderInTable(window.currentChatOrderData.Id, {
                TotalQuantity: totalQuantity,
                TotalAmount: totalAmount
            });
        }

        // STEP 5: Remove from Firebase held_products
        if (typeof window.removeHeldProduct === 'function') {
            await window.removeHeldProduct(normalizedProductId);
            console.log('[HELD-CONFIRM] ✓ Removed from Firebase held_products');
        }

        // STEP 6: Sync currentChatOrderDetails for consistency
        currentChatOrderDetails = window.currentChatOrderData.Details.filter(p => !p.IsHeld);

        // STEP 7: Re-render Orders tab
        renderChatProductsTable();
        // REMOVED: saveChatProductsToFirebase - order_products/shared không còn listener

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
        const orderId = window.currentChatOrderData?.Id;
        const lockKey = `${orderId}_${normalizedProductId}`;
        confirmHeldProductLocks.delete(lockKey);
        console.log('[HELD-CONFIRM] Lock released for:', lockKey);
    }
};

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

// --- Action Logic ---

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
        currentChatOrderDetails = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
    }

    renderChatProductsTable();
    // REMOVED: saveChatProductsToFirebase - order_products/shared không còn listener
};

/**
 * Decrease main product quantity by ProductId
 * Shows confirmation, updates order via API
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
    const confirmMsg = `Xóa 1 "${productName}" khỏi đơn hàng?`;

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
        const freshOrderData = await getOrderDetails(orderId);

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
        await updateOrderWithFullPayload(
            freshOrderData,
            newDetails,
            totalAmount,
            totalQuantity
        );

        console.log('[DECREASE-BY-ID] ✓ Order updated successfully');

        // Invalidate order details cache so modal loads fresh data on reopen
        if (typeof window.invalidateOrderDetailsCache === 'function') {
            window.invalidateOrderDetailsCache(orderId);
        }

        // Update the order table row (quantity column & total)
        if (typeof updateOrderInTable === 'function') {
            updateOrderInTable(orderId, {
                TotalQuantity: totalQuantity,
                TotalAmount: totalAmount
            });
        }

        // Sync arrays
        currentChatOrderDetails = freshOrderData.Details.filter(p => !p.IsHeld);

        // Re-render UI
        renderChatProductsTable();

        // Show success notification
        if (window.notificationManager) {
            window.notificationManager.show("✅ Đã xóa 1 sản phẩm khỏi đơn hàng", "success");
        }

    } catch (error) {
        console.error('[DECREASE-BY-ID] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.error("❌ Lỗi: " + error.message);
        }
    }
};

/**
 * Update product quantity in chat order (legacy - by index)
 * @deprecated Use updateHeldProductQuantityById instead
 * Works with both currentChatOrderDetails and window.currentChatOrderData.Details
 * Syncs held products to Firebase for multi-user collaboration
 */
function updateChatProductQuantity(index, delta, specificValue = null) {
    // Get the correct data source
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
        currentChatOrderDetails = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
    }

    renderChatProductsTable();
    // REMOVED: saveChatProductsToFirebase - order_products/shared không còn listener
}

/**
 * Decrease main product quantity by 1
 * Shows confirmation, updates order via API, moves 1 product to dropped
 * @param {number} index - Product index in Details array
 */
async function decreaseMainProductQuantity(index) {
    // Get the correct data source
    const productsArray = (window.currentChatOrderData && window.currentChatOrderData.Details)
        ? window.currentChatOrderData.Details
        : currentChatOrderDetails;

    if (index < 0 || index >= productsArray.length) return;

    const product = productsArray[index];

    // Skip if held product
    if (product.IsHeld === true) {
        console.log('[DECREASE] Skipping held product');
        return;
    }

    // Show confirmation
    const productName = product.ProductName || product.Name || 'Sản phẩm';
    const confirmMsg = `Xóa 1 "${productName}" khỏi đơn hàng?`;

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

        console.log('[DECREASE] Fetching latest order data:', orderId);
        const freshOrderData = await getOrderDetails(orderId);

        // Update window.currentChatOrderData with fresh data
        window.currentChatOrderData = freshOrderData;

        // Find the product in fresh data by ProductId
        const freshProductIndex = freshOrderData.Details.findIndex(
            p => p.ProductId === product.ProductId && !p.IsHeld
        );

        if (freshProductIndex === -1) {
            throw new Error("Không tìm thấy sản phẩm trong đơn hàng");
        }

        const freshProduct = freshOrderData.Details[freshProductIndex];
        const currentQty = freshProduct.Quantity || 1;

        // Update quantity or remove if qty becomes 0
        if (currentQty <= 1) {
            // Remove product from order
            freshOrderData.Details.splice(freshProductIndex, 1);
            console.log('[DECREASE] Removed product (qty was 1)');
        } else {
            // Decrease quantity by 1
            freshOrderData.Details[freshProductIndex].Quantity = currentQty - 1;
            console.log('[DECREASE] Decreased quantity:', currentQty, '→', currentQty - 1);
        }

        // Get main products (non-held) for API update
        const mainProducts = freshOrderData.Details.filter(p => !p.IsHeld);
        const totalQuantity = mainProducts.reduce((sum, p) => sum + (p.Quantity || 0), 0);
        const totalAmount = mainProducts.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

        // Update order on backend
        await updateOrderWithFullPayload(
            freshOrderData,
            mainProducts,
            totalAmount,
            totalQuantity
        );

        console.log('[DECREASE] ✓ Order updated on backend');

        // Invalidate order details cache so modal loads fresh data on reopen
        if (typeof window.invalidateOrderDetailsCache === 'function') {
            window.invalidateOrderDetailsCache(orderId);
        }

        // Update the order table row (quantity column & total)
        if (typeof updateOrderInTable === 'function') {
            updateOrderInTable(orderId, {
                TotalQuantity: totalQuantity,
                TotalAmount: totalAmount
            });
        }

        // Update local data
        window.currentChatOrderData = freshOrderData;
        currentChatOrderDetails = mainProducts;

        // Re-render UI
        renderChatProductsTable();

        // Show success
        if (window.notificationManager) {
            window.notificationManager.show("✅ Đã xóa 1 sản phẩm khỏi đơn hàng", "success");
        }

    } catch (error) {
        console.error('[DECREASE] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.error("❌ Lỗi: " + error.message);
        } else {
            alert("❌ Lỗi: " + error.message);
        }
    }
}

// Expose to window
window.decreaseMainProductQuantity = decreaseMainProductQuantity;

/**
 * Remove product from chat order
 * - Shows confirmation dialog
 * - Updates order on backend (for non-held products)
 * - Removes held products from Firebase
 * - Rollback on error
 */
async function removeChatProduct(index) {
    // Show confirmation using CustomPopup
    const confirmed = window.CustomPopup
        ? await window.CustomPopup.confirm("Bạn có chắc muốn xóa sản phẩm này?", "Xác nhận xóa")
        : confirm("Bạn có chắc muốn xóa sản phẩm này?");

    if (!confirmed) return;

    // Get the correct data source
    const productsArray = (window.currentChatOrderData && window.currentChatOrderData.Details)
        ? window.currentChatOrderData.Details
        : currentChatOrderDetails;

    if (index < 0 || index >= productsArray.length) return;

    const product = productsArray[index];
    const isHeldProduct = product.IsHeld === true;

    // Show loading notification (non-blocking)
    if (window.notificationManager) {
        window.notificationManager.show("Đang xóa sản phẩm...", "info");
    }

    // Remove from local array (save for rollback)
    const removedProduct = productsArray.splice(index, 1)[0];

    try {
        // 1. If held product, remove from Firebase held_products
        if (isHeldProduct && typeof window.removeHeldProduct === 'function') {
            await window.removeHeldProduct(removedProduct.ProductId);
        }

        // 2. Update order on backend (only for non-held products)
        if (!isHeldProduct && window.currentChatOrderData) {
            const newDetails = productsArray.filter(p => !p.IsHeld);
            const totalQuantity = newDetails.reduce((sum, p) => sum + (p.Quantity || 0), 0);
            const totalAmount = newDetails.reduce((sum, p) => sum + ((p.Quantity || 0) * (p.Price || 0)), 0);

            console.log('[REMOVE-PRODUCT] Updating order on backend:', {
                orderId: window.currentChatOrderData.Id,
                newDetailsCount: newDetails.length,
                totalQuantity,
                totalAmount
            });

            await updateOrderWithFullPayload(
                window.currentChatOrderData,
                newDetails,
                totalAmount,
                totalQuantity
            );

            console.log('[REMOVE-PRODUCT] ✓ Order updated successfully');

            // Invalidate order details cache so modal loads fresh data on reopen
            const orderId = window.currentChatOrderData.Id;
            if (typeof window.invalidateOrderDetailsCache === 'function') {
                window.invalidateOrderDetailsCache(orderId);
            }

            // Update the order table row (quantity column & total)
            if (typeof updateOrderInTable === 'function') {
                updateOrderInTable(orderId, {
                    TotalQuantity: totalQuantity,
                    TotalAmount: totalAmount
                });
            }
        }

        // 3. Sync both arrays if needed
        if (window.currentChatOrderData && window.currentChatOrderData.Details) {
            currentChatOrderDetails = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
        }

        // 4. Re-render UI
        renderChatProductsTable();

        // 5. Show success notification
        if (window.notificationManager) {
            window.notificationManager.show("✅ Đã xóa sản phẩm", "success");
        }

    } catch (error) {
        // ROLLBACK on error
        console.error('[REMOVE-PRODUCT] Error:', error);

        // Restore product at original position
        productsArray.splice(index, 0, removedProduct);

        // Sync arrays
        if (window.currentChatOrderData && window.currentChatOrderData.Details) {
            currentChatOrderDetails = window.currentChatOrderData.Details.filter(p => !p.IsHeld);
        }

        // Re-render to show restored product
        renderChatProductsTable();

        // Show error notification
        if (window.notificationManager) {
            window.notificationManager.error("❌ Lỗi khi xóa: " + error.message);
        } else {
            alert("❌ Lỗi khi xóa: " + error.message);
        }
    }
}

// =====================================================
