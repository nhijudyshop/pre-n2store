// =====================================================
// RENDERING & UI UPDATES
// =====================================================

// 🔄 CẬP NHẬT ORDER TRONG BẢNG SAU KHI SAVE
// OPTIMIZED: Sử dụng OrderStore O(1) thay vì findIndex O(n)
function updateOrderInTable(orderId, updatedOrderData) {
    console.log('[UPDATE] Updating order in table:', orderId);

    // Lọc bỏ các trường undefined để tránh ghi đè dữ liệu có sẵn (như Tags)
    const cleanedData = Object.keys(updatedOrderData).reduce((acc, key) => {
        if (updatedOrderData[key] !== undefined) {
            acc[key] = updatedOrderData[key];
        }
        return acc;
    }, {});

    // ═══════════════════════════════════════════════════════════════════
    // PHASE A OPTIMIZATION: Sử dụng OrderStore O(1) lookup
    // Thay vì 3 lần findIndex O(n) = O(3n), giờ chỉ cần O(1)
    // ═══════════════════════════════════════════════════════════════════

    // 1. Cập nhật trong OrderStore (O(1) - NHANH!)
    if (window.OrderStore && window.OrderStore.isInitialized) {
        const updated = window.OrderStore.update(orderId, cleanedData);
        if (updated) {
            console.log('[UPDATE] ✅ Updated via OrderStore O(1)');
        }
    }

    // 2. Cập nhật trong allData (backward compatibility)
    // OrderStore và allData share cùng object references, nên update 1 sẽ update cả 2
    // Nhưng vẫn giữ logic cũ để đảm bảo an toàn
    const indexInAll = allData.findIndex(order => order.Id === orderId);
    if (indexInAll !== -1) {
        allData[indexInAll] = { ...allData[indexInAll], ...cleanedData };
        console.log('[UPDATE] Updated in allData at index:', indexInAll);
    }

    // 3. Cập nhật trong filteredData
    const indexInFiltered = filteredData.findIndex(order => order.Id === orderId);
    if (indexInFiltered !== -1) {
        filteredData[indexInFiltered] = { ...filteredData[indexInFiltered], ...cleanedData };
        console.log('[UPDATE] Updated in filteredData at index:', indexInFiltered);
    }

    // 4. Cập nhật trong displayedData
    const indexInDisplayed = displayedData.findIndex(order => order.Id === orderId);
    if (indexInDisplayed !== -1) {
        displayedData[indexInDisplayed] = { ...displayedData[indexInDisplayed], ...cleanedData };
        console.log('[UPDATE] Updated in displayedData at index:', indexInDisplayed);
    }

    // 5. Check if only Tags are updated - if so, update row inline without re-rendering table
    // This prevents scroll jumping when adding/removing quick tags
    const updatedKeys = Object.keys(cleanedData);
    const isTagsOnlyUpdate = updatedKeys.length === 1 && updatedKeys[0] === 'Tags';

    if (isTagsOnlyUpdate) {
        // Find order to get Code for parseOrderTags - O(1) via OrderStore
        const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
        if (order) {
            updateRowTagsOnly(orderId, cleanedData.Tags, order.Code);
            console.log('[UPDATE] ✓ Tags updated inline (no scroll reset)');
        }
    } else {
        // Re-apply all filters and re-render table for non-tag updates
        // This ensures realtime filter updates (e.g., removing a tag will hide the order if filtering by that tag)
        performTableSearch();
    }

    // 6. Cập nhật stats (nếu tổng tiền thay đổi)
    updateStats();

    // 7. Highlight row vừa được cập nhật
    // highlightUpdatedRow(orderId); // DISABLED: Removed auto-scroll and highlight

    console.log('[UPDATE] ✓ Table updated successfully');
}

// 🏷️ UPDATE CHỈ PHẦN TAGS CỦA ROW (KHÔNG RE-RENDER TABLE)
// Dùng cho quick tag add/remove để tránh scroll jump
function updateRowTagsOnly(orderId, tagsJson, orderCode) {
    // Tìm tất cả rows có data-order-id matching (có thể có nhiều trong employee view)
    const rows = document.querySelectorAll(`tr[data-order-id="${orderId}"]`);

    if (rows.length === 0) {
        console.log('[UPDATE-TAGS] Row not found in DOM, skipping inline update');
        return;
    }

    // Parse tags và tạo HTML mới
    const tagsHTML = parseOrderTags(tagsJson, orderId, orderCode);

    rows.forEach(row => {
        // Tìm tag cell
        const tagCell = row.querySelector('td[data-column="tag"]');
        if (!tagCell) return;

        // Tìm container chứa tags (div thứ 2 trong tag cell)
        const tagsContainer = tagCell.querySelector('div > div:last-child');
        if (tagsContainer) {
            tagsContainer.innerHTML = tagsHTML;
            console.log('[UPDATE-TAGS] Updated tags for row:', orderId);
        }
    });
}

// 🌟 HIGHLIGHT ROW VỪA CẬP NHẬT
// DISABLED: Removed auto-scroll and highlight functionality
// function highlightUpdatedRow(orderId) {
//     setTimeout(() => {
//         // Tìm row trong bảng
//         const rows = document.querySelectorAll('#tableBody tr');
//         rows.forEach(row => {
//             const checkbox = row.querySelector('input[type="checkbox"]');
//             if (checkbox && checkbox.value === orderId) {
//                 // Thêm class highlight
//                 row.classList.add('product-row-highlight');

//                 // Scroll vào view (nếu cần)
//                 row.scrollIntoView({ behavior: 'smooth', block: 'center' });

//                 // Remove highlight sau 2 giây
//                 setTimeout(() => {
//                     row.classList.remove('product-row-highlight');
//                 }, 2000);
//             }
//         });
//     }, 100);
// }

// =====================================================
// TABLE SORTING FUNCTIONS
// =====================================================

/**
 * Apply sorting to displayedData based on currentSortColumn and currentSortDirection
 */
function applySorting() {
    if (!currentSortColumn || !currentSortDirection) return;

    const sortableColumns = {
        'phone': { field: 'Telephone', type: 'string' },
        'address': { field: 'Address', type: 'string' },
        'debt': { field: null, type: 'debt' }, // Special: get from cache
        'total': { field: 'TotalAmount', type: 'number' },
        'quantity': { field: 'TotalQuantity', type: 'number' }
    };

    const config = sortableColumns[currentSortColumn];
    if (!config) return;

    displayedData.sort((a, b) => {
        let aVal, bVal;

        if (config.type === 'debt') {
            // Get debt from cache
            aVal = getCachedDebt(a.Telephone) || 0;
            bVal = getCachedDebt(b.Telephone) || 0;
        } else if (config.type === 'number') {
            aVal = Number(a[config.field]) || 0;
            bVal = Number(b[config.field]) || 0;
        } else {
            // String type
            aVal = (a[config.field] || '').toString().trim();
            bVal = (b[config.field] || '').toString().trim();
        }

        // Sorting logic
        if (config.type === 'string') {
            // Empty strings first when ascending
            const aEmpty = !aVal;
            const bEmpty = !bVal;

            if (currentSortDirection === 'asc') {
                if (aEmpty && !bEmpty) return -1;
                if (!aEmpty && bEmpty) return 1;
                if (aEmpty && bEmpty) return 0;
                return aVal.localeCompare(bVal, 'vi');
            } else {
                if (aEmpty && !bEmpty) return 1;
                if (!aEmpty && bEmpty) return -1;
                if (aEmpty && bEmpty) return 0;
                return bVal.localeCompare(aVal, 'vi');
            }
        } else {
            // Number type (including debt)
            if (currentSortDirection === 'asc') {
                return aVal - bVal;
            } else {
                return bVal - aVal;
            }
        }
    });
}

/**
 * Handle column header click for sorting
 * @param {string} column - Column name (phone, address, debt, total, quantity)
 */
function handleSortClick(column) {
    const sortableColumns = ['phone', 'address', 'debt', 'total', 'quantity'];
    if (!sortableColumns.includes(column)) return;

    if (currentSortColumn === column) {
        // Same column: cycle asc → desc → null
        if (currentSortDirection === 'asc') {
            currentSortDirection = 'desc';
        } else if (currentSortDirection === 'desc') {
            currentSortDirection = null;
            currentSortColumn = null;
        }
    } else {
        // Different column: reset and start with asc
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }

    // Update header icons
    updateSortIcons();

    // Re-apply sorting and render
    if (currentSortColumn && currentSortDirection) {
        displayedData = [...filteredData];
        applySorting();
    } else {
        displayedData = [...filteredData];
    }
    renderTable();
}

/**
 * Update sort icons on table headers (supports multiple tables)
 */
function updateSortIcons() {
    const sortableColumns = ['phone', 'address', 'debt', 'total', 'quantity'];

    sortableColumns.forEach(col => {
        // Find all headers with this column (main table + employee tables)
        const headers = document.querySelectorAll(`th[data-column="${col}"]`);

        headers.forEach(th => {
            // Remove existing icon
            const existingIcon = th.querySelector('.sort-icon');
            if (existingIcon) existingIcon.remove();

            // Add new icon
            const icon = document.createElement('span');
            icon.className = 'sort-icon';
            icon.style.marginLeft = '4px';
            icon.style.fontSize = '10px';

            if (currentSortColumn === col) {
                if (currentSortDirection === 'asc') {
                    icon.innerHTML = '▲';
                    icon.style.color = '#3b82f6';
                } else if (currentSortDirection === 'desc') {
                    icon.innerHTML = '▼';
                    icon.style.color = '#3b82f6';
                }
            } else {
                icon.innerHTML = '⇅';
                icon.style.color = '#9ca3af';
            }

            th.appendChild(icon);
        });
    });
}

/**
 * Reset sorting state
 */
function resetSorting() {
    currentSortColumn = null;
    currentSortDirection = null;
    updateSortIcons();
}

/**
 * Initialize sortable headers using event delegation
 */
