// customer-hub/js/modules/customer-profile.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';
import { WalletPanelModule } from './wallet-panel.js';
import { logAction } from '../../../shared/js/audit-logger.esm.js';

export class CustomerProfileModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
        this.walletPanelModule = null;
        this.customerData = null;

        // Expose showOrderDetailPopup to window for onclick handlers
        window.showOrderDetailPopup = this._showOrderDetailPopup.bind(this);
    }

    initUI() {
        this.container.innerHTML = `
            <!-- Modal Header -->
            <header class="shrink-0 px-6 py-3 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <h1 id="modal-customer-name" class="text-lg font-bold text-slate-900 dark:text-white">Customer Profile: <span id="modal-name-value">Loading...</span></h1>
                        <span id="modal-customer-id" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg">ID: #000000</span>
                        <span class="text-slate-400">|</span>
                        <span id="modal-phone-display" class="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                            <span class="material-symbols-outlined text-base">call</span>
                            <span id="modal-phone-value"></span>
                        </span>
                        <span class="text-slate-400">|</span>
                        <span id="modal-address-display" class="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                            <span class="material-symbols-outlined text-base">location_on</span>
                            <span id="modal-address-value">Chưa có địa chỉ</span>
                        </span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="audit-log-btn" class="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                            <span class="material-symbols-outlined text-lg">history</span>
                            Audit Log
                        </button>
                        <button id="reset-password-btn" class="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                            <span class="material-symbols-outlined text-lg">lock_reset</span>
                            Reset Password
                        </button>
                        <button onclick="window.closeCustomerModal()" class="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 rounded-lg transition-colors" title="Đóng">
                            <span class="material-symbols-outlined text-2xl">close</span>
                        </button>
                    </div>
                </div>
            </header>

            <!-- Modal Body - Scrollable -->
            <div class="flex-1 overflow-y-auto p-6 bg-background-light dark:bg-background-dark" style="height: calc(100% - 60px);">
                <!-- Loading State -->
                <div id="modal-loader" class="flex flex-col items-center justify-center py-20">
                    <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <span class="material-symbols-outlined text-primary text-3xl animate-spin">progress_activity</span>
                    </div>
                    <p class="text-slate-500 dark:text-slate-400 font-medium">Đang tải thông tin khách hàng...</p>
                </div>

                <!-- Content - Hidden until loaded -->
                <div id="modal-content-loaded" class="hidden" style="height: 100%;">
                    <!-- 3 Columns Layout - 20% / 60% / 20% -->
                    <div style="display: grid; grid-template-columns: 1fr 3fr 1fr; gap: 16px; height: 100%;">
                        <!-- Column 1: Wallet Summary + Internal Notes (20%) -->
                        <div style="display: flex; flex-direction: column; gap: 16px; height: 100%; min-width: 0;">
                            <!-- Wallet Summary Card -->
                            <div id="customer-wallet-panel" class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm">
                                <!-- Will be rendered by WalletPanelModule -->
                            </div>
                            <!-- Internal Notes Card -->
                            <div id="internal-notes-section" class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden" style="flex: 1; display: flex; flex-direction: column;">
                                <!-- Will be rendered dynamically -->
                            </div>
                        </div>

                        <!-- Column 2: Recent Tickets/Activities (60%) -->
                        <div id="recent-activities-card" class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden" style="display: flex; flex-direction: column; height: 100%; min-width: 0;">
                            <!-- Will be rendered dynamically -->
                        </div>

                        <!-- Column 3: RFM Analysis (20%) -->
                        <div id="rfm-analysis-card" class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden" style="height: 100%; min-width: 0;">
                            <!-- Will be rendered dynamically -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.loader = this.container.querySelector('#modal-loader');
        this.contentLoaded = this.container.querySelector('#modal-content-loaded');
    }

    async render(phone) {
        this.customerPhone = phone;
        this.initUI();

        this.loader.classList.remove('hidden');
        this.contentLoaded.classList.add('hidden');

        try {
            const data = await apiService.getCustomer360(phone);
            // apiService.getCustomer360 returns result.data directly (already unwrapped)
            if (data && data.customer) {
                this.customerData = data;

                // Render all sections
                this._renderHeader(data.customer);
                this._renderRFMCard(data.customer);
                this._renderTicketsCard(data.recentTickets || [], data.recentActivities || []);
                this._renderNotesSection(data.notes || []);

                // Initialize wallet panel module
                this.walletPanelModule = new WalletPanelModule('customer-wallet-panel', this.permissionHelper);
                this.walletPanelModule.render(phone);

                this.loader.classList.add('hidden');
                this.contentLoaded.classList.remove('hidden');
            } else {
                // V2 API returned no data — try TPOS fallback
                await this._tryTPOSFallback(phone);
            }
        } catch (error) {
            // If API error, try TPOS fallback before showing error
            console.warn('[CustomerProfile] V2 API failed, trying TPOS fallback:', error.message);
            const fallbackOk = await this._tryTPOSFallback(phone);
            if (!fallbackOk) {
                this._showError(`Lỗi khi tải thông tin: ${error.message}`);
                console.error('Lỗi tải hồ sơ khách hàng:', error);
            }
        }
    }

    /**
     * Fallback: lookup customer on TPOS when V2 API doesn't have the customer
     * This happens for newly created customers or customers only existing on TPOS
     */
    async _tryTPOSFallback(phone) {
        if (!window.fetchTPOSCustomer) {
            this._showError(`Không tìm thấy khách hàng với SĐT: ${phone}`);
            return false;
        }

        try {
            console.log('[CustomerProfile] Trying TPOS fallback for:', phone);
            const result = await window.fetchTPOSCustomer(phone);

            if (result.success && result.count > 0) {
                const tposCustomer = result.customers[0];
                console.log('[CustomerProfile] TPOS fallback found:', tposCustomer.name, 'ID:', tposCustomer.id);

                // Build minimal customer data from TPOS
                const data = {
                    customer: {
                        id: tposCustomer.id,
                        name: tposCustomer.name,
                        phone: tposCustomer.phone || phone,
                        address: tposCustomer.address || '',
                        statusText: tposCustomer.statusText || 'Bình thường',
                        source: 'TPOS'
                    },
                    recentTickets: [],
                    notes: []
                };

                this.customerData = data;

                // Render with TPOS data (basic profile, no tickets/RFM)
                this._renderHeader(data.customer);
                this._renderRFMCard(data.customer);
                this._renderTicketsCard([], []);
                this._renderNotesSection([]);

                // Initialize wallet panel module
                this.walletPanelModule = new WalletPanelModule('customer-wallet-panel', this.permissionHelper);
                this.walletPanelModule.render(phone);

                this.loader.classList.add('hidden');
                this.contentLoaded.classList.remove('hidden');
                return true;
            } else {
                this._showError(`Không tìm thấy khách hàng với SĐT: ${phone}`);
                return false;
            }
        } catch (tposError) {
            console.error('[CustomerProfile] TPOS fallback also failed:', tposError);
            this._showError(`Không tìm thấy khách hàng với SĐT: ${phone}`);
            return false;
        }
    }

    _showError(message) {
        this.loader.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20">
                <div class="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined text-danger text-3xl">error</span>
                </div>
                <p class="text-danger font-medium mb-2">Không thể tải hồ sơ</p>
                <p class="text-sm text-slate-500 dark:text-slate-400">${message}</p>
                <button onclick="window.closeCustomerModal()" class="mt-6 px-5 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-sm font-medium transition-colors">
                    Đóng
                </button>
            </div>
        `;
    }

    _renderHeader(customer) {
        const nameEl = this.container.querySelector('#modal-name-value');
        const idEl = this.container.querySelector('#modal-customer-id');
        const phoneEl = this.container.querySelector('#modal-phone-value');
        const addressEl = this.container.querySelector('#modal-address-value');

        nameEl.textContent = customer.name || 'Unknown';
        idEl.textContent = `ID: #${customer.id || customer.phone?.replace(/\D/g, '').slice(-6) || '000000'}`;
        phoneEl.textContent = customer.phone;
        addressEl.textContent = customer.address || 'Chưa có địa chỉ';

        // Render aliases section if customer has aliases
        this._renderAliasesSection(customer);
    }

    /**
     * Render aliases (reference names) section
     * @param {Object} customer - Customer data
     */
    _renderAliasesSection(customer) {
        // Get or create aliases container
        let aliasesContainer = this.container.querySelector('#customer-aliases-section');

        // Get aliases array
        let aliases = customer.aliases || [];
        if (typeof aliases === 'string') {
            try {
                aliases = JSON.parse(aliases);
            } catch (e) {
                aliases = [];
            }
        }
        if (!Array.isArray(aliases)) {
            aliases = [];
        }

        // Create aliases section if it doesn't exist
        if (!aliasesContainer) {
            const header = this.container.querySelector('header');
            if (!header) return;

            aliasesContainer = document.createElement('div');
            aliasesContainer.id = 'customer-aliases-section';
            aliasesContainer.className = 'px-6 py-2 bg-slate-50 dark:bg-slate-800 border-b border-border-light dark:border-border-dark flex items-center gap-3 flex-wrap';
            header.after(aliasesContainer);
        }

        // Build aliases HTML
        const aliasesHtml = aliases.map((alias, index) => {
            const isPrimary = alias === customer.name;
            return `
                <span class="alias-tag ${isPrimary ? 'primary' : ''}"
                      title="${isPrimary ? 'Tên chính' : 'Tên tham khảo'}">
                    ${alias}
                    ${!isPrimary ? `
                        <button class="remove-alias-btn" onclick="window.removeCustomerAlias('${customer.phone}', '${alias.replace(/'/g, "\\'")}')" title="Xóa tên này">
                            <span class="material-symbols-outlined" style="font-size: 14px;">close</span>
                        </button>
                    ` : ''}
                </span>
            `;
        }).join('');

        aliasesContainer.innerHTML = `
            <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">Tên tham khảo:</span>
            ${aliasesHtml || '<span class="text-xs text-slate-400 italic">Chưa có</span>'}
            <button id="add-alias-btn" class="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-slate-300 dark:border-slate-600 rounded text-xs text-slate-500 hover:text-primary hover:border-primary transition-colors"
                    onclick="window.showAddAliasDialog('${customer.phone}')">
                <span class="material-symbols-outlined" style="font-size: 14px;">add</span>
                Thêm
            </button>
        `;
    }

    _renderCustomerInfoCard(customer) {
        const container = this.container.querySelector('#customer-info-card');
        const initials = this._getInitials(customer.name);
        const avatarColor = this._getAvatarColor(customer.name);
        const statusBadge = this._getStatusBadge(customer.status);
        const tierBadge = this._getTierBadge(customer.tier);

        container.innerHTML = `
            <!-- Header with Avatar -->
            <div class="p-6 pb-0 flex items-start justify-between">
                <div class="w-16 h-16 rounded-full ${avatarColor.bg} flex items-center justify-center ${avatarColor.text} text-2xl font-bold border-2 border-white dark:border-slate-600 shadow-soft">
                    ${initials}
                </div>
                <div class="flex gap-2">
                    ${statusBadge}
                    ${tierBadge}
                </div>
            </div>

            <!-- Info Content -->
            <div class="p-6 flex flex-col gap-5">
                <div class="space-y-4">
                    <!-- Email -->
                    <div class="group">
                        <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Email</label>
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-slate-900 dark:text-white select-all">${customer.email || 'Chưa có email'}</span>
                            ${customer.email ? `
                                <button class="opacity-0 group-hover:opacity-100 text-primary transition-opacity" onclick="navigator.clipboard.writeText('${customer.email}')">
                                    <span class="material-symbols-outlined text-lg">content_copy</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Address -->
                    <div class="group">
                        <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Địa chỉ</label>
                        <span class="text-sm font-medium text-slate-900 dark:text-white block">${customer.address || 'Chưa có địa chỉ'}</span>
                    </div>

                    <!-- Tags -->
                    <div>
                        <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Nhãn</label>
                        <div class="flex flex-wrap gap-2">
                            ${this._renderTags(customer.tags)}
                            <button class="w-7 h-7 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:text-primary hover:border-primary transition-colors">
                                <span class="material-symbols-outlined text-base">add</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Action Buttons -->
                ${this.permissionHelper.hasPermission('customer-hub', 'editCustomer') || this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                    <div class="mt-auto grid grid-cols-2 gap-3 pt-5 border-t border-border-light dark:border-border-dark">
                        ${this.permissionHelper.hasPermission('customer-hub', 'editCustomer') ? `
                            <button id="edit-customer-btn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                                <span class="material-symbols-outlined text-lg">edit</span>
                                Sửa
                            </button>
                        ` : ''}
                        ${this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                            <button id="add-note-shortcut-btn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                                <span class="material-symbols-outlined text-lg">note_add</span>
                                Ghi chú
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    _renderRFMCard(customer) {
        const container = this.container.querySelector('#rfm-analysis-card');
        const rfm = customer.rfm || {};
        const score = rfm.score || 0;
        const recency = rfm.recency_days || 0;
        const frequency = rfm.frequency || 0;
        const monetary = rfm.monetary || 0;
        const yoyChange = rfm.yoy_change || 0;

        // Calculate score percentage for the circular chart
        const scorePercent = (score / 5) * 100;
        const circumference = 2 * Math.PI * 40;
        const strokeDashoffset = circumference - (scorePercent / 100) * circumference;

        container.innerHTML = `
            <div class="p-5 h-full overflow-y-auto">
                <!-- Header -->
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-purple-500">analytics</span>
                        <h3 class="text-base font-bold text-slate-900 dark:text-white">Phân tích RFM</h3>
                    </div>
                    ${rfm.percentile ? `<span class="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold rounded">TOP ${rfm.percentile}%</span>` : ''}
                </div>

                <!-- Overall Score -->
                <div class="flex items-center gap-4 mb-5 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                    <div class="relative" style="width: 80px; height: 80px;">
                        <svg style="width: 80px; height: 80px; transform: rotate(-90deg);" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" stroke-width="8"></circle>
                            <circle cx="50" cy="50" r="40" fill="none" stroke="#8b5cf6" stroke-width="8"
                                stroke-dasharray="${circumference}"
                                stroke-dashoffset="${strokeDashoffset}"
                                stroke-linecap="round"></circle>
                        </svg>
                        <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span class="text-xl font-bold text-slate-900 dark:text-white">${score.toFixed(1)}</span>
                            <span class="text-xs text-slate-400">/5</span>
                        </div>
                    </div>
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase mb-1">Điểm tổng</p>
                        <p class="text-sm text-slate-600 dark:text-slate-300">Đánh giá giá trị khách hàng</p>
                    </div>
                </div>

                <!-- RFM Metrics -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div class="flex items-center gap-1 text-slate-500 mb-1">
                            <span class="material-symbols-outlined" style="font-size: 16px;">schedule</span>
                            <span class="text-xs font-bold uppercase">Gần đây</span>
                        </div>
                        <p class="text-lg font-bold text-slate-900 dark:text-white">${recency} <span class="text-sm font-normal text-slate-400">ngày</span></p>
                    </div>
                    <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div class="flex items-center gap-1 text-slate-500 mb-1">
                            <span class="material-symbols-outlined" style="font-size: 16px;">repeat</span>
                            <span class="text-xs font-bold uppercase">Tần suất</span>
                        </div>
                        <p class="text-lg font-bold text-slate-900 dark:text-white">${frequency} <span class="text-sm font-normal text-slate-400">đơn</span></p>
                    </div>
                </div>

                <!-- Monetary -->
                <div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800/30 mb-4">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-1 text-emerald-600">
                            <span class="material-symbols-outlined" style="font-size: 16px;">payments</span>
                            <span class="text-xs font-bold uppercase">Giá trị (LTV)</span>
                        </div>
                        ${yoyChange !== 0 ? `<span class="px-2 py-0.5 rounded text-xs font-bold ${yoyChange >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">${yoyChange >= 0 ? '+' : ''}${yoyChange}%</span>` : ''}
                    </div>
                    <p class="text-xl font-bold text-emerald-600">${this.formatCurrency(monetary)}</p>
                </div>

                <!-- Spending Trend -->
                <div class="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <p class="text-xs font-semibold text-slate-500 uppercase mb-3">Xu hướng chi tiêu</p>
                    <div style="height: 60px; display: flex; align-items: flex-end; gap: 4px;">
                        ${this._generateSpendingBars()}
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px;" class="text-xs text-slate-400">
                        <span>T1</span><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span>
                    </div>
                </div>
            </div>
        `;
    }

    _generateSpendingBars() {
        const heights = [40, 65, 45, 80, 55, 90];
        return heights.map((h, i) => `
            <div style="flex: 1; height: ${h}%; background-color: ${i === heights.length - 1 ? '#8b5cf6' : '#c4b5fd'}; border-radius: 4px 4px 0 0;"></div>
        `).join('');
    }

    _renderTicketsCard(tickets, activities = []) {
        const container = this.container.querySelector('#recent-activities-card');

        // Ticket type translations
        const typeMap = {
            'BOOM': 'Boom Hàng',
            'FIX_COD': 'Sửa COD',
            'RETURN_CLIENT': 'Khách Gửi',
            'RETURN_SHIPPER': 'Thu Về',
            'SALE_ORDER': 'Phiếu Bán Hàng',
            'RETURN_ORDER': 'Phiếu Trả Hàng',
            'OTHER': 'Khác'
        };

        // Status translations and colors
        const statusMap = {
            'PENDING': { label: 'Chờ xử lý', color: 'bg-amber-100 text-amber-700' },
            'PROCESSING': { label: 'Đang xử lý', color: 'bg-blue-100 text-blue-700' },
            'WAITING_GOODS': { label: 'Chờ hàng về', color: 'bg-purple-100 text-purple-700' },
            'PENDING_GOODS': { label: 'Chờ hàng về', color: 'bg-purple-100 text-purple-700' },
            'COMPLETED': { label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
            'CANCELLED': { label: 'Đã hủy', color: 'bg-slate-100 text-slate-500' }
        };

        // Activity type icon/color mapping
        const activityStyleMap = {
            'WALLET_DEPOSIT': { icon: 'savings', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            'WALLET_WITHDRAW': { icon: 'payments', color: 'text-red-600', bg: 'bg-red-50' },
            'WALLET_REFUND': { icon: 'currency_exchange', color: 'text-blue-600', bg: 'bg-blue-50' },
            'WALLET_VIRTUAL_CREDIT': { icon: 'card_giftcard', color: 'text-purple-600', bg: 'bg-purple-50' },
            'ORDER_CANCELLED': { icon: 'cancel', color: 'text-red-500', bg: 'bg-red-50' },
            'ORDER_CREATED': { icon: 'shopping_cart', color: 'text-blue-500', bg: 'bg-blue-50' },
            'ORDER_CANCEL_REFUND': { icon: 'currency_exchange', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        };
        const defaultActivityStyle = { icon: 'info', color: 'text-slate-500', bg: 'bg-slate-50' };

        const hasTickets = tickets && tickets.length > 0;
        const hasActivities = activities && activities.length > 0;
        const totalCount = (tickets?.length || 0) + (activities?.length || 0);

        let ticketsHtml = '';
        if (hasTickets) {
            ticketsHtml = `
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Mã ĐH</th>
                            <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Loại</th>
                            <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Ghi chú</th>
                            <th class="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Hoàn</th>
                            <th class="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase">Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${tickets.slice(0, 10).map(ticket => {
                            const orderIdDisplay = ticket.order_id ? ticket.order_id.replace(/^NJD\/\d+\//, '') : '-';
                            const rawId = ticket.tpos_order_id;
                            const numericId = rawId ? parseInt(rawId, 10) : 0;
                            const tposOrderId = (numericId > 0) ? numericId : null;
                            const type = typeMap[ticket.type] || ticket.type;
                            const note = ticket.internal_note && ticket.internal_note.trim()
                                ? `<span class="text-slate-700 dark:text-slate-300">${ticket.internal_note}</span>`
                                : '<span class="text-slate-400">-</span>';
                            const refund = ticket.refund_amount && ticket.refund_amount > 0 ? this._formatCurrencyShort(ticket.refund_amount) : '';
                            const statusInfo = statusMap[ticket.status] || { label: ticket.status, color: 'bg-slate-100 text-slate-500' };

                            return `
                                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td class="px-3 py-2 font-medium">
                                        ${tposOrderId ?
                                            `<a href="#" onclick="showOrderDetailPopup('${tposOrderId}'); return false;"
                                                class="text-blue-600 hover:text-blue-800 hover:underline">${orderIdDisplay}</a>`
                                            : `<span class="text-slate-600">${orderIdDisplay}</span>`}
                                    </td>
                                    <td class="px-3 py-2">
                                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${this._getTypeColor(ticket.type)}">${type}</span>
                                    </td>
                                    <td class="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[400px]">
                                        <div class="text-xs truncate">${note}</div>
                                    </td>
                                    <td class="px-3 py-2 text-right font-medium text-emerald-600">${refund}</td>
                                    <td class="px-3 py-2 text-center">
                                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}">${statusInfo.label}</span>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }

        // Render wallet activities
        let activitiesHtml = '';
        if (hasActivities) {
            activitiesHtml = `
                <div class="px-4 py-2 border-t border-border-light dark:border-border-dark">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="material-symbols-outlined text-indigo-500" style="font-size: 18px;">account_balance_wallet</span>
                        <span class="text-xs font-semibold text-slate-500 uppercase">Hoạt động ví</span>
                    </div>
                    <div class="space-y-2">
                        ${activities.slice(0, 10).map(act => {
                            const style = activityStyleMap[act.activity_type] || defaultActivityStyle;
                            const icon = act.icon || style.icon;
                            const date = act.created_at ? new Date(act.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                            return `
                                <div class="flex items-start gap-3 p-2 rounded-lg ${style.bg} dark:bg-slate-800/50">
                                    <span class="material-symbols-outlined ${style.color}" style="font-size: 20px; margin-top: 2px;">${icon}</span>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">${act.title || act.activity_type}</p>
                                        ${act.description ? `<p class="text-xs text-slate-500 truncate">${act.description}</p>` : ''}
                                        <p class="text-xs text-slate-400">${date}</p>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // Empty state only when both are empty
        let emptyHtml = '';
        if (!hasTickets && !hasActivities) {
            emptyHtml = `
                <div class="flex flex-col items-center justify-center py-10 text-slate-400">
                    <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 12px;">confirmation_number</span>
                    <p class="text-sm font-medium">Chưa có hoạt động</p>
                </div>
            `;
        }

        container.innerHTML = `
            <!-- Header -->
            <div class="px-4 py-3 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-purple-500">confirmation_number</span>
                    <h3 class="text-base font-bold text-slate-900 dark:text-white">Hoạt động gần đây</h3>
                </div>
                <span class="text-xs text-slate-400">${totalCount} hoạt động</span>
            </div>

            <!-- Content -->
            <div class="overflow-y-auto" style="flex: 1;">
                ${emptyHtml}
                ${ticketsHtml}
                ${activitiesHtml}
            </div>
        `;
    }

    _formatProducts(products) {
        if (!products) return '<span class="text-slate-400">-</span>';

        let productList = [];
        if (typeof products === 'string') {
            try {
                productList = JSON.parse(products);
            } catch {
                return `<div class="text-xs truncate">${products}</div>`;
            }
        } else if (Array.isArray(products)) {
            productList = products;
        }

        if (productList.length === 0) return '<span class="text-slate-400">-</span>';

        return productList.map(p => {
            const qty = p.quantity || p.qty || 1;
            const name = p.name || p.product_name || p.sku || '';
            const variant = p.variant || p.option || '';
            return `<div class="text-xs truncate">${qty}x ${name}${variant ? ` (${variant})` : ''}</div>`;
        }).join('');
    }

    _formatNoteAndProducts(internalNote, products) {
        let parts = [];

        // Add internal note if exists
        if (internalNote && internalNote.trim()) {
            parts.push(`<div class="text-xs text-slate-700 dark:text-slate-300 font-medium">${internalNote}</div>`);
        }

        // Add products if exists
        if (products) {
            let productList = [];
            if (typeof products === 'string') {
                try {
                    productList = JSON.parse(products);
                } catch {
                    // If not JSON, treat as plain text
                    if (products.trim()) {
                        parts.push(`<div class="text-xs text-slate-500">${products}</div>`);
                    }
                }
            } else if (Array.isArray(products)) {
                productList = products;
            }

            if (productList.length > 0) {
                const productLines = productList.map(p => {
                    const qty = p.quantity || p.qty || 1;
                    const name = p.name || p.product_name || p.sku || '';
                    const variant = p.variant || p.option || '';
                    return `${qty}x ${name}${variant ? ` (${variant})` : ''}`;
                }).join(', ');
                parts.push(`<div class="text-xs text-slate-500 truncate">${productLines}</div>`);
            }
        }

        if (parts.length === 0) {
            return '<span class="text-slate-400">-</span>';
        }

        return parts.join('');
    }

    _getTypeColor(type) {
        const colors = {
            'BOOM': 'bg-red-100 text-red-700',
            'FIX_COD': 'bg-blue-100 text-blue-700',
            'RETURN_CLIENT': 'bg-purple-100 text-purple-700',
            'RETURN_SHIPPER': 'bg-amber-100 text-amber-700',
            'SALE_ORDER': 'bg-green-100 text-green-700',
            'RETURN_ORDER': 'bg-orange-100 text-orange-700',
            'OTHER': 'bg-slate-100 text-slate-600'
        };
        return colors[type] || 'bg-slate-100 text-slate-600';
    }

    _formatCurrencyShort(amount) {
        if (!amount || amount === 0) return '-';
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(1).replace('.0', '') + 'M';
        } else if (amount >= 1000) {
            return Math.round(amount / 1000) + 'K';
        }
        return amount.toLocaleString('vi-VN');
    }

    /**
     * Show order detail popup (like issue-tracking)
     * Uses Cloudflare Worker proxy to fetch TPOS order data
     * @param {string} orderIdOrNumber - Either TPOS ID (numeric like "412249") or order number (like "45194" or "NJD/2026/45194")
     */
    async _showOrderDetailPopup(orderIdOrNumber) {
        if (!orderIdOrNumber) {
            alert('Không có ID đơn hàng');
            return;
        }

        // Get token for selected company only (no fallback to other tokens)
        let token = null;
        try {
            if (window.tokenManager) {
                token = await window.tokenManager.getToken();
            }
        } catch (e) {
            console.error('[OrderDetail] Token error:', e);
        }
        if (!token) {
            alert('Không thể tải chi tiết đơn hàng. Vui lòng đăng nhập TPOS trước.');
            return;
        }

        // Must be numeric ID to fetch order details
        if (!/^\d+$/.test(orderIdOrNumber)) {
            alert('Không thể xem chi tiết. Ticket này chưa có ID đơn hàng TPOS.');
            return;
        }

        const tposId = orderIdOrNumber;

        try {
            // Show loading indicator
            const loadingPopup = document.createElement('div');
            loadingPopup.id = 'order-detail-loading';
            loadingPopup.innerHTML = `
                <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
                    <div style="background: white; padding: 24px; border-radius: 12px; text-align: center;">
                        <div style="width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px;"></div>
                        <p style="color: #374151; font-size: 14px;">Đang tải thông tin đơn hàng...</p>
                    </div>
                </div>
                <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
            `;
            document.body.appendChild(loadingPopup);

            // Fetch order details by ID - exact same format as working fetch
            const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
            const expand = 'Partner,User,Carrier,OrderLines($expand=Product,ProductUOM)';
            const url = `${PROXY_URL}/api/odata/FastSaleOrder(${tposId})?$expand=${encodeURIComponent(expand)}`;

            console.log('[OrderDetail] Fetching:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            loadingPopup.remove();

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[OrderDetail] API error:', response.status, errorText);
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            console.log('[OrderDetail] Loaded, products:', data.OrderLines?.length || 0);

            if (!data || !data.Id) {
                alert('Không tìm thấy đơn hàng');
                return;
            }

            // Map to display format
            const details = {
                id: data.Id,
                tposCode: data.Number,
                customer: data.PartnerDisplayName || data.Ship_Receiver_Name || 'N/A',
                phone: data.Phone,
                address: data.FullAddress || data.Address || '',
                cod: data.CashOnDelivery || 0,
                amountTotal: data.AmountTotal || 0,
                decreaseAmount: data.DecreaseAmount || 0,
                deliveryPrice: data.DeliveryPrice || 0,
                paymentAmount: data.PaymentAmount || 0,
                products: (data.OrderLines || []).map(line => ({
                    code: line.ProductBarcode || line.ProductDefaultCode || '',
                    name: line.ProductName || '',
                    quantity: line.ProductUOMQty || 1,
                    price: line.PriceUnit || 0,
                    note: line.Note || ''
                }))
            };

            // Format currency
            const formatCurrency = (val) => {
                if (!val || val === 0) return '0 đ';
                return new Intl.NumberFormat('vi-VN').format(val) + ' đ';
            };

            // Products table HTML
            const productsHtml = details.products.map(p => {
                const noteDisplay = p.note ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">(${p.note})</div>` : '';
                return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 8px;">
                            <div><strong>[${p.code || 'N/A'}]</strong> ${p.name || ''}</div>
                            ${noteDisplay}
                        </td>
                        <td style="padding:6px 8px;text-align:center;">${p.quantity || 1}</td>
                        <td style="padding:6px 8px;text-align:right;">${formatCurrency(p.price)}</td>
                    </tr>
                `;
            }).join('');

            const totalQty = details.products.reduce((sum, p) => sum + (p.quantity || 1), 0);
            const finalTotal = (details.amountTotal || 0) - (details.decreaseAmount || 0) + (details.deliveryPrice || 0);

            // Create popup
            const popup = document.createElement('div');
            popup.id = 'order-detail-popup';
            popup.innerHTML = `
                <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;">
                    <div style="background: white; border-radius: 16px; max-width: 600px; width: 100%; max-height: 90vh; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Chi tiết đơn hàng</h3>
                                <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.8;">Mã ĐH: ${details.tposCode || orderId}</p>
                            </div>
                            <button onclick="document.getElementById('order-detail-popup').remove()"
                                    style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center;">
                                ✕
                            </button>
                        </div>

                        <!-- Content -->
                        <div style="padding: 20px; overflow-y: auto; max-height: calc(90vh - 120px);">
                            <!-- Customer Info -->
                            <div style="background: #f8fafc; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;">
                                <p style="margin: 0 0 4px; font-size: 13px;"><strong>Khách:</strong> ${details.customer || 'N/A'} &nbsp;|&nbsp; <strong>Mã ĐH:</strong> ${details.tposCode || orderId}</p>
                                <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Địa chỉ:</strong> ${details.address || 'Chưa có địa chỉ'}</p>
                            </div>

                            <!-- Products Label -->
                            <p style="margin: 0 0 8px; font-weight: 600; font-size: 14px;">Sản phẩm:</p>

                            <!-- Products Table -->
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
                                <thead style="background: #f1f5f9;">
                                    <tr>
                                        <th style="padding: 8px; text-align: left;">Sản phẩm</th>
                                        <th style="padding: 8px; text-align: center; width: 60px;">Số lượng</th>
                                        <th style="padding: 8px; text-align: right; width: 100px;">Đơn giá</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${productsHtml}
                                </tbody>
                            </table>

                            <!-- Summary -->
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border-radius: 12px; padding: 16px;">
                                <div>
                                    <p style="margin: 0 0 8px; font-size: 13px;"><strong>Tổng số lượng:</strong> ${totalQty}</p>
                                    <p style="margin: 0 0 8px; font-size: 13px;"><strong>Giảm giá:</strong> ${formatCurrency(details.decreaseAmount)}</p>
                                    <p style="margin: 0; font-size: 13px; color: #dc2626;"><strong>Tổng tiền:</strong> ${formatCurrency(finalTotal)}</p>
                                </div>
                                <div>
                                    <p style="margin: 0 0 8px; font-size: 13px;"><strong>Tổng:</strong> ${formatCurrency(details.amountTotal)}</p>
                                    <p style="margin: 0 0 8px; font-size: 13px;"><strong>Ship:</strong> ${formatCurrency(details.deliveryPrice)}</p>
                                    <p style="margin: 0; font-size: 13px;"><strong>Công nợ:</strong> ${formatCurrency(details.paymentAmount)}</p>
                                </div>
                            </div>

                            <!-- COD -->
                            <div style="margin-top: 16px; padding: 12px 16px; background: #fef3c7; border-radius: 8px; text-align: center;">
                                <strong style="color: #d97706; font-size: 14px;">COD: ${formatCurrency(details.cod)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(popup);

            // Click outside to close
            popup.addEventListener('click', (e) => {
                if (e.target === popup.firstElementChild) {
                    popup.remove();
                }
            });

        } catch (err) {
            console.error('Failed to load order details:', err);
            document.getElementById('order-detail-loading')?.remove();
            alert('Lỗi khi tải thông tin đơn hàng: ' + err.message);
        }
    }

    _renderNotesSection(notes) {
        const container = this.container.querySelector('#internal-notes-section');

        let notesHtml = '';
        if (!notes || notes.length === 0) {
            notesHtml = `
                <div class="text-center py-8 text-slate-400">
                    <span class="material-symbols-outlined" style="font-size: 32px; margin-bottom: 8px;">speaker_notes_off</span>
                    <p class="text-sm">Chưa có ghi chú</p>
                </div>
            `;
        } else {
            notesHtml = notes.slice(0, 5).map(note => {
                const date = new Date(note.created_at).toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const initials = this._getInitials(note.created_by || 'Hệ thống');

                return `
                    <div style="display: flex; gap: 12px; margin-bottom: 12px;">
                        <div style="width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" class="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">
                            ${initials}
                        </div>
                        <div style="flex: 1;" class="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                                <span class="text-xs font-bold text-slate-700 dark:text-slate-300">${note.created_by || 'Hệ thống'}</span>
                                <span class="text-xs text-slate-400">${date}</span>
                            </div>
                            <p class="text-sm text-slate-600 dark:text-slate-300">${note.content}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = `
            <!-- Header -->
            <div class="px-5 py-4 border-b border-border-light dark:border-border-dark flex items-center gap-2">
                <span class="material-symbols-outlined text-amber-500">speaker_notes</span>
                <h3 class="text-base font-bold text-slate-900 dark:text-white">Ghi chú</h3>
            </div>

            <!-- Notes List -->
            <div class="p-5 overflow-y-auto" style="flex: 1;">
                ${notesHtml}
            </div>

            <!-- Add Note Input -->
            ${this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                <div class="p-4 border-t border-border-light dark:border-border-dark bg-slate-50 dark:bg-slate-800/50">
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="new-note-input"
                            class="rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary px-3 py-2 placeholder-slate-400"
                            style="flex: 1;"
                            placeholder="Thêm ghi chú...">
                        <button id="add-note-btn" class="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors">
                            Thêm
                        </button>
                    </div>
                </div>
            ` : ''}
        `;

        // Setup add note button
        if (this.permissionHelper.hasPermission('customer-hub', 'addNote')) {
            const addNoteBtn = container.querySelector('#add-note-btn');
            const noteInput = container.querySelector('#new-note-input');
            if (addNoteBtn && noteInput) {
                addNoteBtn.onclick = () => this._addCustomerNote(noteInput.value);
                noteInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this._addCustomerNote(noteInput.value);
                    }
                });
            }
        }
    }

    // Helper methods
    _getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    _getAvatarColor(name) {
        const colors = [
            { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
            { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
            { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' },
            { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
            { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' },
            { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-400' },
        ];
        const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }

    _getStatusBadge(status) {
        const statusLower = (status || 'active').toLowerCase();
        const statusMap = {
            'active': { bg: 'bg-success-light', text: 'text-success', label: 'Active' },
            'inactive': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', label: 'Inactive' },
            'pending': { bg: 'bg-warning-light', text: 'text-warning', label: 'Pending' },
            'blocked': { bg: 'bg-danger-light', text: 'text-danger', label: 'Blocked' },
        };
        const s = statusMap[statusLower] || statusMap['active'];
        return `<span class="inline-flex items-center px-2.5 py-1 rounded-lg ${s.bg} ${s.text} text-xs font-semibold">${s.label}</span>`;
    }

    _getTierBadge(tier) {
        const tierLower = (tier || 'new').toLowerCase();
        const tierMap = {
            'gold': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'Gold', icon: 'star' },
            'silver': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', label: 'Silver', icon: 'star_half' },
            'bronze': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', label: 'Bronze', icon: 'star_outline' },
            'platinum': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', label: 'Platinum', icon: 'diamond' },
            'new': { bg: 'bg-primary/10', text: 'text-primary', label: 'New', icon: 'person' },
        };
        const t = tierMap[tierLower] || tierMap['new'];
        return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${t.bg} ${t.text} text-xs font-semibold">
            <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">${t.icon}</span>
            ${t.label}
        </span>`;
    }

    _renderTags(tags) {
        if (!tags || tags.length === 0) {
            return `<span class="text-sm text-slate-400">Chưa có nhãn</span>`;
        }
        return tags.map(tag => `
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium border border-border-light dark:border-border-dark">${tag}</span>
        `).join('');
    }

    _getActivityIcon(type) {
        const typeMap = {
            'purchase': { icon: 'shopping_cart', bgColor: 'bg-primary/10', borderColor: 'border-primary/20', iconColor: 'text-primary' },
            'order': { icon: 'shopping_cart', bgColor: 'bg-primary/10', borderColor: 'border-primary/20', iconColor: 'text-primary' },
            'login': { icon: 'login', bgColor: 'bg-slate-100 dark:bg-slate-700', borderColor: 'border-slate-200 dark:border-slate-600', iconColor: 'text-slate-500' },
            'email': { icon: 'mail', bgColor: 'bg-amber-100 dark:bg-amber-900/20', borderColor: 'border-amber-200 dark:border-amber-800', iconColor: 'text-amber-600' },
            'wallet': { icon: 'account_balance_wallet', bgColor: 'bg-success-light', borderColor: 'border-success/20', iconColor: 'text-success' },
            'deposit': { icon: 'add_circle', bgColor: 'bg-success-light', borderColor: 'border-success/20', iconColor: 'text-success' },
            'withdraw': { icon: 'remove_circle', bgColor: 'bg-danger-light', borderColor: 'border-danger/20', iconColor: 'text-danger' },
            'ticket': { icon: 'support_agent', bgColor: 'bg-purple-100 dark:bg-purple-900/20', borderColor: 'border-purple-200 dark:border-purple-800', iconColor: 'text-purple-600' },
            'note': { icon: 'note', bgColor: 'bg-cyan-100 dark:bg-cyan-900/20', borderColor: 'border-cyan-200 dark:border-cyan-800', iconColor: 'text-cyan-600' },
        };
        return typeMap[type] || { icon: 'event', bgColor: 'bg-slate-100 dark:bg-slate-700', borderColor: 'border-slate-200 dark:border-slate-600', iconColor: 'text-slate-500' };
    }

    _translateActivityTitle(activity) {
        const type = activity.type || activity.event_type || '';
        const title = activity.title || activity.description || '';

        // Ticket type translations (matching issue-tracking naming)
        const ticketTypeMap = {
            'BOOM': 'Boom Hàng',
            'FIX_COD': 'Sửa COD',
            'RETURN_CLIENT': 'Khách Gửi',
            'RETURN_SHIPPER': 'Thu Về',
            'OTHER': 'Vấn đề khác'
        };

        // Activity type translations
        const activityTypeMap = {
            'purchase': 'Đơn hàng',
            'order': 'Đơn hàng',
            'ORDER_CREATED': 'Tạo đơn hàng',
            'ORDER_CANCELLED': 'Hủy đơn hàng',
            'ORDER_DELIVERED': 'Giao hàng',
            'ORDER_RETURNED': 'Trả hàng',
            'WALLET_DEPOSIT': 'Nạp tiền',
            'WALLET_WITHDRAW': 'Trừ công nợ',
            'WALLET_VIRTUAL_CREDIT': 'Cộng công nợ ảo',
            'WALLET_REFUND': 'Hoàn công nợ',
            'NOTE_ADDED': 'Ghi chú',
            'login': 'Đăng nhập',
            'email': 'Email',
            'wallet': 'Ví',
            'deposit': 'Nạp tiền',
            'withdraw': 'Rút tiền',
            'ticket': 'Ticket',
            'note': 'Ghi chú'
        };

        // Check if it's a ticket type first
        if (ticketTypeMap[type]) {
            return ticketTypeMap[type];
        }

        // Check if title contains ticket type codes
        for (const [code, vn] of Object.entries(ticketTypeMap)) {
            if (title.includes(code)) {
                return title.replace(code, vn);
            }
        }

        // Translate activity type
        if (activityTypeMap[type]) {
            return activityTypeMap[type] + (title ? ` - ${title}` : '');
        }

        // Return original title or default
        return title || 'Hoạt động';
    }

    _getTimeAgo(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays === 1) return 'Hôm qua';
        if (diffDays < 7) return `${diffDays} ngày trước`;
        return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
    }

    async _addCustomerNote(content) {
        if (!content || !content.trim()) {
            alert('Vui lòng nhập nội dung ghi chú.');
            return;
        }

        const addNoteBtn = this.container.querySelector('#add-note-btn');
        if (addNoteBtn) {
            addNoteBtn.disabled = true;
            addNoteBtn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>`;
        }

        try {
            // Get current user name from localStorage/sessionStorage
            let createdBy = 'Hệ thống';
            try {
                const authData = sessionStorage.getItem('loginindex_auth') || localStorage.getItem('loginindex_auth');
                if (authData) {
                    const auth = JSON.parse(authData);
                    createdBy = auth.userName || auth.userType || 'Hệ thống';
                }
            } catch (e) {
                console.warn('Could not get user name:', e);
            }

            const response = await apiService.addCustomerNote(this.customerPhone, content.trim(), { created_by: createdBy });
            if (response) {
                // Audit logging - ghi nhận thao tác cập nhật thông tin KH
                try {
                    logAction('customer_info_update', {
                        module: 'customer-hub',
                        description: `Thêm ghi chú cho KH ${this.customerPhone}`,
                        oldData: null,
                        newData: { note: content.trim(), createdBy },
                        entityId: this.customerPhone,
                        entityType: 'customer'
                    });
                } catch (e) { /* audit log error - ignore */ }

                // Reload profile to show new note
                this.render(this.customerPhone);
            } else {
                alert('Lỗi khi thêm ghi chú: Lỗi không xác định');
            }
        } catch (error) {
            alert('Lỗi khi thêm ghi chú: ' + error.message);
            console.error('Lỗi thêm ghi chú:', error);
        } finally {
            if (addNoteBtn) {
                addNoteBtn.disabled = false;
                addNoteBtn.innerHTML = `Thêm`;
            }
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    }
}

// =====================================================
// GLOBAL ALIAS MANAGEMENT FUNCTIONS
// =====================================================

/**
 * Show dialog to add a new alias
 * @param {string} phone - Customer phone
 */
window.showAddAliasDialog = function(phone) {
    const alias = prompt('Nhập tên tham khảo mới (Facebook nickname):');
    if (alias && alias.trim()) {
        window.addCustomerAlias(phone, alias.trim());
    }
};

/**
 * Add an alias to a customer
 * @param {string} phone - Customer phone
 * @param {string} alias - New alias name
 */
window.addCustomerAlias = async function(phone, alias) {
    try {
        const response = await fetch(`/api/sepay/customer/${phone}/alias`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ alias })
        });

        const result = await response.json();

        if (result.success) {
            console.log('[ALIAS] Added alias:', alias, 'for phone:', phone);

            // Reload the customer profile to show updated aliases
            // Try to find and call the module's render function
            if (window.customerProfileModule && typeof window.customerProfileModule.render === 'function') {
                window.customerProfileModule.render(phone);
            } else {
                // Fallback: reload the page
                location.reload();
            }
        } else {
            alert('Lỗi: ' + (result.error || 'Không thể thêm tên'));
        }
    } catch (error) {
        console.error('[ALIAS] Error adding alias:', error);
        alert('Lỗi kết nối server');
    }
};

/**
 * Remove an alias from a customer
 * @param {string} phone - Customer phone
 * @param {string} alias - Alias to remove
 */
window.removeCustomerAlias = async function(phone, alias) {
    if (!confirm(`Xóa tên "${alias}" khỏi danh sách tham khảo?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/sepay/customer/${phone}/alias`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ alias })
        });

        const result = await response.json();

        if (result.success) {
            console.log('[ALIAS] Removed alias:', alias, 'from phone:', phone);

            // Reload the customer profile to show updated aliases
            if (window.customerProfileModule && typeof window.customerProfileModule.render === 'function') {
                window.customerProfileModule.render(phone);
            } else {
                location.reload();
            }
        } else {
            alert('Lỗi: ' + (result.error || 'Không thể xóa tên'));
        }
    } catch (error) {
        console.error('[ALIAS] Error removing alias:', error);
        alert('Lỗi kết nối server');
    }
};
