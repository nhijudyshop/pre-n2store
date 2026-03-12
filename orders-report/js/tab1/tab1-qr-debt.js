// #region ═══════════════════════════════════════════════════════════════════════
// ║                   SECTION 17: QR CODE & DEBT FUNCTIONS                      ║
// ║                            search: #QR-DEBT                                 ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// DEBT (CÔNG NỢ) FUNCTIONS #QR-DEBT
// =====================================================

const DEBT_CACHE_KEY = 'orders_phone_debt_cache';
const DEBT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory cache for sync access
let debtCacheMemory = {};
let debtCacheLoaded = false;

/**
 * Initialize debt cache from IndexedDB
 */
async function initDebtCache() {
    if (debtCacheLoaded) return;

    try {
        if (window.indexedDBStorage) {
            await window.indexedDBStorage.readyPromise;
            const cached = await window.indexedDBStorage.getItem(DEBT_CACHE_KEY);
            if (cached) {
                debtCacheMemory = cached;
                console.log('[DEBT] ✅ Loaded cache from IndexedDB');
            }
        }

        // Migrate from localStorage if exists
        const localCache = localStorage.getItem(DEBT_CACHE_KEY);
        if (localCache) {
            const parsed = JSON.parse(localCache);
            Object.assign(debtCacheMemory, parsed);
            localStorage.removeItem(DEBT_CACHE_KEY);
            await saveDebtCacheAsync();
            console.log('[DEBT] 🔄 Migrated cache from localStorage to IndexedDB');
        }

        debtCacheLoaded = true;
    } catch (e) {
        console.error('[DEBT] Error initializing cache:', e);
        debtCacheLoaded = true;
    }
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initDebtCache, 100));
} else {
    setTimeout(initDebtCache, 100);
}

/**
 * Get debt cache (sync - from memory)
 * @returns {Object} Cache object { phone: { totalDebt, lastFetched } }
 */
function getDebtCache() {
    return debtCacheMemory;
}

/**
 * Save debt cache to IndexedDB (async)
 */
async function saveDebtCacheAsync() {
    try {
        if (window.indexedDBStorage) {
            await window.indexedDBStorage.setItem(DEBT_CACHE_KEY, debtCacheMemory);
        }
    } catch (e) {
        console.error('[DEBT] Error saving cache to IndexedDB:', e);
    }
}

/**
 * Save debt cache (updates memory and triggers async IndexedDB save)
 * @param {Object} cache - Cache object to save
 */
function saveDebtCache(cache) {
    debtCacheMemory = cache;
    // Debounced async save
    if (saveDebtCache._timeout) clearTimeout(saveDebtCache._timeout);
    saveDebtCache._timeout = setTimeout(() => saveDebtCacheAsync(), 1000);
}

/**
 * Get cached debt for a phone number
 * @param {string} phone - Phone number
 * @returns {number|null} Total debt or null if not cached/expired
 */
function getCachedDebt(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return null;

    const cache = getDebtCache();
    const cached = cache[normalizedPhone];

    if (cached && (Date.now() - cached.lastFetched) < DEBT_CACHE_TTL) {
        return cached.totalDebt;
    }

    return null;
}

/**
 * Save debt to cache
 * @param {string} phone - Phone number
 * @param {number} totalDebt - Total debt amount
 */
function saveDebtToCache(phone, totalDebt) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return;

    const cache = getDebtCache();
    cache[normalizedPhone] = {
        totalDebt: totalDebt,
        lastFetched: Date.now()
    };
    saveDebtCache(cache);
}

/**
 * Fetch debt from API for a phone number
 * @param {string} phone - Phone number
 * @returns {Promise<number>} Total debt
 */
async function fetchDebtForPhone(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return 0;

    try {
        // Use wallet balance API instead of debt-summary
        const response = await fetch(`${QR_API_URL}/api/v2/wallet/balance?phone=${encodeURIComponent(normalizedPhone)}`);
        const result = await response.json();

        if (result.success) {
            const totalBalance = result.balance || 0;
            saveDebtToCache(normalizedPhone, totalBalance);
            return totalBalance;
        }
    } catch (error) {
        console.error('[WALLET] Error fetching balance:', error);
    }

    return 0;
}

/**
 * Format currency for display
 * @param {number} amount - Amount
 * @returns {string} Formatted string
 */
