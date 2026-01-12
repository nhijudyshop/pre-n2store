// main.js - Entry point for Customer 360 Hub
import { PermissionHelper } from './utils/permissions.js';
import { CustomerSearchModule } from './modules/customer-search.js';
import { CustomerProfileModule } from './modules/customer-profile.js';
import { LinkBankTransactionModule } from './modules/link-bank-transaction.js';
import { TransactionActivityModule } from './modules/transaction-activity.js';
import { WalletPanelModule } from './modules/wallet-panel.js';
import { TicketListModule } from './modules/ticket-list.js';
import apiService from './api-service.js';
// Ensure API_CONFIG is loaded before apiService for proper initialization
import '../config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Customer 360 Hub loaded!");

    // Initialize PermissionHelper (replace with actual user permissions fetching)
    // For now, providing full permissions for demonstration
    const currentUserPermissions = {
        'customer-hub': {
            view: true,
            viewWallet: true,
            manageWallet: true,
            viewTickets: true,
            createTicket: true,
            viewActivities: true,
            addNote: true,
            editCustomer: true,
            linkTransactions: true,
        }
    };
    const permissionHelper = new PermissionHelper(currentUserPermissions);
    console.log("PermissionHelper initialized:", permissionHelper);

    // Theme Toggle
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const htmlTag = document.documentElement;

    // Check for saved theme preference
    if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlTag.classList.add('dark');
        themeIcon.textContent = 'light_mode';
    } else {
        themeIcon.textContent = 'dark_mode';
    }

    themeToggleBtn.addEventListener('click', () => {
        htmlTag.classList.toggle('dark');
        if (htmlTag.classList.contains('dark')) {
            localStorage.setItem('theme', 'dark');
            themeIcon.textContent = 'light_mode';
        } else {
            localStorage.setItem('theme', 'light');
            themeIcon.textContent = 'dark_mode';
        }
    });

    // --- Modal Functions ---
    const modalContainer = document.getElementById('customer-profile-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalContent = document.getElementById('modal-content');
    let customerProfileModule = null;

    window.openCustomerModal = async function(phone) {
        if (!modalContainer || !modalContent) return;

        modalContainer.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scroll

        // Initialize or re-render customer profile
        if (!customerProfileModule) {
            customerProfileModule = new CustomerProfileModule('modal-content', permissionHelper);
        }
        await customerProfileModule.render(phone);
    };

    window.closeCustomerModal = function() {
        if (!modalContainer) return;

        modalContainer.classList.add('hidden');
        document.body.style.overflow = ''; // Restore scroll
    };

    // Close modal on backdrop click
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', () => {
            window.closeCustomerModal();
        });
    }

    // Close modal on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modalContainer?.classList.contains('hidden')) {
            window.closeCustomerModal();
        }
    });

    // --- Update Unlinked Badge Count ---
    async function updateUnlinkedBadge() {
        const badge = document.getElementById('unlinked-badge');
        if (!badge) return;

        try {
            const response = await apiService.getUnlinkedTransactionsCount();
            if (response.success && response.count > 0) {
                badge.textContent = response.count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch (error) {
            console.error('Failed to update unlinked badge:', error);
            badge.classList.add('hidden');
        }
    }

    // Update badge on load
    updateUnlinkedBadge();

    // --- Routing Logic ---
    const appContent = document.getElementById('app-content');
    const tabLinks = document.querySelectorAll('.tab-link');

    // Create fresh module instance each time (since container is recreated)
    function loadModule(moduleName, containerId, ...args) {
        switch (moduleName) {
            case 'CustomerSearchModule':
                return new CustomerSearchModule(containerId, permissionHelper);
            case 'CustomerProfileModule':
                return new CustomerProfileModule(containerId, permissionHelper);
            case 'LinkBankTransactionModule':
                return new LinkBankTransactionModule(containerId, permissionHelper, updateUnlinkedBadge);
            case 'TransactionActivityModule':
                return new TransactionActivityModule(containerId, permissionHelper);
            case 'WalletPanelModule':
                return new WalletPanelModule(containerId, permissionHelper);
            case 'TicketListModule':
                return new TicketListModule(containerId, permissionHelper);
        }
        return null;
    }

    const routes = {
        'customer-search': () => {
            if (permissionHelper.hasPageAccess('customer-hub')) {
                appContent.innerHTML = `<div id="customer-search-container"></div>`;
                loadModule('CustomerSearchModule', 'customer-search-container');
            } else {
                appContent.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng này.</p>`;
            }
            setActiveTabLink('customer-search-tab');
        },
        'customer-profile': (phone) => {
            // Now opens as modal instead of route
            window.openCustomerModal(phone);
        },
        'transaction-activity': () => {
            if (permissionHelper.hasPermission('customer-hub', 'viewActivities')) {
                appContent.innerHTML = `<div id="transaction-activity-container"></div>`;
                loadModule('TransactionActivityModule', 'transaction-activity-container');
            } else {
                appContent.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng hoạt động giao dịch tổng hợp.</p>`;
            }
            setActiveTabLink('transaction-activity-tab');
        },
        'unlinked-transactions': () => {
            if (permissionHelper.hasPermission('customer-hub', 'linkTransactions')) {
                appContent.innerHTML = `<div id="unlinked-transactions-container"></div>`;
                loadModule('LinkBankTransactionModule', 'unlinked-transactions-container');
            } else {
                appContent.innerHTML = `<p class="text-red-500">Bạn không có quyền truy cập chức năng giao dịch chưa liên kết.</p>`;
            }
            setActiveTabLink('unlinked-transactions-tab');
        },
    };

    function setActiveTabLink(tabId) {
        tabLinks.forEach(link => {
            // Reset all tabs to inactive style
            link.classList.remove('border-primary', 'text-primary', 'dark:text-white', 'font-semibold');
            link.classList.add('border-transparent', 'text-slate-500', 'dark:text-slate-400', 'font-medium');
        });

        const activeLink = document.getElementById(tabId);
        if (activeLink) {
            // Set active tab style
            activeLink.classList.remove('border-transparent', 'text-slate-500', 'dark:text-slate-400', 'font-medium');
            activeLink.classList.add('border-primary', 'text-primary', 'dark:text-white', 'font-semibold');
        }
    }

    function handleHashChange() {
        const hash = window.location.hash.slice(1); // Remove '#'
        if (hash.startsWith('customer/')) {
            const phone = hash.split('/')[1];
            routes['customer-profile'](phone);
        } else if (hash === '' || hash === 'customer-search') {
            routes['customer-search']();
        } else if (hash === 'transaction-activity') {
            routes['transaction-activity']();
        } else if (hash === 'unlinked-transactions') {
            routes['unlinked-transactions']();
        } else {
            appContent.innerHTML = `<h2 class="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">Trang không tìm thấy.</h2><p>Đường dẫn không hợp lệ: ${hash}</p>`;
        }
    }

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Initial load
    handleHashChange();

    // Update tab links to use hash
    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.id;
            let hash = '';
            switch (tabId) {
                case 'customer-search-tab':
                    hash = 'customer-search';
                    break;
                case 'transaction-activity-tab':
                    hash = 'transaction-activity';
                    break;
                case 'unlinked-transactions-tab':
                    hash = 'unlinked-transactions';
                    break;
                default:
                    hash = 'customer-search';
            }
            if (hash) {
                window.location.hash = hash;
            }
        });
    });

    // Set initial content to Customer Search if no hash is present
    if (!window.location.hash || window.location.hash === '#dashboard') {
        window.location.hash = 'customer-search';
    }
});
