// js/filters.js - Filter System with Quick Filters

function createFilterSystem() {
    if (document.getElementById("improvedFilterSystem")) {
        return;
    }

    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISODate = new Date(today - tzOffset).toISOString().split("T")[0];

    const filterContainer = document.createElement("div");
    filterContainer.id = "improvedFilterSystem";
    filterContainer.className = "filter-system";
    filterContainer.innerHTML = `
        <div class="filter-header">
            <h3 class="filter-title">
                <i data-lucide="filter"></i>
                Bộ lọc
            </h3>
            <div class="filter-header-actions">
                <button id="toggleFilterBtn" class="btn-toggle-filter" title="Ẩn/Hiện bộ lọc">
                    <i data-lucide="chevron-down"></i>
                    <span>Hiện bộ lọc</span>
                </button>
                <button id="toggleTotalsBtn" class="btn-toggle-totals" title="Ẩn/Hiện tổng kết">
                    <i data-lucide="eye-off"></i>
                    <span>Hiện tổng kết</span>
                </button>
            </div>
        </div>

        <div id="filterContent" class="filter-content collapsed">
            <div class="quick-filters">
                <button class="quick-filter-btn" data-filter="all">Tất cả</button>
                <button class="quick-filter-btn" data-filter="today">Hôm nay</button>
                <button class="quick-filter-btn" data-filter="yesterday">Hôm qua</button>
                <button class="quick-filter-btn" data-filter="last7days">7 ngày qua</button>
                <button class="quick-filter-btn" data-filter="last30days">30 ngày qua</button>
                <button class="quick-filter-btn active" data-filter="thisweek">Tuần này</button>
                <button class="quick-filter-btn" data-filter="thismonth">Tháng này</button>
            </div>
            
            <div class="filter-row">
                <div class="filter-group">
                    <label>Từ ngày:</label>
                    <input type="date" id="startDateFilter" class="filter-input">
                </div>
                
                <div class="filter-group">
                    <label>Đến ngày:</label>
                    <input type="date" id="endDateFilter" class="filter-input">
                </div>
                
                <div class="filter-group">
                    <label>&nbsp;</label>
                    <div>
                        <button id="applyCustomFilterBtn" class="filter-btn apply-btn">Áp dụng</button>
                        <button id="clearFiltersBtn" class="filter-btn clear-btn">Xóa lọc</button>
                    </div>
                </div>
            </div>
            
            <div id="filterInfo" class="filter-info hidden"></div>
        </div>
    `;

    const tableContainer =
        document.querySelector(".table-container") ||
        (tableBody ? tableBody.parentNode : null);
    if (tableContainer && tableContainer.parentNode) {
        tableContainer.parentNode.insertBefore(filterContainer, tableContainer);
    }

    setTimeout(() => {
        attachFilterEventListeners();
        initializeDefaultFilter();
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }, 100);
}

function initializeDefaultFilter() {
    const thisWeekBtn = document.querySelector(
        '.quick-filter-btn[data-filter="thisweek"]',
    );
    if (thisWeekBtn) {
        setActiveQuickFilter(thisWeekBtn);
    }

    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - daysToMonday);
    const startOfWeekISO = startOfWeek.toISOString().split("T")[0];

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const endOfWeekISO = endOfWeek.toISOString().split("T")[0];

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    if (startDateFilter) startDateFilter.value = startOfWeekISO;
    if (endDateFilter) endDateFilter.value = endOfWeekISO;
}

