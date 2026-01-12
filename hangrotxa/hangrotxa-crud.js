// =====================================================
// CRUD OPERATIONS
// File 5/6: hangrotxa-crud.js
// =====================================================

// =====================================================
// DELETE OPERATIONS
// =====================================================

async function deleteInventoryByID(event) {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;
    const cache = window.HangRotXaCache;

    const auth = authManager ? authManager.getAuthState() : null;
    if (!auth || auth.checkLogin == "777") {
        utils.showError("Không đủ quyền thực hiện chức năng này.");
        return;
    }

    const button = event.currentTarget;
    const productId = button.getAttribute("data-product-id");
    const productName = button.getAttribute("data-product-name");

    if (!productId) {
        utils.showError("Không tìm thấy ID sản phẩm!");
        return;
    }

    const confirmDelete = confirm(
        `Bạn có chắc chắn muốn xóa sản phẩm "${productName}"?\nID: ${productId}`,
    );
    if (!confirmDelete) return;

    const row = button.closest("tr");

    const oldProductData = {
        id: productId,
        tenSanPham: productName,
        kichCo: row.cells[6].textContent,
        soLuong: row.querySelector("input").value,
        phanLoai: row.cells[3].textContent,
        dotLive: row.cells[1].textContent,
        hinhAnh:
            row.querySelector("img").dataset.src ||
            row.querySelector("img").src,
    };

    const loadingId = utils.showLoading("Đang xóa...");

    try {
        const doc = await config.collectionRef.doc("hangrotxa").get();

        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu 'hangrotxa'");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ trong Firestore");
        }

        const index = data.data.findIndex((item) => item.id === productId);

        if (index === -1) {
            throw new Error(`Không tìm thấy sản phẩm với ID: ${productId}`);
        }

        data.data.splice(index, 1);

        await config.collectionRef.doc("hangrotxa").update({ data: data.data });

        utils.logAction(
            "delete",
            `Xóa sản phẩm "${productName}" - ID: ${productId}`,
            oldProductData,
            null,
        );

        cache.invalidateCache();

        utils.hideLoading(loadingId);
        utils.showSuccess("Đã xóa thành công!");

        if (row) row.remove();

        const rows = config.tbody.querySelectorAll("tr");
        rows.forEach((r, idx) => {
            if (r.cells[0]) {
                r.cells[0].textContent = idx;
            }
        });
    } catch (error) {
        utils.hideLoading(loadingId);
        console.error("Lỗi khi xoá:", error);
        utils.showError("Lỗi khi xoá: " + error.message);
    }
}

// =====================================================
// UPDATE OPERATIONS
// =====================================================

async function updateInventoryByID(event) {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;
    const cache = window.HangRotXaCache;

    const auth = authManager ? authManager.getAuthState() : null;
    if (!auth || auth.checkLogin == "777") {
        utils.showError("Không đủ quyền thực hiện chức năng này.");
        event.target.value = event.target.defaultValue;
        return;
    }

    const input = event.target;
    const productId = input.getAttribute("data-product-id");
    const newQuantity = parseInt(input.value);
    const oldQuantity = parseInt(input.defaultValue);

    if (!productId) {
        utils.showError("Không tìm thấy ID sản phẩm!");
        input.value = oldQuantity;
        return;
    }

    const row = input.closest("tr");
    const productName = row.cells[5].textContent;

    if (newQuantity !== oldQuantity) {
        let confirmMessage;

        if (newQuantity < 1) {
            confirmMessage = `Bạn có chắc chắn muốn xóa sản phẩm "${productName}" bằng cách đặt số lượng về 0?\nID: ${productId}`;
        } else {
            confirmMessage = `Bạn có chắc chắn muốn thay đổi số lượng sản phẩm "${productName}" từ ${oldQuantity} thành ${newQuantity}?\nID: ${productId}`;
        }

        const confirmUpdate = confirm(confirmMessage);
        if (!confirmUpdate) {
            input.value = oldQuantity;
            return;
        }
    }

    if (newQuantity < 1) {
        deleteInventoryByID({
            currentTarget: row.querySelector(".delete-button"),
        });
        return;
    }

    const loadingId = utils.showLoading("Đang cập nhật số lượng...");

    const oldData = {
        id: productId,
        tenSanPham: productName,
        soLuong: oldQuantity,
    };

    const newData = {
        id: productId,
        tenSanPham: productName,
        soLuong: newQuantity,
    };

    try {
        const doc = await config.collectionRef.doc("hangrotxa").get();

        if (!doc.exists) {
            throw new Error("Không tìm thấy tài liệu");
        }

        const data = doc.data();
        if (!Array.isArray(data.data)) {
            throw new Error("Dữ liệu không hợp lệ");
        }

        const index = data.data.findIndex((item) => item.id === productId);

        if (index === -1) {
            throw new Error(`Không tìm thấy sản phẩm với ID: ${productId}`);
        }

        data.data[index].soLuong = newQuantity;

        await config.collectionRef.doc("hangrotxa").update({ data: data.data });

        utils.logAction(
            "update",
            `Cập nhật số lượng sản phẩm "${productName}" từ ${oldQuantity} thành ${newQuantity} - ID: ${productId}`,
            oldData,
            newData,
        );

        cache.invalidateCache();

        input.defaultValue = newQuantity;

        utils.showSuccess("Cập nhật thành công!");
        utils.hideLoading(loadingId);
    } catch (error) {
        console.error("Lỗi khi cập nhật:", error);
        utils.showError("Lỗi khi cập nhật: " + error.message);
        input.value = oldQuantity;
        utils.hideLoading(loadingId);
    }
}