function initSortableHeaders() {
    const sortableColumns = ['phone', 'address', 'debt', 'total', 'quantity'];

    // Use event delegation on document for dynamically created tables
    document.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-column]');
        if (!th) return;

        const column = th.getAttribute('data-column');
        if (sortableColumns.includes(column)) {
            handleSortClick(column);
        }
    });

    // Initialize icons after table loads
    setTimeout(updateSortIcons, 500);
}

// Initialize on DOM ready (only once)
let sortableHeadersInitialized = false;
document.addEventListener('DOMContentLoaded', () => {
    if (!sortableHeadersInitialized) {
        sortableHeadersInitialized = true;
        initSortableHeaders();
    }
});

function renderTable() {
    if (displayedData.length === 0) {
        // Remove any existing employee sections (important when filter results in 0 items)
        const tableContainer = document.getElementById('tableContainer');
        const existingSections = tableContainer.querySelectorAll('.employee-section');
        existingSections.forEach(section => section.remove());

        // Show the default table wrapper with "Không có dữ liệu" message
        const defaultTableWrapper = tableContainer.querySelector('.table-wrapper');
        if (defaultTableWrapper) {
            defaultTableWrapper.style.display = 'block';
        }

        const tbody = document.getElementById("tableBody");
        tbody.innerHTML =
            '<tr><td colspan="17" style="text-align: center; padding: 40px;">Không có dữ liệu</td></tr>';
        return;
    }

    // Show employee grouped view only when toggle is ON and ranges are configured
    if (employeeViewMode && employeeRanges.length > 0) {
        renderByEmployee();
    } else {
        renderAllOrders();
    }

    // Apply column visibility after rendering
    if (window.columnVisibility) {
        window.columnVisibility.initialize();
    }

    // Update sort icons after rendering
    updateSortIcons();

    // Re-apply pending customer highlights after table render
    if (window.newMessagesNotifier && window.newMessagesNotifier.reapply) {
        // Small delay to ensure DOM is fully updated
        setTimeout(() => window.newMessagesNotifier.reapply(), 100);
    }
}

function renderAllOrders() {
    // Set rendering flag to prevent loadMoreRows() from running during render
    isRendering = true;

    const tableContainer = document.getElementById('tableContainer');

    // Show the default table wrapper
    const defaultTableWrapper = tableContainer.querySelector('.table-wrapper');
    if (defaultTableWrapper) {
        defaultTableWrapper.style.display = 'block';
    }

    // Remove any existing employee sections
    const existingSections = tableContainer.querySelectorAll('.employee-section');
    existingSections.forEach(section => section.remove());

    // ═══════════════════════════════════════════════════════════════════
    // RENDER ALL: Render tất cả rows một lần
    // - Progressive Loading vẫn load data theo batch từ API
    // - Nhưng table render ALL rows mỗi lần update
    // - Scroll mượt vì không cần re-render
    // - Realtime chỉ update đúng cell cần thiết
    // ═══════════════════════════════════════════════════════════════════
    const tbody = document.getElementById("tableBody");

    // Render ALL rows at once
    renderedCount = displayedData.length;
    tbody.innerHTML = displayedData.map(order => createRowHTML(order)).join('');

    console.log(`[RENDER-ALL] Rendered ${renderedCount} orders`);

    // Clear rendering flag after render is complete
    isRendering = false;
}

// =====================================================
// UPDATE CHAT COLUMNS ONLY - DEPRECATED
// Message/comment columns are now simplified (just placeholders)
// Badges are set by new-messages-notifier.js from pending_customers database
// =====================================================
function updateChatColumnsOnly() {
    // DEPRECATED: No longer needed since columns are simplified
    // Badges are now handled by new-messages-notifier.js
    console.log('[CHAT] updateChatColumnsOnly() is deprecated - badges handled by new-messages-notifier.js');

    // Trigger notifier to re-apply badges
    if (window.newMessagesNotifier && window.newMessagesNotifier.reapply) {
        window.newMessagesNotifier.reapply();
    }
}

// Expose globally (for backward compatibility)
window.updateChatColumnsOnly = updateChatColumnsOnly;

// =====================================================
// PHASE E: VIRTUAL TABLE - Chỉ render dòng nhìn thấy
// Giảm 45,000 DOM elements xuống còn ~500 (giảm 99%)
// =====================================================

const VirtualTable = {
    // Configuration
    ROW_HEIGHT: 52,              // Chiều cao mỗi dòng (px) - đo thực tế
    BUFFER_ROWS: 40,             // Số dòng buffer trên/dưới viewport
    MIN_ROWS_FOR_VIRTUAL: 5000,  // Tắt VirtualTable cho < 5000 orders → dùng Lazy Loading (không re-render khi scroll)
    RERENDER_THRESHOLD: 10,      // Chỉ re-render khi scroll >= 10 rows

    // State
    container: null,
    tbody: null,
    scrollTop: 0,
    visibleStart: 0,
    visibleEnd: 0,
    isEnabled: false,
    lastRenderTime: 0,

    // Throttle scroll handler
    scrollThrottleMs: 16,        // ~60fps
    pendingScroll: null,

    /**
     * Initialize Virtual Table
     */
    init() {
        this.container = document.getElementById('tableWrapper');
        this.tbody = document.getElementById('tableBody');

        if (!this.container || !this.tbody) {
            console.warn('[VIRTUAL-TABLE] Container or tbody not found');
            return false;
        }

        // Remove old scroll listener and add new one
        this.container.removeEventListener('scroll', handleTableScroll);
        this.container.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });

        console.log('[VIRTUAL-TABLE] Initialized');
        return true;
    },

    /**
     * Check if should use virtual rendering
     */
    shouldUseVirtual() {
        return displayedData.length >= this.MIN_ROWS_FOR_VIRTUAL;
    },

    /**
     * Throttled scroll handler
     */
    handleScroll(e) {
        const newScrollTop = e.target.scrollTop;

        // Only process if scrolled enough
        if (Math.abs(newScrollTop - this.scrollTop) < this.ROW_HEIGHT / 3) {
            return;
        }

        this.scrollTop = newScrollTop;

        // Throttle render calls
        if (this.pendingScroll) {
            cancelAnimationFrame(this.pendingScroll);
        }

        this.pendingScroll = requestAnimationFrame(() => {
            this.renderVisibleRows();
            this.pendingScroll = null;
        });
    },

    /**
     * Main render function - chỉ render dòng visible
     */
    render() {
        if (!this.container || !this.tbody) {
            if (!this.init()) return;
        }

        // Nếu ít dòng, dùng logic cũ (render tất cả)
        if (!this.shouldUseVirtual()) {
            console.log('[VIRTUAL-TABLE] Few rows, using standard rendering');
            this.isEnabled = false;
            this.renderStandard();
            return;
        }

        this.isEnabled = true;
        this.scrollTop = this.container.scrollTop;

        console.log(`[VIRTUAL-TABLE] Rendering ${displayedData.length} orders virtually`);
        this.renderVisibleRows();
    },

    /**
     * Standard rendering (for few rows)
     */
    renderStandard() {
        const orders = displayedData;
        if (orders.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="17" style="text-align: center; padding: 40px;">Không có dữ liệu</td></tr>';
            return;
        }

        // Render all rows (như cũ, nhưng không dùng infinite scroll)
        this.tbody.innerHTML = orders.map(order => createRowHTML(order)).join('');
        renderedCount = orders.length;
    },

    /**
     * Render only visible rows với spacers
     */
    renderVisibleRows() {
        const orders = displayedData;
        if (orders.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="17" style="text-align: center; padding: 40px;">Không có dữ liệu</td></tr>';
            return;
        }

        const containerHeight = this.container.clientHeight;
        const totalHeight = orders.length * this.ROW_HEIGHT;

        // Calculate visible range
        const startIndex = Math.max(0,
            Math.floor(this.scrollTop / this.ROW_HEIGHT) - this.BUFFER_ROWS);
        const endIndex = Math.min(orders.length,
            Math.ceil((this.scrollTop + containerHeight) / this.ROW_HEIGHT) + this.BUFFER_ROWS);

        // Skip render if range hasn't changed significantly (reduce jank)
        const startDiff = Math.abs(startIndex - this.visibleStart);
        const endDiff = Math.abs(endIndex - this.visibleEnd);
        if (startDiff < this.RERENDER_THRESHOLD && endDiff < this.RERENDER_THRESHOLD) {
            return;
        }

        this.visibleStart = startIndex;
        this.visibleEnd = endIndex;

        // Build HTML
        const visibleOrders = orders.slice(startIndex, endIndex);
        const topPadding = startIndex * this.ROW_HEIGHT;
        const bottomPadding = (orders.length - endIndex) * this.ROW_HEIGHT;

        let html = '';

        // Top spacer (giữ scroll position)
        if (topPadding > 0) {
            html += `<tr class="virtual-spacer-top" style="height:${topPadding}px"><td colspan="17"></td></tr>`;
        }

        // Visible rows
        html += visibleOrders.map(order => createRowHTML(order)).join('');

        // Bottom spacer
        if (bottomPadding > 0) {
            html += `<tr class="virtual-spacer-bottom" style="height:${bottomPadding}px"><td colspan="17"></td></tr>`;
        }

        this.tbody.innerHTML = html;
        renderedCount = endIndex; // Track for compatibility

        // Apply column visibility to new rows
        if (window.columnVisibility) {
            const settings = window.columnVisibility.load();
            window.columnVisibility.apply(settings);
        }

        // Re-apply pending customer highlights
        if (window.newMessagesNotifier && window.newMessagesNotifier.reapply) {
            setTimeout(() => window.newMessagesNotifier.reapply(), 50);
        }

        const now = Date.now();
        if (now - this.lastRenderTime > 1000) {
            console.log(`[VIRTUAL-TABLE] Rendered rows ${startIndex}-${endIndex} of ${orders.length}`);
            this.lastRenderTime = now;
        }
    },

    /**
     * Reset và re-render (sau filter/sort)
     */
    reset() {
        this.scrollTop = 0;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        if (this.container) {
            this.container.scrollTop = 0;
        }
        this.render();
    },

    /**
     * Force refresh visible rows (sau update data)
     */
    refresh() {
        this.visibleStart = -1; // Force re-render
        this.visibleEnd = -1;
        this.renderVisibleRows();
    },

    /**
     * Scroll to specific row index
     */
    scrollToRow(index) {
        if (!this.container) return;
        const targetScroll = index * this.ROW_HEIGHT;
        this.container.scrollTop = targetScroll;
    },

    /**
     * Get currently visible row indices
     */
    getVisibleRange() {
        return {
            start: this.visibleStart,
            end: this.visibleEnd,
            total: displayedData.length
        };
    }
};

