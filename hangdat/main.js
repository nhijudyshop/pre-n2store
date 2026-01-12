// =====================================================
// MAIN APPLICATION INITIALIZATION WITH OPTIMIZED UPLOADS
// =====================================================

// Form state
let formState = {
    orderCounter: 0,
    productCounter: 0,
    isFormView: false,
    currentEditingOrder: null,
};

// =====================================================
// UTILITY FUNCTIONS FOR PASTE/DRAG-DROP
// =====================================================

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function displayPastedImage(file, pasteArea, previewId) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const preview = document.getElementById(previewId);
        if (preview) {
            preview.src = e.target.result;
            preview.style.display = "block";
            pasteArea.classList.add("has-image");
            pasteArea._pastedFile = file;
            preview.onclick = () => openImageModal(e.target.result);
        }
    };
    reader.readAsDataURL(file);
}

function handlePaste(e, pasteArea, previewId) {
    const items = e.clipboardData?.items;
    if (!items) return;

    pasteArea.classList.add("pasting");

    for (let item of items) {
        if (item.type.indexOf("image") !== -1) {
            const file = item.getAsFile();
            if (file) {
                displayPastedImage(file, pasteArea, previewId);
                if (window.notifyManager) {
                    notifyManager.success("Ảnh đã được dán!", 1500);
                }
                break;
            }
        }
    }

    setTimeout(() => {
        pasteArea.classList.remove("pasting");
    }, 300);
}

function handleDrop(e, pasteArea, previewId) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type.indexOf("image") !== -1) {
        displayPastedImage(file, pasteArea, previewId);
        if (window.notifyManager) {
            notifyManager.success("Ảnh đã được thả vào!", 1500);
        }
    }
}

// =====================================================
// PASTE AREA SETUP
// =====================================================

function setupPasteArea(pasteArea, previewId) {
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
        handlePaste(e, pasteArea, previewId);
    });

    pasteArea.addEventListener("drop", function (e) {
        e.preventDefault();
        handleDrop(e, pasteArea, previewId);
    });

    pasteArea.setAttribute("tabindex", "0");
    pasteArea.addEventListener("click", function () {
        this.focus();
    });
}

function setupProductPasteArea(pasteArea, previewClass) {
    pasteArea.className = "paste-area product-paste-area";

    const preview = document.createElement("img");
    preview.className = `${previewClass} image-preview`;
    preview.style.display = "none";
    pasteArea.appendChild(preview);

    setupPasteArea(pasteArea, null);

    pasteArea.addEventListener("paste", function (e) {
        e.preventDefault();
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let item of items) {
            if (item.type.indexOf("image") !== -1) {
                const file = item.getAsFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        preview.src = e.target.result;
                        preview.style.display = "block";
                        pasteArea.classList.add("has-image");
                        pasteArea._pastedFile = file;
                        preview.onclick = () => openImageModal(e.target.result);
                    };
                    reader.readAsDataURL(file);
                    if (window.notifyManager) {
                        notifyManager.success("Ảnh đã được dán!", 1500);
                    }
                    break;
                }
            }
        }
    });
}

function setupPasteHandlers() {
    const invoicePasteArea = document.getElementById("invoiceImagePaste");
    if (invoicePasteArea) {
        setupPasteArea(invoicePasteArea, "invoicePreview");
    }
}

// =====================================================
// OPTIMIZED FIREBASE UPLOAD - AGGRESSIVE COMPRESSION
// =====================================================

async function uploadImageToFirebase(file, folder) {
    try {
        console.log(
            `Uploading to ${folder}:`,
            file.name,
            Utils.formatFileSize(file.size),
        );

        // Sử dụng compression mạnh
        const compressedFile = await Utils.compressImageAggressive(file);

        console.log(`Compressed:`, Utils.formatFileSize(compressedFile.size));

        const storageRef = firebase.storage().ref();
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        const imageRef = storageRef.child(fileName);

        const snapshot = await imageRef.put(compressedFile, STORAGE_METADATA);
        const downloadURL = await snapshot.ref.getDownloadURL();

        console.log(`✅ Uploaded successfully: ${fileName}`);
        return downloadURL;
    } catch (error) {
        console.error("Error uploading image to Firebase Storage:", error);
        throw error;
    }
}

