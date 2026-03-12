// =====================================================
// UI RENDERING & INTERACTIONS
// File: soorder-ui.js
// =====================================================

window.SoOrderUI = {
    // =====================================================
    // TAB SWITCHING
    // =====================================================

    switchTab(tabName) {
        const state = window.SoOrderState;
        state.currentTab = tabName;

        // Update button states
        document.querySelectorAll('.tab-header-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update content visibility
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}TabContent`);
        });

        // Add styling class for returns
        document.body.classList.toggle('returns-mode', tabName === 'returns');

        // Load data for the active tab
        this.loadCurrentTabData();

        // Initialize Lucide icons for new tab
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    async loadCurrentTabData() {
        const state = window.SoOrderState;
        const mode = state.currentTab;

        // Load data for current date
        await window.SoOrderCRUD.loadDayData(state.currentDateString, mode);
    },

    // =====================================================
    // RENDER TABLE
    // =====================================================

    renderTable(mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        // Get appropriate elements based on mode
        const tbody = isReturns
            ? document.getElementById('returnTableBody')
            : elements.orderTableBody;
        const thead = isReturns
            ? document.getElementById('returnTableHeader')
            : document.getElementById("tableHeader");
        const emptyState = isReturns
            ? document.getElementById('returnEmptyState')
            : elements.emptyState;
        const tableContainer = isReturns
            ? document.getElementById('returnTableContainer')
            : elements.tableContainer;

        // Get appropriate data based on mode
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;
        const rangeData = isReturns ? state.returnsRangeData : state.rangeData;

        if (!tbody) return;

        // Clear table
        tbody.innerHTML = "";

        // Check if in range mode
        if (state.isRangeMode) {
            this.renderRangeTable(rangeData, currentMode);
            return;
        }

        // Single day mode
        let orders = dayData?.orders || [];

        // Apply unpaid filter if enabled
        if (state.showOnlyUnpaid) {
            orders = orders.filter(order => !order.isPaid);
        }

        // Apply discrepancy filter if enabled
        if (state.showOnlyWithDiscrepancy) {
            orders = orders.filter(order => (Number(order.difference) || 0) !== 0);
        }

        // Apply NCC filter if set (exact Ax prefix match)
        if (state.nccFilter) {
            const filterCode = window.SoOrderCRUD.parseNCCCode(state.nccFilter);
            if (filterCode) {
                // Match exact Ax prefix
                orders = orders.filter(order => {
                    if (!order.supplier) return false;
                    const orderCode = window.SoOrderCRUD.parseNCCCode(order.supplier);
                    return orderCode === filterCode;
                });
            } else {
                // Fallback to text search if no valid Ax code
                const filterLower = state.nccFilter.toLowerCase();
                orders = orders.filter(order =>
                    order.supplier && order.supplier.toLowerCase().includes(filterLower)
                );
            }
        }

        // Update table header for single day mode (no date column)
        if (thead) {
            thead.innerHTML = `
                <th style="width: 50px;">STT</th>
                <th style="width: 300px;">NCC</th>
                <th style="width: 200px; text-align: left;">Thành Tiền</th>
                <th style="width: 130px; text-align: right;">Chênh Lệch</th>
                <th>Ghi Chú</th>
                <th style="width: 150px;" class="holiday-col">Người thực hiện</th>
                <th style="width: 100px; text-align: center;" class="holiday-col">Đối soát</th>
                <th style="width: 100px; text-align: center;">Thao Tác</th>
            `;
        }

        // Show/hide empty state
        if (orders.length === 0) {
            if (emptyState) emptyState.style.display = "flex";
            if (tableContainer) tableContainer.style.display = "none";
            return;
        }

        if (emptyState) emptyState.style.display = "none";
        if (tableContainer) tableContainer.style.display = "block";

        // Render rows
        orders.forEach((order, index) => {
            const row = this.createOrderRow(order, index + 1, undefined, undefined, currentMode);
            tbody.appendChild(row);
        });

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    renderRangeTable(rangeData, mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        const tbody = isReturns
            ? document.getElementById('returnTableBody')
            : elements.orderTableBody;
        const thead = isReturns
            ? document.getElementById('returnTableHeader')
            : document.getElementById("tableHeader");
        const emptyState = isReturns
            ? document.getElementById('returnEmptyState')
            : elements.emptyState;
        const tableContainer = isReturns
            ? document.getElementById('returnTableContainer')
            : elements.tableContainer;

        if (!tbody) return;

        // Check if any day in range is a holiday
        const hasHoliday = rangeData.some(dayData => dayData.isHoliday);

        // Update table header for range mode (add date column)
        if (thead) {
            thead.innerHTML = `
                <th style="width: 120px;">Ngày</th>
                <th style="width: 50px;">STT</th>
                <th style="width: 300px;">NCC</th>
                <th style="width: 200px; text-align: left;">Thành Tiền</th>
                <th style="width: 130px; text-align: right;">Chênh Lệch</th>
                <th>Ghi Chú</th>
                <th style="width: 150px;" class="holiday-col">Người thực hiện</th>
                <th style="width: 100px; text-align: center;" class="holiday-col">Đối soát</th>
                <th style="width: 100px; text-align: center;">Thao Tác</th>
            `;
        }

        // Check if there are any orders
        let totalOrders = 0;
        rangeData.forEach(dayData => {
            totalOrders += dayData.orders?.length || 0;
        });

        if (totalOrders === 0) {
            if (emptyState) emptyState.style.display = "flex";
            if (tableContainer) tableContainer.style.display = "none";
            return;
        }

        if (emptyState) emptyState.style.display = "none";
        if (tableContainer) tableContainer.style.display = "block";

        // Render rows grouped by date
        rangeData.forEach((dayData) => {
            let orders = dayData.orders || [];

            // Apply unpaid filter if enabled
            if (state.showOnlyUnpaid) {
                orders = orders.filter(order => !order.isPaid);
            }

            // Apply discrepancy filter if enabled
            if (state.showOnlyWithDiscrepancy) {
                orders = orders.filter(order => (Number(order.difference) || 0) !== 0);
            }

            // Apply NCC filter if set (exact Ax prefix match)
            if (state.nccFilter) {
                const filterCode = window.SoOrderCRUD.parseNCCCode(state.nccFilter);
                if (filterCode) {
                    // Match exact Ax prefix
                    orders = orders.filter(order => {
                        if (!order.supplier) return false;
                        const orderCode = window.SoOrderCRUD.parseNCCCode(order.supplier);
                        return orderCode === filterCode;
                    });
                } else {
                    // Fallback to text search if no valid Ax code
                    const filterLower = state.nccFilter.toLowerCase();
                    orders = orders.filter(order =>
                        order.supplier && order.supplier.toLowerCase().includes(filterLower)
                    );
                }
            }

            if (orders.length === 0) return;

            // Format date display
            const dateObj = utils.parseDate(dayData.date);
            const dateDisplay = utils.formatDateDisplay(dateObj);

            orders.forEach((order, index) => {
                // In range mode, pass hasHoliday to ensure consistent table structure
                // But we'll need to check the specific day's holiday status for enabling/disabling fields
                const row = this.createOrderRow(order, index + 1, hasHoliday, dayData.isHoliday, currentMode);

                // Add date column only for the first row of each day
                if (index === 0) {
                    const tdDate = document.createElement("td");
                    tdDate.textContent = dateDisplay;
                    tdDate.style.verticalAlign = "middle";
                    tdDate.style.fontWeight = "600";
                    tdDate.rowSpan = orders.length;
                    row.insertBefore(tdDate, row.firstChild);
                } else {
                    // For subsequent rows, no date column (handled by rowspan)
                }

                tbody.appendChild(row);
            });
        });

        // Update holiday columns visibility based on whether any day is a holiday
        const holidayHeaders = document.querySelectorAll("th.holiday-col");
        holidayHeaders.forEach((header) => {
            header.style.display = hasHoliday ? "table-cell" : "none";
        });

        const holidayCells = document.querySelectorAll("td.holiday-col");
        holidayCells.forEach((cell) => {
            cell.style.display = hasHoliday ? "table-cell" : "none";
        });

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    createOrderRow(order, stt, isHolidayOverride, actualDayIsHoliday, mode = null) {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;

        const isHoliday = isHolidayOverride !== undefined ? isHolidayOverride : (dayData?.isHoliday || false);
        const dayIsHoliday = actualDayIsHoliday !== undefined ? actualDayIsHoliday : isHoliday;

        const tr = document.createElement("tr");
        tr.dataset.orderId = order.id;

        // STT
        const tdStt = document.createElement("td");
        tdStt.textContent = stt;
        tdStt.style.textAlign = "center";
        tr.appendChild(tdStt);

        // NCC
        const tdSupplier = document.createElement("td");
        tdSupplier.textContent = order.supplier;
        tr.appendChild(tdSupplier);

        // Thành Tiền (với checkbox thanh toán)
        const tdAmount = document.createElement("td");
        tdAmount.style.textAlign = "left";
        const amountCheckbox = document.createElement("input");
        amountCheckbox.type = "checkbox";
        amountCheckbox.checked = order.isPaid;
        amountCheckbox.className = "paid-checkbox";
        amountCheckbox.onclick = () => {
            window.SoOrderCRUD.togglePaidStatus(order.id, currentMode);
        };

        const amountSpan = document.createElement("span");
        amountSpan.textContent = utils.formatCurrency(order.amount);
        amountSpan.className = "amount-text";
        if (order.isPaid) {
            amountSpan.style.textDecoration = "line-through";
            amountSpan.style.color = "#9ca3af";
        }

        tdAmount.appendChild(amountCheckbox);
        tdAmount.appendChild(amountSpan);
        tr.appendChild(tdAmount);

        // Chênh Lệch
        const tdDifference = document.createElement("td");
        tdDifference.style.textAlign = "right";

        const difference = Number(order.difference) || 0;
        const hasDifference = difference !== 0;

        if (hasDifference) {
            // Create wrapper for checkbox and amount
            const wrapper = document.createElement("div");
            wrapper.className = "difference-cell-wrapper";

            // Add checkbox for marking as resolved
            const diffCheckbox = document.createElement("input");
            diffCheckbox.type = "checkbox";
            diffCheckbox.className = "difference-checkbox";
            diffCheckbox.checked = order.differenceResolved || false;
            diffCheckbox.title = order.differenceResolved ? "Bỏ đánh dấu đã xử lý" : "Đánh dấu đã xử lý";
            diffCheckbox.onclick = (e) => {
                e.stopPropagation();
                if (diffCheckbox.checked) {
                    // Show modal for adding note
                    this.showDifferenceNoteModal(order.id);
                    // Temporarily uncheck until confirmed
                    diffCheckbox.checked = false;
                } else {
                    // Ask for confirmation before unchecking
                    this.confirmUnresolveDifference(order.id);
                }
            };
            wrapper.appendChild(diffCheckbox);

            // Create amount container with tooltip
            const amountContainer = document.createElement("div");
            amountContainer.className = "difference-amount-container";

            // Amount span
            const amountSpan = document.createElement("span");
            amountSpan.textContent = utils.formatCurrency(difference);
            amountSpan.style.fontWeight = "600";

            // Color based on positive/negative
            if (difference > 0) {
                amountSpan.style.color = "#10b981"; // Green for profit
            } else {
                amountSpan.style.color = "#ef4444"; // Red for loss
            }

            // Add strikethrough if resolved
            if (order.differenceResolved) {
                amountSpan.classList.add("difference-resolved");
            }

            amountContainer.appendChild(amountSpan);

            // Add tooltip if there's a note
            if (order.differenceResolved && order.differenceNote) {
                const tooltip = document.createElement("div");
                tooltip.className = "difference-tooltip";
                tooltip.textContent = order.differenceNote;
                amountContainer.appendChild(tooltip);
            }

            wrapper.appendChild(amountContainer);
            tdDifference.appendChild(wrapper);
        } else {
            // No difference - just show the amount
            tdDifference.textContent = utils.formatCurrency(difference);
            tdDifference.style.color = "#9ca3af";
        }

        tr.appendChild(tdDifference);

        // Ghi Chú
        const tdNote = document.createElement("td");
        tdNote.textContent = order.note || "-";
        tr.appendChild(tdNote);

        // Người thực hiện (holiday only)
        if (isHoliday) {
            const tdPerformer = document.createElement("td");
            tdPerformer.className = "holiday-col performer-cell";

            // Only make editable if this specific day is a holiday
            if (dayIsHoliday) {
                tdPerformer.contentEditable = "true";
                tdPerformer.textContent = order.performer || "";
                tdPerformer.dataset.orderId = order.id;
                tdPerformer.dataset.originalValue = order.performer || "";

                // Handle blur event to save changes
                tdPerformer.addEventListener("blur", async (e) => {
                    const newValue = e.target.textContent.trim();
                    const originalValue = e.target.dataset.originalValue;

                    if (newValue !== originalValue) {
                        // Update in Firebase
                        const success = await window.SoOrderCRUD.updateOrderField(
                            order.id,
                            "performer",
                            newValue
                        );

                        if (success) {
                            e.target.dataset.originalValue = newValue;
                            window.SoOrderUtils.showToast("Đã cập nhật người thực hiện", "success");
                        } else {
                            // Revert on failure
                            e.target.textContent = originalValue;
                        }
                    }
                });

                // Handle Enter key to blur
                tdPerformer.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        e.target.blur();
                    }
                });
            } else {
                // Non-holiday day in a range that includes holidays - show as dash
                tdPerformer.textContent = "-";
                tdPerformer.style.color = "#9ca3af";
            }

            tr.appendChild(tdPerformer);

            // Đối soát (holiday only)
            const tdReconciled = document.createElement("td");
            tdReconciled.className = "holiday-col";
            tdReconciled.style.textAlign = "center";

            if (dayIsHoliday) {
                const reconciledCheckbox = document.createElement("input");
                reconciledCheckbox.type = "checkbox";
                reconciledCheckbox.checked = order.isReconciled;
                reconciledCheckbox.onclick = () => {
                    window.SoOrderCRUD.toggleReconciledStatus(order.id, currentMode);
                };
                tdReconciled.appendChild(reconciledCheckbox);
            } else {
                // Non-holiday day - show as dash
                tdReconciled.textContent = "-";
                tdReconciled.style.color = "#9ca3af";
            }

            tr.appendChild(tdReconciled);
        }

        // Thao Tác
        const tdActions = document.createElement("td");
        tdActions.style.textAlign = "center";

        const btnEdit = document.createElement("button");
        btnEdit.className = "btn-icon btn-icon-sm";
        btnEdit.title = "Chỉnh sửa";
        btnEdit.innerHTML = '<i data-lucide="edit"></i>';
        btnEdit.onclick = () => this.showEditModal(order.id, currentMode);

        const btnDelete = document.createElement("button");
        btnDelete.className = "btn-icon btn-icon-sm";
        btnDelete.title = "Xóa";
        btnDelete.innerHTML = '<i data-lucide="trash-2"></i>';
        btnDelete.onclick = () => this.showDeleteConfirm(order.id, currentMode);

        tdActions.appendChild(btnEdit);
        tdActions.appendChild(btnDelete);
        tr.appendChild(tdActions);

        return tr;
    },

    // =====================================================
    // ADD FORM
    // =====================================================

    showAddForm(mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        const formContainer = isReturns
            ? document.getElementById('addReturnFormContainer')
            : elements.addOrderFormContainer;
        const supplierInput = isReturns
            ? document.getElementById('addReturnSupplier')
            : elements.addSupplier;

        if (formContainer) {
            formContainer.style.display = "block";
        }
        // Focus on supplier input
        if (supplierInput) {
            setTimeout(() => supplierInput.focus(), 100);
        }
    },

    hideAddForm(mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        const formContainer = isReturns
            ? document.getElementById('addReturnFormContainer')
            : elements.addOrderFormContainer;

        if (formContainer) {
            formContainer.style.display = "none";
        }
        utils.clearAddForm(currentMode);
    },

    async handleAddOrder(mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;
        const isHoliday = dayData?.isHoliday || false;

        // Get appropriate input elements
        const supplierInput = isReturns
            ? document.getElementById('addReturnSupplier')
            : elements.addSupplier;
        const amountInput = isReturns
            ? document.getElementById('addReturnAmount')
            : elements.addAmount;
        const differenceInput = isReturns
            ? document.getElementById('addReturnDifference')
            : elements.addDifference;
        const noteInput = isReturns
            ? document.getElementById('addReturnNote')
            : elements.addNote;
        const performerInput = isReturns
            ? document.getElementById('addReturnPerformer')
            : elements.addPerformer;
        const isReconciledInput = isReturns
            ? document.getElementById('addReturnIsReconciled')
            : elements.addIsReconciled;

        const orderData = {
            supplier: supplierInput?.value || "",
            amount: amountInput?.value || 0,
            difference: differenceInput?.value || 0,
            note: noteInput?.value || "",
            performer: isHoliday ? performerInput?.value || "" : "",
            isReconciled: isHoliday
                ? isReconciledInput?.checked || false
                : false,
        };

        // Use NCC check processing
        const success = await this.processOrderWithNCCCheck(orderData, false, currentMode);

        if (success) {
            this.hideAddForm(currentMode);
        }
    },

    // =====================================================
    // EDIT MODAL
    // =====================================================

    showEditModal(orderId, mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;
        const order = dayData?.orders?.find((o) => o.id === orderId);

        if (!order) return;

        // Set editing order ID based on mode
        if (isReturns) {
            state.editingReturnId = orderId;
        } else {
            state.editingOrderId = orderId;
        }

        // Fill form
        if (elements.editSupplier) elements.editSupplier.value = order.supplier;
        if (elements.editAmount) elements.editAmount.value = order.amount;
        if (elements.editDifference)
            elements.editDifference.value = order.difference;
        if (elements.editNote) elements.editNote.value = order.note || "";

        const isHoliday = dayData?.isHoliday || false;
        if (isHoliday) {
            if (elements.editPerformer)
                elements.editPerformer.value = order.performer || "";
            if (elements.editIsReconciled)
                elements.editIsReconciled.checked = order.isReconciled || false;
        }

        // Show modal
        if (elements.editOrderModal) {
            elements.editOrderModal.style.display = "flex";
        }

        // Focus on supplier input
        if (elements.editSupplier) {
            setTimeout(() => elements.editSupplier.focus(), 100);
        }
    },

    hideEditModal() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        state.editingOrderId = null;
        state.editingReturnId = null;

        if (elements.editOrderModal) {
            elements.editOrderModal.style.display = "none";
        }
    },

    async handleUpdateOrder() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Determine which mode based on which ID is set
        const isReturns = state.editingReturnId !== null;
        const currentMode = isReturns ? 'returns' : 'orders';
        const editingId = isReturns ? state.editingReturnId : state.editingOrderId;
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;
        const isHoliday = dayData?.isHoliday || false;

        if (!editingId) return;

        const updatedData = {
            supplier: elements.editSupplier?.value || "",
            amount: elements.editAmount?.value || 0,
            difference: elements.editDifference?.value || 0,
            note: elements.editNote?.value || "",
            performer: isHoliday ? elements.editPerformer?.value || "" : "",
            isReconciled: isHoliday
                ? elements.editIsReconciled?.checked || false
                : false,
        };

        // Use NCC check processing
        const success = await this.processOrderWithNCCCheck(updatedData, true, currentMode);

        if (success) {
            this.hideEditModal();
        }
    },

    // =====================================================
    // DELETE CONFIRM MODAL
    // =====================================================

    showDeleteConfirm(orderId, mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        if (isReturns) {
            state.deleteReturnId = orderId;
        } else {
            state.deleteOrderId = orderId;
        }

        if (elements.deleteConfirmModal) {
            elements.deleteConfirmModal.style.display = "flex";
        }
    },

    hideDeleteConfirm() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        state.deleteOrderId = null;
        state.deleteReturnId = null;

        if (elements.deleteConfirmModal) {
            elements.deleteConfirmModal.style.display = "none";
        }
    },

    async handleDeleteOrder() {
        const state = window.SoOrderState;

        // Determine which mode based on which ID is set
        const isReturns = state.deleteReturnId !== null;
        const currentMode = isReturns ? 'returns' : 'orders';
        const deleteId = isReturns ? state.deleteReturnId : state.deleteOrderId;

        if (!deleteId) return;

        const success = await window.SoOrderCRUD.deleteOrder(deleteId, currentMode);

        if (success) {
            this.hideDeleteConfirm();
        }
    },

    // =====================================================
    // HOLIDAY MODAL & CALENDAR
    // =====================================================

    async showHolidayModal() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Initialize calendar view date to current month
        state.calendarViewDate = new Date();

        // Load holidays from Firebase
        await this.loadHolidays();

        // Render calendar
        this.renderCalendar();

        // Show modal
        if (elements.holidayModal) {
            elements.holidayModal.style.display = "flex";
        }
    },

    hideHolidayModal() {
        const elements = window.SoOrderElements;

        if (elements.holidayModal) {
            elements.holidayModal.style.display = "none";
        }
    },

    async loadHolidays() {
        const state = window.SoOrderState;
        const config = window.SoOrderConfig;

        try {
            // Get all documents from order-logs to find holidays
            const snapshot = await config.orderLogsCollectionRef.get();

            state.holidays.clear();

            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.isHoliday) {
                    state.holidays.set(data.date, true);
                }
            });
        } catch (error) {
            console.error("Error loading holidays:", error);
        }
    },

    renderCalendar() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        if (!elements.calendarGrid) return;

        const viewDate = state.calendarViewDate;
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        // Update month/year header
        const monthNames = [
            "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
            "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"
        ];
        if (elements.calendarMonthYear) {
            elements.calendarMonthYear.textContent = `${monthNames[month]}, ${year}`;
        }

        // Clear grid
        elements.calendarGrid.innerHTML = "";

        // Add day headers
        const dayHeaders = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
        dayHeaders.forEach((dayName) => {
            const header = document.createElement("div");
            header.className = "calendar-day-header";
            header.textContent = dayName;
            elements.calendarGrid.appendChild(header);
        });

        // Get first day of month and total days
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const totalDays = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

        // Today's date for comparison
        const today = new Date();
        const todayString = utils.formatDate(today);

        // Add empty cells for days before month starts
        for (let i = 0; i < startDayOfWeek; i++) {
            const emptyCell = document.createElement("div");
            emptyCell.className = "calendar-day disabled";
            elements.calendarGrid.appendChild(emptyCell);
        }

        // Add days of the month
        for (let day = 1; day <= totalDays; day++) {
            const date = new Date(year, month, day);
            const dateString = utils.formatDate(date);

            const dayCell = document.createElement("div");
            dayCell.className = "calendar-day";
            dayCell.textContent = day;
            dayCell.dataset.date = dateString;

            // Check if today
            if (dateString === todayString) {
                dayCell.classList.add("today");
            }

            // Check if holiday
            if (state.holidays.has(dateString)) {
                dayCell.classList.add("holiday");
            }

            // Click handler to toggle holiday
            dayCell.addEventListener("click", () => {
                this.handleCalendarDayClick(dateString, dayCell);
            });

            elements.calendarGrid.appendChild(dayCell);
        }

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    async handleCalendarDayClick(dateString, dayCell) {
        const state = window.SoOrderState;

        // Toggle holiday status
        const isCurrentlyHoliday = state.holidays.has(dateString);
        const newHolidayStatus = !isCurrentlyHoliday;

        // Update Firebase
        const success = await window.SoOrderCRUD.toggleHoliday(
            dateString,
            newHolidayStatus
        );

        if (success) {
            // Update local state
            if (newHolidayStatus) {
                state.holidays.set(dateString, true);
                dayCell.classList.add("holiday");
            } else {
                state.holidays.delete(dateString);
                dayCell.classList.remove("holiday");
            }

            // If we toggled the current viewing date, refresh the table
            if (dateString === state.currentDateString) {
                this.renderTable();
                this.updateFooterSummary();
                this.toggleHolidayColumnsVisibility();
            }
        }
    },

    navigateCalendarMonth(offset) {
        const state = window.SoOrderState;

        // Move calendar view date by offset months
        const newDate = new Date(state.calendarViewDate);
        newDate.setMonth(newDate.getMonth() + offset);
        state.calendarViewDate = newDate;

        // Re-render calendar
        this.renderCalendar();
    },

    // =====================================================
    // HOLIDAY COLUMNS VISIBILITY
    // =====================================================

    toggleHolidayColumnsVisibility(mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;
        const isHoliday = dayData?.isHoliday || false;

        // Get appropriate container for the current tab
        const container = isReturns
            ? document.getElementById('returnsTabContent')
            : document.getElementById('ordersTabContent');

        if (!container) return;

        // Show/hide holiday columns in table header
        const holidayHeaders = container.querySelectorAll("th.holiday-col");
        holidayHeaders.forEach((header) => {
            header.style.display = isHoliday ? "table-cell" : "none";
        });

        // Show/hide holiday columns in table body
        const holidayCells = container.querySelectorAll("td.holiday-col");
        holidayCells.forEach((cell) => {
            cell.style.display = isHoliday ? "table-cell" : "none";
        });

        // Show/hide holiday badge
        const holidayBadge = isReturns
            ? document.getElementById('returnHolidayBadge')
            : elements.holidayBadge;
        if (holidayBadge) {
            holidayBadge.style.display = isHoliday ? "inline-flex" : "none";
        }

        // Show/hide holiday fields in add form
        const holidayFieldsAdd = isReturns
            ? document.getElementById('returnHolidayFieldsAdd')
            : elements.holidayFieldsAdd;
        if (holidayFieldsAdd) {
            holidayFieldsAdd.style.display = isHoliday ? "flex" : "none";
        }
        if (elements.holidayFieldsEdit) {
            elements.holidayFieldsEdit.style.display = isHoliday ? "block" : "none";
        }
    },

    // =====================================================
    // FOOTER SUMMARY
    // =====================================================

    updateFooterSummary(mode = null) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';

        // Get appropriate elements based on mode
        const footerSummary = isReturns
            ? document.getElementById('returnFooterSummary')
            : elements.footerSummary;
        const totalAmountEl = isReturns
            ? document.getElementById('returnTotalAmount')
            : elements.totalAmount;
        const totalDifferenceEl = isReturns
            ? document.getElementById('returnTotalDifference')
            : elements.totalDifference;

        // Get appropriate data based on mode
        const dayData = isReturns ? state.currentReturnDayData : state.currentDayData;
        const rangeData = isReturns ? state.returnsRangeData : state.rangeData;

        let orders = [];

        // Get orders based on mode
        if (state.isRangeMode) {
            // Collect all orders from range
            rangeData.forEach((data) => {
                if (data.orders) {
                    orders = orders.concat(data.orders);
                }
            });
        } else {
            orders = dayData?.orders || [];
        }

        // Apply unpaid filter if enabled
        if (state.showOnlyUnpaid) {
            orders = orders.filter(order => !order.isPaid);
        }

        // Apply discrepancy filter if enabled
        if (state.showOnlyWithDiscrepancy) {
            orders = orders.filter(order => (Number(order.difference) || 0) !== 0);
        }

        if (orders.length === 0) {
            if (footerSummary) {
                footerSummary.style.display = "none";
            }
            return;
        }

        // Calculate totals
        let totalAmount = 0;
        let totalDifference = 0;

        orders.forEach((order) => {
            totalAmount += Number(order.amount) || 0;
            totalDifference += Number(order.difference) || 0;
        });

        // Update DOM
        if (totalAmountEl) {
            totalAmountEl.textContent = utils.formatCurrency(totalAmount);
        }

        if (totalDifferenceEl) {
            totalDifferenceEl.textContent = utils.formatCurrency(totalDifference);
            // Color based on positive/negative
            if (totalDifference > 0) {
                totalDifferenceEl.style.color = "#10b981";
            } else if (totalDifference < 0) {
                totalDifferenceEl.style.color = "#ef4444";
            } else {
                totalDifferenceEl.style.color = "#333";
            }
        }

        if (footerSummary) {
            footerSummary.style.display = "flex";
        }
    },

    // =====================================================
    // DATE RANGE MODAL
    // =====================================================

    showDateRangeModal() {
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        // Set default values
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        if (elements.startDateInput) {
            elements.startDateInput.value = utils.formatDate(weekAgo);
        }
        if (elements.endDateInput) {
            elements.endDateInput.value = utils.formatDate(today);
        }

        // Show modal
        if (elements.dateRangeModal) {
            elements.dateRangeModal.style.display = "flex";
        }

        // Focus on start date input
        if (elements.startDateInput) {
            setTimeout(() => elements.startDateInput.focus(), 100);
        }
    },

    hideDateRangeModal() {
        const elements = window.SoOrderElements;

        if (elements.dateRangeModal) {
            elements.dateRangeModal.style.display = "none";
        }
    },

    async handleApplyDateRange() {
        const elements = window.SoOrderElements;
        const utils = window.SoOrderUtils;

        const startDateStr = elements.startDateInput?.value;
        const endDateStr = elements.endDateInput?.value;

        if (!startDateStr || !endDateStr) {
            utils.showToast("Vui lòng chọn cả ngày bắt đầu và ngày kết thúc", "error");
            return;
        }

        const startDate = utils.parseDate(startDateStr);
        const endDate = utils.parseDate(endDateStr);

        if (startDate > endDate) {
            utils.showToast("Ngày bắt đầu phải trước ngày kết thúc", "error");
            return;
        }

        // Close modal
        this.hideDateRangeModal();

        // Load date range data
        await window.SoOrderCRUD.loadDateRangeData(startDateStr, endDateStr);
    },

    // =====================================================
    // DIFFERENCE RESOLVED MODAL & FUNCTIONS
    // =====================================================

    showDifferenceNoteModal(orderId) {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        // Store the order ID being edited
        state.differenceNoteOrderId = orderId;

        // Clear previous note
        const noteInput = document.getElementById("differenceNoteInput");
        if (noteInput) {
            noteInput.value = "";
        }

        // Show modal
        const modal = document.getElementById("differenceNoteModal");
        if (modal) {
            modal.style.display = "flex";
            // Focus on textarea
            if (noteInput) {
                setTimeout(() => noteInput.focus(), 100);
            }
        }

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    hideDifferenceNoteModal() {
        const state = window.SoOrderState;

        state.differenceNoteOrderId = null;

        const modal = document.getElementById("differenceNoteModal");
        if (modal) {
            modal.style.display = "none";
        }
    },

    async handleSaveDifferenceNote() {
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;

        if (!state.differenceNoteOrderId) return;

        const noteInput = document.getElementById("differenceNoteInput");
        const note = noteInput?.value?.trim() || "";

        if (!note) {
            utils.showToast("Vui lòng nhập ghi chú xử lý", "error");
            return;
        }

        // Update the order
        const success = await window.SoOrderCRUD.updateDifferenceResolved(
            state.differenceNoteOrderId,
            true,
            note
        );

        if (success) {
            this.hideDifferenceNoteModal();
            utils.showToast("Đã đánh dấu chênh lệch đã xử lý", "success");
        }
    },

    async confirmUnresolveDifference(orderId) {
        const utils = window.SoOrderUtils;

        // Simple confirm dialog
        const confirmed = confirm("Bạn có chắc muốn bỏ đánh dấu đã xử lý và xóa ghi chú?");

        if (confirmed) {
            const success = await window.SoOrderCRUD.updateDifferenceResolved(
                orderId,
                false,
                ""
            );

            if (success) {
                utils.showToast("Đã bỏ đánh dấu xử lý chênh lệch", "success");
            }
        } else {
            // Re-render table to restore checkbox state
            this.renderTable();
        }
    },

    // Helper function to escape HTML
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    },

    // =====================================================
    // NCC MANAGEMENT
    // =====================================================

    // Store exact match for Tab selection
    exactMatchNCC: null,

    // Show NCC suggestions dropdown
    showNCCSuggestions(inputElement, suggestionsElement) {
        const state = window.SoOrderState;
        const value = inputElement.value.trim().toLowerCase();

        // Reset exact match
        this.exactMatchNCC = null;

        if (!suggestionsElement) return;

        // Clear previous suggestions
        suggestionsElement.innerHTML = "";

        if (!value || state.nccNames.length === 0) {
            suggestionsElement.classList.remove("active");
            return;
        }

        // Filter matching NCC names from saved list
        const matches = state.nccNames.filter((ncc) =>
            ncc.name.toLowerCase().includes(value)
        );

        if (matches.length === 0) {
            suggestionsElement.classList.remove("active");
            return;
        }

        // Find exact Ax code match (e.g., "a5" matches "A5")
        const exactMatch = state.nccNames.find((ncc) =>
            ncc.code.toLowerCase() === value
        );

        if (exactMatch) {
            this.exactMatchNCC = exactMatch;
        }

        // Create suggestion items
        matches.forEach((ncc) => {
            const item = document.createElement("div");
            item.className = "ncc-suggestion-item";

            // Highlight exact match
            if (exactMatch && ncc.code === exactMatch.code) {
                item.classList.add("exact-match");
            }

            item.innerHTML = `<span class="ncc-code">${ncc.code}</span><span class="ncc-name">${this.escapeHtml(ncc.name.substring(ncc.code.length))}</span>`;
            item.addEventListener("click", () => {
                inputElement.value = ncc.name;
                suggestionsElement.classList.remove("active");
                this.exactMatchNCC = null;
                // Move focus to amount input
                const amountInput = document.getElementById("addAmount") || document.getElementById("editAmount");
                if (amountInput) {
                    amountInput.focus();
                }
            });
            suggestionsElement.appendChild(item);
        });

        suggestionsElement.classList.add("active");
    },

    // Select exact match NCC (called on Tab)
    selectExactMatchNCC(inputElement, suggestionsElement) {
        if (this.exactMatchNCC) {
            inputElement.value = this.exactMatchNCC.name;
            suggestionsElement.classList.remove("active");
            this.exactMatchNCC = null;
            return true;
        }
        return false;
    },

    // Hide all NCC suggestions
    hideNCCSuggestions() {
        const elements = window.SoOrderElements;
        if (elements.addSupplierSuggestions) {
            elements.addSupplierSuggestions.classList.remove("active");
        }
        if (elements.editSupplierSuggestions) {
            elements.editSupplierSuggestions.classList.remove("active");
        }
    },

    // Show NCC management modal
    async showNCCManageModal() {
        const elements = window.SoOrderElements;

        // Load latest NCC names
        await window.SoOrderCRUD.loadNCCNames();

        // Render NCC list
        this.renderNCCList();

        // Show modal
        if (elements.nccManageModal) {
            elements.nccManageModal.style.display = "flex";
        }

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    // Hide NCC management modal
    hideNCCManageModal() {
        const elements = window.SoOrderElements;
        if (elements.nccManageModal) {
            elements.nccManageModal.style.display = "none";
        }
    },

    // Render NCC list in management modal
    renderNCCList() {
        const state = window.SoOrderState;
        const elements = window.SoOrderElements;

        if (!elements.nccList) return;

        elements.nccList.innerHTML = "";

        if (state.nccNames.length === 0) {
            if (elements.nccEmptyState) {
                elements.nccEmptyState.style.display = "flex";
            }
            elements.nccList.style.display = "none";
            return;
        }

        if (elements.nccEmptyState) {
            elements.nccEmptyState.style.display = "none";
        }
        elements.nccList.style.display = "block";

        state.nccNames.forEach((ncc) => {
            const item = document.createElement("div");
            item.className = "ncc-list-item";
            item.innerHTML = `
                <div class="ncc-list-item-info">
                    <span class="ncc-list-item-code">${ncc.code}</span>
                    <span class="ncc-list-item-name">${this.escapeHtml(ncc.name)}</span>
                </div>
                <div class="ncc-list-item-actions">
                    <button class="btn-icon-sm delete" title="Xóa" data-code="${ncc.code}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;

            // Add delete handler
            const deleteBtn = item.querySelector(".delete");
            deleteBtn.addEventListener("click", async () => {
                if (confirm(`Bạn có chắc chắn muốn xóa "${ncc.name}"?`)) {
                    await window.SoOrderCRUD.deleteNCCName(ncc.code);
                    this.renderNCCList();
                }
            });

            elements.nccList.appendChild(item);
        });

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    // NCC conflict state
    nccConflictCallback: null,
    nccConflictNewName: "",
    nccConflictExistingName: "",

    // Show NCC conflict modal
    showNCCConflictModal(newName, existingName, callback) {
        const elements = window.SoOrderElements;

        this.nccConflictCallback = callback;
        this.nccConflictNewName = newName;
        this.nccConflictExistingName = existingName;

        // Set names in modal
        if (elements.nccConflictNewName) {
            elements.nccConflictNewName.textContent = newName;
        }
        if (elements.nccConflictExistingName) {
            elements.nccConflictExistingName.textContent = existingName;
        }

        // Reset radio selection to new
        const newRadio = document.querySelector('input[name="nccConflictChoice"][value="new"]');
        if (newRadio) newRadio.checked = true;

        // Show modal
        if (elements.nccConflictModal) {
            elements.nccConflictModal.style.display = "flex";
        }
    },

    // Hide NCC conflict modal
    hideNCCConflictModal() {
        const elements = window.SoOrderElements;
        if (elements.nccConflictModal) {
            elements.nccConflictModal.style.display = "none";
        }
        this.nccConflictCallback = null;
    },

    // Handle NCC conflict confirmation
    handleNCCConflictConfirm() {
        const selectedValue = document.querySelector('input[name="nccConflictChoice"]:checked')?.value;

        if (this.nccConflictCallback) {
            if (selectedValue === "new") {
                // User chose new name - update the stored name
                this.nccConflictCallback(this.nccConflictNewName, true);
            } else {
                // User chose existing name - use stored name
                this.nccConflictCallback(this.nccConflictExistingName, false);
            }
        }

        this.hideNCCConflictModal();
    },

    // Process order with NCC check
    async processOrderWithNCCCheck(orderData, isEdit, mode = null) {
        const crud = window.SoOrderCRUD;
        const state = window.SoOrderState;
        const utils = window.SoOrderUtils;
        const supplierName = orderData.supplier.trim();

        // Use current tab if mode not specified
        const currentMode = mode || state.currentTab || 'orders';
        const isReturns = currentMode === 'returns';
        const editingId = isReturns ? state.editingReturnId : state.editingOrderId;

        // Parse Ax code from supplier name
        const code = crud.parseNCCCode(supplierName);

        // Check if supplier exists in Firebase (by Ax code)
        const supplierExists = code && state.nccNames.some(
            (n) => n.code.toUpperCase() === code.toUpperCase()
        );

        if (!supplierExists) {
            // Supplier doesn't exist - show error modal
            this.showSupplierNotFoundModal();
            return false;
        }

        // Check for conflict (same code but different name)
        const existingName = crud.checkNCCConflict(supplierName);

        if (existingName) {
            // Show conflict modal - user can choose existing name or their input name
            return new Promise((resolve) => {
                this.showNCCConflictModal(supplierName, existingName, async (chosenName, isNew) => {
                    // Update orderData with chosen name
                    orderData.supplier = chosenName;

                    // Proceed with order operation (không tự động cập nhật tên NCC)
                    let success;
                    if (isEdit) {
                        success = await crud.updateOrder(editingId, orderData, currentMode);
                    } else {
                        success = await crud.addOrder(orderData, currentMode);
                    }

                    resolve(success);
                });
            });
        }

        // No conflict - proceed normally
        let success;
        if (isEdit) {
            success = await crud.updateOrder(editingId, orderData, currentMode);
        } else {
            success = await crud.addOrder(orderData, currentMode);
        }

        return success;
    },

    // Show modal when supplier not found in Firebase
    showSupplierNotFoundModal() {
        // Get or create the modal
        let modal = document.getElementById("supplierNotFoundModal");
        if (!modal) {
            modal = this.createSupplierNotFoundModal();
            document.body.appendChild(modal);
        }

        // Show modal
        modal.style.display = "flex";

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    // Create supplier not found modal dynamically
    createSupplierNotFoundModal() {
        const modal = document.createElement("div");
        modal.className = "modal";
        modal.id = "supplierNotFoundModal";
        modal.style.display = "none";

        modal.innerHTML = `
            <div class="modal-overlay" id="supplierNotFoundModalOverlay"></div>
            <div class="modal-content modal-small">
                <div class="modal-header">
                    <h3>
                        <i data-lucide="alert-circle"></i>
                        Không tìm thấy NCC
                    </h3>
                    <button class="btn-icon" id="btnCloseSupplierNotFoundModal">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p style="text-align: center; color: #ef4444; font-weight: 500;">
                        Nhà cung cấp chưa tồn tại trong TPOS, vui lòng tạo NCC trên TPOS sau đó F5 lại trang
                    </p>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary" id="btnConfirmSupplierNotFound">
                        <i data-lucide="check"></i>
                        Đã hiểu
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        const overlay = modal.querySelector("#supplierNotFoundModalOverlay");
        const closeBtn = modal.querySelector("#btnCloseSupplierNotFoundModal");
        const confirmBtn = modal.querySelector("#btnConfirmSupplierNotFound");

        const hideModal = () => {
            modal.style.display = "none";
        };

        overlay.addEventListener("click", hideModal);
        closeBtn.addEventListener("click", hideModal);
        confirmBtn.addEventListener("click", hideModal);

        return modal;
    },

    // Handle manual NCC add from management modal
    async handleAddNCCManual() {
        const elements = window.SoOrderElements;
        const crud = window.SoOrderCRUD;
        const utils = window.SoOrderUtils;

        const input = document.getElementById("nccManualInput");
        if (!input) return;

        const supplierName = input.value.trim();

        // Validate input
        if (!supplierName) {
            utils.showToast("Vui lòng nhập tên NCC", "error");
            return;
        }

        // Check if name has valid Ax format
        const code = crud.parseNCCCode(supplierName);
        if (!code) {
            utils.showToast("Tên NCC phải bắt đầu bằng Ax (VD: A1, A2, ...)", "error");
            return;
        }

        // Check for conflict
        const existingName = crud.checkNCCConflict(supplierName);

        if (existingName) {
            // Show conflict modal
            this.showNCCConflictModal(supplierName, existingName, async (chosenName, isNew) => {
                if (isNew) {
                    // Update the stored NCC name
                    await crud.updateNCCName(code, chosenName);
                    utils.showToast("Đã cập nhật tên NCC", "success");
                } else {
                    // User chose existing name - no action needed
                    utils.showToast("Giữ nguyên tên đã lưu", "info");
                }

                // Clear input and refresh list
                input.value = "";
                this.renderNCCList();

                // Reinitialize Lucide icons
                if (window.lucide) {
                    lucide.createIcons();
                }
            });
        } else {
            // No conflict - save the NCC name
            const result = await crud.saveNCCName(supplierName);

            if (result.success) {
                utils.showToast("Đã thêm tên NCC mới", "success");
                input.value = "";
                this.renderNCCList();

                // Reinitialize Lucide icons
                if (window.lucide) {
                    lucide.createIcons();
                }
            }
        }
    },

    // Fetch and save suppliers from TPOS to Firebase
    async handleFetchFromTPOS() {
        const loader = window.SoOrderSupplierLoader;
        const utils = window.SoOrderUtils;
        const crud = window.SoOrderCRUD;

        if (!loader) {
            console.error('[UI] Supplier loader not found');
            if (utils && utils.showToast) {
                utils.showToast('Lỗi: Module tải NCC không khả dụng', 'error');
            }
            return;
        }

        // Fetch suppliers from TPOS and save to Firebase (overwrite existing)
        const result = await loader.loadAndSaveSuppliers();

        if (result.success) {
            // Reload NCC names from Firebase to get the updated list
            await crud.loadNCCNames();

            // Render the updated list in modal
            this.renderNCCList();

            if (utils && utils.showToast) {
                utils.showToast(`✅ Đã lưu ${result.count} NCC vào Firebase`, 'success');
            }
        } else {
            // Show error
            if (utils && utils.showToast) {
                utils.showToast('Không tải được danh sách NCC từ TPOS', 'error');
            }
        }
    },

    // =====================================================
    // DUPLICATE SUPPLIER SELECTION MODAL
    // =====================================================
    duplicateSupplierCallback: null,

    // Show modal for selecting one supplier from duplicates
    showDuplicateSupplierModal(code, options, callback) {
        this.duplicateSupplierCallback = callback;

        // Get or create the modal
        let modal = document.getElementById("duplicateSupplierModal");
        if (!modal) {
            // Create modal dynamically if not exists
            modal = this.createDuplicateSupplierModal();
            document.body.appendChild(modal);
        }

        // Set the code in title
        const titleCode = modal.querySelector("#duplicateSupplierCode");
        if (titleCode) {
            titleCode.textContent = code;
        }

        // Build options list
        const optionsList = modal.querySelector("#duplicateSupplierOptions");
        if (optionsList) {
            optionsList.innerHTML = "";

            options.forEach((option, index) => {
                const optionDiv = document.createElement("div");
                optionDiv.className = "ncc-conflict-option";

                const isExisting = option.isExisting;
                const labelText = isExisting ? "Tên đã lưu:" : "Tên từ TPOS:";

                optionDiv.innerHTML = `
                    <label>
                        <input type="radio" name="duplicateSupplierChoice" value="${index}" ${index === 0 ? "checked" : ""} />
                        <span class="ncc-conflict-label">${labelText}</span>
                        <span class="ncc-conflict-name">${option.name}</span>
                    </label>
                `;

                optionsList.appendChild(optionDiv);
            });
        }

        // Store options for later retrieval
        modal.dataset.options = JSON.stringify(options);

        // Show modal
        modal.style.display = "flex";

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    },

    // Create duplicate supplier modal dynamically
    createDuplicateSupplierModal() {
        const modal = document.createElement("div");
        modal.className = "modal";
        modal.id = "duplicateSupplierModal";
        modal.style.display = "none";

        modal.innerHTML = `
            <div class="modal-overlay" id="duplicateSupplierModalOverlay"></div>
            <div class="modal-content modal-small">
                <div class="modal-header">
                    <h3>
                        <i data-lucide="alert-triangle"></i>
                        Trùng mã NCC: <span id="duplicateSupplierCode"></span>
                    </h3>
                    <button class="btn-icon" id="btnCloseDuplicateSupplierModal">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p>Phát hiện nhiều nhà cung cấp có cùng mã. Vui lòng chọn tên chính xác:</p>
                    <div class="ncc-conflict-options" id="duplicateSupplierOptions"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="btnSkipDuplicateSupplier">Bỏ qua</button>
                    <button class="btn-primary" id="btnConfirmDuplicateSupplier">
                        <i data-lucide="check"></i>
                        Xác nhận
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        const overlay = modal.querySelector("#duplicateSupplierModalOverlay");
        const closeBtn = modal.querySelector("#btnCloseDuplicateSupplierModal");
        const skipBtn = modal.querySelector("#btnSkipDuplicateSupplier");
        const confirmBtn = modal.querySelector("#btnConfirmDuplicateSupplier");

        overlay.addEventListener("click", () => this.hideDuplicateSupplierModal(null));
        closeBtn.addEventListener("click", () => this.hideDuplicateSupplierModal(null));
        skipBtn.addEventListener("click", () => this.hideDuplicateSupplierModal(null));
        confirmBtn.addEventListener("click", () => this.handleDuplicateSupplierConfirm());

        return modal;
    },

    // Hide duplicate supplier modal
    hideDuplicateSupplierModal(selected) {
        const modal = document.getElementById("duplicateSupplierModal");
        if (modal) {
            modal.style.display = "none";
        }

        if (this.duplicateSupplierCallback) {
            this.duplicateSupplierCallback(selected);
            this.duplicateSupplierCallback = null;
        }
    },

    // Handle duplicate supplier confirmation
    handleDuplicateSupplierConfirm() {
        const modal = document.getElementById("duplicateSupplierModal");
        if (!modal) {
            this.hideDuplicateSupplierModal(null);
            return;
        }

        const selectedRadio = modal.querySelector('input[name="duplicateSupplierChoice"]:checked');
        if (!selectedRadio) {
            this.hideDuplicateSupplierModal(null);
            return;
        }

        const selectedIndex = parseInt(selectedRadio.value);
        const options = JSON.parse(modal.dataset.options || "[]");
        const selected = options[selectedIndex] || null;

        this.hideDuplicateSupplierModal(selected);
    },
};
