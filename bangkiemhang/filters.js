// =====================================================
// MODERN FILTERING SYSTEM WITH QUICK FILTERS
// =====================================================

let isFilteringInProgress = false;
let currentFilterNotificationId = null;
let isFilterCollapsed = true;

// Quick filter date calculation
function getQuickFilterDates(quickFilterValue) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate = null;
    let endDate = null;

    switch (quickFilterValue) {
        case "today":
            startDate = endDate = today;
            break;
        case "yesterday":
            startDate = endDate = new Date(
                today.getTime() - 24 * 60 * 60 * 1000,
            );
            break;
        case "last7days":
            startDate = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
            endDate = today;
            break;
        case "last30days":
            startDate = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
            endDate = today;
            break;
        case "thisMonth":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case "lastMonth":
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
        case "all":
        case "custom":
        default:
            return { startDate: null, endDate: null };
    }

    return { startDate, endDate };
}

function applyFiltersToInventory(dataArray) {
    const quickFilter = document.getElementById("quickFilter")?.value || "all";
    const filterSupplier =
        document.getElementById("filterSupplier")?.value || "all";
    const dateFrom = document.getElementById("dateFromFilter")?.value || "";
    const dateTo = document.getElementById("dateToFilter")?.value || "";
    const filterProductText =
        document.getElementById("filterProduct")?.value.toLowerCase().trim() ||
        "";

    // Get quick filter dates
    const { startDate: quickStartDate, endDate: quickEndDate } =
        getQuickFilterDates(quickFilter);

    return dataArray.filter((item) => {
        // Supplier filter
        const matchSupplier =
            filterSupplier === "all" || item.nhaCungCap === filterSupplier;

        // Date range filter
        let matchDate = true;
        const itemDate =
            parseVietnameseDate(item.ngayNhan) ||
            parseVietnameseDate(item.ngayDatHang);

        if (itemDate) {
            const itemDateOnly = new Date(
                itemDate.getFullYear(),
                itemDate.getMonth(),
                itemDate.getDate(),
            );

            // Apply quick filter dates if not custom
            if (
                quickFilter !== "all" &&
                quickFilter !== "custom" &&
                quickStartDate &&
                quickEndDate
            ) {
                matchDate =
                    itemDateOnly >= quickStartDate &&
                    itemDateOnly <= quickEndDate;
            }
            // Apply custom date range
            else if (dateFrom || dateTo) {
                if (dateFrom) {
                    const fromDate = new Date(dateFrom);
                    const fromDateOnly = new Date(
                        fromDate.getFullYear(),
                        fromDate.getMonth(),
                        fromDate.getDate(),
                    );
                    if (itemDateOnly < fromDateOnly) {
                        matchDate = false;
                    }
                }
                if (dateTo && matchDate) {
                    const toDate = new Date(dateTo);
                    const toDateOnly = new Date(
                        toDate.getFullYear(),
                        toDate.getMonth(),
                        toDate.getDate(),
                    );
                    if (itemDateOnly > toDateOnly) {
                        matchDate = false;
                    }
                }
            }
        }

        // Product filter - search in all text fields
        const matchProduct =
            !filterProductText ||
            (item.tenSanPham &&
                item.tenSanPham.toLowerCase().includes(filterProductText)) ||
            (item.maSanPham &&
                item.maSanPham.toLowerCase().includes(filterProductText)) ||
            (item.nhaCungCap &&
                item.nhaCungCap.toLowerCase().includes(filterProductText)) ||
            (item.ngayDatHang &&
                item.ngayDatHang.toLowerCase().includes(filterProductText)) ||
            (item.ngayNhan &&
                item.ngayNhan.toLowerCase().includes(filterProductText));

        return matchSupplier && matchDate && matchProduct;
    });
}

function updateFilterOptions(fullDataArray) {
    const filterSupplierSelect = document.getElementById("filterSupplier");
    if (!filterSupplierSelect) return;

    const suppliers = [
        ...new Set(
            fullDataArray
                .map((item) => item.nhaCungCap)
                .filter((supplier) => supplier),
        ),
    ];

    const currentSelectedValue = filterSupplierSelect.value;

    // Clear existing options except "Tất cả"
    while (filterSupplierSelect.children.length > 1) {
        filterSupplierSelect.removeChild(filterSupplierSelect.lastChild);
    }

    // Add supplier options
    suppliers.forEach((supplier) => {
        const option = document.createElement("option");
        option.value = supplier;
        option.textContent = supplier;
        filterSupplierSelect.appendChild(option);
    });

    // Restore selected value if it still exists
    if (
        currentSelectedValue &&
        currentSelectedValue !== "all" &&
        suppliers.includes(currentSelectedValue)
    ) {
        filterSupplierSelect.value = currentSelectedValue;
    }
}

