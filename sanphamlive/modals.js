// js/modals.js - Modal Management with Firebase Integration

let currentEditingItem = null;
let currentOrderItemId = null;

function initModals() {
    // Edit Modal
    const editModal = document.getElementById("editModal");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const saveEditBtn = document.getElementById("saveEditBtn");
    const cancelEditBtn = document.getElementById("cancelEditBtn");

    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", closeEditModal);
    }

    if (saveEditBtn) {
        saveEditBtn.addEventListener("click", handleSaveEdit);
    }

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener("click", closeEditModal);
    }

    // Order Modal
    const orderModal = document.getElementById("orderModal");
    const closeOrderModalBtn = document.getElementById("closeOrderModalBtn");
    const addOrderCodeBtn = document.getElementById("addOrderCodeBtn");
    const newOrderCodeInput = document.getElementById("newOrderCode");

    if (closeOrderModalBtn) {
        closeOrderModalBtn.addEventListener("click", closeOrderModal);
    }

    if (addOrderCodeBtn) {
        addOrderCodeBtn.addEventListener("click", handleAddOrderCode);
    }

    if (newOrderCodeInput) {
        newOrderCodeInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                handleAddOrderCode();
            }
        });
    }

    // Close modals on background click
    if (editModal) {
        editModal.addEventListener("click", (e) => {
            if (e.target === editModal) {
                closeEditModal();
            }
        });
    }

    if (orderModal) {
        orderModal.addEventListener("click", (e) => {
            if (e.target === orderModal) {
                closeOrderModal();
            }
        });
    }

    // Close modals on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeEditModal();
            closeOrderModal();
        }
    });
}

// Edit Modal Functions
function openEditModal(item) {
    currentEditingItem = { ...item };

    const editSupplier = document.getElementById("editSupplier");
    const editProductName = document.getElementById("editProductName");
    const editProductCode = document.getElementById("editProductCode");
    const editSupplierQty = document.getElementById("editSupplierQty");

    if (editSupplier) editSupplier.value = item.supplier || "";
    if (editProductName) editProductName.value = item.productName || "";
    if (editProductCode) editProductCode.value = item.productCode || "";
    if (editSupplierQty) editSupplierQty.value = item.supplierQty || 0;

    const editModal = document.getElementById("editModal");
    if (editModal) {
        editModal.classList.remove("hidden");
        initIcons();

        // Focus first input
        if (editSupplier) editSupplier.focus();
    }
}

function closeEditModal() {
    const editModal = document.getElementById("editModal");
    if (editModal) {
        editModal.classList.add("hidden");
    }
    currentEditingItem = null;
}

async function handleSaveEdit() {
    const editSupplier = document.getElementById("editSupplier");
    const editProductName = document.getElementById("editProductName");
    const editProductCode = document.getElementById("editProductCode");
    const editSupplierQty = document.getElementById("editSupplierQty");

    if (
        !editSupplier ||
        !editProductName ||
        !editProductCode ||
        !editSupplierQty
    ) {
        notificationManager.error("Không tìm thấy form chỉnh sửa");
        return;
    }

    const supplier = sanitizeInput(editSupplier.value);
    const productName = sanitizeInput(editProductName.value);
    const productCode = sanitizeInput(editProductCode.value);
    const supplierQty = parseInt(editSupplierQty.value) || 0;

    if (!supplier || !productName || !productCode) {
        notificationManager.warning("Vui lòng điền đầy đủ thông tin");
        return;
    }

    if (supplierQty < 0) {
        notificationManager.error("Số lượng không hợp lệ");
        return;
    }

    const savingId = notificationManager.saving("Đang cập nhật sản phẩm...");

    try {
        const updates = {
            supplier: supplier,
            productName: productName,
            productCode: productCode,
            supplierQty: supplierQty,
            editHistory: [
                ...(currentEditingItem.editHistory || []),
                {
                    timestamp: new Date().toISOString(),
                    editedBy: getAuthState().userType,
                    changes: "Chỉnh sửa thông tin sản phẩm",
                },
            ],
        };

        // Update in Firebase
        if (window.isFirebaseInitialized()) {
            await window.firebaseService.updateItem(
                currentEditingItem.id,
                updates,
            );
        } else {
            // Fallback to local update
            const inventory = window.inventoryData || [];
            const updatedInventory = inventory.map((item) => {
                if (item.id === currentEditingItem.id) {
                    return { ...item, ...updates };
                }
                return item;
            });
            window.inventoryData = updatedInventory;
            setCachedData(updatedInventory);
        }

        logAction("edit", `Chỉnh sửa sản phẩm: ${productName}`);

        closeEditModal();

        if (!window.isFirebaseInitialized()) {
            applyFilters();
        }

        notificationManager.remove(savingId);
        notificationManager.success("Đã cập nhật sản phẩm!");
    } catch (error) {
        console.error("Error updating item:", error);
        notificationManager.remove(savingId);
        notificationManager.error("Lỗi cập nhật: " + error.message);
    }
}