// =====================================================
// CREATE/UPLOAD OPERATIONS
// =====================================================

async function uploadToFirestore(productData) {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;
    const cache = window.HangRotXaCache;

    try {
        const doc = await config.collectionRef.doc("hangrotxa").get();

        if (doc.exists) {
            await config.collectionRef.doc("hangrotxa").update({
                data: firebase.firestore.FieldValue.arrayUnion(productData),
            });
        } else {
            await config.collectionRef.doc("hangrotxa").set({
                data: firebase.firestore.FieldValue.arrayUnion(productData),
            });
        }

        utils.logAction(
            "add",
            `Thêm sản phẩm mới "${productData.tenSanPham}" - ID: ${productData.id}`,
            null,
            productData,
        );

        cache.invalidateCache();

        console.log("Document với ID tải lên thành công:", productData.id);
        utils.showSuccess("Thành công!");

        await cache.displayInventoryData();

        document.getElementById("addButton").disabled = false;
        window.HangRotXaUI.clearData();
    } catch (error) {
        utils.showError("Lỗi khi tải lên...");
        console.error("Lỗi khi tải document lên: ", error);
        document.getElementById("addButton").disabled = false;
    }
}

// =====================================================
// OPTIMIZED FILE UPLOAD - 60-90s → 8-15s for 10 images
// Parallel compression + parallel upload
// =====================================================

async function handleFileUpload(newProductData) {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    const loadingId = utils.showLoading("Đang tải lên...");
    const hinhAnhFiles = Array.from(config.hinhAnhInputFile.files);
    const imagesRef = config.storageRef.child("hangrotxa/sp");

    try {
        console.log(`Starting upload of ${hinhAnhFiles.length} images...`);
        const startTime = Date.now();

        // STEP 1: Parallel compression - compress all images simultaneously
        console.log("Compressing images in parallel...");
        const compressionPromises = hinhAnhFiles.map((file) =>
            utils.compressImage(file),
        );
        const compressedFiles = await Promise.all(compressionPromises);

        const compressionTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Compression completed in ${compressionTime}s`);

        // STEP 2: Parallel upload - upload all compressed images simultaneously
        console.log("Uploading images in parallel...");
        const uploadStartTime = Date.now();

        const uploadPromises = compressedFiles.map((compressedFile, index) => {
            const originalFile = hinhAnhFiles[index];
            const uniqueName =
                originalFile.name + utils.generateUniqueFileName();
            const imageRef = imagesRef.child(uniqueName);

            // Upload and get download URL in one chain
            return imageRef
                .put(compressedFile, config.optimizedMetadata)
                .then((snapshot) => snapshot.ref.getDownloadURL())
                .then((downloadURL) => {
                    console.log(
                        `Image ${index + 1}/${compressedFiles.length} uploaded`,
                    );
                    return downloadURL;
                });
        });

        // Wait for all uploads to complete
        const downloadURLs = await Promise.all(uploadPromises);

        const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Upload completed in ${uploadTime}s`);
        console.log(
            `Total time: ${totalTime}s for ${hinhAnhFiles.length} images`,
        );

        // STEP 3: Update product data and save to Firestore
        newProductData.hinhAnh = downloadURLs;
        config.imageUrlFile = downloadURLs;

        await uploadToFirestore(newProductData);

        utils.hideLoading(loadingId);
    } catch (error) {
        console.error("Lỗi trong quá trình tải lên ảnh:", error);
        utils.showError("Lỗi khi tải ảnh lên: " + error.message);
        document.getElementById("addButton").disabled = false;
        utils.hideLoading(loadingId);
    }
}

