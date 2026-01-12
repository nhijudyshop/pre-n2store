// Enhanced Goods Receipt Management System - CRUD Operations
// Create, Read, Update, Delete operations with cache invalidation

// =====================================================
// CREATE OPERATIONS
// =====================================================

// Add receipt
async function addReceipt(event) {
    event.preventDefault();

    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        notificationManager.error("Không có quyền thêm phiếu nhận", 3000);
        return;
    }

    document.getElementById("addButton").disabled = true;

    // Get form values
    const tenNguoiNhan = sanitizeInput(tenNguoiNhanInput.value.trim());
    const soKg = parseFloat(soKgInput.value);
    const soKien = parseFloat(soKienInput.value);

    // Validation
    if (!tenNguoiNhan) {
        notificationManager.error("Vui lòng nhập tên người nhận", 3000);
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (isNaN(soKg) || soKg < 0) {
        notificationManager.error("Số kg phải lớn hơn hoặc bằng 0", 3000);
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (isNaN(soKien) || soKien < 0) {
        notificationManager.error("Số kiện phải lớn hơn hoặc bằng 0", 3000);
        document.getElementById("addButton").disabled = false;
        return;
    }

    const thoiGianNhan = getFormattedDateTime();
    const receiptId = generateUniqueID();

    // Receipt data with ID
    const newReceiptData = {
        id: receiptId,
        tenNguoiNhan: tenNguoiNhan,
        soKg: soKg,
        soKien: soKien,
        thoiGianNhan: thoiGianNhan,
        user: getUserName(),
    };

    let notifId = null;

    try {
        notifId = notificationManager.saving("Đang xử lý phiếu nhận...");

        // Handle image upload if available
        const imageUrl = await uploadCapturedImage();
        if (imageUrl) {
            newReceiptData.anhNhanHang = imageUrl;
        }

        // Upload to Firestore
        await uploadToFirestore(newReceiptData);

        if (notifId) notificationManager.remove(notifId);
    } catch (error) {
        console.error("Lỗi trong quá trình thêm phiếu nhận:", error);
        if (notifId) notificationManager.remove(notifId);
        notificationManager.error(
            "Lỗi khi thêm phiếu nhận: " + error.message,
            4000,
        );
        document.getElementById("addButton").disabled = false;
    }
}

// Upload to Firestore with ID
async function uploadToFirestore(receiptData) {
    try {
        const doc = await collectionRef.doc("nhanhang").get();

        if (doc.exists) {
            await collectionRef.doc("nhanhang").update({
                data: firebase.firestore.FieldValue.arrayUnion(receiptData),
            });
        } else {
            await collectionRef.doc("nhanhang").set({
                data: firebase.firestore.FieldValue.arrayUnion(receiptData),
            });
        }

        // Log action with ID
        logAction(
            "add",
            `Thêm phiếu nhận mới "${receiptData.tenNguoiNhan}" - ${formatCurrency(receiptData.soKg)} - ID: ${receiptData.id}`,
            null,
            receiptData,
        );

        // CRITICAL: Invalidate cache immediately after data change
        console.log("Invalidating cache after ADD operation");
        invalidateCache();

        console.log("Document với ID tải lên thành công:", receiptData.id);
        notificationManager.success("Thêm phiếu nhận thành công!", 2500);

        // Reload table to show new item
        await displayReceiptData();

        document.getElementById("addButton").disabled = false;
        clearReceiptForm();
    } catch (error) {
        notificationManager.error("Lỗi khi tải lên: " + error.message, 4000);
        console.error("Lỗi khi tải document lên: ", error);
        document.getElementById("addButton").disabled = false;
    }
}

// Clear receipt form
function clearReceiptForm() {
    capturedImageUrl = null;
    capturedImageBlob = null;

    // Clear all form inputs
    if (receiptForm) receiptForm.reset();

    // Set current user name again
    setCurrentUserName();

    // Clear image display
    if (imageDisplayArea) {
        imageDisplayArea.innerHTML =
            "<p>Ảnh sẽ hiển thị ở đây sau khi chụp</p>";
        imageDisplayArea.classList.remove("has-content");
    }

    // Reset camera UI
    retakePicture();

    // Stop any running camera
    stopCamera();
}

// =====================================================
// UPDATE OPERATIONS
// =====================================================

// Update receipt
async function updateReceipt(event) {
    event.preventDefault();

    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        notificationManager.error("Không có quyền cập nhật phiếu nhận", 3000);
        return;
    }

    updateButton.disabled = true;

    // Get form values
    const receiptId = editReceiptId.value;
    const tenNguoiNhan = sanitizeInput(editTenNguoiNhanInput.value.trim());
    const soKg = parseFloat(editSoKgInput.value);
    const soKien = parseFloat(editSoKienInput.value);

    // Validation
    if (!tenNguoiNhan) {
        notificationManager.error("Vui lòng nhập tên người nhận", 3000);
        updateButton.disabled = false;
        return;
    }

    if (isNaN(soKg) || soKg <= 0) {
        notificationManager.error("Số kg phải lớn hơn 0", 3000);
        updateButton.disabled = false;
        return;
    }

    if (isNaN(soKien) || soKien <= 0) {
        notificationManager.error("Số kiện phải lớn hơn 0", 3000);
        updateButton.disabled = false;
        return;
    }

    let notifId = null;

    try {
        notifId = notificationManager.saving("Đang cập nhật phiếu nhận...");

        // Get current data from Firestore
        const doc = await collectionRef.doc("nhanhang").get();
        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ");
        }

        // Find receipt index
        const index = data.data.findIndex((item) => item.id === receiptId);
        if (index === -1) {
            throw new Error(`Không tìm thấy phiếu nhận với ID: ${receiptId}`);
        }

        const oldData = { ...data.data[index] };

        // Update basic data
        data.data[index].tenNguoiNhan = tenNguoiNhan;
        data.data[index].soKg = soKg;
        data.data[index].soKien = soKien;

        // Handle image update
        if (editCapturedImageBlob) {
            // Có ảnh mới được chụp - upload ảnh mới
            console.log("Uploading new captured image...");
            const newImageUrl = await uploadEditCapturedImage();
            if (newImageUrl) {
                data.data[index].anhNhanHang = newImageUrl;
            }
        } else if (editKeepCurrentImage && editCurrentImageUrl) {
            // Giữ ảnh cũ - không thay đổi gì
            console.log("Keeping current image:", editCurrentImageUrl);
            data.data[index].anhNhanHang = editCurrentImageUrl;
        } else if (!editKeepCurrentImage && !editCapturedImageBlob) {
            // Không có ảnh mới và không giữ ảnh cũ - xóa ảnh
            console.log("Removing image...");
            delete data.data[index].anhNhanHang;
        }

        // Update in Firestore
        await collectionRef.doc("nhanhang").update({ data: data.data });

        // Log action
        logAction(
            "update",
            `Cập nhật phiếu nhận "${tenNguoiNhan}" - ID: ${receiptId}`,
            oldData,
            data.data[index],
        );

        // CRITICAL: Invalidate cache immediately after data change
        console.log("Invalidating cache after UPDATE operation");
        invalidateCache();

        if (notifId) notificationManager.remove(notifId);
        notificationManager.success("Cập nhật thành công!", 2500);

        // Close modal and refresh data
        closeEditModalFunction();
        await displayReceiptData();
    } catch (error) {
        console.error("Lỗi khi cập nhật:", error);
        if (notifId) notificationManager.remove(notifId);
        notificationManager.error("Lỗi khi cập nhật: " + error.message, 4000);
    } finally {
        updateButton.disabled = false;
    }
}

