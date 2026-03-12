// customer-hub/js/modules/link-bank-transaction.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class LinkBankTransactionModule {
    constructor(containerId, permissionHelper, onUpdateCallback = null) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.onUpdateCallback = onUpdateCallback;
        this.currentPage = 1;
        this.limit = 10;
        this.totalItems = 0;
        this.currentTransaction = null;
        this.selectedDays = '';
        this.initUI();
    }

    initUI() {
        if (!this.permissionHelper.hasPermission('customer-hub', 'linkTransactions')) {
            this.container.innerHTML = `
                <div class="bg-danger-light rounded-2xl p-6 text-center">
                    <span class="material-symbols-outlined text-danger text-3xl mb-2">lock</span>
                    <p class="text-danger font-medium">Bạn không có quyền truy cập tính năng liên kết giao dịch.</p>
                </div>
            `;
            return;
        }

        this.container.innerHTML = `
            <!-- Page Header -->
            <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Giao dịch ngân hàng chưa liên kết</h1>
                    <p class="text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                        Xem các bản ghi ngân hàng chưa được tự động ghép với hồ sơ khách hàng. Sử dụng công cụ bên dưới để liên kết thủ công.
                    </p>
                </div>
                <div class="flex gap-3">
                    <button class="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span class="material-symbols-outlined text-lg">download</span>
                        Xuất CSV
                    </button>
                    <button id="refresh-btn" class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl shadow-soft hover:shadow-glow transition-all">
                        <span class="material-symbols-outlined text-lg">refresh</span>
                        Làm mới
                    </button>
                </div>
            </div>

            <!-- Main Content Card -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                <!-- Filters Toolbar -->
                <div class="p-4 border-b border-border-light dark:border-border-dark bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <!-- Search -->
                    <div class="relative w-full sm:max-w-md">
                        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <span class="material-symbols-outlined text-slate-400 text-xl">search</span>
                        </div>
                        <input type="text" id="search-input"
                            class="w-full pl-12 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                            placeholder="Lọc theo số tiền, mã ngân hàng hoặc mô tả...">
                    </div>

                    <!-- Secondary Filters -->
                    <div class="flex items-center gap-3 w-full sm:w-auto">
                        <!-- Date Filter -->
                        <div class="relative">
                            <button id="date-filter-btn" class="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all">
                                <span class="material-symbols-outlined text-lg">calendar_today</span>
                                <span id="date-filter-label">Tất cả</span>
                                <span class="material-symbols-outlined text-lg text-slate-400">expand_more</span>
                            </button>
                            <!-- Date Filter Dropdown -->
                            <div id="date-filter-dropdown" class="absolute right-0 mt-2 w-48 rounded-xl shadow-lg bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark py-1 z-10 hidden">
                                <button data-days="" class="date-filter-option w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Tất cả</button>
                                <button data-days="7" class="date-filter-option w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">7 ngày qua</button>
                                <button data-days="30" class="date-filter-option w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">30 ngày qua</button>
                                <button data-days="90" class="date-filter-option w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">90 ngày qua</button>
                            </div>
                        </div>

                        <button id="more-filters-btn" class="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all">
                            <span class="material-symbols-outlined text-lg">filter_list</span>
                            Bộ lọc
                        </button>
                    </div>
                </div>

                <!-- Table -->
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full">
                        <thead class="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-36">Ngày</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40">Mã ngân hàng</th>
                                <th class="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-36">Số tiền</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nội dung</th>
                                <th class="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-44">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody id="transaction-table-body" class="divide-y divide-border-light dark:divide-border-dark">
                            <tr>
                                <td colspan="5" class="px-6 py-12 text-center">
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

            <!-- Link Transaction Modal -->
            <div id="link-transaction-modal" class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center hidden">
                <div class="bg-surface-light dark:bg-surface-dark rounded-3xl shadow-modal w-full max-w-md mx-4 border border-border-light dark:border-border-dark overflow-hidden">
                    <!-- Modal Header -->
                    <div class="px-6 py-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                        <h3 class="text-lg font-bold text-slate-900 dark:text-white">Liên kết giao dịch</h3>
                        <button id="close-modal-btn" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <!-- Modal Body -->
                    <div class="p-6">
                        <!-- Transaction Details -->
                        <div id="modal-transaction-details" class="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-border-light dark:border-border-dark">
                            <!-- Will be filled dynamically -->
                        </div>

                        <!-- Customer Phone Input -->
                        <div class="mb-4">
                            <label for="customer-phone-input" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Số điện thoại khách hàng</label>
                            <input type="tel" id="customer-phone-input"
                                class="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                placeholder="Nhập số điện thoại...">
                        </div>

                        <!-- Auto Deposit Checkbox -->
                        <div class="mb-6 flex items-center gap-3">
                            <input type="checkbox" id="auto-deposit-checkbox"
                                class="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary cursor-pointer" checked>
                            <label for="auto-deposit-checkbox" class="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                Tự động nạp vào ví khách hàng
                            </label>
                        </div>

                        <!-- Action Buttons -->
                        <div class="flex justify-end gap-3">
                            <button id="cancel-link-btn" class="px-5 py-2.5 bg-white dark:bg-slate-700 border border-border-light dark:border-border-dark text-slate-700 dark:text-slate-200 rounded-xl font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                                Hủy
                            </button>
                            <button id="confirm-link-btn" class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl font-medium text-sm shadow-soft transition-all">
                                <span class="material-symbols-outlined text-lg">person_add</span>
                                Liên kết
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.tableBody = this.container.querySelector('#transaction-table-body');
        this.searchInput = this.container.querySelector('#search-input');
        this.dateFilterBtn = this.container.querySelector('#date-filter-btn');
        this.dateFilterDropdown = this.container.querySelector('#date-filter-dropdown');
        this.dateFilterLabel = this.container.querySelector('#date-filter-label');
        this.refreshBtn = this.container.querySelector('#refresh-btn');

        this.modal = this.container.querySelector('#link-transaction-modal');
        this.modalTransactionDetails = this.container.querySelector('#modal-transaction-details');
        this.customerPhoneInput = this.container.querySelector('#customer-phone-input');
        this.autoDepositCheckbox = this.container.querySelector('#auto-deposit-checkbox');
        this.cancelLinkBtn = this.container.querySelector('#cancel-link-btn');
        this.confirmLinkBtn = this.container.querySelector('#confirm-link-btn');
        this.closeModalBtn = this.container.querySelector('#close-modal-btn');

        // Date filter dropdown toggle
        this.dateFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dateFilterDropdown.classList.toggle('hidden');
        });

        // Date filter options
        this.container.querySelectorAll('.date-filter-option').forEach(option => {
            option.addEventListener('click', () => {
                this.selectedDays = option.dataset.days;
                this.dateFilterLabel.textContent = option.textContent;
                this.dateFilterDropdown.classList.add('hidden');
                this.currentPage = 1;
                this.loadUnlinkedTransactions();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            this.dateFilterDropdown.classList.add('hidden');
        });

        this.refreshBtn.addEventListener('click', () => {
            this.currentPage = 1;
            this.loadUnlinkedTransactions();
        });

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.currentPage = 1;
                this.loadUnlinkedTransactions();
            }
        });

        // Modal event listeners
        this.cancelLinkBtn.addEventListener('click', () => this.hideModal());
        this.closeModalBtn.addEventListener('click', () => this.hideModal());
        this.confirmLinkBtn.addEventListener('click', () => this.confirmLinkTransaction());

        // Close modal on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });

        this.loadUnlinkedTransactions();
    }

    async loadUnlinkedTransactions() {
        this.tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                        </div>
                        <p class="text-slate-500 dark:text-slate-400">Đang tải giao dịch...</p>
                    </div>
                </td>
            </tr>
        `;

        try {
            const response = await apiService.getUnlinkedBankTransactions(this.currentPage, this.limit);
            const data = response.data?.data || response.data || [];
            const total = response.data?.pagination?.total || data.length;

            if (response.success && data.length > 0) {
                this.totalItems = total;
                this.renderTransactions(data);
            } else {
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-12 text-center">
                            <div class="flex flex-col items-center">
                                <div class="w-12 h-12 rounded-full bg-success-light flex items-center justify-center mb-3">
                                    <span class="material-symbols-outlined text-success text-2xl">check_circle</span>
                                </div>
                                <p class="text-slate-700 dark:text-slate-200 font-medium">Hoàn thành!</p>
                                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Không có giao dịch chưa liên kết</p>
                            </div>
                        </td>
                    </tr>
                `;
                this.updatePagination(0);
            }
        } catch (error) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center">
                            <div class="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-3">
                                <span class="material-symbols-outlined text-danger text-2xl">error</span>
                            </div>
                            <p class="text-danger font-medium">Không thể tải giao dịch</p>
                            <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">${error.message}</p>
                        </div>
                    </td>
                </tr>
            `;
            console.error('Error loading unlinked transactions:', error);
        }
    }

    renderTransactions(transactions) {
        const icons = ['receipt_long', 'shopping_bag', 'move_to_inbox', 'payments', 'credit_card'];

        let html = '';
        transactions.forEach((tx, index) => {
            const icon = icons[index % icons.length];
            const dateStr = this.formatDate(tx.transaction_date);
            const bankCode = tx.bank_code || `TX-${tx.id}`;

            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="text-sm font-medium text-slate-700 dark:text-slate-300">${dateStr}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono font-medium text-slate-600 dark:text-slate-300 border border-border-light dark:border-border-dark">
                            ${bankCode}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right">
                        <span class="text-sm font-bold text-slate-900 dark:text-white font-mono">${this.formatCurrency(tx.amount)}</span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <span class="material-symbols-outlined text-base text-slate-400">${icon}</span>
                            <span class="truncate max-w-xs" title="${tx.description || ''}">${tx.description || 'N/A'}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right">
                        <button data-transaction-id="${tx.id}" data-transaction-amount="${tx.amount}" data-transaction-desc="${tx.description || ''}" data-transaction-date="${dateStr}"
                            class="link-transaction-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-white border border-primary/30 hover:border-primary rounded-lg transition-all">
                            <span class="material-symbols-outlined text-base">person_add</span>
                            Liên kết
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;

        // Add click handlers
        this.container.querySelectorAll('.link-transaction-btn').forEach(button => {
            button.addEventListener('click', (e) => this.showModal(e.currentTarget.dataset));
        });

        this.updatePagination(this.totalItems);
    }

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
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

        // Add event listeners
        paginationNav.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                this.loadUnlinkedTransactions();
            });
        });

        const prevBtn = paginationNav.querySelector('.prev-page');
        const nextBtn = paginationNav.querySelector('.next-page');

        if (prevBtn && this.currentPage > 1) {
            prevBtn.addEventListener('click', () => {
                this.currentPage--;
                this.loadUnlinkedTransactions();
            });
        }

        if (nextBtn && this.currentPage < totalPages) {
            nextBtn.addEventListener('click', () => {
                this.currentPage++;
                this.loadUnlinkedTransactions();
            });
        }
    }

    showModal(transactionData) {
        this.currentTransaction = transactionData;
        this.modalTransactionDetails.innerHTML = `
            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    <span class="text-sm text-slate-500 dark:text-slate-400">ID</span>
                    <span class="text-sm font-mono font-medium text-slate-900 dark:text-white">#${transactionData.transactionId}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-sm text-slate-500 dark:text-slate-400">Amount</span>
                    <span class="text-lg font-bold text-primary">${this.formatCurrency(transactionData.transactionAmount)}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-sm text-slate-500 dark:text-slate-400">Date</span>
                    <span class="text-sm text-slate-900 dark:text-white">${transactionData.transactionDate || 'N/A'}</span>
                </div>
                <div class="pt-3 border-t border-border-light dark:border-border-dark">
                    <span class="text-sm text-slate-500 dark:text-slate-400">Description</span>
                    <p class="text-sm text-slate-900 dark:text-white mt-1">${transactionData.transactionDesc || 'No description'}</p>
                </div>
            </div>
        `;
        this.customerPhoneInput.value = '';
        this.autoDepositCheckbox.checked = true;
        this.modal.classList.remove('hidden');
    }

    hideModal() {
        this.modal.classList.add('hidden');
        this.currentTransaction = null;
    }

    async confirmLinkTransaction() {
        const phone = this.customerPhoneInput.value.trim();
        const autoDeposit = this.autoDepositCheckbox.checked;

        if (!phone) {
            alert('Please enter a customer phone number.');
            return;
        }

        if (!this.currentTransaction || !this.currentTransaction.transactionId) {
            alert('No transaction selected.');
            return;
        }

        this.confirmLinkBtn.disabled = true;
        this.confirmLinkBtn.innerHTML = `
            <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            Linking...
        `;

        try {
            const response = await apiService.linkBankTransaction(
                parseInt(this.currentTransaction.transactionId),
                phone,
                autoDeposit
            );

            if (response.success) {
                alert('Transaction linked successfully!');
                this.hideModal();
                this.loadUnlinkedTransactions();

                if (this.onUpdateCallback) {
                    this.onUpdateCallback();
                }
            } else {
                alert('Error linking transaction: ' + response.error);
            }
        } catch (error) {
            alert('Error linking transaction: ' + error.message);
            console.error('Error linking transaction:', error);
        } finally {
            this.confirmLinkBtn.disabled = false;
            this.confirmLinkBtn.innerHTML = `
                <span class="material-symbols-outlined text-lg">person_add</span>
                Link
            `;
        }
    }
}
