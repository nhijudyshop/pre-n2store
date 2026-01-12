// js/order-statistics.js - Order Code Statistics (Simple Count)

// Track visibility state
let isOrderStatsVisible = false;

function calculateOrderStatistics(inventoryData) {
    const stats = new Map();

    if (!inventoryData || inventoryData.length === 0) {
        return [];
    }

    // Process each inventory item
    inventoryData.forEach((item) => {
        if (!item.orderCodes || item.orderCodes.length === 0) return;

        item.orderCodes.forEach((orderCode) => {
            if (!stats.has(orderCode)) {
                stats.set(orderCode, {
                    orderCode: orderCode,
                    products: [],
                    productCount: 0,
                });
            }

            const stat = stats.get(orderCode);

            // Add product details (just the code and name, no quantity)
            stat.products.push({
                id: item.id,
                productCode: item.productCode,
                productName: item.productName,
                supplier: item.supplier,
            });

            stat.productCount++;
        });
    });

    // Convert Map to Array and sort by product count (descending)
    const statsArray = Array.from(stats.values());
    statsArray.sort((a, b) => b.productCount - a.productCount);

    return statsArray;
}

function renderOrderStatistics() {
    const container = document.getElementById("orderStatsContainer");
    if (!container) return;

    // Get filtered data
    let filteredInventory;

    if (typeof window.getFilteredData === "function") {
        filteredInventory = window.getFilteredData();
    } else if (typeof window.filterInventoryData === "function") {
        const inventory = window.inventoryData || [];
        filteredInventory = window.filterInventoryData(inventory);
    } else {
        filteredInventory = window.inventoryData || [];
    }

    console.log("Order Stats - Filtered data count:", filteredInventory.length);

    const stats = calculateOrderStatistics(filteredInventory);

    console.log("Order Stats - Calculated stats:", stats.length, "orders");

    // Store current visibility state
    const wasVisible = isOrderStatsVisible;

    // Clear container
    container.innerHTML = "";

    // Create statistics panel
    const panel = createOrderStatsPanel(stats);
    container.appendChild(panel);

    // Restore visibility state
    if (wasVisible) {
        const content = document.getElementById("orderStatsContent");
        if (content) {
            content.classList.remove("hidden");
            isOrderStatsVisible = true;

            const btn = document.getElementById("toggleOrderStatsBtn");
            if (btn) {
                const chevron = btn.querySelector(".chevron-icon");
                if (chevron) {
                    chevron.setAttribute("data-lucide", "chevron-up");
                }
            }
        }
    }

    // Reinitialize icons
    initIcons();
}