// Expose globally
window.VirtualTable = VirtualTable;

// =====================================================
// INFINITE SCROLL LOGIC (Legacy - backup khi VirtualTable disabled)
// =====================================================
const INITIAL_RENDER_COUNT = 50;
const LOAD_MORE_COUNT = 50;
let renderedCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    const tableWrapper = document.getElementById("tableWrapper");
    if (tableWrapper) {
        tableWrapper.addEventListener('scroll', handleTableScroll);
    }
});

// Listen for failed orders updates to update comment column badges
window.addEventListener('failedOrdersUpdated', (event) => {
    const failedIds = new Set(event.detail?.failedOrderIds || []);
    console.log('[TABLE] Failed orders updated, updating comment badges:', failedIds.size);

    // Update comment column cells
    document.querySelectorAll('td[data-column="comments"][data-order-id]').forEach(td => {
        const orderId = td.getAttribute('data-order-id');
        const isFailed = failedIds.has(orderId);
        const currentlyShowingFailed = td.querySelector('.fa-exclamation-triangle') !== null;

        // Only update if state changed
        if (isFailed && !currentlyShowingFailed) {
            // Mark as failed with quick fix button
            td.innerHTML = `
                <button onclick="window.messageTemplateManager?.openQuickCommentReply('${orderId}')"
                    style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.2s;"
                    onmouseover="this.style.background='linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'; this.style.transform='scale(1.02)'"
                    onmouseout="this.style.background='linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'; this.style.transform='scale(1)'"
                    title="Click để gửi tin nhắn qua comment">
                    <i class="fas fa-exclamation-triangle" style="font-size: 10px;"></i>
                    <span>Gửi lại</span>
                    <i class="fas fa-comment-dots" style="font-size: 10px; margin-left: 2px;"></i>
                </button>`;
            td.title = '⚠️ Gửi tin nhắn thất bại - Click để gửi qua bình luận';
        } else if (!isFailed && currentlyShowingFailed) {
            // Clear failed state
            td.innerHTML = '−';
            td.style.color = '#9ca3af';
            td.title = 'Click để xem bình luận';
        }
    });

    // Update merged order comment badges
    document.querySelectorAll('.merged-detail-row[data-order-id]').forEach(row => {
        const orderId = row.getAttribute('data-order-id');
        const isCommentsColumn = row.closest('td[data-column="comments"]') !== null;
        if (!isCommentsColumn) return;

        const isFailed = failedIds.has(orderId);
        const badgeSpan = row.querySelector('.merged-badge-placeholder, span[style*="fef2f2"]');
        if (!badgeSpan) return;

        const currentlyShowingFailed = row.querySelector('.fa-exclamation-triangle') !== null;

        if (isFailed && !currentlyShowingFailed) {
            badgeSpan.outerHTML = `
                <button onclick="event.stopPropagation(); window.messageTemplateManager?.openQuickCommentReply('${orderId}')"
                    style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; color: #dc2626; font-size: 10px; font-weight: 500; cursor: pointer;"
                    title="Click để gửi lại qua comment">
                    <i class="fas fa-exclamation-triangle" style="font-size: 9px;"></i>
                    <span>Gửi lại</span>
                </button>`;
            row.title = '⚠️ Gửi tin nhắn thất bại - Click để gửi qua bình luận';
        } else if (!isFailed && currentlyShowingFailed) {
            badgeSpan.outerHTML = '<span class="merged-badge-placeholder" style="font-size: 12px; color: #9ca3af;">−</span>';
            row.title = '';
        }
    });
});

// Listen for sent orders updates to show green "Đã gửi" badge in messages column
window.addEventListener('sentOrdersUpdated', (event) => {
    const sentIds = new Set(event.detail?.sentOrderIds || []);
    const commentIds = new Set(event.detail?.sentViaCommentIds || []);
    console.log('[TABLE] Sent orders updated, updating message badges:', sentIds.size, '(via comment:', commentIds.size, ')');

    // Update messages column cells
    document.querySelectorAll('td[data-column="messages"][data-order-id]').forEach(td => {
        const orderId = td.getAttribute('data-order-id');
        const isSent = sentIds.has(orderId);
        const currentlyShowingSent = td.querySelector('.fa-check-circle, .fa-comment-dots') !== null;

        if (isSent && !currentlyShowingSent) {
            const isViaComment = commentIds.has(orderId);
            const icon = isViaComment ? 'fa-comment-dots' : 'fa-check-circle';
            const label = isViaComment ? 'Đã gửi (BL)' : 'Đã gửi';
            td.innerHTML = `
                <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #bbf7d0; border-radius: 6px; color: #16a34a; font-size: 11px; font-weight: 500;">
                    <i class="fas ${icon}" style="font-size: 10px;"></i> ${label}
                </span>`;
            td.title = '✅ Đã gửi tin nhắn';
            // Update click handler for via-comment orders
            if (isViaComment) {
                const existingOnclick = td.getAttribute('onclick') || '';
                td.setAttribute('onclick', existingOnclick.replace('openChatModal', 'openCommentModal'));
            }
        }
    });

    // Update merged order message badges
    document.querySelectorAll('.merged-detail-row[data-order-id]').forEach(row => {
        const orderId = row.getAttribute('data-order-id');
        const isMessagesColumn = row.closest('td[data-column="messages"]') !== null;
        if (!isMessagesColumn) return;

        const isSent = sentIds.has(orderId);
        const badgeSpan = row.querySelector('.merged-badge-placeholder');
        if (!badgeSpan || !isSent) return;

        const currentlyShowingSent = row.querySelector('.fa-check-circle, .fa-comment-dots') !== null;
        if (!currentlyShowingSent) {
            const isViaComment = commentIds.has(orderId);
            const icon = isViaComment ? 'fa-comment-dots' : 'fa-check-circle';
            const label = isViaComment ? 'Đã gửi (BL)' : 'Đã gửi';
            badgeSpan.outerHTML = `
                <span class="merged-sent-badge" style="display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 3px; color: #16a34a; font-size: 10px; font-weight: 500;">
                    <i class="fas ${icon}" style="font-size: 9px;"></i> ${label}
                </span>`;
            if (isViaComment) {
                const existingOnclick = row.getAttribute('onclick') || '';
                row.setAttribute('onclick', existingOnclick.replace('openChatModal', 'openCommentModal'));
            }
        }
    });
});

function handleTableScroll(e) {
    const { scrollTop, scrollHeight, clientHeight } = e.target;

    // Check if scrolled near bottom (within 200px)
    if (scrollTop + clientHeight >= scrollHeight - 200) {
        loadMoreRows();
    }
}