// =====================================================
// DELETE OPERATIONS
// =====================================================

// Delete receipt by ID
async function deleteReceiptByID(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        notificationManager.error(
            "Không đủ quyền thực hiện chức năng này.",
            3000,
        );
        return;
    }

    const button = event.currentTarget;
    const receiptId = button.getAttribute("data-receipt-id");
    const receiptInfo = button.getAttribute("data-receipt-info");

    if (!receiptId) {
        notificationManager.error("Không tìm thấy ID phiếu nhận!", 3000);
        return;
    }

    const confirmDelete = confirm(
        `Bạn có chắc chắn muốn xóa phiếu nhận "${receiptInfo}"?\nID: ${receiptId}`,
    );
    if (!confirmDelete) return;

    const row = button.closest("tr");

    // Get old data for logging
    const oldReceiptData = {
        id: receiptId,
        info: receiptInfo,
        tenNguoiNhan: row.cells[0].textContent,
        soKg: row.cells[1].textContent,
        thoiGianNhan: row.cells[4].textContent,
    };

    let notifId = notificationManager.deleting("Đang xóa phiếu nhận...");

    try {
        const doc = await collectionRef.doc("nhanhang").get();

        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu 'nhanhang'");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ trong Firestore");
        }

        // Find and delete by ID
        const index = data.data.findIndex((item) => item.id === receiptId);

        if (index === -1) {
            throw new Error(`Không tìm thấy phiếu nhận với ID: ${receiptId}`);
        }

        // Remove item by index
        data.data.splice(index, 1);

        await collectionRef.doc("nhanhang").update({ data: data.data });

        // Log action
        logAction(
            "delete",
            `Xóa phiếu nhận "${receiptInfo}" - ID: ${receiptId}`,
            oldReceiptData,
            null,
        );

        // CRITICAL: Invalidate cache immediately after data change
        console.log("Invalidating cache after DELETE operation");
        invalidateCache();

        notificationManager.remove(notifId);
        notificationManager.success("Đã xóa thành công!", 2500);

        // Refresh data to update table and statistics
        await displayReceiptData();
    } catch (error) {
        notificationManager.remove(notifId);
        console.error("Lỗi khi xoá:", error);
        notificationManager.error("Lỗi khi xoá: " + error.message, 4000);
    }
}