function toggleFilterContent() {
    const filterContent = document.getElementById("filterContent");
    const toggleBtn = document.getElementById("toggleFilterBtn");
    const toggleIcon = toggleBtn.querySelector("i");
    const toggleText = toggleBtn.querySelector("span");

    if (filterContent) {
        filterContent.classList.toggle("collapsed");

        if (filterContent.classList.contains("collapsed")) {
            //toggleIcon.setAttribute("data-lucide", "chevron-down");
            toggleText.textContent = "Hiện bộ lọc";
        } else {
            //toggleIcon.setAttribute("data-lucide", "chevron-up");
            toggleText.textContent = "Ẩn bộ lọc";
        }

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

function attachFilterEventListeners() {
    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");
    const applyBtn = document.getElementById("applyCustomFilterBtn");
    const clearBtn = document.getElementById("clearFiltersBtn");
    const quickFilterBtns = document.querySelectorAll(".quick-filter-btn");
    const toggleTotalsBtn = document.getElementById("toggleTotalsBtn");
    const toggleFilterBtn = document.getElementById("toggleFilterBtn");

    if (startDateFilter)
        startDateFilter.addEventListener("change", handleDateRangeChange);
    if (endDateFilter)
        endDateFilter.addEventListener("change", handleDateRangeChange);
    if (applyBtn) applyBtn.addEventListener("click", applyFilters);
    if (clearBtn) clearBtn.addEventListener("click", clearAllFilters);
    if (toggleTotalsBtn)
        toggleTotalsBtn.addEventListener("click", toggleTotals);
    if (toggleFilterBtn)
        toggleFilterBtn.addEventListener("click", toggleFilterContent);

    quickFilterBtns.forEach((btn) => {
        btn.addEventListener("click", function () {
            const filterType = this.getAttribute("data-filter");
            setActiveQuickFilter(this);
            applyQuickFilter(filterType);
        });
    });
}

function setActiveQuickFilter(activeBtn) {
    document.querySelectorAll(".quick-filter-btn").forEach((btn) => {
        btn.classList.remove("active");
    });
    if (activeBtn) {
        activeBtn.classList.add("active");
    }
}

function applyQuickFilter(filterType) {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISODate = new Date(today - tzOffset).toISOString().split("T")[0];

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    let startDate = "";
    let endDate = "";

    switch (filterType) {
        case "all":
            startDate = "";
            endDate = "";
            break;

        case "today":
            startDate = localISODate;
            endDate = localISODate;
            break;

        case "yesterday":
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayISO = new Date(yesterday - tzOffset)
                .toISOString()
                .split("T")[0];
            startDate = yesterdayISO;
            endDate = yesterdayISO;
            break;

        case "last7days":
            const last7days = new Date(today);
            last7days.setDate(last7days.getDate() - 6);
            const last7daysISO = new Date(last7days - tzOffset)
                .toISOString()
                .split("T")[0];
            startDate = last7daysISO;
            endDate = localISODate;
            break;

        case "last30days":
            const last30days = new Date(today);
            last30days.setDate(last30days.getDate() - 29);
            const last30daysISO = new Date(last30days - tzOffset)
                .toISOString()
                .split("T")[0];
            startDate = last30daysISO;
            endDate = localISODate;
            break;

        case "thisweek":
            const dayOfWeek = today.getDay();
            const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - daysToMonday);
            const startOfWeekISO = new Date(startOfWeek - tzOffset)
                .toISOString()
                .split("T")[0];

            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            const endOfWeekISO = new Date(endOfWeek - tzOffset)
                .toISOString()
                .split("T")[0];

            startDate = startOfWeekISO;
            endDate = endOfWeekISO;
            break;

        case "thismonth":
            const startOfMonth = new Date(
                today.getFullYear(),
                today.getMonth(),
                1,
            );
            const startOfMonthISO = new Date(startOfMonth - tzOffset)
                .toISOString()
                .split("T")[0];
            startDate = startOfMonthISO;
            endDate = localISODate;
            break;
    }

    if (startDateFilter) startDateFilter.value = startDate;
    if (endDateFilter) endDateFilter.value = endDate;

    currentFilters.startDate = startDate || null;
    currentFilters.endDate = endDate || null;

    applyFilters();
}

function setThisWeekFilter(updateUI = true) {
    if (isFilteringInProgress) return;

    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;

    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - daysToMonday);
    const startOfWeekISO = new Date(startOfWeek - tzOffset)
        .toISOString()
        .split("T")[0];

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const endOfWeekISO = new Date(endOfWeek - tzOffset)
        .toISOString()
        .split("T")[0];

    currentFilters.startDate = startOfWeekISO;
    currentFilters.endDate = endOfWeekISO;

    if (updateUI) {
        const startDateFilter = document.getElementById("startDateFilter");
        const endDateFilter = document.getElementById("endDateFilter");

        if (startDateFilter) startDateFilter.value = startOfWeekISO;
        if (endDateFilter) endDateFilter.value = endOfWeekISO;

        applyFilters();
    }
}

function handleDateRangeChange() {
    setActiveQuickFilter(null);
}

function clearAllFilters() {
    if (isFilteringInProgress) return;

    const startDateFilter = document.getElementById("startDateFilter");
    const endDateFilter = document.getElementById("endDateFilter");

    if (startDateFilter) startDateFilter.value = "";
    if (endDateFilter) endDateFilter.value = "";

    currentFilters = {
        startDate: null,
        endDate: null,
        status: "all",
    };

    const allBtn = document.querySelector(
        '.quick-filter-btn[data-filter="all"]',
    );
    setActiveQuickFilter(allBtn);

    applyFilters();
}

