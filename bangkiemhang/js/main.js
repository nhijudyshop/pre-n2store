// =====================================================
// MAIN APPLICATION INITIALIZATION
// =====================================================

// Initialize NotificationManager globally
let notificationManager;

async function initializeInventorySystem() {
    // Initialize notification system first
    notificationManager = new NotificationManager();
    window.notificationManager = notificationManager;

    // Check authentication
    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log("User not authenticated, redirecting to login");
        // Uncomment for production:
        // window.location.href = '../index.html';
        // return;
    }

    // Update page title with user info
    if (auth && auth.userType && auth.userType !== "Admin") {
        const titleElement = document.querySelector(".page-title");
        if (titleElement) {
            titleElement.textContent += " - " + auth.userType.split("-")[0];
        }
    }

    // Initialize filter events
    initializeFilterEvents();

    // Load initial data with notification
    // const loadingId = notificationManager.loadingData(
    //     "Đang khởi tạo hệ thống...",
    // );
    // showSuccess("Đang khởi tạo hệ thống...");
    try {
        await loadInventoryData();
        // notificationManager.remove(loadingId);
        notificationManager.success("Hệ thống đã sẵn sàng!", 2000);
    } catch (error) {
        // notificationManager.remove(loadingId);
        notificationManager.error(
            "Lỗi khởi tạo hệ thống: " + error.message,
            4000,
        );
    }

    // Set up event listeners for buttons
    setupEventListeners();

    console.log("Inventory Management System initialized successfully");
    console.log('Data source: Firebase collection "dathang"');
}

function setupEventListeners() {
    // Refresh button
    const refreshButton = document.getElementById("refreshButton");
    if (refreshButton) {
        refreshButton.addEventListener("click", refreshInventoryData);
    }

    // Export button
    const exportButton = document.getElementById("exportButton");
    if (exportButton) {
        exportButton.addEventListener("click", exportToExcel);
    }

    // Logout button
    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", handleLogout);
    }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
    // Force unblock any blocking overlays
    document.body.style.pointerEvents = "auto";
    document.body.style.userSelect = "auto";
    document.body.style.overflow = "auto";
    document.body.style.cursor = "default";

    // Initialize the inventory system
    initializeInventorySystem();

    console.log(
        "Inventory System with Firebase Integration loaded successfully",
    );
});

// Debug functions for development
window.debugInventoryFunctions = {
    loadInventoryData,
    refreshInventoryData,
    invalidateCache,
    getAuthState,
    exportToExcel,
    updateOrderInventoryData,
    removeInventoryDataFromOrder,
    applyFilters,
    globalState: () => globalState,
};

console.log("Main application initialized");