// =====================================================
// MIGRATION FUNCTION
// =====================================================

// Migration function (Run once only)
async function migrateDataWithIDs() {
    // Commented out - migration already completed
    // Uncomment if needed
}

// =====================================================
// EDIT MODAL FUNCTIONS
// =====================================================

// Open edit modal
function openEditModal(event) {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        notificationManager.error("Không có quyền chỉnh sửa phiếu nhận", 3000);
        return;
    }

    const button = event.currentTarget;
    const receiptId = button.getAttribute("data-receipt-id");

    if (!receiptId) {
        notificationManager.error("Không tìm thấy ID phiếu nhận!", 3000);
        return;
    }

    // Find receipt data
    const cachedData = getCachedData();
    if (!cachedData) {
        notificationManager.error("Không tìm thấy dữ liệu!", 3000);
        return;
    }

    const receiptData = cachedData.find((item) => item.id === receiptId);
    if (!receiptData) {
        notificationManager.error("Không tìm thấy dữ liệu phiếu nhận!", 3000);
        return;
    }

    // Populate form with current data
    editReceiptId.value = receiptData.id;
    editTenNguoiNhanInput.value = receiptData.tenNguoiNhan || "";
    editSoKgInput.value = receiptData.soKg || 0;
    editSoKienInput.value = receiptData.soKien || 0;

    // Handle current image
    editCurrentImageUrl = receiptData.anhNhanHang || null;
    console.log("Setting current image URL:", editCurrentImageUrl);

    if (editCurrentImageUrl && currentImageContainer) {
        currentImageContainer.innerHTML = "";

        const img = document.createElement("img");
        img.src = editCurrentImageUrl;
        img.alt = "Ảnh hiện tại";
        img.className = "captured-image";
        img.style.maxWidth = "200px";
        img.style.maxHeight = "200px";
        img.style.borderRadius = "8px";
        img.style.border = "2px solid #28a745";

        currentImageContainer.appendChild(img);
        currentImageContainer.classList.add("has-content");

        // Show current image section
        const currentImageDisplay = document.getElementById(
            "currentImageDisplay",
        );
        if (currentImageDisplay) {
            currentImageDisplay.style.display = "block";
        }
    } else {
        currentImageContainer.innerHTML =
            '<p style="color: #6c757d; font-style: italic;">Không có ảnh</p>';
        currentImageContainer.classList.remove("has-content");
    }

    // Reset edit camera state
    resetEditCameraUI();
    editKeepCurrentImage = true; // Mặc định giữ ảnh cũ
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;

    // Show modal
    if (editModal) {
        editModal.style.display = "block";
    }

    notificationManager.info("Đã mở form chỉnh sửa", 1500);
}

// Close edit modal
function closeEditModalFunction() {
    if (editModal) {
        editModal.style.display = "none";
    }

    // Stop camera if running
    stopEditCamera();
    resetEditCameraUI();

    // Clear form
    if (editForm) {
        editForm.reset();
    }

    editKeepCurrentImage = false;
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;
    editCurrentImageUrl = null;
}
