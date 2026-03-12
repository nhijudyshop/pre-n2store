// =====================================================
// SỔ QUỸ - PERMISSION SYSTEM
// File: soquy-permissions.js
//
// Handles all permission logic for the Sổ Quỹ page:
// - Tab visibility (admin-only tabs)
// - Action gating (create receipt/payment, manage categories/sources)
// - Transaction filtering by creator
// - Hash-based tab access enforcement
//
// Depends on: PermissionHelper (shared/js/permissions-helper.js)
// =====================================================

const SoquyPermissions = {

    PAGE_ID: 'soquy',

    // Admin-only tab hashes (no permission keys needed - purely admin check)
    ADMIN_ONLY_TABS: ['employee', 'report', 'editHistory'],

    /**
     * Initialize permission system for Sổ Quỹ page.
     * Must be called at the start of DOMContentLoaded.
     * @returns {boolean} true if user has access, false otherwise
     */
    init() {
        // Check if PermissionHelper is loaded
        if (typeof PermissionHelper === 'undefined') {
            console.error('[SoquyPermissions] PermissionHelper not loaded - redirecting');
            window.location.href = '../index.html';
            return false;
        }

        // Enforce page access (handles login check + page permission)
        const hasAccess = PermissionHelper.enforcePageAccess(this.PAGE_ID);
        if (!hasAccess) {
            return false;
        }

        // Apply permission-based UI restrictions
        this.applyTabVisibility();
        this.applyActionPermissions();
        this.enforceTabAccess();

        console.log('[SoquyPermissions] Initialized successfully');
        return true;
    },

    /**
     * Apply tab visibility based on user role.
     * Admin: show all 4 tabs
     * Regular user: hide Nhân viên, Báo cáo, Lịch sử chỉnh sửa
     */
    applyTabVisibility() {
        const isAdmin = PermissionHelper.isAdmin();

        // Tab button elements and their wrapper (employee has nav-dropdown-wrapper)
        const tabEmployeeBtn = document.getElementById('tabEmployeeBtn');
        const tabReportBtn = document.getElementById('tabReportBtn');
        const tabEditHistoryBtn = document.getElementById('tabEditHistoryBtn');

        if (isAdmin) {
            // Admin: ensure all tabs are visible
            if (tabEmployeeBtn) {
                const wrapper = tabEmployeeBtn.closest('.nav-dropdown-wrapper');
                if (wrapper) wrapper.style.display = '';
                tabEmployeeBtn.style.display = '';
            }
            if (tabReportBtn) tabReportBtn.style.display = '';
            if (tabEditHistoryBtn) tabEditHistoryBtn.style.display = '';
        } else {
            // Regular user: hide admin-only tabs
            if (tabEmployeeBtn) {
                const wrapper = tabEmployeeBtn.closest('.nav-dropdown-wrapper');
                if (wrapper) wrapper.style.display = 'none';
                else tabEmployeeBtn.style.display = 'none';
            }
            if (tabReportBtn) tabReportBtn.style.display = 'none';
            if (tabEditHistoryBtn) tabEditHistoryBtn.style.display = 'none';

            // If user has tab_soquy permission, auto-switch to Sổ Quỹ tab
            if (PermissionHelper.hasPermission(this.PAGE_ID, 'tab_soquy')) {
                const cashbookBtn = document.getElementById('tabCashBookBtn');
                if (cashbookBtn) {
                    // Activate cashbook tab
                    document.querySelectorAll('.tab-header-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.tab === 'cashbook');
                    });
                    document.querySelectorAll('.tab-content').forEach(c => {
                        c.classList.toggle('active', c.id === 'cashbookTabContent');
                    });
                    location.hash = 'cashbook';
                }
            }
        }
    },

    /**
     * Apply action permissions: disable/hide buttons based on user permissions.
     * - Receipt button: disabled + opacity 0.5 if no create_receipt
     * - Payment CN/KD buttons: disabled + opacity 0.5 if no create_payment
     * - Category manage "+" button: hidden if no manage_categories
     * - Source manage button: hidden if no manage_sources
     */
    applyActionPermissions() {
        if (PermissionHelper.isAdmin()) return; // Admin has full access

        // Receipt button
        if (!PermissionHelper.hasPermission(this.PAGE_ID, 'create_receipt')) {
            const btnReceipt = document.getElementById('btnShowCreateReceipt');
            if (btnReceipt) {
                btnReceipt.disabled = true;
                btnReceipt.style.opacity = '0.5';
                btnReceipt.style.cursor = 'not-allowed';
                btnReceipt.title = 'Bạn không có quyền tạo phiếu thu';
            }
            // Mobile FAB receipt button
            const fabReceipt = document.getElementById('fabCreateReceipt');
            if (fabReceipt) {
                fabReceipt.disabled = true;
                fabReceipt.style.opacity = '0.5';
                fabReceipt.style.cursor = 'not-allowed';
            }
        }

        // Payment CN/KD buttons
        if (!PermissionHelper.hasPermission(this.PAGE_ID, 'create_payment')) {
            const btnPaymentCN = document.getElementById('btnShowCreatePaymentCN');
            const btnPaymentKD = document.getElementById('btnShowCreatePaymentKD');
            if (btnPaymentCN) {
                btnPaymentCN.disabled = true;
                btnPaymentCN.style.opacity = '0.5';
                btnPaymentCN.style.cursor = 'not-allowed';
                btnPaymentCN.title = 'Bạn không có quyền tạo phiếu chi';
            }
            if (btnPaymentKD) {
                btnPaymentKD.disabled = true;
                btnPaymentKD.style.opacity = '0.5';
                btnPaymentKD.style.cursor = 'not-allowed';
                btnPaymentKD.title = 'Bạn không có quyền tạo phiếu chi';
            }
            // Mobile FAB payment buttons
            const fabPaymentCN = document.getElementById('fabCreatePaymentCN');
            const fabPaymentKD = document.getElementById('fabCreatePaymentKD');
            if (fabPaymentCN) {
                fabPaymentCN.disabled = true;
                fabPaymentCN.style.opacity = '0.5';
                fabPaymentCN.style.cursor = 'not-allowed';
            }
            if (fabPaymentKD) {
                fabPaymentKD.disabled = true;
                fabPaymentKD.style.opacity = '0.5';
                fabPaymentKD.style.cursor = 'not-allowed';
            }
        }

        // Category management "+" buttons
        if (!PermissionHelper.hasPermission(this.PAGE_ID, 'manage_categories')) {
            const btnManageReceipt = document.getElementById('btnManageReceiptCategory');
            const btnManagePayment = document.getElementById('btnManagePaymentCategory');
            if (btnManageReceipt) btnManageReceipt.style.display = 'none';
            if (btnManagePayment) btnManagePayment.style.display = 'none';
        }

        // Source management button
        if (!PermissionHelper.hasPermission(this.PAGE_ID, 'manage_sources')) {
            const btnCreateSourceInline = document.getElementById('btnCreateSourceInline');
            if (btnCreateSourceInline) btnCreateSourceInline.style.display = 'none';
        }
    },

    /**
     * Check if user has permission to perform an action.
     * Uses PermissionHelper.checkBeforeAction which handles admin bypass
     * and shows alert if denied.
     *
     * @param {string} action - Permission key (create_receipt, create_payment, manage_categories, manage_sources)
     * @returns {boolean} true if allowed, false if denied
     */
    checkAction(action) {
        return PermissionHelper.checkBeforeAction(this.PAGE_ID, action, {
            alertMessage: 'Bạn không có quyền thực hiện thao tác này!'
        });
    },

    /**
     * Check if current user can cancel vouchers.
     * @returns {boolean} true if admin or has cancel_voucher permission
     */
    canCancelVoucher() {
        if (PermissionHelper.isAdmin()) return true;
        return PermissionHelper.hasPermission(this.PAGE_ID, 'cancel_voucher');
    },

    /**
     * Check if current user can edit vouchers.
     * @returns {boolean} true if admin or has edit_voucher permission
     */
    canEditVoucher() {
        if (PermissionHelper.isAdmin()) return true;
        return PermissionHelper.hasPermission(this.PAGE_ID, 'edit_voucher');
    },

    /**
     * Check if current user can view all transactions.
     * @returns {boolean} true if admin or has view_all_transactions permission
     */
    canViewAllTransactions() {
        if (PermissionHelper.isAdmin()) return true;
        return PermissionHelper.hasPermission(this.PAGE_ID, 'view_all_transactions');
    },

    /**
     * Filter vouchers by creator if user doesn't have view_all_transactions permission.
     * Admin or users with view_all_transactions see everything.
     * Regular users only see vouchers where createdBy matches their displayName.
     *
     * @param {Array} vouchers - Array of voucher objects
     * @returns {Array} Filtered array
     */
    filterByCreator(vouchers) {
        if (!Array.isArray(vouchers)) return [];
        if (this.canViewAllTransactions()) return vouchers;

        const auth = PermissionHelper.getAuth();
        const displayName = auth?.displayName || '';

        return vouchers.filter(v => v.createdBy === displayName);
    },

    /**
     * Enforce tab access via hashchange event.
     * If a non-admin user navigates to an admin-only tab hash,
     * redirect them back to the cashbook tab.
     */
    enforceTabAccess() {
        const self = this;

        window.addEventListener('hashchange', function () {
            if (PermissionHelper.isAdmin()) return;

            const hash = location.hash.replace('#', '');
            if (self.ADMIN_ONLY_TABS.includes(hash)) {
                // Non-admin trying to access admin-only tab → redirect to cashbook
                location.hash = 'cashbook';

                // Also update tab UI
                document.querySelectorAll('.tab-header-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === 'cashbook');
                });
                document.querySelectorAll('.tab-content').forEach(c => {
                    c.classList.toggle('active', c.id === 'cashbookTabContent');
                });
            }
        });
    }
};

// Export to window for global access
window.SoquyPermissions = SoquyPermissions;

console.log('[SoquyPermissions] Module loaded');