function updateFilterCount(count) {
    const filterCount = document.getElementById("filterCount");
    const countBadge = filterCount?.querySelector(".count-badge");

    if (countBadge) {
        countBadge.textContent = `${count} sản phẩm`;
    }
}

const debouncedApplyFilters = debounce(() => {
    if (isFilteringInProgress) return;
    isFilteringInProgress = true;

    // Show minimal notification for filtering
    if (currentFilterNotificationId) {
        notificationManager.remove(currentFilterNotificationId);
    }
    currentFilterNotificationId = notificationManager.info("Đang lọc...", 0);

    setTimeout(() => {
        try {
            const cachedData = getCachedData();
            if (cachedData) {
                const filteredData = applyFiltersToInventory(cachedData);
                renderInventoryTable(cachedData);
                updateFilterCount(filteredData.length);

                // Remove loading notification
                if (currentFilterNotificationId) {
                    notificationManager.remove(currentFilterNotificationId);
                    currentFilterNotificationId = null;
                }

                // Show result notification
                notificationManager.success(
                    `Tìm thấy ${filteredData.length} sản phẩm`,
                    1500,
                    "Lọc hoàn tất",
                );
            } else {
                loadInventoryData();
                if (currentFilterNotificationId) {
                    notificationManager.remove(currentFilterNotificationId);
                    currentFilterNotificationId = null;
                }
            }
        } catch (error) {
            console.error("Error during filtering:", error);
            if (currentFilterNotificationId) {
                notificationManager.remove(currentFilterNotificationId);
                currentFilterNotificationId = null;
            }
            notificationManager.error("Có lỗi xảy ra khi lọc dữ liệu", 3000);
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
}, APP_CONFIG.FILTER_DEBOUNCE_DELAY);

function applyFilters() {
    debouncedApplyFilters();
}

// Toggle filter panel collapse
function toggleFilterPanel() {
    const filterBody = document.getElementById("filterBody");
    const filterToggleIcon = document.getElementById("filterToggleIcon");
    const filterHeader = document.getElementById("filterHeader");

    if (!filterBody || !filterToggleIcon) return;

    isFilterCollapsed = !isFilterCollapsed;

    if (isFilterCollapsed) {
        filterBody.classList.add("collapsed");
        filterHeader.classList.add("collapsed");
    } else {
        filterBody.classList.remove("collapsed");
        filterHeader.classList.remove("collapsed");
    }

    // Update icon
    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }
}

function initializeFilterEvents() {
    const filterSupplierSelect = document.getElementById("filterSupplier");
    const dateFromFilter = document.getElementById("dateFromFilter");
    const dateToFilter = document.getElementById("dateToFilter");
    const filterProductInput = document.getElementById("filterProduct");
    const quickFilterSelect = document.getElementById("quickFilter");
    const filterToggle = document.getElementById("filterToggle");
    const filterHeader = document.getElementById("filterHeader");

    quickFilterSelect.value = "all";

    // Filter collapse toggle
    if (filterToggle) {
        filterToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFilterPanel();
        });
    }

    if (filterHeader) {
        filterHeader.addEventListener("click", toggleFilterPanel);
    }

    // Quick filter
    if (quickFilterSelect) {
        quickFilterSelect.addEventListener("change", (e) => {
            const value = e.target.value;

            // If custom is selected, don't change date inputs
            if (value === "custom") {
                applyFilters();
                return;
            }

            // Clear custom date inputs for non-custom quick filters
            if (value !== "custom" && value !== "all") {
                if (dateFromFilter) dateFromFilter.value = "";
                if (dateToFilter) dateToFilter.value = "";
            }

            applyFilters();
        });
    }

    // Supplier filter
    if (filterSupplierSelect) {
        filterSupplierSelect.addEventListener("change", applyFilters);
    }

    // Date filters
    if (dateFromFilter) {
        dateFromFilter.addEventListener("change", (e) => {
            if (e.target.value && quickFilterSelect) {
                quickFilterSelect.value = "custom";
            }
            applyFilters();
        });
    }

    if (dateToFilter) {
        dateToFilter.addEventListener("change", (e) => {
            if (e.target.value && quickFilterSelect) {
                quickFilterSelect.value = "custom";
            }
            applyFilters();
        });
    }

    // Product search
    if (filterProductInput) {
        filterProductInput.addEventListener(
            "input",
            debounce(applyFilters, 300),
        );
    }
}

console.log("Modern filters system loaded");
