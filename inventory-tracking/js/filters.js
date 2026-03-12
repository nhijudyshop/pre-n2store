// =====================================================
// FILTERS - INVENTORY TRACKING
// Filter shipments and bookings by date range, NCC, etc.
// Note: Uses flattened shipments/orderBookings from nccList
// =====================================================

// Store current date for navigation
let trackingCurrentDate = new Date();

/**
 * Initialize filters
 */
function initFilters() {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const nccSelect = document.getElementById('filterNCC');
    const productInput = document.getElementById('filterProduct');
    const btnClear = document.getElementById('btnClearFilters');

    // Quick date buttons
    const btn7Days = document.getElementById('btn7Days');
    const btn15Days = document.getElementById('btn15Days');
    const btn30Days = document.getElementById('btn30Days');

    // Date selector dropdown
    const dateSelector = document.getElementById('trackingDateSelector');
    const dateInput = document.getElementById('filterTrackingDateInput');
    const btnPrev = document.getElementById('btnTrackingPrevDay');
    const btnNext = document.getElementById('btnTrackingNextDay');

    // Set default date range (last 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (dateFromInput) dateFromInput.value = sevenDaysAgo.toISOString().split('T')[0];
    if (dateToInput) dateToInput.value = now.toISOString().split('T')[0];

    // Update date selector display
    updateTrackingDateSelectorDisplay();

    // Event listeners for quick date buttons
    btn7Days?.addEventListener('click', () => setQuickDateRange(7, btn7Days));
    btn15Days?.addEventListener('click', () => setQuickDateRange(15, btn15Days));
    btn30Days?.addEventListener('click', () => setQuickDateRange(30, btn30Days));

    // Date selector dropdown change
    dateSelector?.addEventListener('change', handleTrackingDateSelectorChange);

    // Hidden date input change (for single day selection)
    dateInput?.addEventListener('change', () => {
        if (dateInput.value) {
            trackingCurrentDate = new Date(dateInput.value + 'T00:00:00');
            setTrackingSingleDay(trackingCurrentDate);
        }
    });

    // Navigation buttons
    btnPrev?.addEventListener('click', () => navigateTrackingDate(-1));
    btnNext?.addEventListener('click', () => navigateTrackingDate(1));

    // Event listeners for real-time filtering
    nccSelect?.addEventListener('change', applyFilters);

    // Product search with debounce
    let searchTimeout;
    productInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            globalState.searchQuery = productInput.value.trim();
            applyFiltersAndRender();
        }, 300);
    });

    // Clear button
    btnClear?.addEventListener('click', clearFilters);

    // Initialize with 7N active
    btn7Days?.classList.add('active');

    // Apply initial filters
    applyFilters();
}

/**
 * Handle tracking date selector change
 */
function handleTrackingDateSelectorChange() {
    const dateSelector = document.getElementById('trackingDateSelector');
    const dateInput = document.getElementById('filterTrackingDateInput');
    const value = dateSelector?.value;

    clearQuickDateButtonActive();

    switch (value) {
        case 'today':
            trackingCurrentDate = new Date();
            setTrackingSingleDay(trackingCurrentDate);
            break;
        case '3days':
            setQuickDateRange(3, null);
            break;
        case '7days':
            setQuickDateRange(7, document.getElementById('btn7Days'));
            break;
        case '10days':
            setQuickDateRange(10, null);
            break;
        case 'single':
            // Open date picker for single day
            if (dateInput) {
                dateInput.style.pointerEvents = 'auto';
                dateInput.showPicker?.() || dateInput.click();
                dateInput.style.pointerEvents = 'none';
            }
            // Reset to current option after selection
            setTimeout(() => {
                if (dateSelector) dateSelector.value = 'current';
            }, 100);
            break;
        case 'custom':
            // Show custom date range picker (use prompt for simplicity)
            showCustomDateRangePicker('tracking');
            setTimeout(() => {
                if (dateSelector) dateSelector.value = 'current';
            }, 100);
            break;
        default:
            // 'current' - do nothing, just display
            break;
    }
}