function formatDebtCurrency(amount) {
    if (!amount || amount === 0) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

/**
 * Render debt column HTML
 * NOTE: This now only shows cached value or loading spinner.
 * Actual fetching is done by batchFetchDebts() after table render.
 * Click opens Customer 360° modal if WalletIntegration is available.
 * @param {string} phone - Phone number
 * @returns {string} HTML string for debt column
 */
function renderDebtColumn(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);

    if (!normalizedPhone) {
        return `<span style="color: #9ca3af;">-</span>`;
    }

    // Check cache first
    const cachedDebt = getCachedDebt(normalizedPhone);

    if (cachedDebt !== null) {
        // Has cached value - display immediately with click to open Customer 360° modal
        const color = cachedDebt > 0 ? '#10b981' : '#9ca3af';
        const clickHandler = typeof WalletIntegration !== 'undefined'
            ? `onclick="WalletIntegration.showWalletModal('${normalizedPhone}'); event.stopPropagation();" style="cursor: pointer;" title="Click để xem chi tiết ví"`
            : '';
        return `<span ${clickHandler} style="color: ${color}; font-weight: 500; font-size: 12px;${typeof WalletIntegration !== 'undefined' ? ' cursor: pointer;' : ''}">${formatDebtCurrency(cachedDebt)}</span>`;
    }

    // No cache - show loading spinner (batchFetchDebts will update this later)
    // Do NOT call fetchDebtForPhone here to avoid spam!
    return `<span class="debt-loading" data-phone="${normalizedPhone}" style="color: #9ca3af; font-size: 11px;"><i class="fas fa-spinner fa-spin"></i></span>`;
}

/**
 * Update all debt cells with a specific phone number
 * @param {string} phone - Normalized phone number
 * @param {number} debt - Debt amount
 */
function updateDebtCells(phone, debt) {
    const color = debt > 0 ? '#10b981' : '#9ca3af';
    // Add click handler if WalletIntegration is available
    const clickHandler = typeof WalletIntegration !== 'undefined'
        ? `onclick="WalletIntegration.showWalletModal('${phone}'); event.stopPropagation();" style="cursor: pointer;" title="Click để xem chi tiết ví"`
        : '';
    const html = `<span ${clickHandler} style="color: ${color}; font-weight: 500; font-size: 12px;${typeof WalletIntegration !== 'undefined' ? ' cursor: pointer;' : ''}">${formatDebtCurrency(debt)}</span>`;

    // Find all loading cells with this phone and update them
    document.querySelectorAll(`.debt-loading[data-phone="${phone}"]`).forEach(cell => {
        cell.outerHTML = html;
    });
}

/**
 * Batch fetch wallet balances for multiple phones using wallet batch API
 * Reduces 80 API calls → 1 API call!
 * @param {Array<string>} phones - Array of phone numbers
 */
async function batchFetchDebts(phones) {
    // Validate input
    if (!phones || !Array.isArray(phones)) {
        console.warn('[WALLET-BATCH] Invalid input - phones must be an array');
        return;
    }

    const uniquePhones = [...new Set(phones.map(p => normalizePhoneForQR(p)).filter(p => p))];
    const uncachedPhones = uniquePhones.filter(p => getCachedDebt(p) === null);

    // Double-check before API call to prevent 400 errors
    if (!Array.isArray(uncachedPhones) || uncachedPhones.length === 0) {
        console.log('[WALLET-BATCH] No uncached phones to fetch, skipping API call');
        return;
    }

    console.log(`[WALLET-BATCH] Fetching ${uncachedPhones.length} phones in ONE request...`);

    try {
        // Call wallet batch API - ONE request for ALL phones!
        const requestBody = JSON.stringify({ phones: uncachedPhones });
        console.log('[WALLET-BATCH] Request body:', requestBody);

        const response = await fetch(`${QR_API_URL}/api/v2/wallets/batch-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody
        });

        // Check response status first
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[WALLET-BATCH] ❌ HTTP ${response.status}: ${errorText}`);
            // Fallback: set all to 0
            for (const phone of uncachedPhones) {
                updateDebtCells(phone, 0);
            }
            return;
        }

        const result = await response.json();

        if (result.success && result.data) {
            console.log(`[WALLET-BATCH] ✅ Received ${Object.keys(result.data).length} results`);

            // Update cache and UI for all phones
            for (const [phone, walletData] of Object.entries(result.data)) {
                // Total = balance + virtualBalance
                const totalBalance = walletData.total || 0;
                saveDebtToCache(phone, totalBalance);
                updateDebtCells(phone, totalBalance);
            }

            // Handle phones that weren't in the response (set to 0)
            for (const phone of uncachedPhones) {
                if (!result.data[phone]) {
                    saveDebtToCache(phone, 0);
                    updateDebtCells(phone, 0);
                }
            }
        } else {
            console.error('[WALLET-BATCH] ❌ API error:', result.error);
            // Fallback: set all to 0
            for (const phone of uncachedPhones) {
                updateDebtCells(phone, 0);
            }
        }
    } catch (error) {
        console.error('[WALLET-BATCH] ❌ Network error:', error);
        // Fallback: set all to 0
        for (const phone of uncachedPhones) {
            updateDebtCells(phone, 0);
        }
    }
}

