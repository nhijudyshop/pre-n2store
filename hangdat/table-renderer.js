// =====================================================
// TABLE RENDERING WITH CHECKBOX FOR BULK DELETE
// =====================================================

function renderInventoryTable(inventoryData) {
    const tbody = document.getElementById("orderTableBody");
    if (!tbody) {
        console.error("Table body not found");
        return;
    }

    const filteredData = applyFiltersToInventory(inventoryData);
    tbody.innerHTML = "";

    // Add summary row
    if (filteredData.length > 0) {
        const summaryRow = document.createElement("tr");
        summaryRow.className = "summary-row";
        const summaryTd = document.createElement("td");
        summaryTd.colSpan = 12;
        summaryTd.innerHTML = `Hiển thị: <strong>${filteredData.length}</strong> sản phẩm`;
        summaryRow.appendChild(summaryTd);
        tbody.appendChild(summaryRow);
    }

    // Group data by supplier and order date
    const groupedData = groupBySupplierAndDate(filteredData);
    renderGroupedDataWithCheckbox(groupedData, tbody);

    updateStatistics(filteredData);
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

function renderGroupedDataWithCheckbox(groupedData, tbody) {
    groupedData.forEach((group) => {
        const itemCount = group.items.length;

        group.items.forEach((item, index) => {
            const tr = document.createElement("tr");
            tr.className = "inventory-row supplier-group";
            tr.setAttribute("data-inventory-id", item.id || "");

            // Add TPOS Product ID if exists
            if (item.tposProductId) {
                tr.setAttribute("id", `tpos-${item.tposProductId}`);
                tr.setAttribute("data-tpos-id", item.tposProductId);
            }

            // Create cells array (12 cells including checkbox)
            const cells = [];
            for (let j = 0; j < 12; j++) {
                cells[j] = document.createElement("td");
            }

            // 0. Checkbox column
            cells[0].className = "checkbox-cell";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "row-checkbox";
            checkbox.dataset.itemId = item.id || "";
            checkbox.addEventListener("change", function () {
                if (this.checked) {
                    tr.classList.add("selected");
                } else {
                    tr.classList.remove("selected");
                }
            });
            cells[0].appendChild(checkbox);
            tr.appendChild(cells[0]);

            // 1. Ngày đặt hàng - merge cells for same supplier+date
            if (index === 0) {
                cells[1].textContent = item.ngayDatHang || "Chưa nhập";
                cells[1].rowSpan = itemCount;
                cells[1].className = "date-cell";
                tr.appendChild(cells[1]);
            }

            // 2. Nhà cung cấp - merge cells for same supplier+date
            if (index === 0) {
                cells[2].textContent = sanitizeInput(item.nhaCungCap || "");
                cells[2].rowSpan = itemCount;
                cells[2].className = "supplier-cell";
                tr.appendChild(cells[2]);
            }

            // 3. Hóa đơn (combined: image on top, text below)
            if (index === 0) {
                const invoiceContainer = document.createElement("div");
                invoiceContainer.className = "combined-cell";

                const invoiceImageUrl =
                    item.anhHoaDon || item.invoiceImage || item.invoice_image;

                if (invoiceImageUrl) {
                    const invoiceImg = document.createElement("img");
                    invoiceImg.src = invoiceImageUrl;
                    invoiceImg.className = "cell-image product-image";
                    invoiceImg.alt = "Hóa đơn";
                    invoiceImg.style.cursor = "pointer";
                    invoiceImg.onclick = () => openImageModal(invoiceImageUrl);
                    invoiceImg.onerror = function () {
                        console.error(
                            "Failed to load invoice image:",
                            invoiceImageUrl,
                        );
                        this.style.display = "none";
                    };
                    invoiceContainer.appendChild(invoiceImg);
                }

                const invoiceText = document.createElement("div");
                invoiceText.className = "cell-text";
                invoiceText.textContent =
                    item.hoaDon || item.invoice || "Chưa có";
                invoiceContainer.appendChild(invoiceText);

                cells[3].appendChild(invoiceContainer);
                cells[3].rowSpan = itemCount;
                tr.appendChild(cells[3]);
            }

            // 4. Tên sản phẩm
            cells[4].textContent = sanitizeInput(item.tenSanPham || "");
            tr.appendChild(cells[4]);

            // 5. Mã sản phẩm
            cells[5].textContent = sanitizeInput(item.maSanPham || "");
            tr.appendChild(cells[5]);

            // 6. Biến thể
            cells[6].textContent = sanitizeInput(item.bienThe || "");
            tr.appendChild(cells[6]);

            // 7. Số lượng
            const quantityContainer = document.createElement("div");
            const quantityLabel = document.createElement("span");
            quantityLabel.className = "quantity-label";
            quantityLabel.textContent = item.soLuong || 0;
            quantityContainer.appendChild(quantityLabel);
            cells[7].appendChild(quantityContainer);
            tr.appendChild(cells[7]);

            // 8. Ảnh sản phẩm + Giá bán
            const productContainer = document.createElement("div");
            productContainer.className = "combined-cell";

            const productImageUrl =
                item.anhSanPham || item.productImage || item.product_image;

            if (productImageUrl) {
                const productImg = document.createElement("img");
                productImg.src = productImageUrl;
                productImg.className = "cell-image product-image";
                productImg.alt = "Sản phẩm";
                productImg.style.cursor = "pointer";
                productImg.onclick = () => openImageModal(productImageUrl);
                productImg.onerror = function () {
                    console.error(
                        "Failed to load product image:",
                        productImageUrl,
                    );
                    this.style.display = "none";
                };
                productContainer.appendChild(productImg);
            }

            const sellPriceText = document.createElement("div");
            sellPriceText.className = "cell-text";
            sellPriceText.textContent =
                item.giaBan > 0
                    ? formatCurrencyWithThousands(item.giaBan)
                    : "Chưa có";
            productContainer.appendChild(sellPriceText);

            cells[8].appendChild(productContainer);
            tr.appendChild(cells[8]);

            // 9. Ảnh giá + Giá mua
            const priceContainer = document.createElement("div");
            priceContainer.className = "combined-cell";

            const priceImageUrl =
                item.anhGiaMua ||
                item.priceImage ||
                item.price_image ||
                item.anhGiaBan;

            if (priceImageUrl) {
                const priceImg = document.createElement("img");
                priceImg.src = priceImageUrl;
                priceImg.className = "cell-image product-image";
                priceImg.alt = "Giá bán";
                priceImg.style.cursor = "pointer";
                priceImg.onclick = () => openImageModal(priceImageUrl);
                priceImg.onerror = function () {
                    console.error("Failed to load price image:", priceImageUrl);
                    this.style.display = "none";
                };
                priceContainer.appendChild(priceImg);
            }

            const buyPriceText = document.createElement("div");
            buyPriceText.className = "cell-text";
            buyPriceText.textContent =
                item.giaMua > 0
                    ? formatCurrencyWithThousands(item.giaMua)
                    : "Chưa có";
            priceContainer.appendChild(buyPriceText);

            cells[9].appendChild(priceContainer);
            tr.appendChild(cells[9]);

            // 10. Ghi chú
            cells[10].textContent = sanitizeInput(item.ghiChu || "");
            cells[10].style.maxWidth = "150px";
            cells[10].style.wordWrap = "break-word";
            tr.appendChild(cells[10]);

            // 11. Thao tác
            const actionContainer = document.createElement("div");
            actionContainer.className = "action-buttons";

            const editButton = document.createElement("button");
            editButton.className = "edit-button";
            editButton.setAttribute("data-inventory-id", item.id || "");
            editButton.setAttribute(
                "data-inventory-info",
                `${sanitizeInput(item.tenSanPham || item.maSanPham || "Unknown")}`,
            );
            editButton.addEventListener("click", editInventoryItem);

            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-button";
            deleteButton.setAttribute("data-inventory-id", item.id || "");
            deleteButton.setAttribute(
                "data-inventory-info",
                `${sanitizeInput(item.tenSanPham || item.maSanPham || "Unknown")}`,
            );
            deleteButton.addEventListener("click", deleteInventoryItem);

            actionContainer.appendChild(editButton);
            actionContainer.appendChild(deleteButton);
            cells[11].appendChild(actionContainer);
            tr.appendChild(cells[11]);

            // Apply permissions
            const auth = getAuthState();
            if (auth) {
                applyRowPermissions(
                    tr,
                    [],
                    [editButton, deleteButton],
                    parseInt(auth.checkLogin),
                );
            }

            tbody.appendChild(tr);
        });
    });

    // Update select all checkbox state
    if (window.bulkDeleteManager) {
        window.bulkDeleteManager.updateSelectAllCheckbox();
    }
}

function applyRowPermissions(row, editableElements, buttons, userRole) {
    if (userRole > 2) {
        editableElements.forEach((element) => {
            element.style.opacity = "0.6";
            element.style.cursor = "not-allowed";
            element.disabled = true;
        });
        buttons.forEach((button) => (button.style.display = "none"));
        row.style.opacity = "0.7";

        // Also disable checkbox for users without permission
        const checkbox = row.querySelector(".row-checkbox");
        if (checkbox) {
            checkbox.disabled = true;
            checkbox.style.cursor = "not-allowed";
        }
    } else {
        editableElements.forEach((element) => {
            element.style.opacity = "1";
            element.style.cursor = "pointer";
            element.disabled = false;
        });
        buttons.forEach((button) => (button.style.display = ""));
        row.style.opacity = "1";
    }
}

function openImageModal(imageSrc) {
    const existingModal = document.querySelector(".image-modal-overlay");
    if (existingModal) {
        existingModal.remove();
    }

    const modalHTML = `
        <div class="image-modal-overlay" onclick="closeImageModal()">
            <div class="image-modal-content" onclick="event.stopPropagation()">
                <span class="image-modal-close" onclick="closeImageModal()">&times;</span>
                <img src="${imageSrc}" class="image-modal-img" alt="Xem ảnh">
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    document.addEventListener("keydown", handleImageModalEscape);
}

function closeImageModal() {
    const modal = document.querySelector(".image-modal-overlay");
    if (modal) {
        modal.remove();
    }
    document.removeEventListener("keydown", handleImageModalEscape);
}

function handleImageModalEscape(event) {
    if (event.key === "Escape") {
        closeImageModal();
    }
}

function formatCurrencyWithThousands(amount) {
    const adjustedAmount = amount * 1000;
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
    }).format(adjustedAmount);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
    }).format(amount);
}

function updateStatistics(inventoryData) {
    const totalProducts = document.getElementById("totalProducts");
    const completedProducts = document.getElementById("completedProducts");
    const partialProducts = document.getElementById("partialProducts");
    const pendingProducts = document.getElementById("pendingProducts");

    if (!inventoryData || !Array.isArray(inventoryData)) return;

    let total = inventoryData.length;
    let withImages = 0;
    let withPrices = 0;
    let basic = 0;

    inventoryData.forEach((item) => {
        const hasImages =
            item.anhSanPham ||
            item.anhGiaMua ||
            item.productImage ||
            item.priceImage;
        const hasPrices = item.giaMua > 0 || item.giaBan > 0;

        if (hasImages) {
            withImages++;
        }
        if (hasPrices) {
            withPrices++;
        }
        if (!hasImages && !hasPrices) {
            basic++;
        }
    });

    if (totalProducts) totalProducts.textContent = total;
    if (completedProducts) completedProducts.textContent = withImages;
    if (partialProducts) partialProducts.textContent = withPrices;
    if (pendingProducts) pendingProducts.textContent = basic;
}

window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;

console.log("✅ Table renderer with TPOS Product ID support loaded");
