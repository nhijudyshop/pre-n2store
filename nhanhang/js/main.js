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

    // Helper: chuyển Date thành "YYYY-MM-DD" string - so sánh chuỗi tránh mọi vấn đề timezone
    function toDateStr(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    // Tính các mốc ngày theo giờ Việt Nam
    const vnNow = getVietnamDate();
    const vnY = vnNow.getFullYear(), vnM = vnNow.getMonth(), vnD = vnNow.getDate();

    const todayStr     = toDateStr(new Date(vnY, vnM, vnD));
    const yesterdayStr = toDateStr(new Date(vnY, vnM, vnD - 1));

    const dayOfWeek    = vnNow.getDay(); // 0=CN
    const daysToMon    = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayStr    = toDateStr(new Date(vnY, vnM, vnD - daysToMon));
    const sundayStr    = toDateStr(new Date(vnY, vnM, vnD - daysToMon + 6));
    const monthAgoStr  = toDateStr(new Date(vnY, vnM - 1, vnD));

    return dataArray.filter((receipt) => {
        const matchUser =
            filterUser === "all" || receipt.tenNguoiNhan === filterUser;

        let matchDate = true;
        if (filterDate !== "all") {
            const receiptDate = parseVietnameseDate(receipt.thoiGianNhan);

            if (!receiptDate) {
                // Không parse được ngày → không khớp bộ lọc ngày
                matchDate = false;
            } else {
                // So sánh chuỗi YYYY-MM-DD: không bị ảnh hưởng timezone
                const receiptStr = toDateStr(receiptDate);

                if (filterDate === "today") {
                    matchDate = receiptStr === todayStr;
                } else if (filterDate === "yesterday") {
                    matchDate = receiptStr === yesterdayStr;
                } else if (filterDate === "week") {
                    matchDate = receiptStr >= mondayStr && receiptStr <= sundayStr;
                } else if (filterDate === "month") {
                    matchDate = receiptStr >= monthAgoStr;
                } else if (
                    filterDate === "custom" &&
                    customDateRange.start &&
                    customDateRange.end
                ) {
                    // customDateRange.start/end là "YYYY-MM-DD" từ input type="date"
                    // So sánh chuỗi trực tiếp - chính xác 100%
                    matchDate =
                        receiptStr >= customDateRange.start &&
                        receiptStr <= customDateRange.end;
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
// TABLE RENDERING
// =====================================================

/**
 * Parse Vietnamese date format DD/MM/YYYY, HH:mm
 * Returns Date object or null if invalid
 */
function parseDateDDMMYYYY(dateString) {
    if (!dateString) return null;

    // Format: "17/01/2026, 09:51" or "17/01/2026"
    const match = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s*(\d{1,2}):(\d{2}))?/);

    if (!match) return null;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // Month is 0-indexed
    const year = parseInt(match[3], 10);
    const hour = match[4] ? parseInt(match[4], 10) : 0;
    const minute = match[5] ? parseInt(match[5], 10) : 0;

    const date = new Date(year, month, day, hour, minute);

    // Validate the date is real
    if (isNaN(date.getTime())) return null;

    return date;
}

/**
 * Sort data by thoiGianNhan descending (newest first)
 */
function sortByDateDescending(data) {
    return [...data].sort((a, b) => {
        const dateA = parseDateDDMMYYYY(a.thoiGianNhan);
        const dateB = parseDateDDMMYYYY(b.thoiGianNhan);

        // Handle null dates - push to end
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        // Descending: newer dates first
        return dateB.getTime() - dateA.getTime();
    });
}

/**
 * Create a table row for a receipt
 */
function createReceiptRow(receipt, imageObserver, imageCounter) {
    const tr = document.createElement("tr");
    tr.setAttribute("data-receipt-id", receipt.id || "");

    // Cell 0: Tên người nhận
    const cellName = document.createElement("td");
    cellName.textContent = sanitizeInput(receipt.tenNguoiNhan || "");

    // Cell 1: Số kg
    const cellKg = document.createElement("td");
    cellKg.textContent = parseFloat(receipt.soKg) || 0;

    // Cell 2: Số kiện
    const cellKien = document.createElement("td");
    cellKien.textContent = parseFloat(receipt.soKien) || 0;

    // Cell 3: Ghi chú
    const cellGhiChu = document.createElement("td");
    cellGhiChu.textContent = sanitizeInput(receipt.ghiChu || "");
    cellGhiChu.style.maxWidth = "200px";
    cellGhiChu.style.whiteSpace = "pre-wrap";
    cellGhiChu.style.wordBreak = "break-word";

    // Cell 4: Hình ảnh
    const cellImage = document.createElement("td");
    if (receipt.anhNhanHang) {
        const img = document.createElement("img");
        img.dataset.src = receipt.anhNhanHang;
        img.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZGRkIiBzdHJva2Utd2lkdGg9IjIiLz48dGV4dCB4PSIyMCIgeT0iMjUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM5OTkiPi4uLjwvdGV4dD48L3N2Zz4=";
        img.alt = "Ảnh nhận hàng";
        img.className = "product-image";
        img.style.cursor = "pointer";
        imageCounter.total++;
        imageObserver.observe(img);
        cellImage.appendChild(img);
    } else {
        cellImage.textContent = "Không có ảnh";
    }

    // Cell 4: Ngày giờ nhận
    const cellDate = document.createElement("td");
    cellDate.textContent = receipt.thoiGianNhan || "Chưa nhập";

    // Cell 5: Thao tác
    const cellActions = document.createElement("td");
    const actionContainer = document.createElement("div");
    actionContainer.className = "action-buttons";

    const editButton = document.createElement("button");
    editButton.className = "edit-button";
    editButton.setAttribute("data-receipt-id", receipt.id || "");
    editButton.setAttribute("data-receipt-info", `${sanitizeInput(receipt.tenNguoiNhan || "")} - ${formatCurrency(receipt.soKg || 0)}`);
    editButton.innerHTML = '<i data-lucide="edit"></i><span>Sửa</span>';
    editButton.addEventListener("click", openEditModal);

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.setAttribute("data-receipt-id", receipt.id || "");
    deleteButton.setAttribute("data-receipt-info", `${sanitizeInput(receipt.tenNguoiNhan || "")} - ${formatCurrency(receipt.soKg || 0)}`);
    deleteButton.innerHTML = '<i data-lucide="trash-2"></i><span>Xóa</span>';
    deleteButton.addEventListener("click", deleteReceiptByID);

    actionContainer.appendChild(editButton);
    actionContainer.appendChild(deleteButton);
    cellActions.appendChild(actionContainer);

    // Apply permissions via detailedPermissions
    if (!PermissionHelper.hasPermission('nhanhang', 'cancel')) {
        deleteButton.style.display = "none";
    }

    // Append all cells
    tr.appendChild(cellName);
    tr.appendChild(cellKg);
    tr.appendChild(cellKien);
    tr.appendChild(cellGhiChu);
    tr.appendChild(cellImage);
    tr.appendChild(cellDate);
    tr.appendChild(cellActions);

    return tr;
}

/**
 * Main render function
 */
function renderDataToTable(dataArray) {
    if (!tbody) {
        console.error("tbody element not found!");
        return;
    }

    // Clear table
    tbody.innerHTML = "";

    // Filter data
    const filteredData = applyFiltersToData(dataArray);

    // Sort by date descending (newest first)
    const sortedData = sortByDateDescending(filteredData);

    // Update statistics
    updateStatisticsDisplay(dataArray);

    // Show empty state if no data
    if (sortedData.length === 0) {
        const emptyRow = document.createElement("tr");
        const emptyTd = document.createElement("td");
        emptyTd.colSpan = 7;
        emptyTd.textContent = "Không có dữ liệu";
        emptyTd.style.textAlign = "center";
        emptyTd.style.padding = "20px";
        emptyTd.style.color = "#6c757d";
        emptyRow.appendChild(emptyTd);
        tbody.appendChild(emptyRow);
        renderMobileCards(sortedData);
        return;
    }

    // Summary row
    const summaryRow = document.createElement("tr");
    summaryRow.style.backgroundColor = "#f8f9fa";
    summaryRow.style.fontWeight = "bold";
    const summaryTd = document.createElement("td");
    summaryTd.colSpan = 7;
    summaryTd.textContent = `Tổng: ${sortedData.length} phiếu nhận`;
    summaryTd.style.textAlign = "center";
    summaryTd.style.color = "#007bff";
    summaryTd.style.padding = "8px";
    summaryRow.appendChild(summaryTd);
    tbody.appendChild(summaryRow);

    // Image lazy loading
    const imageCounter = { total: 0, loaded: 0 };
    const imageObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const actualSrc = img.dataset.src;
                    if (actualSrc) {
                        img.onload = img.onerror = () => {
                            imageCounter.loaded++;
                            if (imageCounter.loaded === imageCounter.total) {
                                setCachedData(dataArray);
                            }
                        };
                        img.src = actualSrc;
                        img.removeAttribute("data-src");
                    }
                    imageObserver.unobserve(img);
                }
            });
        },
        { rootMargin: "50px" }
    );

    // Render rows
    const maxRender = Math.min(sortedData.length, MAX_VISIBLE_ROWS);
    for (let i = 0; i < maxRender; i++) {
        const row = createReceiptRow(sortedData[i], imageObserver, imageCounter);
        tbody.appendChild(row);
    }

    // Warning if data exceeds limit
    if (sortedData.length > MAX_VISIBLE_ROWS) {
        const warningRow = document.createElement("tr");
        warningRow.style.backgroundColor = "#fff3cd";
        warningRow.style.color = "#856404";
        const warningTd = document.createElement("td");
        warningTd.colSpan = 7;
        warningTd.textContent = `Hiển thị ${MAX_VISIBLE_ROWS} / ${sortedData.length} phiếu nhận. Sử dụng bộ lọc để xem dữ liệu cụ thể hơn.`;
        warningTd.style.textAlign = "center";
        warningTd.style.padding = "8px";
        warningRow.appendChild(warningTd);
        tbody.appendChild(warningRow);
    }

    // Render mobile cards
    renderMobileCards(sortedData);

    // Initialize Lucide icons
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    // Cache data if no images
    if (imageCounter.total === 0) {
        setCachedData(dataArray);
    }

    // Update dropdown options
    updateDropdownOptions(dataArray);
}