/**
 * Set tracking single day filter
 */
function setTrackingSingleDay(date) {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const dateStr = date.toISOString().split('T')[0];

    if (dateFromInput) dateFromInput.value = dateStr;
    if (dateToInput) dateToInput.value = dateStr;

    updateTrackingDateSelectorDisplay();
    applyFilters();
}

/**
 * Navigate tracking date by days
 */
function navigateTrackingDate(days) {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');

    if (!dateFromInput?.value || !dateToInput?.value) return;

    const fromDate = new Date(dateFromInput.value + 'T00:00:00');
    const toDate = new Date(dateToInput.value + 'T00:00:00');

    // Calculate range in days
    const rangeDays = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));

    // Move both dates
    fromDate.setDate(fromDate.getDate() + days);
    toDate.setDate(toDate.getDate() + days);

    dateFromInput.value = fromDate.toISOString().split('T')[0];
    dateToInput.value = toDate.toISOString().split('T')[0];

    trackingCurrentDate = fromDate;
    clearQuickDateButtonActive();
    updateTrackingDateSelectorDisplay();
    applyFilters();
}

/**
 * Update tracking date selector display text
 */
function updateTrackingDateSelectorDisplay() {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const currentDateOption = document.getElementById('trackingCurrentDateOption');

    if (!currentDateOption || !dateFromInput?.value) return;

    const fromDate = new Date(dateFromInput.value + 'T00:00:00');
    const toDate = dateToInput?.value ? new Date(dateToInput.value + 'T00:00:00') : fromDate;

    // Check if same day
    const isSameDay = dateFromInput.value === dateToInput?.value;

    if (isSameDay) {
        // Format as "Thứ X, DD/MM"
        const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        const dayName = dayNames[fromDate.getDay()];
        const dateStr = `${fromDate.getDate().toString().padStart(2, '0')}/${(fromDate.getMonth() + 1).toString().padStart(2, '0')}`;
        currentDateOption.textContent = `${dayName}, ${dateStr}`;
    } else {
        // Format as "DD/MM - DD/MM"
        const fromStr = `${fromDate.getDate().toString().padStart(2, '0')}/${(fromDate.getMonth() + 1).toString().padStart(2, '0')}`;
        const toStr = `${toDate.getDate().toString().padStart(2, '0')}/${(toDate.getMonth() + 1).toString().padStart(2, '0')}`;
        currentDateOption.textContent = `${fromStr} → ${toStr}`;
    }
}

/**
 * Set quick date range
 */
function setQuickDateRange(days, activeBtn) {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');

    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - days);

    if (dateFromInput) {
        dateFromInput.value = pastDate.toISOString().split('T')[0];
    }
    if (dateToInput) {
        dateToInput.value = now.toISOString().split('T')[0];
    }

    // Update active button state
    clearQuickDateButtonActive();
    activeBtn?.classList.add('active');

    // Update date selector display
    updateTrackingDateSelectorDisplay();

    // Reset selector to current
    const dateSelector = document.getElementById('trackingDateSelector');
    if (dateSelector) dateSelector.value = 'current';

    applyFilters();
}

/**
 * Show custom date range picker
 */
