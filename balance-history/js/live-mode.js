// =====================================================
// LIVE MODE - KANBAN LAYOUT MODULE
// Balance History - Realtime transaction monitoring
// With XSS protection, proper error handling, loading states
// =====================================================

const LiveModeModule = (function() {
    'use strict';

    // ===== STATE =====
    const state = {
        // 3 Kanban columns
        manualItems: [],        // NHẬP TAY - cần nhập SĐT
        autoMatchedItems: [],   // TỰ ĐỘNG GÁN - có KH, chờ confirm
        confirmedItems: [],     // ĐÃ XÁC NHẬN - hoàn thành

        // UI state
        showConfirmed: false,   // Column 3 ẩn mặc định
        searchQuery: '',
        isLoading: false,
        lastUpdate: null,

        // Date filter - default today
        filterStartDate: new Date().toISOString().split('T')[0],
        filterEndDate: new Date().toISOString().split('T')[0],
        filterStartTime: '00:00',
        filterEndTime: '23:59',

        // SSE
        sseConnection: null,
        sseReconnectAttempts: 0,
        maxReconnectAttempts: 10,
        sseDebounceTimer: null,  // Debounce rapid SSE updates

        // TPOS Cache with expiry
        tposCache: new Map(),
        tposCacheExpiry: 5 * 60 * 1000, // 5 minutes
        tposCacheMaxSize: 100,

        // Search debounce
        searchDebounceTimer: null,

        // Initialized flag
        initialized: false,
    };

    // ===== CONSTANTS =====
    const API_BASE = window.CONFIG?.API_BASE_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const SSE_URL = `${API_BASE}/api/sepay/stream`;

    // ===== SECURITY: XSS Protection =====
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== USER-FRIENDLY ERROR MESSAGES =====
    function getUserFriendlyError(error) {
        const message = error?.message || String(error);

        if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
            return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.';
        }
        if (message.includes('401') || message.includes('Unauthorized')) {
            return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
        }
        if (message.includes('403') || message.includes('Forbidden')) {
            return 'Bạn không có quyền thực hiện thao tác này.';
        }
        if (message.includes('404') || message.includes('Not found')) {
            return 'Không tìm thấy dữ liệu. Vui lòng thử lại.';
        }
        if (message.includes('500') || message.includes('Internal Server')) {
            return 'Lỗi máy chủ. Vui lòng thử lại sau.';
        }
        if (message.includes('timeout') || message.includes('Timeout')) {
            return 'Yêu cầu quá thời gian. Vui lòng thử lại.';
        }

        return message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
    }

    // ===== UTILITY FUNCTIONS =====

    function formatCurrency(amount) {
        if (!amount) return '0';
        return new Intl.NumberFormat('vi-VN').format(amount);
    }

    function formatTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${time} ${day}/${month}`;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }

    function truncateText(text, maxLength = 50) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    // ===== BUTTON LOADING STATE =====
    function setButtonLoading(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            button.classList.add('loading');
            button.disabled = true;
            button.dataset.originalText = button.textContent;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
            }
        }
    }

    function setCardProcessing(txId, isProcessing) {
        const card = document.querySelector(`.kanban-card[data-id="${txId}"]`);
        if (card) {
            card.classList.toggle('processing', isProcessing);
        }
    }

    // ===== CLASSIFICATION LOGIC =====

    function classifyTransaction(tx) {
        // ĐÃ XÁC NHẬN: is_hidden = true
        if (tx.is_hidden === true) {
            return 'confirmed';
        }

        // TỰ ĐỘNG GÁN: CHỈ các phương thức tự động (qr_code, exact_phone, single_match)
        // và chưa xác nhận (is_hidden = false)
        const autoMethods = ['qr_code', 'exact_phone', 'single_match'];
        if (
            tx.customer_phone &&
            !tx.has_pending_match &&
            autoMethods.includes(tx.match_method)
        ) {
            return 'autoMatched';
        }

        // NHẬP TAY: Tất cả trường hợp còn lại
        // - Chưa có khách hàng
        // - Có pending match
        // - match_method là manual_entry, manual_link, pending_match, hoặc không xác định
        return 'manual';
    }

    function classifyAllTransactions(transactions) {
        state.manualItems = [];
        state.autoMatchedItems = [];
        state.confirmedItems = [];

        // Client-side date filtering (since API may not support it)
        const startDateTime = state.filterStartDate ? new Date(state.filterStartDate + 'T' + (state.filterStartTime || '00:00') + ':00') : null;
        const endDateTime = state.filterEndDate ? new Date(state.filterEndDate + 'T' + (state.filterEndTime || '23:59') + ':59') : null;

        transactions.forEach(tx => {
            // Filter by date range (client-side)
            if (tx.transaction_date) {
                const txDate = new Date(tx.transaction_date);
                if (startDateTime && txDate < startDateTime) return; // Skip if before start
                if (endDateTime && txDate > endDateTime) return;     // Skip if after end
            }

            const category = classifyTransaction(tx);
            if (category === 'confirmed') {
                state.confirmedItems.push(tx);
            } else if (category === 'manual') {
                state.manualItems.push(tx);
            } else {
                state.autoMatchedItems.push(tx);
            }
        });

        // Sort by date descending (newest first)
        const sortByDate = (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date);
        state.manualItems.sort(sortByDate);
        state.autoMatchedItems.sort(sortByDate);
        state.confirmedItems.sort(sortByDate);

        console.log('[LiveMode] Classified:', state.manualItems.length, 'manual,',
            state.autoMatchedItems.length, 'auto,', state.confirmedItems.length, 'confirmed');
    }

    // ===== RENDER FUNCTIONS =====

    function renderKanbanBoard() {
        const board = document.getElementById('kanbanBoard');
        if (!board) return;

        // Toggle show-confirmed class on board based on state
        board.classList.toggle('show-confirmed', state.showConfirmed);

        // Filter by search query
        const filterItems = (items) => {
            if (!state.searchQuery) return items;
            const query = state.searchQuery.toLowerCase();
            return items.filter(tx =>
                (tx.content || '').toLowerCase().includes(query) ||
                (tx.customer_name || '').toLowerCase().includes(query) ||
                (tx.customer_phone || '').includes(query) ||
                String(tx.transfer_amount || '').includes(query)
            );
        };

        const filteredManual = filterItems(state.manualItems);
        const filteredAuto = filterItems(state.autoMatchedItems);
        const filteredConfirmed = filterItems(state.confirmedItems);

        board.innerHTML = `
            <!-- Column 1: NHẬP TAY -->
            <div class="kanban-column manual">
                <div class="kanban-column-header">
                    <div class="column-title">
                        <span>⚠️ NHẬP TAY</span>
                    </div>
                    <span class="column-count">${filteredManual.length}</span>
                </div>
                <div class="kanban-column-content" id="columnManual">
                    ${renderManualCards(filteredManual)}
                </div>
            </div>

            <!-- Column 2: TỰ ĐỘNG GÁN -->
            <div class="kanban-column auto">
                <div class="kanban-column-header">
                    <div class="column-title">
                        <span>✅ TỰ ĐỘNG GÁN</span>
                    </div>
                    <span class="column-count">${filteredAuto.length}</span>
                </div>
                <div class="kanban-column-content" id="columnAuto">
                    ${renderAutoCards(filteredAuto)}
                </div>
            </div>

            <!-- Column 3: ĐÃ XÁC NHẬN (controlled by board.show-confirmed class) -->
            <div class="kanban-column confirmed">
                <div class="kanban-column-header">
                    <div class="column-title">
                        <span>📦 ĐÃ XÁC NHẬN</span>
                    </div>
                    <span class="column-count">${filteredConfirmed.length}</span>
                </div>
                <div class="kanban-column-content" id="columnConfirmed">
                    ${renderConfirmedCards(filteredConfirmed)}
                </div>
            </div>
        `;

        // Update stats
        updateStats();

        // Re-render Lucide icons
        if (window.lucide) lucide.createIcons();
    }

    function renderManualCards(items) {
        if (items.length === 0) {
            return `<div class="kanban-empty">
                <i data-lucide="inbox"></i>
                <p>Không có giao dịch cần xử lý</p>
            </div>`;
        }

        return items.map(tx => {
            // Use transfer_amount and transfer_type (correct API fields)
            const amount = tx.transfer_amount || 0;
            const isPositive = tx.transfer_type === 'in';
            const hasPendingMatch = tx.has_pending_match || (tx.pending_match_skipped && tx.pending_match_options?.length > 0);
            const escapedContent = escapeHtml(tx.content || '');
            const fullContent = tx.content || '';

            if (hasPendingMatch && tx.pending_match_options?.length > 0) {
                // Row with dropdown
                // Structure: [{phone, count, customers: [{id, name, phone}]}]
                const options = tx.pending_match_options.flatMap(opt => {
                    const customers = opt.customers || [];
                    return customers.map(c => {
                        const customerId = c.id || c.customer_id || (c.phone ? `LOCAL_${c.phone}` : '');
                        const customerName = c.name || c.customer_name || 'N/A';
                        const customerPhone = c.phone || c.customer_phone || opt.phone || 'N/A';
                        if (!customerId) return '';
                        return `<option value="${escapeHtml(customerId)}" data-phone="${escapeHtml(customerPhone)}" data-name="${escapeHtml(customerName)}">${escapeHtml(customerName)} - ${escapeHtml(customerPhone)}</option>`;
                    }).join('');
                }).join('');

                return `
                    <div class="kanban-card manual has-dropdown" data-id="${tx.id}" data-pending-id="${tx.pending_match_id || ''}">
                        <span class="card-time">${formatTime(tx.transaction_date)}</span>
                        <span class="card-amount ${isPositive ? '' : 'negative'}">${formatCurrency(amount)}</span>
                        <span class="card-content" data-tooltip="${escapeHtml(fullContent)}"><span class="content-text">${escapedContent}</span></span>
                        <input type="text" class="card-note-input" id="note-${tx.id}" placeholder="Ghi chú..." maxlength="100">
                        <select class="customer-dropdown" data-id="${tx.id}">
                            <option value="">-- Chọn KH --</option>
                            ${options}
                        </select>
                        <button class="btn-assign" data-id="${tx.id}" disabled>Gán</button>
                    </div>
                `;
            } else {
                // Row with phone input + TPOS suggest - stacked vertically
                return `
                    <div class="kanban-card manual" data-id="${tx.id}">
                        <span class="card-time">${formatTime(tx.transaction_date)}</span>
                        <span class="card-amount ${isPositive ? '' : 'negative'}">${formatCurrency(amount)}</span>
                        <span class="card-content" data-tooltip="${escapeHtml(fullContent)}"><span class="content-text">${escapedContent}</span></span>
                        <input type="text" class="card-note-input" id="note-${tx.id}" placeholder="Ghi chú..." maxlength="100">
                        <div class="card-phone-input-group">
                            <span class="tpos-suggest empty" id="tpos-${tx.id}">Nhập SĐT...</span>
                            <input type="text" class="phone-input" id="phone-${tx.id}" placeholder="SĐT" data-id="${tx.id}" maxlength="11">
                        </div>
                        <button class="btn-assign" id="btn-${tx.id}" data-id="${tx.id}" disabled>Gán</button>
                    </div>
                `;
            }
        }).join('');
    }

    function renderAutoCards(items) {
        if (items.length === 0) {
            return `<div class="kanban-empty">
                <i data-lucide="check-circle"></i>
                <p>Không có giao dịch chờ xác nhận</p>
            </div>`;
        }

        return items.map(tx => {
            // Use transfer_amount and transfer_type (correct API fields)
            const amount = tx.transfer_amount || 0;
            const isPositive = tx.transfer_type === 'in';
            const methodClass = tx.match_method === 'qr_code' ? 'qr' : 'phone';
            const methodLabel = tx.match_method === 'qr_code' ? 'QR' : 'SĐT';
            const escapedContent = escapeHtml(tx.content || '');
            const fullContent = tx.content || '';

            return `
                <div class="kanban-card auto" data-id="${tx.id}">
                    <span class="card-time">${formatTime(tx.transaction_date)}</span>
                    <span class="card-amount ${isPositive ? '' : 'negative'}">${formatCurrency(amount)}</span>
                    <span class="card-content" data-tooltip="${escapeHtml(fullContent)}"><span class="content-text">${escapedContent}</span></span>
                    <div class="card-customer-info">
                        <span class="card-customer">${escapeHtml(tx.customer_name || 'Không tên')}</span>
                        <span class="card-phone">${escapeHtml(tx.customer_phone || '')}</span>
                    </div>
                    <input type="text" class="card-note-input" id="note-${tx.id}" placeholder="Ghi chú..." maxlength="100">
                    <button class="btn-confirm" data-id="${tx.id}">Xác nhận</button>
                </div>
            `;
        }).join('');
    }

    function renderConfirmedCards(items) {
        if (items.length === 0) {
            return `<div class="kanban-empty">
                <i data-lucide="package"></i>
                <p>Chưa có giao dịch đã xác nhận</p>
            </div>`;
        }

        return items.map(tx => {
            // Use transfer_amount and transfer_type (correct API fields)
            const amount = tx.transfer_amount || 0;
            const isPositive = tx.transfer_type === 'in';
            const methodClass = tx.match_method === 'qr_code' ? 'qr' :
                               tx.match_method === 'manual_entry' ? 'manual' : 'phone';
            const methodLabel = tx.match_method === 'qr_code' ? 'QR' :
                               tx.match_method === 'manual_entry' ? 'Tay' : 'SĐT';
            const escapedContent = escapeHtml(tx.content || '');
            const fullContent = tx.content || '';

            // Chỉ cho phép sửa với giao dịch NHẬP TAY (manual_entry), chưa được kế toán duyệt, và chưa cộng ví
            // Giao dịch tự động gán (qr_code, phone_match) KHÔNG cho phép sửa trong Live Mode
            // SECURITY: Nếu đã cộng ví (wallet_processed = true) thì KHÔNG cho phép sửa
            const canEdit = tx.match_method === 'manual_entry'
                && tx.verification_status !== 'APPROVED'
                && tx.wallet_processed !== true;

            return `
                <div class="kanban-card confirmed" data-id="${tx.id}">
                    <span class="card-time">${formatTime(tx.transaction_date)}</span>
                    <span class="card-amount ${isPositive ? '' : 'negative'}">${formatCurrency(amount)}</span>
                    <span class="card-content" data-tooltip="${escapeHtml(fullContent)}"><span class="content-text">${escapedContent}</span></span>
                    <div class="card-customer-info">
                        <span class="card-customer">${escapeHtml(tx.customer_name || 'Không tên')}</span>
                        <span class="card-phone">${escapeHtml(tx.customer_phone || '')}</span>
                    </div>
                    <span class="card-method ${methodClass}">${methodLabel}</span>
                    ${canEdit ? `<button class="btn-edit" data-id="${tx.id}">Sửa</button>` : ''}
                </div>
            `;
        }).join('');
    }

    function updateStats() {
        const totalGD = state.manualItems.length + state.autoMatchedItems.length + state.confirmedItems.length;
        // Use transfer_amount and filter for incoming only (transfer_type === 'in')
        const totalAmount = [...state.manualItems, ...state.autoMatchedItems, ...state.confirmedItems]
            .filter(tx => tx.transfer_type === 'in')
            .reduce((sum, tx) => sum + (tx.transfer_amount || 0), 0);

        const statsEl = document.getElementById('liveStatsTotal');
        if (statsEl) statsEl.textContent = totalGD;

        const amountEl = document.getElementById('liveStatsAmount');
        if (amountEl) amountEl.textContent = formatCurrency(totalAmount);

        const updateEl = document.getElementById('liveLastUpdate');
        if (updateEl && state.lastUpdate) {
            updateEl.textContent = state.lastUpdate.toLocaleTimeString('vi-VN');
        }

        // Update toggle button text
        const toggleBtn = document.getElementById('toggleConfirmedBtn');
        if (toggleBtn) {
            const count = state.confirmedItems.length;
            toggleBtn.innerHTML = `<i data-lucide="${state.showConfirmed ? 'eye' : 'eye-off'}" style="width:14px;height:14px;"></i> Đã XN (${count})`;
            toggleBtn.classList.toggle('active', state.showConfirmed);
            if (window.lucide) lucide.createIcons();
        }
    }

    // ===== EVENT HANDLERS =====

    async function onPhoneInput(input) {
        const phone = input.value.replace(/\D/g, '');
        const txId = input.dataset.id;
        const btn = document.getElementById(`btn-${txId}`);
        const tposSuggest = document.getElementById(`tpos-${txId}`);

        // Enable button if phone has 10+ digits
        if (btn) {
            btn.disabled = phone.length < 10;
        }

        // Update TPOS suggest display
        if (tposSuggest) {
            if (phone.length < 10) {
                tposSuggest.className = 'tpos-suggest empty';
                tposSuggest.textContent = phone.length > 0 ? `${phone.length}/10...` : 'Nhập SĐT...';
            } else if (phone.length === 10) {
                // Show loading
                tposSuggest.className = 'tpos-suggest loading';
                tposSuggest.textContent = 'Đang tìm...';

                try {
                    const customer = await lookupTPOS(phone);
                    if (customer && customer.name) {
                        tposSuggest.className = 'tpos-suggest found';
                        tposSuggest.textContent = truncateText(customer.name || customer.customer_name, 20);
                        tposSuggest.title = customer.name || customer.customer_name;
                    } else {
                        tposSuggest.className = 'tpos-suggest not-found';
                        tposSuggest.textContent = 'Không có TPOS';
                    }
                } catch (err) {
                    console.log('TPOS lookup failed:', err);
                    tposSuggest.className = 'tpos-suggest not-found';
                    tposSuggest.textContent = 'Lỗi lookup';
                }
            }
        }
    }

    function onDropdownChange(select) {
        const txId = select.dataset.id;
        const card = document.querySelector(`.kanban-card[data-id="${txId}"]`);
        const btn = card?.querySelector('.btn-assign');
        if (btn) {
            btn.disabled = !select.value;
        }
    }

    function onSearchInput(input) {
        // Debounce search
        if (state.searchDebounceTimer) {
            clearTimeout(state.searchDebounceTimer);
        }
        state.searchDebounceTimer = setTimeout(() => {
            state.searchQuery = input.value;
            renderKanbanBoard();
        }, 300);
    }

    function toggleConfirmedColumn() {
        state.showConfirmed = !state.showConfirmed;
        localStorage.setItem('balanceHistory_livemode_show_confirmed', state.showConfirmed);

        // Toggle class on board without re-rendering
        const board = document.getElementById('kanbanBoard');
        if (board) {
            board.classList.toggle('show-confirmed', state.showConfirmed);
        }

        // Update button UI
        updateStats();
    }

    // ===== TPOS CACHE WITH EXPIRY =====

    async function lookupTPOS(phone) {
        const now = Date.now();

        // Check cache with expiry
        if (state.tposCache.has(phone)) {
            const cached = state.tposCache.get(phone);
            if (now - cached.timestamp < state.tposCacheExpiry) {
                return cached.data;
            }
            // Expired, remove
            state.tposCache.delete(phone);
        }

        // Enforce cache size limit
        if (state.tposCache.size >= state.tposCacheMaxSize) {
            // Remove oldest entry
            const oldestKey = state.tposCache.keys().next().value;
            state.tposCache.delete(oldestKey);
        }

        // Correct endpoint: /api/sepay/tpos/customer/{phone}
        const response = await fetch(`${API_BASE}/api/sepay/tpos/customer/${phone}`);
        const result = await response.json();

        // Handle response format: { success, data: [], count }
        if (result.success && result.data && result.data.length > 0) {
            const customer = result.data[0]; // First matching customer
            // Cache with timestamp
            state.tposCache.set(phone, { data: customer, timestamp: now });
            return customer;
        }

        // No customer found - cache null to avoid repeated lookups
        state.tposCache.set(phone, { data: null, timestamp: now });
        return null;
    }

    // ===== API ACTIONS =====

    async function assignManual(txId) {
        const phoneInput = document.getElementById(`phone-${txId}`);
        const btn = document.getElementById(`btn-${txId}`);
        const noteInput = document.getElementById(`note-${txId}`);
        const phone = phoneInput?.value.replace(/\D/g, '');
        const staffNote = noteInput?.value?.trim() || '';

        if (!phone || phone.length < 10) {
            showNotification('Vui lòng nhập số điện thoại hợp lệ (10 số)', 'error');
            return;
        }

        // Lấy tên khách hàng từ gợi ý TPOS (element tpos-${txId} có title = full name)
        const tposSuggestEl = document.getElementById(`tpos-${txId}`);
        const customerName = tposSuggestEl?.title || tposSuggestEl?.textContent || '';

        setButtonLoading(btn, true);
        setCardProcessing(txId, true);

        try {
            // 1. Gán SĐT - LUÔN gửi is_manual_entry: true vì nhập từ Live Mode
            const response = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/phone`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone,
                    name: customerName,
                    is_manual_entry: true,  // Nhập tay từ Live Mode → chờ kế toán duyệt
                    entered_by: window.authManager?.getUserInfo()?.username || 'staff',
                    staff_note: staffNote
                })
            });

            if (!response.ok) {
                throw new Error('Gán SĐT thất bại');
            }

            // 2. Đánh dấu hidden = true (chuyển thẳng sang ĐÃ XÁC NHẬN)
            const hideResponse = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/hidden`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hidden: true, staff_note: staffNote })
            });

            if (!hideResponse.ok) {
                // Partial success - phone was assigned but hide failed
                showNotification('Đã gán SĐT nhưng chưa xác nhận được. Vui lòng thử xác nhận lại.', 'warning');
                await loadTransactions();
                return;
            }

            showNotification('Đã gán và xác nhận giao dịch!', 'success');

            // Audit logging - xác nhận khách live-mode (manual phone entry)
            try {
                if (window.AuditLogger) {
                    window.AuditLogger.logAction('livemode_confirm_customer', {
                        module: 'balance-history',
                        description: 'Gán SĐT ' + phone + ' và xác nhận giao dịch #' + txId,
                        oldData: null,
                        newData: { txId: String(txId), customerPhone: phone, staffNote: staffNote },
                        entityId: String(txId),
                        entityType: 'transaction'
                    });
                }
            } catch (e) { /* audit log error - ignore */ }

            // Move item from manualItems to confirmedItems locally
            const txIndex = state.manualItems.findIndex(t => String(t.id) === String(txId));
            if (txIndex !== -1) {
                const tx = state.manualItems[txIndex];
                tx.is_hidden = true;
                tx.customer_phone = phone;
                tx.customer_name = customerName;  // Lấy tên từ gợi ý TPOS
                tx.match_method = 'manual_entry';
                tx.staff_note = staffNote;
                state.manualItems.splice(txIndex, 1);
                state.confirmedItems.unshift(tx);
            }

            // Re-render without fetching from API
            renderKanbanBoard();

        } catch (err) {
            console.error('assignManual error:', err);
            showNotification(getUserFriendlyError(err), 'error');
        } finally {
            setButtonLoading(btn, false);
            setCardProcessing(txId, false);
        }
    }

    async function assignFromDropdown(txId) {
        const card = document.querySelector(`.kanban-card[data-id="${txId}"]`);
        const dropdown = document.querySelector(`.customer-dropdown[data-id="${txId}"]`);
        const btn = card?.querySelector('.btn-assign');
        const noteInput = document.getElementById(`note-${txId}`);
        const pendingMatchId = card?.dataset.pendingId;
        const customerId = dropdown?.value;
        const staffNote = noteInput?.value?.trim() || '';

        if (!customerId) {
            showNotification('Vui lòng chọn khách hàng', 'error');
            return;
        }

        // Get customer info from selected option
        const selectedOption = dropdown.options[dropdown.selectedIndex];
        const customerPhone = selectedOption?.dataset.phone || '';
        const customerName = selectedOption?.dataset.name || '';

        setButtonLoading(btn, true);
        setCardProcessing(txId, true);

        try {
            // Resolve pending match using pendingMatchId and customer_id
            const response = await fetch(`${API_BASE}/api/sepay/pending-matches/${pendingMatchId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_id: customerId.startsWith('LOCAL_') ? customerId : parseInt(customerId),
                    resolved_by: JSON.parse(localStorage.getItem('n2shop_current_user') || '{}').username || 'admin',
                    staff_note: staffNote
                })
            });

            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.error || 'Resolve thất bại');
            }

            // Đánh dấu hidden = true
            const hideResponse = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/hidden`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hidden: true, staff_note: staffNote })
            });

            if (!hideResponse.ok) {
                showNotification(`Đã gán ${customerName} nhưng chưa xác nhận được. Vui lòng thử lại.`, 'warning');
                await loadTransactions();
                return;
            }

            showNotification(`Đã gán ${customerName} (${customerPhone}) và xác nhận!`, 'success');

            // Move item from manualItems to confirmedItems locally
            const txIndex = state.manualItems.findIndex(t => String(t.id) === String(txId));
            if (txIndex !== -1) {
                const tx = state.manualItems[txIndex];
                tx.is_hidden = true;
                tx.customer_phone = customerPhone;
                tx.customer_name = customerName;
                tx.match_method = 'manual_entry';
                tx.staff_note = staffNote;
                state.manualItems.splice(txIndex, 1);
                state.confirmedItems.unshift(tx);
            }

            // Re-render without fetching from API
            renderKanbanBoard();

        } catch (err) {
            console.error('assignFromDropdown error:', err);
            showNotification(getUserFriendlyError(err), 'error');
        } finally {
            setButtonLoading(btn, false);
            setCardProcessing(txId, false);
        }
    }

    async function confirmAutoMatched(txId) {
        const btn = document.querySelector(`.kanban-card[data-id="${txId}"] .btn-confirm`);
        const noteInput = document.getElementById(`note-${txId}`);
        const staffNote = noteInput?.value?.trim() || '';

        setButtonLoading(btn, true);
        setCardProcessing(txId, true);

        try {
            const response = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/hidden`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hidden: true, staff_note: staffNote })
            });

            if (!response.ok) throw new Error('Xác nhận thất bại');

            // Move item from autoMatchedItems to confirmedItems locally
            const txIndex = state.autoMatchedItems.findIndex(t => String(t.id) === String(txId));
            if (txIndex !== -1) {
                const tx = state.autoMatchedItems[txIndex];
                tx.is_hidden = true;  // Mark as confirmed
                tx.staff_note = staffNote;
                state.autoMatchedItems.splice(txIndex, 1);
                state.confirmedItems.unshift(tx);  // Add to top of confirmed list
            }

            showNotification('Đã xác nhận giao dịch!', 'success');

            // Audit logging - xác nhận khách live-mode
            try {
                if (window.AuditLogger) {
                    var confirmedTx = state.confirmedItems[0]; // just moved to top
                    window.AuditLogger.logAction('livemode_confirm_customer', {
                        module: 'balance-history',
                        description: 'Xác nhận giao dịch #' + txId + ' (auto-matched)',
                        oldData: null,
                        newData: { txId: String(txId), customerPhone: confirmedTx?.customer_phone || '', customerName: confirmedTx?.customer_name || '', staffNote: staffNote },
                        entityId: String(txId),
                        entityType: 'transaction'
                    });
                }
            } catch (e) { /* audit log error - ignore */ }

            // Re-render without fetching from API
            renderKanbanBoard();

        } catch (err) {
            console.error('confirmAutoMatched error:', err);
            showNotification(getUserFriendlyError(err), 'error');
        } finally {
            setButtonLoading(btn, false);
            setCardProcessing(txId, false);
        }
    }

    function editConfirmedItem(txId) {
        // Mở modal chỉnh sửa có sẵn
        const tx = state.confirmedItems.find(t => String(t.id) === String(txId));
        if (!tx) return;

        // Sử dụng modal editCustomerModal có sẵn trong index.html
        const modal = document.getElementById('editCustomerModal');
        const phoneInput = document.getElementById('editCustomerPhone');
        const nameInput = document.getElementById('editCustomerName');
        const codeSpan = document.getElementById('editCustomerUniqueCode');
        const tposContainer = document.getElementById('tposLookupContainer');
        const form = document.getElementById('editCustomerForm');

        if (modal && phoneInput && nameInput) {
            if (codeSpan) codeSpan.textContent = tx.reference_code || tx.id;
            // Use customer_phone and customer_name (correct API fields)
            phoneInput.value = tx.customer_phone || '';
            if (nameInput) nameInput.value = tx.customer_name || '';

            // Store current tx id for form submission
            modal.dataset.txId = txId;
            modal.dataset.isLiveMode = 'true';  // Flag để biết đang gọi từ Live Mode

            // Show TPOS lookup container
            if (tposContainer) tposContainer.style.display = 'block';

            // Reset TPOS lookup display
            resetTposLookupDisplay();

            // Attach phone input listener for TPOS lookup
            if (!phoneInput.dataset.liveModeListener) {
                phoneInput.dataset.liveModeListener = 'true';
                phoneInput.addEventListener('input', onEditPhoneInput);
            }

            // Attach form submit handler for Live Mode
            if (!form.dataset.liveModeListener) {
                form.dataset.liveModeListener = 'true';
                form.addEventListener('submit', onEditFormSubmit);
            }

            modal.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        }
    }

    // Reset TPOS lookup display elements
    function resetTposLookupDisplay() {
        const loadingEl = document.getElementById('tposLookupLoading');
        const resultEl = document.getElementById('tposLookupResult');
        const singleEl = document.getElementById('tposLookupSingle');
        const multipleEl = document.getElementById('tposLookupMultiple');
        const emptyEl = document.getElementById('tposLookupEmpty');
        const noteEl = document.getElementById('tposLookupNote');

        if (loadingEl) loadingEl.style.display = 'none';
        if (resultEl) resultEl.style.display = 'none';
        if (singleEl) singleEl.style.display = 'none';
        if (multipleEl) multipleEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        if (noteEl) noteEl.style.display = 'block';
    }

    // Handle phone input in edit modal - TPOS lookup
    async function onEditPhoneInput(e) {
        const phone = e.target.value.replace(/\D/g, '');
        const loadingEl = document.getElementById('tposLookupLoading');
        const resultEl = document.getElementById('tposLookupResult');
        const singleEl = document.getElementById('tposLookupSingle');
        const multipleEl = document.getElementById('tposLookupMultiple');
        const emptyEl = document.getElementById('tposLookupEmpty');
        const noteEl = document.getElementById('tposLookupNote');
        const nameEl = document.getElementById('tposLookupName');
        const nameInput = document.getElementById('editCustomerName');

        // Hide note when typing
        if (noteEl && phone.length > 0) noteEl.style.display = 'none';

        // Only lookup when 10 digits
        if (phone.length !== 10) {
            if (resultEl) resultEl.style.display = 'none';
            if (loadingEl) loadingEl.style.display = 'none';
            if (noteEl && phone.length === 0) noteEl.style.display = 'block';
            return;
        }

        // Show loading
        if (loadingEl) loadingEl.style.display = 'block';
        if (resultEl) resultEl.style.display = 'none';

        try {
            const customer = await lookupTPOS(phone);

            if (loadingEl) loadingEl.style.display = 'none';
            if (resultEl) resultEl.style.display = 'block';

            if (customer) {
                // Single customer found
                if (singleEl) singleEl.style.display = 'flex';
                if (multipleEl) multipleEl.style.display = 'none';
                if (emptyEl) emptyEl.style.display = 'none';
                if (nameEl) nameEl.textContent = customer.name || customer.customer_name || 'N/A';
                // Auto-fill name input
                if (nameInput) nameInput.value = customer.name || customer.customer_name || '';
            } else {
                // No customer found
                if (singleEl) singleEl.style.display = 'none';
                if (multipleEl) multipleEl.style.display = 'none';
                if (emptyEl) emptyEl.style.display = 'block';
            }

            if (window.lucide) lucide.createIcons();

        } catch (err) {
            console.error('TPOS lookup error:', err);
            if (loadingEl) loadingEl.style.display = 'none';
            if (resultEl) resultEl.style.display = 'block';
            if (emptyEl) emptyEl.style.display = 'block';
            if (singleEl) singleEl.style.display = 'none';
            if (multipleEl) multipleEl.style.display = 'none';
        }
    }

    // Handle form submit in edit modal for Live Mode
    async function onEditFormSubmit(e) {
        const modal = document.getElementById('editCustomerModal');
        const isLiveMode = modal?.dataset.isLiveMode === 'true';

        // Only handle if from Live Mode
        if (!isLiveMode) return;

        // Prevent default and stop propagation to prevent main.js handler
        e.preventDefault();
        e.stopImmediatePropagation();

        const txId = modal.dataset.txId;
        const phoneInput = document.getElementById('editCustomerPhone');
        const nameInput = document.getElementById('editCustomerName');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        const phone = phoneInput?.value.replace(/\D/g, '');
        const name = nameInput?.value.trim();

        if (!phone || phone.length < 10) {
            showNotification('Vui lòng nhập số điện thoại hợp lệ (10 số)', 'error');
            return;
        }

        // Disable button
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Đang lưu...';
        }

        try {
            // Update phone via API - nhập tay từ Live Mode
            const response = await fetch(`${API_BASE}/api/sepay/transaction/${txId}/phone`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone,
                    name: name,
                    is_manual_entry: true,  // Nhập tay từ Live Mode → chờ kế toán duyệt
                    entered_by: window.authManager?.getUserInfo()?.username || 'staff'
                })
            });

            if (!response.ok) throw new Error('Cập nhật thất bại');

            // Update local state
            const txIndex = state.confirmedItems.findIndex(t => String(t.id) === String(txId));
            if (txIndex !== -1) {
                state.confirmedItems[txIndex].customer_phone = phone;
                state.confirmedItems[txIndex].customer_name = name;
            }

            showNotification('Đã cập nhật thông tin khách hàng!', 'success');

            // Close modal
            modal.style.display = 'none';
            modal.dataset.isLiveMode = 'false';

            // Re-render
            renderKanbanBoard();

        } catch (err) {
            console.error('Update customer error:', err);
            showNotification(getUserFriendlyError(err), 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="save"></i> Lưu thông tin';
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    // ===== DATA LOADING =====

    async function loadTransactions() {
        state.isLoading = true;
        updateLoadingState(true);

        try {
            // Fetch wider date range (7 days back from filter date), client will filter
            const endDate = state.filterEndDate || new Date().toISOString().split('T')[0];
            const startDateObj = new Date(endDate);
            startDateObj.setDate(startDateObj.getDate() - 7);
            const fetchStartDate = startDateObj.toISOString().split('T')[0];

            const params = new URLSearchParams({
                startDate: fetchStartDate,
                endDate: endDate,
                limit: 1000,
                showHidden: 'true'  // Include confirmed (hidden) transactions
            });

            console.log('[LiveMode] Fetching transactions:', fetchStartDate, 'to', endDate);

            const response = await fetch(`${API_BASE}/api/sepay/history?${params}`);
            if (!response.ok) throw new Error('Load transactions failed');

            const data = await response.json();
            const transactions = data.transactions || data.data || [];

            // Classify into columns
            classifyAllTransactions(transactions);

            state.lastUpdate = new Date();
            state.isLoading = false;

            renderKanbanBoard();

        } catch (err) {
            console.error('loadTransactions error:', err);
            showNotification(getUserFriendlyError(err), 'error');
            state.isLoading = false;
        }

        updateLoadingState(false);
    }

    function updateLoadingState(isLoading) {
        const board = document.getElementById('kanbanBoard');
        if (!board) return;

        if (isLoading && state.manualItems.length === 0 && state.autoMatchedItems.length === 0) {
            board.innerHTML = `
                <div class="kanban-loading">
                    <i data-lucide="loader-2"></i>
                    Đang tải dữ liệu...
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }

    // ===== SSE REALTIME WITH EXPONENTIAL BACKOFF =====

    function connectSSE() {
        if (state.sseConnection) {
            state.sseConnection.close();
        }

        try {
            state.sseConnection = new EventSource(SSE_URL);

            state.sseConnection.onopen = () => {
                console.log('[LiveMode] SSE connected');
                state.sseReconnectAttempts = 0;
                updateSSEStatus(true);
            };

            // Listen for specific SSE event types (same as main.js)
            state.sseConnection.addEventListener('new-transaction', (event) => {
                console.log('[LiveMode] SSE new-transaction received');
                handleSSEMessage({ type: 'new-transaction', data: JSON.parse(event.data) });
            });

            state.sseConnection.addEventListener('customer-info-updated', (event) => {
                console.log('[LiveMode] SSE customer-info-updated received');
                handleSSEMessage({ type: 'customer-info-updated', data: JSON.parse(event.data) });
            });

            state.sseConnection.addEventListener('pending-match-created', (event) => {
                console.log('[LiveMode] SSE pending-match-created received');
                handleSSEMessage({ type: 'pending-match-created', data: JSON.parse(event.data) });
            });

            state.sseConnection.addEventListener('connected', (event) => {
                console.log('[LiveMode] SSE connected event:', JSON.parse(event.data));
            });

            state.sseConnection.onerror = () => {
                console.log('[LiveMode] SSE error, reconnecting...');
                updateSSEStatus(false);
                state.sseConnection.close();

                if (state.sseReconnectAttempts < state.maxReconnectAttempts) {
                    state.sseReconnectAttempts++;
                    // True exponential backoff: 1s, 2s, 4s, 8s... max 30s
                    const delay = Math.min(1000 * Math.pow(2, state.sseReconnectAttempts), 30000);
                    console.log(`[LiveMode] Reconnecting in ${delay}ms (attempt ${state.sseReconnectAttempts})`);
                    setTimeout(connectSSE, delay);
                } else {
                    console.log('[LiveMode] Max reconnect attempts reached');
                    showNotification('Mất kết nối realtime. Vui lòng tải lại trang.', 'warning');
                }
            };

        } catch (err) {
            console.error('[LiveMode] SSE connection error:', err);
            updateSSEStatus(false);
        }
    }

    function handleSSEMessage(message) {
        const { type, data } = message;
        console.log('[LiveMode] handleSSEMessage:', type);

        // All event types should trigger a reload to get fresh data
        if (type === 'new-transaction' || type === 'customer-info-updated' || type === 'pending-match-created') {
            // Debounce rapid updates - wait 500ms before reloading
            if (state.sseDebounceTimer) {
                clearTimeout(state.sseDebounceTimer);
            }
            state.sseDebounceTimer = setTimeout(() => {
                console.log('[LiveMode] Reloading transactions after SSE event');
                loadTransactions();
            }, 500);
        }
    }

    function updateSSEStatus(connected) {
        const statusEl = document.getElementById('sseStatus');
        if (!statusEl) return;

        if (connected) {
            statusEl.className = 'sse-status connected';
            statusEl.innerHTML = '<span class="status-dot"></span> Realtime';
        } else {
            statusEl.className = 'sse-status disconnected';
            statusEl.innerHTML = '<span class="status-dot"></span> Offline';
        }
    }

    function disconnectSSE() {
        if (state.sseConnection) {
            state.sseConnection.close();
            state.sseConnection = null;
        }
    }

    // ===== NOTIFICATION =====

    function showNotification(message, type = 'info') {
        if (window.notificationManager) {
            window.notificationManager.show(message, type);
        } else if (window.getNotificationManager) {
            window.getNotificationManager().show(message, type);
        } else {
            console.log(`[${type}] ${message}`);
            // Fallback: simple alert for errors
            if (type === 'error') {
                alert(message);
            }
        }
    }

    // ===== TOOLTIP WITH FIXED POSITION =====

    let tooltipElement = null;

    function createTooltip() {
        if (tooltipElement) return;
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'live-tooltip';
        tooltipElement.style.display = 'none';
        document.body.appendChild(tooltipElement);
    }

    function showTooltip(e) {
        const target = e.target.closest('.card-content[data-tooltip]');
        if (!target) return;

        createTooltip();
        const text = target.getAttribute('data-tooltip');
        if (!text) return;

        tooltipElement.textContent = text;
        tooltipElement.style.display = 'block';

        // Position below the element
        const rect = target.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left;

        // Keep tooltip within viewport
        const tooltipRect = tooltipElement.getBoundingClientRect();
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        if (top + tooltipRect.height > window.innerHeight - 10) {
            // Show above instead
            top = rect.top - tooltipRect.height - 6;
        }

        tooltipElement.style.top = top + 'px';
        tooltipElement.style.left = Math.max(10, left) + 'px';
    }

    function hideTooltip() {
        if (tooltipElement) {
            tooltipElement.style.display = 'none';
        }
    }

    // ===== EVENT DELEGATION =====

    function setupEventDelegation() {
        const board = document.getElementById('kanbanBoard');
        if (!board || board.dataset.listenerAttached) return;

        board.dataset.listenerAttached = 'true';

        // Tooltip events - mouseover/mouseout for instant display
        board.addEventListener('mouseover', showTooltip);
        board.addEventListener('mouseout', (e) => {
            if (e.target.closest('.card-content[data-tooltip]')) {
                hideTooltip();
            }
        });

        // Click events
        board.addEventListener('click', (e) => {
            const target = e.target;

            // Assign button (manual)
            if (target.classList.contains('btn-assign')) {
                const txId = target.dataset.id;
                const card = target.closest('.kanban-card');
                if (card?.classList.contains('has-dropdown')) {
                    assignFromDropdown(txId);
                } else {
                    assignManual(txId);
                }
                return;
            }

            // Confirm button
            if (target.classList.contains('btn-confirm')) {
                const txId = target.dataset.id;
                confirmAutoMatched(txId);
                return;
            }

            // Edit button
            if (target.classList.contains('btn-edit')) {
                const txId = target.dataset.id;
                editConfirmedItem(txId);
                return;
            }
        });

        // Input events
        board.addEventListener('input', (e) => {
            const target = e.target;

            if (target.classList.contains('phone-input')) {
                onPhoneInput(target);
            }
        });

        // Change events (dropdown)
        board.addEventListener('change', (e) => {
            const target = e.target;

            if (target.classList.contains('customer-dropdown')) {
                onDropdownChange(target);
            }
        });
    }

    // ===== INITIALIZATION =====

    function init() {
        if (state.initialized) return;

        console.log('[LiveMode] Initializing Kanban...');

        // Load saved preference
        state.showConfirmed = localStorage.getItem('balanceHistory_livemode_show_confirmed') === 'true';

        // Initial load
        loadTransactions();

        // Connect SSE
        connectSSE();

        // Set up event listeners
        setupEventListeners();
        setupEventDelegation();

        state.initialized = true;
    }

    function setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('liveSearchInput');
        if (searchInput && !searchInput.dataset.listenerAttached) {
            searchInput.dataset.listenerAttached = 'true';
            searchInput.addEventListener('input', (e) => onSearchInput(e.target));
        }

        // Toggle button
        const toggleBtn = document.getElementById('toggleConfirmedBtn');
        if (toggleBtn && !toggleBtn.dataset.listenerAttached) {
            toggleBtn.dataset.listenerAttached = 'true';
            toggleBtn.addEventListener('click', toggleConfirmedColumn);
        }

        // Refresh button
        const refreshBtn = document.getElementById('liveRefreshBtn');
        if (refreshBtn && !refreshBtn.dataset.listenerAttached) {
            refreshBtn.dataset.listenerAttached = 'true';
            refreshBtn.addEventListener('click', loadTransactions);
        }

        // Date filter inputs
        const startDateInput = document.getElementById('liveStartDate');
        const endDateInput = document.getElementById('liveEndDate');
        const startDateDisplay = document.getElementById('liveStartDateDisplay');
        const endDateDisplay = document.getElementById('liveEndDateDisplay');

        if (startDateInput && !startDateInput.dataset.listenerAttached) {
            startDateInput.dataset.listenerAttached = 'true';
            // Set initial value (native date input uses yyyy-mm-dd)
            startDateInput.value = state.filterStartDate;
            if (startDateDisplay) {
                startDateDisplay.value = formatDateDisplay(state.filterStartDate);
            }
            startDateInput.addEventListener('change', onDateFilterChange);
        }

        if (endDateInput && !endDateInput.dataset.listenerAttached) {
            endDateInput.dataset.listenerAttached = 'true';
            // Set initial value (native date input uses yyyy-mm-dd)
            endDateInput.value = state.filterEndDate;
            if (endDateDisplay) {
                endDateDisplay.value = formatDateDisplay(state.filterEndDate);
            }
            endDateInput.addEventListener('change', onDateFilterChange);
        }

        // Display input events (manual text entry) - only validate on blur, no auto-format
        if (startDateDisplay && !startDateDisplay.dataset.listenerAttached) {
            startDateDisplay.dataset.listenerAttached = 'true';
            startDateDisplay.addEventListener('blur', () => onDisplayDateBlur('start'));
        }

        if (endDateDisplay && !endDateDisplay.dataset.listenerAttached) {
            endDateDisplay.dataset.listenerAttached = 'true';
            endDateDisplay.addEventListener('blur', () => onDisplayDateBlur('end'));
        }

        // Time filter inputs
        const startTimeInput = document.getElementById('liveStartTime');
        const endTimeInput = document.getElementById('liveEndTime');

        if (startTimeInput && !startTimeInput.dataset.listenerAttached) {
            startTimeInput.dataset.listenerAttached = 'true';
            startTimeInput.value = state.filterStartTime;
            startTimeInput.addEventListener('change', onTimeFilterChange);
        }

        if (endTimeInput && !endTimeInput.dataset.listenerAttached) {
            endTimeInput.dataset.listenerAttached = 'true';
            endTimeInput.value = state.filterEndTime;
            endTimeInput.addEventListener('change', onTimeFilterChange);
        }
    }

    // Handle blur on display input - validate and sync
    function onDisplayDateBlur(type) {
        const displayId = type === 'start' ? 'liveStartDateDisplay' : 'liveEndDateDisplay';
        const hiddenId = type === 'start' ? 'liveStartDate' : 'liveEndDate';
        const displayInput = document.getElementById(displayId);
        const hiddenInput = document.getElementById(hiddenId);

        if (!displayInput || !hiddenInput) return;

        const parsed = parseDateDisplay(displayInput.value);
        if (parsed) {
            // Normalize display format
            displayInput.value = formatDateDisplay(parsed);
            hiddenInput.value = parsed;
            if (type === 'start') {
                state.filterStartDate = parsed;
            } else {
                state.filterEndDate = parsed;
            }
            console.log('[LiveMode] Date manually entered:', type, parsed);
            loadTransactions();
        }
    }

    // Parse dd/mm/yyyy to yyyy-mm-dd
    function parseDateDisplay(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            if (year.length === 4 && !isNaN(Date.parse(`${year}-${month}-${day}`))) {
                return `${year}-${month}-${day}`;
            }
        }
        return null;
    }

    // Format date for display: yyyy-mm-dd -> dd/mm/yyyy
    function formatDateDisplay(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    // Handle date filter change
    function onDateFilterChange() {
        const startInput = document.getElementById('liveStartDate');
        const endInput = document.getElementById('liveEndDate');
        const startDisplay = document.getElementById('liveStartDateDisplay');
        const endDisplay = document.getElementById('liveEndDateDisplay');

        // Native date input already returns yyyy-mm-dd format
        if (startInput && startInput.value) {
            state.filterStartDate = startInput.value;
            if (startDisplay) {
                startDisplay.value = formatDateDisplay(startInput.value);
            }
        }
        if (endInput && endInput.value) {
            state.filterEndDate = endInput.value;
            if (endDisplay) {
                endDisplay.value = formatDateDisplay(endInput.value);
            }
        }

        console.log('[LiveMode] Date filter changed:', state.filterStartDate, 'to', state.filterEndDate);

        // Reload with new date range
        loadTransactions();
    }

    // Handle time filter change
    function onTimeFilterChange() {
        const startTimeInput = document.getElementById('liveStartTime');
        const endTimeInput = document.getElementById('liveEndTime');

        if (startTimeInput && startTimeInput.value) {
            state.filterStartTime = startTimeInput.value;
        }
        if (endTimeInput && endTimeInput.value) {
            state.filterEndTime = endTimeInput.value;
        }

        console.log('[LiveMode] Time filter changed:', state.filterStartTime, 'to', state.filterEndTime);

        // Reload with new time range
        loadTransactions();
    }

    function destroy() {
        disconnectSSE();

        // Clear cache
        state.tposCache.clear();

        // Clear debounce timer
        if (state.searchDebounceTimer) {
            clearTimeout(state.searchDebounceTimer);
        }

        // Remove tooltip element
        if (tooltipElement) {
            tooltipElement.remove();
            tooltipElement = null;
        }

        state.initialized = false;
    }

    // ===== PUBLIC API =====
    return {
        init,
        destroy,
        loadTransactions,
        onPhoneInput,
        onDropdownChange,
        assignManual,
        assignFromDropdown,
        confirmAutoMatched,
        editConfirmedItem,
        toggleConfirmedColumn,
    };

})();

// Export to window
window.LiveModeModule = LiveModeModule;
