// customer-hub/js/modules/wallet-panel.js
import apiService from '../api-service.js';
import { logAction } from '../../../shared/js/audit-logger.esm.js';

const TYPE_LABELS = {
    'DEPOSIT': 'Nạp tiền',
    'WITHDRAW': 'Rút tiền',
    'VIRTUAL_CREDIT': 'Cộng công nợ ảo',
    'VIRTUAL_DEBIT': 'Trừ công nợ ảo',
    'VIRTUAL_EXPIRE': 'Công nợ hết hạn',
    'VIRTUAL_CANCEL': 'Thu hồi công nợ ảo',
    'ADJUSTMENT': 'Điều chỉnh số dư',
    'RETURN_SHIPPER': 'Phiếu thu về',
    'RETURN_CLIENT': 'Phiếu trả hàng',
    'BOOM': 'Phiếu boom hàng',
    'FIX_COD': 'Phiếu sửa COD',
    'COD_ADJUSTMENT': 'Điều chỉnh COD',
    'ORDER_CANCEL_REFUND': 'Hoàn tiền hủy đơn',
    'OTHER': 'Phiếu khác'
};

const CREDIT_TYPES = ['DEPOSIT', 'VIRTUAL_CREDIT', 'ORDER_CANCEL_REFUND'];

export class WalletPanelModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
        this.eventSource = null;
    }

    async render(phone) {
        if (this.customerPhone !== phone) {
            this.closeSSE();
        }
        this.customerPhone = phone;

        if (!this.permissionHelper.hasPermission('customer-hub', 'viewWallet')) {
            this.container.innerHTML = `
                <div class="p-6 h-full flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined text-4xl text-red-400 mb-2">lock</span>
                    <p class="text-red-500 text-sm">Bạn không có quyền xem thông tin ví.</p>
                </div>`;
            return;
        }

        this._showLoading();
        await this.loadWalletDetails();
    }

    _showLoading() {
        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
                    <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                    Ví Khách Hàng
                </h3>
                <div class="flex-1 flex items-center justify-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
            </div>`;
    }

    async loadWalletDetails() {
        if (!this.customerPhone) {
            return this._renderMessage('error', 'Không có số điện thoại khách hàng.');
        }
        try {
            const wallet = await apiService.getWallet(this.customerPhone);
            if (wallet) {
                this.renderWallet(wallet);
                this.subscribeToRealtimeUpdates();
            } else {
                this._renderMessage('empty', 'Chưa có thông tin ví');
            }
        } catch (error) {
            this._renderMessage('error', `Lỗi: ${error.message}`);
        }
    }

    _renderMessage(type, message) {
        const icon = type === 'error' ? 'error' : 'account_balance_wallet';
        const color = type === 'error' ? 'red' : 'slate';
        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
                    <span class="material-symbols-outlined text-green-600">account_balance_wallet</span>
                    Ví Khách Hàng
                </h3>
                <div class="flex-1 flex flex-col items-center justify-center text-${color}-400">
                    <span class="material-symbols-outlined text-4xl mb-2">${icon}</span>
                    <p class="text-sm text-center">${message}</p>
                </div>
            </div>`;
    }

    renderWallet(wallet) {
        const realBalance = parseFloat(wallet.balance || wallet.real_balance) || 0;
        const virtualBalance = parseFloat(wallet.virtual_balance) || 0;
        const totalBalance = wallet.total_balance || (realBalance + virtualBalance);
        const canManage = this.permissionHelper.hasPermission('customer-hub', 'manageWallet');

        this.container.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-50 to-transparent dark:from-green-900/10 rounded-bl-full -z-0 opacity-50"></div>
            <div class="p-6 relative z-10 flex flex-col h-full">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-green-600 dark:text-green-500">account_balance_wallet</span>
                        Ví Khách Hàng
                    </h3>
                    <button id="view-history-btn" class="text-xs text-primary font-medium hover:underline">Lịch sử</button>
                </div>
                <div class="flex-1 flex flex-col justify-center gap-4 py-2">
                    <div>
                        <p class="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Số dư khả dụng</p>
                        <p class="text-4xl font-bold text-green-600 dark:text-green-500 tracking-tight tabular-nums">${this._formatCurrency(totalBalance)}</p>
                    </div>
                    <div class="flex items-center gap-3 py-3 border-y border-dashed border-slate-200 dark:border-slate-700">
                        <div class="flex-1">
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Tiền thật</p>
                            <p class="text-xl font-semibold text-slate-700 dark:text-slate-300 tabular-nums">${this._formatShort(realBalance)}</p>
                        </div>
                        <div class="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                        <div class="flex-1">
                            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Công nợ ảo</p>
                            <p class="text-xl font-semibold text-amber-500 tabular-nums flex items-center gap-1">
                                <span class="material-symbols-outlined text-sm">token</span>
                                ${this._formatShort(virtualBalance)}
                            </p>
                        </div>
                    </div>
                </div>
                ${canManage ? `
                    <div class="grid grid-cols-2 gap-2 mt-4">
                        <button data-action="deposit" class="wallet-action-btn py-2 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">add</span> Nạp tiền
                        </button>
                        <button data-action="withdraw" class="wallet-action-btn py-2 px-3 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">remove</span> Rút tiền
                        </button>
                        <button data-action="issue_vc" class="wallet-action-btn col-span-2 py-2 px-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800 text-xs font-bold transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">stars</span> Cấp công nợ ảo
                        </button>
                    </div>
                ` : ''}
            </div>`;

        // Event delegation for buttons
        this.container.querySelector('#view-history-btn')?.addEventListener('click', () => this._showTransactionHistory());
        this.container.querySelectorAll('.wallet-action-btn').forEach(btn => {
            btn.addEventListener('click', () => this._showActionModal(btn.dataset.action));
        });
    }

    _showActionModal(action) {
        // Defense-in-depth: chặn modal nếu user không có quyền manageWallet
        if (!this.permissionHelper.hasPermission('customer-hub', 'manageWallet')) {
            alert('Bạn không có quyền thực hiện thao tác này');
            return;
        }

        // Use inline styles for button colors because Tailwind CSS purge may not include
        // dynamic classes like bg-red-600, bg-amber-600 in the built CSS
        const configs = {
            deposit: { title: 'Nạp tiền vào ví', icon: 'add', btnStyle: 'background:#16a34a;', btnHoverBg: '#15803d', buttonText: 'Nạp tiền', iconColor: '#16a34a' },
            withdraw: { title: 'Rút tiền từ ví', icon: 'remove', btnStyle: 'background:#dc2626;', btnHoverBg: '#b91c1c', buttonText: 'Rút tiền', iconColor: '#dc2626' },
            issue_vc: { title: 'Cấp công nợ ảo', icon: 'stars', btnStyle: 'background:#d97706;', btnHoverBg: '#b45309', buttonText: 'Cấp công nợ', showExpiry: true, iconColor: '#d97706' }
        };
        const cfg = configs[action];
        if (!cfg) return;

        const modal = document.createElement('div');
        modal.id = 'wallet-action-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
                <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined" style="color:${cfg.iconColor}">${cfg.icon}</span>
                        ${cfg.title}
                    </h3>
                    <button class="close-btn p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="p-6">
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Số tiền (VNĐ)</label>
                    <input type="number" name="amount" class="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-lg mb-4" placeholder="Nhập số tiền" min="1000" step="1000">
                    ${cfg.showExpiry ? `
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Số ngày hiệu lực</label>
                        <input type="number" name="expiry" class="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white mb-4" value="15" min="1" max="365">
                    ` : ''}
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Ghi chú (tùy chọn)</label>
                    <textarea name="note" rows="2" class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white mb-4" placeholder="Nhập ghi chú..."></textarea>
                    <div class="error-msg hidden mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm"></div>
                    <button class="submit-btn w-full py-3 px-4 text-white font-bold rounded-lg flex items-center justify-center gap-2" style="${cfg.btnStyle}">
                        <span class="material-symbols-outlined">${cfg.icon}</span> ${cfg.buttonText}
                    </button>
                </div>
            </div>`;

        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.querySelector('.close-btn').onclick = close;
        modal.onclick = e => e.target === modal && close();

        const submitBtn = modal.querySelector('.submit-btn');
        const errorDiv = modal.querySelector('.error-msg');

        submitBtn.onclick = async () => {
            const amount = parseFloat(modal.querySelector('[name="amount"]').value);
            const note = modal.querySelector('[name="note"]').value.trim();
            const expiry = parseInt(modal.querySelector('[name="expiry"]')?.value) || 15;

            if (!amount || amount < 1000) {
                errorDiv.textContent = 'Số tiền phải >= 1,000 VNĐ';
                errorDiv.classList.remove('hidden');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="animate-spin material-symbols-outlined">sync</span> Đang xử lý...';

            try {
                const user = this._getCurrentUser();
                const actionTypeMap = { deposit: 'wallet_add_debt', withdraw: 'wallet_subtract_debt', issue_vc: 'wallet_adjust_debt' };
                const descMap = { deposit: `Nạp ${amount.toLocaleString('vi-VN')}đ vào ví ${this.customerPhone}`, withdraw: `Rút ${amount.toLocaleString('vi-VN')}đ từ ví ${this.customerPhone}`, issue_vc: `Cấp công nợ ảo ${amount.toLocaleString('vi-VN')}đ cho ${this.customerPhone} (${expiry} ngày)` };

                if (action === 'deposit') {
                    await apiService.walletDeposit(this.customerPhone, amount, { source: 'MANUAL_ADJUSTMENT', note: note || 'Nạp tiền từ Customer 360', created_by: user });
                } else if (action === 'withdraw') {
                    await apiService.walletWithdraw(this.customerPhone, amount, null, note || 'Rút tiền từ Customer 360');
                } else if (action === 'issue_vc') {
                    await apiService.issueVirtualCredit(this.customerPhone, amount, { source_type: 'ADMIN_ISSUE', expiry_days: expiry, note: note || `Cấp công nợ ảo (${expiry} ngày)`, created_by: user });
                }

                // Audit logging - fire-and-forget
                try {
                    logAction(actionTypeMap[action] || 'wallet_transaction', {
                        module: 'customer-hub',
                        description: descMap[action] || `Thao tác ví: ${action}`,
                        oldData: null,
                        newData: { amount, action, note, customerId: this.customerPhone },
                        entityId: this.customerPhone,
                        entityType: 'customer'
                    });
                } catch (e) { /* audit log error - ignore */ }

                close();
                await this.loadWalletDetails();

                // Notify search list to refresh wallet balance
                window.dispatchEvent(new CustomEvent('wallet-updated', {
                    detail: { phone: this.customerPhone, action }
                }));
            } catch (err) {
                errorDiv.textContent = err.message;
                errorDiv.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span class="material-symbols-outlined">${cfg.icon}</span> Thử lại`;
            }
        };

        modal.querySelector('[name="amount"]').focus();
    }

    async _showTransactionHistory() {
        if (!this.customerPhone) return alert('Không có số điện thoại khách hàng.');

        try {
            const response = await fetch(`${apiService.RENDER_API_URL}/v2/wallets/${this.customerPhone}/transactions?limit=50`);
            if (!response.ok) throw new Error('Không thể tải lịch sử giao dịch');
            const { data: transactions = [] } = await response.json();

            const modal = document.createElement('div');
            modal.id = 'transaction-history-modal';
            modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6';
            modal.innerHTML = `
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col" style="max-height: calc(100dvh - 48px);">
                    <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span class="material-symbols-outlined text-green-600">history</span>
                            Lịch sử giao dịch ví
                        </h3>
                        <button class="close-btn p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <div class="overflow-y-auto p-4 flex-1">
                        ${transactions.length === 0
                            ? '<div class="text-center py-8 text-slate-500"><span class="material-symbols-outlined text-4xl mb-2">receipt_long</span><p>Chưa có giao dịch nào</p></div>'
                            : `<div class="space-y-3">${transactions.map(tx => this._renderTx(tx)).join('')}</div>`
                        }
                    </div>
                </div>`;

            document.body.appendChild(modal);
            const close = () => modal.remove();
            modal.querySelector('.close-btn').onclick = close;
            modal.onclick = e => e.target === modal && close();
        } catch (err) {
            alert(`Lỗi: ${err.message}`);
        }
    }

    _renderTx(tx) {
        const isCredit = CREDIT_TYPES.includes(tx.type);
        const bg = isCredit ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20';
        const color = isCredit ? 'text-green-600' : 'text-red-600';
        const date = tx.created_at ? new Date(tx.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const expiry = (tx.type === 'VIRTUAL_CREDIT' && tx.expires_at)
            ? `<span class="text-orange-500 ml-1">• HSD: ${new Date(tx.expires_at).toLocaleDateString('vi-VN')}</span>` : '';

        return `
            <div class="flex items-center gap-3 p-3 rounded-lg ${bg}">
                <div class="flex-1">
                    <p class="font-medium text-slate-800 dark:text-slate-200">${TYPE_LABELS[tx.type] || 'Giao dịch ví'}</p>
                    <p class="text-xs text-slate-500">${this._escapeHtml(tx.note || tx.source || '')}</p>
                    <p class="text-xs text-slate-400">${date}${expiry}</p>
                </div>
                <p class="font-bold ${color}">${isCredit ? '+' : '-'}${this._formatCurrency(Math.abs(tx.amount))}</p>
            </div>`;
    }

    // SSE Realtime
    subscribeToRealtimeUpdates() {
        if (!this.customerPhone) return;
        this.closeSSE();

        const sseUrl = `${apiService.RENDER_SSE_URL}/api/realtime/sse?keys=wallet:${this.customerPhone}`;
        this.eventSource = new EventSource(sseUrl);

        const handleUpdate = (event) => {
            try {
                const data = JSON.parse(event.data);
                const walletData = data.data?.wallet || (data.event === 'wallet_update' && data.data?.wallet);
                if (walletData) {
                    this.renderWallet(walletData);
                    if (data.data?.transaction?.amount > 0) this._showNotification(data.data.transaction);
                    // Notify search list to refresh wallet balance
                    window.dispatchEvent(new CustomEvent('wallet-updated', {
                        detail: { phone: this.customerPhone, action: 'sse_update' }
                    }));
                }
            } catch (e) { /* ignore parse errors */ }
        };

        this.eventSource.addEventListener('wallet_update', handleUpdate);
        this.eventSource.addEventListener('update', handleUpdate);
    }

    _showNotification(tx) {
        const el = document.createElement('div');
        el.className = 'fixed bottom-4 right-4 z-50 animate-pulse';
        el.innerHTML = `
            <div class="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
                <span class="material-symbols-outlined">account_balance_wallet</span>
                <div>
                    <p class="font-bold">${tx.type === 'DEPOSIT' ? 'Nạp tiền thành công!' : 'Cập nhật ví'}</p>
                    <p class="text-sm">+${this._formatCurrency(tx.amount)}</p>
                </div>
            </div>`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 5000);
    }

    closeSSE() {
        this.eventSource?.close();
        this.eventSource = null;
    }

    destroy() {
        this.closeSSE();
        this.customerPhone = null;
    }

    // Helpers
    _getCurrentUser() {
        try {
            const u = JSON.parse(localStorage.getItem('n2shop_current_user') || '{}');
            return u.email || u.displayName || 'admin';
        } catch { return 'admin'; }
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    }

    _formatShort(amount) {
        if (amount >= 1e6) return (amount / 1e6).toFixed(1).replace('.0', '') + 'M';
        if (amount >= 1e3) return Math.round(amount / 1e3) + 'K';
        return new Intl.NumberFormat('vi-VN').format(amount || 0);
    }
}
