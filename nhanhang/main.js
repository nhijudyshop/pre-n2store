// Enhanced Goods Receipt Management System - Main Application
// Table rendering, filtering, and application initialization

// =====================================================
// GLOBAL FILTER STATE
// =====================================================

let customDateRange = {
    start: null,
    end: null,
};

// =====================================================
// FILTER SYSTEM
// =====================================================

function applyFiltersToData(dataArray) {
    const filterUser = filterUserSelect.value;
    const filterDate = dateFilterSelect.value;

    console.log("=== FILTER DEBUG ===");
    console.log("Filter settings:", {
        filterUser,
        filterDate,
        customDateRange,
    });
    console.log("Total records:", dataArray.length);

    return dataArray.filter((receipt) => {
        const matchUser =
            filterUser === "all" || receipt.tenNguoiNhan === filterUser;

        let matchDate = true;
        if (filterDate !== "all") {
            const receiptDate = parseVietnameseDate(receipt.thoiGianNhan);

            // DEBUG: Log first 3 records
            if (dataArray.indexOf(receipt) < 3) {
                console.log("Receipt:", {
                    tenNguoiNhan: receipt.tenNguoiNhan,
                    thoiGianNhan: receipt.thoiGianNhan,
                    parsedDate: receiptDate,
                    dateType: receiptDate
                        ? receiptDate.constructor.name
                        : "null",
                });
            }

            if (receiptDate) {
                const today = new Date();
                const todayStart = new Date(
                    today.getFullYear(),
                    today.getMonth(),
                    today.getDate(),
                );

                if (filterDate === "today") {
                    const receiptDateStart = new Date(
                        receiptDate.getFullYear(),
                        receiptDate.getMonth(),
                        receiptDate.getDate(),
                    );
                    matchDate =
                        receiptDateStart.getTime() === todayStart.getTime();
                } else if (filterDate === "yesterday") {
                    const yesterday = new Date(
                        todayStart.getTime() - 24 * 60 * 60 * 1000,
                    );
                    const receiptDateStart = new Date(
                        receiptDate.getFullYear(),
                        receiptDate.getMonth(),
                        receiptDate.getDate(),
                    );
                    matchDate =
                        receiptDateStart.getTime() === yesterday.getTime();
                } else if (filterDate === "week") {
                    const vnNow = getVietnamDate();
                    const dayOfWeek = vnNow.getDay();

                    // Tính từ Thứ 2 đến Chủ nhật
                    const monday = new Date(today);
                    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                    monday.setDate(monday.getDate() - daysToMonday);

                    const sunday = new Date(monday);
                    sunday.setDate(sunday.getDate() + 6);
                    sunday.setHours(23, 59, 59, 999);

                    matchDate = receiptDate >= monday && receiptDate <= sunday;
                } else if (filterDate === "month") {
                    const monthAgo = new Date(
                        todayStart.getFullYear(),
                        todayStart.getMonth() - 1,
                        todayStart.getDate(),
                    );
                    matchDate = receiptDate >= monthAgo;
                } else if (
                    filterDate === "custom" &&
                    customDateRange.start &&
                    customDateRange.end
                ) {
                    const receiptDateStart = new Date(
                        receiptDate.getFullYear(),
                        receiptDate.getMonth(),
                        receiptDate.getDate(),
                    );
                    const startDate = new Date(customDateRange.start);
                    const endDate = new Date(customDateRange.end);
                    endDate.setHours(23, 59, 59, 999); // Include end date fully
                    matchDate =
                        receiptDateStart >= startDate &&
                        receiptDateStart <= endDate;
                }
            }
        }

        return matchUser && matchDate;
    });
}

