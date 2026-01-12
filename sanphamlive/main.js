// js/main.js - Main Application Logic with Firebase Integration

// Global inventory data
window.inventoryData = [];
let realtimeUnsubscribe = null;

// Initialize application
document.addEventListener("DOMContentLoaded", async function () {
    console.log("Initializing Inventory Management System with Firebase...");

    // Initialize Firebase first
    const firebaseReady = initializeFirebase();

    if (firebaseReady) {
        // Wait a bit for Firebase to fully initialize
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Initialize Firebase service
        const serviceReady = window.firebaseService.init();

        if (serviceReady) {
            console.log("✓ Firebase service ready");

            // Load data from Firebase
            await loadInventoryData();

            // Setup real-time listener
            setupRealtimeSync();
        } else {
            console.warn(
                "⚠ Firebase service failed to initialize, using local mode",
            );
            await loadInventoryData();
        }
    } else {
        console.warn("⚠ Firebase not available, using local mode");
        await loadInventoryData();
    }

    // Initialize modules
    initStatistics();
    initFilters();
    initModals();
    initFormHandlers();
    initHeaderButtons();
    initOrderStatistics();

    // Initialize icons
    initIcons();

    // Update sync status
    updateSyncStatus();

    console.log("✓ Application initialized successfully");
});

// Load inventory data from Firebase or cache
async function loadInventoryData() {
    // const loadingId = notificationManager.loadingData(
    //     "Đang tải dữ liệu từ Firebase...",
    // );
    showLoading("Đang tải dữ liệu từ Firebase...");

    try {
        if (window.isFirebaseInitialized()) {
            // Load from Firebase
            const data = await window.firebaseService.loadInventory();

            if (data && data.length > 0) {
                console.log(`✓ Loaded ${data.length} items from Firebase`);
                window.inventoryData = data;
                setCachedData(data);
            } else {
                // No data in Firebase, use sample data
                console.log("No data in Firebase, using sample data");
                window.inventoryData = SAMPLE_DATA;

                // Save sample data to Firebase
                for (const item of SAMPLE_DATA) {
                    await window.firebaseService.addItem(item);
                }
            }
        } else {
            // Firebase not available, use cached or sample data
            const cachedData = getCachedData();

            if (cachedData && cachedData.length > 0) {
                console.log("Loading from cache...");
                window.inventoryData = cachedData;
            } else {
                console.log("Loading sample data...");
                window.inventoryData = SAMPLE_DATA;
                setCachedData(SAMPLE_DATA);
            }
        }

        applyFilters();
        renderOrderStatistics();
        renderStatistics();

        // Remove loading and show success
        //notificationManager.remove(loadingId);
        notificationManager.success(
            `Đã tải ${window.inventoryData.length} sản phẩm`,
        );
    } catch (error) {
        console.error("Error loading data:", error);
        notificationManager.remove(loadingId);
        notificationManager.error("Lỗi tải dữ liệu: " + error.message);

        // Fallback to cache
        const cachedData = getCachedData();
        if (cachedData) {
            window.inventoryData = cachedData;
            applyFilters();
            renderOrderStatistics();
        }
    }
}

// Setup real-time sync with Firebase
function setupRealtimeSync() {
    if (!window.isFirebaseInitialized()) {
        return;
    }

    try {
        realtimeUnsubscribe = window.firebaseService.listenToInventory(
            (data) => {
                console.log("Real-time update received");
                window.inventoryData = data;
                setCachedData(data);
                applyFilters();
                renderOrderStatistics();
                updateSyncStatus(true);
            },
        );

        console.log("✓ Real-time sync enabled");
    } catch (error) {
        console.error("Error setting up real-time sync:", error);
    }
}

// Update sync status indicator
function updateSyncStatus(synced = false) {
    const statusEl = document.getElementById("syncStatus");
    if (!statusEl) return;

    if (window.isFirebaseInitialized()) {
        if (navigator.onLine) {
            statusEl.innerHTML = synced
                ? '<span style="color: #10b981;">● Đã đồng bộ</span>'
                : '<span style="color: #3b82f6;">● Trực tuyến</span>';
        } else {
            statusEl.innerHTML =
                '<span style="color: #f59e0b;">● Offline</span>';
        }
    } else {
        statusEl.innerHTML =
            '<span style="color: #6b7280;">● Local Mode</span>';
    }
}

