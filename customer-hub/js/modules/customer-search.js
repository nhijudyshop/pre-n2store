// customer-hub/js/modules/customer-search.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class CustomerSearchModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.currentPage = 1;
        this.limit = 20;
        this.totalCustomers = 0;
        this.customers = [];
        this.isLoading = false;
        this.hasMore = true;
        this.isSearchMode = false; // false = recent customers, true = search results
        this.initUI();
    }

    initUI() {
        this.container.innerHTML = `
            <!-- Search Section - Modern Enterprise Style -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card p-6 mb-6">
                <div class="flex flex-col lg:flex-row gap-4 items-end">
                    <!-- Search Input with Icon -->
                    <div class="flex-1 w-full">
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tìm khách hàng</label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <span class="material-symbols-outlined text-slate-400 text-xl">search</span>
                            </div>
                            <input type="text" id="search-input"
                                class="w-full pl-12 pr-32 py-3 bg-slate-50 dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-full text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                placeholder="Tìm theo SĐT, tên hoặc email...">
                            <div class="absolute inset-y-0 right-2 flex items-center">
                                <select id="search-type" class="h-9 px-3 bg-white dark:bg-slate-700 border border-border-light dark:border-border-dark rounded-full text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                                    <option value="">Tất cả</option>
                                    <option value="phone">SĐT</option>
                                    <option value="name">Tên</option>
                                    <option value="email">Email</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Status Filter -->
                    <div class="w-full lg:w-48">
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Trạng thái</label>
                        <select id="status-filter" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                            <option value="">Tất cả</option>
                            <option value="Bình thường">Bình thường</option>
                            <option value="Bom hàng">Bom hàng</option>
                            <option value="Cảnh báo">Cảnh báo</option>
                            <option value="VIP">VIP</option>
                        </select>
                    </div>

                    <!-- Search Button -->
                    <button id="search-btn" class="w-full lg:w-auto px-8 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl shadow-soft hover:shadow-glow transition-all flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-xl">search</span>
                        Tìm kiếm
                    </button>
                </div>
            </div>

            <!-- Results Card -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                <!-- Card Header -->
                <div class="px-6 py-5 border-b border-border-light dark:border-border-dark flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h3 class="text-lg font-semibold text-slate-900 dark:text-white" id="list-title">Khách hàng gần đây</h3>
                        <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5" id="list-subtitle">Hiển thị khách hàng hoạt động gần nhất</p>
                    </div>
                    <button class="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors">
                        <span class="material-symbols-outlined text-lg">download</span>
                        Xuất file
                    </button>
                </div>

                <!-- Table Container with scroll -->
                <div id="table-container" class="overflow-x-auto custom-scrollbar max-h-[600px] overflow-y-auto">
                    <table class="w-full">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                            <tr>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Khách hàng</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">SĐT</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trạng thái</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hạng</th>
                                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hoạt động</th>
                                <th class="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody id="customer-table-body" class="divide-y divide-border-light dark:divide-border-dark">
                            <tr>
                                <td colspan="6" class="px-6 py-12 text-center">
                                    <div class="flex flex-col items-center">
                                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                                        </div>
                                        <p class="text-slate-500 dark:text-slate-400">Đang tải...</p>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Load More Indicator -->
                    <div id="load-more-indicator" class="hidden px-6 py-4 text-center">
                        <div class="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                            <span class="material-symbols-outlined text-xl animate-spin">progress_activity</span>
                            <span>Đang tải thêm...</span>
                        </div>
                    </div>
                </div>

                <!-- Footer with count -->
                <div id="pagination-container" class="px-6 py-4 border-t border-border-light dark:border-border-dark flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                        Hiển thị <span class="font-semibold text-slate-900 dark:text-white" id="showing-count">0</span> khách hàng
                        <span id="total-info" class="hidden">trên tổng <span class="font-semibold text-slate-900 dark:text-white" id="total-count">0</span></span>
                    </p>
                    <div id="scroll-hint" class="text-sm text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <span class="material-symbols-outlined text-base">keyboard_arrow_down</span>
                        Cuộn xuống để tải thêm
                    </div>
                </div>
            </div>
        `;

        this.searchInput = this.container.querySelector('#search-input');
        this.searchType = this.container.querySelector('#search-type');
        this.statusFilter = this.container.querySelector('#status-filter');
        this.searchBtn = this.container.querySelector('#search-btn');
        this.tableBody = this.container.querySelector('#customer-table-body');
        this.tableContainer = this.container.querySelector('#table-container');
        this.loadMoreIndicator = this.container.querySelector('#load-more-indicator');
        this.listTitle = this.container.querySelector('#list-title');
        this.listSubtitle = this.container.querySelector('#list-subtitle');
        this.scrollHint = this.container.querySelector('#scroll-hint');

        // Event listeners
        this.searchBtn.addEventListener('click', () => this.performSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Clear search and show recent when input is cleared
        this.searchInput.addEventListener('input', (e) => {
            if (e.target.value.trim() === '' && this.isSearchMode) {
                this.resetToRecent();
            }
        });

        // Infinite scroll
        this.tableContainer.addEventListener('scroll', () => this.handleScroll());

        // Initial load - show recent customers
        this.loadRecentCustomers();
    }

    handleScroll() {
        if (this.isLoading || !this.hasMore) return;

        const { scrollTop, scrollHeight, clientHeight } = this.tableContainer;
        // Load more when user scrolls to bottom (with 100px threshold)
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            this.loadMore();
        }
    }

    async loadMore() {
        if (this.isLoading || !this.hasMore) return;

        this.currentPage++;
        this.loadMoreIndicator.classList.remove('hidden');

        try {
            let response;
            if (this.isSearchMode) {
                const query = this.searchInput.value.trim();
                const searchType = this.searchType.value;
                const status = this.statusFilter.value;
                response = await apiService.searchCustomers(query, this.currentPage, this.limit, { searchType, status });
            } else {
                response = await apiService.getRecentCustomers(this.currentPage, this.limit);
            }

            if (response.success && response.data && response.data.length > 0) {
                this.customers = [...this.customers, ...response.data];
                this.appendResults(response.data);
                this.hasMore = response.data.length === this.limit;
            } else {
                this.hasMore = false;
            }
        } catch (error) {
            console.error('Load more error:', error);
            this.hasMore = false;
        } finally {
            this.loadMoreIndicator.classList.add('hidden');
            this.updateFooter();
        }
    }

    resetToRecent() {
        this.isSearchMode = false;
        this.currentPage = 1;
        this.customers = [];
        this.hasMore = true;
        this.listTitle.textContent = 'Khách hàng gần đây';
        this.listSubtitle.textContent = 'Hiển thị khách hàng hoạt động gần nhất';
        this.loadRecentCustomers();
    }

    async loadRecentCustomers() {
        this.isLoading = true;
        this.isSearchMode = false;
        this.currentPage = 1;
        this.customers = [];
        this.hasMore = true;

        this.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                        </div>
                        <p class="text-slate-500 dark:text-slate-400">Đang tải khách hàng gần đây...</p>
                    </div>
                </td>
            </tr>
        `;

        try {
            const response = await apiService.getRecentCustomers(1, this.limit);
            if (response.success && response.data && response.data.length > 0) {
                this.customers = response.data;
                this.totalCustomers = response.pagination?.total || response.data.length;
                this.hasMore = response.data.length === this.limit;
                this.renderResults(response.data);
            } else {
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-12 text-center">
                            <div class="flex flex-col items-center">
                                <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                                    <span class="material-symbols-outlined text-slate-400 text-2xl">group</span>
                                </div>
                                <p class="text-slate-500 dark:text-slate-400">Chưa có khách hàng</p>
                                <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Khách hàng sẽ xuất hiện ở đây khi được thêm vào</p>
                            </div>
                        </td>
                    </tr>
                `;
                this.hasMore = false;
            }
        } catch (error) {
            console.error('Load recent customers error:', error);
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center">
                            <div class="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4">
                                <span class="material-symbols-outlined text-warning text-3xl">engineering</span>
                            </div>
                            <p class="text-lg font-medium text-warning mb-1">Đang tải khách hàng</p>
                            <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">API đang được phát triển. Hãy thử tìm kiếm.</p>
                        </div>
                    </td>
                </tr>
            `;
            this.hasMore = false;
        } finally {
            this.isLoading = false;
            this.updateFooter();
        }
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        const searchType = this.searchType.value;
        const status = this.statusFilter.value;

        // If query is empty, show recent customers
        if (query.length < 2) {
            if (query.length === 0) {
                this.resetToRecent();
            } else {
                // Show hint for minimum characters
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-12 text-center">
                            <div class="flex flex-col items-center">
                                <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                    <span class="material-symbols-outlined text-primary text-3xl">person_search</span>
                                </div>
                                <p class="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">Tiếp tục nhập...</p>
                                <p class="text-sm text-slate-500 dark:text-slate-400">Nhập ít nhất 2 ký tự để tìm kiếm</p>
                            </div>
                        </td>
                    </tr>
                `;
                this.updateFooter();
            }
            return;
        }

        this.isLoading = true;
        this.isSearchMode = true;
        this.currentPage = 1;
        this.customers = [];
        this.hasMore = true;

        this.listTitle.textContent = 'Kết quả tìm kiếm';
        this.listSubtitle.textContent = `Tìm kiếm "${query}"`;

        this.tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <span class="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
                        </div>
                        <p class="text-slate-500 dark:text-slate-400">Đang tìm kiếm...</p>
                    </div>
                </td>
            </tr>
        `;

        try {
            const response = await apiService.searchCustomers(query, this.currentPage, this.limit, { searchType, status });
            if (response.success && response.data && response.data.length > 0) {
                this.customers = response.data;
                this.totalCustomers = response.pagination?.total || response.data.length;
                this.hasMore = response.data.length === this.limit;
                this.renderResults(response.data);
            } else {
                this.tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-6 py-12 text-center">
                            <div class="flex flex-col items-center">
                                <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                                    <span class="material-symbols-outlined text-slate-400 text-2xl">search_off</span>
                                </div>
                                <p class="text-slate-500 dark:text-slate-400">Không tìm thấy khách hàng</p>
                                <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Thử điều chỉnh tiêu chí tìm kiếm</p>
                            </div>
                        </td>
                    </tr>
                `;
                this.hasMore = false;
            }
        } catch (error) {
            console.error('Customer search error:', error);
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center">
                            <div class="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-3">
                                <span class="material-symbols-outlined text-danger text-2xl">error</span>
                            </div>
                            <p class="text-danger font-medium">Lỗi tìm kiếm</p>
                            <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">${error.message}</p>
                        </div>
                    </td>
                </tr>
            `;
            this.hasMore = false;
        } finally {
            this.isLoading = false;
            this.updateFooter();
        }
    }

    renderResults(customers) {
        this.tableBody.innerHTML = this.generateRowsHtml(customers);
    }

    appendResults(customers) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<table><tbody>${this.generateRowsHtml(customers, this.customers.length - customers.length)}</tbody></table>`;
        const newRows = tempDiv.querySelector('tbody').children;
        while (newRows.length > 0) {
            this.tableBody.appendChild(newRows[0]);
        }
    }

    generateRowsHtml(customers, startIndex = 0) {
        const avatarColors = [
            { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
            { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
            { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' },
            { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
            { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' },
            { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-400' },
        ];

        let html = '';
        customers.forEach((customer, index) => {
            const colorIndex = (startIndex + index) % avatarColors.length;
            const color = avatarColors[colorIndex];
            const initials = this.getInitials(customer.name || 'CU');
            const statusBadge = this.getStatusBadge(customer.status);
            const tierInfo = this.getTierInfo(customer.tier);
            const lastActivity = this.formatLastActivity(customer.last_activity || customer.updated_at);

            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full ${color.bg} ${color.text} flex items-center justify-center font-semibold text-sm flex-shrink-0">
                                ${initials}
                            </div>
                            <div>
                                <p class="font-medium text-slate-900 dark:text-white group-hover:text-primary transition-colors">${customer.name || 'Chưa có tên'}</p>
                                <p class="text-xs text-slate-500 dark:text-slate-400">ID: #${customer.id || 'N/A'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <span class="material-symbols-outlined text-base text-slate-400">call</span>
                            ${customer.phone || 'N/A'}
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        ${statusBadge}
                    </td>
                    <td class="px-6 py-4">
                        ${tierInfo}
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        ${lastActivity}
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="window.openCustomerModal('${customer.phone}')"
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-white border border-primary/30 hover:border-primary rounded-lg transition-all">
                            <span class="material-symbols-outlined text-base">visibility</span>
                            Xem
                        </button>
                    </td>
                </tr>
            `;
        });

        return html;
    }

    updateFooter() {
        const showingCount = this.container.querySelector('#showing-count');
        const totalInfo = this.container.querySelector('#total-info');
        const totalCount = this.container.querySelector('#total-count');

        showingCount.textContent = this.customers.length;

        if (this.totalCustomers > this.customers.length) {
            totalInfo.classList.remove('hidden');
            totalCount.textContent = this.totalCustomers;
        } else {
            totalInfo.classList.add('hidden');
        }

        // Show/hide scroll hint
        if (this.hasMore && this.customers.length > 0) {
            this.scrollHint.classList.remove('hidden');
        } else {
            this.scrollHint.classList.add('hidden');
        }
    }

    getInitials(name) {
        if (!name) return 'CU';
        const words = name.trim().split(' ');
        if (words.length >= 2) {
            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    getStatusBadge(status) {
        const statusLower = (status || 'active').toLowerCase();
        const statusMap = {
            'active': { bg: 'bg-success-light', text: 'text-success', label: 'Active' },
            'inactive': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', label: 'Inactive' },
            'pending': { bg: 'bg-warning-light', text: 'text-warning', label: 'Pending' },
            'vip': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400', label: 'VIP' },
        };
        const s = statusMap[statusLower] || statusMap['active'];
        return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}">${s.label}</span>`;
    }

    getTierInfo(tier) {
        const tierLower = (tier || 'new').toLowerCase();
        const tierMap = {
            'platinum': { icon: 'diamond', color: 'text-purple-500', label: 'Platinum' },
            'gold': { icon: 'star', color: 'text-amber-500', label: 'Gold' },
            'silver': { icon: 'star_half', color: 'text-slate-400', label: 'Silver' },
            'bronze': { icon: 'star_outline', color: 'text-orange-500', label: 'Bronze' },
            'new': { icon: 'person', color: 'text-slate-400', label: 'New' },
        };
        const t = tierMap[tierLower] || tierMap['new'];
        return `
            <div class="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                <span class="material-symbols-outlined text-lg ${t.color}" style="font-variation-settings: 'FILL' 1;">${t.icon}</span>
                ${t.label}
            </div>
        `;
    }

    formatLastActivity(dateStr) {
        if (!dateStr) return 'N/A';

        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} mins ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    render() {
        // The UI is initialized in the constructor
    }
}