function toggleTotals() {
    const totalSummary = document.querySelector(".total-summary");
    const toggleBtn = document.getElementById("toggleTotalsBtn");
    const toggleIcon = toggleBtn.querySelector("i");
    const toggleText = toggleBtn.querySelector("span");

    if (totalSummary) {
        totalSummary.classList.toggle("hidden");

        if (totalSummary.classList.contains("hidden")) {
            toggleIcon.setAttribute("data-lucide", "eye");
            toggleText.textContent = "Hiện tổng kết";
        } else {
            toggleIcon.setAttribute("data-lucide", "eye-off");
            toggleText.textContent = "Ẩn tổng kết";
        }

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

function debouncedApplyFilters() {
    if (isFilteringInProgress) return;

    if (filterTimeout) {
        clearTimeout(filterTimeout);
    }

    filterTimeout = setTimeout(() => {
        applyFilters();
    }, APP_CONFIG.FILTER_DEBOUNCE_DELAY);
}

// FIXED: Re-render table with filtered data instead of hiding rows
function applyFilters() {
    if (isFilteringInProgress) return;
    if (!arrayData || arrayData.length === 0) return;

    isFilteringInProgress = true;

    let loadingNotificationId = null;
    if (globalNotificationManager) {
        loadingNotificationId = globalNotificationManager.loadingData(
            "Đang lọc dữ liệu...",
        );
    } else {
        showLoading("Đang lọc dữ liệu...");
    }

    setTimeout(() => {
        try {
            // Filter the data array
            let filteredData = arrayData;

            if (currentFilters.startDate || currentFilters.endDate) {
                filteredData = arrayData.filter((item) => {
                    const timestamp = parseInt(item.dateCell);
                    const itemDate = new Date(timestamp);

                    return checkDateInRange(
                        itemDate,
                        currentFilters.startDate,
                        currentFilters.endDate,
                    );
                });
            }

            const visibleCount = filteredData.length;

            // Re-render table with filtered data
            if (typeof renderFilteredTable === "function") {
                renderFilteredTable(filteredData);
            }

            updateFilterInfo(visibleCount, arrayData.length);

            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.success(
                    `Hiển thị ${visibleCount} báo cáo`,
                    2000,
                );
            } else {
                showSuccess(`Hiển thị ${visibleCount} báo cáo`);
            }

            // Update totals after filtering
            if (typeof updateAllTotals === "function") {
                setTimeout(() => updateAllTotals(), 100);
            }
        } catch (error) {
            console.error("Error during filtering:", error);
            if (globalNotificationManager) {
                globalNotificationManager.clearAll();
                globalNotificationManager.error(
                    "Có lỗi xảy ra khi lọc dữ liệu",
                    3000,
                    "Lỗi",
                );
            } else {
                showError("Có lỗi xảy ra khi lọc dữ liệu");
            }
        } finally {
            isFilteringInProgress = false;
        }
    }, 100);
}

function checkDateInRange(rowDate, startDateStr, endDateStr) {
    if (!startDateStr && !endDateStr) return true;
    if (!rowDate) return false;

    const rowTime = rowDate.getTime();

    if (startDateStr) {
        const startTime = new Date(startDateStr + "T00:00:00").getTime();
        if (rowTime < startTime) return false;
    }

    if (endDateStr) {
        const endTime = new Date(endDateStr + "T23:59:59").getTime();
        if (rowTime > endTime) return false;
    }

    return true;
}

function updateFilterInfo(visibleCount, totalCount) {
    const filterInfo = document.getElementById("filterInfo");
    if (!filterInfo) return;

    if (visibleCount !== totalCount) {
        let filterText = `Hiển thị ${visibleCount.toLocaleString()} / ${totalCount.toLocaleString()} báo cáo`;

        if (currentFilters.startDate || currentFilters.endDate) {
            const startStr = currentFilters.startDate
                ? formatDateForDisplay(currentFilters.startDate)
                : "";
            const endStr = currentFilters.endDate
                ? formatDateForDisplay(currentFilters.endDate)
                : "";

            if (startStr && endStr) {
                if (startStr === endStr) {
                    filterText += ` (ngày ${startStr})`;
                } else {
                    filterText += ` (từ ${startStr} đến ${endStr})`;
                }
            } else if (startStr) {
                filterText += ` (từ ${startStr})`;
            } else if (endStr) {
                filterText += ` (đến ${endStr})`;
            }
        }

        filterInfo.innerHTML = filterText;
        filterInfo.classList.remove("hidden");
    } else {
        filterInfo.classList.add("hidden");
    }
}

function formatDateForDisplay(dateStr) {
    if (!dateStr) return "";

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

// Export functions
window.createFilterSystem = createFilterSystem;
window.attachFilterEventListeners = attachFilterEventListeners;
window.applyFilters = applyFilters;
window.setThisWeekFilter = setThisWeekFilter;
window.clearAllFilters = clearAllFilters;
window.applyQuickFilter = applyQuickFilter;
window.toggleTotals = toggleTotals;
window.toggleFilterContent = toggleFilterContent;
window.initializeDefaultFilter = initializeDefaultFilter;
window.checkDateInRange = checkDateInRange;