// =====================================================
// RECENT TRANSFER TRACKING
// Fetch phones that transferred within last 7 days
// =====================================================

// Map: phone → { amount, last_transfer_at }
window.recentTransferPhones = new Map();

async function fetchRecentTransfers() {
    try {
        const response = await fetch(`${QR_API_URL}/api/sepay/recent-transfers`);
        const result = await response.json();
        if (result.success && result.details) {
            window.recentTransferPhones = new Map();
            for (const r of result.details) {
                window.recentTransferPhones.set(r.phone, parseFloat(r.transfer_amount) || 0);
            }
            console.log(`[RECENT-CK] ✅ Loaded ${window.recentTransferPhones.size} recent transfer phones`);
        }
    } catch (error) {
        console.error('[RECENT-CK] Error fetching recent transfers:', error);
    }
}

function isRecentTransfer(phone) {
    if (!phone) return false;
    const normalized = normalizePhoneForQR(phone);
    return normalized && window.recentTransferPhones.has(normalized);
}

function renderRecentTransferBadge(phone) {
    if (!phone) return '';
    const normalized = normalizePhoneForQR(phone);
    if (!normalized || !window.recentTransferPhones.has(normalized)) return '';
    const amount = window.recentTransferPhones.get(normalized);
    const formattedAmount = amount ? new Intl.NumberFormat('vi-VN').format(amount) + 'đ' : '';
    return ` <span class="ck-badge" style="display: inline-block; background: #10b981; color: white; font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 600; vertical-align: middle;" title="Tổng CK 7 ngày: ${formattedAmount}">CK ${formattedAmount}</span>`;
}

/**
 * Update CK badges in table for a specific phone (or all phones)
 */
function updateRecentTransferBadgesInTable(targetPhone) {
    const normalized = targetPhone ? normalizePhoneForQR(targetPhone) : null;
    document.querySelectorAll('td[data-column="customer"]').forEach(cell => {
        const row = cell.closest('tr');
        if (!row) return;
        const phoneCell = row.querySelector('td[data-column="phone"]');
        if (!phoneCell) return;
        const rowPhone = normalizePhoneForQR(phoneCell.textContent.trim());
        if (normalized && rowPhone !== normalized) return;

        // Remove existing badge
        const oldBadge = cell.querySelector('.ck-badge');
        if (oldBadge) oldBadge.remove();

        // Add new badge if phone is in recent transfers
        if (rowPhone && window.recentTransferPhones.has(rowPhone)) {
            const amount = window.recentTransferPhones.get(rowPhone);
            const formattedAmount = amount ? new Intl.NumberFormat('vi-VN').format(amount) + 'đ' : '';
            const nameDiv = cell.querySelector('.customer-name');
            if (nameDiv) {
                const badge = document.createElement('span');
                badge.className = 'ck-badge';
                badge.style.cssText = 'display: inline-block; background: #10b981; color: white; font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 600; vertical-align: middle; margin-left: 4px;';
                badge.title = `Tổng CK 7 ngày: ${formattedAmount}`;
                badge.textContent = `CK ${formattedAmount}`;
                nameDiv.appendChild(badge);
            }
            // Add watermark background
            cell.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.03) 100%)';
        } else {
            cell.style.background = '';
        }
    });
}

// Fetch on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(fetchRecentTransfers, 500));
} else {
    setTimeout(fetchRecentTransfers, 500);
}

// Make QR and Debt functions globally accessible
window.copyQRCode = copyQRCode;
window.getOrCreateQRForPhone = getOrCreateQRForPhone;
window.renderQRColumn = renderQRColumn;
window.syncQRFromBalanceHistory = syncQRFromBalanceHistory;
window.showOrderQRModal = showOrderQRModal;
window.closeOrderQRModal = closeOrderQRModal;
window.copyQRCodeFromModal = copyQRCodeFromModal;
window.copyQRImageUrl = copyQRImageUrl;
window.renderDebtColumn = renderDebtColumn;
window.fetchDebtForPhone = fetchDebtForPhone;
window.batchFetchDebts = batchFetchDebts;
window.fetchRecentTransfers = fetchRecentTransfers;
window.isRecentTransfer = isRecentTransfer;
window.renderRecentTransferBadge = renderRecentTransferBadge;
window.updateRecentTransferBadgesInTable = updateRecentTransferBadgesInTable;

