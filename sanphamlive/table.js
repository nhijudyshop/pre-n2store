// js/table.js - Table Management with Inline Order Code Input

function renderTable(data) {
    const tableBody = document.getElementById("tableBody");
    if (!tableBody) return;

    // Clear existing rows
    tableBody.innerHTML = "";

    if (!data || data.length === 0) {
        const emptyRow = document.createElement("tr");
        emptyRow.innerHTML =
            '<td colspan="8" class="text-center">Không có dữ liệu</td>';
        tableBody.appendChild(emptyRow);
        return;
    }

    // Sort by date (newest first)
    const sortedData = [...data].sort((a, b) => b.dateCell - a.dateCell);

    // Render rows
    sortedData.forEach((item) => {
        const row = createTableRow(item);
        tableBody.appendChild(row);
    });

    // Reinitialize icons
    initIcons();
}

function createTableRow(item) {
    const row = document.createElement("tr");

    // Add visual indicator for unsynced items
    const isLocalId = item.id && item.id.includes("_");
    if (isLocalId && window.isFirebaseInitialized()) {
        row.style.background = "#fff3cd";
        row.title = "Sản phẩm đang đồng bộ...";
    }

    // Date
    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(item.dateCell);
    row.appendChild(dateCell);

    // Supplier
    const supplierCell = document.createElement("td");
    supplierCell.textContent = item.supplier || "-";
    row.appendChild(supplierCell);

    // Product Name
    const nameCell = document.createElement("td");
    nameCell.textContent = item.productName || "-";
    row.appendChild(nameCell);

    // Product Code (with copy button)
    const codeCell = document.createElement("td");
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.innerHTML = `
        <i data-lucide="copy"></i>
        <span>${item.productCode || "-"}</span>
    `;
    copyBtn.addEventListener("click", () =>
        handleCopyCode(item.productCode, copyBtn),
    );
    codeCell.appendChild(copyBtn);
    row.appendChild(codeCell);

    // Supplier Quantity
    const supplierQtyCell = document.createElement("td");
    supplierQtyCell.className = "text-center";
    supplierQtyCell.innerHTML = `<span class="qty-badge">${item.supplierQty || 0}</span>`;
    row.appendChild(supplierQtyCell);

    // Customer Orders
    const customerQtyCell = document.createElement("td");
    customerQtyCell.className = "text-center";
    customerQtyCell.innerHTML = `<span class="qty-badge customer-qty">${item.customerOrders || 0}</span>`;
    row.appendChild(customerQtyCell);

    // Order Codes
    const orderCodesCell = document.createElement("td");
    orderCodesCell.appendChild(createOrderCodesElement(item));
    row.appendChild(orderCodesCell);

    // Actions
    const actionsCell = document.createElement("td");
    actionsCell.className = "text-center";
    actionsCell.appendChild(createActionButtons(item));
    row.appendChild(actionsCell);

    return row;
}

function createOrderCodesElement(item) {
    const container = document.createElement("div");
    container.className = "order-codes-container";
    container.setAttribute("data-item-id", item.id);

    // Order codes list
    const listWrapper = document.createElement("div");
    listWrapper.className = "order-codes-list-wrapper";

    if (!item.orderCodes || item.orderCodes.length === 0) {
        const noOrders = document.createElement("div");
        noOrders.className = "no-orders";
        noOrders.textContent = "Chưa có đơn hàng";
        listWrapper.appendChild(noOrders);
    } else {
        const orderList = document.createElement("div");
        orderList.className = "order-code-list";

        item.orderCodes.forEach((code) => {
            const orderItem = document.createElement("div");
            orderItem.className = "order-code-item";

            const codeText = document.createElement("span");
            codeText.className = "order-code-text";
            codeText.textContent = code;

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-order-btn";
            deleteBtn.innerHTML = '<i data-lucide="x"></i>';
            deleteBtn.addEventListener("click", () =>
                handleDeleteOrderCode(item.id, code),
            );

            orderItem.appendChild(codeText);
            orderItem.appendChild(deleteBtn);
            orderList.appendChild(orderItem);
        });

        listWrapper.appendChild(orderList);
    }

    container.appendChild(listWrapper);

    // Inline input form (hidden by default)
    const inlineForm = document.createElement("div");
    inlineForm.className = "inline-order-form hidden";
    inlineForm.innerHTML = `
        <div class="inline-input-group">
            <input 
                type="text" 
                class="inline-order-input" 
                placeholder="Nhập mã ĐH..."
                data-item-id="${item.id}"
            />
            <button class="inline-btn inline-save-btn" data-item-id="${item.id}">
                <i data-lucide="check"></i>
            </button>
            <button class="inline-btn inline-cancel-btn" data-item-id="${item.id}">
                <i data-lucide="x"></i>
            </button>
        </div>
    `;
    container.appendChild(inlineForm);

    // Add order button
    const addBtn = document.createElement("button");
    addBtn.className = "add-order-btn";
    addBtn.setAttribute("data-item-id", item.id);
    addBtn.innerHTML = '<i data-lucide="plus"></i><span>Thêm ĐH</span>';
    addBtn.addEventListener("click", () => showInlineInput(item.id));
    container.appendChild(addBtn);

    // Event listeners for inline form
    const input = inlineForm.querySelector(".inline-order-input");
    const saveBtn = inlineForm.querySelector(".inline-save-btn");
    const cancelBtn = inlineForm.querySelector(".inline-cancel-btn");

    if (input) {
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleInlineAddOrderCode(item.id);
            } else if (e.key === "Escape") {
                hideInlineInput(item.id);
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", () =>
            handleInlineAddOrderCode(item.id),
        );
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => hideInlineInput(item.id));
    }

    return container;
}

