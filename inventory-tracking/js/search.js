// =====================================================
// SEARCH - INVENTORY TRACKING
// Phase 5: Search shipments by product code
// =====================================================

let searchDebounceTimer = null;

/**
 * Initialize search
 */
function initSearch() {
    const searchInput = document.getElementById('filterProductCode');
    const btnSearch = document.getElementById('btnSearch');

    searchInput?.addEventListener('input', (e) => {
        // Debounce search
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            performSearch(e.target.value);
        }, 300);
    });

    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchDebounceTimer);
            performSearch(e.target.value);
        }
        if (e.key === 'Escape') {
            e.target.value = '';
            performSearch('');
        }
    });

    btnSearch?.addEventListener('click', () => {
        performSearch(searchInput?.value || '');
    });
}

/**
 * Perform search
 */
function performSearch(query) {
    globalState.searchQuery = query.trim();
    applyFiltersAndRender();

    // Highlight search results if query exists
    if (globalState.searchQuery) {
        highlightSearchResults(globalState.searchQuery);
    }
}

/**
 * Highlight search results in rendered content
 */
function highlightSearchResults(query) {
    if (!query) return;

    const container = document.getElementById('shipmentsContainer');
    if (!container) return;

    const upperQuery = query.toUpperCase();

    // Find all product code elements and highlight matching ones
    const productCodes = container.querySelectorAll('.product-code, .product-item');

    productCodes.forEach(el => {
        const text = el.textContent.toUpperCase();
        if (text.includes(upperQuery)) {
            el.classList.add('search-highlight');
        } else {
            el.classList.remove('search-highlight');
        }
    });
}

/**
 * Clear search
 */
function clearSearch() {
    const searchInput = document.getElementById('filterProductCode');
    if (searchInput) {
        searchInput.value = '';
    }
    globalState.searchQuery = '';
    applyFiltersAndRender();
}

/**
 * Search in specific invoice
 */
function searchInInvoice(invoice, query) {
    if (!query || !invoice) return false;

    const upperQuery = query.toUpperCase();

    // Search in products
    return (invoice.sanPham || []).some(p =>
        (p.maSP || '').toUpperCase().includes(upperQuery) ||
        (p.tenHang || '').toUpperCase().includes(upperQuery) ||
        (p.rawText || '').toUpperCase().includes(upperQuery)
    );
}

/**
 * Get search results summary
 */
function getSearchResultsSummary() {
    const { searchQuery, filteredShipments } = globalState;

    if (!searchQuery) return null;

    let matchingInvoices = 0;
    let matchingProducts = 0;

    filteredShipments.forEach(shipment => {
        (shipment.hoaDon || []).forEach(hd => {
            if (searchInInvoice(hd, searchQuery)) {
                matchingInvoices++;
                matchingProducts += (hd.sanPham || []).filter(p =>
                    (p.maSP || '').toUpperCase().includes(searchQuery.toUpperCase())
                ).length;
            }
        });
    });

    return {
        query: searchQuery,
        shipments: filteredShipments.length,
        invoices: matchingInvoices,
        products: matchingProducts
    };
}

console.log('[SEARCH] Search initialized');
