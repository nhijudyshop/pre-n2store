// =====================================================
// TABLE AND DATA MANAGEMENT SYSTEM - MODERN VERSION
// =====================================================

class TableManager {
    constructor() {
        this.tbody = document.querySelector("#tableBody");
        this.currentFilters = {
            category: CONFIG.categories.ALL,
        };
        this.isLoading = false;

        this.initializeFirebase();
        this.initializeTableInteractions();
    }

    // Initialize Firebase references
    initializeFirebase() {
        this.app = firebase.initializeApp(CONFIG.firebase);
        this.db = firebase.firestore();
        this.storageRef = firebase.storage().ref();
        this.collectionRef = this.db.collection("ib");
        this.historyCollectionRef = this.db.collection("edit_history");
    }

    // Initialize table interactions
    initializeTableInteractions() {
        if (!this.tbody) return;

        // Click handler for table interactions
        this.tbody.addEventListener("click", this.handleTableClick.bind(this));

        // Tooltip functionality
        this.tbody.addEventListener(
            "mouseover",
            Utils.throttle(this.handleTooltip.bind(this), 200),
        );
    }

    // Handle table click events
    handleTableClick(e) {
        if (e.target.classList.contains("delete-button")) {
            const row = e.target.closest("tr");
            if (row) {
                this.deleteRow(row, e.target);
            }
        }
    }

    // Handle tooltip display
    handleTooltip(e) {
        // Check delete permission via detailedPermissions
        const auth = authManager?.getAuthState ? authManager.getAuthState() : null;
        if (!auth?.detailedPermissions?.['ib']?.['delete']) return;

        const tooltip = document.getElementById("tooltip");
        const row = e.target.closest("tr");

        if (!row || !tooltip) return;

        const deleteButton = row.querySelector(".delete-button");
        if (deleteButton && e.target.classList.contains("product-image")) {
            const value = deleteButton.getAttribute("data-user") || "Không có";
            tooltip.textContent = `Người tải: ${value}`;
            tooltip.style.display = "block";
            tooltip.style.top = e.pageY + 10 + "px";
            tooltip.style.left = e.pageX + 10 + "px";

            setTimeout(() => {
                tooltip.style.display = "none";
            }, 2000);
        }
    }

    // Apply category filter with performance optimization
    applyCategoryFilter() {
        const selectedCategory =
            document.getElementById("filterCategory")?.value ||
            CONFIG.categories.ALL;
        const rows = this.tbody.querySelectorAll("tr");
        let visibleCount = 0;

        // Filter rows
        rows.forEach((row) => {
            const categoryCell = row.cells[2];

            if (categoryCell) {
                const category = categoryCell.textContent.trim();
                const shouldShow =
                    selectedCategory === CONFIG.categories.ALL ||
                    selectedCategory === "all" ||
                    category === selectedCategory;

                if (shouldShow) {
                    row.style.display = "";
                    visibleCount++;
                    row.cells[0].textContent = visibleCount;
                } else {
                    row.style.display = "none";
                }
            }
        });
    }