function showCustomDateRangePicker(tab) {
    const fromInput = tab === 'tracking'
        ? document.getElementById('filterDateFrom')
        : document.getElementById('filterBookingDateFrom');
    const toInput = tab === 'tracking'
        ? document.getElementById('filterDateTo')
        : document.getElementById('filterBookingDateTo');

    // Create modal for custom date range
    const existingModal = document.getElementById('customDateRangeModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'customDateRangeModal';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;">
            <div style="background:white;border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 16px;font-size:18px;color:#1f2937;">Chọn khoảng thời gian</h3>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;color:#6b7280;">Từ ngày:</label>
                        <input type="date" id="customDateFrom" value="${fromInput?.value || ''}" style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;font-size:16px;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-weight:600;color:#6b7280;">Đến ngày:</label>
                        <input type="date" id="customDateTo" value="${toInput?.value || ''}" style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;font-size:16px;">
                    </div>
                </div>
                <div style="display:flex;gap:12px;margin-top:20px;justify-content:flex-end;">
                    <button onclick="document.getElementById('customDateRangeModal').remove()" style="padding:10px 20px;background:#f3f4f6;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Hủy</button>
                    <button onclick="applyCustomDateRange('${tab}')" style="padding:10px 20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Áp dụng</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

/**
 * Apply custom date range
 */
function applyCustomDateRange(tab) {
    const customFrom = document.getElementById('customDateFrom')?.value;
    const customTo = document.getElementById('customDateTo')?.value;

    if (!customFrom || !customTo) {
        alert('Vui lòng chọn đầy đủ ngày bắt đầu và kết thúc');
        return;
    }

    const fromInput = tab === 'tracking'
        ? document.getElementById('filterDateFrom')
        : document.getElementById('filterBookingDateFrom');
    const toInput = tab === 'tracking'
        ? document.getElementById('filterDateTo')
        : document.getElementById('filterBookingDateTo');

    if (fromInput) fromInput.value = customFrom;
    if (toInput) toInput.value = customTo;

    document.getElementById('customDateRangeModal')?.remove();

    if (tab === 'tracking') {
        clearQuickDateButtonActive();
        updateTrackingDateSelectorDisplay();
        applyFilters();
    } else {
        clearBookingQuickDateButtonActive();
        updateBookingDateSelectorDisplay();
        applyBookingFilters();
    }
}

/**
 * Clear active state from all quick date buttons
 */
function clearQuickDateButtonActive() {
    document.querySelectorAll('.btn-quick-date').forEach(btn => {
        btn.classList.remove('active');
    });
}

/**
 * Apply filters to data
 */
function applyFilters() {
    const dateFrom = document.getElementById('filterDateFrom')?.value;
    const dateTo = document.getElementById('filterDateTo')?.value;
    const ncc = document.getElementById('filterNCC')?.value?.trim();

    globalState.filters = {
        dateFrom,
        dateTo,
        ncc
    };

    applyFiltersAndRender();
}

/**
 * Clear all filters
 */
function clearFilters() {
    const dateFromInput = document.getElementById('filterDateFrom');
    const dateToInput = document.getElementById('filterDateTo');
    const nccSelect = document.getElementById('filterNCC');
    const productInput = document.getElementById('filterProduct');

    // Reset to 30 days range
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (dateFromInput) dateFromInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    if (dateToInput) dateToInput.value = now.toISOString().split('T')[0];
    if (nccSelect) nccSelect.value = 'all';
    if (productInput) productInput.value = '';

    // Set 30N button as active
    clearQuickDateButtonActive();
    document.getElementById('btn30Days')?.classList.add('active');

    globalState.filters = {
        dateFrom: thirtyDaysAgo.toISOString().split('T')[0],
        dateTo: now.toISOString().split('T')[0],
        ncc: 'all'
    };
    globalState.searchQuery = '';

    applyFiltersAndRender();
}

/**
 * Apply filters and render for tracking tab
 */
function applyFiltersAndRender() {
    const { shipments, filters, searchQuery } = globalState;

    let filtered = [...shipments];

    // Filter by date range
    if (filters.dateFrom) {
        filtered = filtered.filter(s => s.ngayDiHang >= filters.dateFrom);
    }
    if (filters.dateTo) {
        filtered = filtered.filter(s => s.ngayDiHang <= filters.dateTo);
    }

    // Filter by NCC (skip if "all" is selected)
    if (filters.ncc && filters.ncc !== 'all') {
        const nccNum = parseInt(filters.ncc);
        filtered = filtered.filter(s =>
            (s.hoaDon || []).some(hd => hd.sttNCC === nccNum)
        );
    }

    // Filter by product code search
    if (searchQuery) {
        const query = searchQuery.toUpperCase();
        filtered = filtered.filter(s =>
            (s.hoaDon || []).some(hd =>
                (hd.sanPham || []).some(p =>
                    (p.maSP || '').toUpperCase().includes(query) ||
                    (p.rawText || '').toUpperCase().includes(query)
                )
            )
        );
    }

    globalState.filteredShipments = filtered;

    // Always render shipments for tracking tab
    if (typeof renderShipments === 'function') {
        renderShipments(filtered);
    }

    // Update count
    updateFilterCount(filtered.length, shipments.length);
}

/**
 * Update filter count display
 */
function updateFilterCount(filtered, total) {
    const countEl = document.getElementById('filterCount');
    if (countEl) {
        if (filtered === total) {
            countEl.textContent = `${total} đợt hàng`;
        } else {
            countEl.textContent = `${filtered}/${total} đợt hàng`;
        }
    }
}

// =====================================================
// BOOKING FILTERS - ORDER BOOKING TAB
// =====================================================

// Store current date for booking navigation
let bookingCurrentDate = new Date();

/**
 * Initialize booking filters
 */
function initBookingFilters() {
    const dateFromInput = document.getElementById('filterBookingDateFrom');
    const dateToInput = document.getElementById('filterBookingDateTo');
    const nccSelect = document.getElementById('filterBookingNCC');
    const statusSelect = document.getElementById('filterBookingStatus');
    const productInput = document.getElementById('filterBookingProduct');
    const btnClear = document.getElementById('btnClearBookingFilters');

    // Quick date buttons
    const btn7Days = document.getElementById('btnBooking7Days');
    const btn15Days = document.getElementById('btnBooking15Days');
    const btn30Days = document.getElementById('btnBooking30Days');

    // Date selector dropdown
    const dateSelector = document.getElementById('bookingDateSelector');
    const dateInput = document.getElementById('filterBookingDateInput');
    const btnPrev = document.getElementById('btnBookingPrevDay');
    const btnNext = document.getElementById('btnBookingNextDay');

    // Set default date range (last 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (dateFromInput) dateFromInput.value = sevenDaysAgo.toISOString().split('T')[0];
    if (dateToInput) dateToInput.value = now.toISOString().split('T')[0];

    // Update date selector display
    updateBookingDateSelectorDisplay();

    // Event listeners for quick date buttons
    btn7Days?.addEventListener('click', () => setBookingQuickDateRange(7, btn7Days));
    btn15Days?.addEventListener('click', () => setBookingQuickDateRange(15, btn15Days));
    btn30Days?.addEventListener('click', () => setBookingQuickDateRange(30, btn30Days));

    // Date selector dropdown change
    dateSelector?.addEventListener('change', handleBookingDateSelectorChange);

    // Hidden date input change (for single day selection)
    dateInput?.addEventListener('change', () => {
        if (dateInput.value) {
            bookingCurrentDate = new Date(dateInput.value + 'T00:00:00');
            setBookingSingleDay(bookingCurrentDate);
        }
    });

    // Navigation buttons
    btnPrev?.addEventListener('click', () => navigateBookingDate(-1));
    btnNext?.addEventListener('click', () => navigateBookingDate(1));

    // Event listeners for real-time filtering
    nccSelect?.addEventListener('change', applyBookingFilters);
    statusSelect?.addEventListener('change', applyBookingFilters);

    // Product search with debounce
    let searchTimeout;
    productInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            applyBookingFilters();
        }, 300);
    });

    // Clear button
    btnClear?.addEventListener('click', clearBookingFilters);

    // Initialize with 7N active
    btn7Days?.classList.add('active');
}