function loadMoreRows() {
    // Prevent appending during active render or if we have no more data
    if (isRendering || renderedCount >= displayedData.length) return;

    const tbody = document.getElementById("tableBody");
    if (!tbody) return; // Safety check

    const spacer = document.getElementById("table-spacer");

    // Remove spacer temporarily
    if (spacer) spacer.remove();

    // Calculate next batch
    const nextBatch = displayedData.slice(renderedCount, renderedCount + LOAD_MORE_COUNT);
    renderedCount += nextBatch.length;

    // Append new rows
    const fragment = document.createDocumentFragment();
    nextBatch.forEach(order => {
        const tr = document.createElement('tr');
        // Use a temporary container to parse HTML string
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<table><tbody>${createRowHTML(order)}</tbody></table>`;
        const newRow = tempDiv.querySelector('tr');
        if (newRow) {
            fragment.appendChild(newRow);
        }
    });

    tbody.appendChild(fragment);

    // Apply column visibility to newly added rows
    if (window.columnVisibility) {
        const settings = window.columnVisibility.load();
        window.columnVisibility.apply(settings);
    }

    // Add spacer back if still have more
    if (renderedCount < displayedData.length) {
        const newSpacer = document.createElement('tr');
        newSpacer.id = 'table-spacer';
        newSpacer.innerHTML = `<td colspan="17" style="text-align: center; padding: 20px; color: #6b7280;">
            <i class="fas fa-spinner fa-spin"></i> Đang tải thêm...
        </td>`;
        tbody.appendChild(newSpacer);
    }

    // ⚠️ DISABLED: batchFetchDebts - API limit 200 phones per request
    // const phonesToFetch = nextBatch.map(order => order.Telephone).filter(Boolean);
    // if (phonesToFetch.length > 0 && typeof batchFetchDebts === 'function') {
    //     batchFetchDebts(phonesToFetch);
    // }

    // Re-apply pending customer highlights to newly loaded rows
    if (window.newMessagesNotifier && window.newMessagesNotifier.reapply) {
        setTimeout(() => window.newMessagesNotifier.reapply(), 50);
    }
}

function renderByEmployee() {
    // Set rendering flag to prevent any race conditions
    isRendering = true;

    const tableContainer = document.getElementById('tableContainer');

    // If background loading is in progress, show loading placeholder and wait for completion
    // This ensures employee sections show complete data
    if (isLoadingInBackground) {
        console.log('[EMPLOYEE-VIEW] Waiting for background loading to complete...');

        // Hide the default table
        const defaultTableWrapper = tableContainer.querySelector('.table-wrapper');
        if (defaultTableWrapper) {
            defaultTableWrapper.style.display = 'none';
        }

        // Remove existing employee sections
        const existingSections = tableContainer.querySelectorAll('.employee-section');
        existingSections.forEach(section => section.remove());

        // Show loading placeholder
        let loadingPlaceholder = tableContainer.querySelector('.employee-loading-placeholder');
        if (!loadingPlaceholder) {
            loadingPlaceholder = document.createElement('div');
            loadingPlaceholder.className = 'employee-loading-placeholder';
            loadingPlaceholder.style.cssText = 'text-align: center; padding: 60px 20px; color: #6b7280;';
            loadingPlaceholder.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-bottom: 16px; display: block;"></i>
                <div style="font-size: 16px; font-weight: 500;">Đang tải dữ liệu đơn hàng...</div>
                <div style="font-size: 13px; margin-top: 8px;">Vui lòng đợi cho tới khi tải xong toàn bộ dữ liệu</div>
            `;
            tableContainer.appendChild(loadingPlaceholder);
        }

        isRendering = false;
        return; // performTableSearch() will be called again when loading completes
    }

    // Remove loading placeholder if exists
    const loadingPlaceholder = tableContainer.querySelector('.employee-loading-placeholder');
    if (loadingPlaceholder) {
        loadingPlaceholder.remove();
    }

    // Group data by employee
    const dataByEmployee = {};

    // Initialize groups for each employee
    employeeRanges.forEach(range => {
        dataByEmployee[range.name] = [];
    });

    // Add "Khác" category for orders without employee
    dataByEmployee['Khác'] = [];

    // Group orders by employee
    displayedData.forEach(order => {
        const employeeName = getEmployeeName(order.SessionIndex) || 'Khác';
        if (!dataByEmployee[employeeName]) {
            dataByEmployee[employeeName] = [];
        }
        dataByEmployee[employeeName].push(order);
    });

    // Sort each group by STT descending (largest to smallest)
    Object.keys(dataByEmployee).forEach(name => {
        dataByEmployee[name].sort((a, b) => (parseInt(b.SessionIndex) || 0) - (parseInt(a.SessionIndex) || 0));
    });

    // Get ordered list of employees — sort by max STT in their orders (descending)
    const orderedEmployees = employeeRanges
        .map(r => r.name)
        .filter(name => dataByEmployee[name] && dataByEmployee[name].length > 0)
        .sort((a, b) => {
            const maxA = Math.max(...dataByEmployee[a].map(o => parseInt(o.SessionIndex) || 0));
            const maxB = Math.max(...dataByEmployee[b].map(o => parseInt(o.SessionIndex) || 0));
            return maxB - maxA;
        });

    // Add "Khác" at the end if it has data
    if (dataByEmployee['Khác'].length > 0) {
        orderedEmployees.push('Khác');
    }

    // Hide the default table container (tableContainer already declared above)
    const defaultTableWrapper = tableContainer.querySelector('.table-wrapper');
    if (defaultTableWrapper) {
        defaultTableWrapper.style.display = 'none';
    }

    // Remove existing employee sections
    const existingSections = tableContainer.querySelectorAll('.employee-section');
    existingSections.forEach(section => section.remove());

    // Render each employee section
    orderedEmployees.forEach(employeeName => {
        const orders = dataByEmployee[employeeName];
        const totalAmount = orders.reduce((sum, order) => sum + (order.TotalAmount || 0), 0);
        const totalQuantity = orders.reduce((sum, order) => sum + (order.TotalQuantity || 0), 0);

        const section = document.createElement('div');
        section.className = 'employee-section';

        section.innerHTML = `
            <div class="employee-header">
                <div>
                    <div class="employee-name">
                        <i class="fas fa-user-circle"></i> ${employeeName}
                    </div>
                    <div class="employee-stats">
                        ${orders.length} đơn hàng • ${totalQuantity} sản phẩm • ${totalAmount.toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="employee-total">
                    ${orders.length} đơn
                </div>
            </div>
            <div class="employee-table-wrapper">
                <div class="table-wrapper">
                    <table class="table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" class="employee-select-all" data-employee="${employeeName}" /></th>
                                <th data-column="actions">Thao tác</th>
                                <th data-column="stt">STT</th>
                                <th data-column="employee" style="width: 90px;">Nhân viên</th>
                                <th data-column="tag">TAG</th>
                                <th data-column="order-code">Mã ĐH</th>
                                <th data-column="customer">Khách hàng</th>
                                <th data-column="phone">SĐT</th>
                                <th data-column="messages">Tin nhắn</th>
                                <th data-column="comments">Bình luận</th>
                                <th data-column="qr" style="width: 50px; text-align: center;">QR</th>
                                <th data-column="address">Địa chỉ</th>
                                <th data-column="notes">Ghi chú</th>
                                <th data-column="total">Tổng tiền</th>
                                <th data-column="quantity">SL</th>
                                <th data-column="created-date">Ngày tạo</th>
                                <th data-column="invoice-status" style="min-width: 140px;">Phiếu bán hàng</th>
                                <th data-column="status">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${orders.map(createRowHTML).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        tableContainer.appendChild(section);
    });

    // Add event listeners for employee select all checkboxes
    const employeeSelectAlls = tableContainer.querySelectorAll('.employee-select-all');
    employeeSelectAlls.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const isChecked = this.checked;
            const section = this.closest('.employee-section');
            const checkboxes = section.querySelectorAll('tbody input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) {
                    selectedOrderIds.add(cb.value);
                } else {
                    selectedOrderIds.delete(cb.value);
                }
            });

            // Update main selectAll checkbox state
            const mainSelectAll = document.getElementById('selectAll');
            if (mainSelectAll) {
                const allEmployeeSelectAlls = tableContainer.querySelectorAll('.employee-select-all');
                const allChecked = Array.from(allEmployeeSelectAlls).every(cb => cb.checked);
                mainSelectAll.checked = allChecked;
            }

            updateActionButtons();
        });
    });

    // ⚠️ DISABLED: batchFetchDebts - API limit 200 phones per request
    // const phonesToFetch = displayedData.map(order => order.Telephone).filter(Boolean);
    // if (phonesToFetch.length > 0 && typeof batchFetchDebts === 'function') {
    //     batchFetchDebts(phonesToFetch);
    // }

    // Clear rendering flag after render is complete
    isRendering = false;
}

function createRowHTML(order) {
    if (!order || !order.Id) return "";
    let tagsHTML = "";
    if (order.Tags) {
        try {
            const tags = JSON.parse(order.Tags);
            if (Array.isArray(tags)) {
                tagsHTML = parseOrderTags(order.Tags, order.Id, order.Code);
            }
        } catch (e) { }
    }
    const partnerStatusHTML = formatPartnerStatus(order.PartnerStatusText, order.PartnerId);
    const highlight = (text) => highlightSearchText(text || "", searchQuery);

    // Get messages and comments columns
    const messagesHTML = renderMessagesColumn(order);
    const commentsHTML = renderCommentsColumn(order);

    // Add watermark class for edited notes
    const rowClass = order.noteEdited ? 'note-edited' : '';

    // Check for merged orders
    const isMerged = order.MergedCount && order.MergedCount > 1;
    const mergedClass = isMerged ? 'merged-order-row' : '';
    const mergedIcon = isMerged ? '<i class="fas fa-link merged-icon" title="Đơn gộp"></i>' : '';

    // Get employee name for STT
    const employeeName = getEmployeeName(order.SessionIndex);
    const employeeHTML = employeeName
        ? `<span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${employeeName}</span>`
        : '<span style="color: #9ca3af;">−</span>';

    // Build actions cell HTML
    const actionsHTML = `
            <td data-column="actions">
                ${isMerged ? `
                    <div class="merged-edit-dropdown" style="position: relative; display: inline-block;">
                        <button class="btn-edit-icon" onclick="toggleMergedEditDropdown(this, event)" title="Chọn đơn hàng để chỉnh sửa">
                            <i class="fas fa-edit"></i>
                            <i class="fas fa-caret-down" style="font-size: 10px; margin-left: 2px;"></i>
                        </button>
                        <div class="merged-edit-options" style="display: none; position: absolute; left: 0; top: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; min-width: 100px;">
                            ${order.OriginalOrders.sort((a, b) => (parseInt(b.SessionIndex) || 0) - (parseInt(a.SessionIndex) || 0)).map(o => `
                                <div onclick="openEditModal('${o.Id}'); closeMergedEditDropdown(); event.stopPropagation();"
                                     style="padding: 8px 12px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #f3f4f6; transition: background 0.2s;"
                                     onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='white'">
                                    <span style="font-weight: 500;">STT ${o.SessionIndex}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : `
                    <button class="btn-edit-icon" onclick="openEditModal('${order.Id}')" title="Chỉnh sửa đơn hàng">
                        <i class="fas fa-edit"></i>
                    </button>
                `}
                ${order.noteEdited ? '<span class="note-edited-badge" style="margin-left: 4px;" title="Ghi chú đã được sửa">✏️</span>' : ''}
            </td>`;

    // Extract pageId from Facebook_PostId (format: pageId_postId)
    const pageId = order.Facebook_PostId ? order.Facebook_PostId.split('_')[0] : '';

    return `
        <tr class="${rowClass} ${mergedClass}" data-psid="${order.Facebook_ASUserId || ''}" data-page-id="${pageId}" data-order-id="${order.Id}">
            <td><input type="checkbox" value="${order.Id}" ${selectedOrderIds.has(order.Id) ? 'checked' : ''} /></td>
            ${actionsHTML}
            <td data-column="stt">
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <span>${order.SessionIndex || ""}</span>
                    ${mergedIcon}
                    ${ordersWithKPIBase.has(order.Id) ? '<span class="kpi-base-indicator" title="Đã lưu BASE tính KPI"><i class="fas fa-lock" style="color: #10b981; font-size: 10px;"></i></span>' : ''}
                </div>
            </td>
            <td data-column="employee" style="text-align: center;">${employeeHTML}</td>
            <td data-column="tag">
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                    <div style="display: flex; gap: 2px;">
                        <button class="tag-icon-btn" onclick="openTagModal('${order.Id}', '${order.Code}'); event.stopPropagation();" title="Quản lý tag" style="padding: 2px 6px;">
                            <i class="fas fa-tags"></i>
                        </button>
                        <button class="quick-tag-btn" onclick="quickAssignTag('${order.Id}', '${order.Code}', 'xử lý'); event.stopPropagation();" title="Xử lý + định danh">
                            <i class="fas fa-clock"></i>
                        </button>
                        <button class="quick-tag-btn quick-tag-ok" onclick="quickAssignTag('${order.Id}', '${order.Code}', 'ok'); event.stopPropagation();" title="OK + định danh">
                            <i class="fas fa-check"></i>
                        </button>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">${tagsHTML}</div>
                </div>
            </td>
            <td data-column="order-code">
                <span>${highlight(order.Code)}</span>
            </td>
            <td data-column="customer" ${typeof isRecentTransfer === 'function' && isRecentTransfer(order.Telephone) ? 'style="background: linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.03) 100%); position: relative;"' : ''}><div class="customer-name">${highlight(order.Name)}${typeof renderRecentTransferBadge === 'function' ? renderRecentTransferBadge(order.Telephone) : ''}</div>${partnerStatusHTML}</td>
            <td data-column="phone" style="text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                    ${order.Telephone ? `<i class="fas fa-copy copy-phone-btn" onclick="copyPhoneNumber('${order.Telephone}'); event.stopPropagation();" title="Copy SĐT" style="cursor: pointer; color: #9ca3af; font-size: 11px;"></i>` : ''}
                    <span>${highlight(order.Telephone)}</span>
                </div>
            </td>
            ${messagesHTML}
            ${commentsHTML}
            <td data-column="qr" style="text-align: center;">${renderQRColumn(order.Telephone)}</td>
            <td data-column="address">${highlight(order.Address)}</td>
            <td data-column="notes">${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(order.Note) : highlight(order.Note)}</td>
            ${renderMergedTotalColumn(order)}
            ${renderMergedQuantityColumn(order)}
            <td data-column="created-date">${new Date(order.DateCreated).toLocaleString("vi-VN")}</td>
            <td data-column="invoice-status">${window.renderInvoiceStatusCell ? window.renderInvoiceStatusCell(order) : '<span style="color: #9ca3af;">−</span>'}</td>
            <td data-column="status"><span class="status-badge ${order.Status === "Draft" ? "status-draft" : "status-order"}" style="cursor: pointer;" onclick="openOrderStatusModal('${order.Id}', '${order.Status}')" data-order-id="${order.Id}" title="Click để thay đổi trạng thái">${highlight(order.StatusText || order.Status)}</span></td>
        </tr>`;
}

// Helper: Format message preview with icon
function formatMessagePreview(chatInfo) {
    let displayMessage = '−'; // Default to dash
    let messageIcon = '';

    if (chatInfo.attachments && chatInfo.attachments.length > 0) {
        // Has attachments (images, files, etc.)
        const attachment = chatInfo.attachments[0];
        if (attachment.Type === 'image' || attachment.Type === 'photo') {
            displayMessage = 'Đã gửi ảnh';
            messageIcon = '📷';
        } else if (attachment.Type === 'video') {
            displayMessage = 'Đã gửi video';
            messageIcon = '🎥';
        } else if (attachment.Type === 'file') {
            displayMessage = 'Đã gửi file';
            messageIcon = '📎';
        } else if (attachment.Type === 'audio') {
            displayMessage = 'Đã gửi audio';
            messageIcon = '🎵';
        } else if (attachment.Type === 'sticker' || attachment.type === 'sticker' || attachment.sticker_id) {
            displayMessage = 'Đã gửi sticker';
            messageIcon = '🧸';
        } else if (attachment.Type === 'animated_image_share' || attachment.type === 'animated_image_share') {
            displayMessage = 'Đã gửi GIF';
            messageIcon = '🎞️';
        } else {
            displayMessage = 'Đã gửi tệp';
            messageIcon = '📎';
        }
    } else if (chatInfo.message) {
        // Text message
        displayMessage = chatInfo.message;
    }

    // Truncate message
    if (displayMessage.length > 30) {
        displayMessage = displayMessage.substring(0, 30) + '...';
    }

    // Return formatted message with icon
    return messageIcon ? `${messageIcon} ${displayMessage}` : displayMessage;
}

// Helper: Render multi-customer messages/comments (merged order with different customers)
// Shows multiple lines, one per customer with their largest STT
function renderMultiCustomerMessages(order, columnType = 'messages') {
    const rows = [];

    // For each customer group, find order with largest STT and get its message
    order.CustomerGroups.forEach(customerGroup => {
        // Get the order with largest STT (already sorted in customerGroups)
        const largestSTTOrder = customerGroup.orders[0]; // First order is largest STT

        // Find full order object from OriginalOrders
        const fullOrder = order.OriginalOrders.find(o => o.Id === largestSTTOrder.id);
        if (!fullOrder || !largestSTTOrder.psid || !largestSTTOrder.channelId) {
            return; // Skip this customer if no valid data
        }

        // Get message or comment
        const messageInfo = columnType === 'messages'
            ? window.chatDataManager.getLastMessageForOrder(fullOrder)
            : window.chatDataManager.getLastCommentForOrder(largestSTTOrder.channelId, largestSTTOrder.psid, fullOrder);

        // Format message preview
        const displayMessage = formatMessagePreview(messageInfo);
        const unreadBadge = messageInfo.hasUnread ? '<span class="unread-badge"></span>' : '';
        const fontWeight = messageInfo.hasUnread ? '700' : '400';
        const color = messageInfo.hasUnread ? '#111827' : '#6b7280';

        // Create click handler - use separate modals for messages and comments
        const clickHandler = columnType === 'messages'
            ? `openChatModal('${largestSTTOrder.id}', '${largestSTTOrder.channelId}', '${largestSTTOrder.psid}')`
            : `openCommentModal('${largestSTTOrder.id}', '${largestSTTOrder.channelId}', '${largestSTTOrder.psid}')`;

        rows.push(`
            <div class="multi-customer-message-row" onclick="${clickHandler}" style="border-bottom: 1px solid #e5e7eb; padding: 6px 8px; cursor: pointer; transition: background-color 0.2s;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 3px; font-weight: 500;">
                    ${customerGroup.name} • STT ${largestSTTOrder.stt}
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    ${unreadBadge}
                    <span style="font-size: 13px; font-weight: ${fontWeight}; color: ${color};">
                        ${displayMessage}
                    </span>
                </div>
                ${messageInfo.unreadCount > 0 ? `<div style="font-size: 11px; color: #ef4444; font-weight: 600; margin-top: 2px;">${messageInfo.unreadCount} tin mới</div>` : ''}
            </div>
        `);
    });

    // If no rows, show dash
    if (rows.length === 0) {
        return `<td data-column="${columnType}" style="text-align: center; color: #9ca3af;">−</td>`;
    }

    return `
        <td data-column="${columnType}" style="padding: 0; vertical-align: top;">
            <div style="max-height: 200px; overflow-y: auto;">
                ${rows.join('')}
            </div>
        </td>
    `;
}

// Helper: Render single customer message/comment (merged order with same customer)
// Shows only the message/comment from the order with largest STT
function renderSingleCustomerMessage(order, columnType = 'messages') {
    // Get the order with largest STT (stored in TargetOrderId)
    const targetOrder = order.OriginalOrders.find(o => o.Id === order.TargetOrderId);

    if (!targetOrder || !targetOrder.Facebook_ASUserId) {
        return `<td data-column="${columnType}" style="text-align: center; color: #9ca3af;">−</td>`;
    }

    // Get chat info for this specific order
    const chatInfo = window.chatDataManager.getChatInfoForOrder(targetOrder);

    if (!chatInfo.psid || !chatInfo.channelId) {
        return `<td data-column="${columnType}" style="text-align: center; color: #9ca3af;">−</td>`;
    }

    // Get message or comment based on type
    const messageInfo = columnType === 'messages'
        ? window.chatDataManager.getLastMessageForOrder(targetOrder)
        : window.chatDataManager.getLastCommentForOrder(chatInfo.channelId, chatInfo.psid, targetOrder);

    // Render using the existing renderChatColumnWithData function
    // But we need to pass the targetOrder ID for the click handler
    return renderChatColumnWithData(targetOrder, messageInfo, chatInfo.channelId, chatInfo.psid, columnType);
}

// =====================================================
// SIMPLIFIED MESSAGE/COMMENT COLUMNS
// Only shows badge "X MỚI" from pending_customers database
// Content is set by new-messages-notifier.js after table render
// =====================================================

// Render messages column - simple placeholder, badge added by notifier
function renderMessagesColumn(order) {
    // Extract channelId from Facebook_PostId (format: pageId_postId)
    const channelId = order.Facebook_PostId ? order.Facebook_PostId.split('_')[0] : '';
    const psid = order.Facebook_ASUserId || '';

    // If no PSID or Channel ID, show dash (no click handler)
    if (!psid || !channelId) {
        return '<td data-column="messages" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Render clickable cell with placeholder "-"
    // Badge "X MỚI" will be set by new-messages-notifier.js based on pending_customers data
    const clickHandler = `openChatModal('${order.Id}', '${channelId}', '${psid}')`;

    // Check if this order was already sent via bulk message
    const isSent = window.messageTemplateManager?.isOrderSent(order.Id);
    if (isSent) {
        // If sent via comment, click should open comment modal instead of chat
        const isSentViaComment = window.messageTemplateManager?.isOrderSentViaComment(order.Id);
        const sentClickHandler = isSentViaComment
            ? `openCommentModal('${order.Id}', '${channelId}', '${psid}')`
            : clickHandler;
        const sentIcon = isSentViaComment ? 'fa-comment-dots' : 'fa-check-circle';
        const sentLabel = isSentViaComment ? 'Đã gửi (BL)' : 'Đã gửi';
        return `<td data-column="messages" data-order-id="${order.Id}" onclick="${sentClickHandler}" style="cursor: pointer; text-align: center;">
            <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #bbf7d0; border-radius: 6px; color: #16a34a; font-size: 11px; font-weight: 500;">
                <i class="fas ${sentIcon}" style="font-size: 10px;"></i> ${sentLabel}
            </span>
        </td>`;
    }

    return `<td data-column="messages" data-order-id="${order.Id}" onclick="${clickHandler}" style="cursor: pointer; text-align: center; color: #9ca3af;" title="Click để xem tin nhắn">−</td>`;
}

// Render comments column - simple placeholder, badge added by notifier
// Also shows warning badge for failed message orders
function renderCommentsColumn(order) {
    // Extract channelId from Facebook_PostId (format: pageId_postId)
    const channelId = order.Facebook_PostId ? order.Facebook_PostId.split('_')[0] : '';
    const psid = order.Facebook_ASUserId || '';

    // If no PSID or Channel ID, show dash (no click handler)
    if (!psid || !channelId) {
        return '<td data-column="comments" style="text-align: center; color: #9ca3af;">−</td>';
    }

    // Check if this order failed message sending
    const isFailed = window.messageTemplateManager?.isOrderFailed(order.Id);

    // Render clickable cell with placeholder "-"
    // Badge "X MỚI" will be set by new-messages-notifier.js based on pending_customers data
    const clickHandler = `openCommentModal('${order.Id}', '${channelId}', '${psid}')`;

    if (isFailed) {
        // Show clickable retry button for failed orders
        return `<td data-column="comments" data-order-id="${order.Id}"
            style="text-align: center; position: relative;">
            <button onclick="event.stopPropagation(); window.messageTemplateManager?.openQuickCommentReply('${order.Id}')"
                style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.2s;"
                onmouseover="this.style.background='linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'; this.style.transform='scale(1.02)'"
                onmouseout="this.style.background='linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'; this.style.transform='scale(1)'"
                title="Click để gửi lại tin nhắn">
                <i class="fas fa-exclamation-triangle" style="font-size: 10px;"></i>
                <span>Gửi lại</span>
                <i class="fas fa-redo" style="font-size: 9px; margin-left: 2px;"></i>
            </button>
        </td>`;
    }

    return `<td data-column="comments" data-order-id="${order.Id}" onclick="${clickHandler}" style="cursor: pointer; text-align: center; color: #9ca3af;" title="Click để xem bình luận">−</td>`;
}

// #region ═══════════════════════════════════════════════════════════════════════
// ║                    SECTION 9: MERGED ORDER COLUMNS                          ║
// ║                            search: #MERGED                                  ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// MERGED ORDER COLUMNS - Messages & Comments (STT-based) #MERGED
// Simplified: Only shows placeholder, badges added by notifier
// =====================================================

function renderMergedMessagesColumn(order, columnType = 'messages') {
    // Sort by STT descending (largest first)
    const sortedOrders = [...order.OriginalOrders].sort((a, b) =>
        (parseInt(b.SessionIndex) || 0) - (parseInt(a.SessionIndex) || 0)
    );

    const rows = sortedOrders.map(originalOrder => {
        // Extract channelId and psid
        const channelId = originalOrder.Facebook_PostId ? originalOrder.Facebook_PostId.split('_')[0] : '';
        const psid = originalOrder.Facebook_ASUserId || '';

        // Create click handler
        let clickHandler = channelId && psid
            ? (columnType === 'messages'
                ? `openChatModal('${originalOrder.Id}', '${channelId}', '${psid}')`
                : `openCommentModal('${originalOrder.Id}', '${channelId}', '${psid}')`)
            : '';

        const cursorStyle = clickHandler ? 'cursor: pointer;' : 'cursor: default;';
        const hoverStyle = clickHandler ? `onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'"` : '';

        // Check if this order failed message sending (only for comments column)
        const isFailed = columnType === 'comments' && window.messageTemplateManager?.isOrderFailed(originalOrder.Id);
        // Check if this order was already sent (only for messages column)
        const isSent = columnType === 'messages' && window.messageTemplateManager?.isOrderSent(originalOrder.Id);
        const isSentViaComment = isSent && window.messageTemplateManager?.isOrderSentViaComment(originalOrder.Id);

        // Override click handler for sent-via-comment orders to open comment modal
        if (isSentViaComment && channelId && psid) {
            clickHandler = `openCommentModal('${originalOrder.Id}', '${channelId}', '${psid}')`;
        }

        // Badge content - show warning for failed orders, green badge for sent orders
        let badgeContent;
        if (isFailed) {
            badgeContent = `<span style="display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 3px; color: #dc2626; font-size: 10px; font-weight: 500;">
                <i class="fas fa-exclamation-triangle" style="font-size: 9px;"></i> Cần gửi
               </span>`;
        } else if (isSent) {
            const sentIcon = isSentViaComment ? 'fa-comment-dots' : 'fa-check-circle';
            const sentLabel = isSentViaComment ? 'Đã gửi (BL)' : 'Đã gửi';
            badgeContent = `<span class="merged-sent-badge" style="display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 3px; color: #16a34a; font-size: 10px; font-weight: 500;">
                <i class="fas ${sentIcon}" style="font-size: 9px;"></i> ${sentLabel}
               </span>`;
        } else {
            badgeContent = '<span class="merged-badge-placeholder" style="font-size: 12px; color: #9ca3af;">−</span>';
        }

        const titleAttr = isFailed
            ? 'title="⚠️ Gửi tin nhắn thất bại - Click để gửi qua bình luận"'
            : '';

        return `
            <div class="merged-detail-row" data-psid="${psid}" data-page-id="${channelId}" data-stt="${originalOrder.SessionIndex}" data-order-id="${originalOrder.Id}"
                 ${clickHandler ? `onclick="${clickHandler}; event.stopPropagation();"` : ''}
                 style="display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; min-height: 28px; ${cursorStyle} transition: background 0.2s;"
                 ${hoverStyle} ${titleAttr}>
                <span style="font-size: 11px; color: #6b7280; font-weight: 500; min-width: 55px; flex-shrink: 0;">STT ${originalOrder.SessionIndex}:</span>
                ${badgeContent}
            </div>
        `;
    }).join('');

    return `<td data-column="${columnType}" style="padding: 0; vertical-align: top;">${rows}</td>`;
}

