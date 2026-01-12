// =====================================================
// FILTERS SYSTEM - DEFAULT TODAY FILTER
// =====================================================

let isFilteringInProgress = false;

function applyFiltersToInventory(dataArray) {
    const quickFilter =
        document.getElementById("quickDateFilter")?.value || "all";
    const dateFrom = document.getElementById("dateFromFilter")?.value || "";
    const dateTo = document.getElementById("dateToFilter")?.value || "";
    const filterProductText =
        document.getElementById("filterProduct")?.value.toLowerCase().trim() ||
        "";

    return dataArray.filter((item) => {
        let matchDate = true;

        // Quick date filter
        if (quickFilter !== "all" && quickFilter !== "custom") {
            const itemDate =
                parseVietnameseDate(item.ngayNhan) ||
                parseVietnameseDate(item.ngayDatHang) ||
                parseVietnameseDate(item.thoiGianUpload);

            if (itemDate) {
                // Get current date in GMT+7
                const now = new Date();

                // Normalize to start of day (00:00:00)
                const todayStart = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                    0,
                    0,
                    0,
                    0,
                );

                // Normalize item date to start of day for comparison
                const itemDateStart = new Date(
                    itemDate.getFullYear(),
                    itemDate.getMonth(),
                    itemDate.getDate(),
                    0,
                    0,
                    0,
                    0,
                );

                let startDate, endDate;

                switch (quickFilter) {
                    case "today":
                        startDate = new Date(todayStart);
                        endDate = new Date(todayStart);
                        break;

                    case "yesterday":
                        startDate = new Date(todayStart);
                        startDate.setDate(startDate.getDate() - 1);
                        endDate = new Date(startDate);
                        break;

                    case "last7days":
                        startDate = new Date(todayStart);
                        startDate.setDate(startDate.getDate() - 6);
                        endDate = new Date(todayStart);
                        break;

                    case "last30days":
                        startDate = new Date(todayStart);
                        startDate.setDate(startDate.getDate() - 29);
                        endDate = new Date(todayStart);
                        break;

                    case "thisMonth":
                        startDate = new Date(
                            now.getFullYear(),
                            now.getMonth(),
                            1,
                            0,
                            0,
                            0,
                            0,
                        );
                        endDate = new Date(
                            now.getFullYear(),
                            now.getMonth() + 1,
                            0,
                            0,
                            0,
                            0,
                            0,
                        );
                        break;

                    case "lastMonth":
                        startDate = new Date(
                            now.getFullYear(),
                            now.getMonth() - 1,
                            1,
                            0,
                            0,
                            0,
                            0,
                        );
                        endDate = new Date(
                            now.getFullYear(),
                            now.getMonth(),
                            0,
                            0,
                            0,
                            0,
                            0,
                        );
                        break;

                    default:
                        startDate = new Date(todayStart);
                        endDate = new Date(todayStart);
                }

                // Compare dates (all normalized to 00:00:00)
                matchDate =
                    itemDateStart >= startDate && itemDateStart <= endDate;
            } else {
                matchDate = false;
            }
        }

        // Custom date range filter
        if (dateFrom || dateTo) {
            const itemDate =
                parseVietnameseDate(item.ngayNhan) ||
                parseVietnameseDate(item.ngayDatHang) ||
                parseVietnameseDate(item.thoiGianUpload);

            if (itemDate) {
                // Normalize to start of day
                const itemDateStart = new Date(
                    itemDate.getFullYear(),
                    itemDate.getMonth(),
                    itemDate.getDate(),
                    0,
                    0,
                    0,
                    0,
                );

                if (dateFrom) {
                    const fromDate = parseVietnameseDate(dateFrom);
                    if (fromDate) {
                        const fromDateStart = new Date(
                            fromDate.getFullYear(),
                            fromDate.getMonth(),
                            fromDate.getDate(),
                            0,
                            0,
                            0,
                            0,
                        );
                        if (itemDateStart < fromDateStart) {
                            matchDate = false;
                        }
                    }
                }

                if (dateTo && matchDate) {
                    const toDate = parseVietnameseDate(dateTo);
                    if (toDate) {
                        const toDateStart = new Date(
                            toDate.getFullYear(),
                            toDate.getMonth(),
                            toDate.getDate(),
                            0,
                            0,
                            0,
                            0,
                        );
                        if (itemDateStart > toDateStart) {
                            matchDate = false;
                        }
                    }
                }
            } else {
                matchDate = false;
            }
        }

        // Product filter - search across all fields
        let matchProduct = true;
        if (filterProductText) {
            const searchableFields = [
                item.tenSanPham,
                item.maSanPham,
                item.bienThe,
                item.nhaCungCap,
                item.hoaDon,
                item.ghiChu,
                item.ngayDatHang,
                item.soLuong?.toString(),
                item.giaMua?.toString(),
                item.giaBan?.toString(),
            ];

            matchProduct = searchableFields.some((field) => {
                if (!field) return false;
                return field
                    .toString()
                    .toLowerCase()
                    .includes(filterProductText);
            });
        }

        return matchDate && matchProduct;
    });
}

