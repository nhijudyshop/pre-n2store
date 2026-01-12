// =====================================================
// PERMISSIONS HELPER - Global Permission System
// Single source of truth for all permission checks
//
// ARCHITECTURE: ALL users (including Admin) use detailedPermissions
// - NO bypass based on roleTemplate
// - Admin template = all detailedPermissions set to true
// - Consistent permission check for everyone
// =====================================================

/**
 * PermissionHelper - Hệ thống phân quyền toàn cục
 *
 * QUAN TRỌNG: Tất cả users kể cả Admin đều dựa vào detailedPermissions
 * Admin được full quyền bằng cách set TẤT CẢ permissions = true trong detailedPermissions
 *
 * Sử dụng:
 * - PermissionHelper.canAccessPage('live') - Kiểm tra quyền truy cập trang
 * - PermissionHelper.hasPermission('live', 'upload') - Kiểm tra quyền cụ thể
 * - PermissionHelper.enforcePageAccess('live') - Redirect nếu không có quyền
 * - PermissionHelper.applyUIRestrictions('live') - Ẩn/disable UI elements
 */
const PermissionHelper = {

    // Cache auth data để tránh parse JSON nhiều lần
    _authCache: null,
    _authCacheTime: 0,
    _cacheTimeout: 5000, // 5 seconds cache

    /**
     * Lấy auth data từ storage (có cache)
     * @returns {Object|null}
     */
    getAuth() {
        const now = Date.now();

        // Return cached if still valid
        if (this._authCache && (now - this._authCacheTime) < this._cacheTimeout) {
            return this._authCache;
        }

        try {
            const data = sessionStorage.getItem("loginindex_auth") ||
                        localStorage.getItem("loginindex_auth");

            if (data) {
                this._authCache = JSON.parse(data);
                this._authCacheTime = now;
                return this._authCache;
            }
        } catch (error) {
            console.error('[PermissionHelper] Error reading auth:', error);
        }

        return null;
    },

    /**
     * Clear cache (gọi khi auth data thay đổi)
     */
    clearCache() {
        this._authCache = null;
        this._authCacheTime = 0;
    },

    /**
     * Kiểm tra user đã đăng nhập chưa
     * @returns {boolean}
     */
    isAuthenticated() {
        const auth = this.getAuth();
        return auth?.isLoggedIn === 'true' || auth?.isLoggedIn === true;
    },

    /**
     * Kiểm tra user có phải admin template không
     * LƯU Ý: Admin KHÔNG còn bypass - vẫn phải check detailedPermissions
     * Function này chỉ để hiển thị UI (badge, role name, etc.)
     * @returns {boolean}
     */
    isAdminTemplate() {
        const auth = this.getAuth();
        return auth?.roleTemplate === 'admin';
    },

    /**
     * @deprecated Use isAdminTemplate() instead. This is kept for backward compatibility.
     * QUAN TRỌNG: Không còn bypass - chỉ để check template name
     */
    isAdmin() {
        return this.isAdminTemplate();
    },

    /**
     * Kiểm tra có quyền truy cập trang không
     * TẤT CẢ users (kể cả Admin) đều check detailedPermissions
     * User cần ít nhất 1 permission = true trong trang đó để truy cập
     *
     * @param {string} pageId - ID trang (live, ck, order-management, etc.)
     * @returns {boolean}
     */
    canAccessPage(pageId) {
        const auth = this.getAuth();

        // ALL users check detailedPermissions - NO bypass
        if (!auth?.detailedPermissions?.[pageId]) {
            return false;
        }

        const pagePerms = auth.detailedPermissions[pageId];
        return Object.values(pagePerms).some(v => v === true);
    },

    /**
     * Kiểm tra quyền cụ thể trong trang
     * TẤT CẢ users (kể cả Admin) đều check detailedPermissions
     *
     * @param {string} pageId - ID trang
     * @param {string} action - Hành động (view, edit, delete, upload, etc.)
     * @returns {boolean}
     */
    hasPermission(pageId, action) {
        const auth = this.getAuth();
        // ALL users check detailedPermissions - NO bypass
        return auth?.detailedPermissions?.[pageId]?.[action] === true;
    },

    /**
     * Kiểm tra nhiều quyền cùng lúc
     *
     * @param {string} pageId - ID trang
     * @param {string[]} actions - Mảng các action cần kiểm tra
     * @param {string} mode - 'any' (có 1 trong các quyền) hoặc 'all' (có tất cả)
     * @returns {boolean}
     */
    hasPermissions(pageId, actions, mode = 'any') {
        if (!Array.isArray(actions) || actions.length === 0) {
            return false;
        }

        if (mode === 'all') {
            return actions.every(action => this.hasPermission(pageId, action));
        }

        return actions.some(action => this.hasPermission(pageId, action));
    },

    /**
     * Lấy tất cả quyền của một trang
     *
     * @param {string} pageId - ID trang
     * @returns {Object} - Object chứa các permission
     */
    getPagePermissions(pageId) {
        const auth = this.getAuth();
        return auth?.detailedPermissions?.[pageId] || {};
    },

    /**
     * Lấy toàn bộ detailedPermissions
     *
     * @returns {Object}
     */
    getAllPermissions() {
        const auth = this.getAuth();
        return auth?.detailedPermissions || {};
    },

    /**
     * Lấy danh sách các trang user có quyền truy cập
     *
     * @returns {string[]} - Mảng pageId
     */
    getAccessiblePages() {
        const auth = this.getAuth();

        if (!auth?.detailedPermissions) {
            return [];
        }

        return Object.entries(auth.detailedPermissions)
            .filter(([_, perms]) => Object.values(perms).some(v => v === true))
            .map(([pageId]) => pageId);
    },

    /**
     * Đếm số quyền được cấp
     *
     * @returns {Object} - { granted: number, total: number, percentage: number }
     */
    countPermissions() {
        const auth = this.getAuth();

        if (!auth?.detailedPermissions) {
            return { granted: 0, total: 0, percentage: 0 };
        }

        let granted = 0;
        let total = 0;

        Object.values(auth.detailedPermissions).forEach(pagePerms => {
            Object.values(pagePerms).forEach(value => {
                total++;
                if (value === true) granted++;
            });
        });

        return {
            granted,
            total,
            percentage: total > 0 ? Math.round((granted / total) * 100) : 0
        };
    },

    /**
     * Lấy role template hiện tại
     *
     * @returns {string} - Template name (admin, manager, sales-team, etc.)
     */
    getRoleTemplate() {
        const auth = this.getAuth();
        return auth?.roleTemplate || 'custom';
    },

    /**
     * Lấy thông tin role template đầy đủ
     *
     * @returns {Object} - { id, name, icon, color }
     */
    getRoleTemplateInfo() {
        const template = this.getRoleTemplate();

        // Sử dụng PERMISSION_TEMPLATES nếu có
        if (typeof PERMISSION_TEMPLATES !== 'undefined' && PERMISSION_TEMPLATES[template]) {
            const info = PERMISSION_TEMPLATES[template];
            return {
                id: template,
                name: info.name?.split(' - ')[0] || template,
                icon: info.icon || 'user',
                color: info.color || '#6366f1'
            };
        }

        // Default templates
        const defaultTemplates = {
            'admin': { name: 'Admin', icon: 'crown', color: '#ef4444' },
            'manager': { name: 'Manager', icon: 'briefcase', color: '#f59e0b' },
            'sales-team': { name: 'Sales Team', icon: 'shopping-cart', color: '#3b82f6' },
            'warehouse-team': { name: 'Warehouse Team', icon: 'package', color: '#10b981' },
            'staff': { name: 'Staff', icon: 'users', color: '#8b5cf6' },
            'viewer': { name: 'Viewer', icon: 'eye', color: '#6b7280' },
            'custom': { name: 'Custom', icon: 'sliders', color: '#6366f1' }
        };

        return {
            id: template,
            ...(defaultTemplates[template] || defaultTemplates['custom'])
        };
    },

    /**
     * Kiểm tra có phải full admin không (có TẤT CẢ quyền)
     *
     * @returns {boolean}
     */
    isFullAdmin() {
        const auth = this.getAuth();

        if (!auth?.detailedPermissions) {
            return false;
        }

        // Kiểm tra tất cả permissions đều true
        for (const pagePerms of Object.values(auth.detailedPermissions)) {
            for (const value of Object.values(pagePerms)) {
                if (value !== true) {
                    return false;
                }
            }
        }

        return true;
    },

    /**
     * Enforce page access - Chuyển hướng nếu không có quyền
     * Gọi ở đầu mỗi trang để kiểm tra quyền
     *
     * @param {string} pageId - ID trang
     * @param {Object} options - Tùy chọn
     * @returns {boolean} - true nếu có quyền, false nếu không
     */
    enforcePageAccess(pageId, options = {}) {
        const {
            redirectUrl = '../index.html',
            showAlert = true,
            message = 'Bạn không có quyền truy cập trang này!',
            showAccessDeniedUI = true
        } = options;

        // Kiểm tra đăng nhập trước
        if (!this.isAuthenticated()) {
            window.location.href = redirectUrl;
            return false;
        }

        // Kiểm tra quyền trang
        if (!this.canAccessPage(pageId)) {
            if (showAlert) {
                alert(message);
            }

            if (showAccessDeniedUI) {
                this.showAccessDeniedUI(pageId);
            }

            // Redirect sau 2 giây nếu có showAccessDeniedUI
            if (showAccessDeniedUI) {
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 2000);
            } else {
                window.location.href = redirectUrl;
            }

            return false;
        }

        return true;
    },

    /**
     * Hiển thị UI Access Denied
     *
     * @param {string} pageId - ID trang
     */
    showAccessDeniedUI(pageId) {
        const container = document.getElementById('mainContainer') ||
                         document.getElementById('app') ||
                         document.body;

        container.innerHTML = `
            <div class="access-denied-container" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 60vh;
                text-align: center;
                padding: 40px;
            ">
                <div style="
                    width: 80px;
                    height: 80px;
                    background: #fee2e2;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 24px;
                ">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                    </svg>
                </div>
                <h1 style="
                    font-size: 24px;
                    font-weight: 700;
                    color: #dc2626;
                    margin: 0 0 12px 0;
                ">Truy cập bị từ chối</h1>
                <p style="
                    color: #6b7280;
                    font-size: 16px;
                    margin: 0 0 24px 0;
                    max-width: 400px;
                ">
                    Bạn không có quyền truy cập trang <strong>${pageId}</strong>.<br>
                    Vui lòng liên hệ Admin để được cấp quyền.
                </p>
                <a href="../live/index.html" style="
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    background: #3b82f6;
                    color: white;
                    border-radius: 8px;
                    text-decoration: none;
                    font-weight: 500;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12"></line>
                        <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                    Quay về trang chính
                </a>
            </div>
        `;
    },

    /**
     * Áp dụng UI restrictions dựa trên permission
     * Sử dụng data-perm attribute trên HTML elements
     *
     * Format: data-perm="pageId:action" hoặc data-perm="action" (nếu đã có pageId)
     *
     * Ví dụ:
     * <button data-perm="live:delete">Xóa</button>
     * <div data-perm="edit">...</div> <!-- Cần truyền pageId -->
     *
     * @param {string} pageId - ID trang (optional nếu dùng full format)
     */
    applyUIRestrictions(pageId = null) {
        document.querySelectorAll('[data-perm]').forEach(el => {
            const permAttr = el.dataset.perm;
            let hasAccess = false;

            if (permAttr.includes(':')) {
                // Full format: "pageId:action"
                const [pId, action] = permAttr.split(':');
                hasAccess = this.hasPermission(pId, action);
            } else if (pageId) {
                // Short format: "action" (sử dụng pageId từ parameter)
                hasAccess = this.hasPermission(pageId, permAttr);
            } else {
                console.warn('[PermissionHelper] Missing pageId for permission check:', permAttr);
                return;
            }

            if (!hasAccess) {
                const action = el.dataset.permAction || 'disable';

                switch (action) {
                    case 'hide':
                        el.style.display = 'none';
                        break;
                    case 'remove':
                        el.remove();
                        break;
                    case 'disable':
                    default:
                        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                            el.disabled = true;
                        }
                        el.classList.add('perm-disabled');
                        el.style.opacity = '0.5';
                        el.style.cursor = 'not-allowed';
                        el.style.pointerEvents = 'none';
                        el.title = el.dataset.permDeniedTitle || 'Bạn không có quyền thực hiện thao tác này';
                        break;
                }
            }
        });

        console.log('[PermissionHelper] UI restrictions applied for page:', pageId);
    },

    /**
     * Kiểm tra permission trước khi thực hiện action
     * Trả về false và hiển thị thông báo nếu không có quyền
     *
     * @param {string} pageId - ID trang
     * @param {string} action - Hành động cần kiểm tra
     * @param {Object} options - Tùy chọn
     * @returns {boolean}
     */
    checkBeforeAction(pageId, action, options = {}) {
        const {
            alertMessage = 'Bạn không có quyền thực hiện thao tác này!',
            showAlert = true
        } = options;

        if (this.hasPermission(pageId, action)) {
            return true;
        }

        if (showAlert) {
            alert(alertMessage);
        }

        console.warn(`[PermissionHelper] Permission denied: ${pageId}:${action}`);
        return false;
    },

    /**
     * Wrapper function để bảo vệ một function với permission check
     *
     * @param {string} pageId - ID trang
     * @param {string} action - Hành động cần quyền
     * @param {Function} fn - Function cần bảo vệ
     * @param {Object} options - Tùy chọn
     * @returns {Function} - Wrapped function
     */
    protect(pageId, action, fn, options = {}) {
        return (...args) => {
            if (this.checkBeforeAction(pageId, action, options)) {
                return fn(...args);
            }
            return null;
        };
    },

    /**
     * Lấy thông tin user hiện tại
     *
     * @returns {Object}
     */
    getCurrentUser() {
        const auth = this.getAuth();

        if (!auth) return null;

        return {
            username: auth.username,
            displayName: auth.displayName,
            userId: auth.userId,
            roleTemplate: auth.roleTemplate || 'custom',
            permissions: this.countPermissions()
        };
    },

    /**
     * Debug function - In ra tất cả permissions
     */
    debug() {
        const auth = this.getAuth();
        console.group('[PermissionHelper] Debug Info');
        console.log('User:', auth?.username);
        console.log('Display Name:', auth?.displayName);
        console.log('Role Template:', auth?.roleTemplate);
        console.log('Permissions Count:', this.countPermissions());
        console.log('Accessible Pages:', this.getAccessiblePages());
        console.log('Is Full Admin:', this.isFullAdmin());
        console.log('All Permissions:', auth?.detailedPermissions);
        console.groupEnd();
    }
};

// =====================================================
// GLOBAL EXPORTS
// =====================================================

// Export to window for global access
window.PermissionHelper = PermissionHelper;

// Shorthand functions for convenience
window.canAccessPage = (pageId) => PermissionHelper.canAccessPage(pageId);
window.hasPermission = (pageId, action) => PermissionHelper.hasPermission(pageId, action);
window.enforcePageAccess = (pageId, options) => PermissionHelper.enforcePageAccess(pageId, options);

// =====================================================
// CSS for disabled elements
// =====================================================
const permHelperStyle = document.createElement('style');
permHelperStyle.textContent = `
    .perm-disabled {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
    }

    .perm-disabled::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        cursor: not-allowed;
    }
`;
document.head.appendChild(permHelperStyle);

console.log('[PermissionHelper] Loaded - Global permission system ready');