const debouncedApplyFilters = debounce(() => {
    if (isFilteringInProgress) return;
    isFilteringInProgress = true;

    const notifId = notificationManager.show("Đang lọc dữ liệu...", "info", 0, {
        persistent: true,
        icon: "filter",
        title: "Lọc dữ liệu",
    });

    setTimeout(() => {
        try {
            const cachedData = getCachedData();
            if (cachedData) {
                renderDataToTable(cachedData);
            } else {
                displayReceiptData();
            }
            notificationManager.remove(notifId);
            notificationManager.success("Lọc dữ liệu hoàn tất!", 2000);
        } catch (error) {
            console.error("Error during filtering:", error);
            notificationManager.remove(notifId);
            notificationManager.error("Có lỗi xảy ra khi lọc dữ liệu", 3000);
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
}, FILTER_DEBOUNCE_DELAY);

function applyFilters() {
    debouncedApplyFilters();
}

// =====================================================
// STATISTICS CALCULATION
// =====================================================

function calculateStatistics(dataArray) {
    const filteredData = applyFiltersToData(dataArray);

    const totalReceipts = filteredData.length;
    const totalKg = filteredData.reduce(
        (sum, receipt) => sum + (parseFloat(receipt.soKg) || 0),
        0,
    );
    const totalKien = filteredData.reduce(
        (sum, receipt) => sum + (parseFloat(receipt.soKien) || 0),
        0,
    );

    return {
        totalReceipts,
        totalKg: totalKg.toFixed(2),
        totalKien: totalKien.toFixed(2),
    };
}

function updateStatisticsDisplay(dataArray) {
    const stats = calculateStatistics(dataArray);

    const totalReceiptsEl = document.getElementById("totalReceipts");
    const totalKgEl = document.getElementById("totalKg");
    const totalKienEl = document.getElementById("totalKien");

    if (totalReceiptsEl)
        totalReceiptsEl.textContent = numberWithCommas(stats.totalReceipts);
    if (totalKgEl)
        totalKgEl.textContent = numberWithCommas(stats.totalKg) + " kg";
    if (totalKienEl)
        totalKienEl.textContent = numberWithCommas(stats.totalKien);
}

// =====================================================
// TABLE RENDERING (WITHOUT WATERMARKS)
// =====================================================

function renderDataToTable(dataArray) {
    const filteredData = applyFiltersToData(dataArray);
    tbody.innerHTML = "";

    // Update statistics
    updateStatisticsDisplay(dataArray);

    if (filteredData.length > 0) {
        var summaryRow = document.createElement("tr");
        summaryRow.style.backgroundColor = "#f8f9fa";
        summaryRow.style.fontWeight = "bold";
        var summaryTd = document.createElement("td");
        summaryTd.colSpan = 6;
        summaryTd.textContent = `Tổng: ${filteredData.length} phiếu nhận`;
        summaryTd.style.textAlign = "center";
        summaryTd.style.color = "#007bff";
        summaryTd.style.padding = "8px";
        summaryRow.appendChild(summaryTd);
        tbody.appendChild(summaryRow);
    }

    let totalImages = 0;
    let loadedImages = 0;

    const imageObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const actualSrc = img.dataset.src;
                    if (actualSrc) {
                        img.onload = () => {
                            loadedImages++;
                            if (loadedImages === totalImages)
                                setCachedData(dataArray);
                        };
                        img.onerror = () => {
                            loadedImages++;
                            if (loadedImages === totalImages)
                                setCachedData(dataArray);
                        };
                        img.src = actualSrc;
                        img.removeAttribute("data-src");
                    }
                    imageObserver.unobserve(img);
                }
            });
        },
        { rootMargin: "50px" },
    );

    const maxRender = Math.min(filteredData.length, MAX_VISIBLE_ROWS);

    for (let i = 0; i < maxRender; i++) {
        const receipt = filteredData[i];
        var tr = document.createElement("tr");
        tr.setAttribute("data-receipt-id", receipt.id || "");

        var cells = [];
        for (let j = 0; j < 6; j++) {
            cells[j] = document.createElement("td");
        }

        // Tên người nhận
        cells[0].textContent = sanitizeInput(receipt.tenNguoiNhan || "");

        // Số kg
        cells[1].textContent = parseFloat(receipt.soKg);

        // Số kiện
        cells[2].textContent = parseFloat(receipt.soKien);

        // Hình ảnh (WITHOUT watermark)
        if (receipt.anhNhanHang) {
            const img = document.createElement("img");
            img.dataset.src = receipt.anhNhanHang;
            img.src =
                "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSI+Li4uPC90ZXh0Pgo8L3N2Zz4K";
            img.alt = "Đang tải...";
            img.className = "product-image";
            img.style.cursor = "pointer";
            totalImages++;
            imageObserver.observe(img);

            cells[3].appendChild(img);
        } else {
            cells[3].textContent = "Không có ảnh";
        }

        // Ngày giờ nhận
        cells[4].textContent = receipt.thoiGianNhan || "Chưa nhập";

        // Thao tác
        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-button";
        deleteButton.setAttribute("data-receipt-id", receipt.id || "");
        deleteButton.setAttribute(
            "data-receipt-info",
            `${sanitizeInput(receipt.tenNguoiNhan || "")} - ${formatCurrency(receipt.soKg || 0)}`,
        );
        deleteButton.innerHTML =
            '<i data-lucide="trash-2"></i><span>Xóa</span>';
        deleteButton.addEventListener("click", deleteReceiptByID);

        const editButton = document.createElement("button");
        editButton.className = "edit-button";
        editButton.setAttribute("data-receipt-id", receipt.id || "");
        editButton.setAttribute(
            "data-receipt-info",
            `${sanitizeInput(receipt.tenNguoiNhan || "")} - ${formatCurrency(receipt.soKg || 0)}`,
        );
        editButton.innerHTML = '<i data-lucide="edit"></i><span>Sửa</span>';
        editButton.addEventListener("click", openEditModal);

        const actionContainer = document.createElement("div");
        actionContainer.className = "action-buttons";
        actionContainer.appendChild(editButton);
        actionContainer.appendChild(deleteButton);
        cells[5].appendChild(actionContainer);

        // Sau khi render xong tất cả, khởi tạo Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        const auth = getAuthState();
        if (auth) {
            applyRowPermissions(
                tr,
                [],
                deleteButton,
                parseInt(auth.checkLogin),
            );
        }

        cells.forEach((cell) => tr.appendChild(cell));
        tbody.appendChild(tr);
    }

    if (filteredData.length > MAX_VISIBLE_ROWS) {
        const warningRow = document.createElement("tr");
        warningRow.style.backgroundColor = "#fff3cd";
        warningRow.style.color = "#856404";
        const warningTd = document.createElement("td");
        warningTd.colSpan = 6;
        warningTd.textContent = `Hiển thị ${MAX_VISIBLE_ROWS} / ${filteredData.length} phiếu nhận. Sử dụng bộ lọc để xem dữ liệu cụ thể hơn.`;
        warningTd.style.textAlign = "center";
        warningTd.style.padding = "8px";
        warningRow.appendChild(warningTd);
        tbody.appendChild(warningRow);
    }

    if (totalImages === 0) setCachedData(dataArray);
    updateDropdownOptions(dataArray);
}