// =====================================================
// REALTIME DEBT UPDATES (SSE)
// Lắng nghe giao dịch mới để cập nhật công nợ
// =====================================================

let debtEventSource = null;
let debtReconnectTimeout = null;
let isDebtManualClose = false;

/**
 * Extract phone number from transaction content
 * Tìm SĐT trong nội dung giao dịch hoặc từ customer-info mapping
 * @param {Object} transaction - Transaction object
 * @returns {string|null} Phone number or null
 */
function extractPhoneFromTransaction(transaction) {
    const content = transaction.content || '';

    // Try to find unique code (N2XXXXXXXXXX) in content
    const uniqueCodeMatch = content.match(/\bN2[A-Z0-9]{16}\b/);

    if (uniqueCodeMatch) {
        const uniqueCode = uniqueCodeMatch[0];
        // Look up phone from QR cache (reverse lookup)
        const qrCache = getQRCache();
        for (const [phone, data] of Object.entries(qrCache)) {
            if (data.uniqueCode === uniqueCode) {
                return phone;
            }
        }
    }

    return null;
}

/**
 * Handle new transaction from SSE - update debt
 * @param {Object} transaction - Transaction data
 */
async function handleDebtTransaction(transaction) {
    // Only care about incoming transactions (deposits)
    if (transaction.transfer_type !== 'in') return;

    const phone = extractPhoneFromTransaction(transaction);

    if (phone) {
        console.log(`[DEBT-REALTIME] New transaction for phone ${phone}, refreshing debt...`);

        // Invalidate cache for this phone
        const cache = getDebtCache();
        delete cache[phone];
        saveDebtCache(cache);

        // Re-fetch debt
        const newDebt = await fetchDebtForPhone(phone);

        // Update all cells in the table
        updateDebtCellsInTable(phone, newDebt);

        // Show notification
        showNotification(`Cập nhật công nợ: ${formatDebtCurrency(newDebt)}`, 'info');
    }
}

/**
 * Update debt cells in the orders table
 * @param {string} phone - Phone number
 * @param {number} debt - New debt amount
 */
function updateDebtCellsInTable(phone, debt) {
    const color = debt > 0 ? '#10b981' : '#9ca3af';
    const html = `<span style="color: ${color}; font-weight: 500; font-size: 12px;">${formatDebtCurrency(debt)}</span>`;

    // Find all debt cells and update those matching this phone
    document.querySelectorAll('td[data-column="debt"]').forEach(cell => {
        // Get the phone from the same row
        const row = cell.closest('tr');
        if (row) {
            const phoneCell = row.querySelector('td[data-column="phone"]');
            if (phoneCell) {
                const cellPhone = normalizePhoneForQR(phoneCell.textContent.trim());
                if (cellPhone === phone) {
                    cell.innerHTML = html;
                }
            }
        }
    });
}

/**
 * Connect to SSE endpoint for realtime debt updates
 */
function connectDebtRealtime() {
    if (debtEventSource) return; // Already connected

    try {
        console.log('[DEBT-REALTIME] Connecting to SSE endpoint...');
        debtEventSource = new EventSource(`${QR_API_URL}/api/sepay/stream`);

        // Connection established
        debtEventSource.addEventListener('connected', (e) => {
            console.log('[DEBT-REALTIME] ✅ Connected to SSE');
        });

        // New transaction received
        debtEventSource.addEventListener('new-transaction', (e) => {
            try {
                const transaction = JSON.parse(e.data);
                console.log('[DEBT-REALTIME] New transaction:', transaction.content?.substring(0, 50));
                handleDebtTransaction(transaction);
            } catch (err) {
                console.error('[DEBT-REALTIME] Error parsing transaction:', err);
            }
        });

        // Customer matched to transaction - update CK badge in realtime
        debtEventSource.addEventListener('customer-info-updated', (e) => {
            try {
                const data = JSON.parse(e.data);
                const phone = data.customer_phone;
                if (phone) {
                    console.log('[RECENT-CK] Realtime: new transfer matched to', phone);
                    // Re-fetch recent transfers to get updated totals
                    fetchRecentTransfers().then(() => {
                        updateRecentTransferBadgesInTable(phone);
                    });
                }
            } catch (err) {
                console.error('[RECENT-CK] Error handling customer-info-updated:', err);
            }
        });

        // Connection error
        debtEventSource.onerror = (error) => {
            console.error('[DEBT-REALTIME] SSE Error:', error);

            // Close current connection
            if (debtEventSource) {
                debtEventSource.close();
                debtEventSource = null;
            }

            // Attempt to reconnect after 10 seconds (if not manually closed)
            if (!isDebtManualClose) {
                clearTimeout(debtReconnectTimeout);
                debtReconnectTimeout = setTimeout(() => {
                    console.log('[DEBT-REALTIME] Attempting to reconnect...');
                    connectDebtRealtime();
                }, 10000);
            }
        };

    } catch (error) {
        console.error('[DEBT-REALTIME] Failed to connect:', error);
    }
}