// =====================================================
// MERGED ORDER COLUMNS - Quantity & Total Amount
// =====================================================

// Render merged quantity column with individual STT values
function renderMergedQuantityColumn(order) {
    // Non-merged orders: simple display
    if (!order.IsMerged || !order.OriginalOrders || order.OriginalOrders.length <= 1) {
        return `<td data-column="quantity">${order.TotalQuantity || 0}</td>`;
    }

    // Sort by STT descending (largest first)
    const sortedOrders = [...order.OriginalOrders].sort((a, b) =>
        (parseInt(b.SessionIndex) || 0) - (parseInt(a.SessionIndex) || 0)
    );

    const rows = sortedOrders.map(o => `
        <div class="merged-detail-row" onclick="openEditModal('${o.Id}'); event.stopPropagation();" 
             style="display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; min-height: 28px; cursor: pointer; transition: background 0.2s;"
             onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
            <span style="font-size: 11px; color: #6b7280; font-weight: 500; min-width: 55px; flex-shrink: 0;">STT ${o.SessionIndex}:</span>
            <span style="font-weight: 600;">${o.TotalQuantity || 0}</span>
        </div>
    `).join('');

    return `<td data-column="quantity" style="padding: 0; vertical-align: top;">${rows}</td>`;
}

// Render merged total amount column with individual STT values
function renderMergedTotalColumn(order) {
    // Non-merged orders: simple display
    if (!order.IsMerged || !order.OriginalOrders || order.OriginalOrders.length <= 1) {
        return `<td data-column="total">${(order.TotalAmount || 0).toLocaleString("vi-VN")}đ</td>`;
    }

    // Sort by STT descending (largest first)
    const sortedOrders = [...order.OriginalOrders].sort((a, b) =>
        (parseInt(b.SessionIndex) || 0) - (parseInt(a.SessionIndex) || 0)
    );

    const rows = sortedOrders.map(o => `
        <div class="merged-detail-row" onclick="openEditModal('${o.Id}'); event.stopPropagation();" 
             style="display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; min-height: 28px; cursor: pointer; transition: background 0.2s;"
             onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
            <span style="font-size: 11px; color: #6b7280; font-weight: 500; min-width: 55px; flex-shrink: 0;">STT ${o.SessionIndex}:</span>
            <span style="font-weight: 600; color: #3b82f6;">${(o.TotalAmount || 0).toLocaleString("vi-VN")}đ</span>
        </div>
    `).join('');

    return `<td data-column="total" style="padding: 0; vertical-align: top;">${rows}</td>`;
}

