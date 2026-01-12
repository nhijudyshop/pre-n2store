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
        API_URL: 'https://n2store.onrender.com/api',
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
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
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
            const response = await fetch(`${CONFIG.API_URL}/wallet/${normalizedPhone}`);
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
                const response = await fetch(`${CONFIG.API_URL}/wallet/batch-summary`, {
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

        const response = await fetch(`${CONFIG.API_URL}/wallet/${normalizedPhone}/withdraw`, {
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
                        z-index: 10000;
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
                        <h3 id="wallet-modal-title">Ví Tiền</h3>
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
        document.getElementById('wallet-modal-title').textContent = `Ví Tiền - ${normalizedPhone}`;

        // Load wallet data
        const customer360 = await getCustomer360(normalizedPhone);

        if (!customer360) {
            document.getElementById('wallet-modal-body').innerHTML = `
                <div style="text-align: center; padding: 20px; color: #999;">
                    <i class="fas fa-user-slash fa-2x" style="margin-bottom: 10px;"></i>
                    <p>Không tìm thấy thông tin khách hàng</p>
                </div>
            `;
            return;
        }

        const wallet = customer360.wallet || {};
        const customer = customer360.customer || {};
        const virtualCredits = customer360.virtual_credits || [];
        const recentTransactions = customer360.transactions || [];

        document.getElementById('wallet-modal-body').innerHTML = `
            <div style="padding: 10px;">
                <!-- Customer Info -->
                <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                    <div style="font-weight: 600;">${customer.name || 'Khách hàng'}</div>
                    <div style="color: #666; font-size: 13px;">${normalizedPhone}</div>
                    ${customer.tier ? `<span class="badge" style="background: #8b5cf6; color: white; margin-top: 5px;">${customer.tier}</span>` : ''}
                </div>

                <!-- Balance Summary -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 12px; padding: 20px; color: white; margin-bottom: 15px;">
                    <div style="font-size: 13px; opacity: 0.8; margin-bottom: 5px;">Tổng số dư khả dụng</div>
                    <div style="font-size: 28px; font-weight: 700;">
                        ${formatCurrency((wallet.balance || 0) + (wallet.virtual_balance || 0))}
                    </div>
                    <div style="display: flex; gap: 20px; margin-top: 15px; font-size: 13px;">
                        <div>
                            <div style="opacity: 0.8;">Số dư thực</div>
                            <div style="font-weight: 600;">${formatCurrency(wallet.balance || 0)}</div>
                        </div>
                        <div>
                            <div style="opacity: 0.8;">Công nợ ảo</div>
                            <div style="font-weight: 600;">${formatCurrency(wallet.virtual_balance || 0)}</div>
                        </div>
                    </div>
                </div>

                <!-- Active Virtual Credits -->
                ${virtualCredits.length > 0 ? `
                    <div style="margin-bottom: 15px;">
                        <div style="font-weight: 600; margin-bottom: 8px;">Công nợ ảo đang hoạt động</div>
                        ${virtualCredits.map(vc => {
                            const daysLeft = Math.ceil((new Date(vc.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
                            return `
                                <div style="display: flex; justify-content: space-between; align-items: center;
                                    padding: 8px 12px; background: #fef3c7; border-radius: 8px; margin-bottom: 5px;">
                                    <div>
                                        <span style="font-weight: 600;">${formatCurrency(vc.remaining_amount)}</span>
                                        <span style="color: #92400e; font-size: 12px; margin-left: 8px;">
                                            Còn ${daysLeft} ngày
                                        </span>
                                    </div>
                                    <span style="color: #92400e; font-size: 11px;">${vc.source_type}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}

                <!-- Recent Transactions -->
                ${recentTransactions.length > 0 ? `
                    <div>
                        <div style="font-weight: 600; margin-bottom: 8px;">Giao dịch gần đây</div>
                        <div style="max-height: 200px; overflow-y: auto;">
                            ${recentTransactions.slice(0, 10).map(tx => {
                                const isPositive = tx.amount > 0;
                                const date = new Date(tx.created_at);
                                return `
                                    <div style="display: flex; justify-content: space-between; align-items: center;
                                        padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                                        <div>
                                            <div style="font-size: 13px;">${tx.note || tx.type}</div>
                                            <div style="font-size: 11px; color: #999;">
                                                ${date.toLocaleDateString('vi-VN')} ${date.toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'})}
                                            </div>
                                        </div>
                                        <div style="font-weight: 600; color: ${isPositive ? '#10b981' : '#ef4444'};">
                                            ${isPositive ? '+' : ''}${formatCurrency(tx.amount)}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : '<div style="color: #999; text-align: center; padding: 15px;">Chưa có giao dịch</div>'}
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