/**
 * Disconnect from SSE
 */
function disconnectDebtRealtime() {
    isDebtManualClose = true;
    clearTimeout(debtReconnectTimeout);

    if (debtEventSource) {
        debtEventSource.close();
        debtEventSource = null;
        console.log('[DEBT-REALTIME] Disconnected from SSE');
    }
}

// Auto-connect realtime when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Delay connection to let page load first
    setTimeout(() => {
        connectDebtRealtime();
    }, 3000);
});

// =====================================================
// SALE BUTTON MODAL FUNCTIONS
// =====================================================
let currentSaleOrderData = null;
let currentSalePartnerData = null;
let currentSaleLastDeposit = null; // { amount, date } from wallet API

// =====================================================
// DELIVERY CARRIER, SALE MODAL UI, TOTALS, etc.
// → Moved to js/utils/sale-modal-common.js
// =====================================================

// (carrier cache, delivery dropdown, COD, smart delivery, district parsing,
//  carrier matching, formatCurrencyVND → all in sale-modal-common.js)


/**
 * Open Sale Button Modal and fetch order details from API
 */
async function openSaleButtonModal() {
    console.log('[SALE-MODAL] Opening Sale Button Modal...');

    // Get the selected order ID (should be exactly 1)
    if (selectedOrderIds.size !== 1) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn đúng 1 đơn hàng');
        }
        return;
    }

    const orderId = Array.from(selectedOrderIds)[0];
    // O(1) via OrderStore with fallback
    const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);

    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy đơn hàng');
        }
        return;
    }

    currentSaleOrderData = order;
    console.log('[SALE-MODAL] Selected order:', order);

    // Reset form fields to avoid stale data from previous order
    const discountEl = document.getElementById('saleDiscount');
    if (discountEl) discountEl.value = 0;
    const receiverNoteEl = document.getElementById('saleReceiverNote');
    if (receiverNoteEl) receiverNoteEl.value = '';
    const prepaidEl = document.getElementById('salePrepaidAmount');
    if (prepaidEl) prepaidEl.value = 0;
    const prepaidDateEl = document.getElementById('salePrepaidDate');
    if (prepaidDateEl) prepaidDateEl.value = '';

    // Show modal with loading state
    const modal = document.getElementById('saleButtonModal');
    modal.style.display = 'flex';

    // Reset confirm button state (in case it was disabled from previous session)
    const confirmBtn = document.querySelector('.sale-btn-teal');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Xác nhận và in (F9)';
    }

    // Restore bill type preference from localStorage (default: 'web')
    const savedBillType = localStorage.getItem('saleBillTypePreference') || 'web';
    const billTypeWeb = document.getElementById('saleBillTypeWeb');
    const billTypeTpos = document.getElementById('saleBillTypeTpos');
    if (billTypeWeb && billTypeTpos) {
        billTypeWeb.checked = savedBillType === 'web';
        billTypeTpos.checked = savedBillType === 'tpos';
    }

    // Check if user is admin and enable/disable Công nợ field accordingly
    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    const confirmDebtBtn = document.getElementById('confirmDebtBtn');

    // Check admin access via roleTemplate
    let isAdmin = window.authManager?.isAdminTemplate?.() || false;

    if (prepaidAmountField) {
        if (isAdmin) {
            prepaidAmountField.disabled = false;
            prepaidAmountField.style.background = '#ffffff';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'inline-flex';
            console.log('[SALE-MODAL] Admin detected - Công nợ field enabled with confirm button');
        } else {
            prepaidAmountField.disabled = true;
            prepaidAmountField.style.background = '#f3f4f6';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'none';
        }

        // Add event listener for prepaid amount changes (for admin)
        prepaidAmountField.oninput = function () {
            updateSaleRemainingBalance();
        };
    }

    // Add event listener for COD input changes
    const codInput = document.getElementById('saleCOD');
    if (codInput) {
        codInput.oninput = function () {
            updateSaleRemainingBalance();
        };
    }

    // Add event listener for shipping fee changes to update COD realtime
    const shippingFeeInput = document.getElementById('saleShippingFee');
    if (shippingFeeInput) {
        shippingFeeInput.oninput = function () {
            // Recalculate COD when shipping fee changes
            const finalTotal = parseFloat(document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')) || 0;
            const shippingFee = parseFloat(this.value) || 0;
            const codInput = document.getElementById('saleCOD');
            if (codInput) {
                codInput.value = finalTotal + shippingFee;
                updateSaleRemainingBalance();
            }
        };
    }

    // Add event listener for discount changes to update totals realtime
    const discountInput = document.getElementById('saleDiscount');
    if (discountInput) {
        discountInput.oninput = function () {
            // Recalculate totals when discount changes
            const totalAmount = parseFloat(document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')) || 0;
            const totalQuantity = parseInt(document.getElementById('saleTotalQuantity')?.textContent) || 0;
            updateSaleTotals(totalQuantity, totalAmount);
        };
    }

    // Populate basic order data first (from local data)
    populateSaleModalWithOrder(order);

    // Fetch realtime debt for the phone number (same as debt column in table)
    const phone = order.Telephone || order.PartnerPhone;
    if (phone) {
        await fetchDebtForSaleModal(phone);
    }

    // Populate delivery carrier dropdown (async, with localStorage cache)
    // Must await to ensure dropdown is ready for smart selection
    await populateDeliveryCarrierDropdown();

    // Fetch detailed order data from API (includes partner, orderLines)
    const orderDetails = await fetchOrderDetailsForSale(orderId);

    if (orderDetails) {
        // Store partner data
        currentSalePartnerData = orderDetails.partner;

        // Populate partner data
        if (orderDetails.partner) {
            populatePartnerData(orderDetails.partner);

            // Smart select delivery partner based on customer address
            const receiverAddress = document.getElementById('saleReceiverAddress')?.value || '';
            const extraAddress = orderDetails.partner.ExtraAddress || null;
            smartSelectDeliveryPartner(receiverAddress, extraAddress);
        }

        // Populate order lines if available
        if (orderDetails.orderLines && orderDetails.orderLines.length > 0) {
            // 🔥 Map SaleOnlineDetailId from orderLine.Id for FastSaleOrder compatibility
            const mappedOrderLines = orderDetails.orderLines.map(line => ({
                ...line,
                SaleOnlineDetailId: line.Id || line.SaleOnlineDetailId || null
            }));
            populateSaleOrderLinesFromAPI(mappedOrderLines);
        }
    } else {
        // Fallback: try smart selection with basic order address if no partner details
        const receiverAddress = order.PartnerAddress || order.Address || '';
        if (receiverAddress) {
            smartSelectDeliveryPartner(receiverAddress, null);
        }
    }

    // Initialize product search for this modal
    initSaleProductSearch();

    // Auto-fill notes from existing data (wallet, tags)
    autoFillSaleNote();
}

/**
 * Open Sale Modal from Social Order data (called via postMessage from Đơn Social tab)
 * Reuses all existing sale modal sub-functions: populateSaleModalWithOrder,
 * fetchDebtForSaleModal, populateDeliveryCarrierDropdown, etc.
 * @param {Object} socialOrder - Social order data mapped from tab-social
 */
async function openSaleModalFromSocialOrder(socialOrder) {
    console.log('[SALE-MODAL] Opening from social order:', socialOrder);

    // Map social order data to Tab1 order format
    const mappedOrder = {
        Id: socialOrder.id,
        PartnerName: socialOrder.customerName,
        Name: socialOrder.customerName,
        Telephone: socialOrder.phone,
        PartnerPhone: socialOrder.phone,
        PartnerAddress: socialOrder.address,
        Address: socialOrder.address,
        TotalAmount: socialOrder.totalAmount || 0,
        Comment: socialOrder.note || '',
        Details: (socialOrder.products || []).map(p => ({
            ProductNameGet: p.productName || '',
            ProductName: p.productName || '',
            Quantity: p.quantity || 1,
            PriceUnit: p.sellingPrice || 0,
            Price: p.sellingPrice || 0,
            Note: p.variant || ''
        })),
        Tags: socialOrder.tags ? JSON.stringify(socialOrder.tags) : '[]',
        _isSocialOrder: true
    };

    currentSaleOrderData = mappedOrder;

    // Reset form fields (same logic as openSaleButtonModal)
    const discountEl = document.getElementById('saleDiscount');
    if (discountEl) discountEl.value = 0;
    const receiverNoteEl = document.getElementById('saleReceiverNote');
    if (receiverNoteEl) receiverNoteEl.value = '';
    const prepaidEl = document.getElementById('salePrepaidAmount');
    if (prepaidEl) prepaidEl.value = 0;
    const prepaidDateEl = document.getElementById('salePrepaidDate');
    if (prepaidDateEl) prepaidDateEl.value = '';

    // Show modal
    const modal = document.getElementById('saleButtonModal');
    modal.style.display = 'flex';

    // Reset confirm button
    const confirmBtn = document.querySelector('.sale-btn-teal');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Xác nhận và in (F9)';
    }

    // Restore bill type preference
    const savedBillType = localStorage.getItem('saleBillTypePreference') || 'web';
    const billTypeWeb = document.getElementById('saleBillTypeWeb');
    const billTypeTpos = document.getElementById('saleBillTypeTpos');
    if (billTypeWeb && billTypeTpos) {
        billTypeWeb.checked = savedBillType === 'web';
        billTypeTpos.checked = savedBillType === 'tpos';
    }

    // Admin check for Công nợ field
    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    const confirmDebtBtn = document.getElementById('confirmDebtBtn');
    let isAdmin = window.authManager?.isAdminTemplate?.() || false;

    if (prepaidAmountField) {
        if (isAdmin) {
            prepaidAmountField.disabled = false;
            prepaidAmountField.style.background = '#ffffff';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'inline-flex';
        } else {
            prepaidAmountField.disabled = true;
            prepaidAmountField.style.background = '#f3f4f6';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'none';
        }
        prepaidAmountField.oninput = function () {
            updateSaleRemainingBalance();
        };
    }

    // Event listeners for COD, shipping fee, discount (same as openSaleButtonModal)
    const codInput = document.getElementById('saleCOD');
    if (codInput) {
        codInput.oninput = function () { updateSaleRemainingBalance(); };
    }
    const shippingFeeInput = document.getElementById('saleShippingFee');
    if (shippingFeeInput) {
        shippingFeeInput.oninput = function () {
            const finalTotal = parseFloat(document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')) || 0;
            const shippingFee = parseFloat(this.value) || 0;
            const codInput = document.getElementById('saleCOD');
            if (codInput) {
                codInput.value = finalTotal + shippingFee;
                updateSaleRemainingBalance();
            }
        };
    }
    const discountInput = document.getElementById('saleDiscount');
    if (discountInput) {
        discountInput.oninput = function () {
            const totalAmount = parseFloat(document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')) || 0;
            const totalQuantity = parseInt(document.getElementById('saleTotalQuantity')?.textContent) || 0;
            updateSaleTotals(totalQuantity, totalAmount);
        };
    }

    // Reuse existing sub-functions to populate the modal
    populateSaleModalWithOrder(mappedOrder);

    // Fetch wallet/debt if phone available
    if (mappedOrder.Telephone) {
        await fetchDebtForSaleModal(mappedOrder.Telephone);
    }

    // Populate delivery carrier dropdown
    await populateDeliveryCarrierDropdown();

    // Smart select delivery partner based on address
    if (mappedOrder.Address) {
        smartSelectDeliveryPartner(mappedOrder.Address, null);
    }

    // Init product search
    initSaleProductSearch();

    // Auto-fill notes
    autoFillSaleNote();
}

/**
 * Close Sale Button Modal
 * @param {boolean} clearSelection - If true, clear checkbox selection and selectedOrderIds
 */
function closeSaleButtonModal(clearSelection = false) {
    const modal = document.getElementById('saleButtonModal');
    modal.style.display = 'none';
    currentSaleOrderData = null;
    currentSalePartnerData = null;
    currentSaleLastDeposit = null;

    // Clear selection if requested (after successful order creation)
    if (clearSelection) {
        // Clear selectedOrderIds
        selectedOrderIds.clear();

        // Uncheck all checkboxes in table
        const checkboxes = document.querySelectorAll('#tableBody input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);

        // Uncheck "Select All" checkbox
        const selectAllCheckbox = document.getElementById('selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }

        // Update action buttons visibility
        updateActionButtons();
    }
}

/**
 * Confirm debt update - Admin only
 * Updates the debt value in the database (customers.debt field on SQL Render)
 */
async function confirmDebtUpdate() {
    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    const confirmBtn = document.getElementById('confirmDebtBtn');

    if (!prepaidAmountField || !currentSaleOrderData) {
        if (window.notificationManager) {
            window.notificationManager.error('Không có dữ liệu để cập nhật');
        }
        return;
    }

    const phone = currentSaleOrderData.Telephone || currentSaleOrderData.PartnerPhone;
    if (!phone) {
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy số điện thoại khách hàng');
        }
        return;
    }

    const newDebt = parseFloat(prepaidAmountField.value) || 0;

    // Show loading state
    const originalText = confirmBtn?.textContent;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '...';
    }

    try {
        console.log('[DEBT-UPDATE] Updating debt for phone:', phone, 'to:', newDebt);

        const response = await fetch(`${QR_API_URL}/api/sepay/update-debt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone: phone,
                new_debt: newDebt,
                reason: 'Admin manual adjustment from Sale Modal'
            })
        });

        const result = await response.json();

        if (result.success) {
            console.log('[DEBT-UPDATE] ✅ Success:', result);
            if (window.notificationManager) {
                window.notificationManager.success(`Đã cập nhật Công nợ: ${newDebt.toLocaleString('vi-VN')}đ`);
            }
            // Update the field background to indicate saved
            prepaidAmountField.style.background = '#d1fae5'; // Light green
            setTimeout(() => {
                prepaidAmountField.style.background = '#ffffff';
            }, 2000);

            // 🔄 REALTIME UPDATE: Invalidate cache and update table cells immediately
            const normalizedPhone = normalizePhoneForQR(phone);
            if (normalizedPhone) {
                // Invalidate debt cache for this phone
                const cache = getDebtCache();
                delete cache[normalizedPhone];
                saveDebtCache(cache);
                console.log('[DEBT-UPDATE] Cache invalidated for phone:', normalizedPhone);

                // Update debt cells in the orders table immediately
                updateDebtCellsInTable(normalizedPhone, newDebt);
                console.log('[DEBT-UPDATE] Table cells updated for phone:', normalizedPhone);

                // Also update "Nợ cũ" display in modal
                const oldDebtField = document.getElementById('saleOldDebt');
                if (oldDebtField) {
                    oldDebtField.textContent = newDebt > 0 ? `${newDebt.toLocaleString('vi-VN')} đ` : '0';
                }
            }
        } else {
            throw new Error(result.error || 'Failed to update debt');
        }

    } catch (error) {
        console.error('[DEBT-UPDATE] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi cập nhật Công nợ: ' + error.message);
        }
    } finally {
        // Restore button state
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalText || 'Xác nhận';
        }
    }
}

/**
 * Switch tabs in Sale Modal
 */
function switchSaleTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.sale-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Update tab contents
    document.querySelectorAll('.sale-tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });

    const activeContent = document.getElementById(`saleTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (activeContent) {
        activeContent.classList.add('active');
        activeContent.style.display = 'block';
    }
}

/**
 * Fetch order details (partner, orderLines) from TPOS API
 */
async function fetchOrderDetailsForSale(orderUuid) {
    console.log('[SALE-MODAL] Fetching order details for UUID:', orderUuid);

    try {
        if (!window.tokenManager) {
            console.warn('[SALE-MODAL] No tokenManager found');
            return null;
        }

        const response = await window.tokenManager.authenticatedFetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetDetails?$expand=orderLines($expand=Product,ProductUOM),partner,warehouse', {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json;charset=UTF-8'
            },
            body: JSON.stringify({ ids: [orderUuid] })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('[SALE-MODAL] Order details response:', data);

        return data;

    } catch (error) {
        console.error('[SALE-MODAL] Error fetching order details:', error);
        if (window.notificationManager) {
            window.notificationManager.warning('Không thể tải thông tin đơn hàng');
        }
        return null;
    }
}

// Close modal when clicking outside
document.addEventListener('click', function (e) {
    const modal = document.getElementById('saleButtonModal');
    if (e.target === modal) {
        closeSaleButtonModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('saleButtonModal');
        if (modal && modal.style.display === 'flex') {
            closeSaleButtonModal();
        }
    }
});

// Disconnect when page unloads and cleanup held products
window.addEventListener('beforeunload', () => {
    disconnectDebtRealtime();

    // Cleanup held products for current user
    if (typeof window.cleanupHeldProductsSync === 'function') {
        window.cleanupHeldProductsSync();
    }

    // Cleanup held products listener
    if (typeof window.cleanupHeldProductsListener === 'function') {
        window.cleanupHeldProductsListener();
    }
});

// Export realtime functions
window.connectDebtRealtime = connectDebtRealtime;
window.disconnectDebtRealtime = disconnectDebtRealtime;

// Export sale modal functions
window.openSaleButtonModal = openSaleButtonModal;
window.closeSaleButtonModal = closeSaleButtonModal;