// =====================================================
// OPTIMIZED: PARALLEL IMAGE UPLOAD
// =====================================================

async function buildOrderFromForm(formData) {
    console.log("🔄 Building order from form...");

    const order = {
        id: generateUniqueID(),
        ngayDatHang: formData.get("orderDate"),
        nhaCungCap: formData.get("supplier"),
        hoaDon: formData.get("invoice"),
        anhHoaDon: null,
        products: [],
        thoiGianUpload: getFormattedDateTime(),
        createdBy: getUserName(),
    };

    // Collect all upload tasks
    const uploadTasks = [];

    // Invoice image upload task
    const invoicePasteArea = document.getElementById("invoiceImagePaste");
    if (invoicePasteArea && invoicePasteArea._pastedFile) {
        uploadTasks.push({
            type: "invoice",
            file: invoicePasteArea._pastedFile,
            folder: "dathang/invoices",
        });
    }

    const productNames = formData.getAll("productName[]");
    const productCodes = formData.getAll("productCode[]");
    const variants = formData.getAll("variant[]");
    const quantities = formData.getAll("quantity[]");
    const buyPrices = formData.getAll("buyPrice[]");
    const sellPrices = formData.getAll("sellPrice[]");
    const notes = formData.getAll("notes[]");
    const productRows = document.querySelectorAll("#productsTableBody tr");

    console.log(`📦 Processing ${productNames.length} products...`);

    // Build products array and collect image upload tasks
    for (let i = 0; i < productNames.length; i++) {
        if (productNames[i].trim()) {
            const product = {
                id: generateUniqueID(),
                tenSanPham: productNames[i].trim(),
                maSanPham: productCodes[i] || "",
                bienThe: variants[i] || "",
                soLuong: parseInt(quantities[i]) || 0,
                giaMua: parseFloat(buyPrices[i]) || 0,
                giaBan: parseFloat(sellPrices[i]) || 0,
                anhSanPham: null,
                anhGiaMua: null,
                ghiChu: notes[i] || "",
            };

            const row = productRows[i];
            if (row) {
                const pasteAreas = row.querySelectorAll(".paste-area");

                // Collect product image upload task
                if (pasteAreas[0] && pasteAreas[0]._pastedFile) {
                    uploadTasks.push({
                        type: "product",
                        productIndex: order.products.length,
                        field: "anhSanPham",
                        file: pasteAreas[0]._pastedFile,
                        folder: "dathang/products",
                    });
                }

                // Collect price image upload task
                if (pasteAreas[1] && pasteAreas[1]._pastedFile) {
                    uploadTasks.push({
                        type: "product",
                        productIndex: order.products.length,
                        field: "anhGiaMua",
                        file: pasteAreas[1]._pastedFile,
                        folder: "dathang/prices",
                    });
                }
            }

            order.products.push(product);
        }
    }

    console.log(`📸 Total images to upload: ${uploadTasks.length}`);

    // ===== PARALLEL UPLOAD - Upload all images simultaneously =====
    if (uploadTasks.length > 0) {
        const uploadId = notifyManager.uploading(0, uploadTasks.length);
        let uploadedCount = 0;

        try {
            console.log("⚡ Starting parallel upload...");

            // Upload all images in parallel
            const uploadPromises = uploadTasks.map(async (task, index) => {
                try {
                    console.log(
                        `📤 [${index + 1}/${uploadTasks.length}] Uploading ${task.type}...`,
                    );
                    const url = await uploadImageToFirebase(
                        task.file,
                        task.folder,
                    );
                    uploadedCount++;
                    notifyManager.remove(uploadId);
                    notifyManager.uploading(uploadedCount, uploadTasks.length);
                    console.log(
                        `✅ [${uploadedCount}/${uploadTasks.length}] Uploaded ${task.type}`,
                    );
                    return { ...task, url };
                } catch (error) {
                    console.warn(`❌ Failed to upload ${task.type}:`, error);
                    uploadedCount++;
                    notifyManager.remove(uploadId);
                    notifyManager.uploading(uploadedCount, uploadTasks.length);
                    return { ...task, url: null };
                }
            });

            // Wait for all uploads to complete
            const results = await Promise.all(uploadPromises);
            console.log("✅ All uploads completed!");

            // Assign URLs back to order object
            results.forEach((result) => {
                if (result.url) {
                    if (result.type === "invoice") {
                        order.anhHoaDon = result.url;
                    } else if (result.type === "product") {
                        order.products[result.productIndex][result.field] =
                            result.url;
                    }
                }
            });

            notifyManager.remove(uploadId);
        } catch (error) {
            console.error("❌ Error in parallel upload:", error);
            notifyManager.remove(uploadId);
            throw error;
        }
    }

    console.log("✅ Order built successfully:", order);
    return order;
}

