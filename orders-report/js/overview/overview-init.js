// =====================================================
// OVERVIEW - INIT: Page Initialization
// =====================================================

// INITIALIZATION
// =====================================================
document.addEventListener('DOMContentLoaded', async function () {
    console.log('[REPORT] Page loaded, initializing...');

    // Initialize analysis tab visibility based on permissions (with safe check)
    if (typeof initAnalysisTabVisibility === 'function') {
        initAnalysisTabVisibility();
    }

    // Reset fetching state on page load (in case it was stuck from previous session)
    if (typeof isFetching !== 'undefined') isFetching = false;
    const fetchBtn = document.getElementById('btnBatchFetch');
    if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = '<i class="fas fa-download"></i> Lấy chi tiết đơn hàng';
    }

    // Load cached data (metadata only from localStorage)
    loadCachedData();

    // Load default table name from Firebase (same as tab1) to auto-select on page refresh
    currentTableName = await loadDefaultTableNameFromFirebase();
    console.log('[REPORT] 📋 Default table set to:', currentTableName);

    // Load statistics settings
    await Promise.all([
        loadEmployeeRanges(),
        loadAvailableTagsFromFirebase(),
        loadTrackedTags()
    ]);
    console.log('[REPORT] 📊 Statistics settings loaded');

    // Load available tables from Firebase (for Chi tiết đã tải dropdown)
    await loadAvailableTables();

    // Update UI for Chi tiết đã tải tab (from Firebase cache)
    updateCachedCountBadge();
    renderCachedDetailsTab();

    // ⚡ OPTIMIZATION FIX: Don't render statistics on init - wait for Tab1 data
    // renderStatistics() will be called after receiving data from Tab1
    console.log('[REPORT] ⏳ Waiting for Tab1 data before rendering statistics...');

    // Initialize discount stats UI
    if (window.discountStatsUI) {
        window.discountStatsUI.init();
        console.log('[REPORT] 💰 Discount Stats UI initialized');
    }

    console.log(`[REPORT] 🎉 Firebase init complete. cachedOrders for "${currentTableName}": ${cachedOrderDetails[currentTableName]?.orders?.length || 0}`);

    // =====================================================
    // EXCEL AUTO-FETCH - DISABLED FOR PERFORMANCE
    // =====================================================
    // ⚡ OPTIMIZATION FIX: Excel auto-fetch was blocking initialization for 5-15 seconds
    // Now disabled - user can manually fetch via button if needed
    //
    // Previous behavior: Automatically fetched ALL campaigns on page load
    // Issue: Blocked for 5-15 seconds waiting for API responses
    // Fix: Only load from sessionStorage cache (fast), skip API fetch
    try {
        // Check if we have cached data in sessionStorage (non-blocking)
        const sessionCache = sessionStorage.getItem('reportOrdersExcelCache');

        if (sessionCache) {
            try {
                const cached = JSON.parse(sessionCache);
                // Check if cache is fresh (less than 5 minutes old) AND has orders
                const cacheAge = Date.now() - (cached.timestamp || 0);
                const hasValidOrders = cached.orders && cached.orders.length > 0;

                if (cacheAge < 5 * 60 * 1000 && hasValidOrders) {
                    console.log(`[REPORT] 📦 Using cached Excel data from sessionStorage (${cached.orders.length} orders)`);

                    // Load cached data into cachedOrderDetails for display
                    if (currentTableName) {
                        const cacheData = {
                            tableName: currentTableName,
                            orders: cached.orders,
                            fetchedAt: new Date(cached.timestamp).toISOString(),
                            totalOrders: cached.orders.length,
                            successCount: cached.orders.length,
                            errorCount: 0,
                            _source: 'session_cache'
                        };

                        // Load into local cache
                        cachedOrderDetails[currentTableName] = cacheData;
                        saveCachedData();

                        // Update UI
                        updateCachedCountBadge();
                        renderCachedDetailsTab();

                        console.log(`[REPORT] ✅ Session cache loaded into "Chi tiết đã tải" for "${currentTableName}"`);
                    }
                } else if (!hasValidOrders) {
                    console.log('[REPORT] ⚠️ Session cache exists but has no orders - use manual fetch button');
                }
            } catch (e) {
                console.warn('[REPORT] Failed to parse session cache:', e);
            }
        } else {
            console.log('[REPORT] ℹ️ No session cache - use manual fetch button or wait for Tab1 data');
        }

        //    ... (Excel fetch code removed for performance)
        // }
    } catch (error) {
        console.warn('[REPORT] ⚠️ Error loading session cache:', error);
    }

    // ⚡ OPTIMIZATION FIX: Request Tab1 data IMMEDIATELY (no delay)
    // Previous: 500ms delay after blocking Excel fetch
    // New: Request immediately, let Tab1 respond when ready
    console.log('[REPORT] 📡 Requesting Tab1 data for Tổng quan...');
    requestDataFromTab1();
});

// =====================================================
// EXPORT FUNCTIONS
// =====================================================
window.reportModule = {
    getAllOrders: () => allOrders,
    getCachedDetails: () => cachedOrderDetails,
    getCurrentCampaign: () => currentCampaignName,
    getCurrentTableName: () => currentTableName,
    fetchOrderData: fetchOrderData,
    refreshData: requestDataFromTab1,
    startBatchFetch: startBatchFetch
};

// Expose for discount stats (with safe check)
if (typeof cachedOrderDetails !== 'undefined') {
    window.cachedOrderDetails = cachedOrderDetails;
}

// Expose permission functions (with safe checks)
if (typeof canViewAnalysis !== 'undefined') window.canViewAnalysis = canViewAnalysis;
if (typeof canEditAnalysis !== 'undefined') window.canEditAnalysis = canEditAnalysis;
if (typeof currentTableName !== 'undefined') window.currentTableName = currentTableName;
