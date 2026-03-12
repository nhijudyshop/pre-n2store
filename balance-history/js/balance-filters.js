// =====================================================
// BALANCE HISTORY - FILTERS MODULE
// Filter system, date range, search, quick filters,
// verification filter chips
// =====================================================

// NOTE: This module depends on balance-core.js for:
// - filters, currentPage, currentQuickFilter, verificationStatusFilter (state)
// - formatDateDisplay, updateDateDisplayInputs, parseDateDisplay (helpers)
// - loadData, loadStatistics (data loading)
// - showNotification (notifications)

// Set Default Current Month
function setDefaultCurrentMonth() {
    const today = new Date();

    // Calculate 30 days ago (last30days)
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 29);

    // Format dates
    const startYear = startDate.getFullYear();
    const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
    const startDay = String(startDate.getDate()).padStart(2, '0');
    const firstDay = `${startYear}-${startMonth}-${startDay}`;

    const endYear = today.getFullYear();
    const endMonth = String(today.getMonth() + 1).padStart(2, '0');
    const endDay = String(today.getDate()).padStart(2, '0');
    const lastDay = `${endYear}-${endMonth}-${endDay}`;

    // Set input values
    document.getElementById('filterStartDate').value = firstDay;
    document.getElementById('filterEndDate').value = lastDay;
    updateDateDisplayInputs(firstDay, lastDay);

    // Update filters state
    filters.startDate = firstDay;
    filters.endDate = lastDay;
}

// Quick Filter Date Ranges
function getQuickFilterDates(filterType) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate, endDate;

    switch (filterType) {
        case 'today':
            startDate = new Date(today);
            endDate = new Date(today);
            break;

        case 'yesterday':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(startDate);
            break;

        case 'thisWeek':
            // Monday to Sunday (current week)
            startDate = new Date(today);
            const dayOfWeek = startDate.getDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            startDate.setDate(startDate.getDate() + diffToMonday);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            break;

        case 'lastWeek':
            // Previous Monday to Sunday
            startDate = new Date(today);
            const lastWeekDay = startDate.getDay();
            const diffToLastMonday = lastWeekDay === 0 ? -13 : -6 - lastWeekDay;
            startDate.setDate(startDate.getDate() + diffToLastMonday);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            break;

        case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;

        case 'lastMonth':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;

        case 'last7days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 6);
            endDate = new Date(today);
            break;

        case 'last30days':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 29);
            endDate = new Date(today);
            break;

        default:
            return null;
    }

    // Format dates as YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
}

// Apply Quick Filter
function applyQuickFilter(filterType) {
    const dates = getQuickFilterDates(filterType);

    if (dates) {
        // Update date inputs
        document.getElementById('filterStartDate').value = dates.startDate;
        document.getElementById('filterEndDate').value = dates.endDate;
        updateDateDisplayInputs(dates.startDate, dates.endDate);

        // Update filters state
        filters.startDate = dates.startDate;
        filters.endDate = dates.endDate;

        // Update active button
        document.querySelectorAll('.btn-quick-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filterType}"]`)?.classList.add('active');

        // Store current filter
        currentQuickFilter = filterType;

        // Reload data
        currentPage = 1;
        loadData();
        loadStatistics();
    }
}

// Apply Filters
function applyFilters() {
    filters.type = document.getElementById('filterType').value;
    filters.gateway = document.getElementById('filterGateway').value;
    filters.startDate = document.getElementById('filterStartDate').value;
    filters.endDate = document.getElementById('filterEndDate').value;
    filters.search = document.getElementById('filterSearch').value;
    filters.amount = parseAmountInput(document.getElementById('filterAmount').value);
}

// Parse amount input (supports formats like 100000, 100k, 1m, 1.5m)
function parseAmountInput(input) {
    if (!input) return '';

    // Normalize input - remove spaces, commas, dots used as thousand separators
    let normalized = input.trim().toLowerCase();

    // Handle k (thousand) and m (million) suffixes
    if (normalized.endsWith('k')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000));
    }
    if (normalized.endsWith('m')) {
        const num = parseFloat(normalized.slice(0, -1).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }
    if (normalized.endsWith('tr')) {
        const num = parseFloat(normalized.slice(0, -2).replace(/,/g, ''));
        return isNaN(num) ? '' : String(Math.round(num * 1000000));
    }

    // Remove all non-numeric characters except digits
    const numericOnly = normalized.replace(/[^\d]/g, '');
    return numericOnly || '';
}

// Reset Filters
function resetFilters() {
    document.getElementById('filterType').value = '';
    document.getElementById('filterGateway').value = '';
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterAmount').value = '';

    // Reset dates to last 30 days
    setDefaultCurrentMonth();

    // Reset quick filter to "last30days"
    document.querySelectorAll('.btn-quick-filter').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector('[data-filter="last30days"]')?.classList.add('active');
    currentQuickFilter = 'last30days';

    filters.type = '';
    filters.gateway = '';
    filters.search = '';
    filters.amount = '';
    // startDate and endDate are already set by setDefaultCurrentMonth()
}

// =====================================================
// VERIFICATION STATUS FILTER CHIPS
// =====================================================

/**
 * Load verification stats from API and update chip counts
 */
async function loadVerificationStats() {
    try {
        console.log('[VERIFICATION-STATS] Loading...');
        const response = await fetch(`${API_BASE_URL}/api/sepay/history/stats`);
        const result = await response.json();

        if (result.success && result.stats) {
            const stats = result.stats;
            console.log('[VERIFICATION-STATS] Loaded:', stats);

            // Update chip count elements
            const updateElement = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value || 0;
            };

            updateElement('stat-all', stats.total);
            updateElement('stat-auto', stats.auto_approved);
            updateElement('stat-approved', stats.manually_approved);
            updateElement('stat-pending', stats.pending_verification);
            updateElement('stat-rejected', stats.rejected);
            updateElement('stat-no-phone', stats.no_phone);
        }
    } catch (error) {
        console.error('[VERIFICATION-STATS] Error:', error);
    }
}

/**
 * Setup verification filter chip click handlers
 */
function setupVerificationFilterChips() {
    const chips = document.querySelectorAll('.filter-chip');

    if (chips.length === 0) {
        console.log('[VERIFICATION-CHIPS] No filter chips found');
        return;
    }

    console.log('[VERIFICATION-CHIPS] Setting up', chips.length, 'filter chips');

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            // Set filter and reload
            verificationStatusFilter = chip.dataset.status;
            console.log('[VERIFICATION-CHIPS] Filter set to:', verificationStatusFilter);

            // Reset to first page and reload
            currentPage = 1;
            loadData(true);
        });
    });
}

// Export for global access
window.loadVerificationStats = loadVerificationStats;
window.setupVerificationFilterChips = setupVerificationFilterChips;