// Helper function to render chat column with data (for both messages and comments)
function renderChatColumnWithData(order, chatInfo, channelId, psid, columnType = 'messages') {
    // Format message based on type
    let displayMessage = '−'; // Default to dash
    let messageIcon = '';

    if (chatInfo.attachments && chatInfo.attachments.length > 0) {
        // Has attachments (images, files, etc.)
        const attachment = chatInfo.attachments[0];
        if (attachment.Type === 'image' || attachment.Type === 'photo') {
            displayMessage = 'Đã gửi ảnh';
            messageIcon = '📷';
        } else if (attachment.Type === 'video') {
            displayMessage = 'Đã gửi video';
            messageIcon = '🎥';
        } else if (attachment.Type === 'file') {
            displayMessage = 'Đã gửi file';
            messageIcon = '📎';
        } else if (attachment.Type === 'audio') {
            displayMessage = 'Đã gửi audio';
            messageIcon = '🎵';
        } else if (attachment.Type === 'sticker' || attachment.type === 'sticker' || attachment.sticker_id) {
            displayMessage = 'Đã gửi sticker';
            messageIcon = '🧸';
        } else if (attachment.Type === 'animated_image_share' || attachment.type === 'animated_image_share') {
            displayMessage = 'Đã gửi GIF';
            messageIcon = '🎞️';
        } else {
            displayMessage = 'Đã gửi tệp';
            messageIcon = '📎';
        }
    } else if (chatInfo.message) {
        // Text message
        displayMessage = chatInfo.message;
    }

    // Truncate message
    if (displayMessage.length > 30) {
        displayMessage = displayMessage.substring(0, 30) + '...';
    }

    // Styling based on unread status
    const isUnread = chatInfo.hasUnread;
    const fontWeight = isUnread ? '700' : '400';
    const color = isUnread ? '#111827' : '#6b7280';
    const unreadBadge = isUnread ? `<span class="unread-badge"></span>` : '';

    // Click handler
    // For merged orders, use the TargetOrderId (order with largest STT) instead of the combined Id
    const orderIdToUse = order.IsMerged && order.TargetOrderId ? order.TargetOrderId : order.Id;
    // Use separate modals: openChatModal for messages, openCommentModal for comments
    const clickHandler = columnType === 'messages'
        ? `openChatModal('${orderIdToUse}', '${channelId}', '${psid}')`
        : `openCommentModal('${orderIdToUse}', '${channelId}', '${psid}')`;

    const tooltipText = columnType === 'comments'
        ? 'Click để xem bình luận'
        : 'Click để xem toàn bộ tin nhắn';

    return `
        <td data-column="${columnType}" onclick="${clickHandler}" style="cursor: pointer;" title="${tooltipText}">
            <div style="display: flex; align-items: center; gap: 6px;">
                ${unreadBadge}
                <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 13px; font-weight: ${fontWeight}; color: ${color};">
                        ${messageIcon} ${displayMessage}
                    </span>
                    ${chatInfo.unreadCount > 0 ? `<span style="font-size: 11px; color: #ef4444; font-weight: 600;">${chatInfo.unreadCount} tin mới</span>` : ''}
                </div>
            </div>
        </td>`;
}

