// =====================================================
// OVERVIEW - MODALS: Modal Dialog Functions
// =====================================================

// MODAL FUNCTIONS
// =====================================================

/**
 * Open add tag modal
 */
function openAddTagModal() {
    const modal = document.getElementById('addTagModal');
    modal.classList.add('show');
    renderTagList();
}

/**
 * Close add tag modal
 */
function closeAddTagModal() {
    const modal = document.getElementById('addTagModal');
    modal.classList.remove('show');
}

/**
 * Render tag list in add tag modal
 */
function renderTagList() {
    const container = document.getElementById('tagListContainer');
    const searchInput = document.getElementById('tagSearchInput');
    const searchTerm = searchInput.value.toLowerCase().trim();

    // Filter tags
    let filteredTags = availableTags;
    if (searchTerm) {
        filteredTags = availableTags.filter(tag =>
            (tag.Name || '').toLowerCase().includes(searchTerm) ||
            (tag.NameNosign || '').toLowerCase().includes(searchTerm)
        );
    }

    if (filteredTags.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">Không tìm thấy tag</p>';
        return;
    }

    // Check which tags are already tracked
    const trackedPatterns = trackedTags.map(t => t.pattern.toLowerCase());

    container.innerHTML = filteredTags.slice(0, 50).map(tag => {
        const tagName = tag.Name || '';
        const isTracked = trackedPatterns.some(p => tagName.toLowerCase().startsWith(p) || tagName.toLowerCase() === p);

        return `
            <div class="tag-list-item ${isTracked ? 'selected' : ''}" onclick="toggleTrackedTag('${tagName}', '${tag.Color || '#6b7280'}')">
                <span class="tag-color-box" style="background-color: ${tag.Color || '#6b7280'}"></span>
                <span class="tag-name">${tagName}</span>
                <i class="fas fa-check tag-check"></i>
            </div>
        `;
    }).join('');
}

/**
 * Filter tag list
 */
function filterTagList() {
    renderTagList();
}

/**
 * Toggle tracked tag
 */
async function toggleTrackedTag(tagName, color) {
    const pattern = tagName.toLowerCase().trim();
    const existingIndex = trackedTags.findIndex(t => t.pattern === pattern);

    if (existingIndex >= 0) {
        trackedTags.splice(existingIndex, 1);
    } else {
        trackedTags.push({
            pattern: pattern,
            type: 'exact',
            displayName: tagName,
            color: color
        });
    }

    await saveTrackedTags();
    renderTagList();
    renderStatistics();
}

/**
 * Close orders detail modal
 */
function closeOrdersDetailModal() {
    const modal = document.getElementById('ordersDetailModal');
    modal.classList.remove('show');
}

/**
 * Calculate empty cart reasons breakdown
 * Orders with "Giỏ Trống" tag + other tags (excluding "thẻ khách lạ" related tags)
 */
function calculateEmptyCartReasons(orders) {
    const reasonsMap = new Map();
    let totalEmptyCartOrders = 0;

    // Tags to exclude from counting (thẻ khách lạ variations)
    const excludedPatterns = ['thẻ khách lạ', 'the khach la', 'khách lạ'];

    orders.forEach(order => {
        const orderTags = parseOrderTags(order.Tags);
        if (!orderTags || orderTags.length === 0) return;

        // Find if order has "giỏ trống" tag
        const hasGioTrong = orderTags.some(tag => {
            const tagName = (tag.Name || tag.name || '').toLowerCase().trim();
            return tagName === 'giỏ trống' || tagName === 'gio trong';
        });

        if (!hasGioTrong) return;

        totalEmptyCartOrders++;

        // Get other tags (excluding "giỏ trống" and "thẻ khách lạ" variations)
        orderTags.forEach(tag => {
            const tagName = (tag.Name || tag.name || '').toLowerCase().trim();
            const originalTagName = tag.Name || tag.name || '';

            // Skip the "giỏ trống" tag itself
            if (tagName === 'giỏ trống' || tagName === 'gio trong') return;

            // Skip excluded patterns (thẻ khách lạ)
            const isExcluded = excludedPatterns.some(p => tagName.includes(p));
            if (isExcluded) return;

            // Count this tag as a reason
            const key = tagName;
            if (!reasonsMap.has(key)) {
                reasonsMap.set(key, {
                    tagName: originalTagName,
                    tagNameLower: tagName,
                    count: 0,
                    orders: [],
                    color: tag.Color || tag.color || '#6b7280'
                });
            }
            const reason = reasonsMap.get(key);
            reason.count++;
            reason.orders.push(order);
        });
    });

    // Convert to array and sort by count descending
    const reasons = Array.from(reasonsMap.values())
        .sort((a, b) => b.count - a.count);

    return {
        totalEmptyCartOrders,
        reasons
    };
}

