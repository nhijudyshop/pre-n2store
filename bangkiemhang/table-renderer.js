// =====================================================
// TABLE RENDERING WITH NEW GROUPING LOGIC
// =====================================================

function renderInventoryTable(inventoryData) {
    const tbody = document.getElementById("orderTableBody");
    if (!tbody) {
        console.error("Table body not found");
        return;
    }

    const filteredData = applyFiltersToInventory(inventoryData);
    tbody.innerHTML = "";

    // Group data by supplier and order date
    const groupedData = groupBySupplierAndDate(filteredData);
    renderGroupedData(groupedData, tbody);

    updateStatistics(filteredData);

    // Initialize Lucide icons after rendering table
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function groupBySupplierAndDate(data) {
    const grouped = new Map();

    data.forEach((item) => {
        const key = `${item.nhaCungCap}_${item.ngayDatHang}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                supplier: item.nhaCungCap,
                orderDate: item.ngayDatHang,
                items: [],
            });
        }
        grouped.get(key).items.push(item);
    });

    return Array.from(grouped.values());
}

function renderGroupedData(groupedData, tbody) {
    groupedData.forEach((group) => {
        const itemCount = group.items.length;

        group.items.forEach((item, index) => {
            const tr = document.createElement("tr");
            tr.className = "inventory-row supplier-group";
            tr.setAttribute("data-inventory-id", item.id || "");

            // Create cells
            const cells = [];
            for (let j = 0; j < 9; j++) {
                cells[j] = document.createElement("td");
            }

            // Ngày đặt hàng - merge cells for same supplier+date
            if (index === 0) {
                cells[0].textContent = item.ngayDatHang || "Chưa nhập";
                cells[0].rowSpan = itemCount;
                cells[0].className = "date-cell";
                tr.appendChild(cells[0]);
            }

            // Nhà cung cấp - merge cells for same supplier+date
            if (index === 0) {
                cells[1].textContent = sanitizeInput(item.nhaCungCap || "");
                cells[1].rowSpan = itemCount;
                cells[1].className = "supplier-cell";
                tr.appendChild(cells[1]);
            }

            // Ngày nhận hàng
            const receivedDate = parseVietnameseDate(item.ngayNhan);
            if (receivedDate) {
                cells[2].textContent = formatDate(receivedDate);
            } else {
                cells[2].textContent = item.ngayNhan || "Chưa nhập";
            }
            tr.appendChild(cells[2]);

            // Mã sản phẩm
            cells[3].textContent = sanitizeInput(item.maSanPham || "");
            tr.appendChild(cells[3]);

            // Tên sản phẩm
            cells[4].textContent = sanitizeInput(item.tenSanPham || "");
            tr.appendChild(cells[4]);

            // Số lượng đặt
            const quantityDiv = document.createElement("div");
            quantityDiv.textContent = item.soLuong || 0;
            quantityDiv.style.textAlign = "center";
            quantityDiv.style.fontWeight = "bold";
            cells[5].appendChild(quantityDiv);
            tr.appendChild(cells[5]);

            // Thực nhận
            const receivedContainer = document.createElement("div");
            const receivedLabel = document.createElement("span");
            receivedLabel.className = "received-label";
            if (item.thucNhan || item.thucNhan === 0) {
                receivedLabel.textContent = item.thucNhan;
                addQuantityStatusClass(
                    receivedLabel,
                    item.thucNhan,
                    item.soLuong,
                );
            } else {
                receivedLabel.textContent = "Chưa nhập";
                receivedLabel.classList.add("empty");
            }
            receivedLabel.setAttribute("data-field", "thucNhan");
            receivedLabel.setAttribute("data-inventory-id", item.id || "");
            receivedContainer.appendChild(receivedLabel);
            cells[6].appendChild(receivedContainer);
            tr.appendChild(cells[6]);

            // Tổng nhận
            const totalContainer = document.createElement("div");
            const totalLabel = document.createElement("span");
            totalLabel.className = "total-label";
            if (item.tongNhan || item.tongNhan === 0) {
                totalLabel.textContent = item.tongNhan;
                addQuantityStatusClass(totalLabel, item.tongNhan, item.soLuong);
            } else {
                totalLabel.textContent = "Chưa nhập";
                totalLabel.classList.add("empty");
            }
            totalLabel.setAttribute("data-field", "tongNhan");
            totalLabel.setAttribute("data-inventory-id", item.id || "");
            totalContainer.appendChild(totalLabel);
            cells[7].appendChild(totalContainer);
            tr.appendChild(cells[7]);

            // Action buttons with Lucide icons
            const buttonGroup = document.createElement("div");
            buttonGroup.className = "button-group";

            const editButton = document.createElement("button");
            editButton.className = "edit-button";
            editButton.setAttribute("data-inventory-id", item.id || "");
            editButton.setAttribute(
                "data-inventory-info",
                `${sanitizeInput(item.tenSanPham || item.maSanPham || "Unknown")}`,
            );
            editButton.innerHTML = '<i data-lucide="edit-3"></i>';
            editButton.addEventListener("click", editInventoryItem);

            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-button";
            deleteButton.setAttribute("data-inventory-id", item.id || "");
            deleteButton.setAttribute(
                "data-inventory-info",
                `${sanitizeInput(item.tenSanPham || item.maSanPham || "Unknown")}`,
            );
            deleteButton.innerHTML = '<i data-lucide="trash-2"></i>';
            deleteButton.addEventListener("click", deleteInventoryItem);

            buttonGroup.appendChild(editButton);
            buttonGroup.appendChild(deleteButton);
            cells[8].appendChild(buttonGroup);
            tr.appendChild(cells[8]);

            // Apply permissions
            const auth = getAuthState();
            if (auth) {
                const editableElements = [receivedLabel, totalLabel];
                applyRowPermissions(
                    tr,
                    editableElements,
                    [editButton, deleteButton],
                    parseInt(auth.checkLogin),
                );
            }

            tbody.appendChild(tr);
        });
    });
}

function applyRowPermissions(row, editableElements, buttons, userRole) {
    if (userRole !== 0) {
        editableElements.forEach((element) => {
            element.style.opacity = "0.6";
            element.style.cursor = "not-allowed";
        });
        buttons.forEach((button) => (button.style.display = "none"));
        row.style.opacity = "0.7";
    } else {
        editableElements.forEach((element) => {
            element.style.opacity = "1";
            element.style.cursor = "pointer";
        });
        buttons.forEach((button) => (button.style.display = ""));
        row.style.opacity = "1";
    }
}

function updateStatistics(inventoryData) {
    const totalProducts = document.getElementById("totalProducts");
    const completedProducts = document.getElementById("completedProducts");
    const partialProducts = document.getElementById("partialProducts");
    const pendingProducts = document.getElementById("pendingProducts");

    if (!inventoryData || !Array.isArray(inventoryData)) return;

    let total = inventoryData.length;
    let completed = 0;
    let partial = 0;
    let pending = 0;

    inventoryData.forEach((item) => {
        const ordered = item.soLuong || 0;
        const received = (item.thucNhan || 0) + (item.tongNhan || 0);

        if (received >= ordered && received > 0) {
            completed++;
        } else if (received > 0 && received < ordered) {
            partial++;
        } else {
            pending++;
        }
    });

    if (totalProducts) totalProducts.textContent = total;
    if (completedProducts) completedProducts.textContent = completed;
    if (partialProducts) partialProducts.textContent = partial;
    if (pendingProducts) pendingProducts.textContent = pending;
}

function addQuantityStatusClass(element, receivedQty, orderedQty) {
    // Remove existing status classes
    element.classList.remove(
        "over-quantity",
        "under-quantity",
        "exact-quantity",
    );

    if (receivedQty > orderedQty) {
        element.classList.add("over-quantity");
    } else if (receivedQty < orderedQty && receivedQty > 0) {
        element.classList.add("under-quantity");
    } else if (receivedQty === orderedQty && receivedQty > 0) {
        element.classList.add("exact-quantity");
    }
}

console.log("Table renderer system loaded");