async function saveOrderToFirebase(order) {
    try {
        console.log("💾 Saving order to Firebase...");

        const doc = await collectionRef.doc("dathang").get();
        let orderData = [];

        if (doc.exists) {
            const data = doc.data();
            if (data && Array.isArray(data.data)) {
                orderData = data.data;
            }
        }

        console.log(`📊 Current orders in database: ${orderData.length}`);

        order.products.forEach((product) => {
            const orderEntry = {
                id: product.id,
                ngayDatHang: order.ngayDatHang,
                nhaCungCap: order.nhaCungCap,
                hoaDon: order.hoaDon,
                anhHoaDon: order.anhHoaDon,
                tenSanPham: product.tenSanPham,
                maSanPham: product.maSanPham,
                bienThe: product.bienThe,
                soLuong: product.soLuong,
                giaMua: product.giaMua,
                giaBan: product.giaBan,
                anhSanPham: product.anhSanPham,
                anhGiaMua: product.anhGiaMua,
                ghiChu: product.ghiChu,
                thoiGianUpload: order.thoiGianUpload,
                createdBy: order.createdBy,
            };
            orderData.push(orderEntry);
        });

        await collectionRef.doc("dathang").update({ data: orderData });
        invalidateCache();

        console.log(`✅ Order saved! Total orders now: ${orderData.length}`);
    } catch (error) {
        console.error("❌ Error saving order:", error);
        throw error;
    }
}

// =====================================================
// FORM SUBMISSION HANDLERS
// =====================================================

async function handleFormSubmit(e) {
    e.preventDefault();
    console.log("📝 Form submitted!");

    try {
        const notifId = notifyManager.processing("Đang xử lý đơn hàng...");

        const formData = new FormData(e.target);
        const order = await buildOrderFromForm(formData);

        if (order.products.length === 0) {
            notifyManager.remove(notifId);
            notifyManager.warning("Vui lòng thêm ít nhất một sản phẩm!");
            return;
        }

        notifyManager.remove(notifId);
        const saveId = notifyManager.saving("Đang lưu vào Firebase...");

        await saveOrderToFirebase(order);

        notifyManager.remove(saveId);

        resetForm();

        try {
            const refreshId = notifyManager.processing(
                "Đang làm mới dữ liệu...",
            );
            await refreshCachedDataAndTable();
            notifyManager.remove(refreshId);
        } catch (refreshError) {
            console.warn("⚠️ Failed to refresh table:", refreshError);
            try {
                await loadInventoryData();
            } catch (loadError) {
                console.error("❌ Failed to load fresh data:", loadError);
            }
        }

        logAction(
            "create",
            `Tạo đơn đặt hàng mới - Nhà cung cấp: ${order.nhaCungCap}, Số sản phẩm: ${order.products.length}`,
            null,
            order,
        );

        notifyManager.success(
            `Đã lưu đơn hàng với ${order.products.length} sản phẩm!`,
            3000,
        );

        if (formState.isFormView) {
            setTimeout(() => {
                toggleView();
                notifyManager.info(
                    "Đã chuyển sang xem danh sách sản phẩm mới!",
                    2000,
                );
            }, 1000);
        }
    } catch (error) {
        console.error("❌ Error saving order:", error);
        notifyManager.error("Lỗi khi lưu đơn hàng: " + error.message);
    }
}