/**
 * Render empty cart reasons table
 */
function renderEmptyCartReasons(data) {
    const section = document.getElementById('emptyCartReasonsSection');
    const tbody = document.getElementById('emptyCartReasonsBody');
    const totalBadge = document.getElementById('emptyCartTotalBadge');

    if (!data || data.totalEmptyCartOrders === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    totalBadge.textContent = `${data.totalEmptyCartOrders} đơn`;

    if (data.reasons.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: #999; padding: 20px;">
                    <i class="fas fa-info-circle" style="margin-right: 5px;"></i>
                    Các đơn giỏ trống không có tag lý do kèm theo
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.reasons.map(reason => {
        const percentage = data.totalEmptyCartOrders > 0
            ? ((reason.count / data.totalEmptyCartOrders) * 100).toFixed(1)
            : 0;

        // Escape special characters for onclick handler
        const escapedTagName = reason.tagNameLower.replace(/'/g, "\\'").replace(/"/g, '\\"');

        return `
        <tr>
            <td>
                <div class="tag-cell">
                    <span class="tag-color" style="background-color: ${reason.color}"></span>
                    <span>${reason.tagName}</span>
                </div>
            </td>
            <td><strong>${reason.count.toLocaleString('vi-VN')}</strong></td>
            <td class="percentage">${percentage}%</td>
            <td>
                <button class="btn-view-detail" onclick="viewEmptyCartReasonOrders('${escapedTagName}')" title="Xem chi tiết">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

/**
 * Render discount statistics section
 */
async function renderDiscountStatistics(orders) {
    const section = document.getElementById('discountStatsSection');

    if (!orders || orders.length === 0) {
        if (section) section.style.display = 'none';
        return;
    }

    // Show section
    if (section) section.style.display = 'block';

    // Initialize discount stats UI if available
    if (window.discountStatsUI) {
        try {
            await window.discountStatsUI.calculateAndRender(orders);
            console.log('[DISCOUNT-STATS] Rendered successfully');
        } catch (error) {
            console.error('[DISCOUNT-STATS] Error rendering:', error);
        }
    } else {
        console.warn('[DISCOUNT-STATS] discountStatsUI not available');
    }
}

/**
 * View orders for specific empty cart reason
 */
function viewEmptyCartReasonOrders(tagNameLower) {
    const cached = cachedOrderDetails[currentTableName];
    const orders = cached?.orders || [];

    // Filter orders that have both "giỏ trống" and the specific tag
    const filteredOrders = orders.filter(order => {
        const orderTags = parseOrderTags(order.Tags);
        if (!orderTags || orderTags.length === 0) return false;

        const hasGioTrong = orderTags.some(tag => {
            const name = (tag.Name || tag.name || '').toLowerCase().trim();
            return name === 'giỏ trống' || name === 'gio trong';
        });

        const hasTargetTag = orderTags.some(tag => {
            const name = (tag.Name || tag.name || '').toLowerCase().trim();
            return name === tagNameLower;
        });

        return hasGioTrong && hasTargetTag;
    });

    // Find display name from first matching order
    let displayName = tagNameLower;
    if (filteredOrders.length > 0) {
        const orderTags = parseOrderTags(filteredOrders[0].Tags);
        const matchingTag = orderTags.find(tag => {
            const name = (tag.Name || tag.name || '').toLowerCase().trim();
            return name === tagNameLower;
        });
        if (matchingTag) {
            displayName = matchingTag.Name || matchingTag.name || tagNameLower;
        }
    }

    showOrdersDetailModal(`Giỏ Trống + ${displayName}`, filteredOrders);
}

/**
 * View orders by tag
 */
function viewTagOrders(pattern, type) {
    const cached = cachedOrderDetails[currentTableName];
    const orders = cached?.orders || [];

    let filteredOrders = [];
    let displayName = '';

    // Handle special stats (ĐÃ RA ĐƠN)
    if (type === 'special') {
        if (pattern === 'ordered') {
            // Filter orders with "Đơn hàng" status
            filteredOrders = orders.filter(order => {
                const statusText = order.StatusText || order.Status || '';
                return statusText === 'Đơn hàng';
            });
            displayName = 'ĐÃ RA ĐƠN';
        } else if (pattern === '__no_tags__') {
            // Filter orders without tags
            filteredOrders = orders.filter(order => {
                const orderTags = parseOrderTags(order.Tags);
                return orderTags.length === 0;
            });
            displayName = 'Không Có Tag';
        }
    } else if (type === 'duplicate') {
        // Find orders with multiple tags from LIVE_STAT_TAGS
        // NOTE: Include "Đơn hàng" status as 'ordered' tag for duplicate checking (matching statistics logic)
        displayName = 'TAG TRÙNG';
        filteredOrders = orders.filter(order => {
            const orderTags = parseOrderTags(order.Tags);
            const statusText = order.StatusText || order.Status || '';
            const matchedKeys = new Set();

            // Check if order has "Đơn hàng" status (counts as ĐÃ RA ĐƠN tag)
            if (statusText === 'Đơn hàng') {
                matchedKeys.add('ordered');
            }

            orderTags.forEach(orderTag => {
                const tagName = (orderTag.Name || orderTag.name || '').toLowerCase().trim();
                if (!tagName) return;

                LIVE_STAT_TAGS.forEach(liveTag => {
                    if (liveTag.isSpecial) return;
                    const patterns = liveTag.patterns || [];
                    if (patterns.some(p => tagName.startsWith(p))) {
                        matchedKeys.add(liveTag.key);
                    }
                });
            });

            return matchedKeys.size > 1;
        });
    } else if (type === 'wrong_tag') {
        // Find orders not matching any LIVE_STAT_TAGS
        displayName = 'GẮN SAI TAG';
        filteredOrders = orders.filter(order => {
            const orderTags = parseOrderTags(order.Tags);
            const statusText = order.StatusText || order.Status || '';

            // Check if order has "Đơn hàng" status (counts as ĐÃ RA ĐƠN)
            if (statusText === 'Đơn hàng') return false;

            // Check if any tag matches LIVE_STAT_TAGS
            let hasMatchingTag = false;
            orderTags.forEach(orderTag => {
                const tagName = (orderTag.Name || orderTag.name || '').toLowerCase().trim();
                if (!tagName) return;

                LIVE_STAT_TAGS.forEach(liveTag => {
                    if (liveTag.isSpecial) return;
                    const patterns = liveTag.patterns || [];
                    if (patterns.some(p => tagName.startsWith(p))) {
                        hasMatchingTag = true;
                    }
                });
            });

            return !hasMatchingTag;
        });
    } else if (type === 'tag') {
        // Find the matching LIVE_STAT_TAGS definition
        const liveTag = LIVE_STAT_TAGS.find(t => t.key === pattern);
        if (liveTag && liveTag.patterns) {
            displayName = liveTag.displayName;
            // Filter orders matching any of the patterns
            filteredOrders = orders.filter(order => {
                const orderTags = parseOrderTags(order.Tags);
                return orderTags.some(tag => {
                    const tagName = (tag.Name || tag.name || '').toLowerCase().trim();
                    return liveTag.patterns.some(p => tagName.startsWith(p));
                });
            });

            // Special handling for GIỎ TRỐNG - find validation errors
            if (pattern === 'gio_trong') {
                const invalidOrders = findGioTrongValidationErrors(orders);
                if (invalidOrders.length > 0) {
                    // Show invalid orders in a special modal
                    showGioTrongValidationModal(filteredOrders, invalidOrders);
                    return;
                }
            }
        }
    } else {
        // Regular tag matching - match by exact tag name (case insensitive)
        filteredOrders = orders.filter(order => {
            const orderTags = parseOrderTags(order.Tags);
            return orderTags.some(tag => {
                const tagName = (tag.Name || tag.name || '').toLowerCase();
                return tagName === pattern.toLowerCase();
            });
        });

        // Find the original display name from any matching order
        for (const order of orders) {
            const orderTags = parseOrderTags(order.Tags);
            const matchedTag = orderTags.find(tag => {
                const tagName = (tag.Name || tag.name || '').toLowerCase();
                return tagName === pattern.toLowerCase();
            });
            if (matchedTag) {
                displayName = matchedTag.Name || matchedTag.name || pattern;
                break;
            }
        }
        if (!displayName) displayName = pattern;
    }

    showOrdersDetailModal(`Đơn hàng: ${displayName}`, filteredOrders);
}

/**
 * View all orders for an employee
 */
function viewEmployeeOrders(name, start, end) {
    const cached = cachedOrderDetails[currentTableName];
    const orders = cached?.orders || [];

    const filteredOrders = orders.filter(order => {
        const stt = parseInt(order.SessionIndex || 0);
        return stt >= start && stt <= end;
    });

    showOrdersDetailModal(`Đơn hàng của ${name} (STT ${start}-${end})`, filteredOrders);
}

/**
 * View orders for employee by tag (using LIVE_STAT_TAGS key)
 */
function viewEmployeeTagOrders(empName, start, end, tagKey) {
    const cached = cachedOrderDetails[currentTableName];
    const orders = cached?.orders || [];

    let filteredOrders = [];
    let displayName = tagKey;

    // Filter orders by employee first
    const empOrders = orders.filter(order => {
        const stt = parseInt(order.SessionIndex || 0);
        return stt >= start && stt <= end;
    });

    // Handle TAG TRÙNG (duplicate tags) - includes 'ordered' status
    if (tagKey === 'tag_trung') {
        displayName = 'TAG TRÙNG';
        filteredOrders = empOrders.filter(order => {
            const orderTags = parseOrderTags(order.Tags);
            const statusText = order.StatusText || order.Status || '';
            const matchedKeys = new Set();

            // Check for ĐÃ RA ĐƠN status (counts as a tag)
            if (statusText === 'Đơn hàng') {
                matchedKeys.add('ordered');
            }

            orderTags.forEach(orderTag => {
                const tagName = (orderTag.Name || orderTag.name || '').toLowerCase().trim();
                if (!tagName) return;

                LIVE_STAT_TAGS.forEach(liveTag => {
                    if (liveTag.isSpecial) return;
                    const patterns = liveTag.patterns || [];
                    if (patterns.some(p => tagName.startsWith(p))) {
                        matchedKeys.add(liveTag.key);
                    }
                });
            });

            // Store matched keys for display
            if (matchedKeys.size > 1) {
                order._matchedTagKeys = Array.from(matchedKeys);
            }

            return matchedKeys.size > 1;
        });
    } else if (tagKey === 'gan_sai_tag') {
        // Handle GẮN SAI TAG (orders not matching any LIVE_STAT_TAGS)
        displayName = 'GẮN SAI TAG';
        filteredOrders = empOrders.filter(order => {
            const orderTags = parseOrderTags(order.Tags);
            const statusText = order.StatusText || order.Status || '';

            // Check if order has "Đơn hàng" status (counts as ĐÃ RA ĐƠN)
            if (statusText === 'Đơn hàng') return false;

            // Check if any tag matches LIVE_STAT_TAGS
            let hasMatchingTag = false;
            orderTags.forEach(orderTag => {
                const tagName = (orderTag.Name || orderTag.name || '').toLowerCase().trim();
                if (!tagName) return;

                LIVE_STAT_TAGS.forEach(liveTag => {
                    if (liveTag.isSpecial) return;
                    const patterns = liveTag.patterns || [];
                    if (patterns.some(p => tagName.startsWith(p))) {
                        hasMatchingTag = true;
                    }
                });
            });

            return !hasMatchingTag;
        });
    } else {
        // Find the matching LIVE_STAT_TAGS definition
        const liveTag = LIVE_STAT_TAGS.find(t => t.key === tagKey);

        if (liveTag) {
            displayName = liveTag.displayName;

            if (liveTag.isSpecial && tagKey === 'ordered') {
                // Handle ĐÃ RA ĐƠN (Ordered status)
                filteredOrders = empOrders.filter(order => {
                    const statusText = order.StatusText || order.Status || '';
                    return statusText === 'Đơn hàng';
                });
            } else if (liveTag.patterns) {
                // Handle tag patterns
                filteredOrders = empOrders.filter(order => {
                    const orderTags = parseOrderTags(order.Tags);
                    return orderTags.some(tag => {
                        const tagName = (tag.Name || tag.name || '').toLowerCase().trim();
                        return liveTag.patterns.some(p => tagName.startsWith(p));
                    });
                });

                // Special handling for GIỎ TRỐNG - find validation errors
                if (tagKey === 'gio_trong') {
                    const invalidOrders = findGioTrongValidationErrors(empOrders);
                    if (invalidOrders.length > 0) {
                        // Show with validation errors
                        showGioTrongValidationModal(filteredOrders, invalidOrders, `${empName} - `);
                        return;
                    }
                }
            }
        }
    }

    showOrdersDetailModal(`${empName} - ${displayName}`, filteredOrders);
}

/**
 * Find GIỎ TRỐNG validation errors
 * Returns orders that violate the rules:
 * 1. Has "giỏ trống" tag but product count > 0
 * 2. Has product count = 0 but no "giỏ trống" or "đã gộp ko chốt" tag
 */
function findGioTrongValidationErrors(orders) {
    const invalidOrders = [];
    const gioTrongPatterns = ['giỏ trống'];
    const gopPatterns = ['đã gộp ko chốt', 'đã gộp không chốt'];

    orders.forEach(order => {
        const orderTags = parseOrderTags(order.Tags);
        const productCount = order.Details?.length || 0;

        // Check if order has giỏ trống tag
        const hasGioTrongTag = orderTags.some(tag => {
            const tagName = (tag.Name || tag.name || '').toLowerCase().trim();
            return gioTrongPatterns.some(p => tagName.startsWith(p));
        });

        // Check if order has gộp tag
        const hasGopTag = orderTags.some(tag => {
            const tagName = (tag.Name || tag.name || '').toLowerCase().trim();
            return gopPatterns.some(p => tagName.startsWith(p));
        });

        // Case 1: Has giỏ trống tag but has products
        if (hasGioTrongTag && productCount > 0) {
            invalidOrders.push({
                order: order,
                reason: `Có tag "giỏ trống" nhưng có ${productCount} sản phẩm`
            });
        }

        // Case 2: No products but missing giỏ trống or gộp tag
        if (productCount === 0 && !hasGioTrongTag && !hasGopTag) {
            invalidOrders.push({
                order: order,
                reason: 'Không có sản phẩm nhưng thiếu tag "giỏ trống" hoặc "đã gộp ko chốt"'
            });
        }
    });

    return invalidOrders;
}

/**
 * Show GIỎ TRỐNG validation modal with normal and invalid orders
 */
function showGioTrongValidationModal(normalOrders, invalidOrders, prefix = '') {
    const modal = document.getElementById('ordersDetailModal');
    const titleEl = document.getElementById('ordersDetailTitle');
    const body = document.getElementById('ordersDetailBody');

    const totalCount = normalOrders.length + invalidOrders.length;
    titleEl.innerHTML = `<i class="fas fa-list"></i> ${prefix}GIỎ TRỐNG <span style="font-size: 14px; opacity: 0.8;">(${normalOrders.length} đơn)</span> <span style="font-size: 14px; color: #ef4444;">(${invalidOrders.length} lỗi)</span>`;

    let html = '';

    // Normal orders section
    if (normalOrders.length > 0) {
        html += `
            <h4 style="color: #22c55e; margin: 10px 0;"><i class="fas fa-check-circle"></i> Đơn hàng GIỎ TRỐNG (${normalOrders.length})</h4>
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>STT</th>
                        <th>Mã đơn</th>
                        <th>Tag</th>
                        <th>Khách hàng</th>
                        <th>SP</th>
                        <th>Tổng tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${normalOrders.map(order => `
                        <tr>
                            <td>${order.SessionIndex || ''}</td>
                            <td class="order-code">${order.Code || ''}</td>
                            <td><div class="tags-cell">${parseOrderTagsHtml(order.Tags, order)}</div></td>
                            <td>${order.Name || order.PartnerName || ''}</td>
                            <td>${order.Details?.length || 0}</td>
                            <td class="amount">${(order.TotalAmount || 0).toLocaleString('vi-VN')}đ</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // Invalid orders section (highlighted in red)
    if (invalidOrders.length > 0) {
        html += `
            <h4 style="color: #ef4444; margin: 20px 0 10px 0;"><i class="fas fa-exclamation-triangle"></i> Đơn hàng LỖI (${invalidOrders.length})</h4>
            <table class="orders-table">
                <thead>
                    <tr style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white;">
                        <th>STT</th>
                        <th>Mã đơn</th>
                        <th>Tag</th>
                        <th>Khách hàng</th>
                        <th>SP</th>
                        <th>Tổng tiền</th>
                        <th>Lý do lỗi</th>
                    </tr>
                </thead>
                <tbody>
                    ${invalidOrders.map(item => `
                        <tr style="background: rgba(239, 68, 68, 0.1);">
                            <td>${item.order.SessionIndex || ''}</td>
                            <td class="order-code">${item.order.Code || ''}</td>
                            <td><div class="tags-cell">${parseOrderTagsHtml(item.order.Tags)}</div></td>
                            <td>${item.order.Name || item.order.PartnerName || ''}</td>
                            <td><strong style="color: #ef4444;">${item.order.Details?.length || 0}</strong></td>
                            <td class="amount">${(item.order.TotalAmount || 0).toLocaleString('vi-VN')}đ</td>
                            <td style="color: #ef4444; font-size: 12px;">${item.reason}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    body.innerHTML = html || '<div class="empty-state"><p>Không có đơn hàng</p></div>';
    modal.classList.add('show');
}

/**
 * View mismatch orders for an employee (called from mismatch badge button)
 */
function viewMismatchOrders(empName, start, end) {
    // Find employee stats
    const cached = cachedOrderDetails[currentTableName];
    const orders = cached?.orders || [];

    // Calculate employee stats to get mismatch info
    const empStats = calculateEmployeeTagStats(orders);
    const emp = empStats.find(e => e.name === empName && e.start === start && e.end === end);

    if (!emp || !emp.mismatchReason || emp.mismatchReason.length === 0) {
        alert('Không tìm thấy thông tin đơn không khớp');
        return;
    }

    // Collect all mismatch orders with reasons
    const mismatchOrders = [];
    emp.mismatchReason.forEach(reason => {
        reason.orders.forEach(order => {
            mismatchOrders.push({
                order: order,
                reason: reason.text,
                type: reason.type
            });
        });
    });

    if (mismatchOrders.length === 0) {
        alert('Không có đơn hàng không khớp');
        return;
    }

    // Show modal with mismatch details
    showMismatchOrdersModal(empName, emp, mismatchOrders);
}

/**
 * Show mismatch orders modal with reason details
 */
function showMismatchOrdersModal(empName, emp, mismatchOrders) {
    const modal = document.getElementById('ordersDetailModal');
    const titleEl = document.getElementById('ordersDetailTitle');
    const body = document.getElementById('ordersDetailBody');

    // Summary info
    const summaryHtml = `
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 15px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; color: #dc2626;">
                <i class="fas fa-exclamation-triangle"></i> Phân tích không khớp - ${empName}
            </h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 13px;">
                <div><strong>Tổng đơn:</strong> ${emp.badgeTotal}</div>
                <div><strong>Giỏ trống:</strong> ${emp.badgeGioTrong}</div>
                <div><strong>Gộp:</strong> ${emp.badgeGop}</div>
                <div><strong>Đơn chốt (tính):</strong> ${emp.badgeChot} = ${emp.badgeTotal} - ${emp.badgeGioTrong} - ${emp.badgeGop}</div>
                <div><strong>Đơn chốt (thực tế):</strong> ${emp.actualChot}</div>
                <div style="color: #dc2626; font-weight: 700;"><strong>Chênh lệch:</strong> ${emp.badgeChot - emp.actualChot}</div>
            </div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #fecaca;">
                <strong>Nguyên nhân:</strong>
                <ul style="margin: 5px 0 0 20px; padding: 0;">
                    ${emp.mismatchReason.map(r => `<li>${r.text}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;

    // Orders table
    const tableHtml = `
        <table class="orders-detail-table" style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #fee2e2;">
                    <th style="padding: 10px; border: 1px solid #fecaca;">STT</th>
                    <th style="padding: 10px; border: 1px solid #fecaca;">Mã đơn</th>
                    <th style="padding: 10px; border: 1px solid #fecaca;">Khách hàng</th>
                    <th style="padding: 10px; border: 1px solid #fecaca;">Tags</th>
                    <th style="padding: 10px; border: 1px solid #fecaca;">Trạng thái</th>
                    <th style="padding: 10px; border: 1px solid #fecaca;">Nguyên nhân</th>
                </tr>
            </thead>
            <tbody>
                ${mismatchOrders.map((item, idx) => {
        const order = item.order;
        const tags = parseOrderTags(order.Tags);
        const tagsHtml = tags.map(t => `<span class="order-tag" style="background: ${t.Color || '#6b7280'}; font-size: 11px;">${t.Name || ''}</span>`).join(' ');

        return `
                    <tr style="background: ${idx % 2 === 0 ? '#fff' : '#fef2f2'};">
                        <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${order.SessionIndex || '-'}</td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">${order.Code || ''}</td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">${order.PartnerName || order.Name || '-'}</td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">${tagsHtml || '<span style="color: #999;">Không có tag</span>'}</td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">${order.StatusText || order.Status || '-'}</td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: 600;">
                            <i class="fas fa-exclamation-circle"></i> ${item.reason}
                        </td>
                    </tr>
                    `;
    }).join('')}
            </tbody>
        </table>
    `;

    titleEl.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #dc2626;"></i> Đơn không khớp - ${empName} <span style="font-size: 14px; opacity: 0.8;">(${mismatchOrders.length} đơn)</span>`;
    body.innerHTML = summaryHtml + tableHtml;

    // ⚡ FIXED: Use classList.add('show') instead of style.display
    modal.classList.add('show');
}

/**
 * Show orders detail modal
 */
function showOrdersDetailModal(title, orders) {
    const modal = document.getElementById('ordersDetailModal');
    const titleEl = document.getElementById('ordersDetailTitle');
    const body = document.getElementById('ordersDetailBody');

    titleEl.innerHTML = `<i class="fas fa-list"></i> ${title} <span style="font-size: 14px; opacity: 0.8;">(${orders.length} đơn)</span>`;

    if (orders.length === 0) {
        body.innerHTML = `
            <div class="empty-state" style="padding: 40px;">
                <i class="fas fa-inbox" style="font-size: 50px; color: #ddd;"></i>
                <h3 style="color: #999;">Không có đơn hàng</h3>
            </div>
        `;
    } else {
        body.innerHTML = `
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>STT</th>
                        <th>Mã đơn</th>
                        <th>Tag</th>
                        <th>Khách hàng</th>
                        <th>SĐT</th>
                        <th>SP</th>
                        <th>Tổng tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${orders.map(order => `
                        <tr onclick="openCachedOrderDetailFromModal(${orders.indexOf(order)}, '${order.Code}')" style="cursor: pointer;">
                            <td>${order.SessionIndex || '-'}</td>
                            <td class="order-code">${order.Code || ''}</td>
                            <td><div class="tags-cell">${parseOrderTagsHtml(order.Tags, order)}</div></td>
                            <td>${order.Name || order.PartnerName || ''}</td>
                            <td>${order.Telephone || ''}</td>
                            <td>${(order.Details || []).length}</td>
                            <td class="amount">${(order.TotalAmount || 0).toLocaleString('vi-VN')}đ</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    modal.classList.add('show');

    // Store orders for detail view
    window._currentFilteredOrders = orders;
}

/**
 * Open order detail from modal
 */
function openCachedOrderDetailFromModal(index, orderCode) {
    const orders = window._currentFilteredOrders || [];
    const order = orders[index];
    if (!order) return;

    // Close the list modal first
    closeOrdersDetailModal();

    // Open detail modal
    const modal = document.getElementById('orderDetailModal');
    modal.classList.add('show');
    renderOrderDetailModal({ orderCode: order.Code }, order);
}

// Close modals on background click
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('add-tag-modal')) {
        closeAddTagModal();
    }
    if (e.target.classList.contains('orders-detail-modal')) {
        closeOrdersDetailModal();
    }
});

// =====================================================
