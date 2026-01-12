// js/statistics.js - Statistics Cards Management

function calculateStatistics(data) {
    if (!data || data.length === 0) {
        return {
            totalProducts: 0,
            totalOrders: 0,
            totalSupplierQty: 0,
            totalCustomerQty: 0,
        };
    }

    const stats = {
        totalProducts: data.length,
        totalOrders: 0,
        totalSupplierQty: 0,
        totalCustomerQty: 0,
    };

    data.forEach((item) => {
        // Count total order codes
        if (item.orderCodes && Array.isArray(item.orderCodes)) {
            stats.totalOrders += item.orderCodes.length;
        }

        // Sum supplier quantities
        stats.totalSupplierQty += item.supplierQty || 0;

        // Sum customer orders
        stats.totalCustomerQty += item.customerOrders || 0;
    });

    return stats;
}

function renderStatistics() {
    // Get filtered data
    let data;
    if (typeof window.getFilteredData === "function") {
        data = window.getFilteredData();
    } else {
        data = window.inventoryData || [];
    }

    const stats = calculateStatistics(data);

    // Update stat cards
    updateStatCard("statTotalProducts", stats.totalProducts, "Tổng Sản Phẩm");
    updateStatCard("statTotalOrders", stats.totalOrders, "Tổng Mã ĐH");
    updateStatCard("statSupplierQty", stats.totalSupplierQty, "Tổng SL NCC");
    updateStatCard("statCustomerQty", stats.totalCustomerQty, "Tổng SL Khách");

    console.log("Statistics updated:", stats);
}

function updateStatCard(elementId, value, label) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Animate number change
    const currentValue = parseInt(element.textContent) || 0;
    if (currentValue !== value) {
        animateValue(element, currentValue, value, 500);
    }
}

function animateValue(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16); // 60fps
    let current = start;

    const timer = setInterval(() => {
        current += increment;

        if (
            (increment > 0 && current >= end) ||
            (increment < 0 && current <= end)
        ) {
            current = end;
            clearInterval(timer);
        }

        element.textContent = Math.round(current).toLocaleString("vi-VN");
    }, 16);
}

function initStatistics() {
    // Create stats section if not exists
    const mainContent = document.querySelector(".main-content");
    const topBar = document.querySelector(".top-bar");

    if (!mainContent || !topBar) return;

    let statsSection = document.getElementById("statsSection");

    if (!statsSection) {
        statsSection = document.createElement("section");
        statsSection.id = "statsSection";
        statsSection.className = "stats-section";
        statsSection.innerHTML = `
            <div class="stat-card" data-stat="products">
                <div class="stat-icon blue">
                    <i data-lucide="package"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="statTotalProducts">0</div>
                    <div class="stat-label">Tổng Sản Phẩm</div>
                </div>
            </div>
            <div class="stat-card" data-stat="orders">
                <div class="stat-icon green">
                    <i data-lucide="shopping-cart"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="statTotalOrders">0</div>
                    <div class="stat-label">Tổng Mã ĐH</div>
                </div>
            </div>
            <div class="stat-card" data-stat="supplier">
                <div class="stat-icon purple">
                    <i data-lucide="truck"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="statSupplierQty">0</div>
                    <div class="stat-label">Tổng SL NCC</div>
                </div>
            </div>
            <div class="stat-card" data-stat="customer">
                <div class="stat-icon orange">
                    <i data-lucide="users"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-value" id="statCustomerQty">0</div>
                    <div class="stat-label">Tổng SL Khách</div>
                </div>
            </div>
        `;

        // Insert after top bar
        topBar.insertAdjacentElement("afterend", statsSection);

        // Add hover effects and click handlers
        addStatsInteractions();

        // Initialize icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    // Render initial statistics
    renderStatistics();
}

function addStatsInteractions() {
    const statCards = document.querySelectorAll(".stat-card");

    statCards.forEach((card) => {
        // Add click effect
        card.addEventListener("click", function () {
            // Visual feedback
            this.style.transform = "scale(0.98)";
            setTimeout(() => {
                this.style.transform = "";
            }, 150);

            // Optional: Could add filtering or sorting here
            const statType = this.dataset.stat;
            console.log(`Clicked stat: ${statType}`);
        });
    });
}

// Export functions
window.calculateStatistics = calculateStatistics;
window.renderStatistics = renderStatistics;
window.initStatistics = initStatistics;

console.log("✓ Statistics module loaded");
