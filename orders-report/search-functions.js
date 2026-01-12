// =====================================================
// ENHANCED SEARCH FUNCTIONS V2
// Excel Suggestions → Full Product Details → Add to Order
// =====================================================

// Track modal state
let isProductModalOpen = false;
let lastModalCloseTime = null;
let productSearchTimeout = null; // Renamed to avoid conflict with tab1-orders.js

// ========================================
// MODAL MANAGEMENT
// ========================================

async function showAddProductForm() {
    const container = document.getElementById("addProductContainer");
    const manager = window.enhancedProductSearchManager;

    if (!manager) {
        console.error("[SEARCH] Product manager not initialized");
        alert("Hệ thống chưa sẵn sàng. Vui lòng tải lại trang.");
        return;
    }

    // Modal is opening
    const wasOpen = isProductModalOpen;
    isProductModalOpen = true;

    // Determine if we should fetch new Excel data
    const shouldFetchNew =
        !wasOpen ||
        (lastModalCloseTime && Date.now() - lastModalCloseTime > 5000);

    try {
        // If not loaded or should fetch new, load Excel
        if (!manager.isLoaded || shouldFetchNew) {
            console.log("[SEARCH] Fetching Excel products...");
            await manager.fetchExcelProducts(!manager.isLoaded);
        } else {
            console.log("[SEARCH] Using cached Excel data");
        }
    } catch (error) {
        console.error("[SEARCH] Error loading products:", error);

        if (window.notificationManager) {
            window.notificationManager.error(
                "Không thể tải danh sách sản phẩm. Vui lòng thử lại.",
                4000,
            );
        } else {
            alert("Không thể tải danh sách sản phẩm. Vui lòng thử lại.");
        }
        return;
    }

    // Show modal
    container.classList.add("active");
    document.getElementById("productSearchInput").focus();

    // Update stats display
    updateProductStatsDisplay();

    console.log("[SEARCH] Product modal opened");
}

function hideAddProductForm() {
    const container = document.getElementById("addProductContainer");
    container.classList.remove("active");

    // Clear search
    document.getElementById("productSearchInput").value = "";
    document.getElementById("searchResults").innerHTML =
        '<div class="no-results">Nhập từ khóa để tìm kiếm sản phẩm</div>';

    // Update state
    isProductModalOpen = false;
    lastModalCloseTime = Date.now();

    console.log("[SEARCH] Product modal closed");
}

// ========================================
// SEARCH PRODUCTS (IN EXCEL SUGGESTIONS)
// ========================================

async function searchProducts(query) {
    if (productSearchTimeout) clearTimeout(productSearchTimeout);

    const resultsDiv = document.getElementById("searchResults");
    const manager = window.enhancedProductSearchManager;

    // Validate input
    if (!query || query.trim().length < 2) {
        resultsDiv.innerHTML =
            '<div class="no-results">Nhập ít nhất 2 ký tự để tìm kiếm</div>';
        return;
    }

    // Debounced search
    productSearchTimeout = setTimeout(async () => {
        resultsDiv.innerHTML =
            '<div class="loading-products"><i class="fas fa-spinner fa-spin"></i> Đang tìm kiếm...</div>';

        try {
            // Ensure products are loaded
            if (!manager.isLoaded) {
                console.log("[SEARCH] Products not loaded, fetching...");
                await manager.fetchExcelProducts();
            }

            // Search in Excel suggestions
            const products = manager.search(query, 20);

            if (products.length === 0) {
                resultsDiv.innerHTML =
                    '<div class="no-results">Không tìm thấy sản phẩm nào</div>';
                return;
            }

            console.log(
                `[SEARCH] Found ${products.length} products for "${query}"`,
            );

            // Render search results
            const resultsHTML = products
                .map((product) => renderSearchResultItem(product))
                .join("");
            resultsDiv.innerHTML = resultsHTML;
        } catch (error) {
            console.error("[SEARCH] Error:", error);
            resultsDiv.innerHTML =
                '<div class="no-results" style="color: #ef4444;">Lỗi khi tìm kiếm sản phẩm</div>';
        }
    }, 300);
}

// ========================================
// RENDER SEARCH RESULT ITEM
// ========================================

