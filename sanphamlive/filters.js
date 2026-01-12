// js/filters.js - Modern Filter System with Collapsible UI

let currentFilters = {
    startDate: "",
    endDate: "",
    quickFilter: "",
    searchText: "",
};

let isFilterCollapsed = true; // Mặc định ẩn

function initFilters() {
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const quickFilterSelect = document.getElementById("quickFilter");
    const searchInput = document.getElementById("searchText");
    const todayBtn = document.getElementById("todayBtn");
    const allBtn = document.getElementById("allBtn");
    const clearBtn = document.getElementById("clearBtn");
    const deleteFilteredBtn = document.getElementById("deleteFilteredBtn");
    const filterToggleBtn = document.getElementById("filterToggleBtn");

    // Set today as default
    // setTodayFilter();

    // Toggle filter panel
    if (filterToggleBtn) {
        filterToggleBtn.addEventListener("click", toggleFilterPanel);
    }

    // Event listeners
    if (startDateInput) {
        startDateInput.addEventListener("change", handleDateChange);
    }

    if (endDateInput) {
        endDateInput.addEventListener("change", handleDateChange);
    }

    if (quickFilterSelect) {
        quickFilterSelect.addEventListener("change", handleQuickFilterChange);
    }

    if (searchInput) {
        searchInput.addEventListener(
            "input",
            debounce(handleSearchChange, 300),
        );
    }

    if (todayBtn) {
        todayBtn.addEventListener("click", setTodayFilter);
    }

    if (allBtn) {
        allBtn.addEventListener("click", setAllFilter);
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", clearFilters);
    }

    if (deleteFilteredBtn) {
        deleteFilteredBtn.addEventListener("click", handleDeleteFiltered);
    }
}