function createOrderStatsPanel(stats) {
    const panel = document.createElement("div");
    panel.className = "order-stats-panel";

    // Toggle Button
    const headerWrapper = document.createElement("div");
    headerWrapper.className = "order-stats-header-wrapper";

    const toggleBtn = document.createElement("button");
    toggleBtn.id = "toggleOrderStatsBtn";
    toggleBtn.className = "toggle-order-stats-btn";

    const chevronIcon = isOrderStatsVisible ? "chevron-up" : "chevron-down";
    toggleBtn.innerHTML = `
        <i data-lucide="bar-chart-3"></i>
        <span>Thống Kê Mã Đơn Hàng</span>
        <i data-lucide="${chevronIcon}" class="chevron-icon"></i>
    `;

    toggleBtn.addEventListener("click", toggleOrderStatsVisibility);

    headerWrapper.appendChild(toggleBtn);
    panel.appendChild(headerWrapper);

    // Content Section
    const content = document.createElement("div");
    content.id = "orderStatsContent";
    content.className = isOrderStatsVisible
        ? "order-stats-content"
        : "order-stats-content hidden";

    // Header info
    const header = document.createElement("div");
    header.className = "order-stats-header";
    header.innerHTML = `
        <p class="order-stats-subtitle">Mỗi mã đơn hàng có bao nhiêu mã sản phẩm</p>
    `;
    content.appendChild(header);

    // Summary cards
    const totalOrders = stats.length;
    const totalProducts = stats.reduce((sum, s) => sum + s.productCount, 0);

    const summary = document.createElement("div");
    summary.className = "order-stats-summary";
    summary.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon" style="background: #e0e7ff;">
                <i data-lucide="shopping-cart" style="color: #667eea;"></i>
            </div>
            <div class="stat-value">${totalOrders}</div>
            <div class="stat-label">Tổng Mã ĐH</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background: #d1fae5;">
                <i data-lucide="package" style="color: #10b981;"></i>
            </div>
            <div class="stat-value">${totalProducts}</div>
            <div class="stat-label">Tổng Mã SP</div>
        </div>
    `;
    content.appendChild(summary);

    // Order list
    const orderList = document.createElement("div");
    orderList.className = "order-stats-list";

    if (stats.length === 0) {
        orderList.innerHTML = `
            <div class="empty-state">
                <i data-lucide="inbox"></i>
                <p>Chưa có đơn hàng nào</p>
            </div>
        `;
    } else {
        stats.forEach((stat) => {
            const orderCard = createOrderCard(stat);
            orderList.appendChild(orderCard);
        });
    }

    content.appendChild(orderList);
    panel.appendChild(content);

    return panel;
}

function toggleOrderStatsVisibility() {
    const content = document.getElementById("orderStatsContent");
    const btn = document.getElementById("toggleOrderStatsBtn");

    if (!content || !btn) return;

    isOrderStatsVisible = !isOrderStatsVisible;

    if (isOrderStatsVisible) {
        content.classList.remove("hidden");
        const chevron = btn.querySelector(".chevron-icon");
        if (chevron) {
            chevron.setAttribute("data-lucide", "chevron-up");
        }
    } else {
        content.classList.add("hidden");
        const chevron = btn.querySelector(".chevron-icon");
        if (chevron) {
            chevron.setAttribute("data-lucide", "chevron-down");
        }
    }

    initIcons();
}

function createOrderCard(stat) {
    const card = document.createElement("div");
    card.className = "order-card";

    // Card header
    const header = document.createElement("div");
    header.className = "order-card-header";
    header.innerHTML = `
        <div class="order-info">
            <div class="order-icon">
                <i data-lucide="shopping-cart"></i>
            </div>
            <div>
                <h3 class="order-code">${stat.orderCode}</h3>
                <div class="order-meta">
                    <span>Có <strong>${stat.productCount}</strong> Mã SP</span>
                </div>
            </div>
        </div>
        <button class="toggle-btn">
            <i data-lucide="chevron-down"></i>
        </button>
    `;

    // Card body (hidden by default)
    const body = document.createElement("div");
    body.className = "order-card-body hidden";

    const productList = document.createElement("div");
    productList.className = "product-list";

    stat.products.forEach((product) => {
        const productItem = document.createElement("div");
        productItem.className = "product-item";
        productItem.innerHTML = `
            <div class="product-icon">
                <i data-lucide="package"></i>
            </div>
            <div class="product-details">
                <div class="product-header">
                    <span class="product-code">${product.productCode}</span>
                    <span class="product-supplier">${product.supplier}</span>
                </div>
                <div class="product-name">${product.productName}</div>
            </div>
        `;
        productList.appendChild(productItem);
    });

    body.appendChild(productList);

    // Toggle functionality
    const toggleBtn = header.querySelector(".toggle-btn");
    toggleBtn.addEventListener("click", () => {
        const isHidden = body.classList.contains("hidden");
        body.classList.toggle("hidden");

        const icon = toggleBtn.querySelector("i");
        if (isHidden) {
            icon.setAttribute("data-lucide", "chevron-up");
        } else {
            icon.setAttribute("data-lucide", "chevron-down");
        }

        initIcons();
    });

    card.appendChild(header);
    card.appendChild(body);

    return card;
}

// Initialize order statistics when page loads
function initOrderStatistics() {
    if (!document.getElementById("orderStatsContainer")) {
        const container = document.createElement("div");
        container.id = "orderStatsContainer";

        const filterSection = document.querySelector(".filter-section");
        if (filterSection) {
            filterSection.parentNode.insertBefore(
                container,
                filterSection.nextSibling,
            );
        }
    }

    renderOrderStatistics();
}

// Export functions
window.calculateOrderStatistics = calculateOrderStatistics;
window.renderOrderStatistics = renderOrderStatistics;
window.initOrderStatistics = initOrderStatistics;
window.toggleOrderStatsVisibility = toggleOrderStatsVisibility;

console.log("✓ Order Statistics module loaded");
