// =====================================================
// BALANCE HISTORY - MAIN AGGREGATOR
// This file initializes the balance history module.
// Sub-modules are loaded via script tags in index.html
// in this order:
//   1. balance-core.js       - State, config, helpers, data loading, cache, SSE, raw data
//   2. balance-filters.js    - Filters, date range, search, quick filters, verification chips
//   3. balance-table.js      - Table rendering, row building, gap detection, hide/show
//   4. balance-verification.js - Pending match, QR code, customer edit, phone data, name selector
//   5. main.js (this file)   - Initialization, event listeners, DOMContentLoaded
// =====================================================

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Set default date first (synchronous, fast)
    setDefaultCurrentMonth();
    setupEventListeners();
    setupVerificationFilterChips();

    // Check which tab is saved - only load Balance History data if it's the active tab
    const savedTab = localStorage.getItem('bh_main_tab') || 'balance-history';

    // Initialize CustomerInfoManager in background (non-blocking)
    if (window.CustomerInfoManager) {
        window.CustomerInfoManager.init();
    }

    // Only load Balance History data if that tab is active
    if (savedTab === 'balance-history') {
        const loadPromises = [
            loadData(),
            loadStatistics(),
            loadVerificationStats()
        ];
        await Promise.all(loadPromises);
    } else {
        // Still load statistics for badge counts, but don't load main table data
        loadVerificationStats();
    }
});

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    // Quick Filter Buttons
    document.querySelectorAll('.btn-quick-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.getAttribute('data-filter');
            applyQuickFilter(filterType);
        });
    });

    refreshBtn.addEventListener('click', () => {
        currentPage = 1;
        clearAllBHCache(); // Clear cache on manual refresh
        loadData(true);  // Force refresh from API
        loadStatistics();
    });

    // View phone data button
    const viewPhoneDataBtn = document.getElementById('viewPhoneDataBtn');
    if (viewPhoneDataBtn) {
        viewPhoneDataBtn.addEventListener('click', () => {
            phoneDataCurrentPage = 1; // Reset to first page
            showPhoneDataModal(1);
        });
    }

    // Reprocess old transactions button
    const reprocessOldTransactionsBtn = document.getElementById('reprocessOldTransactionsBtn');
    if (reprocessOldTransactionsBtn) {
        console.log('[INIT] Reprocess button found and event listener attached');
        reprocessOldTransactionsBtn.addEventListener('click', async () => {
            console.log('[REPROCESS] Button clicked!');
            await reprocessOldTransactions();
        });
    } else {
        console.error('[INIT] Reprocess button NOT FOUND in DOM');
    }

    // Close phone data modal button
    const closePhoneDataModalBtn = document.getElementById('closePhoneDataModalBtn');
    if (closePhoneDataModalBtn) {
        closePhoneDataModalBtn.addEventListener('click', () => {
            closePhoneDataModal();
        });
    }

    // Refresh phone data button
    const refreshPhoneDataBtn = document.getElementById('refreshPhoneDataBtn');
    if (refreshPhoneDataBtn) {
        refreshPhoneDataBtn.addEventListener('click', () => {
            phoneDataCurrentPage = 1; // Reset to first page
            showPhoneDataModal(1); // Reload data from first page
        });
    }

    // Phone data pagination buttons
    const phoneDataPrevBtn = document.getElementById('phoneDataPrevBtn');
    if (phoneDataPrevBtn) {
        phoneDataPrevBtn.addEventListener('click', () => {
            if (phoneDataCurrentPage > 1) {
                showPhoneDataModal(phoneDataCurrentPage - 1);
            }
        });
    }

    const phoneDataNextBtn = document.getElementById('phoneDataNextBtn');
    if (phoneDataNextBtn) {
        phoneDataNextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(phoneDataTotalRecords / phoneDataPageSize);
            if (phoneDataCurrentPage < totalPages) {
                showPhoneDataModal(phoneDataCurrentPage + 1);
            }
        });
    }

    // Fetch names from TPOS button
    const fetchNamesBtn = document.getElementById('fetchNamesBtn');
    if (fetchNamesBtn) {
        fetchNamesBtn.addEventListener('click', async () => {
            await fetchCustomerNamesFromTPOS();
        });
    }

    // Real-time search with debounce
    const filterSearchInput = document.getElementById('filterSearch');
    if (filterSearchInput) {
        let searchTimeout;
        filterSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentPage = 1;
                applyFilters();
                loadData();
                console.log('[SEARCH] Searching for:', e.target.value);
            }, 500); // Wait 500ms after user stops typing
        });
    }

    applyFiltersBtn.addEventListener('click', () => {
        currentPage = 1;
        applyFilters();
        loadData();
        loadStatistics();

        // Clear quick filter active state when manually applying filters
        document.querySelectorAll('.btn-quick-filter').forEach(btn => {
            btn.classList.remove('active');
        });
    });

    resetFiltersBtn.addEventListener('click', () => {
        resetFilters();
        currentPage = 1;
        loadData();
        loadStatistics();
    });

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadData();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadData();
        }
    });

    closeModalBtn.addEventListener('click', () => {
        detailModal.classList.remove('active');
    });

    // Click outside modal to close
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            detailModal.classList.remove('active');
        }
    });

    // Enter key to apply filters
    document.querySelectorAll('.filter-input, .filter-select').forEach(element => {
        element.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                applyFiltersBtn.click();
            }
        });
    });

    // Date input change - clear quick filter active state and update display
    document.getElementById('filterStartDate').addEventListener('change', (e) => {
        document.querySelectorAll('.btn-quick-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        const startDisplay = document.getElementById('filterStartDateDisplay');
        if (startDisplay) startDisplay.value = formatDateDisplay(e.target.value);
    });

    document.getElementById('filterEndDate').addEventListener('change', (e) => {
        document.querySelectorAll('.btn-quick-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        const endDisplay = document.getElementById('filterEndDateDisplay');
        if (endDisplay) endDisplay.value = formatDateDisplay(e.target.value);
    });

    // Display date inputs - manual text entry (only validate on blur, no auto-format)
    const startDateDisplay = document.getElementById('filterStartDateDisplay');
    const endDateDisplay = document.getElementById('filterEndDateDisplay');

    if (startDateDisplay) {
        startDateDisplay.addEventListener('blur', () => {
            const parsed = parseDateDisplay(startDateDisplay.value);
            if (parsed) {
                startDateDisplay.value = formatDateDisplay(parsed);
                document.getElementById('filterStartDate').value = parsed;
                document.querySelectorAll('.btn-quick-filter').forEach(btn => {
                    btn.classList.remove('active');
                });
            }
        });
    }

    if (endDateDisplay) {
        endDateDisplay.addEventListener('blur', () => {
            const parsed = parseDateDisplay(endDateDisplay.value);
            if (parsed) {
                endDateDisplay.value = formatDateDisplay(parsed);
                document.getElementById('filterEndDate').value = parsed;
                document.querySelectorAll('.btn-quick-filter').forEach(btn => {
                    btn.classList.remove('active');
                });
            }
        });
    }
}

// =====================================================
// AUTO-CONNECT SSE ON PAGE LOAD
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Delay connection slightly to let page load first
    setTimeout(() => {
        connectRealtimeUpdates();
    }, 1000);

    // DISABLED: Gap detection was causing severe performance issues (60-90s response times)
    // Uncomment only if you need manual gap detection
    // setTimeout(() => {
    //     loadGapData();
    // }, 2000);
});