/**
 * Handle booking date selector change
 */
function handleBookingDateSelectorChange() {
    const dateSelector = document.getElementById('bookingDateSelector');
    const dateInput = document.getElementById('filterBookingDateInput');
    const value = dateSelector?.value;

    clearBookingQuickDateButtonActive();

    switch (value) {
        case 'today':
            bookingCurrentDate = new Date();
            setBookingSingleDay(bookingCurrentDate);
            break;
        case '3days':
            setBookingQuickDateRange(3, null);
            break;
        case '7days':
            setBookingQuickDateRange(7, document.getElementById('btnBooking7Days'));
            break;
        case '10days':
            setBookingQuickDateRange(10, null);
            break;
        case 'single':
            // Open date picker for single day
            if (dateInput) {
                dateInput.style.pointerEvents = 'auto';
                dateInput.showPicker?.() || dateInput.click();
                dateInput.style.pointerEvents = 'none';
            }
            // Reset to current option after selection
            setTimeout(() => {
                if (dateSelector) dateSelector.value = 'current';
            }, 100);
            break;
        case 'custom':
            // Show custom date range picker
            showCustomDateRangePicker('booking');
            setTimeout(() => {
                if (dateSelector) dateSelector.value = 'current';
            }, 100);
            break;
        default:
            // 'current' - do nothing, just display
            break;
    }
}