// Initialize form handlers
function initFormHandlers() {
    const toggleFormBtn = document.getElementById("toggleFormBtn");
    const submitBtn = document.getElementById("submitBtn");
    const cancelFormBtn = document.getElementById("cancelFormBtn");
    const formSection = document.getElementById("formSection");

    if (toggleFormBtn) {
        toggleFormBtn.addEventListener("click", toggleForm);
    }

    if (submitBtn) {
        submitBtn.addEventListener("click", handleSubmitProduct);
    }

    if (cancelFormBtn) {
        cancelFormBtn.addEventListener("click", () => {
            if (formSection) {
                formSection.classList.add("hidden");
                clearForm();
            }
        });
    }

    // Add Enter key support for form submission
    const formInputs = [
        document.getElementById("supplier"),
        document.getElementById("productName"),
        document.getElementById("productCode"),
        document.getElementById("supplierQty"),
    ];

    formInputs.forEach((input) => {
        if (input) {
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmitProduct();
                }
            });
        }
    });
}

// Toggle form visibility
function toggleForm() {
    const formSection = document.getElementById("formSection");
    const toggleBtn = document.getElementById("toggleFormBtn");

    if (!formSection || !toggleBtn) return;

    if (formSection.classList.contains("hidden")) {
        formSection.classList.remove("hidden");
        const btnText = toggleBtn.querySelector("span");
        if (btnText) btnText.textContent = "Ẩn Form";

        // Focus first input
        const firstInput = document.getElementById("supplier");
        if (firstInput) firstInput.focus();
    } else {
        formSection.classList.add("hidden");
        const btnText = toggleBtn.querySelector("span");
        if (btnText) btnText.textContent = "Thêm SP";
        clearForm();
    }

    initIcons();
}

// Handle product submission with Firebase
async function handleSubmitProduct() {
    const supplierInput = document.getElementById("supplier");
    const productNameInput = document.getElementById("productName");
    const productCodeInput = document.getElementById("productCode");
    const supplierQtyInput = document.getElementById("supplierQty");

    if (
        !supplierInput ||
        !productNameInput ||
        !productCodeInput ||
        !supplierQtyInput
    ) {
        notificationManager.error("Không tìm thấy form");
        return;
    }

    const supplier = sanitizeInput(supplierInput.value);
    const productName = sanitizeInput(productNameInput.value);
    const productCode = sanitizeInput(productCodeInput.value);
    const supplierQty = parseInt(supplierQtyInput.value) || 0;

    // Validation
    if (!supplier || !productName || !productCode) {
        notificationManager.warning("Vui lòng điền đầy đủ thông tin");
        return;
    }

    if (supplierQty < 0) {
        notificationManager.error("Số lượng không hợp lệ");
        return;
    }

    // Check for duplicate product code
    const isDuplicate = window.inventoryData.some(
        (item) => item.productCode.toLowerCase() === productCode.toLowerCase(),
    );

    if (isDuplicate) {
        if (
            !confirm(
                `Mã sản phẩm "${productCode}" đã tồn tại. Bạn có muốn thêm mới không?`,
            )
        ) {
            return;
        }
    }

    // Create new item
    const newItem = {
        id: generateId(),
        dateCell: Date.now(),
        supplier: supplier,
        productName: productName,
        productCode: productCode,
        supplierQty: supplierQty,
        customerOrders: 0,
        orderCodes: [],
        createdBy: getAuthState().userType,
        createdAt: Date.now(),
        editHistory: [],
    };

    const addingId = notificationManager.saving("Đang thêm sản phẩm...");

    try {
        // Add to Firebase
        if (window.isFirebaseInitialized()) {
            const firebaseId = await window.firebaseService.addItem(newItem);
            console.log("✓ Product added with Firebase ID:", firebaseId);

            // Don't manually update - let real-time listener handle it
            // Or if no real-time listener, reload data
            if (!realtimeUnsubscribe) {
                await loadInventoryData();
            }
        } else {
            // Fallback to local storage
            window.inventoryData = [newItem, ...window.inventoryData];
            setCachedData(window.inventoryData);
            applyFilters();
            renderOrderStatistics();
        }

        // Log action
        logAction("add", `Thêm sản phẩm: ${productName} (${productCode})`);

        // Cleanup
        clearForm();
        const formSection = document.getElementById("formSection");
        if (formSection) formSection.classList.add("hidden");

        const toggleBtn = document.getElementById("toggleFormBtn");
        if (toggleBtn) {
            const btnText = toggleBtn.querySelector("span");
            if (btnText) btnText.textContent = "Thêm SP";
        }

        notificationManager.remove(addingId);
        notificationManager.success(`Đã thêm "${productName}" thành công!`);

        // Auto-focus on first input for quick data entry
        setTimeout(() => {
            const firstInput = document.getElementById("supplier");
            if (firstInput && !formSection.classList.contains("hidden")) {
                firstInput.focus();
            }
        }, 100);
    } catch (error) {
        console.error("Error adding product:", error);
        notificationManager.remove(addingId);
        notificationManager.error("Lỗi thêm sản phẩm: " + error.message);
    }
}