// =====================================================
// FORM MANAGEMENT FUNCTIONS
// =====================================================

function loadFormCounters() {
    const cachedData = getCachedData();
    if (cachedData && Array.isArray(cachedData)) {
        const existingIds = cachedData
            .map((item) => item.id || "")
            .filter((id) => id);
        if (existingIds.length > 0) {
            const counterValues = existingIds
                .filter((id) => id.includes("inv_"))
                .map((id) => {
                    const parts = id.split("_");
                    return parts.length > 1 ? parseInt(parts[1], 36) : 0;
                })
                .filter((val) => !isNaN(val));

            if (counterValues.length > 0) {
                formState.orderCounter = Math.max(...counterValues);
                formState.productCounter = formState.orderCounter;
            }
        }
    }
}

function toggleView() {
    const formContainer = document.getElementById("formContainer");
    const inventoryContainer = document.getElementById("inventoryContainer");
    const toggleBtn = document.getElementById("toggleViewBtn");

    if (!formContainer || !inventoryContainer || !toggleBtn) {
        console.warn("Form or inventory container not found");
        return;
    }

    if (!formState.isFormView) {
        formContainer.style.display = "block";
        inventoryContainer.style.display = "none";
        toggleBtn.innerHTML = `
            <i data-lucide="minus-circle"></i>
            <span>Ẩn biểu mẫu</span>
        `;
        formContainer.classList.add("fade-in");
        formState.isFormView = true;
    } else {
        formContainer.style.display = "none";
        inventoryContainer.style.display = "block";
        toggleBtn.innerHTML = `
            <i data-lucide="plus-circle"></i>
            <span>Hiện biểu mẫu</span>
        `;
        inventoryContainer.classList.add("fade-in");
        formState.isFormView = false;
    }

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    setTimeout(() => {
        formContainer.classList.remove("fade-in");
        inventoryContainer.classList.remove("fade-in");
    }, 500);
}

function addProductRow() {
    const tbody = document.getElementById("productsTableBody");
    if (!tbody) return;

    const row = document.createElement("tr");
    row.innerHTML = `
        <td><input type="text" name="productName[]" placeholder="Tên sản phẩm" required></td>
        <td><input type="text" name="productCode[]" placeholder="Mã sản phẩm"></td>
        <td><input type="text" name="variant[]" placeholder="Biến thể"></td>
        <td><input type="number" name="quantity[]" placeholder="0" min="1" required></td>
        <td><input type="number" name="buyPrice[]" placeholder="0" step="0.01" min="0"></td>
        <td><input type="number" name="sellPrice[]" placeholder="0" step="0.01" min="0"></td>
        <td>
            <div class="paste-area product-paste-area" tabindex="0">
                <div class="paste-text">Dán ảnh sản phẩm</div>
            </div>
        </td>
        <td>
            <div class="paste-area product-paste-area" tabindex="0">
                <div class="paste-text">Dán ảnh giá</div>
            </div>
        </td>
        <td><input type="text" name="notes[]" placeholder="Ghi chú"></td>
        <td><button type="button" class="delete-button" onclick="removeProductRow(this)"></button></td>
    `;

    tbody.appendChild(row);

    const pasteAreas = row.querySelectorAll(".paste-area");
    pasteAreas[0] && setupProductPasteArea(pasteAreas[0], "product-preview");
    pasteAreas[1] && setupProductPasteArea(pasteAreas[1], "price-preview");

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function removeProductRow(button) {
    const tbody = document.getElementById("productsTableBody");
    if (tbody && tbody.children.length > 1) {
        button.closest("tr").remove();
    } else {
        if (window.notifyManager) {
            notifyManager.warning("Phải có ít nhất một sản phẩm!");
        } else {
            alert("Phải có ít nhất một sản phẩm!");
        }
    }
}

function resetForm() {
    const form = document.getElementById("orderForm");
    if (form) {
        form.reset();
    }

    // Clear invoice image
    const invoicePasteArea = document.getElementById("invoiceImagePaste");
    if (invoicePasteArea) {
        const preview = document.getElementById("invoicePreview");
        if (preview) {
            preview.style.display = "none";
        }
        invoicePasteArea.classList.remove("has-image");
        delete invoicePasteArea._pastedFile;
    }

    // Reset products table
    const tbody = document.getElementById("productsTableBody");
    if (tbody) {
        tbody.innerHTML = "";
        addProductRow();
    }

    // Set date to today
    const orderDate = document.getElementById("orderDate");
    if (orderDate) {
        orderDate.value = getCurrentDateForInput();
    }
}

function initializeFormElements() {
    const orderForm = document.getElementById("orderForm");
    if (!orderForm) {
        console.log("Form not found, skipping form initialization");
        return;
    }

    // Set date to today
    const orderDate = document.getElementById("orderDate");
    if (orderDate) {
        orderDate.value = getCurrentDateForInput();
    }

    const tbody = document.getElementById("productsTableBody");
    if (tbody && tbody.children.length === 0) {
        addProductRow();
    }

    setupPasteHandlers();
    loadFormCounters();

    console.log("✅ Form elements initialized");
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    const refreshButton = document.getElementById("refreshButton");
    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            refreshInventoryData();
        });
    }

    const exportButton = document.getElementById("exportButton");
    if (exportButton) {
        exportButton.addEventListener("click", () => {
            exportToExcel();
        });
    }

    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            handleLogout();
        });
    }

    const toggleViewBtn = document.getElementById("toggleViewBtn");
    if (toggleViewBtn) {
        toggleViewBtn.addEventListener("click", () => {
            toggleView();
        });
    }

    const orderForm = document.getElementById("orderForm");
    if (orderForm) {
        orderForm.addEventListener("submit", handleFormSubmit);
    }

    const addProductBtn = document.getElementById("addProductBtn");
    if (addProductBtn) {
        addProductBtn.addEventListener("click", () => {
            addProductRow();
        });
    }

    console.log("✅ Event listeners setup complete");
}