function updateFilterOptions(fullDataArray) {
    // No longer needed
}

const debouncedApplyFilters = Utils.debounce(() => {
    if (isFilteringInProgress) return;
    isFilteringInProgress = true;

    const notifId = notifyManager.processing("Đang lọc dữ liệu...");

    setTimeout(() => {
        try {
            const cachedData = getCachedData();
            if (cachedData) {
                renderInventoryTable(cachedData);
            } else {
                loadInventoryData();
            }
            notifyManager.remove(notifId);
            notifyManager.success("Lọc dữ liệu hoàn tất!", 1500);
        } catch (error) {
            console.error("Error during filtering:", error);
            notifyManager.remove(notifId);
            notifyManager.error("Có lỗi xảy ra khi lọc dữ liệu");
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
}, APP_CONFIG.FILTER_DEBOUNCE_DELAY);

function applyFilters() {
    debouncedApplyFilters();
}

function initializeFilterEvents() {
    const quickDateFilter = document.getElementById("quickDateFilter");
    const dateFromFilter = document.getElementById("dateFromFilter");
    const dateToFilter = document.getElementById("dateToFilter");
    const filterProductInput = document.getElementById("filterProduct");

    // SET DEFAULT TO "TODAY"
    if (quickDateFilter) {
        quickDateFilter.value = "all";
        console.log("Filter initialized with default: TODAY");
    }

    if (quickDateFilter) {
        quickDateFilter.addEventListener("change", () => {
            if (
                quickDateFilter.value !== "all" &&
                quickDateFilter.value !== "custom"
            ) {
                if (dateFromFilter) dateFromFilter.value = "";
                if (dateToFilter) dateToFilter.value = "";
            }
            applyFilters();
        });
    }

    if (dateFromFilter) {
        dateFromFilter.addEventListener("change", () => {
            if (quickDateFilter && dateFromFilter.value) {
                quickDateFilter.value = "custom";
            }
            applyFilters();
        });
    }

    if (dateToFilter) {
        dateToFilter.addEventListener("change", () => {
            if (quickDateFilter && dateToFilter.value) {
                quickDateFilter.value = "custom";
            }
            applyFilters();
        });
    }

    if (filterProductInput) {
        filterProductInput.addEventListener(
            "input",
            Utils.debounce(applyFilters, 300),
        );
    }
}

// Debug function to test date filtering
window.debugDateFilter = function () {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        console.log("No data available");
        return;
    }

    console.log("=== DATE FILTER DEBUG ===");
    console.log("Total items:", cachedData.length);

    // Show first few items with their dates
    console.log("\nFirst 5 items dates:");
    cachedData.slice(0, 5).forEach((item, i) => {
        console.log(`Item ${i + 1}:`, {
            ngayNhan: item.ngayNhan,
            ngayDatHang: item.ngayDatHang,
            thoiGianUpload: item.thoiGianUpload,
            parsed: parseVietnameseDate(
                item.ngayNhan || item.ngayDatHang || item.thoiGianUpload,
            ),
        });
    });

    // Test today filter
    const now = new Date();
    const todayStr = now.toLocaleDateString("vi-VN");
    console.log("\nToday:", todayStr);

    const todayItems = cachedData.filter((item) => {
        const itemDate = parseVietnameseDate(
            item.ngayNhan || item.ngayDatHang || item.thoiGianUpload,
        );
        if (!itemDate) return false;
        const itemDateStart = new Date(
            itemDate.getFullYear(),
            itemDate.getMonth(),
            itemDate.getDate(),
            0,
            0,
            0,
            0,
        );
        const todayStart = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0,
        );
        return itemDateStart.getTime() === todayStart.getTime();
    });

    console.log("Items matching today:", todayItems.length);
    if (todayItems.length > 0) {
        console.log(
            "Sample today items:",
            todayItems.slice(0, 3).map((item) => ({
                tenSanPham: item.tenSanPham,
                ngayDatHang: item.ngayDatHang,
                ngayNhan: item.ngayNhan,
            })),
        );
    }
};

console.log("✅ Filters system loaded - Default: TODAY");
console.log("Run debugDateFilter() in console to test date filtering");
