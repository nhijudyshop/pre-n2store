// =====================================================
// MAIN INITIALIZATION
// File 6/6: hangrotxa-main.js
// =====================================================

// =====================================================
// FORM INITIALIZATION
// =====================================================

function initializeFormElements() {
    const config = window.HangRotXaConfig;
    const ui = window.HangRotXaUI;
    const crud = window.HangRotXaCRUD;

    // Form submit handler
    const productForm = document.getElementById("productForm");
    if (productForm) {
        productForm.addEventListener("submit", crud.addProduct);
    }

    // Clear data button
    const clearDataButton = document.getElementById("clearDataButton");
    if (clearDataButton) {
        clearDataButton.addEventListener("click", ui.clearData);
    }

    // Toggle form button
    const toggleFormButton = document.getElementById("toggleFormButton");
    if (toggleFormButton) {
        toggleFormButton.addEventListener("click", ui.toggleForm);
    }

    // Close form button
    const closeForm = document.getElementById("closeForm");
    if (closeForm) {
        closeForm.addEventListener("click", () => {
            config.dataForm.style.display = "none";
            config.dataForm.classList.remove("show");
        });
    }

    // Initialize image input tabs
    ui.initializeImageInputTabs();

    // Initialize clipboard handling
    ui.initializeClipboardHandling();

    // Initialize quantity validation
    initializeQuantityValidation();
}

function initializeQuantityValidation() {
    const soLuongInput = document.getElementById("soLuong");
    const utils = window.HangRotXaUtils;

    if (soLuongInput) {
        soLuongInput.addEventListener("input", function () {
            const enteredValue = parseInt(soLuongInput.value);
            const auth = authManager ? authManager.getAuthState() : null;

            if (!auth || auth.checkLogin != "777") {
                if (enteredValue < 1) {
                    utils.showError("Số lượng phải lớn hơn hoặc bằng 1");
                    soLuongInput.value = "1";
                }
            } else {
                utils.showError("Không đủ quyền!");
                soLuongInput.value = enteredValue;
            }
        });

        // Prevent mouse wheel from changing value
        soLuongInput.addEventListener("wheel", function (e) {
            e.preventDefault();
        });
    }
}

// =====================================================
// FILTER EVENT HANDLERS
// =====================================================

function initializeFilterEvents() {
    const config = window.HangRotXaConfig;
    const ui = window.HangRotXaUI;

    if (config.filterCategorySelect) {
        config.filterCategorySelect.addEventListener("change", ui.applyFilters);
    }

    if (config.dateFilterDropdown) {
        config.dateFilterDropdown.addEventListener("change", ui.applyFilters);
    }
}

// =====================================================
// MAIN INITIALIZATION
// =====================================================

async function initializeApplication() {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;
    const cache = window.HangRotXaCache;
    const ui = window.HangRotXaUI;

    // Check authentication
    if (!authManager || !authManager.isAuthenticated()) {
        console.log("User not authenticated, redirecting to login");
        window.location.href = "../index.html";
        return;
    }

    // Initialize notification manager
    config.notificationManager = new NotificationManager();
    window.HangRotXaConfig.notificationManager = config.notificationManager;

    // Update UI based on user
    const auth = authManager.getAuthState();
    if (auth && auth.displayName) {
        const titleElement = document.querySelector(".page-title");
        if (titleElement) {
            titleElement.textContent += " - " + auth.displayName;
        }
    }

    // Show main container
    const parentContainer = document.getElementById("parentContainer");
    if (parentContainer) {
        parentContainer.style.display = "flex";
        parentContainer.style.justifyContent = "center";
        parentContainer.style.alignItems = "center";
    }

    // Initialize all components
    initializeFormElements();
    initializeFilterEvents();
    ui.initializeTooltipHandlers();
    ui.initializeSearch();
    ui.initializeImageHoverPreview(); // ✅ NEW: Initialize image hover preview

    // Initialize data with migration
    await cache.initializeWithMigration();

    // Refresh button
    const btnRefresh = document.getElementById("btnRefresh");
    if (btnRefresh) {
        btnRefresh.addEventListener("click", () => {
            cache.forceRefreshData();
        });
    }

    // Export button (optional)
    const btnExport = document.getElementById("btnExport");
    if (btnExport) {
        btnExport.addEventListener("click", () => {
            utils.showInfo("Tính năng xuất Excel đang được phát triển");
        });
    }

    // Initialize Lucide icons
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    console.log(
        "Enhanced Inventory Management System initialized successfully",
    );
}

// =====================================================
// ERROR HANDLERS
// =====================================================

window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    if (window.HangRotXaConfig.notificationManager) {
        window.HangRotXaUtils.showError(
            "Có lỗi xảy ra. Vui lòng tải lại trang.",
        );
    }
});

window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);
    if (window.HangRotXaConfig.notificationManager) {
        window.HangRotXaUtils.showError("Có lỗi xảy ra trong xử lý dữ liệu.");
    }
});

// =====================================================
// DEBUG FUNCTIONS
// =====================================================

window.HangRotXaDebug = {
    checkDataIntegrity: window.HangRotXaCache.checkDataIntegrity,
    forceSortByTime: window.HangRotXaCache.forceSortByTime,
    forceRefreshData: window.HangRotXaCache.forceRefreshData,
    invalidateCache: window.HangRotXaCache.invalidateCache,
    generateUniqueID: window.HangRotXaUtils.generateUniqueID,
    sortDataByNewest: window.HangRotXaUtils.sortDataByNewest,
    parseVietnameseDate: window.HangRotXaUtils.parseVietnameseDate,
};

// =====================================================
// DOM CONTENT LOADED
// =====================================================

document.addEventListener("DOMContentLoaded", function () {
    console.log("DOM loaded - Starting application initialization...");

    // Remove any ads or unwanted elements
    const adsElement = document.querySelector(
        'div[style*="position: fixed"][style*="z-index:9999999"]',
    );
    if (adsElement) {
        adsElement.remove();
    }

    // Initialize application
    initializeApplication();
});

// =====================================================
// EXPORTS
// =====================================================

console.log("Enhanced Inventory Management System - All Modules Loaded");
console.log("Available modules:");
console.log("- HangRotXaConfig: Configuration and Firebase");
console.log("- HangRotXaUtils: Utility functions");
console.log("- HangRotXaCache: Cache management");
console.log("- HangRotXaUI: UI interactions");
console.log("- HangRotXaCRUD: CRUD operations");
console.log("- HangRotXaDebug: Debug functions");
console.log("\nDebug functions available at: window.HangRotXaDebug");
