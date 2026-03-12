/* =====================================================
   NAVIGATION PERMISSIONS - Permission-based menu filtering and access control
   Sub-module of navigation-modern.js
   Load order: 2 (after config)
   Dependencies: navigation-config.js (MENU_CONFIG, selectiveLogoutStorage)
   ===================================================== */

/**
 * Generate default admin permissions for all pages
 * Used to auto-fill missing permissions for admin template users
 */
function getDefaultAdminPermissions() {
    const defaultPerms = {};
    MENU_CONFIG.forEach(item => {
        if (item.permissionRequired) {
            // Default admin permissions for each page
            defaultPerms[item.permissionRequired] = {
                view: true,
                create: true,
                edit: true,
                delete: true,
                export: true
            };
        }
    });
    return defaultPerms;
}

/**
 * Merge missing permissions for admin template users
 * Ensures admins have access to all pages even if their stored permissions are outdated
 */
function mergeAdminPermissions(existingPerms) {
    const defaultPerms = getDefaultAdminPermissions();
    const merged = { ...existingPerms };

    Object.keys(defaultPerms).forEach(pageId => {
        if (!merged[pageId]) {
            merged[pageId] = defaultPerms[pageId];
            console.log(`[Admin Merge] Added missing permission for: ${pageId}`);
        }
    });

    return merged;
}

// =====================================================
// UnifiedNavigationManager - Permission methods
// Added via prototype to class defined in navigation-core.js
// These methods are attached after the class is defined
// =====================================================

/**
 * Attach permission-related methods to UnifiedNavigationManager prototype.
 * Called after the class is defined in navigation-core.js.
 */
