/**
 * POST-SALES ISSUE TRACKING
 * Powered by Firebase & TPOS API
 */

// Global State
let TICKETS = [];
let selectedOrder = null;
let currentTicketSubscription = null;
let currentCustomer = null; // NEW: Store current customer info

// Settings Management
const SETTINGS_KEY = 'issue_tracking_settings';
const DEFAULT_SETTINGS = {
    printBillEnabled: false  // Default: off
};

let appSettings = { ...DEFAULT_SETTINGS };

// Notification Manager instance
let notificationManager = null;

// DOM Elements
const elements = {
    tabs: document.querySelectorAll('.tab-btn'),
    ticketList: document.getElementById('ticket-list-body'),
    countPendingGoods: document.getElementById('count-pending-goods'),
    countPendingFinance: document.getElementById('count-pending-finance'),
    countCompleted: document.getElementById('count-completed-today'),
    badgePendingGoods: document.getElementById('badge-pending-goods'),
    badgePendingFinance: document.getElementById('badge-pending-finance'),
    modalCreate: document.getElementById('modal-create-ticket'),
    modalConfirm: document.getElementById('modal-confirm-action'),
    btnCreate: document.getElementById('btn-create-ticket'),
    btnSearchOrder: document.getElementById('btn-search-order'),
    inpSearchOrder: document.getElementById('order-search-input'),
    closeButtons: document.querySelectorAll('.close-modal, .close-modal-btn'),
    loadingOverlay: document.createElement('div'), // Creating loading overlay

    // NEW: Customer Info Elements
    customerInfoSection: document.getElementById('customer-info-section'),
    customerInfoName: document.getElementById('customer-info-name'),
    customerInfoPhone: document.getElementById('customer-info-phone'),
    customerInfoTier: document.getElementById('customer-info-tier'),
    customerInfoWalletBalance: document.getElementById('customer-info-wallet-balance'),
    customerInfoNewCustomerWarning: document.getElementById('customer-info-new-customer-warning')
};

/**
 * INITIALIZATION
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Notification Manager
    notificationManager = new NotificationManager();

    // Load settings from localStorage
    loadSettings();

    // Setup UI
    initLoadingOverlay();
    initTabs();
    initModalHandlers();
    initReconcileHandlers();
    initSettingsHandlers();

    // Subscribe to Firebase Realtime Data
    console.log('[APP] Initializing Firebase subscription...');
    currentTicketSubscription = ApiService.subscribeToTickets((tickets) => {
        console.log('[APP] Received tickets update:', tickets.length);
        TICKETS = tickets;
        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'pending-goods';
        renderDashboard(activeTab);
        updateStats();
    });

    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
    }

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// Flag to track if mermaid diagram has been rendered
let mermaidRendered = false;

/**
 * Toggle flow details visibility and init mermaid on first show
 */
function toggleFlowDetails() {
    const flowDetails = document.getElementById('flow-details');
    if (!flowDetails) return;

    const isHidden = flowDetails.classList.contains('hidden');
    flowDetails.classList.toggle('hidden');

    // Initialize mermaid only on first show (when element becomes visible)
    if (isHidden && !mermaidRendered && typeof mermaid !== 'undefined') {
        try {
            mermaid.init(undefined, flowDetails.querySelectorAll('.mermaid'));
            mermaidRendered = true;
            console.log('[MERMAID] Diagram rendered successfully');
        } catch (e) {
            console.error('[MERMAID] Error rendering diagram:', e);
        }
    }
}

/**
 * SETTINGS MANAGEMENT
 */
function loadSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            appSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
        console.log('[SETTINGS] Loaded:', appSettings);
    } catch (e) {
        console.error('[SETTINGS] Load error:', e);
        appSettings = { ...DEFAULT_SETTINGS };
    }
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
        console.log('[SETTINGS] Saved:', appSettings);
    } catch (e) {
        console.error('[SETTINGS] Save error:', e);
    }
}

function initSettingsHandlers() {
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const modalSettings = document.getElementById('modal-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const togglePrintBill = document.getElementById('setting-print-bill');

    if (btnOpenSettings && modalSettings) {
        btnOpenSettings.addEventListener('click', () => {
            // Load current settings into UI
            if (togglePrintBill) {
                togglePrintBill.checked = appSettings.printBillEnabled;
            }
            openModal(modalSettings);
        });
    }

    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
            // Save settings from UI
            if (togglePrintBill) {
                appSettings.printBillEnabled = togglePrintBill.checked;
            }
            saveSettings();
            closeModal(modalSettings);
            notificationManager.success('Đã lưu cài đặt');
        });
    }
}

