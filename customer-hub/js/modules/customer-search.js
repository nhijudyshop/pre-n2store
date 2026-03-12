// customer-hub/js/modules/customer-search.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

const STATUS_COLORS = {
    'Bình thường': '#22c55e',
    'Bom hàng': '#ef4444',
    'Cảnh báo': '#f59e0b',
    'Nguy hiểm': '#dc2626',
    'VIP': '#6366f1'
};

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
        this._tposModalEl = null;
        this.initUI();
    }

    initUI() {
        this.container.innerHTML = `
            <!-- Combined Search and Results Card -->
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-card overflow-hidden">
                <!-- Search Bar -->
                <div class="px-4 py-3 border-b border-border-light dark:border-border-dark">
                    <div class="flex gap-3 items-center">
                        <input type="text" id="search-input"
                            class="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                            placeholder="Nhập SĐT, tên hoặc email... (Enter để tìm)">
                        <select id="search-type" class="h-9 px-3 bg-white dark:bg-slate-700 border border-border-light dark:border-border-dark rounded-lg text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                            <option value="">Tất cả</option>
                            <option value="phone">SĐT</option>
                            <option value="name">Tên</option>
                            <option value="email">Email</option>
                        </select>
                        <select id="status-filter" class="h-9 px-3 bg-white dark:bg-slate-700 border border-border-light dark:border-border-dark rounded-lg text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                            <option value="">Tất cả trạng thái</option>
                            <option value="Bình thường">Bình thường</option>
                            <option value="Bom hàng">Bom hàng</option>
                            <option value="Cảnh báo">Cảnh báo</option>
                            <option value="Nguy hiểm">Nguy hiểm</option>
                            <option value="VIP">VIP</option>
                        </select>
                        <button id="btn-create-customer"
                            class="h-9 px-4 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 whitespace-nowrap">
                            <span class="material-symbols-outlined text-base">person_add</span>
                            Tạo KH
                        </button>
                    </div>
                </div>

                <!-- Create Customer Modal is now handled by shared CustomerCreator module -->

                <!-- Hidden elements for compatibility -->
                <span id="list-title" class="hidden">Khách hàng gần đây</span>
                <span id="list-subtitle" class="hidden">Hiển thị khách hàng hoạt động gần nhất</span>

                <!-- Table Container with scroll -->
                <div id="table-container" class="overflow-x-auto custom-scrollbar overflow-y-auto" style="max-height: calc(100vh - 180px);">
                    <table class="w-full">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Khách hàng</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trạng thái</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ví khách hàng</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Địa chỉ</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ghi chú</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody id="customer-table-body" class="divide-y divide-border-light dark:divide-border-dark">
                            <tr>
                                <td colspan="6" class="px-4 py-12 text-center">
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
                    <div id="load-more-indicator" class="hidden px-4 py-4 text-center">
                        <div class="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                            <span class="material-symbols-outlined text-xl animate-spin">progress_activity</span>
                            <span>Đang tải thêm...</span>
                        </div>
                    </div>
                </div>

                <!-- Footer with count -->
                <div id="pagination-container" class="px-4 py-2 border-t border-border-light dark:border-border-dark flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
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
        this.tableBody = this.container.querySelector('#customer-table-body');
        this.tableContainer = this.container.querySelector('#table-container');
        this.loadMoreIndicator = this.container.querySelector('#load-more-indicator');
        this.listTitle = this.container.querySelector('#list-title');
        this.listSubtitle = this.container.querySelector('#list-subtitle');
        this.scrollHint = this.container.querySelector('#scroll-hint');

        // Event listeners - Enter to search
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

        // Filter change triggers search
        this.statusFilter.addEventListener('change', () => {
            if (this.searchInput.value.trim() !== '' || this.statusFilter.value !== '') {
                this.performSearch();
            }
        });

        // Infinite scroll
        this.tableContainer.addEventListener('scroll', () => this.handleScroll());

        // Create customer button — uses shared CustomerCreator module
        const btnCreate = this.container.querySelector('#btn-create-customer');
        btnCreate.addEventListener('click', () => {
            if (window.CustomerCreator) {
                window.CustomerCreator.open({
                    onSuccess: (customer) => {
                        // Add new/selected customer to table immediately
                        const newCustomer = {
                            id: customer.id || null,
                            name: customer.name,
                            phone: customer.phone,
                            address: customer.address || '',
                            status: customer.status || 'Bình thường',
                            balance: 0,
                            virtual_balance: 0,
                            real_balance: 0,
                            notes: []
                        };
                        this.customers.unshift(newCustomer);
                        this.prependRow(newCustomer);
                        this.updateFooter();
                    }
                });
            } else {
                console.error('[CustomerSearch] CustomerCreator module not loaded');
            }
        });

        // Listen for wallet updates from profile modal → refresh wallet in search list
        window.addEventListener('wallet-updated', async (e) => {
            const phone = e.detail?.phone;
            if (!phone || this.customers.length === 0) return;

            const customer = this.customers.find(c => c.phone === phone);
            if (!customer) return;

            console.log('[CustomerSearch] Wallet updated for', phone, '- refreshing balance');
            try {
                const walletData = await apiService.getWalletBatch([phone]);
                if (!walletData || !walletData[phone]) return;

                const wallet = walletData[phone];
                customer.balance = wallet.total !== undefined ? wallet.total : (wallet.balance || 0);
                customer.virtual_balance = wallet.virtualBalance !== undefined ? wallet.virtualBalance : 0;
                customer.real_balance = wallet.balance !== undefined ? wallet.balance : 0;

                this.renderResults(this.customers);
                console.log('[CustomerSearch] Wallet balance refreshed for', phone);
            } catch (err) {
                console.warn('[CustomerSearch] Failed to refresh wallet after update:', err);
            }
        });

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
                await this.enrichCustomersWithWallet(response.data);
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
                await this.enrichCustomersWithWallet(response.data);
                this.renderResults(response.data);

                // Auto-enrich incomplete customers from TPOS (runs in background)
                this.enrichCustomersFromTPOS(response.data);
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

    /**
     * Check if query looks like a phone number (digits only, 6+ chars)
     */
    _isPhoneQuery(query) {
        const digits = query.replace(/\D/g, '');
        return digits.length >= 6 && digits === query.replace(/[\s\-\+]/g, '').replace(/^(\+84|84)/, '0');
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
            // Search local v2 API
            const response = await apiService.searchCustomers(query, this.currentPage, this.limit, { searchType, status });
            const hasLocalResults = response.success && response.data && response.data.length > 0;

            if (hasLocalResults) {
                this.customers = response.data;
                this.totalCustomers = response.pagination?.total || response.data.length;
                this.hasMore = response.data.length === this.limit;
                await this.enrichCustomersWithWallet(response.data);
                this.renderResults(response.data);

                // Auto-enrich incomplete customers from TPOS (runs in background)
                this.enrichCustomersFromTPOS(response.data);
            }

            // If query looks like a phone number (6+ digits), also search TPOS
            const digits = query.replace(/\D/g, '');
            if (digits.length >= 6 && (searchType === '' || searchType === 'phone') && window.fetchTPOSCustomer) {
                // Only call TPOS with full 10-digit phone
                if (digits.length >= 10) {
                    const phone = digits.substring(0, 11); // max 11 digits
                    console.log('[CustomerSearch] Also searching TPOS for phone:', phone);

                    try {
                        const tposResult = await window.fetchTPOSCustomer(phone);
                        if (tposResult.success && tposResult.count > 0) {
                            // Filter out TPOS customers that already exist locally
                            const localPhones = new Set((response.data || []).map(c => c.phone));
                            const newFromTpos = tposResult.customers.filter(c => !localPhones.has(c.phone));

                            if (newFromTpos.length > 0) {
                                console.log('[CustomerSearch] Found', newFromTpos.length, 'TPOS customer(s) not in local DB');
                                this._showTPOSSelectionModal(newFromTpos);
                            }

                            // Also update existing local customers with incomplete data from TPOS
                            if (hasLocalResults) {
                                for (const tposCustomer of tposResult.customers) {
                                    const localCustomer = (response.data || []).find(c => c.phone === tposCustomer.phone);
                                    if (!localCustomer) continue;

                                    const hasDefaultName = !localCustomer.name || localCustomer.name === 'Khách hàng mới';
                                    const missingAddress = !localCustomer.address;
                                    const missingTposId = !localCustomer.tpos_id;

                                    if (hasDefaultName || missingAddress || missingTposId) {
                                        const updates = {};
                                        if (hasDefaultName && tposCustomer.name && tposCustomer.name !== 'Khách hàng mới') {
                                            updates.name = tposCustomer.name;
                                        }
                                        if (missingAddress && tposCustomer.address) {
                                            updates.address = tposCustomer.address;
                                        }
                                        if (missingTposId && tposCustomer.id) {
                                            updates.tpos_id = tposCustomer.id;
                                        }

                                        if (Object.keys(updates).length > 0) {
                                            Object.assign(localCustomer, updates);
                                            // Update local DB in background
                                            apiService.upsertCustomer({
                                                phone: localCustomer.phone,
                                                name: updates.name || localCustomer.name,
                                                address: updates.address || localCustomer.address || '',
                                                status: localCustomer.status || 'Bình thường',
                                                tpos_id: updates.tpos_id || localCustomer.tpos_id
                                            }).then(() => {
                                                console.log('[CustomerSearch] Updated incomplete customer from TPOS:', localCustomer.phone, updates);
                                            }).catch(err => {
                                                console.warn('[CustomerSearch] Failed to update customer from TPOS:', err);
                                            });
                                        }
                                    }
                                }
                                // Re-render with updated data
                                this.renderResults(this.customers);
                            }
                        }
                    } catch (tposErr) {
                        console.warn('[CustomerSearch] TPOS lookup failed:', tposErr);
                    }
                }

                if (!hasLocalResults) {
                    if (digits.length < 10) {
                        // Phone too short for TPOS, show hint
                        this.tableBody.innerHTML = `
                            <tr>
                                <td colspan="6" class="px-6 py-12 text-center">
                                    <div class="flex flex-col items-center">
                                        <div class="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mb-3">
                                            <span class="material-symbols-outlined text-amber-500 text-2xl">phone_iphone</span>
                                        </div>
                                        <p class="text-slate-500 dark:text-slate-400">Không tìm thấy trong hệ thống</p>
                                        <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">Nhập đủ 10 số để tìm trên TPOS</p>
                                    </div>
                                </td>
                            </tr>
                        `;
                        this.hasMore = false;
                    }
                    // If 10+ digits but no TPOS results either, show not found below
                }
            }

            if (!hasLocalResults && !(digits.length >= 6 && digits.length < 10)) {
                // No results from either source
                if (this.customers.length === 0) {
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

    // ═══════════════════════════════════════════════════════════════
    // TPOS Customer Selection Modal
    // ═══════════════════════════════════════════════════════════════

    _ensureTPOSModal() {
        if (this._tposModalEl) return;

        const style = document.createElement('style');
        style.textContent = `
            .tpos-modal { position: fixed; inset: 0; z-index: 10001; display: none; }
            .tpos-modal.show { display: block; }
            .tpos-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,0.5); backdrop-filter: blur(2px); }
            .tpos-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; }
            .tpos-dialog { background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 640px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; }
            .tpos-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
            .tpos-header h3 { font-size: 16px; font-weight: 600; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px; }
            .tpos-header h3 .material-symbols-outlined { color: #f59e0b; }
            .tpos-close { background: none; border: none; font-size: 22px; color: #9ca3af; cursor: pointer; }
            .tpos-close:hover { color: #374151; }
            .tpos-body { padding: 0; overflow-y: auto; flex: 1; }
            .tpos-info { padding: 12px 20px; background: #fffbeb; border-bottom: 1px solid #fef3c7; font-size: 13px; color: #92400e; display: flex; align-items: center; gap: 8px; }
            .tpos-table { width: 100%; border-collapse: collapse; }
            .tpos-table thead { background: #f8fafc; position: sticky; top: 0; z-index: 1; }
            .tpos-table th { padding: 10px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
            .tpos-table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
            .tpos-table tr.tpos-row { cursor: pointer; transition: background 0.15s; }
            .tpos-table tr.tpos-row:hover { background: #f0f9ff; }
            .tpos-customer-name { font-weight: 600; color: #1e293b; }
            .tpos-customer-phone { color: #64748b; font-size: 12px; }
            .tpos-customer-address { color: #94a3b8; font-size: 12px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .tpos-status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #fff; }
            .tpos-btn-save { padding: 4px 12px; font-size: 12px; font-weight: 500; color: #fff; background: #3b82f6; border: none; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: background 0.2s; }
            .tpos-btn-save:hover { background: #2563eb; }
            .tpos-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
            .tpos-btn-save.saved { background: #22c55e; }
            .tpos-footer { padding: 12px 20px; border-top: 1px solid #e5e7eb; text-align: right; }
            .tpos-btn-close { padding: 8px 16px; font-size: 13px; font-weight: 500; color: #6b7280; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; }
        `;
        document.head.appendChild(style);

        this._tposModalEl = document.createElement('div');
        this._tposModalEl.className = 'tpos-modal';
        this._tposModalEl.innerHTML = `
            <div class="tpos-backdrop"></div>
            <div class="tpos-center">
                <div class="tpos-dialog">
                    <div class="tpos-header">
                        <h3><span class="material-symbols-outlined">cloud_download</span> Khách hàng tìm thấy trên TPOS</h3>
                        <button class="tpos-close" data-tpos-close>×</button>
                    </div>
                    <div class="tpos-info">
                        <span class="material-symbols-outlined" style="font-size:18px;">info</span>
                        Những khách hàng này có trên TPOS nhưng chưa được lưu trên web. Bấm "Lưu" để thêm vào hệ thống.
                    </div>
                    <div class="tpos-body">
                        <table class="tpos-table">
                            <thead>
                                <tr>
                                    <th>Khách hàng</th>
                                    <th>Trạng thái</th>
                                    <th>Địa chỉ</th>
                                    <th style="text-align:right;">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody id="tpos-table-body"></tbody>
                        </table>
                    </div>
                    <div class="tpos-footer">
                        <button class="tpos-btn-close" data-tpos-close>Đóng</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this._tposModalEl);

        // Close handlers
        this._tposModalEl.querySelectorAll('[data-tpos-close]').forEach(btn => {
            btn.addEventListener('click', () => this._closeTPOSModal());
        });
        this._tposModalEl.querySelector('.tpos-backdrop').addEventListener('click', () => this._closeTPOSModal());
    }

    _showTPOSSelectionModal(tposCustomers) {
        this._ensureTPOSModal();

        const tbody = this._tposModalEl.querySelector('#tpos-table-body');
        let html = '';

        tposCustomers.forEach((c, idx) => {
            const color = STATUS_COLORS[c.statusText] || '#6b7280';
            const escapedName = this._escapeHtml(c.name);
            const escapedPhone = this._escapeHtml(c.phone || '');
            const escapedAddress = this._escapeHtml(c.address || '');
            const escapedStatus = this._escapeHtml(c.statusText || 'N/A');

            html += `
                <tr class="tpos-row" data-tpos-idx="${idx}">
                    <td>
                        <div class="tpos-customer-name">${escapedName}</div>
                        <div class="tpos-customer-phone">${escapedPhone} · ID: ${c.id || 'N/A'}</div>
                    </td>
                    <td>
                        <span class="tpos-status-badge" style="background:${color}">${escapedStatus}</span>
                    </td>
                    <td>
                        <div class="tpos-customer-address" title="${escapedAddress}">${escapedAddress || '-'}</div>
                    </td>
                    <td style="text-align:right;">
                        <button class="tpos-btn-save" data-tpos-save="${idx}">
                            <span class="material-symbols-outlined" style="font-size:14px;">save</span>
                            Lưu
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Bind save buttons
        tbody.querySelectorAll('[data-tpos-save]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.tposSave);
                await this._saveTPOSCustomer(tposCustomers[idx], btn);
            });
        });

        // Bind row click (same as save)
        tbody.querySelectorAll('.tpos-row').forEach(row => {
            row.addEventListener('click', async () => {
                const idx = parseInt(row.dataset.tposIdx);
                const btn = row.querySelector('[data-tpos-save]');
                if (!btn.disabled) {
                    await this._saveTPOSCustomer(tposCustomers[idx], btn);
                }
            });
        });

        this._tposModalEl.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    _closeTPOSModal() {
        if (!this._tposModalEl) return;
        this._tposModalEl.classList.remove('show');
        document.body.style.overflow = '';
    }

    async _saveTPOSCustomer(tposCustomer, btnEl) {
        // Disable button, show saving state
        btnEl.disabled = true;
        btnEl.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;animation:spin 1s linear infinite;">progress_activity</span> Đang lưu...';

        try {
            // Save to v2 API via upsertCustomer
            const saved = await apiService.upsertCustomer({
                phone: tposCustomer.phone,
                name: tposCustomer.name,
                address: tposCustomer.address || '',
                status: tposCustomer.statusText || 'Bình thường'
            });

            console.log('[CustomerSearch] Saved TPOS customer to v2:', saved);

            // Update button to "Saved"
            btnEl.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> Đã lưu';
            btnEl.classList.add('saved');

            // Add to table immediately
            const newCustomer = {
                id: saved?.id || tposCustomer.id,
                name: tposCustomer.name,
                phone: tposCustomer.phone,
                address: tposCustomer.address || '',
                status: tposCustomer.statusText || 'Bình thường',
                balance: 0,
                virtual_balance: 0,
                real_balance: 0,
                notes: []
            };
            this.customers.unshift(newCustomer);
            this.prependRow(newCustomer);
            this.updateFooter();

        } catch (error) {
            console.error('[CustomerSearch] Failed to save TPOS customer:', error);
            btnEl.disabled = false;
            btnEl.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">error</span> Lỗi - Thử lại';
        }
    }

    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    renderResults(customers) {
        this.tableBody.innerHTML = this.generateRowsHtml(customers);
    }

    prependRow(customer) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `<table><tbody>${this.generateRowsHtml([customer])}</tbody></table>`;
        const newRow = tempDiv.querySelector('tbody').firstElementChild;
        if (newRow) {
            newRow.classList.add('bg-green-50', 'dark:bg-green-900/10');
            this.tableBody.insertBefore(newRow, this.tableBody.firstChild);
            // Remove highlight after 3s
            setTimeout(() => {
                newRow.classList.remove('bg-green-50', 'dark:bg-green-900/10');
            }, 3000);
        }
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
        let html = '';
        customers.forEach((customer, index) => {
            const statusBadge = this.getStatusBadge(customer.status);
            // Format debt info - balance (số dư ví), virtual and real balance
            // balance = số dư khả dụng từ API, fallback = virtual + real
            const virtualBalance = customer.virtual_balance || 0;
            const realBalance = customer.real_balance || 0;
            const balance = customer.balance !== undefined ? customer.balance : (virtualBalance + realBalance);
            const debtInfo = this.formatDebt(balance, virtualBalance, realBalance);
            // Format address - truncate if too long
            const address = this.truncateText(customer.address || '', 30);
            // Format notes - join with | separator
            const notes = this.formatNotes(customer.notes || []);

            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td class="px-4 py-3">
                        <div>
                            <p class="font-medium text-slate-900 dark:text-white group-hover:text-primary transition-colors">${customer.name || 'Chưa có tên'}</p>
                            <p class="text-xs text-slate-500 dark:text-slate-400">${customer.phone || 'N/A'}</p>
                        </div>
                    </td>
                    <td class="px-4 py-3">
                        ${statusBadge}
                    </td>
                    <td class="px-4 py-3">
                        ${debtInfo}
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-600 dark:text-slate-300" title="${customer.address || ''}">
                        ${address || '-'}
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-[200px]" title="${(customer.notes || []).map(n => n.content).join(' | ')}">
                        <div class="truncate">${notes || '-'}</div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <div class="inline-flex items-center gap-1.5">
                            <button onclick="window._customerSearchModule._openEditModal('${customer.phone}')"
                                class="inline-flex items-center gap-1 px-2 py-1 text-sm font-medium text-amber-600 hover:bg-amber-500 hover:text-white border border-amber-300 hover:border-amber-500 rounded-lg transition-all"
                                title="Chỉnh sửa thông tin">
                                <span class="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button onclick="window.openCustomerModal('${customer.phone}')"
                                class="inline-flex items-center gap-1 px-2.5 py-1 text-sm font-medium text-primary hover:bg-primary hover:text-white border border-primary/30 hover:border-primary rounded-lg transition-all">
                                <span class="material-symbols-outlined text-base">visibility</span>
                                Xem
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        return html;
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    formatDebt(balance, virtual, real) {
        const formatNum = (num) => {
            if (num === 0) return '0';
            // Làm tròn số nguyên, dùng dấu . phân cách hàng nghìn
            return Math.round(num).toLocaleString('de-DE');
        };
        // Số dư khả dụng = balance (tổng tiền trong ví có thể dùng để khấu trừ)
        const balanceClass = balance > 0 ? 'text-green-600 dark:text-green-400' : balance < 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-600 dark:text-slate-300';
        return `
            <div class="text-sm">
                <div class="${balanceClass} font-semibold text-base">${formatNum(balance)}</div>
                <div class="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Ảo: ${formatNum(virtual)} | Thực: ${formatNum(real)}</div>
            </div>
        `;
    }

    formatNotes(notes) {
        if (!notes || notes.length === 0) return '';
        // Get content from each note and join with |
        return notes.map(n => n.content || n).join(' | ');
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
        // Map status to colors based on image reference
        // Bình thường: green, Bom hàng: red, Cảnh báo: yellow/amber, Nguy hiểm: dark red, VIP: purple
        const statusLower = (status || 'Bình thường').toLowerCase();
        const statusMap = {
            'bình thường': { bg: 'bg-green-500', text: 'text-white', label: 'Bình thường' },
            'bom hàng': { bg: 'bg-red-500', text: 'text-white', label: 'Bom hàng' },
            'cảnh báo': { bg: 'bg-amber-500', text: 'text-white', label: 'Cảnh báo' },
            'nguy hiểm': { bg: 'bg-red-800', text: 'text-white', label: 'Nguy hiểm' },
            'vip': { bg: 'bg-purple-500', text: 'text-white', label: 'VIP' },
            // Fallback for old statuses
            'active': { bg: 'bg-green-500', text: 'text-white', label: 'Bình thường' },
            'inactive': { bg: 'bg-slate-400', text: 'text-white', label: 'Không hoạt động' },
            'pending': { bg: 'bg-amber-500', text: 'text-white', label: 'Chờ xử lý' },
        };
        const s = statusMap[statusLower] || statusMap['bình thường'];
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}">${s.label}</span>`;
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

        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    /**
     * Auto-enrich incomplete customers from TPOS
     * If a customer has default name ("Khách hàng mới") or missing address/tpos_id,
     * look up TPOS and update local DB + UI
     */
    async enrichCustomersFromTPOS(customers) {
        if (!window.fetchTPOSCustomer) return;

        // Find customers that need enrichment
        const needsEnrichment = customers.filter(c => {
            if (!c.phone) return false;
            const digits = c.phone.replace(/\D/g, '');
            if (digits.length < 10) return false;
            const hasDefaultName = !c.name || c.name === 'Khách hàng mới';
            const missingAddress = !c.address;
            const missingTposId = !c.tpos_id;
            return hasDefaultName || (missingAddress && missingTposId);
        });

        if (needsEnrichment.length === 0) return;

        console.log('[CustomerSearch] Enriching', needsEnrichment.length, 'customer(s) from TPOS');

        // Lookup TPOS for each incomplete customer (in parallel, max 5)
        const enrichPromises = needsEnrichment.map(async (customer) => {
            try {
                const tposResult = await window.fetchTPOSCustomer(customer.phone);
                if (!tposResult.success || tposResult.count === 0) return null;

                // Find matching TPOS customer by phone
                const tposMatch = tposResult.customers.find(tc => tc.phone === customer.phone);
                if (!tposMatch) return null;

                // Check if TPOS has better data
                const hasDefaultName = !customer.name || customer.name === 'Khách hàng mới';
                const updates = {};
                let hasUpdates = false;

                if (hasDefaultName && tposMatch.name && tposMatch.name !== 'Khách hàng mới') {
                    updates.name = tposMatch.name;
                    hasUpdates = true;
                }
                if (!customer.address && tposMatch.address) {
                    updates.address = tposMatch.address;
                    hasUpdates = true;
                }
                if (!customer.tpos_id && tposMatch.id) {
                    updates.tpos_id = tposMatch.id;
                    hasUpdates = true;
                }

                if (!hasUpdates) return null;

                // Update local DB
                const upsertData = {
                    phone: customer.phone,
                    name: updates.name || customer.name,
                    address: updates.address || customer.address || '',
                    status: customer.status || tposMatch.statusText || 'Bình thường',
                    tpos_id: updates.tpos_id || customer.tpos_id
                };
                await apiService.upsertCustomer(upsertData);
                console.log('[CustomerSearch] Enriched customer from TPOS:', customer.phone, updates);

                return { customer, updates };
            } catch (err) {
                console.warn('[CustomerSearch] TPOS enrichment failed for', customer.phone, err);
                return null;
            }
        });

        const results = await Promise.all(enrichPromises);

        // Update in-memory data and re-render affected rows
        let hasChanges = false;
        for (const result of results) {
            if (!result) continue;
            const { customer, updates } = result;
            Object.assign(customer, updates);
            hasChanges = true;
        }

        if (hasChanges) {
            console.log('[CustomerSearch] Re-rendering with TPOS-enriched data');
            this.renderResults(this.customers);
        }
    }

    async enrichCustomersWithWallet(customers) {
        try {
            const phones = customers.map(c => c.phone).filter(Boolean);
            if (phones.length === 0) return;

            const walletData = await apiService.getWalletBatch(phones);
            if (!walletData) return;

            for (const customer of customers) {
                if (!customer.phone) continue;
                const wallet = walletData[customer.phone];
                if (!wallet) continue;
                customer.balance = wallet.total !== undefined ? wallet.total : (wallet.balance || 0);
                customer.virtual_balance = wallet.virtualBalance !== undefined ? wallet.virtualBalance : 0;
                customer.real_balance = wallet.balance !== undefined ? wallet.balance : 0;
            }
        } catch (error) {
            console.warn('[CustomerSearch] Failed to enrich wallet data:', error);
        }
    }


    // openCreateModal, closeCreateModal, submitCreateCustomer
    // => Moved to shared/js/customer-creator.js (window.CustomerCreator)

    // ═══════════════════════════════════════════════════════════════
    // Edit Customer Modal
    // ═══════════════════════════════════════════════════════════════

    _ensureEditModal() {
        if (this._editModalEl) return;

        const style = document.createElement('style');
        style.textContent = `
            .ce-modal { position: fixed; inset: 0; z-index: 10001; display: none; }
            .ce-modal.show { display: block; }
            .ce-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,0.5); backdrop-filter: blur(2px); }
            .ce-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; }
            .ce-dialog { background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 440px; overflow: hidden; }
            .dark .ce-dialog { background: #1e293b; }
            .ce-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
            .dark .ce-header { border-color: #334155; }
            .ce-header h3 { font-size: 16px; font-weight: 600; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px; }
            .dark .ce-header h3 { color: #f1f5f9; }
            .ce-header h3 .material-symbols-outlined { color: #f59e0b; }
            .ce-close { background: none; border: none; font-size: 22px; color: #9ca3af; cursor: pointer; }
            .ce-close:hover { color: #374151; }
            .ce-body { padding: 20px; }
            .ce-field { margin-bottom: 14px; }
            .ce-field label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 5px; }
            .dark .ce-field label { color: #cbd5e1; }
            .ce-field input, .ce-field select { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; }
            .dark .ce-field input, .dark .ce-field select { background: #0f172a; border-color: #475569; color: #f1f5f9; }
            .ce-field input:focus, .ce-field select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
            .ce-field input:read-only { background: #f8fafc; color: #94a3b8; cursor: not-allowed; }
            .dark .ce-field input:read-only { background: #1e293b; color: #64748b; }
            .ce-msg { font-size: 13px; padding: 8px 12px; border-radius: 8px; margin-top: 8px; display: none; }
            .ce-msg-error { color: #dc2626; background: #fef2f2; }
            .ce-msg-success { color: #16a34a; background: #f0fdf4; }
            .ce-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid #e5e7eb; }
            .dark .ce-footer { border-color: #334155; }
            .ce-btn-cancel { padding: 8px 16px; font-size: 13px; font-weight: 500; color: #6b7280; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
            .dark .ce-btn-cancel { background: #334155; color: #cbd5e1; border-color: #475569; }
            .ce-btn-cancel:hover { background: #f3f4f6; }
            .ce-btn-save { padding: 8px 16px; font-size: 13px; font-weight: 500; color: #fff; background: #f59e0b; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.2s; }
            .ce-btn-save:hover { background: #d97706; }
            .ce-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
        `;
        document.head.appendChild(style);

        this._editModalEl = document.createElement('div');
        this._editModalEl.className = 'ce-modal';
        this._editModalEl.innerHTML = `
            <div class="ce-backdrop"></div>
            <div class="ce-center">
                <div class="ce-dialog">
                    <div class="ce-header">
                        <h3>
                            <span class="material-symbols-outlined">edit</span>
                            Chỉnh sửa khách hàng
                        </h3>
                        <button class="ce-close" data-ce-close>&times;</button>
                    </div>
                    <div class="ce-body">
                        <div class="ce-field">
                            <label>Số điện thoại</label>
                            <input type="tel" id="ce-phone" readonly />
                        </div>
                        <div class="ce-field">
                            <label>Tên khách hàng <span style="color:#ef4444">*</span></label>
                            <input type="text" id="ce-name" placeholder="Nhập tên khách hàng" />
                        </div>
                        <div class="ce-field">
                            <label>Địa chỉ</label>
                            <input type="text" id="ce-address" placeholder="Nhập địa chỉ" />
                        </div>
                        <div class="ce-field">
                            <label>Trạng thái</label>
                            <select id="ce-status">
                                <option value="Bình thường">Bình thường</option>
                                <option value="VIP">VIP</option>
                                <option value="Cảnh báo">Cảnh báo</option>
                                <option value="Bom hàng">Bom hàng</option>
                                <option value="Nguy hiểm">Nguy hiểm</option>
                            </select>
                        </div>
                        <div id="ce-error" class="ce-msg ce-msg-error"></div>
                        <div id="ce-success" class="ce-msg ce-msg-success"></div>
                    </div>
                    <div class="ce-footer">
                        <button class="ce-btn-cancel" data-ce-close>Hủy</button>
                        <button class="ce-btn-save" id="ce-save">
                            <span class="material-symbols-outlined" style="font-size:16px;">save</span>
                            Lưu thay đổi
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this._editModalEl);

        // Close handlers
        this._editModalEl.querySelectorAll('[data-ce-close]').forEach(btn => {
            btn.addEventListener('click', () => this._closeEditModal());
        });
        this._editModalEl.querySelector('.ce-backdrop').addEventListener('click', () => this._closeEditModal());
    }

    _openEditModal(phone) {
        this._ensureEditModal();

        // Find customer in current list
        const customer = this.customers.find(c => c.phone === phone);
        if (!customer) {
            console.warn('[CustomerSearch] Customer not found for edit:', phone);
            return;
        }

        this._editingCustomer = customer;

        // Fill form
        this._editModalEl.querySelector('#ce-phone').value = customer.phone || '';
        this._editModalEl.querySelector('#ce-name').value = customer.name || '';
        this._editModalEl.querySelector('#ce-address').value = customer.address || '';
        this._editModalEl.querySelector('#ce-status').value = customer.status || 'Bình thường';

        // Reset messages
        this._editModalEl.querySelector('#ce-error').style.display = 'none';
        this._editModalEl.querySelector('#ce-success').style.display = 'none';

        // Reset save button
        const saveBtn = this._editModalEl.querySelector('#ce-save');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">save</span> Lưu thay đổi';

        // Remove old listener, add new one
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.addEventListener('click', () => this._submitEditCustomer());

        // Show modal
        this._editModalEl.classList.add('show');
        document.body.style.overflow = 'hidden';

        // Focus name input
        setTimeout(() => this._editModalEl.querySelector('#ce-name').focus(), 100);
    }

    _closeEditModal() {
        if (!this._editModalEl) return;
        this._editModalEl.classList.remove('show');
        document.body.style.overflow = '';
        this._editingCustomer = null;
    }

    async _submitEditCustomer() {
        const name = this._editModalEl.querySelector('#ce-name').value.trim();
        const address = this._editModalEl.querySelector('#ce-address').value.trim();
        const status = this._editModalEl.querySelector('#ce-status').value;
        const errorEl = this._editModalEl.querySelector('#ce-error');
        const successEl = this._editModalEl.querySelector('#ce-success');
        const saveBtn = this._editModalEl.querySelector('#ce-save');

        errorEl.style.display = 'none';
        successEl.style.display = 'none';

        // Validate
        if (!name) {
            errorEl.textContent = 'Vui lòng nhập tên khách hàng';
            errorEl.style.display = 'block';
            return;
        }

        // Disable button
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;animation:spin 1s linear infinite;">progress_activity</span> Đang lưu...';

        try {
            await apiService.upsertCustomer({
                phone: this._editingCustomer.phone,
                name: name,
                address: address,
                status: status
            });

            // Update in-memory customer data
            this._editingCustomer.name = name;
            this._editingCustomer.address = address;
            this._editingCustomer.status = status;

            // Re-render table
            this.renderResults(this.customers);

            // Show success
            successEl.textContent = 'Cập nhật thành công!';
            successEl.style.display = 'block';

            console.log('[CustomerSearch] Customer updated:', this._editingCustomer.phone, { name, address, status });

            // Close after 1s
            setTimeout(() => this._closeEditModal(), 1000);
        } catch (error) {
            console.error('[CustomerSearch] Edit customer failed:', error);
            errorEl.textContent = error.message || 'Cập nhật thất bại';
            errorEl.style.display = 'block';
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">save</span> Lưu thay đổi';
        }
    }

    render() {
        // The UI is initialized in the constructor
    }
}