/**
 * Set booking single day filter
 */
function setBookingSingleDay(date) {
    const dateFromInput = document.getElementById('filterBookingDateFrom');
    const dateToInput = document.getElementById('filterBookingDateTo');
    const dateStr = date.toISOString().split('T')[0];

    if (dateFromInput) dateFromInput.value = dateStr;
    if (dateToInput) dateToInput.value = dateStr;

    updateBookingDateSelectorDisplay();
    applyBookingFilters();
}

/**
 * Navigate booking date by days
 */
function navigateBookingDate(days) {
    const dateFromInput = document.getElementById('filterBookingDateFrom');
    const dateToInput = document.getElementById('filterBookingDateTo');

    if (!dateFromInput?.value || !dateToInput?.value) return;

    const fromDate = new Date(dateFromInput.value + 'T00:00:00');
    const toDate = new Date(dateToInput.value + 'T00:00:00');

    // Move both dates
    fromDate.setDate(fromDate.getDate() + days);
    toDate.setDate(toDate.getDate() + days);

    dateFromInput.value = fromDate.toISOString().split('T')[0];
    dateToInput.value = toDate.toISOString().split('T')[0];

    bookingCurrentDate = fromDate;
    clearBookingQuickDateButtonActive();
    updateBookingDateSelectorDisplay();
    applyBookingFilters();
}

/**
 * Update booking date selector display text
 */
function updateBookingDateSelectorDisplay() {
    const dateFromInput = document.getElementById('filterBookingDateFrom');
    const dateToInput = document.getElementById('filterBookingDateTo');
    const currentDateOption = document.getElementById('bookingCurrentDateOption');

    if (!currentDateOption || !dateFromInput?.value) return;

    const fromDate = new Date(dateFromInput.value + 'T00:00:00');
    const toDate = dateToInput?.value ? new Date(dateToInput.value + 'T00:00:00') : fromDate;

    // Check if same day
    const isSameDay = dateFromInput.value === dateToInput?.value;

    if (isSameDay) {
        // Format as "Thứ X, DD/MM"
        const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        const dayName = dayNames[fromDate.getDay()];
        const dateStr = `${fromDate.getDate().toString().padStart(2, '0')}/${(fromDate.getMonth() + 1).toString().padStart(2, '0')}`;
        currentDateOption.textContent = `${dayName}, ${dateStr}`;
    } else {
        // Format as "DD/MM - DD/MM"
        const fromStr = `${fromDate.getDate().toString().padStart(2, '0')}/${(fromDate.getMonth() + 1).toString().padStart(2, '0')}`;
        const toStr = `${toDate.getDate().toString().padStart(2, '0')}/${(toDate.getMonth() + 1).toString().padStart(2, '0')}`;
        currentDateOption.textContent = `${fromStr} → ${toStr}`;
    }
}

/**
 * Set quick date range for booking filters
 */