function initLoadingOverlay() {
    elements.loadingOverlay.id = 'loading-overlay';
    elements.loadingOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(255,255,255,0.7); z-index: 9999;
        display: none; align-items: center; justify-content: center;
        font-size: 1.5rem; color: #333;
    `;
    elements.loadingOverlay.innerHTML = '<div>⏳ Đang xử lý...</div>';
    document.body.appendChild(elements.loadingOverlay);
}

function showLoading(show) {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
}

function initTabs() {
    elements.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.tabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderDashboard(btn.dataset.tab);
        });
    });
}

function initModalHandlers() {
    // Open Create Modal
    elements.btnCreate.addEventListener('click', () => {
        openModal(elements.modalCreate);
        resetCreateForm();
        // Focus search input
        setTimeout(() => elements.inpSearchOrder.focus(), 100);
    });

    // Close Modals
    elements.closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.closest('.modal'));
        });
    });

    // Dashboard Search Input Listener
    const searchInput = document.getElementById('search-ticket');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            renderDashboard(activeTab, term);
        });
    }

    // Modal Search Button
    elements.btnSearchOrder.addEventListener('click', handleSearchOrder);

    // Modal Search Enter Key
    elements.inpSearchOrder.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearchOrder();
    });

    // Modal Submit Ticket
    document.getElementById('btn-submit-ticket').addEventListener('click', handleSubmitTicket);

    // Modal Confirm Action - "Xác Nhận" button triggers refund flow
    const btnConfirmYes = document.getElementById('btn-confirm-yes');
    if (btnConfirmYes) {
        btnConfirmYes.addEventListener('click', handleConfirmAction);
    }


    // Partial Return Checkbox Logic
    const fixCodReason = document.getElementById('fix-cod-reason');
    console.log('[INIT] fix-cod-reason element:', fixCodReason);
    if (fixCodReason) {
        fixCodReason.addEventListener('change', handleIssueTypeChange);
        console.log('[INIT] Event listener attached to fix-cod-reason');
    } else {
        console.warn('[INIT] fix-cod-reason element NOT FOUND');
    }

    const issueTypeSelect = document.getElementById('issue-type-select');
    console.log('[INIT] issue-type-select element:', issueTypeSelect);
    if (issueTypeSelect) {
        issueTypeSelect.addEventListener('change', handleIssueTypeChange);
        console.log('[INIT] Event listener attached to issue-type-select');
    } else {
        console.warn('[INIT] issue-type-select element NOT FOUND');
    }
}

/**
 * NEW: Helper function to normalize phone numbers
 */
function normalizePhone(phone) {
    if (!phone) return null;
    let normalized = String(phone).replace(/\s/g, ''); // Remove all spaces
    if (normalized.startsWith('+84')) {
        normalized = '0' + normalized.substring(3);
    }
    if (!normalized.startsWith('0')) {
        normalized = '0' + normalized;
    }
    return normalized;
}

/**
 * CORE LOGIC
 */

async function handleSearchOrder() {
    const query = elements.inpSearchOrder.value.trim();
    if (!query) return alert("Vui lòng nhập SĐT hoặc Mã đơn");

    // Validate: need at least 3 digits
    const cleanQuery = query.replace(/\D/g, '');
    if (cleanQuery.length < 3) {
        return alert("Vui lòng nhập ít nhất 3 chữ số");
    }

    showLoading(true);
    try {
        const orders = await ApiService.searchOrders(query);

        if (orders && orders.length > 0) {
            if (orders.length === 1) {
                // Only 1 result - auto select
                selectOrder(orders[0]);
            } else {
                // Multiple results - show selection list
                showOrderSelectionList(orders);
            }
        } else {
            // No orders found, try to search for customer
            hideOrderSelectionList(); // Hide any previous order selection list
            await searchCustomerByPhone(query);
            // If customer found, we'll display their info. If not, the "new customer" warning will show.
        }
    } catch (error) {
        console.error(error);
        alert("Lỗi khi tìm kiếm đơn hàng: " + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Search for customer by phone and display info
 * @param {string} phone - Customer phone number
 */
async function searchCustomerByPhone(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;

    showLoading(true);
    try {
        const customerData = await ApiService.getCustomer360(normalizedPhone); // Use getCustomer360 for now

        if (customerData && customerData.customer) {
            // Customer found, display info
            currentCustomer = customerData.customer; // Store full customer object
            elements.customerInfoSection.classList.remove('hidden');
            elements.customerInfoName.textContent = currentCustomer.name || 'N/A';
            elements.customerInfoPhone.textContent = currentCustomer.phone || 'N/A';
            elements.customerInfoTier.textContent = currentCustomer.tier || 'New';
            elements.customerInfoWalletBalance.textContent = formatCurrency(customerData.wallet?.balance || 0);
            elements.customerInfoNewCustomerWarning.classList.add('hidden');

            // Hide order result and show issue form directly
            document.getElementById('order-result').classList.add('hidden');
            document.getElementById('issue-details-form').classList.remove('hidden');

        } else {
            // Customer not found, show warning for new customer creation
            currentCustomer = { // Minimal object for new customer
                name: 'Khách hàng mới',
                phone: normalizedPhone,
                tier: 'New',
                wallet_balance: 0
            };
            elements.customerInfoSection.classList.remove('hidden');
            elements.customerInfoName.textContent = 'Khách hàng mới';
            elements.customerInfoPhone.textContent = normalizedPhone;
            elements.customerInfoTier.textContent = 'New';
            elements.customerInfoWalletBalance.textContent = formatCurrency(0);
            elements.customerInfoNewCustomerWarning.classList.remove('hidden');

            document.getElementById('order-result').classList.add('hidden');
            document.getElementById('issue-details-form').classList.remove('hidden');
        }

        // Set selectedOrder to a minimal object for new customer creation if no order was found
        if (!selectedOrder || !selectedOrder.tposCode) { // Only if no order is currently selected
            selectedOrder = {
                customer: currentCustomer.name,
                phone: currentCustomer.phone,
                address: 'N/A', // Default for new customer
                tposCode: null, // No TPOS order for new customer
                id: null,
                cod: 0,
                products: [],
                status: 'open',
                stateCode: 'None',
                carrier: 'N/A',
                channel: 'TPOS',
                createdAt: Date.now()
            };
             // Also update the order-info-header placeholders for consistency
            document.getElementById('res-customer').textContent = currentCustomer.name;
            document.getElementById('res-phone').textContent = currentCustomer.phone;
            document.getElementById('res-order-code').textContent = 'N/A';
            document.getElementById('res-address').textContent = 'N/A';
            document.getElementById('res-products-table').innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;color:#64748b;">Không có sản phẩm</td></tr>';
            document.getElementById('product-checklist').innerHTML = '<p style="color:#64748b;font-size:12px">Không có sản phẩm</p>';
            document.getElementById('res-total-qty').textContent = '0';
            document.getElementById('res-amount-total').textContent = '0đ';
            document.getElementById('res-decrease-amount').textContent = '0đ';
            document.getElementById('res-delivery-price').textContent = '0đ';
            document.getElementById('res-final-total').textContent = '0đ';
            document.getElementById('res-payment-amount').textContent = '0đ';
            document.getElementById('res-cod').textContent = '0đ';
        }

    } catch (error) {
        console.error('Error searching customer:', error);
        // Fallback to showing warning if API fails
        elements.customerInfoSection.classList.remove('hidden');
        elements.customerInfoName.textContent = 'Lỗi tải thông tin';
        elements.customerInfoPhone.textContent = normalizedPhone;
        elements.customerInfoTier.textContent = 'N/A';
        elements.customerInfoWalletBalance.textContent = '0đ';
        elements.customerInfoNewCustomerWarning.classList.remove('hidden');

        document.getElementById('order-result').classList.add('hidden');
        document.getElementById('issue-details-form').classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

/**
 * Select an order and display its details (with products)
 * @param {Object} order - Order object from TPOS
 */
async function selectOrder(order) {
    selectedOrder = order;
    currentCustomer = null; // Reset current customer when an order is selected

    document.getElementById('order-result').classList.remove('hidden');
    document.getElementById('issue-details-form').classList.remove('hidden');
    elements.customerInfoSection.classList.add('hidden'); // Hide customer info section when order is selected
    elements.customerInfoNewCustomerWarning.classList.add('hidden'); // Hide new customer warning

    // Fill basic order info
    document.getElementById('res-customer').textContent = order.customer;
    document.getElementById('res-phone').textContent = order.phone;
    document.getElementById('res-order-code').textContent = order.tposCode;
    document.getElementById('res-address').textContent = order.address || 'Chưa có địa chỉ';

    // NEW: Attempt to fetch and display customer info based on the order's phone
    if (order.phone) {
        try {
            const customerDetails = await ApiService.getCustomer360(normalizePhone(order.phone));
            if (customerDetails && customerDetails.customer) {
                currentCustomer = customerDetails.customer;
                elements.customerInfoSection.classList.remove('hidden');
                elements.customerInfoName.textContent = currentCustomer.name || 'N/A';
                elements.customerInfoPhone.textContent = currentCustomer.phone || 'N/A';
                elements.customerInfoTier.textContent = currentCustomer.tier || 'New';
                elements.customerInfoWalletBalance.textContent = formatCurrency(customerDetails.wallet?.balance || 0);
            } else {
                // If customer not found for this phone, still show warning as it will be created via ticket
                elements.customerInfoSection.classList.remove('hidden');
                elements.customerInfoName.textContent = 'Khách hàng mới';
                elements.customerInfoPhone.textContent = order.phone;
                elements.customerInfoTier.textContent = 'New';
                elements.customerInfoWalletBalance.textContent = formatCurrency(0);
                elements.customerInfoNewCustomerWarning.classList.remove('hidden');

                currentCustomer = { // Minimal object for new customer related to this order
                    name: 'Khách hàng mới',
                    phone: normalizePhone(order.phone),
                    tier: 'New',
                    wallet_balance: 0
                };
            }
        } catch (error) {
            console.error('Error fetching customer details for selected order:', error);
            // Fallback to new customer warning if API fails
            elements.customerInfoSection.classList.remove('hidden');
            elements.customerInfoName.textContent = 'Lỗi tải thông tin';
            elements.customerInfoPhone.textContent = order.phone;
            elements.customerInfoTier.textContent = 'N/A';
            elements.customerInfoWalletBalance.textContent = '0đ';
            elements.customerInfoNewCustomerWarning.classList.remove('hidden');

            currentCustomer = null; // Clear if error
        }
    }

    // Show loading state
    document.getElementById('res-products-table').innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;color:#64748b;">Đang tải sản phẩm...</td></tr>';
    const checklist = document.getElementById('product-checklist');
    checklist.innerHTML = '<p style="color:#64748b;font-size:12px">Đang tải...</p>';

    // Hide order selection list
    hideOrderSelectionList();

    // Fetch full order details with products
    try {
        const details = await ApiService.getOrderDetails(order.id);
        if (details && details.products && details.products.length > 0) {
            // Update selectedOrder with full details, but preserve phone from searchOrders if details.phone is missing
            const preservedPhone = selectedOrder.phone;
            selectedOrder = { ...selectedOrder, ...details };
            // Restore phone if it was overwritten with undefined/null
            if (!selectedOrder.phone && preservedPhone) {
                selectedOrder.phone = preservedPhone;
            }

            // Display products in table
            const productsTableHTML = details.products.map(p => {
                const noteDisplay = p.note ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">(${p.note})</div>` : '';
                return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 8px;">
                            <div><strong>[${p.code}]</strong> ${p.name}</div>
                            ${noteDisplay}
                        </td>
                        <td style="padding:6px 8px;text-align:center;">${p.quantity}</td>
                        <td style="padding:6px 8px;text-align:right;">${formatCurrency(p.price)}</td>
                    </tr>
                `;
            }).join('');
            document.getElementById('res-products-table').innerHTML = productsTableHTML;

            // Calculate totals
            const totalQty = details.products.reduce((sum, p) => sum + p.quantity, 0);
            const finalTotal = details.amountTotal - details.decreaseAmount + details.deliveryPrice;

            // Update summary fields
            document.getElementById('res-total-qty').textContent = totalQty;
            document.getElementById('res-amount-total').textContent = formatCurrency(details.amountTotal);
            document.getElementById('res-decrease-amount').textContent = formatCurrency(details.decreaseAmount);
            document.getElementById('res-delivery-price').textContent = formatCurrency(details.deliveryPrice);
            document.getElementById('res-final-total').textContent = formatCurrency(finalTotal);
            document.getElementById('res-payment-amount').textContent = formatCurrency(details.paymentAmount);
            document.getElementById('res-cod').textContent = formatCurrency(details.cod);

            // Generate product checklist for partial return (with quantity input)
            checklist.innerHTML = details.products.map(p => `
                <div class="checkbox-item" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px;border:1px solid #e2e8f0;border-radius:4px;">
                    <input type="checkbox" value="${p.id}" id="prod-${p.id}" checked
                           data-price="${p.price}" data-qty="${p.quantity}"
                           onchange="updateCodReduceFromProducts()" style="margin:0;">
                    <label for="prod-${p.id}" style="flex:1;margin:0;cursor:pointer;">[${p.code}] ${p.name} - ${formatCurrency(p.price)}</label>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:11px;color:#64748b;">SL:</span>
                        <input type="number"
                               id="prod-qty-${p.id}"
                               value="${p.quantity}"
                               min="1"
                               max="${p.quantity}"
                               onchange="updateCodReduceFromProducts()"
                               style="width:50px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:3px;text-align:center;font-size:12px;">
                    </div>
                </div>
            `).join('');
        } else {
            // No products found
            document.getElementById('res-products-table').innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;color:#ef4444;">Không tìm thấy sản phẩm</td></tr>';
            checklist.innerHTML = `<p style="color:#64748b;font-size:12px">Mã đơn: ${order.tposCode} | ${order.carrier || 'N/A'}</p>`;
        }
    } catch (err) {
        console.error('[APP] Failed to load order details:', err);
        // Fallback to error state
        document.getElementById('res-products-table').innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;color:#ef4444;">Lỗi tải sản phẩm</td></tr>';
        checklist.innerHTML = `<p style="color:#ef4444;font-size:12px;">Lỗi tải sản phẩm. Mã đơn: ${order.tposCode}</p>`;
    }
}

/**
 * Show list of orders for user to select
 * @param {Array} orders - Array of order objects
 */
function showOrderSelectionList(orders) {
    // Helper: translate State to Vietnamese
    const translateState = (state) => {
        const map = {
            'draft': 'Nháp',
            'open': 'Đã xác nhận',
            'paid': 'Đã thanh toán',
            'cancel': 'Hủy bỏ'
        };
        return map[state] || state;
    };

    // Helper: translate StateCode to Vietnamese
    const translateStateCode = (stateCode) => {
        const map = {
            'CrossCheckComplete': 'Đã ĐS SP',
            'NotEnoughInventory': 'Không đủ tồn',
            'None': 'Chưa ĐS SP'
        };
        return map[stateCode] || stateCode;
    };

    // Create or get element
    let listEl = document.getElementById('order-selection-list');
    if (!listEl) {
        listEl = document.createElement('div');
        listEl.id = 'order-selection-list';
        listEl.className = 'order-selection-list';
        document.querySelector('.search-section').appendChild(listEl);
    }

    listEl.innerHTML = `
        <div style="padding:10px;background:#f1f5f9;border-radius:6px;margin-top:10px;max-height:300px;overflow-y:auto;">
            <p style="font-weight:600;margin-bottom:8px;">Tìm thấy ${orders.length} đơn hàng:</p>
            ${orders.map((o, i) => `
                <div class="order-option" onclick="selectOrderByIndex(${i})"
                     style="padding:10px;border:1px solid #e2e8f0;border-radius:4px;margin-bottom:6px;cursor:pointer;background:white;transition:all 0.2s;"
                     onmouseover="this.style.borderColor='#3b82f6';this.style.background='#eff6ff'"
                     onmouseout="this.style.borderColor='#e2e8f0';this.style.background='white'">
                    <div style="font-weight:500;color:#1e293b">${o.customer} - ${o.phone}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px">
                        ${o.tposCode} | COD: ${formatCurrency(o.cod)} | ${o.carrier || 'N/A'}
                    </div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:2px">
                        ${new Date(o.createdAt).toLocaleDateString('vi-VN')} -
                        <span style="color:#3b82f6;font-weight:500;">${translateState(o.status)}</span> |
                        <span style="color:${o.stateCode === 'CrossCheckComplete' ? '#10b981' : '#f59e0b'};">${translateStateCode(o.stateCode)}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    listEl.classList.remove('hidden');

    // Hide order result and form until selection
    document.getElementById('order-result').classList.add('hidden');
    document.getElementById('issue-details-form').classList.add('hidden');
    elements.customerInfoSection.classList.add('hidden'); // Also hide customer info section
}

/**
 * Hide order selection list
 */
function hideOrderSelectionList() {
    const listEl = document.getElementById('order-selection-list');
    if (listEl) {
        listEl.classList.add('hidden');
    }
}

/**
 * Select order by index (called from onclick)
 */
window.selectOrderByIndex = function (index) {
    if (window._searchedOrders && window._searchedOrders[index]) {
        selectOrder(window._searchedOrders[index]);
    }
};

function handleIssueTypeChange(e) {
    console.log('[DEBUG] handleIssueTypeChange called');

    // Logic to toggle visibility of fields
    const issueType = document.getElementById('issue-type-select').value;
    const fixCodReason = document.getElementById('fix-cod-reason').value;

    console.log('[DEBUG] Issue Type:', issueType, 'Fix COD Reason:', fixCodReason);

    const dynamicFields = document.getElementById('dynamic-fields');
    const fixCodGroup = dynamicFields.querySelector('[data-type="FIX_COD"]');
    const returnGroup = dynamicFields.querySelector('[data-type="RETURN"]');

    console.log('[DEBUG] Elements found:', {
        dynamicFields: !!dynamicFields,
        fixCodGroup: !!fixCodGroup,
        returnGroup: !!returnGroup
    });

    // Reset all first
    if (fixCodGroup) fixCodGroup.classList.add('hidden');
    if (returnGroup) returnGroup.classList.add('hidden');

    const trackingGroup = document.getElementById('tracking-input-group');
    const shipperGroup = document.getElementById('shipper-input-group');
    if (trackingGroup) trackingGroup.classList.add('hidden');
    if (shipperGroup) shipperGroup.classList.add('hidden');

    if (issueType === 'FIX_COD') {
        console.log('[DEBUG] Showing FIX_COD fields');
        if (fixCodGroup) fixCodGroup.classList.remove('hidden');

        // Special Case: Partial Return in Fix COD
        if (fixCodReason === 'REJECT_PARTIAL') {
            console.log('[DEBUG] Showing RETURN fields for REJECT_PARTIAL');
            if (returnGroup) returnGroup.classList.remove('hidden');
        }
    } else if (['RETURN_CLIENT', 'RETURN_SHIPPER', 'BOOM'].includes(issueType)) {
        console.log('[DEBUG] Showing RETURN fields for', issueType);
        if (returnGroup) returnGroup.classList.remove('hidden');

        if (issueType === 'RETURN_CLIENT') {
            if (trackingGroup) trackingGroup.classList.remove('hidden');
        } else if (issueType === 'RETURN_SHIPPER') {
            if (shipperGroup) shipperGroup.classList.remove('hidden');
        }
    }

    console.log('[DEBUG] Final state:', {
        fixCodHidden: fixCodGroup?.classList.contains('hidden'),
        returnHidden: returnGroup?.classList.contains('hidden')
    });
}


// Calculate COD Remaining and Diff for Fix COD
window.calculateCodRemaining = function() {
    if (!selectedOrder) return;
    const codReduce = parseInt(document.getElementById('cod-reduce-amount').value) || 0;
    const codRemaining = selectedOrder.cod - codReduce;

    document.getElementById('cod-remaining-display').textContent = formatCurrency(codRemaining);
    document.getElementById('cod-diff-display').textContent = formatCurrency(codReduce);
}

// Handle FIX_COD reason change
window.onFixCodReasonChange = function() {
    const reason = document.getElementById('fix-cod-reason').value;
    const codReduceInput = document.getElementById('cod-reduce-amount');
    const editBtn = document.getElementById('btn-edit-cod-reduce');
    const returnGroup = document.querySelector('[data-type="RETURN"]');

    if (reason === 'REJECT_PARTIAL') {
        // Tự động tính COD giảm = tổng giá SP được chọn trả
        codReduceInput.readOnly = true;
        codReduceInput.style.backgroundColor = '#f1f5f9';
        // Show edit button
        if (editBtn) editBtn.style.display = 'block';
        // Show product checklist
        if (returnGroup) returnGroup.classList.remove('hidden');

        // Bỏ check tất cả sản phẩm để user tự chọn món trả lại
        const checkboxes = document.querySelectorAll('#product-checklist input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);

        // Reset COD giảm về 0
        codReduceInput.value = 0;
        calculateCodRemaining();
    } else {
        // Cho phép nhập tay
        codReduceInput.readOnly = false;
        codReduceInput.style.backgroundColor = '';
        // Hide edit button
        if (editBtn) editBtn.style.display = 'none';
        // Hide product checklist
        if (returnGroup) returnGroup.classList.add('hidden');

        // Check lại tất cả sản phẩm (cho các loại khác như THU VỀ, BOOM)
        const checkboxes = document.querySelectorAll('#product-checklist input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = true);
    }
}

// Toggle COD Reduce edit mode (for REJECT_PARTIAL)
window.toggleCodReduceEdit = function() {
    const codReduceInput = document.getElementById('cod-reduce-amount');
    const editBtn = document.getElementById('btn-edit-cod-reduce');

    if (codReduceInput.readOnly) {
        // Enable manual editing
        codReduceInput.readOnly = false;
        codReduceInput.style.backgroundColor = '';
        codReduceInput.focus();
        if (editBtn) editBtn.innerHTML = '🔒';
        if (editBtn) editBtn.title = 'Khóa & tính tự động';
    } else {
        // Lock and recalculate from products
        codReduceInput.readOnly = true;
        codReduceInput.style.backgroundColor = '#f1f5f9';
        if (editBtn) editBtn.innerHTML = '✏️';
        if (editBtn) editBtn.title = 'Chỉnh sửa thủ công';
        updateCodReduceFromProducts();
    }
}

// Calculate COD reduce from selected products (for REJECT_PARTIAL)
function updateCodReduceFromProducts() {
    const checkedInputs = document.querySelectorAll('#product-checklist input[type="checkbox"]:checked');
    let totalReduce = 0;

    checkedInputs.forEach(cb => {
        const productId = cb.value;
        const qtyInput = document.getElementById(`prod-qty-${productId}`);
        const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
        const price = parseFloat(cb.dataset.price) || 0;
        totalReduce += price * qty;
    });

    document.getElementById('cod-reduce-amount').value = totalReduce;
    calculateCodRemaining();
}

// Expose for checkbox/quantity change events
window.updateCodReduceFromProducts = updateCodReduceFromProducts;

async function handleSubmitTicket() {
    // If selectedOrder is a minimal object for a new customer
    const isNewCustomerTicket = selectedOrder && !selectedOrder.tposCode;

    if (!selectedOrder && !currentCustomer) return alert("Chưa chọn đơn hàng hoặc SĐT khách hàng!");

    const type = document.getElementById('issue-type-select').value;
    if (!type) return alert("Vui lòng chọn loại vấn đề");

    let status = 'PENDING_GOODS';
    let money = 0;
    let note = document.getElementById('ticket-note').value;
    let selectedProducts = [];

    // Determine channel: TP if HCM, J&T otherwise
    const address = selectedOrder?.address || (currentCustomer ? 'N/A' : ''); // Use customer address if no order
    const channel = address.includes('Hồ Chí Minh') || address.includes('HCM') || address.includes('TP HCM')
        ? 'TP'
        : 'J&T';

    // Logic for Status & Money based on type
    if (type === 'FIX_COD') {
        const fixCodReason = document.getElementById('fix-cod-reason').value;
        const codReduce = parseInt(document.getElementById('cod-reduce-amount').value) || 0;
        money = codReduce; // COD Giảm chính là số tiền phải trả ĐVVC

        if (fixCodReason === 'REJECT_PARTIAL') {
            // Validation: Đơn phải có >= 2 món (only if an order is selected)
            if (selectedOrder && selectedOrder.products && selectedOrder.products.length < 2) {
                return alert("Đơn hàng chỉ có 1 món. Nếu khách không nhận, vui lòng chọn 'Boom Hàng'.");
            }

            // Khách nhận 1 phần - có hàng hoàn về
            status = 'PENDING_GOODS';
            // Get selected products with quantities
            const checkedInputs = document.querySelectorAll('#product-checklist input[type="checkbox"]:checked');
            selectedProducts = Array.from(checkedInputs).map(cb => {
                const productId = cb.value;
                const qtyInput = document.getElementById(`prod-qty-${productId}`);
                const returnQty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
                const product = selectedOrder?.products?.find(p => String(p.id) === String(productId));
                return {
                    ...product,
                    returnQuantity: returnQty
                };
            });

            // Validation: Phải chọn ít nhất 1 món trả
            if (selectedProducts.length === 0) {
                return alert("Vui lòng chọn ít nhất 1 món hàng khách trả lại.");
            }
            // Validation: Không được trả toàn bộ (đó là BOOM)
            if (selectedOrder && selectedProducts.length === selectedOrder.products.length) {
                return alert("Khách trả toàn bộ món hàng. Vui lòng chọn 'Boom Hàng' thay vì 'Nhận 1 phần'.");
            }
        } else {
            // Các lý do khác - không có hàng trả, chỉ đối soát tiền
            status = 'PENDING_FINANCE';
            selectedProducts = []; // Không có sản phẩm
        }
    } else if (type === 'BOOM') {
        // BOOM: COD giảm = toàn bộ COD (khách không nhận gì)
        money = selectedOrder?.cod || 0;
        status = 'PENDING_GOODS';

        // Tất cả sản phẩm đều hoàn về (if order selected)
        selectedProducts = selectedOrder?.products?.map(p => ({
            ...p,
            returnQuantity: p.quantity
        })) || [];
    } else if (type === 'RETURN_CLIENT' || type === 'RETURN_SHIPPER') {
        // Thu về/Khách gửi: Đã thu COD xong, giờ là giá trị hàng hoàn
        status = 'PENDING_GOODS';

        // Get selected products with return quantities (if order selected)
        const checkedInputs = document.querySelectorAll('#product-checklist input[type="checkbox"]:checked');
        selectedProducts = Array.from(checkedInputs).map(cb => {
            const productId = cb.value;
            const qtyInput = document.getElementById(`prod-qty-${productId}`);
            const returnQty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
            const product = selectedOrder?.products?.find(p => String(p.id) === String(productId));
            return {
                ...product,
                returnQuantity: returnQty
            };
        });

        // Giá trị hoàn = tổng giá trị sản phẩm trả về
        money = selectedProducts.reduce((sum, p) => sum + (p.price * p.returnQuantity), 0);
    } else if (type === 'OTHER') {
        status = 'COMPLETED';
        money = 0;
        selectedProducts = [];
    }

    // Use selectedOrder data if available, otherwise use currentCustomer data
    const customerPhone = selectedOrder?.phone || currentCustomer?.phone;
    const customerName = selectedOrder?.customer || currentCustomer?.name;
    const tposOrderId = selectedOrder?.tposCode; // TPOS order code (e.g., NJD/2025/xxx)
    const tposInternalId = selectedOrder?.id; // TPOS internal ID (number)
    const orderAddress = selectedOrder?.address;
    const orderStatus = selectedOrder?.status;
    const orderStateCode = selectedOrder?.stateCode;

    if (!customerPhone) return alert("Không tìm thấy thông tin số điện thoại khách hàng!");


    const ticketData = {
        orderId: tposOrderId,
        tposId: tposInternalId,
        customer: customerName,
        phone: customerPhone,
        address: orderAddress,
        type: type,
        fixCodReason: type === 'FIX_COD' ? document.getElementById('fix-cod-reason').value : null,
        channel: channel,
        status: status,
        orderState: orderStatus || 'open', // Trạng thái đơn TPOS: open, paid
        stateCode: orderStateCode || 'None', // Trạng thái đối soát SP: CrossCheckComplete, None
        products: selectedProducts,
        money: money,
        note: note
    };

    showLoading(true);
    try {
        await ApiService.createTicket(ticketData);
        closeModal(elements.modalCreate);
        resetCreateForm();
        notificationManager.success('Tạo phiếu thành công!');
    } catch (error) {
        console.error(error);
        alert("Lỗi khi tạo sự vụ: " + error.message);
    } finally {
        showLoading(false);
    }
}

let pendingActionTicketId = null;
let pendingActionType = null;

window.promptAction = function (id, action) {
    pendingActionTicketId = id;
    pendingActionType = action;
    const ticket = TICKETS.find(t => t.firebaseId === id); // Note: using firebaseId now

    if (!ticket) return;

    if (action === 'RECEIVE') {
        document.getElementById('confirm-title').textContent = "Xác nhận Nhập Kho";
        document.getElementById('confirm-message').textContent = `Đã nhận đủ hàng từ đơn ${ticket.orderId}?`;
    } else {
        document.getElementById('confirm-title').textContent = "Xác nhận Thanh Toán";
        document.getElementById('confirm-message').textContent = `Đã chuyển khoản ${formatCurrency(ticket.money)} cho ĐVVC?`;
    }

    openModal(elements.modalConfirm);
}

async function handleConfirmAction() {
    if (!pendingActionTicketId) return;

    const ticket = TICKETS.find(t => t.firebaseId === pendingActionTicketId);
    if (!ticket) {
        notificationManager.error('Không tìm thấy phiếu');
        return;
    }

    // Close confirm modal first
    closeModal(elements.modalConfirm);

    let loadingId = null;

    try {
        if (pendingActionType === 'RECEIVE') {
            // RECEIVE action: Process full TPOS refund flow (5 API calls)
            console.log('[APP] Processing RECEIVE action for tposId:', ticket.tposId);

            if (!ticket.tposId) {
                throw new Error('Thiếu TPOS Order ID để xử lý nhận hàng');
            }

            // Show loading notification with progress
            loadingId = notificationManager.loading('Bước 1/5: Tạo phiếu hoàn...', 'Đang xử lý nhận hàng');

            // Call the refund process with progress callback
            const result = await ApiService.processRefund(ticket.tposId, (step, message) => {
                // Update loading notification with step progress
                notificationManager.remove(loadingId);
                loadingId = notificationManager.loading(message, `Bước ${step}/5`);
            });

            console.log('[APP] Refund completed, refundOrderId:', result.refundOrderId);

            // Update loading: Saving to Firebase
            notificationManager.remove(loadingId);
            loadingId = notificationManager.loading('Đang cập nhật hệ thống...', 'Hoàn tất');

            // Update ticket in Firebase with refund info
            await ApiService.updateTicket(pendingActionTicketId, {
                status: 'COMPLETED',
                completedAt: Date.now(),
                refundOrderId: result.refundOrderId,
                refundNumber: result.confirmResult?.value?.[0]?.Number || null
            });

            // Remove loading notification
            notificationManager.remove(loadingId);
            loadingId = null;

            // Show success notification
            const refundNumber = result.confirmResult?.value?.[0]?.Number || result.refundOrderId;
            notificationManager.success(`Đã tạo phiếu hoàn: ${refundNumber}`, 3000, 'Nhận hàng thành công');

            // Show print dialog with the HTML bill (only if enabled in settings)
            if (result.printHtml && appSettings.printBillEnabled) {
                showPrintDialog(result.printHtml);
            }

        } else if (pendingActionType === 'PAY') {
            // PAY action: Just mark as completed (payment done externally)
            loadingId = notificationManager.loading('Đang cập nhật...', 'Xác nhận thanh toán');

            await ApiService.updateTicket(pendingActionTicketId, {
                status: 'COMPLETED',
                completedAt: Date.now()
            });

            notificationManager.remove(loadingId);
            loadingId = null;

            notificationManager.success('Đã xác nhận thanh toán', 2000, 'Thành công');
        }
    } catch (error) {
        console.error('[APP] handleConfirmAction error:', error);

        // Remove loading notification if exists
        if (loadingId) {
            notificationManager.remove(loadingId);
        }

        notificationManager.error(error.message, 5000, 'Lỗi xử lý');
    }
}

/**
 * Show print dialog with refund bill HTML
 * @param {string} html - HTML content of the bill
 */
function showPrintDialog(html) {
    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=400,height=600');

    if (!printWindow) {
        alert('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load then trigger print
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
    };
}

/**
 * RECONCILIATION LOGIC (NEW)
 */

let reconcileMatches = []; // Store processing results

function initReconcileHandlers() {
    // Open Modal
    const btnOpen = document.getElementById('btn-open-reconcile');
    const modalRec = document.getElementById('modal-reconcile');

    if (btnOpen && modalRec) {
        btnOpen.addEventListener('click', () => {
            openModal(modalRec);
            // Reset
            document.getElementById('excel-input').value = '';
            document.getElementById('reconcile-result-container').classList.add('hidden');
            reconcileMatches = [];
            updateReconcileSummary();
            document.getElementById('btn-confirm-reconcile').disabled = true;
        });
    }

    // Process Button
    document.getElementById('btn-process-excel').addEventListener('click', handlePreviewReconcile);

    // Confirm Button
    document.getElementById('btn-confirm-reconcile').addEventListener('click', handleBatchConfirm);
}

function handlePreviewReconcile() {
    const text = document.getElementById('excel-input').value.trim();
    if (!text) return alert("Vui lòng dán dữ liệu từ Excel!");

    showLoading(true);

    // 1. Parse Excel Data
    const rows = parseExcelData(text);
    console.log('[REC] Parsed rows:', rows.length);

    // 2. Match with Tickets
    reconcileMatches = performReconciliation(rows);

    // 3. Render Results
    renderReconcileTable(reconcileMatches);
    updateReconcileSummary();

    showLoading(false);
    document.getElementById('reconcile-result-container').classList.remove('hidden');
}

function parseExcelData(text) {
    // Split by newlines
    const lines = text.split(/\r?\n/);
    const data = [];

    lines.forEach(line => {
        if (!line.trim()) return;

        // Strategy:
        // 1. Extract potential Phone (10-11 digits)
        // 2. Extract potential ID (First column usually)
        // 3. Extract Money (digits with optional commas/dots)

        // Remove commas in numbers for easier parsing
        const cleanLine = line.replace(/,/g, '');
        const cols = cleanLine.split(/\t/); // Excel copy usually uses Tab

        const rawId = cols[0] ? cols[0].trim() : '';

        // Find phone using Regex
        const phoneMatch = line.match(/(0\d{9,10})/);
        const phone = phoneMatch ? phoneMatch[0] : '';

        // Find money: Look for numbers > 1000
        const moneyMatch = cleanLine.match(/(\d{4,})/g);
        // Heuristic: Money is usually the largest number or specific column.
        // For simplicity, let's take largest number found (risk: OrderId might be number)
        // Better: Expect user to check. Or user specific columns.
        // Let's assume Column B (index 1) or D (index 3) based on user image.
        // Image: Col B=325000, Col D=325000.
        // Let's try to parse money from Col B or D.
        let money = 0;
        if (cols[1]) money = parseInt(cols[1].replace(/\D/g, '')) || 0;

        if (rawId || phone) {
            data.push({
                rawId: rawId,
                phone: phone,
                money: money,
                originalLine: line
            });
        }
    });

    return data;
}

function performReconciliation(excelRows) {
    const results = [];

    // Index tickets for faster lookup
    // Map by OrderID (lowercase) and Phone
    const ticketMapById = {};
    const ticketMapByPhone = {}; // Phone might have duplicates!

    TICKETS.forEach(t => {
        if (t.orderId) ticketMapById[t.orderId.toLowerCase()] = t;
        // Phone: store array of tickets
        if (t.phone) {
            if (!ticketMapByPhone[t.phone]) ticketMapByPhone[t.phone] = [];
            ticketMapByPhone[t.phone].push(t);
        }
    });

    excelRows.forEach(row => {
        let match = null;
        let status = 'Not Found';
        let detail = 'Không tìm thấy trên hệ thống';
        let resultCode = 'GHOST'; // GHOST, VALID, ERROR, DUPLICATE

        // 1. Try Match by ID
        if (row.rawId && ticketMapById[row.rawId.toLowerCase()]) {
            match = ticketMapById[row.rawId.toLowerCase()];
        }
        // 2. Try Match by Phone
        else if (row.phone && ticketMapByPhone[row.phone]) {
            const candidates = ticketMapByPhone[row.phone];
            if (candidates.length === 1) {
                match = candidates[0];
            } else if (candidates.length > 1) {
                // Ambiguous: Multiple tickets with same phone
                // Prefer PENDING_FINANCE
                const pending = candidates.find(c => c.status === 'PENDING_FINANCE');
                match = pending || candidates[0]; // Fallback to first
                if (!pending) detail += " (Trùng SĐT)";
            }
        }

        if (match) {
            // Validation Logic
            if (match.status === 'PENDING_FINANCE') {
                resultCode = 'VALID';
                status = 'Ready';
                detail = 'Hợp lệ để thanh toán';
            } else if (match.status === 'PENDING_GOODS') {
                resultCode = 'ERROR';
                status = 'Not Ready';
                detail = 'Đang chờ hàng về (Chưa nhận hàng)';
            } else if (match.status === 'COMPLETED') {
                resultCode = 'DUPLICATE';
                status = 'Done';
                detail = 'Đã thanh toán trước đó';
            } else {
                resultCode = 'UNKNOWN';
                status = match.status;
            }
        }

        results.push({
            excel: row,
            ticket: match,
            resultCode: resultCode,
            statusLabel: status,
            message: detail
        });
    });

    return results;
}

function renderReconcileTable(matches) {
    const tbody = document.getElementById('reconcile-table-body');
    tbody.innerHTML = '';

    matches.forEach(item => {
        let rowClass = '';
        if (item.resultCode === 'VALID') rowClass = 'row-success';
        else if (item.resultCode === 'ERROR' || item.resultCode === 'GHOST') rowClass = 'row-error';
        else if (item.resultCode === 'DUPLICATE') rowClass = 'row-warning';

        const tr = document.createElement('tr');
        tr.className = rowClass;

        tr.innerHTML = `
            <td>
                <div style="font-weight:bold">${item.excel.rawId}</div>
                <div>${item.excel.phone || '---'}</div>
                <div style="font-size:11px">${formatCurrency(item.excel.money)}</div>
            </td>
            <td>
                ${item.ticket ? `
                    <div style="font-weight:bold">${item.ticket.orderId}</div>
                    <div>${item.ticket.customer}</div>
                    <span class="status-badge status-${item.ticket.status.toLowerCase().replace('_', '-')}">${translateStatus(item.ticket.status)}</span>
                ` : '<em style="color:#94a3b8">---</em>'}
            </td>
            <td>
                <div class="${item.resultCode === 'VALID' ? 'text-success' : (item.resultCode === 'DUPLICATE' ? 'text-warning' : 'text-error')}">
                    ${item.resultCode}
                </div>
                <div style="font-size:11px">${item.message}</div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateReconcileSummary() {
    const total = reconcileMatches.length;
    const valid = reconcileMatches.filter(m => m.resultCode === 'VALID').length;
    const error = reconcileMatches.filter(m => ['GHOST', 'ERROR'].includes(m.resultCode)).length;

    // Sum money valid
    const totalMoney = reconcileMatches
        .filter(m => m.resultCode === 'VALID')
        .reduce((sum, m) => sum + (m.ticket ? m.ticket.money : 0), 0);

    document.getElementById('rec-total-count').textContent = total;
    document.getElementById('rec-valid-count').textContent = valid;
    document.getElementById('rec-error-count').textContent = error;
    document.getElementById('rec-total-money').textContent = formatCurrency(totalMoney);
    document.getElementById('btn-rec-count').textContent = valid;
    document.getElementById('btn-confirm-reconcile').disabled = valid === 0;
}

async function handleBatchConfirm() {
    const validItems = reconcileMatches.filter(m => m.resultCode === 'VALID');
    if (validItems.length === 0) return;

    if (!confirm(`Xác nhận thanh toán cho ${validItems.length} đơn hàng hợp lệ?`)) return;

    showLoading(true);
    try {
        const promises = validItems.map(item => {
            return ApiService.updateTicket(item.ticket.firebaseId, {
                status: 'COMPLETED',
                completedAt: Date.now(),
                reconcileNote: `Batch Settle via Excel: ${item.excel.rawId}`
            });
        });

        await Promise.all(promises);

        alert("Đã quyết toán xong!");
        closeModal(document.getElementById('modal-reconcile'));
        // Refresh? Triggered by listener usually
    } catch (e) {
        console.error(e);
        alert("Lỗi khi quyết toán: " + e.message);
    } finally {
        showLoading(false);
    }
}

/**
 * UTILS & RENDER
 */

const GUIDES = {
    'all': `
        <strong>Tất cả sự vụ:</strong> Tra cứu và Theo dõi toàn bộ lịch sử.
        <br/><br/>
        <!-- Trigger for Detailed Flow -->
        <button class="btn btn-sm btn-secondary" onclick="toggleFlowDetails()">
            📜 Xem Quy Trình Xử Lý Chi Tiết
        </button>

        <div id="flow-details" class="hidden" style="margin-top:15px; border-top:1px dashed #ccc; padding-top:15px;">
            <div class="mermaid">
flowchart TD
    Start([Bắt đầu]) --> Search[Tìm kiếm Đơn hàng<br/>SĐT / Mã vận đơn]
    Search -->|Có dữ liệu| Found[Hiện thông tin Đơn]
    Search -->|Không thấy| NotFound[Báo lỗi / Kiểm tra lại]

    Found --> SelectType{Chọn Loại Sự Vụ}

    SelectType -->|Sửa COD| FixCOD[Form Sửa COD]
    FixCOD --> Reason{Lý do}
    Reason -->|Sai phí/Trừ nợ| InputMoney[Nhập COD mới]
    Reason -->|Khách nhận 1 phần| Partial[Hiện DS Sản phẩm]
    Partial --> CheckItem[Chọn SP khách trả lại]
    CheckItem --> InputMoney

    SelectType -->|Khách Trả / Boom| Return[Form Trả Hàng]
    Return --> ReturnSource{Nguồn?}
    ReturnSource -->|Khách gửi| InputTracking[Nhập Mã VĐ Khách gửi]
    ReturnSource -->|Shipper thu| InputShipper[Nhập tên Shipper]
    ReturnSource -->|Boom hàng| ConfirmBoom[Xác nhận Boom]

    InputMoney --> Submit[Tạo Ticket]
    InputTracking --> Submit
    InputShipper --> Submit
    ConfirmBoom --> Submit

    Submit --> End([Lưu vào Hệ thống])

    style Start fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    style End fill:#dcfce7,stroke:#16a34a,stroke-width:2px
    style Submit fill:#fef3c7,stroke:#d97706,stroke-width:2px
            </div>

            <div class="flow-steps" style="margin-top:20px;display:grid;gap:15px;">
                <div class="step-card" style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
                    <strong style="color:#0f172a">1. Trường hợp Sửa COD</strong>
                    <p style="font-size:12px;color:#475569">Dùng khi Shipper báo thu sai tiền hoặc Shop muốn trừ tiền cọc/đổi trả.</p>
                    <img src="images/fix_cod.png" style="width:100%;border-radius:4px;border:1px solid #ccc;margin-top:5px;">
                </div>

                <div class="step-card" style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
                    <strong style="color:#0f172a">2. Trường hợp Khách Nhận 1 Phần</strong>
                    <p style="font-size:12px;color:#475569">Chọn lý do "Khách nhận 1 phần" để hiện danh sách. Tích vào sản phẩm Khách <strong>trả lại</strong>.</p>
                    <img src="images/partial.png" style="width:100%;border-radius:4px;border:1px solid #ccc;margin-top:5px;">
                </div>

                <div class="step-card" style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
                    <strong style="color:#0f172a">3. Trường hợp Hàng Hoàn / Boom</strong>
                    <p style="font-size:12px;color:#475569">Chọn Boom hoặc Khách Gửi. Nếu Khách gửi qua bưu cục, hãy nhập mã vận đơn mới.</p>
                    <img src="images/return.png" style="width:100%;border-radius:4px;border:1px solid #ccc;margin-top:5px;">
                </div>
            </div>
        </div>
    `,
    'pending-goods': `
        <strong>Kho xử lý:</strong> Đơn cần nhận hàng hoàn.
        <ul>
            <li><strong>Boom/Hoàn:</strong> Kiểm tra hàng -> Bấm <em>Đã Nhận Hàng</em>.</li>
            <li><strong>Trả 1 phần:</strong> Chỉ check món hàng nhận lại.</li>
        </ul>
    `,
    'pending-finance': `
        <strong>Kế toán / Admin:</strong> Đơn cần đối soát tiền.
        <ul>
            <li><strong>Sửa COD:</strong> Chênh lệch tiền cần ck lại cho ĐVVC.</li>
            <li>Sau khi ck -> Bấm <em>Đã Thanh Toán</em>.</li>
        </ul>
    `,
    'completed': `
        <strong>Lịch sử:</strong> Các sự vụ đã hoàn tất.
    `
};

function renderDashboard(tabName, searchTerm = '') {
    // 1. Update Guide
    const guidePanel = document.getElementById('tab-guide');
    const guideContent = document.getElementById('guide-content');

    if (GUIDES[tabName]) {
        guidePanel.classList.remove('hidden');
        guideContent.innerHTML = GUIDES[tabName];
        // Note: Mermaid will be initialized when user clicks to show flow-details
        // See initMermaidOnShow() function
    } else {
        guidePanel.classList.add('hidden');
    }

    // 2. Filter Lists
    let filtered = TICKETS;

    // Filter by Tab
    if (tabName !== 'all') {
        let filterStatus = [];
        if (tabName === 'pending-goods') filterStatus = ['PENDING_GOODS'];
        else if (tabName === 'pending-finance') filterStatus = ['PENDING_FINANCE'];
        else if (tabName === 'completed') filterStatus = ['COMPLETED'];

        filtered = filtered.filter(t => filterStatus.includes(t.status));
    }

    // Filter by Search
    if (searchTerm) {
        filtered = filtered.filter(t =>
            (t.phone && t.phone.includes(searchTerm)) ||
            (t.orderId && t.orderId.toLowerCase().includes(searchTerm)) ||
            (t.customer && t.customer.toLowerCase().includes(searchTerm))
        );
    }

    // Render
    elements.ticketList.innerHTML = '';
    filtered.forEach(t => {
        const tr = document.createElement('tr');

        // Extract last 5 digits after "/" from orderId (e.g., "NJD/2025/41587" -> "41587")
        // Ensure orderId is converted to string first (some old tickets may have non-string values)
        const orderIdStr = String(t.orderId || '');
        const orderIdParts = orderIdStr.split('/');
        const last5Digits = orderIdParts.length > 0 ? orderIdParts[orderIdParts.length - 1] : orderIdStr;

        // Build customer cell
        const customerName = t.customer || 'N/A';
        const customerPhone = t.phone || 'N/A';
        const customerTier = t.customer_tier || null; // NEW: Get customer tier from ticket

        // Helper: Get order state display for row
        const getOrderStateDisplay = () => {
            const orderState = t.orderState || 'open';
            const stateCode = t.stateCode || 'None';

            if (orderState === 'paid') {
                if (stateCode === 'CrossCheckComplete') {
                    return { text: 'Đã thanh toán', color: '#10b981', isError: false };
                } else {
                    return { text: 'Đã TT/Chưa ĐS SP', color: '#ef4444', isError: true };
                }
            } else if (orderState === 'open') {
                if (stateCode === 'CrossCheckComplete') {
                    return { text: 'Đã đối soát SP', color: '#10b981', isError: false };
                } else {
                    return { text: 'Chưa Đối Soát SP', color: '#f59e0b', isError: false };
                }
            }
            return { text: '', color: '#64748b', isError: false };
        };
        const stateDisplay = getOrderStateDisplay();

        tr.innerHTML = `
            <td>
                <div style="font-weight:bold;font-size:13px;${stateDisplay.isError ? 'color:#ef4444;' : ''}">
                    <a href="#" onclick="openOrderDetailModal('${t.tposId}'); return false;"
                       style="${stateDisplay.isError ? 'color:#ef4444;' : 'color:#3b82f6;'}text-decoration:none;">
                        ${last5Digits}
                    </a>
                </div>
                <div style="font-size:11px;color:#64748b;">#${t.tposId || '---'}</div>
                ${stateDisplay.text ? `<div style="font-size:10px;color:${stateDisplay.color};font-weight:500;">${stateDisplay.text}</div>` : ''}
            </td>
            <td>
                <div style="font-weight:500;color:#1e293b;">${customerName}</div>
                <div style="font-weight:500;color:#1e293b;">${customerPhone}</div>
                ${customerTier ? `<div style="font-size:11px;color:#64748b;">${customerTier}</div>` : ''}
            </td>
            <td>
                ${renderTypeBadge(t.type, t.fixCodReason)}
                <div style="font-size:12px;margin-top:4px;color:#64748b;">${t.channel || 'TPOS'}</div>
            </td>
            <td>
                ${renderProductsList(t)}
            </td>
            <td>
                <div style="font-weight:bold;color:${(t.type === 'BOOM' || t.type === 'FIX_COD') ? '#ef4444' : '#1e293b'};">
                    ${formatCurrency(t.money)}
                </div>
                <div style="font-size:11px;color:#64748b;">
                    ${(t.type === 'BOOM' || t.type === 'FIX_COD') ? 'COD Giảm' : 'Giá trị hoàn'}
                </div>
            </td>
            <td>
                ${renderActionButtons(t)}
            </td>
        `;
        elements.ticketList.appendChild(tr);
    });
}

function renderProductsList(ticket) {
    // Ghi chú luôn hiển thị đầu tiên - chữ thường, màu cam
    const noteDisplay = ticket.note
        ? `<div style="color:#f59e0b;margin-bottom:4px;">${ticket.note}</div>`
        : '';

    // Nếu là FIX_COD và không phải REJECT_PARTIAL thì chỉ hiển thị ghi chú (không có sản phẩm)
    if (ticket.type === 'FIX_COD' && ticket.fixCodReason !== 'REJECT_PARTIAL') {
        return noteDisplay || '<span style="color:#94a3b8;font-size:12px;">—</span>';
    }

    if (!ticket.products || ticket.products.length === 0) {
        return noteDisplay || '<span style="color:#94a3b8;font-size:12px;">—</span>';
    }

    const productItems = ticket.products.map(p => {
        const qty = p.returnQuantity || p.quantity || 1;
        return `<li style="font-size:12px;">• ${qty}x ${p.code ? `${p.code} ` : ''}${p.name}</li>`;
    }).join('');

    return `${noteDisplay}<ul style="list-style:none;padding:0;margin:0;">${productItems}</ul>`;
}

function renderTypeBadge(type, fixCodReason) {
    const map = {
        'BOOM': { text: 'Boom Hàng', class: 'type-boom' },
        'FIX_COD': { text: 'Sửa COD', class: 'type-fix' },
        'RETURN_CLIENT': { text: 'Khách Gửi', class: 'type-return' },
        'RETURN_SHIPPER': { text: 'Thu Về', class: 'type-return' },
        'OTHER': { text: 'Vấn đề khác', class: 'type-other' },
    };
    const conf = map[type] || { text: type, class: '' };

    // Add reason detail for FIX_COD if available
    let reasonText = '';
    if (type === 'FIX_COD' && fixCodReason) {
        const reasonMap = {
            'WRONG_SHIP': 'Sai ship',
            'CUSTOMER_DEBT': 'Trừ nợ',
            'DISCOUNT': 'Giảm giá',
            'REJECT_PARTIAL': 'Nhận 1 phần'
        };
        reasonText = `<div style="font-size:10px;color:#64748b;margin-top:2px;">${reasonMap[fixCodReason] || fixCodReason}</div>`;
    }

    return `<span class="type-label ${conf.class}">● ${conf.text}</span>${reasonText}`;
}

/**
 * Open order detail modal (read-only view of order)
 */
window.openOrderDetailModal = async function (tposId) {
    if (!tposId) {
        alert('Không có ID đơn hàng');
        return;
    }

    showLoading(true);
    try {
        const details = await ApiService.getOrderDetails(tposId);
        if (!details) {
            alert('Không tìm thấy đơn hàng');
            return;
        }

        // Hide search section for view-only mode
        document.querySelector('.search-section label').style.display = 'none';
        document.querySelector('.search-section .input-group').style.display = 'none';

        // Show order result, hide issue form
        document.getElementById('order-result').classList.remove('hidden');
        document.getElementById('issue-details-form').classList.add('hidden');
        elements.customerInfoSection.classList.add('hidden'); // Also hide customer info section
        elements.customerInfoNewCustomerWarning.classList.add('hidden'); // Hide new customer warning

        // Fill order info
        document.getElementById('res-customer').textContent = details.customer || 'N/A';
        document.getElementById('res-phone').textContent = details.phone || '';
        document.getElementById('res-order-code').textContent = details.tposCode || '';
        document.getElementById('res-address').textContent = details.address || 'Chưa có địa chỉ';

        // Products table
        const productsTableHTML = details.products.map(p => {
            const noteDisplay = p.note ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">(${p.note})</div>` : '';
            return `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:6px 8px;">
                        <div><strong>[${p.code}]</strong> ${p.name}</div>
                        ${noteDisplay}
                    </td>
                    <td style="padding:6px 8px;text-align:center;">${p.quantity}</td>
                    <td style="padding:6px 8px;text-align:right;">${formatCurrency(p.price)}</td>
                </tr>
            `;
        }).join('');
        document.getElementById('res-products-table').innerHTML = productsTableHTML;

        // Summary
        const totalQty = details.products.reduce((sum, p) => sum + p.quantity, 0);
        const finalTotal = details.amountTotal - details.decreaseAmount + details.deliveryPrice;

        document.getElementById('res-total-qty').textContent = totalQty;
        document.getElementById('res-amount-total').textContent = formatCurrency(details.amountTotal);
        document.getElementById('res-decrease-amount').textContent = formatCurrency(details.decreaseAmount);
        document.getElementById('res-delivery-price').textContent = formatCurrency(details.deliveryPrice);
        document.getElementById('res-final-total').textContent = formatCurrency(finalTotal);
        document.getElementById('res-payment-amount').textContent = formatCurrency(details.paymentAmount);
        document.getElementById('res-cod').textContent = formatCurrency(details.cod);

        // Open modal using correct function
        openModal(elements.modalCreate);

    } catch (err) {
        console.error('Failed to load order details:', err);
        alert('Lỗi khi tải thông tin đơn hàng: ' + err.message);
    } finally {
        showLoading(false);
    }
};

function renderActionButtons(ticket) {
    const id = ticket.firebaseId;
    let mainAction = '';

    if (ticket.status === 'PENDING_GOODS') {
        // Màu xanh dương - chờ nhận hàng
        mainAction = `<button class="btn btn-sm action-btn action-receive" onclick="promptAction('${id}', 'RECEIVE')" style="background:#3b82f6;color:white;border:none;padding:6px 12px;border-radius:6px;font-weight:500;cursor:pointer;">📦 Nhận hàng</button>`;
    } else if (ticket.status === 'PENDING_FINANCE') {
        // Màu vàng cam - chờ thanh toán
        mainAction = `<button class="btn btn-sm action-btn action-pay" onclick="promptAction('${id}', 'PAY')" style="background:#f59e0b;color:white;border:none;padding:6px 12px;border-radius:6px;font-weight:500;cursor:pointer;">💳 Thanh toán</button>`;
    } else {
        // Màu xám nhạt - đã hoàn tất
        mainAction = `<span style="display:inline-block;padding:6px 12px;background:#e2e8f0;color:#64748b;border-radius:6px;font-weight:500;">✓ Hoàn tất</span>`;
    }

    // Icon buttons for Edit/Delete
    const iconButtons = `
        <div style="display:inline-flex;gap:6px;margin-left:8px;vertical-align:middle;">
            <button onclick="editTicket('${id}')" title="Sửa" style="background:none;border:none;cursor:pointer;font-size:14px;padding:4px;opacity:0.6;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✏️</button>
            <button onclick="deleteTicket('${id}')" title="Xóa" style="background:none;border:none;cursor:pointer;font-size:14px;padding:4px;opacity:0.6;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">🗑️</button>
        </div>
    `;

    return `<div style="display:flex;align-items:center;">${mainAction}${iconButtons}</div>`;
}

// Helper: Toggle Guide
window.toggleGuide = function () {
    const content = document.getElementById('guide-content');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        document.querySelector('.btn-toggle-guide').textContent = '▼';
    } else {
        content.style.display = 'none';
        document.querySelector('.btn-toggle-guide').textContent = '▶';
    }
}

// Helper: Update Stats
function updateStats() {
    const pendingGoods = TICKETS.filter(t => t.status === 'PENDING_GOODS').length;
    const pendingFinance = TICKETS.filter(t => t.status === 'PENDING_FINANCE').length;

    elements.countPendingGoods.textContent = pendingGoods;
    elements.countPendingFinance.textContent = pendingFinance;

    elements.badgePendingGoods.textContent = pendingGoods > 0 ? pendingGoods : '';
    elements.badgePendingFinance.textContent = pendingFinance > 0 ? pendingFinance : '';
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function openModal(el) { el.classList.add('show'); }
function closeModal(el) { el.classList.remove('show'); }

function resetCreateForm() {
    selectedOrder = null;
    currentCustomer = null; // NEW: Reset current customer
    elements.inpSearchOrder.value = '';
    document.getElementById('order-result').classList.add('hidden');
    document.getElementById('issue-details-form').classList.add('hidden');
    document.getElementById('issue-type-select').value = '';
    document.getElementById('ticket-note').value = '';

    // Restore search section visibility (in case it was hidden by openOrderDetailModal)
    document.querySelector('.search-section label').style.display = '';
    document.querySelector('.search-section .input-group').style.display = '';

    // NEW: Reset customer info section
    elements.customerInfoSection.classList.add('hidden');
    elements.customerInfoName.textContent = 'N/A';
    elements.customerInfoPhone.textContent = 'N/A';
    elements.customerInfoTier.textContent = 'N/A';
    elements.customerInfoWalletBalance.textContent = '0đ';
    elements.customerInfoNewCustomerWarning.classList.add('hidden');
}

function translateStatus(s) {
    const map = {
        'PENDING_GOODS': 'Chờ nhận hàng',
        'PENDING_FINANCE': 'Chờ đối soát',
        'COMPLETED': 'Hoàn tất'
    };
    return map[s] || s;
}

/**
 * Edit ticket
 */
window.editTicket = function (firebaseId) {
    const ticket = TICKETS.find(t => t.firebaseId === firebaseId);
    if (!ticket) {
        alert('Không tìm thấy phiếu');
        return;
    }

    // TODO: Implement edit modal
    // For now, just show alert
    alert(`Chức năng sửa phiếu #${firebaseId.slice(-4)} đang được phát triển`);
};

/**
 * Delete ticket
 */
window.deleteTicket = async function (firebaseId) {
    const ticket = TICKETS.find(t => t.firebaseId === firebaseId);
    if (!ticket) {
        alert('Không tìm thấy phiếu');
        return;
    }

    const confirmed = confirm(`Xác nhận xóa phiếu #${firebaseId.slice(-4)} - ${ticket.orderId}?`);
    if (!confirmed) return;

    showLoading(true);
    try {
        // Use ApiService.deleteTicket for PostgreSQL (hard delete = true)
        await ApiService.deleteTicket(firebaseId, true);
        console.log('[DELETE] Ticket deleted successfully:', firebaseId);
    } catch (error) {
        console.error('Delete ticket failed:', error);
        alert('Lỗi khi xóa phiếu: ' + error.message);
    } finally {
        showLoading(false);
    }
};
