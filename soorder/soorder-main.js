// =====================================================
// MAIN INITIALIZATION
// File: soorder-main.js
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Sổ Order: Initializing...");

    // Initialize DOM elements
    initDOMElements();

    // Setup event listeners
    setupEventListeners();

    // Auth is already checked in auth.js - no need to call again
    // Just verify user is authenticated
    if (typeof authManager !== "undefined" && !authManager.isAuthenticated()) {
        console.warn("User not authenticated, redirecting...");
        return;
    }

    // Setup keyboard navigation
    window.SoOrderUtils.setupKeyboardNavigation();

    // Load NCC names from Firebase (user can manually refresh from TPOS using button in modal)
    await window.SoOrderCRUD.loadNCCNames();

    // Load today's data
    window.SoOrderUtils.gotoToday();

    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }

    console.log("Sổ Order: Ready!");
});

function initDOMElements() {
    const elements = window.SoOrderElements;

    // Date navigation
    elements.dateInput = document.getElementById("dateInput");
    elements.dateSelector = document.getElementById("dateSelector");
    elements.btnPrevDay = document.getElementById("btnPrevDay");
    elements.btnNextDay = document.getElementById("btnNextDay");
    elements.holidayBadge = document.getElementById("holidayBadge");

    // Add form
    elements.btnToggleAddForm = document.getElementById("btnToggleAddForm");
    elements.addOrderFormContainer = document.getElementById(
        "addOrderFormContainer"
    );
    elements.btnCloseAddForm = document.getElementById("btnCloseAddForm");
    elements.btnCancelAdd = document.getElementById("btnCancelAdd");
    elements.btnSubmitAdd = document.getElementById("btnSubmitAdd");
    elements.addSupplier = document.getElementById("addSupplier");
    elements.addAmount = document.getElementById("addAmount");
    elements.addDifference = document.getElementById("addDifference");
    elements.addNote = document.getElementById("addNote");
    elements.addPerformer = document.getElementById("addPerformer");
    elements.addIsReconciled = document.getElementById("addIsReconciled");
    elements.holidayFieldsAdd = document.getElementById("holidayFieldsAdd");

    // Table
    elements.tableContainer = document.getElementById("tableContainer");
    elements.orderTableBody = document.getElementById("orderTableBody");
    elements.emptyState = document.getElementById("emptyState");
    elements.footerSummary = document.getElementById("footerSummary");
    elements.totalAmount = document.getElementById("totalAmount");
    elements.totalDifference = document.getElementById("totalDifference");

    // Edit modal
    elements.editOrderModal = document.getElementById("editOrderModal");
    elements.editModalOverlay = document.getElementById("editModalOverlay");
    elements.btnCloseEditModal = document.getElementById("btnCloseEditModal");
    elements.btnCancelEdit = document.getElementById("btnCancelEdit");
    elements.btnSubmitEdit = document.getElementById("btnSubmitEdit");
    elements.editSupplier = document.getElementById("editSupplier");
    elements.editAmount = document.getElementById("editAmount");
    elements.editDifference = document.getElementById("editDifference");
    elements.editNote = document.getElementById("editNote");
    elements.editPerformer = document.getElementById("editPerformer");
    elements.editIsReconciled = document.getElementById("editIsReconciled");
    elements.holidayFieldsEdit = document.getElementById("holidayFieldsEdit");

    // Holiday modal
    elements.btnManageHolidays = document.getElementById("btnManageHolidays");
    elements.holidayModal = document.getElementById("holidayModal");
    elements.holidayModalOverlay = document.getElementById(
        "holidayModalOverlay"
    );
    elements.btnCloseHolidayModal = document.getElementById(
        "btnCloseHolidayModal"
    );
    elements.btnCancelHoliday = document.getElementById("btnCancelHoliday");
    elements.btnSaveHoliday = document.getElementById("btnSaveHoliday");
    elements.holidayDate = document.getElementById("holidayDate");
    elements.isHolidayCheck = document.getElementById("isHolidayCheck");

    // Calendar elements
    elements.calendarMonthYear = document.getElementById("calendarMonthYear");
    elements.calendarGrid = document.getElementById("calendarGrid");
    elements.btnPrevMonth = document.getElementById("btnPrevMonth");
    elements.btnNextMonth = document.getElementById("btnNextMonth");

    // Delete modal
    elements.deleteConfirmModal = document.getElementById("deleteConfirmModal");
    elements.deleteModalOverlay = document.getElementById("deleteModalOverlay");
    elements.btnCloseDeleteModal = document.getElementById(
        "btnCloseDeleteModal"
    );
    elements.btnCancelDelete = document.getElementById("btnCancelDelete");
    elements.btnConfirmDelete = document.getElementById("btnConfirmDelete");

    // Date Range modal
    elements.dateRangeModal = document.getElementById("dateRangeModal");
    elements.dateRangeModalOverlay = document.getElementById("dateRangeModalOverlay");
    elements.btnCloseDateRangeModal = document.getElementById("btnCloseDateRangeModal");
    elements.btnCancelDateRange = document.getElementById("btnCancelDateRange");
    elements.btnApplyDateRange = document.getElementById("btnApplyDateRange");
    elements.startDateInput = document.getElementById("startDateInput");
    elements.endDateInput = document.getElementById("endDateInput");

    // Filter elements
    elements.unpaidFilterCheckbox = document.getElementById("unpaidFilterCheckbox");
    elements.discrepancyFilterCheckbox = document.getElementById("discrepancyFilterCheckbox");

    // Toast
    elements.toastContainer = document.getElementById("toastContainer");

    // NCC Management elements
    elements.btnManageNCC = document.getElementById("btnManageNCC");
    elements.nccManageModal = document.getElementById("nccManageModal");
    elements.nccManageModalOverlay = document.getElementById("nccManageModalOverlay");
    elements.btnCloseNCCManageModal = document.getElementById("btnCloseNCCManageModal");
    elements.btnCancelNCCManage = document.getElementById("btnCancelNCCManage");
    elements.nccList = document.getElementById("nccList");
    elements.nccEmptyState = document.getElementById("nccEmptyState");
    elements.addSupplierSuggestions = document.getElementById("addSupplierSuggestions");
    elements.editSupplierSuggestions = document.getElementById("editSupplierSuggestions");

    // NCC Conflict modal elements
    elements.nccConflictModal = document.getElementById("nccConflictModal");
    elements.nccConflictModalOverlay = document.getElementById("nccConflictModalOverlay");
    elements.btnCloseNCCConflictModal = document.getElementById("btnCloseNCCConflictModal");
    elements.nccConflictNewName = document.getElementById("nccConflictNewName");
    elements.nccConflictExistingName = document.getElementById("nccConflictExistingName");
    elements.btnCancelNCCConflict = document.getElementById("btnCancelNCCConflict");
    elements.btnConfirmNCCConflict = document.getElementById("btnConfirmNCCConflict");
}

