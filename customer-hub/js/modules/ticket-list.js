// customer-hub/js/modules/ticket-list.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';

export class TicketListModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
        this.unsubscribeTickets = null;
    }

    async render(phone) {
        this.customerPhone = phone;
        if (!this.permissionHelper.hasPermission('customer-hub', 'viewTickets')) {
            this.container.innerHTML = `
                <div class="p-6 h-full flex flex-col items-center justify-center">
                    <span class="material-symbols-outlined text-4xl text-red-400 mb-2">lock</span>
                    <p class="text-red-500 text-sm">Bạn không có quyền xem danh sách ticket.</p>
                </div>
            `;
            return;
        }

        // Show loading state
        this.container.innerHTML = `
            <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 class="text-base font-bold text-slate-800 dark:text-white">Ticket gần đây</h3>
            </div>
            <div class="flex-1 flex items-center justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        `;
        await this.loadTickets();
    }

    async loadTickets() {
        if (!this.customerPhone) {
            this.renderError('Không có số điện thoại khách hàng.');
            return;
        }
        try {
            // Try to use subscribeToTickets if available
            const response = await apiService.subscribeToTickets((tickets) => {
                const customerTickets = tickets.filter(ticket => ticket.phone === this.customerPhone);
                this.renderTickets(customerTickets.slice(0, 5)); // Show max 5 recent tickets
            }, { phone: this.customerPhone, limit: 5 });

            this.unsubscribeTickets = response;

        } catch (error) {
            this.renderError(`Lỗi: ${error.message}`);
            console.error('Error loading tickets:', error);
        }
    }

    renderError(message) {
        this.container.innerHTML = `
            <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 class="text-base font-bold text-slate-800 dark:text-white">Ticket gần đây</h3>
            </div>
            <div class="p-6 flex flex-col items-center justify-center">
                <span class="material-symbols-outlined text-4xl text-red-400 mb-2">error</span>
                <p class="text-red-500 text-sm text-center">${message}</p>
            </div>
        `;
    }

    renderTickets(tickets) {
        if (!tickets || tickets.length === 0) {
            this.container.innerHTML = `
                <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white">Ticket gần đây</h3>
                    ${this.permissionHelper.hasPermission('customer-hub', 'createTicket') ? `
                        <button class="text-xs font-medium text-primary hover:text-primary-dark flex items-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">add</span> Tạo mới
                        </button>
                    ` : ''}
                </div>
                <div class="flex-1 flex flex-col items-center justify-center py-8 text-slate-400">
                    <span class="material-symbols-outlined text-4xl mb-2">confirmation_number</span>
                    <p class="text-sm">Chưa có ticket nào</p>
                </div>
            `;
            return;
        }

        const ticketRows = tickets.map(ticket => {
            const statusBadge = this._getStatusBadge(ticket.status);
            const date = this._formatDate(ticket.createdAt || ticket.created_at);
            const ticketId = ticket.ticketCode || ticket.firebaseId || ticket.id;

            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer group">
                    <td class="px-6 py-3 font-mono text-xs text-slate-400 group-hover:text-primary">#${ticketId}</td>
                    <td class="px-6 py-3 font-medium text-slate-900 dark:text-white">${ticket.subject || ticket.type || 'Không có tiêu đề'}</td>
                    <td class="px-6 py-3">${statusBadge}</td>
                    <td class="px-6 py-3 text-right text-xs">${date}</td>
                </tr>
            `;
        }).join('');

        this.container.innerHTML = `
            <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 class="text-base font-bold text-slate-800 dark:text-white">Ticket gần đây</h3>
                <a class="text-xs font-medium text-primary hover:text-primary-dark" href="#">Xem tất cả</a>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead class="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase font-semibold text-slate-500">
                        <tr>
                            <th class="px-6 py-3">ID</th>
                            <th class="px-6 py-3">Tiêu đề</th>
                            <th class="px-6 py-3">Trạng thái</th>
                            <th class="px-6 py-3 text-right">Ngày</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${ticketRows}
                    </tbody>
                </table>
            </div>
        `;
    }

    _getStatusBadge(status) {
        const statusLower = (status || '').toLowerCase();
        const statusMap = {
            'open': { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-800 dark:text-blue-300', label: 'Mở' },
            'pending': { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-800 dark:text-amber-300', label: 'Chờ xử lý' },
            'in_progress': { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-300', label: 'Đang xử lý' },
            'resolved': { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-800 dark:text-green-300', label: 'Đã giải quyết' },
            'closed': { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-800 dark:text-green-300', label: 'Đã đóng' },
            'cancelled': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', label: 'Đã hủy' },
        };

        const s = statusMap[statusLower] || { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', label: status || 'N/A' };
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}">${s.label}</span>`;
    }

    _formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now - date) / 86400000);

        if (diffDays === 0) return 'Hôm nay';
        if (diffDays === 1) return 'Hôm qua';
        if (diffDays < 7) return `${diffDays} ngày trước`;

        return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
    }

    // Cleanup function if using subscribeToTickets
    destroy() {
        if (this.unsubscribeTickets) {
            this.unsubscribeTickets();
        }
    }
}