// =====================================================
// MOBILE CARD RENDERING
// =====================================================

function renderMobileCards(sortedData) {
    const container = document.getElementById('mobileCardList');
    if (!container) return;

    if (sortedData.length === 0) {
        container.innerHTML = `
            <div class="m-receipt-empty">
                <i data-lucide="inbox"></i>
                <div>Chưa có phiếu nhận nào</div>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    container.innerHTML = sortedData.map(receipt => {
        const name = sanitizeInput(receipt.tenNguoiNhan || '');
        const kg = parseFloat(receipt.soKg) || 0;
        const kien = parseFloat(receipt.soKien) || 0;
        const date = sanitizeInput(receipt.thoiGianNhan || 'Chưa nhập');
        const ghiChu = sanitizeInput(receipt.ghiChu || '');
        const hasImage = !!receipt.anhNhanHang;
        const thumbHtml = hasImage
            ? `<img class="m-receipt-thumb" src="${receipt.anhNhanHang}" alt="Ảnh" loading="lazy">`
            : '';
        const ghiChuHtml = ghiChu
            ? `<div class="m-receipt-row"><span class="m-receipt-label">Ghi chú:</span><span class="m-receipt-value-text">${ghiChu}</span></div>`
            : '';

        return `
            <div class="m-receipt-card" data-receipt-id="${receipt.id || ''}">
                <div class="m-receipt-header">
                    <div class="m-receipt-header-left">
                        <span class="m-receipt-name">${name}</span>
                    </div>
                    <div class="m-receipt-values">
                        <span class="m-receipt-kg">${kg} kg</span>
                        <span class="m-receipt-kien">${kien} kiện</span>
                    </div>
                </div>
                <div class="m-receipt-body">
                    <div class="m-receipt-row">
                        ${thumbHtml}
                        <span class="m-receipt-label">Thời gian:</span>
                        <span class="m-receipt-value-text">${date}</span>
                    </div>
                    ${ghiChuHtml}
                </div>
            </div>`;
    }).join('');

    // Bind card click → open edit modal
    container.querySelectorAll('.m-receipt-card[data-receipt-id]').forEach(card => {
        card.addEventListener('click', () => {
            const receiptId = card.dataset.receiptId;
            if (receiptId && typeof openEditModal === 'function') {
                const fakeEvent = { currentTarget: { getAttribute: (attr) => receiptId } };
                openEditModal(fakeEvent);
            }
        });
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// =====================================================
// MOBILE FAB EVENTS
// =====================================================

function bindMobileFabEvents() {
    const mobileFabBtn = document.getElementById('mobileFabBtn');
    const mobileFabContainer = document.getElementById('mobileFabContainer');
    if (!mobileFabBtn || !mobileFabContainer) return;

    mobileFabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileFabContainer.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!mobileFabContainer.contains(e.target)) {
            mobileFabContainer.classList.remove('open');
        }
    });

    // Thêm Phiếu
    const fabAdd = document.getElementById('fabAddReceipt');
    if (fabAdd) {
        fabAdd.addEventListener('click', () => {
            mobileFabContainer.classList.remove('open');
            toggleForm();
        });
    }

    // Trợ lý AI
    const fabAI = document.getElementById('fabOpenAI');
    if (fabAI) {
        fabAI.addEventListener('click', () => {
            mobileFabContainer.classList.remove('open');
            if (window.AIChatWidget?.toggle) window.AIChatWidget.toggle();
        });
    }
}

// =====================================================
// MOBILE FILE UPLOAD (thay thế camera section trên mobile)
// =====================================================

function bindMobileFileUpload() {
    const mobileFileInput = document.getElementById('mobileFileInput');
    const mobileFilePreview = document.getElementById('mobileFilePreview');
    if (!mobileFileInput) return;

    mobileFileInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Show preview on mobile
        if (mobileFilePreview && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                mobileFilePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            };
            reader.readAsDataURL(file);
        }

        // Delegate to existing handler (which now triggers eager upload)
        if (typeof handleMainFileSelect === 'function') {
            handleMainFileSelect(event);
        }
    });
}



function applyRowPermissions(row, inputs, button, userRole) {
    // Legacy function kept for compatibility - now uses PermissionHelper
    if (!PermissionHelper.hasPermission('nhanhang', 'cancel')) {
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

/**
 * Parse dd/mm/yyyy string to YYYY-MM-DD string
 * Returns null if invalid
 */
function parseDDMMYYYYtoISO(str) {
    if (!str) return null;
    const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, dd, mm, yyyy] = match;
    // Validate date
    const d = parseInt(dd, 10), m = parseInt(mm, 10), y = parseInt(yyyy, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const testDate = new Date(y, m - 1, d);
    if (testDate.getDate() !== d || testDate.getMonth() !== m - 1) return null;
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Auto-format date input as user types: dd/mm/yyyy
 */
function autoFormatDateInput(input) {
    input.addEventListener("input", function (e) {
        let val = this.value.replace(/[^\d]/g, "");
        if (val.length > 8) val = val.substring(0, 8);
        if (val.length >= 5) {
            val = val.substring(0, 2) + "/" + val.substring(2, 4) + "/" + val.substring(4);
        } else if (val.length >= 3) {
            val = val.substring(0, 2) + "/" + val.substring(2);
        }
        this.value = val;
    });
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

    const startISO = parseDDMMYYYYtoISO(startDateInput.value);
    const endISO = parseDDMMYYYYtoISO(endDateInput.value);

    if (!startISO || !endISO) {
        notificationManager.warning(
            "Định dạng ngày không hợp lệ. Vui lòng nhập dd/mm/yyyy",
            3000,
        );
        return;
    }

    if (startISO > endISO) {
        notificationManager.warning(
            "Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc",
            3000,
        );
        return;
    }

    customDateRange.start = startISO;
    customDateRange.end = endISO;

    applyFilters();
    notificationManager.success(
        `Đã lọc từ ${startDateInput.value} đến ${endDateInput.value}`,
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
    if (!PermissionHelper.checkBeforeAction('nhanhang', 'create', { alertMessage: 'Không có quyền truy cập biểu mẫu' })) {
        return;
    }
    openCreateModal();
}

function openCreateModal() {
    const createModal = document.getElementById("createModal");
    if (!createModal) return;
    createModal.style.display = "flex";
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeCreateModalFunction() {
    const createModal = document.getElementById("createModal");
    if (!createModal) return;
    createModal.style.display = "none";
    // Cancel pending eager upload khi đóng modal
    if (typeof cancelPendingUpload === 'function') cancelPendingUpload();
    clearReceiptForm();
    const mobilePreview = document.getElementById("mobileFilePreview");
    if (mobilePreview) mobilePreview.innerHTML = "";
}


function initializeFormElements() {
    setCurrentUserName();
    initializeCameraSystem();
    initializeInputValidation();

    if (receiptForm) {
        receiptForm.addEventListener("submit", addReceipt);
    }

    // Create modal events
    const closeCreateModal = document.getElementById("closeCreateModal");
    if (closeCreateModal) {
        closeCreateModal.addEventListener("click", closeCreateModalFunction);
    }
    const createModalOverlay = document.getElementById("createModalOverlay");
    if (createModalOverlay) {
        createModalOverlay.addEventListener("click", closeCreateModalFunction);
    }

    // addButton is outside <form> in modal-footer, trigger form submit
    const addButton = document.getElementById("addButton");
    if (addButton && receiptForm) {
        addButton.addEventListener("click", function (e) {
            e.preventDefault();
            receiptForm.dispatchEvent(new Event("submit", { cancelable: true }));
        });
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

    // Edit modal overlay click to close
    const editModalOverlay = document.getElementById("editModalOverlay");
    if (editModalOverlay) {
        editModalOverlay.addEventListener("click", closeEditModalFunction);
    }

    // updateButton is outside <form> in modal-footer, trigger form submit
    if (updateButton && editForm) {
        updateButton.addEventListener("click", function (e) {
            e.preventDefault();
            editForm.dispatchEvent(new Event("submit", { cancelable: true }));
        });
    }

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

    // Auto-format dd/mm/yyyy + Enter key to apply
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    if (startDateInput) {
        autoFormatDateInput(startDateInput);
        startDateInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") applyDateRangeFilter();
        });
    }

    if (endDateInput) {
        autoFormatDateInput(endDateInput);
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

    // Initialize mobile FAB events
    bindMobileFabEvents();
    bindMobileFileUpload();
}

// =====================================================
// GLOBAL ERROR HANDLERS
// =====================================================

// Global error handlers
window.addEventListener("error", function (e) {
    console.error("Global error:", e.error);
    if (window.notificationManager) {
        window.notificationManager.error("Có lỗi xảy ra. Vui lòng tải lại trang.", 5000);
    }
});

window.addEventListener("unhandledrejection", function (e) {
    console.error("Unhandled promise rejection:", e.reason);
    if (window.notificationManager) {
        window.notificationManager.error("Có lỗi xảy ra trong xử lý dữ liệu.", 4000);
    }
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

    // Open create modal from top bar button
    const btnShowUpload = document.getElementById("btnShowUpload");
    if (btnShowUpload) {
        btnShowUpload.addEventListener("click", () => {
            toggleForm();
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
