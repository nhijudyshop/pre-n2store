// customer-hub/js/modules/customer-profile.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';
import { WalletPanelModule } from './wallet-panel.js';
import { TicketListModule } from './ticket-list.js';

export class CustomerProfileModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
        this.walletPanelModule = null;
        this.ticketListModule = null;
        this.customerData = null;
    }

    initUI() {
        this.container.innerHTML = `
            <!-- Modal Header -->
            <header class="shrink-0 px-6 py-5 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div class="flex items-center gap-3 mb-1">
                            <h1 id="modal-customer-name" class="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Hồ sơ khách hàng</h1>
                            <span id="modal-customer-id" class="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-border-light dark:border-border-dark"></span>
                        </div>
                        <p id="modal-customer-meta" class="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                            <span class="material-symbols-outlined text-base">call</span>
                            <span id="modal-phone-display"></span>
                            <span class="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                            <span class="material-symbols-outlined text-base">location_on</span>
                            <span id="modal-address-display">Chưa có địa chỉ</span>
                        </p>
                    </div>
                    <div class="flex items-center gap-3">
                        <button id="audit-log-btn" class="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-soft">
                            <span class="material-symbols-outlined text-lg">history</span>
                            Lịch sử
                        </button>
                        <button onclick="window.closeCustomerModal()" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                            <span class="material-symbols-outlined text-2xl">close</span>
                        </button>
                    </div>
                </div>
            </header>

            <!-- Modal Body - Scrollable -->
            <div class="flex-1 overflow-y-auto p-6 space-y-6 bg-background-light dark:bg-background-dark">
                <!-- Loading State -->
                <div id="modal-loader" class="flex flex-col items-center justify-center py-20">
                    <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <span class="material-symbols-outlined text-primary text-3xl animate-spin">progress_activity</span>
                    </div>
                    <p class="text-slate-500 dark:text-slate-400 font-medium">Đang tải thông tin khách hàng...</p>
                </div>

                <!-- Content - Hidden until loaded -->
                <div id="modal-content-loaded" class="hidden space-y-6">
                    <!-- Top Row: 2 Columns (Profile Left, Wallet + RFM Right) -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <!-- Customer Info Card (Left - Smaller) -->
                        <div id="customer-info-card" class="lg:col-span-4 bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                            <!-- Will be rendered dynamically -->
                        </div>

                        <!-- Wallet + RFM Container (Right - Larger) -->
                        <div class="lg:col-span-8 space-y-6">
                            <!-- Wallet Summary Card -->
                            <div id="customer-wallet-panel" class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                                <!-- Will be rendered by WalletPanelModule -->
                            </div>

                            <!-- RFM Analysis Card -->
                            <div id="rfm-analysis-card" class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                                <!-- Will be rendered dynamically -->
                            </div>
                        </div>
                    </div>

                    <!-- Bottom Row: 2 Columns -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <!-- Recent Tickets -->
                        <div id="customer-ticket-list" class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card min-h-[320px]">
                            <!-- Will be rendered by TicketListModule -->
                        </div>

                        <!-- Recent Activities Timeline -->
                        <div id="recent-activities-card" class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card min-h-[320px]">
                            <!-- Will be rendered dynamically -->
                        </div>
                    </div>

                    <!-- Internal Notes Section -->
                    <div id="internal-notes-section" class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card p-6">
                        <!-- Will be rendered dynamically -->
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
                this._renderCustomerInfoCard(data.customer);
                this._renderRFMCard(data.customer);
                this._renderActivitiesCard(data.recentActivities || []);
                this._renderNotesSection(data.notes || []);

                // Initialize sub-modules
                this.walletPanelModule = new WalletPanelModule('customer-wallet-panel', this.permissionHelper);
                this.walletPanelModule.render(phone);

                this.ticketListModule = new TicketListModule('customer-ticket-list', this.permissionHelper);
                this.ticketListModule.render(phone);

                this.loader.classList.add('hidden');
                this.contentLoaded.classList.remove('hidden');
            } else {
                this._showError(`Customer not found for phone: ${phone}`);
            }
        } catch (error) {
            this._showError(`Error loading customer: ${error.message}`);
            console.error('Customer profile load error:', error);
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
        const nameEl = this.container.querySelector('#modal-customer-name');
        const idEl = this.container.querySelector('#modal-customer-id');
        const phoneEl = this.container.querySelector('#modal-phone-display');
        const addressEl = this.container.querySelector('#modal-address-display');

        nameEl.textContent = customer.name || 'Hồ sơ khách hàng';
        idEl.textContent = `ID: #${customer.id || 'N/A'}`;
        phoneEl.textContent = customer.phone;
        addressEl.textContent = customer.address || 'Chưa có địa chỉ';
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
        const recency = rfm.recency_days || 'N/A';
        const frequency = rfm.frequency || 0;
        const monetary = rfm.monetary || 0;
        const percentile = rfm.percentile || null;

        container.innerHTML = `
            <div class="p-6">
                <!-- Header -->
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-purple-500">analytics</span>
                        Phân tích RFM
                    </h3>
                    ${percentile ? `
                        <div class="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold px-3 py-1 rounded-lg border border-purple-200 dark:border-purple-800">
                            TOP ${percentile}%
                        </div>
                    ` : ''}
                </div>

                <!-- Metrics Grid -->
                <div class="grid grid-cols-4 gap-4">
                    <!-- Overall Score - Large -->
                    <div class="col-span-2 p-5 bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-xl border border-primary/10">
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Điểm tổng</p>
                        <div class="flex items-baseline gap-1">
                            <span class="text-4xl font-bold text-slate-900 dark:text-white tabular-nums">${score.toFixed(1)}</span>
                            <span class="text-lg text-slate-400 font-medium">/5</span>
                        </div>
                        <!-- Mini chart placeholder -->
                        <div class="h-8 mt-3 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/10 rounded-full overflow-hidden">
                            <div class="h-full bg-primary rounded-full" style="width: ${(score / 5) * 100}%"></div>
                        </div>
                    </div>

                    <!-- Recency -->
                    <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-border-light dark:border-border-dark">
                        <div class="flex items-center gap-1.5 text-slate-500 mb-2">
                            <span class="material-symbols-outlined text-base">schedule</span>
                            <span class="text-xs font-bold uppercase">Recency</span>
                        </div>
                        <p class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                            ${typeof recency === 'number' ? recency : recency}
                        </p>
                        <p class="text-xs text-slate-500 mt-0.5">${typeof recency === 'number' ? 'days ago' : ''}</p>
                    </div>

                    <!-- Frequency -->
                    <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-border-light dark:border-border-dark">
                        <div class="flex items-center gap-1.5 text-slate-500 mb-2">
                            <span class="material-symbols-outlined text-base">repeat</span>
                            <span class="text-xs font-bold uppercase">Frequency</span>
                        </div>
                        <p class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">${frequency}</p>
                        <p class="text-xs text-slate-500 mt-0.5">orders</p>
                    </div>
                </div>

                <!-- Monetary Value (Full Width) -->
                <div class="mt-4 p-4 bg-success-light dark:bg-success/10 rounded-xl border border-success/20 flex items-center justify-between">
                    <div>
                        <div class="flex items-center gap-1.5 text-success mb-1">
                            <span class="material-symbols-outlined text-base">payments</span>
                            <span class="text-xs font-bold uppercase">Monetary (LTV)</span>
                        </div>
                        <p class="text-2xl font-bold text-success tabular-nums">${this.formatCurrency(monetary)}</p>
                    </div>
                    ${rfm.yoy_change ? `
                        <div class="px-3 py-1.5 rounded-lg ${rfm.yoy_change >= 0 ? 'bg-success text-white' : 'bg-danger text-white'} text-sm font-bold">
                            ${rfm.yoy_change >= 0 ? '+' : ''}${rfm.yoy_change}% YoY
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    _renderActivitiesCard(activities) {
        const container = this.container.querySelector('#recent-activities-card');

        let activitiesHtml = '';
        if (!activities || activities.length === 0) {
            activitiesHtml = `
                <div class="flex flex-col items-center justify-center py-10 text-slate-400">
                    <span class="material-symbols-outlined text-4xl mb-3">history</span>
                    <p class="text-sm font-medium">No activities yet</p>
                </div>
            `;
        } else {
            activitiesHtml = activities.slice(0, 5).map((activity, index) => {
                const iconInfo = this._getActivityIcon(activity.type || activity.event_type);
                const timeAgo = this._getTimeAgo(activity.created_at || activity.timestamp);

                return `
                    <div class="relative pl-10 ${index !== activities.slice(0, 5).length - 1 ? 'pb-6' : ''}">
                        <!-- Timeline Line -->
                        ${index !== activities.slice(0, 5).length - 1 ? `<div class="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200 dark:bg-slate-700"></div>` : ''}

                        <!-- Icon -->
                        <div class="absolute left-0 top-0 w-7 h-7 rounded-full ${iconInfo.bgColor} border ${iconInfo.borderColor} flex items-center justify-center z-10">
                            <span class="material-symbols-outlined text-sm ${iconInfo.iconColor}">${iconInfo.icon}</span>
                        </div>

                        <!-- Content -->
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                            <div>
                                <p class="text-sm font-medium text-slate-900 dark:text-white">${activity.title || activity.description || 'Activity'}</p>
                                ${activity.details ? `<p class="text-xs text-slate-500 mt-0.5">${activity.details}</p>` : ''}
                            </div>
                            <span class="text-xs text-slate-400 whitespace-nowrap">${timeAgo}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = `
            <!-- Header -->
            <div class="px-6 py-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                <h3 class="text-base font-bold text-slate-900 dark:text-white">Recent Activities</h3>
                <button class="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <span class="material-symbols-outlined text-xl">filter_list</span>
                </button>
            </div>

            <!-- Timeline Content -->
            <div class="p-6">
                ${activitiesHtml}
            </div>
        `;
    }

    _renderNotesSection(notes) {
        const container = this.container.querySelector('#internal-notes-section');

        let notesHtml = '';
        if (!notes || notes.length === 0) {
            notesHtml = `
                <div class="text-center py-6 text-slate-400">
                    <p class="text-sm">No internal notes yet</p>
                </div>
            `;
        } else {
            notesHtml = notes.slice(0, 5).map(note => {
                const date = new Date(note.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const initials = this._getInitials(note.created_by || 'System');

                return `
                    <div class="flex gap-3">
                        <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-bold shrink-0">
                            ${initials}
                        </div>
                        <div class="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl rounded-tl-none p-4 border border-border-light dark:border-border-dark">
                            <div class="flex justify-between items-baseline mb-1.5">
                                <span class="text-xs font-bold text-slate-700 dark:text-slate-300">${note.created_by || 'System'}</span>
                                <span class="text-xs text-slate-400">${date}</span>
                            </div>
                            <p class="text-sm text-slate-600 dark:text-slate-300">${note.content}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = `
            <h3 class="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <span class="material-symbols-outlined text-slate-400">forum</span>
                Internal Notes
            </h3>
            <div class="space-y-4 mb-6 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                ${notesHtml}
            </div>
            ${this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                <div class="relative">
                    <textarea id="new-note-textarea"
                        class="w-full rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary min-h-[100px] p-4 pr-28 resize-none placeholder-slate-400"
                        placeholder="Add an internal note..."></textarea>
                    <div class="absolute bottom-3 right-3 flex gap-2">
                        <button class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title="Attach file">
                            <span class="material-symbols-outlined text-xl">attach_file</span>
                        </button>
                        <button id="add-note-btn" class="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                            <span class="material-symbols-outlined text-lg">send</span>
                            Add
                        </button>
                    </div>
                </div>
            ` : ''}
        `;

        // Setup add note button
        if (this.permissionHelper.hasPermission('customer-hub', 'addNote')) {
            const addNoteBtn = container.querySelector('#add-note-btn');
            const noteTextarea = container.querySelector('#new-note-textarea');
            if (addNoteBtn && noteTextarea) {
                addNoteBtn.onclick = () => this._addCustomerNote(noteTextarea.value);
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
            return `<span class="text-sm text-slate-400">No tags</span>`;
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

    _getTimeAgo(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    }

    async _addCustomerNote(content) {
        if (!content || !content.trim()) {
            alert('Please enter note content.');
            return;
        }

        const addNoteBtn = this.container.querySelector('#add-note-btn');
        if (addNoteBtn) {
            addNoteBtn.disabled = true;
            addNoteBtn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>`;
        }

        try {
            const response = await apiService.addCustomerNote(this.customerPhone, content.trim());
            if (response.success) {
                // Reload profile to show new note
                this.render(this.customerPhone);
            } else {
                alert('Error adding note: ' + (response.error || 'Unknown error'));
            }
        } catch (error) {
            alert('Error adding note: ' + error.message);
            console.error('Add note error:', error);
        } finally {
            if (addNoteBtn) {
                addNoteBtn.disabled = false;
                addNoteBtn.innerHTML = `<span class="material-symbols-outlined text-lg">send</span> Add`;
            }
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    }
}
