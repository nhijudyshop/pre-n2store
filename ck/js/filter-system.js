// filter-system.js - FIXED VERSION with Lucide Icons and Quick Filters
// High-Performance Filter System with CORRECTED Checkbox Logic and Hidden by Default

class FilterManager {
    constructor() {
        this.filters = APP_STATE.currentFilters;
        this.isProcessing = false;
        this.dateSlider = null;
        this.filterWorker = null;
        this.indexedData = null;
        this.filterCache = new Map();
        this.lastFilterHash = null;

        // Performance optimization settings based on device
        this.settings = deviceDetector.getOptimalSettings();
        this.chunkSize = this.settings.filterChunkSize;

        this.init();
    }

    init() {
        this.createFilterToggleButton(); // Create toggle button first
        this.createFilterUI();
        this.bindEvents();
        this.initializeWorker();
        this.initDateSlider();

        // NOTE: Search input is now handled by SimpleSearchManager
        // No longer binding search events in FilterManager to avoid conflicts

        console.log(
            "Filter system initialized with chunk size:",
            this.chunkSize,
        );
    }

    initSearchInput() {
        // Try multiple ways to get the search input
        let contentSearchInput =
            document.getElementById("contentSearchInput") ||
            document.querySelector("#contentSearchInput") ||
            domManager.get("#contentSearchInput");

        if (!contentSearchInput) {
            console.warn(
                "⚠️ Search input not found, will retry later...",
            );
            return;
        }

        // Skip if already initialized
        if (contentSearchInput._searchInitialized) {
            console.log("ℹ️ Search input already initialized, skipping");
            return;
        }

        console.log("🔍 Initializing search input:", contentSearchInput.id);

        // Remove existing event listener if any
        if (contentSearchInput._searchListener) {
            contentSearchInput.removeEventListener(
                "input",
                contentSearchInput._searchListener,
            );
            contentSearchInput.removeEventListener(
                "change",
                contentSearchInput._searchListener,
            );
        }

        // Create search handler without debounce for better responsiveness
        const searchHandler = (e) => {
            console.log(
                "🎯 Search event fired! Value:",
                e.target.value,
            );
            this.handleSearchChange();
        };

        // Store reference for cleanup
        contentSearchInput._searchListener = searchHandler;
        contentSearchInput._searchInitialized = true;

        // Bind event to both input and change
        contentSearchInput.addEventListener("input", searchHandler);
        contentSearchInput.addEventListener("change", searchHandler);

        console.log("✅ Search input initialized successfully");
        console.log("✅ Event listeners attached");

        // Test removeVietnameseAccents availability
        if (typeof removeVietnameseAccents === "function") {
            console.log("✅ removeVietnameseAccents is available");
        } else {
            console.error("❌ removeVietnameseAccents NOT FOUND!");
        }
    }

    initDateSlider() {
        if (typeof DateSliderManager !== "undefined") {
            this.dateSlider = new DateSliderManager();
            this.dateSlider.init(this);
            window.dateSliderManager = this.dateSlider;
            console.log("Date Slider integrated successfully");
        } else {
            console.warn(
                "DateSliderManager not found. Please include date-slider.js",
            );
        }
    }