window._navigationPermissionsMixin = {

    async loadUserPermissions() {
        // Load detailedPermissions from auth data
        // Admin (isAdmin === true || roleTemplate === 'admin'): bypass - grant all pages
        // Non-admin: check detailedPermissions

        // Try to load from cache (check both localStorage AND sessionStorage)
        try {
            const authData = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");
            if (authData) {
                const userAuth = JSON.parse(authData);

                // Admin bypass: grant access to ALL pages regardless of detailedPermissions
                const isAdmin = userAuth.isAdmin === true || userAuth.roleTemplate === 'admin';
                if (isAdmin) {
                    // Generate full permissions for all menu pages
                    const fullPermissions = getDefaultAdminPermissions();
                    // Merge with any existing permissions (to preserve extra keys)
                    const merged = { ...fullPermissions, ...(userAuth.detailedPermissions || {}) };
                    // Ensure all default pages are covered
                    Object.keys(fullPermissions).forEach(pageId => {
                        if (!merged[pageId]) {
                            merged[pageId] = fullPermissions[pageId];
                        } else {
                            // Ensure all default actions are true for admin
                            Object.keys(fullPermissions[pageId]).forEach(action => {
                                merged[pageId][action] = true;
                            });
                        }
                    });

                    this.userDetailedPermissions = merged;
                    this.userPermissions = this._getAccessiblePagesFromDetailed(merged);

                    // Update stored auth data with full admin permissions
                    userAuth.detailedPermissions = merged;
                    const storage = localStorage.getItem("loginindex_auth") ? localStorage : sessionStorage;
                    storage.setItem("loginindex_auth", JSON.stringify(userAuth));

                    console.log(
                        "[Permission Load] Admin bypass: granted all",
                        Object.keys(merged).length, "pages"
                    );
                    return;
                }

                // Non-admin: load detailedPermissions normally
                if (userAuth.detailedPermissions && Object.keys(userAuth.detailedPermissions).length > 0) {
                    this.userDetailedPermissions = userAuth.detailedPermissions;
                    // Derive userPermissions from detailedPermissions for menu display
                    this.userPermissions = this._getAccessiblePagesFromDetailed(userAuth.detailedPermissions);
                    console.log(
                        "[Permission Load] Loaded detailedPermissions:",
                        Object.keys(this.userDetailedPermissions).length, "pages configured"
                    );
                    return;
                }
            }
        } catch (error) {
            console.error(
                "[Permission Load] Error loading cached permissions:",
                error,
            );
        }

        // Try to load from Firebase if not in cache
        try {
            if (typeof firebase !== "undefined" && firebase.firestore) {
                const authDataStr = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");
                const authData = authDataStr ? JSON.parse(authDataStr) : null;

                if (!authData || !authData.username) {
                    console.error("[Permission Load] No username in auth data");
                    this.userPermissions = [];
                    this.userDetailedPermissions = null;
                    return;
                }

                const db = firebase.firestore();
                const userDoc = await db
                    .collection("users")
                    .doc(authData.username)
                    .get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const roleTemplate = userData.roleTemplate || 'custom';
                    const isAdmin = userData.isAdmin === true || roleTemplate === 'admin';

                    // Admin bypass from Firebase: grant all pages
                    if (isAdmin) {
                        const fullPermissions = getDefaultAdminPermissions();
                        const existing = userData.detailedPermissions || {};
                        const merged = { ...fullPermissions, ...existing };
                        Object.keys(fullPermissions).forEach(pageId => {
                            if (!merged[pageId]) {
                                merged[pageId] = fullPermissions[pageId];
                            } else {
                                Object.keys(fullPermissions[pageId]).forEach(action => {
                                    merged[pageId][action] = true;
                                });
                            }
                        });

                        this.userDetailedPermissions = merged;
                        this.userPermissions = this._getAccessiblePagesFromDetailed(merged);

                        authData.detailedPermissions = merged;
                        authData.roleTemplate = roleTemplate;
                        authData.isAdmin = true;
                        localStorage.setItem("loginindex_auth", JSON.stringify(authData));

                        console.log("[Permission Load] Admin bypass from Firebase: granted all", Object.keys(merged).length, "pages");
                        return;
                    }

                    // Non-admin: load detailedPermissions
                    if (userData.detailedPermissions && Object.keys(userData.detailedPermissions).length > 0) {
                        this.userDetailedPermissions = userData.detailedPermissions;
                        this.userPermissions = this._getAccessiblePagesFromDetailed(userData.detailedPermissions);

                        // Cache to localStorage
                        authData.detailedPermissions = userData.detailedPermissions;
                        authData.roleTemplate = roleTemplate;
                        localStorage.setItem(
                            "loginindex_auth",
                            JSON.stringify(authData),
                        );

                        console.log(
                            "[Permission Load] Loaded detailedPermissions from Firebase:",
                            Object.keys(this.userDetailedPermissions).length, "pages"
                        );
                        return;
                    }
                } else {
                    console.error(
                        "[Permission Load] User document not found in Firebase",
                    );
                }
            }
        } catch (error) {
            console.error(
                "[Permission Load] Error loading Firebase permissions:",
                error,
            );
        }

        this.userPermissions = [];
        this.userDetailedPermissions = null;
        console.log(
            "[Permission Load] No permissions loaded, defaulting to empty",
        );
    },

    /**
     * NEW: Derive accessible pages from detailedPermissions
     * A page is accessible if user has at least one permission = true for that page
     * @param {Object} detailedPermissions
     * @returns {Array} List of page IDs user can access
     */
    _getAccessiblePagesFromDetailed(detailedPermissions) {
        if (!detailedPermissions) return [];

        return Object.entries(detailedPermissions)
            .filter(([pageId, perms]) => {
                // Check if any permission in this page is true
                return Object.values(perms).some(value => value === true);
            })
            .map(([pageId]) => pageId);
    },

    /**
     * Check if user has a specific detailed permission
     * Admin bypass: isAdmin users always return true
     * @param {string} pageId
     * @param {string} permissionKey
     * @returns {boolean}
     */
    hasDetailedPermission(pageId, permissionKey) {
        // Admin bypass - grant all permissions
        if (this.isAdminTemplate) return true;

        if (!this.userDetailedPermissions) return false;

        const pagePerms = this.userDetailedPermissions[pageId];
        if (!pagePerms) return false;

        return pagePerms[permissionKey] === true;
    },

    getCurrentPageIdentifier() {
        const path = window.location.pathname;
        console.log("[Unified Nav] Current path:", path);

        const normalizedPath = path.toLowerCase().replace(/\/$/, "");

        const sortedMenu = [...MENU_CONFIG].sort(
            (a, b) => b.pageIdentifier.length - a.pageIdentifier.length,
        );

        for (const item of sortedMenu) {
            const identifier = item.pageIdentifier.toLowerCase();

            const patterns = [
                new RegExp(`/${identifier}/`, "i"),
                new RegExp(`/${identifier}/index\\.html$`, "i"),
                new RegExp(`/${identifier}$`, "i"),
            ];

            for (const pattern of patterns) {
                if (pattern.test(path)) {
                    console.log(
                        `[Unified Nav] Matched page: ${item.pageIdentifier} using pattern: ${pattern}`,
                    );
                    return item.pageIdentifier;
                }
            }
        }

        console.log("[Unified Nav] No page identifier matched");
        return null;
    },

    checkPageAccess() {
        if (!this.currentPage) {
            console.log("[Permission Check] No current page, allowing access");
            return true;
        }

        // Admin bypass - grant access to all pages
        if (this.isAdminTemplate) {
            console.log("[Permission Check] Admin bypass, allowing access");
            return true;
        }

        const pageInfo = MENU_CONFIG.find(
            (item) => item.pageIdentifier === this.currentPage,
        );

        if (!pageInfo) {
            console.log(
                "[Permission Check] Page not in MENU_CONFIG, allowing access",
            );
            return true;
        }

        if (pageInfo.publicAccess) {
            console.log("[Permission Check] Public page, allowing access");
            return true;
        }

        // Non-admin: check detailedPermissions
        const hasPermission = this.userPermissions.includes(
            pageInfo.permissionRequired,
        );

        console.log("[Permission Check] Details:", {
            currentPage: this.currentPage,
            requiredPermission: pageInfo.permissionRequired,
            userPermissions: this.userPermissions,
            roleTemplate: this.isAdminTemplate ? 'admin' : 'other',
            hasAccess: hasPermission,
        });

        return hasPermission;
    },

    getAccessiblePages() {
        // ALL users check detailedPermissions - NO admin bypass
        const accessible = MENU_CONFIG.filter((item) => {
            // Items without permissionRequired are accessible to everyone
            if (!item.permissionRequired) return true;
            return this.userPermissions.includes(item.permissionRequired);
        });

        console.log(
            "[Get Accessible] Found",
            accessible.length,
            "accessible pages",
        );
        return accessible;
    },

    showAccessDenied() {
        const pageInfo = MENU_CONFIG.find(
            (item) => item.pageIdentifier === this.currentPage,
        );
        const pageName = pageInfo ? pageInfo.text : this.currentPage;
        const requiredPermission = pageInfo
            ? pageInfo.permissionRequired
            : "unknown";

        const accessiblePages = this.getAccessiblePages();
        const firstAccessiblePage =
            accessiblePages.length > 0 ? accessiblePages[0] : null;

        console.error("[Access Denied]", {
            page: this.currentPage,
            pageName: pageName,
            requiredPermission: requiredPermission,
            userPermissions: this.userPermissions,
            roleTemplate: this.isAdminTemplate ? 'admin' : 'other',
            firstAccessiblePage: firstAccessiblePage
                ? firstAccessiblePage.pageIdentifier
                : "none",
        });

        if (!firstAccessiblePage) {
            console.error(
                "[Access Denied] No accessible pages found, redirecting to login",
            );
            selectiveLogoutStorage();
            sessionStorage.clear();
            window.location.href = "../index.html";
            return;
        }

        const redirectUrl = firstAccessiblePage.href;
        const redirectPageName = firstAccessiblePage.text;

        document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh;
                    background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 20px;">
            <div style="background: white; padding: ${this.isMobile ? "32px 20px" : "40px"}; border-radius: 16px;
                        max-width: ${this.isMobile ? "400px" : "500px"}; text-align: center;
                        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); width: 100%;">
                <i data-lucide="alert-circle" style="width: ${this.isMobile ? "56px" : "64px"};
                                                     height: ${this.isMobile ? "56px" : "64px"}; color: #ef4444;
                                                     margin: 0 auto ${this.isMobile ? "16px" : "20px"}; display: block;"></i>
                <h1 style="color: #ef4444; margin-bottom: ${this.isMobile ? "12px" : "16px"};
                           font-size: ${this.isMobile ? "20px" : "24px"}; font-weight: 600;">
                    Truy Cập Bị Từ Chối
                </h1>
                <p style="color: #6b7280; margin-bottom: ${this.isMobile ? "12px" : "16px"};
                          line-height: ${this.isMobile ? "1.5" : "1.6"}; font-size: ${this.isMobile ? "14px" : "16px"};">
                    Bạn không có quyền truy cập: <strong style="color: #111827;">${pageName}</strong>
                </p>
                <p style="color: #9ca3af; margin-bottom: ${this.isMobile ? "20px" : "24px"}; font-size: 13px;">
                    Quyền yêu cầu: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${requiredPermission}</code>
                </p>
                <button onclick="window.location.href='${redirectUrl}'"
                        style="${this.isMobile ? "width: 100%" : ""}; padding: 12px 24px; background: #6366f1;
                               color: white; border: none; border-radius: 8px; cursor: pointer;
                               font-weight: 600; font-size: 14px; transition: all 0.2s;"
                        onmouseover="this.style.background='#4f46e5'"
                        onmouseout="this.style.background='#6366f1'">
                    Về ${redirectPageName}
                </button>
            </div>
        </div>
    `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    },

    showPermissionsSummary() {
        const accessiblePages = this.getAccessiblePages();
        const userInfo = window.authManager?.getUserInfo();

        const roleMap = { 0: "Admin", 1: "Manager", 3: "Staff", 777: "Guest" };
        const checkLogin = localStorage.getItem("checkLogin");
        const roleName = roleMap[checkLogin] || "Unknown";

        const summary = `
QUYỀN TRUY CẬP CỦA BẠN

Tài khoản: ${userInfo?.displayName || "Unknown"}
Vai trò: ${roleName}
Tổng quyền: ${accessiblePages.length}/${MENU_CONFIG.length} trang

CÁC TRANG ĐƯỢC PHÉP TRUY CẬP:
${accessiblePages.map((item) => `• ${item.text}`).join("\n")}

Liên hệ Administrator nếu cần thêm quyền truy cập.
        `.trim();

        alert(summary);
    }
};

console.log('[Navigation] Permissions module loaded');