function applyRowPermissions(row, inputs, button, userRole) {
    if (userRole !== 0) {
        inputs.forEach((input) => (input.disabled = true));
        button.style.display = "none";
    } else {
        inputs.forEach((input) => (input.disabled = false));
        button.style.display = "";
    }
}

function updateDropdownOptions(fullDataArray) {
    const users = [
        ...new Set(
            fullDataArray
                .map((receipt) => receipt.tenNguoiNhan)
                .filter((user) => user),
        ),
    ];
    if (filterUserSelect) {
        const currentSelectedValue = filterUserSelect.value;
        while (filterUserSelect.children.length > 1) {
            filterUserSelect.removeChild(filterUserSelect.lastChild);
        }
        users.forEach((user) => {
            const option = document.createElement("option");
            option.value = user;
            option.textContent = user;
            filterUserSelect.appendChild(option);
        });
        if (
            currentSelectedValue &&
            currentSelectedValue !== "all" &&
            users.includes(currentSelectedValue)
        ) {
            filterUserSelect.value = currentSelectedValue;
        }
    }
}

// =====================================================
// DATE RANGE FUNCTIONS
// =====================================================

function toggleDateRangeInputs() {
    const dateRangeGroup = document.getElementById("dateRangeGroup");
    const dateFilterValue = dateFilterSelect.value;

    if (dateFilterValue === "custom") {
        dateRangeGroup.style.display = "flex";
    } else {
        dateRangeGroup.style.display = "none";
        customDateRange.start = null;
        customDateRange.end = null;
        applyFilters();
    }
}