// =====================================================
// MAIN INITIALIZATION
// =====================================================

async function initializeInventorySystem() {
    console.log("🚀 Starting inventory system initialization...");

    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log("⚠️ User not authenticated, redirecting to login");
        // Uncomment for production:
        // window.location.href = '../index.html';
        // return;
    }

    if (auth && auth.userType && auth.userType !== "Admin") {
        const titleElement = document.querySelector(".page-title");
        if (titleElement) {
            titleElement.textContent += " - " + auth.displayName;
        }
    }

    try {
        console.log("🔧 Initializing filters...");
        initializeFilterEvents();

        console.log("📊 Loading inventory data...");
        await loadInventoryData();

        console.log("🎯 Setting up event listeners...");
        setupEventListeners();

        console.log("📝 Initializing form elements...");
        initializeFormElements();

        console.log("✅ Inventory Management System initialized successfully");
    } catch (error) {
        console.error("❌ Error initializing system:", error);
        notifyManager.error("Lỗi khởi tạo hệ thống: " + error.message);
    }
}

// =====================================================
// DOM READY
// =====================================================

document.addEventListener("DOMContentLoaded", function () {
    console.log("📄 DOM Content Loaded");

    document.body.style.pointerEvents = "auto";
    document.body.style.userSelect = "auto";
    document.body.style.overflow = "auto";
    document.body.style.cursor = "default";

    initializeInventorySystem();
});

// =====================================================
// GLOBAL EXPORTS
// =====================================================

window.toggleView = toggleView;
window.removeProductRow = removeProductRow;
window.addProductRow = addProductRow;
window.resetForm = resetForm;
window.handleFormSubmit = handleFormSubmit;

window.debugInventoryFunctions = {
    loadInventoryData,
    refreshInventoryData,
    invalidateCache,
    getAuthState,
    exportToExcel,
    updateOrderInventoryData,
    removeItemFromFirebase,
    applyFilters,
    toggleView,
    resetForm,
    globalState: () => globalState,
    formState: () => formState,
};

console.log("✅ Main application initialized with parallel uploads");
