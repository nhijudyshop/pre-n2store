// =====================================================
// SỔ QUỸ - MAIN ENTRY POINT
// File: soquy-main.js
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // =====================================================
    // PERMISSION CHECK - Must be first
    // =====================================================
    if (typeof SoquyPermissions !== 'undefined') {
        if (!SoquyPermissions.init()) return;
    }

    const config = window.SoquyConfig;
    const state = window.SoquyState;
    const ui = window.SoquyUI;
    const db = window.SoquyDatabase;
    const els = window.SoquyElements;

    // =====================================================
    // THROTTLE CLICK UTILITY - Prevent double/rapid clicks
    // =====================================================
    const _clickTimestamps = {};
    let _clickId = 0;

    /**
     * Wraps a click handler to prevent rapid/double clicks.
     * Returns a function that ignores clicks within `delay` ms of the last accepted click.
     */
    function throttleClick(fn, delay = 350) {
        const id = ++_clickId;
        return function (...args) {
            const now = Date.now();
            if (now - (_clickTimestamps[id] || 0) < delay) return;
            _clickTimestamps[id] = now;
            return fn.apply(this, args);
        };
    }

    // =====================================================
    // INITIALIZE DOM REFERENCES
    // =====================================================

    function initElements() {
        // Time filter
        els.timeFilterSelect = document.getElementById('timeFilterSelect');
        els.timeFilterCustom = document.getElementById('timeFilterCustom');
        els.customStartDate = document.getElementById('customStartDate');
        els.customEndDate = document.getElementById('customEndDate');

        // Voucher type checkboxes
        els.receiptCheckbox = document.getElementById('filterReceipt');
        els.paymentCNCheckbox = document.getElementById('filterPaymentCN');
        els.paymentKDCheckbox = document.getElementById('filterPaymentKD');

        // Category filter
        els.categoryFilter = document.getElementById('filterCategory');

        // Status checkboxes
        els.statusPaidCheckbox = document.getElementById('filterStatusPaid');
        els.statusCancelledCheckbox = document.getElementById('filterStatusCancelled');

        // Creator/Employee
        els.creatorFilter = document.getElementById('filterCreator');
        els.employeeFilter = document.getElementById('filterEmployee');

        // Search
        els.searchInput = document.getElementById('searchInput');

        // Summary stats
        els.statOpeningBalance = document.getElementById('statOpeningBalance');
        els.statTotalReceipts = document.getElementById('statTotalReceipts');
        els.statTotalPaymentsCN = document.getElementById('statTotalPaymentsCN');
        els.statTotalPaymentsKD = document.getElementById('statTotalPaymentsKD');
        els.statClosingBalance = document.getElementById('statClosingBalance');

        // Table
        els.tableBody = document.getElementById('voucherTableBody');
        els.selectAllCheckbox = document.getElementById('selectAllCheckbox');

        // Pagination
        els.pageSizeSelect = document.getElementById('pageSizeSelect');
        els.btnFirstPage = document.getElementById('btnFirstPage');
        els.btnPrevPage = document.getElementById('btnPrevPage');
        els.btnNextPage = document.getElementById('btnNextPage');
        els.btnLastPage = document.getElementById('btnLastPage');
        els.currentPageSpan = document.getElementById('currentPage');
        els.pageInfoSpan = document.getElementById('pageInfo');

        // Action buttons
        els.btnCreateReceipt = document.getElementById('btnShowCreateReceipt');
        els.btnCreatePaymentCN = document.getElementById('btnShowCreatePaymentCN');
        els.btnCreatePaymentKD = document.getElementById('btnShowCreatePaymentKD');
        els.btnExportFile = document.getElementById('btnExportFile');

        // Receipt modal
        els.receiptModal = document.getElementById('soquyCreateReceiptModal');
        els.receiptDateTime = document.getElementById('receiptDateTime');
        els.receiptImageUpload = document.getElementById('receiptImageUpload');
        els.receiptImageFile = document.getElementById('receiptImageFile');
        els.receiptImagePlaceholder = document.getElementById('receiptImagePlaceholder');
        els.receiptImagePreview = document.getElementById('receiptImagePreview');
        els.receiptImagePreviewImg = document.getElementById('receiptImagePreviewImg');
        els.receiptImageRemoveBtn = document.getElementById('receiptImageRemoveBtn');
        els.receiptCategory = document.getElementById('receiptCategory');
        els.receiptCollector = document.getElementById('receiptCollector');
        els.receiptAmount = document.getElementById('receiptAmount');
        els.receiptNote = document.getElementById('receiptNote');
        els.btnSaveReceipt = document.getElementById('btnSaveReceipt');
        els.saveReceiptWrapper = document.getElementById('saveReceiptWrapper');
        els.btnCancelReceipt = document.getElementById('btnSoquyCancelReceipt');
        els.btnCloseReceipt = document.getElementById('btnSoquyCloseReceipt');
        els.receiptOverlay = document.getElementById('soquyCreateReceiptOverlay');

        // Payment modal
        els.paymentModal = document.getElementById('soquyCreatePaymentModal');
        els.paymentDateTime = document.getElementById('paymentDateTime');
        els.paymentImageUpload = document.getElementById('paymentImageUpload');
        els.paymentImageFile = document.getElementById('paymentImageFile');
        els.paymentImagePlaceholder = document.getElementById('paymentImagePlaceholder');
        els.paymentImagePreview = document.getElementById('paymentImagePreview');
        els.paymentImagePreviewImg = document.getElementById('paymentImagePreviewImg');
        els.paymentImageRemoveBtn = document.getElementById('paymentImageRemoveBtn');
        els.paymentCategory = document.getElementById('paymentCategory');
        els.paymentCollector = document.getElementById('paymentCollector');
        els.paymentAmount = document.getElementById('paymentAmount');
        els.paymentNote = document.getElementById('paymentNote');
        els.btnSavePayment = document.getElementById('btnSavePayment');
        els.savePaymentWrapper = document.getElementById('savePaymentWrapper');
        els.btnCancelPayment = document.getElementById('btnSoquyCancelPayment');
        els.btnClosePayment = document.getElementById('btnSoquyClosePayment');
        els.paymentOverlay = document.getElementById('soquyCreatePaymentOverlay');

        // Detail modal
        els.detailModal = document.getElementById('soquyDetailModal');
        els.detailOverlay = document.getElementById('soquyDetailOverlay');
        els.btnCloseDetail = document.getElementById('btnSoquyCloseDetail');

        // Cancel modal
        els.cancelModal = document.getElementById('soquyCancelModal');
        els.cancelOverlay = document.getElementById('soquyCancelOverlay');
        els.cancelReason = document.getElementById('cancelReason');
        els.btnConfirmCancel = document.getElementById('btnConfirmCancel');
        els.btnDismissCancel = document.getElementById('btnDismissCancel');
        els.btnCloseCancel = document.getElementById('btnSoquyCloseCancel');

        // Sidebar title
        els.sidebarTitle = document.getElementById('cashbookSidebarTitle');

        // Column toggle
        els.btnColumnToggle = document.getElementById('btnColumnToggle');

        // Import modal
        els.btnImportFile = document.getElementById('btnImportFile');
        els.importModal = document.getElementById('soquyImportModal');
        els.importOverlay = document.getElementById('soquyImportOverlay');
        els.importFileInput = document.getElementById('importFileInput');
        els.btnConfirmImport = document.getElementById('btnConfirmImport');
        els.btnCloseImport = document.getElementById('btnSoquyCloseImport');
        els.btnCancelImport = document.getElementById('btnCancelImport');
        els.btnDeleteAllVouchers = document.getElementById('btnDeleteAllVouchers');

        // Category management modal
        els.btnManageReceiptCategory = document.getElementById('btnManageReceiptCategory');
        els.btnManagePaymentCategory = document.getElementById('btnManagePaymentCategory');
        els.categoryModal = document.getElementById('soquyCategoryModal');
        els.categoryOverlay = document.getElementById('soquyCategoryOverlay');
        els.btnCloseCategory = document.getElementById('btnSoquyCloseCategory');
        els.btnSaveNewCategory = document.getElementById('btnSaveNewCategory');
        els.btnDeleteSelectedCategories = document.getElementById('btnDeleteSelectedCategories');
        els.selectAllCategories = document.getElementById('selectAllCategories');

        // Source management modal
        els.sourceModal = document.getElementById('soquySourceModal');
        els.sourceOverlay = document.getElementById('soquySourceOverlay');
        els.btnCloseSource = document.getElementById('btnSoquyCloseSource');
        els.btnSaveNewSource = document.getElementById('btnSaveNewSource');
        els.btnDeleteSelectedSources = document.getElementById('btnDeleteSelectedSources');
        els.selectAllSources = document.getElementById('selectAllSources');
        els.newSourceCode = document.getElementById('newSourceCode');
        els.newSourceName = document.getElementById('newSourceName');
    }

    // =====================================================
    // BIND EVENT LISTENERS
    // =====================================================

    function bindEvents() {
        // Time filter select
        if (els.timeFilterSelect) {
            els.timeFilterSelect.addEventListener('change', (e) => {
                ui.handleTimeFilterChange(e.target.value);
                ui.saveFilterState();
            });
        }

        // Custom date range
        if (els.timeFilterCustom) {
            els.timeFilterCustom.addEventListener('change', () => {
                if (els.timeFilterCustom.checked) {
                    state.timeFilter = config.TIME_FILTERS.CUSTOM;
                }
            });
        }
        if (els.customStartDate) {
            els.customStartDate.addEventListener('change', (e) => {
                state.customStartDate = e.target.value;
                if (state.timeFilter === config.TIME_FILTERS.CUSTOM) {
                    ui.refreshData();
                }
            });
        }
        if (els.customEndDate) {
            els.customEndDate.addEventListener('change', (e) => {
                state.customEndDate = e.target.value;
                if (state.timeFilter === config.TIME_FILTERS.CUSTOM) {
                    ui.refreshData();
                }
            });
        }

        // Voucher type checkboxes
        if (els.receiptCheckbox) {
            els.receiptCheckbox.addEventListener('change', () => ui.handleVoucherTypeFilterChange());
        }
        if (els.paymentCNCheckbox) {
            els.paymentCNCheckbox.addEventListener('change', () => ui.handleVoucherTypeFilterChange());
        }
        if (els.paymentKDCheckbox) {
            els.paymentKDCheckbox.addEventListener('change', () => ui.handleVoucherTypeFilterChange());
        }

        // Category filter
        if (els.categoryFilter) {
            let categoryDebounce;
            els.categoryFilter.addEventListener('input', (e) => {
                clearTimeout(categoryDebounce);
                categoryDebounce = setTimeout(() => {
                    ui.handleCategoryFilterChange(e.target.value);
                    ui.saveFilterState();
                }, 300);
            });
        }

        // Source filter
        const filterSource = document.getElementById('filterSource');
        if (filterSource) {
            let sourceDebounce;
            filterSource.addEventListener('input', (e) => {
                clearTimeout(sourceDebounce);
                sourceDebounce = setTimeout(() => {
                    ui.handleSourceFilterChange(e.target.value);
                    ui.saveFilterState();
                }, 300);
            });
        }

        // Status checkboxes
        if (els.statusPaidCheckbox) {
            els.statusPaidCheckbox.addEventListener('change', () => ui.handleStatusFilterChange());
        }
        if (els.statusCancelledCheckbox) {
            els.statusCancelledCheckbox.addEventListener('change', () => ui.handleStatusFilterChange());
        }

        // Creator filter
        if (els.creatorFilter) {
            let creatorDebounce;
            els.creatorFilter.addEventListener('input', (e) => {
                clearTimeout(creatorDebounce);
                creatorDebounce = setTimeout(() => {
                    ui.handleCreatorFilterChange(e.target.value);
                }, 300);
            });
        }

        // Employee filter
        if (els.employeeFilter) {
            let employeeDebounce;
            els.employeeFilter.addEventListener('input', (e) => {
                clearTimeout(employeeDebounce);
                employeeDebounce = setTimeout(() => {
                    ui.handleEmployeeFilterChange(e.target.value);
                }, 300);
            });
        }

        // Initialize searchable dropdowns for filters
        ui.initFilterSearchableDropdown('filterCategory', 'filterCategoryDropdown', 'category');
        ui.initFilterSearchableDropdown('filterSource', 'filterSourceDropdown', 'source');
        ui.initFilterSearchableDropdown('filterCreator', 'filterCreatorDropdown', 'creator');
        ui.initFilterSearchableDropdown('filterEmployee', 'filterEmployeeDropdown', 'employee');

        // Search input
        if (els.searchInput) {
            let searchDebounce;
            els.searchInput.addEventListener('input', (e) => {
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => {
                    ui.handleSearchChange(e.target.value);
                }, 300);
            });
        }

        // Action buttons (throttled to prevent double-click issues)
        if (els.btnCreateReceipt) {
            els.btnCreateReceipt.addEventListener('click', throttleClick(() => {
                if (!SoquyPermissions.checkAction('create_receipt')) return;
                state.editingVoucherId = null;
                ui.openReceiptModal();
            }));
        }
        if (els.btnCreatePaymentCN) {
            els.btnCreatePaymentCN.addEventListener('click', throttleClick(() => {
                if (!SoquyPermissions.checkAction('create_payment')) return;
                state.editingVoucherId = null;
                ui.openPaymentModal('cn');
            }));
        }
        if (els.btnCreatePaymentKD) {
            els.btnCreatePaymentKD.addEventListener('click', throttleClick(() => {
                if (!SoquyPermissions.checkAction('create_payment')) return;
                state.editingVoucherId = null;
                ui.openPaymentModal('kd');
            }));
        }
        if (els.btnExportFile) {
            els.btnExportFile.addEventListener('click', throttleClick(() => {
                const sd = document.getElementById('settingsDropdown');
                if (sd) sd.style.display = 'none';
                ui.handleExport();
            }));
        }

        // Category validation: toggle save button on category change
        if (els.receiptCategory) {
            els.receiptCategory.addEventListener('change', () => {
                ui.toggleSaveButton('receipt');
            });
        }
        if (els.paymentCategory) {
            els.paymentCategory.addEventListener('change', () => {
                ui.toggleSaveButton('payment');
            });
        }

        // Receipt modal events (throttled)
        if (els.btnCloseReceipt) {
            els.btnCloseReceipt.addEventListener('click', throttleClick(ui.closeReceiptModal));
        }
        if (els.btnCancelReceipt) {
            els.btnCancelReceipt.addEventListener('click', throttleClick(ui.closeReceiptModal));
        }
        // Removed: overlay click no longer closes receipt modal (prevents accidental dismissal)
        if (els.btnSaveReceipt) {
            els.btnSaveReceipt.addEventListener('click', throttleClick(() => {
                if (state.editingVoucherId) {
                    ui.saveEditedVoucher(config.VOUCHER_TYPES.RECEIPT);
                } else {
                    ui.saveReceipt();
                }
            }));
        }
        // Payment modal events (throttled)
        if (els.btnClosePayment) {
            els.btnClosePayment.addEventListener('click', throttleClick(ui.closePaymentModal));
        }
        if (els.btnCancelPayment) {
            els.btnCancelPayment.addEventListener('click', throttleClick(ui.closePaymentModal));
        }
        // Removed: overlay click no longer closes payment modal (prevents accidental dismissal)
        if (els.btnSavePayment) {
            els.btnSavePayment.addEventListener('click', throttleClick(() => {
                if (state.editingVoucherId) {
                    ui.saveEditedVoucher(config.VOUCHER_TYPES.PAYMENT);
                } else {
                    ui.savePayment();
                }
            }));
        }
        // Detail modal events (throttled)
        if (els.btnCloseDetail) {
            els.btnCloseDetail.addEventListener('click', throttleClick(ui.closeDetailModal));
        }
        if (els.detailOverlay) {
            els.detailOverlay.addEventListener('click', throttleClick(() => {
                if (!ui.isModalJustOpened()) ui.closeDetailModal();
            }));
        }

        // Cancel modal events (throttled)
        if (els.btnCloseCancel) {
            els.btnCloseCancel.addEventListener('click', throttleClick(ui.closeCancelModal));
        }
        if (els.cancelOverlay) {
            els.cancelOverlay.addEventListener('click', throttleClick(() => {
                if (!ui.isModalJustOpened()) ui.closeCancelModal();
            }));
        }
        if (els.btnDismissCancel) {
            els.btnDismissCancel.addEventListener('click', throttleClick(ui.closeCancelModal));
        }
        if (els.btnConfirmCancel) {
            els.btnConfirmCancel.addEventListener('click', throttleClick(ui.confirmCancelVoucher));
        }

        // Pagination events
        if (els.btnFirstPage) {
            els.btnFirstPage.addEventListener('click', () => ui.goToPage(1));
        }
        if (els.btnPrevPage) {
            els.btnPrevPage.addEventListener('click', () => ui.goToPage(state.currentPage - 1));
        }
        if (els.btnNextPage) {
            els.btnNextPage.addEventListener('click', () => ui.goToPage(state.currentPage + 1));
        }
        if (els.btnLastPage) {
            els.btnLastPage.addEventListener('click', () => ui.goToPage(state.totalPages));
        }
        if (els.pageSizeSelect) {
            els.pageSizeSelect.addEventListener('change', (e) => ui.handlePageSizeChange(e.target.value));
        }

        // Select all checkbox
        if (els.selectAllCheckbox) {
            els.selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.voucher-checkbox');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
            });
        }

        // Amount input formatting with live thousand separator
        [els.receiptAmount, els.paymentAmount].forEach(input => {
            if (input) {
                input.addEventListener('focus', () => {
                    // Keep formatted value on focus
                });
                input.addEventListener('blur', () => {
                    const val = ui.parseAmountInput(input.value);
                    input.value = val > 0 ? db.formatCurrency(val) : '0';
                });
                input.addEventListener('input', () => {
                    const cursorPos = input.selectionStart;
                    const oldLen = input.value.length;
                    const raw = input.value.replace(/[^0-9]/g, '');
                    const num = parseInt(raw) || 0;
                    input.value = num > 0 ? db.formatCurrency(num) : '';
                    const newLen = input.value.length;
                    const newPos = Math.max(0, cursorPos + (newLen - oldLen));
                    input.setSelectionRange(newPos, newPos);
                });
            }
        });

        // Column toggle button (throttled)
        if (els.btnColumnToggle) {
            els.btnColumnToggle.addEventListener('click', throttleClick((e) => {
                e.stopPropagation();
                ui.toggleColumnDropdown();
            }));
        }

        // Settings dropdown toggle (throttled)
        const btnSettingsToggle = document.getElementById('btnSettingsToggle');
        const settingsDropdown = document.getElementById('settingsDropdown');
        if (btnSettingsToggle && settingsDropdown) {
            btnSettingsToggle.addEventListener('click', throttleClick((e) => {
                e.stopPropagation();
                const isOpen = settingsDropdown.style.display !== 'none';
                settingsDropdown.style.display = isOpen ? 'none' : 'block';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }));
            document.addEventListener('click', (e) => {
                if (!settingsDropdown.contains(e.target) && e.target !== btnSettingsToggle) {
                    settingsDropdown.style.display = 'none';
                }
            });
        }
        const btnSettingsDeleteAll = document.getElementById('btnSettingsDeleteAll');
        if (btnSettingsDeleteAll) {
            btnSettingsDeleteAll.addEventListener('click', throttleClick(() => {
                if (settingsDropdown) settingsDropdown.style.display = 'none';
                ui.deleteAllVouchers();
            }));
        }

        // Import button & modal events (throttled)
        if (els.btnImportFile) {
            els.btnImportFile.addEventListener('click', throttleClick(() => {
                const sd = document.getElementById('settingsDropdown');
                if (sd) sd.style.display = 'none';
                ui.openImportModal();
            }));
        }
        if (els.btnCloseImport) {
            els.btnCloseImport.addEventListener('click', throttleClick(() => ui.closeImportModal()));
        }
        if (els.btnCancelImport) {
            els.btnCancelImport.addEventListener('click', throttleClick(() => ui.closeImportModal()));
        }
        if (els.importOverlay) {
            els.importOverlay.addEventListener('click', throttleClick(() => {
                if (!ui.isModalJustOpened()) ui.closeImportModal();
            }));
        }
        if (els.importFileInput) {
            els.importFileInput.addEventListener('change', (e) => ui.handleImportFileChange(e));
        }
        if (els.btnConfirmImport) {
            els.btnConfirmImport.addEventListener('click', throttleClick(() => ui.confirmImport()));
        }
        if (els.btnDeleteAllVouchers) {
            els.btnDeleteAllVouchers.addEventListener('click', throttleClick(() => ui.deleteAllVouchers()));
        }

        // Category management modal events (throttled)
        if (els.btnManageReceiptCategory) {
            els.btnManageReceiptCategory.addEventListener('click', throttleClick(() => {
                if (!SoquyPermissions.checkAction('manage_categories')) return;
                ui.openCategoryModal('receipt');
            }));
        }
        if (els.btnManagePaymentCategory) {
            els.btnManagePaymentCategory.addEventListener('click', throttleClick(() => {
                if (!SoquyPermissions.checkAction('manage_categories')) return;
                const catType = state.paymentSubType === 'kd' ? 'payment_kd' : 'payment_cn';
                ui.openCategoryModal(catType);
            }));
        }
        if (els.btnCloseCategory) {
            els.btnCloseCategory.addEventListener('click', throttleClick(() => ui.closeCategoryModal()));
        }
        if (els.categoryOverlay) {
            els.categoryOverlay.addEventListener('click', throttleClick(() => {
                if (!ui.isModalJustOpened()) ui.closeCategoryModal();
            }));
        }
        if (els.btnSaveNewCategory) {
            els.btnSaveNewCategory.addEventListener('click', throttleClick(() => ui.saveNewCategory()));
        }
        if (els.btnDeleteSelectedCategories) {
            els.btnDeleteSelectedCategories.addEventListener('click', throttleClick(() => ui.deleteSelectedCategories()));
        }
        if (els.selectAllCategories) {
            els.selectAllCategories.addEventListener('change', (e) => ui.handleSelectAllCategories(e.target.checked));
        }
        // Category tab toggle buttons
        document.querySelectorAll('.category-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                ui.handleCategoryTabSwitch(btn.dataset.catTab);
            });
        });

        // Category type change → toggle source row
        const newCategoryType = document.getElementById('newCategoryType');
        if (newCategoryType) {
            newCategoryType.addEventListener('change', (e) => {
                ui.toggleCategorySourceRow(e.target.value);
            });
        }

        // Inline source creation in category modal (throttled)
        const btnCreateSourceInline = document.getElementById('btnCreateSourceInline');
        if (btnCreateSourceInline) {
            btnCreateSourceInline.addEventListener('click', throttleClick(() => {
                if (!SoquyPermissions.checkAction('manage_sources')) return;
                ui.toggleInlineSourceCreate();
            }));
        }
        const btnSaveInlineSource = document.getElementById('btnSaveInlineSource');
        if (btnSaveInlineSource) {
            btnSaveInlineSource.addEventListener('click', throttleClick(() => ui.saveInlineSource()));
        }

        // Source management modal events (throttled)
        if (els.btnCloseSource) {
            els.btnCloseSource.addEventListener('click', throttleClick(() => ui.closeSourceModal()));
        }
        if (els.sourceOverlay) {
            els.sourceOverlay.addEventListener('click', throttleClick(() => {
                if (!ui.isModalJustOpened()) ui.closeSourceModal();
            }));
        }
        if (els.btnSaveNewSource) {
            els.btnSaveNewSource.addEventListener('click', throttleClick(() => ui.saveNewSource()));
        }
        if (els.btnDeleteSelectedSources) {
            els.btnDeleteSelectedSources.addEventListener('click', throttleClick(() => ui.deleteSelectedSources()));
        }
        if (els.selectAllSources) {
            els.selectAllSources.addEventListener('change', (e) => ui.handleSelectAllSources(e.target.checked));
        }
        if (els.newSourceCode) {
            els.newSourceCode.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    ui.saveNewSource();
                }
            });
        }
        if (els.newSourceName) {
            els.newSourceName.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    ui.saveNewSource();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ui.closeReceiptModal();
                ui.closePaymentModal();
                ui.closeDetailModal();
                ui.closeCancelModal();
                ui.closeImportModal();
                ui.closeCategoryModal();
                ui.closeSourceModal();
            }
        });

        // =====================================================
        // TAB NAVIGATION
        // =====================================================
        let reportInitialized = false;
        let editHistoryLoaded = false;

        function switchToTab(tabName) {
            // Update button active states
            document.querySelectorAll('.tab-header-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.tab === tabName);
            });

            // Update content visibility
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `${tabName}TabContent`);
            });

            // Re-initialize Lucide icons for new tab content
            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Save to URL hash for refresh persistence
            location.hash = tabName;

            // Load report data when switching to report tab
            if (tabName === 'report' && !reportInitialized) {
                reportInitialized = true;
                const report = window.SoquyReport;
                if (report) {
                    report.loadReportFilterState();
                    const rs = report.reportState;
                    document.querySelectorAll('input[name="reportType"]').forEach(r => {
                        r.checked = r.value === rs.reportType;
                    });
                    document.querySelectorAll('input[name="reportFundType"]').forEach(r => {
                        r.checked = r.value === rs.fundType;
                    });
                    const rts = document.getElementById('reportTimeFilterSelect');
                    if (rts && rs.timeFilter !== 'custom') rts.value = rs.timeFilter;
                    report.refreshReport();
                }
            }

            // Load edit history data when switching to editHistory tab
            if (tabName === 'editHistory' && !editHistoryLoaded) {
                editHistoryLoaded = true;
                const editHistory = window.SoquyEditHistory;
                if (editHistory) {
                    editHistory.initTab();
                    editHistory.loadHistory();
                }
            }
        }

        document.querySelectorAll('.tab-header-btn').forEach(btn => {
            btn.addEventListener('click', () => switchToTab(btn.dataset.tab));
        });

        // Restore tab from URL hash on page load
        const hashTab = location.hash.replace('#', '');
        if (hashTab && document.querySelector(`.tab-header-btn[data-tab="${hashTab}"]`)) {
            switchToTab(hashTab);
        }

        // =====================================================
        // REPORT TAB EVENT BINDINGS
        // =====================================================
        bindReportEvents();

        // =====================================================
        // FILTER SECTION COLLAPSE/EXPAND
        // =====================================================
        document.querySelectorAll('.filter-section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking inside an input/select within the header
                if (e.target.closest('input, select')) return;

                const section = header.closest('.filter-section');
                if (section) {
                    section.classList.toggle('collapsed');
                }
            });
        });

        // =====================================================
        // MOBILE: Filter Drawer Toggle
        // =====================================================
        const mobileFilterOverlay = document.getElementById('mobileFilterOverlay');
        const mobileFilterCloseBtn = document.getElementById('mobileFilterCloseBtn');
        const cashbookSidebar = document.querySelector('.cashbook-sidebar');

        function openMobileFilter() {
            if (cashbookSidebar) cashbookSidebar.classList.add('mobile-open');
            if (mobileFilterOverlay) mobileFilterOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeMobileFilter() {
            if (cashbookSidebar) cashbookSidebar.classList.remove('mobile-open');
            if (mobileFilterOverlay) mobileFilterOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        const btnMobileFilter = document.getElementById('btnMobileFilter');
        if (btnMobileFilter) btnMobileFilter.addEventListener('click', throttleClick(openMobileFilter));
        if (mobileFilterCloseBtn) mobileFilterCloseBtn.addEventListener('click', throttleClick(closeMobileFilter));
        if (mobileFilterOverlay) mobileFilterOverlay.addEventListener('click', throttleClick(closeMobileFilter));

        // =====================================================
        // MOBILE: FAB (Floating Action Button)
        // =====================================================
        const mobileFabBtn = document.getElementById('mobileFabBtn');
        const mobileFabContainer = document.getElementById('mobileFabContainer');

        if (mobileFabBtn && mobileFabContainer) {
            mobileFabBtn.addEventListener('click', throttleClick((e) => {
                e.stopPropagation();
                mobileFabContainer.classList.toggle('open');
            }));

            document.addEventListener('click', (e) => {
                if (!mobileFabContainer.contains(e.target)) {
                    mobileFabContainer.classList.remove('open');
                }
            });

            const fabCreatePaymentCN = document.getElementById('fabCreatePaymentCN');
            const fabCreatePaymentKD = document.getElementById('fabCreatePaymentKD');
            const fabCreateReceipt = document.getElementById('fabCreateReceipt');

            if (fabCreatePaymentCN) {
                fabCreatePaymentCN.addEventListener('click', throttleClick(() => {
                    mobileFabContainer.classList.remove('open');
                    if (!SoquyPermissions.checkAction('create_payment')) return;
                    state.editingVoucherId = null;
                    ui.openPaymentModal('cn');
                }));
            }
            if (fabCreatePaymentKD) {
                fabCreatePaymentKD.addEventListener('click', throttleClick(() => {
                    mobileFabContainer.classList.remove('open');
                    if (!SoquyPermissions.checkAction('create_payment')) return;
                    state.editingVoucherId = null;
                    ui.openPaymentModal('kd');
                }));
            }
            if (fabCreateReceipt) {
                fabCreateReceipt.addEventListener('click', throttleClick(() => {
                    mobileFabContainer.classList.remove('open');
                    if (!SoquyPermissions.checkAction('create_receipt')) return;
                    state.editingVoucherId = null;
                    ui.openReceiptModal();
                }));
            }

            const fabOpenAI = document.getElementById('fabOpenAI');
            if (fabOpenAI) {
                fabOpenAI.addEventListener('click', throttleClick(() => {
                    mobileFabContainer.classList.remove('open');
                    if (window.AIChatWidget && window.AIChatWidget.toggle) {
                        window.AIChatWidget.toggle();
                    }
                }));
            }
        }
    }

    // =====================================================
    // REPORT TAB EVENTS
    // =====================================================

    function bindReportEvents() {
        const report = window.SoquyReport;
        if (!report) return;

        const rs = report.reportState;

        // Report type radios
        document.querySelectorAll('input[name="reportType"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    rs.reportType = radio.value;
                    report.refreshReport();
                }
            });
        });

        // Report fund type radios
        document.querySelectorAll('input[name="reportFundType"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    rs.fundType = radio.value;
                    report.refreshReport();
                }
            });
        });

        // Report time filter select
        const reportTimeSelect = document.getElementById('reportTimeFilterSelect');
        if (reportTimeSelect) {
            reportTimeSelect.addEventListener('change', (e) => {
                rs.timeFilter = e.target.value;
                report.refreshReport();
            });
        }

        // Report custom date range
        const reportTimeCustom = document.getElementById('reportTimeFilterCustom');
        if (reportTimeCustom) {
            reportTimeCustom.addEventListener('change', () => {
                if (reportTimeCustom.checked) {
                    rs.timeFilter = 'custom';
                }
            });
        }
        const reportStartDate = document.getElementById('reportCustomStartDate');
        if (reportStartDate) {
            reportStartDate.addEventListener('change', (e) => {
                rs.customStartDate = e.target.value;
                if (rs.timeFilter === 'custom') {
                    report.refreshReport();
                }
            });
        }
        const reportEndDate = document.getElementById('reportCustomEndDate');
        if (reportEndDate) {
            reportEndDate.addEventListener('change', (e) => {
                rs.customEndDate = e.target.value;
                if (rs.timeFilter === 'custom') {
                    report.refreshReport();
                }
            });
        }

        // Report category filter
        const reportCatFilter = document.getElementById('reportFilterCategory');
        if (reportCatFilter) {
            let reportCatDebounce;
            reportCatFilter.addEventListener('input', (e) => {
                clearTimeout(reportCatDebounce);
                reportCatDebounce = setTimeout(() => {
                    rs.categoryFilter = e.target.value;
                    report.refilterReport();
                }, 300);
            });
        }

        // Report source filter
        const reportSrcFilter = document.getElementById('reportFilterSource');
        if (reportSrcFilter) {
            let reportSrcDebounce;
            reportSrcFilter.addEventListener('input', (e) => {
                clearTimeout(reportSrcDebounce);
                reportSrcDebounce = setTimeout(() => {
                    rs.sourceFilter = e.target.value;
                    report.refilterReport();
                }, 300);
            });
        }

        // Report creator filter
        const reportCreatorFilter = document.getElementById('reportFilterCreator');
        if (reportCreatorFilter) {
            let reportCreatorDebounce;
            reportCreatorFilter.addEventListener('input', (e) => {
                clearTimeout(reportCreatorDebounce);
                reportCreatorDebounce = setTimeout(() => {
                    rs.creatorFilter = e.target.value;
                    report.refilterReport();
                }, 300);
            });
        }

        // Initialize searchable dropdowns for report filters
        report.initReportFilterDropdown('reportFilterCategory', 'reportFilterCategoryDropdown', 'category');
        report.initReportFilterDropdown('reportFilterSource', 'reportFilterSourceDropdown', 'source');
        report.initReportFilterDropdown('reportFilterCreator', 'reportFilterCreatorDropdown', 'creator');

        // Top transactions tabs (Nhóm 9)
        document.querySelectorAll('#reportTopTabs .report-mini-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#reportTopTabs .report-mini-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                rs.topTab = tab.dataset.topTab;
                report.renderTopOnly();
            });
        });

        // Toggle trend section and category full-width
        const toggleTrendBtn = document.getElementById('toggleTrendBtn');
        if (toggleTrendBtn) {
            // Set initial state: category full-width since trend is hidden
            const catSection = document.querySelector('.report-section--category');
            if (catSection) catSection.style.gridColumn = '1 / -1';

            toggleTrendBtn.addEventListener('click', throttleClick(function() {
                const section = document.getElementById('trendSection');
                const catSec = document.querySelector('.report-section--category');
                if (!section) return;
                const isHidden = section.style.display === 'none';
                section.style.display = isHidden ? '' : 'none';
                this.classList.toggle('active', isHidden);
                if (catSec) {
                    catSec.style.gridColumn = isHidden ? '' : '1 / -1';
                }
            }));
        }

        // Export report button
        const btnExportReport = document.getElementById('btnExportReport');
        if (btnExportReport) {
            btnExportReport.addEventListener('click', throttleClick(() => report.exportReport()));
        }
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    async function init() {
        console.log('[SoquyMain] Initializing...');

        // Initialize DOM references
        initElements();

        // Initialize image upload handlers (after DOM elements are bound)
        ui.initImageHandlers();

        // Render Lucide icons for image upload placeholders (image-plus, x)
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Load column visibility from localStorage
        ui.loadColumnVisibility();

        // Load filter state from localStorage (Nhóm 7)
        ui.loadFilterState();

        // Load dynamic categories/creators/sources and users from Firestore
        await Promise.all([db.loadDynamicMeta(), db.fetchAllUsers()]);

        // Populate dropdowns (including dynamic categories and user selects)
        ui.populateCategoryDropdowns();
        ui.populateCollectorDropdowns();

        // Render dynamic table header based on column visibility
        ui.renderTableHeader();

        // Bind events
        bindEvents();

        // Restore filter UI from saved state (Nhóm 7)
        ui.restoreFilterUI();

        // Update sidebar title
        ui.updateSidebarTitle();

        // Load initial data
        await ui.refreshData();

        console.log('[SoquyMain] Initialization complete');
    }

    // Wait for Lucide icons to load, then initialize
    if (typeof lucide !== 'undefined') {
        init();
    } else {
        // Wait for lucide to be available
        const checkLucide = setInterval(() => {
            if (typeof lucide !== 'undefined') {
                clearInterval(checkLucide);
                init();
            }
        }, 100);
        // Fallback: init after 2 seconds regardless
        setTimeout(() => {
            clearInterval(checkLucide);
            if (!state.isLoading) init();
        }, 2000);
    }
});