function applyDateRangeFilter() {
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    if (!startDateInput.value || !endDateInput.value) {
        notificationManager.warning(
            "Vui lòng chọn cả ngày bắt đầu và ngày kết thúc",
            3000,
        );
        return;
    }

    const startDate = new Date(startDateInput.value);
    const endDate = new Date(endDateInput.value);

    if (startDate > endDate) {
        notificationManager.warning(
            "Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc",
            3000,
        );
        return;
    }

    customDateRange.start = startDateInput.value;
    customDateRange.end = endDateInput.value;

    applyFilters();
    notificationManager.success(
        `Đã lọc từ ${formatDate(startDate)} đến ${formatDate(endDate)}`,
        2500,
    );
}

// =====================================================
// INITIALIZATION FUNCTIONS
// =====================================================

async function initializeWithMigration() {
    try {
        await migrateDataWithIDs();
        await displayReceiptData();
    } catch (error) {
        console.error("Lỗi khởi tạo:", error);
        notificationManager.error(
            "Lỗi khởi tạo ứng dụng: " + error.message,
            4000,
        );
    }
}

function toggleForm() {
    const auth = getAuthState();
    if (!auth || auth.checkLogin == "777") {
        notificationManager.error("Không có quyền truy cập biểu mẫu", 3000);
        return;
    }
    const dataForm = document.getElementById("dataForm");
    const toggleFormButton = document.getElementById("toggleFormButton");
    if (dataForm.style.display === "none" || dataForm.style.display === "") {
        dataForm.style.display = "block";
        toggleFormButton.textContent = "Ẩn biểu mẫu";
    } else {
        dataForm.style.display = "none";
        toggleFormButton.textContent = "Hiện biểu mẫu";
    }
}

function initializeFormElements() {
    setCurrentUserName();
    initializeCameraSystem();
    initializeInputValidation();

    if (receiptForm) {
        receiptForm.addEventListener("submit", addReceipt);
    }

    // Edit modal events
    if (editForm) {
        editForm.addEventListener("submit", updateReceipt);
    }

    if (closeEditModal) {
        closeEditModal.addEventListener("click", closeEditModalFunction);
    }

    if (cancelEditButton) {
        cancelEditButton.addEventListener("click", closeEditModalFunction);
    }

    // Close modal when clicking outside
    window.addEventListener("click", function (event) {
        if (event.target === editModal) {
            closeEditModalFunction();
        }
    });

    const clearDataButton = document.getElementById("clearDataButton");
    if (clearDataButton) {
        clearDataButton.addEventListener("click", clearReceiptForm);
    }

    const toggleFormButton = document.getElementById("toggleFormButton");
    if (toggleFormButton) {
        toggleFormButton.addEventListener("click", toggleForm);
    }
}

function initializeFilterEvents() {
    if (filterUserSelect) {
        filterUserSelect.addEventListener("change", applyFilters);
    }
    if (dateFilterSelect) {
        dateFilterSelect.addEventListener("change", () => {
            toggleDateRangeInputs();
            if (dateFilterSelect.value !== "custom") {
                applyFilters();
            }
        });
    }

    // Date range filter button
    const applyDateRangeBtn = document.getElementById("applyDateRange");
    if (applyDateRangeBtn) {
        applyDateRangeBtn.addEventListener("click", applyDateRangeFilter);
    }

    // Allow Enter key in date inputs
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    if (startDateInput) {
        startDateInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") applyDateRangeFilter();
        });
    }

    if (endDateInput) {
        endDateInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") applyDateRangeFilter();
        });
    }
}