async function handleClipboardUpload(newProductData) {
    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    if (window.isUrlPasted && window.pastedImageUrl) {
        const loadingId = utils.showLoading("Đang xử lý URL...");
        newProductData.hinhAnh = window.pastedImageUrl;
        await uploadToFirestore(newProductData);
        utils.hideLoading(loadingId);
        return;
    }

    if (config.imgArray.length > 0) {
        const loadingId = utils.showLoading("Đang tải lên image...");

        var imageName = utils.generateUniqueFileName();
        var imageRef = config.storageRef.child("hangrotxa/sp/" + imageName);

        var uploadTask = imageRef.put(
            config.imgArray[0],
            config.optimizedMetadata,
        );

        uploadTask.on(
            "state_changed",
            function (snapshot) {},
            function (error) {
                console.error("Lỗi tải lên: ", error);
                utils.showError("Lỗi tải lên!");
                document.getElementById("addButton").disabled = false;
                utils.hideLoading(loadingId);
            },
            function () {
                uploadTask.snapshot.ref
                    .getDownloadURL()
                    .then(function (downloadURL) {
                        newProductData.hinhAnh = downloadURL;
                        uploadToFirestore(newProductData);
                        utils.hideLoading(loadingId);
                    });
                console.log("Tải lên thành công");
            },
        );
    } else {
        utils.showError("Vui lòng dán hình ảnh vào container!");
        document.getElementById("addButton").disabled = false;
    }
}

function addProduct(event) {
    event.preventDefault();

    const config = window.HangRotXaConfig;
    const utils = window.HangRotXaUtils;

    const auth = authManager ? authManager.getAuthState() : null;
    if (!auth || auth.checkLogin == "777") {
        utils.showError("Không có quyền thêm sản phẩm");
        return;
    }

    document.getElementById("addButton").disabled = true;

    const phanLoai = document.getElementById("phanLoai").value;
    const hinhAnhInput = document.getElementById("hinhAnhInput");
    const tenSanPham = utils.sanitizeInput(
        document.getElementById("tenSanPham").value,
    );
    const kichCo = document.getElementById("kichCo").value;
    const soLuong = parseInt(document.getElementById("soLuong").value);
    const dotLiveInput = document.getElementById("dotLive");
    const dotLive = dotLiveInput.value;

    if (isNaN(soLuong) || soLuong < 1) {
        utils.showError("Số lượng phải lớn hơn hoặc bằng 1");
        document.getElementById("addButton").disabled = false;
        return;
    }

    if (!tenSanPham.trim()) {
        utils.showError("Vui lòng nhập tên sản phẩm");
        document.getElementById("addButton").disabled = false;
        return;
    }

    var thoiGianUpload = new Date();
    var formattedTime = thoiGianUpload.toLocaleDateString("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });

    const productId = utils.generateUniqueID();

    const newProductData = {
        id: productId,
        dotLive: dotLive,
        thoiGianUpload: formattedTime,
        phanLoai: phanLoai,
        tenSanPham: tenSanPham,
        kichCo: kichCo,
        soLuong: soLuong,
        user: auth ? auth.displayName || auth.username || "Unknown" : "Unknown",
    };

    if (config.inputLinkRadio.checked) {
        if (!hinhAnhInput.value.startsWith("https://")) {
            utils.showError("Sai định dạng link!");
            document.getElementById("addButton").disabled = false;
            return;
        }
        const loadingId = utils.showLoading("Đang xử lý...");
        newProductData.hinhAnh = hinhAnhInput.value;
        uploadToFirestore(newProductData);
    } else if (config.inputFileRadio.checked) {
        if (
            !config.hinhAnhInputFile.files ||
            config.hinhAnhInputFile.files.length === 0
        ) {
            utils.showError("Vui lòng chọn file hình ảnh!");
            document.getElementById("addButton").disabled = false;
            return;
        }
        handleFileUpload(newProductData);
    } else if (config.inputClipboardRadio.checked) {
        handleClipboardUpload(newProductData);
    }
}

// Export functions
window.HangRotXaCRUD = {
    deleteInventoryByID,
    updateInventoryByID,
    uploadToFirestore,
    handleFileUpload,
    handleClipboardUpload,
    addProduct,
};