function renderSearchResultItem(product) {
    const hasImage = product.ImageUrl || product.HasFullDetails;
    const displayPrice = product.Price || 0;

    // Escape quotes for onclick
    const productJson = JSON.stringify(product).replace(/'/g, "&#39;");

    return `
        <div class="search-result-item" onclick='selectProductFromSuggestion(${product.Id}, ${productJson})'>
            ${
                hasImage
                    ? `<img src="${product.ImageUrl}" 
                       class="search-result-image" 
                       alt="${product.Name}" 
                       onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
                    : ""
            }
            <div class="search-result-image" 
                 style="background: #f3f4f6; 
                        display: ${hasImage ? "none" : "flex"}; 
                        align-items: center; 
                        justify-content: center;">
                <i class="fas fa-image" style="color: #d1d5db;"></i>
            </div>
            <div class="search-result-info">
                <div class="search-result-name">${product.Name}</div>
                ${product.Code ? `<div class="search-result-code">Mã: ${product.Code}</div>` : ""}
                ${
                    product.QtyAvailable !== undefined &&
                    product.QtyAvailable !== null
                        ? `<div class="search-result-code" style="color: ${product.QtyAvailable > 0 ? "#059669" : "#ef4444"}">
                         Tồn: ${product.QtyAvailable}
                       </div>`
                        : ""
                }
            </div>
            <div class="search-result-price">
                ${displayPrice.toLocaleString("vi-VN")}đ
            </div>
            ${
                product.HasFullDetails
                    ? '<i class="fas fa-check-circle" style="color: #10b981; font-size: 16px;" title="Đã có đầy đủ thông tin"></i>'
                    : '<i class="fas fa-download" style="color: #6366f1; font-size: 16px;" title="Sẽ tải thông tin đầy đủ"></i>'
            }
        </div>
    `;
}

// ========================================
// SELECT PRODUCT FROM SUGGESTION
// ========================================

async function selectProductFromSuggestion(productId, suggestionData) {
    const manager = window.enhancedProductSearchManager;
    let notificationId = null;

    try {
        // Show loading if need to fetch full details
        const needsFullDetails = !suggestionData.HasFullDetails;

        if (needsFullDetails) {
            if (window.notificationManager) {
                notificationId = window.notificationManager.show(
                    "Đang tải thông tin sản phẩm...",
                    "info",
                    0,
                    {
                        showOverlay: true,
                        persistent: true,
                        icon: "package",
                        title: "Tải sản phẩm",
                    },
                );
            }
        }

        console.log(
            `[SEARCH] Selected product ${productId}, needs full details: ${needsFullDetails}`,
        );

        // Get full product details
        const fullProduct = await manager.getFullProductDetails(productId);

        // Close loading notification
        if (notificationId && window.notificationManager) {
            window.notificationManager.remove(notificationId);
        }

        // Add product to order
        await addProductToOrder(fullProduct);

        // Update stats display (suggestions might have been enriched)
        updateProductStatsDisplay();
    } catch (error) {
        console.error("[SEARCH] Error selecting product:", error);

        if (notificationId && window.notificationManager) {
            window.notificationManager.remove(notificationId);
        }

        if (window.notificationManager) {
            window.notificationManager.error(
                error.message || "Không thể tải thông tin sản phẩm",
                4000,
                "Lỗi",
            );
        } else {
            alert(
                `Lỗi: ${error.message || "Không thể tải thông tin sản phẩm"}`,
            );
        }
    }
}

// ========================================
// ADD PRODUCT TO ORDER
// ========================================

async function addProductToOrder(fullProduct) {
    try {
        console.log("[SEARCH] Adding product to order:", fullProduct.Id);

        // Prepare product data for order
        const productData = {
            Id: fullProduct.Id,
            Code: fullProduct.DefaultCode || fullProduct.Barcode || "",
            Name: fullProduct.Name || fullProduct.NameTemplate || "",
            Price: fullProduct.PriceVariant || fullProduct.ListPrice || 0,
            StandardPrice: fullProduct.StandardPrice || 0,
            ImageUrl: fullProduct.ImageUrl,
            Thumbnails: fullProduct.Thumbnails,
            UOM: fullProduct.UOM?.Name || "Cái",
            UOMId: fullProduct.UOMId || 1,
            QtyAvailable: fullProduct.QtyAvailable || 0,
            Category: fullProduct.Categ?.Name || "",
            Barcode: fullProduct.Barcode,
            EAN13: fullProduct.EAN13,
        };

        // Check if there's an existing function to add product to order
        if (typeof window.addProductToOrderList === "function") {
            window.addProductToOrderList(productData);
        } else {
            // If no existing function, you'll need to implement this based on your order management
            console.warn("[SEARCH] No addProductToOrderList function found");

            // Example: Add to a global order items array (adjust based on your implementation)
            if (!window.currentOrderItems) {
                window.currentOrderItems = [];
            }

            window.currentOrderItems.push({
                ...productData,
                Quantity: 1,
                TotalAmount: productData.Price,
            });

            console.log("[SEARCH] Product added to order items");
        }

        // Show success notification
        if (window.notificationManager) {
            window.notificationManager.success(
                `Đã thêm ${productData.Name}`,
                2000,
            );
        }

        // Close modal after adding
        hideAddProductForm();
    } catch (error) {
        console.error("[SEARCH] Error adding product to order:", error);
        throw error;
    }
}

// ========================================
// UI ENHANCEMENTS
// ========================================

function updateProductStatsDisplay() {
    const manager = window.enhancedProductSearchManager;
    const stats = manager.getStats();

    // Update or create stats display
    let statsEl = document.querySelector(".product-stats-mini");

    if (!statsEl) {
        const searchContainer = document.querySelector(".add-product-search");
        if (!searchContainer) return;

        statsEl = document.createElement("div");
        statsEl.className = "product-stats-mini";
        searchContainer.insertBefore(statsEl, searchContainer.firstChild);
    }

    statsEl.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-box" style="color: #6366f1;"></i>
            <span class="stat-value">${stats.totalSuggestions.toLocaleString("vi-VN")}</span>
            <span>sản phẩm</span>
        </div>
        <div class="stat-item">
            <i class="fas fa-check-circle" style="color: #10b981;"></i>
            <span class="stat-value">${stats.enrichedSuggestions.toLocaleString("vi-VN")}</span>
            <span>có hình ảnh</span>
        </div>
        <div class="stat-item">
            <i class="fas fa-clock" style="color: #f59e0b;"></i>
            <span style="font-size: 11px;">${stats.cacheAge}</span>
        </div>
    `;
}

