// =====================================================
// UTILITY FUNCTIONS
// File: soorder-utils.js
// =====================================================

window.SoOrderUtils = {
    // Format number to Vietnamese currency
    formatCurrency(amount) {
        if (!amount && amount !== 0) return "0";
        return new Intl.NumberFormat("vi-VN").format(amount);
    },

    // Format date to YYYY-MM-DD
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    },

    // Format date to Vietnamese display (e.g., "Thứ 5, 18/12")
    formatDateDisplay(date) {
        const days = ["CN", "2", "3", "4", "5", "6", "7"];
        const dayIndex = date.getDay();
        const dayName = dayIndex === 0 ? "CN" : `Thứ ${days[dayIndex]}`;
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        return `${dayName}, ${day}/${month}`;
    },

    // Parse YYYY-MM-DD to Date object
    parseDate(dateString) {
        const [year, month, day] = dateString.split("-");
        return new Date(year, month - 1, day);
    },

    // Generate UUID
    generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            function (c) {
                const r = (Math.random() * 16) | 0;
                const v = c === "x" ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            }
        );
    },

    // Show toast notification
    showToast(message, type = "info") {
        const elements = window.SoOrderElements;
        if (!elements.toastContainer) return;

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        const iconMap = {
            success: "check-circle",
            error: "x-circle",
            warning: "alert-triangle",
            info: "info",
        };

        toast.innerHTML = `
            <i data-lucide="${iconMap[type] || "info"}"></i>
            <span>${message}</span>
        `;

        elements.toastContainer.appendChild(toast);

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.classList.add("toast-hide");
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    },

    // Show/hide loading state
    showLoading(show = true, mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        const tableContainer = isReturns
            ? document.getElementById('returnTableContainer')
            : elements.tableContainer;

        if (show) {
            tableContainer?.classList.add("loading");
        } else {
            tableContainer?.classList.remove("loading");
        }
    },

    // Navigate to a specific date
    navigateToDate(date, mode = null) {
        const state = window.SoOrderState;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        // Exit range mode
        state.isRangeMode = false;
        if (isReturns) {
            state.returnsRangeData = [];
        } else {
            state.rangeData = [];
        }
        state.rangeStartDate = null;
        state.rangeEndDate = null;

        state.currentDate = date;
        state.currentDateString = this.formatDate(date);

        // Store last viewed date for returning from range mode
        state.lastViewedDate = new Date(date);

        // Clear active state from quick date buttons in the current tab
        const tabContainer = isReturns
            ? document.getElementById('returnsTabContent')
            : document.getElementById('ordersTabContent');
        if (tabContainer) {
            const quickDateButtons = tabContainer.querySelectorAll(".btn-quick-date");
            quickDateButtons.forEach((btn) => btn.classList.remove("active"));
        }

        // Update date input and selector
        const elements = window.SoOrderElements;
        const dateInput = isReturns
            ? document.getElementById('returnDateInput')
            : elements.dateInput;
        const dateSelector = isReturns
            ? document.getElementById('returnDateSelector')
            : elements.dateSelector;

        if (dateInput) {
            dateInput.value = state.currentDateString;
        }

        // Update the date selector dropdown - show date as first option text
        if (dateSelector) {
            const currentOption = dateSelector.querySelector('option[value="current"]');
            if (currentOption) {
                currentOption.textContent = this.formatDateDisplay(date);
            }
            dateSelector.value = "current";
        }

        // Load data for this date
        window.SoOrderCRUD.loadDayData(state.currentDateString, currentMode);
    },

    // Navigate to previous day
    gotoPrevDay(mode = null) {
        const state = window.SoOrderState;
        const prevDay = new Date(state.currentDate);
        prevDay.setDate(prevDay.getDate() - 1);
        this.navigateToDate(prevDay, mode);
    },

    // Navigate to next day
    gotoNextDay(mode = null) {
        const state = window.SoOrderState;
        const nextDay = new Date(state.currentDate);
        nextDay.setDate(nextDay.getDate() + 1);
        this.navigateToDate(nextDay, mode);
    },

    // Navigate to today
    gotoToday(mode = null) {
        this.navigateToDate(new Date(), mode);
    },

    // Calculate summary
    calculateSummary(orders) {
        let totalAmount = 0;
        let totalDifference = 0;

        orders.forEach((order) => {
            totalAmount += Number(order.amount) || 0;
            totalDifference += Number(order.difference) || 0;
        });

        return { totalAmount, totalDifference };
    },

    // Update footer summary
    updateSummary(orders) {
        const elements = window.SoOrderElements;
        const { totalAmount, totalDifference } = this.calculateSummary(orders);

        if (elements.totalAmount) {
            elements.totalAmount.textContent = this.formatCurrency(totalAmount);
        }

        if (elements.totalDifference) {
            elements.totalDifference.textContent = this.formatCurrency(
                totalDifference
            );
            // Color based on positive/negative
            if (totalDifference > 0) {
                elements.totalDifference.style.color = "#10b981"; // Green for profit
            } else if (totalDifference < 0) {
                elements.totalDifference.style.color = "#ef4444"; // Red for loss
            } else {
                elements.totalDifference.style.color = "inherit";
            }
        }

        // Show/hide footer
        if (elements.footerSummary) {
            if (orders.length > 0) {
                elements.footerSummary.style.display = "flex";
            } else {
                elements.footerSummary.style.display = "none";
            }
        }
    },

    // Toggle holiday columns visibility
    toggleHolidayColumns(isHoliday) {
        const holidayCols = document.querySelectorAll(".holiday-col");
        holidayCols.forEach((col) => {
            col.style.display = isHoliday ? "" : "none";
        });

        // Toggle holiday badge
        const elements = window.SoOrderElements;
        if (elements.holidayBadge) {
            elements.holidayBadge.style.display = isHoliday ? "block" : "none";
        }

        // Toggle holiday fields in add form
        if (elements.holidayFieldsAdd) {
            elements.holidayFieldsAdd.style.display = isHoliday
                ? "flex"
                : "none";
        }

        // Toggle holiday fields in edit modal
        if (elements.holidayFieldsEdit) {
            elements.holidayFieldsEdit.style.display = isHoliday
                ? "block"
                : "none";
        }
    },

    // Keyboard navigation
    setupKeyboardNavigation() {
        document.addEventListener("keydown", (e) => {
            // Ignore if user is typing in an input
            if (
                e.target.tagName === "INPUT" ||
                e.target.tagName === "TEXTAREA"
            ) {
                return;
            }

            // Left arrow or Right arrow
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();

                const state = window.SoOrderState;

                // If in range mode, return to last viewed date
                if (state.isRangeMode) {
                    const dateToReturn = state.lastViewedDate || new Date();
                    this.navigateToDate(dateToReturn);
                    return;
                }

                // Single day mode - navigate prev/next
                if (e.key === "ArrowLeft") {
                    this.gotoPrevDay();
                } else {
                    this.gotoNextDay();
                }
            }
        });
    },

    // Validate order data
    validateOrder(data) {
        if (!data.supplier || data.supplier.trim() === "") {
            this.showToast("Vui lòng nhập tên NCC", "error");
            return false;
        }
        return true;
    },

    // Clear add form
    clearAddForm(mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        if (isReturns) {
            const addReturnSupplier = document.getElementById('addReturnSupplier');
            const addReturnAmount = document.getElementById('addReturnAmount');
            const addReturnDifference = document.getElementById('addReturnDifference');
            const addReturnNote = document.getElementById('addReturnNote');
            const addReturnPerformer = document.getElementById('addReturnPerformer');
            const addReturnIsReconciled = document.getElementById('addReturnIsReconciled');

            if (addReturnSupplier) addReturnSupplier.value = "";
            if (addReturnAmount) addReturnAmount.value = "";
            if (addReturnDifference) addReturnDifference.value = "";
            if (addReturnNote) addReturnNote.value = "";
            if (addReturnPerformer) addReturnPerformer.value = "";
            if (addReturnIsReconciled) addReturnIsReconciled.checked = false;
        } else {
            if (elements.addSupplier) elements.addSupplier.value = "";
            if (elements.addAmount) elements.addAmount.value = "";
            if (elements.addDifference) elements.addDifference.value = "";
            if (elements.addNote) elements.addNote.value = "";
            if (elements.addPerformer) elements.addPerformer.value = "";
            if (elements.addIsReconciled) elements.addIsReconciled.checked = false;
        }
    },
};