function showInlineInput(itemId) {
    const container = document.querySelector(
        `.order-codes-container[data-item-id="${itemId}"]`,
    );
    if (!container) return;

    const addBtn = container.querySelector(".add-order-btn");
    const inlineForm = container.querySelector(".inline-order-form");
    const input = inlineForm.querySelector(".inline-order-input");

    // Hide add button, show inline form
    if (addBtn) addBtn.classList.add("hidden");
    if (inlineForm) {
        inlineForm.classList.remove("hidden");
        if (input) {
            input.value = "";
            input.focus();
        }
    }

    // Reinitialize icons
    initIcons();
}

function hideInlineInput(itemId) {
    const container = document.querySelector(
        `.order-codes-container[data-item-id="${itemId}"]`,
    );
    if (!container) return;

    const addBtn = container.querySelector(".add-order-btn");
    const inlineForm = container.querySelector(".inline-order-form");
    const input = inlineForm.querySelector(".inline-order-input");

    // Show add button, hide inline form
    if (addBtn) addBtn.classList.remove("hidden");
    if (inlineForm) inlineForm.classList.add("hidden");
    if (input) input.value = "";
}

async function handleInlineAddOrderCode(itemId) {
    const container = document.querySelector(
        `.order-codes-container[data-item-id="${itemId}"]`,
    );
    if (!container) return;

    const input = container.querySelector(".inline-order-input");
    if (!input) return;

    const orderCode = sanitizeInput(input.value);

    if (!orderCode) {
        notificationManager.warning("Vui lòng nhập mã đơn hàng");
        input.focus();
        return;
    }

    // Không hiện overlay, chỉ hiện notification nhẹ
    // const addingId = notificationManager.info("Đang thêm...", 1000);

    try {
        // Find the item in current data
        const item = window.inventoryData.find((i) => i.id === itemId);

        if (!item) {
            notificationManager.error("Không tìm thấy sản phẩm");
            return;
        }

        // Add order code to Firebase
        if (window.isFirebaseInitialized()) {
            // Check if this is a Firebase ID (not local ID)
            if (!window.isFirebaseId(itemId)) {
                notificationManager.error(
                    "Sản phẩm này chưa được đồng bộ lên Firebase. Vui lòng refresh trang.",
                );
                console.log("Local ID detected:", itemId);
                hideInlineInput(itemId);
                return;
            }

            await window.firebaseService.addOrderCode(itemId, orderCode);
        } else {
            // Fallback to local update
            const inventory = window.inventoryData || [];
            const updatedInventory = inventory.map((item) => {
                if (item.id === itemId) {
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

        // Hide inline form
        hideInlineInput(itemId);

        // Chỉ hiện notification khi thành công
        notificationManager.success("Đã thêm mã đơn hàng!");
    } catch (error) {
        console.error("Error adding order code:", error);

        if (error.message && error.message.includes("No document to update")) {
            notificationManager.error(
                "Sản phẩm chưa tồn tại trong Firebase. Vui lòng refresh trang và thử lại.",
            );
        } else {
            notificationManager.error("Lỗi thêm mã đơn hàng: " + error.message);
        }
    }
}

function createActionButtons(item) {
    const container = document.createElement("div");
    container.className = "action-buttons";

    // Edit button (Level 1+)
    if (hasPermission(1)) {
        const editBtn = document.createElement("button");
        editBtn.className = "action-btn edit-btn";
        editBtn.innerHTML = '<i data-lucide="edit-2"></i>';
        editBtn.title = "Chỉnh sửa";
        editBtn.addEventListener("click", () => openEditModal(item));
        container.appendChild(editBtn);
    }

    // Delete button (Admin only)
    if (hasPermission(0)) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "action-btn delete-btn";
        deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        deleteBtn.title = "Xóa";
        deleteBtn.addEventListener("click", () => handleDeleteItem(item.id));
        container.appendChild(deleteBtn);
    }

    return container;
}

function handleCopyCode(code, button) {
    copyToClipboard(code);

    // Visual feedback
    button.classList.add("copied");
    const icon = button.querySelector("i");
    if (icon) {
        icon.setAttribute("data-lucide", "check");
        initIcons();
    }

    setTimeout(() => {
        button.classList.remove("copied");
        if (icon) {
            icon.setAttribute("data-lucide", "copy");
            initIcons();
        }
    }, 2000);

    notificationManager.success("Đã copy mã sản phẩm!");
}

async function handleDeleteItem(itemId) {
    if (!hasPermission(0)) {
        notificationManager.error("Không có quyền xóa");
        return;
    }

    if (!confirm("Bạn có chắc muốn xóa sản phẩm này?")) {
        return;
    }

    const deletingId = notificationManager.deleting("Đang xóa sản phẩm...");

    try {
        // Delete from Firebase
        if (window.isFirebaseInitialized()) {
            await window.firebaseService.deleteItem(itemId);
        } else {
            // Fallback to local delete
            const inventory = window.inventoryData || [];
            const updatedInventory = inventory.filter(
                (item) => item.id !== itemId,
            );
            window.inventoryData = updatedInventory;
            setCachedData(updatedInventory);
        }

        logAction("delete", "Xóa sản phẩm");

        if (!window.isFirebaseInitialized()) {
            applyFilters();
            renderOrderStatistics();
        }

        notificationManager.remove(deletingId);
        notificationManager.success("Đã xóa sản phẩm!");
    } catch (error) {
        console.error("Error deleting item:", error);
        notificationManager.remove(deletingId);
        notificationManager.error("Lỗi xóa sản phẩm: " + error.message);
    }
}

async function handleDeleteOrderCode(itemId, orderCode) {
    if (!confirm(`Bạn có chắc muốn xóa mã đơn hàng "${orderCode}"?`)) {
        return;
    }

    const deletingId = notificationManager.processing(
        "Đang xóa mã đơn hàng...",
    );

    try {
        // Delete from Firebase
        if (window.isFirebaseInitialized()) {
            await window.firebaseService.removeOrderCode(itemId, orderCode);
        } else {
            // Fallback to local delete
            const inventory = window.inventoryData || [];
            const updatedInventory = inventory.map((item) => {
                if (item.id === itemId) {
                    const newOrderCodes = item.orderCodes.filter(
                        (code) => code !== orderCode,
                    );
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
        }

        logAction("delete_order_code", `Xóa mã đơn hàng: ${orderCode}`);

        if (!window.isFirebaseInitialized()) {
            applyFilters();
            renderOrderStatistics();
        }

        notificationManager.remove(deletingId);
        notificationManager.success("Đã xóa mã đơn hàng!");
    } catch (error) {
        console.error("Error deleting order code:", error);
        notificationManager.remove(deletingId);
        notificationManager.error("Lỗi xóa mã đơn hàng: " + error.message);
    }
}

// Export functions
window.renderTable = renderTable;
window.createTableRow = createTableRow;
window.handleCopyCode = handleCopyCode;
window.handleDeleteItem = handleDeleteItem;
window.handleDeleteOrderCode = handleDeleteOrderCode;
window.showInlineInput = showInlineInput;
window.hideInlineInput = hideInlineInput;
window.handleInlineAddOrderCode = handleInlineAddOrderCode;