function parseOrderTags(tagsJson, orderId, orderCode) {
    try {
        const tags = JSON.parse(tagsJson);
        if (!Array.isArray(tags) || tags.length === 0) return "";

        // Escape function for safe onclick attributes
        const escapeAttr = (str) => String(str).replace(/'/g, "\\'").replace(/"/g, "&quot;");

        return tags
            .map(
                (tag) =>
                    `<div style="display: inline-flex; align-items: center; gap: 2px;">
                        <span class="order-tag" style="background-color: ${tag.Color || "#6b7280"}; cursor: pointer;" onclick="openTagModal('${escapeAttr(orderId)}', '${escapeAttr(orderCode)}'); event.stopPropagation();" title="Quản lý tag">${tag.Name || ""}</span>
                        <button class="tag-remove-btn" onclick="quickRemoveTag('${escapeAttr(orderId)}', '${escapeAttr(orderCode)}', '${escapeAttr(tag.Id)}'); event.stopPropagation();" title="Xóa tag này">×</button>
                    </div>`,
            )
            .join("");
    } catch (e) {
        return "";
    }
}

function formatPartnerStatus(statusText, partnerId) {
    if (!statusText) return "";
    const statusColors = {
        "Bình thường": "#5cb85c",
        "Bom hàng": "#d1332e",
        "Cảnh báo": "#f0ad4e",
        "Khách sỉ": "#5cb85c",
        "Nguy hiểm": "#d9534f",
        "Thân thiết": "#5bc0de",
        Vip: "#337ab7",
        VIP: "#5bc0deff",
    };
    const color = statusColors[statusText] || "#6b7280";
    const cursorStyle = partnerId ? 'cursor: pointer;' : '';
    const onclickAttr = partnerId ? `onclick="openPartnerStatusModal('${partnerId}', '${statusText}')"` : '';
    const titleAttr = partnerId ? 'title="Click để thay đổi trạng thái"' : '';
    const dataAttr = partnerId ? `data-partner-id="${partnerId}"` : '';

    return `<span class="partner-status" style="background-color: ${color}; ${cursorStyle}" ${onclickAttr} ${titleAttr} ${dataAttr}>${statusText}</span>`;
}

// --- Partner Status Modal Logic ---

const PARTNER_STATUS_OPTIONS = [
    { value: "#5cb85c", text: "Bình thường" },
    { value: "#d1332e", text: "Bom hàng" },
    { value: "#f0ad4e", text: "Cảnh báo" },
    { value: "#5cb85c", text: "Khách sỉ" },
    { value: "#d9534f", text: "Nguy hiểm" },
    { value: "#5bc0de", text: "Thân thiết" },
    { value: "#337ab7", text: "Vip" },
    { value: "#5bc0deff", text: "VIP" }
];

function openPartnerStatusModal(partnerId, currentStatus) {
    const modal = document.getElementById('partnerStatusModal');
    const container = document.getElementById('partnerStatusOptions');
    if (!modal || !container) return;

    // Populate options
    container.innerHTML = '';
    PARTNER_STATUS_OPTIONS.forEach(option => {
        const btn = document.createElement('div');
        btn.className = 'status-btn';
        if (option.text === currentStatus) btn.classList.add('selected');

        btn.innerHTML = `
            <span class="status-color-dot" style="background-color: ${option.value};"></span>
            <span class="status-text">${option.text}</span>
        `;
        btn.onclick = () => updatePartnerStatus(partnerId, option.value, option.text);
        container.appendChild(btn);
    });

    modal.classList.add('show');
}

function closePartnerStatusModal() {
    const modal = document.getElementById('partnerStatusModal');
    if (modal) modal.classList.remove('show');
}

async function updatePartnerStatus(partnerId, color, text) {
    closePartnerStatusModal();

    // Optimistic update (optional, but good for UX)
    // For now, we'll wait for API success to ensure consistency

    try {
        const url = `${API_CONFIG.WORKER_URL}/api/odata/Partner(${partnerId})/ODataService.UpdateStatus`;
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'content-type': 'application/json;charset=UTF-8',
                'accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify({ status: `${color}_${text}` })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Success
        window.notificationManager.show('Cập nhật trạng thái thành công', 'success');

        // Update local data
        allData.forEach(order => {
            if (String(order.PartnerId) === String(partnerId)) {
                order.PartnerStatus = text;
                order.PartnerStatusText = text;
            }
        });

        // Inline UI Update
        const badges = document.querySelectorAll(`.partner-status[data-partner-id="${partnerId}"]`);
        badges.forEach(badge => {
            badge.style.backgroundColor = color;
            badge.innerText = text;
            badge.setAttribute('onclick', `openPartnerStatusModal('${partnerId}', '${text}')`);
        });

    } catch (error) {
        console.error('[PARTNER] Update status failed:', error);
        window.notificationManager.show('Cập nhật trạng thái thất bại: ' + error.message, 'error');
    }
}

// --- Order Status Modal Logic ---

const ORDER_STATUS_OPTIONS = [
    { value: "Đơn hàng", text: "Đơn hàng", color: "#5cb85c" },
    { value: "Hủy", text: "Huỷ bỏ", color: "#d1332e" },
    { value: "Nháp", text: "Nháp", color: "#f0ad4e" }
];

function openOrderStatusModal(orderId, currentStatus) {
    const modal = document.getElementById('orderStatusModal');
    const container = document.getElementById('orderStatusOptions');
    if (!modal || !container) return;

    // Populate options
    container.innerHTML = '';
    ORDER_STATUS_OPTIONS.forEach(option => {
        const btn = document.createElement('div');
        btn.className = 'status-btn';
        if (option.value === currentStatus) btn.classList.add('selected');

        btn.innerHTML = `
            <span class="status-color-dot" style="background-color: ${option.color};"></span>
            <span class="status-text">${option.text}</span>
        `;
        btn.onclick = () => updateOrderStatus(orderId, option.value, option.text, option.color);
        container.appendChild(btn);
    });

    modal.classList.add('show');
}

function closeOrderStatusModal() {
    const modal = document.getElementById('orderStatusModal');
    if (modal) modal.classList.remove('show');
}