function initializeTooltipHandlers() {
    if (tbody) {
        tbody.addEventListener("click", function (e) {
            // Image zoom functionality
            if (e.target.classList.contains("product-image")) {
                const imgSrc = e.target.src;
                if (imgSrc && !imgSrc.includes("data:image/svg+xml")) {
                    showImageZoom(imgSrc);
                }
                return;
            }

            const auth = getAuthState();
            // ALL users check detailedPermissions - NO admin bypass
            const hasAdvancedView = auth?.detailedPermissions?.['nhanhang']?.['delete'] === true;
            if (hasAdvancedView) {
                const tooltip = document.getElementById("tooltip");
                const row = e.target.closest("tr");
                if (!row) return;

                const deleteButton = row.querySelector(".delete-button");
                const value = deleteButton
                    ? deleteButton.getAttribute("data-receipt-info")
                    : "Không có nút xóa";

                if (tooltip) {
                    tooltip.textContent = value;
                    tooltip.style.display = "block";
                    tooltip.style.top = e.pageY + 10 + "px";
                    tooltip.style.left = e.pageX + 10 + "px";
                    setTimeout(() => {
                        tooltip.style.display = "none";
                    }, 1000);
                }
            }
        });
    }
}

// =====================================================
// IMAGE ZOOM FUNCTIONS
// =====================================================

function createImageZoomOverlay() {
    // Check if overlay already exists
    let overlay = document.getElementById("imageZoomOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "imageZoomOverlay";
        overlay.className = "image-zoom-overlay";

        const container = document.createElement("div");
        container.className = "image-zoom-container";

        const closeBtn = document.createElement("button");
        closeBtn.className = "image-zoom-close";
        closeBtn.innerHTML = "×";
        closeBtn.setAttribute("aria-label", "Đóng");

        const img = document.createElement("img");
        img.id = "zoomedImage";
        img.alt = "Ảnh phóng to";

        container.appendChild(img);
        overlay.appendChild(closeBtn);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Close on overlay click
        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) {
                hideImageZoom();
            }
        });

        // Close on button click
        closeBtn.addEventListener("click", hideImageZoom);

        // Close on ESC key
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                hideImageZoom();
            }
        });
    }
    return overlay;
}

function showImageZoom(imgSrc) {
    const overlay = createImageZoomOverlay();
    const img = document.getElementById("zoomedImage");

    if (img && imgSrc) {
        img.src = imgSrc;
        overlay.classList.add("active");
        document.body.style.overflow = "hidden"; // Prevent scrolling
    }
}

function hideImageZoom() {
    const overlay = document.getElementById("imageZoomOverlay");
    if (overlay) {
        overlay.classList.remove("active");
        document.body.style.overflow = ""; // Restore scrolling
    }
}

function handleLogout() {
    const confirmLogout = confirm("Bạn có chắc muốn đăng xuất?");
    if (confirmLogout) {
        notificationManager.info("Đang đăng xuất...", 1500);
        setTimeout(() => {
            clearAuthState();
            invalidateCache();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }, 500);
    }
}

// =====================================================
// MAIN APPLICATION INITIALIZATION
// =====================================================

async function initializeApplication() {
    const auth = getAuthState();
    if (!isAuthenticated()) {
        console.log("User not authenticated, redirecting to login");
        notificationManager.warning("Vui lòng đăng nhập", 2000);
        setTimeout(() => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../index.html";
        }, 1000);
        return;
    }

    if (auth.userType) {
        const titleElement = document.querySelector(".page-title");
        if (titleElement) {
            titleElement.textContent += " - " + auth.displayName;
        }
    }

    const parentContainer = document.getElementById("parentContainer");
    if (parentContainer) {
        parentContainer.style.display = "flex";
        parentContainer.style.justifyContent = "center";
        parentContainer.style.alignItems = "center";
    }

    initializeFormElements();
    initializeFilterEvents();
    initializeTooltipHandlers();
    await initializeWithMigration();

    const toggleLogoutButton = document.getElementById("toggleLogoutButton");
    if (toggleLogoutButton) {
        toggleLogoutButton.addEventListener("click", handleLogout);
    }

    console.log(
        "Enhanced Goods Receipt Management System initialized successfully",
    );
    notificationManager.success("Hệ thống đã sẵn sàng!", 2000);
}