function toggleFilterPanel() {
    const filterBody = document.getElementById("filterBody");
    const filterToggleBtn = document.getElementById("filterToggleBtn");

    if (!filterBody || !filterToggleBtn) return;

    isFilterCollapsed = !isFilterCollapsed;

    // Tìm icon chevron đúng cách
    const chevronIcon = filterToggleBtn.querySelector(".filter-toggle-icon i");

    if (isFilterCollapsed) {
        filterBody.classList.add("collapsed");
        filterBody.style.display = "none"; // Force hide
        if (chevronIcon) {
            chevronIcon.setAttribute("data-lucide", "chevron-down");
        }
    } else {
        filterBody.classList.remove("collapsed");
        filterBody.style.display = "block"; // Force show
        if (chevronIcon) {
            chevronIcon.setAttribute("data-lucide", "chevron-up");
        }
    }

    // Re-init icons nếu lucide tồn tại
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function handleQuickFilterChange(e) {
    const value = e.target.value;
    currentFilters.quickFilter = value;

    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    if (value === "custom") {
        // User wants custom range - don't auto-set dates
        return;
    }

    if (value === "all") {
        // Clear date inputs
        if (startDateInput) startDateInput.value = "";
        if (endDateInput) endDateInput.value = "";
        currentFilters.startDate = "";
        currentFilters.endDate = "";
    } else {
        // Calculate date range based on quick filter
        const { startDate, endDate } = getQuickFilterDates(value);

        if (startDateInput)
            startDateInput.value = formatDateForInput(startDate);
        if (endDateInput) endDateInput.value = formatDateForInput(endDate);

        currentFilters.startDate = startDate;
        currentFilters.endDate = endDate;
    }

    applyFilters();
}

function getQuickFilterDates(filterType) {
    const today = getTodayVN();
    const todayDate = parseDateString(today);

    let startDate = today;
    let endDate = today;

    switch (filterType) {
        case "today":
            startDate = endDate = today;
            break;

        case "yesterday":
            const yesterday = new Date(
                todayDate.getTime() - 24 * 60 * 60 * 1000,
            );
            startDate = endDate = formatDate(yesterday.getTime());
            break;

        case "last7days":
            const last7 = new Date(
                todayDate.getTime() - 6 * 24 * 60 * 60 * 1000,
            );
            startDate = formatDate(last7.getTime());
            endDate = today;
            break;

        case "last30days":
            const last30 = new Date(
                todayDate.getTime() - 29 * 24 * 60 * 60 * 1000,
            );
            startDate = formatDate(last30.getTime());
            endDate = today;
            break;

        case "thisMonth":
            const firstDay = new Date(
                todayDate.getFullYear(),
                todayDate.getMonth(),
                1,
            );
            const lastDay = new Date(
                todayDate.getFullYear(),
                todayDate.getMonth() + 1,
                0,
            );
            startDate = formatDate(firstDay.getTime());
            endDate = formatDate(lastDay.getTime());
            break;

        case "lastMonth":
            const lastMonthFirst = new Date(
                todayDate.getFullYear(),
                todayDate.getMonth() - 1,
                1,
            );
            const lastMonthLast = new Date(
                todayDate.getFullYear(),
                todayDate.getMonth(),
                0,
            );
            startDate = formatDate(lastMonthFirst.getTime());
            endDate = formatDate(lastMonthLast.getTime());
            break;
    }

    return { startDate, endDate };
}

function parseDateString(dateStr) {
    // Convert dd-mm-yyyy to Date object
    const parts = dateStr.split("-");
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

function handleDateChange() {
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const quickFilterSelect = document.getElementById("quickFilter");

    const startValue = startDateInput.value;
    const endValue = endDateInput.value;

    currentFilters.startDate = startValue
        ? formatDateFromInput(startValue)
        : "";
    currentFilters.endDate = endValue ? formatDateFromInput(endValue) : "";

    // Switch to custom if user manually changes dates
    if (startValue || endValue) {
        currentFilters.quickFilter = "custom";
        if (quickFilterSelect) quickFilterSelect.value = "custom";
    }

    applyFilters();
}

function handleSearchChange(e) {
    currentFilters.searchText = sanitizeInput(e.target.value);
    applyFilters();
}

function setTodayFilter() {
    const today = getTodayVN();
    const todayInput = formatDateForInput(today);

    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const quickFilterSelect = document.getElementById("quickFilter");

    if (startDateInput) startDateInput.value = todayInput;
    if (endDateInput) endDateInput.value = todayInput;
    if (quickFilterSelect) quickFilterSelect.value = "all";

    currentFilters.startDate = today;
    currentFilters.endDate = today;
    currentFilters.quickFilter = "all";

    applyFilters();
    notificationManager.info("Đã lọc dữ liệu hôm nay");
}

function setAllFilter() {
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const quickFilterSelect = document.getElementById("quickFilter");
    const searchInput = document.getElementById("searchText");

    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";
    if (quickFilterSelect) quickFilterSelect.value = "all";
    if (searchInput) searchInput.value = "";

    currentFilters.startDate = "";
    currentFilters.endDate = "";
    currentFilters.quickFilter = "all";
    currentFilters.searchText = "";

    applyFilters();
    notificationManager.info("Hiển thị tất cả dữ liệu");
}

function clearFilters() {
    setAllFilter();
}

function applyFilters() {
    const inventory = window.inventoryData || [];
    const filtered = filterInventoryData(inventory);

    console.log(
        "Filter applied - Total:",
        inventory.length,
        "Filtered:",
        filtered.length,
    );

    // Update table
    renderTable(filtered);

    // Update filter info
    updateFilterInfo(filtered.length, inventory.length);

    // Update delete filtered button
    updateDeleteFilteredButton(filtered.length);

    // Update order statistics
    renderOrderStatistics();

    // Update stats cards
    if (typeof window.renderStatistics === "function") {
        renderStatistics();
    }
}

function filterInventoryData(data) {
    let filtered = [...data];

    // Apply date filter
    if (currentFilters.startDate || currentFilters.endDate) {
        filtered = filtered.filter((item) => {
            const itemDate = formatDate(item.dateCell);

            if (currentFilters.startDate && currentFilters.endDate) {
                const isAfterStart =
                    compareDates(itemDate, currentFilters.startDate) >= 0;
                const isBeforeEnd =
                    compareDates(itemDate, currentFilters.endDate) <= 0;
                return isAfterStart && isBeforeEnd;
            }

            if (currentFilters.startDate) {
                return compareDates(itemDate, currentFilters.startDate) >= 0;
            }

            if (currentFilters.endDate) {
                return compareDates(itemDate, currentFilters.endDate) <= 0;
            }

            return true;
        });
    }

    // Apply text search
    if (currentFilters.searchText) {
        const search = currentFilters.searchText.toLowerCase();
        filtered = filtered.filter((item) => {
            return (
                (item.productName &&
                    item.productName.toLowerCase().includes(search)) ||
                (item.productCode &&
                    item.productCode.toLowerCase().includes(search)) ||
                (item.supplier &&
                    item.supplier.toLowerCase().includes(search)) ||
                (item.orderCodes &&
                    item.orderCodes.some((code) =>
                        code.toLowerCase().includes(search),
                    ))
            );
        });
    }

    return filtered;
}

function updateFilterInfo(filteredCount, totalCount) {
    const filterInfo = document.getElementById("filterInfo");
    if (!filterInfo) return;

    if (filteredCount !== totalCount || currentFilters.searchText) {
        let infoText = `Hiển thị ${filteredCount} / ${totalCount} sản phẩm`;

        if (currentFilters.searchText) {
            infoText += ` (tìm kiếm: "${currentFilters.searchText}")`;
        } else if (currentFilters.startDate || currentFilters.endDate) {
            if (currentFilters.startDate && currentFilters.endDate) {
                if (currentFilters.startDate === currentFilters.endDate) {
                    infoText += ` (ngày ${currentFilters.startDate})`;
                } else {
                    infoText += ` (từ ${currentFilters.startDate} đến ${currentFilters.endDate})`;
                }
            } else if (currentFilters.startDate) {
                infoText += ` (từ ${currentFilters.startDate})`;
            } else if (currentFilters.endDate) {
                infoText += ` (đến ${currentFilters.endDate})`;
            }
        }

        filterInfo.textContent = infoText;
        filterInfo.classList.remove("hidden");
    } else {
        filterInfo.classList.add("hidden");
    }
}

function updateDeleteFilteredButton(filteredCount) {
    const deleteBtn = document.getElementById("deleteFilteredBtn");
    if (!deleteBtn) return;

    const hasFilters =
        currentFilters.startDate ||
        currentFilters.endDate ||
        currentFilters.searchText;

    if (filteredCount > 0 && hasFilters && hasPermission(0)) {
        deleteBtn.textContent = `Xóa đã lọc (${filteredCount})`;
        deleteBtn.classList.remove("hidden");
    } else {
        deleteBtn.classList.add("hidden");
    }
}

async function handleDeleteFiltered() {
    if (!hasPermission(0)) {
        notificationManager.error("Không có quyền xóa");
        return;
    }

    const inventory = window.inventoryData || [];
    const filtered = filterInventoryData(inventory);

    if (filtered.length === 0) {
        notificationManager.warning("Không có sản phẩm để xóa");
        return;
    }

    if (!confirm(`Bạn có chắc muốn xóa ${filtered.length} sản phẩm đã lọc?`)) {
        return;
    }

    const deletingId = notificationManager.deleting(
        `Đang xóa ${filtered.length} sản phẩm...`,
    );

    try {
        const filteredIds = filtered.map((item) => item.id);

        if (window.isFirebaseInitialized()) {
            await window.firebaseService.deleteMultipleItems(filteredIds);
        } else {
            const filteredIdSet = new Set(filteredIds);
            const updatedInventory = inventory.filter(
                (item) => !filteredIdSet.has(item.id),
            );
            window.inventoryData = updatedInventory;
            setCachedData(updatedInventory);
        }

        logAction("delete_batch", `Xóa ${filtered.length} sản phẩm đã lọc`);

        if (!window.isFirebaseInitialized()) {
            renderTable(window.inventoryData);
            renderOrderStatistics();
        }

        setAllFilter();

        notificationManager.remove(deletingId);
        notificationManager.success(`Đã xóa ${filtered.length} sản phẩm!`);
    } catch (error) {
        console.error("Error deleting filtered items:", error);
        notificationManager.remove(deletingId);
        notificationManager.error("Lỗi xóa sản phẩm: " + error.message);
    }
}

function getFilteredData() {
    const inventory = window.inventoryData || [];
    return filterInventoryData(inventory);
}

// Export functions
window.initFilters = initFilters;
window.setTodayFilter = setTodayFilter;
window.setAllFilter = setAllFilter;
window.clearFilters = clearFilters;
window.applyFilters = applyFilters;
window.filterInventoryData = filterInventoryData;
window.getFilteredData = getFilteredData;
window.currentFilters = currentFilters;

console.log("✓ Modern Filters module loaded");