function addRefreshButton() {
    const searchContainer = document.querySelector(".add-product-search");
    if (!searchContainer) return;

    // Check if button already exists
    if (searchContainer.querySelector(".refresh-products-btn")) return;

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "refresh-products-btn";
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Làm mới';
    refreshBtn.title = "Tải lại danh sách sản phẩm từ Excel";

    refreshBtn.onclick = async () => {
        try {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Đang tải...';

            await window.enhancedProductSearchManager.refresh();

            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-check"></i> Đã cập nhật';

            updateProductStatsDisplay();

            setTimeout(() => {
                refreshBtn.innerHTML =
                    '<i class="fas fa-sync-alt"></i> Làm mới';
            }, 2000);
        } catch (error) {
            console.error("Error refreshing:", error);
            refreshBtn.disabled = false;
            refreshBtn.innerHTML =
                '<i class="fas fa-exclamation-triangle"></i> Thử lại';

            setTimeout(() => {
                refreshBtn.innerHTML =
                    '<i class="fas fa-sync-alt"></i> Làm mới';
            }, 2000);
        }
    };

    searchContainer.appendChild(refreshBtn);
}

function addProductCountBadge() {
    const searchContainer = document.querySelector(".add-product-search");
    if (!searchContainer) return;

    // Check if badge already exists
    if (searchContainer.querySelector(".product-count-badge")) return;

    const manager = window.enhancedProductSearchManager;
    const stats = manager.getStats();

    const badge = document.createElement("div");
    badge.className = "product-count-badge";
    badge.textContent = `${stats.totalSuggestions.toLocaleString("vi-VN")} sản phẩm`;
    badge.title = `Cập nhật: ${stats.lastFetch}\nCó hình ảnh: ${stats.enrichedSuggestions}`;

    searchContainer.appendChild(badge);
}

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener("DOMContentLoaded", function () {
    console.log("[SEARCH] Initializing enhanced search functions...");

    // Wait a bit for the UI to be ready
    setTimeout(() => {
        addRefreshButton();
        addProductCountBadge();
        updateProductStatsDisplay();
    }, 1000);

    // Bind search input if exists
    const searchInput = document.getElementById("productSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            searchProducts(e.target.value);
        });

        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                hideAddProductForm();
            }
        });
    }

    console.log("[SEARCH] Enhanced search functions initialized");
});

// ========================================
// BACKWARD COMPATIBILITY
// ========================================

// Keep old function names for compatibility
window.showAddProductForm = showAddProductForm;
window.hideAddProductForm = hideAddProductForm;
window.searchProducts = searchProducts;

console.log("[SEARCH] Enhanced search functions V2 loaded");
