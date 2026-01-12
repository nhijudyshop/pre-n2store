// customer-hub/js/utils/permissions.js

/**
 * PermissionHelper class for frontend permission checks.
 * This class assumes it receives the detailedPermissions object
 * from the backend for a specific user.
 */
class PermissionHelper {
    constructor(userDetailedPermissions = {}) {
        this.userDetailedPermissions = userDetailedPermissions;
    }

    /**
     * Checks if the user has access to a specific page.
     * User has access if they have at least one detailed permission set to true for that page.
     * @param {string} pageId - The ID of the page to check (e.g., "customer-hub").
     * @returns {boolean} - True if the user has access to the page, false otherwise.
     */
    hasPageAccess(pageId) {
        if (!this.userDetailedPermissions || !this.userDetailedPermissions[pageId]) {
            return false;
        }

        const pagePerms = this.userDetailedPermissions[pageId];
        // Check if any permission within this page is true
        return Object.values(pagePerms).some(value => value === true);
    }

    /**
     * Checks if the user has a specific detailed permission within a page.
     * @param {string} pageId - The ID of the page (e.g., "customer-hub").
     * @param {string} permissionKey - The key of the specific permission (e.g., "viewWallet", "editCustomer").
     * @returns {boolean} - True if the user has the specific permission, false otherwise.
     */
    hasPermission(pageId, permissionKey) {
        if (!this.userDetailedPermissions || !this.userDetailedPermissions[pageId]) {
            return false;
        }

        return this.userDetailedPermissions[pageId][permissionKey] === true;
    }

    /**
     * Returns a filtered list of pages that the user has access to.
     * This method would typically be used to build dynamic navigation menus.
     * (Note: This is a simplified version; a full implementation might need PAGES_REGISTRY data)
     * @param {Array<Object>} allPagesRegistry - An array of all possible page objects from the PAGES_REGISTRY.
     * @returns {Array<Object>} - An array of page objects the user can access.
     */
    getAccessiblePages(allPagesRegistry) {
        if (!this.userDetailedPermissions || !Array.isArray(allPagesRegistry)) {
            return [];
        }

        return allPagesRegistry.filter(page => this.hasPageAccess(page.id));
    }
}

export { PermissionHelper };
