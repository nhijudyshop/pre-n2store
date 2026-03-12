// =====================================================
// DATE SLIDER FILTER SYSTEM
// Thay thế input date bằng scrollable date slider
// =====================================================

class DateSliderManager {
    constructor() {
        this.currentDate = VietnamTime.now();
        this.selectedStartDate = null;
        this.selectedEndDate = null;
        this.dateList = [];
        this.container = null;
        this.isSelecting = false;
        this.filterManager = null;

        // Settings
        this.daysToShow = 90; // Tăng lên 3 tháng
        this.daysBefore = 45; // 45 ngày trước
        this.daysAfter = 45; // 45 ngày sau

        document.addEventListener("keydown", (e) => {
            if (e.key === "ArrowLeft") this.navigateDay(-1);
            if (e.key === "ArrowRight") this.navigateDay(1);
            if (e.key === "Home") this.selectToday();
        });
    }

    init(filterManager) {
        this.filterManager = filterManager;
        this.generateDateList();
        this.createUI();
        this.bindEvents();

        console.log("Date Slider initialized");
    }

    generateDateList() {
        this.dateList = [];
        const today = VietnamTime.now();

        // Generate dates from daysBefore ago to daysAfter from now
        for (let i = -this.daysBefore; i <= this.daysAfter; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);

            this.dateList.push({
                date: date,
                dateString: VietnamTime.getDateString(date),
                day: date.getDate(),
                month: date.getMonth() + 1,
                year: date.getFullYear(),
                dayName: this.getDayName(date),
                isToday: this.isToday(date),
                isWeekend: date.getDay() === 0 || date.getDay() === 6,
            });
        }
    }

    getDayName(date) {
        const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
        return days[date.getDay()];
    }

    isToday(date) {
        const today = VietnamTime.now();
        return (
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()
        );
    }

    createUI() {
        // Get or create container
        const filterSystem = document.getElementById("improvedFilterSystem");
        if (!filterSystem) return;

        // Find the date filter row and replace it
        const existingDateRow = filterSystem.querySelector(".filter-row");

        const sliderHTML = `
            <div class="date-slider-container">
                <div class="date-slider-header">
                    <div class="date-slider-title">
                        <i data-lucide="calendar-range"></i>
                        <span>Chọn Ngày</span>
                    </div>
                    <div class="date-slider-actions">
                        <button class="date-nav-btn" id="prevMonth">
                            <i data-lucide="chevrons-left"></i>
                            <span>Tháng trước</span>
                        </button>
                        <button class="date-nav-btn" id="prevWeek">
                            <i data-lucide="chevron-left"></i>
                            <span>Tuần trước</span>
                        </button>
                        <button class="date-nav-btn primary" id="todayBtn">
                            <i data-lucide="calendar-check"></i>
                            <span>Hôm nay</span>
                        </button>
                        <button class="date-nav-btn" id="nextWeek">
                            <span>Tuần sau</span>
                            <i data-lucide="chevron-right"></i>
                        </button>
                        <button class="date-nav-btn" id="nextMonth">
                            <span>Tháng sau</span>
                            <i data-lucide="chevrons-right"></i>
                        </button>
                    </div>
                </div>
                
                <div class="date-range-display">
                    <div class="range-info">
                        <i data-lucide="calendar"></i>
                        <span id="rangeText">Chưa chọn khoảng ngày</span>
                    </div>
                    <button class="clear-range-btn" id="clearRange" style="display: none;">
                        <i data-lucide="x"></i>
                        <span>Xóa</span>
                    </button>
                </div>

                <div class="date-slider-wrapper">
                    <div class="date-slider-track" id="dateSliderTrack">
                        <!-- Date items will be inserted here -->
                    </div>
                </div>

                <div class="date-slider-help">
                    <i data-lucide="info"></i>
                    <span>Click để chọn 1 ngày • Click 2 lần để chọn khoảng ngày • Kéo để xem thêm</span>
                </div>
            </div>

            <style>
                .date-slider-container {
                    background: white;
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                }

                .date-slider-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 15px;
                }

                .date-slider-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 18px;
                    font-weight: 600;
                    color: #374151;
                }

                .date-slider-title i {
                    width: 24px;
                    height: 24px;
                    color: #667eea;
                }

                .date-slider-actions {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .date-nav-btn {
                    padding: 8px 16px;
                    border: 2px solid #e5e7eb;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    color: #6b7280;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s;
                }

                .date-nav-btn:hover {
                    border-color: #667eea;
                    color: #667eea;
                    transform: translateY(-1px);
                }

                .date-nav-btn.primary {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    border-color: #667eea;
                    color: white;
                }

                .date-nav-btn.primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                }

                .date-nav-btn i {
                    width: 16px;
                    height: 16px;
                }

                .date-range-display {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: linear-gradient(135deg, #e7f3ff, #cce7ff);
                    border: 2px solid #b3d4fc;
                    border-radius: 8px;
                    margin-bottom: 15px;
                }

                .range-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-weight: 600;
                    color: #0c5460;
                }

                .range-info i {
                    width: 20px;
                    height: 20px;
                }

                .clear-range-btn {
                    padding: 6px 12px;
                    border: none;
                    background: #dc3545;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s;
                }

                .clear-range-btn:hover {
                    background: #c82333;
                    transform: scale(1.05);
                }

                .clear-range-btn i {
                    width: 14px;
                    height: 14px;
                }

                .date-slider-wrapper {
                    position: relative;
                    overflow-x: auto;
                    overflow-y: hidden;
                    margin: 0 -20px;
                    padding: 0 20px;
                    scroll-behavior: smooth;
                    -webkit-overflow-scrolling: touch;
                }

                .date-slider-wrapper::-webkit-scrollbar {
                    height: 8px;
                }

                .date-slider-wrapper::-webkit-scrollbar-track {
                    background: #f3f4f6;
                    border-radius: 4px;
                }

                .date-slider-wrapper::-webkit-scrollbar-thumb {
                    background: #d1d5db;
                    border-radius: 4px;
                }

                .date-slider-wrapper::-webkit-scrollbar-thumb:hover {
                    background: #9ca3af;
                }

                .date-slider-track {
                    display: flex;
                    gap: 8px;
                    padding: 10px 0;
                    min-width: max-content;
                }

                .date-item {
                    min-width: 70px;
                    padding: 12px 8px;
                    border: 2px solid #e5e7eb;
                    background: white;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: center;
                    user-select: none;
                    position: relative;
                }

                .date-item:hover {
                    border-color: #667eea;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
                }

                .date-item.today {
                    border-color: #10b981;
                    background: #ecfdf5;
                }

                .date-item.weekend {
                    background: #fef2f2;
                }

                .date-item.selected {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    border-color: #667eea;
                    color: white;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .date-item.in-range {
                    background: #e0e7ff;
                    border-color: #818cf8;
                }

                .date-item.selected .date-day-name,
                .date-item.selected .date-number,
                .date-item.selected .date-month {
                    color: white;
                }

                .date-day-name {
                    font-size: 11px;
                    font-weight: 600;
                    color: #9ca3af;
                    text-transform: uppercase;
                    margin-bottom: 4px;
                }

                .date-number {
                    font-size: 24px;
                    font-weight: 700;
                    color: #1f2937;
                    line-height: 1;
                    margin-bottom: 4px;
                }

                .date-month {
                    font-size: 11px;
                    font-weight: 500;
                    color: #6b7280;
                }

                .date-item.today .date-number {
                    color: #10b981;
                }

                .date-item.today::after {
                    content: '';
                    position: absolute;
                    bottom: 4px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 6px;
                    height: 6px;
                    background: #10b981;
                    border-radius: 50%;
                }

                .date-slider-help {
                    margin-top: 15px;
                    padding: 10px 14px;
                    background: #f9fafb;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    color: #6b7280;
                }

                .date-slider-help i {
                    width: 16px;
                    height: 16px;
                    color: #9ca3af;
                    flex-shrink: 0;
                }

                /* Mobile responsive */
                @media (max-width: 768px) {
                    .date-slider-header {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .date-slider-actions {
                        justify-content: space-between;
                    }

                    .date-nav-btn span {
                        display: none;
                    }

                    .date-nav-btn.primary span {
                        display: inline;
                    }

                    .date-item {
                        min-width: 60px;
                        padding: 10px 6px;
                    }

                    .date-number {
                        font-size: 20px;
                    }
                }

                /* Animation */
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

                .date-item {
                    animation: slideIn 0.3s ease forwards;
                }
            </style>
        `;

        // Insert before the existing filter row or replace it
        if (existingDateRow) {
            existingDateRow.insertAdjacentHTML("beforebegin", sliderHTML);
            // Hide the old date inputs
            const dateInputs = existingDateRow.querySelectorAll(
                "#startDateFilter, #endDateFilter",
            );
            dateInputs.forEach((input) => {
                if (input.closest(".filter-group")) {
                    input.closest(".filter-group").style.display = "none";
                }
            });
        } else {
            filterSystem.insertAdjacentHTML("afterbegin", sliderHTML);
        }

        this.container = document.getElementById("dateSliderTrack");
        this.renderDates();

        // Initialize Lucide icons
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        // Scroll to today
        setTimeout(() => this.scrollToToday(), 100);
    }

    renderDates() {
        if (!this.container) return;

        this.container.innerHTML = "";
        const fragment = document.createDocumentFragment();

        this.dateList.forEach((dateInfo, index) => {
            const dateItem = document.createElement("div");
            dateItem.className = "date-item";
            dateItem.dataset.dateString = dateInfo.dateString;
            dateItem.dataset.index = index;

            if (dateInfo.isToday) {
                dateItem.classList.add("today");
            }
            if (dateInfo.isWeekend) {
                dateItem.classList.add("weekend");
            }

            dateItem.innerHTML = `
                <div class="date-day-name">${dateInfo.dayName}</div>
                <div class="date-number">${dateInfo.day}</div>
                <div class="date-month">Th${dateInfo.month}</div>
            `;

            // Add animation delay
            dateItem.style.animationDelay = `${index * 0.02}s`;

            fragment.appendChild(dateItem);
        });

        this.container.appendChild(fragment);
    }

    bindEvents() {
        // Date selection
        if (this.container) {
            this.container.addEventListener("click", (e) => {
                const dateItem = e.target.closest(".date-item");
                if (dateItem) {
                    this.handleDateClick(dateItem);
                }
            });
        }

        // Navigation buttons
        document
            .getElementById("prevMonth")
            ?.addEventListener("click", () => this.navigateMonth(-1));
        document
            .getElementById("nextMonth")
            ?.addEventListener("click", () => this.navigateMonth(1));
        document
            .getElementById("prevWeek")
            ?.addEventListener("click", () => this.navigateWeek(-1));
        document
            .getElementById("nextWeek")
            ?.addEventListener("click", () => this.navigateWeek(1));
        document
            .getElementById("todayBtn")
            ?.addEventListener("click", () => this.selectToday());
        document
            .getElementById("clearRange")
            ?.addEventListener("click", () => this.clearSelection());

        // Touch/drag scroll enhancement
        let isDragging = false;
        let startX;
        let scrollLeft;

        const wrapper = document.querySelector(".date-slider-wrapper");

        wrapper?.addEventListener("mousedown", (e) => {
            isDragging = true;
            wrapper.style.cursor = "grabbing";
            startX = e.pageX - wrapper.offsetLeft;
            scrollLeft = wrapper.scrollLeft;
        });

        wrapper?.addEventListener("mouseleave", () => {
            isDragging = false;
            wrapper.style.cursor = "grab";
        });

        wrapper?.addEventListener("mouseup", () => {
            isDragging = false;
            wrapper.style.cursor = "grab";
        });

        wrapper?.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - wrapper.offsetLeft;
            const walk = (x - startX) * 2;
            wrapper.scrollLeft = scrollLeft - walk;
        });
    }

    handleDateClick(dateItem) {
        const dateString = dateItem.dataset.dateString;

        if (!this.selectedStartDate) {
            // First selection - set start date
            this.selectedStartDate = dateString;
            this.selectedEndDate = dateString;
            this.isSelecting = true;
        } else if (this.isSelecting) {
            // Second selection - set end date
            const clickedDate = new Date(dateString);
            const startDate = new Date(this.selectedStartDate);

            if (clickedDate < startDate) {
                // If clicked date is before start, swap them
                this.selectedEndDate = this.selectedStartDate;
                this.selectedStartDate = dateString;
            } else {
                this.selectedEndDate = dateString;
            }
            this.isSelecting = false;
        } else {
            // Already have range, start new selection
            this.selectedStartDate = dateString;
            this.selectedEndDate = dateString;
            this.isSelecting = true;
        }

        this.updateSelection();
        this.applyFilter();
    }

    updateSelection() {
        const dateItems = document.querySelectorAll(".date-item");

        dateItems.forEach((item) => {
            item.classList.remove("selected", "in-range");

            const itemDate = item.dataset.dateString;

            if (
                itemDate === this.selectedStartDate ||
                itemDate === this.selectedEndDate
            ) {
                item.classList.add("selected");
            } else if (this.selectedStartDate && this.selectedEndDate) {
                const itemDateObj = new Date(itemDate);
                const startDateObj = new Date(this.selectedStartDate);
                const endDateObj = new Date(this.selectedEndDate);

                if (itemDateObj > startDateObj && itemDateObj < endDateObj) {
                    item.classList.add("in-range");
                }
            }
        });

        this.updateRangeDisplay();
    }

    updateRangeDisplay() {
        const rangeText = document.getElementById("rangeText");
        const clearBtn = document.getElementById("clearRange");

        if (!this.selectedStartDate) {
            rangeText.textContent = "Chưa chọn khoảng ngày";
            clearBtn.style.display = "none";
            return;
        }

        const startDate = new Date(this.selectedStartDate);
        const endDate = new Date(this.selectedEndDate);

        const formatDate = (date) => {
            return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
        };

        if (this.selectedStartDate === this.selectedEndDate) {
            rangeText.textContent = `Ngày: ${formatDate(startDate)}`;
        } else {
            rangeText.textContent = `Từ ${formatDate(startDate)} đến ${formatDate(endDate)}`;
        }

        clearBtn.style.display = "flex";
    }

    clearSelection() {
        this.selectedStartDate = null;
        this.selectedEndDate = null;
        this.isSelecting = false;
        this.updateSelection();

        // Clear filter
        if (this.filterManager) {
            this.filterManager.filters.startDate = null;
            this.filterManager.filters.endDate = null;
            this.filterManager.applyFilters();
        }
    }

    selectToday() {
        const today = VietnamTime.getDateString();
        this.selectedStartDate = today;
        this.selectedEndDate = today;
        this.isSelecting = false;
        this.updateSelection();
        this.scrollToToday();
        this.applyFilter();
    }

    navigateWeek(direction) {
        const wrapper = document.querySelector(".date-slider-wrapper");
        const itemWidth = 78; // 70px width + 8px gap
        const scrollAmount = itemWidth * 7 * direction;

        wrapper.scrollBy({
            left: scrollAmount,
            behavior: "smooth",
        });
    }

    navigateMonth(direction) {
        const wrapper = document.querySelector(".date-slider-wrapper");
        const itemWidth = 78;
        const scrollAmount = itemWidth * 30 * direction;

        wrapper.scrollBy({
            left: scrollAmount,
            behavior: "smooth",
        });
    }

    scrollToToday() {
        const todayItem = document.querySelector(".date-item.today");
        if (todayItem) {
            todayItem.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "center",
            });
        }
    }

    applyFilter() {
        if (this.filterManager) {
            this.filterManager.filters.startDate = this.selectedStartDate;
            this.filterManager.filters.endDate = this.selectedEndDate;

            // Update the hidden date inputs for compatibility
            const startDateFilter = document.getElementById("startDateFilter");
            const endDateFilter = document.getElementById("endDateFilter");

            if (startDateFilter)
                startDateFilter.value = this.selectedStartDate || "";
            if (endDateFilter) endDateFilter.value = this.selectedEndDate || "";

            // Apply filter
            this.filterManager.applyFilters();
        }
    }

    getSelectedRange() {
        return {
            startDate: this.selectedStartDate,
            endDate: this.selectedEndDate,
        };
    }

    setDateRange(startDate, endDate) {
        this.selectedStartDate = startDate;
        this.selectedEndDate = endDate;
        this.isSelecting = false;
        this.updateSelection();
    }
}

// =====================================================
// INTEGRATION WITH FILTER MANAGER
// =====================================================

// Thêm vào FilterManager init method (sau dòng this.init())
// Thêm code này vào filter-system.js trong constructor của FilterManager:

/*
this.dateSlider = new DateSliderManager();
window.dateSliderManager = this.dateSlider;
*/

// Thêm vào FilterManager init method (sau this.bindEvents()):
/*
this.dateSlider.init(this);
*/

// Export
if (typeof module !== "undefined" && module.exports) {
    module.exports = { DateSliderManager };
} else {
    window.DateSliderManager = DateSliderManager;
}

console.log("Date Slider Manager loaded");
