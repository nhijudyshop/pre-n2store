// =====================================================
// CRUD OPERATIONS WITH MODAL EDITING
// =====================================================

async function editInventoryItem(event) {
    if (!PermissionHelper.checkBeforeAction('inventoryTracking', 'edit_shipment', { alertMessage: 'Không có quyền chỉnh sửa', showAlert: false })) {
        notificationManager.warning("Không có quyền chỉnh sửa", 3000);
        return;
    }

    const button = event.currentTarget;
    const inventoryId = button.getAttribute("data-inventory-id");
    const itemInfo = button.getAttribute("data-inventory-info");

    if (!inventoryId) {
        notificationManager.error("Không tìm thấy ID sản phẩm!", 3000);
        return;
    }

    // Find the item data from cache
    const cachedData = getCachedData();
    const itemData = cachedData?.find((item) => item.id === inventoryId);

    if (!itemData) {
        notificationManager.error("Không tìm thấy thông tin sản phẩm!", 3000);
        return;
    }

    // Show edit modal
    showEditModal(itemData);
}

function showEditModal(itemData) {
    // Remove existing modal if any
    const existingModal = document.querySelector(".modal-overlay");
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal HTML
    const modalHTML = `
        <div class="modal-overlay show">
            <div class="edit-modal">
                <div class="modal-header">
                    <h3 class="modal-title">Chỉnh sửa thông tin kiểm hàng</h3>
                    <button class="modal-close" onclick="closeEditModal()">&times;</button>
                </div>
                
                <div class="modal-body">
                    <div class="modal-product-info">
                        <h4>${itemData.tenSanPham || "Không có tên"}</h4>
                        <p><strong>Mã sản phẩm:</strong> ${itemData.maSanPham || "Không có mã"}</p>
                        <p><strong>Nhà cung cấp:</strong> ${itemData.nhaCungCap || "Không xác định"}</p>
                        <p><strong>Ngày đặt hàng:</strong> ${itemData.ngayDatHang || "Chưa có"}</p>
                    </div>
                    
                    <div class="quantity-info">
                        <strong>Số lượng đặt: ${itemData.soLuong || 0}</strong>
                    </div>
                    
                    <form class="modal-form" id="editForm">
                        <div class="form-group">
                            <label for="thucNhanInput">Thực nhận:</label>
                            <input 
                                type="number" 
                                id="thucNhanInput" 
                                min="0" 
                                step="any" 
                                placeholder="Nhập số lượng thực nhận"
                                value="${itemData.thucNhan || ""}"
                            />
                        </div>
                        
                        <div class="form-group">
                            <label for="tongNhanInput">Tổng nhận:</label>
                            <input 
                                type="number" 
                                id="tongNhanInput" 
                                min="0" 
                                step="any" 
                                placeholder="Nhập tổng số lượng nhận"
                                value="${itemData.tongNhan || ""}"
                            />
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="modal-button secondary" onclick="closeEditModal()">Hủy</button>
                    <button class="modal-button primary" onclick="saveModalChanges('${itemData.id}', '${itemData.tenSanPham || itemData.maSanPham || "Unknown"}')">Lưu thay đổi</button>
                </div>
            </div>
        </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Focus on first input
    setTimeout(() => {
        const firstInput = document.getElementById("thucNhanInput");
        if (firstInput) {
            firstInput.focus();
            firstInput.select();
        }
    }, 100);

    // Add escape key listener
    document.addEventListener("keydown", handleModalEscape);
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
}

function handleModalEscape(event) {
    if (event.key === "Escape") {
        closeEditModal();
    }
}

async function saveModalChanges(inventoryId, itemInfo) {
    const thucNhanInput = document.getElementById("thucNhanInput");
    const tongNhanInput = document.getElementById("tongNhanInput");

    const receivedValue = thucNhanInput
        ? parseFloat(thucNhanInput.value) || 0
        : 0;
    const totalValue = tongNhanInput ? parseFloat(tongNhanInput.value) || 0 : 0;

    // Show saving notification
    const savingId = notificationManager.saving("Đang lưu thay đổi...");

    try {
        const updateData = {
            thucNhan: receivedValue,
            tongNhan: totalValue,
            lastUpdated: getFormattedDateTime(),
            updatedBy: getUserName(),
            inventoryUpdated: true,
        };

        // Update in Firebase
        await updateOrderInventoryData(inventoryId, updateData);

        // Update cached data
        const cachedData = getCachedData();
        if (cachedData) {
            const index = cachedData.findIndex(
                (item) => item.id === inventoryId,
            );
            if (index !== -1) {
                cachedData[index].thucNhan = receivedValue;
                cachedData[index].tongNhan = totalValue;
                cachedData[index].lastUpdated = getFormattedDateTime();
                cachedData[index].updatedBy = getUserName();
                setCachedData(cachedData);
            }
        }

        // Close modal
        closeEditModal();

        // Refresh table to show updated values
        renderInventoryTable(cachedData || globalState.inventoryData);

        // Log action
        logAction(
            "edit",
            `Chỉnh sửa thông tin kiểm hàng "${itemInfo}" - Thực nhận: ${receivedValue}, Tổng nhận: ${totalValue} - ID: ${inventoryId}`,
            null,
            updateData,
        );

        // Show success notification
        notificationManager.remove(savingId);
        notificationManager.success(
            `Đã cập nhật "${itemInfo}"`,
            2000,
            "Lưu thành công",
        );
    } catch (error) {
        console.error("Lỗi khi lưu thay đổi:", error);
        notificationManager.remove(savingId);
        notificationManager.error("Lỗi khi lưu: " + error.message, 4000);
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

        // Find the order by ID
        const orderIndex = orderData.findIndex((order) => order.id === orderId);

        if (orderIndex !== -1) {
            orderData[orderIndex] = {
                ...orderData[orderIndex],
                ...updateData,
            };
        } else {
            throw new Error("Không tìm thấy đơn hàng để cập nhật");
        }

        // Save back to Firebase
        await collectionRef.doc("dathang").update({ data: orderData });
        console.log("Successfully updated Firebase with inventory data");
    } catch (error) {
        console.error("Error updating order inventory data:", error);
        throw error;
    }
}

async function deleteInventoryItem(event) {
    if (!PermissionHelper.checkBeforeAction('inventoryTracking', 'delete_shipment', { alertMessage: 'Không đủ quyền thực hiện chức năng này.', showAlert: false })) {
        notificationManager.warning(
            "Không đủ quyền thực hiện chức năng này.",
            3000,
        );
        return;
    }

    const button = event.currentTarget;
    const inventoryId = button.getAttribute("data-inventory-id");
    const itemInfo = button.getAttribute("data-inventory-info");

    if (!inventoryId) {
        notificationManager.error("Không tìm thấy ID sản phẩm!", 3000);
        return;
    }

    const confirmMessage = `Bạn có chắc chắn muốn xóa thông tin kiểm kho của sản phẩm "${itemInfo}"?\nLưu ý: Chỉ xóa thông tin kiểm kho, đơn hàng gốc vẫn được giữ lại.\nID: ${inventoryId}`;

    const confirmDelete = confirm(confirmMessage);
    if (!confirmDelete) return;

    const deletingId = notificationManager.deleting(
        "Đang xóa thông tin kiểm kho...",
    );

    try {
        // Get old data for logging
        const cachedData = getCachedData();
        let oldItemData = null;

        if (cachedData) {
            const index = cachedData.findIndex(
                (item) => item.id === inventoryId,
            );
            if (index !== -1) {
                oldItemData = { ...cachedData[index] };
                cachedData.splice(index, 1);
                setCachedData(cachedData);
            }
        }

        // Remove inventory data from Firebase
        await removeInventoryDataFromOrder(inventoryId);

        // Refresh table
        renderInventoryTable(cachedData || globalState.inventoryData);

        // Log action
        logAction(
            "delete",
            `Xóa thông tin kiểm kho "${itemInfo}" - ID: ${inventoryId}`,
            oldItemData,
            null,
        );

        notificationManager.remove(deletingId);
        notificationManager.success(
            `Đã xóa "${itemInfo}"`,
            2000,
            "Xóa thành công",
        );
    } catch (error) {
        console.error("Lỗi khi xóa:", error);
        notificationManager.remove(deletingId);
        notificationManager.error("Lỗi khi xóa: " + error.message, 4000);

        // Restore cached data on error
        if (cachedData && oldItemData) {
            cachedData.push(oldItemData);
            setCachedData(cachedData);
        }
    }
}

async function removeInventoryDataFromOrder(inventoryId) {
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

        // Find the order by ID
        const orderIndex = orderData.findIndex(
            (order) => order.id === inventoryId,
        );

        if (orderIndex !== -1) {
            // Remove inventory fields from the order
            delete orderData[orderIndex].thucNhan;
            delete orderData[orderIndex].tongNhan;
            delete orderData[orderIndex].inventoryUpdated;

            // Update timestamp
            orderData[orderIndex].lastUpdated = getFormattedDateTime();
            orderData[orderIndex].updatedBy = getUserName();
        } else {
            throw new Error(
                "Không tìm thấy đơn hàng để xóa thông tin kiểm kho",
            );
        }

        // Save back to Firebase
        await collectionRef.doc("dathang").update({ data: orderData });
        console.log("Successfully removed inventory data from Firebase");
    } catch (error) {
        console.error("Error removing inventory data from order:", error);
        throw error;
    }
}

// Make functions globally available
window.closeEditModal = closeEditModal;
window.saveModalChanges = saveModalChanges;

console.log("CRUD operations with modal system loaded");
