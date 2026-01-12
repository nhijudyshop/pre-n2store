// customer-hub/js/modules/transaction-activity.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class TransactionActivityModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.currentPage = 1;
        this.limit = 10;
        this.totalItems = 0;
        this.initUI();
    }

    initUI() {
        if (!this.permissionHelper.hasPermission('customer-hub', 'viewActivities')) {
            this.container.innerHTML = `
                <div class="bg-danger-light rounded-2xl p-6 text-center">
                    <span class="material-symbols-outlined text-danger text-3xl mb-2">lock</span>
                    <p class="text-danger font-medium">Bạn không có quyền truy cập hoạt động giao dịch.</p>
                </div>
            `;
            return;
        }

        this.container.innerHTML = `
            <!-- Filters Section -->
            <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
                <!-- Left: Filters -->
                <div class="flex flex-col sm:flex-row gap-3 w-full lg:w-auto flex-1">
                    <!-- Search Input -->
                    <div class="relative flex-1 max-w-md">
                        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-xl">search</span>
                        </div>
                        <input type="text" id="search-input"
                            class="w-full pl-12 pr-4 py-2.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                            placeholder="Tìm theo ID, khách hàng hoặc số tiền...">
                    </div>

                    <!-- Event Type Filter -->
                    <div class="relative">
                        <select id="type-filter"
                            class="appearance-none pl-4 pr-10 py-2.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer min-w-[160px]">
                            <option value="">Tất cả loại</option>
                            <option value="DEPOSIT">Nạp tiền</option>
                            <option value="WITHDRAW">Rút tiền</option>
                            <option value="VIRTUAL_CREDIT">Tín dụng ảo</option>
                            <option value="OTHER">Khác</option>
                        </select>
                        <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-lg">expand_more</span>
                        </div>
                    </div>

                    <!-- Date Range Filter -->
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-lg">calendar_today</span>
                        </div>
                        <select id="date-filter"
                            class="appearance-none pl-10 pr-10 py-2.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                            <option value="">Tất cả</option>
                            <option value="7">7 ngày qua</option>
                            <option value="30" selected>30 ngày qua</option>
                            <option value="90">90 ngày qua</option>
                        </select>
                        <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-lg">expand_more</span>
                        </div>
                    </div>
                </div>

                <!-- Right: Actions -->
                <div class="flex items-center gap-3">
                    <button id="apply-filters-btn"
                        class="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span class="material-symbols-outlined text-lg">filter_list</span>
                        Bộ lọc
                    </button>
                    <button class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl shadow-soft hover:shadow-glow transition-all">
                        <span class="material-symbols-outlined text-lg">download</span>
                        Xuất CSV
                    </button>
                </div>
            </div>

            <!-- Data Table Card -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full">
                        <thead class="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-44">Thời gian</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Khách hàng</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Loại</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mô tả</th>
                                <th class="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Số tiền</th>
                                <th class="px-6 py-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trạng thái</th>
                                <th class="px-6 py-4 w-12"></th>
                            </tr>
                        </thead>
                        <tbody id="transaction-table-body" class="divide-y divide-border-light dark:divide-border-dark">
                            <tr>
                                <td colspan="7" class="px-6 py-12 text-center">
                                    <div class="flex flex-col items-center">
                                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                                        </div>
                                        <p class="text-slate-500 dark:text-slate-400">Đang tải giao dịch...</p>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Pagination -->
                <div class="px-6 py-4 border-t border-border-light dark:border-border-dark flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                        Hiển thị <span class="font-semibold text-slate-900 dark:text-white" id="showing-start">0</span>
                        đến <span class="font-semibold text-slate-900 dark:text-white" id="showing-end">0</span>
                        trên <span class="font-semibold text-slate-900 dark:text-white" id="total-count">0</span> kết quả
                    </p>
                    <nav id="pagination-nav" class="flex items-center gap-1"></nav>
                </div>
            </div>
        `;

        this.searchInput = this.container.querySelector('#search-input');
        this.typeFilter = this.container.querySelector('#type-filter');
        this.dateFilter = this.container.querySelector('#date-filter');
        this.applyFiltersBtn = this.container.querySelector('#apply-filters-btn');
        this.tableBody = this.container.querySelector('#transaction-table-body');

        // Event listeners
        this.typeFilter.addEventListener('change', () => {
            this.currentPage = 1;
            this.loadTransactions();
        });

        this.dateFilter.addEventListener('change', () => {
            this.currentPage = 1;
            this.loadTransactions();
        });

        this.applyFiltersBtn.addEventListener('click', () => {
            this.currentPage = 1;
            this.loadTransactions();
        });

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.currentPage = 1;
                this.loadTransactions();
            }
        });

        this.loadTransactions();
    }

    async loadTransactions() {
        this.tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                        </div>
                        <p class="text-slate-500 dark:text-slate-400">Đang tải giao dịch...</p>
                    </div>
                </td>
            </tr>
        `;

        const filters = {};
        const searchQuery = this.searchInput.value.trim();
        if (searchQuery) {
            filters.query = searchQuery;
        }
        if (this.typeFilter.value) {
            filters.type = this.typeFilter.value;
        }

        const days = this.dateFilter.value;
        if (days) {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(days));
            filters.startDate = startDate.toISOString().split('T')[0];
            filters.endDate = endDate.toISOString().split('T')[0];
        }

        try {
            const response = await apiService.getConsolidatedTransactions(this.currentPage, this.limit, filters);
            if (response.success && response.data && response.data.length > 0) {
                this.totalItems = response.pagination?.total || response.data.length;
                this.renderTransactions(response.data);
            } else if (response.success) {
                // API returned success but no data
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="px-6 py-12 text-center">
                            <div class="flex flex-col items-center">
                                <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                                    <span class="material-symbols-outlined text-slate-400 text-2xl">inbox</span>
                                </div>
                                <p class="text-slate-500 dark:text-slate-400">Không tìm thấy giao dịch</p>
                                <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Thử điều chỉnh bộ lọc</p>
                            </div>
                        </td>
                    </tr>
                `;
                this.updatePagination(0);
            } else {
                throw new Error(response.error || 'Failed to load transactions');
            }
        } catch (error) {
            console.error('Error loading transactions:', error);
            // Check if it's a server error or endpoint not implemented
            const errorMsg = error.message.toLowerCase();
            const isServerError = errorMsg.includes('500') ||
                                  errorMsg.includes('internal server') ||
                                  errorMsg.includes('consolidated') ||
                                  errorMsg.includes('not found') ||
                                  errorMsg.includes('404');

            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center">
                            <div class="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4">
                                <span class="material-symbols-outlined text-warning text-3xl">engineering</span>
                            </div>
                            <p class="text-lg font-medium text-warning mb-1">Tính năng đang phát triển</p>
                            <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">API hoạt động giao dịch đang được xây dựng</p>
                            <button onclick="location.reload()" class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition-colors">
                                <span class="material-symbols-outlined text-lg">refresh</span>
                                Thử lại
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            this.updatePagination(0);
        }
    }

    renderTransactions(transactions) {
        const avatarColors = [
            { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' },
            { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
            { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
            { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
            { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' },
            { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-400' },
        ];

        let html = '';
        transactions.forEach((tx, index) => {
            const color = avatarColors[index % avatarColors.length];
            const initials = this.getInitials(tx.customer_name);
            const eventTypeInfo = this.getEventTypeInfo(tx.type);
            const statusBadge = this.getStatusBadge(tx.color || 'green');
            const amountHtml = this.formatAmount(tx.amount);
            const timestamp = this.formatTimestamp(tx.created_at);

            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="text-sm text-slate-500 dark:text-slate-400 font-mono">${timestamp}</span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full ${color.bg} ${color.text} flex items-center justify-center font-semibold text-xs flex-shrink-0">
                                ${initials}
                            </div>
                            <span class="text-sm font-medium text-primary dark:text-blue-400 hover:underline cursor-pointer" onclick="window.openCustomerModal('${tx.customer_phone}')">${tx.customer_name || 'Unknown'}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <span class="material-symbols-outlined text-lg text-slate-400">${eventTypeInfo.icon}</span>
                            ${eventTypeInfo.text}
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate block" title="${tx.description || ''}">${tx.description || 'N/A'}</span>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <span class="text-sm font-semibold font-mono ${amountHtml.colorClass}">${amountHtml.text}</span>
                    </td>
                    <td class="px-6 py-4 text-center">
                        ${statusBadge}
                    </td>
                    <td class="px-6 py-4">
                        <button class="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all">
                            <span class="material-symbols-outlined text-xl">more_vert</span>
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        this.updatePagination(this.totalItems);
    }

    getInitials(name) {
        if (!name) return 'CU';
        const words = name.trim().split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    getEventTypeInfo(type) {
        const typeMap = {
            'DEPOSIT': { text: 'Wire Transfer', icon: 'account_balance' },
            'WITHDRAW': { text: 'Card Payment', icon: 'payments' },
            'VIRTUAL_CREDIT': { text: 'Internal Transfer', icon: 'swap_horiz' },
            'VIRTUAL_DEBIT': { text: 'Withdrawal', icon: 'credit_card_off' },
            'RETURN_CLIENT': { text: 'Deposit', icon: 'savings' },
            'RETURN_SHIPPER': { text: 'Refund', icon: 'local_shipping' },
            'COD_ADJUSTMENT': { text: 'Adjustment', icon: 'tune' },
            'OTHER': { text: 'System Event', icon: 'dns' },
            'TICKET_CREATED': { text: 'Ticket Created', icon: 'confirmation_number' },
            'TICKET_UPDATED': { text: 'Ticket Updated', icon: 'edit_note' },
            'NOTE_ADDED': { text: 'Note Added', icon: 'sticky_note_2' },
            'CUSTOMER_CREATED': { text: 'Customer Created', icon: 'person_add' },
            'customer_ticket': { text: 'Subscription', icon: 'credit_card' },
        };

        return typeMap[type] || { text: type || 'N/A', icon: 'help' };
    }

    getStatusBadge(color) {
        const colorMap = {
            'green': { text: 'Completed', bg: 'bg-success-light', textColor: 'text-success' },
            'yellow': { text: 'Pending', bg: 'bg-warning-light', textColor: 'text-warning' },
            'red': { text: 'Failed', bg: 'bg-danger-light', textColor: 'text-danger' },
            'blue': { text: 'Processing', bg: 'bg-info-light', textColor: 'text-info' },
        };

        const config = colorMap[color] || colorMap['green'];
        return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.textColor}">${config.text}</span>`;
    }

    formatAmount(amount) {
        if (amount === null || amount === undefined) {
            return { text: '-', colorClass: 'text-slate-400' };
        }

        const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(amount));

        if (amount > 0) {
            return { text: `+${formatted}`, colorClass: 'text-success' };
        } else if (amount < 0) {
            return { text: `-${formatted}`, colorClass: 'text-danger' };
        }

        return { text: formatted, colorClass: 'text-slate-900 dark:text-slate-200' };
    }

    formatTimestamp(dateStr) {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    }

    updatePagination(total) {
        const totalPages = Math.ceil(total / this.limit);
        const showingStart = total > 0 ? (this.currentPage - 1) * this.limit + 1 : 0;
        const showingEnd = Math.min(this.currentPage * this.limit, total);

        this.container.querySelector('#showing-start').textContent = showingStart;
        this.container.querySelector('#showing-end').textContent = showingEnd;
        this.container.querySelector('#total-count').textContent = total;

        const paginationNav = this.container.querySelector('#pagination-nav');
        if (!paginationNav || totalPages <= 1) {
            if (paginationNav) paginationNav.innerHTML = '';
            return;
        }

        let html = `
            <button class="prev-page w-9 h-9 flex items-center justify-center rounded-lg border border-border-light dark:border-border-dark text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${this.currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === 1 ? 'disabled' : ''}>
                <span class="material-symbols-outlined text-xl">chevron_left</span>
            </button>
        `;

        const pagesToShow = [];
        pagesToShow.push(1);
        if (this.currentPage > 3) pagesToShow.push('...');
        for (let i = Math.max(2, this.currentPage - 1); i <= Math.min(totalPages - 1, this.currentPage + 1); i++) {
            if (!pagesToShow.includes(i)) pagesToShow.push(i);
        }
        if (this.currentPage < totalPages - 2) pagesToShow.push('...');
        if (totalPages > 1 && !pagesToShow.includes(totalPages)) pagesToShow.push(totalPages);

        pagesToShow.forEach(page => {
            if (page === '...') {
                html += `<span class="px-2 text-slate-400">...</span>`;
            } else if (page === this.currentPage) {
                html += `<button class="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-white font-medium text-sm">${page}</button>`;
            } else {
                html += `<button class="page-btn w-9 h-9 flex items-center justify-center rounded-lg border border-border-light dark:border-border-dark text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-sm transition-colors" data-page="${page}">${page}</button>`;
            }
        });

        html += `
            <button class="next-page w-9 h-9 flex items-center justify-center rounded-lg border border-border-light dark:border-border-dark text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${this.currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${this.currentPage === totalPages ? 'disabled' : ''}>
                <span class="material-symbols-outlined text-xl">chevron_right</span>
            </button>
        `;

        paginationNav.innerHTML = html;

        paginationNav.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                this.loadTransactions();
            });
        });

        const prevBtn = paginationNav.querySelector('.prev-page');
        const nextBtn = paginationNav.querySelector('.next-page');

        if (prevBtn && this.currentPage > 1) {
            prevBtn.addEventListener('click', () => {
                this.currentPage--;
                this.loadTransactions();
            });
        }

        if (nextBtn && this.currentPage < totalPages) {
            nextBtn.addEventListener('click', () => {
                this.currentPage++;
                this.loadTransactions();
            });
        }
    }
}