// =====================================================
// GLOBAL ERROR HANDLERS
// =====================================================

// Global error handlers
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    notificationManager.error("Có lỗi xảy ra. Vui lòng tải lại trang.", 5000);
});

window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);
    notificationManager.error("Có lỗi xảy ra trong xử lý dữ liệu.", 4000);
});

// =====================================================
// CLEANUP & INITIALIZATION
// =====================================================

// Camera cleanup on page unload
window.addEventListener("beforeunload", function () {
    stopCamera();
    stopEditCamera();
});

// DOM initialization
document.addEventListener("DOMContentLoaded", function () {
    const adsElement = document.querySelector(
        'div[style*="position: fixed"][style*="z-index:9999999"]',
    );
    if (adsElement) {
        adsElement.remove();
    }
    initializeApplication();

    // Toggle upload section
    const btnShowUpload = document.getElementById("btnShowUpload");
    const uploadSection = document.getElementById("uploadSection");
    const closeUpload = document.getElementById("closeUpload");

    if (btnShowUpload && uploadSection) {
        btnShowUpload.addEventListener("click", () => {
            uploadSection.classList.toggle("show");
            if (uploadSection.classList.contains("show")) {
                uploadSection.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
                notificationManager.info("Đã mở form thêm phiếu", 1500);
            }
        });
    }

    if (closeUpload && uploadSection) {
        closeUpload.addEventListener("click", () => {
            uploadSection.classList.remove("show");
        });
    }

    // Refresh button
    const btnRefresh = document.getElementById("btnRefresh");
    if (btnRefresh) {
        btnRefresh.addEventListener("click", async () => {
            const notifId = notificationManager.loadingData(
                "Đang làm mới dữ liệu...",
            );
            try {
                invalidateCache();
                await displayReceiptData();
                notificationManager.remove(notifId);
                notificationManager.success("Đã làm mới dữ liệu!", 2000);
            } catch (error) {
                notificationManager.remove(notifId);
                notificationManager.error(
                    "Lỗi khi làm mới: " + error.message,
                    3000,
                );
            }
        });
    }

    // Export button
    const btnExport = document.getElementById("btnExport");
    if (btnExport) {
        btnExport.addEventListener("click", exportToExcel);
    }
});

// =====================================================
// DEBUG FUNCTIONS (Optional)
// =====================================================

// Debug functions
window.debugFunctions = {
    checkDataIntegrity: async function () {
        const doc = await collectionRef.doc("nhanhang").get();
        if (doc.exists) {
            const data = doc.data();
            console.log("Data integrity check:", {
                total: data.data.length,
                withId: data.data.filter((item) => item.id).length,
                withoutId: data.data.filter((item) => !item.id).length,
            });
        }
    },
    generateUniqueID,
    sortDataByNewest,
    parseVietnameseDate,
    forceRefreshData: function () {
        invalidateCache();
        displayReceiptData();
    },
    invalidateCache,
    getAuthState,
    hasPermission,
    exportToExcel,
    startCamera,
    stopCamera,
    takePicture,
    retakePicture,
    openEditModal,
    closeEditModalFunction,
    startEditCamera,
    stopEditCamera,
    takeEditPicture,
    retakeEditPicture,
    keepCurrentImage,
    showImageZoom,
    hideImageZoom,
    calculateStatistics,
    updateStatisticsDisplay,
};

console.log("Enhanced Goods Receipt Management System loaded successfully");
console.log("Debug functions available at window.debugFunctions");
