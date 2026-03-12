// =====================================================
// PERMISSION HELPER - INVENTORY TRACKING
// =====================================================

/**
 * Default permissions for inventory tracking page
 * These can be overridden by user-specific permissions in Firestore
 */
const DEFAULT_PERMISSIONS = {
    // Tab permissions
    tab_datHang: true,      // Tab Đặt Hàng - mặc định mở cho tất cả
    tab_tracking: true,
    tab_congNo: false,

    // CRUD permissions - Tab Đặt Hàng
    create_orderBooking: true,
    edit_orderBooking: true,
    delete_orderBooking: false,
    update_orderBookingStatus: true,

    // CRUD permissions - Tab Theo Dõi Đơn Hàng
    create_shipment: false,
    edit_shipment: false,
    delete_shipment: false,

    // Field permissions (Tab Theo Dõi Đơn Hàng)
    view_ngayDiHang: true,
    view_kienHang: true,
    view_hoaDon: true,
    view_anhHoaDon: true,
    view_tongTien: true,
    view_tongMon: true,
    view_soMonThieu: true,
    edit_soMonThieu: false,
    view_chiPhiHangVe: false,
    edit_chiPhiHangVe: false,
    view_ghiChuAdmin: false,
    edit_ghiChuAdmin: false,

    // Tab Công Nợ
    view_congNo: false,
    create_prepayment: false,
    edit_prepayment: false,
    delete_prepayment: false,
    create_otherExpense: false,
    edit_otherExpense: false,
    delete_otherExpense: false,
    edit_invoice_from_finance: false,
    edit_shipping_from_finance: false,

    // Export
    export_data: true,
};

/**
 * Admin permissions - full access
 */
const ADMIN_PERMISSIONS = {
    // Tab permissions
    tab_datHang: true,
    tab_tracking: true,
    tab_congNo: true,

    // Tab Đặt Hàng
    create_orderBooking: true,
    edit_orderBooking: true,
    delete_orderBooking: true,
    update_orderBookingStatus: true,

    // Tab Theo Dõi Đơn Hàng
    create_shipment: true,
    edit_shipment: true,
    delete_shipment: true,
    view_ngayDiHang: true,
    view_kienHang: true,
    view_hoaDon: true,
    view_anhHoaDon: true,
    view_tongTien: true,
    view_tongMon: true,
    view_soMonThieu: true,
    edit_soMonThieu: true,
    view_chiPhiHangVe: true,
    edit_chiPhiHangVe: true,
    view_ghiChuAdmin: true,
    edit_ghiChuAdmin: true,

    // Tab Công Nợ
    view_congNo: true,
    create_prepayment: true,
    edit_prepayment: true,
    delete_prepayment: true,
    create_otherExpense: true,
    edit_otherExpense: true,
    delete_otherExpense: true,
    edit_invoice_from_finance: true,
    edit_shipping_from_finance: true,

    // Export
    export_data: true,
};

// Note: Named InventoryPermissionHelper to avoid conflict with global PermissionHelper from core-loader
class InventoryPermissionHelper {
    constructor() {
        this.permissions = { ...DEFAULT_PERMISSIONS };
        this.isLoaded = false;
    }