function setupEventListeners() {
    const elements = window.SoOrderElements;
    const utils = window.SoOrderUtils;
    const ui = window.SoOrderUI;

    console.log("Setting up event listeners...");

    // =====================================================
    // DATE NAVIGATION
    // =====================================================

    // Quick date buttons (7N, 15N, 30N)
    const btn7Days = document.getElementById("btn7Days");
    const btn15Days = document.getElementById("btn15Days");
    const btn30Days = document.getElementById("btn30Days");

    const handleQuickDateClick = async (days, clickedBtn) => {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (days - 1));
        const startDateStr = utils.formatDate(startDate);
        const endDateStr = utils.formatDate(today);

        // Remove active class from all buttons
        [btn7Days, btn15Days, btn30Days].forEach((btn) => {
            if (btn) btn.classList.remove("active");
        });

        // Add active class to clicked button
        if (clickedBtn) clickedBtn.classList.add("active");

        await window.SoOrderCRUD.loadDateRangeData(startDateStr, endDateStr);
    };

    if (btn7Days) {
        btn7Days.addEventListener("click", () => handleQuickDateClick(7, btn7Days));
    }
    if (btn15Days) {
        btn15Days.addEventListener("click", () => handleQuickDateClick(15, btn15Days));
    }
    if (btn30Days) {
        btn30Days.addEventListener("click", () => handleQuickDateClick(30, btn30Days));
    }

    // Previous day button
    if (elements.btnPrevDay) {
        elements.btnPrevDay.addEventListener("click", () => {
            utils.gotoPrevDay();
        });
    }

    // Next day button
    if (elements.btnNextDay) {
        elements.btnNextDay.addEventListener("click", () => {
            utils.gotoNextDay();
        });
    }

    // Date selector dropdown
    if (elements.dateSelector) {
        elements.dateSelector.addEventListener("change", async (e) => {
            const value = e.target.value;

            switch (value) {
                case "current":
                    // Stay on current date (do nothing, just reset selection)
                    break;
                case "today":
                    // Navigate to today (single day mode)
                    utils.navigateToDate(new Date());
                    break;
                case "3days": {
                    // Show last 3 days (including today)
                    const today = new Date();
                    const startDate = new Date(today);
                    startDate.setDate(startDate.getDate() - 2);
                    const startDateStr = utils.formatDate(startDate);
                    const endDateStr = utils.formatDate(today);
                    await window.SoOrderCRUD.loadDateRangeData(startDateStr, endDateStr);
                    break;
                }
                case "7days": {
                    // Show last 7 days (including today)
                    const today = new Date();
                    const startDate = new Date(today);
                    startDate.setDate(startDate.getDate() - 6);
                    const startDateStr = utils.formatDate(startDate);
                    const endDateStr = utils.formatDate(today);
                    await window.SoOrderCRUD.loadDateRangeData(startDateStr, endDateStr);
                    break;
                }
                case "10days": {
                    // Show last 10 days (including today)
                    const today = new Date();
                    const startDate = new Date(today);
                    startDate.setDate(startDate.getDate() - 9);
                    const startDateStr = utils.formatDate(startDate);
                    const endDateStr = utils.formatDate(today);
                    await window.SoOrderCRUD.loadDateRangeData(startDateStr, endDateStr);
                    break;
                }
                case "single":
                    // Show date picker for single day
                    if (elements.dateInput) {
                        elements.dateInput.showPicker();
                    }
                    // Reset to current selection after picker closes
                    e.target.value = "current";
                    break;
                case "custom":
                    // Show date range picker modal
                    ui.showDateRangeModal();
                    // Reset to current selection after modal closes
                    e.target.value = "current";
                    break;
            }
        });
    }

    // Date input change (for single day picker)
    if (elements.dateInput) {
        elements.dateInput.addEventListener("change", (e) => {
            const dateString = e.target.value;
            if (dateString) {
                const date = utils.parseDate(dateString);
                utils.navigateToDate(date);
            }
        });
    }

    // =====================================================
    // ADD FORM
    // =====================================================

    // Toggle add form button
    if (elements.btnToggleAddForm) {
        elements.btnToggleAddForm.addEventListener("click", () => {
            ui.showAddForm();
        });
    }

    // Close add form button
    if (elements.btnCloseAddForm) {
        elements.btnCloseAddForm.addEventListener("click", () => {
            ui.hideAddForm();
        });
    }

    // Cancel add button
    if (elements.btnCancelAdd) {
        elements.btnCancelAdd.addEventListener("click", () => {
            ui.hideAddForm();
        });
    }

    // Submit add button
    if (elements.btnSubmitAdd) {
        elements.btnSubmitAdd.addEventListener("click", () => {
            ui.handleAddOrder();
        });
    }

    // Enter key in add form
    [
        elements.addSupplier,
        elements.addAmount,
        elements.addDifference,
        elements.addNote,
    ].forEach((input) => {
        if (input) {
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    ui.handleAddOrder();
                }
            });
        }
    });

    // =====================================================
    // EDIT MODAL
    // =====================================================

    // Close edit modal button
    if (elements.btnCloseEditModal) {
        elements.btnCloseEditModal.addEventListener("click", () => {
            ui.hideEditModal();
        });
    }

    // Edit modal overlay click
    if (elements.editModalOverlay) {
        elements.editModalOverlay.addEventListener("click", () => {
            ui.hideEditModal();
        });
    }

    // Cancel edit button
    if (elements.btnCancelEdit) {
        elements.btnCancelEdit.addEventListener("click", () => {
            ui.hideEditModal();
        });
    }

    // Submit edit button
    if (elements.btnSubmitEdit) {
        elements.btnSubmitEdit.addEventListener("click", () => {
            ui.handleUpdateOrder();
        });
    }

    // Enter key in edit form
    [
        elements.editSupplier,
        elements.editAmount,
        elements.editDifference,
        elements.editNote,
    ].forEach((input) => {
        if (input) {
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    ui.handleUpdateOrder();
                }
            });
        }
    });

    // =====================================================
    // DELETE CONFIRM MODAL
    // =====================================================

    // Close delete modal button
    if (elements.btnCloseDeleteModal) {
        elements.btnCloseDeleteModal.addEventListener("click", () => {
            ui.hideDeleteConfirm();
        });
    }

    // Delete modal overlay click
    if (elements.deleteModalOverlay) {
        elements.deleteModalOverlay.addEventListener("click", () => {
            ui.hideDeleteConfirm();
        });
    }

    // Cancel delete button
    if (elements.btnCancelDelete) {
        elements.btnCancelDelete.addEventListener("click", () => {
            ui.hideDeleteConfirm();
        });
    }

    // Confirm delete button
    if (elements.btnConfirmDelete) {
        elements.btnConfirmDelete.addEventListener("click", () => {
            ui.handleDeleteOrder();
        });
    }

    // =====================================================
    // HOLIDAY MODAL
    // =====================================================

    // Manage holidays button
    if (elements.btnManageHolidays) {
        elements.btnManageHolidays.addEventListener("click", () => {
            ui.showHolidayModal();
        });
    }

    // Close holiday modal button
    if (elements.btnCloseHolidayModal) {
        elements.btnCloseHolidayModal.addEventListener("click", () => {
            ui.hideHolidayModal();
        });
    }

    // Holiday modal overlay click
    if (elements.holidayModalOverlay) {
        elements.holidayModalOverlay.addEventListener("click", () => {
            ui.hideHolidayModal();
        });
    }

    // Cancel holiday button (now "Đóng" button)
    if (elements.btnCancelHoliday) {
        elements.btnCancelHoliday.addEventListener("click", () => {
            ui.hideHolidayModal();
        });
    }

    // Save holiday button (legacy - may not exist anymore)
    if (elements.btnSaveHoliday) {
        elements.btnSaveHoliday.addEventListener("click", () => {
            ui.hideHolidayModal();
        });
    }

    // Calendar month navigation
    if (elements.btnPrevMonth) {
        elements.btnPrevMonth.addEventListener("click", () => {
            ui.navigateCalendarMonth(-1);
        });
    }

    if (elements.btnNextMonth) {
        elements.btnNextMonth.addEventListener("click", () => {
            ui.navigateCalendarMonth(1);
        });
    }

    // =====================================================
    // DATE RANGE MODAL
    // =====================================================

    // Close date range modal button
    if (elements.btnCloseDateRangeModal) {
        elements.btnCloseDateRangeModal.addEventListener("click", () => {
            ui.hideDateRangeModal();
        });
    }

    // Date range modal overlay click
    if (elements.dateRangeModalOverlay) {
        elements.dateRangeModalOverlay.addEventListener("click", () => {
            ui.hideDateRangeModal();
        });
    }

    // Cancel date range button
    if (elements.btnCancelDateRange) {
        elements.btnCancelDateRange.addEventListener("click", () => {
            ui.hideDateRangeModal();
        });
    }

    // Apply date range button
    if (elements.btnApplyDateRange) {
        elements.btnApplyDateRange.addEventListener("click", () => {
            ui.handleApplyDateRange();
        });
    }

    // =====================================================
    // UNPAID FILTER
    // =====================================================

    // Unpaid filter checkbox
    if (elements.unpaidFilterCheckbox) {
        elements.unpaidFilterCheckbox.addEventListener("change", (e) => {
            const state = window.SoOrderState;
            state.showOnlyUnpaid = e.target.checked;

            // Re-render the table with the filter applied
            ui.renderTable();
            ui.updateFooterSummary();
        });
    }

    // Discrepancy filter checkbox
    if (elements.discrepancyFilterCheckbox) {
        elements.discrepancyFilterCheckbox.addEventListener("change", (e) => {
            const state = window.SoOrderState;
            state.showOnlyWithDiscrepancy = e.target.checked;

            // Re-render the table with the filter applied
            ui.renderTable();
            ui.updateFooterSummary();
        });
    }

    // NCC filter input
    const nccFilterInput = document.getElementById("nccFilterInput");
    const btnClearNCCFilter = document.getElementById("btnClearNCCFilter");

    if (nccFilterInput) {
        nccFilterInput.addEventListener("input", (e) => {
            const state = window.SoOrderState;
            state.nccFilter = e.target.value.trim();

            // Show/hide clear button
            if (btnClearNCCFilter) {
                btnClearNCCFilter.style.display = state.nccFilter ? "flex" : "none";
            }

            // Add/remove has-value class
            if (state.nccFilter) {
                nccFilterInput.classList.add("has-value");
            } else {
                nccFilterInput.classList.remove("has-value");
            }

            // Re-render the table with the filter applied
            ui.renderTable();
            ui.updateFooterSummary();
        });
    }

    if (btnClearNCCFilter) {
        btnClearNCCFilter.addEventListener("click", () => {
            const state = window.SoOrderState;
            state.nccFilter = "";

            if (nccFilterInput) {
                nccFilterInput.value = "";
                nccFilterInput.classList.remove("has-value");
            }
            btnClearNCCFilter.style.display = "none";

            // Re-render the table
            ui.renderTable();
            ui.updateFooterSummary();

            // Reinitialize Lucide icons
            if (window.lucide) {
                lucide.createIcons();
            }
        });
    }

    // =====================================================
    // DIFFERENCE NOTE MODAL
    // =====================================================

    // Close difference note modal button
    const btnCloseDifferenceNoteModal = document.getElementById("btnCloseDifferenceNoteModal");
    if (btnCloseDifferenceNoteModal) {
        btnCloseDifferenceNoteModal.addEventListener("click", () => {
            ui.hideDifferenceNoteModal();
        });
    }

    // Difference note modal overlay click
    const differenceNoteModalOverlay = document.getElementById("differenceNoteModalOverlay");
    if (differenceNoteModalOverlay) {
        differenceNoteModalOverlay.addEventListener("click", () => {
            ui.hideDifferenceNoteModal();
        });
    }

    // Cancel difference note button
    const btnCancelDifferenceNote = document.getElementById("btnCancelDifferenceNote");
    if (btnCancelDifferenceNote) {
        btnCancelDifferenceNote.addEventListener("click", () => {
            ui.hideDifferenceNoteModal();
        });
    }

    // Save difference note button
    const btnSaveDifferenceNote = document.getElementById("btnSaveDifferenceNote");
    if (btnSaveDifferenceNote) {
        btnSaveDifferenceNote.addEventListener("click", () => {
            ui.handleSaveDifferenceNote();
        });
    }

    // Enter key in difference note textarea
    const differenceNoteInput = document.getElementById("differenceNoteInput");
    if (differenceNoteInput) {
        differenceNoteInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ui.handleSaveDifferenceNote();
            }
        });
    }

    // =====================================================
    // NCC MANAGEMENT
    // =====================================================

    // Manage NCC button
    if (elements.btnManageNCC) {
        elements.btnManageNCC.addEventListener("click", () => {
            ui.showNCCManageModal();
        });
    }

    // Close NCC manage modal button
    if (elements.btnCloseNCCManageModal) {
        elements.btnCloseNCCManageModal.addEventListener("click", () => {
            ui.hideNCCManageModal();
        });
    }

    // NCC manage modal overlay click
    if (elements.nccManageModalOverlay) {
        elements.nccManageModalOverlay.addEventListener("click", () => {
            ui.hideNCCManageModal();
        });
    }

    // Cancel NCC manage button
    if (elements.btnCancelNCCManage) {
        elements.btnCancelNCCManage.addEventListener("click", () => {
            ui.hideNCCManageModal();
        });
    }

    // Fetch from TPOS button
    const btnFetchFromTPOS = document.getElementById("btnFetchFromTPOS");
    if (btnFetchFromTPOS) {
        btnFetchFromTPOS.addEventListener("click", () => {
            ui.handleFetchFromTPOS();
        });
    }

    // Add NCC manual button
    const btnAddNCCManual = document.getElementById("btnAddNCCManual");
    if (btnAddNCCManual) {
        btnAddNCCManual.addEventListener("click", () => {
            ui.handleAddNCCManual();
        });
    }

    // Enter key in NCC manual input
    const nccManualInput = document.getElementById("nccManualInput");
    if (nccManualInput) {
        nccManualInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                ui.handleAddNCCManual();
            }
        });
    }

    // NCC Conflict modal
    if (elements.btnCloseNCCConflictModal) {
        elements.btnCloseNCCConflictModal.addEventListener("click", () => {
            ui.hideNCCConflictModal();
        });
    }

    if (elements.nccConflictModalOverlay) {
        elements.nccConflictModalOverlay.addEventListener("click", () => {
            ui.hideNCCConflictModal();
        });
    }

    if (elements.btnCancelNCCConflict) {
        elements.btnCancelNCCConflict.addEventListener("click", () => {
            ui.hideNCCConflictModal();
        });
    }

    if (elements.btnConfirmNCCConflict) {
        elements.btnConfirmNCCConflict.addEventListener("click", () => {
            ui.handleNCCConflictConfirm();
        });
    }

    // NCC Suggestions - Add form
    if (elements.addSupplier) {
        elements.addSupplier.addEventListener("input", () => {
            ui.showNCCSuggestions(elements.addSupplier, elements.addSupplierSuggestions);
        });
        elements.addSupplier.addEventListener("focus", () => {
            if (elements.addSupplier.value.trim()) {
                ui.showNCCSuggestions(elements.addSupplier, elements.addSupplierSuggestions);
            }
        });
        // Tab key to select exact match
        elements.addSupplier.addEventListener("keydown", (e) => {
            if (e.key === "Tab" && !e.shiftKey) {
                if (ui.selectExactMatchNCC(elements.addSupplier, elements.addSupplierSuggestions)) {
                    // Focus will naturally move to next input (addAmount)
                }
            }
        });
    }

    // NCC Suggestions - Edit form
    if (elements.editSupplier) {
        elements.editSupplier.addEventListener("input", () => {
            ui.showNCCSuggestions(elements.editSupplier, elements.editSupplierSuggestions);
        });
        elements.editSupplier.addEventListener("focus", () => {
            if (elements.editSupplier.value.trim()) {
                ui.showNCCSuggestions(elements.editSupplier, elements.editSupplierSuggestions);
            }
        });
        // Tab key to select exact match
        elements.editSupplier.addEventListener("keydown", (e) => {
            if (e.key === "Tab" && !e.shiftKey) {
                if (ui.selectExactMatchNCC(elements.editSupplier, elements.editSupplierSuggestions)) {
                    // Focus will naturally move to next input (editAmount)
                }
            }
        });
    }

    // Hide suggestions on click outside
    document.addEventListener("click", (e) => {
        const target = e.target;
        const isInsideSuggestion = target.closest(".ncc-suggestions") ||
            target.closest(".ncc-input-wrapper");
        if (!isInsideSuggestion) {
            ui.hideNCCSuggestions();
        }
    });

    console.log("Event listeners setup complete!");
}