// Order Modal Functions
function openOrderModal(itemId) {
    currentOrderItemId = itemId;

    const newOrderCodeInput = document.getElementById("newOrderCode");
    if (newOrderCodeInput) {
        newOrderCodeInput.value = "";
        newOrderCodeInput.focus();
    }

    const orderModal = document.getElementById("orderModal");
    if (orderModal) {
        orderModal.classList.remove("hidden");
        initIcons();
    }
}

function closeOrderModal() {
    const orderModal = document.getElementById("orderModal");
    if (orderModal) {
        orderModal.classList.add("hidden");
    }
    currentOrderItemId = null;
}

async function handleAddOrderCode() {
    const newOrderCodeInput = document.getElementById("newOrderCode");
    if (!newOrderCodeInput) return;

    const orderCode = sanitizeInput(newOrderCodeInput.value);

    if (!orderCode) {
        notificationManager.warning("Vui lòng nhập mã đơn hàng");
        return;
    }

    const addingId = notificationManager.processing("Đang thêm mã đơn hàng...");

    try {
        // Find the item in current data
        const item = window.inventoryData.find(
            (i) => i.id === currentOrderItemId,
        );

        if (!item) {
            notificationManager.remove(addingId);
            notificationManager.error("Không tìm thấy sản phẩm");
            return;
        }

        // Add order code to Firebase
        if (window.isFirebaseInitialized()) {
            // Check if this is a Firebase ID (not local ID)
            if (!window.isFirebaseId(currentOrderItemId)) {
                notificationManager.remove(addingId);
                notificationManager.error(
                    "Sản phẩm này chưa được đồng bộ lên Firebase. Vui lòng refresh trang.",
                );
                console.log("Local ID detected:", currentOrderItemId);
                closeOrderModal();
                return;
            }

            await window.firebaseService.addOrderCode(
                currentOrderItemId,
                orderCode,
            );
        } else {
            // Fallback to local update
            const inventory = window.inventoryData || [];
            const updatedInventory = inventory.map((item) => {
                if (item.id === currentOrderItemId) {
                    const newOrderCodes = [
                        ...(item.orderCodes || []),
                        orderCode,
                    ];
                    return {
                        ...item,
                        orderCodes: newOrderCodes,
                        customerOrders: newOrderCodes.length,
                    };
                }
                return item;
            });
            window.inventoryData = updatedInventory;
            setCachedData(updatedInventory);
            applyFilters();
            renderOrderStatistics();
        }

        logAction("add_order_code", `Thêm mã đơn hàng: ${orderCode}`);

        closeOrderModal();

        notificationManager.remove(addingId);
        notificationManager.success("Đã thêm mã đơn hàng!");
    } catch (error) {
        console.error("Error adding order code:", error);
        notificationManager.remove(addingId);

        if (error.message && error.message.includes("No document to update")) {
            notificationManager.error(
                "Sản phẩm chưa tồn tại trong Firebase. Vui lòng refresh trang và thử lại.",
            );
        } else {
            notificationManager.error("Lỗi thêm mã đơn hàng: " + error.message);
        }
    }
}

// Export functions
window.initModals = initModals;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.openOrderModal = openOrderModal;
window.closeOrderModal = closeOrderModal;