    /**
     * Load user permissions from Firestore
     * ALL users (including Admin) use detailedPermissions - NO bypass
     */
    async loadPermissions() {
        try {
            const auth = authManager?.getAuthState();
            if (!auth) {
                console.warn('[PERMISSION] No auth state found');
                return this.permissions;
            }

            // ALL users check detailedPermissions - NO admin bypass
            // Admin gets full permissions because they have all permissions set to true in detailedPermissions

            // Try to load user-specific permissions from Firestore
            const username = auth.userType?.split('-')[0];
            if (username && usersRef) {
                const userDoc = await usersRef.doc(username).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    // Support both new format (detailedPermissions.inventoryTracking)
                    // and legacy format (inventoryTrackingPermissions)
                    const inventoryPerms = userData.detailedPermissions?.inventoryTracking
                        || userData.inventoryTrackingPermissions;
                    if (inventoryPerms) {
                        this.permissions = {
                            ...DEFAULT_PERMISSIONS,
                            ...inventoryPerms,
                        };
                        console.log('[PERMISSION] User permissions loaded from Firestore');
                    }
                }
            }

            this.isLoaded = true;
            return this.permissions;
        } catch (error) {
            console.error('[PERMISSION] Error loading permissions:', error);
            this.isLoaded = true;
            return this.permissions;
        }
    }

    /**
     * Check if user has a specific permission
     * ALL users (including Admin) check permissions - NO bypass
     */
    can(permissionKey) {
        // ALL users check permissions - NO admin bypass
        return this.permissions[permissionKey] === true;
    }

    /**
     * Check multiple permissions (AND logic)
     */
    canAll(...permissionKeys) {
        return permissionKeys.every(key => this.can(key));
    }

    /**
     * Check multiple permissions (OR logic)
     */
    canAny(...permissionKeys) {
        return permissionKeys.some(key => this.can(key));
    }

    /**
     * Get all current permissions
     * ALL users (including Admin) use loaded permissions - NO bypass
     */
    getAll() {
        return { ...this.permissions };
    }

    /**
     * Apply permissions to UI elements
     * Hide or disable elements based on permissions
     */
    applyToUI() {
        // Tab Đặt Hàng visibility
        const tabBooking = document.getElementById('tabBooking');
        const bookingLock = document.getElementById('bookingLock');
        if (tabBooking) {
            if (!this.can('tab_datHang')) {
                tabBooking.classList.add('disabled');
                if (bookingLock) bookingLock.classList.remove('hidden');
            } else {
                tabBooking.classList.remove('disabled');
                if (bookingLock) bookingLock.classList.add('hidden');
            }
        }

        // Tab Finance visibility
        const tabFinance = document.getElementById('tabFinance');
        const financeLock = document.getElementById('financeLock');
        if (tabFinance) {
            if (!this.can('tab_congNo')) {
                tabFinance.classList.add('disabled');
                if (financeLock) financeLock.classList.remove('hidden');
            } else {
                tabFinance.classList.remove('disabled');
                if (financeLock) financeLock.classList.add('hidden');
            }
        }

        // Add order booking button
        const btnAddOrderBooking = document.getElementById('btnAddOrderBooking');
        if (btnAddOrderBooking) {
            btnAddOrderBooking.style.display = this.can('create_orderBooking') ? '' : 'none';
        }

        // Add shipment button
        const btnAddShipment = document.getElementById('btnAddShipment');
        if (btnAddShipment) {
            btnAddShipment.style.display = this.can('create_shipment') ? '' : 'none';
        }

        // Export button
        const exportButton = document.getElementById('exportButton');
        if (exportButton) {
            exportButton.style.display = this.can('export_data') ? '' : 'none';
        }

        // Finance action buttons
        const btnAddPrepayment = document.getElementById('btnAddPrepayment');
        const btnAddExpense = document.getElementById('btnAddExpense');
        if (btnAddPrepayment) {
            btnAddPrepayment.style.display = this.can('create_prepayment') ? '' : 'none';
        }
        if (btnAddExpense) {
            btnAddExpense.style.display = this.can('create_otherExpense') ? '' : 'none';
        }

        console.log('[PERMISSION] UI permissions applied');
    }

    /**
     * Get visible columns for export
     */
    getExportableFields() {
        const fields = [];

        if (this.can('view_ngayDiHang')) fields.push('ngayDiHang');
        if (this.can('view_kienHang')) fields.push('kienHang');
        if (this.can('view_hoaDon')) fields.push('hoaDon');
        if (this.can('view_tongTien')) fields.push('tongTien');
        if (this.can('view_tongMon')) fields.push('tongMon');
        if (this.can('view_soMonThieu')) fields.push('soMonThieu');
        if (this.can('view_chiPhiHangVe')) fields.push('chiPhiHangVe');
        if (this.can('view_ghiChuAdmin')) fields.push('ghiChuAdmin');

        return fields;
    }
}

// Initialize permission helper (using InventoryPermissionHelper to avoid global conflict)
const permissionHelper = new InventoryPermissionHelper();
window.permissionHelper = permissionHelper;

console.log('[PERMISSION] Inventory permission helper loaded');