    createFilterToggleButton() {
        // Remove existing toggle if present
        const existingToggle = document.getElementById("filterToggleContainer");
        if (existingToggle) {
            existingToggle.remove();
        }

        const toggleContainer = domManager.create("div", {
            id: "filterToggleContainer",
            className: "filter-toggle-container",
            innerHTML: `
                <button id="filterToggleBtn" class="filter-toggle-btn">
                    <i data-lucide="sliders"></i>
                    <span>Hiện Bộ Lọc</span>
                </button>
                <div class="filter-status-badge">
                    <span>Đang lọc: <strong id="mainFilterLabel">30 Ngày Qua</strong></span>
                </div>
            `,
        });

        const tableContainer = domManager.get(SELECTORS.tableContainer);
        if (tableContainer && tableContainer.parentNode) {
            tableContainer.parentNode.insertBefore(
                toggleContainer,
                tableContainer,
            );
        }

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Bind toggle event
        const toggleBtn = document.getElementById("filterToggleBtn");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", () =>
                this.toggleFilterSystem(),
            );
        }
    }

    toggleFilterSystem() {
        const filterSystem = domManager.get(SELECTORS.filterSystem);
        const toggleBtn = document.getElementById("filterToggleBtn");

        if (filterSystem && toggleBtn) {
            filterSystem.classList.toggle("hidden");

            const isHidden = filterSystem.classList.contains("hidden");
            const btnText = toggleBtn.querySelector("span");
            const btnIcon = toggleBtn.querySelector("i");

            if (btnText) {
                btnText.textContent = isHidden ? "Hiện Bộ Lọc" : "Ẩn Bộ Lọc";
            }

            if (btnIcon) {
                btnIcon.setAttribute("data-lucide", isHidden ? "sliders" : "x");
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            }
        }
    }

    createFilterUI() {
        const existingFilter = domManager.get(SELECTORS.filterSystem);
        if (existingFilter) {
            existingFilter.remove();
        }

        const vietnamToday = VietnamTime.getDateString();

        console.log("Creating filter UI with Vietnam date:", {
            vietnamToday: vietnamToday,
            systemDate: new Date().toISOString().split("T")[0],
            vietnamTime: VietnamTime.now(),
        });

        const filterContainer = domManager.create("div", {
            id: "improvedFilterSystem",
            className: "filter-system hidden", // Hidden by default
            innerHTML: this.getFilterHTML(vietnamToday),
        });

        const tableContainer = domManager.get(SELECTORS.tableContainer);
        if (tableContainer && tableContainer.parentNode) {
            tableContainer.parentNode.insertBefore(
                filterContainer,
                tableContainer,
            );
        }

        // Set default to "Last 30 Days"
        const last30DaysRange = this.getDateRange("last30days");
        this.filters.startDate = last30DaysRange.start;
        this.filters.endDate = last30DaysRange.end;
        this.filters.searchText = ""; // Initialize search text

        console.log(
            "Filter initialized with Last 30 Days (hidden):",
            this.filters,
        );

        // Initialize Lucide icons for search icon
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    getFilterHTML(localISODate) {
        return `
        <style>
            .filter-toggle-container {
                margin: 20px 20px 0 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 15px;
            }

            .filter-toggle-btn {
                padding: 12px 24px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                font-size: 15px;
                font-weight: 600;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .filter-toggle-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
            }

            .filter-toggle-btn i {
                width: 20px;
                height: 20px;
            }

            .filter-status-badge {
                padding: 8px 16px;
                background: linear-gradient(135deg, #e7f3ff, #cce7ff);
                border: 2px solid #b3d4fc;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                color: #0c5460;
            }

            .filter-system {
                background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                padding: 20px;
                border-radius: 12px;
                margin: 20px;
                border: 1px solid #dee2e6;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                transition: all 0.3s ease;
                position: relative;
            }

            .filter-system.hidden {
                display: none;
            }
            
            .timezone-indicator {
                position: absolute;
                top: 8px;
                right: 8px;
                background: #e3f2fd;
                color: #1976d2;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                border: 1px solid #bbdefb;
            }

            .quick-filter-toggle {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
                padding-bottom: 15px;
                border-bottom: 2px solid #dee2e6;
            }

            .quick-filter-toggle-btn {
                padding: 8px 16px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.3s ease;
                box-shadow: 0 2px 5px rgba(102, 126, 234, 0.3);
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .quick-filter-toggle-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }

            .quick-filter-toggle-btn i {
                width: 16px;
                height: 16px;
            }

            .quick-filter-label {
                font-weight: 600;
                color: #495057;
                font-size: 14px;
            }

            .quick-filters {
                display: none;
                gap: 10px;
                flex-wrap: wrap;
                margin-bottom: 15px;
                padding: 15px;
                background: white;
                border-radius: 8px;
                border: 2px solid #e9ecef;
                animation: slideDown 0.3s ease;
            }

            .quick-filters.show {
                display: flex;
            }

            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .quick-filter-btn {
                padding: 8px 16px;
                border: 2px solid #dee2e6;
                background: white;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                color: #495057;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .quick-filter-btn:hover {
                border-color: #667eea;
                color: #667eea;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
            }

            .quick-filter-btn.active {
                background: linear-gradient(135deg, #667eea, #764ba2);
                border-color: #667eea;
                color: white;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }

            .quick-filter-btn i {
                width: 14px;
                height: 14px;
            }
            
            .filter-row {
                display: flex;
                gap: 15px;
                align-items: end;
                flex-wrap: wrap;
                margin-bottom: 15px;
            }
            
            .filter-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
                min-width: 150px;
                position: relative;
            }
            
            .filter-group label {
                font-weight: 600;
                color: #495057;
                font-size: 14px;
                margin-bottom: 5px;
            }
            
            .filter-input, .filter-select {
                padding: 10px 14px;
                border: 2px solid #ced4da;
                border-radius: 8px;
                background: white;
                font-size: 14px;
                transition: all 0.3s ease;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            
            .filter-input:focus, .filter-select:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
                transform: translateY(-1px);
            }
            
            .filter-btn {
                padding: 10px 18px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.3s ease;
                margin-right: 8px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }
            
            .filter-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            
            .clear-btn {
                background: linear-gradient(135deg, #dc3545, #c82333);
                color: white;
            }
            
            .today-btn {
                background: linear-gradient(135deg, #17a2b8, #138496);
                color: white;
            }
            
            .all-btn {
                background: linear-gradient(135deg, #28a745, #218838);
                color: white;
            }
            
            .filter-info {
                background: linear-gradient(135deg, #e7f3ff, #cce7ff);
                border: 2px solid #b3d4fc;
                padding: 12px;
                border-radius: 8px;
                font-size: 13px;
                color: #0c5460;
                text-align: center;
                margin-top: 15px;
                animation: slideIn 0.3s ease;
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .hidden {
                display: none;
            }
            
            @media (max-width: 768px) {
                .filter-toggle-container {
                    flex-direction: column;
                    gap: 10px;
                    align-items: stretch;
                }

                .filter-row {
                    flex-direction: column;
                    align-items: stretch;
                }
                
                .filter-group {
                    min-width: auto;
                }
                
                .timezone-indicator {
                    position: static;
                    margin-bottom: 10px;
                    align-self: flex-start;
                }

                .quick-filters {
                    gap: 8px;
                }

                .quick-filter-btn {
                    font-size: 12px;
                    padding: 6px 12px;
                }
            }
        </style>
        
        <div class="timezone-indicator">GMT+7 (Vietnam Time)</div>

        <div class="quick-filter-toggle">
            <button id="quickFilterToggleBtn" class="quick-filter-toggle-btn">
                <i data-lucide="filter"></i>
                <span>Lọc Nhanh</span>
            </button>
            <span class="quick-filter-label">Đang lọc: <strong id="currentFilterLabel">30 Ngày Qua</strong></span>
        </div>

        <div id="quickFilters" class="quick-filters">
            <button class="quick-filter-btn" data-filter="all">
                <i data-lucide="list"></i>
                Tất Cả
            </button>
            <button class="quick-filter-btn" data-filter="today">
                <i data-lucide="calendar"></i>
                Hôm Nay
            </button>
            <button class="quick-filter-btn" data-filter="yesterday">
                <i data-lucide="calendar-minus"></i>
                Hôm Qua
            </button>
            <button class="quick-filter-btn" data-filter="last7days">
                <i data-lucide="calendar-range"></i>
                7 Ngày Qua
            </button>
            <button class="quick-filter-btn active" data-filter="last30days">
                <i data-lucide="calendar-clock"></i>
                30 Ngày Qua
            </button>
            <button class="quick-filter-btn" data-filter="thisMonth">
                <i data-lucide="calendar-check"></i>
                Tháng Này
            </button>
            <button class="quick-filter-btn" data-filter="lastMonth">
                <i data-lucide="calendar-x"></i>
                Tháng Trước
            </button>
        </div>

        <div class="filter-row">
            <div class="filter-group">
                <label>Từ ngày:</label>
                <input type="date" id="startDateFilter" class="filter-input" value="${localISODate}">
            </div>

            <div class="filter-group">
                <label>Đến ngày:</label>
                <input type="date" id="endDateFilter" class="filter-input" value="${localISODate}">
            </div>

            <div class="filter-group">
                <label for="statusFilterDropdown">Trạng thái:</label>
                <select id="statusFilterDropdown" class="filter-select">
                    <option value="all">Tất cả</option>
                    <option value="active">Chưa đi đơn</option>
                    <option value="completed">Đã đi đơn</option>
                </select>
            </div>

            <div class="filter-group">
                <label>&nbsp;</label>
                <div>
                    <button id="todayFilterBtn" class="filter-btn today-btn">📅 Hôm nay (VN)</button>
                    <button id="allFilterBtn" class="filter-btn all-btn">📋 Tất cả</button>
                    <button id="clearFiltersBtn" class="filter-btn clear-btn">🗑️ Xóa lọc</button>
                </div>
            </div>
        </div>
        
        <div id="filterInfo" class="filter-info hidden"></div>
        <div id="filterPerformance" class="filter-performance"></div>
    `;
    }

    bindEvents() {
        const debouncedDateChange = throttleManager.debounce(
            () => this.handleDateRangeChange(),
            CONFIG.performance.FILTER_DEBOUNCE_DELAY,
            "dateFilter",
        );

        const debouncedStatusChange = throttleManager.debounce(
            () => this.handleFilterChange(),
            CONFIG.performance.FILTER_DEBOUNCE_DELAY,
            "statusFilter",
        );

        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);
        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);
        const todayBtn = domManager.get(SELECTORS.todayFilterBtn);
        const allBtn = domManager.get(SELECTORS.allFilterBtn);
        const clearBtn = domManager.get(SELECTORS.clearFiltersBtn);

        if (startDateFilter)
            startDateFilter.addEventListener("change", debouncedDateChange);
        if (endDateFilter)
            endDateFilter.addEventListener("change", debouncedDateChange);
        if (statusFilter)
            statusFilter.addEventListener("change", debouncedStatusChange);
        // Note: Search input is bound separately in initSearchInput()
        if (todayBtn)
            todayBtn.addEventListener("click", () => this.setTodayFilter());
        if (allBtn) allBtn.addEventListener("click", () => this.setAllFilter());
        if (clearBtn)
            clearBtn.addEventListener("click", () => this.clearAllFilters());

        // Quick filter toggle button
        const quickFilterToggleBtn = document.getElementById(
            "quickFilterToggleBtn",
        );
        if (quickFilterToggleBtn) {
            quickFilterToggleBtn.addEventListener("click", () =>
                this.toggleQuickFilters(),
            );
        }

        // Quick filter buttons
        const quickFilterBtns = document.querySelectorAll(".quick-filter-btn");
        quickFilterBtns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const filterType = e.currentTarget.getAttribute("data-filter");
                this.applyQuickFilter(filterType);
            });
        });
    }

    toggleQuickFilters() {
        const quickFilters = document.getElementById("quickFilters");
        const toggleBtn = document.getElementById("quickFilterToggleBtn");

        if (quickFilters) {
            quickFilters.classList.toggle("show");

            // Update button icon
            const icon = toggleBtn.querySelector("i");
            if (icon) {
                const isShown = quickFilters.classList.contains("show");
                icon.setAttribute(
                    "data-lucide",
                    isShown ? "filter-x" : "filter",
                );
                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }
            }
        }
    }

    getDateRange(filterType) {
        const now = new Date();
        const today = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
        );

        switch (filterType) {
            case "all":
                return { start: null, end: null };

            case "today":
                return {
                    start: VietnamTime.getDateString(today),
                    end: VietnamTime.getDateString(today),
                };

            case "yesterday":
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                return {
                    start: VietnamTime.getDateString(yesterday),
                    end: VietnamTime.getDateString(yesterday),
                };

            case "last7days":
                const sevenDaysAgo = new Date(today);
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
                return {
                    start: VietnamTime.getDateString(sevenDaysAgo),
                    end: VietnamTime.getDateString(today),
                };

            case "last30days":
                const thirtyDaysAgo = new Date(today);
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
                return {
                    start: VietnamTime.getDateString(thirtyDaysAgo),
                    end: VietnamTime.getDateString(today),
                };

            case "thisMonth":
                const firstDayThisMonth = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    1,
                );
                const lastDayThisMonth = new Date(
                    now.getFullYear(),
                    now.getMonth() + 1,
                    0,
                );
                return {
                    start: VietnamTime.getDateString(firstDayThisMonth),
                    end: VietnamTime.getDateString(lastDayThisMonth),
                };

            case "lastMonth":
                const firstDayLastMonth = new Date(
                    now.getFullYear(),
                    now.getMonth() - 1,
                    1,
                );
                const lastDayLastMonth = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    0,
                );
                return {
                    start: VietnamTime.getDateString(firstDayLastMonth),
                    end: VietnamTime.getDateString(lastDayLastMonth),
                };

            default:
                return { start: null, end: null };
        }
    }

    applyQuickFilter(filterType) {
        if (this.isProcessing || APP_STATE.isOperationInProgress) {
            console.log("Filter already in progress, skipping quick filter");
            return;
        }

        const dateRange = this.getDateRange(filterType);
        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);

        // FIXED: Cập nhật date inputs với giá trị chính xác
        if (startDateFilter) {
            startDateFilter.value = dateRange.start || "";
            console.log(`Set start date: ${startDateFilter.value}`);
        }
        if (endDateFilter) {
            endDateFilter.value = dateRange.end || "";
            console.log(`Set end date: ${endDateFilter.value}`);
        }

        // FIXED: Cập nhật filters state
        this.filters.startDate = dateRange.start;
        this.filters.endDate = dateRange.end;

        // FIXED: Reset status filter to 'all' khi apply quick filter
        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);
        if (statusFilter) {
            statusFilter.value = "all";
            this.filters.status = "all";
        }

        // FIXED: Remove active class from all buttons first
        const quickFilterBtns = document.querySelectorAll(".quick-filter-btn");
        quickFilterBtns.forEach((btn) => {
            btn.classList.remove("active");
        });

        // FIXED: Add active class to correct button
        const activeBtn = document.querySelector(
            `.quick-filter-btn[data-filter="${filterType}"]`,
        );
        if (activeBtn) {
            activeBtn.classList.add("active");
        }

        // Update labels
        const labelMap = {
            all: "Tất Cả",
            today: "Hôm Nay",
            yesterday: "Hôm Qua",
            last7days: "7 Ngày Qua",
            last30days: "30 Ngày Qua",
            thisMonth: "Tháng Này",
            lastMonth: "Tháng Trước",
        };

        const currentFilterLabel =
            document.getElementById("currentFilterLabel");
        const mainFilterLabel = document.getElementById("mainFilterLabel");

        if (currentFilterLabel) {
            currentFilterLabel.textContent =
                labelMap[filterType] || "Tùy Chỉnh";
        }
        if (mainFilterLabel) {
            mainFilterLabel.textContent = labelMap[filterType] || "Tùy Chỉnh";
        }

        console.log("Quick filter applied:", {
            type: filterType,
            dateRange: dateRange,
            filters: this.filters,
        });

        this.syncDateSliderWithFilters();

        // Apply the filter
        this.applyFilters();
    }

    syncDateSliderWithFilters() {
        if (this.dateSlider && this.filters.startDate && this.filters.endDate) {
            this.dateSlider.setDateRange(
                this.filters.startDate,
                this.filters.endDate,
            );
        } else if (this.dateSlider) {
            this.dateSlider.clearSelection();
        }
    }

    initializeWorker() {
        if (
            typeof Worker !== "undefined" &&
            this.settings.enableWebWorkers !== false
        ) {
            try {
                const workerCode = this.getWorkerCode();
                const blob = new Blob([workerCode], {
                    type: "application/javascript",
                });
                this.filterWorker = new Worker(URL.createObjectURL(blob));

                this.filterWorker.onmessage = (e) => {
                    this.handleWorkerResult(e.data);
                };

                this.filterWorker.onerror = (error) => {
                    console.warn("Filter worker error:", error);
                    this.filterWorker = null;
                };

                console.log("Filter worker initialized");
            } catch (error) {
                console.warn("Could not initialize filter worker:", error);
                this.filterWorker = null;
            }
        }
    }

    getWorkerCode() {
        return `
        const VietnamTime = {
            VIETNAM_OFFSET: 7 * 60,
            
            getDateRange(dateString) {
                if (!dateString) return null;
                
                const [year, month, day] = dateString.split('-').map(Number);
                const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
                const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
                
                return {
                    start: startOfDay.getTime(),
                    end: endOfDay.getTime()
                };
            }
        };
        
        self.onmessage = function(e) {
            const { data, filters, chunkSize } = e.data;
            
            try {
                const result = filterData(data, filters, chunkSize);
                self.postMessage({
                    success: true,
                    result: result,
                    filteredCount: result.length
                });
            } catch (error) {
                self.postMessage({
                    success: false,
                    error: error.message
                });
            }
        };
        
        function filterData(data, filters, chunkSize) {
            const { startDate, endDate, status } = filters;
            const filtered = [];
            
            const startRange = startDate ? VietnamTime.getDateRange(startDate) : null;
            const endRange = endDate ? VietnamTime.getDateRange(endDate) : null;
            
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                
                for (const item of chunk) {
                    if (startRange || endRange) {
                        const timestamp = parseFloat(item.dateCell);
                        
                        if (startRange && timestamp < startRange.start) continue;
                        if (endRange && timestamp > endRange.end) continue;
                    }
                    
                    if (status === "active" && item.completed === true) continue;
                    if (status === "completed" && item.completed === false) continue;
                    
                    filtered.push(item);
                }
            }
            
            return filtered;
        }
    `;
    }

    preprocessData(data) {
        if (!data || data.length === 0) return data;

        performanceMonitor.start("preprocessData");

        const indexed = data.map((item, index) => {
            if (!item._indexed) {
                const timestamp = parseFloat(item.dateCell);
                const itemDate = new Date(timestamp);

                item._formattedDate = formatDate(itemDate);
                item._dateTime = itemDate.getTime();
                item._index = index;
                item._indexed = true;

                if (item.completed === undefined || item.completed === null) {
                    if (item.muted !== undefined) {
                        item.completed = Boolean(item.muted);
                        delete item.muted;
                    } else {
                        item.completed = false;
                    }
                } else {
                    item.completed = Boolean(item.completed);
                }
            }
            return item;
        });

        this.indexedData = indexed;
        performanceMonitor.end("preprocessData");
        return indexed;
    }

    generateFilterHash(filters) {
        return JSON.stringify({
            startDate: filters.startDate,
            endDate: filters.endDate,
            status: filters.status,
            searchText: filters.searchText || "",
        });
    }

    getCachedFilter(hash) {
        const cached = this.filterCache.get(hash);
        if (cached && Date.now() - cached.timestamp < 30000) {
            return cached.result;
        }
        return null;
    }

    setCachedFilter(hash, result) {
        if (this.filterCache.size > 10) {
            const firstKey = this.filterCache.keys().next().value;
            this.filterCache.delete(firstKey);
        }

        this.filterCache.set(hash, {
            result: result,
            timestamp: Date.now(),
        });
    }

    async applyFilters(data = APP_STATE.arrayData) {
        if (this.isProcessing || APP_STATE.isOperationInProgress) {
            console.log("Filter already in progress, skipping");
            return;
        }

        this.isProcessing = true;
        const startTime = performance.now();

        try {
            this.showFilterLoading(true);

            const filterHash = this.generateFilterHash(this.filters);

            const cachedResult = this.getCachedFilter(filterHash);
            if (cachedResult && filterHash === this.lastFilterHash) {
                console.log("Using cached filter result");
                await this.handleFilterResult(cachedResult, startTime);
                return;
            }

            const processedData = this.preprocessData(data);

            if (this.filterWorker && processedData.length > 1000) {
                console.log("Using Web Worker for filtering");
                this.filterWorker.postMessage({
                    data: processedData,
                    filters: this.filters,
                    chunkSize: this.chunkSize,
                });
            } else {
                console.log("Using main thread for filtering");
                const result = await this.filterDataOptimized(processedData);
                await this.handleFilterResult(result, startTime);
            }

            this.lastFilterHash = filterHash;
        } catch (error) {
            console.error("Filter error:", error);
            this.showFilterError("Có lỗi xảy ra khi lọc dữ liệu");
        } finally {
            this.isProcessing = false;
            this.showFilterLoading(false);
        }
    }

    async filterDataOptimized(data) {
        return new Promise((resolve, reject) => {
            try {
                const { startDate, endDate, status, searchText } = this.filters;

                // Prepare search term (remove Vietnamese accents and convert to lowercase)
                let normalizedSearchText = "";
                if (searchText) {
                    try {
                        if (typeof removeVietnameseAccents === "function") {
                            normalizedSearchText = removeVietnameseAccents(
                                searchText.toLowerCase(),
                            );
                            console.log(
                                "✅ Normalized search:",
                                searchText,
                                "->",
                                normalizedSearchText,
                            );
                        } else {
                            console.warn(
                                "⚠️ removeVietnameseAccents not found, using plain text",
                            );
                            normalizedSearchText = searchText.toLowerCase();
                        }
                    } catch (err) {
                        console.error(
                            "❌ Error normalizing search text:",
                            err,
                        );
                        normalizedSearchText = searchText.toLowerCase();
                    }
                }

                let filteredResults = [];
                let processedCount = 0;

                const processChunk = (startIndex) => {
                    try {
                        const endIndex = Math.min(
                            startIndex + this.chunkSize,
                            data.length,
                        );
                        const chunk = data.slice(startIndex, endIndex);

                        const chunkResults = [];
                        for (const item of chunk) {
                            try {
                                let passesDateFilter = true;

                                if (startDate || endDate) {
                                    const timestamp = parseFloat(item.dateCell);

                                    if (startDate) {
                                        const startRange =
                                            VietnamTime.getDateRange(startDate);
                                        if (timestamp < startRange.start) {
                                            passesDateFilter = false;
                                        }
                                    }

                                    if (endDate && passesDateFilter) {
                                        const endRange =
                                            VietnamTime.getDateRange(endDate);
                                        if (timestamp > endRange.end) {
                                            passesDateFilter = false;
                                        }
                                    }
                                }

                                if (!passesDateFilter) continue;

                                if (status === "active" && item.completed === true)
                                    continue;
                                if (
                                    status === "completed" &&
                                    item.completed === false
                                )
                                    continue;

                                // Content search filter (search in all fields)
                                if (normalizedSearchText) {
                                    let passesContentFilter = false;

                                    // Search in note
                                    if (item.noteCell) {
                                        try {
                                            const normalizedNote =
                                                removeVietnameseAccents(
                                                    item.noteCell.toLowerCase(),
                                                );
                                            if (
                                                normalizedNote.includes(
                                                    normalizedSearchText,
                                                )
                                            ) {
                                                passesContentFilter = true;
                                            }
                                        } catch (e) {
                                            // Fallback to plain text if error
                                            if (
                                                item.noteCell
                                                    .toLowerCase()
                                                    .includes(normalizedSearchText)
                                            ) {
                                                passesContentFilter = true;
                                            }
                                        }
                                    }

                                    // Search in amount
                                    if (!passesContentFilter && item.amountCell) {
                                        const amountStr = item.amountCell
                                            .toString()
                                            .replace(/[,\.]/g, "");
                                        if (
                                            amountStr.includes(normalizedSearchText)
                                        ) {
                                            passesContentFilter = true;
                                        }
                                    }

                                    // Search in bank
                                    if (!passesContentFilter && item.bankCell) {
                                        try {
                                            const normalizedBank =
                                                removeVietnameseAccents(
                                                    item.bankCell.toLowerCase(),
                                                );
                                            if (
                                                normalizedBank.includes(
                                                    normalizedSearchText,
                                                )
                                            ) {
                                                passesContentFilter = true;
                                            }
                                        } catch (e) {
                                            if (
                                                item.bankCell
                                                    .toLowerCase()
                                                    .includes(normalizedSearchText)
                                            ) {
                                                passesContentFilter = true;
                                            }
                                        }
                                    }

                                    // Search in customer info (FB + SĐT)
                                    if (
                                        !passesContentFilter &&
                                        item.customerInfoCell
                                    ) {
                                        try {
                                            const normalizedInfo =
                                                removeVietnameseAccents(
                                                    item.customerInfoCell.toLowerCase(),
                                                );
                                            if (
                                                normalizedInfo.includes(
                                                    normalizedSearchText,
                                                )
                                            ) {
                                                passesContentFilter = true;
                                            }
                                        } catch (e) {
                                            if (
                                                item.customerInfoCell
                                                    .toLowerCase()
                                                    .includes(normalizedSearchText)
                                            ) {
                                                passesContentFilter = true;
                                            }
                                        }
                                    }

                                    if (!passesContentFilter) continue;
                                }

                                chunkResults.push(item);
                            } catch (itemError) {
                                console.error(
                                    "Error processing item:",
                                    itemError,
                                    item,
                                );
                                // Continue with next item
                            }
                        }

                        filteredResults = filteredResults.concat(chunkResults);
                        processedCount = endIndex;

                        const progress = Math.round(
                            (processedCount / data.length) * 100,
                        );
                        this.updateFilterProgress(progress);

                        if (endIndex < data.length) {
                            const nextTick =
                                window.requestIdleCallback ||
                                ((cb) => setTimeout(cb, 0));
                            nextTick(() => processChunk(endIndex));
                        } else {
                            resolve(filteredResults);
                        }
                    } catch (chunkError) {
                        console.error("Error processing chunk:", chunkError);
                        reject(chunkError);
                    }
                };

                processChunk(0);
            } catch (error) {
                console.error("Error in filterDataOptimized:", error);
                reject(error);
            }
        });
    }

    handleWorkerResult(data) {
        if (data.success) {
            this.handleFilterResult(data.result, performance.now());
        } else {
            console.error("Worker filter error:", data.error);
            this.showFilterError("Có lỗi xảy ra khi lọc dữ liệu");
        }
    }

    async handleFilterResult(result, startTime) {
        const filterTime = performance.now() - startTime;

        console.log("Filter result received:", {
            resultCount: result.length,
            filterTime: `${filterTime.toFixed(2)}ms`,
            filters: this.filters,
        });

        const filterHash = this.generateFilterHash(this.filters);
        this.setCachedFilter(filterHash, result);

        APP_STATE.filteredData = result;

        const sortedResults = this.sortFilterResults(result);

        await this.updateTableWithResults(sortedResults);

        this.updateFilterInfo(result.length, APP_STATE.arrayData.length);
        this.updateTotalAmount();
        this.showFilterPerformance(filterTime, result.length);

        const message = `Hiển thị ${result.length.toLocaleString()} giao dịch (${filterTime.toFixed(0)}ms)`;
        this.showFilterSuccess(message);

        document.dispatchEvent(
            new CustomEvent(EVENTS.FILTER_CHANGED, {
                detail: {
                    filteredCount: result.length,
                    totalCount: APP_STATE.arrayData.length,
                    filterTime: filterTime,
                    filters: { ...this.filters },
                },
            }),
        );
    }

    sortFilterResults(results) {
        return ArrayUtils.fastSort(results, (a, b) => {
            const timestampA = parseInt(a.dateCell) || 0;
            const timestampB = parseInt(b.dateCell) || 0;

            if (timestampB !== timestampA) {
                return timestampB - timestampA;
            }

            const completedA = a.completed ? 1 : 0;
            const completedB = b.completed ? 1 : 0;
            return completedA - completedB;
        });
    }

    async updateTableWithResults(results) {
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (!tableBody) return;

        const virtualScrollManager = window.virtualScrollManager;

        if (
            virtualScrollManager &&
            virtualScrollManager.shouldUseVirtualScrolling(results.length)
        ) {
            console.log(`Using virtual scrolling for ${results.length} items`);
            virtualScrollManager.enable(results);
        } else {
            console.log(`Using normal rendering for ${results.length} items`);
            if (virtualScrollManager) {
                virtualScrollManager.disable();
            }
            await this.renderNormalTable(results);
        }
    }

    async renderNormalTable(results) {
        const tableBody = domManager.get(SELECTORS.tableBody);
        if (!tableBody) return;

        tableBody.innerHTML = "";

        if (results.length === 0) return;

        const batchSize = this.settings.batchSize;
        let currentIndex = 0;

        const renderBatch = () => {
            const endIndex = Math.min(currentIndex + batchSize, results.length);
            const fragment = domManager.createFragment();

            for (let i = currentIndex; i < endIndex; i++) {
                const item = results[i];
                const timestamp = parseFloat(item.dateCell);
                const dateCellConvert = new Date(timestamp);
                const formattedTime = formatDate(dateCellConvert);

                if (formattedTime) {
                    const newRow = this.createTableRow(item, formattedTime);
                    if (newRow) {
                        fragment.appendChild(newRow);
                    }
                }
            }

            tableBody.appendChild(fragment);
            currentIndex = endIndex;

            // Initialize Lucide icons for this batch
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            if (currentIndex < results.length) {
                requestAnimationFrame(renderBatch);
            }
        };

        renderBatch();
    }

    createTableRow(item, formattedTime) {
        const newRow = domManager.create("tr");

        console.log("Creating table row for item:", {
            uniqueId: item.uniqueId,
            completed: item.completed,
            completedType: typeof item.completed,
            noteCell: item.noteCell,
        });

        if (item.completed === true) {
            newRow.style.cssText = "opacity: 0.4; background-color: #f8f9fa;";
            newRow.classList.add(CSS_CLASSES.muted);
        } else {
            newRow.style.cssText = "opacity: 1.0;";
            newRow.classList.add(CSS_CLASSES.active);
        }

        const cells = [
            { content: sanitizeInput(formattedTime), id: item.dateCell },
            { content: sanitizeInput(item.noteCell || "") },
            {
                content: item.amountCell
                    ? numberWithCommas(
                          sanitizeInput(item.amountCell.toString()).replace(
                              /[,\.]/g,
                              "",
                          ),
                      )
                    : "0",
            },
            { content: sanitizeInput(item.bankCell || "") },
            {
                content: null,
                type: "checkbox",
                checked: Boolean(item.completed),
            },
            { content: sanitizeInput(item.customerInfoCell || "") },
            { content: null, type: "edit" },
            { content: null, type: "delete", userId: item.user || "Unknown" },
        ];

        const cellFragment = domManager.createFragment();

        cells.forEach((cellData) => {
            const cell = domManager.create("td");

            if (cellData.type === "checkbox") {
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = cellData.checked;
                checkbox.style.width = "20px";
                checkbox.style.height = "20px";
                checkbox.style.cursor = "pointer";
                checkbox.style.transition =
                    "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

                checkbox.setAttribute("data-transaction-id", item.uniqueId);

                cell.appendChild(checkbox);
            } else if (cellData.type === "edit") {
                const editButton = document.createElement("button");
                editButton.className = "edit-button";
                editButton.style.cursor = "pointer";

                // Add Lucide icon
                const editIcon = document.createElement("i");
                editIcon.setAttribute("data-lucide", "edit-3");
                editButton.appendChild(editIcon);

                cell.appendChild(editButton);
            } else if (cellData.type === "delete") {
                const deleteButton = document.createElement("button");
                deleteButton.className = "delete-button";
                deleteButton.setAttribute("data-user", cellData.userId);
                deleteButton.style.cursor = "pointer";

                // Add Lucide icon
                const deleteIcon = document.createElement("i");
                deleteIcon.setAttribute("data-lucide", "trash-2");
                deleteButton.appendChild(deleteIcon);

                cell.appendChild(deleteButton);
            } else {
                cell.textContent = cellData.content;
                if (cellData.id) cell.id = cellData.id;
            }

            cellFragment.appendChild(cell);
        });

        newRow.appendChild(cellFragment);
        newRow.setAttribute("data-unique-id", item.uniqueId);

        return newRow;
    }

    updateTotalAmount() {
        let totalAmount = 0;
        const dataToCalculate =
            APP_STATE.filteredData.length > 0
                ? APP_STATE.filteredData
                : APP_STATE.arrayData;

        dataToCalculate.forEach((item) => {
            if (!item.completed) {
                const amountStr = item.amountCell || "0";
                const cleanAmount = amountStr.toString().replace(/[,\.]/g, "");
                const amount = parseFloat(cleanAmount);
                if (!isNaN(amount)) {
                    totalAmount += amount;
                }
            }
        });

        const totalAmountElement = domManager.get(SELECTORS.totalAmount);
        if (totalAmountElement) {
            totalAmountElement.innerText =
                numberWithCommas(totalAmount) + ",000";
        }
    }

    findMatchingQuickFilter(startDate, endDate) {
        if (!startDate && !endDate) return "all";
        if (!startDate || !endDate) return null;

        const quickFilters = [
            "today",
            "yesterday",
            "last7days",
            "last30days",
            "thisMonth",
            "lastMonth",
        ];

        for (const filterType of quickFilters) {
            const range = this.getDateRange(filterType);
            if (range.start === startDate && range.end === endDate) {
                return filterType;
            }
        }

        return null;
    }

    handleDateRangeChange() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);

        if (!startDateFilter || !endDateFilter) return;

        let startDate = startDateFilter.value;
        let endDate = endDateFilter.value;

        // FIXED: Validate and swap dates if needed
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            [startDate, endDate] = [endDate, startDate];
            startDateFilter.value = startDate;
            endDateFilter.value = endDate;
            console.log("Dates swapped:", { startDate, endDate });
        }

        this.filters.startDate = startDate;
        this.filters.endDate = endDate;

        // FIXED: Check if current filter matches any quick filter
        const matchedQuickFilter = this.findMatchingQuickFilter(
            startDate,
            endDate,
        );

        // Update labels
        const currentFilterLabel =
            document.getElementById("currentFilterLabel");
        const mainFilterLabel = document.getElementById("mainFilterLabel");

        if (matchedQuickFilter) {
            const labelMap = {
                all: "Tất Cả",
                today: "Hôm Nay",
                yesterday: "Hôm Qua",
                last7days: "7 Ngày Qua",
                last30days: "30 Ngày Qua",
                thisMonth: "Tháng Này",
                lastMonth: "Tháng Trước",
            };

            if (currentFilterLabel) {
                currentFilterLabel.textContent =
                    labelMap[matchedQuickFilter] || "Tùy Chỉnh";
            }
            if (mainFilterLabel) {
                mainFilterLabel.textContent =
                    labelMap[matchedQuickFilter] || "Tùy Chỉnh";
            }

            // Update active button
            const quickFilterBtns =
                document.querySelectorAll(".quick-filter-btn");
            quickFilterBtns.forEach((btn) => {
                if (btn.getAttribute("data-filter") === matchedQuickFilter) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            });
        } else {
            // Custom date range
            if (currentFilterLabel) {
                currentFilterLabel.textContent = "Tùy Chỉnh";
            }
            if (mainFilterLabel) {
                mainFilterLabel.textContent = "Tùy Chỉnh";
            }

            // Remove active from all quick filter buttons
            const quickFilterBtns =
                document.querySelectorAll(".quick-filter-btn");
            quickFilterBtns.forEach((btn) => btn.classList.remove("active"));
        }

        console.log("Date range changed:", {
            startDate,
            endDate,
            matchedFilter: matchedQuickFilter,
        });

        this.applyFilters();
    }

    handleFilterChange() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);
        if (statusFilter) {
            const newStatus = statusFilter.value;
            console.log("Status filter changed to:", newStatus);

            this.filters.status = newStatus;

            // FIXED: Update filter info to show status change
            this.updateFilterLabelsWithStatus();

            this.applyFilters();
        }
    }

    handleSearchChange() {
        try {
            if (this.isProcessing || APP_STATE.isOperationInProgress) {
                console.log("⏸️ Search change ignored: operation in progress");
                return;
            }

            // Try multiple ways to get input
            const contentSearchInput =
                document.getElementById("contentSearchInput") ||
                domManager.get("#contentSearchInput");

            if (!contentSearchInput) {
                console.warn("⚠️ Search input not found in handleSearchChange");
                return;
            }

            const searchText = contentSearchInput.value.trim();
            console.log("🔍 Search text changed to:", searchText || "(empty)");

            this.filters.searchText = searchText;

            console.log("📊 Current filters:", this.filters);

            this.applyFilters();
        } catch (error) {
            console.error("❌ Error in handleSearchChange:", error);
        }
    }

    updateFilterLabelsWithStatus() {
        const currentFilterLabel =
            document.getElementById("currentFilterLabel");
        const mainFilterLabel = document.getElementById("mainFilterLabel");

        if (!currentFilterLabel || !mainFilterLabel) return;

        let baseLabel = currentFilterLabel.textContent;

        // Remove existing status suffix
        baseLabel = baseLabel.replace(/ \(.*\)$/, "");

        // Add status suffix if not "all"
        if (this.filters.status === "active") {
            baseLabel += " (Chưa đi đơn)";
        } else if (this.filters.status === "completed") {
            baseLabel += " (Đã đi đơn)";
        }

        currentFilterLabel.textContent = baseLabel;
        mainFilterLabel.textContent = baseLabel;
    }

    setTodayFilter() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        const vietnamToday = VietnamTime.getDateString();
        console.log("Setting today filter:", vietnamToday);

        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);

        if (startDateFilter) startDateFilter.value = vietnamToday;
        if (endDateFilter) endDateFilter.value = vietnamToday;

        this.filters.startDate = vietnamToday;
        this.filters.endDate = vietnamToday;

        // FIXED: Reset status
        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);
        if (statusFilter) {
            statusFilter.value = "all";
            this.filters.status = "all";
        }

        // FIXED: Update active button
        const quickFilterBtns = document.querySelectorAll(".quick-filter-btn");
        quickFilterBtns.forEach((btn) => {
            if (btn.getAttribute("data-filter") === "today") {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        // Update labels
        const currentFilterLabel =
            document.getElementById("currentFilterLabel");
        const mainFilterLabel = document.getElementById("mainFilterLabel");
        if (currentFilterLabel) currentFilterLabel.textContent = "Hôm Nay";
        if (mainFilterLabel) mainFilterLabel.textContent = "Hôm Nay";

        this.syncDateSliderWithFilters();

        this.applyFilters();
    }

    setAllFilter() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        console.log("Setting all filter");

        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);

        if (startDateFilter) startDateFilter.value = "";
        if (endDateFilter) endDateFilter.value = "";

        this.filters.startDate = null;
        this.filters.endDate = null;

        // FIXED: Reset status
        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);
        if (statusFilter) {
            statusFilter.value = "all";
            this.filters.status = "all";
        }

        // FIXED: Update active button
        const quickFilterBtns = document.querySelectorAll(".quick-filter-btn");
        quickFilterBtns.forEach((btn) => {
            if (btn.getAttribute("data-filter") === "all") {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        // Update labels
        const currentFilterLabel =
            document.getElementById("currentFilterLabel");
        const mainFilterLabel = document.getElementById("mainFilterLabel");
        if (currentFilterLabel) currentFilterLabel.textContent = "Tất Cả";
        if (mainFilterLabel) mainFilterLabel.textContent = "Tất Cả";

        if (this.dateSlider) {
            this.dateSlider.clearSelection();
        }

        this.applyFilters();
    }

    clearAllFilters() {
        if (this.isProcessing || APP_STATE.isOperationInProgress) return;

        console.log("Clearing all filters");

        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);
        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);
        const contentSearchInput = domManager.get("#contentSearchInput");

        if (startDateFilter) startDateFilter.value = "";
        if (endDateFilter) endDateFilter.value = "";
        if (statusFilter) statusFilter.value = "all";
        if (contentSearchInput) contentSearchInput.value = "";

        this.filters = {
            startDate: null,
            endDate: null,
            status: "all",
            searchText: "",
        };

        // FIXED: Remove active from all quick filter buttons
        const quickFilterBtns = document.querySelectorAll(".quick-filter-btn");
        quickFilterBtns.forEach((btn) => btn.classList.remove("active"));

        // Update labels
        const currentFilterLabel =
            document.getElementById("currentFilterLabel");
        const mainFilterLabel = document.getElementById("mainFilterLabel");
        if (currentFilterLabel) currentFilterLabel.textContent = "Tất Cả";
        if (mainFilterLabel) mainFilterLabel.textContent = "Tất Cả";

        if (this.dateSlider) {
            this.dateSlider.clearSelection();
        }

        this.applyFilters();
    }

    showFilterLoading(show) {
        const filterSystem = domManager.get(SELECTORS.filterSystem);
        const buttons = domManager.getAll(".filter-btn");

        if (show) {
            if (filterSystem) filterSystem.classList.add("filter-loading");
            buttons.forEach((btn) => (btn.disabled = true));
        } else {
            if (filterSystem) filterSystem.classList.remove("filter-loading");
            buttons.forEach((btn) => (btn.disabled = false));
        }
    }

    updateFilterProgress(progress) {
        const performanceEl = domManager.get("#filterPerformance");
        if (performanceEl) {
            performanceEl.textContent = `Lọc dữ liệu: ${progress}%`;
        }
    }

    showFilterPerformance(filterTime, itemCount) {
        const performanceEl = domManager.get("#filterPerformance");
        if (performanceEl) {
            const itemsPerMs = (itemCount / filterTime).toFixed(1);
            performanceEl.textContent = `Lọc ${itemCount.toLocaleString()} mục trong ${filterTime.toFixed(0)}ms (${itemsPerMs} mục/ms)`;
        }
    }

    updateFilterInfo(visibleCount, totalCount) {
        const filterInfo = domManager.get(SELECTORS.filterInfo);
        if (!filterInfo) return;

        if (visibleCount !== totalCount || this.filters.searchText) {
            let filterText = `Hiển thị ${visibleCount.toLocaleString()} / ${totalCount.toLocaleString()} giao dịch`;

            // Add search info
            if (this.filters.searchText) {
                filterText += ` - Tìm kiếm: "${this.filters.searchText}"`;
            }

            // Add date range info
            if (this.filters.startDate || this.filters.endDate) {
                const startStr = this.filters.startDate
                    ? this.formatDateForDisplay(this.filters.startDate)
                    : "";
                const endStr = this.filters.endDate
                    ? this.formatDateForDisplay(this.filters.endDate)
                    : "";

                if (startStr && endStr) {
                    if (startStr === endStr) {
                        filterText += ` (ngày ${startStr} - GMT+7)`;
                    } else {
                        filterText += ` (từ ${startStr} đến ${endStr} - GMT+7)`;
                    }
                } else if (startStr) {
                    filterText += ` (từ ${startStr} - GMT+7)`;
                } else if (endStr) {
                    filterText += ` (đến ${endStr} - GMT+7)`;
                }
            }

            // Add status info
            if (this.filters.status !== "all") {
                const statusText =
                    this.filters.status === "active"
                        ? "chưa đi đơn"
                        : "đã đi đơn";
                filterText += ` - ${statusText}`;
            }

            filterInfo.innerHTML = filterText;
            filterInfo.classList.remove("hidden");
        } else {
            filterInfo.classList.add("hidden");
        }
    }

    formatDateForDisplay(dateStr) {
        if (!dateStr) return "";

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "";

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    }

    showFilterSuccess(message) {
        if (window.showSuccess) {
            window.showSuccess(message);
        }
    }

    showFilterError(message) {
        if (window.showError) {
            window.showError(message);
        }
    }

    getFilters() {
        return { ...this.filters };
    }

    setFilters(newFilters) {
        this.filters = { ...this.filters, ...newFilters };
        this.updateFilterUI();
        this.applyFilters();
    }

    updateFilterUI() {
        const startDateFilter = domManager.get(SELECTORS.startDateFilter);
        const endDateFilter = domManager.get(SELECTORS.endDateFilter);
        const statusFilter = domManager.get(SELECTORS.statusFilterDropdown);
        const contentSearchInput = domManager.get("#contentSearchInput");

        if (startDateFilter)
            startDateFilter.value = this.filters.startDate || "";
        if (endDateFilter) endDateFilter.value = this.filters.endDate || "";
        if (statusFilter) statusFilter.value = this.filters.status || "all";
        if (contentSearchInput)
            contentSearchInput.value = this.filters.searchText || "";
    }

    reset() {
        this.filters = {
            startDate: null,
            endDate: null,
            status: "all",
            searchText: "",
        };
        this.filterCache.clear();
        this.lastFilterHash = null;
        this.updateFilterUI();
    }

    destroy() {
        if (this.filterWorker) {
            this.filterWorker.terminate();
            this.filterWorker = null;
        }

        this.filterCache.clear();
        throttleManager.clear("dateFilter");
        throttleManager.clear("statusFilter");
        throttleManager.clear("searchFilter");

        // Cleanup search input listener
        const contentSearchInput = domManager.get("#contentSearchInput");
        if (contentSearchInput && contentSearchInput._searchListener) {
            contentSearchInput.removeEventListener(
                "input",
                contentSearchInput._searchListener,
            );
            delete contentSearchInput._searchListener;
        }

        const filterSystem = domManager.get(SELECTORS.filterSystem);
        if (filterSystem) {
            filterSystem.remove();
        }

        const toggleContainer = document.getElementById(
            "filterToggleContainer",
        );
        if (toggleContainer) {
            toggleContainer.remove();
        }

        if (this.dateSlider) {
            const sliderContainer = document.querySelector(
                ".date-slider-container",
            );
            if (sliderContainer) {
                sliderContainer.remove();
            }
            this.dateSlider = null;
        }

        console.log("Filter system destroyed");
    }

    getStats() {
        return {
            isProcessing: this.isProcessing,
            cacheSize: this.filterCache.size,
            lastFilterHash: this.lastFilterHash,
            indexedDataSize: this.indexedData ? this.indexedData.length : 0,
            workerEnabled: !!this.filterWorker,
            chunkSize: this.chunkSize,
            settings: this.settings,
        };
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { FilterManager };
} else {
    window.FilterManager = FilterManager;
}
