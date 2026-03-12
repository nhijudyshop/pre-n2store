/**
 * TAB3-TABLE.JS
 * Assignment table rendering, STT input handlers, order tooltips.
 *
 * Load order: tab3-table.js (3rd, after tab3-filters.js)
 * Depends on: window._tab3 (from tab3-core.js)
 */
(function () {
    'use strict';

    const { state, utils, ui, data: dataFns } = window._tab3;

    // =====================================================
    // RENDER ASSIGNMENT TABLE
    // =====================================================

    function renderAssignmentTable() {
        const tableBody = document.getElementById('assignmentTableBody');
        const countSpan = document.getElementById('assignmentCount');

        countSpan.textContent = state.assignments.length;

        if (state.assignments.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        Chưa có sản phẩm nào được gán. Hãy tìm kiếm và thêm sản phẩm.
                    </td>
                </tr>
            `;
            const searchInput = document.getElementById('assignmentSearch');
            if (searchInput) {
                searchInput.value = '';
            }
            return;
        }

        tableBody.innerHTML = state.assignments.map(assignment => {
            const imageHtml = assignment.imageUrl
                ? `<img src="${assignment.imageUrl}" class="product-image" alt="${assignment.productName}">`
                : `<div class="product-image no-image">📦</div>`;

            // Ensure backward compatibility
            if (!assignment.sttList) {
                assignment.sttList = assignment.sttNumber ? [{ stt: assignment.sttNumber, orderInfo: assignment.orderInfo }] : [];
            }

            // Render STT chips (with index for duplicate STT)
            const chipsHtml = assignment.sttList.length > 0
                ? assignment.sttList.map((item, index) => {
                    // Decode note safely with fallback
                    let noteText = item.orderInfo?.note || '';
                    try {
                        if (noteText && window.DecodingUtility) {
                            noteText = noteText.replace(/\["[A-Za-z0-9\-_]+"\]/g, '').trim();

                            const lines = noteText.split('\n');
                            const plainLines = lines.filter(line => {
                                const trimmed = line.trim();
                                if (trimmed.length > 20 && !trimmed.includes(' ')) {
                                    const decoded = window.DecodingUtility.decodeProductLine(trimmed);
                                    return !decoded;
                                }
                                return true;
                            });
                            noteText = plainLines.join(' ').substring(0, 50);
                        }
                    } catch (e) {
                        noteText = (item.orderInfo?.note || '').substring(0, 50);
                    }

                    const chipText = [item.orderInfo?.customerName, noteText].filter(Boolean).join(' - ');
                    return `
                        <div class="stt-chip" onclick="showSTTChipTooltip(event, ${assignment.id}, ${index})">
                            <span class="stt-chip-number">STT ${item.stt}</span>
                            ${chipText ? `<span class="stt-chip-customer">${chipText}</span>` : ''}
                            <button class="stt-chip-remove" onclick="event.stopPropagation(); removeSTTByIndex(${assignment.id}, ${index})">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                }).join('')
                : '<span class="stt-chips-empty">Chưa có STT nào</span>';

            return `
                <tr class="assignment-row" data-assignment-id="${assignment.id}">
                    <td>
                        <div class="product-cell">
                            ${imageHtml}
                            <div class="product-info">
                                <div class="product-name-text">${assignment.productName}</div>
                                <div class="product-code-text">Mã: ${assignment.productCode || 'N/A'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="stt-cell">
                        <div class="stt-input-wrapper">
                            <div class="stt-chips-container ${assignment.sttList.length > 0 ? 'has-items' : ''}">
                                ${chipsHtml}
                            </div>
                            <input
                                type="text"
                                class="stt-input"
                                placeholder="Nhập STT để thêm..."
                                data-assignment-id="${assignment.id}"
                                oninput="handleSTTInput(event)"
                                onfocus="handleSTTFocus(event)"
                                onblur="handleSTTBlur(event)"
                                onkeypress="handleSTTKeyPress(event)"
                            />
                            <div class="stt-suggestions" id="stt-suggestions-${assignment.id}"></div>
                        </div>
                    </td>
                    <td>
                        <button class="btn-remove" onclick="removeAssignment(${assignment.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Reapply filter if search input has value
        const searchInput = document.getElementById('assignmentSearch');
        if (searchInput && searchInput.value.trim() !== '') {
            window.filterAssignments(searchInput.value);
        }
    }

    // =====================================================
    // STT INPUT HANDLERS
    // =====================================================

    window.handleSTTInput = function (event) {
        const input = event.target;
        const assignmentId = parseInt(input.dataset.assignmentId);
        const value = input.value.trim();

        if (value.length >= 1) {
            showSTTSuggestions(assignmentId, value);
        } else {
            hideSTTSuggestions(assignmentId);
        }
    };

    window.handleSTTFocus = function (event) {
        const input = event.target;
        const assignmentId = parseInt(input.dataset.assignmentId);
        const value = input.value.trim();

        if (value.length >= 1) {
            showSTTSuggestions(assignmentId, value);
        }
    };

    window.handleSTTBlur = function (event) {
        const assignmentId = parseInt(event.target.dataset.assignmentId);
        setTimeout(() => {
            hideSTTSuggestions(assignmentId);
        }, 200);
    };

    window.handleSTTKeyPress = function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const input = event.target;
            const assignmentId = parseInt(input.dataset.assignmentId);
            const value = input.value.trim();

            if (value) {
                const order = state.ordersData.find(o => o.stt && o.stt.toString() === value);
                if (order) {
                    input.value = '';
                    hideSTTSuggestions(assignmentId);
                    window._tab3.fn.addSTTToAssignment(assignmentId, value, order);
                } else {
                    ui.showNotification('Không tìm thấy STT: ' + value, 'error');
                }
            }
        }
    };

    // =====================================================
    // STT SUGGESTIONS
    // =====================================================

    function showSTTSuggestions(assignmentId, searchText) {
        const suggestionsDiv = document.getElementById(`stt-suggestions-${assignmentId}`);
        if (!suggestionsDiv) return;

        const filteredOrders = state.ordersData.filter(order => {
            const sttMatch = order.stt && order.stt.toString().includes(searchText);
            const customerMatch = order.customerName &&
                utils.removeVietnameseTones(order.customerName).includes(utils.removeVietnameseTones(searchText));
            return sttMatch || customerMatch;
        }).sort((a, b) => {
            const aSTT = a.stt.toString();
            const bSTT = b.stt.toString();

            const aExactMatch = aSTT === searchText;
            const bExactMatch = bSTT === searchText;

            if (aExactMatch && !bExactMatch) return -1;
            if (!aExactMatch && bExactMatch) return 1;

            const aStartsWith = aSTT.startsWith(searchText);
            const bStartsWith = bSTT.startsWith(searchText);

            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;

            return parseInt(aSTT) - parseInt(bSTT);
        }).slice(0, 10);

        if (filteredOrders.length === 0) {
            suggestionsDiv.classList.remove('show');
            return;
        }

        suggestionsDiv.innerHTML = filteredOrders.map(order => {
            let noteText = order.note || '';
            try {
                if (noteText && window.DecodingUtility) {
                    noteText = noteText.replace(/\["[A-Za-z0-9\-_]+"\]/g, '').trim();

                    const lines = noteText.split('\n');
                    const plainLines = lines.filter(line => {
                        const trimmed = line.trim();
                        if (trimmed.length > 20 && !trimmed.includes(' ')) {
                            const decoded = window.DecodingUtility.decodeProductLine(trimmed);
                            return !decoded;
                        }
                        return true;
                    });
                    noteText = plainLines.join(' ').substring(0, 50);
                }
            } catch (e) {
                noteText = (order.note || '').substring(0, 50);
            }

            const displayText = [order.customerName, noteText].filter(Boolean).join(' - ') || 'N/A';
            return `
                <div class="stt-suggestion-item" data-assignment-id="${assignmentId}" data-stt="${order.stt}" data-order='${JSON.stringify(order)}'>
                    <span class="stt-number">${order.stt}</span>
                    <span class="customer-name">${displayText}</span>
                </div>
            `;
        }).join('');

        suggestionsDiv.classList.add('show');

        suggestionsDiv.querySelectorAll('.stt-suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const stt = item.dataset.stt;
                const orderData = JSON.parse(item.dataset.order);
                selectSTT(assignmentId, stt, orderData);
            });

            item.addEventListener('mouseenter', (e) => {
                const orderData = JSON.parse(item.dataset.order);
                showOrderTooltip(orderData, e);
            });

            item.addEventListener('mouseleave', () => {
                hideOrderTooltip();
            });
        });
    }

    function hideSTTSuggestions(assignmentId) {
        const suggestionsDiv = document.getElementById(`stt-suggestions-${assignmentId}`);
        if (suggestionsDiv) {
            suggestionsDiv.classList.remove('show');
        }
    }

    function selectSTT(assignmentId, stt, orderData) {
        const input = document.querySelector(`input[data-assignment-id="${assignmentId}"]`);
        if (input) {
            input.value = '';
        }
        hideSTTSuggestions(assignmentId);
        hideOrderTooltip();

        window._tab3.fn.addSTTToAssignment(assignmentId, stt, orderData);
    }

    // =====================================================
    // ORDER TOOLTIP
    // =====================================================

    function showOrderTooltip(orderData, event) {
        const tooltip = document.getElementById('orderTooltip');

        tooltip.innerHTML = `
            <div class="order-tooltip-header">
                Đơn hàng #${orderData.stt || 'N/A'}
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">Khách hàng:</span>
                <span class="order-tooltip-value">${orderData.customerName || 'N/A'}</span>
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">SĐT:</span>
                <span class="order-tooltip-value">${orderData.phone || 'N/A'}</span>
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">Địa chỉ:</span>
                <span class="order-tooltip-value">${orderData.address || 'N/A'}</span>
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">Tổng tiền:</span>
                <span class="order-tooltip-value">${utils.formatCurrency(orderData.totalAmount)}</span>
            </div>
            <div class="order-tooltip-row">
                <span class="order-tooltip-label">Số lượng:</span>
                <span class="order-tooltip-value">${orderData.quantity || 0}</span>
            </div>
            ${orderData.products && orderData.products.length > 0 ? `
                <div class="order-tooltip-products">
                    <div class="order-tooltip-products-title">Sản phẩm:</div>
                    ${orderData.products.map(p => `
                        <div class="order-tooltip-product-item">${p.name} (x${p.quantity})</div>
                    `).join('')}
                </div>
            ` : ''}
        `;

        const x = event.clientX + 15;
        const y = event.clientY + 15;

        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
        tooltip.classList.add('show');
    }

    function hideOrderTooltip() {
        const tooltip = document.getElementById('orderTooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
        }
    }

    // Show tooltip for STT chip (by index)
    window.showSTTChipTooltip = function (event, assignmentId, index) {
        const assignment = state.assignments.find(a => a.id === assignmentId);
        if (!assignment || !assignment.sttList) return;

        const sttItem = assignment.sttList[index];
        if (sttItem && sttItem.orderInfo) {
            showOrderTooltip(sttItem.orderInfo, event);
        }
    };

    // =====================================================
    // EXPOSE FUNCTIONS
    // =====================================================

    window._tab3.fn.renderAssignmentTable = renderAssignmentTable;
    window._tab3.fn.showOrderTooltip = showOrderTooltip;
    window._tab3.fn.hideOrderTooltip = hideOrderTooltip;
    window._tab3.fn.showSTTSuggestions = showSTTSuggestions;
    window._tab3.fn.hideSTTSuggestions = hideSTTSuggestions;

})();