function setBookingQuickDateRange(days, activeBtn) {
    const dateFromInput = document.getElementById('filterBookingDateFrom');
    const dateToInput = document.getElementById('filterBookingDateTo');

    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - days);

    if (dateFromInput) {
        dateFromInput.value = pastDate.toISOString().split('T')[0];
    }
    if (dateToInput) {
        dateToInput.value = now.toISOString().split('T')[0];
    }

    // Update active button state
    clearBookingQuickDateButtonActive();
    activeBtn?.classList.add('active');

    // Update date selector display
    updateBookingDateSelectorDisplay();

    // Reset selector to current
    const dateSelector = document.getElementById('bookingDateSelector');
    if (dateSelector) dateSelector.value = 'current';

    applyBookingFilters();
}

/**
 * Clear active state from booking quick date buttons
 */
function clearBookingQuickDateButtonActive() {
    document.querySelectorAll('#tabContentBooking .btn-quick-date').forEach(btn => {
        btn.classList.remove('active');
    });
}

/**
 * Apply booking filters to data
 */
function applyBookingFilters() {
    const dateFrom = document.getElementById('filterBookingDateFrom')?.value;
    const dateTo = document.getElementById('filterBookingDateTo')?.value;
    const ncc = document.getElementById('filterBookingNCC')?.value?.trim();
    const status = document.getElementById('filterBookingStatus')?.value;
    const product = document.getElementById('filterBookingProduct')?.value?.trim();

    const { orderBookings } = globalState;

    let filtered = [...orderBookings];

    // Filter by date range
    if (dateFrom) {
        filtered = filtered.filter(b => b.ngayDatHang >= dateFrom);
    }
    if (dateTo) {
        filtered = filtered.filter(b => b.ngayDatHang <= dateTo);
    }

    // Filter by NCC
    if (ncc && ncc !== 'all') {
        const nccNum = parseInt(ncc);
        filtered = filtered.filter(b => b.sttNCC === nccNum || String(b.sttNCC) === ncc);
    }

    // Filter by status
    if (status && status !== 'all') {
        filtered = filtered.filter(b => b.trangThai === status);
    }

    // Filter by product code search
    if (product) {
        const query = product.toUpperCase();
        filtered = filtered.filter(b =>
            (b.sanPham || []).some(p =>
                (p.maSP || '').toUpperCase().includes(query) ||
                (p.rawText || '').toUpperCase().includes(query)
            )
        );
    }

    globalState.filteredOrderBookings = filtered;

    // Render
    if (typeof renderOrderBookings === 'function') {
        renderOrderBookings(filtered);
    }

    // Update count
    updateBookingFilterCount(filtered.length, orderBookings.length);
}

/**
 * Clear booking filters
 */
function clearBookingFilters() {
    const dateFromInput = document.getElementById('filterBookingDateFrom');
    const dateToInput = document.getElementById('filterBookingDateTo');
    const nccSelect = document.getElementById('filterBookingNCC');
    const statusSelect = document.getElementById('filterBookingStatus');
    const productInput = document.getElementById('filterBookingProduct');

    // Reset to 30 days range
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (dateFromInput) dateFromInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    if (dateToInput) dateToInput.value = now.toISOString().split('T')[0];
    if (nccSelect) nccSelect.value = 'all';
    if (statusSelect) statusSelect.value = 'all';
    if (productInput) productInput.value = '';

    // Set 30N button as active
    clearBookingQuickDateButtonActive();
    document.getElementById('btnBooking30Days')?.classList.add('active');

    applyBookingFilters();
}

/**
 * Update booking filter count display
 */
function updateBookingFilterCount(filtered, total) {
    const countEl = document.getElementById('filterBookingCount');
    if (countEl) {
        if (filtered === total) {
            countEl.textContent = `${total} đơn đặt hàng`;
        } else {
            countEl.textContent = `${filtered}/${total} đơn đặt hàng`;
        }
    }
}

// Initialize all filters on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    initBookingFilters();
});

console.log('[FILTER] Filters initialized');