    // Render data to table
    // Render data to table
    renderDataToTable(dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            console.log("No data to render");
            this.tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <i data-lucide="inbox" style="width: 48px; height: 48px; margin: 0 auto 1rem; display: block;"></i>
                    <p>Chưa có dữ liệu inbox</p>
                </td>
            </tr>
        `;
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
            return;
        }

        const startTime = performance.now();

        // ✅ Không cần reverse nữa vì dữ liệu đã được sắp xếp đúng từ Firestore
        let processedDataArray = [...dataArray];

        // Clear current table
        this.tbody.innerHTML = "";

        // Render rows - dữ liệu mới nhất sẽ ở index 0
        processedDataArray.forEach((dataItem, index) => {
            this.createTableRow(dataItem, index + 1);
        });

        // Cache data
        cacheManager.setCachedData(processedDataArray);

        // Update stats
        if (uiManager && typeof uiManager.updateStats === "function") {
            uiManager.updateStats(processedDataArray);
        }

        // Update performance
        const loadTime = performance.now() - startTime;
        uiManager.updatePerformanceIndicator(loadTime);

        console.log(`Table rendered in ${loadTime.toFixed(2)}ms`);

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    // Create a single table row
    createTableRow(dataItem, rowNumber) {
        if (!dataItem) return;

        const row = this.tbody.insertRow();
        const itemId = dataItem.id || `fallback_${Date.now()}_${rowNumber}`;
        row.setAttribute("data-item-id", itemId);

        const auth = authManager.getAuthState();

        // Check if user has no access to ib page
        if (!PermissionHelper.canAccessPage('ib')) {
            this.createHiddenRow(row);
            return;
        }

        // Create normal row
        this.createNormalRow(row, dataItem, rowNumber, auth);
    }

    // Create hidden row for special user type
    createHiddenRow(row) {
        for (let i = 0; i < 7; i++) {
            const cell = row.insertCell();
            cell.style.display = "none";
        }
    }

    // Create normal table row
    createNormalRow(row, dataItem, rowNumber, auth) {
        // Create cells
        const thuTuCell = row.insertCell();
        const thoiGianUploadCell = row.insertCell();
        const phanLoaiCell = row.insertCell();
        const hinhAnhCell = row.insertCell();
        const tenSanPhamCell = row.insertCell();
        const thongTinKhachHangCell = row.insertCell();
        const actionCell = row.insertCell();

        // Fill basic data
        thuTuCell.textContent = rowNumber;
        thoiGianUploadCell.textContent = dataItem.thoiGianUpload || "";
        phanLoaiCell.textContent = dataItem.phanLoai || "";
        tenSanPhamCell.textContent = dataItem.tenSanPham || "";

        // Add product images
        this.addImagesToCell(hinhAnhCell, dataItem.sp, "Hình sản phẩm");

        // Add customer images
        this.addImagesToCell(
            thongTinKhachHangCell,
            dataItem.kh,
            "Hình khách hàng",
        );

        // Add delete button if authorized
        // ALL users check detailedPermissions - NO admin bypass
        const hasDeletePerm = auth?.detailedPermissions?.['ib']?.['delete'] === true;
        if (hasDeletePerm) {
            this.addDeleteButton(actionCell, dataItem.user || "Unknown");
        }
    }

    // Add images to cell
    addImagesToCell(cell, imageData, altText) {
        if (!imageData) return;

        const images = Array.isArray(imageData) ? imageData : [imageData];

        images.forEach((imgSrc) => {
            if (imgSrc) {
                const img = Utils.createElement("img", {
                    src: imgSrc,
                    alt: altText,
                    className: "product-image",
                    loading: "lazy",
                });

                // Add error handling
                img.onerror = () => {
                    img.src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect fill='%23f3f4f6' width='80' height='80'/%3E%3Ctext x='50%25' y='50%25' font-size='12' text-anchor='middle' dy='.3em' fill='%239ca3af'%3ENo Image%3C/text%3E%3C/svg%3E";
                    img.alt = "Không thể tải ảnh";
                };

                cell.appendChild(img);
            }
        });
    }

    // Add delete button
    addDeleteButton(cell, userId) {
        const deleteButton = Utils.createElement("button", {
            className: "delete-button",
        });

        deleteButton.setAttribute("data-user", userId);
        deleteButton.innerHTML = '<i data-lucide="trash-2"></i>';
        deleteButton.title = "Xóa mục này";

        cell.appendChild(deleteButton);

        // Initialize icon
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    // Add product to table
    addProductToTable(dataItem) {
        const row = this.tbody.insertRow(0);
        const itemId = dataItem.id || `fallback_${Date.now()}`;
        row.setAttribute("data-item-id", itemId);

        this.createNormalRow(row, dataItem, 1, authManager.getAuthState());

        // Update all row numbers
        this.updateRowIndexes();

        // Highlight new row
        uiManager.highlightElement(row);

        // Update stats (cache already updated in uploadToFirestore)
        const cachedData = cacheManager.getCachedData();
        if (
            cachedData &&
            uiManager &&
            typeof uiManager.updateStats === "function"
        ) {
            uiManager.updateStats(cachedData);
        }
    }

    // Update row indexes
    updateRowIndexes() {
        const visibleRows = this.tbody.querySelectorAll(
            'tr[style=""], tr:not([style])',
        );
        visibleRows.forEach((row, index) => {
            if (row.cells[0]) {
                row.cells[0].textContent = index + 1;
            }
        });
    }

    // Delete row
    deleteRow(row, button) {
        // Check delete permission via detailedPermissions
        const auth = authManager?.getAuthState ? authManager.getAuthState() : null;
        if (!auth?.detailedPermissions?.['ib']?.['delete']) {
            uiManager.showError("Bạn không đủ quyền để thực hiện thao tác này");
            return;
        }

        const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
        if (!confirmDelete) return;

        const itemId = row.getAttribute("data-item-id");
        if (!itemId) {
            console.error("Cannot find item ID");
            uiManager.showError("Lỗi: Không tìm thấy ID của item để xóa!");
            return;
        }

        this.performDelete(row, button, itemId);
    }

    // Perform deletion
    // Perform deletion
    async performDelete(row, button, itemId) {
        const oldData = {
            id: itemId,
            tenSanPham: row.cells[4]?.textContent || "",
            phanLoai: row.cells[2]?.textContent || "",
            thoiGianUpload: row.cells[1]?.textContent || "",
            user: button.getAttribute("data-user") || "",
        };

        console.log("Deleting item with ID:", itemId);
        uiManager.showDeleting("Đang xóa...");

        try {
            const doc = await this.collectionRef.doc("ib").get();

            if (!doc.exists) {
                throw new Error("Document does not exist");
            }

            let data = doc.data().data.slice();
            const indexToDelete = data.findIndex((item) => item.id === itemId);

            if (indexToDelete === -1) {
                throw new Error("Cannot find item with ID: " + itemId);
            }

            console.log(`Found item at index ${indexToDelete}, deleting...`);
            data.splice(indexToDelete, 1);

            await this.collectionRef.doc("ib").update({ data: data });

            // Log action
            this.logAction(
                "delete",
                `Xóa inbox "${oldData.tenSanPham}" - ${oldData.phanLoai}`,
                oldData,
                null,
            );

            // ✅ Update cache với dữ liệu mới
            cacheManager.setCachedData(data);

            // Update UI
            row.remove();
            this.updateRowIndexes();

            // Update stats
            if (uiManager && typeof uiManager.updateStats === "function") {
                uiManager.updateStats(data);
            }

            uiManager.showSuccess("Đã xóa thành công!");
        } catch (error) {
            console.error("Error deleting:", error);
            uiManager.showError("Lỗi khi xóa: " + error.message);
        }
    }

    // Upload to Firestore
    async uploadToFirestore(formData) {
        const uniqueId = formData.id;
        const currentUser = authManager.getAuthState();

        const dataToUpload = {
            id: uniqueId,
            cellShow: true,
            phanLoai: formData.phanLoai,
            tenSanPham: formData.tenSanPham,
            thoiGianUpload: formData.thoiGianUpload,
            sp: formData.sp,
            kh: formData.kh,
            user: currentUser ? currentUser.userType : "Unknown",
        };

        try {
            const doc = await this.collectionRef.doc("ib").get();

            if (doc.exists) {
                // ✅ Lấy dữ liệu hiện tại và thêm item mới vào ĐẦU mảng
                const currentData = doc.data().data || [];
                currentData.unshift(dataToUpload); // Thêm vào đầu thay vì dùng arrayUnion

                await this.collectionRef.doc("ib").update({
                    data: currentData,
                });
            } else {
                // Nếu chưa có document, tạo mới
                await this.collectionRef.doc("ib").set({
                    data: [dataToUpload],
                });
            }

            // Log the action
            this.logAction(
                "add",
                `Thêm inbox mới "${formData.tenSanPham}" - ${formData.phanLoai}`,
                null,
                formData,
            );

            // ✅ Update cache với dữ liệu mới ở đầu
            const cachedData = cacheManager.getCachedData() || [];
            cachedData.unshift(dataToUpload);
            cacheManager.setCachedData(cachedData);

            console.log("Document uploaded successfully with ID:", uniqueId);
            uiManager.showSuccess("Thành công!");

            // Add to table
            this.addProductToTable(dataToUpload);

            // Clear form
            window.formHandler.clearForm();
        } catch (error) {
            console.error("Error uploading document:", error);
            throw new Error("Lỗi khi tải lên Firestore: " + error.message);
        }
    }

    // Load data from Firebase
    async loadData() {
        const cachedData = cacheManager.getCachedData();
        if (cachedData) {
            uiManager.showSuccess("Sử dụng dữ liệu cache...");
            setTimeout(() => {
                this.renderDataToTable(cachedData);
                uiManager.hideAlert();
                uiManager.showSuccess("Tải dữ liệu từ cache hoàn tất!");
            }, 100);
            return;
        }

        uiManager.showSuccess("Đang tải dữ liệu từ server...");
        this.isLoading = true;

        try {
            const doc = await this.collectionRef.doc("ib").get();

            if (doc.exists) {
                const data = doc.data();
                if (data && Array.isArray(data.data)) {
                    this.renderDataToTable(data.data);
                    cacheManager.setCachedData(data.data);
                    uiManager.showSuccess("Tải dữ liệu hoàn tất!");
                } else {
                    uiManager.showError("Không có dữ liệu");
                }
            } else {
                console.log("Document does not exist.");
                uiManager.showError("Tài liệu không tồn tại");
            }
        } catch (error) {
            console.error("Error getting data:", error);
            uiManager.showError("Lỗi khi tải dữ liệu");
        } finally {
            this.isLoading = false;
        }
    }

    // Force refresh data
    forceRefreshData() {
        cacheManager.invalidateCache();
        this.loadData();
    }

    // Log actions
    logAction(action, description, oldData = null, newData = null) {
        const currentUser = authManager.getAuthState();
        const logEntry = {
            timestamp: new Date(),
            user: currentUser ? currentUser.userType : "Unknown",
            page: "Check Inbox Khách Hàng",
            action: action,
            description: description,
            oldData: oldData,
            newData: newData,
            id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        };

        this.historyCollectionRef
            .add(logEntry)
            .then(() => console.log("Log entry saved"))
            .catch((error) => console.error("Error saving log:", error));
    }

    // Data migration
    async migrateExistingData() {
        console.log("Starting migration...");
        try {
            const doc = await this.collectionRef.doc("ib").get();
            if (doc.exists) {
                const data = doc.data().data;
                let needsUpdate = false;

                const updatedData = data.map((item) => {
                    if (!item.id) {
                        item.id =
                            Date.now() +
                            "_" +
                            Math.random().toString(36).substr(2, 9);
                        needsUpdate = true;
                    }
                    return item;
                });

                if (needsUpdate) {
                    await this.collectionRef
                        .doc("ib")
                        .update({ data: updatedData });
                    console.log("Migration completed");
                    cacheManager.invalidateCache();
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error("Migration error:", error);
            return false;
        }
    }

    // Initialize with migration
    async initializeWithMigration() {
        const migrationNeeded = await this.migrateExistingData();

        if (migrationNeeded) {
            setTimeout(() => this.loadData(), 1000);
        } else {
            this.loadData();
        }
    }
}

// Create global instance
window.tableManager = new TableManager();
