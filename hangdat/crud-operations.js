// =====================================================
// CRUD OPERATIONS WITH COMPREHENSIVE NOTIFICATIONS
// =====================================================

async function editInventoryItem(event) {
    const auth = getAuthState();
    if (!auth || parseInt(auth.checkLogin) > 2) {
        notifyManager.warning("Không có quyền chỉnh sửa");
        return;
    }

    const button = event.currentTarget;
    const inventoryId = button.getAttribute("data-inventory-id");
    const itemInfo = button.getAttribute("data-inventory-info");

    if (!inventoryId) {
        notifyManager.error("Không tìm thấy ID sản phẩm!");
        return;
    }

    const cachedData = getCachedData();
    const itemData = cachedData?.find((item) => item.id === inventoryId);

    if (!itemData) {
        notifyManager.error("Không tìm thấy thông tin sản phẩm!");
        return;
    }

    showFullEditModal(itemData);
}

function showFullEditModal(itemData) {
    const existingModal = document.querySelector(".modal-overlay");
    if (existingModal) {
        existingModal.remove();
    }

    const modalHTML = `
        <div class="modal-overlay show">
            <div class="edit-modal full-edit-modal">
                <div class="modal-header">
                    <h3 class="modal-title">Chỉnh sửa thông tin sản phẩm</h3>
                    <button class="modal-close" onclick="closeEditModal()">&times;</button>
                </div>
                
                <div class="modal-body">
                    <form class="modal-form" id="editForm">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="editProductName">Tên sản phẩm *</label>
                                <input 
                                    type="text" 
                                    id="editProductName" 
                                    placeholder="Nhập tên sản phẩm"
                                    value="${sanitizeInput(itemData.tenSanPham || "")}"
                                    required
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editProductCode">Mã sản phẩm</label>
                                <input 
                                    type="text" 
                                    id="editProductCode" 
                                    placeholder="Nhập mã sản phẩm"
                                    value="${sanitizeInput(itemData.maSanPham || "")}"
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editVariant">Biến thể</label>
                                <input 
                                    type="text" 
                                    id="editVariant" 
                                    placeholder="Nhập biến thể"
                                    value="${sanitizeInput(itemData.bienThe || "")}"
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editQuantity">Số lượng *</label>
                                <input 
                                    type="number" 
                                    id="editQuantity" 
                                    min="0" 
                                    step="1" 
                                    placeholder="Nhập số lượng"
                                    value="${itemData.soLuong || 0}"
                                    required
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editBuyPrice">Giá mua</label>
                                <input 
                                    type="number" 
                                    id="editBuyPrice" 
                                    min="0" 
                                    step="0.01" 
                                    placeholder="Nhập giá mua"
                                    value="${itemData.giaMua || ""}"
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editSellPrice">Giá bán</label>
                                <input 
                                    type="number" 
                                    id="editSellPrice" 
                                    min="0" 
                                    step="0.01" 
                                    placeholder="Nhập giá bán"
                                    value="${itemData.giaBan || ""}"
                                />
                            </div>
                            
                            <div class="form-group">
                                <label for="editNotes">Ghi chú</label>
                                <textarea 
                                    id="editNotes" 
                                    placeholder="Nhập ghi chú"
                                    rows="3"
                                >${sanitizeInput(itemData.ghiChu || "")}</textarea>
                            </div>
                        </div>
                        
                        <div class="image-section">
                            <h4>Hình ảnh</h4>
                            <div class="image-grid">
                                <div class="image-group">
                                    <label>Ảnh sản phẩm</label>
                                    <div class="paste-area modal-paste-area" id="editProductImagePaste" tabindex="0">
                                        <div class="paste-text">Dán ảnh sản phẩm mới (Ctrl+V)</div>
                                        ${
                                            itemData.anhSanPham
                                                ? `<img src="${itemData.anhSanPham}" class="image-preview current-image" onclick="openImageModal('${itemData.anhSanPham}')" alt="Ảnh sản phẩm hiện tại">`
                                                : '<div class="no-image">Chưa có ảnh</div>'
                                        }
                                    </div>
                                </div>
                                
                                <div class="image-group">
                                    <label>Ảnh giá mua</label>
                                    <div class="paste-area modal-paste-area" id="editPriceImagePaste" tabindex="0">
                                        <div class="paste-text">Dán ảnh giá mua mới (Ctrl+V)</div>
                                        ${
                                            itemData.anhGiaMua
                                                ? `<img src="${itemData.anhGiaMua}" class="image-preview current-image" onclick="openImageModal('${itemData.anhGiaMua}')" alt="Ảnh giá mua hiện tại">`
                                                : '<div class="no-image">Chưa có ảnh</div>'
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="modal-button secondary" onclick="closeEditModal()">Hủy</button>
                    <button class="modal-button primary" onclick="saveFullEditChanges('${itemData.id}', '${itemData.tenSanPham || itemData.maSanPham || "Unknown"}')">Lưu thay đổi</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);

    const productImagePaste = document.getElementById("editProductImagePaste");
    const priceImagePaste = document.getElementById("editPriceImagePaste");

    if (productImagePaste) setupModalPasteArea(productImagePaste);
    if (priceImagePaste) setupModalPasteArea(priceImagePaste);

    setTimeout(() => {
        const firstInput = document.getElementById("editProductName");
        if (firstInput) {
            firstInput.focus();
            firstInput.select();
        }
    }, 100);

    document.addEventListener("keydown", handleModalEscape);

    notifyManager.info("Modal chỉnh sửa đã được mở", 2000);
}

function setupModalPasteArea(pasteArea) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        pasteArea.addEventListener(eventName, preventDefaults, false);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        pasteArea.addEventListener(
            eventName,
            () => pasteArea.classList.add("dragover"),
            false,
        );
    });

    ["dragleave", "drop"].forEach((eventName) => {
        pasteArea.addEventListener(
            eventName,
            () => pasteArea.classList.remove("dragover"),
            false,
        );
    });

    pasteArea.addEventListener("paste", function (e) {
        e.preventDefault();
        const items = e.clipboardData?.items;
        if (!items) return;

        pasteArea.classList.add("pasting");

        for (let item of items) {
            if (item.type.indexOf("image") !== -1) {
                const file = item.getAsFile();
                if (file) {
                    displayModalPastedImage(file, pasteArea);
                    notifyManager.success("Ảnh đã được dán thành công!", 1500);
                    break;
                }
            }
        }

        setTimeout(() => {
            pasteArea.classList.remove("pasting");
        }, 300);
    });

    pasteArea.addEventListener("drop", function (e) {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (file.type.indexOf("image") !== -1) {
            displayModalPastedImage(file, pasteArea);
            notifyManager.success("Ảnh đã được thả vào thành công!", 1500);
        }
    });

    pasteArea.addEventListener("click", function () {
        this.focus();
    });
}

function displayModalPastedImage(file, pasteArea) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const currentImage = pasteArea.querySelector(".current-image");
        const noImage = pasteArea.querySelector(".no-image");
        if (currentImage) currentImage.remove();
        if (noImage) noImage.remove();

        const preview = document.createElement("img");
        preview.src = e.target.result;
        preview.className = "image-preview new-image";
        preview.onclick = () => openImageModal(e.target.result);
        preview.alt = "Ảnh mới";

        pasteArea.appendChild(preview);
        pasteArea.classList.add("has-image");
        pasteArea._pastedFile = file;
    };
    reader.readAsDataURL(file);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function closeEditModal() {
    const modal = document.querySelector(".modal-overlay");
    if (modal) {
        modal.classList.remove("show");
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
    document.removeEventListener("keydown", handleModalEscape);
    notifyManager.info("Đã đóng modal chỉnh sửa", 1500);
}

function handleModalEscape(event) {
    if (event.key === "Escape") {
        closeEditModal();
    }
}

async function saveFullEditChanges(inventoryId, itemInfo) {
    const notifId = notifyManager.saving("Đang lưu thay đổi...");

    try {
        const productName = document
            .getElementById("editProductName")
            .value.trim();
        const productCode = document
            .getElementById("editProductCode")
            .value.trim();
        const variant = document.getElementById("editVariant").value.trim();
        const quantity =
            parseInt(document.getElementById("editQuantity").value) || 0;
        const buyPrice =
            parseFloat(document.getElementById("editBuyPrice").value) || 0;
        const sellPrice =
            parseFloat(document.getElementById("editSellPrice").value) || 0;
        const notes = document.getElementById("editNotes").value.trim();

        if (!productName) {
            notifyManager.remove(notifId);
            notifyManager.warning("Tên sản phẩm không được để trống!");
            return;
        }

        const updateData = {
            tenSanPham: productName,
            maSanPham: productCode,
            bienThe: variant,
            soLuong: quantity,
            giaMua: buyPrice,
            giaBan: sellPrice,
            ghiChu: notes,
            lastUpdated: getFormattedDateTime(),
            updatedBy: getUserName(),
        };

        const productImagePaste = document.getElementById(
            "editProductImagePaste",
        );
        const priceImagePaste = document.getElementById("editPriceImagePaste");

        let uploadCount = 0;
        const totalUploads =
            (productImagePaste?._pastedFile ? 1 : 0) +
            (priceImagePaste?._pastedFile ? 1 : 0);

        if (totalUploads > 0) {
            notifyManager.remove(notifId);
            const uploadId = notifyManager.uploading(0, totalUploads);

            if (productImagePaste && productImagePaste._pastedFile) {
                try {
                    updateData.anhSanPham = await uploadImageToFirebaseStorage(
                        productImagePaste._pastedFile,
                        "dathang/product",
                    );
                    uploadCount++;
                    notifyManager.remove(uploadId);
                    notifyManager.uploading(uploadCount, totalUploads);
                } catch (error) {
                    console.warn("Không thể upload ảnh sản phẩm:", error);
                }
            }

            if (priceImagePaste && priceImagePaste._pastedFile) {
                try {
                    updateData.anhGiaMua = await uploadImageToFirebaseStorage(
                        priceImagePaste._pastedFile,
                        "dathang/price",
                    );
                    uploadCount++;
                    notifyManager.remove(uploadId);
                    notifyManager.uploading(uploadCount, totalUploads);
                } catch (error) {
                    console.warn("Không thể upload ảnh giá:", error);
                }
            }

            notifyManager.remove(uploadId);
        }

        await updateOrderInventoryData(inventoryId, updateData);
        await refreshCachedDataAndTable();
        closeEditModal();

        logAction(
            "edit",
            `Chỉnh sửa sản phẩm "${productName}" - ID: ${inventoryId}`,
            null,
            updateData,
        );

        notifyManager.success(`Đã lưu thay đổi cho "${productName}"!`);
    } catch (error) {
        console.error("Lỗi khi lưu thay đổi:", error);
        notifyManager.remove(notifId);
        notifyManager.error("Lỗi khi lưu: " + error.message);
    }
}

async function uploadImageToFirebaseStorage(file, folder) {
    try {
        const storageRef = firebase.storage().ref();
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        const imageRef = storageRef.child(fileName);

        const snapshot = await imageRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();

        return downloadURL;
    } catch (error) {
        console.error("Error uploading image to Firebase Storage:", error);
        throw error;
    }
}

async function updateOrderInventoryData(orderId, updateData) {
    try {
        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
            }
        } else {
            throw new Error("Không tìm thấy document dathang");
        }

        const orderIndex = orderData.findIndex((order) => order.id === orderId);

        if (orderIndex !== -1) {
            orderData[orderIndex] = {
                ...orderData[orderIndex],
                ...updateData,
            };
        } else {
            throw new Error("Không tìm thấy đơn hàng để cập nhật");
        }

        await collectionRef.doc("dathang").update({ data: orderData });
    } catch (error) {
        console.error("Error updating order data:", error);
        throw error;
    }
}

async function deleteInventoryItem(event) {
    const auth = getAuthState();
    if (
        !auth ||
        (parseInt(auth.checkLogin) > 0 && parseInt(auth.checkLogin) !== 1)
    ) {
        notifyManager.warning("Không đủ quyền thực hiện chức năng này.");
        return;
    }

    const button = event.currentTarget;
    const inventoryId = button.getAttribute("data-inventory-id");
    const itemInfo = button.getAttribute("data-inventory-info");

    if (!inventoryId) {
        notifyManager.error("Không tìm thấy ID sản phẩm!");
        return;
    }

    const confirmMessage = `Bạn có chắc chắn muốn xóa sản phẩm "${itemInfo}"?\nID: ${inventoryId}`;

    const confirmDelete = confirm(confirmMessage);
    if (!confirmDelete) {
        notifyManager.info("Đã hủy thao tác xóa", 2000);
        return;
    }

    const notifId = notifyManager.deleting("Đang xóa sản phẩm...");

    try {
        const cachedData = getCachedData();
        let oldItemData = null;

        if (cachedData) {
            const index = cachedData.findIndex(
                (item) => item.id === inventoryId,
            );
            if (index !== -1) {
                oldItemData = { ...cachedData[index] };
            }
        }

        await removeItemFromFirebase(inventoryId);
        await refreshCachedDataAndTable();

        logAction(
            "delete",
            `Xóa sản phẩm "${itemInfo}" - ID: ${inventoryId}`,
            oldItemData,
            null,
        );

        notifyManager.remove(notifId);
        notifyManager.success(`Đã xóa sản phẩm "${itemInfo}"!`);
    } catch (error) {
        notifyManager.remove(notifId);
        console.error("Lỗi khi xóa:", error);
        notifyManager.error("Lỗi khi xóa: " + error.message);
    }
}

async function removeItemFromFirebase(itemId) {
    try {
        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
            }
        } else {
            throw new Error("Không tìm thấy document dathang");
        }

        const filteredData = orderData.filter((order) => order.id !== itemId);

        if (filteredData.length === orderData.length) {
            throw new Error("Không tìm thấy sản phẩm để xóa");
        }

        await collectionRef.doc("dathang").update({ data: filteredData });
    } catch (error) {
        console.error("Error removing item from Firebase:", error);
        throw error;
    }
}

async function refreshCachedDataAndTable() {
    try {
        invalidateCache();
        await loadInventoryData();
    } catch (error) {
        console.error("Error refreshing cached data and table:", error);

        try {
            const doc = await collectionRef.doc("dathang").get();
            let orderData = [];

            if (doc.exists) {
                const data = doc.data();
                if (data && Array.isArray(data.data)) {
                    orderData = data.data;
                }
            }

            if (orderData.length > 0) {
                const inventoryData = transformOrderDataToInventory(orderData);

                const sortedData = inventoryData.sort((a, b) => {
                    const dateA = parseVietnameseDate(a.thoiGianUpload);
                    const dateB = parseVietnameseDate(b.thoiGianUpload);
                    if (dateA && dateB) {
                        return dateB - dateA;
                    }
                    return 0;
                });

                globalState.inventoryData = sortedData;
                setCachedData(sortedData);
                renderInventoryTable(sortedData);
                updateFilterOptions(sortedData);
            }
        } catch (fallbackError) {
            console.error("Fallback refresh also failed:", fallbackError);
            throw fallbackError;
        }
    }
}

window.closeEditModal = closeEditModal;
window.saveFullEditChanges = saveFullEditChanges;
window.refreshCachedDataAndTable = refreshCachedDataAndTable;

console.log("CRUD operations with comprehensive notifications loaded");