// Clear form
function clearForm() {
    const supplierInput = document.getElementById("supplier");
    const productNameInput = document.getElementById("productName");
    const productCodeInput = document.getElementById("productCode");
    const supplierQtyInput = document.getElementById("supplierQty");

    if (supplierInput) supplierInput.value = "";
    if (productNameInput) productNameInput.value = "";
    if (productCodeInput) productCodeInput.value = "";
    if (supplierQtyInput) supplierQtyInput.value = "";
}

// Initialize header buttons
function initHeaderButtons() {
    const exportBtn = document.getElementById("exportBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (exportBtn) {
        exportBtn.addEventListener("click", handleExport);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }
}

// Handle export
function handleExport() {
    const filteredData = getFilteredData();

    if (!filteredData || filteredData.length === 0) {
        notificationManager.warning("Không có dữ liệu để xuất");
        return;
    }

    const filename = `inventory_${getTodayVN()}.csv`;
    exportToCSV(filteredData, filename);

    // Log export action
    logAction("export", `Xuất ${filteredData.length} sản phẩm ra CSV`);

    notificationManager.success(`Đã xuất ${filteredData.length} sản phẩm`);
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
    // Unsubscribe from real-time listener
    if (realtimeUnsubscribe) {
        realtimeUnsubscribe();
        console.log("Real-time listener unsubscribed");
    }

    // Save current data before leaving
    if (window.inventoryData && window.inventoryData.length > 0) {
        setCachedData(window.inventoryData);
        console.log("Data saved before page unload");
    }
});

// Handle online/offline status
window.addEventListener("online", () => {
    notificationManager.success("Đã kết nối mạng - Đang đồng bộ...");
    updateSyncStatus();
    console.log("✓ Online");

    // Reload data from Firebase
    if (window.isFirebaseInitialized()) {
        loadInventoryData();
    }
});

window.addEventListener("offline", () => {
    notificationManager.info("Mất kết nối mạng - Dữ liệu được lưu cục bộ");
    updateSyncStatus();
    console.log("⚠ Offline - Working in local mode");
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + K: Toggle form
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        toggleForm();
    }

    // Ctrl/Cmd + S: Save/Export
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleExport();
    }
});

// Debug commands
window.showData = () => {
    console.table(window.inventoryData);
    return window.inventoryData;
};

window.clearData = async () => {
    if (confirm("Clear all data? This cannot be undone!")) {
        if (window.isFirebaseInitialized()) {
            const itemIds = window.inventoryData.map((item) => item.id);
            await window.firebaseService.deleteMultipleItems(itemIds);
        }
        window.inventoryData = [];
        setCachedData([]);
        applyFilters();
        renderOrderStatistics();
        console.log("✓ All data cleared");
    }
};

window.syncData = async () => {
    if (window.isFirebaseInitialized()) {
        await loadInventoryData();
        console.log("✓ Data synced from Firebase");
    } else {
        console.log("⚠ Firebase not initialized");
    }
};

// Export main functions
window.loadInventoryData = loadInventoryData;
window.handleSubmitProduct = handleSubmitProduct;
window.toggleForm = toggleForm;
window.clearForm = clearForm;
window.handleExport = handleExport;
window.updateSyncStatus = updateSyncStatus;

console.log("✓ Main module with Firebase loaded");
console.log("💡 Tip: Type syncData() in console to sync with Firebase");
