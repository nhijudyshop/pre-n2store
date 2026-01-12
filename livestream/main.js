// js/main.js - Main Initialization & Event Handlers

// Global error handler
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    showError("Có lỗi xảy ra. Vui lòng tải lại trang.");
});

// Inject CSS for edit indicators
function injectEditHistoryCSS() {
    if (document.getElementById("editHistoryCSS")) return;

    const style = document.createElement("style");
    style.id = "editHistoryCSS";
    style.textContent = `
        .edit-indicator {
            color: #ffc107;
            font-size: 12px;
            margin-left: 5px;
        }

        .edited-row {
            border-left: 4px solid #ffc107 !important;
            background-color: #fff3cd !important;
        }

        .edited-row:hover {
            background-color: #ffeaa7 !important;
        }

        .admin-clickable-row {
            border-left: 4px solid #17a2b8 !important;
            background-color: #d1ecf1 !important;
        }

        .admin-clickable-row:hover {
            background-color: #bee5eb !important;
        }
    `;

    document.head.appendChild(style);
}

// Hide total-summary by default
function hideTotalSummaryByDefault() {
    const totalSummary = document.querySelector(".total-summary");
    if (totalSummary) {
        totalSummary.classList.add("hidden");
        console.log("[INIT] Total summary hidden by default");
    }
}

// Override existing functions to include total calculation updates
function enhanceFilterFunctions() {
    // Store original function if it exists
    if (typeof applyFilters !== "undefined") {
        const originalApplyFilters = applyFilters;
        window.applyFilters = function () {
            originalApplyFilters.call(this);
            setTimeout(() => {
                if (typeof updateAllTotals === "function") {
                    updateAllTotals();
                }
            }, 200);
        };
    }
}

// Enhance table functions with totals
function enhanceTableFunctions() {
    if (typeof renderTableFromData !== "undefined") {
        const originalRenderTableFromData = renderTableFromData;
        window.renderTableFromData = function (
            dataArray,
            applyInitialFilter = false,
        ) {
            originalRenderTableFromData.call(
                this,
                dataArray,
                applyInitialFilter,
            );
            setTimeout(() => {
                if (typeof updateAllTotals === "function") {
                    updateAllTotals();
                }
            }, 100);
        };
    }

    if (typeof updateTable !== "undefined") {
        const originalUpdateTable = updateTable;
        window.updateTable = function () {
            originalUpdateTable.call(this);
            setTimeout(() => {
                // Hide total summary by default after table update
                hideTotalSummaryByDefault();

                if (typeof initializeTotalCalculation === "function") {
                    initializeTotalCalculation();
                }
            }, 500);
        };
    }
}

// Main initialization function
function initializeApplication() {
    // Check authentication
    const auth = getAuthState();
    if (!isAuthenticated()) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "../index.html";
        return;
    }

    // Show main container
    const parentContainer = document.getElementById("parentContainer");
    if (parentContainer) {
        parentContainer.style.display = "flex";
        parentContainer.style.justifyContent = "center";
        parentContainer.style.alignItems = "center";
    }

    // Initialize CSS styles for edit history
    injectEditHistoryCSS();

    // Hide total summary by default
    hideTotalSummaryByDefault();

    // Initialize components
    if (typeof initializeUpdatedForm === "function") {
        initializeUpdatedForm();
    }

    // Initialize table events
    if (typeof initializeTableEvents === "function") {
        initializeTableEvents();
    }

    // Add logout button event listener
    const toggleLogoutButton = document.getElementById("toggleLogoutButton");
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener("click", handleLogout);
    }

    // Add close modal event listener - check if function exists
    const closeEditModalBtn = document.getElementById("closeEditModalBtn");
    if (closeEditModalBtn && typeof closeModal === "function") {
        closeEditModalBtn.addEventListener("click", closeModal);
    }

    // Update table - lần đầu sẽ áp dụng filter mặc định
    if (typeof updateTable === "function") {
        updateTable(false); // false = áp dụng filter mặc định lần đầu
    }

    // Remove ads
    const adsElement = document.querySelector(
        'div[style*="position: fixed"][style*="z-index:9999999"]',
    );
    if (adsElement) {
        adsElement.remove();
    }

    // Initialize total calculation if data already exists
    if (arrayData && arrayData.length > 0) {
        setTimeout(() => {
            if (typeof initializeTotalCalculation === "function") {
                initializeTotalCalculation();
            }
        }, 1000);
    }

    console.log("Livestream Report Management System initialized successfully");
}

// Document ready handler
document.addEventListener("DOMContentLoaded", function () {
    // Wait for all scripts to load before initializing
    setTimeout(() => {
        // Enhance functions with totals integration
        enhanceFilterFunctions();
        enhanceTableFunctions();

        // Initialize the application
        initializeApplication();
    }, 300);
});

// Window load handler for final enhancements and modal setup
window.addEventListener("load", function () {
    // Final enhancements after all resources are loaded
    setTimeout(() => {
        enhanceFilterFunctions();
        enhanceTableFunctions();

        // Ensure total summary is hidden
        hideTotalSummaryByDefault();

        // Setup modal close button if not already done
        const closeEditModalBtn = document.getElementById("closeEditModalBtn");
        if (closeEditModalBtn && typeof closeModal === "function") {
            // Remove any existing listeners to prevent duplicates
            closeEditModalBtn.removeEventListener("click", closeModal);
            closeEditModalBtn.addEventListener("click", closeModal);
        }
    }, 200);
});

// Export initialization function for potential manual calls
window.initializeApplication = initializeApplication;
window.hideTotalSummaryByDefault = hideTotalSummaryByDefault;