async function updateOrderStatus(orderId, newValue, newText, newColor) {
    closeOrderStatusModal();

    try {
        const url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/OdataService.UpdateStatusSaleOnline?Id=${orderId}&Status=${encodeURIComponent(newValue)}`;
        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'content-type': 'application/json;charset=utf-8',
                'accept': '*/*'
            },
            body: null
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Success
        window.notificationManager.show('Cập nhật trạng thái đơn hàng thành công', 'success');

        // Update local data
        allData.forEach(order => {
            if (String(order.Id) === String(orderId)) {
                order.Status = newValue;
                order.StatusText = newText;
            }
        });

        // Inline UI Update
        const badges = document.querySelectorAll(`.status-badge[data-order-id="${orderId}"]`);
        badges.forEach(badge => {
            badge.className = `status-badge ${newValue === "Draft" ? "status-draft" : "status-order"}`;
            // Update color manually if needed, or rely on class. 
            // The existing logic uses classes, but we might want to force the color if it's custom.
            // For now, let's just update the text and rely on re-render or class.
            // Actually, the user provided specific colors for the options.
            // Let's apply the color directly for immediate feedback.
            badge.style.backgroundColor = newColor; // This might override class styles
            badge.innerText = newText || newValue;
            badge.setAttribute('onclick', `openOrderStatusModal('${orderId}', '${newValue}')`);
        });

        // If we want to be safe and consistent with filters:
        // performTableSearch(); // Optional, but inline is faster.

    } catch (error) {
        console.error('[ORDER] Update status failed:', error);
        window.notificationManager.show('Cập nhật trạng thái thất bại: ' + error.message, 'error');
    }
}

function updateStats() {
    const totalAmount = displayedData.reduce(
        (sum, order) => sum + (order.TotalAmount || 0),
        0,
    );

    // Calculate merged order statistics
    const mergedOrders = displayedData.filter(order => order.IsMerged === true);
    const totalOriginalOrders = displayedData.reduce((sum, order) => {
        return sum + (order.MergedCount || 1);
    }, 0);

    // Update total orders count
    document.getElementById("totalOrdersCount").textContent =
        filteredData.length.toLocaleString("vi-VN");

    // Update merged orders info
    const mergedInfoElement = document.getElementById("mergedOrdersInfo");
    if (mergedOrders.length > 0) {
        mergedInfoElement.textContent =
            `${mergedOrders.length} đơn gộp (${totalOriginalOrders} đơn gốc)`;
        mergedInfoElement.style.color = "#f59e0b"; // Orange color for emphasis
    } else {
        mergedInfoElement.textContent = "-";
        mergedInfoElement.style.color = "#9ca3af"; // Gray color
    }

    document.getElementById("displayedOrdersCount").textContent =
        displayedData.length.toLocaleString("vi-VN");
    document.getElementById("totalAmountSum").textContent =
        totalAmount.toLocaleString("vi-VN") + "đ";
    document.getElementById("loadingProgress").textContent = "100%";
}

function updatePageInfo() {
    const totalDisplayed = displayedData.length;
    const totalFiltered = filteredData.length;
    document.getElementById("pageInfo").textContent =
        `Hiển thị ${totalDisplayed.toLocaleString("vi-VN")} / ${totalFiltered.toLocaleString("vi-VN")}`;
    document.getElementById("scrollHint").textContent =
        totalDisplayed > 0 ? "✅ Đã hiển thị tất cả" : "";
}

// =====================================================
// EVENT HANDLERS & HELPERS
// =====================================================
function sendDataToTab2() {
    // Only send metadata via postMessage (Tab2 can request full data if needed)
    const filterMeta = {
        startDate: convertToUTC(document.getElementById("startDate").value),
        endDate: convertToUTC(document.getElementById("endDate").value),
        campaignId: selectedCampaign?.campaignId || null,
        campaignName: selectedCampaign?.displayName || "",
        totalRecords: allData.length,
        timestamp: new Date().toISOString(),
    };

    if (window.parent) {
        window.parent.postMessage(
            { type: "FILTER_CHANGED", filter: filterMeta },
            "*",
        );
    }

    // Save only metadata to localStorage (no full data - prevents quota exceeded)
    try {
        localStorage.setItem("orders_tab1_filter_data", JSON.stringify(filterMeta));
    } catch (e) {
        console.error('[TAB1] localStorage error:', e);
    }
}

// =====================================================
// SELECTION MANAGEMENT (STATE-BASED)
// =====================================================

function handleSelectAll() {
    const isChecked = document.getElementById("selectAll").checked;

    if (isChecked) {
        // Select ALL displayed data (not just visible rows)
        displayedData.forEach(order => {
            selectedOrderIds.add(String(order.Id));
        });
    } else {
        // Deselect ALL
        selectedOrderIds.clear();
    }

    // Update visible checkboxes in main table
    const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]');
    checkboxes.forEach((cb) => {
        cb.checked = isChecked;
    });

    // Update checkboxes in employee sections (when grouped by employee)
    const employeeSections = document.querySelectorAll('.employee-section tbody input[type="checkbox"]');
    employeeSections.forEach((cb) => {
        cb.checked = isChecked;
    });

    // Also update employee select all checkboxes
    const employeeSelectAlls = document.querySelectorAll('.employee-select-all');
    employeeSelectAlls.forEach(cb => {
        cb.checked = isChecked;
    });

    // Trigger update action buttons
    updateActionButtons();
}

// Global event listener for checkbox changes (Delegation)
document.addEventListener('change', function (e) {
    if (e.target.matches('tbody input[type="checkbox"]')) {
        const orderId = e.target.value;
        if (e.target.checked) {
            selectedOrderIds.add(orderId);
        } else {
            selectedOrderIds.delete(orderId);
            // Uncheck "Select All" if one is unchecked
            document.getElementById("selectAll").checked = false;
        }
        updateActionButtons();
    }
});

// =====================================================
// UPDATE ACTION BUTTONS VISIBILITY
// =====================================================
function updateActionButtons() {
    const actionButtonsSection = document.getElementById('actionButtonsSection');
    const selectedCountSpan = document.getElementById('selectedOrdersCount');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const createSaleButtonBtn = document.getElementById('createSaleButtonBtn');
    const createFastSaleBtn = document.getElementById('createFastSaleBtn');
    const checkedCount = selectedOrderIds.size;

    if (checkedCount > 0) {
        actionButtonsSection.style.display = 'flex';
        selectedCountSpan.textContent = checkedCount.toLocaleString('vi-VN');
        document.body.classList.add('action-bar-visible');
    } else {
        actionButtonsSection.style.display = 'none';
        document.body.classList.remove('action-bar-visible');
    }

    // Show send message button when any orders are selected
    if (sendMessageBtn) {
        sendMessageBtn.style.display = checkedCount > 0 ? 'flex' : 'none';
    }

    // Show "Tạo nút bán hàng" button only when exactly 1 order is selected
    if (createSaleButtonBtn) {
        createSaleButtonBtn.style.display = checkedCount === 1 ? 'flex' : 'none';
    }

    // Show "Tạo nhanh PBH" button when more than 1 order is selected
    if (createFastSaleBtn) {
        createFastSaleBtn.style.display = checkedCount > 1 ? 'flex' : 'none';
    }

    // Show "Xóa Tag" button when any orders are selected
    const bulkRemoveTagBtn = document.getElementById('bulkRemoveTagBtn');
    if (bulkRemoveTagBtn) {
        bulkRemoveTagBtn.style.display = checkedCount > 0 ? 'flex' : 'none';
    }
}

// =====================================================
// DESELECT ALL ORDERS
// Bỏ chọn tất cả các checkbox đã chọn
// =====================================================
function deselectAllOrders() {
    // Clear the selected IDs set
    selectedOrderIds.clear();

    // Uncheck all checkboxes in the main table
    const mainCheckboxes = document.querySelectorAll('#tableBody input[type="checkbox"]');
    mainCheckboxes.forEach(cb => {
        cb.checked = false;
    });

    // Also uncheck in employee sections
    const employeeCheckboxes = document.querySelectorAll('.employee-section input[type="checkbox"]');
    employeeCheckboxes.forEach(cb => {
        cb.checked = false;
    });

    // Uncheck all employee "Select All" checkboxes
    const employeeSelectAlls = document.querySelectorAll('.employee-select-all');
    employeeSelectAlls.forEach(cb => {
        cb.checked = false;
    });

    // Uncheck main "Select All" checkbox
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }

    // Update action buttons visibility (will hide the section)
    updateActionButtons();

    console.log('[DESELECT] All orders deselected');
}

async function handleClearCache() {
    const confirmed = await window.notificationManager.confirm(
        "Bạn có chắc muốn xóa toàn bộ cache?",
        "Xác nhận xóa cache"
    );
    if (confirmed) {
        window.cacheManager.clear("orders");
        window.cacheManager.clear("campaigns");
        window.notificationManager.success("Đã xóa cache");
        location.reload();
    }
}

function showLoading(show) {
    document.getElementById("loadingOverlay").classList.toggle("show", show);
}

function showInfoBanner(text) {
    const banner = document.getElementById("infoBanner");
    document.getElementById("infoText").textContent = text;
    banner.style.display = "flex";
    setTimeout(() => (banner.style.display = "none"), 5000);
}

function showSaveIndicator(type, message) {
    const indicator = document.getElementById("saveIndicator");
    const text = document.getElementById("saveIndicatorText");
    const icon = indicator.querySelector("i");
    indicator.className = "save-indicator " + type;
    text.textContent = message;
    icon.className =
        type === "success"
            ? "fas fa-check-circle"
            : "fas fa-exclamation-circle";
    indicator.classList.add("show");
    setTimeout(() => indicator.classList.remove("show"), 3000);
}

// ===============================================
// EDIT ORDER MODAL
// ===============================================
(function initEditModal() {
    if (document.getElementById("editOrderModal")) return;
    const modalHTML = `
        <div id="editOrderModal" class="edit-modal">
            <div class="edit-modal-content">
                <div class="edit-modal-header">
                    <h3><i class="fas fa-edit"></i> Sửa đơn hàng <span class="order-code" id="modalOrderCode">...</span></h3>
                    <button class="edit-modal-close" onclick="closeEditModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="edit-tabs">
                    <button class="edit-tab-btn active" onclick="switchEditTab('info')"><i class="fas fa-user"></i> Thông tin liên hệ</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('products')"><i class="fas fa-box"></i> Sản phẩm (<span id="editProductCount">0</span>)</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('delivery')"><i class="fas fa-shipping-fast"></i> Thông tin giao hàng</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('live')"><i class="fas fa-video"></i> Lịch sử đơn live</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('invoices')"><i class="fas fa-file-invoice-dollar"></i> Thông tin hóa đơn</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('invoice_history')"><i class="fas fa-history"></i> Lịch sử hóa đơn</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('history')"><i class="fas fa-clock"></i> Lịch sử chỉnh sửa</button>
                </div>
                <div class="edit-modal-body" id="editModalBody"><div class="loading-state"><div class="loading-spinner"></div></div></div>
                <div class="edit-modal-footer">
                    <div class="modal-footer-left"><i class="fas fa-info-circle"></i> Cập nhật lần cuối: <span id="lastUpdated">...</span></div>
                    <div class="modal-footer-right">
                        <button class="btn-modal btn-modal-print" onclick="printOrder()"><i class="fas fa-print"></i> In đơn</button>
                        <button class="btn-modal btn-modal-cancel" onclick="closeEditModal()"><i class="fas fa-times"></i> Đóng</button>
                        <button class="btn-modal btn-modal-save" onclick="saveAllOrderChanges()"><i class="fas fa-save"></i> Lưu tất cả thay đổi</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
})();

