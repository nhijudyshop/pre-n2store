/**
 * =====================================================
 * WALLET INTEGRATION MODULE
 * =====================================================
 *
 * Integrate Customer 360° Wallet with Orders Report
 *
 * Features:
 * - Display wallet balance in orders table (replaces old debt column)
 * - Show wallet summary when clicking phone
 * - Allow wallet deduction when processing orders
 * - Batch fetch wallet data for multiple phones
 *
 * API: Uses Customer 360° API (PostgreSQL)
 *
 * Created: 2026-01-07
 * Phase 5 of Customer 360° implementation
 * =====================================================
 */

const WalletIntegration = (function() {
    // =====================================================
    // CONFIGURATION
    // =====================================================

    const CONFIG = {
        API_URL: 'https://n2store-fallback.onrender.com/api',
        CACHE_TTL: 60000, // 1 minute cache
        POLLING_INTERVAL: 30000, // 30 seconds polling
    };

    // Cache for wallet data
    const walletCache = new Map();

    // Polling interval reference
    let pollingInterval = null;

    // Phones being watched for updates
    const watchedPhones = new Set();

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    function normalizePhone(phone) {
        if (!phone) return null;
        let cleaned = String(phone).replace(/\D/g, '');
        if (cleaned.startsWith('84')) cleaned = '0' + cleaned.slice(2);
        if (cleaned.startsWith('+84')) cleaned = '0' + cleaned.slice(3);
        if (!cleaned.startsWith('0') && cleaned.length === 9) cleaned = '0' + cleaned;
        return cleaned.length >= 10 && cleaned.length <= 11 ? cleaned : null;
    }

    function formatCurrency(amount) {
        if (amount === null || amount === undefined) return '-';
        const num = parseFloat(amount) || 0;
        return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
    }

    function formatCurrencyShort(amount) {
        if (!amount) return '0';
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(1).replace('.0', '') + 'tr';
        }
        if (amount >= 1000) {
            return Math.round(amount / 1000) + 'k';
        }
        return amount.toString();
    }

    // =====================================================
    // API FUNCTIONS
    // =====================================================

    /**
     * Get wallet info for a single phone
     * @param {string} phone
     * @returns {Promise<Object>}
     */
    async function getWallet(phone) {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) return null;

        // Check cache first
        const cached = walletCache.get(normalizedPhone);
        if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_TTL) {
            return cached.data;
        }

        try {
            const response = await fetch(`${CONFIG.API_URL}/v2/wallets/${normalizedPhone}`);
            if (!response.ok) {
                if (response.status === 404) {
                    // No wallet found - return zero balance
                    const emptyWallet = {
                        balance: 0,
                        virtual_balance: 0,
                        total: 0,
                        virtual_credits: []
                    };
                    walletCache.set(normalizedPhone, { data: emptyWallet, timestamp: Date.now() });
                    return emptyWallet;
                }
                throw new Error(`Wallet API error: ${response.status}`);
            }

            const result = await response.json();
            const walletData = result.data;

            // Cache the result
            walletCache.set(normalizedPhone, { data: walletData, timestamp: Date.now() });

            return walletData;
        } catch (error) {
            console.error('[WALLET] Get wallet failed:', normalizedPhone, error.message);
            return null;
        }
    }

    /**
     * Batch get wallet info for multiple phones (more efficient)
     * @param {Array<string>} phones
     * @returns {Promise<Map<string, Object>>}
     */
    async function getWalletBatch(phones) {
        const normalizedPhones = phones
            .map(normalizePhone)
            .filter(p => p !== null);

        if (normalizedPhones.length === 0) return new Map();

        // Filter out phones that are already cached
        const phonesToFetch = normalizedPhones.filter(phone => {
            const cached = walletCache.get(phone);
            return !cached || Date.now() - cached.timestamp >= CONFIG.CACHE_TTL;
        });

        if (phonesToFetch.length > 0) {
            try {
                const response = await fetch(`${CONFIG.API_URL}/v2/wallets/batch-summary`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phones: phonesToFetch })
                });

                if (response.ok) {
                    const result = await response.json();
                    const walletMap = result.data || {};

                    // Cache results
                    for (const phone of phonesToFetch) {
                        const walletData = walletMap[phone] || {
                            balance: 0,
                            virtual_balance: 0,
                            total: 0
                        };
                        walletCache.set(phone, { data: walletData, timestamp: Date.now() });
                    }
                }
            } catch (error) {
                console.error('[WALLET] Batch fetch failed:', error.message);
            }
        }

        // Return all requested phones from cache
        const resultMap = new Map();
        for (const phone of normalizedPhones) {
            const cached = walletCache.get(phone);
            if (cached) {
                resultMap.set(phone, cached.data);
            }
        }

        return resultMap;
    }

    /**
     * Withdraw from wallet (deduct when processing order)
     * @param {string} phone
     * @param {number} amount
     * @param {string} orderId
     * @param {string} note
     * @returns {Promise<Object>}
     */
    async function withdrawWallet(phone, amount, orderId, note) {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) throw new Error('Invalid phone number');

        const response = await fetch(`${CONFIG.API_URL}/v2/wallets/${normalizedPhone}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount,
                order_id: orderId,
                note: note || `Trừ ví - Đơn ${orderId}`
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to withdraw from wallet');
        }

        const result = await response.json();

        // Invalidate cache
        walletCache.delete(normalizedPhone);

        // Refresh wallet display
        await refreshWalletDisplay(normalizedPhone);

        return result.data;
    }

    /**
     * Get Customer 360 view (includes wallet + tickets + activities)
     * @param {string} phone
     * @returns {Promise<Object>}
     */
    async function getCustomer360(phone) {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) return null;

        try {
            const response = await fetch(`${CONFIG.API_URL}/customer/${normalizedPhone}`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`Customer API error: ${response.status}`);
            }
            const result = await response.json();
            return result.data;
        } catch (error) {
            console.error('[WALLET] Get customer 360 failed:', error.message);
            return null;
        }
    }

    // =====================================================
    // UI RENDERING
    // =====================================================

    /**
     * Render wallet balance cell for orders table
     * @param {string} phone
     * @returns {string} HTML string
     */
    function renderWalletCell(phone) {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) return '<span style="color: #999;">-</span>';

        const cached = walletCache.get(normalizedPhone);

        if (cached && cached.data) {
            const wallet = cached.data;
            const total = (wallet.balance || 0) + (wallet.virtual_balance || 0);

            if (total <= 0) {
                return '<span style="color: #999;">0</span>';
            }

            // Color based on amount
            let color = '#10b981'; // green
            if (total > 500000) color = '#059669'; // darker green
            if (wallet.virtual_balance > 0) color = '#8b5cf6'; // purple for virtual

            const tooltip = `Thực: ${formatCurrency(wallet.balance)}\nẢo: ${formatCurrency(wallet.virtual_balance)}`;

            return `<span class="wallet-balance"
                style="color: ${color}; font-weight: 600; cursor: pointer;"
                data-phone="${normalizedPhone}"
                title="${tooltip}"
                onclick="WalletIntegration.showWalletModal('${normalizedPhone}')">
                ${formatCurrencyShort(total)}
            </span>`;
        }

        // Not yet loaded - show loading spinner
        return `<span class="wallet-loading" data-phone="${normalizedPhone}">
            <i class="fas fa-spinner fa-spin" style="color: #999;"></i>
        </span>`;
    }

    /**
     * Update wallet display for a specific phone in the table
     * @param {string} phone
     */
    async function refreshWalletDisplay(phone) {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) return;

        // Invalidate cache
        walletCache.delete(normalizedPhone);

        // Fetch fresh data
        await getWallet(normalizedPhone);

        // Update all cells with this phone
        const cells = document.querySelectorAll(`[data-column="wallet"] [data-phone="${normalizedPhone}"],
            .wallet-balance[data-phone="${normalizedPhone}"],
            .wallet-loading[data-phone="${normalizedPhone}"]`);

        cells.forEach(cell => {
            const parent = cell.closest('td');
            if (parent) {
                parent.innerHTML = renderWalletCell(normalizedPhone);
            }
        });
    }

    /**
     * Refresh wallet display for all phones in current view
     * @param {Array<string>} phones
     */
    async function refreshWalletBatch(phones) {
        // Batch fetch
        await getWalletBatch(phones);

        // Update UI
        phones.forEach(phone => {
            const normalizedPhone = normalizePhone(phone);
            if (!normalizedPhone) return;

            const cells = document.querySelectorAll(`[data-column="wallet"] [data-phone="${normalizedPhone}"],
                .wallet-balance[data-phone="${normalizedPhone}"],
                .wallet-loading[data-phone="${normalizedPhone}"]`);

            cells.forEach(cell => {
                const parent = cell.closest('td');
                if (parent) {
                    parent.innerHTML = renderWalletCell(normalizedPhone);
                }
            });
        });
    }

    // =====================================================
    // WALLET MODAL
    // =====================================================

    /**
     * Show wallet detail modal
     * @param {string} phone
     */
    async function showWalletModal(phone) {
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) return;

        // Create modal if not exists
        let modal = document.getElementById('wallet-detail-modal');
        if (!modal) {
            // Add styles for modal if not already in page
            if (!document.getElementById('wallet-modal-styles')) {
                const styleSheet = document.createElement('style');
                styleSheet.id = 'wallet-modal-styles';
                styleSheet.textContent = `
                    #wallet-detail-modal {
                        display: none;
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.5);
                        z-index: 10010;
                        justify-content: center;
                        align-items: center;
                    }
                    #wallet-detail-modal .modal-content {
                        background: white;
                        border-radius: 12px;
                        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                        max-width: 500px;
                        width: 90%;
                        max-height: 90vh;
                        overflow: hidden;
                    }
                    #wallet-detail-modal .modal-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 16px 20px;
                        border-bottom: 1px solid #e5e7eb;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    #wallet-detail-modal .modal-header h3 {
                        margin: 0;
                        font-size: 16px;
                        font-weight: 600;
                    }
                    #wallet-detail-modal .close-modal {
                        background: none;
                        border: none;
                        color: white;
                        font-size: 24px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                        opacity: 0.8;
                    }
                    #wallet-detail-modal .close-modal:hover {
                        opacity: 1;
                    }
                    #wallet-detail-modal .modal-body {
                        padding: 20px;
                        max-height: calc(90vh - 60px);
                        overflow-y: auto;
                    }
                `;
                document.head.appendChild(styleSheet);
            }

            modal = document.createElement('div');
            modal.id = 'wallet-detail-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="wallet-modal-title">Ví Khách Hàng</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body" id="wallet-modal-body">
                        <div style="text-align: center; padding: 20px;">
                            <i class="fas fa-spinner fa-spin fa-2x"></i>
                            <p>Đang tải...</p>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Close button
            modal.querySelector('.close-modal').addEventListener('click', () => {
                modal.style.display = 'none';
            });

            // Click outside to close
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }

        // Show modal
        modal.style.display = 'flex';

        // Track if we had any network errors
        let networkError = false;

        // Load wallet data - try customer360 first, fallback to wallet API
        let customer360 = null;
        let wallet = {};
        let customer = {};
        let virtualCredits = [];
        let recentTransactions = [];

        try {
            customer360 = await getCustomer360(normalizedPhone);
        } catch (e) {
            console.warn('[WALLET-MODAL] Customer360 error:', e.message);
            networkError = true;
        }

        if (customer360) {
            wallet = customer360.wallet || {};
            customer = customer360.customer || {};
            virtualCredits = customer360.virtual_credits || wallet.virtualCredits || [];
        } else {
            // Fallback: fetch wallet data directly (customer may not exist in customers table)
            console.log('[WALLET-MODAL] Customer360 not found, trying wallet API...');

            try {
                const walletData = await getWallet(normalizedPhone);
                if (walletData) {
                    wallet = walletData;
                    virtualCredits = walletData.virtual_credits || walletData.virtualCredits || [];
                }
            } catch (e) {
                console.warn('[WALLET-MODAL] Wallet API error:', e.message);
                networkError = true;
            }
        }

        // Always fetch transactions from dedicated API (customer360 doesn't include transactions)
        try {
            const txResponse = await fetch(`${CONFIG.API_URL}/customer/${normalizedPhone}/transactions?limit=50`);
            if (txResponse.ok) {
                const txResult = await txResponse.json();
                recentTransactions = txResult.data || [];
                console.log('[WALLET-MODAL] Fetched transactions:', recentTransactions.length);
            }
        } catch (txError) {
            console.warn('[WALLET-MODAL] Could not fetch transactions:', txError.message);
            networkError = true;
        }

        // Update header with customer name
        const customerName = customer.name || 'Khách hàng';
        document.getElementById('wallet-modal-title').textContent = `Ví Khách Hàng - ${customerName} ${normalizedPhone}`;

        // If network error and no data, show connection error
        if (networkError && !wallet.balance && !wallet.virtual_balance && recentTransactions.length === 0) {
            document.getElementById('wallet-modal-body').innerHTML = `
                <div style="text-align: center; padding: 20px; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom: 10px;"></i>
                    <p>Không thể kết nối đến server</p>
                    <p style="font-size: 12px; color: #999;">Server có thể đang khởi động lại. Vui lòng thử lại sau vài giây.</p>
                    <button onclick="WalletIntegration.showWalletModal('${normalizedPhone}')"
                        style="margin-top: 15px; padding: 8px 16px; background: #8b5cf6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-sync"></i> Thử lại
                    </button>
                </div>
            `;
            return;
        }

        // If still no wallet data, show empty state
        if (!wallet.balance && !wallet.virtual_balance && recentTransactions.length === 0) {
            document.getElementById('wallet-modal-body').innerHTML = `
                <div style="text-align: center; padding: 20px; color: #999;">
                    <i class="fas fa-wallet fa-2x" style="margin-bottom: 10px;"></i>
                    <p>Chưa có thông tin ví</p>
                    <p style="font-size: 12px;">Khách hàng chưa có giao dịch nào</p>
                </div>
            `;
            return;
        }

        // Separate transactions:
        // - "Available" only shown when totalBalance > 0, limited to recent deposits
        // - "Completed" shows all withdrawal transactions
        // Note: amount may be string from API, so parse to float

        // If balance is 0 or negative, no transactions are "available" - the money has been used
        const depositTransactions = recentTransactions.filter(tx => parseFloat(tx.amount) > 0);
        const withdrawalTransactions = recentTransactions.filter(tx => parseFloat(tx.amount) <= 0);

        // Only show deposits as "available" if there's actual balance remaining
        const availableTransactions = totalBalance > 0 ? depositTransactions : [];
        const completedTransactions = totalBalance > 0 ? withdrawalTransactions : recentTransactions;

        // Format balance display
        const totalBalance = (parseFloat(wallet.balance) || 0) + (parseFloat(wallet.virtual_balance) || 0);
        const realBalance = parseFloat(wallet.balance) || 0;
        const virtualBalance = parseFloat(wallet.virtual_balance) || 0;

        document.getElementById('wallet-modal-body').innerHTML = `
            <div style="padding: 10px;">
                <!-- Balance Summary - Compact 1 line -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 12px; padding: 15px; color: white; margin-bottom: 15px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                        <div style="font-size: 22px; font-weight: 700;">
                            ${formatCurrency(totalBalance)}
                        </div>
                        <div style="font-size: 12px; opacity: 0.9;">
                            (Thực ${formatCurrency(realBalance)} | Công Nợ Ảo ${formatCurrency(virtualBalance)})
                        </div>
                    </div>
                </div>

                <!-- Available Transactions (Positive balance - still usable) -->
                ${availableTransactions.length > 0 ? `
                    <div style="margin-bottom: 15px;">
                        <div style="font-weight: 600; margin-bottom: 8px; color: #10b981;">
                            <i class="fas fa-check-circle"></i> Giao dịch khả dụng (${availableTransactions.length})
                        </div>
                        <div style="max-height: 200px; overflow-y: auto;">
                            ${availableTransactions.map(tx => {
                                const date = new Date(tx.created_at);
                                const dateStr = date.toLocaleDateString('vi-VN');
                                const noteText = tx.note || tx.type || 'Giao dịch';
                                return `
                                    <div style="display: flex; justify-content: space-between; align-items: center;
                                        padding: 10px; background: #ecfdf5; border-radius: 8px; margin-bottom: 6px; border-left: 3px solid #10b981;">
                                        <div style="flex: 1;">
                                            <div style="font-size: 13px; font-weight: 500; color: #065f46;">${noteText}</div>
                                            <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${dateStr}</div>
                                        </div>
                                        <div style="font-weight: 700; color: #10b981; font-size: 14px;">
                                            +${formatCurrency(tx.amount)}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : '<div style="color: #999; text-align: center; padding: 15px; background: #f9fafb; border-radius: 8px; margin-bottom: 15px;">Không có giao dịch khả dụng</div>'}

                <!-- Show More Button for Completed Transactions -->
                ${completedTransactions.length > 0 ? `
                    <div>
                        <button id="wallet-show-more-btn" onclick="document.getElementById('wallet-completed-transactions').style.display = document.getElementById('wallet-completed-transactions').style.display === 'none' ? 'block' : 'none'; this.innerHTML = document.getElementById('wallet-completed-transactions').style.display === 'none' ? '<i class=\\'fas fa-chevron-down\\'></i> Xem thêm (${completedTransactions.length} giao dịch đã hoàn tất)' : '<i class=\\'fas fa-chevron-up\\'></i> Ẩn bớt'"
                            style="width: 100%; padding: 10px; background: #f3f4f6; color: #6b7280; border: 1px dashed #d1d5db; border-radius: 8px; cursor: pointer; font-size: 13px;">
                            <i class="fas fa-chevron-down"></i> Xem thêm (${completedTransactions.length} giao dịch đã hoàn tất)
                        </button>
                        <div id="wallet-completed-transactions" style="display: none; margin-top: 10px;">
                            <div style="max-height: 250px; overflow-y: auto;">
                                ${completedTransactions.map(tx => {
                                    const date = new Date(tx.created_at);
                                    const dateStr = date.toLocaleDateString('vi-VN');
                                    const noteText = tx.note || tx.type || 'Giao dịch';
                                    return `
                                        <div style="display: flex; justify-content: space-between; align-items: center;
                                            padding: 10px; background: #f9fafb; border-radius: 8px; margin-bottom: 6px; opacity: 0.7;">
                                            <div style="flex: 1;">
                                                <div style="font-size: 13px; color: #6b7280;">${noteText}</div>
                                                <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${dateStr}</div>
                                            </div>
                                            <div style="font-weight: 600; color: #ef4444; font-size: 13px;">
                                                ${formatCurrency(tx.amount)}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // =====================================================
    // POLLING & REAL-TIME
    // =====================================================

    /**
     * Start polling for wallet updates
     */
    function startPolling() {
        if (pollingInterval) return;

        pollingInterval = setInterval(async () => {
            if (watchedPhones.size === 0) return;

            const phones = Array.from(watchedPhones);

            // Invalidate cache for watched phones
            phones.forEach(phone => walletCache.delete(phone));

            // Batch refresh
            await refreshWalletBatch(phones);
        }, CONFIG.POLLING_INTERVAL);

        console.log('[WALLET] Polling started');
    }

    /**
     * Stop polling
     */
    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            console.log('[WALLET] Polling stopped');
        }
    }

    /**
     * Add phones to watch list for real-time updates
     * @param {Array<string>} phones
     */
    function watchPhones(phones) {
        phones.forEach(phone => {
            const normalized = normalizePhone(phone);
            if (normalized) watchedPhones.add(normalized);
        });
    }

    /**
     * Clear watch list
     */
    function clearWatchList() {
        watchedPhones.clear();
    }

    // =====================================================
    // COD INTEGRATION
    // =====================================================

    /**
     * Calculate COD after wallet deduction
     * @param {number} originalCOD - Original COD amount
     * @param {number} walletBalance - Available wallet balance
     * @returns {Object} { newCOD, walletUsed, remaining }
     */
    function calculateWalletDeduction(originalCOD, walletBalance) {
        if (!originalCOD || originalCOD <= 0) {
            return { newCOD: 0, walletUsed: 0, remaining: walletBalance };
        }

        if (!walletBalance || walletBalance <= 0) {
            return { newCOD: originalCOD, walletUsed: 0, remaining: 0 };
        }

        const walletUsed = Math.min(walletBalance, originalCOD);
        const newCOD = originalCOD - walletUsed;
        const remaining = walletBalance - walletUsed;

        return { newCOD, walletUsed, remaining };
    }

    /**
     * Get wallet balance for COD calculation
     * @param {string} phone
     * @returns {Promise<number>} Total available balance
     */
    async function getBalanceForCOD(phone) {
        const wallet = await getWallet(phone);
        if (!wallet) return 0;
        return (wallet.balance || 0) + (wallet.virtual_balance || 0);
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        // Configuration
        CONFIG,

        // API functions
        getWallet,
        getWalletBatch,
        withdrawWallet,
        getCustomer360,

        // UI functions
        renderWalletCell,
        refreshWalletDisplay,
        refreshWalletBatch,
        showWalletModal,

        // Polling
        startPolling,
        stopPolling,
        watchPhones,
        clearWatchList,

        // COD integration
        calculateWalletDeduction,
        getBalanceForCOD,

        // Utility
        normalizePhone,
        formatCurrency,
        formatCurrencyShort,

        // Cache access (for debugging)
        getCache: () => walletCache
    };
})();

// Export for global access
window.WalletIntegration = WalletIntegration;

console.log('[WALLET] WalletIntegration module loaded');
