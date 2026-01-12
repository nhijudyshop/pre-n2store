// customer-hub/js/modules/wallet-panel.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class WalletPanelModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
    }

    async render(phone) {
        this.customerPhone = phone;
        if (!this.permissionHelper.hasPermission('customer-hub', 'viewWallet')) {
            this.container.innerHTML = `
                <div class="p-6 h-full flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined text-4xl text-red-400 mb-2">lock</span>
                    <p class="text-red-500 text-sm">Bạn không có quyền xem thông tin ví.</p>
                </div>
            `;
            return;
        }

        // Show loading state
        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                        Ví khách hàng
                    </h3>
                </div>
                <div class="flex-1 flex items-center justify-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
            </div>
        `;
        await this.loadWalletDetails();
    }

    async loadWalletDetails() {
        if (!this.customerPhone) {
            this.renderError('Không có số điện thoại khách hàng.');
            return;
        }
        try {
            const wallet = await apiService.getWallet(this.customerPhone);
            if (wallet) {
                this.renderWallet(wallet);
            } else {
                this.renderEmpty();
            }
        } catch (error) {
            this.renderError(`Lỗi: ${error.message}`);
            console.error('Error loading wallet details:', error);
        }
    }

    renderError(message) {
        this.container.innerHTML = `
            <div class="p-6 h-full flex flex-col items-center justify-center">
                <span class="material-symbols-outlined text-4xl text-red-400 mb-2">error</span>
                <p class="text-red-500 text-sm text-center">${message}</p>
            </div>
        `;
    }

    renderEmpty() {
        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                        Ví khách hàng
                    </h3>
                </div>
                <div class="flex-1 flex flex-col items-center justify-center text-slate-400">
                    <span class="material-symbols-outlined text-4xl mb-2">account_balance_wallet</span>
                    <p class="text-sm">Chưa có thông tin ví</p>
                </div>
            </div>
        `;
    }

    renderWallet(wallet) {
        const realBalance = wallet.real_balance || 0;
        const virtualBalance = wallet.virtual_balance || 0;
        const totalBalance = wallet.total_balance || (realBalance + virtualBalance);

        const canManageWallet = this.permissionHelper.hasPermission('customer-hub', 'manageWallet');

        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                        Ví khách hàng
                    </h3>
                    <button class="text-xs text-primary font-medium hover:underline">Xem lịch sử</button>
                </div>
                <div class="flex-1 flex flex-col justify-center gap-4 py-2">
                    <!-- Cash Balance -->
                    <div>
                        <p class="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Số dư thực</p>
                        <p class="text-4xl font-bold text-green-600 dark:text-green-500 tracking-tight tabular-nums">${this.formatCurrency(realBalance)}</p>
                    </div>

                    <!-- Virtual Credit & Total -->
                    <div class="flex items-center gap-3 py-3 border-y border-dashed border-slate-200 dark:border-slate-700">
                        <div class="flex-1">
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Tín dụng ảo</p>
                            <p class="text-xl font-semibold text-amber-500 tabular-nums flex items-center gap-1">
                                <span class="material-symbols-outlined text-sm">token</span>
                                ${this.formatCurrencyShort(virtualBalance)}
                            </p>
                        </div>
                        <div class="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                        <div class="flex-1">
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Tổng sức mua</p>
                            <p class="text-xl font-semibold text-slate-700 dark:text-slate-300 tabular-nums">${this.formatCurrencyShort(totalBalance)}</p>
                        </div>
                    </div>
                </div>

                ${canManageWallet ? `
                    <!-- Action Buttons -->
                    <div class="grid grid-cols-2 gap-2 mt-4">
                        <button id="deposit-btn" class="py-2 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">add</span> Nạp tiền
                        </button>
                        <button id="withdraw-btn" class="py-2 px-3 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">remove</span> Rút tiền
                        </button>
                        <button id="issue-vc-btn" class="col-span-2 py-2 px-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800 text-xs font-bold transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">stars</span> Cấp tín dụng ảo
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        // Setup button handlers (placeholder functionality)
        if (canManageWallet) {
            const depositBtn = this.container.querySelector('#deposit-btn');
            const withdrawBtn = this.container.querySelector('#withdraw-btn');
            const issueVcBtn = this.container.querySelector('#issue-vc-btn');

            if (depositBtn) {
                depositBtn.onclick = () => this._showActionModal('deposit');
            }
            if (withdrawBtn) {
                withdrawBtn.onclick = () => this._showActionModal('withdraw');
            }
            if (issueVcBtn) {
                issueVcBtn.onclick = () => this._showActionModal('issue_vc');
            }
        }
    }

    _showActionModal(action) {
        const actionNames = {
            'deposit': 'Nạp tiền',
            'withdraw': 'Rút tiền',
            'issue_vc': 'Cấp tín dụng ảo'
        };
        alert(`Chức năng "${actionNames[action]}" đang được phát triển.`);
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    }

    formatCurrencyShort(amount) {
        if (amount >= 1000000) {
            return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(amount / 1000000) + 'M';
        } else if (amount >= 1000) {
            return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount / 1000) + 'K';
        }
        return new Intl.NumberFormat('vi-VN').format(amount || 0);
    }
}
